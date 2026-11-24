/**
 * pages/public/BenevoleCommander.jsx — onglet « Conso » de l'espace bénévole
 *
 * Parcours du 19/11/2026 : comme pour les spectateurs, la commande donne un code à 6 chiffres
 * à taper sur la borne, qui imprime le ticket pour le stand des bénévoles. Les droits du jour
 * ne sont décomptés qu'à la borne. Carte : articles marqués « Consommation bénévole »,
 * rangés en rayons et catégories ; pas de prix (le bénévole utilise ses droits).
 */
import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import { KeyRound, Minus, Plus } from 'lucide-react'
import { organiserCarte } from '../../menu/organiser'
import { getIcon } from '../../menu/icons'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import CommandeDetail from '../../components/CommandeDetail'
import { Sheet } from '../../ui'
import { fmt } from '../../utils/helpers'
import { repartirPanier } from '../../utils/avantagesBenevole'
import s from './benevole/BenevoleCommander.module.css'

const TYPES = ['repas', 'boisson', 'eau']
const LABEL = { repas: 'Repas', boisson: 'Boissons', eau: 'Eau' }
const UNITE = { repas: 'repas', boisson: 'boisson', eau: 'eau' }

export default function BenevoleCommander({
  menu, categories = [], carte = { rayons: [], stands: [] }, cartItems, qtys, setQtys,
  resaDone, setResaDone, resaLoading, resaErr, doCommande, quotaRestant, quotaDroit, setTab,
  // Espace artiste (20/11/2026) : même écran, autres textes
  textes = {},
  // Écran 13 (24/11/2026) : bénévole avec solde → toute la carte, avantages d'abord, le reste sur le solde
  solde, onRecharger,
}) {
  const avecSolde = solde !== undefined
  const [recap, setRecap] = useState(false)
  const panier = useMemo(() => avecSolde
    ? repartirPanier(cartItems.map(i => ({ id: i.id, nom: i.nom, qty: i.qty, prix: i.prix, typeConsommation: i.typeConsommation })),
        Object.fromEntries(TYPES.map(t => [t, quotaRestant(t)])))
    : null, [avecSolde, cartItems, quotaRestant])
  const manque = panier && solde != null ? Math.max(0, panier.totalPaye - solde) : 0
  const T = {
    droits: "Mes droits aujourd'hui",
    ticket: 'Elle imprime votre ticket pour le stand des bénévoles.',
    decompte: 'Vos droits seront décomptés à la borne, sur la journée du jour. Annulable sans frais avant, depuis « Conso › Mes commandes ».',
    ongletCodes: 'mes-resas',
    epuise: 'Droits du jour atteints',
    ...textes,
  }
  const [rayonId, setRayonId] = useState(null)
  const [catKey, setCatKey] = useState(null)
  const [fiche, setFiche] = useState(null)   // fiche article ouverte (20/11/2026)

  // Carte bénévole : articles « Consommation bénévole ». Le stand de chaque article ne compte pas
  // (tout part au stand des bénévoles), donc on organise sans filtrer par stand.
  const org = useMemo(() => organiserCarte({ menu, categories, rayons: carte.rayons || [], stands: [] }), [menu, categories, carte])
  const rayon = org.rayons.find(r => r.id === rayonId) || org.rayons[0] || null
  const cat = rayon ? (rayon.cats.find(c => c.key === catKey) || rayon.cats[0]) : null
  const showRayons = org.rayons.length > 1 || !!org.rayons[0]?.nom

  const dansPanier = (type) => cartItems.filter(i => i.typeConsommation === type).reduce((a, i) => a + i.qty, 0)
  const resume = TYPES.map(t => [t, dansPanier(t)]).filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${UNITE[t]}${n > 1 && t !== 'eau' ? 's' : ''}`).join(' · ')

  if (resaDone) {
    const code = String(resaDone.code)
    return (
      <section className={clsx(s.card, s.done)}>
        <span className={s.doneIcon}><KeyRound size={26}/></span>
        <h2>Votre code</h2>
        <b className={s.code} aria-label={`Code ${code.split('').join(' ')}`}>{code.slice(0, 3)} {code.slice(3)}</b>
        <p>Tapez ce code sur la borne, touche « J'ai un code ». {T.ticket}</p>
        <p className={s.muted}>{T.decompte}</p>
        <button type="button" className={s.btnSecondary} onClick={() => { setResaDone(null); setTab(T.ongletCodes) }}>Voir mes codes</button>
        <button type="button" className={s.btnPrimary} onClick={() => setResaDone(null)}>Commander autre chose</button>
      </section>
    )
  }

  return (
    <div className={s.stack}>
      <section className={s.card}>
        <span className={s.label}>{avecSolde ? 'Avantages offerts restants (avec ce panier)' : T.droits}</span>
        <div className={s.droits}>
          {TYPES.map(t => {
            const r = avecSolde ? panier.reste[t] : null
            return (
              <div key={t} className={clsx(s.droit, s[t])}>
                <span>{LABEL[t]}</span>
                {avecSolde
                  ? (<><b>{r ? `${r} restant${r > 1 ? 's' : ''}` : 'Épuisé'}</b><small className={s.muted}>sur {quotaDroit(t)} par jour</small></>)
                  : <b>{quotaRestant(t)} / {quotaDroit(t)}</b>}
              </div>
            )
          })}
        </div>
        {avecSolde && solde != null && (
          <div className={s.soldeLigne}><span>Mon solde</span><b>{fmt(solde)}</b></div>
        )}
      </section>

      {showRayons && (
        <div className={s.rayons} role="tablist" aria-label="Rayons">
          {org.rayons.map(r => {
            const Icon = getIcon(r.icon)
            const on = r.id === rayon?.id
            return (
              <button key={r.id || 'autres'} type="button" role="tab" aria-selected={on}
                className={clsx(s.rayon, on && s.rayonOn)} onClick={() => { setRayonId(r.id); setCatKey(null) }}>
                <Icon size={18} aria-hidden="true"/> {r.nom}
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
              <button key={c.key} type="button" aria-pressed={on} className={clsx(s.cat, on && s.catOn)}
                style={{ '--c': c.couleur || 'var(--brand)' }} onClick={() => setCatKey(c.key)}>
                <span className={s.catIcon}><Icon size={20} aria-hidden="true"/></span>
                <span className={s.catName}>{c.nom}</span>
              </button>
            )
          })}
        </div>
      )}

      {!cat ? (
        <div className={clsx(s.card, s.empty)}>Aucun article proposé aux bénévoles pour le moment.</div>
      ) : (
        <section className={s.card}>
          <span className={s.label}>{cat.nom}</span>
          <div className={s.items}>
            {cat.items.map(m => {
              const q = qtys[m.id] || 0
              const type = m.typeConsommation
              const stock = Number(m.stock) || 0
              // Avec solde : tout article (stock seul) ; sinon dans la limite des droits
              const canAdd = avecSolde ? stock > q : (stock > q && dansPanier(type) < quotaRestant(type))
              // Une seule pastille « Inclus avantage » : article pris sur un avantage, ou qui le serait en l'ajoutant
              const inclus = avecSolde && TYPES.includes(type) && ((panier.offertsPar[m.id] || 0) > 0 || panier.reste[type] > 0)
              return (
                <div key={m.id} className={clsx(s.item, s.itemClick, q > 0 && s.itemOn, stock === 0 && s.itemOut)} onClick={() => setFiche(m)}>
                  <div className={s.photo}>{m.photoUrl ? <img src={m.photoUrl} alt=""/> : <span>{(m.nom || '?').charAt(0)}</span>}</div>
                  <b className={s.itemName}>{m.nom}</b>
                  {avecSolde ? (<>
                    {stock === 0 ? <span className={s.badge}>Épuisé</span> : inclus && <span className={clsx(s.badge, s.inclus)}>Inclus avantage</span>}
                    <span className={s.prix}>{fmt(m.prix || 0)}</span>
                  </>) : (
                    <span className={clsx(s.badge, s[type])}>{stock === 0 ? 'Épuisé' : `1 ${UNITE[type]}`}</span>
                  )}
                  <span className={s.stepper} onClick={e => e.stopPropagation()}>
                    <button type="button" disabled={q === 0} aria-label={`Retirer un ${m.nom}`}
                      onClick={() => setQtys(x => ({ ...x, [m.id]: Math.max(0, (x[m.id] || 0) - 1) }))}><Minus size={16}/></button>
                    <b aria-live="polite">{q}</b>
                    <button type="button" className={s.plus} disabled={!canAdd} aria-label={`Ajouter un ${m.nom}`}
                      onClick={() => setQtys(x => ({ ...x, [m.id]: (x[m.id] || 0) + 1 }))}><Plus size={16}/></button>
                  </span>
                </div>
              )
            })}
          </div>
          {fiche && (() => {
            const t = fiche.typeConsommation
            const q = qtys[fiche.id] || 0
            const max = avecSolde
              ? Math.max(0, (Number(fiche.stock) || 0) - q)
              : Math.max(0, Math.min((Number(fiche.stock) || 0) - q, quotaRestant(t) - dansPanier(t)))
            return (
              <ArticleInfoModal item={fiche} qty={q} onClose={() => setFiche(null)}
                sousTitre={avecSolde ? fmt(fiche.prix || 0) : `1 ${UNITE[t] || 'article'}`}
                maxAdd={max} raisonBloque={(Number(fiche.stock) || 0) === 0 ? 'Épuisé' : T.epuise}
                onAddQty={(n) => setQtys(x => ({ ...x, [fiche.id]: (x[fiche.id] || 0) + n }))} />
            )
          })()}
        </section>
      )}

      {resaErr && <p className={s.err} role="alert">{resaErr}</p>}
      {cartItems.length > 0 && (avecSolde ? (
        <div className={s.bar}>
          <span>{cartItems.reduce((a, i) => a + i.qty, 0)} article{cartItems.reduce((a, i) => a + i.qty, 0) > 1 ? 's' : ''} · {fmt(panier.total)}</span>
          <button type="button" onClick={() => setRecap(true)}>{panier.totalPaye ? `Commander · ${fmt(panier.totalPaye)} sur mon solde` : 'Commander'}</button>
        </div>
      ) : (
        <div className={s.bar}>
          <span>{resume}</span>
          <button type="button" onClick={doCommande} disabled={resaLoading}>{resaLoading ? 'Envoi…' : 'Obtenir mon code'}</button>
        </div>
      ))}

      {/* Écran 13 : récapitulatif (offert, payé sur le solde), puis le code à taper à la borne */}
      {avecSolde && (
        <Sheet open={recap} onClose={() => setRecap(false)} title="Ma commande">
          <div className={s.recap}>
            {panier.lignes.map((l, i) => (
              <div key={i} className={s.recapLigne}><span>{l.nom}</span><b>{l.offert ? `offert (${fmt(l.prix)})` : fmt(l.prix)}</b></div>
            ))}
            <div className={s.recapLigne}><span>Total de la commande</span><b>{fmt(panier.total)}</b></div>
            <div className={s.recapLigne}><span>dont offert par vos avantages</span><b>− {fmt(panier.valeurOfferte)}</b></div>
            <div className={s.recapLigne}><span>Reste à payer sur mon solde</span><b>{fmt(panier.totalPaye)}</b></div>
            {manque > 0 ? (<>
              <p className={s.err} role="alert">Solde insuffisant : il manque {fmt(manque)}.</p>
              <button type="button" className={s.btnPrimary} onClick={() => { setRecap(false); onRecharger?.() }}>Recharger</button>
            </>) : (<>
              {solde != null && <div className={s.recapLigne}><span>Solde après</span><b>{fmt(solde - panier.totalPaye)}</b></div>}
              <p className={s.muted}>Vous recevez un code à 6 chiffres ; tapez-le à la borne, qui imprime un ticket par stand. Le solde est débité à ce moment-là.</p>
              <button type="button" className={s.btnPrimary} disabled={resaLoading}
                onClick={async () => { await doCommande(); setRecap(false) }}>{resaLoading ? 'Envoi…' : 'Obtenir mon code'}</button>
            </>)}
            <button type="button" className={s.btnSecondary} onClick={() => setRecap(false)}>Modifier</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

/** Codes de l'espace bénévole, en tête de l'onglet « Résas » (annulables tant qu'ils n'ont pas servi) */
const CODE_STATUS = {
  en_attente: { label: 'À taper sur la borne', cls: 'boisson' },
  utilise:    { label: 'Ticket imprimé',       cls: 'eau' },
  annule:     { label: 'Annulé',               cls: '' },
}
// Statut passé à CommandeDetail (tons de ui/Badge)
const CODE_TON = { en_attente: 'warning', utilise: 'success', annule: 'neutral' }

export function MesCodes({ codes, onCancel }) {
  // Toucher un code ouvre son détail (23/11/2026, maquette validée) ; « Annuler » reste à côté
  const [ouvert, setOuvert] = useState(null)
  if (!codes.length) return null
  return (
    <section className={s.card} style={{ marginBottom: 12 }}>
      <span className={s.label}>Mes codes</span>
      {codes.map(c => {
        const st = CODE_STATUS[c.statut] || CODE_STATUS.en_attente
        const code = String(c.code)
        return (
          <div key={code} className={s.item} style={{ gap: 4 }}>
            <button type="button" onClick={() => setOuvert(c)} aria-haspopup="dialog"
              aria-label={`Détail du code ${code.split('').join(' ')}, ${st.label}`}
              style={{ display: 'grid', gap: 4, width: '100%', padding: 0, border: 0, background: 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 8 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <b className={s.code} style={{ fontSize: 22 }}>{code.slice(0, 3)} {code.slice(3)}</b>
                <span className={clsx(s.badge, st.cls && s[st.cls])}>{st.label}</span>
              </span>
              <span className={s.muted}>{(c.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(' · ')}</span>
              {c.statut === 'utilise' && c.commandeNumero && <span className={s.muted}>Commande n° {c.commandeNumero}</span>}
            </button>
            {c.statut === 'en_attente' && (
              <button type="button" className={s.btnSecondary} onClick={() => onCancel(code)}>Annuler (sans frais)</button>
            )}
          </div>
        )
      })}
      <CommandeDetail commande={ouvert} benevole onClose={() => setOuvert(null)}
        statut={ouvert ? { label: (CODE_STATUS[ouvert.statut] || CODE_STATUS.en_attente).label, tone: CODE_TON[ouvert.statut] || 'warning' } : null}/>
    </section>
  )
}
