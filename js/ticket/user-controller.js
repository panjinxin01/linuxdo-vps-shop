/* =====================================================
   用户侧控制器（前台）：筛选 / 列表 / 概览 chips
   来源：js/tickets.js
   ===================================================== */
/* ==================== 7. 用户侧控制器（前台） ==================== */

/* 前台概览 chips 点击 → 本地过滤工单列表 */
function filterMyTickets(status) {
  TicketState.userFilterStatus = String(status);
  var c = document.getElementById("myTickets");
  if (!c) return;
  renderMyTicketsInto(c);
}

function renderMyTicketsInto(c) {
  var list = TicketState.myTicketsCache || [];
  var f = TicketState.userFilterStatus;

  function chip(cls, label, val, stVal, active) {
    var act = active ? " is-active" : "";
    return (
      '<button type="button" class="tk-overview-item ' + cls + act + '" aria-pressed="' + (active ? "true" : "false") + '" onclick="filterMyTickets(\'' + stVal + "')\">" +
        label + "<strong>" + val + "</strong>" +
      "</button>"
    );
  }

  var n = { 0: 0, 1: 0, 2: 0 };
  for (var i = 0; i < list.length; i++) {
    var k = parseInt(list[i].status, 10);
    if (n[k] !== undefined) n[k]++;
  }

  var html =
    '<div class="tk-overview">' +
      chip("", "全部", list.length, "", f === "") +
      chip("is-wait", "待回复", n[0], "0", f === "0") +
      chip("is-on", "已回复", n[1], "1", f === "1") +
      chip("is-off", "已关闭", n[2], "2", f === "2") +
    "</div>";

  var shown = list;
  if (f !== "") {
    shown = list.filter(function (t) { return parseInt(t.status, 10) === parseInt(f, 10); });
  }
  if (!shown.length) {
    html += renderTkEmptyArt({
      title: "暂无符合条件的工单",
      sub: "遇到问题？随时提交工单，我们会尽快处理。",
      actionHtml:
        '<button type="button" class="btn btn-primary" onclick="showCreateTicket()">+ 发起新工单</button>'
    });
  } else {
    html += renderTicketPageTable(shown);
  }
  c.innerHTML = html;
}

function loadMyTickets() {
  var c = document.getElementById("myTickets"); if (!c) return;
  if (typeof currentUser === "undefined" || !currentUser) {
    c.innerHTML = renderLoginRequired("登录后查看工单记录", {
      icon: "ticket",
      sub: "提交问题反馈、查看处理进度，获取技术支持"
    });
    return;
  }
  /* 骨架屏 */
  c.innerHTML = renderTicketPageTable([]).replace("<tbody></tbody>", "<tbody><tr><td colspan='6' style='border:none'><div class=\"tk-skeleton-card\"><div class=\"tk-skeleton tk-skeleton-line w60\"></div><div class=\"tk-skeleton tk-skeleton-line w40\"></div></div></td></tr></tbody>");
  TicketState.userFilterStatus = "";
  TicketApi.myTickets()
    .then(function (data) {
      var list = data.data || [];
      TicketState.myTicketsCache = list;
      if (typeof updateDashTickets === "function") { try { updateDashTickets(list); } catch (e) {} }
      if (!list.length) {
        c.innerHTML = renderTkEmptyArt({
          title: "暂无工单记录",
          sub: "提交问题反馈、查看处理进度，获取技术支持。",
          actionHtml:
            '<button type="button" class="btn btn-primary" onclick="showCreateTicket()">+ 发起新工单</button>'
        });
        return;
      }
      renderMyTicketsInto(c);
    })
    .catch(function (err) {
      c.innerHTML = renderTicketErrorState("myTickets", (err && err.message) || "工单列表加载失败");
    });
}
function myTicketsRetry() { loadMyTickets(); }

/* v20260825：showCreateTicket / closeTicketModal 已在文末第 14 章重定义为页面版实现 */
function submitTicket() { showCreateTicket(); }

function uploadUserTicketAttachment(ticketId) {
  uploadAttachmentToTicket(ticketId, "ticketFile");
}
/* v20260825：showTicketDetail / replyTicket / closeTicket 已在文末第 14 章重定义为页面版实现 */
function ticketDetailBodyRetry() {
  if (TicketState.currentUserDetailId) showTicketDetail(TicketState.currentUserDetailId);
}
function closeTicketDetail() { window.location.hash = "#tickets"; }

