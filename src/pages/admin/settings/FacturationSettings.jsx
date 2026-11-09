/**
 * pages/admin/settings/FacturationSettings.jsx
 * Réglages de l'événement pour les exposants et la facturation : thématiques,
 * coordonnées de l'organisateur, identité visuelle des PDF, TVA, templates de
 * décharge et de facture. Tout est lu et enregistré dans events/{id}/settings/global.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Building2, Check, Copy, Download, FileText, Palette, Pencil, Plus, Receipt, Save, Star, Tag, Trash2, Upload } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Button, Card, Dialog, Field, toast } from '../../../ui'
import useAppStore from '../../../store/useAppStore'
import { friendlyError } from '../../../utils/errors'
import {
  getSettings, saveSettings, saveDechargeTemplate, deleteDechargeTemplate,
  saveInvoiceTemplate, deleteInvoiceTemplate, duplicateInvoiceTemplate, importInvoiceTemplate,
} from '../../../firebase/service'
import {
  getRememberedTemplateId, clearRememberedTemplateId,
} from '../../../components/expo/InvoiceTemplatePicker'
import s from './settings.module.css'

const cardTitle = (Icon, label) => <span className={s.cardTitle}><Icon size={16}/>{label}</span>

// Champ texte des coordonnées de l'organisateur
function OrgInput({ label, value, onChange, placeholder }) {
  return (
    <label className={s.field}>
      <span className={s.label}>{label}</span>
      <input type="text" className={s.input} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>
    </label>
  )
}

export default function FacturationSettings({ currentEventId, onNavigate }) {
  // Thématiques d'exposition prédéfinies : [{ id, label, tarif (centimes) }]
  // Coordonnées de l'organisateur : pour génération factures/décharges PDF
  const [expoThematiques, setExpoThematiques] = useState([])
  const [organisateur, setOrganisateur] = useState({
    raisonSociale: '', adresse: '', codePostal: '', ville: '',
    pays: 'France', siret: '', tva: '',
    iban: '', bic: '', banque: '',
    email: '', telephone: '', siteWeb: '',
  })
  const [expoSaved, setExpoSaved] = useState(false)
  const [orgSaved, setOrgSaved] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // Identité visuelle (logo + couleur principale) pour les PDF.
  // logoDataUrl : base64 PNG/JPEG (stocké directement dans settings, pas Storage,
  // car limité à ~200 Ko après compression côté navigateur ; suffit pour un logo de PDF).
  const [logoDataUrl, setLogoDataUrl] = useState('')
  const [brandColor, setBrandColor]   = useState('#1a6b7a')
  const [identiteVisSaved, setIdentiteVisSaved] = useState(false)

  // Templates de décharge : texte réutilisable (intro, mentions, pied),
  // éditable ici et persisté dans settings.dechargeTemplates.
  const [templates, setTemplates] = useState([])
  const [editingTpl, setEditingTpl] = useState(null) // template en cours d'édition (objet ou null)
  const [tplSaved, setTplSaved]   = useState(false)
  const [tplTried, setTplTried]   = useState(false)

  // Templates de facture personnalisés, créés depuis l'éditeur visuel.
  const [invoiceTemplates, setInvoiceTemplates] = useState([])

  // Configuration TVA au niveau de l'événement :
  //  - tvaActive : si false, aucun calcul TVA, mention 293 B affichée
  //  - tvaDefaultTaux : taux par défaut appliqué aux lignes sans override
  //  - tvaMentionExoneration : texte affiché en bas si pas de TVA
  const [tvaActive, setTvaActive]                 = useState(false)
  const [tvaDefaultTaux, setTvaDefaultTaux]       = useState(20)
  const [tvaMentionExoneration, setTvaMentionExoneration] = useState('TVA non applicable, art. 293 B du CGI')
  const [tvaSaved, setTvaSaved]                   = useState(false)

  // Confirmation partagée par les suppressions : { title, text, action }
  const [pendingConfirm, setPendingConfirm] = useState(null)

  // Charge les settings de l'événement au montage (ou changement d'event)
  useEffect(() => {
    let cancelled = false
    if (!currentEventId) { setSettingsLoaded(true); return }
    getSettings(currentEventId).then(cfg => {
      if (cancelled) return
      if (Array.isArray(cfg?.expoThematiques)) setExpoThematiques(cfg.expoThematiques)
      if (cfg?.organisateur && typeof cfg.organisateur === 'object') {
        setOrganisateur(prev => ({ ...prev, ...cfg.organisateur }))
      }
      if (typeof cfg?.logoDataUrl === 'string') setLogoDataUrl(cfg.logoDataUrl)
      if (typeof cfg?.brandColor === 'string')  setBrandColor(cfg.brandColor)
      if (Array.isArray(cfg?.dechargeTemplates)) setTemplates(cfg.dechargeTemplates)
      if (Array.isArray(cfg?.invoiceTemplates)) setInvoiceTemplates(cfg.invoiceTemplates)
      if (typeof cfg?.tvaActive === 'boolean')         setTvaActive(cfg.tvaActive)
      if (Number.isFinite(Number(cfg?.tvaDefaultTaux))) setTvaDefaultTaux(Number(cfg.tvaDefaultTaux))
      if (typeof cfg?.tvaMentionExoneration === 'string') setTvaMentionExoneration(cfg.tvaMentionExoneration)
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
    return () => { cancelled = true }
  }, [currentEventId])

  const flash = (set) => { set(true); setTimeout(() => set(false), 1500) }

  // Enregistre dans settings ; true si l'écriture a réussi
  const persist = async (data, what) => {
    try {
      await saveSettings(data, currentEventId)
      return true
    } catch (e) {
      toast.error(friendlyError(e, what))
      return false
    }
  }

  // ─── Thématiques ─────────────────────────────────────────────────
  const addThematique = () => {
    setExpoThematiques(prev => [
      ...prev,
      { id: 'thm-' + Date.now().toString(36), label: '', tarif: 0 },
    ])
  }
  const updateThematique = (idx, key, value) => {
    setExpoThematiques(prev => prev.map((t, i) => i === idx ? { ...t, [key]: value } : t))
  }
  const removeThematique = (idx) => setPendingConfirm({
    title: 'Supprimer cette thématique ?',
    text: 'Les exposants déjà créés avec cette thématique conservent leur libellé mais ne pourront plus être réassociés.',
    action: () => setExpoThematiques(prev => prev.filter((_, i) => i !== idx)),
  })
  const saveThematiques = async () => {
    if (!currentEventId) return
    // Validation : ids uniques, label non vide
    const seen = new Set()
    for (const t of expoThematiques) {
      if (!t.label || !t.label.trim()) { toast.error('Toutes les thématiques doivent avoir un libellé.'); return }
      if (seen.has(t.id)) { toast.error('IDs en double détectés. Veuillez recharger la page.'); return }
      seen.add(t.id)
    }
    // Normalise : tarifs en entiers (centimes), labels trim
    const cleaned = expoThematiques.map(t => ({
      id: t.id,
      label: t.label.trim(),
      tarif: Math.round(Number(t.tarif) || 0),
    }))
    if (!(await persist({ expoThematiques: cleaned }, "Les thématiques n'ont pas été enregistrées."))) return
    setExpoThematiques(cleaned)
    flash(setExpoSaved)
  }

  // ─── Organisateur ────────────────────────────────────────────────
  const saveOrganisateur = async () => {
    if (!currentEventId) return
    // Trim toutes les valeurs string
    const cleaned = Object.fromEntries(
      Object.entries(organisateur).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    )
    if (!(await persist({ organisateur: cleaned }, "Les coordonnées n'ont pas été enregistrées."))) return
    setOrganisateur(cleaned)
    flash(setOrgSaved)
  }
  const orgField = (key) => ({
    value: organisateur[key],
    onChange: v => setOrganisateur(o => ({ ...o, [key]: v })),
  })

  // ─── Identité visuelle : upload logo + couleur principale ────────
  // Le logo est lu côté navigateur, redimensionné si nécessaire pour limiter la taille,
  // puis converti en base64 pour stockage dans settings (lecture instantanée par les PDF).
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\//.test(file.type)) { toast.error('Veuillez sélectionner une image'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image trop volumineuse (max 2 Mo)'); return }

    const reader = new FileReader()
    reader.onload = (ev) => {
      // Redimensionnement via canvas : largeur max 400px (suffisant pour PDF, économise la place)
      const img = new Image()
      img.onload = () => {
        const MAX_W = 400
        const ratio = Math.min(1, MAX_W / img.width)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // Format PNG pour préserver la transparence du logo
        const dataUrl = canvas.toDataURL('image/png')
        setLogoDataUrl(dataUrl)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    // Reset le champ pour pouvoir uploader le même fichier
    e.target.value = ''
  }
  const removeLogo = () => setLogoDataUrl('')

  const saveIdentiteVisuelle = async () => {
    if (!currentEventId) return
    if (!(await persist({ logoDataUrl, brandColor }, "L'identité visuelle n'a pas été enregistrée."))) return
    flash(setIdentiteVisSaved)
  }

  // ─── TVA ─────────────────────────────────────────────────────────
  const saveTvaConfig = async () => {
    if (!currentEventId) return
    // Validation : si TVA active, le taux par défaut doit être ≥ 0
    const taux = Number(tvaDefaultTaux)
    if (tvaActive && (!Number.isFinite(taux) || taux < 0)) {
      toast.error('Le taux de TVA par défaut doit être un nombre positif ou nul.')
      return
    }
    const ok = await persist({
      tvaActive,
      tvaDefaultTaux: Number.isFinite(taux) ? taux : 20,
      tvaMentionExoneration: (tvaMentionExoneration || '').trim(),
    }, "La configuration TVA n'a pas été enregistrée.")
    if (ok) flash(setTvaSaved)
  }

  // ─── Templates de décharge : CRUD ─────────────────────────────────
  const addTemplate = () => {
    setTplTried(false)
    setEditingTpl({
      id: null,
      nom: '',
      intro: `Je soussigné(e), représentant de l'organisateur,
reconnais avoir reçu de :

{{exposant}}

la somme de {{montant}}
({{montantLettres}})

au titre des frais d'exposition,
pour un montant total facturé de {{montantTotal}}.`,
      mentions: '',
      piedDePage: 'Document généré électroniquement. Conserver pour vos archives.',
    })
  }
  const editTemplate = (tpl) => { setTplTried(false); setEditingTpl({ ...tpl }) }

  const saveTemplate = async () => {
    if (!editingTpl) return
    if (!editingTpl.nom.trim()) { setTplTried(true); return }
    try {
      const saved = await saveDechargeTemplate(editingTpl, currentEventId)
      // Recharger la liste localement
      setTemplates(prev => {
        const idx = prev.findIndex(t => t.id === saved.id)
        return idx >= 0
          ? [...prev.slice(0, idx), saved, ...prev.slice(idx + 1)]
          : [...prev, saved]
      })
      setEditingTpl(null)
      flash(setTplSaved)
    } catch (e) { toast.error(friendlyError(e, "Le template n'a pas été enregistré.")) }
  }

  const removeTemplate = (id) => setPendingConfirm({
    title: 'Supprimer ce template ?',
    text: 'Le modèle de décharge sera retiré de la liste.',
    action: async () => {
      try {
        await deleteDechargeTemplate(id, currentEventId)
        setTemplates(prev => prev.filter(t => t.id !== id))
      } catch (e) { toast.error(friendlyError(e, "Le template n'a pas été supprimé.")) }
    },
  })

  // Préférence locale de template facture : lue au montage + après chaque oubli.
  const [rememberedTplId, setRememberedTplId] = useState(() => getRememberedTemplateId())
  const handleForgetTplPreference = () => {
    clearRememberedTemplateId()
    setRememberedTplId(null)
  }

  // ─── Templates de facture : actions ──────────────────────────────
  // Éditer = navigation vers l'éditeur visuel avec le templateId en cours
  const editInvoiceTemplate = (id) => {
    useAppStore.getState().setEditingTemplateId(id)
    onNavigate?.('editeur-template')
  }
  const newInvoiceTemplate = () => {
    useAppStore.getState().setEditingTemplateId('new')
    onNavigate?.('editeur-template')
  }
  const duplicateInvoiceTpl = async (id) => {
    try {
      const copy = await duplicateInvoiceTemplate(id, currentEventId)
      setInvoiceTemplates(prev => [...prev, copy])
    } catch (e) { toast.error(friendlyError(e, "Le template n'a pas été dupliqué.")) }
  }
  const removeInvoiceTpl = (id) => setPendingConfirm({
    title: 'Supprimer ce template de facture ?',
    text: 'Cette action est irréversible.',
    action: async () => {
      try {
        await deleteInvoiceTemplate(id, currentEventId)
        setInvoiceTemplates(prev => prev.filter(t => t.id !== id))
      } catch (e) { toast.error(friendlyError(e, "Le template n'a pas été supprimé.")) }
    },
  })
  // Définir comme défaut : appelle save avec isDefault=true (l'endpoint retire le flag des autres)
  const setDefaultInvoiceTpl = async (id) => {
    try {
      const target = invoiceTemplates.find(t => t.id === id)
      if (!target) return
      const updated = await saveInvoiceTemplate({ ...target, isDefault: true }, currentEventId)
      // Mise à jour locale : retire défaut des autres, applique sur celui-ci
      setInvoiceTemplates(prev => prev.map(t =>
        t.id === id ? updated : { ...t, isDefault: false }
      ))
    } catch (e) { toast.error(friendlyError(e, "Le template n'a pas été défini par défaut.")) }
  }

  // ─── Export / Import de template (raffinement Lot B3) ────────────
  // Export : sérialise un template en JSON et déclenche un download navigateur.
  // Format de fichier : .yllatpl.json (identifiant simple pour reconnaissance).
  // Le fichier est enrichi avec :
  //   - métadonnées de version et provenance
  //   - schéma documenté (types d'éléments + variables disponibles)
  //   - section _documentation lisible par un humain
  // C'est un format propriétaire, mais auto-documenté pour qu'un développeur
  // tiers puisse l'utiliser sans la doc YllaCash.
  const exportInvoiceTpl = (tpl) => {
    try {
      const payload = {
        // ─── Métadonnées du format ───
        $schema: 'https://yllacash.local/schemas/invoice-template-v1.json',
        __format: 'yllatpl-v1',
        __formatVersion: 1,
        __generator: 'YllaCash v7.2',
        __exportedAt: new Date().toISOString(),

        // ─── Documentation embarquée ───
        // Section lisible par un humain ou un dev qui découvre le fichier.
        // Ignorée par l'import (qui ne valide que nom + elements).
        _documentation: {
          description: "Template de mise en page pour la génération de factures PDF dans YllaCash. Format auto-documenté basé sur JSON.",
          unitSystem: "Toutes les positions et dimensions sont exprimées en MILLIMÈTRES (mm). Format A4 : 210 × 297 mm.",
          elementTypes: {
            text:      "Texte court sur 1 ligne. Props: content, fontSize, color, align, bold, italic.",
            paragraph: "Texte long multi-lignes avec wrap automatique. Props: content, fontSize, color, align, lineHeight.",
            field:     "Comme 'text' mais conçu pour contenir des variables {{...}} remplacées au rendu.",
            image:     "Image bitmap (PNG/JPG) stockée en base64 dans 'src'. Max 400px de large recommandé.",
            table:     "Tableau itérant sur les lignes de l'exposant. Props: columns[{label,field,width,align,isCurrency}], showTotal.",
            line:      "Trait horizontal. Props: color, strokeWidth.",
            rect:      "Rectangle plein ou bordé. Props: fillColor, borderColor, borderWidth.",
          },
          variables: {
            description: "Les éléments text/field/paragraph peuvent contenir des variables {{namespace.cle}} remplacées au rendu.",
            namespaces: {
              "exposant.*":     "Données de l'exposant (nom, raisonSociale, siret, tva, email, téléphone, adresse, codePostal, ville, adresseComplete, dirigeant)",
              "organisateur.*": "Données de l'organisateur depuis settings (raisonSociale, adresse, codePostal, ville, siret, tva, iban, bic, banque, email, téléphone, siteWeb, adresseComplete)",
              "facture.*":      "Métadonnées de la facture (numero auto-généré, date au format FR)",
              "total":          "Montant total TTC formaté en € (ex: '120,50 €')",
              "totalBrut":      "Montant total numérique sans symbole",
              "acompte":        "Acompte versé formaté en € (ou '—' si aucun)",
              "solde":          "Solde versé formaté en €",
              "paye":           "Total déjà payé (acompte + solde)",
              "restant":        "Restant dû",
            },
          },
          elementSchema: {
            // Structure type d'un élément (champs communs + spécifiques)
            common: { id: "string (unique)", type: "string (un des elementTypes)", x: "number (mm)", y: "number (mm)", w: "number (mm)", h: "number (mm)" },
            text_field: { content: "string", fontSize: "number (pt)", color: "string (hex)", align: "left|center|right", bold: "boolean", italic: "boolean" },
            paragraph: { content: "string", fontSize: "number", color: "string", align: "left|center|right", lineHeight: "number (1.0-3.0)" },
            image: { src: "string (data URL base64)" },
            table: { headerBg: "hex", headerColor: "hex", fontSize: "number", columns: "[{label, field, width, align, isCurrency}]", showTotal: "boolean" },
            line: { color: "hex", strokeWidth: "number (mm)" },
            rect: { fillColor: "hex", borderColor: "hex", borderWidth: "number (mm)" },
          },
          documentation: "https://github.com/YllaCash — voir le fichier src/utils/factureTemplate.js dans le code source pour le schéma de référence à jour.",
        },

        // ─── Données du template (la VRAIE charge utile) ───
        nom: tpl.nom,
        format: tpl.format || 'A4',
        elements: tpl.elements || [],
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeNom = (tpl.nom || 'template').replace(/[^\w]+/g, '_')
      a.download = `${safeNom}.yllatpl.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) { toast.error(friendlyError(e, "Le template n'a pas été exporté.")) }
  }

  // Import : ouvre un picker fichier, parse le JSON, valide, et sauvegarde.
  const importInvoiceTplRef = useRef(null)
  const handleImportInvoiceTpl = () => importInvoiceTplRef.current?.click()
  const onImportInvoiceTplFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      // Vérif minimaliste du format (sera revalidé côté service.js)
      if (!parsed.nom || !Array.isArray(parsed.elements)) {
        throw new Error('Le fichier ne ressemble pas à un template (champs nom/elements manquants)')
      }
      const imported = await importInvoiceTemplate(parsed, currentEventId)
      setInvoiceTemplates(prev => [...prev, imported])
      toast.success(`Template « ${imported.nom} » importé`)
    } catch (err) {
      toast.error(friendlyError(err, "Le template n'a pas été importé."))
    } finally {
      if (importInvoiceTplRef.current) importInvoiceTplRef.current.value = ''
    }
  }

  const confirmPending = () => {
    const action = pendingConfirm?.action
    setPendingConfirm(null)
    action?.()
  }

  return (
    <>
      {/* Thématiques d'exposition */}
      <Card title={cardTitle(Tag, "Thématiques d'exposition")}
        subtitle="Définissez les types de stands et leurs tarifs. Les exposants sélectionneront une thématique pour un calcul automatique du montant.">
        <div className={s.stack}>
          {!settingsLoaded ? (
            <p className={s.placeholder}>Chargement…</p>
          ) : expoThematiques.length === 0 ? (
            <p className={s.placeholder}>Aucune thématique définie. Ajoutez-en une ci-dessous.</p>
          ) : (
            <div className={s.rows}>
              {expoThematiques.map((t, i) => (
                <div key={t.id} className={clsx(s.thematique, 'yc-thematique-row')}>
                  <input
                    type="text"
                    className={s.input}
                    placeholder="Nom de la thématique"
                    aria-label="Nom de la thématique"
                    value={t.label}
                    onChange={e => updateThematique(i, 'label', e.target.value)}
                  />
                  <div className={s.amount}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={clsx(s.input, s.inputRight)}
                      placeholder="0.00"
                      aria-label="Tarif en euros"
                      /* Tarif saisi en EUROS pour l'utilisateur, stocké en CENTIMES dans Firestore. */
                      value={t.tarifEur ?? ((Number(t.tarif) || 0) / 100).toFixed(2)}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.,]/g, '')
                        updateThematique(i, 'tarifEur', v)
                        // Conversion immédiate en centimes pour le champ tarif (source de vérité)
                        const cts = Math.round((parseFloat(v.replace(',', '.')) || 0) * 100)
                        updateThematique(i, 'tarif', cts)
                      }}
                    />
                    <span className={s.hint}>€</span>
                  </div>
                  <Button variant="danger" size="sm" icon={Trash2} iconOnly
                    onClick={() => removeThematique(i)} title="Supprimer cette thématique" aria-label="Supprimer cette thématique"/>
                </div>
              ))}
            </div>
          )}

          <div className={s.actions}>
            <Button variant="secondary" icon={Plus} onClick={addThematique}>Ajouter une thématique</Button>
            <Button icon={expoSaved ? Check : Save} onClick={saveThematiques}>{expoSaved ? 'Sauvegardé' : 'Sauvegarder'}</Button>
          </div>
          <p className={s.hint}>
            Tarif en euros (ex : <code>250.00</code> pour 250 €). Calcul automatique appliqué lors de la création d'un exposant.
          </p>
        </div>
      </Card>

      {/* Coordonnées de l'organisateur */}
      <Card title={cardTitle(Building2, "Coordonnées de l'organisateur")}
        subtitle="Informations utilisées pour générer les factures et décharges (en-tête des PDF).">
        <div className={s.stack}>
          <OrgInput label="Raison sociale" placeholder="Ex : Association Festylla" {...orgField('raisonSociale')}/>
          <OrgInput label="Adresse" placeholder="N° et nom de rue" {...orgField('adresse')}/>
          <div className={s.gridCp}>
            <OrgInput label="CP" placeholder="75000" {...orgField('codePostal')}/>
            <OrgInput label="Ville" placeholder="Paris" {...orgField('ville')}/>
          </div>
          <div className={s.grid}>
            <OrgInput label="SIRET" placeholder="123 456 789 00012" {...orgField('siret')}/>
            <OrgInput label="N° TVA (optionnel)" placeholder="FR12345678901" {...orgField('tva')}/>
          </div>

          <div className={s.block}>
            <span className={s.label}>Coordonnées bancaires (facture)</span>
            <OrgInput label="Nom de la banque" placeholder="Crédit Agricole" {...orgField('banque')}/>
            <OrgInput label="IBAN" placeholder="FR76 1234 5678 9012 3456 7890 123" {...orgField('iban')}/>
            <OrgInput label="BIC / SWIFT" placeholder="AGRIFRPP123" {...orgField('bic')}/>
          </div>
          <div className={s.block}>
            <span className={s.label}>Contact</span>
            <OrgInput label="Email" placeholder="contact@festylla.com" {...orgField('email')}/>
            <OrgInput label="Téléphone" placeholder="01 23 45 67 89" {...orgField('telephone')}/>
            <OrgInput label="Site web (optionnel)" placeholder="https://festylla.com" {...orgField('siteWeb')}/>
          </div>

          <div className={s.actions}>
            <Button icon={orgSaved ? Check : Save} onClick={saveOrganisateur}>{orgSaved ? 'Sauvegardé' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Card>

      {/* Identité visuelle : logo + couleur, réutilisés dans tous les PDF */}
      <Card title={cardTitle(Palette, 'Identité visuelle des PDF')}
        subtitle="Logo et couleur appliqués automatiquement sur les factures et décharges générées.">
        <div className={s.stack}>
          <div className={s.field}>
            <span className={s.label}>Logo</span>
            {logoDataUrl ? (
              <div className={s.logoRow}>
                <div className={s.logoFrame}>
                  <img src={logoDataUrl} alt="Logo"/>
                </div>
                <Button variant="danger" size="sm" icon={Trash2} onClick={removeLogo}>Retirer</Button>
              </div>
            ) : (
              <label className={s.logoPick}>
                <FileText size={14} aria-hidden="true"/> Choisir une image…
                <input type="file" accept="image/*" onChange={handleLogoUpload}/>
              </label>
            )}
            <p className={s.hint}>PNG, JPG ou SVG. Redimensionné automatiquement à 400 px max. Max 2 Mo.</p>
          </div>

          <div className={s.field}>
            <span className={s.label}>Couleur principale</span>
            <div className={s.colorRow}>
              <input type="color" className={s.colorInput} aria-label="Couleur principale" value={brandColor} onChange={e => setBrandColor(e.target.value)}/>
              <input type="text" className={clsx(s.input, s.inputCode)} aria-label="Code couleur" value={brandColor}
                onChange={e => setBrandColor(e.target.value)} placeholder="#1a6b7a"/>
              <span className={s.colorSwatch} style={{ background: brandColor }}/>
            </div>
          </div>

          <div className={s.actions}>
            <Button icon={identiteVisSaved ? Check : Save} onClick={saveIdentiteVisuelle}>{identiteVisSaved ? 'Sauvegardé' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Card>

      {/* TVA */}
      <Card title={cardTitle(Receipt, 'TVA')}
        subtitle="Activez la TVA si votre structure y est assujettie. Le taux par défaut s'applique à toutes les lignes facturables, sauf override individuel. Si désactivée, la mention d'exonération apparaît automatiquement sur les factures.">
        <div className={s.stack}>
          <label className={s.toggle}>
            <input type="checkbox" checked={tvaActive} onChange={e => setTvaActive(e.target.checked)}/>
            <span>
              <span className={s.toggleTitle}>Cet événement utilise la TVA</span>
              <span className={s.hint}>
                {tvaActive
                  ? 'TVA activée : les factures séparent HT, TVA et TTC.'
                  : 'TVA désactivée : la mention "TVA non applicable" apparaît sur les factures.'}
              </span>
            </span>
          </label>

          {tvaActive && (
            <>
              <label className={s.field}>
                <span className={s.label}>Taux de TVA par défaut (%)</span>
                <input type="number" step="0.1" min="0" max="100" className={clsx(s.input, s.inputShort)}
                  value={tvaDefaultTaux}
                  onChange={e => setTvaDefaultTaux(parseFloat(e.target.value) || 0)}/>
                <span className={s.hint}>
                  Taux libre. Standards français : 0, 5.5, 10, 20.
                  Chaque ligne facturable peut avoir un taux différent.
                </span>
              </label>
              <p className={s.note}>
                <strong>Rappel :</strong> votre N° de TVA intracommunautaire{' '}
                <code>{organisateur.tva || '(non renseigné)'}</code>
                {' '}provient des coordonnées de l'organisateur ci-dessus. Mention légale obligatoire sur les factures avec TVA.
              </p>
            </>
          )}

          {!tvaActive && (
            <label className={s.field}>
              <span className={s.label}>Mention d'exonération affichée sur les factures</span>
              <input type="text" className={s.input} maxLength={120}
                value={tvaMentionExoneration}
                onChange={e => setTvaMentionExoneration(e.target.value)}/>
              <span className={s.hint}>Modifiez si vous relevez d'un autre régime d'exonération (ex : art. 261 du CGI pour associations).</span>
            </label>
          )}

          <div className={s.actions}>
            <Button icon={tvaSaved ? Check : Save} onClick={saveTvaConfig}>{tvaSaved ? 'Sauvegardé' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Card>

      {/* Templates de décharge : variables {{exposant}}, {{montant}}, {{montantLettres}}, {{montantTotal}} */}
      <Card className="yc-settings-wide" title={cardTitle(FileText, 'Templates de décharge')}>
        <div className={s.stack}>
          <p className={s.text}>
            Modèles de texte réutilisables pour les décharges signées. Variables disponibles dans le texte :
            {' '}<code>{'{{exposant}}'}</code>
            {' '}<code>{'{{montant}}'}</code>
            {' '}<code>{'{{montantLettres}}'}</code>
            {' '}<code>{'{{montantTotal}}'}</code>
          </p>

          {templates.length === 0 ? (
            <p className={s.placeholder}>Aucun template défini. Si vous n'en créez pas, le texte par défaut sera utilisé.</p>
          ) : (
            <div className={s.rows}>
              {templates.map(tpl => (
                <div key={tpl.id} className={s.tplRow}>
                  <FileText size={14} className={s.tplIcon} aria-hidden="true"/>
                  <div className={s.tplBody}>
                    <div className={s.tplName}>{tpl.nom}</div>
                    <div className={s.tplMeta}>
                      {tpl.intro?.slice(0, 80) || 'Sans intro'}{tpl.intro?.length > 80 ? '…' : ''}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" icon={Pencil} iconOnly onClick={() => editTemplate(tpl)} title="Modifier" aria-label={`Modifier ${tpl.nom}`}/>
                  <Button variant="danger" size="sm" icon={Trash2} iconOnly onClick={() => removeTemplate(tpl.id)} title="Supprimer" aria-label={`Supprimer ${tpl.nom}`}/>
                </div>
              ))}
            </div>
          )}

          {/* Éditeur inline (si template en cours d'édition) */}
          {editingTpl && (
            <div className={s.editor}>
              <div className={s.toggleTitle}>{editingTpl.id ? 'Modifier le template' : 'Nouveau template'}</div>
              <Field label={<span className={s.label}>Nom du template *</span>}
                error={editingTpl.nom.trim() ? null : 'Indique un nom pour ce template'} valid={!!editingTpl.nom.trim()} showError={tplTried}>
                <input type="text" value={editingTpl.nom} maxLength={80}
                  onChange={e => setEditingTpl(t => ({ ...t, nom: e.target.value }))}
                  placeholder="Ex : Décharge espèces — Édition 2025"/>
              </Field>
              <label className={s.field}>
                <span className={s.label}>Texte d'introduction</span>
                <textarea className={clsx(s.input, s.textarea)} rows={8} value={editingTpl.intro}
                  onChange={e => setEditingTpl(t => ({ ...t, intro: e.target.value }))}
                  placeholder="Texte principal de la décharge…"/>
              </label>
              <label className={s.field}>
                <span className={s.label}>Mentions complémentaires (optionnel)</span>
                <textarea className={clsx(s.input, s.textarea)} rows={3} value={editingTpl.mentions}
                  onChange={e => setEditingTpl(t => ({ ...t, mentions: e.target.value }))}
                  placeholder="Ex : Conformément à l'article…"/>
              </label>
              <label className={s.field}>
                <span className={s.label}>Pied de page</span>
                <input type="text" className={s.input} value={editingTpl.piedDePage} maxLength={200}
                  onChange={e => setEditingTpl(t => ({ ...t, piedDePage: e.target.value }))}
                  placeholder="Ex : Document généré électroniquement"/>
              </label>
              <div className={s.actions}>
                <Button variant="secondary" onClick={() => setEditingTpl(null)}>Annuler</Button>
                <Button icon={Save} onClick={saveTemplate}>Enregistrer</Button>
              </div>
            </div>
          )}

          {!editingTpl && (
            <div className={s.actions}>
              <Button variant="secondary" icon={Plus} onClick={addTemplate}>Nouveau template</Button>
              {tplSaved && <span className={s.saved}><Check size={14} aria-hidden="true"/> Template enregistré</span>}
            </div>
          )}
        </div>
      </Card>

      {/* Templates de facture : éditer, dupliquer, exporter, supprimer, définir par défaut */}
      <Card className="yc-settings-wide" title={cardTitle(FileText, 'Templates de facture')}>
        <div className={s.stack}>
          <p className={s.text}>
            Personnalisez la mise en page de vos factures via l'éditeur visuel
            drag-and-drop. Plusieurs templates peuvent coexister (facture standard, devis, relance…).
            Le template marqué <strong>défaut</strong> est utilisé automatiquement lors de la génération.
          </p>

          {invoiceTemplates.length === 0 ? (
            <p className={s.placeholder}>Aucun template personnalisé. La facture utilisera le template standard par défaut.</p>
          ) : (
            <div className={s.rows}>
              {invoiceTemplates.map(tpl => (
                <div key={tpl.id} className={clsx(s.tplRow, tpl.isDefault && s.tplDefault)}>
                  <FileText size={14} className={s.tplIcon} aria-hidden="true"/>
                  <div className={s.tplBody}>
                    <div className={s.tplTitle}>
                      <span className={s.tplName}>{tpl.nom}</span>
                      {tpl.isDefault && <Badge tone="success">Défaut</Badge>}
                    </div>
                    <div className={s.tplMeta}>
                      {tpl.elements?.length || 0} élément(s)
                      {tpl.updatedAt && ` · modifié le ${new Date(tpl.updatedAt).toLocaleDateString('fr-FR')}`}
                    </div>
                  </div>
                  {!tpl.isDefault && (
                    <Button variant="secondary" size="sm" icon={Star} iconOnly onClick={() => setDefaultInvoiceTpl(tpl.id)} title="Définir comme défaut" aria-label="Définir comme défaut"/>
                  )}
                  <Button variant="secondary" size="sm" icon={Pencil} iconOnly onClick={() => editInvoiceTemplate(tpl.id)} title="Modifier dans l'éditeur" aria-label="Modifier dans l'éditeur"/>
                  <Button variant="secondary" size="sm" icon={Copy} iconOnly onClick={() => duplicateInvoiceTpl(tpl.id)} title="Dupliquer" aria-label="Dupliquer"/>
                  <Button variant="secondary" size="sm" icon={Download} iconOnly onClick={() => exportInvoiceTpl(tpl)} title="Exporter (fichier .json)" aria-label="Exporter"/>
                  <Button variant="danger" size="sm" icon={Trash2} iconOnly onClick={() => removeInvoiceTpl(tpl.id)} title="Supprimer" aria-label="Supprimer"/>
                </div>
              ))}
            </div>
          )}

          <div className={s.actions}>
            <Button icon={Plus} onClick={newInvoiceTemplate}>Nouveau template</Button>
            <Button variant="secondary" icon={Upload} onClick={handleImportInvoiceTpl}>Importer un template</Button>
            {/* Input fichier caché pour le picker */}
            <input ref={importInvoiceTplRef} type="file" accept=".json,.yllatpl" onChange={onImportInvoiceTplFile} hidden/>
          </div>

          {/* Préférence locale mémorisée */}
          {rememberedTplId && (
            <div className={s.remembered}>
              <span>
                <strong>Préférence enregistrée sur cet appareil :</strong>{' '}
                {rememberedTplId === '__default__'
                  ? 'Template standard'
                  : (invoiceTemplates.find(t => t.id === rememberedTplId)?.nom
                     || <em>Template supprimé</em>)}
                <span className={s.rememberedSub}>Les factures sont générées avec ce template sans demander.</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleForgetTplPreference}>Oublier</Button>
            </div>
          )}

          <p className={s.hint}>
            Le nouveau template démarre comme une copie du template standard. Vous pouvez ensuite tout personnaliser dans l'éditeur visuel.
            {' '}Les fichiers exportés (.yllatpl.json) peuvent être réimportés ici ou partagés entre événements.
          </p>
        </div>
      </Card>

      <Dialog open={!!pendingConfirm} onClose={() => setPendingConfirm(null)} title={pendingConfirm?.title}
        footer={<>
          <Button variant="secondary" onClick={() => setPendingConfirm(null)}>Annuler</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmPending}>Supprimer</Button>
        </>}>
        <p className={s.text}>{pendingConfirm?.text}</p>
      </Dialog>
    </>
  )
}
