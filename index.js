import { chromium } from 'playwright';

// Hardcoded form values - modify these as needed
const FORM_VALUES = {
  loanPurpose: 'Purchase',       // Purchase, Refinance
  propertyType: 'Single Family', // Single Family, Condo, Multi-Family, etc.
  propertyUse: 'Primary',        // Primary, Secondary, Investment
  zipCode: '64108',              // Missouri ZIP code (Commerce Bank territory)
  purchasePrice: '400000',       // Purchase price in dollars
  downPayment: '80000',          // Down payment (20% of purchase price)
  creditScore: '740'             // Credit score range
};

const TARGET_URL = 'https://www.commercebank.com/personal/borrow/mortgages/mortgage-rates';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fillMortgageForm() {
  const isDebug = process.argv.includes('--debug');

  console.log('Starting Commerce Bank Mortgage Rate Scraper...');
  console.log('Form values:', JSON.stringify(FORM_VALUES, null, 2));

  const launchOptions = {
    headless: !isDebug,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  };

  // Allow custom Chrome path via environment variable
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

    console.log(`Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for the page to fully load
    await delay(3000);

    // First, let's discover what's on the page
    console.log('\n--- Discovering page structure ---');

    // Find all form elements
    const formElements = await page.evaluate(() => {
      const elements = {
        selects: [],
        inputs: [],
        buttons: [],
        labels: []
      };

      // Get all select elements
      document.querySelectorAll('select').forEach(el => {
        const options = Array.from(el.options).map(opt => ({
          value: opt.value,
          text: opt.text
        }));
        elements.selects.push({
          id: el.id,
          name: el.name,
          className: el.className,
          options
        });
      });

      // Get all input elements
      document.querySelectorAll('input').forEach(el => {
        elements.inputs.push({
          id: el.id,
          name: el.name,
          type: el.type,
          placeholder: el.placeholder,
          className: el.className,
          value: el.value
        });
      });

      // Get all buttons
      document.querySelectorAll('button, input[type="submit"]').forEach(el => {
        elements.buttons.push({
          id: el.id,
          name: el.name,
          type: el.type,
          text: el.textContent?.trim(),
          className: el.className
        });
      });

      // Get labels
      document.querySelectorAll('label').forEach(el => {
        elements.labels.push({
          for: el.htmlFor,
          text: el.textContent?.trim()
        });
      });

      return elements;
    });

    console.log('Select elements found:', JSON.stringify(formElements.selects, null, 2));
    console.log('Input elements found:', JSON.stringify(formElements.inputs, null, 2));
    console.log('Buttons found:', JSON.stringify(formElements.buttons, null, 2));

    // Check for iframes (forms are often embedded)
    const iframes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('iframe')).map(iframe => ({
        id: iframe.id,
        name: iframe.name,
        src: iframe.src,
        className: iframe.className
      }));
    });

    if (iframes.length > 0) {
      console.log('\nIframes found:', JSON.stringify(iframes, null, 2));

      // Try to access iframe content
      for (const iframeInfo of iframes) {
        console.log(`\nAttempting to access iframe: ${iframeInfo.id || iframeInfo.name || iframeInfo.src}`);
        try {
          const frame = page.frames().find(f =>
            f.url().includes(iframeInfo.src) || f.name() === iframeInfo.name
          );
          if (frame) {
            const frameElements = await frame.evaluate(() => {
              const elements = { selects: [], inputs: [], buttons: [] };
              document.querySelectorAll('select').forEach(el => {
                elements.selects.push({ id: el.id, name: el.name });
              });
              document.querySelectorAll('input').forEach(el => {
                elements.inputs.push({ id: el.id, name: el.name, type: el.type });
              });
              document.querySelectorAll('button').forEach(el => {
                elements.buttons.push({ id: el.id, text: el.textContent?.trim() });
              });
              return elements;
            });
            console.log('Frame elements:', JSON.stringify(frameElements, null, 2));
          }
        } catch (e) {
          console.log('Could not access iframe:', e.message);
        }
      }
    }

    // Take a screenshot for debugging
    if (isDebug) {
      await page.screenshot({ path: 'page-screenshot.png', fullPage: true });
      console.log('\nScreenshot saved to page-screenshot.png');
    }

    // Now try to fill the form based on common patterns
    console.log('\n--- Attempting to fill form ---');

    // Try common selectors for mortgage forms
    const fillAttempts = [
      { selector: '[name*="purpose"], [id*="purpose"], select[name*="loan"]', value: FORM_VALUES.loanPurpose, type: 'select' },
      { selector: '[name*="property"][name*="type"], [id*="propertyType"]', value: FORM_VALUES.propertyType, type: 'select' },
      { selector: '[name*="occupancy"], [name*="property"][name*="use"], [id*="propertyUse"]', value: FORM_VALUES.propertyUse, type: 'select' },
      { selector: '[name*="zip"], [id*="zip"], input[placeholder*="ZIP"]', value: FORM_VALUES.zipCode, type: 'input' },
      { selector: '[name*="price"], [name*="purchase"], [id*="purchasePrice"], [name*="loan"][name*="amount"]', value: FORM_VALUES.purchasePrice, type: 'input' },
      { selector: '[name*="down"], [id*="downPayment"]', value: FORM_VALUES.downPayment, type: 'input' },
      { selector: '[name*="credit"], [name*="fico"], [id*="creditScore"]', value: FORM_VALUES.creditScore, type: 'select' }
    ];

    for (const attempt of fillAttempts) {
      try {
        const element = await page.$(attempt.selector);
        if (element) {
          if (attempt.type === 'select') {
            await page.selectOption(attempt.selector, { label: attempt.value }).catch(() =>
              page.selectOption(attempt.selector, attempt.value)
            );
            console.log(`Filled select ${attempt.selector} with ${attempt.value}`);
          } else {
            await element.fill(attempt.value);
            console.log(`Filled input ${attempt.selector} with ${attempt.value}`);
          }
        }
      } catch (e) {
        // Selector didn't match, continue
      }
    }

    // Look for submit button
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
          console.log(`Found submit button: "${buttonText?.trim()}"`);

          if (!isDebug) {
            await button.click();
            console.log('Form submitted, waiting for results...');
            await delay(5000);
            submitted = true;
            break;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (submitted || isDebug) {
      // Extract table data
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
            results.push({
              tableIndex,
              rows: tableRows
            });
          }
        });

        return results;
      });

      if (tableData.length > 0) {
        console.log('Table results:');
        console.log(JSON.stringify(tableData, null, 2));
      } else {
        console.log('No table data found. Looking for rate cards or divs...');

        // Try to find rate information in other formats
        const rateInfo = await page.evaluate(() => {
          const rateElements = document.querySelectorAll('[class*="rate"], [class*="Rate"], [class*="apr"], [class*="APR"]');
          return Array.from(rateElements).map(el => ({
            className: el.className,
            text: el.textContent?.trim().substring(0, 200)
          }));
        });

        if (rateInfo.length > 0) {
          console.log('Rate information found:');
          console.log(JSON.stringify(rateInfo, null, 2));
        }
      }
    }

    // Return the page content for further analysis if needed
    const pageTitle = await page.title();
    console.log(`\nPage title: ${pageTitle}`);

    if (isDebug) {
      console.log('\nDebug mode: browser will stay open. Press Ctrl+C to exit.');
      await delay(60000); // Keep browser open for 1 minute in debug mode
    }

    return { success: true };

  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Run the script
fillMortgageForm()
  .then(result => {
    console.log('\n--- Script completed ---');
    console.log('Result:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
