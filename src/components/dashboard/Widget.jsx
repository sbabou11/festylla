/**
 * components/dashboard/Widget.jsx
 *
 * Wrapper individuel d'un widget dans la grille. Gère :
 *   - Bordure dashed en mode édition
 *   - Bouton "X" pour supprimer
 *   - Le handle de drag (react-grid-layout gère le drag globalement,
 *     mais on peut limiter au handle via className "drag-handle")
 *   - Le rendu du contenu via le registry
 *
 * Props :
 *   - id        : identifiant widget
 *   - type      : type de widget (clé du registry)
 *   - editMode  : booléen
 *   - onRemove  : callback (id) => void
 */
import React, { Suspense } from 'react'
import { X, GripVertical } from 'lucide-react'
import { getWidgetDef } from './widgetRegistry'

export default function Widget({ id, type, editMode, onRemove }) {
  const def = getWidgetDef(type)
  if (!def) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'var(--bg2)', border: '0.5px solid var(--border)',
        borderRadius: 12, padding: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--muted)', fontSize: 11,
      }}>
        Widget inconnu : {type}
      </div>
    )
  }

  const Comp = def.Component

  return (
    <div
      className={editMode ? 'yc-widget-edit' : ''}
      style={{
        position: 'relative', width: '100%', height: '100%',
        outline: editMode ? '1.5px dashed var(--muted, #888)' : 'none',
        outlineOffset: -2,
        borderRadius: 12,
      }}>
      {/* Le contenu prend toute la place */}
      <Suspense fallback={<div style={{ padding: 12, fontSize: 11, color: 'var(--muted)' }}>Chargement…</div>}>
        <Comp id={id}/>
      </Suspense>

      {/* Handles édition : visible seulement en mode édition.
          - Drag handle = zone DÉDIÉE pour le drag (className 'yc-drag-handle')
          - Bouton supprimer = className 'yc-no-drag' pour éviter capture par RGL
            (RGL est configuré avec draggableCancel='.yc-no-drag') */}
      {editMode && (
        <>
          {/* Drag handle (zone cliquable pour déplacer)
              Plus gros sur mobile/tablette via @media (pointer: coarse) */}
          <style>{`
            .yc-drag-handle { width: 26px; height: 26px; }
            .yc-no-drag { width: 26px; height: 26px; }
            @media (pointer: coarse) {
              .yc-drag-handle { width: 32px; height: 32px; }
              .yc-no-drag { width: 32px; height: 32px; }
            }
          `}</style>
          <div
            className="yc-drag-handle"
            style={{
              position: 'absolute', top: 6, left: 6,
              background: 'rgba(255,255,255,0.95)', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted, #888)',
              cursor: 'move',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              touchAction: 'none',
              zIndex: 5,
            }}
            title="Déplacer ce widget">
            <GripVertical size={14}/>
          </div>
          {/* Bouton supprimer — classe yc-no-drag pour que RGL ignore les events */}
          <button
            type="button"
            className="yc-no-drag"
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm('Supprimer ce widget ?')) {
                onRemove && onRemove(id)
              }
            }}
            aria-label="Supprimer ce widget"
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(255,255,255,0.95)', borderRadius: 6,
              border: 'none', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--red, #A32D2D)', cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              zIndex: 10,
              touchAction: 'none',
            }}>
            <X size={15}/>
          </button>
        </>
      )}
    </div>
  )
}
