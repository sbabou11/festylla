/**
 * components/ArticleInfoModal.jsx — fiche article (photo, composition, allergènes, ajout)
 *
 * S'ouvre au toucher d'une carte article. Sur téléphone, feuille qui monte du bas ; sur tablette
 * et borne, fenêtre centrée. Maquette validée le 20/11/2026.
 *
 * Deux façons d'ajouter :
 *   onAdd()        un article (borne, caisse) — comportement historique
 *   onAddQty(n)    choix de la quantité dans la fiche (espaces spectateur, bénévole, billetterie)
 * maxAdd   : combien on peut encore ajouter (stock, droits) ; 0 = bouton remplacé par la raison
 * sousTitre: remplace le prix (ex. « 1 repas » pour un bénévole)
 *
 * Utilisée dans : Borne.jsx, Debit.jsx, SoldePage.jsx, BenevoleCommander.jsx, CommandeSurPlace.jsx
 */
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Info, AlertTriangle, Minus, Plus } from 'lucide-react'
import { ALLERGENES_BY_CODE, labelAllergene } from '../utils/allergenes'
import s from './ArticleInfoModal.module.css'
import useRetourFerme from '../hooks/useRetourFerme'

const euros = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',') + ' €'

export default function ArticleInfoModal({ item, onClose, onAdd = null, onAddQty = null, qty = 0, maxAdd = Infinity, sousTitre = null, raisonBloque = 'Épuisé' }) {
  const [n, setN] = useState(1)
  // Retour du téléphone (24/11/2026) : ferme cette fenêtre au lieu de quitter l'écran
  useRetourFerme(!!item, onClose)
  useEffect(() => { setN(1) }, [item?.id])
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!item) return null

  const photoSrc = item.photoUrl || item.image
  const allergenes = Array.isArray(item.allergenes) ? item.allergenes : []
  const allergenesCustom = Array.isArray(item.allergenesCustom) ? item.allergenesCustom : []
  const hasAllergenes = allergenes.length > 0 || allergenesCustom.length > 0
  const hasDescription = item.description && item.description.trim().length > 0
  const placeholderHue = (item.nom || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const max = Math.max(0, maxAdd)
  const qte = Math.min(n, Math.max(1, max))

  return createPortal(
    <div className={s.overlay} onClick={onClose}>
      <div className={s.box} role="dialog" aria-modal="true" aria-label={item.nom} onClick={e => e.stopPropagation()}>
        <div className={s.hero}>
          {photoSrc ? (
            <>
              <div className={s.heroBlur} style={{ backgroundImage: `url(${photoSrc})` }} />
              <img className={s.heroImg} src={photoSrc} alt={item.nom} />
            </>
          ) : (
            <div className={s.heroPlaceholder}
              style={{ background: `linear-gradient(135deg, hsl(${placeholderHue},35%,55%), hsl(${(placeholderHue + 30) % 360},45%,30%))` }}>
              <span>{item.nom?.[0]?.toUpperCase() || '?'}</span>
            </div>
          )}
          {item.photoGenerated && photoSrc && <span className={s.nonContract}>Photo non contractuelle</span>}
          <button type="button" className={s.close} onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className={s.body}>
          <div className={s.titleRow}>
            <h2 className={s.title}>{item.nom}</h2>
            <span className={s.price}>{sousTitre ?? euros(item.prix)}</span>
          </div>

          {hasDescription && (
            <div className={s.block}>
              <div className={s.label}><Info size={11} aria-hidden="true" /> Composition</div>
              <div className={s.desc}>{item.description}</div>
            </div>
          )}

          {hasAllergenes && (
            <div className={s.block}>
              <div className={s.label}><AlertTriangle size={11} aria-hidden="true" /> Allergènes</div>
              <div className={s.tags}>
                {allergenes.map(code => {
                  const a = ALLERGENES_BY_CODE[code]
                  return <span key={code} className={s.tag}>{a?.emoji && <span aria-hidden="true">{a.emoji}</span>}{labelAllergene(code)}</span>
                })}
                {allergenesCustom.map((label, i) => <span key={`c-${i}`} className={s.tag}>{label}</span>)}
              </div>
            </div>
          )}

          {!hasDescription && !hasAllergenes && (
            <div className={s.empty}>Aucune information de composition renseignée.</div>
          )}

          {onAddQty && (
            max > 0 ? (
              <div className={s.addRow}>
                <button type="button" className={s.step} onClick={() => setN(Math.max(1, qte - 1))} disabled={qte <= 1} aria-label="Un de moins"><Minus size={16} /></button>
                <b className={s.qty} aria-live="polite">{qte}</b>
                <button type="button" className={s.step} onClick={() => setN(Math.min(max, qte + 1))} disabled={qte >= max} aria-label="Un de plus"><Plus size={16} /></button>
                <button type="button" className={s.add} onClick={() => { onAddQty(qte); onClose() }}>
                  Ajouter{sousTitre ? '' : ` · ${euros((item.prix || 0) * qte)}`}
                </button>
              </div>
            ) : (
              <div className={s.blocked}>{raisonBloque}</div>
            )
          )}
          {qty > 0 && onAddQty && <p className={s.inCart}>Déjà {qty} dans le panier</p>}

          {onAdd && !onAddQty && (
            <button type="button" className={s.add} style={{ width: '100%', marginTop: 12 }} onClick={() => { onAdd(); onClose() }}>
              {qty > 0 ? `Ajouter encore — déjà ${qty} dans le panier` : 'Ajouter au panier'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
