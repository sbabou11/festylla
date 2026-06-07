/**
 * pages/admin/GestionArtistes.jsx — v8 debug
 *
 * Page hub "Gestion artistes" qui regroupe les fonctions liées aux artistes :
 *   - Planning (prestations, créneaux, balance, etc.)
 *   - Cachets (rémunération, décharges, suivi)
 *
 * Présentée avec 2 grandes pancartes pour un accès rapide.
 * Affiche aussi des KPIs synthétiques pour donner une vue d'ensemble.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { CalendarDays, Banknote, ChevronRight, Music2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { watchPlanning, watchCachets } from '../../firebase/service'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export default function GestionArtistes({ onNavigate }) {
  const { events, currentEventId } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()

  const [planning, setPlanning] = useState([])
  const [cachets, setCachets]   = useState([])

  useEffect(() => {
    const u1 = watchPlanning(setPlanning)
    const u2 = watchCachets(setCachets)
    return () => { u1(); u2() }
  }, [])

  // Stats Planning
  const planningStats = useMemo(() => {
    const total = planning.length
    const avecBalance = planning.filter(p => p.balanceDebut).length
    const aVenir = planning.filter(p => {
      const t = p.debut?.toDate ? p.debut.toDate().getTime() : new Date(p.debut).getTime()
      return t > Date.now()
    }).length
    return { total, avecBalance, aVenir }
  }, [planning])

  // Stats Cachets
  const cachetsStats = useMemo(() => {
    const actifs = cachets.filter(c => c.statut !== 'annule')
    const totalPrevu = actifs.reduce((s, c) => s + (Number(c.montant) || 0), 0)
    const totalPaye = actifs.filter(c => c.statut === 'paye').reduce((s, c) => s + (Number(c.montant) || 0), 0)
    const aPayer = totalPrevu - totalPaye
    const countAPayer = actifs.filter(c => c.statut === 'planifie').length
    // Artistes sans cachet : créneaux qui n'ont aucun cachet enregistré
    const creneauxAvecCachet = new Set(actifs.map(c => c.creneauId))
    const sansCachet = planning.filter(p => !creneauxAvecCachet.has(p.id)).length
    return { totalPrevu, totalPaye, aPayer, countAPayer, sansCachet }
  }, [cachets, planning])

  return (
    <div style={{ padding: '16px 12px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color: 'var(--marine)', margin: 0 }}>
          🎤 Gestion des artistes
        </h1>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {currentEvent?.nom || 'Aucun événement actif'}
        </div>
      </div>

      {/* Grille 2 pancartes : 1 colonne mobile, 2 colonnes desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 16,
        marginBottom: 24,
      }}>
        {/* Pancarte Planning */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('planning', 'gestion-artistes')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #5EB8E4 0%, #003048 100%)"
          icon={<CalendarDays size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Planning & Prestations"
          description="Créneaux artistes, horaires de balance, scènes, programmation"
          stats={[
            { label: 'Créneaux', value: planningStats.total },
            { label: 'À venir', value: planningStats.aVenir },
            { label: 'Avec balance', value: planningStats.avecBalance },
          ]}
        />

        {/* Pancarte Cachets */}
        <PancartePrincipale
          onClick={() => onNavigate && onNavigate('cachets', 'gestion-artistes')}
          isMobile={isMobile}
          gradient="linear-gradient(135deg, #D89030 0%, #C45520 100%)"
          icon={<Banknote size={isMobile ? 36 : 44} strokeWidth={2}/>}
          titre="Cachets & Décharges"
          description="Suivi des paiements, signatures, décharges, export comptable"
          stats={[
            { label: 'Total prévu', value: `${cachetsStats.totalPrevu.toFixed(0)}€` },
            { label: 'À payer', value: `${cachetsStats.aPayer.toFixed(0)}€`, alert: cachetsStats.aPayer > 0 },
            { label: 'Sans cachet', value: cachetsStats.sansCachet, warning: cachetsStats.sansCachet > 0 && planningStats.total > 0 },
          ]}
        />
      </div>

      {/* Alertes synthétiques (si quelque chose à corriger) */}
      {(cachetsStats.sansCachet > 0 || cachetsStats.countAPayer > 0) && planning.length > 0 && (
        <div style={{
          background: 'var(--gold-light)',
          border: '1px solid var(--gold)',
          borderRadius: 12,
          padding: isMobile ? 12 : 14,
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertCircle size={18} style={{ color: 'var(--gold)' }}/>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--marine)' }}>
              Points d'attention
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
            {cachetsStats.sansCachet > 0 && (
              <div>
                ⚠️ <strong>{cachetsStats.sansCachet}</strong> créneau{cachetsStats.sansCachet > 1 ? 'x' : ''} sans cachet enregistré
                {' '}— <a onClick={() => onNavigate && onNavigate('planning', 'gestion-artistes')} style={{ color: 'var(--brand)', textDecoration: 'underline', cursor: 'pointer' }}>voir le planning</a>
              </div>
            )}
            {cachetsStats.countAPayer > 0 && (
              <div>
                💰 <strong>{cachetsStats.countAPayer}</strong> cachet{cachetsStats.countAPayer > 1 ? 's' : ''} en attente de paiement
                {' '}— <a onClick={() => onNavigate && onNavigate('cachets', 'gestion-artistes')} style={{ color: 'var(--brand)', textDecoration: 'underline', cursor: 'pointer' }}>aller aux cachets</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Si tout est OK : feedback positif */}
      {planning.length > 0 && cachetsStats.sansCachet === 0 && cachetsStats.countAPayer === 0 && (
        <div style={{
          background: 'var(--green-light)',
          border: '1px solid var(--green)',
          borderRadius: 12,
          padding: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle2 size={20} style={{ color: 'var(--green)' }}/>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
              Tout est en ordre
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Tous les artistes ont leur cachet enregistré et payé.
            </div>
          </div>
        </div>
      )}

      {/* Si aucun créneau : message d'aide */}
      {planning.length === 0 && (
        <div style={{
          background: 'var(--bg2)',
          border: '1px dashed var(--border2)',
          borderRadius: 12,
          padding: 24, textAlign: 'center',
        }}>
          <Music2 size={32} style={{ color: 'var(--muted)', marginBottom: 8 }}/>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--marine)', marginBottom: 4 }}>
            Aucun artiste programmé
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Commencez par créer des créneaux dans le planning.
          </div>
          <button onClick={() => onNavigate && onNavigate('planning', 'gestion-artistes')}
            style={{
              padding: '10px 16px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
              WebkitTapHighlightColor: 'transparent',
            }}>
            Ouvrir le planning
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Composant Pancarte ────────────────────────────────────────────
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
