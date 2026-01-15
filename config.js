// Configuration for Commerce Bank Mortgage Rate Monitor

export const config = {
  // Form values to submit
  formValues: {
    loanPurpose: 'Purchase',
    propertyType: 'Single Family',
    propertyUse: 'Primary',
    zipCode: '64108',
    purchasePrice: '400000',
    downPayment: '80000',
    creditScore: '740'
  },

  // Alert thresholds
  alerts: {
    // Alert when interest rate drops below this value
    interestRateThreshold: 5.625,
    // Set to true to also alert on any rate change
    alertOnAnyChange: false
  },

  // Schedule times (CT timezone)
  // Commerce Bank updates at: 7am, 10am, 1pm, 4pm CT
  schedule: {
    timezone: 'America/Chicago',
    times: ['7:00', '10:00', '13:00', '16:00']
  },

  // SendGrid email configuration
  email: {
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'alerts@example.com',
    toEmail: process.env.TO_EMAIL || '',
    fromName: 'Mortgage Rate Alert'
  },

  // Logging
  logging: {
    logFile: 'rate-history.json',
    maxEntries: 1000 // Keep last 1000 entries
  },

  // Target URL
  targetUrl: 'https://www.commercebank.com/personal/borrow/mortgages/mortgage-rates'
};
