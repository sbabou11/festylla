/**
 * ui/Table.jsx — tableau qui devient une liste de cartes quand sa place est étroite
 * columns : [{ key, label, align?: 'right', render?: (row) => node, card?: 'title' | 'value' | 'hide' }]
 * rows    : tableau d'objets ; rowKey : clé unique (défaut 'id')
 * empty   : texte, ou un <Empty … /> complet avec icône et action
 * loading : affiche des lignes squelettes à la place des données
 * En carte (conteneur < 560 px) : la 1re colonne sert de titre, la 1re colonne alignée à droite
 * passe en haut à droite, les autres s'affichent « libellé · valeur ». `card` force ce rôle.
 */
import React from 'react'
import clsx from 'clsx'
import Empty from './Empty'
import Skeleton from './Skeleton'
import s from './Table.module.css'

export default function Table({ columns = [], rows = [], rowKey = 'id', onRowClick, empty = 'Aucune donnée', loading = false, skeletonRows = 5, className }) {
  if (!loading && rows.length === 0) return typeof empty === 'string' ? <Empty title={empty} /> : empty

  const visible = columns.filter(Boolean)
  const titleKey = (visible.find(c => c.card === 'title') || visible[0])?.key
  const valueKey = (visible.find(c => c.card === 'value') || visible.find(c => c.align === 'right' && c.key !== titleKey && c.card !== 'hide'))?.key
  const role = (c) => c.key === titleKey ? s.cTitle : c.key === valueKey ? s.cValue : c.card === 'hide' ? s.cHide : s.cField

  return (
    <div className={clsx(s.wrap, className)}>
      <table className={s.table} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {visible.map(c => <th key={c.key} className={c.align === 'right' ? s.right : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className={s.body}>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`sk${i}`}>
                  {visible.map(c => (
                    <td key={c.key} className={role(c)}><Skeleton height={12} width={c.key === titleKey ? '70%' : '50%'} /></td>
                  ))}
                </tr>
              ))
            : rows.map((r, i) => (
                <tr
                  key={r[rowKey] ?? i}
                  className={onRowClick ? s.clickable : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {visible.map(c => (
                    <td key={c.key} data-label={typeof c.label === 'string' ? c.label : undefined}
                      className={clsx(c.align === 'right' && s.right, role(c))}>
                      {c.render ? c.render(r) : r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}
