/**
 * pages/dev/DevDashboard.jsx — aperçu du shell + tableau de bord avec données d'exemple
 * Développement uniquement (route /ui/dashboard, ?page=<id de la page>, toutes les pages du menu admin).
 * Sous 641 px : barre du bas et menu « Plus », comme l'app staff.
 * Compte de démo et actions des stores simulés (recharge, encaissement, retrait, réservations, profil).
 * Les écrans qui lisent Firestore directement (Bénévoles, Retrait…) restent vides sur l'événement « demo ».
 */
import React, { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Search } from 'lucide-react'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import Sidebar from '../../components/Sidebar'
import BottomNav from '../../components/BottomNav'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import CommandPalette from '../../components/CommandPalette'
import Dashboard from '../admin/Dashboard'
import Analytics from '../admin/Analytics'
import Cloture from '../admin/Cloture'
import Planning from '../admin/Planning'
import Staff from '../admin/Staff'
import Menu from '../admin/Menu'
import Settings from '../admin/Settings'
import Transactions from '../admin/Transactions'
import Alertes from '../admin/Alertes'
import QrEntree from '../admin/QrEntree'
import Benevoles from '../admin/Benevoles'
import Reservations from '../admin/Reservations'
import Spectateurs from '../admin/Spectateurs'
import MonProfil from '../shared/MonProfil'
import Nouveau from '../billetterie/Nouveau'
import Credit from '../billetterie/Credit'
import Retrait from '../stand/Retrait'
import Debit from '../stand/Debit'
import shell from '../../App.module.css'

const H = 3600 * 1000
const NAMES = ['Léa Martin', 'Karim Benali', 'Inès Diallo', 'Tom Robert', 'Awa Sow', 'Hugo Petit', 'Nora Haddad', 'Yanis Morel']
const ITEMS = [['Bière pression', 500], ['Limonade maison', 350], ['Bissap', 300], ['Crêpe', 400], ['Burger', 900], ['Eau 50 cl', 150]]
const STAFF = ['Bar Scène A', 'Stand Crêpes', 'Bar Scène B']
const CAISSES = ['Caisse Awa', 'Caisse Karim']
const PAGES  = { analytics: Analytics, cloture: Cloture, planning: Planning, staff: Staff, menu: Menu, settings: Settings, transactions: Transactions, alertes: Alertes,
  'qr-entree': QrEntree, benevoles: Benevoles, 'reservations-admin': Reservations, spectateurs: Spectateurs, 'mon-profil': MonProfil,
  nouveau: Nouveau, credit: Credit, retrait: Retrait, debit: Debit }
const TITLES = { analytics: 'Analytics', cloture: 'Clôture de caisse', planning: 'Planning Festival', staff: 'Équipe', menu: 'Carte & menu', settings: 'Paramètres', transactions: 'Transactions', alertes: 'Alertes financières',
  'qr-entree': 'QR code entrée', benevoles: 'Bénévoles', 'reservations-admin': 'Réservations', spectateurs: 'Spectateurs', 'mon-profil': 'Mon profil',
  nouveau: 'Nouveau QR', credit: 'Créditer', retrait: 'Retrait réservation', debit: 'Encaisser' }

function sampleData(now) {
  const spectateurs = NAMES.map((nom, i) => ({ id: `YT-${(4100 + i * 37).toString(16).toUpperCase()}`, nom, solde: i === 6 ? -150 : 500 + i * 650 }))
  const logs = []
  // Hier et aujourd'hui, de 15h à maintenant (rythme qui monte en soirée)
  for (let back = 1; back >= 0; back--) {
    for (let h = 9; h >= 0; h--) {
      const base = now - back * 24 * H - h * H
      const n = 3 + Math.round((9 - h) * (back ? 0.8 : 1.1))
      for (let k = 0; k < n; k++) {
        const t = base - (k * 7 + 3) * 60 * 1000
        const sp = spectateurs[(h + k) % spectateurs.length]
        if (k % 4 === 0) logs.push({ type: 'credit', montant: 2000, label: 'Recharge 20€', specId: sp.id, staff: CAISSES[(h + k) % 2], moyen: h === 9 ? null : (k % 8 === 0 ? 'especes' : 'cb'), timestamp: new Date(t).toISOString(), heure: new Date(t).toLocaleTimeString('fr-FR') })
        else {
          const [nom, prix] = ITEMS[(h + k) % ITEMS.length]
          const qty = 1 + (k % 2)
          logs.push({ type: 'debit', montant: prix * qty, label: `${STAFF[k % 3]} · ${qty} ${nom}`, items: [{ nom, qty, prixUnit: prix, total: prix * qty }], specId: sp.id, staff: STAFF[k % 3], timestamp: new Date(t).toISOString(), heure: new Date(t).toLocaleTimeString('fr-FR') })
        }
      }
    }
  }
  const reservations = [
    { id: 'r1', code: '4821', status: 'pending',    specNom: 'Léa Martin',   total: 1800, items: [{ nom: 'Burger', qty: 2 }] },
    { id: 'r2', code: '4822', status: 'pending',    specNom: 'Karim Benali', total: 750,  items: [{ nom: 'Crêpe', qty: 1 }, { nom: 'Café', qty: 1 }] },
    { id: 'r3', code: '4817', status: 'processing', specNom: 'Inès Diallo',  total: 2400, items: [{ nom: 'Bière pression', qty: 3 }, { nom: 'Frites', qty: 1 }] },
    { id: 'r4', code: '4809', status: 'ready',      specNom: 'Tom Robert',   total: 1200, items: [{ nom: 'Limonade maison', qty: 2 }] },
    { id: 'r5', code: '4811', status: 'ready',      benevoleNom: 'Awa Sow', isBenev: true, items: [{ nom: 'Repas bénévole', qty: 1 }] },
  ]
  const menu = [
    { id: 'm1', nom: 'Bière pression', prix: 500, stock: 6, seuilAlerte: 10, cat: 'Boissons' },
    { id: 'm2', nom: 'Limonade maison', prix: 350, stock: 88, cat: 'Boissons' },
    { id: 'm3', nom: 'Bissap', prix: 300, stock: 0, cat: 'Boissons' },
    { id: 'm4', nom: 'Crêpe', prix: 400, stock: 25, cat: 'Food' },
    { id: 'm5', nom: 'Burger', prix: 900, stock: 60, cat: 'Food' },
    { id: 'm6', nom: 'Eau 50 cl', prix: 150, stock: 200, cat: 'Boissons' },
  ]
  // Horodatage façon Firestore (toDate / seconds)
  const ts = (min) => { const d = new Date(now + min * 60000); d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0); return { toDate: () => d, seconds: Math.floor(d / 1000) } }
  const planning = [
    { id: 'c1', artiste: 'Les Ondes Courtes', titre: 'Rock', scene: 'Scène A', type: 'musical', debut: ts(-150), fin: ts(-90), statut: 'a-venir' },
    { id: 'c2', artiste: 'Nadia K.', titre: 'Set acoustique', scene: 'Scène A', type: 'musical', debut: ts(-45), fin: ts(30), statut: 'a-venir', avantages: { repas: 2, boisson: 4 } },
    { id: 'c3', artiste: 'Brass Kolektif', scene: 'Scène A', type: 'musical', debut: ts(20), fin: ts(80), statut: 'a-venir' },
    { id: 'c4', artiste: 'Lecture : Les nuits du port', scene: 'Chapiteau', type: 'litteraire', debut: ts(0), fin: ts(60), statut: 'a-venir' },
    { id: 'c5', artiste: 'Courts métrages', scene: 'Chapiteau', type: 'cinematographique', debut: ts(45), fin: ts(135), statut: 'annule' },
  ]
  const roles = [
    { id: 'role-bar', nom: 'Chef de bar', couleur: '#F07848', pages: ['debit', 'retrait', 'transactions', 'mon-profil'] },
  ]
  const staff = [
    { id: 'st1', _docId: 'st1', nom: 'Samba Babou', username: 'sbabou', role: 'super_admin', eventIds: ['demo'] },
    { id: 'st2', _docId: 'st2', nom: 'Awa Diallo', username: 'awa', role: 'billetterie', eventIds: ['demo'] },
    { id: 'st3', _docId: 'st3', nom: 'Karim Benali', username: 'karim', role: 'stand', eventIds: ['demo'] },
    { id: 'st4', _docId: 'st4', nom: 'Moussa Keita', username: 'moussa', role: 'role-bar', eventIds: ['demo'] },
  ]
  return { spectateurs, logs, reservations, menu, planning, roles, staff }
}

export default function DevDashboard() {
  const [ready, setReady] = useState(false)
  const [palette, setPalette] = useState(false)
  const [page, setPageRaw] = useState(() => new URLSearchParams(window.location.search).get('page') || 'dashboard')
  const [drawer, setDrawer] = useState(false)
  const { isMobile } = useBreakpoint()
  // Même transition de page que l'app staff
  const setPage = (p) => {
    const go = () => { setPageRaw(p); setDrawer(false) }
    if (p !== page && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => flushSync(go)).ready.catch(() => {})
    else go()
  }

  useEffect(() => {
    const data = sampleData(Date.now())
    const app = useAppStore.getState() // actions remises en place en quittant
    const originals = Object.fromEntries(['prendreEnCharge', 'marquerResaPrete', 'crediter', 'debiter', 'createSpectateur', 'validerRetrait',
      'annulerReservation', 'deleteReservation', 'setSpecAvatar', 'setStaffAvatar', 'updateSpecNom', 'updateStaffNom'].map(k => [k, app[k]]))
    const wait = () => new Promise(r => setTimeout(r, 300))
    const solde = (id, delta) => useAppStore.setState(st => ({
      spectateurs: st.spectateurs.map(sp => sp.id === id ? { ...sp, solde: (sp.solde || 0) + delta } : sp),
    }))
    const move = (id, status) => useAppStore.setState(st => ({
      reservations: st.reservations.map(r => r.id === id ? { ...r, status } : r),
    }))
    useAppStore.setState({
      ...data,
      prendreEnCharge: async (id) => { await new Promise(r => setTimeout(r, 400)); move(id, 'processing') },
      marquerResaPrete: async (id) => { await new Promise(r => setTimeout(r, 400)); move(id, 'ready') },
      validerRetrait: async (id) => { await wait(); move(id, 'collected') },
      annulerReservation: async (id) => { await wait(); move(id, 'cancelled') },
      deleteReservation: async (id) => { await wait(); useAppStore.setState(st => ({ reservations: st.reservations.filter(r => r.id !== id) })) },
      crediter: async (specId, euros) => { await wait(); solde(specId, euros * 100) },
      debiter: async (specId, items) => { await wait(); const total = items.reduce((a, i) => a + i.prix * i.qty, 0); solde(specId, -total); return total },
      createSpectateur: async (nom, euros) => {
        await wait()
        const id = `YT-${Math.random().toString(16).slice(2, 6).toUpperCase()}`
        useAppStore.setState(st => ({ spectateurs: [...st.spectateurs, { id, nom, solde: euros * 100 }] }))
        return id
      },
      setSpecAvatar: () => {}, setStaffAvatar: () => {}, updateSpecNom: () => {}, updateStaffNom: () => {},
    })
    // Compte de démo : la session (persistée) est rendue en quittant, même en fermant l'onglet
    const auth = useAuthStore.getState()
    const previousAuth = { user: auth.user, resetOwnPassword: auth.resetOwnPassword }
    const restoreAuth = () => useAuthStore.setState(previousAuth)
    window.addEventListener('pagehide', restoreAuth)
    useAuthStore.setState({ user: { id: 'st1', nom: 'Samba Babou', username: 'sbabou', role: 'admin', email: 'demo@exemple.test' }, resetOwnPassword: async () => true })
    // currentEventId est persisté : on remet la vraie valeur en quittant l'aperçu
    const previousEventId = useEventStore.getState().currentEventId
    useEventStore.setState({
      events: [{ id: 'demo', nom: 'Festylla 2026', objectifJour: 60000 }],
      currentEventId: 'demo',
      updateEvent: async (id, patch) => useEventStore.setState(st => ({ events: st.events.map(e => e.id === id ? { ...e, ...patch } : e) })),
    })
    setReady(true)
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(o => !o) } }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      useEventStore.setState({ currentEventId: previousEventId })
      window.removeEventListener('pagehide', restoreAuth)
      restoreAuth()
      useAppStore.setState({ ...originals, spectateurs: [], logs: [], reservations: [], menu: [], planning: [], roles: [], staff: [] })
    }
  }, [])

  if (!ready) return null
  return (
    <div className={shell.app}>
      <div className={shell.shell}>
        <Sidebar view="admin" currentPage={page} onNavigate={setPage} alertCount={2} onLogout={() => {}} onToggleDark={() => document.body.classList.toggle('dark')}
          mobileOpen={drawer} onMobileClose={() => setDrawer(false)} />
        <div className={shell.main}>
          <header className={shell.bar}>
            <h1 className={shell.title}>{TITLES[page] || 'Tableau de bord'}</h1>
            {!isMobile && <span className={shell.event}>Festylla 2026 · démo</span>}
            {!isMobile && <span className={shell.stateOn}>En direct</span>}
            <button type="button" className={isMobile ? `${shell.iconBtn} ${shell.pushRight}` : shell.search} onClick={() => setPalette(true)} aria-label="Rechercher">
              <Search size={16} />{!isMobile && <><span className={shell.searchText}>Chercher un spectateur, un article…</span><kbd className={shell.kbd}>Ctrl K</kbd></>}
            </button>
          </header>
          <main className={shell.content}>
            {(() => { const P = PAGES[page]; return P ? <P onNavigate={setPage} view="admin" /> : <Dashboard onNavigate={setPage} view="admin" /> })()}
          </main>
        </div>
        {isMobile && <BottomNav role="admin" currentPage={page} onNavigate={setPage} onMore={() => setDrawer(true)} canAccess={() => true} badges={{ alertes: 2 }} />}
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={setPage} canAccessPage={() => true} />
    </div>
  )
}
