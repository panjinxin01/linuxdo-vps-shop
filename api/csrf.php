<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$token = ensureCsrfToken();
jsonResponse(1, '', ['token' => $token]);

