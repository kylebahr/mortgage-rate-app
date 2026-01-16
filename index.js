import { chromium } from 'playwright';
import { config } from './config.js';
import { logRate, getLastRate, hasRateChanged } from './logger.js';
import { shouldAlert, sendRateAlert } from './alerter.js';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract interest rate from results
 */
function parseRate(text) {
  const ratePattern = /(\d+\.\d{1,3})%/;
  const match = text.match(ratePattern);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Main function to check mortgage rates
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
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/Chicago'
    });

    const page = await context.newPage();

    // Anti-detection: Override webdriver property and other headless indicators
    await page.addInitScript(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });

      // Remove automation indicators
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

      // Mock chrome object
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    });

    // First visit Commerce Bank to establish session/cookies
    const commerceBankUrl = 'https://www.commercebank.com/personal/borrow/mortgage-checks';
    console.log(`Visiting Commerce Bank first: ${commerceBankUrl}`);
    await page.goto(commerceBankUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await delay(3000);
    console.log('Commerce Bank page loaded');

    // Now navigate to the OptimalBlue URL
    console.log(`\nNavigating to: ${config.targetUrl}`);
    await page.goto(config.targetUrl, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for page to fully load - OptimalBlue uses dynamic JS rendering
    console.log('Waiting for page to render...');
    await delay(5000);

    // Wait for form elements to appear (try multiple selectors)
    const formSelectors = ['select', 'input[type="text"]', 'input[type="number"]', 'button', '.form-control', '[class*="input"]', '[class*="select"]'];
    let foundElements = false;

    for (let attempt = 0; attempt < 15; attempt++) {
      for (const selector of formSelectors) {
        try {
          const count = await page.locator(selector).count();
          if (count > 0) {
            console.log(`Found ${count} elements matching "${selector}" on attempt ${attempt + 1}`);
            foundElements = true;
            break;
          }
        } catch (e) {
          // Continue trying
        }
      }

      if (foundElements) break;

      console.log(`Attempt ${attempt + 1}: No form elements yet, waiting...`);
      await delay(2000);
    }

    // Get full page HTML to see what's actually there
    const bodyHtml = await page.evaluate(() => document.body?.innerHTML || '').catch(() => '');
    console.log('\nPage body HTML (first 2000 chars):');
    console.log(bodyHtml.substring(0, 2000));

    // Take debug screenshot
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    console.log('\nDebug screenshot saved');

    // Use page directly
    const formContext = page;
    console.log('\n--- Form loaded ---');

    // Log what we found in the form context
    const formElements = await formContext.evaluate(() => {
      const elements = { selects: [], inputs: [], buttons: [] };

      document.querySelectorAll('select').forEach(el => {
        const options = Array.from(el.options).map(opt => ({
          value: opt.value,
          text: opt.text
        }));
        elements.selects.push({
          id: el.id,
          name: el.name,
          className: el.className,
          options: options.slice(0, 5) // First 5 options
        });
      });

      document.querySelectorAll('input').forEach(el => {
        if (el.type !== 'hidden') {
          elements.inputs.push({
            id: el.id,
            name: el.name,
            type: el.type,
            placeholder: el.placeholder,
            className: el.className
          });
        }
      });

      document.querySelectorAll('button, input[type="submit"]').forEach(el => {
        const text = el.textContent?.trim() || el.value;
        if (text && !text.toLowerCase().includes('log in') && !text.toLowerCase().includes('sign in')) {
          elements.buttons.push({
            id: el.id,
            type: el.type,
            text: text,
            className: el.className
          });
        }
      });

      return elements;
    }).catch(() => ({ selects: [], inputs: [], buttons: [] }));

    console.log('\nForm elements found:');
    console.log('Selects:', JSON.stringify(formElements.selects, null, 2));
    console.log('Inputs:', JSON.stringify(formElements.inputs, null, 2));
    console.log('Buttons:', JSON.stringify(formElements.buttons, null, 2));

    // Fill form
    console.log('\n--- Filling form ---');

    // Try to fill each field by various selectors
    const fieldMappings = [
      { field: 'occupancy', value: formValues.occupancy, keywords: ['occupancy'] },
      { field: 'propertyType', value: formValues.propertyType, keywords: ['property', 'type'] },
      { field: 'loanPurpose', value: formValues.loanPurpose, keywords: ['purpose', 'loan'] },
      { field: 'purchasePrice', value: formValues.purchasePrice, keywords: ['price', 'purchase'] },
      { field: 'downPayment', value: formValues.downPayment, keywords: ['down', 'payment'] },
      { field: 'state', value: formValues.state, keywords: ['state'] },
      { field: 'zipCode', value: formValues.zipCode, keywords: ['zip'] },
      { field: 'creditScore', value: formValues.creditScore, keywords: ['credit', 'score'] },
      { field: 'militaryVeteran', value: formValues.militaryVeteran, keywords: ['military', 'veteran'] }
    ];

    for (const mapping of fieldMappings) {
      // Find matching element
      for (const select of formElements.selects) {
        const idName = (select.id + select.name + select.className).toLowerCase();
        if (mapping.keywords.some(k => idName.includes(k))) {
          try {
            const selector = select.id ? `#${select.id}` : `select[name="${select.name}"]`;
            await formContext.selectOption(selector, { label: mapping.value }).catch(() =>
              formContext.selectOption(selector, mapping.value)
            );
            console.log(`  Filled ${mapping.field}: ${mapping.value}`);
          } catch (e) {
            console.log(`  Could not fill ${mapping.field}: ${e.message}`);
          }
          break;
        }
      }

      for (const input of formElements.inputs) {
        const idName = (input.id + input.name + input.placeholder + input.className).toLowerCase();
        if (mapping.keywords.some(k => idName.includes(k))) {
          try {
            const selector = input.id ? `#${input.id}` : `input[name="${input.name}"]`;
            await formContext.fill(selector, mapping.value);
            console.log(`  Filled ${mapping.field}: ${mapping.value}`);
          } catch (e) {
            console.log(`  Could not fill ${mapping.field}: ${e.message}`);
          }
          break;
        }
      }
    }

    // Find and click submit button (not Log In)
    console.log('\n--- Submitting form ---');

    let submitted = false;
    const submitKeywords = ['submit', 'get rate', 'view rate', 'calculate', 'search', 'find'];

    for (const btn of formElements.buttons) {
      const btnText = (btn.text || '').toLowerCase();
      if (submitKeywords.some(k => btnText.includes(k))) {
        try {
          const selector = btn.id ? `#${btn.id}` : `button:has-text("${btn.text}")`;
          await formContext.click(selector);
          console.log(`Clicked: "${btn.text}"`);
          submitted = true;
          break;
        } catch (e) {
          console.log(`Could not click "${btn.text}": ${e.message}`);
        }
      }
    }

    if (!submitted) {
      // Try generic submit button
      try {
        await formContext.click('button[type="submit"]');
        console.log('Clicked generic submit button');
        submitted = true;
      } catch (e) {
        console.log('No submit button found');
      }
    }

    // Wait for results
    await delay(5000);

    // Extract results
    console.log('\n--- Extracting results ---');

    // Look for the no-points rate in Conforming 30 Year Fixed section
    const rateData = await formContext.evaluate(() => {
      const results = {
        allRates: [],
        noPointsRate: null,
        tableRows: []
      };

      // Find all table rows
      const rows = document.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent?.trim());
        if (cells.length > 0) {
          results.tableRows.push(cells);

          // Look for row with "0.000" or "0" in discount points column (usually 4th column)
          // and extract the rate (usually 3rd column)
          const rowText = cells.join(' ');

          // Check if this is a data row with a rate
          const hasRate = cells.some(c => /^\d+\.\d{2,3}%$/.test(c));
          const hasZeroPoints = cells.some(c => c === '0.000' || c === '0' || c === '0.00');

          if (hasRate && hasZeroPoints) {
            // Find the rate value (format: X.XXX%)
            for (const cell of cells) {
              if (/^\d+\.\d{2,3}%$/.test(cell)) {
                results.noPointsRate = cell;
                break;
              }
            }
          }

          // Also collect all rates found
          cells.forEach(cell => {
            if (/^\d+\.\d{2,3}%$/.test(cell)) {
              results.allRates.push(cell);
            }
          });
        }
      });

      return results;
    }).catch(() => ({ allRates: [], noPointsRate: null, tableRows: [] }));

    console.log('Table rows found:', rateData.tableRows.length);
    console.log('All rates found:', rateData.allRates);
    console.log('No-points rate:', rateData.noPointsRate);

    // Use the no-points rate, or fall back to first rate found
    let interestRate = null;
    if (rateData.noPointsRate) {
      interestRate = parseRate(rateData.noPointsRate);
      console.log(`\n✓ No-Points Rate Found: ${interestRate}%`);
    } else if (rateData.allRates.length > 0) {
      interestRate = parseRate(rateData.allRates[0]);
      console.log(`\n✓ Interest Rate Found (fallback): ${interestRate}%`);
    }

    // Take screenshot
    if (isDebug) {
      await page.screenshot({ path: 'page-screenshot.png', fullPage: true });
      console.log('\nScreenshot saved to page-screenshot.png');
    }

    // Process rate data
    if (interestRate) {
      // Log the rate
      const logEntry = logRate({
        interestRate: interestRate,
        formValues: formValues
      });

      // Check if alert should be sent
      if (shouldAlert(interestRate)) {
        console.log(`\n🔔 ALERT: Rate ${interestRate}% is below threshold ${config.alerts.interestRateThreshold}%`);

        await sendRateAlert({
          interestRate: interestRate,
          timestamp: logEntry.timestamp,
          loanType: '30-Year Fixed'
        });
      } else {
        console.log(`\n○ Rate ${interestRate}% is above threshold ${config.alerts.interestRateThreshold}% - no alert`);
      }

      return { success: true, rate: interestRate };
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
