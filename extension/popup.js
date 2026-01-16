// Popup script for Mortgage Rate Tracker

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();

  document.getElementById('checkNow').addEventListener('click', () => {
    const btn = document.getElementById('checkNow');
    btn.textContent = 'Checking...';
    btn.disabled = true;

    chrome.runtime.sendMessage({ type: 'MANUAL_CHECK' }, (response) => {
      setTimeout(() => {
        btn.textContent = 'Check Now';
        btn.disabled = false;
        // Reload status after a delay
        setTimeout(loadStatus, 10000);
      }, 2000);
    });
  });
});

function loadStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (!response) return;

    // Update current rate
    const rateEl = document.getElementById('currentRate');
    if (response.lastRate) {
      rateEl.textContent = response.lastRate + '%';
      if (response.lastRate < response.config.alertThreshold) {
        rateEl.classList.add('alert');
      } else {
        rateEl.classList.remove('alert');
      }
    } else {
      rateEl.textContent = '--';
    }

    // Update threshold
    document.getElementById('threshold').textContent = response.config?.alertThreshold || '5.625';

    // Update last check time
    const lastCheckEl = document.getElementById('lastCheck');
    if (response.lastCheck) {
      const date = new Date(response.lastCheck);
      lastCheckEl.textContent = `Last check: ${formatDate(date)}`;
    } else {
      lastCheckEl.textContent = 'No checks yet';
    }

    // Update history
    const historyEl = document.getElementById('historyList');
    if (response.history && response.history.length > 0) {
      historyEl.innerHTML = response.history.slice(0, 10).map(entry => `
        <div class="history-item">
          <span class="history-rate">${entry.rate}%</span>
          <span class="history-time">${formatDate(new Date(entry.timestamp))}</span>
        </div>
      `).join('');
    } else {
      historyEl.innerHTML = '<div class="no-data">No rate history yet</div>';
    }
  });
}

function formatDate(date) {
  const options = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  return date.toLocaleString('en-US', options);
}
