/**
 * api/cachets.js — Vercel Serverless Function Node.js
 * ExcelJS côté serveur : génère le tableau des cachets artistes stylé
 * Style identique à /api/rapport et /api/comptabilite
 * POST /api/cachets — body JSON :
 *   {
 *     event: { nom, couleur },
 *     appVersion: 'v1.0.0',
 *     cachets: [{ numeroDecharge, artiste, createdAt, type, montant, modePaiement, statut, reference, signedAt, signedNom, notes, creneau: { debut, scene } }],
 *     kpis: { totalPrevu, totalPaye, totalAPayer, nbCachets, nbSignes },
 *   }
 */

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  // Parse body
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
  } catch(parseErr) {
    res.status(400).send('Invalid JSON: ' + parseErr.message); return
  }

  try {
    const ExcelJS = require('exceljs')
    const wb = new ExcelJS.Workbook()
    const appVersion  = data.appVersion || 'v1.0.0'
    wb.creator = `YllaCash ${appVersion}`; wb.created = new Date()

    const event    = data.event    || {}
    const cachets  = Array.isArray(data.cachets) ? data.cachets : []
    const kpis     = data.kpis     || {}
    const nom      = event.nom || 'Événement'
    const brand    = (event.couleur || '#1a6b7a').replace('#','')

    // Couleurs dérivées
    const dk = (h,f=0.15) => { const r=Math.floor(parseInt(h.slice(0,2),16)*(1-f)),g=Math.floor(parseInt(h.slice(2,4),16)*(1-f)),b=Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h,f=0.88) => { const r=Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)),g=Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)),b=Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND='FF'+brand.toUpperCase(), BRANDL='FF'+lt(brand), BRANDD='FF'+dk(brand)
    const W='FFFFFFFF', GBG='FFF8F9FA', GRN='FFD1FAE5', REDD='FFFEE2E2', AMB='FFFEF3C7'

    const EUR  = '#,##0.00 "€"'
    const now  = new Date().toLocaleString('fr-FR')

    // Helper safe number (jamais NaN)
    const num = (v) => {
      const n = Number(v)
      return isFinite(n) ? Math.round(n * 100) / 100 : 0
    }

    // Labels
    const TYPE_L = {
      cachet:  '🎤 Cachet complet',
      acompte: '⏳ Acompte',
      solde:   '✅ Solde',
      frais:   '🧾 Remb. de frais',
    }
    const MODE_L = {
      especes:  '💵 Espèces',
      virement: '🏦 Virement',
      cheque:   '📝 Chèque',
    }
    const STATUT_L = {
      paye:     '✅ Payé',
      planifie: '⏳ À payer',
      annule:   '❌ Annulé',
    }
    const STATUT_C = {
      paye:     {argb:GRN},
      planifie: {argb:AMB},
      annule:   {argb:REDD},
    }

    // Bordures
    const bord = {
      top:{style:'thin',color:{argb:'FFE2E8F0'}},
      bottom:{style:'thin',color:{argb:'FFE2E8F0'}},
      left:{style:'thin',color:{argb:'FFE2E8F0'}},
      right:{style:'thin',color:{argb:'FFE2E8F0'}},
    }

    // Styles (cohérents avec rapport.js et comptabilite.js)
    const S = {
      h1:  {font:{name:'Arial',bold:true,size:16,color:{argb:W}},     fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'left',vertical:'middle'}},
      sub: {font:{name:'Arial',size:9,color:{argb:'FF64748B'}},        fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+lt(brand,0.8)},bgColor:{argb:'FF000000'}},alignment:{horizontal:'left',vertical:'middle'}},
      th:  {font:{name:'Arial',bold:true,size:10,color:{argb:W}},     fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'center',vertical:'middle',wrapText:true},border:bord},
      td:  {font:{name:'Arial',size:10},fill:{type:'pattern',pattern:'solid',fgColor:{argb:W},bgColor:{argb:'FF000000'}},   alignment:{horizontal:'left',vertical:'middle'},border:bord},
      td2: {font:{name:'Arial',size:10},fill:{type:'pattern',pattern:'solid',fgColor:{argb:GBG},bgColor:{argb:'FF000000'}},  alignment:{horizontal:'left',vertical:'middle'},border:bord},
      kpiL:{font:{name:'Arial',bold:true,size:9,color:{argb:'FF64748B'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDL},bgColor:{argb:'FF000000'}},alignment:{horizontal:'center',vertical:'middle'}},
      kpiV:{font:{name:'Arial',bold:true,size:20,color:{argb:BRANDD}},  fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDL},bgColor:{argb:'FF000000'}},alignment:{horizontal:'center',vertical:'middle'}},
      pos: {font:{name:'Arial',bold:true,size:10,color:{argb:'FF065F46'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:GRN},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'right',vertical:'middle'},border:bord},
      neg: {font:{name:'Arial',bold:true,size:10,color:{argb:'FF991B1B'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:REDD},bgColor:{argb:'FF000000'}},alignment:{horizontal:'right',vertical:'middle'},border:bord},
      tot: {font:{name:'Arial',bold:true,size:11,color:{argb:W}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDD},bgColor:{argb:'FF000000'}},alignment:{horizontal:'right',vertical:'middle'},border:bord},
    }
    const ap = (cell,s,val,fmt) => {
      if(s.font)cell.font=s.font
      if(s.fill)cell.fill=s.fill
      if(s.alignment)cell.alignment=s.alignment
      if(s.border)cell.border=s.border
      if(val!==undefined)cell.value=val
      if(fmt)cell.numFmt=fmt
    }

    // ─── FEUILLE 1 — TABLEAU DE BORD ──────────────────────────────────
    const ws1 = wb.addWorksheet('📊 Synthèse',{views:[{showGridLines:false}]})
    ws1.columns=[{width:2},{width:26},{width:26},{width:26},{width:26},{width:4}]

    ws1.mergeCells('B1:E3')
    ap(ws1.getCell('B1'), S.h1, `🎤 Cachets artistes — ${nom.toUpperCase()}`)
    ws1.getRow(1).height=20; ws1.getRow(2).height=20; ws1.getRow(3).height=20
    ws1.mergeCells('B4:E4')
    ap(ws1.getCell('B4'), S.sub, `Généré le ${now} — YllaCash ${appVersion}`)
    ws1.getRow(4).height=18; ws1.getRow(5).height=8

    // KPI cards (4 colonnes)
    const kpiList = [
      ['💰 Total prévu',  num(kpis.totalPrevu)],
      ['✅ Total payé',   num(kpis.totalPaye)],
      ['⏳ À payer',      num(kpis.totalAPayer)],
      ['🎤 Artistes',     Number(kpis.nbCachets) || cachets.length],
    ]
    kpiList.forEach(([l,v],i) => {
      const c = String.fromCharCode(66+i)
      ap(ws1.getCell(`${c}6`), S.kpiL, l)
      // Les 3 premiers sont en euros, le 4e (nb cachets) en simple nombre
      ap(ws1.getCell(`${c}7`), S.kpiV, v, i < 3 ? EUR : undefined)
    })
    ws1.getRow(6).height=14; ws1.getRow(7).height=40; ws1.getRow(8).height=12

    // Répartition par statut
    ws1.mergeCells('B9:E9')
    ap(ws1.getCell('B9'), S.h1, '📋  Répartition par statut')
    ws1.getRow(9).height=22

    ;['Statut','Nb cachets','Total (€)','% du total'].forEach((h,j) =>
      ap(ws1.getCell(10, 2+j), S.th, h))
    ws1.getRow(10).height=20

    const totalGen = cachets.reduce((s,c) => s + num(c.montant), 0)
    const statuts = ['paye', 'planifie', 'annule']
    statuts.forEach((stat, k) => {
      const list = cachets.filter(c => c.statut === stat)
      const total = list.reduce((s,c) => s + num(c.montant), 0)
      const pct = totalGen > 0 ? (total / totalGen) * 100 : 0
      const st = k % 2 === 0 ? S.td : S.td2
      const row = 11 + k
      ap(ws1.getCell(row,2), {...st, fill:{type:'pattern',pattern:'solid',fgColor:STATUT_C[stat],bgColor:{argb:'FF000000'}}}, STATUT_L[stat])
      ap(ws1.getCell(row,3), {...st, alignment:{horizontal:'center',vertical:'middle'}}, list.length)
      ap(ws1.getCell(row,4), {...st, alignment:{horizontal:'right',vertical:'middle'}}, total, EUR)
      ap(ws1.getCell(row,5), {...st, alignment:{horizontal:'right',vertical:'middle'}}, Math.round(pct * 10) / 10, '0.0"%"')
      ws1.getRow(row).height=18
    })
    // Total
    ap(ws1.getCell(14,2), {...S.tot, alignment:{horizontal:'left',vertical:'middle'}}, '∑ TOTAL')
    ap(ws1.getCell(14,3), {...S.tot, alignment:{horizontal:'center',vertical:'middle'}}, cachets.length)
    ap(ws1.getCell(14,4), S.tot, totalGen, EUR)
    ap(ws1.getCell(14,5), {...S.tot, alignment:{horizontal:'right',vertical:'middle'}}, 100, '0"%"')
    ws1.getRow(14).height=24

    // Répartition par mode de paiement (uniquement pour les cachets payés)
    ws1.mergeCells('B16:E16')
    ap(ws1.getCell('B16'), S.h1, '💳  Répartition par mode (payés)')
    ws1.getRow(16).height=22

    ;['Mode','Nb cachets','Total (€)','% des payés'].forEach((h,j) =>
      ap(ws1.getCell(17, 2+j), S.th, h))
    ws1.getRow(17).height=20

    const cachetsPayes = cachets.filter(c => c.statut === 'paye')
    const totalPaye = cachetsPayes.reduce((s,c) => s + num(c.montant), 0)
    const modes = ['especes', 'virement', 'cheque']
    modes.forEach((mode, k) => {
      const list = cachetsPayes.filter(c => c.modePaiement === mode)
      const total = list.reduce((s,c) => s + num(c.montant), 0)
      const pct = totalPaye > 0 ? (total / totalPaye) * 100 : 0
      const st = k % 2 === 0 ? S.td : S.td2
      const row = 18 + k
      ap(ws1.getCell(row,2), st, MODE_L[mode])
      ap(ws1.getCell(row,3), {...st, alignment:{horizontal:'center',vertical:'middle'}}, list.length)
      ap(ws1.getCell(row,4), {...S.pos, border:st.border}, total, EUR)
      ap(ws1.getCell(row,5), {...st, alignment:{horizontal:'right',vertical:'middle'}}, Math.round(pct * 10) / 10, '0.0"%"')
      ws1.getRow(row).height=18
    })

    // ─── FEUILLE 2 — DÉTAIL CACHETS ───────────────────────────────────
    const ws2 = wb.addWorksheet('🎤 Détail cachets',{views:[{showGridLines:false}]})
    ws2.columns=[
      {width:14},  // Date création
      {width:14},  // Numéro décharge
      {width:28},  // Artiste
      {width:18},  // Date prestation
      {width:18},  // Scène
      {width:18},  // Type
      {width:14},  // Mode
      {width:14},  // Statut
      {width:18},  // Référence
      {width:14},  // Date signature
      {width:22},  // Signé par
      {width:16},  // Montant
    ]
    ws2.mergeCells('A1:L1')
    ap(ws2.getCell('A1'), S.h1, '🎤  Détail complet des cachets')
    ws2.getRow(1).height=26
    ws2.mergeCells('A2:L2')
    ap(ws2.getCell('A2'), S.sub, `Généré le ${now} — ${cachets.length} cachet${cachets.length>1?'s':''}`)
    ws2.getRow(2).height=16

    const headers = ['Date création','N° décharge','Artiste','Date prestation','Scène','Type','Mode','Statut','Référence','Signé le','Signé par','Montant (€)']
    headers.forEach((h,j) => ap(ws2.getCell(4, j+1), S.th, h))
    ws2.getRow(4).height=22

    // Tri par date de création décroissante (plus récent en haut)
    const sortedCachets = [...cachets].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime()
      const tb = new Date(b.createdAt || 0).getTime()
      return tb - ta
    })

    const fmtDate = (d) => {
      if (!d) return '—'
      try {
        const dt = new Date(d)
        if (isNaN(dt)) return '—'
        return dt.toLocaleDateString('fr-FR')
      } catch { return '—' }
    }
    const fmtDateHour = (d) => {
      if (!d) return '—'
      try {
        const dt = new Date(d)
        if (isNaN(dt)) return '—'
        return `${dt.toLocaleDateString('fr-FR')} ${dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`
      } catch { return '—' }
    }

    sortedCachets.forEach((c, i) => {
      const st = i % 2 === 0 ? S.td : S.td2
      const r = i + 5
      ap(ws2.getCell(r,1), st, fmtDate(c.createdAt))
      ap(ws2.getCell(r,2), st, c.numeroDecharge || '—')
      ap(ws2.getCell(r,3), st, (c.artiste || '—').slice(0,40))
      ap(ws2.getCell(r,4), st, c.creneau ? fmtDateHour(c.creneau.debut) : '—')
      ap(ws2.getCell(r,5), st, (c.creneau?.scene || '—').slice(0,20))
      ap(ws2.getCell(r,6), st, TYPE_L[c.type] || c.type || '—')
      ap(ws2.getCell(r,7), st, MODE_L[c.modePaiement] || c.modePaiement || '—')
      // Statut avec couleur de fond
      ap(ws2.getCell(r,8), {...st, fill:{type:'pattern',pattern:'solid',fgColor:STATUT_C[c.statut] || {argb:GBG},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'center',vertical:'middle'}}, STATUT_L[c.statut] || c.statut || '—')
      ap(ws2.getCell(r,9), st, (c.reference || '—').slice(0,30))
      ap(ws2.getCell(r,10), st, c.signedAt ? fmtDate(c.signedAt) : '—')
      ap(ws2.getCell(r,11), st, (c.signedNom || '—').slice(0,30))
      // Montant en couleur selon statut
      const mSt = c.statut === 'paye' ? S.pos : c.statut === 'annule' ? S.neg : {...st, alignment:{horizontal:'right',vertical:'middle'}, font:{name:'Arial',bold:true,size:10}}
      ap(ws2.getCell(r,12), {...mSt, border: st.border}, num(c.montant), EUR)
      ws2.getRow(r).height=18
    })

    // Total final
    const totR = sortedCachets.length + 5
    ap(ws2.getCell(totR,1), S.tot, '')
    ap(ws2.getCell(totR,11), {...S.tot, alignment:{horizontal:'right',vertical:'middle'}}, 'TOTAL GÉNÉRAL')
    ap(ws2.getCell(totR,12), S.tot, totalGen, EUR)
    ws2.getRow(totR).height=24

    ws2.autoFilter = 'A4:L4'
    ws2.views = [{ state:'frozen', xSplit:0, ySplit:4 }]

    // ─── FEUILLE 3 — NOTES (si présentes) ─────────────────────────────
    const withNotes = cachets.filter(c => c.notes && c.notes.trim())
    if (withNotes.length > 0) {
      const ws3 = wb.addWorksheet('📝 Notes',{views:[{showGridLines:false}]})
      ws3.columns=[{width:14},{width:28},{width:14},{width:60}]
      ws3.mergeCells('A1:D1')
      ap(ws3.getCell('A1'), S.h1, '📝  Notes & commentaires')
      ws3.getRow(1).height=26
      ws3.mergeCells('A2:D2')
      ap(ws3.getCell('A2'), S.sub, `${withNotes.length} cachet${withNotes.length>1?'s':''} avec notes`)
      ws3.getRow(2).height=16

      ;['N° décharge','Artiste','Statut','Notes'].forEach((h,j) =>
        ap(ws3.getCell(4, j+1), S.th, h))
      ws3.getRow(4).height=22

      withNotes.forEach((c, i) => {
        const st = i % 2 === 0 ? S.td : S.td2
        const r = i + 5
        ap(ws3.getCell(r,1), st, c.numeroDecharge || '—')
        ap(ws3.getCell(r,2), st, (c.artiste || '—').slice(0,40))
        ap(ws3.getCell(r,3), {...st, fill:{type:'pattern',pattern:'solid',fgColor:STATUT_C[c.statut] || {argb:GBG},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'center',vertical:'middle'}}, STATUT_L[c.statut] || '—')
        ap(ws3.getCell(r,4), {...st, alignment:{horizontal:'left',vertical:'middle',wrapText:true}}, (c.notes || '').slice(0,500))
        ws3.getRow(r).height = Math.max(18, Math.min(80, 18 + Math.floor((c.notes || '').length / 60) * 16))
      })
    }

    // ─── Envoyer le fichier ───────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer()
    const dt  = new Date().toLocaleDateString('fr-FR').replace(/\//g,'_')
    const fn  = `${nom} - Cachets - ${dt}.xlsx`
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(fn)}"`)
    res.send(Buffer.from(buf))

  } catch(e) {
    console.error('Cachets export error:', e)
    res.status(500).json({ error: e.message, stack: e.stack })
  }
}
