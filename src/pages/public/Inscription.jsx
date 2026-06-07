/**
 * pages/public/Inscription.jsx
 * URL : /inscription
 * Scanné via QR code générique à l'entrée du festival.
 * Crée automatiquement un compte spectateur dans Firebase
 * et affiche le QR code personnel unique.
 * Aucune app, aucun login requis — juste la caméra du téléphone.
 */

import React, { useState, useEffect } from 'react'
import { db } from '../../firebase/config'
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import QRCode from 'qrcode'
import ThemeToggle from '../../components/ThemeToggle'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import { useTheme } from '../../hooks/useTheme'

// Génère un ID unique de type FY-XXXX
const genId = () => 'FY-' + Math.random().toString(36).slice(2, 6).toUpperCase()

const BRAND   = '#1a6b7a'
const BRAND_L = '#E1F5EE'
const BRAND_D = '#0F6E56'

export default function Inscription() {
  useTheme()
  const [step, setStep]       = useState('form')   // form | creating | done | exists
  const [nom, setNom]         = useState('')
  const [prenom, setPrenom]   = useState('')
  const [err, setErr]         = useState('')
  const [spec, setSpec]       = useState(null)      // compte créé
  const [qrDataUrl, setQrDataUrl] = useState(null)  // image QR base64
  const [eventMeta, setEventMeta] = useState(null)  // { nom, logoSrc } de l'événement courant

  // Lire l'eventId depuis l'URL (?ev=...)
  const params  = new URLSearchParams(window.location.search)
  const eventId = params.get('ev') || null

  // Charger les métadonnées de l'événement (nom + logo) pour la page et le PDF
  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db, 'events', eventId)).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setEventMeta({ nom: d.nom || '', logoSrc: d.logoSrc || null })
      }
    }).catch(() => {})
  }, [eventId])

  // Générer l'image QR dès qu'on a l'ID
  useEffect(() => {
    if (!spec?.id) return
    const soldeUrl = `${window.location.origin}/solde?id=${spec.id}${eventId ? '&ev=' + eventId : ''}`
    QRCode.toDataURL(soldeUrl, {
      width: 240,
      margin: 2,
      color: { dark: BRAND, light: '#ffffff' },
    }).then(url => setQrDataUrl(url)).catch(() => {})
  }, [spec])

  const handleCreate = async () => {
    const fullNom = (prenom.trim() + ' ' + nom.trim()).trim()
    if (!fullNom || fullNom.length < 2) {
      setErr('Veuillez entrer votre prénom et nom.')
      return
    }
    setErr('')
    setStep('creating')

    try {
      // Générer un ID unique non encore utilisé
      let id, exists = true
      let tries = 0
      while (exists && tries < 10) {
        id = genId()
        const specCol = eventId
          ? collection(db, 'events', eventId, 'spectateurs')
          : collection(db, 'spectateurs')
        const snap = await getDocs(query(specCol, where('id', '==', id)))
        exists = !snap.empty
        tries++
      }

      // Créer le compte dans Firebase
      const specColWrite = eventId
        ? collection(db, 'events', eventId, 'spectateurs')
        : collection(db, 'spectateurs')
      await addDoc(specColWrite, {
        id,
        nom:       fullNom,
        solde:     0,
        avatar:    null,
        createdAt: serverTimestamp(),
      })

      setSpec({ id, nom: fullNom })
      setStep('done')
    } catch (e) {
      setErr('Erreur de connexion. Réessayez.')
      setStep('form')
    }
  }

  const handlePrint = async () => {
    if (!spec || !qrDataUrl) return
    try {
      // Charger jsPDF
      const jsPDF = await new Promise((resolve, reject) => {
        if (window.jspdf?.jsPDF) { resolve(window.jspdf.jsPDF); return }
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
        s.onload  = () => resolve(window.jspdf.jsPDF)
        s.onerror = () => reject(new Error('jsPDF non disponible'))
        document.head.appendChild(s)
      })

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [100, 160] })
      const W = 100, H = 160

      // Fond coloré en haut
      doc.setFillColor(0, 144, 144)  // Teal Maison Ylla
      doc.rect(0, 0, W, 40, 'F')

      // En-tête événement : logo + nom centrés (si présents)
      if (eventMeta?.logoSrc) {
        try {
          doc.addImage(eventMeta.logoSrc, 'JPEG', W/2 - 8, 4, 16, 16)
        } catch {}
      }
      if (eventMeta?.nom) {
        doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
        doc.text(eventMeta.nom, W / 2, eventMeta.logoSrc ? 26 : 14, { align: 'center' })
      }

      // Titre YllaCash
      doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal')
      doc.text('YllaCash — votre événement, sans cash', W / 2, eventMeta?.nom ? 34 : (eventMeta?.logoSrc ? 26 : 22), { align: 'center' })

      // Nom du spectateur
      doc.setTextColor(0, 48, 72); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text(spec.nom, W / 2, 52, { align: 'center' })

      // ID
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.setTextColor(74, 101, 128)
      doc.text(spec.id, W / 2, 60, { align: 'center' })

      // QR code (image base64 générée par la lib qrcode)
      doc.addImage(qrDataUrl, 'PNG', 20, 66, 60, 60)

      // Bordure autour du QR
      doc.setDrawColor(0, 144, 144); doc.setLineWidth(0.5)
      doc.roundedRect(19, 65, 62, 62, 2, 2, 'S')

      // URL en bas du QR
      doc.setFontSize(7); doc.setTextColor(100, 100, 110)
      doc.text(window.location.origin + '/solde?id=' + spec.id + (eventId ? '&ev=' + eventId : ''), W / 2, 133, { align: 'center' })

      // Pied de page
      doc.setFillColor(255, 248, 242)
      doc.rect(0, 140, W, 20, 'F')
      doc.setFontSize(7); doc.setTextColor(74, 101, 128)
      doc.text('Présentez ce QR code aux stands pour payer et réserver.', W / 2, 147, { align: 'center' })
      doc.text('Rechargeable à la billetterie.', W / 2, 153, { align: 'center' })

      doc.save('yllacash-qrcode-' + spec.id + '.pdf')
    } catch (e) {
      // Fallback : ouvrir l'image QR dans un nouvel onglet
      const win = window.open()
      win.document.write('<html><body style="text-align:center;font-family:sans-serif;padding:20px">')
      win.document.write('<h2>' + spec.nom + ' — ' + spec.id + '</h2>')
      win.document.write('<img src="' + qrDataUrl + '" style="width:250px"/>')
      win.document.write("<p>Faites une capture d\u2019\u00e9cran pour sauvegarder votre QR code.</p>")
      win.document.write('</body></html>')
      win.print()
    }
  }

  const inp = {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid var(--border2)', borderRadius: 'var(--radius)',
    fontSize: 16, color: 'var(--text)', outline: 'none',
    fontFamily: 'var(--font)',
    background: 'var(--bg)',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg2)', fontFamily: 'var(--font)' }}>

      {/* Header dégradé Maison Ylla */}
      <div style={{ position:'relative', background:'var(--grad-signature)', padding: '24px 16px 56px', textAlign: 'center', color: '#fff' }}>
        <div style={{ position:'absolute', top:10, right:12, zIndex:10 }}><ThemeToggle variant="dark"/></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.20)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="YllaCash" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none' }}/>
          </div>
          <span style={{ fontSize: 22, fontWeight: 800 }}>YllaCash</span>
        </div>
        <div style={{ fontSize: 14, opacity: 0.90, fontWeight: 500 }}>
          {step === 'done' ? 'Votre espace est prêt !' : 'Créez votre espace festival'}
        </div>
      </div>

      <div style={{ maxWidth: 420, margin: '-32px auto 0', padding: '0 16px 40px', position: 'relative', zIndex: 1 }}>

        {/* ── Formulaire ── */}
        {(step === 'form' || step === 'creating') && (
          <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              Bienvenue au festival !
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Entrez votre nom pour créer votre espace cashless. Vous recevrez un QR code personnel pour payer et réserver.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#6b6b6b', display: 'block', marginBottom: 6 }}>Prénom</label>
              <input
                value={prenom}
                onChange={e => setPrenom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('inp-nom')?.focus()}
                placeholder="ex : Marie"
                disabled={step === 'creating'}
                style={inp}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#6b6b6b', display: 'block', marginBottom: 6 }}>Nom</label>
              <input
                id="inp-nom"
                value={nom}
                onChange={e => setNom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="ex : Dupont"
                disabled={step === 'creating'}
                style={inp}
              />
            </div>

            {err && (
              <div style={{ padding: '10px 14px', background: '#FCEBEB', borderRadius: 8, fontSize: 13, color: '#A32D2D', marginBottom: 16 }}>
                {err}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={step === 'creating'}
              style={{
                width: '100%', padding: '14px 0',
                background: step === 'creating' ? '#ccc' : BRAND,
                color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 15,
                fontWeight: 600, cursor: step === 'creating' ? 'not-allowed' : 'pointer',
                fontFamily: 'system-ui,sans-serif',
                transition: 'background .15s',
              }}
            >
              {step === 'creating' ? 'Création en cours…' : 'Créer mon espace →'}
            </button>

            <div style={{ marginTop: 14, fontSize: 11, color: '#6b6b6b', textAlign: 'center', lineHeight: 1.5 }}>
              Aucune app à installer · Aucun mot de passe · Gratuit
            </div>
          </div>
        )}

        {/* ── Compte créé ── */}
        {step === 'done' && spec && (
          <>
            {/* Confirmation */}
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center', marginBottom: 14 }}>

              {/* Check animé */}
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: BRAND_L, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
                ✓
              </div>

              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Bonjour {spec.nom} !
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 20 }}>
                {spec.id}
              </div>

              {/* QR code */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                {qrDataUrl ? (
                  <div style={{ padding: 12, background: '#fff', borderRadius: 12, border: `2px solid ${BRAND}`, display: 'inline-block' }}>
                    <img src={qrDataUrl} alt={`QR code ${spec.id}`} style={{ width: 200, height: 200, display: 'block' }}/>
                  </div>
                ) : (
                  <div style={{ width: 224, height: 224, background: '#f5f5f5', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b6b', fontSize: 13 }}>
                    Génération…
                  </div>
                )}
              </div>

              <div style={{ fontSize: 13, color: BRAND_D, fontWeight: 500, marginBottom: 6 }}>
                Faites une capture d'écran de ce QR code !
              </div>
              <div style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.5, marginBottom: 20 }}>
                Présentez-le aux stands pour payer et réserver. Il vous suffit de le scanner pour consulter votre solde à tout moment.
              </div>

              {/* Infos */}
              <div style={{ background: '#f0f8f9', borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'left' }}>
                {[
                  ['Votre nom',  spec.nom],
                  ['Votre ID',   spec.id],
                  ['Solde',      '0,00€ (rechargeable à la billetterie)'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid #ddd', fontSize: 13 }}>
                    <span style={{ color: '#6b6b6b' }}>{k}</span>
                    <span style={{ color: '#0d2d33', fontWeight: 600, fontFamily: k === 'Votre ID' ? 'monospace' : 'inherit' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { window.location.href = `/solde?id=${spec.id}${eventId ? '&ev=' + eventId : ''}` }}
                  style={{
                    flex: 1, padding: '12px 0',
                    background: BRAND, color: '#fff',
                    border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'system-ui,sans-serif',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  Consulter mon solde
                </button>
                <button
                  onClick={handlePrint}
                  style={{
                    flex: 1, padding: '12px 0',
                    background: '#fff', color: BRAND_D,
                    border: `0.5px solid ${BRAND}`,
                    borderRadius: 10, fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'system-ui,sans-serif',
                  }}
                >
                  Télécharger mon QR code (PDF)
                </button>
              </div>
            </div>

            {/* Astuce */}
            <div style={{ background: '#fff', border: '0.5px solid #ddd', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d2d33', marginBottom: 8 }}>
                Comment ça marche ?
              </div>
              {[
                ['💳', 'Rechargez', 'Donnez votre QR code à la billetterie pour recharger votre solde en espèces ou carte.'],
                ['🍺', 'Payez', 'Présentez votre QR code aux stands pour payer directement.'],
                ['📋', 'Réservez', 'Réservez depuis votre espace en ligne et récupérez quand c\'est prêt.'],
              ].map(([icon, titre, desc]) => (
                <div key={titre} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #eee' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d2d33', marginBottom: 2 }}>{titre}</div>
                    <div style={{ fontSize: 12, color: '#6b6b6b', lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      </div>

      {/* Footer À propos */}
      <div style={{ textAlign:'center', padding:'24px 16px 32px', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b' }}>{APP_FULL_LABEL}</div>
        <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
          Développée par <strong style={{ color:'#64748b' }}>Maison Ylla</strong>
        </div>
        <div style={{ fontSize:10, color:'#cbd5e1', marginTop:6, fontStyle:'italic' }}>
          "Toute la gestion financière de votre événement en un seul endroit, et bien plus encore"
        </div>
      </div>
    </div>
  )
}
