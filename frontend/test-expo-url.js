const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Parse EXPO_PUBLIC_BACKEND_URL
const backendMatch = envContent.match(/EXPO_PUBLIC_BACKEND_URL=(.+)/);
const backendUrl = backendMatch ? backendMatch[1].trim() : '';

console.log('\n=== EXPO CONFIGURATION ===');
console.log('Backend URL:', backendUrl);
console.log('\n=== EXPO APP URL ===');
console.log('Your app should be accessible at:');
console.log('📱 Expo Go App: Open Expo Go and scan this URL:');
console.log('\n   exp://' + backendUrl.replace('https://', '').replace('http://', ''));
console.log('\n📲 Or use this direct link:');
console.log('   ' + backendUrl);
console.log('\n🌐 Web Panel (Admin/Kitchen/Cashier):');
console.log('   ' + backendUrl);
console.log('\n=========================\n');
