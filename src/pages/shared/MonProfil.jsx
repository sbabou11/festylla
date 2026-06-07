/**
 * pages/shared/MonProfil.jsx — v5
 * Fix : affiche un loader tant que person n'est pas chargé (au lieu de page blanche)
 * Fix : responsive mobile
 */
import React, { useState, useRef, useEffect } from 'react'
import useAppStore  from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { fmt }      from '../../utils/helpers'
import { compressImage } from '../../utils/imageUtils'
import { APP_VERSION_LABEL, APP_BUILD_DATE_LABEL } from '../../utils/buildInfo'
import Avatar from '../../components/Avatar'
import CheckUpdateButton from '../../components/CheckUpdateButton'
import { KeyRound, Save, Camera, User } from 'lucide-react'

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
  const fileRef = useRef(null)

  // Mettre à jour nom quand person arrive (chargement asynchrone Firebase)
  useEffect(() => {
    if (person?.nom) setNom(person.nom)
  }, [person?.nom])

  // ── Loader tant que les données ne sont pas là ──────────────────
  if (!person) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      <User size={36} style={{ opacity: .3, marginBottom: 12, display: 'block', margin: '0 auto 12px' }}/>
      <div style={{ fontSize: 14 }}>Chargement du profil…</div>
    </div>
  )

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setUploadErr('')
    try {
      const src = await compressImage(file, 200, 0.7)
      if (isSpec) await setSpecAvatar(person.id, src)
      else        await setStaffAvatar(person.id, src)
    } catch (err) { setUploadErr('Erreur : ' + err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  const handleSave = () => {
    if (!nom.trim()) return
    if (isSpec) updateSpecNom(person.id, nom.trim())
    else        updateStaffNom(person.id, nom.trim())
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const handlePwd = async () => {
    if (pwd.length < 6) { setPwdMsg('Minimum 6 caractères'); return }
    if (pwd !== pwd2)   { setPwdMsg('Les mots de passe ne correspondent pas'); return }
    setPwdMsg('Modification en cours…')
    const ok = await resetOwnPassword(pwd)
    setPwdMsg(ok ? '✓ Mot de passe modifié !' : '⚠ Impossible de modifier — contactez un administrateur')
    if (ok) { setPwd(''); setPwd2(''); setTimeout(() => { setPwdOpen(false); setPwdMsg('') }, 2000) }
  }

  const resas = isSpec ? reservations.filter(r => r.specId === person.id) : []

  const card = {
    background: 'var(--bg)', border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 12,
  }
  const inp = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    border: '0.5px solid var(--border2)', borderRadius: 8,
    fontSize: 14, background: 'var(--bg2)', color: 'var(--text)',
    fontFamily: 'var(--font)', WebkitAppearance: 'none',
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 0 40px' }}>

      {/* Avatar */}
      <div style={{ ...card, padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Avatar nom={person.nom} src={person.avatar} size={80}/>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--brand)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              <Camera size={13} color="#fff"/>
            </button>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{person.nom}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{isSpec ? person.id : (person.role || 'Staff')}</div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFileChange}/>
        {uploading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Compression en cours…</div>}
        {uploadErr && <div style={{ marginTop: 8, padding: '7px 12px', background: 'var(--red-light)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>{uploadErr}</div>}
      </div>

      {/* Informations */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Informations</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Nom complet</label>
          <input value={nom} onChange={e => setNom(e.target.value)} style={{ ...inp, borderColor: saved ? 'var(--brand)' : 'var(--border2)', transition: 'border-color .2s' }}/>
        </div>
        {isSpec && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>ID QR</label>
            <input value={person.id} readOnly style={{ ...inp, color: 'var(--muted)', fontFamily: 'monospace', fontSize: 13 }}/>
          </div>
        )}
        {!isSpec && person.email && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Email</label>
            <input value={person.email} readOnly style={{ ...inp, color: 'var(--muted)', fontSize: 13 }}/>
          </div>
        )}
        <button onClick={handleSave}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Save size={14}/> {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* Mot de passe (staff uniquement) */}
      {!isSpec && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pwdOpen ? 12 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={14} style={{ color: 'var(--muted)' }}/> Mot de passe
            </div>
            <button onClick={() => { setPwdOpen(v => !v); setPwdMsg('') }}
              style={{ fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'auto' }}>
              {pwdOpen ? 'Annuler' : 'Changer'}
            </button>
          </div>
          {pwdOpen && (
            <div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Nouveau mot de passe</label>
                <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} style={inp} placeholder="minimum 6 caractères"/>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Confirmer</label>
                <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} style={inp} placeholder="répéter le mot de passe"/>
              </div>
              {pwdMsg && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: pwdMsg.startsWith('✓') ? 'var(--brand-light)' : 'var(--red-light)', borderRadius: 8, fontSize: 12, color: pwdMsg.startsWith('✓') ? 'var(--brand-dark)' : 'var(--red)' }}>
                  {pwdMsg}
                </div>
              )}
              <button onClick={handlePwd}
                style={{ width: '100%', padding: '10px 16px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Enregistrer le mot de passe
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats spectateur */}
      {isSpec && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Solde</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-dark)' }}>{fmt(person.solde || 0)}</div>
          </div>
          <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Réservations</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{resas.length}</div>
          </div>
        </div>
      )}

      {/* Info de build — visible à tous, utile pour comparer entre devices et savoir
          si l'app tourne sur la dernière version déployée */}
      <div style={{
        marginTop: 24, padding: '12px 16px',
        background: 'var(--bg2)', borderRadius: 'var(--radius)',
        border: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Version installée
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
            YllaCash {APP_VERSION_LABEL}
          </div>
          {APP_BUILD_DATE_LABEL && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Build du {APP_BUILD_DATE_LABEL}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right', maxWidth: 200 }}>
          Si une mise à jour est disponible, une bannière s'affichera automatiquement en bas.
        </div>
      </div>

      {/* Bouton de vérification manuelle des mises à jour */}
      <div style={{ marginTop: 12 }}>
        <CheckUpdateButton variant="card"/>
      </div>
    </div>
  )
}
