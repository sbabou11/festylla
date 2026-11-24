/**
 * components/BilanBenevoles.jsx — consommations et soldes des bénévoles (écran 13, 24/11/2026)
 *
 * Offert (avantages) et acheté (solde) comptés à part ; suivi des porte-monnaie des bénévoles.
 * Lit les transactions et les comptes déjà chargés par l'espace équipe (useAppStore).
 */
import React, { useMemo } from 'react'
import useAppStore from '../store/useAppStore'
import { bilanBenevoles } from '../utils/avantagesBenevole'
import { fmt } from '../utils/helpers'
import { Card } from '../ui'

const Ligne = ({ label, valeur }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
    <span>{label}</span><b>{valeur}</b>
  </div>
)

export default function BilanBenevoles() {
  const { logs, spectateurs } = useAppStore()
  const b = useMemo(() => bilanBenevoles(logs || [], spectateurs || []), [logs, spectateurs])
  return (
    <>
      <Card title="Consommations des bénévoles" subtitle="Offert et acheté sont comptés à part, ici et dans le retour vers Event Manager.">
        <Ligne label="Offertes (avantages)" valeur={`${b.offertes.n} · valeur ${fmt(b.offertes.valeur)}`} />
        <Ligne label="Achetées sur leur solde" valeur={`${b.achetees.n} · ${fmt(b.achetees.montant)}`} />
      </Card>
      <Card title="Soldes des bénévoles" subtitle={`${b.comptes} porte-monnaie ouvert${b.comptes > 1 ? 's' : ''}`}>
        <Ligne label="Rechargés à la billetterie" valeur={fmt(b.recharges.billetterie)} />
        <Ligne label="Rechargés en ligne (carte)" valeur={fmt(b.recharges.enLigne)} />
        <Ligne label="Dépensés" valeur={fmt(b.depense)} />
        <Ligne label="Restant sur les comptes" valeur={fmt(b.restant)} />
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
          Comme pour les spectateurs : recharges dans la caisse ou par Stripe, ventes comptées avec les autres ventes,
          restant remboursable pendant 2 mois ou donné à l'ONG Ylla.
        </p>
      </Card>
    </>
  )
}
