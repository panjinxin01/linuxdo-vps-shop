# VPS积分商城（Linux DO Credit）

一个轻量级的 **VPS 积分/信用兑换商城**。

> 说明：本项目是"开箱即用"的 PHP + MySQL 单体站点，前台/后台都是静态页面 + PHP 接口。
>
> **当前版本**：v20260926（修复工单输入控件缺失 CSS 样式：发起新工单 + 后台退款审批；含 v20260828 侧边栏高亮修复、v20260825 工单页面化重构）

## 功能一览

- ✅ 前台：商品列表、商品模板回退展示、优惠券 + 余额支付、订单交付状态、通知中心、工单分类/优先级、余额流水
- ✅ 后台：商品/模板/订单/优惠券/公告/工单/积分/社区规则/统计报表/系统设置/管理员管理/操作日志/数据库维护
- ✅ 钱包：`users.credit_balance` + `credit_transactions` 完整流水，支持后台手动加减与用户余额支付
- ✅ 社区特化：Linux DO `trust_level / active / silenced` 参与购买限制、白名单/黑名单、等级折扣
- ✅ 工单增强：订单关联、分类、优先级、内部备注、处理时间线、附件上传
- ✅ 通知升级：站内通知 + 可选邮件 / Webhook 通知
- ✅ 支付：Linux DO Credit（官方 LDC 接口 Ed25519 优先 + 易支付兼容 MD5 兜底，异步回调 + 订单查询/退款/分发/余额统计）
- ✅ 平台管理接口（`api/ldcpay.php`）：订单查询（3.1）/ 商户积分分发（3.4，自动同步站内余额流水）/ 平台余额统计（3.5），仅限管理员
- ✅ AI 智能生成：商品弹窗支持自然语言一键生成完整配置（OpenAI 兼容 API，后台可配置地址/Key/模型）
- ✅ 商品模板自动填充：选择模板自动回填 CPU/内存/硬盘/带宽/地区/线路/系统等规格并高亮标记
- ✅ OAuth：保留 Linux DO Connect OAuth2 授权码模式
- ✅ 双主题与响应式：前台/后台深浅模式统一（`localStorage.theme`，默认深色），毛玻璃头部导航 + 面包屑 + 移动端适配
- ✅ 维护：数据库迁移统一走 `api/update_db.php`，老站可增量升级；后台「数据库维护」先检查、再确认、后执行
- ✅ 安装恢复：首次安装会检测旧管理员；内置**管理员恢复模式**，默认关闭，需通过环境变量或 `api/config.local.php` 临时启用并配置恢复密钥后，且仅允许服务器本机执行

## 环境要求

- **PHP 8.0+**（使用 match / 命名参数 / 构造器提升等 PHP 8.0 特性）
- MySQL 5.7+ / MariaDB 10.3+
- Web 服务器：Nginx / Apache

## 私有配置说明

项目源码中的 `api/config.php` 是**配置加载器**，真实敏感配置建议放在以下任一位置：

1. **环境变量**（优先级最高）
2. **`api/config.local.php`**（部署私有配置，不要提交到代码仓库）

`api/config.local.php` 示例：

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

> `api/config.local.php` 属于部署私有配置文件，更新源码时应保留，不要随源码一起覆盖或提交到 Git。
>
> **加载顺序**：`api/config.php` 先加载内置默认配置（含环境变量覆盖），随后如果 `config.local.php` 存在，会用其中定义的常量**补充**（已定义的常量不会被覆盖，所以环境变量优先级最高）。

## 安装锁机制

安装完成并创建管理员后，`api/install.php` 会检测项目根目录下的 `.install_lock` 文件（由 `run_install` 成功时自动生成），其所有**危险操作**（run_install / save_config / test_db / generate_key）均被拒绝。

如需**重新安装**，请手动删除 `.install_lock` 文件（Linux：`rm .install_lock`）。

## 部署与初始化

1. 将项目上传到网站目录（建议独立站点/子目录）。
2. 访问前台 `index.html`。
   - 系统检测到未配置数据库或表未初始化时，会自动跳转到**可视化安装向导**（`admin/install.html`）。
3. 按照安装向导完成三步配置：
   - **步骤1**：填写数据库连接信息（地址、端口、用户名、密码、数据库名），支持在线测试连接
   - **步骤2**：生成数据加密密钥（可选，用于 VPS 密码加密存储）
   - **步骤3**：一键初始化数据库表结构
4. 安装完成后，如果还未创建管理员账号，会自动跳转到 `admin/setup.html` 创建首个**超级管理员**。
5. 如果系统检测到当前数据库里已经存在管理员账号，`admin/setup.html` 会停留在说明页并提示你：
   - 直接前往 `admin/login.html` 尝试登录已有管理员；或
   - 按页面提示进入**管理员恢复模式**，在确认这是旧数据后再清空旧管理员。
6. 创建完管理员后，访问 `admin/login.html` 登录后台。

> 也可以手动通过环境变量或 `api/config.local.php` 提前写入数据库配置，跳过安装向导的数据库配置步骤。

## 支付配置（后台）

依据《LD支付文档》，平台网关基址为 `https://credit.linux.do`，支持两种协议：

| 协议 | 签名方式 | 提交地址 | 适用场景 |
|------|---------|---------|---------|
| 官方 LDC 接口 (`type=ldcpay`) | Ed25519 (商户私钥) | `/epay/pay/submit.php` | 安全性更高，需上传公钥到控制台 |
| 易支付兼容接口 (`type=epay`) | MD5 (key 拼接) | `/epay/pay/submit.php` | 兼容易支付/CodePay/VPay 协议 |

> `pid` = Client ID，`key` = Client Secret——两种协议共用同一套应用身份。

后台「系统设置 → 支付配置」填写：

- `epay_pid`（即 Client ID）
- `epay_key`（即 Client Secret）
- `notify_url`（异步回调，指向 `api/notify.php`）
- `return_url`（同步跳转地址，可指向前台页面）

后台「系统设置 → LDC Pay」填写（启用官方 Ed25519 接口时需要）：

- `ldcpay_client_id` / `ldcpay_client_secret`
- `ldcpay_private_key`（Ed25519 私钥，用于请求签名；可用页面按钮生成密钥对）
- `ldcpay_public_key`（对应公钥，需上传到 Linux DO Credit 控制台）

### 协议自动选择

`api/pay.php` 发起支付时：配置了 Ed25519 私钥则优先走官方接口，否则自动降级到易支付兼容接口。回调统一由 `api/notify.php` 处理（按文档 3.3：MD5 验签 + `trade_status=TRADE_SUCCESS` 校验 + 响应体返回 `success`）。

### 平台管理接口（管理员）

新增 `api/ldcpay.php` 提供文档 3.1/3.4/3.5 对应能力：

- `action=query&out_trade_no=xxx` — 订单查询（GET `/epay/api.php`，status: 1=成功 0=失败/处理中）
- `action=distribute` — 商户积分分发（POST `/lpay/distribute`，Basic Auth；成功后自动同步站内余额流水）
- `action=balance_stats` — 平台用户余额统计（公开统计接口）

> 注意：文档 3.2 规定平台**仅支持全额退回**（money 必须等于原订单金额）。系统退款时若按剩余时长折算的可退金额不足以覆盖外部支付部分，将自动改为全额退回站内余额。

## Linux DO Connect OAuth2（可选）

请按 Linux DO Connect 接入文档，在**服务器私有配置**中设置以下三项：

- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_REDIRECT_URI`

推荐写入 `api/config.local.php` 或环境变量，但后台「系统设置」也**支持直接保存 OAuth 配置**（会写入 `api/config.php`）。两种方式任选其一即可。

配置成功后，前台登录弹窗会出现「使用 Linux DO 登录」。

### 推荐配置示例

```php
<?php
return [
    'LINUXDO_CLIENT_ID' => '你的 Client ID',
    'LINUXDO_CLIENT_SECRET' => '你的 Client Secret',
    'LINUXDO_REDIRECT_URI' => 'https://yourdomain.com/api/oauth.php?action=callback',
];
```

### 接入要点

- 授权地址：`https://connect.linux.do/oauth2/authorize`
- Token 地址：`https://connect.linux.do/oauth2/token`
- 用户信息：`https://connect.linux.do/api/user`
- 授权模式：`authorization_code`
- `scope`：`user`
- 请确保 `LINUXDO_REDIRECT_URI` 与 Linux DO Connect 后台登记的回调地址完全一致

## 更新方式建议

推荐更新流程：

1. 备份数据库
2. 备份 `api/config.local.php`（如果你使用它）
3. 覆盖上传新版本源码
4. 保留 `api/config.local.php` 不变
5. 登录后台执行数据库维护 / 升级

如果你的部署习惯是“整站删掉后重传”，请务必先备份 `api/config.local.php`，上传完成后再放回。

## 数据库维护 / 升级

后台菜单「数据库维护」（`admin/maintenance.html`）提供：

- **检查状态**：检查缺失的表
- **更新数据库**：自动创建缺表 + 自动迁移必要字段（不会删除现有数据）
- **重置数据库**：清空业务数据并重建表结构（会保留 `admins` 和 `settings`）

## 管理员恢复模式（默认关闭）

适用场景：

- 你刚完成数据库初始化，但 `admin/setup.html` 提示“当前数据库中已存在管理员账号”
- 你怀疑当前连接的是旧数据库，或数据库中残留了历史管理员数据
- 你无法确认或找回原管理员账号，因此需要重新创建首个管理员

### 重要说明

- 恢复模式**默认关闭**，不会对公网访客暴露危险操作
- 恢复配置应通过环境变量或 `api/config.local.php` 临时注入，不建议直接修改源码文件
- 恢复操作**仅允许服务器本机执行**；即使开关已启用，公网访问也不能直接触发清空管理员
- 恢复操作只会清空 `admins` 表，不会删除用户、订单、商品、设置等业务数据
- 恢复完成后，请**立即**关闭恢复开关并移除恢复密钥

### 启用步骤

在 `api/config.local.php` 中临时加入或修改：

```php
<?php
return [
    'ADMIN_RECOVERY_ENABLED' => true,
    'ADMIN_RECOVERY_KEY' => '请替换为你自己设置的高强度恢复密钥',
];
```

保存后：

1. 在服务器本机访问 `admin/setup.html`（例如通过 `127.0.0.1` 或等效本地方式）
2. 刷新页面，确认恢复面板可见
3. 在页面的“恢复模式”区域输入你设置的 `ADMIN_RECOVERY_KEY`
4. 在确认文本中输入：`RESET ADMINS`
5. 执行“清空旧管理员并重新创建”
6. 页面刷新后，重新创建新的首个管理员
7. 恢复完成后，立即将 `ADMIN_RECOVERY_ENABLED` 改回 `false`，并删除或更换 `ADMIN_RECOVERY_KEY`

### 安全保护

恢复接口已内置以下保护：

- CSRF 校验
- 限流
- 恢复密钥校验
- 固定确认文本校验
- 仅服务器本机可执行
- 执行日志记录
- 执行后自动清除当前管理员会话

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
├── api/                    # 所有后端接口（28 个 PHP 文件，不含 config.local.php）
│   ├── config.php          # 配置加载器（读取环境变量 / config.local.php）
│   ├── config.local.php    # 部署私有配置（需自行创建，不提交仓库）
│   ├── install.php         # 安装向导 API
│   ├── check_install.php   # 安装状态检查
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
│   ├── ldcpay.php          # LDC Pay 平台管理接口（查询/分发/统计）
│   ├── ai.php              # AI 智能生成商品配置代理
│   ├── user.php            # 用户接口
│   ├── settings.php        # 系统设置
│   ├── export.php          # 数据导出
│   ├── upload.php          # 文件上传
│   ├── password.php        # 密码管理
│   ├── audit_logs.php      # 审计日志
│   ├── cache.php           # 缓存管理
│   └── csrf.php            # CSRF Token
├── css/                      # 样式文件
│   ├── style.css           # 前台样式
│   ├── admin.css           # 后台样式
│   ├── tickets.css         # 工单共享组件样式（前台+后台通用，v20260823）
│   ├── variables.css       # CSS 变量
│   └── install.css         # 安装向导样式
├── includes/                 # 公共 PHP 模块
│   ├── AppConfig.php       # 强类型配置对象（兼容 define 常量）
│   ├── db.php              # 数据库连接 & UTF-8 兼容函数
│   ├── security.php        # CSRF / 限流 / 加密 / HTTP 请求
│   ├── commerce.php        # 商务逻辑（表检测 / 分页 / 订单输出 / 邮件）
│   ├── TicketService.php   # 工单业务服务层（v20260823 从 api/tickets.php 拆分）
│   ├── schema.php          # 数据库表结构定义
│   ├── coupons.php         # 优惠券逻辑
│   ├── notifications.php   # 通知创建
│   ├── cache.php           # 缓存管理
│   └── ldcpay.php          # LDC Pay（Ed25519 签名 / 支付 / 退款）
├── js/                     # 前端脚本（8 个文件，模块化拆分后）
│   ├── main.js             # 前台主逻辑
│   ├── admin.js            # 后台主逻辑
│   ├── tickets.js          # 工单共享模块（前台+后台通用渲染器 / API 封装 / 映射表）
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

前台与后台页面统一使用**固定版本号** `?v=YYYYMMDD`（如 `?v=20260822`）给 CSS/JS 追加查询参数，浏览器可正常强缓存，发布新版本时同步递增版本号即可立即刷新缓存（配合后台「缓存管理」的清空操作效果更佳）。

> 修改任一 CSS/JS 后，请记得同步提升对应页面里的版本号，避免用户浏览器继续使用旧资源。

## 安全建议

- `api/config.php` 应保持为通用加载器；真实数据库密码、OAuth Secret、恢复密钥请放到环境变量或 `api/config.local.php`。
- `api/config.local.php` 属于部署私有配置文件，不要提交到 Git，不要通过下载包公开分发。
- `ADMIN_RECOVERY_KEY` 属于高敏感恢复密钥，只应由站点维护者掌握；恢复完成后建议及时更换，并将 `ADMIN_RECOVERY_ENABLED` 改回 `false`。
- Linux DO Connect 的 `Client Secret` 可通过后台系统设置页面保存，也可通过 `api/config.local.php` 或环境变量配置（推荐后者，更易维护）。
- **CSRF 防护**：已内置前后端统一的 `X-CSRF-Token` 验证机制。
- **登录限流**：内置登录/敏感接口限流保护，防止暴力破解。
- **敏感字段加密**：VPS SSH 密码已改为加密存储（需配置 `DATA_ENCRYPTION_KEY`）。
- 商品里包含 SSH 登录信息（敏感数据）：
  - 前台只在 **已支付订单** 中下发
  - 建议全站启用 HTTPS

## License

MIT License（见 `LICENSE`）。

## 版本历史

详细版本变更记录见 `CHANGELOG.md`：

- **v20260926（工单输入控件样式修复 · 2026-09-26）**：
  - `css/tickets.css` 补全 `.tk-compose-stack textarea`（发起新工单）与 `.refund-admin-card select/textarea`（后台退款审批）基础样式，修复输入控件回退到浏览器默认外观（"没有 CSS"）的问题；工具条与输入框无缝拼接为完整编辑器外框
  - `index.html`、`admin/index.html` 缓存版本号升级至 `?v=20260926`
- **v20260823（工单系统全面重构 · 2026-08-23）**：
  - 架构：新增共享前端模块 `js/tickets.js`（常量映射/图标库/API封装/渲染器/双侧控制器）与共享样式 `css/tickets.css`；后端拆分 `includes/TicketService.php` 服务层，`api/tickets.php` 瘦身为 45 行路由
  - 新功能：后台工单筛选/搜索栏、快捷回复模板 chips、加载骨架屏、可重试错误态、相对时间显示
  - 交互：Toast 替代 alert、Ctrl+Enter 发送、回复后局部刷新、统计概览条、优先级色点
  - 修复：重复提交防护、模板填入目标自动探测；旧 CSS/JS 工单代码清理约 919 行
  - 兼容：API 响应与全局函数名 100% 向后兼容，外部模块零改动
- **v20260822（史诗级更新 · 2026-08-22）**：合并 2026-08-21 之后的全部变更——
  - 前台 UI 全面重构（玻璃拟态弹窗、渐变主按钮、Hash 路由、骨架屏）
  - 前台/后台头部导航重构（语义化三区布局、可点击面包屑、毛玻璃顶栏、头像胶囊下拉）
  - 支付系统重构对齐《LD支付文档》（Ed25519 / MD5 双协议、回调验签修复、退款合规、平台管理接口）
  - 后台深浅模式适配、数据库维护三段式交互、静态资源改固定版本号、面包屑中文标题修复
  - 更新日志整体重构与文档同步、残留代码清理、资源版本号统一
- **v20260821 及以前**：历史版本已简略归档于 `CHANGELOG.md`（全链路 Debug、代码瘦身、功能大版本、安全加固、优惠券系统等）
