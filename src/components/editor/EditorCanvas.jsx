/**
 * components/editor/EditorCanvas.jsx
 *
 * Canvas A4 affichant les éléments du template à l'échelle et permettant :
 *   - Drop d'éléments depuis la sidebar gauche
 *   - Sélection au clic
 *   - Déplacement d'un élément sélectionné (drag)
 *   - Redimensionnement via 4 poignées aux coins
 *   - Affichage de la grille (5mm) toggle
 *
 * Conversion d'unités :
 *   mm → px : mm * (zoom / 100) * (96 / 25.4)
 *   px → mm : px / (96 / 25.4) / (zoom / 100)
 *   Le ratio 96/25.4 = 3.7795 px/mm à 100% (standard CSS DPI).
 */

import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { PAGE_A4, newElement } from '../../utils/factureTemplate'

const PX_PER_MM = 96 / 25.4 // ≈ 3.7795
const GRID_MM = 5

export default function EditorCanvas({
  template, selectedId, onSelect, onUpdate,
  zoom, setZoom, snapGrid, setSnapGrid,
}) {
  const canvasRef = useRef(null)

  // ─── État du drag (déplacement ou redimensionnement) ──────────────
  // dragOp : { kind: 'move'|'resize-nw'|'resize-ne'|'resize-sw'|'resize-se',
  //            elementId, startX, startY, startElement }
  const [dragOp, setDragOp] = useState(null)

  const scale = zoom / 100
  const pxPerMm = PX_PER_MM * scale
  const pageWpx = PAGE_A4.width * pxPerMm
  const pageHpx = PAGE_A4.height * pxPerMm

  // ─── Conversion coordonnées souris → mm relatif au canvas ────────
  const getMmFromEvent = useCallback((e) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / pxPerMm,
      y: (e.clientY - rect.top) / pxPerMm,
    }
  }, [pxPerMm])

  // Snap to grid si activé
  const snap = useCallback((v) => snapGrid ? Math.round(v / GRID_MM) * GRID_MM : Math.round(v * 10) / 10, [snapGrid])

  // ─── Gestion du drop depuis sidebar gauche ────────────────────────
  const handleDragOver = (e) => {
    if (e.dataTransfer.types.includes('application/yllacash-element-type')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const handleDrop = (e) => {
    const type = e.dataTransfer.getData('application/yllacash-element-type')
    if (!type) return
    e.preventDefault()
    const { x, y } = getMmFromEvent(e)
    // On positionne le nouvel élément à l'emplacement du drop, en centrant la taille par défaut
    const tpl = newElement(type, { x: snap(Math.max(0, x - 20)), y: snap(Math.max(0, y - 5)) })
    // On délègue l'ajout au parent via le mécanisme normal d'addElement par update
    // → On simule un add en passant par onUpdate du parent qui interprétera ce cas spécial.
    // Mais ici nous n'avons pas onAdd direct, donc on déclenche une mise à jour partielle :
    //   on ajoute l'élément à template.elements directement via une convention :
    //   onUpdate avec id null + patch { __addElement: tpl }
    // Pour rester simple, on déclenche un evt custom sur window que le parent écoute.
    window.dispatchEvent(new CustomEvent('yc-editor-add-element', { detail: tpl }))
  }

  // ─── Démarrage d'un drag (déplacement ou redimensionnement) ──────
  const startMove = (e, el) => {
    e.stopPropagation()
    onSelect(el.id)
    const { x, y } = getMmFromEvent(e)
    setDragOp({ kind: 'move', elementId: el.id, startX: x, startY: y, startElement: { ...el } })
  }

  const startResize = (e, el, corner) => {
    e.stopPropagation()
    onSelect(el.id)
    const { x, y } = getMmFromEvent(e)
    setDragOp({ kind: `resize-${corner}`, elementId: el.id, startX: x, startY: y, startElement: { ...el } })
  }

  // Pendant le drag : mise à jour live de l'élément
  useEffect(() => {
    if (!dragOp) return
    const onMove = (e) => {
      const { x, y } = getMmFromEvent(e)
      const dx = x - dragOp.startX
      const dy = y - dragOp.startY
      const el = dragOp.startElement

      if (dragOp.kind === 'move') {
        // Bornage dans la page (positionne le coin haut-gauche, donc element peut sortir si w/h > marge)
        const newX = Math.max(0, Math.min(PAGE_A4.width - 5, el.x + dx))
        const newY = Math.max(0, Math.min(PAGE_A4.height - 5, el.y + dy))
        onUpdate(el.id, { x: snap(newX), y: snap(newY) })
      } else if (dragOp.kind === 'resize-se') {
        // Redimensionnement bas-droite : agrandit w/h
        const newW = Math.max(5, el.w + dx)
        const newH = Math.max(3, el.h + dy)
        onUpdate(el.id, { w: snap(newW), h: snap(newH) })
      } else if (dragOp.kind === 'resize-sw') {
        const newW = Math.max(5, el.w - dx)
        const newH = Math.max(3, el.h + dy)
        const newX = el.x + (el.w - newW)
        onUpdate(el.id, { x: snap(newX), w: snap(newW), h: snap(newH) })
      } else if (dragOp.kind === 'resize-ne') {
        const newW = Math.max(5, el.w + dx)
        const newH = Math.max(3, el.h - dy)
        const newY = el.y + (el.h - newH)
        onUpdate(el.id, { y: snap(newY), w: snap(newW), h: snap(newH) })
      } else if (dragOp.kind === 'resize-nw') {
        const newW = Math.max(5, el.w - dx)
        const newH = Math.max(3, el.h - dy)
        const newX = el.x + (el.w - newW)
        const newY = el.y + (el.h - newH)
        onUpdate(el.id, { x: snap(newX), y: snap(newY), w: snap(newW), h: snap(newH) })
      }
    }
    const onUp = () => setDragOp(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragOp, getMmFromEvent, onUpdate, snap])

  // Click sur fond canvas (en dehors d'un élément) → déselectionner
  const handleCanvasClick = (e) => {
    if (e.target === canvasRef.current || e.target.dataset.canvasBg === 'true') {
      onSelect(null)
    }
  }

  return (
    <div style={{
      background: 'var(--bg2)', border: '0.5px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Zone de défilement contenant la page */}
      <div style={{
        flex: 1, overflow: 'auto', padding: 20,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      }}>
        <div
          ref={canvasRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleCanvasClick}
          data-canvas-bg="true"
          style={{
            position: 'relative',
            width: pageWpx, height: pageHpx,
            background: '#ffffff',
            border: '0.5px solid var(--border2)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            flexShrink: 0,
            // Grille en background si activée
            backgroundImage: snapGrid
              ? `linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),
                 linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)`
              : 'none',
            backgroundSize: snapGrid
              ? `${GRID_MM * pxPerMm}px ${GRID_MM * pxPerMm}px`
              : 'auto',
          }}>
          {template.elements.map(el => (
            <ElementRenderer
              key={el.id}
              el={el}
              pxPerMm={pxPerMm}
              isSelected={selectedId === el.id}
              onStartMove={startMove}
              onStartResize={startResize}
            />
          ))}
        </div>
      </div>

      {/* Barre du bas : zoom + grille */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '6px 12px', borderTop: '0.5px solid var(--border)',
        background: 'var(--bg)', fontSize: 11, color: 'var(--muted)',
        flexShrink: 0,
      }}>
        <span>A4 · 210 × 297 mm</span>
        <span>·</span>
        <button onClick={() => setZoom(Math.max(50, zoom - 10))}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, display: 'flex' }}>
          <ZoomOut size={14}/>
        </button>
        <input type="range" min="50" max="150" value={zoom}
          onChange={e => setZoom(parseInt(e.target.value))}
          style={{ width: 100 }}/>
        <button onClick={() => setZoom(Math.min(150, zoom + 10))}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, display: 'flex' }}>
          <ZoomIn size={14}/>
        </button>
        <span style={{ minWidth: 32 }}>{zoom}%</span>
        <div style={{ flex: 1 }}/>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={snapGrid} onChange={e => setSnapGrid(e.target.checked)} style={{ cursor: 'pointer' }}/>
          Grille 5mm
        </label>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// ElementRenderer — Rendu HTML d'un élément du template
// ═══════════════════════════════════════════════════════════════════
// Chaque type d'élément a son rendu visuel "wysiwyg" qui ressemble au PDF
// final. La position et la taille sont calculées en pixels en multipliant
// les valeurs mm du modèle par pxPerMm.

function ElementRenderer({ el, pxPerMm, isSelected, onStartMove, onStartResize }) {
  // Position & taille en pixels pour le rendu HTML
  const style = {
    position: 'absolute',
    left:   el.x * pxPerMm,
    top:    el.y * pxPerMm,
    width:  el.w * pxPerMm,
    height: el.h * pxPerMm,
    cursor: 'move',
    boxSizing: 'border-box',
    // Sélection visuelle : outline 1.5 px bleu offset 2px
    outline: isSelected ? '1.5px solid #378ADD' : 'none',
    outlineOffset: 2,
    userSelect: 'none',
  }

  // Rendu spécifique par type
  let content = null
  switch (el.type) {
    case 'text':
    case 'field': {
      const fontStyle = el.italic ? 'italic' : 'normal'
      const fontWeight = el.bold ? 700 : 400
      content = (
        <div style={{
          width: '100%', height: '100%',
          fontSize: (el.fontSize || 10) * pxPerMm * 0.353,  // mm → pt approximatif
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontStyle, fontWeight,
          color: el.color || '#222222',
          textAlign: el.align || 'left',
          lineHeight: 1.2,
          overflow: 'hidden',
          whiteSpace: 'pre-line',
        }}>
          {/* Affichage des variables comme texte tel quel (pas remplacé en édition) */}
          {el.content || ''}
        </div>
      )
      break
    }
    case 'paragraph': {
      const fontStyle = el.italic ? 'italic' : 'normal'
      const fontWeight = el.bold ? 700 : 400
      content = (
        <div style={{
          width: '100%', height: '100%',
          fontSize: (el.fontSize || 10) * pxPerMm * 0.353,
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontStyle, fontWeight,
          color: el.color || '#444444',
          textAlign: el.align || 'left',
          lineHeight: el.lineHeight || 1.4,
          overflow: 'hidden',
          whiteSpace: 'pre-line',
        }}>
          {el.content || ''}
        </div>
      )
      break
    }
    case 'image': {
      content = el.src ? (
        <img src={el.src} alt="" style={{
          width: '100%', height: '100%', objectFit: 'contain', display: 'block',
        }}/>
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: '#F0F0F0',
          border: '0.5px dashed #999',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#888', fontStyle: 'italic',
        }}>
          Image
        </div>
      )
      break
    }
    case 'table': {
      content = (
        <div style={{
          width: '100%', height: '100%',
          border: '0.5px solid #DDD',
          background: '#fff', overflow: 'hidden',
        }}>
          {/* Header simulé */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: (el.columns || []).map(c => `${c.width}fr`).join(' '),
            padding: '3px 5px', background: el.headerBg || '#F0F0F0',
            fontSize: 8 * pxPerMm * 0.353,
            fontWeight: 700, color: el.headerColor || '#202020',
            borderBottom: '0.5px solid #DDD',
          }}>
            {(el.columns || []).map((c, i) => (
              <div key={i} style={{ textAlign: c.align || 'left' }}>{c.label}</div>
            ))}
          </div>
          {/* 3 lignes factices */}
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: (el.columns || []).map(c => `${c.width}fr`).join(' '),
              padding: '2px 5px',
              fontSize: 7 * pxPerMm * 0.353,
              color: '#666',
              borderBottom: '0.5px solid #EEE',
            }}>
              {(el.columns || []).map((c, j) => (
                <div key={j} style={{ textAlign: c.align || 'left' }}>—</div>
              ))}
            </div>
          ))}
          <div style={{
            padding: '2px 5px', fontSize: 7 * pxPerMm * 0.353,
            color: '#888', fontStyle: 'italic', textAlign: 'center',
          }}>
            (données dynamiques)
          </div>
        </div>
      )
      break
    }
    case 'line': {
      content = (
        <div style={{
          width: '100%', height: '100%',
          borderTop: `${Math.max(0.5, el.strokeWidth * pxPerMm)}px solid ${el.color || '#CCCCCC'}`,
        }}/>
      )
      break
    }
    case 'rect': {
      content = (
        <div style={{
          width: '100%', height: '100%',
          background: el.fillColor || 'transparent',
          border: el.borderWidth > 0 ? `${Math.max(0.5, el.borderWidth * pxPerMm)}px solid ${el.borderColor || '#DDDDDD'}` : 'none',
        }}/>
      )
      break
    }
    default:
      content = (
        <div style={{
          width: '100%', height: '100%', background: '#FFE0E0',
          color: '#A32D2D', fontSize: 9, padding: 4,
        }}>?{el.type}</div>
      )
  }

  return (
    <div style={style} onMouseDown={(e) => onStartMove(e, el)}>
      {content}
      {/* Poignées de redimensionnement (uniquement si sélectionné) */}
      {isSelected && (
        <>
          <ResizeHandle corner="nw" onMouseDown={(e) => onStartResize(e, el, 'nw')}/>
          <ResizeHandle corner="ne" onMouseDown={(e) => onStartResize(e, el, 'ne')}/>
          <ResizeHandle corner="sw" onMouseDown={(e) => onStartResize(e, el, 'sw')}/>
          <ResizeHandle corner="se" onMouseDown={(e) => onStartResize(e, el, 'se')}/>
        </>
      )}
    </div>
  )
}

function ResizeHandle({ corner, onMouseDown }) {
  // Position absolue dans l'élément parent (qui a outline-offset 2)
  const positions = {
    nw: { left: -4, top: -4, cursor: 'nwse-resize' },
    ne: { right: -4, top: -4, cursor: 'nesw-resize' },
    sw: { left: -4, bottom: -4, cursor: 'nesw-resize' },
    se: { right: -4, bottom: -4, cursor: 'nwse-resize' },
  }
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        width: 8, height: 8,
        background: '#fff',
        border: '1.5px solid #378ADD',
        borderRadius: 1,
        zIndex: 10,
        ...positions[corner],
      }}
    />
  )
}
