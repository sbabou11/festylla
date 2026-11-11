/**
 * pages/admin/Dashboard.jsx — ancien tableau de bord, fusionné dans l'Accueil
 * Garde les liens /dashboard valides : affiche la page d'accueil unique.
 * Les blocs (indicateurs, flux, objectif, kanban, alertes, transactions)
 * vivent dans pages/admin/Accueil.jsx et pages/admin/dashboard/*.
 */
import React from 'react'
import Accueil from './Accueil'

export default function Dashboard(props) {
  return <Accueil {...props} />
}
