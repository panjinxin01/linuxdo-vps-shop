// 管理后台逻辑 - 优化版

let productCache = {};
let adminOrderPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
let auditPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
let currentAdminInfo = { id: 0, username: '', role: 'admin' };
let csrfToken = '';
// 页面标题映射
const tabTitles = {
    dashboard: '仪表盘', products: '商品管理', orders: '订单管理', coupons: '优惠券管理',
    tickets: '工单管理', announcements: '公告管理', admins: '管理员管理', audit_logs: '操作日志', settings: '系统设置'
};

function initCsrfToken() {
    return window.fetch('../api/csrf.php', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data && data.data.token) {
                csrfToken = data.data.token;
            }
        })
        .catch(() => {});
}

function apiFetch(url, options = {}) {
    const opts = { credentials: 'same-origin', ...options };
    const method = (opts.method || 'GET').toUpperCase();
    const ensureToken = (!csrfToken && method !== 'GET' && method !== 'HEAD') ? initCsrfToken() : Promise.resolve();
    return ensureToken.then(() => {
        const headers = new Headers(opts.headers || {});
        if (csrfToken && !headers.has('X-CSRF-Token')) {
            headers.set('X-CSRF-Token', csrfToken);
        }
        opts.headers = headers;
        return window.fetch(url, opts);
    });
}

// 侧边栏
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// 用户菜单
function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('userMenu');
    if (!menu) return;
    menu.classList.toggle('show');
}
function closeUserMenu() {
    const menu = document.getElementById('userMenu');
    if (menu) menu.classList.remove('show');
}

// 切换Tab
function switchTab(tab) {
    document.querySelectorAll('.menu-item').forEach(x => x.classList.remove('active'));
    const target = document.querySelector(`.menu-item[data-tab="${tab}"]`);
    if (target) target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    // 更新面包屑
    const bc = document.getElementById('breadcrumbCurrent');
    if (bc) bc.textContent = tabTitles[tab] || tab;
    if (window.innerWidth <= 768) closeSidebar();
}

// 刷新所有数据
function refreshAll() {
    init();
    showToast('数据已刷新');
}

// Toast
function showToast(msg) {
    let t = document.getElementById('adminToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'adminToast';
        t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;opacity:0;transition:opacity 0.3s';
        document.body.appendChild(t);}
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => t.style.opacity = '0', 2000);
}

// XSS防护
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    initCsrfToken();
    apiFetch('../api/admin.php?action=check')
        .then(r => r.json())
        .then(data => {
            if (data.code !== 1) window.location.href = 'login.html';
            else {
                if (data.data) {
                    currentAdminInfo = data.data;
                    updateAdminUI();
                }init();
            }
        });
    // Tab切换事件
    document.querySelectorAll('.menu a[data-tab]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            switchTab(a.dataset.tab);
        });
    });
    document.addEventListener('click', e => {
        const menu = document.getElementById('userMenu');
        const trigger = document.querySelector('.user-dropdown');
        if (!menu || !trigger) return;
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.classList.remove('show');
        }
    });
});

// 更新管理员显示
function updateAdminUI() {
    const avatar = document.getElementById('adminAvatar');
    const name = document.getElementById('adminName');
    const role = document.getElementById('adminRole');
    if (avatar && currentAdminInfo.username) avatar.textContent = currentAdminInfo.username.charAt(0).toUpperCase();
    if (name) name.textContent = currentAdminInfo.username || '管理员';
    if (role) role.textContent = currentAdminInfo.role === 'super' ? '超级管理员' : '管理员';
}
function init() {
    loadStats();
    loadProducts();
    loadOrders();
    loadCoupons();
    loadSettings();
    loadOAuthSettings();
    loadSmtpSettings();
    loadCacheStats();
    loadTickets();
    loadAnnouncements();
    loadTicketStats();
    loadRecentOrders();
    loadRecentTickets();
    loadAdmins();
    loadAuditLogs();
    checkDbMissing();
}

// 检测数据库缺失表，弹窗提示
function checkDbMissing() {
    // 同一会话只提示一次
    if (sessionStorage.getItem('dbUpdateDismissed')) return;
    apiFetch('../api/update_db.php?action=check')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data && !data.data.all_installed && data.data.missing && data.data.missing.length > 0) {
                var el = document.getElementById('dbMissingTables');
                if (el) el.innerHTML = data.data.missing.map(t => '<code style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:4px;margin:2px 4px;display:inline-block">' + escapeHtml(t) + '</code>').join(' ');
                var modal = document.getElementById('dbUpdateModal');
                if (modal) modal.classList.add('show');
            }
        })
        .catch(function() {});
}

function closeDbUpdateModal() {
    var modal = document.getElementById('dbUpdateModal');
    if (modal) modal.classList.remove('show');sessionStorage.setItem('dbUpdateDismissed', '1');
}
// 加载统计
function loadStats() {
    apiFetch('../api/orders.php?action=stats')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                document.getElementById('statProducts').textContent = data.data.products;
                document.getElementById('statUsers').textContent = data.data.users;
                document.getElementById('statPending').textContent = data.data.pending;
                document.getElementById('statPaid').textContent = data.data.paid;
                document.getElementById('statIncome').textContent = data.data.income;
            }
        });
}

// 加载商品
function loadProducts() {
    apiFetch('../api/products.php?action=all')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('productTable');
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无商品</td></tr>';
                return;
            }
            //缓存商品数据
            productCache = {};
            data.data.forEach(p => { productCache[p.id] = p; });
            
            tbody.innerHTML = data.data.map(p => `
                <tr>
                    <td>${p.id}</td>
                    <td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(p.name)}</span></td>
                    <td>${escapeHtml(p.cpu) || '-'}/${escapeHtml(p.memory) || '-'}/${escapeHtml(p.disk) || '-'}</td>
                    <td>${p.price}积分</td>
                    <td>${escapeHtml(p.ip_address)}</td>
                    <td><span class="badge ${p.status == 1 ? 'on' : 'off'}">${p.status == 1 ? '在售' : '已售'}</span></td>
                    <td>
                        <button class="action-btn edit" onclick="editProductById(${p.id})">编辑</button>
                        <button class="action-btn del" onclick="deleteProduct(${p.id})">删除</button>
                    </td>
                </tr>
            `).join('');
        });
}
// 加载订单（支持分页）
function loadOrders(page = 1) {
    adminOrderPagination.page = page;
    var tbody = document.getElementById('orderTable');
    var container = document.getElementById('orderTableContainer') || tbody.parentNode;
    tbody.innerHTML = '<tr><td colspan="7" class="empty">加载中...</td></tr>';
    apiFetch('../api/orders.php?action=all&page=' + page + '&page_size=' + adminOrderPagination.pageSize, {credentials: 'same-origin'})
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.code !== 1) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">' + (data.msg || '加载失败') + '</td></tr>';
                removePagination('orderPagination');
                return;
            }
            if (!data.data || !data.data.list || data.data.list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无订单</td></tr>';
                removePagination('orderPagination');
                return;
            }
            
            // 更新分页状态
            adminOrderPagination.total = data.data.total;
            adminOrderPagination.totalPages = data.data.total_pages;
            
            const orders = data.data.list;
            tbody.innerHTML = orders.map(o => {
                let statusClass = o.status == 1 ? 'on' : (o.status == 2 ? 'off' : (o.status == 3 ? 'off' : 'wait'));
                let statusText = o.status == 1 ? '已支付' : (o.status == 2 ? '已退款' : (o.status == 3 ? '已取消' : '待支付'));
            let actionHtml = `<button class="action-btn edit" onclick="showOrderDetail('${escapeHtml(o.order_no)}')">详情</button>`;
                if (o.status == 1) {
                    actionHtml += `<button class="action-btn del" onclick="refundOrder('${escapeHtml(o.order_no)}', ${o.price})">退款</button>`;
                } else {
                    actionHtml += `<button class="action-btn del" onclick="deleteOrder('${escapeHtml(o.order_no)}')">删除</button>`;
                }
                return `
                    <tr>
                        <td><code style="color:var(--primary)">${escapeHtml(o.order_no)}</code></td>
                        <td>${escapeHtml(o.product_name) || '已删除'}</td>
                        <td>${escapeHtml(o.buyer_name) || '-'}</td>
                        <td>${o.price}积分</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                        <td style="color:var(--text-muted);font-size:12px">${escapeHtml(o.created_at)}</td>
                        <td>${actionHtml}</td>
                    </tr>
                `;
            }).join('');
            
            // 添加分页控件
            if (adminOrderPagination.totalPages > 1) {
                renderAdminPagination('orderPagination', adminOrderPagination.page, adminOrderPagination.totalPages,'loadOrders', container);
            } else {
                removePagination('orderPagination');
            }
        });
}

// 渲染后台分页控件
function renderAdminPagination(id, current, total, callback, container) {
    removePagination(id);
    
    let pages = [];
    const delta = 2;
    for (let i = 1; i <= total; i++) {
        if (i === 1|| i === total || (i >= current - delta && i <= current + delta)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }
    
    let html = `<div class="admin-pagination" id="${id}">`;
    html += `<span class="page-info">共${adminOrderPagination.total} 条，第${current}/${total} 页</span>`;
    html += `<div class="page-btns">`;
    html += `<button class="page-btn" ${current <= 1 ? 'disabled' : ''} onclick="${callback}(${current - 1})">上一页</button>`;
    pages.forEach(p => {
        if (p === '...') {
            html += '<span class="page-dots">...</span>';
        } else {
            html += `<button class="page-btn ${p === current ? 'active' : ''}" onclick="${callback}(${p})">${p}</button>`;
        }
    });
    
    html += `<button class="page-btn" ${current >= total ? 'disabled' : ''} onclick="${callback}(${current + 1})">下一页</button>`;
    html += `</div></div>`;
    
    container.insertAdjacentHTML('afterend', html);
}
// 移除分页控件
function removePagination(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
// 删除订单
function deleteOrder(orderNo) {
    if (!confirm(`确定要删除订单 ${orderNo} 吗？\n\n此操作不可恢复。`)) {
        return;
    }
    
    const body = new FormData();
    body.append('action', 'delete');
    body.append('order_no', orderNo);
    
    apiFetch('../api/orders.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) {
                loadOrders();
                loadStats();
            }
        })
        .catch(err => alert('删除请求失败'));
}

// 批量删除订单
function batchDeleteOrders(type) {
    let typeText = type === 'expired' ? '已取消/超时' : (type === 'refunded' ? '已退款' : '待支付');
    if (!confirm(`确定要删除所有"${typeText}"的订单吗？\n\n此操作不可恢复。`)) {
        return;
    }
    
    const body = new FormData();
    body.append('action', 'batch_delete');
    body.append('type', type);
    
    apiFetch('../api/orders.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) {
                loadOrders();
                loadStats();
            }
        })
        .catch(err => alert('批量删除请求失败'));
}

// 显示订单详情
function showOrderDetail(orderNo) {
    apiFetch('../api/orders.php?action=detail&order_no=' + encodeURIComponent(orderNo))
        .then(r => r.json())
        .then(data => {
            if (data.code !== 1|| !data.data) {
                alert(data.msg || '获取订单详情失败');
                return;
            }
            const o = data.data;
            let statusText = ['待支付', '已支付', '已退款', '已取消'][o.status] || '未知';
            let statusClass = o.status == 1 ? 'on' : (o.status == 0 ? 'wait' : 'off');
            
            let html = `
                <div style="display:grid;gap:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border)">
                        <span style="font-weight:600">订单号：${escapeHtml(o.order_no)}</span>
                        <span class="badge ${statusClass}">${statusText}</span>
                    </div>
                    <div><strong>商品：</strong>${escapeHtml(o.product_name || '已删除')}</div>
                    <div><strong>用户：</strong>${escapeHtml(o.username || '-')}</div>
                    <div><strong>金额：</strong>${o.price} 积分${o.coupon_code ? ` (原价${o.original_price}，优惠券${escapeHtml(o.coupon_code)}减${o.coupon_discount})` : ''}</div>
                    <div><strong>创建时间：</strong>${escapeHtml(o.created_at)}</div>
                    ${o.paid_at ? `<div><strong>支付时间：</strong>${escapeHtml(o.paid_at)}</div>` : ''}
                    ${o.trade_no ? `<div><strong>交易号：</strong>${escapeHtml(o.trade_no)}</div>` : ''}
                    ${o.delivered_at ? `<div><strong>交付时间：</strong>${escapeHtml(o.delivered_at)}</div>` : ''}
                    ${o.refund_at ? `<div><strong>退款时间：</strong>${escapeHtml(o.refund_at)} (${escapeHtml(o.refund_reason || '')})</div>` : ''}
                    ${o.cancelled_at ? `<div><strong>取消时间：</strong>${escapeHtml(o.cancelled_at)} (${escapeHtml(o.cancel_reason || '')})</div>` : ''}
                </div>
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                    <div style="font-weight:600;margin-bottom:8px">📝 管理员备注</div>
                    <textarea id="orderAdminNote" rows="2" style="width:100%;resize:vertical" placeholder="添加备注...">${escapeHtml(o.admin_note || '')}</textarea><button class="btn btn-outline" style="margin-top:8px;padding:6px 12px;font-size:12px" onclick="saveOrderNote('${escapeHtml(o.order_no)}')">保存备注</button>
                </div>
                ${o.status == 1 && !o.delivered_at ? `
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                    <div style="font-weight:600;margin-bottom:8px">📦 交付信息</div>
                    <textarea id="orderDeliveryInfo" rows="3" style="width:100%;resize:vertical" placeholder="填写VPS连接信息等交付内容...">${escapeHtml(o.delivery_info || '')}</textarea>
                    <button class="btn btn-primary" style="margin-top:8px;padding:6px 12px;font-size:12px" onclick="markOrderDelivered('${escapeHtml(o.order_no)}')">标记已交付</button>
                </div>
                ` : ''}
            `;
            
            // 复用工单详情弹窗
            document.getElementById('adminTicketTitle').textContent = '订单详情';
            document.getElementById('adminTicketBody').innerHTML = html;
            document.getElementById('adminTicketFoot').innerHTML = `<button class="btn btn-primary" onclick="closeAdminTicketDetail()">关闭</button>`;
            document.getElementById('ticketDetailModal').classList.add('show');
        });
}

// 保存订单备注
function saveOrderNote(orderNo) {
    const note = document.getElementById('orderAdminNote').value;
    const body = new FormData();
    body.append('action', 'update_note');
    body.append('order_no', orderNo);
    body.append('admin_note', note);
    
    apiFetch('../api/orders.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('备注已保存');} else {
                alert(data.msg || '保存失败');
            }
        });
}

// 标记订单已交付
function markOrderDelivered(orderNo) {
    const info = document.getElementById('orderDeliveryInfo').value;
    const body = new FormData();
    body.append('action', 'mark_delivered');
    body.append('order_no', orderNo);
    body.append('delivery_info', info);
    
    apiFetch('../api/orders.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('已标记交付');
                showOrderDetail(orderNo);
            } else {
                alert(data.msg || '操作失败');
            }
        });
}

// 导出数据
function exportData(type) {
    window.open('../api/export.php?type=' + type, '_blank');
}

// 退款订单
function refundOrder(orderNo, price) {
    const choice = prompt(`确定要对订单 ${orderNo} 进行退款吗？
退款金额：${price}积分

请输入退款方式：
original = 原路退回支付账户
balance = 退回站内余额`, 'original');
    if (choice === null) return;
    const mode = String(choice).trim().toLowerCase() === 'balance' ? 'balance' : 'original';
    const reason = prompt('请输入退款原因（会留痕记录）', '人工退款') || '人工退款';
    const body = new FormData();
    body.append('action', 'refund');
    body.append('order_no', orderNo);
    body.append('refund_target', mode);
    body.append('refund_reason', reason);
    apiFetch('../api/orders.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg || (data.code === 1 ? '退款成功' : '退款失败'));
            if (data.code === 1) {
                loadOrders();
                loadStats();
            }
        })
        .catch(() => alert('退款请求失败'));
}

// 加载设置
function loadSettings() {
    apiFetch('../api/settings.php?action=get')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data) {
                document.getElementById('cfgPid').value = data.data.epay_pid || '';
                document.getElementById('cfgKey').value = data.data.epay_key || '';
                document.getElementById('cfgNotify').value = data.data.notify_url || '';
                document.getElementById('cfgReturn').value = data.data.return_url || '';
            }
        });
}

// 保存设置
// 保存支付设置
function savePaySettings() {
    const body = new FormData();
    body.append('action', 'save');
    body.append('epay_pid', document.getElementById('cfgPid').value);
    body.append('epay_key', document.getElementById('cfgKey').value);
    body.append('notify_url', document.getElementById('cfgNotify').value);
    body.append('return_url', document.getElementById('cfgReturn').value);
    
    apiFetch('../api/settings.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => alert(data.msg));
}

// 加载OAuth设置
function loadOAuthSettings() {
    apiFetch('../api/settings.php?action=get_oauth')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data) {
                document.getElementById('cfgOAuthClientId').value = data.data.client_id || '';
                document.getElementById('cfgOAuthClientSecret').value = data.data.client_secret || '';
                document.getElementById('cfgOAuthRedirectUri').value = data.data.redirect_uri || '';}
        });
}

// 保存OAuth设置
function saveOAuthSettings() {
    const body = new FormData();
    body.append('action', 'save_oauth');
    body.append('client_id', document.getElementById('cfgOAuthClientId').value);
    body.append('client_secret', document.getElementById('cfgOAuthClientSecret').value);
    body.append('redirect_uri', document.getElementById('cfgOAuthRedirectUri').value);
    
    apiFetch('../api/settings.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => alert(data.msg));
}

// 迁移Linux DO数据库字段
function migrateLinuxDOFields() {
    if (!confirm('确定要执行数据库迁移吗？\n\n这将为users表添加Linux DO OAuth所需的字段。')) return;
    
    apiFetch('../api/update_db.php?action=migrate_linuxdo')
        .then(r => r.json())
        .then(data => {
            alert(data.msg + (data.data && data.data.added ? '\n\n添加的字段: ' + data.data.added.join(', ') : ''));
        })
        .catch(err => alert('迁移请求失败'));
}

// 修改密码
function changePassword() {
    const body = new FormData();
    body.append('action', 'change_password');
    body.append('old_password', document.getElementById('oldPass').value);
    body.append('new_password', document.getElementById('newPass').value);
    apiFetch('../api/admin.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) {
                document.getElementById('oldPass').value = '';
                document.getElementById('newPass').value = '';
            }
        });
}

// 加载SMTP设置
function loadSmtpSettings() {
    apiFetch('../api/settings.php?action=get_smtp')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data) {
                document.getElementById('cfgSmtpHost').value = data.data.smtp_host || '';
                document.getElementById('cfgSmtpPort').value = data.data.smtp_port || '587';
                document.getElementById('cfgSmtpUser').value = data.data.smtp_user || '';
                document.getElementById('cfgSmtpPass').value = data.data.smtp_pass || '';
                document.getElementById('cfgSmtpFrom').value = data.data.smtp_from || '';
                document.getElementById('cfgSmtpName').value = data.data.smtp_name || '';
                document.getElementById('cfgSmtpSecure').value = data.data.smtp_secure || 'tls';
            }
        }).catch(() => {});
}

// 保存SMTP设置
function saveSmtpSettings() {
    const body = new FormData();
    body.append('action', 'save_smtp');
    body.append('smtp_host', document.getElementById('cfgSmtpHost').value);
    body.append('smtp_port', document.getElementById('cfgSmtpPort').value);
    body.append('smtp_user', document.getElementById('cfgSmtpUser').value);
    body.append('smtp_pass', document.getElementById('cfgSmtpPass').value);
    body.append('smtp_from', document.getElementById('cfgSmtpFrom').value);
    body.append('smtp_name', document.getElementById('cfgSmtpName').value);
    body.append('smtp_secure', document.getElementById('cfgSmtpSecure').value);
    
    apiFetch('../api/settings.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => alert(data.msg));
}

// 测试SMTP发送
function testSmtpSettings() {
    const email = prompt('请输入测试邮箱地址：');
    if (!email) return;
    
    const body = new FormData();
    body.append('action', 'test_smtp');
    body.append('email', email);
    
    apiFetch('../api/settings.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => alert(data.msg));
}

// 加载缓存统计
function loadCacheStats() {
    apiFetch('../api/cache.php?action=stats')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data) {
                document.getElementById('cacheCount').textContent = data.data.count || 0;
                document.getElementById('cacheSize').textContent = data.data.size_human || '0 B';
                document.getElementById('cacheExpired').textContent = data.data.expired || 0;
            }
        }).catch(() => {});
}

// 清理过期缓存
function cleanupCache() {
    const body = new FormData();
    body.append('action', 'cleanup');
    
    apiFetch('../api/cache.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            loadCacheStats();
        });
}

// 清空所有缓存
function clearAllCache() {
    if (!confirm('确定要清空所有缓存吗？')) return;
    
    const body = new FormData();
    body.append('action', 'clear');
    
    apiFetch('../api/cache.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            loadCacheStats();
        });
}

// 添加商品
function showAddProduct() {
    document.getElementById('productModalTitle').textContent = '添加VPS商品';
    document.getElementById('pId').value = '';
    document.getElementById('pName').value = '';
    document.getElementById('pCpu').value = '';
    document.getElementById('pMem').value = '';
    document.getElementById('pDisk').value = '';
    document.getElementById('pBw').value = '';
    document.getElementById('pPrice').value = '';
    document.getElementById('pIp').value = '';
    document.getElementById('pPort').value = '22';
    document.getElementById('pUser').value = 'root';
    document.getElementById('pPass').value = '';
    document.getElementById('pExtra').value = '';
    document.getElementById('productModal').classList.add('show');
}

// 编辑商品
function editProduct(p) {
    document.getElementById('productModalTitle').textContent = '编辑商品';
    document.getElementById('pId').value = p.id;
    document.getElementById('pName').value = p.name;
    document.getElementById('pCpu').value = p.cpu || '';
    document.getElementById('pMem').value = p.memory || '';
    document.getElementById('pDisk').value = p.disk || '';
    document.getElementById('pBw').value = p.bandwidth || '';
    document.getElementById('pPrice').value = p.price;
    document.getElementById('pIp').value = p.ip_address;
    document.getElementById('pPort').value = p.ssh_port || 22;
    document.getElementById('pUser').value = p.ssh_user || 'root';
    document.getElementById('pPass').value = p.ssh_password;
    document.getElementById('pExtra').value = p.extra_info || '';
    document.getElementById('productModal').classList.add('show');
}
// 通过ID编辑商品（避免XSS风险）
function editProductById(id) {
    const p = productCache[id];
    if (p) {
        editProduct(p);}
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
}

// 保存商品
function saveProduct() {
    const id = document.getElementById('pId').value;
    const body = new FormData();
    body.append('action', id ? 'edit' : 'add');
    if (id) body.append('id', id);
    body.append('name', document.getElementById('pName').value);
    body.append('cpu', document.getElementById('pCpu').value);
    body.append('memory', document.getElementById('pMem').value);
    body.append('disk', document.getElementById('pDisk').value);
    body.append('bandwidth', document.getElementById('pBw').value);
    body.append('price', document.getElementById('pPrice').value);
    body.append('ip_address', document.getElementById('pIp').value);
    body.append('ssh_port', document.getElementById('pPort').value || 22);
    body.append('ssh_user', document.getElementById('pUser').value || 'root');
    body.append('ssh_password', document.getElementById('pPass').value);
    body.append('extra_info', document.getElementById('pExtra').value);
    
    apiFetch('../api/products.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) {
                closeProductModal();
                loadProducts();
                loadStats();
            }
        });
}
// 删除商品
function deleteProduct(id) {
    if (!confirm('确定删除该商品？')) return;
    const body = new FormData();
    body.append('action', 'delete');
    body.append('id', id);
    apiFetch('../api/products.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            loadProducts();
            loadStats();
        });
}

// 退出
function logout() {
    apiFetch('../api/admin.php', {
        method: 'POST',
        body: new URLSearchParams({ action: 'logout' })
    }).then(() => window.location.href = 'login.html');
}

// ==================== 优惠券管理 ====================
let couponCache = {};

// 加载优惠券
function loadCoupons() {
    apiFetch('../api/coupons.php?action=all')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('couponTable');
            if (data.code !== 1 || !data.data || !data.data.list || data.data.list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无优惠券</td></tr>';
                return;
            }
            
            couponCache = {};
            data.data.list.forEach(c => { couponCache[c.id] = c; });
            
            tbody.innerHTML = data.data.list.map(c => {
                const isExpired = c.ends_at && new Date(c.ends_at) < new Date();
                const statusClass = c.status == 1 ? (isExpired ? 'wait' : 'on') : 'off';
                const statusText = c.status == 1 ? (isExpired ? '已过期' : '有效') : '停用';
                const typeText = c.type === 'fixed' ? '减免' : '折扣';
                const valueText = c.type === 'fixed' ? c.value + '积分' : c.value + '%';
                
                return `
                    <tr>
                        <td><code style="color:var(--primary)">${escapeHtml(c.code)}</code></td>
                        <td>${escapeHtml(c.name)}</td>
                        <td>${typeText}</td>
                        <td style="font-weight:600">${valueText}</td>
                        <td>${c.used_count} / ${c.max_uses == 0 ? '∞' : c.max_uses}</td>
                        <td style="font-size:12px;color:var(--text-muted)">
                            ${c.starts_at ? c.starts_at.substring(0,10) : '即时'}<br>
                            ${c.ends_at ? c.ends_at.substring(0,10) : '永久'}
                        </td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <button class="action-btn edit" onclick="editCouponById(${c.id})">编辑</button>
                            <button class="action-btn" onclick="toggleCouponStatus(${c.id}, ${c.status})">${c.status == 1 ? '停用' : '启用'}</button>
                            <button class="action-btn del" onclick="deleteCoupon(${c.id})">删除</button>
                        </td>
                    </tr>
                `;
            }).join('');
        });
}

// 显示添加优惠券弹窗
function showAddCoupon() {
    document.getElementById('couponModalTitle').textContent = '创建优惠券';
    document.getElementById('cId').value = '';
    document.getElementById('cCode').value = '';
    document.getElementById('cCode').disabled = false;
    document.getElementById('cName').value = '';
    document.getElementById('cType').value = 'fixed';
    document.getElementById('cValue').value = '';
    document.getElementById('cMinAmount').value = '0';
    document.getElementById('cMaxUses').value = '0';
    document.getElementById('cPerUserLimit').value = '1';
    document.getElementById('cMaxDiscount').value = '';
    document.getElementById('cStartsAt').value = '';
    document.getElementById('cEndsAt').value = '';
    document.getElementById('cStatus').checked = true;
    toggleCouponType();
    document.getElementById('couponModal').classList.add('show');
}

// 编辑优惠券
function editCouponById(id) {
    const c = couponCache[id];
    if (!c) return;
    
    document.getElementById('couponModalTitle').textContent = '编辑优惠券';
    document.getElementById('cId').value = c.id;
    document.getElementById('cCode').value = c.code;
    document.getElementById('cCode').disabled = true; // 代码不可修改
    document.getElementById('cName').value = c.name;
    document.getElementById('cType').value = c.type;
    document.getElementById('cValue').value = c.value;
    document.getElementById('cMinAmount').value = c.min_amount;
    document.getElementById('cMaxUses').value = c.max_uses;
    document.getElementById('cPerUserLimit').value = c.per_user_limit;
    document.getElementById('cMaxDiscount').value = c.max_discount || '';
    
    // 格式化时间 datetime-local 需要 yyyy-MM-ddTHH:mm
    if (c.starts_at) document.getElementById('cStartsAt').value = c.starts_at.replace(' ', 'T').substring(0, 16);
    else document.getElementById('cStartsAt').value = '';
    
    if (c.ends_at) document.getElementById('cEndsAt').value = c.ends_at.replace(' ', 'T').substring(0, 16);
    else document.getElementById('cEndsAt').value = '';
    
    document.getElementById('cStatus').checked = c.status == 1;
    toggleCouponType();
    document.getElementById('couponModal').classList.add('show');
}

function closeCouponModal() {
    document.getElementById('couponModal').classList.remove('show');
}

// 切换优惠券类型
function toggleCouponType() {
    const type = document.getElementById('cType').value;
    const valueLabel = document.getElementById('cValueLabel');
    const maxDiscountGroup = document.getElementById('cMaxDiscountGroup');
    
    if (type === 'fixed') {
        valueLabel.textContent = '减免金额';
        maxDiscountGroup.style.display = 'none';
    } else {
        valueLabel.textContent = '折扣百分比 (1-100)';
        maxDiscountGroup.style.display = 'block';
    }
}

// 保存优惠券
function saveCoupon() {
    const id = document.getElementById('cId').value;
    const code = document.getElementById('cCode').value.trim();
    const name = document.getElementById('cName').value.trim();
    const type = document.getElementById('cType').value;
    const value = document.getElementById('cValue').value;
    
    if (!code || !name || !value) {
        alert('请填写必填项');
        return;
    }
    
    const body = new FormData();
    body.append('action', id ? 'update' : 'create');
    if (id) body.append('id', id);
    body.append('code', code);
    body.append('name', name);
    body.append('type', type);
    body.append('value', value);
    body.append('min_amount', document.getElementById('cMinAmount').value);
    body.append('max_uses', document.getElementById('cMaxUses').value);
    body.append('per_user_limit', document.getElementById('cPerUserLimit').value);
    
    const maxDiscount = document.getElementById('cMaxDiscount').value;
    if (maxDiscount) body.append('max_discount', maxDiscount);
    
    const startsAt = document.getElementById('cStartsAt').value;
    if (startsAt) body.append('starts_at', startsAt.replace('T', ' '));
    
    const endsAt = document.getElementById('cEndsAt').value;
    if (endsAt) body.append('ends_at', endsAt.replace('T', ' '));
    
    body.append('status', document.getElementById('cStatus').checked ? 1 : 0);
    
    apiFetch('../api/coupons.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) {
                closeCouponModal();
                loadCoupons();
            }
        });
}

// 切换状态
function toggleCouponStatus(id, currentStatus) {
    const body = new FormData();
    body.append('action', 'toggle');
    body.append('id', id);
    body.append('status', currentStatus == 1 ? 0 : 1);
    
    apiFetch('../api/coupons.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) loadCoupons();
            else alert(data.msg);
        });
}

// 删除优惠券
function deleteCoupon(id) {
    if (!confirm('确定要删除此优惠券吗？\n如果有订单已使用该优惠券，建议停用而不是删除。')) return;
    
    const body = new FormData();
    body.append('action', 'delete');
    body.append('id', id);
    
    apiFetch('../api/coupons.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) loadCoupons();
        });
}

// ==================== 工单管理 ====================

// 存储工单数据
let ticketCache = {};

// 加载工单统计
function loadTicketStats() {
    apiFetch('../api/tickets.php?action=stats')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                document.getElementById('statTicketPending').textContent = data.data.pending;
                document.getElementById('statTicketReplied').textContent = data.data.replied;
                document.getElementById('statTicketClosed').textContent = data.data.closed;
                document.getElementById('statTicketTotal').textContent = data.data.total;
            }
        });
}

// 加载工单列表
function loadTickets() {
    apiFetch('../api/tickets.php?action=all')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('ticketTable');
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无工单</td></tr>';
                return;
            }
            ticketCache = {};
            data.data.forEach(t => { ticketCache[t.id] = t; });
            
            tbody.innerHTML = data.data.map(t => {
                let statusClass = t.status == 0 ? 'wait' : (t.status == 1 ? 'on' : 'off');
                let statusText = t.status == 0 ? '待回复' : (t.status == 1 ? '已回复' : '已关闭');
                return `
                    <tr>
                        <td>#${t.id}</td>
                        <td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(t.title)}</span></td>
                        <td>${escapeHtml(t.username || '-')}</td>
                        <td>${t.order_no ? `<code style="color:var(--primary)">${escapeHtml(t.order_no)}</code>` : '-'}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                        <td style="color:var(--text-muted);font-size:12px">${escapeHtml(t.updated_at)}</td>
                        <td>
                            <button class="action-btn edit" onclick="showAdminTicketDetail(${t.id})">查看</button>
                            ${t.status != 2 ? `<button class="action-btn del" onclick="adminCloseTicket(${t.id})">关闭</button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        });
}

// 显示工单详情（含附件）
function showAdminTicketDetail(id) {
    Promise.all([
        apiFetch('../api/tickets.php?action=detail&id=' + id).then(r => r.json()),
        apiFetch('../api/upload.php?action=list&ticket_id=' + id).then(r => r.json()).catch(() => ({code:0,data:[]}))
    ]).then(([ticketRes, attachRes]) => {
            if (ticketRes.code !== 1 || !ticketRes.data) {
                alert('获取工单详情失败');
                return;
            }
            const ticket = ticketRes.data;
            const attachments = attachRes.code === 1 ? attachRes.data : [];
            let statusClass = ticket.status == 0 ? 'wait' : (ticket.status == 1 ? 'on' : 'off');
            let statusText = ticket.status == 0 ? '待回复' : (ticket.status == 1 ? '已回复' : '已关闭');
            
            document.getElementById('adminTicketTitle').textContent = '#' + ticket.id + ' ' + ticket.title;
            let repliesHtml = ticket.replies.map(r => `
                <div class="ticket-reply ${r.user_id ? 'user' : 'admin'}">
                    <div class="reply-header">
                        <span class="reply-author">${r.user_id ? escapeHtml(r.username || '用户') : '客服'}</span>
                        <span class="reply-time">${escapeHtml(r.created_at)}</span>
                    </div>
                    <div class="reply-content">${escapeHtml(r.content)}</div>
                </div>
            `).join('');
            
            // 附件列表
            let attachHtml = '';
            if (attachments.length > 0) {
                const attachItems = attachments.map(a => {
                    const isImage = (a.mime_type || '').startsWith('image/');
                    const fileUrl = `../api/upload.php?action=download&id=${a.id}`;
                    const fileName = escapeHtml(a.original_name || '附件');
                    const fileMeta = a.file_size ? `(${formatFileSize(a.file_size)})` : '';
                    if (isImage) {
                        return `
                            <a class="ticket-attachment image" href="${fileUrl}" target="_blank">
                                <img src="${fileUrl}" alt="${fileName}">
                                <span class="ticket-attachment-name">${fileName}</span>
                                <span class="ticket-attachment-meta">${fileMeta}</span>
                            </a>
                        `;
                    }
                    return `
                        <a class="ticket-attachment file" href="${fileUrl}" target="_blank">
                            <span class="ticket-attachment-icon">📄</span>
                            <span class="ticket-attachment-name">${fileName}</span>
                            <span class="ticket-attachment-meta">${fileMeta}</span>
                        </a>
                    `;
                }).join('');
                attachHtml = `
                    <div class="ticket-attachments">
                        <div class="ticket-attachments-title">📎 附件 (${attachments.length})</div>
                        <div class="ticket-attachments-grid">
                            ${attachItems}
                        </div>
                    </div>`;
            }
            
            document.getElementById('adminTicketBody').innerHTML = `
                <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                    <span class="badge ${statusClass}" style="margin-right:12px">${statusText}</span>
                    <span style="color:var(--text-muted);font-size:13px">用户：${escapeHtml(ticket.username || '-')}</span>
                    ${ticket.order_no ? `<span style="margin-left:16px;color:var(--text-muted);font-size:13px">订单：${escapeHtml(ticket.order_no)}</span>` : ''}
                </div>
                <div class="ticket-replies">${repliesHtml}</div>
                ${attachHtml}
                ${ticket.status != 2 ? `
                    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
                        <textarea id="adminReplyContent" rows="3" placeholder="输入回复内容..." style="width:100%;resize:vertical"></textarea>
                        <div style="margin-top:8px;display:flex;align-items:center;gap:10px">
                            <input type="file" id="adminTicketFile" accept="image/*,.txt,.log,.pdf" style="font-size:12px">
                            <button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="uploadTicketAttachment(${ticket.id})">上传附件</button>
                        </div>
                    </div>
                ` : ''}
            `;
            
            let footHtml = '';
            if (ticket.status != 2) {
                footHtml = `
                    <button class="btn btn-outline" onclick="adminCloseTicket(${ticket.id})">关闭工单</button>
                    <button class="btn btn-primary" onclick="adminReplyTicket(${ticket.id})">发送回复</button>
                `;
            } else {
                footHtml = `<button class="btn btn-primary" onclick="closeAdminTicketDetail()">关闭</button>`;
            }
            document.getElementById('adminTicketFoot').innerHTML = footHtml;
            document.getElementById('ticketDetailModal').classList.add('show');
        });
}

function closeAdminTicketDetail() {
    document.getElementById('ticketDetailModal').classList.remove('show');
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 上传工单附件
function uploadTicketAttachment(ticketId) {
    const fileInput = document.getElementById('adminTicketFile');
    if (!fileInput.files || !fileInput.files[0]) {
        alert('请选择文件');
        return;
    }
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
        alert('文件大小不能超过5MB');
        return;
    }
    const body = new FormData();
    body.append('action', 'ticket');
    body.append('ticket_id', ticketId);
    body.append('file', file);
    
    apiFetch('../api/upload.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('附件上传成功');
                fileInput.value = '';
                showAdminTicketDetail(ticketId);
            } else {
                alert(data.msg || '上传失败');
            }
        })
        .catch(() => alert('上传请求失败'));
}

// 管理员回复工单
function adminReplyTicket(ticketId) {
    const content = document.getElementById('adminReplyContent').value.trim();
    if (!content) {
        alert('请输入回复内容');
        return;
    }
    
    const body = new FormData();
    body.append('action', 'reply');
    body.append('ticket_id', ticketId);
    body.append('content', content);
    
    apiFetch('../api/tickets.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showAdminTicketDetail(ticketId);
                loadTickets();
                loadTicketStats();
            } else {
                alert(data.msg);
            }
        });
}

// 管理员关闭工单
function adminCloseTicket(ticketId) {
    if (!confirm('确定要关闭此工单吗？')) return;
    
    const body = new FormData();
    body.append('action', 'close');
    body.append('ticket_id', ticketId);
    
    apiFetch('../api/tickets.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                closeAdminTicketDetail();
                loadTickets();
                loadTicketStats();
            } else {
                alert(data.msg);
            }
        });
}

// ==================== 公告管理 ====================

// 存储公告数据
let announcementCache = {};

// 加载公告列表
function loadAnnouncements() {
    apiFetch('../api/announcements.php?action=all')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('announcementTable');
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无公告</td></tr>';
                return;
            }
            announcementCache = {};
            data.data.forEach(a => { announcementCache[a.id] = a; });
            
            tbody.innerHTML = data.data.map(a => `
                <tr>
                    <td>${a.id}</td>
                    <td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(a.title)}</span></td>
                    <td><span class="badge ${a.is_top == 1 ? 'on' : ''}" style="${a.is_top != 1 ? 'opacity:0.5' : ''}">${a.is_top == 1 ? '置顶' : '否'}</span></td>
                    <td><span class="badge ${a.status == 1 ? 'on' : 'off'}">${a.status == 1 ? '显示' : '隐藏'}</span></td>
                    <td style="color:var(--text-muted);font-size:12px">${escapeHtml(a.publish_at || a.created_at)}</td>
                    <td>
                        <button class="action-btn edit" onclick="editAnnouncementById(${a.id})">编辑</button>
                        <button class="action-btn" onclick="toggleAnnouncementTop(${a.id})">${a.is_top == 1 ? '取消置顶' : '置顶'}</button>
                        <button class="action-btn del" onclick="deleteAnnouncement(${a.id})">删除</button>
                    </td>
                </tr>
            `).join('');
        });
}

// 显示添加公告弹窗
function showAddAnnouncement() {
    document.getElementById('announcementModalTitle').textContent = '发布公告';
    document.getElementById('annId').value = '';
    document.getElementById('annTitle').value = '';
    document.getElementById('annContent').value = '';
    document.getElementById('annTop').checked = false;
    document.getElementById('annStatus').checked = true;
    document.getElementById('annPublishAt').value = '';
    document.getElementById('annExpiresAt').value = '';
    document.getElementById('announcementModal').classList.add('show');
}

// 编辑公告
function editAnnouncementById(id) {
    const a = announcementCache[id];
    if (!a) return;
    
    document.getElementById('announcementModalTitle').textContent = '编辑公告';
    document.getElementById('annId').value = a.id;
    document.getElementById('annTitle').value = a.title;
    document.getElementById('annContent').value = a.content;
    document.getElementById('annTop').checked = a.is_top == 1;
    document.getElementById('annStatus').checked = a.status == 1;
    document.getElementById('annPublishAt').value = a.publish_at ? a.publish_at.replace(' ', 'T').substring(0, 16) : '';
    document.getElementById('annExpiresAt').value = a.expires_at ? a.expires_at.replace(' ', 'T').substring(0, 16) : '';
    document.getElementById('announcementModal').classList.add('show');
}

function closeAnnouncementModal() {
    document.getElementById('announcementModal').classList.remove('show');
}

// 保存公告
function saveAnnouncement() {
    const id = document.getElementById('annId').value;
    const title = document.getElementById('annTitle').value.trim();
    const content = document.getElementById('annContent').value.trim();
    const isTop = document.getElementById('annTop').checked ? 1 : 0;
    const status = document.getElementById('annStatus').checked ? 1 : 0;
    
    if (!title || !content) {
        alert('请填写标题和内容');
        return;
    }
    
    const body = new FormData();
    body.append('action', id ? 'edit' : 'add');
    if (id) body.append('id', id);
    body.append('title', title);
    body.append('content', content);
    body.append('is_top', isTop);
    body.append('status', status);
    const publishAt = document.getElementById('annPublishAt').value;
    if (publishAt) body.append('publish_at', publishAt.replace('T', ' '));
    const expiresAt = document.getElementById('annExpiresAt').value;
    if (expiresAt) body.append('expires_at', expiresAt.replace('T', ' '));
    
    apiFetch('../api/announcements.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            if (data.code === 1) {
                closeAnnouncementModal();
                loadAnnouncements();
            }
        });
}

// 切换置顶状态
function toggleAnnouncementTop(id) {
    const body = new FormData();
    body.append('action', 'toggle_top');
    body.append('id', id);
    
    apiFetch('../api/announcements.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                loadAnnouncements();
            } else {
                alert(data.msg);
            }
        });
}
// 删除公告
function deleteAnnouncement(id) {
    if (!confirm('确定删除该公告？')) return;
    
    const body = new FormData();
    body.append('action', 'delete');
    body.append('id', id);
    
    apiFetch('../api/announcements.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            alert(data.msg);
            loadAnnouncements();
        });
}

// ==================== 数据库维护 ====================

// 检查数据库状态
function checkDbStatus() {
    const statusDiv = document.getElementById('dbStatus');
    statusDiv.style.display = 'block';
    statusDiv.style.background = 'rgba(255,255,255,0.1)';
    statusDiv.innerHTML = '正在检查...';
    
    apiFetch('../api/update_db.php?action=check')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                const info = data.data;
                if (info.all_installed) {
                    statusDiv.style.background = 'rgba(34,197,94,0.15)';
                    statusDiv.innerHTML = '✅ 数据库状态正常，所有表已安装<br><small style="opacity:0.7">已安装: ' + info.existing.join(', ') + '</small>';
                } else {
                    statusDiv.style.background = 'rgba(251,191,36,0.15)';
                    statusDiv.innerHTML = '⚠️ 发现缺失的表:<strong>' + info.missing.join(', ') + '</strong><br><small style="opacity:0.7">请点击"更新数据库"按钮进行安装</small>';
                }
            } else {
                statusDiv.style.background = 'rgba(239,68,68,0.15)';
                statusDiv.innerHTML = '❌ 检查失败: ' + data.msg;
            }
        })
        .catch(err => {
            statusDiv.style.background = 'rgba(239,68,68,0.15)';
            statusDiv.innerHTML = '❌ 网络错误';
        });
}

// 更新数据库
function updateDatabase() {
    if (!confirm('确定要更新数据库吗？此操作将创建缺失的数据表。')) return;
    
    const statusDiv = document.getElementById('dbStatus');
    statusDiv.style.display = 'block';
    statusDiv.style.background = 'rgba(255,255,255,0.1)';
    statusDiv.innerHTML = '正在更新...';
    
    const body = new FormData();
    body.append('action', 'update');
    apiFetch('../api/update_db.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                statusDiv.style.background = 'rgba(34,197,94,0.15)';
                if (data.data && data.data.created && data.data.created.length > 0) {
                    statusDiv.innerHTML = '✅ ' + data.msg + '<br><small style="opacity:0.7">新建表: ' + data.data.created.join(', ') + '</small>';
                } else {
                    statusDiv.innerHTML = '✅ ' + data.msg;
                }
            } else {
                statusDiv.style.background = 'rgba(239,68,68,0.15)';
                let msg = '❌ ' + data.msg;
                if (data.data && data.data.errors) {
                    msg += '<br><small style="opacity:0.7">' + data.data.errors.join('<br>') + '</small>';
                }
                statusDiv.innerHTML = msg;
            }
        })
        .catch(err => {
            statusDiv.style.background = 'rgba(239,68,68,0.15)';
            statusDiv.innerHTML = '❌ 网络错误';
        });
}

// 加载最近订单（仪表盘）
function loadRecentOrders() {
    apiFetch('../api/orders.php?action=list&limit=5')
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('recentOrders');
            if (!container) return;
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                container.innerHTML = '<div class="empty-tip">暂无订单</div>';
                return;
            }
            container.innerHTML = data.data.slice(0, 5).map(order => {
                const statusText = order.status === 'paid'
                    ? '已支付'
                    : order.status === 'pending'
                        ? '待支付'
                        : order.status === 'refunded'
                            ? '已退款'
                            : order.status === 'cancelled'
                                ? '已取消'
                                : order.status;
                return `
                <div class="recent-item">
                    <div class="recent-info">
                        <span class="recent-title">#${order.id} ${order.product_name || '商品'}</span>
                        <span class="recent-time">${order.created_at}</span>
                    </div>
                    <span class="status-badge status-${order.status}">${statusText}</span>
                </div>
            `}).join('');
        });
}

// 加载最近工单（仪表盘）
function loadRecentTickets() {
    apiFetch('../api/tickets.php?action=admin_list&limit=5')
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('recentTickets');
            if (!container) return;
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                container.innerHTML = '<div class="empty-tip">暂无工单</div>';
                return;
            }
            container.innerHTML = data.data.slice(0, 5).map(ticket => `
                <div class="recent-item">
                    <div class="recent-info">
                        <span class="recent-title">${ticket.title}</span>
                        <span class="recent-time">${ticket.created_at}</span>
                    </div>
                    <span class="status-badge status-${ticket.status}">${ticket.status === 'open' ? '待处理' : ticket.status === 'replied' ? '已回复' : '已关闭'}</span>
                </div>
            `).join('');
        });
}
// 加载管理员列表
function loadAdmins() {
    const tbody = document.getElementById('adminTable');
    if (!tbody) return;
    if (currentAdminInfo.role !== 'super') {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-tip">仅超级管理员可查看</td></tr>';
        return;
    }
    apiFetch('../api/admin.php?action=list')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('adminTable');
            if (!tbody) return;
            if (data.code !== 1 || !data.data) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-tip">暂无数据</td></tr>';
                return;
            }
            tbody.innerHTML = data.data.map(admin => `
                <tr>
                    <td>${admin.id}</td>
                    <td>${admin.username}</td>
                    <td><span class="role-badge role-${admin.role}">${admin.role === 'super' ? '超级管理员' : '普通管理员'}</span></td>
                    <td>${admin.created_at || '-'}</td>
                    <td>
                        ${admin.role !== 'super' ? `<button class="btn btn-danger btn-sm" onclick="deleteAdmin(${admin.id})">删除</button>` : '<span class="text-muted">-</span>'}
                    </td>
                </tr>
            `).join('');
        });
}

// 加载操作日志
function loadAuditLogs(page = 1) {
    const tbody = document.getElementById('auditTable');
    if (!tbody) return;
    auditPagination.page = page;

    const container = document.getElementById('auditTableContainer') || tbody.parentNode;
    tbody.innerHTML = '<tr><td colspan="6" class="empty">加载中...</td></tr>';

    apiFetch('../api/audit_logs.php?action=list&page=' + page + '&page_size=' + auditPagination.pageSize)
        .then(r => r.json())
        .then(data => {
            if (data.code !== 1 || !data.data || !data.data.list || data.data.list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无日志</td></tr>';
                removePagination('auditPagination');
                return;
            }

            auditPagination.total = data.data.total;
            auditPagination.totalPages = data.data.total_pages;

            tbody.innerHTML = data.data.list.map(log => {
                const detail = log.details || '';
                const detailShort = detail.length > 80 ? detail.slice(0, 80) + '...' : detail;
                const adminName = log.actor_name || (log.actor_id ? '#' + log.actor_id : '-');
                return `
                    <tr>
                        <td style="color:var(--text-muted);font-size:12px">${escapeHtml(log.created_at || '')}</td>
                        <td>${escapeHtml(adminName)}</td>
                        <td>${escapeHtml(log.action || '')}</td>
                        <td>${escapeHtml(log.target_id || '-')}</td>
                        <td>${escapeHtml(log.ip_address || '-')}</td>
                        <td title="${escapeHtml(detail)}">${escapeHtml(detailShort || '-')}</td>
                    </tr>
                `;
            }).join('');

            if (auditPagination.totalPages > 1) {
                renderAuditPagination(auditPagination.page, auditPagination.totalPages, auditPagination.total, container);
            } else {
                removePagination('auditPagination');
            }
        });
}

function renderAuditPagination(current, total, totalCount, container) {
    removePagination('auditPagination');

    let pages = [];
    const delta = 2;
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }

    let html = `<div class="admin-pagination" id="auditPagination">`;
    html += `<span class="page-info">共${totalCount} 条，第${current}/${total} 页</span>`;
    html += `<div class="page-btns">`;
    html += `<button class="page-btn" ${current <= 1 ? 'disabled' : ''} onclick="loadAuditLogs(${current - 1})">上一页</button>`;
    pages.forEach(p => {
        if (p === '...') {
            html += '<span class="page-dots">...</span>';
        } else {
            html += `<button class="page-btn ${p === current ? 'active' : ''}" onclick="loadAuditLogs(${p})">${p}</button>`;
        }
    });
    html += `<button class="page-btn" ${current >= total ? 'disabled' : ''} onclick="loadAuditLogs(${current + 1})">下一页</button>`;
    html += `</div></div>`;

    container.insertAdjacentHTML('afterend', html);
}

// 显示添加管理员弹窗
function showAddAdmin() {
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
    document.getElementById('newAdminRole').value = 'admin';
    document.getElementById('adminModal').classList.add('show');
}

// 关闭管理员弹窗
function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
}

// 保存新管理员
function saveAdmin() {
    const username = document.getElementById('newAdminUser').value.trim();
    const password = document.getElementById('newAdminPass').value;
    const role = document.getElementById('newAdminRole').value;
    
    if (!username || !password) {
        showToast('请填写用户名和密码', 'error');
        return;
    }
    
    apiFetch('../api/admin.php?action=add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
    })
    .then(r => r.json())
    .then(data => {
        if (data.code === 1) {
            showToast('管理员添加成功');
            closeAdminModal();
            loadAdmins();
        } else {
            showToast(data.msg || '添加失败', 'error');
        }
    });
}

// 删除管理员
function deleteAdmin(id) {
    if (!confirm('确定删除该管理员？')) return;
    apiFetch('../api/admin.php?action=delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    })
    .then(r => r.json())
    .then(data => {
        if (data.code === 1) {
            showToast('删除成功');
            loadAdmins();
        } else {
            showToast(data.msg || '删除失败', 'error');
        }
    });
}

// ===== 增量增强：模板 / 积分 / 社区规则 / 报表 =====
function init() {
    loadStats();
    loadProducts();
    loadOrders();
    loadCoupons();
    loadSettings();
    loadOAuthSettings();
    loadSmtpSettings();
    loadNotificationSettings();
    loadCacheStats();
    loadTickets();
    loadAnnouncements();
    loadTicketStats();
    loadRecentOrders();
    loadRecentTickets();
    loadAdmins();
    loadAuditLogs();
    loadTemplateList();
    loadProductTemplateOptions();
    loadCreditAdminUsers();
    loadCreditTransactionList();
    loadCommunityOverview();
    loadReportDashboard();
    checkDbMissing();
}

function loadStats() {
    Promise.all([
        apiFetch('../api/orders.php?action=stats').then(r => r.json()),
        apiFetch('../api/dashboard.php?action=summary').then(r => r.json()).catch(() => ({ code: 0, data: {} }))
    ]).then(([orderStats, dashboard]) => {
        if (orderStats.code === 1) {
            document.getElementById('statProducts').textContent = orderStats.data.products;
            document.getElementById('statUsers').textContent = orderStats.data.users;
            document.getElementById('statPending').textContent = orderStats.data.pending;
            document.getElementById('statPaid').textContent = orderStats.data.paid;
            document.getElementById('statIncome').textContent = orderStats.data.income;
        }
        if (dashboard.code === 1) {
            const footer = document.getElementById('breadcrumbCurrent');
            if (footer) footer.textContent = '仪表盘';
        }
    });
}

function loadProductTemplateOptions(selectedId = '') {
    apiFetch('../api/templates.php?action=list')
        .then(r => r.json())
        .then(data => {
            const select = document.getElementById('pTemplate');
            if (!select) return;
            select.innerHTML = '<option value="">不使用模板</option>';
            if (data.code === 1 && Array.isArray(data.data)) {
                data.data.forEach(t => {
                    select.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
                });
            }
            if (selectedId !== '') select.value = String(selectedId);
        });
}

function loadProducts() {
    apiFetch('../api/products.php?action=all')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('productTable');
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无商品</td></tr>';
                return;
            }
            productCache = {};
            data.data.forEach(p => { productCache[p.id] = p; });
            tbody.innerHTML = data.data.map(p => `
                <tr>
                    <td>${p.id}</td>
                    <td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(p.name)}</span><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.template_name || '')}</div></td>
                    <td>${escapeHtml(p.cpu) || '-'}/${escapeHtml(p.memory) || '-'}/${escapeHtml(p.disk) || '-'}<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.region || '-')} · TL${parseInt(p.min_trust_level || 0)}</div></td>
                    <td>${parseFloat(p.price || 0).toFixed(2)}积分</td>
                    <td>${escapeHtml(p.ip_address || '-')}</td>
                    <td><span class="badge ${p.status == 1 ? 'on' : 'off'}">${p.status == 1 ? '在售' : '已售'}</span></td>
                    <td>
                        <button class="action-btn edit" onclick="editProductById(${p.id})">编辑</button>
                        <button class="action-btn del" onclick="deleteProduct(${p.id})">删除</button>
                    </td>
                </tr>`).join('');
        });
}

function showAddProduct() {
    document.getElementById('productModalTitle').textContent = '添加商品';
    ['pId','pName','pCpu','pMem','pDisk','pBw','pPrice','pIp','pPort','pUser','pPass','pExtra','pRegion','pLineType','pOsType','pDescription'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('pPort').value = '22';
    document.getElementById('pUser').value = 'root';
    document.getElementById('pTemplate').value = '';
    document.getElementById('pMinTrustLevel').value = '0';
    document.getElementById('pRiskReviewRequired').checked = false;
    document.getElementById('pAllowWhitelistOnly').checked = false;
    loadProductTemplateOptions();
    document.getElementById('productModal').classList.add('show');
}

function editProduct(p) {
    document.getElementById('productModalTitle').textContent = '编辑商品';
    document.getElementById('pId').value = p.id || '';
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pCpu').value = p.cpu || '';
    document.getElementById('pMem').value = p.memory || '';
    document.getElementById('pDisk').value = p.disk || '';
    document.getElementById('pBw').value = p.bandwidth || '';
    document.getElementById('pPrice').value = p.price || '';
    document.getElementById('pIp').value = p.ip_address || '';
    document.getElementById('pPort').value = p.ssh_port || 22;
    document.getElementById('pUser').value = p.ssh_user || 'root';
    document.getElementById('pPass').value = p.ssh_password || '';
    document.getElementById('pExtra').value = p.extra_info || '';
    document.getElementById('pRegion').value = p.region || '';
    document.getElementById('pLineType').value = p.line_type || '';
    document.getElementById('pOsType').value = p.os_type || '';
    document.getElementById('pDescription').value = p.description || '';
    document.getElementById('pMinTrustLevel').value = p.min_trust_level || 0;
    document.getElementById('pRiskReviewRequired').checked = parseInt(p.risk_review_required || 0) === 1;
    document.getElementById('pAllowWhitelistOnly').checked = parseInt(p.allow_whitelist_only || 0) === 1;
    loadProductTemplateOptions(p.template_id || '');
    document.getElementById('productModal').classList.add('show');
}

function saveProduct() {
    const body = new FormData();
    const id = document.getElementById('pId').value;
    body.append('action', id ? 'edit' : 'add');
    if (id) body.append('id', id);
    ['name:pName','cpu:pCpu','memory:pMem','disk:pDisk','bandwidth:pBw','price:pPrice','ip_address:pIp','ssh_port:pPort','ssh_user:pUser','ssh_password:pPass','extra_info:pExtra','region:pRegion','line_type:pLineType','os_type:pOsType','description:pDescription','template_id:pTemplate','min_trust_level:pMinTrustLevel'].forEach(pair => {
        const [k, idName] = pair.split(':');
        const el = document.getElementById(idName);
        body.append(k, el ? el.value : '');
    });
    body.append('risk_review_required', document.getElementById('pRiskReviewRequired').checked ? '1' : '0');
    body.append('allow_whitelist_only', document.getElementById('pAllowWhitelistOnly').checked ? '1' : '0');
    apiFetch('../api/products.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('保存成功');
                closeProductModal();
                loadProducts();
            } else {
                alert(data.msg || '保存失败');
            }
        });
}

function loadTemplateList() {
    apiFetch('../api/templates.php?action=list')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('templateTable');
            if (!tbody) return;
            if (data.code !== 1 || !Array.isArray(data.data) || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无模板</td></tr>';
                return;
            }
            tbody.innerHTML = data.data.map(t => `
                <tr>
                    <td>${t.id}</td>
                    <td>${escapeHtml(t.name)}</td>
                    <td>${escapeHtml(t.cpu || '-')}/${escapeHtml(t.memory || '-')}/${escapeHtml(t.disk || '-')}</td>
                    <td><span class="badge ${parseInt(t.status||1)===1?'on':'off'}">${parseInt(t.status||1)===1?'启用':'停用'}</span></td>
                    <td></td>
                </tr>`).join('');
            // safer second pass to avoid inline JSON issues
            Array.from(tbody.querySelectorAll('tr')).forEach((tr, idx) => {
                const cell = tr.lastElementChild;
                if (!cell) return;
                const t = data.data[idx];
                cell.innerHTML = `<button class="action-btn edit" onclick="fillTemplateForm(${t.id})">编辑</button><button class="action-btn edit" onclick="createTemplateFromProductPrompt()">从商品生成</button><button class="action-btn del" onclick="deleteTemplate(${t.id})">删除</button>`;
            });
            window.__templateCache = {};
            data.data.forEach(t => window.__templateCache[t.id] = t);
        });
}

function fillTemplateForm(id) {
    const t = window.__templateCache ? window.__templateCache[id] : null;
    if (!t) return;
    document.getElementById('tplId').value = t.id || '';
    document.getElementById('tplName').value = t.name || '';
    document.getElementById('tplCpu').value = t.cpu || '';
    document.getElementById('tplMemory').value = t.memory || '';
    document.getElementById('tplDisk').value = t.disk || '';
    document.getElementById('tplBandwidth').value = t.bandwidth || '';
    document.getElementById('tplRegion').value = t.region || '';
    document.getElementById('tplLineType').value = t.line_type || '';
    document.getElementById('tplOsType').value = t.os_type || '';
    document.getElementById('tplDescription').value = t.description || '';
    document.getElementById('tplExtraInfo').value = t.extra_info || '';
    document.getElementById('tplSort').value = t.sort_order || 0;
    switchTab('templates');
}

function saveTemplate() {
    const body = new FormData();
    const id = document.getElementById('tplId').value;
    body.append('action', id ? 'update' : 'create');
    if (id) body.append('id', id);
    ['name:tplName','cpu:tplCpu','memory:tplMemory','disk:tplDisk','bandwidth:tplBandwidth','region:tplRegion','line_type:tplLineType','os_type:tplOsType','description:tplDescription','extra_info:tplExtraInfo','sort_order:tplSort'].forEach(pair => {
        const [k, elId] = pair.split(':');
        body.append(k, document.getElementById(elId).value);
    });
    apiFetch('../api/templates.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('模板已保存');
                ['tplId','tplName','tplCpu','tplMemory','tplDisk','tplBandwidth','tplRegion','tplLineType','tplOsType','tplDescription','tplExtraInfo'].forEach(id=>document.getElementById(id).value='');
                document.getElementById('tplSort').value = '0';
                loadTemplateList();
                loadProductTemplateOptions();
            } else {
                alert(data.msg || '保存失败');
            }
        });
}

function deleteTemplate(id) {
    if (!confirm('确定删除该模板？')) return;
    const body = new FormData();
    body.append('action', 'delete');
    body.append('id', id);
    apiFetch('../api/templates.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => { if (data.code === 1) { showToast('删除成功'); loadTemplateList(); loadProductTemplateOptions(); } else alert(data.msg || '删除失败'); });
}

function createTemplateFromProductPrompt() {
    const id = prompt('输入商品ID，快速生成模板');
    if (!id) return;
    const body = new FormData();
    body.append('action', 'create_from_product');
    body.append('product_id', id);
    apiFetch('../api/templates.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => { if (data.code === 1) { showToast('已从商品生成模板'); loadTemplateList(); loadProductTemplateOptions(); } else alert(data.msg || '生成失败'); });
}

function loadCreditAdminUsers() {
    const keyword = document.getElementById('creditSearchKeyword') ? document.getElementById('creditSearchKeyword').value.trim() : '';
    apiFetch('../api/credits.php?action=admin_users&keyword=' + encodeURIComponent(keyword))
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('creditUserTable');
            if (!tbody) return;
            const list = data && data.code === 1 && data.data && Array.isArray(data.data.list) ? data.data.list : [];
            if (!list.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无用户</td></tr>';
                return;
            }
            tbody.innerHTML = list.map(u => `
                <tr>
                    <td>${u.id}</td>
                    <td>${escapeHtml(u.username || '-')}</td>
                    <td>${escapeHtml(u.linuxdo_username || '-')}<div style="font-size:12px;color:var(--text-muted)">TL${parseInt(u.linuxdo_trust_level || 0)} ${parseInt(u.linuxdo_silenced||0)===1?'· silenced':''}</div></td>
                    <td>${parseFloat(u.credit_balance || 0).toFixed(2)}</td>
                    <td><button class="action-btn edit" onclick="selectCreditUser(${u.id})">选择</button></td>
                </tr>`).join('');
        });
}

function selectCreditUser(id) {
    document.getElementById('creditUserId').value = id;
    loadCreditTransactionList(id);
}

function loadCreditTransactionList(userId = '') {
    let url = '../api/credits.php?action=admin_transactions&page_size=20';
    if (userId) url += '&user_id=' + encodeURIComponent(userId);
    apiFetch(url)
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('creditTxnTable');
            if (!tbody) return;
            if (data.code !== 1 || !data.data || !Array.isArray(data.data.list) || data.data.list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无流水</td></tr>';
                return;
            }
            tbody.innerHTML = data.data.list.map(t => `
                <tr>
                    <td>${escapeHtml(t.created_at || '')}</td>
                    <td>${escapeHtml(t.username || ('#' + t.user_id))}</td>
                    <td>${escapeHtml(t.type || '-')}</td>
                    <td style="color:${parseFloat(t.amount) >= 0 ? 'var(--success)' : 'var(--danger)'}">${parseFloat(t.amount).toFixed(2)}</td>
                    <td>${escapeHtml(t.remark || '-')}</td>
                </tr>`).join('');
        });
}

function submitCreditAdjust() {
    const body = new FormData();
    body.append('action', 'admin_adjust');
    body.append('user_id', document.getElementById('creditUserId').value);
    body.append('amount', document.getElementById('creditAmount').value);
    body.append('remark', document.getElementById('creditRemark').value);
    apiFetch('../api/credits.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('积分已调整');
                document.getElementById('creditAmount').value = '';
                document.getElementById('creditRemark').value = '';
                loadCreditAdminUsers();
                loadCreditTransactionList(document.getElementById('creditUserId').value);
                loadStats();
            } else {
                alert(data.msg || '调整失败');
            }
        });
}

function loadCommunityOverview() {
    apiFetch('../api/community.php?action=overview').then(r => r.json()).then(data => {
        if (data.code === 1 && data.data && data.data.settings) {
            document.getElementById('communitySilencedMode').value = data.data.settings.linuxdo_silenced_order_mode || 'review';
        }
    });
    apiFetch('../api/community.php?action=rules').then(r => r.json()).then(data => {
        const tbody = document.getElementById('communityRuleTable');
        if (!tbody) return;
        if (data.code !== 1 || !Array.isArray(data.data) || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无规则</td></tr>'; return; }
        window.__communityRules = {};
        data.data.forEach(r => window.__communityRules[r.id] = r);
        tbody.innerHTML = data.data.map(r => `<tr><td>${r.id}</td><td>${escapeHtml(r.rule_type)}</td><td>${r.product_id ? '商品#'+r.product_id : '全局'} / ${r.linuxdo_id ? 'LD#'+r.linuxdo_id : '本站#'+(r.user_id||'-')}</td><td>${escapeHtml(r.remark || '-')}</td><td><button class="action-btn edit" onclick="fillCommunityRule(${r.id})">编辑</button><button class="action-btn del" onclick="deleteCommunityRule(${r.id})">删除</button></td></tr>`).join('');
    });
    apiFetch('../api/community.php?action=discounts').then(r => r.json()).then(data => {
        const tbody = document.getElementById('communityDiscountTable');
        if (!tbody) return;
        if (data.code !== 1 || !Array.isArray(data.data) || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无折扣规则</td></tr>'; return; }
        window.__communityDiscounts = {};
        data.data.forEach(r => window.__communityDiscounts[r.id] = r);
        tbody.innerHTML = data.data.map(r => `<tr><td>${r.id}</td><td>TL${r.trust_level}</td><td>${r.product_id ? '#'+r.product_id : '全局'}</td><td>${escapeHtml(r.discount_type)}</td><td>${parseFloat(r.discount_value || 0).toFixed(2)}</td><td><button class="action-btn edit" onclick="fillCommunityDiscount(${r.id})">编辑</button><button class="action-btn del" onclick="deleteCommunityDiscount(${r.id})">删除</button></td></tr>`).join('');
    });
}

function saveCommunitySettings() {
    const body = new FormData();
    body.append('action', 'save_settings');
    body.append('linuxdo_silenced_order_mode', document.getElementById('communitySilencedMode').value);
    apiFetch('../api/community.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) showToast('设置已保存'); else alert(data.msg || '保存失败'); });
}

function saveCommunityRule() {
    const body = new FormData();
    body.append('action', 'save_rule');
    if (document.getElementById('ruleId').value) body.append('id', document.getElementById('ruleId').value);
    ['rule_type:ruleType','product_id:ruleProductId','user_id:ruleUserId','linuxdo_id:ruleLinuxdoId','remark:ruleRemark'].forEach(pair => { const [k,i]=pair.split(':'); body.append(k, document.getElementById(i).value); });
    apiFetch('../api/community.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) { showToast('规则已保存'); ['ruleId','ruleProductId','ruleUserId','ruleLinuxdoId','ruleRemark'].forEach(i => document.getElementById(i).value=''); document.getElementById('ruleType').value='whitelist'; loadCommunityOverview(); } else alert(data.msg || '保存失败'); });
}

function fillCommunityRule(id) {
    const r = window.__communityRules ? window.__communityRules[id] : null; if (!r) return;
    document.getElementById('ruleId').value = r.id;
    document.getElementById('ruleType').value = r.rule_type || 'whitelist';
    document.getElementById('ruleProductId').value = r.product_id || '';
    document.getElementById('ruleUserId').value = r.user_id || '';
    document.getElementById('ruleLinuxdoId').value = r.linuxdo_id || '';
    document.getElementById('ruleRemark').value = r.remark || '';
}

function deleteCommunityRule(id) {
    if (!confirm('确定删除该规则？')) return;
    const body = new FormData(); body.append('action', 'delete_rule'); body.append('id', id);
    apiFetch('../api/community.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) { showToast('删除成功'); loadCommunityOverview(); } else alert(data.msg || '删除失败'); });
}

function saveCommunityDiscount() {
    const body = new FormData();
    body.append('action', 'save_discount');
    if (document.getElementById('discountId').value) body.append('id', document.getElementById('discountId').value);
    ['trust_level:discountTrustLevel','product_id:discountProductId','discount_type:discountType','discount_value:discountValue','remark:discountRemark'].forEach(pair => { const [k,i]=pair.split(':'); body.append(k, document.getElementById(i).value); });
    apiFetch('../api/community.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) { showToast('折扣已保存'); ['discountId','discountProductId','discountValue','discountRemark'].forEach(i => document.getElementById(i).value=''); document.getElementById('discountType').value='percent'; document.getElementById('discountTrustLevel').value='0'; loadCommunityOverview(); } else alert(data.msg || '保存失败'); });
}

function fillCommunityDiscount(id) {
    const r = window.__communityDiscounts ? window.__communityDiscounts[id] : null; if (!r) return;
    document.getElementById('discountId').value = r.id;
    document.getElementById('discountTrustLevel').value = r.trust_level || 0;
    document.getElementById('discountProductId').value = r.product_id || '';
    document.getElementById('discountType').value = r.discount_type || 'percent';
    document.getElementById('discountValue').value = r.discount_value || '';
    document.getElementById('discountRemark').value = r.remark || '';
}

function deleteCommunityDiscount(id) {
    if (!confirm('确定删除该折扣规则？')) return;
    const body = new FormData(); body.append('action', 'delete_discount'); body.append('id', id);
    apiFetch('../api/community.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) { showToast('删除成功'); loadCommunityOverview(); } else alert(data.msg || '删除失败'); });
}

function loadReportDashboard() {
    Promise.all([
        apiFetch('../api/dashboard.php?action=summary').then(r => r.json()),
        apiFetch('../api/dashboard.php?action=hot_products').then(r => r.json()),
        apiFetch('../api/dashboard.php?action=ticket_summary').then(r => r.json())
    ]).then(([summary, hotProducts, tickets]) => {
        if (summary.code === 1) {
            document.getElementById('reportTodayIncome').textContent = parseFloat(summary.data.today_income || 0).toFixed(2);
            document.getElementById('reportMonthIncome').textContent = parseFloat(summary.data.month_income || 0).toFixed(2);
            document.getElementById('reportBalanceOrders').textContent = summary.data.balance_paid_orders || 0;
            document.getElementById('reportEpayOrders').textContent = summary.data.epay_paid_orders || 0;
            document.getElementById('reportExceptionOrders').textContent = summary.data.exception_orders || 0;
            document.getElementById('reportBalanceTotal').textContent = parseFloat(summary.data.user_balance_total || 0).toFixed(2);
        }
        const hotEl = document.getElementById('reportHotProducts');
        if (hotEl) {
            hotEl.innerHTML = (hotProducts.code === 1 && hotProducts.data.length) ? hotProducts.data.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.order_count}</td><td>${item.paid_count}</td><td>${parseFloat(item.income || 0).toFixed(2)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">暂无数据</td></tr>';
        }
        const ticketEl = document.getElementById('reportTicketCategory');
        if (ticketEl) {
            ticketEl.innerHTML = (tickets.code === 1 && tickets.data.category_breakdown && tickets.data.category_breakdown.length) ? tickets.data.category_breakdown.map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${item.total}</td></tr>`).join('') : '<tr><td colspan="2" class="empty">暂无数据</td></tr>';
        }
    });
}

function loadNotificationSettings() {
    apiFetch('../api/settings.php?action=get_notification')
        .then(r => r.json())
        .then(data => {
            if (data.code !== 1 || !data.data) return;
            const d = data.data;
            if (document.getElementById('cfgNotifEmail')) document.getElementById('cfgNotifEmail').checked = parseInt(d.notification_email_enabled || 0) === 1;
            if (document.getElementById('cfgNotifWebhook')) document.getElementById('cfgNotifWebhook').checked = parseInt(d.notification_webhook_enabled || 0) === 1;
            if (document.getElementById('cfgNotifWebhookUrl')) document.getElementById('cfgNotifWebhookUrl').value = d.notification_webhook_url || '';
            if (document.getElementById('cfgSilencedOrderMode')) document.getElementById('cfgSilencedOrderMode').value = d.linuxdo_silenced_order_mode || 'review';
        });
}

function saveNotificationSettings() {
    const body = new FormData();
    body.append('action', 'save_notification');
    body.append('notification_email_enabled', document.getElementById('cfgNotifEmail').checked ? '1' : '0');
    body.append('notification_webhook_enabled', document.getElementById('cfgNotifWebhook').checked ? '1' : '0');
    body.append('notification_webhook_url', document.getElementById('cfgNotifWebhookUrl').value);
    body.append('linuxdo_silenced_order_mode', document.getElementById('cfgSilencedOrderMode').value);
    apiFetch('../api/settings.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) showToast('通知配置已保存'); else alert(data.msg || '保存失败'); });
}


function loadOrders(page = 1) {
    adminOrderPagination.page = page;
    const tbody = document.getElementById('orderTable');
    tbody.innerHTML = '<tr><td colspan="7" class="empty">加载中...</td></tr>';
    apiFetch('../api/orders.php?action=all&page=' + page + '&page_size=' + adminOrderPagination.pageSize)
        .then(r => r.json())
        .then(data => {
            if (data.code !== 1 || !data.data || !data.data.list) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">加载失败</td></tr>';
                return;
            }
            const list = data.data.list;
            if (!list.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无订单</td></tr>';
                return;
            }
            tbody.innerHTML = list.map(o => {
                const payText = ['待支付', '已支付', '已退款', '已取消'][parseInt(o.status || 0)] || '未知';
                const deliveryText = escapeHtml(o.delivery_status_text || o.delivery_status || '-');
                return `<tr>
                    <td><code>${escapeHtml(o.order_no)}</code></td>
                    <td>${escapeHtml(o.product_name || '商品已删除')}<div style="font-size:12px;color:var(--text-muted)">${deliveryText}</div></td>
                    <td>${escapeHtml(o.username || '-')}</td>
                    <td>${parseFloat(o.price || 0).toFixed(2)}<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(o.payment_method || '-')}</div></td>
                    <td><span class="badge ${parseInt(o.status||0)===1?'on':(parseInt(o.status||0)===0?'wait':'off')}">${payText}</span></td>
                    <td>${escapeHtml(o.created_at || '')}</td>
                    <td><button class="action-btn edit" onclick="showOrderDetail('${escapeHtml(o.order_no)}')">查看</button></td>
                </tr>`;
            }).join('');
        });
}

function showOrderDetail(orderNo) {
    apiFetch('../api/orders.php?action=detail&order_no=' + encodeURIComponent(orderNo))
        .then(r => r.json())
        .then(data => {
            if (data.code !== 1 || !data.data) { alert(data.msg || '获取订单详情失败'); return; }
            const o = data.data;
            const payText = ['待支付', '已支付', '已退款', '已取消'][parseInt(o.status || 0)] || '未知';
            const deliveryText = escapeHtml(o.delivery_status_text || o.delivery_status || '-');
            const statuses = {
                pending: '待支付', paid_waiting: '待开通', provisioning: '处理中', delivered: '已交付', exception: '异常', refunded: '已退款', cancelled: '已取消'
            };
            document.getElementById('adminTicketTitle').textContent = '订单详情';
            document.getElementById('adminTicketBody').innerHTML = `
                <div style="display:grid;gap:12px">
                    <div><strong>订单号：</strong>${escapeHtml(o.order_no)}</div>
                    <div><strong>商品：</strong>${escapeHtml(o.product_name || '已删除')}</div>
                    <div><strong>用户：</strong>${escapeHtml(o.username || '-')}</div>
                    <div><strong>支付状态：</strong>${payText}</div>
                    <div><strong>交付状态：</strong>${deliveryText}</div>
                    <div><strong>金额：</strong>${parseFloat(o.price || 0).toFixed(2)} 积分（余额 ${parseFloat(o.balance_paid_amount || 0).toFixed(2)} / 外部 ${parseFloat(o.external_pay_amount || 0).toFixed(2)}）</div>
                    <div><strong>支付方式：</strong>${escapeHtml(o.payment_method || '-')}</div>
                    ${o.trade_no ? `<div><strong>交易号：</strong>${escapeHtml(o.trade_no)}</div>` : ''}
                    ${o.delivery_note ? `<div><strong>交付备注：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_note)}</span></div>` : ''}
                    ${o.delivery_info ? `<div><strong>交付信息：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_info)}</span></div>` : ''}
                    ${o.delivery_error ? `<div><strong>异常说明：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_error)}</span></div>` : ''}
                    <div><strong>创建时间：</strong>${escapeHtml(o.created_at || '')}</div>
                    ${o.paid_at ? `<div><strong>支付时间：</strong>${escapeHtml(o.paid_at)}</div>` : ''}
                    ${o.delivery_updated_at ? `<div><strong>交付更新时间：</strong>${escapeHtml(o.delivery_updated_at)}</div>` : ''}
                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
                        <div class="form-group"><label>交付状态</label><select id="orderDeliveryStatus">${Object.keys(statuses).map(k => `<option value="${k}" ${o.delivery_status===k?'selected':''}>${statuses[k]}</option>`).join('')}</select></div>
                        <div class="form-group"><label>交付信息</label><textarea id="orderDeliveryInfo" rows="4" placeholder="填写登录地址、面板地址、到期时间、补充说明等">${escapeHtml(o.delivery_info || '')}</textarea></div>
                        <div class="form-group"><label>交付备注</label><textarea id="orderDeliveryNote" rows="2">${escapeHtml(o.delivery_note || '')}</textarea></div>
                        <div class="form-group"><label>异常原因</label><textarea id="orderDeliveryError" rows="2">${escapeHtml(o.delivery_error || '')}</textarea></div>
                        <button class="btn btn-primary" onclick="saveOrderDeliveryStatus('${escapeHtml(o.order_no)}')">保存交付状态</button>
                    </div>
                </div>`;
            document.getElementById('adminTicketFoot').innerHTML = `<button class="btn btn-primary" onclick="closeAdminTicketDetail()">关闭</button>`;
            document.getElementById('ticketDetailModal').classList.add('show');
        });
}

function saveOrderDeliveryStatus(orderNo) {
    const statusEl = document.getElementById('orderDeliveryStatus');
    const info = (document.getElementById('orderDeliveryInfo').value || '').trim();
    let status = statusEl.value;
    if (info && ['pending', 'paid_waiting', 'provisioning'].includes(status)) {
        status = 'delivered';
        statusEl.value = status;
    }
    const body = new FormData();
    body.append('action', 'update_delivery_status');
    body.append('order_no', orderNo);
    body.append('delivery_status', status);
    body.append('delivery_info', info);
    body.append('delivery_note', document.getElementById('orderDeliveryNote').value);
    body.append('delivery_error', document.getElementById('orderDeliveryError').value);
    apiFetch('../api/orders.php', { method: 'POST', body }).then(r => r.json()).then(data => { if (data.code === 1) { showToast('交付状态已更新'); loadOrders(); } else alert(data.msg || '更新失败'); });
}

function loadTickets() {
    apiFetch('../api/tickets.php?action=all')
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('ticketTable');
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无工单</td></tr>';
                return;
            }
            ticketCache = {};
            data.data.forEach(t => { ticketCache[t.id] = t; });
            const priorityMap = ['低','中','高','紧急'];
            tbody.innerHTML = data.data.map(t => `
                <tr>
                    <td>#${t.id}</td>
                    <td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(t.title)}</span><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(t.category || 'other')} · ${priorityMap[parseInt(t.priority||1)] || '中'}</div></td>
                    <td>${escapeHtml(t.username || '-')}</td>
                    <td>${t.order_no ? `<code style="color:var(--primary)">${escapeHtml(t.order_no)}</code>` : '-'}</td>
                    <td><span class="badge ${t.status == 0 ? 'wait' : (t.status == 1 ? 'on' : 'off')}">${t.status == 0 ? '待回复' : (t.status == 1 ? '已回复' : '已关闭')}</span></td>
                    <td style="color:var(--text-muted);font-size:12px">${escapeHtml(t.updated_at)}</td>
                    <td><button class="action-btn edit" onclick="showAdminTicketDetail(${t.id})">查看</button></td>
                </tr>`).join('');
        });
}
