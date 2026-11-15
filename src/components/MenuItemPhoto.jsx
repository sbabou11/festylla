/**
 * components/MenuItemPhoto.jsx — Lot Image 1
 *
 * Bloc de gestion de la photo d'un article du menu.
 * - Affiche un aperçu si une photo existe (sinon zone vide cliquable)
 * - Upload Firebase Storage avec redimensionnement côté client (1200px max)
 * - Permet de remplacer ou supprimer la photo
 *
 * - « Générer l'image » : image carrée créée par Higgsfield à partir de la fiche
 *   enregistrée (nom, catégorie, description), avec aperçu avant de la garder
 *
 * Nécessite un article déjà enregistré (itemId). En création, le bloc invite
 * à enregistrer d'abord (idem que les justificatifs Finances).
 */
import React, { useState, useRef, useEffect } from 'react'
import { Upload, Trash2, Camera, AlertCircle, Sparkles, RotateCcw, Check, X } from 'lucide-react'
import { uploadMenuItemPhoto, deleteMenuItemPhoto } from '../firebase/service'
import { resizeImageToBlob } from '../utils/imageUtils'
import { generateMenuImage } from '../utils/generateImage'
import { Dialog, Button, toast } from '../ui'

export default function MenuItemPhoto({ item, eventId, onUpdated }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const fileInputRef = useRef(null)
  // Génération : null, { running: true } ou { blob, url } (aperçu à valider)
  const [gen, setGen] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const abortRef = useRef(null)

  // Arrête une génération en cours si on quitte la fiche, libère l'aperçu
  useEffect(() => () => { abortRef.current?.abort() }, [])
  useEffect(() => () => { if (gen?.url) URL.revokeObjectURL(gen.url) }, [gen])

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
    setConfirmDelete(false)
    try {
      await deleteMenuItemPhoto(item.id, eventId)
      if (onUpdated) onUpdated(null)
      toast.success('Photo supprimée')
    } catch (e) { setErr(e.message || 'Suppression impossible') }
  }

  const handleGenerate = async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setErr(''); setGen({ running: true })
    try {
      const blob = await generateMenuImage({ eventId, itemId: item.id, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      setGen({ blob, url: URL.createObjectURL(blob) })
    } catch (e) {
      if (e.name === 'AbortError') return
      setGen(null); setErr(e.message || 'La génération a échoué')
    }
  }

  const cancelGenerate = () => { abortRef.current?.abort(); setGen(null) }

  const keepGenerated = async () => {
    if (!gen?.blob) return
    setUploading(true); setProgress(0); setErr('')
    try {
      const jpeg = await resizeImageToBlob(gen.blob, 1024, 0.88)
      const file = new File([jpeg], `image-generee-${item.id}.jpg`, { type: 'image/jpeg' })
      const result = await uploadMenuItemPhoto(item.id, file, (pct) => setProgress(pct), eventId, { photoGenerated: true })
      setGen(null)
      if (onUpdated) onUpdated(result)
      toast.success('Image enregistrée')
    } catch (e) {
      setErr(e.message || 'Enregistrement impossible')
    } finally {
      setUploading(false); setProgress(0)
    }
  }

  const hasPhoto = !!item.photoUrl
  const running = !!gen?.running
  const preview = gen?.url || null
  const busy = uploading || running

  return (
    <div>
      {/* Zone d'aperçu / placeholder cliquable */}
      <div
        onClick={() => !busy && !preview && fileInputRef.current?.click()}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1/1',
          background: hasPhoto ? '#000' : 'var(--bg2)',
          border: '0.5px solid var(--border2)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: busy ? 'wait' : preview ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {preview ? (
          <img src={preview} alt={`Image proposée pour ${item.nom || "l'article"}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : hasPhoto ? (
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
        {running && (
          <div role="status" style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, color: '#fff', fontSize: 12, textAlign: 'center', padding: 12,
          }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'yc-spin 0.8s linear infinite' }} aria-hidden="true"/>
            <div>Création de l'image…</div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>En général 10 à 30 secondes</div>
          </div>
        )}
        {preview && !uploading && (
          <div style={{
            position: 'absolute', left: 8, top: 8, padding: '3px 8px', borderRadius: 999,
            background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 600,
          }}>Aperçu, pas encore enregistré</div>
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

      {/* Actions de l'aperçu généré */}
      {(preview || running) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {preview && <Button size="sm" icon={Check} onClick={keepGenerated} loading={uploading}>Garder</Button>}
          {preview && <Button size="sm" variant="secondary" icon={RotateCcw} onClick={handleGenerate} disabled={uploading}>Régénérer</Button>}
          <Button size="sm" variant="ghost" icon={X} onClick={cancelGenerate} disabled={uploading}>Annuler</Button>
        </div>
      )}

      {/* Actions */}
      {!preview && !running && <>
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
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={uploading}
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
      <button type="button" onClick={handleGenerate} disabled={uploading}
        style={{
          width: '100%', marginTop: 6, padding: '6px 10px',
          background: 'var(--brand-light, #e6f3f5)', color: 'var(--brand-dark, #0f4c57)',
          border: '0.5px solid var(--border2)', borderRadius: 6, fontSize: 11, fontWeight: 600,
          cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
        <Sparkles size={12}/> {hasPhoto ? 'Générer une autre image' : "Générer l'image"}
      </button>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, lineHeight: 1.35 }}>
        Créée à partir du nom, de la catégorie et de la description enregistrés. Enregistrez vos modifications avant de générer.
      </div>
      </>}

      {err && (
        <div style={{
          padding: '6px 10px', marginTop: 8,
          background: 'var(--red-light, #fcebeb)', color: 'var(--red-dark, #a32d2d)',
          borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={12}/> {err}
        </div>
      )}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer la photo ?"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Garder</Button>
          <Button variant="danger" icon={Trash2} onClick={handleDelete}>Supprimer</Button>
        </>}>
        La photo de « {item.nom || 'cet article'} » sera retirée de la carte, de la caisse et de la borne.
      </Dialog>
    </div>
  )
}
