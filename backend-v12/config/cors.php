<?php

$frontendUrl = env('SMARTGATE_FRONTEND_URL', 'http://127.0.0.1:5173');
$frontendOrigin = preg_match('/^https?:\/\//i', $frontendUrl) ? $frontendUrl : "https://{$frontendUrl}";

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [rtrim($frontendOrigin, '/')],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];