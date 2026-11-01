/**
 * pages/admin/benevoles/CarteBenevole.jsx — carte dépliable d'un bénévole
 * En-tête : initiales, poste, compteurs compacts. Détail : QR, jauges, historique, actions.
 */
import React, { useState } from 'react'
import clsx from 'clsx'
import { Trash2, Pencil, AlertTriangle, ChevronDown, FileDown, RotateCcw, Check } from 'lucide-react'
import QrCode from '../../../components/QrCode'
import { Button, Badge } from '../../../ui'
import { JOURS, CRENEAUX, ITEM_CFG, countCreneaux } from './constants'
import s from './benevoles.module.css'

// ── Jauge de consommation ──────────────────────────────────────────
const Jauge = ({ item, label, consomme, total, Icon }) => {
  const pct     = total > 0 ? Math.min(consomme / total, 1) : 0
  const restant = Math.max(0, total - consomme)
  const depasse = consomme > total
  return (
    <div className={clsx(s.gauge, s[`t_${item}`], depasse && s.over)}>
      <div className={s.gaugeHead}>
        {Icon && <Icon size={13} aria-hidden="true"/>}
        <span>{label}</span>
      </div>
      <div className={s.gaugeTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={consomme}>
        <div className={s.gaugeFill} style={{ width: `${pct*100}%` }}/>
      </div>
      <div className={s.gaugeValue}>
        {consomme}/{total}
        {depasse && <AlertTriangle size={12} aria-hidden="true"/>}
      </div>
      <div className={s.gaugeSub}>{restant > 0 ? `${restant} restant${restant>1?'s':''}` : depasse ? 'Dépassé !' : 'Terminé'}</div>
    </div>
  )
}

export default function CarteBenevole({ b, onEdit, onDelete, onConsommer, onReset, onGeneratePDF, currentEventId }) {
  const [open, setOpen]   = useState(false)
  const conso  = b.consommation || {}
  const droits = b.droits || {}
  const hasAbus = Object.keys(droits).some(k => (conso[k]||0) > (droits[k]||0))
  const nbCreneaux = countCreneaux(b.creneaux)
  const detailId = `benev-detail-${b.id}`

  return (
    <article className={clsx(s.benev, hasAbus && s.benevAbus)}>

      {/* En-tête (déplie le détail) */}
      <button type="button" className={s.benevHead} aria-expanded={open} aria-controls={detailId}
        onClick={() => setOpen(o => !o)}>

        {/* Avatar initiales */}
        <span className={s.avatar} aria-hidden="true">
          {b.prenom?.[0]}{b.nom?.[0]}
          {hasAbus && <span className={s.avatarAlert}><AlertTriangle size={10}/></span>}
        </span>

        <span className={s.benevInfo}>
          <span className={s.benevName}>
            {b.prenom} {b.nom}
            {hasAbus && <Badge tone="danger">Dépassement</Badge>}
          </span>
          <span className={s.benevMeta}>{b.poste || 'Bénévole'} · {nbCreneaux} créneau{nbCreneaux>1?'x':''}</span>
        </span>

        {/* Compteurs compacts */}
        <span className={s.mini}>
          {Object.entries(ITEM_CFG).map(([k, cfg]) => {
            const c = conso[k]||0, d = droits[k]||0
            const Icon = cfg.icon
            return (
              <span key={k} title={`${cfg.label}: ${c}/${d}`} className={clsx(s.miniItem, s[`t_${k}`], c > d && s.over)}>
                <Icon size={13} aria-hidden="true"/>
                <span className={s.miniVal}><span className={s.sr}>{cfg.label} </span>{c}/{d}</span>
              </span>
            )
          })}
        </span>

        <ChevronDown size={16} aria-hidden="true" className={clsx(s.chevron, open && s.chevronOpen)}/>
      </button>

      {/* Détail déplié */}
      {open && (
        <div id={detailId} className={s.benevBody}>

          {/* QR code */}
          <div className={s.qrRow}>
            <div className={s.qrBox}>
              <QrCode value={`${window.location.origin}/benevole?id=${b.id}${currentEventId?'&ev='+currentEventId:''}`} size={100}/>
              <div className={s.mono}>BNV-{b.id?.slice(-6)}</div>
            </div>
            <div className={s.grow}>
              <div className={s.sectionLabel}>Créneaux validés</div>
              <div className={s.chips}>
                {JOURS.map(j => CRENEAUX.map(c => b.creneaux?.[j]?.[c] && (
                  <Badge key={j+c} tone="brand">{j} {c}</Badge>
                )))}
                {nbCreneaux === 0 && <span className={s.muted}>Aucun créneau</span>}
              </div>
            </div>
          </div>

          {/* Jauges détaillées */}
          <div className={s.gauges}>
            {Object.entries(ITEM_CFG).map(([k, cfg]) => (
              <Jauge key={k} item={k} label={cfg.label} consomme={conso[k]||0} total={droits[k]||0} Icon={cfg.icon}/>
            ))}
          </div>

          {/* Historique consommation */}
          {(b.historique||[]).length > 0 && (
            <div>
              <div className={s.sectionLabel}>Historique</div>
              <ul className={s.history}>
                {[...(b.historique||[])].reverse().map((h, i) => (
                  <li key={i} className={s.historyRow}>
                    <span>{h.action}</span>
                    <span className={s.muted}>{h.date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions enregistrement consommation */}
          <div>
            <div className={s.sectionLabel}>Enregistrer une consommation</div>
            <div className={s.consoBtns}>
              {Object.entries(ITEM_CFG).map(([k, cfg]) => {
                const c = conso[k]||0, d = droits[k]||0
                const restant = d - c
                const Icon = cfg.icon
                return (
                  <button key={k} type="button" onClick={() => onConsommer(b, k)} disabled={restant <= 0}
                    className={clsx(s.consoBtn, s[`t_${k}`])}>
                    <Icon size={15} aria-hidden="true"/>
                    {cfg.label} {restant > 0 ? `(${restant})` : <Check size={14} aria-label="épuisé"/>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions admin */}
          <div className={s.adminActions}>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(b)}>Modifier</Button>
            <Button variant="secondary" size="sm" icon={FileDown} onClick={() => onGeneratePDF(b)}>PDF</Button>
            <Button variant="ghost" size="sm" icon={RotateCcw} className={s.warnText}
              title="Remettre les compteurs à zéro" onClick={() => onReset(b)}>Réinitialiser compta</Button>
            <Button variant="danger" size="sm" icon={Trash2} iconOnly className={s.pushRight}
              aria-label={`Supprimer ${b.prenom} ${b.nom}`} onClick={() => onDelete(b)}/>
          </div>
        </div>
      )}
    </article>
  )
}
