let mediaDB = [];
let monitoringDB = [];
let alertsDB = [];

let monitoringFilter = 'all'; // all, unauthorized, original
let alertsFilter = 'active'; // active, resolved

let simulationActive = false;
let simulationInterval = null;

const generateId = () => Math.random().toString(36).substr(2, 9);

function loadState() {
    const savedMedia = localStorage.getItem('mediaDB');
    const savedMonitoring = localStorage.getItem('monitoringDB');
    const savedAlerts = localStorage.getItem('alertsDB');

    if (savedMedia) mediaDB = JSON.parse(savedMedia);
    if (savedMonitoring) monitoringDB = JSON.parse(savedMonitoring);
    if (savedAlerts) alertsDB = JSON.parse(savedAlerts);
}

function saveState() {
    localStorage.setItem('mediaDB', JSON.stringify(mediaDB));
    localStorage.setItem('monitoringDB', JSON.stringify(monitoringDB));
    localStorage.setItem('alertsDB', JSON.stringify(alertsDB));
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

function renderDashboard() {
    const metricRegistered = document.getElementById("metricRegistered");
    const metricDetections = document.getElementById("metricDetections");
    const metricAlerts = document.getElementById("metricAlerts");
    const metricAccuracy = document.getElementById("metricAccuracy");
    
    if (metricRegistered) metricRegistered.textContent = mediaDB.length.toLocaleString();
    
    if (metricDetections) {
        const totalUnauthorized = monitoringDB.filter(m => m.status === 'unauthorized').length;
        metricDetections.textContent = totalUnauthorized.toLocaleString();
    }
    
    if (metricAlerts) {
        const activeAlerts = alertsDB.filter(a => a.status === 'active').length;
        metricAlerts.textContent = activeAlerts.toLocaleString();
    }
    
    if (metricAccuracy) {
        if (monitoringDB.length === 0) {
            metricAccuracy.textContent = "---";
        } else {
            const originalDetections = monitoringDB.filter(m => m.status === 'original').length;
            const accuracy = (originalDetections / monitoringDB.length) * 100;
            metricAccuracy.textContent = accuracy.toFixed(1) + "%";
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
        if (entry.confidence >= 70 && entry.confidence < 85) miniProgressColor = "var(--warning)";
        if (entry.confidence >= 85) miniProgressColor = "var(--danger)";
        
        const thumbUi = entry.thumbnail ? `<div class="thumb-mock" style="background: url('${entry.thumbnail}') center/cover;"></div>` : `<div class="thumb-mock" style="background:#e2e8f0; display:flex; align-items:center; justify-content:center; color:var(--text-muted);"><i class="fa-solid fa-image"></i></div>`;
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
    const alert = alertsDB.find(a => a.id === id);
    if (alert) {
        alert.status = 'resolved';
        saveState();
        renderAlerts();
        renderDashboard();
    }
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
        let severityClass = alert.confidence > 85 ? 'high-severity' : 'medium-severity';
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
    const platforms = ["Sports News Platform", "Social Media", "Streaming Platform", "Blog Network X", "Internal Processing"];
    const platformDetected = platforms[Math.floor(Math.random() * platforms.length)];
    
    const isOriginal = Math.random() > 0.3; // 70% chance of being original safe interaction
    let confidencePercentage = 0;
    
    if (isOriginal) {
        confidencePercentage = Math.random() * 25 + 60; // 60-85% 
    } else {
        confidencePercentage = Math.random() * 15 + 85; // 85-100%
    }
    
    const scanStatus = confidencePercentage >= 85 ? "unauthorized" : "original";
    
    if (scanStatus === 'unauthorized') {
        const existingActiveAlert = alertsDB.find(a => a.matchedMediaId === targetMedia.id && a.status === 'active');
        if (!existingActiveAlert) {
            alertsDB.push({
                id: generateId(),
                status: "active",
                confidence: confidencePercentage,
                platform: platformDetected,
                timestamp: new Date().toISOString(),
                matchedMediaId: targetMedia.id
            });
            if (alertsDB.length > 50) alertsDB.shift(); // Bounds constraint
        }
    }
    
    monitoringDB.push({
        id: generateId(),
        status: scanStatus,
        confidence: confidencePercentage,
        platform: platformDetected,
        thumbnail: null,
        timestamp: new Date().toISOString(),
        matchedMediaId: confidencePercentage > 40 ? targetMedia.id : null
    });
    
    if (monitoringDB.length > 100) monitoringDB.shift(); // Bounds constraint
    
    saveState();
    renderDashboard();
    renderMonitoring();
    renderAlerts();
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

function getImageData(imageSource) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 32;
            canvas.height = 32;
            ctx.drawImage(img, 0, 0, 32, 32);
            resolve(ctx.getImageData(0, 0, 32, 32).data);
        };
        img.onerror = reject;
        img.src = typeof imageSource === 'string' ? imageSource : imageSource.src;
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
    let diff = 0;
    for (let i = 0; i < 64; i++) {
        if (hash1[i] !== hash2[i]) diff++;
    }
    // Reverse math back out to generic % representation
    return ((64 - diff) / 64) * 100;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

document.addEventListener("DOMContentLoaded", () => {
    // Initial loads
    loadState();
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
                targetPage.style.display = 'block';
            }
        });
    });

    let currentFileName = "Upload";

    // Handle Image Upload Selection
    imageInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (file) {
            currentFileName = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
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
            };
            reader.readAsDataURL(file);
        }
    });

    registerButton.addEventListener("click", async () => {
        registerButton.disabled = true;
        checkButton.disabled = true;
        
        try {
            const rawPixelArray = await getImageData(imagePreview.src);
            const phashStr = computePHash(rawPixelArray); 
            
            const newMedia = {
                id: generateId(),
                phash: phashStr,
                type: "image",
                name: currentFileName,
                uploadedAt: new Date().toISOString()
            };
            
            mediaDB.push(newMedia);
            saveState();
            renderDashboard();
            
            // We can now safely allow checking since media isn't 0
            checkButton.disabled = false;
            
            registerFeedback.textContent = "Media successfully registered as official content";
            registerFeedback.style.display = "block";
            
            setTimeout(() => {
                registerFeedback.style.display = "none";
            }, 3000);
        } catch(e) {
            console.error(e);
            alert("Failed to register media.");
        } finally {
            registerButton.disabled = false;
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
        checkButton.disabled = true;
        
        resultSection.style.display = "block";
        loader.style.display = "block";
        statusMessage.style.display = "block";
        resultContent.style.display = "none";

        try {
            if (mediaDB.length === 0) { // Safety check
                resultSection.style.display = "none"; 
                return;
            }
            confidenceScoreNode.style.display = "block";
            if(confidenceBarContainer) confidenceBarContainer.style.display = "block";

            statusMessage.textContent = "Scanning media database...";
            await sleep(600);
            
            statusMessage.textContent = "Analyzing visual fingerprint...";
            const rawUploaded = await getImageData(imagePreview.src);
            const uploadedHash = computePHash(rawUploaded);
            await sleep(600);
            
            statusMessage.textContent = "Matching against known content...";
            let maxSimilarity = 0;
            let matchedMediaId = null;
            
            // Compare uploaded image against all registered media
            for (const media of mediaDB) {
                if (!media.phash) continue; // Safe fallback skipping legacy payload bodies
                
                const similarity = hammingDistance(uploadedHash, media.phash);
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                    matchedMediaId = media.id;
                }
            }
            
            await sleep(800);
            
            loader.style.display = "none";
            statusMessage.style.display = "none";
            resultContent.style.display = "block";
            
            let scanStatus = "original";
            let platformDetected = "Internal Processing";
            const confidencePercentage = maxSimilarity;
            
            if (confidenceBarFill) {
                confidenceBarFill.style.width = Math.min(100, confidencePercentage).toFixed(1) + "%";
                if (confidencePercentage < 70) {
                    confidenceBarFill.style.backgroundColor = "var(--success)";
                } else if (confidencePercentage < 85) {
                    confidenceBarFill.style.backgroundColor = "var(--warning)";
                } else {
                    confidenceBarFill.style.backgroundColor = "var(--danger)";
                }
            }
            
            if (maxSimilarity >= 85) {
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
                
                // DE-DUPLICATION CHECK
                const existingActiveAlert = alertsDB.find(a => a.matchedMediaId === matchedMediaId && a.status === 'active');
                if (!existingActiveAlert) {
                    alertsDB.push({
                        id: generateId(),
                        status: "active",
                        confidence: confidencePercentage,
                        platform: platformDetected,
                        timestamp: new Date().toISOString(),
                        matchedMediaId: matchedMediaId
                    });
                    if (alertsDB.length > 50) alertsDB.shift();
                }
                
            } else {
                resultTitle.textContent = "✅ Original Content Verified";
                resultSubtext.textContent = "No matching records found in the protected media database.";
                resultAlert.className = "no-match";
                sourceLabels.style.display = "none";
                trackingTimeline.style.display = "none";
                actionCenter.style.display = "none";
            }
            
            monitoringDB.push({
                id: generateId(),
                status: scanStatus,
                confidence: confidencePercentage,
                platform: platformDetected,
                thumbnail: imagePreview.src,
                timestamp: new Date().toISOString(),
                matchedMediaId: matchedMediaId // Relational link injected here!
            });
            if (monitoringDB.length > 100) monitoringDB.shift();

            saveState();
            renderDashboard();
            renderMonitoring();
            renderAlerts();

            scoreValue.textContent = maxSimilarity.toFixed(1) + "%";
            
            checkButton.disabled = false;

        } catch (error) {
            console.error("Error computing image similarity:", error);
            loader.style.display = "none";
            statusMessage.style.display = "none";
            checkButton.disabled = false;
            alert("Error processing images. Please try again.");
        }
    });
});
