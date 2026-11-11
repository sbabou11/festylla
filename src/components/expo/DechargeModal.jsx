/**
 * components/expo/DechargeModal.jsx
 *
 * Modale wizard de génération de décharge signée.
 *
 * 3 étapes :
 *   1. Choix d'un template (ou aucun = texte par défaut) + personnalisation
 *      des champs (intro, mentions, pied de page) avec remplacement des variables.
 *   2. Capture des 2 signatures (organisateur + exposant) via SignatureCanvas.
 *   3. Génération du PDF, calcul du hash SHA-256, upload Storage + Firestore.
 *
 * À la fin, l'utilisateur récupère le PDF téléchargé localement ET l'historique
 * de l'exposant contient une entrée avec preuve (URL Storage + hash + signatures).
 *
 * « Suivant » reste cliquable : s'il manque quelque chose, les erreurs s'affichent
 * et le premier champ fautif prend le focus.
 */

import React, { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, FileText, PenLine, Check, AlertCircle, Eraser } from 'lucide-react'
import SignatureCanvas from '../SignatureCanvas'
import { generateDechargePDFSigned } from '../../utils/expoPDF'
import { saveSignedDecharge } from '../../firebase/service'
import { computeExpoPaye, computeExpoRestant, expoDisplayName } from '../../utils/expositions'
import useAuthStore from '../../store/useAuthStore'
import { Button, Dialog, Field, ProgressButton, focusFirstInvalid, toast } from '../../ui'
import { friendlyError } from '../../utils/errors'
import s from './expo.module.css'

export default function DechargeModal({
  expo, organisateur, templates = [], logoDataUrl = '', brandColor = '#1a6b7a',
  eventId, onClose, onSaved,
}) {
  const { user } = useAuthStore()
  const [step, setStep] = useState(1) // 1 = template, 2 = signatures, 3 = preview/done
  const [selectedTplId, setSelectedTplId] = useState('default')
  const [customText, setCustomText] = useState({
    intro: '', mentions: '', piedDePage: '',
  })
  const [signedByOrg, setSignedByOrg]       = useState(user?.displayName || user?.email || '')
  const [signedByExp, setSignedByExp]       = useState(expoDisplayName(expo))
  const [orgHasSig, setOrgHasSig]           = useState(false)
  const [expHasSig, setExpHasSig]           = useState(false)
  const [loading, setLoading]               = useState(false)
  const [progress, setProgress]             = useState('')
  const [tried, setTried]                   = useState({ 1: false, 2: false })

  const orgCanvasRef = useRef(null)
  const expCanvasRef = useRef(null)
  const bodyRef = useRef(null)

  // Synchroniser le texte avec le template sélectionné quand on change de choix
  useEffect(() => {
    if (selectedTplId === 'default') {
      // Texte par défaut (similaire à l'ancien comportement)
      setCustomText({
        intro: `Je soussigné(e), représentant de ${organisateur?.raisonSociale || 'l\'organisateur'},
reconnais avoir reçu de {{exposant}}

la somme de {{montant}}
({{montantLettres}})

au titre des frais d'exposition,
pour un montant total facturé de {{montantTotal}}.`,
        mentions: '',
        piedDePage: 'Document généré électroniquement et signé.',
      })
    } else {
      const tpl = templates.find(t => t.id === selectedTplId)
      if (tpl) {
        setCustomText({
          intro:      tpl.intro || '',
          mentions:   tpl.mentions || '',
          piedDePage: tpl.piedDePage || '',
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTplId])

  // Génère le hash SHA-256 d'un Blob (preuve d'intégrité du PDF)
  const sha256Hex = async (blob) => {
    const buffer = await blob.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Étape 3 : génère le PDF signé, upload, sauvegarde
  // Lève en cas d'échec : le bouton de progression revient au repos.
  const handleGenerate = async () => {
    const fail = (msg) => { toast.error(msg); throw new Error(msg) }
    if (!orgCanvasRef.current || !expCanvasRef.current) fail('Erreur interne : canvas signatures')
    const orgSig = orgCanvasRef.current.toDataURL()
    const expSig = expCanvasRef.current.toDataURL()
    if (!orgSig) fail('Signature de l\'organisateur requise')
    if (!expSig) fail('Signature de l\'exposant requise')
    if (!signedByOrg.trim()) fail('Nom du signataire organisateur requis')
    if (!signedByExp.trim()) fail('Nom du signataire exposant requis')

    setLoading(true)

    try {
      // Snapshot des paiements au moment de la signature (preuve)
      const paymentSnapshot = {
        montantTotal: expo.montantTotal,
        acompte: expo.acompte ? { ...expo.acompte } : null,
        solde:   expo.solde   ? { ...expo.solde }   : null,
        paye:    computeExpoPaye(expo),
        restant: computeExpoRestant(expo),
      }

      setProgress('Génération du PDF…')
      // Génère le PDF en tant que Blob (sans télécharger encore)
      const pdfBlob = await generateDechargePDFSigned({
        expo, organisateur, eventId,
        customText, templateId: selectedTplId !== 'default' ? selectedTplId : null,
        signatures: {
          organisateur: { dataUrl: orgSig, signedBy: signedByOrg.trim() },
          exposant:     { dataUrl: expSig, signedBy: signedByExp.trim() },
        },
        logoDataUrl, brandColor,
        signedAt: new Date(),
      })

      setProgress('Calcul du hash de signature…')
      const documentHash = await sha256Hex(pdfBlob)

      setProgress('Téléversement de la preuve…')
      const saved = await saveSignedDecharge(expo.id, {
        pdfBlob,
        templateId: selectedTplId !== 'default' ? selectedTplId : null,
        customText,
        paymentSnapshot,
        signatureOrganisateur: { dataUrl: orgSig, signedBy: signedByOrg.trim() },
        signatureExposant:     { dataUrl: expSig, signedBy: signedByExp.trim() },
        documentHash,
      }, eventId)

      // Téléchargement local pour l'utilisateur
      setProgress('Téléchargement…')
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement('a')
      a.href = url
      const safeNom = expoDisplayName(expo).replace(/[^\w]+/g, '_')
      a.download = `Decharge_signee_${safeNom}_${new Date().toISOString().slice(0,10)}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setProgress('')
      toast.success('Décharge signée enregistrée')
      onSaved && onSaved(saved)
      onClose()
    } catch (e) {
      setProgress('')
      setLoading(false)
      toast.error(friendlyError(e, "La décharge n'a pas été générée."))
      throw e
    }
  }

  // Validation pour passer à l'étape suivante (mêmes règles qu'avant)
  const introErr  = customText.intro.trim() ? null : "Indique le texte d'introduction"
  const orgNomErr = signedByOrg.trim() ? null : 'Indique le nom du signataire organisateur'
  const expNomErr = signedByExp.trim() ? null : 'Indique le nom du signataire exposant'
  const canGoStep2 = !introErr
  const canGenerate = orgHasSig && expHasSig && !orgNomErr && !expNomErr

  const next = () => {
    if ((step === 1 && !canGoStep2) || (step === 2 && !canGenerate)) {
      setTried(t => ({ ...t, [step]: true }))
      focusFirstInvalid(bodyRef.current)
      return
    }
    setStep(step + 1)
  }

  const footer = (
    <div className={s.dialogActions}>
      {step > 1 && (
        <Button variant="secondary" icon={ArrowLeft} disabled={loading} onClick={() => {
          // Retour à l'étape 1 : les canvas sont démontés, les signatures repartent de zéro
          if (step === 2) { setOrgHasSig(false); setExpHasSig(false) }
          setStep(step - 1)
        }}>
          Précédent
        </Button>
      )}
      <span className={s.grow}/>
      {step < 3 && (
        <Button onClick={next} disabled={loading}>
          Suivant <ArrowRight size={16} aria-hidden="true"/>
        </Button>
      )}
      {step === 3 && (
        <ProgressButton icon={FileText} onRun={handleGenerate}
          runningLabel={progress || 'Génération…'} doneLabel="Décharge prête">
          Générer la décharge
        </ProgressButton>
      )}
    </div>
  )

  const sigBlock = (label, nameValue, setName, nameErr, nameLabel, canvasRef, hasSig, setHasSig) => {
    const sigMissing = tried[2] && !hasSig
    return (
      <section className={s.sigSection}>
        <h3 className={s.sectionH}>{label}</h3>
        <Field label={nameLabel} error={nameErr} valid={!nameErr} showError={tried[2]}>
          <input type="text" value={nameValue} onChange={e => setName(e.target.value)} autoComplete="off"/>
        </Field>
        <div className={clsx(s.sigPad, sigMissing && s.sigPadInvalid)}
          tabIndex={-1} aria-invalid={sigMissing || undefined} aria-label={`Zone de signature : ${label}`}>
          <SignatureCanvas ref={canvasRef} onChange={setHasSig}/>
        </div>
        <div className={s.sigFoot}>
          {sigMissing
            ? <p className={s.fieldError}><AlertCircle size={13} aria-hidden="true"/> Signature requise</p>
            : <span/>}
          <Button variant="ghost" size="sm" icon={Eraser} onClick={() => canvasRef.current?.clear()}>Effacer</Button>
        </div>
      </section>
    )
  }

  return (
    <Dialog open title="Décharge signée" onClose={() => { if (!loading) onClose() }}
      footer={footer} className={s.dialogXL}>
      <div ref={bodyRef} className={s.stack}>
        <p className={s.muted}>Étape {step} sur 3 — {expoDisplayName(expo)}</p>

        {/* Progression des étapes */}
        <div className={s.steps} aria-hidden="true">
          {[1, 2, 3].map(n => <span key={n} className={clsx(s.stepBar, step >= n && s.stepOn)}/>)}
        </div>

        {/* Étape 1 — choix template + perso */}
        {step === 1 && (
          <>
            <Field label="Modèle">
              <select value={selectedTplId} onChange={e => setSelectedTplId(e.target.value)} disabled={loading}>
                <option value="default">Texte par défaut (sans template)</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.nom}</option>
                ))}
              </select>
            </Field>

            <Field label="Texte d'introduction" error={introErr} showError={tried[1]}
              hint={<>Variables remplacées automatiquement : <code>{'{{exposant}}'}</code>, <code>{'{{montant}}'}</code>, <code>{'{{montantLettres}}'}</code>, <code>{'{{montantTotal}}'}</code></>}>
              <textarea value={customText.intro} rows={8} className={s.tallText}
                onChange={e => setCustomText(c => ({ ...c, intro: e.target.value }))}/>
            </Field>

            <Field label="Mentions complémentaires (optionnel)">
              <textarea value={customText.mentions} rows={3}
                onChange={e => setCustomText(c => ({ ...c, mentions: e.target.value }))}/>
            </Field>

            <Field label="Pied de page">
              <input type="text" value={customText.piedDePage}
                onChange={e => setCustomText(c => ({ ...c, piedDePage: e.target.value }))}/>
            </Field>
          </>
        )}

        {/* Étape 2 — signatures. Reste montée (masquée) à l'étape 3 : les canvas doivent
            exister au moment de générer, sinon leurs refs sont vidées au démontage. */}
        {step >= 2 && (
          <div className={clsx(s.stack, step !== 2 && s.hidden)}>
            <div className={s.info}>
              <PenLine size={16} aria-hidden="true" className={s.noticeIcon}/>
              <span>
                Chaque signature sera intégrée au PDF avec un horodatage précis et un hash de
                vérification (SHA-256) pour garantir l'intégrité du document.
              </span>
            </div>
            {sigBlock("Signature de l'organisateur", signedByOrg, setSignedByOrg, orgNomErr,
              'Nom et fonction du signataire', orgCanvasRef, orgHasSig, setOrgHasSig)}
            {sigBlock("Signature de l'exposant", signedByExp, setSignedByExp, expNomErr,
              'Nom et qualité du signataire', expCanvasRef, expHasSig, setExpHasSig)}
          </div>
        )}

        {/* Étape 3 — confirmation */}
        {step === 3 && (
          <>
            <div className={s.ready}>
              <p className={s.readyTitle}><Check size={16} aria-hidden="true"/> Prêt à générer la décharge signée</p>
              <p className={s.muted}>
                Le PDF va être généré avec les deux signatures intégrées, horodaté, hashé
                pour preuve d'intégrité, puis sauvegardé dans le dossier de l'exposant et
                téléchargé sur votre appareil.
              </p>
            </div>

            <dl className={s.summary}>
              <SummaryRow label="Exposant" value={expoDisplayName(expo)}/>
              <SummaryRow label="Modèle" value={selectedTplId === 'default' ? 'Texte par défaut' : (templates.find(t => t.id === selectedTplId)?.nom || '—')}/>
              <SummaryRow label="Signataire organisateur" value={signedByOrg}/>
              <SummaryRow label="Signataire exposant" value={signedByExp}/>
              <SummaryRow label="Montant total" value={`${((expo.montantTotal || 0) / 100).toFixed(2)} €`}/>
              <SummaryRow label="Déjà payé" value={`${(computeExpoPaye(expo) / 100).toFixed(2)} €`}/>
            </dl>
          </>
        )}
      </div>
    </Dialog>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className={s.summaryRow}>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}
