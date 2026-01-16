# mortgage-rate-app

Commerce Bank Mortgage Rate Monitor with Scheduled Alerts

Automatically checks Commerce Bank mortgage rates 4 times daily and sends email alerts when rates drop below your target threshold.

## Features

- Scheduled rate checks at 7am, 10am, 1pm, 4pm CT
- Email alerts via Resend when rate drops below threshold
- Rate history logging in JSON format
- Cloud deployment ready (Railway)

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

### Step 4: Deploy
Railway will automatically deploy. Your app will now run 24/7, checking rates at 7am, 10am, 1pm, and 4pm CT.

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
- `Dockerfile` - Container config for Railway deployment
