import nodemailer from 'nodemailer';
import { config } from './config.js';

// Create Gmail transporter
let transporter = null;

if (config.email.gmailUser && config.email.gmailAppPassword) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.email.gmailUser,
      pass: config.email.gmailAppPassword
    }
  });
}

/**
 * Check if rate meets alert threshold
 */
export function shouldAlert(interestRate) {
  return interestRate < config.alerts.interestRateThreshold;
}

/**
 * Send email alert for low rate
 */
export async function sendRateAlert(rateData) {
  if (!transporter) {
    console.warn('Gmail not configured. Skipping email alert.');
    console.log('Would have sent alert:', rateData);
    return false;
  }

  if (!config.email.toEmail) {
    console.warn('Recipient email not configured. Skipping email alert.');
    return false;
  }

  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.gmailUser}>`,
    to: config.email.toEmail,
    subject: `🏠 Mortgage Rate Alert: ${rateData.interestRate}% (Below ${config.alerts.interestRateThreshold}%)`,
    text: buildTextEmail(rateData),
    html: buildHtmlEmail(rateData)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Alert email sent to ${config.email.toEmail}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error.message);
    return false;
  }
}

/**
 * Build plain text email content
 */
function buildTextEmail(rateData) {
  return `
Commerce Bank Mortgage Rate Alert
==================================

The interest rate has dropped below your threshold of ${config.alerts.interestRateThreshold}%!

Current Rate: ${rateData.interestRate}%
APR: ${rateData.apr || 'N/A'}%
Loan Type: ${rateData.loanType || 'N/A'}
Timestamp: ${rateData.timestamp || new Date().toISOString()}

Form Values Used:
- Purchase Price: $${config.formValues.purchasePrice}
- Down Payment: $${config.formValues.downPayment}
- ZIP Code: ${config.formValues.zipCode}
- Credit Score: ${config.formValues.creditScore}

Visit Commerce Bank to lock in this rate:
https://www.commercebank.com/personal/borrow/mortgages/mortgage-rates
`;
}

/**
 * Build HTML email content
 */
function buildHtmlEmail(rateData) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #004d40; color: white; padding: 20px; text-align: center; }
    .rate-box { background: #e8f5e9; border: 2px solid #4caf50; padding: 20px; margin: 20px 0; text-align: center; }
    .rate { font-size: 48px; font-weight: bold; color: #2e7d32; }
    .threshold { color: #666; font-size: 14px; }
    .details { background: #f5f5f5; padding: 15px; margin: 20px 0; }
    .cta { background: #004d40; color: white; padding: 15px 30px; text-decoration: none; display: inline-block; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏠 Mortgage Rate Alert</h1>
    </div>

    <div class="rate-box">
      <div class="rate">${rateData.interestRate}%</div>
      <div class="threshold">Below your threshold of ${config.alerts.interestRateThreshold}%</div>
    </div>

    <div class="details">
      <h3>Rate Details</h3>
      <p><strong>Interest Rate:</strong> ${rateData.interestRate}%</p>
      <p><strong>APR:</strong> ${rateData.apr || 'N/A'}%</p>
      <p><strong>Loan Type:</strong> ${rateData.loanType || 'N/A'}</p>
      <p><strong>Checked:</strong> ${rateData.timestamp || new Date().toISOString()}</p>
    </div>

    <div class="details">
      <h3>Your Search Criteria</h3>
      <p><strong>Purchase Price:</strong> $${Number(config.formValues.purchasePrice).toLocaleString()}</p>
      <p><strong>Down Payment:</strong> $${Number(config.formValues.downPayment).toLocaleString()}</p>
      <p><strong>ZIP Code:</strong> ${config.formValues.zipCode}</p>
      <p><strong>Credit Score:</strong> ${config.formValues.creditScore}</p>
    </div>

    <p style="text-align: center;">
      <a href="https://www.commercebank.com/personal/borrow/mortgages/mortgage-rates" class="cta">
        View Rates on Commerce Bank
      </a>
    </p>

    <p style="font-size: 12px; color: #666; text-align: center;">
      This alert was sent by your Mortgage Rate Monitor.
    </p>
  </div>
</body>
</html>
`;
}
