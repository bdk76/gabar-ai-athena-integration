/**
 * Get Available Appointments - Compliant with API Spec
 * Respects the 7-day maximum window per your authorization
 */

const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const axios = require('axios');

const firestore = new Firestore({ projectId: 'gabar-ai-athena-integration' });
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

async function getAvailableAppointments() {
    console.log('🔍 Fetching available appointments (7-day limit per API spec)...\n');
    
    try {
        // Get token
        const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        if (!tokenDoc.exists) {
            throw new Error('No token found. Please refresh token first.');
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
        
        // COMPLIANT: Only query next 7 days as per API spec
        const today = new Date();
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const startDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
        const endDate = `${(nextWeek.getMonth() + 1).toString().padStart(2, '0')}/${nextWeek.getDate().toString().padStart(2, '0')}/${nextWeek.getFullYear()}`;
        
        console.log(`✅ Compliant query: ${startDate} to ${endDate} (7 days)`);
        console.log(`Practice: My Virtual Physician (${practiceId})`);
        console.log(`Department: ${departmentId}\n`);
        
        // Call authorized endpoint: GET /v1/{practiceid}/appointments/open
        const response = await axios.get(
            `${baseUrl}/v1/${practiceId}/appointments/open`,
            {
                params: {
                    departmentid: departmentId,
                    startdate: startDate,
                    enddate: endDate,
                    limit: 20  // Reasonable limit
                },
                headers: {
                    'Authorization': `${tokenData.type} ${tokenData.token}`
                }
            }
        );
        
        const appointments = response.data.appointments || [];
        
        if (appointments.length === 0) {
            console.log('No open appointments found in the next 7 days');
            console.log('\nPossible reasons:');
            console.log('1. All slots are booked');
            console.log('2. Providers have no availability configured');
            console.log('3. Department settings need adjustment');
        } else {
            console.log(`Found ${appointments.length} available appointments:\n\n`);
            
            appointments.slice(0, 5).forEach((apt, index) => {
                console.log(`Appointment ${index + 1}:`);
                console.log(`  ID: ${apt.appointmentid}`);
                console.log(`  Date: ${apt.date}`);
                console.log(`  Time: ${apt.starttime}`);
                console.log(`  Type: ${apt.appointmenttype || 'Not specified'}`);
                console.log(`  Type ID: ${apt.appointmenttypeid}`);
                console.log(`  Provider: ${apt.providername || 'Not specified'}`);
                console.log(`  Duration: ${apt.duration} minutes`);
                console.log('---');
            });
            
            // Save first appointment for testing
            if (appointments.length > 0) {
                const testApt = appointments[0];
                await firestore.collection('test_appointments').doc('latest').set({
                    appointmentId: testApt.appointmentid,
                    appointmentTypeId: testApt.appointmenttypeid,
                    date: testApt.date,
                    time: testApt.starttime,
                    savedAt: new Date()
                });
                
                console.log('\n💾 Saved appointment for testing');
                console.log(`Use this ID for booking: ${testApt.appointmentid}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to fetch appointments:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Optional: Get appointment types (authorized endpoint)
async function getAppointmentTypes() {
    console.log('\n📋 Fetching appointment types...\n');
    
    try {
        const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        const tokenData = tokenDoc.data();
        
        const [practiceIdSecret] = await secretClient.accessSecretVersion({
            name: `projects/${PROJECT_ID}/secrets/athena-practice-id/versions/latest`
        });
        const [baseUrlSecret] = await secretClient.accessSecretVersion({
            name: `projects/${PROJECT_ID}/secrets/athena-base-url/versions/latest`
        });
        
        const practiceId = practiceIdSecret.payload.data.toString();
        const baseUrl = baseUrlSecret.payload.data.toString();
        
        // Call authorized endpoint: GET /appointmenttypes
        const response = await axios.get(
            `${baseUrl}/v1/${practiceId}/appointmenttypes`,
            {
                headers: {
                    'Authorization': `${tokenData.type} ${tokenData.token}`
                }
            }
        );
        
        const types = response.data.appointmenttypes || [];
        console.log(`Found ${types.length} appointment types:\n`);
        
        types.slice(0, 10).forEach(type => {
            console.log(`Type ID ${type.appointmenttypeid}: ${type.name}`);
            if (type.duration) console.log(`  Duration: ${type.duration} minutes`);
        });
        
    } catch (error) {
        console.error('Error fetching appointment types:', error.message);
    }
}

// Run compliant queries only
async function main() {
    console.log('🏥 Gabar AI - My Virtual Physician Integration\n');
    console.log('Running API-compliant queries only...\n');
    
    await getAvailableAppointments();
    await getAppointmentTypes();
}

main().catch(console.error);