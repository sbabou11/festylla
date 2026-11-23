/**
 * pages/admin/Exposants.jsx — v1.1.0 (refonte)
 *
 * Page de gestion des exposants payant des frais d'exposition.
 *
 * 3 vues :
 *   - Liste (par défaut) : stats globales + tableau des exposants avec statut paiement
 *   - Détail : vue complète d'un exposant + actions (paiements, docs, PDF)  → exposants/ExpoDetail.jsx
 *   - Formulaire : création / édition                                     → exposants/ExpoForm.jsx
 *
 * Navigation interne par état React (pas de routing distinct).
 */

import React, { useState, useMemo } from 'react'
import { Plus, Search, AlertCircle, Building2, Receipt, Wallet, Clock } from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import { getSettings } from '../../firebase/service'
import {
  computeExpoStatut, computeExpoPercent, aggregateExpoStats, expoDisplayName,
  computeExpoPaye, computeExpoRestant,
} from '../../utils/expositions'
import DetailSheet from '../../components/DetailSheet'
import { Repartition, Note, grouper, nettoyer } from '../../components/detailContenus'
import { Button, Stat, Table, Empty } from '../../ui'
import ExpoDetail from './exposants/ExpoDetail'
import ExpoForm from './exposants/ExpoForm'
import StatutBadge from './exposants/StatutBadge'
import s from './exposants/exposants.module.css'

const eur = (cts) => `${((cts || 0) / 100).toFixed(2)} €`

export default function Exposants() {
  const { currentEventId } = useEventStore()
  const { expositions } = useAppStore()

  const [view, setView]         = useState('list')   // 'list' | 'detail' | 'form'
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId]   = useState(null) // null = création
  const [search, setSearch]     = useState('')
  const [statOpen, setStatOpen] = useState(null) // carte de synthèse ouverte (23/11/2026)

  // Thématiques chargées au montage (sans listener — config rarement modifiée)
  const [thematiques, setThematiques] = useState([])
  const [organisateur, setOrganisateur] = useState(null)
  // Configuration TVA de l'événement (Lot C3) chargée depuis settings
  // pour pouvoir afficher/saisir les taux dans le formulaire.
  const [tvaConfig, setTvaConfig] = useState({ active: false, defaultTaux: 0 })

  React.useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(s => {
      setThematiques(Array.isArray(s?.expoThematiques) ? s.expoThematiques : [])
      setOrganisateur(s?.organisateur || null)
      setTvaConfig({
        active: !!s?.tvaActive,
        defaultTaux: Number(s?.tvaDefaultTaux) || 0,
      })
    }).catch(() => {})
  }, [currentEventId])

  // Filtre les exposants par recherche
  const filteredExpos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expositions || []
    return (expositions || []).filter(e => {
      const id = e.identite || {}
      return (
        // Nom historique + nom d'affichage calculé
        (e.nom || '').toLowerCase().includes(q) ||
        expoDisplayName(e).toLowerCase().includes(q) ||
        // Identité particulier
        (id.prenom || '').toLowerCase().includes(q) ||
        (id.nom || '').toLowerCase().includes(q) ||
        // Identité entreprise
        (id.raisonSociale || '').toLowerCase().includes(q) ||
        (id.siret || '').toLowerCase().includes(q) ||
        // Thématique + legacy
        (e.thematiqueLabel || '').toLowerCase().includes(q) ||
        (e.contact || '').toLowerCase().includes(q) ||
        (id.email || '').toLowerCase().includes(q) ||
        (id.telephone || '').toLowerCase().includes(q)
      )
    })
  }, [expositions, search])

  // Sélectionne un exposant pour détail
  const openDetail = (id) => { setSelectedId(id); setView('detail') }
  const openForm = (id = null) => { setEditingId(id); setView('form') }
  const backToList = () => { setView('list'); setSelectedId(null); setEditingId(null) }

  const selected = useMemo(
    () => (expositions || []).find(e => e.id === selectedId),
    [expositions, selectedId]
  )

  // ═══════════════════════════════════════════════════════════════════
  // VUE FORMULAIRE
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'form') {
    return <ExpoForm
      expo={editingId ? expositions.find(e => e.id === editingId) : null}
      thematiques={thematiques}
      tvaConfig={tvaConfig}
      eventId={currentEventId}
      onBack={backToList}
      onSaved={(id) => { setSelectedId(id); setView('detail') }}
    />
  }

  // ═══════════════════════════════════════════════════════════════════
  // VUE DÉTAIL
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'detail' && selected) {
    return <ExpoDetail
      expo={selected}
      organisateur={organisateur}
      eventId={currentEventId}
      onBack={backToList}
      onEdit={() => openForm(selected.id)}
    />
  }

  // ═══════════════════════════════════════════════════════════════════
  // VUE LISTE
  // ═══════════════════════════════════════════════════════════════════
  const stats = aggregateExpoStats(expositions)

  const empty = search
    ? <Empty icon={Search} title="Aucun résultat">Essayez un autre terme de recherche.</Empty>
    : (
      <Empty icon={Building2} title="Aucun exposant"
        action={
          <div className={s.emptyActions}>
            <Button icon={Plus} onClick={() => openForm()}>Ajouter un exposant</Button>
            {thematiques.length === 0 && (
              <p className={s.noticeInline}>
                <AlertCircle size={14} aria-hidden="true"/>
                <span>Configurez d'abord les <strong>thématiques d'exposition</strong> dans Paramètres.</span>
              </p>
            )}
          </div>
        }>
        Les exposants ajoutés ici apparaissent avec leurs frais, leurs paiements et leurs documents.
      </Empty>
    )

  return (
    <div className={s.page}>

      {/* Stats globales */}
      <div className={s.stats}>
        <Stat label="Total facturé" value={eur(stats.totalFacture)} icon={Receipt} tone="brand" onClick={() => setStatOpen('facture')}/>
        <Stat label="Encaissé" value={eur(stats.totalEncaisse)} icon={Wallet} tone="success" onClick={() => setStatOpen('encaisse')}/>
        <Stat label="Restant dû" value={eur(stats.totalRestant)} icon={Clock}
          tone={stats.totalRestant > 0 ? 'warning' : 'brand'} onClick={() => setStatOpen('restant')}/>
        <Stat label="Exposants" value={String((expositions || []).length)} icon={Building2} tone="brand" onClick={() => setStatOpen('nombre')}/>
      </div>

      {/* Décomposition des indicateurs (23/11/2026) : données déjà chargées, puis l'exposant en un toucher */}
      {statOpen && (() => {
        const list = expositions || []
        const parThem = (valueOf) => grouper(list, e => e.thematiqueLabel || 'Sans thématique', valueOf).filter(g => g.value)
          .map(g => ({ ...g, display: eur(g.value) }))
        const restants = list.filter(e => computeExpoRestant(e) > 0).sort((a, b) => computeExpoRestant(b) - computeExpoRestant(a))
        const STAT_NOM = { paye: 'Payé', acompte: 'Acompte versé', impaye: 'Impayé' }
        const conf = {
          facture: { title: 'Total facturé', icon: Receipt, value: eur(stats.totalFacture), sections: [
            { label: 'Par thématique', content: <Repartition rows={parThem(e => Number(e.montantTotal) || 0)} empty="Aucun exposant."/> },
          ] },
          encaisse: { title: 'Encaissé', icon: Wallet, value: eur(stats.totalEncaisse), sections: [
            { label: 'Par thématique', content: <Repartition rows={parThem(computeExpoPaye)} empty="Rien d'encaissé."/> },
            { label: 'Ce que compte ce chiffre', content: <Note>Acomptes et soldes enregistrés sur les fiches exposants.</Note> },
          ] },
          restant: { title: 'Restant dû', icon: Clock, value: eur(stats.totalRestant), sections: [
            restants.length > 0 && { label: restants.length > 8 ? 'Les 8 plus gros restes' : 'Exposants concernés', rows: restants.slice(0, 8).map(e => [expoDisplayName(e), eur(computeExpoRestant(e))]) },
            restants.length === 0 && { content: <Note>Tous les exposants sont à jour.</Note> },
          ] },
          nombre: { title: 'Exposants', icon: Building2, value: String(list.length), sections: [
            { label: 'Par statut de paiement', content: <Repartition money={false} rows={grouper(list, e => STAT_NOM[computeExpoStatut(e)] || computeExpoStatut(e), () => 1).map(g => ({ ...g, count: undefined }))} empty="Aucun exposant."/> },
          ] },
        }[statOpen]
        return <DetailSheet open onClose={() => setStatOpen(null)} {...conf} sections={nettoyer(conf.sections)}/>
      })()}

      {/* Recherche + bouton ajouter */}
      <div className={s.toolbar}>
        <div className={s.search}>
          <label htmlFor="expo-search" className={s.sr}>Rechercher un exposant</label>
          <Search size={16} className={s.searchIcon} aria-hidden="true"/>
          <input
            id="expo-search"
            type="search"
            placeholder="Nom, SIRET, thématique, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={s.searchInput}
          />
        </div>
        <Button icon={Plus} onClick={() => openForm()}>Ajouter</Button>
      </div>

      {/* Liste */}
      <Table
        rows={filteredExpos}
        onRowClick={(expo) => openDetail(expo.id)}
        empty={empty}
        columns={[
          { key: 'nom', label: 'Exposant', render: e => <span className={s.rowName}>{expoDisplayName(e)}</span> },
          { key: 'thematique', label: 'Thématique', render: e => e.thematiqueLabel || '—' },
          { key: 'montant', label: 'Montant', align: 'right', render: e => <span className={s.num}>{eur(e.montantTotal)}</span> },
          { key: 'statut', label: 'Statut', render: e => <StatutBadge expo={e}/> },
          { key: 'progress', label: 'Encaissé', render: e => <PayBar expo={e}/> },
        ]}
      />
    </div>
  )
}

// Barre de progression du paiement (part encaissée du total)
function PayBar({ expo }) {
  const statut = computeExpoStatut(expo)
  const percent = computeExpoPercent(expo)
  return (
    <span className={s.payBar} role="img" aria-label={`${percent} % encaissé`}>
      <span className={s.payTrack}>
        <span className={`${s.payFill} ${s['pay_' + statut] || ''}`} style={{ transform: `scaleX(${percent / 100})` }}/>
      </span>
      <span className={s.payPct}>{percent} %</span>
    </span>
  )
}
