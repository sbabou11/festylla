/**
 * pages/public/borne/BorneImprimante.jsx — imprimante de tickets de la borne (maquette du 20/11/2026)
 *
 * BoutonImprimante : bouton discret de l'accueil (pastille verte ou rouge) et son panneau, réservé
 *                    à l'équipe : état, « Connecter l'imprimante », « Imprimer un ticket d'essai »,
 *                    case « Sans accents ».
 * Progression      : barre affichée pendant l'impression (ticket 1 sur 2, pourcentage, temps restant).
 * Les couleurs viennent de la palette de la borne (prop colors).
 */
import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { useImprimante } from '../../../hooks/useImpression'

// Sur tablette, l'accueil démarre au moindre toucher : chaque geste ici doit s'arrêter là
const stop = (f) => (e) => { e.stopPropagation(); if (e.type === 'touchend') e.preventDefault(); f && f(e) }

export function BoutonImprimante({ colors, festival, right = 16 }) {
  const { etat, occupe, message, connecter, essai, sansAccents, setSansAccents } = useImprimante()
  const [ouvert, setOuvert] = useState(false)
  const basculer = stop(() => setOuvert(o => !o))
  const btn = {
    borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, textAlign: 'center',
    cursor: occupe ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: occupe ? .6 : 1,
  }
  return (
    <>
      <button onClick={basculer} onTouchEnd={basculer} aria-expanded={ouvert}
        style={{
          position: 'absolute', top: 16, right, zIndex: 10,
          padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', color: '#fff',
          border: '0.5px solid rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: etat.connectee ? colors.green : colors.red }}/>
        <Printer size={13}/> Imprimante
      </button>
      {ouvert && (
        <div onClick={stop()} onTouchEnd={stop()} role="dialog" aria-label="Imprimante de tickets"
          style={{
            position: 'absolute', top: 56, right: 16, zIndex: 11, width: 300, textAlign: 'left', cursor: 'default',
            background: '#fff', color: colors.text, borderRadius: 12, padding: 14, display: 'grid', gap: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
          }}>
          <b style={{ fontSize: 14 }}>Imprimante de tickets</b>
          <span style={{ fontSize: 12, color: colors.muted }}>
            {!etat.supporte
              ? 'Ce navigateur ne sait pas parler à une imprimante USB. Utilisez Chrome sur la tablette.'
              : etat.connectee ? `Connectée · ${etat.nom} · prête à imprimer` : 'Non connectée : les tickets resteront affichés à l\'écran.'}
          </span>
          <button disabled={occupe || !etat.supporte} onClick={stop(connecter)} onTouchEnd={stop(connecter)}
            style={{ ...btn, background: colors.marine, color: '#fff', border: 'none' }}>
            {etat.connectee ? 'Changer d\'imprimante' : 'Connecter l\'imprimante'}
          </button>
          <button disabled={occupe || !etat.connectee} onClick={stop(() => essai(festival))} onTouchEnd={stop(() => essai(festival))}
            style={{ ...btn, background: '#fff', color: colors.marine, border: `0.5px solid ${colors.marine}`, opacity: etat.connectee && !occupe ? 1 : .4 }}>
            Imprimer un ticket d'essai
          </button>
          <label onClick={stop(() => setSansAccents(!sansAccents))} onTouchEnd={stop(() => setSansAccents(!sansAccents))}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" readOnly checked={sansAccents} style={{ width: 16, height: 16 }}/>
            Sans accents (si le ticket d'essai montre des caractères illisibles)
          </label>
          {message && <span role="status" style={{ fontSize: 12, fontWeight: 600, color: colors.marine }}>{message}</span>}
          <span style={{ fontSize: 11, color: colors.muted }}>Réservé à l'équipe, à la mise en place de la borne.</span>
        </div>
      )}
    </>
  )
}

/** Barre de progression de l'impression : « Ticket 1 sur 2 · 45 % · encore 3 s » */
export function Progression({ progres, colors }) {
  const reste = Math.ceil((progres.resteMs || 0) / 1000)
  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto 16px' }} role="status" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: colors.marine, marginBottom: 6 }}>
        <span>Ticket {progres.ticket} sur {progres.total}</span>
        <span>{progres.pourcent} %</span>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: colors.border, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progres.pourcent}%`, background: colors.coral, borderRadius: 6, transition: 'width 150ms linear' }}/>
      </div>
      <div style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: 'center' }}>
        {reste > 0 ? `Encore ${reste} seconde${reste > 1 ? 's' : ''} environ` : 'Presque terminé…'}
      </div>
    </div>
  )
}
