# Ylla Event Manager ↔ YllaCash : règle d'échange

Version 1.2 du 24/11/2026 : créneaux des postes à rôle pour les bénévoles (§3.2). Version 1.1 du 18/11/2026. La 1.0 a été **validée par l'organisateur** (les quatre points du §8) ; la 1.1 ajoute au programme le type, la photo, la présentation et les liens de l'artiste (§3.1, option B choisie par l'organisateur le 18/11/2026), et le format du retour vers Event Manager (§7, validé le même jour).

Avancement : Event Manager sert l'instantané (commit 7ff66af, détail dans `EventManager/docs/api-yllacash.md`). YllaCash le lit (lot A : `api/_em/`, copie dans `em-instantanes/{événement}`, réservée au serveur, état dans la fenêtre « Liaisons »). Lot B : le programme lu est publié dans `events/{événement}/programme-em` (lecture publique) et remplace le planning de YllaCash dans l'espace spectateur et sur `/live` dès que `events/{événement}.emProgramme` existe. Lot C : bénévoles et artistes publiés dans `events/{événement}/benevoles/em-…` et `artistes/em-…` (`emEquipe` sur l'événement) ; droits par journée (coupure à 6 h, non reportés), contrôle des billets les jours envoyés, accès par lien personnel ; articles des artistes choisis dans YllaCash (`settings/artistes.articles`) ; pages Bénévoles et Artistes en lecture. Lot D : pour un événement relié, Planning, Cachets, Exposants, Finances et l'éditeur de factures sont masqués (`src/em/pages.js`), « Gestion artistes » devient « Artistes » ; rien n'est effacé, les archives et événements non reliés gardent tout. Retour (§7) : YllaCash envoie consommations et bilan (`api/_em/retour.js`, `envoiRetour.js`, appelés par la tâche de `api/process-entrees.js` ; état dans `liaisons-em/{événement}.retour`), pour les événements dont l'équipe vient d'Event Manager ; Event Manager doit encore accepter ces messages.

## 1. Le partage des rôles (décidé par l'organisateur le 18/11/2026)

| Sujet | YllaCash | Ylla Event Manager |
|---|---|---|
| Entrée | Contrôle des billets | — |
| Argent sur place | Recharges, crédits, remboursements, achats aux stands, borne, cuisine, écran public, clôture de caisse, statistiques financières | — |
| Artistes | Avantages (boissons, repas, eau offerts) et espace artiste pour les commander | Candidatures, contrats, cachets, défraiements, décharges, factures, programmation |
| Bénévoles | Consommations (repas, boissons, eau) et contrôle des billets | Inscription, planning, postes, créneaux, pointage, droits accordés |
| Exposants | — | Tout |
| Programme | Onglet « Programme » de l'espace spectateur, lu depuis Event Manager | Saisie et gestion |
| Données 2026 | Gardées dans l'archive de l'édition, sans reprise | — |

**Event Manager est la référence** pour le programme, les artistes et les bénévoles. YllaCash n'en garde qu'une copie de lecture, mise à jour automatiquement, et n'y saisit plus rien.

## 2. Principe : YllaCash lit un instantané

Event Manager n'a aujourd'hui ni envoi sortant ni file d'attente. Plutôt que d'en créer, **YllaCash vient lire** une adresse d'Event Manager qui renvoie l'état complet de l'événement :

`GET https://gestion.maisonylla.com/api/public/yllacash` — en-têtes `Authorization: Bearer <clé>` et `x-ylla: 1`.

- **La clé est celle qui existe déjà** pour l'envoi des entrées : clé Event Manager de type `yllacash`, créée sur l'événement, saisie dans la fenêtre « Liaisons » de YllaCash. Elle désigne l'événement ; elle autorise désormais `entree` (envoi) **et** la lecture de cet instantané.
- **Instantané complet** à chaque lecture : pas de file, pas d'ordre, pas de doublon. YllaCash remplace sa copie par ce qu'il reçoit (un élément absent de l'instantané est retiré de YllaCash).
- **Rythme** : YllaCash relit toutes les 5 minutes (tâche automatique qui tourne déjà chaque minute), et à la demande par un bouton « Actualiser » dans « Liaisons ».
- **Économie** : la réponse porte une `version` (empreinte du contenu). YllaCash l'envoie dans `If-None-Match` ; si rien n'a changé, Event Manager répond `304` sans contenu.
- **Pannes** : si Event Manager ne répond pas, YllaCash garde sa dernière copie (le festival continue) et réessaie au tour suivant. `401`/`403` : clé à vérifier, signalé dans « Liaisons ».

## 3. Contenu de l'instantané

```json
{
  "version": "<empreinte du contenu>",
  "genere": "2027-05-15T14:02:00+02:00",
  "evenement": { "nom": "Fest'Ylla 2027", "jours": ["2027-05-15", "2027-05-16"] },
  "programme": [
    { "id": "p12", "jour": "2027-05-15", "debut": "20:30", "fin": "21:30", "scene": "Grande scène",
      "titre": "Concert", "artiste": "Awa Exemple" }
  ],
  "artistes": [
    { "id": "a7", "nom": "Awa Exemple", "statut": "confirme",
      "jours": ["2027-05-15"],
      "avantages": [ { "jour": "2027-05-15", "repas": 2, "boissons": 4, "eau": 4 } ] }
  ],
  "benevoles": [
    { "id": "u31", "prenom": "Malik", "nom": "Exemple",
      "droits": [ { "jour": "2027-05-15", "repas": 1, "boissons": 2, "eau": 3 } ],
      "controleBillets": ["2027-05-15"] }
  ]
}
```

- **programme** : uniquement ce qui est public. Ni cachet, ni contact, ni note interne. Voir aussi §3.1.
- **artistes** : seulement ceux qui ont des avantages (statut `confirme` ou `contrat`). Ni cachet, ni contrat, ni contact.
- **benevoles** : seulement ceux qui ont des droits ou un contrôle des billets. Ni téléphone, ni e-mail, ni compétences.
- **controleBillets** : les jours où le bénévole est affecté à un poste marqué « contrôle les billets ». Il remplace le réglage `controleBillets` des postes de YllaCash (règle billetterie §3.4, à mettre à jour).
- Jours au format `AAAA-MM-JJ`, heures `HH:MM`, heure de Paris.

### 3.1 Programme : champs ajoutés en version 1.1

Pour garder l'écran du programme tel qu'il est aujourd'hui (filtres par type, photo, fiche de l'artiste), chaque passage du programme porte en plus :

```json
{ "id": "p12", "jour": "2027-05-15", "debut": "20:30", "fin": "21:30", "scene": "Grande scène",
  "titre": "Concert", "artiste": "Awa Exemple",
  "type": "musical",
  "photo": "https://gestion.maisonylla.com/…/awa.jpg",
  "presentation": "Chanteuse et guitariste, entre folk et musiques mandingues.",
  "liens": { "instagram": "https://instagram.com/…", "site": "https://…" } }
```

- **type** : `musical`, `litteraire`, `cinematographique` ou `autre` (par défaut `autre`).
- **photo** : adresse `https://` d'une image **publique** (lisible sans clé par le téléphone des spectateurs), ou `""`. 1 200 px au plus de préférence.
- **presentation** : texte public, 600 caractères au plus, ou `""`.
- **liens** : liens publics de l'artiste, seulement en `https://`, parmi `spotify`, `instagram`, `facebook`, `tiktok`, `youtube`, `site`. Les liens vides sont omis.
- Ces champs sont facultatifs : sans eux, YllaCash affiche le passage avec une icône neutre.

### 3.2 Bénévoles : créneaux des postes à rôle, version 1.2 (validée le 24/11/2026)

Proposée par YllaCash le 23/11/2026 (refonte des rôles, écran 11), validée par l'organisateur côté Event Manager le 24/11/2026 et codée dans Event Manager (pas encore en ligne au 24/11/2026). Miroir : `EventManager/docs/api-yllacash.md`. Champ **ajouté**, rien n'est retiré.

Chaque élément de `benevoles[]` porte :

```json
"creneaux": [ { "jour": "2027-05-15", "debut": "12:35", "fin": "15:35", "poste": "Contrôle à l'entrée", "role": "controle_entree" } ]
```

- **Postes à rôle** : dans Event Manager, chaque poste a un réglage « Rôle YllaCash ouvert par ce poste » (Aucun, Billetterie, Contrôle entrée, Consultation). Seuls les créneaux des postes qui ont un rôle partent, **passés compris**, rangés par jour puis par heure.
- **role** : `billetterie`, `controle_entree` ou `consultation`, jamais autre chose. Il est réglé par poste : identique pour tous les créneaux d'un même poste. **Seul `role` fait foi** ; `poste` est un libellé d'affichage, jamais une clé.
- **Créneau incomplet** : il part avec `debut` et `fin` à `null`. `jour` reste renseigné s'il est connu, `null` seulement si le créneau n'a pas de jour. Pour YllaCash : `debut` à `null` = horaire manquant ; l'onglet reste fermé avec « Créneau sans horaire dans Event Manager : demandez à l'organisation de le compléter » (Event Manager signale aussi ces créneaux à l'organisateur, dans la fenêtre du poste).
- **Minuit** : une `fin` plus tôt que `debut` est le lendemain de `jour`.
- **Bénévole sans droits** : un bénévole qui n'a qu'un créneau sur un poste à rôle figure dans `benevoles` (avec `droits: []` et `controleBillets: []`).
- **controleBillets** : inchangé, déduit du rôle `controle_entree` (les postes déjà cochés « contrôle les billets » ont été convertis) ; YllaCash s'appuie sur `creneaux` dès qu'il est présent.
- **version** change dès qu'un créneau, un poste, un rôle ou une inscription change.
- **Ce qui reste dans YllaCash** : quel bénévole a quel rôle (fiche, réglé par un admin), son identifiant et son mot de passe. Un créneau n'ouvre l'onglet que si son `role` est celui de la fiche ; les autres sont ignorés.
- **Achats des bénévoles sur leur solde** (écran 13) : ce sont des ventes ordinaires de YllaCash, dans le bilan de caisse ; ils ne sont pas envoyés comme consommations (§7 ne porte que les consommations offertes).

## 4. Ce que YllaCash en fait

| Donnée reçue | Utilisation dans YllaCash |
|---|---|
| `programme` | Onglet « Programme » de l'espace spectateur (et page publique `/live`). |
| `artistes` | Espace artiste : lien personnel `/artiste?ev=…&a=<id>&k=<clé>` (clé créée par YllaCash) ; commande des avantages du jour, servis aux stands ; décompte des consommations. |
| `benevoles` | Espace bénévole : lien personnel `/benevole?ev=…&id=<id>&k=<clé>` ; commande des repas, boissons et eau dans la limite des droits du jour ; onglet « Entrée » les jours de `controleBillets`. |

- Les liens personnels sont créés dans YllaCash (page Bénévoles et page Artistes, réduites à la consommation) ; ils ne contiennent ni mot de passe ni donnée d'Event Manager.
- Les consommations restent dans YllaCash.

## 5. Ce qui sort de YllaCash

Pages et fonctions retirées : Cachets, Exposants, Gestion des artistes, Planning (programmation), planning des bénévoles (postes, créneaux, pointage, auto-inscription), partie administrative de Finances (dépenses et recettes hors caisse), décharges et factures. Elles restent lisibles dans les archives 2026.

## 6. Ce que cela demande à Event Manager

1. **L'adresse `GET /api/public/yllacash`** (§2 et §3), sur le modèle de `/api/public/billetterie` : même clé de type `yllacash`, mêmes limites d'essais.
2. **Les jours de l'événement** (aujourd'hui un seul jour, `events.date`) : une liste de jours, ou une date de fin.
3. **Des créneaux bénévoles datés** : aujourd'hui `event_slots` n'a qu'un libellé (« Sam. 10h–14h ») ; il faut un jour (et des heures) pour savoir qui contrôle quel jour.
4. **Un marqueur « contrôle les billets » sur un poste.**
5. **Les droits des bénévoles par jour** (repas, boissons, eau) : nouveau, par défaut et ajustables par personne.
6. **Les avantages des artistes par jour** (repas, boissons, eau) : à la place du total `artists.meals`.

## 7. YllaCash → Event Manager : consommations et totaux financiers (validé)

YllaCash renvoie à Event Manager les consommations réelles des artistes et des bénévoles, et les totaux financiers de l'événement pour le « Dossier financeurs ». Format validé par l'organisateur le 18/11/2026 (version 1.1). En attendant qu'il soit en place des deux côtés, l'import du Rapport Excel existant fait le lien.

### 7.1 Principes

- **Même adresse, même clé que les entrées** : `POST https://gestion.maisonylla.com/api/public/billetterie`, `Authorization: Bearer <clé YllaCash de l'événement>`, `Content-Type: application/json`, `x-ylla: 1`. La clé de type `yllacash` autorise désormais aussi `consommations` et `bilan`.
- **Chaque message porte l'état complet** de ce qu'il couvre : Event Manager **remplace** ce qu'il avait reçu (rien n'est compté deux fois ; un message perdu est rattrapé par le suivant). `id` (32 caractères hexadécimaux) et doublons : comme pour les autres messages. `le` : date d'envoi, ISO 8601 avec fuseau.
- **Rythme** : dès qu'un chiffre change, au plus toutes les 5 minutes (tâche automatique de YllaCash), puis un envoi `final: true` après chaque clôture de caisse. Réessai automatique en cas de panne, comme pour les entrées.
- **Aucun nom** : les personnes sont désignées par l'identifiant d'Event Manager reçu dans l'instantané (§3).
- Montants en **euros**, nombres à deux décimales. Jours `AAAA-MM-JJ` ; une journée de festival finit à 6 h du matin (heure de Paris).

### 7.2 Consommations (`type: "consommations"`)

```json
{ "id": "…", "type": "consommations", "le": "2027-05-15T23:10:00+02:00",
  "jours": ["2027-05-15"],
  "benevoles": [ { "id": "u31", "jour": "2027-05-15", "repas": 1, "boissons": 2, "eau": 3 } ],
  "artistes":  [ { "id": "a7",  "jour": "2027-05-15", "repas": 2, "boissons": 3, "eau": 1 } ] }
```

- Par personne et par jour, quantités réellement servies (commandes retirées ou servies au stand ; une commande annulée ne compte pas).
- `jours` : jours couverts par le message (1 à 31). Pour chacun, Event Manager remplace toutes les consommations reçues ce jour-là par celles du message ; une personne absente du message n'a rien consommé ce jour-là.
- Seules les personnes venues de l'instantané (identifiant d'Event Manager) sont envoyées.

### 7.3 Bilan financier (`type: "bilan"`)

```json
{ "id": "…", "type": "bilan", "le": "2027-05-16T23:40:00+02:00", "final": true,
  "recharges": 12345.50, "ventes": 9876.00, "remboursements": 120.00, "soldesRestants": 2349.50,
  "offertsBenevoles": 131.50, "offertsArtistes": 80.00,
  "categories": [ { "nom": "Boissons", "montant": 5000.00, "unites": 1200 } ],
  "parJour": [ { "jour": "2027-05-15", "recharges": 7000.00, "ventes": 5200.00, "remboursements": 0.00 } ] }
```

- Totaux de tout l'événement ; Event Manager remplace le bilan précédent.
- `ventes` : ventes payées (encaissements et retraits de réservation des spectateurs), ventilées dans `categories` par catégorie de la carte (`unites` : articles vendus).
- `offertsBenevoles`, `offertsArtistes` : valeur **au prix de la carte** de ce qui a été offert (non compris dans `ventes`).
- `soldesRestants` : argent rechargé et ni dépensé ni remboursé.
- `final` : `true` pour l'envoi qui suit une clôture de caisse.
- Ce bilan reprend ce qu'Event Manager tire aujourd'hui du « Rapport Excel » (recharges, ventes par catégorie, offerts aux bénévoles, soldes restants) : l'import du fichier devient inutile quand le bilan arrive.

### 7.4 Ce que cela demande à Event Manager

1. Accepter `consommations` et `bilan` sur `POST /api/public/billetterie` avec une clé de type `yllacash` (403 avec une clé de type `site`), avec les mêmes vérifications « tout ou rien » et la même protection contre les doublons.
2. Ranger les consommations par personne et par jour, et les montrer en face des droits accordés (bénévoles) et des avantages (artistes).
3. Ranger le dernier bilan et l'utiliser dans le budget et le « Dossier financeurs », à la place de l'import du Rapport Excel quand il est présent.

## 8. Décisions (18/11/2026)

1. YllaCash **lit** un instantané (§2) plutôt qu'Event Manager n'envoie des messages.
2. Droits et avantages **par jour** (repas, boissons, eau), décidés dans Event Manager.
3. Accès des bénévoles et des artistes **par lien personnel** (sans mot de passe YllaCash).
4. Retour vers Event Manager des consommations et des totaux financiers (§7) : oui.
5. Format du retour (§7, v1.1) : en continu (au plus toutes les 5 minutes) puis final après la clôture ; consommations par personne et par jour ; offerts valorisés au prix de la carte.
