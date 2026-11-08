/**
 * pages/admin/Evenements.jsx — v2 (design system)
 * - Icône = logo de l'événement (logoSrc) ou emoji fallback
 * - Bouton "Nouvel événement" en bas (FAB sur mobile)
 * - Copie nommée dans une fenêtre, suppression confirmée par appui long
 * La couleur d'un événement est une donnée : elle passe par la variable CSS --c.
 */
import React, { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import useEventStore from '../../store/useEventStore'
import { compressImage } from '../../utils/imageUtils'
import useAuthStore  from '../../store/useAuthStore'
import useAppStore   from '../../store/useAppStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { friendlyError } from '../../utils/errors'
import {
  Plus, Pencil, Trash2, Copy, X, Save,
  Calendar, MapPin, CheckCircle, ArrowRight, Upload, Info,
} from 'lucide-react'
import { Button, Empty, Skeleton, Dialog, HoldButton, Field, focusFirstInvalid, toast } from '../../ui'
import s from './evenements/evenements.module.css'

const COULEURS = [
  '#1a6b7a','#534AB7','#BA7517','#0F6E56','#A32D2D',
  '#2563EB','#7C3AED','#D97706','#059669','#DC2626',
]
const EMOJI_OPTIONS = ['🎵','🎪','🎭','🎨','🎤','🥁','🎸','🎺','🎻','🎹','🎡','🎢','🎠','🏟️','⭐']

const formatDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) }
  catch { return d }
}

// ── Icône de l'événement : logo si dispo, sinon emoji ───────────
// size : sm (36) | md (44) | lg (48)
const EventIcon = ({ event, size = 'md' }) => {
  const couleur = event.couleur || '#1a6b7a'
  const logoSrc = event.logoSrc || null
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [logoSrc])
  return (
    <div className={clsx(s.icon, s[`icon_${size}`])} style={{ '--c': couleur }}>
      {logoSrc && !broken
        ? <img src={logoSrc} alt={event.nom} className={s.iconImg} onError={() => setBroken(true)}/>
        : <span className={s.iconEmoji} aria-hidden="true">{event.emoji || '🎵'}</span>
      }
    </div>
  )
}

// ── Carte événement ──────────────────────────────────────────────
const EventCard = ({ event, isActive, onSelect, onEdit, onDelete, onDuplicate, isMobile }) => {
  const couleur = event.couleur || '#1a6b7a'
  return (
    <article className={clsx(s.card, isActive && s.cardActive)} style={{ '--c': couleur }}>
      {/* Header : icône + nom + badge actif */}
      <div className={s.cardHead}>
        <EventIcon event={event} size={isMobile ? 'sm' : 'lg'}/>
        <div className={s.cardInfo}>
          <div className={s.cardTitleRow}>
            <h3 className={s.cardTitle}>{event.nom}</h3>
            {isActive && <span className={s.activeTag}>Actif</span>}
          </div>
          {event.description && <p className={s.cardDesc}>{event.description}</p>}
          {/* Infos date + lieu */}
          <div className={s.meta}>
            {event.date && (
              <span className={s.metaItem}>
                <Calendar size={12} aria-hidden="true"/> {formatDate(event.date)}
                {event.dateFin && ` → ${formatDate(event.dateFin)}`}
              </span>
            )}
            {event.lieu && (
              <span className={s.metaItem}>
                <MapPin size={12} aria-hidden="true"/> {event.lieu}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={s.cardActions}>
        {!isActive ? (
          <Button size="sm" icon={ArrowRight} onClick={() => onSelect(event.id)}>Activer</Button>
        ) : (
          <span className={s.activeLabel}><CheckCircle size={14} aria-hidden="true"/> Actif</span>
        )}
        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(event)}
          iconOnly={isMobile} aria-label={`Modifier ${event.nom}`}>Modifier</Button>
        <Button variant="secondary" size="sm" icon={Copy} iconOnly title="Dupliquer"
          aria-label={`Dupliquer ${event.nom}`} onClick={() => onDuplicate(event)}/>
        <Button variant="danger" size="sm" icon={Trash2} iconOnly className={s.pushRight}
          aria-label={`Supprimer ${event.nom}`} onClick={() => onDelete(event)}/>
      </div>
    </article>
  )
}

// ── Formulaire ──────────────────────────────────────────────────
const EventForm = ({ initial, onSave, onCancel, isMobile }) => {
  const { theme } = useAppStore()
  const [form, setForm] = useState({
    nom:         initial?.nom         || '',
    description: initial?.description || '',
    date:        initial?.date        || '',
    dateFin:     initial?.dateFin     || '',
    lieu:        initial?.lieu        || '',
    couleur:     initial?.couleur     || COULEURS[0],
    emoji:       initial?.emoji       || '🎵',
    logoSrc:     initial?.logoSrc     || (theme?.logoSrc || null),
  })
  const [saving, setSaving] = useState(false)
  const [tried, setTried]   = useState(false)
  const formRef = useRef(null)
  const nomError = form.nom.trim() ? null : 'Indique un nom pour cet événement'

  const handleSave = async () => {
    if (nomError) { setTried(true); focusFirstInvalid(formRef.current); return }
    setSaving(true)
    try { await onSave(form) }
    finally { setSaving(false) }
  }

  return (
    <section ref={formRef} className={s.formCard} aria-label={initial ? 'Modifier l\'événement' : 'Nouvel événement'}>
      <h2 className={s.formTitle}>{initial ? 'Modifier l\'événement' : 'Nouvel événement'}</h2>

      {/* Icône + Nom */}
      <div className={s.nameRow}>
        <div className={s.field}>
          <label className={s.label} htmlFor="evt-emoji">Icône</label>
          <select id="evt-emoji" className={clsx(s.input, s.emojiSelect)} value={form.emoji}
            onChange={e => setForm(f => ({...f, emoji:e.target.value}))}>
            {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <Field className={s.grow} label={<span className={s.label}>Nom *</span>} error={nomError} valid={!nomError} showError={tried}>
          <input id="evt-nom" value={form.nom}
            onChange={e => setForm(f => ({...f,nom:e.target.value}))}
            placeholder="ex : Fest'Ylla 2026"/>
        </Field>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="evt-desc">Description</label>
        <input id="evt-desc" className={s.input} value={form.description}
          onChange={e => setForm(f => ({...f,description:e.target.value}))}
          placeholder="Festival afro de Strasbourg"/>
      </div>

      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.label} htmlFor="evt-debut">Début</label>
          <input id="evt-debut" type="date" className={s.input} value={form.date}
            onChange={e => setForm(f => ({...f,date:e.target.value}))}/>
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="evt-fin">Fin</label>
          <input id="evt-fin" type="date" className={s.input} value={form.dateFin}
            onChange={e => setForm(f => ({...f,dateFin:e.target.value}))}/>
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="evt-lieu">Lieu</label>
        <input id="evt-lieu" className={s.input} value={form.lieu}
          onChange={e => setForm(f => ({...f,lieu:e.target.value}))}
          placeholder="Strasbourg, Bas-Rhin"/>
      </div>

      {/* Logo — fichier ou URL */}
      <div className={s.field}>
        <span className={s.label}>Logo / Icône de l'événement</span>

        {/* Aperçu */}
        {form.logoSrc && (
          <div className={s.logoPreview}>
            <img src={form.logoSrc} alt="Logo" className={s.logoImg}
              onError={e => e.target.style.display='none'}/>
            <div className={s.grow}>
              <div className={s.logoTitle}>Logo chargé</div>
              <div className={s.hint}>Choisissez un autre fichier pour le changer</div>
            </div>
            <Button variant="ghost" size="sm" className={s.dangerText}
              onClick={() => setForm(f => ({...f, logoSrc:null}))}>Supprimer</Button>
          </div>
        )}

        {/* Bouton upload fichier */}
        <div className={s.logoRow}>
          <label className={s.fileBtn}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className={s.fileInput}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const src = await compressImage(file, 256, 0.85)
                  setForm(f => ({...f, logoSrc: src}))
                } catch { toast.error('Impossible de charger ce fichier') }
                e.target.value = ''
              }}
            />
            <Upload size={15} aria-hidden="true"/> {form.logoSrc ? 'Changer' : 'Choisir un fichier'}
          </label>

          {/* Ou par URL */}
          <input value={form.logoSrc?.startsWith('data:') ? '' : (form.logoSrc || '')}
            onChange={e => setForm(f => ({...f, logoSrc:e.target.value||null}))}
            placeholder="Ou coller une URL https://…"
            aria-label="URL du logo"
            className={clsx(s.input, s.urlInput)}/>
        </div>
        <span className={s.hint}>PNG, JPG, SVG — recommandé 256×256px minimum</span>
      </div>

      {/* Couleur */}
      <div className={s.field}>
        <span className={s.label}>Couleur principale</span>
        <div className={s.swatches}>
          {COULEURS.map(c => (
            <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={form.couleur === c}
              className={clsx(s.swatch, form.couleur === c && s.swatchOn)} style={{ '--c': c }}
              onClick={() => setForm(f => ({...f,couleur:c}))}/>
          ))}
          <input type="color" aria-label="Couleur personnalisée" className={s.colorInput}
            value={form.couleur} onChange={e => setForm(f => ({...f,couleur:e.target.value}))}/>
        </div>
      </div>

      {/* Aperçu */}
      <div className={s.preview} style={{ '--c': form.couleur }}>
        <EventIcon event={form} size="sm"/>
        <div className={s.previewInfo}>
          <div className={s.previewName}>{form.nom || 'Nom de l\'événement'}</div>
          {form.lieu && <div className={s.hint}>{form.lieu}</div>}
        </div>
        <span className={s.activeTag}>Aperçu</span>
      </div>

      <div className={s.formActions}>
        <Button icon={Save} onClick={handleSave} loading={saving} block={isMobile}>
          {saving ? 'Sauvegarde…' : initial ? 'Enregistrer' : 'Créer'}
        </Button>
        <Button variant="secondary" icon={X} onClick={onCancel} block={isMobile}>Annuler</Button>
      </div>
    </section>
  )
}

// ── Page principale ──────────────────────────────────────────────
export default function Evenements() {
  const { events, currentEventId, eventLoading, watchEvents,
          selectEvent, createEvent, updateEvent, deleteEvent, duplicateEvent } = useEventStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const { isMobile }            = useBreakpoint()
  // Fenêtres (remplacent window.confirm et prompt)
  const [pendingDel, setPendingDel] = useState(null)   // événement à supprimer
  const [copy,       setCopy]       = useState(null)   // { evt, nom }
  const [copyTried,  setCopyTried]  = useState(false)
  const copyFormRef = useRef(null)

  useEffect(() => {
    const unsub = watchEvents()
    return () => unsub?.()
  }, [])

  const handleCreate = async (data) => {
    const id = await createEvent(data)
    setShowForm(false)
    if (events.filter(e => !e.deleted).length === 0) selectEvent(id)
  }

  const handleUpdate = async (data) => {
    await updateEvent(editing.id, data)
    setEditing(null)
  }

  const handleDelete = (evt) => setPendingDel(evt)
  const removeEvent = async (evt) => {
    try {
      await deleteEvent(evt.id)
      toast.success(`« ${evt.nom} » supprimé`)
    } catch (e) {
      toast.error(friendlyError(e, `« ${evt.nom} » n'a pas été supprimé.`), { action: { label: 'Réessayer', onClick: () => removeEvent(evt) } })
    }
  }
  const confirmDelete = () => {
    const evt = pendingDel
    setPendingDel(null)
    if (evt) removeEvent(evt)
  }

  const handleDuplicate = (evt) => { setCopyTried(false); setCopy({ evt, nom: `${evt.nom} — Copie` }) }
  const duplicate = async (evt, nom) => {
    try {
      await duplicateEvent(evt.id, { ...evt, nom, actif:false, id:undefined })
      toast.success(`« ${nom} » créé`)
    } catch (e) {
      toast.error(friendlyError(e, "La copie de l'événement n'a pas été créée."), { action: { label: 'Réessayer', onClick: () => duplicate(evt, nom) } })
    }
  }
  const confirmDuplicate = () => {
    const evt = copy?.evt
    const nom = copy?.nom?.trim()
    if (!evt) return
    if (!nom) { setCopyTried(true); focusFirstInvalid(copyFormRef.current); return }
    setCopy(null)
    duplicate(evt, nom)
  }

  const visible = events.filter(e => !e.deleted)

  if (eventLoading) return (
    <div className={s.page} aria-busy="true">
      {[0, 1, 2].map(i => (
        <div key={i} className={s.skeletonCard}>
          <Skeleton width={48} height={48} radius={12}/>
          <div className={s.grow}>
            <Skeleton height={16} width="55%"/>
            <Skeleton height={12} width="35%" className={s.skLine}/>
          </div>
        </div>
      ))}
    </div>
  )

  const activeEvent = visible.find(e => e.id === currentEventId)

  return (
    <div className={clsx(s.page, isMobile && s.pageFab)}>

      {/* Bannière événement actif */}
      {activeEvent && (
        <div className={s.banner} style={{ '--c': activeEvent.couleur || '#1a6b7a' }}>
          <EventIcon event={activeEvent} size={isMobile ? 'sm' : 'md'}/>
          <div className={s.bannerInfo}>
            <div className={s.bannerKicker}>Événement actif</div>
            <div className={s.bannerName}>{activeEvent.nom}</div>
            {activeEvent.lieu && (
              <div className={s.metaItem}><MapPin size={12} aria-hidden="true"/> {activeEvent.lieu}</div>
            )}
          </div>
          <CheckCircle size={20} aria-hidden="true" className={s.bannerCheck}/>
        </div>
      )}

      {/* Formulaires */}
      {showForm && <EventForm onSave={handleCreate} onCancel={() => setShowForm(false)} isMobile={isMobile}/>}
      {editing   && <EventForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} isMobile={isMobile}/>}

      {/* Liste */}
      {visible.length === 0 && !showForm && !editing ? (
        <Empty icon={Calendar} title="Aucun événement pour l'instant"
          action={<Button icon={Plus} onClick={() => setShowForm(true)}>Créer un événement</Button>}>
          Tes événements apparaîtront ici, chacun avec ses spectateurs, sa carte et son équipe.
        </Empty>
      ) : (
        <div className={clsx(s.list, 'yc-stagger')}>
          {visible.map(evt => (
            <EventCard
              key={evt.id}
              event={evt}
              isActive={evt.id === currentEventId}
              onSelect={selectEvent}
              onEdit={setEditing}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* Info isolation */}
      {visible.length > 0 && !showForm && !editing && (
        <div className={s.note}>
          <Info size={15} aria-hidden="true" className={s.noteIcon}/>
          <p><strong>Isolation complète</strong> — spectateurs, transactions, réservations, menu et staff sont séparés par événement.</p>
        </div>
      )}

      {/* ── Bouton "Nouvel événement" — FAB mobile / bouton bas desktop ── */}
      {!showForm && !editing && (
        isMobile ? (
          /* FAB fixe en bas sur mobile */
          <button type="button" className={s.fab} onClick={() => setShowForm(true)}
            title="Nouvel événement" aria-label="Nouvel événement">
            <Plus size={26} aria-hidden="true"/>
          </button>
        ) : (
          /* Bouton en bas de la liste sur desktop */
          <Button icon={Plus} block onClick={() => setShowForm(true)}>Nouvel événement</Button>
        )
      )}

      {/* Copie : nom de la nouvelle édition (remplace prompt) */}
      <Dialog open={!!copy} onClose={() => setCopy(null)} title="Dupliquer l'événement"
        footer={<>
          <Button variant="secondary" onClick={() => setCopy(null)}>Annuler</Button>
          <Button icon={Copy} onClick={confirmDuplicate}>Dupliquer</Button>
        </>}>
        {copy && (
          <form ref={copyFormRef} className={s.dialogStack} onSubmit={e => { e.preventDefault(); confirmDuplicate() }}>
            <Field label={<span className={s.label}>Nom de la copie de « {copy.evt.nom} »</span>}
              error={copy.nom.trim() ? null : 'Indique un nom pour la copie'} valid={!!copy.nom.trim()} showError={copyTried}>
              <input id="evt-copy-nom" value={copy.nom} autoFocus
                onFocus={e => e.target.select()}
                onChange={e => setCopy(c => ({ ...c, nom: e.target.value }))}/>
            </Field>
          </form>
        )}
      </Dialog>

      {/* Suppression (irréversible côté interface) */}
      <Dialog open={!!pendingDel} onClose={() => setPendingDel(null)} title="Supprimer cet événement ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingDel(null)}>Annuler</Button>
          <HoldButton tone="danger" icon={Trash2} onConfirm={confirmDelete}>Maintenir pour supprimer</HoldButton>
        </>}>
        <p className={s.dialogText}>
          Supprimer <b>« {pendingDel?.nom} »</b> ? Toutes ses données seront désactivées.
        </p>
      </Dialog>
    </div>
  )
}
