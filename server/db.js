const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('attendance.db', { verbose: console.log });

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    descriptor TEXT NOT NULL,
    section TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id INTEGER,
    type TEXT DEFAULT 'in',
    image TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

const registerUser = (name, descriptor, section = '') => {
  const stmt = db.prepare('INSERT INTO users (name, descriptor, section) VALUES (?, ?, ?)');
  const info = stmt.run(name, descriptor, section);
  return info.lastInsertRowid;
};

const getAllUsers = () => {
  const stmt = db.prepare('SELECT * FROM users');
  return stmt.all();
};

const deleteUser = (id) => {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  return stmt.run(id);
};


// Session Management
const createSession = (name) => {
  // Deactivate all other sessions first
  db.prepare('UPDATE sessions SET is_active = 0').run();
  const stmt = db.prepare('INSERT INTO sessions (name) VALUES (?)');
  const info = stmt.run(name);
  return { id: info.lastInsertRowid, name, is_active: 1 };
};

const getActiveSession = () => {
  const stmt = db.prepare('SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
  return stmt.get();
};

const toggleSession = (id, isActive) => {
  if (isActive) {
    db.prepare('UPDATE sessions SET is_active = 0').run();
  }
  const stmt = db.prepare('UPDATE sessions SET is_active = ? WHERE id = ?');
  stmt.run(isActive ? 1 : 0, id);
};

// Attendance
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

const getAttendanceLogs = () => {
  const stmt = db.prepare(`
    SELECT a.id, a.timestamp, a.type, a.image, u.name, s.name as session_name
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    LEFT JOIN sessions s ON a.session_id = s.id
    ORDER BY a.timestamp DESC
  `);
  return stmt.all();
};

const deleteAttendance = (id) => {
  const stmt = db.prepare('DELETE FROM attendance WHERE id = ?');
  return stmt.run(id);
};

const deleteAttendanceByDate = (dateStr) => {
  // dateStr format YYYY-MM-DD
  const stmt = db.prepare("DELETE FROM attendance WHERE date(timestamp) = ?");
  return stmt.run(dateStr);
};

module.exports = {
  registerUser,
  getAllUsers,
  deleteUser,
  createSession,
  getActiveSession,
  toggleSession,
  logAttendance,
  checkDuplicate,
  getAttendanceLogs,
  deleteAttendance,
  deleteAttendanceByDate
};
