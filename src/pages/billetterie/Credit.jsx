/**
 * pages/billetterie/Credit.jsx — ergonomie optimisée
 * Flux : scanner → choisir montant (1 tap) → confirmer
 * Boutons larges, retour visuel immédiat, aucune étape inutile
 */
import React, { useState } from 'react'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db }        from '../../firebase/config'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'
import QrScanner from '../../components/QrScanner'
import { CheckCircle, Wallet, RefreshCw } from 'lucide-react'

const MONTANTS = [10, 20, 30, 50, 100]

export default function Credit() {
  const { spectateurs, crediter } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const [spec, setSpec]     = useState(null)
  const [montant, setMontant] = useState(0)
  const [moyen, setMoyen]   = useState('Espèces')
  const [done, setDone]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState('')

  const findById = async (id) => {
    const uid = id.toUpperCase().trim()

    // 1. Chercher dans le store local (rapide)
    const local = spectateurs.find(x => x.id === uid)
    if (local) { setSpec(local); setErr(''); return }

    // 2. Chercher dans Firebase — événement actif d'abord
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
      setErr('Compte introuvable : ' + uid)
      setSpec(null)
    } catch (e) {
      setErr('Erreur de recherche : ' + e.message)
      setSpec(null)
    }
  }

  const doCredit = async () => {
    if (!spec || !montant) return
    setLoading(true)
    try {
      await crediter(spec.id, montant, undefined, spec._eventId || currentEventId)
      setDone({ nom: spec.nom, montant, newSolde: spec.solde + montant * 100 })
      setSpec(null); setMontant(20)
    } catch (e) { setErr('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }

  const reset = () => { setDone(null); setSpec(null); setErr(''); setMontant(20) }

  // ── Succès ─────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ maxWidth:400, margin:'0 auto', padding:'24px 0' }}>
      <div style={{ textAlign:'center', padding:'32px 20px', background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)' }}>
        <CheckCircle size={52} style={{ color:'var(--brand)', marginBottom:16 }}/>
        <div style={{ fontSize:22, fontWeight:700, color:'var(--text)', marginBottom:6 }}>
          {done.montant}€ crédités !
        </div>
        <div style={{ fontSize:15, color:'var(--muted)', marginBottom:20 }}>{done.nom}</div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'var(--brand-light)', borderRadius:12, padding:'10px 20px', marginBottom:24 }}>
          <Wallet size={18} style={{ color:'var(--brand-dark)' }}/>
          <span style={{ fontSize:22, fontWeight:700, color:'var(--brand-dark)' }}>{fmt(done.newSolde)}</span>
        </div>
        <br/>
        <button onClick={reset} className="btn-primary" style={{ width:'100%' }}>
          <RefreshCw size={16}/> Nouveau client
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth:520, margin:'0 auto' }}>

      {/* Étape 1 — Scanner */}
      {!spec && (
        <div className="card">
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Identifier le spectateur</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>Scannez le QR code ou entrez l'ID</div>
          <QrScanner onScan={findById} placeholder="Ex : FY-4A2B"/>
          {err && <div style={{ marginTop:10, padding:'10px 14px', background:'var(--red-light)', borderRadius:'var(--radius)', fontSize:13, color:'var(--red)', fontWeight:500 }}>{err}</div>}
        </div>
      )}

      {/* Étape 2 — Créditer */}
      {spec && (
        <>
          {/* Fiche spectateur — dégradé marine-teal */}
          <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'var(--grad-marine-teal)', borderRadius:'var(--radius-lg)', marginBottom:12, color:'#fff' }}>
            <div style={{ background:'#FFF8F2', padding:6, borderRadius:8 }}>
              <QrCode value={spec.id} size={56}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{spec.nom}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.75)', fontFamily:'monospace' }}>{spec.id}</div>
              <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginTop:2 }}>{fmt(spec.solde)}</div>
            </div>
            <button onClick={() => setSpec(null)} style={{ background:'rgba(255,255,255,.18)', border:'none', cursor:'pointer', color:'#fff', padding:'6px 10px', borderRadius:6, fontSize:14 }}>✕</button>
          </div>

          <div className="card">
            {/* Montants rapides — boutons larges */}
            <div style={{ fontSize:13, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
              Montant à créditer
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:14 }}>
              {MONTANTS.map(v => (
                <button key={v} onClick={() => setMontant(v)}
                  style={{ minHeight:52, borderRadius:'var(--radius)', border:`2px solid ${montant===v?'var(--brand)':'var(--border)'}`, background:montant===v?'var(--brand)':'var(--bg2)', color:montant===v?'#fff':'var(--text)', fontSize:15, fontWeight:700, cursor:'pointer', transition:'all .12s', fontFamily:'var(--font)' }}>
                  {v}€
                </button>
              ))}
            </div>

            {/* Montant personnalisé */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <span style={{ fontSize:13, color:'var(--muted)', whiteSpace:'nowrap' }}>Autre montant :</span>
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                <input type="number"
                  value={montant === 0 ? '' : montant}
                  placeholder="0"
                  min={1} max={500}
                  step="0.01" inputMode="decimal"
                  onChange={e => setMontant(parseFloat(e.target.value)||0)}
                  className="inp" style={{ textAlign:'center', fontSize:18, fontWeight:700, flex:1 }}/>
                <span style={{ fontSize:15, color:'var(--text)', fontWeight:600 }}>€</span>
              </div>
            </div>

            {/* Mode de paiement */}
            <div style={{ fontSize:13, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
              Mode de paiement
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
              {['Espèces','Carte bancaire'].map(m => (
                <button key={m} onClick={() => setMoyen(m)}
                  style={{ minHeight:44, borderRadius:'var(--radius)', border:`2px solid ${moyen===m?'var(--brand)':'var(--border)'}`, background:moyen===m?'var(--brand-light)':'var(--bg2)', color:moyen===m?'var(--brand-dark)':'var(--text)', fontSize:13, fontWeight:moyen===m?700:400, cursor:'pointer', transition:'all .12s', fontFamily:'var(--font)' }}>
                  {m === 'Espèces' ? '💵 ' : '💳 '}{m}
                </button>
              ))}
            </div>

            {err && <div style={{ marginBottom:14, padding:'10px 14px', background:'var(--red-light)', borderRadius:'var(--radius)', fontSize:13, color:'var(--red)' }}>{err}</div>}

            {/* CTA principal — très grand et visible */}
            <button onClick={doCredit} disabled={loading || !montant || montant < 1} className="btn-primary"
              style={{ width:'100%', fontSize:16, height:56, borderRadius:'var(--radius)' }}>
              {loading ? 'Traitement…' : `Créditer ${montant}€ — ${moyen}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
