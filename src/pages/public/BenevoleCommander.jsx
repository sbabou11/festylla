/**
 * pages/public/BenevoleCommander.jsx
 * Onglet "Commander" de l'espace bénévole
 */
import React from 'react'

export default function BenevoleCommander({
  menu, cartItems, qtys, setQtys,
  resaDone, setResaDone, resaLoading, resaErr,
  doCommande, quotaRestant, TYPE_CFG, BRAND, setTab, benev,
}) {
  return (
<div>
            {resaDone ? (
              <div style={{ background:'var(--bg)', borderRadius:14, padding:20, textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
                <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:17, fontWeight:800, color:'#065f46', marginBottom:4 }}>Commande envoyée !</div>
                <div style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>Code : <strong style={{ fontFamily:'monospace', color:BRAND }}>{resaDone.code}</strong></div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
                  {resaDone.items.map(i => `${i.nom} ×${i.qty}`).join(', ')}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:4 }}>
                  <button onClick={() => { setResaDone(null); setTab('mes-resas') }}
                    style={{ padding:'10px 24px', background:BRAND, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', width:'100%' }}>
                    📋 Voir mes réservations
                  </button>
                  <button onClick={() => setResaDone(null)}
                    style={{ padding:'10px 24px', background:'var(--bg2)', color:'var(--text)', border:'0.5px solid var(--border)', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', width:'100%' }}>
                    🛒 Passer une nouvelle commande
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {menu.length === 0 ? (
                  <div style={{ background:'var(--bg)', borderRadius:14, padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
                    Aucun article disponible pour les bénévoles.
                  </div>
                ) : (
                  <>
                    {Object.entries(TYPE_CFG).map(([type, cfg]) => {
                      const items = menu.filter(m => m.typeConsommation === type && (m.stock||0) > 0)
                      if (!items.length) return null
                      const restant = quotaRestant(type)
                      const Icon = cfg.icon
                      return (
                        <div key={type} style={{ background:'var(--bg)', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Icon size={16} style={{ color:cfg.color }}/>
                            </div>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{cfg.label}</div>
                              <div style={{ fontSize:11, color: restant > 0 ? cfg.color : 'var(--red)', fontWeight:600 }}>
                                {restant > 0 ? `${restant} disponible${restant > 1 ? 's' : ''}` : 'Quota épuisé'}
                              </div>
                            </div>
                          </div>
                          {items.map(item => {
                            const qty = qtys[item.id] || 0
                            const inCart = cartItems.filter(i => i.typeConsommation === type).reduce((a,i) => a+i.qty, 0)
                            const canAdd = inCart < restant && (item.stock||0) > 0
                            return (
                              <div key={item.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.nom}</div>
                                  <div style={{ fontSize:11, color:'var(--muted)' }}>Stock : {item.stock}</div>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  {qty > 0 && (
                                    <button onClick={() => setQtys(q => ({ ...q, [item.id]: Math.max(0, (q[item.id]||0)-1) }))}
                                      style={{ width:28, height:28, borderRadius:8, border:`1px solid ${cfg.color}`, background:'var(--bg)', color:cfg.color, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
                                  )}
                                  {qty > 0 && <span style={{ fontSize:14, fontWeight:700, color:'var(--text)', minWidth:14, textAlign:'center' }}>{qty}</span>}
                                  <button onClick={() => {
                                    if (canAdd) setQtys(q => ({ ...q, [item.id]: (q[item.id]||0)+1 }))
                                  }} disabled={!canAdd}
                                    style={{ width:28, height:28, borderRadius:8, border:`1px solid ${canAdd ? cfg.color : 'var(--border)'}`, background:canAdd ? cfg.bg : 'var(--bg2)', color:canAdd ? cfg.color : 'var(--muted)', fontSize:16, cursor:canAdd?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}

                    {/* Panier sticky */}
                    {cartItems.length > 0 && (
                      <div style={{ position:'sticky', bottom:16, background:BRAND, borderRadius:14, padding:'14px 16px', boxShadow:'0 8px 24px rgba(26,107,122,.4)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ color:'#fff' }}>
                          <div style={{ fontSize:13, fontWeight:700 }}>{cartItems.reduce((a,i)=>a+i.qty,0)} article(s)</div>
                          <div style={{ fontSize:11, opacity:.8 }}>{cartItems.map(i=>`${i.nom} ×${i.qty}`).join(', ')}</div>
                        </div>
                        <button onClick={doCommande} disabled={resaLoading}
                          style={{ padding:'10px 18px', background:'var(--bg)', color:BRAND, border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:resaLoading?'not-allowed':'pointer', fontFamily:'var(--font)', opacity:resaLoading?.7:1 }}>
                          {resaLoading ? 'Envoi…' : 'Commander'}
                        </button>
                      </div>
                    )}
                    {resaErr && <div style={{ padding:'8px 12px', background:'var(--red-light)', color:'var(--red)', borderRadius:8, fontSize:13, marginTop:8 }}>{resaErr}</div>}
                  </>
                )}
              </div>
            )}
          </div>
  )
}
