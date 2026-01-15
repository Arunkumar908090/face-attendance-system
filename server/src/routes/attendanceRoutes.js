const express = require('express');
const router = express.Router();
const attendanceService = require('../services/attendanceService');
const sessionService = require('../services/sessionService');
const xlsx = require('xlsx');
const userService = require('../services/userService');
const db = require('../config/database');
const multer = require('multer');

// Configure Multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Log attendance (Scan Face)
router.post('/', upload.single('image'), async (req, res) => {
    // userId is NO LONGER required in body if image is provided
    let { userId } = req.body;

    try {
        if (req.file) {
            // VERIFY FACE
            console.log("Verifying face...");
            const recognizedUserId = await attendanceService.verifyFace(req.file.buffer);

            if (!recognizedUserId) {
                return res.status(401).json({ error: 'Face not recognized' });
            }
            userId = recognizedUserId;
        }

        if (!userId) {
            return res.status(400).json({ error: 'UserId or Image is required' });
        }

        const activeSession = sessionService.getActiveSession();

        if (!activeSession) {
            return res.status(403).json({ error: 'No active session. Please wait for lecturer to start a session.' });
        }

        const sessionMode = activeSession.type;
        const sessionId = activeSession.id;

        // Duplicate check
        if (attendanceService.checkDuplicate(userId, sessionId, sessionMode)) {
            // We might want to return success if already marked, to avoid error alerts on repeated scans
            // But strict error helps debugging.
            return res.status(409).json({ error: 'Already marked for this session' });
        }

        // We can save the scanned image if we want audit trails.
        // For now, pass 'null' or a placeholder if we don't save the file to disk.
        // current DB schema has 'image' column (TEXT?). 
        // We will skip saving the actual image blob to DB to save space, unless required.
        const entryId = attendanceService.logAttendance(userId, sessionId, sessionMode, null);

        // Fetch user details to return
        const user = db.prepare('SELECT name, matric_no FROM users WHERE id = ?').get(userId);

        res.json({ success: true, entryId, session: activeSession, user });
    } catch (err) {
        console.error("Attendance error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get attendance logs
router.get('/', (req, res) => {
    try {
        const { search } = req.query;
        const logs = attendanceService.getAttendanceLogs(search);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/bulk', (req, res) => {
    const { date } = req.body;
    try {
        if (date) {
            attendanceService.deleteAttendanceByDate(date);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Date is required' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        attendanceService.deleteAttendance(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export Matrix Excel
router.get('/export-matrix', (req, res) => {
    try {
        const { sessionName, classId } = req.query;

        if (classId) {
            const result = attendanceService.getAttendanceMatrix(classId);
            const { sessions, data } = result;

            if (sessions.length === 0) return res.status(404).json({ error: 'No sessions found for this class' });

            const headers = ['Matric No', 'Name'];
            sessions.forEach(s => headers.push(`${s.name} (${s.date})`));

            const excelRows = data.map(row => {
                const r = {
                    'Matric No': row.matric_no || 'N/A',
                    'Name': row.name
                };
                sessions.forEach(s => {
                    r[`${s.name} (${s.date})`] = row.attendance[s.id];
                });
                return r;
            });

            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(excelRows);
            xlsx.utils.book_append_sheet(wb, ws, 'Attendance Matrix');

            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Disposition', `attachment; filename="class_matrix_${classId}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
            return;
        }

        if (!sessionName) return res.status(400).json({ error: 'sessionName or classId is required' });

        const users = userService.getAllUsers();
        const sessions = db.prepare('SELECT id, date(start_time) as date FROM sessions WHERE name = ? ORDER BY start_time ASC').all(sessionName);

        if (sessions.length === 0) return res.status(404).json({ error: 'No sessions found with this name' });

        const dates = [...new Set(sessions.map(s => s.date))];
        const sessionIdsByDate = {};
        dates.forEach(d => {
            sessionIdsByDate[d] = sessions.filter(s => s.date === d).map(s => s.id);
        });

        const sessionIds = sessions.map(s => s.id);
        const placeholders = sessionIds.map(() => '?').join(',');
        const attendance = db.prepare(`SELECT user_id, session_id FROM attendance WHERE session_id IN (${placeholders})`).all(...sessionIds);

        const matrixData = users.map(user => {
            const row = {
                'Matric No': user.matric_no || 'N/A',
                'Name': user.name,
                'Department': user.department || 'N/A',
                'Course': user.course || 'N/A'
            };

            dates.forEach(date => {
                const idsForDate = sessionIdsByDate[date];
                const wasPresent = attendance.some(a => a.user_id === user.id && idsForDate.includes(a.session_id));
                row[date] = wasPresent ? 1 : 0;
            });

            return row;
        });

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(matrixData);
        xlsx.utils.book_append_sheet(wb, ws, 'Attendance Matrix');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="attendance_matrix_${sessionName.replace(/\s+/g, '_')}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
