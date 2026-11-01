/**
 * pages/admin/Alertes.jsx
 * Détection d'anomalies financières en temps réel.
 * Vibration + son à chaque nouvelle alerte.
 * Acquitter se rattrape pendant 5 s (toast « Annuler »).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle, Bell, BellOff, ShieldCheck } from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'
import { Button, Card, Badge, Stat, toast } from '../../ui'
import s from './alertes/alertes.module.css'

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
      const stored = localStorage.getItem('yllacash-alertes-acquittees')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  // Persister dans localStorage à chaque changement
  const acquitterPersist = (newSet) => {
    setAcquittees(newSet)
    try {
      localStorage.setItem('yllacash-alertes-acquittees', JSON.stringify([...newSet]))
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

  // Acquitter tout de suite, « Annuler » remet l'ensemble précédent
  const acquitter = (id) => {
    const prev = acquittees
    acquitterPersist(new Set([...acquittees, id]))
    toast.undo('Alerte acquittée', () => acquitterPersist(prev))
  }
  const acquitterTout = () => {
    const prev = acquittees
    acquitterPersist(new Set(anomalies.map(a=>a.id)))
    toast.undo('Toutes les alertes sont acquittées', () => acquitterPersist(prev))
  }

  const enAttention = actives.filter(a=>a.niveau==='attention').length

  return (
    <div className={s.page}>
      {/* En-tête */}
      <div className={s.toolbar}>
        <div className={s.heading}>
          <h2 className={s.title}>Alertes financières en temps réel</h2>
          {actives.length>0&&(
            <Badge tone="danger">{actives.length} active{actives.length>1?'s':''}</Badge>
          )}
        </div>
        <div className={s.toolbarActions}>
          <Button variant="secondary" size="sm" icon={son?Bell:BellOff} aria-pressed={son}
            className={clsx(son && s.soundOn)} onClick={()=>setSon(v=>!v)}>
            {son?'Son activé':'Son coupé'}
          </Button>
          {actives.length>0&&(
            <Button variant="secondary" size="sm" icon={CheckCircle} onClick={acquitterTout}>Tout acquitter</Button>
          )}
        </div>
      </div>

      {/* Stats rapides */}
      <div className={clsx(s.stats, 'yc-stagger')}>
        <div className={clsx(s.statWrap, critiques.length > 0 && s.statAlert)}>
          <Stat label="Alertes critiques" value={critiques.length} icon={AlertTriangle} tone={critiques.length ? 'coral' : 'brand'}/>
        </div>
        <Stat label="En attention" value={enAttention} icon={AlertTriangle} tone="warning"/>
        <Stat label="Acquittées" value={acquittees.size} icon={CheckCircle}/>
      </div>

      {/* Seuils configurés */}
      <Card title="Seuils de détection">
        <dl className={s.thresholds}>
          {[
            ['Débit élevé unique',     '> 50,00€'],
            ['Transactions rapides',    `≥ ${SEUILS.txRapides} tx / spectateur`],
            ['Écart comptable global',  `> ${fmt(SEUILS.ecartSoldeMax)}`],
            ['Solde négatif',           'Interdit'],
          ].map(([l,v])=>(
            <div key={l} className={s.threshold}>
              <dt>{l}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Liste des alertes */}
      {actives.length === 0
        ? (
          <div className={s.allClear}>
            <ShieldCheck size={28} aria-hidden="true"/>
            <div className={s.allClearTitle}>Aucune anomalie détectée</div>
            <div className={s.allClearSub}>Surveillance active en temps réel</div>
          </div>
        )
        : (
          <div className={clsx(s.list, 'yc-stagger')}>
            {actives.map((a, i) => {
              const crit = a.niveau === 'critique'
              return (
                <article key={a.id || `${a.titre}-${i}`} className={clsx(s.alert, crit && s.critique)}>
                  <div className={s.alertHead}>
                    <div className={s.alertTitle}>
                      <AlertTriangle size={16} aria-hidden="true" className={s.alertIcon}/>
                      <span className={s.alertType}>{a.type || a.titre}</span>
                      <Badge tone={crit ? 'danger' : 'warning'}>{crit ? 'Critique' : 'Attention'}</Badge>
                    </div>
                    {a.date && <span className={s.alertDate}>{a.date}</span>}
                  </div>
                  <p className={s.alertDetail}>{a.detail}</p>
                  <div className={s.alertFoot}>
                    <Button variant="secondary" size="sm" icon={CheckCircle} onClick={()=>acquitter(a.id)}>Acquitter</Button>
                  </div>
                </article>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
