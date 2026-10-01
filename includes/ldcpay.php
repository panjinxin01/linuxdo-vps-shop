<?php
/**
 * LDC Pay 支付 SDK 聚合入口（v20261001 目录结构拆分）
 *
 * 本文件只负责加载子模块，具体实现见 includes/Ldcpay/ 目录：
 *   Config.php      SDK 说明 / 凭据读取
 *   Ed25519.php     官方协议 Ed25519 签名验签
 *   KeyFormat.php   密钥归一化与 PEM 转换
 *   EpaySign.php    易支付兼容协议 MD5 签名验签
 *   Format.php      金额 / 名称格式化
 *   Payment.php     发起支付（自动选协议）
 *   Query.php       提交参数构造 / 订单查询
 *   Refund.php      订单退款
 *   Distribute.php  积分分发 / 余额统计
 *   Utils.php       多字节安全截断
 *
 * 外部调用方保持 require_once 本文件路径不变，无需改动。
 */

require_once __DIR__ . '/Ldcpay/Config.php';
require_once __DIR__ . '/Ldcpay/Ed25519.php';
require_once __DIR__ . '/Ldcpay/KeyFormat.php';
require_once __DIR__ . '/Ldcpay/EpaySign.php';
require_once __DIR__ . '/Ldcpay/Format.php';
require_once __DIR__ . '/Ldcpay/Payment.php';
require_once __DIR__ . '/Ldcpay/Query.php';
require_once __DIR__ . '/Ldcpay/Refund.php';
require_once __DIR__ . '/Ldcpay/Distribute.php';
require_once __DIR__ . '/Ldcpay/Utils.php';
