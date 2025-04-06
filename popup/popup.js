const SUITS = ['♣', '♦', '♥', '♠'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const API_ENDPOINT = 'https://blackjack-backend-production.up.railway.app/api/advice';
const CARD_IMAGES_PATH = 'cards/';
const REQUEST_DELAY = 3000;

let currentHand = null;
let currentMode = 'add';
let hands = { player: [], dealer: [] };
let lastRequestTime = 0;
const requestCache = new Map();


document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] DOM Content Loaded');
    initializeApp();
});

async function initializeApp() {
    try {
        await loadSavedHands();
        setupEventListeners();
        generateCardGrid();
        updateUI();
        console.log('[Init] Aplicación lista');
    } catch (error) {
        console.error('[Init Error]', error);
    }
}

async function loadSavedHands() {
    console.log('[Storage] Cargando manos...');
    const result = await chrome.storage.local.get(['hands']);
    if (result.hands) {
        hands = result.hands;
        console.log('[Storage] Manos cargadas:', hands);
    }
}

function setupEventListeners() {
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', handleAddCardClick);
    });

    document.getElementById('consult-btn').addEventListener('click', handleConsultClick);
    document.getElementById('clear-btn').addEventListener('click', handleClearClick);

    document.querySelector('.close-modal').addEventListener('click', closeModal);
    window.addEventListener('click', handleOutsideModalClick);

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', handleModeChange);
    });
}

function handleAddCardClick(event) {
    currentHand = event.currentTarget.dataset.hand;
    console.log(`[Event] Add Card to ${currentHand}`);
    showModal();
}

function handleConsultClick() {
    if (Date.now() - lastRequestTime < REQUEST_DELAY) {
        const waitTime = Math.ceil((REQUEST_DELAY - (Date.now() - lastRequestTime)) / 1000);
        showError(`Espere ${waitTime} segundos entre consultas`);
        return;
    }
    console.log('[Event] Consultar estrategia');
    consultStrategy();
}

function handleClearClick() {
    console.log('[Event] Limpiar manos');
    hands = { player: [], dealer: [] };
    requestCache.clear();
    saveHands();
    updateUI();
    hideResult();
}

function handleModeChange(event) {
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    currentMode = event.target.dataset.mode;
    console.log(`[Mode] Cambiado a: ${currentMode}`);
}

function handleOutsideModalClick(event) {
    if (event.target === document.getElementById('card-modal')) {
        closeModal();
    }
}

function generateCardGrid() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';

    SUITS.forEach(suit => {
        VALUES.forEach(value => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card-option';
            cardElement.innerHTML = `
                <img src="${getCardImagePath(value, suit)}" 
                     alt="${value}${suit}" 
                     data-value="${value}" 
                     data-suit="${suit}"
                     class="card-grid-img">
            `;
            cardElement.addEventListener('click', handleCardSelect);
            grid.appendChild(cardElement);
        });
    });
}

function handleCardSelect(event) {
    const cardImage = event.target.closest('img');
    const value = cardImage.dataset.value;
    const suit = cardImage.dataset.suit;
    
    if (currentMode === 'replace' && hands[currentHand].length > 0) {
        hands[currentHand][hands[currentHand].length - 1] = { value, suit };
    } else {
        hands[currentHand].push({ value, suit });
    }
    
    saveHands();
    updateUI();
    closeModal();
}

function updateUI() {
    updateHandDisplay('player');
    updateHandDisplay('dealer');
    updateTotals();
}

function updateHandDisplay(handType) {
    const container = document.getElementById(`${handType}-cards`);
    container.innerHTML = hands[handType]
        .map(card => `
            <div class="card">
                <img src="${getCardImagePath(card.value, card.suit)}" 
                     alt="${card.value}${card.suit}">
            </div>
        `).join('');
}

function updateTotals() {
    document.getElementById('player-total').textContent = calculateHandTotal(hands.player);
    document.getElementById('dealer-total').textContent = calculateHandTotal(hands.dealer);
}

function calculateHandTotal(hand) {
    let total = 0;
    let aces = 0;

    hand.forEach(card => {
        const value = getCardValue(card.value);
        if (value === 11) aces++;
        total += value;
    });

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function getCardValue(value) {
    if (['J', 'Q', 'K'].includes(value)) return 10;
    if (value === 'A') return 11;
    return parseInt(value);
}

function getCardImagePath(value, suit) {
    const suitFolderMap = {
        '♣': 'clubs',
        '♦': 'diamonds',
        '♥': 'hearts',
        '♠': 'spades'
    };
    return chrome.runtime.getURL(`${CARD_IMAGES_PATH}${suitFolderMap[suit]}/${value}.png`);
}

async function saveHands() {
    await chrome.storage.local.set({ hands });
}

function showModal() {
    document.getElementById('card-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('card-modal').style.display = 'none';
}

async function consultStrategy() {
    try {
        if (hands.player.length < 2) throw new Error('Añade al menos 2 cartas');
        if (hands.dealer.length < 1) throw new Error('Añade carta del crupier');

        showLoading(); // Mostrar animación de carga
        const advice = await fetchAdvice();
        hideLoading(); // Ocultar animación de carga
        displayAdvice(advice);
        lastRequestTime = Date.now();
    } catch (error) {
        hideLoading(); // Ocultar animación en caso de error
        showError(error.message);
    }
}

async function fetchAdvice() {
    const cacheKey = generateCacheKey();
    if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);
    const token = await getStoredToken();
    const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',  'Authorization': `Bearer ${token}`, },
        body: JSON.stringify({
            player: hands.player.map(c => c.value),
            dealer: hands.dealer.map(c => c.value),
            gameRules: {
                dasAllowed: true,
                surrenderAllowed: true,
                decks: 6
            }
        })
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    
    const data = await response.json();
    requestCache.set(cacheKey, data.action);
    return data.action;
}

function displayAdvice(advice) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="advice ${advice.toLowerCase()}">
            <h3>Acción Recomendada:</h3>
            <div class="action">${advice}</div>
        </div>
    `;
    resultDiv.style.display = 'block';
}

function showError(message) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="error">
            <i class="fas fa-exclamation-triangle"></i>
            ${message}
        </div>
    `;
    resultDiv.style.display = 'block';
}

function hideResult() {
    document.getElementById('result').style.display = 'none';
}

function generateCacheKey() {
    return `${hands.player.map(c => c.value).join(',')}|${hands.dealer.map(c => c.value).join(',')}`;
}

function showLoading() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <div class="loading-text">Consultando estrategia...</div>
        </div>
    `;
    resultDiv.style.display = 'block';
}

function hideLoading() {
    const resultDiv = document.getElementById('result');
    resultDiv.style.display = 'none';
}

async function getStoredToken() {
    const { secretToken } = await chrome.storage.local.get('secretToken');
    return secretToken;
  }
  