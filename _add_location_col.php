<?php
require_once __DIR__ . '/config/database.php';

$result = $conn->query("SHOW COLUMNS FROM voters LIKE 'location'");
if ($result && $result->num_rows === 0) {
    $conn->query("ALTER TABLE voters ADD COLUMN `location` VARCHAR(200) DEFAULT '' AFTER `has_voted`");
    echo json_encode(['success' => true, 'message' => 'Added location column to voters table']);
} else {
    echo json_encode(['success' => true, 'message' => 'location column already exists']);
}
