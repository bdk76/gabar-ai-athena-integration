/**
 * Patient Creator for Gabar AI Athena Integration
 * Creates patients in AthenaHealth using the same logic as your Airtable scripts
 */

const {Firestore} = require('@google-cloud/firestore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const {PubSub} = require('@google-cloud/pubsub');
const axios = require('axios');

const firestore = new Firestore();
const secretClient = new SecretManagerServiceClient();
const pubsub = new PubSub();
const PROJECT_ID = 'gabar-ai-athena-integration';

// Verbal number conversions from your Airtable script
const VERBAL_NUMBERS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
    'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
    'eighteen': '18', 'nineteen': '19', 'twenty': '20',
    'thirty': '30', 'forty': '40', 'fifty': '50', 'sixty': '60',
    'seventy': '70', 'eighty': '80', 'ninety': '90',
    'hundred': '100', 'thousand': '1000'
};

// State abbreviations from your Airtable script
const STATE_ABBREVIATIONS = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY'
};

// Convert verbal numbers to numeric (from your Airtable script)
function convertVerbalToNumeric(verbalText) {
    if (!verbalText) return '';
    
    const cleaned = String(verbalText).trim().toLowerCase();
    
    if (/^\d+$/.test(cleaned)) {
        return cleaned;
    }
    
    if (VERBAL_NUMBERS[cleaned]) {
        return VERBAL_NUMBERS[cleaned];
    }
    
    // Handle compound numbers
    if (cleaned.includes('-') || cleaned.includes(' ')) {
        const parts = cleaned.split(/[\s-]+/);
        let total = 0;
        let current = 0;
        
        for (const part of parts) {
            if (VERBAL_NUMBERS[part]) {
                const value = parseInt(VERBAL_NUMBERS[part]);
                if (part === 'hundred') {
                    current = (current || 1) * 100;
                } else if (part === 'thousand') {
                    total += (current || 1) * 1000;
                    current = 0;
                } else {
                    current += value;
                }
            }
        }
        
        total += current;
        if (total > 0) {
            return total.toString();
        }
    }
    
    // Handle ordinal numbers
    const ordinalMatch = cleaned.match(/^(\d+)(st|nd|rd|th)$/);
    if (ordinalMatch) {
        return ordinalMatch[1];
    }
    
    return verbalText;
}

// Build street address from house number and street
function buildStreetAddress(houseNumber, street) {
    const numericHouseNumber = convertVerbalToNumeric(houseNumber);
    const cleanedStreet = street ? String(street).trim().replace(/"/g, '') : '';
    
    if (numericHouseNumber && cleanedStreet) {
        return `${numericHouseNumber} ${cleanedStreet}`;
    } else if (cleanedStreet) {
        return cleanedStreet;
    } else if (numericHouseNumber) {
        return numericHouseNumber;
    }
    
    return '';
}

// Format date from ISO to US format
function formatDateForAthena(isoDate) {
    if (!isoDate) return '';
    
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    
    return `${parts[1]}/${parts[2]}/${parts[0]}`; // MM/DD/YYYY
}

// Clean phone number
function cleanPhone(phone) {
    if (!phone) return '';
    
    let cleaned = phone.replace(/\D/g, '');
    
    // Remove leading 1 if 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = cleaned.substring(1);
    }
    
    // Validate NANP format
    if (cleaned.length === 10 && cleaned[0] >= '2' && cleaned[0] <= '9' && 
        cleaned[3] >= '2' && cleaned[3] <= '9') {
        return cleaned;
    }
    
    return '';
}

// Normalize sex field
function normalizeSex(value) {
    const cleaned = String(value || '').replace(/"/g, '').trim().toUpperCase();
    if (cleaned === 'MAN' || cleaned === 'M' || cleaned === 'MALE') return 'M';
    if (cleaned === 'WOMAN' || cleaned === 'F' || cleaned === 'FEMALE') return 'F';
    return '';
}

// Get state abbreviation
function getStateAbbreviation(stateName) {
    if (!stateName) return '';
    if (stateName.length === 2) return stateName.toUpperCase();
    return STATE_ABBREVIATIONS[stateName.toLowerCase()] || stateName;
}

// Main patient creation function
exports.createAthenaPatient = async (message, context) => {
    const patientData = JSON.parse(Buffer.from(message.data, 'base64').toString());
    
    console.log('Creating patient:', patientData.firstName, patientData.lastName);
    
    try {
        // Get OAuth token from Firestore
        const tokenDoc = await firestore.collection('api_tokens').doc('athena-current').get();
        if (!tokenDoc.exists) {
            throw new Error('No valid token found. Run token refresh first.');
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
        
        // Process patient data (using your Airtable logic)
        const streetAddress = buildStreetAddress(patientData.houseNumber, patientData.street);
        const cleanedPhone = cleanPhone(patientData.phone);
        const formattedDob = formatDateForAthena(patientData.dateOfBirth);
        const normalizedSex = normalizeSex(patientData.sex);
        const stateAbbr = getStateAbbreviation(patientData.state);
        
        // Validate required fields
        if (!patientData.firstName || !patientData.lastName || !formattedDob) {
            throw new Error('Missing required fields: firstname, lastname, or DOB');
        }
        
        // Must have at least one contact method
        if (!patientData.email && !cleanedPhone && !patientData.zip) {
            throw new Error('At least one contact method (email, phone, or ZIP) is required');
        }
        
        // Build API payload
        const payload = new URLSearchParams({
            firstname: patientData.firstName,
            lastname: patientData.lastName,
            dob: formattedDob,
            departmentid: departmentId
        });
        
        // Add optional fields
        if (patientData.email) payload.append('email', patientData.email);
        if (cleanedPhone) payload.append('mobilephone', cleanedPhone);
        if (normalizedSex) payload.append('sex', normalizedSex);
        if (streetAddress) payload.append('address1', streetAddress);
        if (patientData.city) payload.append('city', patientData.city);
        if (stateAbbr) payload.append('state', stateAbbr);
        if (patientData.zip) payload.append('zip', patientData.zip);
        
        console.log('Sending to AthenaHealth API...');
        console.log('Payload:', payload.toString());
        
        // Call AthenaHealth API
        const response = await axios.post(
            `${baseUrl}/v1/${practiceId}/patients`,
            payload.toString(),
            {
                headers: {
                    'Authorization': `${tokenData.type} ${tokenData.token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        // Extract patient ID from response
        const athenaPatientId = Array.isArray(response.data) 
            ? response.data[0].patientid 
            : response.data.patientid;
        
        console.log('Patient created with ID:', athenaPatientId);
        
        // Update patient record in Firestore
        await firestore.collection('patients').doc(patientData.id).set({
            ...patientData,
            athenaPatientId: athenaPatientId,
            athenaCreatedAt: new Date(),
            status: 'created',
            streetAddress: streetAddress
        });
        
        // Update intake queue status
        await firestore.collection('patient_intake_queue').doc(patientData.id).update({
            status: 'completed',
            athenaPatientId: athenaPatientId,
            completedAt: new Date()
        });
        
        // Publish to appointment booking topic if appointment ID exists
        if (patientData.appointmentId) {
            console.log(`Publishing to book-appointment with appointmentId: ${patientData.appointmentId}`);
            await pubsub.topic('book-appointment').publish(Buffer.from(JSON.stringify({
                patientId: athenaPatientId,
                appointmentId: patientData.appointmentId,
                appointmentTypeId: patientData.appointmentTypeId || '15',
                originalRecordId: patientData.id
            })));
            
            console.log('Queued for appointment booking');
        }
        
        // Publish to activity log
        await pubsub.topic('patient-activity').publish(Buffer.from(JSON.stringify({
            patientId: athenaPatientId,
            lastName: patientData.lastName,
            activityType: 'PATIENT_CREATED',
            status: 'success'
        })));

        return {
            success: true,
            patientId: athenaPatientId
        };
        
    } catch (error) {
        console.error('Patient creation failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        
        // Log error
        await firestore.collection('errors').add({
            type: 'patient_creation',
            patientData: patientData,
            error: error.message,
            details: error.response?.data || {},
            timestamp: new Date()
        });
        
        // Update intake queue with error status
        await firestore.collection('patient_intake_queue').doc(patientData.id).update({
            status: 'error',
            error: error.message,
            errorAt: new Date()
        });
        
        throw error;
    }
};