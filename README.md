# YllaTok — Système de paiement festival

Application PWA (Progressive Web App) de paiement cashless pour festivals,
avec QR codes, réservations, gestion du staff et Studio de personnalisation.

---

## Stack technique

| Couche        | Technologie                                  |
|---------------|----------------------------------------------|
| Frontend      | React 18 + Vite                              |
| État global   | Zustand (avec persistence locale)            |
| Styles        | CSS variables custom + Tailwind utilitaires  |
| QR Code       | qrcode.react (génération) + html5-qrcode (scan) |
| Offline       | PWA (Vite PWA plugin) + Service Worker       |
| Base locale   | Dexie.js (IndexedDB) pour queue offline      |
| Icons         | Lucide React                                 |

---

## Installation

```bash
# Cloner le repo
git clone https://github.com/votre-org/yllatok.git
cd yllatok

# Installer les dépendances
npm install

# Lancer en développement
npm run dev

# Build production
npm run build

# Prévisualiser le build
npm run preview
```

---

## Structure du projet

```
src/
├── components/          # Composants réutilisables
│   ├── Avatar.jsx       # Photo de profil avec upload
│   ├── QrCode.jsx       # QR code thémé avec logo optionnel
│   ├── Sidebar.jsx      # Navigation latérale
│   └── Studio.jsx       # Panneau de personnalisation admin
│
├── hooks/
│   ├── useOffline.js    # Détection réseau + sync
│   └── useTheme.js      # Application du thème au DOM
│
├── pages/
│   ├── admin/           # Dashboard, Réservations, Spectateurs...
│   ├── billetterie/     # Crédit, Nouveau QR
│   ├── stand/           # Retrait, Encaissement
│   ├── spectateur/      # QR perso, Solde, Carte, Réservations
│   └── shared/          # Profil (commun à tous)
│
├── store/
│   └── useAppStore.js   # Store Zustand centralisé
│
├── utils/
│   └── helpers.js       # Formatage, constantes, permissions
│
├── App.jsx              # Layout shell + routing
├── main.jsx             # Point d'entrée React
└── index.css            # Variables CSS + reset
```

---

## Rôles et permissions

| Rôle          | Créditer | Débiter | Retrait | Rapports | Menu | Staff |
|---------------|----------|---------|---------|----------|------|-------|
| `admin`       | ✅        | ✅       | ✅       | ✅        | ✅    | ✅     |
| `billetterie` | ✅        | ❌       | ❌       | ❌        | ❌    | ❌     |
| `stand`       | ❌        | ✅       | ✅       | ❌        | ❌    | ❌     |
| `consultation`| ❌        | ❌       | ❌       | ✅        | ❌    | ❌     |

---

## Flux de réservation

```
Spectateur                  Stand / Admin
─────────                   ─────────────
Carte → sélectionner items
→ Confirmer réservation     Admin → "Marquer prêt"
→ Reçoit un code #XXXX

Se présente au stand
→ Scan QR / code            Stand → Valider retrait
                            → Débit automatique du solde
```

---

## Synchronisation offline

L'application fonctionne **sans réseau** grâce à :
- **Service Worker** (PWA) : cache des assets et pages
- **File d'attente locale** : les transactions sont stockées dans
  `offlineQueue` (Zustand) et synchronisées au retour du réseau
- **Détection automatique** : l'événement `online`/`offline` du navigateur
  déclenche la synchronisation

En production, remplacer `offlineQueue` par une vraie API REST avec
un mécanisme de reconciliation (timestamps + idempotency keys).

---

## Studio de personnalisation

Accessible depuis l'interface **Admin > bouton Studio**.

Permet de personnaliser en temps réel :
- **Identité** : nom du festival, logo
- **Couleurs** : 5 couleurs clés (principale, secondaire, fonds, texte)
- **Typographie** : 8 polices disponibles, taille de base, rayon des coins
- **QR Code** : couleur, fond, logo centré
- **Bannière** : image d'en-tête du dashboard
- **Thèmes prédéfinis** : Festif, Soleil, Nuit, Mer, Rock, Nature

Toutes les modifications s'appliquent via des **CSS custom properties**
sur `:root`, sans rechargement de page.

---

## Intégration API backend (production)

Remplacer les données mockées du store par des appels API :

```js
// Exemple avec fetch
const crediter = async (specId, montant) => {
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'credit', specId, montant })
  })
  if (!res.ok) throw new Error('Échec transaction')
  return res.json()
}
```

**Endpoints suggérés :**
- `GET  /api/spectateurs` — liste
- `POST /api/spectateurs` — créer
- `POST /api/transactions` — crédit / débit
- `GET  /api/reservations` — liste
- `POST /api/reservations` — créer
- `PATCH /api/reservations/:id` — changer statut
- `GET  /api/menu` — carte
- `GET  /api/staff` — équipe

---

## Déploiement

### Vercel / Netlify
```bash
npm run build
# Déployer le dossier dist/
```

### Docker
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

---

## Licence

MIT — YllaTok 2026
