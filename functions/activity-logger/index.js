const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.logPatientActivity = async (pubsubMessage, context) => {
    const data = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString());
    
    // Store in Firestore (automatically encrypted at rest)
    await firestore.collection('patient_activity_log').add({
        patientId: data.patientId,
        lastName: data.lastName,
        activityType: data.activityType, // 'PATIENT_CREATED' or 'APPOINTMENT_BOOKED'
        appointmentId: data.appointmentId || null,
        appointmentDateTime: data.appointmentDateTime || null,
        callDateTime: new Date(),
        timestamp: new Date(),
        status: data.status
    });
    
    // Also create/update summary record for easy viewing
    await firestore.collection('patient_summary').doc(data.patientId).set({
        patientId: data.patientId,
        lastName: data.lastName,
        lastActivity: new Date(),
        appointmentId: data.appointmentId || null,
        appointmentDateTime: data.appointmentDateTime || null,
        totalActivities: Firestore.FieldValue.increment(1),
        callLength: data.callLength,
        lastNodeId: data.lastNodeId,
        patientRecordCreated: data.patientRecordCreated,
        bookedAppt: data.bookedAppt
    }, {merge: true});
    
    console.log(`Logged activity for patient ${data.lastName} (${data.patientId})`);
};