const db = require('../config/database');

const createClass = (name, code, department) => {
    const stmt = db.prepare('INSERT INTO classes (name, code, department) VALUES (?, ?, ?)');
    try {
        const info = stmt.run(name, code, department);
        return { id: info.lastInsertRowid, name, code, department };
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new Error('Class code already exists.');
        }
        throw error;
    }
};

const getAllClasses = () => {
    const stmt = db.prepare('SELECT * FROM classes ORDER BY code ASC');
    return stmt.all();
};

const deleteClass = (id) => {
    const stmt = db.prepare('DELETE FROM classes WHERE id = ?');
    return stmt.run(id);
};

const getClassById = (id) => {
    const stmt = db.prepare('SELECT * FROM classes WHERE id = ?');
    return stmt.get(id);
};

module.exports = {
    createClass,
    getAllClasses,
    deleteClass,
    getClassById
};
