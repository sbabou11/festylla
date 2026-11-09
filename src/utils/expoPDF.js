/**
 * utils/expoPDF.js — Générateurs PDF pour le module Exposants (Lot 4)
 *
 * 2 documents générés via jsPDF :
 *   - generateInvoicePDF : Facture professionnelle (en-tête, lignes, total, IBAN)
 *   - generateDechargePDF : Décharge pour paiement espèces
 *
 * Les deux utilisent les coordonnées organisateur stockées dans settings.organisateur.
 * Les montants sont passés en CENTIMES en entrée, formatés en € à l'affichage.
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  computeExpoPaye, computeExpoRestant, METHOD_LABEL,
  expoDisplayName, getExpoLignes,
} from './expositions'
import { renderInvoiceFromTemplate } from './factureRenderer'
import { DEFAULT_INVOICE_TEMPLATE } from './factureTemplate'

// ─── Helpers ────────────────────────────────────────────────────────
const fmtEur = (centimes) => `${((centimes || 0) / 100).toFixed(2)} €`

const fmtDateFr = (input) => {
  if (!input) return ''
  const d = input?.toDate ? input.toDate() : (input instanceof Date ? input : new Date(input))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Génère un numéro de facture basé sur l'ID + date
const buildInvoiceNumber = (expoId, eventId) => {
  const datePart = new Date().toISOString().slice(0, 7).replace('-', '')  // YYYYMM
  const shortId = (expoId || 'x').slice(-4).toUpperCase()
  const shortEv = (eventId || 'EV').slice(0, 3).toUpperCase()
  return `${shortEv}-${datePart}-${shortId}`
}

// ─── En-tête commun aux deux PDF ────────────────────────────────────
function writeOrganisateurHeader(pdf, organisateur, pageW) {
  const margin = 18
  let y = 18
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.setTextColor(20, 20, 20)
  pdf.text(organisateur?.raisonSociale || 'Organisateur', margin, y)
  y += 6

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(90, 90, 90)
  const lines = [
    organisateur?.adresse,
    [organisateur?.codePostal, organisateur?.ville].filter(Boolean).join(' '),
    organisateur?.pays,
  ].filter(Boolean)
  for (const l of lines) { pdf.text(l, margin, y); y += 4 }

  if (organisateur?.siret) { pdf.text(`SIRET : ${organisateur.siret}`, margin, y); y += 4 }
  if (organisateur?.tva)   { pdf.text(`TVA : ${organisateur.tva}`, margin, y);     y += 4 }

  const rightX = pageW - margin
  let ry = 18
  pdf.setFontSize(9)
  pdf.setTextColor(90, 90, 90)
  if (organisateur?.email)     { pdf.text(organisateur.email, rightX, ry, { align: 'right' });     ry += 4 }
  if (organisateur?.telephone) { pdf.text(organisateur.telephone, rightX, ry, { align: 'right' }); ry += 4 }
  if (organisateur?.siteWeb)   { pdf.text(organisateur.siteWeb, rightX, ry, { align: 'right' });   ry += 4 }

  return Math.max(y, ry) + 4
}

// ════════════════════════════════════════════════════════════════════
// FACTURE
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// FACTURE — délègue au moteur de templates (Lot B1)
// ════════════════════════════════════════════════════════════════════
// La facture est désormais générée depuis un template JSON via
// factureRenderer.js. Si aucun template personnalisé n'est passé,
// on utilise DEFAULT_INVOICE_TEMPLATE qui reproduit la mise en page
// historique de cette fonction.

/**
 * Génère une facture PDF.
 *
 * Async désormais (Lot C3) car on doit charger la config TVA depuis Firestore
 * avant de générer le PDF. Si TVA active, la ventilation HT/TVA/TTC apparaît
 * dans le récap. Sinon, mention "TVA non applicable" affichée.
 *
 * @param {object} expo
 * @param {object} organisateur
 * @param {string} eventId
 * @param {object|null} [template] - template personnalisé (null = défaut)
 */
export async function generateInvoicePDF(expo, organisateur, eventId, template = null) {
  // Charge la config TVA pour l'événement (Lot C3)
  let tvaConfig = { active: false, defaultTaux: 0 }
  let tvaMentionExoneration = 'TVA non applicable, art. 293 B du CGI'
  try {
    const { getSettings } = await import('../firebase/service')
    const s = await getSettings(eventId)
    tvaConfig = {
      active: !!s?.tvaActive,
      defaultTaux: Number(s?.tvaDefaultTaux) || 0,
    }
    if (typeof s?.tvaMentionExoneration === 'string' && s.tvaMentionExoneration.trim()) {
      tvaMentionExoneration = s.tvaMentionExoneration.trim()
    }
  } catch (e) {
    console.warn('Chargement config TVA échoué :', e.message)
  }
  return renderInvoiceFromTemplate({
    template: template || DEFAULT_INVOICE_TEMPLATE,
    expo, organisateur, eventId,
    tvaConfig, tvaMentionExoneration,
  })
}

// ════════════════════════════════════════════════════════════════════
// DÉCHARGE (paiement espèces)
// ════════════════════════════════════════════════════════════════════

export function generateDechargePDF(expo, organisateur, eventId) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const margin = 18

  let y = writeOrganisateurHeader(pdf, organisateur, pageW)

  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y, pageW - margin, y)
  y += 14

  // Titre
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.setTextColor(20, 20, 20)
  pdf.text('DÉCHARGE DE PAIEMENT', pageW / 2, y, { align: 'center' })
  y += 8

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(90, 90, 90)
  pdf.text('(Paiement en espèces)', pageW / 2, y, { align: 'center' })
  y += 16

  // Corps du texte
  pdf.setFontSize(11)
  pdf.setTextColor(30, 30, 30)
  const paye = computeExpoPaye(expo)
  const restant = computeExpoRestant(expo)
  const dateDecharge = fmtDateFr(new Date())

  const corps = [
    `Je soussigné(e), représentant de ${organisateur?.raisonSociale || 'l\'organisateur'},`,
    ``,
    `reconnais avoir reçu de ${expo.typeExposant === 'entreprise' ? 'la société' : 'M./Mme'} :`,
    ``,
    expoDisplayName(expo),
    expo.typeExposant === 'entreprise' && expo.identite?.siret ? `SIRET : ${expo.identite.siret}` : '',
    ``,
    `la somme de ${fmtEur(paye)}`,
    `(${montantEnLettres(paye)})`,
    ``,
    `au titre des frais d'exposition${expo.thematiqueLabel ? ` pour la thématique "${expo.thematiqueLabel}"` : ''},`,
    `pour un montant total facturé de ${fmtEur(expo.montantTotal)}.`,
    ``,
    restant > 0
      ? `Restant dû : ${fmtEur(restant)}`
      : `La présente facture est intégralement réglée.`,
  ].filter(line => line !== null && line !== undefined)
  corps.forEach((line, i) => {
    // Lignes en gras pour le nom et le montant
    if (line === expoDisplayName(expo) || (line && line.startsWith('la somme de'))) {
      pdf.setFont('helvetica', 'bold')
    } else {
      pdf.setFont('helvetica', 'normal')
    }
    pdf.text(line, margin, y)
    y += 6
  })

  // Détail des paiements en espèces
  y += 4
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('Détail des paiements :', margin, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  if (expo.acompte) {
    pdf.text(
      `• Acompte : ${fmtEur(expo.acompte.montant)} reçu le ${fmtDateFr(expo.acompte.date)} (${METHOD_LABEL[expo.acompte.method] || expo.acompte.method})`,
      margin, y
    )
    y += 5
  }
  if (expo.solde) {
    pdf.text(
      `• Solde   : ${fmtEur(expo.solde.montant)} reçu le ${fmtDateFr(expo.solde.date)} (${METHOD_LABEL[expo.solde.method] || expo.solde.method})`,
      margin, y
    )
    y += 5
  }
  if (!expo.acompte && !expo.solde) {
    pdf.setTextColor(180, 100, 0)
    pdf.text('• Aucun paiement enregistré.', margin, y)
    pdf.setTextColor(30, 30, 30)
    y += 5
  }

  // Date + lieu + signatures
  y = Math.max(y + 16, 200)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(`Fait à ${organisateur?.ville || '—'}, le ${dateDecharge}`, margin, y)
  y += 18

  // 2 colonnes signatures
  const colW = (pageW - 2 * margin - 14) / 2
  pdf.setFont('helvetica', 'bold')
  pdf.text("Signature de l'organisateur", margin, y)
  pdf.text("Signature du payeur", margin + colW + 14, y)
  y += 4
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(120, 120, 120)
  pdf.text('(nom, qualité, cachet)', margin, y)
  pdf.text('(nom, qualité)', margin + colW + 14, y)
  y += 4
  // Cadres de signature
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.rect(margin, y, colW, 28)
  pdf.rect(margin + colW + 14, y, colW, 28)

  // Pied de page
  const footerY = pdf.internal.pageSize.getHeight() - 12
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(150, 150, 150)
  pdf.text(`${organisateur?.raisonSociale || ''} — Décharge générée le ${dateDecharge}`,
    pageW / 2, footerY, { align: 'center' })

  const safeNom = expoDisplayName(expo).replace(/[^\w]+/g, '_')
  pdf.save(`Decharge_${safeNom}_${new Date().toISOString().slice(0,10)}.pdf`)
}

// ─── Helper : conversion d'un montant en lettres (basique) ─────────
function montantEnLettres(centimes) {
  // Implémentation minimaliste : "X euros et Y centimes".
  // Pour une version complète française avec conversion mot-à-mot, on utiliserait
  // une lib externe. Cette version reste lisible et reconnaissable.
  const euros = Math.floor((centimes || 0) / 100)
  const cents = (centimes || 0) % 100
  if (cents === 0) return `${euros} euro${euros > 1 ? 's' : ''}`
  return `${euros} euro${euros > 1 ? 's' : ''} et ${cents} centime${cents > 1 ? 's' : ''}`
}

// ════════════════════════════════════════════════════════════════════
// DÉCHARGE SIGNÉE (Livraison signature électronique)
// ════════════════════════════════════════════════════════════════════
// Version étendue de la décharge :
//   - Logo + couleur personnalisée
//   - Texte personnalisé (template ou édition à la volée)
//   - Remplacement de variables : {{exposant}}, {{montant}}, {{montantLettres}}, {{montantTotal}}
//   - Intégration des signatures (organisateur + exposant) en images
//   - Horodatage précis
//   - Retourne un Blob (à la place de save direct) pour permettre hash + upload

/**
 * Remplace les variables {{...}} dans un texte par leurs valeurs.
 */
function applyVariables(text, expo) {
  if (!text) return ''
  const paye = computeExpoPaye(expo)
  return String(text)
    .replace(/\{\{exposant\}\}/g, expoDisplayName(expo))
    .replace(/\{\{montant\}\}/g, fmtEur(paye))
    .replace(/\{\{montantLettres\}\}/g, montantEnLettresInline(paye))
    .replace(/\{\{montantTotal\}\}/g, fmtEur(expo.montantTotal))
}

// Version inline du helper montantEnLettres (sans export, scoped à ce module)
function montantEnLettresInline(centimes) {
  const euros = Math.floor((centimes || 0) / 100)
  const cents = (centimes || 0) % 100
  if (cents === 0) return `${euros} euro${euros > 1 ? 's' : ''}`
  return `${euros} euro${euros > 1 ? 's' : ''} et ${cents} centime${cents > 1 ? 's' : ''}`
}

/**
 * Convertit un hex color (#rrggbb) en triplet [r, g, b] pour jsPDF.
 */
function hexToRgb(hex) {
  const clean = (hex || '#1a6b7a').replace('#', '')
  const n = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Génère une décharge signée et retourne le Blob (pas de download automatique).
 * Le composant appelant gère le download + l'upload Storage.
 *
 * @param {object} params - {
 *   expo, organisateur, eventId,
 *   customText: { intro, mentions, piedDePage },
 *   templateId,  // métadonnée seulement
 *   signatures: {
 *     organisateur: { dataUrl, signedBy },
 *     exposant:     { dataUrl, signedBy },
 *   },
 *   logoDataUrl, brandColor,
 *   signedAt,
 * }
 * @returns {Promise<Blob>}
 */
export async function generateDechargePDFSigned(params) {
  const {
    expo, organisateur, eventId,
    customText, signatures,
    logoDataUrl, brandColor,
    signedAt,
  } = params

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 18
  const brandRgb = hexToRgb(brandColor)
  const date = signedAt || new Date()

  // ─── Bandeau coloré supérieur ─────────────────────────────────────
  pdf.setFillColor(brandRgb[0], brandRgb[1], brandRgb[2])
  pdf.rect(0, 0, pageW, 6, 'F')

  let y = 14

  // ─── Logo (si présent) ────────────────────────────────────────────
  if (logoDataUrl) {
    try {
      // Détecte format depuis dataURL
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      pdf.addImage(logoDataUrl, fmt, margin, y, 30, 18, undefined, 'FAST')
    } catch (e) {
      console.warn('Logo non ajouté:', e.message)
    }
  }

  // ─── En-tête organisateur (texte à droite du logo si présent) ─────
  const orgX = logoDataUrl ? margin + 36 : margin
  let oy = y + 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.setTextColor(20, 20, 20)
  pdf.text(organisateur?.raisonSociale || 'Organisateur', orgX, oy)
  oy += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(90, 90, 90)
  const orgLines = [
    organisateur?.adresse,
    [organisateur?.codePostal, organisateur?.ville].filter(Boolean).join(' '),
    organisateur?.siret ? `SIRET : ${organisateur.siret}` : null,
    organisateur?.email,
  ].filter(Boolean)
  for (const l of orgLines) { pdf.text(l, orgX, oy); oy += 4 }

  y = Math.max(oy, y + 22) + 4
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y, pageW - margin, y)
  y += 10

  // ─── Titre ────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.setTextColor(brandRgb[0], brandRgb[1], brandRgb[2])
  pdf.text('DÉCHARGE DE PAIEMENT', pageW / 2, y, { align: 'center' })
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120, 120, 120)
  pdf.text(`Émise le ${fmtDateFr(date)} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    pageW / 2, y, { align: 'center' })
  y += 12

  // ─── Corps : texte d'intro (avec variables remplacées) ────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.setTextColor(30, 30, 30)
  const introText = applyVariables(customText?.intro || '', expo)
  // Découpage du texte sur plusieurs lignes en respectant la largeur
  const introLines = pdf.splitTextToSize(introText, pageW - 2 * margin)
  for (const line of introLines) {
    if (y > pageH - 80) { pdf.addPage(); y = 18 } // anti-débordement
    pdf.text(line, margin, y)
    y += 5.5
  }
  y += 4

  // ─── Détail des paiements ─────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('Détail des paiements :', margin, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  if (expo.acompte) {
    pdf.text(
      `• Acompte : ${fmtEur(expo.acompte.montant)} reçu le ${fmtDateFr(expo.acompte.date)} (${METHOD_LABEL[expo.acompte.method] || expo.acompte.method})`,
      margin, y
    )
    y += 5
  }
  if (expo.solde) {
    pdf.text(
      `• Solde   : ${fmtEur(expo.solde.montant)} reçu le ${fmtDateFr(expo.solde.date)} (${METHOD_LABEL[expo.solde.method] || expo.solde.method})`,
      margin, y
    )
    y += 5
  }
  if (!expo.acompte && !expo.solde) {
    pdf.setTextColor(180, 100, 0)
    pdf.text('• Aucun paiement enregistré.', margin, y)
    pdf.setTextColor(30, 30, 30)
    y += 5
  }

  // ─── Mentions complémentaires (si présentes) ──────────────────────
  if (customText?.mentions && customText.mentions.trim()) {
    y += 6
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(9)
    pdf.setTextColor(70, 70, 70)
    const mentionsLines = pdf.splitTextToSize(applyVariables(customText.mentions, expo), pageW - 2 * margin)
    for (const line of mentionsLines) {
      if (y > pageH - 80) { pdf.addPage(); y = 18 }
      pdf.text(line, margin, y)
      y += 4.5
    }
  }

  // ─── Date + lieu ──────────────────────────────────────────────────
  y = Math.max(y + 10, pageH - 78)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(30, 30, 30)
  pdf.text(`Fait à ${organisateur?.ville || '—'}, le ${fmtDateFr(date)}`, margin, y)
  y += 8

  // ─── 2 colonnes de signatures avec images intégrées ───────────────
  const colW = (pageW - 2 * margin - 14) / 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text("Signature de l'organisateur", margin, y)
  pdf.text("Signature de l'exposant", margin + colW + 14, y)
  y += 4
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(120, 120, 120)
  pdf.text(signatures?.organisateur?.signedBy || '—', margin, y)
  pdf.text(signatures?.exposant?.signedBy || '—',     margin + colW + 14, y)
  y += 3
  // Cadres
  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.3)
  pdf.rect(margin, y, colW, 28)
  pdf.rect(margin + colW + 14, y, colW, 28)

  // Insertion des images de signature dans les cadres (avec padding 2mm)
  try {
    if (signatures?.organisateur?.dataUrl) {
      pdf.addImage(signatures.organisateur.dataUrl, 'PNG', margin + 2, y + 2, colW - 4, 24, undefined, 'FAST')
    }
    if (signatures?.exposant?.dataUrl) {
      pdf.addImage(signatures.exposant.dataUrl, 'PNG', margin + colW + 14 + 2, y + 2, colW - 4, 24, undefined, 'FAST')
    }
  } catch (e) {
    console.warn('Signatures non insérées:', e.message)
  }
  y += 32

  // Horodatage des signatures
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(7)
  pdf.setTextColor(150, 150, 150)
  const timestampStr = `Signé électroniquement le ${fmtDateFr(date)} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
  pdf.text(timestampStr, pageW / 2, y, { align: 'center' })

  // ─── Pied de page ─────────────────────────────────────────────────
  const footerY = pageH - 8
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(150, 150, 150)
  const piedText = (customText?.piedDePage || 'Document généré électroniquement et signé.').trim()
  pdf.text(piedText, pageW / 2, footerY, { align: 'center' })

  // Bandeau bas coloré
  pdf.setFillColor(brandRgb[0], brandRgb[1], brandRgb[2])
  pdf.rect(0, pageH - 3, pageW, 3, 'F')

  // ─── Retour Blob (et NON save direct) ─────────────────────────────
  return pdf.output('blob')
}
