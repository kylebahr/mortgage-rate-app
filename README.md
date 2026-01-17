# mortgage-rate-app

Commerce Bank Mortgage Rate Monitor with Scheduled Alerts

Automatically checks Commerce Bank mortgage rates 4 times daily and sends email alerts when rates drop below your target threshold.

## Features

- Scheduled rate checks at 7am, 10am, 1pm, 4pm CT
- Email alerts via Resend when rate drops below threshold
- **NEW: Google Sheets logging and email alerts via Google Apps Script webhook**
- Rate history logging in JSON format
- Cloud deployment ready (Railway)
- Chrome extension for automated browser-based checking

## Deploy to Railway (Recommended)

The easiest way to run this 24/7 in the cloud:

### Step 1: Get your Resend API key
1. Sign up at https://resend.com (free, no credit card)
2. Go to https://resend.com/api-keys
3. Create an API key and copy it

### Step 2: Deploy to Railway
1. Sign up at https://railway.app (free tier available)
2. Click "New Project" > "Deploy from GitHub repo"
3. Connect your GitHub account and select this repo
4. Railway will auto-detect the Dockerfile and start building

### Step 3: Add Environment Variables
In your Railway project dashboard:
1. Go to your service > "Variables" tab
2. Add these variables:
   - `RESEND_API_KEY` = your Resend API key
   - `TO_EMAIL` = your email address
   - `WEBHOOK_URL` = (optional) your Google Apps Script webhook URL

### Step 4: Deploy
Railway will automatically deploy. Your app will now run 24/7, checking rates at 7am, 10am, 1pm, and 4pm CT.

---

## Google Sheets Integration (Optional)

Send rate data to a Google Sheet for tracking and get email alerts via Google Apps Script:

### Step 1: Create Google Apps Script

1. Go to [script.google.com](https://script.google.com) → New Project
2. Replace the code with this:

```javascript
// Configuration
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Get from your sheet URL
const SHEET_NAME = 'Rate History';
const EMAIL = 'your-email@gmail.com';
const THRESHOLD = 5.625;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Log to spreadsheet
    logToSheet(data);

    // Send email if below threshold
    if (data.rate < THRESHOLD) {
      sendAlertEmail(data);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function logToSheet(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Rate (%)', 'Loan Type', 'Below Threshold']);
  }

  sheet.appendRow([
    new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    data.rate,
    data.loanType || '30-Year Fixed',
    data.rate < THRESHOLD ? 'YES' : 'No'
  ]);
}

function sendAlertEmail(data) {
  const subject = `🏠 Mortgage Rate Alert: ${data.rate}%`;
  const body = `
Good news! The mortgage rate has dropped below your ${THRESHOLD}% threshold.

Current Rate: ${data.rate}%
Loan Type: ${data.loanType || '30-Year Fixed'}
Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}

This is an automated alert from your Mortgage Rate Tracker.
  `;

  MailApp.sendEmail(EMAIL, subject, body);
}
```

### Step 2: Deploy the Script

1. Click **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy** → Copy the **Web app URL**

### Step 3: Create Google Sheet

1. Create a new Google Sheet
2. Copy the spreadsheet ID from the URL (the long string between `/d/` and `/edit`)
3. Paste it into `SPREADSHEET_ID` in your Apps Script

### Step 4: Configure the App

**For Backend (Railway/Local):**
- Set the `WEBHOOK_URL` environment variable to your Apps Script web app URL

**For Chrome Extension:**
- Open `extension/background.js`
- Paste your webhook URL in the `CONFIG.webhook.url` field

Now every rate check will be logged to your Google Sheet, and you'll get email alerts via Gmail!

---

## Local Development

If you want to run locally for testing:

```bash
# Clone the repo
git clone https://github.com/kylebahr/mortgage-rate-app.git
cd mortgage-rate-app

# Install dependencies
npm install
npx playwright install chromium

# Set environment variables
export RESEND_API_KEY=re_xxxxxxxxx
export TO_EMAIL=you@example.com

# Run a single test check
npm start

# Or start the scheduler
node scheduler.js --run-now
```

## Configuration

Edit `config.js` to customize:

- **formValues**: Loan details (purchase price, down payment, ZIP, credit score)
- **alerts.interestRateThreshold**: Alert when rate drops below this (default: 5.625%)
- **schedule.times**: Check times in 24h format (default: 7am, 10am, 1pm, 4pm CT)

## Files

- `index.js` - Main rate checking logic
- `scheduler.js` - Cron-based scheduler for 4x daily checks
- `config.js` - All configuration settings
- `logger.js` - Rate history logging
- `alerter.js` - Resend email alerts
- `webhook.js` - Google Apps Script webhook integration
- `Dockerfile` - Container config for Railway deployment
- `extension/` - Chrome extension for browser-based rate checking
