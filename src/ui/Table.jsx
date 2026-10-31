/**
 * ui/Table.jsx — tableau défilant horizontalement sur petit écran
 * columns : [{ key, label, align?: 'right', render?: (row) => node }]
 * rows    : tableau d'objets ; rowKey : clé unique (défaut 'id')
 */
import React from 'react'
import clsx from 'clsx'
import Empty from './Empty'
import s from './Table.module.css'

export default function Table({ columns = [], rows = [], rowKey = 'id', onRowClick, empty = 'Aucune donnée', className }) {
  if (rows.length === 0) return <Empty title={empty} />
  return (
    <div className={clsx(s.wrap, className)}>
      <table className={s.table}>
        <thead>
          <tr>
            {columns.map(c => <th key={c.key} className={c.align === 'right' ? s.right : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} className={onRowClick ? s.clickable : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map(c => (
                <td key={c.key} className={c.align === 'right' ? s.right : undefined}>
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
