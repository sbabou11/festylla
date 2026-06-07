/**
 * store/useAppStore.js — v3 Firebase
 * Les données viennent de Firebase via useFirestore.
 * Les actions appellent Firebase → les listeners → mise à jour UI.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as svc        from '../firebase/service'
import useAuthStore    from './useAuthStore'
import useEventStore from './useEventStore'

const hexToRgba = (hex, a) => {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}
const darken = (hex,amt) => '#'+[
  parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)
].map(x=>Math.max(0,Math.round(x*(1-amt))).toString(16).padStart(2,'0')).join('')

const DEFAULT_THEME = {
  brand:'#1a6b7a',purple:'#e8614a',bg:'#ffffff',bg2:'#f0f8f9',text:'#0d2d33',
  font:"'Inter',system-ui,sans-serif",fontSize:13,radius:10,
  qrColor:'#1a6b7a',qrBg:'#ffffff',festName:'YllaCash',
  logoSrc:'/logo.png',bannerSrc:null,qrLogoSrc:null,isDark:false,
}

const useAppStore = create(
  persist(
    (set, get) => ({
      spectateurs:[],reservations:[],menu:[],staff:[],logs:[],roles:[],categories:[],planning:[],expositions:[],
      currentSpecId:'FY-4A2B',currentStaffId:'s5',
      offline:false,offlineQueue:[],
      theme:DEFAULT_THEME,

      // Setters temps réel (appelés par useFirestore)
      setSpectateurs: (d)=>set({spectateurs:d}),
      setRoles:        (d)=>set({roles:d}),
      setCategories:   (d)=>set({categories:d}),
      setReservations:(d)=>set({reservations:d}),
      setMenu:        (d)=>set({menu:d}),
      setStaff:       (d)=>set({staff:d}),
      setLogs:        (d)=>set({logs:d}),
      setPlanning:    (d)=>set({planning:d}),
      setExpositions: (d)=>set({expositions:d}),
      // ID du template de facture en cours d'édition (utilisé pour ouvrir
      // l'éditeur visuel sur un template précis). null = nouveau, sinon id Firestore.
      editingTemplateId: null,
      setEditingTemplateId: (id)=>set({editingTemplateId:id}),

      // Spectateurs
      createSpectateur:(nom,euros)=>svc.createSpectateur(nom,euros),
      setSpecAvatar:(id,src)=>{const s=get().spectateurs.find(x=>x.id===id);if(s?._docId)svc.updateSpecAvatar(s._docId,src)},
      updateSpecNom:(id,nom)=>{const s=get().spectateurs.find(x=>x.id===id);if(s?._docId)svc.updateSpecNom(s._docId,nom)},

      // Transactions
      crediter:(specId,euros,staff,evId) => {
        const id = evId || useEventStore.getState().currentEventId
        return svc.crediter(specId,euros,staff,id)
      },
      debiter:(specId,items,staff,evId) => {
        const id = evId || useEventStore.getState().currentEventId
        return svc.debiter(specId,items,staff,id)
      },

      // Réservations
      creerReservation:(specId,items)=>{
        const spec=get().spectateurs.find(s=>s.id===specId)
        return svc.creerReservation(specId,spec?.nom||'',items)
      },
      validerRetrait:(id,staff)=>svc.validerRetrait(id,staff),
      prendreEnCharge:(id) => {
        const u = useAuthStore.getState().user
        return svc.prendreEnCharge(id, u?.nom || 'Staff', u?.id || '')
      },
      marquerResaPrete:(id) => {
        const u = useAuthStore.getState().user
        const isAdmin = u?.role === 'admin' || u?.role === 'super_admin'
        return svc.marquerResaPrete(id, u?.nom || 'Staff', u?.id || '', isAdmin)
      },
      deleteReservation:(id) => svc.deleteReservation(id),
      annulerReservation:(id, motif) => {
        const u = useAuthStore.getState().user
        const isAdmin = u?.role === 'admin' || u?.role === 'super_admin'
        return svc.annulerReservation(id, u?.nom || 'Staff', u?.id || '', isAdmin, motif, u?.role || 'stand')
      },

      // Menu
      addMenuItem:(item)=>svc.addMenuItem(item),
      updateMenuItem:(id,patch)=>svc.updateMenuItem(id,patch),
      deleteMenuItem:(id)=>svc.deleteMenuItem(id),

      // Staff
      addStaff:(m) => {
        const evId = useEventStore.getState().currentEventId
        return svc.addStaff(m, evId)
      },
      deleteStaff:(id) => {
        const evId = useEventStore.getState().currentEventId
        return svc.deleteStaffMember(id, evId)
      },
      updateStaffEvents:(id,data)=>{
        const evId = useEventStore.getState().currentEventId
        return svc.updateStaffEvents(id,data,evId)
      },

      // Rôles personnalisés
      createRole:(role)=>svc.createRole(role),

      // Catégories
      createCategory:(cat) => {
        const evId = useEventStore.getState().currentEventId
        if (!evId) throw new Error('Aucun événement sélectionné')
        return svc.createCategory(cat, evId)
      },
      updateCategory:(id,patch) => {
        const evId = useEventStore.getState().currentEventId
        return svc.updateCategory(id, patch, evId)
      },
      deleteCategory:(id) => {
        const evId = useEventStore.getState().currentEventId
        return svc.deleteCategory(id, evId)
      },
      updateRole:(id,patch)=>svc.updateRole(id,patch),
      deleteRole:(id)=>svc.deleteRole(id),
      updateStaffRole:(id,role) => {
        const evId = useEventStore.getState().currentEventId
        return svc.updateStaffRole(id, role, evId)
      },
      setStaffAvatar:(id,src)=>{
        const evId = useEventStore.getState().currentEventId
        return svc.updateStaffAvatar(id,src,evId)
      },
      updateStaffNom:(id,nom)=>{
        const evId = useEventStore.getState().currentEventId
        import('firebase/firestore').then(({updateDoc,doc})=>{
          import('../firebase/config').then(({db})=>{
            const ref = evId ? doc(db,'events',evId,'staff',id) : doc(db,'staff',id)
            updateDoc(ref,{nom})
          })
        })
      },

      // Thème
      updateTheme:(patch)=>{
        const next={...get().theme,...patch}
        set({theme:next})
        get().applyThemeToDom()
        const evId = useEventStore.getState().currentEventId
        svc.saveSettings({theme:next,festName:next.festName}, evId).catch(()=>{})
      },
      resetTheme:()=>{ const evId = useEventStore.getState().currentEventId; set({theme:DEFAULT_THEME});get().applyThemeToDom();svc.saveSettings({theme:DEFAULT_THEME},evId).catch(()=>{})},
      applyThemeToDom:()=>{
        const t=get().theme,root=document.documentElement
        root.style.setProperty('--brand',t.brand)
        root.style.setProperty('--brand-dark',darken(t.brand,.18))
        root.style.setProperty('--brand-light',hexToRgba(t.brand,.12))
        root.style.setProperty('--purple',t.purple)
        root.style.setProperty('--purple-light',hexToRgba(t.purple,.12))
        root.style.setProperty('--font',t.font)
        root.style.setProperty('--font-size',t.fontSize+'px')
        root.style.setProperty('--radius',t.radius+'px')
        root.style.setProperty('--radius-lg',(t.radius+4)+'px')
        if(!t.isDark){
          root.style.setProperty('--bg',t.bg)
          root.style.setProperty('--bg2',t.bg2)
          root.style.setProperty('--text',t.text)
        }
        document.body.classList.toggle('dark',!!t.isDark)
      },

      // Offline — Firebase gère nativement via IndexedDB
      setOffline:(v)=>set({offline:v}),
      syncOfflineQueue:()=>set({offlineQueue:[],offline:false}),
    }),
    {
      name:'yllatok-store-v3',
      onRehydrateStorage: () => (state) => {
        // Migration YllaTok → YllaCash dans le thème persisté
        if (state?.theme?.festName === 'YllaTok') {
          state.theme.festName = 'YllaCash'
        }
      },
      partialize:(s)=>({theme:s.theme,currentSpecId:s.currentSpecId,currentStaffId:s.currentStaffId}),
    }
  )
)

export default useAppStore

// Registre global pour accès inter-stores sans import circulaire
if (typeof window !== 'undefined') {
  window.__yllatok_stores__ = window.__yllatok_stores__ || {}
  window.__yllatok_stores__.appStore = useAppStore
}
