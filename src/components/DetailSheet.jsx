/**
 * components/DetailSheet.jsx — gabarit commun des fenêtres de détail (23/11/2026, maquette validée)
 *
 * « Toutes les cartes de l'appli doivent être cliquables, ouvrant une fenêtre partant du bas, montrant
 * le détail complet. » Feuille du bas (fenêtre sur grand écran, via ui/Sheet), en lecture seule :
 *   icône colorée + statut, grande valeur, sous-titre, rubriques clé/valeur ou contenu libre,
 *   puis les actions qui existent déjà sur l'écran (Annuler, Acquitter, Pointer…).
 *
 * Props :
 *   open, onClose
 *   title     titre de la fenêtre (aussi son nom pour les lecteurs d'écran)
 *   icon      composant lucide-react ; color : fond de la pastille (sinon neutre)
 *   status    { label, tone }  tone : success | warning | danger | brand | neutral
 *   value     grande valeur (montant, horaire…) ; sub : ligne sous la valeur
 *   sections  [{ label, rows: [[clé, valeur], …] }] ou [{ label, content: <noeud> }]
 *   actions   noeud(s) affichés en bas (boutons existants de l'écran)
 *
 * Règle (audit du 23/11/2026) : n'y mettre que des données que le rôle voit déjà.
 */
import React from 'react'
import { Sheet, Badge } from '../ui'
import s from './DetailSheet.module.css'

export default function DetailSheet({ open, onClose, title, icon: Icon, color, status, value, sub, sections = [], actions = null, children }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={s.wrap}>
        {(Icon || status) && (
          <div className={s.head}>
            {Icon && <span className={s.ic} style={color ? { background: color, color: '#FFFFFF' } : undefined} aria-hidden="true"><Icon size={22} /></span>}
            {status && <Badge tone={status.tone || 'neutral'}>{status.label}</Badge>}
          </div>
        )}
        {value != null && value !== '' && <div className={s.value}>{value}</div>}
        {sub && <div className={s.sub}>{sub}</div>}
        {sections.filter(Boolean).map((sec, i) => (
          <section key={i} className={s.section}>
            {sec.label && <h3 className={s.lab}>{sec.label}</h3>}
            {sec.rows
              ? <dl className={s.kv}>{sec.rows.filter(r => r && r[1] != null && r[1] !== '').map(([k, v], j) => <div key={j}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              : sec.content}
          </section>
        ))}
        {children}
        {actions && <div className={s.acts}>{actions}</div>}
      </div>
    </Sheet>
  )
}
