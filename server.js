require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const axios = require('axios');

const app = express();
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
const allowedOrigins = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://shree5k.github.io'
];

const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
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
// Simple state for demo; use a database for production
const rooms = {}; // { roomCode: { players: { socketId: { username, swipes: {} } }, movies: [], movieIds: [] } }

// --- Helper Functions ---
function generateRoomCode(length = 4) {
    const characters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return rooms[result] ? generateRoomCode(length) : result; // Ensure uniqueness
}

async function fetchMoviesFromTMDb() {
    try {
        // Fetch a slightly larger pool initially to increase variety between games maybe
        const randomPage = Math.floor(Math.random() * 20) + 1; // Fetch from first 20 pages
        const response = await axios.get(`${TMDB_BASE_URL}/movie/popular`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US',
                page: randomPage
            }
        });
        const validMovies = response.data.results
            .filter(movie => movie.poster_path && movie.vote_average > 3) // Basic filter
            .sort(() => 0.5 - Math.random()) // Shuffle results
            .slice(0, 10) // Take 10
            .map(movie => ({ id: movie.id, title: movie.title, poster_path: movie.poster_path }));

        if (validMovies.length < 5) { // Need at least a few movies
             console.warn("TMDb fetch: Could only get", validMovies.length, "movies meeting criteria. Trying page 1.");
             // Fallback to page 1
             const fallbackResponse = await axios.get(`${TMDB_BASE_URL}/movie/popular`, { params: { api_key: TMDB_API_KEY, language: 'en-US', page: 1 } });
              const fallbackMovies = fallbackResponse.data.results
                .filter(movie => movie.poster_path)
                .slice(0, 10)
                .map(movie => ({ id: movie.id, title: movie.title, poster_path: movie.poster_path }));
              return fallbackMovies;
        }
        return validMovies;
    } catch (error) {
        console.error("Error fetching movies from TMDb:", error.response ? error.response.data : error.message);
        return [];
    }
}

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    let currentRoomCode = null; // Track this socket's room

    socket.on('createRoom', ({ username }) => {
        // Ensure user isn't already in a room? (optional cleanup)
        const roomCode = generateRoomCode();
        currentRoomCode = roomCode;
        rooms[roomCode] = {
            players: { [socket.id]: { username: username || `User_${socket.id.substring(0, 4)}`, swipes: {} } },
            movies: [],
            movieIds: []
        };
        socket.join(roomCode);
        console.log(`Room ${roomCode} created by ${username} (${socket.id})`);
        socket.emit('roomCreated', { roomCode });
    });

    socket.on('joinRoom', async ({ roomCode, username }) => {
        const room = rooms[roomCode];
        if (!room) {
            return socket.emit('error', { message: `Room ${roomCode} not found.` });
        }
        if (Object.keys(room.players).length >= 2) {
            return socket.emit('error', { message: `Room ${roomCode} is full.` });
        }
        if (room.players[socket.id]) {
             return socket.emit('error', { message: `You are already in room ${roomCode}.` });
        }

        currentRoomCode = roomCode;
        const playerUsername = username || `User_${socket.id.substring(0, 4)}`;
        room.players[socket.id] = { username: playerUsername, swipes: {} };
        socket.join(roomCode);
        console.log(`${playerUsername} (${socket.id}) joined room ${roomCode}`);

        // Notify player they joined successfully
        socket.emit('joinSuccess', { roomCode });

        // Notify the *other* player (if they exist) that someone joined
        const playerIds = Object.keys(room.players);
        const otherPlayerId = playerIds.find(id => id !== socket.id);
        if (otherPlayerId) {
            socket.to(otherPlayerId).emit('opponentJoined', { username: playerUsername });
        }

        // If room is now full, start the game
        if (Object.keys(room.players).length === 2) {
            console.log(`Room ${roomCode} full. Fetching movies and starting game...`);
            const movies = await fetchMoviesFromTMDb();
            if (movies.length > 0) {
                room.movies = movies;
                room.movieIds = movies.map(m => m.id);
                io.to(roomCode).emit('startGame', { movies }); // Send to BOTH players
                console.log(`Game started in room ${roomCode} with ${movies.length} movies.`);
            } else {
                 io.to(roomCode).emit('error', { message: "Failed to load movies for the game. Please try again." });
                 // Clean up room?
                 delete rooms[roomCode]; // Maybe just delete the failed room
            }
        }
    });

    socket.on('playerSwipe', ({ movieId, choice }) => {
        if (!currentRoomCode || !rooms[currentRoomCode] || !rooms[currentRoomCode].players[socket.id]) {
            console.warn(`Invalid swipe from ${socket.id}: Not in a valid room.`);
            return;
        }

        const room = rooms[currentRoomCode];
        const player = room.players[socket.id];
        // Prevent swiping on movies not in the list or already swiped? (optional robustness)
        // if (!room.movieIds.includes(parseInt(movieId)) || player.swipes[movieId]) return;

        console.log(`Room ${currentRoomCode}: ${player.username} swiped ${choice} on ${movieId}`);
        player.swipes[movieId] = choice;

        // Check for Match (only if this swipe was a 'like')
        if (choice === 'like') {
            const playerIds = Object.keys(room.players);
            const otherPlayerId = playerIds.find(id => id !== socket.id);

            if (otherPlayerId && room.players[otherPlayerId] && room.players[otherPlayerId].swipes[movieId] === 'like') {
                // MATCH FOUND!
                const matchedMovie = room.movies.find(m => m.id == movieId); // Use == for potential type mismatch
                if (matchedMovie) {
                     console.log(`!!! Match found in ${currentRoomCode} for movie ${movieId} (${matchedMovie.title})`);
                    io.to(currentRoomCode).emit('matchFound', { movie: matchedMovie }); // Notify both players
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (currentRoomCode && rooms[currentRoomCode]) {
            const room = rooms[currentRoomCode];
            const username = room.players[socket.id]?.username || 'A player';
            console.log(`${username} (${socket.id}) left room ${currentRoomCode}`);

            // Notify remaining player
            socket.to(currentRoomCode).emit('opponentDisconnected', { username });

            // Remove player from room
            delete room.players[socket.id];

            // If room is now empty, delete it
            if (Object.keys(room.players).length === 0) {
                console.log(`Room ${currentRoomCode} is empty, deleting.`);
                delete rooms[currentRoomCode];
            }
        }
        currentRoomCode = null; // Clear association
    });
});

// Basic HTTP route
app.get('/', (req, res) => {
    res.send('Movie Swiper Backend is Running!');
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);
});