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
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    console.log(`Navigating to: ${config.targetUrl}`);
    await page.goto(config.targetUrl, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for page to fully load
    await delay(5000);

    // Look for iframes
    console.log('\n--- Looking for rate form ---');

    const iframeInfo = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      return Array.from(iframes).map(f => ({
        id: f.id,
        name: f.name,
        src: f.src,
        title: f.title
      }));
    });

    console.log(`Found ${iframeInfo.length} iframes`);
    if (iframeInfo.length > 0) {
      console.log('Iframes:', JSON.stringify(iframeInfo, null, 2));
    }

    // Try to find the rate form - could be in iframe or main page
    let formContext = page;
    let foundForm = false;

    // First check if form is in an iframe
    for (const frame of page.frames()) {
      const frameUrl = frame.url();
      console.log(`Checking frame: ${frameUrl}`);

      // Look for form elements in this frame
      const hasForm = await frame.evaluate(() => {
        const selects = document.querySelectorAll('select');
        const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
        return selects.length > 2 || inputs.length > 2;
      }).catch(() => false);

      if (hasForm) {
        console.log(`Found form in frame: ${frameUrl}`);
        formContext = frame;
        foundForm = true;
        break;
      }
    }

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

    // Get all text content and look for rate patterns
    const pageText = await formContext.evaluate(() => document.body.innerText).catch(() => '');

    // Look for rate patterns like "6.500%" or "Rate: 6.5%"
    const rateMatches = pageText.match(/\d+\.\d{1,3}%/g) || [];
    console.log('Rate patterns found:', rateMatches.slice(0, 10));

    // Try to find rates in specific elements
    const rateData = await formContext.evaluate(() => {
      const results = [];

      // Look for elements containing rate info
      const rateSelectors = [
        '[class*="rate"]', '[class*="Rate"]',
        '[class*="apr"]', '[class*="APR"]',
        '[class*="result"]', '[class*="Result"]',
        'td', 'th', '.rate', '#rate'
      ];

      for (const selector of rateSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          const text = el.textContent?.trim();
          if (text && /\d+\.\d{1,3}%/.test(text) && text.length < 100) {
            results.push(text);
          }
        });
      }

      return [...new Set(results)]; // Remove duplicates
    }).catch(() => []);

    console.log('Rate elements found:', rateData.slice(0, 10));

    // Parse the first valid rate
    let interestRate = null;
    for (const text of [...rateData, ...rateMatches]) {
      const rate = parseRate(text);
      if (rate && rate > 0 && rate < 20) { // Reasonable mortgage rate range
        interestRate = rate;
        console.log(`\n✓ Interest Rate Found: ${interestRate}%`);
        break;
      }
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
