/* =====================================================
   管理侧控制器（后台）：筛选 / 列表 / 统计 / 回复 / 退款卡
   来源：js/tickets.js
   ===================================================== */
/* ==================== 8. 管理侧控制器（后台） ==================== */

/* 后台分段式状态筛选（与原 select 双向兼容） */
function setAdminTicketStatusFilter(v) {
  v = String(v);
  TicketState.adminFilters.status = v;
  var sel = document.getElementById("tkFilterStatus");
  if (sel) sel.value = v;
  var group = document.getElementById("tkSegStatus");
  if (group) {
    var btns = group.querySelectorAll(".tk-seg-btn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-value") === v;
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  loadTickets();
}

function loadTicketStats() {
  var ids = { pending: "statTicketPending", replied: "statTicketReplied", closed: "statTicketClosed", total: "statTicketTotal" };
  TicketApi.stats()
    .then(function (res) {
      var d = res.data || {};
      Object.keys(ids).forEach(function (k) {
        var el = document.getElementById(ids[k]);
        if (el) el.textContent = d[k] !== undefined ? d[k] : "-";
      });
      /* v20260825：侧边栏「工单管理」角标与统计卡联动（展示待回复数，>99 显示 99+） */
      var bd = document.getElementById("ticketBadge");
      if (bd) {
        var p = parseInt(d.pending, 10) || 0;
        bd.textContent = p > 99 ? "99+" : String(p);
        bd.style.display = p > 0 ? "" : "none";
      }
    })
    .catch(function () {});
}

function loadTickets() {
  var tbody = document.getElementById("ticketTable");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7"><div style="padding:10px 0">' + renderTicketSkeletonList(3) + "</div></td></tr>";
  TicketApi.all(TicketState.adminFilters)
    .then(function (data) {
      var list = data.data || [];
      TicketState.ticketCache = {};
      list.forEach(function (t) { TicketState.ticketCache[t.id] = t; });
      if (!list.length) {
        var hasFilter =
          TicketState.adminFilters.status !== "" ||
          TicketState.adminFilters.category !== "" ||
          TicketState.adminFilters.priority !== "" ||
          TicketState.adminFilters.keyword !== "";
        var cell = document.createElement("td");
        cell.colSpan = 7;
        if (hasFilter) {
          cell.style.padding = "10px 0";
          cell.innerHTML = renderTkEmptyArt({
            title: "没有符合条件的工单",
            sub: "可调整筛选条件后重试"
          });
        } else {
          cell.style.padding = "10px 0";
          cell.innerHTML = renderTkEmptyArt({
            title: "暂无工单",
            sub: "用户提交的工单将显示在这里"
          });
        }
        var tr = document.createElement("tr");
        tr.appendChild(cell);
        tbody.innerHTML = "";
        tbody.appendChild(tr);
        return;
      }
      var html = "";
      for (var i = 0; i < list.length; i++) html += renderTicketRow(list[i], TicketApi._base);
      tbody.innerHTML = html;
    })
    .catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">' + escapeHtml((err && err.message) || "工单加载失败") + "</td></tr>";
    });
}

function applyTicketFilters() {
  TicketState.adminFilters.status = (document.getElementById("tkFilterStatus") || {}).value || "";
  TicketState.adminFilters.category = (document.getElementById("tkFilterCategory") || {}).value || "";
  TicketState.adminFilters.priority = (document.getElementById("tkFilterPriority") || {}).value || "";
  TicketState.adminFilters.keyword = ((document.getElementById("tkFilterKeyword") || {}).value || "").trim();
  /* 同步分段按钮高亮（若存在） */
  var group = document.getElementById("tkSegStatus");
  if (group) {
    var btns = group.querySelectorAll(".tk-seg-btn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-value") === String(TicketState.adminFilters.status);
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  loadTickets();
}

function resetTicketFilters() {
  ["tkFilterStatus", "tkFilterCategory", "tkFilterPriority"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  var kw = document.getElementById("tkFilterKeyword");
  if (kw) kw.value = "";
  applyTicketFilters();
}

/* v20260825：showAdminTicketDetail / closeAdminTicketDetail 已在文末第 14 章重定义（tab 内嵌子视图） */
function adminTicketBodyRetry() {
  if (TicketState.currentAdminDetailId) showAdminTicketDetail(TicketState.currentAdminDetailId);
}

function renderAdminRefundCard(t) {
  var oi = t.order_info || null;
  var tgt = t.refund_target === "balance" ? "退回站内余额" : t.refund_target === "original" ? "原路退回" : "-";
  var h =
    '<div class="refund-admin-card">' +
      '<div class="refund-admin-card-header">' +
        "<div>" +
          '<div class="refund-admin-card-title">' + ticketIcon("refresh", 16) + "退款审批</div>" +
          '<div class="refund-admin-card-subtitle">用户提交时选择：' + escapeHtml(tgt) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="refund-admin-grid">' +
        '<div class="refund-admin-item"><label>关联订单</label><div>' + escapeHtml(t.order_no || "-") + "</div></div>" +
        '<div class="refund-admin-item"><label>退款金额</label><div>' + (oi ? parseFloat(oi.price || 0).toFixed(2) + " 积分" : "-") + "</div></div>" +
        '<div class="refund-admin-item"><label>提交原因</label><div>' + escapeHtml(t.refund_reason || "-") + "</div></div>" +
        '<div class="refund-admin-item"><label>处理管理员</label><div>' + escapeHtml(t.handled_admin_name || "-") + "</div></div>" +
      "</div>";
  if (parseInt(t.status, 10) !== 2) {
    h +=
      '<div class="refund-approve-section">' +
        '<div class="refund-admin-grid">' +
          '<div class="refund-admin-item"><label>审批退款方式</label><select id="approveRefundTarget">' +
            '<option value="original"' + (t.refund_target === "original" ? " selected" : "") + ">原路退回</option>" +
            '<option value="balance"' + (t.refund_target === "balance" ? " selected" : "") + ">退回站内余额</option>" +
          "</select></div>" +
          '<div class="refund-admin-item" style="grid-column:1/-1"><label>审批备注</label>' +
            '<textarea id="approveRefundReason" rows="2" placeholder="会写入退款记录与工单回复">' + escapeHtml(t.refund_reason || "工单退款") + "</textarea>" +
          "</div>" +
        "</div>" +
      "</div>";
  }
  h += "</div>";
  return h;
}
function adminReplyTicket(tid) {
  var ta = document.getElementById("adminReplyContent");
  var content = ta ? (ta.value || "").trim() : "";
  if (!content) { showToast("请输入回复内容"); if (ta) ta.focus(); return; }
  if (TicketState.replying) return;
  TicketState.replying = true;
  tkSetSending(document.getElementById("adminReplySendBtn"), true, "发送中...", null);
  TicketApi.reply(tid, content)
    .then(function () {
      TicketState.replying = false;
      showToast("回复成功");
      loadTickets();
      loadTicketStats();
      return refreshAdminTicketView(tid);
    })
    .catch(function (err) {
      TicketState.replying = false;
      showToast((err && err.message) || "回复失败");
    })
    .finally(function () {
      tkSetSending(document.getElementById("adminReplySendBtn"), false, "", ticketIcon("send", 14) + "发送回复");
    });
}

/* v20260825：adminCloseTicket / approveRefundTicket 已在文末第 14 章重定义（去重，仅保留一份） */

