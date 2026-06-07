/**
 * pages/admin/Alertes.jsx
 * Détection d'anomalies financières en temps réel.
 * Vibration + son à chaque nouvelle alerte.
 *
 * v8 debug : seuils 100% paramétrables par l'admin (persistés dans events/{id}/settings/global)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, CheckCircle, Bell, BellOff, Settings as SettingsIcon, RotateCcw, Save, ChevronDown, ChevronUp } from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'
import { getSettings, saveSettings } from '../../firebase/service'

// Valeurs par défaut (centimes pour les montants)
const DEFAULT_SEUILS = {
  soldeNegatif:        true,   // solde négatif déclenche une alerte
  ecartSoldeMax:       200,    // écart théorique vs réel toléré (centimes)
  txRapides:           3,      // nb max de tx rapprochées avant alerte
  txRapidesWindowSec:  60,     // fenêtre temporelle (secondes)
  debitEleveSeuil:     5000,   // débit unique > X centimes = alerte
  doublonWindowSec:    30,     // fenêtre de détection des doublons
  stockBasSeuilDefaut: 10,     // seuil bas si non défini sur l'article
  detectRuptureStock:  true,
  detectStockBas:      true,
  detectDoublons:      true,
  detectTxRapides:     true,
  detectDebitEleve:    true,
  detectEcartGlobal:   true,
}

function detectAnomalies(spectateurs, logs, reservations, menu = [], SEUILS = DEFAULT_SEUILS) {
  const anomalies = []
  const now = Date.now()

  // 1. Solde négatif
  if (SEUILS.soldeNegatif !== false) spectateurs.forEach(s => {
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
  if (SEUILS.detectTxRapides) {
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
  }

  // 3. Débit élevé unique
  if (SEUILS.detectDebitEleve) ;(logs||[]).filter(t=>t.type==='debit'&&(t.montant||0)>SEUILS.debitEleveSeuil).forEach(t => {
    const spec = spectateurs.find(s=>s.id===t.spec_id)
    anomalies.push({
      id: `highdebit-${t.spec_id}-${t.date}`,
      niveau: 'attention',
      type: 'Débit élevé',
      detail: `${spec?.nom||t.spec_id} — ${fmt(t.montant)} débité en une fois (seuil : ${fmt(SEUILS.debitEleveSeuil)})`,
      date: t.date || '—',
      specId: t.spec_id,
    })
  })

  // 4. Écart crédit vs débit + soldes (cohérence globale)
  if (SEUILS.detectEcartGlobal) {
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
  }

  // 5. Transactions doublons (même specId + type + montant dans une fenêtre courte)
  if (SEUILS.detectDoublons) {
    const txSortees = [...(logs||[])].sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0))
    const seen = {}
    txSortees.slice(0, 200).forEach(t => {
      const ts = t.createdAt?.seconds || t.createdAt?.toSeconds?.() || 0
      if (now/1000 - ts > 300) return // ignorer si > 5 min
      const key = `${t.specId}|${t.type}|${t.montant}`
      if (seen[key] && (ts - seen[key]) < SEUILS.doublonWindowSec) {
        const spec = spectateurs.find(s => s.id === t.specId)
        anomalies.push({
          id: `doublon-${key}-${ts}`,
          niveau: 'critique',
          type: 'Transaction dupliquée',
          detail: `${spec?.nom || t.specId} — ${t.type} de ${fmt(t.montant)} répété en moins de ${SEUILS.doublonWindowSec}s`,
          date: new Date().toLocaleTimeString('fr-FR'),
          specId: t.specId,
        })
      }
      seen[key] = ts
    })
  }

  // 6. Articles en rupture ou sous seuil
  menu.forEach(m => {
    const stock  = m.stock || 0
    const seuil  = m.seuilAlerte || SEUILS.stockBasSeuilDefaut
    if (stock === 0 && SEUILS.detectRuptureStock) {
      anomalies.push({
        niveau:  'critique',
        titre:   `Rupture de stock — ${m.nom}`,
        detail:  `L'article "${m.nom}" (${m.cat}) est en rupture totale. Impossible de l'acheter ou le réserver.`,
        emoji:   '🚫',
      })
    } else if (stock > 0 && stock <= seuil && SEUILS.detectStockBas) {
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

  // ── Seuils paramétrables (chargés depuis Firestore) ───────────────
  const [seuils, setSeuils]   = useState(DEFAULT_SEUILS)
  const [configOpen, setConfigOpen] = useState(false)
  const [savingConf, setSavingConf] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(s => {
      if (s?.alertSeuils && typeof s.alertSeuils === 'object') {
        // Merge avec DEFAULT_SEUILS pour ne pas perdre de nouvelles clés
        setSeuils({ ...DEFAULT_SEUILS, ...s.alertSeuils })
      }
    }).catch(() => {})
  }, [currentEventId])

  const handleSaveSeuils = async () => {
    if (!currentEventId) return
    setSavingConf(true)
    try {
      await saveSettings({ alertSeuils: seuils }, currentEventId)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch {}
    setSavingConf(false)
  }

  const handleResetSeuils = () => {
    if (!window.confirm("Remettre tous les seuils aux valeurs par défaut ?")) return
    setSeuils(DEFAULT_SEUILS)
  }

  // Persister dans localStorage à chaque changement.
  // Note : on accepte aussi une fonction (updater pattern React) pour éviter
  // le stale closure si plusieurs acquittements sont déclenchés rapidement.
  const acquitterPersist = (newSetOrFn) => {
    setAcquittees(prev => {
      const newSet = typeof newSetOrFn === 'function' ? newSetOrFn(prev) : newSetOrFn
      try {
        localStorage.setItem('yllatok-alertes-acquittees', JSON.stringify([...newSet]))
      } catch (e) {
        // Logger pour pouvoir diagnostiquer si la persistance échoue
        // (quota dépassé, mode privé, sandbox PWA, etc.)
        console.warn('[Alertes] localStorage.setItem failed:', e?.message || e)
      }
      return newSet
    })
  }
  const prevCountRef              = useRef(0)

  const anomalies = detectAnomalies(spectateurs, logs, reservations, menu, seuils)
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

  // Acquittement individuel : ajoute l'id au Set existant via updater function
  // pour éviter le stale closure (clics rapides successifs).
  const acquitter = (id) => acquitterPersist(prev => new Set([...prev, id]))

  // Acquittement global : on prend l'union des acquits précédents + les
  // alertes actives actuelles. Ne plus remplacer le Set comme avant
  // (sinon les acquits passés disparaissaient quand l'alerte n'apparaissait
  // plus dans la liste courante, et revenaient au prochain rendu).
  const acquitterTout = () => acquitterPersist(prev =>
    new Set([...prev, ...anomalies.map(a => a.id)])
  )

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
        <div style={{display:'flex',gap:8, flexWrap:'wrap'}}>
          <button onClick={()=>setSon(v=>!v)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',border:'0.5px solid var(--border2)',borderRadius:8,background:'var(--bg)',color:son?'var(--brand-dark)':'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'}}>
            {son?<Bell size={13}/>:<BellOff size={13}/>}
            {son?'Son activé':'Son coupé'}
          </button>
          <button onClick={() => setConfigOpen(v => !v)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',border:'0.5px solid var(--border2)',borderRadius:8,background: configOpen ? 'var(--brand-light)' : 'var(--bg)',color: configOpen ? 'var(--brand-dark)' : 'var(--text)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)',fontWeight:600}}>
            <SettingsIcon size={13}/>
            Configurer
            {configOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
          {actives.length>0&&(
            <button onClick={acquitterTout}
              style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',border:'0.5px solid var(--border2)',borderRadius:8,background:'var(--bg)',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'}}>
              <CheckCircle size={13}/> Tout acquitter
            </button>
          )}
        </div>
      </div>

      {/* Panneau de configuration des seuils */}
      {configOpen && (
        <div style={{ background:'var(--bg)', border:'1px solid var(--brand)', borderRadius:'var(--radius-lg)', padding:16, marginBottom:16, boxShadow:'0 2px 8px rgba(0,144,144,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>Paramétrer les alertes financières</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Réglages enregistrés au niveau de l'événement</div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={handleResetSeuils}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--bg2)', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
                <RotateCcw size={12}/> Par défaut
              </button>
              <button onClick={handleSaveSeuils} disabled={savingConf}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', border:'none', borderRadius:8, background: savedFlash ? 'var(--green)' : 'var(--brand)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                {savedFlash ? <><CheckCircle size={12}/> Enregistré</> : <><Save size={12}/> {savingConf ? 'Enregistrement…' : 'Enregistrer'}</>}
              </button>
            </div>
          </div>

          {/* Détections globales (toggles) */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:8, marginBottom:14 }}>
            {[
              ['soldeNegatif',       'Solde négatif',           'Alerte si un compte spectateur passe en négatif'],
              ['detectTxRapides',    'Transactions rapides',    'Plusieurs paiements en peu de temps'],
              ['detectDebitEleve',   'Débit élevé unique',      'Une grosse somme débitée en une fois'],
              ['detectEcartGlobal',  'Écart comptable global',  'Crédits/débits ≠ soldes'],
              ['detectDoublons',     'Transactions dupliquées', 'Même tx répétée en quelques secondes'],
              ['detectRuptureStock', 'Rupture de stock',        'Article à 0'],
              ['detectStockBas',     'Stock bas',               'Article sous son seuil'],
            ].map(([key, label, desc]) => (
              <label key={key} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', background:'var(--bg2)', borderRadius:8, cursor:'pointer' }}>
                <input type="checkbox" checked={!!seuils[key]}
                  onChange={e => setSeuils(s => ({ ...s, [key]: e.target.checked }))}
                  style={{ width:16, height:16, accentColor:'var(--brand)', cursor:'pointer', marginTop:1, flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{label}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:1, lineHeight:1.4 }}>{desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Seuils numériques */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
            <SeuilField label="Écart comptable max"
              suffix="€" value={Math.round(seuils.ecartSoldeMax / 100)}
              onChange={v => setSeuils(s => ({ ...s, ecartSoldeMax: Math.max(0, v) * 100 }))}
              desc="Tolérance avant alerte d'écart"/>
            <SeuilField label="Débit élevé à partir de"
              suffix="€" value={Math.round(seuils.debitEleveSeuil / 100)}
              onChange={v => setSeuils(s => ({ ...s, debitEleveSeuil: Math.max(0, v) * 100 }))}
              desc="Au-dessus, alerte attention"/>
            <SeuilField label="Tx rapides — seuil"
              suffix="tx" value={seuils.txRapides}
              onChange={v => setSeuils(s => ({ ...s, txRapides: Math.max(2, v) }))}
              desc="Nb d'opérations qui déclenche l'alerte"/>
            <SeuilField label="Fenêtre tx rapides"
              suffix="s" value={seuils.txRapidesWindowSec}
              onChange={v => setSeuils(s => ({ ...s, txRapidesWindowSec: Math.max(10, v) }))}
              desc="Durée pendant laquelle on compte les tx"/>
            <SeuilField label="Fenêtre doublons"
              suffix="s" value={seuils.doublonWindowSec}
              onChange={v => setSeuils(s => ({ ...s, doublonWindowSec: Math.max(5, v) }))}
              desc="Tx identique en moins de X secondes"/>
            <SeuilField label="Seuil stock bas (défaut)"
              suffix="u." value={seuils.stockBasSeuilDefaut}
              onChange={v => setSeuils(s => ({ ...s, stockBasSeuilDefaut: Math.max(1, v) }))}
              desc="Si non défini par article"/>
          </div>
        </div>
      )}

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

// Champ numérique compact avec stepper ± — utilisé dans le panneau de config
function SeuilField({ label, value, onChange, suffix = '', desc }) {
  return (
    <div style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px' }}>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'center', gap:0, background:'var(--bg)', border:'1px solid var(--border2)', borderRadius:6, overflow:'hidden', width:'fit-content', marginBottom: desc ? 6 : 0 }}>
        <button type="button" onClick={() => onChange(value - 1)}
          style={{ width:30, height:32, border:'none', background:'transparent', cursor:'pointer', fontSize:16, color:'var(--muted)' }}>−</button>
        <input type="number" inputMode="numeric" value={value}
          onChange={e => onChange(parseInt(e.target.value) || 0)}
          style={{ width:56, height:32, padding:0, border:'none', borderLeft:'1px solid var(--border2)', borderRight:'1px solid var(--border2)', fontSize:13, fontWeight:700, color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', outline:'none', textAlign:'center', MozAppearance:'textfield' }}/>
        <button type="button" onClick={() => onChange(value + 1)}
          style={{ width:30, height:32, border:'none', background:'transparent', cursor:'pointer', fontSize:16, color:'var(--brand)' }}>+</button>
        {suffix && <span style={{ padding:'0 8px', fontSize:11, color:'var(--muted)', fontWeight:600 }}>{suffix}</span>}
      </div>
      {desc && <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4 }}>{desc}</div>}
    </div>
  )
}
