<?php
/**
 * HTTP 请求封装（cURL / file_get_contents 双通道）
 * 来源：includes/security.php（目录结构拆分，内容零改动）
 */

function httpRequest(string $url, array $options = []): array {
    $method = strtoupper((string)($options['method'] ?? 'GET'));
    $headers = $options['headers'] ?? [];
    $data = $options['data'] ?? null;
    $timeout = max(1, (int)($options['timeout'] ?? 30));

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $options['ssl_verify_peer'] ?? true);
        if (isset($options['ssl_verify_host'])) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, (int)$options['ssl_verify_host']);
        }
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($data !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($data) ? http_build_query($data) : (string)$data);
            }
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($data !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($data) ? http_build_query($data) : (string)$data);
            }
        }
        if (!empty($headers)) {
            $formatted = [];
            foreach ($headers as $k => $v) {
                $formatted[] = is_int($k) ? (string)$v : ($k . ': ' . $v);
            }
            curl_setopt($ch, CURLOPT_HTTPHEADER, $formatted);
        }
        $body = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['ok' => $error === '', 'body' => $body === false ? '' : (string)$body, 'error' => $error, 'status' => $status];
    }

    $headerLines = [];
    foreach ($headers as $k => $v) {
        $headerLines[] = is_int($k) ? (string)$v : ($k . ': ' . $v);
    }
    $content = '';
    if ($data !== null) {
        $content = is_array($data) ? http_build_query($data) : (string)$data;
    }
    if ($content !== '' && !array_filter($headerLines, static fn($line) => stripos($line, 'Content-Type:') === 0)) {
        $headerLines[] = 'Content-Type: application/x-www-form-urlencoded';
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\n", $headerLines),
            'content' => $content,
            'timeout' => $timeout,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => (bool)($options['ssl_verify_peer'] ?? true),
            'verify_peer_name' => (bool)($options['ssl_verify_peer'] ?? true),
        ]
    ]);
    $body = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (!empty($http_response_header) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) {
        $status = (int)$m[1];
    }
    if ($body === false) {
        $err = error_get_last();
        return ['ok' => false, 'body' => '', 'error' => $err['message'] ?? 'request failed', 'status' => $status];
    }
    return ['ok' => true, 'body' => (string)$body, 'error' => '', 'status' => $status];
}

