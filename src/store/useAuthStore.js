/**
 * store/useAuthStore.js — v4
 * Authentification + permissions + rôles staff
 */
import { create } from 'zustand'
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { verifyPassword } from '../utils/kpis'
import { persist } from 'zustand/middleware'


// Helper audit local (évite circular dep avec service.js)
const writeAudit = async (action, details = {}) => {
  try {
    const evRaw = localStorage.getItem('yllatok-event')
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

export const ROLE_PAGES = {
  super_admin:  ['evenements','accueil','analytics','comptabilite','operations','equipe-hub','spectateurs-hub','gestion-artistes','exposants','finances','editeur-template','cachets','menu','settings','mon-profil','planning','credit','retrait','debit','prendre-commande','retrait-commande','cuisine','remboursement','transactions','reservations-admin','nouveau','alertes','benevoles','staff','spectateurs','qr-entree'],
  admin:        ['accueil','analytics','comptabilite','operations','equipe-hub','spectateurs-hub','gestion-artistes','exposants','finances','editeur-template','cachets','menu','settings','mon-profil','planning','credit','retrait','debit','prendre-commande','retrait-commande','cuisine','remboursement','transactions','reservations-admin','nouveau','alertes','benevoles','staff','spectateurs','qr-entree'],
  billetterie:  ['accueil','operations','credit','nouveau','remboursement','transactions','spectateurs','qr-entree','mon-profil'],
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

        const uname = username.toLowerCase().trim()

        // Chercher dans Firebase
        try {
          // Chercher dans tous les événements par username
          // D'abord racine (legacy), puis events/{id}/staff
          let snap = await getDocs(query(collection(db, 'staff'), where('username', '==', uname)))
          if (snap.empty) {
            snap = await getDocs(query(collection(db, 'staff'), where('email', '==', uname)))
          }
          // Si pas trouvé en racine, chercher dans events/
          if (snap.empty) {
            const eventsSnap = await getDocs(collection(db, 'events'))
            for (const evDoc of eventsSnap.docs) {
              const evStaffSnap = await getDocs(
                query(collection(db, 'events', evDoc.id, 'staff'), where('username', '==', uname))
              )
              if (!evStaffSnap.empty) { snap = evStaffSnap; break }
              const evStaffEmailSnap = await getDocs(
                query(collection(db, 'events', evDoc.id, 'staff'), where('email', '==', uname))
              )
              if (!evStaffEmailSnap.empty) { snap = evStaffEmailSnap; break }

              // Chercher dans les bénévoles
              const evBenevSnap = await getDocs(
                query(collection(db, 'events', evDoc.id, 'benevoles'), where('username', '==', uname))
              )
              if (!evBenevSnap.empty) { snap = evBenevSnap; break }
            }
          }
          if (!snap.empty) {
            const data    = snap.docs[0].data()
            const docId   = snap.docs[0].id
            const storedPwd = data.password || data.pwd || null

            if (!storedPwd) {
              set({ loginLoading:false, loginError:"Aucun mot de passe défini. Contactez l’administrateur." })
              return false
            }
            const hashOk = data.passwordHash ? await verifyPassword(password, data.passwordHash) : false
            if (storedPwd !== password && !hashOk) {
              set({ loginLoading:false, loginError:'Email ou mot de passe incorrect' })
              return false
            }

            const userRole = data.role || 'benevole'
            // Chercher si ce staff a aussi un profil bénévole (même username)
            let benevoleDocId = null
            let benevoleEventId = null
            if (userRole !== 'benevole' && data.eventId) {
              try {
                const benevSnap = await getDocs(
                  query(collection(db, 'events', data.eventId, 'benevoles'), where('username', '==', uname))
                )
                if (!benevSnap.empty) {
                  benevoleDocId  = benevSnap.docs[0].id
                  benevoleEventId = data.eventId
                }
              } catch {}
            }
            const user  = { id:docId, nom:(data.prenom ? data.prenom+' '+data.nom : data.nom), email:data.email||'', username:data.username||uname, role:userRole, avatar:data.avatar||null, eventId:data.eventId||null, isBenevole: userRole === 'benevole', benevoleDocId, benevoleEventId }
            const token = btoa(JSON.stringify({ id:docId, role:data.role, exp:Date.now()+8*3600*1000 }))
            set({ user, token, loginLoading:false, loginError:null, espaceChoisi:'' })
            await writeAudit('CONNEXION', { staff: user.nom, role: user.role, userType: userRole === 'benevole' ? 'benevole' : 'staff', label: `Connexion de ${user.nom} (${userRole})` })
            // Auto-sélectionner l'événement du staff si défini
            if (data.eventId) {
              try {
                const evStore = window.__yllatok_stores__?.eventStore
                if (evStore) evStore.getState().selectEvent(data.eventId)
              } catch {}
            }
            return true
          }
        } catch (err) {
          console.error('Auth Firebase error:', err)
        }

        set({ loginLoading:false, loginError:'Email ou mot de passe incorrect' })
        return false
      },

      setEspaceChoisi: (val) => set({ espaceChoisi: val }),

      logout: () => {
        const { user } = get()
        if (user) writeAudit('DECONNEXION', { staff: user.nom, role: user.role, userType: user.role === 'benevole' ? 'benevole' : 'staff', label: `Déconnexion de ${user.nom}` }).catch(()=>{})
        set({ user:null, token:null, loginError:null, espaceChoisi:'' })
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

      // Réinitialiser son propre mot de passe (simulation)
      resetOwnPassword: async (newPassword) => {
        const { user } = get()
        if (!user) return false
        if (!newPassword || newPassword.length < 6) return false
        // On essaie d'abord le path attendu, puis le fallback racine si ça échoue.
        // Purge aussi passwordHash legacy pour ne pas que verifyPassword bloque le nouveau.
        const tryPaths = []
        if (user.eventId) tryPaths.push(doc(db, 'events', user.eventId, 'staff', user.id))
        tryPaths.push(doc(db, 'staff', user.id))
        for (const ref of tryPaths) {
          try {
            // updateDoc échoue si le doc n'existe pas → c'est notre indicateur pour passer au suivant
            await updateDoc(ref, { password: newPassword, passwordHash: null })
            try { await writeAudit('RESET_PWD_SELF', { staff: user.nom, userType: 'staff', label: `${user.nom} a changé son mot de passe` }) } catch {}
            return true
          } catch (e) {
            // doc inexistant à ce path → on essaie le suivant
            continue
          }
        }
        return false
      },

      // Demande de réinitialisation depuis Login (utilisateur qui a oublié son mdp)
      // → crée un document dans password-reset-requests visible par l'admin
      requestPasswordReset: async (identifier) => {
        const id = (identifier || '').toLowerCase().trim()
        if (!id) return { ok: false, reason: 'empty' }
        try {
          // On tente de retrouver l'utilisateur pour stocker un message utile à l'admin
          // (mais on ne révèle JAMAIS à l'appelant si le compte existe — anti-énumération)
          let foundUserInfo = null
          // Cherche racine
          let snap = await getDocs(query(collection(db, 'staff'), where('username', '==', id)))
          if (snap.empty) snap = await getDocs(query(collection(db, 'staff'), where('email', '==', id)))
          if (!snap.empty) {
            const d = snap.docs[0].data()
            foundUserInfo = { staffId: snap.docs[0].id, eventId: null, nom: d.prenom ? d.prenom + ' ' + d.nom : d.nom, role: d.role, email: d.email || '' }
          }
          // Cherche dans events si pas trouvé
          if (!foundUserInfo) {
            const eventsSnap = await getDocs(collection(db, 'events'))
            for (const evDoc of eventsSnap.docs) {
              const a = await getDocs(query(collection(db, 'events', evDoc.id, 'staff'), where('username', '==', id)))
              const found = !a.empty ? a : (await getDocs(query(collection(db, 'events', evDoc.id, 'staff'), where('email', '==', id))))
              if (!found.empty) {
                const d = found.docs[0].data()
                foundUserInfo = { staffId: found.docs[0].id, eventId: evDoc.id, nom: d.prenom ? d.prenom + ' ' + d.nom : d.nom, role: d.role, email: d.email || '' }
                break
              }
            }
          }
          // Crée la demande, qu'on ait trouvé ou pas (pour ne pas révéler l'existence)
          await addDoc(collection(db, 'password-reset-requests'), {
            identifier:  id,
            createdAt:   serverTimestamp(),
            status:      'pending',
            // Si on a trouvé, on pré-rempli pour faciliter le travail admin
            ...(foundUserInfo ? { staffId: foundUserInfo.staffId, staffNom: foundUserInfo.nom, staffRole: foundUserInfo.role, staffEmail: foundUserInfo.email, eventId: foundUserInfo.eventId } : {}),
          })
          // Toujours répondre OK : on ne donne aucun indice sur l'existence du compte
          return { ok: true }
        } catch (e) {
          return { ok: false, reason: 'firestore-error' }
        }
      },

      // Admin : réinitialiser le mdp d'un membre du staff
      resetStaffPassword: async (staffId, newPassword, evId) => {
        if (!newPassword || newPassword.length < 6) return false
        const tryPaths = []
        if (evId) tryPaths.push(doc(db, 'events', evId, 'staff', staffId))
        tryPaths.push(doc(db, 'staff', staffId))
        for (const ref of tryPaths) {
          try {
            await updateDoc(ref, { password: newPassword, passwordHash: null })
            const { user } = get()
            try { await writeAudit('RESET_PWD_STAFF', { targetId: staffId, staff: user?.nom, userType: 'admin', label: `Réinitialisation mot de passe staff #${staffId}` }) } catch {}
            return true
          } catch { continue }
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
          const stores = window.__yllatok_stores__ || {}
          const roles  = stores.appStore?.getState?.()?.roles || []
          const customRole = roles.find(r => r.id === user.role)
          if (customRole) return (customRole.pages || []).includes(pageId)
        } catch {}
        return false
      },

      setAvatar: (src) => set(s => ({ user: s.user ? { ...s.user, avatar:src } : null })),
      setNom:    (nom) => set(s => ({ user: s.user ? { ...s.user, nom } : null })),
    }),
    { name:'yllatok-auth', partialize:(s) => ({ user:s.user, token:s.token }) }
  )
)

export default useAuthStore
