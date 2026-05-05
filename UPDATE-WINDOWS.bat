@echo off
setlocal enableextensions
title RSG - Mise a jour
color 0A
cd /d "%~dp0"

echo.
echo  ==========================================
echo    RSG - MISE A JOUR DU SITE
echo  ==========================================
echo.

set /p MSG=Description de la modification : 
if "%MSG%"=="" set MSG=Mise a jour

echo.
echo Envoi sur GitHub...
git add .
git commit -m "%MSG%"
git push
if errorlevel 1 (
    echo  [X] Echec push
    pause
    exit /b 1
)

echo.
echo Deploiement...
call npm run deploy
if errorlevel 1 (
    echo  [X] Echec deploiement
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo    [OK] Site mis a jour !
echo  ==========================================
echo  Le site sera a jour dans 1 minute.
echo.
pause
endlocal
