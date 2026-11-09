/**
 * api/audit.js — Vercel Serverless Function Node.js
 * Génère un XLSX stylisé du Journal d'audit
 * POST /api/audit — body JSON { event, audit }
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
        req.on('data', chunk => { body += chunk })
        req.on('end', () => resolve(body))
        req.on('error', reject)
      })
      if (raw) data = JSON.parse(raw)
    }
  } catch(e) {
    res.status(400).send('Invalid JSON: ' + e.message); return
  }

  try {
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = `YllaCash ${data.appVersion || 'v1.0.0'}`; wb.created = new Date()

    const event    = data.event || {}
    const auditLst = data.audit || []
    const nom      = event.nom  || 'Événement'
    const brand    = (event.couleur || '#1a6b7a').replace('#', '')

    const dk = (h,f=0.15) => { const r=Math.floor(parseInt(h.slice(0,2),16)*(1-f)),g=Math.floor(parseInt(h.slice(2,4),16)*(1-f)),b=Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h,f=0.88) => { const r=Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)),g=Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)),b=Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND  = 'FF' + brand.toUpperCase()
    const BRANDD = 'FF' + dk(brand)
    const W='FFFFFFFF', GBG='FFF8F9FA', GRN='FFD1FAE5', REDD='FFFEE2E2', AMB='FFFEF3C7', PUR='FFEDE9FE'
    const EUR = '#,##0.00 "€"'
    const now = new Date().toLocaleString('fr-FR')

    const bord = {
      top:{style:'thin',color:{argb:'FFE2E8F0'}}, bottom:{style:'thin',color:{argb:'FFE2E8F0'}},
      left:{style:'thin',color:{argb:'FFE2E8F0'}}, right:{style:'thin',color:{argb:'FFE2E8F0'}},
    }

    const S = {
      h1:  { font:{name:'Arial',bold:true,size:16,color:{argb:W}},   fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND},bgColor:{argb:'FF000000'}},  alignment:{horizontal:'left',vertical:'middle'} },
      sub: { font:{name:'Arial',size:9,color:{argb:'FF64748B'}},      fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+lt(brand,0.8)},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'left',vertical:'middle'} },
      th:  { font:{name:'Arial',bold:true,size:10,color:{argb:W}},   fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND},bgColor:{argb:'FF000000'}},  alignment:{horizontal:'center',vertical:'middle',wrapText:true}, border:bord },
      td:  { font:{name:'Arial',size:10}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:W},bgColor:{argb:'FF000000'}},   alignment:{horizontal:'left',vertical:'middle'},  border:bord },
      td2: { font:{name:'Arial',size:10}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:GBG},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'left',vertical:'middle'},  border:bord },
      tot: { font:{name:'Arial',bold:true,size:11,color:{argb:W}},   fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDD},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'right',vertical:'middle'}, border:bord },
    }

    // Couleurs par type utilisateur
    const USER_FILL = {
      staff:      { fgColor:{argb:'FFE0F2FE'},bgColor:{argb:'FF000000'} },
      admin:      { fgColor:{argb:PUR},bgColor:{argb:'FF000000'} },
      benevole:   { fgColor:{argb:GRN},bgColor:{argb:'FF000000'} },
      spectateur: { fgColor:{argb:AMB},bgColor:{argb:'FF000000'} },
    }
    const USER_FONT_COLOR = {
      staff:'FF0369A1', admin:'FF5B21B6', benevole:'FF065F46', spectateur:'FF92400E',
    }
    const USER_ICON = { staff:'👤', admin:'🛡️', benevole:'🙋', spectateur:'👥' }

    const ap = (cell, s, val, fmt) => {
      if(s.font)      cell.font      = s.font
      if(s.fill)      cell.fill      = s.fill
      if(s.alignment) cell.alignment = s.alignment
      if(s.border)    cell.border    = s.border
      if(val !== undefined) cell.value = val
      if(fmt) cell.numFmt = fmt
    }

    // ─── Helpers de robustesse ──────────────────────────────────────────
    const num = (v) => {
      if (v === null || v === undefined || v === '') return 0
      const n = Number(v)
      return isFinite(n) ? n : 0
    }

    // Trier par date desc (robuste : ignore les entrées null)
    const sorted = [...auditLst].filter(Boolean).sort((a,b) => String(b&&b.timestamp||'').localeCompare(String(a&&a.timestamp||'')))

    // ── Feuille unique — Journal d'audit ─────────────────────────────
    const ws = wb.addWorksheet("📋 Journal d'audit", { views:[{showGridLines:false}] })

    ws.columns = [
      {width:6},  // №
      {width:14}, // Date
      {width:12}, // Heure
      {width:26}, // Action
      {width:18}, // Type utilisateur
      {width:50}, // Libellé
      {width:26}, // Spectateur (nom)
      {width:24}, // Bénévole (nom)
      {width:22}, // Staff
      {width:14}, // Code résa
      {width:14}, // Montant
      {width:24}, // Événement
    ]

    // Header
    ws.mergeCells('A1:L1')
    ap(ws.getCell('A1'), S.h1, `📋  Journal d'audit — ${nom}`)
    ws.getRow(1).height = 26

    // Sous-titre
    ws.mergeCells('A2:L2')
    ap(ws.getCell('A2'), S.sub, `Export généré le ${now} — ${sorted.length} entrée(s) — YllaCash ${data.appVersion || 'v1.0.0'}`)
    ws.getRow(2).height = 16

    // En-têtes
    const headers = [
      '№','Date','Heure','Action','Type utilisateur','Libellé',
      'Spectateur (nom)','Bénévole (nom)','Staff','Code résa','Montant (€)','Événement',
    ]
    headers.forEach((h, j) => ap(ws.getCell(4, j+1), S.th, h))
    ws.getRow(4).height = 22

    // Données — try/catch par ligne pour ne pas tout casser
    let writeErrors = 0
    sorted.forEach((l, i) => {
      try {
        const row = i + 5
        const st  = i % 2 === 0 ? S.td : S.td2
        const cenR = { ...st, alignment:{horizontal:'center',vertical:'middle'} }
        const numR = { ...st, alignment:{horizontal:'right',vertical:'middle'} }

        let ds = l.date || '—', hs = l.heure || '—'
        try {
          const d = new Date(l.timestamp || '')
          if (!isNaN(d)) {
            ds = d.toLocaleDateString('fr-FR')
            hs = d.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
          }
        } catch {}

        const ut = String(l.userType || '')
        const who = l.benevoleNom || l.specNom || '—'

        ap(ws.getCell(row,1),  cenR, i+1)
        ap(ws.getCell(row,2),  st,   ds)
        ap(ws.getCell(row,3),  cenR, hs)
        ap(ws.getCell(row,4),  st,   String(l.action || '—'))

        // Type utilisateur — coloré par rôle
        const utCell = ws.getCell(row, 5)
        utCell.value = ut ? `${USER_ICON[ut]||'📝'} ${ut}` : '—'
        utCell.font  = { ...st.font, bold:true, color:{argb: USER_FONT_COLOR[ut]||'FF64748B'} }
        utCell.fill  = { type:'pattern', pattern:'solid', ...(USER_FILL[ut] || {fgColor:{argb:GBG},bgColor:{argb:'FF000000'}}) }
        utCell.alignment = { horizontal:'center', vertical:'middle' }
        utCell.border = bord

        ap(ws.getCell(row,6),  st,   String(l.label||'—').slice(0,100))
        ap(ws.getCell(row,7),  st,   String(l.specNom||'—').slice(0,30))
        ap(ws.getCell(row,8),  st,   String(l.benevoleNom||'—').slice(0,30))
        ap(ws.getCell(row,9),  st,   String(l.staff||l.byStaff||'—').slice(0,20))
        ap(ws.getCell(row,10), cenR, String(l.resaCode||'—'))

        const mt = l.montant
        if (mt != null) {
          ap(ws.getCell(row,11), numR, num(mt)/100, EUR)
        } else {
          ap(ws.getCell(row,11), st, '—')
        }

        ap(ws.getCell(row,12), { ...st, font:{...st.font,size:9} }, nom)
        ws.getRow(row).height = 18
      } catch (err) {
        writeErrors++
        console.error(`[audit] Write error row ${i}:`, err && err.message)
      }
    })
    if (writeErrors > 0) console.warn(`[audit] ${writeErrors} ligne(s) ignorée(s) sur ${sorted.length}`)

    // Ligne total
    const totRow = sorted.length + 5
    ap(ws.getCell(totRow, 5), S.tot, `${sorted.length} entrée(s)`)
    ws.getRow(totRow).height = 22

    // Filtre + freeze
    ws.autoFilter='A4:L4'
    ws.views = [{ state:'frozen', xSplit:0, ySplit:4 }]

    // Envoyer
    const buf = await wb.xlsx.writeBuffer()
    const dt  = new Date().toLocaleDateString('fr-FR').replace(/\//g,'_')
    const fn  = `${nom} - Journal d'audit - ${dt}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"`)
    res.send(Buffer.from(buf))

  } catch(e) {
    console.error('Audit XLSX error:', e)
    try {
      res.status(500).setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({
        error: 'ExportFailed',
        message: e.message || String(e),
        type: e.name || 'Error',
        stack: (e.stack || '').split('\n').slice(0, 8).join('\n'),
      }))
    } catch {
      res.status(500).send('ERREUR: ' + (e.message || 'unknown'))
    }
  }
}
