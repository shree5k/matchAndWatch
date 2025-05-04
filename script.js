const BACKEND_URL = 'https://your-movie-swiper-backend.onrender.com';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM fully loaded and parsed");

    let socket;
    try {
        socket = io(BACKEND_URL, {
            reconnectionAttempts: 3,
            transports: ['websocket']
        });
        console.log(`Attempting to connect to backend at ${BACKEND_URL}`);
    } catch (err) {
        console.error("Socket.IO connection failed on initialization:", err);
        displayRoomMessage("Error connecting to server. Please refresh.", true);
        // Disable room UI buttons if connection fails immediately
        if(createRoomBtn) createRoomBtn.disabled = true;
        if(joinRoomBtn) joinRoomBtn.disabled = true;
        return; // Stop initialization
    }

    // --- DOM Elements ---
    const roomUI = document.getElementById('room-ui');
    const gameArea = document.getElementById('game-area');
    const usernameInput = document.getElementById('username');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const roomMessage = document.getElementById('room-message');

    const cardContainer = gameArea.querySelector('.card-container');
    const likeBtn = gameArea.querySelector('#likeBtn');
    const dislikeBtn = gameArea.querySelector('#dislikeBtn');
    const loadingIndicator = gameArea.querySelector('.loading-indicator');
    const matchedList = document.getElementById('matched-list');
    const matchesSection = document.querySelector('.matches-section');

    // --- Game State Variables ---
    let currentCardsData = [];
    let deckCards = [];
    let activeCardElement = null;
    let likedMovies = [];
    let dislikedMovies = [];
    const MAX_VISIBLE_STACK_CARDS = 3;
    const STACK_TILT_ANGLE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-tilt-angle')) || 3;
    let isDragging = false;
    let startX, startY, currentX, currentY, deltaX = 0;
    const SWIPE_THRESHOLD = 80;
    let currentRoomCode = null;

    function displayRoomMessage(message, isError = false) {
        if (!roomMessage) return;
        roomMessage.textContent = message;
        roomMessage.className = isError ? 'error' : '';
        if (!isError && message.includes('Room Code:')) {
             roomMessage.className = 'success';
        }
    }

    // --- Room UI Event Listeners ---
    if(createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim() || `Player_${Math.random().toString(36).substring(2, 6)}`;
            if (socket && socket.connected) {
                socket.emit('createRoom', { username });
                displayRoomMessage("Creating room...");
                 createRoomBtn.disabled = true; // Prevent double clicking
                 joinRoomBtn.disabled = true;
            } else {
                displayRoomMessage("Not connected to server.", true);
            }
        });
    }

    if(joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            const roomCode = roomCodeInput.value.trim().toUpperCase();
            const username = usernameInput.value.trim() || `Player_${Math.random().toString(36).substring(2, 6)}`;
            if (!roomCode) {
                displayRoomMessage("Please enter a room code.", true);
                return;
            }
            if (socket && socket.connected) {
                socket.emit('joinRoom', { roomCode, username });
                displayRoomMessage(`Joining room ${roomCode}...`);
                 createRoomBtn.disabled = true;
                 joinRoomBtn.disabled = true;
            } else {
                displayRoomMessage("Not connected to server.", true);
            }
        });
    }

    // --- Socket.IO Event Handlers ---
    function setupSocketListeners() {
        if (!socket) return; // Don't setup if socket failed to init

        socket.on('connect', () => {
            console.log('Connected to server:', socket.id);
            displayRoomMessage("Connected. Create or join a room.", false);
            // Re-enable buttons on successful connect
            if(createRoomBtn) createRoomBtn.disabled = false;
            if(joinRoomBtn) joinRoomBtn.disabled = false;
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            // Only show alert if it wasn't a manual disconnect/page unload
            if (reason !== 'io client disconnect') {
                 alert("Disconnected from server. Please refresh.");
                 displayRoomMessage("Disconnected. Please refresh.", true);
            }
            showRoomUI(); // Show room UI again
            disableButtons(); // Disable game buttons
            if(createRoomBtn) createRoomBtn.disabled = true; // Also disable room buttons
            if(joinRoomBtn) joinRoomBtn.disabled = true;
        });

        socket.on('connect_error', (err) => {
             console.error('Connection Error:', err.message);
             displayRoomMessage(`Connection failed. Server may be offline or URL incorrect.`, true);
             showRoomUI();
             if(createRoomBtn) createRoomBtn.disabled = true;
             if(joinRoomBtn) joinRoomBtn.disabled = true;
        });

        socket.on('error', (data) => { // Custom errors from server
            console.error('Server Error:', data.message);
            displayRoomMessage(data.message, true);
            // Re-enable room buttons if error allows trying again (e.g., room full/not found)
            if(createRoomBtn) createRoomBtn.disabled = false;
            if(joinRoomBtn) joinRoomBtn.disabled = false;
        });

        socket.on('roomCreated', (data) => {
            currentRoomCode = data.roomCode;
            console.log(`Room created: ${currentRoomCode}. Waiting for friend...`);
            displayRoomMessage(`Room Code: ${currentRoomCode} - Waiting for opponent... Share this code!`);
            roomCodeInput.value = currentRoomCode;
            if(createRoomBtn) createRoomBtn.disabled = true; // Prevent creating another
            if(joinRoomBtn) joinRoomBtn.disabled = true; // Prevent joining while waiting
        });

        socket.on('joinSuccess', (data) => {
            currentRoomCode = data.roomCode;
            console.log(`Joined room: ${currentRoomCode}`);
            displayRoomMessage(`Joined Room ${currentRoomCode}. Waiting for game...`);
            hideRoomUI();
        });

        socket.on('opponentJoined', (data) => {
             console.log(`${data.username || 'Opponent'} joined.`);
             displayRoomMessage(`${data.username || 'Opponent'} joined! Starting game...`);
             // Game start triggered by 'startGame' event
        });

        socket.on('startGame', (data) => {
            console.log('Game starting with movies:', data.movies);
            hideRoomUI();
            loadingIndicator.style.display = 'none';
            currentCardsData = data.movies;
            renderInitialDeck(); // Render the synchronized deck
            matchesSection.style.display = 'none';
            matchedList.innerHTML = '';
        });

        socket.on('matchFound', (data) => {
            console.log('MATCH FOUND via server!', data.movie);
            displayMatch(data.movie);
        });

        socket.on('opponentDisconnected', (data) => {
             alert(`${data.username || 'Your opponent'} disconnected.`);
             showRoomUI();
             displayRoomMessage("Opponent left. Create or join a new room.", false);
             currentRoomCode = null;
             roomCodeInput.value = ''; // Clear input
             if(createRoomBtn) createRoomBtn.disabled = false; // Re-enable room buttons
             if(joinRoomBtn) joinRoomBtn.disabled = false;
        });
    }

    // --- UI Switching ---
    function hideRoomUI() {
        if(roomUI) roomUI.style.display = 'none';
        if(gameArea) gameArea.style.display = 'block';
        // Reset loading indicator text for game start
        if(loadingIndicator) loadingIndicator.textContent = 'Waiting for cards...';
    }

    function showRoomUI() {
        if(roomUI) roomUI.style.display = 'flex';
        if(gameArea) gameArea.style.display = 'none';
        if(matchesSection) matchesSection.style.display = 'none';
        if(cardContainer) cardContainer.innerHTML = '<div class="loading-indicator">Waiting for game to start...</div>';
        deckCards = [];
        currentCardsData = [];
        activeCardElement = null;
        currentRoomCode = null; // Reset room code state
    }

    // --- Core Game Functions ---

    // Card Creation - No changes needed
    function createCardElement(movie) {
        const card = document.createElement('div'); card.classList.add('card'); card.dataset.movieId = movie.id;
        const img = document.createElement('img'); img.src = `${IMAGE_BASE_URL}${movie.poster_path}`; img.alt = `Poster for ${movie.title}`; img.loading = 'lazy';
        img.onerror = () => { console.warn(`Failed to load image: ${img.src}`); img.remove(); };
        card.appendChild(img);
        card.addEventListener('mousedown', startDrag); card.addEventListener('touchstart', startDrag, { passive: true });
        return card;
    }

    // Card Rendering & Stacking - No changes needed
    function renderInitialDeck() {
        if (!cardContainer) return; // Safety check
        const existingCards = cardContainer.querySelectorAll('.card'); existingCards.forEach(card => card.remove()); deckCards = [];
        if (!currentCardsData || currentCardsData.length === 0) { if(loadingIndicator) { loadingIndicator.textContent = 'No movies loaded.'; loadingIndicator.style.display = 'block'; } disableButtons(); return; }
        else { if(loadingIndicator) loadingIndicator.style.display = 'none'; }
        currentCardsData.forEach(movie => { deckCards.push(createCardElement(movie)); }); deckCards.reverse();
        deckCards.forEach(card => { cardContainer.appendChild(card); });
        activeCardElement = deckCards[0] || null; updateStackTransforms();
        if (activeCardElement) enableButtons(); else disableButtons();
    }

    // Update Visual Stack - No changes needed
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

    // Swipe Logic: Start, Drag, Indicators, Glow, End - No changes needed
    function startDrag(e) { if (!activeCardElement || !activeCardElement.contains(e.target) || isDragging) return; isDragging = true; activeCardElement.classList.add('dragging'); startX = e.pageX || e.touches[0].pageX; startY = e.pageY || e.touches[0].pageY; document.addEventListener('mousemove', drag); document.addEventListener('mouseup', endDrag); document.addEventListener('mouseleave', endDrag); document.addEventListener('touchmove', drag, { passive: false }); document.addEventListener('touchend', endDrag); document.addEventListener('touchcancel', endDrag); if (e.type === 'mousedown') e.preventDefault(); }
    function drag(e) { if (!isDragging || !activeCardElement) return; currentX = e.pageX || e.touches[0].pageX; currentY = e.pageY || e.touches[0].pageY; if (e.type === 'touchmove') { if (Math.abs(currentX - startX) > Math.abs(currentY - startY) + 10) e.preventDefault(); } deltaX = currentX - startX; const rotateDeg = deltaX * 0.1; activeCardElement.style.transform = `translateX(${deltaX}px) rotate(${rotateDeg}deg)`; updateIndicatorOpacity(deltaX); updateBackgroundGlow(deltaX); }
    function updateIndicatorOpacity(delta) { if (!activeCardElement) return; if (delta > 10) { activeCardElement.classList.add('show-like'); activeCardElement.classList.remove('show-dislike'); } else if (delta < -10) { activeCardElement.classList.add('show-dislike'); activeCardElement.classList.remove('show-like'); } else { activeCardElement.classList.remove('show-like', 'show-dislike'); } }
    function updateBackgroundGlow(delta) { const swipeRatio = Math.min(Math.abs(delta) / (SWIPE_THRESHOLD * 1.5), 1); const glowOpacity = swipeRatio * 0.6; let glowHue = 0; if (delta > 10) glowHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-like-hue')) || 120; else if (delta < -10) glowHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-dislike-hue')) || 0; document.documentElement.style.setProperty('--current-glow-hue', glowHue); document.documentElement.style.setProperty('--glow-opacity', glowOpacity); }
    function endDrag(e) { if (!isDragging || !activeCardElement) return; isDragging = false; document.removeEventListener('mousemove', drag); document.removeEventListener('mouseup', endDrag); document.removeEventListener('mouseleave', endDrag); document.removeEventListener('touchmove', drag); document.removeEventListener('touchend', endDrag); document.removeEventListener('touchcancel', endDrag); document.documentElement.style.setProperty('--glow-opacity', 0); activeCardElement.classList.remove('show-like', 'show-dislike'); const decisionMade = Math.abs(deltaX) > SWIPE_THRESHOLD; if (decisionMade) { const direction = deltaX > 0 ? 'right' : 'left'; animateAndRemoveCard(direction); } else { activeCardElement.classList.remove('dragging'); updateStackTransforms(); } deltaX = 0; }

    // Animate Card Removal & SEND SWIPE TO SERVER
    function animateAndRemoveCard(direction) {
        if (!activeCardElement) return;
        const cardToRemove = activeCardElement;
        const movieId = cardToRemove.dataset.movieId;
        const choice = direction === 'right' ? 'like' : 'dislike';

        if (socket && socket.connected && currentRoomCode) {
            socket.emit('playerSwipe', { movieId: movieId, choice: choice });
            console.log(`Client sending swipe: ${choice} for ${movieId} in room ${currentRoomCode}`);
            // Proceed with visual removal immediately
        } else {
             console.warn("Cannot send swipe: Not connected or not in a room.");
             alert("Connection issue: Cannot record swipe. Please check connection or refresh."); // Notify user
             updateStackTransforms(); // Snap card back visually if swipe fails
             return; // Stop card removal
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

    // Display End Message - Update text
    function displayEndMessage() {
        if (loadingIndicator) {
             loadingIndicator.textContent = 'All movies swiped! Check matches below.';
             loadingIndicator.style.display = 'block';
        }
        // Clear remaining cards (should be none, but safe)
        if(cardContainer) {
            const existingCards = cardContainer.querySelectorAll('.card');
            existingCards.forEach(card => card.remove());
        }
        disableButtons();
    }

    // Button Controls - No changes needed
    function disableButtons() { if(likeBtn) likeBtn.disabled = true; if(dislikeBtn) dislikeBtn.disabled = true; }
    function enableButtons() { if(likeBtn) likeBtn.disabled = false; if(dislikeBtn) dislikeBtn.disabled = false; }
    if(likeBtn) likeBtn.addEventListener('click', () => { if (!activeCardElement || isDragging) return; animateAndRemoveCard('right'); });
    if(dislikeBtn) dislikeBtn.addEventListener('click', () => { if (!activeCardElement || isDragging) return; animateAndRemoveCard('left'); });

    // Displaying Matches - No changes needed
    function displayMatch(movie) { if (!movie || !movie.title || !matchesSection || !matchedList) return; matchesSection.style.display = 'block'; const li = document.createElement('li'); li.textContent = `✨ ${movie.title} ✨`; matchedList.appendChild(li); li.classList.add('highlight-match'); setTimeout(() => li.classList.remove('highlight-match'), 1500); }

    // --- Initialization ---
    function initializeApp() {
        console.log("Initializing app...");
        disableButtons(); // Game buttons start disabled
        showRoomUI(); // Show room UI first
        setupSocketListeners(); // Setup listeners for server events
    }

    initializeApp();

});