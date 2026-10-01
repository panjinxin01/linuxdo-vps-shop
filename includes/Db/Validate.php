<?php
/**
 * UTF-8 字符串处理与入参校验
 * 来源：includes/db.php（目录结构拆分，内容零改动）
 */

function utf8Length(?string $value): int {
    $value = (string)($value ?? '');
    if ($value === '') {
        return 0;
    }
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    if (function_exists('iconv_strlen')) {
        $len = @iconv_strlen($value, 'UTF-8');
        if ($len !== false) {
            return (int)$len;
        }
    }
    if (preg_match_all('/./us', $value, $m)) {
        return count($m[0]);
    }
    return strlen($value);
}

function utf8Substr(string $value, int $start, ?int $length = null): string {
    if (function_exists('mb_substr')) {
        return $length === null
            ? mb_substr($value, $start, null, 'UTF-8')
            : mb_substr($value, $start, $length, 'UTF-8');
    }
    if (function_exists('iconv_substr')) {
        $res = $length === null
            ? @iconv_substr($value, $start, iconv_strlen($value, 'UTF-8'), 'UTF-8')
            : @iconv_substr($value, $start, $length, 'UTF-8');
        if ($res !== false) {
            return (string)$res;
        }
    }
    if (preg_match_all('/./us', $value, $m)) {
        $slice = array_slice($m[0], $start, $length);
        return implode('', $slice);
    }
    return $length === null ? substr($value, $start) : substr($value, $start, $length);
}

function normalizeString($value, ?int $maxLen = null): string {
    $value = is_string($value) ? trim($value) : '';
    if ($maxLen !== null && $maxLen > 0) {
        $value = utf8Substr($value, 0, $maxLen);
    }
    return $value;
}

function validateInt($value, ?int $min = null, ?int $max = null): ?int {
    if ($value === null || $value === '') {
        return null;
    }
    if (is_string($value)) {
        $value = trim($value);
    }
    if (!is_numeric($value) || ((string)(int)$value !== (string)$value && !is_int($value))) {
        return null;
    }
    $intValue = (int)$value;
    if ($min !== null && $intValue < $min) {
        return null;
    }
    if ($max !== null && $intValue > $max) {
        return null;
    }
    return $intValue;
}

function validateFloat($value, ?float $min = null, ?float $max = null): ?float {
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $floatValue = (float)$value;
    if ($min !== null && $floatValue < $min) {
        return null;
    }
    if ($max !== null && $floatValue > $max) {
        return null;
    }
    return $floatValue;
}

function isValidDateTime(string $value): bool {
    $value = trim($value);
    if ($value === '') {
        return false;
    }
    $ts = strtotime($value);
    return $ts !== false;
}

