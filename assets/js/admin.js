let faceCaptureStream = null;
let capturedFaceImage = null;
let capturedFaceDescriptor = null;

var deviceType = (function () {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk|android(?!.*mobile)/i.test(ua)) return 'tablet';
    if (/mobile|ip(hone|od)|phone|blackberry|iemobile|opera mini|kindle/i.test(ua)) return 'mobile';
    return 'desktop';
})();

var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
var isAndroid = /android/i.test(navigator.userAgent);
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

document.addEventListener('DOMContentLoaded', function () {
    checkSession();
    initGlobalHandlers();
});

function getCameraConstraints() {
    var constraints = { video: { facingMode: 'user' } };
    if (deviceType === 'mobile' || deviceType === 'tablet') {
        constraints.video.width = { ideal: 480 };
        constraints.video.height = { ideal: 640 };
    } else {
        constraints.video.width = { ideal: 640 };
        constraints.video.height = { ideal: 480 };
    }
    return constraints;
}

function isCameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function initGlobalHandlers() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var modals = document.querySelectorAll('.modal');
            modals.forEach(function (m) {
                if (m.style.display === 'flex') m.style.display = 'none';
            });
        }
    });
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
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

function checkSession() {
    fetch(API_BASE + '/api/check_session.php')
        .then(r => r.json())
        .then(data => {
            if (data.logged_in) {
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('adminDashboard').style.display = 'block';
                initAdmin();
            }
        })
        .catch(function () {});
}

function adminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');

    fetch(API_BASE + '/api/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'block';
            initAdmin();
        } else {
            errEl.textContent = data.message;
            errEl.style.display = 'block';
        }
    })
    .catch(function () {
        errEl.textContent = 'Connection error';
        errEl.style.display = 'block';
    });
    return false;
}

function adminLogout() {
    fetch(API_BASE + '/api/logout.php', { method: 'POST' })
        .then(function () { location.reload(); });
}

function initAdmin() {
    loadPositionsIntoSelects();
    loadCandidates();
    loadVoters();
    loadSettings();
    loadResults();
    loadElectionStatus();
    loadTransferHistory();

    setInterval(loadResults, 10000);
    setInterval(loadElectionStatus, 15000);
}

function loadElectionStatus() {
    fetch(API_BASE + '/api/settings.php')
        .then(r => r.json())
        .then(data => {
            if (!data.success || !data.settings) return;
            const s = data.settings;
            const startBtn = document.getElementById('startVotingBtn');
            const stopBtn = document.getElementById('stopVotingBtn');
            const adminTimer = document.getElementById('adminTimer');
            const cd = document.getElementById('adminCountdown');

            const now = new Date();
            const start = new Date(s.start_time);
            const end = new Date(s.end_time);
            const isActive = s.is_active == 1;

            if (isActive && now >= start && now < end) {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                adminTimer.style.display = 'block';
                updateAdminCountdown(end);
            } else {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                adminTimer.style.display = 'none';
            }
        });
}

function updateAdminCountdown(targetDate) {
    const cd = document.getElementById('adminCountdown');
    const update = function () {
        const now = new Date();
        const diff = targetDate - now;
        if (diff <= 0) {
            cd.textContent = 'Voting has ended';
            return;
        }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        cd.textContent = d + 'd ' + h.toString().padStart(2, '0') + 'h ' + m.toString().padStart(2, '0') + 'm ' + s.toString().padStart(2, '0') + 's';
    };
    update();
    if (window._adminTimerInterval) clearInterval(window._adminTimerInterval);
    window._adminTimerInterval = setInterval(update, 1000);
}

function loadPositionsIntoSelects() {
    fetch(API_BASE + '/api/settings.php')
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            const positions = data.positions || [];
            const selects = ['candidatePosition', 'filterPosition', 'editCandidatePosition'];
            selects.forEach(function (id) {
                const sel = document.getElementById(id);
                if (!sel) return;
                sel.innerHTML = id === 'filterPosition' ? '<option value="0">All Positions</option>' : '';
                positions.forEach(function (p) {
                    var level = p.level || '';
                    sel.innerHTML += '<option value="' + p.id + '" data-level="' + escJsStr(level) + '">' + escHtml(p.name) + (level ? ' [' + escHtml(level) + ']' : '') + '</option>';
                });
            });
            updateLocationFieldOnLoad('candidate');
            updateLocationFieldOnLoad('editCandidate');
        });
}

var COUNTIES = ['Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita Taveta','Garissa','Wajir','Mandera','Marsabit','Isiolo','Turkana','Meru','Tharaka Nithi','Embu','Kitui','Makueni','Machakos','Nairobi','Nyeri','Kiambu','Murang\'a','Kirinyaga','Samburu','Baringo','Laikipia','Nyandarua','Kajiado','Narok','Nakuru','Uasin Gishu','Nandi','Kericho','Bomet','Kisii','Nyamira','Migori','Homa Bay','Siaya','Kisumu','Busia','Kakamega','Vihiga','Bungoma','Trans Nzoia','West Pokot','Elgeyo Marakwet'];

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

function populateConstituencies(prefix) {
    var countySelect = document.getElementById(prefix + 'LocationCounty');
    var constituencySelect = document.getElementById(prefix + 'LocationConstituency');
    var wardSelect = document.getElementById(prefix + 'LocationWard');
    if (!countySelect || !constituencySelect) return;
    var county = countySelect.value;
    if (!county) {
        constituencySelect.innerHTML = '<option value="">-- Select Constituency --</option>';
        if (wardSelect) {
            wardSelect.innerHTML = '<option value="">-- Select Constituency first --</option>';
        }
        return;
    }
    fetch(API_BASE + '/api/locations.php?county=' + encodeURIComponent(county))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success && data.constituencies && data.constituencies.length > 0) {
                window['_apiConstituencies_' + prefix] = data.constituencies;
                window['_apiWards_' + prefix] = data.wards;
                var list = data.constituencies;
                constituencySelect.innerHTML = '<option value="">-- Select Constituency --</option>';
                list.forEach(function (c) {
                    constituencySelect.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
                });
                if (wardSelect) {
                    wardSelect.innerHTML = '<option value="">-- Select Constituency first --</option>';
                }
            } else {
                fallbackConstituencies(county, constituencySelect, wardSelect);
            }
        })
        .catch(function () {
            fallbackConstituencies(county, constituencySelect, wardSelect);
        });
}

function fallbackConstituencies(county, constituencySelect, wardSelect) {
    if (!constituencySelect) return;
    var list = CONSTITUENCIES[county] || [];
    constituencySelect.innerHTML = '<option value="">-- Select Constituency --</option>';
    list.forEach(function (c) {
        constituencySelect.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
    if (wardSelect) {
        wardSelect.innerHTML = '<option value="">-- Select Constituency first --</option>';
    }
}

function populateWards(prefix) {
    var constituencySelect = document.getElementById(prefix + 'LocationConstituency');
    var wardSelect = document.getElementById(prefix + 'LocationWard');
    if (!constituencySelect || !wardSelect) return;
    var constituency = constituencySelect.value;
    var list = null;
    var apiWards = window['_apiWards_' + prefix];
    if (apiWards && apiWards[constituency]) {
        list = apiWards[constituency];
    } else {
        list = WARDS[constituency] || [];
    }
    wardSelect.innerHTML = '<option value="">-- Select Ward --</option>';
    list.forEach(function (w) {
        wardSelect.innerHTML += '<option value="' + w.replace(/"/g, '&quot;') + '">' + escHtml(w) + '</option>';
    });
}

function onCountyChange(prefix) {
    var posSelect = document.getElementById(prefix + 'Position');
    if (!posSelect) return;
    var selectedOption = posSelect.options[posSelect.selectedIndex];
    var level = selectedOption ? (selectedOption.getAttribute('data-level') || '') : '';
    if (level === 'constituency' || level === 'ward') {
        populateConstituencies(prefix);
    }
    syncLocationInput(prefix);
}

function onConstituencyChange(prefix) {
    var posSelect = document.getElementById(prefix + 'Position');
    var level = '';
    if (posSelect && posSelect.selectedIndex >= 0) {
        var selectedOption = posSelect.options[posSelect.selectedIndex];
        level = selectedOption ? (selectedOption.getAttribute('data-level') || '') : '';
    }
    if (level === 'ward') {
        populateWards(prefix);
    }
    syncLocationInput(prefix);
}

function syncLocationInput(prefix) {
    var countyEl = document.getElementById(prefix + 'LocationCounty');
    var constituencyEl = document.getElementById(prefix + 'LocationConstituency');
    var wardEl = document.getElementById(prefix + 'LocationWard');
    var textEl = document.getElementById(prefix + 'LocationText');
    var hiddenEl = document.getElementById(prefix + 'Location');
    if (!hiddenEl) return;
    if (wardEl && wardEl.style.display !== 'none' && wardEl.value) {
        hiddenEl.value = wardEl.value;
    } else if (constituencyEl && constituencyEl.style.display !== 'none' && constituencyEl.value) {
        hiddenEl.value = constituencyEl.value;
    } else if (countyEl && countyEl.style.display !== 'none' && countyEl.value) {
        hiddenEl.value = countyEl.value;
    } else if (textEl && textEl.style.display !== 'none' && textEl.value) {
        hiddenEl.value = textEl.value;
    }
}

function updateLocationField(selectEl, prefix) {
    var selectedOption = selectEl.options[selectEl.selectedIndex];
    var level = selectedOption ? (selectedOption.getAttribute('data-level') || '') : '';
    var countyGroup = document.getElementById(prefix + 'LocationCountyGroup');
    var constituencyGroup = document.getElementById(prefix + 'LocationConstituencyGroup');
    var wardGroup = document.getElementById(prefix + 'LocationWardGroup');
    var textGroup = document.getElementById(prefix + 'LocationTextGroup');
    var textInput = document.getElementById(prefix + 'LocationText');
    var hiddenEl = document.getElementById(prefix + 'Location');
    var countySelect = document.getElementById(prefix + 'LocationCounty');
    var constituencySelect = document.getElementById(prefix + 'LocationConstituency');
    var wardSelect = document.getElementById(prefix + 'LocationWard');

    if (!countyGroup || !textGroup || !hiddenEl) return;

    if (level === 'county') {
        countyGroup.style.display = '';
        if (constituencyGroup) constituencyGroup.style.display = 'none';
        if (wardGroup) wardGroup.style.display = 'none';
        textGroup.style.display = 'none';
        if (constituencySelect) constituencySelect.value = '';
        if (wardSelect) wardSelect.value = '';
        if (textInput) textInput.value = '';
        if (countySelect) countySelect.value = '';
        syncLocationInput(prefix);
    } else if (level === 'constituency') {
        countyGroup.style.display = '';
        if (constituencyGroup) constituencyGroup.style.display = '';
        if (wardGroup) wardGroup.style.display = 'none';
        textGroup.style.display = 'none';
        if (wardSelect) wardSelect.value = '';
        if (textInput) textInput.value = '';
        if (countySelect) {
            countySelect.value = '';
            populateConstituencies(prefix);
        }
        syncLocationInput(prefix);
    } else if (level === 'ward') {
        countyGroup.style.display = '';
        if (constituencyGroup) constituencyGroup.style.display = '';
        if (wardGroup) wardGroup.style.display = '';
        textGroup.style.display = 'none';
        if (textInput) textInput.value = '';
        if (countySelect) countySelect.value = '';
        if (constituencySelect) constituencySelect.value = '';
        if (wardSelect) wardSelect.value = '';
        syncLocationInput(prefix);
    } else if (level === 'national') {
        countyGroup.style.display = 'none';
        if (constituencyGroup) constituencyGroup.style.display = 'none';
        if (wardGroup) wardGroup.style.display = 'none';
        textGroup.style.display = 'none';
        if (countySelect) countySelect.value = '';
        if (constituencySelect) constituencySelect.value = '';
        if (wardSelect) wardSelect.value = '';
        if (textInput) textInput.value = '';
        hiddenEl.value = 'Kenya';
    } else {
        countyGroup.style.display = 'none';
        if (constituencyGroup) constituencyGroup.style.display = 'none';
        if (wardGroup) wardGroup.style.display = 'none';
        textGroup.style.display = '';
        if (countySelect) countySelect.value = '';
        if (constituencySelect) constituencySelect.value = '';
        if (wardSelect) wardSelect.value = '';
        syncLocationInput(prefix);
    }
}

function updateLocationFieldOnLoad(prefix) {
    var posEl = document.getElementById(prefix + 'Position');
    if (posEl) updateLocationField(posEl, prefix);
}

function prependImage(input, previewId) {
    var preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            preview.src = e.target.result;
            preview.style.display = 'inline-block';
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.style.display = 'none';
        preview.src = '';
    }
}

function loadCandidates() {
    const positionId = document.getElementById('filterPosition').value;
    const url = positionId > 0 ? API_BASE + '/api/candidates.php?position_id=' + positionId : API_BASE + '/api/candidates.php';

    fetch(url)
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('candidateTableBody');
            if (!data.success) { tbody.innerHTML = '<tr><td colspan="9">Failed to load</td></tr>'; return; }
            if (data.candidates.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-muted">No candidates enrolled yet</td></tr>';
                return;
            }
            tbody.innerHTML = data.candidates.map(function (c, i) {
                var photoHtml = c.photo_url ? '<img src="../' + c.photo_url + '" class="cand-photo-thumb">' : '<span class="text-muted">-</span>';
                var symbolHtml = c.party_symbol ? '<img src="../' + c.party_symbol + '" class="cand-symbol-thumb">' : '<span class="text-muted">-</span>';
                return '<tr>' +
                    '<td data-label="#">' + (i + 1) + '</td>' +
                    '<td data-label="Photo">' + photoHtml + '</td>' +
                    '<td data-label="Name"><strong>' + escHtml(c.name) + '</strong></td>' +
                    '<td data-label="Position">' + escHtml(c.position_name) + '</td>' +
                    '<td data-label="Level"><span class="level-badge">' + escHtml(c.level || '-') + '</span></td>' +
                    '<td data-label="Location">' + escHtml(c.location || '-') + '</td>' +
                    '<td data-label="Party">' + escHtml(c.party || '-') + '</td>' +
                    '<td data-label="Symbol">' + symbolHtml + '</td>' +
                    '<td data-label="Actions" class="action-cell">' +
                    '<button class="btn btn-sm btn-outline" onclick="editCandidate(' + c.id + ', \'' + escJsStr(c.name) + '\', ' + c.position_id + ', \'' + escJsStr(c.party) + '\', \'' + escJsStr(c.location || '') + '\', \'' + escJsStr(c.photo_url || '') + '\', \'' + escJsStr(c.party_symbol || '') + '\')">Edit</button>' +
                    '<button class="btn btn-sm btn-danger" onclick="removeCandidate(' + c.id + ')">Remove</button>' +
                    '</td>' +
                    '</tr>';
            }).join('');
        });
}

function readFileAsBase64(file) {
    return new Promise(function (resolve) {
        if (!file) { resolve(''); return; }
        var reader = new FileReader();
        reader.onload = function (e) { resolve(e.target.result); };
        reader.readAsDataURL(file);
    });
}

function addCandidate(e) {
    e.preventDefault();
    const name = document.getElementById('candidateName').value;
    const position_id = document.getElementById('candidatePosition').value;
    const party = document.getElementById('candidateParty').value;
    const location = document.getElementById('candidateLocation').value;
    const msg = document.getElementById('candidateMsg');
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Adding...';
    msg.style.display = 'none';

    var photoFile = document.getElementById('candidatePhoto').files[0];
    var symbolFile = document.getElementById('candidateSymbol').files[0];

    Promise.all([readFileAsBase64(photoFile), readFileAsBase64(symbolFile)]).then(function (results) {
        var body = { name: name, position_id: parseInt(position_id), party: party, location: location };
        if (results[0]) body.photo_base64 = results[0];
        if (results[1]) body.symbol_base64 = results[1];

        showLoading('Adding candidate...');

        fetch(API_BASE + '/api/candidates.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(r => r.json())
        .then(data => {
            hideLoading();
            msg.style.display = 'block';
            if (data.success) {
                msg.className = 'text-success mt-2';
                msg.textContent = 'Candidate enrolled successfully!';
                showToast('Candidate enrolled successfully!', 'success');
                document.getElementById('candidateForm').reset();
                document.getElementById('candidateLocation').value = '';
                document.getElementById('candidateLocationCounty').value = '';
                document.getElementById('candidateLocationConstituency').value = '';
                document.getElementById('candidateLocationWard').value = '';
                document.getElementById('candidateLocationText').value = '';
                document.getElementById('candidatePhotoPreview').style.display = 'none';
                document.getElementById('candidateSymbolPreview').style.display = 'none';
                loadCandidates();
            } else {
                msg.className = 'text-danger mt-2';
                msg.textContent = data.message;
                showToast(data.message, 'error');
            }
            btn.disabled = false;
            btn.innerHTML = 'Add Candidate';
            setTimeout(function () { msg.style.display = 'none'; }, 3000);
        })
        .catch(function () {
            hideLoading();
            msg.style.display = 'block';
            msg.className = 'text-danger mt-2';
            msg.textContent = 'Connection error';
            showToast('Connection error', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Add Candidate';
        });
    });
    return false;
}

function editCandidate(id, name, positionId, party, location, photoUrl, partySymbol) {
    document.getElementById('editCandidateId').value = id;
    document.getElementById('editCandidateName').value = name;
    document.getElementById('editCandidatePosition').value = positionId;
    document.getElementById('editCandidateParty').value = party;
    document.getElementById('editCandidateLocation').value = location || '';
    document.getElementById('editPhotoUrl').value = photoUrl || '';
    document.getElementById('editPartySymbol').value = partySymbol || '';
    document.getElementById('editMsg').style.display = 'none';
    document.getElementById('editModal').style.display = 'flex';

    var photoPreview = document.getElementById('editCandidatePhotoPreview');
    if (photoUrl) {
        photoPreview.src = '../' + photoUrl;
        photoPreview.style.display = 'inline-block';
    } else {
        photoPreview.style.display = 'none';
    }
    var symbolPreview = document.getElementById('editCandidateSymbolPreview');
    if (partySymbol) {
        symbolPreview.src = '../' + partySymbol;
        symbolPreview.style.display = 'inline-block';
    } else {
        symbolPreview.style.display = 'none';
    }

    var posSelect = document.getElementById('editCandidatePosition');
    var loc = location || '';
    updateLocationField(posSelect, 'editCandidate');

    var countyEl = document.getElementById('editCandidateLocationCounty');
    var constituencyEl = document.getElementById('editCandidateLocationConstituency');
    var wardEl = document.getElementById('editCandidateLocationWard');
    var textEl = document.getElementById('editCandidateLocationText');

    var found = false;
    if (wardEl && wardEl.style.display !== 'none') {
        for (var co in CONSTITUENCIES) {
            var cons = CONSTITUENCIES[co];
            for (var i = 0; i < cons.length; i++) {
                var con = cons[i];
                var wards = WARDS[con] || [];
                if (wards.indexOf(loc) !== -1) {
                    if (countyEl) countyEl.value = co;
                    populateConstituencies('editCandidate');
                    if (constituencyEl) constituencyEl.value = con;
                    populateWards('editCandidate');
                    if (wardEl) wardEl.value = loc;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }
    if (!found) {
        if (COUNTIES.indexOf(loc) !== -1) {
            if (countyEl) countyEl.value = loc;
            found = true;
        }
    }
    if (!found && constituencyEl && constituencyEl.style.display !== 'none') {
        for (var c in CONSTITUENCIES) {
            if (CONSTITUENCIES[c].indexOf(loc) !== -1) {
                if (countyEl) countyEl.value = c;
                populateConstituencies('editCandidate');
                constituencyEl.value = loc;
                found = true;
                break;
            }
        }
    }
    if (!found && textEl && textEl.style.display !== 'none') {
        textEl.value = loc;
    }
    syncLocationInput('editCandidate');
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

function updateCandidate(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('editCandidateId').value);
    const name = document.getElementById('editCandidateName').value;
    const position_id = parseInt(document.getElementById('editCandidatePosition').value);
    const party = document.getElementById('editCandidateParty').value;
    const location = document.getElementById('editCandidateLocation').value;
    const photo_url = document.getElementById('editPhotoUrl').value;
    const party_symbol = document.getElementById('editPartySymbol').value;
    const msg = document.getElementById('editMsg');
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';
    msg.style.display = 'none';

    var photoFile = document.getElementById('editCandidatePhoto').files[0];
    var symbolFile = document.getElementById('editCandidateSymbol').files[0];

    Promise.all([readFileAsBase64(photoFile), readFileAsBase64(symbolFile)]).then(function (results) {
        var body = { id: id, name: name, position_id: position_id, party: party, location: location, photo_url: photo_url, party_symbol: party_symbol };
        if (results[0]) body.photo_base64 = results[0];
        if (results[1]) body.symbol_base64 = results[1];

        showLoading('Updating candidate...');

        fetch(API_BASE + '/api/candidates.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(r => r.json())
        .then(data => {
            hideLoading();
            msg.style.display = 'block';
            if (data.success) {
                msg.className = 'text-success mt-2';
                msg.textContent = 'Candidate updated successfully!';
                showToast('Candidate updated successfully!', 'success');
                setTimeout(function () {
                    closeEditModal();
                    loadCandidates();
                }, 800);
            } else {
                msg.className = 'text-danger mt-2';
                msg.textContent = data.message;
                showToast(data.message, 'error');
            }
            btn.disabled = false;
            btn.innerHTML = 'Save Changes';
        })
        .catch(function () {
            hideLoading();
            msg.style.display = 'block';
            msg.className = 'text-danger mt-2';
            msg.textContent = 'Connection error';
            showToast('Connection error', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Save Changes';
        });
    });
    return false;
}

function removeCandidate(id) {
    if (!confirm('Remove this candidate?')) return;
    showLoading('Removing candidate...');
    fetch(API_BASE + '/api/candidates.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            showToast('Candidate removed', 'success');
            loadCandidates();
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(function () {
        hideLoading();
        showToast('Connection error', 'error');
    });
}

function populateVoterCounties() {
    var sel = document.getElementById('voterCounty');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- County --</option>';
    COUNTIES.forEach(function (c) {
        sel.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
}

function populateVoterConstituencies() {
    var county = document.getElementById('voterCounty').value;
    var conSel = document.getElementById('voterConstituency');
    var wardSel = document.getElementById('voterWard');
    if (!conSel) return;
    conSel.innerHTML = '<option value="">-- Constituency --</option>';
    wardSel.innerHTML = '<option value="">-- Ward --</option>';
    if (!county) return;
    var list = CONSTITUENCIES[county] || [];
    list.forEach(function (c) {
        conSel.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
}

function populateVoterWards() {
    var constituency = document.getElementById('voterConstituency').value;
    var wardSel = document.getElementById('voterWard');
    if (!wardSel) return;
    wardSel.innerHTML = '<option value="">-- Ward --</option>';
    if (!constituency) { document.getElementById('voterLocation').value = ''; return; }
    var list = WARDS[constituency] || [];
    list.forEach(function (w) {
        wardSel.innerHTML += '<option value="' + w.replace(/"/g, '&quot;') + '">' + escHtml(w) + '</option>';
    });
}

document.addEventListener('change', function (e) {
    if (e.target.id === 'voterWard') {
        var ward = document.getElementById('voterWard').value;
        var constituency = document.getElementById('voterConstituency').value;
        var county = document.getElementById('voterCounty').value;
        document.getElementById('voterLocation').value = ward || constituency || county || '';
    }
});

function openVoterModal() {
    try {
        document.getElementById('voterForm').reset();
        document.getElementById('voterMsg').style.display = 'none';
        document.getElementById('voterMsg').className = 'mt-2';
        document.getElementById('voterSuccessBanner').style.display = 'none';
        document.getElementById('facePreview').style.display = 'none';
        document.getElementById('faceCaptureBtn').style.display = 'inline-block';
        document.getElementById('faceCaptureBtn').textContent = 'Capture Face';
        document.getElementById('faceCaptureBtn').disabled = false;
        document.getElementById('faceStatus').textContent = '';
        document.getElementById('faceStatus').className = 'face-status';
        var prog = document.getElementById('regLivenessProgress');
        if (prog) {
            prog.style.display = 'none';
            prog.querySelectorAll('.liveness-step').forEach(function (s) {
                s.className = 'liveness-step';
            });
        }
        capturedFaceImage = null;
        capturedFaceDescriptor = null;
        var sb = document.getElementById('voterSubmitBtn');
        if (sb) { sb.disabled = false; sb.textContent = 'Register'; }
        populateVoterCounties();
        document.getElementById('voterConstituency').innerHTML = '<option value="">-- Constituency --</option>';
        document.getElementById('voterWard').innerHTML = '<option value="">-- Ward --</option>';
        document.getElementById('voterLocation').value = '';
        document.getElementById('voterModal').style.display = 'flex';
    } catch (e) {
        console.warn('openVoterModal error:', e);
    }
}

function closeVoterModal() {
    stopFaceCapture();
    document.getElementById('voterModal').style.display = 'none';
    var sb = document.getElementById('voterSuccessBanner');
    if (sb) sb.style.display = 'none';
    var submitBtn = document.getElementById('voterSubmitBtn');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Register'; }
}

function stopFaceCapture() {
    if (faceCaptureStream) {
        faceCaptureStream.getTracks().forEach(function (t) { t.stop(); });
        faceCaptureStream = null;
    }
    const video = document.getElementById('faceCaptureVideo');
    if (video) {
        video.style.display = 'none';
        video.srcObject = null;
    }
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

function captureFace() {
    const video = document.getElementById('faceCaptureVideo');
    const canvas = document.getElementById('faceCaptureCanvas');
    const statusEl = document.getElementById('faceStatus');
    const btn = document.getElementById('faceCaptureBtn');
    const livenessEl = document.getElementById('regLivenessProgress');

    if (btn.textContent === 'Retake') {
        btn.textContent = 'Capture Face';
        capturedFaceImage = null;
        capturedFaceDescriptor = null;
        document.getElementById('facePreview').style.display = 'none';
        video.style.display = 'none';
        livenessEl.style.display = 'none';
        if (faceCaptureStream) {
            faceCaptureStream.getTracks().forEach(function (t) { t.stop(); });
            faceCaptureStream = null;
        }
        statusEl.textContent = '';
        statusEl.className = 'face-status';
        return;
    }

    if (isIOS || isSafari) {
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.muted = true;
    }

    statusEl.textContent = 'Accessing camera for liveness capture...';
    statusEl.className = 'face-status text-muted';
    livenessEl.style.display = 'flex';
    document.querySelectorAll('#regLivenessProgress .liveness-step').forEach(function (s) {
        s.className = 'liveness-step';
    });

    var ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;

    if (!isCameraSupported()) {
        statusEl.textContent = 'Camera not supported on this device.';
        statusEl.className = 'face-status text-danger';
        livenessEl.style.display = 'none';
        showToast('Camera not supported on this device.', 'error');
        return;
    }

    var constraints = getCameraConstraints();

    navigator.mediaDevices.getUserMedia(constraints)
        .then(function (stream) {
            faceCaptureStream = stream;
            video.srcObject = stream;
            video.style.display = 'block';
            video.play().catch(function () {});
            statusEl.textContent = 'Follow the prompts to capture your face...';
            statusEl.className = 'face-status text-muted';
            btn.disabled = true;

            var stepDelay = deviceType === 'mobile' ? 4000 : 5000;
            var maxDuration = deviceType === 'mobile' ? 90000 : 120000;
            var steps = ['center', 'blink', 'left', 'right', 'up', 'down'];
            var stepIndex = 0;
            var capturedFrames = {};
            var prevFrameData = null;
            var motionDetected = false;
            var startTime = Date.now();

            function processStep() {
                if (Date.now() - startTime > maxDuration) {
                    statusEl.textContent = 'Capture timed out. Please retry.';
                    statusEl.className = 'face-status text-danger';
                    btn.disabled = false;
                    btn.textContent = 'Retake';
                    stopFaceCapture();
                    showToast('Capture timed out. Please retry.', 'error');
                    return;
                }

                var step = steps[stepIndex];
                document.querySelectorAll('#regLivenessProgress .liveness-step').forEach(function (s) {
                    if (s.dataset.step === step) s.className = 'liveness-step active';
                });

                var prompts = {
                    'center': 'Look straight at the camera',
                    'blink': 'Blink your eyes',
                    'left': 'Turn your head LEFT',
                    'right': 'Turn your head RIGHT',
                    'up': 'Tilt your head UP',
                    'down': 'Tilt your head DOWN',
                };
                var promptText = prompts[step] || 'Look at camera';
                statusEl.textContent = promptText;
                speakText(promptText);

                setTimeout(function () {
                    try {
                        ctx.drawImage(video, 0, 0, 640, 480);
                    } catch (e) {
                        statusEl.textContent = 'Camera feed lost. Please retry.';
                        statusEl.className = 'face-status text-danger';
                        btn.disabled = false;
                        btn.textContent = 'Retake';
                        stopFaceCapture();
                        return;
                    }
                    var frameData = ctx.getImageData(0, 0, 640, 480);
                    capturedFrames[step] = {
                        imageData: frameData,
                        dataUrl: canvas.toDataURL('image/jpeg', 0.7)
                    };

                    if (prevFrameData) {
                        var diff = 0, samples = 0;
                        for (var i = 0; i < frameData.data.length; i += 16) {
                            diff += Math.abs(frameData.data[i] - prevFrameData.data[i]);
                            samples++;
                        }
                        if (diff / samples > 12) motionDetected = true;
                    }
                    prevFrameData = frameData;

                    document.querySelectorAll('#regLivenessProgress .liveness-step').forEach(function (s) {
                        if (s.dataset.step === step) s.className = 'liveness-step done';
                    });
                    stepIndex++;

                    if (stepIndex < steps.length) {
                        setTimeout(processStep, stepDelay);
                    } else {
                        finishRegistrationCapture(capturedFrames, motionDetected);
                    }
                }, stepDelay);
            }

            function finishRegistrationCapture(frames, hasMotion) {
                stopFaceCapture();
                video.style.display = 'none';
                livenessEl.style.display = 'none';

                if (!hasMotion) {
                    statusEl.textContent = 'Liveness check failed: no movement detected. Please retry.';
                    statusEl.className = 'face-status text-danger';
                    btn.disabled = false;
                    btn.textContent = 'Retake';
                    showToast('No movement detected. Please retry.', 'error');
                    return;
                }

                var center = frames['center'];
                if (!center) {
                    statusEl.textContent = 'Failed to capture face. Please retry.';
                    statusEl.className = 'face-status text-danger';
                    btn.disabled = false;
                    btn.textContent = 'Retake';
                    showToast('Failed to capture face. Please retry.', 'error');
                    return;
                }

                capturedFaceImage = center.dataUrl;
                capturedFaceDescriptor = JSON.stringify(computeFaceDescriptor(center.imageData));

                document.getElementById('facePreview').src = capturedFaceImage;
                document.getElementById('facePreview').style.display = 'block';

                statusEl.textContent = 'Face captured with liveness confirmation! Tilt sequence complete.';
                statusEl.className = 'face-status text-success';
                btn.textContent = 'Retake';
                btn.disabled = false;
                showToast('Face captured successfully!', 'success');
            }

            (function startDistanceCheck() {
                var dcCanvas = document.createElement('canvas');
                dcCanvas.width = 160;
                dcCanvas.height = 120;
                var dcCtx = dcCanvas.getContext('2d');
                var dcLastSpoken = '';
                var dcStartTime = Date.now();
                var dcMaxDuration = 15000;

                statusEl.textContent = 'Adjust your distance from the camera';
                statusEl.className = 'face-status text-muted';

                var dcInterval = setInterval(function () {
                    if (Date.now() - dcStartTime > dcMaxDuration) {
                        clearInterval(dcInterval);
                        statusEl.textContent = 'Distance check timed out. Please retry.';
                        statusEl.className = 'face-status text-danger';
                        btn.disabled = false;
                        btn.textContent = 'Retake';
                        stopFaceCapture();
                        showToast('Distance check timed out.', 'error');
                        return;
                    }

                    dcCtx.drawImage(video, 0, 0, 160, 120);
                    var fd = dcCtx.getImageData(0, 0, 160, 120);
                    var state = estimateFaceDistance(fd);

                    if (state === 'too_far') {
                        statusEl.textContent = 'Move closer to the camera';
                        statusEl.className = 'face-status text-warning';
                        if (dcLastSpoken !== 'closer') { speakText('Move closer'); dcLastSpoken = 'closer'; }
                    } else if (state === 'too_close') {
                        statusEl.textContent = 'Move back from the camera';
                        statusEl.className = 'face-status text-warning';
                        if (dcLastSpoken !== 'back') { speakText('Move back'); dcLastSpoken = 'back'; }
                    } else {
                        statusEl.textContent = 'Don\'t move';
                        statusEl.className = 'face-status text-success';
                        if (dcLastSpoken !== 'dontmove') { speakText('Don\'t move'); dcLastSpoken = 'dontmove'; }
                        clearInterval(dcInterval);
                        setTimeout(function () {
                            statusEl.textContent = 'Follow the prompts to capture your face...';
                            statusEl.className = 'face-status text-muted';
                            startTime = Date.now();
                            processStep();
                        }, 800);
                    }
                }, 600);
            })();
        })
        .catch(function (err) {
            var msg = 'Camera access denied.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = deviceType === 'mobile' ?
                    'Camera permission denied. Please enable camera in your browser settings.' :
                    'Camera permission denied. Please allow camera access.';
            } else if (err.name === 'NotFoundError') {
                msg = 'No camera found on this device.';
            } else if (err.name === 'NotReadableError') {
                msg = 'Camera is busy. Please close other apps using the camera.';
            }
            statusEl.textContent = msg;
            statusEl.className = 'face-status text-danger';
            livenessEl.style.display = 'none';
            showToast(msg, 'error');
        });
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

function computeFaceDescriptor(imageData) {
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
    return features.map(function (v) { return (v - mean) / std });
}

function getDeviceInfo() {
    var info = navigator.userAgent;
    if (navigator.platform) info += ' | Platform: ' + navigator.platform;
    if (navigator.language) info += ' | Lang: ' + navigator.language;
    if (screen.width && screen.height) info += ' | Screen: ' + screen.width + 'x' + screen.height;
    return info;
}

function addVoter(e) {
    e.preventDefault();
    const full_name = document.getElementById('voterFullName').value;
    const voter_id = document.getElementById('voterIdInput').value;
    const msg = document.getElementById('voterMsg');
    const successBanner = document.getElementById('voterSuccessBanner');
    const successText = document.getElementById('voterSuccessText');
    const submitBtn = document.getElementById('voterSubmitBtn');

    if (!/^(?:\d{6,9}|[A-Za-z]\d{7})$/.test(voter_id)) {
        msg.style.display = 'block';
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Use 6-9 digit National ID or Passport (1 letter + 7 digits).';
        showToast('Invalid ID format.', 'error');
        return false;
    }

    if (!capturedFaceImage) {
        showToast('Please capture face first.', 'warning');
        return false;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> Registering...'; }
    msg.style.display = 'none';

    var location = document.getElementById('voterLocation').value;
    if (!location) {
        msg.style.display = 'block';
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Please select registration location (County, Constituency, and Ward).';
        showToast('Please select registration location.', 'warning');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Register'; }
        return false;
    }

    var body = { action: 'register', full_name: full_name, voter_id: voter_id, location: location, device_info: getDeviceInfo() };
    if (capturedFaceImage) {
        body.face_image = capturedFaceImage;
    }
    if (capturedFaceDescriptor) {
        body.face_descriptor = capturedFaceDescriptor;
    }

    var doRegister = function (body) {
        showLoading('Registering voter...');
        fetch(API_BASE + '/api/voters.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(function (r) {
            return r.text().then(function (text) {
                try { return JSON.parse(text); }
                catch (e) {
                    throw new Error('Server returned: ' + text.substring(0, 200));
                }
            });
        })
        .then(data => {
            hideLoading();
            msg.style.display = 'block';
            if (data.success) {
                msg.className = 'text-success mt-2';
                msg.textContent = 'Voter registered successfully!';
                successText.textContent = full_name.toUpperCase() + ' (ID: ' + voter_id + ') registered successfully!';
                successBanner.style.display = 'flex';
                showToast('Voter registered successfully!', 'success');
                setTimeout(function () {
                    closeVoterModal();
                    successBanner.style.display = 'none';
                    loadVoters();
                }, 1500);
            } else {
                msg.className = 'text-danger mt-2';
                msg.textContent = data.message;
                successBanner.style.display = 'none';
                showToast(data.message, 'error');
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Register'; }
            setTimeout(function () { msg.style.display = 'none'; }, 3000);
        })
        .catch(function (err) {
            hideLoading();
            msg.style.display = 'block';
            msg.className = 'text-danger mt-2';
            msg.textContent = err.message || 'Connection error. Please try again.';
            showToast(err.message || 'Connection error', 'error');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Register'; }
        });
    };

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(function (pos) {
            body.location_lat = pos.coords.latitude;
            body.location_lng = pos.coords.longitude;
            doRegister(body);
        }, function () {
            doRegister(body);
        }, { timeout: 5000, enableHighAccuracy: true });
    } else {
        doRegister(body);
    }
    return false;
}

function removeVoter(id) {
    if (!confirm('Remove this voter? Their voting record will also be deleted.')) return;
    showLoading('Removing voter...');
    fetch(API_BASE + '/api/voters.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            showToast('Voter removed', 'success');
            loadVoters();
        } else {
            showToast(data.message, 'error');
        }
    })
    .catch(function () {
        hideLoading();
        showToast('Connection error', 'error');
    });
}

function loadVoters() {
    fetch(API_BASE + '/api/voters.php')
        .then(function (r) {
            return r.text().then(function (text) {
                try { return JSON.parse(text); }
                catch (e) { throw new Error('Server returned: ' + text.substring(0, 200)); }
            });
        })
        .then(data => {
            const tbody = document.getElementById('voterTableBody');
            const count = document.getElementById('voterCount');
            if (!data.success) { tbody.innerHTML = '<tr><td colspan="8" class="text-danger">Failed to load: ' + escHtml(data.message || 'Unknown error') + '</td></tr>'; return; }
            count.textContent = data.voters.length + ' registered';
            if (data.voters.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-muted">No voters registered</td></tr>';
                return;
            }
            tbody.innerHTML = data.voters.map(function (v, i) {
                var faceHtml = v.face_descriptor ? '<span class="badge badge-success">Face enrolled</span>' : '<span class="badge badge-warning">No face</span>';
                if (v.face_image) {
                    faceHtml = '<div class="face-row"><img src="' + v.face_image + '" class="face-thumb" alt="face"> ' + faceHtml + '</div>';
                }
                return '<tr>' +
                    '<td data-label="#">' + (i + 1) + '</td>' +
                    '<td data-label="Name"><strong>' + escHtml(v.full_name) + '</strong></td>' +
                    '<td data-label="Voter ID">' + escHtml(v.voter_id) + '</td>' +
                    '<td data-label="Location">' + escHtml(v.location || '') + '</td>' +
                    '<td data-label="Status"><span class="badge ' + (v.has_voted == 1 ? 'badge-success' : 'badge-warning') + '">' + (v.has_voted == 1 ? 'Voted' : 'Not Voted') + '</span></td>' +
                    '<td data-label="Face">' + faceHtml + '</td>' +
                    '<td data-label="Registered">' + v.created_at + '</td>' +
                    '<td data-label="Action" class="action-cell">' +
                    '<button class="btn btn-sm btn-danger" onclick="removeVoter(' + v.id + ')">Remove</button>' +
                    '</td>' +
                    '</tr>';
            }).join('');
        }).catch(function (err) {
            var tbody = document.getElementById('voterTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-danger">Failed to load: ' + err.message + '</td></tr>';
        });
}

function loadSettings() {
    fetch(API_BASE + '/api/settings.php')
        .then(r => r.json())
        .then(data => {
            if (!data.success || !data.settings) return;
            const s = data.settings;
            document.getElementById('startTime').value = s.start_time ? s.start_time.slice(0, 16) : '';
            document.getElementById('endTime').value = s.end_time ? s.end_time.slice(0, 16) : '';
            document.getElementById('isActive').checked = s.is_active == 1;
        });
}

function updateSettings(e) {
    e.preventDefault();
    const start_time = document.getElementById('startTime').value;
    const end_time = document.getElementById('endTime').value;
    const is_active = document.getElementById('isActive').checked ? 1 : 0;
    const msg = document.getElementById('settingsMsg');
    const btn = e.target.querySelector('button[type="submit"]');

    if (start_time >= end_time) {
        showToast('End time must be after start time.', 'error');
        return false;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

    fetch(API_BASE + '/api/settings.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: start_time, end_time: end_time, is_active: is_active })
    })
    .then(r => r.json())
    .then(data => {
        msg.style.display = 'block';
        msg.className = data.success ? 'text-success mt-2' : 'text-danger mt-2';
        msg.textContent = data.message;
        if (data.success) {
            showToast('Settings saved successfully!', 'success');
        } else {
            showToast(data.message, 'error');
        }
        btn.disabled = false;
        btn.innerHTML = 'Save Settings';
        setTimeout(function () { msg.style.display = 'none'; }, 3000);
    })
    .catch(function () {
        showToast('Connection error', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Save Settings';
    });
    return false;
}

function startVoting() {
    const msg = document.getElementById('quickMsg');
    showLoading('Starting voting session...');
    fetch(API_BASE + '/api/settings.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        msg.style.display = 'block';
        msg.className = data.success ? 'text-success mt-2' : 'text-danger mt-2';
        msg.textContent = data.message;
        if (data.success) {
            showToast('Voting started!', 'success');
            loadSettings();
            loadElectionStatus();
        } else {
            showToast(data.message, 'error');
        }
        setTimeout(function () { msg.style.display = 'none'; }, 3000);
    })
    .catch(function () {
        hideLoading();
        showToast('Connection error', 'error');
    });
}

function stopVoting() {
    if (!confirm('Stop voting immediately? This will end the election.')) return;
    const msg = document.getElementById('quickMsg');
    showLoading('Stopping voting...');
    fetch(API_BASE + '/api/settings.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
    })
    .then(r => r.json())
    .then(data => {
        hideLoading();
        msg.style.display = 'block';
        msg.className = data.success ? 'text-success mt-2' : 'text-danger mt-2';
        msg.textContent = data.message;
        if (data.success) {
            showToast('Voting stopped', 'warning');
            loadSettings();
            loadElectionStatus();
            loadVoters();
        } else {
            showToast(data.message, 'error');
        }
        setTimeout(function () { msg.style.display = 'none'; }, 3000);
    })
    .catch(function () {
        hideLoading();
        showToast('Connection error', 'error');
    });
}

function loadResults() {
    fetch(API_BASE + '/api/results.php')
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                document.getElementById('resultsContainer').innerHTML = '<p class="text-danger">Failed to load: ' + escHtml(data.message || 'Unknown error') + '</p>';
                return;
            }

            animateValue(document.getElementById('totalVoters'), 0, data.summary.total_voters, 600);
            animateValue(document.getElementById('votersVoted'), 0, data.summary.voters_voted, 600);
            document.getElementById('turnoutPct').textContent = data.summary.turnout_percentage + '%';

            const container = document.getElementById('resultsContainer');
            if (!data.results.length) {
                container.innerHTML = '<p class="text-muted">No results yet.</p>';
                return;
            }

            container.innerHTML = data.results.map(function (pos) {
                const total = pos.total_votes;
                const candidates = pos.candidates || [];

                    var barsHtml = candidates.map(function (c) {
                        const pct = total > 0 ? (c.vote_count / total * 100) : 0;
                        var photoImg = c.photo_url ? '<img src="../' + c.photo_url + '" class="cand-photo-sm"> ' : '';
                        var symbolImg = c.party_symbol ? '<img src="../' + c.party_symbol + '" class="cand-symbol-sm"> ' : '';
                        return '<div class="result-row ' + (c.id === (pos.winner && pos.winner.id) ? 'winner' : '') + '">' +
                            '<div class="result-info">' +
                            '<span class="candidate-name">' + photoImg + symbolImg + '<strong>' + escHtml(c.name) + '</strong> ' + (c.party ? '(' + escHtml(c.party) + ')' : '') + '</span>' +
                            '<span class="vote-count">' + c.vote_count + ' votes (' + pct.toFixed(1) + '%)</span>' +
                            '</div>' +
                            '<div class="progress-bar-container">' +
                            '<div class="progress-bar" style="width:' + pct + '%"></div>' +
                            '</div>' +
                            (c.id === (pos.winner && pos.winner.id) && c.vote_count > 0 ? '<span class="winner-badge">WINNER</span>' : '') +
                            '</div>';
                    }).join('');

                return '<div class="position-results">' +
                    '<div class="position-header">' +
                    '<h3>' + escHtml(pos.position_name) + '</h3>' +
                    '<span class="total-badge">Total: ' + total + ' votes</span>' +
                    (pos.winner && pos.winner.vote_count > 0 ? '<span class="winner-name">Leading: ' + escHtml(pos.winner.name) + ' (' + pos.winner.vote_count + ' votes)</span>' : '<span class="winner-name">No votes yet</span>') +
                    '</div>' +
                    '<div class="results-list">' +
                    barsHtml +
                    '</div>' +
                    '</div>';
            }).join('');
        })
        .catch(function () {
            document.getElementById('resultsContainer').innerHTML = '<p class="text-danger">Failed to load results. Check connection.</p>';
        });
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    document.querySelector('.tab-btn[onclick*="' + tab + '"]').classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
}

function toggleNav() {
    document.querySelector('.nav-links').classList.toggle('open');
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function escJsStr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function searchVoterForTransfer(e) {
    e.preventDefault();
    var query = document.getElementById('transferSearchInput').value.trim();
    var msg = document.getElementById('transferSearchMsg');

    if (!query) {
        msg.style.display = 'block';
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Please enter a voter ID or name.';
        return false;
    }

    msg.style.display = 'none';
    showLoading('Searching voter...');

    var isId = /^(?:\d{6,9}|[A-Za-z]\d{7})$/.test(query);
    var url = API_BASE + '/api/voters.php?search=' + encodeURIComponent(query);

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            hideLoading();
            if (data.success && data.voters && data.voters.length > 0) {
                if (data.voters.length === 1) {
                    displayTransferVoter(data.voters[0]);
                } else {
                    var list = '<div class="search-results-list"><p style="margin-bottom:8px;font-weight:600;">' + data.voters.length + ' voters found. Click a voter to transfer:</p>';
                    data.voters.forEach(function (v) {
                        var statusBadge = v.has_voted == 1 ? '<span class="badge badge-success" style="font-size:11px;">Voted</span>' : '<span class="badge badge-warning" style="font-size:11px;">Not Voted</span>';
                        list += '<div class="search-result-item" onclick="displayTransferVoter(' + JSON.stringify(v).replace(/"/g, '&quot;') + ')">' +
                            '<div class="search-result-main"><strong>' + escHtml(v.full_name) + '</strong> <span style="color:var(--text-muted);font-size:13px;">' + escHtml(v.voter_id) + '</span> ' + statusBadge + '</div>' +
                            '<div class="search-result-location">&#128205; ' + escHtml(v.location || 'No location registered') + '</div>' +
                            '</div>';
                    });
                    list += '</div>';
                    msg.style.display = 'block';
                    msg.className = 'mt-2';
                    msg.innerHTML = list;
                }
            } else {
                msg.style.display = 'block';
                msg.className = 'text-danger mt-2';
                msg.textContent = 'No voter found with that ID or name.';
            }
        })
        .catch(function () {
            hideLoading();
            msg.style.display = 'block';
            msg.className = 'text-danger mt-2';
            msg.textContent = 'Connection error. Please try again.';
        });
    return false;
}

function displayTransferVoter(voter) {
    document.getElementById('transferVoterName').textContent = voter.full_name.toUpperCase();
    document.getElementById('transferVoterId').textContent = voter.voter_id;
    document.getElementById('transferCurrentLocation').textContent = voter.location || 'Not registered at any location';
    document.getElementById('transferVoterDbId').value = voter.id;
    document.getElementById('transferVoterInfo').style.display = 'block';
    document.getElementById('transferSearchMsg').style.display = 'none';

    populateTransferCounties();

    if (voter.location) {
        setTimeout(function () {
            autoSelectTransferLocation(voter.location);
        }, 300);
    }
}

function autoSelectTransferLocation(location) {
    var countyEl = document.getElementById('transferCounty');
    var conEl = document.getElementById('transferConstituency');
    var wardEl = document.getElementById('transferWard');

    for (var c in CONSTITUENCIES) {
        var cons = CONSTITUENCIES[c];
        for (var i = 0; i < cons.length; i++) {
            var con = cons[i];
            var wards = WARDS[con] || [];
            if (wards.indexOf(location) !== -1) {
                countyEl.value = c;
                populateTransferConstituencies();
                setTimeout(function () {
                    conEl.value = con;
                    populateTransferWards();
                    setTimeout(function () {
                        wardEl.value = location;
                        syncTransferLocation();
                    }, 100);
                }, 100);
                return;
            }
            if (con === location) {
                countyEl.value = c;
                populateTransferConstituencies();
                setTimeout(function () {
                    conEl.value = location;
                    syncTransferLocation();
                }, 100);
                return;
            }
        }
    }
    if (COUNTIES.indexOf(location) !== -1) {
        countyEl.value = location;
        populateTransferConstituencies();
        syncTransferLocation();
    }

    document.getElementById('transferNewLocation').value = voter.location || '';
}

function populateTransferCounties() {
    var sel = document.getElementById('transferCounty');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select County --</option>';
    COUNTIES.forEach(function (c) {
        sel.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
    document.getElementById('transferConstituency').innerHTML = '<option value="">-- Select Constituency --</option>';
    document.getElementById('transferWard').innerHTML = '<option value="">-- Select Ward --</option>';
    document.getElementById('transferNewLocation').value = '';
}

function populateTransferConstituencies() {
    var county = document.getElementById('transferCounty').value;
    var conSel = document.getElementById('transferConstituency');
    var wardSel = document.getElementById('transferWard');
    if (!conSel) return;
    conSel.innerHTML = '<option value="">-- Constituency --</option>';
    wardSel.innerHTML = '<option value="">-- Ward --</option>';
    if (!county) return;
    var list = CONSTITUENCIES[county] || [];
    list.forEach(function (c) {
        conSel.innerHTML += '<option value="' + c.replace(/"/g, '&quot;') + '">' + escHtml(c) + '</option>';
    });
    syncTransferLocation();
}

function populateTransferWards() {
    var constituency = document.getElementById('transferConstituency').value;
    var wardSel = document.getElementById('transferWard');
    if (!wardSel) return;
    wardSel.innerHTML = '<option value="">-- Ward --</option>';
    if (!constituency) { syncTransferLocation(); return; }
    var list = WARDS[constituency] || [];
    list.forEach(function (w) {
        wardSel.innerHTML += '<option value="' + w.replace(/"/g, '&quot;') + '">' + escHtml(w) + '</option>';
    });
    syncTransferLocation();
}

function syncTransferLocation() {
    var ward = document.getElementById('transferWard').value;
    var constituency = document.getElementById('transferConstituency').value;
    var county = document.getElementById('transferCounty').value;
    document.getElementById('transferNewLocation').value = ward || constituency || county || '';
}

function processVoterTransfer() {
    var voterDbId = document.getElementById('transferVoterDbId').value;
    var newLocation = document.getElementById('transferNewLocation').value;
    var msg = document.getElementById('transferMsg');

    if (!voterDbId || !newLocation) {
        msg.style.display = 'block';
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Please select a complete location (County, Constituency, and Ward).';
        return;
    }

    if (!confirm('Transfer this voter to "' + newLocation + '"?')) return;

    msg.style.display = 'none';
    showLoading('Transferring voter...');

    fetch(API_BASE + '/api/voters.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transfer', voter_id: parseInt(voterDbId), location: newLocation })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        hideLoading();
        msg.style.display = 'block';
        if (data.success) {
            msg.className = 'text-success mt-2';
            msg.textContent = 'Voter transferred successfully! From: ' + data.voter.old_location + ' To: ' + data.voter.new_location;
            showToast('Voter transferred successfully!', 'success');
            document.getElementById('transferCurrentLocation').textContent = newLocation;
            loadTransferHistory();
            loadVoters();
        } else {
            msg.className = 'text-danger mt-2';
            msg.textContent = data.message;
            showToast(data.message, 'error');
        }
    })
    .catch(function () {
        hideLoading();
        msg.style.display = 'block';
        msg.className = 'text-danger mt-2';
        msg.textContent = 'Connection error.';
        showToast('Connection error.', 'error');
    });
}

function resetTransferForm() {
    document.getElementById('transferSearchInput').value = '';
    document.getElementById('transferSearchMsg').style.display = 'none';
    document.getElementById('transferSearchMsg').innerHTML = '';
    document.getElementById('transferVoterInfo').style.display = 'none';
    document.getElementById('transferMsg').style.display = 'none';
    document.getElementById('transferCounty').innerHTML = '<option value="">-- County --</option>';
    document.getElementById('transferConstituency').innerHTML = '<option value="">-- Constituency --</option>';
    document.getElementById('transferWard').innerHTML = '<option value="">-- Ward --</option>';
    document.getElementById('transferNewLocation').value = '';
    document.getElementById('transferVoterDbId').value = '';
}

function loadTransferHistory() {
    fetch(API_BASE + '/api/voters.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transfer_history' })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        var tbody = document.getElementById('transferHistoryBody');
        if (!tbody) return;
        if (data.success && data.history && data.history.length > 0) {
            tbody.innerHTML = data.history.map(function (h, i) {
                return '<tr>' +
                    '<td>' + (i + 1) + '</td>' +
                    '<td><strong>' + escHtml(h.voter_name) + '</strong><br><small>' + escHtml(h.voter_id_number) + '</small></td>' +
                    '<td>' + escHtml(h.from_location || '-') + '</td>' +
                    '<td>' + escHtml(h.to_location) + '</td>' +
                    '<td>' + h.created_at + '</td>' +
                    '</tr>';
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No transfers yet</td></tr>';
        }
    })
    .catch(function () {});
}

document.addEventListener('change', function (e) {
    if (e.target.id === 'transferCounty' || e.target.id === 'transferConstituency' || e.target.id === 'transferWard') {
        syncTransferLocation();
    }
});
