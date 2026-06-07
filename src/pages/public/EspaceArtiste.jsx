/**
 * pages/public/EspaceArtiste.jsx — v6 Lot C
 * Espace personnel artiste — URL : /artiste?ev=EVENT_ID&cr=CRENEAU_ID
 * Onglets : Droits, Consos, Réserver, Mes résas, Programme
 */
import React, { useState, useEffect, useMemo } from 'react'
import { db } from '../../firebase/config'
import { getSettings, creerReservationArtiste, annulerReservationArtiste, watchArtistReservations, linkArtistToSpec, unlinkArtistFromSpec } from '../../firebase/service'
import { doc, getDoc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { Clock, MapPin, Gift, History, CalendarDays, Bookmark, ShoppingCart, X, Plus, Minus, CheckCircle, AlertCircle, Link2, Wallet, Mic2, Bell, BellOff } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import ThemeToggle from '../../components/ThemeToggle'
import NotifBell from '../../components/NotifBell'
import ArtistReminderPopup from '../../components/ArtistReminderPopup'
import { useTheme } from '../../hooks/useTheme'
import { useNotifications } from '../../hooks/useNotifications'
import useArtistReminders from '../../hooks/useArtistReminders'
import useArtistFCM from '../../hooks/useArtistFCM'
import { APP_FULL_LABEL } from '../../utils/buildInfo'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import PageTransition from '../../components/PageTransition'

const BRAND = '#1a6b7a'

const TYPES = {
  musical:           { icon: '🎵', label: 'Musical',    color: '#1a6b7a' },
  litteraire:        { icon: '📚', label: 'Littéraire', color: '#534AB7' },
  cinematographique: { icon: '🎬', label: 'Cinéma',     color: '#BA7517' },
  autre:             { icon: '🎭', label: 'Autre',       color: '#6b6b6b' },
}

function fmtHour(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function fmtDateShort(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function EspaceArtiste() {
  const { theme } = useTheme()

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
  const [linkLoading, setLinkLoading] = useState(false)

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

  // Système de rappels JS (balance et prestation) pour l'artiste in-app
  // Ne se déclenche que quand l'app est ouverte. Pour les push système quand
  // l'app est fermée, voir /api/process-reminders.js + cron GitHub Actions.
  const { activeReminder, acknowledge } = useArtistReminders(creneau ? { ...creneau, id: creneauId } : null)

  // Enregistrement FCM artiste : permet au cron serveur d'envoyer des push
  // même quand l'app est fermée. Token stocké sur le créneau planning.
  const { status: fcmStatus, enable: enableFCM } = useArtistFCM({ eventId, creneauId })

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
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui', background:'var(--bg2)', color:'var(--muted)' }}>
        Chargement…
      </div>
    )
  }

  if (!eventId || !creneauId || notFound) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui', background:'var(--bg2)', color:'var(--muted)', flexDirection:'column', gap:12, padding:20, textAlign:'center' }}>
        <div style={{ fontSize:40 }}>🎤</div>
        <div style={{ fontSize:16, fontWeight:600 }}>Espace artiste introuvable</div>
        <div style={{ fontSize:13 }}>URL attendue : <code>/artiste?ev=EVENT_ID&cr=CRENEAU_ID</code></div>
      </div>
    )
  }

  const ti = TYPES[creneau.type] || TYPES.autre
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
      setCart({})
      setTimeout(() => setResaSuccess(''), 4000)
      setTab('resas')
    } catch (e) {
      setResaErr('Erreur : ' + e.message)
    }
  }

  const handleCancelResa = async (resaId) => {
    if (!confirm('Annuler cette réservation ?')) return
    try {
      await annulerReservationArtiste(resaId, eventId)
    } catch (e) {
      alert('Erreur : ' + e.message)
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
    if (!v) { setLinkErr('Veuillez saisir votre numéro spectateur'); return }
    setLinkLoading(true); setLinkErr('')
    try {
      await linkArtistToSpec(creneauId, v, eventId)
      setShowLinkModal(false)
      setLinkInput('')
    } catch (e) {
      setLinkErr(e.message || 'Erreur de liaison')
    } finally {
      setLinkLoading(false)
    }
  }

  const handleUnlinkSpec = async () => {
    if (!window.confirm('Délier votre compte spectateur ?')) return
    try {
      await unlinkArtistFromSpec(creneauId, eventId)
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  const goToSpectateurSpace = () => {
    if (!creneau.linkedSpecId) return
    const url = '/solde?id=' + creneau.linkedSpecId + (eventId ? '&ev=' + eventId : '') + '&from=artiste&cr=' + creneauId
    window.location.href = url
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg2)', fontFamily:'var(--font)' }}>
      {/* Header dégradé Maison Ylla */}
      <div style={{ background:'var(--grad-signature)', padding:'14px 20px 48px', color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', maxWidth:640, margin:'0 auto', gap:10 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'rgba(255,255,255,.20)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {eventMeta?.logoSrc
              ? <img src={eventMeta.logoSrc} alt={eventMeta.nom || ''} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <span style={{ fontSize:20 }}>🎤</span>
            }
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:16, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eventMeta?.nom || 'YllaCash'}</div>
            <div style={{ fontSize:11, opacity:.8 }}>Espace artiste</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:'-28px auto 0', padding:'0 14px 40px', position:'relative', zIndex:1 }}>
        {/* Carte artiste */}
        <div style={{ background:'var(--bg)', borderRadius:'var(--radius-xl)', padding:'16px', boxShadow:'0 6px 20px rgba(0,48,72,.10)', marginBottom:14, opacity: isAnnule ? 0.7 : 1, border:'0.5px solid var(--border)' }}>
          {isAnnule && (
            <div className="alert alert-error" style={{ marginBottom:12, textAlign:'center' }}>
              ❌ Ce créneau a été annulé
            </div>
          )}
          <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
            <div style={{ width:64, height:64, borderRadius:14, overflow:'hidden', flexShrink:0, background: ti.color + '22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30 }}>
              {creneau.photo
                ? <img src={creneau.photo} alt={creneau.artiste} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: creneau.photoPosition || 'center center' }}/>
                : ti.icon
              }
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{creneau.artiste}</div>
              {creneau.titre && <div style={{ fontSize:13, color:'var(--muted)' }}>{creneau.titre}</div>}
              <div style={{ fontSize:12, color: ti.color, fontWeight:700, marginTop:2 }}>{ti.icon} {ti.label}</div>
            </div>
            {/* Switch spectateur + Cloche + Thème (colonne droite, comme bénévole) */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flexShrink:0 }}>
              {creneau.linkedSpecId ? (
                <button onClick={goToSpectateurSpace}
                  title={"Aller à mon espace spectateur (" + creneau.linkedSpecId + ")"}
                  style={{ width:44, height:44, borderRadius:10, border:'none', background:'var(--brand)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor: 'transparent' }}>
                  <Wallet size={20}/>
                </button>
              ) : (
                <button onClick={() => { setLinkInput(''); setLinkErr(''); setShowLinkModal(true) }}
                  title="Lier mon compte spectateur"
                  style={{ width:44, height:44, borderRadius:10, border:'1px dashed var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', WebkitTapHighlightColor: 'transparent' }}>
                  <Link2 size={20}/>
                </button>
              )}
              <NotifBell notifications={notifications} nonLuCount={nonLuCount} onMarkAllRead={marquerToutLu}/>
              <ThemeToggle/>
            </div>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:12, color:'var(--muted)' }}>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}><CalendarDays size={12}/> {fmtDate(creneau.debut)}</span>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}><Clock size={12}/> {fmtHour(creneau.debut)} → {fmtHour(creneau.fin)}</span>
            {creneau.scene && <span style={{ display:'flex', alignItems:'center', gap:4 }}><MapPin size={12}/> {creneau.scene}</span>}
          </div>
        </div>

        {/* Balance — affichée uniquement si l'admin l'a renseignée ET pas encore terminée */}
        {creneau.balanceDebut && !balanceFinished && (
          <div style={{
            background: 'linear-gradient(135deg, var(--brand-light) 0%, #FCF1DC 100%)',
            border: '1px solid var(--brand)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              flexShrink: 0,
              width: 40, height: 40,
              borderRadius: 10,
              background: 'var(--brand)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Mic2 size={20}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-dark)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>
                Balance technique
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  {fmtHour(creneau.balanceDebut)}
                  {creneau.balanceFin && ` → ${fmtHour(creneau.balanceFin)}`}
                </span>
                {(creneau.balanceScene || creneau.scene) && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <MapPin size={11}/> {creneau.balanceScene || creneau.scene}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                Vous serez prévenu(e) 15 et 5 min avant.
              </div>
            </div>
          </div>
        )}

        {/* Bannière "Activer les notifications" — visible si pas encore activé.
            Indispensable pour recevoir les rappels balance/prestation. */}
        {fcmStatus.state === 'default' && (
          <div style={{
            background: 'linear-gradient(135deg, #FCF1DC 0%, #FEEEE7 100%)',
            border: '1.5px solid var(--coral)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              flexShrink: 0,
              width: 40, height: 40,
              borderRadius: 10,
              background: 'var(--coral)',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={20}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                Activez les notifications
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.35 }}>
                Pour recevoir vos rappels de balance et prestation, même app fermée.
              </div>
            </div>
            <button onClick={enableFCM}
              style={{
                flexShrink: 0,
                padding: '10px 14px',
                background: 'var(--coral)',
                color: '#fff', border: 'none',
                borderRadius: 8,
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                minHeight: 38,
                WebkitTapHighlightColor: 'transparent',
              }}>
              Activer
            </button>
          </div>
        )}

        {/* Si bloqué par iOS non-PWA ou denied → message d'explication */}
        {(fcmStatus.state === 'unsupported' || fcmStatus.state === 'denied') && (
          <div style={{
            background: 'var(--red-light)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <BellOff size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red-dark)', marginBottom: 3 }}>
                Notifications indisponibles
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.4 }}>
                {fcmStatus.error}
              </div>
            </div>
          </div>
        )}

        {/* Badge discret "Notifications activées" pour rassurer l'artiste */}
        {fcmStatus.state === 'enrolled' && (
          <div style={{
            background: 'var(--green-light)',
            border: '1px solid var(--green)',
            borderRadius: 'var(--radius)',
            padding: '8px 12px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11, color: 'var(--green-dark)',
          }}>
            <Bell size={13}/>
            <strong>Notifications activées</strong> · Vous recevrez vos rappels.
          </div>
        )}

        {/* QR code (cliquable plein écran) */}
        <div style={{ background:'var(--bg)', borderRadius:'var(--radius-xl)', padding:'16px', marginBottom:14, textAlign:'center', boxShadow:'0 4px 16px rgba(0,48,72,.06)', border:'0.5px solid var(--border)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.05em' }}>Présentez ce code au stand</div>
          <div onClick={() => setShowQrFull(true)}
            style={{ display:'inline-block', background:'#FFF8F2', padding:12, borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', cursor:'pointer', transition:'transform .15s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            title="Cliquer pour agrandir">
            <QRCodeCanvas value={qrPayload} size={140} fgColor="#003048" bgColor="#FFF8F2"/>
          </div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:8, fontFamily:'monospace' }}>
            ART-{creneauId.slice(-6).toUpperCase()} · <span style={{ color:'var(--brand)', fontWeight:700 }}>👆 Toucher pour agrandir</span>
          </div>
        </div>

        {/* Modale liaison compte spectateur */}
        {showLinkModal && (
          <div onClick={(e) => e.target === e.currentTarget && setShowLinkModal(false)}
            style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div style={{ background:'var(--bg)', borderRadius:18, padding:24, width:'100%', maxWidth:420, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>🔗 Lier mon compte spectateur</div>
                <button onClick={() => setShowLinkModal(false)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}>
                  <X size={18}/>
                </button>
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18, lineHeight:1.5 }}>
                Saisissez votre numéro unique spectateur (présent sur votre QR personnel, ex. <code style={{ background:'var(--bg2)', padding:'1px 6px', borderRadius:4 }}>FY-4A2B</code>) pour pouvoir basculer entre votre espace artiste et votre espace spectateur.
              </div>

              <label style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', display:'block', marginBottom:6 }}>Numéro spectateur</label>
              <input type="text" value={linkInput}
                onChange={(e) => setLinkInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleLinkSpec()}
                placeholder="FY-XXXX"
                autoFocus
                style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:10, fontSize:15, fontFamily:'monospace', textTransform:'uppercase', color:'var(--text)', background:'var(--bg2)', outline:'none', marginBottom:10 }}/>

              {linkErr && (
                <div style={{ padding:'8px 12px', background:'#FCEBEB', color:'#A32D2D', borderRadius:8, fontSize:12, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                  <AlertCircle size={13}/> {linkErr}
                </div>
              )}

              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                <button onClick={() => setShowLinkModal(false)}
                  style={{ flex:1, padding:'11px', background:'var(--bg2)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                  Annuler
                </button>
                <button onClick={handleLinkSpec} disabled={linkLoading}
                  style={{ flex:1, padding:'11px', background:'var(--brand)', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor: linkLoading ? 'wait' : 'pointer', fontFamily:'var(--font)' }}>
                  {linkLoading ? 'Vérification…' : '🔗 Lier mon compte'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modale QR plein écran */}
        {showQrFull && (
          <div onClick={() => setShowQrFull(false)}
            style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.92)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'20px' }}>
            <div style={{ position:'absolute', top:20, right:20, color:'#fff', fontSize:32, fontWeight:300, cursor:'pointer', width:48, height:48, borderRadius:'50%', background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              ✕
            </div>
            <div style={{ background:'#fff', padding:24, borderRadius:20, boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
              <QRCodeCanvas value={qrPayload} size={Math.min(window.innerWidth - 100, 380)} fgColor="#000" bgColor="#fff" level="H"/>
            </div>
            <div style={{ color:'#fff', marginTop:24, fontSize:18, fontWeight:700, textAlign:'center' }}>{creneau.artiste}</div>
            <div style={{ color:'rgba(255,255,255,.7)', marginTop:6, fontSize:14, textAlign:'center' }}>
              ART-{creneauId.slice(-6).toUpperCase()}
            </div>
            <div style={{ color:'rgba(255,255,255,.5)', marginTop:16, fontSize:12, textAlign:'center' }}>
              Toucher l'écran pour fermer
            </div>
          </div>
        )}

        {/* Onglets — grid 5 colonnes, rectangulaires */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:4, marginBottom:12, background:'var(--bg)', borderRadius:'var(--radius-md)', padding:4, border:'1px solid var(--border)' }}>
          {[
            { id:'droits',   icon:<Gift size={18}/>,           label:'Droits' },
            { id:'consos',   icon:<History size={18}/>,        label:'Consos' },
            { id:'reserver', icon:<ShoppingCart size={18}/>,   label:'Réserver', badge: cartTotal > 0 ? cartTotal : null },
            { id:'resas',    icon:<Bookmark size={18}/>,       label:'Mes résa', badge: pendingResa.length > 0 ? pendingResa.length : null },
            { id:'programme', icon:<CalendarDays size={18}/>,  label:'Programme' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ minWidth:0, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer', background: tab===t.id ? 'var(--brand)' : 'transparent', color: tab===t.id ? (theme.isDark ? '#002438' : '#fff') : 'var(--muted)', fontSize:10, fontWeight:700, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, fontFamily:'var(--font)', position:'relative' }}>
              <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {t.icon}
                {t.badge && (
                  <span style={{ position:'absolute', top:-6, right:-10, minWidth:16, height:16, padding:'0 4px', borderRadius:4, background: tab===t.id ? (theme.isDark ? '#002438' : '#fff') : 'var(--coral)', color: tab===t.id ? 'var(--brand)' : (theme.isDark ? '#2A1810' : '#fff'), fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {t.badge}
                  </span>
                )}
              </div>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Contenu — animation entre les onglets */}
        <PageTransition pageKey={tab}>

        {/* Mes droits */}
        {tab === 'droits' && (
          <div style={{ background:'var(--bg)', borderRadius:14, padding:'16px', boxShadow:'0 4px 16px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>🎁 Vos avantages aujourd'hui</div>
            {av.drinks === 0 && av.meals === 0 && av.eaux === 0 ? (
              <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>
                Aucun avantage configuré pour votre créneau.
              </div>
            ) : (
              <>
                <DroitBar icon="☕" label="Boissons" total={av.drinks || 0} used={consDrinks} pending={pendingDrinks} themeColor={themeColor}/>
                <DroitBar icon="🍽" label="Repas"    total={av.meals  || 0} used={consMeals}  pending={pendingMeals}  themeColor={themeColor}/>
                <DroitBar icon="💧" label="Eau"      total={av.eaux   || 0} used={consEaux}   pending={pendingEaux}   themeColor={themeColor}/>
              </>
            )}
          </div>
        )}

        {/* Consos */}
        {tab === 'consos' && (
          <div style={{ background:'var(--bg)', borderRadius:14, padding:'16px', boxShadow:'0 4px 16px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>📋 Historique de vos consommations</div>
            {consumptions.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>
                Aucune consommation enregistrée pour le moment.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {consumptions.map(c => {
                  const t = c.type === 'drink' ? '☕' : c.type === 'meal' ? '🍽' : '💧'
                  return (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg2)', borderRadius:10 }}>
                      <span style={{ fontSize:22 }}>{t}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{c.articleNom || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {fmtHour(c.servedAt)} {c.servedBy?.name && '· par ' + c.servedBy.name}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Réserver */}
        {tab === 'reserver' && (
          <div style={{ background:'var(--bg)', borderRadius:14, padding:'16px', boxShadow:'0 4px 16px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6 }}>🍽 Réserver vos avantages</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>
              Préparez votre commande à l'avance. Les caissiers seront notifiés et pourront vous servir directement à votre arrivée.
            </div>

            {resaErr && (
              <div style={{ padding:'8px 12px', background:'#FCEBEB', color:'#A32D2D', borderRadius:8, fontSize:12, marginBottom:10 }}>
                <AlertCircle size={12} style={{ verticalAlign:-1, marginRight:4 }}/>{resaErr}
              </div>
            )}
            {resaSuccess && (
              <div style={{ padding:'8px 12px', background:'#d1fae5', color:'#065f46', borderRadius:8, fontSize:12, marginBottom:10 }}>
                <CheckCircle size={12} style={{ verticalAlign:-1, marginRight:4 }}/>{resaSuccess}
              </div>
            )}

            {eligibleArticles.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>
                {av.drinks + av.meals + av.eaux === 0
                  ? 'Aucun avantage à réserver.'
                  : 'Tous vos avantages ont été utilisés ou réservés ✓'}
              </div>
            ) : (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:10, marginBottom:14 }}>
                  {eligibleArticles.map(a => {
                    const key = a.id + '-' + a._type
                    const qty = cart[key] || 0
                    return (
                      <div key={key} style={{ background:'var(--bg2)', border: '1.5px solid ' + (qty > 0 ? themeColor : 'var(--border)'), borderRadius:12, padding:10, textAlign:'center' }}>
                        <div style={{ fontSize:22, marginBottom:4 }}>{a._typeIcon}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.nom}</div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                          <button onClick={() => removeFromCart(a)} disabled={qty === 0}
                            style={{ width:26, height:26, borderRadius:6, border:'none', cursor: qty > 0 ? 'pointer' : 'not-allowed', background: qty > 0 ? 'var(--bg)' : 'var(--bg2)', color:'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Minus size={12}/>
                          </button>
                          <span style={{ fontSize:13, fontWeight:800, color:'var(--text)', minWidth:16, textAlign:'center' }}>{qty}</span>
                          <button onClick={() => addToCart(a)}
                            style={{ width:26, height:26, borderRadius:6, border:'none', cursor:'pointer', background: themeColor, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Plus size={12}/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {cartTotal > 0 && (
                  <button onClick={handleReserve}
                    style={{ width:'100%', padding:'12px 16px', background: themeColor, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'system-ui', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <ShoppingCart size={14}/> Confirmer la réservation ({cartTotal} article{cartTotal > 1 ? 's' : ''})
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Mes résas */}
        {tab === 'resas' && (
          <div style={{ background:'var(--bg)', borderRadius:14, padding:'16px', boxShadow:'0 4px 16px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>🔖 Mes réservations</div>
            {reservations.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>
                Aucune réservation pour le moment.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {reservations.map(r => {
                  const itemsLabel = (r.items || []).map(i => {
                    const ic = i.type === 'drink' ? '☕' : i.type === 'meal' ? '🍽' : '💧'
                    return ic + ' ' + i.nom
                  }).join(', ')
                  const statutColor = r.statut === 'pending' ? '#854F0B' : r.statut === 'servie' ? '#065f46' : '#A32D2D'
                  const statutBg    = r.statut === 'pending' ? '#FAEEDA' : r.statut === 'servie' ? '#d1fae5' : '#FCEBEB'
                  const statutLabel = r.statut === 'pending' ? '⏱ En attente' : r.statut === 'servie' ? '✓ Servie' : '✕ Annulée'
                  return (
                    <div key={r.id} style={{ padding:'10px 12px', background:'var(--bg2)', borderRadius:10, border:'0.5px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:6, background: statutBg, color: statutColor }}>
                          {statutLabel}
                        </span>
                        {r.statut === 'pending' && (
                          <button onClick={() => handleCancelResa(r.id)}
                            style={{ fontSize:11, padding:'4px 8px', border:'0.5px solid var(--border)', background:'var(--bg)', color:'var(--muted)', borderRadius:6, cursor:'pointer', fontFamily:'var(--font)' }}>
                            Annuler
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize:13, color:'var(--text)' }}>{itemsLabel}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                        {r.servedAt ? 'Servie à ' + fmtHour(r.servedAt) : r.createdAt ? 'Demandée à ' + fmtHour(r.createdAt) : ''}
                        {r.servedBy?.name && ' · par ' + r.servedBy.name}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Programme */}
        {tab === 'programme' && (
          <div style={{ background:'var(--bg)', borderRadius:14, padding:'16px', boxShadow:'0 4px 16px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14 }}>📅 Programme festival</div>
            {planning.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center', padding:'20px 0' }}>
                Programme à venir.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[...planning].sort((a, b) => {
                  const ta = a.debut?.toMillis ? a.debut.toMillis() : new Date(a.debut || 0).getTime()
                  const tb = b.debut?.toMillis ? b.debut.toMillis() : new Date(b.debut || 0).getTime()
                  return ta - tb
                }).map(p => {
                  const pt = TYPES[p.type] || TYPES.autre
                  const isMe = p.id === creneauId
                  const isAnnulePrg = p.statut === 'annule'
                  return (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background: isMe ? pt.color + '22' : 'var(--bg2)', borderRadius:10, border: isMe ? '1.5px solid ' + pt.color : '0.5px solid var(--border)', opacity: isAnnulePrg ? 0.5 : 1 }}>
                      <div style={{ fontSize:22, flexShrink:0 }}>{pt.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.artiste}</span>
                          {isMe && (
                            <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:4, background: pt.color, color:'#fff' }}>VOUS</span>
                          )}
                          {isAnnulePrg && (
                            <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:4, background:'#A32D2D', color:'#fff' }}>ANNULÉ</span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', display:'flex', flexWrap:'wrap', gap:6 }}>
                          <span>{fmtDateShort(p.debut)}</span>
                          <span>· {fmtHour(p.debut)} → {fmtHour(p.fin)}</span>
                          {p.scene && <span>· {p.scene}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        </PageTransition>

        {/* Footer */}
        <div style={{ textAlign:'center', padding:'28px 0 0', marginTop:20, borderTop:'0.5px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>{APP_FULL_LABEL}</div>
          <div style={{ fontSize:10, color:'var(--muted)', opacity:.6, marginTop:2 }}>Développée par <strong>Maison Ylla</strong></div>
          <div style={{ marginTop: 8 }}>
            <CheckUpdateButton variant="compact"/>
          </div>
        </div>
      </div>

      {/* Popup de rappel actif (balance/prestation) — affiché par-dessus tout */}
      <ArtistReminderPopup reminder={activeReminder} onAcknowledge={acknowledge}/>
    </div>
  )
}

function DroitBar({ icon, label, total, used, pending = 0, themeColor }) {
  const remain = Math.max(0, total - used - pending)
  const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const pendingPct = total > 0 ? Math.min(100 - usedPct, (pending / total) * 100) : 0
  const allConsumed = total > 0 && remain === 0

  if (total === 0) {
    return (
      <div style={{ marginBottom:10, opacity:.5 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}>{icon} {label}</span>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Non offert</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{icon} {label}</span>
        <span style={{ fontSize:12, fontWeight:700, color: allConsumed ? '#A32D2D' : themeColor }}>
          {remain}/{total}
          {pending > 0 && <span style={{ fontSize:10, color:'#854F0B', marginLeft:6 }}>({pending} en attente)</span>}
          {allConsumed && ' · Tout utilisé ✓'}
        </span>
      </div>
      <div style={{ height:8, background:'var(--bg2)', borderRadius:4, overflow:'hidden', display:'flex' }}>
        <div style={{ width:usedPct + '%', height:'100%', background: themeColor, transition:'width .3s' }}/>
        <div style={{ width:pendingPct + '%', height:'100%', background: '#854F0B', opacity:.5, transition:'width .3s' }}/>
      </div>
    </div>
  )
}
