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
 */

import React, { useState, useRef, useEffect } from 'react'
import { X, ArrowLeft, ArrowRight, FileText, Edit3, Check, AlertCircle } from 'lucide-react'
import SignatureCanvas from '../SignatureCanvas'
import { generateDechargePDFSigned } from '../../utils/expoPDF'
import { saveSignedDecharge } from '../../firebase/service'
import { computeExpoPaye, computeExpoRestant, expoDisplayName } from '../../utils/expositions'
import useAuthStore from '../../store/useAuthStore'

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
  const [err, setErr]                       = useState('')
  const [progress, setProgress]             = useState('')

  const orgCanvasRef = useRef(null)
  const expCanvasRef = useRef(null)

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
  const handleGenerate = async () => {
    if (!orgCanvasRef.current || !expCanvasRef.current) {
      setErr('Erreur interne : canvas signatures'); return
    }
    const orgSig = orgCanvasRef.current.toDataURL()
    const expSig = expCanvasRef.current.toDataURL()
    if (!orgSig) { setErr('Signature de l\'organisateur requise'); return }
    if (!expSig) { setErr('Signature de l\'exposant requise'); return }
    if (!signedByOrg.trim()) { setErr('Nom du signataire organisateur requis'); return }
    if (!signedByExp.trim()) { setErr('Nom du signataire exposant requis'); return }

    setLoading(true); setErr('')

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
      onSaved && onSaved(saved)
      onClose()
    } catch (e) {
      console.error(e)
      setErr(e.message || 'Erreur lors de la génération')
      setLoading(false)
    }
  }

  // Validation pour passer à l'étape suivante
  const canGoStep2 = !!customText.intro.trim()
  const canGenerate = orgHasSig && expHasSig && signedByOrg.trim() && signedByExp.trim()

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 12, zIndex: 9999, backdropFilter: 'blur(2px)',
    }} onClick={loading ? null : onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, width: '100%',
        maxWidth: 720, maxHeight: '92vh', overflow: 'auto',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>

        {/* En-tête modale */}
        <div style={{
          padding: '14px 18px', borderBottom: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Décharge signée
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Étape {step} sur 3 — {expoDisplayName(expo)}
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
            style={{
              width: 32, height: 32, padding: 0,
              background: 'transparent', color: 'var(--muted)',
              border: 'none', borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={18}/>
          </button>
        </div>

        {/* Progress bar étapes */}
        <div style={{
          display: 'flex', padding: '10px 18px', gap: 4,
          background: 'var(--bg2)',
        }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: step >= n ? 'var(--brand)' : 'var(--border)',
              transition: 'background .2s',
            }}/>
          ))}
        </div>

        {/* Corps : étape 1 — choix template + perso */}
        {step === 1 && (
          <div style={{ padding: 18 }}>
            <SectionH>Choisir un modèle</SectionH>
            <select value={selectedTplId} onChange={e => setSelectedTplId(e.target.value)}
              disabled={loading}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                marginBottom: 14,
              }}>
              <option value="default">Texte par défaut (sans template)</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>

            <SectionH>Texte d'introduction</SectionH>
            <textarea value={customText.intro}
              onChange={e => setCustomText(c => ({ ...c, intro: e.target.value }))}
              rows={8}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                resize: 'vertical', minHeight: 130, lineHeight: 1.5, marginBottom: 14,
              }}/>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -8, marginBottom: 14, fontStyle: 'italic' }}>
              Variables remplacées automatiquement : <code>{'{{exposant}}'}</code>, <code>{'{{montant}}'}</code>, <code>{'{{montantLettres}}'}</code>, <code>{'{{montantTotal}}'}</code>
            </div>

            <SectionH>Mentions complémentaires (optionnel)</SectionH>
            <textarea value={customText.mentions}
              onChange={e => setCustomText(c => ({ ...c, mentions: e.target.value }))}
              rows={3}
              placeholder="Ex: Conformément à…"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                resize: 'vertical', minHeight: 70, lineHeight: 1.5, marginBottom: 14,
              }}/>

            <SectionH>Pied de page</SectionH>
            <input type="text" value={customText.piedDePage}
              onChange={e => setCustomText(c => ({ ...c, piedDePage: e.target.value }))}
              placeholder="Document généré électroniquement et signé."
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}/>
          </div>
        )}

        {/* Corps : étape 2 — signatures */}
        {step === 2 && (
          <div style={{ padding: 18 }}>
            <div style={{
              padding: '10px 12px', marginBottom: 14,
              background: 'var(--bg2)', borderRadius: 8, fontSize: 12, color: 'var(--text)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <Edit3 size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--muted)' }}/>
              <div>
                Chaque signature sera intégrée au PDF avec un horodatage précis et un hash de
                vérification (SHA-256) pour garantir l'intégrité du document.
              </div>
            </div>

            <SectionH>Signature de l'organisateur</SectionH>
            <input type="text" value={signedByOrg}
              onChange={e => setSignedByOrg(e.target.value)}
              placeholder="Nom et fonction"
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 6,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                marginBottom: 8,
              }}/>
            <SignatureCanvas ref={orgCanvasRef} onChange={setOrgHasSig}/>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, marginBottom: 14 }}>
              <button onClick={() => orgCanvasRef.current?.clear()}
                style={{
                  padding: '6px 12px', background: 'transparent', color: 'var(--muted)',
                  border: '0.5px solid var(--border)', borderRadius: 6, fontSize: 11,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                Effacer
              </button>
            </div>

            <SectionH>Signature de l'exposant</SectionH>
            <input type="text" value={signedByExp}
              onChange={e => setSignedByExp(e.target.value)}
              placeholder="Nom et qualité"
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 6,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                marginBottom: 8,
              }}/>
            <SignatureCanvas ref={expCanvasRef} onChange={setExpHasSig}/>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => expCanvasRef.current?.clear()}
                style={{
                  padding: '6px 12px', background: 'transparent', color: 'var(--muted)',
                  border: '0.5px solid var(--border)', borderRadius: 6, fontSize: 11,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                Effacer
              </button>
            </div>
          </div>
        )}

        {/* Corps : étape 3 — confirmation */}
        {step === 3 && (
          <div style={{ padding: 18 }}>
            <div style={{
              padding: 14, background: 'var(--bg2)', borderRadius: 10,
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={16} style={{ color: 'var(--green-dark)' }}/>
                Prêt à générer la décharge signée
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                Le PDF va être généré avec les deux signatures intégrées, horodaté, hashé
                pour preuve d'intégrité, puis sauvegardé dans le dossier de l'exposant et
                téléchargé sur votre appareil.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Exposant" value={expoDisplayName(expo)}/>
              <Field label="Modèle" value={selectedTplId === 'default' ? 'Texte par défaut' : (templates.find(t => t.id === selectedTplId)?.nom || '—')}/>
              <Field label="Signataire organisateur" value={signedByOrg}/>
              <Field label="Signataire exposant" value={signedByExp}/>
              <Field label="Montant total" value={`${((expo.montantTotal || 0) / 100).toFixed(2)} €`}/>
              <Field label="Déjà payé" value={`${(computeExpoPaye(expo) / 100).toFixed(2)} €`}/>
            </div>

            {progress && (
              <div style={{
                marginTop: 14, padding: '10px 12px',
                background: 'var(--bg2)', borderRadius: 8, fontSize: 12,
                color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div className="yc-spin" style={{
                  width: 14, height: 14, border: '2px solid var(--border)',
                  borderTopColor: 'var(--brand)', borderRadius: '50%',
                }}/>
                {progress}
              </div>
            )}
          </div>
        )}

        {/* Erreur */}
        {err && (
          <div style={{
            margin: '0 18px 14px', padding: '10px 12px',
            background: 'var(--red-light)', color: 'var(--red-dark)',
            borderRadius: 8, fontSize: 12,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }}/> {err}
          </div>
        )}

        {/* Footer boutons */}
        <div style={{
          padding: '12px 18px', borderTop: '0.5px solid var(--border)',
          display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)',
        }}>
          {step > 1 && (
            <button onClick={() => { setErr(''); setStep(step - 1) }} disabled={loading}
              style={{
                padding: '10px 14px', background: 'transparent',
                color: 'var(--text)', border: '0.5px solid var(--border)',
                borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <ArrowLeft size={13}/> Précédent
            </button>
          )}
          <div style={{ flex: 1 }}/>
          {step < 3 && (
            <button
              onClick={() => { setErr(''); setStep(step + 1) }}
              disabled={loading || (step === 1 && !canGoStep2) || (step === 2 && !canGenerate)}
              style={{
                padding: '10px 16px',
                background: (loading || (step === 1 && !canGoStep2) || (step === 2 && !canGenerate)) ? 'var(--bg2)' : 'var(--brand)',
                color: (loading || (step === 1 && !canGoStep2) || (step === 2 && !canGenerate)) ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: (loading || (step === 1 && !canGoStep2) || (step === 2 && !canGenerate)) ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              Suivant <ArrowRight size={13}/>
            </button>
          )}
          {step === 3 && (
            <button onClick={handleGenerate} disabled={loading}
              style={{
                padding: '10px 16px',
                background: loading ? 'var(--bg2)' : 'var(--brand)',
                color: loading ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <FileText size={13}/> {loading ? 'Génération…' : 'Générer la décharge'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionH({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      marginBottom: 6, marginTop: 4,
    }}>{children}</div>
  )
}
function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, textAlign: 'right', minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </span>
    </div>
  )
}
