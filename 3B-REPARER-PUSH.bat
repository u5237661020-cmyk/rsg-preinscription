@echo off
setlocal enableextensions enabledelayedexpansion
title RSG - REPARATION push GitHub
color 0E
cd /d "%~dp0"

echo.
echo  ==========================================
echo    RSG - REPARATION push GitHub
echo  ==========================================
echo.
echo  Diagnostic : le commit initial n'a pas pu se faire
echo  car Git n'a pas votre identite configuree.
echo  On corrige tout de suite.
echo.

REM Configuration de l'identite Git (necessaire pour commiter)
echo Configuration de votre identite Git...
echo.
set /p GIT_NAME=Votre nom (ex: Jean Dupont) : 
if "!GIT_NAME!"=="" set GIT_NAME=RSG Admin

set /p GIT_EMAIL=Votre email : 
if "!GIT_EMAIL!"=="" (
    echo  [X] Email obligatoire pour Git
    pause
    exit /b 1
)

git config user.name "!GIT_NAME!"
git config user.email "!GIT_EMAIL!"
echo  [OK] Identite Git configuree
echo.

REM Verifier qu'on est bien dans un repo git
if not exist ".git" (
    echo  [X] Pas de dossier .git ici
    echo  Lancez d'abord 3-PUBLIER-GITHUB.bat
    pause
    exit /b 1
)

REM Re-stage tous les fichiers
echo Preparation des fichiers...
git add -A
echo  [OK]
echo.

REM Forcer le commit cette fois
echo Creation du commit...
git commit -m "RSG Preinscription - deploiement initial"
if errorlevel 1 (
    echo.
    echo  Si "nothing to commit", c'est que le commit existe deja.
    echo  On continue quand meme.
)
echo.

REM S'assurer qu'on est sur la branche main
echo Passage sur la branche main...
git branch -M main
echo  [OK]
echo.

REM Afficher l'etat
echo Etat actuel :
git log --oneline -3 2>nul
if errorlevel 1 (
    echo  [X] Aucun commit n'existe ! Probleme grave.
    pause
    exit /b 1
)
echo.

echo Verification du remote...
git remote -v
echo.

echo  ==========================================
echo    Push vers GitHub
echo  ==========================================
echo.
echo  Si une fenetre de connexion s'ouvre :
echo   Username : votre nom GitHub
echo   Password : votre TOKEN (pas le mot de passe)
echo.
pause

git push -u origin main
if errorlevel 1 (
    echo.
    echo  [X] Le push a encore echoue
    echo.
    echo  Verifiez :
    echo   1. Le depot existe : https://github.com/u5237661020-cmyk/rsg-preinscription
    echo   2. Vous avez utilise un Token (pas le mot de passe)
    echo   3. Le Token a la permission "repo"
    echo.
    echo  Si le depot n'est pas vide, executez :
    echo    git push -u origin main --force
    echo  (apres avoir confirme que vous voulez ecraser son contenu)
    echo.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo    [OK] Push reussi !
echo  ==========================================
echo.
echo  Etape suivante : 4-DEPLOYER.bat
echo.
pause
endlocal
