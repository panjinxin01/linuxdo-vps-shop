// ==================== 公共工具模块 ====================
// 被 main.js 和 admin.js 共同使用的基础函数

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
// @param {string}   containerId  - 分页容器 ID（会自动创建/替换）
// @param {number}   current      - 当前页码
// @param {number}   total        - 总页数
// @param {string}   callback     - 翻页回调函数名
// @param {Element}  [anchor]     - 插入锚点元素（afterend），不传则替换容器
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

  let html = `<div class="admin-pagination" id="${containerId}">`;
  if (totalCount !== undefined) {
    html += `<span class="page-info">共${totalCount} 条，第${current}/${total} 页</span>`;
  }
  html += `<div class="page-btns">`;
  html += `<button class="page-btn" ${current <= 1 ? "disabled" : ""} onclick="${callback}(${current - 1})">上一页</button>`;
  pages.forEach((p) => {
    if (p === "...") {
      html += '<span class="page-dots">...</span>';
    } else {
      html += `<button class="page-btn ${p === current ? "active" : ""}" onclick="${callback}(${p})">${p}</button>`;
    }
  });
  html += `<button class="page-btn" ${current >= total ? "disabled" : ""} onclick="${callback}(${current + 1})">下一页</button>`;
  html += `</div></div>`;

  if (anchor) {
    anchor.insertAdjacentHTML("afterend", html);
  } else {
    // fallback: 追加到 body
    document.body.insertAdjacentHTML("beforeend", html);
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
