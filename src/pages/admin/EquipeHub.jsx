/**
 * pages/admin/EquipeHub.jsx — v1.1.0
 *
 * Hub centralisé : combine Équipe (staff) et Bénévoles
 * Pancartes style GestionArtistes (gradient, stats, icône)
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Users, BadgeCheck, ChevronRight } from 'lucide-react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import useAppStore  from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export default function EquipeHub({ onNavigate }) {
  const { staff } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()

  const [benevoles, setBenevoles] = useState([])

  // Chargement temps réel des bénévoles
  useEffect(() => {
    if (!currentEventId) return
    const unsub = onSnapshot(
      query(collection(db, 'events', currentEventId, 'benevoles'), orderBy('createdAt', 'desc')),
      snap => setBenevoles(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      err => console.error('Bénévoles:', err)
    )
    return unsub
  }, [currentEventId])

  // ─── Stats Équipe ───────────────────────────────────────────────────
  const staffStats = useMemo(() => {
    const total = (staff || []).length
    const byRole = {}
    ;(staff || []).forEach(s => {
      const r = s.role || 'autre'
      byRole[r] = (byRole[r] || 0) + 1
    })
    const admins = (byRole.admin || 0) + (byRole.super_admin || 0)
    const billetterie = byRole.billetterie || 0
    const stand = byRole.stand || 0
    return { total, admins, billetterie, stand }
  }, [staff])

  // ─── Stats Bénévoles ────────────────────────────────────────────────
  const benevStats = useMemo(() => {
    const total = benevoles.length
    let avecDroits = 0
    let totalDroits = 0
    let totalConso = 0
    benevoles.forEach(b => {
      const dr = (b.droits?.repas || 0) + (b.droits?.boisson || 0) + (b.droits?.eau || 0)
      const co = (b.consommation?.repas || 0) + (b.consommation?.boisson || 0) + (b.consommation?.eau || 0)
      if (dr > 0) avecDroits++
      totalDroits += dr
      totalConso += co
    })
    const restant = Math.max(0, totalDroits - totalConso)
    return { total, avecDroits, totalDroits, totalConso, restant }
  }, [benevoles])

  return (
    <div style={{ padding: '8px 4px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--marine)',
          margin: 0, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Users size={isMobile ? 24 : 28}/> Équipe & Bénévoles
        </h1>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {currentEvent?.nom || 'Aucun événement actif'}
        </div>
      </div>

      {/* Grille 2 pancartes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 16, marginBottom: 24,
      }}>
        {/* Pancarte Équipe */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('staff', 'equipe-hub')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #5EB8E4 0%, #1F2D5F 100%)"
          icon={<BadgeCheck size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Équipe"
          description="Comptes staff : admins, billetterie, stand, accès aux espaces"
          stats={[
            { label: 'Total', value: staffStats.total },
            { label: 'Admins', value: staffStats.admins },
            { label: 'Stand', value: staffStats.stand },
          ]}
        />

        {/* Pancarte Bénévoles */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('benevoles', 'equipe-hub')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #2DAA70 0%, #1A8050 100%)"
          icon={<Users size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Bénévoles"
          description="Gestion des bénévoles, droits, consommations et planning"
          stats={[
            { label: 'Total', value: benevStats.total },
            { label: 'Avec droits', value: benevStats.avecDroits },
            { label: 'Conso restante', value: benevStats.restant },
          ]}
        />
      </div>

      {/* Bandeau d'aide */}
      {benevStats.total === 0 && staffStats.total === 0 && (
        <div style={{
          padding: '14px 16px',
          background: 'var(--brand-light)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 13, color: 'var(--text)', lineHeight: 1.5,
        }}>
          💡 Commencez par <strong onClick={() => onNavigate && onNavigate('staff', 'equipe-hub')}
            style={{ color: 'var(--brand)', cursor: 'pointer', textDecoration: 'underline' }}>créer votre équipe</strong>
          {' '}puis <strong onClick={() => onNavigate && onNavigate('benevoles', 'equipe-hub')}
            style={{ color: 'var(--brand)', cursor: 'pointer', textDecoration: 'underline' }}>ajouter vos bénévoles</strong>.
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Pancarte principale — même composant que GestionArtistes
// ═══════════════════════════════════════════════════════════════════════

function PancartePrincipale({ onClick, isMobile, gradient, icon, titre, description, stats }) {
  return (
    <button onClick={onClick}
      style={{
        background: gradient, color: '#fff',
        border: 'none', borderRadius: 18,
        padding: isMobile ? 18 : 22,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 6px 24px rgba(0, 48, 72, 0.18)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: isMobile ? 180 : 220,
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 48, 72, 0.25)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 48, 72, 0.18)'
      }}>
      <div style={{
        position: 'absolute', top: '-50%', right: '-30%',
        width: '80%', height: '120%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 60%)',
        pointerEvents: 'none',
      }}/>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{
          width: isMobile ? 58 : 68, height: isMobile ? 58 : 68,
          borderRadius: 16,
          background: 'rgba(255,255,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          {icon}
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ChevronRight size={20}/>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 800, lineHeight: 1.2, marginBottom: 4 }}>
          {titre}
        </div>
        <div style={{ fontSize: isMobile ? 12 : 13, opacity: 0.92, lineHeight: 1.45 }}>
          {description}
        </div>
      </div>
      <div style={{
        marginTop: 'auto', position: 'relative',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8, paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.20)',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 16 : 19, fontWeight: 800, lineHeight: 1.1,
              color: s.alert ? '#FFE5DC' : s.warning ? '#FFE5DC' : '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.value}</div>
            <div style={{
              fontSize: 10, opacity: 0.85, marginTop: 2,
              textTransform: 'uppercase', letterSpacing: '0.03em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.label}</div>
          </div>
        ))}
      </div>
    </button>
  )
}
