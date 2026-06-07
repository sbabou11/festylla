/**
 * pages/admin/Finances.jsx — Lot Finances 1
 *
 * Suivi des dépenses et recettes d'organisation (hors cashless).
 * Dépenses : courses, matériel, déplacements, abonnements…
 * Recettes : subventions, sponsors, dons…
 * Alimentent le compte de résultat du rapport de clôture.
 *
 * Montants en CENTIMES en base, saisis en euros dans le formulaire.
 */
import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Trash2, Edit2, X, Check, Filter, Paperclip,
  ShoppingCart, Package, Car, Repeat, Megaphone, Home, Tag,
  Building2, Gift, Ticket, HelpCircle, TrendingUp, TrendingDown, Wallet,
} from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import {
  watchFinances, addFinance, updateFinance, deleteFinance,
  FINANCE_CATEGORIES_DEFAULT, getSettings, saveSettings,
} from '../../firebase/service'
import FinanceDocuments from '../../components/FinanceDocuments'
import PancartePrincipale from '../../components/PancartePrincipale'
import { ArrowLeft, Mic } from 'lucide-react'

const MODE_LABEL = { especes: 'Espèces', virement: 'Virement', cheque: 'Chèque', cb: 'CB', autre: 'Autre' }
const MODES = ['especes', 'virement', 'cheque', 'cb', 'autre']

// Icône par catégorie (heuristique sur le nom, sinon Tag/HelpCircle)
function categoryIcon(cat, sens) {
  const c = (cat || '').toLowerCase()
  if (c.includes('course') || c.includes('aliment')) return ShoppingCart
  if (c.includes('matériel') || c.includes('materiel')) return Package
  if (c.includes('déplac') || c.includes('deplac') || c.includes('transport')) return Car
  if (c.includes('abonn')) return Repeat
  if (c.includes('commun')) return Megaphone
  if (c.includes('locat')) return Home
  if (c.includes('subvent')) return Building2
  if (c.includes('sponsor')) return Tag
  if (c.includes('don')) return Gift
  if (c.includes('billet')) return Ticket
  return sens === 'recette' ? TrendingUp : TrendingDown
}

const fmtEur = (cents) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export default function Finances({ onNavigate }) {
  const { user } = useAuthStore()
  const { currentEventId } = useEventStore()
  // Hub : null = écran d'accueil à 3 cartes ; 'mouvements' = contenu finances
  const [subView, setSubView] = useState(null)
  const [mouvements, setMouvements] = useState([])
  const [filterSens, setFilterSens] = useState('all') // all | depense | recette
  const [filterCat, setFilterCat] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [customCats, setCustomCats] = useState({ depense: [], recette: [] })

  // Abonnement temps réel aux mouvements
  useEffect(() => {
    if (!currentEventId) return
    const unsub = watchFinances(setMouvements, currentEventId)
    return () => unsub && unsub()
  }, [currentEventId])

  // Catégories custom depuis les settings
  useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(s => {
      if (s?.financeCategories) setCustomCats({
        depense: Array.isArray(s.financeCategories.depense) ? s.financeCategories.depense : [],
        recette: Array.isArray(s.financeCategories.recette) ? s.financeCategories.recette : [],
      })
    }).catch(() => {})
  }, [currentEventId])

  const allCats = useMemo(() => ({
    depense: [...FINANCE_CATEGORIES_DEFAULT.depense.filter(c => c !== 'Autre'), ...customCats.depense, 'Autre'],
    recette: [...FINANCE_CATEGORIES_DEFAULT.recette.filter(c => c !== 'Autre'), ...customCats.recette, 'Autre'],
  }), [customCats])

  // Stats
  const stats = useMemo(() => {
    let recettes = 0, depenses = 0, enAttente = 0
    for (const m of mouvements) {
      if (m.statut === 'prevu') enAttente++
      if (m.statut !== 'paye') continue
      if (m.sens === 'recette') recettes += m.montant || 0
      else depenses += m.montant || 0
    }
    return { recettes, depenses, solde: recettes - depenses, enAttente }
  }, [mouvements])

  // Liste filtrée
  const filtered = useMemo(() => {
    return mouvements.filter(m => {
      if (filterSens !== 'all' && m.sens !== filterSens) return false
      if (filterCat !== 'all' && m.categorie !== filterCat) return false
      return true
    })
  }, [mouvements, filterSens, filterCat])

  const catsForFilter = useMemo(() => {
    const set = new Set(mouvements.map(m => m.categorie).filter(Boolean))
    return Array.from(set).sort()
  }, [mouvements])

  const openNew = () => { setEditing(null); setShowForm(true) }
  const openEdit = (m) => { setEditing(m); setShowForm(true) }
  const handleDelete = async (m) => {
    if (!window.confirm(`Supprimer « ${m.libelle || m.categorie} » ?`)) return
    try { await deleteFinance(m.id, currentEventId) }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  // Persiste une nouvelle catégorie custom si besoin
  const persistCustomCat = async (sens, cat) => {
    const known = allCats[sens]
    if (known.includes(cat) || cat === 'Autre' || !cat) return
    const next = { ...customCats, [sens]: [...customCats[sens], cat] }
    setCustomCats(next)
    try { await saveSettings({ financeCategories: next }, currentEventId) } catch {}
  }

  const handleSave = async (form) => {
    try {
      await persistCustomCat(form.sens, form.categorie)
      if (editing) await updateFinance(editing.id, form, currentEventId)
      else await addFinance(form, user, currentEventId)
      setShowForm(false); setEditing(null)
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  // ─── HUB : écran d'accueil à 3 cartes ───────────────────────────────
  if (subView === null) {
    const hubRecettes = mouvements.filter(m => m.sens === 'recette' && m.statut === 'paye').reduce((a, m) => a + (m.montant || 0), 0)
    const hubDepenses = mouvements.filter(m => m.sens === 'depense' && m.statut === 'paye').reduce((a, m) => a + (m.montant || 0), 0)
    const hubSolde = hubRecettes - hubDepenses
    return (
      <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Finances</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            Mouvements, exposants et cachets artistes en un seul espace.
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          <PancartePrincipale
            onClick={() => setSubView('mouvements')}
            gradient="linear-gradient(135deg, #1D9E75 0%, #04342C 100%)"
            icon={<Wallet size={44} strokeWidth={2}/>}
            titre="Mouvements"
            description="Dépenses et recettes hors cashless"
            stats={[
              { label: 'Recettes', value: fmtEur(hubRecettes) },
              { label: 'Dépenses', value: fmtEur(hubDepenses) },
              { label: 'Solde', value: fmtEur(hubSolde) },
            ]}
          />
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('exposants', 'finances')}
            gradient="linear-gradient(135deg, #378ADD 0%, #042C53 100%)"
            icon={<Building2 size={44} strokeWidth={2}/>}
            titre="Exposants"
            description="Stands, emplacements et redevances"
            stats={[
              { label: 'Voir', value: '→' },
              { label: 'Gérer', value: '→' },
              { label: 'Suivre', value: '→' },
            ]}
          />
          <PancartePrincipale
            onClick={() => onNavigate && onNavigate('cachets', 'finances')}
            gradient="linear-gradient(135deg, #EF9F27 0%, #633806 100%)"
            icon={<Mic size={44} strokeWidth={2}/>}
            titre="Cachets & décharges"
            description="Paiements artistes et décharges signées"
            stats={[
              { label: 'Voir', value: '→' },
              { label: 'Régler', value: '→' },
              { label: 'Signer', value: '→' },
            ]}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxWidth: 920, margin: '0 auto' }}>
      {/* Bouton retour vers le hub */}
      <button onClick={() => setSubView(null)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: 13, padding: '4px 0', marginBottom: 8,
          fontFamily: 'inherit',
        }}>
        <ArrowLeft size={15}/> Retour aux finances
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Finances de l'organisation</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            Dépenses et recettes hors cashless — alimentent le compte de résultat.
          </p>
        </div>
        <button onClick={openNew} style={btnPrimary}>
          <Plus size={15}/> Ajouter un mouvement
        </button>
      </div>

      {/* Cartes de synthèse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, margin: '16px 0' }}>
        <StatCard label="Recettes (payées)" value={fmtEur(stats.recettes)} color="var(--green-dark, #065f46)"/>
        <StatCard label="Dépenses (payées)" value={fmtEur(stats.depenses)} color="var(--red-dark, #a32d2d)"/>
        <StatCard label="Solde réalisé" value={fmtEur(stats.solde)} color={stats.solde >= 0 ? 'var(--green-dark, #065f46)' : 'var(--red-dark, #a32d2d)'}/>
        <StatCard label="En attente" value={`${stats.enAttente} mvt${stats.enAttente > 1 ? 's' : ''}`} color="var(--amber-dark, #ba7517)"/>
      </div>

      {/* Barre d'outils */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={seg}>
          {[['all', 'Tout'], ['depense', 'Dépenses'], ['recette', 'Recettes']].map(([k, lbl]) => (
            <button key={k} onClick={() => setFilterSens(k)}
              style={{ ...segBtn, ...(filterSens === k ? segBtnOn : {}) }}>{lbl}</button>
          ))}
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 130 }}>
          <option value="all">Toutes catégories</option>
          {catsForFilter.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div style={emptyBox}>
          {mouvements.length === 0
            ? "Aucun mouvement enregistré. Cliquez sur « Ajouter un mouvement » pour commencer."
            : "Aucun mouvement ne correspond à ces filtres."}
        </div>
      ) : (
        <div style={listBox}>
          {filtered.map(m => {
            const Icon = categoryIcon(m.categorie, m.sens)
            const isRec = m.sens === 'recette'
            return (
              <div key={m.id} style={rowStyle}>
                <div style={{ ...iconBox, background: isRec ? 'var(--green-light, #e1f5ee)' : 'var(--red-light, #fcebeb)',
                  color: isRec ? 'var(--green-dark, #065f46)' : 'var(--red-dark, #a32d2d)' }}>
                  <Icon size={15}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.libelle || m.categorie}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {m.categorie} · {m.date} · {MODE_LABEL[m.modePaiement] || m.modePaiement}
                    {(m.documents && m.documents.length > 0) && (
                      <span style={{ marginLeft: 6, color: 'var(--brand-dark, #134e5a)' }}>
                        <Paperclip size={11} style={{ verticalAlign: -1 }}/> {m.documents.length}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ ...pill, ...(m.statut === 'paye' ? pillPaye : pillPrevu) }}>
                  {m.statut === 'paye' ? 'Payé' : 'Prévu'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: isRec ? 'var(--green-dark, #065f46)' : 'var(--red-dark, #a32d2d)' }}>
                  {isRec ? '+ ' : '− '}{fmtEur(m.montant)}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEdit(m)} style={iconBtn} aria-label="Modifier"><Edit2 size={13}/></button>
                  <button onClick={() => handleDelete(m)} style={{ ...iconBtn, color: 'var(--red-dark, #a32d2d)' }} aria-label="Supprimer"><Trash2 size={13}/></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <FinanceForm
          initial={editing}
          liveFinance={editing ? mouvements.find(m => m.id === editing.id) : null}
          eventId={currentEventId}
          allCats={allCats}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg, #f8f9fa)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: color || 'inherit' }}>{value}</div>
    </div>
  )
}

function FinanceForm({ initial, liveFinance, eventId, allCats, onCancel, onSave }) {
  const [sens, setSens] = useState(initial?.sens || 'depense')
  const [montant, setMontant] = useState(initial ? (initial.montant / 100).toString() : '')
  const [categorie, setCategorie] = useState(initial?.categorie || '')
  const [customCat, setCustomCat] = useState('')
  const [libelle, setLibelle] = useState(initial?.libelle || '')
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10))
  const [modePaiement, setModePaiement] = useState(initial?.modePaiement || 'cb')
  const [statut, setStatut] = useState(initial?.statut || 'paye')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [err, setErr] = useState('')

  const cats = allCats[sens]
  const usingCustom = categorie === '__custom__'

  const submit = () => {
    const m = parseFloat(String(montant).replace(',', '.'))
    if (isNaN(m) || m <= 0) { setErr('Le montant doit être positif.'); return }
    const finalCat = usingCustom ? customCat.trim() : categorie
    if (!finalCat) { setErr('Choisissez ou saisissez une catégorie.'); return }
    onSave({
      sens, montant: Math.round(m * 100), categorie: finalCat,
      libelle: libelle.trim(), date, modePaiement, statut, notes: notes.trim(),
    })
  }

  return createPortal(
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{initial ? 'Modifier le mouvement' : 'Nouveau mouvement'}</h2>
          <button onClick={onCancel} style={iconBtn} aria-label="Fermer"><X size={16}/></button>
        </div>

        {/* Sens : dépense / recette */}
        <div style={{ ...seg, marginBottom: 12 }}>
          <button onClick={() => { setSens('depense'); setCategorie('') }}
            style={{ ...segBtn, flex: 1, ...(sens === 'depense' ? { background: 'var(--red-light, #fcebeb)', color: 'var(--red-dark, #a32d2d)' } : {}) }}>
            <TrendingDown size={14} style={{ verticalAlign: -2, marginRight: 4 }}/> Dépense
          </button>
          <button onClick={() => { setSens('recette'); setCategorie('') }}
            style={{ ...segBtn, flex: 1, ...(sens === 'recette' ? { background: 'var(--green-light, #e1f5ee)', color: 'var(--green-dark, #065f46)' } : {}) }}>
            <TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 4 }}/> Recette
          </button>
        </div>

        <Field label="Montant (€)">
          <input type="number" step="0.01" min="0" value={montant} onChange={e => setMontant(e.target.value)}
            placeholder="0,00" style={inputStyle} autoFocus/>
        </Field>

        <Field label="Catégorie">
          <select value={categorie} onChange={e => setCategorie(e.target.value)} style={inputStyle}>
            <option value="">— Choisir —</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__custom__">+ Nouvelle catégorie…</option>
          </select>
        </Field>
        {usingCustom && (
          <Field label="Nom de la nouvelle catégorie">
            <input value={customCat} onChange={e => setCustomCat(e.target.value)}
              placeholder="ex: Assurance" style={inputStyle}/>
          </Field>
        )}

        <Field label="Libellé (optionnel)">
          <input value={libelle} onChange={e => setLibelle(e.target.value)}
            placeholder="ex: Courses Metro Cash & Carry" style={inputStyle}/>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Mode de paiement">
            <select value={modePaiement} onChange={e => setModePaiement(e.target.value)} style={inputStyle}>
              {MODES.map(mo => <option key={mo} value={mo}>{MODE_LABEL[mo]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Statut">
          <div style={seg}>
            <button onClick={() => setStatut('paye')}
              style={{ ...segBtn, flex: 1, ...(statut === 'paye' ? segBtnOn : {}) }}>Payé</button>
            <button onClick={() => setStatut('prevu')}
              style={{ ...segBtn, flex: 1, ...(statut === 'prevu' ? segBtnOn : {}) }}>Prévu</button>
          </div>
        </Field>

        <Field label="Notes (optionnel)">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Détails, n° de facture…" style={{ ...inputStyle, resize: 'vertical' }}/>
        </Field>

        {/* Justificatifs (Lot Finances 2) */}
        <Field label="Justificatifs">
          <FinanceDocuments finance={liveFinance || initial} eventId={eventId}/>
        </Field>

        {err && <div style={{ color: 'var(--red-dark, #a32d2d)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={onCancel} style={{ ...btnSecondary, flex: 1 }}>Annuler</button>
          <button onClick={submit} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
            <Check size={15}/> {initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ── Styles ──
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--brand, #1a6b7a)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const btnSecondary = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', background: 'transparent', color: 'var(--text, #1a1a1a)', border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const seg = { display: 'flex', border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }
const segBtn = { border: 'none', borderRadius: 0, padding: '7px 14px', fontSize: 12, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text, #1a1a1a)' }
const segBtnOn = { background: 'var(--brand, #1a6b7a)', color: '#fff' }
const selectStyle = { padding: '7px 10px', fontSize: 12, border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 8, background: '#fff', fontFamily: 'inherit' }
const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 8, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box' }
const listBox = { background: '#fff', border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }
const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '0.5px solid var(--border, #e2e8f0)' }
const iconBox = { width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const pill = { fontSize: 10, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }
const pillPaye = { background: 'var(--green-light, #e1f5ee)', color: 'var(--green-dark, #065f46)' }
const pillPrevu = { background: 'var(--amber-light, #faeeda)', color: 'var(--amber-dark, #ba7517)' }
const iconBtn = { width: 28, height: 26, padding: 0, background: 'transparent', border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 6, cursor: 'pointer', color: 'var(--brand-dark, #134e5a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const emptyBox = { padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', border: '0.5px dashed var(--border, #e2e8f0)', borderRadius: 12 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box' }
