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
 * identification rapide, pas un aperçu fidèle. La feuille reste blanche
 * (elle représente le papier, y compris en thème sombre). Seules les
 * positions et couleurs propres au template restent en style calculé.
 */

import React from 'react'
import { PAGE_A4 } from '../../utils/factureTemplate'
import s from './expo.module.css'

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
    <span className={s.sheet} style={{ width, height: heightPx }} aria-hidden="true">
      {elements.map((el, i) => (
        <PreviewElement key={el.id || i} el={el} scale={scale}/>
      ))}
      {/* Si template vide : indication */}
      {elements.length === 0 && <span className={s.sheetEmpty}>(vide)</span>}
    </span>
  )
}

/**
 * Rendu simplifié d'un élément en silhouette grise/colorée selon son type.
 * Pas de texte réel : on ne cherche pas à reproduire le contenu, juste sa
 * position et son emprise visuelle.
 */
function PreviewElement({ el, scale }) {
  const box = {
    left:   Math.max(0, el.x) * scale,
    top:    Math.max(0, el.y) * scale,
    width:  Math.max(1, el.w) * scale,
    height: Math.max(0.5, el.h) * scale,
  }

  switch (el.type) {
    case 'text':
    case 'field':
    case 'paragraph':
      // Silhouette de texte
      return <span className={`${s.pe} ${s.peText}`} style={box}/>
    case 'image':
      return (
        <span className={`${s.pe} ${s.peImage}`}
          style={el.src ? { ...box, background: `url(${el.src}) center/contain no-repeat` } : box}/>
      )
    case 'table':
      // Bandes horizontales pour suggérer un tableau
      return <span className={`${s.pe} ${s.peTable}`} style={box}/>
    case 'line':
      return <span className={s.pe} style={{ ...box, background: el.color || '#999' }}/>
    case 'rect':
      return (
        <span className={s.pe} style={{
          ...box,
          background: el.fillColor || 'transparent',
          border: el.borderWidth > 0 ? `0.5px solid ${el.borderColor || '#ccc'}` : 'none',
        }}/>
      )
    default:
      return null
  }
}
