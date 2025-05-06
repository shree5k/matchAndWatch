import * as ui from './ui.js';
import * as socketHandlers from './socket.js';

// --- Configuration ---
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const MAX_VISIBLE_STACK_CARDS = 3;
const SWIPE_THRESHOLD = 80;
const BACKEND_URL = 'https://matchandwatch-bjvh.onrender.com';
// const BACKEND_URL = 'http://localhost:3001';

// --- State ---
export const state = {
    socket: null,
    currentRoomCode: null,
    isGameActive: false,
    currentCardsData: [],
    deckCards: [],
    activeCardElement: null,
    matches: [], // Keep storing full objects
    totalMatches: 0, // Keep the counter too
    localUserFinishedSwiping: false,
    isDragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    BACKEND_URL: BACKEND_URL,
    IMAGE_BASE_URL: IMAGE_BASE_URL
};

// --- State Setters (Exported) ---
export function setSocket(newSocket) {
    state.socket = newSocket;
}

export function setRoomCode(code) {
    state.currentRoomCode = code;
}

export function setGameActive(active) {
    state.isGameActive = active;
    if (!active) {
        state.localUserFinishedSwiping = false;
    }
}

export function setCardsData(data) {
    state.currentCardsData = data && Array.isArray(data) ? [...data] : [];
}

export function setDeckCards(cards) {
    state.deckCards = cards && Array.isArray(cards) ? [...cards] : [];
}

export function setActiveCard(card) {
    state.activeCardElement = card;
}

export function addMatch(movie) {
    if (!movie || !movie.id) {
        console.warn('addMatch called with invalid movie object.');
        return;
    }
    if (!state.matches.some(m => m.id === movie.id)) {
        state.matches.push(movie);
        state.totalMatches++; // <<< RE-ADD THIS LINE
        console.log(`Match added: "${movie.title || 'Unknown Title'}". Total matches: ${state.totalMatches}`);
    } else {
        console.log(`Duplicate match ignored: "${movie.title || 'Unknown Title'}"`);
    }
}

// export function addMatchTitle(title) { state.totalMatches++; state.matchedTitles.push(title); }

export function resetMatchState() {
    console.log("Resetting match state...");
    state.matches = [];
    state.totalMatches = 0; // <<< ADD THIS LINE
}

export function resetDeckState() {
    state.currentCardsData = [];
    state.deckCards = [];
    state.activeCardElement = null;
    state.localUserFinishedSwiping = false;
}

export function resetGameState() {
    resetDeckState();
    resetMatchState();
    state.isGameActive = false;
}

export function resetRoomState() {
    resetGameState();
    state.currentRoomCode = null;
}

// --- Core Game Functions ---

// Card Creation
function createCardElement(movie) {
    if (!movie || !movie.id) {
        console.warn('createCardElement called with invalid movie object.');
        return null;
    }

    const card = document.createElement('div');
    card.classList.add('card');
    card.dataset.movieId = movie.id;

    const img = document.createElement('img');
    img.src = `${state.IMAGE_BASE_URL}${movie.poster_path || ''}`;
    img.alt = `Poster for ${movie.title || 'Unknown Title'}`;
    img.loading = 'lazy';

    img.onerror = () => {
        console.warn(`Failed to load image: ${img.src}`);
        img.remove();
    };

    card.appendChild(img);

    ui.setupCardDragListeners(card, handleStartDrag); // Attach listeners

    return card;
}

// Card Rendering & Stacking (Exported for socket.js)
export function renderInitialDeck() {
    const cardContainer = ui.getCardContainer();
    if (!cardContainer) {
        console.error("renderInitialDeck: cardContainer element not found.");
        return;
    }

    console.log("renderInitialDeck: Called to render deck.");

    ui.hideGameLoadingIndicator();

    const existingCards = cardContainer.querySelectorAll('.card');
    existingCards.forEach(card => card.remove());

    setDeckCards([]);

    if (!state.currentCardsData || !Array.isArray(state.currentCardsData) || state.currentCardsData.length === 0) {
        console.log("renderInitialDeck: No cards data available to render.");
        ui.showGameLoadingIndicator('No movies loaded.');
        ui.disableGameButtons();
        return;
    }

    console.log(`renderInitialDeck: Rendering ${state.currentCardsData.length} cards.`);

    const newDeckElements = state.currentCardsData
        .map(createCardElement)
        .filter(card => card !== null)
        .reverse();

    newDeckElements.forEach(card => {
        cardContainer.appendChild(card);
    });

    setDeckCards(newDeckElements.slice().reverse());

    setActiveCard(state.deckCards[0] || null);

    updateStackTransforms();

    if (state.activeCardElement) {
        ui.enableGameButtons();
        console.log("renderInitialDeck: Deck rendered successfully. Game buttons enabled.");
    } else {
        ui.disableGameButtons();
        console.log("renderInitialDeck: Deck rendered but no active card found. Game buttons disabled.");
    }
}

// Update Visual Stack
function updateStackTransforms() {
    const opacityDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-opacity-decrement')) || 0.15;
    const offsetY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-offset-y')) || 4;
    const scaleDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-scale-decrement')) || 0.04;
    const tiltAngle = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-tilt-angle')) || 3;

    state.deckCards.forEach((card, index) => {
        const positionFromTop = index;
        let translateY = 0;
        let scale = 1;
        let rotate = 0;
        let opacity = 1;
        let zIndex = state.deckCards.length - positionFromTop;

        if (positionFromTop > 0) {
            if (positionFromTop <= MAX_VISIBLE_STACK_CARDS) {
                translateY = positionFromTop * offsetY;
                scale = 1 - (positionFromTop * scaleDecrement);
                if (positionFromTop === 1) {
                    rotate = tiltAngle;
                }
                opacity = 1 - (positionFromTop * opacityDecrement);
                opacity = Math.max(0, opacity);
            } else {
                opacity = 0;
                translateY = MAX_VISIBLE_STACK_CARDS * offsetY;
                scale = 1 - (MAX_VISIBLE_STACK_CARDS * scaleDecrement);
                zIndex = 0;
            }
        }

        ui.setCardTransform(card, translateY, scale, rotate);
        ui.setCardOpacity(card, opacity);
        ui.setCardZIndex(card, zIndex);
    });
}

// --- Swipe Logic Handlers ---

function handleSwipeDecision(direction) {
    if (!state.activeCardElement || !state.isGameActive || state.localUserFinishedSwiping) {
        console.log("Swipe ignored: Game inactive or local user already finished swiping.");
        if (state.isDragging) {
            ui.removeCardClass(state.activeCardElement, 'dragging');
            updateStackTransforms(); // Reset transform
        }
        return;
    }

    const cardToRemove = state.activeCardElement;
    const movieId = cardToRemove.dataset.movieId;

    const swipeSent = socketHandlers.emitSwipe(movieId, direction === 'right' ? 'like' : 'dislike');
    if (!swipeSent) {
        console.warn("Swipe emit failed: snapping card back.");
        updateStackTransforms(); // Snap back if failed to send
        return;
    }

    // Update client state immediately
    const newDeckCards = state.deckCards.filter(card => card !== cardToRemove);
    setDeckCards(newDeckCards);
    setActiveCard(state.deckCards[0] || null);

    // Animate card out visually using UI module
    ui.removeCardClass(cardToRemove, 'dragging');
    ui.removeCardClass(cardToRemove, 'show-like');
    ui.removeCardClass(cardToRemove, 'show-dislike');
    ui.addCardClass(cardToRemove, direction === 'right' ? 'gone-right' : 'gone-left');

    updateStackTransforms();

    if (state.deckCards.length === 0) {
        console.log("Local user has finished swiping all cards.");
        state.localUserFinishedSwiping = true;
        ui.disableGameButtons();
        ui.showGameLoadingIndicator("You finished! Waiting for opponent...");
    } else {
        ui.enableGameButtons();
    }

    ui.addCardTransitionEndListener(cardToRemove, () => {
        ui.removeCardFromDOM(cardToRemove);
        // *** No longer call displayEndMessageUI here ***
    });
}

function handleEndDrag(e) {
    if (!state.isDragging || !state.activeCardElement || !state.isGameActive) {
        return;
    }

    state.isDragging = false;
    ui.removeDocumentDragListeners(handleDrag, handleEndDrag);

    ui.updateBackgroundGlowUI(0, 0);
    ui.removeCardClass(state.activeCardElement, 'show-like');
    ui.removeCardClass(state.activeCardElement, 'show-dislike');

    const decisionMade = Math.abs(state.deltaX) > SWIPE_THRESHOLD;

    if (decisionMade) {
        const direction = state.deltaX > 0 ? 'right' : 'left';
        handleSwipeDecision(direction);
    } else {
        ui.removeCardClass(state.activeCardElement, 'dragging');
        updateStackTransforms();
    }

    state.deltaX = 0;
}

function handleDrag(e) {
    if (!state.isDragging || !state.activeCardElement || !state.isGameActive) {
        return;
    }

    state.currentX = e.pageX || (e.touches && e.touches[0] && e.touches[0].pageX) || 0;
    state.currentY = e.pageY || (e.touches && e.touches[0] && e.touches[0].pageY) || 0;

    if (e.type === 'touchmove') {
        if (Math.abs(state.currentX - state.startX) > Math.abs(state.currentY - state.startY) + 10) {
            e.preventDefault();
        }
    }

    state.deltaX = state.currentX - state.startX;
    const rotateDeg = state.deltaX * 0.1;

    if (state.activeCardElement) {
        state.activeCardElement.style.transform = `translateX(${state.deltaX}px) rotate(${rotateDeg}deg)`;
    }

    if (state.deltaX > 10) {
        ui.addCardClass(state.activeCardElement, 'show-like');
        ui.removeCardClass(state.activeCardElement, 'show-dislike');
    } else if (state.deltaX < -10) {
        ui.addCardClass(state.activeCardElement, 'show-dislike');
        ui.removeCardClass(state.activeCardElement, 'show-like');
    } else {
        ui.removeCardClass(state.activeCardElement, 'show-like');
        ui.removeCardClass(state.activeCardElement, 'show-dislike');
    }

    const swipeRatio = Math.min(Math.abs(state.deltaX) / (SWIPE_THRESHOLD * 1.5), 1);
    const glowOpacity = swipeRatio * 0.6;

    let glowHue = 0;
    const likeHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-like-hue')) || 120;
    const dislikeHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-dislike-hue')) || 0;

    if (state.deltaX > 10) {
        glowHue = likeHue;
    } else if (state.deltaX < -10) {
        glowHue = dislikeHue;
    }

    ui.updateBackgroundGlowUI(glowHue, glowOpacity);
}

function handleStartDrag(e) {
    if (!state.activeCardElement || e.currentTarget !== state.activeCardElement || state.isDragging || !state.isGameActive) {
        return;
    }

    state.isDragging = true;
    ui.addCardClass(state.activeCardElement, 'dragging');

    state.startX = e.pageX || (e.touches && e.touches[0] && e.touches[0].pageX) || 0;
    state.startY = e.pageY || (e.touches && e.touches[0] && e.touches[0].pageY) || 0;

    ui.setupDocumentDragListeners(handleDrag, handleEndDrag);

    if (e.type === 'mousedown') {
        e.preventDefault();
    }
}

// --- Event Handlers for UI Buttons ---

function onCopy() {
    const roomCodeInput = document.getElementById('roomCodeInput');
    if (!roomCodeInput) {
        console.warn('onCopy: roomCodeInput element not found.');
        return;
    }

    const codeToCopy = roomCodeInput.value;
    if (!codeToCopy) {
        console.warn('onCopy: No room code to copy.');
        return;
    }

    navigator.clipboard.writeText(codeToCopy).then(() => {
        console.log(`Room code copied to clipboard: ${codeToCopy}`);
        ui.showCopyFeedback();
        ui.updateStatusBanner(`Copied Room Code: ${codeToCopy}!`, 'success', 2000);
    }).catch(err => {
        console.error('Failed to copy room code:', err);
        ui.updateStatusBanner('Failed to copy code!', 'error', 3000);
    });
}

function onRetryConnection() {
    console.log("Retry connection button clicked.");
    socketHandlers.connectToServer();
}

function onCreateRoom() {
    const username = ui.getUsernameValue();
    const success = socketHandlers.emitCreateRoom(username);

    if (success) {
        ui.displayRoomMessage("Creating room...");
        ui.disableRoomButtons();
    } else {
        ui.displayRoomMessage("Not connected to server.", true);
    }
}

function onJoinRoom() {
    const roomCode = ui.getRoomCodeValue();
    const username = ui.getUsernameValue();

    if (!roomCode || roomCode.length !== 4) {
        ui.displayRoomMessage("Please enter a valid 4-character room code.", true);
        return;
    }

    const success = socketHandlers.emitJoinRoom(roomCode, username);

    if (success) {
        ui.displayRoomMessage(`Joining room ${roomCode}...`);
        ui.disableRoomButtons();
    } else {
        ui.displayRoomMessage("Not connected to server.", true);
    }
}

function onLike() {
    if (!state.activeCardElement || state.isDragging || !state.isGameActive || state.localUserFinishedSwiping) {
        return;
    }
    handleSwipeDecision('right');
}

function onDislike() {
    if (!state.activeCardElement || state.isDragging || !state.isGameActive || state.localUserFinishedSwiping) {
        return;
    }
    handleSwipeDecision('left');
}

function onPlayAgain() {
    console.log("Play Again button clicked.");
    resetRoomState();
    ui.showRoom();
    ui.updateStatusBanner("Create or join a new room to play again!", 'info', 4000);
}

// --- Initialization ---

function initializeApp() {
    console.log("Initializing application...");

    ui.setupRetryListener(onRetryConnection);
    ui.setupCreateRoomListener(onCreateRoom);
    ui.setupJoinRoomListener(onJoinRoom);
    ui.setupCopyCodeListener(onCopy);
    ui.setupGameButtonListeners(onLike, onDislike);

    const playAgainBtn = document.getElementById('play-again-btn');
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', onPlayAgain);
    }

    resetRoomState();

    ui.disableGameButtons();
    ui.hideStatusBanner();

    // *** ENSURE THIS LINE IS REMOVED ***
    // ui.hideBanner(); // REMOVE THIS CALL
    // *********************************

    socketHandlers.connectToServer();
}

// --- Start the application ---
initializeApp();