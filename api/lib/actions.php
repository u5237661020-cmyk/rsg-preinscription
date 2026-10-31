<?php
// ═══════════════════════════════════════════════════════════════════
// Actions de l'API (équivalents des anciennes Cloud Functions et des
// accès directs à Firestore depuis l'application).
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

const ADMIN_ACCESS_DOC = 'security/adminAccess';
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const ADMIN_PASSWORD_ITERATIONS = 210000;
const PUBLIC_FORBIDDEN_KEYS = [
    'emailAttestationEnvoyeLe', 'emailAttestationDernierDestinataire', 'emailAttestationMessageId',
    'emailAttestationStatus', 'emailAttestationErreur', 'emailAttestationSource',
    'footclubsStatut', 'footclubsCommentaire',
];
const BULK_ATTACHMENT_MAX_FILES = 5;
const BULK_ATTACHMENT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const BULK_ATTACHMENT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;

function tarifs_path(string $saison): string { return "saisons/{$saison}/tarifs"; }
function licencies_path(string $saison): string { return "saisons/{$saison}/licencies"; }

function assert_saison(mixed $value): string
{
    $saison = clean($value);
    if ($saison === '') fail('invalid-argument', 'Saison requise.');
    if (strlen($saison) > 30 || !preg_match('/^[A-Za-z0-9_-]+$/', $saison)) fail('invalid-argument', 'Saison invalide.');
    return $saison;
}

function get_tarifs(string $saison): array
{
    $doc = config_doc_get(tarifs_path($saison));
    return is_array($doc['tarifs'] ?? null) ? $doc['tarifs'] : [];
}

// ── Préinscriptions : accès base ─────────────────────────────────────

function inscription_raw(string $saison, string $id, bool $forUpdate = false): ?string
{
    $st = db()->prepare('SELECT data FROM preinscriptions WHERE saison = ? AND id = ?' . ($forUpdate ? ' FOR UPDATE' : ''));
    $st->execute([$saison, $id]);
    $raw = $st->fetchColumn();
    return $raw === false ? null : (string)$raw;
}

/** Lecture en tableau associatif (logique serveur, e-mails). */
function inscription_get(string $saison, string $id, bool $forUpdate = false): ?array
{
    $raw = inscription_raw($saison, $id, $forUpdate);
    if ($raw === null) return null;
    $data = json_decode_assoc($raw);
    return is_array($data) ? $data : [];
}

function inscription_write(string $saison, string $id, stdClass|array $data): void
{
    $data = to_obj($data);
    $st = db()->prepare('INSERT INTO preinscriptions (saison, id, data, date_preinscription) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data), date_preinscription = VALUES(date_preinscription)');
    $st->execute([$saison, $id, json_encode_doc($data), substr(js_str(is_scalar($data->datePreinscription ?? null) ? $data->datePreinscription : ''), 0, 40)]);
}

/** Fusionne $patch dans le dossier (transaction). Retourne [avant, après] en tableaux. */
function inscription_patch(string $saison, string $id, stdClass|array $patch): array
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $beforeObj = decode_obj(inscription_raw($saison, $id, true));
        $before = $beforeObj === null ? null : obj_to_array($beforeObj);
        $afterObj = doc_merge($beforeObj ?? new stdClass(), to_obj($patch));
        inscription_write($saison, $id, $afterObj);
        $pdo->commit();
        return [$before, obj_to_array($afterObj)];
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function is_deleted_inscription(string $saison, string $id): bool
{
    $st = db()->prepare('SELECT 1 FROM deleted_preinscriptions WHERE saison = ? AND id = ?');
    $st->execute([$saison, $id]);
    return (bool)$st->fetchColumn();
}

/** JSON brut (liste) de toutes les préinscriptions d'une saison, plus récentes d'abord. */
function all_inscriptions_json(string $saison): string
{
    $st = db()->prepare("SELECT data FROM preinscriptions WHERE saison = ? ORDER BY (date_preinscription = '') ASC, date_preinscription DESC, created_at DESC");
    $st->execute([$saison]);
    return '[' . implode(',', $st->fetchAll(PDO::FETCH_COLUMN)) . ']';
}

function inscriptions_version(string $saison): string
{
    $st = db()->prepare('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), "") AS u FROM preinscriptions WHERE saison = ?');
    $st->execute([$saison]);
    $a = $st->fetch();
    $st = db()->prepare('SELECT COUNT(*) AS n, COALESCE(MAX(deleted_at), "") AS u FROM deleted_preinscriptions WHERE saison = ?');
    $st->execute([$saison]);
    $b = $st->fetch();
    return md5(implode('|', [$a['n'], $a['u'], $b['n'], $b['u']]));
}

// ── Validation des créations publiques (anciennes règles Firestore) ──

function assert_safe_public_create(array $entry): void
{
    foreach (['id', 'nom', 'prenom', 'saison'] as $key) {
        if (!array_key_exists($key, $entry) || !is_string($entry[$key])) fail('permission-denied', 'Préinscription incomplète.');
    }
    if (strlen($entry['id']) >= 100 || strlen($entry['nom']) >= 100 || strlen($entry['prenom']) >= 100 || strlen($entry['saison']) >= 30) {
        fail('permission-denied', 'Préinscription invalide (champ trop long).');
    }
    if (($entry['statut'] ?? null) !== 'attente') fail('permission-denied', 'Préinscription invalide (statut).');
    if (array_key_exists('datePaiement', $entry) && $entry['datePaiement'] !== null) fail('permission-denied', 'Préinscription invalide.');
    if (array_key_exists('dateValidation', $entry) && $entry['dateValidation'] !== null) fail('permission-denied', 'Préinscription invalide.');
    if (array_key_exists('emailAttestationEnvoye', $entry) && $entry['emailAttestationEnvoye'] !== false) fail('permission-denied', 'Préinscription invalide.');
    foreach (PUBLIC_FORBIDDEN_KEYS as $key) {
        if (array_key_exists($key, $entry)) fail('permission-denied', 'Préinscription invalide.');
    }
}

// ── E-mails automatiques ─────────────────────────────────────────────

function send_confirmation_for_doc(string $saison, string $id, string $source = 'auto-preinscription'): array
{
    $entry = inscription_get($saison, $id);
    if ($entry === null) fail('not-found', 'Dossier introuvable.');
    if (js_truthy($entry['emailConfirmationEnvoyeLe'] ?? null)) {
        return ['ok' => true, 'alreadySent' => true, 'to' => js_or($entry['emailConfirmationDernierDestinataire'] ?? null, get_email_contact($entry))];
    }
    $to = clean(get_email_contact($entry));
    if ($to === '') fail('failed-precondition', 'Aucun email de contact trouve.');
    $tarifs = get_tarifs($saison);
    if (($tarifs['_confirmationEmailEnabled'] ?? null) === false) return ['ok' => true, 'disabled' => true, 'to' => $to];

    inscription_patch($saison, $id, ['emailConfirmationStatus' => 'envoi', 'emailConfirmationErreur' => null, 'emailConfirmationSource' => $source]);
    try {
        $subjectTpl = clean($tarifs['_confirmationEmailSubject'] ?? '') ?: CONFIRMATION_EMAIL_SUBJECT_DEFAUT;
        $bodyTpl = clean($tarifs['_confirmationEmailTemplate'] ?? '') ?: CONFIRMATION_EMAIL_TEMPLATE_DEFAUT;
        $subject = trim(preg_replace('/\s+/', ' ', html_to_text(render_confirmation_template($subjectTpl, $entry, $tarifs))));
        $html = render_confirmation_template($bodyTpl, $entry, $tarifs);
        $messageId = send_one_mail($to, $subject, $html, html_to_text($html));
        inscription_patch($saison, $id, [
            'emailConfirmationEnvoye' => true,
            'emailConfirmationEnvoyeLe' => now_iso(),
            'emailConfirmationDernierDestinataire' => $to,
            'emailConfirmationMessageId' => $messageId,
            'emailConfirmationStatus' => 'envoye',
            'emailConfirmationErreur' => null,
            'emailConfirmationSource' => $source,
        ]);
        return ['ok' => true, 'to' => $to, 'messageId' => $messageId];
    } catch (Throwable $e) {
        inscription_patch($saison, $id, [
            'emailConfirmationStatus' => 'erreur',
            'emailConfirmationErreur' => clean($e->getMessage()),
            'emailConfirmationErreurLe' => now_iso(),
            'emailConfirmationSource' => $source,
        ]);
        throw $e;
    }
}

function send_attestation_for_doc(string $saison, string $id, bool $force = false, string $source = 'manual'): array
{
    $entry = inscription_get($saison, $id);
    if ($entry === null) fail('not-found', 'Dossier introuvable.');
    if (!is_valid_status($entry)) fail('failed-precondition', "Le dossier doit etre valide/paye avant l'envoi.");
    if (js_truthy($entry['emailAttestationEnvoyeLe'] ?? null) && !$force) {
        return ['ok' => true, 'alreadySent' => true, 'to' => js_or($entry['emailAttestationDernierDestinataire'] ?? null, get_email_contact($entry))];
    }
    $members = attestations_for_entry($entry);
    if (!$members) {
        inscription_patch($saison, $id, [
            'emailAttestationStatus' => 'non_requise',
            'emailAttestationErreur' => null,
            'emailAttestationSource' => $source,
            'emailAttestationIgnoreeLe' => now_iso(),
            'emailAttestationNbPiecesJointes' => 0,
        ]);
        return ['ok' => true, 'skipped' => true, 'reason' => 'Attestation non requise pour une licence dirigeant gratuite.'];
    }
    $to = clean(get_email_contact($entry));
    if ($to === '') fail('failed-precondition', 'Aucun email de contact trouve.');

    try {
        inscription_patch($saison, $id, ['emailAttestationStatus' => 'envoi', 'emailAttestationErreur' => null, 'emailAttestationSource' => $source]);
        $attachments = [];
        foreach ($members as $member) {
            $attachments[] = [
                'contentType' => 'application/pdf',
                'filename' => safe_name('Attestation_RSG_' . js_str($member['prenom']) . '_' . js_str($member['nom']) . '_' . js_str($member['categorie']) . '_' . js_str($entry['saison'] ?? '')) . '.pdf',
                'content' => create_attestation_pdf($member),
            ];
        }
        $html = attestation_mail_html($entry, $members);
        $messageId = send_one_mail($to, attestation_subject($entry, $members), $html, html_to_text($html), $attachments);
        inscription_patch($saison, $id, [
            'emailAttestationEnvoye' => true,
            'emailAttestationEnvoyeLe' => now_iso(),
            'emailAttestationDernierDestinataire' => $to,
            'emailAttestationMessageId' => $messageId,
            'emailAttestationNbPiecesJointes' => count($attachments),
            'emailAttestationStatus' => 'envoye',
            'emailAttestationErreur' => null,
            'emailAttestationSource' => $source,
        ]);
        return ['ok' => true, 'to' => $to, 'messageId' => $messageId];
    } catch (Throwable $e) {
        inscription_patch($saison, $id, [
            'emailAttestationStatus' => 'erreur',
            'emailAttestationErreur' => clean($e->getMessage()),
            'emailAttestationErreurLe' => now_iso(),
            'emailAttestationSource' => $source,
        ]);
        throw $e;
    }
}

/** Reproduit les anciens déclencheurs Firestore (création / passage en validé). */
function schedule_triggers(string $saison, string $id, ?array $before, array $after): void
{
    if ($before === null) {
        finish_response_then(function () use ($saison, $id) {
            try {
                send_confirmation_for_doc($saison, $id, 'auto-preinscription');
            } catch (Throwable $e) {
                error_log("[RSG] Confirmation email failed {$id}: " . $e->getMessage());
            }
        });
        return;
    }
    if (is_valid_status($after) && !is_valid_status($before) && !js_truthy($after['emailAttestationEnvoyeLe'] ?? null)) {
        finish_response_then(function () use ($saison, $id) {
            try {
                send_attestation_for_doc($saison, $id, false, 'auto-validation');
            } catch (Throwable $e) {
                error_log("[RSG] Attestation email failed {$id}: " . $e->getMessage());
            }
        });
    }
}

// ── Sécurité : code bureau ───────────────────────────────────────────

function hash_admin_code(string $code): array
{
    $salt = bin2hex(random_bytes(24));
    return [
        'algorithm' => 'pbkdf2',
        'digest' => 'sha256',
        'iterations' => ADMIN_PASSWORD_ITERATIONS,
        'salt' => $salt,
        'hash' => bin2hex(hash_pbkdf2('sha256', clean($code), $salt, ADMIN_PASSWORD_ITERATIONS, 32, true)),
    ];
}

function verify_stored_password(string $code, array $data): bool
{
    if (($data['algorithm'] ?? '') !== 'pbkdf2' || empty($data['salt']) || empty($data['hash'])) return false;
    $digest = in_array($data['digest'] ?? 'sha256', hash_hmac_algos(), true) ? ($data['digest'] ?? 'sha256') : 'sha256';
    $iterations = (int)($data['iterations'] ?? 0) ?: ADMIN_PASSWORD_ITERATIONS;
    $expected = @hex2bin((string)$data['hash']);
    if (!$expected) return false;
    $actual = hash_pbkdf2($digest, clean($code), (string)$data['salt'], $iterations, strlen($expected), true);
    return hash_equals($expected, $actual);
}

function safe_text_equals(string $a, string $b): bool
{
    $a = clean($a); $b = clean($b);
    return $a !== '' && strlen($a) === strlen($b) && hash_equals($a, $b);
}

function verify_admin_code(string $saison, string $code): string
{
    $stored = config_doc_get(ADMIN_ACCESS_DOC) ?? [];
    if (!empty($stored['hash'])) {
        if (verify_stored_password($code, $stored)) return 'app-password';
        fail('permission-denied', 'Code bureau invalide.');
    }
    $tarifs = get_tarifs($saison);
    $codes = array_values(array_filter(array_map('clean', array_merge([config('admin_access_code')], list_of($tarifs['_accessCodes'] ?? null)))));
    $codes = array_filter($codes, fn($c) => $c !== 'CODE_BUREAU_INITIAL');
    if (!$codes) fail('failed-precondition', "Aucun code bureau n'est configure pour cette saison.");
    foreach ($codes as $allowed) if (safe_text_equals($allowed, $code)) return 'config';
    fail('permission-denied', 'Code bureau invalide.');
}

function client_ip_key(): string
{
    return substr(safe_name(clean($_SERVER['REMOTE_ADDR'] ?? 'unknown')), 0, 90);
}

function check_login_rate_limit(): array
{
    $key = client_ip_key();
    $st = db()->prepare('SELECT * FROM login_attempts WHERE ip_key = ?');
    $st->execute([$key]);
    $row = $st->fetch() ?: [];
    $now = now_ms();
    if (!empty($row['blocked_until']) && (int)$row['blocked_until'] > $now) {
        fail('resource-exhausted', "Trop d'essais. Réessayez dans quelques minutes.");
    }
    return ['key' => $key, 'row' => $row, 'now' => $now];
}

function record_login_attempt(array $attempt, bool $ok): void
{
    $now = $attempt['now'];
    $row = $attempt['row'];
    if ($ok) {
        $st = db()->prepare('INSERT INTO login_attempts (ip_key, failures, blocked_until, last_success_at) VALUES (?, 0, NULL, ?)
            ON DUPLICATE KEY UPDATE failures = 0, blocked_until = NULL, last_success_at = VALUES(last_success_at)');
        $st->execute([$attempt['key'], $now]);
        return;
    }
    $recent = !empty($row['first_failure_at']) && $now - (int)$row['first_failure_at'] < 10 * 60 * 1000;
    $failures = ($recent ? (int)($row['failures'] ?? 0) : 0) + 1;
    $blocked = $failures >= 5 ? $now + 15 * 60 * 1000 : null;
    $first = $recent ? (int)$row['first_failure_at'] : $now;
    $st = db()->prepare('INSERT INTO login_attempts (ip_key, failures, first_failure_at, blocked_until, last_failure_at) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE failures = VALUES(failures), first_failure_at = VALUES(first_failure_at), blocked_until = VALUES(blocked_until), last_failure_at = VALUES(last_failure_at)');
    $st->execute([$attempt['key'], $failures, $first, $blocked, $now]);
}

// ═══════════════════════════════════════════════════════════════════
// Table des actions
// ═══════════════════════════════════════════════════════════════════

final class RawJson
{
    public function __construct(public string $json) {}
}

function api_actions(): array
{
    return [
        // ── Public ──
        'getPublicConfig' => function (array $in, stdClass $obj): array {
            $global = config_doc_get('global') ?? [];
            $saison = clean($in['saison'] ?? '') ?: clean($global['publicSaison'] ?? '') ?: clean(config('default_saison')) ?: '2026-2027';
            $saison = assert_saison($saison);
            $doc = config_doc_obj(tarifs_path($saison));
            $tarifs = ($doc->tarifs ?? null) instanceof stdClass ? $doc->tarifs : new stdClass();
            unset($tarifs->_accessCodes, $tarifs->_attestationTemplate, $tarifs->_boutique);
            return ['publicSaison' => $saison, 'tarifs' => $tarifs];
        },

        'getGlobalConfig' => function (array $in, stdClass $obj): mixed {
            return config_doc_obj('global');
        },

        'lookupLicence' => function (array $in, stdClass $obj): array {
            $saison = clean($in['saison'] ?? '');
            $numero = preg_replace('/\D/', '', clean(js_or($in['numLicenceFFF'] ?? null, $in['numPersonne'] ?? null, $in['numero'] ?? null, '')));
            if ($saison === '' || strlen($numero) < 4) fail('invalid-argument', 'Saison et numero de licence/personne requis.');
            $saison = assert_saison($saison);
            $doc = config_doc_get(licencies_path($saison)) ?? [];
            $match = null;
            foreach (list_of($doc['licencies'] ?? null) as $l) {
                if (!is_array($l)) continue;
                foreach (['l', 'numLicence', 'numLicenceFFF', 'np', 'numPersonne', 'numeroPersonne', 'personne'] as $k) {
                    $v = preg_replace('/\D/', '', clean(js_str($l[$k] ?? '')));
                    if ($v !== '' && $v === $numero) { $match = $l; break 2; }
                }
            }
            return ['found' => $match !== null, 'licencie' => public_licencie($match)];
        },

        'saveInscription' => function (array $in, stdClass $obj): array {
            $saison = assert_saison($in['saison'] ?? '');
            $entry = $in['entry'] ?? null;
            $entryObj = $obj->entry ?? null;
            if (!is_assoc($entry) || !($entryObj instanceof stdClass) || clean($entry['id'] ?? '') === '') fail('invalid-argument', 'Dossier invalide.');
            $id = clean($entry['id']);
            if (strlen($id) >= 100) fail('invalid-argument', 'Identifiant dossier invalide.');

            if (is_admin_request()) {
                if (is_deleted_inscription($saison, $id)) {
                    fail('failed-precondition', "Ce dossier a ete supprime. Rechargez l'administration pour eviter de restaurer une ancienne copie locale.");
                }
                $entryObj->id = $id;
                $entryObj->saison = clean($entry['saison'] ?? '') ?: $saison;
                $entryObj->_updatedAt = now_iso();
                [$before, $after] = inscription_patch($saison, $id, $entryObj);
                schedule_triggers($saison, $id, $before, $after);
                return ['ok' => true, 'id' => $id];
            }

            // Création publique : uniquement un nouveau dossier, avec les mêmes garde-fous qu'avant.
            assert_safe_public_create($entry);
            if (is_deleted_inscription($saison, $id)) fail('permission-denied', 'Dossier refusé.');
            $pdo = db();
            $pdo->beginTransaction();
            try {
                if (inscription_get($saison, $id, true) !== null) {
                    $pdo->rollBack();
                    fail('permission-denied', 'Ce dossier existe déjà.');
                }
                $entryObj->_updatedAt = now_iso();
                inscription_write($saison, $id, $entryObj);
                $data = obj_to_array($entryObj);
                $pdo->commit();
            } catch (ApiError $e) {
                throw $e;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            schedule_triggers($saison, $id, null, $data);
            return ['ok' => true, 'id' => $id];
        },

        'adminLogin' => function (array $in, stdClass $obj): array {
            $saison = clean($in['saison'] ?? '') ?: (clean(config('default_saison')) ?: '2026-2027');
            $code = clean($in['code'] ?? '');
            $attempt = null;
            try {
                $attempt = check_login_rate_limit();
                verify_admin_code(assert_saison($saison), $code);
                record_login_attempt($attempt, true);
                return ['ok' => true, 'token' => create_admin_token()];
            } catch (ApiError $e) {
                if (in_array($e->apiCode, ['resource-exhausted', 'internal'], true)) throw $e;
                if ($attempt) {
                    try { record_login_attempt($attempt, false); } catch (Throwable $re) { error_log('[RSG] rate-limit write failed: ' . $re->getMessage()); }
                }
                fail('permission-denied', 'Code bureau invalide.');
            }
        },

        // ── Bureau (session requise) ──
        'session' => function (array $in, stdClass $obj): array {
            $t = assert_admin();
            return ['ok' => true, 'admin' => true, 'exp' => $t['exp']];
        },

        'changeAdminPassword' => function (array $in, stdClass $obj): array {
            assert_admin();
            $saison = assert_saison(clean($in['saison'] ?? '') ?: (clean(config('default_saison')) ?: '2026-2027'));
            $current = clean($in['currentCode'] ?? '');
            $new = clean($in['newCode'] ?? '');
            if ($current === '' || $new === '') fail('invalid-argument', 'Code actuel et nouveau code requis.');
            if (mb_strlen($new) < ADMIN_PASSWORD_MIN_LENGTH) fail('invalid-argument', 'Le nouveau code doit contenir au moins ' . ADMIN_PASSWORD_MIN_LENGTH . ' caracteres.');
            if (safe_text_equals($current, $new)) fail('invalid-argument', "Le nouveau code doit etre different de l'ancien.");
            verify_admin_code($saison, $current);
            $updatedAt = now_iso();
            config_doc_set(ADMIN_ACCESS_DOC, array_merge(hash_admin_code($new), ['updatedAt' => $updatedAt, 'updatedBy' => 'rsg-admin']), true);
            return ['ok' => true, 'updatedAt' => $updatedAt];
        },

        'getAllInscriptions' => function (array $in, stdClass $obj): RawJson {
            assert_admin();
            $saison = assert_saison($in['saison'] ?? '');
            return new RawJson('{"version":' . json_encode(inscriptions_version($saison)) . ',"items":' . all_inscriptions_json($saison) . '}');
        },

        'inscriptionsVersion' => function (array $in, stdClass $obj): array {
            assert_admin();
            return ['version' => inscriptions_version(assert_saison($in['saison'] ?? ''))];
        },

        'adminDeleteInscription' => function (array $in, stdClass $obj): array {
            assert_admin();
            $saison = assert_saison($in['saison'] ?? '');
            $id = clean($in['id'] ?? '');
            if ($id === '') fail('invalid-argument', 'Identifiant dossier requis.');
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $snap = inscription_get($saison, $id, true) ?? [];
                $pdo->prepare('DELETE FROM preinscriptions WHERE saison = ? AND id = ?')->execute([$saison, $id]);
                $meta = [
                    'id' => $id, 'saison' => $saison, 'deletedAt' => now_iso(), 'deletedBy' => 'rsg-admin',
                    'reference' => clean($snap['id'] ?? '') ?: $id, 'nom' => clean($snap['nom'] ?? ''), 'prenom' => clean($snap['prenom'] ?? ''),
                ];
                $pdo->prepare('INSERT INTO deleted_preinscriptions (saison, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), deleted_at = CURRENT_TIMESTAMP(3)')
                    ->execute([$saison, $id, json_encode_doc($meta)]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            return ['ok' => true, 'id' => $id];
        },

        'getTarifs' => function (array $in, stdClass $obj): mixed {
            assert_admin();
            $doc = config_doc_obj(tarifs_path(assert_saison($in['saison'] ?? '')));
            if ($doc === null) return null;
            $tarifs = ($doc->tarifs ?? null) instanceof stdClass ? $doc->tarifs : new stdClass();
            unset($tarifs->_accessCodes);
            return $tarifs;
        },

        'adminSaveTarifs' => function (array $in, stdClass $obj): array {
            assert_admin();
            $saison = assert_saison($in['saison'] ?? '');
            $tarifs = ($obj->tarifs ?? null) instanceof stdClass ? $obj->tarifs : new stdClass();
            config_doc_set(tarifs_path($saison), (object)['tarifs' => $tarifs, '_updatedAt' => now_iso()]);
            return ['ok' => true];
        },

        'getLicencies' => function (array $in, stdClass $obj): array {
            assert_admin();
            $doc = config_doc_obj(licencies_path(assert_saison($in['saison'] ?? '')));
            return ['licencies' => is_array($doc->licencies ?? null) ? $doc->licencies : []];
        },

        'adminSaveLicencies' => function (array $in, stdClass $obj): array {
            assert_admin();
            $saison = assert_saison($in['saison'] ?? '');
            $licencies = $in['licencies'] ?? null;
            if (!is_array($licencies) || !array_is_list($licencies)) fail('invalid-argument', 'Base Footclubs invalide.');
            config_doc_set(licencies_path($saison), (object)['licencies' => $obj->licencies, '_updatedAt' => now_iso()]);
            return ['ok' => true, 'count' => count($licencies)];
        },

        'adminSaveGlobalConfig' => function (array $in, stdClass $obj): array {
            assert_admin();
            $config = ($obj->config ?? null) instanceof stdClass ? $obj->config : new stdClass();
            $config->_updatedAt = now_iso();
            config_doc_set('global', $config, true);
            return ['ok' => true];
        },

        'sendAttestationEmail' => function (array $in, stdClass $obj): array {
            assert_admin();
            $saison = clean($in['saison'] ?? '');
            $id = clean($in['id'] ?? '');
            if ($saison === '' || $id === '') fail('invalid-argument', 'Saison et id dossier requis.');
            try {
                return send_attestation_for_doc(assert_saison($saison), $id, !empty($in['force']), 'manual');
            } catch (ApiError $e) {
                throw $e;
            } catch (Throwable $e) {
                $msg = clean($e->getMessage()) ?: "Erreur inconnue pendant l'envoi.";
                error_log("[RSG] Manual attestation email failed {$id}: {$msg}");
                fail('internal', $msg);
            }
        },

        'sendBulkEmail' => function (array $in, stdClass $obj): array {
            assert_admin();
            @set_time_limit(0);
            ignore_user_abort(true);
            $saison = clean($in['saison'] ?? '') ?: '2026-2027';
            $subjectTpl = clean($in['subject'] ?? '');
            $htmlTpl = safe_email_html($in['html'] ?? '');
            $meta = is_array($in['meta'] ?? null) ? $in['meta'] : [];
            $allowDup = ($in['allowDuplicateEmails'] ?? false) === true;
            $recipientsRaw = list_of($in['recipients'] ?? null);
            $attachmentsRaw = list_of($in['attachments'] ?? null);

            if ($subjectTpl === '') fail('invalid-argument', 'Objet du mail requis.');
            if (trim(html_to_text($htmlTpl)) === '') fail('invalid-argument', 'Corps du message requis.');
            if (!$recipientsRaw) fail('invalid-argument', 'Aucun destinataire.');
            if (count($attachmentsRaw) > BULK_ATTACHMENT_MAX_FILES) fail('invalid-argument', 'Maximum ' . BULK_ATTACHMENT_MAX_FILES . ' pieces jointes.');

            $attachments = [];
            $total = 0;
            foreach ($attachmentsRaw as $file) {
                if (!is_array($file)) continue;
                $base64 = preg_replace('/\s/', '', clean(js_or($file['Base64Content'] ?? null, $file['base64'] ?? null, $file['content'] ?? null, '')));
                if ($base64 === '') continue;
                $content = base64_decode($base64, true);
                if ($content === false) fail('invalid-argument', 'Piece jointe illisible.');
                $size = strlen($content);
                if ($size > BULK_ATTACHMENT_MAX_FILE_BYTES) fail('invalid-argument', 'Une piece jointe depasse la taille autorisee.');
                $total += $size;
                $filename = substr(preg_replace('/[\\\\\/:*?"<>|]/', '_', clean(js_or($file['Filename'] ?? null, $file['filename'] ?? null, $file['name'] ?? null, ''))), 0, 160) ?: 'piece-jointe';
                $type = substr(str_replace(["\r", "\n"], '', clean(js_or($file['ContentType'] ?? null, $file['contentType'] ?? null, $file['type'] ?? null, ''))), 0, 120) ?: 'application/octet-stream';
                $attachments[] = ['filename' => $filename, 'contentType' => $type, 'content' => $content, 'size' => $size];
            }
            if ($total > BULK_ATTACHMENT_MAX_TOTAL_BYTES) fail('invalid-argument', 'Le total des pieces jointes est trop volumineux.');

            $byRecipient = [];
            foreach ($recipientsRaw as $index => $r) {
                if (!is_array($r)) continue;
                $rec = [
                    'key' => clean($r['key'] ?? ''), 'email' => strtolower(clean($r['email'] ?? '')),
                    'nom' => clean($r['nom'] ?? ''), 'prenom' => clean($r['prenom'] ?? ''), 'categorie' => clean($r['categorie'] ?? ''),
                    'type' => clean($r['type'] ?? ''), 'reference' => clean($r['reference'] ?? ''), 'source' => clean($r['source'] ?? ''),
                ];
                if ($rec['email'] === '' || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $rec['email'])) continue;
                $key = $allowDup ? ($rec['key'] ?: "{$rec['email']}-{$index}") : $rec['email'];
                if (!isset($byRecipient[$key])) $byRecipient[$key] = $rec;
            }
            $recipients = array_values($byRecipient);
            if (!$recipients) fail('invalid-argument', 'Aucune adresse email valide.');
            if (count($recipients) > 350) fail('invalid-argument', 'Envoi limite a 350 destinataires par lot.');

            try {
                $mailer = create_mailer();
            } catch (Throwable $e) {
                fail('internal', $e->getMessage());
            }
            $sent = [];
            $failed = [];
            foreach ($recipients as $rec) {
                $subject = trim(preg_replace('/\s+/', ' ', html_to_text(render_bulk_template($subjectTpl, $rec, $saison))));
                $html = render_bulk_template($htmlTpl, $rec, $saison);
                try {
                    $mid = send_mail($mailer, $rec['email'], $subject, $html, html_to_text($html), $attachments);
                    $sent[] = ['email' => $rec['email'], 'messageId' => $mid];
                } catch (Throwable $e) {
                    $failed[] = ['email' => $rec['email'], 'error' => clean($e->getMessage())];
                    error_log("[RSG] Bulk email failed {$rec['email']}: " . $e->getMessage());
                    // Reconnexion propre au serveur SMTP pour les destinataires suivants
                    try { $mailer->smtpClose(); } catch (Throwable) {}
                }
            }
            try { $mailer->smtpClose(); } catch (Throwable) {}

            $log = [
                'createdAt' => now_iso(), 'createdBy' => 'rsg-admin', 'subject' => $subjectTpl,
                'source' => clean($meta['source'] ?? ''), 'filters' => (object)(is_array($meta['filters'] ?? null) ? $meta['filters'] : []),
                'allowDuplicateEmails' => $allowDup,
                'attachments' => array_map(fn($f) => ['filename' => $f['filename'], 'contentType' => $f['contentType'], 'size' => $f['size']], $attachments),
                'requestedCount' => count($recipientsRaw), 'recipientCount' => count($recipients),
                'sentCount' => count($sent), 'failedCount' => count($failed), 'failed' => $failed,
            ];
            db()->prepare('INSERT INTO mailings (saison, data) VALUES (?, ?)')->execute([substr($saison, 0, 30), json_encode_doc($log)]);

            return [
                'ok' => count($failed) === 0, 'requestedCount' => count($recipientsRaw), 'recipientCount' => count($recipients),
                'sentCount' => count($sent), 'failedCount' => count($failed), 'attachmentCount' => count($attachments), 'failed' => $failed,
            ];
        },

        // ── Migration depuis Firebase (une seule fois) ──
        'adminImport' => function (array $in, stdClass $obj): array {
            assert_admin();
            if (config('migration_enabled') !== true) fail('permission-denied', 'Import désactivé (migration_enabled = false dans config.php).');
            $kind = clean($in['kind'] ?? '');
            $count = 0;
            switch ($kind) {
                case 'preinscriptions':
                    $saison = assert_saison($in['saison'] ?? '');
                    foreach ((is_array($obj->items ?? null) ? $obj->items : []) as $item) {
                        if (!($item instanceof stdClass)) continue;
                        $id = clean(is_scalar($item->_docId ?? null) ? $item->_docId : '') ?: clean(is_scalar($item->id ?? null) ? $item->id : '');
                        if ($id === '') continue;
                        unset($item->_docId);
                        inscription_write($saison, $id, $item);
                        $count++;
                    }
                    break;
                case 'deleted':
                    $saison = assert_saison($in['saison'] ?? '');
                    $st = db()->prepare('INSERT INTO deleted_preinscriptions (saison, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)');
                    foreach ((is_array($obj->items ?? null) ? $obj->items : []) as $item) {
                        if (!($item instanceof stdClass)) continue;
                        $id = clean(is_scalar($item->_docId ?? null) ? $item->_docId : '') ?: clean(is_scalar($item->id ?? null) ? $item->id : '');
                        if ($id === '') continue;
                        unset($item->_docId);
                        $st->execute([$saison, $id, json_encode_doc($item)]);
                        $count++;
                    }
                    break;
                case 'tarifs':
                    $saison = assert_saison($in['saison'] ?? '');
                    $tarifs = ($obj->data ?? null) instanceof stdClass ? $obj->data : new stdClass();
                    config_doc_set(tarifs_path($saison), (object)['tarifs' => $tarifs, '_updatedAt' => now_iso()]);
                    $count = 1;
                    break;
                case 'licencies':
                    $saison = assert_saison($in['saison'] ?? '');
                    $list = is_array($obj->items ?? null) ? $obj->items : [];
                    config_doc_set(licencies_path($saison), (object)['licencies' => $list, '_updatedAt' => now_iso()]);
                    $count = count($list);
                    break;
                case 'global':
                    $data = ($obj->data ?? null) instanceof stdClass ? $obj->data : new stdClass();
                    config_doc_set('global', $data, true);
                    $count = 1;
                    break;
                default:
                    fail('invalid-argument', "Type d'import inconnu.");
            }
            return ['ok' => true, 'count' => $count];
        },
    ];
}
