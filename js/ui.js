import { state } from './main.js';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'; // Make sure this is defined or imported

// --- DOM Element Queries ---
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
const roomMessage = document.getElementById('room-message');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const statusBanner = document.getElementById('status-banner');
const gameOverContainer = document.getElementById('game-over-results');


// Use optional chaining for elements inside potentially hidden containers
const cardContainer = gameArea?.querySelector('.card-container');
const likeBtn = gameArea?.querySelector('#likeBtn');
const dislikeBtn = gameArea?.querySelector('#dislikeBtn');
const gameLoadingIndicator = gameArea?.querySelector('.loading-indicator');

const matchesSection = document.querySelector('.matches-section');
const latestMatchDisplay = document.getElementById('latest-match-display');
const matchCounterContainer = document.getElementById('match-counter-container');
const matchCountSpan = document.getElementById('match-count');

let bannerTimeoutId = null;
let matchHighlightTimeoutId = null;

// --- Exported UI Functions ---

export function updateConnectionStatus(status, message, showRetry = false, showSpinner = true) {
    if (!connectionStatusDiv || !connectionMessage || !connectionSpinner || !retryConnectionBtn) { console.error("Connection status UI elements not found!"); return; }
    connectionMessage.textContent = message;
    connectionMessage.className = status === 'error' ? 'error' : '';
    connectionSpinner.style.display = showSpinner ? 'block' : 'none';
    retryConnectionBtn.style.display = showRetry ? 'block' : 'none';
    retryConnectionBtn.disabled = !showRetry;
    connectionStatusDiv.style.display = 'flex';
}

export function displayRoomMessage(message, isError = false) {
    if (!roomMessage) return;
    roomMessage.textContent = message;
    // Ensure base class is always present
    roomMessage.className = 'modal-message' + (isError ? ' error' : '');
    if (!isError && message.includes('Room Code:')) {
         roomMessage.className = 'modal-message success';
    }
}

export function updateStatusBanner(message, type = 'info', autoHideDelay = null) {
    if (!statusBanner) return;
    clearTimeout(bannerTimeoutId);
    statusBanner.textContent = message;
    statusBanner.className = `status-banner visible ${type}`;
    if (autoHideDelay && typeof autoHideDelay === 'number' && autoHideDelay > 0) {
        bannerTimeoutId = setTimeout(hideStatusBanner, autoHideDelay);
    }
}

export function hideStatusBanner() {
    if (!statusBanner) return;
    clearTimeout(bannerTimeoutId);
    statusBanner.classList.remove('visible');
}

// --- UI Switching ---
export function showConnecting() {
    updateConnectionStatus('connecting', 'Connecting to server...\n(This may take up to 30s on first load)', false, true);
    if(roomUI) roomUI.style.display = 'none';
    if(gameArea) gameArea.style.display = 'none';
    if(matchesSection) matchesSection.style.display = 'none';
    hideStatusBanner();
    disableRoomButtons();
    disableGameButtons();
}

export function showConnectionError(errorMessage) {
    updateConnectionStatus('error', errorMessage, true, false);
    if(roomUI) roomUI.style.display = 'none';
    if(gameArea) gameArea.style.display = 'none';
    if(matchesSection) matchesSection.style.display = 'none';
    hideStatusBanner();
    disableRoomButtons();
    disableGameButtons();
}

export function showRoom() {
    console.log("UI: showRoom");
    // Hide other UI sections, show room UI
    if (connectionStatusDiv) connectionStatusDiv.style.display = 'none';
    if (roomUI) roomUI.style.display = 'flex';
    if (gameArea) gameArea.style.display = 'none';
    if (matchesSection) matchesSection.style.display = 'none';

    // Clear game area content safely
    if (cardContainer) {
        const existingCards = cardContainer.querySelectorAll('.card');
        existingCards.forEach(card => card.remove());
        if (gameLoadingIndicator) {
            gameLoadingIndicator.textContent = 'Waiting for game to start...';
            gameLoadingIndicator.style.display = 'block';
        }
    }

    resetMatchDisplayUI();

    // Reset room input and related UI as a single block for clarity
    if (roomCodeInput) {
        roomCodeInput.value = '';
        roomCodeInput.readOnly = false;
    }
    if (copyCodeBtn) copyCodeBtn.style.display = 'none';
    if (joinRoomBtn) joinRoomBtn.title = '';
    displayRoomMessage('');
    enableRoomButtons();
    disableGameButtons();
    hideGameOverUI();
}

export function showGame(showLoading = true, loadingText = 'Waiting for opponent...') {
    console.log(`UI: showGame, showLoading: ${showLoading}`);
    if (connectionStatusDiv) connectionStatusDiv.style.display = 'none';
    if (roomUI) roomUI.style.display = 'none';
    if (gameArea) gameArea.style.display = 'block';

    // Handle loading indicator logic
    if (gameLoadingIndicator) {
        if (showLoading) {
            showGameLoadingIndicator(loadingText);
        } else {
            hideGameLoadingIndicator();
        }
    }
    hideStatusBanner();
    disableRoomButtons();
    // Game buttons enabled later by renderInitialDeck
    disableGameButtons();
}

export function hideGameLoadingIndicator() {
    if (gameLoadingIndicator) {
        console.log("UI: Hiding game loading indicator");
        gameLoadingIndicator.style.display = 'none';
    }
}

export function showGameLoadingIndicator(text = 'Loading...') {
    if (gameLoadingIndicator) {
        console.log(`UI: Showing game loading indicator with text: ${text}`);
        gameLoadingIndicator.textContent = text;
        gameLoadingIndicator.style.display = 'block';
    }
}

// --- Getters ---
export function getUsernameValue() { return usernameInput?.value.trim() || `Player_${Math.random().toString(36).substring(2, 6)}`; }
export function getRoomCodeValue() { return roomCodeInput?.value.trim().toUpperCase() || ''; }
export function getCardContainer() { return cardContainer; }

// --- Button State ---
export function disableGameButtons() { if(likeBtn) likeBtn.disabled = true; if(dislikeBtn) dislikeBtn.disabled = true; }
export function enableGameButtons() { if(likeBtn) likeBtn.disabled = false; if(dislikeBtn) dislikeBtn.disabled = false; }
export function disableRoomButtons() { if(createRoomBtn) createRoomBtn.disabled = true; if(joinRoomBtn) joinRoomBtn.disabled = true; }
export function enableRoomButtons() { if(createRoomBtn) createRoomBtn.disabled = false; if(joinRoomBtn) joinRoomBtn.disabled = false; }

// --- Specific Room UI Updates ---
export function updateRoomCreatedUI(roomCode) {
    displayRoomMessage(`Room Code: ${roomCode} - Share this code!`);
    if(roomCodeInput) { roomCodeInput.value = roomCode; roomCodeInput.readOnly = true; }
    if(copyCodeBtn) copyCodeBtn.style.display = 'flex';
    disableRoomButtons();
    if(joinRoomBtn) joinRoomBtn.title = 'Waiting for opponent...';
}

export function updateJoinedRoomUI(roomCode) {
    showGame(true, `Joined Room ${roomCode}. Waiting for opponent...`);
    displayRoomMessage('');
}

export function updateOpponentJoinedUI(username) {
    if (gameLoadingIndicator && gameArea?.style.display === 'block') {
        gameLoadingIndicator.textContent = `${username || 'Opponent'} joined! Starting...`;
    }
}

export function showCopyFeedback() {
    if (!copyCodeBtn) return;
    copyCodeBtn.classList.add('copied');
    setTimeout(() => { copyCodeBtn.classList.remove('copied'); }, 1500);
}

// --- Match Display UI ---
export function displayMatchUI(latestTitle, count, titlesList) {
    if (!matchesSection || !latestMatchDisplay || !matchCounterContainer || !matchCountSpan) return;
    matchesSection.style.display = 'flex';
    latestMatchDisplay.textContent = `✨ Match: ${latestTitle} ✨`;
    clearTimeout(matchHighlightTimeoutId);
    latestMatchDisplay.classList.remove('highlight-new-match');
    void latestMatchDisplay.offsetWidth;
    latestMatchDisplay.classList.add('highlight-new-match');
    matchHighlightTimeoutId = setTimeout(() => { latestMatchDisplay.classList.remove('highlight-new-match'); }, 1500);
    matchCountSpan.textContent = count;
    matchCounterContainer.title = `Matched Movies (${count}):\n- ${titlesList.join('\n- ')}`;
}

export function resetMatchDisplayUI() {
    if (latestMatchDisplay) latestMatchDisplay.textContent = '';
    if (matchCountSpan) matchCountSpan.textContent = '0';
    if (matchCounterContainer) matchCounterContainer.title = 'No matches yet';
    if (matchesSection) matchesSection.style.display = 'none';
    clearTimeout(matchHighlightTimeoutId);
    if(latestMatchDisplay) latestMatchDisplay.classList.remove('highlight-new-match');
}

export function showFinalMatchDisplay(finalCount, showEmptyMessage = false) {
     if (!matchesSection) return;
     matchesSection.style.display = 'flex';
     if (finalCount === 0 && showEmptyMessage && latestMatchDisplay) {
         latestMatchDisplay.textContent = 'No matches this round!';
     }
}

// --- Game Over UI Display ---
export function displayGameOverUI(finalCount, matchesArray, message = null) {
    // --- Game Over UI Display with detailed logging ---
    console.log(`UI: Displaying Game Over Screen`);
    console.log(`  > Received finalCount: ${finalCount}`);
    console.log(`  > Received matchesArray:`, matchesArray);

    // Group DOM queries for clarity
    const gameOverContainer = document.getElementById('game-over-results');
    const finalMatchesContainer = document.getElementById('final-matches-container');
    const gameOverHeading = document.getElementById('game-over-heading');

    if (!gameOverContainer || !finalMatchesContainer || !gameOverHeading) {
        console.error("Game Over UI elements not found!");
        // Fallback alert if elements missing
        alert(`Game Over! You got ${finalCount} match(es).`);
        return;
    }

    // Hide game area, matches section, room UI, connection UI; show game over area
    const gameArea = document.getElementById('game-area');
    const matchesSection = document.querySelector('.matches-section');
    if (gameArea) gameArea.style.display = 'none';
    if (matchesSection) matchesSection.style.display = 'none';
    if (roomUI) roomUI.style.display = 'none';
    if (connectionStatusDiv) connectionStatusDiv.style.display = 'none';
    gameOverContainer.style.display = 'flex';

    // Set heading text based on match count or custom message
    gameOverHeading.textContent = message || `Popcorn ready? You got ${finalCount} match!`;
    if (finalCount === 0) {
        gameOverHeading.textContent = "Game Over! No matches this round.";
    }

    // Clear previous posters
    finalMatchesContainer.innerHTML = '';

    // Populate posters or "no matches" message
    if (
        finalCount > 0 &&
        matchesArray &&
        Array.isArray(matchesArray) &&
        matchesArray.length > 0
    ) {
        console.log(`  > Populating ${matchesArray.length} matched posters...`);
        matchesArray.forEach((match, index) => {
            console.log(`  -> Processing match ${index + 1}:`, match);
            if (match && match.poster_path) {
                const img = document.createElement('img');
                img.src = `${IMAGE_BASE_URL}${match.poster_path}`;
                img.alt = match.title || 'Matched Movie Poster';
                img.title = match.title || 'Matched Movie';
                img.loading = 'lazy';
                finalMatchesContainer.appendChild(img);
                console.log(`    Added image for: ${match.title}`);
            } else {
                console.warn(`  -> Match object or poster_path missing for match at index ${index}:`, match);
            }
        });
    } else {
        console.log("  > No matches to display, showing 'No matches' message.");
        finalMatchesContainer.innerHTML = '<p class="no-matches-message">No movies matched this time!</p>';
    }

    disableGameButtons(); // Ensure game buttons remain disabled
}

// --- Card Stack Visuals ---
export function setCardTransform(card, translateY, scale, rotate) { if(card) card.style.transform = `translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`; }
export function setCardOpacity(card, opacity) { if(card) card.style.opacity = opacity; }
export function setCardZIndex(card, zIndex) { if(card) card.style.zIndex = zIndex; }
export function addCardClass(card, className) { card?.classList.add(className); }
export function removeCardClass(card, className) { card?.classList.remove(className); }
// updateStackTransforms in main.js handles snapback visually

// --- Background Glow ---
export function updateBackgroundGlowUI(glowHue, glowOpacity) {
     document.documentElement.style.setProperty('--current-glow-hue', glowHue);
     document.documentElement.style.setProperty('--glow-opacity', glowOpacity);
}

// --- Setup for UI Listeners (Called by main.js) ---
export function setupRetryListener(handler) { if(retryConnectionBtn) retryConnectionBtn.addEventListener('click', handler); }
export function setupCreateRoomListener(handler) { if(createRoomBtn) createRoomBtn.addEventListener('click', handler); }
export function setupJoinRoomListener(handler) { if(joinRoomBtn) joinRoomBtn.addEventListener('click', handler); }
export function setupCopyCodeListener(handler) { if(copyCodeBtn) copyCodeBtn.addEventListener('click', handler); }
export function setupGameButtonListeners(likeHandler, dislikeHandler) { if(likeBtn) likeBtn.addEventListener('click', likeHandler); if(dislikeBtn) dislikeBtn.addEventListener('click', dislikeHandler); }
export function setupCardDragListeners(card, startHandler) { if(card) { card.addEventListener('mousedown', startHandler); card.addEventListener('touchstart', startHandler, { passive: true }); } }
export function setupDocumentDragListeners(dragHandler, endHandler) {
    document.addEventListener('mousemove', dragHandler); document.addEventListener('mouseup', endHandler); document.addEventListener('mouseleave', endHandler);
    document.addEventListener('touchmove', dragHandler, { passive: false }); document.addEventListener('touchend', endHandler); document.addEventListener('touchcancel', endHandler);
}
export function removeDocumentDragListeners(dragHandler, endHandler) {
    document.removeEventListener('mousemove', dragHandler); document.removeEventListener('mouseup', endHandler); document.removeEventListener('mouseleave', endHandler);
    document.removeEventListener('touchmove', dragHandler); document.removeEventListener('touchend', endHandler); document.removeEventListener('touchcancel', endHandler);
}
export function addCardTransitionEndListener(card, handler) { card?.addEventListener('transitionend', handler, { once: true }); }
export function removeCardFromDOM(card) { card?.remove(); }

export function hideGameOverUI() {
    if (gameOverContainer) {
        console.log("UI: Hiding Game Over UI");
        gameOverContainer.style.display = 'none';
    }
}