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
import { Trash2, Pencil, Search, SearchX, X, Save, Plus, Minus, Users, Lock, ChevronRight } from 'lucide-react'
import { db } from '../../firebase/config'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { Button, Badge, Stat, Table, Empty, Dialog, Sheet, HoldButton, Tabs, toast } from '../../ui'
import { corrigerSolde } from '../../firebase/service'
import s from './spectateurs/spectateurs.module.css'
import useEventStore from '../../store/useEventStore'
import QRCode from 'qrcode'
import { APP_VERSION_LABEL } from '../../utils/buildInfo'
import { useBreakpoint } from '../../hooks/useBreakpoint'

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
  // Correction du solde (20/11/2026) : on ajoute ou on retire un montant, avec un motif ;
  // on ne tape plus un nouveau solde (aucune trace n'en restait)
  const [corrSens, setCorrSens] = useState('plus')
  const [corrMontant, setCorrMontant] = useState('')
  const [corrMotif, setCorrMotif] = useState('')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [pendingDel, setPendingDel] = useState(null)  // spectateur à supprimer (remplace window.confirm)
  // Téléphone (20/11/2026) : une ligne par spectateur, les actions passent dans une feuille du bas.
  // On garde l'identifiant, pas l'objet : le solde affiché dans la feuille reste à jour.
  const { isMobile } = useBreakpoint()
  const [sheetId, setSheetId] = useState(null)
  const sheetSpec = isMobile && sheetId ? spectateurs.find(sp => (sp._docId || sp.id) === sheetId) || null : null

  const filtered = spectateurs.filter(s =>
    s.nom?.toLowerCase().includes(search.toLowerCase()) ||
    s.id?.toLowerCase().includes(search.toLowerCase())
  )

  const startEdit = (s) => {
    setEditing(s)
    setEditNom(s.nom || '')
    setCorrSens('plus'); setCorrMontant(''); setCorrMotif('')
  }

  const corrCentimes = Math.round((parseFloat(String(corrMontant).replace(',', '.')) || 0) * 100)
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
      if (corrCentimes > 0 && !corrMotif.trim()) { toast.error('Le motif est obligatoire pour corriger un solde.'); setSaving(false); return }
      if (corrCentimes > 0 && corrSens === 'moins' && corrCentimes > (editing.solde || 0)) { toast.error('On ne peut pas retirer plus que le solde.'); setSaving(false); return }
      if (editNom.trim() !== (editing.nom || '')) {
        await updateDoc(doc(db, 'events', currentEventId, 'spectateurs', editing._docId), { nom: editNom.trim() })
      }
      // Le solde ne s'écrit plus directement : correction avec motif, transaction et audit
      if (corrCentimes > 0) {
        await corrigerSolde({
          specDocId: editing._docId, delta: corrSens === 'plus' ? corrCentimes : -corrCentimes,
          motif: corrMotif.trim(), staff: user?.nom || 'Administrateur',
        }, currentEventId)
      }
      setEditing(null)
      toast.success(corrCentimes > 0 ? 'Solde corrigé' : 'Spectateur mis à jour')
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

  // Impression des accès retirée (20/11/2026) : la clé d'un compte ne sort plus sur papier ;
  // le spectateur ouvre son espace avec le lien reçu par e-mail.

  // Échappement HTML basique pour éviter les injections via nom de spectateur
  const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  const totalSolde = spectateurs.reduce((a, s) => a + (s.solde || 0), 0)

  const columns = [
    { key: 'nom', label: 'Nom', card: 'title', render: sp => <span className={s.name}>{sp.nom}{sp.billet?.sansCompte && <> <Badge tone="neutral">Billet sans compte</Badge></>}</span> },
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

      {isMobile ? (
        <>
          {/* Téléphone (20/11/2026) : trois compteurs sur une rangée, le quatrième en sous-titre */}
          <div className={s.k3}>
            <div className={s.k3Cell}><b>{spectateurs.length}</b><span>Comptes</span></div>
            <div className={s.k3Cell}><b>{fmt(totalSolde)}</b><span>En circulation</span></div>
            <div className={s.k3Cell}><b>{spectateurs.length ? fmt(Math.round(totalSolde / spectateurs.length)) : '—'}</b><span>Solde moyen</span></div>
          </div>

          <div className={s.search}>
            <Search size={16} className={s.searchIcon} aria-hidden="true"/>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nom ou numéro de compte"
              aria-label="Rechercher un spectateur"
              className={s.searchInput}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className={s.clear} aria-label="Effacer la recherche">
                <X size={16}/>
              </button>
            )}
          </div>

          <p className={s.subtitle} role="status">
            {filtered.length} spectateur{filtered.length>1?'s':''} affiché{filtered.length>1?'s':''}{search && ` (filtré${filtered.length>1?'s':''})`}
          </p>

          {filtered.length === 0
            ? search
              ? (
                <Empty icon={SearchX} title="Aucun spectateur ne correspond à cette recherche"
                  action={<Button variant="secondary" onClick={() => setSearch('')}>Effacer la recherche</Button>}>
                  Vérifie l'orthographe de « {search} », ou cherche par numéro de compte.
                </Empty>
              )
              : (
                <Empty icon={Users} title="Aucun spectateur pour l'instant"
                  action={canAccessPage('nouveau') && <Button variant="secondary" onClick={() => onNavigate('nouveau')}>Créer un compte</Button>}>
                  Les comptes créés à la billetterie ou via le QR d'inscription apparaîtront ici.
                </Empty>
              )
            : (
              <ul className={s.list}>
                {filtered.map(sp => {
                  const neg = (sp.solde || 0) < 0
                  return (
                    <li key={sp._docId || sp.id}>
                      <button type="button" className={s.row} onClick={() => setSheetId(sp._docId || sp.id)}
                        aria-label={`${sp.nom || 'Sans nom'}, compte ${sp.id}, solde ${fmt(sp.solde || 0)}${neg ? ' (négatif)' : ''}. Ouvrir les actions`}>
                        <span className={s.rowText}>
                          <span className={s.rowName}>{sp.nom || '—'}{sp.billet?.sansCompte && <> <Badge tone="neutral">Billet sans compte</Badge></>}</span>
                          <span className={s.rowId}>{sp.id}</span>
                        </span>
                        <b className={clsx(s.rowAmount, neg && s.rowAmountNeg)}>{fmt(sp.solde || 0)}</b>
                        <ChevronRight size={18} className={s.chevron} aria-hidden="true"/>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          }

        </>
      ) : (
        <>
          {/* Barre d'actions */}
          <div className={s.toolbar}>
            <span className={s.muted}>{filtered.length} spectateur{filtered.length>1?'s':''}{search && ` (filtré${filtered.length>1?'s':''})`}</span>
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
        </>
      )}

      {/* Téléphone (20/11/2026) : feuille d'actions du spectateur, mêmes fonctions que les boutons du tableau */}
      <Sheet open={!!sheetSpec} onClose={() => setSheetId(null)} title={sheetSpec?.nom || 'Spectateur'}>
        {sheetSpec && (
          <div className={s.sheetBody}>
            <div className={s.sheetInfo}>
              <QrCode value={sheetSpec.id} size={56}/>
              <div className={s.sheetInfoText}>
                <span className={s.sheetLabel}>Numéro de compte</span>
                <span className={s.sheetId}>{sheetSpec.id}</span>
                {sheetSpec.billet?.sansCompte && <span><Badge tone="neutral">Billet sans compte</Badge></span>}
              </div>
            </div>
            <div className={s.sheetSolde}>
              <span className={s.sheetLabel}>Solde</span>
              <b className={clsx(s.sheetSoldeVal, (sheetSpec.solde || 0) < 0 && s.rowAmountNeg)}>{fmt(sheetSpec.solde || 0)}</b>
            </div>
            {/* Modifier / Supprimer : réservés aux admins */}
            {canEdit && (
              <>
                <Button variant="secondary" block icon={Pencil}
                  onClick={() => { const sp = sheetSpec; setSheetId(null); startEdit(sp) }}>Modifier</Button>
                <Button variant="danger" block icon={Trash2} loading={deleting === sheetSpec.id}
                  onClick={() => { const sp = sheetSpec; setSheetId(null); setPendingDel(sp) }}>Supprimer ce compte</Button>
              </>
            )}
            <Button variant="ghost" block onClick={() => setSheetId(null)}>Fermer</Button>
          </div>
        )}
      </Sheet>

      {/* Modification nom / solde */}
      <Dialog open={!!editing} onClose={() => { if (!saving) setEditing(null) }} title="Modifier le spectateur"
        footer={<>
          <Button variant="secondary" icon={X} onClick={() => setEditing(null)} disabled={saving}>Annuler</Button>
          <Button icon={Save} onClick={saveEdit} loading={saving}>Enregistrer</Button>
        </>}>
        {editing && (
          <form className={s.form} onSubmit={e => { e.preventDefault(); saveEdit() }}>
            <p className={s.muted}>ID <span className={s.mono}>{editing.id}</span></p>
            <div className={s.field}>
              <label className={s.label} htmlFor="spec-edit-nom">Nom</label>
              <input id="spec-edit-nom" className={s.input} value={editNom} autoFocus
                onChange={e => setEditNom(e.target.value)}/>
            </div>
            <div className={s.soldeRow}>
              <span className={s.label}>Solde</span>
              <b className={s.soldeVal}>{fmt(editing.solde || 0)}</b>
            </div>
            <div className={s.corr}>
              <span className={s.label}>Corriger le solde</span>
              <Tabs label="Sens de la correction" value={corrSens} onChange={setCorrSens}
                items={[{ value: 'plus', label: 'Ajouter' }, { value: 'moins', label: 'Retirer' }]}/>
              <div className={s.corrMontant}>
                <input id="spec-corr-montant" inputMode="decimal" className={clsx(s.input, s.inputCenter)} placeholder="0,00"
                  aria-label="Montant de la correction en euros" value={corrMontant}
                  onChange={e => setCorrMontant(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 8))}/>
                <b>€</b>
              </div>
              <input className={s.input} value={corrMotif} maxLength={120} placeholder="Motif (obligatoire)"
                aria-label="Motif de la correction" onChange={e => setCorrMotif(e.target.value)}/>
              <p className={s.muted}>
                {corrCentimes > 0
                  ? <>Nouveau solde : <b>{fmt(Math.max(0, (editing.solde || 0) + (corrSens === 'plus' ? corrCentimes : -corrCentimes)))}</b>. </>
                  : 'Laissez vide pour ne pas toucher au solde. '}
                La correction apparaît dans les transactions et le journal d'audit.
              </p>
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
