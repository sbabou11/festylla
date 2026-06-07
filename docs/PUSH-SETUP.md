# Configuration des notifications push — Guide pas à pas

Ce guide explique comment activer les **vraies notifications push** (qui marchent même app fermée / téléphone verrouillé) pour YllaCash v8 debug.

**Temps total : ~10 minutes.**

---

## Vue d'ensemble

Le système utilise :
1. **Firebase Cloud Messaging** (FCM) pour distribuer les notifs aux appareils
2. Une **clé de service Firebase** (côté backend) pour autoriser les envois
3. Une **Vercel Function** `/api/send-push` qui reçoit les appels du frontend et fait l'envoi via FCM

Tout est déjà codé. Il vous reste **3 choses à faire** :

1. Générer la clé de service Firebase (1 fois, jamais à refaire)
2. La copier dans une variable d'environnement Vercel
3. Redéployer

---

## Étape 1 — Générer la clé de service Firebase

1. Ouvrez la **Console Firebase** : https://console.firebase.google.com
2. Choisissez votre projet **`yllatok`**
3. Cliquez sur l'icône ⚙️ en haut à gauche (à côté de "Project Overview") → **Paramètres du projet**
4. Allez dans l'onglet **Comptes de service**
5. Section "SDK Admin Firebase" → assurez-vous que **Node.js** est sélectionné
6. Cliquez sur **Générer une nouvelle clé privée**
7. Un fichier JSON se télécharge. Il ressemble à :

```json
{
  "type": "service_account",
  "project_id": "yllatok",
  "private_key_id": "abc123…",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@yllatok.iam.gserviceaccount.com",
  "client_id": "...",
  ...
}
```

⚠️ **Ce fichier est ultra-sensible** : il donne un accès admin complet à votre projet Firebase. **Ne le commitez jamais dans Git, ne le partagez jamais publiquement.**

---

## Étape 2 — Configurer la variable d'environnement Vercel

1. Ouvrez le **Dashboard Vercel** : https://vercel.com/dashboard
2. Sélectionnez votre projet YllaCash
3. Allez dans **Settings** → **Environment Variables**
4. Cliquez sur **Add New**
5. Remplissez :
 - **Key** : `FIREBASE_SERVICE_ACCOUNT`
 - **Value** : **Copiez-collez TOUT le contenu du fichier JSON** téléchargé à l'étape 1 (en une seule ligne, ou multi-ligne, Vercel accepte les deux)
 - **Environments** : cochez les trois (Production, Preview, Development)
6. Cliquez sur **Save**

### Astuce pour le copier-coller

Le JSON contient un champ `private_key` avec des sauts de ligne `\n` littéraux. **Conservez-les tels quels** dans Vercel (ne les transformez pas en vrais sauts de ligne). Le backend (`api/send-push.js`) sait les reconvertir au runtime.

---

## Étape 3 — Redéployer

1. Toujours dans Vercel, allez dans **Deployments**
2. Sur le dernier déploiement, cliquez sur **…** → **Redeploy** → décochez "Use existing build cache" → **Redeploy**

Le nouveau déploiement aura accès à la variable d'environnement.

---

## Étape 4 — Tester

1. Ouvrez votre app YllaCash sur un appareil (laptop ou téléphone Android, **pas iOS Safari classique** — voir limites plus bas)
2. Connectez-vous en tant qu'admin
3. Allez dans **Réglages**
4. En haut de la page : vous voyez le **panneau de diagnostic des notifications push**
5. Vérifiez que toutes les pastilles sont vertes :
 - Support navigateur : ✓
 - Permission : ✓
 - Token FCM : ✓ (avec un préfixe affiché)
6. Cliquez sur **"Envoyer une notification de test"**
7. Vous devriez recevoir une notification système d'ici 1 à 3 secondes

Si la notification arrive : **✓ tout fonctionne.** À partir de maintenant, **toutes les notifications** créées dans l'app (réservations, alertes, demandes de réinitialisation, etc.) déclencheront aussi de vraies push.

---

## Limites par plateforme

| Plateforme | Push | Conditions |
|---|---|---|
| **Chrome / Edge Desktop** | ✓ | Permission accordée |
| **Chrome Android** | ✓ | Permission accordée |
| **Firefox Desktop** | ✓ | Permission accordée |
| **Firefox Android** | ✗ | Mozilla a retiré le support en 2024 |
| **Safari Desktop (macOS 13+)** | ✓ | Permission accordée |
| **Safari iOS / iPadOS 16.4+** | ✓ | **Uniquement en mode PWA installée** sur l'écran d'accueil |
| **EMUI (Huawei sans Google)** | ✓ | Avec Chromium-based browser ; les téléphones Huawei récents sans Google Services peuvent avoir des restrictions supplémentaires côté OS |

### Pour iOS

Vos utilisateurs iOS doivent **installer l'app sur leur écran d'accueil** :
1. Ouvrir Safari sur YllaCash
2. Bouton **Partager** (carré + flèche, en bas)
3. **Sur l'écran d'accueil**
4. Valider

Une fois installée, ils ouvrent l'app depuis l'icône et les notifications fonctionnent. Le panneau de diagnostic affiche un message d'aide explicite quand il détecte un iPhone non-PWA.

---

## Sécurité — bonnes pratiques

1. **Ne committez jamais** le fichier de service Firebase dans Git. Il est seulement dans Vercel comme variable d'environnement.
2. **Rotation périodique** : tous les 12-24 mois, générez une nouvelle clé et révoquez l'ancienne dans la console Firebase (Paramètres → Comptes de service → ⋮ → Supprimer la clé).
3. **Quotas FCM** : Firebase autorise plusieurs millions de notifications par jour gratuitement. Vous ne devriez jamais atteindre les limites.

---

## Dépannage

### "FIREBASE_SERVICE_ACCOUNT env var manquante"
→ La variable n'est pas dans Vercel. Refaites l'étape 2.

### "n'est pas un JSON valide"
→ Vous avez probablement coupé une partie du JSON en collant. Refaites l'étape 2 en copiant **tout** le fichier (de `{` à `}`).

### Le test fonctionne mais les notifications "normales" n'arrivent pas
→ Vérifiez :
- Les autres staff ont-ils aussi accordé la permission ? (Chacun doit voir une pastille verte dans son propre panneau de diagnostic)
- Leur token FCM est-il bien dans Firestore ? Vérifiez `events/{id}/staff/{userId}` → champ `fcmTokens` doit contenir un tableau non vide

### Sur iPhone, rien ne se passe
→ L'utilisateur a-t-il installé l'app en PWA sur l'écran d'accueil ? Le panneau de diagnostic indique le statut.

### Les notifications arrivent en double
→ Vérifiez qu'il n'y a pas plusieurs onglets de l'app ouverts sur le même appareil. Sinon, c'est probablement que l'utilisateur a accordé la permission depuis deux navigateurs différents — c'est normal, chaque navigateur a son propre token.

---

Le système est conçu pour être robuste : si l'envoi FCM échoue (pas de réseau, token mort, etc.), la notification est **toujours créée dans Firestore** comme avant. Les clients ouverts la verront, même sans FCM. La push est un bonus pour rattraper les clients fermés.
