# Ylla Event Manager ↔ YllaCash : règle d'échange

Version 1.0 du 18/11/2026, **validée par l'organisateur** (les quatre points du §8). Ni Event Manager ni YllaCash ne sont encore développés selon cette règle.

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

- **programme** : uniquement ce qui est public. Ni cachet, ni contact, ni note interne.
- **artistes** : seulement ceux qui ont des avantages (statut `confirme` ou `contrat`). Ni cachet, ni contrat, ni contact.
- **benevoles** : seulement ceux qui ont des droits ou un contrôle des billets. Ni téléphone, ni e-mail, ni compétences.
- **controleBillets** : les jours où le bénévole est affecté à un poste marqué « contrôle les billets ». Il remplace le réglage `controleBillets` des postes de YllaCash (règle billetterie §3.4, à mettre à jour).
- Jours au format `AAAA-MM-JJ`, heures `HH:MM`, heure de Paris.

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

YllaCash renvoie à Event Manager les consommations réelles des artistes et des bénévoles, et les totaux financiers de l'événement (recharges, ventes, remboursements) pour le « Dossier financeurs ». Format à préciser dans une version 1.1 (même clé, même adresse que les entrées, nouveaux types de messages). En attendant, l'import du Rapport Excel existant fait le lien.

## 8. Décisions (18/11/2026)

1. YllaCash **lit** un instantané (§2) plutôt qu'Event Manager n'envoie des messages.
2. Droits et avantages **par jour** (repas, boissons, eau), décidés dans Event Manager.
3. Accès des bénévoles et des artistes **par lien personnel** (sans mot de passe YllaCash).
4. Retour vers Event Manager des consommations et des totaux financiers (§7) : oui.
