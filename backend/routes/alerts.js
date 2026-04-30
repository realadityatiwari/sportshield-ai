const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ─── GET /api/alerts ──────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const alerts = db.read('alerts');
        res.json({ success: true, data: alerts });
    } catch (err) {
        console.error('[alerts] GET / error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load alerts.' });
    }
});

// ─── POST /api/alerts ─────────────────────────────────────────
// Body: { status, confidence, platform, timestamp, matchedMediaId }
router.post('/', (req, res) => {
    try {
        const { status, confidence, platform, timestamp, matchedMediaId } = req.body;

        // Input validation
        if (!status || confidence === undefined || !platform) {
            return res.status(400).json({ success: false, error: 'status, confidence, and platform are required.' });
        }

        const alerts = db.read('alerts');

        // Prevent duplicate active alert for the same media
        if (matchedMediaId) {
            const existing = alerts.find(a => a.matchedMediaId === matchedMediaId && a.status === 'active');
            if (existing) {
                console.log(`[alerts] Duplicate suppressed for mediaId: ${matchedMediaId}`);
                return res.status(409).json({
                    success: false,
                    error: 'An active alert already exists for this media.',
                    data: { existingId: existing.id }
                });
            }
        }

        const newAlert = {
            id:             uuidv4(),
            status:         status || 'active',
            confidence:     parseFloat(confidence),
            platform,
            timestamp:      timestamp || new Date().toISOString(),
            matchedMediaId: matchedMediaId || null
        };

        alerts.push(newAlert);
        if (alerts.length > 50) alerts.shift(); // keep max 50

        db.write('alerts', alerts);
        console.log(`[alerts] New alert created: ${newAlert.id} | platform: ${platform}`);
        res.status(201).json({ success: true, data: newAlert });

    } catch (err) {
        console.error('[alerts] POST / error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create alert.' });
    }
});

// ─── PATCH /api/alerts/:id/resolve ───────────────────────────
router.patch('/:id/resolve', (req, res) => {
    try {
        const alerts = db.read('alerts');
        const idx = alerts.findIndex(a => a.id === req.params.id);

        if (idx === -1) {
            return res.status(404).json({ success: false, error: 'Alert not found.' });
        }

        alerts[idx].status = 'resolved';
        db.write('alerts', alerts);
        console.log(`[alerts] Resolved: ${req.params.id}`);
        res.json({ success: true, data: alerts[idx] });

    } catch (err) {
        console.error('[alerts] PATCH resolve error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to resolve alert.' });
    }
});

module.exports = router;
