/**
 * pages/admin/settings/RapportCloture.jsx
 * Rapport de clôture PDF : sections et filtres, pages personnalisées, génération
 * rapide (config sauvegardée) ou avec réglages temporaires.
 */
import React, { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { Button, Card, toast } from '../../../ui'
import useAppStore from '../../../store/useAppStore'
import { useRapportCloture } from '../../../hooks/useRapportCloture'
import { getSettings, saveSettings } from '../../../firebase/service'
import { friendlyError } from '../../../utils/errors'
import CustomPagesEditor from '../../../components/CustomPagesEditor'
import RapportConfigPanel, { GenerateRapportModal } from './RapportConfigPanel'
import { RAPPORT_SECTIONS_KEYS, buildDefaultSections, normalizeSections } from './rapportSections'
import s from './settings.module.css'

export default function RapportCloture({ currentEventId }) {
  // Listes pour les filtres du rapport et l'aperçu des tableaux custom
  const staff = useAppStore(st => st.staff)
  const menu = useAppStore(st => st.menu)
  const categories = useAppStore(st => st.categories)
  const spectateurs = useAppStore(st => st.spectateurs)
  const reservations = useAppStore(st => st.reservations)
  const logs = useAppStore(st => st.logs)

  const { generer: genererRapportCloture } = useRapportCloture()
  const [generatingPdf, setGeneratingPdf] = useState(false)
  // Modale de génération avec override
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  // Stocké dans events/{eventId}/settings/global.rapportSections.
  const [rapportSections, setRapportSections] = useState(() => buildDefaultSections())
  // Pages personnalisées : settings.rapportCustomPages = [{ id, titre, sousTitre, position, tables: [] }]
  const [rapportCustomPages, setRapportCustomPages] = useState([])
  // Panneau de config replié par défaut (pour ne pas encombrer la vue)
  const [rapportConfigOpen, setRapportConfigOpen] = useState(false)
  // Quelle section est dépliée pour montrer ses filtres (null = aucune)
  const [expandedSection, setExpandedSection] = useState(null)

  useEffect(() => {
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
    }).catch(() => {})
    return () => { cancelled = true }
  }, [currentEventId])

  // Sauvegarde immédiate — les pages changent rarement
  const saveCustomPages = async (next) => {
    setRapportCustomPages(next)
    try {
      await saveSettings({ rapportCustomPages: next }, currentEventId)
    } catch (e) { toast.error(friendlyError(e, "Les pages personnalisées n'ont pas été enregistrées.")) }
  }

  const handlePdf = async () => {
    setGeneratingPdf(true)
    try { await genererRapportCloture() }
    catch (e) { toast.error(friendlyError(e, "Le rapport de clôture n'a pas été généré."), { action: { label: 'Réessayer', onClick: () => handlePdf() } }) }
    finally { setGeneratingPdf(false) }
  }

  return (
    <>
      <Card className={`${s.brandCard} yc-settings-wide`} title={<span className={s.cardTitle}><FileText size={16}/>Rapport de clôture PDF</span>}>
        <div className={s.stack}>
          <p className={s.text}>
            Génère un rapport PDF complet de l'événement : récapitulatif financier, réconciliation comptable, top articles, statistiques par stand, toutes les transactions, spectateurs & soldes restants, réservations et journal d'audit complet.
          </p>

          {/* Panneau de configuration des sections : un bloc dépliable par section,
              sauvegarde Firestore immédiate à chaque changement. */}
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
          />

          {/* Pages personnalisées */}
          <div className={s.block}>
            <span className={s.cardTitle}><FileText size={15}/>Pages personnalisées</span>
            <CustomPagesEditor
              pages={rapportCustomPages}
              onChange={saveCustomPages}
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
            <Button icon={FileText} onClick={handlePdf} loading={generatingPdf}>
              {generatingPdf ? 'Génération en cours…' : 'Générer (config sauvegardée)'}
            </Button>
            <Button variant="secondary" icon={FileText} onClick={() => setShowGenerateModal(true)} disabled={generatingPdf}>
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
          onGenerate={async (overrideSections) => {
            try {
              await genererRapportCloture(overrideSections)
              setShowGenerateModal(false)
            } catch (e) {
              toast.error(friendlyError(e, "Le rapport de clôture n'a pas été généré."))
            }
          }}
        />
      )}
    </>
  )
}
