/**
 * pages/stand/Cuisine.jsx — v1.0.0 (Lot 3)
 *
 * Suivi en temps réel des commandes en cours de préparation.
 *
 * Affichage :
 *   - 2 filtres : En préparation (pending) / Prêtes (ready)
 *   - Cartes triées par ancienneté (FIFO)
 *   - Bordure latérale colorée selon la durée d'attente :
 *       • Vert    (< 2 min)
 *       • Jaune   (2-5 min)
 *       • Orange  (5-10 min)
 *       • Rouge   (> 10 min, légèrement clignotant)
 *   - Actions par carte : Marquer prête / Annuler (avec motif)
 *
 * Mises à jour temps réel via watchCommandes() du Lot 1.
 * Compteurs rafraîchis toutes les 10 secondes via un setInterval unique.
 *
 * Toggle son optionnel : "bip" discret à chaque nouvelle commande pending.
 * Désactivé par défaut, persisté dans localStorage.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Clock, CheckCircle, X, Volume2, VolumeX, AlertCircle, ChefHat, Package,
  Monitor, ShoppingBag,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import {
  watchCommandes, markCommandeReady, cancelCommande, markCommandeCollected,
  watchReservations, marquerResaPrete, annulerReservation, validerRetrait,
} from '../../firebase/service'
import { useBreakpoint } from '../../hooks/useBreakpoint'

// Seuils de durée en secondes — escalade progressive
// 0-2 min   = vert        (normal)
// 2-5 min   = jaune       (surveiller)
// 5-10 min  = orange      (urgent + 1er niveau alerte sonore)
// 10-15 min = rouge       (critique + 2e niveau alerte plus fréquente)
// > 15 min  = rouge intense (panique + alarme stridente)
const SEUILS = {
  green:  120,   // < 2 min
  yellow: 300,   // 2-5 min
  orange: 600,   // 5-10 min
  red:    900,   // 10-15 min
  // au-delà : rouge intense + alarme
}

// Niveau d'urgence pour les rappels sonores (utilisé par la boucle d'alarmes)
// 0 = pas d'alerte ; 1 = orange ; 2 = rouge ; 3 = panique
function urgencyLevel(secs) {
  if (secs < SEUILS.yellow) return 0  // < 5 min : aucune alerte
  if (secs < SEUILS.orange) return 1  // 5-10 min
  if (secs < SEUILS.red)    return 2  // 10-15 min
  return 3                            // > 15 min
}

// Intervalle entre 2 rappels sonores en secondes, selon le niveau
const RAPPEL_INTERVAL = {
  1: 60,  // rappel toutes les 60s entre 5 et 10 min
  2: 30,  // rappel toutes les 30s entre 10 et 15 min
  3: 15,  // rappel toutes les 15s au-delà de 15 min
}

// Motifs d'annulation prédéfinis (cf. Reservations.jsx pour cohérence)
const MOTIFS = ['Client n\'est pas revenu', 'Rupture de stock', 'Autres']

// Couleurs CSS-vars selon la durée — escalade en 5 paliers
function colorForDuration(secs) {
  if (secs < SEUILS.green)  return { c: 'var(--green-dark)',  bg: 'var(--green-light)',  label: '🟢', level: 0 }
  if (secs < SEUILS.yellow) return { c: 'var(--gold-dark)',   bg: 'var(--gold-light)',   label: '🟡', level: 0 }
  if (secs < SEUILS.orange) return { c: 'var(--coral-dark)',  bg: 'var(--coral-light)',  label: '🟠', level: 1 }
  if (secs < SEUILS.red)    return { c: 'var(--red-dark)',    bg: 'var(--red-light)',    label: '🔴', level: 2, blink: true }
  // Niveau 3 : panique — fond plus saturé, pulse rapide
  return { c: '#fff', bg: '#A32D2D', label: '🚨', level: 3, blinkFast: true, panic: true }
}

// Format mm'ss"
function fmtDuree(secs) {
  if (!isFinite(secs) || secs < 0) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

// Récupère le timestamp d'une commande (toDate / Date / ISO string / millis)
function getTs(commande) {
  const t = commande.createdAt
  if (!t) return null
  if (t.toDate)   return t.toDate().getTime()
  if (t.seconds)  return t.seconds * 1000
  if (t instanceof Date) return t.getTime()
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return null
}

// ─── Composant principal ─────────────────────────────────────────────
export default function Cuisine() {
  const { user } = useAuthStore()
  const { currentEventId } = useEventStore()
  const { isMobile } = useBreakpoint()

  const [commandes, setCommandes] = useState([])
  const [reservations, setReservations] = useState([])
  const [filter, setFilter]       = useState('pending')  // pending | ready
  const [now, setNow]             = useState(Date.now())
  const [actingId, setActingId]   = useState(null)
  const [err, setErr]             = useState('')
  const [cancelModal, setCancelModal] = useState(null)   // commande/résa à annuler
  // commande/résa pour laquelle on demande confirmation du retrait
  // (modale différente d'cancelModal — workflow distinct)
  const [collectModal, setCollectModal] = useState(null)
  const [motifIdx, setMotifIdx]   = useState(0)
  const [motifTexte, setMotifTexte] = useState('')

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
    if (!currentEventId) { setCommandes([]); return }
    const unsub = watchCommandes(setCommandes, currentEventId)
    return unsub
  }, [currentEventId])

  // Listener temps réel — réservations (affichées côte à côte des commandes en cuisine)
  useEffect(() => {
    if (!currentEventId) { setReservations([]); return }
    const unsub = watchReservations(setReservations, currentEventId)
    return unsub
  }, [currentEventId])

  // Tick toutes les 10 secondes pour mettre à jour les compteurs
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(tick)
  }, [])

  // Mémorise les choix de son
  useEffect(() => {
    try { localStorage.setItem('cuisine-sound', soundOn ? '1' : '0') } catch {}
  }, [soundOn])

  // Filtrage — fusion commandes + réservations en deux listes triées par ancienneté
  // Chaque item porte un champ _kind ('cmd' ou 'resa') pour différencier visuellement
  // et pour appeler la bonne fonction de service au moment des actions.
  //
  // Statuts considérés "en préparation" :
  //   - Commandes : status === 'pending'
  //   - Réservations : status === 'processing' (nouveau défaut) OU 'pending' (legacy, anciennes résas)
  //
  // FALLBACK NUMÉRO (fix bug "#2LWF-301") :
  // Si une résa/commande n'a pas reçu de `numero` séquentiel à la création
  // (legacy, résas créées avant le système de numéros, ou bug de propagation),
  // on calcule un numéro d'affichage `_displayNumero` à partir de son rang
  // chronologique parmi les résas+commandes du même jour. Ainsi la cuisine
  // voit toujours #1, #2, #3... même pour les données héritées.
  //
  // On combine ensuite tout en un set et on attribue les rangs par ordre de
  // création (createdAt). Les items avec un vrai `numero` gardent priorité ;
  // les autres reçoivent un numéro calculé non chevauchant.
  const itemsWithDisplayNumero = useMemo(() => {
    // Helper : extrait la clé "jour" (YYYY-MM-DD) depuis createdAt ou date
    const dayKey = (item) => {
      const ts = getTs(item)
      if (!ts) return 'unknown'
      const d = new Date(ts)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    // Tous les items du domaine (cmd + résa) pour calcul homogène
    const allItems = [
      ...commandes.map(c => ({ ...c, _kind: 'cmd' })),
      ...reservations.map(r => ({ ...r, _kind: 'resa' })),
    ]
    // On regroupe par jour, trie par createdAt, puis attribue les numéros manquants
    // en évitant les collisions avec les numéros déjà présents pour ce jour.
    const byDay = new Map()
    for (const it of allItems) {
      const key = dayKey(it)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(it)
    }
    const result = []
    for (const [, items] of byDay) {
      const sorted = items.slice().sort((a, b) => (getTs(a) || 0) - (getTs(b) || 0))
      // Set des numéros déjà utilisés ce jour-là (par les items qui ont déjà un `numero`)
      const used = new Set()
      sorted.forEach(it => {
        if (typeof it.numero === 'number' && it.numero > 0) used.add(it.numero)
      })
      // Attribution des numéros manquants en remplissant les trous, puis en
      // continuant au-delà du max présent. Garantit pas de collision.
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
    // Index par id pour accès rapide
    const byId = new Map(result.map(r => [r.id, r]))
    return byId
  }, [commandes, reservations])

  // Helper qui renvoie une version enrichie d'un item avec _displayNumero
  const withDisplay = (item) => itemsWithDisplayNumero.get(item.id) || item

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

  // Liste affichée selon le filtre
  const displayed = filter === 'ready' ? ready : pending

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

  // ═══════════════════════════════════════════════════════════════════
  // ALARMES D'ESCALADE — son strident pour les commandes qui traînent
  // ═══════════════════════════════════════════════════════════════════
  // Toutes les 5 secondes, on vérifie chaque commande pending :
  //   - Si elle dépasse un seuil (5 / 10 / 15 min) on déclenche un son selon le niveau
  //   - On n'alarme pas plus d'une fois par RAPPEL_INTERVAL[level] secondes pour ne pas saturer
  //   - Les sons sont coupés si le toggle son est OFF
  useEffect(() => {
    if (!soundOn) {
      // Quand le son est désactivé, on reset les compteurs pour repartir propre quand on réactivera
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
          // Sortie de l'état d'alerte : on oublie le timestamp pour repartir clean si retour
          delete lastAlarmsRef.current[cmd.id]
          return
        }
        const interval = RAPPEL_INTERVAL[level] * 1000
        const last = lastAlarmsRef.current[cmd.id] || 0
        if (nowMs - last >= interval) {
          // Joue le son du niveau correspondant
          if (level === 1) playBeep2()
          else if (level === 2) playSiren()
          else if (level === 3) playAlarm()
          lastAlarmsRef.current[cmd.id] = nowMs
        }
      })
    }
    // Vérification initiale immédiate puis toutes les 5s
    check()
    const tick = setInterval(check, 5000)
    return () => clearInterval(tick)
  }, [pending, soundOn])

  // Actions — dispatch selon _kind (commande ou réservation)
  const handleReady = async (item) => {
    setActingId(item.id); setErr('')
    try {
      const staff = (user && user.nom) ? user.nom : 'Cuisine'
      if (item._kind === 'resa') {
        // Pour les résas, on passe directement à 'ready' depuis 'processing'
        const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
        await marquerResaPrete(item.id, staff, user?.id, isAdmin)
      } else {
        await markCommandeReady(item.id, staff, currentEventId)
      }
    } catch (e) { setErr(e.message) }
    finally { setActingId(null) }
  }

  const openCancel = (item) => {
    setCancelModal(item)
    setMotifIdx(0)
    setMotifTexte('')
  }

  const handleCancel = async () => {
    if (!cancelModal) return
    const motif = motifIdx === 2 ? (motifTexte.trim() || 'Autres') : MOTIFS[motifIdx]
    setActingId(cancelModal.id); setErr('')
    try {
      const staff = (user && user.nom) ? user.nom : 'Cuisine'
      if (cancelModal._kind === 'resa') {
        await annulerReservation(cancelModal.id, motif)
      } else {
        await cancelCommande(cancelModal.id, staff, motif, currentEventId)
      }
      setCancelModal(null)
    } catch (e) { setErr(e.message) }
    finally { setActingId(null) }
  }

  // Action "Valider le retrait" — appelée depuis la modale de confirmation
  // ouverte par le bouton sur les cards prêtes. Pour les résas, déclenche
  // le débit du solde du spectateur (validerRetrait). Pour les commandes
  // (déjà payées à la création), c'est juste un changement de statut.
  const handleCollect = async () => {
    if (!collectModal) return
    setActingId(collectModal.id); setErr('')
    try {
      const staff = (user && user.nom) ? user.nom : 'Cuisine'
      if (collectModal._kind === 'resa') {
        // Pour les résas : débit du solde + status='collected' en une transaction
        await validerRetrait(collectModal.id, staff)
      } else {
        // Pour les commandes : status='collected' (débit déjà effectué à la création
        // si payée immédiatement, sinon débit à ce moment-là côté endpoint)
        await markCommandeCollected(collectModal.id, staff, currentEventId)
      }
      setCollectModal(null)
    } catch (e) { setErr(e.message) }
    finally { setActingId(null) }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 0 20px' }}>

      {/* ─── Header : filtres + toggle son ────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        marginBottom: 14,
        flexWrap: 'wrap',
      }}>
        {/* Filtres */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', gap: 4, padding: 3,
          background: 'var(--bg2)',
          borderRadius: 10,
        }}>
          <FilterTab
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
            label={isMobile ? `En prép. (${pending.length})` : `En préparation (${pending.length})`}
          />
          <FilterTab
            active={filter === 'ready'}
            onClick={() => setFilter('ready')}
            label={`Prêtes (${ready.length})`}
          />
        </div>

        {/* Toggle son */}
        <button onClick={() => setSoundOn(s => !s)}
          title={soundOn ? "Désactiver le son" : "Activer le son à chaque nouvelle commande"}
          style={{
            width: 38, height: 38, borderRadius: 10,
            background: soundOn ? 'var(--brand)' : 'var(--bg)',
            border: '0.5px solid ' + (soundOn ? 'var(--brand)' : 'var(--border)'),
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: soundOn ? '#fff' : 'var(--muted)',
            flexShrink: 0,
          }}>
          {soundOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}
        </button>

        {/* Bouton "Écran public" — ouvre /ecran?ev=X dans un nouvel onglet
            pour qu'un staff puisse balancer rapidement l'affichage des
            commandes prêtes sur un grand écran. Ne touche pas la cuisine. */}
        <button onClick={() => {
            if (!currentEventId) return
            window.open(`/ecran?ev=${currentEventId}`, '_blank', 'noopener')
          }}
          disabled={!currentEventId}
          title="Ouvrir l'écran public des commandes prêtes (dans un nouvel onglet)"
          style={{
            height: 38, padding: '0 12px', borderRadius: 10,
            background: 'var(--bg)',
            border: '0.5px solid var(--border)',
            cursor: currentEventId ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text)', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', flexShrink: 0,
            opacity: currentEventId ? 1 : 0.4,
          }}>
          <Monitor size={14}/>
          {!isMobile && 'Écran public'}
        </button>

        {/* Bouton "Borne" — ouvre /borne?ev=X dans un nouvel onglet pour
            installer rapidement la borne self-service sur une tablette
            (le staff scanne le QR du nouvel onglet ou copie l'URL). */}
        <button onClick={() => {
            if (!currentEventId) return
            window.open(`/borne?ev=${currentEventId}`, '_blank', 'noopener')
          }}
          disabled={!currentEventId}
          title="Ouvrir la borne self-service (dans un nouvel onglet)"
          style={{
            height: 38, padding: '0 12px', borderRadius: 10,
            background: 'var(--bg)',
            border: '0.5px solid var(--border)',
            cursor: currentEventId ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text)', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', flexShrink: 0,
            opacity: currentEventId ? 1 : 0.4,
          }}>
          <ShoppingBag size={14}/>
          {!isMobile && 'Borne'}
        </button>
      </div>

      {/* ─── Erreur globale ──────────────────────────────────────── */}
      {err && (
        <div style={{
          padding: '10px 12px', marginBottom: 10,
          background: 'var(--red-light)', color: 'var(--red-dark)',
          borderRadius: 8, fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={14}/> {err}
        </div>
      )}

      {/* ─── Liste des commandes ─────────────────────────────────── */}
      {displayed.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'var(--bg)',
          border: '0.5px solid var(--border)',
          borderRadius: 12,
        }}>
          {filter === 'pending' ? (
            <>
              <ChefHat size={36} style={{ color: 'var(--brand)', marginBottom: 10 }}/>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Aucune commande en cours
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Les nouvelles commandes apparaîtront ici automatiquement.
              </div>
            </>
          ) : (
            <>
              <Package size={36} style={{ color: 'var(--brand)', marginBottom: 10 }}/>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Aucune commande prête
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Les commandes marquées prêtes s'afficheront ici.
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayed.map(cmd => (
            <CommandeCard
              key={cmd.id}
              commande={cmd}
              now={now}
              acting={actingId === cmd.id}
              onReady={() => handleReady(cmd)}
              onCancel={() => openCancel(cmd)}
              onCollect={() => setCollectModal(cmd)}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* ─── Légende des couleurs ────────────────────────────────── */}
      {filter === 'pending' && displayed.length > 0 && (
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'var(--bg2)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          display: 'flex', gap: 12, flexWrap: 'wrap',
          fontSize: 10, color: 'var(--muted)',
          justifyContent: 'center',
        }}>
          <LegendItem color="var(--green-dark)"  label="< 2 min"/>
          <LegendItem color="var(--gold-dark)"   label="2-5 min"/>
          <LegendItem color="var(--coral-dark)"  label="5-10 min 🔔"/>
          <LegendItem color="var(--red-dark)"    label="10-15 min 🚨"/>
          <LegendItem color="#A32D2D"            label="> 15 min ⚠️"/>
        </div>
      )}

      {/* ─── Modale d'annulation (Portal pour échapper au contexte) ── */}
      {cancelModal && createPortal(
        <CancelModal
          commande={cancelModal}
          motifIdx={motifIdx}
          setMotifIdx={setMotifIdx}
          motifTexte={motifTexte}
          setMotifTexte={setMotifTexte}
          loading={actingId === cancelModal.id}
          onCancel={() => setCancelModal(null)}
          onConfirm={handleCancel}
        />,
        document.body
      )}

      {/* Modale de confirmation de retrait — apparaît au clic sur "Valider le retrait"
          d'une commande/résa prête. Simple oui/non + récap visuel pour éviter les
          clics par erreur. La modale est rendue via portal pour qu'elle apparaisse
          au-dessus de tout le reste, même en cas de overflow parent. */}
      {collectModal && createPortal(
        <CollectModal
          commande={collectModal}
          loading={actingId === collectModal.id}
          onCancel={() => setCollectModal(null)}
          onConfirm={handleCollect}
          err={err}
        />,
        document.body
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════════════

function FilterTab({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, minWidth: 0,
        padding: '8px 10px',
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        border: 'none',
        borderRadius: 8,
        fontSize: 12, fontWeight: active ? 700 : 600,
        cursor: 'pointer', fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
        transition: 'background .15s, color .15s',
      }}>
      {label}
    </button>
  )
}

function LegendItem({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-block',
        width: 10, height: 10,
        background: color, borderRadius: 2,
      }}/>
      {label}
    </span>
  )
}

function CommandeCard({ commande, now, acting, onReady, onCancel, onCollect, isMobile }) {
  const ts = getTs(commande) || now
  const secs = Math.max(0, Math.floor((now - ts) / 1000))
  // Une commande est "en préparation" (= pas encore prête) si son status est :
  //   - 'pending' (commandes classiques + résas legacy)
  //   - 'processing' (résas auto-prises-en-charge, dont celles de la borne)
  // Bug fix : sans cette extension, les résas borne s'affichaient comme prêtes
  // (statut 'processing' ≠ 'pending' donc isPending était false par erreur).
  const isPending = commande.status === 'pending' || commande.status === 'processing'
  // Pour les commandes prêtes, on calcule le temps depuis qu'elles sont prêtes
  const readyTs = (() => {
    if (!commande.readyAt) return null
    const t = commande.readyAt
    if (t.toDate) return t.toDate().getTime()
    if (t.seconds) return t.seconds * 1000
    if (typeof t === 'string') return new Date(t).getTime()
    return null
  })()
  const secsReady = readyTs ? Math.max(0, Math.floor((now - readyTs) / 1000)) : 0

  const color = colorForDuration(secs)
  const heureCommande = commande.heure || (ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—')

  return (
    <div style={{
      // Niveau 3 (panique) : fond rouge intense
      background: (isPending && color.panic) ? color.bg : 'var(--bg)',
      color: (isPending && color.panic) ? '#fff' : 'inherit',
      borderRadius: 12,
      borderTop: '0.5px solid var(--border)',
      borderRight: '0.5px solid var(--border)',
      borderBottom: '0.5px solid var(--border)',
      // Bordure latérale élargie en niveau 3 pour bien attirer l'œil
      borderLeft: isPending
        ? `${color.panic ? 7 : 5}px solid ${color.panic ? '#fff' : color.c}`
        : '5px solid var(--brand)',
      padding: '12px 14px',
      // Animation d'urgence :
      //  - niveau 2 (rouge 10-15 min) : pulse lent
      //  - niveau 3 (panique > 15 min) : pulse rapide + ombre
      animation: isPending
        ? (color.panic
            ? 'ycPulseUrgentFast 0.8s ease-in-out infinite'
            : (color.blink ? 'ycPulseUrgent 2s ease-in-out infinite' : 'none'))
        : 'none',
      boxShadow: (isPending && color.panic) ? '0 0 16px rgba(163, 45, 45, 0.5)' : 'none',
      transition: 'box-shadow .3s',
    }}>
      {/* Badge "URGENT" visible si niveau 3 (panique) */}
      {isPending && color.panic && (
        <div style={{
          display: 'inline-block',
          padding: '2px 8px',
          background: '#fff', color: '#A32D2D',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
          borderRadius: 4, marginBottom: 8,
          animation: 'ycPulseUrgentFast 0.8s ease-in-out infinite',
        }}>
          🚨 URGENT — RETARD CRITIQUE
        </div>
      )}      {/* Ligne du haut : numéro + badge type + nom + durée */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 24,
            fontWeight: 800,
            color: (isPending && color.panic) ? '#fff' : (isPending ? color.c : 'var(--brand)'),
            lineHeight: 1,
          }}>
            {/* Affichage du numéro :
                1. _displayNumero (calculé : numero séquentiel réel OU fallback chronologique)
                2. fallback ultime : "#—"
                Le préfixe (FY- ou BNV-) du code n'est plus utilisé pour l'affichage
                principal — il reste visible en sous-titre via commande.code. */}
            {commande._displayNumero
              ? `#${commande._displayNumero}`
              : commande.numero
                ? `#${commande.numero}`
                : commande.code
                  ? '#' + commande.code.replace(/^(FY-|BNV-)/, '')
                  : '#—'}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 1 }}>
              {/* Badge type : CMD, RÉSA spectateur ou RÉSA bénévole.
                  Pour les résas, on distingue visuellement bénévole (orange) de
                  spectateur (violet) pour faciliter le tri en cuisine. */}
              {commande._kind === 'resa' ? (
                (commande.isBenev || commande.benevoleId) ? (
                  <span style={{
                    padding: '1px 6px',
                    background: (isPending && color.panic) ? 'rgba(255,255,255,0.2)' : '#FFF1E5',
                    color: (isPending && color.panic) ? '#fff' : '#9E4A18',
                    fontSize: 9, fontWeight: 700,
                    borderRadius: 3, letterSpacing: '0.04em',
                  }}>BENV</span>
                ) : (
                  <span style={{
                    padding: '1px 6px',
                    background: (isPending && color.panic) ? 'rgba(255,255,255,0.2)' : '#EEEDFE',
                    color: (isPending && color.panic) ? '#fff' : '#3C3489',
                    fontSize: 9, fontWeight: 700,
                    borderRadius: 3, letterSpacing: '0.04em',
                  }}>RÉSA</span>
                )
              ) : commande.source === 'borne' ? (
                // Badge BORNE — commande passée par le client lui-même via la
                // tablette self-service. Vert d'eau pour distinguer visuellement
                // de la commande staff classique (qui reste en couleur brand).
                <span style={{
                  padding: '1px 6px',
                  background: (isPending && color.panic) ? 'rgba(255,255,255,0.2)' : '#D5F0EA',
                  color: (isPending && color.panic) ? '#fff' : '#0F6E56',
                  fontSize: 9, fontWeight: 700,
                  borderRadius: 3, letterSpacing: '0.04em',
                }}>BORNE</span>
              ) : (
                <span style={{
                  padding: '1px 6px',
                  background: (isPending && color.panic) ? 'rgba(255,255,255,0.2)' : 'var(--brand-light)',
                  color: (isPending && color.panic) ? '#fff' : 'var(--brand-dark)',
                  fontSize: 9, fontWeight: 700,
                  borderRadius: 3, letterSpacing: '0.04em',
                }}>CMD</span>
              )}
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: (isPending && color.panic) ? '#fff' : 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              }}>
                {commande.specNom || '—'}
              </span>
              {/* Code court pour résas (R-XXXX) ou commandes borne (BRN-XXXX-NNN).
                  Toujours affiché si le doc a un champ `code`, quel que soit _kind. */}
              {commande.code && (
                <span style={{
                  fontSize: 10,
                  color: (isPending && color.panic) ? 'rgba(255,255,255,0.7)' : 'var(--muted)',
                }}>
                  {commande.code}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, fontWeight: 700,
          color: (isPending && color.panic) ? '#fff' : (isPending ? color.c : 'var(--green-dark)'),
          flexShrink: 0,
        }}>
          <Clock size={13}/>
          {isPending ? fmtDuree(secs) : `Prête ${fmtDuree(secsReady)}`}
        </div>
      </div>

      {/* Sous-info : ID + heure + état paiement */}
      <div style={{
        fontSize: 11,
        color: (isPending && color.panic) ? 'rgba(255,255,255,0.85)' : 'var(--muted)',
        marginBottom: 8,
      }}>
        {commande.specId} · {heureCommande}
        {/* Les résas sont toujours payées à la création (débit immédiat).
            Les commandes peuvent être 'paid' true ou false selon le mode choisi. */}
        {commande._kind === 'resa'
          ? <span style={{
              marginLeft: 8,
              color: (isPending && color.panic) ? '#fff' : 'var(--green-dark)',
              fontWeight: 600,
            }}>· Payée à la résa</span>
          : commande.paid
          ? <span style={{
              marginLeft: 8,
              color: (isPending && color.panic) ? '#fff' : 'var(--green-dark)',
              fontWeight: 600,
            }}>· Payée</span>
          : <span style={{
              marginLeft: 8,
              color: (isPending && color.panic) ? '#fff' : 'var(--gold-dark)',
              fontWeight: 600,
            }}>· Non payée</span>
        }
      </div>

      {/* Articles */}
      <div style={{
        fontSize: 13, color: 'var(--text)',
        lineHeight: 1.6,
        padding: '8px 10px',
        background: 'var(--bg2)',
        borderRadius: 6,
        marginBottom: 10,
      }}>
        {(commande.items || []).map((it, idx) => {
          // Commandes stockent prixUnit (centimes), réservations stockent prix (centimes)
          const prixUnit = (it.prixUnit != null) ? it.prixUnit : (it.prix || 0)
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                <span style={{ fontWeight: 700 }}>{it.qty || 1}×</span> {it.nom}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
                {((prixUnit * (it.qty || 1)) / 100).toFixed(2)} €
              </span>
            </div>
          )
        })}
        <div style={{
          marginTop: 6, paddingTop: 6,
          borderTop: '0.5px solid var(--border)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: 12, fontWeight: 700,
        }}>
          <span>Total</span>
          <span>{((commande.total || 0) / 100).toFixed(2)} €</span>
        </div>
      </div>

      {/* Boutons d'action — différents selon le statut */}
      {isPending && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onReady}
            disabled={acting}
            style={{
              flex: 2,
              padding: '10px',
              background: acting ? 'var(--bg2)' : 'var(--brand)',
              color: acting ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 700,
              cursor: acting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 40,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <CheckCircle size={14}/> {acting ? '…' : 'Marquer prête'}
          </button>
          <button onClick={onCancel}
            disabled={acting}
            style={{
              flex: 1,
              padding: '10px',
              background: 'transparent',
              color: 'var(--red-dark)',
              border: '0.5px solid var(--red)',
              borderRadius: 8,
              fontSize: 11, fontWeight: 700,
              cursor: acting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              minHeight: 40,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <X size={14}/> Annuler
          </button>
        </div>
      )}

      {/* Boutons pour les commandes prêtes : retrait + annuler */}
      {!isPending && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCollect}
            disabled={acting}
            style={{
              flex: 2,
              padding: '10px',
              background: acting ? 'var(--bg2)' : 'var(--green-dark)',
              color: acting ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 700,
              cursor: acting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 40,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <Package size={14}/> {acting ? '…' : 'Valider le retrait'}
          </button>
          <button onClick={onCancel}
            disabled={acting}
            style={{
              flex: 1,
              padding: '10px',
              background: 'transparent',
              color: 'var(--red-dark)',
              border: '0.5px solid var(--red)',
              borderRadius: 8,
              fontSize: 11, fontWeight: 700,
              cursor: acting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              minHeight: 40,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <X size={14}/> Annuler
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Modale de confirmation du retrait ──────────────────────────────────
// Apparaît quand le staff clique "Valider le retrait" sur une commande prête.
// Volontairement simple : pas de motif, pas de saisie. Juste un récap visuel
// + un bouton "Confirmer le retrait" en vert + Annuler. Évite le clic erroné.
function CollectModal({ commande, loading, onCancel, onConfirm, err }) {
  const displayNum = commande._displayNumero || commande.numero || (commande.code || '—')
  // Pour les résas, le retrait débitera le solde — on prévient explicitement
  // (les commandes sont déjà payées à la création donc pas d'avertissement)
  const willDebit = commande._kind === 'resa'
  const totalEur = ((commande.total || 0) / 100).toFixed(2)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--bg)', borderRadius: 14,
        maxWidth: 420, width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        {/* En-tête */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
            Validation du retrait
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
            {commande._kind === 'resa' ? 'Réservation' : 'Commande'} #{displayNum}
            {commande.code && (
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8, fontWeight: 500 }}>
                ({commande.code})
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {commande.specNom || '—'} · {totalEur} €
          </div>
        </div>

        {/* Corps */}
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 10, lineHeight: 1.5 }}>
            Confirmer la remise de cette commande au client ?
          </div>

          {willDebit && (
            <div style={{
              background: 'var(--blue-light)', color: 'var(--blue-dark)',
              padding: '10px 12px', borderRadius: 8,
              fontSize: 12, lineHeight: 1.4, marginBottom: 10,
            }}>
              <strong>{totalEur} €</strong> seront débités du solde du spectateur lors de la confirmation.
            </div>
          )}

          {err && (
            <div style={{
              padding: '10px 12px',
              background: '#FCEBEB', color: '#791F1F',
              border: '0.5px solid #F09595', borderRadius: 6,
              fontSize: 12, marginBottom: 10,
            }}>
              {err}
            </div>
          )}
        </div>

        {/* Boutons */}
        <div style={{
          padding: '12px 18px',
          background: 'var(--bg2)',
          display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8,
          borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onCancel} disabled={loading}
            style={{
              padding: '12px',
              background: 'transparent', color: 'var(--text)',
              border: '0.5px solid var(--border)', borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.5 : 1,
            }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{
              padding: '12px',
              background: loading ? 'var(--bg)' : 'var(--green-dark)',
              color: loading ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Package size={14}/>
            {loading ? 'Validation…' : 'Confirmer le retrait'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CancelModal({ commande, motifIdx, setMotifIdx, motifTexte, setMotifTexte, loading, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'ycFadeIn .18s ease-out',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          borderRadius: 16,
          width: '100%', maxWidth: 420,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
          animation: 'ycScaleIn .22s cubic-bezier(.2,.8,.2,1)',
        }}>
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
            {commande._kind === 'resa' ? 'Annulation de réservation' : 'Annulation de commande'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
            {commande._kind === 'resa' ? 'Réservation' : 'Commande'} {(commande._displayNumero || commande.numero) ? `#${commande._displayNumero || commande.numero}` : (commande.code || '—')}
            {commande._kind === 'resa' && commande.code && (commande._displayNumero || commande.numero) && (
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8, fontWeight: 500 }}>
                ({commande.code})
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {commande.specNom} · {((commande.total || 0) / 100).toFixed(2)} €
          </div>
        </div>

        {/* Corps */}
        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          {/* Bandeau info débit/remboursement
              - Commandes : selon le flag paid
              - Résas : toujours payées à la création, donc toujours remboursées */}
          {(() => {
            const wasPaid = (commande._kind === 'resa') ? true : !!commande.paid
            const label = (commande._kind === 'resa')
              ? <>Cette réservation a été <strong>débitée à la création</strong>. Le montant sera <strong>remboursé</strong> au client.</>
              : (wasPaid
                  ? <>Cette commande a été <strong>déjà débitée</strong>. Le montant sera <strong>remboursé</strong> au client.</>
                  : <>Cette commande <strong>n'a pas été débitée</strong>. Aucun mouvement de solde nécessaire.</>
                )
            return (
              <div style={{
                background: wasPaid ? 'var(--gold-light)' : 'var(--bg2)',
                border: '0.5px solid ' + (wasPaid ? 'var(--gold)' : 'var(--border)'),
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: 12,
                color: wasPaid ? 'var(--gold-dark)' : 'var(--text)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span style={{ fontSize: 14 }}>{wasPaid ? '💰' : 'ℹ️'}</span>
                <span>{label}</span>
              </div>
            )
          })()}

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Motif de l'annulation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {MOTIFS.map((m, i) => (
              <button key={i} onClick={() => setMotifIdx(i)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: motifIdx === i ? 'var(--brand-light)' : 'var(--bg)',
                  border: '1px solid ' + (motifIdx === i ? 'var(--brand)' : 'var(--border)'),
                  borderRadius: 8,
                  fontSize: 13, fontWeight: motifIdx === i ? 700 : 500,
                  color: motifIdx === i ? 'var(--brand-dark)' : 'var(--text)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {m}
              </button>
            ))}
          </div>

          {motifIdx === 2 && (
            <input type="text"
              autoFocus
              value={motifTexte}
              onChange={e => setMotifTexte(e.target.value)}
              placeholder="Précisez le motif (optionnel)…"
              style={{
                marginTop: 8,
                width: '100%', padding: '9px 12px',
                fontSize: 13, fontFamily: 'inherit',
                background: 'var(--bg)', color: 'var(--text)',
                border: '0.5px solid var(--border)', borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}/>
          )}
        </div>

        {/* Footer : actions */}
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8,
        }}>
          <button onClick={onCancel}
            className="btn-secondary"
            style={{ flex: 1, minHeight: 44 }}>
            Retour
          </button>
          <button onClick={onConfirm}
            disabled={loading}
            className="btn-danger"
            style={{ flex: 1, minHeight: 44 }}>
            {loading ? '…' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SONS — Web Audio API
// ═══════════════════════════════════════════════════════════════════════
// 4 fonctions :
//   - playBip()     : bip discret pour notification nouvelle commande
//   - playBeep2()   : double bip = niveau 1 (5-10 min, orange)
//   - playSiren()   : sirène 3 notes = niveau 2 (10-15 min, rouge)
//   - playAlarm()   : alarme stridente = niveau 3 (>15 min, panique)
// Toutes utilisent un AudioContext partagé (initialisé après 1ère interaction).
let _audioCtx = null
function _getCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume()
  return _audioCtx
}

// Joue une note via oscillateur, durée d, gain g, freq f, type t
function _playNote(ctx, freq, duration, gain = 0.15, type = 'sine', startOffset = 0) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.value = gain
  osc.connect(g)
  g.connect(ctx.destination)
  const t0 = ctx.currentTime + startOffset
  osc.start(t0)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.stop(t0 + duration + 0.02)
}

// Bip discret — nouvelle commande
function playBip() {
  try {
    const ctx = _getCtx()
    _playNote(ctx, 880, 0.18, 0.10, 'sine', 0)
  } catch {}
}

// Niveau 1 — Double bip insistant (orange, 5-10 min)
function playBeep2() {
  try {
    const ctx = _getCtx()
    _playNote(ctx, 1000, 0.12, 0.20, 'square', 0)
    _playNote(ctx, 1400, 0.12, 0.20, 'square', 0.15)
  } catch {}
}

// Niveau 2 — Sirène 3 notes (rouge, 10-15 min)
function playSiren() {
  try {
    const ctx = _getCtx()
    _playNote(ctx, 1200, 0.20, 0.25, 'square', 0.00)
    _playNote(ctx, 1600, 0.20, 0.25, 'square', 0.22)
    _playNote(ctx, 1200, 0.20, 0.25, 'square', 0.44)
  } catch {}
}

// Niveau 3 — Alarme stridente (>15 min, panique)
// Combinaison de 2 oscillateurs en sawtooth + montée de fréquence pour effet "alerte"
function playAlarm() {
  try {
    const ctx = _getCtx()
    // 4 notes alternées hautes/basses rapidement répétées
    for (let i = 0; i < 4; i++) {
      _playNote(ctx, 1800, 0.10, 0.30, 'sawtooth', i * 0.13)
      _playNote(ctx, 1400, 0.10, 0.30, 'sawtooth', i * 0.13 + 0.06)
    }
  } catch {}
}
