const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// ─── GET /api/dataset ─────────────────────────────────────────
// Returns the dataset structure (originals and variations)
router.get('/', (req, res) => {
    try {
        const datasetPath = path.join(__dirname, '../data/dataset.json');
        let dataset = { originals: [], variations: [] };
        
        if (fs.existsSync(datasetPath)) {
            const rawData = fs.readFileSync(datasetPath, 'utf-8');
            dataset = JSON.parse(rawData);
        }

        res.json({ success: true, data: dataset });
    } catch (err) {
        console.error('[dataset] GET / error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load dataset.' });
    }
});

module.exports = router;
