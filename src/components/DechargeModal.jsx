/**
 * components/DechargeModal.jsx — v8 debug
 *
 * Modale plein écran pour la décharge de paiement en espèces.
 * Affiche le contenu officiel, propose la signature tactile, et
 * permet de générer un PDF téléchargeable.
 *
 * Workflow :
 *   1. Admin/Artiste consulte le contenu de la décharge
 *   2. L'artiste tape son nom complet
 *   3. L'artiste signe avec son doigt sur le canvas
 *   4. Bouton "Valider la signature" :
 *      → enregistre la signature en base
 *      → marque le cachet comme payé (auto-débit caisse)
 *      → propose le téléchargement PDF
 *
 * Si déjà signé (cachet.signature présent) : affiche en lecture seule
 * avec bouton "Télécharger PDF" uniquement.
 */

import React, { useRef, useState } from 'react'
import { X, Download, CheckCircle, AlertCircle } from 'lucide-react'
import SignaturePad from './SignaturePad'
import euroEnLettres from '../utils/euroEnLettres'
import { APP_VERSION_LABEL } from '../utils/buildInfo'
import { marquerCachetPaye } from '../firebase/service'
import jsPDF from 'jspdf'

function fmtDate(date) {
  const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date))
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDateShort(date) {
  const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date))
  return d.toLocaleDateString('fr-FR')
}

function fmtTime(date) {
  const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date))
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function DechargeModal({ cachet, creneau, event, onClose, onSigned }) {
  const sigRef = useRef(null)
  const [signedNom, setSignedNom] = useState(cachet.signedNom || cachet.artiste || '')
  const [signature, setSignature] = useState(cachet.signature || null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState(false)

  const isReadOnly = !!cachet.signature // Déjà signé → lecture seule

  // Génère un aperçu d'initiales pour la nomenclature pré-signature.
  // Au moment de la signature réelle, getNextDechargeNumber génère le vrai numéro côté service.
  const initialesPreview = (() => {
    const nom = (cachet.signedNom || cachet.artiste || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const mots = nom.trim().split(/\s+/).filter(Boolean)
    if (mots.length === 0) return 'ART'
    let ini = ''
    if (mots.length === 1) ini = mots[0].slice(0, 3)
    else if (mots.length === 2) ini = mots[0][0] + mots[1].slice(0, 2)
    else ini = mots[0][0] + mots[1][0] + mots[2][0]
    return ini.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'ART'
  })()

  // Numéro de décharge (existant si déjà signé, sinon aperçu placeholder)
  const numeroDecharge = cachet.numeroDecharge || `${new Date().getFullYear()}-${initialesPreview}-…`

  // Date et heure de signature
  const dateSign = cachet.signedAt
    ? fmtDate(cachet.signedAt)
    : fmtDate(new Date())
  const heureSign = cachet.signedAt
    ? fmtTime(cachet.signedAt)
    : fmtTime(new Date())

  // Lieu : récupéré depuis le paramétrage de l'événement (champ "lieu" défini
  // dans Évènements → fiche événement). Fallback "—" si non renseigné.
  const lieu = event?.lieu?.trim() || '—'
  const association = 'Maison Ylla'

  // Évènement nom
  const eventName = event?.nom || 'Festival Maison Ylla'

  // Prestation date (depuis le créneau)
  const prestationDate = creneau?.debut ? fmtDate(creneau.debut) : '—'

  // ═══ Personnalisation visuelle festival ═══
  // Récupère la couleur de l'événement (fallback marine Maison Ylla)
  const eventColor = event?.couleur || '#003048'
  const eventLogo  = event?.logoSrc || null

  // Détecte si la couleur est claire pour adapter la couleur du texte
  // Algorithme : luminance perçue (formule W3C)
  const getTextColor = (bgHex) => {
    try {
      const hex = bgHex.replace('#', '')
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      // Luminance relative perçue
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      return lum > 0.55 ? '#003048' : '#FFFFFF'
    } catch {
      return '#FFFFFF'
    }
  }
  const headerTextColor = getTextColor(eventColor)
  // Variante claire pour les bandes de surbrillance (mélange avec blanc à 85%)
  const eventColorLight = (() => {
    try {
      const hex = eventColor.replace('#', '')
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const mix = (c) => Math.round(c * 0.15 + 255 * 0.85)
      const toHex = (n) => n.toString(16).padStart(2, '0')
      return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
    } catch {
      return '#FCF1DC' // gold-light fallback
    }
  })()
  // Variante foncée pour le gradient header
  const eventColorDark = (() => {
    try {
      const hex = eventColor.replace('#', '')
      const r = Math.round(parseInt(hex.slice(0, 2), 16) * 0.7)
      const g = Math.round(parseInt(hex.slice(2, 4), 16) * 0.7)
      const b = Math.round(parseInt(hex.slice(4, 6), 16) * 0.7)
      const toHex = (n) => n.toString(16).padStart(2, '0')
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`
    } catch {
      return '#003048'
    }
  })()
  // Couleur en RGB pour jsPDF (qui utilise R, G, B en number)
  const eventColorRgb = (() => {
    try {
      const hex = eventColor.replace('#', '')
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ]
    } catch {
      return [0, 48, 72]
    }
  })()
  const eventColorLightRgb = (() => {
    try {
      const hex = eventColorLight.replace('#', '')
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ]
    } catch {
      return [252, 241, 220]
    }
  })()

  const handleValidate = async () => {
    setErr('')

    // Validations
    if (!signedNom?.trim()) {
      setErr('Veuillez saisir votre nom et prénom complets.')
      return
    }
    if (sigRef.current?.isEmpty()) {
      setErr('Veuillez signer dans la zone prévue.')
      return
    }

    const dataUrl = sigRef.current.getDataUrl()
    if (!dataUrl) {
      setErr('Impossible de récupérer la signature, réessayez.')
      return
    }

    setSaving(true)
    try {
      await marquerCachetPaye(cachet.id, {
        signature: dataUrl,
        signedNom: signedNom.trim(),
        signedBy:  signedNom.trim(),
      })
      setSignature(dataUrl)
      setSuccess(true)
      if (onSigned) onSigned()
    } catch (e) {
      setErr(e.message || 'Erreur lors de l\'enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadPdf = () => {
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()

      // ─── Header aux couleurs du festival ───
      const [hR, hG, hB] = eventColorRgb
      pdf.setFillColor(hR, hG, hB)
      pdf.rect(0, 0, pageW, 32, 'F')

      // Adapte la couleur du texte selon la luminance de la couleur événement
      const textWhite = headerTextColor === '#FFFFFF'
      if (textWhite) {
        pdf.setTextColor(255, 255, 255)
      } else {
        pdf.setTextColor(0, 48, 72)
      }

      // Logo festival embarqué (si dispo et data URL ou URL absolue)
      let titleX = 20
      if (eventLogo) {
        try {
          // jsPDF accepte les data URL et les URL absolues si l'image est CORS-compatible.
          // On le tente, et si ça échoue on retombe sur le texte standard.
          pdf.addImage(eventLogo, 'PNG', 14, 7, 18, 18, undefined, 'FAST')
          titleX = 38 // décale le titre pour laisser de la place au logo
        } catch (e) {
          // Logo non chargeable (CORS, format non supporté…) → on saute silencieusement
          console.warn('Logo festival non embeddable dans PDF:', e.message)
        }
      }

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(16)
      pdf.text('Décharge de paiement', titleX, 16)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text(eventName, titleX, 23)
      // N°
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.text(`N° ${cachet.numeroDecharge || numeroDecharge}`, pageW - 20, 16, { align: 'right' })

      // Body
      pdf.setTextColor(0, 48, 72)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')

      let y = 50
      const lineHeight = 7
      const margin = 20
      const maxW = pageW - 2 * margin

      const modeLabel = {
        especes:  'en espèces',
        virement: 'par virement bancaire',
        cheque:   'par chèque',
        autre:    '',
      }[cachet.modePaiement] || ''

      const typeLabel = {
        cachet:  'mon cachet artistique',
        acompte: 'un acompte sur mon cachet artistique',
        solde:   'le solde de mon cachet artistique',
        frais:   'le remboursement de mes frais',
      }[cachet.type] || 'mon cachet artistique'

      const txt = `Je soussigné(e) ${signedNom || cachet.signedNom}, intervenant(e) artistique au festival ${eventName}, reconnais avoir reçu de l'association ${association} la somme de :`
      const lines = pdf.splitTextToSize(txt, maxW)
      lines.forEach(line => { pdf.text(line, margin, y); y += lineHeight })
      y += 4

      // ─── Montant en surbrillance — aux couleurs du festival ───
      const [lR, lG, lB] = eventColorLightRgb
      pdf.setFillColor(lR, lG, lB)
      pdf.rect(margin, y - 4, maxW, 18, 'F')
      pdf.setDrawColor(hR, hG, hB)
      pdf.setLineWidth(0.8)
      pdf.line(margin, y - 4, margin, y + 14)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(18)
      pdf.setTextColor(hR, hG, hB) // montant en couleur festival foncée
      pdf.text(`${(Number(cachet.montant) || 0).toFixed(2)} €`, margin + 6, y + 4)
      pdf.setFont('helvetica', 'italic')
      pdf.setFontSize(9)
      pdf.setTextColor(107, 123, 142)
      pdf.text(`(${euroEnLettres(cachet.montant)})`, margin + 6, y + 11)
      pdf.setTextColor(0, 48, 72) // reset texte marine pour la suite
      y += 22

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      const txt2 = `Versée ${modeLabel}, en règlement de ${typeLabel} pour la prestation du ${prestationDate}.`
      const lines2 = pdf.splitTextToSize(txt2, maxW)
      lines2.forEach(line => { pdf.text(line, margin, y); y += lineHeight })
      y += 4

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'italic')
      pdf.text(`Bon pour solde de tout compte.`, margin, y); y += 6
      pdf.text(`Fait à ${lieu}, le ${dateSign} à ${heureSign}.`, margin, y); y += 16

      // Signature image
      if (signature || cachet.signature) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text('Signature de l\'artiste :', margin, y); y += 4
        try {
          pdf.addImage(signature || cachet.signature, 'PNG', margin, y, 60, 25)
          y += 28
        } catch (e) {
          console.warn('Cannot embed signature:', e.message)
        }
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.text(signedNom || cachet.signedNom || '', margin, y)
      }

      // Footer
      const footerY = pdf.internal.pageSize.getHeight() - 12
      pdf.setDrawColor(229, 224, 214)
      pdf.line(margin, footerY - 4, pageW - margin, footerY - 4)
      pdf.setFontSize(8)
      pdf.setTextColor(107, 123, 142)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Document généré le ${fmtDateShort(new Date())} · Édité par ${association} · YllaCash ${APP_VERSION_LABEL}`, pageW / 2, footerY, { align: 'center' })

      pdf.save(`decharge-${cachet.numeroDecharge || numeroDecharge}-${(signedNom || cachet.artiste).replace(/\s+/g, '_')}.pdf`)
    } catch (e) {
      console.error('PDF generation failed:', e)
      setErr('Impossible de générer le PDF : ' + e.message)
    }
  }

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 24, 36, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          maxWidth: 540, width: '100%',
          margin: '20px 0',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
        {/* Header — aux couleurs et logo du festival */}
        <div style={{
          background: `linear-gradient(135deg, ${eventColor} 0%, ${eventColorDark} 100%)`,
          color: headerTextColor,
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* Logo festival si dispo, sinon Maison Ylla */}
          <div style={{
            width: 50, height: 50, borderRadius: 12,
            background: '#fff', color: '#003048',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 18,
            overflow: 'hidden', flexShrink: 0,
          }}>
            <img src={eventLogo || '/logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = 'MY' }}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Décharge de paiement</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{eventName}</div>
          </div>
          <div style={{
            background: headerTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)',
            padding: '5px 10px', borderRadius: 6,
            fontSize: 11, fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            N° {numeroDecharge}
          </div>
          <button onClick={onClose}
            style={{
              background: headerTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
              border: 'none', borderRadius: 6,
              width: 28, height: 28, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: headerTextColor, flexShrink: 0,
            }}>
            <X size={16}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
          Je soussigné(e){' '}
          {isReadOnly ? (
            <strong>{cachet.signedNom || cachet.artiste}</strong>
          ) : (
            <input type="text" value={signedNom} onChange={e => setSignedNom(e.target.value)}
              placeholder="Votre nom et prénom"
              style={{
                display: 'inline-block', width: 220,
                padding: '4px 8px',
                border: '1px solid var(--border2)', borderRadius: 6,
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                fontWeight: 700, color: 'var(--marine)',
              }}/>
          )}
          {', intervenant(e) artistique au festival '}
          <strong>{eventName}</strong>
          {', reconnais avoir reçu de l\'association '}
          <strong>{association}</strong>
          {' la somme de :'}

          {/* Montant en surbrillance — aux couleurs du festival */}
          <div style={{
            background: eventColorLight,
            borderLeft: `4px solid ${eventColor}`,
            padding: '12px 14px', margin: '16px 0',
            borderRadius: '0 8px 8px 0',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: eventColorDark }}>
              {(Number(cachet.montant) || 0).toFixed(2)} €
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
              ({euroEnLettres(cachet.montant)})
            </div>
          </div>

          <span style={{ fontWeight: 700, color: eventColorDark }}>
            💵 {cachet.modePaiement === 'especes' ? 'En espèces' :
                cachet.modePaiement === 'virement' ? 'Par virement bancaire' :
                cachet.modePaiement === 'cheque' ? 'Par chèque' : 'En espèces'}
          </span>
          {', en règlement de '}
          {cachet.type === 'acompte' ? 'un acompte sur mon cachet artistique' :
           cachet.type === 'solde' ? 'le solde de mon cachet artistique' :
           cachet.type === 'frais' ? 'le remboursement de mes frais' :
           'mon cachet artistique'}
          {' pour la prestation du '}
          <strong>{prestationDate}</strong>.

          <div style={{
            marginTop: 14, padding: 10,
            background: 'var(--bg2)', borderRadius: 6,
            fontSize: 11, color: 'var(--muted)',
          }}>
            Bon pour solde de tout compte. Fait à {lieu}, le <strong>{dateSign}</strong> à <strong>{heureSign}</strong>.
          </div>

          {/* Signature */}
          {!success && (
            <div style={{
              border: isReadOnly ? '1px solid var(--border)' : '2px dashed var(--border2)',
              borderRadius: 12, padding: 14, marginTop: 16,
              background: isReadOnly ? '#fff' : 'var(--bg2)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--marine)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {isReadOnly && <CheckCircle size={14} style={{ color: 'var(--green)' }}/>}
                Signature de l'artiste
                {isReadOnly && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, marginLeft: 'auto' }}>Signée le {fmtDateShort(cachet.signedAt)}</span>}
              </div>
              <SignaturePad ref={sigRef} height={150} initialDataUrl={cachet.signature} disabled={isReadOnly}/>
              {!isReadOnly && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => sigRef.current?.clear()}
                    style={{
                      flex: 1, padding: 10, borderRadius: 8,
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    Effacer
                  </button>
                  <button type="button" onClick={handleValidate} disabled={saving}
                    style={{
                      flex: 2, padding: 10, borderRadius: 8,
                      background: 'var(--coral)', border: 'none',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                      cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                      opacity: saving ? 0.6 : 1,
                    }}>
                    {saving ? 'Enregistrement…' : '✓ Valider la signature'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bandeau success ou erreur */}
          {err && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: 'var(--red-light)', color: 'var(--red)',
              borderRadius: 8, fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertCircle size={14}/> {err}
            </div>
          )}

          {success && (
            <div style={{
              marginTop: 16, padding: 14,
              background: 'var(--green-light)', borderLeft: '4px solid var(--green)',
              borderRadius: '0 8px 8px 0',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
                ✓ Décharge signée et enregistrée
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Le cachet est marqué comme payé. {cachet.modePaiement === 'especes' && 'Une transaction de débit a été créée dans la caisse.'}
              </div>
            </div>
          )}

          {/* Bouton PDF */}
          {(isReadOnly || success) && (
            <button onClick={handleDownloadPdf}
              style={{
                marginTop: 16, width: '100%', padding: 12,
                background: 'var(--brand)', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <Download size={16}/> Télécharger le PDF
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 24px',
          fontSize: 10, color: 'var(--muted)', textAlign: 'center',
        }}>
          Document généré le {fmtDateShort(new Date())} · Édité par {association} · YllaCash {APP_VERSION_LABEL}
        </div>
      </div>
    </div>
  )
}
