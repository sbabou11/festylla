/**
 * archive/readable.js — classeur Excel joint à chaque archive, lisible sans YllaCash
 *
 * Une feuille par type de données. Les montants enregistrés en centimes sont convertis
 * en euros (colonnes « (€) ») ; les cachets sont déjà en euros dans la base.
 */

// Libellés des feuilles et champs en centimes à convertir
const SHEETS = {
  spectateurs: { title: 'Spectateurs', cents: ['solde'] },
  transactions: { title: 'Transactions', cents: ['montant', 'soldeBefore', 'soldeAfter'] },
  reservations: { title: 'Réservations', cents: ['total', 'montant'] },
  commandes: { title: 'Commandes', cents: ['total', 'montant'] },
  menu: { title: 'Menu', cents: ['prix'] },
  finances: { title: 'Dépenses et recettes', cents: ['montant'] },
  cachets: { title: 'Cachets (en €)', cents: [] },
  expositions: { title: 'Exposants', cents: ['montantTotal'] },
  benevoles: { title: 'Bénévoles', cents: [] },
  staff: { title: 'Équipe', cents: [] },
  planning: { title: 'Planning', cents: [] },
  'volunteer-shifts': { title: 'Créneaux bénévoles', cents: [] },
  'artist-consumptions': { title: 'Consos artistes', cents: ['montant', 'total'] },
  'demandes-remboursement': { title: 'Demandes de remboursement', cents: ['total'] },
  clotures: { title: 'Clôtures', cents: [] },
  audit: { title: 'Historique', cents: ['montant'] },
  notifications: { title: 'Notifications', cents: [] },
}
const SKIP = new Set(['team-chat-typing', 'walkie-chunks', 'walkie-state', '_counters', 'analysisTables', 'settings'])

const isTs = (v) => v && typeof v === 'object' && typeof v.toDate === 'function'

function cell(v) {
  if (v === null || v === undefined) return ''
  if (isTs(v)) return v.toDate()
  if (typeof v === 'string') return v.startsWith('data:') ? '[image]' : v.slice(0, 32000)
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) {
    // Lignes d'articles : « 2 × Riz thiep, 1 × Bissap »
    if (v.every(x => x && typeof x === 'object' && (x.nom || x.description))) {
      return v.map(x => `${x.qty ?? x.quantite ?? 1} × ${x.nom || x.description}`).join(', ')
    }
    return JSON.stringify(v).slice(0, 32000)
  }
  return JSON.stringify(v, (k, x) => (typeof x === 'string' && x.startsWith('data:') ? '[image]' : x)).slice(0, 32000)
}

export async function buildReadableWorkbook(event, raw) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YllaCash'

  const sum = wb.addWorksheet('Résumé')
  sum.columns = [{ width: 34 }, { width: 50 }]
  sum.addRows([
    ['Édition', event.nom || ''],
    ['Dates', [event.date, event.dateFin].filter(Boolean).join(' → ')],
    ['Lieu', event.lieu || ''],
    ['Archive créée le', new Date().toLocaleString('fr-FR')],
    [],
    ['Données', 'Nombre'],
    ...Object.entries(raw).map(([k, docs]) => [SHEETS[k]?.title || k, docs.length]),
  ])
  sum.getColumn(1).font = { bold: true }

  const names = [...Object.keys(SHEETS), ...Object.keys(raw).filter(k => !SHEETS[k] && !SKIP.has(k))]
  for (const name of names) {
    const docs = raw[name]
    if (!docs?.length) continue
    const conf = SHEETS[name] || { title: name, cents: [] }
    const keys = []
    for (const d of docs) for (const k of Object.keys(d.data)) if (!keys.includes(k)) keys.push(k)
    const ws = wb.addWorksheet(conf.title.slice(0, 31))
    const header = ['id', ...keys.map(k => (conf.cents.includes(k) ? `${k} (€)` : k))]
    ws.addRow(header).font = { bold: true }
    for (const d of docs) {
      ws.addRow([d.id, ...keys.map(k => {
        const v = d.data[k]
        return conf.cents.includes(k) && typeof v === 'number' ? v / 100 : cell(v)
      })])
    }
    keys.forEach((k, i) => {
      const col = ws.getColumn(i + 2)
      if (conf.cents.includes(k)) col.numFmt = '#,##0.00 "€"'
      col.width = Math.min(40, Math.max(10, k.length + 4))
    })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  return wb.xlsx.writeBuffer()
}
