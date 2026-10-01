# VPS积分商城 · 更新日志（CHANGELOG）

> **项目**：VPS积分商城（Linux DO Credit）— 基于 PHP + MySQL 的轻量级 VPS 积分/信用兑换商城
> **当前版本**：v20260926（修复「发起新工单」页输入框缺失 CSS 样式的 bug；含 v20260828 侧边栏高亮修复）
> **发布日期**：2026-09-26
> **相关文档**：功能与部署说明见 `README.md`；开源许可见 `LICENSE`

---

## 关于本文件

本更新日志是项目的**版本演进档案**，完整记录自 2025-06 至今的每一次发布。文档结构如下：

| 章节 | 内容 |
|------|------|
| [版本速览](#版本速览) | 一张表纵览全部版本 |
| [详细更新记录](#详细更新记录) | **v20260822 史诗级更新**完整明细（含 2026-08-21 之后全部变更） |
| [历史版本摘要](#历史版本摘要) | **2026-08-21 及以前**版本简略摘要（一行一条，日期统一归并为发布日） |
| [维护约定](#维护约定) | 如何为下一次发布追加记录（模板） |
| [版本号规则](#版本号规则) | 版本号命名说明 |

**变更类型图例**：

| 标签 | 含义 | | 标签 | 含义 |
|------|------|---|------|------|
| ✨ | 新功能 | | 🛡️ | 安全加固 |
| 🐛 | 缺陷修复 | | ⚙️ | 兼容 / 维护 |
| 🎨 | 界面 / 交互 | | 🏗️ | 架构重构 |
| 💳 | 支付相关 | | 🧹 | 代码清理 |
| 📦 | 发布整理 | | 📄 | 文档 |

---

## 版本速览

| 版本号 | 发布日期 | 类型 | 摘要 |
|--------|----------|------|------|
| **v20260926** | 2026-09-26 | 🐛🎨 | **修复「发起新工单」输入框"没有 CSS"的 bug**：`css/tickets.css` 中 `.tk-compose-stack textarea` 仅有"顶部圆角归零"两行，缺失基础样式导致输入框回退到浏览器默认外观（等宽字体 / 0 内边距 / 裸灰边框）；补全边框、背景、内边距、字体继承、底部圆角与 focus 态，与 `.tk-toolbar` 无缝拼合成完整编辑器外框；`index.html` / `admin/index.html` 同步升级 `tickets.css` 缓存版本号至 `?v=20260926` |
| **v20260828** | 2026-08-28 | 🐛 | **修复首次进入侧边栏全部高亮的 bug**：`js/ui.js switchPage` 中 `classList.toggle("active", cond,)` 的三实参尾逗号写法在部分移动端内核（实测 Chromium 120 / X5 WebView）下 `force=undefined` 被误判为真，导致不匹配的导航项也被强制加上 `active`；改用显式 `add/remove` 重写激活态切换，任何引擎行为一致，并同步升级 `ui.js` 缓存版本号 |
| **v20260824** | 2026-08-22 | 🎨✨ | **工单回复界面 UI 全面重构（IM 气泡式）**：对话流重构为微信/客服系统风格聊天气泡布局（客服右/用户左 + 头像）；时间线与附件改为折叠面板；新增字数统计、发送 loading 态、自动滚动到最新；空状态插画化；前台概览 chips 可点击筛选；后台状态筛选升级为分段按钮组 |
| **v20260823** | 2026-08-23 | 🏗️🎨 | **工单系统全面重构**：新增共享前端模块 `js/tickets.js` 与共享样式 `css/tickets.css`，后端拆分 `includes/TicketService.php` 服务层；补齐后台筛选/搜索、快捷回复模板、加载骨架屏；Toast 替代 alert |
| **v20260822b** | 2026-08-22 | 🎨 | **登录回调页 UI 重构**：登录成功/失败/OAuth 未配置三态页面统一为毛玻璃卡片 + 动态光晕背景的现代设计，未配置裸文本提示升级为完整提示页 |
| **v20260822** | 2026-08-22 | ✨📦 | **史诗级更新**：合并 2026-08-21 之后的全部变更——前台/后台 UI 全面重构、支付系统对齐《LD支付文档》、前后台侧边栏双主题适配、数据库维护优化、更新日志重构与全面整理 |
| 历史版本 | 2026-08-22（统一归并） | 多类型 | v20260821 及以前全部版本，见 [历史版本摘要](#历史版本摘要) |

> **说明**：v20260822 为一次合并发布，原 v20260402 / v20260404 / v20260405 / v20260823 / v20260824 / v20260825 等内部版本号的变更内容已全部并入本次更新。

---

## 详细更新记录

### 2026-09-26 · `v20260926` · 🐛🎨 修复「发起新工单」输入框缺失 CSS 样式

- **问题现象**：「我的工单 → 发起新工单」页的问题描述输入框（`#tkNewContent`）显示为浏览器默认外观——等宽字体、0 内边距、裸灰边框，用户反馈"此处没有 CSS"。
- **根因**：`css/tickets.css` 中 `.tk-compose-stack textarea` 规则自工单页面化重构（v20260825）起仅有 `border-top-left-radius: 0; border-top-right-radius: 0;` 两行"圆角修正"，从未定义边框 / 背景 / 内边距 / 字体等基础样式；且该 `textarea` 不在 `.form-group` / `.modal` 作用域内，未能命中任何现有输入框样式，最终回退到浏览器 UA 默认样式。
- **修复**：为该规则补全完整样式——背景 `--bg-input`、`1px` 边框（顶边与 `.tk-toolbar` 衔接）、`12px 14px` 内边距、`font-family: inherit`、底部 `--radius-md` 圆角；新增 `:focus` 聚焦光环（`--primary` + 3px 光晕）、`::placeholder` 弱化颜色、以及 `.tk-compose-stack:focus-within .tk-toolbar` 工具栏联动高亮。工具条与输入框 0 缝隙拼接，构成完整"编辑器"外框。
- **缓存**：`index.html`、`admin/index.html` 中 `tickets.css` 引用版本号由 `?v=20260825` 升级为 `?v=20260926`，确保访客浏览器立即拉取新样式。
- **说明**：本次为纯样式修复，不改动任何 JS 逻辑与后端接口；浅色 / 深色双主题自动适配。

### 2026-08-22 · `v20260824` · 🎨✨ 工单回复界面 UI 全面重构（IM 气泡式对话布局）

在 v20260823 共享模块架构基础上，对工单**回复对话流与工单列表页**进行视觉与交互的全面重构。**API、全局函数签名、表单控件 id 100% 向后兼容，notifications.js / orders.js / ui.js / admin.js 零改动。**

#### A. IM 聊天气泡对话流（核心变更）
- **回复流重构为即时通讯布局**（前台「我的工单」详情弹窗 + 后台工单管理详情弹窗共用）：
  - 客服消息靠右：品牌色（--primary）气泡白字 + 渐变底客服头像（耳机图标）+「客服」角色标签
  - 用户消息靠左：卡片色气泡描边样式 + 素色用户头像
  - 每条消息结构：头像 → 角色名/角色标签 → 气泡正文 → 相对时间（title 显示完整时间）
  - 深色模式下客服气泡自动切换为深色文字保证对比度；气泡圆角含指向性小角（靠近头像侧）
- **加载骨架屏同步升级**：模拟头像+左右气泡交错布局，消除加载时跳动

#### B. 折叠面板
- **处理时间线默认收起**：以折叠面板呈现（标题带事件数徽标 + chevron 旋转动画），点击展开/收起，降低视觉噪音
- **附件面板有附件时默认展开**：网格布局保留图片缩略图/文件卡片两种形态，计数徽标显示附件数量
- 完整键盘可达：面板头为原生 button，支持 aria-expanded / aria-controls / hidden 属性联动

#### C. 回复输入区交互增强
- **字数统计**：输入框右下角实时显示 `n/1000`，达到 85% 变黄色警示、达上限变红色加粗，textarea 增加 maxlength 硬限制
- **发送 loading 态**：前台/后台发送按钮点击后进入 spinner+「发送中...」禁用态，完成后恢复；附件上传按钮同样接入
- **自动滚动到最新消息**：打开详情与回复成功后，对话流自动滚动到底部（替代原先回到顶部）
- 快捷键提示升级为 `<kbd>` 键帽样式（Ctrl + Enter 发送，移动端隐藏）
- 回复成功后输入框清空并同步重置字数统计

#### D. 工单列表页统一重构
- **前台「我的工单」**：
  - 统计概览 chips 升级为**可点击筛选按钮组**（全部/待回复/已回复/已关闭，本地过滤无需请求，aria-pressed 状态同步）
  - 列表卡片新增**状态顶边条**（待回复橙/已回复绿/已关闭灰），hover 时顶边条从 32% 展开至全宽
  - 状态徽章增加同色圆点（色彩不是唯一指示，符合无障碍规范）；空状态插画化（信封+对话气泡 SVG 插画，随主题着色）
- **后台工单管理**：
  - 状态筛选由下拉框升级为**分段按钮组**（全部/待回复/已回复/已关闭），与原隐藏 select 双向同步保持兼容
  - 表格空态插画化；表格行优先级/分类信息改为 flex 对齐
- 前后台筛选/分类/优先级/关键词逻辑不变

#### E. 可访问性与细节
- 键盘可达性：列表卡片 focus-visible 焦点环、折叠面板头焦点态、概览 chips 与分段按钮 aria-pressed、上传/发送按钮 aria-label、textarea aria-label
- 弹窗容器优化：前台详情弹窗加宽至 640px、后台加宽至 680px 并改用 modal-scroll 统一滚动高度；关闭按钮补齐 aria-label
- 动效尊重 `prefers-reduced-motion`；触控目标 ≥44px（折叠面板头/分段按钮/概览 chips）

#### F. 兼容性说明
- `css/tickets.css` 版本号升级为 `?v=20260824`（前后台引用同步更新），旧版 `.ticket-reply` 类名保留兜底样式防止缓存 DOM 裸奔
- 新增函数：`tkToggleCollapse` / `tkUpdateComposerCount` / `tkSetSending` / `tkScrollConversationToEnd` / `filterMyTickets` / `setAdminTicketStatusFilter` 等
- 移除渲染函数：`ticket-replies-title` 区块（合并入折叠面板体系）、旧版 `renderTicketReplies` 卡片结构（被 IM 气泡取代）

---

### 2026-08-23 · `v20260823` · 🏗️🎨 工单系统全面重构（前后端 + 共享模块）

针对工单模块"前后台逻辑重复、单行模板串拼接 HTML、内联样式泛滥、两套 CSS 各自为政"的技术债进行架构级重构，并补齐后端早已支持但前端缺失的实用功能。**API 响应结构与全局函数名 100% 向后兼容，notifications.js / orders.js / ui.js 零改动。**

#### A. 架构重构
- **新增 `js/tickets.js`（共享前端模块，前台 + 后台通用）**：
  - 常量映射单一数据源：`TICKET_STATUS` / `TICKET_PRIORITY` / `TICKET_CATEGORIES`（与后端 `commerceGetTicketCategories()` 对齐），提供 `ticketStatusLabel()` 等取值函数，消灭两侧散落的 pMap/catMap/三元表达式
  - 集中图标库 `ticketIcon(name)`：时钟/优先级/附件/发送等 SVG 统一管理，消除几十处重复内联 SVG
  - API 封装 `TicketApi`：my/detail/reply/close/create/all/stats/templates/approveRefund/uploadAttachment/listAttachments，统一错误处理；按页面路径自动识别前台/后台 API 基路径
  - 纯渲染函数：`renderTicketCard`（列表卡）/ `renderTicketRow`（后台表格行）/ `renderTicketHeader`（详情头部）/ `renderTicketReplies`（对话气泡，客服带角色标签）/ `renderTicketTimeline`（时间线）/ `renderTicketAttachments`（附件网格）/ `renderReplyComposer`（回复输入区）
  - 用户侧控制器：`loadMyTickets`（含状态统计概览条 + 空态引导创建）/ `showCreateTicket` / `submitTicket` / `showTicketDetail` / `replyTicket`（回复后局部刷新对话流）/ `closeTicket` / 附件上传
  - 管理侧控制器：`loadTickets`（支持筛选参数）/ `applyTicketFilters` / `resetTicketFilters` / `loadTicketStats` / `showAdminTicketDetail`（退款工单自动渲染审批卡片）/ `adminReplyTicket` / `adminCloseTicket` / `approveRefundTicket`
- **新增 `css/tickets.css`（共享样式，约 840 行）**：由 style.css 与 admin.css 中两套 `.ticket-*` 规则迁移合并去重，全部改用 variables.css 设计令牌（深浅双主题自适应）；新增优先级色点 `.tk-priority`、页头统计概览条 `.tk-overview`、后台筛选栏 `.tk-filter-bar`、骨架屏 `.tk-skeleton*`、空/错误态 `.tk-state`、快捷模板 chips `.tk-template-chip`、回复入场动画；移动端响应式与 `prefers-reduced-motion` 支持
- **后端拆分 `includes/TicketService.php`（服务层）**：api/tickets.php 的 12 个 action 全部业务逻辑迁入静态类方法（create / createRefundRequest / listMine / detail / reply / close / listAll / stats / adminList / assign / approveRefund / templates），内部私有辅助 findTicket / resolveActor / orderBelongsToUser / adminExists 复用 commerceRecordTicketEvent / createNotification / logAudit / commerceRefundOrder 等现有函数，不重复实现
- **`api/tickets.php` 瘦身重写（378 行 → 45 行）**：仅保留会话启动、依赖加载、CSRF 白名单、switch 分发与全局异常兜底
- **旧代码清理**：js/main.js 删除用户侧工单模块（176 行）；js/admin.js 删除管理侧工单模块（177 行）；css/style.css 删除工单段落（268 行）；css/admin.css 删除工单+退款审批段落（298 行），合计瘦身约 919 行重复代码

#### B. 新功能
- **后台工单筛选栏**：状态下拉 / 分类下拉 / 优先级下拉 / 关键词搜索框（回车触发）/ 一键重置——对接 `action=all` 既有筛选能力，此前前端完全未暴露
- **快捷回复模板**：打开后台工单详情时懒加载 `action=templates` 接口，回复框上方出现模板 chips，点击填入 textarea；接口不存在或为空时静默降级无感知
- **加载骨架屏**：工单列表与详情弹窗加载中显示 shimmer 动画骨架，替代空白
- **可重试错误态**：请求失败显示错误图标 + 重试按钮，替代静默失败
- **相对时间显示**：列表卡片与回复气泡统一走 `formatRelativeTime()`（悬浮 title 显示完整时间）

#### C. 界面 / 交互优化
- 全部 alert() 提示替换为项目统一的 showToast()；危险操作保留原生 confirm 二次确认
- 工单卡片增加悬停左侧渐变指示条与键盘焦点态（tabindex + Enter 触发）
- 回复气泡区分客服/用户配色，客服回复带「客服」角色徽标
- 回复输入区支持 Ctrl/Cmd + Enter 快捷发送（底部提示）
- 「我的工单」页头部新增状态统计概览条（待回复/已回复/已关闭/全部计数着色胶囊）
- 后台表格行内直接展示分类中文与优先级色点（原为原始 category 键名）

#### D. 缺陷修复
- **重复提交防护**：提交工单 / 回复 / 审批退款增加 submitting/refunding 标志位防抖
- **模板填入目标修复**：快捷回复 chips 点击后自动探测当前侧（前台 replyContent / 后台 adminReplyContent）textarea 填入
- **订单详情弹窗复用工单弹窗容器的兼容保障**：closeAdminTicketDetail 等容器函数迁移至共享模块，订单交付状态编辑功能不受影响

#### E. 文档与资源版本
- 前台 index.html 与后台 admin/index.html 引入新资源并将全部 CSS/JS 版本号升级为 `?v=20260823`
- README.md 目录结构与版本号同步更新

#### 验证
- 全部 JS 文件 `node --check` 通过（Node 24）；改动 PHP 文件 `php -l` 通过
- style.css / admin.css / tickets.css 大括号平衡校验通过；两份旧 CSS 的 diff 确认仅为预期删除块，无误伤
- admin/index.html 与 index.html div 开闭标签平衡校验通过
- 跨模块引用完整性检查：main.js / admin.js / notifications.js / orders.js / ui.js 中全部工单函数调用在 js/tickets.js 中均有对应定义

### 2026-08-22 · `v20260822b` · 🎨 登录回调页 UI 重构

重构 Linux DO OAuth 登录回调相关页面（登录成功 / 登录失败 / OAuth 未配置）的视觉与交互，统一为自包含的现代化设计。**纯展示层变更，授权流程、会话处理与业务逻辑零改动。**

#### A. 界面重构
- **api/oauth.php · 共享外壳**：新增 `renderOAuthPage()` 页面构建器，三态页面共用同一套内联样式——深靛夜空基底 + 多个缓慢漂移的模糊光晕背景、毛玻璃卡片（`backdrop-filter` + 细边框高光）、零外部依赖、移动端自适应（≤480px 按钮/卡片重排）、尊重 `prefers-reduced-motion` 关闭动画
- **api/oauth.php · 登录成功页（outputSuccess）**：🎉 emoji 替换为绿色描边动画对勾 SVG（stroke-dashoffset 描画动画）；新增品牌渐变高亮的用户名胶囊徽章与呼吸点「正在跳转…」提示；跳转行为完全保持不变（仍为 1.5 秒后自动返回 `../index.html`）
- **api/oauth.php · 登录失败页（outputError）**：😥 emoji 替换为珊瑚红警示 SVG；新增「错误详情」面板（长文本自动换行防溢出）；按钮由裸链接升级为统一胶囊样式（品牌渐变「重新登录」+ 幽灵「返回首页」）

#### B. 缺陷修复
- **api/oauth.php · OAuth 未配置提示**：`action=login` 在 Client ID / 回调地址未配置时原直接 `exit('OAuth2配置未完成，请联系管理员')` 输出纯文本，现替换为同风格完整 HTML 提示页 `outputNotConfigured()`（琥珀色盾牌图标 + 可能原因说明 + 返回首页按钮），并补齐 `Content-Type: text/html; charset=utf-8` 响应头

#### 验证
- 全部改动 PHP 文件 `php -l` 通过（PHP 8.3）；成功 / 失败 / 未配置三页渲染冒烟测试通过
- XSS 转义验证：恶意用户名与错误信息注入均被正确转义；HTML 结构完整（style/html 标签闭合、CSS 括号平衡）

### 2026-08-22 · `v20260822` · ✨📦 史诗级更新（合并 2026-08-21 之后全部变更）

今天完成自 2026-08-21 以来所有累积变更的**合并发布**，涵盖：前台 UI 全面重构、前台/后台头部导航重构、支付系统对齐《LD支付文档》、后台深浅模式适配、数据库维护交互优化、缓存策略调整，以及更新日志整体重构与文档同步。

---

#### A. 前台 UI 全面重构（原 v20260402）

前台 UI 全面重构，设计语言与后台 admin.css 统一（深色质感侧边栏 · 玻璃拟态弹窗 · 渐变主按钮）。**纯前端变更，API 契约与业务逻辑零改动。**

- **css/style.css（全量重写，2123 行 → 约 2965 行）**
  - 修复旧版多处损坏的 CSS 规则（`.header-inner` 内嵌套错乱、`.gap: 16px` 无效属性、选择器/大括号配对错误等）
  - 侧边栏改为恒定深色渐变质感（双主题一致），新增折叠按钮、激活项左侧渐变指示条
  - 弹窗升级为玻璃拟态遮罩 + 弹性入场动画，头部/底部吸附滚动
  - 主按钮统一品牌渐变 + 悬浮投影；卡片、徽章、规格块、工单、通知、分页等组件全面翻新
  - 新增：骨架屏、按钮 loading 态、页面切换入场动画、`prefers-reduced-motion` 支持
  - 新增顶栏用户下拉菜单 / 侧边栏用户卡片样式；补齐重构版 HTML 所需组件类
  - 响应式断点重排（1024 / 768 / 480），移动端体验优化
- **index.html（结构语义化重构）**
  - `<head>` 防主题闪烁内联脚本（默认深色）；Google Fonts 改为异步加载不阻塞渲染
  - 移除全部内联 `onclick` 导航，改用 `data-page` + Hash 路由锚点
  - 「我的订单」页升级为「我的账户」页（余额卡 + 流水卡栅格布局）
  - 首页公告区增加标题头；弹窗补充 aria-label / autocomplete
- **js/ui.js（功能增强）**
  - 新增 **Hash 路由**：`#buy`、`#orders` 等，刷新 / 前进后退保持当前页面，程序化切换同步地址栏
  - 抽离 `refreshPageData()` 页面级数据刷新（修复旧版仅 notifications 分支才刷新列表的逻辑缺陷）
  - 新增 ESC 一键关闭全部弹窗 / 抽屉；滚动监听改 passive 提升性能
- **js/main.js（局部升级）**：顶栏用户区域改为头像胶囊 + 下拉菜单；侧边栏底部用户信息卡片化；余额展示支持局部刷新
- **css/variables.css**：追加补充令牌（`--font-mono`、`--sidebar-w`、`--ease-spring`、`--shadow-primary` 等），向后兼容

---

#### B. 前台头部导航重构（原 v20260404）

前台顶栏结构、样式与交互重构：语义化三区布局 + 可点击面包屑 + 统一幽灵图标按钮。**纯前端变更，JS 契约（元素 ID 与全局函数）零改动。**

- **index.html（头部结构）**：头部改为语义化三区布局（左区：移动端菜单 + 面包屑 / 右区：主题切换 · 通知 · 用户）；「控制台 / 当前页」升级为真实 `<nav>` 面包屑，根节点可点击返回首页，当前页带 `aria-current="page"`；主题/通知按钮统一为 `.icon-btn`，补充 `type="button"`、`aria-controls`、`aria-haspopup` 等可访问性属性
- **css/style.css（头部样式重写）**：新增 `.header-left` / `.breadcrumb` / `.crumb` / `.crumb-sep` / `.icon-btn` 样式族；头部内容与页面容器对齐（`max-width: 1200px` 居中）；滚动后背景加深 + 投影；面包屑支持单层模式；图标按钮统一悬停/按压/键盘焦点反馈；移动端（≤768px）仅显示当前页标题、按钮缩至 38px
- **js/ui.js（面包屑联动）**：`switchPage()` 同步面包屑状态，主页切换单层模式
- **后续微调（同日）**：面包屑改为可横向滑动（隐藏滚动条 + 触摸平滑滚动 + `overscroll-behavior` 防滚动穿透）；未登录按钮文案「登录 / 注册」简化为「登录」；修正面包屑根节点与分隔符间距不对称（改用分隔符右侧补偿，弃用负外边距）；收紧面包屑间距（gap 6→4、内边距 6→4、分隔符补偿 6→4）

---

#### C. 后台头部导航同步前台样式（原 v20260405）

后台顶栏结构、样式与交互对齐前台重构版：毛玻璃 sticky 头部 + 幽灵图标按钮 + 头像胶囊下拉。**纯前端变更，业务逻辑零改动。**

- **admin/index.html（头部结构）**：头部改为与前台一致的三区布局；面包屑升级为 `<nav>` 结构（根节点「后台管理」可点击返回仪表盘）；主题/刷新/工单按钮统一为 `.icon-btn`；用户区域改为头像胶囊（`.user-menu-btn`）+ 下拉菜单（系统设置 / 退出登录）；移除固定悬浮汉堡按钮 `.menu-toggle`；内联脚本新增用户菜单箭头旋转同步、内容区滚动监听头部投影
- **css/admin.css（头部样式重写）**：`.top-header` 对齐前台 `.header`（毛玻璃背景 + 双主题适配 + 滚动加深投影）；新增 `.menu-btn` / `.breadcrumb` / `.crumb*` / `.icon-btn` / `.user-area-wrap` / `.user-menu-btn` / `.user-dropdown-divider` 样式族，移除旧 `.header-btn` / `.header-right` / `.user-avatar` 等系列；用户下拉菜单改为透明度 + 位移过渡，退出登录增加 danger 红色态；响应式（≤768px）适配
- **js/admin.js（兼容修复）**：点击外部关闭用户菜单的选择器由 `.user-dropdown`（已移除）改为 `#userMenuBtn`，并同步移除箭头 `open` 状态

---

#### D. 支付系统重构：对齐《LD支付文档》（原 v20260823）

依据《LD登录文档》与《LD支付文档》全面核对支付/登录链路，修复不符项并重构支付代码。

- **致命修复**
  - `api/notify.php` 语法错误：原文件第 85-87 行存在多余的 `}`，导致 `else` 分支解析失败——所有支付回调均会 fatal error，平台将无限重试回调
  - 回调验签与文档不符：文档 3.3 明确异步通知 `type` 固定 `epay`、`sign` 按 MD5 签名算法（pid+key）生成；原代码却按 `type=ldcpay` 走 Ed25519 公钥验签（该分支永远无法通过）。现已统一为 MD5 验签
- **支付 SDK 重构（includes/ldcpay.php）**
  - 统一网关常量 `LDCPAY_GATEWAY` 及各端点定义；凭证统一化 `ldcpay_get_credentials()`（pid=Client ID / key=Client Secret 双协议共用，LDC 配置缺失时回退 epay_pid/epay_key）
  - 官方接口签名（文档 1.3.1）：非空参数 ASCII 升序 + Client Secret 直接拼接 → Ed25519 → Base64；易支付签名（文档 2.4.2）：排除 sign/sign_type 的非空字段 ASCII 升序 + key → MD5 小写；均已用文档示例向量验证
  - 补齐此前被当作死代码删除的平台接口：订单查询（3.1）、商户分发（3.4，Basic Auth）、用户余额统计（3.5）
  - 工具函数：金额两位小数格式化、商品名 64 字符截断、URL 100 字符截断（notify_url/return_url 参与签名）
- **支付发起重构（api/pay.php）**：商品名改用下单快照 `product_name_snapshot`（商品删除后仍可正常发起支付）；易支付金额统一两位小数；回调地址按文档限制截断至 100 字符；协议自动选择逻辑收敛到 SDK，移除页面内重复的 MD5 签名实现
- **异步回调重构（api/notify.php）**：按文档 3.3 校验 `sign_type=MD5`、`type=epay`、`trade_status=TRADE_SUCCESS`；新增回调 `pid` 与商户配置一致性校验（防跨商户伪造通知）；新增幂等点 A（payment_requests 外部请求号状态行锁检查，同一请求号只入账一次）；恢复"重复回调交易号一致性检查"（防单号复用攻击）；移除无效的 notify_id 幂等逻辑；站内通知改为事务提交后发送
- **退款合规修复（includes/commerce.php）**：文档 3.2 平台仅支持全额退回（money 必须等于原金额）；可退金额不足以覆盖外部支付部分时自动转为全额退回站内余额；消除退款双实现，统一走 `epay_refund()`
- **新增管理员接口（api/ldcpay.php）**：`action=query` 订单查询 / `action=distribute` 商户积分分发（自动同步站内余额流水）/ `action=balance_stats` 平台余额统计；全部仅限管理员，写操作带 CSRF 校验并记录审计日志
- **登录核对结论（《LD登录文档》）**：api/oauth.php 授权流程、scope=user、state 防 CSRF、Bearer 取用户信息均与文档一致，未做改动
- **前端文案**："EasyPay 支付"→"积分支付"，支付方式显示"Linux DO Credit"；后台报表"EasyPay 订单"→"外部支付订单"

---

#### E. 后台主题适配 + 数据库维护优化 + 缓存策略调整（原 v20260824）

- **后台头部导航 / 侧边栏深浅模式适配**
  - `css/admin.css` 侧边栏双主题化：`.sidebar` 由写死深色渐变改为 `var(--bg-sidebar)`，边框/标题/菜单文字/悬停态/分组标题/页脚全部改用主题变量——浅色模式下侧边栏不再"黑一块"
  - Toast 双主题化：`.toast` 背景由写死 `#101a33` 改为 `var(--bg-card)` + `var(--text-main)` + `var(--border)`
  - 后台 4 个页面（admin/index.html、login.html、maintenance.html、setup.html）主题初始化逻辑与前台统一：默认深色，仅当 `localStorage.theme === 'light'` 时切浅色
  - 头部导航组件（`.top-header`、`.menu-btn`、`.breadcrumb`、`.icon-btn`、`.user-menu`、`.badge-dot` 等）核查确认走 CSS 变量，双主题正常
- **静态资源缓存破坏改为固定版本号**：移除后台 4 个页面的 `Date.now()` 自动缓存破坏，统一改为固定版本号 `?v=YYYYMMDD`；此后浏览器可强缓存 CSS/JS，后台「缓存管理」的清空操作重新有意义
- **数据库维护文案与交互优化（admin/maintenance.html）**：更新数据库改为"先检查、再确认、后执行"三段式——结构已完整直接提示无需更新、有缺失先弹窗列出新建表和补齐字段清单确认后才执行、执行后明确展示新增数据表/字段明细
- **接口文案中文化**：`api/audit_logs.php`「Unknown action」→「未知操作」；`includes/security.php`「CSRF token invalid」→「安全验证失败（CSRF Token 无效或已过期），请刷新页面后重试」

---

#### F. 后台面包屑中文标题修复（原 v20260825）

- **js/admin.js `tabTitles` 映射表补全**：原表缺少 `templates`（商品模板）、`credits`（积分管理）、`community`（社区规则）、`reports`（统计报表）4 个页面的中文标题，导致点击侧边栏对应菜单后，头部导航面包屑直接显示原始 tab 标识符而非中文。现已全部补齐，与侧边栏菜单文案一一对应

---

#### G. 前台侧边栏双主题适配（v20260822）

- **css/style.css 前台侧边栏双主题化**：`.sidebar` 由"恒定深色"改为跟随深浅主题自动切换，与后台 admin.css v20260824 的做法对齐
  - 移除 `.sidebar` 内部写死的深色局部变量（`--text-main/--text-light/--text-muted/--primary/--border/--bg-hover` 等）与 `linear-gradient(180deg, #101a33, #0b1226)` 恒定深色背景，改为继承全局主题令牌：浅色模式侧边栏为 `var(--bg-sidebar)` 白色卡片，深色模式通过 `.dark .sidebar` 保留原深色渐变质感（深色模式视觉零回归）
  - Logo、折叠按钮、分组标题、导航项（普通/悬停/激活）、页脚分隔线、底部用户卡片（`.sidebar-user-card` 名称/副标题）全部改用主题变量——浅色模式下侧边栏不再"黑一块"，文字/边框/悬停/激活态与页面主题一致
  - 主题切换由现有 `toggleTheme()`（`<html>` 上切换 `.dark` 类）驱动，无需改动 JS

---

#### H. 全面整理：文档同步 + 残留清理 + 更新日志重构

- **更新日志全面重构（本次）**：CHANGELOG.md 整体重写，新增「关于本文件 / 变更类型图例 / 版本速览 / 维护约定 / 版本号规则」章节；2026-08-21 及以前的历史条目全部简略化；原文件备份至 `.backup/CHANGELOG.before-rebuild-20260822.md`
- **README.md 文档同步**：版本号同步至 v20260822；功能一览补充 LDC Pay 平台管理接口、AI 智能生成、商品模板自动填充、双主题与响应式、数据库维护三段式等新能力；目录结构修正（api 文件数 27→28，补 `ai.php`；JS 体积更新为当前实际值）；静态资源缓存说明重写为固定版本号策略；新增「版本历史」小节
- **残留清理（api/update_db.php）**：`$csrfActions` 移除已删除但残留的 `migrate_admin_role`（死配置）；数据库「检查状态 / 更新数据库」返回的 `build` 版本号由过时的 `20260315i` 更新为 `20260822`
- **前端修正（js/admin.js）**：`migrateLinuxDOFields()` 成功提示原读取不存在的 `data.data.added` 字段，修正为按实际返回字段（`created` / `migrated`）统计并展示新增内容
- **静态资源版本号统一**：前台 `index.html`、后台 `admin/index.html`、`login.html` / `maintenance.html` / `setup.html` / `install.html` 全部资源统一为 `?v=20260822`

---

#### I. 验证

- 全部改动 PHP 文件 `php -l` 通过（PHP 8.3）；全部 JS 文件 `node --check` 通过（Node 24）
- MD5 / Ed25519 签名算法单元测试 12 项全部通过（含文档原始示例向量）；Ed25519 密钥格式兼容（Base64 seed / Hex seed）、sodium/OpenSSL 双路径交叉验证
- 前台/后台所有页面资源引用均指向实际存在的文件
- 安装向导、管理员恢复模式保护、CSRF、限流、支付验签（MD5）、防超卖、优惠券占用/核销、余额流水、审计日志均实测正常

---

## 历史版本摘要

> 以下为 **2026-08-21 及以前**的版本记录（均已简略化，一行一条）。
> 按整理要求，历史条目的发布日期统一归并为发布日 **2026-08-22**；详细变更内容已归档于 `.backup/CHANGELOG.before-rebuild-20260822.md`。

| 发布日期 | 版本号 | 类型 | 摘要 |
|----------|--------|------|------|
| 2026-08-22 | v20260821 | 🐛 | 全链路端到端 Debug：`api/notifications.php` 缺少 include、`api/notify.php` 事务内 DDL、`api/update_db.php` 快照回填与数值列不兼容（3 项致命修复） |
| 2026-08-22 | v20260802 | 🧹 | 代码瘦身：清除死代码与未使用的 API action（删除 Enum/DTO/Service 等 11 个文件、11 个 API action、若干冗余函数） |
| 2026-08-22 | v20260523 | ⚙️ | PHP 8.0 回退兼容：Enum→常量、readonly class→class（12 个文件，保留 PHP 8.0 特性） |
| 2026-08-22 | v20260523 | 🏗️ | PHP 8.2 编码规范优化：新增 Enum / DTO / Service / AppConfig，20 个 API 文件 switch→match（37 个文件） |
| 2026-08-22 | v20260523 | ✨ | 商品管理增强：模板选择自动填充、AI 智能生成商品配置（api/ai.php）、快捷预设 datalist、工单 UI 优化 |
| 2026-08-22 | v20260418 | 🛡️ | 安全修复与私有配置化：config.php 改加载器、安装器写 config.local.php、OAuth Secret 回归私有配置、管理员恢复模式收紧 |
| 2026-08-22 | v20260405 | 🛡️ | 安装流程修复 + 新增管理员恢复模式（默认关闭，仅本机执行，多重保护） |
| 2026-08-22 | v20260403 | 🏗️ | 代码瘦身与 JS 模块化重构：main.js/admin.js 拆分为 6 模块、API 层减约 250 行、Emoji→SVG、两轮 Debug 修复 |
| 2026-08-22 | v20260315 | ✨ | 功能大版本：站内余额钱包与余额支付、商品模板、Linux DO 社区规则、工单增强、通知升级、统计报表、退款扩展、订单快照 |
| 2026-08-22 | v20260314 | 🛠️ | 安装兼容与依赖兜底：OPcache 旧配置、mbstring / curl 缺失兜底、UTF-8 兼容函数 |
| 2026-08-22 | v20260224 | 🛠️ | 安装向导重构（三步式）与基础修复（订单号碰撞、通知已读、轮询清理等） |
| 2026-08-22 | v20260126 | 🔍 | 全面代码审计与修复：参数校验、异常处理、响应格式、权限验证、整体结构整理 |
| 2026-08-22 | v20260125 | 🛡️ | 安全与稳定性增强：CSRF 防护、登录/敏感接口限流、审计日志、错误日志、敏感字段加密、退款状态化 |
| 2026-08-22 | v20260116 | 🎟️ | 优惠券系统上线：固定/百分比折扣、最低消费、次数限制、有效期、占用/核销/释放全链路 |
| 2026-08-22 | v20260109 | 🛠️ | 安装 / 维护一致性修复：表结构检查与注释对齐，文档同步 |
| 2026-08-22 | v20250702 | ⚙️ | 后台管理系统优化：超级管理员 / 普通管理员权限区分、界面美化、仪表盘增强、迁移流程 |
| 2026-08-22 | v20250604 | ✨ | 工单系统与公告系统上线 |
| 2026-08-22 | v20250603 | 🔐 | 登录系统重构：首页统一识别管理员与用户登录入口，管理员快捷返回后台 |
| 2026-08-22 | v20250602 | 🐛 | 退款功能修复：商品删除后已支付订单仍可退款 |
| 2026-08-22 | v20250601 | ⚡ | 浏览器缓存方案：静态资源统一版本号参数，降低旧资源残留 |

---

## 维护约定

为保持本日志的可读性与一致性，**每次发布新版本**时请按以下约定追加记录：

1. 在「详细更新记录」顶部（最新在上）插入新条目；
2. 条目标题统一使用格式：`### YYYY-MM-DD · \`v版本号\` · 类型标签 标题`；
3. 正文按「变更分类」组织，使用二级小标题（如 `#### A. 新功能 / 缺陷修复 / 安全加固 / 界面优化 / 验证`）；
4. 每个变更点用 `- **文件路径**：说明` 的列表形式描述，指向具体文件与改动；
5. 涉及数据库变更时，务必在条目中注明升级方式（后台「数据库维护 → 更新数据库」）；
6. 涉及静态资源时，同步提升页面 `?v=` 版本号；
7. 发布完成后，同步更新「版本速览」表与 README.md 的版本号。

### 新条目模板

```markdown
### YYYY-MM-DD · `vYYYYMMDD` · ✨ 标题

概述：一句话说明本次发布的目的与范围。

#### A. 新功能
- **路径**：说明

#### B. 缺陷修复
- **路径**：现象 / 根因 / 修复

#### 验证
- 全部改动 PHP 文件 `php -l` 通过；JS 文件 `node --check` 通过
```

---

## 版本号规则

- **格式**：`vYYYYMMDD`（如 `v20260822`），取发布当天的日期，同一天多次发布可追加后缀（如 `v20260822b`）；
- **合并发布**：多个内部版本号的变更可合并为一次发布（如 v20260822 合并了原 v20260402~v20260825 的全部内容）；
- **历史条目**：2026-08-21 及以前的版本按原记录保留版本号，发布日期统一归并为史诗级更新发布日；
- **数据库构建版本**：`api/update_db.php` 返回的 `build` 字段与主版本号保持一致，后台「数据库维护」页面可查看。