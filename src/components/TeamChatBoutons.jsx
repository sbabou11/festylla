/**
 * components/TeamChatBoutons.jsx — discussion et talkie dans l'entête (23/11/2026, option A validée)
 *
 * Remplace la bulle flottante (ChatFab) quand l'écran donne une place dans son entête :
 *  - Discussion : un appui ouvre la discussion ; pastille rouge = messages non lus
 *  - Talkie     : maintenir pour parler (doigt, souris ou barre d'espace) ; corail quand je parle,
 *                 or et bloqué quand quelqu'un d'autre parle
 * grand=false : boutons ronds du nouveau style (téléphone) ; grand=true : boutons carrés de la barre
 * du haut (tablette, ordinateur).
 */
import React, { useRef } from 'react'
import clsx from 'clsx'
import { MessageCircle, Radio, Mic } from 'lucide-react'
import s from './TeamChatBoutons.module.css'

export default function TeamChatBoutons({
  nonLuCount = 0, onOpenChat, onWalkieStart, onWalkieStop,
  iAmTalking = false, someoneElseTalking = false, talkDuration = 0, grand = false,
}) {
  const tient = useRef(false)
  const bloque = someoneElseTalking && !iAmTalking

  const debut = (e) => {
    if (bloque || tient.current) return
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* rien */ }
    tient.current = true
    onWalkieStart?.()
  }
  const fin = () => {
    if (!tient.current) return
    tient.current = false
    onWalkieStop?.()
  }
  const cls = grand ? s.carre : clsx('nv-round', s.rond)

  return (
    <>
      <button type="button" className={clsx(cls, s.chat, 'nv-press')} onClick={onOpenChat}
        aria-label={`Discussion de l'équipe${nonLuCount ? `, ${nonLuCount} non lu${nonLuCount > 1 ? 's' : ''}` : ''}`}
        title="Discussion de l'équipe">
        <MessageCircle size={grand ? 16 : 20} aria-hidden="true" />
        {nonLuCount > 0 && <span className={s.pastille} aria-hidden="true">{nonLuCount > 99 ? '99+' : nonLuCount}</span>}
      </button>
      <button type="button" className={clsx(cls, s.talkie, iAmTalking && s.moi, bloque && s.autre)}
        aria-disabled={bloque} aria-pressed={iAmTalking}
        aria-label={iAmTalking ? `Vous parlez, ${talkDuration} secondes : relâchez pour envoyer` : bloque ? 'Talkie occupé : quelqu\'un parle' : 'Talkie : maintenir pour parler'}
        title={iAmTalking ? 'Relâchez pour envoyer' : bloque ? 'Quelqu\'un parle déjà' : 'Maintenir pour parler'}
        onPointerDown={debut} onPointerUp={fin} onPointerCancel={fin} onLostPointerCapture={fin}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) debut(e) }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') fin() }}
        onBlur={fin}
        onContextMenu={(e) => e.preventDefault()}>
        {iAmTalking ? <Mic size={grand ? 16 : 20} aria-hidden="true" /> : <Radio size={grand ? 16 : 20} aria-hidden="true" />}
      </button>
    </>
  )
}
