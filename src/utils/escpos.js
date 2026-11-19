/**
 * utils/escpos.js — fabrication d'un ticket pour une imprimante thermique (langage ESC/POS)
 *
 * Parcours voulu par l'organisateur : la borne imprime automatiquement un ticket papier par stand,
 * que le client remet au stand. Maquette validée le 20/11/2026 (papier 80 mm, 48 caractères par
 * ligne). Fonctions pures : elles ne font que construire les octets à envoyer ; l'envoi par USB
 * est dans utils/imprimante.js.
 *
 * Accents : beaucoup d'imprimantes les impriment avec la table Windows-1252 (ESC t 16). Si le
 * ticket d'essai montre des caractères bizarres, l'équipe coche « Sans accents » sur la borne.
 */
export const LARGEUR = 48

const ESC = 0x1b, GS = 0x1d, LF = 0x0a
const CP1252_EXTRA = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c }
const SANS_ACCENT = { '€': 'EUR', '’': "'", '‘': "'", '«': '"', '»': '"', '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', 'œ': 'oe', 'Œ': 'OE', '·': '-', '×': 'x', '°': 'o' }

/** Texte sans accents ni signes hors ASCII (imprimante qui ne connaît pas la table 1252) */
export function sansAccents(texte) {
  return String(texte ?? '')
    .replace(/[€’‘«»“”–—…œŒ·×°]/g, c => SANS_ACCENT[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '?')
}

/** Octets d'un texte : Windows-1252, ou ASCII sans accents */
export function encoder(texte, { accents = true } = {}) {
  const s = accents ? String(texte ?? '').replace(/[·×]/g, c => (c === '·' ? '-' : 'x')) : sansAccents(texte)
  const out = []
  for (const ch of s) {
    const code = ch.codePointAt(0)
    if (code < 0x80) out.push(code)
    else if (CP1252_EXTRA[ch] !== undefined) out.push(CP1252_EXTRA[ch])
    else if (code >= 0xa0 && code <= 0xff) out.push(code)
    else out.push(...encoder(sansAccents(ch), { accents: false }))
  }
  return out
}

/** Deux colonnes sur une ligne : libellé à gauche (coupé si trop long), valeur à droite */
export function colonnes(gauche, droite = '', largeur = LARGEUR) {
  const d = String(droite ?? '')
  const place = Math.max(1, largeur - d.length - (d ? 1 : 0))
  let g = String(gauche ?? '')
  if (g.length > place) g = g.slice(0, Math.max(1, place - 1)) + '.'
  return d ? g.padEnd(largeur - d.length, ' ') + d : g
}

const euros = (c) => (Math.round(c || 0) / 100).toFixed(2).replace('.', ',')

/**
 * Lignes d'un ticket, sous forme lisible (utile aux tests et à un éventuel aperçu).
 * ticket : { festival, mention?, standNumero?, standNom?, lignes:[{qty, nom, prix?}], totalLabel,
 *            totalValeur, numero, paiement?, date, pied? }
 * Chaque ligne : { t: texte, align: 'g'|'c', taille: 1|2|3, gras: bool } ou { sep: true }
 */
export function lignesTicket(ticket) {
  const L = []
  const c = (t, taille = 1, gras = false) => L.push({ t, align: 'c', taille, gras })
  const sep = () => L.push({ sep: true })
  if (ticket.festival) c(String(ticket.festival).toUpperCase(), 1, true)
  if (ticket.mention) c(ticket.mention, 1, true)
  sep()
  if (ticket.standNumero != null) {
    c('STAND', 1, true)
    c(`N° ${ticket.standNumero}`, 3, true)
    if (ticket.standNom) c(ticket.standNom)
    sep()
  }
  for (const l of ticket.lignes || []) {
    const prix = l.prix != null ? euros(l.prix * (l.qty || 1)) : ''
    L.push({ t: colonnes(`${l.qty || 1} x ${l.nom}`, prix), align: 'g', taille: 1, gras: false })
  }
  sep()
  L.push({ t: colonnes(ticket.totalLabel || 'Total', ticket.totalValeur || ''), align: 'g', taille: 1, gras: true })
  sep()
  c('COMMANDE')
  c(String(ticket.numero ?? ''), 2, true)
  if (ticket.paiement) c(ticket.paiement)
  if (ticket.date) c(ticket.date)
  c(ticket.pied || 'Remettez ce ticket au stand')
  return L
}

/** Octets ESC/POS d'un ticket, coupe comprise */
export function octetsTicket(ticket, { accents = true } = {}) {
  const b = [ESC, 0x40]                                   // remise à zéro
  if (accents) b.push(ESC, 0x74, 16)                      // table de caractères Windows-1252
  for (const l of lignesTicket(ticket)) {
    if (l.sep) { b.push(ESC, 0x61, 0, GS, 0x21, 0x00, ESC, 0x45, 0, ...encoder('-'.repeat(LARGEUR), { accents }), LF); continue }
    const taille = l.taille === 3 ? 0x22 : l.taille === 2 ? 0x11 : 0x00
    b.push(ESC, 0x61, l.align === 'c' ? 1 : 0, GS, 0x21, taille, ESC, 0x45, l.gras ? 1 : 0, ...encoder(l.t, { accents }), LF)
  }
  b.push(GS, 0x21, 0x00, ESC, 0x45, 0, ESC, 0x61, 0)      // retour au texte normal
  b.push(LF, LF, LF, GS, 0x56, 66, 0)                      // avance du papier puis coupe
  return new Uint8Array(b)
}

/**
 * Tickets à imprimer pour une commande de la borne.
 * tickets : résultat de ticketsParStand ; meta : { festival, date, mention?, paiement?, offert?: libellé }
 */
export function ticketsDeCommande(tickets, meta = {}) {
  return (tickets || []).map(t => ({
    festival: meta.festival || '',
    mention: meta.mention || '',
    standNumero: t.stand ? t.stand.numero : null,
    standNom: t.stand ? (t.stand.nom || '') : '',
    lignes: (t.lignes || []).map(l => ({ qty: l.qty, nom: l.nom, prix: meta.offert ? null : l.prix })),
    totalLabel: meta.offert || ((tickets || []).length > 1 ? 'Sous-total' : 'Total'),
    totalValeur: meta.offert ? 'OFFERT' : `${euros(t.sousTotal)} EUR`,
    numero: t.numero,
    paiement: meta.paiement || '',
    date: meta.date || '',
    pied: meta.pied || '',
  }))
}

/** Ticket d'essai : sert à vérifier la connexion, la coupe et les accents */
export const ticketEssai = (festival, date) => ({
  festival: festival || 'YllaCash', mention: 'TICKET D\'ESSAI',
  standNumero: 0, standNom: 'Accents : é è à ç ù ê € œ',
  lignes: [{ qty: 1, nom: 'Article d\'essai', prix: 250 }, { qty: 2, nom: 'Un nom d\'article vraiment très long pour voir la coupe', prix: 1000 }],
  totalLabel: 'Total', totalValeur: '22,50 EUR', numero: '0-0', paiement: 'Aucun paiement', date,
  pied: 'Si les accents sont illisibles, cochez "Sans accents"',
})
