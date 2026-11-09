/**
 * pages/admin/settings/RapportConfigPanel.jsx
 * Configuration du rapport de clôture : sections activées, filtres par section,
 * modale de génération avec réglages temporaires.
 */
import React, { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button, Dialog } from '../../../ui'
import { saveSettings } from '../../../firebase/service'
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
//   - onGenerate      : callback (sectionsOverride) -> Promise
//
// Le panneau de config interne est réutilisé avec `temporary=true` et
// `modalMode=true` pour qu'aucune sauvegarde Firestore ne se déclenche.
export function GenerateRapportModal({
  initialSections, sectionsKeys, buildDefault, staffList, menuList,
  categoriesList, spectateursList, reservationsList,
  currentEventId,
  onCancel, onGenerate,
}) {
  // État local indépendant de Firestore — clone profond pour ne pas muter
  // la config sauvegardée si on annule.
  const [sections, setSections] = useState(() =>
    JSON.parse(JSON.stringify(initialSections))
  )
  const [expandedSection, setExpandedSection] = useState(null)
  const [generating, setGenerating] = useState(false)

  const enabledCount = Object.values(sections).filter(s => s?.enabled).length

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await onGenerate(sections)
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
        <Button icon={FileText} onClick={handleGenerate} loading={generating}>
          {generating ? 'Génération en cours…' : 'Générer avec ces réglages'}
        </Button>
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
          temporary={true}
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
//   - Sauvegarder dans Firestore au moindre changement
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
  buildDefault, currentEventId, staffList,
  // Liste du menu pour le filtre de sélection d'articles (Lot Custom A)
  menuList = [],
  // Listes pour Lot Custom A2 — sélections précises supplémentaires
  categoriesList = [],
  spectateursList = [],
  reservationsList = [],
  // Si `temporary` est true, les modifications NE sont PAS sauvegardées dans
  // Firestore (mode modale au clic Générer — Lot 2b). Seulement le state
  // React local est mis à jour. Utile pour des overrides éphémères.
  temporary = false,
  // Mode modale : on cache le bouton de dépliage du panneau (toujours ouvert)
  // et on désactive le toggle global.
  modalMode = false,
}) {
  // Helper : update partiel d'une section + sauvegarde Firestore immédiate.
  // Patch peut contenir { enabled, periodFrom, ... } — merge avec la section.
  const updateSection = async (key, patch) => {
    const next = {
      ...sections,
      [key]: { ...sections[key], ...patch },
    }
    setSections(next)
    if (temporary) return  // mode modale : pas de persistance
    try {
      await saveSettings({ rapportSections: next }, currentEventId)
    } catch (e) { console.error('saveRapportSections:', e) }
  }

  // Helper "toutes activées" / "toutes désactivées" (conserve les filtres)
  const setAllEnabled = async (val) => {
    const next = Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, { ...v, enabled: val }])
    )
    setSections(next)
    if (temporary) return
    try {
      await saveSettings({ rapportSections: next }, currentEventId)
    } catch (e) {}
  }
  // Reset complet (par défaut)
  const [confirmReset, setConfirmReset] = useState(false)
  const resetAll = async () => {
    setConfirmReset(false)
    const def = buildDefault()
    setSections(def)
    if (temporary) return
    try {
      await saveSettings({ rapportSections: def }, currentEventId)
    } catch (e) {}
  }

  const enabledCount = Object.values(sections).filter(s => s?.enabled).length

  // En mode modale, le contenu est toujours visible (pas de toggle déplié)
  const showContent = modalMode ? true : configOpen

  return (
    <div style={{
      background: modalMode ? 'transparent' : 'var(--bg)',
      borderRadius: 8,
      border: modalMode ? 'none' : '0.5px solid var(--border)',
      marginBottom: modalMode ? 0 : 14,
      overflow: 'hidden',
    }}>
      {/* En-tête : titre + compteur + toggle dépliage (caché en mode modale) */}
      {!modalMode && (
        <button
          type="button"
          onClick={() => setConfigOpen(o => !o)}
          style={{
            width: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', fontFamily: 'var(--font)',
            color: 'var(--text)', fontSize: 13, fontWeight: 600,
          }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Sections et filtres du rapport
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--muted)',
            }}>
              ({enabledCount + 1}/{sectionsKeys.length + 1})
            </span>
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 16 }}>
            {configOpen ? '▾' : '▸'}
          </span>
        </button>
      )}

      {showContent && (
        <div style={{
          borderTop: modalMode ? 'none' : '0.5px solid var(--border)',
          padding: modalMode ? 0 : '10px 14px 14px',
        }}>
          {!modalMode && (
            <div style={{
              fontSize: 11, color: 'var(--muted)',
              marginBottom: 10, lineHeight: 1.5,
            }}>
              Cliquez sur une section pour configurer ses filtres. La couverture est toujours incluse.
              Les modifications sont sauvegardées automatiquement.
            </div>
          )}

          {/* Liste des sections avec leur ligne d'entête + panneau filtres déplié */}
          {sectionsKeys.map(({ key, label, desc, filters, availableFields }) => {
            const sec = sections[key] || { enabled: true }
            const isExpanded = expandedSection === key
            return (
              <div key={key} style={{
                marginBottom: 6, border: '0.5px solid var(--border)',
                borderRadius: 6, background: sec.enabled ? 'var(--bg)' : 'var(--bg2)',
                overflow: 'hidden',
              }}>
                {/* Ligne d'en-tête de la section */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                }}>
                  <input
                    type="checkbox"
                    checked={!!sec.enabled}
                    onChange={(e) => updateSection(key, { enabled: e.target.checked })}
                    style={{
                      width: 16, height: 16,
                      accentColor: 'var(--brand)',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: sec.enabled ? 'var(--text)' : 'var(--muted)',
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--muted)',
                      marginTop: 1, lineHeight: 1.3,
                    }}>
                      {desc}
                    </div>
                  </div>
                  {/* Bouton dépliage filtres (visible si la section a des filtres et est activée) */}
                  {filters && filters.length > 0 && sec.enabled && (
                    <button
                      type="button"
                      onClick={() => setExpandedSection(isExpanded ? null : key)}
                      style={{
                        padding: '4px 8px',
                        background: isExpanded ? 'var(--brand)' : 'var(--bg2)',
                        color: isExpanded ? '#fff' : 'var(--muted)',
                        border: '0.5px solid var(--border)',
                        borderRadius: 4,
                        fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'var(--font)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                      {isExpanded ? '▾ Filtres' : '▸ Filtres'}
                    </button>
                  )}
                </div>

                {/* Panneau filtres déplié — affiche les filtres spécifiques à cette section */}
                {isExpanded && filters && filters.length > 0 && sec.enabled && (
                  <div style={{
                    padding: '10px 12px 12px',
                    borderTop: '0.5px solid var(--border)',
                    background: 'var(--bg2)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
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
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setAllEnabled(true)}
              style={QUICK_BTN_STYLE}>
              Tout activer
            </button>
            <button type="button" onClick={() => setAllEnabled(false)}
              style={QUICK_BTN_STYLE}>
              Tout désactiver
            </button>
            <button type="button" onClick={() => setConfirmReset(true)}
              style={{ ...QUICK_BTN_STYLE, color: 'var(--red-dark)' }}>
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

// ─── Styles communs aux composants de filtre ───────────────────────────
const QUICK_BTN_STYLE = {
  padding: '6px 12px', background: 'var(--bg2)',
  border: '0.5px solid var(--border)', borderRadius: 6,
  fontSize: 11, fontWeight: 600, color: 'var(--text)',
  cursor: 'pointer', fontFamily: 'var(--font)',
}
const FILTER_LABEL_STYLE = {
  fontSize: 11, fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  marginBottom: 4, display: 'block',
}
const FILTER_INPUT_STYLE = {
  padding: '6px 8px', fontSize: 12,
  border: '0.5px solid var(--border)', borderRadius: 4,
  fontFamily: 'var(--font)', background: 'var(--bg)',
}

// ─── Composants de filtre — un par type ────────────────────────────────
// Période : 2 champs date HTML5 (du / au)
function FilterPeriod({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Période (laissez vide pour tout inclure)</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={sec.periodFrom || ''}
          onChange={e => onChange({ periodFrom: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
        <input type="date" value={sec.periodTo || ''}
          onChange={e => onChange({ periodTo: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
      </div>
    </div>
  )
}

// TopN : nombre d'articles à inclure (input number, min 1)
function FilterTopN({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Nombre maximum d'articles affichés</label>
      <input type="number" min={1} max={100}
        value={sec.topN ?? 20}
        onChange={e => onChange({ topN: Math.max(1, parseInt(e.target.value) || 20) })}
        style={{ ...FILTER_INPUT_STYLE, width: 100 }}/>
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
      <label style={FILTER_LABEL_STYLE}>
        Staff à exclure ({excluded.length} exclu{excluded.length > 1 ? 's' : ''})
      </label>
      {list.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          Aucun staff dans cet événement.
        </div>
      ) : (
        <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {list.map(s => {
            const email = s.email || s.id
            const isExcl = excluded.includes(email)
            return (
              <label key={email} style={{
                fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer',
                color: isExcl ? 'var(--red-dark)' : 'var(--text)',
              }}>
                <input type="checkbox" checked={isExcl}
                  onChange={() => toggle(email)}
                  style={{ accentColor: 'var(--red)' }}/>
                <span style={{ textDecoration: isExcl ? 'line-through' : 'none' }}>
                  {email}{s.nom ? ` (${s.nom})` : ''}
                </span>
              </label>
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
      <label style={FILTER_LABEL_STYLE}>
        Types de transactions {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4 }}>
        {allTypes.map(t => (
          <label key={t.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={selected.includes(t.key)}
              onChange={() => toggle(t.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {t.label}
          </label>
        ))}
      </div>
    </div>
  )
}

// Range montant en € (input number, converti en centimes au backend)
function FilterAmountRange({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Montant (€) — laissez vide pour ne pas filtrer</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min={0} step="0.01"
          placeholder="Min"
          value={sec.minEur ?? ''}
          onChange={e => onChange({ minEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
        <input type="number" min={0} step="0.01"
          placeholder="Max"
          value={sec.maxEur ?? ''}
          onChange={e => onChange({ maxEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
      </div>
    </div>
  )
}

// Range solde en €
function FilterSoldeRange({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Solde restant (€) — laissez vide pour ne pas filtrer</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min={0} step="0.01"
          placeholder="Min"
          value={sec.soldeMinEur ?? ''}
          onChange={e => onChange({ soldeMinEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
        <input type="number" min={0} step="0.01"
          placeholder="Max"
          value={sec.soldeMaxEur ?? ''}
          onChange={e => onChange({ soldeMaxEur: e.target.value })}
          style={{ ...FILTER_INPUT_STYLE, flex: 1 }}/>
      </div>
    </div>
  )
}

// Tri spectateurs
function FilterSortBy({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Trier par</label>
      <select value={sec.sortBy || 'solde'}
        onChange={e => onChange({ sortBy: e.target.value })}
        style={{ ...FILTER_INPUT_STYLE, width: '100%' }}>
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
      <label style={FILTER_LABEL_STYLE}>
        Statuts {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {allStatuses.map(s => (
          <label key={s.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={selected.includes(s.key)}
              onChange={() => toggle(s.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {s.label}
          </label>
        ))}
      </div>
    </div>
  )
}

// Type résa : spectateur, bénévole, ou tous
function FilterResaType({ sec, onChange }) {
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>Type de réservation</label>
      <select value={sec.resaType || 'all'}
        onChange={e => onChange({ resaType: e.target.value })}
        style={{ ...FILTER_INPUT_STYLE, width: '100%' }}>
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
      <label style={FILTER_LABEL_STYLE}>Actions à inclure (vide = toutes)</label>
      <input type="text"
        placeholder="ex: CREDIT, RETRAIT, ANNULATION_RESA"
        value={value}
        onChange={e => {
          const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          onChange({ auditActions: arr })
        }}
        style={{ ...FILTER_INPUT_STYLE, width: '100%' }}/>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
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
      <label style={FILTER_LABEL_STYLE}>
        Types d'utilisateur {selected.length === 0 ? '(tous)' : `(${selected.length} sélectionné${selected.length > 1 ? 's' : ''})`}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {allTypes.map(t => (
          <label key={t.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={selected.includes(t.key)}
              onChange={() => toggle(t.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {t.label}
          </label>
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
      <label style={FILTER_LABEL_STYLE}>
        Champs affichés ({currentSet.size}/{availableFields.length})
        {isAllByDefault && (
          <span style={{ marginLeft: 6, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
            (toutes par défaut)
          </span>
        )}
      </label>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4,
        marginBottom: 6,
      }}>
        {availableFields.map(f => (
          <label key={f.key} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
            color: currentSet.has(f.key) ? 'var(--text)' : 'var(--muted)',
          }}>
            <input type="checkbox" checked={currentSet.has(f.key)}
              onChange={() => toggle(f.key)}
              style={{ accentColor: 'var(--brand)' }}/>
            {f.label}
          </label>
        ))}
      </div>
      {/* Actions rapides */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAll(true)} disabled={allChecked && !isAllByDefault}
          style={{
            padding: '3px 8px', background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 4, fontSize: 10, color: 'var(--text)',
            cursor: (allChecked && !isAllByDefault) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)',
            opacity: (allChecked && !isAllByDefault) ? 0.5 : 1,
          }}>Tout</button>
        <button type="button" onClick={() => setAll(false)} disabled={noneChecked}
          style={{
            padding: '3px 8px', background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 4, fontSize: 10, color: 'var(--text)',
            cursor: noneChecked ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)', opacity: noneChecked ? 0.5 : 1,
          }}>Rien</button>
        {!isAllByDefault && (
          <button type="button" onClick={resetToDefault}
            style={{
              padding: '3px 8px', background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 4, fontSize: 10, color: 'var(--brand-dark)',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>↺ Défaut</button>
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
  // Si null = pas de filtre. Pour l'UI, on présente une case "Activer le filtre"
  // qui bascule entre null et [] (ou vice versa) pour éviter de matérialiser
  // une liste vide par accident.
  const filterActive = sec.articleSelection !== null && sec.articleSelection !== undefined
  const selectedIds = filterActive ? (sec.articleSelection || []) : []

  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        Sélection précise des articles
        {filterActive && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--brand-dark)', textTransform: 'none', letterSpacing: 0 }}>
            ({selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''} sur {list.length})
          </span>
        )}
      </label>
      {!filterActive ? (
        <div style={{
          background: 'var(--bg)', borderRadius: 4,
          border: '0.5px dashed var(--border)',
          padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
            Aucun filtre actif. Tous les articles seront inclus dans la section.
          </div>
          <button type="button" onClick={() => onChange({ articleSelection: [] })}
            style={{
              padding: '5px 12px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            Activer le filtre
          </button>
        </div>
      ) : (
        <>
          <TransferList
            items={list}
            selectedIds={selectedIds}
            onChange={(newIds) => onChange({ articleSelection: newIds })}
            placeholder="Rechercher un article…"
            emptyAvailableMessage="Aucun article dans le menu."
            emptySelectedMessage="Aucune sélection. La table sera vide."
          />
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <button type="button" onClick={() => onChange({ articleSelection: null })}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--muted)', fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline',
              }}>
              désactiver le filtre (inclure tous)
            </button>
          </div>
        </>
      )}
    </div>
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
      <label style={FILTER_LABEL_STYLE}>
        Ligne de total
        {total.enabled && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--brand-dark)', textTransform: 'none', letterSpacing: 0 }}>
            ({(total.columns || []).length} colonne{(total.columns || []).length > 1 ? 's' : ''} sommée{(total.columns || []).length > 1 ? 's' : ''}
            {total.groupBy ? ` + sous-totaux ${total.groupBy}` : ''})
          </span>
        )}
      </label>
      <div style={{
        background: 'var(--bg)', borderRadius: 4,
        border: '0.5px solid var(--border)', padding: 10,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!total.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            style={{ accentColor: 'var(--brand)' }}/>
          Afficher une ligne de total
        </label>

        {total.enabled && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
            {/* Label */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                Libellé
              </div>
              <input type="text"
                value={total.label || ''}
                onChange={e => update({ label: e.target.value })}
                placeholder="ex: Total"
                style={{
                  width: '100%', padding: '5px 8px', fontSize: 11,
                  border: '0.5px solid var(--border)', borderRadius: 4,
                  fontFamily: 'inherit', background: 'var(--bg)',
                  boxSizing: 'border-box',
                }}/>
            </div>

            {/* Position */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                Position
              </div>
              <select value={total.position || 'bottom'}
                onChange={e => update({ position: e.target.value })}
                style={{
                  width: '100%', padding: '5px 8px', fontSize: 11,
                  border: '0.5px solid var(--border)', borderRadius: 4,
                  fontFamily: 'inherit', background: 'var(--bg)',
                }}>
                <option value="bottom">En bas du tableau</option>
                <option value="top">En haut du tableau</option>
              </select>
            </div>

            {/* Colonnes à sommer */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                Colonnes à sommer
              </div>
              {summable.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Aucune colonne sommable détectée.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 4 }}>
                  {summable.map(f => (
                    <label key={f.key} style={{
                      fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer',
                    }}>
                      <input type="checkbox"
                        checked={(total.columns || []).includes(f.key)}
                        onChange={() => toggleColumn(f.key)}
                        style={{ accentColor: 'var(--brand)' }}/>
                      {f.label.replace(/^Colonne\s*:\s*/i, '')}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Lot Custom A2 — Sous-totaux par groupe */}
            {groupByOptions.length > 0 && (
              <div style={{ paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                  Sous-totaux par groupe
                </div>
                <select value={total.groupBy || ''}
                  onChange={e => update({ groupBy: e.target.value || null })}
                  style={{
                    width: '100%', padding: '5px 8px', fontSize: 11,
                    border: '0.5px solid var(--border)', borderRadius: 4,
                    fontFamily: 'inherit', background: 'var(--bg)', marginBottom: 6,
                  }}>
                  <option value="">Aucun (juste le total final)</option>
                  {groupByOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                {total.groupBy && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' }}>
                      Libellé des sous-totaux
                    </div>
                    <input type="text"
                      value={total.subtotalLabel || 'Sous-total'}
                      onChange={e => update({ subtotalLabel: e.target.value })}
                      placeholder="ex: Sous-total"
                      style={{
                        width: '100%', padding: '5px 8px', fontSize: 11,
                        border: '0.5px solid var(--border)', borderRadius: 4,
                        fontFamily: 'inherit', background: 'var(--bg)',
                        boxSizing: 'border-box',
                      }}/>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
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
}) {
  const filterActive = sec[fieldKey] !== null && sec[fieldKey] !== undefined
  return (
    <div>
      <label style={FILTER_LABEL_STYLE}>
        {label}
        {filterActive && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--brand-dark)', textTransform: 'none', letterSpacing: 0 }}>
            ({selectedCount} sélectionné{selectedCount > 1 ? 's' : ''} sur {totalCount})
          </span>
        )}
      </label>
      {!filterActive ? (
        <div style={{
          background: 'var(--bg)', borderRadius: 4,
          border: '0.5px dashed var(--border)',
          padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
            Aucun filtre actif. Tous les éléments seront inclus.
          </div>
          <button type="button" onClick={onActivate}
            style={{
              padding: '5px 12px', background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
            Activer le filtre
          </button>
        </div>
      ) : (
        <>
          {children}
          <div style={{ marginTop: 6, textAlign: 'right' }}>
            <button type="button" onClick={onDeactivate}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--muted)', fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit',
                textDecoration: 'underline',
              }}>
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
  const list = (spectateursList || []).map(s => ({
    id: s.id,
    label: s.nom || s.id || 'Sans nom',
    meta: s.id ? s.id : null,
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
  const list = (staffList || []).map(s => ({
    id: s.email || s.id || s.username || '—',
    label: s.email || s.username || s.id || 'Sans nom',
    meta: s.nom || s.role || null,
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
        <div style={{
          marginTop: 6, padding: '6px 8px',
          background: 'var(--amber-light)', borderRadius: 4,
          fontSize: 10, color: 'var(--amber-dark)', lineHeight: 1.4,
        }}>
          ⚠ Vous avez aussi {(sec.staffExclude || []).length} staff exclu(s) configuré(s).
          La sélection précise <strong>remplace</strong> ce filtre quand elle est active.
        </div>
      )}
    </FilterPreciseSelectionWrapper>
  )
}
