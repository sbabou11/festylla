/**
 * pages/admin/QrEntree.jsx
 * Deux QR codes génériques à afficher dans le festival :
 * 1. Inscription → /inscription  (créer son espace)
 * 2. Mon solde   → /solde        (consulter son solde)
 */
import React, { useEffect, useRef } from 'react'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import QRCode from 'qrcode'
import { APP_FULL_LABEL } from '../../utils/buildInfo'

const QrCard = ({ canvasRef, url, titre, description, couleur, label, boutonLabel, onPrint }) => (
  <div style={{
    background: 'var(--bg)', border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 14,
    textAlign: 'center',
  }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{titre}</div>
    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>{description}</div>

    <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 14, border: `2px solid ${couleur}`, marginBottom: 16 }}>
      <canvas ref={canvasRef}/>
      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: couleur }}>{label}</div>
    </div>

    <div style={{ padding: '8px 14px', background: 'var(--bg2)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', marginBottom: 16, wordBreak: 'break-all' }}>
      {url}
    </div>

    <button onClick={onPrint}
      style={{ padding: '10px 24px', background: couleur, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
      {boutonLabel}
    </button>
  </div>
)

export default function QrEntree() {
  const { theme }    = useAppStore()
  const { currentEventId, events } = useEventStore()
  const festName     = theme?.festName || 'YllaCash'
  const refInscription = useRef(null)
  const refSolde       = useRef(null)
  const currentEvent = events.find(e => e.id === currentEventId)

  const inscriptionUrl = currentEventId
    ? window.location.origin + '/inscription?ev=' + currentEventId
    : window.location.origin + '/inscription'
  const soldeUrl = currentEventId
    ? window.location.origin + '/solde?ev=' + currentEventId
    : window.location.origin + '/solde'

  useEffect(() => {
    if (refInscription.current)
      QRCode.toCanvas(refInscription.current, inscriptionUrl, { width: 280, margin: 2, color: { dark: '#1a6b7a', light: '#ffffff' } })
    if (refSolde.current)
      QRCode.toCanvas(refSolde.current, soldeUrl, { width: 280, margin: 2, color: { dark: '#534AB7', light: '#ffffff' } })
  }, [inscriptionUrl, soldeUrl])

  const printQr = (type) => {
    const url    = type === 'inscription' ? inscriptionUrl : soldeUrl
    const titre  = type === 'inscription' ? `${festName} — Créer mon espace` : `${festName} — Consulter mon solde`
    const color  = type === 'inscription' ? '#009090' : '#6B3FA0'
    const desc   = type === 'inscription' ? 'Scannez pour créer votre espace festival' : 'Scannez pour consulter votre solde'
    const imgSrc = type === 'inscription' ? refInscription.current?.toDataURL() : refSolde.current?.toDataURL()
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

  const card = { background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 14 }

  return (
    <div style={{ maxWidth: 520 }}>

      {/* Bannière événement actif */}
      {currentEvent && (
        <div style={{ padding:'10px 16px', background:'var(--brand-light)', border:'1px solid var(--brand)', borderRadius:10, marginBottom:14, fontSize:13, color:'var(--brand-dark)', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>{currentEvent.emoji || '🎵'}</span>
          <span>QR codes pour <strong>{currentEvent.nom}</strong> — changez d'événement dans le menu pour générer d'autres QR.</span>
        </div>
      )}

      {/* QR 1 — Inscription */}
      <QrCard
        canvasRef={refInscription}
        url={inscriptionUrl}
        titre="QR code — Créer son espace festival"
        description="À afficher à l'entrée ou à la billetterie. Les spectateurs scannent pour créer leur compte et obtenir leur QR code personnel."
        couleur="#1a6b7a"
        label="Scannez pour créer votre espace"
        boutonLabel="Imprimer — Inscription"
        onPrint={() => printQr('inscription')}
      />

      {/* QR 2 — Mon solde */}
      <QrCard
        canvasRef={refSolde}
        url={soldeUrl}
        titre="QR code — Consulter son solde"
        description="À afficher aux stands, bars et points de vente. Les spectateurs scannent pour accéder à leur espace et vérifier leur solde."
        couleur="#534AB7"
        label="Scannez pour voir votre solde"
        boutonLabel="Imprimer — Solde"
        onPrint={() => printQr('solde')}
      />

      {/* Explications */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Comment ça fonctionne ?</div>
        {[
          ['1', 'Inscription (QR vert)',  'Le spectateur scanne le QR vert → entre son nom → son compte est créé → il reçoit son QR code personnel unique.'],
          ['2', 'Solde (QR violet)',       'Le spectateur scanne le QR violet → saisit son ID → consulte son solde, ses réservations et sa carte.'],
          ['3', 'QR code personnel',       'Chaque spectateur a un QR unique généré à l\'inscription. Il est lié à son compte et son solde.'],
          ['4', 'Plusieurs spots',         'Imprimez autant de QR que nécessaire et placez-les à différents endroits du festival.'],
        ].map(([num, titre, desc]) => (
          <div key={num} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{num}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{titre}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...card, background: 'var(--brand-light)', border: '0.5px solid #5DCAA5' }}>
        <div style={{ fontSize: 12, color: 'var(--brand-dark)', lineHeight: 1.6 }}>
          💡 <strong>Astuce :</strong> Multipliez les QR codes aux endroits stratégiques — entrée, bars, stands merch — pour que chaque spectateur puisse accéder à son espace facilement.
        </div>
      </div>
    </div>
  )
}
