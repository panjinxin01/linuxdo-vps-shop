// 安装向导前端逻辑
const API = '../api/install.php';
let currentStep = 1;
let generatedKey = '';

function $(id) { return document.getElementById(id); }

function showMsg(id, text, type) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg-box ' + (type || '');
}

function clearMsg(id) {
    const el = $(id);
    if (!el) return;
    el.textContent = '';
    el.className = 'msg-box';
}

function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = '<span class="loading"></span>请稍候...';
    } else {
        btn.textContent = btn.dataset.origText || '提交';
    }
}

function goStep(step) {
    currentStep = step;
    document.querySelectorAll('.step-view').forEach(function(el) {
        el.classList.toggle('active', el.dataset.step == step);
    });
    // 更新步骤指示器
    document.querySelectorAll('.step-dot').forEach(function(dot, i) {
        dot.classList.remove('active', 'done');
        if (i + 1 < step) dot.classList.add('done');
        else if (i + 1 === step) dot.classList.add('active');
    });
}

function postApi(action, data) {
    var body = new FormData();
    body.append('action', action);
    if (data) {
        Object.keys(data).forEach(function(k) { body.append(k, data[k]); });
    }
    return fetch(API, { method: 'POST', body: body })
        .then(function(r) { return r.json(); });
}

// 初始化：加载当前配置
function init() {
    fetch(API + '?action=get_config')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.code === 1 && res.data) {
                var d = res.data;
                $('dbHost').value = d.DB_HOST || 'localhost';
                $('dbPort').value = d.DB_PORT || 3306;
                $('dbUser').value = d.DB_USER || 'root';
                $('dbPass').value = d.DB_PASS || '';
                $('dbName').value = d.DB_NAME || 'vps_shop';
            }
        })
        .catch(function() {});
    goStep(1);
}

// 步骤1：测试数据库连接
function testConnection() {
    clearMsg('step1Msg');
    var btn = $('btnTest');
    setLoading(btn, true);

    postApi('test_db', {
        db_host: $('dbHost').value,
        db_port: $('dbPort').value,
        db_user: $('dbUser').value,
        db_pass: $('dbPass').value
    }).then(function(res) {
        setLoading(btn, false);
        showMsg('step1Msg', res.msg, res.code === 1 ? 'success' : 'error');
    }).catch(function() {
        setLoading(btn, false);
        showMsg('step1Msg', '请求失败，请检查网络', 'error');
    });
}

// 步骤1：保存配置并进入下一步
function saveAndNext() {
    clearMsg('step1Msg');
    var btn = $('btnSave');
    setLoading(btn, true);

    postApi('save_config', {
        db_host: $('dbHost').value,
        db_port: $('dbPort').value,
        db_user: $('dbUser').value,
        db_pass: $('dbPass').value,
        db_name: $('dbName').value
    }).then(function(res) {
        setLoading(btn, false);
        if (res.code === 1) {
            goStep(2);
        } else {
            showMsg('step1Msg', res.msg, 'error');
        }
    }).catch(function() {
        setLoading(btn, false);
        showMsg('step1Msg', '请求失败', 'error');
    });
}

// 步骤2：生成加密密钥
function generateKey() {
    clearMsg('step2Msg');
    var btn = $('btnGenKey');
    setLoading(btn, true);

    postApi('generate_key', {}).then(function(res) {
        setLoading(btn, false);
        if (res.code === 1 && res.data) {
            generatedKey = res.data.key;
            $('keyDisplay').style.display = 'block';
            $('keyCode').textContent = generatedKey;
            $('btnGenKey').style.display = 'none';
            showMsg('step2Msg', res.msg, res.data.written ? 'success' : 'warning');
        } else {
            showMsg('step2Msg', res.msg || '生成失败', 'error');
        }
    }).catch(function() {
        setLoading(btn, false);
        showMsg('step2Msg', '请求失败', 'error');
    });
}

// 复制密钥
function copyKey() {
    var text = generatedKey || ($('keyCode') && $('keyCode').textContent) || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            alert('密钥已复制，请妥善保存！');
        }).catch(function() { fallbackCopy(text); });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        alert('密钥已复制，请妥善保存！');
    } catch (e) {
        alert('复制失败，请手动复制');
    }
    document.body.removeChild(ta);
}

// 步骤2 -> 步骤3
function goToInstall() {
    goStep(3);
}

// 步骤3：执行安装
function runInstall() {
    clearMsg('step3Msg');
    var btn = $('btnInstall');
    setLoading(btn, true);

    postApi('run_install', {}).then(function(res) {
        setLoading(btn, false);
        if (res.code === 1) {
            goStep(4);
            setTimeout(function() {
                window.location.href = 'setup.html';
            }, 2000);
        } else {
            showMsg('step3Msg', res.msg, 'error');
        }
    }).catch(function() {
        setLoading(btn, false);
        showMsg('step3Msg', '请求失败', 'error');
    });
}

// 页面加载
document.addEventListener('DOMContentLoaded', init);
