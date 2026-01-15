# mortgage-rate-app

Commerce Bank Mortgage Rate Form Filler

A Node.js CLI tool that automatically fills out the Commerce Bank mortgage rates form and extracts the resulting rate information.

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browser (Chromium)
npx playwright install chromium
```

## Usage

```bash
# Run the script
npm start

# Run in debug mode (opens visible browser window)
npm run debug
```

## Configuration

Edit the `FORM_VALUES` object in `index.js` to set your desired values:

```javascript
const FORM_VALUES = {
  loanPurpose: 'Purchase',       // Purchase, Refinance
  propertyType: 'Single Family', // Single Family, Condo, Multi-Family, etc.
  propertyUse: 'Primary',        // Primary, Secondary, Investment
  zipCode: '64108',              // ZIP code
  purchasePrice: '400000',       // Purchase price in dollars
  downPayment: '80000',          // Down payment amount
  creditScore: '740'             // Credit score
};
```

## Environment Variables

- `CHROME_PATH`: Custom path to Chrome/Chromium executable (optional)

## How It Works

1. Launches a headless Chromium browser
2. Navigates to the Commerce Bank mortgage rates page
3. Discovers and logs all form elements on the page
4. Fills in the form with the configured values
5. Submits the form
6. Extracts and displays the resulting rate table data
