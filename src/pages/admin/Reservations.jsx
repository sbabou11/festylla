/**
 * pages/admin/Reservations.jsx — v3
 * Statuts : pending → processing → ready → collected / cancelled
 * Droits  : seul le staff assigné (ou admin) peut changer le statut après processing
 */
import React, { useState, useMemo } from 'react'
import useAppStore  from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt }      from '../../utils/helpers'
import { Clock, ChefHat, CheckCircle, Package, XCircle, Loader } from 'lucide-react'

const STATUTS = {
  pending:    { label: 'En revue',           color: '#BA7517', bg: '#FEF3C7', icon: Clock       },
  processing: { label: 'En préparation',     color: '#F07848', bg: '#EDE9FE', icon: ChefHat     },
  ready:      { label: 'Prête',              color: '#065f46', bg: '#D1FAE5', icon: CheckCircle  },
  collected:  { label: 'Retirée',            color: '#64748b', bg: '#F1F5F9', icon: Package      },
  cancelled:  { label: 'Annulée',            color: '#DC2626', bg: '#FEE2E2', icon: XCircle      },
}

// Label dynamique pour les annulations
const getCancelLabel = (resa) => {
  if (resa.status !== 'cancelled') return STATUTS[resa.status]?.label || resa.status
  if (!resa.cancelledBy) return 'Annulée'
  if (resa.cancelledByRole === 'spectateur') return 'Annulée par client'
  if (resa.cancelledByRole === 'admin' || resa.cancelledByRole === 'super_admin') return 'Annulée par Admin'
  if (resa.cancelledByRole === 'stand' || resa.cancelledByRole === 'billetterie') return 'Annulée par Staff'
  return 'Annulée par Staff'
}

const MOTIFS = [
  'Plus en stock',
  'Temporairement indisponible',
  'Autres',
]

export default function Reservations() {
  const { reservations, prendreEnCharge, marquerResaPrete, validerRetrait, annulerReservation, deleteReservation, menu } = useAppStore()
  const { user } = useAuthStore()

  const [filter,     setFilter]     = useState('all')
  const [loading,    setLoading]    = useState(null)
  const [err,        setErr]        = useState('')
  // Modale annulation
  const [annulModal, setAnnulModal] = useState(null)
  const [visible,    setVisible]    = useState(10)
  const [motifIdx,   setMotifIdx]   = useState(0)
  const [motifTexte, setMotifTexte] = useState('')
  const [sortBy,     setSortBy]     = useState('date_desc') // date_desc | date_asc | statut | montant_desc | montant_asc

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  // Le rôle consultation est en lecture seule — il voit tout mais ne peut rien modifier.
  // Note : la vraie sécurité passe par les règles Firestore côté serveur ;
  // ceci n'est qu'une protection UI/UX cohérente.
  const isReadOnly = user?.role === 'consultation'

  const canAct = (resa) => {
    if (isReadOnly) return false
    if (isAdmin) return true
    if (resa.status === 'pending') return true
    return resa.assignedStaffId === user?.id
  }

  // Réinitialiser la pagination quand filtre ou tri change
  const prevFilter = React.useRef(filter)
  const prevSort   = React.useRef(sortBy)
  if (prevFilter.current !== filter || prevSort.current !== sortBy) {
    prevFilter.current = filter
    prevSort.current   = sortBy
    setVisible(10)
  }

  const sorted = useMemo(() => {
    const filtered = [...reservations].filter(r => filter === 'all' || r.status === filter)
    return filtered.sort((a, b) => {
      if (sortBy === 'date_desc') {
        const ta = a.createdAt?.seconds || new Date(a.date || 0).getTime()/1000
        const tb = b.createdAt?.seconds || new Date(b.date || 0).getTime()/1000
        return tb - ta
      }
      if (sortBy === 'date_asc') {
        const ta = a.createdAt?.seconds || new Date(a.date || 0).getTime()/1000
        const tb = b.createdAt?.seconds || new Date(b.date || 0).getTime()/1000
        return ta - tb
      }
      if (sortBy === 'statut') {
        const order = { pending:0, processing:1, ready:2, collected:3, cancelled:4 }
        return (order[a.status]??5) - (order[b.status]??5)
      }
      if (sortBy === 'montant_desc') return (b.total||0) - (a.total||0)
      if (sortBy === 'montant_asc')  return (a.total||0) - (b.total||0)
      return 0
    })
  }, [reservations, filter, sortBy])

  const act = async (fn, id) => {
    setLoading(id); setErr('')
    try { await fn() }
    catch (e) { setErr(e.message) }
    finally { setLoading(null) }
  }

  const doAnnuler = async () => {
    // Garde-fou : le rôle consultation ne peut pas annuler (lecture seule).
    // Protection client uniquement — la vraie sécurité passe par les règles Firestore.
    if (isReadOnly) {
      alert("Vous n'avez pas le droit de modifier les réservations.")
      setAnnulModal(null)
      return
    }
    const motif = motifIdx === 2 ? (motifTexte.trim() || 'Autres') : MOTIFS[motifIdx]
    setLoading(annulModal); setErr('')
    try {
      await annulerReservation(annulModal, motif)
      setAnnulModal(null); setMotifIdx(0); setMotifTexte('')
    } catch (e) { setErr(e.message) }
    finally { setLoading(null) }
  }

  const card  = { background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 16px', marginBottom:10 }
  const btn   = (color, bg) => ({ padding:'6px 12px', border:`1px solid ${color}`, borderRadius:8, background:bg, color, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', display:'flex', alignItems:'center', gap:5 })
  const inp   = { width:'100%', padding:'8px 10px', border:'1px solid var(--border2)', borderRadius:8, fontSize:13, background:'var(--bg2)', color:'var(--text)', fontFamily:'var(--font)', boxSizing:'border-box' }

  return (
    <div>
      {/* Bandeau "Lecture seule" pour le rôle consultation */}
      {isReadOnly && (
        <div style={{
          background: 'var(--brand-light)',
          border: '0.5px solid var(--brand)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12,
          color: 'var(--brand-dark)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span>
            <strong>Lecture seule.</strong> Vous pouvez consulter les réservations mais pas modifier leur statut.
          </span>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
        {[['all','Toutes'], ...Object.entries(STATUTS).map(([k,v]) => [k, v.label])].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'var(--font)', fontSize:12, fontWeight:filter===k?700:400, background:filter===k?'var(--brand)':'var(--bg2)', color:filter===k?'#fff':'var(--muted)' }}>
            {l} {k !== 'all' && `(${reservations.filter(r => r.status === k).length})`}
          </button>
        ))}
      </div>

      {/* Tri */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>Trier par :</span>
        {[
          ['date_desc', '⬇ Plus récentes'],
          ['date_asc',  '⬆ Plus anciennes'],
          ['statut',    '📋 Statut'],
          ['montant_desc', '💰 Montant ⬇'],
          ['montant_asc',  '💰 Montant ⬆'],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setSortBy(val)}
            style={{ padding:'4px 10px', borderRadius:16, border:'none', cursor:'pointer', fontFamily:'var(--font)', fontSize:11, fontWeight:sortBy===val?700:400, background:sortBy===val?'var(--brand-dark)':'var(--bg2)', color:sortBy===val?'#fff':'var(--muted)', transition:'all .12s' }}>
            {label}
          </button>
        ))}
      </div>

      {err && <div style={{ padding:'8px 12px', background:'var(--red-light)', color:'var(--red)', borderRadius:8, fontSize:13, marginBottom:10 }}>{err}</div>}

      {sorted.length === 0 && (
        <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)', fontSize:14 }}>Aucune réservation</div>
      )}

      {sorted.slice(0, visible).map(resa => {
        const st   = STATUTS[resa.status] || STATUTS.pending
        const cancelLabel = getCancelLabel(resa)
        const Icon = st.icon
        const can  = canAct(resa)
        const items = (resa.items||[]).map(i => i.nom + (i.qty>1?` ×${i.qty}`:'')).join(', ')
        const isLoading = loading === resa.id

        return (
          <div key={resa.id} style={card}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ padding:'3px 10px', borderRadius:20, background:st.bg, color:st.color, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                  <Icon size={11}/> {resa.status === 'cancelled' ? cancelLabel : st.label}
                </div>
                <span style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)' }}>#{resa.code}</span>
              </div>
              <span style={{ fontSize:12, color:'var(--muted)' }}>{resa.date}</span>
            </div>

            {/* Infos */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:3, display:'flex', alignItems:'center', gap:8 }}>
                {resa.benevoleNom || resa.specNom}
                {resa.isBenev && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:'#EDE9FE', color:'#F07848', fontWeight:700 }}>Bénévole</span>}
              </div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:4 }}>{items}</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--brand-dark)' }}>
                {(() => {
                  if (resa.total && !isNaN(resa.total)) return fmt(resa.total)
                  // Calculer depuis les articles si total manquant (résa bénévole)
                  const total = (resa.items||[]).reduce((acc, item) => {
                    const menuItem = menu.find(m => m.id === item.id)
                    return acc + ((menuItem?.prix || item.prix || 0) * (item.qty || 1))
                  }, 0)
                  return total > 0 ? fmt(total) : '—'
                })()}
              </div>
              {resa.assignedStaff && resa.status !== 'pending' && (
                <div style={{ fontSize:12, color:'#F07848', marginTop:4 }}>
                  👨‍🍳 Pris en charge par <strong>{resa.assignedStaff}</strong>
                </div>
              )}
              {resa.status === 'cancelled' && resa.motifAnnulation && (
                <div style={{ fontSize:12, color:'var(--red)', marginTop:4 }}>
                  Motif : {resa.motifAnnulation}
                </div>
              )}
            </div>

            {/* Actions — masquées pour le rôle consultation (lecture seule) */}
            {!isReadOnly && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {/* Pending → Prendre en charge ou Annuler */}
              {resa.status === 'pending' && (
                <>
                  <button onClick={() => act(() => prendreEnCharge(resa.id), resa.id)} disabled={isLoading}
                    style={btn('#F07848', '#EDE9FE')}>
                    {isLoading ? <Loader size={11}/> : <ChefHat size={11}/>} Prendre en charge
                  </button>
                  <button onClick={() => setAnnulModal(resa.id)}
                    style={btn('#DC2626', '#FEE2E2')}>
                    <XCircle size={11}/> Annuler
                  </button>
                </>
              )}

              {/* Processing → Marquer prête ou Annuler (si droits) */}
              {resa.status === 'processing' && can && (
                <>
                  <button onClick={() => act(() => marquerResaPrete(resa.id), resa.id)} disabled={isLoading}
                    style={btn('#065f46', '#D1FAE5')}>
                    {isLoading ? <Loader size={11}/> : <CheckCircle size={11}/>} Marquer prête
                  </button>
                  <button onClick={() => setAnnulModal(resa.id)}
                    style={btn('#DC2626', '#FEE2E2')}>
                    <XCircle size={11}/> Annuler
                  </button>
                </>
              )}

              {/* Processing mais pas les droits */}
              {resa.status === 'processing' && !can && (
                <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
                  En charge par {resa.assignedStaff} — vous ne pouvez pas modifier
                </div>
              )}

              {/* Ready → Valider retrait */}
              {resa.status === 'ready' && can && (
                <button onClick={() => act(() => validerRetrait(resa.id), resa.id)} disabled={isLoading}
                  style={btn('#009090', '#CCFBF1')}>
                  {isLoading ? <Loader size={11}/> : <Package size={11}/>} Valider le retrait
                </button>
              )}

              {/* Supprimer (admin uniquement, après annulation ou retrait) */}
              {isAdmin && (resa.status === 'cancelled' || resa.status === 'collected') && (
                <button onClick={() => {
                  if (window.confirm('Supprimer définitivement cette réservation ?')) {
                    act(() => deleteReservation(resa.id), resa.id)
                  }
                }} disabled={isLoading}
                  style={btn('#DC2626', '#FEE2E2')}>
                  {isLoading ? <Loader size={11}/> : <XCircle size={11}/>} Supprimer
                </button>
              )}
            </div>
            )}
          </div>
        )
      })}

      {/* Pagination */}
      {sorted.length > 10 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'14px 0', flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>
            {Math.min(visible, sorted.length)} / {sorted.length} réservations
          </span>
          {visible < sorted.length && (
            <button onClick={() => setVisible(v => v + 10)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--brand)', borderRadius:20, background:'var(--brand-light)', color:'var(--brand-dark)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
              Afficher 10 de plus
            </button>
          )}
          {visible > 10 && (
            <button onClick={() => setVisible(10)}
              style={{ padding:'7px 18px', border:'0.5px solid var(--border2)', borderRadius:20, background:'var(--bg2)', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
              Afficher moins
            </button>
          )}
        </div>
      )}

      {/* Modale annulation */}
      {annulModal && (
        <div onClick={() => setAnnulModal(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg)', borderRadius:16, padding:24, width:'100%', maxWidth:380, boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:16 }}>Motif d'annulation</div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {MOTIFS.map((m, i) => (
                <label key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${motifIdx===i?'var(--brand)':'var(--border)'}`, background:motifIdx===i?'var(--brand-light)':'var(--bg2)', cursor:'pointer' }}>
                  <input type="radio" checked={motifIdx===i} onChange={() => setMotifIdx(i)} style={{ accentColor:'var(--brand)' }}/>
                  <span style={{ fontSize:13, color:'var(--text)', fontWeight:motifIdx===i?600:400 }}>{m}</span>
                </label>
              ))}
            </div>

            {motifIdx === 2 && (
              <div style={{ marginBottom:16 }}>
                <textarea value={motifTexte} onChange={e => setMotifTexte(e.target.value)}
                  placeholder="Précisez le motif…"
                  rows={3}
                  style={{ ...inp, resize:'vertical' }}/>
              </div>
            )}

            {err && <div style={{ padding:'8px 12px', background:'var(--red-light)', color:'var(--red)', borderRadius:8, fontSize:12, marginBottom:12 }}>{err}</div>}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={doAnnuler} disabled={loading === annulModal || (motifIdx === 2 && !motifTexte.trim())}
                style={{ flex:1, padding:'10px', background:'var(--red)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', opacity: loading===annulModal ? .6 : 1 }}>
                {loading === annulModal ? 'Annulation\u2026' : "Confirmer l\u2019annulation"}
              </button>
              <button onClick={() => { setAnnulModal(null); setErr('') }}
                style={{ padding:'10px 16px', border:'1px solid var(--border2)', borderRadius:10, background:'var(--bg2)', color:'var(--text)', fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                Retour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
