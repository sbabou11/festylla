/**
 * pages/admin/SpectateursHub.jsx — v1.1.0
 *
 * Hub centralisé : combine Spectateurs et QR code entrée
 * Pancartes style GestionArtistes
 */

import React, { useMemo } from 'react'
import { Users, QrCode, ChevronRight } from 'lucide-react'
import useAppStore  from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export default function SpectateursHub({ onNavigate }) {
  const { spectateurs } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()

  // ─── Stats spectateurs ──────────────────────────────────────────────
  const specStats = useMemo(() => {
    const list = spectateurs || []
    const total = list.length
    const totalSolde = list.reduce((s, sp) => s + (Number(sp.solde) || 0), 0) / 100
    const actifs = list.filter(sp => (sp.solde || 0) > 0).length
    const sansSolde = list.filter(sp => (sp.solde || 0) === 0).length
    return { total, totalSolde, actifs, sansSolde }
  }, [spectateurs])

  // ─── Lien public d'inscription (lié à l'événement) ──────────────────
  const inscriptionUrl = currentEventId
    ? `${window.location.origin}/?ev=${currentEventId}`
    : window.location.origin + '/'

  return (
    <div style={{ padding: '8px 4px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--marine)',
          margin: 0, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Users size={isMobile ? 24 : 28}/> Spectateurs & Accès
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
        {/* Pancarte Spectateurs */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('spectateurs', 'spectateurs-hub')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #14B5B5 0%, #009090 100%)"
          icon={<Users size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Spectateurs"
          description="Liste, soldes, recherche, impression accès papier"
          stats={[
            { label: 'Total', value: specStats.total },
            { label: 'Actifs', value: specStats.actifs },
            { label: 'Solde total', value: `${specStats.totalSolde.toFixed(0)}€` },
          ]}
        />

        {/* Pancarte QR code entrée */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('qr-entree', 'spectateurs-hub')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #D89030 0%, #A87020 100%)"
          icon={<QrCode size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="QR code d'inscription"
          description="QR à afficher à l'entrée pour que les spectateurs s'inscrivent"
          stats={[
            { label: 'Lien public', value: '✓' },
            { label: 'Imprimable', value: '✓' },
            { label: 'Modifiable', value: '✓' },
          ]}
        />
      </div>

      {/* Mini-aperçu du lien public */}
      <div style={{
        background: 'var(--bg2)',
        border: '0.5px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Lien public d'inscription
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text)', fontFamily: 'monospace',
            marginTop: 2, wordBreak: 'break-all',
          }}>
            {inscriptionUrl}
          </div>
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(inscriptionUrl)
              .then(() => alert('Lien copié dans le presse-papier'))
              .catch(() => {})
          }}
          style={{
            padding: '8px 14px',
            background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
            flexShrink: 0,
          }}>
          📋 Copier
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Pancarte principale — même composant
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
        }}>{icon}</div>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ChevronRight size={20}/>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 800, lineHeight: 1.2, marginBottom: 4 }}>{titre}</div>
        <div style={{ fontSize: isMobile ? 12 : 13, opacity: 0.92, lineHeight: 1.45 }}>{description}</div>
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
