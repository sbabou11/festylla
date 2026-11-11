/**
 * pages/admin/settings/RapportCloture.jsx
 * Rapport de clôture PDF : sections et filtres, pages personnalisées, génération
 * rapide (config sauvegardée) ou avec réglages temporaires.
 * Sections et pages personnalisées sont enregistrées automatiquement (800 ms après la saisie).
 */
import React, { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { Button, Card, ProgressButton, SaveStatus, toast } from '../../../ui'
import useAppStore from '../../../store/useAppStore'
import { useRapportCloture } from '../../../hooks/useRapportCloture'
import { useAutosave } from '../../../hooks/useAutosave'
import { getSettings, saveSettings } from '../../../firebase/service'
import { friendlyError } from '../../../utils/errors'
import CustomPagesEditor from '../../../components/CustomPagesEditor'
import RapportConfigPanel, { GenerateRapportModal } from './RapportConfigPanel'
import { RAPPORT_SECTIONS_KEYS, buildDefaultSections, normalizeSections } from './rapportSections'
import s from './settings.module.css'

const PENDING = ['dirty', 'saving', 'offline', 'error']

export default function RapportCloture({ currentEventId }) {
  // Listes pour les filtres du rapport et l'aperçu des tableaux custom
  const staff = useAppStore(st => st.staff)
  const menu = useAppStore(st => st.menu)
  const categories = useAppStore(st => st.categories)
  const spectateurs = useAppStore(st => st.spectateurs)
  const reservations = useAppStore(st => st.reservations)
  const logs = useAppStore(st => st.logs)

  const { generer: genererRapportCloture } = useRapportCloture()
  // Modale de génération avec override
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  // Stocké dans events/{eventId}/settings/global.rapportSections.
  const [rapportSections, setRapportSections] = useState(() => buildDefaultSections())
  // Pages personnalisées : settings.rapportCustomPages = [{ id, titre, sousTitre, position, tables: [] }]
  const [rapportCustomPages, setRapportCustomPages] = useState([])
  // Réglages lus : tant que ce n'est pas le cas, rien n'est enregistré
  const [loaded, setLoaded] = useState(false)
  // Panneau de config replié par défaut (pour ne pas encombrer la vue)
  const [rapportConfigOpen, setRapportConfigOpen] = useState(false)
  // Quelle section est dépliée pour montrer ses filtres (null = aucune)
  const [expandedSection, setExpandedSection] = useState(null)

  useEffect(() => {
    setLoaded(false)
    if (!currentEventId) return
    let cancelled = false
    getSettings(currentEventId).then(cfg => {
      if (cancelled) return
      // normalizeSections gère la rétro-compat avec le format booléen
      // et fournit les valeurs par défaut pour les clés manquantes.
      if (cfg?.rapportSections && typeof cfg.rapportSections === 'object') {
        setRapportSections(normalizeSections(cfg.rapportSections))
      }
      if (Array.isArray(cfg?.rapportCustomPages)) setRapportCustomPages(cfg.rapportCustomPages)
      setLoaded(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [currentEventId])

  // Enregistrement automatique : mêmes écritures qu'avant (saveSettings), regroupées après 800 ms
  const sectionsAuto = useAutosave(
    rapportSections,
    (v) => saveSettings({ rapportSections: v }, currentEventId),
    { enabled: loaded && !!currentEventId },
  )
  const pagesAuto = useAutosave(
    rapportCustomPages,
    (v) => saveSettings({ rapportCustomPages: v }, currentEventId),
    { enabled: loaded && !!currentEventId },
  )

  // La génération rapide relit la config en base : on y envoie d'abord la saisie en attente
  const flushPending = async () => {
    if (PENDING.includes(sectionsAuto.status)) await sectionsAuto.retry()
    if (PENDING.includes(pagesAuto.status)) await pagesAuto.retry()
  }

  // Le hook signale ses étapes de chargement → barre de progression
  const handlePdf = async (report) => {
    try {
      await flushPending()
      await genererRapportCloture(null, null, report)
    } catch (e) {
      toast.error(friendlyError(e, "Le rapport de clôture n'a pas été généré."))
      throw e
    }
  }

  const pagesStatus = <SaveStatus status={pagesAuto.status} savedAt={pagesAuto.savedAt} onRetry={pagesAuto.retry}/>

  return (
    <>
      <Card className={`${s.brandCard} yc-settings-wide`} title={<span className={s.cardTitle}><FileText size={16}/>Rapport de clôture PDF</span>}>
        <div className={s.stack}>
          <p className={s.text}>
            Génère un rapport PDF complet de l'événement : récapitulatif financier, réconciliation comptable, top articles, statistiques par stand, toutes les transactions, spectateurs & soldes restants, réservations et journal d'audit complet.
          </p>

          {/* Panneau de configuration des sections : un bloc dépliable par section,
              enregistré automatiquement. */}
          <RapportConfigPanel
            sections={rapportSections}
            setSections={setRapportSections}
            sectionsKeys={RAPPORT_SECTIONS_KEYS}
            configOpen={rapportConfigOpen}
            setConfigOpen={setRapportConfigOpen}
            expandedSection={expandedSection}
            setExpandedSection={setExpandedSection}
            buildDefault={buildDefaultSections}
            currentEventId={currentEventId}
            staffList={staff}
            menuList={menu}
            categoriesList={categories}
            spectateursList={spectateurs}
            reservationsList={reservations}
            saveStatus={<SaveStatus status={sectionsAuto.status} savedAt={sectionsAuto.savedAt} onRetry={sectionsAuto.retry}/>}
          />

          {/* Pages personnalisées */}
          <div className={s.block}>
            <div className={s.editorHead}>
              <span className={s.cardTitle}><FileText size={15}/>Pages personnalisées</span>
              {pagesStatus}
            </div>
            <CustomPagesEditor
              pages={rapportCustomPages}
              onChange={setRapportCustomPages}
              menuList={menu}
              categoriesList={categories}
              spectateursList={spectateurs}
              reservationsList={reservations}
              staffList={staff}
              transactionsList={logs}
            />
          </div>

          {/* Deux modes : rapide (config sauvegardée) ou avec réglages (override temporaire) */}
          <div className={s.actions}>
            <ProgressButton icon={FileText} onRun={handlePdf} runningLabel="Génération en cours…" doneLabel="Rapport téléchargé">
              Générer (config sauvegardée)
            </ProgressButton>
            <Button variant="secondary" icon={FileText} onClick={() => setShowGenerateModal(true)}>
              Générer avec réglages…
            </Button>
          </div>
        </div>
      </Card>

      {/* Modale de génération avec override */}
      {showGenerateModal && (
        <GenerateRapportModal
          initialSections={rapportSections}
          sectionsKeys={RAPPORT_SECTIONS_KEYS}
          buildDefault={buildDefaultSections}
          staffList={staff}
          menuList={menu}
          categoriesList={categories}
          spectateursList={spectateurs}
          reservationsList={reservations}
          currentEventId={currentEventId}
          onCancel={() => setShowGenerateModal(false)}
          onGenerate={async (overrideSections, report) => {
            try {
              // Les pages personnalisées sont relues en base : on y envoie la saisie en attente
              if (PENDING.includes(pagesAuto.status)) await pagesAuto.retry()
              await genererRapportCloture(overrideSections, null, report)
            } catch (e) {
              toast.error(friendlyError(e, "Le rapport de clôture n'a pas été généré."))
              throw e
            }
          }}
          onDone={() => setShowGenerateModal(false)}
        />
      )}
    </>
  )
}
