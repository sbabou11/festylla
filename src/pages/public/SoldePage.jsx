/**
 * pages/public/SoldePage.jsx — v5 espace spectateur (lot 3)
 * Carte portefeuille (solde + QR), commande prête en tête, historique,
 * barre d'onglets en bas : Solde | Commander | Mes résas | Programme.
 * La logique Firestore (compte, transactions, réservations) est celle de la v4.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import {
  Search, Wallet, Clock, Bookmark, LayoutList, BarChart2, CalendarDays, UtensilsCrossed,
  Plus, Minus, Undo2, ShoppingBag, ChevronRight, Maximize2, Mic, Ticket,
} from 'lucide-react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import { getSettings } from '../../firebase/service'
import {
  collection, query, where, getDocs, addDoc, onSnapshot,
  updateDoc, doc, getDoc, serverTimestamp, runTransaction, orderBy, increment
} from 'firebase/firestore'
import { fmt, nowStr, makeResaCode as resaCode } from '../../utils/helpers'
import { useNotifications } from '../../hooks/useNotifications'
import NotifBell from '../../components/NotifBell'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { friendlyError } from '../../utils/errors'
import { Button, Badge, Empty, Field, Tabs, Dialog, AnimatedNumber, focusFirstInvalid } from '../../ui'
import PlanningSpec from './spectateur/PlanningSpec'
import SoldeChart from './spectateur/SoldeChart'
import sp from './spectateur/SoldePage.module.css'

const PAGE_SIZE = 15


// Icône, ton et signe selon le type de transaction
const TX_LOOK = {
  credit:      { icon: Plus,        tone: 'success', sign: '+' },
  debit:       { icon: Minus,       tone: 'coral',   sign: '−' },
  reservation: { icon: Clock,       tone: 'warning', sign: ''  },
  annulation:  { icon: Undo2,       tone: 'neutral', sign: ''  },
}
const txLook = (type) => TX_LOOK[type] || { icon: Wallet, tone: 'brand', sign: '' }

const RESA_STATUS = {
  ready:      { label: 'Prête',          tone: 'success' },
  processing: { label: 'En préparation', tone: 'brand'   },
  pending:    { label: 'En attente',     tone: 'warning' },
  collected:  { label: 'Retirée',        tone: 'neutral' },
  cancelled:  { label: 'Annulée',        tone: 'danger'  },
}

// Son de notification (Web Audio API)
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

// demo : données d'exemple injectées par l'aperçu de développement (/ui/spectateur).
// En mode démo, aucun compte n'est lu et rien n'est écrit dans Firestore.
export default function SoldePage({ demo = null }) {
  useTheme()
  const params  = new URLSearchParams(window.location.search)
  const urlId   = (params.get('id') || '').toUpperCase()
  const eventId = params.get('ev') || null
  const fromArtiste = params.get('from') === 'artiste'
  const artisteCreneauId = params.get('cr') || null

  const specCol  = (db) => eventId ? collection(db,'events',eventId,'spectateurs')  : collection(db,'spectateurs')
  const txCol    = (db) => eventId ? collection(db,'events',eventId,'transactions') : collection(db,'transactions')
  const resaCol  = (db) => eventId ? collection(db,'events',eventId,'reservations') : collection(db,'reservations')
  const menuCol  = (db) => eventId ? collection(db,'events',eventId,'menu')         : collection(db,'menu')

  const [inputId, setInputId]         = useState(urlId)
  const [spec, setSpec]               = useState(demo?.spec || null)
  const [specDocId, setSpecDocId]     = useState(null)
  const [txs, setTxs]                 = useState(demo?.txs || [])
  const [resas, setResas]             = useState(demo?.resas || [])
  const [menu, setMenu]               = useState(demo?.menu || [])
  const [loading, setLoading]         = useState(false)
  const [err, setErr]                 = useState('')
  const [codeTried, setCodeTried]     = useState(false)
  const [tab, setTab]                 = useState('accueil')
  const [qtys, setQtys]               = useState({})
  const [resaLoading, setResaLoading] = useState(false)
  const [resaDone, setResaDone]       = useState(null)
  const [resaErr, setResaErr]         = useState('')
  const [qrDataUrl, setQrDataUrl]     = useState(null)
  const [qrOpen, setQrOpen]           = useState(false)
  const [chartMode, setChartMode]     = useState(false)   // false=liste true=graphe
  const [planningData, setPlanningData] = useState(() => {
    try {
      const cached = localStorage.getItem('yllacash-planning-' + eventId)
      if (cached) {
        const parsed = JSON.parse(cached)
        return parsed.map(cr => ({ ...cr, debut: cr.debut ? new Date(cr.debut) : null, fin: cr.fin ? new Date(cr.fin) : null }))
      }
    } catch {}
    return []
  })
  const [chartZoom, setChartZoom]     = useState(false)   // graphe plein écran
  const [hoverIdx, setHoverIdx]       = useState(null)    // index point survolé
  const [txPage, setTxPage]           = useState(1)       // pagination historique
  const [resaPage, setResaPage]       = useState(1)       // pagination mes résa
  const [eventMeta, setEventMeta]     = useState(demo?.eventMeta || null)
  const [themeColor, setThemeColor]   = useState('#1a6b7a')
  const unsubsRef                     = useRef([])

  const { notifications, nonLuCount, marquerToutLu } = useNotifications({
    specId: spec?.id || null, isStaff: false, eventId,
  })

  useEffect(() => {
    if (demo) return
    getDocs(menuCol(db)).then(s => setMenu(s.docs.map(d => ({ ...d.data(), id: d.id })))).catch(() => {})
  }, [])

  // Compteur de notifs planning non-lues (pour badge sur onglet Programme)
  const nonLuPlanning = notifications.filter(n => n.type === 'PLANNING_MODIF' && !n.lu).length

  // Son quand une notif planning arrive
  const prevNonLuRef = React.useRef(nonLuCount)
  useEffect(() => {
    if (nonLuCount > prevNonLuRef.current) {
      const hasPlanning = notifications.some(n => n.type === 'PLANNING_MODIF' && !n.lu)
      if (hasPlanning) playNotifSound()
    }
    prevNonLuRef.current = nonLuCount
  }, [nonLuCount, notifications])

  // Charger le planning en temps réel si eventId connu
  useEffect(() => {
    if (!eventId) return
    const { onSnapshot: onSnap, query: q, collection: col, orderBy: ob } = { onSnapshot, query, collection, orderBy }
    const unsub = onSnapshot(
      query(collection(db, 'events', eventId, 'planning'), orderBy('debut', 'asc')),
      snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      setPlanningData(data)
      try { localStorage.setItem('yllacash-planning-' + eventId, JSON.stringify(data.map(cr => ({
        ...cr, debut: cr.debut?.toDate ? cr.debut.toDate().toISOString() : cr.debut,
        fin: cr.fin?.toDate ? cr.fin.toDate().toISOString() : cr.fin
      })))) } catch {}
    }
    )
    return unsub
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db,'events',eventId)).then(snap => { if (snap.exists()) setEventMeta(snap.data()) }).catch(() => {})
    // Charger le thème de l'événement
    getSettings(eventId).then(s => {
      if (s?.theme?.brand) {
        setThemeColor(s.theme.brand)
        document.documentElement.style.setProperty('--brand', s.theme.brand)
        const hex = s.theme.brand.replace('#','')
        const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16)
        const dk = '#'+[r,g,b].map(v=>Math.max(0,Math.round(v*.8)).toString(16).padStart(2,'0')).join('')
        const lt = '#'+[r,g,b].map(v=>Math.min(255,Math.round(v+(255-v)*.88)).toString(16).padStart(2,'0')).join('')
        document.documentElement.style.setProperty('--brand-dark', dk)
        document.documentElement.style.setProperty('--brand-light', lt+'33')
      }
    }).catch(() => {})
  }, [eventId])

  const clearListeners = () => { unsubsRef.current.forEach(u => u()); unsubsRef.current = [] }
  useEffect(() => () => clearListeners(), [])

  const findSpec = async (id = inputId.trim().toUpperCase()) => {
    if (!id) return
    setLoading(true); setErr(''); clearListeners()
    try {
      const snap = await getDocs(query(specCol(db), where('id','==',id)))
      if (snap.empty) { setErr('Aucun compte trouvé pour : ' + id); setLoading(false); return }
      const d = snap.docs[0]
      setSpec(d.data()); setSpecDocId(d.id); setLoading(false)

      const unsubSpec = onSnapshot(query(specCol(db), where('id','==',id)),
        snap => { if (!snap.empty) setSpec(snap.docs[0].data()) })

      const unsubTx = onSnapshot(
        query(txCol(db), where('specId','==',id), orderBy('createdAt','desc')),
        snap => setTxs(snap.docs.map(x => x.data())),
        () => onSnapshot(query(txCol(db), where('specId','==',id)),
          snap => setTxs(snap.docs.map(x => x.data())))
      )

      const unsubResa = onSnapshot(query(resaCol(db), where('specId','==',id)),
        snap => setResas(snap.docs.map(x => ({ ...x.data(), id: x.id }))))

      unsubsRef.current = [unsubSpec, unsubTx, unsubResa]
    } catch { setErr('Erreur de connexion.'); setLoading(false) }
  }

  useEffect(() => { if (urlId) findSpec(urlId) }, [urlId, eventId])

  useEffect(() => {
    if (!spec?.id) return
    const url = `${window.location.origin}/solde?id=${spec.id}${eventId ? '&ev='+eventId : ''}`
    QRCode.toDataURL(url, { width:400, margin:2, color:{ dark:themeColor, light:'#ffffff' } })
      .then(u => setQrDataUrl(u)).catch(() => {})
  }, [spec?.id])

  const openQr  = useCallback(async () => { setQrOpen(true) }, [])
  const closeQr = useCallback(() => setQrOpen(false), [])

  const changeQty = (id, d) => setQtys(q => ({ ...q, [id]: Math.max(0,(q[id]||0)+d) }))
  const cartItems = Object.entries(qtys).filter(([,q])=>q>0).map(([id,qty])=>({ ...menu.find(x=>x.id===id), qty }))
  const cartTotal = cartItems.reduce((a,i) => a+(i.prix||0)*i.qty, 0)

  const doResa = async () => {
    if (!spec || !cartItems.length) return
    if (demo) {
      const code = resaCode(spec.id)
      setResas(r => [...r, { id: code, code, status: 'pending', items: cartItems, total: cartTotal, date: nowStr() }])
      setResaDone({ code, items: cartItems, total: cartTotal }); setQtys({}); return
    }
    setResaLoading(true); setResaErr('')
    try {
      const specRef = eventId ? doc(db,'events',eventId,'spectateurs',specDocId) : doc(db,'spectateurs',specDocId)
      const code    = resaCode(spec.id)
      await runTransaction(db, async txn => {
        const sd = await txn.get(specRef)
        if (sd.data().solde < cartTotal) throw new Error('Solde insuffisant')
        txn.set(doc(resaCol(db)), {
          specId:spec.id, specNom:spec.nom,
          items:cartItems.map(i=>({ id:i.id, nom:i.nom, prix:i.prix, qty:i.qty })),
          total:cartTotal, status:'pending', code, date:nowStr(), createdAt:serverTimestamp()
        })
        txn.set(doc(txCol(db)), {
          specId:spec.id, type:'reservation',
          label:'Résa: '+cartItems.map(i=>i.nom+(i.qty>1?` ×${i.qty}`:'')).join(', '),
          montant:cartTotal, staff:'—', date:nowStr(), createdAt:serverTimestamp()
        })
      })
      setResaDone({ code, items:cartItems, total:cartTotal }); setQtys({})
      const notifCol = eventId ? collection(db,'events',eventId,'notifications') : collection(db,'notifications')
      await addDoc(notifCol, {
        type:'RESA_CREEE', titre:'🛒 Nouvelle réservation',
        message:`${spec.nom} a réservé : ${cartItems.map(i=>i.nom+(i.qty>1?` x${i.qty}`:'')).join(', ')}`,
        specId:spec.id, resaCode:code, lu:false,
        timestamp:new Date().toISOString(), createdAt:serverTimestamp(),
      })
    } catch(e) { setResaErr(friendlyError(e, "La commande n'a pas été envoyée.")) }
    finally { setResaLoading(false) }
  }

  const annuler = async (resaId) => {
    if (demo) { setResas(r => r.map(x => x.id === resaId ? { ...x, status: 'cancelled' } : x)); return }
    const resaRef2 = eventId ? doc(db,'events',eventId,'reservations',resaId) : doc(db,'reservations',resaId)
    // Récupérer la résa avant annulation pour rembourser le stock
    let resaItems = []
    try {
      const resaSnap = await getDoc(resaRef2)
      if (resaSnap.exists() && resaSnap.data().status !== 'cancelled' && resaSnap.data().status !== 'collected') {
        resaItems = resaSnap.data().items || []
      }
    } catch {}
    await updateDoc(resaRef2, {
      status:'cancelled', cancelledBy:spec?.nom||'Spectateur',
      cancelledByRole:'spectateur', cancelledAt:new Date().toISOString(), motifAnnulation:'Annulé par le client',
    })
    // Rembourser le stock menu pour chaque article
    for (const it of resaItems) {
      if (!it.id) continue
      try {
        const menuRef = eventId
          ? doc(db, 'events', eventId, 'menu', it.id)
          : doc(db, 'menu', it.id)
        await updateDoc(menuRef, { stock: increment(it.qty || 1) })
      } catch (e) {
        console.warn('Refund stock error for ' + it.id + ':', e)
      }
    }
    try {
      const auditCol = eventId ? collection(db,'events',eventId,'audit') : collection(db,'audit')
      await addDoc(auditCol, {
        action:'ANNULATION_RESA_SPEC', specId:spec?.id, specNom:spec?.nom, resaId,
        userType:'spectateur', label:`Annulation réservation par ${spec?.nom||'spectateur'}`,
        date:new Date().toLocaleString('fr-FR'), timestamp:new Date().toISOString(), createdAt:serverTimestamp(),
      })
    } catch {}
    await addDoc(txCol(db), {
      specId:spec.id, type:'annulation', label:'Annulation',
      montant:0, staff:'—', date:nowStr(), createdAt:serverTimestamp()
    })
  }

  // ── Calculs dérivés ────────────────────────────────────────────
  const totalRecharge  = txs.filter(t=>t.type==='credit').reduce((a,t)=>a+(t.montant||0),0)
  const totalDepense   = txs.filter(t=>['debit','reservation'].includes(t.type)).reduce((a,t)=>a+(t.montant||0),0)
  const nbResas        = resas.length
  const activeResas    = resas.filter(r=>r.status!=='collected'&&r.status!=='cancelled')
  // Tri explicite du plus récent au plus ancien (createdAt.seconds ou date string)
  const txTriees = [...txs].sort((a, b) => {
    const ta = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? (a.date ? new Date(a.date.split('/').reverse().join('-')).getTime()/1000 : 0)
    const tb = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? (b.date ? new Date(b.date.split('/').reverse().join('-')).getTime()/1000 : 0)
    return tb - ta
  })
  const resasTriees    = [...resas].sort((a,b)=>(b.date||'').localeCompare(a.date||''))

  // Pagination historique transactions
  const txTotal  = txTriees.length
  const txPages  = Math.max(1, Math.ceil(txTotal / PAGE_SIZE))
  const txSlice  = txTriees.slice((txPage-1)*PAGE_SIZE, txPage*PAGE_SIZE)

  // Pagination mes résa
  const resaTotal = resasTriees.length
  const resaPages = Math.max(1, Math.ceil(resaTotal / PAGE_SIZE))
  const resaSlice = resasTriees.slice((resaPage-1)*PAGE_SIZE, resaPage*PAGE_SIZE)

  // Timeline pour graphe — reconstitution à partir du solde actuel (centimes)
  const timeline = (() => {
    if (!txTriees.length) return []
    // Partir du solde actuel et remonter à rebours pour trouver le solde après chaque tx
    const currentSolde = spec?.solde || 0  // solde actuel en centimes
    let bal = currentSolde
    // Calculer soldeAprès en remontant du plus récent au plus ancien
    const withBalance = txTriees.map(t => {
      const soldeApres = bal
      // Annuler la transaction pour trouver le solde avant
      if (t.type === 'credit')                                    bal -= (t.montant||0)
      else if (['debit','reservation'].includes(t.type))          bal += (t.montant||0)
      return { ...t, balanceAfter: soldeApres }
    })
    // Remettre dans l'ordre chronologique (plus ancien en premier)
    return withBalance.reverse()
  })()
  const maxBal = Math.max(...timeline.map(t=>t.balanceAfter), 0, 1)
  const minBal = Math.min(...timeline.map(t=>t.balanceAfter), 0)

  // ── Affichage (v5) ────────────────────────────────────────────
  const [cancelId, setCancelId]   = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const readyResas = activeResas.filter(r => r.status === 'ready')

  // Écran allumé tant que le QR agrandi est affiché (si le navigateur le permet)
  useEffect(() => {
    if (!qrOpen || !('wakeLock' in navigator)) return
    let lock = null
    navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => {})
    return () => { lock?.release?.().catch?.(() => {}) }
  }, [qrOpen])

  const go = (t) => { setTab(t); window.scrollTo(0, 0) }
  const logoutSpec = () => { setSpec(null); setInputId(''); setTxs([]); setResas([]); setQtys({}); go('accueil') }

  const confirmCancel = async () => {
    setCancelling(true)
    try { await annuler(cancelId) } finally { setCancelling(false); setCancelId(null) }
  }

  const Pagination = ({ page, pages, onChange }) => pages <= 1 ? null : (
    <div className={sp.pager}>
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Page précédente">‹</button>
      <span>{page} / {pages}</span>
      <button type="button" onClick={() => onChange(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Page suivante">›</button>
    </div>
  )

  const TxRow = ({ t }) => {
    const look = txLook(t.type)
    const Icon = look.icon
    const isAnnul = t.type === 'annulation'
    return (
      <li className={sp.tx}>
        <span className={clsx(sp.txIcon, sp[look.tone])}><Icon size={15} aria-hidden="true" /></span>
        <span className={sp.txText}>
          <b>{t.label || t.type}</b>
          <span>{t.date}{t.heure ? ` · ${t.heure}` : ''}</span>
        </span>
        <span className={clsx(sp.txAmount, sp[`${look.tone}Text`])}>
          {isAnnul ? '—' : `${look.sign}${fmt(t.montant || 0)}`}
        </span>
      </li>
    )
  }

  const NAV = [
    { id: 'accueil',      label: 'Solde',     icon: Wallet,          match: ['accueil', 'historique'] },
    { id: 'reserver',     label: 'Commander', icon: UtensilsCrossed, match: ['reserver'] },
    { id: 'reservations', label: 'Mes résas', icon: Bookmark,        match: ['reservations'], badge: activeResas.length },
    { id: 'programme',    label: 'Programme', icon: CalendarDays,    match: ['programme'], badge: nonLuPlanning },
  ]

  return (
    <div className={sp.page} style={{ '--brand': themeColor }}>
      {/* En-tête */}
      <header className={sp.head}>
        <div className={sp.headInner}>
          <div className={sp.logo}><img src="/logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none' }} /></div>
          <span className={sp.brandName}>YllaCash</span>
          {eventMeta && (
            <span className={sp.event}>
              {eventMeta.logoSrc && <img src={eventMeta.logoSrc} alt="" />}
              {eventMeta.nom}
            </span>
          )}
          <div className={sp.headActions}>
            {fromArtiste && artisteCreneauId && eventId && (
              <button type="button" className={sp.headBtn} title="Retour à mon espace artiste" aria-label="Retour à mon espace artiste"
                onClick={() => { window.location.href = '/artiste?ev=' + eventId + '&cr=' + artisteCreneauId }}>
                <Mic size={16} />
              </button>
            )}
            {spec && <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu} />}
            <ThemeToggle variant="light" style={{ width: 36, height: 36, minHeight: 0 }} />
          </div>
        </div>
      </header>

      <main className={clsx(sp.wrap, spec && sp.withNav)}>
        {/* ── Identification ── */}
        {!spec && (
          <section className={sp.login}>
            <h1>Mon portefeuille festival</h1>
            <p>Entrez le code inscrit sous votre QR code (bracelet ou carte).</p>
            {loading ? (
              <p className={sp.loading}>Recherche du compte…</p>
            ) : (
              <form className={sp.loginRow} noValidate onSubmit={e => {
                e.preventDefault()
                if (!inputId.trim()) { setCodeTried(true); focusFirstInvalid(e.currentTarget); return }
                setCodeTried(false); findSpec()
              }}>
                <label htmlFor="spec-code" className={sp.srOnly}>Code du QR</label>
                <Field error={inputId.trim() ? null : 'Entrez le code inscrit sous votre QR.'} showError={codeTried} className={sp.codeField}>
                  <input id="spec-code" value={inputId} onChange={e => setInputId(e.target.value.toUpperCase())}
                    placeholder="FY-XXXX" autoCapitalize="characters" autoComplete="off" className={sp.codeInput} />
                </Field>
                <Button type="submit" icon={Search} iconOnly aria-label="Ouvrir mon compte" />
              </form>
            )}
            {err && <p className={sp.error} role="alert">{err}</p>}
          </section>
        )}

        {spec && (<>
          {/* ── SOLDE ── */}
          {tab === 'accueil' && (
            <div className={sp.stack}>
              <div className={sp.hello}>
                <div>
                  <span>{eventMeta?.nom || 'Festival'}</span>
                  <h1>Salut {(spec.nom || '').split(' ')[0] || 'à toi'}</h1>
                </div>
                <button type="button" className={sp.switch} onClick={logoutSpec}>Changer de compte</button>
              </div>

              <section className={sp.wallet} aria-label="Mon solde">
                <span className={sp.walletLabel}>Mon solde</span>
                <div className={sp.walletRow}>
                  <b className={sp.walletValue}><AnimatedNumber value={spec.solde || 0} format={fmt} /></b>
                  {qrDataUrl && (
                    <button type="button" className={sp.walletQr} onClick={openQr} aria-label="Agrandir mon QR code">
                      <img src={qrDataUrl} alt="" />
                      <Maximize2 size={12} className={sp.walletQrIcon} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <span className={sp.walletId}>{spec.id} · touchez le QR pour l'agrandir au stand</span>
              </section>

              {readyResas.map(r => (
                <button key={r.id} type="button" className={sp.ready} onClick={() => go('reservations')}>
                  <span className={sp.readyCode}>#{r.code}</span>
                  <span className={sp.readyText}>
                    <b>Votre commande est prête</b>
                    <span>Présentez votre QR au stand pour la retirer · {fmt(r.total || 0)}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}

              <div className={sp.actions}>
                <button type="button" className={sp.action} onClick={() => go('reserver')}>
                  <span className={clsx(sp.actionIcon, sp.coral)}><UtensilsCrossed size={18} /></span>Commander
                </button>
                <button type="button" className={sp.action} onClick={() => go('reservations')}>
                  <span className={clsx(sp.actionIcon, sp.warning)}><Bookmark size={18} /></span>Mes résas
                </button>
                <button type="button" className={sp.action} onClick={() => go('programme')}>
                  <span className={clsx(sp.actionIcon, sp.brand)}><CalendarDays size={18} /></span>Programme
                </button>
              </div>
              {/* Emplacement prévu pour la recharge en ligne (lot 5) */}
              <p className={sp.topup}><Ticket size={14} aria-hidden="true" /> Pour recharger, passez à la billetterie.</p>

              <section className={sp.card}>
                <header className={sp.cardHead}>
                  <h2>Dernières opérations</h2>
                  <Tabs size="sm" label="Affichage" value={chartMode ? 'graph' : 'list'} onChange={v => setChartMode(v === 'graph')}
                    items={[{ value: 'list', label: 'Liste' }, { value: 'graph', label: 'Graphe' }]} />
                </header>
                <div className={sp.totals}>
                  <span>Rechargé <b className={sp.successText}>{fmt(totalRecharge)}</b></span>
                  <span>Dépensé <b className={sp.coralText}>{fmt(totalDepense)}</b></span>
                </div>
                {txs.length === 0 ? (
                  <Empty icon={Wallet} title="Aucune opération pour l'instant">Vos recharges et achats apparaîtront ici.</Empty>
                ) : chartMode ? (
                  <SoldeChart timeline={timeline} maxBal={maxBal} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
                    zoom={chartZoom} setZoom={setChartZoom} fmt={fmt} />
                ) : (
                  <>
                    <ul className={sp.txList}>{txTriees.slice(0, 5).map((t, i) => <TxRow key={i} t={t} />)}</ul>
                    {txTotal > 5 && (
                      <Button variant="secondary" block onClick={() => go('historique')}>Tout l'historique ({txTotal})</Button>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          {/* ── HISTORIQUE ── */}
          {tab === 'historique' && (
            <section className={sp.card}>
              <header className={sp.cardHead}>
                <h2>Historique</h2>
                <span className={sp.muted}>{txTotal} opération{txTotal > 1 ? 's' : ''}</span>
              </header>
              {txTotal === 0 ? (
                <Empty icon={Clock} title="Aucune opération pour l'instant">Vos recharges et achats apparaîtront ici.</Empty>
              ) : (
                <>
                  <ul className={sp.txList}>{txSlice.map((t, i) => <TxRow key={i} t={t} />)}</ul>
                  <Pagination page={txPage} pages={txPages} onChange={p => { setTxPage(p); window.scrollTo(0, 0) }} />
                </>
              )}
              <Button variant="ghost" block onClick={() => go('accueil')}>Retour au solde</Button>
            </section>
          )}

          {/* ── COMMANDER ── */}
          {tab === 'reserver' && (
            <div className={sp.stack}>
              <p className={sp.info}>Commandez à l'avance : le stand prépare, vous êtes prévenu quand c'est prêt. Paiement au retrait.</p>
              {resaDone ? (
                <section className={clsx(sp.card, sp.done)}>
                  <span className={sp.doneIcon}><ShoppingBag size={28} /></span>
                  <h2>Commande envoyée</h2>
                  <p>Code <b>#{resaDone.code}</b> · {fmt(resaDone.total)}</p>
                  <p className={sp.muted}>Vous recevrez une notification quand elle sera prête.</p>
                  <div className={sp.doneActions}>
                    <Button variant="secondary" block onClick={() => { setResaDone(null); go('reservations') }}>Voir mes résas</Button>
                    <Button block onClick={() => setResaDone(null)}>Commander autre chose</Button>
                  </div>
                </section>
              ) : (
                <>
                  {[...new Set(menu.map(m => m.cat))].map(cat => (
                    <section key={cat} className={sp.card}>
                      <h2 className={sp.catTitle}>{cat}</h2>
                      <ul className={sp.menu}>
                        {menu.filter(m => m.cat === cat).map(m => {
                          const stock = m.stock || 0
                          const q = qtys[m.id] || 0
                          return (
                            <li key={m.id} className={clsx(sp.menuItem, stock === 0 && sp.menuOut)}>
                              <span className={sp.menuText}>
                                <b>{m.nom}</b>
                                <span>
                                  <span className={sp.price}>{fmt(m.prix || 0)}</span>
                                  {stock === 0 ? <Badge tone="danger">Rupture</Badge> : stock <= 10 ? <Badge tone="warning">{stock} restant{stock > 1 ? 's' : ''}</Badge> : null}
                                </span>
                              </span>
                              <span className={sp.stepper}>
                                <button type="button" onClick={() => changeQty(m.id, -1)} disabled={q === 0} aria-label={`Retirer un ${m.nom}`}><Minus size={16} /></button>
                                <b aria-live="polite">{q}</b>
                                <button type="button" className={sp.plus} onClick={() => changeQty(m.id, 1)} disabled={stock === 0 || q >= stock} aria-label={`Ajouter un ${m.nom}`}><Plus size={16} /></button>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                  {menu.length === 0 && <Empty icon={UtensilsCrossed} title="La carte n'est pas encore disponible">Les plats et boissons apparaîtront ici dès leur mise en ligne.</Empty>}
                </>
              )}
            </div>
          )}

          {/* ── MES RÉSAS ── */}
          {tab === 'reservations' && (
            <section className={sp.card}>
              <header className={sp.cardHead}>
                <h2>Mes réservations</h2>
                <span className={sp.muted}>{resaTotal} au total</span>
              </header>
              {resaTotal === 0 ? (
                <Empty icon={Bookmark} title="Aucune réservation" action={<Button size="sm" onClick={() => go('reserver')}>Commander</Button>}>
                  Vos commandes apparaîtront ici : commandez depuis la carte, récupérez quand c'est prêt.
                </Empty>
              ) : (
                <>
                  <ul className={sp.resas}>
                    {resaSlice.map(r => {
                      const st = RESA_STATUS[r.status] || RESA_STATUS.pending
                      return (
                        <li key={r.id} className={clsx(sp.resa, r.status === 'ready' && sp.resaReady)}>
                          <div className={sp.resaTop}>
                            <b>#{r.code}</b>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </div>
                          <p className={sp.resaItems}>{(r.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(' · ')}</p>
                          <div className={sp.resaBottom}>
                            <span className={sp.muted}>{r.date}</span>
                            <b>{fmt(r.total || 0)}</b>
                          </div>
                          {r.status === 'ready' && <p className={sp.resaHint}>Présentez votre QR code au stand pour retirer et payer.</p>}
                          {r.status === 'pending' && (
                            <Button size="sm" variant="danger" onClick={() => setCancelId(r.id)}>Annuler la commande</Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  <Pagination page={resaPage} pages={resaPages} onChange={p => { setResaPage(p); window.scrollTo(0, 0) }} />
                </>
              )}
            </section>
          )}

          {/* ── PROGRAMME ── */}
          {tab === 'programme' && (
            <PlanningSpec planning={planningData} eventId={eventId} specId={spec?.id} themeColor={themeColor} />
          )}
        </>)}

        <footer className={sp.footer}>YllaCash · Maison Ylla</footer>
      </main>

      {/* Panier de commande : toujours visible au-dessus des onglets */}
      {spec && tab === 'reserver' && !resaDone && cartItems.length > 0 && (
        <div className={sp.cartBar}>
          <div className={sp.cartInfo}>
            <span>{cartItems.reduce((a, i) => a + i.qty, 0)} article(s)</span>
            <b>{fmt(cartTotal)}</b>
          </div>
          {resaErr && <p className={sp.cartErr} role="alert">{resaErr}</p>}
          <Button variant="coral" size="lg" loading={resaLoading} onClick={doResa}>Commander</Button>
        </div>
      )}

      {/* Barre d'onglets */}
      {spec && (
        <nav className={sp.nav} aria-label="Navigation">
          {NAV.map(n => {
            const Icon = n.icon
            const on = n.match.includes(tab)
            return (
              <button key={n.id} type="button" className={clsx(sp.navItem, on && sp.navOn)} aria-current={on ? 'page' : undefined}
                onClick={() => { go(n.id); if (n.id === 'programme' && nonLuPlanning > 0) marquerToutLu() }}>
                <span className={sp.navIcon}>
                  <Icon size={20} aria-hidden="true" />
                  {n.badge > 0 && <span className={sp.navBadge}>{n.badge}</span>}
                </span>
                {n.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* QR agrandi, sur fond blanc pour le scan */}
      {qrOpen && qrDataUrl && (
        <div className={sp.qrFull} onClick={closeQr} role="dialog" aria-modal="true" aria-label="Mon QR code">
          <b>{spec?.nom}</b>
          <span>{spec?.id}</span>
          <img src={qrDataUrl} alt={`QR code ${spec?.id}`} />
          <p>Montrez ce code au stand. Touchez l'écran pour fermer.</p>
          <Button variant="secondary" onClick={closeQr}>Fermer</Button>
        </div>
      )}

      <Dialog open={!!cancelId} onClose={() => setCancelId(null)} title="Annuler cette commande ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelId(null)}>Garder</Button>
          <Button variant="danger" loading={cancelling} onClick={confirmCancel}>Annuler la commande</Button>
        </>}>
        Le stand ne la préparera pas. Vous pourrez repasser commande à tout moment.
      </Dialog>
    </div>
  )
}
