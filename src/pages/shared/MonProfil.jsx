/**
 * pages/shared/MonProfil.jsx — v5
 * Fix : affiche un loader tant que person n'est pas chargé (au lieu de page blanche)
 * Fix : responsive mobile
 * Design system : cartes ui/Card, champs et tuiles dans MonProfil.module.css, squelette au chargement.
 */
import React, { useState, useRef, useEffect } from 'react'
import useAppStore  from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt }      from '../../utils/helpers'
import { compressImage } from '../../utils/imageUtils'
import { friendlyError } from '../../utils/errors'
import Avatar from '../../components/Avatar'
import { KeyRound, Save, Camera, Check, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { Button, Card, Field, Skeleton, PasswordStrength, toast, focusFirstInvalid } from '../../ui'
import st from './MonProfil.module.css'

export default function MonProfil({ view }) {
  const { spectateurs, staff, reservations, currentSpecId,
          setSpecAvatar, setStaffAvatar, updateSpecNom, updateStaffNom } = useAppStore()
  const { resetOwnPassword, user } = useAuthStore()

  const isSpec = view === 'spectateur'

  // Chercher la personne — peut être null au premier rendu si Firebase pas encore chargé
  // Chercher la personne dans Firebase staff
  // Si non trouvée (comptes mock avec id 's1'-'s5'), construire depuis user
  const personFromStaff = isSpec
    ? spectateurs.find(s => s.id === currentSpecId) || spectateurs[0]
    : staff.find(s => s.id === user?.id) || staff.find(s => s.email === user?.email)

  const person = personFromStaff || (
    // Fallback : construire depuis le user connecté (comptes mock)
    !isSpec && user ? {
      id:     user.id,
      nom:    user.nom,
      email:  user.email,
      role:   user.role,
      avatar: user.avatar || null,
    } : null
  )

  const [nom,       setNom]       = useState('')
  const [saved,     setSaved]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [pwdOpen,   setPwdOpen]   = useState(false)
  const [pwd,       setPwd]       = useState('')
  const [pwd2,      setPwd2]      = useState('')
  const [pwdMsg,    setPwdMsg]    = useState('')
  const [nomTried,  setNomTried]  = useState(false)
  const [pwdTried,  setPwdTried]  = useState(false)
  const [pwdKey,    setPwdKey]    = useState(0) // repart de champs vierges après un changement réussi
  const fileRef = useRef(null)
  const infoRef = useRef(null)
  const pwdRef  = useRef(null)

  // Mettre à jour nom quand person arrive (chargement asynchrone Firebase)
  useEffect(() => {
    if (person?.nom) setNom(person.nom)
  }, [person?.nom])

  // ── Squelette tant que les données ne sont pas là ───────────────
  if (!person) return (
    <div className={st.wrap} aria-busy="true" aria-label="Chargement du profil">
      <div className={clsx(st.card, st.hero)}>
        <Skeleton width={80} height={80} radius="50%"/>
        <Skeleton width="50%" height={18}/>
        <Skeleton width="30%" height={12}/>
      </div>
      <div className={st.card}><Skeleton lines={3} height={16}/></div>
    </div>
  )

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setUploadErr('')
    try {
      const src = await compressImage(file, 200, 0.7)
      if (isSpec) await setSpecAvatar(person.id, src)
      else        await setStaffAvatar(person.id, src)
    } catch (err) {
      const msg = friendlyError(err, "La photo n'a pas été enregistrée.")
      setUploadErr(msg); toast.error(msg)
    }
    finally { setUploading(false); e.target.value = '' }
  }

  const nomErr  = nom.trim() ? null : 'Le nom ne peut pas être vide.'
  const pwdErr  = pwd.length < 6 ? 'Minimum 6 caractères' : null
  const pwd2Err = pwd !== pwd2 ? 'Les mots de passe ne correspondent pas' : null

  const handleSave = () => {
    if (nomErr) { setNomTried(true); focusFirstInvalid(infoRef.current); return }
    setNomTried(false)
    if (isSpec) updateSpecNom(person.id, nom.trim())
    else        updateStaffNom(person.id, nom.trim())
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const handlePwd = async () => {
    if (pwdErr || pwd2Err) { setPwdTried(true); setPwdMsg(''); focusFirstInvalid(pwdRef.current); return }
    setPwdTried(false)
    setPwdMsg('Modification en cours…')
    const ok = await resetOwnPassword(pwd)
    setPwdMsg(ok ? '✓ Mot de passe modifié !' : '⚠ Impossible de modifier — contactez un administrateur')
    if (ok) { setPwd(''); setPwd2(''); setPwdKey(k => k + 1); setTimeout(() => { setPwdOpen(false); setPwdMsg('') }, 2000) }
  }

  const resas = isSpec ? reservations.filter(r => r.specId === person.id) : []
  const pwdTone = pwdMsg.startsWith('✓') ? 'ok' : pwdMsg === 'Modification en cours…' ? 'info' : 'err'

  return (
    <div className={st.wrap}>

      {/* Avatar */}
      <section className={clsx(st.card, st.hero)}>
        <div className={st.avatarWrap}>
          <Avatar nom={person.nom} src={person.avatar} size={80}/>
          <button type="button" className={st.camera} onClick={() => fileRef.current?.click()} disabled={uploading}
            aria-label="Changer la photo de profil" title="Changer la photo">
            <Camera size={15} aria-hidden="true"/>
          </button>
        </div>
        <div>
          <h1 className={st.name}>{person.nom}</h1>
          <p className={clsx(st.muted, isSpec && st.mono)}>{isSpec ? person.id : (person.role || 'Staff')}</p>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className={st.hidden} onChange={handleFileChange} tabIndex={-1} aria-hidden="true"/>
        {uploading && <p className={st.muted} role="status">Compression en cours…</p>}
        {uploadErr && <p className={clsx(st.msg, st.err)}><AlertCircle size={14} aria-hidden="true"/>{uploadErr}</p>}
      </section>

      {/* Informations */}
      <Card title="Informations">
        <div className={st.form} ref={infoRef}>
          <Field label={<span className={st.label}>Nom complet</span>} error={nomErr} showError={nomTried}>
            <input className={clsx(st.input, saved && st.inputSaved)} value={nom} onChange={e => setNom(e.target.value)} autoComplete="name"/>
          </Field>
          {isSpec && (
            <label className={st.field}>
              <span className={st.label}>ID QR</span>
              <input className={clsx(st.input, st.readOnly, st.mono)} value={person.id} readOnly/>
            </label>
          )}
          {!isSpec && person.email && (
            <label className={st.field}>
              <span className={st.label}>Email</span>
              <input className={clsx(st.input, st.readOnly)} value={person.email} readOnly/>
            </label>
          )}
          <div>
            <Button icon={saved ? Check : Save} onClick={handleSave}>
              {saved ? 'Sauvegardé' : 'Sauvegarder'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Mot de passe (staff uniquement) */}
      {!isSpec && (
        <Card
          title={<span className={st.titleIcon}><KeyRound size={15} aria-hidden="true"/> Mot de passe</span>}
          actions={
            <Button size="sm" variant="ghost" aria-expanded={pwdOpen} onClick={() => { setPwdOpen(v => !v); setPwdMsg(''); setPwdTried(false) }}>
              {pwdOpen ? 'Annuler' : 'Changer'}
            </Button>
          }
        >
          {pwdOpen ? (
            <div className={st.form} ref={pwdRef}>
              <div className={st.field}>
                <Field key={`p${pwdKey}`} label={<span className={st.label}>Nouveau mot de passe</span>} error={pwdErr} valid={!pwdErr} showError={pwdTried}>
                  <input className={st.input} type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="minimum 6 caractères" autoComplete="new-password"/>
                </Field>
                <PasswordStrength value={pwd}/>
              </div>
              <Field key={`c${pwdKey}`} label={<span className={st.label}>Confirmer</span>} error={pwd2Err} valid={!!pwd2 && !pwd2Err} showError={pwdTried}>
                <input className={st.input} type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} placeholder="répéter le mot de passe" autoComplete="new-password"/>
              </Field>
              {pwdMsg && (
                <p className={clsx(st.msg, st[pwdTone])} role={pwdTone === 'err' ? 'alert' : 'status'}>{pwdMsg}</p>
              )}
              <Button block onClick={handlePwd}>Enregistrer le mot de passe</Button>
            </div>
          ) : (
            <p className={st.muted}>Modifiez le mot de passe de votre compte staff.</p>
          )}
        </Card>
      )}

      {/* Stats spectateur */}
      {isSpec && (
        <div className={st.tiles}>
          <div className={st.tile}>
            <span className={st.tileLabel}>Solde</span>
            <b className={clsx(st.tileValue, st.tileBrand)}>{fmt(person.solde || 0)}</b>
          </div>
          <div className={st.tile}>
            <span className={st.tileLabel}>Réservations</span>
            <b className={st.tileValue}>{resas.length}</b>
          </div>
        </div>
      )}
    </div>
  )
}
