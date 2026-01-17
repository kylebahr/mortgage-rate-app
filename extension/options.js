// Mortgage Rate Tracker - Settings Page Logic

const DEFAULT_THRESHOLD = 5.625;
const DEFAULT_EMAILS = ['kylebahr88@gmail.com', 'albbt2@gmail.com'];
const DEFAULT_CHECK_TIMES = ['8:00', '10:00', '13:00', '16:00'];

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);

// Save button
document.getElementById('saveBtn').addEventListener('click', saveSettings);

// Reset button
document.getElementById('resetBtn').addEventListener('click', resetSettings);

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['alertThreshold', 'emailRecipients', 'checkTimes']);

    // Load threshold
    const threshold = result.alertThreshold || DEFAULT_THRESHOLD;
    document.getElementById('threshold').value = threshold;

    // Load emails
    const emails = result.emailRecipients || DEFAULT_EMAILS;
    document.getElementById('emails').value = emails.join('\n');

    // Load check times
    const checkTimes = result.checkTimes || DEFAULT_CHECK_TIMES;
    document.getElementById('checkTimes').value = checkTimes.join('\n');

  } catch (error) {
    showStatus('Error loading settings: ' + error.message, 'error');
  }
}

async function saveSettings() {
  try {
    // Get threshold value
    const thresholdInput = document.getElementById('threshold').value;
    const threshold = parseFloat(thresholdInput);

    if (isNaN(threshold) || threshold <= 0 || threshold > 20) {
      showStatus('Please enter a valid threshold between 0 and 20', 'error');
      return;
    }

    // Get and parse email addresses
    const emailsText = document.getElementById('emails').value;
    const emails = emailsText
      .split('\n')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (emails.length === 0) {
      showStatus('Please enter at least one email address', 'error');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      showStatus('Invalid email address(es): ' + invalidEmails.join(', '), 'error');
      return;
    }

    // Get and parse check times
    const timesText = document.getElementById('checkTimes').value;
    const checkTimes = timesText
      .split('\n')
      .map(time => time.trim())
      .filter(time => time.length > 0);

    if (checkTimes.length === 0) {
      showStatus('Please enter at least one check time', 'error');
      return;
    }

    // Validate time format (HH:MM or H:MM)
    const timeRegex = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/;
    const invalidTimes = checkTimes.filter(time => !timeRegex.test(time));

    if (invalidTimes.length > 0) {
      showStatus('Invalid time format(s): ' + invalidTimes.join(', ') + '. Use 24-hour format (e.g., 8:00, 13:00)', 'error');
      return;
    }

    // Save to storage
    await chrome.storage.local.set({
      alertThreshold: threshold,
      emailRecipients: emails,
      checkTimes: checkTimes
    });

    showStatus(`Settings saved! Threshold: ${threshold}%, Recipients: ${emails.length}, Check times: ${checkTimes.length}`, 'success');

    // Update config in background script
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      threshold: threshold,
      emails: emails,
      checkTimes: checkTimes
    });

  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

function resetSettings() {
  document.getElementById('threshold').value = DEFAULT_THRESHOLD;
  document.getElementById('emails').value = DEFAULT_EMAILS.join('\n');
  document.getElementById('checkTimes').value = DEFAULT_CHECK_TIMES.join('\n');
  showStatus('Settings reset to defaults. Click "Save Settings" to apply.', 'success');
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';

  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}
