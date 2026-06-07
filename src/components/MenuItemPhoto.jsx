/**
 * components/MenuItemPhoto.jsx — Lot Image 1
 *
 * Bloc de gestion de la photo d'un article du menu.
 * - Affiche un aperçu si une photo existe (sinon zone vide cliquable)
 * - Upload Firebase Storage avec redimensionnement côté client (1200px max)
 * - Permet de remplacer ou supprimer la photo
 *
 * Nécessite un article déjà enregistré (itemId). En création, le bloc invite
 * à enregistrer d'abord (idem que les justificatifs Finances).
 */
import React, { useState, useRef } from 'react'
import { Upload, Trash2, Camera, AlertCircle, ImageIcon } from 'lucide-react'
import { uploadMenuItemPhoto, deleteMenuItemPhoto } from '../firebase/service'
import { resizeImageToBlob } from '../utils/imageUtils'

export default function MenuItemPhoto({ item, eventId, onUpdated }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const fileInputRef = useRef(null)

  if (!item || !item.id) {
    return (
      <div style={{
        fontSize: 11, color: 'var(--muted)', fontStyle: 'italic',
        padding: '12px', textAlign: 'center',
        border: '0.5px dashed var(--border2)', borderRadius: 8,
      }}>
        Enregistrez d'abord l'article pour pouvoir y ajouter une photo.
      </div>
    )
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setProgress(0); setErr('')
    try {
      // Redimensionnement côté client pour ramener les photos pro à ~200 Ko
      const blob = await resizeImageToBlob(file, 1200, 0.85)
      // Reconvertir en File pour garder un nom propre
      const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
      const result = await uploadMenuItemPhoto(item.id, compressedFile, (pct) => setProgress(pct), eventId)
      if (onUpdated) onUpdated(result)
    } catch (e2) {
      setErr(e2.message || 'Erreur lors du téléversement')
    } finally {
      setUploading(false); setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer la photo de cet article ?')) return
    try {
      await deleteMenuItemPhoto(item.id, eventId)
      if (onUpdated) onUpdated(null)
    } catch (e) { alert(e.message) }
  }

  const hasPhoto = !!item.photoUrl

  return (
    <div>
      {/* Zone d'aperçu / placeholder cliquable */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1/1',
          background: hasPhoto ? '#000' : 'var(--bg2)',
          border: '0.5px solid var(--border2)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: uploading ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {hasPhoto ? (
          <>
            {/* Fond flouté basé sur la photo */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${item.photoUrl})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(18px) brightness(0.6)',
              transform: 'scale(1.15)',
            }}/>
            {/* Photo principale entière, centrée par-dessus */}
            <img src={item.photoUrl} alt={item.nom || 'Article'}
              style={{
                position: 'relative',
                maxWidth: '100%', maxHeight: '100%',
                objectFit: 'contain', display: 'block',
              }}/>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
            <Camera size={32} style={{ opacity: 0.5, marginBottom: 6 }}/>
            <div style={{ fontSize: 11 }}>Cliquez pour ajouter une photo</div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>JPEG/PNG, max 5 Mo</div>
          </div>
        )}
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12,
          }}>
            <div>Téléversement… {progress}%</div>
            <div style={{ width: '70%', height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#fff', transition: 'width .2s' }}/>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }}/>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          style={{
            flex: 1, padding: '6px 10px', background: 'transparent', color: 'var(--text)',
            border: '0.5px solid var(--border2)', borderRadius: 6, fontSize: 11,
            cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            opacity: uploading ? 0.6 : 1,
          }}>
          <Upload size={12}/> {hasPhoto ? 'Remplacer' : 'Ajouter'}
        </button>
        {hasPhoto && (
          <button type="button" onClick={handleDelete} disabled={uploading}
            title="Supprimer la photo"
            style={{
              width: 32, padding: 0, background: 'transparent', color: 'var(--red-dark, #a32d2d)',
              border: '0.5px solid var(--border2)', borderRadius: 6,
              cursor: uploading ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              opacity: uploading ? 0.6 : 1,
            }}>
            <Trash2 size={12}/>
          </button>
        )}
      </div>

      {err && (
        <div style={{
          padding: '6px 10px', marginTop: 8,
          background: 'var(--red-light, #fcebeb)', color: 'var(--red-dark, #a32d2d)',
          borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={12}/> {err}
        </div>
      )}
    </div>
  )
}
