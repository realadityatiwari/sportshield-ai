const express = require('express');
const router  = express.Router();
const db = require('../db');

const MATCH_THRESHOLD = 85; // Must match frontend MATCH_THRESHOLD constant

// Hamming distance — identical logic to frontend script.js
// Returns similarity as a percentage (0–100)
function hammingDistance(hash1, hash2) {
    if (!hash1 || !hash2 || hash1.length !== 64 || hash2.length !== 64) {
        return 0;
    }
    let diff = 0;
    for (let i = 0; i < 64; i++) {
        if (hash1[i] !== hash2[i]) diff++;
    }
    return ((64 - diff) / 64) * 100;
}

// ─── POST /api/check ──────────────────────────────────────────
// Body: { phash }
// Runs Hamming distance against all registered media.
// Returns best match with similarity%, status, matchedMediaId.
router.post('/', (req, res) => {
    try {
        const { phash } = req.body;

        // Input validation
        if (!phash) {
            return res.status(400).json({ success: false, error: 'phash is required.' });
        }
        if (phash.length !== 64 || !/^[01]+$/.test(phash)) {
            return res.status(400).json({ success: false, error: 'phash must be a 64-character binary string.' });
        }

        const media = db.read('media');

        // Empty database case
        if (media.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No registered media found. Please register media first.',
                data: { similarity: 0, status: 'no_media', matchedMediaId: null, matchedName: null }
            });
        }

        // Run Hamming distance comparison
        let maxSimilarity = 0;
        let matchedMediaId = null;
        let matchedName    = null;

        for (const item of media) {
            if (!item.phash) continue;

            const similarity = hammingDistance(phash, item.phash);

            // Always track the best (highest) match — never exit early
            if (similarity > maxSimilarity) {
                maxSimilarity  = similarity;
                matchedMediaId = item.id;
                matchedName    = item.name;
            }
        }

        const status = maxSimilarity >= MATCH_THRESHOLD ? 'unauthorized' : 'original';

        console.log(`[check] Result: ${status} | similarity: ${maxSimilarity.toFixed(2)}% | matched: ${matchedName || 'none'}`);

        res.json({
            success: true,
            data: {
                similarity:      parseFloat(maxSimilarity.toFixed(2)),
                status,
                matchedMediaId:  status === 'unauthorized' ? matchedMediaId : null,
                matchedName:     status === 'unauthorized' ? matchedName    : null,
                threshold:       MATCH_THRESHOLD
            }
        });

    } catch (err) {
        console.error('[check] POST / error:', err.message);
        res.status(500).json({ success: false, error: 'Check failed.' });
    }
});

module.exports = router;
