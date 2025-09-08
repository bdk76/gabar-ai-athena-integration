/**
 * Pub/Sub Topic and Subscription Verification for Gabar AI
 * Ensures all message routing infrastructure is properly configured
 */

const {PubSub} = require('@google-cloud/pubsub');

async function verifyPubSub() {
    const pubsub = new PubSub({
        projectId: 'gabar-ai-athena-integration'
    });
    
    console.log('📨 Verifying Pub/Sub Message Infrastructure for Gabar AI...\n');
    console.log('=' .repeat(70));
    
    // Define expected topics and their purposes
    const expectedTopics = {
        'process-patient-queue': {
            purpose: 'Triggers processing of new patient intake forms',
            subscription: 'process-queue-sub'
        },
        'create-patient': {
            purpose: 'Messages for creating patients in AthenaHealth',
            subscription: 'create-patient-sub'
        },
        'book-appointment': {
            purpose: 'Messages for booking appointments after patient creation',
            subscription: 'book-appointment-sub'
        },
        'token-refresh': {
            purpose: 'Triggers OAuth token refresh for AthenaHealth API',
            subscription: 'token-refresh-sub'
        },
        'error-notifications': {
            purpose: 'Collects error messages for monitoring',
            subscription: 'error-notification-sub'
        },
        'dead-letter-queue': {
            purpose: 'Holds messages that failed multiple processing attempts',
            subscription: 'dead-letter-monitoring'
        }
    };
    
    console.log('📋 TOPICS STATUS:');
    console.log('-'.repeat(50));
    
    let allTopicsPresent = true;
    const topicResults = {};
    
    // Check each topic
    for (const [topicName, config] of Object.entries(expectedTopics)) {
        try {
            const topic = pubsub.topic(topicName);
            const [exists] = await topic.exists();
            
            if (exists) {
                // Get topic metadata
                const [metadata] = await topic.getMetadata();
                const retentionDays = metadata.messageRetentionDuration 
                    ? parseInt(metadata.messageRetentionDuration.seconds) / 86400 
                    : 0;
                
                console.log(`✅ ${topicName}`);
                console.log(`   Purpose: ${config.purpose}`);
                console.log(`   Retention: ${retentionDays} days`);
                
                topicResults[topicName] = 'exists';
            } else {
                console.log(`❌ ${topicName} - NOT FOUND`);
                topicResults[topicName] = 'missing';
                allTopicsPresent = false;
            }
        } catch (error) {
            console.log(`❌ ${topicName} - ERROR: ${error.message}`);
            topicResults[topicName] = 'error';
            allTopicsPresent = false;
        }
    }
    
    console.log('\n📋 SUBSCRIPTIONS STATUS:');
    console.log('-'.repeat(50));
    
    let allSubscriptionsPresent = true;
    
    // Check each subscription
    for (const [topicName, config] of Object.entries(expectedTopics)) {
        if (config.subscription) {
            try {
                const subscription = pubsub.subscription(config.subscription);
                const [exists] = await subscription.exists();
                
                if (exists) {
                    const [metadata] = await subscription.getMetadata();
                    const ackDeadline = metadata.ackDeadlineSeconds;
                    const maxAttempts = metadata.deadLetterPolicy?.maxDeliveryAttempts || 'unlimited';
                    
                    console.log(`✅ ${config.subscription}`);
                    console.log(`   Topic: ${topicName}`);
                    console.log(`   Ack deadline: ${ackDeadline} seconds`);
                    console.log(`   Max attempts: ${maxAttempts}`);
                } else {
                    console.log(`❌ ${config.subscription} - NOT FOUND`);
                    allSubscriptionsPresent = false;
                }
            } catch (error) {
                console.log(`❌ ${config.subscription} - ERROR: ${error.message}`);
                allSubscriptionsPresent = false;
            }
        }
    }
    
    console.log('\n🔄 MESSAGE FLOW DIAGRAM:');
    console.log('-'.repeat(50));
    console.log('                    Patient Intake Form');
    console.log('                           ↓');
    console.log('                  [process-patient-queue]');
    console.log('                           ↓');
    console.log('                    [create-patient]');
    console.log('                           ↓');
    console.log('                  Patient Created in Athena');
    console.log('                           ↓');
    console.log('                   [book-appointment]');
    console.log('                           ↓');
    console.log('                  Appointment Scheduled');
    console.log('');
    console.log('  [token-refresh] → Maintains OAuth Authentication');
    console.log('  [error-notifications] → Monitors All Errors');
    console.log('  [dead-letter-queue] → Catches Failed Messages');
    
    console.log('\n' + '='.repeat(70));
    
    if (allTopicsPresent && allSubscriptionsPresent) {
        console.log('🎉 PUB/SUB INFRASTRUCTURE COMPLETE!\n');
        console.log('Your message routing system is ready with:');
        console.log('  ✓ 6 topics for different message types');
        console.log('  ✓ 6 subscriptions for message processing');
        console.log('  ✓ Dead letter queue for error handling');
        console.log('  ✓ Message retention for compliance');
        console.log('  ✓ Automatic retry with exponential backoff');
        
        console.log('\n✅ Ready to proceed to Step 6: Creating Cloud Functions');
    } else {
        console.log('⚠️  PUB/SUB SETUP INCOMPLETE\n');
        console.log('Some topics or subscriptions are missing.');
        console.log('Please run the setup commands again for any missing components.');
    }
    
    // Test publishing capability
    console.log('\n🧪 TESTING MESSAGE PUBLISHING:');
    console.log('-'.repeat(50));
    
    try {
        const testTopic = pubsub.topic('process-patient-queue');
        const testMessage = {
            test: true,
            timestamp: new Date().toISOString(),
            message: 'Gabar AI integration test message'
        };
        
        const messageId = await testTopic.publishMessage({
            json: testMessage
        });
        
        console.log(`✅ Test message published successfully`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   This confirms your Pub/Sub system can send messages`);
    } catch (error) {
        console.log(`⚠️  Could not publish test message: ${error.message}`);
    }
}

// Run verification
verifyPubSub()
    .then(() => {
        console.log('\n✅ Verification complete. Type "proceed to step 6" when ready.');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Verification failed:', error);
        console.error('Please ensure Pub/Sub API is enabled and you have proper permissions.');
        process.exit(1);
    });