/**
 * api/comptabilite.js — Vercel Serverless Function Node.js
 * ExcelJS côté serveur : génère le rapport comptable stylé
 * Style identique au /api/rapport (rapport événement)
 * POST /api/comptabilite — body JSON :
 *   {
 *     event: { nom, couleur },
 *     vue: 'tresorerie' | 'resultat',
 *     operations: [{ ts, date, sens, categorie, origine, description, ref, montant, mode, staff, statut }],
 *     kpis: { recettes, depenses, solde, aPayer, soldesRestants },
 *     parCategorie: [{ sens, categorie, total, count }],
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

    const event       = data.event       || {}
    const ops         = Array.isArray(data.operations)  ? data.operations  : []
    const kpis        = data.kpis        || {}
    const parCat      = Array.isArray(data.parCategorie) ? data.parCategorie : []
    const vue         = data.vue         || 'tresorerie'
    const nom         = event.nom || 'Événement'
    const brand       = (event.couleur || '#1a6b7a').replace('#','')

    // Couleurs dérivées
    const dk = (h,f=0.15) => { const r=Math.floor(parseInt(h.slice(0,2),16)*(1-f)),g=Math.floor(parseInt(h.slice(2,4),16)*(1-f)),b=Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h,f=0.88) => { const r=Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)),g=Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)),b=Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND='FF'+brand.toUpperCase(), BRANDL='FF'+lt(brand), BRANDD='FF'+dk(brand)
    const W='FFFFFFFF', GBG='FFF8F9FA', GRN='FFD1FAE5', REDD='FFFEE2E2', AMB='FFFEF3C7', PUR='FFEDE9FE'

    const EUR  = '#,##0.00 "€"'
    const now  = new Date().toLocaleString('fr-FR')

    // Labels modes de paiement et catégories
    const MODE_L = {
      cash:'💵 Espèces', virement:'🏦 Virement', cheque:'📝 Chèque',
      compte:'💳 Compte', avantage:'🎁 Avantage',
    }

    // Bordures
    const bord = {
      top:{style:'thin',color:{argb:'FFE2E8F0'}},
      bottom:{style:'thin',color:{argb:'FFE2E8F0'}},
      left:{style:'thin',color:{argb:'FFE2E8F0'}},
      right:{style:'thin',color:{argb:'FFE2E8F0'}},
    }

    // Styles (cohérents avec rapport.js)
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
    const ws1 = wb.addWorksheet('📊 Tableau de bord',{views:[{showGridLines:false}]})
    ws1.columns=[{width:2},{width:26},{width:26},{width:26},{width:26},{width:4}]

    ws1.mergeCells('B1:E3')
    ap(ws1.getCell('B1'), S.h1, `💼 Comptabilité — ${nom.toUpperCase()}`)
    ws1.getRow(1).height=20; ws1.getRow(2).height=20; ws1.getRow(3).height=20
    ws1.mergeCells('B4:E4')
    ap(ws1.getCell('B4'), S.sub, `Vue ${vue === 'tresorerie' ? 'Trésorerie' : 'Résultat analytique'} — Généré le ${now} — YllaCash ${appVersion}`)
    ws1.getRow(4).height=18; ws1.getRow(5).height=8

    // Helper pour transformer un montant en number Excel-safe (jamais NaN)
    const num = (v) => {
      const n = Number(v)
      return isFinite(n) ? Math.round(n * 100) / 100 : 0
    }

    // KPI cards (2 lignes de 4 colonnes) — valeurs numériques avec format euro Excel
    const kpiList = [
      ['💰 Recettes',  num(kpis.recettes)],
      ['🛒 Dépenses',  num(kpis.depenses)],
      ['📈 Solde net', num(kpis.solde)],
      [vue === 'tresorerie' ? '⏳ À payer' : '🏦 Soldes spec.',
        num(vue === 'tresorerie' ? kpis.aPayer : kpis.soldesRestants)],
    ]
    kpiList.forEach(([l,v],i) => {
      const c = String.fromCharCode(66+i)
      ap(ws1.getCell(`${c}6`), S.kpiL, l)
      ap(ws1.getCell(`${c}7`), S.kpiV, v, EUR)
    })
    ws1.getRow(6).height=14; ws1.getRow(7).height=40; ws1.getRow(8).height=12

    // Compte de résultat simplifié
    ws1.mergeCells('B9:E9')
    ap(ws1.getCell('B9'), S.h1, '📋  Compte de résultat simplifié')
    ws1.getRow(9).height=22

    ;['Sens','Catégorie','Total (€)','Nb opérations'].forEach((h,j) =>
      ap(ws1.getCell(10, 2+j), S.th, h))
    ws1.getRow(10).height=20

    // Recettes
    const recettesCat = parCat.filter(c => c.sens === 'recette')
    const depensesCat = parCat.filter(c => c.sens === 'depense')
    let row = 11

    recettesCat.forEach((c, k) => {
      const st = k % 2 === 0 ? S.td : S.td2
      ap(ws1.getCell(row,2), {...S.pos, fill: st.fill, border: st.border}, '↑ Recette')
      ap(ws1.getCell(row,3), st, c.categorie)
      ap(ws1.getCell(row,4), {...S.pos, border: st.border}, num(c.total), EUR)
      ap(ws1.getCell(row,5), {...st, alignment:{horizontal:'center',vertical:'middle'}}, Number(c.count) || 0)
      ws1.getRow(row).height=18
      row++
    })
    // Total recettes
    ap(ws1.getCell(row,2), S.tot, '')
    ap(ws1.getCell(row,3), {...S.tot, alignment:{horizontal:'left',vertical:'middle'}}, '∑ Total recettes')
    ap(ws1.getCell(row,4), S.tot, num(kpis.recettes), EUR)
    ap(ws1.getCell(row,5), {...S.tot, alignment:{horizontal:'center',vertical:'middle'}}, recettesCat.reduce((s,c)=>s+(Number(c.count)||0),0))
    ws1.getRow(row).height=22
    row += 2

    // Dépenses
    depensesCat.forEach((c, k) => {
      const st = k % 2 === 0 ? S.td : S.td2
      ap(ws1.getCell(row,2), {...S.neg, fill: st.fill, border: st.border}, '↓ Dépense')
      ap(ws1.getCell(row,3), st, c.categorie)
      ap(ws1.getCell(row,4), {...S.neg, border: st.border}, num(c.total), EUR)
      ap(ws1.getCell(row,5), {...st, alignment:{horizontal:'center',vertical:'middle'}}, Number(c.count) || 0)
      ws1.getRow(row).height=18
      row++
    })
    // Total dépenses
    ap(ws1.getCell(row,2), S.tot, '')
    ap(ws1.getCell(row,3), {...S.tot, alignment:{horizontal:'left',vertical:'middle'}}, '∑ Total dépenses')
    ap(ws1.getCell(row,4), S.tot, num(kpis.depenses), EUR)
    ap(ws1.getCell(row,5), {...S.tot, alignment:{horizontal:'center',vertical:'middle'}}, depensesCat.reduce((s,c)=>s+(Number(c.count)||0),0))
    ws1.getRow(row).height=22
    row += 2

    // Résultat net
    ap(ws1.getCell(row,2), S.tot, '')
    ap(ws1.getCell(row,3), {...S.tot, font:{...S.tot.font, size:13}, alignment:{horizontal:'left',vertical:'middle'}}, '= RÉSULTAT NET')
    ap(ws1.getCell(row,4),
      num(kpis.solde) >= 0 ? {...S.pos, font:{...S.pos.font, size:13}} : {...S.neg, font:{...S.neg.font, size:13}},
      num(kpis.solde), EUR)
    ws1.getRow(row).height=28
    row += 2

    // Annotation vue
    ws1.mergeCells(`B${row}:E${row+2}`)
    const noteText = vue === 'tresorerie'
      ? 'Vue Trésorerie : flux réels d\'argent en caisse. Les cachets non encore payés et les soldes spectateurs restants ne sont pas dans le résultat — ce sont des engagements futurs.'
      : 'Vue Résultat : activité analytique réelle (ventes consommées + charges engagées). Les soldes spectateurs non consommés représentent une dette.'
    ap(ws1.getCell(`B${row}`), {
      font:{name:'Arial',italic:true,size:9,color:{argb:'FF64748B'}},
      fill:{type:'pattern',pattern:'solid',fgColor:{argb:GBG},bgColor:{argb:'FF000000'}},
      alignment:{horizontal:'left',vertical:'middle',wrapText:true},
      border:bord,
    }, noteText)
    ws1.getRow(row).height=18; ws1.getRow(row+1).height=18; ws1.getRow(row+2).height=18

    // ─── FEUILLE 2 — RECETTES ─────────────────────────────────────────
    const ws2 = wb.addWorksheet('💰 Recettes',{views:[{showGridLines:false}]})
    ws2.columns=[{width:14},{width:10},{width:22},{width:18},{width:40},{width:18},{width:14},{width:14},{width:16}]
    ws2.mergeCells('A1:I1')
    ap(ws2.getCell('A1'), S.h1, '💰  Recettes — détail complet')
    ws2.getRow(1).height=26
    ws2.mergeCells('A2:I2')
    const recettesOps = ops.filter(o => o.sens === 'recette').sort((a,b) => b.ts - a.ts)
    ap(ws2.getCell('A2'), S.sub, `Généré le ${now} — ${recettesOps.length} opération${recettesOps.length>1?'s':''}`)
    ws2.getRow(2).height=16

    ;['Date','Heure','Catégorie','Origine','Description','Référence','Mode','Staff','Montant (€)'].forEach((h,j) =>
      ap(ws2.getCell(4, j+1), S.th, h))
    ws2.getRow(4).height=22

    recettesOps.forEach((o, i) => {
      let ds = '—', hs = '—'
      try {
        const d = new Date(o.date || o.ts)
        if (!isNaN(d)) {
          ds = d.toLocaleDateString('fr-FR')
          hs = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        }
      } catch {}
      const st = i % 2 === 0 ? S.td : S.td2
      const r = i + 5
      ap(ws2.getCell(r,1), st, ds)
      ap(ws2.getCell(r,2), st, hs)
      ap(ws2.getCell(r,3), st, o.categorie || '—')
      ap(ws2.getCell(r,4), st, (o.origine || '—').slice(0,30))
      ap(ws2.getCell(r,5), st, (o.description || '—').slice(0,80))
      ap(ws2.getCell(r,6), st, (o.ref || '—').slice(0,30))
      ap(ws2.getCell(r,7), st, MODE_L[o.mode] || o.mode || '—')
      ap(ws2.getCell(r,8), st, (o.staff || '—').slice(0,20))
      ap(ws2.getCell(r,9), {...S.pos, border: st.border}, num(o.montant), EUR)
      ws2.getRow(r).height=18
    })
    const totR2 = recettesOps.length + 5
    ap(ws2.getCell(totR2,1), S.tot, '')
    ap(ws2.getCell(totR2,5), {...S.tot, alignment:{horizontal:'right',vertical:'middle'}}, 'TOTAL RECETTES')
    ap(ws2.getCell(totR2,9), S.tot, num(kpis.recettes), EUR)
    ws2.getRow(totR2).height=24
    ws2.autoFilter = 'A4:I4'
    ws2.views = [{ state:'frozen', xSplit:0, ySplit:4 }]

    // ─── FEUILLE 3 — DÉPENSES ─────────────────────────────────────────
    const ws3 = wb.addWorksheet('🛒 Dépenses',{views:[{showGridLines:false}]})
    ws3.columns=[{width:14},{width:10},{width:22},{width:18},{width:40},{width:18},{width:14},{width:12},{width:14},{width:16}]
    ws3.mergeCells('A1:J1')
    ap(ws3.getCell('A1'), S.h1, '🛒  Dépenses — détail complet')
    ws3.getRow(1).height=26
    ws3.mergeCells('A2:J2')
    const depensesOps = ops.filter(o => o.sens === 'depense').sort((a,b) => b.ts - a.ts)
    ap(ws3.getCell('A2'), S.sub, `Généré le ${now} — ${depensesOps.length} opération${depensesOps.length>1?'s':''}`)
    ws3.getRow(2).height=16

    ;['Date','Heure','Catégorie','Origine','Description','Référence','Mode','Statut','Staff','Montant (€)'].forEach((h,j) =>
      ap(ws3.getCell(4, j+1), S.th, h))
    ws3.getRow(4).height=22

    depensesOps.forEach((o, i) => {
      let ds = '—', hs = '—'
      try {
        const d = new Date(o.date || o.ts)
        if (!isNaN(d)) {
          ds = d.toLocaleDateString('fr-FR')
          hs = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        }
      } catch {}
      const st = i % 2 === 0 ? S.td : S.td2
      const r = i + 5
      const statutLabel = o.statut === 'paye' ? '✅ Payé'
                       : o.statut === 'planifie' ? '⏳ À payer'
                       : o.statut === 'annule' ? '❌ Annulé' : '—'
      ap(ws3.getCell(r,1), st, ds)
      ap(ws3.getCell(r,2), st, hs)
      ap(ws3.getCell(r,3), st, o.categorie || '—')
      ap(ws3.getCell(r,4), st, (o.origine || '—').slice(0,30))
      ap(ws3.getCell(r,5), st, (o.description || '—').slice(0,80))
      ap(ws3.getCell(r,6), st, (o.ref || '—').slice(0,30))
      ap(ws3.getCell(r,7), st, MODE_L[o.mode] || o.mode || '—')
      ap(ws3.getCell(r,8), {...st, alignment:{horizontal:'center',vertical:'middle'}}, statutLabel)
      ap(ws3.getCell(r,9), st, (o.staff || '—').slice(0,20))
      ap(ws3.getCell(r,10), {...S.neg, border: st.border}, num(o.montant), EUR)
      ws3.getRow(r).height=18
    })
    const totR3 = depensesOps.length + 5
    ap(ws3.getCell(totR3,1), S.tot, '')
    ap(ws3.getCell(totR3,5), {...S.tot, alignment:{horizontal:'right',vertical:'middle'}}, 'TOTAL DÉPENSES')
    ap(ws3.getCell(totR3,10), S.tot, num(kpis.depenses), EUR)
    ws3.getRow(totR3).height=24
    ws3.autoFilter = 'A4:J4'
    ws3.views = [{ state:'frozen', xSplit:0, ySplit:4 }]

    // ─── Envoyer le fichier ───────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer()
    const dt  = new Date().toLocaleDateString('fr-FR').replace(/\//g,'_')
    const fn  = `${nom} - Comptabilité - ${dt}.xlsx`
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(fn)}"`)
    res.send(Buffer.from(buf))

  } catch(e) {
    console.error('Comptabilité error:', e)
    res.status(500).json({ error: e.message, stack: e.stack })
  }
}
