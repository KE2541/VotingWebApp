<?php
require_once __DIR__ . '/config/database.php';

$fixes = [
    ['positions', 'level', "VARCHAR(50) NOT NULL DEFAULT ''"],
    ['candidates', 'location', "VARCHAR(200) NOT NULL DEFAULT ''"],
    ['voters', 'location', "VARCHAR(200) NOT NULL DEFAULT ''"],
    ['voters', 'face_image', "LONGTEXT"],
    ['voters', 'face_descriptor', "TEXT"],
];

foreach ($fixes as $f) {
    [$tbl, $col, $def] = $f;
    $check = $conn->query("SHOW COLUMNS FROM `$tbl` LIKE '$col'");
    if ($check && $check->num_rows > 0) {
        echo "Column `$col` already exists in `$tbl`\n";
    } else {
        $sql = "ALTER TABLE `$tbl` ADD COLUMN `$col` $def";
        if ($conn->query($sql)) {
            echo "Added `$col` to `$tbl`\n";
        } else {
            echo "FAILED adding `$col` to `$tbl`: " . $conn->error . "\n";
        }
    }
}

echo "\nSchema fix complete.";
