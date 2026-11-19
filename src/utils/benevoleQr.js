/**
 * utils/benevoleQr.js — QR de l'espace bénévole lu à la borne (parcours du 19/11/2026)
 *
 * Le QR contient le lien personnel : …/benevole?id=<fiche>&ev=<événement>&k=<clé>.
 * La borne en tire la fiche et la clé, que le serveur vérifie (api/borne.js).
 * On essaie chaque lecture (touches et codes clavier) : selon la disposition du clavier,
 * l'une des deux restitue correctement les « ? », « = » et « & ».
 */
export function parseBenevoleQr(...lectures) {
  for (const t of lectures) {
    const m = String(t || '').match(/\/benevole\?([^\s#]+)/i)
    if (!m) continue
    const p = new URLSearchParams(m[1])
    const id = p.get('id') || ''
    const cle = (p.get('k') || '').toLowerCase()
    if (/^[\w-]{1,128}$/.test(id) && /^[0-9a-f]{20,64}$/.test(cle)) return { id, cle, ev: p.get('ev') || null }
  }
  return null
}
