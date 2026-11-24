/**
 * components/BannierePanneBorne.jsx — bandeau « Borne en panne » de la billetterie (écran 7, 23/11/2026)
 *
 * Affiché tant qu'un admin a déclaré la borne en panne (réglage borneEnPanne) : prévient que
 * « Encaisser » est ouvert et que ces ventes sont comptées à part dans la clôture.
 * onOuvrir (facultatif) : rend le bandeau cliquable vers « Encaisser ».
 */
import React from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import s from './BannierePanneBorne.module.css'

export default function BannierePanneBorne({ texte, onOuvrir }) {
  const contenu = (<>
    <AlertTriangle size={18} aria-hidden="true" className={s.ico} />
    <span className={s.txt}>{texte || 'Borne en panne : vous pouvez encaisser les commandes ici. Les ventes sont comptées à part.'}</span>
    {onOuvrir && <ChevronRight size={18} aria-hidden="true" className={s.ico} />}
  </>)
  return onOuvrir
    ? <button type="button" className={s.ban} onClick={onOuvrir}>{contenu}</button>
    : <div className={s.ban} role="status">{contenu}</div>
}
