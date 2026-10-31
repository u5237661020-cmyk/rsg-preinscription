<?php
// ═══════════════════════════════════════════════════════════════════
// Configuration de l'API RSG Préinscription (o2switch)
// ═══════════════════════════════════════════════════════════════════
// 1. Copiez ce fichier sous le nom « config.php » dans le dossier api/
//    du site (Gestionnaire de fichiers cPanel), OU mieux : un niveau
//    au-dessus du dossier du site sous le nom « rsg-preinscription-config.php »
//    (hors de portée du web).
// 2. Remplissez les valeurs ci-dessous.
// Ce fichier contient des mots de passe : il ne doit JAMAIS être envoyé sur GitHub.

return [
    // ── Base de données MySQL (cPanel → Bases de données MySQL) ──────────
    'db' => [
        'host'     => 'localhost',
        'name'     => 'cpaneluser_rsg',      // nom complet de la base
        'user'     => 'cpaneluser_rsg',      // utilisateur MySQL
        'password' => 'MOT_DE_PASSE_MYSQL',
    ],

    // ── Envoi des e-mails (cPanel → Comptes de messagerie) ───────────────
    'smtp' => [
        'host'        => 'mail.reveilsaintgereon.fr', // ou le serveur indiqué par o2switch
        'port'        => 465,                         // 465 = SSL, 587 = STARTTLS
        'secure'      => 'ssl',                       // 'ssl' ou 'tls'
        'user'        => 'inscriptions@reveilsaintgereon.fr',
        'password'    => 'MOT_DE_PASSE_DE_LA_BOITE',
        'from_email'  => 'inscriptions@reveilsaintgereon.fr',
        'from_name'   => 'Reveil Saint-Gereon',
        'reply_to'    => '',                          // optionnel
    ],

    // ── Accès secrétariat ────────────────────────────────────────────────
    // Code bureau initial (utilisé tant qu'aucun code n'a été défini depuis
    // l'application via « Changer le code »).
    'admin_access_code' => 'CODE_BUREAU_INITIAL',

    // Clé secrète de signature des sessions : une longue chaîne aléatoire
    // (au moins 32 caractères). Exemple : générez-la sur https://www.random.org/strings/
    'session_secret' => 'REMPLACEZ_PAR_UNE_LONGUE_CHAINE_ALEATOIRE_DE_64_CARACTERES',

    // Durée d'une session bureau (secondes)
    'session_ttl' => 12 * 3600,

    // Saison publique par défaut si aucune n'est configurée
    'default_saison' => '2026-2027',

    // Origines autorisées à appeler l'API depuis un autre domaine (CORS).
    // Laisser vide si l'application et l'API sont sur le même domaine.
    'allowed_origins' => [],

    // Clé d'import Firebase (utilisée une seule fois pour la migration).
    // Laissez vide pour désactiver l'import après la migration.
    'migration_enabled' => true,
];
