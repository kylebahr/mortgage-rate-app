/**
 * Updated Google Apps Script for Mortgage Rate Tracker
 *
 * NEW FEATURES:
 * - Accepts threshold from extension settings (or uses default)
 * - Accepts email array from extension settings (or uses defaults)
 * - Sends email to ALL recipients in the array
 *
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Go to script.google.com and open your existing script
 * 2. Replace ALL code with this updated version
 * 3. Update SPREADSHEET_ID with your sheet ID
 * 4. Update DEFAULT_EMAILS and DEFAULT_THRESHOLD as needed
 * 5. Save the script
 * 6. Deploy: Deploy → Manage deployments → Pencil icon → New version → Deploy
 * 7. Authorize if prompted
 */

// Default configuration (used if extension doesn't provide values)
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Get from your sheet URL
const SHEET_NAME = 'Rate History';
const DEFAULT_EMAILS = ['kylebahr88@gmail.com', 'albbt2@gmail.com'];
const DEFAULT_THRESHOLD = 5.625;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Use provided values or fall back to defaults
    const threshold = data.threshold || DEFAULT_THRESHOLD;
    const emails = data.emails || DEFAULT_EMAILS;

    console.log(`Processing rate: ${data.rate}%, threshold: ${threshold}%, recipients: ${emails.length}`);

    // Log to spreadsheet
    logToSheet(data, threshold);

    // Send email to all recipients if below threshold
    if (data.rate < threshold) {
      sendAlertEmails(data, threshold, emails);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      threshold: threshold,
      emailsSent: data.rate < threshold ? emails.length : 0
    }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    console.error('Error in doPost:', error);
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function logToSheet(data, threshold) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Rate (%)', 'Loan Type', 'Threshold (%)', 'Below Threshold']);
  }

  sheet.appendRow([
    new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    data.rate,
    data.loanType || '30-Year Fixed',
    threshold,
    data.rate < threshold ? 'YES' : 'No'
  ]);
}

function sendAlertEmails(data, threshold, emails) {
  const subject = `🏠 Mortgage Rate Alert: ${data.rate}%`;
  const body = `
Good news! The mortgage rate has dropped below your ${threshold}% threshold.

Current Rate: ${data.rate}%
Loan Type: ${data.loanType || '30-Year Fixed'}
Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}

This is an automated alert from your Mortgage Rate Tracker.
  `;

  // Send to all recipients
  emails.forEach(email => {
    try {
      MailApp.sendEmail(email, subject, body);
      console.log(`Email sent to: ${email}`);
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error);
    }
  });
}

// Test function (optional - for manual testing)
function testPost() {
  const e = {
    postData: {
      contents: JSON.stringify({
        rate: 5.5,
        loanType: '30-Year Fixed',
        threshold: 5.625,
        emails: ['kylebahr88@gmail.com', 'albbt2@gmail.com']
      })
    }
  };
  const result = doPost(e);
  console.log(result.getContent());
}
