const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// Middleware: parse bodies
// ─────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────
// Middleware: request logger
// Prints every request method + path + timestamp to the console
// ─────────────────────────────────────────
app.use((req, res, next) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${req.method} ${req.path}`);
    next();
});

// ─────────────────────────────────────────
// Serve frontend static files from project root
// ─────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR, {
    index: 'index.html',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ─────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────
app.use('/api/media',           require('./routes/media'));
app.use('/api/check',           require('./routes/check'));
app.use('/api/alerts',          require('./routes/alerts'));
app.use('/api/monitoring',      require('./routes/monitoring'));
app.use('/api/dataset',         require('./routes/dataset'));
app.use('/api/test-detection',  require('./routes/test-detection'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', message: 'SportShield AI backend is running.' } });
});

// ─────────────────────────────────────────
// Global error handler
// Catches any error thrown with next(err) in routes
// ─────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
});

// Catch-all: serve index.html for non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ─────────────────────────────────────────
// Start server
// ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n✅ SportShield AI backend running at http://localhost:${PORT}`);
    console.log(`   Frontend: http://localhost:${PORT}`);
    console.log(`   API:      http://localhost:${PORT}/api/health\n`);
});
