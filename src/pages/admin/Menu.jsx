/**
 * pages/admin/Menu.jsx — v3
 * Catégories et articles gérés directement via Firebase (même pattern que Benevoles.jsx)
 * Catégories : collection(db, 'categories') — racine, simple, fiable
 * Articles    : via useAppStore (déjà fonctionnel)
 */
import React, { useState, useEffect } from 'react'
import { db } from '../../firebase/config'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { fmt } from '../../utils/helpers'
import { Plus, Trash2, Pencil, X, Save } from 'lucide-react'
import MenuItemPhoto from '../../components/MenuItemPhoto'
import { ALLERGENES_UE } from '../../utils/allergenes'

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

const COLORS = [
  '#009090','#F07848','#BA7517','#0F6E56','#A32D2D',
  '#2563EB','#7C3AED','#D97706','#059669','#DC2626',
  '#0891B2','#7C2D12','#166534','#1e40af','#6b21a8',
]

const getIcon = (iconId) => ICONS.find(i => i.id === iconId)?.Icon || Tag

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

  // ── Articles ─────────────────────────────────────────────────────
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm,    setItemForm]    = useState({ nom:'', prix:0, stock:100, cat:'', typeConsommation:'' })
  const [savingItem,  setSavingItem]  = useState(false)

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
    setEditingCat('new')
  }

  const startEditCat = (cat) => {
    setCatForm({ nom:cat.nom, couleur:cat.couleur, icon:cat.icon, ordre:cat.ordre||99 })
    setEditingCat(cat.id)
  }

  const saveCat = async () => {
    if (!catForm.nom.trim()) return
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
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setSavingCat(false) }
  }

  const handleDeleteCat = async (cat) => {
    const count = menu.filter(m => m.cat === cat.nom).length
    if (count > 0 && !window.confirm(`"${cat.nom}" contient ${count} article(s). Supprimer quand même ?`)) return
    if (!window.confirm(`Supprimer la catégorie "${cat.nom}" ?`)) return
    await deleteDoc(currentEventId ? doc(db, 'events', currentEventId, 'categories', cat.id) : doc(db, 'categories', cat.id))
  }

  // ── CRUD Articles ─────────────────────────────────────────────────
  const startNewItem = () => {
    setItemForm({
      nom:'', prix:0, stock:100, cat: categories[0]?.nom || '', typeConsommation:'',
      description: '', allergenes: [], allergenesCustom: [],
    })
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
    })
    setEditingItem(m.id)
  }

  const saveItem = async () => {
    if (!itemForm.nom.trim()) return
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
          ? itemForm.allergenesCustom.filter(s => s && s.trim()).map(s => s.trim())
          : [],
      }
      if (editingItem === 'new') await addMenuItem(data)
      else await updateMenuItem(editingItem, data)
      setEditingItem(null)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setSavingItem(false) }
  }

  // ── Styles ────────────────────────────────────────────────────────
  const inp = { width:'100%', padding:'8px 10px', border:'0.5px solid var(--border2)', borderRadius:8, fontSize:13, background:'var(--bg2)', color:'var(--text)', fontFamily:'var(--font)' }
  const card = { background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px 16px', marginBottom:12 }
  const tabBtn = (s) => ({ padding:'7px 16px', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'var(--font)', fontSize:12, fontWeight:section===s?600:400, background:section===s?'var(--brand)':'var(--bg2)', color:section===s?'#fff':'var(--muted)' })

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <button onClick={() => setSection('articles')}   style={tabBtn('articles')}>Articles</button>
        <button onClick={() => setSection('categories')} style={tabBtn('categories')}>Catégories</button>
      </div>

      {/* ── CATÉGORIES ── */}
      {section === 'categories' && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            {editingCat === null && (
              <button onClick={startNewCat} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                <Plus size={14}/> Nouvelle catégorie
              </button>
            )}
          </div>

          {/* Formulaire catégorie */}
          {editingCat !== null && (
            <div style={{ ...card, border:'1px solid var(--brand)', marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:14 }}>
                {editingCat === 'new' ? 'Créer une catégorie' : 'Modifier la catégorie'}
              </div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Nom</label>
                <input value={catForm.nom} onChange={e => setCatForm(f => ({...f,nom:e.target.value}))}
                  placeholder="ex: Boissons chaudes" style={inp}/>
              </div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Couleur</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setCatForm(f => ({...f,couleur:c}))}
                      style={{ width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer', border:catForm.couleur===c?'3px solid var(--text)':'2px solid transparent', flexShrink:0 }}/>
                  ))}
                  <input type="color" value={catForm.couleur} onChange={e => setCatForm(f => ({...f,couleur:e.target.value}))}
                    style={{ width:26, height:26, borderRadius:'50%', border:'none', cursor:'pointer', padding:0 }}/>
                </div>
              </div>

              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Icône</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(70px,1fr))', gap:6 }}>
                  {ICONS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setCatForm(f => ({...f,icon:id}))}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', borderRadius:8, border:`1px solid ${catForm.icon===id?catForm.couleur:'var(--border)'}`, background:catForm.icon===id?catForm.couleur+'22':'var(--bg2)', cursor:'pointer', fontFamily:'var(--font)' }}>
                      <Icon size={16} style={{ color:catForm.icon===id?catForm.couleur:'var(--muted)' }}/>
                      <span style={{ fontSize:10, color:catForm.icon===id?catForm.couleur:'var(--muted)', fontWeight:catForm.icon===id?600:400 }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Ordre d'affichage</label>
                <input type="number" value={catForm.ordre} onChange={e => setCatForm(f => ({...f,ordre:parseInt(e.target.value)||1}))}
                  style={{ ...inp, width:80 }}/>
              </div>

              {/* Aperçu */}
              <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>Aperçu :</span>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:20, background:catForm.couleur+'22', border:`1px solid ${catForm.couleur}` }}>
                  {(() => { const I=getIcon(catForm.icon); return <I size={14} style={{ color:catForm.couleur }}/>; })()}
                  <span style={{ fontSize:12, fontWeight:600, color:catForm.couleur }}>{catForm.nom||'Nom'}</span>
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={saveCat} disabled={savingCat}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                  <Save size={13}/> {savingCat ? 'Sauvegarde…' : editingCat==='new' ? 'Créer' : 'Enregistrer'}
                </button>
                <button onClick={() => setEditingCat(null)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--bg)', color:'var(--text)', fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                  <X size={13}/> Annuler
                </button>
              </div>
            </div>
          )}

          {/* Liste catégories */}
          {catsLoading && (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
              Chargement des catégories…
            </div>
          )}
          {!catsLoading && categories.length === 0 && editingCat === null && (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:13, background:'var(--bg2)', borderRadius:10 }}>
              Aucune catégorie. Cliquez sur "+ Nouvelle catégorie".
              <div style={{ marginTop:10 }}>
                <button onClick={() => setCatsRetry(r => r+1)}
                  style={{ fontSize:12, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', minHeight:'auto' }}>
                  Réessayer
                </button>
              </div>
            </div>
          )}
          {categories.map(cat => {
            const Icon  = getIcon(cat.icon)
            const count = menu.filter(m => m.cat === cat.nom).length
            return (
              <div key={cat.id} style={card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:cat.couleur+'22', border:`1px solid ${cat.couleur}44`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon size={18} style={{ color:cat.couleur }}/>
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{cat.nom}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{count} article{count>1?'s':''} · ordre {cat.ordre||'—'}</div>
                    </div>
                    <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:cat.couleur+'22', color:cat.couleur, fontWeight:600, fontFamily:'monospace' }}>{cat.couleur}</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => startEditCat(cat)}
                      style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', border:'0.5px solid var(--border2)', borderRadius:6, background:'var(--bg2)', color:'var(--text)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
                      <Pencil size={11}/> Modifier
                    </button>
                    <button onClick={() => handleDeleteCat(cat)}
                      style={{ display:'flex', alignItems:'center', padding:'5px 8px', border:'0.5px solid #F09595', borderRadius:6, background:'var(--red-light)', color:'var(--red)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
                      <Trash2 size={11}/>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ── ARTICLES ── */}
      {section === 'articles' && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            {editingItem === null && (
              <button onClick={startNewItem} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                <Plus size={14}/> Ajouter un article
              </button>
            )}
          </div>

          {editingItem !== null && (
            <div style={{ ...card, border:'1px solid var(--brand)', marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:14 }}>
                {editingItem==='new' ? 'Nouvel article' : "Modifier l'article"}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(180px, 220px) 1fr', gap:16, marginBottom:10 }}>
                {/* Colonne photo */}
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Photo</label>
                  <MenuItemPhoto
                    item={editingItem === 'new' ? null : menu.find(m => m.id === editingItem)}
                    eventId={currentEventId}
                  />
                </div>
                {/* Colonne champs */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Nom</label>
                  <input value={itemForm.nom} onChange={e => setItemForm(f=>({...f,nom:e.target.value}))} placeholder="ex: Bière artisanale" style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Catégorie</label>
                  <select value={itemForm.cat} onChange={e => setItemForm(f=>({...f,cat:e.target.value}))} style={inp}>
                    {categories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Prix (€)</label>
                  <input type="number" step="0.5" value={itemForm.prix === 0 ? '' : itemForm.prix} placeholder="0.00" onChange={e => setItemForm(f=>({...f,prix:parseFloat(e.target.value)||0}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Stock</label>
                  <input type="number" value={itemForm.stock} onChange={e => setItemForm(f=>({...f,stock:parseInt(e.target.value)||0}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Seuil alerte stock</label>
                  <input type="number" value={itemForm.seuilAlerte??10} onChange={e => setItemForm(f=>({...f,seuilAlerte:parseInt(e.target.value)||0}))} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Type consommation bénévole</label>
                  <select value={itemForm.typeConsommation||''} onChange={e => setItemForm(f=>({...f,typeConsommation:e.target.value}))} style={inp}>
                    <option value=''>— Aucun (non éligible bénévoles) —</option>
                    <option value='repas'>🍽️ Repas</option>
                    <option value='boisson'>☕ Boisson</option>
                    <option value='eau'>💧 Eau</option>
                  </select>
                </div>
                </div>
              </div>

              {/* Description / composition */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>
                  Composition (visible par les clients)
                </label>
                <textarea
                  value={itemForm.description || ''}
                  onChange={e => setItemForm(f => ({...f, description: e.target.value}))}
                  placeholder="ex: Riz sénégalais, poulet mariné aux oignons, citron et moutarde."
                  rows={2}
                  style={{ ...inp, resize:'vertical', minHeight:54, fontFamily:'inherit' }}
                />
              </div>

              {/* Allergènes UE — cases à cocher en grille */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>
                  Allergènes (norme UE INCO)
                </label>
                <div style={{
                  display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',
                  gap:4, padding:8, background:'var(--bg)', border:'0.5px solid var(--border)',
                  borderRadius:8,
                }}>
                  {ALLERGENES_UE.map(a => {
                    const isChecked = (itemForm.allergenes || []).includes(a.code)
                    return (
                      <label key={a.code} style={{
                        display:'flex', alignItems:'center', gap:6, padding:'4px 6px',
                        fontSize:12, cursor:'pointer', borderRadius:4,
                        background: isChecked ? 'var(--amber-light, #FAEEDA)' : 'transparent',
                        color: isChecked ? 'var(--amber-dark, #854F0B)' : 'var(--text)',
                      }}>
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
                          style={{ flexShrink: 0 }}
                        />
                        <span style={{ flexShrink: 0 }}>{a.emoji}</span>
                        <span>{a.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Allergènes custom — liste éditable */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>
                  Autres allergènes spécifiques (un par ligne)
                </label>
                <textarea
                  value={(itemForm.allergenesCustom || []).join('\n')}
                  onChange={e => setItemForm(f => ({
                    ...f,
                    allergenesCustom: e.target.value.split('\n'),
                  }))}
                  placeholder="ex: Piment fort&#10;Huile d'arachide raffinée"
                  rows={2}
                  style={{ ...inp, resize:'vertical', minHeight:54, fontFamily:'inherit' }}
                />
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={saveItem} disabled={savingItem}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                  <Save size={13}/> {savingItem ? 'Sauvegarde…' : editingItem==='new' ? 'Ajouter' : 'Enregistrer'}
                </button>
                <button onClick={() => setEditingItem(null)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:'0.5px solid var(--border2)', borderRadius:8, background:'var(--bg)', color:'var(--text)', fontSize:13, cursor:'pointer', fontFamily:'var(--font)' }}>
                  <X size={13}/> Annuler
                </button>
              </div>
            </div>
          )}

          {categories.map(cat => {
            const catItems = menu.filter(m => m.cat === cat.nom)
            if (catItems.length === 0 && editingItem === null) return null
            const CatIcon = getIcon(cat.icon)
            return (
              <div key={cat.id} style={card}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:cat.couleur+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <CatIcon size={14} style={{ color:cat.couleur }}/>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:cat.couleur }}>{cat.nom}</span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{catItems.length} article{catItems.length>1?'s':''}</span>
                </div>
                {catItems.length === 0
                  ? <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>Aucun article</div>
                  : catItems.map(m => (
                    <div key={m.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderTop:'0.5px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth: 0 }}>
                        {/* Mini-vignette photo (ou placeholder) */}
                        <div style={{
                          position: 'relative',
                          width: 40, height: 40, borderRadius: 6,
                          background: m.photoUrl ? '#1a1a1a' : 'var(--bg2)',
                          border: '0.5px solid var(--border)',
                          flexShrink: 0, overflow: 'hidden',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {m.photoUrl ? (
                            <>
                              <div style={{
                                position: 'absolute', inset: 0,
                                backgroundImage: `url(${m.photoUrl})`,
                                backgroundSize: 'cover', backgroundPosition: 'center',
                                filter: 'blur(8px) brightness(0.65)',
                                transform: 'scale(1.15)',
                              }}/>
                              <img src={m.photoUrl} alt=""
                                style={{
                                  position: 'absolute', inset: 0, margin: 'auto',
                                  maxWidth: '100%', maxHeight: '100%',
                                  objectFit: 'contain',
                                }}/>
                            </>
                          ) : (
                            <span style={{ fontSize: 9, color: 'var(--muted)', opacity: 0.6 }}>—</span>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{m.nom}</div>
                          <div style={{ display:'flex', gap:8, marginTop:2 }}>
                            <span style={{ fontSize:11, color:'var(--muted)' }}>{m.stock} en stock</span>
                            <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:10,
                              background:(m.stock||0)===0?'var(--red-light)':(m.stock||0)<=(m.seuilAlerte||10)?'var(--amber-light)':'var(--brand-light)',
                              color:(m.stock||0)===0?'var(--red)':(m.stock||0)<=(m.seuilAlerte||10)?'var(--amber)':'var(--brand-dark)' }}>
                              {(m.stock||0)===0?'Rupture':`${m.stock}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:'var(--brand-dark)' }}>{fmt(m.prix||0)}</span>
                        <button onClick={() => {
                          const delta = parseInt(prompt(`Réapprovisionner "${m.nom}"\nStock actuel : ${m.stock||0}\nQuantité à ajouter :`))
                          if (!isNaN(delta) && delta > 0) updateMenuItem(m.id, { stock: (m.stock||0) + delta })
                        }} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', border:'0.5px solid #5DCAA5', borderRadius:6, background:'var(--brand-light)', color:'var(--brand-dark)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
                          +Stock
                        </button>
                        <button onClick={() => startEditItem(m)}
                          style={{ display:'flex', alignItems:'center', padding:'4px 7px', border:'0.5px solid var(--border2)', borderRadius:6, background:'var(--bg2)', color:'var(--text)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
                          <Pencil size={11}/>
                        </button>
                        <button onClick={() => deleteMenuItem(m.id)}
                          style={{ display:'flex', alignItems:'center', padding:'4px 7px', border:'0.5px solid #F09595', borderRadius:6, background:'var(--red-light)', color:'var(--red)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
                          <Trash2 size={11}/>
                        </button>
                      </div>
                    </div>
                  ))
                }
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
