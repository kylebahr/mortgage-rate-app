import cron from 'node-cron';
import http from 'http';
import { config } from './config.js';
import { checkRates } from './index.js';
import { sendToWebhook } from './webhook.js';

console.log('Starting Commerce Bank Mortgage Rate Scheduler');
console.log('============================================');
console.log(`Timezone: ${config.schedule.timezone}`);
console.log(`Alert threshold: Below ${config.alerts.interestRateThreshold}%`);
console.log(`Email alerts: ${config.email.toEmail || 'Not configured'}`);
console.log('');

// Convert schedule times to cron expressions
// Times are in 24h format: ['7:00', '10:00', '13:00', '16:00']
const cronExpressions = config.schedule.times.map(time => {
  const [hour, minute] = time.split(':');
  return `${minute} ${hour} * * *`; // minute hour * * * (every day)
});

console.log('Scheduled check times (CT):');
config.schedule.times.forEach((time, i) => {
  const [hour] = time.split(':');
  const displayHour = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  console.log(`  - ${displayHour}:00 ${ampm} CT (cron: ${cronExpressions[i]})`);
});
console.log('');

// Schedule each check time
cronExpressions.forEach((cronExp, index) => {
  cron.schedule(cronExp, async () => {
    const time = config.schedule.times[index];
    console.log(`\n[${new Date().toISOString()}] Running scheduled check for ${time} CT`);
    console.log('─'.repeat(60));

    try {
      await checkRates();
    } catch (error) {
      console.error('Scheduled check failed:', error.message);
    }
  }, {
    timezone: config.schedule.timezone
  });
});

console.log('Scheduler is running. Press Ctrl+C to stop.');
console.log('');

// Start API server for Chrome extension
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Enable CORS for Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle POST to /api/rate
  if (req.method === 'POST' && req.url === '/api/rate') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log(`[API] Received rate data from extension: ${data.rate}%`);

        // Forward to Google Sheets webhook (pass through threshold and emails if provided)
        const result = await sendToWebhook({
          rate: data.rate,
          loanType: data.loanType || '30-Year Fixed',
          threshold: data.threshold,  // From extension settings
          emails: data.emails  // From extension settings
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, webhook: result }));
      } catch (error) {
        console.error('[API] Error processing rate data:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/') {
    // Health check endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'Mortgage Rate Scheduler + API',
      nextChecks: config.schedule.times
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
  console.log(`Extension endpoint: https://your-app.railway.app/api/rate`);
  console.log('');
});

// Run an initial check on startup (optional)
if (process.argv.includes('--run-now')) {
  console.log('Running initial check...');
  console.log('─'.repeat(60));
  checkRates().catch(error => {
    console.error('Initial check failed:', error.message);
  });
}

// Keep the process running
process.on('SIGINT', () => {
  console.log('\nScheduler and API server stopped.');
  server.close();
  process.exit(0);
});
