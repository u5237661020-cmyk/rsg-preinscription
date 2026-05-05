@echo off
setlocal enableextensions
title RSG - 1. Verification environnement
color 0E
cd /d "%~dp0"

echo.
echo  ==========================================
echo    RSG - ETAPE 1/4 : Verification
echo  ==========================================
echo.

echo Verification de Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo  [X] Node.js MANQUANT
    echo.
    echo  Telechargez et installez :
    echo  https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi
    echo.
    echo  Puis relancez ce script.
    pause
    exit /b 1
)
echo  [OK] Node.js
node --version
echo.

echo Verification de npm...
where npm >nul 2>nul
if errorlevel 1 (
    echo  [X] npm introuvable - reinstallez Node.js
    pause
    exit /b 1
)
echo  [OK] npm
call npm --version
echo.

echo Verification de Git...
where git >nul 2>nul
if errorlevel 1 (
    echo  [X] Git MANQUANT
    echo.
    echo  Telechargez et installez :
    echo  https://git-scm.com/download/win
    echo.
    echo  Puis relancez ce script.
    pause
    exit /b 1
)
echo  [OK] Git
git --version
echo.

echo  ==========================================
echo    [OK] Tout est pret !
echo  ==========================================
echo.
echo  Lancez maintenant : 2-INSTALLER-DEPENDANCES.bat
echo.
pause
endlocal
