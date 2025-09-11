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



// Main webhook handler for cleaned data
app.post('/webhook/bland', async (req, res) => {
    console.log('📞 Received cleaned data from Bland.AI pipeline');
    
    try {
        const {
            call_id,
            pathway_id,
            variables = {},  // These are now cleaned
            status,
            call_length,
            last_node_id
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
        if (patientData.appointmentId) {
            console.log(`   With appointment: ${patientData.appointmentId}`);
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
            appointmentFound: !!patientData.appointmentId
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