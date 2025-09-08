/**
 * Appointment Booker for Gabar AI Athena Integration
 * Books appointments using the same logic as your Airtable Bookings.ts script
 */

const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const axios = require('axios');

const firestore = new Firestore();
const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = 'gabar-ai-athena-integration';

exports.bookAthenaAppointment = async (message, context) => {
    const bookingData = JSON.parse(Buffer.from(message.data, 'base64').toString());
    
    console.log('Booking appointment for patient:', bookingData.patientId);
    console.log('Appointment ID:', bookingData.appointmentId);
    console.log('Appointment Type ID:', bookingData.appointmentTypeId);
    
    console.log('Original Record ID:', bookingData.originalRecordId);
    
    try {
        // Get OAuth token from Firestore
        const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        if (!tokenDoc.exists) {
            throw new Error('No valid token found. Run token refresh first.');
        }
        const tokenData = tokenDoc.data();
        
        // Check token expiration
        const now = new Date();
        const expiresAt = tokenData.expiresAt.toDate();
        if (expiresAt <= now) {
            throw new Error('Token expired. Please refresh token.');
        }
        
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
        
        // Extract appointment type ID from the data
        // This matches your Airtable script logic for dynamic appointment types
        let appointmentTypeId = bookingData.appointmentTypeId || '15'; // Default to 15 if not specified
        
        // If appointmentTypeId contains text and number, extract just the number
        if (appointmentTypeId && typeof appointmentTypeId === 'string') {
            const numericMatch = appointmentTypeId.match(/\d+/);
            if (numericMatch) {
                appointmentTypeId = numericMatch[0];
            }
        }
        
        // Build the appointment booking payload (matching your Airtable script)
        const payload = new URLSearchParams({
            patientid: bookingData.patientId.toString(),
            departmentid: departmentId.toString(),
            appointmenttypeid: appointmentTypeId.toString()
        });
        
        const url = `${baseUrl}/v1/${practiceId}/appointments/${bookingData.appointmentId}`;
        
        console.log('Booking appointment with:');
        console.log('  URL:', url);
        console.log('  Patient ID:', bookingData.patientId);
        console.log('  Department ID:', departmentId);
        console.log('  Appointment Type ID:', appointmentTypeId);
        
        // Make the API call to book the appointment
        const response = await axios.put(
            url,
            payload.toString(),
            {
                headers: {
                    'Authorization': `${tokenData.type} ${tokenData.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        console.log('Appointment booked successfully');
        console.log('Response status:', response.status);
        
        // Update appointment record in Firestore
        const appointmentRecord = {
            athenaAppointmentId: bookingData.appointmentId,
            athenaPatientId: bookingData.patientId,
            appointmentTypeId: appointmentTypeId,
            departmentId: departmentId,
            status: 'booked',
            bookedAt: new Date(),
            response: response.data
        };
        
        // Store or update the appointment record
        if (bookingData.originalRecordId) {
            await firestore.collection('appointments')
                .doc(bookingData.originalRecordId)
                .set(appointmentRecord, {merge: true});
        } else {
            await firestore.collection('appointments').add(appointmentRecord);
        }
        
        // Log success for monitoring
        await firestore.collection('appointment_log').add({
            type: 'booking_success',
            patientId: bookingData.patientId,
            appointmentId: bookingData.appointmentId,
            appointmentTypeId: appointmentTypeId,
            timestamp: new Date()
        });
        
        return {
            success: true,
            appointmentId: bookingData.appointmentId,
            message: 'Appointment booked successfully'
        };
        
    } catch (error) {
        console.error('Appointment booking failed:', error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            
            // Handle specific error cases from your Airtable script
            if (error.response.status === 400) {
                console.error('Bad request - possibly invalid appointment ID or patient ID');
            } else if (error.response.status === 401) {
                console.error('Authentication failed - token may be invalid');
            } else if (error.response.status === 404) {
                console.error('Appointment or patient not found');
            }
        }
        
        // Log error to Firestore
        await firestore.collection('errors').add({
            type: 'appointment_booking',
            bookingData: bookingData,
            error: error.message,
            errorDetails: error.response?.data || {},
            timestamp: new Date()
        });
        
        // Update appointment status to error if we have a record ID
        if (bookingData.originalRecordId) {
            await firestore.collection('appointments')
                .doc(bookingData.originalRecordId)
                .update({
                    status: 'error',
                    error: error.message,
                    errorAt: new Date()
                });
        }
        
        throw error;
    }
};