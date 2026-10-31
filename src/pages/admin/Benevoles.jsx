/**
 * pages/admin/Benevoles.jsx
 * Gestion complète des bénévoles :
 * - Création avec créneaux de présence par jour
 * - Calcul automatique des droits repas/boisson/eau
 * - Suivi de consommation en temps réel via QR code
 * - Prévention des abus (alertes dépassement)
 */
import React, { useState, useEffect } from 'react'
import { db } from '../../firebase/config'
import useEventStore from '../../store/useEventStore'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { nowStr } from '../../utils/helpers'
import { hashPassword } from '../../utils/kpis'
import { addAuditLog } from '../../firebase/service'
import QrCode from '../../components/QrCode'
import { genUsername } from '../../store/useAuthStore'
import {
  Plus, Trash2, Pencil, X, Save, Users,
  UtensilsCrossed, Coffee, Droplets, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, Search, FileDown,
  CalendarDays,
} from 'lucide-react'
import VolunteerPlanning from '../../components/VolunteerPlanning'

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

// ── Constantes ────────────────────────────────────────────────────
const JOURS = ['Vendredi', 'Samedi', 'Dimanche']
const CRENEAUX = ['Midi', 'Soir']

// Droits par créneau validé
const DROITS_PAR_CRENEAU = { repas: 1, boisson: 1, eau: 1 }

// Couleurs items
const ITEM_CFG = {
  repas:   { label:'Repas',   icon:UtensilsCrossed, color:'#065f46', bg:'#d1fae5' },
  boisson: { label:'Boisson', icon:Coffee,          color:'#92400e', bg:'#fef3c7' },
  eau:     { label:'Eau',     color:'#1e40af', bg:'#dbeafe',
    icon: ({ size, style }) => <Droplets size={size} style={style}/> },
}

// Calcul automatique des droits totaux depuis les créneaux
const calcDroits = (creneaux = {}) => {
  let total = { repas:0, boisson:0, eau:0 }
  JOURS.forEach(j => CRENEAUX.forEach(c => {
    if (creneaux[j]?.[c]) {
      total.repas   += DROITS_PAR_CRENEAU.repas
      total.boisson += DROITS_PAR_CRENEAU.boisson
      total.eau     += DROITS_PAR_CRENEAU.eau
    }
  }))
  return total
}

// ── Composant jauge de consommation ──────────────────────────────
const Jauge = ({ label, consomme, total, Icon, color, bg }) => {
  const pct     = total > 0 ? Math.min(consomme / total, 1) : 0
  const restant = Math.max(0, total - consomme)
  const depasse = consomme > total
  return (
    <div style={{ flex:1, minWidth:80 }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
        {Icon && <Icon size={13} style={{ color }}/>}
        <span style={{ fontSize:11, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</span>
      </div>
      <div style={{ height:6, borderRadius:3, background:'var(--bg3)', overflow:'hidden', marginBottom:4 }}>
        <div style={{ height:'100%', width:`${pct*100}%`, background:depasse?'var(--red)':color, borderRadius:3, transition:'width .3s' }}/>
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:depasse?'var(--red)':'var(--text)' }}>
        {consomme}/{total}
        {depasse && <span style={{ marginLeft:4 }}>⚠️</span>}
      </div>
      <div style={{ fontSize:10, color:'var(--muted)' }}>{restant > 0 ? `${restant} restant${restant>1?'s':''}` : depasse ? 'Dépassé !' : 'Terminé'}</div>
    </div>
  )
}

// ── Formulaire bénévole ───────────────────────────────────────────
const FormBenevole = ({ initial, onSave, onCancel }) => {
  const [nom, setNom]           = useState(initial?.nom || '')
  const [prenom, setPrenom]     = useState(initial?.prenom || '')
  const [poste, setPoste]       = useState(initial?.poste || '')
  const [creneaux, setCreneaux] = useState(initial?.creneaux || {})
  const [saving, setSaving]     = useState(false)

  const toggleCreneau = (jour, creneau) => {
    setCreneaux(prev => ({
      ...prev,
      [jour]: { ...(prev[jour]||{}), [creneau]: !(prev[jour]?.[creneau]) }
    }))
  }

  const droits = calcDroits(creneaux)
  const nbCreneaux = JOURS.reduce((a,j) => a + CRENEAUX.filter(c => creneaux[j]?.[c]).length, 0)

  const handleSave = async () => {
    if (!nom.trim() || !prenom.trim()) { alert('Prénom et nom requis'); return }
    setSaving(true)
    try {
      await onSave({ nom: nom.trim(), prenom: prenom.trim(), poste: poste.trim(), creneaux, droits })
    } finally { setSaving(false) }
  }

  const inp = { width:'100%', minHeight:44, padding:'0 12px', border:'1.5px solid var(--border2)', borderRadius:'var(--radius)', fontSize:14, fontFamily:'var(--font)', color:'var(--text)', background:'var(--bg)', outline:'none' }

  return (
    <div className="card" style={{ border:'2px solid var(--brand)', marginBottom:16 }}>
      <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:18 }}>
        {initial ? 'Modifier le bénévole' : 'Nouveau bénévole'}
      </div>

      {/* Identité */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Prénom</label>
          <input value={prenom} onChange={e=>setPrenom(e.target.value)} placeholder="Marie" style={inp}/>
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Nom</label>
          <input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Dupont" style={inp}/>
        </div>
      </div>
      <div style={{ marginBottom:18 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Poste / Rôle</label>
        <input value={poste} onChange={e=>setPoste(e.target.value)} placeholder="ex : Sécurité, Billetterie, Bar…" style={inp}/>
      </div>

      {/* Créneaux de présence */}
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>
          Créneaux de présence
        </div>
        <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', overflow:'hidden', border:'1px solid var(--border)' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0, padding:'8px 14px', borderBottom:'1px solid var(--border)' }}>
            <div/>
            {CRENEAUX.map(c => (
              <div key={c} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>
                {c}
              </div>
            ))}
          </div>
          {JOURS.map((jour, ji) => (
            <div key={jour} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0, padding:'10px 14px', borderBottom: ji < JOURS.length-1 ? '1px solid var(--border)' : 'none', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{jour}</div>
              {CRENEAUX.map(c => {
                const checked = !!creneaux[jour]?.[c]
                return (
                  <div key={c} style={{ display:'flex', justifyContent:'center' }}>
                    <button onClick={() => toggleCreneau(jour, c)}
                      style={{ width:40, height:40, borderRadius:10, border:`2px solid ${checked?'var(--brand)':'var(--border2)'}`, background:checked?'var(--brand)':'var(--bg)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .12s' }}>
                      {checked && <CheckCircle size={18} color="#fff"/>}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Récapitulatif droits */}
      {nbCreneaux > 0 && (
        <div style={{ padding:'12px 16px', background:'var(--brand-light)', borderRadius:'var(--radius)', marginBottom:18, display:'flex', gap:20, flexWrap:'wrap' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--brand-dark)', marginBottom:2, width:'100%' }}>
            Droits générés automatiquement ({nbCreneaux} créneau{nbCreneaux>1?'x':''}) :
          </div>
          {Object.entries(droits).map(([k, v]) => {
            const cfg = ITEM_CFG[k]
            const Icon = cfg.icon
            return (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Icon size={14} style={{ color:cfg.color }}/>
                <span style={{ fontSize:13, fontWeight:700, color:cfg.color }}>{v} {cfg.label}{v>1?'s':''}</span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save size={14}/> {saving ? 'Sauvegarde…' : initial ? 'Enregistrer' : 'Créer le bénévole'}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          <X size={14}/> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Carte bénévole ────────────────────────────────────────────────
const CarteBenevole = ({ b, onEdit, onDelete, onConsommer, onReset, onGeneratePDF, currentEventId }) => {
  const [open, setOpen]   = useState(false)
  const conso  = b.consommation || {}
  const droits = b.droits || {}
  const hasAbus = Object.keys(droits).some(k => (conso[k]||0) > (droits[k]||0))

  const nbCreneaux = JOURS.reduce((a,j) =>
    a + CRENEAUX.filter(c => b.creneaux?.[j]?.[c]).length, 0)

  return (
    <div className="card" style={{ padding:0, overflow:'hidden', border: hasAbus ? '2px solid var(--red)' : '1px solid var(--border)' }}>

      {/* En-tête */}
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
        onClick={() => setOpen(o => !o)}>

        {/* Avatar initiales + QR */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff' }}>
            {b.prenom?.[0]}{b.nom?.[0]}
          </div>
          {hasAbus && (
            <div style={{ position:'absolute', top:-4, right:-4, width:18, height:18, borderRadius:'50%', background:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <AlertTriangle size={10} color="#fff"/>
            </div>
          )}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>
            {b.prenom} {b.nom}
            {hasAbus && <span style={{ marginLeft:8, fontSize:11, background:'var(--red)', color:'#fff', borderRadius:10, padding:'2px 8px', fontWeight:700 }}>Dépassement</span>}
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>
            {b.poste || 'Bénévole'} · {nbCreneaux} créneau{nbCreneaux>1?'x':''}
          </div>
        </div>

        {/* Jauges compactes */}
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {Object.entries(ITEM_CFG).map(([k, cfg]) => {
            const c = conso[k]||0, d = droits[k]||0
            const pct = d > 0 ? Math.min(c/d, 1) : 0
            const Icon = cfg.icon
            return (
              <div key={k} title={`${cfg.label}: ${c}/${d}`} style={{ textAlign:'center' }}>
                <Icon size={13} style={{ color:c>d?'var(--red)':cfg.color }}/>
                <div style={{ fontSize:10, fontWeight:700, color:c>d?'var(--red)':'var(--text)', lineHeight:1 }}>{c}/{d}</div>
              </div>
            )
          })}
        </div>

        {open ? <ChevronUp size={16} style={{ color:'var(--muted)', flexShrink:0 }}/> : <ChevronDown size={16} style={{ color:'var(--muted)', flexShrink:0 }}/>}
      </div>

      {/* Détail déplié */}
      {open && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'16px' }}>

          {/* QR code */}
          <div style={{ display:'flex', gap:16, marginBottom:16, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div style={{ textAlign:'center' }}>
              <QrCode value={`${window.location.origin}/benevole?id=${b.id}${currentEventId?'&ev='+currentEventId:''}`} size={100}/>
              <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--muted)', marginTop:4 }}>BNV-{b.id?.slice(-6)}</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Créneaux validés</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {JOURS.map(j => CRENEAUX.map(c => b.creneaux?.[j]?.[c] && (
                  <span key={j+c} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'var(--brand-light)', color:'var(--brand-dark)', fontWeight:600 }}>
                    {j} {c}
                  </span>
                )))}
              </div>
            </div>
          </div>

          {/* Jauges détaillées */}
          <div style={{ display:'flex', gap:16, marginBottom:16 }}>
            {Object.entries(ITEM_CFG).map(([k, cfg]) => {
              const Icon = cfg.icon
              return (
                <Jauge key={k} label={cfg.label} consomme={conso[k]||0} total={droits[k]||0}
                  Icon={Icon} color={cfg.color} bg={cfg.bg}/>
              )
            })}
          </div>

          {/* Historique consommation */}
          {(b.historique||[]).length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Historique</div>
              <div style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:10, maxHeight:120, overflowY:'auto' }}>
                {[...(b.historique||[])].reverse().map((h, i) => (
                  <div key={i} style={{ fontSize:12, color:'var(--text)', padding:'3px 0', borderBottom:i<(b.historique||[]).length-1?'0.5px solid var(--border)':'none', display:'flex', justifyContent:'space-between' }}>
                    <span>{h.action}</span>
                    <span style={{ color:'var(--muted)' }}>{h.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions enregistrement consommation */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Enregistrer une consommation</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {Object.entries(ITEM_CFG).map(([k, cfg]) => {
                const c = conso[k]||0, d = droits[k]||0
                const restant = d - c
                const Icon = cfg.icon
                return (
                  <button key={k} onClick={() => onConsommer(b, k)}
                    disabled={restant <= 0}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', border:`1.5px solid ${restant>0?cfg.color:'var(--border)'}`, borderRadius:'var(--radius)', background:restant>0?cfg.bg:'var(--bg2)', color:restant>0?cfg.color:'var(--muted)', fontSize:13, fontWeight:600, cursor:restant>0?'pointer':'not-allowed', fontFamily:'var(--font)', transition:'all .12s' }}>
                    <Icon size={14}/>
                    {cfg.label} {restant > 0 ? `(${restant})` : '✓'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions admin */}
          <div style={{ display:'flex', gap:8, marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)', flexWrap:'wrap' }}>
            <button onClick={() => onEdit(b)} className="btn-secondary" style={{ fontSize:13, padding:'0 14px' }}>
              <Pencil size={13}/> Modifier
            </button>
            <button onClick={() => onGeneratePDF(b)}
              style={{ fontSize:13, padding:'0 14px', display:'flex', alignItems:'center', gap:6, border:'0.5px solid var(--brand)', borderRadius:8, background:'var(--brand-light)', color:'var(--brand-dark)', cursor:'pointer', fontFamily:'var(--font)' }}>
              <FileDown size={13}/> PDF
            </button>
            <button onClick={() => onReset(b)} className="btn-secondary" style={{ fontSize:13, padding:'0 14px', color:'var(--amber)' }}
              title="Remettre les compteurs à zéro">
              Réinitialiser compta
            </button>
            <button onClick={() => onDelete(b)} className="btn-danger" style={{ fontSize:13, padding:'0 14px', marginLeft:'auto' }}>
              <Trash2 size={13}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────
export default function Benevoles() {
  const { currentEventId } = useEventStore()
  const [benevoles, setBenevoles] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [search, setSearch]       = useState('')
  const [section, setSection]     = useState('liste') // liste | stats

  // Écoute temps réel Firebase
  useEffect(() => {
    const unsub = onSnapshot(
      query(currentEventId ? collection(db, 'events', currentEventId, 'benevoles') : collection(db, 'benevoles'), orderBy('createdAt', 'desc')),
      snap => { setBenevoles(snap.docs.map(d => ({ ...d.data(), id: d.id }))); setLoading(false) },
      () => setLoading(false)
    )
    return unsub
  }, [])

  // ── CRUD ─────────────────────────────────────────────────────────
  const createBenevole = async (data) => {
    // Générer les identifiants de connexion
    const username = genUsername(data.prenom + ' ' + data.nom)
    const password = username + '123'
    const passwordHash = await hashPassword(password)
    const docRef = await addDoc(
      currentEventId ? collection(db, 'events', currentEventId, 'benevoles') : collection(db, 'benevoles'),
      {
        ...data,
        username,
        password,
        passwordHash,
        consommation: { repas:0, boisson:0, eau:0 },
        historique:   [],
        role:         'benevole',
        eventId:      currentEventId || null,
        createdAt:    serverTimestamp(),
      }
    )
    await addAuditLog('CREATION_BENEV', {
      benevoleNom: `${data.prenom} ${data.nom}`,
      username, poste: data.poste || '',
      droits: JSON.stringify(data.droits || {}),
      userType: 'admin',
      label: `Création bénévole : ${data.prenom} ${data.nom}`,
    })
    setShowForm(false)
  }

  const saveBenevole = async (data) => {
    // Recalculer les droits et ajuster la consommation si besoin
    const old    = editing
    const newDroits = data.droits
    const conso  = old.consommation || {}
    // Cap la consommation aux nouveaux droits
    const newConso = {
      repas:   Math.min(conso.repas||0,   newDroits.repas),
      boisson: Math.min(conso.boisson||0, newDroits.boisson),
      eau:     Math.min(conso.eau||0,     newDroits.eau),
    }
    const hist = [...(old.historique||[]),
      { action:`Modification créneaux → ${Object.values(data.droits).reduce((a,v)=>a+v,0)} droits`, date:nowStr() }
    ]
    const bRef = currentEventId ? doc(db, 'events', currentEventId, 'benevoles', old.id) : doc(db, 'benevoles', old.id)
    // Re-hasher le mdp si modifié
    let updatePayload = { ...data, consommation:newConso, historique:hist }
    if (data.password && data.password !== old.password) {
      updatePayload.passwordHash = await hashPassword(data.password)
    }
    await updateDoc(bRef, updatePayload)
    await addAuditLog('MODIF_BENEV', {
      benevoleId: old.id, benevoleNom: `${data.prenom} ${data.nom}`,
      userType: 'admin',
      label: `Modification bénévole : ${data.prenom} ${data.nom}`,
    })
    setEditing(null)
  }

  const deleteBenevole = async (b) => {
    if (!window.confirm(`Supprimer ${b.prenom} ${b.nom} ?`)) return
    await addAuditLog('SUPPRESSION_BENEV', { benevoleId: b.id, benevoleNom: `${b.prenom} ${b.nom}`, userType: 'admin', label: `Suppression bénévole : ${b.prenom} ${b.nom}` })
    await deleteDoc(currentEventId ? doc(db, 'events', currentEventId, 'benevoles', b.id) : doc(db, 'benevoles', b.id))
  }

  const consommer = async (b, item) => {
    const conso  = b.consommation || {}
    const droits = b.droits || {}
    const actuel = conso[item] || 0
    const droit  = droits[item] || 0
    if (actuel >= droit) { alert(`${b.prenom} ${b.nom} a déjà consommé tous ses droits de type "${ITEM_CFG[item].label}".`); return }
    const newConso = { ...conso, [item]: actuel + 1 }
    const hist = [...(b.historique||[]),
      { action:`${ITEM_CFG[item].label} consommé(e) (${actuel+1}/${droit})`, date:nowStr() }
    ]
    await updateDoc(currentEventId ? doc(db, 'events', currentEventId, 'benevoles', b.id) : doc(db, 'benevoles', b.id), { consommation:newConso, historique:hist })
    await addAuditLog('CONSO_BENEV', { benevoleId: b.id, benevoleNom: `${b.prenom} ${b.nom}`, type: item, actuel: actuel+1, droit, userType: 'admin', label: `Consommation ${ITEM_CFG[item].label} pour ${b.prenom} ${b.nom} (${actuel+1}/${droit})` })
  }

  const resetConso = async (b) => {
    await addAuditLog('RESET_CONSO_BENEV', { benevoleId: b.id, benevoleNom: `${b.prenom} ${b.nom}`, userType: 'admin', label: `Réinitialisation conso bénévole : ${b.prenom} ${b.nom}` })
    if (!window.confirm(`Réinitialiser les compteurs de consommation de ${b.prenom} ${b.nom} ?`)) return
    const hist = [...(b.historique||[]), { action:'Compteurs remis à zéro par admin', date:nowStr() }]
    await updateDoc(currentEventId ? doc(db, 'events', currentEventId, 'benevoles', b.id) : doc(db, 'benevoles', b.id), { consommation:{ repas:0, boisson:0, eau:0 }, historique:hist })
  }

  // ── Filtres et stats ──────────────────────────────────────────────
  const filtered = benevoles.filter(b =>
    `${b.prenom} ${b.nom} ${b.poste}`.toLowerCase().includes(search.toLowerCase())
  )

  const abuseurs = benevoles.filter(b => {
    const c = b.consommation||{}, d = b.droits||{}
    return Object.keys(d).some(k => (c[k]||0) > (d[k]||0))
  })

  const totalDroits = benevoles.reduce((acc, b) => {
    const d = b.droits||{}
    return { repas:acc.repas+(d.repas||0), boisson:acc.boisson+(d.boisson||0), eau:acc.eau+(d.eau||0) }
  }, { repas:0, boisson:0, eau:0 })

  const totalConso = benevoles.reduce((acc, b) => {
    const c = b.consommation||{}
    return { repas:acc.repas+(c.repas||0), boisson:acc.boisson+(c.boisson||0), eau:acc.eau+(c.eau||0) }
  }, { repas:0, boisson:0, eau:0 })

  const tabBtn = (s) => ({
    padding:'7px 18px', border:'none', borderRadius:'var(--radius)', cursor:'pointer',
    fontFamily:'var(--font)', fontSize:13, fontWeight:section===s?700:400,
    background:section===s?'var(--brand)':'var(--bg2)',
    color:section===s?'#fff':'var(--muted)',
  })

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Chargement…</div>

  return (
    <div>

      {/* Alertes dépassement en haut */}
      {abuseurs.length > 0 && (
        <div className="alert alert-error" style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <AlertTriangle size={16}/>
          <strong>{abuseurs.length} dépassement{abuseurs.length>1?'s':''} détecté{abuseurs.length>1?'s':''} :</strong>
          {abuseurs.map(b => `${b.prenom} ${b.nom}`).join(', ')}
        </div>
      )}

      {/* Tabs + actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button style={tabBtn('liste')} onClick={() => setSection('liste')}>
            <Users size={13} style={{ verticalAlign:-2, marginRight:4 }}/>Liste
          </button>
          <button style={tabBtn('planning')} onClick={() => setSection('planning')}>
            <CalendarDays size={13} style={{ verticalAlign:-2, marginRight:4 }}/>Planning
          </button>
          <button style={tabBtn('stats')} onClick={() => setSection('stats')}>
            📊 Synthèse
          </button>
        </div>
        {!showForm && !editing && section === 'liste' && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={14}/> Nouveau bénévole
          </button>
        )}
      </div>

      {/* Formulaire création */}
      {showForm && !editing && (
        <FormBenevole onSave={createBenevole} onCancel={() => setShowForm(false)}/>
      )}

      {/* Formulaire édition */}
      {editing && (
        <FormBenevole initial={editing} onSave={saveBenevole} onCancel={() => setEditing(null)}/>
      )}

      {/* ── SECTION PLANNING ── */}
      {section === 'planning' && !showForm && !editing && (
        <VolunteerPlanning benevoles={benevoles}/>
      )}

      {/* ── SECTION LISTE ── */}
      {section === 'liste' && (
        <>
          {/* Barre de recherche */}
          {benevoles.length > 3 && (
            <div style={{ position:'relative', marginBottom:14 }}>
              <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un bénévole…"
                className="inp" style={{ paddingLeft:36 }}/>
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ padding:'48px 20px', textAlign:'center', color:'var(--muted)', fontSize:14 }}>
              {benevoles.length === 0 ? 'Aucun bénévole enregistré.' : 'Aucun résultat.'}
            </div>
          ) : (
            filtered.map(b => (
              <CarteBenevole key={b.id} b={b}
                onEdit={setEditing}
                onGeneratePDF={(b) => generateBenevrolePDF(b, null, currentEventId)}
                onDelete={deleteBenevole}
                onConsommer={consommer}
                onReset={resetConso}
                currentEventId={currentEventId}/>
            ))
          )}
        </>
      )}

      {/* ── SECTION STATS ── */}
      {section === 'stats' && (
        <div>
          {/* KPIs globaux */}
          <div className="grid-4" style={{ marginBottom:20 }}>
            <div className="stat-card">
              <div className="stat-label">Bénévoles</div>
              <div className="stat-value">{benevoles.length}</div>
            </div>
            {Object.entries(ITEM_CFG).map(([k, cfg]) => {
              const Icon = cfg.icon
              const restant = (totalDroits[k]||0) - (totalConso[k]||0)
              return (
                <div key={k} className="stat-card" style={{ background:cfg.bg }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                    <Icon size={14} style={{ color:cfg.color }}/>
                    <span className="stat-label" style={{ color:cfg.color }}>{cfg.label}s</span>
                  </div>
                  <div className="stat-value" style={{ color:cfg.color }}>{totalConso[k]||0}/{totalDroits[k]||0}</div>
                  <div className="stat-sub" style={{ color:cfg.color, opacity:.8 }}>{restant} restant{restant>1?'s':''}</div>
                </div>
              )
            })}
          </div>

          {/* Tableau récapitulatif */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bénévole</th>
                  <th>Poste</th>
                  <th>Créneaux</th>
                  <th>🍽️ Repas</th>
                  <th>☕ Boisson</th>
                  <th>💧 Eau</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {benevoles.map(b => {
                  const c = b.consommation||{}, d = b.droits||{}
                  const abus = Object.keys(d).some(k => (c[k]||0) > (d[k]||0))
                  const nb   = JOURS.reduce((a,j)=>a+CRENEAUX.filter(cr=>b.creneaux?.[j]?.[cr]).length,0)
                  const Cell = ({ item }) => {
                    const cv=c[item]||0, dv=d[item]||0
                    return <td style={{ color:cv>dv?'var(--red)':cv===dv&&dv>0?'var(--green)':'var(--text)', fontWeight:700 }}>{cv}/{dv}</td>
                  }
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight:600 }}>{b.prenom} {b.nom}</td>
                      <td style={{ color:'var(--muted)' }}>{b.poste||'—'}</td>
                      <td>{nb}</td>
                      <Cell item="repas"/><Cell item="boisson"/><Cell item="eau"/>
                      <td>
                        {abus
                          ? <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'var(--red-light)', color:'var(--red)' }}>⚠️ Dépassement</span>
                          : <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'var(--green-light)', color:'var(--green)' }}>✓ OK</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
