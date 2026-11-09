@echo off
chcp 65001 >nul 2>&1
setlocal
title YllaCash - Deploiement

set LOGFILE=deploy-log.txt
set REPO=https://github.com/sbabou11/festylla.git
set BRANCH=main

echo YllaCash - Deploiement > %LOGFILE%
echo Date : %date% %time% >> %LOGFILE%
echo. >> %LOGFILE%

echo.
echo  ==========================================
echo   YllaCash - Script de deploiement
echo  ==========================================
echo.

:: === 0. Verification du dossier ===
:: Le build du service worker (Workbox) echoue si le chemin contient une apostrophe
echo "%CD%" | "%SystemRoot%\System32\find.exe" "'" >nul
if %errorlevel% equ 0 (
    echo  ERREUR : le chemin du dossier contient une apostrophe :
    echo    %CD%
    echo  Le build echouera. Renommez le dossier, par exemple "YllaCash 2.0".
    echo ERREUR apostrophe dans le chemin >> %LOGFILE%
    pause
    exit /b 1
)

:: === 0. Nettoyage des anciens api/*.cjs obsoletes ===
:: Les endpoints sont retournes en .js (avec api/package.json type:commonjs).
:: S'ils trainent encore en local, ils pourraient confondre le routage Vercel.
echo [0/5] Nettoyage anciens api/*.cjs obsoletes...
echo [0/5] Cleanup api/*.cjs obsoletes >> %LOGFILE%
set REMOVED=0
for %%f in (audit cachets comptabilite process-reminders rapport send-push transactions) do (
  if exist "api\%%f.cjs" (
    del /q "api\%%f.cjs"
    echo   Supprime: api\%%f.cjs >> %LOGFILE%
    set /a REMOVED+=1
  )
)
if %REMOVED% gtr 0 (
  echo   %REMOVED% fichier(s) obsolete(s) supprime(s)
  echo   Total supprime: %REMOVED% >> %LOGFILE%
) else (
  echo   Aucun fichier obsolete trouve ^(deja propre^)
  echo   Rien a nettoyer >> %LOGFILE%
)
echo  OK
echo  OK >> %LOGFILE%

:: === 1. .env.local ===
echo [1/5] Creation .env.local...
echo [1/5] .env.local >> %LOGFILE%
(
echo VITE_FIREBASE_API_KEY=AIzaSyDqQnyzjXYmTWZrvXHkGbhPrCrIuG_lu-A
echo VITE_FIREBASE_AUTH_DOMAIN=yllatok.firebaseapp.com
echo VITE_FIREBASE_PROJECT_ID=yllatok
echo VITE_FIREBASE_STORAGE_BUCKET=yllatok.firebasestorage.app
echo VITE_FIREBASE_MESSAGING_SENDER_ID=850586788991
echo VITE_FIREBASE_APP_ID=1:850586788991:web:37b3df23b5e6b60744cb4a
) > .env.local
echo  OK
echo  OK >> %LOGFILE%

:: === 2. npm install ===
echo.
echo [2/5] npm install...
echo [2/5] npm install >> %LOGFILE%
call npm install >> %LOGFILE% 2>&1
if %errorlevel% neq 0 ( echo ERREUR npm install >> %LOGFILE% & type %LOGFILE% & pause & exit /b 1 )
echo  OK
echo  OK >> %LOGFILE%

:: === 3. Build ===
echo.
echo [3/5] Build production...
echo [3/5] build >> %LOGFILE%
call npm run build >> %LOGFILE% 2>&1
if %errorlevel% neq 0 ( echo ERREUR build >> %LOGFILE% & type %LOGFILE% & pause & exit /b 1 )
echo  OK
echo  OK >> %LOGFILE%

:: === 4. Git - on garde l'historique, on ajoute un commit et on pousse ===
echo.
echo [4/5] Envoi sur GitHub...
echo [4/5] Git >> %LOGFILE%
git --version >> %LOGFILE% 2>&1

:: Premier lancement seulement : creer le depot
if not exist .git (
    echo  Creation du depot git... >> %LOGFILE%
    git init -b %BRANCH% >> %LOGFILE% 2>&1
)

:: Remote "origin" : l'ajouter s'il manque, sinon s'assurer de son adresse
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    git remote add origin %REPO% >> %LOGFILE% 2>&1
) else (
    git remote set-url origin %REPO% >> %LOGFILE% 2>&1
)
git remote -v >> %LOGFILE% 2>&1

:: Identite git : seulement si aucune n'est configuree (ne pas ecraser la votre)
git config user.email >nul 2>&1
if %errorlevel% neq 0 git config user.email "deploy@yllatok.fr"
git config user.name >nul 2>&1
if %errorlevel% neq 0 git config user.name "YllaCash Deploy"

:: Le deploiement part toujours de la branche main
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURRENT=%%b
if /i not "%CURRENT%"=="%BRANCH%" (
    echo  ERREUR : vous etes sur la branche "%CURRENT%", pas "%BRANCH%".
    echo  Faites : git checkout %BRANCH%   puis relancez.
    echo ERREUR branche %CURRENT% >> %LOGFILE%
    pause
    exit /b 1
)

:: Commit des changements en cours (s'il y en a)
git add -A >> %LOGFILE% 2>&1
git diff --cached --quiet
if %errorlevel% neq 0 (
    git commit -m "Deploiement YllaCash %date% %time:~0,5%" >> %LOGFILE% 2>&1
    echo  Commit cree >> %LOGFILE%
) else (
    echo  Aucun changement a committer >> %LOGFILE%
)

:: Push normal (sans --force)
echo  Push en cours... >> %LOGFILE%
git push -u origin %BRANCH% >> %LOGFILE% 2>&1
if %errorlevel% equ 0 goto pushok

:: Push refuse : en general parce que GitHub a encore l'ancien historique
:: cree par l'ancienne version de ce script (qui repartait de zero a chaque fois)
echo.
echo  ==========================================
echo   GitHub a refuse l'envoi.
echo  ==========================================
echo  Cause la plus probable : GitHub contient l'ancien historique
echo  (l'ancien script effacait .git a chaque deploiement).
echo  Pour le remplacer UNE FOIS par l'historique local, tapez O.
echo  Sinon tapez N et consultez %LOGFILE%.
echo.
git fetch origin >> %LOGFILE% 2>&1
set CONFIRM=N
set /p CONFIRM= Remplacer l'historique GitHub par l'historique local ? (O/N) :
if /i not "%CONFIRM%"=="O" (
    echo  Push annule >> %LOGFILE%
    type %LOGFILE%
    pause
    exit /b 1
)
echo  Push force (confirme par l'utilisateur) >> %LOGFILE%
git push -u --force-with-lease origin %BRANCH% >> %LOGFILE% 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERREUR PUSH - Voici le log complet :
    echo  ==========================================
    type %LOGFILE%
    echo  ==========================================
    echo.
    echo  Si demande de mot de passe, entrez votre token GitHub ghp_...
    pause
    exit /b 1
)

:pushok
echo  PUSH REUSSI >> %LOGFILE%
echo  OK

:: === 5. Resume ===
echo DEPLOIEMENT REUSSI >> %LOGFILE%
echo.
echo  ==========================================
echo   Deploiement reussi !
echo  ==========================================
echo.
echo   GitHub : mis a jour (historique conserve)
echo   Vercel : redeploiement en cours (2 min)
echo   Log    : %LOGFILE%
echo.
pause
