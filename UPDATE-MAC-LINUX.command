#!/bin/bash
set -e
cd "$(dirname "$0")"

echo
echo "🔄 Mise à jour RSG Préinscription"
echo
read -p "Description du changement : " MSG
MSG=${MSG:-"Mise à jour"}

git add .
git commit -m "$MSG" 2>/dev/null || true
git push
npm run deploy

echo
echo "✓ Mise à jour terminée"
read -p "Appuyez sur Entrée..."
