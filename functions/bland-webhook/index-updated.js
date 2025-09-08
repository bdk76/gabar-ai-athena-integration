2/**
 * Bland.AI Webhook Receiver - Updated for Cleaned Data
 * Receives pre-cleaned data from Google cleaner webhooks
 */

const express = require('express');
const {Firestore} = require('@google-cloud/firestore');
const {PubSub} = require('@google-cloud/pubsub');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const axios = require('axios');

const app = express();
app.use(express.json());

const firestore = new Firestore();
const pubsub = new PubSub();
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

/**
 * Find available appointment matching preferred date/time
 */
async function findMatchingAppointment(preferredDate, preferredTime) {
    console.log(`Finding appointment for ${preferredDate} at ${preferredTime}`);
    
    // Get OAuth token
    const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
    if (!tokenDoc.exists) {
        throw new Error('No valid token found');
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
    
    // Convert date to MM/DD/YYYY for Athena
    const [year, month, day] = preferredDate.split('-');
    const athenaDate = `${month}/${day}/${year}`;
    
    // Query for appointments on that date
    const response = await axios.get(
        `${baseUrl}/v1/${practiceId}/appointments/open`,
        {
            params: {
                departmentid: departmentId,
                startdate: athenaDate,
                enddate: athenaDate
            },
            headers: {
                'Authorization': `${tokenData.type} ${tokenData.token}`
            }
        }
    );
    
    const appointments = response.data.appointments || [];
    
    // Find appointment closest to preferred time
    const preferredMinutes = parseInt(preferredTime.split(':')[0]) * 60 + 
                           parseInt(preferredTime.split(':')[1]);
    
    let bestMatch = null;
    let minDiff = Infinity;
    
    for (const apt of appointments) {
        const aptTime = apt.starttime;
        const aptMinutes = parseInt(aptTime.split(':')[0]) * 60 + 
                          parseInt(aptTime.split(':')[1]);
        const diff = Math.abs(aptMinutes - preferredMinutes);
        
        if (diff < minDiff) {
            minDiff = diff;
            bestMatch = apt;
        }
    }
    
    return bestMatch;
}

// Main webhook handler for cleaned data
app.post('/webhook/bland', async (req, res) => {
    console.log('📞 Received cleaned data from Bland.AI pipeline');
    
    try {
        const {
            call_id,
            pathway_id,
            variables = {},  // These are now cleaned
            status
        } = req.body;
        
        // Expected cleaned variables:
        // - first_name: "John"
        // - last_name: "Smith"
        // - date_of_birth: "1990-01-15" (YYYY-MM-DD)
        // - phone: "7025551234" (10 digits)
        // - email: "john@example.com"
        // - sex: "M" or "F"
        // - house_number: "123"
        // - street: "Main Street"
        // - city: "Las Vegas"
        // - state: "NV" (2-letter)
        // - zip: "89101"
        // - preferred_date: "2025-01-13" (YYYY-MM-DD)
        // - preferred_time: "09:00" (HH:MM)
        
        // Build patient data for our existing functions
        const patientData = {
            firstName: variables.first_name,
            lastName: variables.last_name,
            dateOfBirth: variables.date_of_birth,
            phone: variables.phone,
            email: variables.email || '',
            sex: variables.sex,
            houseNumber: variables.house_number,
            street: variables.street,
            city: variables.city || 'Las Vegas',
            state: variables.state || 'Nevada',
            zip: variables.zip,
            appointmentId: variables.selected_appointment_id, // Directly from Bland.AI
            appointmentTypeId: variables.selected_appointment_type_id, // Directly from Bland.AI
            
            // Metadata
            source: 'bland_ai',
            callId: call_id,
            pathwayId: pathway_id,
            status: 'pending',
            createdAt: new Date()
        };
        
        // Add to intake queue - this will trigger the existing pipeline
        const docRef = await firestore.collection('patient_intake_queue').add(patientData);
        
        console.log(`✅ Patient queued: ${patientData.firstName} ${patientData.lastName}`);
        if (appointmentData) {
            console.log(`   With appointment: ${appointmentData.appointmentId}`);
        }
        
        // Trigger immediate processing
        await pubsub.topic('process-patient-queue').publish(
            Buffer.from(JSON.stringify({ 
                trigger: 'bland_webhook',
                urgent: true,
                recordId: docRef.id
            }))
        );
        
        res.status(200).json({
            success: true,
            message: 'Patient intake processed',
            patientQueueId: docRef.id,
            appointmentFound: !!appointmentData
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

exports.blandWebhook = app;
