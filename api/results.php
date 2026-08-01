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

$results = [];
$total_votes_cast = 0;

$position_filter = isset($_GET['position_id']) ? intval($_GET['position_id']) : 0;

if ($position_filter > 0) {
    $stmt = $conn->prepare("SELECT * FROM positions WHERE id = ? ORDER BY display_order");
    if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
    $stmt->bind_param("i", $position_filter);
    $stmt->execute();
    $positions_result = $stmt->get_result();
} else {
    $positions_result = $conn->query("SELECT * FROM positions ORDER BY display_order");
    if (!$positions_result) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
}

while ($position = $positions_result->fetch_assoc()) {
    $pos_id = $position['id'];

    $stmt2 = $conn->prepare("
        SELECT
            c.id,
            c.name,
            c.party,
            c.photo_url,
            COALESCE(c.party_symbol, '') AS party_symbol,
            COALESCE(vc.vote_count, 0) AS vote_count
        FROM candidates c
        LEFT JOIN (
            SELECT candidate_id, COUNT(*) AS vote_count
            FROM votes
            WHERE position_id = ?
            GROUP BY candidate_id
        ) vc ON c.id = vc.candidate_id
        WHERE c.position_id = ?
        ORDER BY vote_count DESC
    ");
    if (!$stmt2) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
    $stmt2->bind_param("ii", $pos_id, $pos_id);
    $stmt2->execute();
    $candidates_result = $stmt2->get_result();

    $candidates = $candidates_result->fetch_all(MYSQLI_ASSOC);
    $position_total = array_sum(array_column($candidates, 'vote_count'));
    $total_votes_cast += $position_total;

    $winner = null;
    if (!empty($candidates) && $candidates[0]['vote_count'] > 0) {
        $winner = $candidates[0];
    }

    $results[] = [
        'position_id' => $pos_id,
        'position_name' => $position['name'],
        'total_votes' => $position_total,
        'candidates' => $candidates,
        'winner' => $winner
    ];
}

$total_voters_r = $conn->query("SELECT COUNT(*) as c FROM voters");
$total_voters = $total_voters_r ? (int)$total_voters_r->fetch_assoc()['c'] : 0;
$voters_voted_r = $conn->query("SELECT COUNT(DISTINCT voter_id) as c FROM votes");
$voters_voted = $voters_voted_r ? (int)$voters_voted_r->fetch_assoc()['c'] : 0;

echo json_encode([
    'success' => true,
    'results' => $results,
    'summary' => [
        'total_voters' => (int)$total_voters,
        'voters_voted' => (int)$voters_voted,
        'total_votes_cast' => $total_votes_cast,
        'turnout_percentage' => $total_voters > 0 ? round(($voters_voted / $total_voters) * 100, 2) : 0
    ]
]);
