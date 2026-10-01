<?php
/**
 * 分页参数与分页响应封装
 * 来源：includes/db.php（目录结构拆分，内容零改动）
 */

function paginateParams(int $defaultSize = 20, int $maxSize = 100): array {
    $page = validateInt(requestValue('page', 1), 1) ?? 1;
    $pageSize = validateInt(requestValue('page_size', $defaultSize), 1, $maxSize) ?? $defaultSize;
    return ['page' => $page, 'page_size' => $pageSize, 'offset' => ($page - 1) * $pageSize];
}

function paginateResponse(array $list, int $total, array $paginate): array {
    return [
        'list' => $list,
        'total' => $total,
        'page' => $paginate['page'],
        'page_size' => $paginate['page_size'],
        'total_pages' => $paginate['page_size'] > 0 ? (int)ceil($total / $paginate['page_size']) : 0,
    ];
}

