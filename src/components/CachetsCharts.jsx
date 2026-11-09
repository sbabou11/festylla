/**
 * components/CachetsCharts.jsx — v8 debug
 *
 * Visualisations graphiques pour la page Cachets.
 * Tout en SVG maison (pas de dépendance externe) pour rester léger.
 *
 * Composants :
 *   - PrevuVsReelChart : barre horizontale comparant prévu vs payé
 *   - ModePaiementDonut : donut chart par mode de paiement
 *   - TopArtistesChart  : top 5 des cachets les plus élevés
 */

import React, { useMemo } from 'react'

// Helper format euro
const fmtE = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

// ═══════════════════════════════════════════════════════════════════════
// 1. PRÉVU vs RÉEL — Barre horizontale empilée
// ═══════════════════════════════════════════════════════════════════════
export function PrevuVsReelChart({ cachets, isMobile }) {
  const data = useMemo(() => {
    const actifs = cachets.filter(c => c.statut !== 'annule')
    const prevu = actifs.reduce((s, c) => s + (Number(c.montant) || 0), 0)
    const paye  = actifs.filter(c => c.statut === 'paye').reduce((s, c) => s + (Number(c.montant) || 0), 0)
    const aPayer = prevu - paye
    const pctPaye = prevu > 0 ? (paye / prevu) * 100 : 0
    return { prevu, paye, aPayer, pctPaye }
  }, [cachets])

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 12, padding: isMobile ? 14 : 18,
      border: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 14,
      }}>
        📊 Prévisionnel vs Réel
      </div>

      {/* Chiffres clés */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
        gap: 12, marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prévu (total)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--marine)' }}>{fmtE(data.prevu)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Versé (réel)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{fmtE(data.paye)}</div>
        </div>
        <div style={{ gridColumn: isMobile ? '1 / -1' : 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reste à payer</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: data.aPayer > 0 ? 'var(--gold)' : 'var(--muted)' }}>{fmtE(data.aPayer)}</div>
        </div>
      </div>

      {/* Barre de progression */}
      {data.prevu > 0 ? (
        <>
          <div style={{
            position: 'relative', width: '100%', height: 28,
            background: 'var(--bg2)', borderRadius: 8, overflow: 'hidden',
            border: '1px solid var(--border)',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${data.pctPaye}%`,
              background: 'linear-gradient(90deg, #2E8B57 0%, #3FBB72 100%)',
              transition: 'width 0.4s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              paddingRight: data.pctPaye > 10 ? 8 : 0,
            }}>
              {data.pctPaye > 10 && (
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>
                  {data.pctPaye.toFixed(0)}%
                </span>
              )}
            </div>
            {data.pctPaye <= 10 && data.pctPaye > 0 && (
              <span style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 11, fontWeight: 700, color: 'var(--marine)',
              }}>
                {data.pctPaye.toFixed(0)}% versés
              </span>
            )}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 6, fontSize: 10, color: 'var(--muted)',
          }}>
            <span>0 €</span>
            <span>{fmtE(data.prevu)}</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
          Aucun cachet enregistré pour le moment.
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// 2. RÉPARTITION par mode de paiement — Donut SVG
// ═══════════════════════════════════════════════════════════════════════
export function ModePaiementDonut({ cachets, isMobile }) {
  const data = useMemo(() => {
    const actifs = cachets.filter(c => c.statut !== 'annule')
    const groupes = { especes: 0, virement: 0, cheque: 0 }
    actifs.forEach(c => {
      const mode = c.modePaiement || 'especes'
      groupes[mode] = (groupes[mode] || 0) + (Number(c.montant) || 0)
    })
    const total = groupes.especes + groupes.virement + groupes.cheque
    return { ...groupes, total }
  }, [cachets])

  // Couleurs cohérentes avec la page Cachets
  const colors = {
    especes:  { color: '#D89030', label: '💵 Espèces',  bg: 'rgba(216,144,48,0.12)' },
    virement: { color: '#009090', label: '🏦 Virement', bg: 'rgba(0,144,144,0.10)' },
    cheque:   { color: 'var(--marine)', label: '📝 Chèque',   bg: 'rgba(0,48,72,0.10)' },
  }

  // Création des arcs du donut
  const size = isMobile ? 140 : 160
  const strokeW = 28
  const radius = (size - strokeW) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  // Calcule les segments cumulés
  let cumulativePct = 0
  const segments = ['especes', 'virement', 'cheque']
    .filter(k => data[k] > 0)
    .map(k => {
      const pct = data.total > 0 ? data[k] / data.total : 0
      const dashLen = pct * circumference
      const dashOffset = -cumulativePct * circumference
      cumulativePct += pct
      return { k, pct, dashLen, dashOffset, montant: data[k] }
    })

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 12, padding: isMobile ? 14 : 18,
      border: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 14,
      }}>
        🥧 Répartition par mode
      </div>

      {data.total > 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center', gap: isMobile ? 14 : 20,
        }}>
          {/* Donut SVG */}
          <svg width={size} height={size} style={{ flexShrink: 0 }}>
            <circle cx={cx} cy={cy} r={radius}
              fill="none" stroke="var(--bg2)" strokeWidth={strokeW}/>
            {segments.map(seg => (
              <circle key={seg.k} cx={cx} cy={cy} r={radius}
                fill="none" stroke={colors[seg.k].color} strokeWidth={strokeW}
                strokeDasharray={`${seg.dashLen} ${circumference - seg.dashLen}`}
                strokeDashoffset={seg.dashOffset}
                transform={`rotate(-90 ${cx} ${cy})`}/>
            ))}
            {/* Centre du donut : total */}
            <text x={cx} y={cy - 4} textAnchor="middle"
              style={{ fontSize: 18, fontWeight: 800, fill: 'var(--marine)' }}>
              {fmtE(data.total)}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle"
              style={{ fontSize: 10, fill: 'var(--muted)' }}>
              Total prévu
            </text>
          </svg>

          {/* Légende */}
          <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
            {Object.entries(colors).map(([k, info]) => {
              const value = data[k] || 0
              const pct = data.total > 0 ? (value / data.total) * 100 : 0
              return (
                <div key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: info.color, flexShrink: 0,
                  }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--marine)' }}>
                      {info.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {pct.toFixed(0)}% du total
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: info.color }}>
                    {fmtE(value)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
          Aucun cachet à représenter.
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// 3. TOP ARTISTES — Barres horizontales
// ═══════════════════════════════════════════════════════════════════════
export function TopArtistesChart({ cachets, isMobile }) {
  const data = useMemo(() => {
    const actifs = cachets.filter(c => c.statut !== 'annule')
    // Regroupe par artiste (somme des montants tous statuts confondus)
    const parArtiste = {}
    actifs.forEach(c => {
      const nom = (c.artiste || 'Sans nom').trim()
      if (!parArtiste[nom]) parArtiste[nom] = { nom, total: 0, paye: 0 }
      parArtiste[nom].total += Number(c.montant) || 0
      if (c.statut === 'paye') parArtiste[nom].paye += Number(c.montant) || 0
    })
    return Object.values(parArtiste)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [cachets])

  const maxTotal = Math.max(...data.map(d => d.total), 1)

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 12, padding: isMobile ? 14 : 18,
      border: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 14,
      }}>
        🏆 Top 5 artistes (par montant)
      </div>

      {data.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.map((a, i) => {
            const pctTotal = (a.total / maxTotal) * 100
            const pctPaye = a.total > 0 ? (a.paye / a.total) * 100 : 0
            return (
              <div key={a.nom + i}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, marginBottom: 4,
                }}>
                  <span style={{ color: 'var(--marine)', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: isMobile ? '60%' : '70%' }}>
                    {a.nom}
                  </span>
                  <span style={{ color: 'var(--marine)', fontWeight: 700, flexShrink: 0 }}>
                    {fmtE(a.total)}
                  </span>
                </div>
                {/* Barre avec partie payée en vert + reste en gold pâle */}
                <div style={{
                  position: 'relative', width: '100%', height: 14,
                  background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden',
                }}>
                  {/* Barre principale (total proportionnel) */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${pctTotal}%`,
                    background: 'var(--gold-light)',
                    borderRight: pctPaye < 100 && pctTotal > 5 ? '1px solid var(--gold)' : 'none',
                  }}/>
                  {/* Partie payée en superposition (verte) */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${(a.paye / maxTotal) * 100}%`,
                    background: 'var(--green)',
                  }}/>
                </div>
                {a.paye < a.total && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {fmtE(a.paye)} versés · {fmtE(a.total - a.paye)} à payer
                  </div>
                )}
              </div>
            )
          })}
          {/* Légende */}
          <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}/>Versé</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--gold-light)', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}/>Prévu (non versé)</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
          Aucun cachet enregistré.
        </div>
      )}
    </div>
  )
}
