/**
 * pages/public/BenevoleProfil.jsx — v8 debug modernisé
 * Onglet "Profil" de l'espace bénévole (changement de mot de passe)
 */
import React from 'react'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  minHeight: 44,
  border: '1px solid var(--border2)',
  borderRadius: 10,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  color: 'var(--text)',
  background: 'var(--bg2)',
  outline: 'none',
}

export default function BenevoleProfil({
  benev, BRAND, pwdForm, setPwdForm, pwdMsg, pwdLoading, changePwd,
}) {
  return (
    <div style={{
      background: 'var(--bg)',
      borderRadius: 14,
      padding: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      border: '0.5px solid var(--border)',
    }}>
      <div style={{
        fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        🔒 Changer mon mot de passe
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          display: 'block', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          Mot de passe actuel
        </label>
        <input type="password" value={pwdForm.current}
          onChange={e => setPwdForm(f => ({...f, current: e.target.value}))}
          placeholder="Mot de passe actuel"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          display: 'block', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          Nouveau mot de passe
        </label>
        <input type="password" value={pwdForm.new1}
          onChange={e => setPwdForm(f => ({...f, new1: e.target.value}))}
          placeholder="Minimum 6 caractères"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          display: 'block', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          Confirmer le nouveau mot de passe
        </label>
        <input type="password" value={pwdForm.new2}
          onChange={e => setPwdForm(f => ({...f, new2: e.target.value}))}
          placeholder="Retapez le nouveau mot de passe"
          style={inputStyle}
        />
      </div>

      {pwdMsg && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          marginBottom: 14,
          background: pwdMsg.ok ? 'var(--green-light)' : 'var(--red-light)',
          color: pwdMsg.ok ? 'var(--green-dark)' : 'var(--red)',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          borderLeft: `3px solid ${pwdMsg.ok ? 'var(--green)' : 'var(--red)'}`,
        }}>
          {pwdMsg.ok ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
          {pwdMsg.text}
        </div>
      )}

      <button onClick={changePwd} disabled={pwdLoading}
        style={{
          width: '100%',
          padding: 14,
          minHeight: 48,
          background: pwdLoading ? 'var(--muted)' : 'linear-gradient(135deg, ' + BRAND + ' 0%, ' + BRAND + 'DD 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 800,
          cursor: pwdLoading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          opacity: pwdLoading ? 0.7 : 1,
          boxShadow: pwdLoading ? 'none' : '0 4px 14px ' + BRAND + '40',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {pwdLoading ? 'Modification…' : <><Lock size={16}/> Modifier le mot de passe</>}
      </button>
    </div>
  )
}
