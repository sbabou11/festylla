/**
 * pages/admin/Spectateurs.jsx — v2
 * Super admin : voir, modifier (nom, solde), supprimer des spectateurs
 */
import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'
import { Trash2, Pencil, Search, X, Save, Plus, Minus } from 'lucide-react'
import { db } from '../../firebase/config'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'

export default function Spectateurs() {
  const { spectateurs } = useAppStore()
  const [search, setSearch]     = useState('')
  const [editing, setEditing]   = useState(null)  // { _docId, id, nom, solde }
  const [editNom, setEditNom]   = useState('')
  const [editSolde, setEditSolde] = useState(0)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)

  const filtered = spectateurs.filter(s =>
    s.nom?.toLowerCase().includes(search.toLowerCase()) ||
    s.id?.toLowerCase().includes(search.toLowerCase())
  )

  const startEdit = (s) => {
    setEditing(s)
    setEditNom(s.nom || '')
    setEditSolde(Math.round((s.solde || 0) / 100))
  }

  const saveEdit = async () => {
    if (!editing?._docId) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'spectateurs', editing._docId), {
        nom:   editNom.trim(),
        solde: editSolde * 100,
      })
      setEditing(null)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`Supprimer le compte de ${s.nom} (${s.id}) ?\n\nCette action est irréversible.`)) return
    setDeleting(s.id)
    try {
      await deleteDoc(doc(db, 'spectateurs', s._docId))
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setDeleting(null) }
  }

  const inp = {
    width: '100%', padding: '8px 10px',
    border: '0.5px solid var(--border2)', borderRadius: 8,
    fontSize: 13, background: 'var(--bg2)', color: 'var(--text)',
    fontFamily: 'var(--font)',
  }

  return (
    <div>
      {/* Barre de recherche */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou ID…"
          style={{ ...inp, paddingLeft: 32 }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Stats rapides */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total spectateurs', value: spectateurs.length },
          { label: 'Solde total en circulation', value: fmt(spectateurs.reduce((a, s) => a + (s.solde || 0), 0)) },
          { label: 'Solde moyen', value: spectateurs.length ? fmt(Math.round(spectateurs.reduce((a, s) => a + (s.solde || 0), 0) / spectateurs.length)) : '—' },
          { label: 'Résultats filtrés', value: filtered.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {search ? `Aucun résultat pour "${search}"` : 'Aucun spectateur enregistré'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 480, fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['ID QR', 'Nom', 'Solde', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', borderBottom: '0.5px solid var(--border)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} style={{ background: editing?.id === s.id ? 'var(--brand-light)' : 'transparent' }}>

                    {/* ID QR */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <QrCode value={s.id} size={36}/>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{s.id}</span>
                      </div>
                    </td>

                    {/* Nom — éditable */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      {editing?.id === s.id ? (
                        <input
                          value={editNom}
                          onChange={e => setEditNom(e.target.value)}
                          style={{ ...inp, width: 160 }}
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.nom}</span>
                      )}
                    </td>

                    {/* Solde — éditable */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      {editing?.id === s.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => setEditSolde(v => Math.max(0, v - 10))}
                            style={{ width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                            <Minus size={12}/>
                          </button>
                          <input
                            type="number"
                            value={editSolde}
                            onChange={e => setEditSolde(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ ...inp, width: 80, textAlign: 'center' }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>€</span>
                          <button onClick={() => setEditSolde(v => v + 10)}
                            style={{ width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                            <Plus size={12}/>
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 600, color: (s.solde || 0) > 0 ? 'var(--brand-dark)' : 'var(--muted)' }}>
                          {fmt(s.solde || 0)}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      {editing?.id === s.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={saveEdit} disabled={saving}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <Save size={11}/> {saving ? '…' : 'Sauvegarder'}
                          </button>
                          <button onClick={() => setEditing(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <X size={11}/> Annuler
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <Pencil size={11}/> Modifier
                          </button>
                          <button onClick={() => handleDelete(s)} disabled={deleting === s.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid #F09595', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <Trash2 size={11}/> {deleting === s.id ? '…' : 'Supprimer'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
