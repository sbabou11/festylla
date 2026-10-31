/**
 * pages/public/BenevoleProfil.jsx
 * Onglet "Profil" de l'espace bénévole (changement de mot de passe)
 */
import React from 'react'

export default function BenevoleProfil({
  benev, BRAND, pwdForm, setPwdForm, pwdMsg, pwdLoading, changePwd,
}) {
  return (
<div style={{ background:'var(--bg)', borderRadius:14, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:16 }}>Changer mon mot de passe</div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Mot de passe actuel</label>
              <input type="password" value={pwdForm.current}
                onChange={e => setPwdForm(f => ({...f, current:e.target.value}))}
                placeholder="Mot de passe actuel"
                style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, fontSize:14, fontFamily:'system-ui', boxSizing:'border-box', color:'var(--text)', background:'var(--bg2)' }}
              />
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Nouveau mot de passe</label>
              <input type="password" value={pwdForm.new1}
                onChange={e => setPwdForm(f => ({...f, new1:e.target.value}))}
                placeholder="Minimum 6 caractères"
                style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, fontSize:14, fontFamily:'system-ui', boxSizing:'border-box', color:'var(--text)', background:'var(--bg2)' }}
              />
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Confirmer le nouveau mot de passe</label>
              <input type="password" value={pwdForm.new2}
                onChange={e => setPwdForm(f => ({...f, new2:e.target.value}))}
                placeholder="Retapez le nouveau mot de passe"
                style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, fontSize:14, fontFamily:'system-ui', boxSizing:'border-box', color:'var(--text)', background:'var(--bg2)' }}
              />
            </div>

            {pwdMsg && (
              <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:14, background:pwdMsg.ok?'#D1FAE5':'#FEE2E2', color:pwdMsg.ok?'#065f46':'#DC2626', fontSize:13, fontWeight:600 }}>
                {pwdMsg.ok ? '✅ ' : '❌ '}{pwdMsg.text}
              </div>
            )}

            <button onClick={changePwd} disabled={pwdLoading}
              style={{ width:'100%', padding:'12px', background:BRAND, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:pwdLoading?'not-allowed':'pointer', fontFamily:'system-ui', opacity:pwdLoading?.7:1 }}>
              {pwdLoading ? 'Modification…' : 'Modifier le mot de passe'}
            </button>
          </div>
  )
}
