<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$voter_id = intval($data['voter_id'] ?? 0);
$votes = $data['votes'] ?? [];
$face_descriptor = $data['face_descriptor'] ?? null;
$location_lat = isset($data['location_lat']) ? floatval($data['location_lat']) : null;
$location_lng = isset($data['location_lng']) ? floatval($data['location_lng']) : null;
$device_info = $data['device_info'] ?? null;
$ip_address = $_SERVER['REMOTE_ADDR'] ?? null;

if ($voter_id === 0 || empty($votes)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Voter ID and at least one vote are required']);
    exit;
}

$settings = $conn->query("SELECT * FROM election_settings ORDER BY id DESC LIMIT 1")->fetch_assoc();
if ($settings) {
    $now = new DateTime();
    $start = new DateTime($settings['start_time']);
    $end = new DateTime($settings['end_time']);

    if ($now < $start) {
        echo json_encode(['success' => false, 'message' => 'Voting has not started yet']);
        exit;
    }
    if ($now > $end) {
        echo json_encode(['success' => false, 'message' => 'Voting has ended']);
        exit;
    }
    if (!$settings['is_active']) {
        echo json_encode(['success' => false, 'message' => 'Voting is currently disabled']);
        exit;
    }
}

$stmt = $conn->prepare("SELECT has_voted FROM voters WHERE id = ?");
$stmt->bind_param("i", $voter_id);
$stmt->execute();
$voter = $stmt->get_result()->fetch_assoc();

if (!$voter) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Voter not found']);
    exit;
}

if ($voter['has_voted']) {
    echo json_encode(['success' => false, 'message' => 'You have already cast your vote. Repeat voting is not allowed.']);
    exit;
}

if (!empty($voter['face_descriptor'])) {
    if (empty($face_descriptor)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Face verification required. Please capture your face.']);
        exit;
    }
    $stored = json_decode($voter['face_descriptor'], true);
    $current = json_decode($face_descriptor, true);
    if (!$stored || !$current || count($stored) !== count($current)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Face verification failed. Invalid face data.']);
        exit;
    }
    $distance = 0;
    for ($i = 0; $i < count($stored); $i++) {
        $distance += pow($stored[$i] - $current[$i], 2);
    }
    $distance = sqrt($distance);
    if ($distance > 0.75) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Face verification failed. Face does not match registered voter.']);
        exit;
    }
}

$candidate_ids = [];
$position_ids = [];
foreach ($votes as $v) {
    $cid = intval($v['candidate_id'] ?? 0);
    $pid = intval($v['position_id'] ?? 0);
    if ($cid === 0 || $pid === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Each vote must have a candidate_id and position_id']);
        exit;
    }
    $candidate_ids[] = $cid;
    $position_ids[] = $pid;
}

$placeholders = implode(',', array_fill(0, count($candidate_ids), '?'));
$types = str_repeat('i', count($candidate_ids));
$stmt = $conn->prepare("SELECT id FROM candidates WHERE id IN ($placeholders)");
$stmt->bind_param($types, ...$candidate_ids);
$stmt->execute();
$found = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$found_ids = array_column($found, 'id');
foreach ($candidate_ids as $cid) {
    if (!in_array($cid, $found_ids)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "Candidate with ID $cid not found"]);
        exit;
    }
}

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("INSERT INTO votes (voter_id, candidate_id, position_id, location_lat, location_lng, device_info, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)");
    foreach ($candidate_ids as $i => $cid) {
        $pid = $position_ids[$i];
        $stmt->bind_param("iiddsss", $voter_id, $cid, $pid, $location_lat, $location_lng, $device_info, $ip_address);
        $stmt->execute();
    }

    $stmt = $conn->prepare("UPDATE voters SET has_voted = 1 WHERE id = ?");
    $stmt->bind_param("i", $voter_id);
    $stmt->execute();

    $conn->commit();
    echo json_encode(['success' => true, 'message' => 'All votes cast successfully']);
} catch (Exception $e) {
    $conn->rollback();
    if (strpos($e->getMessage(), 'unique_voter_position') !== false) {
        echo json_encode(['success' => false, 'message' => 'You have already voted for one or more of these positions. Repeat voting is not allowed.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to cast votes: ' . $e->getMessage()]);
    }
}
