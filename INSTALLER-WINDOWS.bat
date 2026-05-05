@echo off
setlocal enableextensions
title RSG Preinscription - Installation automatique
color 0E

echo.
echo  ===================================================
echo    RSG REVEIL ST-GEREON - INSTALLATION AUTO
echo    Installation et deploiement en 1 clic
echo  ===================================================
echo.

cd /d "%~dp0"

REM === ETAPE 1 : Verifier si Node.js est installe ===
echo [1/6] Verification de Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [!] Node.js n'est pas installe sur cet ordinateur.
    echo.
    echo  Telechargement de Node.js en cours...
    echo  (cela peut prendre 1-2 minutes selon votre connexion)
    echo.

    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi' -OutFile $env:TEMP\nodejs-installer.msi"

    if not exist "%TEMP%\nodejs-installer.msi" (
        echo  [X] Echec du telechargement de Node.js
        echo  Telechargez manuellement depuis https://nodejs.org
        pause
        exit /b 1
    )

    echo  Lancement de l'installation Node.js...
    echo  [!] ACCEPTEZ tout et cliquez sur Suivant.
    echo.
    msiexec /i "%TEMP%\nodejs-installer.msi" /qb

    echo.
    echo  [OK] Node.js installe.
    echo.
    echo  [!] IMPORTANT : Fermez cette fenetre, puis re-double-cliquez
    echo      sur INSTALLER-WINDOWS.bat pour continuer.
    echo.
    pause
    exit /b 0
)
echo  [OK] Node.js detecte
node --version
echo.

REM === ETAPE 2 : Verifier si Git est installe ===
echo [2/6] Verification de Git...
where git >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [!] Git n'est pas installe.
    echo.
    echo  Telechargement de Git en cours...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.1/Git-2.47.0-64-bit.exe' -OutFile $env:TEMP\git-installer.exe"

    if not exist "%TEMP%\git-installer.exe" (
        echo  [X] Echec du telechargement de Git
        echo  Telechargez manuellement depuis https://git-scm.com
        pause
        exit /b 1
    )

    echo  Lancement de l'installation Git (acceptez les choix par defaut)...
    "%TEMP%\git-installer.exe" /VERYSILENT /NORESTART

    echo.
    echo  [OK] Git installe.
    echo  [!] Fermez cette fenetre et relancez INSTALLER-WINDOWS.bat
    pause
    exit /b 0
)
echo  [OK] Git detecte
git --version
echo.

REM === ETAPE 3 : Demander les infos GitHub ===
echo [3/6] Configuration GitHub
echo.
set /p GITHUB_USER=Votre nom d'utilisateur GitHub (ex: jean-dupont) : 
if "%GITHUB_USER%"=="" (
    echo  [X] Nom d'utilisateur obligatoire
    pause
    exit /b 1
)

set /p REPO_NAME=Nom du depot a creer (defaut: rsg-preinscription) : 
if "%REPO_NAME%"=="" set REPO_NAME=rsg-preinscription

echo.
echo  -^> Votre site sera publie a l'adresse :
echo     https://%GITHUB_USER%.github.io/%REPO_NAME%/
echo.
echo  [!] AVANT DE CONTINUER : creez le depot vide sur GitHub
echo      1. Allez sur https://github.com/new
echo      2. Nom du depot : %REPO_NAME%
echo      3. Public (coche)
echo      4. NE PAS ajouter README/license/gitignore
echo      5. Cliquez "Create repository"
echo.
pause

REM === ETAPE 4 : Mettre a jour vite.config.js ===
echo.
echo [4/6] Configuration du projet pour le depot %REPO_NAME%...
powershell -NoProfile -Command "(Get-Content vite.config.js) -replace '/rsg-preinscription/', '/%REPO_NAME%/' | Set-Content vite.config.js"
echo  [OK] vite.config.js mis a jour
echo.

REM === ETAPE 5 : Installer les dependances ===
echo [5/6] Installation des dependances (1-2 minutes)...
call npm install
if errorlevel 1 (
    echo  [X] Echec npm install
    pause
    exit /b 1
)
echo  [OK] Dependances installees
echo.

REM === ETAPE 6 : Initialiser Git et pousser ===
echo [6/6] Publication sur GitHub...

if not exist ".git" (
    git init
    git branch -M main
)

git add .
git commit -m "RSG Preinscription - deploiement initial" 2>nul

git remote get-url origin >nul 2>nul
if errorlevel 1 (
    git remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git
)

echo.
echo  [!] GitHub va vous demander de vous connecter.
echo      Saisissez votre identifiant GitHub et un Personal Access Token
echo      (PAS votre mot de passe GitHub).
echo      Tuto token : https://docs.github.com/fr/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
echo.
pause

git push -u origin main
if errorlevel 1 (
    echo  [X] Echec push GitHub. Verifiez :
    echo    - que le depot %REPO_NAME% existe bien sur GitHub
    echo    - que votre token est correct
    pause
    exit /b 1
)

echo.
echo  Compilation et deploiement sur GitHub Pages...
call npm run deploy
if errorlevel 1 (
    echo  [X] Echec deploiement
    pause
    exit /b 1
)

echo.
echo.
echo  ===================================================
echo            [OK] DEPLOIEMENT REUSSI !
echo  ===================================================
echo.
echo  -^> Derniere etape sur GitHub :
echo.
echo     1. Allez sur https://github.com/%GITHUB_USER%/%REPO_NAME%/settings/pages
echo     2. Sous "Source", choisissez :
echo        - Branch : gh-pages
echo        - Folder : / (root)
echo     3. Cliquez Save
echo     4. Attendez 1-2 minutes
echo.
echo  Votre app sera en ligne a :
echo  https://%GITHUB_USER%.github.io/%REPO_NAME%/
echo.
echo  -^> Pour generer un QR code :
echo     https://www.qr-code-generator.com
echo     Collez l'URL ci-dessus, telechargez en PNG, imprimez
echo.
echo  -^> Pour mettre a jour plus tard, double-cliquez sur :
echo     UPDATE-WINDOWS.bat
echo.
pause
endlocal
