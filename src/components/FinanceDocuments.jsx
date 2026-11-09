/**
 * components/FinanceDocuments.jsx — Lot Finances 2
 *
 * Bloc de gestion des justificatifs (factures/reçus) d'un mouvement financier.
 * Upload Firebase Storage + liste + suppression. Calqué sur ExpoDocuments.
 *
 * Nécessite un mouvement déjà enregistré (financeId). En création, le bloc
 * invite à enregistrer d'abord.
 */
import React, { useState, useRef } from 'react'
import { Upload, Download, Trash2, File, AlertCircle } from 'lucide-react'
import { uploadFinanceDocument, deleteFinanceDocument } from '../firebase/service'

export default function FinanceDocuments({ finance, eventId }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const fileInputRef = useRef(null)

  if (!finance || !finance.id) {
    return (
      <div style={{ fontSize: 11, color: 'var(--muted, #64748b)', fontStyle: 'italic', padding: '8px 0' }}>
        Enregistrez d'abord le mouvement pour pouvoir y joindre une facture.
      </div>
    )
  }

  const docs = finance.documents || []

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setProgress(0); setErr('')
    try {
      await uploadFinanceDocument(finance.id, file, (pct) => setProgress(pct), eventId)
    } catch (e2) {
      setErr(e2.message || 'Erreur lors du téléversement')
    } finally {
      setUploading(false); setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (docMeta) => {
    if (!confirm(`Supprimer « ${docMeta.name} » ?`)) return
    try { await deleteFinanceDocument(finance.id, docMeta.path, eventId) }
    catch (e) { alert(e.message) }
  }

  const fmtSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  }

  return (
    <div>
      {docs.length === 0 && !uploading && (
        <div style={{ fontSize: 12, color: 'var(--muted, #64748b)', fontStyle: 'italic', marginBottom: 10 }}>
          Aucun justificatif joint.
        </div>
      )}

      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {docs.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--bg, #f8f9fa)', borderRadius: 6, fontSize: 12,
            }}>
              <File size={14} style={{ color: 'var(--muted, #64748b)', flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <div style={{ color: 'var(--text, #1a1a1a)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted, #64748b)' }}>{fmtSize(d.size)}</div>
              </div>
              <a href={d.url} target="_blank" rel="noopener noreferrer" title="Ouvrir / télécharger"
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-dark, #134e5a)', borderRadius: 4, textDecoration: 'none' }}>
                <Download size={13}/>
              </a>
              <button onClick={() => handleDelete(d)} title="Supprimer"
                style={{ width: 28, height: 28, padding: 0, background: 'transparent', color: 'var(--red-dark, #a32d2d)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--muted, #64748b)', marginBottom: 4 }}>Téléversement… {progress}%</div>
          <div style={{ height: 4, background: 'var(--bg, #f8f9fa)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--brand, #1a6b7a)', transition: 'width .2s' }}/>
          </div>
        </div>
      )}

      {err && (
        <div style={{ padding: '8px 10px', marginBottom: 10, background: 'var(--red-light, #fcebeb)', color: 'var(--red-dark, #a32d2d)', borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={12}/> {err}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileChange} style={{ display: 'none' }}/>
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
        style={{ width: '100%', padding: '10px', background: 'transparent', color: 'var(--text, #1a1a1a)', border: '0.5px dashed var(--border, #e2e8f0)', borderRadius: 6, fontSize: 12, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: uploading ? 0.6 : 1 }}>
        <Upload size={14}/> Joindre une facture (image ou PDF, max 10 Mo)
      </button>
    </div>
  )
}
