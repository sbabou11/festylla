/**
 * components/Studio.jsx
 * Panneau de personnalisation visuelle (admin uniquement).
 * Couleurs, typographie, logo, QR code, thèmes prédéfinis.
 * Ordinateur : panneau latéral de 260px ; mobile : pleine largeur (dans le plein écran du shell).
 */

import React from 'react'
import { Wand2, RefreshCw, Upload, Trash2 } from 'lucide-react'
import { toast } from '../ui'
import s from './Studio.module.css'
import { useTheme } from '../hooks/useTheme'
import { fileToBase64, PRESETS } from '../utils/helpers'
import { compressImage } from '../utils/imageUtils'
import QrCode from './QrCode'

const FONTS = [
  { label: 'Inter (défaut)',    value: "'Inter',system-ui,sans-serif" },
  { label: 'Poppins',          value: "'Poppins',sans-serif" },
  { label: 'Montserrat',       value: "'Montserrat',sans-serif" },
  { label: 'Playfair Display', value: "'Playfair Display',serif" },
  { label: 'DM Sans',          value: "'DM Sans',sans-serif" },
  { label: 'Space Grotesk',    value: "'Space Grotesk',sans-serif" },
  { label: 'Georgia',          value: 'Georgia,serif' },
  { label: 'Courier New',      value: "'Courier New',monospace" },
]

const Row = ({ label, children }) => (
  <div className={s.row}>
    <span className={s.rowLabel}>{label}</span>
    {children}
  </div>
)

const ColorPicker = ({ value, onChange, label }) => (
  <span className={s.swatch}>
    <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} />
  </span>
)

export default function Studio({ onClose }) {
  const { theme, updateTheme, resetTheme } = useTheme()

  const uploadFile = async (field, file) => {
    if (!file) return
    try {
      // Compresse pour rester sous la limite Firestore. Le logo QR centré reste
      // plus petit (300px max) pour ne pas dégrader la scannabilité du QR autour.
      const isSmall = field === 'qrLogoSrc'
      const b64 = await compressImage(file, isSmall ? 300 : 800, 0.85)
      updateTheme({ [field]: b64 })
    } catch (e) {
      console.warn('Compression image impossible :', e)
      toast.error('Image non importée : format non pris en charge ou fichier illisible')
    }
  }

  const applyPreset = (preset) => {
    updateTheme({
      brand: preset.brand, purple: preset.purple,
      bg: preset.bg, bg2: preset.bg2, text: preset.text,
      qrColor: preset.brand, isDark: preset.isDark,
    })
  }

  const sectionTitle = (label) => (
    <h3 className={s.sectionTitle}>{label}</h3>
  )

  const section = (children) => (
    <section className={s.section}>
      {children}
    </section>
  )

  const uploadZone = (label, field) => (
    <label className={s.upload}>
      <Upload size={18} aria-hidden="true" />
      <span>{label}</span>
      <input type="file" accept="image/*" className={s.fileInput} onChange={e => uploadFile(field, e.target.files[0])} />
    </label>
  )

  const removeBtn = (label, onClick) => (
    <button type="button" className={s.remove} onClick={onClick}>
      <Trash2 size={13} aria-hidden="true" /> {label}
    </button>
  )

  return (
    <aside className={s.panel} aria-label="Studio de personnalisation">
      {/* En-tête */}
      <div className={s.head}>
        <Wand2 size={16} aria-hidden="true" />
        Studio de personnalisation
      </div>

      {/* Logo & identité */}
      {section(<>
        {sectionTitle('Logo & identité')}
        <label className={s.field}>
          <span className={s.label}>Nom du festival</span>
          <input
            className={s.input}
            value={theme.festName || ''}
            onChange={e => updateTheme({ festName: e.target.value })}
          />
        </label>
        {uploadZone('Importer un logo', 'logoSrc')}
        {theme.logoSrc && removeBtn('Supprimer le logo', () => updateTheme({ logoSrc: null }))}
      </>)}

      {/* Couleurs */}
      {section(<>
        {sectionTitle('Couleurs')}
        <Row label="Couleur principale"><ColorPicker label="Couleur principale" value={theme.brand || '#1D9E75'} onChange={v => updateTheme({ brand: v, qrColor: v })} /></Row>
        <Row label="Couleur secondaire"><ColorPicker label="Couleur secondaire" value={theme.purple || '#534AB7'} onChange={v => updateTheme({ purple: v })} /></Row>
        <Row label="Fond application"><ColorPicker label="Fond application" value={theme.bg || '#ffffff'} onChange={v => updateTheme({ bg: v })} /></Row>
        <Row label="Fond sidebar/cards"><ColorPicker label="Fond sidebar/cards" value={theme.bg2 || '#f5f5f3'} onChange={v => updateTheme({ bg2: v })} /></Row>
        <Row label="Texte principal"><ColorPicker label="Texte principal" value={theme.text || '#1a1a1a'} onChange={v => updateTheme({ text: v })} /></Row>
      </>)}

      {/* Typographie */}
      {section(<>
        {sectionTitle('Typographie')}
        <label className={s.field}>
          <span className={s.label}>Police</span>
          <select
            className={s.input}
            value={theme.font}
            onChange={e => updateTheme({ font: e.target.value })}
          >
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <Row label="Taille de base">
          <span className={s.unit}>
            <input type="number" min={11} max={17} value={theme.fontSize || 13} className={s.number} aria-label="Taille de base (px)"
              onChange={e => updateTheme({ fontSize: parseInt(e.target.value) })} />
            px
          </span>
        </Row>
        <Row label="Rayon des coins">
          <span className={s.unit}>
            <input type="number" min={0} max={24} value={theme.radius || 10} className={s.number} aria-label="Rayon des coins (px)"
              onChange={e => updateTheme({ radius: parseInt(e.target.value) })} />
            px
          </span>
        </Row>
      </>)}

      {/* QR Code */}
      {section(<>
        {sectionTitle('QR Code')}
        <Row label="Couleur QR"><ColorPicker label="Couleur QR" value={theme.qrColor || '#1D9E75'} onChange={v => updateTheme({ qrColor: v })} /></Row>
        <Row label="Fond QR"><ColorPicker label="Fond QR" value={theme.qrBg || '#ffffff'} onChange={v => updateTheme({ qrBg: v })} /></Row>
        {uploadZone('Logo centré (PNG transparent)', 'qrLogoSrc')}
        {theme.qrLogoSrc && removeBtn('Supprimer le logo QR', () => updateTheme({ qrLogoSrc: null }))}
        <div className={s.preview}>
          <span>Aperçu QR</span>
          <QrCode key={theme.qrLogoSrc + theme.qrColor + theme.qrBg} value="FY-DEMO" size={80} />
        </div>
      </>)}

      {/* Bannière */}
      {section(<>
        {sectionTitle("Image d'accueil")}
        {uploadZone('Bannière dashboard', 'bannerSrc')}
        {theme.bannerSrc && (
          <>
            <div className={s.banner}>
              <img src={theme.bannerSrc} alt="Bannière" />
            </div>
            {removeBtn('Supprimer la bannière', () => updateTheme({ bannerSrc: null }))}
          </>
        )}
      </>)}

      {/* Thèmes prédéfinis */}
      {section(<>
        {sectionTitle('Thèmes prédéfinis')}
        <div className={s.presets}>
          {PRESETS.map(p => (
            <button key={p.name} type="button" className={s.preset} onClick={() => applyPreset(p)}>
              <span className={s.presetDot} style={{ background: p.brand }} aria-hidden="true" />
              {p.name}
            </button>
          ))}
        </div>
        <button type="button" className={s.reset} onClick={resetTheme}>
          <RefreshCw size={13} aria-hidden="true" /> Réinitialiser
        </button>
      </>)}
    </aside>
  )
}
