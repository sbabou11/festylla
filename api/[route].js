/**
 * api/[route].js — point d'entrée unique des fonctions serveur JavaScript (Vercel)
 *
 * Le plan Hobby de Vercel accepte 12 fonctions au plus ; chaque fichier de api/ en est une.
 * Les traitements sont rangés dans api/_routes/ (les dossiers commençant par « _ » ne sont pas
 * des fonctions) et ce seul fichier les sert à leurs adresses habituelles : /api/session,
 * /api/connexion, /api/borne… Les adresses et les traitements ne changent pas.
 * Les fonctions Python (rapport-pdf.py, comptabilite-pdf.py) restent à part.
 *
 * Pour ajouter une fonction : créer api/_routes/<nom>.js et l'inscrire ci-dessous.
 */
const ROUTES = {
  'analyse-xlsx':      () => require('./_routes/analyse-xlsx'),
  'archive-file':      () => require('./_routes/archive-file'),
  audit:               () => require('./_routes/audit'),
  billets:             () => require('./_routes/billets'),
  borne:               () => require('./_routes/borne'),
  cachets:             () => require('./_routes/cachets'),
  comptabilite:        () => require('./_routes/comptabilite'),
  connexion:           () => require('./_routes/connexion'),
  'generate-image':    () => require('./_routes/generate-image'),
  inscription:         () => require('./_routes/inscription'),
  liaisons:            () => require('./_routes/liaisons'),
  manifest:            () => require('./_routes/manifest'),
  'mot-de-passe':      () => require('./_routes/mot-de-passe'),
  paiement:            () => require('./_routes/paiement'),
  'process-entrees':   () => require('./_routes/process-entrees'),
  'process-reminders': () => require('./_routes/process-reminders'),
  qr:                  () => require('./_routes/qr'),
  rapport:             () => require('./_routes/rapport'),
  securite:            () => require('./_routes/securite'),
  'send-push':         () => require('./_routes/send-push'),
  session:             () => require('./_routes/session'),
  transactions:        () => require('./_routes/transactions'),
}

/** Nom de la route : paramètre [route] fourni par Vercel, sinon dernier segment de l'adresse */
function routeOf(req) {
  const q = req.query && req.query.route
  if (typeof q === 'string' && q) return q
  return String(req.url || '').split('?')[0].replace(/\/+$/, '').split('/').pop()
}

module.exports = async (req, res) => {
  const load = Object.prototype.hasOwnProperty.call(ROUTES, routeOf(req)) ? ROUTES[routeOf(req)] : null
  if (!load) { res.status(404).json({ error: 'Adresse inconnue.' }); return }
  // Le paramètre de route ne doit pas se mêler aux paramètres lus par les traitements
  if (req.query && typeof req.query === 'object') delete req.query.route
  return load()(req, res)
}

module.exports.ROUTES = ROUTES
module.exports.routeOf = routeOf
