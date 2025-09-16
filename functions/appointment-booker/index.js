// File: /home/claude/appointment-booker.js

const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const axios = require('axios');

const firestore = new Firestore();
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

exports.bookAppointment = async (message, context) => {
  const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
  
  console.log('Booking appointment for patient:', data.patientId);
  console.log('Appointment ID:', data.appointmentId);
  
  try {
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
    const [baseUrlSecret] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/athena-base-url/versions/latest`
    });
    
    const practiceId = practiceIdSecret.payload.data.toString();
    const baseUrl = baseUrlSecret.payload.data.toString();
    
    // Book appointment in AthenaHealth
    const payload = new URLSearchParams({
      patientid: data.patientId,
      appointmenttypeid: data.appointmentTypeId || '15',
      ignoreschedulablepermission: 'true', // Allow booking even if slot seems unavailable
      donotsendconfirmationemail: 'false' // Send confirmation
    });
    
    console.log('Booking appointment with payload:', payload.toString());
    
    const response = await axios.put(
      `${baseUrl}/v1/${practiceId}/appointments/${data.appointmentId}`,
      payload.toString(),
      {
        headers: {
          'Authorization': `${tokenData.type} ${tokenData.token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('Appointment booked successfully:', response.data);
    
    // Update Firestore
    if (data.originalRecordId) {
      await firestore.collection('patient_intake_queue').doc(data.originalRecordId).update({
        appointmentBooked: true,
        appointmentBookedAt: new Date(),
        appointmentConfirmation: response.data
      });
    }
    
    // Log success
    await firestore.collection('appointments').add({
      patientId: data.patientId,
      appointmentId: data.appointmentId,
      status: 'booked',
      bookedAt: new Date(),
      confirmation: response.data
    });
    
    return {success: true};
    
  } catch (error) {
    console.error('Appointment booking failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    
    // Log error
    await firestore.collection('errors').add({
      type: 'appointment_booking',
      appointmentId: data.appointmentId,
      patientId: data.patientId,
      error: error.message,
      details: error.response?.data || {},
      timestamp: new Date()
    });
    
    throw error;
  }
};