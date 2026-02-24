# VPS积分商城更新日志

---
## v20260224（当前版本）
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
