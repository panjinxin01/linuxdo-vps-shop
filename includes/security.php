<?php
/**
 * 安全基础库聚合入口（v20261001 目录结构拆分）
 *
 * 本文件只负责加载子模块，具体实现见 includes/Security/ 目录：
 *   Session.php    安全会话
 *   Csrf.php       CSRF 防护
 *   Network.php    客户端 IP / 表检测
 *   RateLimit.php  接口限流
 *   Audit.php      审计与错误日志
 *   Http.php       HTTP 请求封装
 *   Crypto.php     敏感数据加解密
 *
 * 外部调用方保持 require_once 本文件路径不变，无需改动。
 */

require_once __DIR__ . '/../api/config.php';

require_once __DIR__ . '/Security/Session.php';
require_once __DIR__ . '/Security/Csrf.php';
require_once __DIR__ . '/Security/Network.php';
require_once __DIR__ . '/Security/RateLimit.php';
require_once __DIR__ . '/Security/Audit.php';
require_once __DIR__ . '/Security/Http.php';
require_once __DIR__ . '/Security/Crypto.php';
