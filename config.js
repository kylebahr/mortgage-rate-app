// Configuration for Commerce Bank Mortgage Rate Monitor

export const config = {
  // Form values to submit
  formValues: {
    occupancy: 'Primary Residence',    // Primary Residence, Secondary Home, Investment Property
    propertyType: 'Single Family',     // Single Family, Condo, etc.
    loanPurpose: 'Purchase',           // Purchase, Refinance
    purchasePrice: '765900',
    downPayment: '306000',
    state: 'Missouri (MO)',            // State dropdown
    zipCode: '64108',
    creditScore: '740',                // Credit score range
    militaryVeteran: 'No'              // Yes, No
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

  // Target URL - direct OptimalBlue form
  targetUrl: 'https://quickquote-consumer.optimalblue.com/?mobile=true&clientId=3737323636&userId=373531313737&formId=35353431&embedded=true'
};
