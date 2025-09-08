/**
 * Verify OAuth Token Storage for Gabar AI
 * Checks if the token was successfully stored in Firestore
 */

const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore({ projectId: 'gabar-ai-athena-integration' });

async function verifyToken() {
    console.log('🔍 Checking OAuth token status in Firestore...\n');
    
    try {
        const doc = await firestore.collection('api_tokens').doc('athena-current').get();
        
        if (!doc.exists) {
            console.log('❌ No token found in Firestore');
            console.log('   Run the OAuth function first to generate a token');
            return;
        }
        
        const data = doc.data();
        const now = new Date();
        const expiresAt = data.expiresAt.toDate();
        const createdAt = data.createdAt.toDate();
        const minutesRemaining = Math.round((expiresAt - now) / 60000);
        const minutesSinceCreation = Math.round((now - createdAt) / 60000);
        
        console.log('✅ OAuth Token Found:');
        console.log('─'.repeat(50));
        console.log(`   Type: ${data.type}`);
        console.log(`   Service: ${data.service}`);
        console.log(`   Token length: ${data.token ? data.token.length : 0} characters`);
        console.log(`   Created: ${createdAt.toLocaleString()}`);
        console.log(`   Created ${minutesSinceCreation} minutes ago`);
        console.log(`   Expires: ${expiresAt.toLocaleString()}`);
        console.log(`   Time remaining: ${minutesRemaining} minutes`);
        console.log(`   Refresh count: ${data.refreshCount || 0}`);
        console.log(`   Environment: ${data.environment || 'production'}`);
        
        console.log('\n📊 Token Status:');
        if (minutesRemaining < 0) {
            console.log('   ❌ TOKEN EXPIRED - Need to refresh');
        } else if (minutesRemaining < 10) {
            console.log('   ⚠️  Token expires soon - Should refresh');
        } else {
            console.log('   ✅ Token is valid and fresh');
        }
        
        // Check if token looks valid (should be a long string)
        if (data.token && data.token.length > 100) {
            console.log('   ✅ Token format looks correct');
        } else {
            console.log('   ⚠️  Token might be malformed');
        }
        
    } catch (error) {
        console.error('❌ Error checking token:', error.message);
    }
}

// Run verification
verifyToken()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Failed:', error);
        process.exit(1);
    });