#!/bin/bash
# YllaTok - Deploy (Bash)
# Usage : bash deploy.sh
# Compatible Linux, macOS et Termux (Android)

LOGFILE="deploy-log.txt"
REPO="https://github.com/sbabou11/festylla.git"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# Détection Termux : pas de "read" interactif final (Termux ferme la fenêtre directement)
IS_TERMUX=0
[ -n "$PREFIX" ] && [ -d "$PREFIX/lib" ] && [ -d "/data/data/com.termux" ] && IS_TERMUX=1

ok()   { echo -e "${GREEN}  OK${NC}"; echo "  OK" >> "$LOGFILE"; }
fail() {
  echo -e "${RED}  ERREUR : $1${NC}"
  echo "ERREUR : $1" >> "$LOGFILE"
  echo ""
  cat "$LOGFILE"
  [ "$IS_TERMUX" -eq 0 ] && read -p "Entree..."
  exit 1
}

echo "YllaTok - Deploiement" > "$LOGFILE"
echo "Date : $(date '+%d/%m/%Y %H:%M:%S')" >> "$LOGFILE"
[ "$IS_TERMUX" -eq 1 ] && echo "Environnement : Termux (Android)" >> "$LOGFILE"
echo "" >> "$LOGFILE"

echo -e "\n${BLUE}  YllaTok - Script de deploiement${NC}\n"
[ "$IS_TERMUX" -eq 1 ] && echo -e "  ${BLUE}[Mode Termux/Android detecte]${NC}\n"

# 0. Nettoyage des anciens api/*.cjs obsoletes
# Les endpoints sont retournes en .js (avec api/package.json type:commonjs).
# Si des .cjs trainent encore, ils peuvent confondre le routage Vercel.
echo -e "${YELLOW}[0/5] Nettoyage anciens api/*.cjs obsoletes...${NC}"
echo "[0/5] Cleanup api/*.cjs obsoletes" >> "$LOGFILE"
OBSOLETE_API_FILES=(
  "api/audit.cjs"
  "api/cachets.cjs"
  "api/comptabilite.cjs"
  "api/process-reminders.cjs"
  "api/rapport.cjs"
  "api/send-push.cjs"
  "api/transactions.cjs"
)
REMOVED=0
for f in "${OBSOLETE_API_FILES[@]}"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "  Supprime: $f" >> "$LOGFILE"
    REMOVED=$((REMOVED + 1))
  fi
done
if [ $REMOVED -gt 0 ]; then
  echo -e "  ${GREEN}$REMOVED fichier(s) obsolete(s) supprime(s)${NC}"
  echo "  Total supprime: $REMOVED" >> "$LOGFILE"
else
  echo "  Aucun fichier obsolete trouve (deja propre)"
  echo "  Rien a nettoyer" >> "$LOGFILE"
fi
ok

# 1. .env.local
echo -e "\n${YELLOW}[1/5] Creation .env.local...${NC}"
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

# 4. Git - repart de zero a chaque fois
echo -e "\n${YELLOW}[4/5] Envoi sur GitHub...${NC}"
echo "[4/5] Git" >> "$LOGFILE"
git --version >> "$LOGFILE" 2>&1

# Supprimer .git et repartir proprement
echo "  Reinitialisation git..." >> "$LOGFILE"
rm -rf .git >> "$LOGFILE" 2>&1
echo "  rmdir code : $?" >> "$LOGFILE"

git init >> "$LOGFILE" 2>&1
echo "  init code : $?" >> "$LOGFILE"

git config user.email "deploy@yllatok.fr" >> "$LOGFILE" 2>&1
git config user.name "YllaTok Deploy" >> "$LOGFILE" 2>&1

git remote add origin "$REPO" >> "$LOGFILE" 2>&1
echo "  remote add code : $?" >> "$LOGFILE"

echo "  Remote :" >> "$LOGFILE"
git remote -v >> "$LOGFILE" 2>&1

git add -A >> "$LOGFILE" 2>&1
echo "  add code : $?" >> "$LOGFILE"

git commit -m "YllaTok deploiement $(date '+%d/%m/%Y %H:%M')" >> "$LOGFILE" 2>&1
echo "  commit code : $?" >> "$LOGFILE"

git branch -M main >> "$LOGFILE" 2>&1
echo "  branch code : $?" >> "$LOGFILE"

git push origin main --force >> "$LOGFILE" 2>&1
PUSH=$?
echo "  push code : $PUSH" >> "$LOGFILE"

[ $PUSH -ne 0 ] && fail "Push echoue — consultez deploy-log.txt"
echo "  PUSH REUSSI" >> "$LOGFILE"
ok

# 5. Resume
echo "DEPLOIEMENT REUSSI" >> "$LOGFILE"
echo -e "\n${GREEN}  Deploiement reussi !${NC}"
echo -e "  GitHub mis a jour | Vercel redeploie dans 2 min\n"
[ "$IS_TERMUX" -eq 0 ] && read -p "  Entree pour fermer..."
