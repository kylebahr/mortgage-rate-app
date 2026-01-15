# mortgage-rate-app

Commerce Bank Mortgage Rate Monitor with Scheduled Alerts

Automatically checks Commerce Bank mortgage rates 4 times daily and sends email alerts when rates drop below your target threshold.

## Features

- Scheduled rate checks at 7am, 10am, 1pm, 4pm CT
- Email alerts via Gmail when rate drops below threshold
- Rate history logging in JSON format
- Debug mode with visible browser for troubleshooting

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium
```

## Configuration

### Gmail App Password Setup

1. Go to your [Google Account](https://myaccount.google.com/)
2. Navigate to **Security** > **2-Step Verification** (enable if not already)
3. At the bottom, click **App passwords**
4. Select "Mail" and "Other (custom name)", enter "Mortgage Rate Alert"
5. Copy the 16-character password generated

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Gmail credentials
GMAIL_USER=your.email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  # 16-char app password from above

# Recipient email (can be same as GMAIL_USER)
TO_EMAIL=you@example.com

# Optional: Custom Chrome path
CHROME_PATH=/path/to/chrome
```

### config.js Settings

Edit `config.js` to customize:

- **formValues**: Loan details (purchase price, down payment, ZIP, credit score)
- **alerts.interestRateThreshold**: Alert when rate drops below this (default: 5.625%)
- **schedule.times**: Check times in 24h format (default: 7am, 10am, 1pm, 4pm CT)

## Usage

### Run Scheduler (Recommended)

Start the scheduler to automatically check rates at configured times:

```bash
npm run scheduler
```

Add `--run-now` to also run an immediate check on startup:

```bash
node scheduler.js --run-now
```

### Single Check

Run a one-time rate check:

```bash
npm start
```

### Debug Mode

Run with visible browser window for troubleshooting:

```bash
npm run debug
```

## Files

- `index.js` - Main rate checking logic
- `scheduler.js` - Cron-based scheduler for 4x daily checks
- `config.js` - All configuration settings
- `logger.js` - Rate history logging
- `alerter.js` - Gmail email alerts
- `rate-history.json` - Logged rate history (auto-created)

## Running as a Service

To keep the scheduler running persistently, use PM2:

```bash
npm install -g pm2
pm2 start scheduler.js --name mortgage-rates
pm2 save
pm2 startup
```

Or use systemd on Linux servers.
