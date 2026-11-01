/**
 * pages/dev/DevAuth.jsx — aperçu de la connexion (/ui/connexion) et du choix d'espace (/ui/espace)
 * Développement uniquement. Le choix d'espace affiche un compte d'exemple.
 */
import React from 'react'
import Login from '../auth/Login'
import EspaceSelector from '../auth/EspaceSelector'
import { toast } from '../../ui'

export function DevLogin() {
  return <Login />
}

export function DevEspace() {
  const user = { nom: 'Awa Diallo', role: 'stand' }
  return (
    <EspaceSelector
      user={user}
      onStaff={() => toast.info('Espace staff choisi (aperçu)')}
      onBenev={() => toast.info('Espace bénévole choisi (aperçu)')}
      onLogout={() => toast.info('Déconnexion (aperçu)')}
    />
  )
}
