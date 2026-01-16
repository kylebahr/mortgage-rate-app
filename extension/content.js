// Mortgage Rate Tracker - Content Script
// Runs on Commerce Bank mortgage page

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

console.log('[MortgageTracker] Content script loaded');

// Wait for page to be ready, then start extraction
setTimeout(startExtraction, 3000);

async function startExtraction() {
  console.log('[MortgageTracker] Starting extraction process...');

  try {
    // Find the OptimalBlue iframe
    const iframe = await waitForIframe();
    if (!iframe) {
      throw new Error('Could not find OptimalBlue iframe');
    }

    console.log('[MortgageTracker] Found iframe, waiting for form...');

    // Wait for form elements inside iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    await waitForFormElements(iframeDoc);

    console.log('[MortgageTracker] Form elements found, filling form...');

    // Fill the form
    await fillForm(iframeDoc);

    console.log('[MortgageTracker] Form filled, submitting...');

    // Submit and wait for results
    await submitForm(iframeDoc);

    console.log('[MortgageTracker] Waiting for results...');

    // Wait for results to load
    await delay(5000);

    // Extract the rate
    const rate = extractRate(iframeDoc);

    if (rate) {
      console.log(`[MortgageTracker] Rate extracted: ${rate}%`);
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
    console.error('[MortgageTracker] Error:', error.message);
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_FAILED',
      error: error.message
    });
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForIframe(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    // Look for OptimalBlue iframe
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const src = iframe.src || '';
      if (src.includes('optimalblue') || iframe.id === 'EoFrame') {
        // Wait a bit for iframe content to load
        await delay(2000);
        return iframe;
      }
    }
    await delay(1000);
  }
  return null;
}

async function waitForFormElements(doc, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const selects = doc.querySelectorAll('select');
    const inputs = doc.querySelectorAll('input[type="text"], input[type="number"]');

    if (selects.length > 0 || inputs.length > 0) {
      console.log(`[MortgageTracker] Found ${selects.length} selects, ${inputs.length} inputs`);
      return true;
    }

    await delay(1000);
  }
  throw new Error('Form elements never appeared');
}

async function fillForm(doc) {
  // Fill dropdowns
  const selects = doc.querySelectorAll('select');
  for (const select of selects) {
    const id = (select.id || '').toLowerCase();
    const name = (select.name || '').toLowerCase();
    const identifier = id + name;

    let valueToSet = null;

    if (identifier.includes('occupancy')) {
      valueToSet = FORM_VALUES.occupancy;
    } else if (identifier.includes('property') && identifier.includes('type')) {
      valueToSet = FORM_VALUES.propertyType;
    } else if (identifier.includes('purpose') || identifier.includes('loan')) {
      valueToSet = FORM_VALUES.loanPurpose;
    } else if (identifier.includes('state')) {
      valueToSet = FORM_VALUES.state;
    } else if (identifier.includes('credit') || identifier.includes('score')) {
      valueToSet = FORM_VALUES.creditScore;
    } else if (identifier.includes('veteran') || identifier.includes('military')) {
      valueToSet = FORM_VALUES.militaryVeteran;
    }

    if (valueToSet) {
      setSelectValue(select, valueToSet);
      console.log(`[MortgageTracker] Set ${identifier}: ${valueToSet}`);
      await delay(200);
    }
  }

  // Fill text inputs
  const inputs = doc.querySelectorAll('input[type="text"], input[type="number"]');
  for (const input of inputs) {
    const id = (input.id || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    const identifier = id + name + placeholder;

    let valueToSet = null;

    if (identifier.includes('price') || identifier.includes('purchase')) {
      valueToSet = FORM_VALUES.purchasePrice;
    } else if (identifier.includes('down')) {
      valueToSet = FORM_VALUES.downPayment;
    } else if (identifier.includes('zip')) {
      valueToSet = FORM_VALUES.zipCode;
    }

    if (valueToSet) {
      input.value = valueToSet;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[MortgageTracker] Set ${identifier}: ${valueToSet}`);
      await delay(200);
    }
  }
}

function setSelectValue(select, value) {
  // Try to find option by text content
  for (const option of select.options) {
    if (option.text.includes(value) || option.value.includes(value)) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  // Try partial match
  const valueLower = value.toLowerCase();
  for (const option of select.options) {
    if (option.text.toLowerCase().includes(valueLower) ||
        option.value.toLowerCase().includes(valueLower)) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  return false;
}

async function submitForm(doc) {
  // Find submit button
  const buttons = doc.querySelectorAll('button, input[type="submit"]');
  const submitKeywords = ['submit', 'get rate', 'view rate', 'calculate', 'search', 'find', 'quote'];

  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || '').toLowerCase();
    if (submitKeywords.some(k => text.includes(k))) {
      btn.click();
      console.log(`[MortgageTracker] Clicked: ${text}`);
      return;
    }
  }

  // Try any button that's not login/cancel
  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || '').toLowerCase();
    if (!text.includes('log') && !text.includes('sign') && !text.includes('cancel')) {
      btn.click();
      console.log(`[MortgageTracker] Clicked fallback: ${text}`);
      return;
    }
  }

  throw new Error('No submit button found');
}

function extractRate(doc) {
  // Look for the no-points rate in Conforming 30 Year Fixed section
  const rows = doc.querySelectorAll('tr');

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td, th'));
    const cellTexts = cells.map(c => c.textContent?.trim() || '');

    // Look for row with rate and 0.000 points
    const hasRate = cellTexts.some(c => /^\d+\.\d{2,3}%$/.test(c));
    const hasZeroPoints = cellTexts.some(c => c === '0.000' || c === '0' || c === '0.00');

    if (hasRate && hasZeroPoints) {
      // Extract the rate value
      for (const cellText of cellTexts) {
        const match = cellText.match(/^(\d+\.\d{2,3})%$/);
        if (match) {
          return parseFloat(match[1]);
        }
      }
    }
  }

  // Fallback: find any rate on the page
  const allText = doc.body?.textContent || '';
  const rateMatch = allText.match(/(\d+\.\d{2,3})%/);
  if (rateMatch) {
    return parseFloat(rateMatch[1]);
  }

  return null;
}
