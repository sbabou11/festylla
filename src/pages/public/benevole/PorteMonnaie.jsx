/**
 * pages/public/benevole/PorteMonnaie.jsx — solde du bénévole (écran 13, 24/11/2026)
 *
 * Choix de l'organisateur : le bénévole a un solde comme un spectateur. Il le recharge en ligne par
 * carte (Stripe, comme les spectateurs) ou à la billetterie en montrant son QR, et s'en sert sur toute
 * la carte ; ses avantages offerts s'ajoutent à ce solde.
 * Le solde est un porte-monnaie de type spectateur relié à sa fiche, ouvert par le serveur
 * (api/session, mode « porte-monnaie ») : la session du bénévole le désigne ensuite (specId).
 */
import React, { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { CreditCard, ShoppingCart, Lock } from 'lucide-react'
import { db, auth } from '../../../firebase/config'
import { apiFetch, openFirebaseSession } from '../../../firebase/session'
import { fmt } from '../../../utils/helpers'
import { friendlyError } from '../../../utils/errors'
import { Sheet, toast } from '../../../ui'
import s from './PorteMonnaie.module.css'

/** { compte: { id, docId, solde } | null, mouvements, pret, erreur } */
export function usePorteMonnaie({ eventId, actif, demo = false }) {
  const [ref, setRef] = useState(null)          // { id, docId }
  const [compte, setCompte] = useState(null)
  const [mouvements, setMouvements] = useState([])
  const [erreur, setErreur] = useState('')

  // Ouvre le porte-monnaie (créé à la première fois) ; la session reçoit son numéro
  useEffect(() => {
    if (demo) { setCompte({ id: 'FY-BVDEMO24', docId: 'FY-BVDEMO24', solde: 1500 }); return }
    if (!actif || !eventId) return
    let vivant = true
    ;(async () => {
      try {
        const c = (await auth.currentUser?.getIdTokenResult().catch(() => null))?.claims || {}
        if (c.specId && c.specDoc) { if (vivant) setRef({ id: c.specId, docId: c.specDoc }); return }
        const r = await apiFetch('/api/session', { body: { mode: 'porte-monnaie', ev: eventId } })
        await openFirebaseSession(r.token)
        if (vivant) setRef({ id: r.compte.id, docId: r.compte.docId })
      } catch (e) { if (vivant) setErreur(friendlyError(e, 'Votre solde n\'a pas pu être chargé.')) }
    })()
    return () => { vivant = false }
  }, [actif, eventId, demo])

  useEffect(() => {
    if (!ref || !eventId) return
    const off1 = onSnapshot(doc(db, 'events', eventId, 'spectateurs', ref.docId),
      snap => setCompte(snap.exists() ? { ...snap.data(), docId: snap.id } : null), () => {})
    const off2 = onSnapshot(query(collection(db, 'events', eventId, 'transactions'), where('specId', '==', ref.id)),   // tous : le remboursement répartit selon chaque recharge
      snap => setMouvements(snap.docs.map(d => d.data()).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))),
      () => {})
    return () => { off1(); off2() }
  }, [ref, eventId])

  return { compte, mouvements, erreur, pret: !!compte }
}

const signe = (t) => (t.type === 'credit' ? '+' : '−')
const libelle = (t) => t.type === 'credit'
  ? (t.moyen === 'en-ligne' ? 'Recharge en ligne' : `Recharge billetterie · ${t.moyen === 'cb' ? 'carte' : 'espèces'}`)
  : (t.label || 'Achat').replace(/^Commande #\d+ (\(code \d+\) )?— /, '')

/** Carte « Mon solde » de l'accueil */
export function CarteSolde({ pm, onRecharger, onCommander, children }) {
  if (pm.erreur) return <section className={`nv-glass ${s.carte}`}><p className={s.mu}>{pm.erreur}</p></section>
  if (!pm.compte) return null
  const derniers = pm.mouvements.filter(t => t.type === 'credit' || t.type === 'debit').slice(0, 3)
  return (
    <section className={`nv-glass ${s.carte}`} aria-label="Mon solde">
      <span className={s.mu}>Mon solde</span>
      <span className={`nv-big ${s.solde}`}>{fmt(pm.compte.solde || 0)}</span>
      <p className={s.mu}>À dépenser sur toute la carte, comme un spectateur. Remboursable, ou à donner à l'ONG Ylla.</p>
      <div className={s.duo}>
        <button type="button" className="nv-btn nv-press" onClick={onRecharger}><CreditCard size={18} aria-hidden="true" /> Recharger</button>
        <button type="button" className="nv-btn-sec nv-press" onClick={onCommander}><ShoppingCart size={18} aria-hidden="true" /> Commander</button>
      </div>
      <p className={`${s.mu} ${s.centre}`}>Ou à la billetterie : montrez votre QR (en haut à droite).</p>
      {children}
      {derniers.length > 0 && (
        <div className={s.liste}>
          {derniers.map((t, i) => (
            <div key={i} className={s.ligne}><span>{libelle(t)}</span><b>{signe(t)}{fmt(t.montant || 0)}</b></div>
          ))}
        </div>
      )}
      <span className={`${s.mu} ${s.centre}`}>N° de porte-monnaie : {pm.compte.id}</span>
    </section>
  )
}

/** Recharge en ligne (Stripe), mêmes bornes que les spectateurs : 5 € à 200 €, sans frais */
export function RechargerSheet({ open, onClose, pm, eventId, demo, texteBas }) {
  const [montant, setMontant] = useState(2000)
  const [autre, setAutre] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const choisi = autre ? Math.round((parseFloat(autre.replace(',', '.')) || 0) * 100) : montant
  const ok = choisi >= 500 && choisi <= 20000

  const payer = async () => {
    if (!ok) { setErr('Choisissez un montant entre 5 € et 200 €.'); return }
    if (demo) { toast.info('Démonstration : pas de paiement réel.'); onClose(); return }
    setBusy(true); setErr('')
    try {
      // Retour sur cette page, sans la clé du lien personnel (gardée par l'appareil)
      const u = new URL(window.location.href)
      for (const k of ['k', 'recharge', 'annule']) u.searchParams.delete(k)
      const r = await apiFetch('/api/paiement', { body: { action: 'creer', ev: eventId, montant: choisi, retour: u.toString() } })
      window.location.assign(r.url)
    } catch (e) { setErr(friendlyError(e, 'Le paiement en ligne est indisponible pour le moment.')); setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Recharger">
      <div className={s.recharge}>
        <span className={s.mu}>Solde : {fmt(pm.compte?.solde || 0)}</span>
        <span className={`nv-big ${s.montant}`}>{ok ? fmt(choisi) : '—'}</span>
        <span className={s.mu}>{ok ? `Sans frais · nouveau solde ${fmt((pm.compte?.solde || 0) + choisi)}` : 'Sans frais · de 5 € à 200 €'}</span>
        <span className={s.stripe}><Lock size={14} aria-hidden="true" /> Paiement sécurisé par Stripe</span>
        <div className="nv-pills" role="group" aria-label="Montants rapides" style={{ justifyContent: 'center' }}>
          {[1000, 2000, 5000].map(m => (
            <button key={m} type="button" className="nv-pill nv-press" aria-pressed={!autre && montant === m} onClick={() => { setMontant(m); setAutre(''); setErr('') }}>{m / 100} €</button>
          ))}
        </div>
        <label className={s.autre}><span>Autre montant (€)</span>
          <input inputMode="decimal" value={autre} onChange={e => { setAutre(e.target.value); setErr('') }} placeholder="Ex. 15" /></label>
        {err && <p className={s.err} role="alert">{err}</p>}
        <button type="button" className={`nv-btn nv-press ${s.payer}`} onClick={payer} disabled={busy || !ok}>
          <CreditCard size={18} aria-hidden="true" /> {busy ? 'Ouverture du paiement…' : `Payer ${ok ? fmt(choisi) : ''} par carte`}
        </button>
        <p className={`${s.mu} ${s.centre}`}>{texteBas || 'Même recharge que les spectateurs. Stripe vous envoie le reçu par e-mail.'}</p>
      </div>
    </Sheet>
  )
}

/** Retour de Stripe (?recharge=… ou ?annule=1) : message, puis adresse nettoyée */
export function useRetourStripe() {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (!p.has('recharge') && !p.has('annule')) return
    if (p.has('annule')) toast.info('Paiement annulé : rien n\'a été débité.')
    else toast.success('Paiement reçu : votre solde est crédité dès que Stripe le confirme.')
    p.delete('recharge'); p.delete('annule')
    const q = p.toString()
    window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''))
  }, [])
}
