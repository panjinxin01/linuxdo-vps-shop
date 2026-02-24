# VPS积分商城（Linux DO Credit）

一个轻量级的 **VPS 积分/信用兑换商城**，支持：商品（VPS 资源）管理、下单支付、订单交付、公告系统、工单系统，以及 **Linux DO Connect OAuth2** 一键登录。

> 说明：本项目是"开箱即用"的 PHP + MySQL 单体站点，前台/后台都是静态页面 + PHP 接口。
>
> **当前版本**：v20260224（安装向导重构 & Bug修复 & 代码优化）
## 功能一览

- ✅ 前台：商品列表、下单、优惠券使用、支付跳转、订单查询（已支付才展示 VPS 登录信息）
- ✅ 后台：商品/订单/优惠券/公告/工单管理、系统设置、管理员管理（super/admin 角色）
- ✅ 优惠券：支持固定金额和百分比折扣，可设置使用门槛、次数限制、有效期等
- ✅ 支付：Epay（异步回调 notify + 同步 return）
- ✅ OAuth：Linux DO Connect（可选）
- ✅ 维护：数据库缺表修复/升级、重置（保留管理员与 settings）

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
- `tickets.status`：`0` 待回复、`1` 已回复、`2` 已关闭
- `coupons.type`：`fixed` 固定金额折扣、`percent` 百分比折扣
- `coupons.status`：`1` 启用、`0` 停用
- `coupon_usages.status`：`0` 占用中（待支付）、`1` 已使用（已支付）

## 静态资源缓存说明

前台与后台页面默认使用 `Date.now()` 给 CSS/JS 增加 `?v=` 参数（自动缓存破坏），方便你修改后立即生效。

> 如果你想启用强缓存（更省带宽/更快），可以把这些 `?v=Date.now()` 改成固定版本号，例如 `?v=20260109`。

## 安全建议（强烈建议阅读）

- 保护好 `api/config.php`：不要把真实数据库密码/密钥暴露给无关人员；建议通过 Web 服务器规则禁止直接访问（仅允许 PHP include 读取）。
- **CSRF 防护**：v20260125 起已内置前后端统一的 `X-CSRF-Token` 验证机制。
- **登录限流**：内置登录/敏感接口限流保护，防止暴力破解。
- **敏感字段加密**：VPS SSH 密码已改为加密存储（需配置 `DATA_ENCRYPTION_KEY`）。
- 商品里包含 SSH 登录信息（敏感数据）：
  - 前台只在 **已支付订单** 中下发
  - 建议全站启用 HTTPS

## 目录结构（简化）

```
api/                # 所有后端接口（install.php 为纯 JSON API）
admin/              # 后台静态页面（含 install.html 安装向导）
css/ js/            # 前端资源（含 install.css/install.js）
includes/           # 公共模块（db.php / security.php / coupons.php / notifications.php）
index.html          # 前台入口
```

## License

MIT License（见 `LICENSE`）。

---

## 更新记录

- **v20260224**：安装向导重构 & Bug修复 & 代码优化
- **v20260126**：全面代码审计与修复（includes/api/admin/css/js/index.html）
- **v20260125**：安全与稳定性增强（CSRF防护、限流、审计日志、敏感字段加密）
- **v20260116**：优惠券系统上线
- **v20260109**：安装/维护一致性修复

详细更新内容请参阅 `CHANGELOG.md`。
