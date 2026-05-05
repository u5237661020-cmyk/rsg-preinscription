@echo off
setlocal enableextensions
title RSG - Mise a jour base licenciés
color 0B
cd /d "%~dp0"

echo.
echo  ===================================================
echo    RSG - MISE A JOUR BASE LICENCIES (Footclubs)
echo  ===================================================
echo.

REM Vérifier qu'on a un argument (fichier xlsx)
if "%~1"=="" (
    echo  Mode d'emploi :
    echo    1. Exportez votre liste depuis Footclubs en Excel
    echo    2. Glissez-deposez le fichier .xlsx sur ce script
    echo    3. Le site sera mis a jour automatiquement
    echo.
    echo  OU executez : MAJ-LICENCIES.bat fichier.xlsx
    echo.
    pause
    exit /b 0
)

REM Vérifier que Python est dispo
where python >nul 2>nul
if errorlevel 1 (
    echo  [X] Python n'est pas installe
    echo.
    echo  Installez Python depuis : https://www.python.org/downloads/
    echo  ATTENTION : a l'installation, cochez "Add Python to PATH"
    pause
    exit /b 1
)

REM Vérifier pandas
python -c "import pandas" 2>nul
if errorlevel 1 (
    echo  Installation de pandas...
    python -m pip install pandas openpyxl
    if errorlevel 1 (
        echo  [X] Echec installation pandas
        pause
        exit /b 1
    )
)

REM Conversion
echo  Conversion en cours...
echo.
python convert-footclubs.py "%~1"
if errorlevel 1 (
    echo  [X] Echec conversion
    pause
    exit /b 1
)

REM Copier dans public/
if not exist "public" mkdir public
copy /Y licencies.json public\licencies.json >nul
echo  [OK] licencies.json copie dans public/
echo.

REM Demander si on déploie maintenant
set /p REP=Voulez-vous deployer maintenant sur le site ? (O/N) : 
if /i not "%REP%"=="O" (
    echo.
    echo  Pour deployer plus tard, double-cliquez sur UPDATE-WINDOWS.bat
    pause
    exit /b 0
)

REM Déploiement
echo.
echo Deploiement sur GitHub...
git add public/licencies.json
git commit -m "Mise a jour base licencies (Footclubs)"
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
echo    [OK] BASE MISE A JOUR ET SITE DEPLOYE !
echo  ===================================================
echo  Le site sera a jour dans 1 minute environ.
echo.
pause
endlocal
