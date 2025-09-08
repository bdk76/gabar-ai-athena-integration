/**
 * Patient Intake Processor for Gabar AI Athena Integration
 * Processes new patient forms from the intake queue
 */

const {Firestore} = require('@google-cloud/firestore');
const {PubSub} = require('@google-cloud/pubsub');

const firestore = new Firestore();
const pubsub = new PubSub();

exports.processIntakeQueue = async (message, context) => {
    console.log('📋 Processing patient intake queue...');
    
    try {
        // Query for unprocessed patients
        const snapshot = await firestore.collection('patient_intake_queue')
            .where('status', '==', 'pending')
            .limit(10)
            .get();
        
        if (snapshot.empty) {
            console.log('No new patients to process');
            return {processed: 0};
        }
        
        console.log(`Found ${snapshot.size} new patient(s) to process`);
        
        let processedCount = 0;
        for (const doc of snapshot.docs) {
            const patientData = doc.data();
            
            // Mark as processing
            await doc.ref.update({
                status: 'processing',
                processingStarted: new Date()
            });
            
            // Publish to patient creation topic
            const messageData = {
                id: doc.id,
                ...patientData
            };
            
            await pubsub.topic('create-patient').publish(
                Buffer.from(JSON.stringify(messageData))
            );
            
            console.log(`✅ Queued patient ${patientData.firstName} ${patientData.lastName}`);
            processedCount++;
        }
        
        return {
            success: true,
            processed: processedCount
        };
        
    } catch (error) {
        console.error('❌ Intake processing failed:', error);
        
        // Log error
        await firestore.collection('errors').add({
            type: 'intake_processing',
            error: error.message,
            timestamp: new Date()
        });
        
        throw error;
    }
};