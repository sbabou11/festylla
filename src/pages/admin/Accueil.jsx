/**
 * pages/admin/Accueil.jsx — v1.0.0 (remplace Dashboard.jsx)
 *
 * Page d'accueil hybride affichée à la connexion :
 *   1. Bandeau de bienvenue (prénom + événement)
 *   2. Actions rapides — gros boutons pour les actions principales du rôle
 *   3. Vos espaces — pancartes style GestionArtistes vers les hubs / pages clés
 *   4. Aujourd'hui — 4 KPI du jour adaptés au rôle
 *   5. Outils — petits boutons d'accès aux fonctions secondaires (admin uniquement)
 *
 * Tout le contenu s'adapte selon le rôle de l'utilisateur via les capacités
 * (compatibles rôles personnalisés via ROLE_PAGES).
 */

import React, { useMemo, useState, useEffect, useRef } from 'react'
import {
  PlusCircle, ShoppingCart, Package, List, Bookmark, QrCode, Users,
  Briefcase, Calculator, UtensilsCrossed, Settings as SettingsIcon,
  BarChart3, AlertTriangle, ChevronRight, Music2, BadgeCheck, Receipt,
  Sparkles, ClipboardList, ChefHat, Banknote,
} from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import useAuthStore, { ROLE_PAGES } from '../../store/useAuthStore'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { getSettings } from '../../firebase/service'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
// Dashboard composable (N3) — uniquement pour admin
import useDashboardLayout from '../../hooks/useDashboardLayout'
import WidgetGrid from '../../components/dashboard/WidgetGrid'
import WidgetLibrary from '../../components/dashboard/WidgetLibrary'
import useActionUsage from '../../hooks/useActionUsage'
import { Plus, RotateCcw, Edit3, Check } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const fmtEShort = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

const getTs = (item) => {
  const t = item.createdAt || item.timestamp || item.date
  if (!t) return 0
  if (t.toDate) return t.toDate().getTime()
  if (t.seconds) return t.seconds * 1000
  if (t instanceof Date) return t.getTime()
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return 0
}

// Détection rapide d'anomalies (version allégée — voir Alertes.jsx pour complet)
function countAnomalies(spectateurs, logs) {
  let critiques = 0, attentions = 0
  ;(spectateurs || []).forEach(s => { if ((s.solde || 0) < 0) critiques++ })
  const txParSpec = {}
  ;(logs || []).forEach(t => {
    if (!t.specId) return
    txParSpec[t.specId] = (txParSpec[t.specId] || 0) + 1
  })
  Object.values(txParSpec).forEach(count => { if (count >= 5) attentions++ })
  ;(logs || []).forEach(t => {
    if (t.type === 'debit' && (t.montant || 0) > 5000) attentions++
  })
  return { critiques, attentions, total: critiques + attentions }
}

// ═══════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════

export default function Accueil({ onNavigate }) {
  const { logs, reservations, spectateurs, staff, roles } = useAppStore()
  const { user } = useAuthStore()
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  // Pages autorisées (builtin + rôles custom)
  const customRole = (roles || []).find(r => r.id === user?.role)
  const allowedPages = ROLE_PAGES[user?.role] || customRole?.pages || []

  // Capacités déduites des pages autorisées
  const canCredit  = isAdmin || allowedPages.includes('credit')
  const canDebit   = isAdmin || allowedPages.includes('debit')
  const canRetrait = isAdmin || allowedPages.includes('retrait')
  const isBilletterieProfile = !isAdmin && canCredit && !canDebit && !canRetrait
  const isStandProfile       = !isAdmin && !canCredit && (canDebit || canRetrait)

  // ─── Dashboard composable (admin uniquement) ────────────────────────
  // Hook qui gère le layout personnalisé : positions, tailles, ajout/suppression
  // de widgets. Persistance Firestore par utilisateur.
  const dashboard = useDashboardLayout()
  // État local : la bibliothèque de widgets est-elle ouverte ?
  // Visible uniquement en mode édition.
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Largeur disponible pour la grille — mesurée sur le container parent
  const gridContainerRef = useRef(null)
  const [gridWidth, setGridWidth] = useState(1200)
  useEffect(() => {
    if (!isAdmin) return
    const measure = () => {
      const w = gridContainerRef.current?.clientWidth
      if (w && w > 100) setGridWidth(w)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isAdmin])

  // ─── Actions rapides dynamiques (admin uniquement) ──────────────────
  // Toutes les actions disponibles pour l'admin, avec leur métadonnée.
  // L'ordre du tableau définit l'ordre par défaut quand aucun historique
  // d'usage n'existe encore. On affichera ensuite les 4 plus utilisées.
  const ADMIN_ACTIONS = useMemo(() => [
    { key: 'credit',            page: 'credit',            icon: PlusCircle,    color: '#1A8050', label: 'Créditer un compte',  desc: 'Recharger un spectateur' },
    { key: 'debit',             page: 'debit',             icon: ShoppingCart,  color: '#C5481A', label: 'Encaisser',           desc: 'Vente au stand' },
    { key: 'prendre-commande',  page: 'prendre-commande',  icon: ClipboardList, color: '#185FA5', label: 'Prendre commande',    desc: 'Avec numéro et suivi cuisine' },
    { key: 'retrait-commande',  page: 'retrait-commande',  icon: Package,       color: '#A87020', label: 'Retrait commande',    desc: 'Remettre au client' },
    { key: 'cuisine',           page: 'cuisine',           icon: ChefHat,       color: '#0F6E56', label: 'Cuisine',             desc: 'Suivi temps réel' },
    { key: 'retrait',           page: 'retrait',           icon: Package,       color: '#A87020', label: 'Retrait réservation', desc: 'Remettre une commande' },
    { key: 'remboursement',     page: 'remboursement',     icon: Banknote,      color: '#A87020', label: 'Remboursement',       desc: 'Solde restant ou correction' },
    { key: 'nouveau',           page: 'nouveau',           icon: QrCode,        color: '#A87020', label: 'Nouveau QR code',     desc: 'Inscrire un spectateur' },
  ], [])

  // Hook qui suit l'usage des actions (compteurs en localStorage par admin)
  const actionUsage = useActionUsage()
  // Liste des 4 keys à afficher dans l'ordre top → moins utilisé.
  // En l'absence d'historique, l'ordre par défaut (= ordre du tableau) est utilisé.
  const topActionKeys = useMemo(() => {
    if (!isAdmin) return []
    const allKeys = ADMIN_ACTIONS.map(a => a.key)
    return actionUsage.topActions(allKeys, 4, allKeys)
  }, [isAdmin, ADMIN_ACTIONS, actionUsage])
  // Tableau ordonné des 4 actions à rendre
  const topAdminActions = useMemo(() => {
    return topActionKeys
      .map(k => ADMIN_ACTIONS.find(a => a.key === k))
      .filter(Boolean)
  }, [topActionKeys, ADMIN_ACTIONS])

  // Chargement bénévoles (pour les stats admin)
  const [benevoles, setBenevoles] = useState([])
  useEffect(() => {
    if (!currentEventId || !isAdmin) return
    const unsub = onSnapshot(
      query(collection(db, 'events', currentEventId, 'benevoles'), orderBy('createdAt', 'desc')),
      snap => setBenevoles(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      () => {}
    )
    return unsub
  }, [currentEventId, isAdmin])

  // Chargement seuils d'alertes (admin uniquement)
  const [seuils, setSeuils] = useState(null)
  useEffect(() => {
    if (!currentEventId || !isAdmin) return
    getSettings(currentEventId).then(s => {
      setSeuils(s?.alertSeuils || null)
    }).catch(() => {})
  }, [currentEventId, isAdmin])

  // Logs filtrés (non-admin → seulement les leurs)
  const myStaffName  = (user?.nom || '').trim().toLowerCase()
  const myStaffEmail = (user?.email || '').trim().toLowerCase()
  const myLogs = useMemo(() => {
    if (isAdmin) return logs || []
    return (logs || []).filter(t => {
      const s = (t.staff || '').trim().toLowerCase()
      return s && (s === myStaffName || s === myStaffEmail)
    })
  }, [logs, isAdmin, myStaffName, myStaffEmail])

  // ─── KPIs du jour ────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startTs = startOfDay.getTime()

    const logsJour = myLogs.filter(t => getTs(t) >= startTs)
    const recettesJour = logsJour
      .filter(t => ['credit', 'debit', 'retrait', 'reservation'].includes(t.type))
      .reduce((s, t) => s + ((t.montant || 0) / 100), 0)
    const creditsJour = logsJour
      .filter(t => t.type === 'credit')
      .reduce((s, t) => s + ((t.montant || 0) / 100), 0)
    const ventesJour = logsJour
      .filter(t => ['debit', 'retrait'].includes(t.type))
      .reduce((s, t) => s + ((t.montant || 0) / 100), 0)
    const txCount = logsJour.length
    const creditsCount = logsJour.filter(t => t.type === 'credit').length
    const ventesCount  = logsJour.filter(t => ['debit', 'retrait'].includes(t.type)).length

    const resasEnAttente = (reservations || []).filter(r => r.status === 'pending' || r.status === 'processing').length
    const resasPretes    = (reservations || []).filter(r => r.status === 'ready').length
    const nbSpec = (spectateurs || []).length
    const soldesTotal = (spectateurs || []).reduce((s, sp) => s + (Number(sp.solde) || 0), 0) / 100

    return { recettesJour, creditsJour, ventesJour, txCount, creditsCount, ventesCount, resasEnAttente, resasPretes, nbSpec, soldesTotal }
  }, [myLogs, reservations, spectateurs])

  const anomalies = useMemo(() => {
    if (!isAdmin) return { critiques: 0, attentions: 0, total: 0 }
    return countAnomalies(spectateurs, logs)
  }, [spectateurs, logs, isAdmin])

  // ─── Stats artistes (admin) ──────────────────────────────────────────
  const artistesStats = useMemo(() => {
    if (!isAdmin) return { creneaux: 0, aPayer: 0 }
    return { creneaux: 0, aPayer: 0 } // Placeholder — les vraies stats viendraient d'un watch Firestore
  }, [isAdmin])

  // ─── Prénom (pour le hello) ──────────────────────────────────────────
  const prenom = useMemo(() => {
    const nom = (user?.nom || '').trim()
    return nom.split(' ')[0] || 'à vous'
  }, [user])

  const initiales = useMemo(() => {
    const nom = (user?.nom || '').trim()
    return nom.split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || '?'
  }, [user])

  const heureGreeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 6)  return 'Bonne soirée'
    if (h < 12) return 'Bonjour'
    if (h < 18) return 'Bon après-midi'
    return 'Bonsoir'
  }, [])

  return (
    <div style={{ padding: '8px 4px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ─── BANDEAU DE BIENVENUE ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', marginBottom: 18,
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 14,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--brand-light)',
          color: 'var(--brand-dark)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 800, flexShrink: 0,
        }}>
          {initiales}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
            {heureGreeting} {prenom}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentEvent?.nom || 'Aucun événement actif'}
            {currentEvent?.lieu && ` · ${currentEvent.lieu}`}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 1 — ACTIONS RAPIDES (non-admin uniquement)
          Pour l'admin, les actions rapides sont déplacées APRÈS le tableau
          de bord (cf. structure plus bas). Pour les autres rôles, on garde
          la même position qu'avant. */}
      {!isAdmin && (canCredit || canDebit || canRetrait) && (
        <>
          <SectionHeader icon={<Sparkles size={12}/>} label="Actions rapides"/>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10, marginBottom: 18,
          }}>
            {canCredit && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('credit', 'accueil')}
                icon={<PlusCircle size={20}/>}
                label="Créditer un compte"
                desc="Recharger un spectateur"
                color="#1A8050"
                isMobile={isMobile}
              />
            )}
            {/* Remboursement : action billetterie — solde restant ou correction */}
            {canCredit && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('remboursement', 'accueil')}
                icon={<Banknote size={20}/>}
                label="Remboursement"
                desc="Solde restant ou correction"
                color="#A87020"
                isMobile={isMobile}
              />
            )}
            {canDebit && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('debit', 'accueil')}
                icon={<ShoppingCart size={20}/>}
                label="Encaisser"
                desc="Vente au stand"
                color="#C5481A"
                isMobile={isMobile}
              />
            )}
            {/* Prendre commande : action rapide pour les rôles qui encaissent (stand & admin) */}
            {canDebit && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('prendre-commande', 'accueil')}
                icon={<ClipboardList size={20}/>}
                label="Prendre commande"
                desc="Avec numéro et suivi cuisine"
                color="#185FA5"
                isMobile={isMobile}
              />
            )}
            {/* Cuisine : suivi des commandes en préparation */}
            {canDebit && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('cuisine', 'accueil')}
                icon={<ChefHat size={20}/>}
                label="Cuisine"
                desc="Suivi temps réel"
                color="#0F6E56"
                isMobile={isMobile}
              />
            )}
            {/* Retrait commande : remise au client */}
            {canDebit && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('retrait-commande', 'accueil')}
                icon={<Package size={20}/>}
                label="Retrait commande"
                desc="Remettre au client"
                color="#A87020"
                isMobile={isMobile}
              />
            )}
            {canRetrait && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('retrait', 'accueil')}
                icon={<Package size={20}/>}
                label="Retrait réservation"
                desc="Remettre une commande"
                color="#A87020"
                isMobile={isMobile}
              />
            )}
            {/* Billetterie : ajouter aussi "Nouveau QR" en action rapide */}
            {isBilletterieProfile && (
              <ActionRapide
                onClick={() => onNavigate && onNavigate('nouveau', 'accueil')}
                icon={<QrCode size={20}/>}
                label="Nouveau QR code"
                desc="Inscrire un spectateur"
                color="#A87020"
                isMobile={isMobile}
              />
            )}
          </div>
        </>
      )}

      {/* ═══ SECTION 2 — DASHBOARD COMPOSABLE (admin) OU VOS ESPACES (autres rôles)
          Pour l'admin : grille de widgets personnalisable avec mode édition.
          Pour les autres rôles : ancien système de pancartes "Vos espaces". */}

      {/* ─── Dashboard composable admin ───────────────────────────────── */}
      {isAdmin && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <SectionHeader icon={<BarChart3 size={12}/>} label="Tableau de bord"/>
            <div style={{ display: 'flex', gap: 6 }}>
              {dashboard.editMode && (
                <>
                  <button
                    onClick={() => setLibraryOpen(o => !o)}
                    title="Ajouter un widget"
                    style={{
                      background: libraryOpen ? 'var(--brand-light)' : 'transparent',
                      color: libraryOpen ? 'var(--brand-dark)' : 'var(--muted)',
                      border: '0.5px solid var(--border)',
                      borderRadius: 6, padding: '5px 10px', fontSize: 11,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontFamily: 'inherit',
                    }}>
                    <Plus size={11}/> Ajouter
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Restaurer le tableau de bord par défaut ?')) {
                        dashboard.resetToDefault()
                      }
                    }}
                    title="Restaurer le défaut"
                    style={{
                      background: 'transparent', border: '0.5px solid var(--border)',
                      color: 'var(--muted)', borderRadius: 6,
                      padding: '5px 10px', fontSize: 11,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontFamily: 'inherit',
                    }}>
                    <RotateCcw size={11}/> Reset
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  dashboard.setEditMode(m => !m)
                  // Fermer la bibliothèque quand on quitte le mode édition
                  if (dashboard.editMode) setLibraryOpen(false)
                }}
                style={{
                  background: dashboard.editMode ? 'var(--text)' : 'transparent',
                  color: dashboard.editMode ? 'var(--bg)' : 'var(--muted)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 6, padding: '5px 10px', fontSize: 11,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit',
                }}>
                {dashboard.editMode
                  ? <><Check size={11}/> Terminer</>
                  : <><Edit3 size={11}/> Personnaliser</>}
              </button>
            </div>
          </div>

          {/* Bibliothèque de widgets — visible uniquement quand l'utilisateur
              a cliqué "+ Ajouter" en mode édition. Chips horizontaux. */}
          {dashboard.editMode && libraryOpen && (
            <WidgetLibrary
              installedTypes={dashboard.widgets.map(w => w.type)}
              onAdd={(type) => {
                dashboard.addWidget(type)
                // Garde la bibliothèque ouverte pour permettre d'ajouter plusieurs widgets
              }}
              onClose={() => setLibraryOpen(false)}
            />
          )}

          <div ref={gridContainerRef} style={{ marginBottom: 18 }}>
            {dashboard.loading ? (
              <div style={{
                padding: 30, textAlign: 'center',
                color: 'var(--muted)', fontSize: 12,
              }}>Chargement du tableau de bord…</div>
            ) : (
              <WidgetGrid
                layout={dashboard.layout}
                widgets={dashboard.widgets}
                editMode={dashboard.editMode}
                width={gridWidth}
                onLayoutChange={dashboard.updateLayout}
                onRemoveWidget={dashboard.removeWidget}
              />
            )}
          </div>

          {/* ─── Actions rapides admin (top 4 dynamiques) ──────────────────
              Affichées APRÈS le tableau de bord (priorité aux KPIs).
              Limitées aux 4 les plus utilisées par cet admin. Chaque clic
              incrémente le compteur via useActionUsage → le tri s'ajuste
              automatiquement à l'usage réel. */}
          <SectionHeader icon={<Sparkles size={12}/>} label="Actions rapides"/>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 10, marginBottom: 18,
          }}>
            {topAdminActions.map(a => {
              const Icon = a.icon
              return (
                <ActionRapide
                  key={a.key}
                  onClick={() => {
                    actionUsage.recordUse(a.key)
                    onNavigate && onNavigate(a.page, 'accueil')
                  }}
                  icon={<Icon size={20}/>}
                  label={a.label}
                  desc={a.desc}
                  color={a.color}
                  isMobile={isMobile}
                />
              )
            })}
          </div>
        </>
      )}

      {/* ─── Pancartes "Vos espaces" pour les autres rôles ─────────────── */}
      {!isAdmin && (
        <>
          <SectionHeader icon={<Briefcase size={12}/>} label="Vos espaces"/>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12, marginBottom: 18,
          }}>
            {/* ─── Admin : 4 hubs ─────────────────────────────────────── */}
            {isAdmin && (
              <>
                <Pancarte
              onClick={() => onNavigate && onNavigate('operations', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
              icon={<Receipt size={isMobile ? 30 : 36}/>}
              titre="Opérations"
              description="Caisse, transactions, alertes"
              stats={[
                { label: 'Recettes/j', value: fmtEShort(kpis.recettesJour) },
                { label: 'Résas', value: kpis.resasEnAttente, warning: kpis.resasEnAttente > 0 },
                { label: 'Alertes', value: anomalies.total, alert: anomalies.critiques > 0, warning: anomalies.attentions > 0 },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('equipe-hub', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #5EB8E4 0%, #1F2D5F 100%)"
              icon={<Users size={isMobile ? 30 : 36}/>}
              titre="Équipe & Bénévoles"
              description="Comptes staff et bénévoles"
              stats={[
                { label: 'Staff', value: (staff || []).length },
                { label: 'Bénévoles', value: benevoles.length },
                { label: 'Actifs', value: benevoles.filter(b => (b.droits?.repas || 0) + (b.droits?.boisson || 0) + (b.droits?.eau || 0) > 0).length },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('spectateurs-hub', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #14B5B5 0%, #009090 100%)"
              icon={<QrCode size={isMobile ? 30 : 36}/>}
              titre="Spectateurs & Accès"
              description="Comptes et QR codes"
              stats={[
                { label: 'Inscrits', value: kpis.nbSpec },
                { label: 'Actifs', value: (spectateurs || []).filter(s => (s.solde || 0) > 0).length },
                { label: 'Solde', value: fmtEShort(kpis.soldesTotal) },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('gestion-artistes', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
              icon={<Music2 size={isMobile ? 30 : 36}/>}
              titre="Gestion artistes"
              description="Planning et cachets"
              stats={[
                { label: 'Vue hub', value: '✓' },
                { label: 'Planning', value: '→' },
                { label: 'Cachets', value: '→' },
              ]}
            />
          </>
        )}

        {/* ─── Billetterie : 4 pancartes spécifiques ───────────────── */}
        {isBilletterieProfile && (
          <>
            <Pancarte
              onClick={() => onNavigate && onNavigate('credit', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #2DAA70 0%, #1A8050 100%)"
              icon={<PlusCircle size={isMobile ? 30 : 36}/>}
              titre="Créditer"
              description="Recharger un compte"
              stats={[
                { label: 'Vos crédits/j', value: fmtEShort(kpis.creditsJour) },
                { label: 'Tx du jour', value: kpis.creditsCount },
                { label: 'Inscrits', value: kpis.nbSpec },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('nouveau', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
              icon={<QrCode size={isMobile ? 30 : 36}/>}
              titre="Nouveau QR code"
              description="Créer + imprimer"
              stats={[
                { label: 'Inscrits', value: kpis.nbSpec },
                { label: 'Avec solde', value: (spectateurs || []).filter(s => (s.solde || 0) > 0).length },
                { label: 'À l\'entrée', value: '✓' },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('transactions', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
              icon={<List size={isMobile ? 30 : 36}/>}
              titre="Transactions"
              description="Vos opérations"
              stats={[
                { label: 'Vos tx', value: myLogs.length },
                { label: 'Aujourd\'hui', value: kpis.txCount },
                { label: 'Crédits', value: kpis.creditsCount },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('spectateurs', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #14B5B5 0%, #009090 100%)"
              icon={<Users size={isMobile ? 30 : 36}/>}
              titre="Liste des spectateurs"
              description="Consulter (lecture seule)"
              stats={[
                { label: 'Inscrits', value: kpis.nbSpec },
                { label: 'Actifs', value: (spectateurs || []).filter(s => (s.solde || 0) > 0).length },
                { label: 'Solde tot.', value: fmtEShort(kpis.soldesTotal) },
              ]}
            />
          </>
        )}

        {/* ─── Stand : 4 pancartes spécifiques ─────────────────────── */}
        {isStandProfile && (
          <>
            <Pancarte
              onClick={() => onNavigate && onNavigate('debit', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #F07848 0%, #B8470F 100%)"
              icon={<ShoppingCart size={isMobile ? 30 : 36}/>}
              titre="Encaisser"
              description="Vente directe au stand"
              stats={[
                { label: 'Vos ventes/j', value: fmtEShort(kpis.ventesJour) },
                { label: 'Tx', value: kpis.ventesCount },
                { label: 'Total', value: kpis.txCount },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('retrait', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
              icon={<Package size={isMobile ? 30 : 36}/>}
              titre="Retrait réservation"
              description="Remettre une commande"
              stats={[
                { label: 'Prêtes', value: kpis.resasPretes },
                { label: 'En attente', value: kpis.resasEnAttente, warning: kpis.resasEnAttente > 0 },
                { label: 'Total', value: (reservations || []).length },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('reservations-admin', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #534AB7 0%, #3C3489 100%)"
              icon={<Bookmark size={isMobile ? 30 : 36}/>}
              titre="Réservations"
              description="Voir et préparer"
              stats={[
                { label: 'Total', value: (reservations || []).length },
                { label: 'En attente', value: kpis.resasEnAttente, warning: kpis.resasEnAttente > 0 },
                { label: 'Prêtes', value: kpis.resasPretes },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('transactions', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
              icon={<List size={isMobile ? 30 : 36}/>}
              titre="Transactions"
              description="Vos opérations"
              stats={[
                { label: 'Vos tx', value: myLogs.length },
                { label: 'Aujourd\'hui', value: kpis.txCount },
                { label: 'Ventes', value: kpis.ventesCount },
              ]}
            />
          </>
        )}

        {/* ─── Consultation : analytics + compta + résas + transactions ── */}
        {user?.role === 'consultation' && (
          <>
            <Pancarte
              onClick={() => onNavigate && onNavigate('analytics', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
              icon={<BarChart3 size={isMobile ? 30 : 36}/>}
              titre="Analytics"
              description="Statistiques avancées"
              stats={[
                { label: 'KPI', value: '→' },
                { label: 'Graphiques', value: '→' },
                { label: 'Tendances', value: '→' },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('comptabilite', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
              icon={<Calculator size={isMobile ? 30 : 36}/>}
              titre="Comptabilité"
              description="Trésorerie et résultat"
              stats={[
                { label: 'Tx/j', value: kpis.txCount },
                { label: 'Recettes', value: fmtEShort(kpis.recettesJour) },
                { label: 'Solde', value: fmtEShort(kpis.soldesTotal) },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('reservations-admin', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #534AB7 0%, #3C3489 100%)"
              icon={<Bookmark size={isMobile ? 30 : 36}/>}
              titre="Réservations"
              description="Vue d'ensemble"
              stats={[
                { label: 'Total', value: (reservations || []).length },
                { label: 'En attente', value: kpis.resasEnAttente },
                { label: 'Prêtes', value: kpis.resasPretes },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('transactions', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #14B5B5 0%, #009090 100%)"
              icon={<List size={isMobile ? 30 : 36}/>}
              titre="Transactions"
              description="Historique complet"
              stats={[
                { label: 'Total', value: (logs || []).length },
                { label: 'Aujourd\'hui', value: kpis.txCount },
                { label: 'Crédits/j', value: kpis.creditsCount },
              ]}
            />
          </>
        )}

        {/* ─── Directeur artistique : juste planning + cachets ──────── */}
        {user?.role === 'directeur_artistique' && (
          <>
            <Pancarte
              onClick={() => onNavigate && onNavigate('planning', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
              icon={<Music2 size={isMobile ? 30 : 36}/>}
              titre="Planning artistes"
              description="Créneaux et balances"
              stats={[
                { label: 'Voir', value: '→' },
                { label: 'Éditer', value: '→' },
                { label: 'Dupliquer', value: '→' },
              ]}
            />
            <Pancarte
              onClick={() => onNavigate && onNavigate('cachets', 'accueil')}
              isMobile={isMobile}
              gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
              icon={<Receipt size={isMobile ? 30 : 36}/>}
              titre="Cachets & Décharges"
              description="Suivi et paiements"
              stats={[
                { label: 'Voir', value: '→' },
                { label: 'Marquer payé', value: '→' },
                { label: 'Décharges', value: '→' },
              ]}
            />
          </>
        )}
      </div>
        </>
      )}

      {/* ═══ SECTION 3 — AUJOURD'HUI (KPI cards, hors admin uniquement) ═══
          Pour l'admin, ces KPIs sont remplacés par les widgets composables. */}
      {!isAdmin && (
        <>
          <SectionHeader icon={<BarChart3 size={12}/>} label="Aujourd'hui"/>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10, marginBottom: 18,
          }}>
        {isAdmin && (
          <>
            <KpiCard label="Recettes du jour" value={fmtEShort(kpis.recettesJour)} color="var(--green-dark)"/>
            <KpiCard label="Transactions" value={kpis.txCount}/>
            <KpiCard label="Résas en attente" value={kpis.resasEnAttente} warning={kpis.resasEnAttente > 0}/>
            <KpiCard label="Alertes" value={anomalies.total} alert={anomalies.critiques > 0} warning={anomalies.attentions > 0 && anomalies.critiques === 0}/>
          </>
        )}
        {isBilletterieProfile && (
          <>
            <KpiCard label="Vos crédits du jour" value={fmtEShort(kpis.creditsJour)} color="var(--green-dark)"/>
            <KpiCard label="Vos transactions" value={kpis.txCount}/>
            <KpiCard label="Nouveaux inscrits" value={(spectateurs || []).filter(s => {
              const ts = getTs(s)
              const today = new Date(); today.setHours(0,0,0,0)
              return ts >= today.getTime()
            }).length}/>
            <KpiCard label="Spectateurs total" value={kpis.nbSpec}/>
          </>
        )}
        {isStandProfile && (
          <>
            <KpiCard label="Encaissé du jour" value={fmtEShort(kpis.ventesJour)} color="var(--coral-dark)"/>
            <KpiCard label="Ventes" value={kpis.ventesCount}/>
            <KpiCard label="Résas à retirer" value={kpis.resasPretes} warning={kpis.resasPretes > 0}/>
            <KpiCard label="Panier moyen" value={kpis.ventesCount > 0 ? fmtEShort(kpis.ventesJour / kpis.ventesCount) : '—'}/>
          </>
        )}
        {user?.role === 'consultation' && (
          <>
            <KpiCard label="Recettes du jour" value={fmtEShort(kpis.recettesJour)}/>
            <KpiCard label="Transactions" value={kpis.txCount}/>
            <KpiCard label="Spectateurs" value={kpis.nbSpec}/>
            <KpiCard label="Solde total" value={fmtEShort(kpis.soldesTotal)}/>
          </>
        )}
        {user?.role === 'directeur_artistique' && (
          <>
            <KpiCard label="Bonjour" value={prenom}/>
            <KpiCard label="Événement" value={currentEvent?.nom?.slice(0, 20) || '—'}/>
          </>
        )}
      </div>
        </>
      )}

      {/* ═══ SECTION 4 — OUTILS (admin uniquement) ═════════════════════
          Petits boutons d'accès aux fonctions secondaires */}
      {isAdmin && (
        <>
          <SectionHeader icon={<SettingsIcon size={12}/>} label="Outils"/>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8, marginBottom: 18,
          }}>
            <OutilBtn onClick={() => onNavigate && onNavigate('analytics', 'accueil')} icon={<BarChart3 size={18}/>} label="Analytics"/>
            <OutilBtn onClick={() => onNavigate && onNavigate('comptabilite', 'accueil')} icon={<Calculator size={18}/>} label="Comptabilité"/>
            <OutilBtn onClick={() => onNavigate && onNavigate('menu', 'accueil')} icon={<UtensilsCrossed size={18}/>} label="Carte & menu"/>
            <OutilBtn onClick={() => onNavigate && onNavigate('settings', 'accueil')} icon={<SettingsIcon size={18}/>} label="Paramètres"/>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Composants visuels
// ═══════════════════════════════════════════════════════════════════════

function SectionHeader({ icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      marginBottom: 8,
    }}>
      {icon} <span>{label}</span>
    </div>
  )
}

function ActionRapide({ onClick, icon, label, desc, color, isMobile }) {
  return (
    <button onClick={onClick}
      style={{
        background: 'var(--bg)',
        border: `1px solid ${color}33`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'transform .15s, box-shadow .15s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 64,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 6px 16px ${color}22`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: color, marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{desc}</div>
      </div>
      <ChevronRight size={18} style={{ color: color, opacity: 0.6, flexShrink: 0 }}/>
    </button>
  )
}

function Pancarte({ onClick, isMobile, gradient, icon, titre, description, stats }) {
  return (
    <button onClick={onClick}
      style={{
        background: gradient,
        color: '#fff',
        border: 'none',
        borderRadius: 16,
        padding: isMobile ? 14 : 18,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: '0 4px 18px rgba(0, 48, 72, 0.15)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: isMobile ? 150 : 180,
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 48, 72, 0.22)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 4px 18px rgba(0, 48, 72, 0.15)'
      }}>
      <div style={{
        position: 'absolute', top: '-50%', right: '-30%',
        width: '80%', height: '120%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 60%)',
        pointerEvents: 'none',
      }}/>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{
          width: isMobile ? 46 : 54, height: isMobile ? 46 : 54,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          {icon}
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(255,255,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ChevronRight size={16}/>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800, lineHeight: 1.2, marginBottom: 2 }}>
          {titre}
        </div>
        <div style={{ fontSize: 11, opacity: 0.92, lineHeight: 1.35 }}>
          {description}
        </div>
      </div>
      <div style={{
        marginTop: 'auto', position: 'relative',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.20)',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 13 : 15, fontWeight: 800, lineHeight: 1.1,
              color: s.alert ? '#FFE5DC' : s.warning ? '#FFE5DC' : '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.value}
            </div>
            <div style={{
              fontSize: 9, opacity: 0.85, marginTop: 1,
              textTransform: 'uppercase', letterSpacing: '0.03em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </button>
  )
}

function KpiCard({ label, value, color, alert, warning }) {
  const c = alert ? 'var(--red-dark)' : warning ? 'var(--gold-dark)' : (color || 'var(--text)')
  const bg = alert ? 'var(--red-light)' : warning ? 'var(--gold-light)' : 'var(--bg2)'
  return (
    <div style={{
      background: bg,
      borderRadius: 10, padding: '10px 12px',
      border: '0.5px solid var(--border)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
    </div>
  )
}

function OutilBtn({ onClick, icon, label }) {
  return (
    <button onClick={onClick}
      style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 10, padding: '10px',
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 5,
        transition: 'background .15s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 60,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)' }}>
      <div style={{ color: 'var(--brand)' }}>{icon}</div>
      <div style={{ fontSize: 11, color: 'var(--text)', textAlign: 'center', fontWeight: 600 }}>{label}</div>
    </button>
  )
}
