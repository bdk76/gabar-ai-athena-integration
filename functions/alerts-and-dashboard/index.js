/**
 * Alerts and Dashboard for Gabar AI
 * Updates Google Sheets with patient and appointment data
 */

const {Firestore} = require('@google-cloud/firestore');
const {google} = require('googleapis');
const {PubSub} = require('@google-cloud/pubsub');

const firestore = new Firestore();
const pubsub = new PubSub();
const sheets = google.sheets('v4');

// Your Google Sheets configuration
const SPREADSHEET_ID = '1jTnDeNwcgITzhMkC97sm6vpzmEBkf80DsJCY56z0TrA';
const SHEET_NAME = 'Sheet1'; // Or whatever you name your sheet

/**
 * Initialize Google Sheets authentication
 */
async function authorizeSheets() {
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return auth.getClient();
}

/**
 * Alert when patient is created
 */
exports.alertPatientCreated = async (message, context) => {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    
    console.log('Patient created alert:', data.patientId);
    
    try {
        const auth = await authorizeSheets();
        google.options({auth});
        
        // Format timestamps for Las Vegas timezone
        const callTime = new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            dateStyle: 'short',
            timeStyle: 'short'
        });
        
        // Prepare row data
        const rowData = [
            callTime,                       // Registration Date/Time
            data.lastName || '',            // Patient Last Name
            data.firstName || '',           // Patient First Name
            data.patientId || '',           // Athena Patient ID
            data.appointmentId || 'Pending', // Appointment ID (if exists)
            'N/A',                          // Appointment Date/Time (not booked yet)
            'Patient Created',              // Status
            data.email || '',               // Email
            data.phone || ''                // Phone
        ];
        
        // Append to Google Sheets
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:I`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [rowData]
            }
        });
        
        // Store in Firestore for backup
        await firestore.collection('dashboard_entries').add({
            type: 'patient_created',
            patientId: data.patientId,
            lastName: data.lastName,
            firstName: data.firstName,
            timestamp: new Date(),
            data: data
        });
        
        console.log('✅ Dashboard updated with new patient');
        return {success: true};
        
    } catch (error) {
        console.error('Alert failed:', error);
        throw error;
    }
};

/**
 * Alert when appointment is booked
 */
exports.alertAppointmentBooked = async (message, context) => {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    
    console.log('Appointment booked alert:', data.appointmentId);
    
    try {
        const auth = await authorizeSheets();
        google.options({auth});
        
        // Get patient info from Firestore
        let patientData = {};
        if (data.originalRecordId) {
            const patientDoc = await firestore.collection('patients')
                .doc(data.originalRecordId).get();
            if (patientDoc.exists) {
                patientData = patientDoc.data();
            }
        }
        
        // If no patient data, try to get by patient ID
        if (!patientData.lastName && data.patientId) {
            const patientQuery = await firestore.collection('patients')
                .where('athenaPatientId', '==', data.patientId)
                .limit(1).get();
            if (!patientQuery.empty) {
                patientData = patientQuery.docs[0].data();
            }
        }
        
        const bookingTime = new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            dateStyle: 'short',
            timeStyle: 'short'
        });
        
        // Format appointment date/time if available
        const appointmentDateTime = data.appointmentDate && data.appointmentTime 
            ? `${data.appointmentDate} ${data.appointmentTime}`
            : 'Scheduled';
        
        // Prepare row data
        const rowData = [
            bookingTime,                        // Booking Date/Time
            patientData.lastName || '',         // Patient Last Name
            patientData.firstName || '',        // Patient First Name
            data.patientId || '',               // Athena Patient ID
            data.appointmentId || '',           // Appointment ID
            appointmentDateTime,                // Appointment Date/Time
            'Appointment Booked',               // Status
            patientData.email || '',            // Email
            patientData.phone || ''             // Phone
        ];
        
        // Append to Google Sheets
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:I`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [rowData]
            }
        });
        
        // Store in Firestore
        await firestore.collection('dashboard_entries').add({
            type: 'appointment_booked',
            appointmentId: data.appointmentId,
            patientId: data.patientId,
            lastName: patientData.lastName,
            timestamp: new Date(),
            data: data
        });
        
        console.log('✅ Dashboard updated with appointment booking');
        return {success: true};
        
    } catch (error) {
        console.error('Alert failed:', error);
        throw error;
    }
};