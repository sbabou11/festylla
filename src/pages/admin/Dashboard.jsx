/**
 * pages/admin/Dashboard.jsx — refonte Maison Ylla
 * KPI cards colorées par catégorie, transactions avec icônes circulaires
 */
import React from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import { computeKPIs } from '../../utils/kpis'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Users, Wallet, ShoppingCart, Bookmark } from 'lucide-react'

export default function Dashboard({ onNavigate }) {
  const { spectateurs, reservations, logs, menu, theme } = useAppStore()
  const { isMobile } = useBreakpoint()

  const allTx = logs || []
  const {
    totalSoldes, totalVentes, resaPending, resaReady, activeResas,
  } = computeKPIs({ spectateurs, reservations, logs: allTx, menu })
  const specMap     = Object.fromEntries(spectateurs.map(s => [s.id, s.nom]))
  const recentTx    = [...allTx]
    .sort((a,b) => {
      const ta = a.createdAt?.seconds || new Date(a.timestamp||0).getTime()/1000
      const tb = b.createdAt?.seconds || new Date(b.timestamp||0).getTime()/1000
      return tb - ta
    })
    .filter(t => t.type !== 'annulation' || (t.montant||0) > 0)
    .slice(0, 8)
    .map(t => ({ ...t, snom: t.benevoleNom || specMap[t.specId] || t.specNom || '—' }))

  // KPI cards — chaque catégorie a sa couleur Maison Ylla
  const stats = [
    {
      label: 'Spectateurs',
      value: spectateurs.length,
      icon: Users,
      bg: 'var(--brand-light)',
      iconBg: 'var(--brand)',
      iconColor: theme.isDark ? '#002438' : '#fff',
      textColor: theme.isDark ? '#5FD4D4' : 'var(--brand-dark)',
      borderColor: theme.isDark ? 'rgba(20,181,181,0.30)' : 'transparent',
    },
    {
      label: 'Soldes',
      value: fmt(totalSoldes),
      icon: Wallet,
      bg: 'var(--green-light)',
      iconBg: 'var(--green)',
      iconColor: theme.isDark ? '#002438' : '#fff',
      textColor: theme.isDark ? 'var(--green-dark)' : 'var(--green-dark)',
      borderColor: theme.isDark ? 'rgba(20,181,140,0.30)' : 'transparent',
    },
    {
      label: 'Ventes',
      value: fmt(totalVentes),
      icon: ShoppingCart,
      bg: 'var(--coral-light)',
      iconBg: 'var(--coral)',
      iconColor: theme.isDark ? '#2A1810' : '#fff',
      textColor: theme.isDark ? 'var(--coral-dark)' : 'var(--coral-dark)',
      borderColor: theme.isDark ? 'rgba(255,138,92,0.30)' : 'transparent',
    },
    {
      label: 'Réservations',
      value: resaPending + resaReady,
      icon: Bookmark,
      bg: 'var(--gold-light)',
      iconBg: 'var(--gold)',
      iconColor: theme.isDark ? '#2A1810' : '#fff',
      textColor: theme.isDark ? 'var(--gold-dark)' : 'var(--gold-dark)',
      borderColor: theme.isDark ? 'rgba(240,176,64,0.30)' : 'transparent',
      sub: resaReady > 0 ? `${resaReady} prête${resaReady>1?'s':''}` : resaPending>0 ? `${resaPending} en attente` : null,
    },
  ]

  const txStyle = (type) => {
    if (type === 'credit')                                       return { bg: 'var(--green-light)',  color: 'var(--green-dark)',  icon: '€', sign: '+' }
    if (type === 'reservation' || type === 'benev-reservation')  return { bg: 'var(--gold-light)',   color: 'var(--gold-dark)',   icon: '⏳', sign: ''  }
    if (type === 'retrait'     || type === 'benev-retrait')      return { bg: 'var(--brand-light)',  color: 'var(--brand-dark)',  icon: '🎁', sign: ''  }
    if (type === 'benev-annulation')                             return { bg: 'var(--purple-light)', color: 'var(--purple)',      icon: '↩', sign: ''  }
    if (type === 'debit')                                        return { bg: 'var(--coral-light)',  color: 'var(--coral-dark)',  icon: '€', sign: '−' }
    return { bg: 'var(--red-light)', color: 'var(--red-dark)', icon: '€', sign: '−' }
  }

  return (
    <div>
      {/* Bannière */}
      {theme.bannerSrc && (
        <div style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden', height: isMobile ? 60 : 100, marginBottom: 20 }}>
          <img src={theme.bannerSrc} alt="Bannière" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} style={{
              background: s.bg,
              borderRadius: 'var(--radius-lg)',
              padding: '16px 18px',
              border: `0.5px solid ${s.borderColor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: s.textColor,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>{s.label}</span>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: s.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={15} style={{ color: s.iconColor }}/>
                </div>
              </div>
              <div style={{
                fontSize: 24, fontWeight: 800,
                color: theme.isDark ? 'var(--text)' : 'var(--marine)',
                lineHeight: 1,
              }}>{s.value}</div>
              {s.sub && (
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  color: s.textColor,
                  marginTop: 4,
                }}>{s.sub}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Deux colonnes : réservations + transactions */}
      <div className="grid-2">

        {/* Réservations actives */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Réservations en cours</div>
            {activeResas.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {activeResas.filter(r=>!r.isBenev).length} spectateur{activeResas.filter(r=>!r.isBenev).length>1?'s':''}
                {activeResas.filter(r=>r.isBenev).length>0 && ` · ${activeResas.filter(r=>r.isBenev).length} bénévole${activeResas.filter(r=>r.isBenev).length>1?'s':''}`}
              </div>
            )}
          </div>
          {activeResas.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Aucune réservation
            </div>
          ) : (
            <div style={{ padding: '8px 10px' }}>
              {activeResas.slice(0,6).map(r => {
                const isReady = r.status === 'ready'
                const bg = isReady ? 'var(--green-light)' : 'var(--gold-light)'
                const statusColor = isReady ? 'var(--green-dark)' : r.status === 'processing' ? 'var(--purple)' : 'var(--gold-dark)'
                return (
                  <div key={r.id} style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: bg,
                    border: theme.isDark ? `0.5px solid ${isReady ? 'rgba(20,181,140,0.30)' : 'rgba(240,176,64,0.30)'}` : 'none',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.benevoleNom || r.specNom || '—'}
                        {r.isBenev && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--brand-light)', color: 'var(--brand-dark)', fontWeight: 700 }}>Bénévole</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(r.items||[]).map(i=>`${i.nom}${i.qty>1?` ×${i.qty}`:''}`).join(' · ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: statusColor, marginBottom: 2 }}>
                        {isReady ? '✓ Prête' : r.status === 'processing' ? 'En prépa.' : 'En attente'}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{r.isBenev ? '—' : fmt(r.total||0)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Dernières transactions */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Dernières transactions</div>
            {recentTx.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{allTx.length} au total</div>
            )}
          </div>
          {recentTx.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Aucune transaction
            </div>
          ) : (
            <div style={{ padding: '8px 10px' }}>
              {recentTx.map((t,i) => {
                const s = txStyle(t.type)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 8, marginBottom: 2 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: s.bg, fontSize: 13, fontWeight: 800, color: s.color,
                    }}>
                      {s.sign}{s.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.snom} · {t.heure || t.date}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, flexShrink: 0, color: s.color }}>
                      {s.sign}{fmt(t.montant||0)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
