/**
 * components/LinkGate.jsx — ouvre une page publique seulement avec un lien valable (sécurité, lot 2)
 *
 * Pages concernées : /benevole (lien personnel), /artiste (lien du créneau), /borne et /ecran
 * (liens d'appareil donnés par l'organisation). Le lien porte une clé (&k=…) ; le serveur
 * l'échange contre une session limitée, gardée ensuite par l'appareil.
 * Une personne de l'équipe déjà connectée sur l'appareil passe directement.
 */
import React, { useEffect, useState } from 'react'
import { ensureLinkSession } from '../firebase/publicSession'

export default function LinkGate({ kind, idParam, children }) {
  const params = new URLSearchParams(window.location.search)
  const ev = params.get('ev') || ''
  const id = idParam ? params.get(idParam) || '' : ''
  // Clé de l'adresse ; à défaut, celle retenue par l'appareil lors d'une ouverture précédente
  const store = `yllacash-lien-${kind}-${ev}-${id}`
  const cle = params.get('k') || (() => { try { return localStorage.getItem(store) || '' } catch { return '' } })()
  const [state, setState] = useState(ev ? 'checking' : 'ok')   // sans événement : la page affiche sa propre aide
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ev) return
    let alive = true
    ensureLinkSession({ kind, ev, id, cle }).then(r => {
      if (!alive) return
      if (r.ok) { try { if (cle) localStorage.setItem(store, cle) } catch {} ; setState('ok') }
      else { setError(r.error); setState('refused') }
    })
    return () => { alive = false }
  }, [kind, ev, id, cle, store])

  if (state === 'ok') return children
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg, #fff8f2)', color: 'var(--text, #0d2d33)', fontFamily: 'inherit', textAlign: 'center' }}>
      {state === 'checking'
        ? <p style={{ fontSize: 15, color: 'var(--muted, #6b6b6b)' }}>Vérification du lien…</p>
        : (
          <div style={{ maxWidth: 380 }}>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Lien non valable</h1>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{error}</p>
          </div>
        )}
    </div>
  )
}
