/**
 * components/expo/InvoiceTemplatePicker.jsx (Lot B3 + raffinements)
 *
 * Modale qui s'ouvre au clic "Facture PDF" pour choisir parmi plusieurs
 * templates. Affiche maintenant :
 *   - Une miniature visuelle de chaque template (silhouette A4)
 *   - Une case "Utiliser ce template pour les prochaines factures"
 *     (préférence par appareil/navigateur, localStorage)
 */

import React, { useState } from 'react'
import { X, FileText } from 'lucide-react'
import TemplatePreview from './TemplatePreview'
import { DEFAULT_INVOICE_TEMPLATE } from '../../utils/factureTemplate'

// Clé localStorage pour le template "rappelé"
const REMEMBER_KEY = 'yc-invoice-tpl-preference'

/**
 * Lit la préférence locale de template. Retourne null si non définie ou invalide.
 */
export function getRememberedTemplateId() {
  try { return localStorage.getItem(REMEMBER_KEY) || null }
  catch { return null }
}

/**
 * Efface la préférence locale (utilisé si le template a été supprimé entre-temps).
 */
export function clearRememberedTemplateId() {
  try { localStorage.removeItem(REMEMBER_KEY) } catch {}
}

export default function InvoiceTemplatePicker({ templates, onChoose, onClose }) {
  // Case à cocher "se rappeler de ce choix"
  const [remember, setRemember] = useState(false)
  // Préférence actuellement mémorisée (lue au montage, peut être effacée)
  const [currentPref, setCurrentPref] = useState(() => getRememberedTemplateId())

  // En tête de liste : le template standard (codé en dur).
  const allOptions = [
    {
      id: '__default__',
      nom: 'Template standard',
      description: 'Mise en page intégrée (en-tête, lignes, IBAN, pied)',
      isStandard: true,
      _previewTemplate: DEFAULT_INVOICE_TEMPLATE,
    },
    ...templates.map(t => ({
      ...t,
      description: `${t.elements?.length || 0} élément(s)`
        + (t.updatedAt ? ` · ${new Date(t.updatedAt).toLocaleDateString('fr-FR')}` : ''),
      _previewTemplate: t,
    })),
  ]

  // Au choix d'un template : sauvegarde la préférence si "remember" est coché
  const handleChoose = (templateId) => {
    if (remember) {
      try { localStorage.setItem(REMEMBER_KEY, templateId) } catch {}
    }
    onChoose(templateId)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 12, zIndex: 9999, backdropFilter: 'blur(2px)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, width: '100%',
        maxWidth: 580, maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div style={{
          padding: '14px 18px', borderBottom: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Choisir un template
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Sélectionnez la mise en page pour cette facture
            </div>
          </div>
          <button onClick={onClose}
            style={{
              width: 32, height: 32, padding: 0,
              background: 'transparent', color: 'var(--muted)',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={18}/>
          </button>
        </div>

        {/* Liste avec miniatures */}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allOptions.map(opt => (
            <button key={opt.id} onClick={() => handleChoose(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                background: 'var(--bg2)', color: 'var(--text)',
                border: opt.isDefault ? '0.5px solid var(--green-dark)' : '0.5px solid var(--border)',
                borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', width: '100%',
                transition: 'background .15s',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
              {/* Miniature visuelle */}
              <TemplatePreview template={opt._previewTemplate} width={70}/>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.nom}
                  </div>
                  {opt.isDefault && (
                    <span style={{
                      padding: '1px 5px', background: 'var(--green-dark)', color: '#fff',
                      fontSize: 8, fontWeight: 700, borderRadius: 3, letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}>DÉFAUT</span>
                  )}
                  {opt.isStandard && (
                    <span style={{
                      padding: '1px 5px', background: 'var(--bg2)', color: 'var(--muted)',
                      fontSize: 8, fontWeight: 700, borderRadius: 3, letterSpacing: '0.04em',
                      flexShrink: 0, border: '0.5px solid var(--border)',
                    }}>STANDARD</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Bloc préférence mémorisée (si applicable) */}
        {currentPref && (
          <div style={{
            margin: '0 12px 8px', padding: '8px 12px',
            background: 'var(--gold-light)', borderRadius: 8,
            border: '0.5px solid var(--gold)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, color: 'var(--gold-dark)',
          }}>
            <span style={{ flex: 1 }}>
              <strong>Préférence mémorisée :</strong>{' '}
              {currentPref === '__default__'
                ? 'Template standard'
                : (templates.find(t => t.id === currentPref)?.nom || 'Template inconnu (supprimé)')}
            </span>
            <button onClick={() => {
                clearRememberedTemplateId()
                setCurrentPref(null)
              }}
              style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 600,
                background: 'transparent', color: 'var(--gold-dark)',
                border: '0.5px solid var(--gold-dark)', borderRadius: 4,
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}>
              Oublier
            </button>
          </div>
        )}

        {/* Case à cocher "rappeler ce choix" */}
        <div style={{
          padding: '12px 18px', borderTop: '0.5px solid var(--border)',
          background: 'var(--bg2)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 12, color: 'var(--text)', cursor: 'pointer',
          }}>
            <input type="checkbox" checked={remember}
              onChange={e => setRemember(e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}/>
            <div>
              <div style={{ fontWeight: 600 }}>Utiliser ce template pour les prochaines factures</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                Préférence stockée sur cet appareil. Vous pourrez la modifier plus tard
                en revenant ici.
              </div>
            </div>
          </label>
        </div>

        {templates.length === 0 && (
          <div style={{
            padding: '0 18px 14px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic',
          }}>
            💡 Créez vos propres templates depuis <strong>Paramètres → Templates de facture</strong>.
          </div>
        )}
      </div>
    </div>
  )
}
