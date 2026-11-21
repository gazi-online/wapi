require('dotenv').config();
const { sendText } = require('./openwa-client');

// Replace with target test number or pass via CLI args
// e.g.: node test-send.js 919876543210 "Hello from OpenWA service!"
const targetPhone = process.argv[2] || process.env.TEST_PHONE || '919733671094';
const messageText = process.argv[3] || 'Hello! This is a test message from OpenWA Integration Service.';

async function run() {
  console.log(`🚀 Sending test WhatsApp message to: ${targetPhone}`);
  console.log(`💬 Message: "${messageText}"`);

  try {
    const result = await sendText(targetPhone, messageText);
    console.log('\n🎉 Result:', JSON.stringify(result, null, 2));
    console.log('✅ Success! Test completed.');
  } catch (err) {
    console.error('\n❌ Error sending test message:', err.message);
  }
}

run();
