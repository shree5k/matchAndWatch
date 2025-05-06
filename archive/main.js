import * as ui from './ui.js';
import * as socketHandlers from './socket.js';

// --- Configuration Constants ---
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'; // Keep image base here
const MAX_VISIBLE_STACK_CARDS = 3;
const SWIPE_THRESHOLD = 80;
const BACKEND_URL = 'https://matchandwatch-bjvh.onrender.com'; // Keep backend URL here too
// const BACKEND_URL = 'http://localhost:3001';

// --- Application State (Exported) ---
export const state = {
    socket: null,
    currentRoomCode: null,
    isGameActive: false,
    currentCardsData: [],
    deckCards: [], // Holds the card *elements*
    activeCardElement: null, // Holds the top card *element*
    totalMatches: 0,
    matchedTitles: [],
    // Drag state (local to this module is fine)
    isDragging: false,
    startX: 0, startY: 0, currentX: 0, currentY: 0, deltaX: 0,
    // Config constants available via state if needed elsewhere
    BACKEND_URL: BACKEND_URL,
    IMAGE_BASE_URL: IMAGE_BASE_URL
};

// --- State Setters (Exported) ---
export function setSocket(newSocket) { state.socket = newSocket; }
export function setRoomCode(code) { state.currentRoomCode = code; }
export function setGameActive(active) { state.isGameActive = active; }
export function setCardsData(data) { state.currentCardsData = data ? [...data] : []; }
export function setDeckCards(cards) { state.deckCards = cards ? [...cards] : []; }
export function setActiveCard(card) { state.activeCardElement = card; }
export function addMatchTitle(title) { state.totalMatches++; state.matchedTitles.push(title); }
export function resetMatchState() { state.totalMatches = 0; state.matchedTitles = []; }
export function resetDeckState() { state.currentCardsData = []; state.deckCards = []; state.activeCardElement = null; }
export function resetGameState() { resetDeckState(); resetMatchState(); state.isGameActive = false; }
export function resetRoomState() { resetGameState(); state.currentRoomCode = null; }


// --- Core Game Functions ---

// Card Creation
function createCardElement(movie) {
    const card = document.createElement('div'); card.classList.add('card'); card.dataset.movieId = movie.id;
    const img = document.createElement('img'); img.src = `${state.IMAGE_BASE_URL}${movie.poster_path}`; img.alt = `Poster for ${movie.title}`; img.loading = 'lazy';
    img.onerror = () => { console.warn(`Failed to load image: ${img.src}`); img.remove(); };
    card.appendChild(img);
    // Attach swipe listeners defined below
    ui.setupCardDragListeners(card, handleStartDrag);
    return card;
}

// Card Rendering & Stacking (Exported for socket.js)
export function renderInitialDeck() {
    const cardContainer = ui.getCardContainer();
    if (!cardContainer) { console.error("renderInitialDeck: cardContainer not found."); return; }
    console.log("renderInitialDeck called.");

    ui.hideGameLoadingIndicator(); // Ensure hidden

    // Remove ONLY card elements
    const existingCards = cardContainer.querySelectorAll('.card');
    console.log(`renderInitialDeck: Removing ${existingCards.length} existing cards.`);
    existingCards.forEach(card => card.remove());
    setDeckCards([]); // Reset JS element array

    if (!state.currentCardsData || state.currentCardsData.length === 0) {
        console.log("renderInitialDeck: No cards data to render.");
        ui.showGameLoadingIndicator('No movies loaded.');
        ui.disableGameButtons(); return;
    }

    // Render new cards
    console.log(`renderInitialDeck: Rendering ${state.currentCardsData.length} new cards.`);
    const newDeckElements = state.currentCardsData.map(createCardElement).reverse();
    newDeckElements.forEach(card => { cardContainer.appendChild(card); });

    setDeckCards(newDeckElements.slice().reverse()); // Store in state
    setActiveCard(state.deckCards[0] || null); // Set top card state

    updateStackTransforms(); // Apply initial visuals

    if (state.activeCardElement) {
        ui.enableGameButtons();
        console.log("renderInitialDeck: Deck rendered, buttons enabled.");
    } else {
        ui.disableGameButtons();
        console.log("renderInitialDeck: Deck rendered, but no active card?");
    }
}

// Update Visual Stack
function updateStackTransforms() {
    const opacityDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-opacity-decrement')) || 0.15;
    const offsetY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-offset-y')) || 4;
    const scaleDecrement = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-scale-decrement')) || 0.04;
    const tiltAngle = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-tilt-angle')) || 3;

    state.deckCards.forEach((card, index) => {
        const positionFromTop = index; let translateY = 0; let scale = 1; let rotate = 0; let opacity = 1; let zIndex = state.deckCards.length - positionFromTop;
        if (positionFromTop > 0) {
            if (positionFromTop <= MAX_VISIBLE_STACK_CARDS) {
                translateY = positionFromTop * offsetY; scale = 1 - (positionFromTop * scaleDecrement); if (positionFromTop === 1) { rotate = tiltAngle; } opacity = 1 - (positionFromTop * opacityDecrement); opacity = Math.max(0, opacity);
            } else { opacity = 0; translateY = MAX_VISIBLE_STACK_CARDS * offsetY; scale = 1 - (MAX_VISIBLE_STACK_CARDS * scaleDecrement); zIndex = 0; }
        }
        // Use UI functions to modify card style
        ui.setCardTransform(card, translateY, scale, rotate);
        ui.setCardOpacity(card, opacity);
        ui.setCardZIndex(card, zIndex);
    });
}

// --- Swipe Logic Handlers ---

function handleSwipeDecision(direction) {
    if (!state.activeCardElement || !state.isGameActive) return;

    const cardToRemove = state.activeCardElement;
    const movieId = cardToRemove.dataset.movieId;

    const swipeSent = socketHandlers.emitSwipe(movieId, direction === 'right' ? 'like' : 'dislike');
    if (!swipeSent) {
        updateStackTransforms(); return; // Snap back if failed
    }

    // Update Client State Immediately
    const newDeckCards = state.deckCards.filter(card => card !== cardToRemove);
    setDeckCards(newDeckCards);
    setActiveCard(state.deckCards[0] || null);

    // Animate card out visually
    ui.removeCardClass(cardToRemove, 'dragging'); ui.removeCardClass(cardToRemove, 'show-like'); ui.removeCardClass(cardToRemove, 'show-dislike');
    ui.addCardClass(cardToRemove, direction === 'right' ? 'gone-right' : 'gone-left');

    updateStackTransforms(); // Update remaining cards

    if (!state.activeCardElement) ui.disableGameButtons(); else ui.enableGameButtons();

    ui.addCardTransitionEndListener(cardToRemove, () => {
        ui.removeCardFromDOM(cardToRemove);
        if (state.deckCards.length === 0) { ui.displayEndMessageUI(state.totalMatches); }
    });

    if (state.deckCards.length === 0) {
        setTimeout(() => {
            const cardContainer = ui.getCardContainer();
            if (cardContainer && cardContainer.querySelectorAll('.card').length === 0) {
                ui.displayEndMessageUI(state.totalMatches);
            }
        }, 600);
    }
}


function handleEndDrag(e) {
    if (!state.isDragging || !state.activeCardElement || !state.isGameActive) return;
    state.isDragging = false;
    ui.removeDocumentDragListeners(handleDrag, handleEndDrag); // Use named handlers

    ui.updateBackgroundGlowUI(0, 0); // Reset page glow
    ui.removeCardClass(state.activeCardElement, 'show-like');
    ui.removeCardClass(state.activeCardElement, 'show-dislike');

    const decisionMade = Math.abs(state.deltaX) > SWIPE_THRESHOLD;
    if (decisionMade) {
        const direction = state.deltaX > 0 ? 'right' : 'left';
        handleSwipeDecision(direction);
    } else { // Snap back
        ui.removeCardClass(state.activeCardElement, 'dragging');
        updateStackTransforms(); // Reset transform
    }
    state.deltaX = 0; // Reset delta
}

function handleDrag(e) {
    if (!state.isDragging || !state.activeCardElement || !state.isGameActive) return;
    state.currentX = e.pageX || e.touches[0].pageX;
    state.currentY = e.pageY || e.touches[0].pageY;
    if (e.type === 'touchmove') { if (Math.abs(state.currentX - state.startX) > Math.abs(state.currentY - state.startY) + 10) e.preventDefault(); }
    state.deltaX = state.currentX - state.startX;
    const rotateDeg = state.deltaX * 0.1;
    state.activeCardElement.style.transform = `translateX(${state.deltaX}px) rotate(${rotateDeg}deg)`; // Apply transform directly
    // Update visual indicators
    if (state.deltaX > 10) { ui.addCardClass(state.activeCardElement, 'show-like'); ui.removeCardClass(state.activeCardElement, 'show-dislike'); }
    else if (state.deltaX < -10) { ui.addCardClass(state.activeCardElement, 'show-dislike'); ui.removeCardClass(state.activeCardElement, 'show-like'); }
    else { ui.removeCardClass(state.activeCardElement, 'show-like'); ui.removeCardClass(state.activeCardElement, 'show-dislike'); }
    // Update page glow
    const swipeRatio = Math.min(Math.abs(state.deltaX) / (SWIPE_THRESHOLD * 1.5), 1);
    const glowOpacity = swipeRatio * 0.6;
    let glowHue = 0;
    const likeHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-like-hue')) || 120;
    const dislikeHue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-color-dislike-hue')) || 0;
    if (state.deltaX > 10) glowHue = likeHue; else if (state.deltaX < -10) glowHue = dislikeHue;
    ui.updateBackgroundGlowUI(glowHue, glowOpacity);
}

function handleStartDrag(e) {
    // Prevent drag if game not active or target isn't the top card element
    if (!state.activeCardElement || e.currentTarget !== state.activeCardElement || state.isDragging || !state.isGameActive) return;
    state.isDragging = true;
    ui.addCardClass(state.activeCardElement, 'dragging');
    state.startX = e.pageX || e.touches[0].pageX;
    state.startY = e.pageY || e.touches[0].pageY;
    // Add listeners to document
    ui.setupDocumentDragListeners(handleDrag, handleEndDrag);
    if (e.type === 'mousedown') e.preventDefault();
}


// --- Event Handlers for UI Buttons ---
function onCopy() {
    const roomCodeInput = document.getElementById('roomCodeInput');
    if (!roomCodeInput) return;
    const codeToCopy = roomCodeInput.value;
    if (!codeToCopy) return;
    navigator.clipboard.writeText(codeToCopy).then(() => {
        console.log('Room code copied:', codeToCopy);
        ui.showCopyFeedback();
        ui.updateStatusBanner(`Copied Room Code: ${codeToCopy}!`, 'success', 2000);
    }).catch(err => {
        console.error('Failed to copy code:', err);
        ui.updateStatusBanner('Failed to copy code!', 'error', 3000);
    });
}

function onRetryConnection() {
    console.log("Retry button clicked.");
    socketHandlers.connectToServer();
}

function onCreateRoom() {
    const username = ui.getUsernameValue();
    const success = socketHandlers.emitCreateRoom(username);
    if (success) { ui.displayRoomMessage("Creating room..."); ui.disableRoomButtons(); }
    else { ui.displayRoomMessage("Not connected to server.", true); }
}

function onJoinRoom() {
    const roomCode = ui.getRoomCodeValue();
    const username = ui.getUsernameValue();
    if (!roomCode || roomCode.length !== 4) { ui.displayRoomMessage("Please enter a valid 4-character room code.", true); return; }
    const success = socketHandlers.emitJoinRoom(roomCode, username);
    if (success) { ui.displayRoomMessage(`Joining room ${roomCode}...`); ui.disableRoomButtons(); }
    else { ui.displayRoomMessage("Not connected to server.", true); }
}

function onLike() {
    if (!state.activeCardElement || state.isDragging || !state.isGameActive) return;
    handleSwipeDecision('right');
}

function onDislike() {
    if (!state.activeCardElement || state.isDragging || !state.isGameActive) return;
    handleSwipeDecision('left');
}

// --- Initialization ---
function initializeApp() {
    console.log("Initializing app...");
    // Setup essential UI listeners by passing handler functions
    ui.setupRetryListener(onRetryConnection);
    ui.setupCreateRoomListener(onCreateRoom);
    ui.setupJoinRoomListener(onJoinRoom);
    ui.setupCopyCodeListener(onCopy);
    ui.setupGameButtonListeners(onLike, onDislike);

    // Initial UI state
    ui.disableGameButtons();
    ui.hideStatusBanner(); // Call ui.hideStatusBanner

    // Start the connection process
    socketHandlers.connectToServer();
}

// --- Start the application ---
initializeApp();