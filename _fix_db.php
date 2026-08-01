<?php
require_once __DIR__ . '/config/database.php';

$log = [];
$result = $conn->query("SHOW COLUMNS FROM voters LIKE 'location'");
if ($result && $result->num_rows === 0) {
    if ($conn->query("ALTER TABLE voters ADD COLUMN `location` VARCHAR(200) DEFAULT '' AFTER `has_voted`")) {
        $log[] = 'Added location column';
    } else {
        $log[] = 'Failed to add: ' . $conn->error;
    }
} else {
    $log[] = 'location column already exists';
}

$result2 = $conn->query("SHOW COLUMNS FROM voters LIKE 'face_image'");
if ($result2 && $result2->num_rows === 0) {
    if ($conn->query("ALTER TABLE voters ADD COLUMN `face_image` LONGTEXT DEFAULT NULL AFTER `location`")) {
        $log[] = 'Added face_image column';
    } else {
        $log[] = 'Failed to add face_image: ' . $conn->error;
    }
} else {
    $log[] = 'face_image column OK';
}

$result3 = $conn->query("SHOW COLUMNS FROM voters LIKE 'face_descriptor'");
if ($result3 && $result3->num_rows === 0) {
    if ($conn->query("ALTER TABLE voters ADD COLUMN `face_descriptor` MEDIUMTEXT DEFAULT NULL AFTER `face_image`")) {
        $log[] = 'Added face_descriptor column';
    } else {
        $log[] = 'Failed to add face_descriptor: ' . $conn->error;
    }
} else {
    $log[] = 'face_descriptor column OK';
}

$result4 = $conn->query("SHOW COLUMNS FROM voters LIKE 'location_lat'");
if ($result4 && $result4->num_rows === 0) {
    $conn->query("ALTER TABLE voters ADD COLUMN `location_lat` DECIMAL(10,7) DEFAULT NULL AFTER `face_descriptor`");
    $conn->query("ALTER TABLE voters ADD COLUMN `location_lng` DECIMAL(10,7) DEFAULT NULL AFTER `location_lat`");
    $log[] = 'Added location_lat/lng columns';
}

$result5 = $conn->query("SHOW COLUMNS FROM voters LIKE 'device_info'");
if ($result5 && $result5->num_rows === 0) {
    if ($conn->query("ALTER TABLE voters ADD COLUMN `device_info` VARCHAR(500) DEFAULT NULL AFTER `location_lng`")) {
        $log[] = 'Added device_info column';
    } else {
        $log[] = 'Failed to add device_info: ' . $conn->error;
    }
} else {
    $log[] = 'device_info column OK';
}

$result6 = $conn->query("SHOW COLUMNS FROM voters LIKE 'ip_address'");
if ($result6 && $result6->num_rows === 0) {
    if ($conn->query("ALTER TABLE voters ADD COLUMN `ip_address` VARCHAR(45) DEFAULT NULL AFTER `device_info`")) {
        $log[] = 'Added ip_address column';
    } else {
        $log[] = 'Failed to add ip_address: ' . $conn->error;
    }
} else {
    $log[] = 'ip_address column OK';
}

file_put_contents(__DIR__ . '/_fix_log.txt', implode("\n", $log));
echo implode("\n", $log);
