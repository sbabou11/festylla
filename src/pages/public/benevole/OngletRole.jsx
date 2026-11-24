/**
 * pages/public/benevole/OngletRole.jsx — onglet de rôle de l'espace bénévole (écran 11, 24/11/2026)
 *
 * Un bénévole qui a un rôle d'équipe (écran 10) voit un onglet verrouillé. Il le déverrouille avec
 * son identifiant et son mot de passe, seulement pendant un créneau sur un poste de son rôle :
 * le serveur vérifie tout et donne un accès qui expire seul (api/session, modes role-*).
 * Étape 1 : verrou, déverrouillage, verrouillage manuel et automatique.
 * Étape 2 : les écrans du rôle (billetterie, entrée, suivi), ceux de l'espace équipe, dans l'onglet.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Lock, LockOpen, KeyRound, Clock, ChevronRight, ChevronLeft, Ticket, DoorOpen, BarChart3, Plus, ShoppingBag, ShoppingCart, Wallet, Link2, List, ScanLine, Bookmark, Watch } from 'lucide-react'
import { doc, onSnapshot } from 'firebase/firestore'
import { apiFetch, openFirebaseSession } from '../../../firebase/session'
import { auth, db } from '../../../firebase/config'
import { setCurrentEvent } from '../../../firebase/service'
import useAuthStore from '../../../store/useAuthStore'
import useEventStore from '../../../store/useEventStore'
import { useFirestore } from '../../../hooks/useFirestore'
import { friendlyError } from '../../../utils/errors'
import { Sheet, toast } from '../../../ui'
import s from './OngletRole.module.css'

export const ROLE_ONGLET = {
  billetterie:     { label: 'Billetterie', icon: Ticket },
  controle_entree: { label: 'Entrée', icon: DoorOpen },
  consultation:    { label: 'Suivi', icon: BarChart3 },
}
// Heure de Paris, « 15h35 »
const hm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

// Étape 2 (24/11/2026) : les écrans de l'équipe, ouverts dans l'onglet (mêmes pages que l'espace équipe)
const PAGES_ROLE = {
  credit:               lazy(() => import('../../billetterie/Credit')),
  'commande-sur-place': lazy(() => import('../../billetterie/CommandeSurPlace')),
  nouveau:              lazy(() => import('../../billetterie/Nouveau')),
  remboursement:        lazy(() => import('../../billetterie/Remboursement')),
  'lien-perdu':         lazy(() => import('../../billetterie/LienPerdu')),
  bracelets:            lazy(() => import('../../billetterie/Bracelets')),
  transactions:         lazy(() => import('../../admin/Transactions')),
  cloture:              lazy(() => import('../../admin/Cloture')),
  debit:                lazy(() => import('../../stand/Debit')),
  entree:               lazy(() => import('../../billetterie/Entree')),
  'reservations-admin': lazy(() => import('../../admin/Reservations')),
  analytics:            lazy(() => import('../../admin/Analytics')),
  comptabilite:         lazy(() => import('../../admin/Comptabilite')),
}
// Menu de chaque rôle : [page, icône, libellé]
const MENU_ROLE = {
  billetterie: [['credit', Plus, 'Recharger un compte'], ['commande-sur-place', ShoppingBag, 'Commande sur place'], ['nouveau', Ticket, 'Compte pour un billet'],
    ['remboursement', Wallet, 'Remboursement'], ['lien-perdu', Link2, 'Lien perdu'], ['bracelets', Watch, 'Bracelets'], ['transactions', List, 'Mes transactions'], ['cloture', Lock, 'Clôture de caisse']],
  controle_entree: [['entree', ScanLine, 'Scanner des billets']],
  consultation: [['transactions', List, 'Transactions'], ['reservations-admin', Bookmark, 'Réservations'], ['analytics', BarChart3, 'Analyses'], ['comptabilite', Wallet, 'Comptabilité']],
}

/**
 * Onglet ouvert : prend l'identité du rôle pour les pages de l'équipe (nom du bénévole, rôle), charge
 * leurs données, et rend tout au verrouillage. Le serveur et les règles limitent l'accès dans le temps.
 */
function EspaceRole({ role, ouvert, finCreneau, eventId, nom, ficheId, titre, bandeau, sousPage, setSousPage }) {
  const { ouvrirRoleBenevole, fermerRoleBenevole, setBorneEnPanne } = useAuthStore.getState()
  const borneEnPanne = useAuthStore(st => st.borneEnPanne)
  const pret = useAuthStore(st => st.user?.roleTemporaire === true && st.user?.role === role)

  useEffect(() => {
    ouvrirRoleBenevole({ role, nom, ficheId, eventId })
    if (eventId && useEventStore.getState().currentEventId !== eventId) useEventStore.setState({ currentEventId: eventId })
    setCurrentEvent(eventId)
    return () => { fermerRoleBenevole(); setBorneEnPanne(false) }
  }, [role, eventId, ficheId])   // eslint-disable-line react-hooks/exhaustive-deps

  // Données des pages de l'équipe (spectateurs, carte, transactions…), seulement pendant l'ouverture
  useFirestore({ enabled: pret })

  // Billetterie : « Encaisser » quand un admin déclare la borne en panne (écran 7)
  useEffect(() => {
    if (role !== 'billetterie' || !eventId) return
    return onSnapshot(doc(db, 'events', eventId, 'settings', 'global'), snap => setBorneEnPanne(snap.data()?.borneEnPanne === true), () => {})
  }, [role, eventId])   // eslint-disable-line react-hooks/exhaustive-deps

  const menu = [...(MENU_ROLE[role] || [])]
  if (role === 'billetterie' && borneEnPanne) menu.splice(2, 0, ['debit', ShoppingCart, 'Encaisser (borne en panne)'])
  // Contrôle entrée : une seule page, ouverte directement
  const page = role === 'controle_entree' ? 'entree' : sousPage
  const Page = page ? PAGES_ROLE[page] : null
  const libre = (cle) => ouvert.mode === 'cloture' ? cle === 'cloture' : !finCreneau

  if (!pret) return <p className={s.muted}>Ouverture…</p>

  if (Page) {
    const label = menu.find(m => m[0] === page)?.[2] || ''
    return (
      <>
        {role !== 'controle_entree' && (
          <button type="button" className={`nv-press ${s.retour}`} onClick={() => setSousPage(null)}>
            <ChevronLeft size={18} aria-hidden="true" /> {ROLE_ONGLET[role].label}
          </button>
        )}
        {role === 'controle_entree' ? titre : <p className="nv-title" aria-hidden="true">{label}</p>}
        {bandeau}
        <div className={s.page}>
          <Suspense fallback={<p className={s.muted}>Chargement…</p>}>
            <Page onNavigate={(p) => { if (PAGES_ROLE[p] && menu.some(m => m[0] === p) && libre(p)) setSousPage(p) }} view={role} />
          </Suspense>
        </div>
      </>
    )
  }

  return (
    <>
      {titre}
      {bandeau}
      <section className={`nv-glass ${s.carte}`}>
        {menu.map(([cle, I, t]) => {
          const off = !libre(cle)
          return (
            <button key={cle} type="button" className={`nv-press ${s.ligne} ${off ? s.off : ''}`} disabled={off} onClick={() => setSousPage(cle)}>
              <span className={`nv-ic neutre ${s.ic}`}><I size={20} aria-hidden="true" /></span><b>{t}</b><ChevronRight size={18} aria-hidden="true" className={s.chev} />
            </button>
          )
        })}
      </section>
    </>
  )
}

/** État de l'onglet, lu du serveur ; ouvert = jeton actuel avec le rôle (claims) */
export function useOngletRole({ eventId, role, actif, demo = false }) {
  const [etat, setEtat] = useState(null)          // réponse role-etat
  const [ouvert, setOuvert] = useState(null)      // { mode, fin, jusqua } ou null
  const decalage = useRef(0)                      // heure du serveur − heure du téléphone
  const maintenant = () => Date.now() + decalage.current

  // Page de démonstration (/ui/benevole) : créneau simulé, sans serveur ni vrai déverrouillage
  const debutDemo = useRef(Date.now() - 3600000).current

  const lireJeton = useCallback(async () => {
    const r = await auth.currentUser?.getIdTokenResult().catch(() => null)
    const c = r?.claims || {}
    setOuvert(c.roleEquipe && Number(c.roleJusqua) > maintenant() ? { mode: c.roleMode, fin: Number(c.roleFin), jusqua: Number(c.roleJusqua) } : null)
  }, [])
  const rafraichir = useCallback(async () => {
    if (!actif || !eventId || !role) return
    try {
      const r = await apiFetch('/api/session', { body: { mode: 'role-etat', ev: eventId } })
      decalage.current = (r.maintenant || Date.now()) - Date.now()
      setEtat(r)
      // Écran 12 : ouverture exceptionnelle annulée par un admin → on reprend tout de suite le jeton du bénévole
      const c = (await auth.currentUser?.getIdTokenResult().catch(() => null))?.claims || {}
      if (c.roleEquipe && !r.ouvert) {
        const f = await apiFetch('/api/session', { body: { mode: 'role-fermer', ev: eventId } })
        await openFirebaseSession(f.token)
        setOuvert(null)
        if (c.roleExc) toast.info('Ouverture exceptionnelle annulée par l\'organisation : onglet verrouillé')
        return
      }
      await lireJeton()
    } catch { /* hors ligne : on garde le dernier état */ }
  }, [actif, eventId, role, lireJeton])

  useEffect(() => {
    rafraichir()
    const t = setInterval(rafraichir, 60000)
    const vu = () => { if (document.visibilityState === 'visible') rafraichir() }
    document.addEventListener('visibilitychange', vu)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vu) }
  }, [rafraichir])

  const deverrouiller = async (identifiant, motDePasse) => {
    const r = await apiFetch('/api/session', { body: { mode: 'role', ev: eventId, identifiant, motDePasse } })
    decalage.current = (r.maintenant || Date.now()) - Date.now()
    await openFirebaseSession(r.token)
    setOuvert({ mode: r.etat === 'cloture' ? 'cloture' : 'complet', fin: r.fin, jusqua: r.jusqua })
    setEtat(e => ({ ...(e || {}), ...r }))
    return r
  }
  const verrouiller = async () => {
    const r = await apiFetch('/api/session', { body: { mode: 'role-fermer', ev: eventId } })
    await openFirebaseSession(r.token)
    setOuvert(null)
    rafraichir()
  }
  if (demo) {
    const fenetre = { etat: 'ouvert', debut: debutDemo, fin: debutDemo + 3 * 3600000, jusqua: debutDemo + 3 * 3600000 + 600000, poste: 'Billetterie' }
    return {
      etat: role ? { role, ...fenetre } : null, ouvert, maintenant,
      deverrouiller: async () => { setOuvert({ mode: 'complet', fin: fenetre.fin, jusqua: fenetre.jusqua }); return fenetre },
      verrouiller: async () => setOuvert(null),
    }
  }
  return { etat, ouvert, deverrouiller, verrouiller, maintenant }
}

/**
 * occupe : une opération est en cours (étape 2) ; à la fin du créneau, l'onglet attend qu'elle se
 * termine avant de se verrouiller (le serveur laisse 10 min de marge).
 */
export default function OngletRole({ role, onglet, visible = true, eventId, nom, ficheId }) {
  const { etat, ouvert, deverrouiller, verrouiller, maintenant } = onglet
  // Une page du rôle est ouverte (étape 2) : à la fin du créneau, on attend que la personne en sorte
  const [sousPage, setSousPage] = useState(null)
  const encaisse = useAuthStore(st => st.encaissementEnCours)
  const occupe = !!sousPage || encaisse
  useEffect(() => { if (!ouvert) setSousPage(null) }, [ouvert])
  const [sheet, setSheet] = useState(false)
  const [ident, setIdent] = useState('')
  const [mdp, setMdp] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const R = ROLE_ONGLET[role] || ROLE_ONGLET.billetterie
  const Icon = R.icon

  // Verrouillage automatique : fin du créneau (ou de la clôture), jamais au milieu d'une opération
  useEffect(() => {
    if (!ouvert) return
    const t = setInterval(() => {
      tick(n => n + 1)
      const limite = ouvert.mode === 'cloture' ? ouvert.jusqua : ouvert.fin
      if (maintenant() >= ouvert.jusqua || (maintenant() >= limite && !occupe)) {
        verrouiller().then(() => toast.info('Créneau terminé : onglet verrouillé automatiquement')).catch(() => {})
      }
    }, 5000)
    return () => clearInterval(t)
  }, [ouvert, occupe])   // eslint-disable-line react-hooks/exhaustive-deps

  const envoyer = async () => {
    if (!ident.trim() || !mdp) { setErr('Identifiant et mot de passe.'); return }
    setBusy(true); setErr('')
    try {
      const r = await deverrouiller(ident.trim(), mdp)
      setSheet(false); setMdp('')
      toast.success(r.etat === 'cloture' ? `Déverrouillé pour la clôture, jusqu'à ${hm(r.jusqua)}` : `Déverrouillé jusqu'à ${hm(r.fin)} · noté au journal`)
    } catch (e) { setErr(friendlyError(e, 'Déverrouillage impossible.')) }
    finally { setBusy(false) }
  }
  const fermer = async () => {
    try { await verrouiller(); toast.info('Onglet verrouillé') } catch (e) { toast.error(friendlyError(e, 'Verrouillage impossible.')) }
  }

  const titre = <p className="nv-title" aria-hidden="true">{R.label}</p>

  if (ouvert) {
    const finCreneau = maintenant() >= ouvert.fin
    const bandeau = ouvert.mode === 'cloture' ? (
      <div className={`${s.band} ${s.warn}`}><Clock size={18} aria-hidden="true" /><span>Créneau terminé : seule la <b>clôture de caisse</b> reste ouverte, jusqu'à {hm(ouvert.jusqua)}.</span></div>
    ) : finCreneau ? (
      <div className={`${s.band} ${s.warn}`}><Clock size={18} aria-hidden="true" /><span><b>Créneau terminé à {hm(ouvert.fin)}.</b> Finissez l'opération en cours : l'onglet se verrouillera ensuite, sans rien couper.</span></div>
    ) : (
      <div className={`${s.band} ${s.ok}`}><LockOpen size={18} aria-hidden="true" /><span>
        {etat?.exception ? `Ouverture exceptionnelle jusqu'à ${hm(ouvert.fin)} (accordée par ${etat.exception.parNom || 'l\'organisation'}).` : `Déverrouillé jusqu'à ${hm(ouvert.fin)} (heure du serveur).`}{' '}
        <button type="button" className={s.lien} onClick={fermer}>Verrouiller maintenant</button></span></div>
    )
    // Reste monté quand on change d'onglet (une vente en cours n'est pas perdue), caché seulement
    return (
      <div className={s.wrap} hidden={!visible}>
        <EspaceRole role={role} ouvert={ouvert} finCreneau={finCreneau} eventId={eventId} nom={nom} ficheId={ficheId}
          titre={titre} bandeau={bandeau} sousPage={sousPage} setSousPage={setSousPage} />
      </div>
    )
  }
  if (!visible) return null

  // Verrouillé : pourquoi, et depuis quand c'est possible
  const e = etat?.etat
  const poste = etat?.poste || etat?.prochain?.poste || ''
  let texte, bouton = null
  if (!etat) texte = 'Vérification de votre créneau…'
  else if (etat.attenteEm && e !== 'ouvert' && e !== 'cloture') texte = 'Vos créneaux ne sont pas encore arrivés d\'Event Manager : l\'onglet reste fermé pour l\'instant.'
  // Règle d'échange 1.2 : un créneau de votre rôle n'a pas d'horaire dans Event Manager
  else if (etat.sansHoraire && e === 'ferme') texte = 'Créneau sans horaire dans Event Manager : demandez à l\'organisation de le compléter.'
  else if (e === 'ouvert' && etat.exception) { texte = `Ouverture exceptionnelle accordée par ${etat.exception.parNom || 'l\'organisation'} jusqu'à ${hm(etat.fin)}. Identifiez-vous pour déverrouiller.`; bouton = 'Déverrouiller' }
  else if (e === 'ouvert') { texte = `Créneau ${hm(etat.debut)} – ${hm(etat.fin)}${poste ? ` au poste « ${poste} »` : ''}. Identifiez-vous ; l'onglet se verrouillera tout seul à ${hm(etat.fin)}.`; bouton = 'Déverrouiller' }
  else if (e === 'cloture') { texte = `Votre créneau est terminé. Vous pouvez encore clôturer votre caisse jusqu'à ${hm(etat.jusqua)}.`; bouton = 'Déverrouiller pour la clôture' }
  else if (e === 'tot') texte = `Votre prochain créneau${poste ? ` au poste « ${poste} »` : ''} commence à ${hm(etat.prochain.debut)}. Vous pourrez déverrouiller à partir de ${hm(etat.ouvreA)} (15 min avant).`
  else texte = 'Pas de créneau en cours sur un poste de votre rôle. L\'onglet rouvrira à votre prochain créneau ; si un créneau manque, demandez à l\'organisation.'

  return (
    <div className={s.wrap}>
      {titre}
      <section className={`nv-glass ${s.verrou}`}>
        <span className={`nv-ic neutre ${s.gros}`}><Lock size={28} aria-hidden="true" /></span>
        <h2>{R.label} · {bouton ? 'verrouillé' : 'fermé'}</h2>
        <p className={s.muted}>{texte}</p>
        {bouton && <button type="button" className="nv-btn nv-press" onClick={() => { setErr(''); setSheet(true) }}><KeyRound size={20} aria-hidden="true" /> {bouton}</button>}
      </section>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={`Déverrouiller « ${R.label} »`}>
        <form className={s.form} onSubmit={ev => { ev.preventDefault(); envoyer() }}>
          <p className={s.muted}>Identifiant et mot de passe reçus de l'organisation.</p>
          <label className={s.champ}><span>Identifiant</span>
            <input value={ident} onChange={ev => setIdent(ev.target.value)} autoCapitalize="none" autoComplete="username" spellCheck={false} /></label>
          <label className={s.champ}><span>Mot de passe</span>
            <input type="password" value={mdp} onChange={ev => setMdp(ev.target.value)} autoComplete="current-password" aria-describedby="role-err" /></label>
          <p id="role-err" className={s.err} role="alert">{err}</p>
          <button type="submit" className="nv-btn nv-press" disabled={busy}><Icon size={20} aria-hidden="true" /> {busy ? 'Vérification…' : 'Déverrouiller'}</button>
        </form>
      </Sheet>
    </div>
  )
}
