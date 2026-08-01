<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
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

$voter_cols = [];
$col_result = $conn->query("SHOW COLUMNS FROM voters");
if ($col_result) {
    while ($row = $col_result->fetch_assoc()) {
        $voter_cols[] = $row['Field'];
    }
}

function hasCol($name) {
    global $voter_cols;
    return in_array($name, $voter_cols);
}

function selectCols($cols) {
    $present = [];
    foreach ($cols as $c) {
        if (hasCol($c)) $present[] = "`$c`";
    }
    return implode(', ', $present);
}

if ($method === 'GET') {
    session_start();
    if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }
    session_write_close();

    $search = trim($_GET['search'] ?? '');

    $cols = selectCols(['id', 'full_name', 'voter_id', 'has_voted', 'location', 'face_image', 'face_descriptor', 'location_lat', 'location_lng', 'device_info', 'ip_address', 'created_at']);
    if ($search) {
        $like = '%' . $conn->real_escape_string($search) . '%';
        $stmt = $conn->prepare("SELECT $cols FROM voters WHERE full_name LIKE ? OR voter_id LIKE ? ORDER BY created_at DESC LIMIT 20");
        $stmt->bind_param("ss", $like, $like);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query("SELECT $cols FROM voters ORDER BY created_at DESC");
    }
    if (!$result) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
    $voters = $result->fetch_all(MYSQLI_ASSOC);
    echo json_encode(['success' => true, 'voters' => $voters]);
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $action = $data['action'] ?? '';

    if ($action === 'register') {
        session_start();
        if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            exit;
        }

        $full_name = trim($data['full_name'] ?? '');
        $voter_id = trim($data['voter_id'] ?? '');
        $location = trim($data['location'] ?? '');
        $face_image = $data['face_image'] ?? null;
        $face_descriptor = $data['face_descriptor'] ?? null;
        $location_lat = isset($data['location_lat']) ? floatval($data['location_lat']) : null;
        $location_lng = isset($data['location_lng']) ? floatval($data['location_lng']) : null;
        $device_info = $data['device_info'] ?? null;
        $ip_address = $_SERVER['REMOTE_ADDR'] ?? null;

        if (empty($full_name) || empty($voter_id)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Full name and voter ID are required']);
            exit;
        }

        if (!preg_match('/^(?:\d{6,9}|[A-Za-z]\d{7})$/', $voter_id)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Voter ID must be 6-9 digit National ID or Passport (1 letter + 7 digits)']);
            exit;
        }

        $stmt = $conn->prepare("SELECT id FROM voters WHERE voter_id = ?");
        if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
        $stmt->bind_param("s", $voter_id);
        $stmt->execute();
        if ($stmt->get_result()->fetch_assoc()) {
            echo json_encode(['success' => false, 'message' => 'Voter ID already registered']);
            exit;
        }

        if ($face_descriptor && hasCol('face_descriptor')) {
            $new_desc = json_decode($face_descriptor, true);
            if ($new_desc && is_array($new_desc)) {
                $count_new = count($new_desc);
                $fdq = $conn->query("SELECT id, full_name, face_descriptor FROM voters WHERE face_descriptor IS NOT NULL AND face_descriptor != ''");
                if ($fdq) {
                    while ($row = $fdq->fetch_assoc()) {
                        $existing = json_decode($row['face_descriptor'], true);
                        if ($existing && is_array($existing) && count($existing) === $count_new) {
                            $dist = 0.0;
                            for ($i = 0; $i < $count_new; $i++) {
                                $diff = (float)$new_desc[$i] - (float)$existing[$i];
                                $dist += $diff * $diff;
                            }
                            $dist = sqrt($dist);
                            if ($dist < 25.0) {
                                echo json_encode(['success' => false, 'message' => 'Duplicate registration blocked: Face biometrics match already registered voter (' . $row['full_name'] . '). Each person can only register once.']);
                                exit;
                            }
                        }
                    }
                }
            }
        }

        $insert_cols = ['full_name', 'voter_id'];
        $insert_vals = [$full_name, $voter_id];
        $types = 'ss';

        if (hasCol('location')) { $insert_cols[] = 'location'; $insert_vals[] = $location; $types .= 's'; }
        if (hasCol('face_image')) { $insert_cols[] = 'face_image'; $insert_vals[] = $face_image; $types .= 's'; }
        if (hasCol('face_descriptor')) { $insert_cols[] = 'face_descriptor'; $insert_vals[] = $face_descriptor; $types .= 's'; }
        if (hasCol('location_lat')) { $insert_cols[] = 'location_lat'; $insert_vals[] = $location_lat; $types .= 'd'; }
        if (hasCol('location_lng')) { $insert_cols[] = 'location_lng'; $insert_vals[] = $location_lng; $types .= 'd'; }
        if (hasCol('device_info')) { $insert_cols[] = 'device_info'; $insert_vals[] = $device_info; $types .= 's'; }
        if (hasCol('ip_address')) { $insert_cols[] = 'ip_address'; $insert_vals[] = $ip_address; $types .= 's'; }

        $col_names = implode(', ', array_map(function($c) { return "`$c`"; }, $insert_cols));
        $placeholders = implode(', ', array_fill(0, count($insert_cols), '?'));

        $stmt = $conn->prepare("INSERT INTO voters ($col_names) VALUES ($placeholders)");
        if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
        $stmt->bind_param($types, ...$insert_vals);

        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Voter registered successfully', 'voter' => ['id' => $stmt->insert_id, 'full_name' => $full_name, 'voter_id' => $voter_id]]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Registration failed: ' . $stmt->error]);
        }
        exit;
    }

    if ($action === 'transfer') {
        session_start();
        if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            exit;
        }

        $voter_db_id = intval($data['voter_id'] ?? 0);
        $new_location = trim($data['location'] ?? '');

        if ($voter_db_id === 0 || empty($new_location)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Voter ID and new location are required']);
            exit;
        }

        if (!hasCol('location')) {
            $conn->query("ALTER TABLE voters ADD COLUMN `location` VARCHAR(200) DEFAULT ''");
            $voter_cols[] = 'location';
        }

        $stmt = $conn->prepare("SELECT id, full_name, voter_id, location FROM voters WHERE id = ?");
        if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => 'DB error (select voter): ' . $conn->error]); exit; }
        $stmt->bind_param("i", $voter_db_id);
        $stmt->execute();
        $voter = $stmt->get_result()->fetch_assoc();

        if (!$voter) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Voter not found']);
            exit;
        }

        $old_location = $voter['location'] ?? '';

        $conn->query("CREATE TABLE IF NOT EXISTS `transfer_history` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `voter_id` INT NOT NULL,
            `voter_name` VARCHAR(200) NOT NULL,
            `voter_id_number` VARCHAR(50) NOT NULL,
            `from_location` VARCHAR(200) DEFAULT '',
            `to_location` VARCHAR(200) DEFAULT '',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $stmt = $conn->prepare("UPDATE voters SET location = ? WHERE id = ?");
        if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => 'DB error (update voter): ' . $conn->error]); exit; }
        $stmt->bind_param("si", $new_location, $voter_db_id);

        if ($stmt->execute()) {
            $stmt2 = $conn->prepare("INSERT INTO transfer_history (voter_id, voter_name, voter_id_number, from_location, to_location) VALUES (?, ?, ?, ?, ?)");
            if ($stmt2) {
                $stmt2->bind_param("issss", $voter_db_id, $voter['full_name'], $voter['voter_id'], $old_location, $new_location);
                $stmt2->execute();
            }
            echo json_encode(['success' => true, 'message' => 'Voter transferred successfully', 'voter' => ['full_name' => $voter['full_name'], 'voter_id' => $voter['voter_id'], 'old_location' => $old_location, 'new_location' => $new_location]]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Transfer failed: ' . $stmt->error]);
        }
        exit;
    }

    if ($action === 'transfer_history') {
        session_start();
        if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            exit;
        }

        $conn->query("CREATE TABLE IF NOT EXISTS `transfer_history` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `voter_id` INT NOT NULL,
            `voter_name` VARCHAR(200) NOT NULL,
            `voter_id_number` VARCHAR(50) NOT NULL,
            `from_location` VARCHAR(200) DEFAULT '',
            `to_location` VARCHAR(200) DEFAULT '',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $result = $conn->query("SELECT * FROM transfer_history ORDER BY created_at DESC LIMIT 50");
        $history = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        echo json_encode(['success' => true, 'history' => $history]);
        exit;
    }

    $voter_id = trim($data['voter_id'] ?? '');
    if (empty($voter_id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Voter ID is required']);
        exit;
    }

    if (!preg_match('/^(?:\d{6,9}|[A-Za-z]\d{7})$/', $voter_id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid format. Use 6-9 digit National ID or Passport (1 letter + 7 digits).']);
        exit;
    }

    $lookup_cols = selectCols(['id', 'full_name', 'voter_id', 'has_voted', 'location', 'face_image', 'face_descriptor']);
    $stmt = $conn->prepare("SELECT $lookup_cols FROM voters WHERE voter_id = ?");
    if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
    $stmt->bind_param("s", $voter_id);
    $stmt->execute();
    $voter = $stmt->get_result()->fetch_assoc();

    if ($voter) {
        $selected_location = trim($data['location'] ?? '');
        if ($selected_location && !empty($voter['location'])) {
            $voterLoc = strtolower(trim($voter['location']));
            $selectedLoc = strtolower(trim($selected_location));
            if (strpos($selectedLoc, $voterLoc) === false && strpos($voterLoc, $selectedLoc) === false) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'This Voter ID is not registered in the selected location. Please select your correct ward/constituency/county.']);
                exit;
            }
        }
        echo json_encode(['success' => true, 'message' => 'Voter verified', 'voter' => $voter]);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Voter not found.']);
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
        echo json_encode(['success' => false, 'message' => 'Voter ID is required']);
        exit;
    }

    $stmt = $conn->prepare("DELETE FROM voters WHERE id = ?");
    if (!$stmt) { http_response_code(500); echo json_encode(['success' => false, 'message' => $conn->error]); exit; }
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Voter removed successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to remove voter']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
