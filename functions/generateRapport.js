/**
 * functions/generateRapport.js
 * Cloud Function HTTP — génère un rapport Excel stylisé avec ExcelJS
 * POST /generateRapport avec body: { eventId, eventNom, couleur, data: {...} }
 */
const { onRequest } = require('firebase-functions/v2/https')
const ExcelJS = require('exceljs')

const toARGB = (hex) => 'FF' + hex.replace('#','').toUpperCase()
const darken = (hex, f) => {
  hex = hex.replace('#','')
  const r = Math.floor(parseInt(hex.slice(0,2),16) * (1-f))
  const g = Math.floor(parseInt(hex.slice(2,4),16) * (1-f))
  const b = Math.floor(parseInt(hex.slice(4,6),16) * (1-f))
  return `${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
const lighten = (hex, f) => {
  hex = hex.replace('#','')
  const r = Math.min(255, Math.floor(parseInt(hex.slice(0,2),16) + (255 - parseInt(hex.slice(0,2),16)) * f))
  const g = Math.min(255, Math.floor(parseInt(hex.slice(2,4),16) + (255 - parseInt(hex.slice(2,4),16)) * f))
  const b = Math.min(255, Math.floor(parseInt(hex.slice(4,6),16) + (255 - parseInt(hex.slice(4,6),16)) * f))
  return `${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

const euro = (c) => ((c || 0) / 100).toFixed(2)
const fmtEuro = (c) => `${euro(c)} €`
const nowStr = () => new Date().toLocaleString('fr-FR')

function makeStyles(brand) {
  const B = toARGB(brand)
  const BL = toARGB(lighten(brand, 0.88))
  const BD = toARGB(darken(brand, 0.15))
  const W = 'FFFFFFFF'
  const GBG = 'FFF8F9FA'

  const thinBorder = { style:'thin', color:{ argb:'FFE2E8F0' } }
  const border = { top:thinBorder, left:thinBorder, bottom:thinBorder, right:thinBorder }

  return {
    B, BL, BD, W, GBG, brand,
    h1: { font:{ name:'Arial', bold:true, size:16, color:{argb:W} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:B}}, alignment:{horizontal:'left',vertical:'middle'} },
    th: { font:{ name:'Arial', bold:true, size:10, color:{argb:W} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:B}}, alignment:{horizontal:'center',vertical:'middle',wrapText:true}, border },
    td: { font:{ name:'Arial', size:10 }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:W}}, alignment:{horizontal:'left',vertical:'middle'}, border },
    td2:{ font:{ name:'Arial', size:10 }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:GBG}}, alignment:{horizontal:'left',vertical:'middle'}, border },
    kpiLabel: { font:{ name:'Arial', bold:true, size:9, color:{argb:'FF64748B'} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BL}}, alignment:{horizontal:'center',vertical:'middle'} },
    kpiVal:   { font:{ name:'Arial', bold:true, size:18, color:{argb:BD} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BL}}, alignment:{horizontal:'center',vertical:'middle'} },
    pos: { font:{ name:'Arial', bold:true, size:10, color:{argb:'FF065F46'} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFD1FAE5'}}, alignment:{horizontal:'right',vertical:'middle'}, border },
    neg: { font:{ name:'Arial', bold:true, size:10, color:{argb:'FF991B1B'} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFEE2E2'}}, alignment:{horizontal:'right',vertical:'middle'}, border },
    total:{ font:{ name:'Arial', bold:true, size:11, color:{argb:W} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BD}}, alignment:{horizontal:'right',vertical:'middle'}, border },
    num: { font:{ name:'Arial', size:10 }, alignment:{horizontal:'right',vertical:'middle'}, border },
    h2: { font:{ name:'Arial', bold:true, size:11, color:{argb:BD} }, fill:{type:'pattern',pattern:'solid',fgColor:{argb:BL}}, alignment:{horizontal:'left',vertical:'middle'} },
  }
}

function applyStyle(cell, s) {
  if (s.font)      cell.font      = s.font
  if (s.fill)      cell.fill      = s.fill
  if (s.alignment) cell.alignment = s.alignment
  if (s.border)    cell.border    = s.border
}

async function buildWorkbook(payload) {
  const { event, spectateurs=[], transactions=[], reservations=[], menu=[], staff=[], audit=[] } = payload
  const brand = event.couleur || '#1a6b7a'
  const S = makeStyles(brand)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'YllaCash'
  wb.created = new Date()

  // ══ Feuille 1 : TABLEAU DE BORD ══════════════════════════════════
  const ws1 = wb.addWorksheet('📊 Tableau de bord', { views:[{showGridLines:false}] })
  ws1.columns = [
    {key:'A',width:2},{key:'B',width:24},{key:'C',width:24},
    {key:'D',width:24},{key:'E',width:24},{key:'F',width:24},{key:'G',width:4}
  ]

  // Header
  ws1.mergeCells('B1:F3')
  const h1 = ws1.getCell('B1')
  h1.value = `YllaCash — ${(event.nom||'').toUpperCase()}`
  applyStyle(h1, S.h1)
  h1.font = { ...S.h1.font, size:18 }
  ws1.getRow(1).height = 18; ws1.getRow(2).height = 18; ws1.getRow(3).height = 18

  ws1.mergeCells('B4:F4')
  const sub = ws1.getCell('B4')
  sub.value = `Rapport financier complet — Généré le ${nowStr()}`
  sub.font = { name:'Arial', size:9, color:{argb:toARGB(darken(brand,0.1))} }
  sub.fill = { type:'pattern', pattern:'solid', fgColor:{argb:toARGB(lighten(brand,0.8))} }
  sub.alignment = { horizontal:'left', vertical:'middle', indent:2 }
  ws1.getRow(4).height = 18
  ws1.getRow(5).height = 10

  // KPIs calculés
  const allTx = transactions
  const totalCredits = allTx.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
  const totalVentes  = allTx.filter(t=>['debit','retrait','benev-retrait'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
  const totalSoldes  = spectateurs.reduce((a,s)=>a+(s.solde||0),0)
  const nbSpecs = spectateurs.length
  const nbResas = reservations.filter(r=>!r.isBenev).length
  const collected = reservations.filter(r=>r.status==='collected'&&!r.isBenev).length
  const taux = nbResas ? Math.round(collected/nbResas*100) : 0
  const benevResas = reservations.filter(r=>r.isBenev&&r.status==='collected')
  const coutBenev = benevResas.reduce((a,r)=>{
    return a + (r.items||[]).reduce((b,it)=>b+(it.prix||0)*(it.qty||1),0)
  },0)
  const caNette = totalVentes - coutBenev

  const kpis = [
    ['💰 CA Brut encaissé', fmtEuro(totalVentes)],
    ['💳 Total rechargé',   fmtEuro(totalCredits)],
    ['🏦 Soldes restants',  fmtEuro(totalSoldes)],
    ['👥 Spectateurs',      String(nbSpecs)],
    ['📋 Taux retrait résa',`${taux}%`],
    ['📈 CA Net événement', fmtEuro(caNette)],
  ]

  // Row 1 de KPIs : colonnes B,C,D
  for (let i = 0; i < 3; i++) {
    const col = String.fromCharCode(66+i)
    ws1.mergeCells(`${col}6:${col}6`)
    ws1.mergeCells(`${col}7:${col}7`)
    const lbl = ws1.getCell(`${col}6`)
    lbl.value = kpis[i][0]; applyStyle(lbl, S.kpiLabel)
    const val = ws1.getCell(`${col}7`)
    val.value = kpis[i][1]; applyStyle(val, S.kpiVal)
  }
  ws1.getRow(6).height = 15; ws1.getRow(7).height = 36

  // Row 2 de KPIs : colonnes B,C,D
  for (let i = 3; i < 6; i++) {
    const col = String.fromCharCode(66+i-3)
    ws1.mergeCells(`${col}9:${col}9`)
    ws1.mergeCells(`${col}10:${col}10`)
    const lbl = ws1.getCell(`${col}9`)
    lbl.value = kpis[i][0]; applyStyle(lbl, S.kpiLabel)
    const val = ws1.getCell(`${col}10`)
    val.value = kpis[i][1]; applyStyle(val, S.kpiVal)
  }
  ws1.getRow(8).height = 10; ws1.getRow(9).height = 15; ws1.getRow(10).height = 36
  ws1.getRow(11).height = 12

  // Tableau répartition par type
  const typeData = [
    ['💳 Crédit',           'credit'],
    ['🛒 Encaissement',     'debit'],
    ['📦 Retrait résa',     'retrait'],
    ['🎁 Retrait bénévole', 'benev-retrait'],
    ['📋 Réservation',      'reservation'],
    ['❌ Annulation',       'annulation'],
  ]

  ws1.mergeCells('B12:F12')
  const sth = ws1.getCell('B12')
  sth.value = '📊  Répartition financière par type de transaction'
  applyStyle(sth, S.h2); sth.font = {...S.h2.font, size:12, color:{argb:'FFFFFFFF'}}
  sth.fill = { type:'pattern', pattern:'solid', fgColor:{argb:toARGB(brand)} }
  ws1.getRow(12).height = 24

  const thRow = ws1.getRow(13)
  ;['Type','Nb transactions','Montant total (€)','Moyenne (€)'].forEach((h,j)=>{
    const cell = thRow.getCell(j+2)
    cell.value = h; applyStyle(cell, S.th)
  })
  thRow.height = 20

  typeData.forEach(([label, typ], k) => {
    const txs_t = allTx.filter(t=>t.type===typ)
    const nb = txs_t.length
    const mt = txs_t.reduce((a,t)=>a+(t.montant||0),0)
    const avg = nb ? mt/nb : 0
    const row = ws1.getRow(14+k)
    const st = k%2===0 ? S.td : S.td2
    ;[label, nb, parseFloat(euro(mt)), parseFloat(euro(avg))].forEach((v,j)=>{
      const cell = row.getCell(j+2); cell.value = v; applyStyle(cell, st)
      if (j>0) { cell.alignment={horizontal:'right',vertical:'middle'}; cell.border=st.border }
      if (j>=2) cell.numFmt = '#,##0.00'
    })
    row.height = 18
  })

  // ══ Feuille 2 : TRANSACTIONS ══════════════════════════════════════
  const ws2 = wb.addWorksheet('💳 Transactions', { views:[{showGridLines:false}] })
  ws2.columns = [
    {key:'date',  header:'Date',                      width:14},
    {key:'heure', header:'Heure',                     width:10},
    {key:'type',  header:'Type',                      width:20},
    {key:'who',   header:'Spectateur / Bénévole',     width:26},
    {key:'label', header:'Libellé',                   width:44},
    {key:'mt',    header:'Montant (€)',                width:14},
    {key:'staff', header:'Staff',                     width:20},
    {key:'code',  header:'Code résa',                 width:14},
  ]

  ws2.mergeCells(`A1:H1`)
  const h1w2 = ws2.getCell('A1')
  h1w2.value = '💳  Détail complet des transactions'
  applyStyle(h1w2, S.h1); ws2.getRow(1).height = 26

  ws2.mergeCells('A2:H2')
  ws2.getCell('A2').value = `Généré le ${nowStr()} — ${allTx.length} transactions`
  ws2.getCell('A2').font = {name:'Arial', size:9, color:{argb:'FF64748B'}}
  ws2.getRow(2).height = 16

  const thRow2 = ws2.getRow(4)
  ws2.columns.forEach((col,j) => {
    const cell = thRow2.getCell(j+1); cell.value = col.header; applyStyle(cell, S.th)
  })
  thRow2.height = 22

  const TYPE_LABELS = {
    'credit':'💳 Crédit','debit':'🛒 Encaissement','retrait':'📦 Retrait',
    'benev-retrait':'🎁 Retrait bénévole','reservation':'📋 Réservation',
    'annulation':'❌ Annulation','benev-reservation':'📋 Résa bénévole',
    'benev-annulation':'❌ Annul. bénévole',
  }

  const sortedTx = [...allTx].sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''))
  sortedTx.forEach((t,i) => {
    const ts = t.timestamp||''
    let dateStr=t.date||'—', timeStr=t.heure||'—'
    try { const d=new Date(ts); dateStr=d.toLocaleDateString('fr-FR'); timeStr=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) } catch{}
    const mt = t.montant||0
    const who = t.benevoleNom||t.specNom||'—'
    const row = ws2.getRow(i+5)
    const st  = i%2===0 ? S.td : S.td2
    ;[dateStr, timeStr, TYPE_LABELS[t.type]||t.type||'—', who,
      t.label||'—', parseFloat(euro(mt)), t.staff||'—', t.resaCode||'—'].forEach((v,j)=>{
      const cell = row.getCell(j+1); cell.value = v; applyStyle(cell, st)
      if (j===5) {
        cell.numFmt = '#,##0.00 "€"'
        cell.alignment = {horizontal:'right',vertical:'middle'}
        if (t.type==='credit') applyStyle(cell, S.pos)
        else if (['debit','retrait','benev-retrait'].includes(t.type)) applyStyle(cell, S.neg)
      }
    })
    row.height = 18
  })

  const totalRow = ws2.getRow(sortedTx.length + 5)
  totalRow.getCell(4).value = 'TOTAL'
  applyStyle(totalRow.getCell(4), S.total)
  const totalCell = totalRow.getCell(6)
  totalCell.value = parseFloat(euro(allTx.reduce((a,t)=>a+(t.montant||0),0)))
  totalCell.numFmt = '#,##0.00 "€"'
  applyStyle(totalCell, S.total)
  totalRow.height = 22
  ws2.views = [{state:'frozen',xSplit:0,ySplit:4}]

  // ══ Feuille 3 : SPECTATEURS ═══════════════════════════════════════
  const ws3 = wb.addWorksheet('👥 Spectateurs', { views:[{showGridLines:false}] })
  ws3.columns = [
    {header:'ID QR',             width:24},{header:'Nom',              width:26},
    {header:'Solde actuel (€)',  width:16},{header:'Nb transactions',  width:16},
    {header:'Total rechargé (€)',width:18},{header:'Total dépensé (€)',width:18},
    {header:'Dernière opération',width:22},
  ]
  ws3.mergeCells(`A1:G1`)
  applyStyle(ws3.getCell('A1'), S.h1)
  ws3.getCell('A1').value = '👥  Registre des spectateurs'
  ws3.getRow(1).height = 26

  const thRow3 = ws3.getRow(3)
  ws3.columns.forEach((col,j) => { const c=thRow3.getCell(j+1); c.value=col.header; applyStyle(c,S.th) })
  thRow3.height = 22

  const sortedSpecs = [...spectateurs].sort((a,b)=>(b.solde||0)-(a.solde||0))
  sortedSpecs.forEach((s,i) => {
    const myTx = allTx.filter(t=>t.specId===s.id)
    const credits = myTx.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
    const debits  = myTx.filter(t=>['debit','retrait'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
    const lastTs  = myTx.map(t=>t.timestamp||'').sort().reverse()[0]||''
    let last = '—'
    try { last = new Date(lastTs).toLocaleString('fr-FR') } catch{}
    const row = ws3.getRow(i+4)
    const st  = i%2===0 ? S.td : S.td2
    ;[s.id||'', s.nom||'', parseFloat(euro(s.solde||0)), myTx.length,
      parseFloat(euro(credits)), parseFloat(euro(debits)), last].forEach((v,j)=>{
      const cell=row.getCell(j+1); cell.value=v; applyStyle(cell,st)
      if ([2,4,5].includes(j)) { cell.numFmt='#,##0.00 "€"'; cell.alignment={horizontal:'right',vertical:'middle'} }
      if (j===2) {
        if (v<0) applyStyle(cell,S.neg)
        else if (v>0) applyStyle(cell,S.pos)
      }
    })
    row.height = 18
  })
  ws3.views = [{state:'frozen',xSplit:0,ySplit:3}]

  // ══ Feuille 4 : RESERVATIONS ══════════════════════════════════════
  const ws4 = wb.addWorksheet('📋 Réservations', { views:[{showGridLines:false}] })
  ws4.columns = [
    {header:'Code',          width:16},{header:'Bénéficiaire',    width:26},
    {header:'Type',          width:14},{header:'Articles',         width:44},
    {header:'Total (€)',     width:12},{header:'Statut',           width:20},
    {header:'Date',          width:16},{header:'Traité par',       width:20},
  ]
  ws4.mergeCells('A1:H1')
  applyStyle(ws4.getCell('A1'), S.h1)
  ws4.getCell('A1').value = '📋  Journal des réservations'
  ws4.getRow(1).height = 26

  const thRow4 = ws4.getRow(3)
  ws4.columns.forEach((col,j) => { const c=thRow4.getCell(j+1); c.value=col.header; applyStyle(c,S.th) })
  thRow4.height = 22

  const STATUS_LABELS = {
    'pending':'⏳ En revue','processing':'👨‍🍳 En préparation',
    'ready':'✅ Prête','collected':'📦 Retirée','cancelled':'❌ Annulée',
  }
  const STATUS_FILLS = {
    'pending':'FFFEF3C7','processing':'FFEDE9FE','ready':'FFD1FAE5',
    'collected':'FFF1F5F9','cancelled':'FFFEE2E2',
  }

  const sortedResas = [...reservations].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  sortedResas.forEach((r,i) => {
    const items = (r.items||[]).map(it=>`${it.nom||''} ×${it.qty||1}`).join(', ')
    const who = r.benevoleNom||r.specNom||'—'
    const typ = r.isBenev ? '🙋 Bénévole' : '👥 Spectateur'
    let mt = r.total||0
    if (!mt) mt = (r.items||[]).reduce((a,it)=>a+(it.prix||0)*(it.qty||1),0)
    const row = ws4.getRow(i+4)
    const st  = i%2===0 ? S.td : S.td2
    ;[r.code||'', who, typ, items, parseFloat(euro(mt)),
      STATUS_LABELS[r.status]||r.status||'—', r.date||'—', r.collectedBy||'—'].forEach((v,j)=>{
      const cell=row.getCell(j+1); cell.value=v; applyStyle(cell,st)
      if (j===4) { cell.numFmt='#,##0.00 "€"'; cell.alignment={horizontal:'right',vertical:'middle'} }
      if (j===5 && STATUS_FILLS[r.status]) {
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:STATUS_FILLS[r.status]}}
        cell.alignment={horizontal:'center',vertical:'middle'}
      }
    })
    row.height = 18
  })
  ws4.views = [{state:'frozen',xSplit:0,ySplit:3}]

  // ══ Feuille 5 : MENU & STOCKS ══════════════════════════════════════
  const ws5 = wb.addWorksheet('🍽️ Menu & Stocks', { views:[{showGridLines:false}] })
  ws5.columns = [
    {header:'Article',      width:28},{header:'Catégorie',     width:18},
    {header:'Type conso',   width:16},{header:'Prix (€)',       width:12},
    {header:'Stock restant',width:14},{header:'Unités vendues', width:16},
    {header:'CA généré (€)',width:16},
  ]
  ws5.mergeCells('A1:G1')
  applyStyle(ws5.getCell('A1'), S.h1)
  ws5.getCell('A1').value = '🍽️  Performances du menu'
  ws5.getRow(1).height = 26

  const thRow5 = ws5.getRow(3)
  ws5.columns.forEach((col,j) => { const c=thRow5.getCell(j+1); c.value=col.header; applyStyle(c,S.th) })
  thRow5.height = 22

  const CONSO = {'repas':'🍽️ Repas','boisson':'☕ Boisson','eau':'💧 Eau'}
  const sortedMenu = [...menu].sort((a,b)=>(a.cat||'').localeCompare(b.cat||''))
  sortedMenu.forEach((m,i) => {
    const ventes = allTx.filter(t=>['debit','retrait','benev-retrait'].includes(t.type))
      .flatMap(t=>t.items||[]).filter(it=>it.nom===m.nom)
    const unites = ventes.reduce((a,it)=>a+(it.qty||1),0)
    const ca     = ventes.reduce((a,it)=>a+(it.total||(it.prixUnit||0)*(it.qty||1)),0)
    const row = ws5.getRow(i+4)
    const st  = i%2===0 ? S.td : S.td2
    ;[m.nom||'', m.cat||'', CONSO[m.typeConsommation]||'—',
      parseFloat(euro(m.prix||0)), m.stock||0, unites, parseFloat(euro(ca))].forEach((v,j)=>{
      const cell=row.getCell(j+1); cell.value=v; applyStyle(cell,st)
      if ([3,6].includes(j)) { cell.numFmt='#,##0.00 "€"'; cell.alignment={horizontal:'right',vertical:'middle'} }
      if ([4,5].includes(j)) cell.alignment={horizontal:'center',vertical:'middle'}
      if (j===4 && (m.stock||0) === 0) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFEE2E2'}}
      else if (j===4 && (m.stock||0) <= (m.seuilAlerte||10)) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFEF3C7'}}
    })
    row.height = 18
  })
  ws5.views = [{state:'frozen',xSplit:0,ySplit:3}]

  // ══ Feuille 6 : AUDIT ══════════════════════════════════════════════
  const ws6 = wb.addWorksheet("📋 Journal d'audit", { views:[{showGridLines:false}] })
  ws6.columns = [
    {header:'Date',         width:14},{header:'Heure',            width:10},
    {header:'Action',       width:22},{header:'Type utilisateur',  width:18},
    {header:'Libellé',      width:46},{header:'Nom bénéficiaire',  width:26},
    {header:'Staff',        width:22},{header:'Code résa',         width:14},
    {header:'Montant (€)',  width:13},
  ]
  ws6.mergeCells('A1:I1')
  applyStyle(ws6.getCell('A1'), S.h1)
  ws6.getCell('A1').value = "📋  Journal d'audit complet"
  ws6.getRow(1).height = 26

  const thRow6 = ws6.getRow(3)
  ws6.columns.forEach((col,j) => { const c=thRow6.getCell(j+1); c.value=col.header; applyStyle(c,S.th) })
  thRow6.height = 22

  const USER_ICON = {staff:'👤',admin:'🛡️',benevole:'🙋',spectateur:'👥'}
  const sortedAudit = [...audit].sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''))
  sortedAudit.forEach((l,i) => {
    const ts = l.timestamp||''
    let dateStr=l.date||'—', timeStr=l.heure||'—'
    try { const d=new Date(ts); dateStr=d.toLocaleDateString('fr-FR'); timeStr=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) } catch{}
    const ut = l.userType||''
    const who = l.benevoleNom||l.specNom||'—'
    const mt  = l.montant
    const row = ws6.getRow(i+4)
    const st  = i%2===0 ? S.td : S.td2
    ;[dateStr, timeStr, l.action||'—', ut ? `${USER_ICON[ut]||'📝'} ${ut}` : '—',
      l.label||'—', who, l.staff||'—', l.resaCode||'—',
      mt!=null ? parseFloat(euro(mt)) : '—'].forEach((v,j)=>{
      const cell=row.getCell(j+1); cell.value=v; applyStyle(cell,st)
      if (j===8 && v!=='—') { cell.numFmt='#,##0.00 "€"'; cell.alignment={horizontal:'right',vertical:'middle'} }
    })
    row.height = 18
  })
  ws6.views = [{state:'frozen',xSplit:0,ySplit:3}]

  return wb
}

exports.generateRapport = onRequest({
  region: 'europe-west1',
  memory: '512MiB',
  timeoutSeconds: 120,
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).send('')
    return
  }
  res.set('Access-Control-Allow-Origin', '*')

  try {
    const payload = req.body
    if (!payload || !payload.event) {
      res.status(400).json({ error: 'Missing event data' })
      return
    }

    const wb = await buildWorkbook(payload)
    const buffer = await wb.xlsx.writeBuffer()

    const eventName = (payload.event.nom||'rapport').replace(/[^a-z0-9]/gi,'-').toLowerCase()
    const date = new Date().toISOString().slice(0,10)
    const filename = `yllacash-${eventName}-${date}.xlsx`

    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)

  } catch (e) {
    console.error('generateRapport error:', e)
    res.status(500).json({ error: e.message })
  }
})
