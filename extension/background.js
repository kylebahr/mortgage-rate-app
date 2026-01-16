// Mortgage Rate Tracker - Background Service Worker

const CONFIG = {
  targetUrl: 'https://www.commercebank.com/personal/borrow/mortgage-checks',
  alertThreshold: 5.625,
  alertEmail: 'kylebahr88@gmail.com',
  // Schedule: 8am, 10am, 1pm, 4pm CT
  checkTimes: [
    { hour: 8, minute: 0 },
    { hour: 10, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 16, minute: 0 }
  ]
};

// Initialize alarms on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Mortgage Rate Tracker installed');
  setupAlarms();
  // Store initial config
  chrome.storage.local.set({
    config: CONFIG,
    rateHistory: [],
    lastCheck: null
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
  const currentHour = ctTime.getHours();
  const currentMinute = ctTime.getMinutes();

  for (const time of CONFIG.checkTimes) {
    if (currentHour === time.hour && currentMinute === time.minute) {
      // Check if we already ran this minute
      chrome.storage.local.get(['lastCheckMinute'], (result) => {
        const lastCheck = result.lastCheckMinute || '';
        const thisCheck = `${currentHour}:${currentMinute}`;

        if (lastCheck !== thisCheck) {
          chrome.storage.local.set({ lastCheckMinute: thisCheck });
          console.log(`Scheduled check time reached: ${thisCheck} CT`);
          performRateCheck();
        }
      });
      break;
    }
  }
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

  // Get existing history
  const storage = await chrome.storage.local.get(['rateHistory', 'config']);
  const history = storage.rateHistory || [];
  const config = storage.config || CONFIG;

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

  // Check if alert should be sent
  if (data.rate < config.alertThreshold) {
    showNotification(data.rate, config.alertThreshold);
  }

  // Close the tab
  if (tabId) {
    chrome.tabs.remove(tabId).catch(() => {});
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
