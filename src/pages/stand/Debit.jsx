/**
 * pages/stand/Debit.jsx — v2 responsive
 * Layout : 2 colonnes sur desktop, 1 colonne sur mobile
 * Catégories en onglets, panier sticky
 */
import React, { useState, useMemo } from 'react'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db }        from '../../firebase/config'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import { fmt } from '../../utils/helpers'
import QrScanner from '../../components/QrScanner'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import ArtistServeMode from './ArtistServeMode'
import { CheckCircle, RefreshCw, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react'
import { useBreakpoint }   from '../../hooks/useBreakpoint'
import { useOfflineQueue } from '../../hooks/useOfflineQueue'

export default function Debit() {
  const { spectateurs, menu, debiter } = useAppStore()
  const { currentEventId, events }      = useEventStore()
  const { user }                        = useAuthStore()
  const { isMobile }                   = useBreakpoint()
  const [spec, setSpec]       = useState(null)
  const [qtys, setQtys]       = useState({})
  const [done, setDone]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const [selectedInfoItem, setSelectedInfoItem] = useState(null) // modale composition
  const [quickMode, setQuickMode] = useState(false)
  const [mode, setMode] = useState('client') // 'client' | 'artiste'
  const { online, execute, queueSize } = useOfflineQueue()

  const cats = useMemo(() => [...new Set(menu.map(m => m.cat).filter(Boolean))], [menu])

  // Top 6 articles pour la caisse rapide (tri par stock décroissant comme proxy de popularité)
  const quickArticles = useMemo(() =>
    [...menu].filter(m => (m.stock || 0) > 0).sort((a, b) => (b.stock || 0) - (a.stock || 0)).slice(0, 6),
    [menu]
  )

  const currentCat = activeCat || cats[0] || ''

  const catMenu    = menu.filter(m => m.cat === currentCat)

  const findById = async (id) => {
    const uid = id.toUpperCase().trim()

    // 1. Store local
    const local = spectateurs.find(x => x.id === uid)
    if (local) { setSpec(local); setErr(''); return }

    // 2. Firebase — chercher dans tous les événements
    setErr('Recherche en cours…')
    try {
      // Priorité : eventId du staff connecté > currentEventId store > tous les événements
      const staffEventId = user?.eventId || currentEventId
      const evIds = staffEventId
        ? [staffEventId, ...events.map(e => e.id).filter(id => id !== staffEventId)]
        : events.map(e => e.id)

      for (const evId of evIds) {
        const snap = await getDocs(
          query(collection(db, 'events', evId, 'spectateurs'), where('id', '==', uid))
        )
        if (!snap.empty) {
          const data = snap.docs[0].data()
          setSpec({ ...data, _docId: snap.docs[0].id, _eventId: evId })
          setErr('')
          return
        }
      }
      // Chercher dans les bénévoles — par docId directement (QR pointe vers le docId)
      for (const evId of evIds) {
        try {
          const bRef = doc(db, 'events', evId, 'benevoles', uid)
          const bSnap = await getDoc(bRef)
          if (bSnap.exists()) {
            const data = bSnap.data()
            setSpec({ ...data, id: uid, _docId: uid, _eventId: evId, _isBenev: true, solde: null })
            setErr('')
            return
          }
        } catch {}
      }
      setErr('Compte introuvable : ' + uid)
      setSpec(null)
    } catch (e) {
      setErr('Erreur de recherche : ' + e.message)
      setSpec(null)
    }
  }

  const changeQty = (id, d) => setQtys(q => {
    const item = menu.find(m => m.id === id)
    const cur  = q[id] || 0
    const next = Math.max(0, cur + d)
    // Bloquer si dépassement stock
    if (d > 0 && item && next > (item.stock || 0)) return q
    const n = { ...q, [id]: next }
    if (!next) delete n[id]
    return n
  })

  const cartItems = Object.entries(qtys)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ ...menu.find(x => x.id === id), qty }))
  const total   = cartItems.reduce((a, i) => a + (i.prix || 0) * i.qty, 0)
  const soldeOk = (!online || (spec?.solde || 0) >= total) && total > 0  // hors-ligne : pas de vérification solde

  const doPay = async () => {
    if (!spec || !cartItems.length) return
    setLoading(true); setErr('')
    try {
      const executed = await execute(
        'debit',
        { specId: spec.id, items: cartItems, staffNom: (user && user.nom) ? user.nom : 'Staff', eventId: spec._eventId || currentEventId },
        () => debiter(spec.id, cartItems, (user && user.nom) ? user.nom : 'Staff', spec._eventId || currentEventId)
      )
      if (executed) {
        setDone({ nom: spec.nom, total, newSolde: (spec.solde || 0) - total })
      } else {
        setDone({ nom: spec.nom, total, newSolde: (spec.solde || 0) - total, msg: "⚡ En file d'attente — sera synchronisé à la reconnexion" })
      }
      setSpec(null); setQtys({})
    } catch(e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  const reset = () => { setDone(null); setSpec(null); setQtys({}); setErr('') }

  // ── Confirmation paiement ──────────────────────────────────────
  if (done) return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '24px 0' }}>
      <div style={{ textAlign: 'center', padding: '32px 20px', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 16 }}>
        <CheckCircle size={52} style={{ color: 'var(--brand)', marginBottom: 16 }}/>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          {done.msg ? '⚡ Enregistré hors-ligne' : 'Paiement accepté !'}
        </div>
        <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 8 }}>{done.nom}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>−{fmt(done.total)}</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: done.msg ? 8 : 24 }}>
          Solde estimé : <strong>{fmt(done.newSolde)}</strong>
        </div>
        {done.msg && (
          <div style={{ fontSize: 13, color: 'var(--amber-dark)', background: 'var(--amber-light)', borderRadius: 8, padding: '8px 12px', marginBottom: 24 }}>
            {done.msg}
          </div>
        )}
        <button onClick={reset} className="btn-primary" style={{ width: '100%' }}>
          <RefreshCw size={16}/> Nouvel encaissement
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, height: isMobile ? 'auto' : 'calc(100vh - 120px)', overflow: 'hidden' }}>

      {/* ── Colonne gauche : scanner + menu ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: isMobile ? 'visible' : 'auto' }}>

        {/* Toggle mode Client / Artiste */}
        <div style={{ display:'flex', gap:8, marginBottom:12, background:'var(--bg2)', borderRadius:10, padding:4, border:'0.5px solid var(--border)' }}>
          <button onClick={() => { setMode('client'); setSpec(null); setQtys({}) }}
            style={{ flex:1, padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'var(--font)', fontSize:12, fontWeight:700, background: mode==='client' ? 'var(--brand)' : 'transparent', color: mode==='client' ? '#fff' : 'var(--muted)' }}>
            💰 Vente client
          </button>
          <button onClick={() => { setMode('artiste'); setSpec(null); setQtys({}) }}
            style={{ flex:1, padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'var(--font)', fontSize:12, fontWeight:700, background: mode==='artiste' ? 'var(--brand)' : 'transparent', color: mode==='artiste' ? '#fff' : 'var(--muted)' }}>
            🎁 Artiste
          </button>
        </div>

        {/* Mode artiste */}
        {mode === 'artiste' && (
          <ArtistServeMode eventId={currentEventId} menu={menu} staffNom={(user && user.nom) ? user.nom : 'Stand'} staffId={user?.id || user?.uid || null}/>
        )}

        {/* Mode client (existant) */}
        {mode === 'client' && (<>

        {/* Scanner */}
        {!spec ? (
          <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Scanner ou saisir l'ID</div>
            <QrScanner onScan={findById}/>
            {err && <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>{err}</div>}
          </div>
        ) : (
          /* Carte spectateur — dégradé marine-or (couleur stand) */
          <div style={{ background: 'var(--grad-marine-gold)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color:'#fff' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{spec.nom}</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', opacity: 0.85 }}>{spec.id}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(spec.solde || 0)}</div>
              <button onClick={() => { setSpec(null); setQtys({}) }}
                style={{ fontSize: 11, color: 'rgba(255,255,255,.85)', background: 'rgba(255,255,255,.18)', border: 'none', cursor: 'pointer', minHeight: 'auto', padding: '2px 8px', borderRadius: 4, marginTop: 2 }}>
                Changer
              </button>
            </div>
          </div>
        )}

        {/* Indicateur hors-ligne */}
        {!online && (
          <div style={{ padding:'8px 12px', background:'#FEE2E2', color:'#991B1B', borderRadius:8, fontSize:12, fontWeight:600, marginBottom:10 }}>
            ⚡ Hors-ligne — {queueSize} transaction(s) en file d'attente
          </div>
        )}

        {/* Bascule caisse rapide */}
        {spec && (
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={() => setQuickMode(false)}
              style={{ flex:1, padding:'7px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'var(--font)', fontSize:12, fontWeight:600, background:!quickMode?'var(--brand)':'var(--bg2)', color:!quickMode?'#fff':'var(--muted)' }}>
              📋 Menu complet
            </button>
            <button onClick={() => setQuickMode(true)}
              style={{ flex:1, padding:'7px', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'var(--font)', fontSize:12, fontWeight:700, background:quickMode?'var(--brand)':'var(--bg2)', color:quickMode?'#fff':'var(--muted)' }}>
              ⚡ Caisse rapide
            </button>
          </div>
        )}

        {/* Mode caisse rapide */}
        {spec && quickMode && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:14, marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:10 }}>⚡ Articles rapides — appuyez pour ajouter</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {quickArticles.map(m => {
                const qty = qtys[m.id] || 0
                return (
                  <button key={m.id} onClick={() => setQtys(q => ({...q, [m.id]:(q[m.id]||0)+1}))}
                    style={{ padding:'10px 6px', borderRadius:10, border:`2px solid ${qty>0?'var(--brand)':'var(--border)'}`, background:qty>0?'var(--brand-light)':'var(--bg2)', cursor:'pointer', textAlign:'center', position:'relative', fontFamily:'var(--font)' }}>
                    {qty > 0 && (
                      <span style={{ position:'absolute', top:4, right:4, width:18, height:18, borderRadius:'50%', background:'var(--brand)', color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{qty}</span>
                    )}
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.nom}</div>
                    <div style={{ fontSize:11, color:'var(--brand-dark)', fontWeight:600 }}>{((m.prix||0)/100).toFixed(2)}€</div>
                  </button>
                )
              })}
            </div>
            {Object.values(qtys).some(q=>q>0) && (
              <button onClick={() => setQtys({})} style={{ marginTop:10, width:'100%', padding:'6px', border:'none', borderRadius:8, background:'var(--red-light)', color:'var(--red)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                🗑 Vider le panier
              </button>
            )}
          </div>
        )}

        {/* Onglets catégories */}
        {spec && (
          <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 4 }}>
              {cats.map(cat => (
                <button key={cat} onClick={() => setActiveCat(cat)}
                  style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: currentCat === cat ? 700 : 400, background: currentCat === cat ? 'var(--brand)' : 'var(--bg2)', color: currentCat === cat ? '#fff' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Articles */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {catMenu.map(m => {
                const qty     = qtys[m.id] || 0
                const stock   = m.stock || 0
                const rupture = stock === 0
                return (
                  <div key={m.id}
                    style={{ background: 'var(--bg)', border: `1.5px solid ${qty > 0 ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: 12, opacity: rupture ? 0.4 : 1, transition: 'border-color .1s' }}>
                    {/* Zone cliquable (photo + nom) pour ouvrir la fiche composition */}
                    <div
                      onClick={() => setSelectedInfoItem(m)}
                      style={{ cursor: 'pointer' }}
                      title="Voir la composition">
                      {m.photoUrl ? (
                        <div style={{
                          position: 'relative',
                          width: '100%', aspectRatio: '1/1',
                          borderRadius: 8, overflow: 'hidden',
                          marginBottom: 8, background: '#1a1a1a',
                        }}>
                          <div style={{
                            position: 'absolute', inset: 0,
                            backgroundImage: `url(${m.photoUrl})`,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                            filter: 'blur(16px) brightness(0.65)',
                            transform: 'scale(1.15)',
                          }}/>
                          <img src={m.photoUrl} alt=""
                            style={{
                              position: 'absolute', inset: 0, margin: 'auto',
                              maxWidth: '100%', maxHeight: '100%',
                              objectFit: 'contain',
                            }}/>
                        </div>
                      ) : null}
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.3 }}>{m.nom}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-dark)' }}>{fmt(m.prix || 0)}</span>
                      {rupture
                        ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)' }}>Rupture</span>
                        : stock <= (m.seuilAlerte || 10)
                        ? <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>{stock} restant{stock > 1 ? 's' : ''}</span>
                        : null
                      }
                    </div>
                    {/* Contrôles +/- */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => changeQty(m.id, -1)} disabled={qty === 0 || rupture}
                        style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg2)', cursor: qty === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: qty === 0 ? 0.3 : 1 }}>
                        <Minus size={14}/>
                      </button>
                      <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800, color: qty > 0 ? 'var(--brand-dark)' : 'var(--muted)' }}>{qty}</span>
                      <button onClick={() => changeQty(m.id, 1)} disabled={rupture || qty >= stock}
                        style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: rupture || qty >= stock ? 'var(--bg3)' : 'var(--brand)', cursor: rupture || qty >= stock ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <Plus size={14}/>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        </>)}
      </div>

      {/* ── Colonne droite / bas mobile : panier ── */}
      {mode === 'client' && spec && cartItems.length > 0 && (
        <div style={{
          width: isMobile ? '100%' : 280,
          flexShrink: 0,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 16,
          ...(isMobile ? {} : { position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <ShoppingCart size={16} style={{ color: 'var(--brand)' }}/>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Panier</span>
          </div>

          {cartItems.map(i => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>×{i.qty} · {fmt(i.prix || 0)} / u</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmt((i.prix || 0) * i.qty)}</span>
                <button onClick={() => setQtys(q => { const n = { ...q }; delete n[i.id]; return n })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, minHeight: 'auto' }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px', fontSize: 18, fontWeight: 800 }}>
            <span>Total</span>
            <span style={{ color: 'var(--brand-dark)' }}>{fmt(total)}</span>
          </div>

          <div style={{ fontSize: 12, color: (spec.solde || 0) < total ? 'var(--red)' : 'var(--muted)', marginBottom: 14 }}>
            Solde : {fmt(spec.solde || 0)} {(spec.solde || 0) < total ? '— insuffisant' : '✓'}
          </div>

          {err && <div style={{ padding: '8px 10px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{err}</div>}

          <button onClick={doPay} disabled={!soldeOk || loading}
            className={soldeOk ? 'btn-coral' : ''}
            style={soldeOk
              ? { width: '100%', minHeight: 52, fontSize: 15 }
              : { width: '100%', minHeight: 52, background: 'var(--bg3)', color: 'var(--muted)', border: 'none', borderRadius: 'var(--radius)', fontSize: 15, fontWeight: 700, cursor: 'not-allowed', fontFamily: 'var(--font)' }}>
            {loading ? 'Traitement…' : `Encaisser ${fmt(total)}`}
          </button>
        </div>
      )}

      {/* Modale composition / allergènes au clic sur un article */}
      {selectedInfoItem && (
        <ArticleInfoModal
          item={selectedInfoItem}
          qty={qtys[selectedInfoItem.id] || 0}
          onAdd={() => changeQty(selectedInfoItem.id, +1)}
          onClose={() => setSelectedInfoItem(null)}
        />
      )}
    </div>
  )
}
