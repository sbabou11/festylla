/**
 * utils/factureTemplate.js — Modèle de données pour les templates de facture (Lot B1)
 *
 * Un template de facture est un objet JSON qui décrit la page A4 :
 * dimensions, marges, et une liste d'éléments positionnés librement
 * (logo, texte, variable, tableau dynamique, trait, rectangle).
 *
 * Le rendu PDF lit ce JSON et trace chaque élément via jsPDF.
 *
 * Format A4 standard : 210 × 297 mm. Toutes les positions et dimensions
 * dans le JSON sont en MILLIMÈTRES (cohérent avec jsPDF).
 */

// ─── Types d'éléments supportés ─────────────────────────────────────
export const ELEMENT_TYPES = {
  text:      { id: 'text',      label: 'Texte',          icon: 'TextSize' },
  paragraph: { id: 'paragraph', label: 'Texte long',     icon: 'AlignLeft' },
  image:     { id: 'image',     label: 'Image / Logo',   icon: 'Photo' },
  field:     { id: 'field',     label: 'Champ variable', icon: 'Variable' },
  table:     { id: 'table',     label: 'Tableau lignes', icon: 'Table' },
  line:      { id: 'line',      label: 'Trait',          icon: 'Minus' },
  rect:      { id: 'rect',      label: 'Rectangle',      icon: 'Rectangle' },
}

// ─── Variables disponibles dans les éléments text/field ─────────────
// Chaque variable se réfère à une donnée calculée au moment du rendu.
// La syntaxe est {{namespace.cle}} ; les remplacements sont littéraux.
export const VARIABLES = [
  // Exposant
  { key: '{{exposant.nom}}',           label: 'Nom (display name calculé)',   group: 'Exposant' },
  { key: '{{exposant.raisonSociale}}', label: 'Raison sociale (entreprise)',  group: 'Exposant' },
  { key: '{{exposant.siret}}',         label: 'SIRET',                        group: 'Exposant' },
  { key: '{{exposant.tva}}',           label: 'N° TVA',                       group: 'Exposant' },
  { key: '{{exposant.email}}',         label: 'Email',                        group: 'Exposant' },
  { key: '{{exposant.telephone}}',     label: 'Téléphone',                    group: 'Exposant' },
  { key: '{{exposant.adresse}}',       label: 'Adresse',                      group: 'Exposant' },
  { key: '{{exposant.codePostal}}',    label: 'Code postal',                  group: 'Exposant' },
  { key: '{{exposant.ville}}',         label: 'Ville',                        group: 'Exposant' },
  { key: '{{exposant.adresseComplete}}', label: 'Adresse complète (formatée)', group: 'Exposant' },
  { key: '{{exposant.dirigeant}}',     label: 'Dirigeant',                    group: 'Exposant' },
  { key: '{{exposant.commentaires}}',  label: 'Notes / exceptions',           group: 'Exposant' },

  // Organisateur
  { key: '{{organisateur.raisonSociale}}', label: 'Raison sociale',           group: 'Organisateur' },
  { key: '{{organisateur.adresse}}',       label: 'Adresse',                  group: 'Organisateur' },
  { key: '{{organisateur.codePostal}}',    label: 'Code postal',              group: 'Organisateur' },
  { key: '{{organisateur.ville}}',         label: 'Ville',                    group: 'Organisateur' },
  { key: '{{organisateur.siret}}',         label: 'SIRET',                    group: 'Organisateur' },
  { key: '{{organisateur.tva}}',           label: 'N° TVA',                   group: 'Organisateur' },
  { key: '{{organisateur.iban}}',          label: 'IBAN',                     group: 'Organisateur' },
  { key: '{{organisateur.bic}}',           label: 'BIC',                      group: 'Organisateur' },
  { key: '{{organisateur.banque}}',        label: 'Nom de la banque',         group: 'Organisateur' },
  { key: '{{organisateur.email}}',         label: 'Email',                    group: 'Organisateur' },
  { key: '{{organisateur.telephone}}',     label: 'Téléphone',                group: 'Organisateur' },
  { key: '{{organisateur.siteWeb}}',       label: 'Site web',                 group: 'Organisateur' },
  { key: '{{organisateur.adresseComplete}}', label: 'Adresse complète',       group: 'Organisateur' },

  // Facture
  { key: '{{facture.numero}}',  label: 'Numéro auto-généré',      group: 'Facture' },
  { key: '{{facture.date}}',    label: 'Date de génération (FR)', group: 'Facture' },

  // Montants
  { key: '{{total}}',           label: 'Total final formaté €',           group: 'Montants' },
  { key: '{{totalBrut}}',       label: 'Total numérique (sans symbole)',  group: 'Montants' },
  { key: '{{acompte}}',         label: 'Acompte versé',                   group: 'Montants' },
  { key: '{{solde}}',           label: 'Solde versé',                     group: 'Montants' },
  { key: '{{paye}}',            label: 'Total déjà payé',                 group: 'Montants' },
  { key: '{{restant}}',         label: 'Restant dû',                      group: 'Montants' },

  // Réductions (Lot C1+C2)
  { key: '{{sousTotalHT}}',       label: 'Sous-total avant réductions globales', group: 'Réductions' },
  { key: '{{totalReductions}}',   label: 'Montant total déduit',                 group: 'Réductions' },
  { key: '{{reduction1.label}}',  label: 'Libellé réduction globale n°1',        group: 'Réductions' },
  { key: '{{reduction1.montant}}',label: 'Montant déduit réduction n°1',         group: 'Réductions' },
  { key: '{{reduction2.label}}',  label: 'Libellé réduction globale n°2',        group: 'Réductions' },
  { key: '{{reduction2.montant}}',label: 'Montant déduit réduction n°2',         group: 'Réductions' },

  // TVA (Lot C3)
  { key: '{{totalHT}}',           label: 'Total HT après réductions',            group: 'TVA' },
  { key: '{{totalTva}}',          label: 'Montant total de TVA',                 group: 'TVA' },
  { key: '{{totalTTC}}',          label: 'Total TTC (HT + TVA)',                 group: 'TVA' },
  { key: '{{tvaVentilation}}',    label: 'Ventilation TVA (multilignes par taux)', group: 'TVA' },
  { key: '{{tvaNumero}}',         label: 'N° TVA intracom de l\'organisateur',   group: 'TVA' },
  { key: '{{tvaMentionExoneration}}', label: 'Mention "TVA non applicable…" si désactivée', group: 'TVA' },
]

// ─── Format de page ─────────────────────────────────────────────────
export const PAGE_A4 = { width: 210, height: 297 } // mm

/**
 * Génère un identifiant d'élément unique.
 */
export function newElementId() {
  return 'el-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

/**
 * Crée un nouvel élément avec valeurs par défaut selon son type.
 * Utilisé quand l'utilisateur dépose un élément depuis la sidebar.
 */
export function newElement(type, partial = {}) {
  const base = {
    id: newElementId(),
    type,
    x: 20, y: 20,                // position par défaut (mm depuis coin haut-gauche)
    w: 60, h: 10,                // dimensions par défaut (mm)
  }
  switch (type) {
    case 'text':
      return { ...base, content: 'Texte', fontSize: 11, bold: false, italic: false, color: '#222222', align: 'left', ...partial }
    case 'paragraph':
      return { ...base, w: 100, h: 30, content: 'Texte long sur plusieurs lignes.\n{{exposant.adresse}}', fontSize: 10, lineHeight: 1.4, color: '#444444', align: 'left', ...partial }
    case 'image':
      return { ...base, w: 30, h: 18, src: null /* dataUrl ou null */, ...partial }
    case 'field':
      return { ...base, w: 60, h: 6, content: '{{exposant.nom}}', fontSize: 10, bold: false, italic: false, color: '#222222', align: 'left', ...partial }
    case 'table':
      // Le tableau dynamique itère sur expo.lignes au moment du rendu.
      // Les en-têtes et colonnes sont configurables.
      return {
        ...base, w: 170, h: 50,
        headerBg: '#F0F0F0', headerColor: '#202020',
        fontSize: 10, headerFontSize: 10,
        columns: [
          { label: 'Désignation',  field: 'description', width: 90, align: 'left'  },
          { label: 'Quantité',     field: 'qty',         width: 25, align: 'center' },
          { label: 'Prix unitaire', field: 'prixUnit',   width: 27, align: 'right', isCurrency: true },
          { label: 'Total HT',     field: 'total',       width: 28, align: 'right', isCurrency: true },
        ],
        showTotal: true,
        ...partial,
      }
    case 'line':
      return { ...base, w: 170, h: 0.3, color: '#CCCCCC', strokeWidth: 0.3, ...partial }
    case 'rect':
      return { ...base, w: 60, h: 30, fillColor: '#F5F5F5', borderColor: '#DDDDDD', borderWidth: 0.3, ...partial }
    default:
      return { ...base, ...partial }
  }
}

/**
 * Template de facture par défaut.
 * Reproduit le rendu actuel de generateInvoicePDF (codé en dur jusqu'à maintenant).
 * Utilisé automatiquement si aucun template n'est sélectionné.
 *
 * IMPORTANT : ce template ne doit JAMAIS être stocké en base. Il est purement
 * statique et sert de fallback. Les templates personnalisés en base le complètent.
 */
export const DEFAULT_INVOICE_TEMPLATE = {
  id: '__default__',
  nom: 'Facture standard',
  isDefault: true,
  format: 'A4',
  margin: 18, // marge en mm (information indicative)
  elements: [
    // ─── EN-TÊTE ORGANISATEUR (haut-gauche) ───
    { id: 'h-org-nom', type: 'field', x: 18, y: 18, w: 100, h: 8,
      content: '{{organisateur.raisonSociale}}', fontSize: 16, bold: true, color: '#141414', align: 'left' },
    { id: 'h-org-adr', type: 'field', x: 18, y: 26, w: 100, h: 5,
      content: '{{organisateur.adresse}}', fontSize: 9, color: '#5A5A5A', align: 'left' },
    { id: 'h-org-cp',  type: 'field', x: 18, y: 30, w: 100, h: 5,
      content: '{{organisateur.codePostal}} {{organisateur.ville}}', fontSize: 9, color: '#5A5A5A', align: 'left' },
    { id: 'h-org-srt', type: 'field', x: 18, y: 34, w: 100, h: 5,
      content: 'SIRET : {{organisateur.siret}}', fontSize: 9, color: '#5A5A5A', align: 'left' },

    // ─── CONTACT (haut-droit) ───
    { id: 'h-cnt-eml', type: 'field', x: 110, y: 18, w: 82, h: 5,
      content: '{{organisateur.email}}', fontSize: 9, color: '#5A5A5A', align: 'right' },
    { id: 'h-cnt-tel', type: 'field', x: 110, y: 22, w: 82, h: 5,
      content: '{{organisateur.telephone}}', fontSize: 9, color: '#5A5A5A', align: 'right' },
    { id: 'h-cnt-web', type: 'field', x: 110, y: 26, w: 82, h: 5,
      content: '{{organisateur.siteWeb}}', fontSize: 9, color: '#5A5A5A', align: 'right' },

    // ─── SÉPARATEUR ───
    { id: 'sep-1', type: 'line', x: 18, y: 50, w: 174, h: 0.3, color: '#C8C8C8' },

    // ─── TITRE FACTURE ───
    { id: 'titre', type: 'text', x: 18, y: 62, w: 80, h: 12,
      content: 'FACTURE', fontSize: 22, bold: true, color: '#141414', align: 'left' },
    { id: 'num',  type: 'field', x: 110, y: 58, w: 82, h: 5,
      content: 'N° {{facture.numero}}', fontSize: 10, color: '#464646', align: 'right' },
    { id: 'date', type: 'field', x: 110, y: 62, w: 82, h: 5,
      content: 'Date : {{facture.date}}', fontSize: 10, color: '#464646', align: 'right' },

    // ─── BLOC CLIENT (haut-droit) ───
    { id: 'cli-titre', type: 'text', x: 122, y: 78, w: 70, h: 6,
      content: 'Facturé à :', fontSize: 10, bold: true, color: '#141414', align: 'left' },
    { id: 'cli-nom', type: 'field', x: 122, y: 84, w: 70, h: 5,
      content: '{{exposant.nom}}', fontSize: 10, bold: true, color: '#141414', align: 'left' },
    { id: 'cli-info', type: 'paragraph', x: 122, y: 89, w: 70, h: 20,
      content: '{{exposant.adresseComplete}}\n{{exposant.email}}',
      fontSize: 9, color: '#5A5A5A', lineHeight: 1.3, align: 'left' },

    // ─── TABLEAU LIGNES (centre) ───
    { id: 'tbl',  type: 'table', x: 18, y: 115, w: 174, h: 60,
      headerBg: '#F0F0F0', headerColor: '#1E1E1E',
      fontSize: 10, headerFontSize: 10,
      columns: [
        { label: 'Désignation',   field: 'description', width: 90, align: 'left'  },
        { label: 'Quantité',      field: 'qty',         width: 25, align: 'center'},
        { label: 'Prix unitaire', field: 'prixUnit',    width: 27, align: 'right', isCurrency: true },
        { label: 'Total HT',      field: 'total',       width: 32, align: 'right', isCurrency: true },
      ],
      showTotal: true,
    },

    // ─── NOTES / EXCEPTIONS (champ libre exposant) ───
    // Affichage uniquement si le champ commentaires est rempli, grâce au flag
    // `skipIfEmpty: true` qui demande au renderer d'ignorer l'élément quand
    // toutes ses variables résolvent à du vide. Évite d'afficher un titre
    // "Notes" orphelin sur une facture sans commentaires.
    { id: 'notes', type: 'paragraph', x: 18, y: 210, w: 174, h: 20,
      content: 'Notes :\n{{exposant.commentaires}}',
      fontSize: 9, color: '#3C3C3C', lineHeight: 1.4, align: 'left',
      skipIfEmpty: true, skipIfEmptyVar: '{{exposant.commentaires}}',
    },

    // ─── COORDONNÉES BANCAIRES (bas) ───
    { id: 'iban-bg', type: 'rect', x: 18, y: 232, w: 174, h: 32,
      fillColor: '#F5F5F5', borderColor: '#F5F5F5', borderWidth: 0 },
    { id: 'iban-t', type: 'text', x: 22, y: 240, w: 168, h: 6,
      content: 'Règlement par virement bancaire', fontSize: 10, bold: true, color: '#1E1E1E', align: 'left' },
    { id: 'iban-bq', type: 'field', x: 22, y: 247, w: 168, h: 5,
      content: 'Banque : {{organisateur.banque}}', fontSize: 9, color: '#3C3C3C', align: 'left' },
    { id: 'iban-nu', type: 'field', x: 22, y: 252, w: 168, h: 5,
      content: 'IBAN : {{organisateur.iban}}', fontSize: 9, color: '#3C3C3C', align: 'left' },
    { id: 'iban-bi', type: 'field', x: 22, y: 257, w: 168, h: 5,
      content: 'BIC : {{organisateur.bic}}', fontSize: 9, color: '#3C3C3C', align: 'left' },

    // ─── MENTIONS TVA (Lot C3) ───
    // {{tvaMentionExoneration}} est rempli SEULEMENT si la TVA est désactivée pour
    // l'événement. skipIfEmpty masque l'élément si TVA active. Pas de mention à
    // afficher dans ce cas car la ventilation TVA est déjà dans le récap.
    { id: 'mention-tva', type: 'field', x: 18, y: 268, w: 174, h: 5,
      content: '{{tvaMentionExoneration}}',
      fontSize: 9, color: '#5A5A5A', align: 'center', italic: true,
      skipIfEmpty: true, skipIfEmptyVar: '{{tvaMentionExoneration}}' },

    // N° TVA intracom : affiché si l'organisateur en a un (TVA active ou pas, c'est
    // une info qui peut figurer même en franchise pour les exposants UE).
    { id: 'tva-num', type: 'field', x: 18, y: 274, w: 174, h: 5,
      content: 'N° TVA intracommunautaire : {{tvaNumero}}',
      fontSize: 8, color: '#7A7A7A', align: 'center',
      skipIfEmpty: true, skipIfEmptyVar: '{{tvaNumero}}' },

    // ─── PIED DE PAGE ───
    { id: 'pied', type: 'field', x: 18, y: 285, w: 174, h: 5,
      content: '{{organisateur.raisonSociale}} — Document généré le {{facture.date}}',
      fontSize: 8, color: '#969696', align: 'center' },
  ],
}

/**
 * Valide qu'un template a la structure attendue. Lance une erreur sinon.
 * Utile avant sauvegarde en base ou import depuis Firestore.
 */
export function validateTemplate(tpl) {
  if (!tpl || typeof tpl !== 'object') throw new Error('Template invalide (type)')
  if (!tpl.nom || typeof tpl.nom !== 'string') throw new Error('Template sans nom')
  if (!Array.isArray(tpl.elements)) throw new Error('Template sans liste d\'éléments')
  for (const el of tpl.elements) {
    if (!el.id || !el.type) throw new Error('Élément invalide (id/type manquant)')
    if (!ELEMENT_TYPES[el.type]) throw new Error(`Type d'élément inconnu : ${el.type}`)
    if (typeof el.x !== 'number' || typeof el.y !== 'number') throw new Error(`Élément ${el.id} : x/y invalides`)
    if (typeof el.w !== 'number' || typeof el.h !== 'number') throw new Error(`Élément ${el.id} : w/h invalides`)
  }
  return true
}

/**
 * Clone profond d'un template (utilisé pour dupliquer ou pour éditer sans mutation).
 */
export function cloneTemplate(tpl) {
  return JSON.parse(JSON.stringify(tpl))
}
