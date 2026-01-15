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
// Note: 'image' is the field name for the uploaded file
router.post('/register', upload.array('images', 3), parseFormData, validate(registerSchema), async (req, res) => {
    // req.body contains text fields
    const { name, matric_no, level, department, course, section, classIds } = req.body;
    let { descriptor, photo } = req.body;

    // Check for multiple files
    if (req.files && req.files.length > 0) {
        try {
            console.log(`Processing images for user ${matric_no}...`);
            const descriptors = [];
            for (const file of req.files) {
                const embedding = await faceService.generateEmbedding(file.buffer);
                descriptors.push(embedding);
            }
            descriptor = descriptors; // Pass array of embeddings

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
