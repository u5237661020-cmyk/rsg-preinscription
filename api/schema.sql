-- ═══════════════════════════════════════════════════════════════════
-- RSG Préinscription — schéma MySQL / MariaDB (o2switch)
-- ═══════════════════════════════════════════════════════════════════
-- À importer une seule fois dans la base créée depuis cPanel
-- (phpMyAdmin → onglet « Importer »). Les tables sont aussi créées
-- automatiquement par l'API au premier appel si elles n'existent pas.
--
-- Les dossiers sont stockés en JSON (même structure que dans Firebase)
-- pour garder une compatibilité totale avec l'application.

CREATE TABLE IF NOT EXISTS preinscriptions (
  saison              VARCHAR(30)  NOT NULL,
  id                  VARCHAR(100) NOT NULL,
  data                LONGTEXT     NOT NULL,
  date_preinscription VARCHAR(40)  NOT NULL DEFAULT '',
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (saison, id),
  KEY idx_saison_date (saison, date_preinscription)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deleted_preinscriptions (
  saison     VARCHAR(30)  NOT NULL,
  id         VARCHAR(100) NOT NULL,
  data       TEXT         NOT NULL,
  deleted_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (saison, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documents de configuration : "global", "security/adminAccess",
-- "saisons/<saison>/tarifs", "saisons/<saison>/licencies"
CREATE TABLE IF NOT EXISTS config_docs (
  path       VARCHAR(190) NOT NULL,
  data       LONGTEXT     NOT NULL,
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mailings (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  saison     VARCHAR(30)  NOT NULL,
  data       LONGTEXT     NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_saison (saison)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_key          VARCHAR(100) NOT NULL,
  failures        INT          NOT NULL DEFAULT 0,
  first_failure_at BIGINT      NULL,
  blocked_until   BIGINT       NULL,
  last_failure_at BIGINT       NULL,
  last_success_at BIGINT       NULL,
  PRIMARY KEY (ip_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
