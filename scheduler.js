import cron from 'node-cron';
import { config } from './config.js';
import { checkRates } from './index.js';

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
  console.log('\nScheduler stopped.');
  process.exit(0);
});
