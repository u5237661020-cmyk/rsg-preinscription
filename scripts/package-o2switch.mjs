// Prépare dist/ pour o2switch : copie l'API PHP (sans config.php) dans dist/api
// et ajoute le .htaccess racine. À lancer après « vite build » et
// « composer install --no-dev » dans api/.
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const api = join(root, "api");

if (!existsSync(dist)) throw new Error("dist/ absent : lancez d'abord vite build.");
if (!existsSync(join(api, "vendor", "autoload.php"))) {
  throw new Error("api/vendor absent : lancez « composer install --no-dev » dans le dossier api/.");
}

const target = join(dist, "api");
rmSync(target, { recursive: true, force: true });
cpSync(api, target, {
  recursive: true,
  filter: (src) => !/[\\/]config\.php$/.test(src) && !/[\\/]composer\.(json|lock)$/.test(src),
});

writeFileSync(join(dist, ".htaccess"), `# RSG Préinscription — o2switch
Options -Indexes
DirectoryIndex index.html

# Forcer HTTPS
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  # index.html jamais en cache (pour voir les mises à jour), fichiers versionnés en cache long
  <FilesMatch "^index\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType text/css "access plus 1 year"
</IfModule>
`);

console.log("dist/ prêt pour o2switch (application + api/).");
