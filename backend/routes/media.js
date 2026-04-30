const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ─── GET /api/media ───────────────────────────────────────────
// Returns all registered media entries
router.get('/', (req, res) => {
    try {
        const media = db.read('media');
        res.json({ success: true, data: media });
    } catch (err) {
        console.error('[media] GET / error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load media.' });
    }
});

// ─── POST /api/media/register ─────────────────────────────────
// Body: { name, phash, type }
router.post('/register', (req, res) => {
    try {
        const { name, phash, type } = req.body;

        // Input validation
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ success: false, error: 'name is required.' });
        }
        if (!phash) {
            return res.status(400).json({ success: false, error: 'phash is required.' });
        }
        if (phash.length !== 64 || !/^[01]+$/.test(phash)) {
            return res.status(400).json({ success: false, error: 'phash must be a 64-character binary string.' });
        }

        const media = db.read('media');

        // Block duplicate pHash
        const duplicate = media.find(m => m.phash === phash);
        if (duplicate) {
            console.log(`[media] Duplicate registration blocked: ${name}`);
            return res.status(409).json({
                success: false,
                error: 'Duplicate detected: this media is already registered.',
                data: { existingId: duplicate.id }
            });
        }

        // Enforce 20-entry cap
        if (media.length >= 20) {
            return res.status(429).json({ success: false, error: 'Storage limit reached. Maximum 20 media entries allowed.' });
        }

        const newEntry = {
            id:         uuidv4(),
            name:       name.trim(),
            phash,
            type:       type || 'image',
            uploadedAt: new Date().toISOString()
        };

        media.push(newEntry);
        db.write('media', media);

        console.log(`[media] Registered: ${newEntry.name} (${newEntry.id})`);
        res.status(201).json({ success: true, data: newEntry });

    } catch (err) {
        console.error('[media] POST /register error:', err.message);
        res.status(500).json({ success: false, error: 'Registration failed.' });
    }
});

module.exports = router;
