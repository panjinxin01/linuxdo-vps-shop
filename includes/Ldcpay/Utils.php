<?php
/**
 * 多字节字符串安全截断
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

function mb_substr_safe(string $str, int $length): string {
    if (strlen($str) <= $length) {
        return $str;
    }
    if (function_exists('mb_substr')) {
        return (string)mb_substr($str, 0, $length, 'UTF-8');
    }
    return substr($str, 0, $length);
}
