/* =====================================================
   通用控制器辅助：弹窗 / 字数 / 发送态 / 模板 / 附件上传
   来源：js/tickets.js
   ===================================================== */
/* ==================== 6. 通用控制器辅助 ==================== */

window.__TK_IS_ADMIN__ = /\/admin\//.test(window.location.pathname);

function tkOpenModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.add("show");
}
function tkCloseModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.remove("show");
}

/* 字数统计（near/max 两档高亮） */
function tkUpdateComposerCount(textarea, countElId) {
  var el = countElId ? document.getElementById(countElId) : null;
  if (!el) return;
  var len = textarea ? (textarea.value || "").length : 0;
  el.textContent = len + "/" + TICKET_REPLY_MAXLEN;
  el.classList.toggle("is-near", len >= TICKET_REPLY_MAXLEN * 0.85 && len < TICKET_REPLY_MAXLEN);
  el.classList.toggle("is-max", len >= TICKET_REPLY_MAXLEN);
}

/* 发送按钮 loading 态切换（spinner + 文案 + 禁用） */
function tkSetSending(btn, sending, sendingText, normalHtml) {
  if (!btn) return;
  if (sending) {
    if (!btn.dataset.normalHtml) btn.dataset.normalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="tk-spinner"></span> ' + (sendingText || "发送中...");
    btn.classList.add("is-sending");
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.innerHTML = normalHtml || btn.dataset.normalHtml || btn.innerHTML;
    btn.classList.remove("is-sending");
    btn.removeAttribute("aria-busy");
  }
}

/* 对话流滚动到最新一条（渲染完成后调用） */
function tkScrollConversationToEnd() {
  var wrap = document.getElementById("tk-conversation");
  if (!wrap) return;
  try {
    wrap.scrollIntoView({ block: "end" });
  } catch (e) {
    wrap.scrollIntoView();
  }
}

/* 快捷回复模板（带缓存的懒加载；失败静默降级为无模板） */
function getTicketTemplates() {
  if (!TicketState.templatesCache) {
    TicketState.templatesCache = TicketApi.templates()
      .then(function (d) { return d.data || []; })
      .catch(function () { return []; });
  }
  return TicketState.templatesCache;
}

function applyReplyTemplate(id) {
  getTicketTemplates().then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (parseInt(list[i].id, 10) === parseInt(id, 10)) {
        var ta =
          document.getElementById(TicketState.currentTextareaId || "") ||
          document.getElementById(window.__TK_IS_ADMIN__ ? "adminReplyContent" : "replyContent");
        if (ta) {
          ta.value = list[i].content || "";
          tkUpdateComposerCount(ta, ta.id + "Count");
          ta.focus();
        }
        break;
      }
    }
  });
}

function handleComposeKeydown(e, tid) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (window.__TK_IS_ADMIN__) adminReplyTicket(tid);
    else replyTicket(tid);
  }
}

function handleTicketFileChange(input, labelId, nameId) {
  var label = document.getElementById(labelId);
  var nameEl = document.getElementById(nameId);
  if (!label || !nameEl) return;
  if (input.files && input.files[0]) {
    label.classList.add("has-file");
    label.innerHTML = ticketIcon("clip", 12) + "已选择";
    nameEl.textContent = input.files[0].name;
  } else {
    label.classList.remove("has-file");
    label.innerHTML = ticketIcon("clip", 12) + "选择附件";
    nameEl.textContent = "";
  }
}

function uploadAttachmentToTicket(tid, fileId) {
  var fi = document.getElementById(fileId);
  if (!fi || !fi.files || !fi.files[0]) { showToast("请先选择文件"); return; }
  if (fi.files[0].size > 5 * 1024 * 1024) { showToast("文件大小不能超过5MB"); return; }
  /* 上传按钮进入 loading 态 */
  var btn = document.getElementById(fileId + "UploadBtn");
  tkSetSending(btn, true, "上传中...", null);
  TicketApi.uploadAttachment(tid, fi.files[0])
    .then(function () {
      showToast("附件上传成功");
      fi.value = "";
      handleTicketFileChange({ files: null }, fileId + "Label", fileId + "Name");
      /* v20260825：页面化后按侧别就地刷新详情视图 */
      if (window.__TK_IS_ADMIN__) refreshAdminTicketView(tid);
      else refreshTicketView(tid);
    })
    .catch(function (err) { showToast((err && err.message) || "上传请求失败"); })
    .finally(function () { tkSetSending(btn, false, "", null); });
}

/* 对话流组装（IM 气泡 + 时间线 + 附件折叠面板 + 输入区），前台后台共用 */
function buildConversationHtml(t, att, isAdminSide, withComposer, templates) {
  var h = renderTicketReplies(t.replies, isAdminSide);
  var tl = renderTicketTimeline(t.events || []);
  if (tl) h += tl;
  var at = renderTicketAttachments(att || [], TicketApi._base);
  if (at) h += at;
  if (withComposer) {
    h += renderReplyComposer({
      ticketId: t.id,
      textareaId: isAdminSide ? "adminReplyContent" : "replyContent",
      fileId: isAdminSide ? "adminTicketFile" : "ticketFile",
      templates: isAdminSide ? (templates || null) : null
    });
  }
  return h;
}

