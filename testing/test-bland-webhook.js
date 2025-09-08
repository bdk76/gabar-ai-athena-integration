/**
 * Test Script for Bland.AI Webhook Integration
 * Simulates the complete flow from Bland.AI to AthenaHealth
 */

const axios = require('axios');
const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

const firestore = new Firestore();
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

// Your webhook URL
const WEBHOOK_URL = 'https://us-central1-gabar-ai-athena-integration.cloudfunctions.net/blandWebhook/webhook/bland';

async function getAvailableAppointment() {
    console.log('🔍 Getting a real appointment ID from AthenaHealth...\n');
    
    // Get token
    const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
    if (!tokenDoc.exists) {
        throw new Error('No token found');
    }
    const tokenData = tokenDoc.data();
    
    // Get secrets
    const [practiceIdSecret] = await secretClient.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/athena-practice-id/versions/latest`
    });
    const [departmentIdSecret] = await secretClient.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/athena-department-id/versions/latest`
    });
    const [baseUrlSecret] = await secretClient.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/athena-base-url/versions/latest`
    });
    
    const practiceId = practiceIdSecret.payload.data.toString();
    const departmentId = departmentIdSecret.payload.data.toString();
    const baseUrl = baseUrlSecret.payload.data.toString();
    
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startDate = `${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}/${tomorrow.getDate().toString().padStart(2, '0')}/${tomorrow.getFullYear()}`;
    
    // Get appointments for next 7 days
    const nextWeek = new Date(tomorrow);
    nextWeek.setDate(nextWeek.getDate() + 6);
    const endDate = `${(nextWeek.getMonth() + 1).toString().padStart(2, '0')}/${nextWeek.getDate().toString().padStart(2, '0')}/${nextWeek.getFullYear()}`;
    
    console.log(`Searching for appointments from ${startDate} to ${endDate}`);
    
    const response = await axios.get(
        `${baseUrl}/v1/${practiceId}/appointments/open`,
        {
            params: {
                departmentid: departmentId,
                startdate: startDate,
                enddate: endDate,
                limit: 5
            },
            headers: {
                'Authorization': `${tokenData.type} ${tokenData.token}`
            }
        }
    );
    
    const appointments = response.data.appointments || [];
    
    if (appointments.length === 0) {
        console.log('❌ No available appointments found');
        return null;
    }
    
    const appointment = appointments[0];
    console.log('✅ Found appointment:');
    console.log(`   ID: ${appointment.appointmentid}`);
    console.log(`   Date: ${appointment.date}`);
    console.log(`   Time: ${appointment.starttime}`);
    console.log(`   Type ID: ${appointment.appointmenttypeid}`);
    
    return appointment;
}

async function testWebhook(useRealAppointment = true) {
    console.log('\n📞 Testing Bland.AI Webhook Integration\n');
    console.log('=' .repeat(60));
    
    let appointmentData = null;
    
    if (useRealAppointment) {
        appointmentData = await getAvailableAppointment();
        if (!appointmentData) {
            console.log('⚠️  No real appointments available, using test data');
            useRealAppointment = false;
        }
    }
    
    // Generate test patient data (simulating cleaned data from Google cleaners)
    const timestamp = Date.now();
    const testPayload = {
        call_id: `test_call_${timestamp}`,
        pathway_id: 'patient_intake_v1',
        status: 'completed',
        call_length: 180,
        
        // These variables would come from Bland.AI after Google cleaners
        variables: {
            // Patient demographics (cleaned by Google)
            first_name: 'Test',
            last_name: `Patient${timestamp}`,
            date_of_birth: '1990-01-15',  // Already in YYYY-MM-DD format
            
            // Contact (cleaned)
            phone: '7025551234',  // Already cleaned to 10 digits
            email: `test${timestamp} @example.com`,
            
            // Demographics (cleaned)
            sex: 'F',  // Already normalized to M or F
            
            // Address (cleaned and parsed)
            house_number: '123',
            street: 'Test Boulevard',
            city: 'Las Vegas',
            state: 'NV',  // Already abbreviated
            zip: '89101',
            
            // Appointment preferences (from check-timeslots webhook)
            preferred_date: appointmentData ? appointmentData.date : '2025-01-15',
            preferred_time: appointmentData ? appointmentData.starttime : '09:00',
            
            // If we have a real appointment, include its ID
            selected_appointment_id: appointmentData ? appointmentData.appointmentid : null,
            selected_appointment_type_id: appointmentData ? appointmentData.appointmenttypeid : '15',
            
            // Visit reason
            reason_for_visit: 'Annual checkup'
        }
    };
    
    console.log('\n📤 Sending test webhook to:', WEBHOOK_URL);
    console.log('\nPayload:');
    console.log(JSON.stringify(testPayload, null, 2));
    
    try {
        const response = await axios.post(WEBHOOK_URL, testPayload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Bland-Test': 'true'
            }
        });
        
        console.log('\n✅ Webhook Response:');
        console.log('   Status:', response.status);
        console.log('   Data:', JSON.stringify(response.data, null, 2));
        
        if (response.data.patientQueueId) {
            console.log('\n📋 Checking queue status...');
            
            // Wait a moment for processing
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check the queue status
            const queueDoc = await firestore.collection('patient_intake_queue')
                .doc(response.data.patientQueueId)
                .get();
            
            if (queueDoc.exists) {
                const queueData = queueDoc.data();
                console.log('   Status:', queueData.status);
                console.log('   Patient:', queueData.firstName, queueData.lastName);
                
                if (queueData.athenaPatientId) {
                    console.log('   ✅ Athena Patient ID:', queueData.athenaPatientId);
                }
            }
        }
        
        return response.data;
        
    } catch (error) {
        console.error('\n❌ Webhook test failed:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
        throw error;
    }
}

async function monitorProcessing(queueId, maxWaitSeconds = 30) {
    console.log(`\n⏳ Monitoring processing for queue ID: ${queueId}`);
    
    const startTime = Date.now();
    let lastStatus = '';
    
    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        const doc = await firestore.collection('patient_intake_queue').doc(queueId).get();
        
        if (!doc.exists) {
            console.log('❌ Queue document not found');
            break;
        }
        
        const data = doc.data();
        
        if (data.status !== lastStatus) {
            console.log(`   Status changed: ${lastStatus} → ${data.status}`);
            lastStatus = data.status;
            
            if (data.athenaPatientId) {
                console.log(`   ✅ Patient created with ID: ${data.athenaPatientId}`);
            }
            
            if (data.status === 'completed') {
                console.log('   ✅ Processing completed successfully!');
                
                // Check if appointment was booked
                const appointmentDocs = await firestore.collection('appointments')
                    .where('athenaPatientId', '==', data.athenaPatientId)
                    .get();
                
                if (!appointmentDocs.empty) {
                    appointmentDocs.forEach(doc => {
                        const aptData = doc.data();
                        console.log(`   ✅ Appointment booked: ${aptData.athenaAppointmentId}`);
                    });
                }
                
                return data;
            }
            
            if (data.status === 'error') {
                console.log(`   ❌ Processing failed: ${data.error}`);
                return data;
            }
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('   ⏱️ Monitoring timed out');
    return null;
}

// Main test execution
async function runTest() {
    console.log('🧪 Bland.AI to AthenaHealth Integration Test\n');
    
    try {
        // Test the webhook
        const result = await testWebhook(true);  // Use real appointment if available
        
        if (result.patientQueueId) {
            // Monitor the processing
            await monitorProcessing(result.patientQueueId);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ Test completed successfully!');
        
    } catch (error) {
        console.error('\n' + '=' .repeat(60));
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Command line options
const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`
Usage: node test-bland-webhook.js [options]

Options:
  --help          Show this help message
  --no-real       Use test appointment ID instead of real one
  --monitor-only  Monitor existing queue item by ID

Example:
  node test-bland-webhook.js
  node test-bland-webhook.js --no-real
`);
    process.exit(0);
}

// Run the test
runTest().catch(console.error);
