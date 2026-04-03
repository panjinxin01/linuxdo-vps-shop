# VPS积分商城（Linux DO Credit）

一个轻量级的 **VPS 积分/信用兑换商城**，支持：商品（VPS 资源）管理、下单支付、订单交付、公告系统、工单系统，以及 **Linux DO Connect OAuth2** 一键登录。

> 说明：本项目是"开箱即用"的 PHP + MySQL 单体站点，前台/后台都是静态页面 + PHP 接口。
>
> **当前版本**：v20260403（代码瘦身 / 模块化重构 / 集中修复）

## 功能一览

- ✅ 前台：商品列表、商品模板回退展示、优惠券 + 余额支付、订单交付状态、通知中心、工单分类/优先级、余额流水
- ✅ 后台：商品/模板/订单/优惠券/公告/工单/积分/社区规则/统计报表/系统设置/管理员管理
- ✅ 钱包：`users.credit_balance` + `credit_transactions` 完整流水，支持后台手动加减与用户余额支付
- ✅ 社区特化：Linux DO `trust_level / active / silenced` 参与购买限制、白名单/黑名单、等级折扣
- ✅ 工单增强：订单关联、分类、优先级、内部备注、处理时间线、回复模板、附件上传
- ✅ 通知升级：站内通知 + 可选邮件 / Webhook 通知
- ✅ 支付：保留 EasyPay（异步回调 notify + 同步 return）
- ✅ OAuth：保留 Linux DO Connect OAuth2 授权码模式
- ✅ 维护：数据库迁移统一走 `api/update_db.php`，老站可增量升级

## 2026-04 版本重点

### 前端模块化重构

将 `main.js`（88KB）与 `admin.js`（97KB）拆分为 6 个职责明确的模块，消除跨文件重复代码：

| 模块 | 体积 | 职责 |
|------|------|------|
| `common.js` | 6KB | `apiFetch`、CSRF、`escapeHtml`、Toast、剪贴板、分页渲染器、格式化工具 |
| `ui.js` | 3KB | 侧边栏、主题切换、页面路由、滚动监听 |
| `orders.js` | 12KB | 订单凭据解析、VPS 信息复制、退款弹窗、规格快照渲染 |
| `notifications.js` | 11KB | 通知面板、轮询、通知中心全页面 |

**净效果**：`main.js` 88KB → 47KB（-46%）、`admin.js` 97KB → 73KB（-25%）、JS 总量 185KB → 152KB（-18%）

### 后端 API 层瘦身

- 删除 11 个冗余包装函数，统一改用 `commerceTableExists` / `commerceColumnExists` / `commercePrepareOrderForOutput` / `sendSmtpEmail`
- 新增 `paginateParams()` / `paginateResponse()`（统一分页）、`sendSmtpEmail()`（统一 SMTP 邮件）
- 总行数 ~7800 → ~7550，净减约 250 行

### 前端 UI 优化

- **Emoji → SVG 图标统一**：后台侧边栏 15 个 emoji 替换为 16×16 线性 SVG；前台空状态图标替换为 48×48 SVG
- **未登录状态优化**：可用实例、新建实例、我的订单、我的工单在未登录时显示锁图标 + 登录引导
- **性能修复**：`updateHomeStats` 去除重复调用；`loadCreditSummary` 改为局部更新，避免整体 DOM 重渲染

### 两轮集中 Bug 修复

- 修复社区规则 / 信任等级折扣保存失败
- 修复社区页 / 积分页在旧库上 SQL 异常（改为按表按列动态降级）
- 修复交付信息覆盖交付备注（`delivery_info` 与 `delivery_note` 分离写入）
- 修复通知邮件 SMTP 配置"能填不能用"（PHPMailer 优先，`mail()` 回退）
- 修复余额摘要长期显示"最近变动：暂无"
- 修复余额调整 / 商品模板 / 社区规则在旧库缺字段或缺表时直接失败
- 修复用户登录 / OAuth 登录在旧库下崩溃

## 2026-03 版本重点

- 新增 **站内积分钱包 / 余额支付**：支持余额扣款、后台人工调账、余额流水、余额变动通知。
- 新增 **商品模板系统**：`product_templates` 抽象公共配置，商品可选择模板并局部覆盖字段。
- 新增 **订单交付状态流转**：支付状态与交付状态分离，支持 `pending / paid_waiting / provisioning / delivered / exception / refunded / cancelled`。
- 新增 **Linux DO 社区规则**：最低信任等级、silenced 风控、白名单 / 黑名单、信任等级折扣。
- 新增 **工单增强**：分类、优先级、内部备注、核实状态、退款审核字段、附件、事件时间线、回复模板。
- 新增 **报表面板**：今日/月成交额、余额支付/EasyPay 占比、热门商品、工单分类占比、余额总量、异常订单统计。
- 新增 **退款方式扩展**：后台可选择退回站内余额或原路退回支付账户。
- 新增 **订单快照字段**：商品名称、规格、地区、线路、系统、连接信息等在下单时保留快照，避免删除商品后历史订单信息丢失。

## 环境要求

- PHP 7.4+（建议 8.x）
- MySQL 5.7+ / MariaDB 10.3+
- Web 服务器：Nginx / Apache

## 部署与初始化

1. 将项目上传到网站目录（建议独立站点/子目录）。
2. 访问前台 `index.html`。
   - 系统检测到未配置数据库或表未初始化时，会自动跳转到**可视化安装向导**（`admin/install.html`）。
3. 按照安装向导完成三步配置：
   - **步骤1**：填写数据库连接信息（地址、端口、用户名、密码、数据库名），支持在线测试连接
   - **步骤2**：生成数据加密密钥（可选，用于 VPS 密码加密存储）
   - **步骤3**：一键初始化数据库表结构
4. 安装完成后，如果还未创建管理员账号，会自动跳转到 `admin/setup.html` 创建首个**超级管理员**。
5. 创建完管理员后，访问 `admin/login.html` 登录后台。

> 也可以手动编辑 `api/config.php` 填写数据库配置，跳过安装向导的数据库配置步骤。

## 支付配置（后台）

后台「系统设置」中填写：

- `epay_pid`
- `epay_key`
- `notify_url`（异步回调，指向 `api/notify.php`）
- `return_url`（同步跳转地址，可指向前台页面）

> 注意：`pay.php` 会以 POST 表单方式跳转到支付网关地址（代码中当前是 `https://credit.linux.do/epay/pay/submit.php`）。如你使用的 Epay 网关不同，请自行修改 `api/pay.php`。

## Linux DO Connect OAuth2（可选）

两种方式配置：

1. 直接编辑 `api/config.php`：
   - `LINUXDO_CLIENT_ID`
   - `LINUXDO_CLIENT_SECRET`
   - `LINUXDO_REDIRECT_URI`

2. 后台「系统设置」里保存 OAuth 配置：会 **写入并覆盖** `api/config.php` 中对应 `define(...)`。
   - 服务器需要给 `api/config.php` 写权限（或先手动配置）。

配置成功后，前台登录弹窗会出现「使用 Linux DO 登录」。

## 数据库维护 / 升级

后台菜单「数据库维护」（`admin/maintenance.html`）提供：

- **检查状态**：检查缺失的表
- **更新数据库**：自动创建缺表 + 自动迁移必要字段（不会删除现有数据）
- **重置数据库**：清空业务数据并重建表结构（会保留 `admins` 和 `settings`）

## 业务字段约定（与代码一致）

- `products.status`：`1` 在售，`0` 已售
- `orders.status`：
  - `0` 待支付
  - `1` 已支付
  - `2` 已退款
  - `3` 已取消（系统会自动取消 **超过 15 分钟未支付** 的订单，并自动释放优惠券占用）
- `orders.delivery_status`：`pending` 待处理 → `paid_waiting` 已支付待开通 → `provisioning` 开通中 → `delivered` 已交付 / `exception` 异常 / `refunded` 已退款 / `cancelled` 已取消
- `tickets.status`：`0` 待回复、`1` 已回复、`2` 已关闭
- `coupons.type`：`fixed` 固定金额折扣、`percent` 百分比折扣
- `coupons.status`：`1` 启用、`0` 停用
- `coupon_usages.status`：`0` 占用中（待支付）、`1` 已使用（已支付）

## 目录结构

```
├── admin/                  # 后台页面
│   ├── index.html          # 后台主页面
│   ├── install.html        # 可视化安装向导
│   ├── login.html          # 管理员登录
│   ├── setup.html          # 首次创建管理员
│   └── maintenance.html    # 数据库维护
├── api/                    # 所有后端接口（26 个 PHP 文件）
│   ├── config.php          # 数据库 & OAuth 配置
│   ├── install.php         # 安装向导 API
│   ├── update_db.php       # 数据库迁移脚本
│   ├── orders.php          # 订单（含交付、退款）
│   ├── products.php        # 商品管理
│   ├── tickets.php         # 工单系统
│   ├── community.php       # 社区规则
│   ├── credits.php         # 积分 / 余额管理
│   ├── coupons.php         # 优惠券接口
│   ├── templates.php       # 商品模板
│   ├── dashboard.php       # 统计报表
│   ├── notifications.php   # 通知接口
│   ├── announcements.php   # 公告接口
│   ├── admin.php           # 管理员管理
│   ├── oauth.php           # OAuth 登录
│   ├── pay.php             # 支付发起
│   ├── notify.php          # 支付异步回调
│   ├── user.php            # 用户接口
│   ├── settings.php        # 系统设置
│   ├── export.php          # 数据导出
│   ├── upload.php          # 文件上传
│   ├── password.php        # 密码管理
│   ├── audit_logs.php      # 审计日志
│   ├── cache.php           # 缓存管理
│   ├── csrf.php            # CSRF Token
│   └── check_install.php   # 安装状态检查
├── css/                    # 样式文件
│   ├── style.css           # 前台样式
│   ├── admin.css           # 后台样式
│   ├── variables.css       # CSS 变量
│   └── install.css         # 安装向导样式
├── includes/               # 公共 PHP 模块
│   ├── db.php              # 数据库连接 & UTF-8 兼容函数
│   ├── security.php        # CSRF / 限流 / 加密 / HTTP 请求
│   ├── commerce.php        # 商务逻辑（表检测 / 分页 / 订单输出 / 邮件）
│   ├── schema.php          # 数据库表结构定义
│   ├── coupons.php         # 优惠券逻辑
│   ├── notifications.php   # 通知创建
│   └── cache.php           # 缓存管理
├── js/                     # 前端脚本（7 个文件，模块化拆分后）
│   ├── main.js             # 前台主逻辑（47KB）
│   ├── admin.js            # 后台主逻辑（73KB）
│   ├── common.js           # 公共工具模块（apiFetch / CSRF / Toast / 分页）
│   ├── ui.js               # UI 交互模块（侧边栏 / 主题 / 路由）
│   ├── orders.js           # 订单模块（凭据解析 / 退款弹窗）
│   ├── notifications.js    # 通知模块（面板 / 轮询 / 通知中心）
│   └── install.js          # 安装向导脚本
├── index.html              # 前台入口
├── CHANGELOG.md            # 详细更新日志
└── README.md               # 本文件
```

## 静态资源缓存说明

前台与后台页面默认使用 `Date.now()` 给 CSS/JS 增加 `?v=` 参数（自动缓存破坏），方便你修改后立即生效。

> 如果你想启用强缓存（更省带宽/更快），可以把这些 `?v=Date.now()` 改成固定版本号，例如 `?v=20260403`。

## 安全建议

- 保护好 `api/config.php`：不要把真实数据库密码/密钥暴露给无关人员；建议通过 Web 服务器规则禁止直接访问（仅允许 PHP include 读取）。
- **CSRF 防护**：已内置前后端统一的 `X-CSRF-Token` 验证机制。
- **登录限流**：内置登录/敏感接口限流保护，防止暴力破解。
- **敏感字段加密**：VPS SSH 密码已改为加密存储（需配置 `DATA_ENCRYPTION_KEY`）。
- 商品里包含 SSH 登录信息（敏感数据）：
  - 前台只在 **已支付订单** 中下发
  - 建议全站启用 HTTPS

## 更新记录

| 版本 | 重点 |
|------|------|
| **v20260403** | 代码瘦身、JS 模块化重构、API 层瘦身、UI 图标统一、两轮集中 Bug 修复 |
| **v20260315** | 余额钱包 / 商品模板 / 交付状态 / 社区规则 / 工单增强 / 通知升级 / 统计报表 |
| **v20260314** | 安装兼容与依赖兜底（OPcache / mbstring / curl） |
| **v20260224** | 安装向导重构 & Bug 修复 & 代码优化 |
| **v20260126** | 全面代码审计与修复 |
| **v20260125** | 安全与稳定性增强（CSRF / 限流 / 审计日志 / 加密） |
| **v20260116** | 优惠券系统上线 |
| **v20260109** | 安装 / 维护一致性修复 |

详细更新内容请参阅 [`CHANGELOG.md`](CHANGELOG.md)。

## License

MIT License（见 `LICENSE`）。
