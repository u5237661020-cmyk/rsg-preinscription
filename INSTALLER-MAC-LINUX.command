#!/bin/bash
set -e
cd "$(dirname "$0")"

echo
echo "╔══════════════════════════════════════════════════╗"
echo "║   RSG REVEIL ST-GERON - INSTALLATION AUTO      ║"
echo "╚══════════════════════════════════════════════════╝"
echo

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo "⚠ Node.js n'est pas installé."
    echo
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Installation via Homebrew..."
        if ! command -v brew &> /dev/null; then
            echo "Installation de Homebrew d'abord..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node
    else
        echo "Linux : installation Node.js via apt"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

echo "✓ Node.js : $(node --version)"

# Vérifier Git
if ! command -v git &> /dev/null; then
    echo "⚠ Installation de Git..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install git
    else
        sudo apt-get install -y git
    fi
fi
echo "✓ Git : $(git --version)"
echo

# Demander infos GitHub
read -p "Nom d'utilisateur GitHub : " GITHUB_USER
read -p "Nom du dépôt (défaut: rsg-preinscription) : " REPO_NAME
REPO_NAME=${REPO_NAME:-rsg-preinscription}

echo
echo "➡ Site qui sera publié : https://${GITHUB_USER}.github.io/${REPO_NAME}/"
echo
echo "⚠ Créez le dépôt vide sur https://github.com/new"
echo "  - Nom : ${REPO_NAME}"
echo "  - Public, sans README"
read -p "Appuyez sur Entrée quand c'est fait..."

# Adapter vite.config.js
sed -i.bak "s|/rsg-preinscription/|/${REPO_NAME}/|g" vite.config.js
rm -f vite.config.js.bak
echo "✓ Configuration mise à jour"

# Install
echo
echo "Installation des dépendances..."
npm install

# Git
[ ! -d ".git" ] && git init && git branch -M main
git add .
git commit -m "RSG Preinscription - déploiement initial" 2>/dev/null || true

if ! git remote get-url origin &>/dev/null; then
    git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
fi

echo
echo "Push GitHub (saisissez vos identifiants si demandé)..."
git push -u origin main

echo
echo "Déploiement..."
npm run deploy

echo
echo "╔══════════════════════════════════════════════════╗"
echo "║          ✓ DÉPLOIEMENT RÉUSSI !                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo
echo "➡ Activez GitHub Pages :"
echo "   https://github.com/${GITHUB_USER}/${REPO_NAME}/settings/pages"
echo "   Source : branche gh-pages, folder / (root)"
echo
echo "➡ Site dans 1-2 min : https://${GITHUB_USER}.github.io/${REPO_NAME}/"
echo
echo "➡ QR code : https://www.qr-code-generator.com"
echo
read -p "Appuyez sur Entrée pour terminer..."
