/**
 * components/PancartePrincipale.jsx
 * Grande carte d'accès en dégradé (hub Operations, Finances...).
 * Extrait pour réutilisation. */
import React from 'react'
import { ChevronRight } from 'lucide-react'

function PancartePrincipale({ onClick, isMobile, gradient, icon, titre, description, stats }) {
  return (
    <button onClick={onClick}
      style={{
        background: gradient,
        color: '#fff',
        border: 'none',
        borderRadius: 18,
        padding: isMobile ? 18 : 22,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '0 6px 24px rgba(0, 48, 72, 0.18)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        WebkitTapHighlightColor: 'transparent',
        minHeight: isMobile ? 180 : 220,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 48, 72, 0.25)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 48, 72, 0.18)'
      }}>
      {/* Effet brillance d'arrière-plan */}
      <div style={{
        position: 'absolute',
        top: '-50%', right: '-30%',
        width: '80%', height: '120%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 60%)',
        pointerEvents: 'none',
      }}/>

      {/* Header : icône + flèche */}
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

      {/* Titre + description */}
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 800, lineHeight: 1.2, marginBottom: 4 }}>
          {titre}
        </div>
        <div style={{ fontSize: isMobile ? 12 : 13, opacity: 0.92, lineHeight: 1.45 }}>
          {description}
        </div>
      </div>

      {/* Stats en bas — 3 colonnes égales */}
      <div style={{
        marginTop: 'auto',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.20)',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 16 : 19, fontWeight: 800, lineHeight: 1.1,
              color: s.alert ? '#FFE5DC' : s.warning ? '#FFE5DC' : '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.value}
            </div>
            <div style={{
              fontSize: 10, opacity: 0.85, marginTop: 2,
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

export default PancartePrincipale
