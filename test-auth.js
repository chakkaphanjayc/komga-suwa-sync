// Test script to verify basic authentication functionality
const fetch = require('node-fetch');

async function testConfigAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/config');
    const config = await response.json();

    console.log('Configuration API Response:');
    console.log(JSON.stringify(config, null, 2));

    // Check if new Suwayomi auth fields are present
    if (config.suwa && typeof config.suwa.user !== 'undefined' && typeof config.suwa.pass !== 'undefined') {
      console.log('✅ Basic authentication fields are present in API response');
    } else {
      console.log('❌ Basic authentication fields are missing');
    }
  } catch (error) {
    console.error('Failed to test API:', error.message);
  }
}

testConfigAPI();
