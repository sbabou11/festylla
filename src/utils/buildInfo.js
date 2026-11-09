/**
 * utils/buildInfo.js — Source UNIQUE des infos de version
 *
 * À chaque déploiement intentionnel, mettez à jour la ligne APP_VERSION
 * ci-dessous selon la convention SemVer (Major.Minor.Patch) :
 *   - 1.0.0 → 1.0.1 : correction de bug (patch)
 *   - 1.0.0 → 1.1.0 : nouvelle fonctionnalité (minor)
 *   - 1.0.0 → 2.0.0 : refonte majeure (major)
 *
 * Le numéro de build (timestamp) est calculé automatiquement par Vite à chaque
 * build pour différencier 2 déploiements de la même version.
 *
 * IMPORTANT : si vous modifiez APP_VERSION, mettez aussi à jour package.json
 * (champ "version") pour rester cohérent.
 */

// ═══════════════════════════════════════════════════════════════════════
// ➜ VERSION MANUELLE — Mettre à jour à chaque déploiement intentionnel
// ═══════════════════════════════════════════════════════════════════════
export const APP_VERSION = '2.0'

// Format public affiché dans l'app, exports, PDF, impressions, etc.
// Exemple : "YllaCash v1.0.0"
export const APP_VERSION_LABEL = `v${APP_VERSION}`

// Nom complet de l'app pour les titres de documents
export const APP_NAME = 'YllaCash'

// Nom complet + version pour les footers : "YllaCash v1.0.0"
export const APP_FULL_LABEL = `${APP_NAME} ${APP_VERSION_LABEL}`

// Crédits Maison Ylla (utilisés partout)
export const APP_AUTHOR = 'Maison Ylla'
export const APP_FOOTER_HTML = `${APP_NAME} ${APP_VERSION_LABEL} · Développée par <strong>${APP_AUTHOR}</strong>`

// ═══════════════════════════════════════════════════════════════════════
// Variables AUTO injectées par Vite au build (cf. vite.config.js → define)
// ═══════════════════════════════════════════════════════════════════════

// eslint-disable-next-line no-undef
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev'
// eslint-disable-next-line no-undef
export const APP_BUILD_DATE = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : null

// Format détaillé pour debug / À propos : "v1.0.0 · build 2105.0653"
export const APP_VERSION_LONG = `${APP_VERSION_LABEL} · build ${APP_BUILD}`

/**
 * Date du build au format français : "21/05/2026 06:53"
 */
export const APP_BUILD_DATE_LABEL = (() => {
  if (!APP_BUILD_DATE) return null
  try {
    const d = new Date(APP_BUILD_DATE)
    if (isNaN(d.getTime())) return null
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return null
  }
})()
