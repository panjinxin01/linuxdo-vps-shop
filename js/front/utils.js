/* =====================================================
   工具函数：用户名归一化与安全取值
   来源：js/main.js
   ===================================================== */
// ==================== 工具函数 ====================
function normalizeCurrentUserValueDeep(value) {
  if (!value) return null;
  if (typeof value === "string") return { username: value, credit_balance: 0 };
  if (typeof value === "object") {
    if (value.user && typeof value.user === "object") return normalizeCurrentUserValueDeep(value.user);
    if (value.username && typeof value.username === "object") return normalizeCurrentUserValueDeep(value.username);
    return value;
  }
  return { username: String(value), credit_balance: 0 };
}

function safeUserNameFrom(value) {
  const u = normalizeCurrentUserValueDeep(value);
  if (!u) return "";
  const candidates = [u.username, u.linuxdo_username, u.name, u.linuxdo_name];
  for (let i = 0; i < candidates.length; i++) { const item = candidates[i]; if (typeof item === "string" && item.trim() !== "") return item.trim(); }
  return "";
}
