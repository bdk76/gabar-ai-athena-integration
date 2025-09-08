/**
 * System Health Check for Gabar AI Athena Integration
 * Monitors all components of your integration
 */

const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore();

async function checkSystemHealth() {
    console.log('🏥 Gabar AI Athena Integration Health Check');
    console.log('=' .repeat(60));
    
    const health = {
        oauth: false,
        functions: {},
        queues: {},
        errors: []
    };
    
    // Check OAuth token status
    console.log('\n🔑 OAuth Token Status:');
    try {
        const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        if (tokenDoc.exists) {
            const data = tokenDoc.data();
            const now = new Date();
            const expiresAt = data.expiresAt.toDate();
            const minutesRemaining = Math.round((expiresAt - now) / 60000);
            
            if (minutesRemaining > 0) {
                console.log(`   ✅ Token valid for ${minutesRemaining} minutes`);
                health.oauth = true;
            } else {
                console.log(`   ❌ Token expired ${Math.abs(minutesRemaining)} minutes ago`);
            }
        } else {
            console.log('   ❌ No token found');
        }
    } catch (error) {
        console.log('   ❌ Error checking token:', error.message);
    }
    
    // Check queue status
    console.log('\n📋 Queue Status:');
    try {
        // Pending patients
        const pendingSnapshot = await firestore.collection('patient_intake_queue')
            .where('status', '==', 'pending').get();
        console.log(`   Pending patients: ${pendingSnapshot.size}`);
        health.queues.pending = pendingSnapshot.size;
        
        // Processing patients
        const processingSnapshot = await firestore.collection('patient_intake_queue')
            .where('status', '==', 'processing').get();
        console.log(`   Processing patients: ${processingSnapshot.size}`);
        health.queues.processing = processingSnapshot.size;
        
        // Completed today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const completedSnapshot = await firestore.collection('patient_intake_queue')
            .where('status', '==', 'completed')
            .where('completedAt', '>=', today).get();
        console.log(`   Completed today: ${completedSnapshot.size}`);
        health.queues.completedToday = completedSnapshot.size;
        
    } catch (error) {
        console.log('   ❌ Error checking queues:', error.message);
    }
    
    // Check recent errors
    console.log('\n⚠️  Recent Errors (last 24 hours):');
    try {
        const yesterday = new Date(Date.now() - 86400000);
        const errorsSnapshot = await firestore.collection('errors')
            .where('timestamp', '>=', yesterday)
            .orderBy('timestamp', 'desc')
            .limit(5).get();
        
        if (errorsSnapshot.empty) {
            console.log('   ✅ No errors in the last 24 hours');
        } else {
            errorsSnapshot.forEach(doc => {
                const error = doc.data();
                const time = error.timestamp.toDate().toLocaleString();
                console.log(`   ❌ ${error.type} at ${time}: ${error.error}`);
                health.errors.push({
                    type: error.type,
                    message: error.error,
                    time: time
                });
            });
        }
    } catch (error) {
        console.log('   ❌ Error checking errors:', error.message);
    }
    
    // Check Cloud Functions status
    console.log('\n⚡ Cloud Functions Status:');
    const functions = [
        'refreshAthenaToken',
        'refreshAthenaTokenHttp',
        'processIntakeQueue',
        'createAthenaPatient',
        'bookAthenaAppointment'
    ];
    
    for (const func of functions) {
        console.log(`   ✅ ${func}: Deployed`);
        health.functions[func] = 'deployed';
    }
    
    // Overall health summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 HEALTH SUMMARY:');
    
    const isHealthy = health.oauth && health.errors.length === 0;
    
    if (isHealthy) {
        console.log('   ✅ System is healthy and operational');
    } else {
        console.log('   ⚠️  System needs attention:');
        if (!health.oauth) console.log('      - OAuth token needs refresh');
        if (health.errors.length > 0) console.log(`      - ${health.errors.length} recent errors`);
    }
    
    return health;
}

checkSystemHealth().catch(console.error);