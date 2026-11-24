/**
 * pages/admin/Alertes.jsx
 * Détection d'anomalies financières en temps réel.
 * Vibration + son à chaque nouvelle alerte.
 * Acquitter se rattrape pendant 5 s (toast « Annuler »).
 *
 * v8 debug : seuils 100% paramétrables par l'admin (persistés dans events/{id}/settings/global)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle, Bell, BellOff, ShieldCheck, Settings as SettingsIcon, RotateCcw, Save, ChevronDown, ChevronUp } from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'
import { Button, Card, Badge, Stat, Dialog, Sheet, toast } from '../../ui'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import s from './alertes/alertes.module.css'
import { getSettings, saveSettings } from '../../firebase/service'
import DetailSheet from '../../components/DetailSheet'
import { Repartition, Note, grouper, nettoyer } from '../../components/detailContenus'
import { pastilleAlerte } from '../../utils/nvPastilles'
import { friendlyError } from '../../utils/errors'

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
    const totalDons    = (logs||[]).filter(t=>t.type==='don').reduce((a,t)=>a+(t.montant||0),0)
    const ecartTheorique = totalCredits - totalDebits - totalDons
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
        // Correction (20/11/2026) : chaque alerte de stock a son identifiant, pour s'acquitter une par une
        id:      `rupture-${m.id || m.nom}`,
        niveau:  'critique',
        titre:   `Rupture de stock — ${m.nom}`,
        detail:  `L'article "${m.nom}" (${m.cat}) est en rupture totale. Impossible de l'acheter ou le réserver.`,
        emoji:   '🚫',
      })
    } else if (stock > 0 && stock <= seuil && SEUILS.detectStockBas) {
      anomalies.push({
        id:      `stockbas-${m.id || m.nom}`,
        niveau:  'attention',   // était 'warning' : jamais compté dans « En attention »
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

  // ── Seuils paramétrables (chargés depuis Firestore) ───────────────
  const [seuils, setSeuils]   = useState(DEFAULT_SEUILS)
  const [configOpen, setConfigOpen] = useState(false)
  const [savingConf, setSavingConf] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  // 20/11/2026 — téléphone (moins de 641 px) : disposition en liste + feuille de réglages
  const { isMobile } = useBreakpoint()
  const [reglagesOpen, setReglagesOpen] = useState(false)

  useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(cfg => {
      if (cfg?.alertSeuils && typeof cfg.alertSeuils === 'object') {
        // Merge avec DEFAULT_SEUILS pour ne pas perdre de nouvelles clés
        setSeuils({ ...DEFAULT_SEUILS, ...cfg.alertSeuils })
      }
    }).catch(() => {})
  }, [currentEventId])

  const handleSaveSeuils = async () => {
    if (!currentEventId) return
    setSavingConf(true)
    try {
      await saveSettings({ alertSeuils: seuils }, currentEventId)
      toast.success('Seuils enregistrés')
    } catch (e) {
      toast.error(friendlyError(e, "Les seuils n'ont pas été enregistrés."))
    }
    setSavingConf(false)
  }

  const handleResetSeuils = () => {
    setSeuils(DEFAULT_SEUILS)
    setConfirmReset(false)
  }

  // Persister dans localStorage à chaque changement.
  // Note : on accepte aussi une fonction (updater pattern React) pour éviter
  // le stale closure si plusieurs acquittements sont déclenchés rapidement.
  const acquitterPersist = (newSetOrFn) => {
    setAcquittees(prev => {
      const newSet = typeof newSetOrFn === 'function' ? newSetOrFn(prev) : newSetOrFn
      try {
        localStorage.setItem('yllacash-alertes-acquittees', JSON.stringify([...newSet]))
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

  // Acquitter tout de suite, « Annuler » retire seulement ce qui vient d'être acquitté.
  // Updater function pour éviter le stale closure (clics rapides successifs).
  const retirer = (ids) => acquitterPersist(prev => {
    const next = new Set(prev)
    ids.forEach(id => next.delete(id))
    return next
  })
  const acquitter = (id) => {
    acquitterPersist(prev => new Set([...prev, id]))
    toast.undo('Alerte acquittée', () => retirer([id]))
  }
  // Acquittement global : union des acquits précédents + alertes actuelles. Ne pas
  // remplacer le Set (les acquits passés disparaîtraient quand l'alerte n'apparaît
  // plus dans la liste courante, et reviendraient au prochain rendu).
  const acquitterTout = () => {
    const nouveaux = anomalies.map(a => a.id).filter(id => !acquittees.has(id))
    acquitterPersist(prev => new Set([...prev, ...nouveaux]))
    toast.undo('Toutes les alertes sont acquittées', () => retirer(nouveaux))
  }

  const enAttention = actives.filter(a=>a.niveau==='attention').length

  // 20/11/2026 — contenu du paramétrage des seuils, partagé entre le panneau
  // (tablette, ordinateur) et la feuille de réglages (téléphone)
  const configBody = (
    <>
    {/* Détections globales (toggles) */}
    <div className={s.configToggles}>
      {[
        ['soldeNegatif',       'Solde négatif',           'Alerte si un compte spectateur passe en négatif'],
        ['detectTxRapides',    'Transactions rapides',    'Plusieurs paiements en peu de temps'],
        ['detectDebitEleve',   'Débit élevé unique',      'Une grosse somme débitée en une fois'],
        ['detectEcartGlobal',  'Écart comptable global',  'Crédits/débits ≠ soldes'],
        ['detectDoublons',     'Transactions dupliquées', 'Même tx répétée en quelques secondes'],
        ['detectRuptureStock', 'Rupture de stock',        'Article à 0'],
        ['detectStockBas',     'Stock bas',               'Article sous son seuil'],
      ].map(([key, label, desc]) => (
        <label key={key} className={s.configToggle}>
          <input type="checkbox" checked={!!seuils[key]}
            onChange={e => setSeuils(prev => ({ ...prev, [key]: e.target.checked }))}/>
          <span>
            <span className={s.configLabel}>{label}</span>
            <span className={s.configDesc}>{desc}</span>
          </span>
        </label>
      ))}
    </div>

    {/* Seuils numériques */}
    <div className={s.configFields}>
      <SeuilField label="Écart comptable max"
        suffix="€" value={Math.round(seuils.ecartSoldeMax / 100)}
        onChange={v => setSeuils(prev => ({ ...prev, ecartSoldeMax: Math.max(0, v) * 100 }))}
        desc="Tolérance avant alerte d'écart"/>
      <SeuilField label="Débit élevé à partir de"
        suffix="€" value={Math.round(seuils.debitEleveSeuil / 100)}
        onChange={v => setSeuils(prev => ({ ...prev, debitEleveSeuil: Math.max(0, v) * 100 }))}
        desc="Au-dessus, alerte attention"/>
      <SeuilField label="Tx rapides — seuil"
        suffix="tx" value={seuils.txRapides}
        onChange={v => setSeuils(prev => ({ ...prev, txRapides: Math.max(2, v) }))}
        desc="Nb d'opérations qui déclenche l'alerte"/>
      <SeuilField label="Fenêtre tx rapides"
        suffix="s" value={seuils.txRapidesWindowSec}
        onChange={v => setSeuils(prev => ({ ...prev, txRapidesWindowSec: Math.max(10, v) }))}
        desc="Durée pendant laquelle on compte les tx"/>
      <SeuilField label="Fenêtre doublons"
        suffix="s" value={seuils.doublonWindowSec}
        onChange={v => setSeuils(prev => ({ ...prev, doublonWindowSec: Math.max(5, v) }))}
        desc="Tx identique en moins de X secondes"/>
      <SeuilField label="Seuil stock bas (défaut)"
        suffix="u." value={seuils.stockBasSeuilDefaut}
        onChange={v => setSeuils(prev => ({ ...prev, stockBasSeuilDefaut: Math.max(1, v) }))}
        desc="Si non défini par article"/>
    </div>
    </>
  )

  const resetDialog = (
    <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title="Remettre les seuils par défaut ?"
      footer={<>
        <Button variant="secondary" onClick={() => setConfirmReset(false)}>Annuler</Button>
        <Button variant="danger" onClick={handleResetSeuils}>Remettre par défaut</Button>
      </>}>
      Tous les seuils reprennent leurs valeurs d'origine. La modification s'applique à l'enregistrement.
    </Dialog>
  )

  // 23/11/2026 (maquette validée) — fenêtres de détail : une alerte (niveau, pourquoi, compte et
  // opérations liées déjà chargées, bouton Acquitter) ou un compteur (répartition par type).
  const [detailId, setDetailId] = useState(null)
  const [statOpen, setStatOpen] = useState(null)
  const detail = detailId ? actives.find(a => a.id === detailId) || null : null
  const detailSpec = detail?.specId ? spectateurs.find(x => x.id === detail.specId) : null
  const liees = detail?.specId
    ? (logs || []).filter(t => t.specId === detail.specId)
        .sort((a, b) => (b.createdAt?.seconds || Date.parse(b.timestamp || '') / 1000 || 0) - (a.createdAt?.seconds || Date.parse(a.timestamp || '') / 1000 || 0))
        .slice(0, 5)
    : []
  const typeAlerte = (a) => a.type || String(a.titre || 'Alerte').split(' — ')[0]
  const statListe = statOpen === 'critique' ? critiques : statOpen === 'attention' ? actives.filter(a => a.niveau === 'attention') : []
  const detailSheets = (
    <>
      <DetailSheet open={!!detail} onClose={() => setDetailId(null)} title={detail ? (detail.type || detail.titre) : 'Alerte'}
        icon={AlertTriangle} color={pastilleAlerte(detail?.niveau === 'critique' ? 'danger' : 'warning')}
        status={detail ? { label: detail.niveau === 'critique' ? 'Critique' : 'Attention', tone: detail.niveau === 'critique' ? 'danger' : 'warning' } : null}
        sections={detail ? nettoyer([
          { label: 'Pourquoi', content: <Note>{detail.detail}</Note> },
          { label: 'Détection', rows: [['Niveau', detail.niveau === 'critique' ? 'Critique' : 'Attention'], ['Détectée', detail.date || null]] },
          { label: 'Compte', rows: [
            ['Nom', detailSpec?.nom || null],
            ['N° de compte', detail.specId || null],
            ['Solde actuel', detailSpec ? fmt(detailSpec.solde || 0) : null],
          ] },
          liees.length > 0 && { label: 'Dernières opérations du compte', rows: liees.map(t => [
            `${t.label || t.type}${t.heure || t.date ? ` · ${String(t.heure || t.date).slice(0, 16)}` : ''}`,
            fmt(t.montant || 0),
          ]) },
        ]) : []}
        actions={detail && <Button block icon={CheckCircle} onClick={() => { const id = detail.id; setDetailId(null); acquitter(id) }}>Acquitter</Button>}/>
      <DetailSheet open={!!statOpen} onClose={() => setStatOpen(null)}
        title={statOpen === 'critique' ? 'Alertes critiques' : statOpen === 'attention' ? 'Alertes en attention' : 'Alertes acquittées'}
        icon={statOpen === 'acquittees' ? CheckCircle : AlertTriangle}
        value={statOpen === 'acquittees' ? String(acquittees.size) : String(statListe.length)}
        sections={statOpen === 'acquittees'
          ? [
            { label: 'Détail', rows: [
              ['Acquittées sur cet appareil', String(acquittees.size)],
              ['Dont encore détectées', String(anomalies.filter(a => acquittees.has(a.id)).length)],
            ] },
            { label: 'Ce que compte ce chiffre', content: <Note>Les alertes marquées comme traitées. La liste est gardée dans ce navigateur : un autre appareil ne la voit pas.</Note> },
          ]
          : [
            { label: 'Par type', content: <Repartition money={false} rows={grouper(statListe, typeAlerte, () => 1).map(g => ({ ...g, count: undefined }))} empty="Aucune alerte à ce niveau." /> },
            { label: 'Ce que compte ce chiffre', content: <Note>{statOpen === 'critique' ? 'Alertes actives de niveau critique (soldes négatifs, écart comptable, doublons, ruptures), non acquittées.' : 'Alertes actives de niveau attention (transactions rapides, débits élevés, stocks bas), non acquittées.'}</Note> },
          ]}/>
    </>
  )

  // 20/11/2026 — disposition téléphone : compteurs sur une rangée, alertes en liste,
  // actions rares (son, seuils, tout acquitter) dans une feuille montant du bas.
  // Mêmes données et mêmes fonctions que la disposition large.
  if (isMobile) {
    return (
      <div className={s.page}>
        <div className={s.heading}>
          <h2 className={s.title}>Alertes financières en temps réel</h2>
          {actives.length>0&&(
            <span className={s.mCount}>{actives.length} à traiter</span>
          )}
        </div>

        <div className={s.mStats}>
          <button type="button" className={clsx(s.mStat, s.mStatBtn, critiques.length > 0 && s.mStatAlert)} aria-haspopup="dialog" onClick={() => setStatOpen('critique')}>
            <b>{critiques.length}</b><span>Critiques</span>
          </button>
          <button type="button" className={clsx(s.mStat, s.mStatBtn)} aria-haspopup="dialog" onClick={() => setStatOpen('attention')}><b>{enAttention}</b><span>Attention</span></button>
          <button type="button" className={clsx(s.mStat, s.mStatBtn)} aria-haspopup="dialog" onClick={() => setStatOpen('acquittees')}><b>{acquittees.size}</b><span>Acquittées</span></button>
        </div>

        {actives.length === 0
          ? (
            <div className={s.allClear}>
              <ShieldCheck size={28} aria-hidden="true"/>
              <div className={s.allClearTitle}>
                {anomalies.length > 0 ? 'Toutes les alertes sont acquittées' : 'Aucune anomalie détectée'}
              </div>
              <div className={s.allClearSub}>Surveillance active en temps réel</div>
            </div>
          )
          : (
            <ul className={s.mList}>
              {actives.map((a, i) => {
                const crit = a.niveau === 'critique'
                return (
                  <li key={a.id || `${a.titre}-${i}`} className={clsx(s.mRow, crit && s.mCrit)}>
                    <span className={s.mDot} aria-hidden="true">!</span>
                    {/* 23/11/2026 : le texte ouvre le détail ; « Acquitter » reste à côté */}
                    <button type="button" className={clsx(s.mText, s.openBtn)} aria-haspopup="dialog" onClick={() => setDetailId(a.id)}>
                      <span className={s.mSev}>{crit ? 'Critique' : 'Attention'}</span>
                      <span className={s.mType}>{a.type || a.titre}</span>
                      <span className={s.mDetail}>{a.detail}</span>
                      {a.date && <span className={s.mDate}>{a.date}</span>}
                    </button>
                    <Button variant="secondary" size="sm" className={s.mTap}
                      aria-label={`Acquitter : ${a.type || a.titre}`} onClick={()=>acquitter(a.id)}>Acquitter</Button>
                  </li>
                )
              })}
            </ul>
          )
        }

        <Button variant="secondary" block icon={SettingsIcon} aria-haspopup="dialog"
          onClick={() => setReglagesOpen(true)}>Réglages des alertes</Button>

        <Sheet saisie open={reglagesOpen} onClose={() => setReglagesOpen(false)} title="Réglages des alertes">
          <div className={s.mSheet}>
            <button type="button" className={s.mOption} aria-pressed={son} onClick={()=>setSon(v=>!v)}>
              {son ? <Bell size={18} aria-hidden="true"/> : <BellOff size={18} aria-hidden="true"/>}
              <span className={s.mOptionText}>Son<small>À chaque nouvelle alerte</small></span>
              <b>{son ? 'Activé' : 'Coupé'}</b>
            </button>
            <button type="button" className={s.mOption} aria-expanded={configOpen} onClick={() => setConfigOpen(v => !v)}>
              <SettingsIcon size={18} aria-hidden="true"/>
              <span className={s.mOptionText}>Seuils<small>Détections et seuils de l'événement</small></span>
              {configOpen ? <ChevronUp size={18} aria-hidden="true"/> : <ChevronDown size={18} aria-hidden="true"/>}
            </button>
            {configOpen && (
              <div className={s.mConfig}>
                <div className={s.mConfigHead}>
                  <div className={s.mConfigTitle}>Paramétrer les alertes financières</div>
                  <div className={s.mConfigSub}>Réglages enregistrés au niveau de l'événement</div>
                </div>
                {configBody}
                <div className={s.mConfigActions}>
                  <Button variant="ghost" size="sm" className={s.mTap} icon={RotateCcw} onClick={() => setConfirmReset(true)}>Par défaut</Button>
                  <Button size="sm" className={s.mTap} icon={Save} loading={savingConf} onClick={handleSaveSeuils}>Enregistrer</Button>
                </div>
              </div>
            )}
            <Button variant="secondary" block icon={CheckCircle} disabled={actives.length === 0}
              onClick={() => { acquitterTout(); setReglagesOpen(false) }}>Tout acquitter</Button>
            <Button variant="ghost" block onClick={() => setReglagesOpen(false)}>Fermer</Button>
          </div>
        </Sheet>

        {resetDialog}
        {detailSheets}
      </div>
    )
  }

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
          <Button variant="secondary" size="sm" icon={SettingsIcon} aria-expanded={configOpen}
            className={clsx(configOpen && s.soundOn)} onClick={() => setConfigOpen(v => !v)}>
            Configurer
            {configOpen ? <ChevronUp size={14} aria-hidden="true"/> : <ChevronDown size={14} aria-hidden="true"/>}
          </Button>
          {actives.length>0&&(
            <Button variant="secondary" size="sm" icon={CheckCircle} onClick={acquitterTout}>Tout acquitter</Button>
          )}
        </div>
      </div>

      {/* Panneau de configuration des seuils */}
      {configOpen && (
        <Card
          title="Paramétrer les alertes financières"
          subtitle="Réglages enregistrés au niveau de l'événement"
          actions={<>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirmReset(true)}>Par défaut</Button>
            <Button size="sm" icon={Save} loading={savingConf} onClick={handleSaveSeuils}>Enregistrer</Button>
          </>}
        >
          {configBody}
        </Card>
      )}

      {resetDialog}

      {/* Stats rapides */}
      <div className={clsx(s.stats, 'yc-stagger')}>
        <div className={clsx(s.statWrap, critiques.length > 0 && s.statAlert)}>
          <Stat label="Alertes critiques" value={critiques.length} icon={AlertTriangle} tone={critiques.length ? 'coral' : 'brand'} onClick={() => setStatOpen('critique')}/>
        </div>
        <Stat label="En attention" value={enAttention} icon={AlertTriangle} tone="warning" onClick={() => setStatOpen('attention')}/>
        <Stat label="Acquittées" value={acquittees.size} icon={CheckCircle} onClick={() => setStatOpen('acquittees')}/>
      </div>

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
                  {/* 23/11/2026 : titre et texte ouvrent le détail ; « Acquitter » reste en bas */}
                  <button type="button" className={clsx(s.openBtn, s.openGrid)} aria-haspopup="dialog" onClick={() => setDetailId(a.id)}>
                    <span className={s.alertHead}>
                      <span className={s.alertTitle}>
                        <AlertTriangle size={16} aria-hidden="true" className={s.alertIcon}/>
                        <span className={s.alertType}>{a.type || a.titre}</span>
                        <Badge tone={crit ? 'danger' : 'warning'}>{crit ? 'Critique' : 'Attention'}</Badge>
                      </span>
                      {a.date && <span className={s.alertDate}>{a.date}</span>}
                    </span>
                    <span className={clsx(s.alertDetail, s.block)}>{a.detail}</span>
                  </button>
                  <div className={s.alertFoot}>
                    <Button variant="secondary" size="sm" icon={CheckCircle} onClick={()=>acquitter(a.id)}>Acquitter</Button>
                  </div>
                </article>
              )
            })}
          </div>
        )
      }
      {detailSheets}
    </div>
  )
}

// Champ numérique compact avec stepper ± — utilisé dans le panneau de config
function SeuilField({ label, value, onChange, suffix = '', desc }) {
  return (
    <div className={s.seuil}>
      <div className={s.configLabel}>{label}</div>
      <div className={s.stepper}>
        <button type="button" aria-label={`Diminuer : ${label}`} onClick={() => onChange(value - 1)}>−</button>
        <input type="number" inputMode="numeric" aria-label={label} value={value}
          onChange={e => onChange(parseInt(e.target.value) || 0)}/>
        <button type="button" aria-label={`Augmenter : ${label}`} onClick={() => onChange(value + 1)}>+</button>
        {suffix && <span className={s.stepperSuffix}>{suffix}</span>}
      </div>
      {desc && <div className={s.configDesc}>{desc}</div>}
    </div>
  )
}
