<?php
/**
 * 商务逻辑聚合入口（v20261001 目录结构拆分）
 *
 * 本文件只负责加载子模块，具体函数实现见 includes/Commerce/ 目录：
 *   Schema.php        表 / 字段存在性检测
 *   Settings.php      系统设置读写
 *   OrderOutput.php   订单对外输出与凭据可见性
 *   TicketMeta.php    工单分类 / 交付状态枚举
 *   User.php          用户查询
 *   Template.php      商品模板读取与回填
 *   Access.php        购买限制 / 等级折扣 / 准入校验
 *   TicketEvent.php   工单事件流水
 *   Normalize.php     支付方式 / 交付状态归一化
 *   Refund.php        退款策略与退款执行
 *   Delivery.php      订单交付状态更新
 *   Balance.php       余额增减与流水
 *
 * 外部调用方保持 require_once 本文件路径不变，无需改动。
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/notifications.php';
require_once __DIR__ . '/coupons.php';

require_once __DIR__ . '/Commerce/Schema.php';
require_once __DIR__ . '/Commerce/Settings.php';
require_once __DIR__ . '/Commerce/OrderOutput.php';
require_once __DIR__ . '/Commerce/TicketMeta.php';
require_once __DIR__ . '/Commerce/User.php';
require_once __DIR__ . '/Commerce/Template.php';
require_once __DIR__ . '/Commerce/Access.php';
require_once __DIR__ . '/Commerce/TicketEvent.php';
require_once __DIR__ . '/Commerce/Normalize.php';
require_once __DIR__ . '/Commerce/Refund.php';
require_once __DIR__ . '/Commerce/Delivery.php';
require_once __DIR__ . '/Commerce/Balance.php';
