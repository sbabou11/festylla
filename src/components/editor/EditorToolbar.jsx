/**
 * components/editor/EditorToolbar.jsx
 *
 * Barre supérieure de l'éditeur : retour, nom du template, undo/redo,
 * alignement grille, aperçu PDF, sauvegarde.
 */

import React, { useState } from 'react'
import {
  ArrowLeft, Undo2, Redo2, Grid3x3, Eye, Save, Check,
} from 'lucide-react'

export default function EditorToolbar({
  template, onBack, onNameChange, onDefaultChange,
  onUndo, onRedo, canUndo, canRedo,
  onAlignGrid, onPreview, onSave,
  saving, savedFlash,
}) {
  // État local pour permettre l'édition fluide du nom (puis propagation à la perte de focus)
  const [editName, setEditName] = useState(false)
  const [nameValue, setNameValue] = useState(template?.nom || '')

  React.useEffect(() => { setNameValue(template?.nom || '') }, [template?.nom])

  const commitName = () => {
    setEditName(false)
    if (nameValue.trim() && nameValue !== template.nom) onNameChange(nameValue.trim())
    else setNameValue(template.nom)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', borderBottom: '0.5px solid var(--border)',
      background: 'var(--bg)', flexShrink: 0,
    }}>
      {/* Gauche : retour + nom + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <button onClick={onBack}
          style={{
            background: 'transparent', border: '0.5px solid var(--border)',
            padding: '6px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
            color: 'var(--text)', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          }}>
          <ArrowLeft size={12}/> Retour
        </button>

        {editName ? (
          <input
            type="text"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(template.nom); setEditName(false) } }}
            autoFocus
            style={{
              fontSize: 14, fontWeight: 600, padding: '4px 8px',
              border: '0.5px solid var(--brand)', borderRadius: 4,
              background: 'var(--bg)', color: 'var(--text)',
              outline: 'none', fontFamily: 'inherit', maxWidth: 280,
            }}
          />
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, cursor: 'text', minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => setEditName(true)}
            title="Cliquer pour renommer">
            {template?.nom || 'Sans nom'}
          </div>
        )}

        {template?.isDefault && (
          <span style={{
            padding: '2px 6px', background: 'var(--green-dark)', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 3, letterSpacing: '0.04em',
            flexShrink: 0,
          }}>DÉFAUT</span>
        )}

        {/* Toggle "défaut" */}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0,
        }}>
          <input type="checkbox" checked={!!template?.isDefault}
            onChange={e => onDefaultChange(e.target.checked)}
            style={{ cursor: 'pointer' }}/>
          Modèle par défaut
        </label>
      </div>

      {/* Droite : actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <ToolbarBtn onClick={onUndo} disabled={!canUndo} title="Annuler (Ctrl+Z)" icon={<Undo2 size={14}/>}/>
        <ToolbarBtn onClick={onRedo} disabled={!canRedo} title="Rétablir (Ctrl+Y)" icon={<Redo2 size={14}/>}/>
        <ToolbarBtn onClick={onAlignGrid} title="Aligner tout sur la grille (5mm)" icon={<Grid3x3 size={14}/>} label="Aligner"/>
        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }}/>
        <ToolbarBtn onClick={onPreview} title="Générer un aperçu PDF" icon={<Eye size={14}/>} label="Aperçu"/>
        <button onClick={onSave} disabled={saving}
          style={{
            background: savedFlash ? 'var(--green-dark)' : 'var(--brand)',
            color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6,
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: saving ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'background .2s',
          }}>
          {savedFlash ? <Check size={13}/> : <Save size={13}/>}
          {savedFlash ? 'Sauvegardé' : (saving ? 'Enregistrement…' : 'Enregistrer')}
        </button>
      </div>
    </div>
  )
}

function ToolbarBtn({ onClick, disabled, title, icon, label }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        background: 'transparent', border: '0.5px solid var(--border)',
        padding: label ? '5px 10px' : 0,
        width: label ? 'auto' : 30, height: 30,
        borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
      {icon} {label}
    </button>
  )
}
