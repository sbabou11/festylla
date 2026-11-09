/**
 * components/dashboard/WidgetLibrary.jsx
 *
 * Bibliothèque de widgets (Style C — section chips horizontaux en haut).
 *
 * Affichée uniquement en mode édition. Liste tous les widgets disponibles
 * sous forme de chips scrollables. Marque ceux déjà installés (cliquables
 * mais désactivés visuellement).
 *
 * Props :
 *   - installedTypes : Array<string> — les types déjà installés
 *   - onAdd(type)    : callback à appeler quand on ajoute un widget
 *   - onClose()      : ferme la section (l'admin peut la replier)
 */
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { X, Plus, Check, Search } from 'lucide-react'
import { getAvailableWidgets } from './widgetRegistry'

// Normalise une chaîne pour la recherche : sans accents, lowercase.
// Permet de matcher "cachet" sur "Cachets", "depense" sur "Dépenses", etc.
const normalize = (s) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function WidgetLibrary({ installedTypes = [], onAdd, onClose }) {
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)

  // Focus auto sur le champ recherche à l'ouverture — l'admin peut taper
  // directement sans avoir à cliquer.
  useEffect(() => {
    // Délai léger pour laisser le DOM se monter avant focus
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const all = getAvailableWidgets()
  const installedSet = new Set(installedTypes)

  // Filtrer par recherche (label + description, sans accents)
  // puis trier : non installés d'abord, installés ensuite.
  const widgets = useMemo(() => {
    const q = normalize(search.trim())
    let filtered = all
    if (q) {
      filtered = all.filter(w => {
        const hay = normalize(`${w.label} ${w.description || ''}`)
        return hay.includes(q)
      })
    }
    return [
      ...filtered.filter(w => !installedSet.has(w.type)),
      ...filtered.filter(w => installedSet.has(w.type)),
    ]
  }, [all, installedTypes, search])

  return (
    <div style={{
      background: 'var(--bg, #fff)',
      border: '0.5px solid var(--border, #D3D1C7)',
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Ajouter un widget
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer la bibliothèque"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted, #888)', padding: 4,
              display: 'inline-flex', alignItems: 'center',
            }}>
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Zone de recherche */}
      <div style={{
        position: 'relative',
        marginBottom: 8,
      }}>
        <Search size={13} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--muted, #888)', pointerEvents: 'none',
        }}/>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un widget…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '6px 30px 6px 30px',
            background: 'var(--bg2, #F8F8F5)',
            border: '0.5px solid var(--border, #D3D1C7)',
            borderRadius: 6,
            fontSize: 12, color: 'var(--text, #1E1E1E)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {search && (
          <button
            onClick={() => {
              setSearch('')
              searchRef.current?.focus()
            }}
            aria-label="Effacer la recherche"
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted, #888)', padding: 4,
              display: 'inline-flex', alignItems: 'center',
            }}>
            <X size={12}/>
          </button>
        )}
      </div>

      {/* Chips horizontaux scrollables (ou message vide si aucun résultat) */}
      {widgets.length === 0 ? (
        <div style={{
          padding: '12px 4px', fontSize: 11,
          color: 'var(--muted, #888)', fontStyle: 'italic',
          textAlign: 'center',
        }}>
          Aucun widget ne correspond à « {search} »
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2,
          scrollbarWidth: 'thin',
        }}>
          {widgets.map(w => {
            const installed = installedSet.has(w.type)
            const Icon = w.icon
            return (
              <button
                key={w.type}
                onClick={() => !installed && onAdd && onAdd(w.type)}
                disabled={installed}
                title={installed ? 'Déjà installé' : `Ajouter : ${w.description}`}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px 6px 8px',
                  background: installed ? 'var(--bg2, #F1EFE8)' : 'var(--bg, #fff)',
                  border: `0.5px solid ${installed ? 'var(--border2, #B4B2A9)' : 'var(--border, #D3D1C7)'}`,
                  borderRadius: 18,
                  color: installed ? 'var(--muted, #888)' : 'var(--text, #1E1E1E)',
                  opacity: installed ? 0.55 : 1,
                  fontSize: 12, fontWeight: 500,
                  cursor: installed ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: installed ? 'transparent' : (w.iconBg || 'var(--bg2)'),
                  color: installed ? 'var(--muted, #888)' : (w.iconColor || 'var(--text)'),
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {installed ? <Check size={12}/> : (Icon ? <Icon size={12}/> : <Plus size={12}/>)}
                </span>
                {w.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
