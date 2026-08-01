<?php
set_time_limit(0);
require_once __DIR__ . '/../config/database.php';

$conn->query("DROP TABLE IF EXISTS votes");
$conn->query("DROP TABLE IF EXISTS candidates");
$conn->query("DROP TABLE IF EXISTS voters");
$conn->query("DROP TABLE IF EXISTS election_settings");
$conn->query("DROP TABLE IF EXISTS positions");

$conn->query("
    CREATE TABLE `positions` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(100) NOT NULL UNIQUE,
        `display_order` INT DEFAULT 0,
        `level` VARCHAR(50) DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$conn->query("
    CREATE TABLE `candidates` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(200) NOT NULL,
        `position_id` INT NOT NULL,
        `party` VARCHAR(200) DEFAULT '',
        `photo_url` VARCHAR(500) DEFAULT '',
        `party_symbol` VARCHAR(500) DEFAULT '',
        `location` VARCHAR(200) DEFAULT '',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE CASCADE,
        UNIQUE KEY `unique_candidate_position` (`name`, `position_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$conn->query("
    CREATE TABLE `voters` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `full_name` VARCHAR(200) NOT NULL,
        `voter_id` VARCHAR(50) NOT NULL UNIQUE,
        `has_voted` TINYINT(1) DEFAULT 0,
        `location` VARCHAR(200) DEFAULT '',
        `face_image` LONGTEXT DEFAULT NULL,
        `face_descriptor` MEDIUMTEXT DEFAULT NULL,
        `location_lat` DECIMAL(10,7) DEFAULT NULL,
        `location_lng` DECIMAL(10,7) DEFAULT NULL,
        `device_info` TEXT DEFAULT NULL,
        `ip_address` VARCHAR(45) DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$conn->query("
    CREATE TABLE `votes` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `voter_id` INT NOT NULL,
        `candidate_id` INT NOT NULL,
        `position_id` INT NOT NULL,
        `location_lat` DECIMAL(10,7) DEFAULT NULL,
        `location_lng` DECIMAL(10,7) DEFAULT NULL,
        `device_info` TEXT DEFAULT NULL,
        `ip_address` VARCHAR(45) DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (`voter_id`) REFERENCES `voters`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE CASCADE,
        UNIQUE KEY `unique_voter_position` (`voter_id`, `position_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$conn->query("
    CREATE TABLE `election_settings` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `start_time` DATETIME NOT NULL,
        `end_time` DATETIME NOT NULL,
        `is_active` TINYINT(1) DEFAULT 1,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$positions = [
    ['name' => 'President', 'level' => 'National (Kenya)'],
    ['name' => 'Governor', 'level' => 'County'],
    ['name' => 'Senator', 'level' => 'County'],
    ['name' => 'Women Rep', 'level' => 'County'],
    ['name' => 'MP', 'level' => 'Constituency'],
    ['name' => 'MCA', 'level' => 'Ward']
];
$stmt = $conn->prepare("INSERT INTO `positions` (`name`, `display_order`, `level`) VALUES (?, ?, ?)");
foreach ($positions as $i => $pos) {
    $order = $i + 1;
    $stmt->bind_param("sis", $pos['name'], $order, $pos['level']);
    $stmt->execute();
}

$conn->query("
    INSERT INTO `election_settings` (`start_time`, `end_time`, `is_active`)
    VALUES (NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 1)
");

$indexes = [
    'idx_votes_voter_id' => ['table' => 'votes', 'cols' => 'voter_id'],
    'idx_votes_candidate_id' => ['table' => 'votes', 'cols' => 'candidate_id'],
    'idx_votes_position_id' => ['table' => 'votes', 'cols' => 'position_id'],
    'idx_voters_voter_id' => ['table' => 'voters', 'cols' => 'voter_id'],
    'idx_candidates_position_id' => ['table' => 'candidates', 'cols' => 'position_id']
];
foreach ($indexes as $name => $idx) {
    $conn->query("CREATE INDEX `$name` ON `{$idx['table']}` ({$idx['cols']})");
}

echo json_encode(['success' => true, 'message' => 'Database setup complete']);
