/**
 * ui/CodeInput.jsx — code court en cases (poste bénévole, retrait, PIN)
 * <CodeInput length={4} value={code} onChange={setCode} onComplete={check} status="error" />
 * Le focus avance seul, Retour arrière recule, le collage remplit toutes les cases.
 * status : null | 'ok' | 'error' (secousse + bordure brique)
 */
import React, { useEffect, useRef } from 'react'
import clsx from 'clsx'
import s from './CodeInput.module.css'

const clean = (v, numeric) => String(v || '').toUpperCase().replace(numeric ? /[^0-9]/g : /[^A-Z0-9]/g, '')

export default function CodeInput({
  length = 4, value = '', onChange, onComplete, status = null, numeric = false,
  mask = false, autoFocus = false, disabled = false, label = 'Code', className,
}) {
  const refs = useRef([])
  const chars = clean(value, numeric).slice(0, length).split('')

  useEffect(() => { if (autoFocus) refs.current[Math.min(chars.length, length - 1)]?.focus() }, [autoFocus])

  const emit = (next) => {
    const v = next.join('').slice(0, length)
    onChange?.(v)
    if (v.length === length) onComplete?.(v)
  }

  const onInput = (i, raw) => {
    const typed = clean(raw, numeric)
    if (!typed) return
    const next = [...chars]
    while (next.length < i) next.push('')
    // Plusieurs caractères d'un coup (saisie auto, collage mobile) : on remplit à partir de i
    typed.split('').forEach((c, k) => { if (i + k < length) next[i + k] = c })
    emit(next)
    refs.current[Math.min(i + typed.length, length - 1)]?.focus()
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (chars[i]) emit(chars.slice(0, i))
      else if (i > 0) { emit(chars.slice(0, i - 1)); refs.current[i - 1]?.focus() }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
  }

  const onPaste = (e) => {
    const t = clean(e.clipboardData.getData('text'), numeric).slice(0, length)
    if (!t) return
    e.preventDefault()
    emit(t.split(''))
    refs.current[Math.min(t.length, length - 1)]?.focus()
  }

  return (
    <div role="group" aria-label={label} className={clsx(s.code, status === 'ok' && s.ok, status === 'error' && s.error, className)}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          className={s.cell}
          value={chars[i] || ''}
          // La case contient déjà un caractère : on garde le dernier tapé
          onChange={e => onInput(i, chars[i] ? e.target.value.replace(chars[i], '') || e.target.value : e.target.value)}
          onKeyDown={e => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={e => e.target.select()}
          inputMode={numeric ? 'numeric' : 'text'}
          type={mask ? 'password' : 'text'}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled}
          aria-label={`${label}, caractère ${i + 1} sur ${length}`}
        />
      ))}
    </div>
  )
}
