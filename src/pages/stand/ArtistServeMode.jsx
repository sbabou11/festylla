/**
 * pages/stand/ArtistServeMode.jsx — v7
 * Mode « Servir un artiste » dans la caisse (Debit, qui applique le plein soleil).
 * - Réservations artistes en attente, servies en un geste
 * - Scanner QR ou recherche par nom
 * - Droits restants affichés en bocaux
 * - Servir un article éligible (décrément automatique), coche de succès
 */
import React, { useState, useEffect, useMemo } from 'react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { serveArtistItem, watchArtistReservations, servirReservationArtiste } from '../../firebase/service'
import QrScanner from '../../components/QrScanner'
import { parseQrEspace } from '../../utils/qrEspace'

// Texte lu par la caméra, transmis tel quel : la lecture par défaut le passe en majuscules,
// ce qui abîme le lien ou le JSON de l'artiste (le QR tournant, lui, se lit dans les deux cas)
const texteLu = (t) => String(t || '').trim() || null
import { friendlyError } from '../../utils/errors'
import {
  Search, X, Clock, MapPin, AlertCircle, Bell, Coffee, UtensilsCrossed, Droplets,
  Music, BookOpen, Clapperboard, Drama,
} from 'lucide-react'
import { Button, Badge, Empty, Jar, SuccessCheck } from '../../ui'
import s from './ArtistServeMode.module.css'
import { adaptArtisteEm, duJour, isEmArtiste } from '../../em/artiste'
import { festDay } from '../../em/jour'

const TYPES = {
  musical:           { icon: Music,        tone: 'brand' },
  litteraire:        { icon: BookOpen,     tone: 'gold' },
  cinematographique: { icon: Clapperboard, tone: 'coral' },
  autre:             { icon: Drama,        tone: 'neutral' },
}

// Catégories d'avantages : icône + couleur du bocal
const CONSO = {
  drink: { icon: Coffee,          label: 'Boissons', color: 'var(--gold)' },
  meal:  { icon: UtensilsCrossed, label: 'Repas',    color: 'var(--coral)' },
  eau:   { icon: Droplets,        label: 'Eau',      color: 'var(--brand)' },
}
const consoOf = (type) => CONSO[type] || CONSO.eau

function fmtHour(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function isSameDay(a, b) {
  if (!a || !b) return false
  const da = a?.toDate ? a.toDate() : new Date(a)
  const db = b?.toDate ? b.toDate() : new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export default function ArtistServeMode({ eventId, menu, staffNom, staffId }) {
  const [creneau, setCreneau]           = useState(null)
  const [consumptions, setConsumptions] = useState([])
  const [planning, setPlanning]         = useState([])
  const [searchQuery, setSearchQuery]   = useState('')
  const [err, setErr]                   = useState('')
  const [feedback, setFeedback]         = useState('')
  const [loading, setLoading]           = useState(false)
  const [forceServeAnyDay, setForceServeAnyDay] = useState(false)
  const [pendingResas, setPendingResas] = useState([])

  // Charger toute la liste des créneaux pour recherche
  useEffect(() => {
    if (!eventId) return
    const col = collection(db, 'events', eventId, 'planning')
    const unsub = onSnapshot(col, snap => {
      setPlanning(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId])

  // Artistes venus d'Event Manager (lot C) et articles qui leur sont offerts
  const [fichesEm, setFichesEm] = useState([])
  const [offerts, setOfferts]   = useState([])
  useEffect(() => {
    if (!eventId) return
    const u1 = onSnapshot(collection(db, 'events', eventId, 'artistes'),
      snap => setFichesEm(snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(a => a.actif !== false)), () => {})
    const u2 = onSnapshot(doc(db, 'events', eventId, 'settings', 'artistes'), snap => setOfferts(snap.data()?.articles || []), () => {})
    return () => { u1(); u2() }
  }, [eventId])
  const jour = festDay()
  const artistesEm = useMemo(() => fichesEm.map(a => adaptArtisteEm(a, { jour, offerts, menu })), [fichesEm, jour, offerts, menu])
  const tous = useMemo(() => [...artistesEm, ...planning], [artistesEm, planning])

  // Écouter les réservations artistes en attente
  useEffect(() => {
    if (!eventId) return
    const unsub = watchArtistReservations(list => {
      const pending = list.filter(r => r.statut === 'pending')
      pending.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
        return ta - tb
      })
      setPendingResas(pending)
    }, eventId)
    return unsub
  }, [eventId])

  // Écouter les consommations du créneau sélectionné
  useEffect(() => {
    if (!eventId || !creneau?.id) { setConsumptions([]); return }
    const col = collection(db, 'events', eventId, 'artist-consumptions')
    const q   = query(col, where('creneauId', '==', creneau.id))
    const unsub = onSnapshot(q, snap => {
      setConsumptions(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId, creneau?.id])

  // Fiche d'Event Manager : suivie par la liste ci-dessus
  useEffect(() => {
    if (!isEmArtiste(creneau)) return
    const a = artistesEm.find(x => x.id === creneau.id)
    if (a && JSON.stringify(a) !== JSON.stringify(creneau)) setCreneau(a)
  }, [artistesEm])

  // Écouter le créneau lui-même en temps réel (modif admin → mise à jour live)
  useEffect(() => {
    if (!eventId || !creneau?.id || isEmArtiste(creneau)) return
    const refDoc = doc(db, 'events', eventId, 'planning', creneau.id)
    const unsub  = onSnapshot(refDoc, snap => {
      if (snap.exists()) {
        setCreneau(prev => prev && prev.id === snap.id ? { ...snap.data(), id: snap.id } : prev)
      }
    })
    return unsub
  }, [eventId, creneau?.id])

  // Décoder le QR : QR tournant de l'espace artiste (YA-…, 23/11/2026), JSON {ev, cr, type:'artiste'}
  // OU directement un creneauId. La caisse identifie seulement l'artiste (comme la recherche par
  // nom) : la signature du QR tournant n'est vérifiée qu'à la borne.
  const handleScan = async (raw) => {
    setErr(''); setFeedback('')
    let crId = null
    const tournant = parseQrEspace(raw)
    if (tournant && tournant.kind === 'artiste') crId = tournant.id
    else if (tournant) { setErr("C'est le QR d'un bénévole, pas celui d'un artiste."); return }
    else try {
      const parsed = JSON.parse(raw)
      if (parsed?.type === 'artiste' && parsed?.cr) crId = parsed.cr
    } catch {
      // Lien personnel de l'espace artiste (…/artiste?ev=…&cr=…&k=…), sinon directement un ID
      const m = String(raw).match(/\/artiste\?([^\s#]+)/i)
      crId = m ? new URLSearchParams(m[1]).get('cr') : raw.trim()
    }
    if (!crId) { setErr('QR invalide'); return }
    // On recherche dans les artistes et le planning déjà chargés (temps réel) — pas besoin de getDoc
    const found = tous.find(p => p.id === crId)
    if (found) {
      setCreneau(found)
    } else {
      // Fallback : si pas encore chargé dans le store local, fetch direct
      try {
        const refDoc = doc(db, 'events', eventId, 'planning', crId)
        const snap   = await getDoc(refDoc)
        if (!snap.exists()) {
          setErr('Créneau introuvable : ' + crId)
          return
        }
        setCreneau({ ...snap.data(), id: snap.id })
      } catch (e) {
        setErr(friendlyError(e, "Le QR n'a pas pu être lu."))
      }
    }
  }

  // Résultats de recherche par nom
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return tous.filter(p =>
      (p.artiste || '').toLowerCase().includes(q) ||
      (p.titre   || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [searchQuery, tous])

  // Calculs droits
  const av = creneau?.avantages || { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] }
  // Fiche d'Event Manager : seulement ce qui a été servi dans la journée (coupure à 6 h)
  const consosJour = duJour(consumptions, creneau, 'servedAt')
  const consDrinks = consosJour.filter(c => c.type === 'drink').length
  const consMeals  = consosJour.filter(c => c.type === 'meal').length
  const consEaux   = consosJour.filter(c => c.type === 'eau').length
  const remainDrinks = Math.max(0, (av.drinks || 0) - consDrinks)
  const remainMeals  = Math.max(0, (av.meals  || 0) - consMeals)
  const remainEaux   = Math.max(0, (av.eaux   || 0) - consEaux)

  // Articles éligibles disponibles (filtrés par menu et compteurs restants)
  const eligibleArticles = useMemo(() => {
    if (!creneau) return []
    const out = []
    if (remainDrinks > 0) {
      (av.drinkIds || []).forEach(id => {
        const a = menu.find(m => m.id === id)
        if (a) out.push({ ...a, _type: 'drink' })
      })
    }
    if (remainMeals > 0) {
      (av.mealIds || []).forEach(id => {
        const a = menu.find(m => m.id === id)
        if (a) out.push({ ...a, _type: 'meal' })
      })
    }
    if (remainEaux > 0) {
      (av.eauIds || []).forEach(id => {
        const a = menu.find(m => m.id === id)
        if (a) out.push({ ...a, _type: 'eau' })
      })
    }
    return out
  }, [creneau, menu, av, remainDrinks, remainMeals, remainEaux])

  const handleServeResa = async (resa) => {
    setLoading(true); setErr(''); setFeedback('')
    try {
      await servirReservationArtiste(resa, staffNom, staffId, eventId)
      setFeedback('Réservation servie : ' + resa.artisteNom)
      setTimeout(() => setFeedback(''), 3000)
    } catch (e) {
      setErr(friendlyError(e, "La réservation n'a pas pu être servie."))
    } finally {
      setLoading(false)
    }
  }

  const handleServe = async (article) => {
    if (!creneau) return
    setLoading(true); setErr(''); setFeedback('')
    try {
      await serveArtistItem(creneau, article, article._type, staffNom, staffId, eventId)
      setFeedback(article.nom + ' servi à ' + creneau.artiste)
      setTimeout(() => setFeedback(''), 3000)
    } catch (e) {
      setErr(friendlyError(e, "L'article n'a pas pu être servi."))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setCreneau(null)
    setSearchQuery('')
    setErr('')
    setFeedback('')
    setForceServeAnyDay(false)
  }

  // Vérification du jour
  const today = new Date()
  // Fiche d'Event Manager : les avantages affichés sont déjà ceux du jour
  const isToday = creneau ? (isEmArtiste(creneau) || isSameDay(creneau.debut, today)) : true
  const canServe = isToday || forceServeAnyDay
  const isAnnule = creneau?.statut === 'annule'
  const ti       = creneau ? (TYPES[creneau.type] || TYPES.autre) : null
  const TypeIcon = ti?.icon

  const errBox = err && (
    <div className={clsx(s.notice, s.noticeRed)} role="alert">
      <AlertCircle size={16} aria-hidden="true" /> <span>{err}</span>
    </div>
  )

  // Succès : coche dessinée, rejouée à chaque nouveau service
  const okBox = feedback && (
    <div className={s.success} role="status" aria-live="polite">
      <SuccessCheck size={40} play={feedback} />
      <b>{feedback}</b>
    </div>
  )

  if (!creneau) return (
    // ── Aucun artiste sélectionné : réservations, scan ou recherche ──
    <div className={s.wrap}>
      {okBox}

      {pendingResas.length > 0 && (
        <section className={clsx(s.card, s.pending)} aria-label="Réservations artistes en attente">
          <h3 className={s.pendingHead}>
            <Bell size={15} aria-hidden="true" /> {pendingResas.length} réservation{pendingResas.length > 1 ? 's' : ''} artiste en attente
          </h3>
          <ul className={clsx(s.list, 'yc-stagger')}>
            {pendingResas.map(r => (
              <li key={r.id} className={s.pendingRow}>
                <div className={s.rowText}>
                  <b>{r.artisteNom || '—'}</b>
                  <span className={s.items}>
                    {(r.items || []).map((i, k) => {
                      const Ic = consoOf(i.type).icon
                      return <span key={k} className={s.item}><Ic size={12} aria-hidden="true" />{i.nom}</span>
                    })}
                  </span>
                </div>
                <Button onClick={() => handleServeResa(r)} disabled={loading} className={s.serveBtn}>Servir</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={s.card}>
        <h3 className={s.cardTitle}>Scanner le QR de l'artiste</h3>
        <QrScanner onScan={handleScan} parse={texteLu} />
      </section>

      <section className={s.card}>
        <label htmlFor="artist-search" className={s.cardTitle}>Ou rechercher par nom</label>
        <div className={s.search}>
          <Search size={16} aria-hidden="true" />
          <input id="artist-search" type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Nom de l'artiste ou du spectacle" autoComplete="off" />
        </div>
        {searchResults.length > 0 && (
          <ul className={s.results}>
            {searchResults.map(cr => {
              const ct = TYPES[cr.type] || TYPES.autre
              const Ic = ct.icon
              return (
                <li key={cr.id}>
                  <button type="button" className={s.result} onClick={() => { setCreneau(cr); setSearchQuery('') }}>
                    <span className={clsx(s.typeIcon, s[ct.tone])}><Ic size={18} aria-hidden="true" /></span>
                    <span className={s.rowText}>
                      <b>{cr.artiste}</b>
                      <span>{fmtDate(cr.debut)} · {fmtHour(cr.debut)}{cr.scene && ' · ' + cr.scene}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {searchQuery && searchResults.length === 0 && (
          <p className={s.none}>Aucun artiste trouvé.</p>
        )}
      </section>

      {errBox}
    </div>
  )

  // ── Artiste sélectionné : fiche + actions ──
  return (
    <div className={s.wrap}>
      <section className={clsx(s.artist, s[ti.tone])}>
        <div className={s.photo}>
          {creneau.photo
            ? <img src={creneau.photo} alt="" style={{ objectPosition: creneau.photoPosition || 'center center' }} />
            : <TypeIcon size={24} aria-hidden="true" />}
        </div>
        <div className={s.artistText}>
          <h3>{creneau.artiste}</h3>
          <div className={s.meta}>
            <span><Clock size={12} aria-hidden="true" /> {isEmArtiste(creneau) && !creneau.debut ? "Avantages du jour (ne joue pas aujourd'hui)" : `${fmtDate(creneau.debut)} · ${fmtHour(creneau.debut)}`}</span>
            {creneau.scene && <span><MapPin size={12} aria-hidden="true" /> {creneau.scene}</span>}
          </div>
        </div>
        <Button variant="ghost" iconOnly icon={X} onClick={reset} aria-label="Changer d'artiste" className={s.close} />
      </section>

      {/* Alertes : annulé, mauvais jour */}
      {isAnnule && (
        <div className={clsx(s.notice, s.noticeRed)}>
          <AlertCircle size={16} aria-hidden="true" /> <span>Ce créneau est annulé : service non recommandé.</span>
        </div>
      )}
      {!isToday && !forceServeAnyDay && (
        <div className={clsx(s.notice, s.noticeGold)}>
          <AlertCircle size={16} aria-hidden="true" />
          <span>Ce créneau n'est pas aujourd'hui ({fmtDate(creneau.debut)}). Les avantages valent normalement le jour du créneau seulement.</span>
          <button type="button" onClick={() => setForceServeAnyDay(true)}>Servir quand même</button>
        </div>
      )}

      {/* Compteurs droits */}
      <section className={clsx(s.card, s.jars)} aria-label="Droits restants">
        <Droit type="drink" remain={remainDrinks} total={av.drinks || 0} />
        <Droit type="meal"  remain={remainMeals}  total={av.meals  || 0} />
        <Droit type="eau"   remain={remainEaux}   total={av.eaux   || 0} />
      </section>

      {okBox}
      {errBox}

      {/* Articles éligibles à servir */}
      <section className={s.card}>
        <h3 className={s.label}>Articles disponibles ({eligibleArticles.length})</h3>
        {!canServe ? (
          <p className={s.none}>Service bloqué : ce n'est pas le jour du créneau.</p>
        ) : eligibleArticles.length === 0 ? (
          <Empty icon={UtensilsCrossed} title={av.drinks + av.meals + av.eaux === 0
            ? 'Aucun avantage prévu pour cet artiste'
            : 'Tous les avantages ont été utilisés'}
            action={<Button size="sm" variant="secondary" onClick={reset}>Changer d'artiste</Button>}>
            Les boissons et repas à servir apparaîtront ici s'il lui reste des avantages.
          </Empty>
        ) : (
          <div className={s.grid}>
            {eligibleArticles.map(a => {
              const c = consoOf(a._type)
              const Ic = c.icon
              return (
                <button key={a.id + '-' + a._type} type="button" className={s.article} onClick={() => handleServe(a)}
                  disabled={loading} aria-busy={loading || undefined}>
                  <span className={clsx(s.articleIcon, s['t_' + a._type])}><Ic size={20} aria-hidden="true" /></span>
                  <b>{a.nom}</b>
                  <Badge tone="success">Gratuit</Badge>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Historique récent */}
      {consumptions.length > 0 && (
        <section className={s.card}>
          <h3 className={s.label}>Déjà servi ({consumptions.length})</h3>
          <ul className={s.list}>
            {consumptions.map(c => {
              const Ic = consoOf(c.type).icon
              return (
                <li key={c.id} className={s.histRow}>
                  <Ic size={15} aria-hidden="true" className={s.histIcon} />
                  <span className={s.histName}>{c.articleNom}</span>
                  <span className={s.histMeta}>{fmtHour(c.servedAt)} · {c.servedBy?.name || '—'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Droit({ type, remain, total }) {
  const c = CONSO[type]
  if (total === 0) {
    const Ic = c.icon
    return (
      <div className={s.droitOff}>
        <Ic size={18} aria-hidden="true" />
        <span>{c.label}</span>
        <b>Non prévu</b>
      </div>
    )
  }
  return <Jar value={remain} max={total} label={c.label} color={c.color} icon={c.icon} />
}
