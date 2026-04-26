# VPS积分商城（Linux DO Credit）

一个轻量级的 **VPS 积分/信用兑换商城**。

> 说明：本项目是"开箱即用"的 PHP + MySQL 单体站点，前台/后台都是静态页面 + PHP 接口。
>
> **当前版本**：v20260418（安全修复 / 私有配置化 / 文档同步）

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
- ✅ 安装恢复：首次安装会检测旧管理员；内置**管理员恢复模式**，默认关闭，需通过环境变量或 `api/config.local.php` 临时启用并配置恢复密钥后，且仅允许服务器本机执行

## 环境要求

- PHP 7.4+（建议 8.x）
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

后台「系统设置」中填写：

- `epay_pid`
- `epay_key`
- `notify_url`（异步回调，指向 `api/notify.php`）
- `return_url`（同步跳转地址，可指向前台页面）

> 注意：`pay.php` 会以 POST 表单方式跳转到支付网关地址（代码中当前是 `https://credit.linux.do/epay/pay/submit.php`）。如你使用的 Epay 网关不同，请自行修改 `api/pay.php`。

## Linux DO Connect OAuth2（可选）

请按 Linux DO Connect 接入文档，在**服务器私有配置**中设置以下三项：

- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_REDIRECT_URI`

推荐写入 `api/config.local.php` 或环境变量，**不要直接写死到源码文件中，也不要通过后台页面保存 Client Secret**。

后台「系统设置」中的 OAuth 区块现在仅用于：

- 查看当前是否已完成私有配置
- 查看当前回调地址
- 查看配置说明

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
├── api/                    # 所有后端接口（26 个 PHP 文件）
│   ├── config.php          # 配置加载器（读取环境变量 / config.local.php）
│   ├── config.local.php    # 部署私有配置（需自行创建，不提交仓库）
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

- `api/config.php` 应保持为通用加载器；真实数据库密码、OAuth Secret、恢复密钥请放到环境变量或 `api/config.local.php`。
- `api/config.local.php` 属于部署私有配置文件，不要提交到 Git，不要通过下载包公开分发。
- `ADMIN_RECOVERY_KEY` 属于高敏感恢复密钥，只应由站点维护者掌握；恢复完成后建议及时更换，并将 `ADMIN_RECOVERY_ENABLED` 改回 `false`。
- Linux DO Connect 的 `Client Secret` 不应在前端暴露，也不建议通过后台页面直接保存。
- **CSRF 防护**：已内置前后端统一的 `X-CSRF-Token` 验证机制。
- **登录限流**：内置登录/敏感接口限流保护，防止暴力破解。
- **敏感字段加密**：VPS SSH 密码已改为加密存储（需配置 `DATA_ENCRYPTION_KEY`）。
- 商品里包含 SSH 登录信息（敏感数据）：
  - 前台只在 **已支付订单** 中下发
  - 建议全站启用 HTTPS

## License

MIT License（见 `LICENSE`）。
