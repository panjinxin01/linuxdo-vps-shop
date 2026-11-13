/* =====================================================
   仪表盘：欢迎卡 / 管理实例
   来源：js/main.js
   ===================================================== */
// ==================== 仪表盘：欢迎卡 ====================
function updateWelcomeCard() {
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  const greeting = document.getElementById("welcomeGreeting");
  const avatar = document.getElementById("welcomeAvatar");
  const quote = document.getElementById("welcomeQuote");
  if (!greeting) return;
  const h = new Date().getHours();
  let tg = "您好";
  if (h >= 5 && h < 12) tg = "早上好"; else if (h >= 12 && h < 14) tg = "中午好";
  else if (h >= 14 && h < 18) tg = "下午好"; else if (h >= 18 && h < 22) tg = "晚上好"; else tg = "夜深了";
  const un = safeUserNameFrom(currentUser);
  greeting.textContent = un ? tg + "！" + un : "欢迎访问";
  if (quote) {
    quote.innerHTML = appIcon("star", 15, { style: "vertical-align:-2px;margin-right:4px;flex-shrink:0" }) + '<span>' + (un ? '使用积分兑换高性能VPS云服务器' : '登录后查看并兑换高性能VPS云服务器') + '</span>';
  }
  if (!avatar) return;
  if (un) { avatar.classList.add("has-user"); avatar.innerHTML = '<span style="font-size:24px;font-weight:600;">' + escapeHtml(un.charAt(0).toUpperCase()) + "</span>"; }
  else { avatar.classList.remove("has-user"); avatar.innerHTML = appIcon("user", 30, { strokeWidth: 1.8 }); }
}

function updateManageInstances(orderList) {
  const card = document.getElementById("manageInstanceCard");
  if (!card) return;

  if (!currentUser) {
    setGuestHomeInstanceCards();
    renderAvailableInstances([]);
    return;
  }

  restoreHomeInstanceCards();
  const tags = document.getElementById("manageInstanceTags");
  if (!tags) return;

  const list = currentRole === "user"
    ? (orderList || cachedPaidOrderList || cachedOrderList || []).filter((o) => parseInt(o.status || 0) === 1)
    : [];

  if (!list.length) {
    card.style.display = "none";
    const s = document.getElementById("statInstances");
    if (s) s.textContent = currentRole === "user" ? "0" : s.textContent;
    renderAvailableInstances([]);
    return;
  }
  card.style.display = "block";
  tags.innerHTML = list.slice(0, 8).map((o) => `<span class="instance-tag" onclick="switchPage('instances')"><span class="status-dot"></span>${escapeHtml(o.product_name || "VPS-" + o.id)}</span>`).join("");
  const s = document.getElementById("statInstances"); if (s) s.textContent = String(list.length);
  renderAvailableInstances(list);
}

