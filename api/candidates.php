<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/database.php';

function saveImageFromBase64($base64, $subdir) {
    if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $base64, $matches)) {
        $ext = $matches[1];
        if (!in_array($ext, ['jpeg', 'jpg', 'png', 'gif', 'webp'])) {
            $ext = 'png';
        }
        $data = base64_decode($matches[2]);
        if ($data === false) return '';
        $filename = uniqid('cand_') . '.' . $ext;
        $dir = __DIR__ . '/../uploads/' . $subdir . '/';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        file_put_contents($dir . $filename, $data);
        return 'uploads/' . $subdir . '/' . $filename;
    }
    return '';
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'GET') {
    $position_id = isset($_GET['position_id']) ? intval($_GET['position_id']) : 0;

    if ($position_id > 0) {
        $stmt = $conn->prepare("
            SELECT c.*, p.name AS position_name, p.`level`
            FROM candidates c
            JOIN positions p ON c.position_id = p.id
            WHERE c.position_id = ?
            ORDER BY c.name
        ");
        $stmt->bind_param("i", $position_id);
    } else {
        $stmt = $conn->prepare("
            SELECT c.*, p.name AS position_name, p.`level`
            FROM candidates c
            JOIN positions p ON c.position_id = p.id
            ORDER BY p.display_order, c.name
        ");
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $candidates = $result->fetch_all(MYSQLI_ASSOC);

    echo json_encode(['success' => true, 'candidates' => $candidates]);
    exit;
}

if ($method === 'POST') {
    session_start();
    if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    $name = trim($data['name'] ?? '');
    $position_id = intval($data['position_id'] ?? 0);
    $party = trim($data['party'] ?? '');
    $location = trim($data['location'] ?? '');

    if (empty($name) || $position_id === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Name and position are required']);
        exit;
    }

    $stmt = $conn->prepare("SELECT id FROM candidates WHERE name = ? AND position_id = ?");
    $stmt->bind_param("si", $name, $position_id);
    $stmt->execute();
    if ($stmt->get_result()->fetch_assoc()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'A candidate with this name is already registered for this position']);
        exit;
    }

    $photo_url = '';
    if (!empty($data['photo_base64'])) {
        $photo_url = saveImageFromBase64($data['photo_base64'], 'candidates');
    }

    $party_symbol = '';
    if (!empty($data['symbol_base64'])) {
        $party_symbol = saveImageFromBase64($data['symbol_base64'], 'candidates');
    }

    $stmt = $conn->prepare("INSERT INTO candidates (name, position_id, party, location, photo_url, party_symbol) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sissss", $name, $position_id, $party, $location, $photo_url, $party_symbol);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Candidate enrolled successfully', 'id' => $stmt->insert_id]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to enroll candidate: ' . $conn->error]);
    }
    exit;
}

if ($method === 'PUT') {
    session_start();
    if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id = intval($data['id'] ?? 0);
    $name = trim($data['name'] ?? '');
    $position_id = intval($data['position_id'] ?? 0);
    $party = trim($data['party'] ?? '');
    $location = trim($data['location'] ?? '');

    if ($id === 0 || empty($name) || $position_id === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID, name, and position are required']);
        exit;
    }

    $photo_url = trim($data['photo_url'] ?? '');
    if (!empty($data['photo_base64'])) {
        $photo_url = saveImageFromBase64($data['photo_base64'], 'candidates');
    }

    $party_symbol = trim($data['party_symbol'] ?? '');
    if (!empty($data['symbol_base64'])) {
        $party_symbol = saveImageFromBase64($data['symbol_base64'], 'candidates');
    }

    $stmt = $conn->prepare("UPDATE candidates SET name = ?, position_id = ?, party = ?, location = ?, photo_url = ?, party_symbol = ? WHERE id = ?");
    $stmt->bind_param("sissssi", $name, $position_id, $party, $location, $photo_url, $party_symbol, $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Candidate updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update candidate: ' . $conn->error]);
    }
    exit;
}

if ($method === 'DELETE') {
    session_start();
    if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id = intval($data['id'] ?? 0);

    if ($id === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Candidate ID is required']);
        exit;
    }

    $stmt = $conn->prepare("DELETE FROM candidates WHERE id = ?");
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Candidate removed successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to remove candidate']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
