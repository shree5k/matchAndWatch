import * as ui from './ui.js';
// Import state setters/getters and other needed functions from main.js
import {
    state,
    setSocket,
    setRoomCode,
    setGameActive,
    setCardsData,
    resetRoomState,
    addMatchTitle,
    resetMatchState,
    renderInitialDeck // Import rendering function
} from './main.js';

function setupSocketListeners() {
    if (!state.socket) { console.error("Cannot setup listeners: socket is not initialized."); return; }

    // Remove previous listeners
    state.socket.off('connect'); state.socket.off('disconnect'); state.socket.off('connect_error');
    state.socket.off('error'); state.socket.off('roomCreated'); state.socket.off('joinSuccess');
    state.socket.off('opponentJoined'); state.socket.off('startGame'); state.socket.off('matchFound');
    state.socket.off('opponentDisconnected');

    // Add listeners
    state.socket.on('connect', () => {
        console.log('Connected to server:', state.socket.id);
        if (state.isGameActive && state.currentRoomCode) { // Reconnect Logic
            console.log(`Reconnected during active game in room: ${state.currentRoomCode}.`);
            ui.updateStatusBanner("Reconnected to server.", 'success', 2000);
            ui.showGame(false, '', true); // Show game area, hide loading (pass true for isGameTrulyActive)
            ui.enableGameButtons();
            ui.disableRoomButtons();
        } else { // Fresh connection or game ended/reset
            console.log("Fresh connection or game not active. Showing Room UI.");
            resetRoomState(); // Reset state
            ui.showRoom(); // Show room UI
            ui.updateStatusBanner("You are all set!", 'success', 3000);
        }
    });

    state.socket.on('disconnect', (reason) => {
         console.log('Disconnected from server:', reason);
         if (reason !== 'io client disconnect') { ui.updateStatusBanner("Connection lost. Attempting to reconnect...", 'error'); }
         else { ui.hideStatusBanner(); }
         ui.disableGameButtons();
         ui.disableRoomButtons();
    });

    state.socket.on('connect_error', (err) => {
         console.error('Connection Error after attempts:', err.message);
         resetRoomState(); // Reset state
         ui.showConnectionError(`Connection failed permanently. Server offline or URL incorrect?`);
    });

    state.socket.on('error', (data) => { // Custom server errors
        console.error('Server Error:', data.message);
        ui.displayRoomMessage(data.message, true);
        ui.enableRoomButtons();
    });

    state.socket.on('roomCreated', (data) => {
        setRoomCode(data.roomCode);
        setGameActive(false);
        console.log(`Room created: ${state.currentRoomCode}. Waiting for friend...`);
        ui.updateRoomCreatedUI(data.roomCode);
        ui.updateStatusBanner(`Waiting for opponent... Room Code: ${data.roomCode}`, 'waiting');
    });

    state.socket.on('joinSuccess', (data) => {
        setRoomCode(data.roomCode);
        setGameActive(false);
        console.log(`Joined room: ${state.currentRoomCode}`);
        ui.updateJoinedRoomUI(data.roomCode);
    });

    state.socket.on('opponentJoined', (data) => {
         console.log(`${data.username || 'Opponent'} joined.`);
         setGameActive(false); // Still waiting for startGame
         ui.updateOpponentJoinedUI(data.username);
    });

    state.socket.on('startGame', (data) => {
        console.log('<<< startGame event received >>>');
        if (!data.movies || data.movies.length === 0) {
             console.error("Received startGame event with no movies!");
             alert("Error starting game: No movies received from server.");
             setGameActive(false); ui.showRoom(); return;
        }
        setGameActive(true); // Game is active
        setCardsData(data.movies);
        resetMatchState(); // Reset matches state
        ui.resetMatchDisplayUI(); // Reset matches UI
        ui.showGame(false, '', true); // Show game area, hide loading (pass true for isGameTrulyActive)
        console.log("startGame: Calling renderInitialDeck...");
        renderInitialDeck(); // Render cards
    });

    state.socket.on('matchFound', (data) => {
        console.log('MATCH FOUND via server!', data.movie);
        addMatchTitle(data.movie.title); // Update state
        ui.displayMatchUI(data.movie.title, state.totalMatches, state.matchedTitles); // Update UI
    });

    state.socket.on('opponentDisconnected', (data) => {
         alert(`${data.username || 'Your opponent'} disconnected.`);
         resetRoomState(); // Reset state
         ui.showRoom();
         ui.updateStatusBanner("Opponent left. Create/Join new room.", 'info', 5000);
    });
} // End setupSocketListeners

// --- Connection Initiation ---
export function connectToServer() {
    if (state.socket && state.socket.connected) {
         console.log("Already connected.");
         if (!state.isGameActive) { ui.showRoom(); } else { console.log("Already connected and game is active."); }
         return;
    }
    ui.showConnecting();
    if (state.socket) { console.log("Attempting to reconnect existing socket..."); state.socket.connect(); return; }
    try {
        console.log(`Creating new socket connection to ${state.BACKEND_URL}`); // Use state for URL
        // *** Use global 'io' ***
        const newSocket = io(state.BACKEND_URL, { reconnectionAttempts: 3, transports: ['websocket'] });
        setSocket(newSocket); // Store socket via setter
        setupSocketListeners();
    } catch (err) {
        console.error("Socket.IO initialization failed:", err);
        ui.showConnectionError("Error initializing connection. Please refresh.");
    }
}

// --- Emitting Events ---
export function emitSwipe(movieId, choice) {
    if (state.socket && state.socket.connected && state.currentRoomCode) {
        state.socket.emit('playerSwipe', { movieId: movieId, choice: choice });
        console.log(`Client sending swipe: ${choice} for ${movieId} in room ${state.currentRoomCode}`);
        return true;
    } else {
        console.warn("Cannot send swipe: Not connected or not in a room.");
        alert("Connection issue: Cannot record swipe. Please check connection or refresh.");
        return false;
    }
}

export function emitCreateRoom(username) {
    if (state.socket && state.socket.connected) {
        state.socket.emit('createRoom', { username });
        return true;
    }
    console.warn("Cannot create room: Socket not connected.");
    return false;
}

export function emitJoinRoom(roomCode, username) {
     if (state.socket && state.socket.connected) {
        state.socket.emit('joinRoom', { roomCode, username });
        return true;
    }
    console.warn("Cannot join room: Socket not connected.");
    return false;
}