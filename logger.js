import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, config.logging.logFile);

/**
 * Load existing rate history from file
 */
export function loadHistory() {
  try {
    if (fs.existsSync(logFilePath)) {
      const data = fs.readFileSync(logFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading history:', error.message);
  }
  return { entries: [] };
}

/**
 * Save rate history to file
 */
export function saveHistory(history) {
  try {
    // Trim to max entries
    if (history.entries.length > config.logging.maxEntries) {
      history.entries = history.entries.slice(-config.logging.maxEntries);
    }
    fs.writeFileSync(logFilePath, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error saving history:', error.message);
  }
}

/**
 * Log a new rate entry
 */
export function logRate(rateData) {
  const history = loadHistory();

  const entry = {
    timestamp: new Date().toISOString(),
    ...rateData
  };

  history.entries.push(entry);
  saveHistory(history);

  console.log(`[${entry.timestamp}] Rate logged: ${rateData.interestRate}%`);

  return entry;
}

/**
 * Get the last logged rate
 */
export function getLastRate() {
  const history = loadHistory();
  if (history.entries.length === 0) {
    return null;
  }
  return history.entries[history.entries.length - 1];
}

/**
 * Check if rate has changed from last entry
 */
export function hasRateChanged(newRate) {
  const lastEntry = getLastRate();
  if (!lastEntry) {
    return true; // First entry, consider it a change
  }
  return lastEntry.interestRate !== newRate;
}

/**
 * Get rate history for the last N days
 */
export function getRecentHistory(days = 7) {
  const history = loadHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return history.entries.filter(entry =>
    new Date(entry.timestamp) >= cutoff
  );
}
