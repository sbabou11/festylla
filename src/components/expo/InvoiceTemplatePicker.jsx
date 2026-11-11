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
import { Lightbulb } from 'lucide-react'
import TemplatePreview from './TemplatePreview'
import { DEFAULT_INVOICE_TEMPLATE } from '../../utils/factureTemplate'
import { Badge, Button, Dialog } from '../../ui'
import s from './expo.module.css'

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
    <Dialog open title="Choisir un template" onClose={onClose} className={s.dialogWide}>
      <div className={s.stack}>
        <p className={s.muted}>Sélectionnez la mise en page pour cette facture.</p>

        {/* Liste avec miniatures */}
        <div className={s.tplList}>
          {allOptions.map(opt => (
            <button key={opt.id} type="button" onClick={() => handleChoose(opt.id)}
              className={opt.isDefault ? `${s.tplOption} ${s.tplDefault}` : s.tplOption}>
              {/* Miniature visuelle */}
              <TemplatePreview template={opt._previewTemplate} width={70}/>

              <span className={s.tplInfo}>
                <span className={s.tplName}>
                  <span className={s.ellipsis}>{opt.nom}</span>
                  {opt.isDefault && <Badge tone="success">Défaut</Badge>}
                  {opt.isStandard && <Badge tone="neutral">Standard</Badge>}
                </span>
                <span className={s.tplDesc}>{opt.description}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Bloc préférence mémorisée (si applicable) */}
        {currentPref && (
          <div className={s.prefBox}>
            <span className={s.grow}>
              <strong>Préférence mémorisée :</strong>{' '}
              {currentPref === '__default__'
                ? 'Template standard'
                : (templates.find(t => t.id === currentPref)?.nom || 'Template inconnu (supprimé)')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => {
                clearRememberedTemplateId()
                setCurrentPref(null)
              }}>
              Oublier
            </Button>
          </div>
        )}

        {/* Case à cocher "rappeler ce choix" */}
        <label className={s.check}>
          <input type="checkbox" checked={remember}
            onChange={e => setRemember(e.target.checked)} />
          <span>
            <span className={s.strong}>Utiliser ce template pour les prochaines factures</span>
            <span className={s.checkHint}>
              Préférence stockée sur cet appareil. Vous pourrez la modifier plus tard
              en revenant ici.
            </span>
          </span>
        </label>

        {templates.length === 0 && (
          <p className={s.tip}>
            <Lightbulb size={14} aria-hidden="true" className={s.noticeIcon} />
            <span>Créez vos propres templates depuis <strong>Paramètres → Templates de facture</strong>.</span>
          </p>
        )}
      </div>
    </Dialog>
  )
}
