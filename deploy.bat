@echo off
chcp 65001 >nul 2>&1
title YllaTok - Deploiement

set LOGFILE=deploy-log.txt
echo YllaTok - Deploiement > %LOGFILE%
echo Date : %date% %time% >> %LOGFILE%
echo. >> %LOGFILE%

echo.
echo  ==========================================
echo   YllaTok - Script de deploiement
echo  ==========================================
echo.

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

:: === 4. Git - methode simple et robuste ===
echo.
echo [4/5] Envoi sur GitHub...
echo [4/5] Git >> %LOGFILE%

git --version >> %LOGFILE% 2>&1

:: Configurer identite git
git config user.email "deploy@yllatok.fr" >> %LOGFILE% 2>&1
git config user.name "YllaTok Deploy" >> %LOGFILE% 2>&1

:: Supprimer le dossier .git et recommencer proprement
echo  Suppression ancien .git et reinitialisation... >> %LOGFILE%
rmdir /s /q .git >> %LOGFILE% 2>&1
echo  Code rmdir : %errorlevel% >> %LOGFILE%

:: Reinitialiser proprement
git init >> %LOGFILE% 2>&1
echo  Code init : %errorlevel% >> %LOGFILE%

git config user.email "deploy@yllatok.fr" >> %LOGFILE% 2>&1
git config user.name "YllaTok Deploy" >> %LOGFILE% 2>&1

:: Ajouter le remote
git remote add origin https://github.com/sbabou11/festylla.git >> %LOGFILE% 2>&1
echo  Code remote add : %errorlevel% >> %LOGFILE%

:: Verifier remote
echo  Remote configure : >> %LOGFILE%
git remote -v >> %LOGFILE% 2>&1

:: Ajouter tous les fichiers
git add -A >> %LOGFILE% 2>&1
echo  Code add : %errorlevel% >> %LOGFILE%

:: Commit
git commit -m "YllaTok deploiement %date%" >> %LOGFILE% 2>&1
echo  Code commit : %errorlevel% >> %LOGFILE%

:: Renommer en main
git branch -M main >> %LOGFILE% 2>&1
echo  Code branch : %errorlevel% >> %LOGFILE%

:: Push
echo  Push en cours... >> %LOGFILE%
git push origin main --force >> %LOGFILE% 2>&1
set PUSH_CODE=%errorlevel%
echo  Code push : %PUSH_CODE% >> %LOGFILE%

if %PUSH_CODE% neq 0 (
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

echo  PUSH REUSSI >> %LOGFILE%
echo  OK

:: === 5. Resume ===
echo DEPLOIEMENT REUSSI >> %LOGFILE%
echo.
echo  ==========================================
echo   Deploiement reussi !
echo  ==========================================
echo.
echo   GitHub : mis a jour
echo   Vercel : redeploiement en cours (2 min)
echo   Log    : deploy-log.txt
echo.
pause
