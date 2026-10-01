<?php
/**
 * 数据库表结构聚合入口（v20261001 目录结构拆分）
 *
 * 本文件只负责加载子模块，具体实现见 includes/Schema/ 目录：
 *   Tables.php    全库表结构定义（getProjectTableDefinitions）
 *   Defaults.php  系统默认配置项种子数据（getProjectDefaultSettings）
 *
 * 外部调用方保持 require_once 本文件路径不变，无需改动。
 */

require_once __DIR__ . '/Schema/Tables.php';
require_once __DIR__ . '/Schema/Defaults.php';
