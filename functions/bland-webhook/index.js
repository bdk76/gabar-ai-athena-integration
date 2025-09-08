/**
 * Bland.AI Webhook Receiver for Gabar AI
 * Processes patient intake from conversational pathways
 */

const express = require('express');
const {Firestore} = require('@google-cloud/firestore');
const {PubSub} = require('@google-cloud/pubsub');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const firestore = new Firestore();
const pubsub = new PubSub();

// Webhook secret for verification
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-here';

// Helper functions for data parsing
function parsePhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = cleaned.substring(1);
    }
    if (cleaned.length === 10 && cleaned[0] >= '2' && cleaned[0] <= '9' && cleaned[3] >= '2' && cleaned[3] <= '9') {
        return cleaned;
    }
    return '';
}

function parseDate(dateInput) {
    if (!dateInput) return null;
    const dateStr = String(dateInput).trim();
    let date = new Date(dateStr);
    
    if (isNaN(date)) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const lowerStr = dateStr.toLowerCase();
        for (let i = 0; i < monthNames.length; i++) {
            if (lowerStr.includes(monthNames[i])) {
                const dayMatch = lowerStr.match(/\d{1,2}/);
                const yearMatch = lowerStr.match(/\d{4}/);
                if (dayMatch && yearMatch) {
                    date = new Date(yearMatch[0], i, dayMatch[0]);
                    break;
                }
            }
        }
    }
    
    if (!isNaN(date)) {
        return date.toISOString().split('T')[0];
    }
    return null;
}

function parseAddress(addressString) {
    if (!addressString) return {};
    const addr = String(addressString).trim();
    const parts = addr.split(',').map(p => p.trim());
    
    let result = {
        houseNumber: '',
        street: '',
        city: '',
        state: '',
        zip: ''
    };
    
    if (parts.length >= 1) {
        const streetMatch = parts[0].match(/^(\d+|\w+)\s+(.+)$/);
        if (streetMatch) {
            result.houseNumber = streetMatch[1];
            result.street = streetMatch[2];
        } else {
            result.street = parts[0];
        }
    }
    
    if (parts.length >= 2) result.city = parts[1];
    if (parts.length >= 3) {
        const stateZip = parts[2];
        const zipMatch = stateZip.match(/(\d{5})/);
        if (zipMatch) {
            result.zip = zipMatch[1];
            result.state = stateZip.replace(zipMatch[1], '').trim();
        } else {
            result.state = stateZip;
        }
    }
    
    return result;
}

// Main webhook handler
app.post('/webhook/bland', async (req, res) => {
    console.log('📞 Received webhook from Bland.AI');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        const {
            call_id,
            pathway_id,
            variables = {},
            transcript,
            call_length,
            status,
            completed_at,
            phone_number
        } = req.body;
        
        console.log(`Call ID: ${call_id}`);
        console.log(`Status: ${status}`);
        
        if (status !== 'completed' && status !== 'success') {
            await firestore.collection('bland_failed_calls').add({
                callId: call_id,
                status: status,
                timestamp: new Date(),
                data: req.body
            });
            return res.status(200).json({ received: true, processed: false, reason: 'Call not completed' });
        }
        
        const patientData = {
            firstName: variables.first_name || variables.firstName || '',
            lastName: variables.last_name || variables.lastName || '',
            dateOfBirth: parseDate(variables.date_of_birth || variables.dob || variables.birthdate),
            phone: parsePhoneNumber(variables.phone || phone_number),
            email: variables.email || '',
            sex: variables.gender || variables.sex || '',
            ...parseAddress(variables.address || variables.full_address),
            houseNumber: variables.house_number || parseAddress(variables.address).houseNumber || '',
            street: variables.street || parseAddress(variables.address).street || '',
            city: variables.city || parseAddress(variables.address).city || 'Las Vegas',
            state: variables.state || parseAddress(variables.address).state || 'Nevada',
            zip: variables.zip || parseAddress(variables.address).zip || '',
            preferredDate: variables.preferred_date || '',
            preferredTime: variables.preferred_time || '',
            reasonForVisit: variables.reason_for_visit || '',
            source: 'bland_ai',
            callId: call_id,
            pathwayId: pathway_id,
            status: 'pending',
            createdAt: new Date()
        };
        
        const errors = [];
        if (!patientData.firstName) errors.push('Missing first name');
        if (!patientData.lastName) errors.push('Missing last name');
        if (!patientData.dateOfBirth) errors.push('Missing date of birth');
        if (!patientData.email && !patientData.phone && !patientData.zip) {
            errors.push('Missing contact information');
        }
        
        if (errors.length > 0) {
            await firestore.collection('bland_incomplete_records').add({
                callId: call_id,
                errors: errors,
                data: patientData,
                timestamp: new Date()
            });
            return res.status(200).json({ received: true, processed: false, errors: errors });
        }
        
        const docRef = await firestore.collection('patient_intake_queue').add(patientData);
        
        console.log(`✅ Patient added: ${patientData.firstName} ${patientData.lastName}`);
        
        await pubsub.topic('patient-activity').publish(Buffer.from(JSON.stringify({
            patientId: docRef.id,
            lastName: patientData.lastName,
            activityType: 'INTAKE_RECEIVED',
            status: 'pending',
            source: 'bland_ai'
        })));
        
        const hour = new Date().getHours();
        if (hour >= 8 && hour <= 18) {
            await pubsub.topic('process-patient-queue').publish(
                Buffer.from(JSON.stringify({ trigger: 'bland_webhook', urgent: true }))
            );
        }
        
        res.status(200).json({
            success: true,
            message: 'Patient intake received',
            patientQueueId: docRef.id
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        await firestore.collection('webhook_errors').add({
            source: 'bland_ai',
            error: error.message,
            payload: req.body,
            timestamp: new Date()
        });
        res.status(500).json({ success: false, error: 'Processing error' });
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

exports.blandWebhook = app;
