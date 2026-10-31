/**
 * pages/dev/UiGallery.jsx — vitrine des composants src/ui (développement uniquement, route /ui)
 * Ne dépend ni de Firebase ni des stores : s'ouvre sans connexion.
 */
import React, { useState } from 'react'
import { Users, Wallet, ShoppingCart, Bookmark, Plus, Trash2, Inbox, Moon, Sun } from 'lucide-react'
import { Button, Card, Badge, Stat, Tabs, Table, Empty, Skeleton, Dialog, Sheet, toast, ToastViewport } from '../../ui'

const ROWS = [
  { id: 1, heure: '23:12', label: 'Bar Scène A · 2 Bière, 1 Eco-cup', type: 'debit',  montant: '−11,00 €' },
  { id: 2, heure: '22:47', label: 'Recharge billetterie',              type: 'credit', montant: '+30,00 €' },
  { id: 3, heure: '22:31', label: 'Retrait réservation #4809',         type: 'retrait', montant: '—' },
]
const TYPE_BADGE = { debit: ['coral', 'Débit'], credit: ['success', 'Crédit'], retrait: ['brand', 'Retrait'] }

const Section = ({ title, children }) => (
  <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-18)', fontWeight: 800 }}>{title}</h2>
    {children}
  </section>
)
const Row = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>{children}</div>

export default function UiGallery() {
  const [dark, setDark]   = useState(() => document.body.classList.contains('dark'))
  const [tab, setTab]     = useState('jour')
  const [dialog, setDialog] = useState(false)
  const [sheet, setSheet]   = useState(false)

  const toggleDark = () => { document.body.classList.toggle('dark', !dark); setDark(!dark) }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: 'var(--space-6) var(--space-4)', display: 'grid', gap: 'var(--space-8)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-32)', fontWeight: 800 }}>Composants YllaCash</h1>
            <p style={{ color: 'var(--muted)' }}>Vitrine de développement de <code>src/ui</code>. Données d'exemple.</p>
          </div>
          <Button variant="secondary" icon={dark ? Sun : Moon} onClick={toggleDark}>{dark ? 'Mode clair' : 'Mode sombre'}</Button>
        </header>

        <Section title="Boutons">
          <Row>
            <Button icon={Plus}>Créditer</Button>
            <Button variant="coral" size="lg">Encaisser 11,00 €</Button>
            <Button variant="secondary">Annuler</Button>
            <Button variant="danger" icon={Trash2}>Supprimer</Button>
            <Button variant="ghost">Plus tard</Button>
            <Button loading>Envoi…</Button>
            <Button disabled>Désactivé</Button>
            <Button variant="secondary" size="sm">Petit</Button>
            <Button variant="secondary" icon={Plus} iconOnly aria-label="Ajouter" />
          </Row>
        </Section>

        <Section title="Badges">
          <Row>
            <Badge>Brouillon</Badge><Badge tone="brand">Bénévole</Badge><Badge tone="success">Prête</Badge>
            <Badge tone="warning">En attente</Badge><Badge tone="danger">Solde négatif</Badge><Badge tone="coral">Admin</Badge>
          </Row>
        </Section>

        <Section title="Indicateurs">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
            <Stat label="Recettes du jour" value="8 412 €" icon={ShoppingCart} tone="coral" delta={{ value: '+12 %', direction: 'up', label: 'vs hier' }} trend={[2, 3, 3, 5, 5, 7, 7, 9, 10]} />
            <Stat label="Soldes" value="21 730 €" icon={Wallet} tone="success" sub="1 284 portefeuilles" trend={[9, 9, 10, 9, 8, 7, 7]} />
            <Stat label="Panier moyen" value="11,80 €" icon={Users} tone="brand" delta={{ value: '−0,40 €', direction: 'down', label: 'vs hier' }} trend={[8, 9, 8, 9, 7, 6]} />
            <Stat label="Réservations" value="37" icon={Bookmark} tone="warning" sub="9 prêtes" />
          </div>
        </Section>

        <Section title="Onglets">
          <Tabs label="Période" value={tab} onChange={setTab} items={[
            { value: 'jour', label: 'Jour' }, { value: 'event', label: 'Événement' }, { value: 'stand', label: 'Par stand', count: 6 },
          ]} />
        </Section>

        <Section title="Carte et tableau">
          <Card title="Dernières transactions" subtitle="3 sur 1 920" actions={<Button variant="secondary" size="sm">Tout voir</Button>} flush>
            <Table
              columns={[
                { key: 'heure', label: 'Heure' },
                { key: 'label', label: 'Opération' },
                { key: 'type', label: 'Type', render: r => <Badge tone={TYPE_BADGE[r.type][0]}>{TYPE_BADGE[r.type][1]}</Badge> },
                { key: 'montant', label: 'Montant', align: 'right' },
              ]}
              rows={ROWS}
            />
          </Card>
        </Section>

        <Section title="État vide et chargement">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
            <Card><Empty icon={Inbox} title="Aucune réservation" action={<Button size="sm" icon={Plus}>Créer une réservation</Button>}>Les commandes passées depuis l'appli spectateur apparaîtront ici.</Empty></Card>
            <Card><div style={{ display: 'grid', gap: 'var(--space-3)' }}><Skeleton height={24} width="40%" /><Skeleton lines={3} /></div></Card>
          </div>
        </Section>

        <Section title="Fenêtres et messages">
          <Row>
            <Button variant="secondary" onClick={() => setDialog(true)}>Ouvrir un dialogue</Button>
            <Button variant="secondary" onClick={() => setSheet(true)}>Ouvrir un panneau</Button>
            <Button variant="secondary" onClick={() => toast.success('Paiement accepté · nouveau solde 16,50 €')}>Toast succès</Button>
            <Button variant="secondary" onClick={() => toast.error('Solde insuffisant', { action: { label: 'Recharger', onClick: () => toast.info('Recharge…') } })}>Toast erreur</Button>
          </Row>
        </Section>
      </div>

      <Dialog open={dialog} onClose={() => setDialog(false)} title="Annuler la transaction ?"
        footer={<><Button variant="secondary" onClick={() => setDialog(false)}>Garder</Button><Button variant="danger" onClick={() => setDialog(false)}>Annuler la transaction</Button></>}>
        Le spectateur sera recrédité de 11,00 €. Cette action est inscrite au journal d'audit.
      </Dialog>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Léa Martin · YT-4F2A">
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <Stat label="Solde" value="27,50 €" tone="success" />
          <p style={{ color: 'var(--muted)' }}>Sur mobile, ce panneau monte du bas de l'écran.</p>
        </div>
      </Sheet>
      <ToastViewport />
    </div>
  )
}
