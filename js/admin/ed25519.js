/* =====================================================
   Ed25519 密钥对生成（tweetnacl 纯 JS 实现）
   来源：js/admin.js
   ===================================================== */
function generateEd25519Keypair() {
  // 使用 tweetnacl 纯 JS 实现 Ed25519 密钥生成
  // 内联最小化的 seed 生成 + nacl.sign.keyPair.fromSeed
  var seed = new Uint8Array(32);
  crypto.getRandomValues(seed);

  // Ed25519 纯 JS 实现 (基于 tweetnacl 精简)
  // 由于 Web Crypto 对 Ed25519 支持有限，这里用 HMAC-SHA512 模拟密钥派生
  // 实际上我们只需要生成随机 seed + 对应公钥
  // 使用 SubtleCrypto SHA-512 来派生公钥
  crypto.subtle.digest('SHA-512', seed).then(function(hashBuf) {
    var h = new Uint8Array(hashBuf);
    // Ed25519 scalar clamp
    h[0] &= 248;
    h[31] &= 127;
    h[31] |= 64;

    // 我们无法在纯前端不引入库的情况下正确计算 Ed25519 公钥
    // 改为：生成随机 seed 作为私钥，让用户保存后由服务端验证
    // 但这不可靠，换一个方案：动态加载 tweetnacl
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js';
    script.onload = function() {
      var kp = nacl.sign.keyPair.fromSeed(seed);
      var privB64 = btoa(String.fromCharCode.apply(null, seed));
      var pubB64 = btoa(String.fromCharCode.apply(null, kp.publicKey));

      var msg = '已生成 Ed25519 密钥对：\n\n' +
        '公钥 (Public Key):\n' + pubB64 + '\n\n' +
        '私钥 (Private Key):\n' + privB64 + '\n\n' +
        '[!] 私钥极其重要，丢失后无法恢复！\n' +
        '点击「确定」将自动填入表单并下载密钥备份文件。\n' +
        '点击「取消」放弃本次生成。';
      if (!confirm(msg)) return;

      document.getElementById('cfgLdcPrivateKey').value = privB64;
      document.getElementById('cfgLdcPublicKey').value = pubB64;

      var fileContent = [
        '=== LDC Pay Ed25519 密钥对 ===',
        '生成时间: ' + new Date().toLocaleString(),
        '',
        '公钥 (Public Key, Base64):',
        pubB64,
        '',
        '私钥 (Private Key, Base64):',
        privB64,
        '',
        '[!] 请妥善保管此文件，私钥泄露将导致签名被伪造！',
        '[!] 公钥需要提交给支付后台配置。',
      ].join('\n');
      var blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ldcpay_ed25519_keypair_' + Date.now() + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('密钥已填入表单，备份文件已下载。\n记得点击「保存 LDC Pay 配置」！');
    };
    script.onerror = function() {
      alert('加载 Ed25519 库失败，请检查网络连接后重试。');
    };
    document.head.appendChild(script);
  });
}
