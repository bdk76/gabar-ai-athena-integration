/**
 * OAuth Token Manager for Gabar AI Athena Integration
 * Refreshes AthenaHealth Bearer tokens before expiration
 * Based on the token management pattern from your Airtable scripts
 */

const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const axios = require('axios');

const firestore = new Firestore();
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

/**
 * Main function to refresh OAuth token
 * Triggered by Cloud Scheduler or Pub/Sub
 */
exports.refreshAthenaToken = async (message, context) => {
    console.log('🔑 Starting OAuth token refresh for Gabar AI...');
    
    try {
        console.log('🌐 Requesting new token from existing authentication function...');
        
        const tokenResponse = await axios.get('https://us-east4-mvp-availability-dashboard.cloudfunctions.net/authenticate-athena');
        
        console.log('✅ Token received successfully');
        
        // Step 3: Calculate expiration (50 minutes from now for safety)
        const now = new Date();
        const expiresIn = tokenResponse.data.expires_in || 3600; // Default 1 hour
        const safetyBuffer = 600; // 10 minute safety buffer
        const expiresAt = new Date(now.getTime() + (expiresIn - safetyBuffer) * 1000);
        
        // Step 4: Store token in Firestore (matching your Airtable structure)
        const tokenData = {
            token: tokenResponse.data.access_token,
            type: 'Bearer',
            service: 'Athenahealth',
            createdAt: now,
            expiresAt: expiresAt,
            expiresIn: expiresIn,
            scope: tokenResponse.data.scope || '',
            environment: 'production',
            lastRefreshed: now,
            refreshCount: 0
        };
        
        // Get previous token to track refresh count
        const previousDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        if (previousDoc.exists) {
            const previousData = previousDoc.data();
            tokenData.refreshCount = (previousData.refreshCount || 0) + 1;
        }
        
        // Store the new token
        await firestore.collection('api_tokens').doc('athena-current').set(tokenData);
        
        console.log('✅ Token stored in Firestore');
        console.log(`📅 Token expires at: ${expiresAt.toISOString()}`);
        console.log(`🔄 This is refresh #${tokenData.refreshCount}`);
        
        // Log success for monitoring
        await firestore.collection('token_refresh_log').add({
            status: 'success',
            timestamp: now,
            expiresAt: expiresAt,
            refreshCount: tokenData.refreshCount
        });
        
        return {
            success: true,
            expiresAt: expiresAt,
            message: 'Token refreshed successfully'
        };
        
    } catch (error) {
        console.error('❌ Token refresh failed:', error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        // Log error for debugging
        await firestore.collection('errors').add({
            type: 'token_refresh',
            error: error.message,
            details: error.response?.data || {},
            timestamp: new Date()
        });
        
        // Publish to error topic for monitoring
        const {PubSub} = require('@google-cloud/pubsub');
        const pubsub = new PubSub();
        await pubsub.topic('error-notifications').publish(Buffer.from(JSON.stringify({
            function: 'oauth-manager',
            error: error.message,
            timestamp: new Date().toISOString()
        })));
        
        throw error;
    }
};

/**
 * HTTP endpoint for manual token refresh
 * Useful for testing and manual intervention
 */
exports.refreshTokenHttp = async (req, res) => {
    try {
        const result = await exports.refreshAthenaToken({}, {});
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};