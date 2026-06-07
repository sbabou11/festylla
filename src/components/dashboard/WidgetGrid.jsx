/**
 * components/dashboard/WidgetGrid.jsx
 *
 * Orchestrateur de la grille de widgets. Wrappe react-grid-layout (Responsive).
 *
 * Props :
 *   - layout     : Array<{ i, x, y, w, h }> — positions et tailles (en colonnes desktop = 12)
 *   - widgets    : Array<{ id, type }>      — widgets installés
 *   - editMode   : boolean — affichage des handles + activation drag/resize
 *   - onLayoutChange(newLayout) — appelé quand l'utilisateur déplace/redimensionne
 *   - onRemoveWidget(id)        — appelé quand l'utilisateur clique sur X
 *
 * Responsive :
 *   - lg (≥996px)  : 12 colonnes — desktop
 *   - md (≥768px)  : 8 colonnes  — tablette paysage
 *   - sm (≥520px)  : 4 colonnes  — tablette portrait / mobile large
 *   - xs (<520px)  : 2 colonnes  — mobile portrait
 *   Au-delà de lg, le layout sauvegardé en Firestore est utilisé. Pour
 *   les autres breakpoints, react-grid-layout réorganise automatiquement
 *   en gardant l'ordre vertical du layout lg.
 */
import React, { useMemo } from 'react'
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout'
import Widget from './Widget'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const BREAKPOINTS = { lg: 996, md: 768, sm: 520, xs: 0 }
const COLS        = { lg: 12,  md: 8,   sm: 4,   xs: 2 }

export default function WidgetGrid({
  layout, widgets, editMode,
  onLayoutChange, onRemoveWidget,
  width = 1200,
}) {
  // Pour ResponsiveGridLayout, on passe layouts.lg = notre layout.
  // RGL calcule automatiquement les autres breakpoints.
  const layouts = useMemo(() => ({ lg: layout }), [layout])

  // Handler : ResponsiveGridLayout passe (currentLayout, allLayouts)
  // On ne persiste QUE le layout 'lg' (référence) pour ne pas écraser
  // les autres breakpoints — RGL les recalculera.
  const handleLayoutChange = (currentLayout, allLayouts) => {
    if (allLayouts && allLayouts.lg) {
      onLayoutChange && onLayoutChange(allLayouts.lg)
    } else {
      // Fallback : on a au moins le layout courant
      onLayoutChange && onLayoutChange(currentLayout)
    }
  }

  return (
    <>
      {/* Styles globaux pour la grille (placeholder pendant drag, resize handle) */}
      <style>{`
        .yllacash-grid .react-grid-placeholder {
          background: rgba(15, 110, 86, 0.12) !important;
          border: 1.5px dashed var(--brand, #0F6E56) !important;
          border-radius: 12px !important;
          opacity: 1 !important;
          transition: all 0.15s ease;
        }
        .yllacash-grid .react-resizable-handle {
          background-image: none !important;
          opacity: ${editMode ? 1 : 0};
          width: 18px;
          height: 18px;
        }
        .yllacash-grid .react-resizable-handle::after {
          border-right-color: var(--muted, #888) !important;
          border-bottom-color: var(--muted, #888) !important;
          width: 7px;
          height: 7px;
        }
        .yllacash-grid .react-grid-item.cssTransforms {
          transition-duration: 200ms;
        }
        .yllacash-grid .react-grid-item.cssTransforms.react-draggable-dragging {
          transition: none;
          z-index: 50;
        }
        /* Animation à l'apparition d'un nouveau widget */
        @keyframes yc-widget-in {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .yllacash-grid .react-grid-item {
          animation: yc-widget-in 0.18s ease;
        }
      `}</style>
      <ResponsiveGridLayout
        className="yllacash-grid"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={64}
        width={width}
        margin={[12, 12]}
        isDraggable={editMode}
        isResizable={editMode}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".yc-drag-handle"
        draggableCancel=".yc-no-drag"
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms={true}
      >
        {widgets.map(w => (
          <div key={w.id}>
            <Widget
              id={w.id}
              type={w.type}
              editMode={editMode}
              onRemove={onRemoveWidget}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
    </>
  )
}
