/**
 * ui/Field.jsx — champ de formulaire validé quand on le quitte
 * <Field label="Nom" error={nom.trim() ? null : 'Indique un nom'} valid={!!nom.trim()} showError={tried}>
 *   <input value={nom} onChange={…} />
 * </Field>
 * L'erreur s'affiche à la sortie du champ (ou dès que showError est vrai, après un clic sur
 * « Valider »), puis disparaît en direct dès que la saisie est corrigée.
 * Au clic sur « Valider » : setTried(true) puis focusFirstInvalid(formRef.current).
 * loading : vérification en cours (roue dans le champ, saisie bloquée). Six états : défaut, focus,
 * erreur, succès, désactivé (input disabled), chargement.
 */
import React, { cloneElement, useId, useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import s from './Field.module.css'

export function focusFirstInvalid(root = document) {
  // Après le rendu qui vient de poser les erreurs
  requestAnimationFrame(() => root?.querySelector?.('[aria-invalid="true"]')?.focus())
}

export default function Field({ label, hint, error, valid = false, showError = false, loading = false, touched = false, className, children }) {
  const id = useId()
  const [visited, setLeft] = useState(false)
  const left = visited || touched // touched : état « déjà quitté » forcé (vitrine /ui)
  const invalid = !!error && (left || showError)
  const ok = !error && valid && left && !loading
  const input = React.Children.only(children)

  return (
    <div className={clsx(s.field, invalid && s.invalid, ok && s.ok, className)} onBlur={() => setLeft(true)}>
      {label && <label className={s.label} htmlFor={input.props.id || id}>{label}</label>}
      <div className={s.control}>
        {cloneElement(input, {
          id: input.props.id || id,
          'aria-invalid': invalid || undefined,
          'aria-busy': loading || undefined,
          readOnly: loading || input.props.readOnly,
          'aria-describedby': invalid ? `${id}-err` : hint ? `${id}-hint` : undefined,
        })}
        {ok && <Check size={16} strokeWidth={3} className={s.check} aria-hidden="true" />}
        {loading && <span className={s.spin} aria-hidden="true" />}
      </div>
      {invalid
        ? <p id={`${id}-err`} className={s.error}><AlertCircle size={13} aria-hidden="true" /> {error}</p>
        : hint && <p id={`${id}-hint`} className={s.hint}>{hint}</p>}
    </div>
  )
}
