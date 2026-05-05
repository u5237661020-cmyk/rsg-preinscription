# 🟡⚫ RSG Préinscription — Application en ligne

Application de préinscription pour le club **Réveil Saint-Géréon (RSG)**.
Hébergée gratuitement sur GitHub Pages, accessible depuis n'importe quel téléphone via QR code.

## 🚀 Déploiement en 10 étapes

### Prérequis
- Un compte GitHub (gratuit)
- [Node.js](https://nodejs.org) installé sur votre ordinateur (version 18 ou +)
- 5 minutes

### 1. Créer un nouveau dépôt sur GitHub
1. Connectez-vous sur https://github.com
2. Cliquez sur **+ → New repository** en haut à droite
3. Nommez le dépôt **`rsg-preinscription`** (ou autre nom — voir étape 6)
4. Laissez-le **public** (obligatoire pour GitHub Pages gratuit)
5. **Ne cochez pas** "Add README"
6. Cliquez sur **Create repository**

### 2. Télécharger ce projet
Copiez tous les fichiers dans un nouveau dossier sur votre ordinateur.

### 3. Ouvrir un terminal dans le dossier
- **Windows** : Clic droit dans le dossier → "Ouvrir dans le terminal"
- **Mac** : Clic droit dossier → Services → Nouveau Terminal

### 4. Installer les dépendances
```bash
npm install
```
(prend 1-2 min la 1ère fois)

### 5. Tester en local (optionnel)
```bash
npm run dev
```
Ouvrez http://localhost:5173 — l'app fonctionne.
**Ctrl+C** pour arrêter.

### 6. Personnaliser le nom du dépôt
**IMPORTANT** : Si vous avez nommé votre dépôt autrement que `rsg-preinscription`,
ouvrez `vite.config.js` et changez la ligne :
```js
base: '/NOM_DE_VOTRE_REPO/',
```

### 7. Connecter au dépôt GitHub
Dans le terminal :
```bash
git init
git add .
git commit -m "Première version RSG Préinscription"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/rsg-preinscription.git
git push -u origin main
```
Remplacez **VOTRE_USERNAME** par votre nom GitHub.

### 8. Déployer sur GitHub Pages
```bash
npm run deploy
```
Cette commande compile le projet et publie le résultat sur la branche `gh-pages`.

### 9. Activer GitHub Pages
1. Sur GitHub, allez dans votre dépôt
2. **Settings** (en haut) → **Pages** (menu de gauche)
3. Sous "Build and deployment" :
   - **Source** : `Deploy from a branch`
   - **Branch** : `gh-pages` / `(root)`
4. Cliquez **Save**
5. Attendez 1-2 minutes

Votre site est en ligne à :
```
https://VOTRE_USERNAME.github.io/rsg-preinscription/
```

### 10. Générer le QR code
Allez sur https://www.qr-code-generator.com (gratuit, sans inscription)
- Collez l'URL de votre site
- Téléchargez en PNG
- Imprimez-le sur les flyers du club, au stade, sur les groupes WhatsApp parents…

---

## 🔄 Mettre à jour l'application plus tard

Quand vous voulez modifier quelque chose :
```bash
# 1. Modifier les fichiers
# 2. Committer
git add .
git commit -m "Description du changement"
git push

# 3. Redéployer
npm run deploy
```
Le site se met à jour en 1 minute.

---

## 📱 Codes d'accès intégrés

- **Bureau** : `RSG2025` — accès complet (gestion, tarifs, exports, base licenciés, stats)
- **Permanence** : `PERM2025` — interface simplifiée pour valider les paiements aux permanences

⚠️ **Pour modifier ces codes**, ouvrez `src/App.jsx` et changez les lignes :
```js
const ADMIN = "RSG2025";
const PERM = "PERM2025";
```

---

## 💾 Données

Les données sont stockées dans le **localStorage du navigateur** de la personne qui consulte la page.
- ✅ **Avantages** : aucune base de données, gratuit, données privées par appareil, conforme RGPD
- ⚠️ **Limites** : les données entrées depuis un téléphone ne sont visibles que sur **ce téléphone**

### Pour partager les données entre plusieurs personnes du bureau :

**Option simple (recommandée pour un club)** :
- Le **secrétaire centralise** les préinscriptions sur **son téléphone** ou son PC.
- Les **familles** font la préinscription depuis leurs téléphones (envoient les infos par formulaire — vous voyez ça depuis votre interface bureau si vous accédez sur le même appareil).

**🚧 Limite importante** : avec localStorage, les préinscriptions remplies par les familles sur leurs téléphones ne remontent PAS automatiquement vers vous. Il faut une base de données partagée.

### Solution si vous voulez la centralisation auto

Plusieurs options gratuites :
1. **Firebase** (Google) : 5min de config, gratuit jusqu'à 50K dossiers
2. **Supabase** : alternative open-source, gratuit
3. **Google Sheets via Google Apps Script** : envoyer chaque préinscription dans un Google Sheet partagé

👉 **Recommandation** : commencez avec localStorage pour tester, et si ça marche, on bascule ensuite vers Firebase. Demandez-moi quand vous serez prêt.

---

## 📦 Structure du projet

```
rsg-preinscription/
├── package.json          # dépendances
├── vite.config.js        # config build
├── index.html            # page HTML
├── README.md             # ce fichier
└── src/
    ├── main.jsx          # point d'entrée
    └── App.jsx           # toute l'application
```

Tout le code de l'application est dans **`src/App.jsx`** (~95K, 1 seul fichier pour faciliter l'édition).

---

## 🆘 Problèmes courants

### "Page blanche après déploiement"
→ Vérifiez que `base` dans `vite.config.js` correspond exactement au nom du dépôt GitHub.
Le nom est sensible à la casse.

### "npm: command not found"
→ Installez Node.js : https://nodejs.org

### "git: command not found" (Windows)
→ Installez Git : https://git-scm.com/download/win

### "Permission denied (publickey)"
→ Lors du `git push`, GitHub demande une connexion. Utilisez HTTPS et un Personal Access Token :
https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

### "Les données disparaissent"
→ localStorage peut être vidé si l'utilisateur efface ses données de navigation.
Recommandation : exportez régulièrement les données en Excel via l'interface Bureau.

---

## 📞 Récap

- **App** : https://VOTRE_USERNAME.github.io/rsg-preinscription/
- **Code source** : https://github.com/VOTRE_USERNAME/rsg-preinscription
- **Mise à jour** : modifier code → `npm run deploy`
- **QR code** : générer sur qr-code-generator.com depuis votre URL
