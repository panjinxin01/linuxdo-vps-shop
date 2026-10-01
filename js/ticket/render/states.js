/* =====================================================
   渲染：骨架屏 / 错误态 / 插画化空状态
   来源：js/tickets.js
   ===================================================== */
function renderTicketSkeletonList(count) {
  var n = count || 4;
  var html = "";
  for (var i = 0; i < n; i++) {
    html +=
      '<div class="tk-skeleton-card">' +
        '<div class="tk-skeleton tk-skeleton-line w60"></div>' +
        '<div class="tk-skeleton tk-skeleton-line w40"></div>' +
      "</div>";
  }
  return html;
}

/* 详情骨架：模拟 IM 头像+气泡布局，加载时不跳动 */
function renderTicketSkeletonDetail() {
  var line = function (w) {
    return '<div class="tk-skeleton tk-skeleton-line ' + w + '"></div>';
  };
  var msgLeft = function (w) {
    return (
      '<div class="tk-skeleton-msg">' +
        '<div class="tk-skeleton tk-skeleton-avatar"></div>' +
        '<div style="flex:1;max-width:70%;display:flex;flex-direction:column;gap:6px">' + line(w) + "</div>" +
      "</div>"
    );
  };
  var msgRight = function (w) {
    return (
      '<div class="tk-skeleton-msg is-right">' +
        '<div class="tk-skeleton tk-skeleton-avatar"></div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:55%">' + line(w) + "</div>" +
      "</div>"
    );
  };
  return (
    '<div style="display:flex;flex-direction:column;gap:16px;padding:8px 0">' +
      line("w40 tall") +
      msgLeft("w80") +
      msgRight("w60") +
      msgLeft("w80") +
      msgRight("w40") +
    "</div>"
  );
}

function renderTicketErrorState(containerId, message) {
  return (
    '<div class="tk-state is-error">' +
      '<span class="tk-state-icon">' + ticketIcon("alert", 24, 1.5) + "</span>" +
      "<p>" + escapeHtml(message || "加载失败，请检查网络后重试") + "</p>" +
      '<button class="tk-state-retry" onclick="' + containerId + 'Retry()">重试</button>' +
    "</div>"
  );
}

/* 插画化空状态：信封 + 对话气泡组合图形（纯 SVG，随主题着色） */
function renderTkEmptyArt(opts) {
  var o = opts || {};
  var art =
    '<svg class="tk-empty-art" viewBox="0 0 128 92" fill="none" aria-hidden="true">' +
      /* 背景装饰气泡 */
      '<rect class="art-soft" x="78" y="8" width="42" height="26" rx="8"/>' +
      '<circle class="art-soft" cx="90" cy="21" r="2.4" fill="currentColor"/>' +
      '<circle class="art-soft" cx="99" cy="21" r="2.4" fill="currentColor"/>' +
      '<circle class="art-soft" cx="108" cy="21" r="2.4" fill="currentColor"/>' +
      /* 信封主体 */
      '<rect x="18" y="30" width="72" height="48" rx="8" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
      '<path class="art-accent" d="M20 36 L54 58 L88 36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      /* 前景小气泡（品牌色点缀） */
      '<rect class="art-accent" x="86" y="52" width="34" height="22" rx="7" fill="currentColor" opacity="0.18"/>' +
      '<path class="art-accent" d="M96 74 L92 82 L102 76 Z" fill="currentColor"/>' +
    "</svg>";
  return (
    '<div class="tk-empty">' +
      art +
      '<p class="tk-empty-title">' + escapeHtml(o.title || "暂无内容") + "</p>" +
      '<p class="tk-empty-sub">' + escapeHtml(o.sub || "") + "</p>" +
      (o.actionHtml || "") +
    "</div>"
  );
}

