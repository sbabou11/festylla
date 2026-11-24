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
import { Banknote, CreditCard, Minus, Plus, ShoppingBag, Check, X, UserCheck, Search } from 'lucide-react'
import { db } from '../../firebase/config'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import { creerCommandeSurPlace, utiliserCode } from '../../firebase/service'
import ImpressionGuichet from '../../components/ImpressionGuichet'
import BannierePanneBorne from '../../components/BannierePanneBorne'
import { watchCarte } from '../../menu/carte'
import { organiserCarte } from '../../menu/organiser'
import { getIcon } from '../../menu/icons'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { Button, Sheet, Empty } from '../../ui'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import s from './surPlace.module.css'

const MOYENS = [
  { value: 'especes', label: 'Espèces', hint: 'Billets au coffre', icon: Banknote },
  { value: 'cb', label: 'Carte', hint: 'Terminal SumUp', icon: CreditCard },
  // 23/11/2026 (refonte des rôles) : compte sans téléphone, pièce d'identité vérifiée
  { value: 'solde', label: 'Son solde YllaCash', hint: "Compte, sans téléphone · pièce d'identité", icon: UserCheck },
]
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const groupe = (code) => `${code.slice(0, 3)} ${code.slice(3)}`

export default function CommandeSurPlace() {
  const { menu, spectateurs } = useAppStore()
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const borneEnPanne = useAuthStore(st => st.borneEnPanne)   // écran 7 : tickets imprimés ici
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
  // Paiement par le solde (23/11/2026) : pièce d'identité vérifiée AVANT toute recherche par nom
  const [soldeOpen, setSoldeOpen] = useState(false)
  const [idOk, setIdOk] = useState(false)
  const [q, setQ] = useState('')
  const [compte, setCompte] = useState(null)      // { docId, id, nom, solde }

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

  const [fiche, setFiche] = useState(null)   // fiche article ouverte (20/11/2026)
  const setQty = (item, delta) => setCart(prev => {
    const next = { ...prev }
    const max = typeof item.stock === 'number' ? item.stock : Infinity
    const q = Math.min(max, Math.max(0, (next[item.id] || 0) + delta))
    if (q === 0) delete next[item.id]; else next[item.id] = q
    return next
  })

  const resultats = useMemo(() => {
    const n = norm(q.trim())
    if (!idOk || n.length < 2) return []
    return (spectateurs || []).filter(x => x && !x.billet?.annule && norm(x.nom).includes(n)).slice(0, 8)
  }, [q, idOk, spectateurs])
  const choisirMoyen = (value) => {
    setMoyen(value); setErr('')
    if (value === 'solde') setSoldeOpen(true)
    else { setCompte(null); setIdOk(false); setQ('') }
  }
  const soldeCourt = compte ? (compte.solde || 0) < total : false

  const encaisser = async () => {
    if (!lignes.length) return
    if (!moyen) { setErr('Choisissez le moyen de paiement.'); return }
    if (moyen === 'solde' && (!compte || !idOk)) { setErr('Vérifiez la pièce d\'identité et choisissez le compte.'); setSoldeOpen(true); return }
    setSending(true); setErr('')
    try {
      const items = lignes.map(l => {
        const st = standById.get(l.standId)
        return { id: l.id, nom: l.nom, qty: l.qty, prixUnit: l.prix || 0, ...(st ? { standId: st.id, standNumero: st.numero } : {}) }
      })
      const r = await creerCommandeSurPlace({ items, moyen, staff: user?.nom || 'Billetterie',
        ...(moyen === 'solde' ? { compte: { docId: compte.docId, id: compte.id, nom: compte.nom }, identiteVerifiee: idOk } : {}) }, currentEventId)
      // Écran 7 (23/11/2026) : borne en panne, le code ne servirait à rien. La billetterie l'utilise
      // aussitôt elle-même et imprime les tickets ; en cas d'échec, le code reste valable (affiché).
      let commande = null, erreurTickets = ''
      if (borneEnPanne) {
        try { commande = await utiliserCode(r.code, currentEventId, { stands: carte.stands, guichet: user?.nom || 'Billetterie' }) }
        catch (e) { erreurTickets = friendlyError(e, "Les tickets n'ont pas pu être préparés.") }
      }
      setDone({ ...r, moyen, compteNom: moyen === 'solde' ? compte.nom : null, commande, erreurTickets })
      setCart({}); setMoyen(null); setSheet(false); setCompte(null); setIdOk(false); setQ('')
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
          {done.commande ? (<>
            <div className={s.label}>Borne en panne · tickets imprimés ici</div>
            <ImpressionGuichet key={done.commande.numero} numero={done.commande.numero}
              lignes={(done.commande.items || []).map(i => ({ nom: i.nom, qty: i.qty, prix: i.prixUnit, standId: i.standId }))}
              stands={carte.stands} paiement="Payé à la billetterie" />
          </>) : (<>
          <div className={s.label}>Code à donner au client</div>
          <div className={s.code} aria-label={`Code ${done.code.split('').join(' ')}`}>{groupe(done.code)}</div>
          <p className={s.doneText}>
            Le client tape ce code sur la borne « J'ai un code » pour recevoir ses tickets.
            Il ne sert qu'une fois.
          </p>
          {done.erreurTickets && <p className={s.err} role="alert">{done.erreurTickets} Le code reste valable dès que la borne refonctionne.</p>}
          </>)}
          <div className={s.doneMeta}>
            <span>{fmt(done.total)}</span>
            <span>·</span>
            <span>{done.moyen === 'especes' ? 'Espèces, à mettre au coffre' : done.moyen === 'solde' ? `Débités du solde de ${done.compteNom}` : 'Carte SumUp'}</span>
          </div>
          {done.moyen === 'solde' && (
            <p className={s.doneText}>Pièce d'identité vérifiée par {user?.nom || 'la billetterie'} · notée au journal d'audit · {done.compteNom} a reçu une notification.</p>
          )}
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
            className={clsx(s.moyen, moyen === value && s.moyenOn)} onClick={() => choisirMoyen(value)}>
            <Icon size={20}/>
            <span><b>{label}</b><small>{value === 'solde' && compte ? `${compte.nom} · ${fmt(compte.solde || 0)}` : hint}</small></span>
          </button>
        ))}
      </div>
      {moyen === 'solde' && soldeCourt && <p className={s.err} role="alert">Solde insuffisant : il manque {fmt(total - (compte.solde || 0))}. Rechargez d'abord son compte ou choisissez un autre paiement.</p>}
      {err && <p className={s.err} role="alert">{err}</p>}
      <Button variant="coral" size="lg" block loading={sending}
        disabled={!lignes.length || sending || (moyen === 'solde' && (!compte || soldeCourt))} onClick={encaisser}>
        {sending ? 'Enregistrement…' : moyen === 'solde' && compte ? `Débiter ${fmt(total)} de son solde` : `Encaissé · ${fmt(total)}`}
      </Button>
      <p className={s.hint}>{moyen === 'solde' ? 'Le solde est débité à la validation ; le code s\'affiche ensuite.' : 'Validez une fois l\'argent reçu : le code s\'affiche ensuite.'}</p>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={s.main}>
        {borneEnPanne && <BannierePanneBorne texte="Borne en panne : à la validation, les tickets sont imprimés ici au lieu de donner un code." />}
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
                <div key={m.id} className={clsx(s.card, s.cardClick, q > 0 && s.cardOn, out && s.cardOut)} onClick={() => setFiche(m)}>
                  <div className={s.photo}>
                    {m.photoUrl ? <img src={m.photoUrl} alt=""/> : <span>{(m.nom || '?').charAt(0)}</span>}
                    {q > 0 && <span className={s.qtyBadge}>{q}</span>}
                  </div>
                  <div className={s.cardBody}>
                    <span className={s.cardName}>{m.nom}</span>
                    <span className={s.cardPrice}>{out ? 'Épuisé' : fmt(m.prix || 0)}</span>
                  </div>
                  <div className={s.cardActions} onClick={e => e.stopPropagation()}>
                    <button type="button" aria-label={`Retirer un ${m.nom}`} disabled={!q} onClick={() => setQty(m, -1)}><Minus size={16}/></button>
                    <button type="button" aria-label={`Ajouter un ${m.nom}`} className={s.add} disabled={out || (typeof m.stock === 'number' && q >= m.stock)} onClick={() => setQty(m, +1)}><Plus size={16}/></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {fiche && (
          <ArticleInfoModal item={fiche} qty={cart[fiche.id] || 0} onClose={() => setFiche(null)}
            maxAdd={typeof fiche.stock === 'number' ? Math.max(0, fiche.stock - (cart[fiche.id] || 0)) : Infinity}
            raisonBloque={typeof fiche.stock === 'number' && fiche.stock <= 0 ? 'Épuisé' : 'Stock atteint'}
            onAddQty={(n) => setQty(fiche, n)} />
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

      {/* Payer avec son solde : pièce d'identité d'abord, puis recherche par nom (23/11/2026) */}
      <Sheet open={soldeOpen} onClose={() => setSoldeOpen(false)} title="Payer avec son solde"
        footer={<Button block disabled={!compte} onClick={() => setSoldeOpen(false)}>Choisir ce compte</Button>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <label className={clsx(s.moyen, idOk && s.moyenOn)} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={idOk} onChange={e => { setIdOk(e.target.checked); setCompte(null); setQ('') }}
              style={{ width: 22, height: 22, flex: 'none', accentColor: 'var(--brand)' }} />
            <span><b>J'ai vérifié la pièce d'identité</b><small>Le nom sur la pièce doit être celui du compte.</small></span>
          </label>
          {!idOk ? (
            <p className={s.muted}>La recherche par nom apparaît une fois la pièce vérifiée.</p>
          ) : (<>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 12px', borderRadius: 12, border: '1px solid var(--border2)', background: 'var(--bg)' }}>
              <Search size={18} aria-hidden="true" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom du spectateur" aria-label="Nom du spectateur"
                autoFocus style={{ flex: 1, border: 0, background: 'none', outline: 'none', font: 'inherit', color: 'var(--text)' }} />
            </label>
            {q.trim().length >= 2 && resultats.length === 0 && <p className={s.muted}>Aucun compte à ce nom.</p>}
            {resultats.map(x => (
              <button key={x._docId || x.id} type="button" aria-pressed={compte?.id === x.id}
                className={clsx(s.moyen, compte?.id === x.id && s.moyenOn)}
                onClick={() => setCompte({ docId: x._docId || x.id, id: x.id, nom: x.nom || x.id, solde: x.solde || 0 })}
                style={{ justifyContent: 'space-between' }}>
                <span><b>{x.nom || x.id}</b><small>{x.id}</small></span>
                <b>{fmt(x.solde || 0)}</b>
              </button>
            ))}
            {compte && (compte.solde || 0) < total && (
              <p className={s.err} role="alert">Solde insuffisant : il manque {fmt(total - (compte.solde || 0))}. Rechargez d'abord son compte ou choisissez un autre paiement.</p>
            )}
          </>)}
        </div>
      </Sheet>
    </div>
  )
}
