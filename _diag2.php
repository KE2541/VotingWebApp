<?php
require_once __DIR__ . '/config/database.php';

$tables = ['candidates', 'voters', 'positions', 'election_settings', 'votes'];
foreach ($tables as $t) {
    echo "$t:\n";
    $r = $conn->query("DESCRIBE `$t`");
    if ($r) {
        while ($row = $r->fetch_assoc()) {
            echo "  {$row['Field']} ({$row['Type']})\n";
        }
    } else {
        echo "  ERROR: " . $conn->error . "\n";
    }
    echo "\n";
}
