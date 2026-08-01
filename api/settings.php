<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'GET') {
    $settings = $conn->query("SELECT * FROM election_settings ORDER BY id DESC LIMIT 1")->fetch_assoc();

    $positions = $conn->query("SELECT * FROM positions ORDER BY display_order")->fetch_all(MYSQLI_ASSOC);

    echo json_encode([
        'success' => true,
        'settings' => $settings,
        'positions' => $positions
    ]);
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
    $action = $data['action'] ?? '';

    if ($action === 'start') {
        $now = date('Y-m-d H:i:s');
        $end_time_default = date('Y-m-d H:i:s', strtotime('+7 days'));
        $existing = $conn->query("SELECT id FROM election_settings ORDER BY id DESC LIMIT 1")->fetch_assoc();
        if ($existing) {
            $stmt = $conn->prepare("UPDATE election_settings SET start_time = ?, end_time = ?, is_active = 1 WHERE id = ?");
            $stmt->bind_param("ssi", $now, $end_time_default, $existing['id']);
        } else {
            $stmt = $conn->prepare("INSERT INTO election_settings (start_time, end_time, is_active) VALUES (?, ?, 1)");
            $stmt->bind_param("ss", $now, $end_time_default);
        }
        $stmt->execute();
        echo json_encode(['success' => true, 'message' => 'Voting started']);
        exit;
    }

    if ($action === 'stop') {
        $now = date('Y-m-d H:i:s');
        $existing = $conn->query("SELECT id FROM election_settings ORDER BY id DESC LIMIT 1")->fetch_assoc();
        if ($existing) {
            $stmt = $conn->prepare("UPDATE election_settings SET end_time = ?, is_active = 0 WHERE id = ?");
            $stmt->bind_param("si", $now, $existing['id']);
            $stmt->execute();
        }
        echo json_encode(['success' => true, 'message' => 'Voting stopped. Results preserved for reference.']);
        exit;
    }

    $start_time = $data['start_time'] ?? '';
    $end_time = $data['end_time'] ?? '';
    $is_active = isset($data['is_active']) ? intval($data['is_active']) : 1;

    if (empty($start_time) || empty($end_time)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Start time and end time are required']);
        exit;
    }

    $existing = $conn->query("SELECT id FROM election_settings ORDER BY id DESC LIMIT 1")->fetch_assoc();

    if ($existing) {
        $stmt = $conn->prepare("UPDATE election_settings SET start_time = ?, end_time = ?, is_active = ? WHERE id = ?");
        $stmt->bind_param("ssii", $start_time, $end_time, $is_active, $existing['id']);
    } else {
        $stmt = $conn->prepare("INSERT INTO election_settings (start_time, end_time, is_active) VALUES (?, ?, ?)");
        $stmt->bind_param("ssi", $start_time, $end_time, $is_active);
    }

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Settings updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update settings']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
