/**
 * store/useAuthStore.js — v4
 * Authentification + permissions + rôles staff
 */
import { create } from 'zustand'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, getAdditionalUserInfo } from 'firebase/auth'
import { db, auth } from '../firebase/config'
import { jwtClaims, microsoftErrorMessage, tenantAllowed } from '../utils/msAccount'
import { apiFetch, openFirebaseSession, closeFirebaseSession } from '../firebase/session'
import { persist } from 'zustand/middleware'

// Annuaire Microsoft Fest'Ylla (ID de l'annuaire / locataire). Vide : pas de bouton Microsoft.
export const MS_TENANT = (import.meta.env.VITE_MS_TENANT_ID || '').trim()

const msProvider = () => {
  const provider = new OAuthProvider('microsoft.com')
  provider.setCustomParameters({ tenant: MS_TENANT })
  return provider
}
let redirectCheck = null

// Après Microsoft (fenêtre ou redirection) : le serveur relie la personne à SA fiche par son e-mail
// et ouvre la session YllaCash. Une adresse sans fiche est refusée. Le rôle est celui de la fiche.
async function finishMicrosoft(set, result) {
  try {
    const credential = OAuthProvider.credentialFromResult(result)
    const info = { user: result.user, profile: getAdditionalUserInfo(result)?.profile, claims: jwtClaims(credential?.idToken) }
    if (!tenantAllowed(info, MS_TENANT)) {
      await closeFirebaseSession()
      set({ loginLoading:false, loginError:"Ce compte Microsoft n'appartient pas à l'annuaire Maison Ylla." })
      return false
    }
    const idToken = await result.user.getIdToken()
    const { token, compte } = await apiFetch('/api/connexion', { body: { mode: 'microsoft', idToken } })
    await openFirebaseSession(token)
    return openSession(set, compte, 'microsoft')
  } catch (err) {
    console.error('Connexion Microsoft :', err)
    await closeFirebaseSession()
    set({ loginLoading:false, loginError: err?.status ? err.message : microsoftErrorMessage(err?.code || 'lecture-des-fiches') })
    return false
  }
}


// Helper audit local (évite circular dep avec service.js)
const writeAudit = async (action, details = {}) => {
  try {
    const evRaw = localStorage.getItem('yllacash-event')
    const evId  = evRaw ? JSON.parse(evRaw)?.state?.currentEventId : null
    const col   = evId
      ? collection(db, 'events', evId, 'audit')
      : collection(db, 'audit')
    await addDoc(col, {
      action, ...details,
      date:      new Date().toLocaleString('fr-FR'),
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  } catch {}
}

// Génère un username depuis un nom complet : "Samba Babou" → "sbabou"
export const genUsername = (nom = '') => {
  const parts = nom.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlever accents
    .replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  // Première lettre du prénom + nom de famille
  return parts[0][0] + parts[parts.length - 1]
}


export const PERMISSIONS = {
  super_admin:  { credit:true,  debit:true,  retrait:true,  rapports:true,  menu:true,  staff:true,  studio:true,  reservations:true,  analytics:true,  alertes:true  },
  admin:        { credit:true,  debit:true,  retrait:true,  rapports:true,  menu:true,  staff:true,  studio:false, reservations:true,  analytics:true,  alertes:true  },
  billetterie:  { credit:true,  debit:false, retrait:false, rapports:false, menu:false, staff:false, studio:false, reservations:false, analytics:false, alertes:false },
  stand:        { credit:false, debit:true,  retrait:true,  rapports:false, menu:false, staff:false, studio:false, reservations:true,  analytics:false, alertes:false },
  consultation: { credit:false, debit:false, retrait:false, rapports:true,  menu:false, staff:false, studio:false, reservations:true,  analytics:true,  alertes:false },
  directeur_artistique: { credit:false, debit:false, retrait:false, rapports:false, menu:false, staff:false, studio:false, reservations:false, analytics:false, alertes:false },
}

// Ouvre la session YllaCash d'une fiche renvoyée par le serveur (mot de passe ou Microsoft).
// La fiche ne contient jamais de mot de passe ; l'audit de connexion est écrit par le serveur.
function openSession(set, compte, method) {
  const userRole = compte.kind === 'benevole' ? 'benevole' : (compte.role || 'benevole')
  const user = {
    id: compte.id, nom: (compte.prenom ? compte.prenom + ' ' + compte.nom : compte.nom), email: compte.email || '',
    username: compte.username || '', role: userRole, avatar: compte.avatar || null, eventId: compte.eventId || null,
    isBenevole: userRole === 'benevole', benevoleDocId: compte.benevoleDocId || null, benevoleEventId: compte.benevoleEventId || null,
    via: method,
  }
  const token = btoa(JSON.stringify({ id: compte.id, role: userRole, exp: Date.now() + 8 * 3600 * 1000 }))
  set({ user, token, loginLoading:false, loginError:null, espaceChoisi:'' })
  // Auto-sélectionner l'événement du staff si défini
  if (compte.eventId) {
    try {
      const evStore = window.__yllacash_stores__?.eventStore
      if (evStore) evStore.getState().selectEvent(compte.eventId)
    } catch {}
  }
  return true
}

/** Fixe le mot de passe d'une fiche (administrateur) : 'events/<ev>/staff/<id>', 'staff/<id>' ou 'events/<ev>/benevoles/<id>' */
export async function setPasswordFor(cible, nouveau) {
  await apiFetch('/api/mot-de-passe', { body: { mode: 'definir', cible, nouveau } })
  return true
}

export const ROLE_PAGES = {
  super_admin:  ['evenements','accueil','dashboard','analytics','cloture','comptabilite','operations','equipe-hub','spectateurs-hub','gestion-artistes','exposants','finances','editeur-template','cachets','menu','settings','mon-profil','planning','credit','commande-sur-place','retrait','debit','prendre-commande','retrait-commande','cuisine','remboursement','transactions','reservations-admin','nouveau','alertes','benevoles','staff','spectateurs','qr-entree','entree'],
  admin:        ['accueil','dashboard','analytics','cloture','comptabilite','operations','equipe-hub','spectateurs-hub','gestion-artistes','exposants','finances','editeur-template','cachets','menu','settings','mon-profil','planning','credit','commande-sur-place','retrait','debit','prendre-commande','retrait-commande','cuisine','remboursement','transactions','reservations-admin','nouveau','alertes','benevoles','staff','spectateurs','qr-entree','entree'],
  billetterie:  ['accueil','operations','credit','commande-sur-place','nouveau','cloture','remboursement','transactions','spectateurs','qr-entree','entree','mon-profil'],
  stand:        ['accueil','operations','retrait','debit','prendre-commande','retrait-commande','cuisine','reservations-admin','transactions','mon-profil'],
  consultation: ['accueil','transactions','reservations-admin','analytics','comptabilite','mon-profil'],
  directeur_artistique: ['accueil','gestion-artistes','planning','cachets','mon-profil'],
  benevole:     ['mon-profil'],
}

export const ROLE_HOME = {
  super_admin:'evenements', admin:'accueil', billetterie:'accueil', stand:'accueil', consultation:'accueil', directeur_artistique:'accueil', benevole:'mon-profil',
}

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:null, token:null, loginError:null, loginLoading:false, espaceChoisi:'',

      login: async (username, password) => {
        set({ loginLoading:true, loginError:null })
        try {
          // Le mot de passe est vérifié par le serveur, jamais dans le navigateur
          const { token, compte } = await apiFetch('/api/connexion', {
            body: { mode: 'motdepasse', identifiant: username.toLowerCase().trim(), motDePasse: password },
          })
          await openFirebaseSession(token)
          return openSession(set, compte, 'motdepasse')
        } catch (err) {
          console.error('Connexion :', err)
          // Messages du serveur (identifiants, trop d'essais…) affichés tels quels ; sinon panne ou réseau
          set({ loginLoading:false, loginError: [400, 401, 403, 429].includes(err?.status) ? err.message : 'Connexion impossible pour le moment : vérifiez le réseau et réessayez.' })
          return false
        }
      },

      // Connexion avec le compte Microsoft Fest'Ylla : relie la personne à SA fiche par son e-mail.
      // Une adresse sans fiche est refusée (aucun accès n'est créé). Le rôle est celui de la fiche.
      loginMicrosoft: async () => {
        if (!MS_TENANT) { set({ loginError: "La connexion Microsoft n'est pas configurée." }); return false }
        if (get().loginLoading) return false
        set({ loginLoading:true, loginError:null })
        let result
        try {
          result = await signInWithPopup(auth, msProvider())
        } catch (err) {
          console.error('Connexion Microsoft :', err)
          set({ loginLoading:false, loginError: microsoftErrorMessage(err?.code) })
          return false
        }
        return finishMicrosoft(set, result)
      },

      // Connexion automatique (lien de la page des plateformes) : la page part chez Microsoft
      // et revient connectée ; le retour est traité par completeMicrosoftRedirect().
      loginMicrosoftRedirect: async () => {
        if (!MS_TENANT || get().loginLoading) return
        set({ loginLoading:true, loginError:null })
        try { await signInWithRedirect(auth, msProvider()) }
        catch (err) {
          console.error('Connexion Microsoft :', err)
          set({ loginLoading:false, loginError: microsoftErrorMessage(err?.code) })
        }
      },

      // Au chargement de l'écran de connexion : termine une connexion Microsoft revenue par redirection.
      // Renvoie true si une session a été ouverte. Un seul traitement par chargement de page.
      completeMicrosoftRedirect: () => {
        if (!MS_TENANT) return Promise.resolve(false)
        if (!redirectCheck) redirectCheck = (async () => {
          let result
          try { result = await getRedirectResult(auth) }
          catch (err) {
            console.error('Connexion Microsoft :', err)
            set({ loginLoading:false, loginError: microsoftErrorMessage(err?.code) })
            return false
          }
          if (!result) return false
          set({ loginLoading:true, loginError:null })
          return finishMicrosoft(set, result)
        })()
        return redirectCheck
      },

      setEspaceChoisi: (val) => set({ espaceChoisi: val }),

      logout: () => {
        const { user } = get()
        // L'audit part encore avec la session, puis la session Firebase est fermée
        const audit = user ? writeAudit('DECONNEXION', { staff: user.nom, role: user.role, userType: user.role === 'benevole' ? 'benevole' : 'staff', label: `Déconnexion de ${user.nom}` }).catch(()=>{}) : Promise.resolve()
        set({ user:null, token:null, loginError:null, espaceChoisi:'' })
        audit.finally(() => closeFirebaseSession())
      },

      checkSession: () => {
        const { token } = get()
        if (!token) return false
        try {
          const payload = JSON.parse(atob(token))
          if (payload.exp < Date.now()) { set({ user:null, token:null }); return false }
          return true
        } catch { set({ user:null, token:null }); return false }
      },

      // Changer son propre mot de passe (la session prouve l'identité)
      resetOwnPassword: async (newPassword) => {
        if (!get().user || !newPassword || newPassword.length < 6) return false
        try { await apiFetch('/api/mot-de-passe', { body: { mode: 'changer', nouveau: newPassword } }); return true }
        catch (e) { console.warn('resetOwnPassword', e); return false }
      },

      // Demande de réinitialisation depuis Login (mot de passe oublié) : traitée par le serveur,
      // qui ne révèle jamais si le compte existe
      requestPasswordReset: async (identifier) => {
        const id = (identifier || '').toLowerCase().trim()
        if (!id) return { ok: false, reason: 'empty' }
        try { await apiFetch('/api/connexion', { body: { mode: 'reinitialisation', identifiant: id } }); return { ok: true } }
        catch { return { ok: false, reason: 'firestore-error' } }
      },

      // Admin : nouveau mot de passe pour un membre de l'équipe (fiche de l'événement, sinon racine)
      resetStaffPassword: async (staffId, newPassword, evId) => {
        if (!newPassword || newPassword.length < 6) return false
        const paths = [...(evId ? [`events/${evId}/staff/${staffId}`] : []), `staff/${staffId}`]
        for (const cible of paths) {
          try { await setPasswordFor(cible, newPassword); return true }
          catch (e) { if (e.status !== 404) { console.warn('resetStaffPassword', e); return false } }
        }
        return false
      },

      can: (permission) => {
        const { user } = get()
        if (!user) return false
        return PERMISSIONS[user.role]?.[permission] ?? false
      },

      canAccessPage: (pageId) => {
        const { user } = get()
        if (!user) return false
        // Rôles intégrés
        if (ROLE_PAGES[user.role]) return ROLE_PAGES[user.role].includes(pageId)
        // Rôles personnalisés — lire depuis le store via le registre global
        try {
          // Accès indirect pour éviter les imports circulaires
          const stores = window.__yllacash_stores__ || {}
          const roles  = stores.appStore?.getState?.()?.roles || []
          const customRole = roles.find(r => r.id === user.role)
          if (customRole) return (customRole.pages || []).includes(pageId)
        } catch {}
        return false
      },

      // Revérifie le mot de passe de la personne connectée (actions destructrices), par le serveur
      verifyOwnPassword: async (password) => {
        if (!get().user || !password) return false
        try { return (await apiFetch('/api/mot-de-passe', { body: { mode: 'verifier', motDePasse: password } })).ok === true }
        catch { return false }
      },

      setAvatar: (src) => set(s => ({ user: s.user ? { ...s.user, avatar:src } : null })),
      setNom:    (nom) => set(s => ({ user: s.user ? { ...s.user, nom } : null })),
    }),
    { name:'yllacash-auth', partialize:(s) => ({ user:s.user, token:s.token }) }
  )
)

export default useAuthStore
