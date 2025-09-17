// File: /home/claude/bland-webhook-handler.js

const functions = require('@google-cloud/functions-framework');
const {Firestore} = require('@google-cloud/firestore');
const {PubSub} = require('@google-cloud/pubsub');
const crypto = require('crypto');
const fs = require('fs');

const firestore = new Firestore();
const pubsub = new PubSub();

// Load the webhook secret from the file path provided by the environment variable
const secretPath = process.env.BLAND_WEBHOOK_SECRET;
const webhookSecret = secretPath ? fs.readFileSync(secretPath, 'utf8') : undefined;

functions.http('blandWebhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Verify webhook signature
    const signature = req.headers['x-bland-signature'];
    
    if (signature && webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return res.status(401).json({success: false, error: 'Invalid signature'});
      }
    }
    
    // Extract data from Bland
    const {
      call_id,
      pathway_id,
      status,
      variables
    } = req.body;
    
    console.log(`Processing Bland call ${call_id}`);
    console.log('Variables received:', JSON.stringify(variables));
    
    // Generate unique queue ID
    const queueId = `${call_id}_${Date.now()}`;
    
    // Prepare patient data for Athena
    const patientData = {
      id: queueId,
      callId: call_id,
      pathwayId: pathway_id,
      
      // Patient demographics
      firstName: variables.first_name,
      lastName: variables.last_name,
      dateOfBirth: variables.date_of_birth, // Should be ISO format
      phone: variables.phone,
      email: variables.email,
      sex: variables.sex,
      
      // Address
      houseNumber: variables.house_number,
      street: variables.street,
      city: variables.city,
      state: variables.state,
      zip: variables.zip,
      
      // Appointment details
      appointmentId: variables.selected_appointment_id,
      appointmentTypeId: variables.selected_appointment_type_id || '15',
      
      // Metadata
      timestamp: new Date().toISOString(),
      source: 'bland_webhook'
    };
    
    // Store in Firestore queue
    await firestore.collection('patient_intake_queue').doc(queueId).set({
      ...patientData,
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0
    });
    
    console.log(`Queued patient intake: ${queueId}`);
    
    // Publish to PubSub for async processing
    const topic = pubsub.topic('create-patient');
    const messageBuffer = Buffer.from(JSON.stringify(patientData));
    const messageId = await topic.publishMessage({data: messageBuffer});
    
    console.log(`Published to create-patient topic: ${messageId}`);
    
    // IMMEDIATELY respond to Bland (must be under 2 seconds)
    const responseTime = Date.now() - startTime;
    console.log(`Responding to Bland in ${responseTime}ms`);
    
    res.status(200).json({
      success: true,
      patientQueueId: queueId,
      message: 'Patient creation queued successfully',
      responseTime: responseTime
    });
    
  } catch (error) {
    console.error('Error processing Bland webhook:', error);
    
    // Log error but still respond quickly
    await firestore.collection('errors').add({
      type: 'bland_webhook',
      error: error.message,
      requestBody: req.body,
      timestamp: new Date()
    }).catch(console.error);
    
    // Respond with error (still under 2 seconds)
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
      message: error.message
    });
  }
});