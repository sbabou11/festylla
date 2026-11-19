/**
 * utils/imprimante.js — liaison USB avec l'imprimante de tickets de la borne (WebUSB, Chrome Android)
 *
 * L'équipe connecte l'imprimante une fois (« Connecter l'imprimante ») : le navigateur retient
 * l'autorisation, et la borne la retrouve seule aux ouvertures suivantes. Les tickets partent
 * ensuite sans aucune fenêtre d'impression.
 *
 * Progression : l'imprimante ne dit pas où elle en est. On suit ce qui lui a été envoyé (par petits
 * paquets) et le temps que met le papier à sortir, estimé d'après la longueur du ticket.
 * Non essayé sur le matériel à l'écriture (20/11/2026) : à valider avec la première imprimante.
 */
const PAQUET = 512                 // octets par envoi : assez petit pour une progression régulière
const MS_PAR_LIGNE = 45            // temps d'impression estimé par ligne de ticket
const MS_COUPE = 600               // avance et coupe du papier

let appareil = null                // { device, endpoint, interfaceNumber }
const ecouteurs = new Set()
const prevenir = () => ecouteurs.forEach(f => { try { f(etat()) } catch {} })

export const supporte = () => typeof navigator !== 'undefined' && !!navigator.usb

export function etat() {
  return {
    supporte: supporte(),
    connectee: !!appareil,
    nom: appareil ? (appareil.device.productName || appareil.device.manufacturerName || 'Imprimante USB') : '',
  }
}

/** S'abonne aux changements d'état (connexion, débranchement). Renvoie la fonction de désabonnement. */
export function surChangement(f) { ecouteurs.add(f); return () => ecouteurs.delete(f) }

/** Ouvre l'appareil et réserve la sortie vers l'imprimante (interface « imprimante » de préférence) */
async function ouvrir(device) {
  if (!device.opened) await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)
  const candidats = []
  for (const itf of device.configuration.interfaces) {
    for (const alt of itf.alternates) {
      const out = alt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk')
      if (out) candidats.push({ itf, alt, out, imprimante: alt.interfaceClass === 7 })
    }
  }
  const choix = candidats.find(c => c.imprimante) || candidats[0]
  if (!choix) throw new Error('Cet appareil n\'est pas une imprimante de tickets.')
  await device.claimInterface(choix.itf.interfaceNumber)
  if (choix.alt.alternateSetting !== 0) await device.selectAlternateInterface(choix.itf.interfaceNumber, choix.alt.alternateSetting)
  appareil = { device, endpoint: choix.out.endpointNumber, interfaceNumber: choix.itf.interfaceNumber }
  prevenir()
  return etat()
}

/** Premier branchement : l'équipe choisit l'imprimante dans la fenêtre du navigateur (geste requis) */
export async function connecter() {
  if (!supporte()) throw new Error('Ce navigateur ne sait pas parler à une imprimante USB. Utilisez Chrome sur la tablette.')
  const device = await navigator.usb.requestDevice({ filters: [] })
  return ouvrir(device)
}

/** Aux ouvertures suivantes : retrouve l'imprimante déjà autorisée, sans rien demander */
export async function retrouver() {
  if (!supporte() || appareil) return etat()
  try {
    const connus = await navigator.usb.getDevices()
    for (const d of connus) {
      try { return await ouvrir(d) } catch { /* appareil autorisé mais pas une imprimante : suivant */ }
    }
  } catch { /* pas d'autorisation : l'équipe passera par « Connecter l'imprimante » */ }
  return etat()
}

export async function oublier() {
  const a = appareil
  appareil = null
  prevenir()
  if (a) { try { await a.device.close() } catch {} }
}

if (supporte()) {
  navigator.usb.addEventListener('disconnect', (e) => { if (appareil && e.device === appareil.device) { appareil = null; prevenir() } })
  navigator.usb.addEventListener('connect', () => { retrouver() })
}

const attendre = (ms) => new Promise(r => setTimeout(r, ms))

/** Durée d'impression estimée d'un ticket (octets ESC/POS), en millisecondes */
export function dureeEstimee(octets) {
  let lignes = 0
  for (const o of octets) if (o === 0x0a) lignes++
  return lignes * MS_PAR_LIGNE + MS_COUPE
}

/**
 * Imprime une série de tickets (tableaux d'octets). onProgress({ ticket, total, pourcent, resteMs })
 * est appelé au fil de l'eau. Rejette si l'imprimante n'est pas connectée ou ne répond pas.
 */
export async function imprimer(tickets, onProgress = () => {}) {
  if (!appareil) throw new Error('Imprimante non connectée.')
  const durees = tickets.map(dureeEstimee)
  const totalMs = durees.reduce((a, b) => a + b, 0) || 1
  let faitMs = 0
  const dire = (i, part) => {
    const ecoule = faitMs + durees[i] * part
    onProgress({ ticket: i + 1, total: tickets.length, pourcent: Math.min(100, Math.round((ecoule / totalMs) * 100)), resteMs: Math.max(0, totalMs - ecoule) })
  }
  for (let i = 0; i < tickets.length; i++) {
    const octets = tickets[i]
    const debut = Date.now()
    dire(i, 0)
    for (let pos = 0; pos < octets.length; pos += PAQUET) {
      const r = await appareil.device.transferOut(appareil.endpoint, octets.slice(pos, pos + PAQUET))
      if (r.status !== 'ok') throw new Error('L\'imprimante ne répond pas.')
      // L'envoi va plus vite que le papier : la progression ne dépasse pas le temps réellement écoulé
      const envoye = Math.min(1, (pos + PAQUET) / octets.length)
      dire(i, Math.min(envoye, (Date.now() - debut) / durees[i]))
    }
    // Le temps que le papier finisse de sortir et soit coupé
    while (Date.now() - debut < durees[i]) {
      dire(i, (Date.now() - debut) / durees[i])
      await attendre(120)
    }
    faitMs += durees[i]
  }
  onProgress({ ticket: tickets.length, total: tickets.length, pourcent: 100, resteMs: 0 })
}
