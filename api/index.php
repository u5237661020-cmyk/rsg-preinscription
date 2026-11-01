<?php
// ═══════════════════════════════════════════════════════════════════
// RSG Préinscription — point d'entrée unique de l'API (o2switch)
// Appel : POST /api/index.php?action=<nom>   corps JSON
// Réponse : JSON { ...résultat } ou { "error": { "code", "message" } }
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

ini_set('display_errors', '0');
mb_internal_encoding('UTF-8');

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/domain.php';
require __DIR__ . '/lib/mailer.php';
require __DIR__ . '/lib/pdf.php';
require __DIR__ . '/lib/actions.php';

function send_cors_headers(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return;
    try {
        $allowed = config('allowed_origins') ?: [];
    } catch (Throwable) {
        $allowed = [];
    }
    if (in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-RSG-Auth');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Max-Age: 600');
    }
}

header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Referrer-Policy: same-origin');
send_cors_headers();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('invalid-argument', 'Méthode non autorisée (POST attendu).');
    $action = clean($_GET['action'] ?? '');
    $actions = api_actions();
    if (!isset($actions[$action])) fail('not-found', 'Action inconnue.');

    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') $raw = '{}';
    $in = json_decode($raw, true, 512, JSON_BIGINT_AS_STRING);
    $obj = json_decode($raw, false, 512, JSON_BIGINT_AS_STRING);
    if (!is_array($in) || !($obj instanceof stdClass)) {
        // Corps vide ou tronqué (ex. dépassement de post_max_size)
        if ($raw !== '{}' && $in === null) fail('invalid-argument', 'Requête illisible ou trop volumineuse.');
        $in = [];
        $obj = new stdClass();
    }

    $result = $actions[$action]($in, $obj);
    if ($result instanceof RawJson) {
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo $result->json;
    } else {
        json_out($result);
    }
} catch (ApiError $e) {
    json_out(['error' => ['code' => $e->apiCode, 'message' => $e->getMessage()]], $e->httpStatus);
} catch (Throwable $e) {
    error_log('[RSG] Erreur API : ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['error' => ['code' => 'internal', 'message' => 'Erreur serveur : ' . $e->getMessage()]], 500);
}

run_after_response_tasks();
