/**
 * pages/public/BenevoleProfil.jsx — v8 debug modernisé
 * Onglet "Profil" de l'espace bénévole (changement de mot de passe)
 */
import React, { useRef, useState } from 'react'
import { Field, PasswordStrength, focusFirstInvalid } from '../../ui'

export default function BenevoleProfil({
  benev, BRAND, pwdForm, setPwdForm, pwdMsg, pwdLoading, changePwd,
}) {
  const [tried, setTried] = useState(false)
  const formRef = useRef(null)

  const currentErr = pwdForm.current ? null : 'Saisis ton mot de passe actuel.'
  const new1Err = pwdForm.new1.length < 6 ? 'Le nouveau mot de passe doit faire au moins 6 caractères.' : null
  const new2Err = pwdForm.new1 !== pwdForm.new2 ? 'Les mots de passe ne correspondent pas.' : null

  const submit = () => {
    if (currentErr || new1Err || new2Err) { setTried(true); focusFirstInvalid(formRef.current); return }
    setTried(false)
    changePwd()
  }

  return (
<div ref={formRef} style={{ background:'var(--bg)', borderRadius:14, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:16 }}>Changer mon mot de passe</div>

            {/* Clé : les champs repartent vierges après un changement réussi */}
            <div key={pwdMsg?.ok ? 'ok' : 'saisie'}>
              <div style={{ marginBottom:12 }}>
                <Field label="Mot de passe actuel" error={currentErr} valid={!currentErr} showError={tried}>
                  <input type="password" value={pwdForm.current}
                    onChange={e => setPwdForm(f => ({...f, current:e.target.value}))}
                    placeholder="Mot de passe actuel"
                  />
                </Field>
              </div>

              <div style={{ marginBottom:12 }}>
                <Field label="Nouveau mot de passe" error={new1Err} valid={!new1Err} showError={tried}>
                  <input type="password" value={pwdForm.new1}
                    onChange={e => setPwdForm(f => ({...f, new1:e.target.value}))}
                    placeholder="Minimum 6 caractères"
                  />
                </Field>
                <PasswordStrength value={pwdForm.new1}/>
              </div>

              <div style={{ marginBottom:16 }}>
                <Field label="Confirmer le nouveau mot de passe" error={new2Err} valid={!!pwdForm.new2 && !new2Err} showError={tried}>
                  <input type="password" value={pwdForm.new2}
                    onChange={e => setPwdForm(f => ({...f, new2:e.target.value}))}
                    placeholder="Retapez le nouveau mot de passe"
                  />
                </Field>
              </div>
            </div>

            {pwdMsg && (
              <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:14, background:pwdMsg.ok?'var(--green-light)':'var(--red-light)', color:pwdMsg.ok?'var(--green-dark)':'var(--red-dark)', fontSize:13, fontWeight:600 }}>
                {pwdMsg.ok ? '✅ ' : '❌ '}{pwdMsg.text}
              </div>
            )}

            <button onClick={submit} disabled={pwdLoading}
              style={{ width:'100%', padding:'12px', background:BRAND, color:'var(--on-brand)', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:pwdLoading?'not-allowed':'pointer', fontFamily:'var(--font)', opacity:pwdLoading?.7:1 }}>
              {pwdLoading ? 'Modification…' : 'Modifier le mot de passe'}
            </button>
          </div>
  )
}
