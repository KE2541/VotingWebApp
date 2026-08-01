<?php
require_once __DIR__ . '/config/database.php';

echo "DB connected OK\n";

$result = $conn->query("SHOW TABLES");
if ($result) {
    echo "Tables:\n";
    while ($row = $result->fetch_array()) {
        echo "  - " . $row[0] . "\n";
    }
} else {
    echo "SHOW TABLES failed: " . $conn->error . "\n";
}

// Test search query
$test = $conn->prepare("SELECT c.id, c.name AS candidate_name, c.party, c.location, p.name AS position_name, p.`level` FROM candidates c JOIN positions p ON c.position_id = p.id WHERE c.location LIKE ? ORDER BY p.display_order, c.name");
if ($test === false) {
    echo "search_location query prepare failed: " . $conn->error . "\n";
} else {
    echo "search_location query prepare OK\n";
}

// Test voters query
$test2 = $conn->prepare("SELECT id, full_name, voter_id, has_voted, face_image, face_descriptor FROM voters WHERE voter_id = ?");
if ($test2 === false) {
    echo "voters query prepare failed: " . $conn->error . "\n";
} else {
    echo "voters query prepare OK\n";
}
