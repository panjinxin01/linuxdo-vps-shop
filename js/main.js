// VPS积分商城 - 前端逻辑
let currentUser = null;
let selectedProduct = null;
let currentCoupon = null; // 当前使用的优惠券
let notificationInterval = null; // 通知轮询定时器
let isLoginMode = true;
let currentRole = null;
let linuxdoOAuthConfigured = false;
let csrfToken = '';

// 存储商品数据用于购买（避免XSS风险）
let productCache = {};

function initCsrfToken() {
    return window.fetch('api/csrf.php', { credentials: 'same-origin' })
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

// 分页状态
let orderPagination = { page: 1, pageSize: 5, total: 0, totalPages: 0 };
// 一键复制功能
function copyToClipboard(text, btn) {
    // 使用现代API或降级方案
    const doCopy = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        } else {
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return Promise.resolve();
        }
    };
    
    doCopy().then(() => {
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '已复制';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 1500);
        }
        showToast('复制成功');
    }).catch(() => {
        showToast('复制失败');
    });
}

// 通过data属性复制（避免XSS）
function copyFromData(btn) {
    const text = btn.dataset.copy;
    if (text) copyToClipboard(text, btn);
}

// 复制全部VPS信息
function copyAllVpsInfo(ip, port, user, pass) {
    const text = `IP: ${ip}\n端口: ${port}\n用户: ${user}\n密码: ${pass}`;
    copyToClipboard(text, null);
}

// 通过data属性复制全部VPS信息（避免XSS）
function copyAllVpsFromData(btn) {
    const ip = btn.dataset.ip;
    const port = btn.dataset.port;
    const user = btn.dataset.user;
    const pass = btn.dataset.pass;
    const text = `IP: ${ip}\n端口: ${port}\n用户: ${user}\n密码: ${pass}`;
    copyToClipboard(text, null);
}

// Toast提示
function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// HTML转义函数，防止XSS
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    initCsrfToken();
    // 先检查安装状态
    apiFetch('api/check_install.php')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                if (!data.data.config_ok || !data.data.tables_ok) {
                    window.location.href = 'admin/install.html';
                    return;
                }
                if (!data.data.admin_ok) {
                    window.location.href = 'admin/setup.html';
                    return;
                }
            }
            // 安装完成后正常加载
            checkLogin();
            loadProducts();
            loadAnnouncements();
            checkLinuxDOOAuth();
        })
        .catch(() => {
            checkLogin();
            loadProducts();
            loadAnnouncements();
            checkLinuxDOOAuth();
        });
});

// 检查Linux DO OAuth配置状态
function checkLinuxDOOAuth() {
    apiFetch('api/oauth.php?action=check')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data.configured) {
                linuxdoOAuthConfigured = true;}
        })
        .catch(() => {
            linuxdoOAuthConfigured = false;
        });
}
// 使用Linux DO登录
function loginWithLinuxDO() {
    window.location.href = 'api/oauth.php?action=login';
}

// 检查登录状态
function checkLogin() {
    apiFetch('api/user.php?action=check')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                currentUser = data.data.username;
                currentRole = data.data.role || 'user';
                renderUserArea();
                if (currentRole === 'user') {
                    loadMyOrders();
                    loadMyTickets();// 初始化通知系统
                    initNotifications();
                }
            } else {
                currentUser = null;
                currentRole = null;
                renderUserArea();
                // 清理通知
                stopNotificationPolling();
            }
        });
}
// 渲染用户区域
function renderUserArea() {
    const area = document.getElementById('userArea');
    const sidebarUserArea = document.getElementById('sidebarUserArea');
    const userNavSection = document.getElementById('userNavSection');
    
    if (currentUser) {
        let adminBtn = currentRole === 'admin'
            ? '<a href="admin/index.html" class="nav-link" style="color:var(--primary)">返回后台</a>' 
            : '';
        area.innerHTML = `
            <div class="flex items-center gap-4">
                <span style="color:var(--text-light)">👤 ${escapeHtml(currentUser)}</span>
                ${adminBtn}
                <a href="#" class="nav-link" onclick="logout();return false;">退出</a>
            </div>
        `;
        //侧边栏用户区域
        if (sidebarUserArea) {
            sidebarUserArea.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:4px 0;">
                    <div style="width:36px;height:36px;background:var(--primary-light);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--primary);font-weight:600;">${escapeHtml(currentUser.charAt(0).toUpperCase())}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:14px;font-weight:500;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(currentUser)}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${currentRole === 'admin' ? '管理员' : '普通用户'}</div>
                    </div>
                </div>
            `;
        }
        // 显示用户导航
        if (userNavSection) {
            userNavSection.style.display = currentRole === 'user' ? 'block' : 'none';
        }
    } else {
        area.innerHTML = `
            <div class="flex items-center gap-2">
                <a href="#" class="nav-link" onclick="showLogin();return false;">登录</a>
                <a href="#" class="btn btn-primary" style="padding: 6px 16px; font-size:13px" onclick="showRegister();return false;">注册</a>
            </div>
        `;
        // 侧边栏用户区域
        if (sidebarUserArea) {
            sidebarUserArea.innerHTML = `
                <button class="btn btn-primary" style="width:100%;padding:10px;" onclick="showLogin()">登录 / 注册</button>
            `;
        }
        // 隐藏用户导航
        if (userNavSection) {
            userNavSection.style.display = 'none';
        }
    }
    // 更新首页统计
    updateHomeStats();
}
// 更新首页统计数据
function updateHomeStats() {
    // 有效实例数量（从订单统计）
    const statInstances = document.getElementById('statInstances');
    if (statInstances) {
        if (currentUser && currentRole === 'user') {
            statInstances.textContent = orderPagination.total || '0';
        } else {
            statInstances.textContent = '0';
        }
    }
    
    // 更新欢迎卡片
    updateWelcomeCard();
    // 更新管理实例区域
    updateManageInstances();
}

// 更新欢迎卡片
function updateWelcomeCard() {
    const greeting = document.getElementById('welcomeGreeting');
    const avatar = document.getElementById('welcomeAvatar');
    if (!greeting) return;
    
    // 根据时间生成问候语
    const hour = new Date().getHours();
    let timeGreeting = '您好';
    if (hour >= 5 && hour < 12) timeGreeting = '早上好';
    else if (hour >= 12 && hour < 14) timeGreeting = '中午好';
    else if (hour >= 14 && hour < 18) timeGreeting = '下午好';
    else if (hour >= 18 && hour < 22) timeGreeting = '晚上好';
    else timeGreeting = '夜深了';
    
    if (currentUser) {
        greeting.textContent = `${timeGreeting}！${currentUser}`;
        if (avatar) {
            avatar.classList.add('has-user');
            avatar.innerHTML = `<span style="font-size:24px;font-weight:600;">${escapeHtml(currentUser.charAt(0).toUpperCase())}</span>`;
        }
    } else {
        greeting.textContent = '欢迎访问';
        if (avatar) {
            avatar.classList.remove('has-user');
            avatar.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        }
    }
}

// 更新管理实例区域（使用已加载的订单数据，避免重复请求）
let cachedOrderList = null;
function updateManageInstances(orderList) {
    const card = document.getElementById('manageInstanceCard');
    const tags = document.getElementById('manageInstanceTags');
    
    if (!card || !tags) return;
    
    const list = orderList || cachedOrderList;
    if (list && list.length > 0) {
        const activeOrders = list.filter(o => o.status == 1);
        if (activeOrders.length > 0) {
            card.style.display = 'block';
            tags.innerHTML = activeOrders.map(o => `
                <span class="instance-tag" onclick="showOrderDetail(${o.id})">
                    <span class="status-dot"></span>
                    ${escapeHtml(o.product_name || 'VPS-' + o.id)}
                </span>
            `).join('');
            const statInstances = document.getElementById('statInstances');
            if (statInstances) statInstances.textContent = activeOrders.length;
        } else {
            card.style.display = 'none';
        }
    } else {
        card.style.display = 'none';
    }
}
// 显示订单详情
function showOrderDetail(orderId) {
    // 切换到订单页并高亮对应订单
    switchPage('orders');
}

// 当前查看详情的商品
let currentDetailProduct = null;

// 加载商品
function loadProducts() {
    apiFetch('api/products.php?action=list')
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('productList');
            const buyContainer = document.getElementById('buyProductList');
            
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                const emptyHtml = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1;padding:40px;">暂无可用商品</p>';
                if (container) container.innerHTML = emptyHtml;
                if (buyContainer) buyContainer.innerHTML = emptyHtml;
                return;
            }
            // 缓存商品数据
            productCache = {};
            data.data.forEach(p => { productCache[p.id] = p; });
            
            // 实例列表页- 简化卡片，带详情按钮
            const listHtml = data.data.map(p => `
                <div class="card" data-id="${p.id}">
                    <h3>${escapeHtml(p.name)}</h3>
                    <div class="specs">
                        <div class="spec">
                            <small>CPU</small>
                            <div class="spec-value">${escapeHtml(p.cpu) || '-'}</div>
                        </div>
                        <div class="spec">
                            <small>内存</small>
                            <div class="spec-value">${escapeHtml(p.memory) || '-'}</div>
                        </div>
                        <div class="spec">
                            <small>硬盘</small>
                            <div class="spec-value">${escapeHtml(p.disk) || '-'}</div>
                        </div>
                        <div class="spec">
                            <small>带宽</small>
                            <div class="spec-value">${escapeHtml(p.bandwidth) || '-'}</div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <div class="price">${p.price}<span>积分/月</span></div>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-outline" onclick="showProductDetail(${p.id})">详情</button>
                            <button class="btn btn-primary" onclick="buyProductById(${p.id})">购买</button>
                        </div>
                    </div>
                </div>
            `).join('');
            // 新建实例页 - 完整详情卡片
            const buyHtml = data.data.map(p => `
                <div class="card buy-card" data-id="${p.id}">
                    <h3>${escapeHtml(p.name)}</h3>
                    <div class="specs">
                        <div class="spec">
                            <small>CPU</small>
                            <div class="spec-value">${escapeHtml(p.cpu) || '-'}</div>
                        </div>
                        <div class="spec">
                            <small>内存</small>
                            <div class="spec-value">${escapeHtml(p.memory) || '-'}</div>
                        </div>
                        <div class="spec">
                            <small>硬盘</small>
                            <div class="spec-value">${escapeHtml(p.disk) || '-'}</div>
                        </div>
                        <div class="spec">
                            <small>带宽</small>
                            <div class="spec-value">${escapeHtml(p.bandwidth) || '-'}</div>
                        </div>
                    </div>
                    <div class="buy-notice" style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.15);border-radius:8px;font-size:12px;color:var(--text-muted);line-height:1.6">
                        <div style="margin-bottom:6px;font-weight:500;color:var(--text-light)">📋 购买须知</div>
                        <ul style="margin:0;padding-left:16px">
                            <li>购买后立即生效，有效期1个月</li>
                            <li>支付完成后将获得VPS连接信息</li>
                            <li>如有问题请通过工单系统联系客服</li>
                        </ul>
                    </div>
                    <div class="card-footer">
                        <div class="price">${p.price}<span>积分/月</span></div>
                        <button class="btn btn-primary" onclick="buyProductById(${p.id})">立即购买</button>
                    </div>
                </div>
            `).join('');
            
            if (container) container.innerHTML = listHtml;
            if (buyContainer) buyContainer.innerHTML = buyHtml;
            
            // 更新首页统计
            updateHomeStats();
        })
        .catch(() => {
            const errorHtml = '<p style="color:var(--danger);text-align:center;padding:40px;">加载失败，请刷新重试</p>';
            const container = document.getElementById('productList');
            const buyContainer = document.getElementById('buyProductList');
            if (container) container.innerHTML = errorHtml;
            if (buyContainer) buyContainer.innerHTML = errorHtml;
        });
}

// 显示商品详情弹窗
function showProductDetail(id) {
    const p = productCache[id];
    if (!p) return;
    
    currentDetailProduct = p;
    document.getElementById('productDetailTitle').textContent = p.name;
    document.getElementById('productDetailBody').innerHTML = `
        <div style="margin-bottom:20px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">CPU</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.cpu) || '-'}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">内存</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.memory) || '-'}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">硬盘</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.disk) || '-'}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">带宽</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.bandwidth) || '-'}</div>
                </div>
            </div>
        </div>
        <div style="background:var(--primary-light);padding:16px;border-radius:var(--radius-md);text-align:center">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">价格</div>
            <div style="font-size:28px;font-weight:700;color:var(--primary)">${p.price}<span style="font-size:14px;font-weight:400">积分/月</span></div>
        </div><div style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.1);border-radius:var(--radius-md);font-size:13px;color:var(--text-muted);line-height:1.6">
            <div style="margin-bottom:8px;font-weight:500;color:var(--text-light)">📋购买须知</div>
            <ul style="margin:0;padding-left:20px">
                <li>购买后立即生效，有效期1个月</li>
                <li>支付完成后将获得VPS连接信息</li>
                <li>如有问题请通过工单系统联系客服</li>
            </ul>
        </div>
    `;
    document.getElementById('productDetailModal').classList.add('show');
}

// 关闭商品详情弹窗
function closeProductDetail() {
    document.getElementById('productDetailModal').classList.remove('show');
    currentDetailProduct = null;
}
// 从详情弹窗购买
function buyFromDetail() {
    if (currentDetailProduct) {
        closeProductDetail();
        buyProductById(currentDetailProduct.id);
    }
}

// 显示登录
function showLogin() {
    isLoginMode = true;
    document.getElementById('authTitle').textContent = '登录';
    document.getElementById('authBtn').textContent = '登录';
    document.getElementById('emailGroup').style.display = 'none';
    document.getElementById('authSwitch').innerHTML = '没有账号？<a href="#" style="color:var(--primary)" onclick="showRegister();return false;">立即注册</a>';
    document.getElementById('authUser').value = '';
    document.getElementById('authPass').value = '';
    // 根据OAuth配置状态显示Linux DO登录按钮
    const oauthDivider = document.getElementById('oauthDivider');
    const linuxdoBtn = document.getElementById('linuxdoLoginBtn');
    if (linuxdoOAuthConfigured) {
        oauthDivider.style.display = 'flex';
        linuxdoBtn.style.display = 'flex';
    } else {
        oauthDivider.style.display = 'none';
        linuxdoBtn.style.display = 'none';
    }
    document.getElementById('authModal').classList.add('show');
}

// 显示注册
function showRegister() {
    isLoginMode = false;
    document.getElementById('authTitle').textContent = '注册';
    document.getElementById('authBtn').textContent = '注册';
    document.getElementById('emailGroup').style.display = 'block';
    document.getElementById('authSwitch').innerHTML = '已有账号？<a href="#" style="color:var(--primary)" onclick="showLogin();return false;">立即登录</a>';
    document.getElementById('authUser').value = '';
    document.getElementById('authPass').value = '';
    document.getElementById('authEmail').value = '';
    document.getElementById('authModal').classList.add('show');
}

function closeAuth() {
    document.getElementById('authModal').classList.remove('show');
}

// 登录/注册
function doAuth() {
    const username = document.getElementById('authUser').value.trim();
    const password = document.getElementById('authPass').value;
    const email = document.getElementById('authEmail').value.trim();
    
    if (!username || !password) {
        alert('请填写用户名和密码');
        return;
    }
    
    const action = isLoginMode ? 'login' : 'register';
    const body = new FormData();
    body.append('action', action);
    body.append('username', username);
    body.append('password', password);
    if (!isLoginMode && email) {
        body.append('email', email);
    }
    apiFetch('api/user.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                closeAuth();
                if (isLoginMode) {
                    // 根据角色跳转不同页面
                    if (data.data.role === 'admin') {
                        window.location.href = 'admin/index.html';
                    } else {
            currentUser = data.data.username;
            currentRole = 'user';
            renderUserArea();
            loadMyOrders();
            initNotifications();
                    }
                } else {
                    alert('注册成功，请登录');showLogin();
                }
            } else {
                alert(data.msg);
            }
        });
}

// 退出
function logout() {
    apiFetch('api/user.php', {
        method: 'POST',
        body: new URLSearchParams({ action: 'logout' })
    }).then(() => {
        currentUser = null;
        currentRole = null;
        stopNotificationPolling();
        renderUserArea();
        document.getElementById('myOrders').innerHTML = '';
        document.getElementById('myTickets').innerHTML = '';
        initCsrfToken();
    });
}

// 通过ID购买商品（避免XSS风险）
function buyProductById(id) {
    const p = productCache[id];
    if (p) {
        buyProduct(p.id, p.name, p.price);
    }
}
// 购买商品
function buyProduct(id, name, price) {
    if (!currentUser) {
        showLogin();
        return;
    }
    selectedProduct = { id, name, price };
    currentCoupon = null;
    
    // 重置优惠券输入
    const couponInput = document.getElementById('couponCode');
    const couponMsg = document.getElementById('couponMsg');
    if (couponInput) couponInput.value = '';
    if (couponMsg) {
        couponMsg.textContent = '';
        couponMsg.className = 'coupon-msg';
    }

    renderOrderSummary();
    document.getElementById('buyModal').classList.add('show');
}

// 渲染订单摘要
function renderOrderSummary() {
    if (!selectedProduct) return;
    
    let html = `
        <div class="summary-row"><span>商品名称</span><span style="color:var(--text-main)">${escapeHtml(selectedProduct.name)}</span></div>
        <div class="summary-row"><span>购买时长</span><span style="color:var(--text-main)">1个月</span></div>
        <div class="summary-row"><span>原价</span><span style="color:var(--text-main)">${selectedProduct.price} 积分</span></div>
    `;

    if (currentCoupon) {
        html += `
            <div class="summary-row discount-row"><span>优惠券折扣</span><span>-${currentCoupon.discount} 积分</span></div>
            <div class="summary-row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                <span>应付积分</span>
                <span class="final-price">${currentCoupon.final}</span>
            </div>
        `;
    } else {
        html += `
            <div class="summary-row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                <span>应付积分</span>
                <span class="final-price" style="font-size:18px">${selectedProduct.price}</span>
            </div>
        `;
    }

    document.getElementById('orderSummary').innerHTML = html;
}

// 验证优惠券
function validateCoupon() {
    if (!selectedProduct) return;
    
    const codeInput = document.getElementById('couponCode');
    const msgEl = document.getElementById('couponMsg');
    const code = codeInput.value.trim();
    
    if (!code) {
        msgEl.textContent = '请输入优惠券码';
        msgEl.className = 'coupon-msg error';
        return;
    }

    const body = new FormData();
    body.append('action', 'validate');
    body.append('coupon_code', code);
    body.append('product_id', selectedProduct.id);

    msgEl.textContent = '验证中...';
    msgEl.className = 'coupon-msg';

    apiFetch('api/coupons.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                currentCoupon = {
                    code: code,
                    discount: data.data.discount,
                    final: data.data.final
                };
                msgEl.textContent = `验证成功：优惠 ${data.data.discount} 积分`;
                msgEl.className = 'coupon-msg success';
                renderOrderSummary();
            } else {
                currentCoupon = null;
                msgEl.textContent = data.msg;
                msgEl.className = 'coupon-msg error';
                renderOrderSummary();
            }
        })
        .catch(() => {
            msgEl.textContent = '验证失败，请重试';
            msgEl.className = 'coupon-msg error';
        });
}

function closeBuy() {
    document.getElementById('buyModal').classList.remove('show');
    selectedProduct = null;
    currentCoupon = null;
}

// 确认购买
function confirmBuy() {
    if (!selectedProduct) return;
    
    const body = new FormData();
    body.append('action', 'create');
    body.append('product_id', selectedProduct.id);
    
    if (currentCoupon) {
        body.append('coupon_code', currentCoupon.code);
    }
    
    apiFetch('api/orders.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                closeBuy();
                //跳转到支付页面
                window.location.href = 'api/pay.php?order_no=' + data.data.order_no;
            } else {
                alert(data.msg);
            }
        });
}
// 加载我的订单（支持分页）
function loadMyOrders(page = 1) {
    orderPagination.page = page;
    var container = document.getElementById('myOrders');
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">加载中...</p>';
    apiFetch('api/orders.php?action=my&page=' + page + '&page_size=' + orderPagination.pageSize, {credentials: 'same-origin'})
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.code !== 1) {
                container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">' + (data.msg || '加载失败') + '</p>';
                return;
            }
            if (!data.data || !data.data.list || data.data.list.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">暂无订单记录</p>';
                return;
            }
            
            // 更新分页状态
            orderPagination.total = data.data.total;
            orderPagination.totalPages = data.data.total_pages;
            const orders = data.data.list;
            // 缓存订单数据供首页实例管理使用
            cachedOrderList = orders;
            updateManageInstances(orders);
            let html = orders.map(o => {
                let statusClass = o.status == 1 ? 'on' : (o.status == 2 || o.status == 3 ? 'off' : 'wait');
                let statusText = o.status == 1 ? '已支付' : (o.status == 2 ? '已退款' : (o.status == 3 ? '已取消' : '待支付'));
                
                // 商品已删除、已退款、已取消的订单只显示简化信息
                if (!o.product_name || o.status == 2 || o.status == 3) {
                    let titleText = o.status == 2 ? '已退款订单' : (o.status == 3 ? '订单已取消' : '商品已删除');
                    return `
                    <div class="order-item" style="opacity:0.7">
                        <div class="order-header">
                            <span style="font-weight:600;color:var(--text-muted)">${titleText}</span>
                            <span class="badge ${statusClass}">${statusText}</span>
                        </div>
                        <div style="font-size:13px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center">
                            <div>
                                订单号：<code style="color:var(--text-light)">${escapeHtml(o.order_no)}</code>
                                <span style="margin:0 8px">|</span>
                                ${o.price}积分
                            </div>
                            <div>${escapeHtml(o.created_at)}</div>
                        </div>
                    </div>`;
                }
                // 商品配置详情区块
                const specsHtml = (o.cpu || o.memory || o.disk || o.bandwidth) ? `
                    <div class="order-specs" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;padding:12px;background:rgba(0,0,0,0.15);border-radius:8px">
                        <div style="text-align:center">
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">CPU</div>
                            <div style="font-size:13px;font-weight:500;color:var(--text-light)">${escapeHtml(o.cpu) || '-'}</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">内存</div>
                            <div style="font-size:13px;font-weight:500;color:var(--text-light)">${escapeHtml(o.memory) || '-'}</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">硬盘</div>
                            <div style="font-size:13px;font-weight:500;color:var(--text-light)">${escapeHtml(o.disk) || '-'}</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">带宽</div>
                            <div style="font-size:13px;font-weight:500;color:var(--text-light)">${escapeHtml(o.bandwidth) || '-'}</div>
                        </div>
                    </div>
                ` : '';
                
                return `
                <div class="order-item">
                    <div class="order-header">
                        <span style="font-weight:600">${escapeHtml(o.product_name)}</span>
                        <span class="badge ${statusClass}">${statusText}</span>
                    </div>
                    <div style="font-size:13px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center">
                        <div>
                            订单号：<code style="color:var(--text-light)">${escapeHtml(o.order_no)}</code>
                            <span style="margin:0 8px">|</span>
                            ${o.price}积分
                        </div>
                        <div>${escapeHtml(o.created_at)}</div>
                    </div>
                    ${specsHtml}
                    ${o.status == 1 && o.ip_address ? `
                        <div class="vps-info">
                            <div class="vps-row">
                                <span>IP地址</span>
                                <div class="vps-value"><code>${escapeHtml(o.ip_address)}</code>
                                    <button class="copy-btn" data-copy="${escapeHtml(o.ip_address)}" onclick="copyFromData(this)">复制</button>
                                </div>
                            </div>
                            <div class="vps-row">
                                <span>SSH端口</span>
                                <div class="vps-value">
                                    <code>${escapeHtml(String(o.ssh_port))}</code><button class="copy-btn" data-copy="${escapeHtml(String(o.ssh_port))}" onclick="copyFromData(this)">复制</button>
                                </div>
                            </div>
                            <div class="vps-row">
                                <span>用户名</span>
                                <div class="vps-value"><code>${escapeHtml(o.ssh_user)}</code>
                                    <button class="copy-btn" data-copy="${escapeHtml(o.ssh_user)}" onclick="copyFromData(this)">复制</button>
                                </div>
                            </div>
                            <div class="vps-row">
                                <span>密码</span>
                                <div class="vps-value">
                                    <code>${escapeHtml(o.ssh_password)}</code><button class="copy-btn" data-copy="${escapeHtml(o.ssh_password)}" onclick="copyFromData(this)">复制</button>
                                </div>
                            </div>
                            ${o.extra_info ? `<div class="vps-row"><span>备注</span><code>${escapeHtml(o.extra_info)}</code></div>` : ''}
                            <div class="vps-copy-all">
                                <button class="btn btn-outline" style="width:100%;padding:8px;font-size:12px"data-ip="${escapeHtml(o.ip_address)}" 
                                    data-port="${escapeHtml(String(o.ssh_port))}"data-user="${escapeHtml(o.ssh_user)}" 
                                    data-pass="${escapeHtml(o.ssh_password)}"
                                    onclick="copyAllVpsFromData(this)">📋 复制全部信息</button>
                            </div>
                        </div>
                    ` : o.status == 0 ? `
                        <div style="margin-top:12px;text-align:right">
                            <a href="api/pay.php?order_no=${encodeURIComponent(o.order_no)}" class="btn btn-primary" style="padding:6px 16px;font-size:13px">前往支付</a>
                        </div>
                    ` : ''}
                </div>
            `}).join('');
            
            // 添加分页控件
            if (orderPagination.totalPages > 1) {
                html += renderPagination(orderPagination.page, orderPagination.totalPages,'loadMyOrders');
            }
            
            container.innerHTML = html;
        });
}

// 渲染分页控件
function renderPagination(current, total, callback) {
    let pages = [];
    const delta = 2;
    const left = current - delta;
    const right = current + delta;
    
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= left && i <= right)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }
    
    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${current <= 1 ? 'disabled' : ''} onclick="${callback}(${current - 1})">‹</button>`;
    
    pages.forEach(p => {
        if (p === '...') {
            html += '<span class="page-dots">...</span>';
        } else {
            html += `<button class="page-btn ${p === current ? 'active' : ''}" onclick="${callback}(${p})">${p}</button>`;
        }
    });
    
    html += `<button class="page-btn" ${current >= total ? 'disabled' : ''} onclick="${callback}(${current + 1})">›</button>`;
    html += '</div>';
    return html;
}
function closeSuccess() {
    document.getElementById('successModal').classList.remove('show');
    loadProducts();
    loadMyOrders();
}

// ==================== 公告系统 ====================
// 加载公告
function loadAnnouncements() {
    apiFetch('api/announcements.php?action=list')
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('announcementList');
            const scrollList = document.getElementById('announcementScrollList');
            
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                if (container) container.innerHTML = '<div class="empty-state"><div class="empty-icon">📢</div><p>暂无公告</p></div>';
                if (scrollList) scrollList.innerHTML = '<div class="announcement-scroll-empty">暂无公告</div>';
                return;
            }
            
            // 公告页面列表
            const announcementHtml = data.data.map(a => `
                <div class="announcement-item ${a.is_top == 1 ? 'top' : ''}" onclick="showAnnouncement(${a.id})">
                    ${a.is_top == 1 ? '<span class="announcement-tag">置顶</span>' : ''}
                    <span class="announcement-title">${escapeHtml(a.title)}</span>
                    <span class="announcement-date">${escapeHtml((a.publish_at || a.created_at)?.split(' ')[0] || '')}</span>
                </div>
            `).join('');
            
            if (container) container.innerHTML = announcementHtml;
            
            // 首页滚动公告列表
            if (scrollList) {
                scrollList.innerHTML = data.data.map(a => `
                    <div class="announcement-scroll-item" onclick="showAnnouncement(${a.id})">
                        <div class="announcement-scroll-title">
                            ${a.is_top == 1 ? '<span class="tag">置顶</span>' : '🔔'}
                            ${escapeHtml(a.title)}
                        </div>
                        <div class="announcement-scroll-desc">${escapeHtml((a.content || '').substring(0, 100))}</div><a href="#" class="announcement-scroll-link" onclick="event.stopPropagation();showAnnouncement(${a.id})">详情及修复办法</a>
                    </div>
                `).join('');
            }
        })
        .catch(() => {
            const container = document.getElementById('announcementList');
            if (container) container.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
        });
}
// 显示公告详情
function showAnnouncement(id) {
    apiFetch('api/announcements.php?action=detail&id=' + id)
        .then(r => r.json())
        .then(data => {
            if (data.code === 1 && data.data) {
                document.getElementById('announcementTitle').textContent = data.data.title;
                document.getElementById('announcementBody').innerHTML = `
                    <div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
                        发布时间：${escapeHtml(data.data.publish_at || data.data.created_at)}
                    </div>
                    <div style="line-height:1.8;white-space:pre-wrap">${escapeHtml(data.data.content)}</div>
                `;
                document.getElementById('announcementModal').classList.add('show');
            }
        });
}

function closeAnnouncementModal() {
    document.getElementById('announcementModal').classList.remove('show');
}

// ==================== 工单系统 ====================

// 加载我的工单
function loadMyTickets() {
    apiFetch('api/tickets.php?action=my')
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('myTickets');
            if (data.code !== 1 || !data.data || data.data.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">暂无工单记录</p>';
                return;
            }
            container.innerHTML = data.data.map(t => {
                let statusClass = t.status == 0 ? 'wait' : (t.status == 1 ? 'on' : 'off');
                let statusText = t.status == 0 ? '待回复' : (t.status == 1 ? '已回复' : '已关闭');
                return `
                    <div class="order-item" onclick="showTicketDetail(${t.id})" style="cursor:pointer">
                        <div class="order-header">
                            <span style="font-weight:600">${escapeHtml(t.title)}</span>
                            <span class="badge ${statusClass}">${statusText}</span>
                        </div>
                        <div style="font-size:13px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center">
                            <div>
                                工单ID：<code style="color:var(--text-light)">#${t.id}</code>
                                ${t.order_no ? `<span style="margin:0 8px">|</span>关联订单：${escapeHtml(t.order_no)}` : ''}
                            </div>
                            <div>${escapeHtml(t.updated_at)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        });
}

// 显示创建工单弹窗
function showCreateTicket() {
    if (!currentUser) {
        showLogin();
        return;
    }
    // 加载用户订单到下拉框
    apiFetch('api/orders.php?action=my&page_size=100')
        .then(r => r.json())
        .then(data => {
            const select = document.getElementById('ticketOrder');
            select.innerHTML = '<option value="">不关联订单</option>';
            if (data.code === 1 && data.data && data.data.list) {
                data.data.list.forEach(o => {
                    select.innerHTML += `<option value="${o.id}">${escapeHtml(o.order_no)} - ${escapeHtml(o.product_name || '商品已删除')}</option>`;
                });
            }
        });
    document.getElementById('ticketTitle').value = '';
    document.getElementById('ticketContent').value = '';
    document.getElementById('ticketModal').classList.add('show');
}

function closeTicketModal() {
    document.getElementById('ticketModal').classList.remove('show');
}

// 提交工单
function submitTicket() {
    const title = document.getElementById('ticketTitle').value.trim();
    const content = document.getElementById('ticketContent').value.trim();
    const orderId = document.getElementById('ticketOrder').value;
    
    if (!title || !content) {
        alert('请填写标题和问题描述');
        return;
    }
    
    const body = new FormData();
    body.append('action', 'create');
    body.append('title', title);
    body.append('content', content);
    if (orderId) body.append('order_id', orderId);
    
    apiFetch('api/tickets.php', { method: 'POST', body, credentials: 'same-origin' })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                alert('工单提交成功');
                closeTicketModal();
                loadMyTickets();
            } else {
                alert(data.msg);
            }
        })
        .catch(err => {
            console.error('提交工单失败:', err);
            alert('网络错误，请重试');
        });
}

// 显示工单详情（含附件）
function showTicketDetail(id) {
    Promise.all([
        apiFetch('api/tickets.php?action=detail&id=' + id).then(r => r.json()),
        apiFetch('api/upload.php?action=list&ticket_id=' + id).then(r => r.json()).catch(() => ({code:0,data:[]}))
    ]).then(([ticketRes, attachRes]) => {
            if (ticketRes.code !== 1 || !ticketRes.data) {
                alert('获取工单详情失败');
                return;
            }
            const ticket = ticketRes.data;
            const attachments = attachRes.code === 1 ? attachRes.data : [];
            let statusClass = ticket.status == 0 ? 'wait' : (ticket.status == 1 ? 'on' : 'off');
            let statusText = ticket.status == 0 ? '待回复' : (ticket.status == 1 ? '已回复' : '已关闭');
            document.getElementById('ticketDetailTitle').textContent = ticket.title;
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
                    const fileUrl = `api/upload.php?action=download&id=${a.id}`;
                    const fileName = escapeHtml(a.original_name || '附件');
                    if (isImage) {
                        return `
                            <a class="ticket-attachment image" href="${fileUrl}" target="_blank">
                                <img src="${fileUrl}" alt="${fileName}">
                                <span class="ticket-attachment-name">${fileName}</span>
                            </a>
                        `;
                    }
                    return `
                        <a class="ticket-attachment file" href="${fileUrl}" target="_blank">
                            <span class="ticket-attachment-icon">📄</span>
                            <span class="ticket-attachment-name">${fileName}</span>
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
            
            document.getElementById('ticketDetailBody').innerHTML = `
                <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                    <span class="badge ${statusClass}" style="margin-right:12px">${statusText}</span>
                    ${ticket.order_no ? `<span style="color:var(--text-muted);font-size:13px">关联订单：${escapeHtml(ticket.order_no)}</span>` : ''}
                </div>
                <div class="ticket-replies">${repliesHtml}</div>
                ${attachHtml}
                ${ticket.status != 2 ? `
                    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
                        <textarea id="replyContent" rows="3" placeholder="输入回复内容..." style="width:100%;resize:vertical"></textarea>
                        <div style="margin-top:8px;display:flex;align-items:center;gap:10px">
                            <input type="file" id="ticketFile" accept="image/*,.txt,.log,.pdf" style="font-size:12px">
                            <button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="uploadUserTicketAttachment(${ticket.id})">上传</button>
                        </div>
                    </div>
                ` : ''}
            `;
            
            let footHtml = '';
            if (ticket.status != 2) {
                footHtml = `
                    <button class="btn btn-outline" style="flex:1" onclick="closeTicket(${ticket.id})">关闭工单</button><button class="btn btn-primary" style="flex:1" onclick="replyTicket(${ticket.id})">发送回复</button>
                `;
            } else {
                footHtml = `<button class="btn btn-primary" style="width:100%" onclick="closeTicketDetail()">关闭</button>`;
            }
            document.getElementById('ticketDetailFoot').innerHTML = footHtml;
            
            document.getElementById('ticketDetailModal').classList.add('show');
        });
}

function closeTicketDetail() {
    document.getElementById('ticketDetailModal').classList.remove('show');
}

// 回复工单
function replyTicket(ticketId) {
    const content = document.getElementById('replyContent').value.trim();
    if (!content) {
        alert('请输入回复内容');
        return;
    }
    
    const body = new FormData();
    body.append('action', 'reply');
    body.append('ticket_id', ticketId);
    body.append('content', content);
    
    apiFetch('api/tickets.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showTicketDetail(ticketId); // 刷新详情
                loadMyTickets();
            } else {
                alert(data.msg);
            }
        });
}

// 用户上传工单附件
function uploadUserTicketAttachment(ticketId) {
    const fileInput = document.getElementById('ticketFile');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
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
    
    apiFetch('api/upload.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                alert('附件上传成功');
                fileInput.value = '';
                showTicketDetail(ticketId);
            } else {
                alert(data.msg || '上传失败');
            }
        })
        .catch(() => alert('上传请求失败'));
}

// 关闭工单
function closeTicket(ticketId) {
    if (!confirm('确定要关闭此工单吗？关闭后无法再回复。')) return;
    
    const body = new FormData();
    body.append('action', 'close');
    body.append('ticket_id', ticketId);
    apiFetch('api/tickets.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                closeTicketDetail();
                loadMyTickets();
            } else {
                alert(data.msg);
            }
        });
}

//========== 通知系统 ==========

// 初始化通知系统
function initNotifications() {
    // 显示通知按钮和面板内容（已登录状态）
    const wrapper = document.getElementById('notificationWrapper');
    const list = document.getElementById('notificationList');
    const footer = document.getElementById('notificationFooter');
    const markAll = document.getElementById('notificationMarkAll');
    const loginPrompt = document.getElementById('notificationLoginPrompt');
    
    if (wrapper) wrapper.style.display = 'block';
    if (list) list.style.display = 'block';
    if (footer) footer.style.display = 'block';
    if (markAll) markAll.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
    
    // 立即加载一次
    loadNotificationCount();
    
    // 开启轮询（每30秒检查一次）
    startNotificationPolling();
    
    // 点击其他区域关闭面板
    document.addEventListener('click', handleNotificationOutsideClick);
}

// 开始通知轮询
function startNotificationPolling() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
    notificationInterval = setInterval(loadNotificationCount, 30000);
}

// 停止通知轮询（未登录状态）
function stopNotificationPolling() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
    // 切换到未登录提示状态
    const list = document.getElementById('notificationList');
    const footer = document.getElementById('notificationFooter');
    const markAll = document.getElementById('notificationMarkAll');
    const loginPrompt = document.getElementById('notificationLoginPrompt');
    
    if (list) list.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (markAll) markAll.style.display = 'none';
    if (loginPrompt) loginPrompt.style.display = 'block';
}

// 加载未读通知数量
function loadNotificationCount() {
    apiFetch('api/notifications.php?action=unread_count')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                updateNotificationBadge(data.data.count);
            }
        })
        .catch(() => {});
}

// 更新通知徽章
function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// 切换通知面板
function toggleNotificationPanel(e) {
    e.stopPropagation();
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    
    if (panel.classList.contains('show')) {
        closeNotificationPanel();
    } else {
        openNotificationPanel();
    }
}

// 打开通知面板
function openNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (panel) {
        panel.classList.add('show');
        loadNotifications();
    }
}

// 关闭通知面板
function closeNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (panel) {
        panel.classList.remove('show');
    }
}

// 处理点击外部关闭
function handleNotificationOutsideClick(e) {
    const wrapper = document.getElementById('notificationWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        closeNotificationPanel();
    }
}

//加载通知列表
function loadNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    list.innerHTML = '<div class="notification-empty">加载中...</div>';
    
    apiFetch('api/notifications.php?action=list&page_size=10')
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                renderNotificationList(data.data.list);
                updateNotificationBadge(data.data.unread);
            } else {
                list.innerHTML = '<div class="notification-empty">加载失败</div>';
            }
        })
        .catch(() => {
            list.innerHTML = '<div class="notification-empty">网络错误</div>';
        });
}

// 渲染通知列表
function renderNotificationList(notifications) {
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    if (!notifications || notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">暂无通知</div>';
        return;
    }
    
    const html = notifications.map(n => {
        const iconClass = getNotificationIconClass(n.type);
        const iconSvg = getNotificationIcon(n.type);
        const timeStr = formatNotificationTime(n.created_at);
        const unreadClass = n.is_read == 0 ? 'unread' : '';
        
        return `
            <div class="notification-item ${unreadClass}" data-notif-id="${n.id}" onclick="handleNotificationClick(${n.id}, '${escapeHtml(n.type)}', '${escapeHtml(n.related_id || '')}')">
                <div class="notification-icon ${iconClass}">${iconSvg}</div>
                <div class="notification-content">
                    <div class="notification-content-title">${escapeHtml(n.title)}</div>
                    <div class="notification-content-text">${escapeHtml(n.content)}</div>
                    <div class="notification-time">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
    
    list.innerHTML = html;
}

// 获取通知图标样式类
function getNotificationIconClass(type) {
    switch (type) {
        case 'payment': return 'success';
        case 'ticket': return 'warning';
        case 'system': return '';
        default: return '';
    }
}

// 获取通知图标SVG
function getNotificationIcon(type) {
    switch (type) {
        case 'payment':
            return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        case 'ticket':
            return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        case 'system':
        default:
            return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
}

// 格式化通知时间
function formatNotificationTime(datetime) {
    if (!datetime) return '';
    
    const date = new Date(datetime);
    const now = new Date();
    const diff = (now - date) / 1000; // 秒
    
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + '天前';
    
    return date.toLocaleDateString();
}

// 处理通知点击
function handleNotificationClick(id, type, relatedId) {
    // 标记为已读
    markNotificationRead(id);
    
    // 根据类型跳转
    closeNotificationPanel();
    
    // 订单相关通知
    if ((type.startsWith('order_') || type === 'payment') && relatedId) {
        switchPage('orders');
        return;
    }
    
    // 工单相关通知
    if ((type.startsWith('ticket_') || type === 'ticket') && relatedId) {
        switchPage('tickets');
        // 尝试打开工单详情
        setTimeout(() => showTicketDetail(parseInt(relatedId)), 300);
        return;
    }
}

// 标记单条通知已读
function markNotificationRead(id) {
    const body = new URLSearchParams();
    body.append('action', 'mark_read');
    body.append('id', id);
    
    apiFetch('api/notifications.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                loadNotificationCount();
                // 更新列表中的样式
                const items = document.querySelectorAll('.notification-item');
                items.forEach(item => {
                    if (item.dataset.notifId === String(id)) {
                        item.classList.remove('unread');
                    }
                });
            }
        });
}

// 标记全部已读
function markAllNotificationsRead() {
    const body = new URLSearchParams();
    body.append('action', 'mark_all_read');
    
    apiFetch('api/notifications.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('已全部标记为已读');
                loadNotifications();
                updateNotificationBadge(0);
            }
        });
}

//========== 通知中心全页面 ==========
let notifPageFilter = 'all';
let notifPageCurrent = 1;
const NOTIF_PAGE_SIZE = 20;

function loadNotificationPage(filter, page) {
    if (filter) notifPageFilter = filter;
    if (page) notifPageCurrent = page;
    else if (filter) notifPageCurrent = 1;

    // 更新筛选按钮状态
    const btnAll = document.getElementById('notifFilterAll');
    const btnUnread = document.getElementById('notifFilterUnread');
    if (btnAll) btnAll.style.opacity = notifPageFilter === 'all' ? '1' : '0.5';
    if (btnUnread) btnUnread.style.opacity = notifPageFilter === 'unread' ? '1' : '0.5';

    const listEl = document.getElementById('notificationPageList');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>';

    const onlyUnread = notifPageFilter === 'unread' ? '&only_unread=1' : '';
    apiFetch(`api/notifications.php?action=list&page=${notifPageCurrent}&page_size=${NOTIF_PAGE_SIZE}${onlyUnread}`)
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                renderNotificationPage(data.data);
            } else {
                listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">加载失败</div>';
            }
        })
        .catch(() => {
            listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">网络错误</div>';
        });
}

function renderNotificationPage(data) {
    const listEl = document.getElementById('notificationPageList');
    const pagEl = document.getElementById('notificationPagePagination');
    if (!listEl) return;

    const list = data.list || [];
    if (list.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted)"><div style="font-size:48px;margin-bottom:16px">🔔</div><div>暂无通知</div></div>';
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    listEl.innerHTML = list.map(n => {
        const iconClass = getNotificationIconClass(n.type);
        const iconSvg = getNotificationIcon(n.type);
        const timeStr = formatNotificationTime(n.created_at);
        const unread = n.is_read == 0;
        return '<div class="notification-item ' + (unread ? 'unread' : '') + '" style="cursor:pointer;position:relative;border-radius:12px;margin-bottom:8px;background:var(--bg-card);border:1px solid var(--border)" onclick="handleNotifPageClick(' + n.id + ',\'' + escapeHtml(n.type) + '\',\'' + escapeHtml(n.related_id || '') + '\')">'
            + '<div class="notification-icon ' + iconClass + '">' + iconSvg + '</div>'
            + '<div class="notification-content" style="flex:1;min-width:0">'
            + '<div class="notification-content-title">' + escapeHtml(n.title) + '</div>'
            + '<div class="notification-content-text">' + escapeHtml(n.content) + '</div>'
            + '<div class="notification-time">' + timeStr + '</div>'
            + '</div>'
            + (unread ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;align-self:center"></span>' : '')
            + '</div>';
    }).join('');

    // 分页
    if (pagEl) {
        const totalPages = Math.ceil((data.total || 0) / NOTIF_PAGE_SIZE);
        if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
        let html = '';
        for (let i = 1; i <= totalPages; i++) {
            const active = i === notifPageCurrent ? 'background:var(--primary);color:#fff;' : '';
            html += '<button onclick="loadNotificationPage(null,' + i + ')" style="margin:0 4px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:13px;' + active + '">' + i + '</button>';
        }
        pagEl.innerHTML = html;
    }

    updateNotificationBadge(data.unread || 0);
}

function handleNotifPageClick(id, type, relatedId) {
    markNotificationRead(id);
    setTimeout(() => loadNotificationPage(), 300);
    if ((type.startsWith('order_') || type === 'payment') && relatedId) {
        switchPage('orders'); return;
    }
    if ((type.startsWith('ticket_') || type === 'ticket') && relatedId) {
        switchPage('tickets');
        setTimeout(() => showTicketDetail(parseInt(relatedId)), 300);
        return;
    }
}

function markAllNotificationsReadPage() {
    const body = new URLSearchParams();
    body.append('action', 'mark_all_read');
    apiFetch('api/notifications.php', { method: 'POST', body })
        .then(r => r.json())
        .then(data => {
            if (data.code === 1) {
                showToast('已全部标记为已读');
                loadNotificationPage();
                updateNotificationBadge(0);
            }
        });
}
