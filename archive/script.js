// --- START OF FILE script.js ---

const BACKEND_URL = 'https://matchandwatch-bjvh.onrender.com'; // Your Render URL
// const BACKEND_URL = 'http://localhost:3001'; // For local testing
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// --- Use DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM fully loaded and parsed");

    // --- DOM Elements ---
    const connectionStatusDiv = document.getElementById('connection-status');
    const connectionMessage = document.getElementById('connection-message');
    const connectionSpinner = document.getElementById('connection-spinner');
    const retryConnectionBtn = document.getElementById('retry-connection-btn');

    const roomUI = document.getElementById('room-ui');
    const gameArea = document.getElementById('game-area');
    const usernameInput = document.getElementById('username');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const roomMessage = document.getElementById('room-message'); // For messages *within* room UI
    const copyCodeBtn = document.getElementById('copyCodeBtn');
    const statusBanner = document.getElementById('status-banner');

    const cardContainer = gameArea.querySelector('.card-container');
    const likeBtn = gameArea.querySelector('#likeBtn');
    const dislikeBtn = gameArea.querySelector('#dislikeBtn');
    const loadingIndicator = gameArea.querySelector('.loading-indicator'); // Game area's indicator
    const matchesSection = document.querySelector('.matches-section');
    const latestMatchDisplay = document.getElementById('latest-match-display');
    const matchCounterContainer = document.getElementById('match-counter-container');
    const matchCountSpan = document.getElementById('match-count');

    // --- Socket.IO Instance ---
    let socket;

    // --- Game State Variables ---
    let currentCardsData = [];
    let deckCards = [];
    let activeCardElement = null;
    const MAX_VISIBLE_STACK_CARDS = 3;
    const STACK_TILT_ANGLE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-tilt-angle')) || 3;
    let isDragging = false;
    let startX, startY, currentX, currentY, deltaX = 0;
    const SWIPE_THRESHOLD = 80;
    let currentRoomCode = null;
    let totalMatches = 0;
    let matchedTitles = [];
    // --- Game State Flag ---
    let isGameActive = false; // Track if the game screen should be visible


    // --- Helper: Update Connection Status UI ---
    function updateConnectionStatus(status, message, showRetry = false, showSpinner = true) {
        if (!connectionStatusDiv || !connectionMessage || !connectionSpinner || !retryConnectionBtn) { console.error("Connection status UI elements not found!"); return; }
        connectionMessage.textContent = message;
        connectionMessage.className = status === 'error' ? 'error' : '';
        connectionSpinner.style.display = showSpinner ? 'block' : 'none';
        retryConnectionBtn.style.display = showRetry ? 'block' : 'none';
        retryConnectionBtn.disabled = !showRetry;
        connectionStatusDiv.style.display = 'flex';
    }

    // --- Helper: Display Room UI Messages ---
    function displayRoomMessage(message, isError = false) {
        if (!roomMessage) return;
        roomMessage.textContent = message;
        // Ensure base class is always present
        roomMessage.className = 'modal-message' + (isError ? ' error' : '');
        if (!isError && message.includes('Room Code:')) {
             roomMessage.className = 'modal-message success';
        }
    }

    // --- Status Banner Logic ---
    let bannerTimeoutId = null;
    function updateStatusBanner(message, type = 'info', autoHideDelay = null) {
        if (!statusBanner) return;
        clearTimeout(bannerTimeoutId);
        statusBanner.textContent = message;
        statusBanner.className = `status-banner visible ${type}`;
        if (autoHideDelay && typeof autoHideDelay === 'number' && autoHideDelay > 0) {
            bannerTimeoutId = setTimeout(hideStatusBanner, autoHideDelay);
        }
    }
    function hideStatusBanner() {
        if (!statusBanner) return;
        clearTimeout(bannerTimeoutId);
        statusBanner.classList.remove('visible');
    }


    // --- UI Switching ---
    function showConnectingUI() {
        updateConnectionStatus('connecting', 'Connecting to server...', false, true);
        if(roomUI) roomUI.style.display = 'none';
        if(gameArea) gameArea.style.display = 'none';
        if(matchesSection) matchesSection.style.display = 'none';
        hideStatusBanner();
        if(createRoomBtn) createRoomBtn.disabled = true;
        if(joinRoomBtn) joinRoomBtn.disabled = true;
        isGameActive = false; // Reset game state
    }

    function showConnectionErrorUI(errorMessage) {
        updateConnectionStatus('error', errorMessage, true, false);
        if(roomUI) roomUI.style.display = 'none';
        if(gameArea) gameArea.style.display = 'none';
        if(matchesSection) matchesSection.style.display = 'none';
        hideStatusBanner();
        if(createRoomBtn) createRoomBtn.disabled = true;
        if(joinRoomBtn) joinRoomBtn.disabled = true;
        isGameActive = false; // Reset game state
    }

    function showRoomUI() {
        console.log("showRoomUI called"); // Log when this runs
        isGameActive = false; // Explicitly set game not active
        if(connectionStatusDiv) connectionStatusDiv.style.display = 'none';
        if(roomUI) roomUI.style.display = 'flex';
        if(gameArea) gameArea.style.display = 'none'; // Hide game area
        if(matchesSection) matchesSection.style.display = 'none';
        // Clear game area content safely
        if(cardContainer) {
            const existingCards = cardContainer.querySelectorAll('.card');
            existingCards.forEach(card => card.remove());
            // Ensure loading indicator exists before setting text
            if (loadingIndicator) {
                loadingIndicator.textContent = 'Waiting for game to start...';
                loadingIndicator.style.display = 'block'; // Show loading indicator within hidden gameArea
            } else if (cardContainer) { // Fallback if indicator missing
                 cardContainer.innerHTML = '<div class="loading-indicator">Waiting for game to start...</div>';
            }
        }
        // Reset match state
        totalMatches = 0; matchedTitles = [];
        if (latestMatchDisplay) latestMatchDisplay.textContent = '';
        if (matchCountSpan) matchCountSpan.textContent = '0';
        if (matchCounterContainer) matchCounterContainer.title = 'No matches yet';
        // Reset other room UI elements
        deckCards = []; currentCardsData = []; activeCardElement = null; currentRoomCode = null;
        if(roomCodeInput) roomCodeInput.value = ''; if(roomCodeInput) roomCodeInput.readOnly = false;
        if(copyCodeBtn) copyCodeBtn.style.display = 'none';
        if(joinRoomBtn) joinRoomBtn.title = '';
        displayRoomMessage('');
        if(createRoomBtn) createRoomBtn.disabled = false; if(joinRoomBtn) joinRoomBtn.disabled = false;
        disableButtons(); // Disable game buttons
    }

    function hideRoomUI() {
         console.log(`hideRoomUI called, isGameActive: ${isGameActive}`); // Log state
         if(connectionStatusDiv) connectionStatusDiv.style.display = 'none';
         if(roomUI) roomUI.style.display = 'none';
         if(gameArea) gameArea.style.display = 'block'; // Show game area container

         // *** CRITICAL: Only show loading indicator if game IS NOT active ***
         if (loadingIndicator) {
            if (!isGameActive) {
                 loadingIndicator.textContent = 'Waiting for opponent...';
                 loadingIndicator.style.display = 'block';
                 console.log("hideRoomUI: Showing loading indicator (game not active)");
            } else {
                 // If game IS active, ensure indicator is hidden
                 loadingIndicator.style.display = 'none';
                 console.log("hideRoomUI: Hiding loading indicator (game is active)");
            }
         } else {
             console.error("hideRoomUI: loadingIndicator element not found!");
         }
         // --- End Critical Change ---
         hideStatusBanner();
    }

    // --- Socket.IO Connection Function ---
    function connectToServer() {
        if (socket && socket.connected) {
             console.log("Already connected.");
             if (!isGameActive) { showRoomUI(); } else { console.log("Already connected and game is active."); }
             return;
        }
        showConnectingUI();
        if (socket) { console.log("Attempting to reconnect existing socket..."); socket.connect(); return; }
        try {
            console.log(`Creating new socket connection to ${BACKEND_URL}`);
            socket = io(BACKEND_URL, { reconnectionAttempts: 3, transports: ['websocket'] });
            setupSocketListeners();
        } catch (err) {
            console.error("Socket.IO initialization failed:", err);
            showConnectionErrorUI("Error initializing connection. Please refresh.");
        }
    }

    // --- Socket.IO Event Handlers ---
    function setupSocketListeners() {
        if (!socket) { console.error("Cannot setup listeners: socket is not initialized."); return; }

        // Remove previous listeners
        socket.off('connect'); socket.off('disconnect'); socket.off('connect_error'); socket.off('error');
        socket.off('roomCreated'); socket.off('joinSuccess'); socket.off('opponentJoined');
        socket.off('startGame'); socket.off('matchFound'); socket.off('opponentDisconnected');

        // Add listeners
        socket.on('connect', () => {
            console.log('Connected to server:', socket.id);
            if (isGameActive && currentRoomCode) { // Refined Reconnect Logic
                console.log(`Reconnected during active game in room: ${currentRoomCode}. Ensuring correct UI.`);
                updateStatusBanner("Reconnected to server.", 'success', 2000);
                if(gameArea) gameArea.style.display = 'block';
                if(roomUI) roomUI.style.display = 'none';
                if(connectionStatusDiv) connectionStatusDiv.style.display = 'none';
                if(loadingIndicator) loadingIndicator.style.display = 'none'; // Ensure hidden
                enableButtons();
                if(createRoomBtn) createRoomBtn.disabled = true;
                if(joinRoomBtn) joinRoomBtn.disabled = true;
            } else { // Fresh connection or game ended/reset
                console.log("Fresh connection or game not active. Showing Room UI.");
                isGameActive = false;
                showRoomUI();
                updateStatusBanner("You are all set!", 'success', 3000);
            }
        });

        socket.on('disconnect', (reason) => {
             console.log('Disconnected from server:', reason);
             if (reason !== 'io client disconnect') { updateStatusBanner("Connection lost. Attempting to reconnect...", 'error'); }
             else { hideStatusBanner(); }
             disableButtons();
             if(createRoomBtn) createRoomBtn.disabled = true;
             if(joinRoomBtn) joinRoomBtn.disabled = true;
        });

        socket.on('connect_error', (err) => {
             console.error('Connection Error after attempts:', err.message);
             showConnectionErrorUI(`Connection failed permanently. Server offline or URL incorrect?`);
             currentRoomCode = null;
             isGameActive = false;
        });

        socket.on('error', (data) => { // Custom server errors
            console.error('Server Error:', data.message);
            displayRoomMessage(data.message, true);
            if(createRoomBtn) createRoomBtn.disabled = false;
            if(joinRoomBtn) joinRoomBtn.disabled = false;
        });

        socket.on('roomCreated', (data) => {
            currentRoomCode = data.roomCode;
            isGameActive = false; // Game not active yet
            console.log(`Room created: ${currentRoomCode}. Waiting for friend...`);
            displayRoomMessage(`Room Code: ${currentRoomCode} - Share this code!`);
            if(roomCodeInput) { roomCodeInput.value = currentRoomCode; roomCodeInput.readOnly = true; }
            if(copyCodeBtn) copyCodeBtn.style.display = 'flex';
            if(createRoomBtn) createRoomBtn.disabled = true;
            if(joinRoomBtn) { joinRoomBtn.disabled = true; joinRoomBtn.title = 'Waiting for opponent...'; }
            updateStatusBanner(`Waiting for opponent... Room Code: ${data.roomCode}`, 'waiting');
        });

        socket.on('joinSuccess', (data) => {
            currentRoomCode = data.roomCode;
            isGameActive = false; // Game not active yet
            console.log(`Joined room: ${currentRoomCode}`);
            hideRoomUI(); // Shows game area with loading indicator
            displayRoomMessage('');
            if(loadingIndicator) loadingIndicator.textContent = `Joined Room ${currentRoomCode}. Waiting for opponent...`;
        });

        socket.on('opponentJoined', (data) => {
             console.log(`${data.username || 'Opponent'} joined.`);
             isGameActive = false; // Still waiting for startGame
             if (loadingIndicator && gameArea.style.display === 'block') {
                loadingIndicator.textContent = `${data.username || 'Opponent'} joined! Starting...`;
             }
        });

        socket.on('startGame', (data) => {
            console.log('<<< startGame event received >>>');
            if (!data.movies || data.movies.length === 0) {
                 console.error("Received startGame event with no movies!");
                 alert("Error starting game: No movies received from server.");
                 isGameActive = false; showRoomUI(); return;
            }

            // *** Set Game Active State FIRST ***
            isGameActive = true;
            console.log("startGame: Set isGameActive = true");
            currentCardsData = data.movies;
            // *** ------------------------- ***

            hideRoomUI(); // Hides room UI, shows game area, should now hide loading indicator because isGameActive is true

            // --- Explicitly Hide Game Area's Loading Indicator ---
            if (loadingIndicator) {
                console.log("startGame: Hiding game area loading indicator."); // Add log
                loadingIndicator.style.display = 'none';
            } else { console.error("startGame: Could not find game area loading indicator to hide!"); }
            // ----------------------------------------------------

            // Reset matches state
            totalMatches = 0; matchedTitles = [];
            if (latestMatchDisplay) latestMatchDisplay.textContent = '';
            if (matchCountSpan) matchCountSpan.textContent = '0';
            if (matchCounterContainer) matchCounterContainer.title = 'No matches yet';
            if (matchesSection) matchesSection.style.display = 'none';

            console.log("startGame: Calling renderInitialDeck...");
            renderInitialDeck(); // Render the actual game deck
        });

        socket.on('matchFound', (data) => {
            console.log('MATCH FOUND via server!', data.movie);
            displayMatch(data.movie);
        });

        socket.on('opponentDisconnected', (data) => {
             alert(`${data.username || 'Your opponent'} disconnected.`);
             isGameActive = false; // Game is no longer active
             showRoomUI();
             updateStatusBanner("Opponent left. Create/Join new room.", 'info', 5000);
        });
    } // End setupSocketListeners

    // --- Room UI Event Listeners ---
    if(createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim() || `Player_${Math.random().toString(36).substring(2, 6)}`;
            if (socket && socket.connected) {
                socket.emit('createRoom', { username });
                displayRoomMessage("Creating room...");
                 createRoomBtn.disabled = true; joinRoomBtn.disabled = true; joinRoomBtn.title = 'Creating room...';
            } else { displayRoomMessage("Not connected to server.", true); }
        });
    }

    if(joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            const roomCode = roomCodeInput.value.trim().toUpperCase();
            const username = usernameInput.value.trim() || `Player_${Math.random().toString(36).substring(2, 6)}`;
            if (!roomCode || roomCode.length !== 4) { displayRoomMessage("Please enter a valid 4-character room code.", true); return; }
            if (socket && socket.connected) {
                socket.emit('joinRoom', { roomCode, username });
                displayRoomMessage(`Joining room ${roomCode}...`);
                 createRoomBtn.disabled = true; joinRoomBtn.disabled = true; joinRoomBtn.title = 'Joining room...';
            } else { displayRoomMessage("Not connected to server.", true); }
        });
    }

    if(copyCodeBtn && roomCodeInput) {
        copyCodeBtn.addEventListener('click', () => {
            const codeToCopy = roomCodeInput.value;
            if (!codeToCopy) return;
            navigator.clipboard.writeText(codeToCopy).then(() => {
                console.log('Room code copied:', codeToCopy);
                copyCodeBtn.classList.add('copied');
                updateStatusBanner(`Copied Room Code: ${codeToCopy}!`, 'success', 2000);
                setTimeout(() => { copyCodeBtn.classList.remove('copied'); }, 1500);
            }).catch(err => {
                console.error('Failed to copy code:', err);
                updateStatusBanner('Failed to copy code!', 'error', 3000);
            });
        });
    }

     // --- Retry Button Listener ---
     if(retryConnectionBtn) {
        retryConnectionBtn.addEventListener('click', () => {
            console.log("Retry button clicked.");
            retryConnectionBtn.disabled = true;
            connectToServer();
        });
    }


    // --- Core Game Functions ---

    // Card Creation
    function createCardElement(movie) {
        const card = document.createElement('div'); card.classList.add('card'); card.dataset.movieId = movie.id;
        const img = document.createElement('img'); img.src = `${IMAGE_BASE_URL}${movie.poster_path}`; img.alt = `Poster for ${movie.title}`; img.loading = 'lazy';
        img.onerror = () => { console.warn(`Failed to load image: ${img.src}`); img.remove(); };
        card.appendChild(img);
        card.addEventListener('mousedown', startDrag); card.addEventListener('touchstart', startDrag, { passive: true });
        return card;
    }

    // Card Rendering & Stacking
    function renderInitialDeck() {
        if (!cardContainer) { console.error("renderInitialDeck: cardContainer not found."); return; }
        console.log("renderInitialDeck called.");

        // --- Ensure loading indicator is hidden ---
        if (loadingIndicator) {
             console.log("renderInitialDeck: Ensuring loading indicator is hidden.");
             loadingIndicator.style.display = 'none';
        }
        // ----------------------------------------

        // --- Remove ONLY card elements ---
        const existingCards = cardContainer.querySelectorAll('.card');
        console.log(`renderInitialDeck: Removing ${existingCards.length} existing cards.`);
        existingCards.forEach(card => card.remove());
        deckCards = [];
        // -------------------------------

        if (!currentCardsData || currentCardsData.length === 0) {
            console.log("renderInitialDeck: No cards data to render.");
            if(loadingIndicator) { loadingIndicator.textContent = 'No movies loaded.'; loadingIndicator.style.display = 'block'; }
            disableButtons(); return;
        }

        // Render new cards
        console.log(`renderInitialDeck: Rendering ${currentCardsData.length} new cards.`);
        currentCardsData.forEach(movie => { deckCards.push(createCardElement(movie)); });
        deckCards.reverse();
        // Append cards
        deckCards.forEach(card => { cardContainer.appendChild(card); });

        activeCardElement = deckCards[0] || null;
        updateStackTransforms();
        if (activeCardElement) {
            enableButtons();
            console.log("renderInitialDeck: Deck rendered, buttons enabled.");
        } else {
            disableButtons();
             console.log("renderInitialDeck: Deck rendered, but no active card? Buttons disabled.");
        }
    }

    // Update Visual Stack
    function updateStackTransforms() {
        const opacityDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-opacity-decrement')) || 0.15;
        deckCards.forEach((card, index) => {
            const positionFromTop = index; let translateY = 0; let scale = 1; let rotate = 0; let opacity = 1; let zIndex = deckCards.length - positionFromTop;
            if (positionFromTop > 0) {
                if (positionFromTop <= MAX_VISIBLE_STACK_CARDS) {
                    const offsetY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-offset-y')) || 4; const scaleDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-scale-decrement')) || 0.04; translateY = positionFromTop * offsetY; scale = 1 - (positionFromTop * scaleDecrement); if (positionFromTop === 1) { rotate = STACK_TILT_ANGLE; } opacity = 1 - (positionFromTop * opacityDecrement); opacity = Math.max(0, opacity);
                } else { opacity = 0; const offsetY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-offset-y')) || 4; const scaleDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-scale-decrement')) || 0.04; translateY = MAX_VISIBLE_STACK_CARDS * offsetY; scale = 1 - (MAX_VISIBLE_STACK_CARDS * scaleDecrement); zIndex = 0; }
            } card.style.transform = `translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`; card.style.opacity = opacity; card.style.zIndex = zIndex;
        });
    }

    // --- Swipe Logic ---
    function startDrag(e) { if (!activeCardElement || !activeCardElement.contains(e.target) || isDragging || !isGameActive) return; isDragging = true; activeCardElement.classList.add('dragging'); startX = e.pageX || e.touches[0].pageX; startY = e.pageY || e.touches[0].pageY; document.addEventListener('mousemove', drag); document.addEventListener('mouseup', endDrag); document.addEventListener('mouseleave', endDrag); document.addEventListener('touchmove', drag, { passive: false }); document.addEventListener('touchend', endDrag); document.addEventListener('touchcancel', endDrag); if (e.type === 'mousedown') e.preventDefault(); }
    function drag(e) { if (!isDragging || !activeCardElement || !isGameActive) return; currentX = e.pageX || e.touches[0].pageX; currentY = e.pageY || e.touches[0].pageY; if (e.type === 'touchmove') { if (Math.abs(currentX - startX) > Math.abs(currentY - startY) + 10) e.preventDefault(); } deltaX = currentX - startX; const rotateDeg = deltaX * 0.1; activeCardElement.style.transform = `translateX(${deltaX}px) rotate(${rotateDeg}deg)`; updateIndicatorOpacity(deltaX); updateBackgroundGlow(deltaX); }
    function updateIndicatorOpacity(delta) { if (!activeCardElement || !isGameActive) return; if (delta > 10) { activeCardElement.classList.add('show-like'); activeCardElement.classList.remove('show-dislike'); } else if (delta < -10) { activeCardElement.classList.add('show-dislike'); activeCardElement.classList.remove('show-like'); } else { activeCardElement.classList.remove('show-like', 'show-dislike'); } }
    function updateBackgroundGlow(delta) { if (!isGameActive) return; const swipeRatio = Math.min(Math.abs(delta) / (SWIPE_THRESHOLD * 1.5), 1); const glowOpacity = swipeRatio * 0.6; let glowHue = 0; if (delta > 10) glowHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-like-hue')) || 120; else if (delta < -10) glowHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-dislike-hue')) || 0; document.documentElement.style.setProperty('--current-glow-hue', glowHue); document.documentElement.style.setProperty('--glow-opacity', glowOpacity); }
    function endDrag(e) { if (!isDragging || !activeCardElement || !isGameActive) return; isDragging = false; document.removeEventListener('mousemove', drag); document.removeEventListener('mouseup', endDrag); document.removeEventListener('mouseleave', endDrag); document.removeEventListener('touchmove', drag); document.removeEventListener('touchend', endDrag); document.removeEventListener('touchcancel', endDrag); document.documentElement.style.setProperty('--glow-opacity', 0); activeCardElement.classList.remove('show-like', 'show-dislike'); const decisionMade = Math.abs(deltaX) > SWIPE_THRESHOLD; if (decisionMade) { const direction = deltaX > 0 ? 'right' : 'left'; animateAndRemoveCard(direction); } else { activeCardElement.classList.remove('dragging'); updateStackTransforms(); } deltaX = 0; }

    // Animate Card Removal & SEND SWIPE TO SERVER
    function animateAndRemoveCard(direction) {
        if (!activeCardElement || !isGameActive) return; // Check game active state
        const cardToRemove = activeCardElement;
        const movieId = cardToRemove.dataset.movieId;
        const choice = direction === 'right' ? 'like' : 'dislike';

        if (socket && socket.connected && currentRoomCode) {
            socket.emit('playerSwipe', { movieId: movieId, choice: choice });
            console.log(`Client sending swipe: ${choice} for ${movieId} in room ${currentRoomCode}`);
        } else {
             console.warn("Cannot send swipe: Not connected or not in a room.");
             alert("Connection issue: Cannot record swipe. Please check connection or refresh.");
             updateStackTransforms(); // Snap back
             return;
        }

        // Update Deck Array and Active Card Reference
        deckCards = deckCards.filter(card => card !== cardToRemove);
        activeCardElement = deckCards[0] || null;
        cardToRemove.classList.remove('dragging');
        cardToRemove.classList.add(direction === 'right' ? 'gone-right' : 'gone-left');
        updateStackTransforms();
        if (!activeCardElement) disableButtons(); else enableButtons();
        cardToRemove.addEventListener('transitionend', () => {
            if (cardToRemove.parentNode) cardToRemove.remove();
            if (deckCards.length === 0) displayEndMessage();
        }, { once: true });
        if (deckCards.length === 0) {
            setTimeout(() => { if (cardContainer && cardContainer.querySelectorAll('.card').length === 0) displayEndMessage(); }, 600);
        }
    }

    // Display End Message
    function displayEndMessage() {
        if (loadingIndicator) {
            loadingIndicator.textContent = `All movies swiped! You got ${totalMatches} match${totalMatches !== 1 ? 'es' : ''}. Check below!`;
            loadingIndicator.style.display = 'block'; // Show final message
        }
        if(cardContainer) {
            const existingCards = cardContainer.querySelectorAll('.card');
            existingCards.forEach(card => card.remove());
        }
        disableButtons();
        // Show matches section even if zero matches
        if(matchesSection) {
            matchesSection.style.display = 'flex'; // Use flex display
            if (totalMatches === 0 && latestMatchDisplay) {
                latestMatchDisplay.textContent = 'No matches this round!';
            }
        }
    }

    // Button Controls
    function disableButtons() { if(likeBtn) likeBtn.disabled = true; if(dislikeBtn) dislikeBtn.disabled = true; }
    function enableButtons() { if(likeBtn) likeBtn.disabled = false; if(dislikeBtn) dislikeBtn.disabled = false; }
    if(likeBtn) likeBtn.addEventListener('click', () => { if (!activeCardElement || isDragging || !isGameActive) return; animateAndRemoveCard('right'); });
    if(dislikeBtn) dislikeBtn.addEventListener('click', () => { if (!activeCardElement || isDragging || !isGameActive) return; animateAndRemoveCard('left'); });

    // Displaying Matches
    function displayMatch(movie) {
        if (!movie || !movie.title || !matchesSection || !latestMatchDisplay || !matchCounterContainer || !matchCountSpan) {
            console.error("Missing elements needed to display match."); return;
        }
        matchesSection.style.display = 'flex';
        totalMatches++;
        matchedTitles.push(movie.title);
        latestMatchDisplay.textContent = `✨ Match: ${movie.title} ✨`;
        latestMatchDisplay.classList.add('highlight-new-match');
        setTimeout(() => { latestMatchDisplay.classList.remove('highlight-new-match'); }, 1500);
        matchCountSpan.textContent = totalMatches;
        let tooltipText = `Matched Movies (${totalMatches}):\n- ${matchedTitles.join('\n- ')}`;
        matchCounterContainer.title = tooltipText;
    }

    // --- Initialization ---
    function initializeApp() {
        console.log("Initializing app...");
        isGameActive = false; // Ensure game starts inactive
        disableButtons();
        connectToServer();
        hideStatusBanner(); // Hide banner initially
    }

    // --- Start the application ---
    initializeApp();

}); // --- End of DOMContentLoaded listener ---
// --- END OF FILE script.js ---