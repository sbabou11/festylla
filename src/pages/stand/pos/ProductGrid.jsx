/**
 * ProductGrid — tuiles d'articles.
 * Stock restant affiché (or sous le seuil, brique en rupture).
 * Photo de l'article si renseignée, sinon initiales.
 * onInfo fourni (23/11/2026) : carte de la billetterie (aperçu photo, nom, prix, « − » / « + ») ;
 * toucher la carte ouvre la fiche (composition, allergènes, quantité). onRemove retire 1.
 * Sans onInfo : un appui sur la tuile ajoute 1 au ticket (comportement d'origine).
 * nv (téléphone, 23/11/2026) : tuile en carte, pastille ronde aux initiales, stock bas ou rupture
 * écrits sous le prix, quantité qui « saute » à chaque appui. Même logique d'ajout.
 */
import React from 'react'
import clsx from 'clsx'
import { Plus, Minus } from 'lucide-react'
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

export default function ProductGrid({ items, qtys, onAdd, onRemove, onInfo, big = false, nv = false }) {
  if (items.length === 0) {
    return <p className={s.gridEmpty}>Aucun article dans cette catégorie.</p>
  }
  // 23/11/2026 (maquette validée : « vraiment uniforme, comme la borne et la billetterie ») :
  // même carte que « Commande sur place » de la billetterie, sur tous les écrans : aperçu photo,
  // nom, prix, stock bas, puis « − » et « + » ; toucher la carte ouvre la fiche.
  if (onInfo) {
    return (
      <div className={clsx(s.pgGrid, big && s.pgGridBig)}>
        {items.map(m => {
          const stock   = m.stock || 0
          const qty     = qtys[m.id] || 0
          const rupture = stock === 0
          const full    = qty >= stock
          const low     = !rupture && stock <= (m.seuilAlerte || 10)
          const photo   = m.photoUrl || m.image
          return (
            <div key={m.id} className={clsx(s.pgCard, qty > 0 && s.pgCardOn, rupture && s.pgCardOut)}>
              <button type="button" className={s.pgOpen} onClick={() => onInfo(m)}
                aria-label={`Fiche de ${m.nom}, ${fmt(m.prix || 0)}${qty ? `, ${qty} au ticket` : ''}${rupture ? ', en rupture' : ''}`}>
                <span className={s.pgPhoto} data-pic>
                  {photo ? <img src={photo} alt="" /> : <span aria-hidden="true">{(m.nom || '?').charAt(0).toUpperCase()}</span>}
                  {qty > 0 && <span key={qty} className={clsx(s.pgQty, 'nv-pop')}>{qty}</span>}
                </span>
                <span className={s.pgBody}>
                  <span className={s.pgName}>{m.nom}</span>
                  <span className={s.pgPrice}>{rupture ? 'Épuisé' : fmt(m.prix || 0)}</span>
                  {low && <span className={s.pgLow}>{stock} restant{stock > 1 ? 's' : ''}</span>}
                </span>
              </button>
              <div className={s.pgActs}>
                <button type="button" aria-label={`Retirer un ${m.nom}`} disabled={!qty || !onRemove} onClick={() => onRemove?.(m)}>
                  <Minus size={16} aria-hidden="true" />
                </button>
                <button type="button" className={s.pgAdd} aria-label={`Ajouter un ${m.nom}`} disabled={rupture || full}
                  onClick={(e) => onAdd(m, e.currentTarget.closest(`.${s.pgCard}`))}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className={clsx(s.grid, big && s.gridBig, nv && s.nvGrid)}>
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
              className={clsx(s.tile, qty > 0 && s.tileOn, (rupture || full) && s.tileOff, onInfo && s.tileWithAdd)}
              onClick={(e) => (onInfo ? onInfo(m) : onAdd(m, e.currentTarget))}
              disabled={!onInfo && (rupture || full)}
              aria-label={`${onInfo ? 'Fiche de ' : ''}${m.nom}, ${fmt(m.prix || 0)}${qty ? `, ${qty} au ticket` : ''}${rupture ? ', en rupture' : ''}`}
            >
              {m.photoUrl
                ? (
                  <span className={clsx(s.pic, s.picPhoto)} data-pic>
                    {/* Image générée (carrée, produit centré) : plein cadre. Photo libre : entière sur fond flouté */}
                    {!m.photoGenerated && <span className={s.picBlur} style={{ backgroundImage: `url(${m.photoUrl})` }} aria-hidden="true" />}
                    <img className={clsx(s.picImg, m.photoGenerated && s.picCover)} src={m.photoUrl} alt="" />
                  </span>
                )
                : <span className={clsx(s.pic, s[toneFor(m.cat)])} data-pic>{initials(m.nom)}</span>}
              <span className={s.tileName}>{m.nom}</span>
              {nv ? (
                <span className={clsx(s.tilePrice, s.nvPrice)}>
                  {rupture ? <span className={s.nvOut}>Rupture de stock</span> : fmt(m.prix || 0)}
                  {low && <span className={s.nvLow}> · {stock} restant{stock > 1 ? 's' : ''}</span>}
                </span>
              ) : (<>
                <span className={s.tilePrice}>{fmt(m.prix || 0)}</span>
                <span className={clsx(s.stock, low && s.stockLow, rupture && s.stockOut)}>
                  {rupture ? 'Rupture' : stock}
                </span>
              </>)}
              {/* nv : la clé change à chaque appui, la pastille rejoue son animation */}
              {qty > 0 && (nv
                ? <span key={qty} className={clsx(s.nvQty, 'nv-pop')}>{qty}</span>
                : <span className={s.qtyBadge}>{qty}</span>)}
            </button>
            {onInfo && (
              <button type="button" className={clsx(s.tileInfo, s.tileAdd)}
                onClick={(e) => onAdd(m, e.currentTarget.parentElement.firstElementChild)}
                disabled={rupture || full}
                aria-label={`Ajouter ${m.nom}`} title="Ajouter au ticket">
                <Plus size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
