/**
 * pages/admin/QrEntree.jsx
 * QR code générique à afficher dans le festival : « Retrouver mon espace » → /solde.
 * Depuis le 20/11/2026, les comptes se créent sur le site internet (plus de QR d'inscription) :
 * ce QR rouvre l'espace déjà ouvert sur le téléphone du spectateur.
 * La page d'impression (fenêtre séparée) garde ses propres couleurs fixes.
 */
import React, { useEffect, useRef } from 'react'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import QRCode from 'qrcode'
import clsx from 'clsx'
import { Printer, Lightbulb } from 'lucide-react'
import { Button, Card } from '../../ui'
import s from './qrentree/qrentree.module.css'
import { APP_FULL_LABEL } from '../../utils/buildInfo'

// Carte d'un QR : la teinte (teal ou violet) vient de la classe tone
const QrCard = ({ canvasRef, url, titre, description, tone, label, boutonLabel, onPrint }) => (
  <Card className={clsx(s.qrCard, s[tone])}>
    <h3 className={s.qrTitle}>{titre}</h3>
    <p className={s.qrDesc}>{description}</p>

    <div className={s.qrFrame}>
      <canvas ref={canvasRef} className={s.canvas} aria-label={`QR code : ${url}`} role="img"/>
      <div className={s.qrLabel}>{label}</div>
    </div>

    <code className={s.url}>{url}</code>

    <Button icon={Printer} onClick={onPrint} className={s.printBtn}>{boutonLabel}</Button>
  </Card>
)

export default function QrEntree() {
  const { theme }    = useAppStore()
  const { currentEventId, events } = useEventStore()
  const festName     = theme?.festName || 'YllaCash'
  const refSolde       = useRef(null)
  const currentEvent = events.find(e => e.id === currentEventId)

  const soldeUrl = currentEventId
    ? window.location.origin + '/solde?ev=' + currentEventId
    : window.location.origin + '/solde'

  useEffect(() => {
    if (refSolde.current)
      QRCode.toCanvas(refSolde.current, soldeUrl, { width: 280, margin: 2, color: { dark: '#534AB7', light: '#ffffff' } })
  }, [soldeUrl])

  const printQr = () => {
    const url    = soldeUrl
    const titre  = `${festName} — Retrouver mon espace`
    const color  = '#6B3FA0'
    const desc   = 'Scannez pour rouvrir votre espace YllaCash'
    const imgSrc = refSolde.current?.toDataURL()
    const evLogo = currentEvent?.logoSrc || ''
    const evNom  = currentEvent?.nom || festName
    const evHeader = evLogo || evNom
      ? `<header class="ev-header">
           ${evLogo ? `<img src="${evLogo}" alt="" class="ev-logo"/>` : ''}
           <div class="ev-name">${evNom}</div>
         </header>`
      : ''
    const win    = window.open('', '_blank')
    win.document.write(`
      <html><head><title>${titre}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, system-ui, sans-serif;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          background: #fff;
          padding: 32px 16px;
        }
        .ev-header {
          display: flex; flex-direction: column; align-items: center;
          margin-bottom: 28px;
        }
        .ev-logo {
          width: 86px; height: 86px; border-radius: 18px;
          object-fit: cover;
          margin-bottom: 10px;
          box-shadow: 0 4px 14px rgba(0,48,72,.10);
        }
        .ev-name {
          font-size: 22px; font-weight: 800;
          color: #003048;
          letter-spacing: -.01em;
          text-align: center;
        }
        .card {
          display: flex; flex-direction: column; align-items: center;
          background: #fff; border-radius: 20px;
          border: 1.5px solid #e2e8f0;
          padding: 32px 40px;
          box-shadow: 0 4px 24px rgba(0,0,0,.08);
          max-width: 380px; width: 100%;
        }
        h2 { color: ${color}; font-size: 18px; font-weight: 800; margin-bottom: 6px; text-align:center; }
        .desc { color: #64748b; font-size: 13px; margin-bottom: 20px; text-align:center; line-height:1.5; }
        img.qr { width: 260px; height: 260px; border-radius: 16px; margin-bottom: 16px; }
        code { font-size: 10px; color: #94a3b8; word-break: break-all; text-align:center; }
        footer {
          margin-top: 28px;
          text-align: center;
          border-top: 1px solid #f1f5f9;
          padding-top: 16px;
          width: 100%;
        }
        footer .app { font-size: 11px; font-weight: 700; color: #64748b; }
        footer .dev { font-size: 10px; color: #94a3b8; margin-top: 3px; }
        footer .tagline { font-size: 9px; color: #cbd5e1; margin-top: 5px; font-style: italic; }
        @media print {
          body { padding: 24px 0 0; }
          .card { box-shadow: none; border: none; }
          .ev-logo { box-shadow: none; }
        }
      </style></head><body>
      ${evHeader}
      <div class="card">
        <h2>${titre}</h2>
        <p class="desc">${desc}</p>
        <img class="qr" src="${imgSrc}" alt="QR Code"/>
        <code>${url}</code>
        <footer>
          <div class="app">${APP_FULL_LABEL}</div>
          <div class="dev">Développée par <strong>Maison Ylla</strong></div>
          <div class="tagline">"Toute la gestion financière de votre événement en un seul endroit, et bien plus encore"</div>
        </footer>
      </div>
      <script>window.onload = () => window.print()</script>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div className={s.page}>

      {/* Bannière événement actif */}
      {currentEvent && (
        <div className={s.banner}>
          <span className={s.bannerEmoji} aria-hidden="true">{currentEvent.emoji || '🎵'}</span>
          <span>QR codes pour <strong>{currentEvent.nom}</strong> — changez d'événement dans le menu pour générer d'autres QR.</span>
        </div>
      )}

      <div className={s.qrGrid}>
        {/* QR 2 — Mon solde */}
        <QrCard
          canvasRef={refSolde}
          url={soldeUrl}
          titre="QR code — Retrouver mon espace"
          description="À afficher près des bornes, des bars et de la billetterie. Le spectateur scanne pour rouvrir son espace sur son téléphone : solde, commande et QR de paiement."
          tone="violet"
          label="Scannez pour rouvrir votre espace"
          boutonLabel="Imprimer ce QR"
          onPrint={printQr}
        />
      </div>

      {/* Explications */}
      <Card title="Comment ça fonctionne ?">
        <ol className={s.steps}>
          {[
            ['1', 'Un compte par billet',   "Le spectateur prend son billet sur le site internet et reçoit par e-mail le lien de son espace."],
            ['2', 'Ce QR',                  "Il rouvre l'espace déjà ouvert sur le téléphone. Il ne crée pas de compte et ne permet pas de payer."],
            ['3', 'Payer',                  "Dans son espace, le spectateur présente à la borne son QR de paiement, qui change toutes les 30 secondes."],
            ['4', 'Sans compte',            'On commande et on paie à la billetterie, qui remet un code à taper sur la borne.'],
          ].map(([num, titre, desc]) => (
            <li key={num} className={s.step}>
              <span className={s.stepNum} aria-hidden="true">{num}</span>
              <div>
                <div className={s.stepTitle}>{titre}</div>
                <div className={s.stepDesc}>{desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className={s.tip}>
        <Lightbulb size={16} aria-hidden="true" className={s.tipIcon}/>
        <p><strong>Astuce :</strong> Multipliez les QR codes aux endroits stratégiques — entrée, bars, stands merch — pour que chaque spectateur retrouve son espace facilement.</p>
      </div>
    </div>
  )
}
