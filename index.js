import { chromium } from 'playwright';
import { config } from './config.js';
import { logRate, getLastRate, hasRateChanged } from './logger.js';
import { shouldAlert, sendRateAlert } from './alerter.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract interest rate from results table
 * This function will need adjustment based on actual page structure
 */
function parseRateFromTable(tableData) {
  // Look for interest rate pattern (e.g., "6.500%", "5.625%")
  const ratePattern = /(\d+\.\d{1,3})%/;

  for (const table of tableData) {
    for (const row of table.rows) {
      for (const cell of row) {
        if (cell) {
          const match = cell.match(ratePattern);
          if (match) {
            return {
              interestRate: parseFloat(match[1]),
              rawData: row
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Main function to check mortgage rates
 * Can be called directly or by the scheduler
 */
export async function checkRates() {
  const isDebug = process.argv.includes('--debug');
  const formValues = config.formValues;

  console.log('Starting Commerce Bank Mortgage Rate Check...');
  console.log('Form values:', JSON.stringify(formValues, null, 2));
  console.log(`Alert threshold: Below ${config.alerts.interestRateThreshold}%`);

  const launchOptions = {
    headless: !isDebug,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  };

  if (process.env.CHROME_PATH) {
    launchOptions.executablePath = process.env.CHROME_PATH;
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    console.log(`Navigating to: ${config.targetUrl}`);
    await page.goto(config.targetUrl, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await delay(3000);

    // Discover form elements
    console.log('\n--- Discovering page structure ---');

    const formElements = await page.evaluate(() => {
      const elements = { selects: [], inputs: [], buttons: [] };

      document.querySelectorAll('select').forEach(el => {
        const options = Array.from(el.options).map(opt => ({
          value: opt.value,
          text: opt.text
        }));
        elements.selects.push({ id: el.id, name: el.name, options });
      });

      document.querySelectorAll('input').forEach(el => {
        elements.inputs.push({
          id: el.id,
          name: el.name,
          type: el.type,
          placeholder: el.placeholder
        });
      });

      document.querySelectorAll('button, input[type="submit"]').forEach(el => {
        elements.buttons.push({
          id: el.id,
          type: el.type,
          text: el.textContent?.trim()
        });
      });

      return elements;
    });

    if (isDebug) {
      console.log('Form elements:', JSON.stringify(formElements, null, 2));
    }

    // Check for iframes
    const iframes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('iframe')).map(iframe => ({
        id: iframe.id,
        name: iframe.name,
        src: iframe.src
      }));
    });

    if (iframes.length > 0 && isDebug) {
      console.log('Iframes found:', JSON.stringify(iframes, null, 2));
    }

    // Fill form
    console.log('\n--- Filling form ---');

    const fillAttempts = [
      { selector: '[name*="purpose"], [id*="purpose"], select[name*="loan"]', value: formValues.loanPurpose, type: 'select' },
      { selector: '[name*="property"][name*="type"], [id*="propertyType"]', value: formValues.propertyType, type: 'select' },
      { selector: '[name*="propertyUse"], [id*="propertyUse"]', value: formValues.propertyUse, type: 'select' },
      { selector: '[name*="occupancy"], [id*="occupancy"]', value: formValues.occupancy, type: 'select' },
      { selector: '[name*="military"], [name*="veteran"], [id*="military"], [id*="veteran"]', value: formValues.militaryVeteran, type: 'select' },
      { selector: '[name*="zip"], [id*="zip"], input[placeholder*="ZIP"]', value: formValues.zipCode, type: 'input' },
      { selector: '[name*="price"], [name*="purchase"], [id*="purchasePrice"], [name*="loan"][name*="amount"]', value: formValues.purchasePrice, type: 'input' },
      { selector: '[name*="down"], [id*="downPayment"]', value: formValues.downPayment, type: 'input' },
      { selector: '[name*="credit"], [name*="fico"], [id*="creditScore"]', value: formValues.creditScore, type: 'select' }
    ];

    for (const attempt of fillAttempts) {
      try {
        const element = await page.$(attempt.selector);
        if (element) {
          if (attempt.type === 'select') {
            await page.selectOption(attempt.selector, { label: attempt.value }).catch(() =>
              page.selectOption(attempt.selector, attempt.value)
            );
            console.log(`  Filled: ${attempt.selector.split(',')[0]}...`);
          } else {
            await element.fill(attempt.value);
            console.log(`  Filled: ${attempt.selector.split(',')[0]}...`);
          }
        }
      } catch (e) {
        // Selector didn't match
      }
    }

    // Submit form
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Get Rates")',
      'button:has-text("View Rates")',
      'button:has-text("Calculate")',
      '.submit-button',
      '#submit'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const buttonText = await button.textContent();
          console.log(`\nSubmitting form via: "${buttonText?.trim()}"`);
          await button.click();
          await delay(5000);
          submitted = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    // Extract results
    console.log('\n--- Extracting results ---');

    const tableData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const results = [];

      tables.forEach((table, tableIndex) => {
        const rows = table.querySelectorAll('tr');
        const tableRows = [];

        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          const rowData = Array.from(cells).map(cell => cell.textContent?.trim());
          if (rowData.length > 0) {
            tableRows.push(rowData);
          }
        });

        if (tableRows.length > 0) {
          results.push({ tableIndex, rows: tableRows });
        }
      });

      return results;
    });

    let rateData = null;

    if (tableData.length > 0) {
      console.log('Table data found');
      if (isDebug) {
        console.log(JSON.stringify(tableData, null, 2));
      }

      // Parse rate from table
      const parsed = parseRateFromTable(tableData);
      if (parsed) {
        rateData = {
          interestRate: parsed.interestRate,
          rawRow: parsed.rawData,
          tableData: tableData
        };
      }
    } else {
      // Try finding rate in other elements
      const rateInfo = await page.evaluate(() => {
        const rateElements = document.querySelectorAll('[class*="rate"], [class*="Rate"], [class*="apr"], [class*="APR"]');
        return Array.from(rateElements).map(el => el.textContent?.trim()).filter(Boolean);
      });

      if (rateInfo.length > 0) {
        console.log('Rate elements found:', rateInfo.slice(0, 5));
        // Try to extract rate
        const ratePattern = /(\d+\.\d{1,3})%/;
        for (const text of rateInfo) {
          const match = text.match(ratePattern);
          if (match) {
            rateData = {
              interestRate: parseFloat(match[1]),
              rawText: text
            };
            break;
          }
        }
      }
    }

    // Take screenshot in debug mode
    if (isDebug) {
      await page.screenshot({ path: 'page-screenshot.png', fullPage: true });
      console.log('\nScreenshot saved to page-screenshot.png');
    }

    // Process rate data
    if (rateData) {
      console.log(`\n✓ Interest Rate Found: ${rateData.interestRate}%`);

      // Log the rate
      const logEntry = logRate({
        interestRate: rateData.interestRate,
        formValues: formValues,
        raw: rateData.rawRow || rateData.rawText
      });

      // Check if alert should be sent
      if (shouldAlert(rateData.interestRate)) {
        console.log(`\n🔔 ALERT: Rate ${rateData.interestRate}% is below threshold ${config.alerts.interestRateThreshold}%`);

        await sendRateAlert({
          interestRate: rateData.interestRate,
          timestamp: logEntry.timestamp,
          loanType: '30-Year Fixed' // Adjust based on actual form selection
        });
      } else {
        console.log(`\n○ Rate ${rateData.interestRate}% is above threshold ${config.alerts.interestRateThreshold}% - no alert`);
      }

      // Check for rate change
      if (config.alerts.alertOnAnyChange && hasRateChanged(rateData.interestRate)) {
        console.log('Rate has changed from previous check');
      }

      return { success: true, rate: rateData.interestRate };
    } else {
      console.log('\n✗ Could not extract interest rate from page');
      return { success: false, error: 'Could not extract rate' };
    }

  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Run directly if not imported
const isMainModule = process.argv[1]?.endsWith('index.js');
if (isMainModule) {
  checkRates()
    .then(result => {
      console.log('\n--- Check completed ---');
      console.log('Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
