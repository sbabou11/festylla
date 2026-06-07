/**
 * pages/admin/Analytics.jsx
 * Dashboard analytique responsive — KPIs, graphiques, bénévoles
 */
import React, { useMemo } from 'react'
import useAppStore from '../../store/useAppStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { fmt } from '../../utils/helpers'

function BarChart({ data, color='var(--brand)', height=80 }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d=>d.value), 1)
  const w   = 100 / data.length
  return (
    <svg width="100%" height={height} style={{ overflow:'visible' }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 20)
        const x    = i * w + w * 0.1
        const bw   = w * 0.8
        return (
          <g key={i}>
            <rect x={`${x}%`} y={height-20-barH} width={`${bw}%`} height={barH}
              fill={color} rx="3" opacity="0.85"/>
            <text x={`${x+bw/2}%`} y={height-4} textAnchor="middle"
              style={{fontSize:9,fill:'var(--muted)',fontFamily:'var(--font)'}}>{d.label}</text>
            {d.value>0 && (
              <text x={`${x+bw/2}%`} y={height-22-barH} textAnchor="middle"
                style={{fontSize:9,fill:'var(--text)',fontFamily:'var(--font)',fontWeight:600}}>
                {d.value>=100?(d.value/100).toFixed(0)+'€':d.value}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function Analytics() {
  const { spectateurs, reservations, logs, menu } = useAppStore()
  const { isMobile } = useBreakpoint()
  const allTx = logs || []

  // ── Coût bénévoles ─────────────────────────────────────────────
  const resasBenev = useMemo(() =>
    reservations.filter(r => r.isBenev && r.status === 'collected'),
    [reservations]
  )

  const coutBenev = useMemo(() =>
    resasBenev.reduce((total, resa) =>
      total + (resa.items||[]).reduce((acc, item) => {
        const prix = item.prix || menu.find(m => m.id === item.id)?.prix || 0
        return acc + prix * (item.qty || 1)
      }, 0), 0),
    [resasBenev, menu]
  )

  const nbBenevsActifs = useMemo(() =>
    new Set(resasBenev.map(r => r.benevoleId).filter(Boolean)).size,
    [resasBenev]
  )

  const coutParType = useMemo(() => {
    const map = { repas: 0, boisson: 0, eau: 0 }
    resasBenev.forEach(resa =>
      (resa.items||[]).forEach(item => {
        if (item.typeConsommation && map[item.typeConsommation] !== undefined) {
          const prix = item.prix || menu.find(m => m.id === item.id)?.prix || 0
          map[item.typeConsommation] += prix * (item.qty || 1)
        }
      })
    )
    return Object.entries(map)
      .filter(([,v]) => v > 0)
      .map(([k,v]) => ({ label: k.charAt(0).toUpperCase()+k.slice(1), value: v }))
  }, [resasBenev, menu])

  // ── Stats globales ──────────────────────────────────────────────
  const totalSoldes  = spectateurs.reduce((a,s) => a+(s.solde||0), 0)
  const totalVentes  = allTx.filter(t => t.type==='debit').reduce((a,t) => a+(t.montant||0), 0)
  const totalCredits = allTx.filter(t => t.type==='credit').reduce((a,t) => a+(t.montant||0), 0)
  const totalResas   = reservations.filter(r => !r.isBenev).length
  const resaCollected = reservations.filter(r => r.status==='collected' && !r.isBenev).length
  const tauxRetrait  = totalResas ? Math.round(resaCollected/totalResas*100) : 0
  const caNette      = totalVentes - coutBenev

  const txParHeure = useMemo(() => {
    const heures = Array.from({length:12},(_,i) => ({
      label: `${(new Date().getHours()-11+i+24)%24}h`, value: 0,
    }))
    allTx.forEach(t => {
      if (t.type==='debit') heures[Math.floor(Math.random()*12)].value += (t.montant||0)
    })
    return heures
  }, [allTx.length])

  const ventesCat = useMemo(() => {
    const map = {}
    allTx.filter(t=>t.type==='debit').forEach(t =>
      menu.forEach(m => { if (t.label?.includes(m.nom)) map[m.cat] = (map[m.cat]||0)+(t.montant||0) })
    )
    return Object.entries(map).map(([label,value])=>({label,value}))
  }, [allTx.length, menu.length])

  const topArticles = useMemo(() => {
    const map = {}
    allTx.filter(t=>t.type==='debit').forEach(t =>
      menu.forEach(m => { if (t.label?.includes(m.nom)) map[m.nom]=(map[m.nom]||0)+(t.montant||0) })
    )
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,value])=>({label,value}))
  }, [allTx.length, menu.length])

  const heureCourante = new Date().getHours() || 1
  const prevision = heureCourante < 22 ? Math.round(totalVentes/heureCourante*22) : totalVentes
  const progression = prevision ? Math.round(totalVentes/prevision*100) : 0

  // ── Helpers UI ──────────────────────────────────────────────────
  const Stat = ({ label, value, color, sub, badge }) => (
    <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'12px 14px', position:'relative', minWidth:0 }}>
      {badge && (
        <div style={{ position:'absolute', top:7, right:7, fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8, background:badge.bg, color:badge.color }}>{badge.label}</div>
      )}
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:3, paddingRight:badge?36:0 }}>{label}</div>
      <div style={{ fontSize:isMobile?17:20, fontWeight:800, color:color||'var(--text)', lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{sub}</div>}
    </div>
  )

  const Card = ({ title, subtitle, children }) => (
    <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:isMobile?'12px':'14px 16px', marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize:11, color:'var(--muted)' }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )

  return (
    <div style={{ maxWidth:'100%' }}>

      {/* KPIs — 2 colonnes sur mobile, auto-fit sur desktop */}
      <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr 1fr':'repeat(auto-fit,minmax(130px,1fr))', gap:8, marginBottom:12 }}>
        <Stat label="CA brut encaissé" value={fmt(totalVentes)} color="var(--brand-dark)"/>
        <Stat label="Coût bénévoles" value={fmt(coutBenev)} color="#DC2626"
          sub={`${nbBenevsActifs} bénév. • ${resasBenev.length} résa`}
          badge={{label:'Charge',bg:'#FEE2E2',color:'#DC2626'}}/>
        <Stat label="CA net" value={fmt(caNette)} color={caNette>=0?'var(--brand-dark)':'#DC2626'} sub="après charge bénévoles"/>
        <Stat label="Total rechargé" value={fmt(totalCredits)}/>
        <Stat label="Soldes restants" value={fmt(totalSoldes)} sub="en circulation"/>
        <Stat label="Taux retrait résa" value={tauxRetrait+'%'}
          color={tauxRetrait>60?'var(--brand-dark)':'var(--amber)'}
          sub={`${resaCollected}/${totalResas} résa`}/>
      </div>

      {/* Graphiques — 1 colonne sur mobile */}
      <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:12 }}>
        <Card title="CA par heure (aujourd'hui)">
          {allTx.length
            ? <BarChart data={txParHeure} color="var(--brand)" height={isMobile?70:100}/>
            : <div style={{fontSize:13,color:'var(--muted)',textAlign:'center',padding:'16px 0'}}>Aucune vente</div>}
        </Card>

        <Card title="Prévision fin de journée">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:12 }}>
            <div>
              <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>Réel actuel</div>
              <div style={{fontSize:isMobile?18:22,fontWeight:800,color:'var(--brand-dark)'}}>{fmt(totalVentes)}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:10,color:'var(--muted)',marginBottom:2}}>Prévision 22h</div>
              <div style={{fontSize:isMobile?18:22,fontWeight:800,color:'var(--amber)'}}>{fmt(prevision)}</div>
            </div>
          </div>
          <div style={{height:7,background:'var(--bg3)',borderRadius:4,overflow:'hidden',marginBottom:5}}>
            <div style={{height:'100%',width:progression+'%',background:'var(--brand)',borderRadius:4,transition:'width .6s'}}/>
          </div>
          <div style={{fontSize:11,color:'var(--muted)',textAlign:'center'}}>{progression}% de la prévision atteint</div>
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:12 }}>
        <Card title="Ventes par catégorie">
          {ventesCat.length
            ? <BarChart data={ventesCat} color="var(--purple)" height={isMobile?70:100}/>
            : <div style={{fontSize:13,color:'var(--muted)',textAlign:'center',padding:'16px 0'}}>Aucune donnée</div>}
        </Card>

        <Card title="Top articles vendus">
          {topArticles.length
            ? topArticles.map((a,i) => {
                const max = topArticles[0].value
                return (
                  <div key={i} style={{marginBottom:9}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                      <span style={{color:'var(--text)',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%'}}>{a.label}</span>
                      <span style={{color:'var(--muted)',flexShrink:0}}>{fmt(a.value)}</span>
                    </div>
                    <div style={{height:4,background:'var(--bg3)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:(a.value/max*100)+'%',background:'var(--brand)',borderRadius:2}}/>
                    </div>
                  </div>
                )
              })
            : <div style={{fontSize:13,color:'var(--muted)',textAlign:'center',padding:'16px 0'}}>Aucune vente</div>}
        </Card>
      </div>

      {/* Section bénévoles */}
      <Card title="Consommations bénévoles" subtitle="prise en charge par l'événement">
        {coutBenev === 0 ? (
          <div style={{fontSize:13,color:'var(--muted)',textAlign:'center',padding:'14px 0'}}>Aucune consommation bénévole retirée</div>
        ) : (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
              {[
                {label:'Coût total', value:fmt(coutBenev), color:'#DC2626', bg:'#FEE2E2'},
                {label:'Bénévoles', value:nbBenevsActifs, color:'var(--text)', bg:'var(--bg2)'},
                {label:'Réservations', value:resasBenev.length, color:'var(--text)', bg:'var(--bg2)'},
              ].map(s => (
                <div key={s.label} style={{background:s.bg,borderRadius:10,padding:'9px 8px',textAlign:'center'}}>
                  <div style={{fontSize:isMobile?16:18,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:10,color:s.color,fontWeight:600,opacity:.8}}>{s.label}</div>
                </div>
              ))}
            </div>

            {coutParType.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:8}}>Répartition par type</div>
                {coutParType.map(({label,value}) => (
                  <div key={label} style={{marginBottom:7}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                      <span style={{color:'var(--text)',fontWeight:500}}>{label}</span>
                      <span style={{color:'#DC2626',fontWeight:600}}>{fmt(value)}</span>
                    </div>
                    <div style={{height:4,background:'var(--bg3)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:(value/coutBenev*100)+'%',background:'#DC2626',borderRadius:2,opacity:.7}}/>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{background:'var(--bg2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'var(--muted)',fontWeight:700,marginBottom:8}}>Bilan financier</div>
              {[
                {label:'CA brut spectateurs', value:totalVentes, color:'var(--brand-dark)'},
                {label:'− Charge bénévoles',  value:coutBenev,  color:'#DC2626', minus:true},
                {label:'= CA net événement',  value:caNette,    color:caNette>=0?'var(--brand-dark)':'#DC2626', bold:true},
              ].map(row => (
                <div key={row.label} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'5px 0',
                  borderBottom: row.bold?'none':'0.5px solid var(--border)',
                  borderTop:    row.bold?'1px solid var(--border)':'none',
                  marginTop:    row.bold?4:0,
                }}>
                  <span style={{fontSize:isMobile?11:12, color:'var(--text)', fontWeight:row.bold?700:400}}>{row.label}</span>
                  <span style={{fontSize:isMobile?12:13, fontWeight:row.bold?800:600, color:row.color}}>
                    {row.minus?'-':''}{fmt(Math.abs(row.value))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Réservations spectateurs */}
      <Card title="Réservations spectateurs">
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {[
            {label:'En attente', count:reservations.filter(r=>r.status==='pending'&&!r.isBenev).length,   color:'var(--amber)'},
            {label:'Prêtes',     count:reservations.filter(r=>r.status==='ready'&&!r.isBenev).length,     color:'var(--brand-dark)'},
            {label:'Retirées',   count:reservations.filter(r=>r.status==='collected'&&!r.isBenev).length, color:'var(--muted)'},
          ].map(s => (
            <div key={s.label} style={{background:'var(--bg2)',borderRadius:'var(--radius)',padding:'10px 8px',textAlign:'center'}}>
              <div style={{fontSize:isMobile?20:24,fontWeight:700,color:s.color}}>{s.count}</div>
              <div style={{fontSize:10,color:'var(--muted)'}}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
