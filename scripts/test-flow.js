// File: /home/claude/test-flow.js

const axios = require('axios');

async function testFlow() {
  const testData = {
    call_id: "test_" + Date.now(),
    pathway_id: "test_pathway",
    status: "completed",
    variables: {
      first_name: "Test",
      last_name: "Patient",
      date_of_birth: "1990-01-15",
      phone: "+17025551234",
      email: "test@example.com",
      sex: "M",
      house_number: "123",
      street: "Main St",
      city: "Las Vegas",
      state: "NV",
      zip: "89101",
      selected_appointment_id: "12345",
      selected_appointment_type_id: "15"
    }
  };
  
  try {
    const response = await axios.post(
      'https://us-central1-gabar-ai-athena-integration.cloudfunctions.net/blandWebhook',
      testData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Response:', response.data);
    console.log('Check Firestore for queue ID:', response.data.patientQueueId);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testFlow();