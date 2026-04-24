const pool = require('../config/database');

const registerUser = async (user) => {
    let { name, register_no, matric_no, year, department, course, photo, descriptor, section, classIds } = user;

    // Enforce BLOCK LETTERS
    name = (name || '').toUpperCase();

    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
        'SELECT id FROM users WHERE matric_no = $1',
        [matric_no]
    );

    if (existingUsers.length > 0) {
        throw new Error("Student already enrolled. Please contact the lecturer.");
    }

    // Ensure descriptor format is always array of arrays
    const initialDescriptors =
        (Array.isArray(descriptor) && Array.isArray(descriptor[0]))
            ? descriptor
            : [descriptor];

    // Insert user
    const { rows } = await pool.query(
        `INSERT INTO users 
        (name, register_no, matric_no, year, department, course, photo, descriptor, section) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8 , $9) 
        RETURNING id`,
        [
            name,
            register_no,
            matric_no,
            year,
            department,
            course,
            photo || null, // <-- now it's just local path
            JSON.stringify(initialDescriptors),
            section || null
        ]
    );

    const userId = rows[0].id;

    // Handle class enrollments
    if (classIds && Array.isArray(classIds)) {
        for (const cId of classIds) {
            try {
                await pool.query(
                    `INSERT INTO enrollments (user_id, class_id) 
                     VALUES ($1, $2) 
                     ON CONFLICT DO NOTHING`,
                    [userId, cId]
                );
            } catch (e) {
                // ignore safely
            }
        }
    }

    return { userId, created: true };
};

const getAllUsers = async (search, sort, page = 1, limit = 10) => {
    let query = `
        SELECT u.id, u.name, u.register_no, u.matric_no, u.year, u.department, u.course, u.photo, u.descriptor, u.section, u.is_active,
        to_char(u.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
        STRING_AGG(c.code, ', ') as enrolled_classes
        FROM users u
        LEFT JOIN enrollments e ON u.id = e.user_id
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE u.is_active = 1
    `;

    let countQuery = `
        SELECT COUNT(DISTINCT u.id) as total 
        FROM users u 
        WHERE u.is_active = 1
    `;

    const params = [];
    let paramIndex = 1;

    if (search) {
        const clause = ` AND (u.name ILIKE $${paramIndex} OR u.register_no ILIKE $${paramIndex + 1})`;
        query += clause;
        countQuery += clause;
        params.push(`%${search}%`, `%${search}%`);
        paramIndex += 2;
    }

    query += ' GROUP BY u.id';

    if (sort === 'register_no') {
        query += ' ORDER BY u.register_no ASC';
    } else if (sort === 'name') {
        query += ' ORDER BY u.name ASC';
    } else {
        query += ' ORDER BY u.created_at DESC';
    }

    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

    const dataParams = [...params, limit, offset];

    const { rows: data } = await pool.query(query, dataParams);
    const { rows: countResult } = await pool.query(countQuery, params);

    return {
        data,
        total: countResult.length > 0 ? parseInt(countResult[0].total, 10) : 0
    };
};

const deleteUser = async (id) => {
    await pool.query('DELETE FROM enrollments WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM attendance WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
};

module.exports = {
    registerUser,
    getAllUsers,
    deleteUser
};