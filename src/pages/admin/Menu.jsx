/**
 * pages/admin/Menu.jsx — v3
 * Catégories et articles gérés directement via Firebase (même pattern que Benevoles.jsx)
 * Catégories : collection(db, 'categories') — racine, simple, fiable
 * Articles    : via useAppStore (déjà fonctionnel)
 */
import React, { useState, useEffect, useRef } from 'react'
import useFermerSansEnregistrer from '../../hooks/useFermerSansEnregistrer'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Plus, Trash2, Pencil, X, Save, PackagePlus, FileSpreadsheet, GripVertical, ChevronUp, ChevronDown, Store, Layers, AlertTriangle, Tag } from 'lucide-react'
import { watchCarte, saveRayons, saveStands, newId, standLabel } from '../../menu/carte'
import { Button, Card, Badge, Tabs, Empty, Dialog, Field, focusFirstInvalid, toast } from '../../ui'
import s from './menu/menu.module.css'
import MenuItemPhoto from '../../components/MenuItemPhoto'
import MenuImportDialog from './menu/MenuImportDialog'
import { ALLERGENES_UE } from '../../utils/allergenes'

import { ICONS, getIcon } from '../../menu/icons'

// Couleurs de catégorie : ce sont des données (enregistrées en base)
const COLORS = [
  '#009090','#F07848','#BA7517','#0F6E56','#A32D2D',
  '#2563EB','#7C3AED','#D97706','#059669','#DC2626',
  '#0891B2','#7C2D12','#166534','#1e40af','#6b21a8',
]

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

// Même lecture du stock que la caisse (POS)
const stockBadge = (m) => {
  const stock = m.stock || 0
  if (stock === 0) return <Badge tone="danger">Rupture</Badge>
  if (stock <= (m.seuilAlerte || 10)) return <Badge tone="warning">{m.stock}</Badge>
  return <Badge tone="brand">{m.stock}</Badge>
}

export default function Menu() {
  const { menu, updateMenuItem, addMenuItem, deleteMenuItem } = useAppStore()
  const { currentEventId } = useEventStore()

  // ── Catégories — directement depuis Firebase ─────────────────────
  const [categories,    setCategories]    = useState([])
  const [catsLoading,   setCatsLoading]   = useState(true)
  const [catsRetry,     setCatsRetry]     = useState(0)
  const [section,    setSection]    = useState('articles')
  const [editingCat, setEditingCat] = useState(null)
  const [catForm,    setCatForm]    = useState({ nom:'', couleur:COLORS[0], icon:'utensils', ordre:99, rayonId:'' })

  // ── Rayons et stands (events/{ev}/settings/carte) ────────────────
  const [carte,        setCarte]        = useState({ rayons: [], stands: [] })
  const [rayonForm,    setRayonForm]    = useState(null)   // { id|'new', nom, icon }
  const [rayonTried,   setRayonTried]   = useState(false)
  const [standForm,    setStandForm]    = useState(null)   // { id|'new', numero, nom }
  const [standTried,   setStandTried]   = useState(false)
  const [pendingRayon, setPendingRayon] = useState(null)
  const [pendingStand, setPendingStand] = useState(null)
  const [dragCat,      setDragCat]      = useState(null)   // id de la catégorie déplacée
  const rayonFormRef = useRef(null)
  const standFormRef = useRef(null)
  const [savingCat,  setSavingCat]  = useState(false)
  const [catTried,   setCatTried]   = useState(false)
  const catFormRef = useRef(null)

  // ── Articles ─────────────────────────────────────────────────────
  const [editingItem, setEditingItem] = useState(null)
  const [importing,   setImporting]   = useState(false)
  const [itemForm,    setItemForm]    = useState({ nom:'', prix:0, stock:100, cat:'', typeConsommation:'' })
  const [savingItem,  setSavingItem]  = useState(false)
  const [itemTried,   setItemTried]   = useState(false)
  const itemFormRef = useRef(null)
  // « Fermer sans enregistrer ? » (24/11/2026) : « Annuler » demande si un champ de l'article a changé
  const questionArticle = useFermerSansEnregistrer(itemFormRef, editingItem !== null, itemForm.nom || '')

  // ── Confirmations (remplacent confirm/prompt) ────────────────────
  const [pendingCat, setPendingCat] = useState(null)     // catégorie à supprimer
  const [restock,    setRestock]    = useState(null)     // { item, qty }
  const [restockTried, setRestockTried] = useState(false)
  const restockRef = useRef(null)

  // Listener Firebase direct — avec retry automatique si erreur
  useEffect(() => {
    setCatsLoading(true)
    let retryTimer = null

    const catCol = currentEventId ? collection(db, 'events', currentEventId, 'categories') : collection(db, 'categories')
    const unsub = onSnapshot(
      catCol,
      snap => {
        setCategories(
          snap.docs
            .map(d => ({ ...d.data(), id: d.id }))
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
        )
        setCatsLoading(false)
      },
      err => {
        console.warn('categories listener error:', err)
        setCatsLoading(false)
        // Retry après 2 secondes
        retryTimer = setTimeout(() => setCatsRetry(r => r + 1), 2000)
      }
    )

    return () => { unsub(); if (retryTimer) clearTimeout(retryTimer) }
  }, [catsRetry])

  useEffect(() => watchCarte(currentEventId, setCarte, err => console.warn('carte listener error:', err)), [currentEventId])

  const { rayons, stands } = carte
  const rayonIds = new Set(rayons.map(r => r.id))
  const standById = new Map(stands.map(st => [st.id, st]))
  const catDocRef = (id) => currentEventId ? doc(db, 'events', currentEventId, 'categories', id) : doc(db, 'categories', id)

  // Catégories d'un rayon ('' = sans rayon), dans l'ordre d'affichage
  const catsOf = (rayonId) => categories.filter(c => (rayonIds.has(c.rayonId) ? c.rayonId : '') === rayonId)

  // Ordre global : rayon par rayon, puis catégories dans le rayon. Seules les valeurs changées sont écrites.
  const persistOrder = async (groups) => {
    let i = 0
    const writes = []
    for (const list of groups) for (const c of list) {
      i += 1
      if (c.ordre !== i) writes.push(updateDoc(catDocRef(c.id), { ordre: i }))
    }
    try { await Promise.all(writes) }
    catch (e) { toast.error(friendlyError(e, "Le nouvel ordre n'a pas été enregistré.")) }
  }
  const groupsWith = (rayonId, list) => [...rayons.map(r => r.id), ''].map(id => id === rayonId ? list : catsOf(id))

  const moveCat = (cat, delta) => {
    const rid = rayonIds.has(cat.rayonId) ? cat.rayonId : ''
    const list = [...catsOf(rid)]
    const from = list.findIndex(c => c.id === cat.id)
    const to = from + delta
    if (to < 0 || to >= list.length) return
    list.splice(to, 0, list.splice(from, 1)[0])
    persistOrder(groupsWith(rid, list))
  }

  // Glisser-déposer : sur une catégorie (place avant elle) ou sur l'en-tête d'un rayon (à la fin)
  const dropCat = async (targetRayonId, beforeCatId = null) => {
    const cat = categories.find(c => c.id === dragCat)
    setDragCat(null)
    if (!cat || cat.id === beforeCatId) return
    const list = catsOf(targetRayonId).filter(c => c.id !== cat.id)
    const at = beforeCatId ? list.findIndex(c => c.id === beforeCatId) : -1
    list.splice(at < 0 ? list.length : at, 0, cat)
    const curRayon = rayonIds.has(cat.rayonId) ? cat.rayonId : ''
    if (curRayon !== targetRayonId) {
      try { await updateDoc(catDocRef(cat.id), { rayonId: targetRayonId }) }
      catch (e) { toast.error(friendlyError(e, "La catégorie n'a pas été déplacée.")); return }
    }
    const groups = [...rayons.map(r => r.id), ''].map(id =>
      id === targetRayonId ? list : catsOf(id).filter(c => c.id !== cat.id))
    persistOrder(groups)
  }

  // ── Rayons ────────────────────────────────────────────────────────
  const startNewRayon  = () => { setRayonTried(false); setRayonForm({ id:'new', nom:'', icon:'utensils' }) }
  const startEditRayon = (r) => { setRayonTried(false); setRayonForm({ id:r.id, nom:r.nom, icon:r.icon || 'utensils' }) }
  const saveRayon = async () => {
    const nom = rayonForm.nom.trim()
    if (!nom) { setRayonTried(true); focusFirstInvalid(rayonFormRef.current); return }
    const next = rayonForm.id === 'new'
      ? [...rayons, { id: newId(), nom, icon: rayonForm.icon }]
      : rayons.map(r => r.id === rayonForm.id ? { ...r, nom, icon: rayonForm.icon } : r)
    try { await saveRayons(currentEventId, next); setRayonForm(null) }
    catch (e) { toast.error(friendlyError(e, "Le rayon n'a pas été enregistré.")) }
  }
  const moveRayon = (r, delta) => {
    const list = [...rayons]
    const from = list.findIndex(x => x.id === r.id)
    const to = from + delta
    if (to < 0 || to >= list.length) return
    list.splice(to, 0, list.splice(from, 1)[0])
    saveRayons(currentEventId, list).catch(e => toast.error(friendlyError(e, "Le nouvel ordre n'a pas été enregistré.")))
  }
  const confirmDeleteRayon = async () => {
    const r = pendingRayon
    setPendingRayon(null)
    if (!r) return
    try {
      await saveRayons(currentEventId, rayons.filter(x => x.id !== r.id))
      await Promise.all(categories.filter(c => c.rayonId === r.id).map(c => updateDoc(catDocRef(c.id), { rayonId: '' })))
    } catch (e) { toast.error(friendlyError(e, "Le rayon n'a pas été supprimé.")) }
  }

  // ── Stands ────────────────────────────────────────────────────────
  const nextNumero = () => stands.reduce((m, st) => Math.max(m, st.numero || 0), 0) + 1
  const startNewStand  = () => { setStandTried(false); setStandForm({ id:'new', numero: nextNumero(), nom:'', benevoles: false }) }
  const startEditStand = (st) => { setStandTried(false); setStandForm({ id:st.id, numero:st.numero, nom:st.nom, benevoles: st.benevoles === true }) }
  const standNumeroErr = (f) => {
    const n = parseInt(f?.numero)
    if (!(n > 0)) return 'Indique un numéro supérieur à 0'
    if (stands.some(st => st.numero === n && st.id !== f.id)) return `Le numéro ${n} est déjà pris`
    return null
  }
  const saveStand = async () => {
    const nom = standForm.nom.trim()
    if (!nom || standNumeroErr(standForm)) { setStandTried(true); focusFirstInvalid(standFormRef.current); return }
    const numero = parseInt(standForm.numero)
    const benevoles = standForm.benevoles === true
    const id = standForm.id === 'new' ? newId() : standForm.id
    // Un seul « Stand des bénévoles » : le cocher ici le retire des autres
    const base = (benevoles ? stands.map(st => ({ ...st, benevoles: false })) : stands)
    const next = standForm.id === 'new'
      ? [...base, { id, numero, nom, benevoles }]
      : base.map(st => st.id === id ? { ...st, numero, nom, benevoles } : st)
    try { await saveStands(currentEventId, next); setStandForm(null) }
    catch (e) { toast.error(friendlyError(e, "Le stand n'a pas été enregistré.")) }
  }
  const confirmDeleteStand = async () => {
    const st = pendingStand
    setPendingStand(null)
    if (!st) return
    try {
      await saveStands(currentEventId, stands.filter(x => x.id !== st.id))
      await Promise.all(menu.filter(m => m.standId === st.id).map(m => updateMenuItem(m.id, { standId: '' })))
    } catch (e) { toast.error(friendlyError(e, "Le stand n'a pas été supprimé.")) }
  }

  // ── CRUD Catégories — directement Firebase ────────────────────────
  const startNewCat = (rayonId = '') => {
    setCatForm({ nom:'', couleur:COLORS[0], icon:'utensils', ordre: categories.length + 1, rayonId: rayonId || rayons[0]?.id || '' })
    setCatTried(false)
    setEditingCat('new')
  }

  const startEditCat = (cat) => {
    setCatForm({ nom:cat.nom, couleur:cat.couleur, icon:cat.icon, ordre:cat.ordre||99, rayonId: rayonIds.has(cat.rayonId) ? cat.rayonId : '' })
    setCatTried(false)
    setEditingCat(cat.id)
  }

  const saveCat = async () => {
    if (!catForm.nom.trim()) { setCatTried(true); focusFirstInvalid(catFormRef.current); return }
    setSavingCat(true)
    try {
      if (editingCat === 'new') {
        const catColWrite = currentEventId ? collection(db, 'events', currentEventId, 'categories') : collection(db, 'categories')
        await addDoc(catColWrite, { ...catForm, createdAt: serverTimestamp() })
      } else {
        const catDocRef = currentEventId ? doc(db, 'events', currentEventId, 'categories', editingCat) : doc(db, 'categories', editingCat)
        await updateDoc(catDocRef, catForm)
      }
      setEditingCat(null)
    } catch (e) {
      toast.error(friendlyError(e, "La catégorie n'a pas été enregistrée."), { action: { label: 'Réessayer', onClick: () => saveCat() } })
    }
    finally { setSavingCat(false) }
  }

  // Une seule confirmation, qui indique le nombre d'articles concernés
  const handleDeleteCat = (cat) => setPendingCat(cat)

  const confirmDeleteCat = async () => {
    const cat = pendingCat
    setPendingCat(null)
    if (!cat) return
    await deleteDoc(currentEventId ? doc(db, 'events', currentEventId, 'categories', cat.id) : doc(db, 'categories', cat.id))
  }

  // ── CRUD Articles ─────────────────────────────────────────────────
  const startNewItem = () => {
    setItemForm({
      nom:'', prix:0, stock:100, cat: categories[0]?.nom || '', typeConsommation:'',
      description: '', allergenes: [], allergenesCustom: [], standId: stands.length === 1 ? stands[0].id : '',
    })
    setItemTried(false)
    setEditingItem('new')
  }

  const startEditItem = (m) => {
    // Affiche en euros (avec 2 décimales possibles). Pas de Math.round qui perdrait les centimes.
    setItemForm({
      nom:m.nom, prix:((m.prix||0)/100), stock:m.stock||0, cat:m.cat,
      seuilAlerte:m.seuilAlerte??10, typeConsommation:m.typeConsommation||'',
      description: m.description || '',
      allergenes: Array.isArray(m.allergenes) ? m.allergenes : [],
      allergenesCustom: Array.isArray(m.allergenesCustom) ? m.allergenesCustom : [],
      standId: standById.has(m.standId) ? m.standId : '',
    })
    setItemTried(false)
    setEditingItem(m.id)
  }

  const saveItem = async () => {
    if (!itemForm.nom.trim()) { setItemTried(true); focusFirstInvalid(itemFormRef.current); return }
    setSavingItem(true)
    try {
      // Re-convertit en centimes : on multiplie par 100 et on arrondit pour éviter les flottants
      const prixCentimes = Math.round((parseFloat(itemForm.prix) || 0) * 100)
      const data = {
        nom: itemForm.nom.trim(),
        prix: prixCentimes,
        stock: itemForm.stock,
        cat: itemForm.cat,
        seuilAlerte: itemForm.seuilAlerte ?? 10,
        typeConsommation: itemForm.typeConsommation || '',
        description: (itemForm.description || '').trim(),
        allergenes: Array.isArray(itemForm.allergenes) ? itemForm.allergenes : [],
        allergenesCustom: Array.isArray(itemForm.allergenesCustom)
          ? itemForm.allergenesCustom.filter(v => v && v.trim()).map(v => v.trim())
          : [],
        standId: itemForm.standId || '',
      }
      if (editingItem === 'new') await addMenuItem(data)
      else await updateMenuItem(editingItem, data)
      setEditingItem(null)
    } catch (e) {
      toast.error(friendlyError(e, "L'article n'a pas été enregistré."), { action: { label: 'Réessayer', onClick: () => saveItem() } })
    }
    finally { setSavingItem(false) }
  }

  // Réassort : même règle que l'ancien prompt (entier > 0), l'erreur s'affiche sous le champ
  const restockQtyOk = (qty) => { const n = parseInt(qty); return !isNaN(n) && n > 0 }
  const openRestock = (m) => { setRestockTried(false); setRestock({ item: m, qty: '' }) }
  const confirmRestock = () => {
    const m = restock?.item
    if (!restockQtyOk(restock?.qty)) { setRestockTried(true); focusFirstInvalid(restockRef.current); return }
    const delta = parseInt(restock?.qty)
    setRestock(null)
    if (m) updateMenuItem(m.id, { stock: (m.stock||0) + delta })
  }

  const pendingCount = pendingCat ? menu.filter(m => m.cat === pendingCat.nom).length : 0
  const PreviewIcon = getIcon(catForm.icon)

  // Articles rattachés à aucune catégorie existante
  const catNames = new Set(categories.map(c => c.nom))
  const orphans = catsLoading ? [] : menu.filter(m => !catNames.has(m.cat))

  const sansStand = menu.filter(m => !standById.has(m.standId))

  // Ligne de catégorie ; rid = rayon (null : pas de rayons, ancien mode sans événement)
  const catRow = (cat, rid, i, n) => {
    const Icon  = getIcon(cat.icon)
    const count = menu.filter(m => m.cat === cat.nom).length
    const draggable = rid !== null
    return (
      <div key={cat.id}
        className={clsx(s.catRow, s.catLine, dragCat === cat.id && s.dragging)}
        style={{ '--c': cat.couleur }}
        draggable={draggable}
        onDragStart={draggable ? (e => { setDragCat(cat.id); e.dataTransfer.effectAllowed = 'move' }) : undefined}
        onDragEnd={() => setDragCat(null)}
        onDragOver={draggable ? (e => { if (dragCat) e.preventDefault() }) : undefined}
        onDrop={draggable ? (e => { e.preventDefault(); e.stopPropagation(); dropCat(rid, cat.id) }) : undefined}>
        {draggable && <span className={s.grip} aria-hidden="true"><GripVertical size={16}/></span>}
        <span className={s.catIcon}><Icon size={18}/></span>
        <div className={s.catInfo}>
          <div className={s.catName}>{cat.nom}</div>
          <div className={s.catMeta}>{plural(count, 'article')}</div>
        </div>
        <div className={s.rowActions}>
          {draggable && <>
            <Button variant="ghost" size="sm" icon={ChevronUp} iconOnly aria-label={`Monter ${cat.nom}`}
              disabled={i === 0} onClick={() => moveCat(cat, -1)}/>
            <Button variant="ghost" size="sm" icon={ChevronDown} iconOnly aria-label={`Descendre ${cat.nom}`}
              disabled={i === n - 1} onClick={() => moveCat(cat, 1)}/>
          </>}
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => startEditCat(cat)}>Modifier</Button>
          <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer ${cat.nom}`}
            onClick={() => handleDeleteCat(cat)}/>
        </div>
      </div>
    )
  }

  // Ligne d'article (catégories et articles sans catégorie)
  const itemRow = (m) => (
    <div key={m.id} className={s.item}>
      {/* Mini-vignette photo (ou placeholder) */}
      <div className={clsx(s.thumb, m.photoUrl && s.thumbPhoto)}>
        {m.photoUrl ? (
          <>
            <div className={s.thumbBlur} style={{ backgroundImage: `url(${m.photoUrl})` }}/>
            <img src={m.photoUrl} alt="" className={s.thumbImg}/>
          </>
        ) : (
          <span className={s.thumbEmpty}>—</span>
        )}
      </div>
      <div className={s.itemInfo}>
        <div className={s.itemName}>{m.nom}</div>
        <div className={s.itemMeta}>
          <span>{m.stock} en stock</span>
          {stockBadge(m)}
          {standById.has(m.standId)
            ? <Badge tone="neutral" icon={Store}>{standLabel(standById.get(m.standId))}</Badge>
            : <Badge tone="danger" icon={Store}>Sans stand</Badge>}
        </div>
      </div>
      <div className={s.itemSide}>
        <span className={s.price}>{fmt(m.prix||0)}</span>
        <Button variant="secondary" size="sm" icon={PackagePlus}
          onClick={() => openRestock(m)}>Stock</Button>
        <Button variant="ghost" size="sm" icon={Pencil} iconOnly aria-label={`Modifier ${m.nom}`}
          onClick={() => startEditItem(m)}/>
        <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer ${m.nom}`}
          onClick={() => deleteMenuItem(m.id)}/>
      </div>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={s.toolbar}>
        <Tabs
          label="Carte"
          value={section}
          onChange={setSection}
          items={[
            { value:'articles',   label:'Articles',   count: menu.length },
            { value:'categories', label:'Catégories', count: categories.length },
            { value:'stands',     label:'Stands',     count: stands.length },
          ]}
        />
        {section === 'categories' && editingCat === null && currentEventId && (
          <div className={s.toolbarActions}>
            <Button variant="secondary" icon={Layers} onClick={startNewRayon}>Nouveau rayon</Button>
            <Button icon={Plus} onClick={() => startNewCat()}>Nouvelle catégorie</Button>
          </div>
        )}
        {section === 'categories' && editingCat === null && !currentEventId && (
          <Button icon={Plus} onClick={() => startNewCat()}>Nouvelle catégorie</Button>
        )}
        {section === 'stands' && currentEventId && (
          <Button icon={Plus} onClick={startNewStand}>Nouveau stand</Button>
        )}
        {section === 'articles' && editingItem === null && (
          <div className={s.toolbarActions}>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImporting(true)}>Importer</Button>
            <Button icon={Plus} onClick={startNewItem}>Ajouter un article</Button>
          </div>
        )}
      </div>

      {/* ── CATÉGORIES ── */}
      {section === 'categories' && (
        <div className={s.list}>
          {/* Formulaire catégorie */}
          {editingCat !== null && (
            <Card className={s.formCard} title={editingCat === 'new' ? 'Créer une catégorie' : 'Modifier la catégorie'}>
              <div ref={catFormRef} className={s.form}>
                <Field label={<span className={s.label}>Nom</span>}
                  error={catForm.nom.trim() ? null : 'Indique un nom pour cette catégorie'} valid={!!catForm.nom.trim()} showError={catTried}>
                  <input value={catForm.nom} onChange={e => setCatForm(f => ({...f,nom:e.target.value}))}
                    placeholder="ex : Boissons chaudes"/>
                </Field>

                {currentEventId && (
                  <label className={s.field}>
                    <span className={s.label}>Rayon</span>
                    <select className={s.input} value={catForm.rayonId}
                      onChange={e => setCatForm(f => ({...f, rayonId:e.target.value}))}>
                      {rayons.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                      <option value="">Sans rayon</option>
                    </select>
                  </label>
                )}

                <div className={s.field}>
                  <span className={s.label}>Couleur</span>
                  <div className={s.swatches}>
                    {COLORS.map(c => (
                      <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={catForm.couleur === c}
                        onClick={() => setCatForm(f => ({...f,couleur:c}))}
                        className={clsx(s.swatch, catForm.couleur === c && s.swatchOn)}
                        style={{ '--c': c }}/>
                    ))}
                    <input type="color" aria-label="Couleur personnalisée" className={s.colorInput}
                      value={catForm.couleur} onChange={e => setCatForm(f => ({...f,couleur:e.target.value}))}/>
                  </div>
                </div>

                <div className={s.field}>
                  <span className={s.label}>Icône</span>
                  <div className={s.icons} style={{ '--c': catForm.couleur }}>
                    {ICONS.map(({ id, label, Icon }) => (
                      <button key={id} type="button" aria-pressed={catForm.icon === id}
                        onClick={() => setCatForm(f => ({...f,icon:id}))}
                        className={clsx(s.iconBtn, catForm.icon === id && s.iconOn)}>
                        <Icon size={16}/>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aperçu : pastille (caisse) et tuile (borne, espace spectateur) */}
                <div className={s.preview}>
                  <span className={s.muted}>Aperçu</span>
                  <span className={s.pill} style={{ '--c': catForm.couleur }}>
                    <PreviewIcon size={14}/>
                    <span>{catForm.nom || 'Nom'}</span>
                  </span>
                  <span className={s.tile} style={{ '--c': catForm.couleur }}>
                    <span className={s.tileIcon}><PreviewIcon size={20}/></span>
                    <span className={s.tileName}>{catForm.nom || 'Nom'}</span>
                  </span>
                </div>

                <div className={s.formActions}>
                  <Button icon={Save} onClick={saveCat} loading={savingCat}>
                    {savingCat ? 'Sauvegarde…' : editingCat === 'new' ? 'Créer' : 'Enregistrer'}
                  </Button>
                  <Button variant="secondary" icon={X} onClick={() => setEditingCat(null)}>Annuler</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Liste catégories */}
          {catsLoading && <div className={s.loading}>Chargement des catégories…</div>}
          {!catsLoading && categories.length === 0 && rayons.length === 0 && editingCat === null && (
            <Empty icon={Tag} title="Aucune catégorie pour l'instant"
              action={<Button icon={Plus} onClick={() => startNewCat()}>Créer une catégorie</Button>}>
              Les catégories rangent les articles de ta carte, à la caisse comme côté spectateurs.
            </Empty>
          )}
          {!catsLoading && !currentEventId && categories.map(cat => catRow(cat, null, 0))}

          {!catsLoading && currentEventId && rayons.length === 0 && categories.length > 0 && (
            <div className={s.hint}>
              <Layers size={16}/>
              <span>Crée des rayons (Plats, Boissons…) pour ranger tes catégories : ils s'affichent en haut de la borne.</span>
            </div>
          )}

          {!catsLoading && currentEventId && [...rayons, null].map((r, ri) => {
            const rid = r ? r.id : ''
            const list = catsOf(rid)
            if (!r && list.length === 0) return null
            const RIcon = getIcon(r?.icon)
            return (
              <Card key={rid || 'sans'} className={s.rayon}>
                <div className={s.rayonHead}
                  onDragOver={e => { if (dragCat) e.preventDefault() }}
                  onDrop={e => { e.preventDefault(); dropCat(rid) }}>
                  <span className={s.rayonIcon}><RIcon size={18}/></span>
                  <div className={s.catInfo}>
                    <div className={s.rayonLabel}>{r ? 'Rayon' : 'À ranger'}</div>
                    <div className={s.rayonName}>{r ? r.nom : 'Sans rayon'}</div>
                  </div>
                  <span className={s.muted}>{plural(list.length, 'catégorie')}</span>
                  <div className={s.rowActions}>
                    {r && <>
                      <Button variant="ghost" size="sm" icon={ChevronUp} iconOnly aria-label={`Monter le rayon ${r.nom}`}
                        disabled={ri === 0} onClick={() => moveRayon(r, -1)}/>
                      <Button variant="ghost" size="sm" icon={ChevronDown} iconOnly aria-label={`Descendre le rayon ${r.nom}`}
                        disabled={ri === rayons.length - 1} onClick={() => moveRayon(r, 1)}/>
                      <Button variant="ghost" size="sm" icon={Pencil} iconOnly aria-label={`Modifier le rayon ${r.nom}`}
                        onClick={() => startEditRayon(r)}/>
                      <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer le rayon ${r.nom}`}
                        onClick={() => setPendingRayon(r)}/>
                    </>}
                  </div>
                </div>
                <div className={s.rayonCats}>
                  {list.length === 0 && <div className={s.none}>Aucune catégorie : fais-en glisser une ici ou crée-la.</div>}
                  {list.map((cat, i) => catRow(cat, rid, i, list.length))}
                </div>
                {r && (
                  <button type="button" className={s.addCat} onClick={() => startNewCat(r.id)}>
                    <Plus size={14}/> Catégorie
                  </button>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── STANDS ── */}
      {section === 'stands' && (
        <div className={s.list}>
          {!currentEventId && <div className={s.loading}>Choisis un événement pour gérer ses stands.</div>}
          {currentEventId && stands.length === 0 && (
            <Empty icon={Store} title="Aucun stand pour l'instant"
              action={<Button icon={Plus} onClick={startNewStand}>Créer un stand</Button>}>
              Chaque article indique le stand où le client le récupère. La borne imprime un ticket par stand,
              avec son numéro en grand. Les clients ne voient pas le stand.
            </Empty>
          )}
          {stands.map(st => {
            const count = menu.filter(m => m.standId === st.id).length
            return (
              <Card key={st.id}>
                <div className={s.catRow}>
                  <span className={s.standNum}>{st.numero}</span>
                  <div className={s.catInfo}>
                    <div className={s.catName}>
                      {st.nom}{' '}
                      {st.benevoles && <Badge tone="coral">Stand des bénévoles</Badge>}
                    </div>
                    <div className={s.catMeta}>
                      {st.benevoles ? 'Reçoit toutes les commandes de bénévoles' : plural(count, 'article')}
                    </div>
                  </div>
                  <div className={s.rowActions}>
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => startEditStand(st)}>Modifier</Button>
                    <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer le stand ${st.nom}`}
                      onClick={() => setPendingStand(st)}/>
                  </div>
                </div>
              </Card>
            )
          })}
          {currentEventId && sansStand.length > 0 && (
            <div className={s.warn}>
              <AlertTriangle size={16}/>
              <span>
                {sansStand.length === 1 ? '1 article n’a' : `${sansStand.length} articles n’ont`} pas de stand
                ({sansStand.slice(0, 4).map(m => m.nom).join(', ')}{sansStand.length > 4 ? '…' : ''}).
                Sans stand, un article ne pourra pas être commandé à la borne.
              </span>
            </div>
          )}
        </div>
      )}

      {questionArticle.question}
      {/* ── ARTICLES ── */}
      {section === 'articles' && (
        <div className={s.list}>
          {editingItem !== null && (
            <Card className={s.formCard} title={editingItem === 'new' ? 'Nouvel article' : "Modifier l'article"}>
              <div ref={itemFormRef} className={s.form}>
                <div className={s.itemTop}>
                {/* Colonne photo */}
                <div className={s.field}>
                  <span className={s.label}>Photo</span>
                  <MenuItemPhoto
                    item={editingItem === 'new' ? null : menu.find(m => m.id === editingItem)}
                    eventId={currentEventId}
                  />
                </div>
                {/* Colonne champs */}
                <div className={s.grid}>
                  <Field label={<span className={s.label}>Nom</span>}
                    error={itemForm.nom.trim() ? null : 'Indique un nom pour cet article'} valid={!!itemForm.nom.trim()} showError={itemTried}>
                    <input value={itemForm.nom} onChange={e => setItemForm(f=>({...f,nom:e.target.value}))} placeholder="ex : Bière artisanale"/>
                  </Field>
                  <label className={s.field}>
                    <span className={s.label}>Catégorie</span>
                    <select className={s.input} value={itemForm.cat} onChange={e => setItemForm(f=>({...f,cat:e.target.value}))}>
                      {categories.map(c => {
                        const r = rayons.find(x => x.id === c.rayonId)
                        return <option key={c.id} value={c.nom}>{r ? `${c.nom} · ${r.nom}` : c.nom}</option>
                      })}
                    </select>
                  </label>
                  {currentEventId && (
                    <label className={s.field}>
                      <span className={s.label}>Stand de retrait</span>
                      <select className={clsx(s.input, !itemForm.standId && s.inputWarn)} value={itemForm.standId || ''}
                        onChange={e => setItemForm(f => ({...f, standId:e.target.value}))}>
                        <option value="">Aucun stand</option>
                        {stands.map(st => <option key={st.id} value={st.id}>{standLabel(st)}</option>)}
                      </select>
                      <span className={s.fieldHint}>
                        {stands.length === 0
                          ? 'Crée d’abord tes stands dans l’onglet Stands.'
                          : 'Imprimé sur le ticket. Les clients ne le voient pas.'}
                      </span>
                    </label>
                  )}
                  <label className={s.field}>
                    <span className={s.label}>Prix (€)</span>
                    <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" className={s.input} value={itemForm.prix === 0 ? '' : itemForm.prix} onChange={e => setItemForm(f=>({...f,prix:parseFloat(e.target.value)||0}))}/>
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Stock</span>
                    <input type="number" className={s.input} value={itemForm.stock} onChange={e => setItemForm(f=>({...f,stock:parseInt(e.target.value)||0}))}/>
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Seuil alerte stock</span>
                    <input type="number" className={s.input} value={itemForm.seuilAlerte??10} onChange={e => setItemForm(f=>({...f,seuilAlerte:parseInt(e.target.value)||0}))}/>
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Consommation bénévole</span>
                    <select className={s.input} value={itemForm.typeConsommation||''} onChange={e => setItemForm(f=>({...f,typeConsommation:e.target.value}))}>
                      <option value=''>Aucune (non éligible bénévoles)</option>
                      <option value='repas'>Repas</option>
                      <option value='boisson'>Boisson</option>
                      <option value='eau'>Eau</option>
                    </select>
                  </label>
                </div>
                </div>

                {/* Description / composition */}
                <label className={s.field}>
                  <span className={s.label}>Composition (visible par les clients)</span>
                  <textarea
                    className={clsx(s.input, s.textarea)}
                    value={itemForm.description || ''}
                    onChange={e => setItemForm(f => ({...f, description: e.target.value}))}
                    placeholder="ex : Riz sénégalais, poulet mariné aux oignons, citron et moutarde."
                    rows={2}
                  />
                </label>

                {/* Allergènes UE — cases à cocher en grille */}
                <div className={s.field}>
                  <span className={s.label}>Allergènes (norme UE INCO)</span>
                  <div className={s.allergenes}>
                    {ALLERGENES_UE.map(a => {
                      const isChecked = (itemForm.allergenes || []).includes(a.code)
                      return (
                        <label key={a.code} className={clsx(s.allergene, isChecked && s.allergeneOn)}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const current = itemForm.allergenes || []
                              const next = e.target.checked
                                ? [...current, a.code]
                                : current.filter(c => c !== a.code)
                              setItemForm(f => ({...f, allergenes: next}))
                            }}
                          />
                          <span aria-hidden="true">{a.emoji}</span>
                          <span>{a.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Allergènes custom — liste éditable */}
                <label className={s.field}>
                  <span className={s.label}>Autres allergènes spécifiques (un par ligne)</span>
                  <textarea
                    className={clsx(s.input, s.textarea)}
                    value={(itemForm.allergenesCustom || []).join('\n')}
                    onChange={e => setItemForm(f => ({
                      ...f,
                      allergenesCustom: e.target.value.split('\n'),
                    }))}
                    placeholder="ex : Piment fort&#10;Huile d'arachide raffinée"
                    rows={2}
                  />
                </label>

                <div className={s.formActions}>
                  <Button icon={Save} onClick={saveItem} loading={savingItem}>
                    {savingItem ? 'Sauvegarde…' : editingItem === 'new' ? 'Ajouter' : 'Enregistrer'}
                  </Button>
                  <Button variant="secondary" icon={X} onClick={() => questionArticle.demander(() => setEditingItem(null))}>Annuler</Button>
                </div>
              </div>
            </Card>
          )}

          {menu.length === 0 && editingItem === null && (
            <Empty icon={Tag} title="La carte est vide"
              action={<Button icon={Plus} onClick={startNewItem}>Ajouter un article</Button>}>
              Les articles ajoutés ici apparaissent à la caisse et côté spectateurs.
            </Empty>
          )}

          {categories.map(cat => {
            const catItems = menu.filter(m => m.cat === cat.nom)
            if (catItems.length === 0 && editingItem === null) return null
            const CatIcon = getIcon(cat.icon)
            return (
              <Card key={cat.id}>
                <div className={s.groupHead} style={{ '--c': cat.couleur }}>
                  <span className={clsx(s.catIcon, s.catIconSm)}><CatIcon size={14}/></span>
                  <span className={s.groupName}>{cat.nom}</span>
                  <span className={s.muted}>{plural(catItems.length, 'article')}</span>
                </div>
                {catItems.length === 0
                  ? <div className={s.none}>Aucun article</div>
                  : (
                    <div className={s.items}>
                      {catItems.map(itemRow)}
                    </div>
                  )
                }
              </Card>
            )
          })}

          {/* Articles dont la catégorie n'existe plus : visibles pour pouvoir les réaffecter */}
          {orphans.length > 0 && (
            <Card>
              <div className={s.groupHead} style={{ '--c': 'var(--muted)' }}>
                <span className={s.groupName}>Sans catégorie</span>
                <span className={s.muted}>{plural(orphans.length, 'article')} · à réaffecter</span>
              </div>
              <div className={s.items}>{orphans.map(itemRow)}</div>
            </Card>
          )}
        </div>
      )}

      {/* Confirmation suppression catégorie */}
      <Dialog
        open={!!pendingCat}
        onClose={() => setPendingCat(null)}
        title="Supprimer la catégorie"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingCat(null)}>Annuler</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmDeleteCat}>Supprimer</Button>
        </>}
      >
        <div className={s.dialogStack}>
          <p className={s.dialogText}>Supprimer la catégorie « {pendingCat?.nom} » ?</p>
          {pendingCount > 0 && (
            <p className={s.dialogText}>
              <Badge tone="warning">Attention</Badge>{' '}
              Elle contient encore {plural(pendingCount, 'article')}. Supprimer quand même ?
            </p>
          )}
        </div>
      </Dialog>

      {/* Réassort d'un article */}
      <Dialog saisie
        open={!!restock}
        onClose={() => setRestock(null)}
        title="Réapprovisionner"
        footer={<>
          <Button variant="secondary" onClick={() => setRestock(null)}>Annuler</Button>
          <Button icon={PackagePlus} onClick={confirmRestock}>Ajouter au stock</Button>
        </>}
      >
        <form ref={restockRef} className={s.dialogStack} onSubmit={e => { e.preventDefault(); confirmRestock() }}>
          <p className={s.dialogText}>
            <b>{restock?.item.nom}</b> · stock actuel : {restock?.item.stock || 0}
          </p>
          <Field label={<span className={s.label}>Quantité à ajouter</span>}
            error={restockQtyOk(restock?.qty) ? null : 'Indique une quantité supérieure à 0'} valid={restockQtyOk(restock?.qty)} showError={restockTried}>
            <input type="number" min="1" inputMode="numeric" autoFocus
              value={restock?.qty ?? ''} onChange={e => setRestock(r => ({ ...r, qty: e.target.value }))}/>
          </Field>
        </form>
      </Dialog>

      {/* Rayon : créer / modifier */}
      <Dialog saisie
        open={!!rayonForm}
        onClose={() => setRayonForm(null)}
        title={rayonForm?.id === 'new' ? 'Nouveau rayon' : 'Modifier le rayon'}
        footer={<>
          <Button variant="secondary" onClick={() => setRayonForm(null)}>Annuler</Button>
          <Button icon={Save} onClick={saveRayon}>{rayonForm?.id === 'new' ? 'Créer' : 'Enregistrer'}</Button>
        </>}
      >
        <form ref={rayonFormRef} className={s.dialogStack} onSubmit={e => { e.preventDefault(); saveRayon() }}>
          <p className={s.dialogText}>Les rayons s'affichent en haut de la borne et de l'espace spectateur (ex : Plats, Boissons).</p>
          <Field label={<span className={s.label}>Nom</span>}
            error={rayonForm?.nom.trim() ? null : 'Indique un nom pour ce rayon'} valid={!!rayonForm?.nom.trim()} showError={rayonTried}>
            <input autoFocus value={rayonForm?.nom ?? ''} placeholder="ex : Boissons"
              onChange={e => setRayonForm(f => ({ ...f, nom: e.target.value }))}/>
          </Field>
          <div className={s.field}>
            <span className={s.label}>Icône</span>
            <div className={s.icons} style={{ '--c': 'var(--brand)' }}>
              {ICONS.map(({ id, label, Icon }) => (
                <button key={id} type="button" aria-pressed={rayonForm?.icon === id}
                  onClick={() => setRayonForm(f => ({ ...f, icon: id }))}
                  className={clsx(s.iconBtn, rayonForm?.icon === id && s.iconOn)}>
                  <Icon size={16}/>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </Dialog>

      {/* Stand : créer / modifier */}
      <Dialog saisie
        open={!!standForm}
        onClose={() => setStandForm(null)}
        title={standForm?.id === 'new' ? 'Nouveau stand' : 'Modifier le stand'}
        footer={<>
          <Button variant="secondary" onClick={() => setStandForm(null)}>Annuler</Button>
          <Button icon={Save} onClick={saveStand}>{standForm?.id === 'new' ? 'Créer' : 'Enregistrer'}</Button>
        </>}
      >
        <form ref={standFormRef} className={s.dialogStack} onSubmit={e => { e.preventDefault(); saveStand() }}>
          <p className={s.dialogText}>Le numéro est imprimé en grand sur les tickets de ce stand.</p>
          <Field label={<span className={s.label}>Numéro</span>}
            error={standNumeroErr(standForm)} valid={!standNumeroErr(standForm)} showError={standTried}>
            <input type="number" min="1" inputMode="numeric" value={standForm?.numero ?? ''}
              onChange={e => setStandForm(f => ({ ...f, numero: e.target.value }))}/>
          </Field>
          <Field label={<span className={s.label}>Nom</span>}
            error={standForm?.nom.trim() ? null : 'Indique un nom pour ce stand'} valid={!!standForm?.nom.trim()} showError={standTried}>
            <input autoFocus value={standForm?.nom ?? ''} placeholder="ex : Cuisine"
              onChange={e => setStandForm(f => ({ ...f, nom: e.target.value }))}/>
          </Field>
          <label className={s.checkRow}>
            <input type="checkbox" checked={standForm?.benevoles === true}
              onChange={e => setStandForm(f => ({ ...f, benevoles: e.target.checked }))}/>
            <span>
              <b>Stand des bénévoles</b>
              <small>Toute commande de bénévole sort en un seul ticket pour ce stand. Un seul stand peut l'être.</small>
            </span>
          </label>
        </form>
      </Dialog>

      {/* Suppression d'un rayon : ses catégories restent, sans rayon */}
      <Dialog
        open={!!pendingRayon}
        onClose={() => setPendingRayon(null)}
        title="Supprimer le rayon"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingRayon(null)}>Annuler</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmDeleteRayon}>Supprimer</Button>
        </>}
      >
        <p className={s.dialogText}>
          Supprimer le rayon « {pendingRayon?.nom} » ?
          {pendingRayon && catsOf(pendingRayon.id).length > 0 &&
            ` Ses ${plural(catsOf(pendingRayon.id).length, 'catégorie')} sont gardées et passent dans « Sans rayon ».`}
        </p>
      </Dialog>

      {/* Suppression d'un stand : ses articles restent, sans stand */}
      <Dialog
        open={!!pendingStand}
        onClose={() => setPendingStand(null)}
        title="Supprimer le stand"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingStand(null)}>Annuler</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmDeleteStand}>Supprimer</Button>
        </>}
      >
        <p className={s.dialogText}>
          Supprimer le stand « {pendingStand && standLabel(pendingStand)} » ?
          {pendingStand && menu.some(m => m.standId === pendingStand.id) &&
            ` Ses ${plural(menu.filter(m => m.standId === pendingStand.id).length, 'article')} n'auront plus de stand.`}
        </p>
      </Dialog>

      <MenuImportDialog open={importing} onClose={() => setImporting(false)}
        menu={menu} categories={categories} eventId={currentEventId}/>
    </div>
  )
}
