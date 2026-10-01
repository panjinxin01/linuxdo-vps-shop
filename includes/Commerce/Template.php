<?php
/**
 * 商品模板读取与规格回填
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceGetProductTemplate(PDO $pdo, ?int $templateId): ?array {
    if (!$templateId || !commerceTableExists($pdo, 'product_templates')) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM product_templates WHERE id = ? LIMIT 1');
    $stmt->execute([$templateId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function commerceApplyTemplateToProduct(array $product, ?array $template): array {
    if (!$template) {
        return $product;
    }
    $fallbackFields = ['cpu', 'memory', 'disk', 'bandwidth', 'region', 'line_type', 'os_type', 'description', 'extra_info'];
    foreach ($fallbackFields as $field) {
        $productValue = isset($product[$field]) ? trim((string)$product[$field]) : '';
        if ($productValue === '' && isset($template[$field]) && trim((string)$template[$field]) !== '') {
            $product[$field] = $template[$field];
        }
    }
    if (empty($product['template_name']) && !empty($template['name'])) {
        $product['template_name'] = $template['name'];
    }
    return $product;
}

