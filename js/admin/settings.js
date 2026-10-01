/* =====================================================
   系统设置：支付 / OAuth / 迁移 / 密码 / SMTP / 缓存 / 通知
   来源：js/admin.js
   ===================================================== */
// ==================== 设置模块 ====================
function loadSettings() {
  apiFetch("../api/settings.php?action=get").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      document.getElementById("cfgPid").value = data.data.epay_pid || "";
      // 敏感字段仅显示是否已配置，避免把掩码值回写
      document.getElementById("cfgKey").value = data.data.epay_key_set ? "" : "";
      document.getElementById("cfgKey").placeholder = data.data.epay_key_set || data.data.epay_key === "********" ? "已配置，留空则保持不变" : "请输入易支付密钥";
      document.getElementById("cfgNotify").value = data.data.notify_url || "";
      document.getElementById("cfgReturn").value = data.data.return_url || "";
    }
  });
}
function savePaySettings() {
  const body = new FormData(); body.append("action", "save");
  body.append("epay_pid", document.getElementById("cfgPid").value);
  const epayKey = document.getElementById("cfgKey").value;
  if (epayKey && epayKey !== "********") body.append("epay_key", epayKey);
  body.append("notify_url", document.getElementById("cfgNotify").value);
  body.append("return_url", document.getElementById("cfgReturn").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function loadLdcPaySettings() {
  apiFetch("../api/settings.php?action=get_ldcpay").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      document.getElementById("cfgLdcClientId").value = data.data.client_id || "";
      document.getElementById("cfgLdcClientSecret").value = "";
      document.getElementById("cfgLdcClientSecret").placeholder = data.data.client_secret_set ? "已配置，留空则保持不变" : "请输入 Client Secret";
      document.getElementById("cfgLdcPrivateKey").value = "";
      document.getElementById("cfgLdcPrivateKey").placeholder = data.data.private_key_set ? "已配置，留空则保持不变" : "请输入私钥";
      document.getElementById("cfgLdcPublicKey").value = data.data.public_key || "";
      document.getElementById("cfgLdcNotify").value = data.data.notify_url || "";
      document.getElementById("cfgLdcReturn").value = data.data.return_url || "";
      const hint = document.getElementById("ldcPayEd25519Hint");
      if (hint) {
        hint.innerHTML = data.data.ed25519_available
          ? '<span style="color:var(--success);font-weight:600"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px;margin-right:2px"><polyline points="20 6 9 17 4 12"/></svg> Ed25519 签名可用</span> — PHP sodium 或 OpenSSL 3.0 扩展已安装'
          : '<span style="color:var(--danger);font-weight:600"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px;margin-right:2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ed25519 不可用</span> — 请安装 PHP sodium 扩展或升级到 PHP 8.0+';
        hint.style.background = data.data.ed25519_available ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)';
        hint.style.border = '1px solid ' + (data.data.ed25519_available ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)');
      }
    }
  });
}
function saveLdcPaySettings() {
  const body = new FormData(); body.append("action", "save_ldcpay");
  body.append("ldcpay_client_id", document.getElementById("cfgLdcClientId").value);
  const secret = document.getElementById("cfgLdcClientSecret").value;
  if (secret && secret !== "********") body.append("ldcpay_client_secret", secret);
  const priv = document.getElementById("cfgLdcPrivateKey").value;
  if (priv && priv !== "********") body.append("ldcpay_private_key", priv);
  body.append("ldcpay_public_key", document.getElementById("cfgLdcPublicKey").value);
  body.append("ldcpay_notify_url", document.getElementById("cfgLdcNotify").value);
  body.append("ldcpay_return_url", document.getElementById("cfgLdcReturn").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}

function loadOAuthSettings() {
  apiFetch("../api/settings.php?action=get_oauth").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      document.getElementById("cfgOAuthClientId").value = data.data.client_id || "";
      document.getElementById("cfgOAuthClientSecret").value = "";
      document.getElementById("cfgOAuthClientSecret").placeholder = data.data.client_secret_set ? "已配置，留空则保持不变" : "请输入 Client Secret";
      document.getElementById("cfgOAuthRedirectUri").value = data.data.redirect_uri || "";
    }
  });
}
function saveOAuthSettings() {
  const body = new FormData(); body.append("action", "save_oauth");
  body.append("client_id", document.getElementById("cfgOAuthClientId").value);
  const secret = document.getElementById("cfgOAuthClientSecret").value;
  if (secret && secret !== "********") body.append("client_secret", secret);
  body.append("redirect_uri", document.getElementById("cfgOAuthRedirectUri").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function migrateLinuxDOFields() {
  if (!confirm("确定要执行数据库迁移吗？\n\n这将为users表添加Linux DO OAuth所需的字段。")) return;
  const body = new FormData();
  body.append("action", "migrate_linuxdo");
  apiFetch("../api/update_db.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    const d = data.data || {};
    const createdCount = (d.created || []).length;
    const migratedCount = (d.migrated || []).length;
    const detail = (createdCount || migratedCount)
      ? "\n\n新增字段/数据表: " + (createdCount ? d.created.join(", ") : "") + (migratedCount ? d.migrated.join(", ") : "")
      : "";
    alert(data.msg + detail);
  }).catch(() => alert("迁移请求失败"));
}
function changePassword() {
  const body = new FormData(); body.append("action", "change_password"); body.append("old_password", document.getElementById("oldPass").value); body.append("new_password", document.getElementById("newPass").value);
  apiFetch("../api/admin.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); if (data.code === 1) { document.getElementById("oldPass").value = ""; document.getElementById("newPass").value = ""; } });
}
function loadSmtpSettings() {
  apiFetch("../api/settings.php?action=get_smtp").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      const d = data.data;
      document.getElementById("cfgSmtpHost").value = d.smtp_host || "";
      document.getElementById("cfgSmtpPort").value = d.smtp_port || "587";
      document.getElementById("cfgSmtpUser").value = d.smtp_user || "";
      document.getElementById("cfgSmtpPass").value = "";
      document.getElementById("cfgSmtpPass").placeholder = d.smtp_pass_set ? "已配置，留空则保持不变" : "请输入 SMTP 密码";
      document.getElementById("cfgSmtpFrom").value = d.smtp_from || "";
      document.getElementById("cfgSmtpName").value = d.smtp_name || "";
      document.getElementById("cfgSmtpSecure").value = d.smtp_secure || "tls";
    }
  }).catch(() => {});
}
function saveSmtpSettings() {
  const body = new FormData(); body.append("action", "save_smtp");
  body.append("smtp_host", document.getElementById("cfgSmtpHost").value);
  body.append("smtp_port", document.getElementById("cfgSmtpPort").value);
  body.append("smtp_user", document.getElementById("cfgSmtpUser").value);
  const pass = document.getElementById("cfgSmtpPass").value;
  if (pass && pass !== "********") body.append("smtp_pass", pass);
  body.append("smtp_from", document.getElementById("cfgSmtpFrom").value);
  body.append("smtp_name", document.getElementById("cfgSmtpName").value);
  body.append("smtp_secure", document.getElementById("cfgSmtpSecure").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function testSmtpSettings() {
  const email = prompt("请输入测试邮箱地址："); if (!email) return;
  const body = new FormData(); body.append("action", "test_smtp"); body.append("email", email);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function loadCacheStats() {
  apiFetch("../api/cache.php?action=stats").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) { document.getElementById("cacheCount").textContent = data.data.count || 0; document.getElementById("cacheSize").textContent = data.data.size_human || "0 B"; document.getElementById("cacheExpired").textContent = data.data.expired || 0; }
  }).catch(() => {});
}
function cleanupCache() { const body = new FormData(); body.append("action", "cleanup"); apiFetch("../api/cache.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); loadCacheStats(); }); }
function clearAllCache() { if (!confirm("确定要清空所有缓存吗？")) return; const body = new FormData(); body.append("action", "clear"); apiFetch("../api/cache.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); loadCacheStats(); }); }
function loadNotificationSettings() {
  apiFetch("../api/settings.php?action=get_notification").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) return; const d = data.data;
    if (document.getElementById("cfgNotifEmail")) document.getElementById("cfgNotifEmail").checked = parseInt(d.notification_email_enabled || 0) === 1;
    if (document.getElementById("cfgNotifWebhook")) document.getElementById("cfgNotifWebhook").checked = parseInt(d.notification_webhook_enabled || 0) === 1;
    if (document.getElementById("cfgNotifWebhookUrl")) document.getElementById("cfgNotifWebhookUrl").value = d.notification_webhook_url || "";
    if (document.getElementById("cfgSilencedOrderMode")) document.getElementById("cfgSilencedOrderMode").value = d.linuxdo_silenced_order_mode || "review";
  });
}
function saveNotificationSettings() {
  const body = new FormData(); body.append("action", "save_notification");
  body.append("notification_email_enabled", document.getElementById("cfgNotifEmail").checked ? "1" : "0");
  body.append("notification_webhook_enabled", document.getElementById("cfgNotifWebhook").checked ? "1" : "0");
  body.append("notification_webhook_url", document.getElementById("cfgNotifWebhookUrl").value);
  body.append("linuxdo_silenced_order_mode", document.getElementById("cfgSilencedOrderMode").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) showToast("通知配置已保存"); else alert(data.msg || "保存失败"); });
}

