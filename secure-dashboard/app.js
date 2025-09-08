const express = require('express');
const {Firestore} = require('@google-cloud/firestore');
const basicAuth = require('express-basic-auth');

const app = express();
const firestore = new Firestore();

// Basic auth for HIPAA compliance - CHANGE THIS PASSWORD!
app.use(basicAuth({
    users: { 'gabaradmin': 'ChangeThisSecurePassword123!' },
    challenge: true,
    realm: 'Gabar AI Patient Dashboard'
}));

app.get('/', async (req, res) => {
    const snapshot = await firestore.collection('patient_summary')
        .orderBy('lastActivity', 'desc')
        .limit(100)
        .get();
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Gabar AI - Patient Activity Dashboard</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container {
                max-width: 1400px;
                margin: 0 auto;
            }
            .header {
                background: white;
                padding: 30px;
                border-radius: 12px;
                margin-bottom: 30px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                font-size: 28px;
                margin-bottom: 10px;
            }
            .subtitle {
                color: #666;
                font-size: 14px;
            }
            .stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin: 20px 0;
            }
            .stat-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            .stat-number {
                font-size: 32px;
                font-weight: bold;
                color: #667eea;
            }
            .stat-label {
                color: #666;
                font-size: 14px;
                margin-top: 5px;
            }
            .table-container {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th {
                background: #667eea;
                color: white;
                padding: 15px;
                text-align: left;
                font-weight: 500;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            td {
                padding: 15px;
                border-bottom: 1px solid #f0f0f0;
                font-size: 14px;
            }
            tr:hover {
                background: #f9f9ff;
            }
            .patient-id {
                font-family: monospace;
                background: #f0f0f0;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
            }
            .last-name {
                font-weight: 600;
                color: #333;
            }
            .timestamp {
                color: #666;
                font-size: 13px;
            }
            .refresh-btn {
                float: right;
                padding: 10px 20px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 500;
                transition: all 0.3s;
            }
            .refresh-btn:hover {
                background: #5a67d8;
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
            }
            .badge {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
            }
            .badge-success {
                background: #d4edda;
                color: #155724;
            }
            .badge-pending {
                background: #fff3cd;
                color: #856404;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <a href="/" class="refresh-btn">↻ Refresh</a>
                <h1>🏥 Gabar AI Patient Activity Dashboard</h1>
                <div class="subtitle">HIPAA-Compliant Patient Tracking System • My Virtual Physician</div>
            </div>`;
    
    // Calculate stats
    const totalPatients = snapshot.size;
    const todayCount = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (!data.lastActivity) return false;
        const date = new Date(data.lastActivity._seconds * 1000);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }).length;
    
    const withAppointments = snapshot.docs.filter(doc => doc.data().appointmentId).length;
    
    html += `
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">${totalPatients}</div>
                    <div class="stat-label">Total Patients</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${todayCount}</div>
                    <div class="stat-label">Today's Activity</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${withAppointments}</div>
                    <div class="stat-label">Appointments Booked</div>
                </div>
            </div>
            
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Patient ID</th>
                            <th>Last Name</th>
                            <th>Last Activity</th>
                            <th>Appointment ID</th>
                            <th>Appointment Time</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    if (snapshot.empty) {
        html += `
                        <tr>
                            <td colspan="6" style="text-align: center; padding: 40px; color: #999;">
                                No patient activity recorded yet
                            </td>
                        </tr>`;
    } else {
        snapshot.forEach(doc => {
            const data = doc.data();
            const lastActivity = data.lastActivity 
                ? new Date(data.lastActivity._seconds * 1000).toLocaleString() 
                : '-';
            const appointmentDateTime = data.appointmentDateTime 
                ? new Date(data.appointmentDateTime._seconds * 1000).toLocaleString() 
                : '-';
            
            const hasAppointment = data.appointmentId ? 'badge-success' : 'badge-pending';
            const statusText = data.appointmentId ? 'Scheduled' : 'Pending';
            
            html += `
                        <tr>
                            <td><span class="patient-id">${data.patientId || '-'}</span></td>
                            <td><span class="last-name">${data.lastName || '-'}</span></td>
                            <td><span class="timestamp">${lastActivity}</span></td>
                            <td>${data.appointmentId || '-'}</td>
                            <td>${appointmentDateTime}</td>
                            <td><span class="badge ${hasAppointment}">${statusText}</span></td>
                        </tr>`;
        });
    }
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>`;
    
    res.send(html);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Dashboard running on port ${PORT}`);
});