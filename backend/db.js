const fs = require('fs');
const path = require('path');

// Where all JSON data files live
const DATA_DIR = path.join(__dirname, 'data');

// Make sure the data directory exists on first run
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper: get the file path for a given collection name
function filePath(collection) {
    return path.join(DATA_DIR, `${collection}.json`);
}

// Read a collection from disk. Returns [] if file doesn't exist yet.
function read(collection) {
    const fp = filePath(collection);
    if (!fs.existsSync(fp)) return [];
    try {
        const raw = fs.readFileSync(fp, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`[db] Could not parse ${collection}.json — returning empty array.`);
        return [];
    }
}

// Write an array back to disk for a given collection
function write(collection, data) {
    try {
        fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error(`[db] Failed to write ${collection}.json:`, e.message);
    }
}

module.exports = { read, write };
