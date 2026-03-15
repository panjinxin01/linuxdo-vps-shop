# 更新日志

## 2026-03-15 代码重构 & Bug修复

### 重构
- 对 `js/main.js` 进行全面重构：合并所有重复定义的函数（showOrderDetail、doAuth、loadMyOrders、loadAvailableInstances 等），删除所有历史补丁块，按功能模块分区整理（初始化/工具 → 认证 → 商品/购买 → 订单 → 公告 → 工单 → 通知 → 用户余额 → 退款）
- 对 `js/admin.js` 进行去重整理，合并重复函数定义
- 清理 `index.html` 中未使用的空 `modal-foot` 结构
- 清理所有 API 和 includes 文件中的冗余代码

### 修复
- 修复订单详情弹窗同时存在顶部 `×` 和底部"关闭"两个关闭按钮的问题，统一只保留顶部关闭按钮
- 修复商品详情、公告详情弹窗同样存在的重复关闭按钮问题
- 修复订单详情中 `delivery_info` 显示加密码原文（`enc:...`）的问题，新增 `decryptDeliveryInfo()` 函数对交付信息中的加密字段统一解密
- 修复订单详情底部"发起工单""申请退款"按钮文字换行、对齐错乱的问题，优化按钮样式为 `white-space:nowrap` 防止文字折行
- 修复同一订单可被重复退款的严重漏洞，在 `commerceRefundOrder` 事务内增加 `SELECT ... FOR UPDATE` 行锁验证订单状态
- 修复后台退款成功后订单详情弹窗未关闭，导致可重复点击退款按钮的问题
- 已退款/已取消订单现在点击"订单详情"会提示"当前订单已退款/已取消，不可查看详情"
- 已退款/已取消订单的"复制全部"及单项复制按钮现在会提示"当前订单已退款/已取消，不可复制连接信息"

---

## 2026-03-15 更新汇总


### 补完优化（2026-03-15）
- 前台“申请退款”从 prompt 流程升级为正式弹窗表单，可直接选择退款到原路/站内余额，并填写退款原因与补充说明。
- 后台退款工单详情增加退款审批信息区，可直接修改审批退款方式、填写审批备注后执行自动退款。
- 统一优化后台表格内小按钮样式，提升公告、订单、工单等区域的操作按钮观感与可点性。

### 修复
- 修复数据库更新脚本遗漏 `orders.delivery_info` 字段，导致后台填写交付信息后前台仍无法显示的问题。
- 修复后台填写交付信息后仍可能保持“待开通”的问题；现在保存交付信息时会自动切换为“已交付”。
- 修复前台订单详情在无快照字段但有交付文本时，无法识别并展示连接信息的问题。
- 修复前台缺少 `orderDetailModal` 节点，导致点击“订单详情”后无法正常弹出详情层的问题。
- 修复旧版“可用实例”卡片中仍残留 `switchPage('orders')` 逻辑，点击详情会误跳转到订单列表的问题。
- 修复后台“标记已交付”时传入的 `delivery_info` 没有实际写入订单表的问题。
- 修复 Linux DO OAuth 回调在 `state` 丢失或重复回调场景下，页面提示“安全验证失败”但返回首页后又已登录的体验问题；错误页增加“重新登录”入口。
- 修复后台“积分管理 / 搜索用户”接口已返回分页结构，但前端仍按数组读取，导致明明有用户却始终显示“暂无用户”的问题。
- 修复后台订单列表与订单详情错误读取 `username` 字段，导致订单明明有关联用户却显示为 `-` 的问题。
- 修复订单查询在商品被删除或已不存在时，商品名称直接丢失的问题；现会优先读取订单快照，并在缺失时回退显示 `商品#ID`。
- 修复余额支付与 EasyPay 回调成功后未自动将商品标记为非在售状态的问题，避免已付款商品继续显示“在售”。
- 修复后台积分流水未联查用户表，导致流水列表只能显示 `#用户ID`、无法显示用户名的问题。
- 修复前台欢迎语偶发显示 `[object Object]` 或丢失用户名的问题，统一前端用户态归一化逻辑。
- 修复“可用实例”与“我的订单”对历史订单展示不一致的问题，前端改为优先展示订单商品快照。
- 修复点击“订单详情”只跳转列表、看不到配置的问题，新增前台订单详情弹窗。
- 修复商品被删除后，历史订单显示“商品已删除”且规格全为空的问题；新增订单商品/凭据快照字段，并在查询时优先回退到订单快照。
- 修复删除商品后导致历史订单丢失名称、规格、凭据的问题，删除前自动回填订单快照。
- 修复前台 `currentUser` 在缓存/回退场景下偶发显示为 `[object Object]` 或丢失用户名的问题。
- 修复浏览器从支付页返回后，`新建实例`/`可用实例` 区块偶发读取旧缓存而出现“加载失败，请刷新重试”的问题。
- 修复 EasyPay 多次发起同一未支付订单时，`out_trade_no` 重复导致平台返回唯一键冲突的问题；新增 `payment_requests` 映射表为每次外部支付生成唯一请求号。
- 修复异步支付通知仅按 `orders.order_no` 匹配，导致新外部支付请求号无法正确回写订单的问题。
- 修复前台首页欢迎语偶发显示 `[object Object]` 的问题，统一前端用户态结构。
- 修复“可用实例 / 新建实例”语义混淆：可用实例改为展示用户已拥有实例，新建实例仅展示可购买商品。
- 修复部分旧站升级时 `users.email_verified`、`users.updated_at` 重复字段被误判为失败的问题。
- 修复旧库缺少 `product_templates` 或部分商品扩展字段时，商品列表接口直接报错导致前台“加载失败”的问题。
- 修复订单列表里已支付订单仍显示 `payment_method=pending`、`delivery_status=待支付` 的兼容展示问题。
- 新增退款方式：后台可选择退回站内余额或原路退回支付账户。

### 调整
- 数据库更新时会尝试用已有快照回填 `delivery_info`，便于旧订单补显示连接信息。
- 前台静态资源版本更新为 `20260315e`，降低浏览器缓存导致旧脚本不生效的概率。
- 前台订单详情页新增展示：配置信息、交付信息、交付备注、异常说明、连接信息。
- 已支付订单在非异常状态下即可查看订单快照中的连接信息，不再强依赖 `delivered` 状态。
- 后台订单详情新增“交付信息”编辑框，并在保存交付状态时一并写入。
- 更新前台静态资源版本号为 `20260315d`，降低浏览器缓存导致旧脚本继续生效的概率。

### 数据库
- `orders` 新增商品快照字段：`product_name_snapshot`、`cpu_snapshot`、`memory_snapshot`、`disk_snapshot`、`bandwidth_snapshot`、`region_snapshot`、`line_type_snapshot`、`os_type_snapshot`、`description_snapshot`、`extra_info_snapshot`、`ip_address_snapshot`、`ssh_port_snapshot`、`ssh_user_snapshot`、`ssh_password_snapshot`。
- `update_db.php` 增加快照字段迁移与基于现有 `products` 的自动回填逻辑。

### 说明
- 旧订单若是在“订单快照字段”上线前创建、且对应商品又已被物理删除，历史规格/凭据无法从现有数据中完全反推；本次修复后，新订单会继续保留快照，后续删除商品也不会再只剩“商品已删除”。

# VPS积分商城更新日志

---
## v20260314.1（余额钱包 / 商品模板 / 交付状态 / 社区规则 / 工单增强 / 报表）

### 新增
- ✨ 新增站内余额钱包：`users.credit_balance` + `credit_transactions`，支持后台手动加减积分、前台余额摘要、积分流水、余额变动通知。
- ✨ 新增余额支付订单能力：保留优惠券链路，支持“优惠券后余额支付”，EasyPay 外部支付继续保留。
- ✨ 新增商品模板系统：`product_templates` + 商品 `template_id`，支持模板回填规格字段。
- ✨ 新增 Linux DO 社区特化：最低 `trust_level`、silenced 风控、白名单/黑名单、信任等级折扣。
- ✨ 新增工单增强：分类、优先级、内部备注、核实状态、退款审核字段、事件时间线、回复模板、附件上传审计。
- ✨ 新增通知中心升级：站内通知继续保留，并扩展邮件 / Webhook 通道配置。
- ✨ 新增后台统计报表接口：今日/月成交额、余额支付订单数、EasyPay 支付订单数、热门商品、工单分类占比、余额总量、异常订单统计。

### 调整
- 🔧 `api/install.php` 与 `api/update_db.php` 统一复用 `includes/schema.php`，新装与旧站升级结构保持一致。
- 🔧 `api/orders.php` 改为支付状态与交付状态分离，前后台都可以看到订单真实处理进度。
- 🔧 `api/oauth.php` / `api/user.php` 继续兼容 Linux DO Connect，并补充 `active / silenced` 字段入库与返回。
- 🔧 `api/notify.php` 在 EasyPay 回调成功后自动推进 `delivery_status=paid_waiting`（或命中审核时进入异常 / 审核状态）。
- 🔧 前台购买弹窗增加余额支付入口；后台商品弹窗增加模板、地区、线路、系统、最低信任等级、审核/白名单限制字段。

### 变更文件
- `includes/schema.php`
- `includes/commerce.php`
- `includes/notifications.php`
- `api/install.php`
- `api/update_db.php`
- `api/settings.php`
- `api/dashboard.php`
- `api/credits.php`
- `api/templates.php`
- `api/community.php`
- `api/products.php`
- `api/orders.php`
- `api/notify.php`
- `api/oauth.php`
- `api/user.php`
- `api/upload.php`
- `js/main.js`
- `js/admin.js`
- `index.html`
- `admin/index.html`
- `README.md`
- `DEVELOPMENT.md`

### 兼容性
- ✅ 保留原有 PHP + MySQL + 静态前端架构，不改框架。
- ✅ 保留 Linux DO Connect OAuth 授权码登录链路。
- ✅ 保留 Linux DO Credit / EasyPay 支付与退款链路。
- ✅ 老站升级只需执行数据库更新，不破坏原数据。

## v20260314（当前版本）
**Debug 修复版 / 安装兼容性增强 / 依赖缺失兜底 / 文档补充**


### 修复
- 🐛 修复安装器写入 `api/config.php` 后，在启用 OPcache 的环境下仍可能读取旧配置的问题。
- 🐛 修复 `mbstring` 扩展缺失时，部分接口因直接调用 `mb_strlen()` / `mb_substr()` 导致的 fatal error。
- 🐛 修复 `curl` 扩展缺失时，OAuth 与退款相关接口因直接调用 `curl_*` 导致的 500 / fatal error。

### 调整
- 🔧 在 `api/install.php` 写入配置后增加缓存失效处理，确保安装流程读取到最新配置。
- 🔧 在 `includes/db.php` 中增加 UTF-8 兼容函数 `utf8Length()` 与 `utf8Substr()`，并统一替换相关调用。
- 🔧 在 `includes/security.php` 中增加通用 HTTP 请求函数 `httpRequest()`，优先使用 cURL，缺失时自动回退到 `file_get_contents + stream_context_create`。

### 涉及文件
- `api/install.php`
- `api/announcements.php`
- `api/tickets.php`
- `api/orders.php`
- `api/oauth.php`
- `includes/db.php`
- `includes/security.php`
- `DEBUG_REPORT.md`

### 校验结果
- ✅ 全部 PHP 文件已通过 `php -l` 语法检查。
- ✅ 全部 JS 文件已通过 `node --check` 检查。
- ✅ 本地已验证安装器生成密钥后，`has_encryption_key` 状态可正常返回。

### 上线前建议
- 确认服务器已启用：`pdo_mysql`、`openssl`、`fileinfo`。
- 确认 `api/config.php` 与 `uploads/` 目录具备写入权限。
- 确认支付回调地址与 OAuth 回调地址配置正确。
- 若为旧库升级，建议先执行一次数据库更新流程。

---
## v20260224
**安装向导重构 & Bug修复 & 代码优化**

### 新增功能
- ✨ **可视化安装向导**：全新三步安装流程（前后端分离）
  - 步骤1：自定义数据库配置（地址、端口、用户名、密码、数据库名），支持在线测试连接
  - 步骤2：一键生成加密密钥（可选）
  - 步骤3：一键初始化数据库表结构
  - 配置自动写入 `api/config.php`，无需手动编辑
- ✨ **后台数据库更新提示弹窗**：管理员登录后台时自动检测缺失表，弹窗提示可选择更新或忽略

### Bug修复
- 🐛 订单号生成碰撞风险：`rand()` 改为 `bin2hex(random_bytes(4))`
- 🐛 通知已读标记误匹配：改用 `data-notif-id` 精确匹配
- 🐛 退出登录未停止通知轮询和清理工单列表
- 🐛 首页管理实例区域重复请求订单API：改为复用 `loadMyOrders` 数据

### 代码优化
- 🔧 `createNotification` 提取到 `includes/notifications.php` 公共文件，消除三处重复定义
- 🔧 `check_install.php` 增加 `config_ok` 检测，配置缺失时正确引导到安装页
- 🔧 安装页前后端分离：`api/install.php`（纯JSON API）+ `admin/install.html` + `css/install.css` + `js/install.js`

### 新增文件
- `includes/notifications.php` - 通知函数公共模块
- `admin/install.html` - 安装向导页面
- `css/install.css` - 安装向导样式
- `js/install.js` - 安装向导逻辑

### 修改文件
- `api/install.php` - 重构为纯JSON API
- `api/check_install.php` - 增加配置检测
- `api/orders.php` - 订单号生成优化 + 引入公共通知模块
- `api/tickets.php` - 引入公共通知模块，删除重复定义
- `api/notifications.php` - 引入公共通知模块，删除重复定义
- `api/notify.php` - 引入公共通知模块，删除重复定义
- `js/main.js` - 多项Bug修复 + 安装跳转更新
- `js/admin.js` - 新增数据库缺失检测弹窗逻辑
- `admin/index.html` - 新增数据库更新提示弹窗
- `admin/login.html` / `admin/setup.html` - 安装跳转地址更新

---
## v20260126
**全面代码审计与修复**

### 第一阶段：后端核心修复（includes/ + api/）

**includes/ 文件夹修复**：
- 🔧 `db.php` - 数据库连接优化、PDO异常处理增强
- 🔧 `security.php` - 安全函数参数校验、返回值规范化
- 🔧 `coupons.php` - 优惠券计算逻辑修复、边界条件处理
- 🔧 `cache.php` - 缓存机制优化

**api/ 文件夹修复**：
- 🔧 请求参数验证增强（类型检查、边界值处理）
- 🔧 错误处理和异常捕获完善
- 🔧 响应格式统一性优化
- 🔧 权限验证逻辑加固
- 🔧 SQL注入和XSS防护增强

### 第二阶段：前端与后台修复（admin/ + css/ + js/ + index.html）

**admin/ 文件夹修复**：
- 🔧 `index.html` - 后台管理界面优化、表单验证增强
- 🔧 `login.html` - 登录页安全性增强
- 🔧 `setup.html` - 初始化设置页面修复
- 🔧 `maintenance.html` - 维护页面功能完善

**css/ 文件夹修复**：
- 🔧 `style.css` - 样式兼容性修复、响应式布局优化
- 🔧 `admin.css` - 后台样式统一规范
- 🔧 `variables.css` - CSS变量规范化

**js/ 文件夹修复**：
- 🔧 `main.js` - 前台逻辑优化、API调用错误处理、用户交互增强
- 🔧 `admin.js` - 后台功能逻辑修复、数据验证完善

**index.html 修复**：
- 🔧 HTML结构优化
- 🔧 表单验证增强
- 🔧 安全属性完善

---
## v20260125
**安全与稳定性增强**

### 新增功能
- ✨ **CSRF 防护**：前后端统一 `X-CSRF-Token` 验证
- ✨ **登录/敏感接口限流**：新增 `rate_limits` 表
- ✨ **后台操作审计日志**：新增审计表与后台日志页
- ✨ **敏感字段加密**：VPS SSH 密码加密存储（需配置 `DATA_ENCRYPTION_KEY`）
- ✨ **仪表盘补全接口**：最近订单/工单列表可用

### 修复/调整
- 🐛 **退款逻辑优化**：订单不再删除，改为状态化并记录退款字段
- 🔧 **自动取消**：补充取消原因与时间
- 🔧 **错误日志记录**：新增 `error_logs` 表

### 数据库变更
```sql
-- 新增安全相关表
CREATE TABLE rate_limits (...);
CREATE TABLE audit_logs (...);
CREATE TABLE error_logs (...);

-- orders 增加退款/取消字段与索引
ALTER TABLE orders ADD COLUMN refund_reason VARCHAR(255);
ALTER TABLE orders ADD COLUMN refund_trade_no VARCHAR(100);
ALTER TABLE orders ADD COLUMN refund_amount DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN refund_at DATETIME;
ALTER TABLE orders ADD COLUMN cancel_reason VARCHAR(255);
ALTER TABLE orders ADD COLUMN cancelled_at DATETIME;
CREATE INDEX idx_orders_user_status_created ON orders (user_id, status, created_at);

-- products/ tickets/ coupon_usages 索引与字段调整
ALTER TABLE products MODIFY COLUMN ssh_password VARCHAR(255);
CREATE INDEX idx_tickets_user_status_updated ON tickets (user_id, status, updated_at);
CREATE INDEX idx_coupon_user_order ON coupon_usages (coupon_id, user_id, order_no);
```

**新增文件**：
- `includes/security.php` - 安全工具函数
- `api/csrf.php` - CSRF Token 接口
- `api/audit_logs.php` - 审计日志接口

**修改文件**：
- `api/admin.php` / `api/user.php` / `api/products.php` / `api/orders.php` / `api/pay.php`
- `api/tickets.php` / `api/announcements.php` / `api/settings.php`
- `api/update_db.php` / `api/install.php` / `api/config.php`
- `admin/index.html` / `admin/login.html` / `admin/setup.html` / `admin/maintenance.html`
- `js/admin.js` / `js/main.js`
- `DEVELOPMENT.md`

---
## v20260116
**优惠券系统上线**

### 新增功能
- ✨ **完整的优惠券系统**：
  - 支持固定金额（fixed）和百分比（percent）两种折扣类型
  - 灵活的使用限制：最低消费门槛、总次数限制、每用户限制
  - 百分比折扣支持设置最大优惠金额上限
  - 优惠券有效期管理（起始时间/结束时间）
  - 优惠券状态管理（启用/停用）
-✨ **前台优惠券功能**：
  - 下单时输入优惠券码实时验证
  - 显示优惠金额和最终应付金额
  - 自动计算折扣并应用到订单
- ✨ **后台优惠券管理**：
  - 完整的 CRUD 操作
  - 查看优惠券使用统计
  - 防误删保护（已使用的优惠券只能停用不能删除）
- ✨ **智能优惠券占用与释放**：
  - 创建订单时自动占用优惠券额度
  - 支付成功后标记为已使用
  - 订单超时/取消时自动释放优惠券- 退款时释放优惠券供再次使用

### 数据库变更
```sql
-- 新增优惠券表
CREATE TABLE coupons (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100),
    type VARCHAR(10) NOT NULL COMMENT 'fixed/percent',
    value DECIMAL(10,2) NOT NULL,
    min_amount DECIMAL(10,2) DEFAULT0,
    max_discount DECIMAL(10,2),
    max_uses INT DEFAULT 0 COMMENT '0=不限',
    per_user_limit INT DEFAULT 0 COMMENT '0=不限',
    used_count INT DEFAULT 0,
    starts_at DATETIME,
    ends_at DATETIME,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 新增优惠券使用记录表
CREATE TABLE coupon_usages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    coupon_id INT NOT NULL,
    user_id INT NOT NULL,
    order_no VARCHAR(32) NOT NULL,
    status TINYINT DEFAULT 0 COMMENT '0占用 1已使用',
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- orders 表新增字段
ALTER TABLE orders ADD COLUMN original_price DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN coupon_id INT;
ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN coupon_discount DECIMAL(10,2) DEFAULT 0;
```

**新增文件**：
- `api/coupons.php` - 优惠券管理接口
- `includes/coupons.php` - 优惠券工具函数

**修改文件**：
- `api/orders.php` - 集成优惠券验证与应用
- `api/notify.php` - 支付成功后标记优惠券已使用
- `api/pay.php` - 支付跳转时携带优惠券信息
- `api/install.php` - 新增优惠券相关表
- `api/update_db.php` - 数据库升级支持优惠券表和字段迁移
- `admin/index.html` - 后台新增优惠券管理模块
- `index.html` - 前台下单流程集成优惠券输入
- `js/admin.js` - 后台优惠券管理功能
- `js/main.js` - 前台优惠券验证与使用
- `README.md` / `DEVELOPMENT.md` - 文档更新

---
## v20260109
**安装/维护一致性修复 & 文档同步**

### 修复
- 🐛 修复安装脚本中 `admins.role` 字段的 SQL 注释语法（`DEFAULT 'admin' COMMENT ...`），避免部分 MySQL 版本建表失败。
- 🐛 修复 `api/check_install.php` 的安装检测：补齐公告/工单相关表的检查，避免“已安装但仍跳转安装页”。
- 🔧 同步 `api/update_db.php` 与 `api/install.php` 的表结构约定：
  - `orders.status` 注释包含 `3已取消`（与 `orders.php` 的 **15 分钟未支付自动取消** 逻辑一致）
  - reset 重建表时的字段注释与安装脚本保持一致。

### 文档
- 📝 README / DEVELOPMENT 全面更新：安装流程、维护入口、表结构、接口说明以当前代码为准。

---
## v20250702
**后台管理系统优化 & 管理员权限管理**

- ✨ **管理员权限系统**：新增超级管理员/普通管理员角色区分
  - 超级管理员可添加/删除其他管理员
  - 普通管理员无管理员管理权限
  - 首个创建的管理员自动成为超级管理员
- ✨ **后台界面全面优化**：
  - 新增顶部导航栏（面包屑、刷新按钮、用户头像菜单）
  - 统计卡片带渐变色彩装饰
  - 仪表盘新增快捷操作面板
  - 仪表盘新增最近订单/待处理工单卡片
  - 响应式布局优化（支持移动端）
- ✨ **数据库迁移自动化**：update 操作自动执行所有字段迁移
  - admins.role 字段迁移
  - users 表 Linux DO 字段迁移
  - 自动确保存在超级管理员
- 🔧 **Session 实时同步**：check 接口从数据库读取最新 role
- 🔧 **数据库重置保留配置**：reset 时保留 settings 表（OAuth 配置等）

**新增文件**：
- 无

**修改文件**：
- `api/admin.php` - 新增 list/add/delete 接口，check 返回实时 role
- `api/update_db.php` - 集成字段迁移，reset 保留 settings
- `js/admin.js` - 管理员管理功能，仪表盘增强
- `css/admin.css` - 全面重构样式
- `admin/index.html` - 新增管理员管理页面和弹窗

**数据库变更**：
```sql
-- admins 表新增 role 字段
ALTER TABLE admins
  ADD COLUMN role VARCHAR(20) DEFAULT 'admin' COMMENT 'admin普通管理员 super超级管理员';
```

---
## v20250604
**工单系统 & 公告系统**

- ✨ **工单系统**：用户可创建工单、关联订单、追加回复
  - 后台工单管理：查看、回复、关闭工单
  - 工单状态：待回复/已回复/已关闭
  - 工单统计展示
- ✨ **公告系统**：首页展示公告列表
  - 后台公告管理：发布、编辑、删除、置顶
  - 支持置顶公告、隐藏/显示切换
  - 点击查看公告详情

**新增文件**：
- `api/tickets.php` - 工单 API
- `api/announcements.php` - 公告 API

**修改文件**：
- `api/install.php` - 新增工单表和公告表
- `index.html` - 添加公告区域、工单区域和相关弹窗
- `js/main.js` - 前端工单和公告功能
- `css/style.css` - 公告和工单样式
- `admin/index.html` - 后台新增工单管理和公告管理 Tab
- `js/admin.js` - 后台管理功能
- `css/admin.css` - 后台工单样式

**数据库变更**：
```sql
-- 公告表
CREATE TABLE announcements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    is_top TINYINT DEFAULT 0,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 工单表
CREATE TABLE tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    order_id INT DEFAULT NULL,
    title VARCHAR(200) NOT NULL,
    status TINYINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 工单回复表
CREATE TABLE ticket_replies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---
## v20250603
**登录系统重构**

- ✨ **统一登录入口**：首页登录支持同时识别管理员和普通用户
  - 登录管理员账号 → 自动跳转后台管理页面
  - 登录普通用户账号 → 留在首页显示用户信息和订单
- ✨ **管理员快捷返回**：管理员在首页时显示“返回后台”按钮
- 🗑️ **移除冗余入口**：删除普通用户界面的“管理后台”链接
- 🔧 **角色检测**：API 返回用户角色信息（role: admin/user）

**修改文件**：
- `api/user.php` - 登录/检查接口增加角色判断
- `js/main.js` - 前端根据角色渲染不同 UI

---
## v20250602
**订单退款功能修复**

- 🐛 修复退款按钮不显示问题：商品删除后，已支付订单仍可正常显示退款按钮
- 确认退款逻辑仅依赖订单状态，与商品是否存在无关

---
## v20250601
**浏览器缓存解决方案（历史记录）**

- ✨ 静态资源版本号：为所有 JS/CSS 文件添加版本号参数（?v=日期）
- 📝 开发文档更新：在 DEVELOPMENT.md 中添加版本号更新说明
- 解决浏览器缓存导致代码更新不生效的问题

**涉及文件**：
- `index.html` - style.css, main.js
- `admin/index.html` - admin.css, admin.js
- `admin/login.html` - admin.css
- `admin/setup.html` - admin.css

---

## ⚠️ 重要提醒：静态资源缓存

当前代码默认使用 `Date.now()` 给 CSS/JS 增加 `?v=`（自动缓存破坏），因此 **无需手动修改版本号**。

如果你想启用强缓存（把 `Date.now()` 改成固定版本号），再参考下面的“手动版本号更新”方法：

### 手动版本号格式（仅在你改为固定版本号时适用）

```html
<link rel="stylesheet" href="css/style.css?v=20260109">
<script src="js/main.js?v=20260109"></script>
```

## 2026-03-15 数据库列检测兼容修复版

### 修复
- 修复部分 MySQL / MariaDB 环境下，`SHOW COLUMNS ... LIKE ?` 预处理写法导致列存在性误判的问题。
- 修复数据库维护页出现“更新结果显示 already_exists，但检查状态仍提示缺列”的自相矛盾现象。
- 修复支付与商城公共逻辑中对订单/商品列存在性检测不稳定的问题，避免已存在列被误判为不存在。

### 调整
- 数据库更新脚本改为优先使用 `information_schema.COLUMNS` / `information_schema.STATISTICS` 检测列与索引。
- 维护页接口请求增加 `no-store` 与时间戳参数，降低浏览器缓存导致旧状态残留的概率。
- 构建版本更新为 `20260315i`。


## 2026-03-15 退款 / 交付 / 管理后台修复版

### 修复
- 修复余额支付与 EasyPay 回调后，已有交付凭据的订单不会自动切换为“已交付”的问题。
- 修复后台订单详情只有保存交付状态、没有退款入口的问题；现已补充后台订单列表与详情页退款按钮。
- 修复前台订单缺少退款入口的问题；现支持用户发起退款申请并选择“原路退回”或“退回站内余额”。
- 修复退款工单提交后后台无法直接处理的问题；现已支持管理员在工单详情中“一键同意退款并自动处理”。
- 修复管理员只能手动新建管理员、无法从现有用户提权的问题；现已支持搜索已有用户并直接提权。
- 修复操作日志只能查看、不能快速清理的问题；现已支持二次密码验证后一键清空。
- 优化后台公告 / 表格操作区的小按钮样式，改善按钮过小、视觉杂乱的问题。

### 兼容性说明
- 新增 `tickets.refund_target` 字段，并已同步到 `includes/schema.php` 与 `api/update_db.php`。
- 部署后请先在后台“数据库维护”执行一次更新，再使用退款申请与工单退款审批功能。


### 补充修复（订单详情 / 退款金额 / 复制权限）
- 修复前台 `index.html` 点击“订单详情”误走后台专用接口，导致提示“请先登录后台”的问题。
- 修复订单已退款后，前台订单详情仍可能继续显示并复制连接信息的问题。
- 新增退款金额按剩余时长自动计算：默认按 30 天周期按比例退款，并在前台/后台显示当前可退金额与剩余天数。
- 退款申请与后台审批均改为以后端实际可退金额为准，避免前端显示与真实退款结果不一致。
