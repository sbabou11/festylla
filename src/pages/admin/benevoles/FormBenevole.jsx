/**
 * pages/admin/benevoles/FormBenevole.jsx — création / modification d'un bénévole
 * Les droits repas/boisson/eau sont calculés depuis les créneaux cochés.
 */
import React, { useRef, useState } from 'react'
import clsx from 'clsx'
import { Save, X, Check } from 'lucide-react'
import { Button, Field, focusFirstInvalid } from '../../../ui'
import { JOURS, CRENEAUX, ITEM_CFG, calcDroits, countCreneaux } from './constants'
import s from './benevoles.module.css'

export default function FormBenevole({ initial, onSave, onCancel }) {
  const [nom, setNom]           = useState(initial?.nom || '')
  const [prenom, setPrenom]     = useState(initial?.prenom || '')
  const [poste, setPoste]       = useState(initial?.poste || '')
  const [creneaux, setCreneaux] = useState(initial?.creneaux || {})
  const [saving, setSaving]     = useState(false)
  const [tried, setTried]       = useState(false)
  const formRef = useRef(null)

  const toggleCreneau = (jour, creneau) => {
    setCreneaux(prev => ({
      ...prev,
      [jour]: { ...(prev[jour]||{}), [creneau]: !(prev[jour]?.[creneau]) }
    }))
  }

  const droits = calcDroits(creneaux)
  const nbCreneaux = countCreneaux(creneaux)

  const handleSave = async () => {
    if (!nom.trim() || !prenom.trim()) { setTried(true); focusFirstInvalid(formRef.current); return }
    setSaving(true)
    try {
      await onSave({ nom: nom.trim(), prenom: prenom.trim(), poste: poste.trim(), creneaux, droits })
    } finally { setSaving(false) }
  }

  return (
    <section ref={formRef} className={s.formCard} aria-label={initial ? 'Modifier le bénévole' : 'Nouveau bénévole'}>
      <h2 className={s.formTitle}>{initial ? 'Modifier le bénévole' : 'Nouveau bénévole'}</h2>

      {/* Identité */}
      <div className={s.grid2}>
        <Field label={<span className={s.label}>Prénom</span>}
          error={prenom.trim() ? null : 'Indique le prénom'} valid={!!prenom.trim()} showError={tried}>
          <input id="benev-prenom" value={prenom} onChange={e=>setPrenom(e.target.value)} placeholder="Marie"/>
        </Field>
        <Field label={<span className={s.label}>Nom</span>}
          error={nom.trim() ? null : 'Indique le nom'} valid={!!nom.trim()} showError={tried}>
          <input id="benev-nom" value={nom} onChange={e=>setNom(e.target.value)} placeholder="Dupont"/>
        </Field>
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor="benev-poste">Poste / Rôle</label>
        <input id="benev-poste" className={s.input} value={poste} onChange={e=>setPoste(e.target.value)}
          placeholder="ex : Sécurité, Billetterie, Bar…"/>
      </div>

      {/* Créneaux de présence */}
      <fieldset className={s.slots}>
        <legend className={s.sectionTitle}>Créneaux de présence</legend>
        <div className={s.slotGrid} role="table" aria-label="Créneaux de présence">
          <div className={s.slotRow} role="row">
            <span role="columnheader"/>
            {CRENEAUX.map(c => <span key={c} role="columnheader" className={s.slotHead}>{c}</span>)}
          </div>
          {JOURS.map(jour => (
            <div key={jour} className={s.slotRow} role="row">
              <span role="rowheader" className={s.slotDay}>{jour}</span>
              {CRENEAUX.map(c => {
                const checked = !!creneaux[jour]?.[c]
                return (
                  <span key={c} role="cell" className={s.slotCell}>
                    <button type="button" aria-pressed={checked} aria-label={`${jour} ${c}`}
                      className={clsx(s.slotBtn, checked && s.slotOn)} onClick={() => toggleCreneau(jour, c)}>
                      {checked && <Check size={18} aria-hidden="true"/>}
                    </button>
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </fieldset>

      {/* Récapitulatif droits */}
      {nbCreneaux > 0 && (
        <div className={s.recap}>
          <div className={s.recapTitle}>
            Droits générés automatiquement ({nbCreneaux} créneau{nbCreneaux>1?'x':''}) :
          </div>
          {Object.entries(droits).map(([k, v]) => {
            const cfg = ITEM_CFG[k]
            const Icon = cfg.icon
            return (
              <span key={k} className={clsx(s.recapItem, s[`t_${k}`])}>
                <Icon size={14} aria-hidden="true"/> {v} {cfg.label}{v>1?'s':''}
              </span>
            )
          })}
        </div>
      )}

      <div className={s.formActions}>
        <Button icon={Save} onClick={handleSave} loading={saving}>
          {saving ? 'Sauvegarde…' : initial ? 'Enregistrer' : 'Créer le bénévole'}
        </Button>
        <Button variant="secondary" icon={X} onClick={onCancel}>Annuler</Button>
      </div>
    </section>
  )
}
