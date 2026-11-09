/**
 * ProductGrid — tuiles d'articles : un appui ajoute 1 au ticket.
 * Stock restant affiché (or sous le seuil, brique en rupture).
 * Photo de l'article si renseignée, sinon initiales.
 * onInfo (facultatif) : petit bouton « i » qui ouvre la fiche composition / allergènes,
 * à côté de la tuile pour ne pas gêner l'ajout en un appui (visible aussi en rupture).
 */
import React from 'react'
import clsx from 'clsx'
import { Info } from 'lucide-react'
import { fmt } from '../../../utils/helpers'
import s from './pos.module.css'

// Couleur de tuile stable par catégorie (pas d'emoji : initiales de l'article)
const TONES = ['brand', 'coral', 'gold', 'green']
const toneFor = (cat = '') => TONES[[...cat].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]
// Initiales des deux premiers mots (lettres seulement) ; un seul mot → ses deux premières lettres
const initials = (nom = '') => {
  const words = nom.split(/[^\p{L}]+/u).filter(Boolean)
  if (words.length === 0) return '•'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function ProductGrid({ items, qtys, onAdd, onInfo, big = false }) {
  if (items.length === 0) {
    return <p className={s.gridEmpty}>Aucun article dans cette catégorie.</p>
  }
  return (
    <div className={clsx(s.grid, big && s.gridBig)}>
      {items.map(m => {
        const stock   = m.stock || 0
        const qty     = qtys[m.id] || 0
        const rupture = stock === 0
        const full    = qty >= stock
        const low     = !rupture && stock <= (m.seuilAlerte || 10)
        return (
          <div key={m.id} className={s.tileWrap}>
            <button
              type="button"
              className={clsx(s.tile, qty > 0 && s.tileOn, (rupture || full) && s.tileOff)}
              onClick={(e) => onAdd(m, e.currentTarget)}
              disabled={rupture || full}
              aria-label={`${m.nom}, ${fmt(m.prix || 0)}${qty ? `, ${qty} au ticket` : ''}${rupture ? ', en rupture' : ''}`}
            >
              {m.photoUrl
                ? (
                  <span className={clsx(s.pic, s.picPhoto)} data-pic>
                    {/* Fond flouté pour combler les bandes laissées par contain */}
                    <span className={s.picBlur} style={{ backgroundImage: `url(${m.photoUrl})` }} aria-hidden="true" />
                    <img className={s.picImg} src={m.photoUrl} alt="" />
                  </span>
                )
                : <span className={clsx(s.pic, s[toneFor(m.cat)])} data-pic>{initials(m.nom)}</span>}
              <span className={s.tileName}>{m.nom}</span>
              <span className={s.tilePrice}>{fmt(m.prix || 0)}</span>
              <span className={clsx(s.stock, low && s.stockLow, rupture && s.stockOut)}>
                {rupture ? 'Rupture' : stock}
              </span>
              {qty > 0 && <span className={s.qtyBadge}>{qty}</span>}
            </button>
            {onInfo && (
              <button type="button" className={s.tileInfo} onClick={() => onInfo(m)}
                aria-label={`Voir la composition de ${m.nom}`} title="Voir la composition">
                <Info size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
