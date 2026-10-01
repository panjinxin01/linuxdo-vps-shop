# VPS 积分商城 · 更新日志（CHANGELOG）

> **项目**：VPS 积分商城（Linux DO Credit）— 基于 PHP + MySQL 的轻量级 VPS 积分 / 信用兑换商城
> **当前版本**：**v20261002**（全量代码审计与缺陷修复归档；含 v20261001 工程结构拆分）
> **发布日期**：2026-10-02
> **相关文档**：功能特性、部署与配置说明见 `README.md`；开源许可见 `LICENSE`

---

## 关于本文件

本文件是项目的**唯一版本演进档案**，记录自 2025-06 起的全部发布。原 `DEBUG_REPORT.md`（全量 Debug 报告）已在本次重构中**整体并入**，不再单独维护。

| 章节 | 内容 |
|------|------|
| [变更类型图例](#变更类型图例) | 全文使用的标签含义 |
| [一、版本速览](#一版本速览) | 一张表纵览全部版本 |
| [二、详细更新记录](#二详细更新记录) | 各版本的完整变更明细（最新在上） |
| [三、历史版本摘要](#三历史版本摘要) | 2026-08-21 及以前版本的简略归档 |
| [四、已知问题与后续建议](#四已知问题与后续建议) | 审计发现但暂未处理的遗留项 |
| [五、维护约定](#五维护约定) | 下一次发布如何追加记录 |
| [六、版本号规则](#六版本号规则) | 版本号命名与归并说明 |

---

## 变更类型图例

| 标签 | 含义 | 标签 | 含义 |
|------|------|------|------|
| ✨ | 新功能 | 🛡️ | 安全加固 |
| 🐛 | 缺陷修复 | ⚙️ | 兼容 / 维护 |
| 🎨 | 界面 / 交互 | 🏗️ | 架构重构 |
| 💳 | 支付相关 | 🧹 | 代码清理 |
| 📦 | 发布整理 | 📄 | 文档 |

---

## 一、版本速览

| 版本号 | 发布日期 | 类型 | 摘要 |
|--------|----------|------|------|
| **v20261002** | 2026-10-02 | 🐛🛡️📄 | **全量代码审计与缺陷修复（原 Debug 报告并入）**：修复 8 项致命 / 高危 + 16 项中危 + 4 项前端一致性问题；文档（README / CHANGELOG）全面重构。详见 [v20261002](#v20261002--全量代码审计与缺陷修复原-debug_reportmd-并入) |
| **v20261001** | 2026-10-01 | 🏗️ | **工程结构全面拆分**：CSS / JS / HTML / PHP 单体大文件按职责拆为小文件，业务逻辑零改动。详见 [v20261001](#v20261001--工程结构全面拆分2026-10-01) |
| **v20260926** | 2026-09-26 | 🐛🎨 | 修复工单相关输入控件缺失 CSS 样式（发起新工单 + 后台退款审批）；资源版本号升至 `?v=20260926` |
| **v20260828** | 2026-08-28 | 🐛 | 修复首次进入后台侧边栏全部高亮的 bug（`classList.toggle` 三实参尾逗号兼容问题） |
| **v20260824** | 2026-08-24 | 🎨✨ | 工单回复界面 UI 全面重构（IM 气泡式对话布局 + 折叠面板 + 字数统计） |
| **v20260823** | 2026-08-23 | 🏗️🎨 | 工单系统全面重构：共享前端模块 + 共享样式 + 后端服务层，`api/tickets.php` 瘦身至 45 行 |
| **v20260822b** | 2026-08-22 | 🎨 | 登录回调页 UI 重构（成功 / 失败 / OAuth 未配置三态统一为毛玻璃卡片） |
| **v20260822** | 2026-08-22 | ✨📦 | **史诗级更新**：合并 2026-08-21 之后的全部变更（前台 UI、头部导航、支付系统对齐《LD支付文档》、双主题适配等） |
| 历史版本 | 2026-08-22（统一归并） | 多类型 | v20260821 及以前共 19 个版本，见 [历史版本摘要](#三历史版本摘要) |

> **说明**：v20260822 为一次合并发布，原 v20260402 / v20260404 / v20260405 / v20260823 / v20260824 / v20260825 等内部版本号的内容已全部并入。

---

## 二、详细更新记录

### v20261002 · 全量代码审计与缺陷修复（原 `DEBUG_REPORT.md` 并入）

> **归档说明**：该批次修复来源于一次全量静态代码审计（原 `DEBUG_REPORT.md`），原文未标注日期与版本号。
> 依据代码基线判断，修复发生在 v20260926 之后、v20261001 结构拆分之前；本次按归档日记录为 **v20261002**，并将原报告整体并入本文件。
> **审计方法**：审查 `api/`(29) + `includes/`(10) + `js/`(7) + `admin/`、`index.html`、`login.html`；审计环境无 PHP / Node 运行时，未做动态执行验证，全部结论基于跨文件静态比对（函数定义↔调用、SQL↔`schema.php`、JS 端点↔PHP action、JS 字段↔PHP 响应字段）。

#### A. 致命 / 高危修复（8 项）

**A1. 编辑商品会把已售机器重新上架 → 同一台 VPS 卖两次（超卖）** · `api/products.php`

- **现象 / 根因**：`products.status` 在本项目是**库存锁**（下单置 `0`、支付保持 `0`、取消才恢复 `1`），但 `productInput()` 给 `status` 设了缺省值 `1`，而后台 `js/admin.js` 的 `saveProduct()` **根本不提交 status 字段** → 管理员编辑一台已售 / 已被待支付订单锁定的机器后，它被静默改回"在售"，可被再次下单。
- **修复**：`status` 去掉缺省值；`edit` 未显式提交时保持原值；且从"已售"改回"在售"前先检查是否已有 `status=1` 订单，有则拒绝。

**A2. 普通管理员可重置整个数据库（越权）** · `api/update_db.php`

- **现象 / 根因**：入口只调 `checkAdmin($pdo)`，而 `reset` 分支会 `DROP TABLE` 全部业务表 → 任何普通管理员都能清空用户 / 订单 / 商品 / 工单。
- **修复**：按 action 区分权限 —— `checkAdmin($pdo, $action === 'reset')`，重置仅超级管理员可执行。

**A3. 外部支付订单永远无法部分退款** · `includes/commerce.php`

- **现象 / 根因**：外部渠道只支持**全额**退回，部分退款时 `externalRefundAmount=0`、金额全退回站内余额；但校验写的是 `refundToBalanceAmount > balancePaid`，而外部支付订单的 `balancePaid = 0` → `refundToBalanceAmount > 0` 必然成立，一律抛"退款金额超出已支付金额"。
- **修复**：校验基准改为实付总额 —— `refundToBalanceAmount + externalRefundAmount > totalPaid`。

**A4. 工单管理员内部备注泄露给普通用户** · `includes/TicketService.php`

- **现象 / 根因**：`listMine()` 是 `SELECT t.*`、`detail()` 返回整条工单记录，均未剔除 `internal_note`（schema 中明确定义为管理员内部备注）→ 工单所有者在响应里可直接看到。
- **修复**：新增 `stripInternalForUser()`，两个用户侧出口统一剔除。

**A5. 会话固定（登录不轮换 session id）** · `api/user.php`、`api/admin.php`、`api/oauth.php`

- **现象 / 根因**：三处登录成功分支都只赋值 `$_SESSION[...]`，登录前后 PHPSESSID 不变 → 攻击者可预置 session id 接管会话。
- **修复**：登录成功后调用 `session_regenerate_id(true)`。

**A6. 安装向导完全无 CSRF 防护** · `api/install.php` + `js/install.js`

- **现象 / 根因**：`install.php` 没有 `startSecureSession()`，`install.js` 的 `postApi()` 裸 `fetch` POST → `save_config` / `generate_key` / `run_install` 可被跨站触发（写入配置、建库建表）。
- **修复**：`install.php` 开启会话并对 4 个危险 action 验 CSRF（本文件不加载 `db.php`，故用 `verifyCsrfToken()` 自行校验而非 `requireCsrf()`）；`install.js` 先取 token 再提交。

**A7. 注册限流可被无限绕过** · `api/user.php`

- **现象 / 根因**：`rateLimit(..., 'user_register', $username, ...)` 把**攻击者可控的用户名**作为限流维度 → 每换一个用户名就是一条新记录，`hit_count` 永远是 1，永不封禁，可无限批量注册。
- **修复**：限流维度改为 IP。

**A8. 安装检测 `config_ok` 恒为 true，安装向导永不触发** · `api/check_install.php`

- **现象 / 根因**：用 `defined('DB_HOST')` 判断，但 `config.php` 总会用内置默认值把这些常量定义出来 → 未部署的全新站点也返回"已配置"，`admin/setup.html` / `admin/login.html` / `js/main.js` 的跳转分支失效。
- **修复**：改为检测 `config.local.php` 是否存在或是否提供了环境变量。

#### B. 中危修复（16 项）

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| B1 | `api/export.php` | **CSV 公式注入**：工单标题等用户可控内容直接 `fputcsv`，管理员打开导出文件即触发公式 / 外链 | 新增 `csvSanitizeCell()`，对 `= + - @` 开头且非数值的单元格加前导单引号 |
| B2 | `api/export.php` | 日期参数拼接出非法值：`isValidDateTime('2026-01-01 12:00:00')` 为真，再拼 `' 00:00:00'` → `2026-01-01 12:00:00 00:00:00` | 先用 `date('Y-m-d', strtotime())` 归一化，再补时间边界 |
| B3 | `api/coupons.php` | 验券用**商品原价**，下单用**信任等级折后价** → 门槛判断矛盾（预验证通过但下单被拒），前端应付金额与实际扣款不一致 | 预览接口同样先扣信任等级折扣，并新增 `base_amount` / `trust_discount_amount` 返回 |
| B4 | `includes/coupons.php` | `max_discount` 封顶只写在 `percent` 分支，固定额券的封顶值被完全忽略 | 移到类型分支外，两种券都生效 |
| B5 | `includes/coupons.php` | `markCouponUsedByOrder()` 返回 `execute()` —— 影响 0 行也返回 true，调用方误判核销成功 | 改用 `rowCount() > 0` |
| B6 | `api/products.php` | 公开商品列表只剔除 `ssh_password` / `ip_address` / `ssh_user`，`ssh_port` 与 `extra_info` 仍返回给匿名访客 | 补全剔除，并移到 `productEffectiveRow()` **之后**（否则会被模板字段回填） |
| B7 | `api/coupons.php` | `validate` 把 `max_uses` / `per_user_limit` / `used_count` / `starts_at` / `ends_at` 全回传，任意登录用户可枚举券池 | 只回传展示所需字段 |
| B8 | `includes/TicketService.php` | 管理员被删除后，其旧 session 仍能读全部工单 / 回复 / 关闭（`!empty($_SESSION['admin_id'])` 不与 DB 校验） | 新增 `currentAdminId()`，校验 `admins` 表存在性，失效则清理会话 |
| B9 | `includes/TicketService.php` | `assign()` 不校验工单是否存在，不存在的 id 也会写入孤儿 `ticket_events` 和审计日志 | 指派前先 `findTicket()` |
| B10 | `api/upload.php` | 目录前缀校验 `strpos($fullPath, $uploadRoot) === 0` 未带分隔符，会放行兄弟目录（如 `uploads_backup`） | 改为比对 `$uploadRoot . DIRECTORY_SEPARATOR` |
| B11 | `api/orders.php` | `batch_delete` 的 `type` 无法识别时落到 `status=0`（待支付）→ 参数拼错会误删**全部待支付订单** | 白名单校验，非法 type 直接报错 |
| B12 | `includes/db.php` | `checkAdmin()` 硬编码 `SELECT ... role FROM admins`，旧库缺 `role` 列时直接报错，导致**数据库升级脚本本身都无法进入** | 按 `information_schema` 判断列存在性动态拼 SQL |
| B13 | `api/credits.php` | `admin_transactions` 硬编码 `ct.operator_admin_id`，旧库直接 SQL 报错 | 加列存在性判断 |
| B14 | `api/community.php` | `save_settings` 忽略 `commerceSetSetting()` 返回值，写库失败也提示"已保存" | 失败时返回错误 |
| B15 | `api/dashboard.php` | `scalar()` 吞掉所有异常并返回默认值 → 缺表 / 权限 / SQL 错误显示成"收入 0 / 订单 0"的可信假数据 | 补 `logError()` |
| B16 | `api/announcements.php` | 标题先 `normalizeString(...,200)` 截断、再判断 `>200`，条件恒为假 → 超长标题静默截断 | 先取原始值校验长度，再截断（新增与编辑两处） |

#### C. 前端一致性修复（4 项）

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| C1 | `js/admin.js` | 初始化调用 `loadCreditTransactionList()` 不带 `user_id`，后端强制要求该参数 → 每次进后台都必失败一次，且失败被伪装成"暂无流水" | 初始化改渲染占位提示，无 `user_id` 时不再发请求 |
| C2 | `js/main.js` | "有效实例"数量直接用 `orderPagination.total`（**订单总数**，含待支付 / 已取消 / 已退款） | 改用真实有效实例数 |
| C3 | `js/main.js` | 实例列表取自订单列表的**当前分页页**（每页 5 条），订单超过一页后其余实例全部消失 | 新增 `loadPaidInstances()` 单独取完整列表（`cachedPaidOrderList`）供实例视图与统计使用 |
| C4 | `js/main.js` | "即将过期"统计读 `o.expire_at`，但后端退保策略输出的字段是 `service_end_at` → 恒为 0 | 改为读 `service_end_at`（保留 `expire_at` 兜底） |

#### D. 审计结论：确认无问题的部分（避免误报）

- **SQL 注入**：全项目用户输入均走 `prepare/execute` 或 `bindValue`；拼接进 SQL 的只有硬编码列名，或经 `commerceColumnExists` / `commerceTableExists` 过滤的常量。
- **Ed25519 PKCS#8 / SPKI DER 编码**（`includes/ldcpay.php`）：手写的长度字节 `0x2e` / `0x2a` / `0x22` / `0x21` 与实际内容长度逐字节核对一致，构造正确。
- **`api/settings.php`**：所有 handler 均 `checkAdmin()`；`epay_key`、`ldcpay_client_secret`、`ldcpay_private_key`、`ai_api_key`、`smtp_pass` 均以 `********` 返回。
- **工单越权（IDOR）**：`detail()` / `reply()` / `close()` 对普通用户确实校验了 `user_id` 归属。
- **`api/export.php` 鉴权**：入口有管理员校验，导出字段不含 SSH 凭据与 `delivery_info`。
- **CSRF 覆盖**：除安装向导（已修）外，所有写操作均在 `$csrfActions` 白名单内，`js/common.js` 的 `apiFetch()` 会自动附加 `X-CSRF-Token`。

#### E. 文档整理（本次）

- `README.md` 全面重构：重写简介、功能一览、部署与配置、目录结构（对齐 v20261001 拆分后的真实结构）、安全说明与版本历史。
- `CHANGELOG.md` 全面重构：新增目录导航、变更图例、已知问题章节；原 `DEBUG_REPORT.md` 内容按「致命 / 高危 · 中危 · 前端一致性 · 审计结论 · 遗留建议」重组并入，文件不再单独保留。

> 审计中发现但本次**未修改**的问题，已统一整理至 [四、已知问题与后续建议](#四已知问题与后续建议)。

---

### v20261001 · 工程结构全面拆分（2026-10-01）

**本次为纯结构性重构，无任何业务逻辑改动。** 目标是把动辄上千行的单体文件按职责拆成可维护的小文件。

#### A. 拆分方式（两种，均保持原有调用路径不变）

| 类型 | 做法 | 说明 |
|------|------|------|
| CSS / PHP | **聚合入口**：`css/style.css`、`css/admin.css`、`css/tickets.css` 改为 `@import` 转发；`includes/db.php`、`includes/security.php`、`includes/commerce.php`、`includes/schema.php`、`includes/ldcpay.php` 改为 `require_once` 转发 | 子文件引入顺序与拆分前行序完全一致，层叠优先级 / 加载顺序零变化 |
| HTML | **片段注入**：页面骨架放 `<div data-partial="...">`，由 `js/core/partials.js` 在所有占位符之后、业务脚本之前**同步**注入 | DOM 顺序与内联时一致，全部业务 JS 零改动 |

#### B. 拆分前后对照（行数）

| 原文件 | 拆前 | 拆后 | 归属目录 |
|--------|------|------|----------|
| `admin/index.html` | 1996 | 162 | `partials/admin/{layout,tabs,modals}/` 共 21 个片段 |
| `index.html` | 597 | 256 | `partials/front/{pages,modals}/` 共 18 个片段 |
| `login.html` | 647 | 149 | 内联 CSS→`css/pages/login.css`，JS→`js/front/login.js` |
| `admin/setup.html` | 273 | 89 | `js/install/setup.js` |
| `admin/maintenance.html` | 411 | 80 | `css/backend/maintenance.css` + `js/install/maintenance.js` |
| `css/style.css` | 2932 | 37 | `css/{base,layout,components,pages,utilities}/` 共 34 个（含 `pages/home/` 9 个） |
| `css/admin.css` | 1557 | 26 | `css/backend/` 共 20 个 |
| `css/tickets.css` | 1670 | 29 | `css/ticket/` 共 24 个 |
| `js/admin.js` | 868 | — | `js/admin/` 共 15 个（最大 182 行） |
| `js/main.js` | 749 | — | `js/front/` 共 15 个（最大 138 行，含 `notifications/` 5 个） |
| `js/tickets.js` | 1610 | — | `js/ticket/` 共 13 个（最大 196 行） |
| `includes/commerce.php` | 603 | 34 | `includes/Commerce/` 共 12 个 |
| `includes/ldcpay.php` | 609 | 28 | `includes/Ldcpay/` 共 10 个 |
| `includes/security.php` | 327 | 26 | `includes/Security/` 共 7 个 |
| `includes/schema.php` | 421 | 8 | `includes/Schema/` 共 2 个 |
| `includes/db.php` | 224 | 21 | `includes/Db/` 共 5 个 |

未动的文件：`includes/TicketService.php`、`includes/AppConfig.php`、`includes/coupons.php`、`includes/notifications.php`、`includes/cache.php`
（本身已是单一职责、行数可控），`api/*.php` 保持现状（HTTP 流程型入口，强行切分得不偿失）。

#### C. 注意事项

- 新增 `partials/` 目录与 `js/core/partials.js`，页面必须经 HTTP 访问（原本即需 PHP 环境，`file://` 直开不支持片段）。
- 片段文件内**不要**写 `<script>`（`innerHTML` 注入不会执行），页面脚本请放 `js/` 下。
- 全站静态资源版本号统一提升至 `?v=20261001`。
- 原文件已备份到 `.backup/<时间戳>/`。

---

### v20260926 · 修复工单相关输入控件缺失 CSS 样式（2026-09-26）

- **问题现象**：「我的工单 → 发起新工单」页的问题描述输入框（`#tkNewContent`）显示为浏览器默认外观——等宽字体、0 内边距、裸灰边框。
- **根因**：`css/tickets.css` 中 `.tk-compose-stack textarea` 规则自工单页面化重构（v20260825）起仅有 `border-top-left-radius: 0; border-top-right-radius: 0;` 两行"圆角修正"，从未定义边框 / 背景 / 内边距 / 字体等基础样式；且该 `textarea` 不在 `.form-group` / `.modal` 作用域内，未命中任何现有输入框样式，最终回退到浏览器 UA 默认样式。
- **修复**：补全完整样式——背景 `--bg-input`、`1px` 边框（顶边与 `.tk-toolbar` 衔接）、`12px 14px` 内边距、`font-family: inherit`、底部 `--radius-md` 圆角；新增 `:focus` 聚焦光环、弱化 `::placeholder`、`.tk-compose-stack:focus-within .tk-toolbar` 联动高亮。工具条与输入框 0 缝隙拼接，构成完整"编辑器"外框。
- **同批次修复（后台「退款审批」）**：`.refund-admin-card` 的下拉框与备注输入框此前同样仅有 `width:100%`，已按后台 `.form-group` 输入框参数补全（边框 / 背景 / 内边距 / 字号 / 聚焦光环 / 下拉指针 / 可纵向拉伸）。
- **缓存**：`index.html` / `admin/index.html` 中 `tickets.css` 版本号由 `?v=20260825` 升级为 `?v=20260926`。
- **说明**：纯样式修复，不改动任何 JS 逻辑与后端接口；浅色 / 深色双主题自动适配。

---

### v20260828 · 修复首次进入后台侧边栏全部高亮（2026-08-28）

- **问题现象**：首次进入后台，侧边栏所有导航项同时处于高亮（`.active`）状态。
- **根因**：`js/ui.js` 的 `switchPage()` 中 `classList.toggle("active", cond,)` 的**三实参尾逗号**写法，在部分移动端内核（实测 Chromium 120 / X5 WebView）下 `force=undefined` 被误判为真，导致不匹配的导航项也被强制加上 `active`。
- **修复**：改用显式 `add` / `remove` 重写激活态切换，任何引擎行为一致；同步升级 `ui.js` 缓存版本号。

---

### v20260824 · 工单回复界面 UI 全面重构（IM 气泡式对话布局）（2026-08-24）

在 v20260823 共享模块架构基础上，对工单**回复对话流与工单列表页**进行视觉与交互的全面重构。**API、全局函数签名、表单控件 id 100% 向后兼容，notifications.js / orders.js / ui.js / admin.js 零改动。**

#### A. IM 聊天气泡对话流（核心变更）

- **回复流重构为即时通讯布局**（前台「我的工单」详情弹窗 + 后台工单管理详情弹窗共用）：
  - 客服消息靠右：品牌色（`--primary`）气泡白字 + 渐变底客服头像（耳机图标）+「客服」角色标签
  - 用户消息靠左：卡片色气泡描边样式 + 素色用户头像
  - 每条消息结构：头像 → 角色名 / 角色标签 → 气泡正文 → 相对时间（`title` 显示完整时间）
  - 深色模式下客服气泡自动切换为深色文字保证对比度；气泡圆角含指向性小角（靠近头像侧）
- **加载骨架屏同步升级**：模拟头像 + 左右气泡交错布局，消除加载时跳动

#### B. 折叠面板

- **处理时间线默认收起**：以折叠面板呈现（标题带事件数徽标 + chevron 旋转动画），点击展开 / 收起，降低视觉噪音
- **附件面板有附件时默认展开**：网格布局保留图片缩略图 / 文件卡片两种形态，计数徽标显示附件数量
- 完整键盘可达：面板头为原生 `button`，支持 `aria-expanded` / `aria-controls` / `hidden` 属性联动

#### C. 回复输入区交互增强

- **字数统计**：输入框右下角实时显示 `n/1000`，达 85% 变黄色警示、达上限变红色加粗，`textarea` 增加 `maxlength` 硬限制
- **发送 loading 态**：前台 / 后台发送按钮点击后进入 spinner +「发送中...」禁用态，完成后恢复；附件上传按钮同样接入
- **自动滚动到最新消息**：打开详情与回复成功后，对话流自动滚动到底部（替代原先回到顶部）
- 快捷键提示升级为 `<kbd>` 键帽样式（Ctrl + Enter 发送，移动端隐藏）；回复成功后输入框清空并重置字数统计

#### D. 工单列表页统一重构

- **前台「我的工单」**：
  - 统计概览 chips 升级为**可点击筛选按钮组**（全部 / 待回复 / 已回复 / 已关闭，本地过滤无需请求，`aria-pressed` 状态同步）
  - 列表卡片新增**状态顶边条**（待回复橙 / 已回复绿 / 已关闭灰），hover 时顶边条从 32% 展开至全宽
  - 状态徽章增加同色圆点（色彩不是唯一指示，符合无障碍规范）；空状态插画化（信封 + 对话气泡 SVG 插画，随主题着色）
- **后台工单管理**：
  - 状态筛选由下拉框升级为**分段按钮组**，与原隐藏 `select` 双向同步保持兼容
  - 表格空态插画化；表格行优先级 / 分类信息改为 flex 对齐
- 前后台筛选 / 分类 / 优先级 / 关键词逻辑不变

#### E. 可访问性与细节

- 键盘可达性：列表卡片 `focus-visible` 焦点环、折叠面板头焦点态、概览 chips 与分段按钮 `aria-pressed`、上传 / 发送按钮 `aria-label`、`textarea aria-label`
- 弹窗容器优化：前台详情弹窗加宽至 640px、后台加宽至 680px 并改用 `modal-scroll` 统一滚动高度；关闭按钮补齐 `aria-label`
- 动效尊重 `prefers-reduced-motion`；触控目标 ≥ 44px（折叠面板头 / 分段按钮 / 概览 chips）

#### F. 兼容性说明

- `css/tickets.css` 版本号升级为 `?v=20260824`（前后台引用同步更新），旧版 `.ticket-reply` 类名保留兜底样式防止缓存 DOM 裸奔
- 新增函数：`tkToggleCollapse` / `tkUpdateComposerCount` / `tkSetSending` / `tkScrollConversationToEnd` / `filterMyTickets` / `setAdminTicketStatusFilter` 等
- 移除渲染函数：`ticket-replies-title` 区块（合并入折叠面板体系）、旧版 `renderTicketReplies` 卡片结构（被 IM 气泡取代）

---

### v20260823 · 工单系统全面重构（前后端 + 共享模块）（2026-08-23）

针对工单模块"前后台逻辑重复、单行模板串拼接 HTML、内联样式泛滥、两套 CSS 各自为政"的技术债进行架构级重构，并补齐后端早已支持但前端缺失的实用功能。**API 响应结构与全局函数名 100% 向后兼容，notifications.js / orders.js / ui.js 零改动。**

#### A. 架构重构

- **新增 `js/tickets.js`（共享前端模块，前台 + 后台通用）**：
  - 常量映射单一数据源：`TICKET_STATUS` / `TICKET_PRIORITY` / `TICKET_CATEGORIES`（与后端 `commerceGetTicketCategories()` 对齐），提供 `ticketStatusLabel()` 等取值函数，消灭两侧散落的 pMap / catMap / 三元表达式
  - 集中图标库 `ticketIcon(name)`：时钟 / 优先级 / 附件 / 发送等 SVG 统一管理，消除几十处重复内联 SVG
  - API 封装 `TicketApi`：my / detail / reply / close / create / all / stats / templates / approveRefund / uploadAttachment / listAttachments，统一错误处理；按页面路径自动识别前台 / 后台 API 基路径
  - 纯渲染函数：`renderTicketCard`（列表卡）/ `renderTicketRow`（后台表格行）/ `renderTicketHeader`（详情头部）/ `renderTicketReplies`（对话气泡，客服带角色标签）/ `renderTicketTimeline`（时间线）/ `renderTicketAttachments`（附件网格）/ `renderReplyComposer`（回复输入区）
  - 用户侧控制器：`loadMyTickets`（含状态统计概览条 + 空态引导创建）/ `showCreateTicket` / `submitTicket` / `showTicketDetail` / `replyTicket`（回复后局部刷新对话流）/ `closeTicket` / 附件上传
  - 管理侧控制器：`loadTickets`（支持筛选参数）/ `applyTicketFilters` / `resetTicketFilters` / `loadTicketStats` / `showAdminTicketDetail`（退款工单自动渲染审批卡片）/ `adminReplyTicket` / `adminCloseTicket` / `approveRefundTicket`
- **新增 `css/tickets.css`（共享样式，约 840 行）**：由 `style.css` 与 `admin.css` 中两套 `.ticket-*` 规则迁移合并去重，全部改用 `variables.css` 设计令牌（深浅双主题自适应）；新增优先级色点 `.tk-priority`、页头统计概览条 `.tk-overview`、后台筛选栏 `.tk-filter-bar`、骨架屏 `.tk-skeleton*`、空 / 错误态 `.tk-state`、快捷模板 chips `.tk-template-chip`、回复入场动画；移动端响应式与 `prefers-reduced-motion` 支持
- **后端拆分 `includes/TicketService.php`（服务层）**：`api/tickets.php` 的 12 个 action 全部业务逻辑迁入静态类方法（create / createRefundRequest / listMine / detail / reply / close / listAll / stats / adminList / assign / approveRefund / templates），内部私有辅助 `findTicket` / `resolveActor` / `orderBelongsToUser` / `adminExists` 复用 `commerceRecordTicketEvent` / `createNotification` / `logAudit` / `commerceRefundOrder` 等现有函数，不重复实现
- **`api/tickets.php` 瘦身重写（378 行 → 45 行）**：仅保留会话启动、依赖加载、CSRF 白名单、`switch` 分发与全局异常兜底
- **旧代码清理**：`js/main.js` 删除用户侧工单模块（176 行）；`js/admin.js` 删除管理侧工单模块（177 行）；`css/style.css` 删除工单段落（268 行）；`css/admin.css` 删除工单 + 退款审批段落（298 行），合计瘦身约 919 行重复代码

#### B. 新功能

- **后台工单筛选栏**：状态下拉 / 分类下拉 / 优先级下拉 / 关键词搜索框（回车触发）/ 一键重置——对接 `action=all` 既有筛选能力，此前前端完全未暴露
- **快捷回复模板**：打开后台工单详情时懒加载 `action=templates` 接口，回复框上方出现模板 chips，点击填入 `textarea`；接口不存在或为空时静默降级无感知
- **加载骨架屏**：工单列表与详情弹窗加载中显示 shimmer 动画骨架，替代空白
- **可重试错误态**：请求失败显示错误图标 + 重试按钮，替代静默失败
- **相对时间显示**：列表卡片与回复气泡统一走 `formatRelativeTime()`（悬浮 `title` 显示完整时间）

#### C. 界面 / 交互优化

- 全部 `alert()` 提示替换为项目统一的 `showToast()`；危险操作保留原生 `confirm` 二次确认
- 工单卡片增加悬停左侧渐变指示条与键盘焦点态（`tabindex` + Enter 触发）
- 回复气泡区分客服 / 用户配色，客服回复带「客服」角色徽标
- 回复输入区支持 Ctrl / Cmd + Enter 快捷发送（底部提示）
- 「我的工单」页头部新增状态统计概览条（待回复 / 已回复 / 已关闭 / 全部计数着色胶囊）
- 后台表格行内直接展示分类中文与优先级色点（原为原始 `category` 键名）

#### D. 缺陷修复

- **重复提交防护**：提交工单 / 回复 / 审批退款增加 `submitting` / `refunding` 标志位防抖
- **模板填入目标修复**：快捷回复 chips 点击后自动探测当前侧（前台 `replyContent` / 后台 `adminReplyContent`）`textarea` 填入
- **订单详情弹窗复用工单弹窗容器的兼容保障**：`closeAdminTicketDetail` 等容器函数迁移至共享模块，订单交付状态编辑功能不受影响

#### E. 文档与资源版本

- 前台 `index.html` 与后台 `admin/index.html` 引入新资源并将全部 CSS / JS 版本号升级为 `?v=20260823`
- `README.md` 目录结构与版本号同步更新

#### F. 验证

- 全部 JS 文件 `node --check` 通过（Node 24）；改动 PHP 文件 `php -l` 通过
- `style.css` / `admin.css` / `tickets.css` 大括号平衡校验通过；两份旧 CSS 的 diff 确认仅为预期删除块，无误伤
- `admin/index.html` 与 `index.html` `div` 开闭标签平衡校验通过
- 跨模块引用完整性检查：`main.js` / `admin.js` / `notifications.js` / `orders.js` / `ui.js` 中全部工单函数调用在 `js/tickets.js` 中均有对应定义

---

### v20260822b · 登录回调页 UI 重构（2026-08-22）

重构 Linux DO OAuth 登录回调相关页面（登录成功 / 登录失败 / OAuth 未配置）的视觉与交互，统一为自包含的现代化设计。**纯展示层变更，授权流程、会话处理与业务逻辑零改动。**

#### A. 界面重构

- **`api/oauth.php` · 共享外壳**：新增 `renderOAuthPage()` 页面构建器，三态页面共用同一套内联样式——深靛夜空基底 + 多个缓慢漂移的模糊光晕背景、毛玻璃卡片（`backdrop-filter` + 细边框高光）、零外部依赖、移动端自适应（≤480px 按钮 / 卡片重排）、尊重 `prefers-reduced-motion` 关闭动画
- **登录成功页（`outputSuccess`）**：🎉 emoji 替换为绿色描边动画对勾 SVG（`stroke-dashoffset` 描画动画）；新增品牌渐变高亮的用户名胶囊徽章与呼吸点「正在跳转…」提示；跳转行为不变（仍为 1.5 秒后自动返回 `../index.html`）
- **登录失败页（`outputError`）**：😥 emoji 替换为珊瑚红警示 SVG；新增「错误详情」面板（长文本自动换行防溢出）；按钮由裸链接升级为统一胶囊样式（品牌渐变「重新登录」+ 幽灵「返回首页」）

#### B. 缺陷修复

- **OAuth 未配置提示**：`action=login` 在 Client ID / 回调地址未配置时原直接 `exit('OAuth2配置未完成，请联系管理员')` 输出纯文本，现替换为同风格完整 HTML 提示页 `outputNotConfigured()`（琥珀色盾牌图标 + 可能原因说明 + 返回首页按钮），并补齐 `Content-Type: text/html; charset=utf-8` 响应头

#### C. 验证

- 全部改动 PHP 文件 `php -l` 通过（PHP 8.3）；成功 / 失败 / 未配置三页渲染冒烟测试通过
- XSS 转义验证：恶意用户名与错误信息注入均被正确转义；HTML 结构完整（style / html 标签闭合、CSS 括号平衡）

---

### v20260822 · 史诗级更新（合并 2026-08-21 之后全部变更）（2026-08-22）

完成自 2026-08-21 以来所有累积变更的**合并发布**，涵盖：前台 UI 全面重构、前台 / 后台头部导航重构、支付系统对齐《LD支付文档》、后台深浅模式适配、数据库维护交互优化、缓存策略调整，以及更新日志整体重构与文档同步。

#### A. 前台 UI 全面重构（原 v20260402）

前台 UI 全面重构，设计语言与后台 `admin.css` 统一（深色质感侧边栏 · 玻璃拟态弹窗 · 渐变主按钮）。**纯前端变更，API 契约与业务逻辑零改动。**

- **`css/style.css`（全量重写，2123 行 → 约 2965 行）**
  - 修复旧版多处损坏的 CSS 规则（`.header-inner` 内嵌套错乱、`.gap: 16px` 无效属性、选择器 / 大括号配对错误等）
  - 侧边栏改为恒定深色渐变质感（双主题一致），新增折叠按钮、激活项左侧渐变指示条
  - 弹窗升级为玻璃拟态遮罩 + 弹性入场动画，头部 / 底部吸附滚动
  - 主按钮统一品牌渐变 + 悬浮投影；卡片、徽章、规格块、工单、通知、分页等组件全面翻新
  - 新增：骨架屏、按钮 loading 态、页面切换入场动画、`prefers-reduced-motion` 支持
  - 新增顶栏用户下拉菜单 / 侧边栏用户卡片样式；补齐重构版 HTML 所需组件类
  - 响应式断点重排（1024 / 768 / 480），移动端体验优化
- **`index.html`（结构语义化重构）**
  - `<head>` 防主题闪烁内联脚本（默认深色）；Google Fonts 改为异步加载不阻塞渲染
  - 移除全部内联 `onclick` 导航，改用 `data-page` + Hash 路由锚点
  - 「我的订单」页升级为「我的账户」页（余额卡 + 流水卡栅格布局）
  - 首页公告区增加标题头；弹窗补充 `aria-label` / `autocomplete`
- **`js/ui.js`（功能增强）**
  - 新增 **Hash 路由**：`#buy`、`#orders` 等，刷新 / 前进后退保持当前页面，程序化切换同步地址栏
  - 抽离 `refreshPageData()` 页面级数据刷新（修复旧版仅 notifications 分支才刷新列表的逻辑缺陷）
  - 新增 ESC 一键关闭全部弹窗 / 抽屉；滚动监听改 passive 提升性能
- **`js/main.js`（局部升级）**：顶栏用户区域改为头像胶囊 + 下拉菜单；侧边栏底部用户信息卡片化；余额展示支持局部刷新
- **`css/variables.css`**：追加补充令牌（`--font-mono`、`--sidebar-w`、`--ease-spring`、`--shadow-primary` 等），向后兼容

#### B. 前台头部导航重构（原 v20260404）

前台顶栏结构、样式与交互重构：语义化三区布局 + 可点击面包屑 + 统一幽灵图标按钮。**纯前端变更，JS 契约（元素 ID 与全局函数）零改动。**

- **`index.html`（头部结构）**：头部改为语义化三区布局（左区：移动端菜单 + 面包屑 / 右区：主题切换 · 通知 · 用户）；「控制台 / 当前页」升级为真实 `<nav>` 面包屑，根节点可点击返回首页，当前页带 `aria-current="page"`；主题 / 通知按钮统一为 `.icon-btn`，补充 `type="button"`、`aria-controls`、`aria-haspopup` 等可访问性属性
- **`css/style.css`（头部样式重写）**：新增 `.header-left` / `.breadcrumb` / `.crumb` / `.crumb-sep` / `.icon-btn` 样式族；头部内容与页面容器对齐（`max-width: 1200px` 居中）；滚动后背景加深 + 投影；面包屑支持单层模式；图标按钮统一悬停 / 按压 / 键盘焦点反馈；移动端（≤768px）仅显示当前页标题、按钮缩至 38px
- **`js/ui.js`（面包屑联动）**：`switchPage()` 同步面包屑状态，主页切换单层模式
- **后续微调（同日）**：面包屑改为可横向滑动（隐藏滚动条 + 触摸平滑滚动 + `overscroll-behavior` 防滚动穿透）；未登录按钮文案「登录 / 注册」简化为「登录」；修正面包屑根节点与分隔符间距不对称（改用分隔符右侧补偿，弃用负外边距）；收紧面包屑间距（gap 6→4、内边距 6→4、分隔符补偿 6→4）

#### C. 后台头部导航同步前台样式（原 v20260405）

后台顶栏结构、样式与交互对齐前台重构版：毛玻璃 sticky 头部 + 幽灵图标按钮 + 头像胶囊下拉。**纯前端变更，业务逻辑零改动。**

- **`admin/index.html`（头部结构）**：头部改为与前台一致的三区布局；面包屑升级为 `<nav>` 结构（根节点「后台管理」可点击返回仪表盘）；主题 / 刷新 / 工单按钮统一为 `.icon-btn`；用户区域改为头像胶囊（`.user-menu-btn`）+ 下拉菜单（系统设置 / 退出登录）；移除固定悬浮汉堡按钮 `.menu-toggle`；内联脚本新增用户菜单箭头旋转同步、内容区滚动监听头部投影
- **`css/admin.css`（头部样式重写）**：`.top-header` 对齐前台 `.header`（毛玻璃背景 + 双主题适配 + 滚动加深投影）；新增 `.menu-btn` / `.breadcrumb` / `.crumb*` / `.icon-btn` / `.user-area-wrap` / `.user-menu-btn` / `.user-dropdown-divider` 样式族，移除旧 `.header-btn` / `.header-right` / `.user-avatar` 等系列；用户下拉菜单改为透明度 + 位移过渡，退出登录增加 danger 红色态；响应式（≤768px）适配
- **`js/admin.js`（兼容修复）**：点击外部关闭用户菜单的选择器由 `.user-dropdown`（已移除）改为 `#userMenuBtn`，并同步移除箭头 `open` 状态

#### D. 支付系统重构：对齐《LD支付文档》（原 v20260823）

依据《LD登录文档》与《LD支付文档》全面核对支付 / 登录链路，修复不符项并重构支付代码。

- **致命修复**
  - `api/notify.php` 语法错误：原文件第 85-87 行存在多余的 `}`，导致 `else` 分支解析失败——所有支付回调均会 fatal error，平台将无限重试回调
  - 回调验签与文档不符：文档 3.3 明确异步通知 `type` 固定 `epay`、`sign` 按 MD5 签名算法（pid + key）生成；原代码却按 `type=ldcpay` 走 Ed25519 公钥验签（该分支永远无法通过）。现已统一为 MD5 验签
- **支付 SDK 重构（`includes/ldcpay.php`）**
  - 统一网关常量 `LDCPAY_GATEWAY` 及各端点定义；凭证统一化 `ldcpay_get_credentials()`（pid = Client ID / key = Client Secret 双协议共用，LDC 配置缺失时回退 `epay_pid` / `epay_key`）
  - 官方接口签名（文档 1.3.1）：非空参数 ASCII 升序 + Client Secret 直接拼接 → Ed25519 → Base64；易支付签名（文档 2.4.2）：排除 `sign` / `sign_type` 的非空字段 ASCII 升序 + key → MD5 小写；均已用文档示例向量验证
  - 补齐此前被当作死代码删除的平台接口：订单查询（3.1）、商户分发（3.4，Basic Auth）、用户余额统计（3.5）
  - 工具函数：金额两位小数格式化、商品名 64 字符截断、URL 100 字符截断（`notify_url` / `return_url` 参与签名）
- **支付发起重构（`api/pay.php`）**：商品名改用下单快照 `product_name_snapshot`（商品删除后仍可正常发起支付）；易支付金额统一两位小数；回调地址按文档限制截断至 100 字符；协议自动选择逻辑收敛到 SDK，移除页面内重复的 MD5 签名实现
- **异步回调重构（`api/notify.php`）**：按文档 3.3 校验 `sign_type=MD5`、`type=epay`、`trade_status=TRADE_SUCCESS`；新增回调 `pid` 与商户配置一致性校验（防跨商户伪造通知）；新增幂等点 A（`payment_requests` 外部请求号状态行锁检查，同一请求号只入账一次）；恢复"重复回调交易号一致性检查"（防单号复用攻击）；移除无效的 `notify_id` 幂等逻辑；站内通知改为事务提交后发送
- **退款合规修复（`includes/commerce.php`）**：文档 3.2 平台仅支持全额退回（money 必须等于原金额）；可退金额不足以覆盖外部支付部分时自动转为全额退回站内余额；消除退款双实现，统一走 `epay_refund()`
- **新增管理员接口（`api/ldcpay.php`）**：`action=query` 订单查询 / `action=distribute` 商户积分分发（自动同步站内余额流水）/ `action=balance_stats` 平台余额统计；全部仅限管理员，写操作带 CSRF 校验并记录审计日志
- **登录核对结论（《LD登录文档》）**：`api/oauth.php` 授权流程、`scope=user`、`state` 防 CSRF、Bearer 取用户信息均与文档一致，未做改动
- **前端文案**："EasyPay 支付"→"积分支付"，支付方式显示"Linux DO Credit"；后台报表"EasyPay 订单"→"外部支付订单"

#### E. 后台主题适配 + 数据库维护优化 + 缓存策略调整（原 v20260824）

- **后台头部导航 / 侧边栏深浅模式适配**
  - `css/admin.css` 侧边栏双主题化：`.sidebar` 由写死深色渐变改为 `var(--bg-sidebar)`，边框 / 标题 / 菜单文字 / 悬停态 / 分组标题 / 页脚全部改用主题变量——浅色模式下侧边栏不再"黑一块"
  - Toast 双主题化：`.toast` 背景由写死 `#101a33` 改为 `var(--bg-card)` + `var(--text-main)` + `var(--border)`
  - 后台 4 个页面（`admin/index.html`、`login.html`、`maintenance.html`、`setup.html`）主题初始化逻辑与前台统一：默认深色，仅当 `localStorage.theme === 'light'` 时切浅色
  - 头部导航组件（`.top-header`、`.menu-btn`、`.breadcrumb`、`.icon-btn`、`.user-menu`、`.badge-dot` 等）核查确认走 CSS 变量，双主题正常
- **静态资源缓存破坏改为固定版本号**：移除后台 4 个页面的 `Date.now()` 自动缓存破坏，统一改为固定版本号 `?v=YYYYMMDD`；此后浏览器可强缓存 CSS / JS，后台「缓存管理」的清空操作重新有意义
- **数据库维护文案与交互优化（`admin/maintenance.html`）**：更新数据库改为"先检查、再确认、后执行"三段式——结构已完整直接提示无需更新、有缺失先弹窗列出新建表和补齐字段清单确认后才执行、执行后明确展示新增数据表 / 字段明细
- **接口文案中文化**：`api/audit_logs.php`「Unknown action」→「未知操作」；`includes/security.php`「CSRF token invalid」→「安全验证失败（CSRF Token 无效或已过期），请刷新页面后重试」

#### F. 后台面包屑中文标题修复（原 v20260825）

- **`js/admin.js` `tabTitles` 映射表补全**：原表缺少 `templates`（商品模板）、`credits`（积分管理）、`community`（社区规则）、`reports`（统计报表）4 个页面的中文标题，导致点击侧边栏对应菜单后，头部导航面包屑直接显示原始 tab 标识符而非中文。现已全部补齐，与侧边栏菜单文案一一对应

#### G. 前台侧边栏双主题适配（v20260822）

- **`css/style.css` 前台侧边栏双主题化**：`.sidebar` 由"恒定深色"改为跟随深浅主题自动切换，与后台 `admin.css` v20260824 的做法对齐
  - 移除 `.sidebar` 内部写死的深色局部变量（`--text-main` / `--text-light` / `--text-muted` / `--primary` / `--border` / `--bg-hover` 等）与 `linear-gradient(180deg, #101a33, #0b1226)` 恒定深色背景，改为继承全局主题令牌：浅色模式侧边栏为 `var(--bg-sidebar)` 白色卡片，深色模式通过 `.dark .sidebar` 保留原深色渐变质感（深色模式视觉零回归）
  - Logo、折叠按钮、分组标题、导航项（普通 / 悬停 / 激活）、页脚分隔线、底部用户卡片（`.sidebar-user-card` 名称 / 副标题）全部改用主题变量
  - 主题切换由现有 `toggleTheme()`（`<html>` 上切换 `.dark` 类）驱动，无需改动 JS

#### H. 全面整理：文档同步 + 残留清理 + 更新日志重构

- **更新日志全面重构（本次）**：`CHANGELOG.md` 整体重写，新增「关于本文件 / 变更类型图例 / 版本速览 / 维护约定 / 版本号规则」章节；2026-08-21 及以前的历史条目全部简略化；原文件备份至 `.backup/CHANGELOG.before-rebuild-20260822.md`
- **`README.md` 文档同步**：版本号同步至 v20260822；功能一览补充 LDC Pay 平台管理接口、AI 智能生成、商品模板自动填充、双主题与响应式、数据库维护三段式等新能力；目录结构修正；静态资源缓存说明重写为固定版本号策略；新增「版本历史」小节
- **残留清理（`api/update_db.php`）**：`$csrfActions` 移除已删除但残留的 `migrate_admin_role`（死配置）；数据库「检查状态 / 更新数据库」返回的 `build` 版本号由过时的 `20260315i` 更新为 `20260822`
- **前端修正（`js/admin.js`）**：`migrateLinuxDOFields()` 成功提示原读取不存在的 `data.data.added` 字段，修正为按实际返回字段（`created` / `migrated`）统计并展示新增内容
- **静态资源版本号统一**：前台 `index.html`、后台 `admin/index.html`、`login.html` / `maintenance.html` / `setup.html` / `install.html` 全部资源统一为 `?v=20260822`

#### I. 验证

- 全部改动 PHP 文件 `php -l` 通过（PHP 8.3）；全部 JS 文件 `node --check` 通过（Node 24）
- MD5 / Ed25519 签名算法单元测试 12 项全部通过（含文档原始示例向量）；Ed25519 密钥格式兼容（Base64 seed / Hex seed）、sodium / OpenSSL 双路径交叉验证
- 前台 / 后台所有页面资源引用均指向实际存在的文件
- 安装向导、管理员恢复模式保护、CSRF、限流、支付验签（MD5）、防超卖、优惠券占用 / 核销、余额流水、审计日志均实测正常

---

## 三、历史版本摘要

> 以下为 **2026-08-21 及以前**的版本记录（均已简略化，一行一条）。
> 按整理要求，历史条目的发布日期统一归并为发布日 **2026-08-22**；详细变更内容已归档于 `.backup/CHANGELOG.before-rebuild-20260822.md`。

| 发布日期 | 版本号 | 类型 | 摘要 |
|----------|--------|------|------|
| 2026-08-22 | v20260821 | 🐛 | 全链路端到端 Debug：`api/notifications.php` 缺少 include、`api/notify.php` 事务内 DDL、`api/update_db.php` 快照回填与数值列不兼容（3 项致命修复） |
| 2026-08-22 | v20260802 | 🧹 | 代码瘦身：清除死代码与未使用的 API action（删除 Enum / DTO / Service 等 11 个文件、11 个 API action、若干冗余函数） |
| 2026-08-22 | v20260523 | ⚙️ | PHP 8.0 回退兼容：Enum→常量、readonly class→class（12 个文件，保留 PHP 8.0 特性） |
| 2026-08-22 | v20260523 | 🏗️ | PHP 8.2 编码规范优化：新增 Enum / DTO / Service / AppConfig，20 个 API 文件 switch→match（37 个文件） |
| 2026-08-22 | v20260523 | ✨ | 商品管理增强：模板选择自动填充、AI 智能生成商品配置（`api/ai.php`）、快捷预设 datalist、工单 UI 优化 |
| 2026-08-22 | v20260418 | 🛡️ | 安全修复与私有配置化：`config.php` 改加载器、安装器写 `config.local.php`、OAuth Secret 回归私有配置、管理员恢复模式收紧 |
| 2026-08-22 | v20260405 | 🛡️ | 安装流程修复 + 新增管理员恢复模式（默认关闭，仅本机执行，多重保护） |
| 2026-08-22 | v20260403 | 🏗️ | 代码瘦身与 JS 模块化重构：`main.js` / `admin.js` 拆分为 6 模块、API 层减约 250 行、Emoji→SVG、两轮 Debug 修复 |
| 2026-08-22 | v20260315 | ✨ | 功能大版本：站内余额钱包与余额支付、商品模板、Linux DO 社区规则、工单增强、通知升级、统计报表、退款扩展、订单快照 |
| 2026-08-22 | v20260314 | 🛠️ | 安装兼容与依赖兜底：OPcache 旧配置、mbstring / curl 缺失兜底、UTF-8 兼容函数 |
| 2026-08-22 | v20260224 | 🛠️ | 安装向导重构（三步式）与基础修复（订单号碰撞、通知已读、轮询清理等） |
| 2026-08-22 | v20260126 | 🔍 | 全面代码审计与修复：参数校验、异常处理、响应格式、权限验证、整体结构整理 |
| 2026-08-22 | v20260125 | 🛡️ | 安全与稳定性增强：CSRF 防护、登录 / 敏感接口限流、审计日志、错误日志、敏感字段加密、退款状态化 |
| 2026-08-22 | v20260116 | 🎟️ | 优惠券系统上线：固定 / 百分比折扣、最低消费、次数限制、有效期、占用 / 核销 / 释放全链路 |
| 2026-08-22 | v20260109 | 🛠️ | 安装 / 维护一致性修复：表结构检查与注释对齐，文档同步 |
| 2026-08-22 | v20250702 | ⚙️ | 后台管理系统优化：超级管理员 / 普通管理员权限区分、界面美化、仪表盘增强、迁移流程 |
| 2026-08-22 | v20250604 | ✨ | 工单系统与公告系统上线 |
| 2026-08-22 | v20250603 | 🔐 | 登录系统重构：首页统一识别管理员与用户登录入口，管理员快捷返回后台 |
| 2026-08-22 | v20250602 | 🐛 | 退款功能修复：商品删除后已支付订单仍可退款 |
| 2026-08-22 | v20250601 | ⚡ | 浏览器缓存方案：静态资源统一版本号参数，降低旧资源残留 |

---

## 四、已知问题与后续建议

> 来源：v20261002 全量代码审计。以下问题**已确认存在但本次未修改**——改动面较大或需要产品决策，建议后续排期处理。

| # | 位置 | 问题 | 影响 / 建议 |
|---|------|------|-------------|
| 1 | `api/update_db.php` | **增量迁移缺陷**：新增列 `original_price` / `external_pay_amount` 为 `NOT NULL DEFAULT 0.00`，回填却只处理 `IS NULL` → 历史订单金额被写成 0；`delivery_status` 默认 `'pending'` 同理，历史已支付 / 已退款 / 已取消订单状态错乱 | 建议改为按订单现有状态回填，或提供一次性修正脚本 |
| 2 | `api/update_db.php` | 既有旧表不会被收敛到当前 schema，缺 `users.linuxdo_*`、`tickets.assignee_admin_id`、`announcements.publish_at/expires_at` 等，而 `check` 仍会报"已就绪" | 建议 `check` 增加列级比对 |
| 3 | `api/update_db.php` | `schema_migrations` 表定义了但全项目无人读写；部分 `ALTER` / `DROP` 异常被空 `catch` 吞掉，可能返回假成功 | 启用迁移记录或移除死表；`catch` 至少写日志 |
| 4 | `includes/TicketService.php` | 退款成功后才写工单回复并关闭工单，两步不在同一事务，中途失败会留下"已退款但工单仍打开"且**无法自动恢复**的不一致状态；创建工单（主记录 + 首条回复）同样非原子 | 建议纳入同一事务或增加补偿任务 |
| 5 | `includes/notifications.php` | 未引入 PHPMailer 却配置了 SMTP 分支，实际会静默退回本机 `mail()`；邮件 / Webhook / 站内通知失败全部被吞，业务侧显示"已通知"但实际丢失 | 接入依赖或明确降级提示；失败写日志 |
| 6 | `api/password.php` | `users.email` 在 schema 中无唯一约束，但重置密码用 `WHERE email = ?` 单条查询，同邮箱多账号时重置对象不确定；`update_email` 缺表存在性校验与限流 | 增加唯一约束或限定查询；补充限流 |
| 7 | `js/admin.js` | 优惠券列表与积分用户列表未传 `page`、未处理 `total_pages`，超过 20 条后无翻页入口 | 补齐分页 |
| 8 | `js/tickets.js` | `closeTicketDetail()` 在同一文件重复声明两次（786 / 1529），当前实现相同暂无行为差异，但后续改一处易踩坑 | 合并为单一实现 |
| 9 | `api/products.php` | `delete` 无事务（快照写入与删除分离）、`edit` / `toggle` 不校验 `rowCount()` | 加事务与影响行数校验 |
| 10 | `api/upload.php` | `ticket_attachment_max_mb` 设置项已定义但全项目无人读取；`finfo_open` 不可用时 MIME 白名单退化为"扩展名自证"；`.htaccess` 用 Apache 2.2 语法（2.4 / nginx 下失效） | 读取配置项；`finfo` 缺失时拒绝上传；改写访问控制规则 |
| 11 | `api/ai.php` | 仅校验 AI 返回能否 JSON 解码，不校验是否为商品对象 | 增加结构校验 |
| 12 | `api/dashboard.php` / `api/orders.php` | 部分统计 SQL 直接裸查，缺列时（`dashboard` 已加日志）仍会退化为错误数值 | 统一走列存在性判断 |

---

## 五、维护约定

为保持本日志的可读性与一致性，**每次发布新版本**时请按以下约定追加记录：

1. 在「[二、详细更新记录](#二详细更新记录)」顶部（最新在上）插入新条目；
2. 条目标题统一使用格式：`### vYYYYMMDD · 标题（发布日期）`；
3. 正文按「变更分类」组织，使用二级小标题（如 `#### A. 新功能 / 缺陷修复 / 安全加固 / 界面优化 / 验证`）；
4. 每个变更点用 `- **文件路径**：说明` 的列表形式描述，指向具体文件与改动；
5. 涉及数据库变更时，务必在条目中注明升级方式（后台「数据库维护 → 更新数据库」）；
6. 涉及静态资源时，同步提升页面 `?v=` 版本号；
7. 遗留问题请记入「[四、已知问题与后续建议](#四已知问题与后续建议)」，修复后从该表移除并写入对应版本条目；
8. 发布完成后，同步更新「[一、版本速览](#一版本速览)」表与 `README.md` 的版本号。

### 新条目模板

```markdown
### vYYYYMMDD · 标题（YYYY-MM-DD）

概述：一句话说明本次发布的目的与范围。

#### A. 新功能
- **路径**：说明

#### B. 缺陷修复
- **路径**：现象 / 根因 / 修复

#### 验证
- 全部改动 PHP 文件 `php -l` 通过；JS 文件 `node --check` 通过
```

---

## 六、版本号规则

- **格式**：`vYYYYMMDD`（如 `v20261001`），取发布当天的日期，同一天多次发布可追加后缀（如 `v20260822b`）；
- **合并发布**：多个内部版本号的变更可合并为一次发布（如 v20260822 合并了原 v20260402~v20260825 的全部内容）；
- **归档发布**：未标注日期的历史修复批次（如原 `DEBUG_REPORT.md` 的审计修复）按归档日补记版本号，并在条目中说明其代码基线的相对位置；
- **历史条目**：2026-08-21 及以前的版本按原记录保留版本号，发布日期统一归并为史诗级更新发布日；
- **数据库构建版本**：`api/update_db.php` 返回的 `build` 字段与主版本号保持一致（当前 `20260822`），后台「数据库维护」页面可查看；
- **静态资源版本**：页面引用的 `?v=YYYYMMDD` 与发布版本同步递增（当前 `?v=20261001`）。
