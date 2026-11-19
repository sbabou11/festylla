/**
 * pages/public/EspaceArtiste.jsx — v6 Lot C, design system lot 8b
 * Espace personnel artiste — URL : /artiste?ev=EVENT_ID&cr=CRENEAU_ID
 * Onglets (barre du bas, mobile d'abord) : Droits, Consos, Commander, Mes codes, Programme.
 * Commander (20/11/2026) : comme les bénévoles, la commande donne un code à 6 chiffres (ou le QR
 * se présente à la borne) ; les avantages sont décomptés à la borne par le serveur, et chaque
 * article sort au stand de cet article. La réservation aux caissiers est remplacée.
 * Contenu des onglets : artiste/ArtisteSections.jsx ; styles : artiste/EspaceArtiste.module.css
 */
import React, { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import { getSettings, annulerReservationArtiste, watchArtistReservations, creerCodeArtiste, annulerCodeEnLigne } from '../../firebase/service'
import { watchCarte } from '../../menu/carte'
import BenevoleCommander, { MesCodes } from './BenevoleCommander'
import { doc, getDoc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { Clock, MapPin, Gift, History, CalendarDays, Bookmark, ShoppingCart, AlertCircle, Mic, Mic2, Maximize2, Ban, Bell, BellOff } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import ThemeToggle from '../../components/ThemeToggle'
import NotifBell from '../../components/NotifBell'
import ArtistReminderPopup from '../../components/ArtistReminderPopup'
import { useTheme } from '../../hooks/useTheme'
import { useNotifications } from '../../hooks/useNotifications'
import { friendlyError } from '../../utils/errors'
import { Button, Dialog, Sheet, Empty, Field, Skeleton, toast, focusFirstInvalid } from '../../ui'
import { TYPES, fmtHour, fmtDate } from './artiste/artisteUtils'
import { DroitsTab, ConsosTab, ResasTab, ProgrammeTab } from './artiste/ArtisteSections'
import s from './artiste/EspaceArtiste.module.css'
import { watchProgramme } from '../../programme/watchProgramme'
import { adaptArtisteEm, duJour } from '../../em/artiste'
import { festDay, dayLabel } from '../../em/jour'
import useArtistReminders from '../../hooks/useArtistReminders'
import useArtistFCM from '../../hooks/useArtistFCM'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import PageTransition from '../../components/PageTransition'

const BRAND = '#1a6b7a'

export default function EspaceArtiste() {
  const { theme } = useTheme() // active le thème global (sombre / clair) sur cette page

  const params  = new URLSearchParams(window.location.search)
  const eventId   = params.get('ev')
  const creneauId = params.get('cr')

  const [creneauPl,    setCreneauPl]    = useState(undefined)   // créneau du planning de YllaCash
  const [ficheEm,      setFicheEm]      = useState(undefined)   // fiche d'artiste venue d'Event Manager (lot C)
  const [offerts,      setOfferts]      = useState([])          // articles offerts aux artistes (fiches Event Manager)
  const [planning,     setPlanning]     = useState([])
  const [consumptions, setConsumptions] = useState([])
  const [reservations, setReservations] = useState([])
  const [menu,         setMenu]         = useState([])
  const [eventMeta,    setEventMeta]    = useState(null)
  const [themeColor,   setThemeColor]   = useState(BRAND)
  const [tab,          setTab]          = useState('droits')
  const [loading,      setLoading]      = useState(true)
  const [notFound,     setNotFound]     = useState(false)
  const [qtys,         setQtys]         = useState({}) // { articleId: qty }
  const [resaErr,      setResaErr]      = useState('')
  const [resaDone,     setResaDone]     = useState(null)
  const [resaLoading,  setResaLoading]  = useState(false)
  const [codes,        setCodes]        = useState([])
  const [cancelCode,   setCancelCode]   = useState(null)
  const [carte,        setCarte]        = useState({ rayons: [], stands: [] })
  const [categories,   setCategories]   = useState([])
  const [showQrFull,   setShowQrFull]   = useState(false)
  const [cancelAsk,   setCancelAsk]   = useState(null)  // id de la réservation à annuler


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

  // Écouter le créneau du planning, ou la fiche d'artiste d'Event Manager (temps réel)
  useEffect(() => {
    if (!eventId || !creneauId) { setLoading(false); setNotFound(true); return }
    const listen = (name, set) => onSnapshot(doc(db, 'events', eventId, name, creneauId),
      snap => set(snap.exists() ? { ...snap.data(), id: snap.id } : null),
      () => set(null))
    const u1 = listen('planning', setCreneauPl)
    const u2 = listen('artistes', setFicheEm)
    return () => { u1(); u2() }
  }, [eventId, creneauId])
  useEffect(() => {
    if (creneauPl === undefined || ficheEm === undefined) return
    setNotFound(!creneauPl && !ficheEm)
    setLoading(false)
  }, [creneauPl, ficheEm])

  // Articles offerts aux artistes (fiches d'Event Manager)
  useEffect(() => {
    if (!eventId || !ficheEm) return
    return onSnapshot(doc(db, 'events', eventId, 'settings', 'artistes'), snap => setOfferts(snap.data()?.articles || []), () => {})
  }, [eventId, !!ficheEm])

  // Programme (onglet Programme) : celui d'Event Manager si l'événement y est relié
  useEffect(() => {
    if (!eventId) return
    return watchProgramme(eventId, setPlanning)
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
    }, eventId, creneauId)
    return unsub
  }, [eventId, creneauId])

  // Codes de l'espace artiste, carte (rayons, stands) et catégories (20/11/2026)
  useEffect(() => {
    if (!eventId || !creneauId) return
    return onSnapshot(query(collection(db, 'events', eventId, 'codes'), where('creneauId', '==', creneauId)),
      snap => setCodes(snap.docs.map(d => d.data()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))),
      () => {})
  }, [eventId, creneauId])
  useEffect(() => {
    if (!eventId) return
    const offCarte = watchCarte(eventId, setCarte, () => {})
    const offCats = onSnapshot(collection(db, 'events', eventId, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ ...d.data(), id: d.id }))), () => {})
    return () => { offCarte(); offCats() }
  }, [eventId])

  // Charger le menu (pour onglet Commander)
  useEffect(() => {
    if (!eventId) return
    const col = collection(db, 'events', eventId, 'menu')
    const unsub = onSnapshot(col, snap => {
      setMenu(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
    return unsub
  }, [eventId])

  // Fiche d'Event Manager : présentée comme un créneau, pour la journée en cours (coupure à 6 h)
  const jour = festDay()
  const creneau = ficheEm ? adaptArtisteEm(ficheEm, { jour, offerts, menu, programme: planning }) : (creneauPl || null)
  const fiche = ficheEm ? 'artistes' : 'planning'

  // Système de rappels JS (balance et prestation) pour l'artiste in-app
  // Ne se déclenche que quand l'app est ouverte. Pour les push système quand
  // l'app est fermée, voir /api/process-reminders.js + cron GitHub Actions.
  const { activeReminder, acknowledge } = useArtistReminders(creneau ? { ...creneau, id: creneauId } : null)

  // Enregistrement FCM artiste : permet au cron serveur d'envoyer des push
  // même quand l'app est fermée. Token stocké sur le créneau planning.
  const { status: fcmStatus, enable: enableFCM } = useArtistFCM({ eventId, creneauId, collectionName: fiche })

  // Tick toutes les minutes : force un re-render pour que les éléments
  // dépendant du temps (bandeau balance qui disparaît après la fin, etc.)
  // se mettent à jour automatiquement sans nécessiter de rechargement.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  // Calcule si la balance est terminée (heure de fin dépassée).
  // Si pas d'heure de fin renseignée, on garde le bandeau (l'admin peut
  // n'avoir mis qu'un début sans fin).
  // Recalculé à chaque render → le tick toutes les minutes le rend
  // automatiquement réactif au temps qui passe.
  const balanceFinished = (() => {
    if (!creneau?.balanceFin) return false
    const finMs = creneau.balanceFin?.toDate
      ? creneau.balanceFin.toDate().getTime()
      : new Date(creneau.balanceFin).getTime()
    if (isNaN(finMs)) return false
    return Date.now() > finMs
  })()

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

  // Compteurs : consos servies + items en résa pending (fiche Event Manager : la journée seulement)
  const consosJour  = duJour(consumptions, creneau, 'servedAt')
  const pendingResa = duJour(reservations, creneau, 'createdAt').filter(r => r.statut === 'pending')
  const pendingItems = pendingResa.flatMap(r => r.items || [])

  const consDrinks = consosJour.filter(c => c.type === 'drink').length
  const consMeals  = consosJour.filter(c => c.type === 'meal').length
  const consEaux   = consosJour.filter(c => c.type === 'eau').length

  const pendingDrinks = pendingItems.filter(i => i.type === 'drink').length
  const pendingMeals  = pendingItems.filter(i => i.type === 'meal').length
  const pendingEaux   = pendingItems.filter(i => i.type === 'eau').length

  // Restants RÉELS = total - consommés - en attente
  const remainDrinks = Math.max(0, (av.drinks || 0) - consDrinks - pendingDrinks)
  const remainMeals  = Math.max(0, (av.meals  || 0) - consMeals  - pendingMeals)
  const remainEaux   = Math.max(0, (av.eaux   || 0) - consEaux   - pendingEaux)

  // Carte artiste : articles de ses avantages qui ont un stand de retrait (la borne imprime un ticket par stand)
  const VERS_CONSO = { meal: 'repas', drink: 'boisson', eau: 'eau' }
  const DE_CONSO = { repas: 'meal', boisson: 'drink', eau: 'eau' }
  const typeDe = new Map()
  ;(av.mealIds || []).forEach(id => typeDe.set(id, 'meal'))
  ;(av.drinkIds || []).forEach(id => typeDe.set(id, 'drink'))
  ;(av.eauIds || []).forEach(id => typeDe.set(id, 'eau'))
  const standIds = new Set((carte.stands || []).map(st => st.id))
  const menuArtiste = menu
    .filter(m => typeDe.has(m.id) && m.actif !== false && standIds.has(m.standId))
    .map(m => ({ ...m, typeConsommation: VERS_CONSO[typeDe.get(m.id)] }))
  const remain = { meal: remainMeals, drink: remainDrinks, eau: remainEaux }
  const totalAv = { meal: av.meals || 0, drink: av.drinks || 0, eau: av.eaux || 0 }
  const cartItems = Object.entries(qtys).filter(([, q]) => q > 0)
    .map(([id, qty]) => { const m = menuArtiste.find(x => x.id === id); return m ? { ...m, qty } : null }).filter(Boolean)
  const cartTotal = cartItems.reduce((a, i) => a + i.qty, 0)
  const codesEnAttente = codes.filter(c => c.statut === 'en_attente').length

  // QR de l'espace : le lien personnel (lu par la borne) ; à défaut de clé, l'ancien format (caisse)
  const cleLien = (() => {
    const k = params.get('k')
    if (k) return k.toLowerCase()
    try { return localStorage.getItem(`yllacash-lien-artiste-${eventId}-${creneauId}`) || '' } catch { return '' }
  })()
  const qrPayload = cleLien
    ? `${window.location.origin}/artiste?ev=${encodeURIComponent(eventId)}&cr=${encodeURIComponent(creneauId)}&k=${cleLien}`
    : JSON.stringify({ ev: eventId, cr: creneauId, type: 'artiste' })
  const artCode   = 'ART-' + creneauId.slice(-6).toUpperCase()

  const isAnnule = creneau.statut === 'annule'

  // Commander : un code à taper sur la borne (rien n'est décompté ici)
  const doCommande = async () => {
    if (!cartItems.length) return
    setResaLoading(true); setResaErr('')
    try {
      for (const t of ['meal', 'drink', 'eau']) {
        const n = cartItems.filter(i => DE_CONSO[i.typeConsommation] === t).reduce((a, i) => a + i.qty, 0)
        if (n > remain[t]) throw new Error(`Avantages insuffisants (il en reste ${remain[t]}).`)
      }
      const r = await creerCodeArtiste({
        creneauId, artisteNom: creneau.artiste || '',
        items: cartItems.map(i => ({ id: i.id, nom: i.nom, qty: i.qty, type: DE_CONSO[i.typeConsommation] })),
      }, eventId)
      setResaDone(r); setQtys({})
    } catch (e) { setResaErr(friendlyError(e, "La commande n'a pas été enregistrée.")) }
    finally { setResaLoading(false) }
  }

  // Anciennes réservations encore en attente : toujours annulables
  const handleCancelResa = async (resaId) => {
    try {
      await annulerReservationArtiste(resaId, eventId)
      toast.success('Réservation annulée')
    } catch (e) {
      toast.error(friendlyError(e, "La réservation n'a pas pu être annulée."), { action: { label: 'Réessayer', onClick: () => handleCancelResa(resaId) } })
    }
  }

  const NAV = [
    { id: 'droits',    label: 'Droits',    icon: Gift },
    { id: 'consos',    label: 'Consos',    icon: History },
    { id: 'commander', label: 'Commander', icon: ShoppingCart, badge: cartTotal },
    { id: 'codes',     label: 'Mes codes', icon: Bookmark,     badge: codesEnAttente + pendingResa.length },
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
            {/* Sécurité (20/11/2026) : la liaison à un compte spectateur par son code « FY-… » est retirée.
                Elle ouvrait ce compte sans sa clé. Chacun ouvre son espace avec son propre lien. */}
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
            <span><CalendarDays size={14} aria-hidden="true"/>{creneau._em ? dayLabel(creneau._jour) : fmtDate(creneau.debut)}</span>
            {creneau._em && !creneau.debut
              ? <span><Clock size={14} aria-hidden="true"/>Vous ne jouez pas ce jour-là</span>
              : <span><Clock size={14} aria-hidden="true"/>{fmtHour(creneau.debut)} → {fmtHour(creneau.fin)}</span>}
            {creneau.scene && <span><MapPin size={14} aria-hidden="true"/>{creneau.scene}</span>}
          </div>
        </section>

        {/* Balance : affichée seulement si l'admin l'a renseignée et qu'elle n'est pas terminée */}
        {creneau.balanceDebut && !balanceFinished && (
          <section className={s.balance}>
            <span className={s.bannerIcon}><Mic2 size={20} aria-hidden="true"/></span>
            <div className={s.bannerText}>
              <h2 className={s.overline}>Balance technique</h2>
              <div className={s.balanceTime}>
                <b>{fmtHour(creneau.balanceDebut)}{creneau.balanceFin && ` → ${fmtHour(creneau.balanceFin)}`}</b>
                {(creneau.balanceScene || creneau.scene) && (
                  <span><MapPin size={11} aria-hidden="true"/>{creneau.balanceScene || creneau.scene}</span>
                )}
              </div>
              <p>Vous serez prévenu(e) 15 et 5 min avant.</p>
            </div>
          </section>
        )}

        {/* Activation des notifications : indispensable pour les rappels balance et prestation */}
        {fcmStatus.state === 'default' && (
          <section className={s.notifAsk}>
            <span className={clsx(s.bannerIcon, s.bannerCoral)}><Bell size={20} aria-hidden="true"/></span>
            <div className={s.bannerText}>
              <b>Activez les notifications</b>
              <p>Pour recevoir vos rappels de balance et prestation, même app fermée.</p>
            </div>
            <Button variant="coral" size="sm" onClick={enableFCM}>Activer</Button>
          </section>
        )}

        {/* Bloqué (iOS hors PWA ou permission refusée) : on explique pourquoi */}
        {(fcmStatus.state === 'unsupported' || fcmStatus.state === 'denied') && (
          <div className={s.error} role="status">
            <BellOff size={16} aria-hidden="true"/>
            <span><b>Notifications indisponibles</b><br/>{fcmStatus.error}</span>
          </div>
        )}

        {fcmStatus.state === 'enrolled' && (
          <div className={s.notifOn} role="status">
            <Bell size={13} aria-hidden="true"/>
            <span><strong>Notifications activées</strong> · Vous recevrez vos rappels.</span>
          </div>
        )}

        {/* QR code (plein écran au toucher) */}
        <section className={clsx(s.card, s.qrCard)}>
          <h2 className={s.overline}>Présentez ce QR à la borne</h2>
          <button type="button" className={s.qrBtn} onClick={() => setShowQrFull(true)} aria-label="Agrandir mon QR code">
            <QRCodeCanvas value={qrPayload} size={140} fgColor="#003048" bgColor="#FFFFFF"/>
          </button>
          <span className={s.qrCode}>{artCode}</span>
          <span className={s.qrHint}><Maximize2 size={12} aria-hidden="true"/>Touchez le code pour l'agrandir</span>
        </section>

        {/* Contenu : animation entre les onglets */}
        <PageTransition pageKey={tab}>
        {tab === 'droits' && (
          <DroitsTab av={av}
            used={{ drink: consDrinks, meal: consMeals, eau: consEaux }}
            pending={{ drink: pendingDrinks, meal: pendingMeals, eau: pendingEaux }}/>
        )}
        {tab === 'consos' && <ConsosTab consumptions={consumptions}/>}
        {tab === 'commander' && (
          <BenevoleCommander menu={menuArtiste} categories={categories} carte={carte}
            cartItems={cartItems} qtys={qtys} setQtys={setQtys}
            resaDone={resaDone} setResaDone={setResaDone} resaLoading={resaLoading} resaErr={resaErr} doCommande={doCommande}
            quotaRestant={(t) => remain[DE_CONSO[t]] || 0} quotaDroit={(t) => totalAv[DE_CONSO[t]] || 0} setTab={setTab}
            textes={{
              droits: creneau._em ? "Mes avantages aujourd'hui" : 'Mes avantages',
              ticket: 'Elle imprime un ticket pour chaque stand où retirer vos articles.',
              decompte: 'Vos avantages ne sont décomptés qu\'à la borne. Annulable sans frais avant, depuis « Mes codes ».',
              ongletCodes: 'codes',
              epuise: 'Avantages atteints',
            }}/>
        )}
        {tab === 'codes' && (
          <>
            {codes.length === 0 && reservations.filter(r => r.statut === 'pending').length === 0 && (
              <Empty icon={Bookmark} title="Aucun code pour l'instant"
                action={<Button size="sm" variant="secondary" icon={ShoppingCart} onClick={() => setTab('commander')}>Commander</Button>}>
                Commandez vos avantages : vous recevrez un code à taper sur la borne.
              </Empty>
            )}
            <MesCodes codes={codes} onCancel={setCancelCode}/>
            {reservations.some(r => r.statut === 'pending') && (
              <ResasTab reservations={reservations.filter(r => r.statut === 'pending')} onCancel={setCancelAsk} onReserve={() => setTab('commander')}/>
            )}
          </>
        )}
        {tab === 'programme' && <ProgrammeTab planning={planning} creneauId={creneauId} artisteNom={creneau._em ? creneau.artiste : null}/>}
        </PageTransition>

        <footer className={s.footer}>
          <b>{APP_FULL_LABEL}</b>
          <span>Développée par Maison Ylla</span>
          <CheckUpdateButton variant="compact"/>
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

      {/* Confirmation d'annulation */}
      <Dialog open={!!cancelAsk} onClose={() => setCancelAsk(null)} title="Annuler cette réservation ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelAsk(null)}>Garder</Button>
          <Button variant="danger" onClick={() => { const id = cancelAsk; setCancelAsk(null); handleCancelResa(id) }}>Annuler la réservation</Button>
        </>}>
        <p className={s.muted}>Les articles réservés seront de nouveau disponibles dans vos avantages.</p>
      </Dialog>

      {/* Annulation d'un code pas encore utilisé */}
      <Dialog open={!!cancelCode} onClose={() => setCancelCode(null)} title="Annuler ce code ?"
        footer={<>
          <Button variant="secondary" onClick={() => setCancelCode(null)}>Garder</Button>
          <Button variant="danger" onClick={async () => {
            const c = cancelCode; setCancelCode(null)
            try { await annulerCodeEnLigne(c, eventId); toast.success('Code annulé') }
            catch (e) { toast.error(friendlyError(e, "Le code n'a pas pu être annulé.")) }
          }}>Annuler le code</Button>
        </>}>
        <p className={s.muted}>Rien n'a été décompté : vos avantages restent disponibles.</p>
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

      {/* Popup de rappel actif (balance/prestation), par-dessus tout */}
      <ArtistReminderPopup reminder={activeReminder} onAcknowledge={acknowledge}/>
    </div>
  )
}
