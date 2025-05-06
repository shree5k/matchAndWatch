import 'dotenv/config'; // Use import syntax for dotenv config loading
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(helmet());
app.use(morgan('dev'));
const server = http.createServer(app);

// --- Configuration ---
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

if (!TMDB_API_KEY || TMDB_API_KEY.length < 10) {
    console.error("FATAL ERROR: TMDB_API_KEY is not defined or invalid. Check .env file or environment variables.");
    process.exit(1);
}

// --- CORS Setup ---
// Make sure these origins are correct for your deployed frontend AND local testing
const allowedOrigins = [
    'http://localhost:5500', // Common local dev port
    'http://127.0.0.1:5500',
    'https://shree5k.github.io' // CHANGE THIS to your actual deployed frontend URL
    // Add any other origins if needed
];

const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps, curl, etc) OR if origin is in the list
            if (!origin || allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`CORS blocked for origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"]
    }
});

// --- In-Memory State ---
const rooms = {};
// Updated Room Structure:
// { roomCode: {
//     players: { socketId: { username, swipes: {}, swipesMade: 0, finishedSwiping: false } },
//     movies: [],
//     movieIds: [],
//     totalMovies: 0
//   }
// }

// --- Helper Functions ---
function generateRoomCode(length = 4) {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    // Ensure code is unique (important as rooms object grows)
    return rooms[result] ? generateRoomCode(length) : result;
}

async function fetchMoviesFromTMDb() {
    try {
        const randomPage = Math.floor(Math.random() * 20) + 1;
        console.log(`Fetching popular movies from TMDb page ${randomPage}`);
        const response = await axios.get(`${TMDB_BASE_URL}/movie/popular`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US',
                page: randomPage
            }
        });

        const validMovies = response.data.results
            .filter(movie => movie.poster_path && movie.vote_average > 3) // Filter out movies without poster or low rating
            .sort(() => 0.5 - Math.random()) // Shuffle
            .slice(0, 10) // Take 10
            .map(movie => ({ id: movie.id, title: movie.title, poster_path: movie.poster_path }));

        console.log(`Fetched ${validMovies.length} valid movies initially.`);

        // Fallback if filtering removes too many
        if (validMovies.length < 5) {
             console.warn("TMDb fetch: Could only get", validMovies.length, "movies meeting criteria. Trying page 1 as fallback.");
             const fallbackResponse = await axios.get(`${TMDB_BASE_URL}/movie/popular`, { params: { api_key: TMDB_API_KEY, language: 'en-US', page: 1 } });
             const fallbackMovies = fallbackResponse.data.results
                .filter(movie => movie.poster_path) // Basic filter only for fallback
                .slice(0, 10)
                .map(movie => ({ id: movie.id, title: movie.title, poster_path: movie.poster_path }));
             console.log(`Fallback fetched ${fallbackMovies.length} movies.`);
             return fallbackMovies; // Return fallback results
        }
        return validMovies;
    } catch (error) {
        console.error("Error fetching movies from TMDb:", error.response ? error.response.data : error.message);
        if (error.response?.data?.status_message) { console.error("TMDb API Error Message:", error.response.data.status_message); }
        return []; // Return empty array indicates failure
    }
}

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    let currentRoomCode = null; // Track this socket's current room

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (currentRoomCode && rooms[currentRoomCode]) {
            delete rooms[currentRoomCode].players[socket.id];
            if (Object.keys(rooms[currentRoomCode].players).length === 0) {
                delete rooms[currentRoomCode];
                console.log(`Room ${currentRoomCode} deleted due to all users disconnecting.`);
            }
        }
    });

    socket.on('createRoom', ({ username }) => {
        // Optional: Implement logic to leave previous room if user is already in one
        // if (currentRoomCode && rooms[currentRoomCode]) { ... leave logic ... }

        const roomCode = generateRoomCode();
        currentRoomCode = roomCode; // Assign room code to this connection
        rooms[roomCode] = {
            players: { [socket.id]: { username: username || `User_${socket.id.substring(0, 4)}`, swipes: {}, swipesMade: 0, finishedSwiping: false } },
            movies: [], movieIds: [], totalMovies: 0
        };
        socket.join(roomCode);
        console.log(`[${roomCode}] Room created by ${username} (${socket.id})`);
        socket.emit('roomCreated', { roomCode });
    });

    socket.on('joinRoom', async ({ roomCode, username }) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms[roomCode];

        if (!room) { return socket.emit('error', { message: `Room '${roomCode}' not found.` }); }
        if (Object.keys(room.players).length >= 2) { return socket.emit('error', { message: `Room '${roomCode}' is full.` }); }
        if (room.players[socket.id]) { return socket.emit('error', { message: `You are already in room '${roomCode}'.` }); }

        currentRoomCode = roomCode; // Assign room code to this connection
        const playerUsername = username || `User_${socket.id.substring(0, 4)}`;
        room.players[socket.id] = { username: playerUsername, swipes: {}, swipesMade: 0, finishedSwiping: false };
        socket.join(roomCode);
        console.log(`[${roomCode}] ${playerUsername} (${socket.id}) joined.`);
        socket.emit('joinSuccess', { roomCode });

        const playerIds = Object.keys(room.players);
        const otherPlayerId = playerIds.find(id => id !== socket.id);
        if (otherPlayerId) { socket.to(otherPlayerId).emit('opponentJoined', { username: playerUsername }); }

        if (Object.keys(room.players).length === 2) {
            console.log(`[${roomCode}] Room full. Fetching movies...`);
            const movies = await fetchMoviesFromTMDb();
            if (movies && movies.length > 0) {
                room.movies = movies; room.movieIds = movies.map(m => m.id); room.totalMovies = movies.length;
                for (const pId in room.players) {
                    if (room.players.hasOwnProperty(pId)) {
                        room.players[pId].swipes = {}; room.players[pId].swipesMade = 0; room.players[pId].finishedSwiping = false;
                    }
                }
                io.to(roomCode).emit('startGame', { movies });
                console.log(`[${roomCode}] Game started with ${room.totalMovies} movies.`);
            } else {
                 console.error(`[${roomCode}] Failed to fetch movies. Cannot start game.`);
                 io.to(roomCode).emit('error', { message: "Failed to load movies. Please try again." });
                 delete rooms[roomCode];
            }
        }
    });

    socket.on('playerSwipe', ({ movieId, choice }) => {
        // Use the room tracked for this specific socket connection
        const roomCodeForSwipe = currentRoomCode;

        if (!roomCodeForSwipe || !rooms[roomCodeForSwipe] || !rooms[roomCodeForSwipe].players[socket.id]) {
            console.warn(`[${roomCodeForSwipe || 'No Room'}] Invalid swipe from ${socket.id}: Socket not in valid room.`);
            return;
        }

        const room = rooms[roomCodeForSwipe];
        const player = room.players[socket.id];
        const playerIdsAtStartOfSwipe = Object.keys(room.players);

        if (room.totalMovies === 0 || player.finishedSwiping) {
            console.warn(`[${roomCodeForSwipe}] Swipe ignored: Game totalMovies=${room.totalMovies} or player ${player.username} finishedSwiping=${player.finishedSwiping}`);
            return;
        }

        if (!player.swipes[movieId]) {
            player.swipes[movieId] = choice;
            player.swipesMade++;
            console.log(`[${roomCodeForSwipe}] Swipe by ${player.username} (${socket.id}): ${choice} on ${movieId} (${player.swipesMade}/${room.totalMovies})`);

            // Check for Match
            if (choice === 'like') {
                const otherPlayerId = playerIdsAtStartOfSwipe.find(id => id !== socket.id);
                if (otherPlayerId && room.players[otherPlayerId]?.swipes[movieId] === 'like') {
                    const matchedMovie = room.movies.find(m => m.id == movieId);
                    if (matchedMovie) {
                         console.log(`[${roomCodeForSwipe}] !!! Match found for movie ${movieId}`);
                        io.to(roomCodeForSwipe).emit('matchFound', { movie: matchedMovie });
                    } else { console.error(`[${roomCodeForSwipe}] Match logic error: Movie data not found for matched ID ${movieId}`); }
                }
            }

            // Check if THIS player finished
            if (player.swipesMade >= room.totalMovies) {
                player.finishedSwiping = true;
                console.log(`[${roomCodeForSwipe}] Player ${player.username} (${socket.id}) marked as FINISHED SWIPING.`);

                // --- DETAILED CHECK: Check if ALL players finished ---
                console.log(`[${roomCodeForSwipe}] --- Checking Game Over Condition ---`);
                let allFinished = true;
                const currentPlayersInRoom = Object.keys(room.players);

                console.log(`[${roomCodeForSwipe}] Current players in room state: ${currentPlayersInRoom.join(', ')} (Count: ${currentPlayersInRoom.length})`);

                if (currentPlayersInRoom.length !== 2) {
                    allFinished = false;
                    console.log(`[${roomCodeForSwipe}] FAIL: Not exactly 2 players currently in room state.`);
                } else {
                    console.log(`[${roomCodeForSwipe}] SUCCESS: Exactly 2 players in room state. Checking individual status...`);
                    for (const pId of currentPlayersInRoom) {
                        const pData = room.players[pId];
                        if (pData) {
                             console.log(` -> Checking ${pData.username} (${pId}): swipesMade=${pData.swipesMade}, totalMovies=${room.totalMovies}, finishedSwiping=${pData.finishedSwiping}`);
                             // Check flag AND swipe count for robustness
                             if (!pData.finishedSwiping || pData.swipesMade < room.totalMovies) {
                                console.log(` -> FAIL: Player ${pData.username} is NOT finished.`);
                                allFinished = false; break;
                            } else {
                                 console.log(` -> SUCCESS: Player ${pData.username} IS finished.`);
                            }
                        } else {
                            console.warn(`[${roomCodeForSwipe}] FAIL: Player data for ID ${pId} missing during check.`);
                            allFinished = false; break;
                        }
                    }
                }
                 console.log(`[${roomCodeForSwipe}] --- End Game Over Check --- Final 'allFinished' status: ${allFinished}`);
                // --- END DETAILED CHECK ---

                if (allFinished) {
                    console.log(`[${roomCodeForSwipe}] !!! ALL PLAYERS CONFIRMED FINISHED. Emitting gameOver.`);
                    io.to(roomCodeForSwipe).emit('gameOver');
                    // Consider deleting the room after a delay to allow clients to see results
                    // setTimeout(() => { if(rooms[roomCodeForSwipe]) delete rooms[roomCodeForSwipe]; }, 60000);
                } else {
                    console.log(`[${roomCodeForSwipe}] Not all players finished yet.`);
                    // Optionally notify waiting player
                    // socket.emit('waitingForOpponentFinish');
                }
            }
        } else {
            console.warn(`[${roomCodeForSwipe}] Duplicate swipe attempt ignored: Movie ${movieId}, Player ${player.username}`);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}. Reason: ${reason}`);
        // Find the room this socket was associated with using the 'currentRoomCode' tracked for this connection
        const roomCodeLeft = currentRoomCode; // Use the variable specific to this connection

        if (roomCodeLeft && rooms[roomCodeLeft]) {
            const room = rooms[roomCodeLeft];
            const username = room.players[socket.id]?.username || 'A player';
            console.log(`[${roomCodeLeft}] ${username} (${socket.id}) left.`);

            // Remove player from the room object BEFORE notifying others
            delete room.players[socket.id];
            const remainingPlayerIds = Object.keys(room.players);

            // Notify remaining player (if any)
            if (remainingPlayerIds.length > 0) {
                 const remainingPlayerId = remainingPlayerIds[0];
                 const remainingPlayer = room.players[remainingPlayerId];
                 console.log(`[${roomCodeLeft}] Notifying remaining player ${remainingPlayer?.username} (${remainingPlayerId}).`);
                 // Send specifically to the remaining socket ID
                 io.to(remainingPlayerId).emit('opponentDisconnected', { username });

                 // If game was in progress, end it prematurely for the remaining player
                 if (room.totalMovies > 0 && remainingPlayer && !remainingPlayer.finishedSwiping) {
                      console.log(`[${roomCodeLeft}] Opponent left mid-game. Ending game for ${remainingPlayer.username}.`);
                      remainingPlayer.finishedSwiping = true;
                      io.to(remainingPlayerId).emit('gameOver'); // Tell them game is over
                 }
            } else {
                // If room is now empty, delete it
                console.log(`[${roomCodeLeft}] Room is empty, deleting.`);
                delete rooms[roomCodeLeft];
            }
        } else {
            console.log(`User ${socket.id} disconnected without being in a tracked room.`);
        }
        // No need to nullify currentRoomCode here as the connection scope is ending
    });
});

// Basic HTTP route
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);
    console.log(`Socket.IO server running at http://localhost:${PORT}/`);
});