/**
 * Borne.jsx — Borne self-service pour spectateurs au stand
 *
 * Page publique sans login, conçue pour fonctionner sur tablette
 * en mode kiosque devant l'entrée d'un stand. Le spectateur scanne
 * son QR ou saisit son ID pour passer commande de manière autonome.
 *
 * Accès : /borne?ev=<eventId> (une borne pour tous les stands : un ticket par stand)
 *
 * Lot 1 (cette livraison) :
 *   - Écran 1 : accueil "Toucher pour commencer"
 *   - Écran 2 : identification QR + saisie manuelle
 *   - Lecteur de QR branché (USB/Bluetooth, mode clavier) : voir utils/scanWedge
 *   - Validation du spectateur depuis Firestore
 *
 * Lots suivants (à venir) :
 *   - Écran 3 : menu avec ajout au panier + compteur inactivité
 *   - Écran 4 : confirmation panier avec décompte solde
 *   - Écran 5 : ticket de fin + auto-retour
 *
 * SÉCURITÉ — points clés :
 *   - Aucune session persistante (pas de localStorage de l'identité du
 *     spectateur). Tout l'état d'identification est uniquement dans React.
 *   - Auto-retour à l'accueil après chaque commande ou inactivité.
 *   - Pas d'historique, pas d'infos personnelles affichées.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { ArrowLeft, RefreshCw, Plus, Minus, ShoppingCart, Clock, X, Maximize2, ScanLine, KeyRound, Delete, Printer, Lock, Watch } from 'lucide-react'
import useKioskMode from '../../hooks/useKioskMode'
import ArticleInfoModal from '../../components/ArticleInfoModal'
import { createWedge } from '../../utils/scanWedge'
import { SPEC_CODE } from '../../utils/specCode'
import { setCurrentEvent, watchMenu, createCommande, getSettings, lireCode, utiliserCode } from '../../firebase/service'
import { db } from '../../firebase/config'
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore'
import { watchCarte } from '../../menu/carte'
import { organiserCarte, ticketsParStand } from '../../menu/organiser'
import { etapeDeArticle, prochaineSuggestion, categorieSuggeree } from '../../menu/etapes'
import { getIcon } from '../../menu/icons'
import { parseBenevoleQr, parseArtisteQr } from '../../utils/benevoleQr'
import { parseSecours } from '../../utils/qrTournant'
import { ticketsDeCommande } from '../../utils/escpos'
import { useImpressionTickets } from '../../hooks/useImpression'
import { BoutonImprimante, Progression } from './borne/BorneImprimante'
import { apiFetch } from '../../firebase/session'

// Ancien QR de l'espace bénévole ou artiste (lien personnel avec sa clé) : plus accepté (23/11/2026)
const QR_IMPRIME_REFUSE = "Ce QR imprimé n'est plus accepté. Ouvrez votre espace sur votre téléphone et présentez le QR qui change toutes les 30 secondes."

// ─── Étapes du flux ─────────────────────────────────────────────────────
// Codé en const pour pouvoir étendre facilement (lots suivants : 'menu',
// 'panier', 'ticket').
const STEP = {
  ACCUEIL:        'accueil',
  IDENTIFICATION: 'identification',
  // Étapes à venir :
  MENU:           'menu',
  PANIER:         'panier',
  TICKET:         'ticket',
  // Code à 6 chiffres remis par la billetterie (commande déjà payée)
  CODE:           'code',
  // Bracelet de secours (écran 3, 24/11/2026) : bracelet lu, code à 4 chiffres
  BRACELET:       'bracelet',
  // Commande passée en ligne pour ce bracelet (« Pour qui ? », 28/11/2026) : retrait sans code
  RETRAIT:        'retrait',
}

// ─── Helpers couleur ────────────────────────────────────────────────────
// La couleur de marque vient de settings.brandColor (hexadécimal, ex: #009090).
// On dérive automatiquement les variantes :
//   - bgDark : fond très sombre pour l'accueil et l'écran public
//   - bgLight : fond plus clair pour le menu (pas de fatigue visuelle)
//   - textOnBrand : noir ou blanc selon la luminance
//   - btnPrimary : couleur d'accent (= brandColor par défaut)
// Tout est calculé pour qu'une couleur claire ou foncée donne un résultat
// lisible dans les deux cas.

const hex2rgb = (hex) => {
  const h = (hex || '#003048').replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  const n = parseInt(full, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb2hex = ([r, g, b]) => {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}
// Mélange une couleur avec du noir (factor 0 = pure, 1 = noir total)
const darken = (hex, factor) => {
  const [r, g, b] = hex2rgb(hex)
  return rgb2hex([r * (1 - factor), g * (1 - factor), b * (1 - factor)])
}
// Mélange une couleur avec du blanc (factor 0 = pure, 1 = blanc total)
const lighten = (hex, factor) => {
  const [r, g, b] = hex2rgb(hex)
  return rgb2hex([r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor])
}
// Retourne #fff ou #000 selon la luminance perçue de la couleur d'arrière-plan.
// Utilise la formule WCAG simplifiée. Permet le contraste optimal du texte.
const textOnBg = (hex) => {
  const [r, g, b] = hex2rgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#000' : '#fff'
}

// Construit une palette à partir d'une brandColor unique.
// brandColor peut être null/undefined → on tombe sur les défauts Maison Ylla.
const buildPalette = (brandColor) => {
  const brand = brandColor || '#06222F'   // bleu nuit du nouveau style ; la couleur de l'événement reste prioritaire
  return {
    brand,                             // couleur principale (ex: bouton)
    brandDark:   darken(brand, 0.4),   // fond très sombre (accueil)
    brandDarker: darken(brand, 0.7),   // fond ultra sombre (haut du gradient)
    brandLight:  lighten(brand, 0.4),  // fond clair pour highlights
    brandLighter: lighten(brand, 0.92),// presque blanc, teint léger
    textOnBrand: textOnBg(brand),
    // Alias historiques (le code existant utilise ces noms partout) :
    // - marine : couleur principale d'accent dans l'UI (= brand)
    // - tealDark : variante sombre (= brandDark)
    // - teal : couleur secondaire (= brand pour simplifier, sinon variante plus claire)
    marine:      brand,
    teal:        brandColor ? brand : '#008A8A',   // vert d'eau par défaut
    tealDark:    darken(brand, 0.2),
    coral:       '#008A8A',            // bouton principal : vert d'eau du nouveau style (20/11/2026)            // accent CTA (gardé fixe, complémentaire)
    bg:          '#F6F1EA',            // fond crème
    text:        '#03263A',
    muted:       '#4F687C',
    border:      'rgba(0,48,72,0.14)',
    green:       '#0E8D6E',
    red:         '#C8322B',
  }
}

// COLORS : palette par défaut (Maison Ylla, marine #003048).
// Sera MUTÉE dynamiquement à l'init avec la palette du festival
// chargée depuis settings.brandColor (cf. useEffect du composant Borne).
// Tous les composants enfants référencent COLORS.x sans prop drilling.
const COLORS = buildPalette(null)

// ─── Sécurité : timers d'inactivité (Lot 2) ─────────────────────────────
// Sur les écrans MENU et PANIER, on surveille l'inactivité tactile pour
// éviter qu'une session reste ouverte si le spectateur s'éloigne.
//   - WARN_AT  : à 50 s, on affiche une modale "Vous êtes toujours là ?"
//   - LOGOUT_AT: à 60 s, on retourne à l'accueil sans valider
// Tout tap/click n'importe où réinitialise le compteur (cf. activityListener).
const IDLE_WARN_SEC = 50
const IDLE_LOGOUT_SEC = 60

export default function Borne() {
  // Étape courante du flux. Stockée uniquement en mémoire React (jamais
  // persistée) pour garantir qu'un reload ramène toujours à l'accueil.
  const [step, setStep] = useState(STEP.ACCUEIL)
  // Spectateur identifié — null tant qu'on n'a pas validé un QR/ID
  const [spec, setSpec] = useState(null)
  // Panier {[itemId]: qty}. Aussi en mémoire React uniquement. Sera reset
  // à la fin de la session (auto-déco, validation, ou retour manuel).
  const [cart, setCart] = useState({})
  // Résa créée après validation (pour affichage du ticket — Lot 4)
  const [lastResa, setLastResa] = useState(null)
  // État erreur affiché en surimpression (sur écran d'identification)
  const [error, setError] = useState('')
  // Indique qu'on est en train de chercher le spectateur dans Firestore
  const [loading, setLoading] = useState(false)
  // Indique si l'eventId est valide pour cet appareil
  const [eventReady, setEventReady] = useState(false)
  // ─── Branding dynamique (logo + palette) chargés depuis settings ─────
  // Palette par défaut au montage, remplacée dès que les settings sont chargés.
  // Le rerender propage automatiquement aux composants enfants via les props.
  const [palette, setPalette] = useState(() => buildPalette(null))
  const [logoUrl, setLogoUrl] = useState('')
  const [festNom, setFestNom] = useState('')   // en-tête des tickets papier
  // Rayons, stands (settings/carte) et catégories de l'organisateur, lus en direct
  const [carte, setCarte] = useState({ rayons: [], stands: [] })
  const [categories, setCategories] = useState([])

  // ─── Session de la borne perdue (20/11/2026) ──────────────────────────
  // Quand un administrateur renouvelle le lien de la borne, la session de cette tablette est
  // révoquée : ses lectures protégées sont alors refusées par la base. On retient ce refus
  // (jamais une panne de réseau, jamais une lecture publique) pour afficher l'écran
  // « Borne momentanément indisponible » au lieu d'une carte vide.
  const [sessionPerdue, setSessionPerdue] = useState(false)
  // Une validation est en cours dans l'écran affiché (panier ou code) : signalée par cet écran
  const [validationEnfant, setValidationEnfant] = useState(false)
  const signalerErreurLecture = useCallback((e) => {
    if (e?.code === 'permission-denied' || e?.code === 'unauthenticated') setSessionPerdue(true)
  }, [])

  // ─── Initialisation : lecture des params URL ──────────────────────────
  // On lit l'eventId depuis l'URL et on l'installe dans le store/localStorage
  // pour que les appels service.js fonctionnent (getEventId() les utilise).
  // Puis on charge les settings pour récupérer logo + couleur du festival.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ev = params.get('ev')
    if (!ev) {
      setError('Cette borne n\'est pas configurée. Paramètre ?ev=<eventId> manquant dans l\'URL.')
      return
    }
    // Installe l'eventId dans le store pour que getEventId() le retourne
    setCurrentEvent(ev)
    setEventReady(true)
    // Charge le branding (logo + couleur de marque) depuis settings.
    // Best-effort : si erreur, on garde les défauts Maison Ylla.
    getSettings(ev).then(s => {
      if (s?.brandColor) {
        const newPalette = buildPalette(s.brandColor)
        setPalette(newPalette)
        // Mutation de l'objet COLORS pour que tous les composants existants
        // qui référencent COLORS.x voient les nouvelles valeurs au prochain render.
        // Hack pragmatique car le fichier référence COLORS.x partout.
        Object.assign(COLORS, newPalette)
      }
      if (s?.logoDataUrl) setLogoUrl(s.logoDataUrl)
    }).catch(e => console.warn('Borne settings:', e.message))
    getDoc(doc(db, 'events', ev)).then(d => setFestNom(d.data()?.nom || '')).catch(() => {})
  }, [])

  useEffect(() => {
    if (!eventReady) return
    const ev = new URLSearchParams(window.location.search).get('ev')
    const offCarte = watchCarte(ev, setCarte, e => console.warn('Borne carte:', e.message))
    const offCats = onSnapshot(collection(db, 'events', ev, 'categories'),
      snap => setCategories(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      // Lecture réservée à la session de la borne : un refus signale la session perdue (20/11/2026)
      e => { console.warn('Borne catégories:', e.message); signalerErreurLecture(e) })
    return () => { offCarte(); offCats() }
  }, [eventReady, signalerErreurLecture])

  // ─── Ouverture d'un compte spectateur (20/11/2026) ─────────────────────
  // On ne paie plus avec le code « FY-… » : le serveur vérifie le QR tournant de l'espace (ou le
  // code de secours si « Scanner en panne » est activé), puis autorise la borne sur ce seul compte.
  const [scannerEnPanne, setScannerEnPanne] = useState(false)
  useEffect(() => {
    if (!eventReady) return
    const ev = new URLSearchParams(window.location.search).get('ev')
    return onSnapshot(doc(db, 'events', ev, 'settings', 'global'),
      snap => setScannerEnPanne(snap.data()?.scannerEnPanne === true), () => {})
  }, [eventReady])

  // preuve : { qr: jeton } ou { secours: 'KT-4821' }
  const validateSpec = useCallback(async (preuve) => {
    if (!preuve) return
    setError('')
    setLoading(true)
    try {
      const ev = new URLSearchParams(window.location.search).get('ev')
      const r = await apiFetch('/api/qr', { body: { action: 'identifier', ev, ...preuve } })
      const snap = await getDoc(doc(db, 'events', ev, 'spectateurs', r.compte.docId))
      if (!snap.exists()) { setError('Compte introuvable. Demandez à la billetterie.'); return }
      setSpec({ ...snap.data(), _docId: snap.id })
      setStep(STEP.MENU)
    } catch (e) {
      console.error('Borne validateSpec:', e)
      setError(e.status ? e.message : 'Erreur de connexion. Réessayez dans un instant.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Bracelet de secours (écran 3, 24/11/2026, maquette LKRMfBEdABCNBHPPcPfcPB) ───
  // Téléphone déchargé : le bracelet présenté au lecteur identifie le compte, le code à 4 chiffres
  // autorise le paiement. Le serveur vérifie le code et compte les essais (3 faux : bloqué) ; un bon
  // code ouvre le compte 10 minutes, comme le QR de l'espace. Le code ne se choisit jamais ici.
  // bracelet : { numero, etat: 'verif' | 'code' | 'libre' | 'bloque', motif, err }
  const [bracelet, setBracelet] = useState(null)
  // retrait : { numero, prenom, commandes, compte, bracelet } — commandes en ligne faites pour ce bracelet
  const [retrait, setRetrait] = useState(null)
  const retirer = useCallback(async (code) => {
    const ev = new URLSearchParams(window.location.search).get('ev')
    const r = await apiFetch('/api/borne', { body: { action: 'retirer-bracelet', ev, bracelet: retrait?.numero, code } })
    setLastResa({ numero: r.numero, code: r.code, items: r.items, total: r.total, pour: r.pour || null })
    setRetrait(null)
    setStep(STEP.TICKET)
  }, [retrait?.numero])
  // Après le retrait (ou sans retirer) : commander autre chose avec ce bracelet
  const apresRetrait = useCallback(async () => {
    const rt = retrait
    if (!rt) return
    if (rt.compte) {
      const ev = new URLSearchParams(window.location.search).get('ev')
      const snap = await getDoc(doc(db, 'events', ev, 'spectateurs', rt.compte.docId))
      if (snap.exists()) {
        setSpec({ ...snap.data(), _docId: snap.id, _bracelet: rt.bracelet && rt.bracelet.achatMax !== undefined ? rt.bracelet : null })
        setRetrait(null); setBracelet(null); setStep(STEP.MENU); return
      }
    }
    setRetrait(null); setStep(STEP.BRACELET)
  }, [retrait])
  const ouvrirBracelet = useCallback(async (numero) => {
    setError(''); setStep(STEP.BRACELET); setBracelet({ numero, etat: 'verif' }); setLoading(true)
    try {
      const ev = new URLSearchParams(window.location.search).get('ev')
      const r = await apiFetch('/api/qr', { body: { action: 'identifier', ev, bracelet: numero } })
      if ((r.commandes || []).length) {
        // Commandes faites pour ce bracelet : retrait sans code ; ensuite, commander comme d'habitude
        setRetrait({ numero, prenom: r.bracelet?.prenom || '', commandes: r.commandes, compte: r.compte || null, bracelet: r.bracelet || null })
        setBracelet({ numero, etat: 'code', prenom: r.bracelet?.prenom || '' })
        setStep(STEP.RETRAIT)
        return
      }
      if (r.compte) {
        // Bracelet de mineur sans code (28/11/2026) : ouvert tout de suite, limité par son plafond
        const snap = await getDoc(doc(db, 'events', ev, 'spectateurs', r.compte.docId))
        if (!snap.exists()) { setBracelet({ numero, etat: 'code', err: 'Compte introuvable. Demandez à la billetterie.' }); return }
        setSpec({ ...snap.data(), _docId: snap.id, _bracelet: r.bracelet || null })
        setBracelet(null)
        setStep(STEP.MENU)
        return
      }
      setBracelet({ numero, etat: 'code', prenom: r.bracelet?.prenom || '' })
    } catch (e) {
      const d = e.data || {}
      if (d.etat === 'libre' || d.etat === 'bloque') setBracelet({ numero, etat: d.etat, motif: d.motif || null, err: e.message })
      else setBracelet({ numero, etat: 'code', err: e.status ? e.message : 'Erreur de connexion. Réessayez dans un instant.' })
    } finally { setLoading(false) }
  }, [])
  const validerBracelet = useCallback(async (code) => {
    const numero = bracelet?.numero
    if (!numero) return
    setLoading(true)
    try {
      const ev = new URLSearchParams(window.location.search).get('ev')
      const r = await apiFetch('/api/qr', { body: { action: 'identifier', ev, bracelet: numero, code } })
      const snap = await getDoc(doc(db, 'events', ev, 'spectateurs', r.compte.docId))
      if (!snap.exists()) { setBracelet({ numero, etat: 'code', err: 'Compte introuvable. Demandez à la billetterie.' }); return }
      // Bracelet limité (mineur ou plafonné) : ses limites suivent le compte jusqu'au paiement
      setSpec({ ...snap.data(), _docId: snap.id, _bracelet: r.bracelet && r.bracelet.achatMax !== undefined ? r.bracelet : null })
      setBracelet(null)
      setStep(STEP.MENU)
    } catch (e) {
      const d = e.data || {}
      if (d.etat === 'bloque' || d.etat === 'libre') setBracelet({ numero, etat: d.etat, motif: d.motif || null, err: e.message })
      else setBracelet(b => ({ numero, etat: 'code', prenom: b?.prenom || '', err: e.status ? e.message : 'Erreur de connexion. Réessayez dans un instant.' }))
    } finally { setLoading(false) }
  }, [bracelet?.numero])

  // Relit le compte déjà autorisé (10 minutes après le QR) : sert après une recharge faite sur le téléphone
  const rafraichirSolde = useCallback(async () => {
    const ev = new URLSearchParams(window.location.search).get('ev')
    const id = spec?._docId
    if (!id) throw new Error('Compte inconnu')
    const snap = await getDoc(doc(db, 'events', ev, 'spectateurs', id))
    if (!snap.exists()) throw new Error('Compte introuvable')
    setSpec({ ...snap.data(), _docId: snap.id })
  }, [spec?._docId])

  // ─── Bénévoles (19/11/2026) : QR de l'espace bénévole ou code à 6 chiffres ──
  // La borne n'a aucun accès direct aux fiches : le serveur vérifie le QR, décompte les droits
  // du jour et crée la commande (api/borne.js). Un seul ticket, pour le stand des bénévoles.
  // QR tournant (23/11/2026) : le serveur vérifie le jeton (YB-… / YA-…) et renvoie un passage
  // signé, valable 10 minutes, qui sert à commander. L'ancien QR imprimé (lien avec clé) est refusé.
  const [benev, setBenev] = useState(null)          // { id, passage, nom, restants }
  const [benevBusy, setBenevBusy] = useState(false)
  const [benevErr, setBenevErr] = useState('')
  const evParam = () => new URLSearchParams(window.location.search).get('ev')

  const ouvrirBenevole = useCallback(async ({ jeton }) => {
    setError(''); setLoading(true); setStep(STEP.IDENTIFICATION)
    try {
      const r = await apiFetch('/api/borne', { body: { action: 'ouvrir', ev: evParam(), qr: jeton } })
      setBenev({ id: r.benevole?.id, passage: r.passage, nom: r.benevole?.nom || 'Bénévole', restants: r.restants || {} })
      setCart({}); setBenevErr('')
      setStep(STEP.MENU)
    } catch (e) {
      setError(e.message || 'QR bénévole non reconnu. Réessayez.')
    } finally { setLoading(false) }
  }, [])

  // Artistes (20/11/2026) : même parcours ; le serveur renvoie les articles de ses avantages
  // (type meal / drink / eau) et ses restants. Chaque article sort au stand de cet article.
  const ouvrirArtiste = useCallback(async ({ jeton }) => {
    setError(''); setLoading(true); setStep(STEP.IDENTIFICATION)
    try {
      const r = await apiFetch('/api/borne', { body: { action: 'ouvrir', artiste: true, ev: evParam(), qr: jeton } })
      const VERS = { meal: 'repas', drink: 'boisson', eau: 'eau' }
      const rs = r.restants || {}
      setBenev({
        kind: 'artiste', id: r.artiste?.id, passage: r.passage, nom: r.artiste?.nom || 'Artiste',
        restants: { repas: rs.meal || 0, boisson: rs.drink || 0, eau: rs.eau || 0 },
        articles: Object.fromEntries((r.articles || []).map(a => [a.id, VERS[a.type]])),
      })
      setCart({}); setBenevErr('')
      setStep(STEP.MENU)
    } catch (e) {
      setError(e.message || 'QR artiste non reconnu. Réessayez.')
    } finally { setLoading(false) }
  }, [])

  // Ticket d'un artiste : un par stand, sans prix (avantages)
  // Solde des artistes (25/11/2026) : une partie peut être payée sur le solde ; les avantages restent à 0 €
  const ticketArtiste = (r) => ({
    artiste: r.artiste || 'Artiste', numero: r.numero, total: r.totalPaye || 0,
    items: (r.items || []).map(i => ({
      nom: r.totalPaye > 0 && i.offert ? `${i.nom} (avantage)` : i.nom,
      qty: i.qty, prix: i.offert === false ? (i.prix || 0) : 0, standId: i.standId,
    })),
  })

  // body : { lignes } (commande à la borne) ou { code } (code de l'espace bénévole)
  const commanderBenevole = useCallback(async (body) => {
    setBenevBusy(true); setBenevErr('')
    try {
      const r = await apiFetch('/api/borne', { body: { action: 'commander', ev: evParam(), ...body } })
      if (r.artiste) setLastResa(ticketArtiste(r))
      // Écran 13 (24/11/2026) : une partie payée sur le solde → tickets par stand, comme un spectateur
      // (les articles offerts y figurent à 0 €, sur le ticket du stand des bénévoles)
      else if (r.totalPaye > 0) setLastResa({
        benevoleMixte: true, numero: r.numero, nom: r.benevole, total: r.totalPaye, parType: r.parType || {},
        items: (r.items || []).map(i => ({ nom: i.offert ? `${i.nom} (avantage)` : i.nom, qty: i.qty, prix: i.offert ? 0 : (i.prix || 0), standId: i.standId })),
      })
      else setLastResa({ benevole: true, numero: r.numero, stand: r.stand, items: r.items || [], parType: r.parType || {}, nom: r.benevole })
      setCart({})
      setStep(STEP.TICKET)
      return true
    } catch (e) {
      setBenevErr(e.message || 'Commande impossible. Réessayez.')
      throw e
    } finally { setBenevBusy(false) }
  }, [])

  // ─── Lecteur de QR (USB ou Bluetooth, mode clavier) ────────────────────
  // Actif sur l'accueil et l'identification : présenter son QR suffit, même sans toucher l'écran.
  // Ignoré pendant la commande, pour qu'un QR présenté par erreur ne change pas de client.
  // Session perdue (20/11/2026) : le lecteur est ignoré, l'écran d'indisponibilité reste affiché.
  const scanActive = eventReady && !loading && !sessionPerdue && (step === STEP.ACCUEIL || step === STEP.IDENTIFICATION)
  const validateRef = useRef(validateSpec)
  validateRef.current = validateSpec
  const benevRef = useRef(ouvrirBenevole)
  benevRef.current = ouvrirBenevole
  const artisteRef = useRef(ouvrirArtiste)
  artisteRef.current = ouvrirArtiste
  const braceletRef = useRef(null)
  braceletRef.current = (numero) => ouvrirBracelet(numero)
  useEffect(() => {
    if (!scanActive) return
    const wedge = createWedge({
      onTournant: (jeton) => { setStep(STEP.IDENTIFICATION); validateRef.current({ qr: jeton }) },
      // QR du billet (« FY-… » ou ancien lien) : il sert à l'entrée, pas à payer
      // QR tournant de l'espace bénévole ou artiste (23/11/2026)
      onEspace: (q) => { if (q.kind === 'artiste') artisteRef.current(q); else benevRef.current(q) },
      onBracelet: (numero) => braceletRef.current(numero),
      onScan: () => { setStep(STEP.IDENTIFICATION); setError('C\'est le QR de votre billet : il sert à l\'entrée. Pour payer, ouvrez votre espace YllaCash sur votre téléphone et présentez le QR qui s\'y affiche.') },
      onUnknown: (texte, lectureCodes, lectureTouches) => {
        setStep(STEP.IDENTIFICATION)
        // Ancien QR bénévole ou artiste (lien personnel avec sa clé, parfois imprimé) : refusé (23/11/2026)
        if (parseBenevoleQr(lectureTouches, lectureCodes, texte) || parseArtisteQr(lectureTouches, lectureCodes, texte)) {
          setError(QR_IMPRIME_REFUSE)
          return
        }
        setError('Ce QR code n\'est pas reconnu. Présentez le QR de votre espace YllaCash (spectateur, bénévole ou artiste).')
      },
    })
    // Phase de capture : la rafale du lecteur (et son Entrée) n'atteint pas les boutons de la page
    const onKey = (e) => { if (wedge.feed(e)) e.preventDefault() }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); wedge.reset() }
  }, [scanActive])

  // ─── Helpers de transition ────────────────────────────────────────────
  // resetSession : retour à l'accueil + effacement de toute donnée perso.
  // Appelé après commande terminée, inactivité, ou bouton "Terminer".
  const resetSession = useCallback(() => {
    setSpec(null)
    setBenev(null)
    setBenevErr('')
    setCart({})
    setLastResa(null)
    setError('')
    setBracelet(null)
    setRetrait(null)
    setStep(STEP.ACCUEIL)
  }, [])

  // ─── Écran « Borne momentanément indisponible » (20/11/2026) ──────────
  // Règle de sécurité : jamais pendant une validation (identification, commande, code) ni pendant
  // l'écran du ticket (affichage ou impression). Dans ces cas le parcours se termine normalement ;
  // l'écran n'apparaît qu'ensuite, au retour à l'accueil ou dès que la validation est finie.
  const validationEnCours = loading || benevBusy || validationEnfant
  const ecranSessionPerdue = sessionPerdue && !validationEnCours && step !== STEP.TICKET
  // L'écran remplace l'étape en cours : on efface aussi le compte et le panier gardés en mémoire
  useEffect(() => {
    if (ecranSessionPerdue) resetSession()
  }, [ecranSessionPerdue, resetSession])

  // ─── Rendu selon l'étape ──────────────────────────────────────────────
  // Container plein écran avec couleurs marine/coral identité Maison Ylla
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: COLORS.bg,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      color: COLORS.text,
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {!eventReady ? (
        <ConfigError error={error}/>
      ) : ecranSessionPerdue ? (
        <SessionPerdue/>
      ) : step === STEP.ACCUEIL ? (
        <Accueil onStart={() => setStep(STEP.IDENTIFICATION)} onCode={() => setStep(STEP.CODE)} logoUrl={logoUrl} festival={festNom}/>
      ) : step === STEP.CODE ? (
        <CodeScreen stands={carte.stands}
          onBenevoleCode={(code) => commanderBenevole({ code })}
          onCancel={resetSession}
          onTimeout={resetSession}
          onOccupe={setValidationEnfant}
          onConfirmed={(resa) => { setLastResa(resa); setStep(STEP.TICKET) }}/>
      ) : step === STEP.RETRAIT && retrait ? (
        <RetraitBracelet retrait={retrait} onRetirer={retirer} onAutre={apresRetrait} onCancel={resetSession}/>
      ) : step === STEP.BRACELET && bracelet ? (
        <BraceletCode lu={bracelet} loading={loading} onCode={validerBracelet} onCancel={resetSession}/>
      ) : step === STEP.IDENTIFICATION ? (
        <Identification
          onValidated={validateSpec}
          secours={scannerEnPanne}
          onCancel={resetSession}
          loading={loading}
          error={error}
         />
      ) : step === STEP.MENU ? (
        <Menu
          spec={spec}
          cart={cart}
          setCart={setCart}
          onTimeout={resetSession}
          onGoToCart={() => setStep(STEP.PANIER)}
          onTerminate={resetSession}
          benev={benev}
          benevBusy={benevBusy}
          benevErr={benevErr}
          onBenevoleCommande={(lignes) => commanderBenevole({ ...(benev.kind === 'artiste' ? { artiste: true } : {}), passage: benev.passage, lignes }).catch(() => {})}
          carte={carte}
          categories={categories}
          onErreurLecture={signalerErreurLecture}/>
      ) : step === STEP.PANIER ? (
        <Panier
          spec={spec}
          onRefreshSolde={rafraichirSolde}
          cart={cart}
          setCart={setCart}
          onTimeout={resetSession}
          onBack={() => setStep(STEP.MENU)}
          onTerminate={resetSession}
          stands={carte.stands}
          onErreurLecture={signalerErreurLecture}
          onOccupe={setValidationEnfant}
          onConfirmed={(resa) => {
            setLastResa(resa)
            setStep(STEP.TICKET)
          }}/>
      ) : step === STEP.TICKET ? (
        lastResa?.benevole
          ? <TicketBenevole resa={lastResa} onDone={resetSession} logoUrl={logoUrl} festival={festNom}/>
          : <Ticket resa={lastResa} onDone={resetSession} logoUrl={logoUrl} stands={carte.stands} festival={festNom}/>
      ) : null}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran d'erreur de configuration (eventId absent dans l'URL)
// ════════════════════════════════════════════════════════════════════
function ConfigError({ error }) {
  return (
    <div style={{
      height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 40, textAlign: 'center', background: COLORS.marine, color: '#fff',
    }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>⚠️</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        Borne non configurée
      </div>
      <div style={{ fontSize: 16, opacity: 0.8, maxWidth: 500, lineHeight: 1.5 }}>
        {error || 'Veuillez contacter l\'administrateur.'}
      </div>
      <div style={{ fontSize: 13, opacity: 0.5, marginTop: 40, fontFamily: 'monospace' }}>
        URL attendue : /borne?ev=&lt;eventId&gt;
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran « Borne momentanément indisponible » (20/11/2026)
// ════════════════════════════════════════════════════════════════════
// Affiché quand la session de la borne n'est plus valable (lien renouvelé par un administrateur).
// Même style que l'accueil. « Réessayer » recharge la page : le lien est alors revérifié.
function SessionPerdue() {
  const recharger = () => window.location.reload()
  return (
    <div role="alert" style={{
      height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 40, textAlign: 'center', overflowY: 'auto',
      background: `radial-gradient(60% 60% at 0% 0%, rgba(233,101,47,.22), transparent 70%), radial-gradient(70% 70% at 100% 100%, rgba(0,138,138,.22), transparent 72%), ${COLORS.bg}`,
      color: COLORS.text,
    }}>
      <div aria-hidden="true" style={{
        width: 96, height: 96, borderRadius: '50%', flexShrink: 0,
        background: '#FAEED4', color: '#6B4500',
        display: 'grid', placeItems: 'center', marginBottom: 20,
        fontSize: 52, fontWeight: 700, lineHeight: 1,
        fontFamily: "'Bricolage Grotesque', Inter, system-ui, sans-serif",
      }}>!</div>
      <div style={{
        fontSize: 'clamp(30px, 5vw, 44px)',
        fontWeight: 700, marginBottom: 16, lineHeight: 1.1, letterSpacing: '-.01em',
        fontFamily: "'Bricolage Grotesque', Inter, system-ui, sans-serif",
        color: COLORS.text,
      }}>
        Borne momentanément indisponible
      </div>
      <div style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: COLORS.muted, maxWidth: 600, lineHeight: 1.45 }}>
        Pour commander, adressez-vous au stand ou à la billetterie.
      </div>
      <div style={{
        marginTop: 34, paddingTop: 16, borderTop: `1px solid ${COLORS.border}`,
        fontSize: 15, color: COLORS.muted, maxWidth: 640, lineHeight: 1.5,
      }}>
        <b style={{ color: COLORS.text }}>Pour l'équipe :</b> le lien de cette borne n'est plus valable. Ouvrez le nouveau lien
        depuis <b style={{ color: COLORS.text }}>Opérations › Borne self-service</b>, sur un téléphone d'administrateur, puis
        scannez son QR avec cette tablette.
        <div style={{ marginTop: 20 }}>
          <button onClick={recharger}
            style={{
              minHeight: 48, padding: '0 28px', borderRadius: 99,
              background: '#fff', color: COLORS.text, border: `1.5px solid ${COLORS.border}`,
              fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}>
            Réessayer
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 1 — Accueil
// ════════════════════════════════════════════════════════════════════
// Plein écran tactile. Tout l'écran est cliquable pour démarrer.
// Le fond utilise la couleur de marque du festival (settings.brandColor),
// avec un gradient vers une variante plus sombre pour la profondeur.
// Le logo (settings.logoDataUrl) est affiché en haut s'il est défini.
function Accueil({ onStart, onCode, logoUrl, festival = '' }) {
  // Texte sur le fond brand — soit blanc soit noir selon luminance
  // Nouveau style (20/11/2026) : accueil clair, sur fond crème à halos
  const onBrand = COLORS.text
  // Couleur des labels secondaires : variante avec opacité réduite
  const onBrandMuted = COLORS.muted
  const onBrandSubtle = COLORS.muted
  const onBrandFaint = 'rgba(0,48,72,0.20)'

  // Mode borne : Fullscreen + paysage forcé + wake lock (cf. hook).
  // Réservé au staff qui configure la tablette en début de service.
  const kiosk = useKioskMode({ orientation: 'landscape' })

  return (
    <div
      onClick={onStart}
      onTouchEnd={onStart}
      style={{
        height: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center',
        // Dégradé vertical de la version sombre vers la couleur de marque
        background: `radial-gradient(60% 60% at 0% 0%, rgba(233,101,47,.22), transparent 70%), radial-gradient(70% 70% at 100% 100%, rgba(0,138,138,.22), transparent 72%), ${COLORS.bg}`,
        color: onBrand, cursor: 'pointer',
        position: 'relative',
      }}>
      {/* Bouton "Mode borne" discret en haut à droite — visible seulement
          quand le mode n'est pas déjà actif. Réservé au staff qui configure
          la tablette.
          IMPORTANT : sur tablette, le parent capte onTouchEnd → onStart.
          On doit donc gérer onTouchEnd ici aussi pour :
            1. Empêcher la propagation au parent (sinon démarre la commande)
            2. Activer le mode borne (sinon le bouton ne fait rien sur tactile)
          Note : Fullscreen API exige un geste utilisateur direct, c'est le
          cas avec onTouchEnd. */}
      {/* Imprimante de tickets : réglage de l'équipe (20/11/2026) */}
      <BoutonImprimante colors={COLORS} festival={festival} right={kiosk.active ? 16 : 150}/>
      {!kiosk.active && (
        <button
          onClick={kiosk.activate}
          onTouchEnd={kiosk.activate}
          style={{
            position: 'absolute', top: 16, right: 16,
            padding: '8px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.72)', color: onBrand,
            border: `0.5px solid ${onBrandFaint}`,
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            WebkitTapHighlightColor: 'transparent',
            zIndex: 10,
          }}>
          <Maximize2 size={13}/> Mode borne
        </button>
      )}
      {/* Logo du festival si disponible, sinon texte de fallback */}
      {logoUrl ? (
        <img src={logoUrl} alt="Logo"
          style={{
            maxHeight: 100, maxWidth: 280,
            marginBottom: 24, objectFit: 'contain',
            // Si fond sombre + logo sombre, ajout d'un fond blanc subtil
            // (rare, mais sécurité visuelle)
          }}/>
      ) : (
        <div style={{
          fontSize: 20, color: onBrandMuted, marginBottom: 12,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          Maison Ylla
        </div>
      )}
      <div style={{
        fontSize: 'clamp(36px, 6vw, 56px)',
        fontWeight: 700, marginBottom: 16, lineHeight: 1.1, letterSpacing: '-.01em',
        fontFamily: "'Bricolage Grotesque', Inter, system-ui, sans-serif",
        color: onBrand,
      }}>
        Commandez vous-même
      </div>
      <div style={{
        fontSize: 'clamp(15px, 2vw, 19px)',
        color: onBrandSubtle, marginBottom: 48,
        maxWidth: 500, lineHeight: 1.5,
      }}>
        Pas d'attente, paiement direct sur votre solde.
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontWeight: 600 }}>
          <ScanLine size={18} aria-hidden="true"/> Présentez votre QR ou votre bracelet devant le lecteur
        </span>
      </div>
      <div style={{
        background: COLORS.coral, color: '#fff',
        padding: '24px 56px', borderRadius: 99,
        fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 600,
        boxShadow: '0 12px 32px rgba(0,40,60,0.14)',
        animation: 'borne-pulse 2s ease-in-out infinite',
      }}>
        Toucher pour commencer
      </div>
      {/* Code à 6 chiffres reçu à la billetterie : la commande est déjà payée */}
      <button
        onClick={(e) => { e.stopPropagation(); onCode() }}
        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onCode() }}
        style={{
          marginTop: 28, padding: '16px 34px', borderRadius: 99,
          background: 'rgba(255,255,255,0.72)', color: onBrand,
          border: `1.5px solid ${onBrandFaint}`,
          fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 10,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <KeyRound size={22}/> J'ai un code
      </button>
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        textAlign: 'center', fontSize: 12, color: onBrandMuted,
      }}>
        Touchez n'importe où sur l'écran
      </div>
      <style>{`
        @keyframes borne-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 2 — Identification (QR + saisie manuelle)
// ════════════════════════════════════════════════════════════════════
function Identification({ onValidated, onCancel, loading, error, secours = false }) {
  // Code de secours (2 lettres + 4 chiffres), seulement si « Scanner en panne » est activé
  const [manualInput, setManualInput] = useState('')

  // Heure courante (mise à jour chaque minute pour l'en-tête)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  // Deux lettres puis quatre chiffres (ex. KT-4821)
  const addChar = (ch) => {
    if (loading) return
    if (manualInput.length >= 6) return
    const lettre = /[A-Z]/.test(ch)
    if (manualInput.length < 2 ? !lettre : lettre) return
    setManualInput(prev => prev + ch)
  }
  const removeChar = () => {
    if (loading) return
    setManualInput(prev => prev.slice(0, -1))
  }
  const submitManual = () => {
    const code = parseSecours(manualInput)
    if (loading || !code) return
    onValidated({ secours: code })
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      padding: 'clamp(12px, 2vh, 24px)',
      background: COLORS.bg,
      overflow: 'hidden',
    }}>
      {/* En-tête : stand + heure + bouton retour */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'clamp(8px, 1.5vh, 20px)',
        flexShrink: 0,
      }}>
        <button onClick={onCancel}
          style={{
            background: 'transparent', border: 'none', color: COLORS.muted,
            fontSize: 14, padding: '8px 12px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit',
          }}>
          <ArrowLeft size={16}/> Annuler
        </button>
        <div style={{ fontSize: 13, color: COLORS.muted }}>
          {timeStr}
        </div>
      </div>

      {/* Titre */}
      <div style={{
        textAlign: 'center',
        marginBottom: 'clamp(8px, 2vh, 24px)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 'clamp(18px, 3vh, 22px)',
          fontWeight: 600, color: COLORS.marine, marginBottom: 4,
        }}>
          Identifiez-vous
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted }}>
          {secours
            ? 'Présentez le QR de votre espace devant le lecteur, ou tapez le code affiché sous votre QR (ex : KT-4821)'
            : 'Ouvrez votre espace YllaCash sur votre téléphone et présentez son QR devant le lecteur. Téléphone déchargé ? Présentez votre bracelet.'}
        </div>
      </div>

      {/* Saisie manuelle (mode unique pour la borne self-service) */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflowY: 'auto',
      }}>
        {secours ? (
          <ManualKeypad
            value={manualInput}
            onAdd={addChar}
            onRemove={removeChar}
            onSubmit={submitManual}
            loading={loading}/>
        ) : (
          <div style={{
            background: '#fff', borderRadius: 20, border: `0.5px solid ${COLORS.border}`,
            padding: 'clamp(20px, 5vh, 48px)', textAlign: 'center', maxWidth: 520, width: '100%',
          }}>
            <div style={{
              width: 'clamp(120px, 22vh, 200px)', height: 'clamp(120px, 22vh, 200px)', margin: '0 auto 16px',
              border: `4px dashed ${COLORS.teal}`, borderRadius: 28, display: 'grid', placeItems: 'center',
              color: COLORS.teal, fontSize: 15, fontWeight: 700,
            }}>QR de votre espace</div>
            <div style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.5 }}>
              Le QR de votre espace change toutes les 30 secondes : présentez celui affiché en ce moment.
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 10 }}>
              Pas de compte ? Commandez à la billetterie, puis touchez « J'ai un code ».
            </div>
          </div>
        )}
      </div>

      {/* Message d'erreur (en bas, surimpression) */}
      {error && (
        <div style={{
          position: 'absolute', bottom: 24, left: 24, right: 24,
          background: '#FBE1DF', color: '#8E211C',
          border: '0.5px solid #E9A19C', borderRadius: 14,
          padding: '14px 18px', fontSize: 14, lineHeight: 1.4,
          textAlign: 'center', maxWidth: 600, margin: '0 auto',
        }}>
          {error}
        </div>
      )}

      {/* Spinner si chargement */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: COLORS.marine, fontWeight: 600,
        }}>
          <RefreshCw size={20} style={{
            animation: 'borne-spin 1s linear infinite', marginRight: 10,
          }}/>
          Vérification…
          <style>{`
            @keyframes borne-spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Commande passée en ligne pour ce bracelet (« Pour qui ? », 28/11/2026) : retrait sans code,
// solde du titulaire débité au retrait. Ensuite : commander autre chose, ou terminer.
function RetraitBracelet({ retrait, onRetirer, onAutre, onCancel }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [reste, setReste] = useState(BRACELET_INACTIF_S)
  const touche = useRef(Date.now())
  useEffect(() => {
    const t = setInterval(() => {
      const r = BRACELET_INACTIF_S - Math.floor((Date.now() - touche.current) / 1000)
      setReste(Math.max(0, r))
      if (r <= 0 && !busy) onCancel()
    }, 1000)
    return () => clearInterval(t)
  }, [busy, onCancel])
  const imprimer = async (code) => {
    touche.current = Date.now(); setBusy(code); setErr('')
    try { await onRetirer(code) }
    catch (e) { setErr(e.message || 'Impression impossible. Réessayez.'); setBusy('') }
  }
  const euros = (c) => `${((Number(c) || 0) / 100).toFixed(2).replace('.', ',')} €`
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 'clamp(12px, 2vh, 24px)', background: COLORS.bg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <button onClick={onCancel} disabled={!!busy} style={{ background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 14, padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <ArrowLeft size={16}/> Terminer
        </button>
        <div style={{ fontSize: 12, color: reste <= 10 ? COLORS.red : COLORS.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13}/> {reste}s
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', alignContent: 'start', justifyItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 'clamp(24px, 4vh, 32px)', fontWeight: 800, color: COLORS.marine, textAlign: 'center' }}>
          Bonjour{retrait.prenom ? ` ${retrait.prenom}` : ''}
        </div>
        {retrait.commandes.map(c => (
          <div key={c.code} style={{ width: '100%', maxWidth: 620, background: '#fff', borderRadius: 20, border: `0.5px solid ${COLORS.border}`, padding: '18px 20px', display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.marine }}>Commande pour {retrait.prenom ? 'toi' : 'ce bracelet'}</div>
            <div style={{ fontSize: 15, color: COLORS.muted }}>
              {(c.items || []).map(i => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.nom}`).join(' · ')} · environ {euros(c.total)}
            </div>
            <button onClick={() => imprimer(c.code)} disabled={!!busy}
              style={{ background: COLORS.teal, color: '#fff', border: 'none', borderRadius: 18, minHeight: 60, fontSize: 19, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: busy && busy !== c.code ? 0.5 : 1 }}>
              {busy === c.code ? 'Impression…' : 'Imprimer mes tickets'}
            </button>
          </div>
        ))}
        {err && <div role="alert" style={{ maxWidth: 620, width: '100%', background: '#FBE1DF', color: '#8E211C', borderRadius: 14, padding: '12px 14px', fontSize: 15, fontWeight: 600 }}>{err}</div>}
        <div style={{ fontSize: 14, color: COLORS.muted, maxWidth: 620, textAlign: 'center', lineHeight: 1.5 }}>
          Aucun code demandé : la commande a été passée par le titulaire du compte. Son solde est débité quand le ticket sort, au prix du jour. Présentez ensuite le ticket au stand.
        </div>
        <button onClick={onAutre} disabled={!!busy} style={{ background: 'transparent', color: COLORS.marine, border: `1px solid ${COLORS.border}`, borderRadius: 18, minHeight: 54, padding: '0 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Commander autre chose
        </button>
      </div>
    </div>
  )
}

// Limites d'un bracelet de mineur ou plafonné (28/11/2026), sous le solde dans l'en-tête du menu
function LimitesBracelet({ b }) {
  const parts = []
  if (b.resteJour != null) parts.push(`Reste ${(b.resteJour / 100).toFixed(2)} € aujourd'hui`)
  if (b.achatMax != null) parts.push(`${(b.achatMax / 100).toFixed(0)} € au plus par achat`)
  if (b.mineur) parts.push("pas d'alcool")
  if (!parts.length) return null
  return (
    <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#006666', background: '#D9F1F0', borderRadius: 10, padding: '3px 8px', display: 'inline-block' }}>
      {parts.join(' · ')}
    </div>
  )
}

// Bracelet de secours : code à 4 chiffres (écran 3, 24/11/2026)
// ════════════════════════════════════════════════════════════════════
// Cases masquées, même clavier que « J'ai un code » ; 30 s sans toucher l'écran : retour à l'accueil.
const BRACELET_INACTIF_S = 30
function BraceletCode({ lu, loading, onCode, onCancel }) {
  const [digits, setDigits] = useState('')
  const [reste, setReste] = useState(BRACELET_INACTIF_S)
  const touche = useRef(Date.now())
  const numero = `${lu.numero.slice(0, 4)} ${lu.numero.slice(4)}`
  const fini = lu.etat === 'libre' || lu.etat === 'bloque'

  // Code refusé : on repart de cases vides
  useEffect(() => { if (lu.err) setDigits('') }, [lu])   // chaque réponse du serveur est un nouvel objet
  useEffect(() => {
    const t = setInterval(() => {
      const r = BRACELET_INACTIF_S - Math.floor((Date.now() - touche.current) / 1000)
      setReste(Math.max(0, r))
      if (r <= 0 && !loading) onCancel()
    }, 1000)
    return () => clearInterval(t)
  }, [loading, onCancel])

  const add = (d) => {
    if (loading || digits.length >= 4) return
    touche.current = Date.now()
    const v = digits + d
    setDigits(v)
    if (v.length === 4) onCode(v)
  }
  const del = () => { touche.current = Date.now(); setDigits(x => x.slice(0, -1)) }

  const keyStyle = {
    background: '#06222F', color: '#fff', border: 'none', borderRadius: 20,
    fontSize: 'clamp(22px, 4vh, 30px)', fontWeight: 700, fontFamily: 'inherit',
    padding: 'clamp(12px, 2.6vh, 22px) 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    display: 'grid', placeItems: 'center',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 'clamp(12px, 2vh, 24px)', background: COLORS.bg, overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(8px, 1.5vh, 16px)', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 14, padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <ArrowLeft size={16}/> {fini ? 'Terminer' : 'Annuler'}
        </button>
        <div style={{ fontSize: 12, color: reste <= 10 ? COLORS.red : COLORS.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13}/> {reste}s
        </div>
      </div>

      {fini ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 20, border: `0.5px solid ${COLORS.border}`, padding: 'clamp(24px, 5vh, 40px)', textAlign: 'center', maxWidth: 560, display: 'grid', gap: 14, justifyItems: 'center' }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: lu.etat === 'bloque' ? '#FBE1DF' : '#FAEED4', color: lu.etat === 'bloque' ? '#8E211C' : '#8A5A00' }}>
              {lu.etat === 'bloque' ? <Lock size={34} aria-hidden="true"/> : <Watch size={34} aria-hidden="true"/>}
            </div>
            <div style={{ fontSize: 'clamp(22px, 4vh, 28px)', fontWeight: 700, color: COLORS.marine }}>
              {lu.etat === 'bloque' ? 'Bracelet bloqué' : 'Bracelet pas encore relié'}
            </div>
            <div style={{ fontSize: 16, color: COLORS.muted, lineHeight: 1.5 }}>
              {lu.err}{lu.etat === 'bloque' && <><br/>Passez à la billetterie avec une pièce d'identité.</>}
            </div>
            <button onClick={onCancel} style={{ background: COLORS.coral, color: '#fff', border: 'none', borderRadius: 20, padding: '18px 40px', fontSize: 19, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Terminer
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 'clamp(20px, 3.4vh, 26px)', fontWeight: 700, color: COLORS.marine, marginBottom: 4, textAlign: 'center' }}>
            {lu.prenom ? `Bracelet de ${lu.prenom}` : 'Votre code de bracelet'}
          </div>
          <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 18, textAlign: 'center', maxWidth: 560 }}>
            Bracelet n° {numero}. Tapez votre code à 4 chiffres, celui choisi dans votre espace ou au guichet.
          </div>
          <div style={{ display: 'flex', gap: 'clamp(6px, 1.2vw, 12px)', marginBottom: 18 }} aria-label={`${digits.length} chiffre${digits.length > 1 ? 's' : ''} saisi${digits.length > 1 ? 's' : ''} sur 4`}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={{
                width: 'clamp(48px, 7vw, 64px)', height: 'clamp(56px, 9vh, 76px)', borderRadius: 20,
                display: 'grid', placeItems: 'center', background: '#fff',
                border: `2px solid ${i === digits.length ? COLORS.coral : COLORS.border}`,
                fontSize: 'clamp(26px, 4.5vh, 38px)', fontWeight: 800, color: COLORS.marine,
              }}>{i < digits.length ? '•' : ''}</div>
            ))}
          </div>
          {lu.err && (
            <div role="alert" style={{ background: '#FBE1DF', color: '#8E211C', border: '0.5px solid #E9A19C', borderRadius: 14,
              padding: '12px 16px', fontSize: 15, marginBottom: 14, textAlign: 'center', maxWidth: 520 }}>
              {lu.err}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'clamp(6px, 1.2vh, 10px)', width: '100%', maxWidth: 420 }}>
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button key={d} style={keyStyle} disabled={loading || lu.etat === 'verif'} onClick={() => add(d)}>{d}</button>
            ))}
            <button style={{ ...keyStyle, background: '#E4DDD2', color: '#06222F' }} disabled={loading || !digits} onClick={del} aria-label="Effacer">
              <Delete size={24}/>
            </button>
            <button style={keyStyle} disabled={loading || lu.etat === 'verif'} onClick={() => add('0')}>0</button>
            <div style={{ display: 'grid', placeItems: 'center', color: COLORS.muted }}>
              {loading && <RefreshCw size={22} style={{ animation: 'borne-spin 1s linear infinite' }}/>}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes borne-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Code à 6 chiffres (commande payée à la billetterie)
// ════════════════════════════════════════════════════════════════════
// Le client tape son code, voit sa commande, puis touche « Mes tickets » :
// la commande part déjà payée et le code ne peut plus servir (utiliserCode).
function CodeScreen({ onCancel, onTimeout, onConfirmed, stands = [], onBenevoleCode, onOccupe }) {
  const [digits, setDigits] = useState('')
  const [found, setFound] = useState(null)     // contenu du code
  const [busy, setBusy] = useState(false)
  // Prévient la borne qu'une lecture ou une validation de code est en cours (20/11/2026) :
  // l'écran « Borne momentanément indisponible » ne doit jamais l'interrompre.
  useEffect(() => {
    onOccupe?.(busy)
    return () => onOccupe?.(false)
  }, [busy, onOccupe])
  const [error, setError] = useState('')
  const [showWarn, setShowWarn] = useState(false)
  const { idleSec, touchActivity } = useIdleWatcher({
    warnSec: IDLE_WARN_SEC, timeoutSec: IDLE_LOGOUT_SEC,
    onWarn: () => setShowWarn(true), onTimeout, enabled: !busy,
  })
  const secondsLeft = Math.max(0, IDLE_LOGOUT_SEC - idleSec)

  const chercher = async (code) => {
    setBusy(true); setError('')
    try {
      const c = await lireCode(code)
      if (!c) setError('Code inconnu. Vérifiez les 6 chiffres.')
      else if (c.statut === 'annule') setError('Ce code a été annulé. Refaites votre commande pour obtenir un nouveau code.')
      else if (c.statut !== 'en_attente') setError('Ce code a déjà été utilisé.')
      else setFound(c)
    } catch (e) {
      console.error('Borne lireCode:', e)
      setError('Erreur de connexion. Réessayez dans un instant.')
    } finally { setBusy(false) }
  }
  const add = (d) => {
    if (busy || found || digits.length >= 6) return
    const next = digits + d
    setDigits(next); setError('')
    if (next.length === 6) chercher(next)
  }
  const del = () => { if (!busy && !found) { setDigits(v => v.slice(0, -1)); setError('') } }

  const valider = async () => {
    setBusy(true); setError('')
    if (found?.origine === 'benevole' || found?.origine === 'artiste') {
      try { await onBenevoleCode(digits) }
      catch (e) { setError(e.message || 'Impression impossible. Réessayez.'); setBusy(false) }
      return
    }
    try {
      if (found?.origine === 'en-ligne') {
        await apiFetch('/api/qr', { body: { action: 'identifier', ev: new URLSearchParams(window.location.search).get('ev'), commande: digits } })
      }
      const r = await utiliserCode(digits, null, { stands })
      onConfirmed({
        ...r,
        items: (r.items || []).map(i => ({ nom: i.nom, qty: i.qty, prix: i.prixUnit, standId: i.standId })),
      })
    } catch (e) {
      console.error('Borne utiliserCode:', e)
      setError(e.message || 'Erreur lors de la validation. Réessayez.')
      setBusy(false)
    }
  }

  const items = found?.items || []
  const enLigne = found?.origine === 'en-ligne'
  const codeArtiste = found?.origine === 'artiste'
  const codeBenev = found?.origine === 'benevole' || codeArtiste
  const keyStyle = {
    background: '#06222F', color: '#fff', border: 'none', borderRadius: 20,
    fontSize: 'clamp(22px, 4vh, 30px)', fontWeight: 700, fontFamily: 'inherit',
    padding: 'clamp(12px, 2.6vh, 22px) 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    display: 'grid', placeItems: 'center',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: COLORS.bg, padding: 'clamp(12px, 2vh, 24px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <button onClick={onCancel} disabled={busy}
          style={{ background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 14, padding: '8px 12px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <ArrowLeft size={16}/> Annuler
        </button>
        <div style={{ fontSize: 12, color: secondsLeft <= 15 ? COLORS.red : COLORS.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13}/> {secondsLeft}s
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 'clamp(20px, 3.4vh, 26px)', fontWeight: 700, color: COLORS.marine, marginBottom: 4, textAlign: 'center' }}>
          {found ? 'Votre commande' : 'Entrez votre code'}
        </div>
        <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 18, textAlign: 'center' }}>
          {found ? (codeArtiste ? 'Commande artiste : vos avantages seront décomptés à l\'impression, un ticket par stand.' : codeBenev ? 'Commande bénévole : vos droits du jour seront décomptés à l\'impression.' : enLigne ? 'Commandée en ligne. Votre solde sera débité quand vous toucherez « Payer et imprimer ».' : 'Déjà payée à la billetterie. Vérifiez puis touchez « Mes tickets ».') : 'Les 6 chiffres reçus à la billetterie ou dans votre espace'}
        </div>

        {/* Six cases */}
        <div style={{ display: 'flex', gap: 'clamp(6px, 1.2vw, 12px)', marginBottom: 18 }} aria-label={`Code saisi : ${digits.split('').join(' ')}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{
              width: 'clamp(44px, 7vw, 64px)', height: 'clamp(56px, 9vh, 76px)', borderRadius: 20,
              display: 'grid', placeItems: 'center', background: '#fff',
              border: `2px solid ${i === digits.length && !found ? COLORS.coral : COLORS.border}`,
              fontSize: 'clamp(26px, 4.5vh, 38px)', fontWeight: 800, color: COLORS.marine,
              marginLeft: i === 3 ? 'clamp(6px, 1.2vw, 14px)' : 0,
            }}>{digits[i] || ''}</div>
          ))}
        </div>

        {error && (
          <div role="alert" style={{ background: '#FBE1DF', color: '#8E211C', border: '0.5px solid #E9A19C', borderRadius: 14,
            padding: '12px 16px', fontSize: 15, marginBottom: 14, textAlign: 'center', maxWidth: 480 }}>
            {error}
          </div>
        )}

        {found ? (
          <div style={{ width: '100%', maxWidth: 520, display: 'grid', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 20, border: `0.5px solid ${COLORS.border}`, padding: '12px 16px' }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 16,
                  borderBottom: i < items.length - 1 ? `0.5px solid ${COLORS.border}` : 'none' }}>
                  <span><b>{it.qty}×</b> {it.nom}</span>
                  {!codeBenev && <span style={{ color: COLORS.muted }}>{(((it.prixUnit || 0) * (it.qty || 0)) / 100).toFixed(2)} €</span>}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4,
                borderTop: `0.5px solid ${COLORS.border}`, fontSize: 17, fontWeight: 800, color: COLORS.marine }}>
                <span>{codeBenev ? 'Droits bénévole' : enLigne ? 'À débiter de votre solde' : 'Total payé'}</span>
                {!codeBenev && <span>{((found.total || 0) / 100).toFixed(2)} €</span>}
              </div>
            </div>
            <button onClick={valider} disabled={busy}
              style={{ background: busy ? COLORS.border : COLORS.coral, color: '#fff', border: 'none', borderRadius: 20,
                padding: '20px', fontSize: 20, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {busy ? <><RefreshCw size={18} style={{ animation: 'borne-spin 1s linear infinite' }}/> Validation…</> : (codeBenev ? 'Imprimer mon ticket →' : enLigne ? 'Payer et imprimer mes tickets →' : 'Mes tickets →')}
            </button>
            <button onClick={() => { setFound(null); setDigits(''); setError('') }} disabled={busy}
              style={{ background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Ce n'est pas ma commande
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'clamp(6px, 1.2vh, 10px)', width: '100%', maxWidth: 420 }}>
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button key={d} style={keyStyle} disabled={busy} onClick={() => add(d)}>{d}</button>
            ))}
            <button style={{ ...keyStyle, background: '#E4DDD2', color: '#06222F' }} disabled={busy || !digits} onClick={del} aria-label="Effacer">
              <Delete size={24}/>
            </button>
            <button style={keyStyle} disabled={busy} onClick={() => add('0')}>0</button>
            <div style={{ display: 'grid', placeItems: 'center', color: COLORS.muted }}>
              {busy && <RefreshCw size={22} style={{ animation: 'borne-spin 1s linear infinite' }}/>}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes borne-spin { to { transform: rotate(360deg); } }`}</style>
      {showWarn && <IdleWarning onContinue={() => { touchActivity(); setShowWarn(false) }} secondsLeft={secondsLeft}/>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Clavier manuel pour saisie ID
// ════════════════════════════════════════════════════════════════════
// Les IDs spectateurs sont du format FY-XXXX où X = alphanumérique.
// On expose un clavier 4 colonnes avec chiffres + lettres majuscules.
function ManualKeypad({ value, onAdd, onRemove, onSubmit, loading }) {
  // 0-9 puis A-Z (sans I, O, 0, 1 si on veut éviter les confusions visuelles,
  // mais ici on garde tout pour ne pas surprendre l'utilisateur)
  const keys = ['0','1','2','3','4','5','6','7','8','9',
                'A','B','C','D','E','F','G','H','I','J',
                'K','L','M','N','O','P','Q','R','S','T',
                'U','V','W','X','Y','Z']
  return (
    <div style={{
      background: '#fff', borderRadius: 20,
      padding: 'clamp(12px, 2vh, 24px)',
      border: `0.5px solid ${COLORS.border}`,
      width: '100%', maxWidth: 720,
      maxHeight: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Styles communs (keyframes + effet :active sur les touches) */}
      <style>{`
        @keyframes borne-blink { to { opacity: 0; } }
        .borne-key {
          transition: transform 0.06s ease, background-color 0.1s ease;
        }
        .borne-key:not(:disabled):active {
          transform: scale(0.94);
          background-color: #0a0a0a !important;
        }
        .borne-action {
          transition: transform 0.06s ease, background-color 0.1s ease;
        }
        .borne-action:not(:disabled):active {
          transform: scale(0.97);
        }
      `}</style>

      {/* Affichage de la saisie en cours — fond clair, texte sombre.
          Les tailles s'adaptent à la hauteur disponible via clamp() pour
          rester utilisables sur tablette en paysage (~600-800px de haut). */}
      <div style={{
        background: '#F0E8DC', borderRadius: 20,
        padding: 'clamp(12px, 2.5vh, 24px) 16px',
        marginBottom: 'clamp(8px, 1.5vh, 20px)',
        textAlign: 'center',
        fontSize: 'clamp(22px, 4vh, 36px)',
        fontWeight: 600,
        color: '#06222F', letterSpacing: '0.12em',
        fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `0.5px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <span>{value.slice(0, 2)}{value.length >= 2 ? '-' : ''}{value.slice(2)}</span>
        <span style={{
          display: 'inline-block', width: 3,
          height: 'clamp(22px, 4vh, 36px)',
          background: '#06222F', marginLeft: 4,
          animation: 'borne-blink 1s steps(2) infinite',
        }}/>
      </div>

      {/* Grille de touches — padding/fontSize ajustés à la hauteur dispo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 'clamp(4px, 1vh, 8px)',
        marginBottom: 'clamp(8px, 1.5vh, 14px)',
        flexShrink: 0,
      }}>
        {keys.map(k => (
          <button key={k}
            className="borne-key"
            onClick={() => onAdd(k)}
            disabled={loading}
            style={{
              background: '#06222F', color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: 'clamp(10px, 2.4vh, 22px) 0',
              fontSize: 'clamp(16px, 2.8vh, 22px)',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace',
              opacity: loading ? 0.5 : 1,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {k}
          </button>
        ))}
      </div>

      {/* Effacer (neutre clair) + Valider (couleur de marque) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: 'clamp(6px, 1vh, 10px)',
        flexShrink: 0,
      }}>
        <button onClick={onRemove} disabled={loading || value.length === 0}
          className="borne-action"
          style={{
            background: '#E4DDD2', color: '#06222F',
            border: 'none',
            borderRadius: 14,
            padding: 'clamp(12px, 2.5vh, 20px)',
            fontSize: 'clamp(14px, 2.4vh, 18px)',
            fontWeight: 600,
            cursor: (loading || value.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: (loading || value.length === 0) ? 0.4 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}>
          ← Effacer
        </button>
        <button onClick={onSubmit} disabled={loading || value.length < 3}
          className="borne-action"
          style={{
            background: (loading || value.length < 3) ? '#E4DDD2' : COLORS.teal,
            color: (loading || value.length < 3) ? '#4F687C' : '#fff',
            border: 'none', borderRadius: 14,
            padding: 'clamp(12px, 2.5vh, 20px)',
            fontSize: 'clamp(15px, 2.6vh, 20px)',
            fontWeight: 700,
            cursor: (loading || value.length < 3) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}>
          Valider →
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Hook : surveillance d'inactivité
// ════════════════════════════════════════════════════════════════════
// Démarre un timer qui :
//   - déclenche `onWarn()` à warnSec secondes (modale d'avertissement)
//   - déclenche `onTimeout()` à timeoutSec secondes (force la déco)
// Toute interaction tactile/clic/scroll/clavier réinitialise le compteur.
//
// Retourne `idleSec` (compteur affichable) pour l'UI.
function useIdleWatcher({ warnSec, timeoutSec, onWarn, onTimeout, enabled = true }) {
  const [idleSec, setIdleSec] = useState(0)
  const lastActivity = useRef(Date.now())
  const warnedRef = useRef(false)

  // Reset à chaque interaction
  const touchActivity = useCallback(() => {
    lastActivity.current = Date.now()
    setIdleSec(0)
    warnedRef.current = false
  }, [])

  useEffect(() => {
    if (!enabled) return
    // Écoute toutes les interactions sur le document
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll']
    events.forEach(e => window.addEventListener(e, touchActivity, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, touchActivity))
  }, [enabled, touchActivity])

  useEffect(() => {
    if (!enabled) return
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivity.current) / 1000)
      setIdleSec(elapsed)
      if (elapsed >= timeoutSec) {
        onTimeout?.()
      } else if (elapsed >= warnSec && !warnedRef.current) {
        warnedRef.current = true
        onWarn?.()
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [enabled, warnSec, timeoutSec, onWarn, onTimeout])

  return { idleSec, touchActivity }
}

// ════════════════════════════════════════════════════════════════════
// Écran 3 — Menu (Lot 2)
// ════════════════════════════════════════════════════════════════════
// Affiche le solde + les articles du menu, avec ajout/retrait au panier.
// Filtres catégories. Compteur d'inactivité visible. Bouton Terminer
// permanent en haut à droite.
function Menu({ spec, cart, setCart, onTimeout, onGoToCart, onTerminate, carte, categories, benev = null, benevBusy = false, benevErr = '', onBenevoleCommande, onErreurLecture }) {
  // Items du menu (chargés en live depuis Firestore)
  const [menu, setMenu] = useState([])
  // Rayon et catégorie affichés (null = le premier)
  const [activeRayon, setActiveRayon] = useState(null)
  const [activeCat, setActiveCat] = useState(null)
  // Modale "Vous êtes toujours là ?" (warning d'inactivité)
  const [showWarn, setShowWarn] = useState(false)
  // Article actuellement affiché en modale composition (null = aucune)
  const [selectedItem, setSelectedItem] = useState(null)

  // Watcher Firestore sur la collection menu
  useEffect(() => {
    const unsub = watchMenu((items) => {
      // On filtre les articles désactivés ou hors-vente
      setMenu(items.filter(i => i.actif !== false))
    }, undefined, (e) => {
      // Lecture refusée : la session de la borne n'est plus valable (20/11/2026)
      console.warn('Borne menu:', e.message)
      onErreurLecture?.(e)
    })
    return () => unsub && unsub()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Watcher d'inactivité — déclenche warning à 50s, déconnexion à 60s
  const { idleSec, touchActivity } = useIdleWatcher({
    warnSec: IDLE_WARN_SEC,
    timeoutSec: IDLE_LOGOUT_SEC,
    onWarn: () => setShowWarn(true),
    onTimeout: onTimeout,
    enabled: true,
  })

  // Quand le user touche "Je suis là" dans la modale, on ferme + reset le timer
  const dismissWarn = () => {
    touchActivity()
    setShowWarn(false)
  }

  // ─── Carte organisée : rayons > catégories > articles ───────────────
  // Articles sans stand écartés dès qu'un stand existe (menu/organiser.js)
  // Bénévole : seuls les articles « Consommation bénévole », tous servis au stand des bénévoles
  // Artiste : seuls les articles de ses avantages, chacun à son stand (type donné par le serveur)
  const menuVu = useMemo(() => benev?.kind === 'artiste'
    ? menu.filter(m => benev.articles?.[m.id]).map(m => ({ ...m, typeConsommation: benev.articles[m.id] }))
    : menu, [menu, benev])
  const org = useMemo(() => organiserCarte(benev
    ? benev.kind === 'artiste'
      ? { menu: menuVu, categories, rayons: carte?.rayons || [], stands: carte?.stands || [] }
      : { menu: menu.filter(m => m.typeConsommation), categories, rayons: carte?.rayons || [], stands: [] }
    : { menu, categories, rayons: carte?.rayons || [], stands: carte?.stands || [] },
  ), [menu, menuVu, categories, carte, benev])
  // Droits du bénévole encore libres pour un type, en tenant compte du panier
  const libres = (type) => {
    if (!benev) return Infinity
    const pris = Object.entries(cart).reduce((n, [id, q]) => n + (menuVu.find(m => m.id === id)?.typeConsommation === type ? q : 0), 0)
    return (benev.restants?.[type] || 0) - pris
  }
  const rayon = org.rayons.find(r => r.id === activeRayon) || org.rayons[0] || null
  const cat = rayon ? (rayon.cats.find(c => c.key === activeCat) || rayon.cats[0]) : null
  const showRayons = org.rayons.length > 1 || !!org.rayons[0]?.nom
  const chooseRayon = (id) => { setActiveRayon(id); setActiveCat(null); setSugEtape(null) }
  // Commande par étapes (maquette validée le 28/11/2026) : rayons = étapes ; après un ajout, suggestion
  // de la prochaine étape encore vide, jamais vers l'alcool (menu/etapes.js)
  const etapes = org.rayons
  const avecEtapes = etapes.length > 1
  const etapeIdx = Math.max(0, etapes.findIndex(r => r.id === rayon?.id))
  const [sugEtape, setSugEtape] = useState(null)
  const [refusEtapes, setRefusEtapes] = useState({})
  // La suggestion s'efface d'elle-même après 6 secondes : la ligne d'étape revient
  useEffect(() => {
    if (sugEtape == null) return
    const t = setTimeout(() => setSugEtape(null), 6000)
    return () => clearTimeout(t)
  }, [sugEtape])
  const allerEtape = (i, suggestion = false) => {
    const r = etapes[i]
    if (!r) return
    setActiveRayon(r.id); setActiveCat(suggestion ? categorieSuggeree(r) : null); setSugEtape(null)
  }

  // ─── Helpers panier ─────────────────────────────────────────────────
  const updateQty = (itemId, delta) => {
    if (benev && delta > 0 && libres(menuVu.find(m => m.id === itemId)?.typeConsommation) <= 0) return
    if (delta > 0 && spec?._bracelet?.mineur && menuVu.find(m => m.id === itemId)?.alcool === true) return
    setCart(prev => {
      const next = { ...prev }
      const current = next[itemId] || 0
      const newQty = Math.max(0, current + delta)
      if (newQty === 0) delete next[itemId]
      else next[itemId] = newQty
      return next
    })
  }

  // Ajout d'un article (carte ou fiche) : puis suggestion de l'étape suivante
  const ajouter = (itemId) => {
    const m = menuVu.find(x => x.id === itemId)
    const refuse = (benev && libres(m?.typeConsommation) <= 0) || (spec?._bracelet?.mineur && m?.alcool === true)
    updateQty(itemId, +1)
    if (refuse || !avecEtapes) return
    setSugEtape(prochaineSuggestion(etapes, { courante: Math.max(0, etapeDeArticle(etapes, itemId)), qtys: { ...cart, [itemId]: (cart[itemId] || 0) + 1 }, refus: refusEtapes }))
  }

  // Total du panier en centimes
  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [itemId, qty]) => {
      const item = menu.find(m => m.id === itemId)
      if (!item) return sum
      return sum + (item.prix || 0) * qty
    }, 0)
  }, [cart, menu])

  const cartCount = useMemo(() => {
    return Object.values(cart).reduce((sum, q) => sum + q, 0)
  }, [cart])

  // Compteur d'auto-déco affiché (60 - écoulé)
  const secondsLeft = Math.max(0, IDLE_LOGOUT_SEC - idleSec)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
      {/* ─── En-tête : nom + solde + compteur + bouton terminer ───────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16, alignItems: 'center',
        padding: '14px 24px', background: '#fff',
        borderBottom: `0.5px solid ${COLORS.border}`,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Bonjour
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.marine }}>
            {benev ? benev.nom : (spec?._bracelet?.prenom || spec?.nom || '—')}
            {benev && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#FDE4D4', color: '#B8470F', borderRadius: 10, padding: '2px 8px' }}>{benev.kind === 'artiste' ? 'Artiste' : 'Bénévole'}</span>}
          </div>
        </div>
        {benev ? (
          <div style={{ display: 'flex', gap: 8, paddingLeft: 20, flexWrap: 'wrap' }}>
            {[['repas', 'Repas', '#E0F4F4', '#006666'], ['boisson', 'Boissons', '#FAEED4', '#6B4500'], ['eau', 'Eau', '#D7EFE9', '#04504A']].map(([t, l, bg, fg]) => (
              <span key={t} style={{ background: bg, color: fg, borderRadius: 12, padding: '6px 10px', fontSize: 13, fontWeight: 700 }}>
                {l} {Math.max(0, libres(t))}
              </span>
            ))}
          </div>
        ) : (
        <div style={{ textAlign: 'left', paddingLeft: 20 }}>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Solde
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green }}>
            {((spec?.solde || 0) / 100).toFixed(2)} €
          </div>
          {spec?._bracelet && <LimitesBracelet b={spec._bracelet}/>}
        </div>
        )}
        {/* Compteur d'inactivité */}
        <div style={{
          background: COLORS.bg,
          padding: '8px 12px', borderRadius: 12,
          border: `0.5px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: COLORS.muted,
        }}>
          <Clock size={13}/>
          <span>Déco auto dans</span>
          <span style={{
            fontWeight: 700,
            color: secondsLeft <= 15 ? COLORS.red : COLORS.marine,
          }}>{secondsLeft}s</span>
        </div>
        {/* Bouton Terminer */}
        <button onClick={onTerminate}
          style={{
            background: 'transparent', color: COLORS.muted,
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 12, padding: '8px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <X size={14}/> Terminer
        </button>
      </div>

      {/* ─── Rayons (Plats, Boissons…) ─────────────────────────────── */}
      {showRayons && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10,
          padding: '12px 24px', background: '#fff',
          borderBottom: `0.5px solid ${COLORS.border}`,
        }}>
          {org.rayons.map(r => {
            const on = r.id === rayon?.id
            const Icon = getIcon(r.icon)
            return (
              <button key={r.id || 'autres'} onClick={() => chooseRayon(r.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  minHeight: 56, padding: '0 26px', borderRadius: 20,
                  border: on ? 'none' : `1px solid ${COLORS.border}`,
                  background: on ? COLORS.marine : COLORS.bg,
                  color: on ? '#fff' : COLORS.marine,
                  fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <Icon size={22}/> {r.nom}
              </button>
            )
          })}
        </div>
      )}

      {/* ─── Colonne catégories + grille des articles ─────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: rayon && rayon.cats.length > 1 && rayon.cats.length <= 3 ? '176px minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
        {rayon && rayon.cats.length > 1 && rayon.cats.length <= 3 && (
          <nav aria-label="Catégories" style={{
            overflowY: 'auto', background: '#fff',
            borderRight: `0.5px solid ${COLORS.border}`,
            padding: '10px 8px', display: 'grid', alignContent: 'start', gap: 6,
          }}>
            {rayon.cats.map(c => {
              const on = c.key === cat?.key
              const Icon = getIcon(c.icon)
              const col = c.couleur || COLORS.marine
              return (
                <button key={c.key} onClick={() => setActiveCat(c.key)}
                  aria-current={on ? 'true' : undefined}
                  style={{
                    position: 'relative', display: 'grid', justifyItems: 'center', gap: 6,
                    padding: '12px 6px', borderRadius: 20,
                    border: on ? `1.5px solid ${COLORS.coral}` : '1.5px solid transparent',
                    background: on ? '#FDE4D4' : 'transparent',
                    color: COLORS.marine, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <span style={{
                    width: 44, height: 44, borderRadius: 20, display: 'grid', placeItems: 'center',
                    background: `color-mix(in srgb, ${col} 16%, transparent)`, color: col,
                  }}><Icon size={22}/></span>
                  <span style={{
                    fontSize: 14, fontWeight: 700, lineHeight: 1.2, textAlign: 'center',
                    wordBreak: 'keep-all', overflowWrap: 'normal', hyphens: 'none',
                  }}>{c.nom}</span>
                </button>
              )
            })}
          </nav>
        )}

        <div style={{ overflowY: 'auto', padding: '16px 24px' }}>
          {/* Au-delà de 3 catégories : liste déroulante (règle du 28/11/2026) */}
          {rayon && rayon.cats.length > 3 && (
            <label style={{ display: 'grid', gap: 6, marginBottom: 14, maxWidth: 420 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Catégorie</span>
              <select value={cat?.key ?? ''} onChange={e => setActiveCat(e.target.value)}
                style={{ height: 54, borderRadius: 16, border: `1.5px solid ${COLORS.border}`, background: '#fff', color: COLORS.marine, padding: '0 16px', fontSize: 18, fontWeight: 700, fontFamily: 'inherit' }}>
                {rayon.cats.map(c => <option key={c.key} value={c.key}>{c.nom}</option>)}
              </select>
            </label>
          )}
          {!cat ? (
            <div style={{ textAlign: 'center', padding: 60, color: COLORS.muted }}>
              {menu.length === 0 ? 'Chargement du menu…' : 'Aucun article disponible pour le moment.'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.marine, marginBottom: 12 }}>
                {cat.nom}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12,
              }}>
                {cat.items.map(item => (
                  <MenuCard key={item.id}
                    item={item}
                    benevole={!!benev}
                    interdit={!!spec?._bracelet?.mineur && item.alcool === true}
                    qty={cart[item.id] || 0}
                    onAdd={() => ajouter(item.id)}
                    onRemove={() => updateQty(item.id, -1)}
                    onShowInfo={() => setSelectedItem(item)}/>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Étapes (rayons), au-dessus du panier ; la suggestion prend la place de cette ligne
             (version compacte validée le 28/11/2026 ; rien n'est ajouté tout seul) ─────────── */}
      {avecEtapes && (sugEtape != null && etapes[sugEtape] ? (
        <div role="status" style={{ background: COLORS.marine, color: '#fff', padding: '12px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <b style={{ flex: 1, fontSize: 17, background: '#22343F', borderRadius: 14, padding: '12px 16px' }}>✓ Ajouté. {etapes[sugEtape].nom ? `Et avec ça, côté ${etapes[sugEtape].nom.toLowerCase()} ?` : 'Autre chose avec ça ?'}</b>
          <button onClick={() => allerEtape(sugEtape, true)} style={{ border: 'none', borderRadius: 14, background: '#2CC4C0', color: '#03263A', padding: '12px 20px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Voir {etapes[sugEtape].nom ? `les ${etapes[sugEtape].nom.toLowerCase()}` : 'la suite'}
          </button>
          <button onClick={() => { setRefusEtapes(r => ({ ...r, [sugEtape]: true })); setSugEtape(null) }} style={{ border: 'none', borderRadius: 14, background: 'rgba(255,255,255,.14)', color: '#fff', padding: '12px 18px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Pas intéressé
          </button>
        </div>
      ) : (
        <div style={{ background: COLORS.marine, color: '#fff', padding: '12px 24px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <b style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{etapes[etapeIdx]?.nom || 'Autres'}</b>
          <span role="group" aria-label="Étapes" style={{ flex: 1, display: 'flex', gap: 6 }}>
            {etapes.map((r, i) => {
              const fait = i !== etapeIdx && (r.cats || []).some(c => (c.items || []).some(m => (cart[m.id] || 0) > 0))
              return <button key={r.id || 'autres'} onClick={() => allerEtape(i)} aria-label={`Étape ${r.nom || 'Autres'}`} aria-current={i === etapeIdx ? 'step' : undefined}
                style={{ flex: 1, height: 8, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: i === etapeIdx ? '#2CC4C0' : fait ? '#7FC9C1' : 'rgba(255,255,255,.2)' }} />
            })}
          </span>
          <button onClick={() => allerEtape((etapeIdx + 1) % etapes.length)} style={{ border: '1.5px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff', borderRadius: 14, padding: '10px 16px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {etapes[(etapeIdx + 1) % etapes.length]?.nom || 'Autres'} →
          </button>
        </div>
      ))}
      {/* ─── Barre panier en bas (visible quand panier non vide, ou avec les étapes) ──────── */}
      {(cartCount > 0 || avecEtapes) && (
        <div style={{
          background: COLORS.marine, color: '#fff',
          padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCart size={20}/>
            <div>
              <div style={{ fontSize: 14, opacity: 0.7 }}>
                {cartCount} article{cartCount > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {(cartTotal / 100).toFixed(2)} €
              </div>
            </div>
          </div>
          {benevErr && <span style={{ flex: 1, fontSize: 13, color: '#FCE2E2' }}>{benevErr}</span>}
          <button onClick={benev
              ? () => onBenevoleCommande(Object.entries(cart).map(([id, qty]) => ({ id, qty })))
              : onGoToCart}
            disabled={benevBusy || cartCount === 0}
            style={{
              background: COLORS.coral, color: '#fff',
              border: 'none', borderRadius: 14,
              padding: '14px 28px', fontSize: 16, fontWeight: 700,
              cursor: benevBusy ? 'wait' : cartCount === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: benevBusy ? .7 : cartCount === 0 ? .45 : 1,
            }}>
            {benev ? (benevBusy ? 'Impression…' : 'Imprimer mon ticket →') : 'Ma commande →'}
          </button>
        </div>
      )}

      {/* ─── Modale "Vous êtes toujours là ?" ─────────────────────────── */}
      {showWarn && (
        <IdleWarning onContinue={dismissWarn} secondsLeft={secondsLeft}/>
      )}

      {/* ─── Modale fiche article (composition, allergènes) ──────────── */}
      {selectedItem && (
        <ArticleInfoModal
          item={selectedItem}
          qty={cart[selectedItem.id] || 0}
          onAdd={() => ajouter(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}

// ─── Petits composants Menu ─────────────────────────────────────────────
function MenuCard({ item, qty, onAdd, onRemove, onShowInfo, benevole = false, interdit = false }) {
  // interdit (28/11/2026) : article alcoolisé présenté à un bracelet « mineur », grisé comme une rupture
  const outOfStock = interdit || (typeof item.stock === 'number' && item.stock <= 0)
  const inCart = qty > 0
  // Compatibilité : photoUrl (nouveau champ Lot Image 1) ou image (legacy)
  const photoSrc = item.photoUrl || item.image
  // Couleur de placeholder déterministe à partir du nom de l'article
  // pour donner un visuel agréable même sans photo.
  const placeholderHue = (item.nom || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  // Stoppe la propagation sur les boutons +/− pour ne pas déclencher
  // l'ouverture de la modale composition.
  const stop = (handler) => (e) => { e.stopPropagation(); handler && handler() }
  return (
    <div
      onClick={onShowInfo}
      style={{
      position: 'relative',
      borderRadius: 20,
      overflow: 'hidden',
      aspectRatio: '1/1',
      border: `0.5px solid ${inCart ? COLORS.teal : 'transparent'}`,
      outline: inCart ? `2px solid ${COLORS.teal}` : 'none',
      outlineOffset: -1,
      opacity: outOfStock ? 0.55 : 1,
      cursor: outOfStock ? 'not-allowed' : (onShowInfo ? 'pointer' : 'default'),
      background: '#222', // Fond sombre par défaut, masqué par l'image
    }}>
      {/* Image entière + fond flouté pour combler les bandes */}
      {photoSrc ? (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${photoSrc})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(18px) brightness(0.6)',
            transform: 'scale(1.15)',
          }}/>
          <img src={photoSrc} alt={item.nom}
            style={{
              position: 'absolute', inset: 0,
              margin: 'auto',
              maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain',
            }}/>
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, hsl(${placeholderHue},35%,55%), hsl(${(placeholderHue+30)%360},45%,30%))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 64, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
            {item.nom?.[0]?.toUpperCase() || '?'}
          </span>
        </div>
      )}

      {/* Dégradé sombre en bas pour lisibilité du texte */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 40%, transparent 70%)',
      }}/>

      {/* Badge rupture en haut à droite */}
      {outOfStock && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: COLORS.red, color: '#fff',
          padding: '3px 8px', borderRadius: 8,
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>{interdit ? 'Pas avec ce bracelet' : 'Rupture'}</span>
      )}

      {/* Image générée : mention discrète en haut à droite (la rupture prend la place) */}
      {item.photoGenerated && photoSrc && !outOfStock && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.9)',
          padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500,
        }}>Photo non contractuelle</span>
      )}

      {/* Badge quantité en cart, en haut à gauche */}
      {inCart && (
        <span style={{
          position: 'absolute', top: 8, left: 8,
          background: COLORS.teal, color: '#fff',
          minWidth: 24, height: 24, borderRadius: 20,
          padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
        }}>{qty}</span>
      )}

      {/* Texte + actions en bas, par-dessus l'image */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 14px',
        color: '#fff',
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, lineHeight: 1.3,
          marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}>{item.nom}</div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontSize: 16, fontWeight: 700,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>
            {benevole
              ? ({ repas: '1 repas', boisson: '1 boisson', eau: '1 eau' }[item.typeConsommation] || '')
              : `${((item.prix || 0) / 100).toFixed(2)} €`}
          </span>
          {outOfStock ? (
            <span style={{ fontSize: 11, opacity: 0.8 }}>{interdit ? 'Interdit' : 'Indispo.'}</span>
          ) : qty === 0 ? (
            <button onClick={stop(onAdd)}
              style={{
                background: COLORS.teal, color: '#fff',
                border: 'none', width: 32, height: 32, borderRadius: '50%',
                fontSize: 18, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              }}>
              <Plus size={18}/>
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={stop(onRemove)}
                style={{
                  background: 'rgba(255,255,255,0.95)', color: COLORS.marine,
                  border: 'none', width: 30, height: 30, borderRadius: '50%',
                  fontSize: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit',
                }}>
                <Minus size={14}/>
            </button>
            <span style={{
              fontSize: 16, fontWeight: 700, color: '#fff',
              minWidth: 16, textAlign: 'center',
              textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}>
              {qty}
            </span>
            <button onClick={stop(onAdd)}
              disabled={typeof item.stock === 'number' && qty >= item.stock}
              style={{
                background: COLORS.teal, color: '#fff',
                border: 'none', width: 30, height: 30, borderRadius: '50%',
                fontSize: 14, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
                opacity: (typeof item.stock === 'number' && qty >= item.stock) ? 0.4 : 1,
              }}>
              <Plus size={14}/>
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

// ─── Modale d'avertissement d'inactivité ────────────────────────────────
function IdleWarning({ onContinue, secondsLeft }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,24,36,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, zIndex: 999,
    }} onClick={onContinue}>
      <div style={{
        background: '#fff', borderRadius: 28,
        padding: '40px 40px 32px',
        maxWidth: 500, width: '100%', textAlign: 'center',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.marine, marginBottom: 8 }}>
          Vous êtes toujours là ?
        </div>
        <div style={{ fontSize: 15, color: COLORS.muted, marginBottom: 8, lineHeight: 1.5 }}>
          Votre session va se fermer automatiquement dans
        </div>
        <div style={{
          fontSize: 40, fontWeight: 800, color: COLORS.red, marginBottom: 24,
        }}>
          {secondsLeft}s
        </div>
        <button onClick={onContinue}
          style={{
            background: COLORS.teal, color: '#fff',
            border: 'none', borderRadius: 20,
            padding: '16px 36px', fontSize: 16, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', width: '100%',
          }}>
          Je continue ma commande
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 4 — Panier (Lot 3)
// ════════════════════════════════════════════════════════════════════
// Récap de la commande, ajustement des quantités, calcul du nouveau solde
// et validation. Utilise le même endpoint creerReservation que l'espace
// spectateur classique : la résa est créée en status='processing' donc
// visible en cuisine immédiatement.
//
// La résa n'est PAS débitée du solde du spectateur ici — c'est fait par
// validerRetrait quand la cuisine remet la commande. Comportement cohérent
// avec l'espace spectateur existant.
function Panier({ spec, cart, setCart, onTimeout, onBack, onTerminate, onConfirmed, stands = [], onRefreshSolde, onErreurLecture, onOccupe }) {
  // « J'ai rechargé » : relit le solde du compte, sans recommencer la commande (20/11/2026)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const refreshSolde = async () => {
    if (!onRefreshSolde || refreshing) return
    setRefreshing(true); setRefreshMsg('')
    try { await onRefreshSolde(); setRefreshMsg('Solde mis à jour.') }
    catch { setRefreshMsg('Solde non relu. Présentez de nouveau votre QR pour continuer.') }
    finally { setRefreshing(false) }
  }
  // Items du menu pour récupérer prix/nom (le panier ne stocke que les qty)
  const [menu, setMenu] = useState([])
  // Modale "Vous êtes toujours là ?" (warning d'inactivité)
  const [showWarn, setShowWarn] = useState(false)
  // État submission (évite double-clic + désactive boutons pendant l'appel)
  const [submitting, setSubmitting] = useState(false)
  // Erreur affichée si validation échoue
  const [error, setError] = useState('')
  // Prévient la borne qu'une validation est en cours (20/11/2026) : l'écran « Borne momentanément
  // indisponible » ne doit jamais remplacer le panier pendant le paiement.
  useEffect(() => {
    onOccupe?.(submitting)
    return () => onOccupe?.(false)
  }, [submitting, onOccupe])

  // Watcher menu pour avoir les détails des articles (prix, nom)
  useEffect(() => {
    const unsub = watchMenu(setMenu, undefined, (e) => {
      // Lecture refusée : la session de la borne n'est plus valable (20/11/2026)
      console.warn('Borne menu (panier):', e.message)
      onErreurLecture?.(e)
    })
    return () => unsub && unsub()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Inactivité — même règle que sur le menu
  const { idleSec, touchActivity } = useIdleWatcher({
    warnSec: IDLE_WARN_SEC,
    timeoutSec: IDLE_LOGOUT_SEC,
    onWarn: () => setShowWarn(true),
    onTimeout: onTimeout,
    enabled: !submitting, // pas d'auto-déco pendant une validation en cours
  })
  const dismissWarn = () => { touchActivity(); setShowWarn(false) }

  // Items du panier enrichis avec les infos menu
  const cartItems = useMemo(() => {
    return Object.entries(cart).map(([itemId, qty]) => {
      const item = menu.find(m => m.id === itemId)
      if (!item) return null
      return { ...item, qty }
    }).filter(Boolean)
  }, [cart, menu])

  const total = useMemo(() => {
    return cartItems.reduce((s, i) => s + (i.prix || 0) * i.qty, 0)
  }, [cartItems])

  const solde = spec?.solde || 0
  const soldeAfter = solde - total
  const isInsufficient = soldeAfter < 0
  // Bracelet limité (28/11/2026) : mêmes vérifications que le serveur, pour répondre tout de suite
  const brl = spec?._bracelet || null
  const limiteMsg = !brl ? '' : brl.mineur && cartItems.some(i => i.alcool === true)
    ? "Un article contient de l'alcool : pas avec ce bracelet. Retirez-le."
    : brl.achatMax != null && total > brl.achatMax
      ? `Ce panier fait ${(total / 100).toFixed(2)} €. Avec ce bracelet sans code : ${(brl.achatMax / 100).toFixed(2)} € au plus par achat. Retirez un article.`
      : brl.resteJour != null && total > brl.resteJour
        ? `Ce panier fait ${(total / 100).toFixed(2)} €, il reste ${(brl.resteJour / 100).toFixed(2)} € aujourd'hui sur ce bracelet. Retirez un article.`
        : ''
  const bloquePanier = isInsufficient || !!limiteMsg

  // ─── Helpers panier (mêmes que sur Menu, refactor possible) ──────────
  const updateQty = (itemId, delta) => {
    setCart(prev => {
      const next = { ...prev }
      const current = next[itemId] || 0
      const newQty = Math.max(0, current + delta)
      if (newQty === 0) delete next[itemId]
      else next[itemId] = newQty
      return next
    })
  }
  const removeItem = (itemId) => {
    setCart(prev => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  // ─── Validation de la commande ───────────────────────────────────────
  // Si plus rien au panier, on ne devrait pas pouvoir cliquer, mais sécurité.
  // Si solde insuffisant, on bloque et on affiche message.
  //
  // ARCHITECTURE — Borne crée maintenant une COMMANDE (collection `commandes`)
  // plutôt qu'une réservation. Conséquence : le solde du client est DÉBITÉ
  // IMMÉDIATEMENT à la validation, comme une commande staff classique. Cohérence
  // avec PrendreCommande, plus de risque de double-commande au-delà du solde,
  // et le terme "réservation" devient cohérent (réservé = client paie à la
  // remise, plus rare).
  const standById = useMemo(() => new Map(stands.map(st => [st.id, st])), [stands])
  const standOf = (i) => standById.get(i.standId) || null

  const handleConfirm = async () => {
    if (cartItems.length === 0) return
    if (isInsufficient) {
      setError('Solde insuffisant. Retirez un article, ou rechargez sur votre téléphone ou à la billetterie.')
      return
    }
    if (limiteMsg) { setError(limiteMsg); return }
    setSubmitting(true)
    setError('')
    try {
      // Bracelet limité : le serveur vérifie et débite (la borne n'en a plus le droit)
      if (brl) {
        const ev = new URLSearchParams(window.location.search).get('ev')
        const r = await apiFetch('/api/borne', { body: { action: 'commander-bracelet', ev, compte: spec._docId, lignes: cartItems.map(i => ({ id: i.id, qty: i.qty })) } })
        setCart({})
        onConfirmed({ id: null, numero: r.numero, code: `BRC-${r.numero}`, items: r.items, total: r.total, pour: brl.prenom || null })
        return
      }
      // createCommande attend des items avec { id, nom, prixUnit, qty }
      // (prixUnit au lieu de prix — c'est le format des commandes staff)
      const items = cartItems.map(i => ({
        id: i.id,
        nom: i.nom,
        prixUnit: i.prix,      // ← borne stocke en `prix`, on convertit
        qty: i.qty,
        // Type de consommation conservé pour compat menu (ex: sur place/à emporter)
        ...(i.typeConsommation ? { typeConsommation: i.typeConsommation } : {}),
        // Stand de retrait : imprimé sur le ticket de ce stand (un ticket par stand)
        ...(standOf(i) ? { standId: standOf(i).id, standNumero: standOf(i).numero } : {}),
      }))
      // Génère un code court 'BRN-XXX-NNN' côté client. C'est purement
      // informatif (le numero séquentiel reste l'identifiant principal).
      // Le préfixe BRN- permet à un œil avisé d'identifier les commandes borne.
      // Format : BRN- + 3 lettres aléatoires + - + 3 chiffres aléatoires
      const rndLetters = Array.from({length: 3}, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join('')
      const rndDigits = String(Math.floor(Math.random() * 900) + 100)
      const borneCode = `BRN-${rndLetters}-${rndDigits}`

      // Création de la commande avec débit immédiat (payNow: true).
      // Source 'borne' permet à la cuisine (et aux audits) de différencier
      // les commandes borne des commandes staff classiques.
      const cmd = await createCommande({
        specId: spec.id,
        specDocId: spec._docId,       // ← compte autorisé par le serveur (QR tournant)
        specNom: spec.nom,
        items,
        payNow: true,                 // ← débit immédiat du solde
        staff: 'Borne self-service',  // ← traçabilité dans les audits
        code: borneCode,
        source: 'borne',
        remise: true,                 // ← ticket imprimé : le stand ne suit pas la commande à l'écran
      })
      // createCommande retourne { id, numero, code }. Pour le ticket, on
      // construit un objet enrichi avec les items et le total déjà calculés
      // côté client (pas besoin de relire Firestore).
      const orderForTicket = {
        ...cmd,
        items: items.map(i => ({
          nom: i.nom, qty: i.qty, prix: i.prixUnit, standId: i.standId,
        })),
        total,
      }
      // Succès → vide le panier et transmet au ticket de fin
      setCart({})
      onConfirmed(orderForTicket)
    } catch (e) {
      // Cas typiques : "Solde insuffisant (X.XX € disponibles, Y.YY € requis)",
      // "Stock épuisé pour <article>", "Spectateur introuvable"
      console.error('Borne handleConfirm:', e)
      setError(e.message || 'Erreur lors de la validation. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  const secondsLeft = Math.max(0, IDLE_LOGOUT_SEC - idleSec)

  // Si panier vide après une suppression manuelle, on propose un retour
  if (cartItems.length === 0) {
    return (
      <div style={{
        height: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center', background: COLORS.bg,
      }}>
        <ShoppingCart size={48} style={{ color: COLORS.muted, marginBottom: 16 }}/>
        <div style={{ fontSize: 22, fontWeight: 600, color: COLORS.marine, marginBottom: 8 }}>
          Votre panier est vide
        </div>
        <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 32 }}>
          Retournez au menu pour ajouter des articles.
        </div>
        <button onClick={onBack}
          style={{
            background: COLORS.teal, color: '#fff',
            border: 'none', borderRadius: 14, padding: '14px 32px',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
          ← Retour au menu
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
      {/* En-tête : nom + solde + compteur + bouton terminer (idem Menu) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16, alignItems: 'center',
        padding: '14px 24px', background: '#fff',
        borderBottom: `0.5px solid ${COLORS.border}`,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Bonjour
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.marine }}>
            {spec?.nom || '—'}
          </div>
        </div>
        <div style={{ paddingLeft: 20 }}>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Solde
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green }}>
            {(solde / 100).toFixed(2)} €
          </div>
        </div>
        <div style={{
          background: COLORS.bg,
          padding: '8px 12px', borderRadius: 12,
          border: `0.5px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: COLORS.muted,
        }}>
          <Clock size={13}/>
          <span>Déco auto dans</span>
          <span style={{
            fontWeight: 700,
            color: secondsLeft <= 15 ? COLORS.red : COLORS.marine,
          }}>{secondsLeft}s</span>
        </div>
        <button onClick={onTerminate}
          disabled={submitting}
          style={{
            background: 'transparent', color: COLORS.muted,
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 12, padding: '8px 14px',
            fontSize: 13, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: submitting ? 0.5 : 1,
          }}>
          <X size={14}/> Terminer
        </button>
      </div>

      {/* Corps : titre + liste articles + récap solde */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 18,
        }}>
          <button onClick={onBack} disabled={submitting}
            style={{
              background: 'transparent', border: 'none', color: COLORS.muted,
              fontSize: 13, padding: '4px 8px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              opacity: submitting ? 0.5 : 1,
            }}>
            <ArrowLeft size={14}/> Retour au menu
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: COLORS.marine }}>
            Confirmer la commande
          </div>
          <div style={{ width: 110 }}/>{/* spacer pour centrer le titre */}
        </div>

        {/* Liste articles avec stepper */}
        <div style={{
          background: '#fff', borderRadius: 20,
          border: `0.5px solid ${COLORS.border}`,
          marginBottom: 16, overflow: 'hidden',
        }}>
          {cartItems.map((item, idx) => (
            <div key={item.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: 14, alignItems: 'center',
              padding: '14px 16px',
              borderBottom: idx < cartItems.length - 1 ? `0.5px solid ${COLORS.border}` : 'none',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 2 }}>
                  {item.nom}
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>
                  {((item.prix || 0) / 100).toFixed(2)} € / unité
                </div>
              </div>
              {/* Stepper */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: COLORS.bg, borderRadius: 12, padding: '4px 8px',
              }}>
                <button onClick={() => updateQty(item.id, -1)}
                  disabled={submitting}
                  style={{
                    background: '#fff', color: COLORS.marine,
                    border: `0.5px solid ${COLORS.marine}`,
                    width: 28, height: 28, borderRadius: '50%',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}>
                  <Minus size={13}/>
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.marine, minWidth: 20, textAlign: 'center' }}>
                  {item.qty}
                </span>
                <button onClick={() => updateQty(item.id, +1)}
                  disabled={submitting || (typeof item.stock === 'number' && item.qty >= item.stock)}
                  style={{
                    background: COLORS.teal, color: '#fff',
                    border: 'none', width: 28, height: 28, borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit',
                    opacity: (submitting || (typeof item.stock === 'number' && item.qty >= item.stock)) ? 0.4 : 1,
                  }}>
                  <Plus size={13}/>
                </button>
              </div>
              {/* Total ligne */}
              <div style={{
                minWidth: 80, textAlign: 'right',
                fontSize: 15, fontWeight: 700, color: COLORS.marine,
              }}>
                {((item.prix || 0) * item.qty / 100).toFixed(2)} €
              </div>
              {/* Bouton suppression */}
              <button onClick={() => removeItem(item.id)}
                disabled={submitting}
                title="Retirer l'article"
                style={{
                  background: 'transparent', color: COLORS.muted,
                  border: 'none', padding: 4,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex',
                }}>
                <X size={16}/>
              </button>
            </div>
          ))}
        </div>

        {/* Récap solde */}
        <div style={{
          background: '#fff', borderRadius: 20,
          border: `0.5px solid ${COLORS.border}`,
          padding: '16px 18px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: COLORS.muted }}>
            <span>Solde actuel</span>
            <span style={{ fontWeight: 600 }}>{(solde / 100).toFixed(2)} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: COLORS.coral }}>
            <span>Cette commande</span>
            <span style={{ fontWeight: 600 }}>− {(total / 100).toFixed(2)} €</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 10, marginTop: 6,
            borderTop: `0.5px solid ${COLORS.border}`,
            fontSize: 16,
          }}>
            <span style={{ fontWeight: 600, color: COLORS.text }}>Nouveau solde</span>
            <span style={{
              fontWeight: 700,
              color: isInsufficient ? COLORS.red : COLORS.green,
            }}>
              {(soldeAfter / 100).toFixed(2)} €
            </span>
          </div>
          {isInsufficient && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: '#FBE1DF', color: '#8E211C',
              borderRadius: 10, fontSize: 12,
            }}>
              <b>Solde insuffisant : il manque {(-soldeAfter / 100).toFixed(2)} €.</b> Retirez un article, ou rechargez sur votre
              téléphone (« Recharger mon solde » dans votre espace) ou à la billetterie.
            </div>
          )}
          {limiteMsg && (
            <div role="alert" style={{
              marginTop: 10, padding: '8px 10px',
              background: '#FDE5D7', color: '#8A3410',
              borderRadius: 10, fontSize: 12, fontWeight: 600,
            }}>{limiteMsg}</div>
          )}
          {isInsufficient && onRefreshSolde && (
            <button onClick={refreshSolde} disabled={refreshing}
              style={{
                width: '100%', marginTop: 8, background: 'transparent', color: COLORS.marine,
                border: `0.5px solid ${COLORS.marine}`, borderRadius: 14, padding: '12px',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? .6 : 1,
              }}>
              {refreshing ? 'Lecture du solde…' : 'J\'ai rechargé : actualiser mon solde'}
            </button>
          )}
          {refreshMsg && <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>{refreshMsg}</div>}
        </div>

        {/* Erreur de validation */}
        {error && (
          <div style={{
            padding: '12px 16px', marginBottom: 16,
            background: '#FBE1DF', color: '#8E211C',
            border: '0.5px solid #E9A19C', borderRadius: 12,
            fontSize: 13, lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer : Annuler / Confirmer */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12,
        padding: '16px 24px',
        background: '#fff',
        borderTop: `0.5px solid ${COLORS.border}`,
      }}>
        <button onClick={onBack} disabled={submitting}
          style={{
            background: 'transparent', color: COLORS.marine,
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 14, padding: '16px',
            fontSize: 15, fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: submitting ? 0.5 : 1,
          }}>
          Continuer mes choix
        </button>
        <button onClick={handleConfirm}
          disabled={submitting || bloquePanier || cartItems.length === 0}
          style={{
            background: (submitting || bloquePanier) ? COLORS.border : COLORS.teal,
            color: '#fff', border: 'none',
            borderRadius: 14, padding: '16px',
            fontSize: 16, fontWeight: 700,
            cursor: (submitting || bloquePanier || cartItems.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {submitting ? (
            <>
              <RefreshCw size={16} style={{ animation: 'borne-spin 1s linear infinite' }}/>
              Validation en cours…
            </>
          ) : (
            <>✓ Confirmer · {(total / 100).toFixed(2)} €</>
          )}
        </button>
      </div>

      {/* Modale d'avertissement d'inactivité */}
      {showWarn && <IdleWarning onContinue={dismissWarn} secondsLeft={secondsLeft}/>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Écran 5 — Ticket (Lot 4)
// ════════════════════════════════════════════════════════════════════
// Affiche la confirmation de commande avec :
//   - Numéro de commande en grand (le client le retient pour la cuisine)
//   - Récap des articles commandés
//   - Code court (FY-XXXX-NNN) pour traçabilité
//   - Compte à rebours visuel (cercle SVG qui se remplit) — auto-retour 10s
//   - Bouton "Terminer maintenant" pour skip immédiat
//
// IMPORTANT : pas de timer d'inactivité ici. Le compte à rebours est
// strict, indépendant des interactions. Le seul moyen de prolonger
// l'affichage est de NE PAS cliquer Terminer. Sinon → retour auto.
const TICKET_TIMEOUT_SEC = 20
const TICKET_PANNE_SEC = 60   // tickets non imprimés : le client doit avoir le temps de noter ses numéros
const dateTicket = () => new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Compte à rebours de l'écran de fin : arrêté pendant l'impression, 20 s ensuite, 60 s si rien n'est sorti
function useRetourAuto(phase, onDone) {
  const [secondsLeft, setSecondsLeft] = useState(TICKET_TIMEOUT_SEC)
  useEffect(() => {
    if (phase === 'impression') return
    setSecondsLeft(phase === 'ok' ? TICKET_TIMEOUT_SEC : TICKET_PANNE_SEC)
  }, [phase])
  useEffect(() => {
    if (phase === 'impression') return
    if (secondsLeft <= 0) { onDone(); return }
    const t = setTimeout(() => setSecondsLeft(x => x - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft, onDone, phase])
  return secondsLeft
}

// Bandeau « tickets non imprimés » et bouton de nouvel essai
function PanneImpression({ phase, onRetry, pluriel }) {
  return (
    <div style={{
      width: '100%', maxWidth: 520, margin: '0 auto 14px', padding: '12px 16px', borderRadius: 14,
      background: '#FBE1DF', color: '#8E211C', border: '0.5px solid #E9A19C', fontSize: 14, lineHeight: 1.45, textAlign: 'center',
    }} role="alert">
      <b>{phase === 'absente' ? 'L\'imprimante n\'est pas connectée.' : 'L\'imprimante ne répond pas.'}</b>{' '}
      Photographiez cet écran ou notez {pluriel ? 'vos numéros' : 'votre numéro'}, puis montrez-{pluriel ? 'les' : 'le'} au stand. Prévenez l'équipe.
      <div>
        <button onClick={onRetry}
          style={{
            marginTop: 10, background: '#fff', color: COLORS.marine, border: `0.5px solid ${COLORS.marine}`,
            borderRadius: 14, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
          Réessayer l'impression
        </button>
      </div>
    </div>
  )
}

function Ticket({ resa, onDone, logoUrl, stands = [], festival = '' }) {

  // Décompte simple. Pas d'écoute des interactions — le timer est strict
  // pour éviter qu'une session reste ouverte si le spectateur reste devant.

  // Items de la résa (fallback sur tableau vide si la résa est mal formée)
  const items = Array.isArray(resa?.items) ? resa.items : []
  const total = resa?.total || items.reduce((s, i) => s + (i.prix || 0) * (i.qty || 0), 0)
  // Un ticket par stand (« Stand N° 4 », n° 47-4) ; un seul ticket si aucun stand n'est créé
  const tickets = ticketsParStand(items, stands, resa?.numero ?? '—')

  // Tickets papier : un par stand, imprimés une fois à l'affichage de cet écran
  const papier = useMemo(() => ticketsDeCommande(tickets, {
    festival, date: dateTicket(),
    ...(resa?.artiste
      ? { mention: `ARTISTE · ${resa.artiste}`, offert: 'Avantages artiste' }
      : resa?.benevoleMixte
        ? { mention: `BENEVOLE · ${String(resa.nom || '').split(/\s+/)[0]}`, paiement: 'Avantages bénévole + solde' }
        : resa?.pour
          // Bracelet (28/11/2026) : le stand sait à qui remettre la commande
          ? { mention: `POUR : ${String(resa.pour).toUpperCase()}`, paiement: 'Payé avec le solde' }
          : { paiement: resa?.origine === 'billetterie' ? 'Payé à la billetterie' : 'Payé avec le solde' }),
  }), [])   // eslint-disable-line react-hooks/exhaustive-deps
  const { phase, progres, reessayer } = useImpressionTickets(papier)
  const secondsLeft = useRetourAuto(phase, onDone)
  const imprime = phase === 'ok'

  // Calcul du progrès du cercle (0 → 1)
  const duree = imprime ? TICKET_TIMEOUT_SEC : TICKET_PANNE_SEC
  const progress = (duree - secondsLeft) / duree
  // Circonférence d'un cercle de rayon 22 (utilisé dans le SVG)
  const CIRC = 2 * Math.PI * 22

  return (
    <div style={{
      height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 30, background: COLORS.bg,
      overflowY: 'auto',
    }}>
      {/* Logo du festival en haut (Lot branding) */}
      {logoUrl && (
        <img src={logoUrl} alt=""
          style={{
            maxHeight: 48, maxWidth: 160,
            marginBottom: 14, objectFit: 'contain',
          }}/>
      )}

      {/* Pastille : impression en cours, coche verte, ou alerte si rien n'est sorti */}
      <div key={phase} style={{
        width: 96, height: 96, background: phase === 'impression' ? COLORS.marine : imprime ? COLORS.green : COLORS.red,
        borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 48, marginBottom: 16,
        animation: 'borne-ticket-pop 0.4s ease-out',
      }}>{phase === 'impression' ? <Printer size={44}/> : imprime ? '✓' : '!'}</div>

      <div style={{
        fontSize: 26, fontWeight: 700,
        color: COLORS.marine, marginBottom: 4, textAlign: 'center',
      }}>
        {phase === 'impression' ? (tickets.length > 1 ? 'Impression de vos tickets…' : 'Impression de votre ticket…') : imprime ? 'Commande confirmée !' : 'Commande payée, tickets non imprimés'}
      </div>
      <div style={{
        fontSize: 13, color: COLORS.muted, marginBottom: 22,
        textAlign: 'center', maxWidth: 420, lineHeight: 1.5,
      }}>
        {phase === 'impression'
          ? `Ne partez pas : ${tickets.length > 1 ? `${tickets.length} tickets sortent` : 'votre ticket sort'} de la borne.`
          : !imprime
            ? 'Votre commande est bien enregistrée et payée.'
            : tickets.length > 1
              ? `Prenez vos ${tickets.length} tickets et présentez chacun au stand indiqué.`
              : tickets[0]?.stand
                ? 'Prenez votre ticket et présentez-le au stand indiqué.'
                : 'Prenez votre ticket et présentez-le au stand.'}
      </div>
      {phase === 'impression' && <Progression progres={progres} colors={COLORS}/>}
      {(phase === 'panne' || phase === 'absente') && <PanneImpression phase={phase} onRetry={reessayer} pluriel={tickets.length > 1}/>}

      {/* Tickets : un par stand */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14,
        width: '100%', maxWidth: 900, marginBottom: 14,
      }}>
        {tickets.map((t, idx) => {
          // Suivi de l'impression sur chaque ticket : en attente, en cours, imprimé
          const etatTicket = phase === 'impression'
            ? (idx < progres.ticket - 1 ? 'fait' : idx === progres.ticket - 1 ? 'encours' : 'attente')
            : imprime ? 'fait' : null
          return (
          <div key={t.numero} style={{
            background: '#fff', borderRadius: 20, width: 260,
            border: etatTicket === 'encours' ? `2px solid ${COLORS.coral}` : etatTicket === 'fait' ? `2px solid ${COLORS.green}` : `1px dashed ${COLORS.border}`,
            boxShadow: '0 2px 10px rgba(0,48,72,.06)',
            padding: '16px 18px', display: 'grid', gap: 10,
            opacity: etatTicket === 'attente' ? 0.4 : 1, transition: 'opacity .3s',
          }}>
            {resa?.artiste && (
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: COLORS.marine, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Artiste · {resa.artiste}
              </div>
            )}
            {resa?.pour && (
              <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: COLORS.marine, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pour : {resa.pour}
              </div>
            )}
            {t.stand ? (
              <div style={{ textAlign: 'center', borderBottom: `1px dashed ${COLORS.border}`, paddingBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stand</div>
                <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: COLORS.marine }}>N° {t.stand.numero}</div>
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 4 }}>
              {t.lignes.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, color: COLORS.text }}>
                  <span style={{ minWidth: 0 }}>
                    <b>{it.qty}×</b> {it.nom}
                    {!resa?.artiste && <span style={{ display: 'block', fontSize: 11, color: COLORS.muted }}>{((it.prix || 0) / 100).toFixed(2)} € l'unité</span>}
                  </span>
                  {!resa?.artiste && <span style={{ flexShrink: 0, fontWeight: 600 }}>{((it.prix || 0) * (it.qty || 0) / 100).toFixed(2)} €</span>}
                </div>
              ))}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', paddingTop: 8,
              borderTop: `0.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, color: COLORS.marine,
            }}>
              <span>{resa?.artiste ? 'Avantages artiste' : tickets.length > 1 ? 'Sous-total' : 'Total'}</span>
              <span>{resa?.artiste ? 'Offert' : `${(t.sousTotal / 100).toFixed(2)} €`}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Commande</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: COLORS.coral, lineHeight: 1.1 }}>{t.numero}</div>
              {etatTicket && (
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: etatTicket === 'fait' ? COLORS.green : etatTicket === 'encours' ? COLORS.coral : COLORS.muted }}>
                  {etatTicket === 'fait' ? 'Imprimé' : etatTicket === 'encours' ? 'En cours…' : 'En attente'}
                </div>
              )}
            </div>
          </div>
          )
        })}
      </div>
      {tickets.length > 1 && !resa?.artiste && (
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.marine, marginBottom: 6 }}>
          Total payé : {(total / 100).toFixed(2)} €
        </div>
      )}
      {resa?.code && (
        <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'monospace', letterSpacing: '0.05em', marginBottom: 14 }}>
          {resa.code}
        </div>
      )}

      {/* Compte à rebours visuel : cercle SVG (pas pendant l'impression) */}
      <div style={{
        display: phase === 'impression' ? 'none' : 'flex', alignItems: 'center', gap: 14,
        marginBottom: 16, color: COLORS.muted, fontSize: 13,
      }}>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
          {/* Anneau gris de fond */}
          <circle cx="28" cy="28" r="22"
            fill="none" stroke={COLORS.border} strokeWidth="4"/>
          {/* Anneau coral qui se remplit (rotation -90° pour commencer en haut) */}
          <circle cx="28" cy="28" r="22"
            fill="none" stroke={COLORS.coral} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '28px 28px',
              transition: 'stroke-dashoffset 1s linear',
            }}/>
          {/* Compteur au centre */}
          <text x="28" y="34" textAnchor="middle"
            fontSize="18" fontWeight="700"
            fill={COLORS.marine}>
            {secondsLeft}
          </text>
        </svg>
        <div>
          <div style={{ fontWeight: 600, color: COLORS.text }}>
            Retour automatique
          </div>
          <div style={{ fontSize: 11 }}>
            La borne sera libérée dans {secondsLeft} seconde{secondsLeft > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Bouton terminer immédiat */}
      <button onClick={onDone}
        style={{
          background: COLORS.marine, color: '#fff',
          border: 'none', borderRadius: 14, padding: '14px 36px',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', display: phase === 'impression' ? 'none' : 'inline-block',
        }}>
        {imprime ? 'Terminer maintenant' : 'Terminer'}
      </button>

      <style>{`
        @keyframes borne-ticket-pop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════
// Ticket bénévole (19/11/2026) : « Dirigez-vous au stand bénévoles »
// ════════════════════════════════════════════════════════════════════
function TicketBenevole({ resa, onDone, logoUrl, festival = '' }) {
  const items = resa?.items || []
  const p = resa?.parType || {}
  const droits = [['repas', 'repas'], ['boisson', 'boisson'], ['eau', 'eau']]
    .filter(([t]) => p[t]).map(([t, l]) => `${p[t]} ${l}${p[t] > 1 && t !== 'eau' ? 's' : ''}`).join(', ')
  const numero = resa?.stand ? `${resa.numero}-${resa.stand.numero}` : String(resa?.numero ?? '—')
  // Ticket papier : un seul, pour le stand des bénévoles ; prénom et initiale du nom seulement
  const papier = useMemo(() => {
    const [prenom, ...reste] = String(resa?.nom || '').trim().split(/\s+/)
    const court = [prenom, reste.length ? `${reste[reste.length - 1][0]}.` : ''].filter(Boolean).join(' ')
    return [{
      festival, mention: `BENEVOLE${court ? ` · ${court}` : ''}`,
      standNumero: resa?.stand ? resa.stand.numero : null, standNom: resa?.stand?.nom || 'Stand des bénévoles',
      lignes: items.map(it => ({ qty: it.qty, nom: it.nom, prix: null })),
      totalLabel: 'Droits bénévole', totalValeur: 'OFFERT', numero, paiement: 'Dirigez-vous au stand bénévoles', date: dateTicket(),
    }]
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const { phase, progres, reessayer } = useImpressionTickets(papier)
  const secondsLeft = useRetourAuto(phase, onDone)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, background: COLORS.bg, overflowY: 'auto' }}>
      {logoUrl && <img src={logoUrl} alt="" style={{ maxHeight: 48, maxWidth: 160, marginBottom: 14, objectFit: 'contain' }}/>}
      <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.marine, marginBottom: 14 }}>
        {phase === 'impression' ? 'Impression de votre ticket…' : phase === 'ok' ? 'Votre ticket est prêt' : 'Commande enregistrée, ticket non imprimé'}
      </div>
      {phase === 'impression' && <Progression progres={progres} colors={COLORS}/>}
      {(phase === 'panne' || phase === 'absente') && <PanneImpression phase={phase} onRetry={reessayer} pluriel={false}/>}
      <div style={{ background: '#fff', borderRadius: 20, width: 280, border: `1px dashed ${COLORS.border}`, padding: '16px 18px', display: 'grid', gap: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bénévole</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.marine }}>Dirigez-vous au stand bénévoles</div>
        {resa?.stand && <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: COLORS.marine }}>N° {resa.stand.numero}</div>}
        <div style={{ borderTop: `1px dashed ${COLORS.border}`, paddingTop: 8, textAlign: 'left', display: 'grid', gap: 4 }}>
          {items.map((it, i) => <div key={i} style={{ fontSize: 15 }}><b>{it.qty}×</b> {it.nom}</div>)}
        </div>
        {droits && <div style={{ fontSize: 12, color: COLORS.muted, textAlign: 'left' }}>Droits utilisés : {droits}</div>}
        <div>
          <div style={{ fontSize: 11, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Commande</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: COLORS.coral, lineHeight: 1.1 }}>{numero}</div>
        </div>
        {resa?.nom && <div style={{ fontSize: 12, color: COLORS.muted }}>{resa.nom}</div>}
      </div>
      <button onClick={onDone} style={{ marginTop: 18, background: COLORS.marine, color: '#fff', border: 'none', borderRadius: 14, padding: '14px 36px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        {phase === 'impression' ? 'Impression…' : `Terminer (${secondsLeft} s)`}
      </button>
    </div>
  )
}

// Écran du code du bracelet, exporté pour pouvoir l'afficher seul pendant les vérifications
export { BraceletCode }
