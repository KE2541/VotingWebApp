<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Online Voting System</title>
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
    <nav class="navbar">
        <div class="nav-container">
            <a href="index.php" class="nav-brand">Voting System</a>
            <button class="nav-toggle" onclick="toggleNav()">&#9776;</button>
            <div class="nav-links">
                <a href="index.php" class="active">Vote Now</a>
                <a href="results.php" target="_blank" rel="noopener">Live Results</a>
            </div>
        </div>
    </nav>

    <div class="container location-search-container">
        <div class="card" style="max-width: 600px; margin: 20px auto;">
            <div class="card-header">
                <h2>Voting Location</h2>
            </div>
            <p class="text-muted" style="padding:0 20px 8px;font-size:13px;">Select your location below, then enter your ID in "Voter Login" section below and proceed to Verify and start Voting.</p>
            <div class="location-search-box">
                <input type="text" id="locationSearchInput" class="form-control" placeholder="Search by County, Constituency or Ward..." onkeydown="if(event.key==='Enter')searchLocation()">
                <select id="locationSearchCounty" class="form-control" onchange="populateSearchConstituencies();searchLocation()" style="max-width:200px;">
                    <option value="">-- All Counties --</option>
                    <option value="Mombasa">Mombasa</option>
                    <option value="Kwale">Kwale</option>
                    <option value="Kilifi">Kilifi</option>
                    <option value="Tana River">Tana River</option>
                    <option value="Lamu">Lamu</option>
                    <option value="Taita Taveta">Taita Taveta</option>
                    <option value="Garissa">Garissa</option>
                    <option value="Wajir">Wajir</option>
                    <option value="Mandera">Mandera</option>
                    <option value="Marsabit">Marsabit</option>
                    <option value="Isiolo">Isiolo</option>
                    <option value="Turkana">Turkana</option>
                    <option value="Meru">Meru</option>
                    <option value="Tharaka Nithi">Tharaka Nithi</option>
                    <option value="Embu">Embu</option>
                    <option value="Kitui">Kitui</option>
                    <option value="Makueni">Makueni</option>
                    <option value="Machakos">Machakos</option>
                    <option value="Nairobi">Nairobi</option>
                    <option value="Nyeri">Nyeri</option>
                    <option value="Kiambu">Kiambu</option>
                    <option value="Murang'a">Murang'a</option>
                    <option value="Kirinyaga">Kirinyaga</option>
                    <option value="Samburu">Samburu</option>
                    <option value="Baringo">Baringo</option>
                    <option value="Laikipia">Laikipia</option>
                    <option value="Nyandarua">Nyandarua</option>
                    <option value="Kajiado">Kajiado</option>
                    <option value="Narok">Narok</option>
                    <option value="Nakuru">Nakuru</option>
                    <option value="Uasin Gishu">Uasin Gishu</option>
                    <option value="Nandi">Nandi</option>
                    <option value="Kericho">Kericho</option>
                    <option value="Bomet">Bomet</option>
                    <option value="Kisii">Kisii</option>
                    <option value="Nyamira">Nyamira</option>
                    <option value="Migori">Migori</option>
                    <option value="Homa Bay">Homa Bay</option>
                    <option value="Siaya">Siaya</option>
                    <option value="Kisumu">Kisumu</option>
                    <option value="Busia">Busia</option>
                    <option value="Kakamega">Kakamega</option>
                    <option value="Vihiga">Vihiga</option>
                    <option value="Bungoma">Bungoma</option>
                    <option value="Trans Nzoia">Trans Nzoia</option>
                    <option value="West Pokot">West Pokot</option>
                    <option value="Elgeyo Marakwet">Elgeyo Marakwet</option>
                </select>
                <select id="locationSearchConstituency" class="form-control" onchange="populateSearchWards();searchLocation()" style="max-width:220px;display:none;">
                    <option value="">-- All Constituencies --</option>
                </select>
                <select id="locationSearchWard" class="form-control" onchange="searchLocation()" style="max-width:220px;display:none;">
                    <option value="">-- All Wards --</option>
                </select>
                <button onclick="searchLocation()" class="btn btn-primary"><strong>Search</strong></button>
            </div>
        </div>
    </div>

    <div id="hackOverlay" class="security-overlay">
        <div class="hack-icon">&#9760;</div>
        <h1>ACCESS DENIED</h1>
        <div class="hack-info">
            <p>UNAUTHORIZED ACCESS DETECTED</p>
            <p id="hackReason" style="color:#ff6600;">Security breach</p>
            <p>Your device has been locked and your location is being tracked.</p>
            <p class="hack-coords" id="hackCoords">Acquiring location coordinates...</p>
            <p class="hack-info" id="hackIP">Your IP address and device information have been recorded.</p>
            <p style="margin-top:20px;color:#666;font-size:12px;">This incident will be reported to the authorities.</p>
        </div>
    </div>

    <div id="voterSection" class="container">
        <div class="card" style="max-width: 500px; margin: 40px auto;">
            <h2>Voter Login</h2>
            <p class="text-muted">Enter your Voter ID to start voting</p>
            <form id="registerForm" onsubmit="return verifyVoter(event)">
                <div class="form-group">
                    <label>Voter ID</label>
                    <input type="text" id="voterIdNumber" class="form-control" required placeholder="9-digit National ID or Passport (e.g. A1234567)" pattern="(\d{6,9}|[A-Za-z]\d{7})" inputmode="text">
                    <small class="text-muted">National ID: 6-9 digits &nbsp;|&nbsp; Passport: 1 letter + 7 digits</small>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Verify & Start Voting</button>
                <p id="registerMsg" class="mt-2" style="display:none;"></p>
            </form>
            <div id="voterLookupResult" class="voter-lookup-result" style="display:none;">
                <div class="voter-lookup-photo">
                    <img id="voterLookupPhoto" src="" alt="Voter photo">
                </div>
                <div class="voter-lookup-details">
                    <div class="voter-lookup-name" id="voterLookupName"></div>
                    <div class="voter-lookup-id" id="voterLookupId"></div>
                    <div class="voter-lookup-location" id="voterLookupLocation" style="font-size:13px;color:#666;margin-top:4px;"></div>
                </div>
            </div>
        </div>
    </div>

    <div id="faceVerifySection" class="container" style="display:none;">
        <div class="card" style="max-width: 500px; margin: 40px auto;">
            <h2>Face Verification Required</h2>
            <p class="text-muted" id="verifyInstruction">Look straight at the camera. Follow the prompts.</p>
            <div class="face-capture-container">
                <video id="verifyVideo" class="face-video" autoplay playsinline style="display:none;"></video>
                <canvas id="verifyCanvas" class="face-canvas" style="display:none;"></canvas>
                <p id="verifyFaceStatus" class="face-status text-muted">Initializing camera...</p>
                <div class="liveness-progress" id="livenessProgress">
                    <div class="liveness-step" data-step="center">Center <span class="step-icon">&#9711;</span></div>
                    <div class="liveness-step" data-step="blink">Blink Eyes <span class="step-icon">&#9711;</span></div>
                    <div class="liveness-step" data-step="left">Left <span class="step-icon">&#9711;</span></div>
                    <div class="liveness-step" data-step="right">Right <span class="step-icon">&#9711;</span></div>
                    <div class="liveness-step" data-step="up">Up <span class="step-icon">&#9711;</span></div>
                    <div class="liveness-step" data-step="down">Down <span class="step-icon">&#9711;</span></div>
                </div>
                <div class="face-actions">
                    <button id="verifyRetryBtn" class="btn btn-outline" style="display:none;">Retry Verification</button>
                </div>
            </div>
        </div>
    </div>

    <div id="votingSection" class="container" style="display:none;">
        <div class="voter-info-bar">
            <div>
                <div class="voter-name-display" id="displayName"></div>
                <span class="badge badge-info">ID: <span id="displayVoterId"></span></span>
            </div>
            <button onclick="resetVoter()" class="btn btn-sm btn-outline">Change Voter</button>
        </div>

        <div class="page-header">
            <h1>Cast Your Vote</h1>
            <div class="header-right">
                <div id="countdownTimer" class="countdown-timer" style="display:none;">
                    <span class="timer-label">Time Remaining</span>
                    <span id="countdownDisplay" class="countdown-display">--</span>
                </div>
                <div id="electionStatus" class="election-status"></div>
            </div>
        </div>

        <div id="positionsContainer"></div>

        <div id="submitBar" class="submit-bar" style="display:none;">
            <span id="selectionCount" class="selection-count">0 of 0 positions selected</span>
            <button onclick="openSummaryModal()" class="btn btn-primary btn-lg">Review & Cast All Votes</button>
        </div>

        <div id="votedBanner" class="card text-center" style="display:none;">
            <div style="font-size: 48px;">&#10004;</div>
            <h2>Thank You for Voting!</h2>
            <p>Your votes have been recorded successfully.</p>
            <button onclick="resetVoter()" class="btn btn-primary">Next Voter</button>
        </div>
    </div>

    <div id="summaryModal" class="modal" style="display:none;">
        <div class="modal-content">
            <h3>Review Your Votes</h3>
            <div id="summaryList" class="summary-list"></div>
            <div class="modal-actions">
                <button onclick="closeSummaryModal()" class="btn btn-outline">Cancel</button>
                <button onclick="submitAllVotes()" class="btn btn-primary">Confirm All Votes</button>
            </div>
            <p id="voteMsg" class="mt-2" style="display:none;"></p>
        </div>
    </div>

    <div id="toastContainer" class="toast-container"></div>
    <div id="loadingOverlay" class="loading-overlay">
        <div class="spinner spinner-lg"></div>
        <p id="loadingText">Loading...</p>
    </div>
    <footer style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 24px;border-top:1px solid var(--border);margin-top:24px;font-size:13px;color:var(--text-muted);">
        <p>Online Voting System</p>
        <span style="font-size:16px;color:#1565c0;font-weight:600;">Powered by Timex Systems</span>
    </footer>
    <script src="assets/js/config.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>
