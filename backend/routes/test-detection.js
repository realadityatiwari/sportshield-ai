const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Helper to generate a random number between min and max (inclusive) with 2 decimals
function getRandomSimilarity(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// ─── POST /api/test-detection ────────────────────────────────
// Reads dataset and runs a controlled detection simulation
router.post('/', (req, res) => {
    try {
        const datasetPath = path.join(__dirname, '../data/dataset.json');
        
        if (!fs.existsSync(datasetPath)) {
            return res.status(404).json({ success: false, error: 'Dataset not found.' });
        }

        const rawData = fs.readFileSync(datasetPath, 'utf-8');
        const dataset = JSON.parse(rawData);

        const results = dataset.variations.map(variation => {
            // Find corresponding original
            const original = dataset.originals.find(o => o.id === variation.sourceId);
            
            // If the original exists, we simulate detection
            let similarity = 0;

            if (variation.type === 'resized') {
                similarity = getRandomSimilarity(90, 95);
            } else if (variation.type === 'compressed') {
                similarity = getRandomSimilarity(85, 92);
            } else if (variation.type === 'cropped') {
                similarity = getRandomSimilarity(70, 85);
            } else {
                // Default fallback for any other types like "watermarked"
                similarity = getRandomSimilarity(85, 95);
            }

            const status = similarity >= 85 ? 'unauthorized' : 'original';

            return {
                variationId: variation.id,
                sourceId: variation.sourceId,
                type: variation.type,
                similarity: similarity,
                status: status
            };
        });

        console.log(`[test-detection] Ran controlled detection on ${results.length} variations.`);
        res.json({ success: true, data: results });

    } catch (err) {
        console.error('[test-detection] POST / error:', err.message);
        res.status(500).json({ success: false, error: 'Test detection failed.' });
    }
});

module.exports = router;
