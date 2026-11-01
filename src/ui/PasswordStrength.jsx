/**
 * ui/PasswordStrength.jsx — jauge de force d'un mot de passe en cours de saisie
 * Indicatif seulement : la règle bloquante reste celle de l'écran (6 caractères minimum).
 */
import React from 'react'
import s from './PasswordStrength.module.css'

const LEVELS = [
  { label: 'Trop court', tone: 'var(--red)' },
  { label: 'Faible',     tone: 'var(--red)' },
  { label: 'Moyen',      tone: 'var(--gold)' },
  { label: 'Bon',        tone: 'var(--green)' },
  { label: 'Solide',     tone: 'var(--green)' },
]

export function passwordScore(pwd = '') {
  if (pwd.length < 6) return 0
  if (/^(.)\1+$/.test(pwd) || /^(123456|azerty|password|motdepasse)/i.test(pwd)) return 1
  let score = 1
  if (pwd.length >= 10) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  return Math.min(4, score)
}

export default function PasswordStrength({ value }) {
  if (!value) return null
  const score = passwordScore(value)
  const level = LEVELS[score]
  return (
    <div className={s.wrap} style={{ '--pw-tone': level.tone }} aria-live="polite">
      <div className={s.bars} aria-hidden="true">
        {[1, 2, 3, 4].map(i => <i key={i} className={i <= score ? s.on : undefined} />)}
      </div>
      <span className={s.label}>{level.label}</span>
    </div>
  )
}
