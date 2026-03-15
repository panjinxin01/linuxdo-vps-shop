# 开发说明（DEVELOPMENT）

最后更新：2026-03-14

本项目为 **PHP + MySQL + 静态前端页面** 的单体应用：

- 前台：`index.html` + `js/main.js`
- 后台：`admin/*.html` + `js/admin.js`
- 后端：`api/*.php`
- 数据库：MySQL / MariaDB

> 约定：所有接口统一返回 `{code, msg, data}`，由 `includes/db.php -> jsonResponse()` 输出。

---

## 1. 运行环境

- PHP 7.4+（建议 8.x）
- MySQL 5.7+ / MariaDB 10.3+
- 需要启用：PDO + pdo_mysql

配置文件：`api/config.php`

- 数据库：`DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`
- 站点名：`SITE_NAME`
- Linux DO OAuth：`LINUXDO_CLIENT_ID / LINUXDO_CLIENT_SECRET / LINUXDO_REDIRECT_URI`

---

## 2. 安装与初始化流程（与代码一致）

前台 `js/main.js` 在 `DOMContentLoaded` 会先请求 `api/check_install.php`：

- `config_ok = false` 或 `tables_ok = false`：跳转 `admin/install.html`（可视化安装向导）- 步骤1：填写数据库配置（地址、端口、用户名、密码、数据库名），支持在线测试连接
  - 步骤2：生成加密密钥（可选）
  - 步骤3：一键初始化数据库表结构
  - 安装向导前后端分离：`api/install.php`（纯 JSON API）+ `admin/install.html` + `css/install.css` + `js/install.js`
- `admin_ok = false`：跳转 `admin/setup.html`（创建首个 **超级管理员**）
- 都 OK：正常加载页面数据（公告/商品/登录状态等）

后台 `admin/login.html` / `admin/setup.html` 也会通过 `api/check_install.php` 做同样的引导。

管理员登录后台后，`js/admin.js` 会自动调用 `update_db.php?action=check` 检测缺失表，如有缺失则弹窗提示（可关闭，同一会话只提示一次）。

---

## 3. 目录结构
```
api/
  admin.php            # 管理员账号：setup/login/check/list/add/delete/change_password
  announcements.php    # 公告系统
  audit_logs.php       # 审计日志接口
  csrf.php             # CSRF Token 接口
  check_install.php    # 检查是否已安装（表结构 & 管理员）
  config.php           # 数据库/站点/OAuth 配置
  coupons.php          # 优惠券系统：validate/all/create/update/toggle/delete
  community.php        # Linux DO 社区规则 / 白黑名单 / trust_level 折扣
  credits.php          # 余额钱包 / 积分流水 / 后台调账
  install.php          # 安装向导 API（纯 JSON：get_config/test_db/save_config/generate_key/run_install）
  notifications.php    # 通知系统
  notify.php           # 支付异步回调
  oauth.php            # Linux DO Connect OAuth2
  dashboard.php        # 统计报表接口
  orders.php           # 订单系统（含余额支付 / 交付状态）
  pay.php              # 跳转支付（POST 表单）
  products.php         # 商品（VPS）管理（支持模板与社区规则）
  settings.php         # 系统设置（epay + oauth 写入 config.php）
  templates.php        # 商品模板管理
  tickets.php          # 工单系统增强版
  upload.php           # 工单附件上传
  update_db.php        # 数据库维护：缺表创建/字段迁移/重置
admin/
  index.html           # 后台主界面（含数据库更新提示弹窗）
  install.html         # 可视化安装向导页面
  login.html           # 后台登录
  setup.html           # 首次创建管理员
  maintenance.html     # 数据库维护界面

includes/
  db.php               # PDO 连接、jsonResponse、checkAdmin
  coupons.php          # 优惠券工具函数：校验、计算折扣、占用/释放
  notifications.php    # 通知函数公共模块（站内 + 邮件 + Webhook）
  schema.php           # 安装 / 升级共用的数据库结构定义
  security.php         # 安全工具函数（CSRF、限流、审计、加密）

css/   # 样式文件（含 install.css）
js/                    # 脚本文件（含 install.js）
index.html             # 前台入口
```

---

## 4. 数据库结构（当前代码）

### 4.1 users

- `id` INT PK
- `username` VARCHAR(50) UNIQUE
- `password` VARCHAR(255) **允许 NULL**（OAuth 用户可能没有本地密码）
- `email` VARCHAR(100)
- `linuxdo_id` INT UNIQUE（Linux DO 用户ID，可空）
- `linuxdo_username` / `linuxdo_name` / `linuxdo_trust_level` / `linuxdo_avatar`
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NULL

### 4.2 admins

- `id` INT PK
- `username` UNIQUE
- `password`
- `role` VARCHAR(20) DEFAULT 'admin'
  - `super`：超级管理员（可管理管理员账号）
  - `admin`：普通管理员
- `created_at`

### 4.3 products（商品 / VPS 资源）

- `name/cpu/memory/disk/bandwidth`
- `price` DECIMAL(10,2)
- `ip_address` / `ssh_port` / `ssh_user` / `ssh_password` / `extra_info`
- `status` TINYINT DEFAULT 1
  - `1` 在售
  - `0` 已售
### 4.4 orders（订单）

- `order_no` UNIQUE
- `trade_no`（支付平台交易号）
- `user_id` / `product_id`
- `original_price`（原价）
- `coupon_id` / `coupon_code` / `coupon_discount`（优惠券相关）
- `price`（应付金额 = 原价 - 优惠）
- `status` TINYINT DEFAULT 0
  - `0` 待支付
  - `1` 已支付
  - `2` 已退款
  - `3` 已取消（`orders.php` 会自动取消 **15 分钟未支付** 的订单，并释放优惠券占用）
- `refund_reason` / `refund_trade_no` / `refund_amount` / `refund_at`
- `cancel_reason` / `cancelled_at`
- `created_at` / `paid_at`

### 4.5 settings（系统设置）

- `key_name` UNIQUE
- `key_value` TEXT

当前后台主要用到：

- `epay_pid` / `epay_key`
- `notify_url` / `return_url`

### 4.6 announcements（公告）

- `title` / `content`
- `is_top`（置顶）
- `status`：1 显示 / 0 隐藏
- `created_at`
### 4.7 tickets / ticket_replies（工单）

`tickets`：

- `user_id`
- `order_id`（可空，关联订单）
- `title`
- `status`：0 待回复 / 1 已回复 / 2 已关闭
- `created_at` / `updated_at`

`ticket_replies`：

- `ticket_id`
- `user_id`（可空；NULL 表示管理员回复）
- `content`
- `created_at`

### 4.8 coupons（优惠券）

- `code` VARCHAR(50) UNIQUE（优惠券码，自动转大写）
- `name`（优惠券名称）
- `type`：`fixed` 固定金额/ `percent` 百分比折扣
- `value`：折扣值（固定金额或百分比）
- `min_amount`：最低使用门槛
- `max_discount`：最大优惠金额（仅 percent 类型有效，可空）
- `max_uses`：总使用次数限制（0= 不限）
- `per_user_limit`：每用户使用次数限制（0 = 不限）
- `used_count`：已使用次数
- `starts_at` / `ends_at`：有效期（可空）
- `status`：1 启用 / 0 停用

### 4.9 coupon_usages（优惠券使用记录）

- `coupon_id`
- `user_id`
- `order_no`（关联订单）
- `status`：
  - `0` 占用中（订单待支付）
  - `1` 已使用（订单已支付）
- `used_at`（实际使用时间）
- `created_at`

### 4.10 rate_limits（限流记录）

- `rate_key` 唯一键（action + IP + identity）
- `hit_count` / `window_start` / `blocked_until`
- `updated_at`

### 4.11 audit_logs（后台审计日志）

- `actor_type` / `actor_id` / `actor_name`
- `action` / `target_id`
- `ip_address` / `user_agent`
- `details`
- `created_at`

### 4.12 error_logs（错误日志）

- `context` / `message`
- `details`
- `ip_address` / `user_agent`
- `created_at`

---

## 5. 关键接口说明（按模块）

### 5.1 安装与维护

- `GET api/check_install.php`
  - 返回 `config_ok/tables_ok/admin_ok`，用于前后台引导

- `POST api/install.php`（纯 JSON API）
  - `action=get_config`：读取当前数据库配置
  - `action=test_db`：测试数据库连接
  - `action=save_config`：保存数据库配置到 `api/config.php`
  - `action=generate_key`：生成加密密钥
  - `action=run_install`：创建所有表（首次安装用）

- `api/update_db.php`
  - `action=check`：检查缺表
  - `action=update`：创建缺表 + 自动迁移字段（admins.role、Linux DO 字段等）
  - `action=reset`：重置数据库（保留 admins/settings 数据）
  - `action=migrate_admin_role`：仅迁移管理员 role
  - `action=migrate_linuxdo`：仅迁移 Linux DO 字段

> 以上维护接口默认要求管理员登录（session `admin_id`），对应 UI：`admin/maintenance.html`。

### 5.2 登录与用户

- `api/user.php`
  - `register/login/logout/check`

- `api/admin.php`
  - `setup`：首次创建超级管理员
  - `login/logout/check`
  - `list/add/delete`：仅 `super` 允许
  - `change_password`

### 5.3 商品

- `api/products.php`
  - `list`：前台在售商品（不含敏感字段）
  - `all/add/edit/delete/toggle`：后台管理

### 5.4 订单

- `api/orders.php`
  - `create`：创建订单（必须登录）
  - `my/query`：查询自己的订单（**未支付订单不会返回 VPS 登录信息**）
  - `all/stats/refund/list`：后台

### 5.5 支付

- `api/pay.php?order_no=...`
  - 生成 POST 表单跳转到支付网关

- `api/notify.php`
  - Epay 异步回调：验签成功后把订单置为已支付，并把商品标记为已售

### 5.6 公告

- `api/announcements.php`
  - `list/detail`：前台
  - `all/add/edit/delete/toggle_top/toggle_status`：后台
### 5.7 工单

- `api/tickets.php`
  - `list/create/detail/reply/close`：用户与管理员通用（内部做权限判断）
  - `all/stats/admin_list`：后台

### 5.8 优惠券

- `api/coupons.php`
  - `validate`：前台验证优惠券并计算折扣（需登录）
  - `all/create/update/toggle/delete`：后台管理

- `includes/coupons.php`提供工具函数：
  - `normalizeCouponCode()`：规范化优惠券码（去空格、转大写）
  - `computeCouponDiscount()`：计算折扣金额
  - `validateCouponForAmount()`：完整校验（状态、有效期、次数限制等）
  - `reserveCouponUsage()`：创建订单时占用优惠券
  - `markCouponUsedByOrder()`：支付成功后标记为已使用
  - `releaseCouponByOrder()`：订单取消/退款时释放优惠券
### 5.9 OAuth（Linux DO Connect）

- `api/oauth.php`
  - `action=check`：检查是否已配置（前台决定是否展示登录按钮）
  - `action=login`：跳转授权
  - `action=callback`：授权回调，创建/更新用户并登录

- `api/settings.php`
  - `get_oauth/save_oauth`：从 `api/config.php` 读取/写入 OAuth 配置
  - ⚠️ `save_oauth` 会写入 `api/config.php`，需要文件写权限

### 5.10 安全与审计

- `GET api/csrf.php`：获取 CSRF Token（前端 POST 请求需携带 `X-CSRF-Token`）
- `api/audit_logs.php`
  - `list`：后台查看审计日志（分页）

---

## 6. 静态资源缓存

前台/后台默认使用 `Date.now()` 给 CSS/JS 增加 `?v=`（自动缓存破坏），方便调试与修改。

如需启用强缓存，可把 `Date.now()` 改为固定版本号（例如发布日期/commit hash）。

---

## 7. 待改进与可扩展路线图（可选，**纯 PHP 可落地**）

> 说明：以下建议默认以 **PHP + MySQL（无额外中间件）** 为前提；如你的环境支持 Redis / 对象存储 / 队列等，可在这些基础上再进一步增强。

### 7.1 安全与风控（P0）✅ 已完成

> v20260125 已实现：CSRF 防护、登录限流（`rate_limits` 表）、审计日志（`audit_logs` 表）、敏感字段加密（`ssh_password`）。

- **Session 安全**：`httponly / secure / samesite`，建议强制 HTTPS；后台可做简单 IP 白名单（可选）。

### 7.2 订单与支付（P0 / P1）

- **回调幂等与事务**：`notify.php` 可能重复回调，建议用 DB 事务 + `UPDATE ... WHERE status=0` 保证只处理一次。
- ~~**更完善的退款/取消字段**~~：✅ v20260125 已实现（`refund_reason / refund_at / refund_trade_no / refund_amount / cancel_reason / cancelled_at`）
- **订单备注与人工处理（后台）**
  - 支持 `admin_note`、手动标记“已交付”、补发交付信息。
- **支付网关抽象/多网关支持（可选）**
  - `settings` 增加 `gateway_base_url / gateway_name / sandbox_mode` 等；`pay.php/notify.php` 根据配置路由。

### 7.3 商品与交付（P1）

- **商品多库存/资源池（推荐）**
  - 现状：敏感登录信息直接放在 `products`。建议拆分：
    - `products`：只存“商品规格与价格”
    - `vps_inventory`：存具体资源（IP/端口/账号/密码/状态）
- **自动交付（可选，纯 PHP 也能做）**
  - 支付成功后从库存池挑选一条库存绑定到订单，并写入 `deliveries`（交付记录）。
- **续费/周期（按月/季/年）**
  - `products` 增 `billing_cycle`；`orders` 增 `period_start/period_end`；支持到期提醒、续费订单。
  - 到期提醒可用：服务器 `cron`（推荐）或“访问触发的懒执行”（无 cron 时的替代方案）。
- **商品展示增强**：商品图片/详情、标签/分类、搜索/筛选、上下架策略、限购（同一用户/同一时间窗口）。

### 7.4 优惠券与营销（P1 / P2）

- **适用范围控制**：限定商品/分类、限定用户（白名单）、仅新用户可用
  - 可选表：`coupon_products`、`coupon_user_whitelist`
- **叠加规则**：优惠券与活动（满减/首单）是否可叠加；明确优先级。
- **自动发券**：注册/首单/人工补发/工单解决后发券（事件触发即可，无需额外服务）。
- **推广码/邀请返利（可选）**：成交后返积分/返券（表：`referrals`）。

### 7.5 用户与账号体系（P1）

- **找回密码** / **邮箱验证**
  - 可选表：`password_resets`、`email_verifications`
  - 邮件发送：优先用 SMTP（PHPMailer 等库），避免 `mail()` 受限导致送达率差。
- **站内消息/通知中心**（支付成功、交付、工单回复等）
  - 可选表：`notifications`（含已读状态）
- **账号绑定管理（OAuth）**：资料页展示绑定状态、解绑策略、二次确认（可选）。

### 7.6 工单与运营（P2）

- 工单 **SLA/优先级/标签**、指派给管理员（字段：`priority / assignee_admin_id / tags`）
- 工单附件上传（图片/日志）
  - 纯 PHP 方案：上传到站点本地目录（如 `uploads/`），并在 DB 保存路径；下载/预览时做权限校验。
- 公告定时发布/到期自动下线（字段：`publish_at / expires_at`，配合 cron 或懒执行）。

### 7.7 报表与数据导出（P2）

- 订单/优惠券/工单导出 CSV（后台）
- 运营看板：收入、转化、客单价、支付成功率、优惠券使用率
- 数据清理：软删除与归档（大表拆分/按月归档）。

### 7.8 性能与稳定性（P0 / P1）

-~~**关键索引**~~：✅ v20260125 已添加（`orders`、`coupon_usages`、`tickets` 相关索引）
- ~~**错误日志**~~：✅ v20260125 已实现（`error_logs` 表）
- **简单缓存**：公告/商品列表可做短 TTL **文件缓存**（无额外依赖），并提供后台一键清缓存。

### 7.9 可维护性（P1）

- 配置管理：继续使用 `api/config.php`，也可支持从 `getenv()` 读取（方便面板/容器注入）。
- 数据库迁移版本号：`schema_migrations`（版本号 + 执行时间 + 描述），让升级可追溯、可回滚。
- API 规范化：参数校验、错误码枚举、统一鉴权/权限检查（中间件/公共函数方式即可）。

---

## 8. 更新日志摘要

### v20260224 - 安装向导重构 & Bug修复 & 代码优化

- 可视化安装向导（前后端分离，三步流程）
- 后台数据库更新提示弹窗
- 订单号碰撞、通知已读误匹配、退出登录资源泄漏等 Bug 修复
- `createNotification` 提取为公共模块

### v20260126 - 全面代码审计与修复

- 后端核心模块优化（参数验证、错误处理、SQL/XSS防护）
- 前端与后台功能完善（交互逻辑、响应式布局）

详细更新内容请参阅 `CHANGELOG.md`。


## 4.1 本次增量开发新增的核心表

- `product_templates`：商品模板
- `credit_transactions`：余额流水
- `ticket_events`：工单事件时间线
- `ticket_reply_templates`：工单回复模板
- `linuxdo_user_access_rules`：Linux DO 用户白名单/黑名单
- `trust_level_discounts`：信任等级折扣

## 4.2 关键新增字段

- `users.credit_balance / linuxdo_active / linuxdo_silenced`
- `products.template_id / region / line_type / os_type / description / min_trust_level / risk_review_required / allow_whitelist_only`
- `orders.payment_method / balance_paid_amount / external_pay_amount / delivery_status / delivery_note / delivery_error / delivery_updated_at / handled_admin_id / trust_discount_amount / trust_level_snapshot`
- `tickets.category / priority / internal_note / verified_status / refund_allowed / refund_reason / handled_admin_id`

## 4.3 关键接口

- `api/credits.php`
  - `summary`：当前用户余额摘要
  - `my_transactions`：当前用户余额流水
  - `admin_users`：后台用户余额列表
  - `admin_transactions`：后台流水查询
  - `admin_adjust`：后台手动加减积分
- `api/templates.php`
  - `list/create/update/delete/toggle/create_from_product`
- `api/community.php`
  - `overview/users/rules/save_rule/delete_rule/discounts/save_discount/delete_discount/save_settings`
- `api/orders.php`
  - `pay_balance`：余额支付
  - `update_delivery_status`：后台推进交付状态

## 4.4 迁移规范

- 所有新表/字段/索引统一写入 `api/update_db.php`。
- 新装与升级统一复用 `includes/schema.php`。
- 默认配置项（通知/风控等）统一通过 `getProjectDefaultSettings()` 下发。
