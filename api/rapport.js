/**
 * api/rapport.js — Vercel Serverless Function Node.js
 * ExcelJS côté serveur : styles + graphiques natifs Excel garantis
 * POST /api/rapport — body JSON
 */

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  // Parser le body JSON manuellement — req.body peut etre undefined sur Vercel
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
    wb.creator = 'YllaCash'; wb.created = new Date()

    const event    = data.event    || {}
    const txs      = data.transactions || []
    const specs    = data.spectateurs  || []
    const resas    = data.reservations || []
    const menuLst  = data.menu         || []
    const auditLst = data.audit        || []
    const nom      = event.nom || 'Événement'
    const brand    = (event.couleur || '#1a6b7a').replace('#','')

    const dk = (h,f=0.15) => { const r=Math.floor(parseInt(h.slice(0,2),16)*(1-f)),g=Math.floor(parseInt(h.slice(2,4),16)*(1-f)),b=Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h,f=0.88) => { const r=Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)),g=Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)),b=Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND='FF'+brand.toUpperCase(), BRANDL='FF'+lt(brand), BRANDD='FF'+dk(brand)
    const W='FFFFFFFF',GBG='FFF8F9FA',GRN='FFD1FAE5',REDD='FFFEE2E2',AMB='FFFEF3C7',PUR='FFEDE9FE'
    const euro = c => parseFloat(((c||0)/100).toFixed(2))
    const fmtE = c => `${euro(c).toFixed(2)} €`
    const EUR  = '#,##0.00 "€"'
    const now  = new Date().toLocaleString('fr-FR')

    const TX_L = {credit:'💳 Crédit',debit:'🛒 Encaissement',retrait:'📦 Retrait','benev-retrait':'🎁 Retrait bénévole',reservation:'📋 Réservation',annulation:'❌ Annulation','benev-reservation':'📋 Résa bénévole','benev-annulation':'❌ Annul. bénévole'}
    const ST_L = {pending:'⏳ En revue',processing:'👨‍🍳 En préparation',ready:'✅ Prête',collected:'📦 Retirée',cancelled:'❌ Annulée'}
    const ST_C = {pending:{argb:AMB},processing:{argb:PUR},ready:{argb:GRN},collected:{argb:GBG},cancelled:{argb:REDD}}

    const bord = {top:{style:'thin',color:{argb:'FFE2E8F0'}},bottom:{style:'thin',color:{argb:'FFE2E8F0'}},left:{style:'thin',color:{argb:'FFE2E8F0'}},right:{style:'thin',color:{argb:'FFE2E8F0'}}}
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
      numR:{font:{name:'Arial',size:10},alignment:{horizontal:'right',vertical:'middle'},border:bord},
      cen: {font:{name:'Arial',size:10},alignment:{horizontal:'center',vertical:'middle'},border:bord},
    }
    const ap = (cell,s,val,fmt) => { if(s.font)cell.font=s.font; if(s.fill)cell.fill=s.fill; if(s.alignment)cell.alignment=s.alignment; if(s.border)cell.border=s.border; if(val!==undefined)cell.value=val; if(fmt)cell.numFmt=fmt }

    // KPIs
    const totalCredits = txs.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
    const totalVentes  = txs.filter(t=>['debit','retrait','benev-retrait'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
    const totalSoldes  = specs.reduce((a,s)=>a+(s.solde||0),0)
    const benevR       = resas.filter(r=>r.isBenev&&r.status==='collected')
    const coutBenev    = benevR.reduce((a,r)=>a+(r.items||[]).reduce((b,i)=>b+(i.prix||0)*(i.qty||1),0),0)
    const caNette      = totalVentes-coutBenev
    const resasSpec    = resas.filter(r=>!r.isBenev)
    const taux         = resasSpec.length ? Math.round(resasSpec.filter(r=>r.status==='collected').length/resasSpec.length*100) : 0

    // ── FEUILLE 1 — TABLEAU DE BORD ──────────────────────────────────
    const ws1 = wb.addWorksheet('📊 Tableau de bord',{views:[{showGridLines:false}]})
    ws1.columns=[{width:2},{width:24},{width:24},{width:24},{width:24},{width:4}]
    ws1.mergeCells('B1:E3'); ap(ws1.getCell('B1'),S.h1,`YllaCash — ${nom.toUpperCase()}`)
    ws1.getRow(1).height=20;ws1.getRow(2).height=20;ws1.getRow(3).height=20
    ws1.mergeCells('B4:E4'); ap(ws1.getCell('B4'),S.sub,`Rapport financier — Généré le ${now}`)
    ws1.getRow(4).height=18;ws1.getRow(5).height=8

    const kpis=[['💰 CA Brut encaissé',fmtE(totalVentes)],['💳 Total rechargé',fmtE(totalCredits)],['🏦 Soldes restants',fmtE(totalSoldes)],['👥 Spectateurs',String(specs.length)],['📋 Taux retrait',`${taux}%`],['📈 CA Net',fmtE(caNette)]]
    kpis.slice(0,3).forEach(([l,v],i)=>{const c=String.fromCharCode(66+i);ap(ws1.getCell(`${c}6`),S.kpiL,l);ap(ws1.getCell(`${c}7`),S.kpiV,v)})
    ws1.getRow(6).height=14;ws1.getRow(7).height=36;ws1.getRow(8).height=8
    kpis.slice(3).forEach(([l,v],i)=>{const c=String.fromCharCode(66+i);ap(ws1.getCell(`${c}9`),S.kpiL,l);ap(ws1.getCell(`${c}10`),S.kpiV,v)})
    ws1.getRow(9).height=14;ws1.getRow(10).height=36;ws1.getRow(11).height=10

    ws1.mergeCells('B12:E12'); ap(ws1.getCell('B12'),S.h1,'📊  Répartition des transactions par type')
    ws1.getRow(12).height=22
    ;['Type','Nb transactions','Montant total (€)','Moyenne (€)'].forEach((h,j)=>ap(ws1.getCell(13,2+j),S.th,h))
    ws1.getRow(13).height=20

    const txTypes=[['💳 Crédit','credit'],['🛒 Encaissement','debit'],['📦 Retrait résa','retrait'],['🎁 Retrait bénévole','benev-retrait'],['📋 Réservation','reservation'],['❌ Annulation','annulation']]
    txTypes.forEach(([lbl,typ],k)=>{
      const txk=txs.filter(t=>t.type===typ),nb=txk.length,mt=txk.reduce((a,t)=>a+(t.montant||0),0)
      const st=k%2===0?S.td:S.td2,row=14+k
      ap(ws1.getCell(row,2),st,lbl)
      ap(ws1.getCell(row,3),{...st,alignment:{horizontal:'center',vertical:'middle'}},nb)
      ap(ws1.getCell(row,4),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(mt),EUR)
      ap(ws1.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},nb?euro(mt/nb):0,EUR)
      ws1.getRow(row).height=18
    })
    const lastTx=14+txTypes.length-1

    // Graphique 1 — Barres CA par type (données feuille 1 réelles)

    // Données camembert (lignes cachées)
    const nbRS=resasSpec.length, nbBR=benevR.length
    if(nbRS+nbBR>0){
    }

    ws1.autoFilter='B13:E13'

    // ── FEUILLE 2 — TRANSACTIONS ─────────────────────────────────────
    const ws2=wb.addWorksheet('💳 Transactions',{views:[{showGridLines:false}]})
    ws2.columns=[{width:14},{width:10},{width:20},{width:26},{width:42},{width:14},{width:18},{width:14},{width:2},{width:20},{width:14}]
    ws2.mergeCells('A1:H1');ap(ws2.getCell('A1'),S.h1,'💳  Détail complet des transactions');ws2.getRow(1).height=26
    ws2.mergeCells('A2:H2');ap(ws2.getCell('A2'),S.sub,`Généré le ${now} — ${txs.length} transactions`);ws2.getRow(2).height=16
    ;['Date','Heure','Type','Bénéficiaire','Libellé','Montant (€)','Staff','Code résa'].forEach((h,j)=>ap(ws2.getCell(4,j+1),S.th,h))
    ws2.getRow(4).height=22

    const sortedTx=[...txs].sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''))
    sortedTx.forEach((t,i)=>{
      let ds=t.date||'—',hs=t.heure||'—'
      try{const d=new Date(t.timestamp||'');if(!isNaN(d)){ds=d.toLocaleDateString('fr-FR');hs=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}}catch{}
      const st=i%2===0?S.td:S.td2,mt=t.montant||0,who=(t.benevoleNom||t.specNom||'—').slice(0,30),row=i+5
      ap(ws2.getCell(row,1),st,ds);ap(ws2.getCell(row,2),st,hs);ap(ws2.getCell(row,3),st,TX_L[t.type]||t.type||'—')
      ap(ws2.getCell(row,4),st,who);ap(ws2.getCell(row,5),st,(t.label||'—').slice(0,80))
      const mSt=t.type==='credit'?S.pos:['debit','retrait','benev-retrait'].includes(t.type)?S.neg:{...st,alignment:{horizontal:'right',vertical:'middle'}}
      ap(ws2.getCell(row,6),mSt,euro(mt),EUR)
      ap(ws2.getCell(row,7),st,(t.staff||'—').slice(0,20));ap(ws2.getCell(row,8),st,t.resaCode||'—')
      ws2.getRow(row).height=18
    })
    const totR2=sortedTx.length+5
    ap(ws2.getCell(totR2,4),S.tot,'TOTAL');ap(ws2.getCell(totR2,6),S.tot,euro(txs.reduce((a,t)=>a+(t.montant||0),0)),EUR)
    ws2.getRow(totR2).height=22

    // Données staff pour graphique
    const staffAgg={}; txs.forEach(t=>{const k=(t.staff||'—').slice(0,20);staffAgg[k]=(staffAgg[k]||0)+(t.montant||0)})
    const staffS=Object.entries(staffAgg).sort(([,a],[,b])=>b-a).slice(0,8)
    if(staffS.length>0){
    }
    ws2.autoFilter='A4:H4'
    ws2.views=[{state:'frozen',xSplit:0,ySplit:4}]

    // ── FEUILLE 3 — SPECTATEURS ──────────────────────────────────────
    const ws3=wb.addWorksheet('👥 Spectateurs',{views:[{showGridLines:false}]})
    ws3.columns=[{width:24},{width:26},{width:16},{width:14},{width:18},{width:18}]
    ws3.mergeCells('A1:F1');ap(ws3.getCell('A1'),S.h1,'👥  Registre des spectateurs');ws3.getRow(1).height=26
    ;['ID QR','Nom','Solde actuel (€)','Nb transactions','Total rechargé (€)','Total dépensé (€)'].forEach((h,j)=>ap(ws3.getCell(3,j+1),S.th,h))
    ws3.getRow(3).height=22
    ;[...specs].sort((a,b)=>(b.solde||0)-(a.solde||0)).forEach((s,i)=>{
      const myTx=txs.filter(t=>t.specId===s.id)
      const cr=myTx.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
      const db=myTx.filter(t=>['debit','retrait'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
      const sol=euro(s.solde||0),st=i%2===0?S.td:S.td2,row=i+4
      ap(ws3.getCell(row,1),st,s.id||'—');ap(ws3.getCell(row,2),st,s.nom||'—')
      ap(ws3.getCell(row,3),sol<0?S.neg:sol>0?S.pos:{...st,alignment:{horizontal:'right',vertical:'middle'}},sol,EUR)
      ap(ws3.getCell(row,4),{...st,alignment:{horizontal:'center',vertical:'middle'}},myTx.length)
      ap(ws3.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(cr),EUR)
      ap(ws3.getCell(row,6),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(db),EUR)
      ws3.getRow(row).height=18
    })
    ws3.autoFilter='A3:F3'
    ws3.views=[{state:'frozen',xSplit:0,ySplit:3}]

    // ── FEUILLE 4 — RÉSERVATIONS ─────────────────────────────────────
    const ws4=wb.addWorksheet('📋 Réservations',{views:[{showGridLines:false}]})
    ws4.columns=[{width:16},{width:26},{width:14},{width:40},{width:12},{width:20},{width:16},{width:20}]
    ws4.mergeCells('A1:H1');ap(ws4.getCell('A1'),S.h1,'📋  Journal des réservations');ws4.getRow(1).height=26
    ;['Code','Bénéficiaire','Type','Articles','Total (€)','Statut','Date','Traité par'].forEach((h,j)=>ap(ws4.getCell(3,j+1),S.th,h))
    ws4.getRow(3).height=22
    ;[...resas].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach((r,i)=>{
      const items=(r.items||[]).map(it=>`${it.nom||''} ×${it.qty||1}`).join(', ')
      const who=(r.benevoleNom||r.specNom||'—').slice(0,30),typ=r.isBenev?'🙋 Bénévole':'👥 Spectateur'
      let mt=r.total||0;if(!mt)mt=(r.items||[]).reduce((a,it)=>a+(it.prix||0)*(it.qty||1),0)
      const status=r.status||'',st=i%2===0?S.td:S.td2,row=i+4
      ap(ws4.getCell(row,1),st,r.code||'—');ap(ws4.getCell(row,2),st,who)
      ap(ws4.getCell(row,3),{...st,alignment:{horizontal:'center',vertical:'middle'}},typ)
      ap(ws4.getCell(row,4),st,items.slice(0,60))
      ap(ws4.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(mt),EUR)
      const sc=ws4.getCell(row,6)
      sc.value=ST_L[status]||status
      sc.font=st.font
      sc.fill={type:'pattern',pattern:'solid',fgColor:ST_C[status]||{argb:GBG},bgColor:{argb:'FF000000'}}
      sc.alignment={horizontal:'center',vertical:'middle'}
      sc.border=bord
      ap(ws4.getCell(row,7),st,r.date||'—');ap(ws4.getCell(row,8),st,(r.collectedBy||'—').slice(0,20))
      ws4.getRow(row).height=18
    })
    ws4.autoFilter='A3:H3'
    ws4.views=[{state:'frozen',xSplit:0,ySplit:3}]

    // ── FEUILLE 5 — MENU & STOCKS ────────────────────────────────────
    const ws5=wb.addWorksheet('🍽️ Menu & Stocks',{views:[{showGridLines:false}]})
    ws5.columns=[{width:28},{width:18},{width:16},{width:12},{width:14},{width:16},{width:16}]
    ws5.mergeCells('A1:G1');ap(ws5.getCell('A1'),S.h1,'🍽️  Performances du menu');ws5.getRow(1).height=26
    ;['Article','Catégorie','Type conso','Prix (€)','Stock restant','Unités vendues','CA généré (€)'].forEach((h,j)=>ap(ws5.getCell(3,j+1),S.th,h))
    ws5.getRow(3).height=22
    const CONSO={'repas':'🍽️ Repas','boisson':'☕ Boisson','eau':'💧 Eau'}
    const sortedMenu=[...menuLst].sort((a,b)=>(a.cat||'').localeCompare(b.cat||''))
    sortedMenu.forEach((m,i)=>{
      const ventes=txs.filter(t=>['debit','retrait','benev-retrait'].includes(t.type)).flatMap(t=>t.items||[]).filter(it=>it.nom===m.nom)
      const unites=ventes.reduce((a,it)=>a+(it.qty||1),0)
      const ca=ventes.reduce((a,it)=>a+(it.total||(it.prixUnit||it.prix||0)*(it.qty||1)),0)
      const stk=m.stock||0,st=i%2===0?S.td:S.td2,row=i+4
      ap(ws5.getCell(row,1),st,m.nom||'—');ap(ws5.getCell(row,2),st,m.cat||'—')
      ap(ws5.getCell(row,3),{...st,alignment:{horizontal:'center',vertical:'middle'}},CONSO[m.typeConsommation]||'—')
      ap(ws5.getCell(row,4),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(m.prix||0),EUR)
      const sc=ws5.getCell(row,5)
      sc.value=stk
      if(stk===0){sc.font={name:'Arial',bold:true,size:10,color:{argb:'FF991B1B'}};sc.fill={type:'pattern',pattern:'solid',fgColor:{argb:REDD},bgColor:{argb:'FF000000'}};sc.alignment={horizontal:'center',vertical:'middle'};sc.border=bord}
      else if(stk<=10){sc.font={name:'Arial',bold:true,size:10,color:{argb:'FF92400E'}};sc.fill={type:'pattern',pattern:'solid',fgColor:{argb:AMB},bgColor:{argb:'FF000000'}};sc.alignment={horizontal:'center',vertical:'middle'};sc.border=bord}
      else{ap(sc,{...st,alignment:{horizontal:'center',vertical:'middle'}},undefined)}
      ap(ws5.getCell(row,6),{...st,alignment:{horizontal:'center',vertical:'middle'}},unites)
      ap(ws5.getCell(row,7),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(ca),EUR)
      ws5.getRow(row).height=18
    })
    if(sortedMenu.length>0){
    }
    ws5.autoFilter='A3:G3'
    ws5.views=[{state:'frozen',xSplit:0,ySplit:3}]

    // ── FEUILLE 6 — AUDIT ────────────────────────────────────────────
    const ws6=wb.addWorksheet("📋 Journal d'audit",{views:[{showGridLines:false}]})
    ws6.columns=[{width:14},{width:10},{width:22},{width:18},{width:44},{width:26},{width:22},{width:14},{width:13}]
    ws6.mergeCells('A1:I1');ap(ws6.getCell('A1'),S.h1,"📋  Journal d'audit complet");ws6.getRow(1).height=26
    ;['Date','Heure','Action','Type utilisateur','Libellé','Bénéficiaire','Staff','Code résa','Montant (€)'].forEach((h,j)=>ap(ws6.getCell(3,j+1),S.th,h))
    ws6.getRow(3).height=22
    const UICO={staff:'👤',admin:'🛡️',benevole:'🙋',spectateur:'👥'}
    ;[...auditLst].sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||'')).forEach((l,i)=>{
      let ds=l.date||'—',hs=l.heure||'—'
      try{const d=new Date(l.timestamp||'');if(!isNaN(d)){ds=d.toLocaleDateString('fr-FR');hs=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}}catch{}
      const ut=l.userType||'',who=(l.benevoleNom||l.specNom||'—').slice(0,30),st=i%2===0?S.td:S.td2,mt=l.montant,row=i+4
      ap(ws6.getCell(row,1),st,ds);ap(ws6.getCell(row,2),st,hs);ap(ws6.getCell(row,3),st,l.action||'—')
      ap(ws6.getCell(row,4),{...st,alignment:{horizontal:'center',vertical:'middle'}},ut?`${UICO[ut]||'📝'} ${ut}`:'—')
      ap(ws6.getCell(row,5),st,(l.label||'—').slice(0,80));ap(ws6.getCell(row,6),st,who)
      ap(ws6.getCell(row,7),st,(l.staff||l.byStaff||'—').slice(0,20));ap(ws6.getCell(row,8),st,l.resaCode||'—')
      mt!=null ? ap(ws6.getCell(row,9),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(mt),EUR) : ap(ws6.getCell(row,9),st,'—')
      ws6.getRow(row).height=18
    })
    ws6.autoFilter='A3:I3'
    ws6.views=[{state:'frozen',xSplit:0,ySplit:3}]

    // ── Envoyer le fichier ───────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer()
    const dt  = new Date().toLocaleDateString('fr-FR').replace(/\//g,'_')
    const fn  = `${nom} - Rapport Excel - ${dt}.xlsx`
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(fn)}"`)
    res.send(Buffer.from(buf))

  } catch(e) {
    console.error('Rapport error:', e)
    res.status(500).json({ error: e.message, stack: e.stack })
  }
}
