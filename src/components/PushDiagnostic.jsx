/**
 * components/PushDiagnostic.jsx — v8 debug
 *
 * Panneau diagnostic des notifications push :
 *   - Statut sur l'appareil courant (supporté ? autorisé ? token actif ?)
 *   - Aide contextuelle si non supporté (notamment iOS)
 *   - Bouton pour envoyer une notification de test
 *
 * À placer dans la page Settings (ou ailleurs).
 */

import React, { useState } from 'react'
import { useFCM } from '../hooks/useFCM'
import useAuthStore from '../store/useAuthStore'
import useEventStore from '../store/useEventStore'
import {
  Bell, BellOff, CheckCircle, AlertCircle, AlertTriangle,
  Smartphone, Send, RefreshCw,
} from 'lucide-react'

export default function PushDiagnostic() {
  const { user }           = useAuthStore()
  const { currentEventId } = useEventStore()
  const fcm                = useFCM()
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState(null)

  const sendTest = async () => {
    if (!fcm.token) return
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: [fcm.token],
          title:  'YllaCash — Test',
          body:   'Si vous voyez ce message, les notifications fonctionnent ✓',
          eventId: currentEventId,
          tag: 'yllacash-test',
        }),
      })
      const json = await resp.json().catch(() => null)
      if (!resp.ok) {
        setTestResult({ ok: false, msg: json?.error || ('HTTP ' + resp.status) })
      } else if (json?.successCount > 0) {
        setTestResult({ ok: true, msg: 'Notification envoyée — vous devriez la voir d\'ici quelques secondes.' })
      } else {
        setTestResult({ ok: false, msg: 'Backend OK mais aucune notification livrée. Token peut-être invalide.' })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: 'Erreur réseau : ' + e.message })
    }
    setTesting(false)
  }

  // ── Rendu selon état ──────────────────────────────────────────────
  const caps = fcm.capabilities || {}
  const isReady = fcm.ready && fcm.token

  return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:16, marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: isReady ? 'var(--green-light)' : 'var(--gold-light)',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0,
        }}>
          {isReady ? <Bell size={18} style={{ color:'var(--green-dark)' }}/> : <BellOff size={18} style={{ color:'var(--gold-dark)' }}/>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>
            Notifications push
            {isReady && <span style={{ marginLeft:8, fontSize:10, color:'var(--green-dark)', background:'var(--green-light)', padding:'2px 8px', borderRadius:5, fontWeight:700 }}>ACTIVES</span>}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
            Statut sur cet appareil
          </div>
        </div>
      </div>

      {/* État détaillé */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:8, marginBottom:14 }}>
        <DiagItem label="Support navigateur" ok={caps.supported}
          detail={caps.supported ? 'Oui' : (caps.reason || 'Non')}/>
        <DiagItem label="Permission" ok={caps.permission === 'granted'} neutral={caps.permission === 'default'}
          detail={caps.permission === 'granted' ? 'Accordée'
                : caps.permission === 'denied'  ? 'Refusée — réactivez dans les réglages du navigateur'
                : caps.permission === 'default' ? 'Pas encore demandée'
                : 'Indisponible'}/>
        <DiagItem label="Token FCM" ok={!!fcm.token}
          detail={fcm.token ? 'Reçu (' + fcm.token.slice(0, 8) + '…)' : (fcm.error || 'Manquant')}/>
        <DiagItem label="Appareil"
          ok={true} neutral
          detail={caps.isIOS ? (caps.isPWA ? 'iOS PWA' : 'iOS Safari (limité)') : 'Android/Desktop'}/>
      </div>

      {/* Aide iOS non installée */}
      {caps.iosBlocking && (
        <div className="alert alert-warning" style={{ marginBottom:12, fontSize:12, lineHeight:1.5 }}>
          <strong>📱 Sur iOS :</strong> Les notifications push web ne fonctionnent qu'en mode PWA installée.<br/>
          Pour les activer :
          <ol style={{ marginTop:4, paddingLeft:20 }}>
            <li>Appuyez sur le bouton <strong>Partager</strong> en bas (carré + flèche)</li>
            <li>Choisissez <strong>"Sur l'écran d'accueil"</strong></li>
            <li>Validez, puis ouvrez l'app depuis l'icône créée</li>
            <li>Les notifications seront alors disponibles</li>
          </ol>
        </div>
      )}

      {/* Erreur générale */}
      {fcm.error && !caps.iosBlocking && (
        <div className="alert alert-error" style={{ marginBottom:12, fontSize:12 }}>
          {fcm.error}
        </div>
      )}

      {/* Permission refusée — pas réversible automatiquement */}
      {caps.permission === 'denied' && (
        <div className="alert alert-warning" style={{ marginBottom:12, fontSize:12, lineHeight:1.5 }}>
          <strong>Notifications bloquées par votre navigateur.</strong><br/>
          Pour les réactiver :
          <ul style={{ marginTop:4, paddingLeft:20 }}>
            <li><strong>Chrome / Edge :</strong> cliquez sur le 🔒 dans la barre d'adresse → Notifications → Autoriser</li>
            <li><strong>Firefox :</strong> cliquez sur le bouclier dans la barre d'adresse → Notifications</li>
            <li><strong>Safari iOS :</strong> Réglages → Safari → Sites web → Notifications</li>
          </ul>
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={fcm.refresh} disabled={fcm.isRefreshing}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'1px solid var(--border2)', borderRadius:8, background:'var(--bg2)', color:'var(--text)', fontSize:12, fontWeight:600, cursor: fcm.isRefreshing ? 'wait' : 'pointer', fontFamily:'var(--font)', minHeight:38, opacity: fcm.isRefreshing ? 0.7 : 1 }}>
          <RefreshCw size={13} className={fcm.isRefreshing ? 'spin' : ''}/>
          {fcm.isRefreshing ? 'Rafraîchissement…' : 'Rafraîchir'}
        </button>
        <button onClick={sendTest} disabled={!isReady || testing}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'none', borderRadius:8, background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor: isReady ? 'pointer' : 'not-allowed', fontFamily:'var(--font)', minHeight:38, opacity: isReady ? 1 : 0.5 }}>
          <Send size={13}/> {testing ? 'Envoi…' : 'Envoyer une notification de test'}
        </button>
      </div>

      {testResult && (
        <div className={'alert ' + (testResult.ok ? 'alert-success' : 'alert-error')} style={{ marginTop:10, fontSize:12 }}>
          {testResult.ok ? <CheckCircle size={14} style={{ verticalAlign:-2, marginRight:5 }}/> : <AlertCircle size={14} style={{ verticalAlign:-2, marginRight:5 }}/>}
          {testResult.msg}
        </div>
      )}
    </div>
  )
}

function DiagItem({ label, detail, ok, neutral }) {
  const color = neutral ? 'var(--muted)' : (ok ? 'var(--green-dark)' : 'var(--red-dark)')
  const bg    = neutral ? 'var(--bg2)'   : (ok ? 'var(--green-light)' : 'var(--red-light)')
  const Icon  = neutral ? Smartphone : (ok ? CheckCircle : AlertTriangle)
  return (
    <div style={{ background: bg, padding:'8px 10px', borderRadius:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>
        <Icon size={12}/> {label}
      </div>
      <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.4 }}>{detail}</div>
    </div>
  )
}
