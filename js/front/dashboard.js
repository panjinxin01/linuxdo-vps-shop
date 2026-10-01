/* =====================================================
   仪表盘：即将过期 / 待办工单 / 公告轮播 / 欢迎卡 / 管理实例
   来源：js/main.js
   ===================================================== */
// ==================== 仪表盘：即将过期统计 ====================
function updateDashExpiring() {
  const el = document.getElementById("dashExpiring");
  if (!el) return;
  const list = currentRole === "user" ? (cachedPaidOrderList || []) : [];
  const count = list.filter((o) => {
    if (parseInt(o.status || 0) !== 1) return false;
    // 后端退保策略输出的到期字段是 service_end_at（由 commerceBuildRefundPolicy 生成），
    // 并不存在 expire_at，原写法恒为 0。
    const endAt = o.service_end_at || o.expire_at;
    if (!endAt) return false;
    const diff = new Date(String(endAt).replace(/-/g, "/")).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 3600 * 1000; // 7天内到期
  }).length;
  el.textContent = count + " 台";
}

// ==================== 仪表盘：待办工单表格 ====================
function updateDashTickets(ticketList) {
  const body = document.getElementById("dashTicketBody");
  const empty = document.getElementById("dashTicketEmpty");
  const table = document.querySelector("#dashTicketTable .dash-table");
  if (!body || !empty || !table) return;
  // 进行中的工单 = 状态非关闭的工单（status: 0=待回复 1=已回复/处理中，2=已关闭）
  const list = (Array.isArray(ticketList) ? ticketList : (typeof TicketState !== "undefined" && TicketState.myTicketsCache) || [])
    .filter((t) => parseInt(t.status || 0) !== 2);
  if (!list.length) {
    table.style.display = "none";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  table.style.display = "";
  const stMap = { 0: "待回复", 1: "处理中" };
  body.innerHTML = list.slice(0, 6).map((t) => `<tr onclick="showTicketDetail(${parseInt(t.id)})">
      <td>#${parseInt(t.id)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title || "-")}</td>
      <td>${escapeHtml((t.created_at || "").slice(0, 16))}</td>
      <td>${escapeHtml((t.updated_at || "-").slice(0, 16))}</td>
      <td>${escapeHtml(stMap[parseInt(t.status)] || "处理中")}</td>
      <td><span style="color:var(--primary)">查看</span></td>
    </tr>`).join("");
}

// ==================== 仪表盘：公告轮播 + 右侧公告列表 ====================
function updateDashAnnouncements(announcements) {
  const swiper = document.getElementById("announcementSwiper");
  const sideList = document.getElementById("dashAnnouncementList");
  const list = Array.isArray(announcements) ? announcements : [];
  if (swiper) {
    if (!list.length) {
      swiper.innerHTML = '<h5 class="swiper-h5">🈚 暂无公告</h5><p class="swiper-p">最近没有啥新鲜事，值得挂在这里。</p>';
    } else {
      // 简易轮播：每 5 秒切换一条
      swiper.dataset.annList = JSON.stringify(list.map((a) => ({ t: a.title, c: (a.content || "").replace(/<[^>]+>/g, "").slice(0, 120) })));
      if (!swiper.dataset.timerSet) {
        swiper.dataset.timerSet = "1";
        let idx = 0;
        setInterval(() => {
          let arr = [];
          try { arr = JSON.parse(swiper.dataset.annList || "[]"); } catch (e) {}
          if (arr.length > 1) {
            idx = (idx + 1) % arr.length;
            swiper.innerHTML = '<h5 class="swiper-h5">📌 ' + escapeHtml(arr[idx].t) + '</h5><p class="swiper-p">' + escapeHtml(arr[idx].c) + "</p>";
          }
        }, 5000);
      }
    }
  }
  if (sideList) {
    if (!list.length) {
      sideList.innerHTML = '<div class="dash-ann-item dash-ann-empty">暂无公告</div>';
    } else {
      sideList.innerHTML = list.slice(0, 5).map((a) => {
        const tagMap = { announcement: "公告", notice: "公告", maintenance: "维护", security: "安全" };
        const tag = tagMap[a.type] || a.type || "公告";
        const date = (a.publish_at || a.created_at || "").slice(5, 10);
        return `<div class="dash-ann-item" onclick="showAnnouncement(${a.id})"><span class="dash-ann-tag">${escapeHtml(tag)}</span><span class="dash-ann-title">${escapeHtml(a.title)}</span><span class="dash-ann-date">${escapeHtml(date)}</span></div>`;
      }).join("");
    }
  }
}

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
    quote.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>' + (un ? '使用积分兑换高性能VPS云服务器' : '登录后查看并兑换高性能VPS云服务器') + '</span>';
  }
  if (!avatar) return;
  if (un) { avatar.classList.add("has-user"); avatar.innerHTML = '<span style="font-size:24px;font-weight:600;">' + escapeHtml(un.charAt(0).toUpperCase()) + "</span>"; }
  else { avatar.classList.remove("has-user"); avatar.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'; }
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

