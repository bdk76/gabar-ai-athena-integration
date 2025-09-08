/**
 * Firestore Collections Setup for Gabar AI Athena Integration
 * This script creates the initial collection structure with sample documents
 * to establish the schema pattern for your integration.
 */

const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore({
    projectId: 'gabar-ai-athena-integration',
    databaseId: '(default)'
});

async function setupCollections() {
    console.log('🏗️ Setting up Firestore collections for Gabar AI Athena Integration...\n');
    
    // Collection 1: patient_intake_queue
    // This is where new patients from your intake form will be queued for processing
    // Think of it as the "waiting room" for new patient registrations
    console.log('Creating patient_intake_queue collection...');
    const intakeRef = firestore.collection('patient_intake_queue').doc('_schema_example');
    await intakeRef.set({
        _description: 'Schema example - DO NOT PROCESS',
        firstName: 'Example',
        lastName: 'Patient',
        dateOfBirth: '1990-01-01',
        email: 'example@test.com',
        phone: '5551234567',
        sex: 'F',
        houseNumber: '123',
        street: 'Example Street',
        city: 'Test City',
        state: 'California',
        zip: '90210',
        appointmentId: 'APPOINTMENT_ID_FROM_ATHENA',
        appointmentTypeId: '15',
        status: 'pending', // Can be: pending, processing, completed, error
        createdAt: new Date(),
        airtableId: 'ORIGINAL_AIRTABLE_ID',
        _note: 'This is a schema example document for reference'
    });
    console.log('✅ patient_intake_queue collection created');
    
    // Collection 2: patients
    // This stores the master patient records with their Athena IDs
    // Like your main patient directory with all confirmed registrations
    console.log('\nCreating patients collection...');
    const patientsRef = firestore.collection('patients').doc('_schema_example');
    await patientsRef.set({
        _description: 'Schema example - DO NOT DELETE',
        // Original intake data
        firstName: 'Example',
        lastName: 'Patient',
        dateOfBirth: '1990-01-01',
        email: 'example@test.com',
        phone: '5551234567',
        // Athena integration data
        athenaPatientId: '12345',
        athenaCreatedAt: new Date(),
        // Processing metadata
        status: 'active',
        lastUpdated: new Date(),
        source: 'airtable_migration',
        _note: 'This document shows the structure after successful Athena registration'
    });
    console.log('✅ patients collection created');
    
    // Collection 3: appointments
    // Tracks all appointment bookings and their status
    // Your appointment ledger that links patients to their scheduled visits
    console.log('\nCreating appointments collection...');
    const appointmentsRef = firestore.collection('appointments').doc('_schema_example');
    await appointmentsRef.set({
        _description: 'Schema example for appointments',
        athenaPatientId: '12345',
        athenaAppointmentId: '67890',
        appointmentTypeId: '15',
        departmentId: '1',
        providerId: '71',
        appointmentDate: '2024-12-20',
        appointmentTime: '14:30',
        status: 'booked', // Can be: pending, booked, completed, cancelled, no-show
        bookedAt: new Date(),
        lastModified: new Date(),
        originalRecordId: 'AIRTABLE_RECORD_ID',
        _note: 'Tracks appointment lifecycle from booking through completion'
    });
    console.log('✅ appointments collection created');
    
    // Collection 4: api_tokens
    // Securely stores OAuth tokens for Athena API access
    // Like having a secure key card that expires and needs renewal
    console.log('\nCreating api_tokens collection...');
    const tokensRef = firestore.collection('api_tokens').doc('athena-current');
    await tokensRef.set({
        _description: 'Current Athena OAuth token storage',
        token: 'ENCRYPTED_TOKEN_PLACEHOLDER',
        type: 'Bearer',
        expiresAt: new Date(Date.now() + 3000000), // 50 minutes from now
        createdAt: new Date(),
        service: 'Athenahealth',
        environment: 'production',
        _note: 'Actual tokens will be encrypted and managed by Cloud Functions'
    });
    console.log('✅ api_tokens collection created');
    
    // Collection 5: errors
    // Logs any errors for debugging and monitoring
    // Your diagnostic system to track and fix issues
    console.log('\nCreating errors collection...');
    const errorsRef = firestore.collection('errors').doc('_schema_example');
    await errorsRef.set({
        _description: 'Error logging schema',
        type: 'patient_creation',
        errorMessage: 'Example error for schema',
        errorCode: 'EXAMPLE_001',
        patientData: {
            firstName: 'Failed',
            lastName: 'Example'
        },
        timestamp: new Date(),
        resolved: false,
        _note: 'This collection helps debug integration issues'
    });
    console.log('✅ errors collection created');
    
    // Collection 6: configuration
    // Stores system configuration and settings
    // Like your integration's control panel settings
    console.log('\nCreating configuration collection...');
    const configRef = firestore.collection('configuration').doc('settings');
    await configRef.set({
        practiceId: '27998',
        departmentId: '1',
        defaultAppointmentTypeId: '15',
        processingBatchSize: 10,
        retryAttempts: 3,
        retryDelayMs: 2000,
        environment: 'production',
        createdAt: new Date(),
        lastModified: new Date(),
        _note: 'Central configuration for the integration'
    });
    console.log('✅ configuration collection created');
    
    console.log('\n🎉 All Firestore collections have been successfully created!');
    console.log('📋 Created collections:');
    console.log('  - patient_intake_queue (pending patient registrations)');
    console.log('  - patients (registered patients with Athena IDs)');
    console.log('  - appointments (appointment bookings and status)');
    console.log('  - api_tokens (OAuth token storage)');
    console.log('  - errors (error logging and debugging)');
    console.log('  - configuration (system settings)');
}

// Execute the setup
setupCollections()
    .then(() => {
        console.log('\n✅ Firestore setup completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Error setting up Firestore:', error);
        process.exit(1);
    });
