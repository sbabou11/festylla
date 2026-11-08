/**
 * utils/errors.js — traduit une erreur technique en message compréhensible
 * toast.error(friendlyError(e, "La recharge n'est pas passée."), { action: { label: 'Réessayer', onClick: retry } })
 * Les messages métier déjà en français (« Solde insuffisant ») sont conservés.
 * Formulation neutre : ni tu ni vous, elle s'affiche sur les écrans staff comme publics.
 */
const BY_CODE = {
  'permission-denied':   "Ce compte n'a pas les droits pour cette action.",
  'unauthenticated':     'La session a expiré, il faut se reconnecter.',
  'unavailable':         'Le réseau ne répond pas, un nouvel essai est possible.',
  'deadline-exceeded':   'Le réseau répond trop lentement, un nouvel essai est possible.',
  'not-found':           "L'élément n'existe plus, il faut recharger la page.",
  'already-exists':      'Cet élément existe déjà.',
  'resource-exhausted':  'Le service est saturé, un nouvel essai est possible dans un instant.',
  'failed-precondition': "L'opération n'est pas possible pour le moment.",
  'aborted':             'Une autre modification est passée en même temps, un nouvel essai est possible.',
}

const TECHNICAL = /firebase|firestore|undefined|null|cannot read|is not |failed to fetch|network|typeerror|permission|missing|insufficient|invalid/i

export function friendlyError(e, what = '') {
  if (e) console.warn(what || 'Erreur', e)
  const code = String(e?.code || '').replace(/^firestore\//, '')
  const reason = BY_CODE[code]
    || (!navigator.onLine && 'Le réseau ne répond pas, un nouvel essai est possible.')
    || (e?.message && !e.code && !TECHNICAL.test(e.message) ? e.message : '')
    || 'Un nouvel essai est possible dans un instant.'
  return what ? `${what} ${reason}` : reason
}
