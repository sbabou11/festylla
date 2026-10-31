/**
 * pages/admin/Alertes.jsx
 * Détection d'anomalies financières en temps réel.
 * Vibration + son à chaque nouvelle alerte.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, CheckCircle, Bell, BellOff } from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'

const SEUILS = {
  maxDebitSansResa:  500,   // débit > 5€ sans réservation préalable = suspicieux
  ecartSoldeMax:     200,   // écart entre solde théorique et réel > 2€
  txRapides:         3,     // 3 tx en moins de 60s = suspect
  soldeNegatif:      true,  // solde négatif = anomalie critique
}

function detectAnomalies(spectateurs, logs, reservations, menu = []) {
  const anomalies = []
  const now = Date.now()

  // 1. Solde négatif
  spectateurs.forEach(s => {
    if ((s.solde||0) < 0) {
      anomalies.push({
        id: `neg-${s.id}`,
        niveau: 'critique',
        type: 'Solde négatif',
        detail: `${s.nom} (${s.id}) — solde : ${fmt(s.solde)}`,
        date: new Date().toLocaleTimeString('fr-FR'),
        specId: s.id,
      })
    }
  })

  // 2. Transactions trop rapides (3+ en moins de 60s sur même spectateur)
  const txParSpec = {}
  ;(logs||[]).forEach(t => {
    if (!txParSpec[t.specId]) txParSpec[t.specId] = []
    txParSpec[t.specId].push(t)
  })
  Object.entries(txParSpec).forEach(([specId, txs]) => {
    if (txs.length >= SEUILS.txRapides) {
      const spec = spectateurs.find(s=>s.id===specId)
      anomalies.push({
        id: `rapid-${specId}`,
        niveau: 'attention',
        type: 'Transactions rapides',
        detail: `${spec?.nom||specId} — ${txs.length} transactions enregistrées`,
        date: new Date().toLocaleTimeString('fr-FR'),
        specId,
      })
    }
  })

  // 3. Débit élevé unique (> 50€ en une seule transaction)
  ;(logs||[]).filter(t=>t.type==='debit'&&(t.montant||0)>5000).forEach(t => {
    const spec = spectateurs.find(s=>s.id===t.spec_id)
    anomalies.push({
      id: `highdebit-${t.spec_id}-${t.date}`,
      niveau: 'attention',
      type: 'Débit élevé',
      detail: `${spec?.nom||t.spec_id} — ${fmt(t.montant)} débité en une fois`,
      date: t.date || '—',
      specId: t.spec_id,
    })
  })

  // 4. Écart crédit vs débit + soldes (cohérence globale)
  const totalCredits = (logs||[]).filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
  const totalDebits  = (logs||[]).filter(t=>t.type==='debit').reduce((a,t)=>a+(t.montant||0),0)
  const totalSoldes  = spectateurs.reduce((a,s)=>a+(s.solde||0),0)
  const ecartTheorique = totalCredits - totalDebits
  const ecartReel      = Math.abs(ecartTheorique - totalSoldes)

  if (ecartReel > SEUILS.ecartSoldeMax && totalCredits > 0) {
    anomalies.push({
      id: 'ecart-global',
      niveau: 'critique',
      type: 'Écart comptable',
      detail: `Écart de ${fmt(ecartReel)} entre crédits/débits et soldes. Crédits: ${fmt(totalCredits)} | Débits: ${fmt(totalDebits)} | Soldes: ${fmt(totalSoldes)}`,
      date: new Date().toLocaleTimeString('fr-FR'),
      specId: null,
    })
  }

  // 5. Transactions doublons (même specId + type + montant dans les 30 dernières secondes)
  const txSortees = [...(logs||[])].sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0))
  const seen = {}
  txSortees.slice(0, 200).forEach(t => {
    const ts = t.createdAt?.seconds || t.createdAt?.toSeconds?.() || 0
    if (now/1000 - ts > 300) return // ignorer si > 5 min
    const key = `${t.specId}|${t.type}|${t.montant}`
    if (seen[key] && (ts - seen[key]) < 30) {
      const spec = spectateurs.find(s => s.id === t.specId)
      anomalies.push({
        id: `doublon-${key}-${ts}`,
        niveau: 'critique',
        type: 'Transaction dupliquée',
        detail: `${spec?.nom || t.specId} — ${t.type} de ${fmt(t.montant)} répété en moins de 30s`,
        date: new Date().toLocaleTimeString('fr-FR'),
        specId: t.specId,
      })
    }
    seen[key] = ts
  })

  // 6. Articles en rupture ou sous seuil
  menu.forEach(m => {
    const stock  = m.stock || 0
    const seuil  = m.seuilAlerte || 10
    if (stock === 0) {
      anomalies.push({
        niveau:  'critique',
        titre:   `Rupture de stock — ${m.nom}`,
        detail:  `L'article "${m.nom}" (${m.cat}) est en rupture totale. Impossible de l'acheter ou le réserver.`,
        emoji:   '🚫',
      })
    } else if (stock <= seuil) {
      anomalies.push({
        niveau:  'warning',
        titre:   `Stock bas — ${m.nom}`,
        detail:  `Il ne reste que ${stock} unité${stock>1?'s':''} de "${m.nom}". Seuil d'alerte : ${seuil}.`,
        emoji:   '⚠️',
      })
    }
  })

  return anomalies
}

// Jouer un bip d'alerte via Web Audio API
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.30)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
  } catch(e) {}
}

// Vibration
function vibrate() {
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 400])
  }
}

export default function Alertes() {
  const { spectateurs, logs, reservations, menu } = useAppStore()
  const { currentEventId } = useEventStore()
  const [son, setSon]             = useState(true)
  const [acquittees, setAcquittees] = useState(() => {
    try {
      const stored = localStorage.getItem('yllatok-alertes-acquittees')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  // Persister dans localStorage à chaque changement
  const acquitterPersist = (newSet) => {
    setAcquittees(newSet)
    try {
      localStorage.setItem('yllatok-alertes-acquittees', JSON.stringify([...newSet]))
    } catch {}
  }
  const prevCountRef              = useRef(0)

  const anomalies = detectAnomalies(spectateurs, logs, reservations, menu)
  const actives   = anomalies.filter(a => !acquittees.has(a.id))
  const critiques = actives.filter(a => a.niveau === 'critique')

  // Déclencher alerte si nouvelles anomalies
  useEffect(() => {
    if (actives.length > prevCountRef.current) {
      vibrate()
      if (son) playAlertSound()
    }
    prevCountRef.current = actives.length
  }, [actives.length])

  const acquitter = (id) => acquitterPersist(new Set([...acquittees, id]))
  const acquitterTout = () => acquitterPersist(new Set(anomalies.map(a=>a.id)))

  const niveauStyle = (n) => n === 'critique'
    ? { bg:'var(--red-light)',   border:'#F09595',   color:'var(--red)',   label:'Critique' }
    : { bg:'var(--amber-light)', border:'#EF9F27',   color:'var(--amber)', label:'Attention' }

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>
            Alertes financières en temps réel
          </div>
          {actives.length>0&&(
            <span style={{background:'var(--red)',color:'#fff',borderRadius:20,fontSize:11,padding:'2px 10px',fontWeight:700}}>
              {actives.length} active{actives.length>1?'s':''}
            </span>
          )}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setSon(v=>!v)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',border:'0.5px solid var(--border2)',borderRadius:8,background:'var(--bg)',color:son?'var(--brand-dark)':'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'}}>
            {son?<Bell size={13}/>:<BellOff size={13}/>}
            {son?'Son activé':'Son coupé'}
          </button>
          {actives.length>0&&(
            <button onClick={acquitterTout}
              style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',border:'0.5px solid var(--border2)',borderRadius:8,background:'var(--bg)',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'}}>
              <CheckCircle size={13}/> Tout acquitter
            </button>
          )}
        </div>
      </div>

      {/* Stats rapides */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
        <div style={{background:critiques.length?'var(--red-light)':'var(--bg2)',borderRadius:'var(--radius)',padding:'12px 14px',border:critiques.length?'0.5px solid #F09595':'none'}}>
          <div style={{fontSize:11,color:critiques.length?'var(--red)':'var(--muted)',marginBottom:4}}>Alertes critiques</div>
          <div style={{fontSize:22,fontWeight:700,color:critiques.length?'var(--red)':'var(--text)'}}>{critiques.length}</div>
        </div>
        <div style={{background:'var(--bg2)',borderRadius:'var(--radius)',padding:'12px 14px'}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>En attention</div>
          <div style={{fontSize:22,fontWeight:700,color:'var(--amber)'}}>{actives.filter(a=>a.niveau==='attention').length}</div>
        </div>
        <div style={{background:'var(--bg2)',borderRadius:'var(--radius)',padding:'12px 14px'}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>Acquittées</div>
          <div style={{fontSize:22,fontWeight:700,color:'var(--text)'}}>{acquittees.size}</div>
        </div>
      </div>

      {/* Seuils configurés */}
      <div style={{background:'var(--bg)',border:'0.5px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'12px 16px',marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:8}}>Seuils de détection</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {[
            ['Débit élevé unique',     '> 50,00€'],
            ['Transactions rapides',    `≥ ${SEUILS.txRapides} tx / spectateur`],
            ['Écart comptable global',  `> ${fmt(SEUILS.ecartSoldeMax)}`],
            ['Solde négatif',           'Interdit'],
          ].map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'0.5px solid var(--border)'}}>
              <span style={{color:'var(--muted)'}}>{l}</span>
              <span style={{color:'var(--text)',fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Liste des alertes */}
      {actives.length === 0
        ? (
          <div style={{background:'var(--brand-light)',border:'0.5px solid #5DCAA5',borderRadius:'var(--radius-lg)',padding:24,textAlign:'center'}}>
            <CheckCircle size={28} style={{color:'var(--brand-dark)',display:'block',margin:'0 auto 10px'}}/>
            <div style={{fontSize:14,fontWeight:600,color:'var(--brand-dark)'}}>Aucune anomalie détectée</div>
            <div style={{fontSize:12,color:'var(--brand-dark)',opacity:.8,marginTop:4}}>Surveillance active en temps réel</div>
          </div>
        )
        : actives.map(a => {
            const s = niveauStyle(a.niveau)
            return (
              <div key={a.id} style={{border:`0.5px solid ${s.border}`,borderRadius:10,padding:14,marginBottom:8,background:s.bg}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <AlertTriangle size={16} style={{color:s.color,flexShrink:0}}/>
                    <span style={{fontWeight:600,fontSize:13,color:s.color}}>{a.type}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:s.color,color:'#fff'}}>{s.label}</span>
                  </div>
                  <span style={{fontSize:11,color:s.color,opacity:.8}}>{a.date}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text)',marginBottom:10,marginLeft:24}}>{a.detail}</div>
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button onClick={()=>acquitter(a.id)}
                    style={{padding:'4px 12px',border:`0.5px solid ${s.border}`,borderRadius:6,background:'rgba(255,255,255,0.6)',color:s.color,fontSize:11,cursor:'pointer',fontFamily:'var(--font)',display:'flex',alignItems:'center',gap:5}}>
                    <CheckCircle size={11}/> Acquitter
                  </button>
                </div>
              </div>
            )
          })
      }
    </div>
  )
}
