#!/bin/bash
# YllaCash - Deploy (Bash)
# Usage : bash deploy.sh

LOGFILE="deploy-log.txt"
REPO="https://github.com/sbabou11/festylla.git"
BRANCH="main"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  OK${NC}"; echo "  OK" >> "$LOGFILE"; }
fail() { echo -e "${RED}  ERREUR : $1${NC}"; echo "ERREUR : $1" >> "$LOGFILE"; echo ""; cat "$LOGFILE"; read -p "Entree..."; exit 1; }

echo "YllaCash - Deploiement" > "$LOGFILE"
echo "Date : $(date '+%d/%m/%Y %H:%M:%S')" >> "$LOGFILE"
echo "" >> "$LOGFILE"

echo -e "\n${BLUE}  YllaCash - Script de deploiement${NC}\n"

# 0. Le build du service worker (Workbox) echoue si le chemin contient une apostrophe
case "$PWD" in
  *"'"*) fail "le chemin du dossier contient une apostrophe ($PWD). Renommez-le, par exemple \"YllaCash 2.0\"." ;;
esac

# 1. .env.local
echo -e "${YELLOW}[1/5] Creation .env.local...${NC}"
echo "[1/5] .env.local" >> "$LOGFILE"
cat > .env.local << 'ENV'
VITE_FIREBASE_API_KEY=AIzaSyDqQnyzjXYmTWZrvXHkGbhPrCrIuG_lu-A
VITE_FIREBASE_AUTH_DOMAIN=yllatok.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=yllatok
VITE_FIREBASE_STORAGE_BUCKET=yllatok.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=850586788991
VITE_FIREBASE_APP_ID=1:850586788991:web:37b3df23b5e6b60744cb4a
ENV
ok

# 2. npm install
echo -e "\n${YELLOW}[2/5] npm install...${NC}"
echo "[2/5] npm install" >> "$LOGFILE"
npm install >> "$LOGFILE" 2>&1 || fail "npm install"
ok

# 3. Build
echo -e "\n${YELLOW}[3/5] Build production...${NC}"
echo "[3/5] build" >> "$LOGFILE"
npm run build >> "$LOGFILE" 2>&1 || fail "Build"
ok

# 4. Git - on garde l'historique, on ajoute un commit et on pousse
echo -e "\n${YELLOW}[4/5] Envoi sur GitHub...${NC}"
echo "[4/5] Git" >> "$LOGFILE"
git --version >> "$LOGFILE" 2>&1

# Premier lancement seulement : creer le depot
[ -d .git ] || git init -b "$BRANCH" >> "$LOGFILE" 2>&1

# Remote "origin" : l'ajouter s'il manque, sinon s'assurer de son adresse
if git remote get-url origin > /dev/null 2>&1; then
  git remote set-url origin "$REPO" >> "$LOGFILE" 2>&1
else
  git remote add origin "$REPO" >> "$LOGFILE" 2>&1
fi
git remote -v >> "$LOGFILE" 2>&1

# Identite git : seulement si aucune n'est configuree (ne pas ecraser la votre)
git config user.email > /dev/null || git config user.email "deploy@yllatok.fr"
git config user.name  > /dev/null || git config user.name "YllaCash Deploy"

# Le deploiement part toujours de la branche main
CURRENT=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ "$CURRENT" = "$BRANCH" ] || fail "vous etes sur la branche \"$CURRENT\", pas \"$BRANCH\". Faites : git checkout $BRANCH"

# Commit des changements en cours (s'il y en a)
git add -A >> "$LOGFILE" 2>&1
if git diff --cached --quiet; then
  echo "  Aucun changement a committer" >> "$LOGFILE"
else
  git commit -m "Deploiement YllaCash $(date '+%d/%m/%Y %H:%M')" >> "$LOGFILE" 2>&1
  echo "  Commit cree" >> "$LOGFILE"
fi

# Push normal (sans --force)
if ! git push -u origin "$BRANCH" >> "$LOGFILE" 2>&1; then
  # Push refuse : en general parce que GitHub a encore l'ancien historique
  # cree par l'ancienne version de ce script (qui repartait de zero a chaque fois)
  echo -e "\n${YELLOW}  GitHub a refuse l'envoi.${NC}"
  echo "  Cause la plus probable : GitHub contient l'ancien historique"
  echo "  (l'ancien script effacait .git a chaque deploiement)."
  git fetch origin >> "$LOGFILE" 2>&1
  read -p "  Remplacer l'historique GitHub par l'historique local ? (O/N) : " CONFIRM
  [ "$CONFIRM" = "O" ] || [ "$CONFIRM" = "o" ] || fail "Push annule"
  echo "  Push force (confirme par l'utilisateur)" >> "$LOGFILE"
  git push -u --force-with-lease origin "$BRANCH" >> "$LOGFILE" 2>&1 || fail "Push echoue — consultez deploy-log.txt"
fi
echo "  PUSH REUSSI" >> "$LOGFILE"
ok

# 5. Resume
echo "DEPLOIEMENT REUSSI" >> "$LOGFILE"
echo -e "\n${GREEN}  Deploiement reussi !${NC}"
echo -e "  GitHub mis a jour (historique conserve) | Vercel redeploie dans 2 min\n"
read -p "  Entree pour fermer..."
