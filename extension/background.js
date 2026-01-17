// Mortgage Rate Tracker - Background Service Worker

const CONFIG = {
  targetUrl: 'https://www.commercebank.com/personal/borrow/mortgages/mortgage-rates',
  alertThreshold: 5.625,
  alertEmail: 'kylebahr88@gmail.com',
  // Schedule: 8am, 10am, 1pm, 4pm CT
  checkTimes: [
    { hour: 8, minute: 0 },
    { hour: 10, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 16, minute: 0 }
  ],
  // Webhook to Railway API (which forwards to Google Sheets)
  // Railway API has CORS enabled, so extension can call it directly
  webhook: {
    enabled: true,
    url: 'https://mortgage-rate-app-production.up.railway.app/api/rate',
    timeout: 10000
  }
};

// Initialize alarms on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Mortgage Rate Tracker installed');
  setupAlarms();

  // Initialize default settings if not already set
  chrome.storage.local.get(['alertThreshold', 'emailRecipients', 'checkTimes'], (result) => {
    const settings = {
      config: CONFIG,
      rateHistory: [],
      lastCheck: null
    };

    // Set default threshold if not exists
    if (!result.alertThreshold) {
      settings.alertThreshold = 5.625;
    }

    // Set default emails if not exists
    if (!result.emailRecipients) {
      settings.emailRecipients = ['kylebahr88@gmail.com', 'albbt2@gmail.com'];
    }

    // Set default check times if not exists
    if (!result.checkTimes) {
      settings.checkTimes = ['8:00', '10:00', '13:00', '16:00'];
    }

    chrome.storage.local.set(settings);
  });
});

// Also setup alarms when service worker starts
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started, setting up alarms');
  setupAlarms();
});

function setupAlarms() {
  // Clear existing alarms
  chrome.alarms.clearAll(() => {
    // Create alarm that fires every minute to check if it's time
    chrome.alarms.create('checkSchedule', { periodInMinutes: 1 });
    console.log('Schedule alarm created');
  });
}

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkSchedule') {
    checkIfTimeToRun();
  } else if (alarm.name === 'runCheck') {
    performRateCheck();
  }
});

function checkIfTimeToRun() {
  const now = new Date();
  // Convert to CT (Central Time)
  const ctTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const currentDay = ctTime.getDay(); // 0 = Sunday, 6 = Saturday
  const currentHour = ctTime.getHours();
  const currentMinute = ctTime.getMinutes();

  // Only run Monday-Friday (1-5)
  if (currentDay === 0 || currentDay === 6) {
    return; // Skip weekends
  }

  // Load check times from storage
  chrome.storage.local.get(['checkTimes'], (result) => {
    const checkTimes = result.checkTimes || ['8:00', '10:00', '13:00', '16:00'];

    for (const timeStr of checkTimes) {
      // Parse time string (e.g., "8:00" or "13:00")
      const [hourStr, minuteStr] = timeStr.split(':');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (currentHour === hour && currentMinute === minute) {
        // Check if we already ran this minute
        chrome.storage.local.get(['lastCheckMinute'], (result) => {
          const lastCheck = result.lastCheckMinute || '';
          const thisCheck = `${currentHour}:${currentMinute}`;

          if (lastCheck !== thisCheck) {
            chrome.storage.local.set({ lastCheckMinute: thisCheck });
            console.log(`Scheduled check time reached: ${thisCheck} CT (${getDayName(currentDay)})`);
            performRateCheck();
          }
        });
        break;
      }
    }
  });
}

function getDayName(dayNum) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNum];
}

async function performRateCheck() {
  console.log('Starting rate check...');

  try {
    // Open the Commerce Bank page in a new tab
    const tab = await chrome.tabs.create({
      url: CONFIG.targetUrl,
      active: false  // Open in background
    });

    // Wait for page to load and content script to extract data
    // The content script will send a message when done
    console.log(`Opened tab ${tab.id}, waiting for rate extraction...`);

    // Set a timeout to close the tab if extraction takes too long
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, 120000); // 2 minute timeout

  } catch (error) {
    console.error('Error performing rate check:', error);
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RATE_EXTRACTED') {
    handleRateData(message.data, sender.tab?.id);
    sendResponse({ received: true });
  } else if (message.type === 'EXTRACTION_FAILED') {
    console.error('Rate extraction failed:', message.error);
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
    sendResponse({ received: true });
  } else if (message.type === 'MANUAL_CHECK') {
    performRateCheck();
    sendResponse({ started: true });
  }
  return true;
});

async function handleRateData(data, tabId) {
  console.log('Rate data received:', data);

  const timestamp = new Date().toISOString();
  const rateEntry = {
    rate: data.rate,
    timestamp: timestamp,
    loanType: data.loanType || '30-Year Fixed'
  };

  // Get existing history and settings
  const storage = await chrome.storage.local.get([
    'rateHistory',
    'config',
    'alertThreshold',
    'emailRecipients'
  ]);

  const history = storage.rateHistory || [];
  const config = storage.config || CONFIG;
  const threshold = storage.alertThreshold || 5.625;
  const emails = storage.emailRecipients || ['kylebahr88@gmail.com', 'albbt2@gmail.com'];

  // Add new entry
  history.unshift(rateEntry);

  // Keep only last 100 entries
  if (history.length > 100) {
    history.pop();
  }

  // Save updated history
  await chrome.storage.local.set({
    rateHistory: history,
    lastCheck: timestamp,
    lastRate: data.rate
  });

  console.log(`Rate logged: ${data.rate}% at ${timestamp}`);
  console.log(`Using threshold: ${threshold}%, Recipients: ${emails.length}`);

  // Send to Railway API (which forwards to Google Sheets)
  // Include threshold and emails so Google Apps Script can use them
  await sendToWebhook(rateEntry, config, threshold, emails);

  // Check if alert should be sent
  if (data.rate < threshold) {
    showNotification(data.rate, threshold);
  }

  // Close the tab
  if (tabId) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
}

/**
 * Sends rate data to Railway API (which forwards to Google Sheets)
 */
async function sendToWebhook(rateData, config, threshold, emails) {
  const webhookConfig = config.webhook || CONFIG.webhook;

  if (!webhookConfig.enabled) {
    console.log('Webhook disabled, skipping...');
    return { skipped: true };
  }

  if (!webhookConfig.url || webhookConfig.url.includes('YOUR-RAILWAY-APP')) {
    console.log('Webhook URL not configured, skipping...');
    return { skipped: true };
  }

  try {
    console.log(`Sending rate data to Railway API: ${rateData.rate}%`);

    const payload = {
      rate: rateData.rate,
      loanType: rateData.loanType || '30-Year Fixed',
      timestamp: new Date().toISOString(),
      threshold: threshold || 5.625,
      emails: emails || ['kylebahr88@gmail.com', 'albbt2@gmail.com']
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhookConfig.timeout);

    const response = await fetch(webhookConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Railway API returned status ${response.status}`);
    }

    const result = await response.json();
    console.log('Railway API response:', result);

    return result;
  } catch (error) {
    console.error('Error sending to Railway API:', error.message);
    // Don't throw - we don't want webhook failures to break the main flow
    return { error: error.message };
  }
}

function showNotification(rate, threshold) {
  chrome.notifications.create({
    type: 'basic',
    title: 'Mortgage Rate Alert!',
    message: `Rate dropped to ${rate}%! (Below ${threshold}% threshold)`,
    priority: 2
  });

  console.log(`ALERT: Rate ${rate}% is below threshold ${threshold}%`);
}

// Manual trigger from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['lastCheck', 'lastRate', 'rateHistory', 'config'], (result) => {
      sendResponse({
        lastCheck: result.lastCheck,
        lastRate: result.lastRate,
        history: result.rateHistory || [],
        config: result.config || CONFIG
      });
    });
    return true; // Keep channel open for async response
  }
});
