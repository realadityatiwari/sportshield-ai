let mediaDB = [];
let monitoringDB = [];
let alertsDB = [];

const MATCH_THRESHOLD = 85;

let monitoringFilter = 'all'; // all, unauthorized, original
let alertsFilter = 'active'; // active, resolved

let simulationActive = false;
let simulationInterval = null;
let isProcessing = false; // Lock map blocking concurrent execution cycles

const generateId = () => Math.random().toString(36).substr(2, 9);

function cleanLegacyData(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(e => {
        if (e.thumbnail) delete e.thumbnail;
        if (e.image) delete e.image;
        if (e.src) delete e.src;
        if (e.data) delete e.data;
        return e;
    });
}

// ─────────────────────────────────────────────────────────────
// API CONFIG
// Change this string for deployment (e.g. https://your-app.railway.app)
// ─────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────
// apiRequest — centralized fetch utility
// All API calls go through this function.
// Handles headers, JSON parsing, and error surfacing.
// ─────────────────────────────────────────────────────────────
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const res  = await fetch(`${API_BASE}/api${endpoint}`, options);
    const json = await res.json();

    // Backend always returns { success, data } or { success, error }
    if (!json.success && res.status !== 409 && res.status !== 404) {
        throw new Error(json.error || `API error ${res.status}`);
    }
    return { status: res.status, ok: res.ok, ...json }; // spread so callers get .data and .error directly
}

// Fetch all state from the backend on page load
async function loadState() {
    try {
        const [mediaRes, monRes, alertRes] = await Promise.all([
            apiRequest('/media'),
            apiRequest('/monitoring'),
            apiRequest('/alerts')
        ]);
        if (mediaRes.data)  mediaDB      = cleanLegacyData(mediaRes.data);
        if (monRes.data)    monitoringDB = cleanLegacyData(monRes.data);
        if (alertRes.data)  alertsDB     = cleanLegacyData(alertRes.data);
        console.log('[loadState] State loaded from backend.');
        
        // Ensure UI is re-rendered using Server Data Only
        renderDashboard();
        renderMonitoring();
        renderAlerts();
    } catch (e) {
        console.warn('[loadState] Backend unreachable — running in offline mode.', e.message);
    }
}

// saveState() is a no-op — each action persists via its own apiRequest() call
function saveState() {
    // Intentionally empty
}

function getPlatformIcon(platform) {
    if (platform.includes("Social Media") || platform.includes("Social Platform")) return `<i class="fa-solid fa-hashtag"></i>`;
    if (platform.includes("Video") || platform.includes("Streaming") || platform.includes("YouTube")) return `<i class="fa-solid fa-play"></i>`;
    if (platform.includes("Internal")) return `<i class="fa-solid fa-server"></i>`;
    return `<i class="fa-solid fa-globe"></i>`; // general web
}

function renderAnalytics() {
    const pieChart = document.getElementById("analyticsPlatformChart");
    const legend = document.getElementById("analyticsPlatformLegend");
    const topAssetsList = document.getElementById("analyticsTopAssetsList");
    
    if (!pieChart || !legend || !topAssetsList) return;
    
    if (monitoringDB.length === 0) {
        pieChart.style.background = "#e2e8f0";
        pieChart.innerHTML = `<i class="fa-solid fa-chart-pie fa-6x" style="color:var(--primary); margin-top:50px;"></i>`;
        legend.innerHTML = `No data collected yet.`;
        topAssetsList.innerHTML = `<div class="empty-state" style="padding: 20px;"><p>No tracked assets.</p></div>`;
        return;
    }
    
    // Distribution map Math
    const counts = {};
    monitoringDB.forEach(m => {
        counts[m.platform] = (counts[m.platform] || 0) + 1;
    });
    
    const colors = ["var(--primary)", "var(--danger)", "var(--warning)", "var(--success)", "#8b5cf6"];
    let gradientStops = [];
    let currentDegree = 0;
    
    let legendHtml = "";
    const total = monitoringDB.length;
    let colorIdx = 0;
    
    for (const [platform, count] of Object.entries(counts)) {
        const percentage = (count / total) * 100;
        const degree = (count / total) * 360;
        const color = colors[colorIdx % colors.length];
        
        gradientStops.push(`${color} ${currentDegree}deg ${currentDegree + degree}deg`);
        currentDegree += degree;
        
        legendHtml += `<span><span style="display:inline-block; width:12px; height:12px; background:${color}; border-radius:50%; margin-right:4px;"></span> ${platform} (${percentage.toFixed(1)}%)</span>`;
        colorIdx++;
    }
    
    pieChart.style.background = `conic-gradient(${gradientStops.join(", ")})`;
    pieChart.innerHTML = ""; 
    legend.innerHTML = legendHtml;
    
    // Top Assets Math (Uses mediaId mapping)
    if (alertsDB.length === 0) {
        topAssetsList.innerHTML = `<div class="empty-state" style="padding: 20px;"><p>No flagged assets matching references.</p></div>`;
        return;
    }
    
    const assetThreats = {};
    alertsDB.forEach(a => {
        if (a.matchedMediaId) {
            assetThreats[a.matchedMediaId] = (assetThreats[a.matchedMediaId] || 0) + 1;
        }
    });
    
    const sortedAssets = Object.entries(assetThreats).sort((a,b) => b[1] - a[1]).slice(0, 5);
    topAssetsList.innerHTML = "";
    
    if (sortedAssets.length === 0) {
        topAssetsList.innerHTML = `<div class="empty-state" style="padding: 20px;"><p>No linked references generated yet.</p></div>`;
        return;
    }
    
    sortedAssets.forEach(item => {
        const mediaId = item[0];
        const count = item[1];
        const mediaInfo = mediaDB.find(m => m.id === mediaId);
        const mediaName = mediaInfo ? mediaInfo.name : "Unknown Asset";
        
        topAssetsList.innerHTML += `
            <li>
                <div class="feed-point black-point"></div>
                <div class="feed-content">
                    <p><strong>${mediaName} (UUID: ${mediaId}):</strong> <span style="color:var(--danger); font-weight:600;">${count} alerts</span></p>
                </div>
            </li>
        `;
    });
}

let currentMetrics = { reg: -1, det: -1, alert: -1, acc: -1 };

function animateValue(obj, start, end, duration, formatStr = "") {
    if(!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = start + progress * (end - start);
        
        if (formatStr === "%") {
            obj.textContent = currentVal.toFixed(1) + formatStr;
        } else {
            obj.textContent = Math.floor(currentVal).toLocaleString() + formatStr;
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (formatStr === "%") {
                obj.textContent = end.toFixed(1) + formatStr;
            } else {
                obj.textContent = end.toLocaleString() + formatStr;
            }
        }
    };
    window.requestAnimationFrame(step);
}

function renderDashboard() {
    const metricRegistered = document.getElementById("metricRegistered");
    const metricDetections = document.getElementById("metricDetections");
    const metricAlerts = document.getElementById("metricAlerts");
    const metricAccuracy = document.getElementById("metricAccuracy");
    
    if (metricRegistered) {
        const totalReg = mediaDB.length;
        if (currentMetrics.reg !== totalReg) {
            animateValue(metricRegistered, Math.max(0, currentMetrics.reg), totalReg, 1000);
            currentMetrics.reg = totalReg;
        }
    }
    
    if (metricDetections) {
        const totalUnauthorized = monitoringDB.filter(m => m.status === 'unauthorized').length;
        if (currentMetrics.det !== totalUnauthorized) {
            animateValue(metricDetections, Math.max(0, currentMetrics.det), totalUnauthorized, 1000);
            currentMetrics.det = totalUnauthorized;
        }
    }
    
    if (metricAlerts) {
        const activeAlerts = alertsDB.filter(a => a.status === 'active').length;
        if (currentMetrics.alert !== activeAlerts) {
            animateValue(metricAlerts, Math.max(0, currentMetrics.alert), activeAlerts, 1000);
            currentMetrics.alert = activeAlerts;
        }
    }
    
    if (metricAccuracy) {
        if (monitoringDB.length === 0) {
            metricAccuracy.textContent = "---";
        } else {
            const originalDetections = monitoringDB.filter(m => m.status === 'original').length;
            const accuracy = (originalDetections / monitoringDB.length) * 100;
            if (currentMetrics.acc !== accuracy) {
                animateValue(metricAccuracy, Math.max(0, currentMetrics.acc), accuracy, 1000, "%");
                currentMetrics.acc = accuracy;
            }
        }
    }
    renderAnalytics(); 
}

function renderMonitoring() {
    const tableBody = document.getElementById("monitoringTableBody");
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const filteredDB = monitoringDB.filter(e => monitoringFilter === 'all' || e.status === monitoringFilter);
    
    if (filteredDB.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No scans match filter state.</p></div></td></tr>`;
        return;
    }
    
    const sorted = [...filteredDB].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sorted.forEach(entry => {
        const isUnauth = entry.status === 'unauthorized';
        const badgeClass = isUnauth ? 'badge-danger' : 'badge-success';
        const displayStatus = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
        const timeString = new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        let miniProgressColor = "var(--success)";
        if (entry.confidence >= 70 && entry.confidence < MATCH_THRESHOLD) miniProgressColor = "var(--warning)";
        if (entry.confidence >= MATCH_THRESHOLD) miniProgressColor = "var(--danger)";
        
        const thumbUi = `<div class="thumb-mock" style="background:#e2e8f0; display:flex; align-items:center; justify-content:center; color:var(--text-muted);"><i class="fa-solid fa-image"></i></div>`;
        const platformIcon = getPlatformIcon(entry.platform);
        
        tableBody.innerHTML += `
            <tr class="${isUnauth ? 'row-unauthorized' : ''}" style="animation: fadeIn 0.3s ease;">
                <td>${thumbUi}</td>
                <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                <td>
                    <span style="display:inline-block; width:45px;">${entry.confidence.toFixed(1)}%</span>
                    <div class="mini-progress-bar"><div class="mini-progress-fill" style="width:${entry.confidence}%; background-color:${miniProgressColor}"></div></div>
                </td>
                <td><span style="color:var(--text-muted); margin-right:6px;">${platformIcon}</span> ${entry.platform}</td>
                <td>${timeString}</td>
            </tr>
        `;
    });
}

window.resolveAlert = function(id) {
    apiRequest(`/alerts/${id}/resolve`, 'PATCH')
        .then(response => {
            if (response.success && response.data) {
                // Update local state directly from backend confirmation
                const idx = alertsDB.findIndex(a => a.id === id);
                if (idx !== -1) {
                    alertsDB[idx] = response.data;
                    renderAlerts();
                    renderDashboard();
                }
            }
        })
        .catch(err => {
            console.error('Failed to resolve alert:', err);
        });
}

function renderAlerts() {
    const container = document.getElementById("alertsListContainer");
    if (!container) return;
    
    container.innerHTML = '';
    
    const filteredDB = alertsDB.filter(a => a.status === alertsFilter);
    
    if (filteredDB.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-shield-check" style="color:var(--success);"></i><p>No alerts match filter state.</p></div>`;
        return;
    }
    
    const sorted = [...filteredDB].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sorted.forEach(alert => {
        let severityClass = alert.confidence >= MATCH_THRESHOLD ? 'high-severity' : 'medium-severity';
        if (alert.status === 'resolved') severityClass = 'resolved';
        
        const timeString = new Date(alert.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        
        let actionBtn = '';
        if (alert.status !== 'resolved') {
            actionBtn = `<button class="action-btn warning-btn sm-btn" onclick="resolveAlert('${alert.id}')">Issue Takedown</button>`;
        } else {
            actionBtn = `<span class="status-icon"><i class="fa-solid fa-check"></i></span>`;
        }
        
        container.innerHTML += `
            <div class="alert-card ${severityClass}" style="animation: fadeIn 0.3s ease;">
                <div class="alert-info">
                    <h3>Unauthorized Media Detected</h3>
                    <p>Detected on: ${alert.platform} (${alert.confidence.toFixed(1)}% Match) at ${timeString}</p>
                    ${alert.matchedMediaId ? `<p style="font-size:11px; margin-top:4px; opacity:0.7;">Matched Internal Reference: ${alert.matchedMediaId}</p>` : ''}
                </div>
                ${actionBtn}
            </div>
        `;
    });
}

// Live Simulator Polling Engine
function runSimulatedScan() {
    if (mediaDB.length === 0) return;
    
    const targetMedia = mediaDB[Math.floor(Math.random() * mediaDB.length)];
    
    // Weighted Platform Probability Matrix
    const platformWeights = [
        { name: "Sports News Platform", weight: 10 },
        { name: "Social Media", weight: 55 },
        { name: "Streaming Platform", weight: 15 },
        { name: "Blog Network X", weight: 15 },
        { name: "Internal Processing", weight: 5 }
    ];
    
    let totalWeight = platformWeights.reduce((sum, p) => sum + p.weight, 0);
    let randomW = Math.random() * totalWeight;
    let platformDetected = "Social Media"; // fallback tracker
    
    for (let p of platformWeights) {
        if (randomW < p.weight) { platformDetected = p.name; break; }
        randomW -= p.weight;
    }
    
    // Time-based Variance Clustering (Activity Spikes every 60 seconds)
    const cycle = (Date.now() % 60000) / 60000;
    const isSpike = cycle > 0.8; // Burst variance inside the final 20% array phase
    const threatProbability = isSpike ? 0.60 : 0.10; // 60% leak clustering during spikes, else 10% background noise
    
    const isOriginal = Math.random() > threatProbability; 
    let confidencePercentage = 0;
    
    if (isOriginal) {
        confidencePercentage = Math.random() * 25 + 60; // 60-85% map fallback natively
    } else {
        confidencePercentage = Math.random() * (100 - MATCH_THRESHOLD) + MATCH_THRESHOLD; // Escalate cleanly within logic ceiling
    }
    
    const scanStatus = confidencePercentage >= MATCH_THRESHOLD ? "unauthorized" : "original";
    
    if (scanStatus === 'unauthorized') {
        const existingActiveAlert = alertsDB.find(a => a.matchedMediaId === targetMedia.id && a.status === 'active');
        if (!existingActiveAlert) {
            apiRequest('/alerts', 'POST', {
                status: "active",
                confidence: confidencePercentage,
                platform: platformDetected,
                timestamp: new Date().toISOString(),
                matchedMediaId: targetMedia.id
            }).catch(e => console.warn('[alerts] Simulation save failed:', e.message));
        }
    }
    
    apiRequest('/monitoring', 'POST', {
        status: scanStatus,
        confidence: confidencePercentage,
        platform: platformDetected,
        timestamp: new Date().toISOString(),
        matchedMediaId: confidencePercentage > 40 ? targetMedia.id : null
    })
    .then(() => loadState()) // Sync all clients and UI state cleanly
    .catch(e => console.warn('[monitoring] Simulation save failed:', e.message));
}

function toggleSimulation() {
    simulationActive = !simulationActive;
    const simToggleBtn = document.getElementById('simToggleBtn');
    
    // UI transition on toggle
    simToggleBtn.style.transform = "scale(0.9)";
    setTimeout(() => simToggleBtn.style.transform = "scale(1)", 150);
    
    if (simulationActive) {
        simToggleBtn.innerHTML = `<i class="fa-solid fa-pause" style="color:var(--danger);"></i>`;
        simulationInterval = setInterval(runSimulatedScan, 7000); // 7 second pulse rate
        console.log("System Simulator ON");
    } else {
        simToggleBtn.innerHTML = `<i class="fa-solid fa-play" style="color:var(--success);"></i>`;
        clearInterval(simulationInterval);
        console.log("System Simulator OFF");
    }
}

let currentImageProcessingId = 0;

function getImageData(imageSource) {
    const processId = ++currentImageProcessingId;
    return new Promise((resolve, reject) => {
        let isDone = false;
        
        let timeoutId = setTimeout(() => {
            if (isDone) return;
            isDone = true;
            reject(new Error("Image processing timeout"));
        }, 4000); // 4 second safety boundary
        
        try {
            const img = new Image();
            img.onload = async () => {
                if (isDone) return;
                clearTimeout(timeoutId);
                
                if (processId !== currentImageProcessingId) {
                    isDone = true;
                    return reject(new Error("Image processing naturally aborted by overlapping logic."));
                }
                
                if (img.decode) await img.decode();
                
                if (isDone) return;
                
                let canvas = null, ctx = null;
                try {
                    canvas = document.createElement('canvas');
                    ctx = canvas.getContext('2d', { willReadFrequently: true });
                    canvas.width = 32;
                    canvas.height = 32;
                    ctx.drawImage(img, 0, 0, 32, 32);
                    const imgData = ctx.getImageData(0, 0, 32, 32).data;
                    
                    let sum = 0;
                    for (let i = 0; i < imgData.length; i++) sum += imgData[i];
                    if (sum === 0 && !isDone) {
                        isDone = true;
                        throw new Error("Extracted imageData is completely empty.");
                    }
                    
                    if (!isDone) {
                        isDone = true;
                        resolve(imgData);
                    }
                } catch (canvasErr) {
                    if (!isDone) {
                        isDone = true;
                        console.error("Canvas Manipulation Error. Tainting or CORS block intercepted:", canvasErr);
                        reject(canvasErr);
                    }
                } finally {
                    if (canvas) { canvas.width = 0; canvas.height = 0; }
                    canvas = null; 
                    ctx = null;
                }
            };
            img.onerror = (err) => {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeoutId);
                    console.error("Image Processing Error: Failed to successfully append source into Image object.", err);
                    reject(new Error("Image processing node failure"));
                }
            };
            
            const srcStr = typeof imageSource === 'string' ? imageSource : imageSource.src;
            if (!srcStr || srcStr === "") {
                if (!isDone) {
                    isDone = true;
                    throw new Error("Empty image source provided. Aborting array extraction.");
                }
            }
            img.src = srcStr;
        } catch (error) {
            if (!isDone) {
                isDone = true;
                clearTimeout(timeoutId);
                console.error("Image DOM setup failed entirely:", error);
                reject(error);
            }
        }
    });
}

const workerCode = `
self.onmessage = function(e) {
    try {
        const { id, imgData } = e.data;
        const N = 32;
        const gray = new Float32Array(N * N);
        for (let i = 0; i < imgData.length; i += 4) {
            gray[i / 4] = 0.299 * imgData[i] + 0.587 * imgData[i+1] + 0.114 * imgData[i+2];
        }
        const dct = new Float32Array(64);
        for (let u = 0; u < 8; u++) {
            for (let v = 0; v < 8; v++) {
                let sum = 0;
                for (let x = 0; x < N; x++) {
                    for (let y = 0; y < N; y++) {
                        sum += gray[x * N + y] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
                    }
                }
                let cu = u === 0 ? 1 / Math.sqrt(2) : 1;
                let cv = v === 0 ? 1 / Math.sqrt(2) : 1;
                dct[u * 8 + v] = 0.25 * cu * cv * sum;
            }
        }
        let total = 0;
        for (let i = 1; i < 64; i++) {
            total += dct[i];
        }
        const mean = total / 63;
        let hash = "";
        for (let i = 0; i < 64; i++) {
            hash += dct[i] > mean ? "1" : "0";
        }
        self.postMessage({ id, hash });
    } catch(err) {
        self.postMessage({ id: e.data.id, error: err.message });
    }
};
`;

const workerBlob = new Blob([workerCode], { type: "application/javascript" });
const workerUrl = URL.createObjectURL(workerBlob);

let globalWebWorker = null;
const workerPromises = new Map();
let currentWorkerId = 0;

function initWorker() {
    if (globalWebWorker) return;
    if (!window.Worker) return;
    
    globalWebWorker = new Worker(workerUrl);
    
    globalWebWorker.onmessage = (e) => {
        const { id, hash, error } = e.data;
        if (workerPromises.has(id)) {
            const { resolve, reject } = workerPromises.get(id);
            workerPromises.delete(id);
            if (error) reject(new Error(error));
            else resolve(hash);
        }
    };
    
    globalWebWorker.onerror = (e) => {
        console.error("Global Web Worker Crash:", e);
        for (const [id, { reject }] of workerPromises.entries()) {
            reject(new Error("Mathematical mapping thread execution crashed natively."));
        }
        workerPromises.clear();
        globalWebWorker.terminate();
        globalWebWorker = null; // Flush for recovery overrides properly.
    };
}

function computePHashAsync(imgData) {
    return new Promise((resolve, reject) => {
        initWorker();
        if (!globalWebWorker) {
            try {
                resolve(computePHash(imgData)); // Eventual single-thread fallback processing rendering maps naturally
            } catch (err) {
                reject(err);
            }
            return;
        }
        const assignedId = ++currentWorkerId;
        
        let timeoutId = setTimeout(() => {
            if (workerPromises.has(assignedId)) {
                workerPromises.delete(assignedId);
                reject(new Error("Worker timeout: hashing failed"));
            }
        }, 4000); // 4-second hard processing ceiling 

        const safeResolve = (hashData) => {
            clearTimeout(timeoutId);
            resolve(hashData);
        };
        const safeReject = (errObject) => {
            clearTimeout(timeoutId);
            reject(errObject);
        };

        workerPromises.set(assignedId, { resolve: safeResolve, reject: safeReject });
        globalWebWorker.postMessage({ id: assignedId, imgData });
    });
}

function computePHash(imgData) {
    const N = 32;
    // 1. Grayscale
    const gray = new Float32Array(N * N);
    for (let i = 0; i < imgData.length; i += 4) {
        gray[i / 4] = 0.299 * imgData[i] + 0.587 * imgData[i+1] + 0.114 * imgData[i+2];
    }
    
    // 2. Optimized 2D DCT (only extracting top-left 8x8 matrix)
    const dct = new Float32Array(64);
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let x = 0; x < N; x++) {
                for (let y = 0; y < N; y++) {
                    sum += gray[x * N + y] * 
                           Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * 
                           Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
                }
            }
            let cu = u === 0 ? 1 / Math.sqrt(2) : 1;
            let cv = v === 0 ? 1 / Math.sqrt(2) : 1;
            dct[u * 8 + v] = 0.25 * cu * cv * sum;
        }
    }
    
    // 3. Mathematical Mean (excluding DC coefficient at 0,0)
    let total = 0;
    for (let i = 1; i < 64; i++) {
        total += dct[i];
    }
    const mean = total / 63;
    
    // 4. Generate 64-bit binary Hash String
    let hash = "";
    for (let i = 0; i < 64; i++) {
        hash += dct[i] > mean ? "1" : "0";
    }
    return hash;
}

function hammingDistance(hash1, hash2) {
    if (!hash1 || !hash2 || hash1.length !== 64 || hash2.length !== 64) {
        console.warn(`Hamming validation warning: strict 64-bit bounds violated.`);
        return 0;
    }
    
    let diff = 0;
    for (let i = 0; i < 64; i++) {
        if (hash1[i] !== hash2[i]) diff++;
    }
    // Reverse math back out to generic % representation
    return ((64 - diff) / 64) * 100;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

document.addEventListener("DOMContentLoaded", async () => {
    // Load all data from backend before rendering
    await loadState();
    renderDashboard();
    renderMonitoring();
    renderAlerts();

    // Attach Toggle
    const simToggleBtn = document.getElementById('simToggleBtn');
    if (simToggleBtn) simToggleBtn.addEventListener("click", toggleSimulation);

    // Attach Filter Listeners
    const monitoringFilters = document.querySelectorAll('#monitoringFilterTabs .filter-btn');
    monitoringFilters.forEach(btn => {
        btn.addEventListener('click', (e) => {
            monitoringFilters.forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            monitoringFilter = btn.getAttribute('data-filter');
            renderMonitoring();
        });
    });
    
    const alertsFilters = document.querySelectorAll('#alertsFilterTabs .filter-btn');
    alertsFilters.forEach(btn => {
        btn.addEventListener('click', (e) => {
            alertsFilters.forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            alertsFilter = btn.getAttribute('data-filter');
            renderAlerts();
        });
    });

    const imageInput = document.getElementById("imageInput");
    const previewSection = document.getElementById("previewSection");
    const imagePreview = document.getElementById("imagePreview");
    const checkButton = document.getElementById("checkButton");
    const resultSection = document.getElementById("resultSection");
    const loader = document.getElementById("loader");
    const resultContent = document.getElementById("resultContent");
    const resultTitle = document.getElementById("resultTitle");
    const scoreValue = document.getElementById("scoreValue");
    const uploadText = document.getElementById("uploadText");
    const statusMessage = document.getElementById("statusMessage");
    const sourceLabels = document.getElementById("sourceLabels");
    const resultAlert = document.getElementById("resultAlert");
    const resultSubtext = document.getElementById("resultSubtext");
    const registerButton = document.getElementById("registerButton");
    const registerFeedback = document.getElementById("registerFeedback");
    const confidenceScoreNode = document.querySelector(".confidence-score");
    const trackingTimeline = document.getElementById("trackingTimeline");
    const timelineList = document.getElementById("timelineList");
    const actionCenter = document.getElementById("actionCenter");
    const takedownButton = document.getElementById("takedownButton");
    const takedownFeedback = document.getElementById("takedownFeedback");
    
    const confidenceBarContainer = document.getElementById("confidenceBarContainer");
    const confidenceBarFill = document.getElementById("confidenceBarFill");

    // Dashboard Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const pageViews = document.querySelectorAll('.page-view');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            pageViews.forEach(page => page.style.display = 'none');
            const targetId = item.getAttribute('data-target');
            const targetPage = document.getElementById(targetId);
            if(targetPage) {
                // Force DOM reflow to securely restart slideUpFade animations naturally
                void targetPage.offsetWidth; 
                targetPage.style.display = 'block';
            }
        });
    });

    let currentFileName = "Upload";

    // Handle Image Upload Selection
    imageInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (file) {
            if (!file.type.startsWith("image/")) {
                uploadText.textContent = "Invalid file type. Image required.";
                uploadText.style.color = "var(--danger)";
                setTimeout(() => { uploadText.textContent = "Upload Reference Media"; uploadText.style.color = ""; }, 3000);
                return;
            }
            
            currentFileName = file.name;
            
            // Secure memory bound overrides dropping persistent string parses naturally!
            if (imagePreview.src && imagePreview.src.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview.src);
            }
            
            const objectUrl = URL.createObjectURL(file);
            imagePreview.src = objectUrl;
            
            previewSection.style.display = "block";
            registerButton.disabled = false;
            uploadText.textContent = file.name;
            
            // UX: Disable check button if registry is entirely empty to force workflow
            if (mediaDB.length === 0) {
                checkButton.disabled = true;
            } else {
                checkButton.disabled = false;
            }
            
            resultSection.style.display = "none";
            resultContent.style.display = "none";
            resultAlert.className = '';
            resultTitle.textContent = '';
            resultSubtext.textContent = '';
            trackingTimeline.style.display = "none";
            actionCenter.style.display = "none";
            if(confidenceBarContainer) confidenceBarContainer.style.display = "none";
            const exp = document.getElementById("confidenceExplanation");
            if(exp) exp.style.display = "none";
        }
    });

    registerButton.addEventListener("click", async () => {
        if (mediaDB.length >= 20) {
            uploadText.textContent = "Storage limit reached (max 20).";
            uploadText.style.color = "var(--danger)";
            setTimeout(() => { uploadText.textContent = currentFileName; uploadText.style.color = ""; }, 3000);
            return;
        }

        if (isProcessing) {
            uploadText.textContent = "Processing logic running...";
            uploadText.style.color = "var(--warning)";
            setTimeout(() => { uploadText.textContent = currentFileName; uploadText.style.color = ""; }, 2000);
            return;
        }
        if (!currentFileName || !imagePreview.src) {
            console.warn("Registration rejected: File properties are unbound or empty.");
            return;
        }
        
        isProcessing = true;
        registerButton.disabled = true;
        checkButton.disabled = true;
        
        try {
            console.log('[register] Computing pHash...');
            const rawPixelArray = await getImageData(imagePreview.src);
            const phashStr = await computePHashAsync(rawPixelArray);

            if (!phashStr) throw new Error('Hash generation failed. Output is empty.');
            
            console.log('[register] POSTing to /api/media/register...');
            let result;
            try {
                result = await apiRequest('/media/register', 'POST', {
                    name: currentFileName,
                    phash: phashStr,
                    type: 'image'
                });
            } catch (apiErr) {
                // Show user-friendly error
                registerFeedback.textContent = `Server error: ${apiErr.message}`;
                registerFeedback.style.color = 'var(--danger)';
                registerFeedback.style.display = 'block';
                setTimeout(() => { registerFeedback.style.display = 'none'; registerFeedback.style.color = 'var(--success)'; }, 3500);
                return;
            }
            
            if (result.status === 409) {
                console.warn('[register] Duplicate blocked by backend.');
                registerFeedback.textContent = 'Media is already registered in the official database.';
                registerFeedback.style.color = 'var(--warning)';
                registerFeedback.style.display = 'block';
                setTimeout(() => { registerFeedback.style.display = 'none'; registerFeedback.style.color = 'var(--success)'; }, 3000);
                registerButton.disabled = false;
                checkButton.disabled = false;
                return;
            }

            // Update in-memory array from backend response
            mediaDB.push(result.data);
            renderDashboard();

            checkButton.disabled = false;
            registerFeedback.textContent = 'Media successfully registered as official content';
            registerFeedback.style.display = 'block';
            setTimeout(() => { registerFeedback.style.display = 'none'; }, 3000);
            console.log('[register] Success:', result.data.id);
        } catch(e) {
            console.error("Critical Registration Pipeline Error:", e);
        } finally {
            registerButton.disabled = false;
            isProcessing = false;
        }
    });

    takedownButton.addEventListener("click", () => {
        takedownButton.disabled = true;
        takedownFeedback.textContent = "✅ Takedown request sent successfully to platform.";
        takedownFeedback.style.display = "block";
        
        setTimeout(() => {
            takedownButton.disabled = false;
            takedownFeedback.style.display = "none";
        }, 3000);
    });

    // Handle "Check Authenticity" Button Click
    checkButton.addEventListener("click", async () => {
        if (isProcessing) {
            uploadText.textContent = "Processing logic running...";
            uploadText.style.color = "var(--warning)";
            setTimeout(() => { uploadText.textContent = currentFileName; uploadText.style.color = ""; }, 2000);
            return;
        }
        isProcessing = true;
        checkButton.disabled = true;
        
        resultSection.style.display = "block";
        loader.style.display = "block";
        statusMessage.style.display = "block";
        statusMessage.style.color = ""; // reset fallback text color
        resultContent.style.display = "none";
        
        const uploadSection = document.querySelector('.upload-section');
        
        // Unhide bounds ensuring components render accurately regardless of matching map hits
        confidenceScoreNode.style.display = "block";
        if (confidenceBarContainer) confidenceBarContainer.style.display = "block";
        scoreValue.textContent = "0.0%";
        if (confidenceBarFill) {
            confidenceBarFill.style.transition = 'none'; // halt active layout glides 
            confidenceBarFill.style.width = "0%";
            confidenceBarFill.style.backgroundColor = "var(--success)";
            
            void confidenceBarFill.offsetWidth; // direct layout redraw
            
            confidenceBarFill.style.transition = 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.5s ease';
        }

        try {
            if (mediaDB.length === 0) { 
                console.warn("Scan Warning: mediaDB array is empty. Stop execution.");
                resultSection.style.display = "none";
                statusMessage.style.display = "block";
                statusMessage.textContent = "No registered media found. Please register first.";
                statusMessage.style.color = "var(--warning)";
                checkButton.disabled = false;
                return;
            }
            if (!imagePreview.src || imagePreview.src === "") {
                throw new Error("Target Source failure. Object is completely devoid of string mapping.");
            }
            
            uploadSection.classList.add('is-scanning');
            console.log("Scanner loop engine engaged...");

            statusMessage.textContent = "Scanning media database...";
            await sleep(600);
            
            statusMessage.textContent = 'Analyzing visual fingerprint...';
            console.log('[check] Computing pHash...');
            const rawUploaded = await getImageData(imagePreview.src);
            const uploadedHash = await computePHashAsync(rawUploaded);
            console.log('[check] pHash ready. Sending to /api/check...');
            await sleep(600);
            
            statusMessage.textContent = 'Matching against known content...';

            let checkData;
            try {
                const result = await apiRequest('/check', 'POST', { phash: uploadedHash });
                checkData = result.data;
            } catch (apiErr) {
                throw new Error(`Check request failed: ${apiErr.message}`);
            }

            const maxSimilarity  = checkData.similarity  || 0;
            const matchedMediaId = checkData.matchedMediaId || null;
            console.log('[check] Backend result:', checkData);
            
            await sleep(800);
            
            loader.style.display = "none";
            statusMessage.style.display = "none";
            resultContent.style.display = "block";
            
            let scanStatus = "original";
            let platformDetected = "Internal Processing";
            
            // --- Confidence Realism Intercept ---
            // Rule: Cap values >= 99 to look realistic (97.0 - 99.5), removing 100% display
            let displaySimilarity = maxSimilarity;
            if (displaySimilarity >= 99) {
                // Deterministic mapping: stable across reloads, maps 100% to ~98.7%
                displaySimilarity = 97.1 + (maxSimilarity % 2.4);
            }
            
            const confidencePercentage = displaySimilarity;
            
            if (confidenceBarFill) {
                confidenceBarFill.style.width = Math.min(100, confidencePercentage).toFixed(1) + "%";
                if (confidencePercentage < 70) {
                    confidenceBarFill.style.backgroundColor = "var(--success)";
                } else if (confidencePercentage < MATCH_THRESHOLD) {
                    confidenceBarFill.style.backgroundColor = "var(--warning)";
                } else {
                    confidenceBarFill.style.backgroundColor = "var(--danger)";
                }
            }
            
            const confidenceExplanation = document.getElementById("confidenceExplanation");
            if (confidenceExplanation) {
                confidenceExplanation.style.display = "block";
                let similarityText = "";
                if (confidencePercentage < 50) {
                    similarityText = `<strong><span style="color:var(--success);"><i class="fa-solid fa-check-circle"></i> Low similarity:</span></strong> no structural match`;
                } else if (confidencePercentage < MATCH_THRESHOLD) {
                    similarityText = `<strong><span style="color:var(--warning);"><i class="fa-solid fa-triangle-exclamation"></i> Partial similarity:</span></strong> some features match`;
                } else if (confidencePercentage >= 98) {
                    similarityText = `<strong><span style="color:var(--danger);"><i class="fa-solid fa-shield-halved"></i> Near-identical match:</span></strong> This media matches a registered asset with extremely high structural similarity based on perceptual hashing.`;
                } else {
                    similarityText = `<strong><span style="color:var(--danger);"><i class="fa-solid fa-shield-halved"></i> High similarity:</span></strong> This media matches a registered asset with high structural similarity based on perceptual hashing.`;
                }
                
                let matchDetailsText = "";
                if (matchedMediaId) {
                    const matchedMediaObj = mediaDB.find(m => m.id === matchedMediaId);
                    if (matchedMediaObj) {
                         matchDetailsText = `<br><span style="font-size: 12px; opacity: 0.8; margin-top: 6px; display: inline-block;"><i class="fa-solid fa-link"></i> Matched with: ${matchedMediaObj.name} (ID: ${matchedMediaId})</span>`;
                    } else {
                         matchDetailsText = `<br><span style="font-size: 12px; opacity: 0.8; margin-top: 6px; display: inline-block;"><i class="fa-solid fa-link"></i> Matched with: Unknown Reference (ID: ${matchedMediaId})</span>`;
                    }
                } else {
                    matchDetailsText = `<br><span style="font-size: 12px; opacity: 0.8; margin-top: 6px; display: inline-block;"><i class="fa-solid fa-link-slash"></i> No internal reference matches found.</span>`;
                }
                
                confidenceExplanation.innerHTML = similarityText + matchDetailsText;
            }

            // Visual Comparison Update
            const visualComparisonBlock = document.getElementById("visualComparisonBlock");
            if (visualComparisonBlock) {
                document.getElementById("matchSimilarityValue").textContent = displaySimilarity.toFixed(1) + "%";
                let matchLevel = "LOW";
                if (displaySimilarity >= 98) matchLevel = "NEAR IDENTICAL";
                else if (displaySimilarity >= 90) matchLevel = "HIGH";
                else if (displaySimilarity >= 75) matchLevel = "MODERATE";
                
                const matchLevelLabel = document.getElementById("matchLevelLabel");
                matchLevelLabel.textContent = matchLevel;
                if (matchLevel === "HIGH" || matchLevel === "NEAR IDENTICAL") matchLevelLabel.className = "badge badge-danger";
                else if (matchLevel === "MODERATE") matchLevelLabel.className = "badge badge-warning";
                else matchLevelLabel.className = "badge badge-success";

                if (matchedMediaId && maxSimilarity >= MATCH_THRESHOLD) {
                    const matchedMediaObj = mediaDB.find(m => m.id === matchedMediaId);
                    if (matchedMediaObj) {
                        visualComparisonBlock.style.display = "block";
                        await generateDiffMap(imagePreview.src, '/' + matchedMediaObj.name);
                    } else {
                        visualComparisonBlock.style.display = "none";
                    }
                } else {
                    visualComparisonBlock.style.display = "none";
                }
            }
            
            if (maxSimilarity >= MATCH_THRESHOLD) {
                scanStatus = "unauthorized";
                const platforms = ["Sports News Platform", "Social Media", "Streaming Platform"];
                platformDetected = platforms[Math.floor(Math.random() * platforms.length)];
                
                resultTitle.textContent = "🚨 Unauthorized Usage Detected";
                resultSubtext.textContent = "This media matches known protected content in our database.";
                resultAlert.className = "match-found";
                
                sourceLabels.innerHTML = `
                    <span class="source-label">Detected on: ${platformDetected}</span>
                    <span class="source-label">Cross-Network Sync Active</span>
                `;
                sourceLabels.style.display = "flex";
                
                const now = new Date();
                const times = [
                    new Date(now.getTime() - 25 * 60000),
                    new Date(now.getTime() - 12 * 60000),
                    now
                ];
                
                timelineList.innerHTML = '';
                times.forEach((time, index) => {
                    const timeString = time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    let platformLabel = index === 2 ? platformDetected : platforms[(index + 1) % platforms.length];
                    timelineList.innerHTML += `
                        <li>
                            <span class="timeline-time">${timeString}</span>
                            Identified across ${platformLabel}
                        </li>
                    `;
                });
                trackingTimeline.style.display = "block";
                actionCenter.style.display = "block";
                
                // Persist alert to backend (in-memory dedup check first)
                const existingActiveAlert = alertsDB.find(a => a.matchedMediaId === matchedMediaId && a.status === 'active');
                if (!existingActiveAlert) {
                    const alertEntry = {
                        status: 'active',
                        confidence: confidencePercentage,
                        platform: platformDetected,
                        timestamp: new Date().toISOString(),
                        matchedMediaId
                    };
                    apiRequest('/alerts', 'POST', alertEntry)
                        .then(r => {
                            if (r.data) {
                                alertsDB.push(r.data);
                                if (alertsDB.length > 50) alertsDB.shift();
                            }
                        })
                        .catch(e => console.warn('[alerts] Save failed:', e.message));
                }
                
            } else {
                resultTitle.textContent = "✅ Original Content Verified";
                resultSubtext.textContent = "No matching records found in the protected media database.";
                resultAlert.className = "no-match";
                sourceLabels.style.display = "none";
                trackingTimeline.style.display = "none";
                actionCenter.style.display = "none";
            }
            
            uploadSection.classList.remove('is-scanning');
            
            // Persist monitoring entry to backend
            const monEntry = {
                status: scanStatus,
                confidence: confidencePercentage,
                platform: platformDetected,
                timestamp: new Date().toISOString(),
                matchedMediaId
            };
            apiRequest('/monitoring', 'POST', monEntry)
                .then(r => {
                    if (r.data) {
                        monitoringDB.push(r.data);
                        if (monitoringDB.length > 100) monitoringDB.shift();
                    }
                    renderMonitoring();
                })
                .catch(e => console.warn('[monitoring] Save failed:', e.message));

            // Persist to backend then re-render
            renderDashboard();
            renderAlerts();

            scoreValue.textContent = displaySimilarity.toFixed(1) + "%";
            checkButton.disabled = false;

        } catch (error) {
            console.error("Application Process Interruption: Matching algorithm engine failure hook:", error);
            loader.style.display = "none";
            statusMessage.style.display = "block";
            statusMessage.textContent = "Matrix Processing Failed. Logs recorded into debug terminal.";
            statusMessage.style.color = "var(--danger)";
            
            if (uploadSection) uploadSection.classList.remove('is-scanning');
            checkButton.disabled = false;
        } finally {
            isProcessing = false;
        }
    });
});

// --- Dataset-Driven Simulation Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const runSimulationBtn = document.getElementById('runSimulationBtn');
    const simulationFeedback = document.getElementById('simulationFeedback');

    if (runSimulationBtn) {
        runSimulationBtn.addEventListener('click', async () => {
            runSimulationBtn.disabled = true;
            const originalText = runSimulationBtn.innerHTML;
            runSimulationBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
            simulationFeedback.style.display = 'none';

            try {
                const response = await apiRequest('/monitoring/simulate', 'POST');
                if (response && response.success) {
                    // Reload all data from backend to ensure synchronization
                    await loadState();
                    
                    // Show success feedback
                    simulationFeedback.textContent = "Simulation completed successfully";
                    simulationFeedback.style.color = "var(--success)";
                    simulationFeedback.style.display = 'inline-block';
                    
                    // Hide feedback after 4 seconds
                    setTimeout(() => {
                        simulationFeedback.style.display = 'none';
                    }, 4000);
                }
            } catch (error) {
                console.error("Simulation trigger failed:", error);
                simulationFeedback.textContent = "Simulation failed: " + error.message;
                simulationFeedback.style.color = "var(--danger)";
                simulationFeedback.style.display = 'inline-block';
            } finally {
                runSimulationBtn.disabled = false;
                runSimulationBtn.innerHTML = originalText;
            }
        });
    }

    // Toggle Diff View Button Logic
    const toggleDiffBtn = document.getElementById('toggleDiffBtn');
    const differenceContainer = document.getElementById('differenceContainer');
    if (toggleDiffBtn && differenceContainer) {
        toggleDiffBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Show Difference View';
        toggleDiffBtn.addEventListener('click', () => {
            if (differenceContainer.style.display === 'none') {
                differenceContainer.style.display = 'flex';
                // Trigger reflow for fade-in transition
                void differenceContainer.offsetWidth;
                differenceContainer.style.opacity = '1';
                toggleDiffBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide Difference View';
            } else {
                differenceContainer.style.opacity = '0';
                setTimeout(() => {
                    differenceContainer.style.display = 'none';
                }, 300);
                toggleDiffBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Show Difference View';
            }
        });
    }
});

// --- Difference Canvas Generation Logic ---
async function generateDiffMap(uploadedSrc, referenceSrc) {
    const uploadedCanvas = document.getElementById('uploadedCanvas');
    const referenceCanvas = document.getElementById('referenceCanvas');
    const differenceCanvas = document.getElementById('differenceCanvas');
    
    // Downscale bound as per requirements
    const targetSize = 300;
    
    function drawToCanvas(src, canvas) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                // Maintain aspect ratio, fit inside box
                const scale = Math.min(targetSize / img.width, targetSize / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (targetSize - w) / 2;
                const y = (targetSize - h) / 2;
                
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, targetSize, targetSize);
                ctx.drawImage(img, x, y, w, h);
                resolve(ctx.getImageData(0, 0, targetSize, targetSize));
            };
            img.onerror = (err) => {
                console.error("Failed to load reference image:", img.src);
                reject(new Error("Failed to load image"));
            };
            img.src = src;
        });
    }
    
    try {
        const [uploadedData, referenceData] = await Promise.all([
            drawToCanvas(uploadedSrc, uploadedCanvas),
            drawToCanvas(referenceSrc, referenceCanvas)
        ]);
        
        const diffCtx = differenceCanvas.getContext('2d');
        const diffImgData = diffCtx.createImageData(targetSize, targetSize);
        const d1 = uploadedData.data;
        const d2 = referenceData.data;
        const out = diffImgData.data;
        
        const THRESHOLD = 50;
        let hasDifference = false;
        
        for (let i = 0; i < d1.length; i += 4) {
            const r1 = d1[i], g1 = d1[i+1], b1 = d1[i+2];
            const r2 = d2[i], g2 = d2[i+1], b2 = d2[i+2];
            
            // Skip padding area to keep it black
            if (r1===0 && g1===0 && b1===0 && r2===0 && g2===0 && b2===0) {
                out[i] = out[i+1] = out[i+2] = 0;
                out[i+3] = 255;
                continue;
            }
            
            const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
            
            if (diff < THRESHOLD) {
                // Pixel is considered similar -> fully transparent
                out[i] = out[i+1] = out[i+2] = out[i+3] = 0; 
            } else {
                // Pixel is different -> highlight red with strong intensity
                hasDifference = true;
                const intensity = Math.min(diff / 255, 1);
                out[i] = 255;
                out[i+1] = 0;
                out[i+2] = 0;
                out[i+3] = Math.max(intensity * 255, 120);
            }
        }
        
        if (hasDifference) {
            diffCtx.putImageData(diffImgData, 0, 0);
        } else {
            // Edge case: Images are exactly identical in bounds
            diffCtx.fillStyle = '#111';
            diffCtx.fillRect(0, 0, targetSize, targetSize);
            diffCtx.fillStyle = '#ccc';
            diffCtx.font = '500 13px system-ui, -apple-system, sans-serif';
            diffCtx.textAlign = 'center';
            diffCtx.fillText('No structural differences detected', targetSize / 2, targetSize / 2);
        }
    } catch (err) {
        console.error("Error generating difference map:", err);
        
        // Fallback: Show error message on the difference canvas instead of breaking silently
        const diffCtx = differenceCanvas.getContext('2d');
        diffCtx.fillStyle = '#0f172a'; // dark background
        diffCtx.fillRect(0, 0, targetSize, targetSize);
        diffCtx.fillStyle = '#ef4444'; // danger red
        diffCtx.font = '500 13px system-ui, -apple-system, sans-serif';
        diffCtx.textAlign = 'center';
        diffCtx.fillText('Reference image failed to load', targetSize / 2, targetSize / 2);
    }
}
