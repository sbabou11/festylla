/**
 * components/expo/TemplatePreview.jsx
 *
 * Miniature visuelle d'un template de facture à l'échelle réduite.
 * Utilisé dans la modale de sélection (InvoiceTemplatePicker) pour aider
 * l'utilisateur à reconnaître son template d'un coup d'œil.
 *
 * Rendu simplifié des éléments :
 *   - text/field/paragraph : rectangle gris foncé proportionnel au texte
 *   - image : rectangle gris clair
 *   - table : rectangle avec bandes horizontales
 *   - line : trait fin
 *   - rect : rectangle vide
 *
 * Pas de rendu réel des polices ou variables : c'est une silhouette pour
 * identification rapide, pas un aperçu fidèle.
 */

import React from 'react'
import { PAGE_A4 } from '../../utils/factureTemplate'

const DEFAULT_WIDTH = 80 // px de la miniature (largeur)

export default function TemplatePreview({ template, width = DEFAULT_WIDTH, isStandard = false }) {
  // Conversion : mm → px à l'échelle de la miniature
  const scale = width / PAGE_A4.width
  const heightPx = PAGE_A4.height * scale

  // Cas "Template standard" : illustration spécifique car pas de elements[] vraies
  // (l'objet réel est le DEFAULT_INVOICE_TEMPLATE importé statiquement).
  // Pour rester découplé, on accepte aussi un template effectivement passé.
  const elements = template?.elements || []

  return (
    <div style={{
      position: 'relative',
      width, height: heightPx,
      background: '#ffffff',
      border: '0.5px solid var(--border2)',
      flexShrink: 0,
    }}>
      {elements.map((el, i) => (
        <PreviewElement key={el.id || i} el={el} scale={scale}/>
      ))}
      {/* Si template vide : indication */}
      {elements.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#bbb', fontSize: 9, fontStyle: 'italic',
        }}>
          (vide)
        </div>
      )}
    </div>
  )
}

/**
 * Rendu simplifié d'un élément en silhouette grise/colorée selon son type.
 * Pas de texte réel : on ne cherche pas à reproduire le contenu, juste sa
 * position et son emprise visuelle.
 */
function PreviewElement({ el, scale }) {
  const style = {
    position: 'absolute',
    left:   Math.max(0, el.x) * scale,
    top:    Math.max(0, el.y) * scale,
    width:  Math.max(1, el.w) * scale,
    height: Math.max(0.5, el.h) * scale,
  }

  switch (el.type) {
    case 'text':
    case 'field':
    case 'paragraph': {
      // Silhouette de texte : bandes horizontales gris foncé pour suggérer des lignes
      const fontSize = (el.fontSize || 10) * scale * 0.5
      return (
        <div style={{
          ...style,
          background: 'rgba(80, 80, 80, 0.4)',
          borderRadius: 0.5,
        }}/>
      )
    }
    case 'image':
      return (
        <div style={{
          ...style,
          background: el.src
            ? `url(${el.src}) center/contain no-repeat`
            : 'repeating-linear-gradient(45deg, #e0e0e0, #e0e0e0 1px, #f5f5f5 1px, #f5f5f5 3px)',
          border: '0.5px solid #ccc',
        }}/>
      )
    case 'table':
      // Bandes horizontales pour suggérer un tableau
      return (
        <div style={{
          ...style,
          background: '#f5f5f5',
          border: '0.5px solid #ccc',
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 2px,
            rgba(0,0,0,0.08) 2px,
            rgba(0,0,0,0.08) 2.5px
          )`,
        }}/>
      )
    case 'line':
      return (
        <div style={{
          ...style,
          background: el.color || '#999',
        }}/>
      )
    case 'rect':
      return (
        <div style={{
          ...style,
          background: el.fillColor || 'transparent',
          border: el.borderWidth > 0 ? `0.5px solid ${el.borderColor || '#ccc'}` : 'none',
        }}/>
      )
    default:
      return null
  }
}
