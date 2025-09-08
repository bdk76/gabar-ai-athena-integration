/**
 * Get Available Appointments from AthenaHealth
 * Fetches real appointment IDs that can be used for testing
 */

const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const axios = require('axios');

const firestore = new Firestore({ projectId: 'gabar-ai-athena-integration' });
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

async function getAvailableAppointments() {
    console.log('🔍 Fetching available appointments from AthenaHealth...\n');
    
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
        
        // Get today's date and 7 days from now
        const today = new Date();
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const startDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
        const endDate = `${(nextWeek.getMonth() + 1).toString().padStart(2, '0')}/${nextWeek.getDate().toString().padStart(2, '0')}/${nextWeek.getFullYear()}`;
        
        console.log(`Searching for appointments from ${startDate} to ${endDate}`);
        console.log(`Department ID: ${departmentId}`);
        
        // Call AthenaHealth API to get open appointments
        const response = await axios.get(
            `${baseUrl}/v1/${practiceId}/appointments/open`,
            {
                params: {
                    departmentid: departmentId,
                    startdate: startDate,
                    enddate: endDate,
                    limit: 10
                },
                headers: {
                    'Authorization': `${tokenData.type} ${tokenData.token}`
                }
            }
        );
        
        const appointments = response.data.appointments || [];
        
        if (appointments.length === 0) {
            console.log('❌ No open appointments found in the next 7 days');
            console.log('\nTry checking:');
            console.log('1. The department ID is correct');
            console.log('2. There are providers with availability');
            console.log('3. Appointment types are configured');
        } else {
            console.log(`✅ Found ${appointments.length} available appointments:\n\n`);
            
            appointments.slice(0, 5).forEach((apt, index) => {
                console.log(`Appointment ${index + 1}:`);
                console.log(`  ID: ${apt.appointmentid}`);
                console.log(`  Date: ${apt.date}`);
                console.log(`  Time: ${apt.starttime}`);
                console.log(`  Type: ${apt.appointmenttype} (ID: ${apt.appointmenttypeid})`);
                console.log(`  Provider: ${apt.providername || 'Not specified'}`);
                console.log(`  Duration: ${apt.duration} minutes`);
                console.log('---');
            });
            
            // Save first appointment for testing
            if (appointments.length > 0) {
                const testAppointment = appointments[0];
                await firestore.collection('test_appointments').doc('latest').set({
                    appointmentId: testAppointment.appointmentid,
                    appointmentTypeId: testAppointment.appointmenttypeid,
                    date: testAppointment.date,
                    time: testAppointment.starttime,
                    savedAt: new Date()
                });
                
                console.log('\n💾 Saved first appointment for testing');
                console.log(`   Use appointment ID: ${testAppointment.appointmentid}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to fetch appointments:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Also add function to check booked appointments
async function getBookedAppointments() {
    console.log('\n📅 Fetching booked appointments...\n');
    
    try {
        // Get token and secrets (same as above)
        const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        const tokenData = tokenDoc.data();
        
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
        
        const today = new Date();
        const startDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
        
        // Get booked appointments
        const response = await axios.get(
            `${baseUrl}/v1/${practiceId}/appointments/booked`,
            {
                params: {
                    departmentid: departmentId,
                    startdate: startDate,
                    limit: 10
                },
                headers: {
                    'Authorization': `${tokenData.type} ${tokenData.token}`
                }
            }
        );
        
        const appointments = response.data.appointments || [];
        console.log(`Found ${appointments.length} booked appointments`);
        
        appointments.slice(0, 3).forEach((apt) => {
            console.log(`\nBooked Appointment:`);
            console.log(`  ID: ${apt.appointmentid}`);
            console.log(`  Patient: ${apt.patientid}`);
            console.log(`  Date: ${apt.date} at ${apt.starttime}`);
        });
        
    } catch (error) {
        console.error('Error fetching booked appointments:', error.message);
    }
}

// Run both functions
async function main() {
    await getAvailableAppointments();
    await getBookedAppointments();
}

main().catch(console.error);
