/**
 * components/ArticleInfoModal.jsx
 *
 * Modale qui s'ouvre au clic sur une carte article. Affiche :
 *   - L'image en grand (ou placeholder coloré)
 *   - Le nom et le prix
 *   - La description / composition libre
 *   - La liste des allergènes (UE + custom)
 *
 * Style "fiche produit" type Deliveroo/Uber Eats. Affichage en lecture seule
 * (l'ajout au panier reste sur les boutons de la carte parente).
 *
 * Utilisée dans : Borne.jsx, PrendreCommande.jsx, Debit.jsx, Carte.jsx
 */
import React from 'react'
import { createPortal } from 'react-dom'
import { X, Info, AlertTriangle } from 'lucide-react'
import { ALLERGENES_BY_CODE, labelAllergene } from '../utils/allergenes'

export default function ArticleInfoModal({ item, onClose, onAdd = null, qty = 0 }) {
  if (!item) return null

  // Compatibilité : photoUrl (nouveau champ Lot Image 1) ou image (legacy)
  const photoSrc = item.photoUrl || item.image
  const allergenes = Array.isArray(item.allergenes) ? item.allergenes : []
  const allergenesCustom = Array.isArray(item.allergenesCustom) ? item.allergenesCustom : []
  const hasAllergenes = allergenes.length > 0 || allergenesCustom.length > 0
  const hasDescription = item.description && item.description.trim().length > 0
  const placeholderHue = (item.nom || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 440,
          maxHeight: 'calc(100vh - 32px)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxSizing: 'border-box',
        }}>
        {/* Image hero + bouton close */}
        <div style={{ position: 'relative', flexShrink: 0, aspectRatio: '1/1', background: '#1a1a1a', overflow: 'hidden' }}>
          {photoSrc ? (
            <>
              {/* Fond flouté pour combler les bandes laissées par contain */}
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `url(${photoSrc})`,
                backgroundSize: 'cover', backgroundPosition: 'center',
                filter: 'blur(22px) brightness(0.7)',
                transform: 'scale(1.2)',
              }}/>
              {/* Photo principale entière, centrée */}
              <img src={photoSrc} alt={item.nom}
                style={{
                  position: 'absolute', inset: 0,
                  margin: 'auto',
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain', display: 'block',
                }}/>
            </>
          ) : (
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(135deg, hsl(${placeholderHue},35%,55%), hsl(${(placeholderHue+30)%360},45%,30%))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 72, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
                {item.nom?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.95)', border: 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
            }}>
            <X size={18}/>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div style={{ padding: '16px 20px 20px', overflowY: 'auto', flex: 1 }}>
          <h2 style={{
            margin: '0 0 4px', fontSize: 18, fontWeight: 600,
            color: 'var(--text, #1a1a1a)',
          }}>
            {item.nom}
          </h2>
          <div style={{
            fontSize: 16, fontWeight: 600,
            color: 'var(--green-dark, #0F6E56)',
            marginBottom: 16,
          }}>
            {((item.prix || 0) / 100).toFixed(2).replace('.', ',')} €
          </div>

          {/* Description / composition */}
          {hasDescription && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 500,
                color: 'var(--muted, #64748b)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Info size={11}/> Composition
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.5,
                color: 'var(--text, #1a1a1a)',
                whiteSpace: 'pre-wrap',
              }}>
                {item.description}
              </div>
            </div>
          )}

          {/* Allergènes */}
          {hasAllergenes && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 500,
                color: 'var(--muted, #64748b)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <AlertTriangle size={11}/> Allergènes
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allergenes.map(code => {
                  const a = ALLERGENES_BY_CODE[code]
                  return (
                    <span key={code} style={tagStyle}>
                      {a?.emoji && <span style={{ marginRight: 4 }}>{a.emoji}</span>}
                      {labelAllergene(code)}
                    </span>
                  )
                })}
                {allergenesCustom.map((label, i) => (
                  <span key={`c-${i}`} style={tagStyle}>{label}</span>
                ))}
              </div>
            </div>
          )}

          {/* Pas d'info disponible */}
          {!hasDescription && !hasAllergenes && (
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg2, #f8f9fa)',
              borderRadius: 8,
              fontSize: 12, color: 'var(--muted, #64748b)',
              fontStyle: 'italic', textAlign: 'center',
            }}>
              Aucune information de composition renseignée.
            </div>
          )}

          {/* Bouton d'ajout (facultatif, selon contexte d'utilisation) */}
          {onAdd && (
            <button
              onClick={() => { onAdd(); onClose() }}
              style={{
                width: '100%', marginTop: 12, padding: '12px 16px',
                background: 'var(--green-dark, #0F6E56)', color: '#fff',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              {qty > 0 ? `Ajouter encore — déjà ${qty} dans le panier` : 'Ajouter au panier'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

const tagStyle = {
  display: 'inline-flex', alignItems: 'center',
  fontSize: 11, padding: '4px 10px', borderRadius: 12,
  background: 'var(--amber-light, #FAEEDA)',
  color: 'var(--amber-dark, #854F0B)',
  whiteSpace: 'nowrap',
}
