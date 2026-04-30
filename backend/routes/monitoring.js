const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ─── GET /api/monitoring ──────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const monitoring = db.read('monitoring');
        res.json({ success: true, data: monitoring });
    } catch (err) {
        console.error('[monitoring] GET / error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load monitoring log.' });
    }
});

// ─── POST /api/monitoring ─────────────────────────────────────
// Body: { status, confidence, platform, timestamp, matchedMediaId }
router.post('/', (req, res) => {
    try {
        const { status, confidence, platform, timestamp, matchedMediaId } = req.body;

        // Input validation
        if (!status || confidence === undefined || !platform) {
            return res.status(400).json({ success: false, error: 'status, confidence, and platform are required.' });
        }

        const monitoring = db.read('monitoring');

        const newEntry = {
            id:             uuidv4(),
            status,
            confidence:     parseFloat(confidence),
            platform,
            timestamp:      timestamp || new Date().toISOString(),
            matchedMediaId: matchedMediaId || null
        };

        monitoring.push(newEntry);
        if (monitoring.length > 50) monitoring.shift(); // keep max 50

        db.write('monitoring', monitoring);
        console.log(`[monitoring] Entry added: ${newEntry.id} | ${status} | ${platform}`);
        res.status(201).json({ success: true, data: newEntry });

    } catch (err) {
        console.error('[monitoring] POST / error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to save monitoring entry.' });
    }
});

// ─── POST /api/monitoring/simulate ────────────────────────────
// Replaces random generation with deterministic dataset-driven monitoring
router.post('/simulate', (req, res) => {
    try {
        const datasetPath = require('path').join(__dirname, '../data/dataset.json');
        if (!require('fs').existsSync(datasetPath)) {
            return res.status(404).json({ success: false, error: 'Dataset not found.' });
        }
        
        const dataset = JSON.parse(require('fs').readFileSync(datasetPath, 'utf-8'));
        const monitoring = db.read('monitoring');
        const platforms = ["Social Media", "Streaming Platform", "News Website"];
        const newEntries = [];

        dataset.variations.forEach((variation, index) => {
            let similarity = 0;
            
            // Deterministic logic based on index and type bounds
            if (variation.type === 'resized') {
                similarity = 90 + (index % 5) + 0.5; // e.g. 90.5, 91.5
            } else if (variation.type === 'compressed') {
                similarity = 85 + (index % 7) + 0.2; // e.g. 85.2, 86.2
            } else if (variation.type === 'cropped') {
                similarity = 70 + (index % 15) + 0.8; // e.g. 70.8, 71.8
            } else {
                similarity = 85 + (index % 10) + 0.1;
            }

            const status = similarity >= 85 ? 'unauthorized' : 'original';
            const platform = platforms[index % platforms.length];

            const newEntry = {
                id: uuidv4(),
                variationId: variation.id,
                sourceId: variation.sourceId,
                status: status,
                confidence: parseFloat(similarity.toFixed(2)),
                platform: platform,
                timestamp: new Date().toISOString()
            };

            monitoring.push(newEntry);
            newEntries.push(newEntry);
        });

        // Enforce max 50 entries limit
        while (monitoring.length > 50) {
            monitoring.shift();
        }

        db.write('monitoring', monitoring);
        console.log(`[monitoring] Generated ${newEntries.length} dataset-driven entries.`);
        res.status(201).json({ success: true, data: newEntries });

    } catch (err) {
        console.error('[monitoring] POST /simulate error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to run dataset simulation.' });
    }
});

module.exports = router;
