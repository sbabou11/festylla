/**
 * pages/stand/Cuisine.jsx — tableau de tickets de la cuisine (commandes + réservations)
 *
 * Deux colonnes : « En préparation » (pending / processing) et « Prêtes » (ready),
 * côte à côte sur tablette en paysage et ordinateur, en onglets sur téléphone.
 * Tickets triés par ancienneté (FIFO). Temps d'attente en barre fine + minutes,
 * teinte selon les seuils de production (cf. cuisine/timing.js) :
 *   vert < 2 min · or 2-5 · orange 5-10 · rouge 10-15 (pulse lent) · rouge plein > 15 (pulse rapide).
 * Actions : Prête (le ticket glisse vers « Prêtes » avec un anneau vert), Valider le retrait, Annuler (motif).
 *
 * Temps réel via watchCommandes / watchReservations. Compteurs rafraîchis toutes les 10 s.
 * Son optionnel (persisté dans localStorage) : bip à chaque nouvelle commande + alarmes d'escalade.
 * Plein soleil disponible dans la barre d'outils (préférence de l'appareil).
 *
 * demo : { commandes, reservations } — aperçu de développement, aucun écouteur ni écriture Firestore.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import {
  Volume2, VolumeX, AlertCircle, ChefHat, Package, Monitor, ShoppingBag, Sun, Bell,
} from 'lucide-react'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import useSunMode from '../../store/useSunMode'
import {
  watchCommandes, markCommandeReady, cancelCommande, markCommandeCollected,
  watchReservations, marquerResaPrete, annulerReservation, validerRetrait,
} from '../../firebase/service'
import { Tabs, Empty, toast } from '../../ui'
import Ticket from './cuisine/Ticket'
import { CancelDialog, CollectDialog, MOTIFS } from './cuisine/Dialogs'
import { urgencyLevel, RAPPEL_INTERVAL, LEGEND, getTs, ticketNumber } from './cuisine/timing'
import { playBip, playBeep2, playSiren, playAlarm } from './cuisine/sounds'
import s from './cuisine/cuisine.module.css'

// Durée de l'anneau vert sur un ticket qui vient de passer « prête »
const ARRIVE_MS = 1200

// ─── Composant principal ─────────────────────────────────────────────
export default function Cuisine({ demo = null } = {}) {
  const { user } = useAuthStore()
  const { currentEventId } = useEventStore()
  const { sun, toggleSun } = useSunMode()

  const [commandes, setCommandes] = useState(() => demo?.commandes || [])
  const [reservations, setReservations] = useState(() => demo?.reservations || [])
  const [filter, setFilter]       = useState('pending')  // onglet actif sur téléphone : pending | ready
  const [now, setNow]             = useState(Date.now())
  const [actingId, setActingId]   = useState(null)
  const [err, setErr]             = useState('')
  const [cancelModal, setCancelModal] = useState(null)   // commande/résa à annuler
  // commande/résa pour laquelle on demande confirmation du retrait
  const [collectModal, setCollectModal] = useState(null)
  const [motifIdx, setMotifIdx]   = useState(0)
  const [motifTexte, setMotifTexte] = useState('')
  // Tickets qui viennent de passer « prête » : glissement + anneau vert à l'arrivée
  const [arrivals, setArrivals] = useState(() => new Set())
  const arrivalTimers = useRef({})

  // Son
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('cuisine-sound') === '1' } catch { return false }
  })
  const prevCountRef = useRef(0)
  const initialLoadRef = useRef(true)
  // Mémoire des derniers rappels sonores par commande : { [commandeId]: lastAlarmTimestamp }
  const lastAlarmsRef = useRef({})

  // Listener temps réel — commandes
  useEffect(() => {
    if (demo) return
    if (!currentEventId) { setCommandes([]); return }
    const unsub = watchCommandes(setCommandes, currentEventId)
    return unsub
  }, [currentEventId, demo])

  // Listener temps réel — réservations (affichées avec les commandes en cuisine)
  useEffect(() => {
    if (demo) return
    if (!currentEventId) { setReservations([]); return }
    const unsub = watchReservations(setReservations, currentEventId)
    return unsub
  }, [currentEventId, demo])

  // Tick toutes les 10 secondes pour mettre à jour les compteurs
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(tick)
  }, [])

  // Mémorise les choix de son
  useEffect(() => {
    try { localStorage.setItem('cuisine-sound', soundOn ? '1' : '0') } catch {}
  }, [soundOn])

  // Nettoyage des minuteries d'arrivée
  useEffect(() => () => Object.values(arrivalTimers.current).forEach(clearTimeout), [])

  // FALLBACK NUMÉRO (fix bug "#2LWF-301") :
  // Si une résa/commande n'a pas reçu de `numero` séquentiel à la création, on calcule
  // un numéro d'affichage `_displayNumero` à partir de son rang chronologique parmi les
  // résas+commandes du même jour. Les items avec un vrai `numero` gardent priorité ;
  // les autres reçoivent un numéro calculé non chevauchant.
  const itemsWithDisplayNumero = useMemo(() => {
    // Helper : extrait la clé "jour" (YYYY-MM-DD) depuis createdAt
    const dayKey = (item) => {
      const ts = getTs(item)
      if (!ts) return 'unknown'
      const d = new Date(ts)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const allItems = [
      ...commandes.map(c => ({ ...c, _kind: 'cmd' })),
      ...reservations.map(r => ({ ...r, _kind: 'resa' })),
    ]
    const byDay = new Map()
    for (const it of allItems) {
      const key = dayKey(it)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(it)
    }
    const result = []
    for (const [, items] of byDay) {
      const sorted = items.slice().sort((a, b) => (getTs(a) || 0) - (getTs(b) || 0))
      const used = new Set()
      sorted.forEach(it => {
        if (typeof it.numero === 'number' && it.numero > 0) used.add(it.numero)
      })
      // Remplit les trous puis continue au-delà du max présent : pas de collision
      let nextFree = 1
      const findNextFree = () => {
        while (used.has(nextFree)) nextFree++
        used.add(nextFree)
        return nextFree++
      }
      for (const it of sorted) {
        const num = (typeof it.numero === 'number' && it.numero > 0)
          ? it.numero
          : findNextFree()
        result.push({ ...it, _displayNumero: num })
      }
    }
    return new Map(result.map(r => [r.id, r]))
  }, [commandes, reservations])

  // Version enrichie d'un item avec _displayNumero
  const withDisplay = (item) => itemsWithDisplayNumero.get(item.id) || item

  // En préparation : commandes 'pending' ; résas 'processing' (défaut) ou 'pending' (legacy)
  const pending = useMemo(() => {
    const cmds  = commandes
      .filter(c => c.status === 'pending')
      .map(c => withDisplay({ ...c, _kind: 'cmd' }))
    const resas = reservations
      .filter(r => r.status === 'processing' || r.status === 'pending')
      .map(r => withDisplay({ ...r, _kind: 'resa' }))
    return [...cmds, ...resas].sort((a, b) => (getTs(a) || 0) - (getTs(b) || 0))
  }, [commandes, reservations, itemsWithDisplayNumero])

  const ready = useMemo(() => {
    const cmds  = commandes
      .filter(c => c.status === 'ready')
      .map(c => withDisplay({ ...c, _kind: 'cmd' }))
    const resas = reservations
      .filter(r => r.status === 'ready')
      .map(r => withDisplay({ ...r, _kind: 'resa' }))
    return [...cmds, ...resas].sort((a, b) => (getTs(a) || 0) - (getTs(b) || 0))
  }, [commandes, reservations, itemsWithDisplayNumero])

  // Notification sonore : quand le nombre de pending augmente, jouer un bip
  useEffect(() => {
    const count = pending.length
    if (initialLoadRef.current) {
      // Premier rendu : ne pas jouer le son (pour les commandes déjà présentes)
      prevCountRef.current = count
      initialLoadRef.current = false
      return
    }
    if (soundOn && count > prevCountRef.current) {
      playBip()
    }
    prevCountRef.current = count
  }, [pending.length, soundOn])

  // ALARMES D'ESCALADE — toutes les 5 s, chaque commande en préparation au-delà de
  // 5 / 10 / 15 min déclenche le son de son niveau, au plus une fois par RAPPEL_INTERVAL[level].
  // Coupées si le son est désactivé.
  useEffect(() => {
    if (!soundOn) {
      lastAlarmsRef.current = {}
      return
    }
    const check = () => {
      const nowMs = Date.now()
      pending.forEach(cmd => {
        const ts = getTs(cmd)
        if (!ts) return
        const secs = Math.floor((nowMs - ts) / 1000)
        const level = urgencyLevel(secs)
        if (level === 0) {
          delete lastAlarmsRef.current[cmd.id]
          return
        }
        const interval = RAPPEL_INTERVAL[level] * 1000
        const last = lastAlarmsRef.current[cmd.id] || 0
        if (nowMs - last >= interval) {
          if (level === 1) playBeep2()
          else if (level === 2) playSiren()
          else if (level === 3) playAlarm()
          lastAlarmsRef.current[cmd.id] = nowMs
        }
      })
    }
    check()
    const tick = setInterval(check, 5000)
    return () => clearInterval(tick)
  }, [pending, soundOn])

  // Arrivée animée dans « Prêtes » : marqué avant l'écriture (le snapshot local peut arriver avant la promesse)
  const markArrival = (id, on) => {
    clearTimeout(arrivalTimers.current[id])
    setArrivals(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next })
    if (on) arrivalTimers.current[id] = setTimeout(() => markArrival(id, false), ARRIVE_MS)
  }

  // Aperçu : change le statut localement, sans Firestore
  const demoPatch = (item, patch) => {
    const set = item._kind === 'resa' ? setReservations : setCommandes
    set(list => list.map(x => (x.id === item.id ? { ...x, ...patch } : x)))
  }

  // Actions — dispatch selon _kind (commande ou réservation)
  const handleReady = async (item) => {
    setActingId(item.id); setErr('')
    markArrival(item.id, true)
    try {
      const staff = (user && user.nom) ? user.nom : 'Cuisine'
      if (demo) {
        demoPatch(item, { status: 'ready', readyAt: new Date().toISOString() })
      } else if (item._kind === 'resa') {
        // Pour les résas, on passe directement à 'ready' depuis 'processing'
        const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
        await marquerResaPrete(item.id, staff, user?.id, isAdmin)
      } else {
        await markCommandeReady(item.id, staff, currentEventId)
      }
    } catch (e) { setErr(e.message); markArrival(item.id, false) }
    finally { setActingId(null) }
  }

  const openCancel = (item) => {
    setCancelModal(item)
    setMotifIdx(0)
    setMotifTexte('')
    setErr('')
  }

  const handleCancel = async () => {
    if (!cancelModal) return
    const motif = motifIdx === 2 ? (motifTexte.trim() || 'Autres') : MOTIFS[motifIdx]
    setActingId(cancelModal.id); setErr('')
    try {
      const staff = (user && user.nom) ? user.nom : 'Cuisine'
      if (demo) {
        demoPatch(cancelModal, { status: 'cancelled' })
      } else if (cancelModal._kind === 'resa') {
        await annulerReservation(cancelModal.id, motif)
      } else {
        await cancelCommande(cancelModal.id, staff, motif, currentEventId)
      }
      toast.info(`${cancelModal._kind === 'resa' ? 'Réservation' : 'Commande'} #${ticketNumber(cancelModal)} annulée`)
      setCancelModal(null)
    } catch (e) { setErr(e.message) }
    finally { setActingId(null) }
  }

  // Valider le retrait — résas : débit du solde + 'collected' (validerRetrait) ;
  // commandes : 'collected' (débit déjà fait à la création ou côté endpoint)
  const handleCollect = async () => {
    if (!collectModal) return
    setActingId(collectModal.id); setErr('')
    try {
      const staff = (user && user.nom) ? user.nom : 'Cuisine'
      if (demo) {
        demoPatch(collectModal, { status: 'collected' })
      } else if (collectModal._kind === 'resa') {
        await validerRetrait(collectModal.id, staff)
      } else {
        await markCommandeCollected(collectModal.id, staff, currentEventId)
      }
      toast.success(`#${ticketNumber(collectModal)} remise au client`)
      setCollectModal(null)
    } catch (e) { setErr(e.message) }
    finally { setActingId(null) }
  }

  const openCollect = (item) => { setErr(''); setCollectModal(item) }

  // Liens vers l'écran public et la borne, dans un nouvel onglet
  const openTab = (path) => {
    if (!currentEventId) return
    window.open(`${path}?ev=${currentEventId}`, '_blank', 'noopener')
  }

  const modalOpen = !!(cancelModal || collectModal)

  const renderColumn = (key, list) => {
    const isPendingCol = key === 'pending'
    return (
      <section key={key} className={s.col} data-active={filter === key} aria-labelledby={`cuisine-col-${key}`}>
        <h3 id={`cuisine-col-${key}`} className={clsx(s.colHead, isPendingCol ? s.colHeadPending : s.colHeadReady)}>
          {isPendingCol ? <ChefHat size={18} aria-hidden="true" /> : <Package size={18} aria-hidden="true" />}
          <span>{isPendingCol ? 'En préparation' : 'Prêtes'}</span>
          <span className={s.colCount}>{list.length}</span>
        </h3>
        {list.length === 0 ? (
          isPendingCol
            ? <Empty icon={ChefHat} title="Aucune commande en cours">Les nouvelles commandes apparaîtront ici automatiquement.</Empty>
            : <Empty icon={Package} title="Aucune commande prête">Les commandes marquées prêtes s'afficheront ici.</Empty>
        ) : (
          <ul className={s.list}>
            {list.map(cmd => (
              <li key={cmd.id}>
                <Ticket
                  commande={cmd}
                  now={now}
                  acting={actingId === cmd.id && !modalOpen}
                  arriving={!isPendingCol && arrivals.has(cmd.id)}
                  leaving={isPendingCol && actingId === cmd.id && !modalOpen}
                  onReady={() => handleReady(cmd)}
                  onCancel={() => openCancel(cmd)}
                  onCollect={() => openCollect(cmd)}
                />
              </li>
            ))}
          </ul>
        )}
        {isPendingCol && list.length > 0 && (
          <ul className={s.legend} aria-label="Légende des délais">
            {LEGEND.map(l => (
              <li key={l.tone}>
                <span className={clsx(s.swatch, s[`sw_${l.tone}`])} aria-hidden="true" />
                {l.label}
                {l.bell && <Bell size={11} aria-label="alerte sonore" />}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className={clsx(s.page, sun && 'sun')}>
      {/* Barre d'outils */}
      <div className={s.toolbar}>
        <h2 className={s.title}>Cuisine</h2>
        <div className={s.tools}>
          <button type="button" className={clsx(s.toolBtn, soundOn && s.toolOn)} onClick={() => setSoundOn(v => !v)}
            aria-pressed={soundOn}
            title={soundOn ? 'Désactiver le son' : 'Activer le son à chaque nouvelle commande'}>
            {soundOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            <span className={s.toolLabel}>Son</span>
          </button>
          <button type="button" className={clsx(s.toolBtn, sun && s.toolOn)} onClick={toggleSun}
            aria-pressed={sun} title={sun ? 'Plein soleil activé' : "Plein soleil : contraste fort pour l'extérieur"}>
            <Sun size={16} aria-hidden="true" /> <span className={s.toolLabel}>Plein soleil</span>
          </button>
          <button type="button" className={s.toolBtn} onClick={() => openTab('/ecran')} disabled={!currentEventId}
            aria-label="Écran public" title="Ouvrir l'écran public des commandes prêtes (dans un nouvel onglet)">
            <Monitor size={16} aria-hidden="true" /> <span className={s.toolLabel}>Écran public</span>
          </button>
          <button type="button" className={s.toolBtn} onClick={() => openTab('/borne')} disabled={!currentEventId}
            aria-label="Borne" title="Ouvrir la borne self-service (dans un nouvel onglet)">
            <ShoppingBag size={16} aria-hidden="true" /> <span className={s.toolLabel}>Borne</span>
          </button>
        </div>
      </div>

      {/* Erreur globale (hors fenêtres, qui affichent la leur) */}
      {err && !modalOpen && (
        <p className={s.err} role="alert"><AlertCircle size={16} aria-hidden="true" /> <span>{err}</span></p>
      )}

      {/* Onglets sur téléphone ; masqués quand les colonnes tiennent côte à côte */}
      <div className={s.tabsWrap}>
        <Tabs
          label="Colonnes de la cuisine"
          value={filter}
          onChange={setFilter}
          className={s.tabs}
          items={[
            { value: 'pending', label: 'En préparation', count: pending.length },
            { value: 'ready',   label: 'Prêtes',         count: ready.length },
          ]}
        />
      </div>

      <div className={s.board}>
        {renderColumn('pending', pending)}
        {renderColumn('ready', ready)}
      </div>

      <CancelDialog
        commande={cancelModal}
        motifIdx={motifIdx}
        setMotifIdx={setMotifIdx}
        motifTexte={motifTexte}
        setMotifTexte={setMotifTexte}
        loading={!!cancelModal && actingId === cancelModal.id}
        err={cancelModal ? err : ''}
        onClose={() => setCancelModal(null)}
        onConfirm={handleCancel}
        className={sun ? 'sun' : undefined}
      />
      <CollectDialog
        commande={collectModal}
        loading={!!collectModal && actingId === collectModal.id}
        err={collectModal ? err : ''}
        onClose={() => setCollectModal(null)}
        onConfirm={handleCollect}
        className={sun ? 'sun' : undefined}
      />
    </div>
  )
}
