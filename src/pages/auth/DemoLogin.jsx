/**
 * pages/auth/DemoLogin.jsx
 * Page de démonstration — accessible uniquement via token secret
 * URL : /demo?key=TOKEN_SECRET
 * Toute autre tentative redirige vers /
 */
import React, { useState, useEffect } from 'react'
import useAuthStore from '../../store/useAuthStore'
import { LogIn, ShieldAlert } from 'lucide-react'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'

const DEMO_KEY = '9ASv3oZ5YfV6ziLmBdzPEArzoaVmZJVm92rQgU9tXso'

const DEMO_ACCOUNTS = [
  { label:'Admin',       username:'admin',   password:'admin123',  role:'admin',        color:'#534AB7' },
  { label:'Billetterie', username:'amoreau', password:'alice123',  role:'billetterie',  color:'#0F6E56' },
  { label:'Stand',       username:'bpetit',  password:'bob123',    role:'stand',        color:'#BA7517' },
  { label:'Consultation',username:'dsimon',  password:'dave123',   role:'consultation', color:'#6b6b6b' },
]

export default function DemoLogin() {
  const { theme } = useTheme()
  const { login, loginError, loginLoading } = useAuthStore()
  const [username, setUsername] = useState('')
  const [pwd, setPwd]           = useState('')
  const [authorized, setAuthorized] = useState(false)

  // Vérifier le token dans l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const key    = params.get('key')
    if (key === DEMO_KEY) {
      setAuthorized(true)
    } else {
      // Token absent ou invalide → rediriger vers /
      window.location.replace('/')
    }
  }, [])

  const doLogin = async (e) => {
    e.preventDefault()
    await login(username.trim(), pwd)
  }

  const demoLogin = (d) => {
    setUsername(d.username)
    setPwd(d.password)
  }

  // Pendant la vérification
  if (!authorized) return null

  return (
    <div style={{ position:'relative', minHeight:'100vh', background:'linear-gradient(135deg,#1a0533 0%,#3d0a5c 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:'system-ui,sans-serif' }}>
      <div style={{ position:'absolute', top:16, right:16 }}>
        <ThemeToggle variant="dark"/>
      </div>

      <div style={{ width:'100%', maxWidth:400 }}>
        {/* Badge démo */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:24 }}>
          <ShieldAlert size={18} style={{ color:'#f59e0b' }}/>
          <span style={{ fontSize:13, fontWeight:700, color:'#f59e0b', letterSpacing:'.05em', textTransform:'uppercase' }}>
            Environnement de démonstration
          </span>
        </div>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:64, height:64, borderRadius:18, background:'rgba(255,255,255,.1)', margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
            <img src="/logo.png" alt="YllaCash" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>YllaCash</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', marginTop:4 }}>Connexion démo</div>
        </div>

        {/* Formulaire */}
        <div style={{ background: theme.isDark ? 'var(--bg2)' : '#fff', borderRadius:20, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,.4)', border:'1px solid rgba(245,158,11,.3)' }}>
          <form onSubmit={doLogin}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color: theme.isDark ? 'var(--muted)' : '#555', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>
                Nom d'utilisateur
              </label>
              <input type="text" value={username} onChange={e=>setUsername(e.target.value)} required
                autoCapitalize="none"
                style={{ width:'100%', minHeight:48, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:12, fontSize:15, color:'var(--text)', outline:'none', fontFamily:'system-ui', background:'var(--bg)', WebkitAppearance:'none', boxSizing:'border-box' }}/>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color: theme.isDark ? 'var(--muted)' : '#555', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>
                Mot de passe
              </label>
              <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} required
                style={{ width:'100%', minHeight:48, padding:'0 14px', border:'1.5px solid var(--border2)', borderRadius:12, fontSize:15, color:'var(--text)', outline:'none', fontFamily:'system-ui', background:'var(--bg)', WebkitAppearance:'none', boxSizing:'border-box' }}/>
            </div>

            {loginError && (
              <div style={{ marginBottom:14, padding:'10px 14px', background:'#FCEBEB', borderRadius:10, fontSize:14, color:'#A32D2D' }}>
                {loginError}
              </div>
            )}

            <button type="submit" disabled={loginLoading}
              style={{ width:'100%', minHeight:52, background:'#7c3aed', color:'#fff', border:'none', borderRadius:14, fontSize:16, fontWeight:700, cursor:loginLoading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:loginLoading?.7:1, fontFamily:'system-ui' }}>
              {loginLoading ? 'Connexion…' : <><LogIn size={18}/> Se connecter</>}
            </button>
          </form>

          {/* Comptes démo */}
          <div style={{ marginTop:20, paddingTop:16, borderTop:'0.5px solid var(--border)' }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10, textAlign:'center', fontWeight:500 }}>
              Comptes de démonstration
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {DEMO_ACCOUNTS.map(d => (
                <button key={d.username} type="button" onClick={() => demoLogin(d)}
                  style={{ minHeight:40, padding:'0 10px', border:`1.5px solid ${d.color}33`, borderRadius:10, background:d.color+'11', color:d.color, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'system-ui', display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:d.color, flexShrink:0 }}/>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:16, fontSize:11, color:'rgba(255,255,255,.3)' }}>
          Cette page est réservée aux tests internes.
        </div>
      </div>
    </div>
  )
}
