// ==================== 公共工具模块 ====================
// 被 main.js 和 admin.js 共同使用的基础函数

// 统一的未登录提示渲染
// @param {string} hint  - 提示文案，例如"查看可购买配置"
// @param {object} [opts] - 可选配置
//   opts.icon    - 图标类型: 'user'(默认) | 'cart' | 'ticket' | 'bell' | 'server' | 'order'
//   opts.sub     - 二级说明文字
//   opts.compact - 紧凑模式（用于面板内嵌等）
// @returns {string} HTML 字符串
function renderLoginRequired(hint, opts) {
  var o = opts || {};
  var iconType = o.icon || 'user';
  var sub = o.sub || '';
  var compact = !!o.compact;

  var iconMap = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/><path d="M2 2l20 20" stroke-opacity="0.35"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    ticket: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    order: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
  };

  var svgInner = iconMap[iconType] || iconMap.user;
  var iconSize = compact ? 36 : 44;
  var wrapCls = compact ? 'login-required-card login-required-compact' : 'login-required-card';

  var html = '<div class="' + wrapCls + '">';
  html += '<div class="login-required-icon">';
  html += '<svg viewBox="0 0 24 24" width="' + iconSize + '" height="' + iconSize + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + svgInner + '</svg>';
  html += '</div>';
  html += '<p class="login-required-hint">' + escapeHtml(hint || '查看此内容') + '</p>';
  if (sub) {
    html += '<p class="login-required-sub">' + escapeHtml(sub) + '</p>';
  }
  html += '<div class="login-required-actions">';
  html += '<button class="btn btn-primary login-required-btn" onclick="showLogin()">立即登录</button>';
  html += '<button class="btn btn-outline login-required-btn-secondary" onclick="showRegister()">注册账号</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

let csrfToken = "";

// CSRF Token 初始化
function initCsrfToken(apiBase = "") {
  return window
    .fetch(apiBase + "api/csrf.php", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1 && data.data && data.data.token) {
        csrfToken = data.data.token;
      }
    })
    .catch(() => {});
}

// 统一请求封装（自动附加 CSRF Token + 缓存破坏）
function apiFetch(url, options = {}) {
  const opts = { credentials: "same-origin", cache: "no-store", ...options };
  const method = (opts.method || "GET").toUpperCase();
  const ensureToken =
    !csrfToken && method !== "GET" && method !== "HEAD"
      ? initCsrfToken(window.__apiBase || "")
      : Promise.resolve();
  return ensureToken.then(() => {
    const headers = new Headers(opts.headers || {});
    if (csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    let requestUrl = url;
    if (method === "GET" && typeof requestUrl === "string") {
      requestUrl +=
        (requestUrl.indexOf("?") >= 0 ? "&" : "?") + "_ts=" + Date.now();
    }
    opts.headers = headers;
    return window.fetch(requestUrl, opts);
  });
}

// XSS 防护：HTML 转义
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Toast 提示（前台 / 后台通用）
function showToast(msg) {
  let t = document.getElementById("globalToast");
  if (!t) {
    // 前台已有 id="toast" 则沿用
    t = document.getElementById("toast") || document.getElementById("adminToast");
  }
  if (!t) {
    t = document.createElement("div");
    t.id = "globalToast";
    t.className = "toast";
    t.style.cssText =
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;opacity:0;transition:opacity 0.3s";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  // 兼容前台 .show 类名 和 后台 opacity 方式
  t.classList.add("show");
  t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove("show");
    t.style.opacity = "0";
  }, 2500);
}

// 一键复制
function copyToClipboard(text, btn) {
  const doCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return Promise.resolve();
  };
  doCopy()
    .then(() => {
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = "已复制";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove("copied");
        }, 1500);
      }
      showToast("复制成功");
    })
    .catch(() => showToast("复制失败"));
}

// 通用分页渲染器
// @param {string}   containerId  - 分页控件的 ID（会自动创建/替换）
// @param {number}   current      - 当前页码
// @param {number}   total        - 总页数
// @param {string}   callback     - 翻页回调函数名
// @param {Element}  [anchor]     - 插入到该元素内部末尾（appendChild）
// @param {number}   [totalCount] - 总条数（可选，显示"共 N 条"）
function renderPaginationWidget(containerId, current, total, callback, anchor, totalCount) {
  removePaginationWidget(containerId);
  if (total <= 1) return;

  let pages = [];
  const delta = 2;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  const wrapper = document.createElement("div");
  wrapper.className = "pagination-widget";
  wrapper.id = containerId;

  let html = '';
  if (totalCount !== undefined) {
    html += `<span class="pagination-info">共 ${totalCount} 条，第 ${current} / ${total} 页</span>`;
  }
  html += `<div class="pagination-btns">`;
  html += `<button class="pagination-btn" ${current <= 1 ? "disabled" : ""} onclick="${callback}(${current - 1})">`;
  html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  html += `</button>`;
  pages.forEach((p) => {
    if (p === "...") {
      html += '<span class="pagination-dots">…</span>';
    } else {
      html += `<button class="pagination-btn ${p === current ? "active" : ""}" onclick="${callback}(${p})">${p}</button>`;
    }
  });
  html += `<button class="pagination-btn" ${current >= total ? "disabled" : ""} onclick="${callback}(${current + 1})">`;
  html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  html += `</button>`;
  html += `</div>`;

  wrapper.innerHTML = html;

  if (anchor) {
    anchor.appendChild(wrapper);
  } else {
    document.body.appendChild(wrapper);
  }
}

function removePaginationWidget(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// 格式化相对时间
function formatRelativeTime(datetime) {
  if (!datetime) return "";
  const date = new Date(datetime);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + "分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + "小时前";
  if (diff < 604800) return Math.floor(diff / 86400) + "天前";
  return date.toLocaleDateString();
}
