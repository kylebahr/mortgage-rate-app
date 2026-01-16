// Mortgage Rate Tracker - Iframe Content Script
// Runs inside the OptimalBlue iframe

const FORM_VALUES = {
  occupancy: 'Primary Residence',
  propertyType: 'Single Family',
  loanPurpose: 'Purchase',
  purchasePrice: '765900',
  downPayment: '306000',
  state: 'Missouri (MO)',
  zipCode: '64108',
  creditScore: '740',
  militaryVeteran: 'No'
};

console.log('[MortgageTracker-Iframe] Content script loaded in OptimalBlue iframe');

// Wait for the form to be ready
waitForForm();

async function waitForForm() {
  console.log('[MortgageTracker-Iframe] Waiting for form elements...');

  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    const selects = document.querySelectorAll('select');
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');

    if (selects.length > 0 || inputs.length > 0) {
      console.log(`[MortgageTracker-Iframe] Found ${selects.length} selects, ${inputs.length} inputs`);
      await delay(1000); // Extra wait for everything to settle
      startExtraction();
      return;
    }

    attempts++;
    await delay(1000);
  }

  console.log('[MortgageTracker-Iframe] Form elements never appeared');
  chrome.runtime.sendMessage({
    type: 'EXTRACTION_FAILED',
    error: 'Form elements never appeared in iframe'
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startExtraction() {
  console.log('[MortgageTracker-Iframe] Starting extraction process...');

  try {
    // Fill the form
    await fillForm();
    console.log('[MortgageTracker-Iframe] Form filled, submitting...');

    // Submit and wait for results
    await submitForm();
    console.log('[MortgageTracker-Iframe] Waiting for results...');

    // Wait for results to load
    await delay(5000);

    // Extract the rate
    const rate = extractRate();

    if (rate) {
      console.log(`[MortgageTracker-Iframe] Rate extracted: ${rate}%`);
      chrome.runtime.sendMessage({
        type: 'RATE_EXTRACTED',
        data: {
          rate: rate,
          loanType: '30-Year Fixed Conforming',
          timestamp: new Date().toISOString()
        }
      });
    } else {
      throw new Error('Could not extract rate from results');
    }

  } catch (error) {
    console.error('[MortgageTracker-Iframe] Error:', error.message);
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_FAILED',
      error: error.message
    });
  }
}

async function fillForm() {
  // Fill dropdowns
  const selects = document.querySelectorAll('select');
  console.log(`[MortgageTracker-Iframe] Filling ${selects.length} select elements`);

  for (const select of selects) {
    const id = (select.id || '').toLowerCase();
    const name = (select.name || '').toLowerCase();
    const identifier = id + name;

    let valueToSet = null;

    if (identifier.includes('occupancy')) {
      valueToSet = FORM_VALUES.occupancy;
    } else if (identifier.includes('property') && identifier.includes('type')) {
      valueToSet = FORM_VALUES.propertyType;
    } else if (identifier.includes('purpose') || (identifier.includes('loan') && !identifier.includes('amount'))) {
      valueToSet = FORM_VALUES.loanPurpose;
    } else if (identifier.includes('state') && !identifier.includes('estate')) {
      // Skip state field - it's pre-filled correctly
      console.log(`[MortgageTracker-Iframe] Skipping state field (pre-filled)`);
      continue;
    } else if (identifier.includes('credit') || identifier.includes('score') || identifier.includes('fico')) {
      valueToSet = FORM_VALUES.creditScore;
    } else if (identifier.includes('veteran') || identifier.includes('military') || identifier.includes('va')) {
      valueToSet = FORM_VALUES.militaryVeteran;
    }

    if (valueToSet) {
      // Check if already set to correct value
      const currentText = select.options[select.selectedIndex]?.text || '';
      if (currentText.toLowerCase().includes(valueToSet.toLowerCase().split(' ')[0])) {
        console.log(`[MortgageTracker-Iframe] Skipping ${identifier} - already set to "${currentText}"`);
        continue;
      }

      const success = setSelectValue(select, valueToSet);
      console.log(`[MortgageTracker-Iframe] Set ${identifier}: ${valueToSet} (${success ? 'success' : 'failed'})`);
      await delay(300);
    }
  }

  // Fill text inputs
  const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
  console.log(`[MortgageTracker-Iframe] Filling ${inputs.length} input elements`);

  for (const input of inputs) {
    const id = (input.id || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    const identifier = id + name + placeholder;

    let valueToSet = null;

    if (identifier.includes('price') || identifier.includes('purchase') || identifier.includes('home value')) {
      valueToSet = FORM_VALUES.purchasePrice;
    } else if (identifier.includes('down')) {
      valueToSet = FORM_VALUES.downPayment;
    } else if (identifier.includes('zip') || identifier.includes('postal')) {
      // Skip ZIP if already filled (often pre-filled based on state)
      if (input.value && input.value.length >= 5) {
        console.log(`[MortgageTracker-Iframe] Skipping ZIP - already filled: ${input.value}`);
        continue;
      }
      valueToSet = FORM_VALUES.zipCode;
    }

    if (valueToSet) {
      // Skip if already has the correct value
      if (input.value === valueToSet) {
        console.log(`[MortgageTracker-Iframe] Skipping ${identifier} - already set to "${input.value}"`);
        continue;
      }

      input.focus();
      input.value = valueToSet;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      console.log(`[MortgageTracker-Iframe] Set ${identifier}: ${valueToSet}`);
      await delay(300);
    }
  }
}

function setSelectValue(select, value) {
  // Try to find option by text content (exact or partial match)
  const valueLower = value.toLowerCase();

  for (const option of select.options) {
    const optText = option.text.toLowerCase();
    const optValue = option.value.toLowerCase();

    if (optText === valueLower || optValue === valueLower ||
        optText.includes(valueLower) || optValue.includes(valueLower)) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  // Try matching key parts
  const keyParts = valueLower.split(/\s+/);
  for (const option of select.options) {
    const optText = option.text.toLowerCase();
    if (keyParts.every(part => optText.includes(part))) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  return false;
}

async function submitForm() {
  // Find submit button
  const buttons = document.querySelectorAll('button, input[type="submit"]');
  const submitKeywords = ['submit', 'get rate', 'view rate', 'calculate', 'search', 'find', 'quote', 'see rate', 'check rate'];

  console.log(`[MortgageTracker-Iframe] Looking for submit button among ${buttons.length} buttons`);

  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || '').toLowerCase().trim();
    console.log(`[MortgageTracker-Iframe] Button: "${text}"`);

    if (submitKeywords.some(k => text.includes(k))) {
      btn.click();
      console.log(`[MortgageTracker-Iframe] Clicked: "${text}"`);
      return;
    }
  }

  // Try any primary/submit styled button
  for (const btn of buttons) {
    const classes = (btn.className || '').toLowerCase();
    const text = (btn.textContent || btn.value || '').toLowerCase();

    if ((classes.includes('primary') || classes.includes('submit') || btn.type === 'submit') &&
        !text.includes('log') && !text.includes('sign') && !text.includes('cancel')) {
      btn.click();
      console.log(`[MortgageTracker-Iframe] Clicked primary button: "${text}"`);
      return;
    }
  }

  console.log('[MortgageTracker-Iframe] No submit button found, trying form submit');
  const form = document.querySelector('form');
  if (form) {
    form.submit();
  }
}

function extractRate() {
  console.log('[MortgageTracker-Iframe] Extracting rate from results...');

  // Look for the no-points rate in results table
  const rows = document.querySelectorAll('tr');
  console.log(`[MortgageTracker-Iframe] Found ${rows.length} table rows`);

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td, th'));
    const cellTexts = cells.map(c => c.textContent?.trim() || '');
    const rowText = cellTexts.join(' | ');

    // Look for row with rate and 0.000 or 0 points
    const hasRate = cellTexts.some(c => /^\d+\.\d{2,3}%?$/.test(c));
    const hasZeroPoints = cellTexts.some(c => /^0(\.0{1,3})?$/.test(c));

    if (hasRate && hasZeroPoints) {
      console.log(`[MortgageTracker-Iframe] Found zero-points row: ${rowText}`);
      // Extract the rate value
      for (const cellText of cellTexts) {
        const match = cellText.match(/^(\d+\.\d{2,3})%?$/);
        if (match) {
          return parseFloat(match[1]);
        }
      }
    }
  }

  // Fallback: look for any rate display on page
  const rateElements = document.querySelectorAll('[class*="rate"], [class*="Rate"], [id*="rate"], [id*="Rate"]');
  for (const el of rateElements) {
    const text = el.textContent || '';
    const match = text.match(/(\d+\.\d{2,3})%/);
    if (match) {
      console.log(`[MortgageTracker-Iframe] Found rate in element: ${match[1]}%`);
      return parseFloat(match[1]);
    }
  }

  // Last resort: find any percentage on page
  const allText = document.body?.textContent || '';
  const allRates = allText.match(/\d+\.\d{2,3}%/g) || [];
  console.log(`[MortgageTracker-Iframe] All rates found on page: ${allRates.join(', ')}`);

  if (allRates.length > 0) {
    // Return the first reasonable mortgage rate (between 2% and 15%)
    for (const rateStr of allRates) {
      const rate = parseFloat(rateStr);
      if (rate >= 2 && rate <= 15) {
        return rate;
      }
    }
  }

  return null;
}
