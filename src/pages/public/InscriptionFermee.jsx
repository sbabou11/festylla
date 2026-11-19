/**
 * pages/public/InscriptionFermee.jsx — ancienne page /inscription (fermée le 20/11/2026)
 *
 * Choix de l'organisateur : un compte ne se crée plus que sur le site internet, avec le billet.
 * Le lien de l'espace arrive par e-mail. Sans compte, on commande à la billetterie.
 */
import React from 'react'
import { useTheme } from '../../hooks/useTheme'
import { Wallet } from 'lucide-react'
import { Empty } from '../../ui'

export default function InscriptionFermee() {
  useTheme()
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg2)' }}>
      <div style={{ maxWidth: 420 }}>
        <Empty icon={Wallet} title="Les comptes se créent sur le site du festival">
          Prenez votre billet sur le site internet : vous recevez par e-mail le lien de votre espace YllaCash.
          Sans compte, commandez et payez directement à la billetterie.
        </Empty>
      </div>
    </div>
  )
}
