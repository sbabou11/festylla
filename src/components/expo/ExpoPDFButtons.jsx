/**
 * components/expo/ExpoPDFButtons.jsx
 *
 * Bloc avec 2 boutons : Facture PDF + Décharge signée.
 * - Facture PDF : génération directe (jsPDF.save), pas de signature.
 * - Décharge   : ouvre DechargeModal pour wizard 3 étapes avec signature électronique.
 *
 * Charge à l'init les templates de décharge + identité visuelle depuis settings.
 */

import React, { useState, useEffect } from 'react'
import { FileText, Receipt, AlertCircle, ShieldCheck } from 'lucide-react'
import { generateInvoicePDF } from '../../utils/expoPDF'
import { getSettings, getInvoiceTemplate } from '../../firebase/service'
import useEventStore from '../../store/useEventStore'
import DechargeModal from './DechargeModal'
import InvoiceTemplatePicker, {
  getRememberedTemplateId, clearRememberedTemplateId,
} from './InvoiceTemplatePicker'

export default function ExpoPDFButtons({ expo, organisateur }) {
  const { currentEventId } = useEventStore()
  const [err, setErr] = useState('')

  // États pour la signature électronique (chargés depuis settings)
  const [showDechargeModal, setShowDechargeModal] = useState(false)
  const [templates, setTemplates]       = useState([])
  const [logoDataUrl, setLogoDataUrl]   = useState('')
  const [brandColor, setBrandColor]     = useState('#1a6b7a')
  const [settingsReady, setSettingsReady] = useState(false)

  // Templates de facture personnalisés (Lot B3)
  const [invoiceTemplates, setInvoiceTemplates] = useState([])
  const [showPicker, setShowPicker]             = useState(false)

  // Chargement settings au montage
  useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(s => {
      if (Array.isArray(s?.dechargeTemplates)) setTemplates(s.dechargeTemplates)
      if (Array.isArray(s?.invoiceTemplates))  setInvoiceTemplates(s.invoiceTemplates)
      if (typeof s?.logoDataUrl === 'string')   setLogoDataUrl(s.logoDataUrl)
      if (typeof s?.brandColor === 'string')    setBrandColor(s.brandColor)
      setSettingsReady(true)
    }).catch(() => setSettingsReady(true))
  }, [currentEventId])

  // L'organisateur doit au minimum avoir une raison sociale
  const orgConfigured = !!(organisateur && organisateur.raisonSociale)

  /**
   * Génère la facture avec un template précis (ou le défaut si null).
   * @param {string|null} templateId - id du template choisi, '__default__' pour standard
   */
  const generateWithTemplate = async (templateId) => {
    setErr('')
    try {
      let template = null
      if (templateId && templateId !== '__default__') {
        template = await getInvoiceTemplate(templateId, currentEventId)
      }
      await generateInvoicePDF(expo, organisateur || {}, currentEventId, template)
    } catch (e) {
      setErr('Erreur génération facture : ' + e.message)
    }
  }

  /**
   * Au clic "Facture PDF", logique de sélection (ordre de priorité) :
   *  1. Préférence localStorage ("rappeler ce choix") si le template existe encore
   *  2. Si '__default__' en pref → génère avec standard sans demander
   *  3. Sinon, template marqué "défaut" en base → l'utilise
   *  4. Sinon, 0 template personnalisé → utilise le standard sans demander
   *  5. Sinon (plusieurs templates, aucun défaut, pas de pref) → ouvre le picker
   */
  const handleInvoice = () => {
    setErr('')

    // 1. Préférence locale (par appareil)
    const remembered = getRememberedTemplateId()
    if (remembered === '__default__') {
      generateWithTemplate(null)
      return
    }
    if (remembered) {
      // Vérifie que le template existe toujours (sinon on a une pref orpheline)
      const stillExists = invoiceTemplates.some(t => t.id === remembered)
      if (stillExists) {
        generateWithTemplate(remembered)
        return
      } else {
        // Template supprimé entre-temps : nettoie la pref et continue la logique
        clearRememberedTemplateId()
      }
    }

    // 2/3/4 : pas de pref locale utilisable, on retombe sur la logique standard
    if (invoiceTemplates.length === 0) {
      generateWithTemplate(null)
      return
    }
    const defaultTpl = invoiceTemplates.find(t => t.isDefault)
    if (defaultTpl) {
      generateWithTemplate(defaultTpl.id)
      return
    }
    // 5. Modale de sélection
    setShowPicker(true)
  }

  return (
    <div style={{
      background: 'var(--bg)',
      border: '0.5px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10,
      }}>
        Documents PDF
      </div>

      {!orgConfigured && (
        <div style={{
          padding: '8px 10px', marginBottom: 10,
          background: 'var(--gold-light)', color: 'var(--gold-dark)',
          border: '0.5px solid var(--gold)', borderRadius: 6,
          fontSize: 11, display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }}/>
          <span>
            Renseignez les <strong>coordonnées de l'organisateur</strong> dans Paramètres
            pour activer la génération PDF.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button onClick={handleInvoice} disabled={!orgConfigured}
          style={{
            padding: '12px 8px',
            background: orgConfigured ? 'var(--red-light)' : 'var(--bg2)',
            color: orgConfigured ? 'var(--red-dark)' : 'var(--muted)',
            border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 700,
            cursor: orgConfigured ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <FileText size={18}/>
          Facture PDF
        </button>
        <button onClick={() => setShowDechargeModal(true)} disabled={!orgConfigured || !settingsReady}
          style={{
            padding: '12px 8px',
            background: orgConfigured ? 'var(--gold-light)' : 'var(--bg2)',
            color: orgConfigured ? 'var(--gold-dark)' : 'var(--muted)',
            border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 700,
            cursor: (orgConfigured && settingsReady) ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            WebkitTapHighlightColor: 'transparent',
            position: 'relative',
          }}>
          <ShieldCheck size={18}/>
          Décharge signée
          <span style={{
            position: 'absolute', top: 4, right: 4,
            background: 'var(--green-dark)', color: '#fff',
            padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 700,
            letterSpacing: '0.05em',
          }}>NEW</span>
        </button>
      </div>

      {err && (
        <div style={{
          padding: '8px 10px', marginTop: 8,
          background: 'var(--red-light)', color: 'var(--red-dark)',
          borderRadius: 6, fontSize: 11,
        }}>{err}</div>
      )}

      {/* Modale de signature électronique */}
      {showDechargeModal && (
        <DechargeModal
          expo={expo}
          organisateur={organisateur || {}}
          templates={templates}
          logoDataUrl={logoDataUrl}
          brandColor={brandColor}
          eventId={currentEventId}
          onClose={() => setShowDechargeModal(false)}
          onSaved={() => { /* État rechargé via Firestore listener */ }}
        />
      )}

      {/* Modale de sélection de template facture (Lot B3) */}
      {showPicker && (
        <InvoiceTemplatePicker
          templates={invoiceTemplates}
          onChoose={(templateId) => {
            setShowPicker(false)
            generateWithTemplate(templateId)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
