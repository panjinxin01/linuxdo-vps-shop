/* =====================================================
   商品管理：列表 / 新增 / 编辑 / 规格预设 / 删除 / 退出登录
   ===================================================== */
const VPS_SPEC_PRESETS = {
  "1c1g": { cpu: "1核", memory: "1GB", disk: "20GB SSD", bandwidth: "100Mbps", price: "30", os_type: "Debian 12" },
  "2c2g": { cpu: "2核", memory: "2GB", disk: "40GB SSD", bandwidth: "200Mbps", price: "60", os_type: "Debian 12" },
  "4c4g": { cpu: "4核", memory: "4GB", disk: "80GB NVMe", bandwidth: "500Mbps", price: "120", os_type: "Ubuntu 22.04" },
  "8c8g": { cpu: "8核", memory: "8GB", disk: "160GB NVMe", bandwidth: "1Gbps", price: "240", os_type: "Ubuntu 22.04" },
};

function applySpecPreset(presetKey, mode = "product") {
  const preset = VPS_SPEC_PRESETS[presetKey];
  if (!preset) return;
  if (mode === "template") {
    const map = { tplCpu: "cpu", tplMemory: "memory", tplDisk: "disk", tplBandwidth: "bandwidth", tplOsType: "os_type" };
    Object.entries(map).forEach(([elId, key]) => {
      const el = document.getElementById(elId);
      if (el && preset[key]) el.value = preset[key];
    });
    showToast(`已填入 ${preset.cpu} / ${preset.memory} 模板预设`, "info");
    return;
  }
  const map = { pCpu: "cpu", pMem: "memory", pDisk: "disk", pBw: "bandwidth", pOsType: "os_type" };
  Object.entries(map).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && preset[key]) el.value = preset[key];
  });
  const priceEl = document.getElementById("pPrice");
  if (priceEl && !priceEl.value) priceEl.value = preset.price;
  showToast(`已填入 ${preset.cpu} / ${preset.memory} 规格预设`, "info");
}

function loadProducts() {
  apiFetch("../api/products.php?action=all")
    .then((r) => r.json())
    .then((data) => {
      const tbody = document.getElementById("productTable");
      if (!tbody) return;
      if (data.code !== 1 || !data.data || data.data.length === 0) {
        productCache = {};
        tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无商品</td></tr>';
        return;
      }
      productCache = {};
      data.data.forEach((p) => {
        productCache[p.id] = p;
      });
      tbody.innerHTML = data.data
        .map(
          (p) =>
            `<tr>
              <td>${p.id}</td>
              <td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(p.name)}</span><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.template_name || "")}</div></td>
              <td>${escapeHtml(p.cpu) || "-"}/${escapeHtml(p.memory) || "-"}/${escapeHtml(p.disk) || "-"}<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.region || "-")} · TL${parseInt(p.min_trust_level || 0)}</div></td>
              <td>${parseFloat(p.price || 0).toFixed(2)}积分</td>
              <td><code>${escapeHtml(p.ip_address || "-")}</code></td>
              <td><span class="badge ${p.status == 1 ? "on" : "off"}">${p.status == 1 ? "在售" : "已售"}</span></td>
              <td><div class="admin-inline-actions"><button type="button" class="action-btn edit" onclick="editProductById(${p.id})">编辑</button><button type="button" class="action-btn del" onclick="deleteProduct(${p.id})">删除</button></div></td>
            </tr>`
        )
        .join("");
    });
}

function showAddProduct() {
  document.getElementById("productModalTitle").textContent = "添加商品";
  ["pId", "pName", "pCpu", "pMem", "pDisk", "pBw", "pPrice", "pIp", "pPort", "pUser", "pPass", "pExtra", "pRegion", "pLineType", "pOsType", "pDescription"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("pPort").value = "22";
  document.getElementById("pUser").value = "root";
  document.getElementById("pTemplate").value = "";
  document.getElementById("pMinTrustLevel").value = "0";
  document.getElementById("pRiskReviewRequired").checked = false;
  document.getElementById("pAllowWhitelistOnly").checked = false;
  loadProductTemplateOptions();
  document.getElementById("productModal").classList.add("show");
}

function editProduct(p) {
  document.getElementById("productModalTitle").textContent = "编辑商品";
  const fields = {
    pId: "id",
    pName: "name",
    pCpu: "cpu",
    pMem: "memory",
    pDisk: "disk",
    pBw: "bandwidth",
    pPrice: "price",
    pIp: "ip_address",
    pPort: "ssh_port",
    pUser: "ssh_user",
    pPass: "ssh_password",
    pExtra: "extra_info",
    pRegion: "region",
    pLineType: "line_type",
    pOsType: "os_type",
    pDescription: "description",
  };
  Object.entries(fields).forEach(([elId, key]) => {
    document.getElementById(elId).value = p[key] || (key === "ssh_port" ? 22 : key === "ssh_user" ? "root" : "");
  });
  document.getElementById("pMinTrustLevel").value = p.min_trust_level || 0;
  document.getElementById("pRiskReviewRequired").checked = parseInt(p.risk_review_required || 0) === 1;
  document.getElementById("pAllowWhitelistOnly").checked = parseInt(p.allow_whitelist_only || 0) === 1;
  loadProductTemplateOptions(p.template_id || "");
  document.getElementById("productModal").classList.add("show");
}

function editProductById(id) {
  const p = productCache[id];
  if (p) editProduct(p);
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("show");
}

function saveProduct() {
  const body = new FormData();
  const id = document.getElementById("pId").value;
  body.append("action", id ? "edit" : "add");
  if (id) body.append("id", id);
  "name:pName,cpu:pCpu,memory:pMem,disk:pDisk,bandwidth:pBw,price:pPrice,ip_address:pIp,ssh_port:pPort,ssh_user:pUser,ssh_password:pPass,extra_info:pExtra,region:pRegion,line_type:pLineType,os_type:pOsType,description:pDescription,template_id:pTemplate,min_trust_level:pMinTrustLevel"
    .split(",")
    .forEach((pair) => {
      const [k, elId] = pair.split(":");
      const el = document.getElementById(elId);
      body.append(k, el ? el.value : "");
    });
  body.append("risk_review_required", document.getElementById("pRiskReviewRequired").checked ? "1" : "0");
  body.append("allow_whitelist_only", document.getElementById("pAllowWhitelistOnly").checked ? "1" : "0");
  apiFetch("../api/products.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("商品保存成功", "success");
        closeProductModal();
        loadProducts();
        loadStats();
      } else {
        showToast(data.msg || "保存失败", "error");
      }
    })
    .catch(() => showToast("保存请求失败", "error"));
}

async function deleteProduct(id) {
  const p = productCache[id];
  const ok = await showConfirmModal({
    title: "删除商品",
    message: `确定删除商品“${p ? p.name : "#" + id}”吗？`,
    confirmText: "确认删除",
    danger: true,
  });
  if (!ok) return;
  const body = new FormData();
  body.append("action", "delete");
  body.append("id", id);
  apiFetch("../api/products.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      showToast(data.msg || (data.code === 1 ? "商品已删除" : "删除失败"), data.code === 1 ? "success" : "error");
      if (data.code === 1) {
        loadProducts();
        loadStats();
      }
    })
    .catch(() => showToast("删除请求失败", "error"));
}

function logout() {
  apiFetch("../api/admin.php", {
    method: "POST",
    body: new URLSearchParams({ action: "logout" }),
  }).then(() => (window.location.href = "login.html"));
}
