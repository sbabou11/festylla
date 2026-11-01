/**
 * pages/admin/planning/Avantages.jsx — avantages artiste (boissons, repas, eau)
 * AvantagesArtisteBlock : saisie dans le formulaire du créneau
 * CreneauAvantagesPanel : suivi temps réel dans le détail d'un créneau
 */
import React from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, Gift } from 'lucide-react'
import s from './planning.module.css'

// ── Saisie des avantages (formulaire) ─────────────────────────────────
export function AvantagesArtisteBlock({ form, setForm, menuItems }) {
  const [open, setOpen] = React.useState(
    !!(form.avantages?.drinks || form.avantages?.meals || form.avantages?.eaux)
  )

  const av = form.avantages || { drinks:0, meals:0, eaux:0, drinkIds:[], mealIds:[], eauIds:[] }

  // Articles disponibles par catégorie (basé sur typeConsommation)
  const drinkArticles = menuItems.filter(m => m.typeConsommation === 'boisson')
  const mealArticles  = menuItems.filter(m => m.typeConsommation === 'repas')
  const eauArticles   = menuItems.filter(m => m.typeConsommation === 'eau')

  const setQty = (key, val) => {
    setForm(f => ({ ...f, avantages: { ...f.avantages, [key]: Math.max(0, parseInt(val) || 0) } }))
  }
  const toggleId = (listKey, id) => {
    setForm(f => {
      const cur = f.avantages?.[listKey] || []
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
      return { ...f, avantages: { ...f.avantages, [listKey]: next } }
    })
  }

  // Fonction de rendu et non composant : un composant défini ici serait recréé à chaque frappe
  // et le champ quantité perdrait le curseur
  const renderSection = ({ icon, label, qtyKey, idsKey, articles }) => {
    const qty = av[qtyKey] || 0
    const selected = av[idsKey] || []
    return (
      <div className={s.avSection} key={qtyKey}>
        <div className={s.avRow}>
          <span>{icon} {label}</span>
          <input type="number" min="0" value={qty} onChange={e => setQty(qtyKey, e.target.value)}
            className={clsx(s.input, s.qty)} aria-label={label + ' offerts'} />
          <span className={s.avUnit}>offert{qty > 1 ? 's' : ''}</span>
        </div>
        {qty > 0 && (
          <div className={s.avArticles}>
            <span className={s.hint}>Articles autorisés :</span>
            {articles.length === 0 ? (
              <span className={s.empty}>
                Aucun article de cette catégorie dans le menu. Configurez-en dans Menu &gt; Articles avec « Type consommation bénévole = {label} ».
              </span>
            ) : (
              <div className={s.chips}>
                {articles.map(a => {
                  const isSel = selected.includes(a.id)
                  return (
                    <button type="button" key={a.id} onClick={() => toggleId(idsKey, a.id)}
                      className={clsx(s.chip, s.chipSm, isSel && s.chipOn)} aria-pressed={isSel}>
                      {isSel ? '✓ ' : ''}{a.nom}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={s.collapse}>
      <button type="button" onClick={() => setOpen(o => !o)} className={s.collapseHead} aria-expanded={open}>
        <span>🎁 Avantages artiste</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className={s.collapseBody}>
          {renderSection({ icon: '☕', label: 'Boissons', qtyKey: 'drinks', idsKey: 'drinkIds', articles: drinkArticles })}
          {renderSection({ icon: '🍽', label: 'Repas',    qtyKey: 'meals',  idsKey: 'mealIds',  articles: mealArticles })}
          {renderSection({ icon: '💧', label: 'Eau',      qtyKey: 'eaux',   idsKey: 'eauIds',   articles: eauArticles })}
        </div>
      )}
    </div>
  )
}

// ── Panneau Avantages & Consos (dans liste dépliée) ───────────────────
export function CreneauAvantagesPanel({ creneau, consumptions, menuItems }) {
  const av = creneau.avantages || { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] }
  const totalQty = (av.drinks || 0) + (av.meals || 0) + (av.eaux || 0)
  if (totalQty === 0) return null

  const crConsos = consumptions.filter(c => c.creneauId === creneau.id)
  const consDrinks = crConsos.filter(c => c.type === 'drink').length
  const consMeals  = crConsos.filter(c => c.type === 'meal').length
  const consEaux   = crConsos.filter(c => c.type === 'eau').length

  const fmtH = (ts) => {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  }

  const nameOf = (id) => {
    const a = menuItems.find(m => m.id === id)
    return a?.nom || '—'
  }

  const Row = ({ icon, label, total, used, ids }) => {
    if (total === 0) return null
    const remain = Math.max(0, total - used)
    const pct = Math.min(100, (used / total) * 100)
    const allUsed = remain === 0
    return (
      <div className={s.quota}>
        <div className={s.quotaHead}>
          <span>{icon} {label}</span>
          <span className={clsx(s.quotaCount, allUsed && s.quotaOut)}>
            {used}/{total} {allUsed && '· Épuisé'}
          </span>
        </div>
        <div className={clsx(s.bar, allUsed && s.barOut)}><i style={{ width: pct + '%' }} /></div>
        {ids && ids.length > 0 && (
          <div className={s.eligible}>Éligibles : {ids.map(nameOf).join(', ')}</div>
        )}
      </div>
    )
  }

  return (
    <div className={s.panel}>
      <p className={s.panelTitle}><Gift size={12} aria-hidden="true" /> Avantages artiste (temps réel)</p>
      <Row icon="☕" label="Boissons" total={av.drinks || 0} used={consDrinks} ids={av.drinkIds || []}/>
      <Row icon="🍽" label="Repas"    total={av.meals  || 0} used={consMeals}  ids={av.mealIds  || []}/>
      <Row icon="💧" label="Eau"      total={av.eaux   || 0} used={consEaux}   ids={av.eauIds   || []}/>

      {crConsos.length > 0 && (
        <div className={s.history}>
          <p className={s.panelTitle}>Historique ({crConsos.length})</p>
          <div className={s.historyList}>
            {[...crConsos].sort((a, b) => {
              const ta = a.servedAt?.toMillis ? a.servedAt.toMillis() : 0
              const tb = b.servedAt?.toMillis ? b.servedAt.toMillis() : 0
              return tb - ta
            }).map(c => {
              const icn = c.type === 'drink' ? '☕' : c.type === 'meal' ? '🍽' : '💧'
              return (
                <div key={c.id} className={s.histRow}>
                  <span>{icn}</span>
                  <span className={s.histName}>{c.articleNom}</span>
                  <span className={s.num}>{fmtH(c.servedAt)}</span>
                  {c.servedBy?.name && <span>· {c.servedBy.name}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
