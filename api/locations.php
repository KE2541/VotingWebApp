<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$county = trim($_GET['county'] ?? '');

$constituencies = [
    'Bomet' => ['Sotik', 'Chepalungu', 'Bomet East', 'Bomet Central', 'Konoin'],
    "Tharaka Nithi" => ["Chuka/Igambang'ombe", 'Maara', 'Tharaka'],
    'Nairobi' => ['Dagoretti North', 'Dagoretti South', 'Embakasi Central', 'Embakasi East', 'Embakasi North', 'Embakasi South', 'Embakasi West', 'Kamukunji', 'Kasarani', 'Kibra', "Lang'ata", 'Makadara', 'Mathare', 'Roysambu', 'Ruaraka', 'Starehe', 'Westlands'],
    'Homa Bay' => ['Homa Bay Town', 'Kabondo Kasipul', 'Karachuonyo', 'Kasipul', 'Rangwe', 'Ndhiwa', 'Suba North', 'Suba South']
];

$wards = [
    'Sotik' => ['Ndanai/Abosi', 'Chemagel', 'Kipsonoi', 'Kapletundo', 'Rongena/Maranet'],
    'Chepalungu' => ["Kong'asis", 'Nyangores', 'Sigor', 'Chebunyo', 'Siongiroi'],
    'Bomet East' => ['Merigi', 'Kembu', 'Longisa', 'Kipreres', 'Chemaner'],
    'Bomet Central' => ['Silibwet Township', 'Ndaraweta', 'Singorwet', 'Chesoen', 'Mutarakwa'],
    'Konoin' => ['Chepchabas', 'Kimulot', 'Mogogosiek', 'Boito', 'Embomos'],
    "Chuka/Igambang'ombe" => ['Mariani', 'Karingani', 'Magumoni', 'Mugwe', "Igambang'ombe"],
    'Maara' => ['Mitheru', 'Muthambi', 'Mwimbi', 'Ganga', 'Chogoria'],
    'Tharaka' => ['Gatunga', 'Mukothima', 'Nkondi', 'Chiakariga', 'Marimanti'],
    'Dagoretti North' => ['Kilimani', 'Kawangware', 'Gatina', 'Kileleshwa', 'Kabiro'],
    'Dagoretti South' => ['Mutuini', 'Ngando', 'Riruta', 'Uthiru/Ruthimitu', 'Waithaka'],
    'Embakasi Central' => ['Kayole North', 'Kayole Central', 'Kayole South', 'Komarock', 'Matopeni'],
    'Embakasi East' => ['Upper Savannah', 'Lower Savannah', 'Embakasi', 'Utawala', 'Mihango'],
    'Embakasi North' => ['Kariobangi North', 'Dandora Area I', 'Dandora Area II', 'Dandora Area III', 'Dandora Area IV'],
    'Embakasi South' => ['Imara Daima', 'Kwa Njenga', 'Kwa Reuben', 'Pipeline', 'Kware'],
    'Embakasi West' => ['Umoja I', 'Umoja II', 'Mowlem', 'Kariobangi South'],
    'Kamukunji' => ['Pumwani', 'Eastleigh North', 'Eastleigh South', 'Airbase', 'California'],
    'Kasarani' => ['Claycity', 'Mwiki', 'Kasarani', 'Njiru', 'Ruai'],
    'Kibra' => ['Laini Saba', 'Lindi', 'Makina', 'Woodley/Kenyatta Golf', 'Sarangombe'],
    "Lang'ata" => ['Karen', 'Nairobi West', 'Mugumo-Ini', 'South-C', 'Nyayo Highrise'],
    'Makadara' => ['Makongeni', 'Maringo/Hamza', 'Harambee', 'Viwandani'],
    'Mathare' => ['Hospital', 'Mabatini', 'Huruma', 'Ngei', 'Mlango Kubwa', 'Kiamaiko'],
    'Roysambu' => ['Githurai', 'Kahawa West', 'Zimmerman', 'Roysambu', 'Kahawa'],
    'Ruaraka' => ['Baba Dogo', 'Utalii', 'Mathare North', 'Lucky Summer', 'Korogocho'],
    'Starehe' => ['Nairobi Central', 'Ngara', 'Ziwani/Kariokor', 'Pangani', 'Landimawe', 'Nairobi South'],
    'Westlands' => ['Kitisuru', 'Parklands/Highridge', 'Karura', 'Kangemi', 'Mountain View'],
    'Homa Bay Town' => ['Homa Bay Central', 'Homa Bay Arujo', 'Homa Bay West', 'Homa Bay East'],
    'Kabondo Kasipul' => ['Kabondo East', 'Kabondo West', 'Kokwanyo/Kakelo', 'Kojwach'],
    'Karachuonyo' => ['West Karachuonyo', 'North Karachuonyo', 'Central', 'Kanyaluo', 'Kibiri', 'Wangchieng', 'Kendu Bay Town'],
    'Kasipul' => ['West Kasipul', 'South Kasipul', 'Central Kasipul', 'East Kamagak', 'West Kamagak'],
    'Rangwe' => ['West Gem', 'East Gem', 'Kagan', 'Kochia'],
    'Ndhiwa' => ['Kwabwai', 'Kanyadoto', 'Kanyikela', 'North Kabuoch', 'Kabuoch South/Pala', 'Kanyamwa Kologi', 'Kanyamwa Kosewe'],
    'Suba North' => ['Mfangano Island', 'Rusinga Island', 'Kasgunga', 'Gembe', 'Lambwe'],
    'Suba South' => ['Gwassi South', 'Gwassi North', 'Kaksingri West', 'Ruma Kaksingri East']
];

if ($county) {
    $countyConstituencies = $constituencies[$county] ?? [];
    $countyWards = [];
    foreach ($countyConstituencies as $c) {
        $countyWards[$c] = $wards[$c] ?? [];
    }
    echo json_encode([
        'success' => true,
        'constituencies' => $countyConstituencies,
        'wards' => $countyWards
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'counties' => array_keys($constituencies),
    'constituencies' => $constituencies,
    'wards' => $wards
]);
