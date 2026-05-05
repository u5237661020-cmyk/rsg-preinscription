@echo off
setlocal enableextensions
title RSG - 2. Installation dependances
color 0E
cd /d "%~dp0"

echo.
echo  ==========================================
echo    RSG - ETAPE 2/4 : npm install
echo  ==========================================
echo.
echo  Cela prend 1 a 3 minutes selon votre connexion.
echo  Patientez sans toucher a la fenetre...
echo.

call npm install
if errorlevel 1 (
    echo.
    echo  [X] Echec npm install
    echo  Verifiez votre connexion internet et reessayez.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo    [OK] Dependances installees
echo  ==========================================
echo.
echo  Lancez maintenant : 3-PUBLIER-GITHUB.bat
echo.
pause
endlocal
