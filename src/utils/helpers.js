/**
 * utils/helpers.js
 * Fonctions utilitaires + thèmes prédéfinis YllaCash
 */

export const fmt = (centimes) =>
  (centimes / 100).toFixed(2).replace('.', ',') + '€'

export const initials = (nom = '') =>
  nom.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase()

export const uid = () =>
  'FY-' + Math.random().toString(36).slice(2, 6).toUpperCase()

export const nowStr = () => {
  const d = new Date()
  return (
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  )
}

export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

export const darkenHex = (hex, amt) => {
  let r = parseInt(hex.slice(1, 3), 16)
  let g = parseInt(hex.slice(3, 5), 16)
  let b = parseInt(hex.slice(5, 7), 16)
  return '#' + [
    Math.max(0, Math.round(r * (1 - amt))),
    Math.max(0, Math.round(g * (1 - amt))),
    Math.max(0, Math.round(b * (1 - amt))),
  ].map(x => x.toString(16).padStart(2, '0')).join('')
}

export const hexToRgba = (hex, alpha = 1) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export const RESA_STATUS_LABEL = {
  pending:   'En attente',
  ready:     'Prêt à retirer',
  collected: 'Retiré',
}

export const TX_CONFIG = {
  credit:      { label: 'Crédit',      color: 'green',  icon: 'plus'     },
  debit:       { label: 'Débit',       color: 'red',    icon: 'minus'    },
  reservation: { label: 'Réservation', color: 'amber',  icon: 'bookmark' },
  annulation:  { label: 'Annulation',  color: 'purple', icon: 'arrow-back'},
}

export const ROLE_PERMISSIONS = {
  admin:        { credit:true,  debit:true,  retrait:true,  rapports:true,  menu:true,  staff:true,  studio:true  },
  billetterie:  { credit:true,  debit:false, retrait:false, rapports:false, menu:false, staff:false, studio:false },
  stand:        { credit:false, debit:true,  retrait:true,  rapports:false, menu:false, staff:false, studio:false },
  consultation: { credit:false, debit:false, retrait:false, rapports:true,  menu:false, staff:false, studio:false },
}

// Thèmes prédéfinis — YllaCash en premier avec les couleurs du logo
export const PRESETS = [
  { name:'YllaCash',  brand:'#1a6b7a', purple:'#e8614a', bg:'#ffffff', bg2:'#f0f8f9', text:'#0d2d33', isDark:false },
  { name:'Festif',   brand:'#1D9E75', purple:'#534AB7', bg:'#ffffff', bg2:'#f5f5f3', text:'#1a1a1a', isDark:false },
  { name:'Soleil',   brand:'#E8A100', purple:'#C43B00', bg:'#fffdf5', bg2:'#fef9e7', text:'#1a1000', isDark:false },
  { name:'Nuit',     brand:'#1a6b7a', purple:'#e8614a', bg:'#0a1a1d', bg2:'#0f2428', text:'#e0f5f8', isDark:true  },
  { name:'Mer',      brand:'#0284C7', purple:'#0891B2', bg:'#f0f9ff', bg2:'#e0f2fe', text:'#0c2340', isDark:false },
  { name:'Rock',     brand:'#e8614a', purple:'#7C3AED', bg:'#0a0a0a', bg2:'#1c1c1c', text:'#ffffff', isDark:true  },
]
