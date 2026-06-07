/**
 * components/UpdateDiagnostic.jsx — v8 debug
 *
 * Bloc dans Réglages pour :
 *   - Voir l'état du service worker (enregistré ? actif ? waiting ?)
 *   - Forcer une vérification manuelle de mise à jour
 *   - Voir la version actuellement servie
 *
 * Utile pour diagnostiquer pourquoi la popup n'apparaîtrait pas.
 */

import React, { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Box, Download } from 'lucide-react'
import { checkForUpdate } from '../hooks/useAppUpdate'

export default function UpdateDiagnostic() {
  const [checking, setChecking] = useState(false)
  const [result, setResult]     = useState(null)
  const [swState, setSwState]   = useState({ registered: false, active: null, waiting: null, installing: null })

  // État du SW au chargement + à chaque action
  const refreshSwState = async () => {
    if (!('serviceWorker' in navigator)) {
      setSwState({ registered: false, active: null, waiting: null, installing: null, unsupported: true })
      return
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      if (!reg) {
        setSwState({ registered: false, active: null, waiting: null, installing: null })
        return
      }
      setSwState({
        registered: true,
        active:     reg.active     ? { state: reg.active.state,     scriptURL: reg.active.scriptURL.split('/').pop() }     : null,
        waiting:    reg.waiting    ? { state: reg.waiting.state,    scriptURL: reg.waiting.scriptURL.split('/').pop() }    : null,
        installing: reg.installing ? { state: reg.installing.state, scriptURL: reg.installing.scriptURL.split('/').pop() } : null,
      })
    } catch {
      setSwState({ registered: false, error: true })
    }
  }

  useEffect(() => {
    refreshSwState()
    const t = setInterval(refreshSwState, 5000)
    return () => clearInterval(t)
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    setResult(null)
    try {
      const r = await checkForUpdate()
      setResult(r)
      // Rafraîchit l'état du SW immédiatement
      setTimeout(refreshSwState, 500)
    } catch (e) {
      setResult({ found: false, error: e.message })
    }
    setChecking(false)
  }

  return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:16, marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--brand-light)',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0,
        }}>
          <Box size={18} style={{ color:'var(--brand-dark)' }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>
            Mises à jour de l'app
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
            État du service worker et vérification manuelle
          </div>
        </div>
      </div>

      {/* État du SW */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:8, marginBottom:14 }}>
        <SwItem label="Enregistré"
          ok={swState.registered}
          detail={swState.unsupported ? 'Non supporté' : (swState.registered ? 'Oui' : 'Non')}/>
        <SwItem label="Version active"
          ok={!!swState.active} neutral={!swState.active}
          detail={swState.active?.state || '—'}/>
        <SwItem label="Nouvelle version en attente"
          ok={!!swState.waiting} neutral={!swState.waiting}
          detail={swState.waiting ? '✨ Oui, prête à activer' : 'Aucune'}/>
        <SwItem label="Téléchargement en cours"
          neutral
          detail={swState.installing ? '⏳ ' + swState.installing.state : 'Inactif'}/>
      </div>

      {/* Aide : si waiting, on explique qu'on peut l'activer */}
      {swState.waiting && !result && (
        <div className="alert alert-success" style={{ marginBottom:12, fontSize:12, lineHeight:1.5 }}>
          <CheckCircle size={13} style={{ verticalAlign:-2, marginRight:5 }}/>
          Une nouvelle version est <strong>prête à être installée</strong>. Vous devriez voir la popup de mise à jour apparaître en bas de l'écran. Sinon, cliquez sur "Vérifier maintenant" ci-dessous.
        </div>
      )}

      {/* Bouton check manuel */}
      <button onClick={handleCheck} disabled={checking}
        style={{
          display:'flex', alignItems:'center', gap:6, padding:'10px 14px',
          background:'var(--brand)', color:'#fff', border:'none', borderRadius:8,
          fontSize:13, fontWeight:600, cursor: checking ? 'wait' : 'pointer',
          fontFamily:'var(--font)', minHeight:40, opacity: checking ? 0.7 : 1,
        }}>
        <RefreshCw size={14} className={checking ? 'spin' : ''}/>
        {checking ? 'Vérification en cours…' : 'Vérifier les mises à jour maintenant'}
      </button>

      {/* Résultat de la vérification */}
      {result && (
        <div
          className={'alert ' + (result.found ? 'alert-success' : result.error ? 'alert-error' : 'alert-warning')}
          style={{ marginTop:10, fontSize:12, lineHeight:1.5 }}>
          {result.found ? (
            <>
              <CheckCircle size={13} style={{ verticalAlign:-2, marginRight:5 }}/>
              Une nouvelle version a été détectée ! La popup d'installation devrait apparaître.
              {result.installing && ' (Téléchargement en cours…)'}
            </>
          ) : result.error ? (
            <>
              <AlertCircle size={13} style={{ verticalAlign:-2, marginRight:5 }}/>
              Erreur : {result.error}
            </>
          ) : (
            <>
              <CheckCircle size={13} style={{ verticalAlign:-2, marginRight:5 }}/>
              Aucune nouvelle version disponible — vous êtes à jour.
            </>
          )}
        </div>
      )}

      {/* Astuce diagnostic console */}
      <div style={{ fontSize:10, color:'var(--muted)', marginTop:10, lineHeight:1.5 }}>
        💡 Pour un diagnostic complet, ouvrez la console DevTools (F12 → Console) — les événements de mise à jour y sont journalisés avec le préfixe <code style={{ background:'var(--bg2)', padding:'1px 4px', borderRadius:3 }}>[YllaCash Update]</code>.
      </div>
    </div>
  )
}

function SwItem({ label, detail, ok, neutral }) {
  const color = neutral ? 'var(--muted)' : (ok ? 'var(--green-dark)' : 'var(--red-dark)')
  const bg    = neutral ? 'var(--bg2)'   : (ok ? 'var(--green-light)' : 'var(--red-light)')
  return (
    <div style={{ background: bg, padding:'8px 10px', borderRadius:8 }}>
      <div style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>
        {label}
      </div>
      <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.4 }}>{detail}</div>
    </div>
  )
}
