/**
 * pages/auth/EspaceSelector.jsx — choix d'espace pour un compte staff qui a aussi un profil bénévole
 */
import React from 'react'
import { Store, HandHeart, ChevronRight, LogOut } from 'lucide-react'
import { Button } from '../../ui'
import AuthShell from './AuthShell'
import s from './auth.module.css'

const ROLE_LABELS = {
  stand:        'Stand',
  billetterie:  'Billetterie',
  admin:        'Admin',
  super_admin:  'Super Admin',
  consultation: 'Consultation',
  directeur_artistique: 'Directeur artistique',
}
const ROLE_SUBTITLES = {
  stand:        'Caisse, encaissements',
  billetterie:  'Recharges, nouveaux comptes',
  admin:        'Caisse, encaissements',
  super_admin:  'Gestion complète',
  consultation: 'Consultation',
  directeur_artistique: 'Gestion du planning festival',
}

export default function EspaceSelector({ user, onStaff, onBenev, onLogout }) {
  const prenom = (user?.nom || '').split(' ')[0]
  return (
    <AuthShell subtitle={prenom ? `Bonjour ${prenom}` : null}>
      <div className={s.card}>
        <h2 className={s.cardTitle}>Dans quel espace entrer ?</h2>
        <p className={s.cardSub}>Votre compte est associé à deux espaces. Vous pourrez basculer à tout moment.</p>

        <div className={s.spaces}>
          <button type="button" className={s.space} style={{ '--space-color': 'var(--brand)' }} onClick={onStaff}>
            <span className={s.spaceIcon}><Store size={22} /></span>
            <span className={s.spaceText}>
              <b>Espace staff</b>
              <span>{ROLE_LABELS[user?.role] || user?.role} · {ROLE_SUBTITLES[user?.role] || 'Espace personnel'}</span>
            </span>
            <ChevronRight size={18} className={s.chev} />
          </button>

          <button type="button" className={s.space} style={{ '--space-color': 'var(--coral)' }} onClick={onBenev}>
            <span className={s.spaceIcon}><HandHeart size={22} /></span>
            <span className={s.spaceText}>
              <b>Mon espace bénévole</b>
              <span>Quotas repas et boissons, créneaux, pointage</span>
            </span>
            <ChevronRight size={18} className={s.chev} />
          </button>
        </div>

        <Button variant="ghost" icon={LogOut} block onClick={onLogout}>Se déconnecter</Button>
      </div>
    </AuthShell>
  )
}
