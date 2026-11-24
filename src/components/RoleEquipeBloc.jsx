/**
 * components/RoleEquipeBloc.jsx — bloc « Rôle d'équipe » d'une fiche bénévole (écran 10, 23/11/2026)
 *
 * Réservé aux admins. Le rôle ajoute un onglet à l'espace du bénévole, ouvert avec son identifiant et
 * son mot de passe pendant ses créneaux. Donner un rôle exige un nouveau mot de passe solide.
 * Contrôlé : role / mdp viennent du parent, qui enregistre par setRoleBenevole (serveur).
 * etatRoleEquipe() dit si l'enregistrement est possible et ce qu'il faut envoyer.
 */
import React from 'react'
import { Copy, Wand2 } from 'lucide-react'
import { ROLES_EQUIPE, erreurMotDePasseRole, soliditeMotDePasse, genererMotDePasseRole } from '../utils/roleEquipe'
import { toast } from '../ui'
import s from './RoleEquipeBloc.module.css'

/** { change, besoinMdp, erreur, ok } pour une fiche, le rôle choisi et le mot de passe saisi */
export function etatRoleEquipe(fiche = {}, role = '', mdp = '') {
  const avant = fiche.roleEquipe || ''
  const besoinMdp = !!role && role !== avant
  const erreur = mdp || besoinMdp ? (role ? erreurMotDePasseRole(mdp, fiche) : null) : null
  const change = role !== avant || (!!role && !!mdp)
  return { change, besoinMdp, erreur, ok: !change || !erreur }
}

export default function RoleEquipeBloc({ fiche = {}, role, setRole, mdp, setMdp, staff = [], em = false, showError = false }) {
  const { besoinMdp, erreur } = etatRoleEquipe(fiche, role, mdp)
  const ident = fiche.username || ''
  const double = ident && staff.find(m => (m.username || '').toLowerCase() === ident.toLowerCase())
  const sol = soliditeMotDePasse(mdp)
  const copier = async () => {
    try { await navigator.clipboard.writeText(ident); toast.success('Identifiant copié') } catch { toast.info('Sélectionnez l\'identifiant pour le copier') }
  }

  return (
    <fieldset className={s.bloc}>
      <legend className={s.titre}>Rôle d'équipe <span className={s.badge}>admins seulement</span></legend>
      <p className={s.aide}>Ajoute un onglet à son espace bénévole. Il ne s'ouvrira qu'avec son identifiant et son mot de passe,
        pendant ses créneaux sur un poste lié à ce rôle.</p>
      <div className={s.chips} role="radiogroup" aria-label="Rôle d'équipe">
        {ROLES_EQUIPE.map(r => (
          <button key={r.value || 'aucun'} type="button" role="radio" aria-checked={role === r.value}
            className={`${s.chip} ${role === r.value ? s.chipOn : ''}`} onClick={() => setRole(r.value)}>
            <i style={{ background: r.color }} aria-hidden="true" />{r.label}
          </button>
        ))}
      </div>

      {role ? (<>
        <div className={s.champ}>
          <span className={s.label}>Identifiant</span>
          <div className={s.ident}>
            {ident ? <b>{ident}</b> : <span className={s.aide}>Créé à l'enregistrement, à partir du prénom et du nom.</span>}
            {ident && <button type="button" className={s.petit} onClick={copier}><Copy size={14} aria-hidden="true" /> Copier</button>}
          </div>
          {em && !fiche.username && <span className={s.aide}>Event Manager ne donne pas d'identifiant : il est créé ici.</span>}
        </div>
        <div className={s.champ}>
          <label className={s.label} htmlFor="role-mdp">
            Mot de passe du rôle {besoinMdp ? '(obligatoire pour donner ce rôle)' : '(laisser vide pour le garder)'}
          </label>
          <div className={s.saisie}>
            <input id="role-mdp" type="text" value={mdp} onChange={e => setMdp(e.target.value)} placeholder="8 caractères minimum"
              autoComplete="new-password" autoCapitalize="none" spellCheck={false} aria-invalid={showError && !!erreur} aria-describedby="role-mdp-aide" />
            <button type="button" className={s.petit} onClick={() => setMdp(genererMotDePasseRole())}><Wand2 size={14} aria-hidden="true" /> Générer</button>
          </div>
          <div className={s.jauge} aria-hidden="true"><b style={{ width: `${sol * 100}%`, background: sol < 0.5 ? '#D83030' : sol < 0.8 ? '#D89030' : '#14B58C' }} /></div>
          <span id="role-mdp-aide" className={s.aide}>
            {(showError || mdp) && erreur && <b className={s.err}>{erreur} </b>}
            À remettre en main propre. {em ? 'Il servira aussi à se connecter sans le lien.' : 'Il remplace son mot de passe actuel.'} Le bénévole pourra le changer dans Profil.
          </span>
        </div>
        {double && (
          <p className={s.double} role="note">
            <b>Compte équipe en double :</b> « {ident} » existe aussi dans Équipe ({double.role || 'sans rôle'}). Une fois le rôle donné ici,
            supprimez ce compte dans Équipe : il passe avant la fiche bénévole à la connexion.
          </p>
        )}
      </>) : (
        <p className={s.aide}>Sans rôle : l'espace bénévole habituel, sans onglet en plus.</p>
      )}
    </fieldset>
  )
}
