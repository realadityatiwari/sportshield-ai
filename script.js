let registeredMediaFingerprints = [];

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

function calculateSimilarity(data1, data2) {
    let diff = 0;
    // Both images are 32x32 RGBA, so length is 32 * 32 * 4 = 4096
    for (let i = 0; i < data1.length; i += 4) {
        // Compare RGB channels and sum absolute differences
        diff += Math.abs(data1[i] - data2[i]);       // R
        diff += Math.abs(data1[i+1] - data2[i+1]);   // G
        diff += Math.abs(data1[i+2] - data2[i+2]);   // B
        // Alpha channel (i+3) is ignored for simple content matching
    }
    // Max difference per pixel is 255 * 3. Total pixels = data1.length / 4.
    const maxDiff = (data1.length / 4) * 255 * 3;
    const similarity = 1 - (diff / maxDiff);
    return similarity * 100;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

document.addEventListener("DOMContentLoaded", () => {
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

    // Dashboard Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const pageViews = document.querySelectorAll('.page-view');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Swap active nav states
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Swap view visibility
            pageViews.forEach(page => page.style.display = 'none');
            const targetId = item.getAttribute('data-target');
            const targetPage = document.getElementById(targetId);
            if(targetPage) {
                targetPage.style.display = 'block';
            }
        });
    });

    // Handle Image Upload Selection
    imageInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (file) {
            // Read file and parse into preview
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                previewSection.style.display = "block";
                checkButton.disabled = false;
                registerButton.disabled = false;
                uploadText.textContent = file.name;
                
                // Hide any previous results if user changes the image
                resultSection.style.display = "none";
                resultContent.style.display = "none";
                resultAlert.className = '';
                resultTitle.textContent = '';
                resultSubtext.textContent = '';
                trackingTimeline.style.display = "none";
                actionCenter.style.display = "none";
            };
            reader.readAsDataURL(file);
        }
    });

    registerButton.addEventListener("click", async () => {
        registerButton.disabled = true;
        checkButton.disabled = true;
        
        try {
            const fingerprint = await getImageData(imagePreview.src);
            registeredMediaFingerprints.push(fingerprint);
            
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
            checkButton.disabled = false;
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
        // Disable button while processing
        checkButton.disabled = true;
        
        // Show loaders
        resultSection.style.display = "block";
        loader.style.display = "block";
        statusMessage.style.display = "block";
        resultContent.style.display = "none";

        try {
            if (registeredMediaFingerprints.length === 0) {
                resultSection.style.display = "block";
                resultContent.style.display = "block";
                resultAlert.className = "no-match";
                resultTitle.textContent = "ℹ️ No Official Media";
                resultSubtext.textContent = "No official media registered. Please register media first.";
                sourceLabels.style.display = "none";
                confidenceScoreNode.style.display = "none";
                trackingTimeline.style.display = "none";
                actionCenter.style.display = "none";
                
                checkButton.disabled = false;
                loader.style.display = "none";
                statusMessage.style.display = "none";
                return;
            }
            confidenceScoreNode.style.display = "block";

            statusMessage.textContent = "Scanning media database...";
            await sleep(600);
            
            statusMessage.textContent = "Analyzing visual fingerprint...";
            // Get pixel data from the uploaded image payload
            const uploadedData = await getImageData(imagePreview.src);
            await sleep(600);
            
            statusMessage.textContent = "Matching against known content...";
            let maxSimilarity = 0;
            
            // Compare uploaded image against all registered media
            for (const sampleData of registeredMediaFingerprints) {
                const similarity = calculateSimilarity(uploadedData, sampleData);
                
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                }
            }
            
            await sleep(800);
            
            loader.style.display = "none";
            statusMessage.style.display = "none";
            resultContent.style.display = "block";
            
            // Check threshold logic
            if (maxSimilarity >= 70) {
                resultTitle.textContent = "🚨 Unauthorized Usage Detected";
                resultSubtext.textContent = "This media matches known protected content in our database.";
                resultAlert.className = "match-found";
                
                sourceLabels.innerHTML = `
                    <span class="source-label">Detected on: Sports News Platform</span>
                    <span class="source-label">Detected on: Social Media</span>
                `;
                sourceLabels.style.display = "flex";
                
                // Generate simulated timeline
                const now = new Date();
                const times = [
                    new Date(now.getTime() - 25 * 60000), // 25 mins ago
                    new Date(now.getTime() - 12 * 60000), // 12 mins ago
                    new Date(now.getTime() - 2 * 60000)   // 2 mins ago
                ];
                const platforms = ["Sports News Platform", "Social Media", "Streaming Platform"];
                
                timelineList.innerHTML = '';
                times.forEach((time, index) => {
                    const timeString = time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    timelineList.innerHTML += `
                        <li>
                            <span class="timeline-time">${timeString}</span>
                            Detected on ${platforms[index]}
                        </li>
                    `;
                });
                trackingTimeline.style.display = "block";
                actionCenter.style.display = "block";
            } else {
                resultTitle.textContent = "✅ Original Content Verified";
                resultSubtext.textContent = "No matching records found in the protected media database.";
                resultAlert.className = "no-match";
                sourceLabels.style.display = "none";
                trackingTimeline.style.display = "none";
                actionCenter.style.display = "none";
            }

            scoreValue.textContent = maxSimilarity.toFixed(1) + "%";
            
            // Re-enable button
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
