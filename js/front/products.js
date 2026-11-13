/* =====================================================
   商品与购买：列表 / 筛选 / 详情 / 自动验券 / 智能下单
   ===================================================== */
let currentDetailProduct = null;
let allProductsList = [];
let activeProductRegion = "all";
let productSearchQuery = "";
let selectedPayMethod = "balance";
let couponValidateTimer = null;
let lastValidatedCouponCode = "";

function loadProducts() {
  const c = document.getElementById("buyProductList");
  const toolbar = document.getElementById("productFilterToolbar");
  if (!c) return;
  if (!currentUser) {
    if (toolbar) toolbar.style.display = "none";
    c.innerHTML = renderLoginRequired("登录后查看可购买配置", {
      icon: "cart",
      sub: "请登录后查看并兑换高性能VPS云服务器",
    });
    return;
  }
  apiFetch("api/products.php?action=list")
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1 || !Array.isArray(data.data)) {
        if (toolbar) toolbar.style.display = "none";
        c.innerHTML = `<p style="color:var(--danger);text-align:center;padding:40px;">${escapeHtml(data.msg || "加载失败")}</p>`;
        return;
      }
      allProductsList = data.data;
      productCache = {};
      allProductsList.forEach((p) => {
        productCache[p.id] = p;
      });
      renderRegionFilterChips(allProductsList);
      if (toolbar) toolbar.style.display = allProductsList.length ? "flex" : "none";
      renderFilteredProducts();
    })
    .catch(() => {
      if (toolbar) toolbar.style.display = "none";
      c.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">加载失败，请刷新重试</p>';
    });
}

function renderRegionFilterChips(list) {
  const wrap = document.getElementById("productRegionChips");
  if (!wrap) return;
  const regions = [];
  list.forEach((p) => {
    const r = String(p.region || "").trim();
    if (r && !regions.includes(r)) regions.push(r);
  });
  if (!regions.includes(activeProductRegion)) activeProductRegion = "all";
  let html = `<button type="button" class="filter-chip ${activeProductRegion === "all" ? "active" : ""}" data-region="all" onclick="setProductRegionFilter('all')">全部地区 (${list.length})</button>`;
  regions.forEach((r) => {
    const count = list.filter((p) => String(p.region || "").trim() === r).length;
    html += `<button type="button" class="filter-chip ${activeProductRegion === r ? "active" : ""}" data-region="${escapeHtml(r)}" onclick="setProductRegionFilter('${escapeHtml(r)}')">${escapeHtml(r)} (${count})</button>`;
  });
  wrap.innerHTML = html;
}

function setProductRegionFilter(region) {
  activeProductRegion = region || "all";
  document.querySelectorAll("#productRegionChips .filter-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.region === activeProductRegion);
  });
  renderFilteredProducts();
}

function onProductSearchInput(val) {
  productSearchQuery = String(val || "").trim().toLowerCase();
  renderFilteredProducts();
}

function renderFilteredProducts() {
  const c = document.getElementById("buyProductList");
  if (!c) return;
  const filtered = allProductsList.filter((p) => {
    if (activeProductRegion !== "all" && String(p.region || "").trim() !== activeProductRegion) {
      return false;
    }
    if (productSearchQuery) {
      const haystack = [p.name, p.cpu, p.memory, p.disk, p.bandwidth, p.region, p.line_type, p.os_type, p.template_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(productSearchQuery)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    c.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">' + appIcon("box", 44, { strokeWidth: 1.5 }) + '</div><p>' +
      (allProductsList.length ? "未找到符合筛选条件的实例配置" : "暂无可购买配置") +
      "</p></div>";
    return;
  }

  c.innerHTML = filtered
    .map((p) => {
      const canBuy = p.can_buy !== 0 && p.can_buy !== false;
      const buyText = canBuy ? "立即购买" : p.buy_block_reason || "暂不可购";
      const tdh =
        parseFloat(p.trust_discount_amount || 0) > 0
          ? `<div style="font-size:12px;color:var(--success);margin-top:6px">${escapeHtml(p.trust_discount_label || "社区等级优惠")}</div>`
          : "";
      const tplH = p.template_name
        ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">模板：${escapeHtml(p.template_name)}</div>`
        : "";
      const tags = [p.region, p.line_type, p.os_type]
        .filter(Boolean)
        .map((t) => `<span class="meta-tag">${escapeHtml(t)}</span>`)
        .join("");

      return `<div class="card buy-card" data-id="${p.id}">
        <div class="buy-card-head">
          <h3>${escapeHtml(p.name || "")}</h3>
          ${p.min_trust_level ? `<span class="meta-tag">TL${escapeHtml(String(p.min_trust_level))}+</span>` : ""}
        </div>
        ${tags ? `<div class="buy-card-meta-tags">${tags}</div>` : ""}
        <div class="specs">
          <div class="spec"><small>CPU</small><div class="spec-value">${escapeHtml(p.cpu || "-")}</div></div>
          <div class="spec"><small>内存</small><div class="spec-value">${escapeHtml(p.memory || "-")}</div></div>
          <div class="spec"><small>硬盘</small><div class="spec-value">${escapeHtml(p.disk || "-")}</div></div>
          <div class="spec"><small>带宽</small><div class="spec-value">${escapeHtml(p.bandwidth || "-")}</div></div>
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);line-height:1.6">
          ${p.risk_review ? '<div style="color:var(--warning)">此商品可能进入人工审核</div>' : ""}
          ${p.buy_block_reason && !canBuy ? `<div style="color:var(--danger)">${escapeHtml(p.buy_block_reason)}</div>` : ""}
          ${tplH}${tdh}
        </div>
        <div class="card-footer">
          <div>
            <div class="price">${parseFloat(p.price || 0).toFixed(2)}<span>积分/月</span></div>
            ${parseFloat(p.base_price || p.price || 0) > parseFloat(p.price || 0) ? `<div style="font-size:11.5px;color:var(--text-muted);text-decoration:line-through">${parseFloat(p.base_price).toFixed(2)} 积分</div>` : ""}
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn btn-outline btn-sm" onclick="showProductDetail(${p.id})">详情</button>
            <button class="btn btn-sm ${canBuy ? "btn-primary" : "btn-outline"}" ${canBuy ? "" : "disabled"} onclick="buyProductById(${p.id})">${escapeHtml(buyText)}</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function showProductDetail(id) {
  const p = productCache[id];
  if (!p) return;
  currentDetailProduct = p;
  document.getElementById("productDetailTitle").textContent = p.name;
  document.getElementById("productDetailBody").innerHTML = `
    <div style="margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${[["CPU", p.cpu], ["内存", p.memory], ["硬盘", p.disk], ["带宽", p.bandwidth], ["地区", p.region], ["线路", p.line_type]]
          .filter((row) => row[1])
          .map(([l, v]) => `<div style="background:var(--bg-muted);border:1px solid var(--border-light);padding:12px 14px;border-radius:var(--radius-md)"><div style="font-size:11.5px;color:var(--text-muted);margin-bottom:3px">${l}</div><div style="font-size:14.5px;font-weight:600;color:var(--text-main)">${escapeHtml(v)}</div></div>`)
          .join("")}
      </div>
    </div>
    ${p.description ? `<div style="margin-bottom:16px;font-size:13.5px;color:var(--text-light);line-height:1.65">${escapeHtml(p.description)}</div>` : ""}
    <div style="background:var(--primary-light);border:1px solid rgba(99,102,241,0.25);padding:14px;border-radius:var(--radius-md);text-align:center">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">月付价格</div>
      <div style="font-size:26px;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums">${parseFloat(p.price || 0).toFixed(2)}<span style="font-size:13px;font-weight:500;margin-left:4px">积分/月</span></div>
    </div>
    <div style="margin-top:14px;padding:12px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-md);font-size:12.5px;color:var(--text-muted);line-height:1.65">
      <div style="margin-bottom:6px;font-weight:600;color:var(--text-light)">购买须知</div>
      <ul style="margin:0;padding-left:18px;list-style:disc">
        <li>购买后立即生效，有效期 1 个月</li>
        <li>支付完成后将在实例列表中自动展示 IP 与 SSH 连接凭据</li>
        <li>如有异常可通过帮助支持提交工单或申请退款</li>
      </ul>
    </div>`;
  document.getElementById("productDetailModal").classList.add("show");
}

function closeProductDetail() {
  document.getElementById("productDetailModal").classList.remove("show");
  currentDetailProduct = null;
}

function buyFromDetail() {
  if (currentDetailProduct) {
    const id = currentDetailProduct.id;
    closeProductDetail();
    buyProductById(id);
  }
}

function buyProductById(id) {
  const p = productCache[id];
  if (p) buyProduct(p.id, p.name, p.price);
}

function bindCouponAutoValidate() {
  const ci = document.getElementById("couponCode");
  if (!ci || ci._autoBound) return;
  ci._autoBound = true;
  const trigger = () => {
    const code = ci.value.trim().toUpperCase();
    const clearBtn = document.getElementById("clearCouponBtn");
    if (clearBtn) clearBtn.style.display = code ? "inline-flex" : "none";
    clearTimeout(couponValidateTimer);
    if (!code) {
      lastValidatedCouponCode = "";
      if (currentCoupon) {
        currentCoupon = null;
        renderOrderSummary();
      }
      const cm = document.getElementById("couponMsg");
      if (cm) {
        cm.textContent = "";
        cm.className = "coupon-msg";
      }
      return;
    }
    if (code.length < 3) return;
    couponValidateTimer = setTimeout(() => {
      if (code !== lastValidatedCouponCode) {
        validateCoupon(true);
      }
    }, 320);
  };
  ci.addEventListener("input", trigger);
  ci.addEventListener("paste", () => setTimeout(trigger, 20));
}

function applyCouponHint(code) {
  const ci = document.getElementById("couponCode");
  if (!ci) return;
  ci.value = code;
  const clearBtn = document.getElementById("clearCouponBtn");
  if (clearBtn) clearBtn.style.display = "inline-flex";
  validateCoupon(false);
}

function clearCouponCode() {
  const ci = document.getElementById("couponCode");
  const cm = document.getElementById("couponMsg");
  const clearBtn = document.getElementById("clearCouponBtn");
  if (ci) ci.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  if (cm) {
    cm.textContent = "";
    cm.className = "coupon-msg";
  }
  lastValidatedCouponCode = "";
  currentCoupon = null;
  renderOrderSummary();
}

function buyProduct(id, name, price) {
  if (!currentUser) {
    showLogin();
    return;
  }
  const p = productCache[id] || { id, name, price };
  if (p.can_buy === false || p.can_buy === 0 || p.can_buy === "0") {
    showToast(p.buy_block_reason || "当前商品暂不可购买", "warning");
    return;
  }
  selectedProduct = p;
  currentCoupon = null;
  lastValidatedCouponCode = "";
  const ci = document.getElementById("couponCode");
  const cm = document.getElementById("couponMsg");
  const clearBtn = document.getElementById("clearCouponBtn");
  if (ci) ci.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  if (cm) {
    cm.textContent = "";
    cm.className = "coupon-msg";
  }
  bindCouponAutoValidate();
  renderOrderSummary();
  loadCreditSummary();
  document.getElementById("buyModal").classList.add("show");
}

function getEffectivePayAmount() {
  if (!selectedProduct) return 0;
  return currentCoupon
    ? parseFloat(currentCoupon.final || 0) || 0
    : parseFloat(selectedProduct.price || 0) || 0;
}

function updatePayMethodUI() {
  const pay = getEffectivePayAmount();
  const bal = getCurrentBalance();
  const canBalance = bal >= pay;
  const balCard = document.getElementById("payCardBalance");
  const epayCard = document.getElementById("payCardEpay");
  const balBadge = document.getElementById("payBadgeBalance");
  const balDesc = document.getElementById("payDescBalance");
  const ctaBtn = document.getElementById("confirmCheckoutBtn");

  if (!canBalance && selectedPayMethod === "balance") {
    selectedPayMethod = "epay";
  } else if (canBalance && selectedPayMethod !== "epay") {
    selectedPayMethod = "balance";
  }

  if (balCard) {
    balCard.classList.toggle("disabled", !canBalance);
    balCard.classList.toggle("selected", selectedPayMethod === "balance");
  }
  if (epayCard) {
    epayCard.classList.toggle("selected", selectedPayMethod === "epay");
  }
  if (balBadge) {
    if (canBalance) {
      balBadge.textContent = "推荐 · 免跳转";
      balBadge.className = "checkout-pay-badge recommended";
    } else {
      balBadge.textContent = `差 ${(pay - bal).toFixed(2)} 积分`;
      balBadge.className = "checkout-pay-badge shortfall";
    }
  }
  if (balDesc) {
    balDesc.textContent = `当前可用：${bal.toFixed(2)} 积分`;
  }
  if (ctaBtn) {
    ctaBtn.disabled = false;
    ctaBtn.textContent =
      selectedPayMethod === "balance"
        ? `使用余额立即支付 (${pay.toFixed(2)} 积分)`
        : `使用 Linux DO Credit 支付 (${pay.toFixed(2)} 积分)`;
  }
}

function selectPayMethod(method) {
  const pay = getEffectivePayAmount();
  const bal = getCurrentBalance();
  if (method === "balance" && bal < pay) {
    showToast(`余额不足，还差 ${(pay - bal).toFixed(2)} 积分，已为您保持 Linux DO Credit 支付`, "warning");
    selectedPayMethod = "epay";
    updatePayMethodUI();
    return;
  }
  selectedPayMethod = method === "balance" ? "balance" : "epay";
  updatePayMethodUI();
}

function renderOrderSummary() {
  if (!selectedProduct) return;
  const bp = parseFloat(selectedProduct.base_price || selectedProduct.price || 0) || 0;
  const td = parseFloat(selectedProduct.trust_discount_amount || 0) || 0;
  const cd = currentCoupon ? parseFloat(currentCoupon.discount || 0) || 0 : 0;
  const pay = getEffectivePayAmount();
  const bal = getCurrentBalance();

  // 每次价格变化自动重新匹配最优支付方式
  selectedPayMethod = bal >= pay ? "balance" : "epay";

  let h = `<div class="summary-row"><span>商品名称</span><span style="color:var(--text-main);font-weight:600">${escapeHtml(selectedProduct.name || "")}</span></div>
    <div class="summary-row"><span>购买时长</span><span style="color:var(--text-main)">1 个月</span></div>
    <div class="summary-row"><span>原价</span><span style="color:var(--text-main)">${bp.toFixed(2)} 积分</span></div>`;
  if (td > 0) h += `<div class="summary-row discount-row"><span>社区等级优惠</span><span>-${td.toFixed(2)} 积分</span></div>`;
  if (cd > 0) h += `<div class="summary-row discount-row"><span>优惠券 (${escapeHtml(currentCoupon.code)})</span><span>-${cd.toFixed(2)} 积分</span></div>`;
  h += `<div class="summary-row" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)"><span>实付积分</span><span class="final-price">${pay.toFixed(2)}</span></div>`;

  const el = document.getElementById("orderSummary");
  if (el) el.innerHTML = h;
  updatePayMethodUI();
}

function validateCoupon(isAuto) {
  if (!selectedProduct) return;
  const ci = document.getElementById("couponCode");
  const me = document.getElementById("couponMsg");
  const code = (ci ? ci.value : "").trim().toUpperCase();
  if (!code) {
    if (!isAuto && me) {
      me.textContent = "请输入优惠券码";
      me.className = "coupon-msg error";
    }
    return;
  }
  lastValidatedCouponCode = code;
  const body = new FormData();
  body.append("action", "validate");
  body.append("coupon_code", code);
  body.append("product_id", selectedProduct.id);
  if (me) {
    me.textContent = "正在自动校验券码...";
    me.className = "coupon-msg";
  }
  apiFetch("api/coupons.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if ((ci ? ci.value.trim().toUpperCase() : "") !== code) return;
      if (data.code === 1) {
        currentCoupon = { code, discount: data.data.discount, final: data.data.final };
        if (me) {
          me.textContent = `已自动应用优惠券：立减 ${parseFloat(data.data.discount || 0).toFixed(2)} 积分`;
          me.className = "coupon-msg success";
        }
      } else {
        currentCoupon = null;
        if (me) {
          me.textContent = data.msg || "优惠券不可用";
          me.className = "coupon-msg error";
        }
      }
      renderOrderSummary();
    })
    .catch(() => {
      if (me) {
        me.textContent = "验证失败，请重试";
        me.className = "coupon-msg error";
      }
    });
}

function closeBuy() {
  clearTimeout(couponValidateTimer);
  document.getElementById("buyModal").classList.remove("show");
  selectedProduct = null;
  currentCoupon = null;
  lastValidatedCouponCode = "";
}

function submitCheckout() {
  confirmBuy(selectedPayMethod || "epay");
}

function confirmBuy(method = "epay") {
  if (!selectedProduct) return;
  const ctaBtn = document.getElementById("confirmCheckoutBtn");
  if (ctaBtn) {
    ctaBtn.disabled = true;
    ctaBtn.textContent = "处理中…";
  }

  const body = new FormData();
  body.append("action", "create");
  body.append("product_id", selectedProduct.id);
  if (currentCoupon) body.append("coupon_code", currentCoupon.code);

  apiFetch("api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1) {
        showToast(data.msg || "创建订单失败", "error");
        updatePayMethodUI();
        return;
      }
      const orderNo = data.data.order_no;
      if (method === "balance") {
        const pb = new FormData();
        pb.append("action", "pay_balance");
        pb.append("order_no", orderNo);
        apiFetch("api/orders.php", { method: "POST", body: pb })
          .then((r) => r.json())
          .then((pd) => {
            if (pd.code === 1) {
              showToast("购买成功，正在前往查看订单与连接凭据", "success");
              closeBuy();
              loadCreditSummary();
              loadCreditTransactions();
              loadMyOrders();
              loadProducts();
              switchPage("instances");
            } else {
              showToast(pd.msg || "余额支付失败", "error");
              updatePayMethodUI();
            }
          })
          .catch(() => {
            showToast("余额支付请求失败，请到订单列表查看", "error");
            updatePayMethodUI();
          });
        return;
      }
      closeBuy();
      window.location.href = "api/pay.php?order_no=" + encodeURIComponent(orderNo);
    })
    .catch(() => {
      showToast("下单请求失败，请重试", "error");
      updatePayMethodUI();
    });
}

function closeSuccess() {
  document.getElementById("successModal").classList.remove("show");
  loadProducts();
  loadMyOrders();
}
