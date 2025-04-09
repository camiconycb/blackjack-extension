chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ hands: { player: [], dealer: [] } });
});
chrome.runtime.onInstalled.addListener(() => {
  fetchToken();
});

async function fetchToken() {
  try {
    const response = await fetch('https://blackjack-backend-production.up.railway.app/get-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error del servidor: ${response.status}`);
    }

    const data = await response.json();
    chrome.storage.local.set({ secretToken: data.token });
  } catch (error) {
    console.error('Error obteniendo el token:', error);
  }
}

async function getStoredToken() {
  const { secretToken } = await chrome.storage.local.get('secretToken');
  return secretToken;
}


