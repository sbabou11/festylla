// pages/billetterie/Nouveau.jsx
import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'

export default function Nouveau() {
  const { createSpectateur } = useAppStore()
  const [nom, setNom]       = useState('')
  const [solde, setSolde]   = useState(0)
  const [created, setCreated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const create = async () => {
    if (!nom.trim()) return
    setLoading(true)
    setError('')
    try {
      const id = await createSpectateur(nom.trim(), solde)
      setCreated({ id, nom: nom.trim(), solde: solde * 100 })
      setNom(''); setSolde(0)
    } catch (err) {
      setError('Erreur : ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const inp = { width:'100%', padding:'8px 10px', border:'0.5px solid var(--border2)', borderRadius:8, fontSize:13, background:'var(--bg2)', color:'var(--text)', fontFamily:'var(--font)' }
  const card = { background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 16px' }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12 }}>
      <div style={card}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'var(--text)' }}>Créer un compte spectateur</div>
        <div style={{ marginBottom:10 }}>
          <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Nom complet</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Prénom Nom" style={inp} />
        </div>
        <div style={{ marginBottom:10 }}>
          <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Solde initial (€)</label>
          <input type="number" value={solde === 0 ? '' : solde} placeholder="0" onChange={e => setSolde(parseInt(e.target.value)||0)} style={inp} />
        </div>
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {[0,20,50,100].map(v => (
            <button key={v} onClick={() => setSolde(v)} style={{ flex:1, padding:7, border:'0.5px solid var(--border2)', borderRadius:8, background:solde===v?'var(--brand)':'var(--bg2)', color:solde===v?'#fff':'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'var(--font)' }}>{v}€</button>
          ))}
        </div>
        {error && <div style={{ marginBottom:10, padding:'8px 12px', background:'var(--red-light)', borderRadius:8, fontSize:12, color:'var(--red)' }}>{error}</div>}
        <button onClick={create} disabled={loading} style={{ width:'100%', padding:8, background:loading?'var(--bg3)':'var(--brand)', color:loading?'var(--muted)':'#fff', border:'none', borderRadius:8, fontSize:13, cursor:loading?'not-allowed':'pointer', fontFamily:'var(--font)' }}>
          {loading ? 'Création en cours…' : 'Générer le QR code'}
        </button>
      </div>

      <div>
        {!created && <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Le QR code apparaîtra ici</div>}
        {created && (
          <div style={{ ...card, textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'var(--brand-dark)' }}>✓ QR code créé !</div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:12, background:'var(--bg2)', borderRadius:10, marginBottom:12 }}>
              <QrCode value={created.id} size={120} />
              <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>{created.id}</div>
              <div style={{ fontSize:18, fontWeight:700, color:'var(--brand-dark)' }}>{fmt(created.solde)}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{created.nom}</div>
            </div>
            <div style={{ padding:'9px 12px', background:'var(--brand-light)', borderRadius:8, fontSize:13, color:'var(--brand-dark)', marginBottom:10 }}>
              Remettre ce QR code au spectateur
            </div>
            <button onClick={() => setCreated(null)} style={{ padding:'7px 14px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--bg)', color:'var(--text)', fontSize:12, cursor:'pointer', fontFamily:'var(--font)' }}>
              Nouveau
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
