const API_BASE = '/api/tokens';
let adminPollInterval = null;

// DOM Elements
const adminServing = document.getElementById('admin-serving');
const adminWaiting = document.getElementById('admin-waiting');
const adminCompleted = document.getElementById('admin-completed');
const tokenList = document.getElementById('token-list');
const noTokens = document.getElementById('no-tokens');
const callNextBtn = document.getElementById('call-next-btn');
const resetQueueBtn = document.getElementById('reset-queue-btn');
const adminMessage = document.getElementById('admin-message');

// Fetch all tokens
async function fetchAllTokens() {
  try {
    const res = await fetch(`${API_BASE}/admin/all`);
    const tokens = await res.json();

    if (tokens.length === 0) {
      tokenList.innerHTML = '';
      noTokens.classList.remove('hidden');
      adminServing.textContent = '--';
      adminWaiting.textContent = '0';
      adminCompleted.textContent = '0';
      return;
    }

    noTokens.classList.add('hidden');

    const serving = tokens.filter((t) => t.status === 'serving');
    const waiting = tokens.filter((t) => t.status === 'waiting');
    const completed = tokens.filter((t) => t.status === 'completed');

    adminServing.textContent = serving.length > 0 ? `#${serving[0].tokenNumber}` : '--';
    adminWaiting.textContent = waiting.length;
    adminCompleted.textContent = completed.length;

    tokenList.innerHTML = tokens
      .map(
        (t) => `
        <tr>
          <td><strong>${t.tokenNumber}</strong></td>
          <td>${t.name}</td>
          <td>${t.phone}</td>
          <td><span class="badge badge-${t.status}">${t.status}</span></td>
          <td>${new Date(t.createdAt).toLocaleTimeString()}</td>
          <td>
            ${
              t.status === 'waiting' || t.status === 'serving'
                ? `<button class="btn btn-danger btn-sm" onclick="cancelToken(${t.tokenNumber})">Cancel</button>`
                : '--'
            }
          </td>
        </tr>`
      )
      .join('');
  } catch (err) {
    console.error('Error fetching tokens:', err);
  }
}

// Call next token
callNextBtn.addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_BASE}/admin/next`, { method: 'POST' });
    const data = await res.json();
    showMessage(data.message);
    fetchAllTokens();
  } catch (err) {
    showMessage('Error calling next token');
  }
});

// Reset queue
resetQueueBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to reset the entire queue?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/reset`, { method: 'POST' });
    const data = await res.json();
    showMessage(data.message);
    fetchAllTokens();
  } catch (err) {
    showMessage('Error resetting queue');
  }
});

// Cancel token
async function cancelToken(tokenNumber) {
  if (!confirm(`Cancel token #${tokenNumber}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/admin/${tokenNumber}/cancel`, { method: 'PATCH' });
    const data = await res.json();
    showMessage(data.message || data.error);
    fetchAllTokens();
  } catch (err) {
    showMessage('Error cancelling token');
  }
}

// Show admin message
function showMessage(msg) {
  adminMessage.textContent = msg;
  adminMessage.classList.remove('hidden');
  setTimeout(() => adminMessage.classList.add('hidden'), 3000);
}

// Initial load and polling
fetchAllTokens();
adminPollInterval = setInterval(fetchAllTokens, 3000);
