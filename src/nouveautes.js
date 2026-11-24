/**
 * nouveautes.js — « Quoi de neuf » de la dernière mise en ligne (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/FzB5RQwBEwGgqyMebrCjLn (idée d'Event Manager)
 *
 * À chaque mise en ligne qui apporte du nouveau : changer `id` (n'importe quel texte nouveau) et
 * les lignes de chaque espace, 3 ou 4 au plus, en français simple. Les textes sont validés par
 * l'organisateur avant le déploiement. Un espace sans ligne n'affiche rien.
 * icone : nom d'une icône de lucide-react (voir components/QuoiDeNeuf.jsx).
 */
export const NOUVEAUTES = {
  id: '2026-11-25',
  date: '25 novembre 2026',
  equipe: [
    { icone: 'Watch', titre: 'Bracelets de secours', texte: 'Nouvelle page « Bracelets » : relier un bracelet, donner un nouveau code, bloquer un bracelet perdu.' },
    { icone: 'RefreshCw', titre: "Tirez l'écran vers le bas", texte: "Dans l'appli installée, en haut d'une page : l'appli se met à jour tout de suite." },
    { icone: 'Undo2', titre: 'Le retour ferme la fenêtre', texte: "Le bouton retour du téléphone ferme d'abord la fenêtre ouverte, sans quitter l'écran." },
    { icone: 'Sun', titre: "L'écran reste allumé", texte: 'Pendant les scans (entrée, recharge, bracelets…), le téléphone ne se met plus en veille.' },
  ],
  benevole: [
    { icone: 'RefreshCw', titre: "Tirez l'écran vers le bas", texte: "Dans l'appli installée, en haut d'une page : l'appli se met à jour tout de suite." },
    { icone: 'Undo2', titre: 'Le retour ferme la fenêtre', texte: "Le bouton retour du téléphone ferme d'abord la fenêtre ouverte, sans quitter l'écran." },
    { icone: 'Sun', titre: "L'écran reste allumé", texte: 'Pendant les scans de votre poste, le téléphone ne se met plus en veille.' },
  ],
  spectateur: [
    { icone: 'Watch', titre: 'Bracelet de secours', texte: 'Téléphone déchargé ? Payez à la borne avec votre bracelet et votre code. À relier dans Compte.' },
    { icone: 'RefreshCw', titre: "Tirez l'écran vers le bas", texte: "Dans l'appli installée, en haut d'une page : l'appli se met à jour tout de suite." },
    { icone: 'Undo2', titre: 'Le retour ferme la fenêtre', texte: "Le bouton retour du téléphone ferme d'abord la fenêtre ouverte, sans quitter l'écran." },
  ],
}
