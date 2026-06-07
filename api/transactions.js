/**
 * api/transactions.js — Vercel Serverless Function Node.js
 * Génère un XLSX stylisé de l'export Transactions (équivalent du bouton "Export CSV")
 * POST /api/transactions — body JSON { event, spectateurs, transactions, staff }
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  // Parser le body
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

    const event   = data.event        || {}
    const txs     = data.transactions || []
    const specs   = data.spectateurs  || []
    const staffLst= data.staff        || []
    const nom     = event.nom         || 'Événement'
    const brand   = (event.couleur    || '#1a6b7a').replace('#', '')

    const dk = (h,f=0.15) => { const r=Math.floor(parseInt(h.slice(0,2),16)*(1-f)),g=Math.floor(parseInt(h.slice(2,4),16)*(1-f)),b=Math.floor(parseInt(h.slice(4,6),16)*(1-f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }
    const lt = (h,f=0.88) => { const r=Math.min(255,Math.floor(parseInt(h.slice(0,2),16)+(255-parseInt(h.slice(0,2),16))*f)),g=Math.min(255,Math.floor(parseInt(h.slice(2,4),16)+(255-parseInt(h.slice(2,4),16))*f)),b=Math.min(255,Math.floor(parseInt(h.slice(4,6),16)+(255-parseInt(h.slice(4,6),16))*f)); return [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('') }

    const BRAND  = 'FF' + brand.toUpperCase()
    const BRANDL = 'FF' + lt(brand)
    const BRANDD = 'FF' + dk(brand)
    const W='FFFFFFFF', GBG='FFF8F9FA', GRN='FFD1FAE5', REDD='FFFEE2E2'
    const EUR = '#,##0.00 "€"'
    const now = new Date().toLocaleString('fr-FR')

    const TX_LABELS = {
      credit:'💳 Crédit', debit:'🛒 Encaissement', retrait:'📦 Retrait',
      'benev-retrait':'🎁 Retrait bénévole', reservation:'📋 Réservation',
      annulation:'❌ Annulation', 'benev-reservation':'📋 Résa bénévole',
      'benev-annulation':'❌ Annul. bénévole',
    }

    const bord = {
      top:{style:'thin',color:{argb:'FFE2E8F0'}}, bottom:{style:'thin',color:{argb:'FFE2E8F0'}},
      left:{style:'thin',color:{argb:'FFE2E8F0'}}, right:{style:'thin',color:{argb:'FFE2E8F0'}},
    }

    const S = {
      h1:  { font:{name:'Arial',bold:true,size:16,color:{argb:W}},    fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND},bgColor:{argb:'FF000000'}},  alignment:{horizontal:'left',vertical:'middle'} },
      sub: { font:{name:'Arial',size:9,color:{argb:'FF64748B'}},       fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF'+lt(brand,0.8)},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'left',vertical:'middle'} },
      th:  { font:{name:'Arial',bold:true,size:10,color:{argb:W}},    fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRAND},bgColor:{argb:'FF000000'}},  alignment:{horizontal:'center',vertical:'middle',wrapText:true}, border:bord },
      td:  { font:{name:'Arial',size:10}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:W},bgColor:{argb:'FF000000'}},   alignment:{horizontal:'left',vertical:'middle'},  border:bord },
      td2: { font:{name:'Arial',size:10}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:GBG},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'left',vertical:'middle'},  border:bord },
      pos: { font:{name:'Arial',bold:true,size:10,color:{argb:'FF065F46'}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:GRN},bgColor:{argb:'FF000000'}},  alignment:{horizontal:'right',vertical:'middle'}, border:bord },
      neg: { font:{name:'Arial',bold:true,size:10,color:{argb:'FF991B1B'}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:REDD},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'right',vertical:'middle'}, border:bord },
      tot: { font:{name:'Arial',bold:true,size:11,color:{argb:W}},          fill:{type:'pattern',pattern:'solid',fgColor:{argb:BRANDD},bgColor:{argb:'FF000000'}}, alignment:{horizontal:'right',vertical:'middle'}, border:bord },
    }

    const ap = (cell, s, val, fmt) => {
      if(s.font)      cell.font      = s.font
      if(s.fill)      cell.fill      = s.fill
      if(s.alignment) cell.alignment = s.alignment
      if(s.border)    cell.border    = s.border
      if(val !== undefined) cell.value = val
      if(fmt) cell.numFmt = fmt
    }

    // ─── Helpers de robustesse — convertissent en valeur safe ────────────
    // (jamais NaN/Infinity/undefined → ExcelJS ne crash plus)
    const num = (v) => {
      if (v === null || v === undefined || v === '') return 0
      const n = Number(v)
      return isFinite(n) ? Math.round(n * 100) / 100 : 0
    }
    // Montant en centimes → euros, jamais NaN
    const cts2eur = (v) => num(v) / 100
    // String safe (jamais null/undefined, longueur max)
    const safeStr = (v, max = 200) => {
      if (v === null || v === undefined) return '—'
      const s = String(v)
      return s.length > max ? s.slice(0, max) : s
    }
    // Date safe : convertit timestamp/Date/string en strings fr-FR ou '—'
    const safeDate = (v) => {
      if (!v) return '—'
      try {
        const d = (typeof v === 'string' || typeof v === 'number') ? new Date(v) : v
        if (!d || isNaN(d.getTime())) return '—'
        return d.toLocaleDateString('fr-FR')
      } catch { return '—' }
    }
    const safeHour = (v) => {
      if (!v) return '—'
      try {
        const d = (typeof v === 'string' || typeof v === 'number') ? new Date(v) : v
        if (!d || isNaN(d.getTime())) return '—'
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      } catch { return '—' }
    }

    // ── Maps lookup ───────────────────────────────────────────────────
    const specMap  = Object.fromEntries(specs.map(s => [s.id, s]))
    const staffMap = Object.fromEntries(staffLst.map(s => [s.email?.toLowerCase(), s]))

    // ── Construire les lignes enrichies (robuste : ligne fautive → null) ─
    const rows = txs.map((t, idx) => {
      try {
        if (!t || typeof t !== 'object') return null
        const spec        = specMap[t.specId] || {}
        const staffMember = staffMap[(t.staff || '').toLowerCase()] || {}
        // items : protégé contre items malformés
        let items = '—'
        try {
          if (Array.isArray(t.items) && t.items.length > 0) {
            items = t.items.map(i => {
              if (!i || typeof i !== 'object') return ''
              const nom = safeStr(i.nom || '', 40)
              const qty = num(i.qty) || 1
              const pu  = cts2eur(i.prixUnit || i.prix || 0)
              return `${nom}${qty > 1 ? ` ×${qty}` : ''} (${pu.toFixed(2)}€)`
            }).filter(Boolean).join(' | ') || '—'
          }
        } catch { items = '—' }

        return {
          n:              idx + 1,
          date:           safeStr(t.date) !== '—' ? t.date : safeDate(t.timestamp),
          heure:          safeStr(t.heure) !== '—' ? t.heure : safeHour(t.timestamp),
          type:           TX_LABELS[t.type] || safeStr(t.type),
          specId:         safeStr(t.specId, 50),
          specNom:        safeStr(t.specNom || spec.nom, 50),
          label:          safeStr(t.label, 80),
          items:          items,
          montant:        cts2eur(t.montant),
          sens:           t.type === 'credit' ? 'Entrée (+)' : t.type === 'annulation' ? 'Neutre' : 'Sortie (-)',
          soldeBefore:    (t.soldeBefore !== undefined && t.soldeBefore !== null) ? cts2eur(t.soldeBefore) : null,
          soldeAfter:     (t.soldeAfter  !== undefined && t.soldeAfter  !== null) ? cts2eur(t.soldeAfter)  : null,
          soldeActuel:    (spec.solde    !== undefined && spec.solde    !== null) ? cts2eur(spec.solde)    : null,
          staffEmail:     safeStr(t.staff, 80),
          staffNom:       safeStr(staffMember.nom, 50),
          staffRole:      safeStr(staffMember.role, 30),
          resaCode:       safeStr(t.resaCode, 30),
          canal:          safeStr(t.canal || 'App YllaCash', 30),
          eventNom:       safeStr(nom, 60),
          t,
        }
      } catch (err) {
        // Une ligne fautive ne doit pas casser tout l'export
        console.error(`[transactions] Skipped row ${idx}:`, err && err.message)
        return null
      }
    }).filter(Boolean) // retire les lignes nulles

    // ── Feuille unique — Transactions ─────────────────────────────────
    const ws = wb.addWorksheet('💳 Transactions', { views:[{showGridLines:false}] })

    ws.columns = [
      {width:6},  // №
      {width:14}, // Date
      {width:10}, // Heure
      {width:22}, // Type
      {width:24}, // ID Spectateur
      {width:26}, // Nom Spectateur
      {width:44}, // Libellé
      {width:36}, // Articles
      {width:14}, // Montant
      {width:14}, // Sens
      {width:14}, // Solde avant
      {width:14}, // Solde après
      {width:16}, // Solde actuel
      {width:24}, // Staff email
      {width:22}, // Staff nom
      {width:16}, // Staff rôle
      {width:16}, // Code résa
      {width:16}, // Canal
      {width:24}, // Événement
    ]

    // Header principal
    ws.mergeCells('A1:S1')
    ap(ws.getCell('A1'), S.h1, `💳  Transactions — ${nom}`)
    ws.getRow(1).height = 26

    // Sous-titre
    ws.mergeCells('A2:S2')
    ap(ws.getCell('A2'), S.sub, `Export généré le ${now} — ${rows.length} transaction(s) — YllaCash ${data.appVersion || 'v1.0.0'}`)
    ws.getRow(2).height = 16

    // En-têtes colonnes
    const headers = [
      '№','Date','Heure','Type','ID Spectateur','Nom Spectateur',
      'Libellé','Articles achetés','Montant (€)','Sens',
      'Solde avant (€)','Solde après (€)','Solde actuel (€)',
      'Staff (email)','Staff (nom)','Staff (rôle)',
      'Code réservation','Canal','Événement',
    ]
    headers.forEach((h, j) => ap(ws.getCell(4, j+1), S.th, h))
    ws.getRow(4).height = 22

    // Données — chaque ligne wrappée dans son propre try/catch
    // pour qu'une ligne fautive ne stoppe pas tout l'export
    let writeErrors = 0
    rows.forEach((r, i) => {
      try {
        const row = i + 5
        const st  = i % 2 === 0 ? S.td : S.td2
        const numR = { ...st, alignment:{horizontal:'right',vertical:'middle'} }
        const cenR = { ...st, alignment:{horizontal:'center',vertical:'middle'} }

        ap(ws.getCell(row,1),  cenR, r.n)
        ap(ws.getCell(row,2),  st,   r.date)
        ap(ws.getCell(row,3),  cenR, r.heure)
        ap(ws.getCell(row,4),  st,   r.type)
        ap(ws.getCell(row,5),  { ...st, font:{...st.font,size:9,color:{argb:'FF94A3B8'}} }, r.specId)
        ap(ws.getCell(row,6),  st,   r.specNom)
        ap(ws.getCell(row,7),  st,   r.label)
        ap(ws.getCell(row,8),  { ...st, font:{...st.font,size:9} }, r.items)

        // Montant coloré selon type
        const mCell = ws.getCell(row, 9)
        const mSt   = r.t.type === 'credit' ? S.pos
                    : ['debit','retrait','benev-retrait'].includes(r.t.type) ? S.neg
                    : numR
        ap(mCell, mSt, r.montant, EUR)

        // Sens
        const sensColor = r.sens === 'Entrée (+)' ? 'FF065F46' : r.sens === 'Sortie (-)' ? 'FF991B1B' : 'FF64748B'
        const sensCell = ws.getCell(row, 10)
        sensCell.value = r.sens
        sensCell.font  = { ...st.font, bold:true, color:{argb:sensColor} }
        sensCell.fill  = st.fill; sensCell.alignment = {horizontal:'center',vertical:'middle'}; sensCell.border = bord

        // Soldes — protection : val doit être un nombre fini
        ;[r.soldeBefore, r.soldeAfter, r.soldeActuel].forEach((val, k) => {
          const c_ = ws.getCell(row, 11+k)
          if (val !== null && isFinite(val)) { ap(c_, numR, num(val), EUR) }
          else { ap(c_, st, '—') }
        })

        ap(ws.getCell(row,14), { ...st, font:{...st.font,size:9} }, r.staffEmail)
        ap(ws.getCell(row,15), st, r.staffNom)
        ap(ws.getCell(row,16), cenR, r.staffRole)
        ap(ws.getCell(row,17), cenR, r.resaCode)
        ap(ws.getCell(row,18), cenR, r.canal)
        ap(ws.getCell(row,19), { ...st, font:{...st.font,size:9} }, r.eventNom)

        ws.getRow(row).height = 18
      } catch (err) {
        writeErrors++
        console.error(`[transactions] Write error row ${i}:`, err && err.message)
      }
    })

    // Ligne total (calcul robuste avec num())
    const totRow = rows.length + 5
    const totalMontant = txs.reduce((a, t) => a + num(t && t.montant), 0) / 100
    ap(ws.getCell(totRow, 6), S.tot, 'TOTAL')
    ap(ws.getCell(totRow, 9), S.tot, num(totalMontant), EUR)
    ws.getRow(totRow).height = 22

    // Log si des lignes ont été ignorées (visible dans les logs Vercel)
    if (writeErrors > 0) {
      console.warn(`[transactions] ${writeErrors} ligne(s) ignorée(s) sur ${rows.length}`)
    }

    // Filtre + freeze
    ws.autoFilter='A4:S4'
    ws.views = [{ state:'frozen', xSplit:0, ySplit:4 }]

    // Envoyer
    const buf = await wb.xlsx.writeBuffer()
    const dt  = new Date().toLocaleDateString('fr-FR').replace(/\//g,'_')
    const fn  = `${nom} - Transactions - ${dt}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fn)}"`)
    res.send(Buffer.from(buf))

  } catch(e) {
    console.error('Transactions XLSX error:', e)
    // Réponse JSON détaillée pour faciliter le diagnostic côté client
    try {
      res.status(500).setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({
        error: 'ExportFailed',
        message: e.message || String(e),
        type: e.name || 'Error',
        // Stack seulement en dev (Vercel n'expose pas process.env.NODE_ENV par défaut)
        stack: (e.stack || '').split('\n').slice(0, 8).join('\n'),
      }))
    } catch {
      res.status(500).send('ERREUR: ' + (e.message || 'unknown'))
    }
  }
}
