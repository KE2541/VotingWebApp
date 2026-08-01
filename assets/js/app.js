let currentVoter = null;
let countdownInterval = null;
let selections = {};
let positionNames = {};
let totalPositions = 0;
let faceMatcher = null;
let currentFaceDescriptor = null;
let selectedLocation = '';

document.addEventListener('DOMContentLoaded', function () {
    loadElectionInfo();
    setInterval(loadElectionInfo, 30000);
    initSecurity();
    initGlobalHandlers();
});

var deviceType = (function () {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk|android(?!.*mobile)/i.test(ua)) return 'tablet';
    if (/mobile|ip(hone|od)|phone|blackberry|iemobile|opera mini|kindle/i.test(ua)) return 'mobile';
    return 'desktop';
})();

var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
var isAndroid = /android/i.test(navigator.userAgent);
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

var currentFacingMode = 'environment';

function getCameraConstraints() {
    var constraints = { video: { facingMode: { ideal: currentFacingMode } } };
    if (deviceType === 'mobile' || deviceType === 'tablet') {
        constraints.video.width = { ideal: 480 };
        constraints.video.height = { ideal: 640 };
    } else {
        constraints.video.width = { ideal: 640 };
        constraints.video.height = { ideal: 480 };
    }
    return constraints;
}

function switchCamera() {
    var video = document.getElementById('verifyVideo');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(function (t) { t.stop(); });
        video.srcObject = null;
    }
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    var btn = document.getElementById('switchCameraBtn');
    if (btn) {
        btn.textContent = currentFacingMode === 'environment' ? 'Front Camera' : 'Back Camera';
    }
    var voterData = document.getElementById('faceVerifySection').dataset.voterData;
    if (voterData) {
        try {
            var voter = JSON.parse(voterData);
            startFaceVerification(voter);
        } catch (e) {}
    }
}

function isCameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function showCameraFallback(message) {
    var instruction = document.getElementById('verifyInstruction');
    var statusEl = document.getElementById('verifyFaceStatus');
    if (instruction) {
        instruction.textContent = deviceType === 'desktop' ?
            'Camera access is required for face verification. Please allow camera permissions.' :
            'Camera access is required. Please allow camera permissions in your browser settings.';
    }
    if (statusEl) {
        statusEl.textContent = message || 'Camera not available on this device.';
        statusEl.className = 'face-status text-danger';
    }
}

function updateSelectedLocation() {
    var ward = document.getElementById('locationSearchWard');
    var constituency = document.getElementById('locationSearchConstituency');
    var county = document.getElementById('locationSearchCounty');
    var val = '';
    if (ward && ward.value) val = ward.value;
    else if (constituency && constituency.value) val = constituency.value;
    else if (county && county.value) val = county.value;
    selectedLocation = val;
}

function initGlobalHandlers() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var modals = document.querySelectorAll('.modal');
            modals.forEach(function (m) {
                if (m.style.display === 'flex') {
                    m.style.display = 'none';
                }
            });
        }
    });
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
    document.addEventListener('change', function (e) {
        if (e.target.id === 'locationSearchCounty' || e.target.id === 'locationSearchConstituency' || e.target.id === 'locationSearchWard') {
            updateSelectedLocation();
        }
    });
}

function showToast(message, type, duration) {
    type = type || 'success';
    duration = duration || 4000;
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    var icons = { success: '\u2714', error: '\u2716', warning: '\u26A0' };
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || '') + '</span>' +
        '<span>' + escHtml(message) + '</span>' +
        '<button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';
    container.appendChild(toast);
    setTimeout(function () {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(function () { toast.remove(); }, 300);
    }, duration);
}

function showLoading(message) {
    var overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner spinner-lg"></div><p id="loadingText">Loading...</p>';
        document.body.appendChild(overlay);
    }
    document.getElementById('loadingText').textContent = message || 'Loading...';
    overlay.classList.add('active');
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
}

function debounce(fn, delay) {
    var timer;
    return function () {
        var args = arguments;
        var ctx = this;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
}

function animateValue(el, start, end, duration) {
    if (!el) return;
    var range = end - start;
    var startTime = performance.now();
    function step(currentTime) {
        var progress = Math.min((currentTime - startTime) / duration, 1);
        el.textContent = Math.floor(start + range * progress * (2 - progress));
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function initSecurity() {
    if (typeof navigator !== 'undefined') {
        checkVPN();
        blockKeyboardShortcuts();
    }
}

function checkVPN() {
    try {
        if (navigator.connection && navigator.connection.type) {
            if (navigator.connection.type === 'vpn') {
                triggerHackDetection('VPN detected');
                return;
            }
        }
        if (window.RTCPeerConnection) {
            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('');
            pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});
            pc.onicecandidate = function (ice) {
                if (ice.candidate && ice.candidate.candidate) {
                    const ipMatch = ice.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                    if (ipMatch) {
                        const localIP = ipMatch[0];
                        if (localIP.startsWith('10.') || localIP.startsWith('172.16.') || localIP.startsWith('192.168.')) {
                        } else if (localIP.startsWith('100.') || localIP.startsWith('198.18.')) {
                            triggerHackDetection('VPN or proxy detected (unusual IP range)');
                        }
                    }
                }
            };
            setTimeout(() => pc.close(), 1000);
        }
    } catch (e) {}
}

function blockKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
            (e.ctrlKey && e.shiftKey && e.key === 'U' && e.key === 'u') ||
            (e.ctrlKey && e.key === 'U' && e.key === 'u')) {
            e.preventDefault();
            triggerHackDetection('Unauthorized access attempt detected');
            return false;
        }
    });
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });
}

function triggerHackDetection(reason) {
    const overlay = document.getElementById('hackOverlay');
    if (overlay && overlay.style.display !== 'flex') {
        overlay.style.display = 'flex';
        document.getElementById('hackReason').textContent = reason;
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
                document.getElementById('hackCoords').textContent =
                    'Latitude: ' + pos.coords.latitude + ' | Longitude: ' + pos.coords.longitude +
                    ' | Accuracy: ' + pos.coords.accuracy + 'm';
                document.getElementById('hackIP').textContent = 'Location captured. Authorities notified.';
            }, function () {
                document.getElementById('hackIP').textContent = 'Location services blocked. IP tracking active.';
                document.getElementById('hackCoords').textContent = 'Using IP-based geolocation...';
            });
        } else {
            document.getElementById('hackIP').textContent = 'Geolocation unavailable. IP tracking active.';
            document.getElementById('hackCoords').textContent = 'Estimated position from network data...';
        }
        document.body.style.overflow = 'hidden';
    }
}

function loadElectionInfo() {
    fetch(API_BASE + '/api/settings.php')
        .then(r => r.json())
        .then(data => {
            if (data.success && data.settings) {
                const s = data.settings;
                const statusEl = document.getElementById('electionStatus');
                const timerEl = document.getElementById('countdownTimer');
                if (statusEl) {
                    const now = new Date();
                    const start = new Date(s.start_time);
                    const end = new Date(s.end_time);

                    if (!s.is_active) {
                        statusEl.innerHTML = '<span class="badge badge-danger">Voting is currently disabled</span>';
                        timerEl.style.display = 'none';
                    } else if (now < start) {
                        statusEl.innerHTML = '<span class="badge badge-warning">Voting starts at ' + formatDate(s.start_time) + '</span>';
                        timerEl.style.display = 'none';
                    } else if (now > end) {
                        statusEl.innerHTML = '<span class="badge badge-danger">Voting ended at ' + formatDate(s.end_time) + '</span>';
                        timerEl.style.display = 'none';
                    } else {
                        statusEl.innerHTML = '<span class="badge badge-success">Voting open</span>';
                        timerEl.style.display = 'flex';
                        startCountdown(end);
                    }
                }
            }
        });
}

function startCountdown(targetDate) {
    if (countdownInterval) clearInterval(countdownInterval);
    const display = document.getElementById('countdownDisplay');
    function tick() {
        const now = new Date();
        const diff = targetDate - now;
        if (diff <= 0) {
            display.textContent = 'Ended';
            loadElectionInfo();
            return;
        }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        if (d > 0) {
            display.textContent = d + 'd ' + h.toString().padStart(2, '0') + 'h ' + m.toString().padStart(2, '0') + 'm ' + s.toString().padStart(2, '0') + 's';
        } else {
            display.textContent = h.toString().padStart(2, '0') + 'h ' + m.toString().padStart(2, '0') + 'm ' + s.toString().padStart(2, '0') + 's';
        }
    }
    tick();
    countdownInterval = setInterval(tick, 1000);
}

function verifyVoter(e) {
    e.preventDefault();
    const voter_id = document.getElementById('voterIdNumber').value.trim();
    const msg = document.getElementById('registerMsg');
    const verifyBtn = document.querySelector('#registerForm .btn-primary');
    const faceSection = document.getElementById('faceVerifySection');
    const lookupResult = document.getElementById('voterLookupResult');

    if (!/^(?:\d{6,9}|[A-Za-z]\d{7})$/.test(voter_id)) {
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Use 6-9 digit National ID or Passport (1 letter + 7 digits).';
        msg.style.display = 'block';
        showToast('Invalid ID format. Please check and try again.', 'error');
        return false;
    }

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span class="spinner spinner-sm"></span> Verifying...';
    msg.style.display = 'none';
    lookupResult.style.display = 'none';
    showLoading('Verifying voter identity...');

    fetch(API_BASE + '/api/voters.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_id, location: selectedLocation })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            document.getElementById('voterLookupName').textContent = data.voter.full_name.toUpperCase();
            document.getElementById('voterLookupId').textContent = 'ID: ' + data.voter.voter_id;
            var locEl = document.getElementById('voterLookupLocation');
            if (locEl) locEl.textContent = data.voter.location ? 'Location: ' + data.voter.location : '';
            if (data.voter.face_image) {
                document.getElementById('voterLookupPhoto').src = data.voter.face_image;
            } else {
                document.getElementById('voterLookupPhoto').src = '';
            }
            lookupResult.style.display = 'flex';

            if (data.voter.has_voted == 1) {
                msg.className = 'text-danger mt-2';
                msg.textContent = 'You have already voted. Repeat voting is not allowed.';
                msg.style.display = 'block';
                showToast('Already voted. Repeat voting not allowed.', 'error');
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = 'Verify &amp; Start Voting';
                return;
            }
            document.getElementById('displayName').textContent = data.voter.full_name.toUpperCase();
            document.getElementById('displayVoterId').textContent = data.voter.voter_id;

            showToast('Voter identified successfully!', 'success');

            if (data.voter.face_descriptor) {
                faceSection.style.display = 'block';
                document.getElementById('faceVerifySection').dataset.voterId = data.voter.id;
                document.getElementById('faceVerifySection').dataset.faceDescriptor = data.voter.face_descriptor;
                document.getElementById('faceVerifySection').dataset.voterData = JSON.stringify(data.voter);
                startFaceVerification(data.voter);
            } else {
                proceedToVoting(data.voter);
            }
            verifyBtn.innerHTML = 'Verify &amp; Start Voting';
        } else {
            msg.className = 'text-danger mt-2';
            msg.textContent = data.message;
            msg.style.display = 'block';
            showToast(data.message, 'error');
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = 'Verify &amp; Start Voting';
        }
    })
    .catch(() => {
        hideLoading();
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Connection error. Please try again.';
        msg.style.display = 'block';
        showToast('Connection error. Please try again.', 'error');
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = 'Verify &amp; Start Voting';
    });
    return false;
}

var LIVENESS_STEPS = ['center', 'blink', 'left', 'right', 'up', 'down'];
var LIVENESS_TIMEOUT = deviceType === 'mobile' ? 90000 : 120000;
var FACE_WIDTH = 640;
var FACE_HEIGHT = 480;
var LIVENESS_MOTION_THRESHOLD = 15;
var LIVENESS_STEP_DELAY = deviceType === 'mobile' ? 4000 : 5000;

let livenessAbort = false;

function startFaceVerification(voter) {
    const video = document.getElementById('verifyVideo');
    const statusEl = document.getElementById('verifyFaceStatus');
    const retryBtn = document.getElementById('verifyRetryBtn');
    const instruction = document.getElementById('verifyInstruction');
    const livenessEl = document.getElementById('livenessProgress');

    livenessAbort = false;
    retryBtn.style.display = 'none';
    document.getElementById('switchCameraBtn').style.display = 'none';
    livenessEl.style.display = 'flex';
    document.querySelectorAll('.liveness-step').forEach(function (s) {
        s.className = 'liveness-step';
    });

    if (isIOS || isSafari) {
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.muted = true;
    }

    if (deviceType === 'mobile' || deviceType === 'tablet') {
        instruction.textContent = 'Hold your phone in PORTRAIT mode. Face the camera directly.';
        instruction.className = 'text-muted';
        var switchBtn = document.getElementById('switchCameraBtn');
        if (switchBtn) {
            switchBtn.style.display = 'inline-block';
            switchBtn.textContent = currentFacingMode === 'environment' ? 'Front Camera' : 'Back Camera';
        }
    }

    statusEl.textContent = 'Accessing camera for face verification...';
    statusEl.className = 'face-status text-muted';

    if (!isCameraSupported()) {
        showCameraFallback();
        return;
    }

    var constraints = getCameraConstraints();

    navigator.mediaDevices.getUserMedia(constraints)
        .then(function (stream) {
            video.srcObject = stream;
            video.style.display = 'block';
            video.play().catch(function () {});
            startDistanceCheck(voter, stream, statusEl, retryBtn, instruction, video, function () {
                runLivenessSequence(voter, stream, statusEl, retryBtn, instruction);
            });
        })
        .catch(function (err) {
            var msg = 'Camera access denied.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = deviceType === 'mobile' ?
                    'Camera permission denied. Please enable camera access in your browser/device settings.' :
                    'Camera permission denied. Please allow camera access in your browser settings.';
            } else if (err.name === 'NotFoundError') {
                msg = 'No camera found on this device.';
            } else if (err.name === 'NotReadableError') {
                msg = 'Camera is busy. Please close other apps using the camera.';
            } else if (err.name === 'OverconstrainedError') {
                msg = 'Camera does not support the required resolution.';
            }
            statusEl.textContent = msg;
            statusEl.className = 'face-status text-danger';
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = function () { startFaceVerification(voter); };
            showToast(msg, 'error');
        });
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }
}

function runLivenessSequence(voter, stream, statusEl, retryBtn, instruction) {
    const video = document.getElementById('verifyVideo');
    const canvas = document.getElementById('verifyCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = FACE_WIDTH;
    canvas.height = FACE_HEIGHT;

    let stepIndex = 0;
    let capturedFrames = {};
    let startTime = Date.now();
    let prevFrameData = null;
    let motionDetected = false;

    if (deviceType === 'mobile' || deviceType === 'tablet') {
        statusEl.textContent = 'Hold your phone steady and follow the prompts';
    }

    function processStep() {
        if (livenessAbort) {
            cleanupStream(stream);
            return;
        }

        var elapsed = Date.now() - startTime;
        if (elapsed > LIVENESS_TIMEOUT) {
            statusEl.textContent = 'Verification timed out. Please retry.';
            statusEl.className = 'face-status text-danger';
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = function () { cleanupStream(stream); startFaceVerification(voter); };
            cleanupStream(stream);
            video.style.display = 'none';
            return;
        }

        var step = LIVENESS_STEPS[stepIndex];
        updateLivenessStepUI(step, 'active');

        var prompts = {
            'center': 'Look straight at the camera',
            'blink': 'Blink your eyes',
            'left': 'Slowly turn your head to the LEFT',
            'right': 'Slowly turn your head to the RIGHT',
            'up': 'Tilt your head UP',
            'down': 'Tilt your head DOWN',
        };
        var promptText = prompts[step] || 'Look at the camera';
        instruction.textContent = promptText;
        instruction.className = 'text-muted';
        speakText(promptText);

        setTimeout(function () {
            try {
                ctx.drawImage(video, 0, 0, FACE_WIDTH, FACE_HEIGHT);
            } catch (e) {
                statusEl.textContent = 'Camera feed lost. Please retry.';
                statusEl.className = 'face-status text-danger';
                retryBtn.style.display = 'inline-block';
                retryBtn.onclick = function () { cleanupStream(stream); startFaceVerification(voter); };
                cleanupStream(stream);
                return;
            }
            var frameData = ctx.getImageData(0, 0, FACE_WIDTH, FACE_HEIGHT);
            capturedFrames[step] = {
                imageData: ctx.getImageData(0, 0, FACE_WIDTH, FACE_HEIGHT),
                dataUrl: canvas.toDataURL('image/jpeg', 0.7)
            };

            if (prevFrameData) {
                var diff = computeFrameDifference(prevFrameData, frameData);
                if (diff > LIVENESS_MOTION_THRESHOLD) {
                    motionDetected = true;
                }
            }
            prevFrameData = frameData;

            updateLivenessStepUI(step, 'done');
            stepIndex++;

            if (stepIndex < LIVENESS_STEPS.length) {
                setTimeout(processStep, LIVENESS_STEP_DELAY);
            } else {
                finalizeLiveness(voter, stream, statusEl, retryBtn, capturedFrames, motionDetected);
            }
        }, LIVENESS_STEP_DELAY);
    }

    setTimeout(processStep, 500);
}

function startDistanceCheck(voter, stream, statusEl, retryBtn, instruction, video, onReady) {
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = 160;
    tempCanvas.height = 120;
    var tempCtx = tempCanvas.getContext('2d');
    var dcLastSpoken = '';
    var dcStartTime = Date.now();
    var dcMaxDuration = deviceType === 'mobile' ? 15000 : 30000;

    statusEl.textContent = 'Adjust your distance from the camera';
    statusEl.className = 'face-status text-muted';
    instruction.textContent = 'Position your face in the center';
    instruction.className = 'text-muted';

    var dcInterval = setInterval(function () {
        if (livenessAbort) {
            clearInterval(dcInterval);
            cleanupStream(stream);
            return;
        }
        if (Date.now() - dcStartTime > dcMaxDuration) {
            clearInterval(dcInterval);
            statusEl.textContent = 'Distance check timed out. Please retry.';
            statusEl.className = 'face-status text-danger';
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = function () { cleanupStream(stream); startFaceVerification(voter); };
            cleanupStream(stream);
            return;
        }

        tempCtx.drawImage(video, 0, 0, 160, 120);
        var fd = tempCtx.getImageData(0, 0, 160, 120);
        var state = estimateFaceDistance(fd);

        if (state === 'too_far') {
            instruction.textContent = 'Move closer to the camera';
            instruction.className = 'text-warning';
            if (dcLastSpoken !== 'closer') { speakText('Move closer'); dcLastSpoken = 'closer'; }
        } else if (state === 'too_close') {
            instruction.textContent = 'Move back from the camera';
            instruction.className = 'text-warning';
            if (dcLastSpoken !== 'back') { speakText('Move back'); dcLastSpoken = 'back'; }
        } else {
            instruction.textContent = 'Don\'t move';
            instruction.className = 'text-success';
            if (dcLastSpoken !== 'dontmove') { speakText('Don\'t move'); dcLastSpoken = 'dontmove'; }
            clearInterval(dcInterval);
            setTimeout(function () {
                onReady();
            }, 800);
        }
    }, 600);
}

function estimateFaceDistance(imageData) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    var cropW = Math.floor(w * 0.6);
    var cropH = Math.floor(h * 0.6);
    var startX = Math.floor((w - cropW) / 2);
    var startY = Math.floor((h - cropH) / 2);
    var skinPixels = 0;
    var total = 0;

    for (var y = startY; y < startY + cropH; y++) {
        for (var x = startX; x < startX + cropW; x++) {
            var idx = (y * w + x) * 4;
            var r = data[idx];
            var g = data[idx + 1];
            var b = data[idx + 2];
            total++;
            if (r > 70 && r > g && r > b && (r - g) > 10) {
                skinPixels++;
            }
        }
    }

    var ratio = skinPixels / total;
    if (ratio > 0.4) return 'too_close';
    if (ratio < 0.08) return 'too_far';
    return 'good';
}

function finalizeLiveness(voter, stream, statusEl, retryBtn, capturedFrames, motionDetected) {
    cleanupStream(stream);
    var video = document.getElementById('verifyVideo');
    video.style.display = 'none';

    var center = capturedFrames['center'];
    if (!center) {
        statusEl.textContent = 'Failed to capture face. Please retry.';
        statusEl.className = 'face-status text-danger';
        retryBtn.style.display = 'inline-block';
        retryBtn.onclick = function () { startFaceVerification(voter); };
        showToast('Failed to capture face. Please retry.', 'error');
        return;
    }

    if (!motionDetected) {
        statusEl.textContent = 'Liveness check failed: no movement detected. Please retry.';
        statusEl.className = 'face-status text-danger';
        retryBtn.style.display = 'inline-block';
        retryBtn.onclick = function () { startFaceVerification(voter); };
        showToast('No movement detected during liveness check.', 'error');
        return;
    }

    statusEl.textContent = 'Verifying';
    statusEl.className = 'face-status text-muted';

    var dots = 0;
    var dotInterval = setInterval(function () {
        dots = (dots + 1) % 4;
        statusEl.textContent = 'Verifying' + '.'.repeat(dots);
    }, 800);

    var verifyDelay = deviceType === 'mobile' ? 5000 : 10000;

    setTimeout(function () {
        clearInterval(dotInterval);
        var descriptor, storedDescriptor;
        try {
            descriptor = computeSimpleDescriptor(center.imageData);
        } catch (e) {
            statusEl.textContent = 'Failed to process face image. Please retry.';
            statusEl.className = 'face-status text-danger';
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = function () { startFaceVerification(voter); };
            return;
        }

        try {
            storedDescriptor = JSON.parse(voter.face_descriptor || '[]');
        } catch (e) {
            storedDescriptor = [];
        }

        if (storedDescriptor.length === 0) {
            statusEl.textContent = 'No registered face data found for this voter. Contact admin.';
            statusEl.className = 'face-status text-danger';
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = function () { startFaceVerification(voter); };
            showToast('No face data registered for this voter.', 'error');
            return;
        }

        var distance = 0;
        for (var i = 0; i < Math.min(descriptor.length, storedDescriptor.length); i++) {
            distance += Math.pow(descriptor[i] - storedDescriptor[i], 2);
        }
        distance = Math.sqrt(distance);

        var threshold = 25;
        if (distance <= threshold) {
            statusEl.textContent = 'Face verified! Liveness confirmed.';
            statusEl.className = 'face-status text-success';
            currentFaceDescriptor = JSON.stringify(descriptor);
            showToast('Face verified successfully!', 'success');
            setTimeout(function () {
                proceedToVoting(voter);
            }, 1000);
        } else {
            statusEl.textContent = 'Face mismatch (distance: ' + distance.toFixed(3) + '). Try again.';
            statusEl.className = 'face-status text-danger';
            retryBtn.style.display = 'inline-block';
            retryBtn.onclick = function () { startFaceVerification(voter); };
            showToast('Face did not match. Please try again.', 'error');
        }
    }, verifyDelay);
}

function computeFrameDifference(a, b) {
    var dataA = a.data, dataB = b.data;
    var totalDiff = 0, samples = 0;
    for (var i = 0; i < dataA.length; i += 16) {
        totalDiff += Math.abs(dataA[i] - dataB[i]);
        samples++;
    }
    return totalDiff / samples;
}

function updateLivenessStepUI(step, state) {
    document.querySelectorAll('.liveness-step').forEach(function (s) {
        if (s.dataset.step === step) {
            s.className = 'liveness-step ' + state;
        }
    });
}

function cleanupStream(stream) {
    if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
    }
}

function computeSimpleDescriptor(imageData) {
    var data = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    var features = [];
    var blockSize = 24;
    var cols = Math.floor(w / blockSize);
    var rows = Math.floor(h / blockSize);

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (var y = row * blockSize; y < (row + 1) * blockSize && y < h; y++) {
                for (var x = col * blockSize; x < (col + 1) * blockSize && x < w; x++) {
                    var idx = (y * w + x) * 4;
                    rSum += data[idx];
                    gSum += data[idx + 1];
                    bSum += data[idx + 2];
                    count++;
                }
            }
            features.push(rSum / count / 255);
            features.push(gSum / count / 255);
            features.push(bSum / count / 255);
        }
    }

    var mean = features.reduce(function (a, b) { return a + b; }, 0) / features.length;
    var std = Math.sqrt(features.reduce(function (sq, v) { return sq + Math.pow(v - mean, 2); }, 0) / features.length) || 1;
    return features.map(function (v) { return (v - mean) / std; });
}

function proceedToVoting(voter) {
    currentVoter = voter;
    document.getElementById('voterSection').style.display = 'none';
    document.getElementById('faceVerifySection').style.display = 'none';
    document.getElementById('votingSection').style.display = 'block';
    loadPositions();
    setTimeout(function () {
        scrollTo(document.getElementById('votingSection'));
    }, 300);
}

function loadPositions() {
    selections = {};
    positionNames = {};
    fetch(API_BASE + '/api/settings.php')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.positions) {
                document.getElementById('positionsContainer').innerHTML = '<p class="text-muted">No positions available.</p>';
                return;
            }
            var positions = data.positions;
            var container = document.getElementById('positionsContainer');
            container.innerHTML = '';
            totalPositions = positions.length;
            positions.forEach(function (p) { positionNames[p.id] = p.name; });

            fetch(API_BASE + '/api/candidates.php')
                .then(function (r) { return r.json(); })
                .then(function (cData) {
                    var allCandidates = (cData.candidates || []);
                    var candidatesByPos = {};
                    allCandidates.forEach(function (c) {
                        if (!candidatesByPos[c.position_id]) candidatesByPos[c.position_id] = [];
                        candidatesByPos[c.position_id].push(c);
                    });

                    positions.forEach(function (pos) {
                        var candidates = candidatesByPos[pos.id] || [];
                        if (selectedLocation) {
                            candidates = candidates.filter(function (c) {
                                var loc = (c.location || '').toLowerCase();
                                var level = (c.level || '').toLowerCase();
                                if (level === 'national (kenya)' || level === 'national') return true;
                                return loc.indexOf(selectedLocation.toLowerCase()) !== -1;
                            });
                        }
                        var div = document.createElement('div');
                        div.className = 'card';
                        div.id = 'position-card-' + pos.id;
                        var candidatesHtml = '';
                        if (candidates.length === 0) {
                            candidatesHtml = '<p class="text-muted">No candidates for this position in your selected location.</p>';
                        } else {
                            candidatesHtml = candidates.map(function (c) {
                                var photoImg = c.photo_url ? '<div class="cand-photo-wrap"><img src="' + c.photo_url + '" class="cand-photo-vote"></div>' : '';
                                var symbolImg = c.party_symbol ? '<div class="cand-symbol-wrap"><img src="' + c.party_symbol + '" class="cand-symbol-vote"></div>' : '';
                                return '<div class="candidate-option" data-pos="' + pos.id + '" data-cand="' + c.id + '" onclick="selectCandidate(' + pos.id + ', ' + c.id + ', \'' + escJsStr(c.name) + '\')">' +
                                    photoImg + symbolImg +
                                    '<div class="candidate-info">' +
                                    '<strong>' + escHtml(c.name) + '</strong>' +
                                    (c.party ? '<span class="party-tag">' + escHtml(c.party) + '</span>' : '') +
                                    '</div>' +
                                    '<div class="vote-radio"></div>' +
                                    '</div>';
                            }).join('');
                        }
                        div.innerHTML = '<div class="position-vote-header">' +
                            '<h2>' + escHtml(pos.name) + '</h2>' +
                            '<span class="pos-selected" id="posSelected-' + pos.id + '"></span>' +
                            '</div>' +
                            '<div class="candidates-list" id="candidates-' + pos.id + '">' +
                            candidatesHtml +
                            '</div>';
                        container.appendChild(div);
                    });
                })
                .catch(function () {
                    document.getElementById('positionsContainer').innerHTML = '<p class="text-danger">Failed to load candidates.</p>';
                });
        })
        .catch(function () {
            document.getElementById('positionsContainer').innerHTML = '<p class="text-danger">Failed to load positions.</p>';
        });
}

function selectCandidate(positionId, candidateId, candidateName) {
    selections[positionId] = { candidateId, candidateName };

    const list = document.getElementById('candidates-' + positionId);
    if (list) {
        list.querySelectorAll('.candidate-option').forEach(el => {
            const isSelected = parseInt(el.dataset.cand) === candidateId;
            el.classList.toggle('selected', isSelected);
        });
    }

    const selLabel = document.getElementById('posSelected-' + positionId);
    if (selLabel) {
        selLabel.textContent = 'Selected: ' + candidateName;
        selLabel.className = 'pos-selected selected-label';
    }

    updateSubmitBar();
}

function updateSubmitBar() {
    const bar = document.getElementById('submitBar');
    const count = document.getElementById('selectionCount');
    const selected = Object.keys(selections).length;
    var remaining = totalPositions - selected;

    if (selected > 0) {
        bar.style.display = 'flex';
        count.textContent = selected + ' of ' + totalPositions + ' positions selected';
        var submitBtn = document.getElementById('reviewBtn');
        if (selected === totalPositions) {
            submitBtn.disabled = false;
            submitBtn.title = '';
            count.style.color = 'var(--success)';
        } else {
            submitBtn.disabled = true;
            submitBtn.title = 'Select candidates for all ' + totalPositions + ' positions to proceed';
            count.style.color = 'var(--warning)';
        }
    } else {
        bar.style.display = 'none';
    }
}

function openSummaryModal() {
    var selected = Object.keys(selections).length;
    if (selected === 0) return;

    if (selected < totalPositions) {
        var missing = totalPositions - selected;
        showToast('Please select candidates for all ' + totalPositions + ' positions (' + missing + ' remaining).', 'warning');
        var missingPositions = [];
        document.querySelectorAll('.position-vote-header').forEach(function (header) {
            var posCard = header.closest('.card');
            if (posCard) {
                var posId = posCard.id ? posCard.id.replace('position-card-', '') : null;
                if (posId && !selections[posId]) {
                    missingPositions.push(header.querySelector('h2') ? header.querySelector('h2').textContent : 'a position');
                    posCard.style.border = '2px solid var(--danger)';
                    posCard.style.animation = 'shake 0.5s ease';
                    setTimeout(function () {
                        posCard.style.border = '';
                        posCard.style.animation = '';
                    }, 2000);
                }
            }
        });
        return;
    }

    const list = document.getElementById('summaryList');
    const entries = Object.entries(selections);

    list.innerHTML = entries.map(([posId, sel]) =>
        '<div class="summary-item">' +
        '<span class="summary-position">' + escHtml(positionNames[posId] || 'Position') + '</span>' +
        '<span class="summary-candidate"><strong>' + escHtml(sel.candidateName) + '</strong></span>' +
        '</div>'
    ).join('');

    document.getElementById('voteMsg').style.display = 'none';
    document.getElementById('summaryModal').style.display = 'flex';
}

function closeSummaryModal() {
    document.getElementById('summaryModal').style.display = 'none';
}

function scrollTo(el) {
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: top, behavior: 'smooth' });
}

function getDeviceInfo() {
    var info = navigator.userAgent;
    if (navigator.platform) info += ' | Platform: ' + navigator.platform;
    if (navigator.language) info += ' | Lang: ' + navigator.language;
    if (screen.width && screen.height) info += ' | Screen: ' + screen.width + 'x' + screen.height;
    return info;
}

function submitAllVotes() {
    if (!currentVoter) return;
    const msg = document.getElementById('voteMsg');

    const votes = Object.entries(selections).map(([posId, sel]) => ({
        candidate_id: sel.candidateId,
        position_id: parseInt(posId)
    }));

    var submitData = {
        voter_id: currentVoter.id,
        votes: votes,
        device_info: getDeviceInfo()
    };
    if (currentFaceDescriptor) {
        submitData.face_descriptor = currentFaceDescriptor;
    }

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(function (pos) {
            submitData.location_lat = pos.coords.latitude;
            submitData.location_lng = pos.coords.longitude;
            sendVotes(submitData, msg);
        }, function () {
            sendVotes(submitData, msg);
        }, { timeout: 5000, enableHighAccuracy: true });
    } else {
        sendVotes(submitData, msg);
    }
}

function sendVotes(submitData, msg) {
    fetch(API_BASE + '/api/vote.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
    })
    .then(r => r.json())
    .then(data => {
        msg.style.display = 'block';
        if (data.success) {
            msg.className = 'text-success mt-2';
            msg.textContent = 'All votes cast successfully!';
            setTimeout(() => {
                closeSummaryModal();
                document.getElementById('submitBar').style.display = 'none';
                document.getElementById('positionsContainer').style.display = 'none';
                document.getElementById('votingSection').querySelector('.page-header').style.display = 'none';
                document.getElementById('votedBanner').style.display = 'block';
            }, 1000);
        } else {
            msg.className = 'text-danger mt-2';
            msg.textContent = data.message;
        }
    })
    .catch(() => {
        msg.style.display = 'block';
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Connection error.';
    });
}

function resetVoter() {
    currentVoter = null;
    selections = {};
    currentFaceDescriptor = null;
    document.getElementById('voterSection').style.display = 'block';
    document.getElementById('faceVerifySection').style.display = 'none';
    document.getElementById('votingSection').style.display = 'none';
    document.getElementById('votedBanner').style.display = 'none';
    document.getElementById('positionsContainer').style.display = 'block';
    document.getElementById('submitBar').style.display = 'none';
    document.getElementById('votingSection').querySelector('.page-header').style.display = 'block';
    document.getElementById('registerForm').reset();
    document.getElementById('registerMsg').style.display = 'none';
    document.getElementById('voterLookupResult').style.display = 'none';
    document.getElementById('livenessProgress').style.display = 'none';
    document.querySelector('#registerForm .btn-primary').disabled = false;
    document.querySelector('#registerForm .btn-primary').textContent = 'Verify & Start Voting';
    const video = document.getElementById('verifyVideo');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(function (t) { t.stop(); });
        video.srcObject = null;
    }
}

function formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleString();
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function escJsStr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function toggleNav() {
    document.querySelector('.nav-links').classList.toggle('open');
}

function searchLocation() {
    var input = document.getElementById('locationSearchInput').value.trim();
    var county = document.getElementById('locationSearchCounty').value;
    var conEl = document.getElementById('locationSearchConstituency');
    var constituency = conEl ? conEl.value : '';
    var wardEl = document.getElementById('locationSearchWard');
    var ward = wardEl ? wardEl.value : '';
    var btn = document.querySelector('.location-search-box .btn-primary');
    var origText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span>';
    }

    var query = [];
    if (input) query.push('q=' + encodeURIComponent(input));
    if (county) query.push('county=' + encodeURIComponent(county));
    if (constituency) query.push('constituency=' + encodeURIComponent(constituency));
    if (ward) query.push('ward=' + encodeURIComponent(ward));

    var url = API_BASE + '/api/search_location.php' + (query.length ? '?' + query.join('&') : '');

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (btn) { btn.disabled = false; btn.innerHTML = origText || '<strong>Search</strong>'; }
            var el = document.querySelector('.location-search-container .location-results');
            var container = el;
            if (!container) {
                container = document.createElement('div');
                container.className = 'location-results';
                document.querySelector('.location-search-container .card').appendChild(container);
            }
            if (!data.success || !data.candidates || data.candidates.length === 0) {
                container.innerHTML = '';
                return;
            }
            var html = '<div class="location-results-count">Found ' + data.candidates.length + ' candidate(s)</div>';
            data.candidates.forEach(function (c) {
                html += '<div class="location-result-item">' +
                    '<span class="lr-candidate"><strong>' + escHtml(c.name) + '</strong></span>' +
                    '<span class="lr-position">' + escHtml(c.position_name) + '</span>' +
                    '<span class="lr-party">' + escHtml(c.party || '') + '</span>' +
                    '<span class="lr-location">' + escHtml(c.location || '') + '</span>' +
                    '</div>';
            });
            container.innerHTML = html;
        })
        .catch(function (err) {
            if (btn) { btn.disabled = false; btn.innerHTML = origText || '<strong>Search</strong>'; }
            showToast('Failed to search locations.', 'error');
        });
}

function populateSearchConstituencies() {
    var county = document.getElementById('locationSearchCounty').value;
    var conSelect = document.getElementById('locationSearchConstituency');
    var wardSelect = document.getElementById('locationSearchWard');
    if (!county) {
        conSelect.style.display = 'none';
        conSelect.value = '';
        wardSelect.style.display = 'none';
        wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
        return;
    }
    var cons = CONSTITUENCIES[county] || [];
    conSelect.innerHTML = '<option value="">-- All Constituencies --</option>';
    cons.forEach(function (c) {
        conSelect.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
    conSelect.style.display = 'block';
    wardSelect.style.display = 'none';
    wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
}

function populateSearchWards() {
    var constituency = document.getElementById('locationSearchConstituency').value;
    var wardSelect = document.getElementById('locationSearchWard');
    if (!constituency) {
        wardSelect.style.display = 'none';
        wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
        return;
    }
    var wards = WARDS[constituency] || [];
    wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
    wards.forEach(function (w) {
        wardSelect.innerHTML += '<option value="' + w.replace(/"/g, '&quot;') + '">' + escHtml(w) + '</option>';
    });
    wardSelect.style.display = 'block';
}

var CONSTITUENCIES = {
    'Baringo': ['Baringo Central','Baringo North','Baringo South','Eldama Ravine','Mogotio','Tiaty'],
    'Bungoma': ['Bumula','Kabuchai','Kanduyi','Kimilili','Mt. Elgon','Sirisia','Tongaren','Webuye East','Webuye West'],
    'Busia': ['Budalangi','Bunyala','Butula','Funyula','Nambale','Teso North','Teso South'],
    'Bomet': ['Bomet Central','Bomet East','Chepalungu','Konoin','Sotik'],
    'Elgeyo Marakwet': ['Keiyo North','Keiyo South','Marakwet East','Marakwet West'],
    'Embu': ['Embu West (Mbeere North)','Embu North (Manyatta)','Runyenjes','Mbeere South'],
    'Garissa': ['Balambala','Dadaab','Fafi','Garissa Township','Ijara','Lagdera'],
    'Homa Bay': ['Homa Bay Town','Kabondo Kasipul','Karachuonyo','Kasipul','Rangwe','Ndhiwa','Suba North','Suba South'],
    'Isiolo': ['Isiolo North','Isiolo South','Garba Tulla'],
    'Kajiado': ['Kajiado Central','Kajiado East','Kajiado North','Kajiado South','Kajiado West'],
    'Kakamega': ['Butere','Khwisero','Likuyani','Lugari','Lurambi','Malava','Matungu','Mumias East','Mumias West','Navakholo','Shinyalu','Ikolomani'],
    'Kericho': ['Ainamoi','Belgut','Bureti','Kipkelion East','Kipkelion West','Sigowet–Soin'],
    'Kiambu': ['Gatundu North','Gatundu South','Githunguri','Juja','Kabete','Kiambaa','Kiambu','Kikuyu','Lari','Limuru','Ruiru','Thika Town'],
    'Kilifi': ['Ganze','Kaloleni','Kilifi North','Kilifi South','Magarini','Malindi','Rabai'],
    'Kirinyaga': ['Gichugu','Kirinyaga Central','Mwea','Ndia'],
    'Kisii': ['Bobasi','Bomachoge Borabu','Bomachoge Chache','Bonchari','Kitutu Chache North','Kitutu Chache South','Nyaribari Chache','Nyaribari Masaba','South Mugirango'],
    'Kisumu': ['Kisumu Central','Kisumu East','Kisumu West','Muhoroni','Nyando','Nyakach','Seme'],
    'Kitui': ['Kitui Central','Kitui East','Kitui Rural','Kitui South','Kitui West','Mwingi Central','Mwingi North','Mwingi West'],
    'Kwale': ['Kinango','Lunga Lunga','Matuga','Msambweni'],
    'Laikipia': ['Laikipia East','Laikipia North','Laikipia West'],
    'Lamu': ['Lamu East','Lamu West'],
    'Machakos': ['Kathiani','Kangundo','Machakos Town','Masinga','Matungulu','Mavoko','Mwala','Yatta'],
    'Makueni': ['Kaiti','Kibwezi East','Kibwezi West','Kilome','Makueni','Mbooni'],
    'Mandera': ['Banissa','Lafey','Mandera East','Mandera North','Mandera South','Mandera West'],
    'Marsabit': ['Laisamis','Moyale','North Horr','Saku'],
    'Meru': ['Buuri','Central Imenti','Igembe Central','Igembe North','Igembe South','North Imenti','South Imenti','Tigania East','Tigania West'],
    'Migori': ['Awendo','Kuria East','Kuria West','Migori','Nyatike','Rongo','Suna East','Suna West'],
    'Mombasa': ['Changamwe','Jomvu','Kisauni','Likoni','Mvita','Nyali'],
    'Murang\'a': ['Gatanga','Kandara','Kangema','Kigumo','Kiharu','Maragwa','Mathioya'],
    'Nairobi': ['Dagoretti North','Dagoretti South','Embakasi Central','Embakasi East','Embakasi North','Embakasi South','Embakasi West','Kamukunji','Kasarani','Kibra',"Lang'ata",'Makadara','Mathare','Roysambu','Ruaraka','Starehe','Westlands'],
    'Nakuru': ['Bahati','Gilgil','Kuresoi North','Kuresoi South','Molo','Naivasha','Nakuru Town East','Nakuru Town West','Njoro','Rongai','Subukia'],
    'Nandi': ['Aldai','Chesumei','Emgwen','Mosop','Nandi Hills','Tinderet'],
    'Narok': ['Emurua Dikirr','Kilgoris','Narok East','Narok North','Narok South','Narok West'],
    'Nyamira': ['Borabu','Kitutu Masaba','West Mugirango','North Mugirango'],
    'Nyandarua': ['Kinangop','Kipipiri','Ndaragwa','Ol Kalou','Ol Joro Orok'],
    'Nyeri': ['Kieni','Mathira','Mukurweini','Nyeri Town','Othaya','Tetu'],
    'Samburu': ['Samburu East','Samburu North','Samburu West'],
    'Siaya': ['Alego Usonga','Bondo','Gem','Rarieda','Ugenya','Ugunja'],
    'Taita Taveta': ['Mwatate','Taveta','Voi','Wundanyi'],
    'Tana River': ['Bura','Galole','Garsen'],
    'Tharaka Nithi': ["Chuka/Igambang'ombe",'Maara','Tharaka'],
    'Trans Nzoia': ['Cherangany','Endebess','Kwanza','Saboti','Kiminini'],
    'Turkana': ['Loima','Turkana Central','Turkana East','Turkana North','Turkana South','Turkana West'],
    'Uasin Gishu': ['Ainabkoi','Kapseret','Kesses','Moiben','Soy','Turbo'],
    'Vihiga': ['Emuhaya','Hamisi','Luanda','Sabatia','Vihiga'],
    'Wajir': ['Eldas','Tarbaj','Wajir East','Wajir North','Wajir South','Wajir West'],
    'West Pokot': ['Kacheliba','Kapenguria','Pokot South','Sigor']
};

var WARDS = {
    'Ainabkoi': ['Kapsoya', 'Kaptagat', 'Ainabkoi/Olare'],
    'Ainamoi': ['Kapsoit', 'Ainamoi', 'Kapkugerwet', 'Kipchebor', 'Kipchimchim', 'Kapsaos'],
    'Aldai': ['Kabwareng', 'Terik', 'Kemeloi-Maraba', 'Kobujoi', 'Kaptumo-Kaboi', 'Koyo-Ndurio'],
    'Alego Usonga': ['Usonga', 'West Alego', 'Central Alego', 'Siaya Township', 'North Alego', 'South East Alego'],
    'Awendo': ['North Sakwa', 'South Sakwa', 'West Sakwa', 'Central Sakwa'],
    'Bahati': ['Dundori', 'Kabatini', 'Kiamaina', 'Lanet/Umoja', 'Bahati'],
    'Balambala': ['Balambala', 'Danyere', 'Jara Jara', 'Saka', 'Sankuri'],
    'Banissa': ['Banissa', 'Derkhale', 'Guba', 'Malkamari', 'Kiliwehiri'],
    'Baringo Central': ['Kabarnet', 'Sacho', 'Tenges', 'Ewalel Chapchap', 'Kapropita'],
    'Baringo North': ['Barwessa', 'Kabartonjo', 'Saimo/Kipsaraman', 'Saimo/Soi', 'Bartabwa'],
    'Baringo South': ['Marigat', 'Ilchamus', 'Mochongoi', 'Mukutani'],
    'Belgut': ['Waldai', 'Kabianga', 'Cheptororiet/Seretut', 'Chaik', 'Kapsuser'],
    'Bobasi': ['Masige West', 'Masige East', 'Bobasi Central', 'Nyacheki', 'Bobasi Bogetaorio', 'Bobasi Chache', 'Sameta/Mokwerero', 'Bobasi Boitangare'],
    'Bomachoge Borabu': ['Bombaba Borabu', 'Boochi Borabu', 'Bokimonge', 'Magenche'],
    'Bomachoge Chache': ['Majoge', 'Boochi/Tendere', 'Bosoti/Sengera'],
    'Bomet Central': ['Silibwet Township', 'Ndaraweta', 'Singorwet', 'Chesoen', 'Mutarakwa'],
    'Bomet East': ['Merigi', 'Kembu', 'Longisa', 'Kipreres', 'Chemaner'],
    'Bonchari': ['Bomariba', 'Bogiakumu', 'Bomorenda', 'Riana'],
    'Bondo': ['West Yimbo', 'Central Sakwa', 'South Sakwa', 'Yimbo East', 'West Sakwa', 'North Sakwa'],
    'Borabu': ['Mekenene', 'Kiabonyoru', 'Nyansiongo', 'Esise'],
    'Budalangi': ['Bunyala Central', 'Bunyala North', 'Bunyala West', 'Bunyala South'],
    'Bumula': ['South Bukusu', 'Bumula', 'Khasoko', 'Kabula', 'Kimaeti', 'West Bukusu', 'Siboti'],
    'Bunyala': ['Bukhayo West', 'Mayenje', 'Matayos South', 'Busibwabo', 'Burumba'],
    'Bura': ['Chewele', 'Bura', 'Bangale', 'Sala', 'Madogo'],
    'Bureti': ['Kisiara', 'Tebesonik', 'Cheboin', 'Chemosot', 'Litein', 'Cheplanget', 'Kapkatet'],
    'Butere': ['Marama West', 'Marama Central', 'Marenyo - Shianda', 'Marama North', 'Marama South'],
    'Butula': ['Marachi West', 'Kingandole', 'Marachi Central', 'Marachi East', 'Marachi North', 'Elugulu'],
    'Buuri': ['Timau', 'Kisima', 'Kiirua/Naari', 'Ruiri/Rwarera', 'Kibirichia'],
    'Central Imenti': ['Mwanganthia', 'Abothuguchi Central', 'Abothuguchi West', 'Kiagu'],
    'Changamwe': ['Port Reitz', 'Kipevu', 'Airport', 'Changamwe', 'Chaani'],
    'Chepalungu': ['Kong\'Asis', 'Nyangores', 'Sigor', 'Chebunyo', 'Siongiroi'],
    'Cherangany': ['Sinyerere', 'Makutano', 'Kaplamai', 'Motosiet', 'Cherangany/Suwerwa', 'Chepsiro/Kiptoror', 'Sitatunga'],
    'Chesumei': ['Chemundu/Kapng\'Etuny', 'Kosirai', 'Lelmokwo/Ngechek', 'Kaptel/Kamoiywo', 'Kiptuya'],
    'Chuka/Igambang\'ombe': ['Mariani', 'Karingani', 'Magumoni', 'Mugwe', 'Igambang\'ombe'],
    'Dadaab': ['Dertu', 'Dadaab', 'Labasigale', 'Damajale', 'Liboi', 'Abakaile'],
    'Dagoretti North': ['Kilimani', 'Kawangware', 'Gatina', 'Kileleshwa', 'Kabiro'],
    'Dagoretti South': ['Mutuini', 'Ngando', 'Riruta', 'Uthiru/Ruthimitu', 'Waithaka'],
    'Eldama Ravine': ['Lembus', 'Lembus Kwen', 'Ravine', 'Mumberes/Maji Mazuri', 'Lembus/Perkerra', 'Koibatek'],
    'Eldas': ['Eldas', 'Della', 'Lakoley South/Basir', 'Elnur/Tula Tula'],
    'Embakasi Central': ['Kayole North', 'Kayole Central', 'Kayole South', 'Komarock', 'Matopeni'],
    'Embakasi East': ['Upper Savannah', 'Lower Savannah', 'Embakasi', 'Utawala', 'Mihango'],
    'Embakasi North': ['Kariobangi North', 'Dandora Area I', 'Dandora Area II', 'Dandora Area III', 'Dandora Area IV'],
    'Embakasi South': ['Imara Daima', 'Kwa Njenga', 'Kwa Reuben', 'Pipeline', 'Kware'],
    'Embakasi West': ['Umoja I', 'Umoja II', 'Mowlem', 'Kariobangi South'],
    'Embu North (Manyatta)': ['Ruguru/Ngandori', 'Kithimu', 'Nginda', 'Mbeti North', 'Kirimari', 'Gaturi South'],
    'Emgwen': ['Chepkumia', 'Kapkangani', 'Kapsabet', 'Kilibwoni'],
    'Emuhaya': ['North East Bunyore', 'Central Bunyore', 'West Bunyore'],
    'Emurua Dikirr': ['Ilkerin', 'Ololmasani', 'Mogondo', 'Kapsasian'],
    'Endebess': ['Chepchoina', 'Endebess', 'Matumbei'],
    'Fafi': ['Bura', 'Dekaharia', 'Jarajila', 'Fafi', 'Nanighi'],
    'Funyula': ['Namboboto Nambuku', 'Nangina', 'Ageng\'a Nanguba', 'Bwiri'],
    'Galole': ['Kinakomba', 'Mikinduni', 'Chewani', 'Wayu'],
    'Ganze': ['Ganze', 'Bamba', 'Jaribuni', 'Sokoke'],
    'Garba Tulla': [],
    'Garissa Township': ['Waberi', 'Galbet', 'Township', 'Iftin'],
    'Garsen': ['Kipini East', 'Garsen South', 'Kipini West', 'Garsen Central', 'Garsen West', 'Garsen North'],
    'Gatanga': ['Ithanga', 'Kakuzi/Mitubiri', 'Mugumo-Ini', 'Kihumbu-Ini', 'Gatanga', 'Kariara'],
    'Gatundu North': ['Gituamba', 'Githobokoni', 'Chania', 'Mang\'U'],
    'Gatundu South': ['Kiamwangi', 'Kiganjo', 'Ndarugu', 'Ngenda'],
    'Gem': ['North Gem', 'West Gem', 'Central Gem', 'Yala Township', 'East Gem', 'South Gem'],
    'Gichugu': ['Kabare', 'Baragwi', 'Njukiini', 'Ngariama', 'Karumandi'],
    'Gilgil': ['Gilgil', 'Elementaita', 'Mbaruk/Eburu', 'Malewa West', 'Murindati'],
    'Githunguri': ['Githunguri', 'Githiga', 'Ikinu', 'Ngewa', 'Komothai'],
    'Hamisi': ['Shiru', 'Muhudu', 'Shamakhokho', 'Gisambai', 'Banja', 'Tambua', 'Jepkoyai'],
    'Homa Bay Town': ['Homa Bay Central', 'Homa Bay Arujo', 'Homa Bay West', 'Homa Bay East'],
    'Igembe Central': ['Akirang\'Ondu', 'Athiru Ruujine', 'Igembe East', 'Njia', 'Kangeta'],
    'Igembe North': ['Antuambui', 'Ntunene', 'Antubetwe Kiongo', 'Naathu', 'Amwathi'],
    'Igembe South': ['Maua', 'Kiegoi/Antubochiu', 'Athiru Gaiti', 'Akachiu', 'Kanuni'],
    'Ijara': ['Hulugho', 'Sangailu', 'Ijara', 'Masalani'],
    'Ikolomani': ['Idakho South', 'Idakho East', 'Idakho North', 'Idakho Central'],
    'Isiolo North': ['Wabera', 'Bulla Pesa', 'Chari', 'Cherab', 'Ngare Mara', 'Burat', 'Oldonyiro'],
    'Isiolo South': ['Garba Tulla', 'Kinna', 'Sericho'],
    'Jomvu': ['Jomvu Kuu', 'Miritini', 'Mikindani'],
    'Juja': ['Murera', 'Theta', 'Juja', 'Witeithie', 'Kalimoni'],
    'Kabete': ['Gitaru', 'Muguga', 'Nyadhuna', 'Kabete', 'Uthiru'],
    'Kabondo Kasipul': ['Kabondo East', 'Kabondo West', 'Kokwanyo/Kakelo', 'Kojwach'],
    'Kabuchai': ['Kabuchai/Chwele', 'West Nalondo', 'Bwake/Luuya', 'Mukuyuni'],
    'Kacheliba': ['Suam', 'Kodich', 'Kapckok', 'Kasei', 'Kiwawa', 'Alale'],
    'Kaiti': ['Ukia', 'Kee', 'Kilungu', 'Ilima'],
    'Kajiado Central': ['Purko', 'Ildamat', 'Dalalekutuk', 'Matapato North', 'Matapato South'],
    'Kajiado East': ['Kaputiei North', 'Kitengela', 'Oloosirkon/Sholinke', 'Kenyawa-Poka', 'Imaroro'],
    'Kajiado North': ['Olkeri', 'Ongata Rongai', 'Nkaimurunya', 'Oloolua', 'Ngong'],
    'Kajiado South': ['Entonet/Lenkisim', 'Mbirikani/Eselenkei', 'Kuku', 'Rombo', 'Kimana'],
    'Kajiado West': ['Keekonyokie', 'Iloodokilani', 'Magadi', 'Ewuaso Oonkidong\'I', 'Mosiro'],
    'Kaloleni': ['Mariakani', 'Kayafungo', 'Kaloleni', 'Mwanamwinga'],
    'Kamukunji': ['Pumwani', 'Eastleigh North', 'Eastleigh South', 'Airbase', 'California'],
    'Kandara': ['Ng\'Araria', 'Muruka', 'Kagundu-Ini', 'Gaichanjiru', 'Ithiru', 'Ruchu'],
    'Kanduyi': ['Bukembe West', 'Bukembe East', 'Township', 'Khalaba', 'Musikoma', 'East Sang\'Alo', 'Marakaru/Tuuti', 'Sang\'Alo West'],
    'Kangema': ['Kanyenyaini', 'Muguru', 'Rwathia'],
    'Kangundo': ['Kangundo North', 'Kangundo Central', 'Kangundo East', 'Kangundo West'],
    'Kapenguria': ['Riwo', 'Kapenguria', 'Mnagei', 'Siyoi', 'Endugh', 'Sook'],
    'Kapseret': ['Simat/Kapseret', 'Kipkenyo', 'Ngeria', 'Megun', 'Langas'],
    'Karachuonyo': ['West Karachuonyo', 'North Karachuonyo', 'Central', 'Kanyaluo', 'Kibiri', 'Wangchieng', 'Kendu Bay Town'],
    'Kasarani': ['Claycity', 'Mwiki', 'Kasarani', 'Njiru', 'Ruai'],
    'Kasipul': ['West Kasipul', 'South Kasipul', 'Central Kasipul', 'East Kamagak', 'West Kamagak'],
    'Kathiani': ['Mitaboni', 'Kathiani Central', 'Upper Kaewa/Iveti', 'Lower Kaewa/Kaani'],
    'Keiyo North': ['Emsoo', 'Kamariny', 'Kapchemutwa', 'Tambach'],
    'Keiyo South': ['Kaptarakwa', 'Chepkorio', 'Soy North', 'Soy South', 'Kabiemit', 'Metkei'],
    'Kesses': ['Racecourse', 'Cheptiret/Kipchamo', 'Tulwet/Chuiyat', 'Tarakwa'],
    'Khwisero': ['Kisa North', 'Kisa East', 'Kisa West', 'Kisa Central'],
    'Kiambaa': ['Cianda', 'Karuri', 'Ndenderu', 'Muchatha', 'Kihara'],
    'Kiambu': ['Ting\'Ang\'a', 'Ndumberi', 'Riabai', 'Township'],
    'Kibra': ['Laini Saba', 'Lindi', 'Makina', 'Woodley/Kenyatta Golf', 'Sarangombe'],
    'Kibwezi East': ['Masongaleni', 'Mtito Andei', 'Thange', 'Ivingoni/Nzambani'],
    'Kibwezi West': ['Makindu', 'Nguumo', 'Kikumbulyu North', 'Kikumbulyu South', 'Nguu/Masumba', 'Emali/Mulala'],
    'Kieni': ['Mweiga', 'Naromoru Kiamathaga', 'Mwiyogo/Endarasha', 'Mugunda', 'Gatarakwa', 'Thegu River', 'Kabaru', 'Gakawa'],
    'Kigumo': ['Kahumbu', 'Muthithi', 'Kigumo', 'Kangari', 'Kinyona'],
    'Kiharu': ['Wangu', 'Mugoiri', 'Mbiri', 'Township', 'Murarandia', 'Gaturi'],
    'Kikuyu': ['Karai', 'Nachu', 'Sigona', 'Kikuyu', 'Kinoo'],
    'Kilgoris': ['Kilgoris Central', 'Keyian', 'Angata Barikoi', 'Shankoe', 'Kimintet', 'Lolgorian'],
    'Kilifi North': ['Tezo', 'Sokoni', 'Kibarani', 'Dabaso', 'Matsangoni', 'Watamu', 'Mnarani'],
    'Kilifi South': ['Junju', 'Mwarakaya', 'Shimo la Tewa', 'Chasimba', 'Mtepeni'],
    'Kilome': ['Kasikeu', 'Mukaa', 'Kiima Kiu/Kalanzoni'],
    'Kimilili': ['Kimilili', 'Kibingei', 'Maeni', 'Kamukuywa'],
    'Kiminini': ['Kiminini', 'Waitaluk', 'Sirende', 'Hospital', 'Sikhendu', 'Nabiswa'],
    'Kinango': ['Nadavaya', 'Puma', 'Kinango', 'Mackinnon-Road', 'Chengoni/Samburu', 'Mwavumbo', 'Kasemeni'],
    'Kinangop': ['Engineer', 'Gathara', 'North Kinangop', 'Murungaru', 'Njabini\\Kiburu', 'Nyakio', 'Githabai', 'Magumu'],
    'Kipipiri': ['Wanjohi', 'Kipipiri', 'Geta', 'Githioro'],
    'Kipkelion East': ['Londiani', 'Kedowa/Kimugul', 'Chepseon', 'Tendeno/Sorget'],
    'Kipkelion West': ['Kunyak', 'Kamasian', 'Kipkelion', 'Chilchila'],
    'Kirinyaga Central': ['Mutira', 'Kanyeki-Ini', 'Kerugoya', 'Inoi'],
    'Kisauni': ['Mjambere', 'Junda', 'Bamburi', 'Mwakirunge', 'Mtopanga', 'Magogoni', 'Shanzu'],
    'Kisumu Central': ['Railways', 'Migosi', 'Shaurimoyo Kaloleni', 'Market Milimani', 'Kondele', 'Nyalenda B'],
    'Kisumu East': ['Kajulu', 'Kolwa East', 'Manyatta \'B\'', 'Nyalenda \'a\'', 'Kolwa Central'],
    'Kisumu West': ['South West Kisumu', 'Central Kisumu', 'Kisumu North', 'West Kisumu', 'North West Kisumu'],
    'Kitui Central': ['Miambani', 'Township', 'Kyangwithya West', 'Mulango', 'Kyangwithya East'],
    'Kitui East': ['Zombe/Mwitika', 'Chuluni', 'Nzambani', 'Voo/Kyamatu', 'Endau/Malalani', 'Mutito/Kaliku'],
    'Kitui Rural': ['Kisasi', 'Mbitini', 'Kwavonza/Yatta', 'Kanyangi'],
    'Kitui South': ['Ikanga/Kyatune', 'Mutomo', 'Mutha', 'Ikutha', 'Kanziko', 'Athi'],
    'Kitui West': ['Mutonguni', 'Kauwi', 'Matinyani', 'Kwa Mutonga/Kithumula'],
    'Kitutu Chache North': ['Monyerero', 'Sensi', 'Marani', 'Kegogi'],
    'Kitutu Chache South': ['Bogusero', 'Bogeka', 'Nyakoe', 'Kitutu Central', 'Nyatieko'],
    'Kitutu Masaba': ['Rigoma', 'Gachuba', 'Kemera', 'Magombo', 'Manga', 'Gesima'],
    'Konoin': ['Chepchabas', 'Kimulot', 'Mogogosiek', 'Boito', 'Embomos'],
    'Kuresoi North': ['Kiptororo', 'Nyota', 'Sirikwa', 'Kamara'],
    'Kuresoi South': ['Amalo', 'Keringet', 'Kiptagich', 'Tinet'],
    'Kuria East': ['Gokeharaka/Getambwega', 'Ntimaru West', 'Ntimaru East', 'Nyabasi East', 'Nyabasi West'],
    'Kuria West': ['Bukira East', 'Bukira Centrl/Ikerege', 'Isibania', 'Makerero', 'Masaba', 'Tagare', 'Nyamosense/Komosoko'],
    'Kwanza': ['Kapomboi', 'Kwanza', 'Keiyo', 'Bidii'],
    'Lafey': ['Libehia', 'Fino', 'Lafey', 'Warankara', 'Alungo Gof'],
    'Lagdera': ['Modogashe', 'Benane', 'Goreale', 'Maalimin', 'Sabena', 'Baraki'],
    'Laikipia East': ['Ngobit', 'Tigithi', 'Thingithu', 'Nanyuki', 'Umande'],
    'Laikipia North': ['Sosian', 'Segera', 'Mukogondo West', 'Mukogondo East'],
    'Laikipia West': ['Olmoran', 'Rumuruti Township', 'Kinamba', 'Marmanet', 'Igwamiti', 'Salama'],
    'Laisamis': ['Loiyangalani', 'Kargi/South Horr', 'Korr/Ngurunit', 'Log Logo', 'Laisamis'],
    'Lamu East': ['Faza', 'Kiunga', 'Basuba'],
    'Lamu West': ['Shella', 'Mkomani', 'Hindi', 'Mkunumbi', 'Hongwe', 'Witu', 'Bahari'],
    'Lang\'ata': ['Karen', 'Nairobi West', 'Mugumo-Ini', 'South-C', 'Nyayo Highrise'],
    'Lari': ['Kinale', 'Kijabe', 'Nyanduma', 'Kamburu', 'Lari/Kirenga'],
    'Likoni': ['Mtongwe', 'Shika Adabu', 'Bofu', 'Likoni', 'Timbwani'],
    'Likuyani': ['Likuyani', 'Sango', 'Kongoni', 'Nzoia', 'Sinoko'],
    'Limuru': ['Bibirioni', 'Limuru Central', 'Ndeiya', 'Limuru East', 'Ngecha Tigoni'],
    'Loima': ['Kotaruk/Lobei', 'Turkwel', 'Loima', 'Lokiriama/Lorengippi'],
    'Luanda': ['Luanda Township', 'Wemilabi', 'Mwibona', 'Luanda South', 'Emabungo'],
    'Lugari': ['Mautuma', 'Lugari', 'Lumakanda', 'Chekalini', 'Chevaywa', 'Lwandeti'],
    'Lunga Lunga': ['Pongwe/Kikoneni', 'Dzombo', 'Mwereni', 'Vanga'],
    'Lurambi': ['Butsotso East', 'Butsotso South', 'Butsotso Central', 'Sheywe', 'Mahiakalo', 'Shirere'],
    'Maara': ['Mitheru', 'Muthambi', 'Mwimbi', 'Ganga', 'Chogoria'],
    'Machakos Town': ['Kalama', 'Mua', 'Mutituni', 'Machakos Central', 'Mumbuni North', 'Muvuti/Kiima-Kimwe', 'Kola'],
    'Magarini': ['Marafa', 'Magarini', 'Gongoni', 'Adu', 'Garashi', 'Sabaki'],
    'Makadara': ['Makongeni', 'Maringo/Hamza', 'Harambee', 'Viwandani'],
    'Makueni': ['Wote', 'Muvau/Kikuumini', 'Mavindini', 'Kitise/Kithuki', 'Kathonzweni', 'Nzaui/Kilili/Kalamba', 'Mbitini'],
    'Malava': ['West Kabras', 'Chemuche', 'East Kabras', 'Butali/Chegulo', 'Manda-Shivanga', 'Shirugu-Mugai', 'South Kabras'],
    'Malindi': ['Jilore', 'Kakuyuni', 'Ganda', 'Malindi Town', 'Shella'],
    'Mandera East': ['Arabia', 'Bulla Mpya', 'Khalalio', 'Neboi', 'Township'],
    'Mandera North': ['Ashabito', 'Guticha', 'Morothile', 'Rhamu', 'Rhamu-Dimtu'],
    'Mandera South': ['Wargudud', 'Kutulo', 'Elwak South', 'Elwak North', 'Shimbir Fatuma'],
    'Mandera West': ['Takaba South', 'Takaba', 'Lag Sure', 'Dandu', 'Gither'],
    'Maragwa': ['Kimorori/Wempa', 'Makuyu', 'Kambiti', 'Kamahuha', 'Ichagaki', 'Nginda'],
    'Marakwet East': ['Kapyego', 'Sambirir', 'Endo', 'Embobut / Embulot'],
    'Marakwet West': ['Lelan', 'Sengwer', 'Cherang\'Any/Chebororwa', 'Moiben/Kuserwo', 'Kapsowar', 'Arror'],
    'Masinga': ['Kivaa', 'Masinga Central', 'Ekalakala', 'Muthesya', 'Ndithini'],
    'Mathare': ['Hospital', 'Mabatini', 'Huruma', 'Ngei', 'Mlango Kubwa', 'Kiamaiko'],
    'Mathioya': ['Gitugi', 'Kiru', 'Kamacharia'],
    'Mathira': ['Ruguru', 'Magutu', 'Iriaini', 'Konyu', 'Kirimukuyu', 'Karatina Town'],
    'Matuga': ['Tsimba Golini', 'Waa', 'Tiwi', 'Kubo South', 'Mkongani'],
    'Matungu': ['Koyonzo', 'Kholera', 'Khalaba', 'Mayoni', 'Namamali'],
    'Matungulu': ['Tala', 'Matungulu North', 'Matungulu East', 'Matungulu West', 'Kyeleni'],
    'Mavoko': ['Athi River', 'Kinanie', 'Muthwani', 'Syokimau/Mulolongo'],
    'Embu West (Mbeere North)': ['Nthawa', 'Muminji', 'Evurore'],
    'Mbeere South': ['Mwea', 'Makima', 'Mbeti South', 'Mavuria', 'Kiambere'],
    'Mbita': ['Mfangano Island', 'Rusinga Island', 'Kasgunga', 'Gembe', 'Lambwe'],
    'Mbooni': ['Tulimani', 'Mbooni', 'Kithungo/Kitundu', 'Kisau/Kiteta', 'Waia/Kako', 'Kalawa'],
    'Migori': ['West Kanyamkago', 'North Kanyamkago', 'Central Kanyamkago', 'South Kanyamkago', 'East Kanyamkago'],
    'Mogotio': ['Mogotio', 'Emining', 'Kisanana'],
    'Moiben': ['Tembelio', 'Sergoit', 'Karuna/Meibeki', 'Moiben', 'Kimumu'],
    'Molo': ['Mariashoni', 'Elburgon', 'Turi', 'Molo'],
    'Mosop': ['Chepterwai', 'Kipkaren', 'Kurgung/Surungai', 'Kabiyet', 'Ndalat', 'Kabisaga', 'Sangalo/Kebulonik'],
    'Moyale': ['Butiye', 'Sololo', 'Heilu-Manyatta', 'Golbo', 'Moyale Township', 'Uran', 'Obbu'],
    'Msambweni': ['Gombato Bongwe', 'Ukunda', 'Kinondo', 'Ramisi'],
    'Mt. Elgon': ['Cheptais', 'Chesikaki', 'Chepyuk', 'Kapkateny', 'Kaptama', 'Elgon'],
    'Muhoroni': ['Miwani', 'Ombeyi', 'Masogo/Nyang\'Oma', 'Chemelil', 'Muhoroni/Koru'],
    'Mukurweini': ['Gikondi', 'Rugi', 'Mukurwe-Ini West', 'Mukurwe-Ini Central'],
    'Mumias East': ['Lubinu/Lusheya', 'Isongo/Makunga/Malaha', 'East Wanga'],
    'Mumias West': ['Mumias Central', 'Mumias North', 'Etenje', 'Musanda'],
    'Mvita': ['Mji Wa Kale/Makadara', 'Tudor', 'Tononoka', 'Shimanzi/Ganjoni', 'Majengo'],
    'Mwala': ['Mbiuni', 'Makutano/ Mwala', 'Masii', 'Muthetheni', 'Wamunyu', 'Kibauni'],
    'Mwatate': ['Rong\'E', 'Mwatate', 'Bura', 'Chawia', 'Wusi/Kishamba'],
    'Mwea': ['Mutithi', 'Kangai', 'Thiba', 'Wamumu', 'Nyangati', 'Murinduko', 'Gathigiriri', 'Tebere'],
    'Mwingi Central': ['Central', 'Kivou', 'Nguni', 'Nuu', 'Mui', 'Waita'],
    'Mwingi North': ['Ngomeni', 'Kyuso', 'Mumoni', 'Tseikuru', 'Tharaka'],
    'Mwingi West': ['Kyome/Thaana', 'Nguutani', 'Migwani', 'Kiomo/Kyethani'],
    'Naivasha': ['Biashara', 'Hells Gate', 'Lakeview', 'Maai-Mahiu', 'Maiella', 'Olkaria', 'Naivasha East', 'Viwandani'],
    'Nakuru Town East': ['Biashara', 'Kivumbini', 'Flamingo', 'Menengai', 'Nakuru East'],
    'Nakuru Town West': ['Barut', 'London', 'Kaptembwo', 'Kapkures', 'Rhoda', 'Shaabab'],
    'Nambale': ['Nambale Township', 'Bukhayo North/Waltsi', 'Bukhayo East', 'Bukhayo Central'],
    'Nandi Hills': ['Nandi Hills', 'Chepkunyuk', 'Ol\'Lessos', 'Kapchorua'],
    'Narok East': ['Mosiro', 'Ildamat', 'Keekonyokie', 'Suswa'],
    'Narok North': ['Olpusimoru', 'Olokurto', 'Narok Town', 'Nkareta', 'Olorropil', 'Melili'],
    'Narok South': ['Majimoto/Naroosura', 'Ololulung\'A', 'Melelo', 'Loita', 'Sogoo', 'Sagamian'],
    'Narok West': ['Ilmotiok', 'Mara', 'Siana', 'Naikarra'],
    'Navakholo': ['Ingostse-Mathia', 'Shinoyi-Shikomari-', 'Bunyala West', 'Bunyala East', 'Bunyala Central'],
    'Ndaragwa': ['Leshau Pondo', 'Kiriita', 'Central', 'Shamata'],
    'Ndhiwa': ['Kwabwai', 'Kanyadoto', 'Kanyikela', 'North Kabuoch', 'Kabuoch South/Pala', 'Kanyamwa Kologi', 'Kanyamwa Kosewe'],
    'Ndia': ['Mukure', 'Kiine', 'Kariti'],
    'Njoro': ['Maunarok', 'Mauche', 'Kihingo', 'Nessuit', 'Lare', 'Njoro'],
    'North Horr': ['Illeret', 'North Horr', 'Dukana', 'Maikona', 'Turbi'],
    'North Imenti': ['Municipality', 'Ntima East', 'Ntima West', 'Nyaki West', 'Nyaki East'],
    'North Mugirango': ['Itibo', 'Bomwagamo', 'Bokeira', 'Magwagwa', 'Ekerenyo'],
    'Nyakach': ['South West Nyakach', 'North Nyakach', 'Central Nyakach', 'West Nyakach', 'South East Nyakach'],
    'Nyali': ['Frere Town', 'Ziwa la Ng\'Ombe', 'Mkomani', 'Kongowea', 'Kadzandani'],
    'Nyando': ['East Kano/Wawidhi', 'Awasi/Onjiko', 'Ahero', 'Kabonyo/Kanyagwal', 'Kobura'],
    'Nyaribari Chache': ['Bobaracho', 'Kisii Central', 'Keumbu', 'Kiogoro', 'Birongo', 'Ibeno'],
    'Nyaribari Masaba': ['Ichuni', 'Nyamasibi', 'Masimba', 'Gesusu', 'Kiamokama'],
    'Nyatike': ['Kachien\'G', 'Kanyasa', 'North Kadem', 'Macalder/Kanyarwanda', 'Kaler', 'Got Kachola', 'Muhuru'],
    'Nyeri Town': ['Kiganjo/Mathari', 'Rware', 'Gatitu/Muruguru', 'Ruring\'U', 'Kamakwa/Mukaro'],
    'Ol Joro Orok': ['Gathanji', 'Gatimu', 'Weru', 'Charagita'],
    'Ol Kalou': ['Karau', 'Kanjuiri Ridge', 'Mirangine', 'Kaimbaga', 'Rurii'],
    'Othaya': ['Mahiga', 'Iria-Ini', 'Chinga', 'Karima'],
    'Pokot South': ['Chepareria', 'Batei', 'Lelan', 'Tapach'],
    'Rabai': ['Mwawesa', 'Ruruma', 'Kambe/Ribe', 'Rabai/Kisurutini'],
    'Rangwe': ['West Gem', 'East Gem', 'Kagan', 'Kochia'],
    'Rarieda': ['East Asembo', 'West Asembo', 'North Uyoma', 'South Uyoma', 'West Uyoma'],
    'Rongai': ['Menengai West', 'Soin', 'Visoi', 'Mosop', 'Solai'],
    'Rongo': ['North Kamagambo', 'Central Kamagambo', 'East Kamagambo', 'South Kamagambo'],
    'Roysambu': ['Githurai', 'Kahawa West', 'Zimmerman', 'Roysambu', 'Kahawa'],
    'Ruaraka': ['Baba Dogo', 'Utalii', 'Mathare North', 'Lucky Summer', 'Korogocho'],
    'Ruiru': ['Gitothua', 'Biashara', 'Gatongora', 'Kahawa Sukari', 'Kahawa Wendani', 'Kiuu', 'Mwiki', 'Mwihoko'],
    'Runyenjes': ['Gaturi North', 'Kagaari South', 'Central Ward', 'Kagaari North', 'Kyeni North', 'Kyeni South'],
    'Sabatia': ['Lyaduywa/Izava', 'West Sabatia', 'Chavakali', 'North Maragoli', 'Wodanga', 'Busali'],
    'Saboti': ['Kinyoro', 'Matisi', 'Tuwani', 'Saboti', 'Machewa'],
    'Saku': ['Sagante/Jaldesa', 'Karare', 'Marsabit Central'],
    'Samburu East': ['Waso', 'Wamba West', 'Wamba East', 'Wamba North'],
    'Samburu North': ['El-Barta', 'Nachola', 'Ndoto', 'Nyiro', 'Angata Nanyokie', 'Baawa'],
    'Samburu West': ['Lodokejek', 'Suguta Marmar', 'Maralal', 'Loosuk', 'Poro'],
    'Seme': ['West Seme', 'Central Seme', 'East Seme', 'North Seme'],
    'Shinyalu': ['Isukha North', 'Murhanda', 'Isukha Central', 'Isukha South', 'Isukha East', 'Isukha West'],
    'Sigor': ['Sekerr', 'Masool', 'Lomut', 'Weiwei'],
    'Sigowet\u2013Soin': ['Sigowet', 'Kaplelartet', 'Soliat', 'Soin'],
    'Sirisia': ['Namwela', 'Malakisi/South Kulisiru', 'Lwandanyi'],
    'Sotik': ['Ndanai/Abosi', 'Chemagel', 'Kipsonoi', 'Kapletundo', 'Rongena/Manaret'],
    'South Imenti': ['Mitunguu', 'Igoji East', 'Igoji West', 'Abogeta East', 'Abogeta West', 'Nkuene'],
    'South Mugirango': ['Tabaka', 'Boikang\'A', 'Bogetenga', 'Borabu / Chitago', 'Moticho', 'Getenga'],
    'Soy': ['Moi\'S Bridge', 'Kapkures', 'Ziwa', 'Segero/Barsombe', 'Kipsomba', 'Soy', 'Kuinet/Kapsuswa'],
    'Starehe': ['Nairobi Central', 'Ngara', 'Ziwani/Kariokor', 'Pangani', 'Landimawe', 'Nairobi South'],
    'Suba North': ['Mfangano Island', 'Rusinga Island', 'Kasgunga', 'Gembe', 'Lambwe'],
    'Suba South': ['Gwassi South', 'Gwassi North', 'Kaksingri West', 'Ruma Kaksingri East'],
    'Subukia': ['Subukia', 'Waseges', 'Kabazi'],
    'Suna East': ['God Jope', 'Suna Central', 'Kakrao', 'Kwa'],
    'Suna West': ['Wiga', 'Wasweta II', 'Ragana-Oruba', 'Wasimbete'],
    'Tarbaj': ['Elben', 'Sarman', 'Tarbaj', 'Wargadud'],
    'Taveta': ['Chala', 'Mahoo', 'Bomeni', 'Mboghoni', 'Mata'],
    'Teso North': ['Malaba Central', 'Malaba North', 'Ang\'Urai South', 'Ang\'Urai North', 'Ang\'Urai East', 'Malaba South'],
    'Teso South': ['Ang\'Orom', 'Chakol South', 'Chakol North', 'Amukura West', 'Amukura East', 'Amukura Central'],
    'Tetu': ['Dedan Kimanthi', 'Wamagana', 'Aguthi/Gaaki'],
    'Tharaka': ['Gatunga', 'Mukothima', 'Nkondi', 'Chiakariga', 'Marimanti'],
    'Thika Town': ['Township', 'Kamenu', 'Hospital', 'Gatuanyaga', 'Ngoliba'],
    'Tiaty': ['Tirioko', 'Kolowa', 'Ribkwo', 'Silale', 'Loiyamorock', 'Tangulbei/Korossi', 'Churo/Amaya'],
    'Tigania East': ['Thangatha', 'Mikinduri', 'Kiguchwa', 'Muthara', 'Karama'],
    'Tigania West': ['Athwana', 'Akithii', 'Kianjai', 'Nkomo', 'Mbeu'],
    'Tinderet': ['Songhor/Soba', 'Tindiret', 'Chemelil/Chemase', 'Kapsimotwo'],
    'Tongaren': ['Mbakalo', 'Naitiri/Kabuyefwe', 'Milima', 'Ndalu/ Tabani', 'Tongaren', 'Soysambu/ Mitua'],
    'Turbo': ['Ngenyilel', 'Tapsagoi', 'Kamagut', 'Kiplombe', 'Kapsaos', 'Huruma'],
    'Turkana Central': ['Kerio Delta', 'Kang\'Atotha', 'Kalokol', 'Lodwar Township', 'Kanamkemer'],
    'Turkana East': ['Kapedo/Napeitom', 'Katilia', 'Lokori/Kochodin'],
    'Turkana North': ['Kaeris', 'Lake Zone', 'Lapur', 'Kaaleng/Kaikor', 'Kibish', 'Nakalale'],
    'Turkana South': ['Kaputir', 'Katilu', 'Lobokat', 'Kalapata', 'Lokichar'],
    'Turkana West': ['Kakuma', 'Lopur', 'Letea', 'Songot', 'Kalobeyei', 'Lokichoggio', 'Nanaam'],
    'Ugenya': ['West Ugenya', 'Ukwala', 'North Ugenya', 'East Ugenya'],
    'Ugunja': ['Sidindi', 'Sigomere', 'Ugunja'],
    'Vihiga': ['Lugaga-Wamuluma', 'South Maragoli', 'Central Maragoli', 'Mungoma'],
    'Voi': ['Mbololo', 'Sagalla', 'Kaloleni', 'Marungu', 'Kasigau', 'Ngolia'],
    'Wajir East': ['Wagberi', 'Township', 'Barwago', 'Khorof/Harar'],
    'Wajir North': ['Gurar', 'Bute', 'Korondile', 'Malkagufu', 'Batalu', 'Danaba', 'Godoma'],
    'Wajir South': ['Benane', 'Burder', 'Dadaja Bulla', 'Habasswein', 'Lagboghol South', 'Ibrahim Ure', 'Diif'],
    'Wajir West': ['Arbajahan', 'Hadado/Athibohol', 'Ademasajide', 'Wagalla/Ganyure'],
    'Webuye East': ['Mihuu', 'Ndivisi', 'Maraka'],
    'Webuye West': ['Misikhu', 'Sitikho', 'Matulo', 'Bokoli'],
    'West Mugirango': ['Nyamaiya', 'Bogichora', 'Bosamaro', 'Bonyamatuta', 'Township'],
    'Westlands': ['Kitisuru', 'Parklands/Highridge', 'Karura', 'Kangemi', 'Mountain View'],
    'Wundanyi': ['Wundanyi/Mbale', 'Werugha', 'Wumingu/Kishushe', 'Mwanda/Mgange'],
    'Yatta': ['Ndalani', 'Matuu', 'Kithimani', 'Ikombe', 'Katangi']
};

function populateSearchConstituencies() {
    var countySelect = document.getElementById('locationSearchCounty');
    var constituencySelect = document.getElementById('locationSearchConstituency');
    var wardSelect = document.getElementById('locationSearchWard');
    if (!countySelect || !constituencySelect) return;
    var county = countySelect.value;
    if (!county) {
        constituencySelect.innerHTML = '<option value="">-- All Constituencies --</option>';
        constituencySelect.style.display = 'none';
        if (wardSelect) {
            wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
            wardSelect.style.display = 'none';
        }
        return;
    }
    fetch(API_BASE + '/api/locations.php?county=' + encodeURIComponent(county))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success && data.constituencies && data.constituencies.length > 0) {
                window._apiConstituencies = data.constituencies;
                window._apiWards = data.wards;
                var list = data.constituencies;
                constituencySelect.innerHTML = '<option value="">-- All Constituencies --</option>';
                list.forEach(function (c) {
                    constituencySelect.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
                });
                constituencySelect.style.display = '';
                if (wardSelect) {
                    wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
                    wardSelect.style.display = 'none';
                }
            } else {
                fallbackSearchConstituencies(county, constituencySelect, wardSelect);
            }
        })
        .catch(function () {
            fallbackSearchConstituencies(county, constituencySelect, wardSelect);
        });
}

function fallbackSearchConstituencies(county, constituencySelect, wardSelect) {
    if (!constituencySelect) return;
    var list = CONSTITUENCIES[county] || [];
    constituencySelect.innerHTML = '<option value="">-- All Constituencies --</option>';
    list.forEach(function (c) {
        constituencySelect.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
    constituencySelect.style.display = county ? '' : 'none';
    if (wardSelect) {
        wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
        wardSelect.style.display = 'none';
    }
}

function populateSearchWards() {
    var constituencySelect = document.getElementById('locationSearchConstituency');
    var wardSelect = document.getElementById('locationSearchWard');
    if (!constituencySelect || !wardSelect) return;
    var constituency = constituencySelect.value;
    var list = null;
    if (window._apiWards && window._apiWards[constituency]) {
        list = window._apiWards[constituency];
    } else {
        list = WARDS[constituency] || [];
    }
    wardSelect.innerHTML = '<option value="">-- All Wards --</option>';
    list.forEach(function (w) {
        wardSelect.innerHTML += '<option value="' + w.replace(/"/g, '&quot;') + '">' + escHtml(w) + '</option>';
    });
    wardSelect.style.display = constituency ? '' : 'none';
}
