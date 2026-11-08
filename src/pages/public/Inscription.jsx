/**
 * pages/public/Inscription.jsx
 * URL : /inscription
 * Scanné via QR code générique à l'entrée du festival.
 * Crée automatiquement un compte spectateur dans Firebase
 * et affiche le QR code personnel unique.
 * Aucune app, aucun login requis — juste la caméra du téléphone.
 * Mobile d'abord : colonne de 440px max, styles dans inscription/Inscription.module.css.
 */

import React, { useState, useEffect, useRef } from 'react'
import { db } from '../../firebase/config'
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { nowStr } from '../../utils/helpers'
import QRCode from 'qrcode'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { AlertCircle, ArrowRight, Wallet, Download, CreditCard, ShoppingBag, ClipboardList } from 'lucide-react'
import clsx from 'clsx'
import { Button, Field, Skeleton, SuccessCheck, focusFirstInvalid } from '../../ui'
import s from './inscription/Inscription.module.css'

// Génère un ID unique de type FY-XXXX
const genId = () => 'FY-' + Math.random().toString(36).slice(2, 6).toUpperCase()

// Couleur du QR (image exportée, indépendante du thème)
const BRAND   = '#1a6b7a'

export default function Inscription() {
  useTheme()
  const [step, setStep]       = useState('form')   // form | creating | done | exists
  const [nom, setNom]         = useState('')
  const [prenom, setPrenom]   = useState('')
  const [err, setErr]         = useState('')
  const [spec, setSpec]       = useState(null)      // compte créé
  const [qrDataUrl, setQrDataUrl] = useState(null)  // image QR base64
  const [eventMeta, setEventMeta] = useState(null)  // { nom, logoSrc } de l'événement courant
  const [tried, setTried]     = useState(false)
  const formRef = useRef(null)

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

  // Règle existante : prénom + nom réunis font au moins 2 caractères. L'erreur s'affiche sur le
  // second champ, pour ne pas la montrer tant que le visiteur n'a pas fini de remplir les deux.
  const nomErr = (prenom.trim() + ' ' + nom.trim()).trim().length < 2 ? 'Veuillez entrer votre prénom et nom.' : null

  const handleCreate = async () => {
    const fullNom = (prenom.trim() + ' ' + nom.trim()).trim()
    if (nomErr) { setTried(true); focusFirstInvalid(formRef.current); return }
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

  const creating = step === 'creating'
  const soldeHref = `/solde?id=${spec?.id}${eventId ? '&ev=' + eventId : ''}`

  return (
    <div className={s.page}>

      {/* En-tête dégradé Maison Ylla */}
      <header className={s.hero}>
        <div className={s.heroTheme}><ThemeToggle variant="dark"/></div>
        <div className={s.heroBrand}>
          <span className={s.logo}>
            <img src="/logo.png" alt="" onError={e => { e.target.style.display = 'none' }}/>
          </span>
          <span className={s.brandName}>YllaCash</span>
        </div>
        {eventMeta?.nom && <span className={s.event}>{eventMeta.nom}</span>}
        <p className={s.heroSub}>
          {step === 'done' ? 'Votre espace est prêt !' : 'Créez votre espace festival'}
        </p>
      </header>

      <main className={s.wrap}>

        {/* ── Formulaire ── */}
        {(step === 'form' || creating) && (
          <form className={s.card} ref={formRef} onSubmit={e => { e.preventDefault(); handleCreate() }} noValidate>
            <div className={s.intro}>
              <h1 className={s.title}>Bienvenue au festival !</h1>
              <p className={s.muted}>
                Entrez votre nom pour créer votre espace cashless. Vous recevrez un QR code personnel pour payer et réserver.
              </p>
            </div>

            <Field label={<span className={s.label}>Prénom</span>} valid={!!prenom.trim()}>
              <input
                className={s.input}
                value={prenom}
                onChange={e => setPrenom(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('inp-nom')?.focus() } }}
                placeholder="ex : Marie"
                autoComplete="given-name"
                disabled={creating}
                autoFocus
              />
            </Field>

            <Field label={<span className={s.label}>Nom</span>} error={nomErr} valid={!!nom.trim()} showError={tried}>
              <input
                id="inp-nom"
                className={s.input}
                value={nom}
                onChange={e => setNom(e.target.value)}
                placeholder="ex : Dupont"
                autoComplete="family-name"
                disabled={creating}
              />
            </Field>

            {err && (
              <p className={s.err} role="alert"><AlertCircle size={16} aria-hidden="true"/>{err}</p>
            )}

            <Button type="submit" size="lg" block loading={creating} icon={ArrowRight}>
              {creating ? 'Création en cours…' : 'Créer mon espace'}
            </Button>

            <p className={s.small}>Aucune app à installer · Aucun mot de passe · Gratuit</p>
          </form>
        )}

        {/* ── Compte créé ── */}
        {step === 'done' && spec && (
          <>
            <section className={clsx(s.card, s.done)}>
              <SuccessCheck size={64}/>
              <div>
                <h1 className={s.title}>Bonjour {spec.nom} !</h1>
                <p className={s.mono}>{spec.id}</p>
              </div>

              {/* QR code : toujours sur fond blanc pour la lecture */}
              {qrDataUrl ? (
                <div className={s.qr}>
                  <img src={qrDataUrl} alt={`QR code ${spec.id}`}/>
                </div>
              ) : (
                <Skeleton width={224} height={224} radius={12}/>
              )}

              <div className={s.intro}>
                <p className={s.capture}>Faites une capture d'écran de ce QR code !</p>
                <p className={s.muted}>
                  Présentez-le aux stands pour payer et réserver. Il vous suffit de le scanner pour consulter votre solde à tout moment.
                </p>
              </div>

              <dl className={s.infos}>
                {[
                  ['Votre nom',  spec.nom],
                  ['Votre ID',   spec.id],
                  ['Solde',      '0,00€ (rechargeable à la billetterie)'],
                ].map(([k, v]) => (
                  <div key={k} className={s.infoRow}>
                    <dt>{k}</dt>
                    <dd className={clsx(k === 'Votre ID' && s.monoValue)}>{v}</dd>
                  </div>
                ))}
              </dl>

              <div className={s.actions}>
                <Button block icon={Wallet} onClick={() => { window.location.href = soldeHref }}>
                  Consulter mon solde
                </Button>
                <Button block variant="secondary" icon={Download} onClick={handlePrint}>
                  Télécharger mon QR code (PDF)
                </Button>
              </div>
            </section>

            {/* Astuce */}
            <section className={s.card}>
              <h2 className={s.subtitle}>Comment ça marche ?</h2>
              <ul className={clsx(s.steps, 'yc-stagger')}>
                {[
                  [CreditCard,   'Rechargez', 'Donnez votre QR code à la billetterie pour recharger votre solde en espèces ou carte.'],
                  [ShoppingBag,  'Payez',     'Présentez votre QR code aux stands pour payer directement.'],
                  [ClipboardList,'Réservez',  'Réservez depuis votre espace en ligne et récupérez quand c\'est prêt.'],
                ].map(([Icon, titre, desc]) => (
                  <li key={titre} className={s.stepItem}>
                    <span className={s.stepIcon}><Icon size={18} aria-hidden="true"/></span>
                    <div>
                      <b>{titre}</b>
                      <p className={s.muted}>{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

      </main>

      {/* Pied de page À propos */}
      <footer className={s.footer}>
        <b>YllaCash v1.0 · 05/2026</b>
        <span>Développée par <strong>Maison Ylla</strong></span>
        <i>"Toute la gestion financière de votre événement en un seul endroit, et bien plus encore"</i>
      </footer>
    </div>
  )
}
