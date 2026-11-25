/**
 * components/RemboursementSolde.jsx — remboursement du solde depuis l'espace artiste ou bénévole
 * (25/11/2026, choix de l'organisateur : « Bouton, sans e-mail » ; maquette VKnRaBq51B1ZpCwrDSsFon)
 *
 * Même parcours que l'espace spectateur (pages/public/SoldePage.jsx) : la part rechargée en ligne
 * revient tout de suite sur la carte (Stripe), la carte et les espèces de la billetterie se reprennent
 * au guichet (onglet « Demandes » de la billetterie). Bouton à garder appuyé 3 s, date limite, et don
 * à l'ONG Ylla. Le serveur (api/paiement : rembourser, annulerDemande, don) fait seul foi.
 */
import React, { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Globe, CreditCard, Banknote, Heart, Undo2, ChevronRight } from 'lucide-react'
import { db } from '../firebase/config'
import { apiFetch } from '../firebase/session'
import { fmt } from '../utils/helpers'
import { friendlyError } from '../utils/errors'
import { planRemboursement } from '../utils/remboursementPlan'
import { montantDon, limiteRemboursement, delaiDepasse, DON_MIN } from '../utils/dons'
import { Badge, Empty, HoldButton, Sheet, toast } from '../ui'

/** Demandes de remboursement de ce porte-monnaie (les plus récentes d'abord) */
export function useDemandesRemboursement(eventId, specId) {
  const [demandes, setDemandes] = useState([])
  useEffect(() => {
    if (!eventId || !specId) return
    return onSnapshot(query(collection(db, 'events', eventId, 'demandes-remboursement'), where('specId', '==', specId)),
      snap => setDemandes(snap.docs.map(x => ({ ...x.data(), id: x.id }))
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))),
      () => {})
  }, [eventId, specId])
  return demandes
}

const DEMANDE_STATUT = {
  en_attente: ['warning', 'En attente billetterie'],
  rembourse:  ['success', 'Remboursé'],
  annule:     ['neutral', 'Annulée'],
  refuse:     ['danger', 'Refusée'],
  echec:      ['danger', 'Échec'],
}
const ETAT_PART = {
  a_traiter: ['warning', 'À la billetterie'],
  rembourse: ['success', 'Remboursé'],
  annule:    ['neutral', 'Annulé'],
  refuse:    ['danger', 'Refusé'],
}
const ETAT_STRIPE = { rembourse: ['success', 'Remboursé · 5 à 10 jours'], partiel: ['warning', 'Remboursé en partie'], echec: ['danger', 'Refusé par la banque'], en_cours: ['warning', 'En cours'] }
const ICONE = { enligne: [Globe, 'var(--brand-light)', 'var(--brand-dark)'], sumup: [CreditCard, 'var(--gold-light)', 'var(--gold-dark)'], especes: [Banknote, 'var(--gold-light)', 'var(--gold-dark)'] }

const col = { display: 'grid', gap: 12 }
const carte = { display: 'grid', gap: 10, padding: 16, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg)' }
const mu = { margin: 0, color: 'var(--muted)', fontSize: 'var(--fs-13)', lineHeight: 1.5 }
const centre = { ...mu, textAlign: 'center' }
const gros = { font: '800 36px var(--font-display)', lineHeight: 1.1 }
const sec = { minHeight: 46, borderRadius: 12, border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', font: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }

function Ligne({ kind, titre, sous, montant, etat }) {
  const [Icon, bg, fg] = ICONE[kind]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: bg, color: fg }}><Icon size={18} aria-hidden="true"/></span>
      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <b>{titre}</b>
        {sous && <span style={{ ...mu, fontSize: 'var(--fs-12)' }}>{sous}</span>}
        {etat && <span><Badge tone={etat[0]}>{etat[1]}</Badge></span>}
      </span>
      <b>{fmt(montant || 0)}</b>
    </div>
  )
}

/** Ligne « Me faire rembourser mon solde » / « Suivre ma demande de remboursement », dans la carte du solde */
export function LienRemboursement({ compte, demandes, onOpen }) {
  const enCours = demandes.some(d => d.statut === 'en_attente')
  if (!compte || (!enCours && !((compte.solde || 0) > 0))) return null
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2)', color: 'var(--text)', font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--coral-light)', color: 'var(--coral-dark)', flex: 'none' }}><Undo2 size={18} aria-hidden="true"/></span>
      <b style={{ flex: 1 }}>{enCours ? 'Suivre ma demande de remboursement' : 'Me faire rembourser mon solde'}</b>
      <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--muted)' }}/>
    </button>
  )
}

/**
 * Fenêtre « Remboursement ». compte : porte-monnaie { id, solde } ; txs : ses mouvements (tous) ;
 * demandes : useDemandesRemboursement ; evenement : document de l'événement (date limite).
 */
export default function RemboursementSolde({ open, onClose, eventId, compte, txs = [], demandes = [], evenement }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [masquer, setMasquer] = useState(null)       // demande terminée que l'on range (« Nouvelle demande »)
  const [don, setDon] = useState(false)
  const [donChoix, setDonChoix] = useState(null)
  const [donAutre, setDonAutre] = useState('')
  const [donFait, setDonFait] = useState(null)
  if (!compte) return null

  const solde = compte.solde || 0
  const plan = planRemboursement({ solde, txs })
  const enCours = demandes.find(d => d.statut === 'en_attente') || null
  const recente = demandes.find(d => d.id !== masquer && d.timestamp && Date.now() - Date.parse(d.timestamp) < 10 * 60 * 1000) || null
  const vue = enCours || recente
  const limite = limiteRemboursement(evenement)
  const limiteTxt = limite ? new Date(limite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const clos = delaiDepasse(evenement)
  const peutDonner = !clos && !enCours && solde >= DON_MIN
  const donSaisi = donChoix != null ? donChoix : Math.round((parseFloat(String(donAutre).replace(',', '.')) || 0) * 100)
  const donMontant = montantDon(donSaisi, solde)

  const demander = async () => {
    setErr(''); setBusy(true)
    try { await apiFetch('/api/paiement', { body: { action: 'rembourser', ev: eventId } }) }
    catch (e) { setErr(friendlyError(e, 'La demande n\'a pas pu être envoyée. Réessayez.')) }
    finally { setBusy(false) }
  }
  const annuler = async () => {
    if (!enCours) return
    setErr('')
    try { await apiFetch('/api/paiement', { body: { action: 'annulerDemande', ev: eventId, id: enCours.id } }) }
    catch (e) { setErr(friendlyError(e, 'L\'annulation n\'a pas pu être faite.')) }
  }
  const donner = async () => {
    if (!donMontant) return
    setErr(''); setBusy(true)
    try {
      const r = await apiFetch('/api/paiement', { body: { action: 'don', ev: eventId, montant: donMontant } })
      setDon(false); setDonFait(r); toast.success('Merci pour votre don !')
    } catch (e) { setErr(friendlyError(e, "Le don n'a pas été enregistré. Réessayez.")) }
    finally { setBusy(false) }
  }
  const fermer = () => { setDon(false); setDonFait(null); setErr(''); onClose() }

  let corps
  if (donFait) {
    corps = (
      <section style={{ ...carte, textAlign: 'center', justifyItems: 'center' }}>
        <Heart size={28} aria-hidden="true" style={{ color: 'var(--coral)' }}/>
        <b style={gros}>{fmt(donFait.montant || 0)}</b>
        <p style={mu}>donnés à l'ONG Ylla pour la lutte contre le cancer du sein. Solde restant : <b>{fmt(solde)}</b>.</p>
        <button type="button" style={{ ...sec, width: '100%' }} onClick={fermer}>Fermer</button>
      </section>
    )
  } else if (don) {
    corps = (
      <section style={carte}>
        <b>Faire un don à l'ONG Ylla</b>
        <p style={mu}>La totalité de votre don est reversée à l'ONG Ylla, engagée contre le cancer du sein. Un don est définitif : il ne peut pas être remboursé.</p>
        <div role="group" aria-label="Montant du don" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[200, 500, 1000, 2000].filter(m => m < solde).map(m => (
            <button key={m} type="button" aria-pressed={donChoix === m} onClick={() => { setDonChoix(m); setDonAutre('') }}
              style={{ ...sec, minHeight: 40, padding: '0 16px', borderRadius: 99, ...(donChoix === m ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'var(--on-brand)' } : {}) }}>{m / 100} €</button>
          ))}
          <button type="button" aria-pressed={donChoix === solde} onClick={() => { setDonChoix(solde); setDonAutre('') }}
            style={{ ...sec, minHeight: 40, padding: '0 16px', borderRadius: 99, ...(donChoix === solde ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'var(--on-brand)' } : {}) }}>Tout</button>
          <input inputMode="decimal" placeholder="Autre" aria-label="Autre montant en euros" value={donAutre}
            onFocus={() => setDonChoix(null)} onChange={e => { setDonChoix(null); setDonAutre(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6)) }}
            style={{ width: 90, minHeight: 40, borderRadius: 99, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', padding: '0 14px', font: 'inherit' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Solde après le don</span><b>{donMontant ? fmt(solde - donMontant) : '—'}</b></div>
        {!donMontant && donSaisi > 0 && <p style={{ ...mu, color: 'var(--danger, #B42318)' }} role="alert">{donSaisi > solde ? `Le don ne peut pas dépasser votre solde de ${fmt(solde)}.` : 'Le don minimum est de 1 €.'}</p>}
        <HoldButton tone="brand" block duration={3000} disabled={busy || !donMontant} onConfirm={donner}
          fillingLabel="Gardez appuyé…" doneLabel="Merci !" hint="Gardez le doigt appuyé 3 secondes pour confirmer">
          {donMontant ? `Donner ${fmt(donMontant)} à l'ONG Ylla` : 'Choisissez un montant'}
        </HoldButton>
        <p style={centre}>Gardez le doigt appuyé 3 secondes pour confirmer</p>
        <button type="button" style={sec} onClick={() => setDon(false)}>Retour</button>
      </section>
    )
  } else {
    corps = (<>
      {clos ? (
        <section style={carte}>
          <p style={mu}>Le remboursement était possible jusqu'au {limiteTxt}. Passé cette date, les soldes non réclamés sont reversés à l'ONG Ylla, pour la lutte contre le cancer du sein.</p>
        </section>
      ) : vue ? (
        <section style={carte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b>Ma demande</b>
            <Badge tone={(DEMANDE_STATUT[vue.statut] || DEMANDE_STATUT.en_attente)[0]}>{(DEMANDE_STATUT[vue.statut] || DEMANDE_STATUT.en_attente)[1]}</Badge>
          </div>
          <span style={mu}>{fmt(vue.total || 0)} · demandée le {String(vue.date || '').slice(0, 5)} à {String(vue.heure || '').slice(0, 5)}</span>
          <div>
            {vue.stripe?.statut && vue.stripe.statut !== 'sans' && <Ligne kind="enligne" titre="Carte du paiement en ligne" montant={vue.stripe.rendu ?? vue.stripe.montant} etat={ETAT_STRIPE[vue.stripe.statut]}/>}
            {vue.sumup?.statut && vue.sumup.statut !== 'sans' && <Ligne kind="sumup" titre="Carte utilisée à la billetterie" montant={vue.sumup.rendu ?? vue.sumup.montant} etat={ETAT_PART[vue.sumup.statut]}/>}
            {vue.especes?.statut && vue.especes.statut !== 'sans' && <Ligne kind="especes" titre="Espèces" montant={vue.especes.rendu ?? vue.especes.montant} etat={ETAT_PART[vue.especes.statut]}/>}
          </div>
          {vue.statut === 'en_attente' && <p style={mu}><b>Solde restant : {fmt(solde)}.</b> Présentez votre QR à la billetterie pour la suite. Vous pouvez encore dépenser votre solde d'ici là.</p>}
          {vue.stripe?.statut === 'echec' && <p style={{ ...mu, color: 'var(--danger, #B42318)' }} role="alert">La banque a refusé le remboursement sur la carte : le montant est revenu sur votre solde. Présentez-vous à la billetterie.</p>}
          {vue.statut === 'en_attente'
            ? <button type="button" style={sec} onClick={annuler}>Annuler la partie billetterie</button>
            : solde > 0 && <button type="button" style={sec} onClick={() => setMasquer(vue.id)}>Nouvelle demande</button>}
        </section>
      ) : plan.total > 0 ? (
        <section style={carte}>
          <span style={mu}>Solde restant</span>
          <b style={gros}>{fmt(plan.total)}</b>
          <div>
            {plan.stripeTotal > 0 && <Ligne kind="enligne" titre="Rechargé en ligne" sous="remboursé tout de suite sur votre carte" montant={plan.stripeTotal}/>}
            {plan.sumup > 0 && <Ligne kind="sumup" titre="Carte à la billetterie" sous="remboursé par la billetterie" montant={plan.sumup}/>}
            {plan.especes > 0 && <Ligne kind="especes" titre="Espèces" sous="à reprendre à la billetterie" montant={plan.especes}/>}
          </div>
          <HoldButton tone="coral" block duration={3000} disabled={busy} onConfirm={demander}
            fillingLabel="Gardez appuyé…" doneLabel="Demande envoyée" hint="Gardez le doigt appuyé 3 secondes pour confirmer">
            Me faire rembourser {fmt(plan.total)}
          </HoldButton>
          <p style={centre}>Gardez le doigt appuyé 3 secondes pour confirmer. Aucun frais.</p>
          {limiteTxt && <p style={centre}>Remboursement possible jusqu'au {limiteTxt}.</p>}
        </section>
      ) : (
        <section style={carte}><Empty icon={Undo2} title="Rien à rembourser">Votre solde est à zéro.</Empty></section>
      )}
      {peutDonner && (
        <section style={carte}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--coral-light)', color: 'var(--coral-dark)', flex: 'none' }}><Heart size={18} aria-hidden="true"/></span>
            <span><b>Faire un don</b><br/><span style={mu}>Offrez tout ou partie de votre solde à l'ONG Ylla, engagée contre le cancer du sein.</span></span>
          </div>
          <button type="button" style={sec} onClick={() => { setErr(''); setDonAutre(''); setDonChoix(solde >= 1000 ? 1000 : solde); setDon(true) }}><Heart size={18} aria-hidden="true"/> Donner à l'ONG Ylla</button>
          {limiteTxt && <p style={centre}>Après le {limiteTxt}, un solde non réclamé est reversé à l'ONG Ylla.</p>}
        </section>
      )}
    </>)
  }

  return (
    <Sheet open={open} onClose={fermer} title="Remboursement">
      <div style={col}>
        <span style={centre}>Solde : {fmt(solde)}</span>
        {corps}
        {err && <p style={{ ...mu, color: 'var(--danger, #B42318)' }} role="alert">{err}</p>}
      </div>
    </Sheet>
  )
}
