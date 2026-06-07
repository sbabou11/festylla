/**
 * Thème par défaut YllaCash — palette Maison Ylla 2026
 * Couleurs extraites du logo :
 *   - Teal vibrant  : #009090  (mains, couleur signature)
 *   - Marine        : #003048  (texte/structure)
 *   - Coral         : #F07848  (mains en dégradé, chaleur)
 *   - Or            : #D89030  (maison, rayons)
 *   - Brique        : #D83030  (toit, alertes)
 *   - Crème         : #FFF8F2  (fond chaud)
 */

export const DEFAULT_THEME = {
  brand:     '#009090',   // Teal signature du logo
  purple:    '#F07848',   // Coral (utilisé comme accent secondaire)
  bg:        '#FFFCF8',   // Crème clair
  bg2:       '#FFF8F2',   // Crème de surface
  text:      '#003048',   // Marine du logo
  font:      "'Inter',system-ui,sans-serif",
  fontSize:  14,
  radius:    8,
  qrColor:   '#003048',   // QR en marine pour scan optimal
  qrBg:      '#FFF8F2',   // Fond crème pour QR
  festName:  'YllaCash',
  logoSrc:   '/logo.png',
  bannerSrc: null,
  qrLogoSrc: null,
  isDark:    false,
}

export const PRESETS = [
  { name:'Maison Ylla', brand:'#009090', purple:'#F07848', bg:'#FFFCF8', bg2:'#FFF8F2', text:'#003048', isDark:false },
  { name:'Festif',      brand:'#1D9E75', purple:'#F07848', bg:'#FFFCF8', bg2:'#F5F5F3', text:'#1a1a1a', isDark:false },
  { name:'Soleil',      brand:'#D89030', purple:'#D83030', bg:'#FFFCF5', bg2:'#FAEED4', text:'#3D2400', isDark:false },
  { name:'Nuit Ylla',   brand:'#14B5B5', purple:'#FF8A5C', bg:'#001824', bg2:'#002438', text:'#FFF8F2', isDark:true  },
  { name:'Mer',         brand:'#0284C7', purple:'#0E8D7A', bg:'#F0F9FF', bg2:'#E0F2FE', text:'#0C2340', isDark:false },
  { name:'Rock',        brand:'#FF8A5C', purple:'#B89AE6', bg:'#0A0A0A', bg2:'#1C1C1C', text:'#FFFFFF', isDark:true  },
  { name:'Nature',      brand:'#4D7C0F', purple:'#D89030', bg:'#FAFAF5', bg2:'#F0F5E8', text:'#1A2A0A', isDark:false },
]
