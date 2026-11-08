/**
 * pages/admin/Menu.jsx — v3
 * Catégories et articles gérés directement via Firebase (même pattern que Benevoles.jsx)
 * Catégories : collection(db, 'categories') — racine, simple, fiable
 * Articles    : via useAppStore (déjà fonctionnel)
 */
import React, { useState, useEffect, useRef } from 'react'
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
import { Plus, Trash2, Pencil, X, Save, PackagePlus } from 'lucide-react'
import { Button, Card, Badge, Tabs, Empty, Dialog, Field, focusFirstInvalid, toast } from '../../ui'
import s from './menu/menu.module.css'

// ── Icônes ──────────────────────────────────────────────────────────
import {
  Coffee, UtensilsCrossed, ShoppingBag, Music, Star,
  Beer, Pizza, IceCream, Wine, Sandwich, Cookie,
  Package, Gift, Shirt, Tag,
} from 'lucide-react'

const ICONS = [
  { id:'utensils',  label:'Couverts',  Icon:UtensilsCrossed },
  { id:'coffee',    label:'Café',      Icon:Coffee },
  { id:'beer',      label:'Bière',     Icon:Beer },
  { id:'wine',      label:'Vin',       Icon:Wine },
  { id:'pizza',     label:'Pizza',     Icon:Pizza },
  { id:'sandwich',  label:'Sandwich',  Icon:Sandwich },
  { id:'icecream',  label:'Glace',     Icon:IceCream },
  { id:'cookie',    label:'Dessert',   Icon:Cookie },
  { id:'music',     label:'Musique',   Icon:Music },
  { id:'shirt',     label:'Vêtement',  Icon:Shirt },
  { id:'gift',      label:'Cadeau',    Icon:Gift },
  { id:'bag',       label:'Sac',       Icon:ShoppingBag },
  { id:'package',   label:'Colis',     Icon:Package },
  { id:'tag',       label:'Étiquette', Icon:Tag },
  { id:'star',      label:'Spécial',   Icon:Star },
]

// Couleurs de catégorie : ce sont des données (enregistrées en base)
const COLORS = [
  '#009090','#F07848','#BA7517','#0F6E56','#A32D2D',
  '#2563EB','#7C3AED','#D97706','#059669','#DC2626',
  '#0891B2','#7C2D12','#166534','#1e40af','#6b21a8',
]

const getIcon = (iconId) => ICONS.find(i => i.id === iconId)?.Icon || Tag
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
  const [catForm,    setCatForm]    = useState({ nom:'', couleur:COLORS[0], icon:'utensils', ordre:99 })
  const [savingCat,  setSavingCat]  = useState(false)
  const [catTried,   setCatTried]   = useState(false)
  const catFormRef = useRef(null)

  // ── Articles ─────────────────────────────────────────────────────
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm,    setItemForm]    = useState({ nom:'', prix:0, stock:100, cat:'', typeConsommation:'' })
  const [savingItem,  setSavingItem]  = useState(false)
  const [itemTried,   setItemTried]   = useState(false)
  const itemFormRef = useRef(null)

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

  // ── CRUD Catégories — directement Firebase ────────────────────────
  const startNewCat = () => {
    setCatForm({ nom:'', couleur:COLORS[0], icon:'utensils', ordre: categories.length + 1 })
    setCatTried(false)
    setEditingCat('new')
  }

  const startEditCat = (cat) => {
    setCatForm({ nom:cat.nom, couleur:cat.couleur, icon:cat.icon, ordre:cat.ordre||99 })
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
    setItemForm({ nom:'', prix:0, stock:100, cat: categories[0]?.nom || '', typeConsommation:'' })
    setItemTried(false)
    setEditingItem('new')
  }

  const startEditItem = (m) => {
    setItemForm({ nom:m.nom, prix:(m.prix||0)/100, stock:m.stock||0, cat:m.cat, seuilAlerte:m.seuilAlerte??10, typeConsommation:m.typeConsommation||'' })
    setItemTried(false)
    setEditingItem(m.id)
  }

  const saveItem = async () => {
    if (!itemForm.nom.trim()) { setItemTried(true); focusFirstInvalid(itemFormRef.current); return }
    setSavingItem(true)
    try {
      const data = { nom:itemForm.nom.trim(), prix:Math.round(itemForm.prix*100), stock:itemForm.stock, cat:itemForm.cat, seuilAlerte:itemForm.seuilAlerte??10, typeConsommation:itemForm.typeConsommation||'' }
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

  // Ligne d'article (catégories et articles sans catégorie)
  const itemRow = (m) => (
    <div key={m.id} className={s.item}>
      <div className={s.itemInfo}>
        <div className={s.itemName}>{m.nom}</div>
        <div className={s.itemMeta}>
          <span>{m.stock} en stock</span>
          {stockBadge(m)}
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
          ]}
        />
        {section === 'categories' && editingCat === null && (
          <Button icon={Plus} onClick={startNewCat}>Nouvelle catégorie</Button>
        )}
        {section === 'articles' && editingItem === null && (
          <Button icon={Plus} onClick={startNewItem}>Ajouter un article</Button>
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

                <label className={s.field}>
                  <span className={s.label}>Ordre d'affichage</span>
                  <input type="number" className={clsx(s.input, s.inputShort)} value={catForm.ordre}
                    onChange={e => setCatForm(f => ({...f,ordre:parseInt(e.target.value)||1}))}/>
                </label>

                {/* Aperçu */}
                <div className={s.preview}>
                  <span className={s.muted}>Aperçu</span>
                  <span className={s.pill} style={{ '--c': catForm.couleur }}>
                    <PreviewIcon size={14}/>
                    <span>{catForm.nom || 'Nom'}</span>
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
          {!catsLoading && categories.length === 0 && editingCat === null && (
            <Empty icon={Tag} title="Aucune catégorie pour l'instant"
              action={<Button icon={Plus} onClick={startNewCat}>Créer une catégorie</Button>}>
              Les catégories rangent les articles de ta carte, à la caisse comme côté spectateurs.
            </Empty>
          )}
          {categories.map(cat => {
            const Icon  = getIcon(cat.icon)
            const count = menu.filter(m => m.cat === cat.nom).length
            return (
              <Card key={cat.id}>
                <div className={s.catRow} style={{ '--c': cat.couleur }}>
                  <span className={s.catIcon}><Icon size={18}/></span>
                  <div className={s.catInfo}>
                    <div className={s.catName}>{cat.nom}</div>
                    <div className={s.catMeta}>{plural(count, 'article')} · ordre {cat.ordre||'—'}</div>
                  </div>
                  <span className={s.hex}>{cat.couleur}</span>
                  <div className={s.rowActions}>
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => startEditCat(cat)}>Modifier</Button>
                    <Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label={`Supprimer ${cat.nom}`}
                      onClick={() => handleDeleteCat(cat)}/>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── ARTICLES ── */}
      {section === 'articles' && (
        <div className={s.list}>
          {editingItem !== null && (
            <Card className={s.formCard} title={editingItem === 'new' ? 'Nouvel article' : "Modifier l'article"}>
              <div ref={itemFormRef} className={s.form}>
                <div className={s.grid}>
                  <Field label={<span className={s.label}>Nom</span>}
                    error={itemForm.nom.trim() ? null : 'Indique un nom pour cet article'} valid={!!itemForm.nom.trim()} showError={itemTried}>
                    <input value={itemForm.nom} onChange={e => setItemForm(f=>({...f,nom:e.target.value}))} placeholder="ex : Bière artisanale"/>
                  </Field>
                  <label className={s.field}>
                    <span className={s.label}>Catégorie</span>
                    <select className={s.input} value={itemForm.cat} onChange={e => setItemForm(f=>({...f,cat:e.target.value}))}>
                      {categories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                    </select>
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Prix (€)</span>
                    <input type="number" step="0.01" min="0" inputMode="decimal" className={s.input} value={itemForm.prix} onChange={e => setItemForm(f=>({...f,prix:parseFloat(e.target.value)||0}))}/>
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
                <div className={s.formActions}>
                  <Button icon={Save} onClick={saveItem} loading={savingItem}>
                    {savingItem ? 'Sauvegarde…' : editingItem === 'new' ? 'Ajouter' : 'Enregistrer'}
                  </Button>
                  <Button variant="secondary" icon={X} onClick={() => setEditingItem(null)}>Annuler</Button>
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
      <Dialog
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
    </div>
  )
}
