/**
 * pages/billetterie/CommandeSurPlace.jsx — commande d'un client sans compte (parcours borne, lot 3)
 *
 * Le bénévole de la billetterie encaisse (espèces au coffre, ou carte SumUp), saisit la
 * commande avec le même menu que la borne, puis remet au client un code à 6 chiffres.
 * Le client tape ce code à la borne, qui imprime un ticket par stand.
 * Aucune information sur le client n'est demandée ; la vente est rattachée au bénévole.
 */
import React, { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { collection, onSnapshot } from 'firebase/firestore'
import { Banknote, CreditCard, Minus, Plus, ShoppingBag, Check, X } from 'lucide-react'
import { db } from '../../firebase/config'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { creerCommandeSurPlace } from '../../firebase/service'
import { watchCarte } from '../../menu/carte'
import { organiserCarte } from '../../menu/organiser'
import { getIcon } from '../../menu/icons'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Button, Sheet, Empty } from '../../ui'
import s from './surPlace.module.css'

const MOYENS = [
  { value: 'especes', label: 'Espèces', hint: 'Billets au coffre', icon: Banknote },
  { value: 'cb', label: 'Carte', hint: 'Terminal SumUp', icon: CreditCard },
]

const groupe = (code) => `${code.slice(0, 3)} ${code.slice(3)}`

export default function CommandeSurPlace() {
  const { menu } = useAppStore()
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [carte, setCarte] = useState({ rayons: [], stands: [] })
  const [categories, setCategories] = useState([])
  const [rayonId, setRayonId] = useState(null)
  const [catKey, setCatKey] = useState(null)
  const [cart, setCart] = useState({})
  const [moyen, setMoyen] = useState(null)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)       // { code, total, moyen }
  const [sheet, setSheet] = useState(false)

  useEffect(() => watchCarte(currentEventId, setCarte), [currentEventId])
  useEffect(() => {
    if (!currentEventId) return
    return onSnapshot(collection(db, 'events', currentEventId, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      e => console.warn('categories:', e.message))
  }, [currentEventId])

  const org = useMemo(() => organiserCarte({ menu, categories, rayons: carte.rayons, stands: carte.stands }),
    [menu, categories, carte])
  const rayon = org.rayons.find(r => r.id === rayonId) || org.rayons[0] || null
  const cat = rayon ? (rayon.cats.find(c => c.key === catKey) || rayon.cats[0]) : null
  const showRayons = org.rayons.length > 1 || !!org.rayons[0]?.nom
  const standById = useMemo(() => new Map(carte.stands.map(st => [st.id, st])), [carte.stands])

  const lignes = useMemo(() => Object.entries(cart).map(([id, qty]) => {
    const m = menu.find(x => x.id === id)
    return m ? { ...m, qty } : null
  }).filter(Boolean), [cart, menu])
  const total = lignes.reduce((t, l) => t + (l.prix || 0) * l.qty, 0)
  const count = lignes.reduce((t, l) => t + l.qty, 0)

  const setQty = (item, delta) => setCart(prev => {
    const next = { ...prev }
    const max = typeof item.stock === 'number' ? item.stock : Infinity
    const q = Math.min(max, Math.max(0, (next[item.id] || 0) + delta))
    if (q === 0) delete next[item.id]; else next[item.id] = q
    return next
  })

  const encaisser = async () => {
    if (!lignes.length) return
    if (!moyen) { setErr('Choisissez le moyen de paiement.'); return }
    setSending(true); setErr('')
    try {
      const items = lignes.map(l => {
        const st = standById.get(l.standId)
        return { id: l.id, nom: l.nom, qty: l.qty, prixUnit: l.prix || 0, ...(st ? { standId: st.id, standNumero: st.numero } : {}) }
      })
      const r = await creerCommandeSurPlace({ items, moyen, staff: user?.nom || 'Billetterie' }, currentEventId)
      setDone({ ...r, moyen })
      setCart({}); setMoyen(null); setSheet(false)
    } catch (e) {
      setErr(friendlyError(e, "La commande n'est pas passée. Rien n'a été enregistré."))
    } finally { setSending(false) }
  }

  // ── Code remis au client ──────────────────────────────────────────
  if (done) {
    return (
      <div className={s.donePage}>
        <div className={s.doneCard}>
          <span className={s.doneCheck}><Check size={28}/></span>
          <div className={s.label}>Code à donner au client</div>
          <div className={s.code} aria-label={`Code ${done.code.split('').join(' ')}`}>{groupe(done.code)}</div>
          <p className={s.doneText}>
            Le client tape ce code sur la borne « J'ai un code » pour recevoir ses tickets.
            Il ne sert qu'une fois.
          </p>
          <div className={s.doneMeta}>
            <span>{fmt(done.total)}</span>
            <span>·</span>
            <span>{done.moyen === 'especes' ? 'Espèces, à mettre au coffre' : 'Carte SumUp'}</span>
          </div>
          <Button size="lg" block onClick={() => setDone(null)}>Nouvelle commande</Button>
        </div>
      </div>
    )
  }

  const panier = (
    <div className={s.cart}>
      <div className={s.cartHead}>
        <ShoppingBag size={18}/> <b>Commande</b>
        <span className={s.muted}>{count} article{count > 1 ? 's' : ''}</span>
      </div>
      {lignes.length === 0
        ? <p className={s.muted}>Touchez « + » sur un article pour l'ajouter.</p>
        : (
          <div className={s.lines}>
            {lignes.map(l => (
              <div key={l.id} className={s.line}>
                <div className={s.lineInfo}>
                  <span className={s.lineName}>{l.nom}</span>
                  <span className={s.muted}>{fmt(l.prix || 0)} l'unité</span>
                </div>
                <div className={s.stepper}>
                  <button type="button" aria-label={`Retirer un ${l.nom}`} onClick={() => setQty(l, -1)}><Minus size={14}/></button>
                  <b>{l.qty}</b>
                  <button type="button" aria-label={`Ajouter un ${l.nom}`} onClick={() => setQty(l, +1)}><Plus size={14}/></button>
                </div>
                <span className={s.lineTotal}>{fmt((l.prix || 0) * l.qty)}</span>
              </div>
            ))}
          </div>
        )}
      <div className={s.total}><span>Total</span><b>{fmt(total)}</b></div>

      <div className={s.label}>Paiement</div>
      <div className={s.moyens}>
        {MOYENS.map(({ value, label, hint, icon: Icon }) => (
          <button key={value} type="button" aria-pressed={moyen === value}
            className={clsx(s.moyen, moyen === value && s.moyenOn)} onClick={() => { setMoyen(value); setErr('') }}>
            <Icon size={20}/>
            <span><b>{label}</b><small>{hint}</small></span>
          </button>
        ))}
      </div>
      {err && <p className={s.err} role="alert">{err}</p>}
      <Button variant="coral" size="lg" block loading={sending}
        disabled={!lignes.length || sending} onClick={encaisser}>
        {sending ? 'Enregistrement…' : `Encaissé · ${fmt(total)}`}
      </Button>
      <p className={s.hint}>Validez une fois l'argent reçu : le code s'affiche ensuite.</p>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={s.main}>
        {showRayons && (
          <div className={s.rayons} role="tablist" aria-label="Rayons">
            {org.rayons.map(r => {
              const Icon = getIcon(r.icon)
              const on = r.id === rayon?.id
              return (
                <button key={r.id || 'autres'} role="tab" aria-selected={on}
                  className={clsx(s.rayon, on && s.rayonOn)} onClick={() => { setRayonId(r.id); setCatKey(null) }}>
                  <Icon size={18}/> {r.nom}
                </button>
              )
            })}
          </div>
        )}

        {rayon && rayon.cats.length > 1 && (
          <div className={s.cats}>
            {rayon.cats.map(c => {
              const Icon = getIcon(c.icon)
              const on = c.key === cat?.key
              return (
                <button key={c.key} type="button" aria-pressed={on}
                  className={clsx(s.cat, on && s.catOn)} style={{ '--c': c.couleur || 'var(--brand)' }}
                  onClick={() => setCatKey(c.key)}>
                  <span className={s.catIcon}><Icon size={20}/></span>
                  <span className={s.catName}>{c.nom}</span>
                </button>
              )
            })}
          </div>
        )}

        {!cat ? (
          <Empty icon={ShoppingBag} title="Aucun article à proposer">
            Ajoutez des articles (avec leur stand de retrait) dans Carte &amp; menu.
          </Empty>
        ) : (
          <div className={s.grid}>
            {cat.items.map(m => {
              const q = cart[m.id] || 0
              const out = typeof m.stock === 'number' && m.stock <= 0
              return (
                <div key={m.id} className={clsx(s.card, q > 0 && s.cardOn, out && s.cardOut)}>
                  <div className={s.photo}>
                    {m.photoUrl ? <img src={m.photoUrl} alt=""/> : <span>{(m.nom || '?').charAt(0)}</span>}
                    {q > 0 && <span className={s.qtyBadge}>{q}</span>}
                  </div>
                  <div className={s.cardBody}>
                    <span className={s.cardName}>{m.nom}</span>
                    <span className={s.cardPrice}>{out ? 'Épuisé' : fmt(m.prix || 0)}</span>
                  </div>
                  <div className={s.cardActions}>
                    <button type="button" aria-label={`Retirer un ${m.nom}`} disabled={!q} onClick={() => setQty(m, -1)}><Minus size={16}/></button>
                    <button type="button" aria-label={`Ajouter un ${m.nom}`} className={s.add} disabled={out || (typeof m.stock === 'number' && q >= m.stock)} onClick={() => setQty(m, +1)}><Plus size={16}/></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tablette et ordinateur : panier à droite. Téléphone : barre en bas qui ouvre le panier */}
      <aside className={s.side}>{panier}</aside>
      {count > 0 && (
        <button type="button" className={s.bar} onClick={() => setSheet(true)}>
          <ShoppingBag size={18}/>
          <span>Ma commande · {count}</span>
          <b>{fmt(total)}</b>
        </button>
      )}
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Commande sur place"
        footer={<Button variant="secondary" icon={X} onClick={() => setSheet(false)}>Continuer</Button>}>
        {panier}
      </Sheet>
    </div>
  )
}
