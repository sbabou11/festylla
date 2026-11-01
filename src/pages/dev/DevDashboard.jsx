/**
 * pages/dev/DevDashboard.jsx — aperçu du shell + tableau de bord avec données d'exemple
 * Développement uniquement (route /ui/dashboard, ?page=analytics ou ?page=cloture). Aucune écriture Firebase :
 * les stores sont remplis localement et les actions de réservation sont simulées.
 */
import React, { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import Sidebar from '../../components/Sidebar'
import CommandPalette from '../../components/CommandPalette'
import Dashboard from '../admin/Dashboard'
import Analytics from '../admin/Analytics'
import Cloture from '../admin/Cloture'
import shell from '../../App.module.css'

const H = 3600 * 1000
const NAMES = ['Léa Martin', 'Karim Benali', 'Inès Diallo', 'Tom Robert', 'Awa Sow', 'Hugo Petit', 'Nora Haddad', 'Yanis Morel']
const ITEMS = [['Bière pression', 500], ['Limonade maison', 350], ['Bissap', 300], ['Crêpe', 400], ['Burger', 900], ['Eau 50 cl', 150]]
const STAFF = ['Bar Scène A', 'Stand Crêpes', 'Bar Scène B']
const CAISSES = ['Caisse Awa', 'Caisse Karim']

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
  return { spectateurs, logs, reservations, menu }
}

export default function DevDashboard() {
  const [ready, setReady] = useState(false)
  const [palette, setPalette] = useState(false)
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get('page') || 'dashboard')

  useEffect(() => {
    const data = sampleData(Date.now())
    const { prendreEnCharge, marquerResaPrete } = useAppStore.getState() // remis en place en quittant
    const move = (id, status) => useAppStore.setState(st => ({
      reservations: st.reservations.map(r => r.id === id ? { ...r, status } : r),
    }))
    useAppStore.setState({
      ...data,
      prendreEnCharge: async (id) => { await new Promise(r => setTimeout(r, 400)); move(id, 'processing') },
      marquerResaPrete: async (id) => { await new Promise(r => setTimeout(r, 400)); move(id, 'ready') },
    })
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
      useAppStore.setState({ prendreEnCharge, marquerResaPrete, spectateurs: [], logs: [], reservations: [], menu: [] })
    }
  }, [])

  if (!ready) return null
  return (
    <div className={shell.app}>
      <div className={shell.shell}>
        <Sidebar view="admin" currentPage={page} onNavigate={setPage} alertCount={2} onLogout={() => {}} onToggleDark={() => document.body.classList.toggle('dark')} />
        <div className={shell.main}>
          <header className={shell.bar}>
            <h1 className={shell.title}>{{ analytics: 'Analytics', cloture: 'Clôture de caisse' }[page] || 'Tableau de bord'}</h1>
            <span className={shell.event}>Festylla 2026 · démo</span>
            <span className={shell.stateOn}>En direct</span>
            <button type="button" className={shell.search} onClick={() => setPalette(true)}>
              <Search size={16} /><span className={shell.searchText}>Chercher un spectateur, un article…</span><kbd className={shell.kbd}>Ctrl K</kbd>
            </button>
          </header>
          <main className={shell.content}>
            {page === 'analytics' ? <Analytics /> : page === 'cloture' ? <Cloture /> : <Dashboard onNavigate={setPage} view="admin" />}
          </main>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={setPage} canAccessPage={() => true} />
    </div>
  )
}
