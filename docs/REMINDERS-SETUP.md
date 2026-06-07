# Configuration des rappels artistes (balance + prestation)

Ce système envoie automatiquement des notifications push aux artistes :
- **15 minutes** avant leur balance
- **5 minutes** avant leur balance
- **15 minutes** avant leur prestation
- **5 minutes** avant leur prestation

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│ GitHub Actions  │ ───1───▶│  Vercel endpoint │ ───2───▶│ Firebase Cloud  │
│   (cron 1min)   │         │ /api/process-... │         │   Messaging     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                       │                          │
                                       │ 3                        │ 4
                                       ▼                          ▼
                            ┌──────────────────┐         ┌─────────────────┐
                            │   Firestore      │         │  Téléphones    │
                            │ scheduled-       │         │  des artistes  │
                            │ reminders        │         │                 │
                            └──────────────────┘         └─────────────────┘
```

1. GitHub Actions ping `/api/process-reminders` toutes les minutes
2. L'endpoint Vercel scanne les rappels dus
3. Pour chaque rappel : récupère les tokens FCM de l'artiste depuis Firestore
4. Envoie le push via Firebase Cloud Messaging au téléphone de l'artiste

## Configuration requise (étapes one-shot)

### Étape 1 : Variable d'environnement Vercel

En plus de `FIREBASE_SERVICE_ACCOUNT` (déjà configurée pour les notifs push), il faut :

- `CRON_SECRET` : une chaîne secrète aléatoire (32 caractères suffisent)

**Pour la générer** (terminal ou tout générateur de mots de passe) :
```bash
openssl rand -hex 32
```
→ donne quelque chose comme `a3f5b8c9...d2e1`

**Sur Vercel** :
1. Dashboard → projet YllaCash → Settings → Environment Variables
2. Add New :
   - Key : `CRON_SECRET`
   - Value : la chaîne générée
   - Environments : cochez les 3 (Production, Preview, Development)
3. Save

### Étape 2 : Secrets GitHub (Actions)

Sur GitHub, dans le repo du projet :
1. Settings → Secrets and variables → Actions
2. New repository secret :
   - **Nom** : `REMINDERS_URL`
   - **Value** : `https://VOTRE-DOMAINE.vercel.app/api/process-reminders`
   (remplacer VOTRE-DOMAINE par le vrai)
3. New repository secret :
   - **Nom** : `CRON_SECRET`
   - **Value** : la **même** chaîne qu'à l'étape 1

### Étape 3 : Redéployer Vercel

Les variables d'environnement ne s'appliquent qu'aux nouveaux déploiements.
1. Vercel → Deployments → ⋯ → Redeploy (sans cache)

### Étape 4 : Activer le workflow GitHub Actions

Le fichier `.github/workflows/cron-reminders.yml` doit être commité dans le repo.

GitHub Actions activera automatiquement le cron une fois ce fichier mergé sur la branche principale.

## Tests

### Test manuel de l'endpoint

```bash
# Depuis votre machine
curl -H "x-cron-secret: VOTRE_SECRET" https://VOTRE-DOMAINE.vercel.app/api/process-reminders
```

Réponse attendue (exemple) :
```json
{
  "startedAt": "2026-05-20T18:30:00.000Z",
  "events": 2,
  "remindersFound": 1,
  "remindersSent": 1,
  "errors": [],
  "finishedAt": "2026-05-20T18:30:01.234Z"
}
```

### Test du workflow GitHub Actions

1. Aller sur le repo GitHub → onglet **Actions**
2. Cliquer sur "Process Artist Reminders" dans la liste de gauche
3. Cliquer "Run workflow" (en haut à droite) → "Run workflow"
4. Le job démarre. Cliquer dessus pour voir les logs en temps réel.

Le statut **doit être vert** ✅ avec un message du type :
```
✅ Reminders processed successfully
```

### Test bout-en-bout (utilisateur)

1. Dans l'admin Planning, créer un créneau pour un artiste avec :
   - Balance à 10 minutes dans le futur
   - Prestation à 30 minutes dans le futur
2. L'artiste doit avoir activé les notifications push sur son téléphone (voir EspaceArtiste)
3. Au bout de 5 minutes, l'artiste doit recevoir la notif "⏰ Balance dans 5 min"
4. À l'heure de la balance moins 0 minutes, il reçoit "Balance dans 5 min" → puis rien jusqu'à la prestation
5. À 25 min, il reçoit "Prestation dans 5 min"

## Limites connues et précautions

### Latence

Le cron GitHub Actions a un **décalage de 1 à 3 minutes** en pratique. C'est inhérent à GitHub (le scheduler n'est pas garanti à la seconde près).

**Implication** : un rappel "15 minutes avant" peut arriver entre 12 et 16 minutes avant. Un rappel "5 minutes avant" peut arriver entre 2 et 6 minutes avant.

C'est acceptable pour des rappels artistes mais à connaître.

### Notifications iOS

Sur iOS, l'artiste **doit avoir installé l'app en PWA** (ouverte dans Safari → Partager → "Sur l'écran d'accueil"). Sans ça, Apple bloque toutes les notifications push.

### Téléphone en silencieux / mode avion

Si l'artiste a son téléphone en silencieux, le son ne se déclenchera pas — c'est le système qui gère ce paramètre, pas notre code.

### App fermée depuis longtemps

Sur Android, certaines surcouches constructeurs (Xiaomi, Huawei sans Play Services) "tuent" les apps en arrière-plan et bloquent les notifications. Les artistes utilisant ces téléphones peuvent recevoir les rappels avec du retard ou pas du tout. **Recommandation** : leur dire d'ouvrir l'app au moins une fois le matin du jour J.

### Coût

- **Vercel** : appels à `/api/process-reminders` toutes les minutes = 1440/jour = ~43 000/mois.
  Plan Hobby autorise 100 000 invocations Functions/mois → **OK gratuit** (largement).
- **Firebase** : ~4 lectures Firestore par minute (events + reminders) = ~175 000 lectures/mois.
  Quota gratuit : 50 000 lectures/jour = 1,5M/mois → **OK gratuit**.
- **GitHub Actions** : ~2 sec par cron × 43 000 runs = 24 minutes de compute/mois.
  Quota gratuit (repo privé) : 2 000 min/mois → **OK gratuit**.

**Aucun surcoût attendu** pour un festival de taille normale.

## Maintenance

### Si vous voulez désactiver temporairement les rappels

Option 1 : Dans GitHub, allez sur Actions → Process Artist Reminders → cliquez "Disable workflow" (en haut à droite).

Option 2 : Supprimez la variable `REMINDERS_URL` côté GitHub Secrets — le workflow échouera proprement sans rien envoyer.

### Si vous voulez voir les logs

- **Vercel** : Dashboard → projet → Logs (filtrer par `/api/process-reminders`)
- **GitHub** : Actions → Process Artist Reminders → cliquer un run pour voir ses logs
