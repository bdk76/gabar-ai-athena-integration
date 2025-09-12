const express = require('express');
const {Firestore} = require('@google-cloud/firestore');
const basicAuth = require('express-basic-auth');
const fs = require('fs');

const app = express();
const firestore = new Firestore();

// Basic auth for HIPAA compliance - Credentials are now managed by environment variables
const dashboardUsers = {};
const dashboardUsername = process.env.DASHBOARD_USERNAME || 'gabaradmin';
const dashboardPassword = process.env.DASHBOARD_PASSWORD || 'ChangeThisSecurePassword123!';
dashboardUsers[dashboardUsername] = dashboardPassword;

app.use(basicAuth({
    users: dashboardUsers,
    challenge: true,
    realm: 'Gabar AI Patient Dashboard'
}));

app.get('/', async (req, res) => {
    const snapshot = await firestore.collection('patient_summary')
        .orderBy('lastActivity', 'desc')
        .limit(100)
        .get();

    let tableRows = '';
    if (snapshot.empty) {
        tableRows = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #999;">
                    No patient activity recorded yet
                </td>
            </tr>`;
    } else {
        snapshot.forEach(doc => {
            const data = doc.data();
            const lastActivity = data.lastActivity
                ? new Date(data.lastActivity._seconds * 1000).toLocaleString()
                : '-';

            const hasAppointment = data.appointmentId ? 'badge-success' : 'badge-pending';
            const statusText = data.appointmentId ? 'Scheduled' : 'Pending';

            const patientRecordCreated = data.patientRecordCreated ? '✅' : '❌';
            const bookedAppt = data.bookedAppt ? '✅' : '❌';
            const callLength = data.callLength ? data.callLength : '-';
            const lastNode = data.lastNodeId ? data.lastNodeId : '-';

            tableRows += `
                <tr>
                    <td><span class="patient-id">${data.patientId || '-'}</span></td>
                    <td><span class="first-name">${data.firstName || '-'}</span></td>
                    <td><span class="last-name">${data.lastName || '-'}</span></td>
                    <td><span class="timestamp">${lastActivity}</span></td>
                    <td>${patientRecordCreated}</td>
                    <td>${bookedAppt}</td>
                    <td>${callLength}</td>
                    <td>${lastNode}</td>
                    <td><span class="badge ${hasAppointment}">${statusText}</span></td>
                </tr>`;
        });
    }

    const totalPatients = snapshot.size;
    const todayCount = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (!data.lastActivity) return false;
        const date = new Date(data.lastActivity._seconds * 1000);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }).length;

    const withAppointments = snapshot.docs.filter(doc => doc.data().appointmentId).length;

    fs.readFile('./index.html', 'utf8', (err, html) => {
        if (err) {
            res.status(500).send('Error reading dashboard file');
            return;
        }

        html = html.replace('{{totalPatients}}', totalPatients);
        html = html.replace('{{todayCount}}', todayCount);
        html = html.replace('{{withAppointments}}', withAppointments);
        html = html.replace('{{tableRows}}', tableRows);

        res.send(html);
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Dashboard running on port ${PORT}`);
});