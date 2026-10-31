/**
 * pages/public/SpecteurApp.jsx
 * Application spectateur publique — URL : /spectateur?id=FY-XXXX
 * Onglets : Historique · Réserver · Mes réservations
 */

import React, { useState, useEffect } from 'react'
import { Search, Wallet, Clock, Bookmark, Music } from 'lucide-react'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs, addDoc,
         updateDoc, doc, serverTimestamp, runTransaction, orderBy } from 'firebase/firestore'
import { fmt, nowStr } from '../../utils/helpers'

const BRAND   = '#1a6b7a'
const BRAND_L = '#E1F5EE'
const BRAND_D = '#0F6E56'
const AMBER   = '#BA7517'
const AMBER_L = '#FAEEDA'
const RED     = '#A32D2D'
const RED_L   = '#FCEBEB'

let _resaCounter = 200
const resaCode = (specId) => {
  _resaCounter++
  return specId.replace('FY-', '') + '-' + String(_resaCounter).padStart(2, '0')
}

export default function SpecteurApp() {
  const urlId = new URLSearchParams(window.location.search).get('id')?.toUpperCase()

  const [inputId, setInputId]     = useState(urlId || '')
  const [spec, setSpec]           = useState(null)
  const [specDocId, setSpecDocId] = useState(null)
  const [transactions, setTxs]   = useState([])
  const [reservations, setResas] = useState([])
  const [menu, setMenu]          = useState([])
  const [loading, setLoading]    = useState(false)
  const [err, setErr]            = useState('')
  const [tab, setTab]            = useState('solde') // solde | reserver | reservations
  const [qtys, setQtys]          = useState({})
  const [resaLoading, setResaLoading] = useState(false)
  const [resaDone, setResaDone]  = useState(null)
  const [resaErr, setResaErr]    = useState('')

  // Charger le menu au montage
  useEffect(() => {
    getDocs(collection(db, 'menu')).then(snap => {
      setMenu(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    }).catch(() => {})
  }, [])

  // Auto-recherche si ID dans l'URL
  useEffect(() => {
    if (urlId) findSpec(urlId)
  }, [urlId])

  const findSpec = async (id = inputId.trim().toUpperCase()) => {
    if (!id) return
    setLoading(true); setErr('')
    try {
      const snap = await getDocs(query(collection(db, 'spectateurs'), where('id', '==', id)))
      if (snap.empty) { setErr('Aucun compte trouvé pour : ' + id); setLoading(false); return }
      const d = snap.docs[0]
      setSpec(d.data()); setSpecDocId(d.id)

      try {
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('specId', '==', id), orderBy('createdAt', 'desc')))
        setTxs(txSnap.docs.map(x => x.data()))
      } catch {
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('specId', '==', id)))
        setTxs(txSnap.docs.map(x => x.data()))
      }

      const resaSnap = await getDocs(query(collection(db, 'reservations'), where('specId', '==', id)))
      setResas(resaSnap.docs.map(x => ({ ...x.data(), id: x.id })))
    } catch { setErr('Erreur de connexion. Réessayez.') }
    finally { setLoading(false) }
  }

  const refreshSpec = async () => {
    if (!spec?.id) return
    try {
      const snap = await getDocs(query(collection(db, 'spectateurs'), where('id', '==', spec.id)))
      if (!snap.empty) setSpec(snap.docs[0].data())
      const resaSnap = await getDocs(query(collection(db, 'reservations'), where('specId', '==', spec.id)))
      setResas(resaSnap.docs.map(x => ({ ...x.data(), id: x.id })))
    } catch {}
  }

  // Panier
  const changeQty = (id, d) => setQtys(q => {
    const v = Math.max(0, (q[id] || 0) + d)
    return { ...q, [id]: v }
  })

  const cartItems = Object.entries(qtys).filter(([, q]) => q > 0).map(([id, qty]) => {
    const m = menu.find(x => x.id === id)
    return { ...m, qty }
  })
  const cartTotal = cartItems.reduce((a, i) => a + (i.prix || 0) * i.qty, 0)

  const doReservation = async () => {
    if (!spec || !cartItems.length) return
    if ((spec.solde || 0) < cartTotal) { setResaErr('Solde insuffisant'); return }
    setResaLoading(true); setResaErr('')
    try {
      const specRef = doc(db, 'spectateurs', specDocId)
      const code    = resaCode(spec.id)
      const label   = 'Résa: ' + cartItems.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')

      await runTransaction(db, async (txn) => {
        const specDoc = await txn.get(specRef)
        if (specDoc.data().solde < cartTotal) throw new Error('Solde insuffisant')

        const resaRef = doc(collection(db, 'reservations'))
        txn.set(resaRef, {
          specId: spec.id, specNom: spec.nom,
          items: cartItems.map(i => ({ id: i.id, nom: i.nom, prix: i.prix, qty: i.qty })),
          total: cartTotal, status: 'pending',
          code, date: nowStr(), createdAt: serverTimestamp(),
        })

        const txRef = doc(collection(db, 'transactions'))
        txn.set(txRef, {
          specId: spec.id, type: 'reservation', label,
          montant: cartTotal, staff: '—',
          date: nowStr(), createdAt: serverTimestamp(),
        })
      })

      setResaDone({ code, items: cartItems, total: cartTotal })
      setQtys({})
      await refreshSpec()
    } catch (e) {
      setResaErr(e.message || 'Erreur lors de la réservation')
    } finally {
      setResaLoading(false)
    }
  }

  const annulerResa = async (resaId) => {
    if (!window.confirm('Annuler cette réservation ?')) return
    try {
      await updateDoc(doc(db, 'reservations', resaId), { status: 'collected' })
      await addDoc(collection(db, 'transactions'), {
        specId: spec.id, type: 'annulation',
        label: 'Annulation réservation', montant: 0, staff: '—',
        date: nowStr(), createdAt: serverTimestamp(),
      })
      await refreshSpec()
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  const card   = { background: '#fff', border: '0.5px solid #ddd', borderRadius: 14, padding: 16, marginBottom: 12 }
  const tabBtn = (t) => ({
    flex: 1, padding: '9px 0', border: 'none',
    borderBottom: tab === t ? `2px solid ${BRAND}` : '2px solid transparent',
    background: 'transparent',
    color: tab === t ? BRAND_D : '#6b6b6b',
    fontWeight: tab === t ? 600 : 400,
    fontSize: 13, cursor: 'pointer',
    fontFamily: 'system-ui,sans-serif',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f0f8f9', fontFamily: 'system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ background: BRAND, padding: '20px 16px 52px', textAlign: 'center', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="YllaCash" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700 }}>YllaCash</span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Toute la gestion financière de votre événement en un seul endroit.</div>
      </div>

      <div style={{ maxWidth: 460, margin: '-28px auto 0', padding: '0 14px 40px', position: 'relative', zIndex: 1 }}>

        {/* Identification */}
        {!spec && (
          <div style={{ ...card, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0d2d33', marginBottom: 4 }}>Identifiez-vous</div>
            <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 14 }}>Entrez l'ID de votre QR code (ex : FY-4A2B)</div>
            {loading
              ? <div style={{ textAlign: 'center', padding: 16, color: '#6b6b6b' }}>Chargement…</div>
              : <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={inputId} onChange={e => setInputId(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && findSpec()}
                      placeholder="FY-XXXX"
                      style={{ flex: 1, padding: '10px 14px', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 16, fontWeight: 700, letterSpacing: '.08em', color: '#0d2d33', outline: 'none' }} />
                    <button onClick={() => findSpec()}
                      style={{ padding: '10px 16px', background: BRAND, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                      <Search size={18} />
                    </button>
                  </div>
                  {err && <div style={{ marginTop: 10, padding: '8px 12px', background: RED_L, borderRadius: 8, fontSize: 13, color: RED }}>{err}</div>}
                </>
            }
          </div>
        )}

        {/* App spectateur */}
        {spec && (
          <>
            {/* Solde */}
            <div style={{ ...card, textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0d2d33', marginBottom: 2 }}>{spec.nom}</div>
              <div style={{ fontSize: 11, color: '#6b6b6b', fontFamily: 'monospace', marginBottom: 14 }}>{spec.id}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: BRAND_L, borderRadius: 14, padding: '12px 24px', marginBottom: 6 }}>
                <Wallet size={22} style={{ color: BRAND_D }} />
                <span style={{ fontSize: 28, fontWeight: 700, color: BRAND_D }}>{fmt(spec.solde || 0)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 10 }}>solde disponible</div>
              <button onClick={() => { setSpec(null); setInputId(''); setTxs([]); setResas([]); setQtys({}) }}
                style={{ fontSize: 12, color: '#6b6b6b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Changer de compte
              </button>
            </div>

            {/* Tabs — 3 onglets clairs */}
            <div style={{ display: 'flex', background: '#fff', borderRadius: 10, marginBottom: 12, border: '0.5px solid #ddd', overflow: 'hidden' }}>
              <button onClick={() => setTab('solde')} style={tabBtn('solde')}>
                <Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Historique
              </button>
              <button onClick={() => setTab('reserver')} style={tabBtn('reserver')}>
                🧾 Réserver
              </button>
              <button onClick={() => { setTab('reservations'); refreshSpec() }} style={tabBtn('reservations')}>
                <Bookmark size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Mes résa
                {reservations.filter(r => r.status !== 'collected').length > 0 && (
                  <span style={{ marginLeft: 4, background: AMBER, color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 5px', fontWeight: 700 }}>
                    {reservations.filter(r => r.status !== 'collected').length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab : Historique */}
            {tab === 'solde' && (
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0d2d33', marginBottom: 10 }}>Historique des transactions</div>
                {transactions.length === 0
                  ? <div style={{ fontSize: 13, color: '#6b6b6b', textAlign: 'center', padding: '16px 0' }}>Aucune transaction</div>
                  : transactions.slice(0, 10).map((t, i) => {
                      const isCredit = t.type === 'credit'
                      const isResa   = t.type === 'reservation'
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 9 ? '0.5px solid #eee' : 'none' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, background: isCredit ? BRAND_L : isResa ? AMBER_L : RED_L, color: isCredit ? BRAND_D : isResa ? AMBER : RED }}>
                            {isCredit ? '+' : isResa ? '⏳' : '−'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#0d2d33', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</div>
                            <div style={{ fontSize: 11, color: '#6b6b6b' }}>{t.date}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isCredit ? BRAND_D : isResa ? AMBER : RED, flexShrink: 0 }}>
                            {isCredit ? '+' : isResa ? '' : '−'}{fmt(t.montant || 0)}
                          </div>
                        </div>
                      )
                    })
                }
              </div>
            )}

            {/* Tab : Réserver */}
            {tab === 'reserver' && (
              <>
                {/* Bandeau explicatif */}
                <div style={{ padding: '10px 14px', background: AMBER_L, border: `0.5px solid #EF9F27`, borderRadius: 10, fontSize: 13, color: '#633806', marginBottom: 12 }}>
                  <strong>Comment ça marche ?</strong> Choisissez vos articles, confirmez la réservation. Le stand prépare votre commande et vous prévenez quand c'est prêt. Vous récupérez en présentant votre QR code — le paiement se fait à ce moment.
                </div>

                {resaDone ? (
                  <div style={card}>
                    <div style={{ padding: '10px 12px', background: BRAND_L, border: `0.5px solid #5DCAA5`, borderRadius: 8, fontSize: 13, color: BRAND_D, marginBottom: 12 }}>
                      ✓ Réservation confirmée !
                    </div>
                    <div style={{ border: `0.5px solid #5DCAA5`, borderRadius: 10, padding: 14, background: BRAND_L, marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0d2d33', marginBottom: 6 }}>
                        {resaDone.items.map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b6b6b' }}>
                        <span style={{ fontFamily: 'monospace' }}>Code : <strong>{resaDone.code}</strong></span>
                        <span style={{ fontWeight: 700, color: '#0d2d33' }}>{fmt(resaDone.total)}</span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: BRAND_D }}>
                        Le stand vous préviendra quand votre commande sera prête. Présentez votre QR code au retrait — le paiement sera débité à ce moment.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setResaDone(null); setTab('reservations') }}
                        style={{ flex: 1, padding: 8, border: '0.5px solid #ddd', borderRadius: 8, background: '#fff', color: '#0d2d33', fontSize: 13, cursor: 'pointer' }}>
                        Voir mes réservations
                      </button>
                      <button onClick={() => setResaDone(null)}
                        style={{ flex: 1, padding: 8, background: BRAND, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                        Réserver encore
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {[...new Set(menu.map(m => m.cat))].map(cat => (
                      <div key={cat} style={card}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#0d2d33' }}>{cat}</div>
                        {menu.filter(m => m.cat === cat).map(m => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #eee' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d2d33' }}>{m.nom}</div>
                              <div style={{ fontSize: 11, color: '#6b6b6b' }}>{m.stock} disponible(s)</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: BRAND_D }}>{fmt(m.prix || 0)}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => changeQty(m.id, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: '0.5px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d2d33' }}>−</button>
                                <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center', color: '#0d2d33' }}>{qtys[m.id] || 0}</span>
                                <button onClick={() => changeQty(m.id, 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '0.5px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d2d33' }}>+</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {cartItems.length > 0 && (
                      <div style={{ ...card, border: `2px solid ${BRAND}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#0d2d33' }}>Ma réservation</div>
                        {cartItems.map(i => (
                          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '0.5px solid #eee', color: '#0d2d33' }}>
                            <span>{i.nom} ×{i.qty}</span>
                            <span>{fmt((i.prix || 0) * i.qty)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, margin: '10px 0', color: '#0d2d33' }}>
                          <span>Total estimé</span>
                          <span style={{ color: BRAND_D }}>{fmt(cartTotal)}</span>
                        </div>
                        <div style={{ padding: '8px 10px', background: '#f0f8f9', borderRadius: 8, fontSize: 12, color: '#6b6b6b', marginBottom: 10 }}>
                          Le paiement sera débité lors du retrait au stand.
                        </div>
                        {resaErr && <div style={{ padding: '8px 10px', background: RED_L, borderRadius: 8, fontSize: 12, color: RED, marginBottom: 10 }}>{resaErr}</div>}
                        <button onClick={doReservation} disabled={resaLoading}
                          style={{ width: '100%', padding: 10, background: BRAND, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: resaLoading ? 'not-allowed' : 'pointer' }}>
                          {resaLoading ? 'Réservation en cours…' : 'Confirmer la réservation'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Tab : Mes réservations */}
            {tab === 'reservations' && (
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0d2d33', marginBottom: 10 }}>Mes réservations</div>
                {reservations.length === 0
                  ? <div style={{ fontSize: 13, color: '#6b6b6b', textAlign: 'center', padding: '16px 0' }}>Aucune réservation pour le moment</div>
                  : reservations.map(r => (
                    <div key={r.id} style={{ border: `0.5px solid ${r.status === 'ready' ? '#5DCAA5' : r.status === 'collected' ? '#ddd' : '#EF9F27'}`, borderRadius: 10, padding: 12, marginBottom: 10, background: r.status === 'ready' ? BRAND_L : r.status === 'collected' ? '#f5f5f5' : AMBER_L }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#0d2d33' }}>
                          {(r.items || []).map(i => i.nom + (i.qty > 1 ? ` ×${i.qty}` : '')).join(', ')}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: r.status === 'ready' ? BRAND_D : r.status === 'collected' ? '#6b6b6b' : AMBER }}>
                          {r.status === 'ready' ? '✓ Prêt !' : r.status === 'collected' ? 'Retiré' : 'En préparation'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: r.status === 'pending' ? 8 : 0 }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b6b6b' }}>Code : <strong>{r.code}</strong></span>
                        <span style={{ fontWeight: 700, color: '#0d2d33' }}>{fmt(r.total || 0)}</span>
                      </div>
                      {r.status === 'ready' && (
                        <div style={{ fontSize: 12, color: BRAND_D, fontWeight: 500, marginTop: 6 }}>
                          Votre commande est prête ! Présentez votre QR code au stand pour récupérer et payer.
                        </div>
                      )}
                      {r.status === 'pending' && (
                        <button onClick={() => annulerResa(r.id)}
                          style={{ padding: '5px 12px', background: RED_L, color: RED, border: `0.5px solid #F09595`, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                          Annuler
                        </button>
                      )}
                    </div>
                  ))
                }
                <button onClick={() => setTab('reserver')}
                  style={{ width: '100%', marginTop: 4, padding: 8, background: BRAND, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                  + Nouvelle réservation
                </button>
              </div>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#6b6b6b', marginTop: 8 }}>
          <a href="/" style={{ color: BRAND, textDecoration: 'none' }}>Accès staff →</a>
        </div>
      </div>
    </div>
  )
}
