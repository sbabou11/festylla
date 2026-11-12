/**
 * utils/scanWedge.js — lecteur de QR branché en USB ou Bluetooth (mode « clavier »)
 *
 * Le lecteur tape le contenu du QR très vite puis appuie sur Entrée. On distingue ces frappes
 * de celles d'un humain par leur rythme (moins de 60 ms entre deux caractères).
 *
 * Disposition du clavier : un lecteur réglé en QWERTY (réglage d'usine) sur une tablette en
 * AZERTY produit « FY) » au lieu de « FY- ». On garde donc deux lectures en parallèle :
 * le caractère reçu (event.key) et la touche physique traduite en QWERTY (event.code).
 * Celle qui contient un code spectateur valide l'emporte.
 */

// Touche physique → caractère sur un clavier QWERTY américain : [sans Maj, avec Maj]
const US = {
  Minus: ['-', '_'], Equal: ['=', '+'], Slash: ['/', '?'], Period: ['.', '>'], Comma: [',', '<'],
  Semicolon: [';', ':'], Quote: ["'", '"'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Backslash: ['\\', '|'], Backquote: ['`', '~'], Space: [' ', ' '],
}
const DIGIT_SHIFT = ')!@#$%^&*('

export function usCharFromCode(code, shift) {
  if (/^Key[A-Z]$/.test(code)) return shift ? code[3] : code[3].toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return shift ? DIGIT_SHIFT[+code[5]] : code[5]
  if (/^Numpad[0-9]$/.test(code)) return code[6]
  if (code === 'NumpadSubtract') return '-'
  return US[code]?.[shift ? 1 : 0] ?? ''
}

// Code spectateur dans un texte lu (code seul, lien ou texte libre) : « FY-4A2B » ou null
export function parseSpectatorCode(text) {
  const m = String(text || '').toUpperCase().match(/FY-[A-Z0-9]{3,8}/)
  return m ? m[0] : null
}

/**
 * Crée un écouteur de lecteur. feed(event) reçoit chaque keydown ; onScan(code) est appelé
 * quand une rafale se termine par Entrée (ou après un silence) et contient un code valide.
 * onUnknown(texte) : rafale lue mais sans code spectateur (QR d'un autre usage).
 */
export function createWedge({ onScan, onUnknown, maxGapMs = 60, minLength = 6, idleMs = 150, now = () => Date.now() }) {
  let byKey = '', byCode = '', last = 0, timer = null

  const reset = () => { byKey = ''; byCode = ''; clearTimeout(timer); timer = null }
  const finish = () => {
    const keyText = byKey, codeText = byCode
    reset()
    if (Math.max(keyText.length, codeText.length) < minLength) return false
    const code = parseSpectatorCode(keyText) || parseSpectatorCode(codeText)
    if (code) onScan?.(code)
    else onUnknown?.(keyText || codeText)
    return true
  }

  const feed = (e) => {
    const t = now()
    // Un écart humain entre deux touches : on repart de zéro
    if (t - last > maxGapMs) { byKey = ''; byCode = '' }
    last = t
    if (e.key === 'Enter' || e.key === 'Tab') {
      return finish()
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return false
    const fromKey = e.key && e.key.length === 1 ? e.key : ''
    const fromCode = usCharFromCode(e.code || '', !!e.shiftKey)
    if (!fromKey && !fromCode) return false
    byKey += fromKey
    byCode += fromCode
    // Certains lecteurs n'envoient pas Entrée : un court silence termine la lecture
    clearTimeout(timer)
    timer = setTimeout(finish, idleMs)
    return byKey.length > 1 // déjà en rafale : la page peut ignorer cette touche
  }

  return { feed, reset }
}
