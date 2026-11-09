/**
 * components/editor/EditorSidebarRight.jsx
 *
 * Panneau de propriétés contextuelles : ce qui s'affiche dépend du type
 * de l'élément sélectionné.
 *
 * Sections communes :
 *   - Position (x, y)
 *   - Dimensions (largeur, hauteur)
 *   - Actions (dupliquer, supprimer)
 *
 * Sections spécifiques selon type :
 *   - text/field/paragraph : contenu, police, taille, couleur, alignement, gras/italique
 *   - image                : upload ou URL
 *   - table                : configuration des colonnes, en-tête
 *   - line                 : épaisseur, couleur
 *   - rect                 : fond, bordure
 */

import React, { useRef, useState, useEffect } from 'react'
import {
  Type, AlignLeft, Image as ImageIcon, Variable, Table,
  Minus, Square, Copy, Trash2, Bold, Italic, Upload, X, ChevronUp, ChevronDown,
} from 'lucide-react'
import { ELEMENT_TYPES } from '../../utils/factureTemplate'

const TYPE_ICONS = {
  text: Type, paragraph: AlignLeft, image: ImageIcon, field: Variable,
  table: Table, line: Minus, rect: Square,
}

export default function EditorSidebarRight({ element, onUpdate, onDuplicate, onDelete }) {
  if (!element) {
    return (
      <div style={{
        background: 'var(--bg)', border: '0.5px solid var(--border)',
        borderRadius: 8, padding: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'var(--muted)', fontStyle: 'italic',
        textAlign: 'center', height: 'fit-content',
      }}>
        Sélectionnez un élément du canvas pour voir ses propriétés
      </div>
    )
  }

  const Icon = TYPE_ICONS[element.type] || Type
  const typeLabel = ELEMENT_TYPES[element.type]?.label || element.type

  return (
    <div style={{
      background: 'var(--bg)', border: '0.5px solid var(--border)',
      borderRadius: 8, padding: 10, overflow: 'auto',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Titre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon size={14} style={{ color: 'var(--muted)' }}/>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>{typeLabel}</div>
      </div>

      {/* Propriétés spécifiques au type */}
      {(element.type === 'text' || element.type === 'field' || element.type === 'paragraph') && (
        <TextProps element={element} onUpdate={onUpdate}/>
      )}
      {element.type === 'image' && <ImageProps element={element} onUpdate={onUpdate}/>}
      {element.type === 'table' && <TableProps element={element} onUpdate={onUpdate}/>}
      {element.type === 'line' && <LineProps element={element} onUpdate={onUpdate}/>}
      {element.type === 'rect' && <RectProps element={element} onUpdate={onUpdate}/>}

      {/* Position & dimensions communes à tous */}
      <PositionProps element={element} onUpdate={onUpdate}/>

      {/* Actions */}
      <div style={{
        borderTop: '0.5px solid var(--border)', paddingTop: 8,
        display: 'flex', gap: 5,
      }}>
        <button onClick={onDuplicate}
          style={{
            flex: 1, padding: '6px 8px', fontSize: 10,
            background: 'transparent', color: 'var(--text)',
            border: '0.5px solid var(--border)', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
          <Copy size={11}/> Dupliquer
        </button>
        <button onClick={onDelete}
          style={{
            flex: 1, padding: '6px 8px', fontSize: 10,
            background: 'transparent', color: 'var(--red-dark)',
            border: '0.5px solid var(--red)', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
          <Trash2 size={11}/> Supprimer
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Sous-composants par type
// ═══════════════════════════════════════════════════════════════════

function TextProps({ element, onUpdate }) {
  const isMultiline = element.type === 'paragraph'
  return (
    <>
      <Field label="Contenu">
        {isMultiline ? (
          <textarea
            value={element.content || ''}
            onChange={e => onUpdate({ content: e.target.value })}
            rows={4}
            style={{ ...INPUT_BASE, fontFamily: 'monospace', minHeight: 60, resize: 'vertical' }}
            placeholder="Texte ou variable {{...}}"
          />
        ) : (
          <input
            type="text"
            value={element.content || ''}
            onChange={e => onUpdate({ content: e.target.value })}
            style={{ ...INPUT_BASE, fontFamily: 'monospace' }}
            placeholder="Texte ou {{variable}}"
          />
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Field label="Taille (pt)">
          <input type="number" min={6} max={48}
            value={element.fontSize || 10}
            onChange={e => onUpdate({ fontSize: Number(e.target.value) || 10 })}
            style={INPUT_BASE}/>
        </Field>
        <Field label="Couleur">
          <input type="color"
            value={element.color || '#222222'}
            onChange={e => onUpdate({ color: e.target.value })}
            style={{ ...INPUT_BASE, height: 28, padding: 2 }}/>
        </Field>
      </div>

      <Field label="Alignement">
        <select value={element.align || 'left'}
          onChange={e => onUpdate({ align: e.target.value })}
          style={INPUT_BASE}>
          <option value="left">Gauche</option>
          <option value="center">Centre</option>
          <option value="right">Droite</option>
        </select>
      </Field>

      <div style={{ display: 'flex', gap: 4 }}>
        <ToggleBtn active={!!element.bold} onClick={() => onUpdate({ bold: !element.bold })} title="Gras">
          <Bold size={12}/>
        </ToggleBtn>
        <ToggleBtn active={!!element.italic} onClick={() => onUpdate({ italic: !element.italic })} title="Italique">
          <Italic size={12}/>
        </ToggleBtn>
      </div>

      {isMultiline && (
        <Field label="Interligne">
          <input type="number" step={0.1} min={1} max={3}
            value={element.lineHeight || 1.4}
            onChange={e => onUpdate({ lineHeight: parseFloat(e.target.value) || 1.4 })}
            style={INPUT_BASE}/>
        </Field>
      )}

      {/* Option "masquer si vide" : pratique pour les sections optionnelles
          (notes, commentaires, mentions conditionnelles). Active automatiquement
          skipIfEmptyVar sur la première variable trouvée dans le contenu. */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 5,
        fontSize: 10, color: 'var(--text)', cursor: 'pointer',
        padding: '6px 0',
      }}>
        <input type="checkbox" checked={!!element.skipIfEmpty}
          onChange={e => {
            const checked = e.target.checked
            // Auto-détection de la première variable {{...}} du contenu
            const match = (element.content || '').match(/\{\{[\w.]+\}\}/)
            onUpdate({
              skipIfEmpty: checked,
              skipIfEmptyVar: checked && match ? match[0] : null,
            })
          }}
          style={{ marginTop: 2, cursor: 'pointer' }}/>
        <div>
          <div style={{ fontWeight: 600 }}>Masquer si la variable est vide</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>
            Utile pour les sections optionnelles (notes, mentions). Détecte la 1ère variable du contenu.
          </div>
        </div>
      </label>
    </>
  )
}

function ImageProps({ element, onUpdate }) {
  const inputRef = useRef(null)
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\//.test(file.type)) { alert('Veuillez sélectionner une image'); return }
    if (file.size > 1 * 1024 * 1024) {
      alert('Image trop volumineuse (max 1 Mo). Les images sont stockées en base64 dans le template.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      // Redimensionnement à 400px max pour limiter la taille du JSON template
      const img = new Image()
      img.onload = () => {
        const MAX = 400
        const ratio = Math.min(1, MAX / img.width)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/png')
        onUpdate({ src: dataUrl })
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <Field label="Image">
        {element.src ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              padding: 6, background: 'var(--bg2)', borderRadius: 4,
              border: '0.5px solid var(--border)', textAlign: 'center',
            }}>
              <img src={element.src} alt="" style={{ maxWidth: '100%', maxHeight: 80, display: 'block', margin: '0 auto' }}/>
            </div>
            <button onClick={() => onUpdate({ src: null })}
              style={{
                padding: '6px', fontSize: 10,
                background: 'transparent', color: 'var(--red-dark)',
                border: '0.5px solid var(--red)', borderRadius: 4,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <X size={11}/> Retirer
            </button>
          </div>
        ) : (
          <label style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '8px 10px', background: 'var(--bg2)', color: 'var(--text)',
            border: '0.5px dashed var(--border2)', borderRadius: 4,
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            width: '100%', boxSizing: 'border-box',
          }}>
            <Upload size={12}/> Choisir une image…
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }}/>
          </label>
        )}
      </Field>
      <div style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic', marginTop: -4 }}>
        PNG/JPG, max 1 Mo (redimensionné à 400px).
      </div>
    </>
  )
}

function TableProps({ element, onUpdate }) {
  const updateColumn = (idx, patch) => {
    const cols = [...(element.columns || [])]
    cols[idx] = { ...cols[idx], ...patch }
    onUpdate({ columns: cols })
  }
  const removeColumn = (idx) => {
    if ((element.columns || []).length <= 1) { alert('Au moins une colonne doit rester'); return }
    onUpdate({ columns: element.columns.filter((_, i) => i !== idx) })
  }
  const addColumn = () => {
    onUpdate({
      columns: [...(element.columns || []), {
        label: 'Nouvelle colonne', field: 'description', width: 30, align: 'left'
      }]
    })
  }
  const moveColumn = (idx, dir) => {
    const cols = [...(element.columns || [])]
    const ni = idx + dir
    if (ni < 0 || ni >= cols.length) return
    ;[cols[idx], cols[ni]] = [cols[ni], cols[idx]]
    onUpdate({ columns: cols })
  }

  return (
    <>
      <Field label="Couleur en-tête (fond)">
        <input type="color" value={element.headerBg || '#F0F0F0'}
          onChange={e => onUpdate({ headerBg: e.target.value })}
          style={{ ...INPUT_BASE, height: 28, padding: 2 }}/>
      </Field>
      <Field label="Couleur texte en-tête">
        <input type="color" value={element.headerColor || '#202020'}
          onChange={e => onUpdate({ headerColor: e.target.value })}
          style={{ ...INPUT_BASE, height: 28, padding: 2 }}/>
      </Field>
      <Field label="Taille du texte (pt)">
        <input type="number" min={6} max={20}
          value={element.fontSize || 10}
          onChange={e => onUpdate({ fontSize: Number(e.target.value) || 10 })}
          style={INPUT_BASE}/>
      </Field>
      <Field label="Afficher total TTC sous le tableau">
        <select value={element.showTotal !== false ? 'yes' : 'no'}
          onChange={e => onUpdate({ showTotal: e.target.value === 'yes' })}
          style={INPUT_BASE}>
          <option value="yes">Oui</option>
          <option value="no">Non</option>
        </select>
      </Field>

      <div>
        <div style={{
          fontSize: 9, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
          marginTop: 4,
        }}>Colonnes</div>
        {(element.columns || []).map((c, i) => (
          <div key={i} style={{
            background: 'var(--bg2)', padding: 6, borderRadius: 4,
            marginBottom: 4, fontSize: 10,
          }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginBottom: 4 }}>
              <input type="text" value={c.label || ''}
                onChange={e => updateColumn(i, { label: e.target.value })}
                placeholder="Libellé"
                style={{ ...INPUT_BASE, fontSize: 10, flex: 1 }}/>
              <button onClick={() => moveColumn(i, -1)} disabled={i === 0}
                style={MINI_BTN_STYLE}>
                <ChevronUp size={10}/>
              </button>
              <button onClick={() => moveColumn(i, 1)} disabled={i === element.columns.length - 1}
                style={MINI_BTN_STYLE}>
                <ChevronDown size={10}/>
              </button>
              <button onClick={() => removeColumn(i)}
                style={{ ...MINI_BTN_STYLE, color: 'var(--red-dark)' }}>
                <X size={10}/>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
              <select value={c.field} onChange={e => updateColumn(i, { field: e.target.value })}
                style={{ ...INPUT_BASE, fontSize: 9, padding: '4px 5px' }}
                title="Donnée source">
                <option value="description">description</option>
                <option value="qty">qty</option>
                <option value="prixUnit">prixUnit</option>
                <option value="total">total</option>
              </select>
              <select value={c.align || 'left'} onChange={e => updateColumn(i, { align: e.target.value })}
                style={{ ...INPUT_BASE, fontSize: 9, padding: '4px 5px' }}>
                <option value="left">Gauche</option>
                <option value="center">Centre</option>
                <option value="right">Droite</option>
              </select>
              <input type="number" value={c.width || 30}
                onChange={e => updateColumn(i, { width: Number(e.target.value) || 30 })}
                title="Largeur relative"
                style={{ ...INPUT_BASE, fontSize: 9, padding: '4px 5px' }}/>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, fontSize: 9, color: 'var(--muted)' }}>
              <input type="checkbox" checked={!!c.isCurrency}
                onChange={e => updateColumn(i, { isCurrency: e.target.checked })}/>
              Formater en €
            </label>
          </div>
        ))}
        <button onClick={addColumn}
          style={{
            width: '100%', padding: 6, fontSize: 10,
            background: 'transparent', color: 'var(--text)',
            border: '0.5px dashed var(--border2)', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>+ Ajouter colonne</button>
      </div>
    </>
  )
}

function LineProps({ element, onUpdate }) {
  return (
    <>
      <Field label="Épaisseur (mm)">
        <input type="number" step={0.1} min={0.1} max={5}
          value={element.strokeWidth || 0.3}
          onChange={e => onUpdate({ strokeWidth: parseFloat(e.target.value) || 0.3 })}
          style={INPUT_BASE}/>
      </Field>
      <Field label="Couleur">
        <input type="color" value={element.color || '#CCCCCC'}
          onChange={e => onUpdate({ color: e.target.value })}
          style={{ ...INPUT_BASE, height: 28, padding: 2 }}/>
      </Field>
    </>
  )
}

function RectProps({ element, onUpdate }) {
  return (
    <>
      <Field label="Couleur de fond">
        <input type="color" value={element.fillColor || '#F5F5F5'}
          onChange={e => onUpdate({ fillColor: e.target.value })}
          style={{ ...INPUT_BASE, height: 28, padding: 2 }}/>
      </Field>
      <Field label="Couleur de bordure">
        <input type="color" value={element.borderColor || '#DDDDDD'}
          onChange={e => onUpdate({ borderColor: e.target.value })}
          style={{ ...INPUT_BASE, height: 28, padding: 2 }}/>
      </Field>
      <Field label="Épaisseur bordure (mm)">
        <input type="number" step={0.1} min={0} max={5}
          value={element.borderWidth || 0}
          onChange={e => onUpdate({ borderWidth: parseFloat(e.target.value) || 0 })}
          style={INPUT_BASE}/>
      </Field>
    </>
  )
}

function PositionProps({ element, onUpdate }) {
  return (
    <div style={{
      borderTop: '0.5px solid var(--border)', paddingTop: 8,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
      }}>Position & dimensions (mm)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        <Field label="X" small>
          <input type="number" step={0.5} value={Math.round(element.x * 10) / 10}
            onChange={e => onUpdate({ x: parseFloat(e.target.value) || 0 })}
            style={INPUT_BASE}/>
        </Field>
        <Field label="Y" small>
          <input type="number" step={0.5} value={Math.round(element.y * 10) / 10}
            onChange={e => onUpdate({ y: parseFloat(e.target.value) || 0 })}
            style={INPUT_BASE}/>
        </Field>
        <Field label="Largeur" small>
          <input type="number" step={0.5} value={Math.round(element.w * 10) / 10}
            onChange={e => onUpdate({ w: Math.max(1, parseFloat(e.target.value) || 1) })}
            style={INPUT_BASE}/>
        </Field>
        <Field label="Hauteur" small>
          <input type="number" step={0.5} value={Math.round(element.h * 10) / 10}
            onChange={e => onUpdate({ h: Math.max(1, parseFloat(e.target.value) || 1) })}
            style={INPUT_BASE}/>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, small, children }) {
  return (
    <div>
      <label style={{
        fontSize: small ? 9 : 10, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        display: 'block', marginBottom: 3, fontWeight: 600,
      }}>{label}</label>
      {children}
    </div>
  )
}

function ToggleBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        flex: 1, padding: '5px',
        background: active ? 'var(--brand-light)' : 'transparent',
        color: active ? 'var(--brand-dark)' : 'var(--text)',
        border: `0.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        fontSize: 10,
      }}>
      {children}
    </button>
  )
}

const INPUT_BASE = {
  width: '100%', padding: '5px 7px', fontSize: 11,
  background: 'var(--bg)', color: 'var(--text)',
  border: '0.5px solid var(--border)', borderRadius: 4,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

const MINI_BTN_STYLE = {
  width: 20, height: 22, padding: 0,
  background: 'transparent', color: 'var(--text)',
  border: '0.5px solid var(--border)', borderRadius: 3,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
