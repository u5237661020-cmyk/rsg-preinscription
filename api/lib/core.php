<?php
// ═══════════════════════════════════════════════════════════════════
// Socle de l'API : configuration, base de données, erreurs, sessions
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

final class ApiError extends Exception
{
    public string $apiCode;
    public int $httpStatus;

    public function __construct(string $apiCode, string $message, int $httpStatus = 400)
    {
        parent::__construct($message);
        $this->apiCode = $apiCode;
        $this->httpStatus = $httpStatus;
    }
}

const API_STATUS = [
    'invalid-argument'    => 400,
    'failed-precondition' => 412,
    'permission-denied'   => 403,
    'unauthenticated'     => 401,
    'not-found'           => 404,
    'already-exists'      => 409,
    'resource-exhausted'  => 429,
    'internal'            => 500,
];

function fail(string $code, string $message): never
{
    throw new ApiError($code, $message, API_STATUS[$code] ?? 400);
}

function clean(mixed $value): string
{
    if ($value === null || $value === false) return '';
    if (is_array($value)) return '';
    return trim((string)$value);
}

/** Supprime récursivement les valeurs null en tête ? Non : on conserve null (comme Firestore). */
function json_out(mixed $data, int $status = 200): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
}

function json_decode_assoc(?string $raw): mixed
{
    if ($raw === null || $raw === '') return null;
    return json_decode($raw, true, 512, JSON_BIGINT_AS_STRING);
}

function json_encode_doc(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) fail('invalid-argument', 'Données invalides (encodage JSON impossible).');
    return $json;
}

function now_iso(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

function now_ms(): int
{
    return (int)floor(microtime(true) * 1000);
}

/** Vrai si $value est un tableau associatif (objet JSON) et non une liste. */
function is_assoc(mixed $value): bool
{
    return is_array($value) && ($value === [] ? false : !array_is_list($value));
}

/**
 * Les documents sont manipulés en objets (stdClass) pour conserver la
 * distinction JSON entre {} et [] (comme Firestore).
 */
function to_obj(mixed $value): stdClass
{
    if ($value instanceof stdClass) return $value;
    if (!is_array($value)) return new stdClass();
    $obj = json_decode(json_encode_doc((object)$value));
    return $obj instanceof stdClass ? $obj : new stdClass();
}

function obj_to_array(mixed $value): array
{
    $arr = json_decode(json_encode_doc($value), true);
    return is_array($arr) ? $arr : [];
}

/** Fusion profonde façon Firestore set({merge:true}) : les objets sont fusionnés, les listes remplacées. */
function doc_merge(stdClass $base, stdClass $patch): stdClass
{
    foreach (get_object_vars($patch) as $key => $value) {
        if ($value instanceof stdClass && isset($base->$key) && $base->$key instanceof stdClass) {
            $base->$key = doc_merge($base->$key, $value);
        } else {
            $base->$key = $value;
        }
    }
    return $base;
}

function decode_obj(?string $raw): ?stdClass
{
    if ($raw === null || $raw === '') return null;
    $d = json_decode($raw, false, 512, JSON_BIGINT_AS_STRING);
    return $d instanceof stdClass ? $d : new stdClass();
}

// ── Configuration ────────────────────────────────────────────────────

function config(?string $key = null): mixed
{
    static $config = null;
    if ($config === null) {
        $candidates = [
            dirname(__DIR__, 3) . '/rsg-preinscription-config.php', // hors du dossier web (recommandé)
            dirname(__DIR__, 2) . '/rsg-preinscription-config.php',
            dirname(__DIR__) . '/config.php',
        ];
        foreach ($candidates as $file) {
            if (is_file($file)) {
                $config = require $file;
                break;
            }
        }
        if (!is_array($config)) {
            throw new ApiError('internal', "Configuration serveur absente : créez api/config.php à partir de config.sample.php.", 500);
        }
    }
    if ($key === null) return $config;
    return $config[$key] ?? null;
}

// ── Base de données ──────────────────────────────────────────────────

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = config('db') ?: [];
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'] ?? 'localhost', $c['name'] ?? '');
    if (!empty($c['port'])) $dsn .= ';port=' . (int)$c['port'];
    try {
        $pdo = new PDO($dsn, $c['user'] ?? '', $c['password'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[RSG] Connexion MySQL impossible : ' . $e->getMessage());
        throw new ApiError('internal', 'Connexion à la base de données impossible : vérifiez api/config.php.', 500);
    }
    ensure_schema($pdo);
    return $pdo;
}

function ensure_schema(PDO $pdo): void
{
    $ok = $pdo->query("SHOW TABLES LIKE 'login_attempts'")->fetchColumn();
    if ($ok) return;
    $sql = file_get_contents(dirname(__DIR__) . '/schema.sql') ?: '';
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        $pdo->exec($statement);
    }
}

function config_doc_raw(string $path): ?string
{
    $st = db()->prepare('SELECT data FROM config_docs WHERE path = ?');
    $st->execute([$path]);
    $raw = $st->fetchColumn();
    return $raw === false ? null : (string)$raw;
}

/** Lecture en tableau associatif (pour la logique serveur). */
function config_doc_get(string $path): ?array
{
    $raw = config_doc_raw($path);
    if ($raw === null) return null;
    $data = json_decode_assoc($raw);
    return is_array($data) ? $data : [];
}

/** Lecture en objet (pour renvoyer au navigateur sans perdre les {}). */
function config_doc_obj(string $path): ?stdClass
{
    return decode_obj(config_doc_raw($path));
}

function config_doc_set(string $path, stdClass|array $data, bool $merge = false): void
{
    $data = to_obj($data);
    if ($merge) {
        $data = doc_merge(config_doc_obj($path) ?? new stdClass(), $data);
    }
    $st = db()->prepare('INSERT INTO config_docs (path, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)');
    $st->execute([$path, json_encode_doc($data)]);
}

// ── Sessions bureau (jeton signé HMAC) ───────────────────────────────

function b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64url_decode(string $txt): string
{
    return base64_decode(strtr($txt, '-_', '+/') . str_repeat('=', (4 - strlen($txt) % 4) % 4)) ?: '';
}

function session_secret(): string
{
    $secret = clean(config('session_secret'));
    if (strlen($secret) < 32 || str_starts_with($secret, 'REMPLACEZ')) {
        throw new ApiError('internal', 'session_secret manquant ou trop court dans api/config.php.', 500);
    }
    return $secret;
}

function create_admin_token(): string
{
    $ttl = (int)(config('session_ttl') ?: 12 * 3600);
    $payload = ['admin' => true, 'role' => 'bureau', 'club' => 'rsg', 'uid' => 'rsg-admin', 'iat' => time(), 'exp' => time() + $ttl];
    $body = b64url_encode(json_encode($payload));
    $sig = b64url_encode(hash_hmac('sha256', $body, session_secret(), true));
    return $body . '.' . $sig;
}

function read_admin_token(): ?array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) $header = $value;
        }
    }
    if ($header === '') $header = $_SERVER['HTTP_X_RSG_AUTH'] ?? '';
    if (!preg_match('/^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/', trim($header), $m)) return null;
    $expected = b64url_encode(hash_hmac('sha256', $m[1], session_secret(), true));
    if (!hash_equals($expected, $m[2])) return null;
    $payload = json_decode(b64url_decode($m[1]), true);
    if (!is_array($payload) || ($payload['admin'] ?? false) !== true) return null;
    if ((int)($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}

function is_admin_request(): bool
{
    return read_admin_token() !== null;
}

function assert_admin(): array
{
    $token = read_admin_token();
    if (!$token) fail('permission-denied', 'Session bureau invalide ou expirée.');
    return $token;
}

// ── Exécution après réponse (envois d'e-mails en arrière-plan) ────────

function finish_response_then(callable $task): void
{
    $GLOBALS['__rsg_after_response'][] = $task;
}

function run_after_response_tasks(): void
{
    $tasks = $GLOBALS['__rsg_after_response'] ?? [];
    if (!$tasks) return;
    ignore_user_abort(true);
    @set_time_limit(300);
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } elseif (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } else {
        @ob_end_flush();
        @flush();
    }
    foreach ($tasks as $task) {
        try {
            $task();
        } catch (Throwable $e) {
            error_log('[RSG] Tâche différée en erreur : ' . $e->getMessage());
        }
    }
}
