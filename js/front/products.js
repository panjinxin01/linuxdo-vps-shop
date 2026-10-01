/* =====================================================
   商品与购买：列表 / 详情 / 优惠券校验 / 下单
   来源：js/main.js
   ===================================================== */
// ==================== 商品 / 购买 ====================
let currentDetailProduct = null;

function loadProducts() {
  const c = document.getElementById("buyProductList");
  if (!c) return;
  if (!currentUser) {
    c.innerHTML = renderLoginRequired('登录后查看可购买配置', {
      icon: 'cart',
      sub: '请登录后查看并兑换高性能VPS云服务器'
    });
    return;
  }
  apiFetch("api/products.php?action=list").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !Array.isArray(data.data)) { c.innerHTML = `<p style="color:var(--danger);text-align:center;padding:40px;">${escapeHtml(data.msg || "加载失败")}</p>`; return; }
    productCache = {};
    data.data.forEach((p) => { productCache[p.id] = p; });
    if (!data.data.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><p>暂无可购买配置</p></div>'; return; }
    c.innerHTML = data.data.map((p) => {
      const canBuy = p.can_buy !== 0 && p.can_buy !== false;
      const buyText = canBuy ? "立即购买" : (p.buy_block_reason || "暂不可购");
      const tdh = parseFloat(p.trust_discount_amount || 0) > 0 ? `<div style="font-size:12px;color:var(--success);margin-top:6px">${escapeHtml(p.trust_discount_label || "社区等级优惠")}</div>` : "";
      const tplH = p.template_name ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">模板：${escapeHtml(p.template_name)}</div>` : "";
      return `<div class="card buy-card" data-id="${p.id}"><h3>${escapeHtml(p.name || "")}</h3>
        <div class="specs"><div class="spec"><small>CPU</small><div class="spec-value">${escapeHtml(p.cpu || "-")}</div></div><div class="spec"><small>内存</small><div class="spec-value">${escapeHtml(p.memory || "-")}</div></div><div class="spec"><small>硬盘</small><div class="spec-value">${escapeHtml(p.disk || "-")}</div></div><div class="spec"><small>带宽</small><div class="spec-value">${escapeHtml(p.bandwidth || "-")}</div></div></div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:12px;line-height:1.8">
          ${p.region ? `<div>地区：${escapeHtml(p.region)}</div>` : ""}${p.line_type ? `<div>线路：${escapeHtml(p.line_type)}</div>` : ""}${p.os_type ? `<div>系统：${escapeHtml(p.os_type)}</div>` : ""}
          ${p.min_trust_level ? `<div>最低信任等级：TL${escapeHtml(String(p.min_trust_level))}</div>` : ""}${p.risk_review ? '<div style="color:var(--warning)">此商品可能进入人工审核</div>' : ""}
          ${p.buy_block_reason && !canBuy ? `<div style="color:var(--danger)">${escapeHtml(p.buy_block_reason)}</div>` : ""}${tplH}${tdh}</div>
        <div class="card-footer"><div><div class="price">${parseFloat(p.price || 0).toFixed(2)}<span>积分/月</span></div>${parseFloat(p.base_price || p.price || 0) > parseFloat(p.price || 0) ? `<div style="font-size:12px;color:var(--text-muted)">原价 ${parseFloat(p.base_price).toFixed(2)}</div>` : ""}</div>
          <div style="display:flex;gap:8px"><button class="btn btn-outline" onclick="showProductDetail(${p.id})">详情</button><button class="btn ${canBuy ? "btn-primary" : "btn-outline"}" ${canBuy ? "" : "disabled"} onclick="buyProductById(${p.id})">${escapeHtml(buyText)}</button></div></div></div>`;
    }).join("");
  }).catch(() => { const c = document.getElementById("buyProductList"); if (c) c.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">加载失败，请刷新重试</p>'; });
}

function showProductDetail(id) {
  const p = productCache[id]; if (!p) return;
  currentDetailProduct = p;
  document.getElementById("productDetailTitle").textContent = p.name;
  document.getElementById("productDetailBody").innerHTML = `<div style="margin-bottom:20px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${[["CPU",p.cpu],["内存",p.memory],["硬盘",p.disk],["带宽",p.bandwidth]].map(([l,v])=>`<div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${l}</div><div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(v)||"-"}</div></div>`).join("")}</div></div>
    <div style="background:var(--primary-light);padding:16px;border-radius:var(--radius-md);text-align:center"><div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">价格</div><div style="font-size:28px;font-weight:700;color:var(--primary)">${p.price}<span style="font-size:14px;font-weight:400">积分/月</span></div></div>
    <div style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.1);border-radius:var(--radius-md);font-size:13px;color:var(--text-muted);line-height:1.6"><div style="margin-bottom:8px;font-weight:500;color:var(--text-light)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>购买须知</div><ul style="margin:0;padding-left:20px"><li>购买后立即生效，有效期1个月</li><li>支付完成后将获得VPS连接信息</li><li>如有问题请通过工单系统联系客服</li></ul></div>`;
  document.getElementById("productDetailModal").classList.add("show");
}
function closeProductDetail() { document.getElementById("productDetailModal").classList.remove("show"); currentDetailProduct = null; }
function buyFromDetail() { if (currentDetailProduct) { closeProductDetail(); buyProductById(currentDetailProduct.id); } }
function buyProductById(id) { const p = productCache[id]; if (p) buyProduct(p.id, p.name, p.price); }

function buyProduct(id, name, price) {
  if (!currentUser) { showLogin(); return; }
  const p = productCache[id] || { id, name, price };
  if (p.can_buy === false || p.can_buy === 0 || p.can_buy === "0") { alert(p.buy_block_reason || "当前商品暂不可购买"); return; }
  selectedProduct = p; currentCoupon = null;
  const ci = document.getElementById("couponCode"), cm = document.getElementById("couponMsg");
  if (ci) ci.value = ""; if (cm) { cm.textContent = ""; cm.className = "coupon-msg"; }
  renderOrderSummary(); loadCreditSummary();
  document.getElementById("buyModal").classList.add("show");
}

function renderOrderSummary() {
  if (!selectedProduct) return;
  const bp = parseFloat(selectedProduct.base_price || selectedProduct.price || 0) || 0;
  const td = parseFloat(selectedProduct.trust_discount_amount || 0) || 0;
  const cd = currentCoupon ? parseFloat(currentCoupon.discount || 0) || 0 : 0;
  const pay = currentCoupon ? parseFloat(currentCoupon.final || 0) || 0 : parseFloat(selectedProduct.price || 0) || 0;
  const bal = getCurrentBalance();
  let h = `<div class="summary-row"><span>商品名称</span><span style="color:var(--text-main)">${escapeHtml(selectedProduct.name || "")}</span></div><div class="summary-row"><span>购买时长</span><span style="color:var(--text-main)">1个月</span></div><div class="summary-row"><span>原价</span><span style="color:var(--text-main)">${bp.toFixed(2)} 积分</span></div>`;
  if (td > 0) h += `<div class="summary-row discount-row"><span>社区等级优惠</span><span>-${td.toFixed(2)} 积分</span></div>`;
  if (cd > 0) h += `<div class="summary-row discount-row"><span>优惠券折扣</span><span>-${cd.toFixed(2)} 积分</span></div>`;
  h += `<div class="summary-row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"><span>应付积分</span><span class="final-price">${pay.toFixed(2)}</span></div><div class="summary-row"><span>当前余额</span><span style="color:${bal >= pay ? "var(--success)" : "var(--danger)"}">${bal.toFixed(2)} 积分</span></div>`;
  const el = document.getElementById("orderSummary"); if (el) el.innerHTML = h;
}

function validateCoupon() {
  if (!selectedProduct) return;
  const ci = document.getElementById("couponCode"), me = document.getElementById("couponMsg"), code = ci.value.trim();
  if (!code) { me.textContent = "请输入优惠券码"; me.className = "coupon-msg error"; return; }
  const body = new FormData(); body.append("action", "validate"); body.append("coupon_code", code); body.append("product_id", selectedProduct.id);
  me.textContent = "验证中..."; me.className = "coupon-msg";
  apiFetch("api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    if (data.code === 1) { currentCoupon = { code, discount: data.data.discount, final: data.data.final }; me.textContent = `验证成功：优惠 ${data.data.discount} 积分`; me.className = "coupon-msg success"; }
    else { currentCoupon = null; me.textContent = data.msg; me.className = "coupon-msg error"; }
    renderOrderSummary();
  }).catch(() => { me.textContent = "验证失败，请重试"; me.className = "coupon-msg error"; });
}

function closeBuy() { document.getElementById("buyModal").classList.remove("show"); selectedProduct = null; currentCoupon = null; }

function confirmBuy(method = "epay") {
  if (!selectedProduct) return;
  const body = new FormData(); body.append("action", "create"); body.append("product_id", selectedProduct.id);
  if (currentCoupon) body.append("coupon_code", currentCoupon.code);
  apiFetch("api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    if (data.code !== 1) { alert(data.msg || "创建订单失败"); return; }
    const orderNo = data.data.order_no;
    if (method === "balance") {
      const pb = new FormData(); pb.append("action", "pay_balance"); pb.append("order_no", orderNo);
      apiFetch("api/orders.php", { method: "POST", body: pb }).then((r) => r.json()).then((pd) => {
        if (pd.code === 1) { showToast("余额支付成功"); closeBuy(); loadCreditSummary(); loadCreditTransactions(); loadMyOrders(); loadProducts(); switchPage("orders"); }
        else { alert(pd.msg || "余额支付失败"); }
      }); return;
    }
    closeBuy(); window.location.href = "api/pay.php?order_no=" + encodeURIComponent(orderNo);
  });
}
function closeSuccess() { document.getElementById("successModal").classList.remove("show"); loadProducts(); loadMyOrders(); }

