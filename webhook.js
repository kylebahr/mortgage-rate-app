// Google Apps Script webhook integration
// Sends rate data to your Google Sheet and triggers email alerts

import { config } from './config.js';

/**
 * Sends rate data to Google Apps Script webhook
 * @param {Object} rateData - Rate information
 * @param {number} rateData.rate - Interest rate value
 * @param {string} rateData.loanType - Type of loan (e.g., "30-Year Fixed")
 * @returns {Promise<Object>} Response from webhook
 */
export async function sendToWebhook(rateData) {
  if (!config.webhook.enabled) {
    console.log('Webhook disabled, skipping...');
    return { skipped: true };
  }

  if (!config.webhook.url) {
    console.log('Webhook URL not configured, skipping...');
    return { skipped: true };
  }

  try {
    console.log(`Sending rate data to webhook: ${rateData.rate}%`);

    const payload = {
      rate: rateData.rate,
      loanType: rateData.loanType || '30-Year Fixed',
      timestamp: new Date().toISOString()
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.webhook.timeout);

    const response = await fetch(config.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}`);
    }

    const result = await response.json();
    console.log('Webhook response:', result);

    return result;
  } catch (error) {
    console.error('Error sending to webhook:', error.message);
    // Don't throw - we don't want webhook failures to break the main flow
    return { error: error.message };
  }
}
