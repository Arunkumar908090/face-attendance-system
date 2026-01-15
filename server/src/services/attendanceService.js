const db = require('../config/database');
const faceService = require('./faceService');

const THRESHOLD = 0.45; // Strictness for ArcFace

const logAttendance = (userId, sessionId, type, image) => {
    const stmt = db.prepare('INSERT INTO attendance (user_id, session_id, type, image) VALUES (?, ?, ?, ?)');
    const info = stmt.run(userId, sessionId, type, image);
    return info.lastInsertRowid;
};

const checkDuplicate = (userId, sessionId, type) => {
    if (!sessionId) return false;
    const stmt = db.prepare('SELECT id FROM attendance WHERE user_id = ? AND session_id = ? AND type = ?');
    return !!stmt.get(userId, sessionId, type);
};

const verifyFace = async (imageBuffer) => {
    // 1. Generate Embedding
    const embedding = await faceService.generateEmbedding(imageBuffer);

    // 2. Fetch all users and descriptors
    // TODO: optimization - cache users or use FAISS/Vector DB if scale is large.
    // For now, SQL loop is fine for < 1000 users.
    const users = db.prepare('SELECT id, name, descriptor FROM users').all();

    let bestMatch = { userId: null, score: -1, name: null };

    for (const user of users) {
        if (!user.descriptor) continue;

        let storedDescriptors = [];
        try {
            const parsed = JSON.parse(user.descriptor);
            // Support both [] and [[]] formats
            storedDescriptors = Array.isArray(parsed[0]) ? parsed : [parsed];
        } catch (e) {
            continue;
        }

        // Check against all stored descriptors for this user
        for (const desc of storedDescriptors) {
            const score = faceService.calculateSimilarity(embedding, desc);
            if (score > bestMatch.score) {
                bestMatch = { userId: user.id, score, name: user.name };
            }
        }
    }

    console.log(`Best match: ${bestMatch.name} (${bestMatch.score})`);

    if (bestMatch.score >= THRESHOLD) {
        return bestMatch.userId;
    }

    return null;
};

const getAttendanceLogs = (search) => {
    let query = `
    SELECT a.id, strftime('%Y-%m-%dT%H:%M:%SZ', a.timestamp) as timestamp, a.type, a.image, u.name, u.matric_no, u.level, u.department, s.name as session_name
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    LEFT JOIN sessions s ON a.session_id = s.id
  `;

    const params = [];
    if (search) {
        query += ' WHERE u.name LIKE ? OR u.matric_no LIKE ? OR date(a.timestamp) = ?';
        params.push(`%${search}%`, `%${search}%`, search);
    }

    query += ' ORDER BY a.timestamp DESC';
    const stmt = db.prepare(query);
    return stmt.all(...params);
};

const deleteAttendance = (id) => {
    const stmt = db.prepare('DELETE FROM attendance WHERE id = ?');
    return stmt.run(id);
};

const deleteAttendanceByDate = (date) => {
    const stmt = db.prepare('DELETE FROM attendance WHERE date(timestamp) = ?');
    return stmt.run(date);
};

const getAttendanceMatrix = (classId) => {
    // 1. Get all sessions for this class
    let sessionQuery = 'SELECT id, name, date(start_time) as date FROM sessions WHERE 1=1';
    const params = [];

    if (classId) {
        sessionQuery += ' AND class_id = ?';
        params.push(classId);
    }
    sessionQuery += ' ORDER BY start_time ASC';
    const sessions = db.prepare(sessionQuery).all(...params);

    if (sessions.length === 0) return { sessions: [], data: [] };

    // 2. Get all students (filter by class if classId is provided)
    let userQuery = `
        SELECT u.id, u.name, u.matric_no
        FROM users u
        ${classId ? 'JOIN user_classes uc ON u.id = uc.user_id WHERE uc.class_id = ?' : ''}
        ORDER BY u.name ASC
    `;
    const users = db.prepare(userQuery).all(...(classId ? [classId] : []));

    // 3. Get all attendance records for these sessions
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return { sessions, data: [] };

    const attendanceQuery = `
        SELECT user_id, session_id 
        FROM attendance 
        WHERE session_id IN (${sessionIds.join(',')}) AND type = 'in'
    `;
    const attendanceRecords = db.prepare(attendanceQuery).all();

    // 4. Build Matrix
    const attendanceMap = {};
    attendanceRecords.forEach(r => {
        attendanceMap[`${r.user_id}_${r.session_id}`] = true;
    });

    const matrix = users.map(user => {
        const row = {
            name: user.name,
            matric_no: user.matric_no,
            attendance: {}
        };
        sessions.forEach(session => {
            row.attendance[session.id] = attendanceMap[`${user.id}_${session.id}`] ? 1 : 0;
        });
        return row;
    });

    return { sessions, data: matrix };
};

module.exports = {
    logAttendance,
    checkDuplicate,
    verifyFace,
    getAttendanceLogs,
    deleteAttendance,
    deleteAttendanceByDate,
    getAttendanceMatrix
};
