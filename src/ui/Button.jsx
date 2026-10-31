/**
 * ui/Button.jsx — bouton du design system
 * variant : primary (teal) | coral | secondary | danger | ghost
 * size    : sm | md | lg
 */
import React from 'react'
import clsx from 'clsx'
import s from './Button.module.css'

const Button = React.forwardRef(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconOnly = false, loading = false, block = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(s.btn, s[variant], s[size], iconOnly && s.iconOnly, block && s.block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={s.spinner} aria-hidden="true" /> : Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />}
      {!iconOnly && children}
    </button>
  )
})

export default Button
