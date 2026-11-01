/**
 * pages/admin/Spectateurs.jsx — v3
 * Super admin : voir, modifier (nom, solde), supprimer des spectateurs
 * Modification dans une fenêtre, suppression confirmée par appui long.
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import useAppStore from '../../store/useAppStore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'
import { Trash2, Pencil, Search, X, Save, Plus, Minus, Users } from 'lucide-react'
import { db } from '../../firebase/config'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { Button, Stat, Table, Empty, Dialog, HoldButton, toast } from '../../ui'
import s from './spectateurs/spectateurs.module.css'

export default function Spectateurs() {
  const { spectateurs } = useAppStore()
  const [params] = useSearchParams()
  const [search, setSearch]     = useState(() => params.get('q') || '')
  // ?q=… vient de la recherche globale (Ctrl K)
  useEffect(() => { const q = params.get('q'); if (q !== null) setSearch(q) }, [params])
  const [editing, setEditing]   = useState(null)  // { _docId, id, nom, solde }
  const [editNom, setEditNom]   = useState('')
  const [editSolde, setEditSolde] = useState(0)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [pendingDel, setPendingDel] = useState(null)  // spectateur à supprimer (remplace window.confirm)

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
      toast.success('Spectateur mis à jour')
    } catch (e) { toast.error('Enregistrement impossible : ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (s) => {
    setPendingDel(null)
    setDeleting(s.id)
    try {
      await deleteDoc(doc(db, 'spectateurs', s._docId))
      toast.success(`Compte de ${s.nom} supprimé`)
    } catch (e) { toast.error('Suppression impossible : ' + e.message) }
    finally { setDeleting(null) }
  }

  const totalSolde = spectateurs.reduce((a, s) => a + (s.solde || 0), 0)

  const columns = [
    { key: 'nom', label: 'Nom', card: 'title', render: sp => <span className={s.name}>{sp.nom}</span> },
    { key: 'solde', label: 'Solde', align: 'right', render: sp => (
      <span className={clsx(s.amount, (sp.solde || 0) > 0 && s.amountPos)}>{fmt(sp.solde || 0)}</span>
    ) },
    { key: 'id', label: 'ID QR', render: sp => (
      <span className={s.qrCell}>
        <QrCode value={sp.id} size={36}/>
        <span className={s.mono}>{sp.id}</span>
      </span>
    ) },
    { key: 'actions', label: 'Actions', align: 'right', render: sp => (
      <span className={s.actions}>
        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => startEdit(sp)}>Modifier</Button>
        <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer le compte de ${sp.nom}`}
          loading={deleting === sp.id} className={s.iconBtn} onClick={() => setPendingDel(sp)}/>
      </span>
    ) },
  ]

  return (
    <div className={s.page}>
      {/* Barre de recherche */}
      <div className={s.search}>
        <Search size={16} className={s.searchIcon} aria-hidden="true"/>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou ID…"
          aria-label="Rechercher un spectateur"
          className={s.searchInput}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className={s.clear} aria-label="Effacer la recherche">
            <X size={16}/>
          </button>
        )}
      </div>

      {/* Stats rapides */}
      <div className={clsx(s.stats, 'yc-stagger')}>
        <Stat label="Total spectateurs" value={spectateurs.length}/>
        <Stat label="Solde en circulation" value={fmt(totalSolde)}/>
        <Stat label="Solde moyen" value={spectateurs.length ? fmt(Math.round(totalSolde / spectateurs.length)) : '—'}/>
        <Stat label="Résultats filtrés" value={filtered.length}/>
      </div>

      {/* Liste */}
      {filtered.length === 0
        ? <Empty icon={Users} title={search ? `Aucun résultat pour « ${search} »` : 'Aucun spectateur enregistré'}/>
        : <Table columns={columns} rows={filtered}/>
      }

      {/* Modification nom / solde */}
      <Dialog open={!!editing} onClose={() => { if (!saving) setEditing(null) }} title="Modifier le spectateur"
        footer={<>
          <Button variant="secondary" icon={X} onClick={() => setEditing(null)} disabled={saving}>Annuler</Button>
          <Button icon={Save} onClick={saveEdit} loading={saving}>Sauvegarder</Button>
        </>}>
        {editing && (
          <form className={s.form} onSubmit={e => { e.preventDefault(); saveEdit() }}>
            <p className={s.muted}>ID <span className={s.mono}>{editing.id}</span></p>
            <div className={s.field}>
              <label className={s.label} htmlFor="spec-edit-nom">Nom</label>
              <input id="spec-edit-nom" className={s.input} value={editNom} autoFocus
                onChange={e => setEditNom(e.target.value)}/>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="spec-edit-solde">Solde (€)</label>
              <div className={s.stepper}>
                <Button variant="secondary" icon={Minus} iconOnly aria-label="Retirer 10 €"
                  onClick={() => setEditSolde(v => Math.max(0, v - 10))}/>
                <input id="spec-edit-solde" type="number" inputMode="numeric" className={clsx(s.input, s.inputCenter)}
                  value={editSolde} onChange={e => setEditSolde(Math.max(0, parseInt(e.target.value) || 0))}/>
                <Button variant="secondary" icon={Plus} iconOnly aria-label="Ajouter 10 €"
                  onClick={() => setEditSolde(v => v + 10)}/>
              </div>
            </div>
            <button type="submit" hidden/>
          </form>
        )}
      </Dialog>

      {/* Suppression du compte (irréversible) */}
      <Dialog open={!!pendingDel} onClose={() => setPendingDel(null)} title="Supprimer ce compte ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingDel(null)}>Annuler</Button>
          <HoldButton tone="danger" icon={Trash2} onConfirm={() => handleDelete(pendingDel)}>Maintenir pour supprimer</HoldButton>
        </>}>
        {pendingDel && (
          <p className={s.dialogText}>
            Supprimer le compte de <b>{pendingDel.nom}</b> (<span className={s.mono}>{pendingDel.id}</span>) ?
            Solde actuel : {fmt(pendingDel.solde || 0)}. Cette action est irréversible.
          </p>
        )}
      </Dialog>
    </div>
  )
}
