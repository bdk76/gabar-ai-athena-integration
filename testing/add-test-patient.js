/**
 * Test Patient Addition Script for Gabar AI
 * Adds a test patient to the intake queue to verify the full workflow
 */

const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore({ projectId: 'gabar-ai-athena-integration' });

async function addTestPatient() {
    console.log('📝 Adding test patient to intake queue...\n');
    
    // Generate a unique test patient
    const timestamp = Date.now();
    const testPatient = {
        firstName: 'Test',
        lastName: `Patient${timestamp}`,
        dateOfBirth: '1990-01-15',
        email: `test${timestamp}@example.com`,
        phone: '5551234567',
        sex: 'F',
        houseNumber: '123',
        street: 'Test Street',
        city: 'Las Vegas',
        state: 'Nevada',
        zip: '89101',
        appointmentId: '247496', // You'll need a real appointment ID from Athena
        appointmentTypeId: '6',
        status: 'pending',
        createdAt: new Date(),
        isTest: true,
        source: 'manual_test'
    };
    
    try {
        // Add to intake queue
        const docRef = await firestore.collection('patient_intake_queue').add(testPatient);
        
        console.log('✅ Test patient added successfully!');
        console.log(`   Document ID: ${docRef.id}`);
        console.log(`   Name: ${testPatient.firstName} ${testPatient.lastName}`);
        console.log(`   Email: ${testPatient.email}`);
        console.log('\n📋 Next Steps:');
        console.log('1. The patient will be processed in the next 15 minutes (or manually trigger)');
        console.log('2. Check Firestore "patients" collection for the created patient');
        console.log('3. Check "errors" collection if something goes wrong');
        console.log('\nTo manually trigger processing, run:');
        console.log('gcloud pubsub topics publish process-patient-queue --message "{}"');
        
        return docRef.id;
    } catch (error) {
        console.error('❌ Failed to add test patient:', error);
    }
}

addTestPatient().catch(console.error);