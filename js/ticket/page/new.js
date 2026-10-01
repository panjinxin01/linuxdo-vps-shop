/* =====================================================
   发起新工单页（v20260825 页面化）
   来源：js/tickets.js
   ===================================================== */
/* =====================================================
   12. 用户侧页面控制器（前台 #ticket-new / #ticket-view）
   ===================================================== */

/* 订单选项加载（新建页关联订单下拉） */
function tkLoadOrderOptions(sel, orderId) {
  if (!sel) return;
  sel.innerHTML = '<option value="">加载订单中...</option>';
  apiFetch(TicketApi._base + "orders.php?action=my&page_size=100")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      sel.innerHTML = '<option value="">不关联订单</option>';
      if (data.code === 1 && data.data && data.data.list) {
        data.data.list.forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o.id;
          opt.textContent = (o.order_no || "订单#" + o.id) + " - " + (o.product_name || "商品已删除");
          sel.appendChild(opt);
        });
      }
      if (orderId) sel.value = String(orderId);
    })
    .catch(function () { sel.innerHTML = '<option value="">不关联订单</option>'; });
}

/* 发起新工单页 */
function renderTicketNewFormHtml() {
  var cats = "", pris = "";
  for (var i = 0; i < TICKET_CATEGORY_ORDER.length; i++) {
    var k = TICKET_CATEGORY_ORDER[i];
    cats += '<option value="' + k + '"' + (k === "other" ? " selected" : "") + ">" + escapeHtml(TICKET_CATEGORIES[k]) + "</option>";
  }
  for (var p = 0; p < TICKET_PRIORITY.length; p++) {
    pris += '<option value="' + p + '"' + (p === 1 ? " selected" : "") + ">" + TICKET_PRIORITY[p] + "</option>";
  }
  return (
    '<div class="tk-new-form">' +
      '<button type="button" class="tk-back-link" onclick="location.hash=\'#tickets\'">← 返回工单列表</button>' +
      '<div class="tk-md-hint">' + ticketIcon("file", 18, 1.6) +
        "<div><strong>支持 Markdown 排版：</strong>可用 <code>**加粗**</code>、<code>*斜体*</code>、<code>`代码`</code>、<code>&gt; 引用</code>、<code>- 列表</code>；点击工具栏「图片」可附上截图，随工单提交后自动保存为附件。</div>" +
      "</div>" +
      '<div class="card" style="padding:22px;display:flex;flex-direction:column;gap:16px">' +
        '<div class="form-group" style="margin:0"><label for="tkNewTitle">标题 <span style="color:var(--danger)">*</span></label>' +
          '<input type="text" id="tkNewTitle" placeholder="简要概括你遇到的问题" /></div>' +
        '<div class="form-row-2col" style="margin:0">' +
          '<div class="form-group" style="margin:0"><label for="tkNewCategory">分类</label><select id="tkNewCategory">' + cats + "</select></div>" +
          '<div class="form-group" style="margin:0"><label for="tkNewPriority">优先级</label><select id="tkNewPriority">' + pris + "</select></div>" +
        "</div>" +
        '<div class="form-group" style="margin:0"><label for="tkNewOrder">关联订单（可选）</label><select id="tkNewOrder"><option value="">不关联订单</option></select></div>' +
        '<label class="tk-check-urgent"><input type="checkbox" id="tkNewUrgent" onchange="tkToggleUrgent(this)" /><span>标记为紧急（服务完全不可用等严重故障）</span></label>' +
        '<div class="tk-compose-stack">' +
          '<div class="tk-toolbar" role="toolbar" aria-label="内容格式工具栏">' +
            '<button type="button" class="tk-tool-btn" title="加粗" aria-label="加粗" onclick="tkMdWrap(\'tkNewContent\',\'**\',\'**\')"><b>B</b></button>' +
            '<button type="button" class="tk-tool-btn" title="斜体" aria-label="斜体" onclick="tkMdWrap(\'tkNewContent\',\'*\',\'*\')"><i>I</i></button>' +
            '<button type="button" class="tk-tool-btn" title="行内代码" aria-label="行内代码" onclick="tkMdWrap(\'tkNewContent\',\'`\',\'`\')">' + ticketIcon("code", 13) + "</button>" +
            '<span class="tk-tool-sep"></span>' +
            '<button type="button" class="tk-tool-btn" title="引用" aria-label="引用" onclick="tkMdLines(\'tkNewContent\',\'> \')">❝</button>' +
            '<button type="button" class="tk-tool-btn" title="无序列表" aria-label="无序列表" onclick="tkMdLines(\'tkNewContent\',\'- \')">' + ticketIcon("list", 13) + "</button>" +
            '<span class="tk-tool-sep"></span>' +
            '<button type="button" class="tk-tool-btn" title="插入链接" aria-label="插入链接" onclick="tkMdInsertLink()">' + ticketIcon("link", 13) + "</button>" +
            '<button type="button" class="tk-tool-btn" id="tkNewImageBtn" title="上传图片（随工单提交）" onclick="tkNewImagePick()">' + ticketIcon("clip", 13) + " 图片</button>" +
            '<input type="file" id="tkNewImageFile" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="tkNewImageSelected(this)" />' +
          "</div>" +
          '<textarea id="tkNewContent" rows="8" placeholder="请详细描述遇到的问题：复现步骤、报错信息、期望结果等…" aria-label="问题描述" oninput="tkNewUpdateCount()"></textarea>' +
        "</div>" +
        '<div class="tk-page-head-actions" style="justify-content:flex-end">' +
          '<span class="ticket-compose-count" id="tkNewCount" style="margin-right:auto">0 字</span>' +
          '<button type="button" class="btn btn-outline" onclick="location.hash=\'#tickets\'">取消</button>' +
          '<button type="button" class="btn btn-primary" id="tkNewSubmitBtn" onclick="submitTicketPage()">' + ticketIcon("send", 14) + " 提交工单</button>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function openTicketNewPage(orderId) {
  /* 守卫：仅已登录普通用户可进入发起工单页（管理员请走后台） */
  if (typeof currentUser === "undefined" || !currentUser) {
    if (typeof showLogin === "function") showLogin();
    window.location.hash = "#tickets";
    return;
  }
  if (typeof currentRole !== "undefined" && currentRole === "admin") {
    if (typeof showToast === "function") showToast("管理员请前往后台处理工单");
    window.location.hash = "#tickets";
    return;
  }
  orderId = parseInt(orderId, 10) || 0;
  TicketState.pendingNewImages = [];
  var c = document.getElementById("ticketNewBody");
  if (!c) return;
  c.innerHTML = renderTicketNewFormHtml();
  tkLoadOrderOptions(document.getElementById("tkNewOrder"), orderId);
  tkUpdateImageButton();
  window.scrollTo(0, 0);
}
function ticketNewBodyRetry() { openTicketNewPage((window.__ROUTE_QUERY__ || {}).order || 0); }

/* 提交工单（创建 → 续传图片 → 跳转详情页） */
function submitTicketPage() {
  if (TicketState.submitting) return;
  var title = ((document.getElementById("tkNewTitle") || {}).value || "").trim();
  var content = ((document.getElementById("tkNewContent") || {}).value || "").trim();
  var category = (document.getElementById("tkNewCategory") || {}).value || "other";
  var urgent = !!(document.getElementById("tkNewUrgent") || {}).checked;
  var priority = urgent ? "3" : ((document.getElementById("tkNewPriority") || {}).value || "1");
  var orderId = (document.getElementById("tkNewOrder") || {}).value || "";
  if (!title) { showToast("请填写工单标题"); var t1 = document.getElementById("tkNewTitle"); if (t1) t1.focus(); return; }
  if (!content) { showToast("请填写问题描述"); var t2 = document.getElementById("tkNewContent"); if (t2) t2.focus(); return; }
  TicketState.submitting = true;
  var btn = document.getElementById("tkNewSubmitBtn");
  tkSetSending(btn, true, "提交中...", null);
  var payload = { title: title, content: content, category: category, priority: priority };
  if (orderId) payload.order_id = orderId;
  TicketApi.create(payload)
    .then(function (res) {
      var tid = res.data && res.data.ticket_id ? parseInt(res.data.ticket_id, 10) : 0;
      return tkUploadPendingImages(tid).then(function () { return tid; });
    })
    .then(function (tid) {
      TicketState.submitting = false;
      TicketState.pendingNewImages = [];
      showToast("工单提交成功");
      if (tid) {
        window.location.hash = "#ticket-view?id=" + tid;
      } else {
        window.location.hash = "#tickets";
      }
    })
    .catch(function (err) {
      TicketState.submitting = false;
      tkSetSending(btn, false, "", ticketIcon("send", 14) + " 提交工单");
      showToast((err && err.message) || "提交失败");
    });
}

/* 查看工单页 */
function openTicketView(id) {
  id = parseInt(id, 10); if (!id) return;
  TicketState.currentUserDetailId = id;
  var c = document.getElementById("ticketViewBody");
  if (!c) return;
  c.innerHTML = renderTicketSkeletonDetail();
  TicketApi.detail(id)
    .then(function (res) {
      var t = res.data;
      TicketState.ticketCache[id] = t;
      return TicketApi.listAttachments(id).then(function (att) {
        c.innerHTML = tkTicketViewShellHtml(t, att, false);
        tkScrollConversationToEnd();
      });
    })
    .catch(function (err) {
      c.innerHTML =
        '<button type="button" class="tk-back-link" onclick="location.hash=\'#tickets\'">← 返回工单列表</button>' +
        '<div style="margin-top:12px">' + renderTicketErrorState("ticketViewBody", (err && err.message) || "获取工单详情失败") + "</div>";
    });
}

/* 详情外壳（返回链接 + 卡片容器），刷新时复用以保持结构一致 */
function tkTicketViewShellHtml(t, att) {
  return (
    '<button type="button" class="tk-back-link" onclick="location.hash=\'#tickets\'">← 返回工单列表</button>' +
    '<div class="card" style="padding:22px;margin-top:12px">' +
      buildTicketViewPageHtml(t, att, { isAdminSide: false }) +
    "</div>"
  );
}

/* 局部刷新（回复 / 关闭 / 上传附件后），保留草稿与滚动位置 */
function refreshTicketView(id) {
  return TicketApi.detail(id)
    .then(function (res) {
      var t = res.data;
      TicketState.ticketCache[id] = t;
      return TicketApi.listAttachments(id).then(function (att) {
        var c = document.getElementById("ticketViewBody");
        if (!c) return;
        var ta = document.getElementById("replyContent");
        var draft = ta ? ta.value : "";
        c.innerHTML = tkTicketViewShellHtml(t, att);
        if (draft) {
          var ta2 = document.getElementById("replyContent");
          if (ta2) { ta2.value = draft; tkUpdateComposerCount(ta2, "replyContentCount"); }
        }
        tkScrollConversationToEnd();
      });
    })
    .catch(function () { openTicketView(id); });
}
function ticketViewBodyRetry() { openTicketView(TicketState.currentUserDetailId || 0); }

