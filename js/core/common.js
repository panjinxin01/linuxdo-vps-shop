// ==================== 公共工具模块 ====================
// 被前台与后台共同使用的基础函数（含非阻塞 Toast、确认弹窗、输入弹窗、一键复制）

// 统一图标库（Lucide 24x24 描边风格，前后台及工单模块共用）
var APP_ICONS = {
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  "user-off": '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="2" y1="2" x2="22" y2="22" stroke-opacity="0.4"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  ticket: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  order: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  "x-circle": '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  "chevron-left": '<polyline points="15 18 9 12 15 6"/>',
  "chevron-right": '<polyline points="9 18 15 12 9 6"/>',
  "chevron-down": '<polyline points="6 9 12 15 18 9"/>',
  "rotate-cw": '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  "refresh-cw": '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  headset: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
};

function appIcon(name, size, opts) {
  var o = typeof opts === "number" ? { strokeWidth: opts } : (opts || {});
  var inner = APP_ICONS[name] || "";
  var w = o.strokeWidth || 2;
  var attrs = 'viewBox="0 0 24 24"';
  if (size !== null && size !== undefined) {
    attrs += ' width="' + size + '" height="' + size + '"';
  }
  if (o.className) attrs += ' class="' + o.className + '"';
  attrs += ' fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"';
  if (o.style) attrs += ' style="' + o.style + '"';
  if (o.ariaHidden !== false) attrs += ' aria-hidden="true"';
  return "<svg " + attrs + ">" + inner + "</svg>";
}

// 统一的未登录提示渲染
function renderLoginRequired(hint, opts) {
  var o = opts || {};
  var iconType = o.icon || "user";
  var sub = o.sub || "";
  var compact = !!o.compact;
  var iconKey = iconType === "user" ? "user-off" : (APP_ICONS[iconType] ? iconType : "user-off");
  var iconSize = compact ? 36 : 44;
  var wrapCls = compact ? "login-required-card login-required-compact" : "login-required-card";

  var html = '<div class="' + wrapCls + '">';
  html += '<div class="login-required-icon">';
  html += appIcon(iconKey, iconSize, { strokeWidth: 1.5 });
  html += "</div>";
  html += '<p class="login-required-hint">' + escapeHtml(hint || "查看此内容") + "</p>";
  if (sub) {
    html += '<p class="login-required-sub">' + escapeHtml(sub) + "</p>";
  }
  html += '<div class="login-required-actions">';
  html += '<button class="btn btn-primary login-required-btn" onclick="showLogin()">登录</button>';
  html += "</div>";
  html += "</div>";
  return html;
}

let csrfToken = "";
let csrfInitPromise = null;

// CSRF Token 初始化（去重并发请求）
function initCsrfToken(apiBase = "", force = false) {
  if (csrfInitPromise && !force) return csrfInitPromise;
  const base = apiBase || window.__apiBase || "";

  const p = window
    .fetch(base + "api/csrf.php?_ts=" + Date.now(), {
      credentials: "same-origin",
      cache: "no-store",
    })
    .then((res) => {
      return res.json();
    })
    .then((data) => {
      if (data && data.code === 1 && data.data && data.data.token) {
        csrfToken = data.data.token;
      }
      return csrfToken;
    })
    .catch(() => "")
    .finally(() => {
      if (csrfInitPromise === p) csrfInitPromise = null;
    });

  csrfInitPromise = p;
  return p;
}

// 统一请求封装（自动附加 CSRF Token + CSRF 失效自动刷新重试一次）
function apiFetch(url, options = {}) {
  const opts = { credentials: "same-origin", cache: "no-store", ...options };
  const method = (opts.method || "GET").toUpperCase();
  const needCsrf = method !== "GET" && method !== "HEAD";
  const ensureToken = !csrfToken && needCsrf
    ? initCsrfToken(window.__apiBase || "")
    : csrfInitPromise
      ? csrfInitPromise
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
    return window.fetch(requestUrl, opts).then((res) => {
      if (needCsrf && !opts._csrfRetried) {
        return res
          .clone()
          .json()
          .then((payload) => {
            if (
              payload &&
              payload.code === 0 &&
              typeof payload.msg === "string" &&
              payload.msg.indexOf("CSRF") !== -1
            ) {
              return initCsrfToken(window.__apiBase || "", true).then(() => {
                const retryHeaders = new Headers(options.headers || {});
                if (csrfToken) retryHeaders.set("X-CSRF-Token", csrfToken);
                return apiFetch(url, {
                  ...options,
                  headers: retryHeaders,
                  _csrfRetried: true,
                });
              });
            }
            return res;
          })
          .catch(() => res);
      }
      return res;
    });
  });
}

// XSS 防护：HTML 转义
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 非阻塞 Toast 通知栈 ====================
function ensureToastStack() {
  let stack = document.getElementById("globalToastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "globalToastStack";
    stack.className = "global-toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(msg, type) {
  if (!msg) return;
  const text = String(msg);
  let resolvedType = type;
  if (!resolvedType) {
    if (/(成功|已复制|已保存|已完成|已更新|已清空|已调整|已标记|已关闭|已删除|已刷新|已生成|已提交)/.test(text)) {
      resolvedType = "success";
    } else if (/(失败|错误|异常|不足|不可|无效|不存在|不能为空|请填写|请选择|拒绝|超限|未配置)/.test(text)) {
      resolvedType = "error";
    } else if (/(提示|注意|稍候|审核)/.test(text)) {
      resolvedType = "warning";
    } else {
      resolvedType = "info";
    }
  }

  const icons = {
    success: appIcon("check", 16),
    error: appIcon("x-circle", 16),
    warning: appIcon("alert-triangle", 16),
    info: appIcon("info", 16),
  };

  const stack = ensureToastStack();
  while (stack.children.length >= 4) {
    stack.removeChild(stack.firstChild);
  }

  const toast = document.createElement("div");
  toast.className = "global-toast toast-" + resolvedType;
  toast.innerHTML =
    '<span class="global-toast-icon">' + (icons[resolvedType] || icons.info) + "</span>" +
    '<span class="global-toast-msg">' + escapeHtml(text) + "</span>" +
    '<button type="button" class="global-toast-close" aria-label="关闭">&times;</button>';

  const removeToast = () => {
    if (!toast.parentNode) return;
    toast.classList.remove("show");
    toast.classList.add("leaving");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };

  toast.querySelector(".global-toast-close").addEventListener("click", removeToast);
  stack.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  setTimeout(removeToast, resolvedType === "error" ? 3800 : 2800);
}

// ==================== 非阻塞确认弹窗（替代 confirm） ====================
function showConfirmModal(options) {
  const opts = typeof options === "string" ? { message: options } : (options || {});
  const title = opts.title || "确认操作";
  const message = opts.message || "确定继续执行该操作吗？";
  const confirmText = opts.confirmText || "确认";
  const cancelText = opts.cancelText || "取消";
  const danger = !!opts.danger;

  return new Promise((resolve) => {
    let overlay = document.getElementById("globalConfirmOverlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "globalConfirmOverlay";
    overlay.className = "modal-bg global-dialog-bg show";
    overlay.innerHTML = `
      <div class="modal global-confirm-modal" role="dialog" aria-modal="true" style="max-width: 440px">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="modal-close" data-act="cancel" aria-label="关闭">&times;</button>
        </div>
        <div class="modal-body">
          <div class="global-confirm-body">
            <div class="global-confirm-icon ${danger ? "danger" : "primary"}">
              ${danger ? appIcon("alert-triangle", 20) : appIcon("info", 20)}
            </div>
            <div class="global-confirm-text">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = (result) => {
      document.removeEventListener("keydown", onKey);
      overlay.classList.remove("show");
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 160);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(false);
    };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
    overlay.querySelectorAll('[data-act="cancel"]').forEach((btn) => btn.addEventListener("click", () => cleanup(false)));
    const confirmBtn = overlay.querySelector('[data-act="confirm"]');
    confirmBtn.addEventListener("click", () => cleanup(true));
    setTimeout(() => confirmBtn.focus(), 20);
  });
}

// ==================== 非阻塞输入弹窗（替代 prompt） ====================
function showPromptModal(options) {
  const opts = options || {};
  const title = opts.title || "输入信息";
  const label = opts.label || "";
  const message = opts.message || "";
  const placeholder = opts.placeholder || "";
  const defaultValue = opts.defaultValue !== undefined ? String(opts.defaultValue) : "";
  const inputType = opts.inputType || "text";
  const confirmText = opts.confirmText || "确定";
  const cancelText = opts.cancelText || "取消";
  const required = opts.required !== false;

  return new Promise((resolve) => {
    let overlay = document.getElementById("globalPromptOverlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "globalPromptOverlay";
    overlay.className = "modal-bg global-dialog-bg show";
    overlay.innerHTML = `
      <div class="modal global-confirm-modal" role="dialog" aria-modal="true" style="max-width: 460px">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="modal-close" data-act="cancel" aria-label="关闭">&times;</button>
        </div>
        <div class="modal-body">
          ${message ? `<p class="global-prompt-desc">${escapeHtml(message).replace(/\n/g, "<br>")}</p>` : ""}
          <div class="form-group" style="margin-bottom:0">
            ${label ? `<label>${escapeHtml(label)}</label>` : ""}
            <input type="${escapeHtml(inputType)}" id="globalPromptInput" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />
            <div class="global-prompt-err" id="globalPromptErr"></div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn btn-primary" data-act="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#globalPromptInput");
    const errEl = overlay.querySelector("#globalPromptErr");

    const cleanup = (val) => {
      document.removeEventListener("keydown", onKey);
      overlay.classList.remove("show");
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 160);
      resolve(val);
    };
    const submit = () => {
      const val = input.value;
      if (required && !val.trim()) {
        errEl.textContent = "请填写内容后再提交";
        input.focus();
        return;
      }
      cleanup(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(null);
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(null);
    });
    overlay.querySelectorAll('[data-act="cancel"]').forEach((btn) => btn.addEventListener("click", () => cleanup(null)));
    overlay.querySelector('[data-act="confirm"]').addEventListener("click", submit);
    setTimeout(() => { input.focus(); input.select(); }, 20);
  });
}

// ==================== 一键复制（保留图标与平滑状态恢复） ====================
function copyToClipboard(text, btn, toastMsg) {
  const str = String(text === undefined || text === null ? "" : text);
  if (!str) {
    showToast("暂无可复制内容", "warning");
    return;
  }
  const doCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(str).catch(() => fallbackCopy(str));
    }
    return fallbackCopy(str);
  };
  const fallbackCopy = (val) => {
    const textarea = document.createElement("textarea");
    textarea.value = val;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(textarea);
    return ok ? Promise.resolve() : Promise.reject(new Error("copy_failed"));
  };

  doCopy()
    .then(() => {
      if (btn) {
        if (!btn.dataset.origHtml) {
          btn.dataset.origHtml = btn.innerHTML;
        }
        clearTimeout(btn._copyTimer);
        btn.classList.add("copied");
        btn.setAttribute("data-copied", "1");
        btn.innerHTML = appIcon("check", 13) + "<span>已复制</span>";
        btn._copyTimer = setTimeout(() => {
          btn.innerHTML = btn.dataset.origHtml;
          btn.classList.remove("copied");
          btn.removeAttribute("data-copied");
        }, 1600);
      }
      showToast(toastMsg || "已复制到剪贴板", "success");
    })
    .catch(() => showToast("复制失败，请手动选中复制", "error"));
}

// 通用分页渲染器
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

  let html = "";
  if (totalCount !== undefined) {
    html += `<span class="pagination-info">共 ${totalCount} 条，第 ${current} / ${total} 页</span>`;
  }
  html += `<div class="pagination-btns">`;
  html += `<button class="pagination-btn" ${current <= 1 ? "disabled" : ""} onclick="${callback}(${current - 1})">`;
  html += appIcon("chevron-left", 14);
  html += `</button>`;
  pages.forEach((p) => {
    if (p === "...") {
      html += '<span class="pagination-dots">…</span>';
    } else {
      html += `<button class="pagination-btn ${p === current ? "active" : ""}" onclick="${callback}(${p})">${p}</button>`;
    }
  });
  html += `<button class="pagination-btn" ${current >= total ? "disabled" : ""} onclick="${callback}(${current + 1})">`;
  html += appIcon("chevron-right", 14);
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