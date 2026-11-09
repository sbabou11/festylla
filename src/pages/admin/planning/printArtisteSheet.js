/**
 * pages/admin/planning/printArtisteSheet.js — fiche artiste imprimable (1 page A4 garantie)
 * Ouvre une fenêtre avec le QR de l'espace artiste, ses horaires et ses liens.
 */
import { getSettings } from '../../../firebase/service'
import { toast } from '../../../ui'
import { APP_VERSION_LABEL } from '../../../utils/buildInfo'

export default async function printArtisteSheet(form, creneauId, eventId) {
  const url = window.location.origin + '/artiste?ev=' + eventId + '&cr=' + creneauId
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(JSON.stringify({ ev: eventId, cr: creneauId, type: 'artiste' }))

  // Charger thème + meta événement
  let brand = '#1a6b7a'
  let eventNom = ''
  let logoSrc = ''
  try {
    const settings = await getSettings(eventId)
    if (settings?.theme?.brand) brand = settings.theme.brand
    if (settings?.theme?.logoSrc) logoSrc = settings.theme.logoSrc
  } catch {}
  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const { db } = await import('../../../firebase/config')
    const snap = await getDoc(doc(db, 'events', eventId))
    if (snap.exists()) {
      eventNom = snap.data().nom || ''
      if (!logoSrc) logoSrc = snap.data().logoSrc || ''
    }
  } catch {}

  // Variantes de couleur
  const hex = brand.replace('#','')
  const r = parseInt(hex.slice(0,2), 16)
  const g = parseInt(hex.slice(2,4), 16)
  const b = parseInt(hex.slice(4,6), 16)
  const brandDark  = '#' + [r,g,b].map(v => Math.max(0, Math.round(v*.7)).toString(16).padStart(2,'0')).join('')
  const brandLight = 'rgba(' + r + ',' + g + ',' + b + ',0.08)'
  const brandMid   = 'rgba(' + r + ',' + g + ',' + b + ',0.18)'

  const artiste = form.artiste || '—'
  const titre = form.titre || ''
  const type = form.type || ''
  const typeLabels = { musical:'🎵 Musical', litteraire:'📚 Littéraire', cinematographique:'🎬 Cinéma', autre:'🎭 Autre' }
  const scene = form.scene || ''
  const fmtDt = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    if (isNaN(dt)) return '—'
    return dt.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  }
  const fmtHr = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return isNaN(dt) ? '—' : dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  }
  const liens = form.liens || {}
  const liensFiltres = Object.entries(liens).filter(([_, v]) => v && v.trim())
  const labels = { spotify:'Spotify', instagram:'Instagram', facebook:'Facebook', tiktok:'TikTok', youtube:'YouTube', site:'Site web' }
  const icons  = { spotify:'🎧', instagram:'📷', facebook:'👥', tiktok:'🎵', youtube:'▶️', site:'🌐' }
  const safe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  let html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Fiche artiste — ' + safe(artiste) + '</title>'
  html += '<style>'
  html += '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
  html += 'html,body{margin:0;padding:0}'
  html += 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#f5f5f7;padding:16px;line-height:1.45}'
  html += '.sheet{max-width:720px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.06)}'
  // Header compact
  html += '.header{background:linear-gradient(135deg,' + brand + ' 0%,' + brandDark + ' 100%);color:#fff;padding:18px 28px;position:relative;overflow:hidden}'
  html += '.header::before{content:"";position:absolute;top:-30px;right:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.08)}'
  html += '.header::after{content:"";position:absolute;bottom:-50px;left:-50px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.06)}'
  html += '.header-content{position:relative;z-index:1;display:flex;align-items:center;gap:14px}'
  html += '.logo-circle{width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;font-size:20px}'
  html += '.logo-circle img{width:100%;height:100%;object-fit:cover}'
  html += '.event-info{flex:1;min-width:0}'
  html += '.event-name{font-size:10px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}'
  html += '.event-tag{font-size:18px;font-weight:800;letter-spacing:-.01em}'
  // Body compact
  html += '.body{padding:22px 28px}'
  html += '.artist-block{text-align:center;margin-bottom:18px}'
  html += '.artist-name{font-size:30px;font-weight:800;color:#1a1a1a;line-height:1.1;margin:0 0 4px;letter-spacing:-.02em}'
  html += '.artist-subtitle{font-size:13px;color:#666;font-style:italic}'
  // Pills
  html += '.pills{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px}'
  html += '.pill{display:inline-flex;align-items:center;gap:5px;background:' + brandLight + ';color:' + brandDark + ';padding:5px 12px;border-radius:24px;font-size:11px;font-weight:600;border:1px solid ' + brandMid + '}'
  html += '.pill-icon{font-size:12px}'
  // Section QR + URL côte à côte pour gagner de la place
  html += '.qr-row{display:flex;gap:14px;align-items:stretch;margin:18px 0 12px}'
  html += '.qr-section{flex:0 0 auto;background:linear-gradient(135deg,#fafafa 0%,#f0f0f3 100%);border-radius:14px;padding:14px;text-align:center;border:1px solid #eaeaef;display:flex;flex-direction:column;align-items:center;justify-content:center}'
  html += '.qr-card{background:#fff;padding:10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06);line-height:0}'
  html += '.qr-card img{display:block;width:180px;height:180px}'
  html += '.qr-code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:11px;color:' + brand + ';font-weight:700;letter-spacing:.05em;background:#fff;padding:4px 10px;border-radius:6px;display:inline-block;border:1px dashed ' + brandMid + ';margin-top:10px}'
  html += '.qr-side{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:10px}'
  html += '.qr-label{font-size:9px;font-weight:700;color:' + brand + ';text-transform:uppercase;letter-spacing:.12em}'
  html += '.qr-hint{font-size:12px;color:#555;line-height:1.45}'
  html += '.qr-hint strong{color:' + brand + '}'
  html += '.url-block{background:#fafafa;border:1px solid #eaeaef;border-left:3px solid ' + brand + ';border-radius:8px;padding:8px 12px;font-family:"SF Mono",Menlo,Consolas,monospace;font-size:9px;color:#444;word-break:break-all;line-height:1.5}'
  html += '.url-label{font-size:9px;font-weight:700;color:' + brand + ';text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;font-family:-apple-system,sans-serif}'
  // Liens
  html += '.section-title{font-size:10px;font-weight:700;color:' + brand + ';text-transform:uppercase;letter-spacing:.12em;margin:16px 0 8px;display:flex;align-items:center;gap:8px}'
  html += '.section-title::after{content:"";flex:1;height:1px;background:linear-gradient(to right,' + brandMid + ',transparent)}'
  html += '.liens{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px}'
  html += '.lien{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fafafa;border:1px solid #eaeaef;border-radius:10px;text-decoration:none;color:#333;font-size:11px;font-weight:600}'
  html += '.lien-icon{font-size:14px;flex-shrink:0}'
  html += '.lien-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  // Foot
  html += '.foot{background:#fafafa;border-top:1px solid #eaeaef;padding:10px 28px;text-align:center;font-size:9px;color:#888;line-height:1.5}'
  html += '.foot strong{color:' + brand + '}'
  // Impression : 1 SEULE PAGE GARANTIE
  html += '@page{size:A4 portrait;margin:8mm}'
  html += '@media print {'
  html += '  html,body{background:#fff!important}'
  html += '  body{padding:0}'
  html += '  .sheet{box-shadow:none;border-radius:0;max-width:100%}'
  // Bloque toute coupure de page
  html += '  *{page-break-inside:avoid!important;break-inside:avoid!important}'
  html += '}'
  html += '</style></head><body>'

  html += '<div class="sheet" id="sheet">'

  // Header
  html += '<div class="header"><div class="header-content">'
  html += '<div class="logo-circle">'
  if (logoSrc) html += '<img src="' + safe(logoSrc) + '" alt=""/>'
  else html += '🎭'
  html += '</div>'
  html += '<div class="event-info">'
  html += '<div class="event-name">Fiche artiste · Espace personnel</div>'
  html += '<div class="event-tag">' + safe(eventNom || 'Festival') + '</div>'
  html += '</div>'
  html += '</div></div>'

  // Body
  html += '<div class="body">'

  // Artiste
  html += '<div class="artist-block">'
  html += '<h1 class="artist-name">' + safe(artiste) + '</h1>'
  if (titre) html += '<div class="artist-subtitle">' + safe(titre) + '</div>'
  html += '<div class="pills">'
  if (form.debut) html += '<div class="pill"><span class="pill-icon">📅</span>' + safe(fmtDt(form.debut)) + '</div>'
  if (form.debut || form.fin) html += '<div class="pill"><span class="pill-icon">🕐</span>' + safe(fmtHr(form.debut)) + (form.fin ? ' → ' + safe(fmtHr(form.fin)) : '') + '</div>'
  if (type)  html += '<div class="pill"><span class="pill-icon">' + (typeLabels[type] || '').slice(0, 2) + '</span>' + safe((typeLabels[type] || type).slice(2).trim()) + '</div>'
  if (scene) html += '<div class="pill"><span class="pill-icon">📍</span>' + safe(scene) + '</div>'
  html += '</div>'
  html += '</div>'

  // QR + URL côte à côte
  html += '<div class="qr-row">'
  html += '<div class="qr-section">'
  html += '<div class="qr-card"><img src="' + qrUrl + '" alt="QR Code"/></div>'
  html += '<div><span class="qr-code">ART-' + creneauId.slice(-6).toUpperCase() + '</span></div>'
  html += '</div>'
  html += '<div class="qr-side">'
  html += '<div>'
  html += '<div class="qr-label">Espace personnel artiste</div>'
  html += '<div class="qr-hint" style="margin-top:6px">Scannez le QR ou ouvrez le lien pour accéder à votre <strong>créneau</strong>, vos <strong>droits aux avantages</strong> (boissons / repas / eau) et présenter le QR au stand.</div>'
  html += '</div>'
  html += '<div class="url-block">'
  html += '<div class="url-label">🔗 Lien direct</div>'
  html += safe(url)
  html += '</div>'
  html += '</div>'
  html += '</div>'

  // Liens artiste
  if (liensFiltres.length > 0) {
    html += '<div class="section-title">🌍 Retrouvez l\'artiste</div>'
    html += '<div class="liens">'
    liensFiltres.forEach(([k, v]) => {
      html += '<a class="lien" href="' + safe(v) + '" target="_blank">'
      html += '<span class="lien-icon">' + (icons[k] || '🔗') + '</span>'
      html += '<span class="lien-label">' + (labels[k] || k) + '</span>'
      html += '</a>'
    })
    html += '</div>'
  }

  html += '</div>' // body

  // Foot
  html += '<div class="foot">'
  html += 'YllaCash ' + APP_VERSION_LABEL + ' — Édité le ' + new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
  html += ' à ' + new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
  html += ' — Développée par <strong>Maison Ylla</strong>'
  html += '</div>'

  html += '</div>' // sheet

  // Script qui mesure la hauteur et applique un scale si nécessaire pour tenir sur 1 page A4
  html += '<script>'
  html += 'window.addEventListener("load", function() {'
  html += '  setTimeout(function() {'
  // A4 portrait = 210mm × 297mm. À 96dpi : ~794px × ~1123px. Marge 8mm = ~30px de chaque côté.
  // Surface utile : ~734px × ~1063px (hauteur exploitable)
  html += '    var sheet = document.getElementById("sheet");'
  html += '    var maxH = 1063;' // px disponibles en hauteur sur A4 avec marge 8mm
  html += '    var h = sheet.offsetHeight;'
  html += '    if (h > maxH) {'
  html += '      var scale = (maxH / h) * 0.98;' // 2% de marge de sécurité
  html += '      sheet.style.transform = "scale(" + scale + ")";'
  html += '      sheet.style.transformOrigin = "top center";'
  html += '    }'
  html += '    window.print();'
  html += '  }, 800);'
  html += '});'
  html += '</script>'

  html += '</body></html>'

  const w = window.open('', '_blank')
  if (!w) {
    toast.error('Veuillez autoriser les pop-ups pour imprimer la fiche.')
    return
  }
  w.document.write(html)
  w.document.close()
  // L'impression est déclenchée par le script interne après mesure
}
