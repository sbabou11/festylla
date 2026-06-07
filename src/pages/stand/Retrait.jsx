/**
 * pages/stand/Retrait.jsx — ergonomie optimisée
 */
import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { fmt } from '../../utils/helpers'
import QrScanner from '../../components/QrScanner'
import { CheckCircle, RefreshCw, Package } from 'lucide-react'

export default function Retrait() {
  const { reservations, spectateurs, validerRetrait } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const [specId, setSpecId]   = useState(null)
  const [specNom, setSpecNom] = useState('')
  const [myResas, setMyResas] = useState([])
  const [done, setDone]       = useState(null)
  const [loading, setLoading] = useState(null)
  const [searching, setSearching] = useState(false)
  const [err, setErr]         = useState('')

  const findById = async (id) => {
    const uid = id.toUpperCase().trim()
    setSearching(true); setErr('')

    // Priorité : eventId du staff > currentEventId > tous les événements
    const staffEventId = user?.eventId || currentEventId
    const evIds = staffEventId
      ? [staffEventId, ...(events||[]).map(e => e.id).filter(i => i !== staffEventId)]
      : (events||[]).map(e => e.id)

    try {
      for (const evId of evIds) {
        // Chercher le spectateur dans cet événement
        const snapSpec = await getDocs(
          query(collection(db, 'events', evId, 'spectateurs'), where('id', '==', uid))
        )
        if (!snapSpec.empty) {
          const specData = snapSpec.docs[0].data()
          // Chercher ses réservations actives dans le même événement
          const snapResa = await getDocs(
            query(collection(db, 'events', evId, 'reservations'), where('specId', '==', uid))
          )
          const resas = snapResa.docs
            .map(d => ({ ...d.data(), id: d.id }))
            .filter(r => r.status !== 'collected' && r.status !== 'cancelled')
          if (!resas.length) {
            setErr(`${specData.nom} n'a pas de réservation active.`)
            setSearching(false); return
          }
          setSpecId(uid)
          setSpecNom(specData.nom)
          setMyResas(resas)
          setErr('')
          setSearching(false)
          return
        }
      }
      setErr('Compte introuvable : ' + uid)
    } catch(e) {
      setErr('Erreur de recherche : ' + e.message)
    }
    setSearching(false)
  }

  const doRetrait = async (resa) => {
    setLoading(resa.id)
    try {
      await validerRetrait(resa.id)
      setDone({ nom: resa.specNom, items: resa.items, total: resa.total })
      setSpecId(null)
    } catch (e) { setErr(e.message) }
    finally { setLoading(null) }
  }

  const reset = () => { setDone(null); setSpecId(null); setSpecNom(''); setMyResas([]); setErr('') }

  // myResas est maintenant géré dans findById (état local)
  const readyResas = reservations.filter(r => r.status === 'ready')

  if (done) return (
    <div style={{ maxWidth:400, margin:'0 auto', padding:'24px 0' }}>
      <div style={{ textAlign:'center', padding:'32px 20px', background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)' }}>
        <CheckCircle size={52} style={{ color:'var(--brand)', marginBottom:16 }}/>
        <div style={{ fontSize:22, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Retrait validé !</div>
        <div style={{ fontSize:15, color:'var(--muted)', marginBottom:10 }}>{done.nom}</div>
        <div style={{ fontSize:13, color:'var(--muted)', marginBottom:6 }}>{(done.items||[]).map(i=>`${i.nom} ×${i.qty}`).join(' · ')}</div>
        <div style={{ fontSize:24, fontWeight:700, color:'var(--red)', marginBottom:24 }}>−{fmt(done.total)}</div>
        <button onClick={reset} className="btn-primary" style={{ width:'100%' }}>
          <RefreshCw size={16}/> Client suivant
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth:520, margin:'0 auto' }}>

      {/* Scanner */}
      {!specId && (
        <div className="card">
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Scanner le QR code</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>Scannez pour voir les réservations du spectateur</div>
          <QrScanner onScan={findById} placeholder="FY-XXXX"/>
          {searching && <div style={{ marginTop:10, padding:'10px 14px', background:'var(--brand-light)', borderRadius:'var(--radius)', fontSize:13, color:'var(--brand-dark)', fontWeight:500 }}>🔍 Recherche en cours…</div>}
          {err && <div style={{ marginTop:10, padding:'10px 14px', background:'var(--red-light)', borderRadius:'var(--radius)', fontSize:13, color:'var(--red)', fontWeight:500 }}>{err}</div>}
        </div>
      )}

      {/* Réservations du spectateur scanné */}
      {specId && myResas.length > 0 && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>Réservations de {specNom}</div>
            <button onClick={() => { setSpecId(null); setSpecNom(''); setMyResas([]); setErr('') }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18 }}>✕</button>
          </div>
          {myResas.map(r => (
            <div key={r.id} style={{ padding:14, background:r.status==='ready'?'var(--brand-light)':'var(--amber-light)', border:`1px solid ${r.status==='ready'?'#5DCAA5':'#EF9F27'}`, borderRadius:'var(--radius)', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{(r.items||[]).map(i=>`${i.nom} ×${i.qty}`).join(' · ')}</span>
                <span style={{ fontSize:12, fontWeight:700, color:r.status==='ready'?'var(--brand-dark)':'var(--amber)' }}>
                  {r.status==='ready'?'✓ Prêt':'En attente'}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontFamily:'monospace', fontSize:12, color:'var(--muted)' }}>{r.code}</span>
                <span style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>{fmt(r.total||0)}</span>
              </div>
              {r.status === 'ready' && (
                <button onClick={() => doRetrait(r)} disabled={loading===r.id} className="btn-primary"
                  style={{ width:'100%', marginTop:10 }}>
                  {loading===r.id ? 'Traitement…' : `Valider le retrait — débiter ${fmt(r.total||0)}`}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toutes les réservations prêtes */}
      {readyResas.length > 0 && !specId && (
        <div className="card">
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
            <Package size={16}/> Prêtes à retirer ({readyResas.length})
          </div>
          {readyResas.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{r.specNom}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{(r.items||[]).map(i=>`${i.nom} ×${i.qty}`).join(' · ')}</div>
              </div>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--brand-dark)' }}>{fmt(r.total||0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
