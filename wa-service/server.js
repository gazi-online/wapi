require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { sendText } = require('./openwa-client');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Preserve raw body buffer for HMAC signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * Verify HMAC-SHA256 signature from X-OpenWA-Signature header
 */
function verifyOpenWASignature(req) {
  if (!WEBHOOK_SECRET) {
    console.warn('⚠️ WEBHOOK_SECRET is not set in .env! Skipping signature verification.');
    return true;
  }

  const signatureHeader = req.headers['x-openwa-signature'] || req.headers['x-signature'];
  if (!signatureHeader) {
    return false;
  }

  // Header format: "sha256=<hex>" or plain hex
  const expectedHash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody || '')
    .digest('hex');

  const expectedSignature = `sha256=${expectedHash}`;

  const sigBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    // Also try without "sha256=" prefix if provider sent bare hex
    const bareExpected = Buffer.from(expectedHash);
    if (sigBuffer.length === bareExpected.length) {
      return crypto.timingSafeEqual(sigBuffer, bareExpected);
    }
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));

// Frontend UI / Health check
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return res.json({
    status: 'ok',
    service: 'OpenWA Integration Service',
    time: new Date().toISOString(),
  });
});

/**
 * Webhook Endpoint: /webhook/openwa
 * Verifies HMAC signature and logs incoming WhatsApp events
 */
app.post('/webhook/openwa', (req, res) => {
  // 1. Verify HMAC Signature
  if (!verifyOpenWASignature(req)) {
    console.error('🚫 Invalid HMAC signature on webhook request!');
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  const { event, session, data, timestamp } = req.body;
  console.log(`\n🔔 [Webhook Event] Received '${event}' at ${new Date(timestamp || Date.now()).toLocaleTimeString()}:`);

  // 2. Handle specific events
  if (event === 'message.received') {
    const from = data?.from || data?.chatId || 'Unknown sender';
    const body = data?.body || data?.text || '(Media / Non-text message)';
    const senderName = data?.notifyName || data?._data?.notifyName || 'Unknown';

    console.log(`📩 [message.received]`);
    console.log(`   From: ${senderName} (${from})`);
    console.log(`   Message: "${body}"`);
    console.log(`   Message ID: ${data?.id?.id || data?.id || 'N/A'}`);
  } else if (event === 'session.status') {
    console.log(`ℹ️ [session.status] Session '${session}' is now: ${data?.status || JSON.stringify(data)}`);
  } else {
    console.log(`ℹ️ [${event}] Data:`, JSON.stringify(data, null, 2));
  }

  // Always return 200 OK promptly to OpenWA
  return res.status(200).json({ received: true });
});

/**
 * REST Endpoint to send messages via this service
 * POST /api/send { "phone": "91XXXXXXXXXX", "text": "Hello!" }
 */
app.post('/api/send', async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) {
    return res.status(400).json({ error: 'Missing required fields: phone, text' });
  }

  try {
    const result = await sendText(phone, text);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 OpenWA Integration Service is running!`);
    console.log(`📍 Local URL: http://localhost:${PORT}`);
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook/openwa`);
    console.log(`✉️ Send API: POST http://localhost:${PORT}/api/send`);
    console.log(`===============================================`);
  });
}

module.exports = app;
