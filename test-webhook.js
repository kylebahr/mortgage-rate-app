// Test script to verify Google Sheets webhook is working
// Usage: WEBHOOK_URL='your-url' node test-webhook.js

import { sendToWebhook } from './webhook.js';

const testRate = 6.125; // Test rate above threshold (won't trigger email)

console.log('Testing Google Sheets webhook...');
console.log('Sending test rate:', testRate + '%');

const result = await sendToWebhook({
  rate: testRate,
  loanType: '30-Year Fixed (TEST)'
});

console.log('\nResult:', result);

if (result.success) {
  console.log('\n✅ SUCCESS! Check your Google Sheet for the test entry.');
  console.log('   Look for a row with rate:', testRate + '%');
} else if (result.skipped) {
  console.log('\n⚠️  Webhook is disabled or not configured.');
} else {
  console.log('\n❌ FAILED:', result.error);
}
