/**
 * pages/stand/PrendreCommande.jsx — v1.0.0 (Lot 2)
 *
 * Page de prise de commande au stand pour le rôle stand/admin.
 *
 * Flux :
 *   1. Scanner QR ou saisir l'ID du client
 *   2. Filtrer / rechercher l'article
 *   3. Ajouter au panier (+/- pour la quantité)
 *   4. Choisir entre "Valider et débiter" ou "Valider sans débit"
 *   5. La commande apparaît dans la page Cuisine (Lot 3)
 *
 * Différences vs Encaisser (Debit.jsx) :
 *   - Ne débite pas forcément (option différée au retrait)
 *   - Génère un numéro de commande visible
 *   - La commande passe par un cycle pending → ready → collected
 */

import React, { useState, useMemo } from 'react'
import useAppStore   from '../../store/useAppStore'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db }        from '../../firebase/config'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import { createCommande } from '../../firebase/service'
import { fmt } from '../../utils/helpers'
import QrScanner from '../../components/QrScanner'
import {
  CheckCircle, RefreshCw, ShoppingCart, Search, X,
  Plus, Minus, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export default function PrendreCommande() {
  const { spectateurs, menu } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const { isMobile } = useBreakpoint()

  // États
  const [spec, setSpec]       = useState(null)      // client scanné
  const [qtys, setQtys]       = useState({})        // { [itemId]: quantity }
  const [done, setDone]       = useState(null)      // résultat après validation
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')
  const [activeCat, setActiveCat] = useState('tous')
  const [selectedInfoItem, setSelectedInfoItem] = useState(null) // modale composition
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [recapOpen, setRecapOpen] = useState(false)

  // Liste des catégories du menu (dynamique)
  const cats = useMemo(() => {
    const list = [...new Set((menu || []).map(m => m.cat).filter(Boolean))]
    return list
  }, [menu])

  // Articles filtrés selon catégorie + recherche
  const filteredMenu = useMemo(() => {
    let list = menu || []
    if (activeCat !== 'tous') {
      list = list.filter(m => m.cat === activeCat)
    }
    if (searchTerm.trim()) {
      const t = searchTerm.trim().toLowerCase()
      list = list.filter(m => (m.nom || '').toLowerCase().includes(t))
    }
    // Trier : en stock d'abord, puis par nom
    return [...list].sort((a, b) => {
      const sa = (a.stock || 0) > 0 ? 0 : 1
      const sb = (b.stock || 0) > 0 ? 0 : 1
      if (sa !== sb) return sa - sb
      return (a.nom || '').localeCompare(b.nom || '')
    })
  }, [menu, activeCat, searchTerm])

  // Recherche d'un client par ID
  const findById = async (id) => {
    const uid = id.toUpperCase().trim()
    // 1. Store local
    const local = spectateurs.find(x => x.id === uid)
    if (local) { setSpec(local); setErr(''); return }
    // 2. Firebase — chercher dans les événements du staff puis les autres
    setErr('Recherche en cours…')
    try {
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
      setErr('Compte introuvable : ' + uid)
      setSpec(null)
    } catch (e) {
      setErr('Erreur de recherche : ' + e.message)
      setSpec(null)
    }
  }

  // Gestion quantités
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
  const removeItem = (id) => setQtys(q => {
    const n = { ...q }
    delete n[id]
    return n
  })

  // Panier — IMPORTANT : i.prix est stocké en CENTIMES dans Firestore (cf. Menu.jsx).
  // Donc tous nos calculs internes (total, soldeOk) restent en centimes.
  // Le format euros (X,XX €) n'est appliqué QU'à l'affichage et à l'écran final.
  const cartItems = useMemo(() => Object.entries(qtys)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ ...menu.find(x => x.id === id), qty })), [qtys, menu])
  const total   = cartItems.reduce((a, i) => a + (i.prix || 0) * i.qty, 0)  // en centimes
  const nbItems = cartItems.reduce((s, i) => s + i.qty, 0)
  const soldeOk = (spec?.solde || 0) >= total  // solde et total tous deux en centimes
  // Combien manque-t-il pour pouvoir débiter ? (en centimes, positif si dépassement)
  const manquant = total - (spec?.solde || 0)
  const soldeAlert = !!spec && total > 0 && !soldeOk  // afficher l'alerte uniquement si panier non vide

  // Validation de la commande
  const doValidate = async (payNow) => {
    if (!spec || !cartItems.length) return
    if (payNow && !soldeOk) {
      setErr(`Solde insuffisant pour débiter maintenant. Solde : ${((spec.solde || 0) / 100).toFixed(2)} €, total : ${(total / 100).toFixed(2)} €.`)
      return
    }
    setLoading(true); setErr('')
    try {
      const eventId = spec._eventId || currentEventId
      // items au format { id, nom, qty, prixUnit } avec prixUnit en CENTIMES (déjà le cas)
      const items = cartItems.map(i => ({
        id: i.id,
        nom: i.nom,
        qty: i.qty,
        prixUnit: i.prix || 0,  // déjà en centimes (cf. Menu.jsx)
      }))
      const { id, numero } = await createCommande({
        specId:  spec.id,
        specNom: spec.nom,
        items,
        payNow,
        staff:   (user && user.nom) ? user.nom : 'Stand',
      }, eventId)
      setDone({
        numero,
        commandeId: id,
        nom: spec.nom,
        total,
        payNow,
        nbItems,
      })
      setSpec(null); setQtys({}); setRecapOpen(false); setSearchTerm(''); setSearchOpen(false)
    } catch(e) {
      setErr(e.message)
    }
    finally { setLoading(false) }
  }

  const reset = () => { setDone(null); setSpec(null); setQtys({}); setErr('') }

  // ─── Écran de confirmation après validation ────────────────────────────
  if (done) return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{
        textAlign: 'center', padding: '32px 20px',
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
      }}>
        <CheckCircle size={52} style={{ color: 'var(--brand)', marginBottom: 16 }}/>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          Commande #{done.numero}
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18 }}>
          {done.payNow ? 'Validée et débitée' : 'Validée — débit au retrait'}
        </div>
        <div style={{
          padding: '14px 18px',
          background: 'var(--bg2)',
          borderRadius: 10,
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{done.nom}</div>
          <div style={{ fontSize: 13 }}>{done.nbItems} article{done.nbItems > 1 ? 's' : ''} · <strong>{(done.total / 100).toFixed(2)} €</strong></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          La commande apparaît dans la page Cuisine.
        </div>
        <button onClick={reset} className="btn-primary" style={{ width: '100%', minHeight: 44 }}>
          <RefreshCw size={14}/> Nouvelle commande
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 16px' }}>
      {/* ─── Étape 1 : Scanner / Saisir le client ──────────────────── */}
      {!spec ? (
        <div style={{
          background: 'var(--bg)',
          border: '0.5px solid var(--border)',
          borderRadius: 14,
          padding: '18px 16px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, textAlign: 'center' }}>
            <ShoppingCart size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6, color: 'var(--brand)' }}/>
            Scanner le QR du client
          </div>
          <QrScanner onScan={findById} placeholder="FY-XXXX"/>
          {err && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: 'var(--red-light)', color: 'var(--red-dark)',
              borderRadius: 8, fontSize: 12,
            }}>
              {err}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ─── Bandeau client scanné ─────────────────────────────── */}
          <div style={{
            background: 'var(--bg)',
            border: '0.5px solid var(--border)',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--brand-light)', color: 'var(--brand-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}>
              {(spec.nom || '?').split(/\s+/).map(p => p[0] || '').slice(0,2).join('').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {spec.nom}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {spec.id} · Solde : <strong style={{ color: soldeOk ? 'var(--green-dark)' : 'var(--red-dark)' }}>
                  {((spec.solde || 0) / 100).toFixed(2)} €
                </strong>
              </div>
            </div>
            <button onClick={() => { setSpec(null); setQtys({}); setErr('') }}
              style={{
                background:'transparent', border:'0.5px solid var(--border2)',
                padding:'5px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
                color:'var(--text)', fontFamily:'inherit',
              }}>
              Changer
            </button>
          </div>

          {/* ─── Alerte solde insuffisant ─────────────────────────────
              Visible dès que le panier dépasse le solde du client.
              Aide le staff à comprendre la situation et propose les options. */}
          {soldeAlert && (
            <div style={{
              background: 'var(--red-light)',
              border: '1px solid var(--red)',
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red-dark)', marginBottom: 2 }}>
                  Solde insuffisant pour débit immédiat
                </div>
                <div style={{ fontSize: 11, color: 'var(--red-dark)', lineHeight: 1.4 }}>
                  Il manque <strong>{(manquant / 100).toFixed(2)} €</strong> au client.
                  Vous pouvez créditer son compte avant, ou valider sans débit (paiement au retrait).
                </div>
              </div>
            </div>
          )}

          {/* ─── Barre de recherche (dépliable) + Filtres catégories ─── */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => {
                  if (searchOpen) { setSearchTerm(''); setSearchOpen(false) }
                  else setSearchOpen(true)
                }}
                style={{
                  width: 36, height: 36,
                  background: searchOpen ? 'var(--brand)' : 'var(--bg)',
                  border: '0.5px solid ' + (searchOpen ? 'var(--brand)' : 'var(--border)'),
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
                title={searchOpen ? "Fermer la recherche" : "Rechercher un article"}>
                {searchOpen
                  ? <X size={16} color="#fff"/>
                  : <Search size={16} style={{ color: 'var(--muted)' }}/>
                }
              </button>
              {searchOpen && (
                <input
                  type="text"
                  autoFocus
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Chercher un article..."
                  style={{
                    flex: 1, height: 36, padding: '0 12px',
                    fontSize: 13, fontFamily: 'inherit',
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 8,
                    outline: 'none',
                  }}/>
              )}
            </div>
          </div>

          {/* Chips catégories (scroll horizontal) */}
          <div style={{
            display: 'flex', gap: 5,
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
            paddingBottom: 4, marginBottom: 10,
            scrollbarWidth: 'thin',
          }}>
            <CatChip label="Tous" active={activeCat === 'tous'} onClick={() => setActiveCat('tous')}/>
            {cats.map(c => (
              <CatChip key={c} label={c} active={activeCat === c} onClick={() => setActiveCat(c)}/>
            ))}
          </div>

          {/* ─── Liste des articles filtrés ──────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
            {filteredMenu.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: 24,
                background: 'var(--bg)',
                border: '0.5px solid var(--border)',
                borderRadius: 10,
                fontSize: 13, color: 'var(--muted)',
              }}>
                Aucun article trouvé
              </div>
            ) : (
              filteredMenu.map(item => {
                const q = qtys[item.id] || 0
                const outOfStock = (item.stock || 0) <= 0
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    background: 'var(--bg)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 10,
                    opacity: outOfStock ? 0.45 : 1,
                  }}>
                    {/* Mini-vignette photo (ou emoji ou initiale) — cliquable */}
                    {item.photoUrl ? (
                      <div
                        onClick={() => setSelectedInfoItem(item)}
                        style={{
                          position: 'relative',
                          width: 42, height: 42, borderRadius: 6,
                          overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
                          background: '#1a1a1a',
                        }}>
                        <div style={{
                          position: 'absolute', inset: 0,
                          backgroundImage: `url(${item.photoUrl})`,
                          backgroundSize: 'cover', backgroundPosition: 'center',
                          filter: 'blur(8px) brightness(0.65)',
                          transform: 'scale(1.15)',
                        }}/>
                        <img src={item.photoUrl} alt=""
                          style={{
                            position: 'absolute', inset: 0, margin: 'auto',
                            maxWidth: '100%', maxHeight: '100%',
                            objectFit: 'contain',
                          }}/>
                      </div>
                    ) : item.emoji ? (
                      <div
                        onClick={() => setSelectedInfoItem(item)}
                        style={{
                        width: 42, height: 42, borderRadius: 6,
                        background: 'var(--bg2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, flexShrink: 0, cursor: 'pointer',
                      }}>{item.emoji}</div>
                    ) : (
                      <div
                        onClick={() => setSelectedInfoItem(item)}
                        style={{
                        width: 42, height: 42, borderRadius: 6,
                        background: 'var(--bg2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: 'var(--muted)',
                        flexShrink: 0, cursor: 'pointer',
                      }}>{(item.nom || '?')[0].toUpperCase()}</div>
                    )}
                    <div
                      onClick={() => setSelectedInfoItem(item)}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      title="Voir la composition">
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.nom}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                        {((item.prix || 0) / 100).toFixed(2)} €
                        {outOfStock && <span style={{ marginLeft: 6, color: 'var(--red-dark)' }}>· Épuisé</span>}
                        {!outOfStock && item.stock <= 10 && <span style={{ marginLeft: 6, color: 'var(--gold-dark)' }}>· Stock {item.stock}</span>}
                      </div>
                    </div>
                    {q > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => changeQty(item.id, -1)}
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            border: '0.5px solid var(--border2)',
                            background: 'var(--bg2)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text)',
                          }}>
                          <Minus size={14}/>
                        </button>
                        <span style={{ fontSize: 14, fontWeight: 700, minWidth: 18, textAlign: 'center', color: 'var(--text)' }}>
                          {q}
                        </span>
                        <button onClick={() => changeQty(item.id, +1)}
                          disabled={q >= (item.stock || 0)}
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            border: '0.5px solid var(--border2)',
                            background: 'var(--bg2)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text)',
                            opacity: q >= (item.stock || 0) ? 0.4 : 1,
                          }}>
                          <Plus size={14}/>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => changeQty(item.id, +1)}
                        disabled={outOfStock}
                        style={{
                          padding: '5px 12px',
                          background: outOfStock ? 'var(--bg2)' : 'var(--brand)',
                          color: outOfStock ? 'var(--muted)' : '#fff',
                          border: 'none', borderRadius: 14,
                          fontSize: 11, fontWeight: 700,
                          cursor: outOfStock ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          whiteSpace: 'nowrap',
                        }}>
                        + Ajouter
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* ─── Récap compact dépliable + boutons valider ─────────── */}
          {cartItems.length > 0 && (
            <div style={{
              background: 'var(--bg)',
              border: '0.5px solid var(--border)',
              borderRadius: 12,
              marginBottom: 10,
              overflow: 'hidden',
            }}>
              <button onClick={() => setRecapOpen(o => !o)}
                style={{
                  width: '100%', padding: '10px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', color: 'var(--text)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingCart size={14} style={{ color: 'var(--brand)' }}/>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {nbItems} article{nbItems > 1 ? 's' : ''}
                  </span>
                  {recapOpen ? <ChevronUp size={14} style={{ color: 'var(--muted)' }}/> : <ChevronDown size={14} style={{ color: 'var(--muted)' }}/>}
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {(total / 100).toFixed(2)} €
                </span>
              </button>
              {recapOpen && (
                <div style={{ padding: '4px 14px 12px', borderTop: '0.5px solid var(--border)' }}>
                  {cartItems.map(it => (
                    <div key={it.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 0',
                      borderBottom: '0.5px solid var(--border)',
                      fontSize: 13, color: 'var(--text)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700 }}>{it.qty}×</span> {it.nom}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {((it.prix || 0) * it.qty / 100).toFixed(2)} €
                        </span>
                        <button onClick={() => removeItem(it.id)}
                          title="Retirer cet article"
                          style={{
                            background: 'transparent', border: 'none',
                            padding: 2, cursor: 'pointer',
                            color: 'var(--red-dark)',
                            display: 'flex', alignItems: 'center',
                          }}>
                          <X size={14}/>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Bloc différentiel solde — affiche solde client + manque/reste */}
                  {spec && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--muted)' }}>Solde client</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{((spec.solde || 0) / 100).toFixed(2)} €</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: soldeOk ? 'var(--green-dark)' : 'var(--red-dark)', fontWeight: 700 }}>
                          {soldeOk ? 'Solde après débit' : 'Manque'}
                        </span>
                        <span style={{ color: soldeOk ? 'var(--green-dark)' : 'var(--red-dark)', fontWeight: 700 }}>
                          {soldeOk
                            ? `${(((spec.solde || 0) - total) / 100).toFixed(2)} €`
                            : `${(manquant / 100).toFixed(2)} €`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {err && (
            <div style={{
              padding: '10px 12px', marginBottom: 10,
              background: 'var(--red-light)', color: 'var(--red-dark)',
              borderRadius: 8, fontSize: 12,
            }}>
              {err}
            </div>
          )}

          {/* ─── Boutons de validation ──────────────────────────────
              "Valider et débiter" : désactivé si solde insuffisant
              "Valider sans débit" : mis en avant (teal au lieu de gold)
                                     quand c'est la seule option viable */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => doValidate(true)}
              disabled={loading || cartItems.length === 0 || !soldeOk}
              style={{
                padding: '12px 8px',
                background: (loading || cartItems.length === 0 || !soldeOk) ? 'var(--bg2)' : 'var(--green-dark)',
                color: (loading || cartItems.length === 0 || !soldeOk) ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 10,
                fontSize: 12, fontWeight: 700,
                cursor: (loading || cartItems.length === 0 || !soldeOk) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                WebkitTapHighlightColor: 'transparent',
                minHeight: 50,
              }}>
              <span>💳 {loading ? '...' : 'Valider et débiter'}</span>
              {soldeAlert && (
                <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 500 }}>
                  Manque {(manquant / 100).toFixed(2)} €
                </span>
              )}
            </button>
            <button onClick={() => doValidate(false)}
              disabled={loading || cartItems.length === 0}
              style={{
                padding: '12px 8px',
                /* Si solde insuffisant : bouton teal mis en avant comme option viable
                   Sinon : bouton orange contour, mode différé classique */
                background: (loading || cartItems.length === 0)
                  ? 'var(--bg2)'
                  : (soldeAlert ? 'var(--brand)' : 'transparent'),
                color: (loading || cartItems.length === 0)
                  ? 'var(--muted)'
                  : (soldeAlert ? '#fff' : 'var(--gold-dark)'),
                border: (loading || cartItems.length === 0)
                  ? '0.5px solid var(--border2)'
                  : (soldeAlert ? 'none' : '0.5px solid var(--gold-dark)'),
                borderRadius: 10,
                fontSize: 12, fontWeight: 700,
                cursor: (loading || cartItems.length === 0) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                WebkitTapHighlightColor: 'transparent',
                minHeight: 50,
              }}>
              <span>⏱ {loading ? '...' : 'Valider sans débit'}</span>
              {soldeAlert && (
                <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 500 }}>
                  Paiement au retrait
                </span>
              )}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
            Le numéro de commande sera attribué automatiquement.
          </div>
        </>
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

// ─── Composant : chip catégorie ─────────────────────────────────────────
function CatChip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 12px',
        background: active ? 'var(--brand)' : 'var(--bg)',
        color: active ? '#fff' : 'var(--muted)',
        border: active ? 'none' : '0.5px solid var(--border)',
        borderRadius: 14,
        fontSize: 11, fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flexShrink: 0,
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
      }}>
      {label}
    </button>
  )
}
