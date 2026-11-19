/**
 * pages/billetterie/LienPerdu.jsx — donner un nouveau lien à un spectateur (20/11/2026)
 *
 * Pour quelqu'un qui a changé de téléphone ou n'a pas reçu le lien de son espace. Le bénévole
 * retrouve le compte (nom ou code du billet), vérifie une pièce d'identité, puis maintient le
 * bouton : le serveur change la clé du compte (l'ancien lien ne vaut plus rien) et donne un jeton
 * à usage unique, valable 2 minutes, affiché ici en QR. Le spectateur le scanne avec l'appareil
 * photo de son téléphone : son espace s'ouvre. Rien n'est imprimé ; tout est noté dans l'audit.
 * Maquette validée le 20/11/2026 ; ouvert à toute la billetterie.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Search, ChevronLeft, AlertTriangle, Check } from 'lucide-react'
import { db } from '../../firebase/config'
import { apiFetch } from '../../firebase/session'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import QrCode from '../../components/QrCode'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Button, Badge, HoldButton } from '../../ui'
import t from './rembTicket.module.css'
import s from './demandes.module.css'

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export default function LienPerdu() {
  const spectateurs = useAppStore(st => st.spectateurs) || []
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [q, setQ] = useState('')
  const [compte, setCompte] = useState(null)
  const [verifie, setVerifie] = useState(false)
  const [lien, setLien] = useState(null)        // { jeton, expMs }
  const [reste, setReste] = useState(0)
  const [utilise, setUtilise] = useState(null)  // heure d'utilisation
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const resultats = useMemo(() => {
    const n = norm(q.trim())
    if (n.length < 2) return []
    return spectateurs.filter(x => x && (norm(x.nom).includes(n) || norm(x.billet?.code).includes(n))).slice(0, 8)
  }, [q, spectateurs])

  // Compte à rebours du QR, et suivi de son utilisation par le spectateur
  useEffect(() => {
    if (!lien) return
    const tick = () => setReste(Math.max(0, Math.ceil((lien.expMs - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    const off = onSnapshot(doc(db, 'events', currentEventId, 'jetons-lien', lien.jeton),
      snap => { if (snap.data()?.utiliseMs) setUtilise(heure(snap.data().utiliseMs)) }, () => {})
    return () => { clearInterval(timer); off() }
  }, [lien, currentEventId])

  const donner = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiFetch('/api/qr', { body: { action: 'nouveau-lien', ev: currentEventId, docId: compte._docId, staff: user?.nom || 'Billetterie' } })
      setLien({ jeton: r.jeton, expMs: Date.now() + (r.secondes || 120) * 1000 })
    } catch (e) { setErr(friendlyError(e, 'Le nouveau lien n\'a pas pu être créé.')) }
    finally { setBusy(false) }
  }
  const terminer = () => { setCompte(null); setVerifie(false); setLien(null); setUtilise(null); setErr(''); setQ('') }

  const wrap = { maxWidth: 520, margin: '0 auto' }

  // ── Lien utilisé ──
  if (utilise) {
    return (
      <div className={t.stack} style={wrap}>
        <div className={t.done}>
          <span className={t.doneIcon}><Check size={28} aria-hidden="true" /></span>
          <h2>Lien utilisé à {utilise}</h2>
          <p className={t.muted}>L'espace de {compte.nom} est ouvert sur son téléphone.</p>
        </div>
        <p className={t.muted} style={{ textAlign: 'center' }}>Fait par {user?.nom || 'Billetterie'} · noté dans le journal d'audit.</p>
        <Button block onClick={terminer}>Terminer</Button>
      </div>
    )
  }

  // ── QR à usage unique ──
  if (lien) {
    const url = `${window.location.origin}/solde?ev=${encodeURIComponent(currentEventId)}&jeton=${lien.jeton}`
    return (
      <div className={t.stack} style={wrap}>
        <p className={t.warn}><AlertTriangle size={16} aria-hidden="true" /><span>L'ancien lien ne fonctionne plus. Faites scanner ce QR par {compte.nom}, avec l'appareil photo de son téléphone.</span></p>
        <section className={t.card} style={{ justifyItems: 'center', textAlign: 'center' }}>
          {reste > 0 ? <QrCode value={url} size={200} /> : <p className={t.hint}>Ce QR a expiré.</p>}
          <p className={t.muted}>À usage unique · {reste > 0 ? `valable encore ${reste} s` : 'générez-en un autre'}</p>
          {err && <p className={t.err} role="alert">{err}</p>}
          <Button variant="secondary" block loading={busy} onClick={donner}>Générer un autre QR</Button>
        </section>
        <p className={t.muted} style={{ textAlign: 'center' }}>Rien n'est imprimé ni envoyé : le QR ne sert qu'une fois.</p>
        <Button variant="ghost" block onClick={terminer}>Fermer</Button>
      </div>
    )
  }

  // ── Compte choisi : vérification d'identité ──
  if (compte) {
    const annule = !!compte.billet?.annule
    const sansCompte = !!compte.billet?.sansCompte
    return (
      <div className={t.stack} style={wrap}>
        <button type="button" className={s.back} onClick={() => { setCompte(null); setVerifie(false); setErr('') }}><ChevronLeft size={16} /> Lien perdu</button>
        <section className={t.card}>
          <div className={s.head}>
            <div><b className={s.nom}>{compte.nom || '—'}</b>
              <span className={t.muted}>{compte.billet?.code ? `Billet ${compte.billet.code}${compte.billet.pass ? ` · ${compte.billet.pass}` : ''}${compte.billet.commande ? ` · commande ${compte.billet.commande}` : ''}` : 'Compte sans billet'}</span></div>
            {compte.billet?.code && <Badge tone={annule ? 'danger' : sansCompte ? 'neutral' : 'success'}>{annule ? 'Billet annulé' : sansCompte ? 'Billet sans compte' : 'Billet valable'}</Badge>}
          </div>
          <div className={s.total}><span className={t.muted}>Solde</span><b>{fmt(compte.solde || 0)}</b></div>
          {annule ? (
            <p className={t.err} role="alert">Ce billet a été annulé : on ne donne pas de nouveau lien. Le solde se rembourse depuis Remboursement.</p>
          ) : sansCompte ? (
            <p className={t.warn}><AlertTriangle size={16} aria-hidden="true" /><span>Billet sans compte, choisi ainsi à l'achat sur le site : pas de lien possible. Son porteur commande et paie à la billetterie (Commande sur place).</span></p>
          ) : (<>
            <label className={s.part} style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <input type="checkbox" checked={verifie} onChange={e => setVerifie(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--brand)' }} />
              <span style={{ fontSize: 'var(--fs-13)' }}>J'ai vérifié une pièce d'identité au nom de <b>{compte.nom}</b></span>
            </label>
            {err && <p className={t.err} role="alert">{err}</p>}
            <HoldButton tone="coral" block disabled={!verifie || busy} onConfirm={donner} fillingLabel="Gardez appuyé…">
              Maintenir pour donner un nouveau lien
            </HoldButton>
            <p className={t.muted}>L'ancien lien cessera de fonctionner tout de suite, sur tous les téléphones.</p>
          </>)}
        </section>
      </div>
    )
  }

  // ── Recherche ──
  return (
    <div className={t.stack} style={wrap}>
      <p className={t.hint}>Pour un spectateur qui a changé de téléphone ou n'a pas reçu son lien.</p>
      <div className={t.search}>
        <label className={t.label} htmlFor="lien-q">Nom ou code du billet</label>
        <div className={t.searchRow}>
          <input id="lien-q" className={t.input} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" placeholder="Bernard, ou K7P2QD" />
          <Button icon={Search} iconOnly aria-label="Chercher" />
        </div>
      </div>
      {q.trim().length >= 2 && <span className={t.label}>{resultats.length} compte{resultats.length > 1 ? 's' : ''}</span>}
      {resultats.map(x => (
        <button key={x._docId || x.id} type="button" className={s.row} onClick={() => { setCompte(x); setErr('') }}>
          <span className={s.rowMain}>
            <b>{x.nom || '—'}</b>
            <span className={t.muted}>{x.billet?.code ? `Billet ${x.billet.code}${x.billet.pass ? ` · ${x.billet.pass}` : ''}${x.billet.sansCompte ? ' · sans compte' : ''}` : 'Compte sans billet'}</span>
          </span>
          <span className={s.rowEnd}><b>{fmt(x.solde || 0)}</b></span>
        </button>
      ))}
    </div>
  )
}
