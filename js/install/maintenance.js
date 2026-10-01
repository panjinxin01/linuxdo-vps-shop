/* =====================================================
   数据库维护页逻辑
   来源：admin/maintenance.html 内联脚本（结构整理抽出，内容零改动）
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
            const opts = { credentials: 'same-origin', cache: 'no-store', ...options };
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

        document.addEventListener('DOMContentLoaded', function() {
            apiFetch('../api/admin.php?action=check&_ts=' + Date.now())
                .then(r => r.json())
                .then(data => {
                    if (data.code !== 1) location.href = 'login.html';
                })
                .catch(() => location.href = 'login.html');
        });

        function checkDbStatus() {
            const statusDiv = document.getElementById('dbStatus');
            statusDiv.className = 'show loading';
            statusDiv.innerHTML = '⏳ 正在检查...';

            apiFetch('../api/update_db.php?action=check&_ts=' + Date.now())
                .then(r => r.json())
                .then(data => {
                    if (data.code === 1) {
                        const info = data.data;
                        if (info.all_installed) {
                            statusDiv.className = 'show success';
                            const build = info.build ? ('<br><small style="opacity:0.8">构建版本: ' + info.build + '</small>') : '';
                            const missingColCount = info.missing_columns ? info.missing_columns.length : 0;
                            const missingCols = (info.missing_columns && info.missing_columns.length) ? ('<br><small style="opacity:0.8">缺失关键列: ' + info.missing_columns.join(', ') + '</small>') : '';
                            const columnOk = info.all_columns_ready !== false;
                            if (columnOk) {
                                statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> 数据库状态正常，所有表和关键列已安装' + build + '<br><small style="opacity:0.8">已安装表: ' + info.existing.join(', ') + '</small>';
                            } else {
                                statusDiv.className = 'show warning';
                                statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> 表都在，但关键列不完整' + build + (missingColCount ? ('<br><small style="opacity:0.8">缺失数量: ' + missingColCount + '</small>') : '') + missingCols + '<br><small style="opacity:0.8">请点击“更新数据库”执行补列</small>';
                            }
                        } else {
                            statusDiv.className = 'show warning';
                            statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> 发现缺失的表:<strong>' + info.missing.join(', ') + '</strong><br><small style="opacity:0.8">请点击"更新数据库"按钮进行安装</small>';
                        }
                    } else {
                        statusDiv.className = 'show error';
                        statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> 检查失败: ' + data.msg;
                    }
                })
                .catch(() => {
                    statusDiv.className = 'show error';
                    statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> 网络错误，请检查网络连接';
                });
        }

        function updateDatabase() {
            const statusDiv = document.getElementById('dbStatus');

            // 第一步：先检查当前数据库结构是否已经完整
            statusDiv.className = 'show loading';
            statusDiv.innerHTML = '⏳ 正在检查数据库结构...';

            apiFetch('../api/update_db.php?action=check&_ts=' + Date.now())
                .then(r => r.json())
                .then(checkData => {
                    const info = checkData.data || {};
                    const tablesReady = !!info.all_installed;
                    const columnsReady = info.all_columns_ready !== false;

                    // 情况一：所有表和关键列都已齐全 → 无需执行任何更新
                    if (checkData.code === 1 && tablesReady && columnsReady) {
                        statusDiv.className = 'show success';
                        statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <strong>数据库已完整安装，无需更新。</strong><br><small style="opacity:0.8">所有数据表和关键字段均已就绪，本次没有需要新增或修补的内容，未对数据库做任何改动。</small>';
                        return;
                    }

                    // 情况二：存在缺失的表 / 关键列 → 提示将新增的内容并确认
                    let missingDesc = '';
                    if (!tablesReady && info.missing && info.missing.length) {
                        missingDesc += '<br><small style="opacity:0.8">待新建数据表（' + info.missing.length + ' 张）：' + info.missing.join(', ') + '</small>';
                    }
                    if (!columnsReady && info.missing_columns && info.missing_columns.length) {
                        missingDesc += '<br><small style="opacity:0.8">待补齐关键字段（' + info.missing_columns.length + ' 个）：' + info.missing_columns.join(', ') + '</small>';
                    }
                    if (!confirm('检测到数据库结构不完整，即将自动补齐缺失内容（不会删除、修改任何现有数据）。' + missingDesc.replace(/<[^>]+>/g, '\n') + '\n\n确定继续吗？')) {
                        statusDiv.className = '';
                        statusDiv.innerHTML = '';
                        return;
                    }

                    statusDiv.className = 'show loading';
                    statusDiv.innerHTML = '⏳ 正在更新数据库...';

                    const body = new FormData();
                    body.append('action', 'update');

                    apiFetch('../api/update_db.php', { method: 'POST', body })
                        .then(r => r.json())
                        .then(data => {
                            const res = data.data || {};
                            const build = res.build ? ('<br><small style="opacity:0.8">构建版本: ' + res.build + '</small>') : '';
                            const createdCount = (res.created || []).length;
                            const migratedCount = (res.migrated || []).length;
                            const created = createdCount ? ('<br><small style="opacity:0.8">✅ 本次新增数据表 ' + createdCount + ' 张：' + res.created.join(', ') + '</small>') : '';
                            const migrated = migratedCount ? ('<br><small style="opacity:0.8">✅ 本次新增/补齐字段及数据项 ' + migratedCount + ' 个：' + res.migrated.join(', ') + '</small>') : '';
                            const remaining = (res.remaining_missing_columns || []).length ? ('<br><small style="opacity:0.8">⚠️ 仍缺关键列: ' + res.remaining_missing_columns.join(', ') + '</small>') : '';
                            const errors = (res.errors || []).length ? ('<br><small style="opacity:0.8">错误详情:<br>' + res.errors.join('<br>') + '</small>') : '';

                            if (data.code === 1) {
                                statusDiv.className = 'show success';
                                if (createdCount === 0 && migratedCount === 0) {
                                    // 执行了更新，但实际没有产生任何新增
                                    statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <strong>检查完成：数据库结构已是最新版本，本次无需新增任何表或字段。</strong>' + build;
                                } else {
                                    statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <strong>更新完成！</strong>' + build + created + migrated + '<br><small style="opacity:0.8">现有数据均未受影响。</small>';
                                }
                                setTimeout(checkDbStatus, 300);
                            } else {
                                statusDiv.className = 'show error';
                                statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> <strong>更新失败：</strong>' + data.msg + build + created + migrated + remaining + errors;
                            }
                        })
                        .catch(() => {
                            statusDiv.className = 'show error';
                            statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> 网络错误，请检查网络连接';
                        });
                })
                .catch(() => {
                    statusDiv.className = 'show error';
                    statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> 网络错误，请检查网络连接';
                });
        }

        function resetDatabase() {
            const confirmText = prompt('此操作将删除所有数据！\n\n如果确定要重置，请输入 "RESET" 确认：');
            if (confirmText !== 'RESET') {
                if (confirmText !== null) alert('输入不正确，操作已取消');
                return;
            }

            if (!confirm('最后确认：真的要删除所有数据并重置数据库吗？\n\n此操作不可恢复！')) return;

            const statusDiv = document.getElementById('dbStatus');
            statusDiv.className = 'show loading';
            statusDiv.innerHTML = '⏳ 正在重置数据库...';

            const body = new FormData();
            body.append('action', 'reset');

            apiFetch('../api/update_db.php', { method: 'POST', body })
                .then(r => r.json())
                .then(data => {
                    const info = data.data || {};
                    const build = info.build ? ('<br><small style="opacity:0.8">构建版本: ' + info.build + '</small>') : '';
                    const created = (info.created || []).length ? ('<br><small style="opacity:0.8">新建表: ' + info.created.join(', ') + '</small>') : '';
                    const migrated = (info.migrated || []).length ? ('<br><small style="opacity:0.8">已补项目: ' + info.migrated.join(', ') + '</small>') : '';
                    const remaining = (info.remaining_missing_columns || []).length ? ('<br><small style="opacity:0.8">仍缺关键列: ' + info.remaining_missing_columns.join(', ') + '</small>') : '';
                    const errors = (info.errors || []).length ? ('<br><small style="opacity:0.8">错误详情:<br>' + info.errors.join('<br>') + '</small>') : '';
                    if (data.code === 1) {
                        statusDiv.className = 'show success';
                        statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ' + data.msg + build + created + migrated + remaining;
                        setTimeout(checkDbStatus, 300);
                    } else {
                        statusDiv.className = 'show error';
                        statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ' + data.msg + build + created + migrated + remaining + errors;
                    }
                })
                .catch(() => {
                    statusDiv.className = 'show error';
                    statusDiv.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> 网络错误，请检查网络连接';
                });
        }
