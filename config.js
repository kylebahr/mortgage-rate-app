// Configuration for Commerce Bank Mortgage Rate Monitor

export const config = {
  // Form values to submit
  formValues: {
    loanPurpose: 'Purchase',
    propertyType: 'Single Family',
    propertyUse: 'Primary',
    occupancy: 'Primary Residence',  // Primary Residence, Secondary Home, Investment Property
    militaryVeteran: 'No',           // Yes, No
    zipCode: '64108',
    purchasePrice: '765900',
    downPayment: '306000',
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

  // Resend email configuration
  // Get your API key at: https://resend.com/api-keys
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',  // re_xxxxxxxxx
    fromEmail: 'onboarding@resend.dev',               // Use this for free tier, or your verified domain
    toEmail: process.env.TO_EMAIL || '',              // recipient email
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
