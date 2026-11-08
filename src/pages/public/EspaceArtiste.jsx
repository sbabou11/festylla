/**
 * pages/public/EspaceArtiste.jsx — v6 Lot C, design system lot 8b
 * Espace personnel artiste — URL : /artiste?ev=EVENT_ID&cr=CRENEAU_ID
 * Onglets (barre du bas, mobile d'abord) : Droits, Consos, Réserver, Mes résas, Programme.
 * Contenu des onglets : artiste/ArtisteSections.jsx ; styles : artiste/EspaceArtiste.module.css
 */
import React, { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import { getSettings, creerReservationArtiste, annulerReservationArtiste, watchArtistReservations, linkArtistToSpec, unlinkArtistFromSpec } from '../../firebase/service'
import { doc, getDoc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { Clock, MapPin, Gift, History, CalendarDays, Bookmark, ShoppingCart, AlertCircle, Link2, Wallet, Mic, Maximize2, Ban } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import ThemeToggle from '../../components/ThemeToggle'
import NotifBell from '../../components/NotifBell'
import { useTheme } from '../../hooks/useTheme'
import { useNotifications } from '../../hooks/useNotifications'
import { friendlyError } from '../../utils/errors'
import { Button, Dialog, Sheet, Empty, Field, Skeleton, toast, focusFirstInvalid } from '../../ui'
import { TYPES, fmtHour, fmtDate } from './artiste/artisteUtils'
import { DroitsTab, ConsosTab, ReserverTab, ResasTab, ProgrammeTab } from './artiste/ArtisteSections'
import s from './artiste/EspaceArtiste.module.css'

const BRAND = '#1a6b7a'

export default function EspaceArtiste() {
  const { theme } = useTheme() // active le thème global (sombre / clair) sur cette page

  const params  = new URLSearchParams(window.location.search)
  const eventId   = params.get('ev')
  const creneauId = params.get('cr')

  const [creneau,      setCreneau]      = useState(null)
  const [planning,     setPlanning]     = useState([])
  const [consumptions, setConsumptions] = useState([])
  const [reservations, setReservations] = useState([])
  const [menu,         setMenu]         = useState([])
  const [eventMeta,    setEventMeta]    = useState(null)
  const [themeColor,   setThemeColor]   = useState(BRAND)
  const [tab,          setTab]          = useState('droits')
  const [loading,      setLoading]      = useState(true)
  const [notFound,     setNotFound]     = useState(false)
  const [cart,         setCart]         = useState({}) // { articleId+'-'+type: qty }
  const [resaErr,      setResaErr]      = useState('')
  const [resaSuccess,  setResaSuccess]  = useState('')
  const [showQrFull,   setShowQrFull]   = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [linkErr, setLinkErr] = useState('')
  const [linkTried, setLinkTried] = useState(false)
  const linkFormRef = useRef(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [cancelAsk,   setCancelAsk]   = useState(null)  // id de la réservation à annuler
  const [unlinkAsk,   setUnlinkAsk]   = useState(false)

  // Notifications artiste (filtrées par creneauId)
  const { notifications, nonLuCount, marquerToutLu } = useNotifications({
    creneauId,
    eventId,
  })

  // Charger le thème de l'événement
  useEffect(() => {
    if (!eventId) return
    getSettings(eventId).then(s => {
      if (s?.theme?.brand) {
        setThemeColor(s.theme.brand)
        document.documentElement.style.setProperty('--brand', s.theme.brand)
      }
    }).catch(() => {})
  }, [eventId])

  // Méta événement
  useEffect(() => {
    if (!eventId) return
    getDoc(doc(db, 'events', eventId)).then(s => s.exists() && setEventMeta(s.data())).catch(() => {})
  }, [eventId])

  // Écouter le créneau (temps réel — modif admin se propage)
  useEffect(() => {
    if (!eventId || !creneauId) { setLoading(false); setNotFound(true); return }
    const refDoc = doc(db, 'events', eventId, 'planning', creneauId)
    const unsub  = onSnapshot(refDoc, snap => {
      if (snap.exists()) { setCreneau({ ...snap.data(), id: snap.id }); setNotFound(false) }
      else { setNotFound(true) }
      setLoading(false)
    }, err => { console.error(err); setLoading(false); setNotFound(true) })
    return unsub
  }, [eventId, creneauId])

  // Écouter toute la planning pour l'onglet Programme
  useEffect(() => {
    if (!eventId) return
    const col = collection(db, 'events', eventId, 'planning')
    const unsub = onSnapshot(col, snap => {
      setPlanning(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId])

  // Écouter les consommations du créneau
  useEffect(() => {
    if (!eventId || !creneauId) return
    const col = collection(db, 'events', eventId, 'artist-consumptions')
    const q   = query(col, where('creneauId', '==', creneauId))
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      list.sort((a, b) => {
        const ta = a.servedAt?.toMillis ? a.servedAt.toMillis() : 0
        const tb = b.servedAt?.toMillis ? b.servedAt.toMillis() : 0
        return tb - ta
      })
      setConsumptions(list)
    })
    return unsub
  }, [eventId, creneauId])

  // Écouter les réservations en attente
  useEffect(() => {
    if (!eventId || !creneauId) return
    const unsub = watchArtistReservations(list => {
      const mine = list.filter(r => r.creneauId === creneauId)
      mine.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
        return tb - ta
      })
      setReservations(mine)
    }, eventId)
    return unsub
  }, [eventId, creneauId])

  // Charger le menu (pour onglet Réserver)
  useEffect(() => {
    if (!eventId) return
    const col = collection(db, 'events', eventId, 'menu')
    const unsub = onSnapshot(col, snap => {
      setMenu(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId])

  if (loading) {
    return (
      <div className={s.page} aria-busy="true">
        <div className={s.skelHead}><Skeleton width={160} height={20}/></div>
        <div className={s.wrap}>
          <div className={s.card}>
            <div className={s.artist}>
              <Skeleton width={64} height={64} radius={14}/>
              <div className={s.skelText}><Skeleton height={20} width="70%"/><Skeleton height={12} width="40%"/></div>
            </div>
            <Skeleton height={12} width="80%"/>
          </div>
          <div className={s.card}><Skeleton height={164} width={164} radius={12} className={s.skelQr}/></div>
          <div className={s.card}><Skeleton lines={3} height={16}/></div>
        </div>
        <span className={s.srOnly} role="status">Chargement de l'espace artiste…</span>
      </div>
    )
  }

  if (!eventId || !creneauId || notFound) {
    return (
      <div className={s.invalid}>
        <Empty icon={Mic} title="Espace artiste introuvable">
          Ce lien est incomplet ou le créneau n'existe plus. Vos avantages apparaîtront ici avec le lien reçu de l'organisation.
        </Empty>
      </div>
    )
  }

  const ti = TYPES[creneau.type] || TYPES.autre
  const TypeIcon = ti.icon
  const av = creneau.avantages || { drinks: 0, meals: 0, eaux: 0, drinkIds: [], mealIds: [], eauIds: [] }

  // Compteurs : consos servies + items en résa pending
  const pendingResa = reservations.filter(r => r.statut === 'pending')
  const pendingItems = pendingResa.flatMap(r => r.items || [])

  const consDrinks = consumptions.filter(c => c.type === 'drink').length
  const consMeals  = consumptions.filter(c => c.type === 'meal').length
  const consEaux   = consumptions.filter(c => c.type === 'eau').length

  const pendingDrinks = pendingItems.filter(i => i.type === 'drink').length
  const pendingMeals  = pendingItems.filter(i => i.type === 'meal').length
  const pendingEaux   = pendingItems.filter(i => i.type === 'eau').length

  // Restants RÉELS = total - consommés - en attente
  const remainDrinks = Math.max(0, (av.drinks || 0) - consDrinks - pendingDrinks)
  const remainMeals  = Math.max(0, (av.meals  || 0) - consMeals  - pendingMeals)
  const remainEaux   = Math.max(0, (av.eaux   || 0) - consEaux   - pendingEaux)

  // Articles éligibles
  const eligibleArticles = []
  if (remainDrinks > 0) {
    (av.drinkIds || []).forEach(id => {
      const a = menu.find(m => m.id === id)
      if (a) eligibleArticles.push({ ...a, _type: 'drink', _typeIcon: '☕' })
    })
  }
  if (remainMeals > 0) {
    (av.mealIds || []).forEach(id => {
      const a = menu.find(m => m.id === id)
      if (a) eligibleArticles.push({ ...a, _type: 'meal', _typeIcon: '🍽' })
    })
  }
  if (remainEaux > 0) {
    (av.eauIds || []).forEach(id => {
      const a = menu.find(m => m.id === id)
      if (a) eligibleArticles.push({ ...a, _type: 'eau', _typeIcon: '💧' })
    })
  }

  // Panier : compte le nombre d'items par type pour ne pas dépasser
  const cartTypes = { drink: 0, meal: 0, eau: 0 }
  Object.entries(cart).forEach(([key, qty]) => {
    const type = key.split('-').pop()
    if (cartTypes[type] !== undefined) cartTypes[type] += qty
  })

  const cartTotal = Object.values(cart).reduce((s, q) => s + q, 0)

  const qrPayload = JSON.stringify({ ev: eventId, cr: creneauId, type: 'artiste' })
  const artCode   = 'ART-' + creneauId.slice(-6).toUpperCase()

  const isAnnule = creneau.statut === 'annule'

  // Réserver
  const handleReserve = async () => {
    setResaErr(''); setResaSuccess('')
    const items = []
    Object.entries(cart).forEach(([key, qty]) => {
      if (qty <= 0) return
      const [articleId, type] = [key.substring(0, key.lastIndexOf('-')), key.split('-').pop()]
      const article = menu.find(m => m.id === articleId)
      if (!article) return
      for (let i = 0; i < qty; i++) {
        items.push({ id: article.id, nom: article.nom, type, _type: type })
      }
    })
    if (items.length === 0) { setResaErr('Sélectionnez au moins un article.'); return }
    try {
      await creerReservationArtiste(creneau, items, eventId)
      setResaSuccess('Réservation envoyée ! Les caissiers ont été notifiés.')
      toast.success('Réservation envoyée, les caissiers sont prévenus')
      setCart({})
      setTimeout(() => setResaSuccess(''), 4000)
      setTab('resas')
    } catch (e) {
      setResaErr(friendlyError(e, "La réservation n'a pas pu être envoyée."))
    }
  }

  // Annulation : confirmée dans la fenêtre « Annuler cette réservation ? »
  const handleCancelResa = async (resaId) => {
    try {
      await annulerReservationArtiste(resaId, eventId)
      toast.success('Réservation annulée')
    } catch (e) {
      toast.error(friendlyError(e, "La réservation n'a pas pu être annulée."), { action: { label: 'Réessayer', onClick: () => handleCancelResa(resaId) } })
    }
  }

  const addToCart = (article) => {
    const key = article.id + '-' + article._type
    const currentInCart = cart[key] || 0
    // Vérifier qu'on ne dépasse pas
    const t = article._type
    const max = t === 'drink' ? remainDrinks : t === 'meal' ? remainMeals : remainEaux
    if (currentInCart >= max) return
    setCart(c => ({ ...c, [key]: currentInCart + 1 }))
  }
  const removeFromCart = (article) => {
    const key = article.id + '-' + article._type
    setCart(c => {
      const next = { ...c }
      if ((next[key] || 0) <= 1) delete next[key]
      else next[key] = next[key] - 1
      return next
    })
  }

  const handleLinkSpec = async () => {
    const v = linkInput.trim().toUpperCase()
    if (!v) { setLinkTried(true); focusFirstInvalid(linkFormRef.current); return }
    setLinkLoading(true); setLinkErr('')
    try {
      await linkArtistToSpec(creneauId, v, eventId)
      setShowLinkModal(false)
      setLinkInput('')
    } catch (e) {
      setLinkErr(friendlyError(e, "Le compte n'a pas pu être lié."))
    } finally {
      setLinkLoading(false)
    }
  }

  // Déliaison : confirmée dans la fenêtre « Délier votre compte spectateur ? »
  const handleUnlinkSpec = async () => {
    try {
      await unlinkArtistFromSpec(creneauId, eventId)
    } catch (e) {
      toast.error(friendlyError(e, "Le compte n'a pas pu être délié."), { action: { label: 'Réessayer', onClick: () => handleUnlinkSpec() } })
    }
  }

  const goToSpectateurSpace = () => {
    if (!creneau.linkedSpecId) return
    const url = '/solde?id=' + creneau.linkedSpecId + (eventId ? '&ev=' + eventId : '') + '&from=artiste&cr=' + creneauId
    window.location.href = url
  }

  const NAV = [
    { id: 'droits',    label: 'Droits',    icon: Gift },
    { id: 'consos',    label: 'Consos',    icon: History },
    { id: 'reserver',  label: 'Réserver',  icon: ShoppingCart, badge: cartTotal },
    { id: 'resas',     label: 'Mes résas', icon: Bookmark,     badge: pendingResa.length },
    { id: 'programme', label: 'Programme', icon: CalendarDays },
  ]

  return (
    <div className={s.page}>
      {/* En-tête */}
      <header className={s.head}>
        <div className={s.headInner}>
          <div className={s.logo}>
            {eventMeta?.logoSrc
              ? <img src={eventMeta.logoSrc} alt=""/>
              : <Mic size={16} aria-hidden="true"/>}
          </div>
          <div className={s.headTitle}>
            <b>{eventMeta?.nom || 'YllaCash'}</b>
            <span>Espace artiste</span>
          </div>
          <div className={s.headActions}>
            {creneau.linkedSpecId ? (
              <button type="button" className={clsx(s.headBtn, s.headBtnOn)} onClick={goToSpectateurSpace}
                title={'Aller à mon espace spectateur (' + creneau.linkedSpecId + ')'} aria-label="Aller à mon espace spectateur">
                <Wallet size={16}/>
              </button>
            ) : (
              <button type="button" className={clsx(s.headBtn, s.headBtnDashed)}
                onClick={() => { setLinkInput(''); setLinkErr(''); setLinkTried(false); setShowLinkModal(true) }}
                title="Lier mon compte spectateur" aria-label="Lier mon compte spectateur">
                <Link2 size={16}/>
              </button>
            )}
            <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}/>
            <ThemeToggle/>
          </div>
        </div>
      </header>

      <main className={s.wrap}>
        {/* Carte artiste */}
        <section className={clsx(s.card, isAnnule && s.cardOff)}>
          {isAnnule && (
            <div className={s.error} role="alert"><Ban size={16} aria-hidden="true"/><span>Ce créneau a été annulé</span></div>
          )}
          <div className={s.artist}>
            <div className={clsx(s.photo, s[ti.tone])}>
              {creneau.photo
                ? <img src={creneau.photo} alt={creneau.artiste} loading="lazy" style={{ objectPosition: creneau.photoPosition || 'center center' }}/>
                : <TypeIcon size={28} aria-hidden="true"/>}
            </div>
            <div className={s.artistText}>
              <h1>{creneau.artiste}</h1>
              {creneau.titre && <span className={s.artistSub}>{creneau.titre}</span>}
              <span className={clsx(s.typeTag, s[ti.tone])}><TypeIcon size={12} aria-hidden="true"/>{ti.label}</span>
            </div>
          </div>
          <div className={s.meta}>
            <span><CalendarDays size={14} aria-hidden="true"/>{fmtDate(creneau.debut)}</span>
            <span><Clock size={14} aria-hidden="true"/>{fmtHour(creneau.debut)} → {fmtHour(creneau.fin)}</span>
            {creneau.scene && <span><MapPin size={14} aria-hidden="true"/>{creneau.scene}</span>}
          </div>
        </section>

        {/* QR code (plein écran au toucher) */}
        <section className={clsx(s.card, s.qrCard)}>
          <h2 className={s.overline}>Présentez ce code au stand</h2>
          <button type="button" className={s.qrBtn} onClick={() => setShowQrFull(true)} aria-label="Agrandir mon QR code">
            <QRCodeCanvas value={qrPayload} size={140} fgColor="#003048" bgColor="#FFFFFF"/>
          </button>
          <span className={s.qrCode}>{artCode}</span>
          <span className={s.qrHint}><Maximize2 size={12} aria-hidden="true"/>Touchez le code pour l'agrandir</span>
        </section>

        {tab === 'droits' && (
          <DroitsTab av={av}
            used={{ drink: consDrinks, meal: consMeals, eau: consEaux }}
            pending={{ drink: pendingDrinks, meal: pendingMeals, eau: pendingEaux }}/>
        )}
        {tab === 'consos' && <ConsosTab consumptions={consumptions}/>}
        {tab === 'reserver' && (
          <ReserverTab av={av} eligibleArticles={eligibleArticles} cart={cart} cartTotal={cartTotal}
            remain={{ drink: remainDrinks, meal: remainMeals, eau: remainEaux }}
            onAdd={addToCart} onRemove={removeFromCart} onReserve={handleReserve} resaErr={resaErr}
            onSeeResas={() => setTab('resas')}/>
        )}
        {tab === 'resas' && <ResasTab reservations={reservations} onCancel={setCancelAsk} onReserve={() => setTab('reserver')}/>}
        {tab === 'programme' && <ProgrammeTab planning={planning} creneauId={creneauId}/>}

        <footer className={s.footer}>
          <b>YllaCash v1.0 · 05/2026</b>
          <span>Développée par Maison Ylla</span>
        </footer>
      </main>

      {/* Barre d'onglets */}
      <nav className={s.nav} aria-label="Navigation">
        {NAV.map(item => {
          const Icon = item.icon
          const on = tab === item.id
          return (
            <button key={item.id} type="button" className={clsx(s.navItem, on && s.navOn)}
              onClick={() => setTab(item.id)} aria-current={on ? 'page' : undefined}>
              <span className={s.navIcon}>
                <Icon size={20} aria-hidden="true"/>
                {item.badge > 0 && <span className={s.navBadge}>{item.badge}</span>}
              </span>
              <span className={s.navLabel}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Liaison au compte spectateur */}
      <Sheet open={showLinkModal} onClose={() => setShowLinkModal(false)} title="Lier mon compte spectateur"
        footer={<>
          <Button variant="secondary" onClick={() => setShowLinkModal(false)}>Annuler</Button>
          <Button icon={Link2} onClick={handleLinkSpec} loading={linkLoading}>
            {linkLoading ? 'Vérification…' : 'Lier mon compte'}
          </Button>
        </>}>
        <div className={s.form} ref={linkFormRef}>
          <p className={s.muted}>
            Saisissez votre numéro spectateur (écrit sous votre QR personnel, par exemple <code>FY-4A2B</code>)
            pour passer d'un espace à l'autre en un geste.
          </p>
          <Field label="Numéro spectateur" error={linkInput.trim() ? null : 'Veuillez saisir votre numéro spectateur.'} showError={linkTried}>
            <input type="text" className={s.input} value={linkInput}
              onChange={(e) => setLinkInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleLinkSpec()}
              placeholder="FY-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              autoFocus/>
          </Field>
          {linkErr && (
            <div className={s.error} role="alert"><AlertCircle size={16} aria-hidden="true"/><span>{linkErr}</span></div>
          )}
        </div>
      </Sheet>

      {/* Confirmation d'annulation */}
      <Dialog open={!!cancelAsk} onClose={() => setCancelAsk(null)} title="Annuler cette réservation ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelAsk(null)}>Garder</Button>
          <Button variant="danger" onClick={() => { const id = cancelAsk; setCancelAsk(null); handleCancelResa(id) }}>Annuler la réservation</Button>
        </>}>
        <p className={s.muted}>Les articles réservés seront de nouveau disponibles dans vos avantages.</p>
      </Dialog>

      {/* Confirmation de déliaison (aucun bouton ne l'ouvre pour l'instant, comme avant) */}
      <Dialog open={unlinkAsk} onClose={() => setUnlinkAsk(false)} title="Délier votre compte spectateur ?"
        footer={<>
          <Button variant="secondary" onClick={() => setUnlinkAsk(false)}>Garder le lien</Button>
          <Button variant="danger" onClick={() => { setUnlinkAsk(false); handleUnlinkSpec() }}>Délier</Button>
        </>}>
        <p className={s.muted}>Vous ne pourrez plus passer directement à votre espace spectateur depuis cette page.</p>
      </Dialog>

      {/* QR plein écran : toujours fond blanc pour la lecture */}
      {showQrFull && (
        <button type="button" className={s.qrFull} onClick={() => setShowQrFull(false)} aria-label="Fermer le QR code">
          <b>{creneau.artiste}</b>
          <span>Artiste · {artCode}</span>
          <QRCodeCanvas value={qrPayload} size={Math.min(window.innerWidth - 100, 380)} fgColor="#000" bgColor="#fff" level="H"/>
          <span>Touchez l'écran pour fermer</span>
        </button>
      )}
    </div>
  )
}
