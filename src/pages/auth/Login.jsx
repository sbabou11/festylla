/**
 * pages/auth/Login.jsx — connexion staff
 * Carte en verre dépoli sur le dégradé signature (AuthShell).
 */
import React, { useState } from 'react'
import useAuthStore from '../../store/useAuthStore'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { Button } from '../../ui'
import AuthShell from './AuthShell'
import s from './auth.module.css'

export default function Login() {
  const { login, loginError, loginLoading, requestPasswordReset } = useAuthStore()
  const [username, setUsername] = useState('')
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // Réinitialisation de mot de passe (mot de passe oublié)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotId, setForgotId]     = useState('')
  const [forgotState, setForgotState] = useState('idle') // 'idle' | 'loading' | 'sent' | 'error'

  const doLogin = async (e) => {
    e.preventDefault()
    await login(username.trim(), pwd)
  }

  const closeForgot = () => { setForgotOpen(false); setForgotState('idle'); setForgotId('') }

  const sendForgot = async () => {
    setForgotState('loading')
    const r = await requestPasswordReset(forgotId)
    setForgotState(r.ok ? 'sent' : 'error')
  }

  return (
    <AuthShell>
      <form onSubmit={doLogin} className={s.card}>
        <h2 className={s.cardTitle}>Connexion staff</h2>

        <label className={s.field}>
          <span className={s.label}>Nom d'utilisateur</span>
          <input className={s.input} type="text" value={username} onChange={e => setUsername(e.target.value)} required
            placeholder="ex : sbabou" autoComplete="username" autoCapitalize="none" spellCheck={false} />
        </label>

        <label className={s.field}>
          <span className={s.label}>Mot de passe</span>
          <span className={s.inputWrap}>
            <input className={s.input} type={showPwd ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)} required
              placeholder="••••••••" autoComplete="current-password" />
            <button type="button" className={s.eye} onClick={() => setShowPwd(v => !v)}
              aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        {loginError && <div className={s.error} role="alert">{loginError}</div>}

        <Button type="submit" size="lg" block icon={LogIn} loading={loginLoading}>
          {loginLoading ? 'Connexion…' : 'Se connecter'}
        </Button>

        {!forgotOpen ? (
          <button type="button" className={s.link} onClick={() => setForgotOpen(true)}>Mot de passe oublié ?</button>
        ) : forgotState === 'sent' ? (
          <div className={s.forgot}>
            <b className={s.ok}>✓ Demande enregistrée</b>
            <p>Si ce compte existe, un administrateur recevra votre demande et vous communiquera un nouveau mot de passe.</p>
            <Button variant="secondary" block onClick={closeForgot}>Retour</Button>
          </div>
        ) : (
          <div className={s.forgot}>
            <b>Réinitialiser le mot de passe</b>
            <p>Indiquez votre nom d'utilisateur ou votre email. Un administrateur sera notifié et pourra réinitialiser votre accès.</p>
            <input className={s.input} type="text" value={forgotId} onChange={e => setForgotId(e.target.value)}
              placeholder="Nom d'utilisateur ou email" autoCapitalize="none" autoComplete="username"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (forgotId.trim()) sendForgot() } }} />
            {forgotState === 'error' && <div className={s.error}>Erreur de connexion. Réessayez.</div>}
            <div className={s.row}>
              <Button variant="secondary" onClick={closeForgot}>Annuler</Button>
              <Button disabled={!forgotId.trim()} loading={forgotState === 'loading'} onClick={sendForgot}>Envoyer</Button>
            </div>
          </div>
        )}
      </form>
    </AuthShell>
  )
}
