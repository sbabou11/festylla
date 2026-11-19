/**
 * pages/admin/Accueil.jsx — v2 page d'accueil unique (remplace aussi le tableau de bord)
 *
 * Salutation + événement, puis des blocs que chacun peut masquer et réordonner
 * (« Personnaliser », préférences dans users/{uid}/dashboard/main → champ `home`) :
 *   indicateurs du jour, actions rapides, flux de caisse, objectif du jour (avec
 *   célébration), alertes, réservations (kanban), dernières transactions, top
 *   articles, cachets, planning, stocks, dépenses, spectateurs, bénévoles, raccourcis.
 * Chaque bloc n'apparaît que si le rôle a accès à la page correspondante
 * (canAccessPage, compatible rôles personnalisés). Billetterie et stand voient
 * leurs propres chiffres ; admin et consultation les chiffres de tout l'événement.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  PlusCircle, ShoppingCart, Package, Bookmark, QrCode, Users, Wallet, Target, Receipt,
  Calculator, UtensilsCrossed, Settings as SettingsIcon, BarChart3, ChevronRight, ChevronUp, ChevronDown,
  Music2, ClipboardList, ChefHat, Banknote, SlidersHorizontal, RotateCcw, LayoutGrid, Zap, Activity,
  AlertTriangle, List, TrendingUp, Mic, CalendarDays, HandHeart, UserPlus, Eye, Briefcase, ShoppingBag,
} from 'lucide-react'
import clsx from 'clsx'
import useAppStore   from '../../store/useAppStore'
import useAuthStore  from '../../store/useAuthStore'
import useEventStore from '../../store/useEventStore'
import { pageRetiree } from '../../em/pages'
import useActionUsage from '../../hooks/useActionUsage'
import useHomeLayout from '../../hooks/useHomeLayout'
import { fmt } from '../../utils/helpers'
import { computeKPIs } from '../../utils/kpis'
import { getTs } from '../../utils/dailyKpis'
import { dayStats, hourlyFlow, topSellers, dashboardAlerts, txTime, dayStart } from '../../utils/dashboardData'
import { stockForecast } from '../../utils/analyticsData'
import { Stat, Card, Tabs, Button, Empty, Dialog, Sheet, Field, AnimatedNumber, toast } from '../../ui'
import FlowChart  from './dashboard/FlowChart'
import GoalRing, { useGoalParty } from './dashboard/GoalRing'
import ResaKanban from './dashboard/ResaKanban'
import {
  TopArticlesBlock, StocksBlock, DepensesBlock, CachetsBlock, PlanningBlock, SpectateursBlock, BenevolesBlock,
} from './accueil/Blocks'
import d from './dashboard/Dashboard.module.css'
import s from './accueil/Accueil.module.css'

// ═══════════════════════════════════════════════════════════════════════
// Catalogue des blocs (ordre par défaut) et des actions
// ═══════════════════════════════════════════════════════════════════════

const BLOCKS = [
  { id: 'kpis',         label: 'Indicateurs du jour',   desc: 'Recettes, soldes, panier, réservations', icon: Activity,      tone: 'coral',   span: 'full' },
  { id: 'actions',      label: 'Actions rapides',       desc: 'Créditer, encaisser, commandes…',        icon: Zap,           tone: 'brand',   span: 'full' },
  { id: 'flow',         label: 'Flux de caisse',        desc: 'Recharges et dépenses par heure',        icon: BarChart3,     tone: 'success', span: 'wide' },
  { id: 'goal',         label: 'Objectif du jour',      desc: 'Anneau de progression et projection',    icon: Target,        tone: 'coral',   span: 'side' },
  { id: 'resas',        label: 'Réservations en cours', desc: 'Kanban : attente, préparation, prêtes',  icon: Bookmark,      tone: 'gold',    span: 'wide' },
  { id: 'alertes',      label: 'Alertes',               desc: 'Soldes négatifs, écarts, stocks',        icon: AlertTriangle, tone: 'gold',    span: 'side' },
  { id: 'transactions', label: 'Dernières transactions', desc: 'Les 7 plus récentes',                   icon: List,          tone: 'brand',   span: 'half' },
  { id: 'top-articles', label: 'Top articles du jour',  desc: 'Meilleures ventes depuis minuit',        icon: TrendingUp,    tone: 'coral',   span: 'half' },
  { id: 'cachets',      label: 'Cachets',               desc: 'À payer et payés',                       icon: Mic,           tone: 'gold',    span: 'third' },
  { id: 'planning',     label: 'Prochains créneaux',    desc: 'Planning artistes à venir',              icon: CalendarDays,  tone: 'brand',   span: 'third' },
  { id: 'stocks',       label: 'Stocks',                desc: 'Ruptures et stocks bas',                 icon: Package,       tone: 'gold',    span: 'third' },
  { id: 'depenses',     label: 'Dépenses',              desc: 'Dernières dépenses saisies',             icon: Wallet,        tone: 'coral',   span: 'half' },
  { id: 'spectateurs',  label: 'Spectateurs',           desc: 'Inscrits et comptes avec solde',         icon: Users,         tone: 'brand',   span: 'quarter' },
  { id: 'benevoles',    label: 'Bénévoles',             desc: 'Inscrits et actifs aujourd\'hui',        icon: HandHeart,     tone: 'success', span: 'quarter' },
  { id: 'raccourcis',   label: 'Raccourcis',            desc: 'Espaces et outils',                      icon: LayoutGrid,    tone: 'purple',  span: 'full' },
]
const BLOCK = Object.fromEntries(BLOCKS.map(b => [b.id, b]))
const DEFAULTS = { order: BLOCKS.map(b => b.id), hidden: ['stocks', 'depenses', 'benevoles'] }

// Ordre = ordre par défaut des actions admin (avant tout historique d'usage)
const ACTIONS = [
  { key: 'credit',           icon: PlusCircle,    tone: 'success', label: 'Créditer un compte',  desc: 'Recharger un spectateur' },
  { key: 'debit',            icon: ShoppingCart,  tone: 'coral',   label: 'Encaisser',           desc: 'Vente au stand' },
  { key: 'commande-sur-place', icon: ShoppingBag, tone: 'coral',   label: 'Commande sur place',  desc: 'Client sans compte, code pour la borne' },
  { key: 'prendre-commande', icon: ClipboardList, tone: 'brand',   label: 'Prendre commande',    desc: 'Avec numéro et suivi cuisine' },
  { key: 'retrait-commande', icon: Package,       tone: 'gold',    label: 'Retrait commande',    desc: 'Remettre au client' },
  { key: 'cuisine',          icon: ChefHat,       tone: 'success', label: 'Cuisine',             desc: 'Suivi temps réel' },
  { key: 'retrait',          icon: Package,       tone: 'gold',    label: 'Retrait réservation', desc: 'Remettre une commande' },
  { key: 'remboursement',    icon: Banknote,      tone: 'gold',    label: 'Remboursement',       desc: 'Ticket, code ou solde' },
  { key: 'nouveau',          icon: QrCode,        tone: 'gold',    label: 'Nouveau QR code',     desc: 'Inscrire un spectateur' },
]
const ACTION_KEYS = ACTIONS.map(a => a.key)

const TX_STYLE = {
  credit:             { tone: 'success', sign: '+' },
  debit:              { tone: 'coral',   sign: '−' },
  retrait:            { tone: 'brand',   sign: '−' },
  'benev-retrait':    { tone: 'brand',   sign: ''  },
  reservation:        { tone: 'warning', sign: ''  },
  'benev-reservation':{ tone: 'warning', sign: ''  },
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`
const startOfToday = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x.getTime() }
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Rafraîchit « maintenant » chaque minute (ligne de l'heure, comparaisons)
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

// Anomalies légères de l'ancien widget Alertes : comptes très actifs, gros débits
function watchList(logs) {
  const perSpec = {}
  let big = 0
  ;(logs || []).forEach(t => {
    if (t.specId) perSpec[t.specId] = (perSpec[t.specId] || 0) + 1
    if (t.type === 'debit' && (t.montant || 0) > 5000) big++
  })
  return { busy: Object.values(perSpec).filter(c => c >= 5).length, big }
}

/**
 * Réordonnancement animé (FLIP) : capture() juste avant de changer l'ordre,
 * puis chaque enfant [data-flip] glisse de son ancienne place vers la nouvelle.
 * Utilise la propriété `translate` pour ne pas entrer en conflit avec l'animation
 * d'entrée (yc-stagger, qui anime `transform`).
 */
function useFlip(key) {
  const ref = useRef(null)
  const before = useRef(null)
  const capture = useCallback(() => {
    const el = ref.current
    if (!el || reducedMotion()) return
    before.current = new Map([...el.children].map(c => [c.dataset.flip, c.getBoundingClientRect()]))
  }, [])
  useLayoutEffect(() => {
    const prev = before.current
    before.current = null
    const el = ref.current
    if (!prev || !el) return
    ;[...el.children].forEach(c => {
      const b = prev.get(c.dataset.flip)
      if (!b) return
      const a = c.getBoundingClientRect()
      const dx = b.left - a.left, dy = b.top - a.top
      if (!dx && !dy) return
      c.style.transition = 'none'
      c.style.translate = `${dx}px ${dy}px`
      void c.offsetWidth // applique la position de départ avant la transition
      c.style.transition = 'translate 320ms var(--ease)'
      c.style.translate = ''
      c.addEventListener('transitionend', () => { c.style.transition = '' }, { once: true })
    })
  }, [key])
  return { ref, capture }
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function Accueil({ onNavigate, view }) {
  const { spectateurs = [], reservations = [], logs, menu = [], staff, theme = {} } = useAppStore()
  const { user, canAccessPage } = useAuthStore()
  const { events, currentEventId, updateEvent } = useEventStore()
  const now = useNow()

  const role = user?.role || view
  const isAdmin = role === 'admin' || role === 'super_admin'
  // Lot D : pages passées dans Event Manager (planning, cachets, finances) masquées si l'événement y est relié
  const emEvent = events.find(e => e.id === currentEventId)
  const can = useCallback((page) => !pageRetiree(emEvent, page) && (isAdmin || !!canAccessPage?.(page)), [isAdmin, canAccessPage, emEvent])
  // Vue « événement » (tous les chiffres) pour l'admin et les rôles qui ont l'analytics (consultation)
  const globalView = isAdmin || can('analytics')
  const canCredit = can('credit')
  const canSell   = can('debit') || can('retrait')

  const go = useCallback((page) => onNavigate?.(page, 'accueil'), [onNavigate])

  const allTx = logs || []
  const event = events.find(e => e.id === currentEventId && !e.deleted)
  const goal  = event?.objectifJour || 0

  // Transactions de la personne connectée (rôles terrain)
  const me = [(user?.nom || '').trim().toLowerCase(), (user?.email || '').trim().toLowerCase()].filter(Boolean)
  const myLogs = useMemo(() => globalView ? allTx : allTx.filter(t => {
    const st = (t.staff || '').trim().toLowerCase()
    return st && me.includes(st)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [allTx, globalView, me.join('|')])

  // ─── Données du tableau de bord (vue événement) ─────────────────────
  const kpis   = useMemo(() => computeKPIs({ spectateurs, reservations, logs: allTx, menu }), [spectateurs, reservations, allTx, menu])
  const day    = useMemo(() => dayStats(allTx, now), [allTx, now])
  const [period, setPeriod] = useState('today')
  const flow   = useMemo(() => hourlyFlow(allTx, now, period === 'today' ? 0 : 1), [allTx, now, period])
  const best   = useMemo(() => topSellers(allTx, now)[0], [allTx, now])
  const alerts = useMemo(() => {
    const list = dashboardAlerts({ spectateurs, logs: allTx, menu })
    // Rupture prévue avant la fermeture au rythme actuel : remplace l'alerte « stock bas » de l'article
    const soon = stockForecast(allTx, menu).filter(f => f.status === 'avant-fermeture')
    const ids = new Set(soon.map(f => `stock-${f.id || f.nom}`))
    const forecast = soon.map(f => ({
      id: `prev-${f.id || f.nom}`, tone: 'warning', page: 'analytics', stock: f.stock,
      title: `${f.nom} · rupture vers ${new Date(f.ruptureAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    }))
    const rest = list.filter(a => !ids.has(a.id))
    return [...rest.filter(a => a.tone === 'danger'), ...forecast, ...rest.filter(a => a.tone !== 'danger')]
  }, [spectateurs, allTx, menu])
  const watch = useMemo(() => watchList(allTx), [allTx])
  const party = useGoalParty(globalView && goal > 0 && day.revenue >= goal, currentEventId ? `${currentEventId}-${dayStart(now)}` : null)

  // ─── Chiffres personnels du jour (depuis minuit, comme l'ancien accueil) ─
  const mine = useMemo(() => {
    const start = startOfToday()
    const today = myLogs.filter(t => getTs(t) >= start)
    const sum = (l) => l.reduce((a, t) => a + (t.montant || 0), 0)
    const credits = today.filter(t => t.type === 'credit')
    const ventes  = today.filter(t => ['debit', 'retrait'].includes(t.type))
    return {
      credits: sum(credits), creditsCount: credits.length,
      ventes: sum(ventes), ventesCount: ventes.length,
      txCount: today.length,
      nouveaux: spectateurs.filter(sp => getTs(sp) >= start).length,
      resasPretes: reservations.filter(r => r.status === 'ready').length,
      resasAttente: reservations.filter(r => r.status === 'pending' || r.status === 'processing').length,
    }
  }, [myLogs, spectateurs, reservations])

  // ─── Actions rapides ────────────────────────────────────────────────
  const actionUsage = useActionUsage()
  const actions = useMemo(() => {
    const allowed = ACTIONS.filter(a => can(a.key))
    if (!isAdmin) return allowed
    // Admin : les 4 plus utilisées (compteurs locaux), ordre par défaut sinon
    const keys = allowed.map(a => a.key)
    return actionUsage.topActions(keys, 4, ACTION_KEYS).map(k => allowed.find(a => a.key === k)).filter(Boolean)
  }, [can, isAdmin, actionUsage])

  // ─── Raccourcis (espaces et outils) ─────────────────────────────────
  const wallets = spectateurs.filter(sp => (sp.solde || 0) > 0).length
  const shortcuts = useMemo(() => {
    const txStats = globalView
      ? [{ label: 'au total', value: allTx.length }, { label: "aujourd'hui", value: mine.txCount }]
      : [{ label: 'à vous', value: myLogs.length }, { label: "aujourd'hui", value: mine.txCount }]
    const specStats = [{ label: 'inscrits', value: spectateurs.length }, { label: 'avec solde', value: wallets }, { label: 'en solde', value: fmt(kpis.totalSoldes) }]
    const resaStats = [{ label: 'au total', value: reservations.length }, { label: 'en attente', value: mine.resasAttente, warn: mine.resasAttente > 0 }, { label: 'prêtes', value: mine.resasPretes }]
    const ALL = {
      operations:          { icon: Receipt,         tone: 'brand',   title: 'Opérations',          desc: 'Caisse, transactions, alertes',
        stats: [{ label: 'recettes du jour', value: fmt(day.revenue) }, { label: 'résas en attente', value: kpis.resaPending, warn: kpis.resaPending > 0 }, { label: 'alertes', value: alerts.length, alert: alerts.some(a => a.tone === 'danger') }] },
      'equipe-hub':        { icon: Briefcase,       tone: 'purple',  title: 'Équipe & Bénévoles',  desc: 'Comptes staff et bénévoles', stats: [{ label: 'staff', value: (staff || []).length }] },
      'spectateurs-hub':   { icon: QrCode,          tone: 'success', title: 'Spectateurs & Accès', desc: 'Comptes et QR codes', stats: specStats },
      'gestion-artistes':  { icon: Music2,          tone: 'gold',    title: 'Gestion artistes',    desc: 'Planning et cachets' },
      'reservations-admin':{ icon: Bookmark,        tone: 'purple',  title: 'Réservations',        desc: globalView ? "Vue d'ensemble" : 'Voir et préparer', stats: resaStats },
      transactions:        { icon: List,            tone: 'brand',   title: 'Transactions',        desc: globalView ? 'Historique complet' : 'Vos opérations', stats: txStats },
      spectateurs:         { icon: Users,           tone: 'success', title: 'Liste des spectateurs', desc: 'Consulter les comptes', stats: specStats },
      analytics:           { icon: BarChart3,       tone: 'brand',   title: 'Analytics',           desc: 'Statistiques avancées' },
      comptabilite:        { icon: Calculator,      tone: 'gold',    title: 'Comptabilité',        desc: 'Trésorerie et résultat',
        stats: [{ label: 'tx du jour', value: mine.txCount }, { label: 'recettes', value: fmt(day.revenue) }] },
      planning:            { icon: CalendarDays,    tone: 'brand',   title: 'Planning artistes',   desc: 'Créneaux et balances' },
      cachets:             { icon: Mic,             tone: 'gold',    title: 'Cachets & Décharges', desc: 'Suivi et paiements' },
      menu:                { icon: UtensilsCrossed, tone: 'coral',   title: 'Carte & menu',        desc: 'Articles, prix, stocks' },
      settings:            { icon: SettingsIcon,    tone: 'brand',   title: 'Paramètres',          desc: "Réglages de l'événement" },
    }
    const ids = isAdmin
      ? ['operations', 'equipe-hub', 'spectateurs-hub', 'gestion-artistes', 'analytics', 'comptabilite', 'menu', 'settings']
      : ['reservations-admin', 'transactions', 'spectateurs', 'analytics', 'comptabilite', 'gestion-artistes', 'planning', 'cachets']
    return ids.filter(can).map(id => ({ id, ...ALL[id] }))
  }, [isAdmin, globalView, can, allTx.length, myLogs.length, mine, spectateurs.length, wallets, kpis, reservations.length, staff, day.revenue, alerts])

  // ─── Blocs autorisés pour ce rôle ───────────────────────────────────
  const allowed = useMemo(() => ({
    kpis:           globalView || canCredit || canSell,
    actions:        actions.length > 0,
    flow:           globalView,
    goal:           globalView,
    resas:          can('reservations-admin'),
    alertes:        can('alertes'),
    transactions:   can('transactions'),
    'top-articles': globalView,
    cachets:        can('cachets'),
    planning:       can('planning'),
    stocks:         globalView || can('menu'),
    depenses:       can('finances'),
    spectateurs:    globalView || can('spectateurs'),
    benevoles:      can('benevoles'),
    raccourcis:     shortcuts.length > 0,
  }), [globalView, canCredit, canSell, actions.length, can, shortcuts.length])

  // ─── Personnaliser : brouillon appliqué en direct, enregistré à la fin ─
  const home = useHomeLayout(DEFAULTS)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const prefs = draft || home.prefs
  const shown = prefs.order.filter(id => allowed[id] && !prefs.hidden.includes(id))
  const editable = prefs.order.filter(id => allowed[id])
  const page  = useFlip(shown.join(','))
  const sheet = useFlip(editable.join(','))

  const openEditor = () => setDraft({ order: [...home.prefs.order], hidden: [...home.prefs.hidden] })
  const closeEditor = () => { page.capture(); setDraft(null) }
  const move = (id, dir) => {
    const i = editable.indexOf(id)
    const other = editable[i + dir]
    if (!other) return
    page.capture(); sheet.capture()
    setDraft(p => {
      const order = [...p.order]
      const a = order.indexOf(id), b = order.indexOf(other)
      ;[order[a], order[b]] = [order[b], order[a]]
      return { ...p, order }
    })
  }
  const toggle = (id) => {
    page.capture()
    setDraft(p => ({ ...p, hidden: p.hidden.includes(id) ? p.hidden.filter(x => x !== id) : [...p.hidden, id] }))
  }
  const resetDraft = () => { page.capture(); sheet.capture(); setDraft({ order: [...DEFAULTS.order], hidden: [...DEFAULTS.hidden] }) }
  const saveDraft = async () => {
    setSaving(true)
    try {
      await home.save(draft)
      toast.success('Accueil enregistré')
      setDraft(null)
    } catch (e) {
      toast.error(`Préférences gardées sur cet appareil seulement : ${e?.message || 'erreur réseau'}`)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  // ─── Objectif du jour ───────────────────────────────────────────────
  const [goalOpen, setGoalOpen] = useState(false)
  const canEditGoal = isAdmin

  // ─── Salutation ─────────────────────────────────────────────────────
  const nom = (user?.nom || '').trim()
  const prenom = nom.split(' ')[0] || 'à vous'
  const initiales = nom.split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || '?'
  const greeting = (() => {
    const h = new Date(now).getHours()
    if (h < 6)  return 'Bonne soirée'
    if (h < 12) return 'Bonjour'
    if (h < 18) return 'Bon après-midi'
    return 'Bonsoir'
  })()

  // ─── Rendu de chaque bloc ───────────────────────────────────────────
  const vsYesterday = day.hasYesterday ? 'vs hier même heure' : null
  const recentSource = globalView ? allTx : myLogs
  const specMap = useMemo(() => Object.fromEntries(spectateurs.map(sp => [sp.id, sp.nom])), [spectateurs])
  const recentTx = useMemo(() => [...recentSource]
    .filter(t => t.type !== 'annulation' || (t.montant || 0) > 0)
    .sort((a, b) => (txTime(b) || 0) - (txTime(a) || 0))
    .slice(0, 7), [recentSource])

  const renderBlock = (id) => {
    switch (id) {
      case 'kpis': return globalView ? (
        <div className={d.stats}>
          <Stat
            label="Recettes du jour" value={<AnimatedNumber value={day.revenue} format={fmt} />} icon={ShoppingCart} tone="coral" trend={day.trend}
            delta={day.revenueDelta != null
              ? { value: `${signed(day.revenueDelta)} %`, direction: day.revenueDelta > 0 ? 'up' : day.revenueDelta < 0 ? 'down' : 'flat', label: vsYesterday }
              : undefined}
            sub={day.revenueDelta == null ? `${plural(day.salesCount, 'vente')} depuis 6h` : undefined}
          />
          <Stat
            label="Soldes en circulation" value={<AnimatedNumber value={kpis.totalSoldes} format={fmt} />} icon={Wallet} tone="success"
            sub={`${wallets} portefeuille${wallets > 1 ? 's' : ''} actif${wallets > 1 ? 's' : ''} · ${fmt(day.credits)} rechargés aujourd'hui`}
          />
          <Stat
            label="Panier moyen du jour" value={<AnimatedNumber value={Math.round(day.basket)} format={fmt} />} icon={Users} tone="brand"
            delta={day.basketDiff != null
              ? { value: `${day.basketDiff >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(day.basketDiff)))}`, direction: day.basketDiff > 0 ? 'up' : day.basketDiff < 0 ? 'down' : 'flat', label: vsYesterday }
              : undefined}
            sub={day.basketDiff == null ? plural(day.salesCount, 'encaissement') : undefined}
          />
          <Stat
            label="Réservations" value={<AnimatedNumber value={kpis.activeResas.length} />} icon={Bookmark} tone="warning"
            sub={kpis.resaReady > 0 ? `${kpis.resaReady} prête${kpis.resaReady > 1 ? 's' : ''} à retirer` : kpis.resaPending > 0 ? `${kpis.resaPending} en attente` : 'Aucune en cours'}
          />
        </div>
      ) : (
        <div className={s.statsAuto}>
          {canCredit && <Stat label="Vos crédits du jour" icon={PlusCircle} tone="success" value={<AnimatedNumber value={mine.credits} format={fmt} />} sub={plural(mine.creditsCount, 'recharge')} />}
          {canSell && <Stat label="Encaissé du jour" icon={ShoppingCart} tone="coral" value={<AnimatedNumber value={mine.ventes} format={fmt} />} sub={plural(mine.ventesCount, 'vente')} />}
          <Stat label="Vos transactions" icon={List} tone="brand" value={<AnimatedNumber value={mine.txCount} />} sub="Depuis minuit" />
          {canCredit && !canSell && <Stat label="Nouveaux inscrits" icon={UserPlus} tone="warning" value={<AnimatedNumber value={mine.nouveaux} />} sub={`${spectateurs.length} spectateurs au total`} />}
          {canSell && <Stat label="Résas à retirer" icon={Bookmark} tone="warning" value={<AnimatedNumber value={mine.resasPretes} />} sub={mine.resasAttente ? `${mine.resasAttente} en attente` : 'Aucune en attente'} />}
          {canSell && !canCredit && <Stat label="Panier moyen" icon={Users} tone="brand" value={mine.ventesCount ? <AnimatedNumber value={Math.round(mine.ventes / mine.ventesCount)} format={fmt} /> : '—'} sub="Sur vos ventes du jour" />}
        </div>
      )

      case 'actions': return (
        <section className={s.section} aria-labelledby="acc-actions">
          <h2 id="acc-actions" className={s.sectionTitle}>Actions rapides</h2>
          <div className={s.tiles}>
            {actions.map(a => (
              <Tile key={a.key} icon={a.icon} tone={a.tone} title={a.label} desc={a.desc}
                onClick={() => { if (isAdmin) actionUsage.recordUse(a.key); go(a.key) }} />
            ))}
          </div>
        </section>
      )

      case 'flow': return (
        <Card
          title="Flux de caisse par heure"
          subtitle={`${fmt(flow.total.credits)} rechargés · ${fmt(flow.total.sales)} dépensés`}
          actions={<Tabs size="sm" label="Journée" value={period} onChange={setPeriod}
            items={[{ value: 'today', label: "Aujourd'hui" }, { value: 'yesterday', label: 'Hier' }]} />}
        >
          <div className={d.legend}>
            <span><i className={d.keyIn} />Recharges</span>
            <span><i className={d.keyOut} />Dépenses</span>
            <span className={d.legendNote}>Journée de 6h à 6h</span>
          </div>
          <FlowChart flow={flow} />
        </Card>
      )

      case 'goal': return (
        <Card title="Objectif du jour"
          actions={canEditGoal && goal > 0 && <Button size="sm" variant="ghost" onClick={() => setGoalOpen(true)}>Modifier</Button>}>
          {goal > 0 ? (
            <>
              <div className={d.goal}>
                <GoalRing revenue={day.revenue} projected={day.projected} goal={goal} party={party} />
                <dl className={d.goalFacts}>
                  <div><dt>Encaissé</dt><dd>{fmt(day.revenue)} <span>sur {fmt(goal)}</span></dd></div>
                  <div><dt>Projeté à {day.closingLabel}</dt><dd className={d.proj}>≈ {fmt(day.projected)}</dd></div>
                  {best && <div><dt>Meilleure caisse</dt><dd>{best.staff} <span>· {fmt(best.total)}</span></dd></div>}
                </dl>
              </div>
              {party && <p className={d.goalWin} role="status">Objectif du jour atteint · {fmt(goal)}</p>}
            </>
          ) : (
            <Empty icon={Target} title="Aucun objectif fixé"
              action={canEditGoal && <Button size="sm" onClick={() => setGoalOpen(true)}>Fixer un objectif</Button>}>
              {`Projection à ${day.closingLabel} : ≈ ${fmt(day.projected)}`}
            </Empty>
          )}
        </Card>
      )

      case 'alertes': return (
        <Card title="Alertes" flush
          actions={<Button size="sm" variant="ghost" onClick={() => go('alertes')}>Tout voir</Button>}>
          {alerts.length === 0 ? (
            <p className={d.allGood}>Rien à signaler</p>
          ) : (
            <ul className={d.alerts}>
              {alerts.slice(0, 4).map(a => (
                <li key={a.id}>
                  <button type="button" className={d.alert} onClick={() => go(a.page)}>
                    <i className={clsx(d.stripe, d[a.tone])} />
                    <span className={d.alertText}>
                      <b>{a.title}</b>
                      {a.detail != null && <span> · {fmt(a.detail)}</span>}
                      {a.stock != null && a.stock > 0 && <span> · reste {a.stock}</span>}
                    </span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
              {alerts.length > 4 && <li className={d.alertMore}>+ {alerts.length - 4} autres</li>}
            </ul>
          )}
          {(watch.busy > 0 || watch.big > 0) && (
            <button type="button" className={s.watch} onClick={() => go('alertes')}>
              <Eye size={14} aria-hidden="true" />
              <span>
                À surveiller : {[
                  watch.busy > 0 && `${plural(watch.busy, 'compte')} à 5 opérations ou plus`,
                  watch.big > 0 && `${plural(watch.big, 'achat')} de plus de 50 €`,
                ].filter(Boolean).join(' · ')}
              </span>
            </button>
          )}
        </Card>
      )

      case 'resas': return (
        <Card title="Réservations en cours"
          subtitle={`${kpis.activeResas.filter(r => !r.isBenev).length} spectateurs · ${kpis.activeResas.filter(r => r.isBenev).length} bénévoles`}
          actions={<Button size="sm" variant="ghost" onClick={() => go('reservations-admin')}>Tout voir</Button>}>
          <ResaKanban reservations={kpis.activeResas} onSeeAll={() => go('reservations-admin')} />
        </Card>
      )

      case 'transactions': return (
        <Card title={globalView ? 'Dernières transactions' : 'Vos dernières transactions'} flush
          subtitle={`${recentSource.length} au total · ${mine.txCount} aujourd'hui`}
          actions={<Button size="sm" variant="ghost" onClick={() => go('transactions')}>Tout voir</Button>}>
          {recentTx.length === 0 ? (
            <Empty icon={Receipt} title="Aucune transaction">Les recharges et encaissements apparaîtront ici.</Empty>
          ) : (
            <ul className={d.txList}>
              {recentTx.map((t, i) => {
                const st = TX_STYLE[t.type] || { tone: 'danger', sign: '−' }
                return (
                  <li key={t.id || i} className={d.tx}>
                    <span className={clsx(d.txIcon, d[st.tone])}>{st.sign || '•'}</span>
                    <span className={d.txText}>
                      <b>{t.label}</b>
                      <span>{t.benevoleNom || specMap[t.specId] || t.specNom || '—'} · {t.heure || t.date}</span>
                    </span>
                    <span className={clsx(d.txAmount, d[`${st.tone}Text`])}>{st.sign}{fmt(t.montant || 0)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )

      case 'top-articles': return <TopArticlesBlock go={can('analytics') ? go : null} />
      case 'cachets':      return <CachetsBlock go={go} />
      case 'planning':     return <PlanningBlock go={go} />
      case 'stocks':       return <StocksBlock go={can('menu') ? go : null} />
      case 'depenses':     return <DepensesBlock go={go} />
      case 'spectateurs':  return <SpectateursBlock />
      case 'benevoles':    return <BenevolesBlock />

      case 'raccourcis': return (
        <section className={s.section} aria-labelledby="acc-shortcuts">
          <h2 id="acc-shortcuts" className={s.sectionTitle}>{isAdmin ? 'Espaces et outils' : 'Vos espaces'}</h2>
          <div className={s.tiles}>
            {shortcuts.map(t => (
              <Tile key={t.id} icon={t.icon} tone={t.tone} title={t.title} desc={t.desc} stats={t.stats} onClick={() => go(t.id)} />
            ))}
          </div>
        </section>
      )

      default: return null
    }
  }

  return (
    <div className={d.page}>
      {theme.bannerSrc && (
        <div className={d.banner}><img src={theme.bannerSrc} alt="" /></div>
      )}

      {/* Salutation + événement */}
      <header className={s.hello}>
        <span className={s.avatar} aria-hidden="true">{initiales}</span>
        <div className={s.helloText}>
          <h1 className={s.helloTitle}>{greeting} {prenom}</h1>
          <p className={s.helloSub}>
            {event?.nom || 'Aucun événement actif'}{event?.lieu && ` · ${event.lieu}`}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={openEditor} aria-label="Personnaliser l'accueil">
          <span className={s.customizeLabel}>Personnaliser</span>
        </Button>
      </header>

      {/* Blocs, dans l'ordre choisi */}
      {shown.length === 0 ? (
        <Empty icon={LayoutGrid} title="Tous les blocs sont masqués"
          action={<Button size="sm" onClick={openEditor}>Personnaliser l'accueil</Button>}>
          Réaffichez les indicateurs et raccourcis utiles à votre poste.
        </Empty>
      ) : (
        <div ref={page.ref} className={clsx(s.grid, 'yc-stagger')}>
          {shown.map(id => (
            <div key={id} data-flip={id} className={s[BLOCK[id].span]}>
              {renderBlock(id)}
            </div>
          ))}
        </div>
      )}

      {/* Personnaliser : afficher, masquer, réordonner */}
      <Sheet open={!!draft} onClose={closeEditor} title="Personnaliser l'accueil"
        footer={<>
          <Button variant="ghost" icon={RotateCcw} onClick={resetDraft}>Par défaut</Button>
          <Button variant="secondary" onClick={closeEditor}>Annuler</Button>
          <Button onClick={saveDraft} loading={saving}>Enregistrer</Button>
        </>}>
        <p className={s.sheetHint}>Affichez, masquez et réordonnez les blocs. L'aperçu change en direct ; rien n'est gardé avant « Enregistrer ».</p>
        <ul ref={sheet.ref} className={s.editList}>
          {editable.map((id, i) => {
            const b = BLOCK[id]
            const on = !prefs.hidden.includes(id)
            const Icon = b.icon
            return (
              <li key={id} data-flip={id} className={clsx(s.editItem, !on && s.editOff)}>
                <span className={clsx(s.editIcon, s[`t-${b.tone}`])}><Icon size={15} aria-hidden="true" /></span>
                <span className={s.editText}><b>{b.label}</b><span>{b.desc}</span></span>
                <span className={s.editMoves}>
                  <Button size="sm" variant="ghost" iconOnly icon={ChevronUp} disabled={i === 0}
                    onClick={() => move(id, -1)} aria-label={`Monter « ${b.label} »`} />
                  <Button size="sm" variant="ghost" iconOnly icon={ChevronDown} disabled={i === editable.length - 1}
                    onClick={() => move(id, 1)} aria-label={`Descendre « ${b.label} »`} />
                </span>
                <button type="button" role="switch" aria-checked={on} className={s.switch}
                  onClick={() => toggle(id)} aria-label={`${on ? 'Masquer' : 'Afficher'} « ${b.label} »`} />
              </li>
            )
          })}
        </ul>
      </Sheet>

      <GoalDialog
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        initial={goal}
        onSave={async (cents) => {
          try {
            await updateEvent(currentEventId, { objectifJour: cents })
            toast.success(cents ? `Objectif fixé à ${fmt(cents)} par jour` : 'Objectif retiré')
            setGoalOpen(false)
          } catch (e) {
            toast.error(`Objectif non enregistré : ${e?.message || 'erreur réseau'}`)
          }
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Composants
// ═══════════════════════════════════════════════════════════════════════

function Tile({ icon: Icon, tone, title, desc, stats, onClick }) {
  return (
    <button type="button" className={s.tile} onClick={onClick}>
      <span className={clsx(s.tileIcon, s[`t-${tone}`])}><Icon size={20} aria-hidden="true" /></span>
      <span className={s.tileText}>
        <b>{title}</b>
        <span>{desc}</span>
        {stats?.length > 0 && (
          <span className={s.tileStats}>
            {stats.map(st => (
              <span key={st.label} className={clsx(st.alert && st.value ? s.alert : st.warn && s.warn)}>
                <b>{st.value}</b>{st.label}
              </span>
            ))}
          </span>
        )}
      </span>
      <ChevronRight size={18} className={s.chev} aria-hidden="true" />
    </button>
  )
}

function GoalDialog({ open, onClose, initial, onSave }) {
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)
  const [tried, setTried]   = useState(false)
  useEffect(() => { if (open) { setValue(initial ? String(initial / 100) : ''); setTried(false) } }, [open, initial])

  const euros = parseFloat(String(value).replace(',', '.'))
  const valid = value === '' || (Number.isFinite(euros) && euros >= 0)

  const submit = async (e) => {
    e.preventDefault()
    setTried(true)
    if (!valid) return
    setSaving(true)
    await onSave(value === '' ? 0 : Math.round(euros * 100))
    setSaving(false)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Objectif de recettes par jour"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="goal-form" loading={saving}>Enregistrer</Button>
      </>}>
      <form id="goal-form" onSubmit={submit} className={d.goalForm} noValidate>
        <Field label="Montant visé pour une journée (6h–6h), en euros"
          hint="Laissez vide pour retirer l'objectif. Il s'applique à l'événement en cours, pour toute l'équipe."
          error={valid ? null : 'Saisissez un montant positif, par exemple 12000.'} showError={tried}>
          <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="ex : 12000" autoFocus />
        </Field>
      </form>
    </Dialog>
  )
}
