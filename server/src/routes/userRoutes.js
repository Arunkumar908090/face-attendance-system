const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const validate = require('../middleware/validate');
const { registerSchema } = require('../validations/userSchema');
const multer = require('multer');
const faceService = require('../services/faceService');

// Configure Multer (Memory Storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware to parse JSON fields from FormData
const parseFormData = (req, res, next) => {
    if (req.body.classIds && typeof req.body.classIds === 'string') {
        try {
            req.body.classIds = JSON.parse(req.body.classIds);
        } catch (e) {
            req.body.classIds = [];
        }
    }
    next();
};

// Register a new user
router.post('/register', upload.any(), parseFormData, validate(registerSchema), async (req, res) => {
    console.log(`[UserRoute] Headers:`, req.headers['content-type']);
    console.log(`[UserRoute] Body Keys:`, Object.keys(req.body));
    console.log(`[UserRoute] Files:`, req.files ? req.files.map(f => `${f.fieldname} (${f.mimetype})`) : 'none');

    // Collect all uploaded images regardless of field name
    const images = req.files ? req.files.filter(f => f.mimetype.startsWith('image/')) : [];
    console.log(`[UserRoute] Found ${images.length} candidate images.`);

    // req.body contains text fields
    const { name, matric_no, level, department, course, section, classIds } = req.body;
    let { descriptor, photo } = req.body;

    // Check for multiple files
    if (images.length > 0) {
        try {
            console.log(`Processing ${images.length} images for user ${matric_no} in parallel...`);
            // Parallelize embedding generation
            descriptor = await Promise.all(images.map(file => faceService.generateEmbedding(file.buffer)));

            // Set photo to something indicating files were provided
            if (!photo) photo = "server_processed_image";
        } catch (error) {
            console.error("Embedding Error:", error);
            return res.status(400).json({ success: false, error: error.message });
        }
    } else if (req.file) {
        // Fallback or error if single file field used incorrectly
        return res.status(400).json({ success: false, error: 'Please upload images using "images" field' });
    }

    // fallback if no image/descriptor
    if (!descriptor && !photo) {
        return res.status(400).json({ success: false, error: 'Biometric data required' });
    }

    try {
        const result = userService.registerUser({
            name, matric_no, level, department, course,
            descriptor,
            section,
            classIds: classIds ? (Array.isArray(classIds) ? classIds : JSON.parse(classIds)) : []
        });
        res.json({ success: true, userId: result.userId, created: result.created });
    } catch (err) {
        console.error("Registration error:", err);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'User already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Get all users
router.get('/', (req, res) => {
    try {
        const { search, sort } = req.query;
        const users = userService.getAllUsers(search, sort);
        const usersWithDescriptors = users.map(u => ({
            ...u,
            descriptor: JSON.parse(u.descriptor)
        }));
        res.json(usersWithDescriptors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user
router.delete('/:id', (req, res) => {
    try {
        userService.deleteUser(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
