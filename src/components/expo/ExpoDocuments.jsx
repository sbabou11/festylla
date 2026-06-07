/**
 * components/expo/ExpoDocuments.jsx
 *
 * Bloc de gestion des pièces jointes d'un exposant.
 * Upload Firebase Storage + liste des documents existants.
 * Utilisé dans la vue détail d'un exposant.
 */

import React, { useState, useRef } from 'react'
import { Upload, Download, Trash2, File, AlertCircle } from 'lucide-react'
import { uploadExpoDocument, deleteExpoDocument } from '../../firebase/service'

export default function ExpoDocuments({ expo, eventId }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [err, setErr]             = useState('')
  const fileInputRef = useRef(null)

  const docs = expo.documents || []

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setProgress(0); setErr('')
    try {
      await uploadExpoDocument(expo.id, file, (pct) => setProgress(pct), eventId)
    } catch (e2) {
      setErr(e2.message || 'Erreur lors du téléversement')
    } finally {
      setUploading(false); setProgress(0)
      // Reset le champ pour pouvoir re-uploader le même fichier
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (docMeta) => {
    if (!confirm(`Supprimer "${docMeta.name}" ?`)) return
    try { await deleteExpoDocument(expo.id, docMeta.path, eventId) }
    catch (e) { alert(e.message) }
  }

  const fmtSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  }

  return (
    <div style={{
      background: 'var(--bg)',
      border: '0.5px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10,
      }}>
        Pièces jointes {docs.length > 0 && `(${docs.length})`}
      </div>

      {docs.length === 0 && !uploading && (
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 10 }}>
          Aucun document joint pour l'instant.
        </div>
      )}

      {/* Liste des documents */}
      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {docs.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--bg2)', borderRadius: 6,
              fontSize: 12,
            }}>
              <File size={14} style={{ color: 'var(--muted)', flexShrink: 0 }}/>
              <div style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <div style={{ color: 'var(--text)', fontWeight: 500 }}>{d.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtSize(d.size)}</div>
              </div>
              <a href={d.url} target="_blank" rel="noopener noreferrer"
                title="Ouvrir / télécharger"
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--brand-dark)', borderRadius: 4,
                  textDecoration: 'none',
                }}>
                <Download size={13}/>
              </a>
              <button onClick={() => handleDelete(d)} title="Supprimer"
                style={{
                  width: 28, height: 28, padding: 0,
                  background: 'transparent', color: 'var(--red-dark)',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Barre de progression upload */}
      {uploading && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
            Téléversement en cours… {progress}%
          </div>
          <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: 'var(--brand)', transition: 'width .2s',
            }}/>
          </div>
        </div>
      )}

      {err && (
        <div style={{
          padding: '8px 10px', marginBottom: 10,
          background: 'var(--red-light)', color: 'var(--red-dark)',
          borderRadius: 6, fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={12}/> {err}
        </div>
      )}

      {/* Bouton upload */}
      <button onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%', padding: '10px',
          background: 'transparent', color: 'var(--text)',
          border: '0.5px dashed var(--border2)', borderRadius: 6,
          fontSize: 12, fontFamily: 'inherit',
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <Upload size={13}/> {uploading ? 'Téléversement…' : 'Téléverser un document'}
      </button>

      <input ref={fileInputRef} type="file" onChange={handleFileChange}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        style={{ display: 'none' }}/>

      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
        Formats : images, PDF, Word, Excel. Taille max : 10 Mo.
      </div>
    </div>
  )
}
