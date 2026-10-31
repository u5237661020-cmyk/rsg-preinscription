<?php
// ═══════════════════════════════════════════════════════════════════
// Règles métier : contacts, pièces, modèles d'e-mails, attestations
// (portage fidèle de l'ancienne logique Firebase Cloud Functions)
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

const PIECES_DEFAUT = [
    ['id' => 'certifMedical', 'label' => 'Certificat medical complete par le medecin', 'condition' => 'certif'],
    ['id' => 'photoId', 'label' => "Piece d'identite (CNI ou passeport)", 'condition' => 'always'],
    ['id' => 'justifDom', 'label' => 'Justificatif de domicile (- 3 mois)', 'condition' => 'always'],
    ['id' => 'rib', 'label' => 'RIB', 'condition' => 'always'],
    ['id' => 'livretFamille', 'label' => 'Livret de famille (obligatoire pour tarif famille)', 'condition' => 'famille'],
    ['id' => 'acteNaissance', 'label' => "Extrait d'acte de naissance", 'condition' => 'etranger'],
    ['id' => 'residenceParents', 'label' => 'Justificatif de residence des parents', 'condition' => 'etranger'],
    ['id' => 'nationaliteParents', 'label' => 'Justificatif de nationalite des parents', 'condition' => 'etranger'],
];
const PERMANENCES_DEFAUT = [['date' => '', 'debut' => '', 'fin' => '', 'lieu' => 'Stade du RSG', 'message' => '']];
const CONFIRMATION_EMAIL_SUBJECT_DEFAUT = 'Votre preinscription RSG est bien recue - Saison {saison}';
const CONFIRMATION_EMAIL_TEMPLATE_DEFAUT = <<<'HTML'
<p>Bonjour <strong>{prenom}</strong>,</p>

<p>Merci pour votre preinscription au <strong>Reveil Saint-Gereon</strong> pour la saison <strong>{saison}</strong>.</p>

<p>Nous avons bien recu le dossier de <strong>{prenom} {nom}</strong>.</p>

<p>
  <strong>Reference dossier :</strong> {reference}<br>
  <strong>Categorie :</strong> {categorie}<br>
  <strong>Montant licence :</strong> {montant} EUR<br>
  <strong>Paiement :</strong> {modePaiement}
</p>

<p><strong>Important :</strong> cette preinscription ne valide pas encore definitivement l'inscription.</p>

<p>La validation finale sera faite par le club lors d'une permanence licence, apres verification du dossier et reception du paiement. Elle reste egalement sous reserve des places disponibles, notamment pour les nouveaux joueurs.</p>

<p>Pour preparer votre passage en permanence, merci d'apporter si necessaire :</p>
{documents}

<p><strong>Permanences licence :</strong></p>
{permanences}

<p>A tres bientot au club,</p>

<p>Sportivement,<br><strong>Le Reveil Saint-Gereon</strong></p>
HTML;

// ── Petits utilitaires reproduisant la sémantique JavaScript ──────────

/** Vérité au sens JavaScript (les tableaux/objets sont toujours vrais). */
function js_truthy(mixed $v): bool
{
    if (is_array($v)) return true;
    if (is_string($v)) return $v !== '';
    if (is_float($v) && is_nan($v)) return false;
    return (bool)$v;
}

/** Équivalent de a || b || c en JavaScript. */
function js_or(mixed ...$values): mixed
{
    foreach ($values as $v) if (js_truthy($v)) return $v;
    return end($values);
}

/** Conversion en texte comme String(x) en JavaScript. */
function js_str(mixed $v): string
{
    if ($v === null) return '';
    if (is_bool($v)) return $v ? 'true' : 'false';
    if (is_float($v)) {
        if (floor($v) == $v && abs($v) < 1e15) return (string)(int)$v;
        return rtrim(rtrim(sprintf('%.10F', $v), '0'), '.');
    }
    if (is_array($v)) return '';
    return (string)$v;
}

function list_of(mixed $v): array
{
    return is_array($v) && array_is_list($v) ? $v : [];
}

function escape_html(mixed $value): string
{
    return str_replace(['&', '<', '>', '"'], ['&amp;', '&lt;', '&gt;', '&quot;'], trim(js_str($value)));
}

function format_date(mixed $value): string
{
    $txt = trim(js_str($value));
    if ($txt === '') return '';
    try {
        $tz = new DateTimeZone('Europe/Paris');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $txt)) {
            $d = DateTimeImmutable::createFromFormat('!Y-m-d', $txt, $tz);
        } else {
            $d = (new DateTimeImmutable($txt))->setTimezone($tz);
        }
        return $d ? $d->format('d/m/Y') : $txt;
    } catch (Throwable) {
        return $txt;
    }
}

function strip_accents(string $value): string
{
    if (class_exists('Normalizer')) {
        $n = Normalizer::normalize($value, Normalizer::FORM_D);
        if ($n !== false) return preg_replace('/\p{Mn}+/u', '', $n) ?? $value;
    }
    $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    return $t !== false ? $t : $value;
}

function safe_name(mixed $value): string
{
    $s = strip_accents(clean($value));
    $s = preg_replace('/[^a-z0-9_-]+/i', '_', $s) ?? '';
    $s = trim($s, '_');
    return $s !== '' ? $s : 'attestation';
}

function html_to_text(mixed $html): string
{
    $s = js_str($html);
    $s = preg_replace('/<br\s*\/?>/i', "\n", $s);
    $s = preg_replace('/<\/p>/i', "\n\n", $s);
    $s = preg_replace('/<li>/i', '- ', $s);
    $s = preg_replace('/<\/li>/i', "\n", $s);
    $s = preg_replace('/<[^>]+>/', '', $s);
    $s = str_replace(['&nbsp;', '&amp;', '&lt;', '&gt;', '&quot;'], [' ', '&', '<', '>', '"'], $s);
    return trim($s);
}

// ── Contacts ─────────────────────────────────────────────────────────

function is_valid_status(?array $entry): bool
{
    return in_array($entry['statut'] ?? null, ['valide', 'paye'], true);
}

function get_resp1(array $entry): ?array
{
    $reps = list_of($entry['representants'] ?? null);
    if ($reps) return is_array($reps[0]) ? $reps[0] : null;
    if (js_truthy($entry['resp1Nom'] ?? null)) {
        return [
            'nom' => $entry['resp1Nom'] ?? null,
            'prenom' => $entry['resp1Prenom'] ?? null,
            'lien' => $entry['resp1Lien'] ?? null,
            'tel' => $entry['resp1Tel'] ?? null,
            'email' => $entry['resp1Email'] ?? null,
        ];
    }
    return null;
}

function get_email_contact(array $entry): string
{
    if (js_truthy($entry['isMajeur'] ?? null) && js_truthy($entry['email'] ?? null)) return js_str($entry['email']);
    $r = get_resp1($entry);
    return js_str(js_or($r['email'] ?? null, $entry['email'] ?? null, ''));
}

// ── Configuration publique ───────────────────────────────────────────

function remove_private_config(array $tarifs): array
{
    unset($tarifs['_accessCodes'], $tarifs['_attestationTemplate'], $tarifs['_boutique']);
    return $tarifs;
}

function public_licencie(?array $l): ?array
{
    if (!$l) return null;
    $g = fn(string ...$keys) => js_or(...array_merge(array_map(fn($k) => $l[$k] ?? null, $keys), ['']));
    return [
        'n' => $g('n', 'nom'),
        'p' => $g('p', 'prenom'),
        'l' => $g('l', 'numLicence', 'numLicenceFFF'),
        'np' => $g('np', 'numPersonne', 'numeroPersonne', 'personne'),
        'dn' => $g('dn', 'dateNaissance'),
        's' => $g('s', 'sexe'),
        'c' => $g('c', 'categorie'),
        'sc' => $g('sc', 'sousCategorie'),
        'tl' => $g('tl', 'typeLicence'),
        'cm' => $l['cm'] ?? null,
        'a' => $g('a', 'anneeLastCertif'),
        'em' => $g('em', 'email'),
        'tel' => $g('tel', 'telephone'),
        'em2' => $g('em2', 'emailRl'),
        'tel2' => $g('tel2', 'telRl'),
        'rl' => $g('rl', 'representant'),
        'ln' => $g('ln', 'lieuNaissance'),
        'nat' => $g('nat', 'nationalite'),
        'adr' => $g('adr', 'adresse'),
        'cp' => $g('cp', 'codePostal'),
        'ville' => $g('ville'),
    ];
}

// ── Pièces et permanences ────────────────────────────────────────────

function get_pieces(array $tarifs): array
{
    $p = list_of($tarifs['_pieces'] ?? null);
    return $p ?: PIECES_DEFAUT;
}

function normalize_nationalite(mixed $v): string
{
    return preg_replace('/[^a-z]/', '', strtolower(strip_accents(clean($v)))) ?? '';
}

function is_nationalite_francaise(mixed $v): bool
{
    $n = normalize_nationalite($v);
    return $n === '' || in_array($n, ['f', 'fr', 'fra', 'france', 'francais', 'francaise'], true);
}

function is_nationalite_etrangere(array $entry): bool
{
    $values = [$entry['nationalite'] ?? null];
    foreach (list_of($entry['freresSoeurs'] ?? null) as $m) $values[] = is_array($m) ? ($m['nationalite'] ?? null) : null;
    foreach (list_of($entry['adultesFamille'] ?? null) as $m) $values[] = is_array($m) ? ($m['nationalite'] ?? null) : null;
    $values = array_filter($values, fn($v) => clean($v) !== '');
    foreach ($values as $v) if (!is_nationalite_francaise($v)) return true;
    return false;
}

function has_family_members(array $entry): bool
{
    return count(list_of($entry['freresSoeurs'] ?? null)) > 0 || count(list_of($entry['adultesFamille'] ?? null)) > 0;
}

function piece_deja_fournie(array $piece, array $entry): bool
{
    $id = $piece['id'] ?? null;
    if (!$id) return false;
    if (($entry['piecesFournies'][$id] ?? null) === true) return true;
    if (($entry[$id] ?? null) === true) return true;
    return false;
}

function piece_visible(array $piece, array $entry): bool
{
    return match ($piece['condition'] ?? null) {
        'certif' => js_truthy($entry['certifNeeded'] ?? null),
        'famille' => has_family_members($entry),
        'etranger' => is_nationalite_etrangere($entry),
        default => true,
    };
}

function docs_html(array $entry, array $tarifs): string
{
    $docs = [];
    foreach (get_pieces($tarifs) as $piece) {
        if (!is_array($piece)) continue;
        if (piece_visible($piece, $entry) && !piece_deja_fournie($piece, $entry)) {
            $label = clean($piece['label'] ?? '');
            if ($label !== '') $docs[] = $label;
        }
    }
    if (!$docs) return '<p>Aucune piece complementaire indiquee.</p>';
    return '<ul>' . implode('', array_map(fn($d) => '<li>' . escape_html($d) . '</li>', $docs)) . '</ul>';
}

function get_permanences(array $tarifs): array
{
    $rows = list_of($tarifs['_permanences'] ?? null);
    return $rows ?: PERMANENCES_DEFAUT;
}

function fmt_permanence(array $p): string
{
    $date = js_truthy($p['date'] ?? null) ? format_date($p['date']) : 'Date a preciser';
    $debut = js_str($p['debut'] ?? '');
    $fin = js_str($p['fin'] ?? '');
    $horaires = ($debut !== '' || $fin !== '') ? ' de ' . ($debut ?: '?') . ' a ' . ($fin ?: '?') : '';
    $lieu = js_str($p['lieu'] ?? '');
    return $date . $horaires . ($lieu !== '' ? ' - ' . $lieu : '');
}

function permanences_html(array $tarifs): string
{
    $items = [];
    foreach (get_permanences($tarifs) as $p) {
        if (!is_array($p)) continue;
        $msg = clean(js_or($p['message'] ?? null, $p['info'] ?? null, $p['commentaire'] ?? null));
        $items[] = '<li>' . escape_html(fmt_permanence($p))
            . ($msg !== '' ? '<br><span style="color:#92400e;font-weight:700;white-space:pre-line">' . escape_html($msg) . '</span>' : '')
            . '</li>';
    }
    return $items ? '<ul>' . implode('', $items) . '</ul>' : '<p>Dates communiquees prochainement.</p>';
}

function payment_ids(array $entry): array
{
    $ids = list_of($entry['modePaiements'] ?? null);
    if ($ids) return $ids;
    return js_truthy($entry['modePaiement'] ?? null) ? [$entry['modePaiement']] : [];
}

function mode_paiement_label(array $entry, array $tarifs): string
{
    $modes = list_of($tarifs['_modesPaiement'] ?? null);
    $labels = [];
    foreach (payment_ids($entry) as $id) {
        $label = $id;
        foreach ($modes as $mode) {
            if (is_array($mode) && ($mode['id'] ?? null) === $id) {
                $label = js_or($mode['l'] ?? null, $id);
                break;
            }
        }
        if (js_truthy($label)) $labels[] = js_str($label);
    }
    return implode(' + ', $labels) ?: 'A choisir en permanence';
}

function payment_label(array $entry): string
{
    $ids = payment_ids($entry);
    return $ids ? implode(' + ', array_map('js_str', $ids)) : 'Paiement regle en permanence';
}

function render_confirmation_template(mixed $tpl, array $entry, array $tarifs): string
{
    $replacements = [
        '{prenom}' => escape_html($entry['prenom'] ?? ''),
        '{nom}' => escape_html($entry['nom'] ?? ''),
        '{dateNaissance}' => escape_html(format_date($entry['dateNaissance'] ?? '')),
        '{saison}' => escape_html($entry['saison'] ?? ''),
        '{categorie}' => escape_html($entry['categorie'] ?? ''),
        '{reference}' => escape_html($entry['id'] ?? ''),
        '{montant}' => escape_html(js_or($entry['prixFinal'] ?? null, $entry['tarifBase'] ?? null, 0)),
        '{modePaiement}' => escape_html(mode_paiement_label($entry, $tarifs)),
        '{documents}' => docs_html($entry, $tarifs),
        '{permanences}' => permanences_html($tarifs),
    ];
    $html = js_str($tpl);
    foreach ($replacements as $k => $v) $html = str_replace($k, $v, $html);
    return $html;
}

// ── Attestations ─────────────────────────────────────────────────────

function is_dirigeant_category(mixed $cat): bool
{
    return in_array(clean($cat), ['Dirigeant', 'Dirigeants'], true);
}

function attestations_for_entry(array $entry): array
{
    $detail = list_of($entry['detailPrix'] ?? null);
    $mk = function (array $member, int $idx, string $role) use ($entry, $detail): array {
        $detailPrix = is_array($detail[$idx] ?? null) ? ($detail[$idx]['prix'] ?? null) : null;
        $prixFinal = $detailPrix ?? $member['prix'] ?? ($idx === 0 ? ($entry['prixFinal'] ?? null) : ($entry['tarifBase'] ?? null)) ?? 0;
        $tarifBase = $detailPrix ?? $member['prix'] ?? $entry['tarifBase'] ?? 0;
        return array_merge($entry, $member, [
            'id' => $entry['id'] ?? '',
            'dossierId' => $entry['id'] ?? '',
            'role' => $role,
            'idx' => $idx,
            'nom' => js_or($member['nom'] ?? null, $entry['nom'] ?? null, ''),
            'prenom' => js_or($member['prenom'] ?? null, $entry['prenom'] ?? null, ''),
            'categorie' => clean(js_or($member['categorie'] ?? null, $entry['categorie'] ?? null, '')),
            'dateNaissance' => js_or($member['dateNaissance'] ?? null, $entry['dateNaissance'] ?? null, ''),
            'prixFinal' => $prixFinal,
            'tarifBase' => $tarifBase,
        ]);
    };
    $freres = array_values(array_filter(list_of($entry['freresSoeurs'] ?? null), 'is_array'));
    $adultes = array_values(array_filter(list_of($entry['adultesFamille'] ?? null), 'is_array'));
    $members = [$mk($entry, 0, 'Joueur principal')];
    foreach ($freres as $i => $m) $members[] = $mk($m, $i + 1, 'Famille');
    foreach ($adultes as $i => $m) $members[] = $mk($m, 1 + count($freres) + $i, 'Famille adulte');
    if (js_truthy($entry['doubleLicenceDirigeant'] ?? null)) {
        $members[] = $mk(array_merge($entry, ['categorie' => 'Dirigeant']), count($members), 'Double licence dirigeant');
    }
    return array_values(array_filter($members, fn($m) => !is_dirigeant_category($m['categorie'] ?? '')));
}

function attestation_subject(array $entry, array $members): string
{
    $names = array_values(array_filter(array_map(fn($m) => trim(clean($m['prenom'] ?? '') . ' ' . clean($m['nom'] ?? '')), $members)));
    if (count($names) <= 1) {
        return trim('Attestation de licence RSG - ' . ($names[0] ?? (js_str($entry['prenom'] ?? '') . ' ' . js_str($entry['nom'] ?? ''))));
    }
    $family = clean(js_or($entry['nomFamille'] ?? null, $entry['nom'] ?? null, ''));
    return trim("Attestations de licence RSG - Famille {$family} - " . implode(', ', $names));
}

function attestation_mail_html(array $entry, array $members): string
{
    $multi = count($members) > 1;
    $list = implode('', array_map(function ($m) {
        $cat = clean($m['categorie'] ?? '');
        return '<li><strong>' . escape_html($m['prenom'] ?? '') . ' ' . escape_html($m['nom'] ?? '') . '</strong>' . ($cat !== '' ? ' - ' . escape_html($cat) : '') . '</li>';
    }, $members));
    $what = $multi ? 'les attestations de licence' : "l'attestation de licence";
    $footer = $multi ? count($members) . ' attestations sont jointes a ce mail, une par membre du dossier.' : "L'attestation est jointe a ce mail.";
    return "
  <p>Bonjour,</p>
  <p>Vous trouverez en piece jointe {$what} du Reveil Saint-Gereon pour :</p>
  <ul>{$list}</ul>
  <p>Reference dossier : <strong>" . escape_html($entry['id'] ?? '') . "</strong><br>
  Saison : <strong>" . escape_html($entry['saison'] ?? '') . "</strong></p>
  <p>{$footer}</p>
  <p>Sportivement,<br>Le secretariat du Reveil Saint-Gereon</p>
";
}

// ── Mailing groupé ───────────────────────────────────────────────────

function safe_email_html(mixed $html): string
{
    $s = js_str($html);
    $s = preg_replace('/<script[\s\S]*?<\/script>/i', '', $s);
    $s = preg_replace('/<iframe[\s\S]*?<\/iframe>/i', '', $s);
    $s = preg_replace('/<object[\s\S]*?<\/object>/i', '', $s);
    $s = preg_replace('/<embed[\s\S]*?<\/embed>/i', '', $s);
    $s = preg_replace('/\son\w+\s*=\s*([\'"]).*?\1/i', '', $s);
    $s = preg_replace('/\shref\s*=\s*([\'"])\s*javascript:[\s\S]*?\1/i', ' href="#"', $s);
    return $s ?? '';
}

function render_bulk_template(mixed $tpl, array $r, string $saison): string
{
    $map = [
        '{prenom}' => escape_html($r['prenom']),
        '{nom}' => escape_html($r['nom']),
        '{categorie}' => escape_html($r['categorie']),
        '{type}' => escape_html($r['type']),
        '{reference}' => escape_html($r['reference']),
        '{saison}' => escape_html($saison),
        '{source}' => escape_html($r['source']),
    ];
    $s = js_str($tpl);
    foreach ($map as $k => $v) $s = str_replace($k, $v, $s);
    return $s;
}
