@echo off
setlocal enableextensions
title RSG - Installation Firebase
color 0E
cd /d "%~dp0"

echo.
echo  ===================================================
echo    RSG - Installation Firebase et deploiement
echo  ===================================================
echo.
echo  Ce script va :
echo   1. Installer la librairie Firebase
echo   2. Builder le site
echo   3. Deployer sur GitHub Pages
echo.
pause

echo.
echo [1/3] Installation Firebase...
call npm install firebase
if errorlevel 1 (
    echo  [X] Echec installation
    pause
    exit /b 1
)
echo  [OK] Firebase installe
echo.

echo [2/3] Build du site...
call npm run build
if errorlevel 1 (
    echo  [X] Echec build - verifiez App.jsx
    pause
    exit /b 1
)
echo  [OK] Build OK
echo.

echo [3/3] Deploiement...
git add .
git commit -m "Integration Firebase Firestore"
git push
if errorlevel 1 (
    echo  [X] Echec push
    pause
    exit /b 1
)
call npm run deploy
if errorlevel 1 (
    echo  [X] Echec deploiement
    pause
    exit /b 1
)

echo.
echo  ===================================================
echo    [OK] DEPLOYE AVEC FIREBASE !
echo  ===================================================
echo.
echo  ETAPES SUIVANTES :
echo.
echo   1. Verifier que Firestore est bien active dans la console Firebase :
echo      https://console.firebase.google.com/project/rsg-preinscription/firestore
echo.
echo   2. Coller les regles de securite :
echo      Console Firebase ^> Firestore ^> Regles ^> coller le contenu de firestore.rules ^> Publier
echo.
echo   3. Tester le site en faisant Ctrl+F5 :
echo      https://u5237661020-cmyk.github.io/rsg-preinscription/
echo.
echo   4. Faire une preinscription test puis ouvrir le bureau (RSG2025) sur un AUTRE
echo      appareil ^( par exemple votre telephone ^) - elle doit apparaitre automatiquement.
echo.
pause
endlocal
