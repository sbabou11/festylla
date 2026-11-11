/**
 * pages/admin/settings/RapportConfigPanel.jsx
 * Configuration du rapport de clôture : sections activées, filtres par section,
 * modale de génération avec réglages temporaires.
 * Le panneau ne fait aucune écriture : RapportCloture enregistre automatiquement
 * `sections` (useAutosave) et passe l'état d'enregistrement via `saveStatus`.
 */
import React, { useState } from 'react'
import { FileText } from 'lucide-react'
import clsx from 'clsx'
import { Button, Dialog, ProgressButton } from '../../../ui'
import TransferList from '../../../components/TransferList'
import s from './settings.module.css'

// ════════════════════════════════════════════════════════════════════════
// GenerateRapportModal — Modale au clic "Générer le rapport"
// ════════════════════════════════════════════════════════════════════════
// Lot 2b — Permet à l'admin d'override la config sauvegardée pour cette
// génération uniquement. Les modifications dans la modale ne sont PAS
// persistées dans Firestore.
//
// Props :
//   - initialSections : config initiale (depuis Firestore)
//   - sectionsKeys    : metadata des sections (clés + filtres dispo)
//   - buildDefault    : fonction qui produit la config par défaut
//   - staffList       : liste du staff pour les filtres
//   - currentEventId  : ID événement courant
//   - onCancel        : callback fermeture sans action
//   - onGenerate      : callback (sectionsOverride) -> Promise, lève en cas d'échec
//   - onDone          : callback après une génération réussie (fermeture)
//
// Le panneau de config interne est réutilisé avec `modalMode=true` : il ne
// fait jamais d'écriture lui-même.
export function GenerateRapportModal({
  initialSections, sectionsKeys, buildDefault, staffList, menuList,
  categoriesList, spectateursList, reservationsList,
  currentEventId,
  onCancel, onGenerate, onDone,
}) {
  // État local indépendant de Firestore — clone profond pour ne pas muter
  // la config sauvegardée si on annule.
  const [sections, setSections] = useState(() =>
    JSON.parse(JSON.stringify(initialSections))
  )
  const [expandedSection, setExpandedSection] = useState(null)
  const [generating, setGenerating] = useState(false)

  const enabledCount = Object.values(sections).filter(s => s?.enabled).length

  // Le hook de génération signale ses étapes : le bouton affiche l'avancement.
  // Après succès, le bouton affiche « Rapport téléchargé » un instant puis la modale se ferme.
  const handleGenerate = async (report) => {
    setGenerating(true)
    try {
      await onGenerate(sections, report)
      setTimeout(() => onDone?.(), 1200)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog
      open
      onClose={generating ? undefined : onCancel}
      title="Générer le rapport de clôture"
      className={s.rapportDialog}
      footer={<>
        <Button variant="secondary" onClick={onCancel} disabled={generating}>Annuler</Button>
        <ProgressButton icon={FileText} onRun={handleGenerate} runningLabel="Génération en cours…" doneLabel="Rapport téléchargé">
          Générer avec ces réglages
        </ProgressButton>
      </>}
    >
      <div className={s.stack}>
        <div>
          <p className={s.text}>
            Ajustez les sections et filtres pour cette génération uniquement.
            La configuration sauvegardée dans Paramètres reste inchangée.
          </p>
          <p className={s.rapportCount}>
            {enabledCount + 1} section{enabledCount > 0 ? 's' : ''} incluse{enabledCount > 0 ? 's' : ''} (couverture + {enabledCount})
          </p>
        </div>

        {/* Le panneau de config interne en mode modale : aucune sauvegarde Firestore */}
        <RapportConfigPanel
          sections={sections}
          setSections={setSections}
          sectionsKeys={sectionsKeys}
          configOpen={true}
          setConfigOpen={() => {}}
          expandedSection={expandedSection}
          setExpandedSection={setExpandedSection}
          buildDefault={buildDefault}
          currentEventId={currentEventId}
          staffList={staffList}
          menuList={menuList}
          categoriesList={categoriesList}
          spectateursList={spectateursList}
          reservationsList={reservationsList}
          modalMode={true}
        />
      </div>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════
// RapportConfigPanel — Panneau de configuration du rapport de clôture
// ════════════════════════════════════════════════════════════════════════
// Lot 2 — Filtres par section. Permet au super_admin de :
//   - Activer/désactiver chaque section (toggle on/off)
//   - Déplier une section pour configurer ses filtres spécifiques
//   - Enregistrement automatique géré par le parent (RapportCloture)
//
// Filtres supportés par section (cf. RAPPORT_SECTIONS_KEYS.filters) :
//   - period       : 2 champs date YYYY-MM-DD
//   - topN         : nombre d'articles à inclure (input number)
//   - staffExclude : multi-select des emails de staff à exclure
//   - txTypes      : multi-checkboxes des types de transaction (credit, debit, ...)
//   - amountRange  : montant min/max en €
//   - soldeRange   : solde min/max en €
//   - sortBy       : single-select (solde/nom/tx)
//   - resaStatuses : multi-checkboxes des statuts résa
//   - resaType     : single-select (all/spec/benev)
//   - auditActions : input texte libre (CSV des actions)
//   - auditUserTypes : multi-checkboxes (admin, staff, spectateur, benevole, ...)
//
export default function RapportConfigPanel({
  sections, setSections, sectionsKeys,
  configOpen, setConfigOpen,
  expandedSection, setExpandedSection,
  buildDefault, staffList,
  // Liste du menu pour le filtre de sélection d'articles (Lot Custom A)
  menuList = [],
  // Listes pour Lot Custom A2 — sélections précises supplémentaires
  categoriesList = [],
  spectateursList = [],
  reservationsList = [],
  // Mode modale : on cache le bouton de dépliage du panneau (toujours ouvert)
  // et on désactive le toggle global.
  modalMode = false,
  // Pastille d'état d'enregistrement (SaveStatus) affichée dans l'en-tête
  saveStatus = null,
}) {
  // Helper : update partiel d'une section. Patch peut contenir { enabled, periodFrom, ... }.
  const updateSection = (key, patch) => {
    setSections(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  // Helper "toutes activées" / "toutes désactivées" (conserve les filtres)
  const setAllEnabled = (val) => {
    setSections(prev => Object.fromEntries(
      Object.entries(prev).map(([k, v]) => [k, { ...v, enabled: val }])
    ))
  }
  // Reset complet (par défaut)
  const [confirmReset, setConfirmReset] = useState(false)
  const resetAll = () => {
    setConfirmReset(false)
    setSections(buildDefault())
  }

  const enabledCount = Object.values(sections).filter(s => s?.enabled).length

  // En mode modale, le contenu est toujours visible (pas de toggle déplié)
  const showContent = modalMode ? true : configOpen

  return (
    <div className={clsx(s.rcPanel, modalMode && s.rcPanelModal)}>
      {/* En-tête : titre + compteur + toggle dépliage (caché en mode modale) */}
      {!modalMode && (
        <div className={s.rcHeadRow}>
          <button type="button" className={s.rcHead} onClick={() => setConfigOpen(o => !o)} aria-expanded={configOpen}>
            <span className={s.rcHeadTitle}>
              Sections et filtres du rapport
              <span className={s.rcHeadCount}>
                ({enabledCount + 1}/{sectionsKeys.length + 1})
              </span>
            </span>
            <span className={s.rcChevron}>
              {configOpen ? '▾' : '▸'}
            </span>
          </button>
          {saveStatus}
        </div>
      )}

      {showContent && (
        <div className={s.rcBody}>
          {!modalMode && (
            <div className={s.rcIntro}>
              Cliquez sur une section pour configurer ses filtres. La couverture est toujours incluse.
              Les modifications sont enregistrées automatiquement.
            </div>
          )}

          {/* Liste des sections avec leur ligne d'entête + panneau filtres déplié */}
          {sectionsKeys.map(({ key, label, desc, filters, availableFields }) => {
            const sec = sections[key] || { enabled: true }
            const isExpanded = expandedSection === key
            return (
              <div key={key} className={clsx(s.rcSection, !sec.enabled && s.rcSectionOff)}>
                {/* Ligne d'en-tête de la section */}
                <div className={s.rcSectionRow}>
                  <input
                    type="checkbox"
                    className={s.rcSectionCheck}
                    checked={!!sec.enabled}
                    onChange={(e) => updateSection(key, { enabled: e.target.checked })}
                    aria-label={label}
                  />
                  <div className={s.rcGrow}>
                    <div className={s.rcSectionLabel}>{label}</div>
                    <div className={s.rcSectionDesc}>{desc}</div>
                  </div>
                  {/* Bouton dépliage filtres (visible si la section a des filtres et est activée) */}
                  {filters && filters.length > 0 && sec.enabled && (
                    <button
                      type="button"
                      onClick={() => setExpandedSection(isExpanded ? null : key)}
                      className={clsx(s.rcFiltersBtn, isExpanded && s.rcFiltersBtnOn)}
                      aria-expanded={isExpanded}>
                      {isExpanded ? '▾ Filtres' : '▸ Filtres'}
                    </button>
                  )}
                </div>

                {/* Panneau filtres déplié — affiche les filtres spécifiques à cette section */}
                {isExpanded && filters && filters.length > 0 && sec.enabled && (
                  <div className={s.rcFilters}>
                    {filters.includes('period') && (
                      <FilterPeriod sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('topN') && (
                      <FilterTopN sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('staffExclude') && (
                      <FilterStaffExclude sec={sec} onChange={(p) => updateSection(key, p)} staffList={staffList}/>
                    )}
                    {filters.includes('txTypes') && (
                      <FilterTxTypes sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('amountRange') && (
                      <FilterAmountRange sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('soldeRange') && (
                      <FilterSoldeRange sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('sortBy') && (
                      <FilterSortBy sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('resaStatuses') && (
                      <FilterResaStatuses sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('resaType') && (
                      <FilterResaType sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('auditActions') && (
                      <FilterAuditActions sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('auditUserTypes') && (
                      <FilterAuditUserTypes sec={sec} onChange={(p) => updateSection(key, p)}/>
                    )}
                    {filters.includes('articleSelection') && (
                      <FilterArticleSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        menuList={menuList}/>
                    )}
                    {filters.includes('categorieSelection') && (
                      <FilterCategorieSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        categoriesList={categoriesList} menuList={menuList}/>
                    )}
                    {filters.includes('spectateurSelection') && (
                      <FilterSpectateurSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        spectateursList={spectateursList}/>
                    )}
                    {filters.includes('benevoleSelection') && (
                      <FilterBenevoleSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        reservationsList={reservationsList}/>
                    )}
                    {filters.includes('staffSelection') && (
                      <FilterStaffSelection sec={sec} onChange={(p) => updateSection(key, p)}
                        staffList={staffList}/>
                    )}
                    {filters.includes('totalRow') && (
                      <FilterTotalRow sec={sec} onChange={(p) => updateSection(key, p)}
                        availableFields={availableFields}
                        sectionKey={key}/>
                    )}
                    {filters.includes('fields') && availableFields && (
                      <FilterFields sec={sec} onChange={(p) => updateSection(key, p)}
                        availableFields={availableFields}/>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Boutons rapides */}
          <div className={s.rcQuickRow}>
            <button type="button" className={s.rcQuick} onClick={() => setAllEnabled(true)}>
              Tout activer
            </button>
            <button type="button" className={s.rcQuick} onClick={() => setAllEnabled(false)}>
              Tout désactiver
            </button>
            <button type="button" className={clsx(s.rcQuick, s.rcQuickDanger)} onClick={() => setConfirmReset(true)}>
              Réinitialiser filtres
            </button>
          </div>
        </div>
      )}

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title="Réinitialiser les filtres ?"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>Annuler</Button>
          <Button variant="danger" onClick={resetAll}>Réinitialiser</Button>
        </>}>
        Tous les filtres reprennent leurs valeurs par défaut.
      </Dialog>
    </div>
  )
}

// Libellé « (n sélectionné(s)) » ajouté à droite d'un libellé de filtre
const Count = ({ children }) => <span className={s.rcLabelCount}>{children}</span>

// Case à cocher compacte des filtres
function Check({ checked, onChange, children, className, danger = false }) {
  return (
    <label className={clsx(s.rcCheck, className)}>
      <input type="checkbox" checked={checked} onChange={onChange} className={danger ? s.rcCheckDanger : undefined}/>
      {children}
    </label>
  )
}

// ─── Composants de filtre — un par type ────────────────────────────────
// Période : 2 champs date HTML5 (du / au)
function FilterPeriod({ sec, onChange }) {
  return (
    <div>
      <label className={s.rcLabel}>Période (laissez vide pour tout inclure)</label>
      <div className={s.rcRange}>
        <input type="date" value={sec.periodFrom || ''}
          onChange={e => onChange({ periodFrom: e.target.value })}
          className={clsx(s.rcInput, s.rcGrow)}/>
        <span className={s.rcArrow}>→</span>
        <input type="date" value={sec.periodTo || ''}
          onChange={e => onChange({ periodTo: e.target.value })}
          className={clsx(s.rcInput, s.rcGrow)}/>
      </div>
    </div>
  )
}

// TopN : nombre d'articles à inclure (input number, min 1)
function FilterTopN({ sec, onChange }) {
  return (
    <div>
      <label className={s.rcLabel}>Nombre maximum d'articles affichés</label>
      <input type="number" min={1} max={100}
        value={sec.topN ?? 20}
        onChange={e => onChange({ topN: Math.max(1, parseInt(e.target.value) || 20) })}
        className={clsx(s.rcInput, s.rcInputNarrow)}/>
    </div>
  )
}

// Staff exclu : multi-select des emails à NE PAS inclure (cocher = exclure)
function FilterStaffExclude({ sec, onChange, staffList }) {
  const list = staffList || []
  const excluded = sec.staffExclude || []
  const toggle = (email) => {
    const next = excluded.includes(email)
      ? excluded.filter(e => e !== email)
      : [...excluded, email]
    onChange({ staffExclude: next })
  }
  return (
    <div>
      <label className={s.rcLabel}>
        Staff à exclure ({excluded.length} exclu{excluded.length > 1 ? 's' : ''})
      </label>
      {list.length === 0 ? (
        <div className={s.rcEmpty}>
          Aucun staff dans cet événement.
        </div>
      ) : (
        <div className={s.rcScrollList}>
          {list.map(st => {
            const email = st.email || st.id
            const isExcl = excluded.includes(email)
            return (
              <Check key={email} checked={isExcl} onChange={() => toggle(email)} danger
                className={clsx(s.rcCheckTight, isExcl && s.rcExcluded)}>
                <span>{email}{st.nom ? ` (${st.nom})` : ''}</span>
              </Check>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Types de transactions : multi-checkboxes
function FilterTxTypes({ sec, onChange }) {
  const allTypes = [
    { key: 'credit',           label: 'Crédit' },
    { key: 'debit',            label: 'Encaissement' },
    { key: 'retrait',          label: 'Retrait résa' },
    { key: 'reservation',      label: 'Réservation (création)' },
    { key: 'annulation',       label: 'Annulation' },
    { key: 'benev-retrait',    label: 'Retrait bénévole' },
    { key: 'benev-reservation',label: 'Résa bénévole' },
    { key: 'benev-annulation', label: 'Annul. bénévole' },
    { key: 'remboursement',    label: 'Remboursement' },
    { key: 'credit_correction',label: 'Correction crédit' },
  ]
  const selected = sec.txTypes || []
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange({ txTypes: next })
  }
  return (
    <div>
      <label className={s.rcLabel}>
        Types de transactions {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div className={s.rcChecksGrid}>
        {allTypes.map(t => (
          <Check key={t.key} checked={selected.includes(t.key)} onChange={() => toggle(t.key)}>
            {t.label}
          </Check>
        ))}
      </div>
    </div>
  )
}

// Range montant en € (input number, converti en centimes au backend)
function FilterAmountRange({ sec, onChange }) {
  return (
    <div>
      <label className={s.rcLabel}>Montant (€) — laissez vide pour ne pas filtrer</label>
      <div className={s.rcRange}>
        <input type="number" min={0} step="0.01"
          placeholder="Min"
          value={sec.minEur ?? ''}
          onChange={e => onChange({ minEur: e.target.value })}
          className={clsx(s.rcInput, s.rcGrow)}/>
        <span className={s.rcArrow}>→</span>
        <input type="number" min={0} step="0.01"
          placeholder="Max"
          value={sec.maxEur ?? ''}
          onChange={e => onChange({ maxEur: e.target.value })}
          className={clsx(s.rcInput, s.rcGrow)}/>
      </div>
    </div>
  )
}

// Range solde en €
function FilterSoldeRange({ sec, onChange }) {
  return (
    <div>
      <label className={s.rcLabel}>Solde restant (€) — laissez vide pour ne pas filtrer</label>
      <div className={s.rcRange}>
        <input type="number" min={0} step="0.01"
          placeholder="Min"
          value={sec.soldeMinEur ?? ''}
          onChange={e => onChange({ soldeMinEur: e.target.value })}
          className={clsx(s.rcInput, s.rcGrow)}/>
        <span className={s.rcArrow}>→</span>
        <input type="number" min={0} step="0.01"
          placeholder="Max"
          value={sec.soldeMaxEur ?? ''}
          onChange={e => onChange({ soldeMaxEur: e.target.value })}
          className={clsx(s.rcInput, s.rcGrow)}/>
      </div>
    </div>
  )
}

// Tri spectateurs
function FilterSortBy({ sec, onChange }) {
  return (
    <div>
      <label className={s.rcLabel}>Trier par</label>
      <select value={sec.sortBy || 'solde'}
        onChange={e => onChange({ sortBy: e.target.value })}
        className={clsx(s.rcInput, s.rcInputFull)}>
        <option value="solde">Solde restant (décroissant)</option>
        <option value="nom">Nom (alphabétique)</option>
        <option value="tx">Nombre de transactions</option>
      </select>
    </div>
  )
}

// Statuts de réservation : multi-checkboxes
function FilterResaStatuses({ sec, onChange }) {
  const allStatuses = [
    { key: 'pending',    label: 'En attente' },
    { key: 'processing', label: 'En préparation' },
    { key: 'ready',      label: 'Prête' },
    { key: 'collected',  label: 'Retirée' },
    { key: 'cancelled',  label: 'Annulée' },
  ]
  const selected = sec.resaStatuses || []
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange({ resaStatuses: next })
  }
  return (
    <div>
      <label className={s.rcLabel}>
        Statuts {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div className={s.rcChecksWrap}>
        {allStatuses.map(st => (
          <Check key={st.key} checked={selected.includes(st.key)} onChange={() => toggle(st.key)}>
            {st.label}
          </Check>
        ))}
      </div>
    </div>
  )
}

// Type résa : spectateur, bénévole, ou tous
function FilterResaType({ sec, onChange }) {
  return (
    <div>
      <label className={s.rcLabel}>Type de réservation</label>
      <select value={sec.resaType || 'all'}
        onChange={e => onChange({ resaType: e.target.value })}
        className={clsx(s.rcInput, s.rcInputFull)}>
        <option value="all">Tous</option>
        <option value="spec">Spectateurs uniquement</option>
        <option value="benev">Bénévoles uniquement</option>
      </select>
    </div>
  )
}

// Actions d'audit : input texte libre (CSV des actions à inclure)
function FilterAuditActions({ sec, onChange }) {
  const value = (sec.auditActions || []).join(', ')
  return (
    <div>
      <label className={s.rcLabel}>Actions à inclure (vide = toutes)</label>
      <input type="text"
        placeholder="ex: CREDIT, RETRAIT, ANNULATION_RESA"
        value={value}
        onChange={e => {
          const arr = e.target.value.split(',').map(x => x.trim()).filter(Boolean)
          onChange({ auditActions: arr })
        }}
        className={clsx(s.rcInput, s.rcInputFull)}/>
      <div className={s.rcHelp}>
        Séparez par des virgules. Sensible à la casse.
      </div>
    </div>
  )
}

// Types user audit : multi-checkboxes
function FilterAuditUserTypes({ sec, onChange }) {
  const allTypes = [
    { key: 'admin',      label: 'Admin' },
    { key: 'staff',      label: 'Staff' },
    { key: 'spectateur', label: 'Spectateur' },
    { key: 'benevole',   label: 'Bénévole' },
    { key: 'system',     label: 'Système' },
  ]
  const selected = sec.auditUserTypes || []
  const toggle = (key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key]
    onChange({ auditUserTypes: next })
  }
  return (
    <div>
      <label className={s.rcLabel}>
        Types d'utilisateur {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div className={s.rcChecksWrap}>
        {allTypes.map(t => (
          <Check key={t.key} checked={selected.includes(t.key)} onChange={() => toggle(t.key)}>
            {t.label}
          </Check>
        ))}
      </div>
    </div>
  )
}

// Lot 3 — Champs (colonnes/KPIs/graphiques) à inclure dans la section.
// `availableFields` est passé par section depuis RAPPORT_SECTIONS_KEYS.
// La valeur stockée :
//   - null     = toutes les colonnes (rétro-compat avec rapports antérieurs au Lot 3)
//   - []       = aucune colonne (section apparaît avec juste le titre)
//   - [k1,k2…] = liste explicite des colonnes activées
function FilterFields({ sec, onChange, availableFields }) {
  // Si `fields` est null (état par défaut), on considère toutes les colonnes
  // comme cochées dans l'UI. Dès que l'admin coche/décoche, on bascule vers
  // une liste explicite.
  const isAllByDefault = sec.fields === null || sec.fields === undefined
  const currentSet = isAllByDefault
    ? new Set(availableFields.map(f => f.key))
    : new Set(sec.fields || [])

  const toggle = (fieldKey) => {
    // Si on était en "tout par défaut", on matérialise d'abord la liste complète
    let base = isAllByDefault
      ? availableFields.map(f => f.key)
      : (sec.fields || [])
    const setOfBase = new Set(base)
    if (setOfBase.has(fieldKey)) setOfBase.delete(fieldKey)
    else setOfBase.add(fieldKey)
    onChange({ fields: Array.from(setOfBase) })
  }

  const setAll = (value) => {
    if (value) {
      onChange({ fields: availableFields.map(f => f.key) })
    } else {
      onChange({ fields: [] })
    }
  }
  const resetToDefault = () => onChange({ fields: null })

  const allChecked = currentSet.size === availableFields.length
  const noneChecked = currentSet.size === 0

  return (
    <div>
      <label className={s.rcLabel}>
        Champs affichés ({currentSet.size}/{availableFields.length})
        {isAllByDefault && (
          <span className={s.rcLabelNote}>
            (toutes par défaut)
          </span>
        )}
      </label>
      <div className={clsx(s.rcChecksGrid, s.rcMb6)}>
        {availableFields.map(f => (
          <Check key={f.key} checked={currentSet.has(f.key)} onChange={() => toggle(f.key)}
            className={!currentSet.has(f.key) ? s.rcMuted : undefined}>
            {f.label}
          </Check>
        ))}
      </div>
      {/* Actions rapides */}
      <div className={s.rcMiniRow}>
        <button type="button" className={s.rcMini} onClick={() => setAll(true)} disabled={allChecked && !isAllByDefault}>Tout</button>
        <button type="button" className={s.rcMini} onClick={() => setAll(false)} disabled={noneChecked}>Rien</button>
        {!isAllByDefault && (
          <button type="button" className={clsx(s.rcMini, s.rcMiniBrand)} onClick={resetToDefault}>↺ Défaut</button>
        )}
      </div>
    </div>
  )
}

// ─── Lot Custom A — Sélection précise d'articles via TransferList ───
// Le menu de l'événement est passé via la prop menuList. La valeur stockée :
//   - null     = pas de filtre (tous les articles inclus, comportement défaut)
//   - []       = aucun article sélectionné (table vide)
//   - [ids…]   = liste explicite des IDs articles à inclure
function FilterArticleSelection({ sec, onChange, menuList }) {
  const list = (menuList || []).map(m => ({
    id: m.id || m.nom,    // certains items menu n'ont pas d'ID stable, on utilise nom
    label: m.nom || 'Sans nom',
    meta: (m.prix !== undefined) ? `${(m.prix / 100).toFixed(2)} €` : null,
  }))
  const selectedIds = (sec.articleSelection !== null && sec.articleSelection !== undefined)
    ? (sec.articleSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des articles"
      emptyText="Aucun filtre actif. Tous les articles seront inclus dans la section."
      sec={sec} fieldKey="articleSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ articleSelection: [] })}
      onDeactivate={() => onChange({ articleSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ articleSelection: newIds })}
        placeholder="Rechercher un article…"
        emptyAvailableMessage="Aucun article dans le menu."
        emptySelectedMessage="Aucune sélection. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// ─── Lot Custom A — Configuration de la ligne de total ───
// totalRow stockée dans la config : { enabled, label, position, columns, groupBy, subtotalLabel }
// - columns: liste des keys de colonnes à sommer (ex: ['qty', 'ca'])
// - groupBy: 'categorie' pour articles (sous-totaux par catégorie), null sinon
// - Les colonnes sommables sont déterminées par availableFields filtrées sur
//   celles qui ont du sens à sommer (qty, ca, total, montant, etc.) — pour
//   cette première version on présente toutes les colonnes, l'admin choisit.
// sectionKey est passé pour savoir si la section supporte le groupBy (articles uniquement).
function FilterTotalRow({ sec, onChange, availableFields, sectionKey }) {
  const total = sec.totalRow || { enabled: false, label: 'Total', position: 'bottom', columns: [] }
  const update = (patch) => onChange({ totalRow: { ...total, ...patch } })
  // Colonnes candidates au total : toutes celles qui ne sont pas un graphique
  // ou un KPI (heuristique : on garde celles qui ne commencent pas par 'kpi_'
  // et qui ne sont pas 'charts'/'bar_chart'/'pie_chart'/'kpis'/'tab_repartition'/
  // 'rank' et 'nom'/'who'/'label' (textuelles)).
  const NON_SUMMABLE = ['charts', 'bar_chart', 'pie_chart', 'kpis', 'tab_repartition',
    'rank', 'nom', 'who', 'label', 'date', 'heure', 'type', 'status', 'staff',
    'action', 'userType', 'code', 'id', 'email']
  const summable = (availableFields || []).filter(f =>
    !f.key.startsWith('kpi_') && !NON_SUMMABLE.includes(f.key)
  )

  // Seul Articles supporte le groupBy par catégorie pour cette livraison.
  // Plus tard on pourra étendre (par staff, par statut, etc.)
  const groupByOptions = []
  if (sectionKey === 'articles') {
    groupByOptions.push({ key: 'categorie', label: 'Par catégorie' })
  }

  const toggleColumn = (key) => {
    const current = total.columns || []
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key]
    update({ columns: next })
  }

  return (
    <div>
      <label className={s.rcLabel}>
        Ligne de total
        {total.enabled && (
          <Count>
            ({(total.columns || []).length} colonne{(total.columns || []).length > 1 ? 's' : ''} sommée{(total.columns || []).length > 1 ? 's' : ''}
            {total.groupBy ? ` + sous-totaux ${total.groupBy}` : ''})
          </Count>
        )}
      </label>
      <div className={s.rcBox}>
        <Check checked={!!total.enabled} onChange={e => update({ enabled: e.target.checked })} className={s.rcCheckLg}>
          Afficher une ligne de total
        </Check>

        {total.enabled && (
          <div className={s.rcDivided}>
            {/* Label */}
            <div className={s.rcMb8}>
              <div className={s.rcSubLabel}>Libellé</div>
              <input type="text"
                value={total.label || ''}
                onChange={e => update({ label: e.target.value })}
                placeholder="ex: Total"
                className={s.rcInputSm}/>
            </div>

            {/* Position */}
            <div className={s.rcMb8}>
              <div className={s.rcSubLabel}>Position</div>
              <select value={total.position || 'bottom'}
                onChange={e => update({ position: e.target.value })}
                className={s.rcInputSm}>
                <option value="bottom">En bas du tableau</option>
                <option value="top">En haut du tableau</option>
              </select>
            </div>

            {/* Colonnes à sommer */}
            <div className={s.rcMb8}>
              <div className={s.rcSubLabel}>Colonnes à sommer</div>
              {summable.length === 0 ? (
                <div className={s.rcEmpty}>
                  Aucune colonne sommable détectée.
                </div>
              ) : (
                <div className={s.rcChecksGrid}>
                  {summable.map(f => (
                    <Check key={f.key} checked={(total.columns || []).includes(f.key)} onChange={() => toggleColumn(f.key)}>
                      {f.label.replace(/^Colonne\s*:\s*/i, '')}
                    </Check>
                  ))}
                </div>
              )}
            </div>

            {/* Lot Custom A2 — Sous-totaux par groupe */}
            {groupByOptions.length > 0 && (
              <div className={s.rcDividedTop}>
                <div className={s.rcSubLabel}>Sous-totaux par groupe</div>
                <select value={total.groupBy || ''}
                  onChange={e => update({ groupBy: e.target.value || null })}
                  className={clsx(s.rcInputSm, s.rcMb6)}>
                  <option value="">Aucun (juste le total final)</option>
                  {groupByOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                {total.groupBy && (
                  <div>
                    <div className={s.rcSubLabel}>Libellé des sous-totaux</div>
                    <input type="text"
                      value={total.subtotalLabel || 'Sous-total'}
                      onChange={e => update({ subtotalLabel: e.target.value })}
                      placeholder="ex: Sous-total"
                      className={s.rcInputSm}/>
                    <div className={s.rcHelpItalic}>
                      Le libellé est suivi du nom du groupe (ex: "Sous-total Boissons")
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Lot Custom A2 — Composants TransferList pour les autres sources
// ════════════════════════════════════════════════════════════════════════

// Pattern commun pour les filtres de sélection précise par TransferList.
// Centralise le toggle d'activation (null → []) et le rendu du wrapper.
function FilterPreciseSelectionWrapper({
  label, sec, fieldKey, totalCount, selectedCount, onActivate, onDeactivate, children,
  emptyText = 'Aucun filtre actif. Tous les éléments seront inclus.',
}) {
  const filterActive = sec[fieldKey] !== null && sec[fieldKey] !== undefined
  return (
    <div>
      <label className={s.rcLabel}>
        {label}
        {filterActive && (
          <Count>
            ({selectedCount} sélectionné{selectedCount > 1 ? 's' : ''} sur {totalCount})
          </Count>
        )}
      </label>
      {!filterActive ? (
        <div className={s.rcInactive}>
          <div className={s.rcInactiveText}>{emptyText}</div>
          <button type="button" className={s.rcActivate} onClick={onActivate}>
            Activer le filtre
          </button>
        </div>
      ) : (
        <>
          {children}
          <div className={s.rcDeactivateRow}>
            <button type="button" className={s.rcLink} onClick={onDeactivate}>
              désactiver le filtre (inclure tous)
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Sélection par catégorie d'articles (utilise le nom de catégorie comme clé)
function FilterCategorieSelection({ sec, onChange, categoriesList, menuList }) {
  // Affiche les catégories du store, avec en métadonnée le nb d'articles
  // de cette catégorie dans le menu.
  const list = (categoriesList || []).map(c => {
    const count = (menuList || []).filter(m => m.cat === c.nom).length
    return {
      id: c.nom,                                        // clé = nom (cohérent avec menu[i].cat)
      label: c.nom || 'Sans nom',
      meta: `${count} article${count > 1 ? 's' : ''}`,
    }
  })
  const filterActive = sec.categorieSelection !== null && sec.categorieSelection !== undefined
  const selectedIds = filterActive ? (sec.categorieSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des catégories"
      sec={sec} fieldKey="categorieSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ categorieSelection: [] })}
      onDeactivate={() => onChange({ categorieSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ categorieSelection: newIds })}
        placeholder="Rechercher une catégorie…"
        emptyAvailableMessage="Aucune catégorie configurée."
        emptySelectedMessage="Aucune catégorie sélectionnée. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// Sélection par spectateur (utilise l'ID FY-XXXX comme clé)
function FilterSpectateurSelection({ sec, onChange, spectateursList }) {
  const list = (spectateursList || []).map(sp => ({
    id: sp.id,
    label: sp.nom || sp.id || 'Sans nom',
    meta: sp.id ? sp.id : null,
  }))
  const filterActive = sec.spectateurSelection !== null && sec.spectateurSelection !== undefined
  const selectedIds = filterActive ? (sec.spectateurSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des spectateurs"
      sec={sec} fieldKey="spectateurSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ spectateurSelection: [] })}
      onDeactivate={() => onChange({ spectateurSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ spectateurSelection: newIds })}
        placeholder="Rechercher par nom ou ID…"
        emptyAvailableMessage="Aucun spectateur."
        emptySelectedMessage="Aucun spectateur sélectionné. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// Sélection par bénévole (extraits des résas car pas de collection benevoles côté store)
function FilterBenevoleSelection({ sec, onChange, reservationsList }) {
  // Construit la liste unique des bénévoles depuis les résas
  const benevMap = new Map()
  for (const r of (reservationsList || [])) {
    const id = r.benevoleId
    const nom = r.benevoleNom
    if (id && !benevMap.has(id)) {
      benevMap.set(id, { id, label: nom || id, meta: null })
    }
  }
  const list = Array.from(benevMap.values()).sort((a, b) =>
    (a.label || '').localeCompare(b.label || '')
  )
  const filterActive = sec.benevoleSelection !== null && sec.benevoleSelection !== undefined
  const selectedIds = filterActive ? (sec.benevoleSelection || []) : []

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise des bénévoles"
      sec={sec} fieldKey="benevoleSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ benevoleSelection: [] })}
      onDeactivate={() => onChange({ benevoleSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ benevoleSelection: newIds })}
        placeholder="Rechercher un bénévole…"
        emptyAvailableMessage="Aucun bénévole avec résa."
        emptySelectedMessage="Aucun bénévole sélectionné. La table sera vide."
      />
    </FilterPreciseSelectionWrapper>
  )
}

// Sélection précise par staff (utilise l'email comme clé, comme staffExclude)
// Cohabite avec staffExclude : si staffSelection est actif (non null), il prend
// priorité ; sinon staffExclude continue de fonctionner. Cela évite la confusion
// de deux filtres opposés actifs simultanément.
function FilterStaffSelection({ sec, onChange, staffList }) {
  const list = (staffList || []).map(st => ({
    id: st.email || st.id || st.username || '—',
    label: st.email || st.username || st.id || 'Sans nom',
    meta: st.nom || st.role || null,
  }))
  const filterActive = sec.staffSelection !== null && sec.staffSelection !== undefined
  const selectedIds = filterActive ? (sec.staffSelection || []) : []
  const hasExclude = (sec.staffExclude || []).length > 0

  return (
    <FilterPreciseSelectionWrapper
      label="Sélection précise du staff (prioritaire sur exclusion)"
      sec={sec} fieldKey="staffSelection"
      totalCount={list.length} selectedCount={selectedIds.length}
      onActivate={() => onChange({ staffSelection: [] })}
      onDeactivate={() => onChange({ staffSelection: null })}>
      <TransferList
        items={list}
        selectedIds={selectedIds}
        onChange={(newIds) => onChange({ staffSelection: newIds })}
        placeholder="Rechercher par email ou nom…"
        emptyAvailableMessage="Aucun staff dans cet événement."
        emptySelectedMessage="Aucun staff sélectionné. La table sera vide."
      />
      {hasExclude && (
        <div className={s.rcWarn}>
          ⚠ Vous avez aussi {(sec.staffExclude || []).length} staff exclu(s) configuré(s).
          La sélection précise <strong>remplace</strong> ce filtre quand elle est active.
        </div>
      )}
    </FilterPreciseSelectionWrapper>
  )
}
