<?php
/**
 * 数据库与请求基础库聚合入口（v20261001 目录结构拆分）
 *
 * 本文件只负责加载子模块，具体实现见 includes/Db/ 目录：
 *   Request.php     JSON 响应 / 请求体解析
 *   Validate.php    UTF-8 字符串处理与入参校验
 *   Connection.php  PDO 单例
 *   Pagination.php  分页封装
 *   Auth.php        登录态校验
 *
 * 外部调用方保持 require_once 本文件路径不变，无需改动。
 */

require_once __DIR__ . '/../api/config.php';

require_once __DIR__ . '/Db/Request.php';
require_once __DIR__ . '/Db/Validate.php';
require_once __DIR__ . '/Db/Connection.php';
require_once __DIR__ . '/Db/Pagination.php';
require_once __DIR__ . '/Db/Auth.php';
