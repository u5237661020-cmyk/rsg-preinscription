@echo off
setlocal enableextensions
title RSG - 4. Deploiement GitHub Pages
color 0E
cd /d "%~dp0"

echo.
echo  ==========================================
echo    RSG - ETAPE 4/4 : Deploiement Pages
echo  ==========================================
echo.
echo  Compilation et publication sur GitHub Pages...
echo  Cela prend 1 a 2 minutes.
echo.

call npm run deploy
if errorlevel 1 (
    echo.
    echo  [X] Echec deploiement
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo    [OK] DEPLOYE !
echo  ==========================================
echo.
echo  DERNIERE ETAPE (a faire UNE SEULE FOIS) :
echo.
echo   1. Allez sur :
echo      https://github.com/VOTRE_NOM/rsg-preinscription/settings/pages
echo.
echo   2. Sous "Source" :
echo      - Branch : gh-pages
echo      - Folder : / (root)
echo      - Cliquez Save
echo.
echo   3. Attendez 1-2 minutes
echo.
echo   4. Votre site sera en ligne a :
echo      https://VOTRE_NOM.github.io/rsg-preinscription/
echo.
echo  ==========================================
echo    Pour les mises a jour futures
echo  ==========================================
echo.
echo  Modifiez src/App.jsx puis double-cliquez :
echo  UPDATE-WINDOWS.bat
echo.
pause
endlocal
