@echo off
setlocal enableextensions enabledelayedexpansion
title RSG - 3. Publication GitHub
color 0E
cd /d "%~dp0"

echo.
echo  ==========================================
echo    RSG - ETAPE 3/4 : Publication GitHub
echo  ==========================================
echo.
echo  PRE-REQUIS :
echo   1. Avoir un compte GitHub
echo   2. Avoir cree un Token : https://github.com/settings/tokens/new
echo      (cocher "repo", expiration 1 an, Generate, COPIER)
echo   3. Avoir cree un depot vide nomme "rsg-preinscription"
echo      sur https://github.com/new (Public, sans README)
echo.
pause
echo.

set /p GITHUB_USER=Votre nom utilisateur GitHub : 
if "!GITHUB_USER!"=="" (
    echo  [X] Nom obligatoire
    pause
    exit /b 1
)

set REPO_NAME=rsg-preinscription
echo.
echo  Le depot utilise sera : https://github.com/!GITHUB_USER!/!REPO_NAME!
echo.

echo Mise a jour de vite.config.js...
powershell -NoProfile -Command "(Get-Content vite.config.js) -replace '/rsg-preinscription/', '/!REPO_NAME!/' | Set-Content vite.config.js"
echo  [OK]
echo.

echo Initialisation Git...
if not exist ".git" (
    git init
    git branch -M main
)

git add .
git commit -m "RSG Preinscription - deploiement initial" 2>nul

git remote get-url origin >nul 2>nul
if errorlevel 1 (
    git remote add origin https://github.com/!GITHUB_USER!/!REPO_NAME!.git
) else (
    git remote set-url origin https://github.com/!GITHUB_USER!/!REPO_NAME!.git
)
echo  [OK]
echo.

echo  ==========================================
echo    Push vers GitHub
echo  ==========================================
echo.
echo  Une fenetre va s'ouvrir pour vous identifier.
echo  Username : !GITHUB_USER!
echo  Password : COLLEZ VOTRE TOKEN (pas le mot de passe GitHub)
echo.
pause

git push -u origin main
if errorlevel 1 (
    echo.
    echo  [X] Echec du push
    echo.
    echo  Causes possibles :
    echo   - Le depot rsg-preinscription n'existe pas sur GitHub
    echo   - Mauvais Token
    echo   - Le depot contient deja des fichiers (README cree par erreur)
    echo.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo    [OK] Code envoye sur GitHub !
echo  ==========================================
echo.
echo  Lancez maintenant : 4-DEPLOYER.bat
echo.
pause
endlocal
