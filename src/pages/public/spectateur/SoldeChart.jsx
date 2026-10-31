/**
 * pages/public/spectateur/SoldeChart.jsx — graphe interactif de l'évolution du solde.
 * Déplacé tel quel depuis SoldePage.jsx (lot 3).
 */
import React, { useEffect } from 'react'
import { BRAND, AMBER, RED, GREEN, GREEN_L } from './colors'

// ── Composant graphe interactif ───────────────────────────────
function SoldeChart({ timeline, maxBal, hoverIdx, setHoverIdx, zoom, setZoom, fmt }) {
  const W = 50  // px par point
  const H = 160 // hauteur SVG
  const PL = 52 // padding left (axe Y)
  const PR = 12
  const PT = 20 // padding top
  const PB = 30 // padding bottom
  const innerH = H - PT - PB
  const innerW = (n) => Math.max(n * W, 280)
  const n = timeline.length

  if (n < 2) return (
    <div style={{ textAlign:'center', padding:24, color:'var(--muted)', fontSize:13 }}>
      Au moins 2 transactions nécessaires pour afficher le graphe
    </div>
  )

  const totalW = PL + innerW(n) + PR
  const minBal = Math.min(...timeline.map(t => t.balanceAfter), 0)
  const range  = maxBal - minBal || 1
  const yOf    = (val) => PT + innerH - ((val - minBal) / range) * innerH

  // Niveaux de grille
  const gridLevels = 4
  const gridVals = Array.from({length: gridLevels + 1}, (_, i) =>
    minBal + (range / gridLevels) * i
  )

  const cx = (i) => PL + i * W + W / 2

  // Points de la courbe
  const points = timeline.map((t, i) => `${cx(i)},${yOf(t.balanceAfter)}`).join(' ')

  // Aire sous la courbe
  const areaPoints = `${cx(0)},${PT + innerH} ${points} ${cx(n-1)},${PT + innerH}`

  const GREEN  = '#065f46'
  const GREEN_L= '#d1fae5'
  const RED    = '#A32D2D'
  const BRAND  = '#1a6b7a'
  const AMBER  = '#BA7517'

  const typeColor = (type) =>
    type === 'credit' ? GREEN :
    type === 'annulation' ? '#94a3b8' :
    RED

  const svgContent = (
    <svg
      width={totalW}
      height={H}
      viewBox={`0 0 ${totalW} ${H}`}
      style={{ display:'block', minWidth: totalW }}
    >
      {/* Aire sous la courbe */}
      <polygon
        points={areaPoints}
        fill={BRAND} opacity="0.08"
      />

      {/* Lignes de grille horizontales + labels axe Y */}
      {gridVals.map((val, i) => (
        <g key={i}>
          <line
            x1={PL} y1={yOf(val)} x2={totalW - PR} y2={yOf(val)}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3"
          />
          <text x={PL - 6} y={yOf(val) + 4} textAnchor="end"
            fontSize="10" fill="#94a3b8" fontFamily="system-ui">
            {(val / 100).toFixed(0)}€
          </text>
        </g>
      ))}

      {/* Ligne de base (0€) */}
      <line
        x1={PL} y1={yOf(0)} x2={totalW - PR} y2={yOf(0)}
        stroke="#cbd5e1" strokeWidth="1.5"
      />

      {/* Courbe principale */}
      <polyline
        fill="none" stroke={BRAND} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round"
        points={points}
      />

      {/* Points interactifs */}
      {timeline.map((t, i) => {
        const isHover = hoverIdx === i
        const col = typeColor(t.type)
        return (
          <g key={i}>
            {/* Zone de touch/hover élargie */}
            <rect
              x={cx(i) - W/2} y={PT} width={W} height={innerH + PB}
              fill="transparent"
              style={{ cursor:'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchStart={() => setHoverIdx(i)}
              onTouchEnd={() => setTimeout(() => setHoverIdx(null), 2000)}
            />
            {/* Ligne verticale au survol */}
            {isHover && (
              <line
                x1={cx(i)} y1={PT} x2={cx(i)} y2={PT + innerH}
                stroke={col} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"
              />
            )}
            {/* Point */}
            <circle
              cx={cx(i)} cy={yOf(t.balanceAfter)}
              r={isHover ? 7 : 5}
              fill={col} stroke="#fff" strokeWidth="2"
              style={{ transition:'r .1s' }}
            />
          </g>
        )
      })}

      {/* Tooltip au survol */}
      {hoverIdx !== null && (() => {
        const t   = timeline[hoverIdx]
        const x   = cx(hoverIdx)
        const y   = yOf(t.balanceAfter)
        const col = typeColor(t.type)
        const TW  = 120
        const TH  = 52
        const tx  = Math.min(Math.max(x - TW/2, PL), totalW - PR - TW)
        const ty  = y - TH - 12 < PT ? y + 14 : y - TH - 12
        return (
          <g>
            <rect x={tx} y={ty} width={TW} height={TH}
              rx="8" fill="white" stroke={col} strokeWidth="1.5"
              filter="url(#shadow)"
            />
            <text x={tx + TW/2} y={ty + 16} textAnchor="middle"
              fontSize="11" fontWeight="700" fill={col} fontFamily="system-ui">
              {t.type === 'credit' ? '+' : t.type === 'annulation' ? '—' : '−'}{(t.montant||0)/100 < 0.005 ? '0.00' : ((t.montant||0)/100).toFixed(2)}€
            </text>
            <text x={tx + TW/2} y={ty + 30} textAnchor="middle"
              fontSize="10" fill="#64748b" fontFamily="system-ui">
              Solde après : {(t.balanceAfter/100).toFixed(2)}€
            </text>
            <text x={tx + TW/2} y={ty + 45} textAnchor="middle"
              fontSize="9" fill="#94a3b8" fontFamily="system-ui">
              {t.date}{t.heure ? ' · '+t.heure : ''}
            </text>
          </g>
        )
      })()}

      {/* Filtre ombre pour tooltip */}
      <defs>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12"/>
        </filter>
      </defs>

      {/* Labels axe X (dates) — afficher 1 sur N pour éviter surcharge */}
      {timeline.map((t, i) => {
        const skip = n > 10 ? Math.ceil(n / 8) : 1
        if (i % skip !== 0 && i !== n - 1) return null
        return (
          <text key={i} x={cx(i)} y={H - 6} textAnchor="middle"
            fontSize="9" fill="#94a3b8" fontFamily="system-ui">
            {(t.date||'').slice(0,5)}
          </text>
        )
      })}
    </svg>
  )

  return (
    <>
      {/* Bouton agrandir */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
        <button onClick={() => setZoom(true)}
          style={{ fontSize:11, color:'var(--muted)', background:'none', border:'0.5px solid var(--border)', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'system-ui' }}>
          ⛶ Agrandir
        </button>
      </div>

      {/* Graphe scrollable */}
      <div style={{ overflowX:'auto', background:'var(--bg2)', borderRadius:10, padding:'10px 4px 4px' }}>
        {svgContent}
      </div>

      {/* Légende */}
      <div style={{ display:'flex', gap:14, marginTop:8, fontSize:11, color:'var(--muted)', flexWrap:'wrap' }}>
        <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:GREEN, marginRight:4 }}/>Recharge</span>
        <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:RED, marginRight:4 }}/>Dépense</span>
        <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#94a3b8', marginRight:4 }}/>Annulation</span>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, fontStyle:'italic' }}>
        💡 Touchez un point pour voir le détail
      </div>

      {/* Modale zoom plein écran */}
      {zoom && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'var(--bg)', display:'flex', flexDirection:'column', padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>📈 Évolution du solde</div>
            <button onClick={() => setZoom(false)}
              style={{ padding:'6px 16px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'system-ui' }}>
              Fermer ✕
            </button>
          </div>
          <div style={{ flex:1, overflowX:'auto', overflowY:'auto', background:'var(--bg2)', borderRadius:12, padding:12 }}>
            <svg
              width={totalW * 1.4}
              height={H * 2}
              viewBox={`0 0 ${totalW} ${H}`}
              style={{ display:'block', width:'100%', height:'auto', minWidth: totalW }}
            >
              {/* même contenu que le SVG inline mais en plus grand via viewBox scale */}
              {/* Grille */}
              {gridVals.map((val, i) => (
                <g key={i}>
                  <line x1={PL} y1={yOf(val)} x2={totalW-PR} y2={yOf(val)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3"/>
                  <text x={PL-6} y={yOf(val)+4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="system-ui">
                    {(val/100).toFixed(0)}€
                  </text>
                </g>
              ))}
              <polygon points={areaPoints} fill={BRAND} opacity="0.08"/>
              <line x1={PL} y1={yOf(0)} x2={totalW-PR} y2={yOf(0)} stroke="#cbd5e1" strokeWidth="1.5"/>
              <polyline fill="none" stroke={BRAND} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={points}/>
              {timeline.map((t,i) => {
                const isHover = hoverIdx === i
                const col = typeColor(t.type)
                return (
                  <g key={i}>
                    <rect x={cx(i)-W/2} y={PT} width={W} height={innerH+PB} fill="transparent" style={{ cursor:'pointer' }}
                      onMouseEnter={()=>setHoverIdx(i)} onMouseLeave={()=>setHoverIdx(null)}
                      onTouchStart={()=>setHoverIdx(i)} onTouchEnd={()=>setTimeout(()=>setHoverIdx(null),2000)}/>
                    {isHover && <line x1={cx(i)} y1={PT} x2={cx(i)} y2={PT+innerH} stroke={col} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"/>}
                    <circle cx={cx(i)} cy={yOf(t.balanceAfter)} r={isHover?7:5} fill={col} stroke="#fff" strokeWidth="2"/>
                  </g>
                )
              })}
              {hoverIdx !== null && (() => {
                const t = timeline[hoverIdx]
                const x = cx(hoverIdx)
                const y = yOf(t.balanceAfter)
                const col = typeColor(t.type)
                const TW2=130; const TH2=56
                const tx = Math.min(Math.max(x-TW2/2,PL), totalW-PR-TW2)
                const ty = y-TH2-12 < PT ? y+14 : y-TH2-12
                return (
                  <g>
                    <rect x={tx} y={ty} width={TW2} height={TH2} rx="8" fill="white" stroke={col} strokeWidth="1.5" filter="url(#shadow2)"/>
                    <text x={tx+TW2/2} y={ty+17} textAnchor="middle" fontSize="12" fontWeight="700" fill={col} fontFamily="system-ui">
                      {t.type==='credit'?'+':t.type==='annulation'?'—':'−'}{((t.montant||0)/100).toFixed(2)}€
                    </text>
                    <text x={tx+TW2/2} y={ty+32} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="system-ui">
                      Solde après : {(t.balanceAfter/100).toFixed(2)}€
                    </text>
                    <text x={tx+TW2/2} y={ty+47} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">
                      {t.date}{t.heure?' · '+t.heure:''}
                    </text>
                  </g>
                )
              })()}
              <defs>
                <filter id="shadow2" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12"/>
                </filter>
              </defs>
              {timeline.map((t,i) => {
                const skip = n>10 ? Math.ceil(n/8) : 1
                if (i%skip!==0 && i!==n-1) return null
                return <text key={i} x={cx(i)} y={H-6} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">{(t.date||'').slice(0,5)}</text>
              })}
            </svg>
          </div>
          <div style={{ display:'flex', gap:14, marginTop:10, fontSize:12, color:'var(--muted)', flexWrap:'wrap' }}>
            <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:GREEN, marginRight:4 }}/>Recharge</span>
            <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:RED, marginRight:4 }}/>Dépense</span>
            <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:'50%', background:'#94a3b8', marginRight:4 }}/>Annulation</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, fontStyle:'italic' }}>💡 Touchez un point pour voir le détail</div>
        </div>
      )}
    </>
  )
}

export default SoldeChart
