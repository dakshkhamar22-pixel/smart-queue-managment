const API_BASE = '/api/tokens';
let currentTokenNumber = null;
let statusPollInterval = null;
let queuePollInterval = null;

// DOM Elements
const tokenForm = document.getElementById('token-form');
const tokenResult = document.getElementById('token-result');
const yourTokenNumber = document.getElementById('your-token-number');
const yourPosition = document.getElementById('your-position');
const yourWaitTime = document.getElementById('your-wait-time');
const yourStatus = document.getElementById('your-status');
const notificationArea = document.getElementById('notification-area');
const checkStatusBtn = document.getElementById('check-status-btn');
const checkBtn = document.getElementById('check-btn');
const checkTokenNumber = document.getElementById('check-token-number');

// Queue status elements
const currentlyServing = document.getElementById('currently-serving');
const nextInQueue = document.getElementById('next-in-queue');
const waitingCount = document.getElementById('waiting-count');
const waitingList = document.getElementById('waiting-list');

// Take a token
tokenForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();

  if (!name || !phone) return;

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to get token');
      return;
    }

    currentTokenNumber = data.token.tokenNumber;
    displayTokenInfo(data.token, data.positionInQueue, data.estimatedWaitMinutes);
    tokenForm.reset();

    // Start polling for this token's status
    startTokenStatusPoll();
  } catch (err) {
    alert('Error connecting to server');
  }
});

// Display token info
function displayTokenInfo(token, position, waitMinutes) {
  tokenResult.classList.remove('hidden');
  yourTokenNumber.textContent = `#${token.tokenNumber}`;
  yourPosition.textContent = position;
  yourWaitTime.textContent = waitMinutes;
  updateStatusBadge(token.status);
}

// Update status badge
function updateStatusBadge(status) {
  yourStatus.textContent = status;
  yourStatus.className = `badge badge-${status}`;
}

// Check status manually
checkStatusBtn.addEventListener('click', () => {
  if (currentTokenNumber) {
    checkTokenStatus(currentTokenNumber);
  }
});

// Check existing token
checkBtn.addEventListener('click', () => {
  const num = parseInt(checkTokenNumber.value, 10);
  if (num) {
    currentTokenNumber = num;
    checkTokenStatus(num);
    startTokenStatusPoll();
  }
});

// Check token status from API
async function checkTokenStatus(tokenNumber) {
  try {
    const res = await fetch(`${API_BASE}/${tokenNumber}/check`);
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Token not found');
      return;
    }

    tokenResult.classList.remove('hidden');
    yourTokenNumber.textContent = `#${data.tokenNumber}`;
    yourPosition.textContent = data.positionInQueue || '--';
    yourWaitTime.textContent = data.estimatedWaitMinutes;
    updateStatusBadge(data.status);

    // Show notification if it's their turn
    if (data.isYourTurn) {
      notificationArea.classList.remove('hidden');
      if (Notification.permission === 'granted') {
        new Notification('Smart Queue', {
          body: "It's your turn! Please proceed to the counter.",
        });
      }
    } else {
      notificationArea.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error checking token:', err);
  }
}

// Poll token status
function startTokenStatusPoll() {
  if (statusPollInterval) clearInterval(statusPollInterval);
  statusPollInterval = setInterval(() => {
    if (currentTokenNumber) {
      checkTokenStatus(currentTokenNumber);
    }
  }, 5000);
}

// Fetch live queue status
async function fetchQueueStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`);
    const data = await res.json();

    currentlyServing.textContent = data.currentlyServing ? `#${data.currentlyServing}` : '--';
    nextInQueue.textContent = data.nextInQueue ? `#${data.nextInQueue}` : '--';
    waitingCount.textContent = data.waitingCount;

    waitingList.innerHTML = data.waitingTokens
      .map((t) => `<span class="waiting-chip">#${t.tokenNumber} ${t.name}</span>`)
      .join('');
  } catch (err) {
    console.error('Error fetching queue status:', err);
  }
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Initial load and polling
fetchQueueStatus();
queuePollInterval = setInterval(fetchQueueStatus, 3000);
