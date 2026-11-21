require('dotenv').config();

const OPENWA_URL = (process.env.OPENWA_URL || 'http://localhost:2785/api').replace(/\/$/, '');
const OPENWA_API_KEY = process.env.OPENWA_API_KEY;
const OPENWA_SESSION_ID = process.env.OPENWA_SESSION_ID;

if (!OPENWA_API_KEY) {
  console.warn('⚠️ WARNING: OPENWA_API_KEY is not defined in .env');
}

if (!OPENWA_SESSION_ID) {
  console.warn('⚠️ WARNING: OPENWA_SESSION_ID is not defined in .env');
}

// Rate limiting: Maximum 5 messages per minute
const MAX_PER_MINUTE = 5;
const WINDOW_MS = 60 * 1000;
const sendTimestamps = [];

/**
 * Ensures sending adheres to the rate limit of max 5 messages per minute
 */
async function enforceRateLimit() {
  const now = Date.now();
  // Remove timestamps older than 60 seconds
  while (sendTimestamps.length > 0 && sendTimestamps[0] <= now - WINDOW_MS) {
    sendTimestamps.shift();
  }

  if (sendTimestamps.length >= MAX_PER_MINUTE) {
    const oldest = sendTimestamps[0];
    const waitTime = oldest + WINDOW_MS - now + 100; // time until oldest expires + 100ms margin
    console.log(`⏳ Rate limit reached (max ${MAX_PER_MINUTE}/min). Waiting ${(waitTime / 1000).toFixed(1)}s before sending...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    return enforceRateLimit();
  }

  sendTimestamps.push(Date.now());
}

/**
 * Format phone number to WhatsApp chatId format (e.g. "91XXXXXXXXXX@c.us")
 */
function formatChatId(phone) {
  if (phone.includes('@c.us') || phone.includes('@g.us')) {
    return phone;
  }
  const cleaned = phone.replace(/[^0-9]/g, '');
  return `${cleaned}@c.us`;
}

/**
 * Send text message with retry logic and rate limit protection
 * @param {string} phone - Target phone number or chatId
 * @param {string} text - Message text
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @param {number} retryDelayMs - Initial retry delay (default: 2000ms)
 */
async function sendText(phone, text, maxRetries = 3, retryDelayMs = 2000) {
  if (!OPENWA_API_KEY) {
    throw new Error('OPENWA_API_KEY must be configured in .env');
  }
  if (!OPENWA_SESSION_ID) {
    throw new Error('OPENWA_SESSION_ID must be configured in .env');
  }

  const chatId = formatChatId(phone);
  const endpoint = `${OPENWA_URL}/sessions/${OPENWA_SESSION_ID}/messages/send-text`;

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      // 1. Enforce max 5 messages / minute
      await enforceRateLimit();

      console.log(`📤 [Attempt ${attempt}/${maxRetries}] Sending message to ${chatId}...`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': OPENWA_API_KEY,
        },
        body: JSON.stringify({
          chatId,
          text,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(`OpenWA HTTP ${response.status}: ${data.message || JSON.stringify(data)}`);
      }

      console.log(`✅ Message sent successfully to ${chatId}! ID:`, data.id || 'N/A');
      return data;
    } catch (err) {
      console.error(`❌ Send attempt ${attempt} failed:`, err.message);

      if (attempt >= maxRetries) {
        throw new Error(`Failed to send message after ${maxRetries} attempts: ${err.message}`);
      }

      const backoff = retryDelayMs * attempt;
      console.log(`⏳ Retrying in ${backoff / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

module.exports = {
  sendText,
  formatChatId,
};
