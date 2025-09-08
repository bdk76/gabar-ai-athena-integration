const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore({
    projectId: 'gabar-ai-athena-integration'
});

async function verifyCollections() {
    console.log('🔍 Verifying Firestore collections...\n');
    
    const expectedCollections = [
        'patient_intake_queue',
        'patients', 
        'appointments',
        'api_tokens',
        'errors',
        'configuration'
    ];
    
    for (const collectionName of expectedCollections) {
        const snapshot = await firestore.collection(collectionName).limit(1).get();
        const docCount = snapshot.size;
        console.log(`✅ Collection '${collectionName}' exists with ${docCount} document(s)`);
    }
    
    // Verify configuration settings
    const configDoc = await firestore.collection('configuration').doc('settings').get();
    if (configDoc.exists) {
        console.log('\n📋 Configuration settings:');
        const data = configDoc.data();
        console.log(`  Practice ID: ${data.practiceId}`);
        console.log(`  Department ID: ${data.departmentId}`);
        console.log(`  Default Appointment Type: ${data.defaultAppointmentTypeId}`);
    }
    
    console.log('\n✅ All collections verified successfully!');
}

verifyCollections().catch(console.error);