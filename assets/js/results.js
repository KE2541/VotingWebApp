let resultCountdownInterval = null;

document.addEventListener('DOMContentLoaded', function () {
    loadPositionsForFilter();
    loadPublicResults();
    loadElectionTimer();
    setInterval(loadPublicResults, 10000);
    setInterval(loadElectionTimer, 15000);
    document.getElementById('pubPositionFilter').addEventListener('change', function () {
        loadPublicResults();
    });
});

var presidentPositionId = 1;

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
    if (!overlay) return;
    document.getElementById('loadingText').textContent = message || 'Loading...';
    overlay.classList.add('active');
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
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

function loadPositionsForFilter() {
    fetch(API_BASE + '/api/settings.php')
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            const sel = document.getElementById('pubPositionFilter');
            var presidentId = null;
            (data.positions || []).forEach(function (p) {
                if (p.name.toLowerCase() === 'president') {
                    presidentId = p.id;
                    presidentPositionId = p.id;
                }
            });
            sel.innerHTML = '<option value="0">All Positions</option>';
            (data.positions || []).forEach(function (p) {
                var isPresident = p.name.toLowerCase() === 'president';
                sel.innerHTML += '<option value="' + (isPresident ? 'president' : p.id) + '">' + p.name + (isPresident ? ' (Default)' : '') + '</option>';
            });
            sel.value = 'president';
        });
}

function loadPublicResults() {
    var sel = document.getElementById('pubPositionFilter');
    var filterVal = sel ? sel.value : 'president';

    var url = API_BASE + '/api/results.php';
    var isPresidentOnly = false;

    if (filterVal === 'president') {
        url = API_BASE + '/api/results.php?position_id=' + presidentPositionId;
        isPresidentOnly = true;
    } else if (parseInt(filterVal) > 0) {
        url = API_BASE + '/api/results.php?position_id=' + parseInt(filterVal);
    }

    fetch(url)
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                document.getElementById('pubResultsContainer').innerHTML = '<div class="text-center text-danger" style="padding:40px;">Failed to load results: ' + escHtml(data.message || 'Unknown error') + '</div>';
                return;
            }

            var prevTotal = parseInt(document.getElementById('pubTotalVoters').textContent) || 0;
            var prevVoted = parseInt(document.getElementById('pubVotersVoted').textContent) || 0;

            animateValue(document.getElementById('pubTotalVoters'), prevTotal, data.summary.total_voters, 500);
            animateValue(document.getElementById('pubVotersVoted'), prevVoted, data.summary.voters_voted, 500);
            document.getElementById('pubTurnoutPct').textContent = data.summary.turnout_percentage + '%';
            document.getElementById('lastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString();

            const container = document.getElementById('pubResultsContainer');
            if (!data.results || data.results.length === 0) {
                container.innerHTML = '<div class="text-center text-muted" style="padding:40px;">No results available yet. Voting may not have started.</div>';
                return;
            }

            var presidentPosition = null;
            var otherPositions = [];

            data.results.forEach(function (pos) {
                if (pos.position_name.toLowerCase() === 'president') {
                    presidentPosition = pos;
                } else {
                    otherPositions.push(pos);
                }
            });

            var html = '';

            if (isPresidentOnly && presidentPosition) {
                html += renderPositionCard(presidentPosition, true);
            } else if (isPresidentOnly && !presidentPosition) {
                if (data.results.length > 0) {
                    html += renderPositionCard(data.results[0], true);
                }
            } else {
                data.results.forEach(function (pos) {
                    html += renderPositionCard(pos, pos.position_name.toLowerCase() === 'president');
                });
            }

            if (!otherPositions.length && !isPresidentOnly) {
                data.results.forEach(function (pos) {
                    if (pos.position_name.toLowerCase() !== 'president') {
                        otherPositions.push(pos);
                    }
                });
                otherPositions.forEach(function (pos) {
                    html += renderPositionCard(pos, false);
                });
            }

            container.innerHTML = html || '<div class="text-center text-muted" style="padding:40px;">No results to display.</div>';
        })
        .catch(function () {
            document.getElementById('pubResultsContainer').innerHTML = '<div class="text-center text-danger" style="padding:40px;">Failed to load results. Check connection.</div>';
            showToast('Failed to load results', 'error');
        });
}

function renderPositionCard(position, isDefault) {
    var total = position.total_votes || 0;
    var candidates = position.candidates || [];
    var maxVotes = 0;
    candidates.forEach(function (c) {
        if (c.vote_count > maxVotes) maxVotes = c.vote_count;
    });

    var barsHtml = candidates.map(function (c) {
        var pct = total > 0 ? (c.vote_count / total * 100) : 0;
        var isWinner = c.vote_count > 0 && c.vote_count === maxVotes;
        var photoImg = c.photo_url ? '<img src="' + c.photo_url + '" class="cand-photo-sm"> ' : '';
        var symbolImg = c.party_symbol ? '<img src="' + c.party_symbol + '" class="cand-symbol-sm"> ' : '';
        return '<div class="result-row ' + (isWinner ? 'winner' : '') + '">' +
            '<div class="result-info">' +
            '<span class="candidate-name">' + photoImg + symbolImg + '<strong>' + escHtml(c.name) + '</strong> ' + (c.party ? '(' + escHtml(c.party) + ')' : '') + '</span>' +
            '<span class="vote-count">' + c.vote_count + ' votes (' + pct.toFixed(1) + '%)</span>' +
            '</div>' +
            '<div class="progress-bar-container">' +
            '<div class="progress-bar" style="width:' + pct + '%"></div>' +
            '</div>' +
            (isWinner ? '<span class="winner-badge">WINNER</span>' : '') +
            '</div>';
    }).join('');

    var winnerName = 'No votes yet';
    if (maxVotes > 0) {
        var winner = candidates.find(function (c) { return c.vote_count === maxVotes; });
        if (winner) winnerName = escHtml(winner.name);
    }

    return '<div class="position-results ' + (isDefault ? 'default-position' : '') + '">' +
        '<div class="position-header">' +
        '<h3>' + escHtml(position.position_name) +
        (isDefault ? ' <span class="default-tag">DEFAULT VIEW</span>' : '') +
        '</h3>' +
        '<div>' +
        '<span class="position-badge">Total: ' + total + ' votes</span>' +
        '</div>' +
        '<div class="position-winner">' +
        '<span class="' + (maxVotes > 0 ? 'text-success' : 'text-muted') + '">' +
        (maxVotes > 0 ? 'Leading: ' + winnerName + ' (' + maxVotes + ' votes)' : 'No votes yet') +
        '</span>' +
        '</div>' +
        '</div>' +
        '<div class="results-list">' +
        barsHtml +
        '</div>' +
        '</div>';
}

function loadElectionTimer() {
    fetch(API_BASE + '/api/settings.php')
        .then(r => r.json())
        .then(data => {
            if (!data.success || !data.settings) return;
            var s = data.settings;
            var timerEl = document.getElementById('resultTimer');
            var now = new Date();
            var end = new Date(s.end_time);
            if (s.is_active && now < end) {
                timerEl.style.display = 'flex';
                startResultCountdown(end);
            } else {
                timerEl.style.display = 'none';
            }
        });
}

function startResultCountdown(targetDate) {
    if (resultCountdownInterval) clearInterval(resultCountdownInterval);
    var display = document.getElementById('resultCountdown');
    function tick() {
        var now = new Date();
        var diff = targetDate - now;
        if (diff <= 0) {
            display.textContent = 'Ended';
            return;
        }
        var d = Math.floor(diff / (1000 * 60 * 60 * 24));
        var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var s = Math.floor((diff % (1000 * 60)) / 1000);
        if (d > 0) {
            display.textContent = d + 'd ' + h.toString().padStart(2, '0') + 'h ' + m.toString().padStart(2, '0') + 'm ' + s.toString().padStart(2, '0') + 's';
        } else {
            display.textContent = h.toString().padStart(2, '0') + 'h ' + m.toString().padStart(2, '0') + 'm ' + s.toString().padStart(2, '0') + 's';
        }
    }
    tick();
    resultCountdownInterval = setInterval(tick, 1000);
}

function toggleNav() {
    document.querySelector('.nav-links').classList.toggle('open');
}

function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
