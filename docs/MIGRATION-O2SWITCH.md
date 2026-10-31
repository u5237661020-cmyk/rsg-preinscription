# Installation sur o2switch — preinscription.reveilsaintgereon.fr

Ce guide décrit la bascule de l'application de **GitHub Pages + Firebase** vers **o2switch** (hébergement + base MySQL + boîte mail), dans l'ordre.
Comptez environ 45 minutes. Firebase reste en service tant que l'étape 8 n'est pas faite : on peut donc tout préparer et tester sans gêner les familles.

---

## 1. Créer le sous-domaine

cPanel → **Domaines** (ou « Sous-domaines »)
- Sous-domaine : `preinscription`
- Domaine : `reveilsaintgereon.fr`
- Racine du document : `preinscription.reveilsaintgereon.fr` (proposée automatiquement, notez-la)

Le DNS est géré par o2switch si le domaine y est enregistré : rien d'autre à faire.
Si le domaine est chez un autre registrar, créez chez lui un enregistrement `A` `preinscription` → l'adresse IP du serveur o2switch (visible dans cPanel, colonne de droite « Adresse IP partagée »).

Puis cPanel → **Lets Encrypt™ SSL** (ou « SSL/TLS Status ») → générer le certificat pour `preinscription.reveilsaintgereon.fr`.

## 2. Créer la base de données MySQL

cPanel → **Assistant de base de données MySQL**
1. Nom de la base : `rsg` → le nom complet sera du type `cpaneluser_rsg`
2. Utilisateur : `rsg` + un mot de passe fort (générateur) → `cpaneluser_rsg`
3. Privilèges : **TOUS LES PRIVILÈGES**

Notez le nom complet de la base, de l'utilisateur et le mot de passe.
Les tables sont créées automatiquement au premier appel de l'application (le fichier `api/schema.sql` peut aussi être importé dans phpMyAdmin).

## 3. Créer la boîte mail d'envoi

cPanel → **Comptes de messagerie** → Créer
- Adresse : `inscriptions@reveilsaintgereon.fr` (ou autre)
- Mot de passe fort, notez-le

Dans « Connect Devices » (Configurer le client de messagerie), notez le **serveur sortant SMTP** et le port SSL (généralement `465`).

Recommandé pour la délivrabilité : cPanel → **Délivrabilité des e-mails** → vérifier que SPF et DKIM sont « Valides » pour `reveilsaintgereon.fr` (bouton « Réparer » sinon).

## 4. Créer un compte FTP pour le déploiement automatique

cPanel → **Comptes FTP** → Ajouter
- Identifiant : `deploy-rsg`
- Répertoire : la racine du sous-domaine (étape 1), ex. `preinscription.reveilsaintgereon.fr`
- Mot de passe fort

Puis sur GitHub : dépôt → **Settings → Secrets and variables → Actions → New repository secret**, créer :

| Nom | Valeur |
|---|---|
| `O2SWITCH_FTP_SERVER` | serveur FTP indiqué par cPanel (ex. `ftp.reveilsaintgereon.fr`) |
| `O2SWITCH_FTP_USERNAME` | identifiant complet du compte FTP (ex. `deploy-rsg@reveilsaintgereon.fr`) |
| `O2SWITCH_FTP_PASSWORD` | son mot de passe |
| `O2SWITCH_FTP_DIR` | `./` (le compte FTP s'ouvre déjà dans le dossier du sous-domaine) |

Ensuite : onglet **Actions → Déploiement o2switch → Run workflow**. Le site et l'API sont envoyés dans le dossier du sous-domaine. Les déploiements suivants sont automatiques à chaque mise à jour de `main`.

## 5. Créer le fichier de configuration du serveur

cPanel → **Gestionnaire de fichiers** → dossier du sous-domaine → `api/`
1. Copier `config.sample.php` sous le nom `config.php`
2. Modifier `config.php` et remplir :
   - `db` : nom de la base, utilisateur, mot de passe (étape 2)
   - `smtp` : serveur, port, adresse et mot de passe de la boîte (étape 3)
   - `admin_access_code` : un code bureau provisoire
   - `session_secret` : une longue chaîne aléatoire (64 caractères)

> Option plus sûre : placer ce fichier **un niveau au-dessus** du dossier du sous-domaine, sous le nom `rsg-preinscription-config.php`. L'API le trouve automatiquement et il n'est alors jamais accessible depuis le web.

`config.php` n'est jamais écrasé ni supprimé par les déploiements.

Réglages PHP : cPanel → **Sélectionner une version de PHP** → PHP **8.2 ou plus**, extensions `pdo_mysql`, `mbstring`, `intl`, `iconv` cochées (c'est le cas par défaut).

## 6. Vérifier

- Ouvrir `https://preinscription.reveilsaintgereon.fr` → le formulaire s'affiche.
- `#/admin` → se connecter avec le code provisoire → le badge **« Serveur connecté »** apparaît.
- Changer le code bureau depuis l'espace admin (« Changer le code »).

## 7. Copier les données Firebase

Ouvrir `https://preinscription.reveilsaintgereon.fr/migration-firebase.html`
1. Code bureau de l'**ancienne** application
2. Code bureau de la **nouvelle** application
3. Cliquer sur **Lancer la copie** et attendre « TERMINÉ »

Sont copiés : préinscriptions de toutes les saisons, dossiers supprimés, tarifs et réglages, base licenciés Footclubs, configuration globale. Firebase n'est pas modifié. La copie peut être relancée sans risque.

Vérifier dans l'espace bureau que les dossiers sont bien là.

## 8. Bascule

1. Refaire la copie (étape 7) juste avant de basculer, pour récupérer les dernières préinscriptions.
2. Remplacer l'ancien site GitHub Pages par une redirection vers le nouveau site (pour que les anciens liens n'enregistrent plus rien dans Firebase), ou le désactiver : GitHub → Settings → Pages.
3. Dans `config.php`, passer `'migration_enabled' => false`.
4. Communiquer la nouvelle adresse : `https://preinscription.reveilsaintgereon.fr`

Firebase peut ensuite être conservé quelques semaines en lecture (archive), puis supprimé depuis la console Firebase.

---

## En cas de problème

| Symptôme | Piste |
|---|---|
| « Configuration serveur absente » | `api/config.php` n'existe pas (étape 5) |
| « Connexion à la base de données impossible » | nom complet de base / utilisateur / mot de passe dans `config.php` |
| E-mails non reçus | section `smtp` de `config.php` ; essayer port `587` + `'secure' => 'tls'` ; vérifier SPF/DKIM |
| Statut e-mail « erreur » sur un dossier | le message d'erreur est affiché dans le dossier ; bouton « Renvoyer » après correction |
| Code bureau oublié | phpMyAdmin → table `config_docs` → supprimer la ligne `security/adminAccess` ; le code de `config.php` redevient valable |
| « Requête trop volumineuse » | photos très lourdes : vérifier `api/.user.ini` (post_max_size 64M) |
| Journal d'erreurs | cPanel → **Journaux → Erreurs** (lignes commençant par `[RSG]`) |

## Architecture

```
preinscription.reveilsaintgereon.fr/
├── index.html, assets/        ← application React (build Vite)
├── .htaccess                  ← HTTPS forcé, en-têtes de sécurité
└── api/
    ├── index.php              ← seul fichier accessible depuis le web
    ├── config.php             ← mots de passe (créé à la main, jamais dans GitHub)
    ├── lib/                   ← logique serveur (ex-Cloud Functions)
    ├── vendor/                ← PHPMailer, FPDF (installés par le déploiement)
    └── schema.sql             ← structure des tables MySQL
```

Tables MySQL : `preinscriptions` (un dossier JSON par ligne, par saison), `deleted_preinscriptions`, `config_docs` (tarifs, base licenciés, configuration, code bureau haché), `mailings` (historique des envois groupés), `login_attempts` (anti-force brute).
