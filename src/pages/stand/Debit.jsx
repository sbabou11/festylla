/**
 * pages/stand/Debit.jsx — v3 caisse du stand (lot 2)
 * Grille d'articles + ticket + scan client. Mode rush (8 meilleures ventes, grosses tuiles),
 * scan continu, retour plein écran, annulation pendant 10 s (débit retenu, voir pendingSales).
 * Lot 6 : thème « plein soleil » (préférence de l'appareil) et bandeau de connexion.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Zap, Volume2, VolumeX, Vibrate, Sun, AlertTriangle, RotateCcw, Undo2, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db }        from '../../firebase/config'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import { fmt } from '../../utils/helpers'
import { dayStart, txTime } from '../../utils/dashboardData'
import { holdSale, cancelSale, dismissSale, retrySale, subscribe, subscribeCommitted } from '../../utils/pendingSales'
import { Tabs, toast, ConnectionBar } from '../../ui'
import useSunMode    from '../../store/useSunMode'
import { friendlyError } from '../../utils/errors'
import ArtistServeMode from './ArtistServeMode'
import ProductGrid     from './pos/ProductGrid'
import Ticket          from './pos/Ticket'
import ClientPanel     from './pos/ClientPanel'
import PaymentFeedback from './pos/PaymentFeedback'
import s from './pos/pos.module.css'

const PREFS_KEY = 'yllacash-pos-prefs'
const loadPrefs = () => { try { return { sound: true, vibrate: true, rush: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } } catch { return { sound: true, vibrate: true, rush: false } } }

// Bip court (succès : aigu, erreur : grave)
function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = ok ? 1046 : 220
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.18 : 0.4))
    osc.start(); osc.stop(ctx.currentTime + (ok ? 0.18 : 0.4))
  } catch {}
}

// Ignore le même QR pendant ce délai après une vente (le client est encore devant la caméra)
const RESCAN_GUARD_MS = 4000

export default function Debit() {
  const { spectateurs, menu, logs } = useAppStore()
  const { currentEventId, events }  = useEventStore()
  const { user }                    = useAuthStore()
  const staffNom = user?.nom || 'Stand'
  const { sun, toggleSun }          = useSunMode()

  const [mode, setMode]         = useState('client') // client | artiste
  const [prefs, setPrefs]       = useState(loadPrefs)
  const [online, setOnline]     = useState(navigator.onLine)
  const [client, setClient]     = useState(null)
  const [searching, setSearching] = useState(false)
  const [scanError, setScanError] = useState('')
  const [qtys, setQtys]         = useState({})
  const [cat, setCat]           = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [pending, setPending]   = useState([])
  const [accepted, setAccepted] = useState([]) // ventes écrites à l'instant
  const [, tick]                = useState(0)
  const lastSale  = useRef({ id: null, at: 0 })
  const snapshots = useRef({}) // saleId -> { client, qtys } pour rouvrir le ticket après annulation
  const ticketRef = useRef(null)

  useEffect(() => subscribe(setPending), [])
  // « Paiement accepté » seulement une fois la vente réellement écrite
  useEffect(() => subscribeCommitted((sale) => {
    setAccepted(a => [...a.slice(-1), sale])
    setTimeout(() => setAccepted(a => a.filter(x => x.id !== sale.id)), 3500)
  }), [])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  // Compte à rebours du bandeau d'annulation
  const holding = pending.filter(p => p.status === 'holding' && p.commitAt > Date.now())
  useEffect(() => {
    if (!holding.length) return
    const t = setInterval(() => tick(n => n + 1), 500)
    return () => clearInterval(t)
  }, [holding.length])

  const setPref = (k, v) => setPrefs(p => {
    const n = { ...p, [k]: v }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)) } catch {}
    return n
  })

  // ── Catalogue ─────────────────────────────────────────────────
  const cats = useMemo(() => [...new Set(menu.map(m => m.cat).filter(Boolean))], [menu])
  const currentCat = cat && cats.includes(cat) ? cat : cats[0] || ''

  // Mode rush : 8 articles les plus vendus aujourd'hui (sinon les mieux stockés)
  const rushItems = useMemo(() => {
    const sold = {}
    const from = dayStart()
    ;(logs || []).forEach(t => {
      if (t.type !== 'debit' || (txTime(t) || 0) < from) return
      ;(t.items || []).forEach(i => { sold[i.nom] = (sold[i.nom] || 0) + (i.qty || 1) })
    })
    return [...menu]
      .filter(m => (m.stock || 0) > 0)
      .sort((a, b) => (sold[b.nom] || 0) - (sold[a.nom] || 0) || (b.stock || 0) - (a.stock || 0))
      .slice(0, 8)
  }, [menu, logs])

  const gridItems = prefs.rush ? rushItems : menu.filter(m => m.cat === currentCat)

  const lines = Object.entries(qtys)
    .map(([id, qty]) => { const m = menu.find(x => x.id === id); return m ? { ...m, qty } : null })
    .filter(Boolean)
  const total = lines.reduce((a, l) => a + (l.prix || 0) * l.qty, 0)

  const changeQty = (id, d) => setQtys(q => {
    const item = menu.find(m => m.id === id)
    const next = Math.max(0, (q[id] || 0) + d)
    if (d > 0 && item && next > (item.stock || 0)) return q // pas plus que le stock
    const n = { ...q, [id]: next }
    if (!next) delete n[id]
    return n
  })

  // L'article "vole" de sa tuile vers le ticket (transformations uniquement)
  const addItem = (m, tileEl) => {
    changeQty(m.id, 1)
    const pic = tileEl?.querySelector('[data-pic]')
    const target = ticketRef.current
    if (!pic || !target || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const a = pic.getBoundingClientRect(), b = target.getBoundingClientRect()
    const ghost = pic.cloneNode(true)
    Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: 0, zIndex: 60, pointerEvents: 'none', transition: 'transform .45s cubic-bezier(.5,0,.3,1), opacity .45s' })
    document.body.appendChild(ghost)
    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${b.left + 32 - a.left}px, ${b.top + 60 - a.top}px) scale(.35)`
      ghost.style.opacity = '0.2'
    })
    setTimeout(() => ghost.remove(), 480)
  }

  // ── Recherche du client (local, puis Firestore sur tous les événements) ──
  const findById = async (raw) => {
    const uid = String(raw).toUpperCase().trim()
    if (lastSale.current.id === uid && Date.now() - lastSale.current.at < RESCAN_GUARD_MS) return
    if (client?.id === uid) return
    const local = spectateurs.find(x => x.id === uid)
    if (local) { setClient(local); setScanError(''); return }

    setSearching(true); setScanError('')
    try {
      const staffEventId = user?.eventId || currentEventId
      const evIds = staffEventId
        ? [staffEventId, ...events.map(e => e.id).filter(id => id !== staffEventId)]
        : events.map(e => e.id)
      for (const evId of evIds) {
        const snap = await getDocs(query(collection(db, 'events', evId, 'spectateurs'), where('id', '==', uid)))
        if (!snap.empty) { setClient({ ...snap.docs[0].data(), _docId: snap.docs[0].id, _eventId: evId }); return }
      }
      for (const evId of evIds) {
        try {
          const bSnap = await getDoc(doc(db, 'events', evId, 'benevoles', uid))
          if (bSnap.exists()) { setClient({ ...bSnap.data(), id: uid, _docId: uid, _eventId: evId, _isBenev: true, solde: null }); return }
        } catch {}
      }
      setScanError(`Aucun compte pour le code ${uid}. Vérifiez le QR ou saisissez le code à la main.`)
    } catch (e) {
      setScanError(friendlyError(e, 'Recherche du client impossible.'))
    } finally {
      setSearching(false)
    }
  }

  const signal = (ok) => {
    if (prefs.sound) beep(ok)
    if (prefs.vibrate) navigator.vibrate?.(ok ? 80 : [120, 80, 120])
  }

  // ── Encaisser : débit retenu 10 s puis écrit ───────────────────
  const pay = () => {
    if (!client || !lines.length) return
    if (online && (client.solde || 0) < total) {
      signal(false)
      setFeedback({ kind: 'error', message: `Solde insuffisant : ${fmt(client.solde || 0)} pour un ticket de ${fmt(total)}.` })
      return
    }
    const id = holdSale({
      specId: client.id, specNom: client.nom, items: lines, total, staffNom,
      eventId: client._eventId || currentEventId,
    })
    signal(true)
    lastSale.current = { id: client.id, at: Date.now() }
    snapshots.current[id] = { client, qtys }
    setFeedback({ kind: 'ok', saleId: id, at: Date.now(), total, nom: client.nom, newSolde: (client.solde || 0) - total, offline: !online })
    setClient(null); setQtys({})
  }

  const undo = (saleId) => {
    if (cancelSale(saleId)) {
      // Rouvre le ticket annulé, sauf si le client suivant est déjà en cours
      const snap = snapshots.current[saleId]
      if (snap && !client && !lines.length) { setClient(snap.client); setQtys(snap.qtys) }
      delete snapshots.current[saleId]
      setFeedback(null)
      toast.info('Encaissement annulé : rien n\'a été débité')
    } else {
      toast.error('Trop tard : l\'encaissement est déjà enregistré')
    }
  }

  const failed  = pending.filter(p => p.status === 'failed')
  const waiting = pending.filter(p => p.status === 'waiting-network')
  const standName = staffNom

  return (
    <div className={clsx(s.page, sun && 'sun')}>
      {/* Barre d'outils */}
      <div className={s.toolbar}>
        <Tabs label="Type de vente" value={mode} onChange={(v) => { setMode(v); setClient(null); setQtys({}) }}
          items={[{ value: 'client', label: 'Vente client' }, { value: 'artiste', label: 'Artiste' }]} />
        <div className={s.prefs}>
          <button type="button" className={clsx(s.prefIcon, sun && s.prefOn)} onClick={toggleSun}
            aria-pressed={sun} aria-label="Plein soleil" title={sun ? 'Plein soleil activé' : "Plein soleil : contraste fort pour l'extérieur"}>
            <Sun size={15} />
          </button>
          {mode === 'client' && (<>
            <button type="button" className={clsx(s.pref, prefs.rush && s.prefOn)} onClick={() => setPref('rush', !prefs.rush)} aria-pressed={prefs.rush}>
              <Zap size={15} /> Mode rush
            </button>
            <button type="button" className={clsx(s.prefIcon, prefs.sound && s.prefOn)} onClick={() => setPref('sound', !prefs.sound)}
              aria-pressed={prefs.sound} aria-label={prefs.sound ? 'Couper le son' : 'Activer le son'} title={prefs.sound ? 'Son activé' : 'Son coupé'}>
              {prefs.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            {'vibrate' in navigator && (
              <button type="button" className={clsx(s.prefIcon, prefs.vibrate && s.prefOn)} onClick={() => setPref('vibrate', !prefs.vibrate)}
                aria-pressed={prefs.vibrate} aria-label="Vibration" title={prefs.vibrate ? 'Vibration activée' : 'Vibration coupée'}>
                <Vibrate size={15} />
              </button>
            )}
          </>)}
        </div>
      </div>

      {mode === 'artiste' && (
        <ArtistServeMode eventId={currentEventId} menu={menu} staffNom={staffNom} staffId={user?.id || user?.uid || null} />
      )}

      {mode === 'client' && (<>
        {/* Bandeaux d'état : hors ligne, annulation possible, échecs */}
        <ConnectionBar online={online} pending={waiting.length}
          offlineText="Hors ligne · les encaissements sont gardés sur cet appareil, les soldes ne sont pas vérifiés" />
        {holding.map(p => (
          <div key={p.id} className={clsx(s.notice, s.noticeBrand)} role="status">
            <span>{p.specNom || p.specId} · −{fmt(p.total)} · enregistré dans {Math.max(0, Math.ceil((p.commitAt - Date.now()) / 1000))} s</span>
            <button type="button" onClick={() => undo(p.id)}>
              <Undo2 size={14} /> Annuler
            </button>
          </div>
        ))}
        {accepted.map(p => (
          <div key={p.id} className={clsx(s.notice, s.noticeGreen)} role="status">
            <CheckCircle2 size={15} /> <span>Paiement accepté · {p.specNom || p.specId} · {fmt(p.total)}</span>
          </div>
        ))}
        {failed.map(p => (
          <div key={p.id} className={clsx(s.notice, s.noticeRed)} role="alert">
            <AlertTriangle size={15} />
            <span>Encaissement non passé : {p.specNom || p.specId} · {fmt(p.total)} — {p.error}</span>
            <button type="button" onClick={() => retrySale(p.id)}><RotateCcw size={14} /> Réessayer</button>
            <button type="button" onClick={() => dismissSale(p.id)}>Retirer</button>
          </div>
        ))}

        <div className={s.layout}>
          <section className={s.catalog} aria-label="Articles">
            {!prefs.rush && cats.length > 1 && (
              <div className={s.cats} role="tablist" aria-label="Catégories">
                {cats.map(c => (
                  <button key={c} type="button" role="tab" aria-selected={c === currentCat}
                    className={clsx(s.cat, c === currentCat && s.catOn)} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
            )}
            {prefs.rush && <p className={s.rushNote}><Zap size={14} /> Les 8 articles les plus vendus aujourd'hui</p>}
            <ProductGrid items={gridItems} qtys={qtys} onAdd={addItem} big={prefs.rush} />
          </section>

          <aside className={s.side}>
            <ClientPanel client={client} searching={searching} error={scanError} onScan={findById}
              onClear={() => { setClient(null); setScanError('') }} />
            <Ticket
              lines={lines} total={total} client={client} online={online}
              onChange={changeQty} onClear={() => setQtys({})} onPay={pay}
              standName={standName} ticketRef={ticketRef}
            />
          </aside>
        </div>

        {/* Mobile : total + encaisser toujours visibles */}
        <div className={s.mobileBar}>
          <div><span>{lines.reduce((a, l) => a + l.qty, 0)} article(s)</span><b>{fmt(total)}</b></div>
          <button type="button" onClick={() => ticketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} disabled={!lines.length}>
            Voir le ticket
          </button>
        </div>
      </>)}

      <PaymentFeedback
        feedback={feedback}
        onUndo={() => feedback && undo(feedback.saleId)}
        onClose={() => setFeedback(null)}
      />
    </div>
  )
}
