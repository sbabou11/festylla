/**
 * utils/migrateStorageKeys.js — renommage YllaTok → YllaCash des clés localStorage
 * Importé en tout premier dans main.jsx, avant la création des stores persistés,
 * pour que les appareils déjà connectés gardent session, événement et thème.
 * Ne touche pas aux identifiants Firebase (le projet s'appelle toujours "yllatok").
 */
const RENAMES = {
  'yllatok-auth':               'yllacash-auth',
  'yllatok-event':              'yllacash-event',
  'yllatok-store-v3':           'yllacash-store-v3',
  'yllatok-alertes-acquittees': 'yllacash-alertes-acquittees',
  'yllatok-fcm-token':          'yllacash-fcm-token',
  'yllatok-sidebar-v2':         'yllacash-sidebar-v2',
}

try {
  for (const [oldKey, newKey] of Object.entries(RENAMES)) {
    const value = localStorage.getItem(oldKey)
    if (value === null) continue
    if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value)
    localStorage.removeItem(oldKey)
  }
  // Ancienne clé déjà abandonnée par la Sidebar
  localStorage.removeItem('yllatok-sidebar-collapsed')
} catch {}
