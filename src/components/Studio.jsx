/**
 * components/Studio.jsx
 * Panneau de personnalisation visuelle (admin uniquement).
 * Couleurs, typographie, logo, QR code, thèmes prédéfinis.
 */

import React from 'react'
import { Wand2, RefreshCw, Upload } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { PRESETS } from '../utils/helpers'
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
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
    <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
    {children}
  </div>
)

const ColorPicker = ({ value, onChange }) => (
  <div style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border2)', overflow: 'hidden', padding: 0, background: 'none', cursor: 'pointer' }}>
    <input type="color" value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '200%', height: '200%', margin: '-50%', border: 'none', cursor: 'pointer' }} />
  </div>
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
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
      {label}
    </div>
  )

  const section = (children) => (
    <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)' }}>
      {children}
    </div>
  )

  const uploadZone = (label, field) => (
    <label style={{ display: 'block', border: '2px dashed var(--border2)', borderRadius: 10, padding: 12, textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}>
      <Upload size={18} style={{ color: 'var(--muted)', display: 'block', margin: '0 auto 4px' }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadFile(field, e.target.files[0])} />
    </label>
  )

  return (
    <div style={{
      width: 260, flexShrink: 0,
      background: 'var(--bg2)', borderLeft: '0.5px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      transition: 'background .25s',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>
        <Wand2 size={16} style={{ color: 'var(--brand)' }} />
        Studio de personnalisation
      </div>

      {/* Logo & identité */}
      {section(<>
        {sectionTitle('Logo & identité')}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nom du festival</label>
          <input
            style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border2)', borderRadius: 8, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)' }}
            value={theme.festName || ''}
            onChange={e => updateTheme({ festName: e.target.value })}
          />
        </div>
        {uploadZone('Importer un logo', 'logoSrc')}
        {theme.logoSrc && (
          <button onClick={() => updateTheme({ logoSrc: null })}
            style={{ marginTop: 6, fontSize: 11, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            Supprimer le logo
          </button>
        )}
      </>)}

      {/* Couleurs */}
      {section(<>
        {sectionTitle('Couleurs')}
        <Row label="Couleur principale"><ColorPicker value={theme.brand || '#1D9E75'} onChange={v => updateTheme({ brand: v, qrColor: v })} /></Row>
        <Row label="Couleur secondaire"><ColorPicker value={theme.purple || '#534AB7'} onChange={v => updateTheme({ purple: v })} /></Row>
        <Row label="Fond application"><ColorPicker value={theme.bg || '#ffffff'} onChange={v => updateTheme({ bg: v })} /></Row>
        <Row label="Fond sidebar/cards"><ColorPicker value={theme.bg2 || '#f5f5f3'} onChange={v => updateTheme({ bg2: v })} /></Row>
        <Row label="Texte principal"><ColorPicker value={theme.text || '#1a1a1a'} onChange={v => updateTheme({ text: v })} /></Row>
      </>)}

      {/* Typographie */}
      {section(<>
        {sectionTitle('Typographie')}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Police</label>
          <select
            value={theme.font}
            onChange={e => updateTheme({ font: e.target.value })}
            style={{ width: '100%', padding: '6px 8px', border: '0.5px solid var(--border2)', borderRadius: 8, fontSize: 12, background: 'var(--bg)', color: 'var(--text)' }}
          >
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <Row label="Taille de base">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={11} max={17} value={theme.fontSize || 13}
              onChange={e => updateTheme({ fontSize: parseInt(e.target.value) })}
              style={{ width: 52, padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: 6, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>px</span>
          </div>
        </Row>
        <Row label="Rayon des coins">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={0} max={24} value={theme.radius || 10}
              onChange={e => updateTheme({ radius: parseInt(e.target.value) })}
              style={{ width: 52, padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: 6, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>px</span>
          </div>
        </Row>
      </>)}

      {/* QR Code */}
      {section(<>
        {sectionTitle('QR Code')}
        <Row label="Couleur QR"><ColorPicker value={theme.qrColor || '#1D9E75'} onChange={v => updateTheme({ qrColor: v })} /></Row>
        <Row label="Fond QR"><ColorPicker value={theme.qrBg || '#ffffff'} onChange={v => updateTheme({ qrBg: v })} /></Row>
        <div style={{ marginTop: 8 }}>
          {uploadZone('Logo centré (PNG transparent)', 'qrLogoSrc')}
          {theme.qrLogoSrc && (
            <button onClick={() => updateTheme({ qrLogoSrc: null })}
              style={{ marginTop: 4, fontSize: 11, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              Supprimer le logo QR
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, background: 'var(--bg)', borderRadius: 10, border: '0.5px solid var(--border)', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Aperçu QR</span>
          <QrCode key={theme.qrLogoSrc + theme.qrColor + theme.qrBg} value="FY-DEMO" size={80} />
        </div>
      </>)}

      {/* Bannière */}
      {section(<>
        {sectionTitle("Image d'accueil")}
        {uploadZone('Bannière dashboard', 'bannerSrc')}
        {theme.bannerSrc && (
          <>
            <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', height: 56 }}>
              <img src={theme.bannerSrc} alt="Bannière" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <button onClick={() => updateTheme({ bannerSrc: null })}
              style={{ marginTop: 4, fontSize: 11, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              Supprimer la bannière
            </button>
          </>
        )}
      </>)}

      {/* Presets */}
      {section(<>
        {sectionTitle('Thèmes prédéfinis')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => applyPreset(p)}
              style={{ padding: '6px 4px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              {p.name}
            </button>
          ))}
        </div>
        <button onClick={resetTheme}
          style={{ width: '100%', marginTop: 10, padding: 7, border: '0.5px solid var(--border2)', borderRadius: 8, background: 'transparent', color: 'var(--red)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={12} /> Réinitialiser
        </button>
      </>)}
    </div>
  )
}
