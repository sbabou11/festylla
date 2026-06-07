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
    const appVersion = data.appVersion || 'v1.0.0'
    wb.creator = `YllaCash ${appVersion}`; wb.created = new Date()

    const event    = data.event    || {}
    const txs      = data.transactions || []
    const specs    = data.spectateurs  || []
    const resas    = data.reservations || []
    const menuLst  = data.menu         || []
    const auditLst = data.audit        || []
    const expoLstForStats = data.expositions || []

    // ─── Helpers numériques robustes (déclarés AVANT toute utilisation) ──
    // num() : convertit en nombre safe (jamais NaN/Infinity → 0)
    const num = (v) => {
      if (v === null || v === undefined || v === '') return 0
      const n = Number(v)
      return isFinite(n) ? n : 0
    }

    // Total des frais exposants encaissés (acompte + solde de chaque exposant)
    const totalExpoEncaisse = expoLstForStats.reduce((a, e) => {
      return a + num(e?.acompte?.montant) + num(e?.solde?.montant)
    }, 0)
    const nom      = event.nom || 'Événement'
    const brand    = (event.couleur || '#1a6b7a').replace('#','')

    const dk = (h,f=0.15) => { const r=Math.floor(parseInt(h.slice(0,2),16)*(1-f)),g=Math.floor(parseInt(h.slice(2,4),16)*(1-f)),b=Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h,f=0.88) => { const r=Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)),g=Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)),b=Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND='FF'+brand.toUpperCase(), BRANDL='FF'+lt(brand), BRANDD='FF'+dk(brand)
    const W='FFFFFFFF',GBG='FFF8F9FA',GRN='FFD1FAE5',REDD='FFFEE2E2',AMB='FFFEF3C7',PUR='FFEDE9FE'
    // euro() : centimes → euros, sans risque de NaN
    const euro = c => parseFloat((num(c)/100).toFixed(2))
    const fmtE = c => `${euro(c).toFixed(2)} €`
    const EUR  = '#,##0.00 "€"'
    const now  = new Date().toLocaleString('fr-FR')

    const TX_L = {credit:'💳 Crédit',debit:'🛒 Encaissement',retrait:'📦 Retrait','benev-retrait':'🎁 Retrait bénévole',reservation:'📋 Réservation',annulation:'❌ Annulation','benev-reservation':'📋 Résa bénévole','benev-annulation':'❌ Annul. bénévole','artist-gift':'🎵 Avantage artiste','cachet-artiste':'🎤 Cachet artiste',remboursement:'💸 Remboursement solde',credit_correction:'↑ Crédit correction'}
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

    // KPIs (calculs robustes — num() ignore les NaN/strings)
    const totalCredits = txs.filter(t=>t && t.type==='credit').reduce((a,t)=>a+num(t.montant),0)
    const totalVentes  = txs.filter(t=>t && ['debit','retrait','benev-retrait'].includes(t.type)).reduce((a,t)=>a+num(t.montant),0)
    const totalSoldes  = specs.reduce((a,s)=>a+num(s && s.solde),0)
    const benevR       = resas.filter(r=>r && r.isBenev && r.status==='collected')
    const coutBenev    = benevR.reduce((a,r)=>a+(Array.isArray(r.items)?r.items:[]).reduce((b,i)=>b+num(i&&i.prix)*(num(i&&i.qty)||1),0),0)
    const caNette      = totalVentes-coutBenev
    const resasSpec    = resas.filter(r=>r && !r.isBenev)
    const taux         = resasSpec.length ? Math.round(resasSpec.filter(r=>r.status==='collected').length/resasSpec.length*100) : 0

    // ── FEUILLE 1 — TABLEAU DE BORD ──────────────────────────────────
    const ws1 = wb.addWorksheet('📊 Tableau de bord',{views:[{showGridLines:false}]})
    ws1.columns=[{width:2},{width:24},{width:24},{width:24},{width:24},{width:4}]
    ws1.mergeCells('B1:E3'); ap(ws1.getCell('B1'),S.h1,`YllaCash — ${nom.toUpperCase()}`)
    ws1.getRow(1).height=20;ws1.getRow(2).height=20;ws1.getRow(3).height=20
    ws1.mergeCells('B4:E4'); ap(ws1.getCell('B4'),S.sub,`Rapport financier — Généré le ${now} — YllaCash ${appVersion}`)
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

    const txTypes=[['💳 Crédit','credit'],['🛒 Encaissement','debit'],['📦 Retrait résa','retrait'],['🎁 Retrait bénévole','benev-retrait'],['📋 Réservation','reservation'],['❌ Annulation','annulation'],['❌ Annul. bénévole','benev-annulation'],['🎵 Avantage artiste','artist-gift'],['🎤 Cachet artiste','cachet-artiste'],['💸 Remboursement solde','remboursement'],['↑ Crédit correction','credit_correction']]
    txTypes.forEach(([lbl,typ],k)=>{
      try {
        const txk=txs.filter(t=>t && t.type===typ),nb=txk.length,mt=txk.reduce((a,t)=>a+num(t.montant),0)
        const st=k%2===0?S.td:S.td2,row=14+k
        ap(ws1.getCell(row,2),st,lbl)
        ap(ws1.getCell(row,3),{...st,alignment:{horizontal:'center',vertical:'middle'}},nb)
        ap(ws1.getCell(row,4),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(mt),EUR)
        ap(ws1.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},nb?euro(mt/nb):0,EUR)
        ws1.getRow(row).height=18
      } catch (err) { console.error('[rapport] txTypes row error:', err && err.message) }
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

    const sortedTx=[...txs].filter(Boolean).sort((a,b)=>String(b&&b.timestamp||'').localeCompare(String(a&&a.timestamp||'')))
    sortedTx.forEach((t,i)=>{
      try {
        let ds=t.date||'—',hs=t.heure||'—'
        try{const d=new Date(t.timestamp||'');if(!isNaN(d)){ds=d.toLocaleDateString('fr-FR');hs=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}}catch{}
        const st=i%2===0?S.td:S.td2,mt=num(t.montant),who=String(t.benevoleNom||t.specNom||'—').slice(0,30),row=i+5
        ap(ws2.getCell(row,1),st,ds);ap(ws2.getCell(row,2),st,hs);ap(ws2.getCell(row,3),st,TX_L[t.type]||t.type||'—')
        ap(ws2.getCell(row,4),st,who);ap(ws2.getCell(row,5),st,String(t.label||'—').slice(0,80))
        // Coloration du montant selon le sens :
        //   - Vert (S.pos) pour les ENTRÉES : credit, credit_correction, reservation
        //   - Rouge (S.neg) pour les SORTIES : debit, retrait, benev-retrait, annulation, benev-annulation, remboursement, artist-gift, cachet-artiste
        const mSt = ['credit','credit_correction','reservation'].includes(t.type)
          ? S.pos
          : ['debit','retrait','benev-retrait','annulation','benev-annulation','remboursement','artist-gift','cachet-artiste'].includes(t.type)
            ? S.neg
            : {...st,alignment:{horizontal:'right',vertical:'middle'}}
        ap(ws2.getCell(row,6),mSt,euro(mt),EUR)
        ap(ws2.getCell(row,7),st,String(t.staff||'—').slice(0,20));ap(ws2.getCell(row,8),st,String(t.resaCode||'—'))
        ws2.getRow(row).height=18
      } catch (err) { console.error(`[rapport] tx row ${i} error:`, err && err.message) }
    })
    const totR2=sortedTx.length+5
    ap(ws2.getCell(totR2,4),S.tot,'TOTAL');ap(ws2.getCell(totR2,6),S.tot,euro(txs.reduce((a,t)=>a+num(t&&t.montant),0)),EUR)
    ws2.getRow(totR2).height=22

    // Données staff pour graphique
    const staffAgg={}; txs.forEach(t=>{if(!t)return;const k=String(t.staff||'—').slice(0,20);staffAgg[k]=(staffAgg[k]||0)+num(t.montant)})
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
    ;[...specs].filter(Boolean).sort((a,b)=>num(b&&b.solde)-num(a&&a.solde)).forEach((s,i)=>{
      try {
        const myTx=txs.filter(t=>t && t.specId===s.id)
        // Total "rechargé" : crédits réguliers + crédits de correction (geste commercial, etc.)
        const cr=myTx.filter(t=>['credit','credit_correction'].includes(t.type)).reduce((a,t)=>a+num(t.montant),0)
        // Total "dépensé" : tout ce qui est sorti du compte du spectateur
        // (achats au stand + retraits résa + remboursements de solde billetterie)
        const db=myTx.filter(t=>['debit','retrait','remboursement'].includes(t.type)).reduce((a,t)=>a+num(t.montant),0)
        const sol=euro(s.solde),st=i%2===0?S.td:S.td2,row=i+4
        ap(ws3.getCell(row,1),st,String(s.id||'—'));ap(ws3.getCell(row,2),st,String(s.nom||'—'))
        ap(ws3.getCell(row,3),sol<0?S.neg:sol>0?S.pos:{...st,alignment:{horizontal:'right',vertical:'middle'}},sol,EUR)
        ap(ws3.getCell(row,4),{...st,alignment:{horizontal:'center',vertical:'middle'}},myTx.length)
        ap(ws3.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(cr),EUR)
        ap(ws3.getCell(row,6),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(db),EUR)
        ws3.getRow(row).height=18
      } catch (err) { console.error(`[rapport] spec row ${i} error:`, err && err.message) }
    })
    ws3.autoFilter='A3:F3'
    ws3.views=[{state:'frozen',xSplit:0,ySplit:3}]

    // ── FEUILLE 4 — RÉSERVATIONS ─────────────────────────────────────
    const ws4=wb.addWorksheet('📋 Réservations',{views:[{showGridLines:false}]})
    ws4.columns=[{width:16},{width:26},{width:14},{width:40},{width:12},{width:20},{width:16},{width:20}]
    ws4.mergeCells('A1:H1');ap(ws4.getCell('A1'),S.h1,'📋  Journal des réservations');ws4.getRow(1).height=26
    ;['Code','Bénéficiaire','Type','Articles','Total (€)','Statut','Date','Traité par'].forEach((h,j)=>ap(ws4.getCell(3,j+1),S.th,h))
    ws4.getRow(3).height=22
    ;[...resas].filter(Boolean).sort((a,b)=>String(b&&b.date||'').localeCompare(String(a&&a.date||''))).forEach((r,i)=>{
      try {
        const items=(Array.isArray(r.items)?r.items:[]).map(it=>`${String(it&&it.nom||'')} ×${num(it&&it.qty)||1}`).join(', ')
        const who=String(r.benevoleNom||r.specNom||'—').slice(0,30),typ=r.isBenev?'🙋 Bénévole':'👥 Spectateur'
        let mt=num(r.total);if(!mt)mt=(Array.isArray(r.items)?r.items:[]).reduce((a,it)=>a+num(it&&it.prix)*(num(it&&it.qty)||1),0)
        const status=String(r.status||''),st=i%2===0?S.td:S.td2,row=i+4
        ap(ws4.getCell(row,1),st,String(r.code||'—'));ap(ws4.getCell(row,2),st,who)
        ap(ws4.getCell(row,3),{...st,alignment:{horizontal:'center',vertical:'middle'}},typ)
        ap(ws4.getCell(row,4),st,items.slice(0,60))
        ap(ws4.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(mt),EUR)
        const sc=ws4.getCell(row,6)
        sc.value=ST_L[status]||status
        sc.font=st.font
        sc.fill={type:'pattern',pattern:'solid',fgColor:ST_C[status]||{argb:GBG},bgColor:{argb:'FF000000'}}
        sc.alignment={horizontal:'center',vertical:'middle'}
        sc.border=bord
        ap(ws4.getCell(row,7),st,String(r.date||'—'));ap(ws4.getCell(row,8),st,String(r.collectedBy||'—').slice(0,20))
        ws4.getRow(row).height=18
      } catch (err) { console.error(`[rapport] resa row ${i} error:`, err && err.message) }
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

    // Pré-calcul : ventes agrégées par nom d'article depuis TOUTES les transactions.
    // On collecte ainsi aussi les articles supprimés du menu mais qui ont été vendus.
    const ventesParArticle = {} // nom -> { unites, ca }
    for (const t of (Array.isArray(txs) ? txs : [])) {
      if (!t || !['debit','retrait','benev-retrait'].includes(t.type)) continue
      for (const it of (Array.isArray(t.items) ? t.items : [])) {
        if (!it) continue
        const nm = String(it.nom || '')
        if (!nm) continue
        const qty = num(it.qty) || 1
        const ca = num(it.total) || (num(it.prixUnit) || num(it.prix)) * qty
        if (!ventesParArticle[nm]) ventesParArticle[nm] = { unites: 0, ca: 0 }
        ventesParArticle[nm].unites += qty
        ventesParArticle[nm].ca += ca
      }
    }
    // Construction de la liste : menu actuel + articles vendus mais supprimés.
    // Les articles du menu portent leurs métadonnées (cat, prix, stock, type) ;
    // les articles supprimés affichent "—" pour ces colonnes mais conservent
    // leurs unités vendues et leur CA généré.
    const menuNoms = new Set((menuLst || []).map(m => m && m.nom).filter(Boolean))
    const articlesSupprimes = Object.keys(ventesParArticle)
      .filter(nm => !menuNoms.has(nm))
      .map(nm => ({ nom: nm, cat: '⚠️ Supprimé du menu', prix: 0, stock: null, typeConsommation: null, _supprime: true }))
    const sortedMenu=[...menuLst, ...articlesSupprimes].filter(Boolean).sort((a,b)=>String(a&&a.cat||'').localeCompare(String(b&&b.cat||'')))
    sortedMenu.forEach((m,i)=>{
      try {
        const v = ventesParArticle[m.nom] || { unites: 0, ca: 0 }
        const unites = v.unites
        const ca = v.ca
        const stk=num(m.stock),st=i%2===0?S.td:S.td2,row=i+4
        ap(ws5.getCell(row,1),st,String(m.nom||'—'));ap(ws5.getCell(row,2),st,String(m.cat||'—'))
      ap(ws5.getCell(row,3),{...st,alignment:{horizontal:'center',vertical:'middle'}},CONSO[m.typeConsommation]||'—')
      ap(ws5.getCell(row,4),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(m.prix),EUR)
      const sc=ws5.getCell(row,5)
      // Stock : "—" pour les articles supprimés (plus de notion de stock)
      if (m._supprime) {
        ap(sc,{...st,alignment:{horizontal:'center',vertical:'middle'}},'—')
      } else {
        sc.value=stk
        if(stk===0){sc.font={name:'Arial',bold:true,size:10,color:{argb:'FF991B1B'}};sc.fill={type:'pattern',pattern:'solid',fgColor:{argb:REDD},bgColor:{argb:'FF000000'}};sc.alignment={horizontal:'center',vertical:'middle'};sc.border=bord}
        else if(stk<=10){sc.font={name:'Arial',bold:true,size:10,color:{argb:'FF92400E'}};sc.fill={type:'pattern',pattern:'solid',fgColor:{argb:AMB},bgColor:{argb:'FF000000'}};sc.alignment={horizontal:'center',vertical:'middle'};sc.border=bord}
        else{ap(sc,{...st,alignment:{horizontal:'center',vertical:'middle'}},undefined)}
      }
      ap(ws5.getCell(row,6),{...st,alignment:{horizontal:'center',vertical:'middle'}},unites)
      ap(ws5.getCell(row,7),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(ca),EUR)
      ws5.getRow(row).height=18
      } catch (err) { console.error(`[rapport] menu row ${i} error:`, err && err.message) }
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
    ;[...auditLst].filter(Boolean).sort((a,b)=>String(b&&b.timestamp||'').localeCompare(String(a&&a.timestamp||''))).forEach((l,i)=>{
      try {
        let ds=l.date||'—',hs=l.heure||'—'
        try{const d=new Date(l.timestamp||'');if(!isNaN(d)){ds=d.toLocaleDateString('fr-FR');hs=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}}catch{}
        const ut=String(l.userType||''),who=String(l.benevoleNom||l.specNom||'—').slice(0,30),st=i%2===0?S.td:S.td2,mt=l.montant,row=i+4
        ap(ws6.getCell(row,1),st,ds);ap(ws6.getCell(row,2),st,hs);ap(ws6.getCell(row,3),st,String(l.action||'—'))
        ap(ws6.getCell(row,4),{...st,alignment:{horizontal:'center',vertical:'middle'}},ut?`${UICO[ut]||'📝'} ${ut}`:'—')
        ap(ws6.getCell(row,5),st,String(l.label||'—').slice(0,80));ap(ws6.getCell(row,6),st,who)
        ap(ws6.getCell(row,7),st,String(l.staff||l.byStaff||'—').slice(0,20));ap(ws6.getCell(row,8),st,String(l.resaCode||'—'))
        mt!=null ? ap(ws6.getCell(row,9),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(mt),EUR) : ap(ws6.getCell(row,9),st,'—')
        ws6.getRow(row).height=18
      } catch (err) { console.error(`[rapport] audit row ${i} error:`, err && err.message) }
    })
    ws6.autoFilter='A3:I3'
    ws6.views=[{state:'frozen',xSplit:0,ySplit:3}]

    // ── FEUILLE 7 — EXPOSANTS ────────────────────────────────────────
    // Liste des exposants avec montants facturés, paiements et restant dû.
    // Ne s'affiche que si des exposants existent (pas de feuille vide inutile).
    const expoLst = data.expositions || []
    if (expoLst.length > 0) {
      const ws7=wb.addWorksheet('🏪 Exposants',{views:[{showGridLines:false}]})
      ws7.columns=[{width:24},{width:18},{width:14},{width:12},{width:14},{width:14},{width:12},{width:24}]
      ws7.mergeCells('A1:H1');ap(ws7.getCell('A1'),S.h1,'🏪  Exposants & frais d\'exposition');ws7.getRow(1).height=26
      ws7.mergeCells('A2:H2');ap(ws7.getCell('A2'),S.sub,`Généré le ${now} — ${expoLst.length} exposant(s)`);ws7.getRow(2).height=16
      ;['Nom','Thématique','Total (€)','% payé','Acompte (€)','Solde (€)','Restant (€)','Contact'].forEach((h,j)=>ap(ws7.getCell(4,j+1),S.th,h))
      ws7.getRow(4).height=22

      let totalFacture=0, totalEncaisse=0
      const sortedExpo=[...expoLst].filter(Boolean).sort((a,b)=>String(a.nom||'').localeCompare(String(b.nom||'')))
      sortedExpo.forEach((e,i)=>{
        try {
          const total=num(e.montantTotal)
          const acompte=num(e&&e.acompte&&e.acompte.montant)
          const solde=num(e&&e.solde&&e.solde.montant)
          const paye=acompte+solde
          const restant=Math.max(0,total-paye)
          const pct=total>0?Math.round(paye/total*100):0
          totalFacture+=total; totalEncaisse+=paye

          const st=i%2===0?S.td:S.td2,row=i+5
          ap(ws7.getCell(row,1),st,String(e.nom||'—'))
          ap(ws7.getCell(row,2),st,String(e.thematiqueLabel||'—'))
          ap(ws7.getCell(row,3),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(total),EUR)

          // Colonne % avec coloration selon statut
          const pctCell=ws7.getCell(row,4)
          pctCell.value=pct+' %'
          pctCell.font=st.font
          pctCell.alignment={horizontal:'center',vertical:'middle'}
          pctCell.border=bord
          if(pct>=100) pctCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:GRN},bgColor:{argb:'FF000000'}}
          else if(pct>0) pctCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:AMB},bgColor:{argb:'FF000000'}}
          else pctCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:REDD},bgColor:{argb:'FF000000'}}

          ap(ws7.getCell(row,5),{...st,alignment:{horizontal:'right',vertical:'middle'}},acompte>0?euro(acompte):'—',acompte>0?EUR:undefined)
          ap(ws7.getCell(row,6),{...st,alignment:{horizontal:'right',vertical:'middle'}},solde>0?euro(solde):'—',solde>0?EUR:undefined)
          ap(ws7.getCell(row,7),{...st,alignment:{horizontal:'right',vertical:'middle'}},euro(restant),EUR)
          ap(ws7.getCell(row,8),st,String(e.contact||'—').slice(0,30))
          ws7.getRow(row).height=18
        } catch (err) { console.error(`[rapport] expo row ${i} error:`, err && err.message) }
      })
      // Ligne TOTAL
      const totR7=sortedExpo.length+5
      ap(ws7.getCell(totR7,1),S.tot,'TOTAL')
      ap(ws7.getCell(totR7,3),S.tot,euro(totalFacture),EUR)
      ap(ws7.getCell(totR7,5),S.tot,euro(totalEncaisse),EUR)
      ap(ws7.getCell(totR7,7),S.tot,euro(totalFacture-totalEncaisse),EUR)
      ws7.getRow(totR7).height=22

      ws7.autoFilter='A4:H4'
      ws7.views=[{state:'frozen',xSplit:0,ySplit:4}]
    }

    // ── Envoyer le fichier ───────────────────────────────────────────
    let buf
    try {
      buf = await wb.xlsx.writeBuffer()
    } catch (wErr) {
      console.error('Rapport writeBuffer error:', wErr)
      res.status(500).json({
        error: 'Génération du fichier impossible : ' + (wErr.message || 'caractère ou donnée invalide'),
        phase: 'writeBuffer',
      })
      return
    }
    const dt  = new Date().toLocaleDateString('fr-FR').replace(/\//g,'_')
    const fn  = `${nom} - Rapport Excel - ${dt}.xlsx`
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(fn)}"`)
    res.send(Buffer.from(buf))

  } catch(e) {
    console.error('Rapport error:', e)
    // Renvoyer un message utilisable (pas la stack en prod)
    res.status(500).json({
      error: e.message || 'Erreur inconnue',
      // Garder un indice de la zone qui a planté pour le diagnostic
      stack: (e.stack || '').split('\n').slice(0, 4).join(' | '),
    })
  }
}
