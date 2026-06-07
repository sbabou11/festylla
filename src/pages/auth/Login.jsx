/**
 * pages/auth/Login.jsx — refonte Maison Ylla 2026
 * Dégradé signature (marine → teal → coral), carte crème
 */
import React, { useState } from 'react'
import useAuthStore from '../../store/useAuthStore'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'
import { APP_FULL_LABEL } from '../../utils/buildInfo'

export default function Login() {
  const { theme } = useTheme()
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

  // Dégradé signature Maison Ylla (s'assourdit en mode sombre)
  const bgGradient = theme.isDark
    ? 'linear-gradient(135deg, #000812 0%, #004848 50%, #B85020 100%)'
    : 'linear-gradient(135deg, #003048 0%, #007878 50%, #F07848 100%)'

  const cardBg = theme.isDark ? 'var(--bg2)' : '#FFF8F2'
  const cardShadow = theme.isDark
    ? '0 16px 40px rgba(0,0,0,0.45)'
    : '0 16px 40px rgba(0,24,36,0.25)'
  const cardBorder = theme.isDark ? '0.5px solid var(--border)' : 'none'

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      background: bgGradient,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px 16px',
      fontFamily: 'var(--font)',
      transition: 'background .3s'
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <ThemeToggle variant="dark"/>
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 68, height: 68, borderRadius: '50%',
            background: 'rgba(255,248,242,0.95)',
            margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,24,36,0.30)',
            border: '2px solid rgba(255,248,242,0.5)',
          }}>
            <img src="/logo.png" alt="YllaCash" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'}/>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#FFF8F2', letterSpacing: '-.01em' }}>YllaCash</div>
          <div style={{ fontSize: 14, color: 'rgba(255,248,242,0.85)', marginTop: 4 }}>
            Votre événement, sans cash.
          </div>
        </div>

        {/* Formulaire */}
        <form onSubmit={doLogin} style={{
          background: cardBg,
          borderRadius: 'var(--radius-xl)',
          padding: 28,
          boxShadow: cardShadow,
          border: cardBorder,
          transition: 'background .3s'
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Connexion staff</div>

          <div style={{ marginBottom: 14 }}>
            <label style={{
              fontSize: 12, fontWeight: 600,
              color: 'var(--muted)',
              display: 'block', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '.05em'
            }}>Nom d'utilisateur</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
              placeholder="ex : sbabou" autoComplete="username" autoCapitalize="none"
              style={{
                width: '100%', minHeight: 48, padding: '0 14px',
                border: '1.5px solid var(--border2)',
                borderRadius: 8,
                fontSize: 15, color: 'var(--text)',
                outline: 'none',
                fontFamily: 'var(--font)',
                background: 'var(--bg)',
                WebkitAppearance: 'none'
              }}/>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{
              fontSize: 12, fontWeight: 600,
              color: 'var(--muted)',
              display: 'block', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '.05em'
            }}>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input type={showPwd ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)} required
                placeholder="••••••••" autoComplete="current-password"
                style={{
                  width: '100%', minHeight: 48, padding: '0 44px 0 14px',
                  border: '1.5px solid var(--border2)',
                  borderRadius: 8,
                  fontSize: 15, color: 'var(--text)',
                  outline: 'none',
                  fontFamily: 'var(--font)',
                  background: 'var(--bg)',
                  WebkitAppearance: 'none'
                }}/>
              <button type="button" onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', minHeight: 'auto', display: 'flex'
                }}>
                {showPwd ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          {loginError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              {loginError}
            </div>
          )}

          <button type="submit" disabled={loginLoading}
            style={{
              width: '100%', minHeight: 52,
              background: 'var(--brand)',
              color: theme.isDark ? '#002438' : '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16, fontWeight: 700,
              cursor: loginLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loginLoading ? .7 : 1,
              fontFamily: 'var(--font)',
              transition: 'background .15s, transform .1s',
              boxShadow: theme.isDark
                ? '0 4px 14px rgba(20,181,181,0.35)'
                : '0 4px 14px rgba(0,144,144,0.30)'
            }}>
            {loginLoading ? <span>Connexion…</span> : <><LogIn size={18}/> Se connecter</>}
          </button>

          {/* Mot de passe oublié */}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            {!forgotOpen ? (
              <button type="button" onClick={() => setForgotOpen(true)}
                style={{ background:'none', border:'none', color:'var(--brand)', fontSize:12, fontWeight:600, cursor:'pointer', textDecoration:'underline', fontFamily:'var(--font)', padding:4, minHeight:'auto' }}>
                Mot de passe oublié ?
              </button>
            ) : (
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:14, textAlign:'left' }}>
                {forgotState === 'sent' ? (
                  <>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--green-dark)', marginBottom:4 }}>✓ Demande enregistrée</div>
                    <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, marginBottom:10 }}>
                      Si ce compte existe, un administrateur recevra votre demande et vous communiquera un nouveau mot de passe.
                    </div>
                    <button type="button" onClick={() => { setForgotOpen(false); setForgotState('idle'); setForgotId('') }}
                      className="btn-secondary" style={{ width:'100%' }}>
                      Retour
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Réinitialiser le mot de passe</div>
                    <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5, marginBottom:10 }}>
                      Indiquez votre nom d'utilisateur ou votre email. Un administrateur sera notifié et pourra réinitialiser votre accès.
                    </div>
                    <input type="text" value={forgotId} onChange={e => setForgotId(e.target.value)}
                      placeholder="Nom d'utilisateur ou email" autoCapitalize="none" autoComplete="username"
                      style={{
                        width:'100%', minHeight:44, padding:'0 14px', boxSizing:'border-box',
                        border:'1.5px solid var(--border2)', borderRadius:8, fontSize:15,
                        color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', marginBottom:10, outline:'none',
                      }}/>
                    {forgotState === 'error' && (
                      <div style={{ fontSize:11, color:'var(--red-dark)', marginBottom:8 }}>Erreur de connexion. Réessayez.</div>
                    )}
                    <div style={{ display:'flex', gap:8 }}>
                      <button type="button" onClick={() => { setForgotOpen(false); setForgotState('idle'); setForgotId('') }}
                        className="btn-secondary" style={{ flex:1, minHeight:44 }}>
                        Annuler
                      </button>
                      <button type="button" disabled={!forgotId.trim() || forgotState === 'loading'}
                        onClick={async () => {
                          setForgotState('loading')
                          const r = await requestPasswordReset(forgotId)
                          setForgotState(r.ok ? 'sent' : 'error')
                        }}
                        className="btn-primary" style={{ flex:1 }}>
                        {forgotState === 'loading' ? 'Envoi…' : 'Envoyer'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '20px 0 0', fontFamily: 'var(--font)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,248,242,0.55)' }}>{APP_FULL_LABEL}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,248,242,0.40)', marginTop: 2 }}>
            Développée par <strong style={{ color: 'rgba(255,248,242,0.55)' }}>Maison Ylla</strong>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,248,242,0.28)', marginTop: 6, fontStyle: 'italic' }}>
            "Toute la gestion financière de votre événement en un seul endroit, et bien plus encore"
          </div>
        </div>
      </div>
    </div>
  )
}
