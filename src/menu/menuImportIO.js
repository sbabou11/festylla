/**
 * menu/menuImportIO.js — fichiers et écritures de l'import de la carte
 *
 * - downloadMenuTemplate(categories) : modèle Excel avec exemple et listes déroulantes
 * - readSpreadsheet(file)            : lignes d'un fichier .xlsx ou .csv
 * - importMenuRows(rows, opts)       : crée ou met à jour les articles (et les catégories manquantes)
 * - generateImages(items, opts)      : génère les images une par une (3 à la fois)
 */
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { addMenuItem, updateMenuItem, uploadMenuItemPhoto } from '../firebase/service'
import { ALLERGENES_UE } from '../utils/allergenes'
import { resizeImageToBlob } from '../utils/imageUtils'
import { generateMenuImage } from '../utils/generateImage'
import { COLUMNS, TYPE_VALUES, fold } from './menuImport'

const loadExcel = async () => (await import('exceljs')).default

export async function downloadMenuTemplate(categories = []) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Articles', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUMNS.map(c => ({ header: c.title, key: c.key, width: c.width }))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B7A' } }
  head.alignment = { vertical: 'middle', wrapText: true }
  head.height = 32
  ws.addRow(Object.fromEntries(COLUMNS.map(c => [c.key, c.example])))
  ws.getRow(2).font = { italic: true, color: { argb: 'FF6B6B6B' } }
  ws.getColumn('prix').numFmt = '#,##0.00 "€"'

  // Listes : rubriques existantes (saisie libre acceptée), consommation bénévole, image
  const lists = wb.addWorksheet('Listes')
  lists.getColumn(1).width = 28
  lists.getCell('A1').value = 'Allergènes officiels (colonne Allergènes, séparés par des virgules)'
  lists.getCell('A1').font = { bold: true }
  ALLERGENES_UE.forEach((a, i) => { lists.getCell(`A${i + 2}`).value = a.label })
  lists.getCell('C1').value = 'Catégories existantes'
  lists.getCell('C1').font = { bold: true }
  lists.getColumn(3).width = 24
  categories.forEach((c, i) => { lists.getCell(`C${i + 2}`).value = c })

  for (let r = 2; r <= 500; r++) {
    ws.getCell(`F${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${TYPE_VALUES.join(',')}"`] }
    ws.getCell(`J${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Oui,Non"'] }
    if (categories.length) {
      ws.getCell(`B${r}`).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: false, formulae: [`Listes!$C$2:$C$${categories.length + 1}`],
      }
    }
  }
  ws.getCell('A1').note = 'Une ligne par article. Nom et Prix sont obligatoires. La ligne « Exemple : … » est ignorée à l\'import.'
  ws.getCell('H1').note = 'Séparez les allergènes par des virgules. Liste officielle dans l\'onglet « Listes ».'
  ws.getCell('J1').note = 'Oui (par défaut) : une image est générée automatiquement à l\'import.'

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'Modèle carte YllaCash.xlsx'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const cellValue = (v) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if ('result' in v) return v.result ?? ''      // formule : valeur calculée
    if (v.text) return v.text                      // lien hypertexte
    if (v instanceof Date) return v.toLocaleDateString('fr-FR')
  }
  return v
}

/** Tableau de lignes (la première contient les titres). */
export async function readSpreadsheet(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const Papa = (await import('papaparse')).default
    const text = await file.text()
    return Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: false }).data
  }
  if (!name.endsWith('.xlsx')) throw new Error('Format non pris en charge : choisissez un fichier .xlsx (Excel) ou .csv.')
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(await file.arrayBuffer()) } catch { throw new Error('Le fichier Excel est illisible.') }
  const ws = wb.getWorksheet('Articles') || wb.worksheets[0]
  if (!ws) throw new Error('Le fichier ne contient aucune feuille.')
  const rows = []
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals = []
    for (let c = 1; c <= Math.max(row.cellCount, COLUMNS.length); c++) vals.push(cellValue(row.getCell(c).value))
    rows[n - 1] = vals
  })
  return Array.from(rows, r => r || [])
}

/**
 * Crée les articles. duplicates : 'update' (met à jour l'article existant) ou 'skip'.
 * Renvoie [{ id, nom, generateImage, hadPhoto }] pour la génération des images.
 */
export async function importMenuRows(rows, { eventId, categories = [], duplicates = 'update', onProgress }) {
  const known = new Set(categories.map(fold))
  const newCats = [...new Set(rows.map(r => r.data.cat).filter(c => c && !known.has(fold(c))))]
  const COLORS = ['#009090', '#F07848', '#BA7517', '#0F6E56', '#2563EB', '#7C3AED', '#D97706', '#059669']
  for (const [i, nom] of newCats.entries()) {
    await addDoc(collection(db, 'events', eventId, 'categories'), {
      nom, couleur: COLORS[i % COLORS.length], icon: 'utensils', ordre: categories.length + i + 1, createdAt: serverTimestamp(),
    })
  }

  const done = []
  let k = 0
  for (const r of rows) {
    onProgress?.({ label: `Articles : ${++k} / ${rows.length}`, ratio: k / rows.length })
    if (r.existingId) {
      if (duplicates === 'skip') continue
      await updateMenuItem(r.existingId, r.data)
      done.push({ id: r.existingId, nom: r.data.nom, generateImage: r.generateImage, hadPhoto: !!r.existingPhoto })
    } else {
      const ref = await addMenuItem(r.data)
      done.push({ id: ref.id, nom: r.data.nom, generateImage: r.generateImage, hadPhoto: false })
    }
  }
  return { items: done, newCategories: newCats }
}

// Erreurs qui arrêtent tout le lot (inutile d'insister pour les articles suivants)
const FATAL = /pas encore configurée|Solde Higgsfield|Limite atteinte : \d+ images générées pour cet événement/

/** Génère et enregistre les images, 3 à la fois. Renvoie { ok, failed: [{ nom, error }], stopped } */
export async function generateImages(items, { eventId, signal, onProgress }) {
  const queue = [...items]
  let ok = 0, n = 0, stopReason = null
  const failed = []
  const worker = async () => {
    while (queue.length && !signal?.aborted && !stopReason) {
      const it = queue.shift()
      try {
        const blob = await generateMenuImage({ eventId, itemId: it.id, signal })
        const jpeg = await resizeImageToBlob(blob, 1024, 0.88)
        const file = new File([jpeg], `image-generee-${it.id}.jpg`, { type: 'image/jpeg' })
        await uploadMenuItemPhoto(it.id, file, null, eventId, { photoGenerated: true })
        ok++
      } catch (e) {
        if (e.name === 'AbortError') return
        failed.push({ nom: it.nom, error: e.message || 'Échec' })
        if (FATAL.test(e.message || '')) stopReason = e.message
      }
      n++
      onProgress?.({ label: `Images : ${n} / ${items.length}`, ratio: n / items.length, ok, failed: failed.length })
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { ok, failed, stopped: stopReason || (signal?.aborted ? 'Arrêté' : null), remaining: queue.map(i => i.nom) }
}
