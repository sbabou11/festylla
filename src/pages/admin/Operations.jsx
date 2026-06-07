/**
 * pages/admin/Operations.jsx — v1.1.0
 *
 * Hub centralisé pour les actions financières et opérationnelles, avec :
 *   - Pancartes principales style GestionArtistes (gradient, stats)
 *   - Actions rapides : Créditer / Encaisser / Retrait réservation
 *   - Consultations : Transactions / Réservations
 *   - Alertes financières intégrées (depuis Alertes.jsx)
 *   - Bandeau d'urgence pour les résas en attente trop longtemps
 */

import React, { useMemo, useEffect, useState } from 'react'
import {
  PlusCircle, ShoppingCart, Package, List, Bookmark,
  TrendingUp, Receipt, Clock, CheckCircle, AlertTriangle,
  ChevronRight, ArrowLeftRight, QrCode, Users, ClipboardList, ChefHat, Banknote,
  Monitor, ShoppingBag,
} from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import PancartePrincipale from '../../components/PancartePrincipale'
import useAuthStore, { ROLE_PAGES } from '../../store/useAuthStore'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { getSettings } from '../../firebase/service'
import { fmt } from '../../utils/helpers'

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

// ═══════════════════════════════════════════════════════════════════════
// Détection rapide des anomalies (version allégée pour l'aperçu Operations)
// La version complète est dans Alertes.jsx
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_SEUILS = {
  detectSoldeNegatif: true,
  txRapides: 5,
  detectTxRapides: true,
  debitEleveSeuil: 5000, // centimes
  detectDebitEleve: true,
}

function quickCountAnomalies(spectateurs, logs, reservations, seuils = DEFAULT_SEUILS) {
  let critiques = 0
  let attentions = 0

  // 1. Soldes négatifs (critique)
  if (seuils.detectSoldeNegatif) {
    (spectateurs || []).forEach(s => {
      if ((s.solde || 0) < 0) critiques++
    })
  }

  // 2. Transactions rapides (attention)
  if (seuils.detectTxRapides) {
    const txParSpec = {}
    ;(logs || []).forEach(t => {
      if (!t.specId) return
      if (!txParSpec[t.specId]) txParSpec[t.specId] = 0
      txParSpec[t.specId]++
    })
    Object.values(txParSpec).forEach(count => {
      if (count >= seuils.txRapides) attentions++
    })
  }

  // 3. Débits élevés (attention)
  if (seuils.detectDebitEleve) {
    ;(logs || []).forEach(t => {
      if (t.type === 'debit' && (t.montant || 0) > seuils.debitEleveSeuil) attentions++
    })
  }

  return { critiques, attentions, total: critiques + attentions }
}

// ═══════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════

export default function Operations({ onNavigate }) {
  const { logs, reservations, spectateurs, roles } = useAppStore()
  const { user } = useAuthStore()
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  // Pages autorisées pour ce user : rôle builtin OU rôle custom (créé via Settings)
  const customRole = (roles || []).find(r => r.id === user?.role)
  const allowedPages = ROLE_PAGES[user?.role] || customRole?.pages || []

  // Charge les seuils d'alertes paramétrables
  const [seuils, setSeuils] = useState(DEFAULT_SEUILS)
  useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(s => {
      if (s?.alertSeuils) setSeuils({ ...DEFAULT_SEUILS, ...s.alertSeuils })
    }).catch(() => {})
  }, [currentEventId])

  // ─── Filtrage par staff (non-admin voient leurs propres ops) ────────
  const myStaffName  = (user?.nom || '').trim().toLowerCase()
  const myStaffEmail = (user?.email || '').trim().toLowerCase()
  const myLogs = useMemo(() => {
    if (isAdmin) return logs || []
    return (logs || []).filter(t => {
      const s = (t.staff || '').trim().toLowerCase()
      return s && (s === myStaffName || s === myStaffEmail)
    })
  }, [logs, isAdmin, myStaffName, myStaffEmail])

  // ─── KPIs temps réel ─────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = Date.now()
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startTs = startOfDay.getTime()

    const recettesJour = myLogs
      .filter(t => getTs(t) >= startTs)
      .filter(t => ['credit', 'debit', 'retrait', 'reservation'].includes(t.type))
      .reduce((sum, t) => sum + ((t.montant || 0) / 100), 0)

    const txToday = myLogs.filter(t => getTs(t) >= startTs).length

    const resasEnAttente = (reservations || []).filter(r =>
      r.status === 'pending' || r.status === 'processing'
    ).length

    const resasPretes = (reservations || []).filter(r => r.status === 'ready').length

    const resasEnRetard = (reservations || []).filter(r => {
      if (r.status !== 'pending' && r.status !== 'processing') return false
      const ts = getTs(r)
      return ts && (now - ts) > 10 * 60 * 1000
    }).length

    return { recettesJour, txToday, resasEnAttente, resasPretes, resasEnRetard }
  }, [myLogs, reservations])

  // ─── Anomalies pour la pancarte Alertes ──────────────────────────────
  const anomaliesCount = useMemo(() => {
    if (!isAdmin) return { critiques: 0, attentions: 0, total: 0 }
    return quickCountAnomalies(spectateurs, logs, reservations, seuils)
  }, [spectateurs, logs, reservations, seuils, isAdmin])

  // ─── Stats supplémentaires pour les pancartes ───────────────────────
  const txStats = useMemo(() => {
    const total = myLogs.length
    const credits = myLogs.filter(t => t.type === 'credit').length
    const ventes = myLogs.filter(t => ['debit', 'retrait'].includes(t.type)).length
    return { total, credits, ventes }
  }, [myLogs])

  const resaStats = useMemo(() => {
    const list = reservations || []
    return {
      total: list.length,
      pending: list.filter(r => r.status === 'pending' || r.status === 'processing').length,
      ready: list.filter(r => r.status === 'ready').length,
    }
  }, [reservations])

  // ─── Capacités déduites des pages autorisées ─────────────────────────
  // Marche aussi bien pour les rôles builtin (billetterie, stand…)
  // que pour les rôles personnalisés créés via Settings.
  const canCredit  = isAdmin || allowedPages.includes('credit')
  const canDebit   = isAdmin || allowedPages.includes('debit')
  const canRetrait = isAdmin || allowedPages.includes('retrait')

  // ─── Détection du PROFIL billetterie (par capacités, pas par nom de rôle) ──
  // Critère : peut créditer ET ne peut pas encaisser/retirer
  // (typique d'un vendeur de billets qui ne gère pas les commandes au stand).
  // Marche pour le rôle builtin 'billetterie' ET pour tout rôle personnalisé
  // qui a ces mêmes permissions.
  const isBilletterieProfile = !isAdmin && canCredit && !canDebit && !canRetrait

  return (
    <div style={{ padding: '8px 4px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ─── Header ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--marine)',
          margin: 0, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <ArrowLeftRight size={isMobile ? 24 : 28}/> Opérations
        </h1>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {currentEvent?.nom || 'Aucun événement actif'}
        </div>
      </div>

      {/* ─── PANCARTES PRINCIPALES — adaptées selon le rôle ───────────
          - Billetterie : 4 pancartes dédiées (Créditer / Nouveau QR / Transactions / Spectateurs)
          - Admin / autres : pancartes générales (Caisse / Réservations / Alertes)
      */}
      {isBilletterieProfile ? (
        // ─── VUE BILLETTERIE — 4 pancartes spécifiques ─────────────────
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: 16,
          marginBottom: 20,
        }}>
          {/* Pancarte 1 : Créditer */}
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('credit', 'operations')}
            isMobile={isMobile}
            gradient="linear-gradient(135deg, #2DAA70 0%, #1A8050 100%)"
            icon={<PlusCircle size={isMobile ? 36 : 44} strokeWidth={2}/>}
            titre="Créditer"
            description="Recharger le compte d'un spectateur"
            stats={[
              { label: 'Vos crédits/jour', value: fmtEShort(kpis.recettesJour) },
              { label: 'Total crédits', value: txStats.credits },
              { label: 'Spectateurs', value: (spectateurs || []).length },
            ]}
          />

          {/* Pancarte 2 : Nouveau QR code */}
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('nouveau', 'operations')}
            isMobile={isMobile}
            gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
            icon={<QrCode size={isMobile ? 36 : 44} strokeWidth={2}/>}
            titre="Nouveau QR code"
            description="Créer un compte et imprimer son badge"
            stats={[
              { label: 'Inscrits', value: (spectateurs || []).length },
              { label: 'Avec solde', value: (spectateurs || []).filter(s => (s.solde || 0) > 0).length },
              { label: 'À l\'entrée', value: '✓' },
            ]}
          />

          {/* Pancarte 3 : Transactions */}
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('transactions', 'operations')}
            isMobile={isMobile}
            gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
            icon={<List size={isMobile ? 36 : 44} strokeWidth={2}/>}
            titre="Transactions"
            description="Historique de vos opérations effectuées"
            stats={[
              { label: 'Vos transactions', value: txStats.total },
              { label: 'Aujourd\'hui', value: kpis.txToday },
              { label: 'Crédits', value: txStats.credits },
            ]}
          />

          {/* Pancarte 4 : Liste des spectateurs */}
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('spectateurs', 'operations')}
            isMobile={isMobile}
            gradient="linear-gradient(135deg, #14B5B5 0%, #009090 100%)"
            icon={<Users size={isMobile ? 36 : 44} strokeWidth={2}/>}
            titre="Liste des spectateurs"
            description="Consulter et chercher les spectateurs inscrits"
            stats={[
              { label: 'Inscrits', value: (spectateurs || []).length },
              { label: 'Actifs', value: (spectateurs || []).filter(s => (s.solde || 0) > 0).length },
              { label: 'Solde total', value: fmtEShort((spectateurs || []).reduce((s, sp) => s + (Number(sp.solde) || 0), 0) / 100) },
            ]}
          />

          {/* Pancarte 5 : Remboursement (rendre le solde ou corriger un débit) */}
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('remboursement', 'operations')}
            isMobile={isMobile}
            gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
            icon={<Banknote size={isMobile ? 36 : 44} strokeWidth={2}/>}
            titre="Remboursement"
            description="Rendre le solde restant ou créditer en correction"
            stats={[
              { label: 'Mode solde', value: '↓' },
              { label: 'Mode correction', value: '↑' },
              { label: 'Traçable', value: '✓' },
            ]}
          />
        </div>
      ) : (
        // ─── VUE ADMIN / AUTRES — pancartes générales ──────────────────
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : (isAdmin ? '1fr 1fr 1fr' : '1fr 1fr'),
          gap: 16,
          marginBottom: 20,
        }}>

        {/* Pancarte 1 : Encaissement (Créditer + Encaisser + Retrait)
            Cible de navigation :
              - Admin : page Transactions (vue d'ensemble / historique)
              - Billetterie / autres : leur action principale (créditer ou débiter)
            On ne forçait pas isAdmin avant, ce qui faisait que les admins
            tombaient sur "Créditer" au lieu de l'historique attendu. */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate(
            isAdmin ? 'transactions' : (canCredit ? 'credit' : (canDebit ? 'debit' : 'transactions')),
            'operations'
          )}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
          icon={<Receipt size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Caisse & Transactions"
          description="Crédits, encaissements et historique des opérations"
          stats={[
            { label: isAdmin ? 'Recettes/jour' : 'Vos recettes/jour', value: fmtEShort(kpis.recettesJour) },
            { label: 'Transactions', value: txStats.total },
            { label: 'Crédits', value: txStats.credits },
          ]}
        />

        {/* Pancarte 2 : Réservations */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('reservations-admin', 'operations')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #534AB7 0%, #3C3489 100%)"
          icon={<Bookmark size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Réservations"
          description="Gérer les commandes, préparation et retraits"
          stats={[
            { label: 'Total', value: resaStats.total },
            { label: 'En attente', value: resaStats.pending, warning: resaStats.pending > 0 },
            { label: 'Prêtes', value: resaStats.ready },
          ]}
        />

        {/* Pancarte 3 : Alertes financières (admin uniquement) */}
        {isAdmin && (
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('alertes', 'operations')}
            isMobile={isMobile}
            gradient={anomaliesCount.critiques > 0
              ? "linear-gradient(135deg, #FF6B5C 0%, #A32D2D 100%)"
              : anomaliesCount.attentions > 0
                ? "linear-gradient(135deg, #EF9F27 0%, #BA7517 100%)"
                : "linear-gradient(135deg, #2DAA70 0%, #1A8050 100%)"}
            icon={<AlertTriangle size={isMobile ? 36 : 44} strokeWidth={2}/>}
            titre="Alertes financières"
            description={
              anomaliesCount.critiques > 0
                ? "Action urgente requise"
                : anomaliesCount.attentions > 0
                  ? "Vigilance demandée"
                  : "Tout est sous contrôle"
            }
            stats={[
              { label: 'Critiques', value: anomaliesCount.critiques, alert: anomaliesCount.critiques > 0 },
              { label: 'Attentions', value: anomaliesCount.attentions, warning: anomaliesCount.attentions > 0 },
              { label: 'Total', value: anomaliesCount.total },
            ]}
          />
        )}
        </div>
      )}

      {/* ─── Actions rapides — 3 boutons compacts ──────────────────────
          Masqué pour billetterie (déjà couvert par les 4 pancartes principales) */}
      {!isBilletterieProfile && (canCredit || canDebit || canRetrait) && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
          }}>
            ⚡ Actions rapides
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10, marginBottom: 20,
          }}>
            {canCredit && (
              <ActionCompacte
                onClick={() => onNavigate && onNavigate('credit', 'operations')}
                icon={<PlusCircle size={20}/>}
                label="Créditer"
                desc="Recharger un compte"
                color="#1A8050"
                bg="var(--green-light)"
                isMobile={isMobile}
              />
            )}
            {canDebit && (
              <ActionCompacte
                onClick={() => onNavigate && onNavigate('debit', 'operations')}
                icon={<ShoppingCart size={20}/>}
                label="Encaisser"
                desc="Vente au stand"
                color="#C5481A"
                bg="var(--coral-light)"
                isMobile={isMobile}
              />
            )}
            {canDebit && (
              <ActionCompacte
                onClick={() => onNavigate && onNavigate('prendre-commande', 'operations')}
                icon={<ClipboardList size={20}/>}
                label="Prendre commande"
                desc="Avec numéro et suivi cuisine"
                color="#185FA5"
                bg="var(--blue-light)"
                isMobile={isMobile}
              />
            )}
            {canDebit && (
              <ActionCompacte
                onClick={() => onNavigate && onNavigate('cuisine', 'operations')}
                icon={<ChefHat size={20}/>}
                label="Cuisine"
                desc="Suivi des commandes en cours"
                color="#0F6E56"
                bg="var(--green-light)"
                isMobile={isMobile}
              />
            )}
            {canDebit && (
              <ActionCompacte
                onClick={() => onNavigate && onNavigate('retrait-commande', 'operations')}
                icon={<Package size={20}/>}
                label="Retrait commande"
                desc="Remettre au client"
                color="#A87020"
                bg="var(--gold-light)"
                isMobile={isMobile}
              />
            )}
            {canRetrait && (
              <ActionCompacte
                onClick={() => onNavigate && onNavigate('retrait', 'operations')}
                icon={<Package size={20}/>}
                label="Retrait réservation"
                desc="Remettre une commande"
                color="#A87020"
                bg="var(--gold-light)"
                isMobile={isMobile}
              />
            )}
            {/* Raccourcis vers les pages publiques (écran d'affichage + borne)
                Ces 2 boutons ouvrent dans un nouvel onglet pour ne pas perdre
                la session admin courante. Visibles pour qui a `canDebit` (= staff stand). */}
            {canDebit && (
              <ActionCompacte
                onClick={() => {
                  if (!currentEventId) return
                  window.open(`/ecran?ev=${currentEventId}`, '_blank', 'noopener')
                }}
                icon={<Monitor size={20}/>}
                label="Écran public"
                desc="Affichage des numéros prêts"
                color="#185FA5"
                bg="var(--blue-light)"
                isMobile={isMobile}
              />
            )}
            {canDebit && (
              <ActionCompacte
                onClick={() => {
                  if (!currentEventId) return
                  window.open(`/borne?ev=${currentEventId}`, '_blank', 'noopener')
                }}
                icon={<ShoppingBag size={20}/>}
                label="Borne self-service"
                desc="Tablette commande client"
                color="#3C3489"
                bg="#EEEDFE"
                isMobile={isMobile}
              />
            )}
          </div>
        </>
      )}

      {/* ─── Bandeau urgence : résas en attente > 10 min ───────────────
          Masqué pour billetterie (ils ne gèrent pas les réservations) */}
      {!isBilletterieProfile && kpis.resasEnRetard > 0 && (
        <div
          onClick={() => onNavigate && onNavigate('reservations-admin', 'operations')}
          style={{
            background: 'var(--gold-light)',
            border: '1px solid var(--gold)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            marginBottom: 12,
          }}>
          <AlertTriangle size={22} style={{ color: 'var(--gold-dark)', flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-dark)' }}>
              {kpis.resasEnRetard} réservation{kpis.resasEnRetard > 1 ? 's' : ''} en attente depuis +10 min
            </div>
            <div style={{ fontSize: 11, color: 'var(--gold-dark)', opacity: 0.85, marginTop: 2 }}>
              Cliquez pour les gérer maintenant
            </div>
          </div>
          <ChevronRight size={20} style={{ color: 'var(--gold-dark)' }}/>
        </div>
      )}

      {/* ─── Bandeau positif si tout va bien (avec activité) ───────────
          Masqué pour billetterie */}
      {!isBilletterieProfile && kpis.resasEnRetard === 0 && (kpis.resasEnAttente > 0 || kpis.resasPretes > 0 || kpis.txToday > 0) && (
        <div style={{
          background: 'var(--green-light)',
          border: '1px solid var(--green)',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle size={18} style={{ color: 'var(--green-dark)', flexShrink: 0 }}/>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-dark)' }}>
            Aucune anomalie à signaler — opérations fluides.
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Pancarte principale — copie du composant de GestionArtistes
// ═══════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════
// Action compacte (boutons rapides en dessous des pancartes)
// ═══════════════════════════════════════════════════════════════════════

function ActionCompacte({ onClick, icon, label, desc, color, bg, isMobile }) {
  return (
    <button onClick={onClick}
      style={{
        background: bg,
        border: `1px solid ${color}33`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'transform .15s, box-shadow .15s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 60,
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
        <div style={{ fontSize: 14, fontWeight: 800, color, marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 11, color, opacity: 0.85 }}>{desc}</div>
      </div>
      <ChevronRight size={18} style={{ color, opacity: 0.6, flexShrink: 0 }}/>
    </button>
  )
}
