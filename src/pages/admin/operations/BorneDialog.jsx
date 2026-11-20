/**
 * pages/admin/operations/BorneDialog.jsx — fenêtre « Borne self-service » (20/11/2026)
 *
 * Ouverte depuis Opérations. Elle donne le lien de la borne (QR à scanner avec la tablette,
 * ouverture sur cet appareil, copie) et permet à un administrateur de le renouveler s'il a fuité :
 * l'ancien lien ne s'ouvre plus et les bornes déjà ouvertes s'arrêtent dans l'heure.
 */
import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { Button, Dialog, HoldButton, toast } from '../../../ui'
import { linkFor, renewBorneLink } from '../../../firebase/publicSession'
import { friendlyError } from '../../../utils/errors'
import s from './BorneDialog.module.css'

export default function BorneDialog({ open, onClose, eventId, isAdmin }) {
  const [url, setUrl] = useState('')
  const [erreur, setErreur] = useState('')
  const [renouvele, setRenouvele] = useState(false)
  const [busy, setBusy] = useState(false)
  const canvas = useRef(null)

  useEffect(() => {
    if (!open || !eventId) return
    let alive = true
    setUrl(''); setErreur(''); setRenouvele(false)
    linkFor(eventId, 'borne')
      .then(u => { if (alive) setUrl(u) })
      .catch(() => { if (alive) setErreur('Le lien de la borne est introuvable. Vérifiez le réseau et rouvrez cette fenêtre.') })
    return () => { alive = false }
  }, [open, eventId])

  useEffect(() => {
    if (!url || !canvas.current) return
    QRCode.toCanvas(canvas.current, url, { width: 180, margin: 1, color: { dark: '#003048', light: '#ffffff' } }).catch(() => {})
  }, [url])

  const copier = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Lien copié') }
    catch { toast.error('Copie impossible sur cet appareil.') }
  }

  const renouveler = async () => {
    setBusy(true)
    try {
      setUrl(await renewBorneLink(eventId))
      setRenouvele(true)
    } catch (e) {
      toast.error(friendlyError(e, "Le lien n'a pas été renouvelé."))
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Borne self-service">
      <div className={s.stack}>
        {renouvele && (
          <p className={s.ok} role="status"><b>Nouveau lien créé.</b> L'ancien ne fonctionne plus. Rouvrez chaque borne avec le QR ci-dessous.</p>
        )}
        {erreur ? <p className={s.err} role="alert">{erreur}</p> : (<>
          <p className={s.muted}>Ouvrez ce lien sur la tablette de la borne, dans un navigateur où personne de l'équipe n'est connecté.</p>
          <div className={s.qr}>
            <canvas ref={canvas} width={180} height={180} aria-label="QR du lien de la borne"/>
            <span className={s.muted}>Scannez avec la tablette de la borne</span>
          </div>
          <Button block icon={ExternalLink} disabled={!url} onClick={() => window.open(url, '_blank', 'noopener')}>Ouvrir la borne sur cet appareil</Button>
          <Button block variant="secondary" icon={Copy} disabled={!url} onClick={copier}>Copier le lien</Button>
        </>)}
        {isAdmin && !erreur && (
          <div className={s.zone}>
            <b className={s.zoneTitle}>Le lien de la borne a fuité ?</b>
            <p className={s.muted}>Tablette perdue, lien photographié ou envoyé par erreur : créez un nouveau lien. L'ancien cesse de fonctionner, et les bornes déjà ouvertes s'arrêtent dans l'heure.</p>
            <HoldButton block tone="danger" icon={RefreshCw} disabled={busy || !url} onConfirm={renouveler}
              fillingLabel="Gardez appuyé…" doneLabel="Lien renouvelé">Maintenir pour renouveler le lien</HoldButton>
            <p className={s.muted}>Réservé aux administrateurs. Noté dans le journal d'audit.</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}
