/**
 * api/analyse-xlsx.js — Vercel Serverless Function Node.js
 * Génère un fichier .xlsx stylé pour un tableau croisé d'analyse (Comptabilité).
 * Styles alignés sur api/rapport.js (mêmes couleurs brand, en-têtes, totaux).
 *
 * POST /api/analyse-xlsx — body JSON :
 *   {
 *     event: { nom, couleur },
 *     appVersion,
 *     table: {
 *       name, articles: [string], showUnits: bool, detail: bool, subtotalsByDay: bool
 *     },
 *     rows: [ { dateLabel, kindLabel, ref, dayLabel, perArticle: { [art]: {montant, qty} }, rowTotal } ],
 *     dayGroups: [ { label, perArticle:{[art]:montant}, units:{[art]:qty}, txCount:{[art]:n}, total, nbTx } ],
 *     totals: { perArticle:{[art]:montant}, units:{[art]:qty}, txCount:{[art]:n}, global, nbLignes }
 *   }
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  let data = {}
  try {
    if (req.body && typeof req.body === 'object') {
      data = req.body
    } else {
      const raw = await new Promise((resolve, reject) => {
        let body = ''
        req.on('data', c => { body += c })
        req.on('end', () => resolve(body))
        req.on('error', reject)
      })
      if (raw) data = JSON.parse(raw)
    }
  } catch (e) { res.status(400).send('Invalid JSON: ' + e.message); return }

  try {
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = `YllaCash ${data.appVersion || 'v1.0.0'}`
    wb.created = new Date()

    const event = data.event || {}
    const table = data.table || {}
    const rows = data.rows || []
    const dayGroups = data.dayGroups || []
    const totals = data.totals || { perArticle: {}, units: {}, txCount: {}, global: 0, nbLignes: 0 }
    const articles = table.articles || []
    const showUnits = table.showUnits !== false
    const detail = table.detail !== false
    const byDay = table.subtotalsByDay !== false && dayGroups.length > 1

    const nom = event.nom || 'Événement'
    const brand = (event.couleur || '#1a6b7a').replace('#', '')

    const dk = (h, f = 0.15) => { const r = Math.floor(parseInt(h.slice(0,2),16)*(1-f)), g = Math.floor(parseInt(h.slice(2,4),16)*(1-f)), b = Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h, f = 0.88) => { const r = Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)), g = Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)), b = Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND = 'FF'+brand.toUpperCase(), BRANDL = 'FF'+lt(brand), BRANDD = 'FF'+dk(brand)
    const W = 'FFFFFFFF', GBG = 'FFF8F9FA', DAYBG = 'FF'+lt(brand, 0.7)
    const EUR = '#,##0.00 "€"'
    const now = new Date().toLocaleString('fr-FR')

    const bord = { top:{style:'thin',color:{argb:'FFE2E8F0'}}, bottom:{style:'thin',color:{argb:'FFE2E8F0'}}, left:{style:'thin',color:{argb:'FFE2E8F0'}}, right:{style:'thin',color:{argb:'FFE2E8F0'}} }
    const S = {
      h1:  {font:{name:'Arial',bold:true,size:16,color:{argb:W}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND}}, alignment:{horizontal:'left',vertical:'middle'}},
      sub: {font:{name:'Arial',size:9,color:{argb:'FF64748B'}}, alignment:{horizontal:'left',vertical:'middle'}},
      th:  {font:{name:'Arial',bold:true,size:10,color:{argb:W}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND}}, alignment:{horizontal:'center',vertical:'middle',wrapText:true}, border:bord},
      td:  {font:{name:'Arial',size:10}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:W}}, alignment:{horizontal:'left',vertical:'middle'}, border:bord},
      td2: {font:{name:'Arial',size:10}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:GBG}}, alignment:{horizontal:'left',vertical:'middle'}, border:bord},
      numR:{font:{name:'Arial',size:10}, alignment:{horizontal:'right',vertical:'middle'}, border:bord},
      day: {font:{name:'Arial',bold:true,size:10,color:{argb:BRANDD}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:DAYBG}}, alignment:{horizontal:'left',vertical:'middle'}, border:bord},
      sub2:{font:{name:'Arial',bold:true,size:10,color:{argb:BRANDD}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:DAYBG}}, alignment:{horizontal:'right',vertical:'middle'}, border:bord},
      tot: {font:{name:'Arial',bold:true,size:11,color:{argb:W}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDD}}, alignment:{horizontal:'right',vertical:'middle'}, border:bord},
      totL:{font:{name:'Arial',bold:true,size:11,color:{argb:W}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDD}}, alignment:{horizontal:'left',vertical:'middle'}, border:bord},
    }
    const ap = (cell, s, val, fmt) => { if(s.font)cell.font=s.font; if(s.fill)cell.fill=s.fill; if(s.alignment)cell.alignment=s.alignment; if(s.border)cell.border=s.border; if(val!==undefined)cell.value=val; if(fmt)cell.numFmt=fmt }

    const ws = wb.addWorksheet('Analyse', { views: [{ state: 'frozen', ySplit: 4 }] })

    // Largeur colonnes : Date, Type, (article [€, U])..., Total
    const colWidths = [16, 16]
    articles.forEach(() => { colWidths.push(13); if (showUnits) colWidths.push(8) })
    colWidths.push(13)
    ws.columns = colWidths.map(w => ({ width: w }))

    const nCols = 2 + articles.length * (showUnits ? 2 : 1) + 1

    // Titre
    ws.mergeCells(1, 1, 1, nCols)
    ap(ws.getCell(1, 1), S.h1, `${table.name || 'Tableau d\'analyse'} — ${nom}`)
    ws.getRow(1).height = 24
    ws.mergeCells(2, 1, 2, nCols)
    ap(ws.getCell(2, 1), S.sub, `Généré le ${now} · ${rows.length} transaction(s)`)

    // En-tête (ligne 4) — articles avec sous-libellés € / U
    let r = 4
    ap(ws.getCell(r, 1), S.th, 'Date')
    ap(ws.getCell(r, 2), S.th, 'Type')
    let col = 3
    articles.forEach(a => {
      if (showUnits) {
        ws.mergeCells(r, col, r, col + 1)
        ap(ws.getCell(r, col), S.th, a)
        col += 2
      } else {
        ap(ws.getCell(r, col), S.th, a); col += 1
      }
    })
    ap(ws.getCell(r, col), S.th, 'Total')
    ws.getRow(r).height = 28

    // Lignes de détail
    r = 5
    const writeArticleCells = (startCol, perArticle, styleNum, styleTxt) => {
      let cc = startCol
      articles.forEach(a => {
        const cell = perArticle[a]
        ap(ws.getCell(r, cc), styleNum, cell ? cell.montant : null, cell ? EUR : undefined)
        if (!cell) ws.getCell(r, cc).value = '—'
        cc += 1
        if (showUnits) {
          ap(ws.getCell(r, cc), styleNum, cell ? cell.qty : '—')
          cc += 1
        }
      })
      return cc
    }

    if (detail) {
      let altIdx = 0
      const renderRow = (row) => {
        const base = altIdx % 2 === 0 ? S.td : S.td2
        ap(ws.getCell(r, 1), base, row.dateLabel)
        ap(ws.getCell(r, 2), base, row.kindLabel || '')
        const cc = writeArticleCells(3, row.perArticle || {}, { ...S.numR }, base)
        ap(ws.getCell(r, cc), { ...S.numR, font:{...S.numR.font, bold:true} }, row.rowTotal, EUR)
        r += 1; altIdx += 1
      }
      if (byDay) {
        dayGroups.forEach(g => {
          // bandeau jour
          ws.mergeCells(r, 1, r, nCols)
          ap(ws.getCell(r, 1), S.day, g.label); r += 1
          ;(g.rows || []).forEach(renderRow)
          // sous-totaux jour
          writeSubtotal(`Sous-total ${g.label}`, g)
        })
      } else {
        rows.forEach(renderRow)
      }
    }

    function writeSubtotal(label, src) {
      // CA
      ap(ws.getCell(r, 1), S.sub2, label)
      ap(ws.getCell(r, 2), S.sub2, '')
      let cc = 3
      articles.forEach(a => {
        ap(ws.getCell(r, cc), S.sub2, src.perArticle?.[a] || 0, EUR); cc += 1
        if (showUnits) { ap(ws.getCell(r, cc), S.sub2, src.units?.[a] || 0); cc += 1 }
      })
      ap(ws.getCell(r, cc), S.sub2, src.total != null ? src.total : src.global || 0, EUR)
      r += 1
      // Transactions
      ap(ws.getCell(r, 1), S.sub2, 'Transactions'); ap(ws.getCell(r, 2), S.sub2, '')
      cc = 3
      articles.forEach(a => {
        ap(ws.getCell(r, cc), S.sub2, src.txCount?.[a] || 0); cc += 1
        if (showUnits) { ap(ws.getCell(r, cc), S.sub2, ''); cc += 1 }
      })
      ap(ws.getCell(r, cc), S.sub2, src.nbTx != null ? src.nbTx : src.nbLignes || 0)
      r += 1
    }

    // Totaux globaux (style fort)
    const writeGrandTotal = () => {
      // Total CA
      ap(ws.getCell(r, 1), S.totL, 'TOTAL CA'); ap(ws.getCell(r, 2), S.tot, '')
      let cc = 3
      articles.forEach(a => {
        ap(ws.getCell(r, cc), S.tot, totals.perArticle?.[a] || 0, EUR); cc += 1
        if (showUnits) { ap(ws.getCell(r, cc), S.tot, totals.units?.[a] || 0); cc += 1 }
      })
      ap(ws.getCell(r, cc), S.tot, totals.global || 0, EUR)
      r += 1
      // Transactions
      ap(ws.getCell(r, 1), S.totL, 'TRANSACTIONS'); ap(ws.getCell(r, 2), S.tot, '')
      cc = 3
      articles.forEach(a => {
        ap(ws.getCell(r, cc), S.tot, totals.txCount?.[a] || 0); cc += 1
        if (showUnits) { ap(ws.getCell(r, cc), S.tot, ''); cc += 1 }
      })
      ap(ws.getCell(r, cc), S.tot, totals.nbLignes || 0)
      r += 1
      // Unités (si affichées)
      if (showUnits) {
        ap(ws.getCell(r, 1), S.totL, 'UNITÉS'); ap(ws.getCell(r, 2), S.tot, '')
        cc = 3
        let totU = 0
        articles.forEach(a => {
          ap(ws.getCell(r, cc), S.tot, ''); cc += 1
          const u = totals.units?.[a] || 0
          ap(ws.getCell(r, cc), S.tot, u); totU += u; cc += 1
        })
        ap(ws.getCell(r, cc), S.tot, totU)
        r += 1
      }
    }
    writeGrandTotal()

    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="analyse.xlsx"`)
    res.status(200).send(Buffer.from(buf))
  } catch (e) {
    res.status(500).send('Erreur génération xlsx: ' + e.message)
  }
}
