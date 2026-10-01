/* =====================================================
   工单 API 封装（统一错误处理）
   来源：js/tickets.js
   ===================================================== */
/* ==================== 4. API 封装（统一错误处理） ==================== */

var TicketApi = {
  _base: "api/",

  init: function (base) {
    this._base = base;
  },

  _handle: function (promise) {
    return promise
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || data.code !== 1) {
          throw new Error((data && data.msg) || "请求失败");
        }
        return data;
      });
  },

  myTickets: function () {
    return this._handle(apiFetch(this._base + "tickets.php?action=my"));
  },

  detail: function (id) {
    return this._handle(apiFetch(this._base + "tickets.php?action=detail&id=" + id));
  },

  templates: function () {
    return this._handle(apiFetch(this._base + "tickets.php?action=templates"));
  },

  stats: function () {
    return this._handle(apiFetch(this._base + "tickets.php?action=stats"));
  },

  all: function (filters) {
    var qs = "";
    if (filters) {
      Object.keys(filters).forEach(function (k) {
        var v = filters[k];
        if (v !== "" && v !== undefined && v !== null) {
          qs += "&" + k + "=" + encodeURIComponent(v);
        }
      });
    }
    return this._handle(apiFetch(this._base + "tickets.php?action=all" + qs));
  },

  adminList: function (limit) {
    return this._handle(apiFetch(this._base + "tickets.php?action=admin_list&limit=" + (limit || 5)));
  },

  create: function (fields) {
    var body = new FormData();
    body.append("action", "create");
    Object.keys(fields).forEach(function (k) {
      if (fields[k] !== undefined && fields[k] !== null && fields[k] !== "") {
        body.append(k, fields[k]);
      }
    });
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  reply: function (ticketId, content) {
    var body = new FormData();
    body.append("action", "reply");
    body.append("ticket_id", ticketId);
    body.append("content", content);
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  close: function (ticketId) {
    var body = new FormData();
    body.append("action", "close");
    body.append("ticket_id", ticketId);
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  approveRefund: function (ticketId, target, reason) {
    var body = new FormData();
    body.append("action", "approve_refund");
    body.append("ticket_id", ticketId);
    body.append("refund_target", target);
    body.append("refund_reason", reason);
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  uploadAttachment: function (ticketId, file) {
    var body = new FormData();
    body.append("action", "ticket");
    body.append("ticket_id", ticketId);
    body.append("file", file);
    return this._handle(apiFetch(this._base + "upload.php", { method: "POST", body: body }));
  },

  listAttachments: function (ticketId) {
    return apiFetch(this._base + "upload.php?action=list&ticket_id=" + ticketId)
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        return d && d.code === 1 && d.data ? d.data : [];
      })
      .catch(function () {
        return [];
      });
  }
};

/* 自动识别前台/后台并初始化 API 基路径 */
(function () {
  var isAdminPage = /\/admin\/[^/]*\.html$/.test(window.location.pathname);
  TicketApi.init(isAdminPage ? "../api/" : "api/");
})();

