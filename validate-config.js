#!/usr/bin/env node

// Configuration Validator Script
// Run with: node validate-config.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function validateConfig() {
  console.log('🔍 Komga-Suwayomi Sync Configuration Validator\n');

  // Check .env file
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found!');
    console.log('   Please copy .env.example to .env and configure your settings\n');
    return;
  }

  console.log('✅ .env file found');

  // Load environment variables
  require('dotenv').config();

  // Check for placeholder values
  const issues = [];

  if (process.env.KOMGA_USER === '<komga_user>') {
    issues.push('❌ KOMGA_USER still has placeholder value');
  } else {
    console.log('✅ KOMGA_USER is configured');
  }

  if (process.env.KOMGA_PASS === '<komga_pass>') {
    issues.push('❌ KOMGA_PASS still has placeholder value');
  } else {
    console.log('✅ KOMGA_PASS is configured');
  }

  // Test Komga connection
  console.log('\n🌐 Testing Komga connection...');
  try {
    const komgaResponse = await axios.get('/api/v1/series?size=1', {
      baseURL: process.env.KOMGA_BASE,
      auth: {
        username: process.env.KOMGA_USER,
        password: process.env.KOMGA_PASS
      },
      timeout: 5000
    });
    console.log('✅ Komga connection successful');
    console.log(`   Found ${komgaResponse.data.totalElements} series`);
  } catch (error) {
    issues.push(`❌ Komga connection failed: ${error.code || error.message}`);
    console.log(`❌ Komga connection failed: ${error.code || error.message}`);
  }

  // Test Suwayomi connection
  console.log('\n🌐 Testing Suwayomi connection...');
  try {
    let headers = {};
    if (process.env.SUWA_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.SUWA_TOKEN}`;
    } else if (process.env.SUWA_USER && process.env.SUWA_PASS) {
      const credentials = Buffer.from(`${process.env.SUWA_USER}:${process.env.SUWA_PASS}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const suwaResponse = await axios.post('/api/graphql', {
      query: '{ library { id title } }'
    }, {
      baseURL: process.env.SUWA_BASE,
      headers,
      timeout: 5000
    });
    console.log('✅ Suwayomi connection successful');
    console.log(`   Library title: ${suwaResponse.data.data.library.title}`);
  } catch (error) {
    issues.push(`❌ Suwayomi connection failed: ${error.code || error.message}`);
    console.log(`❌ Suwayomi connection failed: ${error.code || error.message}`);
  }

  // Summary
  console.log('\n📋 Summary:');
  if (issues.length === 0) {
    console.log('🎉 All checks passed! Your configuration looks good.');
    console.log('   You can now run: npm run dev -- --match');
  } else {
    console.log('⚠️  Issues found:');
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('\n🔧 Please fix these issues before running the sync service.');
  }
}

validateConfig().catch(console.error);
