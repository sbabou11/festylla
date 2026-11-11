/**
 * components/expo/ExpoPDFButtons.jsx
 *
 * Bloc avec 2 boutons : Facture PDF + Décharge signée.
 * - Facture PDF : génération directe (jsPDF.save), pas de signature.
 *   Bouton de progression (bande animée : une seule facture, durée inconnue).
 * - Décharge   : ouvre DechargeModal pour wizard 3 étapes avec signature électronique.
 *
 * Charge à l'init les templates de décharge + identité visuelle depuis settings.
 */

import React, { useState, useEffect, useRef } from 'react'
import { FileText, AlertCircle, ShieldCheck, FileDown } from 'lucide-react'
import { generateInvoicePDF } from '../../utils/expoPDF'
import { getSettings, getInvoiceTemplate } from '../../firebase/service'
import useEventStore from '../../store/useEventStore'
import { Button, Card, Badge, ProgressButton, toast } from '../../ui'
import { friendlyError } from '../../utils/errors'
import DechargeModal from './DechargeModal'
import InvoiceTemplatePicker, {
  getRememberedTemplateId, clearRememberedTemplateId,
} from './InvoiceTemplatePicker'
import s from './expo.module.css'

// Fermeture du sélecteur sans choix : le bouton revient au repos sans message
const PICKER_CLOSED = Symbol('picker-closed')

export default function ExpoPDFButtons({ expo, organisateur }) {
  const { currentEventId } = useEventStore()

  // États pour la signature électronique (chargés depuis settings)
  const [showDechargeModal, setShowDechargeModal] = useState(false)
  const [templates, setTemplates]       = useState([])
  const [logoDataUrl, setLogoDataUrl]   = useState('')
  const [brandColor, setBrandColor]     = useState('#1a6b7a')
  const [settingsReady, setSettingsReady] = useState(false)

  // Templates de facture personnalisés (Lot B3)
  const [invoiceTemplates, setInvoiceTemplates] = useState([])
  const [showPicker, setShowPicker]             = useState(false)
  // Choix en attente dans le sélecteur : { resolve, reject }
  const pickRef = useRef(null)

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
    let template = null
    if (templateId && templateId !== '__default__') {
      template = await getInvoiceTemplate(templateId, currentEventId)
    }
    await generateInvoicePDF(expo, organisateur || {}, currentEventId, template)
  }

  /**
   * Au clic "Facture PDF", logique de sélection (ordre de priorité) :
   *  1. Préférence localStorage ("rappeler ce choix") si le template existe encore
   *  2. Si '__default__' en pref → génère avec standard sans demander
   *  3. Sinon, template marqué "défaut" en base → l'utilise
   *  4. Sinon, 0 template personnalisé → utilise le standard sans demander
   *  5. Sinon (plusieurs templates, aucun défaut, pas de pref) → ouvre le picker
   * Retourne l'id à utiliser, ou undefined s'il faut demander.
   */
  const resolveTemplateId = () => {
    // 1. Préférence locale (par appareil)
    const remembered = getRememberedTemplateId()
    if (remembered === '__default__') return null
    if (remembered) {
      // Vérifie que le template existe toujours (sinon on a une pref orpheline)
      const stillExists = invoiceTemplates.some(t => t.id === remembered)
      if (stillExists) return remembered
      // Template supprimé entre-temps : nettoie la pref et continue la logique
      clearRememberedTemplateId()
    }

    // 2/3/4 : pas de pref locale utilisable, on retombe sur la logique standard
    if (invoiceTemplates.length === 0) return null
    const defaultTpl = invoiceTemplates.find(t => t.isDefault)
    if (defaultTpl) return defaultTpl.id
    // 5. Modale de sélection
    return undefined
  }

  const handleInvoice = async () => {
    let templateId = resolveTemplateId()
    if (templateId === undefined) {
      // Le bouton reste en cours pendant le choix, puis pendant la génération
      templateId = await new Promise((resolve, reject) => {
        pickRef.current = { resolve, reject }
        setShowPicker(true)
      })
    }
    try {
      await generateWithTemplate(templateId)
    } catch (e) {
      toast.error(friendlyError(e, "La facture n'a pas été générée."))
      throw e
    }
  }

  const closePicker = (templateId) => {
    setShowPicker(false)
    const pending = pickRef.current
    pickRef.current = null
    if (!pending) return
    if (templateId === undefined) pending.reject(PICKER_CLOSED)
    else pending.resolve(templateId)
  }

  return (
    <Card title={<span className={s.cardTitle}><FileDown size={16} aria-hidden="true" />Documents PDF</span>}>
      <div className={s.stack}>
        {!orgConfigured && (
          <div className={s.notice} role="note">
            <AlertCircle size={16} aria-hidden="true" className={s.noticeIcon} />
            <span>
              Renseignez les <strong>coordonnées de l'organisateur</strong> dans Paramètres
              pour activer la génération PDF.
            </span>
          </div>
        )}

        <div className={s.pdfGrid}>
          <ProgressButton
            variant="secondary"
            icon={FileText}
            onRun={handleInvoice}
            disabled={!orgConfigured}
            runningLabel="Facture en cours…"
            doneLabel="Facture prête"
          >
            Facture PDF
          </ProgressButton>
          <Button variant="secondary" icon={ShieldCheck}
            onClick={() => setShowDechargeModal(true)}
            disabled={!orgConfigured || !settingsReady}
            loading={orgConfigured && !settingsReady}>
            Décharge signée <Badge tone="success">Nouveau</Badge>
          </Button>
        </div>
      </div>

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
          onChoose={(templateId) => closePicker(templateId)}
          onClose={() => closePicker(undefined)}
        />
      )}
    </Card>
  )
}
