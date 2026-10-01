<?php
/**
 * 金额格式化 / 名称截断
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

/* ==========================================================
 * 通用工具
 * ========================================================== */

/**
 * 格式化积分金额（文档要求：最多/必须保留两位小数）
 */
function ldcpay_format_money($money): string {
    return number_format(round((float)$money, 2), 2, '.', '');
}

/**
 * 截断商品名称（易支付 name 最多 64 字符）
 */
function ldcpay_truncate_name(string $name, int $max = 64): string {
    $name = trim($name);
    if ($name === '') {
        $name = '商品订单';
    }
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, $max, 'UTF-8');
    }
    $cut = substr($name, 0, $max);
    // 去掉按字节截断产生的残缺多字节尾部
    return (string)preg_replace('/[\x80-\xFF]+$/', '', $cut);
}

