/**
 * components/TransferList.jsx
 *
 * Composant générique de sélection à 2 colonnes (disponibles / sélectionnés)
 * avec recherche dans chaque colonne et flèches de transfert. Utilisé pour la
 * configuration du rapport de clôture (Lot Custom A — sélection précise).
 *
 * Props :
 *   - items: [{ id, label, meta? }]   liste complète des items disponibles
 *   - selectedIds: [id]               liste des IDs sélectionnés (controlled)
 *   - onChange: (newSelectedIds) => void
 *   - placeholder: string             texte du champ de recherche
 *   - emptyMessage: string            message si aucune sélection / dispo
 *
 * Sémantique :
 *   - selectedIds vide [] = aucun item sélectionné (filtre actif = rien)
 *   - selectedIds null    = pas de filtre (tous les items inclus, état défaut)
 *
 * Le composant ne gère pas la distinction null/[]  pour rester simple ; le parent
 * doit gérer ça via un bouton "Réinitialiser le filtre" séparé.
 */
import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

export default function TransferList({
  items = [],
  selectedIds = [],
  onChange,
  placeholder = 'Rechercher…',
  emptyAvailableMessage = 'Aucun élément disponible.',
  emptySelectedMessage = 'Aucune sélection.',
}) {
  const [searchAvail, setSearchAvail] = useState('')
  const [searchSel,   setSearchSel]   = useState('')
  // Item cliqué dans chaque colonne (un seul à la fois pour simplifier)
  const [highlightAvail, setHighlightAvail] = useState(null)
  const [highlightSel,   setHighlightSel]   = useState(null)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Sépare items en deux groupes selon selectedSet
  const available = useMemo(
    () => items.filter(it => !selectedSet.has(it.id)),
    [items, selectedSet]
  )
  const selected = useMemo(
    // Préserve l'ordre des selectedIds (pas l'ordre original des items)
    () => selectedIds.map(id => items.find(it => it.id === id)).filter(Boolean),
    [items, selectedIds]
  )

  // Applique le filtre de recherche
  const filterFn = (q) => (it) => {
    if (!q) return true
    const needle = q.toLowerCase().trim()
    return (it.label || '').toLowerCase().includes(needle)
  }
  const filteredAvailable = available.filter(filterFn(searchAvail))
  const filteredSelected  = selected.filter(filterFn(searchSel))

  // Actions
  const addOne = () => {
    if (!highlightAvail) return
    onChange([...selectedIds, highlightAvail])
    setHighlightAvail(null)
  }
  const removeOne = () => {
    if (!highlightSel) return
    onChange(selectedIds.filter(id => id !== highlightSel))
    setHighlightSel(null)
  }
  const addAll = () => {
    // On ajoute uniquement les items visibles dans la colonne disponibles
    // (utile si l'utilisateur a filtré par recherche)
    const newIds = filteredAvailable.map(it => it.id)
    onChange([...selectedIds, ...newIds])
    setHighlightAvail(null)
  }
  const removeAll = () => {
    // Idem : si recherche active dans la colonne sélectionnés, on retire
    // seulement les visibles ; sinon on vide complètement.
    if (searchSel) {
      const visibleIds = new Set(filteredSelected.map(it => it.id))
      onChange(selectedIds.filter(id => !visibleIds.has(id)))
    } else {
      onChange([])
    }
    setHighlightSel(null)
  }

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        gap: 8, alignItems: 'stretch',
      }}>
        {/* Colonne Disponibles */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 200, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: 'var(--muted)',
            padding: '4px 4px 6px',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Disponibles ({available.length})</span>
            {filteredAvailable.length > 0 && (
              <button type="button" onClick={addAll}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--brand-dark)', fontSize: 10,
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>
                tout ajouter →
              </button>
            )}
          </div>
          {/* Barre de recherche */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <Search size={12} style={{
              position: 'absolute', left: 8, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--muted)',
              pointerEvents: 'none',
            }}/>
            <input type="text" placeholder={placeholder}
              value={searchAvail}
              onChange={e => setSearchAvail(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px 6px 26px', fontSize: 11,
                border: '0.5px solid var(--border)', borderRadius: 4,
                fontFamily: 'inherit', background: '#fff',
                boxSizing: 'border-box',
              }}/>
          </div>
          {/* Liste */}
          <div style={{
            flex: 1, background: '#fff',
            border: '0.5px solid var(--border)', borderRadius: 4,
            padding: 4, overflowY: 'auto', maxHeight: 220, minHeight: 120,
          }}>
            {filteredAvailable.length === 0 ? (
              <div style={{
                padding: '20px 8px', textAlign: 'center', fontSize: 11,
                color: 'var(--muted)', fontStyle: 'italic',
              }}>
                {available.length === 0 ? emptyAvailableMessage : 'Aucun résultat'}
              </div>
            ) : filteredAvailable.map(it => (
              <div key={it.id}
                onClick={() => setHighlightAvail(it.id)}
                onDoubleClick={() => {
                  onChange([...selectedIds, it.id])
                  setHighlightAvail(null)
                }}
                style={{
                  padding: '5px 8px', fontSize: 11, cursor: 'pointer',
                  borderRadius: 3,
                  background: highlightAvail === it.id ? 'var(--brand)' : 'transparent',
                  color: highlightAvail === it.id ? '#fff' : 'var(--text)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span title={it.label} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.label}
                </span>
                {it.meta && (
                  <span style={{
                    fontSize: 9, marginLeft: 6,
                    color: highlightAvail === it.id ? 'rgba(255,255,255,0.85)' : 'var(--muted)',
                    flexShrink: 0,
                  }}>{it.meta}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Boutons de transfert au centre */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 6, paddingTop: 20,
        }}>
          <button type="button" onClick={addOne} disabled={!highlightAvail}
            style={{
              width: 30, height: 28, padding: 0,
              background: highlightAvail ? 'var(--brand)' : 'var(--bg2)',
              color: highlightAvail ? '#fff' : 'var(--muted)',
              border: '0.5px solid var(--border)', borderRadius: 4,
              cursor: highlightAvail ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-label="Ajouter">
            <ChevronRight size={14}/>
          </button>
          <button type="button" onClick={removeOne} disabled={!highlightSel}
            style={{
              width: 30, height: 28, padding: 0,
              background: highlightSel ? 'var(--brand)' : 'var(--bg2)',
              color: highlightSel ? '#fff' : 'var(--muted)',
              border: '0.5px solid var(--border)', borderRadius: 4,
              cursor: highlightSel ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-label="Retirer">
            <ChevronLeft size={14}/>
          </button>
        </div>

        {/* Colonne Sélectionnés */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 200, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: 'var(--muted)',
            padding: '4px 4px 6px',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Sélectionnés ({selected.length})</span>
            {filteredSelected.length > 0 && (
              <button type="button" onClick={removeAll}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--red-dark)', fontSize: 10,
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>
                ← tout retirer
              </button>
            )}
          </div>
          {/* Barre de recherche */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <Search size={12} style={{
              position: 'absolute', left: 8, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--muted)',
              pointerEvents: 'none',
            }}/>
            <input type="text" placeholder={placeholder}
              value={searchSel}
              onChange={e => setSearchSel(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px 6px 26px', fontSize: 11,
                border: '0.5px solid var(--border)', borderRadius: 4,
                fontFamily: 'inherit', background: '#fff',
                boxSizing: 'border-box',
              }}/>
          </div>
          {/* Liste */}
          <div style={{
            flex: 1, background: '#fff',
            border: '0.5px solid var(--border)', borderRadius: 4,
            padding: 4, overflowY: 'auto', maxHeight: 220, minHeight: 120,
          }}>
            {filteredSelected.length === 0 ? (
              <div style={{
                padding: '20px 8px', textAlign: 'center', fontSize: 11,
                color: 'var(--muted)', fontStyle: 'italic',
              }}>
                {selected.length === 0 ? emptySelectedMessage : 'Aucun résultat'}
              </div>
            ) : filteredSelected.map(it => (
              <div key={it.id}
                onClick={() => setHighlightSel(it.id)}
                onDoubleClick={() => {
                  onChange(selectedIds.filter(id => id !== it.id))
                  setHighlightSel(null)
                }}
                style={{
                  padding: '5px 8px', fontSize: 11, cursor: 'pointer',
                  borderRadius: 3,
                  background: highlightSel === it.id ? 'var(--brand)' : 'transparent',
                  color: highlightSel === it.id ? '#fff' : 'var(--text)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span title={it.label} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.label}
                </span>
                {it.meta && (
                  <span style={{
                    fontSize: 9, marginLeft: 6,
                    color: highlightSel === it.id ? 'rgba(255,255,255,0.85)' : 'var(--muted)',
                    flexShrink: 0,
                  }}>{it.meta}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Aide */}
      <div style={{
        marginTop: 8, fontSize: 10, color: 'var(--muted)', lineHeight: 1.5,
      }}>
        Double-cliquez sur un élément pour le déplacer rapidement. Laissez vide pour inclure tous les éléments.
      </div>
    </div>
  )
}
