/**
 * utils/factureRenderer.js — Moteur de rendu PDF depuis JSON template (Lot B1)
 *
 * Lit un template (cf. factureTemplate.js) et génère un PDF jsPDF en
 * parcourant les éléments. Tous les types d'éléments sont supportés :
 * text, paragraph, image, field, table, line, rect.
 *
 * Le moteur gère :
 *   - Remplacement des variables {{...}} dans text/field/paragraph
 *   - Multi-pages automatique pour les tableaux dynamiques
 *   - Formatage des montants en € (champs isCurrency: true)
 *   - Alignements left/center/right
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { expoDisplayName, getExpoLignes, computeExpoPaye, computeExpoRestant } from './expositions'

// ─── Helpers de formatage ───────────────────────────────────────────
const fmtEur = (centimes) => `${((Number(centimes) || 0) / 100).toFixed(2)} €`
const fmtDateFr = (input) => {
  if (!input) return ''
  const d = input?.toDate ? input.toDate() : (input instanceof Date ? input : new Date(input))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Génère un numéro de facture déterministe basé sur ID + mois courant
const buildInvoiceNumber = (expoId, eventId) => {
  const datePart = new Date().toISOString().slice(0, 7).replace('-', '')
  const shortId = (expoId || 'x').slice(-4).toUpperCase()
  const shortEv = (eventId || 'EV').slice(0, 3).toUpperCase()
  return `${shortEv}-${datePart}-${shortId}`
}

// ─── Construction du contexte de variables ─────────────────────────
// Le contexte est un objet plat {{exposant.nom}}: 'Bijoux Sahel' etc.
// Construit une fois pour chaque rendu et passé partout où on a besoin.
function buildVariableContext(expo, organisateur, eventId, tvaConfig = { active: false, defaultTaux: 0 }, tvaMentionExoneration = '') {
  const id = expo?.identite || {}
  const o  = organisateur || {}
  const paye    = computeExpoPaye(expo)
  const restant = computeExpoRestant(expo)
  const invoiceNum = buildInvoiceNumber(expo?.id, eventId)
  const dateFr     = fmtDateFr(new Date())

  // Adresse complète multi-ligne (joue avec les paragraphes auto-wrap)
  const expoAdrComplete = [id.adresse, [id.codePostal, id.ville].filter(Boolean).join(' ')]
    .filter(Boolean).join('\n')
  const orgAdrComplete = [o.adresse, [o.codePostal, o.ville].filter(Boolean).join(' ')]
    .filter(Boolean).join('\n')

  return {
    // Exposant
    '{{exposant.nom}}':             expoDisplayName(expo) || '—',
    '{{exposant.raisonSociale}}':   id.raisonSociale || '',
    '{{exposant.siret}}':           id.siret || '',
    '{{exposant.tva}}':             id.tva || '',
    '{{exposant.email}}':           id.email || expo?.contact || '',
    '{{exposant.telephone}}':       id.telephone || '',
    '{{exposant.adresse}}':         id.adresse || '',
    '{{exposant.codePostal}}':      id.codePostal || '',
    '{{exposant.ville}}':           id.ville || '',
    '{{exposant.adresseComplete}}': expoAdrComplete,
    '{{exposant.dirigeant}}':       id.dirigeant || '',
    // Notes / exceptions saisies par l'admin sur la fiche exposant
    // (champ "commentaires" persisté en base). Vide → chaîne vide pour ne pas
    // afficher "undefined" dans le PDF.
    '{{exposant.commentaires}}':    expo?.commentaires || '',

    // Organisateur
    '{{organisateur.raisonSociale}}':   o.raisonSociale || '',
    '{{organisateur.adresse}}':         o.adresse || '',
    '{{organisateur.codePostal}}':      o.codePostal || '',
    '{{organisateur.ville}}':           o.ville || '',
    '{{organisateur.siret}}':           o.siret || '',
    '{{organisateur.tva}}':             o.tva || '',
    '{{organisateur.iban}}':            o.iban || '',
    '{{organisateur.bic}}':             o.bic || '',
    '{{organisateur.banque}}':          o.banque || '',
    '{{organisateur.email}}':           o.email || '',
    '{{organisateur.telephone}}':       o.telephone || '',
    '{{organisateur.siteWeb}}':         o.siteWeb || '',
    '{{organisateur.adresseComplete}}': orgAdrComplete,

    // Facture
    '{{facture.numero}}': invoiceNum,
    '{{facture.date}}':   dateFr,

    // Montants
    '{{total}}':     fmtEur(expo?.montantTotal),
    '{{totalBrut}}': String((Number(expo?.montantTotal) || 0) / 100),
    '{{acompte}}':   expo?.acompte ? fmtEur(expo.acompte.montant) : '—',
    '{{solde}}':     expo?.solde   ? fmtEur(expo.solde.montant)   : '—',
    '{{paye}}':      fmtEur(paye),
    '{{restant}}':   fmtEur(restant),

    // Réductions (Lot C1+C2) — calculées plus bas
    ...buildReductionContext(expo),

    // TVA (Lot C3) — calculées plus bas
    ...buildTvaContext(expo, organisateur, tvaConfig, tvaMentionExoneration),
  }
}

/**
 * Calcule les variables liées aux réductions pour un exposant.
 * Retourne un objet plat {{sousTotalHT}}, {{totalReductions}},
 * {{reduction1.label}}, {{reduction1.montant}}, etc.
 *
 * Le sous-total HT est la somme des lignes APRÈS leurs réductions individuelles
 * mais AVANT les réductions globales. Cohérent avec le calcul du backend.
 */
function buildReductionContext(expo) {
  const lignes = Array.isArray(expo?.lignes) ? expo.lignes : []
  const sousTotalHT = lignes.reduce((a, l) => a + (Number(l.total) || 0), 0)
  // Réductions globales : montant déduit par chaque (en cascade)
  const reductions = Array.isArray(expo?.reductionsGlobales) ? expo.reductionsGlobales : []
  let base = sousTotalHT
  const montants = [] // montants déduits par réduction (en centimes)
  for (const r of reductions) {
    const v = Number(r?.value) || 0
    if (v <= 0 || !r.type) { montants.push(0); continue }
    let deduit = 0
    if (r.type === 'percent') deduit = Math.round((base * Math.min(100, v)) / 100)
    else if (r.type === 'amount') deduit = Math.min(v, base)
    montants.push(deduit)
    base -= deduit
    if (base < 0) base = 0
  }
  const totalReductions = montants.reduce((a, b) => a + b, 0)

  // Helper de formatage d'un libellé : "Remise volume (-10%)" ou "Remise (-5,00 €)"
  const fmtLabelWithValue = (r) => {
    if (!r) return ''
    const lab = (r.label || '').trim() || 'Réduction'
    if (r.type === 'percent') return `${lab} (-${r.value}%)`
    if (r.type === 'amount')  return `${lab} (-${((r.value || 0) / 100).toFixed(2)} €)`
    return lab
  }

  return {
    '{{sousTotalHT}}':       fmtEur(sousTotalHT),
    '{{totalReductions}}':   fmtEur(totalReductions),
    '{{reduction1.label}}':  reductions[0] ? fmtLabelWithValue(reductions[0]) : '',
    '{{reduction1.montant}}':reductions[0] ? '-' + fmtEur(montants[0]) : '',
    '{{reduction2.label}}':  reductions[1] ? fmtLabelWithValue(reductions[1]) : '',
    '{{reduction2.montant}}':reductions[1] ? '-' + fmtEur(montants[1]) : '',
  }
}

/**
 * Remplace toutes les variables {{key}} d'un texte par leur valeur dans le contexte.
 * Les variables inconnues sont laissées telles quelles (pour éviter de masquer des erreurs).
 */
function applyVars(text, ctx) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/\{\{[\w.]+\}\}/g, match => {
    if (ctx[match] !== undefined) return ctx[match]
    return match // Inconnu : on garde la variable visible
  })
}

/**
 * Calcule les variables TVA pour un exposant (Lot C3).
 * Si tvaConfig.active = false, retourne des valeurs vides + la mention exonération.
 *
 * Variables fournies :
 *   - {{totalHT}}            : total HT après réductions globales
 *   - {{totalTva}}            : montant total de TVA
 *   - {{totalTTC}}            : total TTC (= ce que le client doit payer)
 *   - {{tvaVentilation}}      : ventilation par taux, multi-lignes (ex: "TVA 20% sur 100,00 € : 20,00 €")
 *   - {{tvaNumero}}           : N° TVA intracom de l'organisateur (depuis settings.organisateur.tva)
 *   - {{tvaMentionExoneration}}: mention "TVA non applicable…" si désactivée, sinon vide
 *
 * Pour {{totalHT}} et {{totalTTC}} quand TVA inactive, on retourne le même montant
 * (le HT = TTC car pas de TVA), de façon à ce que les templates puissent utiliser
 * indifféremment {{total}} ou {{totalTTC}}.
 */
function buildTvaContext(expo, organisateur, tvaConfig, tvaMentionExoneration) {
  const lignes = Array.isArray(expo?.lignes) ? expo.lignes : []
  const sousTotalHT = lignes.reduce((a, l) => a + (Number(l.total) || 0), 0)
  // Recalcul des réductions globales pour cohérence (idem buildReductionContext)
  const reductions = Array.isArray(expo?.reductionsGlobales) ? expo.reductionsGlobales : []
  let baseHT = sousTotalHT
  for (const r of reductions) {
    const v = Number(r?.value) || 0
    if (v <= 0 || !r.type) continue
    if (r.type === 'percent') baseHT -= Math.round((baseHT * Math.min(100, v)) / 100)
    else if (r.type === 'amount') baseHT -= Math.min(v, baseHT)
    if (baseHT < 0) { baseHT = 0; break }
  }
  const totalHT = Math.max(0, baseHT)

  // Si TVA désactivée : pas de calcul TVA, mention 293 B
  if (!tvaConfig?.active) {
    return {
      '{{totalHT}}':      fmtEur(totalHT),
      '{{totalTva}}':     fmtEur(0),
      '{{totalTTC}}':     fmtEur(totalHT),  // = HT car pas de TVA
      '{{tvaVentilation}}': '',
      '{{tvaNumero}}':    organisateur?.tva || '',
      '{{tvaMentionExoneration}}': tvaMentionExoneration || '',
    }
  }

  // TVA active : calculer la ventilation par taux, proportionnellement aux réductions
  const ratio = sousTotalHT > 0 ? (totalHT / sousTotalHT) : 0
  const ventilation = {}
  let totalTva = 0
  for (const l of lignes) {
    const taux = Number.isFinite(Number(l.tauxTva)) ? Math.max(0, Number(l.tauxTva)) : tvaConfig.defaultTaux
    if (taux <= 0) continue
    const baseHTLigne = Math.round((Number(l.total) || 0) * ratio)
    const tva = Math.round((baseHTLigne * taux) / 100)
    totalTva += tva
    const k = String(taux)
    if (!ventilation[k]) ventilation[k] = { baseHT: 0, montantTva: 0 }
    ventilation[k].baseHT += baseHTLigne
    ventilation[k].montantTva += tva
  }
  const totalTTC = totalHT + totalTva

  // Ventilation formatée en texte multi-ligne pour l'affichage
  const ventilationLines = Object.entries(ventilation)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([taux, v]) => `TVA ${taux}% sur ${fmtEur(v.baseHT)} : ${fmtEur(v.montantTva)}`)
  const ventilationStr = ventilationLines.join('\n')

  return {
    '{{totalHT}}':      fmtEur(totalHT),
    '{{totalTva}}':     fmtEur(totalTva),
    '{{totalTTC}}':     fmtEur(totalTTC),
    '{{tvaVentilation}}': ventilationStr,
    '{{tvaNumero}}':    organisateur?.tva || '',
    '{{tvaMentionExoneration}}': '',  // pas affiché quand TVA active
  }
}

// ─── Helpers d'alignement et de rendu ──────────────────────────────
/**
 * Convertit l'alignement template ('left'|'center'|'right') en options jsPDF.
 * Calcule aussi l'abscisse de référence selon l'alignement.
 */
function alignParams(align, x, w) {
  switch (align) {
    case 'center': return { x: x + w / 2, opts: { align: 'center' } }
    case 'right':  return { x: x + w,     opts: { align: 'right' } }
    default:       return { x,            opts: { align: 'left' } }
  }
}

/**
 * Convertit #rrggbb en triplet jsPDF (r,g,b).
 */
function setColor(pdf, hex, mode = 'text') {
  if (!hex || typeof hex !== 'string') hex = '#000000'
  const clean = hex.replace('#', '')
  const n = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16) || 0
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  if (mode === 'text')   pdf.setTextColor(r, g, b)
  else if (mode === 'draw') pdf.setDrawColor(r, g, b)
  else if (mode === 'fill') pdf.setFillColor(r, g, b)
}

// ─── Rendu d'un élément individuel ─────────────────────────────────
function renderElement(pdf, el, ctx, expo, tvaConfig = { active: false, defaultTaux: 0 }) {
  switch (el.type) {
    case 'text':
    case 'field': {
      pdf.setFont('helvetica', el.bold && el.italic ? 'bolditalic'
        : el.bold ? 'bold'
        : el.italic ? 'italic'
        : 'normal')
      pdf.setFontSize(el.fontSize || 10)
      setColor(pdf, el.color || '#222222')
      const { x, opts } = alignParams(el.align || 'left', el.x, el.w)
      // Le texte est tracé depuis sa baseline ; on ajoute +1 mm pour aligner
      // visuellement avec le bord supérieur du conteneur.
      const content = applyVars(el.content || '', ctx)
      // Découpage anti-débordement horizontal
      const lines = pdf.splitTextToSize(content, el.w)
      let cy = el.y + (el.fontSize || 10) * 0.35
      for (const line of lines) {
        pdf.text(line, x, cy, opts)
        cy += (el.fontSize || 10) * 0.4 // line-height implicite
        if (cy > el.y + el.h) break  // Tronquer si dépasse la hauteur du conteneur
      }
      return
    }

    case 'paragraph': {
      pdf.setFont('helvetica', el.bold && el.italic ? 'bolditalic'
        : el.bold ? 'bold'
        : el.italic ? 'italic'
        : 'normal')
      pdf.setFontSize(el.fontSize || 10)
      setColor(pdf, el.color || '#444444')
      const { x, opts } = alignParams(el.align || 'left', el.x, el.w)
      const content = applyVars(el.content || '', ctx)
      // splitTextToSize respecte les \n manuels et wrap auto sur largeur
      const lines = pdf.splitTextToSize(content, el.w)
      const lh = (el.fontSize || 10) * (el.lineHeight || 1.4) * 0.353 // mm
      let cy = el.y + (el.fontSize || 10) * 0.35
      for (const line of lines) {
        if (cy > el.y + el.h) break // tronque si dépasse
        pdf.text(line, x, cy, opts)
        cy += lh
      }
      return
    }

    case 'image': {
      if (!el.src) {
        // Placeholder visuel : rectangle pointillé avec "Logo"
        pdf.setDrawColor(180, 180, 180)
        pdf.setLineDash && pdf.setLineDash([1, 1])
        pdf.rect(el.x, el.y, el.w, el.h)
        pdf.setLineDash && pdf.setLineDash([])
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        pdf.text('Image', el.x + el.w / 2, el.y + el.h / 2 + 1, { align: 'center' })
        return
      }
      try {
        const fmt = el.src.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        pdf.addImage(el.src, fmt, el.x, el.y, el.w, el.h, undefined, 'FAST')
      } catch (e) {
        console.warn('renderElement image error:', e.message)
      }
      return
    }

    case 'table': {
      // Tableau dynamique : itère sur les lignes de l'exposant.
      // Utilise jspdf-autotable pour gérer multi-pages + style.
      // Pour chaque ligne avec réduction (Lot C1+C2), on ajoute une sous-ligne en italique
      // qui montre le libellé + montant déduit, dans la colonne Description (colspan).
      const lignes = getExpoLignes(expo) || []
      const cols = Array.isArray(el.columns) ? el.columns : []

      // Index de la colonne "description" pour repérer où mettre la sous-ligne
      // de réduction. Si pas trouvée, on n'affichera pas les réductions de ligne.
      const descColIdx = cols.findIndex(c => c.field === 'description')

      // Construction des données : pour chaque ligne, on génère 1 ou 2 entrées
      // (1 = ligne normale ; 2 = ligne normale + sous-ligne réduction)
      const head = [cols.map(c => c.label || '')]
      const body = []
      const reductionRowIndices = [] // indices des lignes "réduction" dans le body

      for (const l of lignes) {
        // Ligne principale : on affiche le total NET (= total dans le modèle backend)
        // ou si pas de réduction, simplement qty*pu
        body.push(cols.map(c => {
          const raw = l[c.field]
          if (c.isCurrency) {
            // Pour la colonne "total", on affiche le total NET (déjà calculé en base).
            // Pour les autres colonnes monétaires (prixUnit), on garde la valeur brute.
            if (c.field === 'total') return fmtEur(l.total)
            return fmtEur(raw)
          }
          if (c.field === 'qty') return String(l.qty || 1)
          return String(raw ?? '—')
        }))
        // Sous-ligne réduction (si présente)
        if (l.reduction && descColIdx >= 0) {
          const v = Number(l.reduction.value) || 0
          if (v > 0) {
            const labelTxt = (l.reduction.label || '').trim()
            const dispo = l.reduction.type === 'percent'
              ? `−${v}%`
              : `−${(v / 100).toFixed(2)} €`
            const reducLabel = labelTxt
              ? `↳ ${labelTxt} ${dispo}`
              : `↳ Réduction ${dispo}`
            // Calcul du montant déduit pour cette ligne
            const brut = (Number(l.qty) || 1) * (Number(l.prixUnit) || 0)
            const deduit = l.reduction.type === 'percent'
              ? Math.round((brut * Math.min(100, v)) / 100)
              : Math.min(v, brut)
            // Construire la ligne avec le label dans la colonne description + le montant
            // dans la dernière colonne monétaire (total). Les autres colonnes vides.
            const reductionRow = cols.map((c, ci) => {
              if (ci === descColIdx) return reducLabel
              if (c.field === 'total') return '−' + fmtEur(deduit)
              return ''
            })
            reductionRowIndices.push(body.length)
            body.push(reductionRow)
          }
        }
      }

      // Colonnes styles
      const columnStyles = {}
      cols.forEach((c, i) => {
        columnStyles[i] = {
          cellWidth: c.width || 'auto',
          halign: c.align || 'left',
        }
      })

      const headerRgb = (() => {
        const h = (el.headerBg || '#F0F0F0').replace('#', '')
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      })()
      const headerTextRgb = (() => {
        const h = (el.headerColor || '#202020').replace('#', '')
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      })()

      autoTable(pdf, {
        startY: el.y,
        margin: { left: el.x, right: 210 - (el.x + el.w) },
        head, body,
        theme: 'grid',
        headStyles: {
          fillColor: headerRgb,
          textColor: headerTextRgb,
          fontStyle: 'bold',
          fontSize: el.headerFontSize || 10,
        },
        styles: {
          fontSize: el.fontSize || 10,
          cellPadding: 3,
        },
        columnStyles,
        // Hook pour styliser les sous-lignes "réduction" en italique gris
        didParseCell: (data) => {
          if (data.section === 'body' && reductionRowIndices.includes(data.row.index)) {
            data.cell.styles.fontStyle = 'italic'
            data.cell.styles.textColor = [100, 100, 100]
            data.cell.styles.fontSize = (el.fontSize || 10) - 1
          }
        },
      })

      // Bloc TOTAL avec décomposition réductions globales (Lot C1+C2)
      if (el.showTotal !== false) {
        let dy = pdf.lastAutoTable.finalY + 5

        // Sous-total (somme des lignes après réductions ligne)
        const sousTotalHT = lignes.reduce((a, l) => a + (Number(l.total) || 0), 0)
        const reductionsGlob = Array.isArray(expo?.reductionsGlobales) ? expo.reductionsGlobales : []
        const hasReductionsGlob = reductionsGlob.some(r => (Number(r?.value) || 0) > 0)

        // Calcul du Total HT après réductions globales
        let totalHTApresReductions = sousTotalHT
        for (const r of reductionsGlob) {
          const v = Number(r?.value) || 0
          if (v <= 0 || !r.type) continue
          if (r.type === 'percent') totalHTApresReductions -= Math.round((totalHTApresReductions * Math.min(100, v)) / 100)
          else if (r.type === 'amount') totalHTApresReductions -= Math.min(v, totalHTApresReductions)
          if (totalHTApresReductions < 0) totalHTApresReductions = 0
        }

        // Calcul TVA (Lot C3) — si active
        let totalTva = 0
        let ventilation = {}
        if (tvaConfig?.active && lignes.length > 0) {
          const ratio = sousTotalHT > 0 ? (totalHTApresReductions / sousTotalHT) : 0
          for (const l of lignes) {
            const taux = Number.isFinite(Number(l.tauxTva))
              ? Math.max(0, Number(l.tauxTva))
              : tvaConfig.defaultTaux
            if (taux <= 0) continue
            const baseHTLigne = Math.round((Number(l.total) || 0) * ratio)
            const tva = Math.round((baseHTLigne * taux) / 100)
            totalTva += tva
            const k = String(taux)
            if (!ventilation[k]) ventilation[k] = { baseHT: 0, montantTva: 0 }
            ventilation[k].baseHT += baseHTLigne
            ventilation[k].montantTva += tva
          }
        }
        const totalTTC = totalHTApresReductions + totalTva

        // Section 1 : Sous-total + détail réductions (si présentes)
        if (hasReductionsGlob) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(10)
          pdf.setTextColor(70, 70, 70)
          pdf.text('Sous-total :', el.x + el.w - 40, dy, { align: 'right' })
          pdf.text(fmtEur(sousTotalHT), el.x + el.w, dy, { align: 'right' })
          dy += 4

          let base = sousTotalHT
          for (const r of reductionsGlob) {
            const v = Number(r?.value) || 0
            if (v <= 0 || !r.type) continue
            let deduit = 0
            if (r.type === 'percent') deduit = Math.round((base * Math.min(100, v)) / 100)
            else if (r.type === 'amount') deduit = Math.min(v, base)
            const lab = (r.label || '').trim()
            const dispo = r.type === 'percent' ? ` (-${v}%)` : ` (-${(v / 100).toFixed(2)} €)`
            const txt = (lab || 'Réduction') + dispo + ' :'
            pdf.text(txt, el.x + el.w - 40, dy, { align: 'right' })
            pdf.text('−' + fmtEur(deduit), el.x + el.w, dy, { align: 'right' })
            dy += 4
            base -= deduit
            if (base < 0) base = 0
          }
          dy += 1
        }

        // Section 2 : si TVA active → Total HT + ventilation TVA + Total TTC
        // Sinon → simple ligne TOTAL avec montantTotal
        if (tvaConfig?.active) {
          // Total HT
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(10)
          pdf.setTextColor(70, 70, 70)
          pdf.text('Total HT :', el.x + el.w - 40, dy, { align: 'right' })
          pdf.text(fmtEur(totalHTApresReductions), el.x + el.w, dy, { align: 'right' })
          dy += 4

          // Ventilation TVA par taux (ordre croissant)
          pdf.setFontSize(9)
          pdf.setTextColor(90, 90, 90)
          for (const [taux, v] of Object.entries(ventilation).sort(([a], [b]) => Number(a) - Number(b))) {
            const txt = `TVA ${taux}% sur ${fmtEur(v.baseHT)} :`
            pdf.text(txt, el.x + el.w - 40, dy, { align: 'right' })
            pdf.text('+ ' + fmtEur(v.montantTva), el.x + el.w, dy, { align: 'right' })
            dy += 4
          }
          // Total TVA (si plusieurs taux, sinon redondant)
          if (Object.keys(ventilation).length > 1) {
            pdf.setFont('helvetica', 'normal')
            pdf.setFontSize(10)
            pdf.setTextColor(70, 70, 70)
            pdf.text('Total TVA :', el.x + el.w - 40, dy, { align: 'right' })
            pdf.text(fmtEur(totalTva), el.x + el.w, dy, { align: 'right' })
            dy += 4
          }
          dy += 1
          // Total TTC en gras
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(11)
          pdf.setTextColor(20, 20, 20)
          pdf.text('TOTAL TTC :', el.x + el.w - 40, dy, { align: 'right' })
          pdf.text(fmtEur(totalTTC), el.x + el.w, dy, { align: 'right' })
          dy += 5
        } else {
          // Pas de TVA : juste un TOTAL
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(11)
          pdf.setTextColor(20, 20, 20)
          pdf.text('TOTAL :', el.x + el.w - 40, dy, { align: 'right' })
          pdf.text(fmtEur(expo?.montantTotal), el.x + el.w, dy, { align: 'right' })
          dy += 5
        }

        // Détail des paiements si présents
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(70, 70, 70)
        if (expo?.acompte) {
          const meth = expo.acompte.method ? ` (${expo.acompte.method})` : ''
          pdf.text(
            `Acompte versé le ${fmtDateFr(expo.acompte.date)}${meth} :`,
            el.x + el.w - 40, dy, { align: 'right' }
          )
          pdf.text(`- ${fmtEur(expo.acompte.montant)}`, el.x + el.w, dy, { align: 'right' })
          dy += 4
        }
        if (expo?.solde) {
          const meth = expo.solde.method ? ` (${expo.solde.method})` : ''
          pdf.text(
            `Solde versé le ${fmtDateFr(expo.solde.date)}${meth} :`,
            el.x + el.w - 40, dy, { align: 'right' }
          )
          pdf.text(`- ${fmtEur(expo.solde.montant)}`, el.x + el.w, dy, { align: 'right' })
          dy += 4
        }
        const restant = computeExpoRestant(expo)
        if (computeExpoPaye(expo) > 0) {
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(10)
          pdf.setTextColor(restant > 0 ? 180 : 30, 30, 30)
          pdf.text('RESTANT DÛ :', el.x + el.w - 40, dy, { align: 'right' })
          pdf.text(fmtEur(restant), el.x + el.w, dy, { align: 'right' })
        }
      }
      return
    }

    case 'line': {
      setColor(pdf, el.color || '#CCCCCC', 'draw')
      pdf.setLineWidth(el.strokeWidth || 0.3)
      pdf.line(el.x, el.y, el.x + el.w, el.y)
      return
    }

    case 'rect': {
      // Fond + bordure (les deux indépendants)
      const hasFill = el.fillColor && el.fillColor !== 'transparent'
      const hasBorder = el.borderColor && el.borderWidth > 0
      if (hasFill) setColor(pdf, el.fillColor, 'fill')
      if (hasBorder) {
        setColor(pdf, el.borderColor, 'draw')
        pdf.setLineWidth(el.borderWidth || 0.3)
      }
      const style = hasFill && hasBorder ? 'FD' : hasFill ? 'F' : hasBorder ? 'S' : 'S'
      pdf.rect(el.x, el.y, el.w, el.h, style)
      return
    }

    default:
      console.warn('Type d\'élément non supporté :', el.type)
  }
}

/**
 * Génère un PDF de facture depuis un template + un exposant + l'organisateur.
 *
 * @param {object} options
 *   - template : objet template JSON
 *   - expo     : exposant (avec lignes, paiements, etc.)
 *   - organisateur : settings.organisateur
 *   - eventId  : pour générer le numéro de facture
 *   - returnBlob : si true, retourne un Blob au lieu de save()
 * @returns {void | Blob}
 */
export function renderInvoiceFromTemplate({
  template, expo, organisateur, eventId,
  tvaConfig = { active: false, defaultTaux: 0 },
  tvaMentionExoneration = 'TVA non applicable, art. 293 B du CGI',
  returnBlob = false,
}) {
  const pdf = new jsPDF({ unit: 'mm', format: template?.format || 'a4' })
  const ctx = buildVariableContext(expo, organisateur, eventId, tvaConfig, tvaMentionExoneration)

  // Tri des éléments : tableaux en dernier car ils peuvent étendre la page.
  // Les autres éléments sont rendus dans l'ordre du tableau (= ordre Z).
  const ordered = [...(template?.elements || [])].sort((a, b) => {
    if (a.type === 'table' && b.type !== 'table') return 1
    if (b.type === 'table' && a.type !== 'table') return -1
    return 0
  })

  for (const el of ordered) {
    if (el.skipIfEmpty) {
      const checkVar = el.skipIfEmptyVar || null
      const isEmpty = checkVar
        ? !((ctx[checkVar] || '').toString().trim())
        : !applyVars(el.content || '', ctx).trim()
      if (isEmpty) continue
    }
    try { renderElement(pdf, el, ctx, expo, tvaConfig) }
    catch (e) { console.warn(`Rendu élément ${el.id} échoué :`, e.message) }
  }

  if (returnBlob) return pdf.output('blob')

  const safeNom = (expoDisplayName(expo) || 'exposant').replace(/[^\w]+/g, '_')
  pdf.save(`Facture_${safeNom}_${buildInvoiceNumber(expo?.id, eventId)}.pdf`)
}
