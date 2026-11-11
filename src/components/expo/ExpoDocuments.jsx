/**
 * components/expo/ExpoDocuments.jsx
 *
 * Bloc de gestion des pièces jointes d'un exposant.
 * Upload Firebase Storage + liste des documents existants.
 * Utilisé dans la vue détail d'un exposant.
 */

import React, { useState, useRef } from 'react'
import { Upload, Download, Trash2, File, Paperclip } from 'lucide-react'
import { uploadExpoDocument, deleteExpoDocument } from '../../firebase/service'
import { Button, Card, Table, Empty, toast } from '../../ui'
import { friendlyError } from '../../utils/errors'
import ConfirmDialog from './ConfirmDialog'
import s from './expo.module.css'

export default function ExpoDocuments({ expo, eventId }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [toDelete, setToDelete]   = useState(null)
  const fileInputRef = useRef(null)

  const docs = expo.documents || []

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setProgress(0)
    try {
      await uploadExpoDocument(expo.id, file, (pct) => setProgress(pct), eventId)
      toast.success('Document ajouté')
    } catch (e2) {
      toast.error(friendlyError(e2, "Le document n'a pas été téléversé."))
    } finally {
      setUploading(false); setProgress(0)
      // Reset le champ pour pouvoir re-uploader le même fichier
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (docMeta) => {
    try { await deleteExpoDocument(expo.id, docMeta.path, eventId) }
    catch (e) { toast.error(friendlyError(e, "Le document n'a pas été supprimé.")); throw e }
  }

  const fmtSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  }

  const rows = docs.map((d, i) => ({ ...d, _key: d.path || `${i}` }))

  return (
    <Card
      title={<span className={s.cardTitle}><Paperclip size={16} aria-hidden="true" />Pièces jointes{docs.length > 0 && ` (${docs.length})`}</span>}
      subtitle="Formats : images, PDF, Word, Excel. Taille max : 10 Mo."
    >
      <div className={s.stack}>
        <Table
          rowKey="_key"
          rows={rows}
          empty={<Empty icon={File} title="Aucun document joint">Les contrats, attestations et justificatifs ajoutés ici restent attachés à l'exposant.</Empty>}
          columns={[
            { key: 'name', label: 'Document', render: d => (
              <span className={s.docName}><File size={14} aria-hidden="true" className={s.docIcon} /><span className={s.ellipsis}>{d.name}</span></span>
            ) },
            { key: 'size', label: 'Taille', align: 'right', render: d => fmtSize(d.size) || '—' },
            { key: 'actions', label: 'Actions', render: d => (
              <span className={s.rowActions}>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className={s.iconLink}
                  title="Ouvrir / télécharger" aria-label={`Ouvrir ${d.name}`}>
                  <Download size={16} aria-hidden="true" />
                </a>
                <Button variant="ghost" size="sm" iconOnly icon={Trash2} className={s.dangerIcon}
                  onClick={() => setToDelete(d)} aria-label={`Supprimer ${d.name}`} title="Supprimer" />
              </span>
            ) },
          ]}
        />

        {/* Barre de progression upload */}
        {uploading && (
          <div className={s.upload} role="status">
            <div className={s.uploadLabel}>Téléversement en cours… {progress} %</div>
            <div className={s.track}><div className={s.trackFill} style={{ transform: `scaleX(${progress / 100})` }} /></div>
          </div>
        )}

        <Button variant="secondary" block icon={Upload} loading={uploading}
          onClick={() => fileInputRef.current?.click()}>
          {uploading ? 'Téléversement…' : 'Téléverser un document'}
        </Button>

        <input ref={fileInputRef} type="file" onChange={handleFileChange}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          className={s.hidden} tabIndex={-1} aria-hidden="true" />
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer ce document ?"
        hold icon={Trash2} confirmLabel="Maintenir pour supprimer"
        onClose={() => setToDelete(null)}
        onConfirm={() => handleDelete(toDelete)}
      >
        « {toDelete?.name} » sera supprimé définitivement.
      </ConfirmDialog>
    </Card>
  )
}
