# VPS 积分商城（Linux DO Credit）

一个轻量级、**开箱即用**的 VPS 积分 / 信用兑换商城：PHP + MySQL 单体站点，前台 / 后台均为静态页面 + PHP 接口，无需 Composer 依赖。

> **当前版本**：`v20261002`（全量代码审计与缺陷修复归档；含 `v20261001` 工程结构拆分）
> **静态资源版本**：`?v=20261001`
> **完整更新日志**：[`CHANGELOG.md`](CHANGELOG.md)　|　**许可**：MIT（见 [`LICENSE`](LICENSE)）

## 目录

| 章节 | 说明 |
|------|------|
| [1. 项目简介](#1-项目简介) | 定位与适用场景 |
| [2. 功能一览](#2-功能一览) | 前台 / 后台 / 支付 / 运维能力清单 |
| [3. 环境要求](#3-环境要求) | PHP、MySQL、Web 服务器 |
| [4. 快速开始](#4-快速开始) | 从上传到登录后台的 6 步 |
| [5. 目录结构](#5-目录结构) | 拆分后的真实目录树 |
| [6. 配置说明](#6-配置说明) | 环境变量 / `config.local.php` |
| [7. 支付配置](#7-支付配置ldc-pay) | 双协议签名与平台管理接口 |
| [8. Linux DO Connect 登录](#8-linux-do-connect-登录oauth2可选) | OAuth2 接入要点 |
| [9. 数据库维护与升级](#9-数据库维护与升级) | 检查 / 更新 / 重置 |
| [10. 管理员恢复模式](#10-管理员恢复模式默认关闭) | 忘记管理员时的应急通道 |
| [11. 安全说明](#11-安全说明) | 内置防护 + 已审计修复项 |
| [12. 业务字段约定](#12-业务字段约定与代码一致) | 状态枚举含义 |
| [13. 更新与升级](#13-更新与升级) | 升级流程与缓存版本号 |
| [14. 已知问题](#14-已知问题) | 审计遗留项 |
| [15. 版本历史](#15-版本历史) | 精简记录 |

---

## 1. 项目简介

- **前台**：商品浏览 / 购买、余额与优惠券支付、订单与交付状态、工单、通知中心、余额流水。
- **后台**：商品、模板、订单、优惠券、公告、工单、积分、社区规则、统计报表、系统设置、管理员、审计日志、数据库维护。
- **支付**：对接 Linux DO Credit（官方 LDC 接口 Ed25519 优先，易支付兼容 MD5 兜底），支持异步回调、订单查询、退款、积分分发。
- **社区特化**：Linux DO `trust_level` / `active` / `silenced` 参与购买限制，支持白名单 / 黑名单、等级折扣。

站点为"无框架、无依赖"的单体应用：上传即可运行，安装向导会自动引导完成数据库初始化与首个管理员创建。

---

## 2. 功能一览

| 模块 | 能力 |
|------|------|
| 前台商城 | 商品列表与详情、商品模板回退展示、优惠券 + 余额组合支付、订单交付状态、Hash 路由 |
| 用户中心 | 我的实例、我的订单、余额与流水、工单（分类 / 优先级 / 附件）、通知中心 |
| 钱包 | `users.credit_balance` + `credit_transactions` 完整流水；后台可手动加减，下单可余额支付 |
| 商品管理 | 商品 CRUD、模板选择自动回填规格（CPU / 内存 / 硬盘 / 带宽 / 地区 / 线路 / 系统）、AI 自然语言一键生成配置 |
| 订单管理 | 下单 / 交付 / 退款 / 批量清理、订单快照（商品删除后仍可支付与退款） |
| 工单系统 | 分类、优先级、订单关联、内部备注、处理时间线、附件上传、快捷回复模板、IM 气泡式对话 |
| 通知 | 站内通知 + 可选邮件 / Webhook 通知 |
| 支付 | LDC Pay（Ed25519）/ 易支付（MD5）双协议自动选择；异步回调、订单查询、退款、商户积分分发、余额统计 |
| 社区规则 | Linux DO 信任等级购买限制、白名单 / 黑名单、等级折扣 |
| 后台运维 | 统计报表、系统设置、管理员与角色、操作日志、缓存管理、数据库维护 |
| 体验 | 前后台深浅双主题（`localStorage.theme`，默认深色）、毛玻璃头部 + 面包屑、移动端响应式 |

---

## 3. 环境要求

| 项目 | 要求 |
|------|------|
| PHP | **8.0+**（使用 `match`、命名参数、构造器提升等 8.0 特性） |
| 数据库 | MySQL 5.7+ / MariaDB 10.3+ |
| Web 服务器 | Nginx / Apache（需支持 PHP-FPM 或 mod_php） |
| 扩展建议 | `pdo_mysql`、`mbstring`、`curl`、`openssl`（Ed25519 签名）、`fileinfo` |

---

## 4. 快速开始

1. **上传源码**到站点目录（建议独立站点或独立子目录）。
2. **访问前台** `index.html` —— 若数据库未配置或表未初始化，会自动跳转到可视化安装向导（`admin/install.html`）。
3. **安装向导三步**：
   - 步骤 1：填写数据库连接信息（支持在线测试连接）
   - 步骤 2：生成数据加密密钥（可选，用于 VPS 密码加密存储）
   - 步骤 3：一键初始化数据库表结构
4. **创建首个管理员**：安装完成后自动跳转 `admin/setup.html` 创建**超级管理员**。
   - 若检测到数据库已存在管理员，`setup.html` 会停留在说明页，提示前往 `admin/login.html` 登录，或进入[管理员恢复模式](#10-管理员恢复模式默认关闭)。
5. **登录后台**：访问 `admin/login.html`。
6. **配置支付与站点**：后台「系统设置」填写支付、AI、通知等参数。

> 也可提前通过环境变量或 `api/config.local.php` 写入数据库配置，跳过向导的第 1 步。

### 安装锁

安装完成并创建管理员后，根目录会生成 `.install_lock`，此后 `api/install.php` 的所有**危险操作**（`run_install` / `save_config` / `test_db` / `generate_key`）均被拒绝。

如需重新安装，请手动删除 `.install_lock`（Linux：`rm .install_lock`）。

---

## 5. 目录结构

> 自 `v20261001` 起，原单体大文件已按职责拆分。标记 **【聚合】** 的文件是"入口"，内部只做 `require_once` / `@import` 转发，调用方路径完全不变。

```
├── admin/                          # 后台页面骨架（5 个 HTML）
├── api/                            # HTTP 接口（29 个 PHP，含自建的 config.local.php）
│   ├── config.php                  # 配置加载器（环境变量 / config.local.php）
│   ├── config.local.php            # 部署私有配置（自建，不提交仓库）
│   ├── orders.php products.php tickets.php
│   ├── pay.php notify.php          # 支付发起 / 异步回调
│   ├── ldcpay.php                  # LDC Pay 平台管理接口（管理员）
│   ├── install.php check_install.php update_db.php
│   ├── settings.php community.php coupons.php credits.php
│   ├── user.php admin.php password.php oauth.php
│   ├── ai.php templates.php announcements.php notifications.php
│   └── csrf.php cache.php upload.php export.php dashboard.php audit_logs.php
├── includes/                       # 公共 PHP 模块（46 个）
│   ├── db.php security.php commerce.php schema.php ldcpay.php   # 【聚合】转发子模块
│   ├── Db/                         # Request · Validate · Connection · Pagination · Auth（5）
│   ├── Security/                   # Session · Csrf · Network · RateLimit · Audit · Http · Crypto（7）
│   ├── Commerce/                   # Schema · Settings · OrderOutput · TicketMeta · User · Template
│   │                               # Access · TicketEvent · Normalize · Refund · Delivery · Balance（12）
│   ├── Schema/                     # Tables · Defaults（2）
│   ├── Ldcpay/                     # Config · Ed25519 · KeyFormat · EpaySign · Format
│   │                               # Payment · Query · Refund · Distribute · Utils（10）
│   ├── TicketService.php           # 工单服务层
│   ├── AppConfig.php coupons.php notifications.php cache.php
├── partials/                       # HTML 片段（39 个，由 js/core/partials.js 注入）
│   ├── admin/layout/               # 侧边栏 · 顶部栏
│   ├── admin/tabs/                 # 13 个后台标签页
│   ├── admin/modals/               # 6 个后台弹窗
│   ├── front/pages/                # 9 个前台页面区块
│   └── front/modals/               # 9 个前台弹窗
├── css/                            # 样式（85 个）
│   ├── style.css admin.css tickets.css   # 【聚合】入口
│   ├── tokens/variables.css        # 设计令牌（双主题变量）
│   ├── base/ layout/ components/ pages/ utilities/
│   ├── backend/ ticket/ install/
├── js/                             # 脚本（52 个）
│   ├── core/                       # common.js（apiFetch / CSRF / Toast / 分页）· partials.js
│   ├── front/                      # ui · app · auth · user-area · home · dashboard · products
│   │                               # orders · order-credentials · announcements · credits
│   │                               # utils · login · notifications/（5）
│   ├── admin/                      # app · dashboard · products · orders · settings · ed25519
│   │                               # coupons · announcements · maintenance · admins · audit-logs
│   │                               # templates · ai · credits · community · reports（16）
│   ├── ticket/                     # 工单共享模块（前后台复用）
│   │   ├── core/                   # constants · api · helpers
│   │   ├── render/                 # list · detail · states
│   │   ├── page/                   # view · markdown · new · admin-view
│   │   ├── user-controller.js admin-controller.js legacy-compat.js
│   └── install/                    # install · setup · maintenance
├── index.html                      # 前台入口骨架
├── login.html                      # 独立登录页
├── CHANGELOG.md                    # 完整更新日志
└── README.md                       # 本文件
```

### 两类"入口"约定

1. **聚合入口（CSS / PHP）**：`css/style.css`、`css/admin.css`、`css/tickets.css` 内部 `@import` 转发子模块；
   `includes/db.php`、`includes/security.php`、`includes/commerce.php`、`includes/schema.php`、`includes/ldcpay.php`
   内部 `require_once` 转发子模块。**子文件的引入顺序与拆分前完全一致**，保证层叠优先级 / 加载顺序不变。
2. **HTML 片段（partials）**：页面骨架里放 `<div data-partial="partials/..."></div>`，由 `js/core/partials.js`
   在**所有占位符之后、业务脚本之前**同步注入并移除占位符，DOM 顺序与内联时一致，业务 JS 零改动。

> 提示：修改任一 CSS / JS / partial 后，把对应入口处的版本号 `?v=YYYYMMDD` 提升即可刷新缓存（当前统一为 `?v=20261001`）。
> 片段文件内**不要**写 `<script>`（`innerHTML` 注入不会执行），页面脚本请放 `js/` 下。

---

## 6. 配置说明

源码中的 `api/config.php` 只是**配置加载器**，敏感配置请放在以下任一位置：

1. **环境变量**（优先级最高）
2. **`api/config.local.php`**（部署私有配置，**不要提交到代码仓库**）

```php
<?php
return [
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => 3306,
    'DB_USER' => 'your_db_user',
    'DB_PASS' => 'your_db_pass',
    'DB_NAME' => 'your_db_name',
    'DATA_ENCRYPTION_KEY' => '请替换为32位以上随机字符串',

    // Linux DO Connect OAuth2（可选）
    'LINUXDO_CLIENT_ID' => '你的 Client ID',
    'LINUXDO_CLIENT_SECRET' => '你的 Client Secret',
    'LINUXDO_REDIRECT_URI' => 'https://yourdomain.com/api/oauth.php?action=callback',
];
```

> **加载顺序**：`api/config.php` 先加载内置默认配置（含环境变量覆盖），随后若 `config.local.php` 存在，
> 会用其中定义的常量**补充**（已定义的常量不会被覆盖，因此环境变量优先级最高）。
>
> `api/config.local.php` 属于部署私有配置，更新源码时应保留，不要随源码覆盖或提交到 Git。

---

## 7. 支付配置（LDC Pay）

依据《LD支付文档》，平台网关基址为 `https://credit.linux.do`，支持两种协议：

| 协议 | 签名方式 | 提交地址 | 适用场景 |
|------|---------|---------|---------|
| 官方 LDC 接口（`type=ldcpay`） | Ed25519（商户私钥） | `/epay/pay/submit.php` | 安全性更高，需上传公钥到控制台 |
| 易支付兼容接口（`type=epay`） | MD5（key 拼接） | `/epay/pay/submit.php` | 兼容易支付 / CodePay / VPay 协议 |

> `pid` = Client ID，`key` = Client Secret —— 两种协议共用同一套应用身份。

后台「系统设置 → 支付配置」填写：

- `epay_pid`（即 Client ID）
- `epay_key`（即 Client Secret）
- `notify_url`（异步回调，指向 `api/notify.php`）
- `return_url`（同步跳转地址，可指向前台页面）

后台「系统设置 → LDC Pay」填写（启用官方 Ed25519 接口时需要）：

- `ldcpay_client_id` / `ldcpay_client_secret`
- `ldcpay_private_key`（Ed25519 私钥，可用页面按钮生成密钥对）
- `ldcpay_public_key`（对应公钥，需上传到 Linux DO Credit 控制台）

### 协议自动选择

`api/pay.php` 发起支付时：配置了 Ed25519 私钥则优先走官方接口，否则自动降级到易支付兼容接口。
回调统一由 `api/notify.php` 处理（按文档 3.3：MD5 验签 + `trade_status=TRADE_SUCCESS` 校验 + 响应体返回 `success`）。

### 平台管理接口（仅管理员）

`api/ldcpay.php` 提供文档 3.1 / 3.4 / 3.5 对应能力：

| Action | 说明 | 上游 |
|--------|------|------|
| `action=query&out_trade_no=xxx` | 订单查询（status：`1` 成功 / `0` 失败或处理中） | GET `/epay/api.php` |
| `action=distribute` | 商户积分分发（Basic Auth；成功后自动同步站内余额流水） | POST `/lpay/distribute` |
| `action=balance_stats` | 平台用户余额统计 | 公开统计接口 |

> 注意：文档 3.2 规定平台**仅支持全额退回**（`money` 必须等于原订单金额）。
> 系统退款时若按剩余时长折算的可退金额不足以覆盖外部支付部分，将自动改为全额退回站内余额。

---

## 8. Linux DO Connect 登录（OAuth2，可选）

在**服务器私有配置**中设置以下三项（推荐写入 `api/config.local.php` 或环境变量；后台「系统设置」也支持直接保存）：

- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_REDIRECT_URI`

配置成功后，前台登录弹窗会出现「使用 Linux DO 登录」。

| 接入要点 | 值 |
|---------|-----|
| 授权地址 | `https://connect.linux.do/oauth2/authorize` |
| Token 地址 | `https://connect.linux.do/oauth2/token` |
| 用户信息 | `https://connect.linux.do/api/user` |
| 授权模式 | `authorization_code` |
| `scope` | `user` |

> 请确保 `LINUXDO_REDIRECT_URI` 与 Linux DO Connect 后台登记的回调地址**完全一致**。

---

## 9. 数据库维护与升级

后台菜单「数据库维护」（`admin/maintenance.html`）提供三段式操作：

| 操作 | 说明 |
|------|------|
| **检查状态** | 检查缺失的表与字段 |
| **更新数据库** | 自动创建缺表 + 自动迁移必要字段（**不会删除现有数据**）；执行前先列出清单需确认 |
| **重置数据库** | 清空业务数据并重建表结构（保留 `admins` 与 `settings`）；**仅超级管理员**可执行 |

> 所有迁移统一走 `api/update_db.php`，老站可增量升级，无需重装。
> `build` 版本号可在「检查状态」结果中查看（当前 `20260822`）。

---

## 10. 管理员恢复模式（默认关闭）

**适用场景**

- 刚完成数据库初始化，但 `admin/setup.html` 提示"当前数据库中已存在管理员账号"；
- 怀疑当前连接的是旧数据库，或库中残留历史管理员数据；
- 无法确认或找回原管理员账号，需要重新创建首个管理员。

**重要说明**

- 恢复模式**默认关闭**，不会对公网访客暴露危险操作；
- 恢复配置应通过环境变量或 `api/config.local.php` **临时注入**，不建议直接改源码；
- 恢复操作**仅允许服务器本机执行**；即使开关已启用，公网访问也不能触发清空管理员；
- 恢复操作**只清空 `admins` 表**，不会删除用户、订单、商品、设置等业务数据；
- 恢复完成后请**立即**关闭开关并移除恢复密钥。

**启用步骤**

在 `api/config.local.php` 中临时加入：

```php
<?php
return [
    'ADMIN_RECOVERY_ENABLED' => true,
    'ADMIN_RECOVERY_KEY' => '请替换为你自己设置的高强度恢复密钥',
];
```

1. 在**服务器本机**访问 `admin/setup.html`（例如经 `127.0.0.1` 或等效本地方式）；
2. 刷新页面，确认恢复面板可见；
3. 输入你设置的 `ADMIN_RECOVERY_KEY`；
4. 在确认文本框中输入：`RESET ADMINS`；
5. 执行「清空旧管理员并重新创建」；
6. 页面刷新后重新创建首个管理员；
7. 立即将 `ADMIN_RECOVERY_ENABLED` 改回 `false`，并删除或更换 `ADMIN_RECOVERY_KEY`。

**内置保护**：CSRF 校验 · 限流 · 恢复密钥校验 · 固定确认文本校验 · 仅本机可执行 · 执行日志记录 · 执行后自动清除当前管理员会话。

---

## 11. 安全说明

**内置防护**

| 类别 | 说明 |
|------|------|
| 配置隔离 | `api/config.php` 仅作加载器；数据库密码、OAuth Secret、恢复密钥放环境变量或 `config.local.php` |
| CSRF | 前后端统一的 `X-CSRF-Token` 校验（含安装向导的 4 个危险 action） |
| 会话安全 | 登录成功后轮换 session id（`session_regenerate_id`），防会话固定 |
| 限流 | 登录 / 注册 / 敏感接口限流；注册限流按 **IP** 维度，无法靠换用户名绕过 |
| 越权防护 | 接口按操作分级鉴权（如数据库重置仅超级管理员）；工单详情校验归属，防 IDOR |
| 数据脱敏 | 公开商品列表剔除 SSH 凭据；工单内部备注不返回给普通用户；设置接口敏感值以 `********` 返回 |
| 加密存储 | VPS SSH 密码加密存储（需配置 `DATA_ENCRYPTION_KEY`） |
| 注入防护 | 全部用户输入走 `prepare/execute` 或 `bindValue` |
| 上传安全 | 目录前缀带分隔符比对，防兄弟目录穿越；CSV 导出防公式注入 |
| 支付安全 | 回调 MD5 验签 + `pid` 一致性校验 + 请求号幂等 + 交易号复用检查 |

**v20261002 审计修复**（共 28 项，详见 [`CHANGELOG.md`](CHANGELOG.md#v20261002--全量代码审计与缺陷修复原-debug_reportmd-并入)）

- 致命 / 高危 8 项：商品编辑导致超卖、普通管理员可重置数据库、外部支付订单无法部分退款、工单内部备注泄露、会话固定、安装向导无 CSRF、注册限流可绕过、安装检测恒为已配置。
- 中危 16 项、前端一致性 4 项：详见更新日志。

**建议**

- 全站启用 HTTPS（商品含 SSH 登录信息，仅在**已支付订单**中下发）；
- `api/config.local.php` 不要提交 Git、不要随下载包分发；
- `ADMIN_RECOVERY_KEY` 用后即换，并将 `ADMIN_RECOVERY_ENABLED` 改回 `false`。

---

## 12. 业务字段约定（与代码一致）

| 字段 | 取值 |
|------|------|
| `products.status` | `1` 在售，`0` 已售（同时作为**库存锁**） |
| `orders.status` | `0` 待支付 · `1` 已支付 · `2` 已退款 · `3` 已取消 |
| `orders.delivery_status` | `pending` → `paid_waiting` → `provisioning` → `delivered` / `exception` / `refunded` / `cancelled` |
| `tickets.status` | `0` 待回复 · `1` 已回复 · `2` 已关闭 |
| `coupons.type` | `fixed` 固定金额 · `percent` 百分比 |
| `coupons.status` | `1` 启用 · `0` 停用 |
| `coupon_usages.status` | `0` 占用中（待支付） · `1` 已使用（已支付） |

> 系统会自动取消**超过 15 分钟未支付**的订单，并自动释放其优惠券占用。

---

## 13. 更新与升级

推荐流程：

1. 备份数据库；
2. 备份 `api/config.local.php`（如果使用它）；
3. 覆盖上传新版本源码；
4. 保留 `api/config.local.php` 不变；
5. 登录后台执行「数据库维护 → 更新数据库」。

> 若习惯"整站删掉后重传"，请务必先备份 `api/config.local.php`，上传完成后再放回。

### 静态资源缓存

前台与后台统一使用**固定版本号** `?v=YYYYMMDD` 给 CSS / JS 追加查询参数（当前 `?v=20261001`），
浏览器可正常强缓存，发布新版本时同步递增版本号即可立即刷新缓存（配合后台「缓存管理」的清空操作效果更佳）。

---

## 14. 已知问题

审计中已确认、但因改动面较大或需产品决策而**暂未处理**的遗留项，已全部记录于
[`CHANGELOG.md` → 四、已知问题与后续建议](CHANGELOG.md#四已知问题与后续建议)，主要集中于：

- `api/update_db.php` 的增量迁移回填与旧表收敛；
- 工单退款 / 创建的原子性；
- 邮件与 Webhook 通知的失败静默；
- 后台部分列表的分页缺失；
- 上传大小限制配置项未生效等。

---

## 15. 版本历史

| 版本 | 日期 | 摘要 |
|------|------|------|
| **v20261002** | 2026-10-02 | 全量代码审计与缺陷修复（原 `DEBUG_REPORT.md` 并入）；文档全面重构 |
| **v20261001** | 2026-10-01 | 工程结构全面拆分：CSS / JS / HTML / PHP 单体大文件按职责拆分，业务逻辑零改动 |
| **v20260926** | 2026-09-26 | 修复工单输入控件缺失 CSS 样式（发起新工单 + 后台退款审批） |
| **v20260828** | 2026-08-28 | 修复首次进入后台侧边栏全部高亮 |
| **v20260824** | 2026-08-24 | 工单回复界面 UI 重构（IM 气泡式对话布局） |
| **v20260823** | 2026-08-23 | 工单系统全面重构（共享模块 + 服务层） |
| **v20260822** | 2026-08-22 | 史诗级更新：前台 UI、头部导航、支付对齐《LD支付文档》、双主题适配等合并发布 |
| v20260821 及以前 | — | 共 19 个历史版本，见 [CHANGELOG.md → 历史版本摘要](CHANGELOG.md#三历史版本摘要) |

---

## License

MIT License（见 [`LICENSE`](LICENSE)）。
