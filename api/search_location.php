<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

mysqli_report(MYSQLI_REPORT_OFF);

set_error_handler(function ($severity, $message, $file, $line) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $message]);
    exit;
});

register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        ob_clean();
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Fatal error: ' . $error['message']]);
    }
});

require_once __DIR__ . '/../config/database.php';

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

$q = trim($_GET['q'] ?? '');

if (empty($q)) {
    echo json_encode(['success' => true, 'candidates' => []]);
    exit;
}

$search = '%' . $q . '%';

$stmt = $conn->prepare("
    SELECT c.id, c.name, c.party, c.location,
           p.name AS position_name, p.`level`
    FROM candidates c
    JOIN positions p ON c.position_id = p.id
    WHERE c.location LIKE ?
    ORDER BY p.display_order, c.name
");
if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
$stmt->bind_param("s", $search);
$stmt->execute();
$candidates = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

echo json_encode(['success' => true, 'candidates' => $candidates]);
