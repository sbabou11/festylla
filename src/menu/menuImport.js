/**
 * menu/menuImport.js — import de la carte depuis un fichier Excel ou CSV
 *
 * Fonctions pures (testées dans menuImport.test.js) :
 * - COLUMNS        : colonnes du modèle, dans l'ordre
 * - mapHeader()    : reconnaît les colonnes d'après leur titre (ordre libre, accents ignorés)
 * - parseMenuRows(): contrôle chaque ligne et prépare les articles à créer
 */
import { ALLERGENES_UE } from '../utils/allergenes'

export const COLUMNS = [
  { key: 'nom', title: 'Nom', required: true, width: 32, example: 'Exemple : Riz thiep' },
  { key: 'cat', title: 'Catégorie', width: 18, example: 'Plats' },
  { key: 'prix', title: 'Prix (€)', required: true, width: 10, example: 12.5 },
  { key: 'stock', title: 'Stock', width: 9, example: 100 },
  { key: 'seuil', title: 'Seuil d\'alerte stock', width: 12, example: 10 },
  { key: 'type', title: 'Consommation bénévole', width: 16, example: 'Repas' },
  { key: 'composition', title: 'Composition (visible par les clients)', width: 46, example: 'Riz, poisson, légumes, sauce tomate' },
  { key: 'allergenes', title: 'Allergènes', width: 28, example: 'Poissons, Céleri' },
  { key: 'autres', title: 'Autres allergènes', width: 20, example: 'Piment fort' },
  { key: 'image', title: 'Générer l\'image', width: 12, example: 'Oui' },
]
export const TYPE_VALUES = ['Repas', 'Boisson', 'Eau']

export const fold = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

// Mots qui suffisent à reconnaître une colonne, même si le titre a été un peu modifié
const HEADER_HINTS = [
  ['autres', /autre/], ['seuil', /seuil|alerte/], ['allergenes', /allerg/], ['composition', /compo|description|ingredient/],
  ['type', /benevole|consommation|type/], ['image', /image|photo/], ['cat', /categ|rubrique/],
  ['prix', /prix|tarif/], ['stock', /stock|quantit/], ['nom', /nom|article|produit|libelle/],
]

/** Index de chaque colonne dans la ligne de titres : { nom: 0, prix: 2, … } */
export function mapHeader(headerRow) {
  const map = {}
  ;(headerRow || []).forEach((cell, i) => {
    const t = fold(cell)
    if (!t) return
    const hit = HEADER_HINTS.find(([key, re]) => re.test(t) && map[key] === undefined)
    if (hit) map[hit[0]] = i
  })
  return map
}

/** « 12,50 € », « 12.5 », 12.5 → 1250 centimes ; null si illisible */
export function parsePriceCents(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null
  const t = String(v ?? '').replace(/[€\s ]/g, '').replace(',', '.')
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null
  return Math.round(parseFloat(t) * 100)
}

function parseIntField(v, def) {
  if (v === null || v === undefined || String(v).trim() === '') return { value: def }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return { value: def, bad: true }
  return { value: Math.round(n) }
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  }
  return d[a.length][b.length]
}

const ALLERGEN_KEYS = ALLERGENES_UE.map(a => ({ code: a.code, label: a.label, keys: [fold(a.label), fold(a.code).replace(/_/g, ' ')] }))
// Synonymes courants
const ALLERGEN_SYNONYMS = { 'sesame': 'sesame', 'graines de sesame': 'sesame', 'fruits a coque': 'fruits_coque', 'noix': 'fruits_coque', 'poisson': 'poissons', 'oeuf': 'oeufs', 'crustace': 'crustaces', 'mollusque': 'mollusques', 'arachide': 'arachides', 'cacahuete': 'arachides', 'cacahuetes': 'arachides', 'lactose': 'lait', 'ble': 'gluten' }

/** Reconnaît un allergène : { code, label, exact } ou null */
export function matchAllergen(text) {
  const t = fold(text)
  if (!t) return null
  for (const a of ALLERGEN_KEYS) if (a.keys.includes(t)) return { code: a.code, label: a.label, exact: true }
  if (ALLERGEN_SYNONYMS[t]) { const a = ALLERGENES_UE.find(x => x.code === ALLERGEN_SYNONYMS[t]); return { code: a.code, label: a.label, exact: false } }
  let best = null
  for (const a of ALLERGEN_KEYS) for (const k of a.keys) {
    const dd = distance(t, k)
    if (dd <= 2 && (!best || dd < best.d)) best = { code: a.code, label: a.label, d: dd }
  }
  return best ? { code: best.code, label: best.label, exact: false } : null
}

const splitList = (v) => String(v ?? '').split(/[,;/\n]+/).map(x => x.trim()).filter(Boolean)

/**
 * Contrôle les lignes lues (première ligne = titres).
 * existing : articles déjà dans la carte [{ id, nom }]
 * Renvoie { rows, missingColumns } ; chaque ligne : { line, data, errors, warnings, existingId, generateImage }
 */
export function parseMenuRows(table, existing = []) {
  const [header, ...body] = table || []
  const col = mapHeader(header)
  const missingColumns = COLUMNS.filter(c => c.required && col[c.key] === undefined).map(c => c.title)
  if (missingColumns.length) return { rows: [], missingColumns }

  const byName = new Map(existing.map(m => [fold(m.nom), m.id]))
  const seen = new Map()
  const rows = []
  body.forEach((r, i) => {
    const get = (k) => (col[k] === undefined ? '' : r[col[k]])
    const line = i + 2
    if (!r || r.every(c => String(c ?? '').trim() === '')) return
    // Ligne d'exemple du modèle oubliée : ignorée
    if (/^exemple\s*:/.test(fold(get('nom')))) return
    const errors = [], warnings = []
    const nom = String(get('nom') ?? '').trim()
    if (!nom) errors.push('Nom manquant')

    const prix = parsePriceCents(get('prix'))
    if (prix === null) errors.push(String(get('prix') ?? '').trim() ? `Prix illisible : « ${get('prix')} »` : 'Prix manquant')

    const stock = parseIntField(get('stock'), 100)
    if (stock.bad) warnings.push('Stock illisible : 100 retenu')
    const seuil = parseIntField(get('seuil'), 10)
    if (seuil.bad) warnings.push('Seuil d\'alerte illisible : 10 retenu')

    const typeRaw = fold(get('type'))
    const type = ['repas', 'boisson', 'eau'].find(t => typeRaw.startsWith(t)) || ''
    if (typeRaw && !type) warnings.push(`Consommation bénévole « ${get('type')} » non reconnue : laissée vide`)

    const allergenes = [], autres = splitList(get('autres'))
    for (const a of splitList(get('allergenes'))) {
      const m = matchAllergen(a)
      if (!m) { autres.push(a); warnings.push(`« ${a} » n'est pas l'un des 14 allergènes officiels : mis dans Autres allergènes`) }
      else {
        if (!m.exact) warnings.push(`« ${a} » compris comme « ${m.label} »`)
        if (!allergenes.includes(m.code)) allergenes.push(m.code)
      }
    }

    const img = fold(get('image'))
    const generateImage = !['non', 'no', 'n', '0', 'false', 'faux'].includes(img)

    const key = fold(nom)
    if (nom && seen.has(key)) errors.push(`Doublon de la ligne ${seen.get(key)} dans le fichier`)
    else if (nom) seen.set(key, line)

    rows.push({
      line,
      errors,
      warnings,
      existingId: nom ? byName.get(key) || null : null,
      generateImage,
      data: {
        nom,
        prix: prix ?? 0,
        stock: stock.value,
        cat: String(get('cat') ?? '').trim(),
        seuilAlerte: seuil.value,
        typeConsommation: type,
        description: String(get('composition') ?? '').trim(),
        allergenes,
        allergenesCustom: [...new Set(autres)],
      },
    })
  })
  return { rows, missingColumns }
}
