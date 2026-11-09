/**
 * pages/admin/Planning.jsx — v6
 * Gestion du planning festival : créneaux, artistes, scènes
 * Vue liste (détail, statut, avantages) ou frise horaire glissable.
 * Accessible aux rôles admin et super_admin
 */
import React, { useState, useEffect, useRef, useMemo } from 'react'
import clsx from 'clsx'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { addCreneau, updateCreneau, deleteCreneau, watchArtistConsumptions, watchCachets } from '../../firebase/service'
import { db } from '../../firebase/config'
import { collection, onSnapshot } from 'firebase/firestore'
import { compressImage } from '../../utils/imageUtils'
import { friendlyError } from '../../utils/errors'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import {
  Plus, Pencil, Trash2, Copy, Save, ChevronDown, ChevronUp, Calendar, Clock, MapPin, Coins,
  ExternalLink, AlertCircle, AlertTriangle, BarChart3, Printer, Search, SearchX, X, List, GanttChart, Camera,
} from 'lucide-react'
import { Button, Card, Badge, Tabs, Empty, Dialog, Field, focusFirstInvalid, toast } from '../../ui'
import TimelineView from './planning/TimelineView'
import { AvantagesArtisteBlock, CreneauAvantagesPanel } from './planning/Avantages'
import ConsommationsModal from './planning/ConsommationsModal'
import printArtisteSheet from './planning/printArtisteSheet'
import s from './planning/planning.module.css'

const TYPES = [
  { value: 'musical',        label: 'Musical',        icon: '🎵', color: '#1a6b7a' },
  { value: 'litteraire',     label: 'Littéraire',     icon: '📚', color: '#534AB7' },
  { value: 'cinematographique', label: 'Cinéma',      icon: '🎬', color: '#BA7517' },
  { value: 'autre',          label: 'Autre',          icon: '🎭', color: '#6b6b6b' },
]

const STATUTS = [
  { value: 'a-venir',  label: 'À venir',    color: '#534AB7', bg: '#EDE9FE' },
  { value: 'en-cours', label: 'En cours',   color: '#065f46', bg: '#d1fae5' },
  { value: 'termine',  label: 'Terminé',    color: '#64748b', bg: '#f1f5f9' },
  { value: 'annule',   label: 'Annulé',     color: '#A32D2D', bg: '#FCEBEB' },
]

const EMPTY_FORM = {
  artiste: '', titre: '', type: 'musical', scene: '',
  debut: '', fin: '', description: '', bio: '', photo: '',
  // Balance optionnelle (admin peut la remplir ou laisser vide)
  balanceDebut: '', balanceFin: '', balanceScene: '',
  avantages: { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] },
  liens: { spotify: '', instagram: '', facebook: '', tiktok: '', youtube: '', site: '' },
  statut: 'a-venir',
}

// Convertit un Timestamp Firestore en string compatible datetime-local (heure locale)
function toLocalDatetimeString(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  // Compenser l offset UTC pour avoir l heure locale dans le champ datetime-local
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// Détecte les chevauchements sur la même scène
function detectChevauchements(planning) {
  const conflicts = new Set()
  for (let i = 0; i < planning.length; i++) {
    for (let j = i + 1; j < planning.length; j++) {
      const a = planning[i], b = planning[j]
      if (!a.scene || !b.scene || a.scene !== b.scene) continue
      const ad = a.debut?.toDate ? a.debut.toDate().getTime() : new Date(a.debut).getTime()
      const af = a.fin?.toDate   ? a.fin.toDate().getTime()   : new Date(a.fin).getTime()
      const bd = b.debut?.toDate ? b.debut.toDate().getTime() : new Date(b.debut).getTime()
      const bf = b.fin?.toDate   ? b.fin.toDate().getTime()   : new Date(b.fin).getTime()
      if (isNaN(ad)||isNaN(af)||isNaN(bd)||isNaN(bf)) continue
      if (ad < bf && af > bd) { conflicts.add(a.id); conflicts.add(b.id) }
    }
  }
  return conflicts
}

function fmt2(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function duree(debut, fin) {
  if (!debut || !fin) return ''
  const d = debut.toDate ? debut.toDate() : new Date(debut)
  const f = fin.toDate   ? fin.toDate()   : new Date(fin)
  const m = Math.round((f - d) / 60000)
  if (m <= 0) return ''
  return m >= 60 ? `${Math.floor(m/60)}h${m%60>0?String(m%60).padStart(2,'0'):''}` : `${m}min`
}

// Statut → ton du design system
const STATUT_TONE = { 'a-venir': 'brand', 'en-cours': 'success', termine: 'neutral', annule: 'danger' }

const SORTS = [
  { value: 'debut',   label: 'Trier par heure' },
  { value: 'artiste', label: 'Trier par artiste' },
  { value: 'scene',   label: 'Trier par scène' },
  { value: 'type',    label: 'Trier par type' },
]

export default function Planning({ onNavigate }) {
  const { planning } = useAppStore()
  const { currentEventId } = useEventStore()
  const { user, canAccessPage } = useAuthStore()
  const { isMobile } = useBreakpoint()
  const canManageAvantages = user?.role === 'admin' || user?.role === 'super_admin'

  const [form, setForm]         = useState(EMPTY_FORM)
  const [editing, setEditing]   = useState(null)   // id du créneau en édition
  const [showForm, setShowForm] = useState(false)
  const [notifier, setNotifier] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState('')
  const [tried, setTried]       = useState(false)
  const formRef = useRef()
  const [success, setSuccess]   = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [filterType, setFilterType] = useState('tous')
  const [detailOpen, setDetailOpen] = useState(null) // id créneau ouvert
  const [viewMode, setViewMode]     = useState('liste') // 'liste' | 'timeline'
  const [dragging, setDragging]     = useState(null)    // id créneau draggé
  const [search, setSearch]         = useState('')
  const [sortBy, setSortBy]         = useState('debut') // 'debut' | 'artiste' | 'scene' | 'type'
  const [menuItems, setMenuItems]   = useState([])
  const [artistConsumptions, setArtistConsumptions] = useState([])
  const [cachets, setCachets]       = useState([])
  const [showConsoModal, setShowConsoModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // { id, artiste } en attente de confirmation
  const [pendingDuplicate, setPendingDuplicate] = useState(null) // créneau à dupliquer, en attente du choix
  const fileRef = useRef()

  // Les messages de réussite s'affichent en toast (visibles même formulaire ouvert)
  useEffect(() => { if (success) toast.success(success) }, [success])

  // Charger les articles du menu pour le sélecteur d'avantages
  useEffect(() => {
    if (!currentEventId) return
    const col = collection(db, 'events', currentEventId, 'menu')
    const unsub = onSnapshot(col,
      snap => setMenuItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      err  => console.warn('Menu items listener:', err)
    )
    return unsub
  }, [currentEventId])

  // Charger les consommations artistes
  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchArtistConsumptions(setArtistConsumptions, currentEventId)
    return unsub
  }, [currentEventId])

  // Charger les cachets pour afficher le statut sur chaque créneau
  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchCachets(setCachets, currentEventId)
    return unsub
  }, [currentEventId])

  // Map creneauId → statut cachet ('paye' | 'planifie' | 'aucun' | 'annule')
  const cachetStatusByCreneau = useMemo(() => {
    const map = {}
    cachets.forEach(c => {
      if (!c.creneauId) return
      const existing = map[c.creneauId]
      // Priorité d'affichage : payé > planifié > annulé
      if (!existing || (c.statut === 'paye' && existing !== 'paye')) {
        map[c.creneauId] = c.statut
      }
    })
    return map
  }, [cachets])

  const scenes   = [...new Set(planning.map(p => p.scene).filter(Boolean))]

  // Règles du formulaire, affichées sous chaque champ
  const dDebut = new Date(form.debut).getTime()
  const dFin   = new Date(form.fin).getTime()
  const artisteError = form.artiste.trim() ? null : "Indique le nom de l'artiste"
  const debutError   = !form.debut ? "Indique l'heure de début" : isNaN(dDebut) ? 'Cette date est invalide' : null
  const finError     = !form.fin ? "Indique l'heure de fin" : isNaN(dFin) ? 'Cette date est invalide'
    : dFin <= dDebut ? "L'heure de fin doit être après l'heure de début" : null

  let filtered = filterType === 'tous'
    ? [...planning]
    : planning.filter(p => p.type === filterType)
  // Recherche textuelle (artiste, titre, scène)
  if (search.trim()) {
    const q = search.toLowerCase().trim()
    filtered = filtered.filter(p =>
      (p.artiste || '').toLowerCase().includes(q) ||
      (p.titre   || '').toLowerCase().includes(q) ||
      (p.scene   || '').toLowerCase().includes(q)
    )
  }
  // Tri
  filtered.sort((a, b) => {
    if (sortBy === 'artiste') return (a.artiste || '').localeCompare(b.artiste || '')
    if (sortBy === 'scene')   return (a.scene || '').localeCompare(b.scene || '')
    if (sortBy === 'type')    return (a.type || '').localeCompare(b.type || '')
    // Par défaut : debut
    const ad = a.debut?.toDate ? a.debut.toDate().getTime() : new Date(a.debut || 0).getTime()
    const bd = b.debut?.toDate ? b.debut.toDate().getTime() : new Date(b.debut || 0).getTime()
    return ad - bd
  })

  const conflicts = detectChevauchements(filtered)

  // Calculer le statut automatique selon l'heure
  const autoStatut = (c) => {
    if (c.statut === 'annule') return 'annule'
    const now = Date.now()
    const d = c.debut?.toDate ? c.debut.toDate().getTime() : c.debut ? new Date(c.debut).getTime() : 0
    const f = c.fin?.toDate   ? c.fin.toDate().getTime()   : c.fin   ? new Date(c.fin).getTime()   : 0
    if (now < d) return 'a-venir'
    if (now >= d && now <= f) return 'en-cours'
    return 'termine'
  }

  const openCreate = () => {
    setEditing(null)
    setTried(false)
    // Pré-remplir lat/lng depuis le premier créneau qui en a
    const ref = planning.find(p => p.latitude && p.longitude)
    setForm({ ...EMPTY_FORM, latitude: ref?.latitude || '', longitude: ref?.longitude || '' })
    setPhotoFile(null)
    setPhotoPreview('')
    setNotifier(false)
    setShowForm(true)
  }

  // Demander si on duplique le même artiste (set 2, par ex.) ou si c'est un nouveau créneau vierge
  const openDuplicate = (cr) => setPendingDuplicate(cr)

  const applyDuplicate = (sameArtist) => {
    const cr = pendingDuplicate
    setPendingDuplicate(null)
    if (!cr) return
    setEditing(null) // pas d'édition, c'est une création
    setTried(false)
    setNotifier(false)
    setForm({
      // Toujours conservés : type, scène, horaires
      type:     cr.type    || 'musical',
      scene:    cr.scene   || '',
      debut:    toLocalDatetimeString(cr.debut),
      fin:      toLocalDatetimeString(cr.fin),
      statut:   'a-venir',
      // Infos artiste : selon le choix
      artiste:     sameArtist ? (cr.artiste || '') : '',
      titre:       sameArtist ? (cr.titre   || '') : '',
      bio:         sameArtist ? (cr.bio || '') : '',
      description: sameArtist ? (cr.description || '') : '',
      liens:       sameArtist ? { ...EMPTY_FORM.liens, ...(cr.liens || {}) } : { ...EMPTY_FORM.liens },
      // Toujours vidés : photo, position, lat/lng, avantages
      // (l'admin re-uploadera une photo si besoin, et ré-attribuera les avantages)
      photo:         '',
      photoPosition: 'center center',
      latitude:      '',
      longitude:     '',
      avantages: {
        drinks:   0, meals: 0, eaux: 0,
        drinkIds: [], mealIds: [], eauIds: [],
      },
    })
    setErr('')
    setShowForm(true)
  }

  const openEdit = (cr) => {
    setEditing(cr.id)
    setTried(false)
    setForm({
      artiste:     cr.artiste || '',
      titre:       cr.titre   || '',
      type:        cr.type    || 'musical',
      scene:       cr.scene   || '',
      debut:       cr.debut ? toLocalDatetimeString(cr.debut) : '',
      fin:         cr.fin   ? toLocalDatetimeString(cr.fin)   : '',
      // Balance optionnelle
      balanceDebut: cr.balanceDebut ? toLocalDatetimeString(cr.balanceDebut) : '',
      balanceFin:   cr.balanceFin   ? toLocalDatetimeString(cr.balanceFin)   : '',
      balanceScene: cr.balanceScene || '',
      description: cr.description || '',
      bio:         cr.bio    || '',
      photo:       cr.photo  || '',
      photoPosition: cr.photoPosition || 'center center',
      latitude:      cr.latitude  || '',
      longitude:     cr.longitude || '',
      liens:       cr.liens  || { spotify:'', instagram:'', facebook:'', tiktok:'', youtube:'', site:'' },
      statut:      cr.statut || 'a-venir',
      avantages: {
        drinks:   cr.avantages?.drinks   || 0,
        meals:    cr.avantages?.meals    || 0,
        eaux:     cr.avantages?.eaux     || 0,
        drinkIds: cr.avantages?.drinkIds || [],
        mealIds:  cr.avantages?.mealIds  || [],
        eauIds:   cr.avantages?.eauIds   || [],
      },
    })
    setPhotoFile(null)
    setPhotoPreview(cr.photo || '')
    setNotifier(false)
    setShowForm(true)
  }

  const uploadPhoto = async () => {
    if (!photoFile) return form.photo
    // Compresse en JPEG max 800px et < 800 ko (évite l'erreur Firestore > 1 MB).
    // L'image source peut faire n'importe quelle taille — la fonction se débrouille.
    try {
      return await compressImage(photoFile, 800, 0.80)
    } catch (e) {
      console.warn('Compression image impossible, conserve l\'ancienne :', e)
      return form.photo
    }
  }

  const handleSubmit = async () => {
    if (artisteError || debutError || finError) { setTried(true); focusFirstInvalid(formRef.current); return }
    setLoading(true); setErr('')
    try {
      const photoUrl = await uploadPhoto()
      // Convertit lat/lng en number propre (Firestore + calculs futurs)
      const latParsed = form.latitude !== '' && form.latitude != null ? parseFloat(String(form.latitude).replace(',', '.')) : NaN
      const lngParsed = form.longitude !== '' && form.longitude != null ? parseFloat(String(form.longitude).replace(',', '.')) : NaN
      const payload = {
        ...form,
        photo:  photoUrl,
        debut:  new Date(form.debut),
        fin:    new Date(form.fin),
        // Balance : convertit en Date si renseignée, sinon null pour effacer
        balanceDebut: form.balanceDebut ? new Date(form.balanceDebut) : null,
        balanceFin:   form.balanceFin   ? new Date(form.balanceFin)   : null,
        balanceScene: form.balanceScene || '',
        liens:  form.liens,
        // Stocke en number ; sinon chaîne vide (pas de coordonnées)
        latitude:  !isNaN(latParsed) ? latParsed : '',
        longitude: !isNaN(lngParsed) ? lngParsed : '',
        avantages: {
          drinks:   parseInt(form.avantages?.drinks)   || 0,
          meals:    parseInt(form.avantages?.meals)    || 0,
          eaux:     parseInt(form.avantages?.eaux)     || 0,
          drinkIds: form.avantages?.drinkIds || [],
          mealIds:  form.avantages?.mealIds  || [],
          eauIds:   form.avantages?.eauIds   || [],
        },
      }
      if (editing) {
        await updateCreneau(editing, payload, notifier)
      } else {
        await addCreneau(payload)
      }
      setSuccess(editing ? 'Créneau mis à jour !' : 'Créneau ajouté !')
      setTimeout(() => setSuccess(''), 3000)
      setShowForm(false)
    } catch(e) { setErr(friendlyError(e, "Le créneau n'a pas été enregistré.")) }
    finally { setLoading(false) }
  }

  // Suppression en deux temps : la fenêtre de confirmation remplace window.confirm
  const handleDelete = async (id, artiste) => {
    setPendingDelete({ id, artiste })
  }
  const confirmDelete = async () => {
    const { id } = pendingDelete
    setPendingDelete(null)
    await deleteCreneau(id)
  }

  const printPlanning = () => {
    // Grouper par jour
    const toDate = (ts) => ts?.toDate ? ts.toDate() : new Date(ts)
    const byDay = {}
    filtered.forEach(cr => {
      const d = toDate(cr.debut)
      if (!d || isNaN(d.getTime())) return
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
      if (!byDay[key]) byDay[key] = []
      byDay[key].push(cr)
    })
    const dayLabel = (key) => {
      const [y, m, dd] = key.split('-')
      const date = new Date(parseInt(y), parseInt(m)-1, parseInt(dd))
      return date.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    }
    const fmtHour = (d) => toDate(d).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })

    const typeLabel = { musical: 'Musical', litteraire: 'Littéraire', cinematographique: 'Cinéma', autre: 'Autre' }

    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Planning Festival</title>'
    html += '<style>'
    html += 'body{font-family:system-ui,sans-serif;color:#222;padding:20px;max-width:900px;margin:0 auto}'
    html += 'h1{color:#1a6b7a;font-size:22px;margin:0 0 6px}'
    html += '.sub{color:#666;font-size:12px;margin-bottom:20px}'
    html += 'h2{color:#1a6b7a;font-size:16px;margin:24px 0 8px;text-transform:capitalize;border-bottom:2px solid #1a6b7a;padding-bottom:4px}'
    html += 'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
    html += 'th,td{padding:8px 10px;text-align:left;font-size:13px;border-bottom:0.5px solid #ddd}'
    html += 'th{background:#f5f5f5;font-weight:700;font-size:11px;text-transform:uppercase;color:#666}'
    html += '.annule{text-decoration:line-through;color:#999}'
    html += '.foot{margin-top:30px;padding-top:14px;border-top:1px solid #ddd;text-align:center;font-size:10px;color:#888}'
    html += '@media print { body { padding: 10mm; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }'
    html += '</style></head><body>'
    html += '<h1>📅 Planning Festival</h1>'
    html += '<div class="sub">Édité le ' + new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }) + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) + ' · ' + filtered.length + ' créneau' + (filtered.length > 1 ? 'x' : '') + '</div>'

    const dayKeys = Object.keys(byDay).sort()
    dayKeys.forEach(key => {
      const crs = byDay[key].sort((a,b) => toDate(a.debut).getTime() - toDate(b.debut).getTime())
      html += '<h2>📅 ' + dayLabel(key) + '</h2>'
      html += '<table>'
      html += '<thead><tr><th>Heure</th><th>Artiste</th><th>Type</th><th>Scène</th><th>Statut</th></tr></thead><tbody>'
      crs.forEach(cr => {
        const cls = cr.statut === 'annule' ? 'annule' : ''
        html += '<tr class="' + cls + '">'
        html += '<td><strong>' + fmtHour(cr.debut) + ' → ' + fmtHour(cr.fin) + '</strong></td>'
        html += '<td>' + (cr.artiste || '') + (cr.titre ? ' <em>(' + cr.titre + ')</em>' : '') + '</td>'
        html += '<td>' + (typeLabel[cr.type] || cr.type || '—') + '</td>'
        html += '<td>' + (cr.scene || '—') + '</td>'
        html += '<td>' + (cr.statut === 'annule' ? '❌ Annulé' : cr.statut === 'en-cours' ? '▶ En cours' : '—') + '</td>'
        html += '</tr>'
      })
      html += '</tbody></table>'
    })

    html += '<div class="foot">' + APP_FULL_LABEL + ' — Développée par <strong>Maison Ylla</strong></div>'
    html += '</body></html>'

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const handleStatut = async (id, statut) => {
    await updateCreneau(id, { statut }, statut === 'annule')
  }

  const typeInfo = (t) => TYPES.find(x => x.value === t) || TYPES[3]
  const statutInfo = (s) => STATUTS.find(x => x.value === s) || STATUTS[0]

  if (!currentEventId) return (
    <Empty icon={Calendar} title="Aucun événement sélectionné"
      action={canAccessPage('evenements') && <Button variant="secondary" onClick={() => onNavigate('evenements')}>Choisir un événement</Button>}>
      Le planning de ton événement apparaîtra ici dès que tu en auras choisi un.
    </Empty>
  )

  // Actions secondaires de l'en-tête
  const consoButton = canManageAvantages && (
    <Button variant="secondary" icon={BarChart3} iconOnly onClick={() => setShowConsoModal(true)}
      title="Consommations artistes" aria-label="Consommations artistes" />
  )
  const printButton = (
    <Button variant="secondary" icon={Printer} iconOnly onClick={printPlanning}
      title="Imprimer / Exporter PDF" aria-label="Imprimer / Exporter PDF" />
  )

  const viewItems = [
    { value: 'liste',    label: <span className={s.viewIcon}><List size={14} aria-hidden="true" />Liste</span> },
    { value: 'timeline', label: <span className={s.viewIcon}><GanttChart size={14} aria-hidden="true" />Frise</span> },
  ]
  const typeItems = [{ value: 'tous', label: '🎭 Tous' }, ...TYPES.map(t => ({ value: t.value, label: `${t.icon} ${t.label}` }))]
  const lienArtiste = editing ? window.location.origin + '/artiste?ev=' + currentEventId + '&cr=' + editing : ''

  // État vide commun à la liste et à la frise : premier créneau ou filtres trop stricts
  const q = search.trim()
  const noCreneau = q || filterType !== 'tous' ? (
    <Empty icon={SearchX} title={q ? `Aucun créneau pour « ${q} »` : 'Aucun créneau de ce type'}
      action={<Button variant="secondary" onClick={() => { setSearch(''); setFilterType('tous') }}>{filterType !== 'tous' ? 'Effacer les filtres' : 'Effacer la recherche'}</Button>}>
      {q ? "Vérifie l'orthographe, ou cherche un autre artiste, titre ou scène." : 'Les créneaux de ce type apparaîtront ici dès que tu en ajouteras.'}
    </Empty>
  ) : (
    <Empty icon={Calendar} title="Aucun créneau pour le moment"
      action={<Button icon={Plus} onClick={openCreate}>Ajouter le premier créneau</Button>}>
      Les concerts, lectures et projections que tu ajoutes apparaîtront ici et sur la vue live.
    </Empty>
  )

  return (
    <div className={s.page}>

      {/* En-tête */}
      <header className={s.header}>
        <div className={s.heading}>
          <h1 className={s.title}>Planning festival</h1>
          <div className={s.meta}>
            <span>{planning.length} créneau{planning.length !== 1 ? 'x' : ''}</span>
            <span aria-hidden="true">·</span>
            <a href={'/live?ev=' + (currentEventId || '')} target="_blank" className={s.liveLink}><ExternalLink size={12} /> Vue live</a>
          </div>
        </div>
        <div className={s.headActions}>
          <Tabs items={viewItems} value={viewMode} onChange={setViewMode} size="sm" label="Affichage" />
          {consoButton}
          {printButton}
          <Button icon={Plus} onClick={openCreate}>{isMobile ? 'Ajouter' : 'Ajouter un créneau'}</Button>
        </div>
      </header>

      {/* Chevauchements */}
      {conflicts.size > 0 && (
        <p className={s.warn}>
          <AlertTriangle size={15} aria-hidden="true" />
          <span><strong>{conflicts.size / 2}</strong> chevauchement{conflicts.size > 2 ? 's' : ''} détecté{conflicts.size > 2 ? 's' : ''} sur une même scène. Vérifiez les créneaux en surbrillance.</span>
        </p>
      )}

      {/* Recherche, tri et filtre par type */}
      <Card>
        <div className={s.toolbar}>
          <div className={s.search}>
            <Search size={15} aria-hidden="true" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un artiste, un titre, une scène…"
              aria-label="Rechercher"
              className={clsx(s.input, s.inputSm, s.searchInput)} />
            {search && (
              <button type="button" onClick={() => setSearch('')} title="Effacer" aria-label="Effacer la recherche" className={s.clear}>
                <X size={15} />
              </button>
            )}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} title="Trier par" aria-label="Trier par" className={s.select}>
            {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className={s.sep} aria-hidden="true" />
          <Tabs items={typeItems} value={filterType} onChange={setFilterType} size="sm" label="Type d'activité" />
        </div>
      </Card>

      {/* ── Frise ── */}
      {viewMode === 'timeline' && <TimelineView planning={filtered} conflicts={conflicts} onEdit={openEdit} onDelete={handleDelete} onStatut={handleStatut} onUpdateDebut={async (id, newDebut, newFin) => { await updateCreneau(id, { debut: newDebut, fin: newFin }, true) }} empty={noCreneau} />}

      {viewMode === 'liste' && filtered.length === 0 && (
        <Card>{noCreneau}</Card>
      )}

      {viewMode === 'liste' && filtered.length > 0 && (
        <div className={s.list}>
          {filtered.map(cr => {
            const ti   = typeInfo(cr.type)
            const st   = autoStatut(cr)
            const stI  = statutInfo(cr.statut === 'annule' ? 'annule' : st)
            const open = detailOpen === cr.id
            // Bordure : chevauchement > annulé > en cours
            const state = conflicts.has(cr.id) ? 'conflict' : cr.statut === 'annule' ? 'annule' : st === 'en-cours' ? 'live' : undefined
            const btnSize = isMobile ? 'md' : 'sm'
            return (
              <article key={cr.id} className={s.item} data-state={state} style={{ '--c': ti.color }}>
                {/* Ligne principale */}
                <div className={s.itemMain}>
                  <div className={clsx(s.avatar, cr.photo && s.avatarClickable)}
                    onClick={() => cr.photo && setDetailOpen(open ? null : cr.id)}>
                    {cr.photo ? <img src={cr.photo} alt={cr.artiste} style={{ objectPosition: cr.photoPosition || 'center center' }}/> : ti.icon}
                  </div>
                  <div className={s.itemBody}>
                    <div className={s.itemTitle}>
                      <button type="button" className={s.artiste} onClick={() => setDetailOpen(open ? null : cr.id)}>
                        {cr.artiste}
                      </button>
                      {cr.titre && <span className={s.sousTitre}>— {cr.titre}</span>}
                      <Badge tone={STATUT_TONE[stI.value]}>{stI.label}</Badge>
                      {conflicts.has(cr.id) && <Badge tone="warning" icon={AlertTriangle}>Chevauchement</Badge>}
                      {/* Pastille statut cachet */}
                      {(() => {
                        const st = cachetStatusByCreneau[cr.id]
                        if (st === 'paye') return <Badge tone="success" icon={Coins} title="Cachet payé">Payé</Badge>
                        if (st === 'planifie') return <Badge tone="warning" icon={Coins} title="Cachet à payer">À payer</Badge>
                        if (st === 'annule') return null // pas d'affichage
                        return <Badge tone="neutral" icon={Coins} title="Aucun cachet enregistré pour cet artiste">Aucun</Badge>
                      })()}
                    </div>
                    <div className={s.itemMeta}>
                      <span className={s.num}><Clock size={12} aria-hidden="true" /> {fmt2(cr.debut)} → {fmt2(cr.fin)} {duree(cr.debut,cr.fin) && '('+duree(cr.debut,cr.fin)+')'}</span>
                      {cr.scene && <span><MapPin size={12} aria-hidden="true" /> {cr.scene}</span>}
                      <span className={s.typeTag}>{ti.icon} {ti.label}</span>
                    </div>
                  </div>
                  <div className={s.itemActions}>
                    <Button variant="secondary" size={btnSize} iconOnly icon={open ? ChevronUp : ChevronDown}
                      onClick={() => setDetailOpen(open ? null : cr.id)} title="Voir détails" aria-label="Voir détails" aria-expanded={open} />
                    <Button variant="secondary" size={btnSize} iconOnly icon={Pencil}
                      onClick={() => openEdit(cr)} title="Modifier" aria-label="Modifier" />
                    <Button variant="secondary" size={btnSize} iconOnly icon={Copy}
                      onClick={() => openDuplicate(cr)} title="Dupliquer" aria-label="Dupliquer" />
                    <Button variant="danger" size={btnSize} iconOnly icon={Trash2}
                      onClick={() => handleDelete(cr.id, cr.artiste)} title="Supprimer" aria-label="Supprimer" />
                  </div>
                </div>

                {open && (
                  <div className={s.detail}>
                    {cr.bio && <p className={s.bio}>{cr.bio}</p>}
                    {cr.description && <p className={s.desc}>{cr.description}</p>}
                    {cr.liens && Object.entries(cr.liens).some(([,v])=>v) && (
                      <div className={s.extLinks}>
                        {Object.entries(cr.liens).filter(([,v])=>v).map(([k,v])=>(
                          <a key={k} href={v} target="_blank" rel="noreferrer" className={s.extLink}>
                            {k} <ExternalLink size={11} aria-hidden="true" />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className={s.statuts}>
                      <span className={s.statutsLabel}>Statut :</span>
                      {STATUTS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => handleStatut(cr.id, opt.value)}
                          data-tone={STATUT_TONE[opt.value]}
                          aria-pressed={cr.statut === opt.value}
                          className={clsx(s.statut, cr.statut === opt.value && s.statutOn)}>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Avantages artiste + consos temps réel — réservé aux admins */}
                    {canManageAvantages && (
                      <CreneauAvantagesPanel creneau={cr} consumptions={artistConsumptions} menuItems={menuItems}/>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* Formulaire du créneau */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} className={s.formDialog}
        title={editing ? 'Modifier le créneau' : 'Nouveau créneau'}
        footer={<>
          <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
          <Button icon={Save} onClick={handleSubmit} loading={loading}>
            {loading ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Ajouter'}
          </Button>
        </>}>
        <div ref={formRef} className={s.form}>

          {/* Photo */}
          <div className={s.photoRow}>
            <button type="button" className={s.photo} onClick={() => fileRef.current?.click()} aria-label="Choisir une photo">
              {photoPreview
                ? <img src={photoPreview} alt="" />
                : <Camera size={26} aria-hidden="true" />}
            </button>
            <div className={s.photoSide}>
              <span className={s.photoTitle}>Photo de l'artiste</span>
              <div>
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Choisir une photo</Button>
              </div>
              {photoPreview && (
                <div className={s.field}>
                  <span className={s.label}>Position de la photo</span>
                  <div className={s.positions}>
                    {[['top','Haut'],['center','Milieu'],['bottom','Bas']].map(([pos, label]) => (
                      <button key={pos} type="button" onClick={() => setForm(f => ({ ...f, photoPosition: 'center ' + pos }))}
                        className={clsx(s.chip, s.chipSm, form.photoPosition === 'center ' + pos && s.chipOn)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className={s.hidden}
                onChange={e => {
                  const f = e.target.files[0]
                  if (!f) return
                  setPhotoFile(f)
                  const r = new FileReader()
                  r.onload = ev => setPhotoPreview(ev.target.result)
                  r.readAsDataURL(f)
                }}/>
            </div>
          </div>

          {/* Champs */}
          {[
            { key: 'artiste',     label: 'Nom artiste / intervenant *', placeholder: 'ex : Samba Babou', error: artisteError },
            { key: 'titre',       label: 'Titre du set / œuvre',        placeholder: 'ex : Live acoustique' },
            { key: 'scene',       label: 'Scène / lieu',                placeholder: 'ex : Scène principale', list: scenes },
          ].map(({ key, label, placeholder, list, error }) => (
            <React.Fragment key={key}>
              <Field label={<span className={s.label}>{label}</span>} error={error} valid={error === null} showError={tried}>
                <input list={list ? `dl-${key}` : undefined}
                  value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}/>
              </Field>
              {list && <datalist id={`dl-${key}`}>{list.map(l => <option key={l} value={l}/>)}</datalist>}
            </React.Fragment>
          ))}

          {/* Type */}
          <div className={s.field}>
            <span className={s.label}>Type d'activité</span>
            <div className={s.chips}>
              {TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  aria-pressed={form.type === t.value}
                  className={clsx(s.chip, s.chipType, form.type === t.value && s.chipOn)} style={{ '--c': t.color }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Horaires */}
          <div className={s.grid2}>
            {[['debut','Début *', debutError],['fin','Fin *', finError]].map(([key, label, error]) => (
              <Field key={key} label={<span className={s.label}>{label}</span>} error={error} showError={tried}>
                <input type="datetime-local" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className={s.dateInput}/>
              </Field>
            ))}
          </div>

          {/* Balance (optionnelle) — l'artiste recevra des rappels 15min et 5min avant */}
          <div className={s.balance}>
            <div className={s.balanceHead}>
              <span className={s.label}>Balance (optionnel)</span>
              {(form.balanceDebut || form.balanceFin || form.balanceScene) && (
                <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, balanceDebut: '', balanceFin: '', balanceScene: '' }))}>
                  Effacer
                </Button>
              )}
            </div>
            <p className={s.hint}>Si renseignée, l'artiste reçoit un rappel par notification (son + popup) 15 min et 5 min avant la balance.</p>
            <div className={s.grid2}>
              <label className={s.field}>
                <span className={s.hint}>Début</span>
                <input type="datetime-local" value={form.balanceDebut || ''}
                  onChange={e => setForm(f => ({ ...f, balanceDebut: e.target.value }))}
                  className={clsx(s.input, s.inputSm)}/>
              </label>
              <label className={s.field}>
                <span className={s.hint}>Fin</span>
                <input type="datetime-local" value={form.balanceFin || ''}
                  onChange={e => setForm(f => ({ ...f, balanceFin: e.target.value }))}
                  className={clsx(s.input, s.inputSm)}/>
              </label>
            </div>
            <label className={s.field}>
              <span className={s.hint}>Scène/Lieu de la balance (laisser vide pour reprendre la scène de prestation)</span>
              <input type="text" value={form.balanceScene || ''}
                onChange={e => setForm(f => ({ ...f, balanceScene: e.target.value }))}
                placeholder={form.scene || 'Ex : Studio, Régie, Scène principale...'}
                className={clsx(s.input, s.inputSm)}/>
            </label>
          </div>

          {/* Raccourci vers Cachets — visible uniquement en édition */}
          {editing && (
            <div className={s.cachetLink}>
              <span className={s.cachetIcon}><Coins size={16} aria-hidden="true"/></span>
              <div className={s.cachetText}>
                <div className={s.cachetTitle}>Cachet de cet artiste</div>
                <div className={s.hint}>Ouvrir la page Cachets pour gérer la rémunération</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                setShowForm(false)
                setEditing(null)
                if (typeof onNavigate === 'function') onNavigate('cachets')
              }}>
                Gérer →
              </Button>
            </div>
          )}

          {/* Bio */}
          <label className={s.field}>
            <span className={s.label}>Biographie</span>
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Présentation de l'artiste..."
              rows={3}
              className={s.textarea}/>
          </label>

          {/* Localisation GPS */}
          <div className={s.field}>
            <span className={s.label}>Localisation GPS (optionnel)</span>
            <p className={s.hint}>Renseigner pour afficher la carte du festival dans la fiche artiste. Format décimal (la virgule est convertie en point automatiquement).</p>
            <div className={s.grid2}>
              {['latitude', 'longitude'].map(k => (
                <input
                  key={k}
                  value={form[k]}
                  inputMode="decimal"
                  aria-label={k === 'latitude' ? 'Latitude' : 'Longitude'}
                  onChange={e => {
                    // Accepte virgule française, espaces accidentels — stocke en string propre.
                    // La conversion finale en number se fait à l'enregistrement.
                    const v = e.target.value.replace(',', '.').replace(/\s/g, '')
                    setForm(f => ({ ...f, [k]: v }))
                  }}
                  placeholder={k === 'latitude' ? 'ex: 48.5734' : 'ex: 7.7521'}
                  className={clsx(s.input, s.inputSm)}/>
              ))}
            </div>
          </div>

          {/* Liens */}
          <div className={s.field}>
            <span className={s.label}>Liens</span>
            <div className={s.links}>
              {['spotify','instagram','facebook','tiktok','youtube','site'].map(k => (
                <input key={k} value={form.liens[k]} onChange={e => setForm(f => ({ ...f, liens: { ...f.liens, [k]: e.target.value } }))}
                  placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                  aria-label={k}
                  className={clsx(s.input, s.inputSm)}/>
              ))}
            </div>
          </div>

          {/* Avantages artiste — réservé aux admins */}
          {canManageAvantages && (
            <AvantagesArtisteBlock form={form} setForm={setForm} menuItems={menuItems}/>
          )}

          {/* Lien espace artiste — réservé aux admins/super_admins (pas au directeur artistique) */}
          {editing && canManageAvantages && (
            <div className={s.box}>
              <span className={s.label}>Lien espace artiste</span>
              <div className={s.boxRow}>
                <input readOnly value={lienArtiste}
                  onClick={e => e.target.select()}
                  aria-label="Lien espace artiste"
                  className={clsx(s.input, s.mono)}/>
                <Button size="sm" icon={Copy} onClick={() => {
                  const url = window.location.origin + '/artiste?ev=' + currentEventId + '&cr=' + editing
                  navigator.clipboard?.writeText(url).then(() => setSuccess('Lien copié !'))
                  setTimeout(() => setSuccess(''), 2000)
                }}>
                  Copier
                </Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => printArtisteSheet(form, editing, currentEventId)}>
                  Imprimer la fiche
                </Button>
              </div>
              <p className={s.hint}>Envoyez ce lien à l'artiste ou imprimez sa fiche (QR + liens) à remettre en main propre.</p>
            </div>
          )}

          {/* Notifier */}
          {editing && (
            <label className={s.notify}>
              <input type="checkbox" checked={notifier} onChange={e => setNotifier(e.target.checked)}/>
              <div>
                <b>Notifier les spectateurs</b>
                <span>Envoie une notification de changement de programme</span>
              </div>
            </label>
          )}

          {err && <div className={s.error} role="alert"><AlertCircle size={15} aria-hidden="true" />{err}</div>}
        </div>
      </Dialog>

      {/* Confirmation de suppression */}
      <Dialog open={!!pendingDuplicate} onClose={() => setPendingDuplicate(null)} title="Dupliquer ce créneau"
        footer={<>
          <Button variant="secondary" onClick={() => applyDuplicate(false)}>Créneau vierge</Button>
          <Button icon={Copy} onClick={() => applyDuplicate(true)}>Même artiste</Button>
        </>}>
        <p className={s.muted}>
          <b>Même artiste</b> garde l'artiste, le titre, la bio, la description et les liens (utile pour un 2e set).{' '}
          <b>Créneau vierge</b> garde uniquement le type, la scène et les horaires.
          Dans tous les cas, la photo et la localisation ne sont pas recopiées.
        </p>
      </Dialog>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Supprimer le créneau ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>Annuler</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmDelete}>Supprimer</Button>
        </>}>
        <p className={s.muted}>Supprimer le créneau de « {pendingDelete?.artiste} » ? Cette action est définitive.</p>
      </Dialog>

      {/* Suivi des consommations artistes */}
      {canManageAvantages && showConsoModal && (
        <ConsommationsModal
          consumptions={artistConsumptions}
          planning={planning}
          onClose={() => setShowConsoModal(false)}/>
      )}
    </div>
  )
}
