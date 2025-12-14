const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Allow large payloads for base64 images/descriptors

const xlsx = require('xlsx');

// Register a new user with face descriptor
app.post('/api/register', (req, res) => {
    const { name, descriptor, section } = req.body;
    if (!name || !descriptor) {
        return res.status(400).json({ error: 'Name and descriptor are required' });
    }

    try {
        const userId = db.registerUser(name, JSON.stringify(descriptor), section);
        res.json({ success: true, userId });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'User already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Load all users (for face matching on client)
app.get('/api/users', (req, res) => {
    try {
        const users = db.getAllUsers();
        // Parse descriptors back to arrays
        const usersWithDescriptors = users.map(u => ({
            ...u,
            descriptor: JSON.parse(u.descriptor)
        }));
        res.json(usersWithDescriptors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', (req, res) => {
    try {
        db.deleteUser(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Sessions
app.post('/api/sessions', (req, res) => {
    const { name, action, id } = req.body;
    try {
        if (action === 'create') {
            const session = db.createSession(name);
            res.json(session);
        } else if (action === 'toggle') {
            db.toggleSession(id, req.body.isActive);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sessions/active', (req, res) => {
    try {
        const session = db.getActiveSession();
        res.json(session || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Log attendance
app.post('/api/attendance', (req, res) => {
    const { userId, type, image } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'UserId is required' });
    }

    try {
        const activeSession = db.getActiveSession();
        // Allow attendance even if no session is active (optional, could be strict)
        const sessionId = activeSession ? activeSession.id : null;

        // Duplicate check
        if (sessionId && db.checkDuplicate(userId, sessionId, type)) {
            return res.status(409).json({ error: 'Already signed in for this session' });
        }

        const entryId = db.logAttendance(userId, sessionId, type, image);
        res.json({ success: true, entryId, session: activeSession });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get attendance logs
app.get('/api/attendance', (req, res) => {
    try {
        const logs = db.getAttendanceLogs();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/attendance/bulk', (req, res) => {
    const { date } = req.body;
    try {
        if (date) {
            db.deleteAttendanceByDate(date);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Date is required' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/attendance/:id', (req, res) => {
    try {
        db.deleteAttendance(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/export', (req, res) => {
    try {
        const logs = db.getAttendanceLogs();
        const data = logs.map(l => ({
            ID: l.id,
            Name: l.name,
            Time: new Date(l.timestamp).toLocaleString(),
            Type: l.type,
            Session: l.session_name || 'N/A'
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, 'Attendance');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="attendance.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
