/**
 * pages/admin/Spectateurs.jsx — v3
 * Super admin : voir, modifier (nom, solde), supprimer des spectateurs
 * Modification dans une fenêtre, suppression confirmée par appui long.
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import QrCode from '../../components/QrCode'
import { Trash2, Pencil, Search, SearchX, X, Save, Plus, Minus, Users, Printer, Lock } from 'lucide-react'
import { db } from '../../firebase/config'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { Button, Stat, Table, Empty, Dialog, HoldButton, toast } from '../../ui'
import s from './spectateurs/spectateurs.module.css'
import useEventStore from '../../store/useEventStore'
import QRCode from 'qrcode'
import { APP_VERSION_LABEL } from '../../utils/buildInfo'

export default function Spectateurs({ onNavigate }) {
  const { spectateurs, theme } = useAppStore()
  const { user, canAccessPage } = useAuthStore()
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId)

  // ─── Détection des permissions ───────────────────────────────────────
  // Seuls les admins et super_admins peuvent modifier/supprimer un spectateur.
  // Les autres rôles (billetterie, stand, custom…) sont en lecture seule
  // — ils peuvent voir, chercher et imprimer le QR, mais pas éditer le nom
  // ni le solde, et pas supprimer.
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  // canEdit déterminé strictement : seuls les admins peuvent modifier.
  // Pour ajuster à l'avenir, on pourrait ouvrir aussi aux rôles custom
  // ayant explicitement l'accès à 'spectateurs-edit' (page virtuelle).
  const canEdit = isAdmin
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
  const [printing, setPrinting] = useState(false)

  const filtered = spectateurs.filter(s =>
    s.nom?.toLowerCase().includes(search.toLowerCase()) ||
    s.id?.toLowerCase().includes(search.toLowerCase())
  )

  const startEdit = (s) => {
    setEditing(s)
    setEditNom(s.nom || '')
    // Affiche en euros sans Math.round (sinon on perd les centimes : 2.50 → 3)
    setEditSolde((s.solde || 0) / 100)
  }

  const saveEdit = async () => {
    if (!editing?._docId) return
    if (!currentEventId) { toast.error("Aucun événement sélectionné."); return }
    // Garde-fou : seuls les admins peuvent modifier (en plus du masquage UI).
    // Note : la vraie sécurité doit être appliquée par les règles Firestore
    // côté serveur ; ceci n'est qu'un filet de sécurité supplémentaire.
    if (!canEdit) {
      toast.error("Vous n'avez pas le droit de modifier les spectateurs.")
      setEditing(null)
      return
    }
    setSaving(true)
    try {
      // Reconvertit en centimes avec arrondi pour éviter les flottants
      const soldeCentimes = Math.round((parseFloat(editSolde) || 0) * 100)
      await updateDoc(doc(db, 'events', currentEventId, 'spectateurs', editing._docId), {
        nom:   editNom.trim(),
        solde: soldeCentimes,
      })
      setEditing(null)
      toast.success('Spectateur mis à jour')
    } catch (e) {
      toast.error(friendlyError(e, "Les modifications du spectateur n'ont pas été enregistrées."), { action: { label: 'Réessayer', onClick: () => saveEdit() } })
    }
    finally { setSaving(false) }
  }

  const handleDelete = async (s) => {
    setPendingDel(null)
    // Garde-fou : seuls les admins peuvent supprimer
    if (!canEdit) {
      toast.error("Vous n'avez pas le droit de supprimer un spectateur.")
      return
    }
    if (!currentEventId) { toast.error("Aucun événement sélectionné."); return }
    setDeleting(s.id)
    try {
      await deleteDoc(doc(db, 'events', currentEventId, 'spectateurs', s._docId))
      toast.success(`Compte de ${s.nom} supprimé`)
    } catch (e) {
      toast.error(friendlyError(e, `Le compte de ${s.nom} n'a pas été supprimé.`), { action: { label: 'Réessayer', onClick: () => handleDelete(s) } })
    }
    finally { setDeleting(null) }
  }

  /**
   * Imprime une feuille d'accès :
   *   - Une carte par spectateur (4 par page A4 portrait, 2×2)
   *   - Logo + nom événement, nom du spectateur, son ID, QR code, lien direct
   *   - Si specsToPrint est null, imprime tous les filtrés ; sinon ce sous-ensemble
   */
  const printAccess = async (specsToPrint = null) => {
    const list = specsToPrint || filtered
    if (list.length === 0) { toast.error('Aucun spectateur à imprimer.'); return }
    setPrinting(true)
    try {
      const evLogo = currentEvent?.logoSrc || ''
      const evNom  = currentEvent?.nom || theme?.festName || 'YllaCash'
      const evId   = currentEventId || ''

      // Génère les QR codes en parallèle (en base64) — un par spectateur
      const cards = await Promise.all(list.map(async s => {
        const soldeUrl = `${window.location.origin}/solde?id=${s.id}${evId ? '&ev=' + evId : ''}`
        const qrDataUrl = await QRCode.toDataURL(soldeUrl, { width: 400, margin: 1, color: { dark: '#003048', light: '#FFFFFF' } })
        return { spec: s, soldeUrl, qrDataUrl }
      }))

      const evHeader = (evLogo || evNom)
        ? `<header class="page-header">
             ${evLogo ? `<img src="${evLogo}" alt="" class="ev-logo"/>` : ''}
             <div>
               <div class="ev-name">${evNom}</div>
               <div class="ev-sub">Accès spectateurs · ${list.length} compte${list.length>1?'s':''}</div>
             </div>
           </header>`
        : ''

      const cardsHtml = cards.map(({ spec, soldeUrl, qrDataUrl }) => `
        <div class="acc-card">
          <div class="acc-left">
            <div class="acc-badge">🎫 Accès spectateur</div>
            <div class="acc-name">${escapeHtml(spec.nom || '—')}</div>
            <div class="acc-id">ID : <code>${escapeHtml(spec.id || '')}</code></div>
            <div class="acc-solde">💰 Solde initial : <strong>${fmt(spec.solde || 0)}</strong></div>
            <div class="acc-instructions">
              <strong>Comment accéder à votre compte :</strong>
              <ol>
                <li>Scannez le QR code ci-contre avec votre téléphone</li>
                <li>Ou rendez-vous sur le lien direct ci-dessous</li>
              </ol>
            </div>
            <div class="acc-link">${escapeHtml(soldeUrl)}</div>
          </div>
          <div class="acc-right">
            <img src="${qrDataUrl}" alt="QR" class="acc-qr"/>
            <div class="acc-qr-cap">Présenter au stand</div>
          </div>
        </div>
      `).join('')

      const win = window.open('', '_blank')
      if (!win) { toast.error("Le navigateur a bloqué la popup. Autorisez les popups pour imprimer."); return }
      win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Accès spectateurs — ${escapeHtml(evNom)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 10mm; }
  body {
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
    background: #fff; color: #003048;
  }
  .page-header {
    display: flex; align-items: center; gap: 16px;
    padding: 12px 4px; margin-bottom: 14px;
    border-bottom: 3px solid #009090;
  }
  .ev-logo {
    width: 64px; height: 64px; border-radius: 14px; object-fit: cover; flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(0,48,72,0.20);
  }
  .ev-name { font-size: 24px; font-weight: 800; color: #003048; letter-spacing: -0.01em; }
  .ev-sub  { font-size: 13px; color: #4A6580; margin-top: 4px; }

  /* 2 cartes par page A4 portrait — empilées verticalement */
  .acc-grid {
    display: flex; flex-direction: column; gap: 14px;
  }
  .acc-card {
    border: 2px solid #009090; border-radius: 16px; padding: 18px 22px;
    display: flex; gap: 22px; align-items: center;
    page-break-inside: avoid; break-inside: avoid;
    background: linear-gradient(135deg, #FFFFFF 0%, #F8FCFC 100%);
    box-shadow: 0 2px 8px rgba(0,48,72,0.08);
  }
  /* Forcer 2 cartes par page (après la 2e, saut de page) */
  .acc-card:nth-child(2n) {
    page-break-after: always;
    break-after: page;
  }
  .acc-left { flex: 1; min-width: 0; }
  .acc-right { flex-shrink: 0; text-align: center; }

  .acc-badge {
    display: inline-block;
    padding: 3px 10px; border-radius: 12px;
    background: #009090; color: #fff;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  .acc-name {
    font-size: 22px; font-weight: 800; color: #003048;
    margin-bottom: 6px; letter-spacing: -0.01em;
  }
  .acc-id {
    font-size: 13px; color: #4A6580; margin-bottom: 4px;
    display: flex; align-items: center; gap: 6px;
  }
  .acc-id code {
    background: #FFF8F2; border: 1px solid #E5E0D6;
    padding: 3px 8px; border-radius: 5px;
    font-size: 13px; font-weight: 700; color: #003048;
    font-family: "Courier New", monospace;
  }
  .acc-solde {
    font-size: 14px; color: #4A6580; margin-bottom: 14px;
    display: flex; align-items: center; gap: 6px;
  }
  .acc-solde strong {
    color: #009090; font-size: 16px; font-weight: 800;
  }

  .acc-instructions {
    font-size: 13px; color: #003048; line-height: 1.6; margin-bottom: 10px;
    background: #FFF8F2; padding: 10px 14px; border-radius: 8px;
    border-left: 3px solid #D89030;
  }
  .acc-instructions strong { color: #D89030; }
  .acc-instructions ol { padding-left: 20px; margin-top: 4px; }
  .acc-instructions li { margin-bottom: 2px; }

  .acc-link {
    font-size: 10px; color: #4A6580; word-break: break-all;
    background: #FFF8F2; padding: 6px 10px; border-radius: 5px;
    font-family: "Courier New", monospace;
    border: 1px dashed #E5E0D6;
  }
  .acc-qr {
    width: 220px; height: 220px; border-radius: 10px;
    display: block; margin: 0 auto 8px;
    border: 4px solid #FFF; box-shadow: 0 4px 14px rgba(0,48,72,0.15);
  }
  .acc-qr-cap {
    font-size: 11px; color: #003048; text-transform: uppercase;
    letter-spacing: 0.10em; font-weight: 800;
    background: #FCEFD8; padding: 4px 10px; border-radius: 12px;
    display: inline-block;
  }
  footer.page-footer {
    margin-top: 16px; padding-top: 10px; border-top: 1px solid #eee;
    text-align: center; font-size: 10px; color: #94a3b8;
  }
  @media print {
    body { padding: 0; }
  }
</style></head><body>
${evHeader}
<div class="acc-grid">${cardsHtml}</div>
<footer class="page-footer">YllaCash ${APP_VERSION_LABEL} · Édité par <strong>Maison Ylla</strong></footer>
<script>window.onload = () => setTimeout(() => window.print(), 300)</script>
</body></html>`)
      win.document.close()
    } catch (e) {
      console.error(e)
      toast.error(friendlyError(e, "La feuille d'accès n'a pas été générée."))
    } finally {
      setPrinting(false)
    }
  }

  // Échappement HTML basique pour éviter les injections via nom de spectateur
  const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

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
        <Button variant="secondary" size="sm" icon={Printer} disabled={printing}
          title="Imprimer la feuille d'accès" onClick={() => printAccess([sp])}>Imprimer</Button>
        {/* Modifier / Supprimer : réservés aux admins */}
        {canEdit && (
          <>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => startEdit(sp)}>Modifier</Button>
            <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer le compte de ${sp.nom}`}
              loading={deleting === sp.id} className={s.iconBtn} onClick={() => setPendingDel(sp)}/>
          </>
        )}
      </span>
    ) },
  ]

  return (
    <div className={s.page}>
      {/* Bandeau "Lecture seule" pour les non-admins (billetterie, etc.) */}
      {!canEdit && (
        <div className={s.readOnly} role="status">
          <Lock size={14} aria-hidden="true"/>
          <span><strong>Lecture seule.</strong> Vous pouvez consulter et imprimer les accès, mais pas modifier ou supprimer les comptes.</span>
        </div>
      )}

      {/* Barre d'actions */}
      <div className={s.toolbar}>
        <span className={s.muted}>{filtered.length} spectateur{filtered.length>1?'s':''}{search && ` (filtré${filtered.length>1?'s':''})`}</span>
        <Button variant="secondary" size="sm" icon={Printer} loading={printing} disabled={filtered.length === 0} onClick={() => printAccess()}>
          {printing ? 'Génération…' : `Imprimer accès${search ? ' filtrés' : ' (tous)'}`}
        </Button>
      </div>

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
        ? search
          ? (
            <Empty icon={SearchX} title={`Personne au nom de « ${search} »`}
              action={<Button variant="secondary" onClick={() => setSearch('')}>Effacer la recherche</Button>}>
              Vérifie l'orthographe, ou cherche par ID de QR code.
            </Empty>
          )
          : (
            <Empty icon={Users} title="Aucun spectateur pour l'instant"
              action={canAccessPage('nouveau') && <Button variant="secondary" onClick={() => onNavigate('nouveau')}>Créer un compte</Button>}>
              Les comptes créés à la billetterie ou via le QR d'inscription apparaîtront ici.
            </Empty>
          )
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
                <input id="spec-edit-solde" type="number" step="0.01" inputMode="decimal" className={clsx(s.input, s.inputCenter)}
                  value={editSolde} onChange={e => setEditSolde(Math.max(0, parseFloat(e.target.value) || 0))}/>
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
