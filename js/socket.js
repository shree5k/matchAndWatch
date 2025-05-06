// Use global 'io' from script tag in index.html
import * as ui from './ui.js';
// Import state setters/getters and other needed functions from main.js
import {
    state,
    setSocket,
    setRoomCode,
    setGameActive,
    setCardsData,
    resetRoomState,
    addMatch,
    resetMatchState,
    renderInitialDeck // Import rendering function from main
} from './main.js';

function setupSocketListeners() {
  if (!state.socket) {
    console.error("Cannot setup listeners: socket is not initialized.");
    return;
  }

  // Remove all previous listeners.
  if (state.socket) state.socket.off('gameOver');
  // Remove previous listeners to prevent duplicates on potential re-init.
  if (state.socket) state.socket.off('connect');
  if (state.socket) state.socket.off('disconnect');
  if (state.socket) state.socket.off('connect_error');
  if (state.socket) state.socket.off('error');
  if (state.socket) state.socket.off('roomCreated');
  if (state.socket) state.socket.off('joinSuccess');
  if (state.socket) state.socket.off('opponentJoined');
  if (state.socket) state.socket.off('startGame');
  if (state.socket) state.socket.off('matchFound');
  if (state.socket) state.socket.off('opponentDisconnected');
  if (state.socket) state.socket.off('gameOver');

  // Add listeners.
  if (state.socket) state.socket.on('connect', () => {
    console.info('Connected to server:', state.socket.id);
    if (state.isGameActive && state.currentRoomCode) { // Refined reconnect logic.
      console.info(`Reconnected during active game in room: ${state.currentRoomCode}.`);
      ui.updateStatusBanner("Reconnected to server.", 'success', 2000);
      // Pass true for isGameTrulyActive to ensure loading indicator stays hidden.
      ui.showGame(false, '', true);
      ui.enableGameButtons();
      ui.disableRoomButtons();
    } else { // Fresh connection or game ended/reset.
      console.info("Fresh connection or game not active. Showing Room UI.");
      resetRoomState(); // Ensure state reset.
      ui.showRoom(); // Show room UI.
      ui.updateStatusBanner("You are all set!", 'success', 3000);
    }
  });

  if (state.socket) state.socket.on('disconnect', (reason) => {
    console.warn('Disconnected from server:', reason);
    if (reason !== 'io client disconnect') {
      ui.updateStatusBanner("Connection lost. Attempting to reconnect...", 'error');
    } else {
      ui.hideStatusBanner();
    }
    ui.disableGameButtons();
    ui.disableRoomButtons();
    // Do not reset game state here; allow connect handler to manage UI on reconnect/fail.
  });

  if (state.socket) state.socket.on('connect_error', (err) => {
    console.error('Connection error after attempts:', err.message);
    resetRoomState(); // Full reset on permanent failure.
    ui.showConnectionError("Connection failed permanently. Server offline or URL incorrect?");
  });

  if (state.socket) state.socket.on('error', (data) => {
    // Custom server errors (e.g., room full).
    console.error('Server error:', data.message);
    ui.displayRoomMessage(data.message, true); // Show error in modal message area.
    ui.enableRoomButtons(); // Allow user to try again.
  });

  if (state.socket) state.socket.on('roomCreated', (data) => {
    setRoomCode(data.roomCode); // Update state.
    setGameActive(false);
    console.info(`Room created: ${state.currentRoomCode}. Waiting for friend...`);
    ui.updateRoomCreatedUI(data.roomCode); // Update UI.
    ui.updateStatusBanner(`Waiting for opponent... Room Code: ${data.roomCode}`, 'waiting');
  });

  if (state.socket) state.socket.on('joinSuccess', (data) => {
    setRoomCode(data.roomCode); // Update state.
    setGameActive(false);
    console.info(`Joined room: ${state.currentRoomCode}`);
    ui.updateJoinedRoomUI(data.roomCode); // Update UI (shows game area loading).
  });

  if (state.socket) state.socket.on('opponentJoined', (data) => {
    console.info(`${data.username || 'Opponent'} joined.`);
    setGameActive(false); // Still waiting for startGame.
    ui.updateOpponentJoinedUI(data.username); // Updates loading text.
  });

  if (state.socket) state.socket.on('startGame', (data) => {
    console.info('<<< startGame event received >>>');
    if (!data.movies || data.movies.length === 0) {
      console.error("Received startGame event with no movies!");
      console.error("Error starting game: No movies received from server.");
      ui.updateStatusBanner("Error starting game: No movies received from server.", 'error');
      setGameActive(false);
      ui.showRoom();
      return;
    }
    setGameActive(true); // Set state: Game is active.
    setCardsData(data.movies); // Set state: Store movie data.
    resetMatchState(); // Reset state: Clear previous matches.
    ui.resetMatchDisplayUI(); // Reset UI: Clear previous match display.
    ui.showGame(false, '', true); // Update UI: Show game area, hide loading.
    console.info("startGame: Calling renderInitialDeck...");
    renderInitialDeck(); // Render cards (call function from main.js).
  });

  if (state.socket) state.socket.on('matchFound', (data) => {
    if (!data.movie) {
      console.error("Match found event missing movie data.");
      return;
    }
    console.info('MATCH FOUND via server!', data.movie);
    // Update state with full movie object.
    addMatch(data.movie);
    // Update UI only with necessary info.
    ui.displayMatchUI(data.movie.title, state.totalMatches, state.matches.map(m => m.title)); // Pass array of titles for tooltip.
  });

  if (state.socket) state.socket.on('opponentDisconnected', (data) => {
    console.warn(`${data.username || 'Your opponent'} disconnected.`);
    resetRoomState(); // Reset state fully.
    ui.showRoom(); // Show room UI.
    ui.updateStatusBanner("Opponent left. Create/Join new room.", 'info', 5000);
  });

  // Handle game over from server.
  if (state.socket) state.socket.on('gameOver', () => {
    console.info("<<< gameOver event received from server >>>");
    setGameActive(false);
    // Call the specific Game Over UI function.
    ui.displayGameOverUI(state.totalMatches, state.matches); // Pass matches array.
  });
} // End setupSocketListeners.

// --- Connection Initiation ---
export function connectToServer() {
  if (state.socket && state.socket.connected) {
    console.info("Already connected.");
    // If connected but not in game, ensure Room UI is shown.
    if (!state.isGameActive) {
      ui.showRoom();
    } else {
      console.info("Already connected and game is active.");
    }
    return;
  }
  ui.showConnecting(); // Show initial connecting UI.
  if (state.socket) { // If socket exists but disconnected, try reconnecting.
    console.info("Attempting to reconnect existing socket...");
    state.socket.connect();
    // Listeners should still be attached unless explicitly removed on disconnect.
    return;
  }
  // If no socket exists, create it.
  try {
    console.info(`Creating new socket connection to ${state.BACKEND_URL}`); // Use state for URL.
    // Use global 'io' provided by the script tag in index.html.
    const newSocket = io(state.BACKEND_URL, {
      reconnectionAttempts: 3, // Or adjust as needed.
      transports: ['websocket'], // Prefer WebSocket.
      timeout: 20000
    });
    setSocket(newSocket); // Store the socket instance in state via setter.
    setupSocketListeners(); // Attach listeners to the new socket.
  } catch (err) {
    console.error("Socket.IO initialization failed:", err);
    ui.showConnectionError("Error initializing connection. Please refresh.");
  }
}

// --- Emitting events ---
export function emitSwipe(movieId, choice) {
  if (state.socket && state.socket.connected && state.currentRoomCode) {
    state.socket.emit('playerSwipe', { movieId: movieId, choice: choice });
    console.info(`Client sending swipe: ${choice} for ${movieId} in room ${state.currentRoomCode}`);
    return true; // Indicate success.
  } else {
    console.warn("Cannot send swipe: Not connected or not in a room.");
    console.error("Connection issue: Cannot record swipe. Please check connection or refresh.");
    return false; // Indicate failure.
  }
}

export function emitCreateRoom(username) {
  if (state.socket && state.socket.connected) {
    state.socket.emit('createRoom', { username });
    return true;
  }
  console.warn("Cannot create room: Socket not connected.");
  // Optionally inform the user via UI.
  // ui.displayRoomMessage("Cannot create room: Not connected.", true);
  return false;
}

export function emitJoinRoom(roomCode, username) {
  if (state.socket && state.socket.connected) {
    state.socket.emit('joinRoom', { roomCode, username });
    return true;
  }
  console.warn("Cannot join room: Socket not connected.");
  // Optionally inform the user via UI.
  // ui.displayRoomMessage("Cannot join room: Not connected.", true);
  return false;
}