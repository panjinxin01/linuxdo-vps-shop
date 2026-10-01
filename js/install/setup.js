/* =====================================================
   首次创建管理员页逻辑
   来源：admin/setup.html 内联脚本（结构整理抽出，内容零改动）
   ===================================================== */
        let csrfToken = '';
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

        initCsrfToken();

        let installState = {};

        function skipExistingAdminSetup() {
            window.location.href = 'login.html';
        }

        function openRecoveryResetAction() {
            const guide = document.getElementById('recoveryGuide');
            const panel = document.getElementById('recoveryPanel');
            const target = installState.recovery_enabled ? panel : guide;
            if (target && typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (installState.recovery_enabled) {
                const recoveryKeyInput = document.getElementById('recoveryKey');
                if (recoveryKeyInput) {
                    setTimeout(() => recoveryKeyInput.focus(), 250);
                }
            } else {
                alert('当前恢复模式尚未启用，已为你定位到重置管理员操作说明。请先按说明配置 /api/config.local.php。');
            }
        }

        function setSetupLocked(locked, state = {}) {
            installState = state || installState || {};
            ['username', 'password', 'password2', 'setupBtn'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !!locked;
            });
            const notice = document.getElementById('existingAdminNotice');
            const loginBtn = document.getElementById('goLoginBtn');
            const resetBtn = document.getElementById('resetAdminBtn');
            const subtitle = document.getElementById('setupSubtitle');
            const guide = document.getElementById('recoveryGuide');
            const panel = document.getElementById('recoveryPanel');
            if (notice) notice.style.display = locked ? 'block' : 'none';
            if (loginBtn) loginBtn.style.display = locked ? 'block' : 'none';
            if (resetBtn) {
                resetBtn.style.display = locked ? 'block' : 'none';
                resetBtn.textContent = installState.recovery_enabled ? '执行重置管理员操作' : '查看重置管理员操作说明';
                resetBtn.className = installState.recovery_enabled ? 'btn btn-danger' : 'btn btn-outline';
            }
            if (guide) guide.style.display = locked ? 'block' : 'none';
            const recoveryActionable = !!(installState.recovery_enabled && installState.recovery_local_allowed);
            if (panel) panel.style.display = locked && recoveryActionable ? 'block' : 'none';
            if (subtitle) {
                subtitle.textContent = locked
                    ? (recoveryActionable
                        ? '当前数据库中已存在管理员账号。你可以跳过管理员初始化前往登录，或使用已启用的恢复模式重新初始化管理员。'
                        : '当前数据库中已存在管理员账号。你可以直接跳过前往登录，或按下方说明启用恢复模式后再重置管理员。')
                    : '初始化系统，设置首个管理员账号';
            }
            if (guide) {
                let hint = '当前恢复模式未启用，所以页面只会显示操作说明，不会直接提供危险操作按钮。';
                if (installState.recovery_enabled && !installState.recovery_local_allowed) {
                    hint = '恢复模式已启用，但当前访问来源不是服务器本机，因此不会展示危险操作面板。请在本机访问后执行。';
                } else if (recoveryActionable) {
                    hint = '已检测到恢复模式处于启用状态：请谨慎输入恢复密钥后再执行清空。';
                }
                guide.dataset.extraHint = hint;
                guide.innerHTML = guide.innerHTML.replace(/<div id="recoveryDynamicHint"[\s\S]*?<\/div>/, '');
                guide.insertAdjacentHTML('beforeend', '<div id="recoveryDynamicHint" style="margin-top:8px;color:' + (recoveryActionable ? '#fca5a5' : '#93c5fd') + '">' + hint + '</div>');
            }
        }

        // 检查安装状态
        apiFetch('../api/check_install.php?_=' + Date.now())
            .then(r => r.json())
            .then(data => {
                if (data.code === 1) {
                    installState = data.data || {};
                    if (!installState.config_ok || !installState.tables_ok) {
                        window.location.replace('install.html');
                    } else if (installState.admin_ok) {
                        setSetupLocked(true, installState);
                    }
                }
            });

        function doSetup() {
            const user = document.getElementById('username').value.trim();
            const pass = document.getElementById('password').value;
            const pass2 = document.getElementById('password2').value;

            if (!user || !pass) {
                alert('请填写完整');
                return;
            }
            if (pass.length < 6) {
                alert('密码至少6位');
                return;
            }
            if (pass !== pass2) {
                alert('两次密码不一致');
                return;
            }

            const body = new FormData();
            body.append('action', 'setup');
            body.append('username', user);
            body.append('password', pass);

            apiFetch('../api/admin.php', { method: 'POST', body })
                .then(r => r.json())
                .then(data => {
                    if (data.code === 1) {
                        alert('管理员创建成功！即将跳转到登录页面');
                        window.location.replace('login.html');
                    } else {
                        if ((data.msg || '').includes('管理员已存在')) {
                            setSetupLocked(true, installState);
                            alert('当前数据库中已经存在管理员账号，不能重复创建。你可以直接跳过管理员初始化前往登录，或在当前页面执行重置管理员操作。');
                            return;
                        }
                        alert(data.msg);
                    }
                });
        }

        function doRecoveryReset() {
            if (!installState.recovery_enabled) {
                alert('恢复模式尚未启用，请先到 /api/config.local.php 中把 ADMIN_RECOVERY_ENABLED 改为 true，并设置 ADMIN_RECOVERY_KEY。');
                return;
            }

            const recoveryKey = document.getElementById('recoveryKey').value.trim();
            const confirmText = document.getElementById('recoveryConfirm').value.trim();
            if (!recoveryKey || !confirmText) {
                alert('请填写恢复密钥和确认文本');
                return;
            }
            if (!confirm('该操作会删除当前数据库中的所有管理员账号，是否继续？')) {
                return;
            }

            const body = new FormData();
            body.append('action', 'recovery_reset');
            body.append('recovery_key', recoveryKey);
            body.append('confirm_text', confirmText);

            apiFetch('../api/admin.php', { method: 'POST', body })
                .then(r => r.json())
                .then(data => {
                    if (data.code === 1) {
                        alert(data.msg + ' 页面将刷新，随后你可以创建新的首个管理员。');
                        window.location.replace('setup.html');
                    } else {
                        alert(data.msg);
                    }
                });
        }

        if (new URLSearchParams(window.location.search).get('existing_admin') === '1') {
            setSetupLocked(true, installState);
        }
