/**
 * pages/admin/benevoles/pdf.js — carte bénévole en PDF (jsPDF chargé à la demande)
 * Déplacé tel quel depuis Benevoles.jsx : les couleurs fixes sont celles du document imprimé.
 */
// ── Générateur PDF bénévole ──────────────────────────────────────
const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf) { resolve(window.jspdf.jsPDF); return }
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  s.onload  = () => resolve(window.jspdf.jsPDF)
  s.onerror = reject
  document.head.appendChild(s)
})

const generateBenevrolePDF = async (b, eventMeta, eventId) => {
  const jsPDF = await loadJsPDF()
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const BRAND = '#009090'

  // Générer QR code en base64
  let qrDataUrl = null
  try {
    const QRCode = await import('qrcode')
    const url = `${window.location.origin}/benevole?id=${b.id}${eventId ? '&ev=' + eventId : ''}`
    qrDataUrl = await QRCode.default.toDataURL(url, { width: 200, margin: 1, color: { dark: BRAND, light: '#fff' } })
  } catch {}

  // ── Header ──
  doc.setFillColor(26, 107, 122)
  doc.rect(0, 0, W, 40, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('YllaCash', W / 2, 16, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Carte bénévole', W / 2, 25, { align: 'center' })
  if (eventMeta?.nom) {
    doc.setFontSize(10)
    doc.text(eventMeta.nom, W / 2, 34, { align: 'center' })
  }

  // ── Nom + infos ──
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(`${b.prenom || ''} ${b.nom || ''}`.trim(), W / 2, 58, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(b.poste || 'Bénévole', W / 2, 66, { align: 'center' })

  // ── QR code ──
  if (qrDataUrl) {
    const qrSize = 55
    const qrX = (W - qrSize) / 2
    doc.addImage(qrDataUrl, 'PNG', qrX, 72, qrSize, qrSize)
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('Scanner ce QR code pour accéder à votre espace', W / 2, 132, { align: 'center' })
  }

  // ── Identifiants ──
  const boxY = 138
  doc.setFillColor(240, 248, 249)
  doc.roundedRect(20, boxY, W - 40, 30, 4, 4, 'F')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text('Identifiants de connexion', W / 2, boxY + 9, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Nom d'utilisateur : ${b.username || '—'}`, 30, boxY + 18)
  doc.text(`Mot de passe : ${b.password || (b.username + '123') || '—'}`, 30, boxY + 25)

  // ── Lien ──
  const url = `${window.location.origin}/benevole?id=${b.id}${eventId ? '&ev=' + eventId : ''}`
  doc.setFontSize(9)
  doc.setTextColor(26, 107, 122)
  doc.text('Lien : ' + url, W / 2, 175, { align: 'center', maxWidth: W - 30 })

  // ── Droits consommation ──
  const droits = b.droits || {}
  const droitsY = 185
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Droits de consommation', W / 2, droitsY, { align: 'center' })

  const items = [
    { label: 'Repas', icon: '🍽', value: droits.repas || 0, color: [6, 95, 70], bg: [209, 250, 229] },
    { label: 'Boisson', icon: '☕', value: droits.boisson || 0, color: [146, 64, 14], bg: [254, 243, 199] },
    { label: 'Eau', icon: '💧', value: droits.eau || 0, color: [30, 64, 175], bg: [219, 234, 254] },
  ]

  const boxW = 50, boxH = 28, startX = (W - items.length * boxW - (items.length - 1) * 8) / 2
  items.forEach((item, i) => {
    const x = startX + i * (boxW + 8)
    const y = droitsY + 6
    doc.setFillColor(...item.bg)
    doc.roundedRect(x, y, boxW, boxH, 4, 4, 'F')
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...item.color)
    doc.text(String(item.value), x + boxW / 2, y + 15, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(item.label, x + boxW / 2, y + 23, { align: 'center' })
  })

  // ── Créneaux ──
  const creneauxData = b.creneaux || {}
  const jours = ['Vendredi', 'Samedi', 'Dimanche']
  const creneauxY = 230
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Créneaux de présence', W / 2, creneauxY, { align: 'center' })

  let hasCreneaux = false
  jours.forEach((jour, i) => {
    const cr = creneauxData[jour] || {}
    const actifs = Object.entries(cr).filter(([, v]) => v).map(([c]) => c)
    if (actifs.length) {
      hasCreneaux = true
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(jour + ' :', 30, creneauxY + 10 + i * 10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(26, 107, 122)
      doc.text(actifs.join(', '), 70, creneauxY + 10 + i * 10)
    }
  })
  if (!hasCreneaux) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.setFont('helvetica', 'normal')
    doc.text('Aucun créneau défini', W / 2, creneauxY + 12, { align: 'center' })
  }

  // ── Footer ──
  doc.setFillColor(26, 107, 122)
  doc.rect(0, H - 14, W, 14, 'F')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal')
  doc.text('YllaCash — Gestion financière événement', W / 2, H - 5, { align: 'center' })

  // Sauvegarder
  const safeName = `${b.prenom || ''}-${b.nom || ''}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  doc.save(`benevole-${safeName}.pdf`)
}

export default generateBenevrolePDF
