/**
 * components/editor/EditorSidebarLeft.jsx
 *
 * Sidebar gauche : bibliothèque d'éléments draggables + liste des variables disponibles.
 *
 * 2 modes de création d'un élément :
 *   - Drag depuis la sidebar vers le canvas (élégant, mais nécessite gestion drop sur canvas)
 *   - Clic sur l'élément : ajoute au canvas avec position par défaut (fallback simple)
 *
 * On expose les 2 modes : drag = pour les power users, clic = pour les autres.
 */

import React, { useState } from 'react'
import {
  Type, AlignLeft, Image as ImageIcon, Variable,
  Table, Minus, Square, Layers,
} from 'lucide-react'
import { ELEMENT_TYPES, VARIABLES } from '../../utils/factureTemplate'

const ELEMENT_ICONS = {
  text:      Type,
  paragraph: AlignLeft,
  image:     ImageIcon,
  field:     Variable,
  table:     Table,
  line:      Minus,
  rect:      Square,
}

export default function EditorSidebarLeft({ onAdd, template, selectedId, onSelect }) {
  // Tab actif : 'add' (bibliothèque) ou 'layers' (liste des éléments du template)
  const [tab, setTab] = useState('add')

  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('application/yllacash-element-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div style={{
      background: 'var(--bg)', border: '0.5px solid var(--border)',
      borderRadius: 8, padding: 10, overflow: 'auto',
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: 3, marginBottom: 10,
        background: 'var(--bg2)', borderRadius: 6,
      }}>
        <TabBtn active={tab === 'add'} onClick={() => setTab('add')} label="Éléments"/>
        <TabBtn active={tab === 'layers'} onClick={() => setTab('layers')} label="Calques"/>
      </div>

      {tab === 'add' && (
        <>
          <SectionH>Bibliothèque</SectionH>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            {Object.values(ELEMENT_TYPES).map(t => {
              const Icon = ELEMENT_ICONS[t.id] || Type
              return (
                <div key={t.id}
                  draggable
                  onDragStart={e => handleDragStart(e, t.id)}
                  onClick={() => onAdd(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 8px', background: 'var(--bg2)', borderRadius: 5,
                    cursor: 'grab', fontSize: 11, color: 'var(--text)',
                    userSelect: 'none',
                  }}
                  title={`Glisser sur le canvas ou cliquer pour ajouter ${t.label}`}>
                  <Icon size={14} style={{ color: 'var(--muted)', flexShrink: 0 }}/>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.label}
                  </span>
                </div>
              )
            })}
          </div>

          <SectionH>Variables disponibles</SectionH>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.4 }}>
            Copiez-collez ces codes dans un champ texte ou variable :
          </div>
          <VariablesList/>
        </>
      )}

      {tab === 'layers' && (
        <>
          <SectionH>Éléments du template</SectionH>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
            {template.elements.length} élément(s)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {template.elements.length === 0 && (
              <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--muted)', padding: 8 }}>
                Aucun élément. Ajoutez-en depuis l'onglet Éléments.
              </div>
            )}
            {template.elements.map(el => {
              const Icon = ELEMENT_ICONS[el.type] || Type
              const isSelected = selectedId === el.id
              const previewLabel = el.content
                ? String(el.content).slice(0, 22).replace(/\n/g, ' ')
                : ELEMENT_TYPES[el.type]?.label || el.type
              return (
                <div key={el.id}
                  onClick={() => onSelect(el.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 7px', borderRadius: 4,
                    background: isSelected ? 'var(--brand-light)' : 'transparent',
                    color: isSelected ? 'var(--brand-dark)' : 'var(--text)',
                    fontSize: 11, cursor: 'pointer', userSelect: 'none',
                    border: isSelected ? '0.5px solid var(--brand)' : '0.5px solid transparent',
                  }}>
                  <Icon size={12} style={{ flexShrink: 0 }}/>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {previewLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, padding: '5px 8px',
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        fontWeight: active ? 600 : 500,
        border: 'none', borderRadius: 4,
        fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
      }}>
      {label}
    </button>
  )
}

function SectionH({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      marginBottom: 6,
    }}>{children}</div>
  )
}

function VariablesList() {
  // Groupage par catégorie pour un parcours plus facile
  const groups = {}
  for (const v of VARIABLES) {
    if (!groups[v.group]) groups[v.group] = []
    groups[v.group].push(v)
  }

  const [openGroup, setOpenGroup] = useState('Exposant')

  const handleCopy = (key) => {
    try {
      navigator.clipboard.writeText(key)
    } catch (e) { /* navigateurs anciens */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Object.entries(groups).map(([groupName, items]) => (
        <div key={groupName}>
          <div onClick={() => setOpenGroup(openGroup === groupName ? null : groupName)}
            style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text)',
              padding: '4px 6px', background: 'var(--bg2)', borderRadius: 4,
              cursor: 'pointer', userSelect: 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
            {groupName}
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>
              {openGroup === groupName ? '−' : '+'} {items.length}
            </span>
          </div>
          {openGroup === groupName && (
            <div style={{ paddingLeft: 4, marginTop: 2 }}>
              {items.map(v => (
                <div key={v.key}
                  onClick={() => handleCopy(v.key)}
                  title={v.label + ' — cliquer pour copier'}
                  style={{
                    fontSize: 9, padding: '3px 6px',
                    background: 'var(--bg2)', borderRadius: 3,
                    marginBottom: 2, cursor: 'pointer',
                    fontFamily: 'monospace', color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {v.key}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
