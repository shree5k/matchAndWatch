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

export function showConnecting() {
    updateConnectionStatus('connecting', 'Connecting to server...', false, true);
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
    if(connectionStatusDiv) connectionStatusDiv.style.display = 'none';
    if(roomUI) roomUI.style.display = 'flex';
    if(gameArea) gameArea.style.display = 'none';
    if(matchesSection) matchesSection.style.display = 'none';
    // Clear game area content safely
    if(cardContainer) {
        const existingCards = cardContainer.querySelectorAll('.card');
        existingCards.forEach(card => card.remove());
        if (gameLoadingIndicator) {
            gameLoadingIndicator.textContent = 'Waiting for game to start...';
            gameLoadingIndicator.style.display = 'block';
        }
    }
    // Reset match display
    resetMatchDisplayUI();
    // Reset room elements
    if(roomCodeInput) roomCodeInput.value = ''; if(roomCodeInput) roomCodeInput.readOnly = false;
    if(copyCodeBtn) copyCodeBtn.style.display = 'none';
    if(joinRoomBtn) joinRoomBtn.title = '';
    displayRoomMessage('');
    enableRoomButtons();
    disableGameButtons();
}

export function showGame(showLoading = true, loadingText = 'Waiting for opponent...', isGameTrulyActive = false) {
     console.log(`UI: showGame, showLoading: ${showLoading}, isGameTrulyActive: ${isGameTrulyActive}`);
     if(connectionStatusDiv) connectionStatusDiv.style.display = 'none';
     if(roomUI) roomUI.style.display = 'none';
     if(gameArea) gameArea.style.display = 'block';
     if (gameLoadingIndicator) {
         // Use the passed flag to decide visibility
         if (showLoading && !isGameTrulyActive) {
             gameLoadingIndicator.textContent = loadingText;
             gameLoadingIndicator.style.display = 'block';
             console.log("showGame: Showing loading indicator");
         } else {
             gameLoadingIndicator.style.display = 'none';
              console.log("showGame: Hiding loading indicator");
         }
     }
     hideStatusBanner();
     disableRoomButtons();
     // Game buttons enabled when cards render
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
export function getActiveCardElementFromDOM() {
    const cardsInDOM = cardContainer?.querySelectorAll('.card');
    return cardsInDOM ? cardsInDOM[cardsInDOM.length - 1] : null;
}

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
    showGame(true, `Joined Room ${roomCode}. Waiting for opponent...`, false); // Pass false for isGameTrulyActive
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

export function displayEndMessageUI(finalCount) {
     if (gameLoadingIndicator) {
         gameLoadingIndicator.textContent = `All movies swiped! You got ${finalCount} match${finalCount !== 1 ? 'es' : ''}. Check below!`;
         gameLoadingIndicator.style.display = 'block';
     }
     const cardContainer = getCardContainer();
     if(cardContainer) {
         const existingCards = cardContainer.querySelectorAll('.card');
         existingCards.forEach(card => card.remove());
     }
     disableGameButtons();
     showFinalMatchDisplay(finalCount, true);
}

// --- Card Stack Visuals ---
export function setCardTransform(card, translateY, scale, rotate) { if(card) card.style.transform = `translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`; }
export function setCardOpacity(card, opacity) { if(card) card.style.opacity = opacity; }
export function setCardZIndex(card, zIndex) { if(card) card.style.zIndex = zIndex; }
export function addCardClass(card, className) { card?.classList.add(className); }
export function removeCardClass(card, className) { card?.classList.remove(className); }
export function resetCardTransformStyle(card) { if(card) card.style.transform = ''; }

// --- Background Glow ---
export function updateBackgroundGlowUI(glowHue, glowOpacity) {
     document.documentElement.style.setProperty('--current-glow-hue', glowHue);
     document.documentElement.style.setProperty('--glow-opacity', glowOpacity);
}

// --- Setup for UI Listeners ---
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