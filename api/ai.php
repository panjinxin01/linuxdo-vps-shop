<?php
/**
 * AI 智能生成代理接口
 * 通过 OpenAI 兼容 API 根据自然语言描述生成商品配置
 */
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['generate_product'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    match ($action) {
        'generate_product' => handleAiGenerateProduct($pdo),
        default            => jsonResponse(0, '未知操作'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.ai', $e->getMessage());
    jsonResponse(0, '服务器错误: ' . $e->getMessage());
}

function handleAiGenerateProduct(PDO $pdo): void {
    checkAdmin($pdo);
    $description = normalizeString(requestValue('description', ''), 2000);
    if ($description === '') {
        jsonResponse(0, '请输入商品描述');
    }

    // 从 settings 表读取 AI 配置
    $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name IN ('ai_api_endpoint', 'ai_api_key', 'ai_model')");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $config = [];
    foreach ($rows as $row) {
        $config[$row['key_name']] = $row['key_value'];
    }

    $endpoint = $config['ai_api_endpoint'] ?? '';
    $apiKey   = $config['ai_api_key'] ?? '';
    $model    = $config['ai_model'] ?? 'gpt-4o-mini';

    if (empty($endpoint) || empty($apiKey)) {
        jsonResponse(0, '请先在系统设置中配置 AI API 地址和 Key');
    }

    // 构建请求
    $url = rtrim($endpoint, '/') . '/chat/completions';

    $systemPrompt = '# Role
你是一个专业的 VPS 商品配置生成助手，专门用于将用户的自然语言描述转化为结构化的 JSON 数据，以便快速导入"VPS 积分商城 (Linux DO Credit)"系统。

# Task
精确提取用户输入文本中的 VPS 配置信息，并将其映射到指定的 JSON 字段中。

# Constraints
1. **绝对纯净输出**：必须且只能输出纯 JSON 字符串。严禁使用 Markdown 代码块（即不能出现 ```json 和 ```），严禁输出任何问候语、解释性文字、前言或后缀。
2. **字段类型限制**：`price` 字段的值必须是整数（Integer），请仅提取价格数字本身。如果未提及价格，请输出 0。
3. **禁止幻觉（宁缺毋滥）**：如果某个字段的信息无法从用户的描述中直接找到或明确推断，必须严格输出空字符串 ""，绝对禁止自行编造或使用默认值。
4. **语言一致性**：JSON 的 Value 语言必须完全跟随用户的输入语言（中文输入对应中文提取，英文输入对应英文提取）。
5. **固定键名**：JSON 的 Key 必须严格固定为英文（name, cpu, memory 等），绝对不可修改、增减 Key。

# Output Format
{
  "name": "商品名称",
  "cpu": "CPU规格",
  "memory": "内存规格",
  "disk": "硬盘规格",
  "bandwidth": "带宽规格",
  "region": "地区",
  "line_type": "线路类型",
  "os_type": "操作系统",
  "description": "基于用户输入的整体商品描述",
  "price": 100
}

# Example

User: "香港轻量VPS，2核4G，80G SSD，月付100"
Assistant: {"name": "香港轻量VPS", "cpu": "2核", "memory": "4G", "disk": "80G SSD", "bandwidth": "", "region": "香港", "line_type": "", "os_type": "", "description": "香港轻量VPS，2核4G，80G SSD，月付100", "price": 100}

User: "US Premium Server 4vCPU 8GB RAM 100G NVMe 1Gbps $20/month Ubuntu"
Assistant: {"name": "US Premium Server", "cpu": "4vCPU", "memory": "8GB RAM", "disk": "100G NVMe", "bandwidth": "1Gbps", "region": "US", "line_type": "Premium", "os_type": "Ubuntu", "description": "US Premium Server 4vCPU 8GB RAM 100G NVMe 1Gbps $20/month Ubuntu", "price": 20}';

    $requestBody = json_encode([
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => '请根据以下描述生成商品配置：' . $description],
        ],
        'temperature' => 0.7,
        'max_tokens' => 1024,
    ], JSON_UNESCAPED_UNICODE);

    $apiResponse = httpRequest($url, [
        'method' => 'POST',
        'data' => $requestBody,
        'headers' => [
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $apiKey,
        ],
        'timeout' => 60,
        'ssl_verify_peer' => true,
        'ssl_verify_host' => 2,
    ]);

    if (!$apiResponse['ok']) {
        jsonResponse(0, 'API 请求失败: ' . ($apiResponse['error'] ?: 'network error'));
    }

    $httpCode = (int)($apiResponse['status'] ?? 0);
    $response = (string)($apiResponse['body'] ?? '');
    if ($httpCode !== 200) {
        jsonResponse(0, 'API 返回错误 (HTTP ' . $httpCode . '): ' . utf8Substr($response, 0, 500));
    }

    $result = json_decode($response, true);
    if (!$result || !isset($result['choices'][0]['message']['content'])) {
        jsonResponse(0, 'API 返回格式异常');
    }

    $content = trim($result['choices'][0]['message']['content']);

    // 容错处理：去掉可能的 markdown 代码块包裹
    $content = preg_replace('/^```(?:json)?\s*/i', '', $content);
    $content = preg_replace('/\s*```$/', '', $content);
    $content = trim($content);

    $parsed = json_decode($content, true);
    if (!$parsed) {
        jsonResponse(0, 'AI 返回数据解析失败，请重试');
    }

    // 验证必要的数值字段
    if (isset($parsed['price'])) {
        $parsed['price'] = (int)$parsed['price'];
    }

    logAudit($pdo, 'ai.generate_product', ['description' => utf8Substr($description, 0, 100)]);
    jsonResponse(1, '生成成功', $parsed);
}
