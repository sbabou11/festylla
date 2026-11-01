/**
 * pages/admin/Settings.jsx — v3
 * Super admin : paramètres + exports + réinitialisation complète événement
 */
import React, { useState } from 'react'
import { Download, FileSpreadsheet, Wand2, Save, AlertTriangle, ShieldAlert, Eye, EyeOff, FileText, Check, RefreshCw } from 'lucide-react'
import { useExport }             from '../../hooks/useExport'
import { migrerVersV2 }          from '../../utils/migrationV2'
import { migrerVersEvenement }   from '../../utils/migrationRacineVersEvent'
import useEventStore             from '../../store/useEventStore'
import { useRapportCloture } from '../../hooks/useRapportCloture'
import useAppStore   from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { db } from '../../firebase/config'
import {
  collection, getDocs, deleteDoc, doc,
  writeBatch, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { Button, Card, Dialog, toast } from '../../ui'
import s from './settings/settings.module.css'

// ── Réinitialisation complète Firebase ──────────────────────────────────────
// Collections dans events/{id} vs racine
const EVENT_COLS = {
  spectateurs:   { label: 'Comptes spectateurs & soldes', racine: false },
  transactions:  { label: 'Transactions',                  racine: false },
  reservations:  { label: 'Réservations',                  racine: false },
  menu:          { label: 'Carte & menu',                  racine: false },
  benevoles:     { label: 'Bénévoles',                     racine: false },
  notifications: { label: 'Notifications',                 racine: false },
  audit:         { label: "Journal d'audit",               racine: false },
  staff:         { label: 'Équipe / Staff',                racine: false, withRoot: true },
  categories:    { label: 'Catégories menu',               racine: false, withRoot: true },
  roles:         { label: 'Rôles utilisateurs',            racine: false },
  settings:      { label: 'Paramètres événement',          racine: false, settingsDoc: true },
}

async function resetEventData(eventId, toDelete = []) {
  if (!eventId) throw new Error('Aucun événement sélectionné')
  if (!toDelete.length) throw new Error('Aucun élément sélectionné')

  const deleteAll = async (docs) => {
    for (let i = 0; i < docs.length; i += 499) {
      const batch = writeBatch(db)
      docs.slice(i, i + 499).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  }

  for (const col of toDelete) {
    const cfg = EVENT_COLS[col]
    if (!cfg) continue

    if (cfg.settingsDoc) {
      // Document unique events/{id}/settings/global
      const { deleteDoc, doc: docRef } = await import('firebase/firestore')
      await deleteDoc(docRef(db, 'events', eventId, 'settings', 'global')).catch(() => {})

    } else if (cfg.racine) {
      // Collection globale en racine uniquement
      const snap = await getDocs(collection(db, col))
      await deleteAll(snap.docs)

    } else {
      // Collection dans l'événement
      const snapEvent = await getDocs(collection(db, 'events', eventId, col))
      await deleteAll(snapEvent.docs)

      if (cfg.withRoot) {
        // Supprimer aussi le fallback racine (ex: /staff avant migration)
        const snapRoot = await getDocs(collection(db, col))
        await deleteAll(snapRoot.docs)
      }
    }
  }

  // Log (sauf si on supprime l'audit lui-même)
  if (!toDelete.includes('audit')) {
    await addDoc(collection(db, 'events', eventId, 'audit'), {
      action: 'RESET_EVENT',
      elements: toDelete,
      date: new Date().toISOString(),
      createdAt: serverTimestamp(),
    })
  }
}

export default function Settings() {
  const { theme, updateTheme } = useAppStore()
  const { user }               = useAuthStore()
  const { currentEventId }     = useEventStore()
  const { exportTransactionsCsv, exportRapportExcel, exportAuditCsv } = useExport()
  const { generer: genererRapportCloture } = useRapportCloture()
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [migratingV2,   setMigratingV2]   = useState(false)
  const [migrV2Log,     setMigrV2Log]     = useState([])
  const [migrV2Done,    setMigrV2Done]    = useState(false)
  const [migrating,     setMigrating]     = useState(false)
  const [migrLog,       setMigrLog]       = useState([])
  const [migrDone,      setMigrDone]      = useState(false)

  const [festName, setFestName]     = useState(theme?.festName || 'YllaCash')
  const [saved, setSaved]           = useState(false)
  const [exporting, setExporting]   = useState(null)

  // Reset event
  const [resetOpen, setResetOpen]   = useState(false)
  const [resetPwd, setResetPwd]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [toDelete, setToDelete]     = useState([])
  const [resetStep, setResetStep]   = useState('confirm') // confirm | running | done | error
  const [resetError, setResetError] = useState('')
  const [confirmV2, setConfirmV2]   = useState(false)

  const handleSave = () => {
    updateTheme({ festName })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleCsv   = () => { setExporting('csv');   try { exportTransactionsCsv() }   finally { setTimeout(() => setExporting(null), 800)  } }
  const handleAudit = async () => { setExporting('audit'); try { await exportAuditCsv() } finally { setTimeout(() => setExporting(null), 1000) } }
  const handleExcel = async () => { setExporting('excel'); try { await exportRapportExcel() } finally { setTimeout(() => setExporting(null), 1200) } }

  const handleReset = async () => {
    if (!resetPwd.trim())   { setResetError('Mot de passe requis.'); return }
    if (!currentEventId)    { setResetError('Aucun événement sélectionné.'); return }
    if (!toDelete.length)   { setResetError('Sélectionnez au moins un élément à supprimer.'); return }
    setResetStep('running')
    setResetError('')
    try {
      await resetEventData(currentEventId, toDelete)
      setResetStep('done')
    } catch (e) {
      setResetError('Erreur : ' + e.message)
      setResetStep('error')
    }
  }

  const closeReset = () => {
    setResetOpen(false)
    setResetPwd('')
    setResetStep('confirm')
    setResetError('')
  }

  // Migration v2 : confirmation par Dialog (remplace window.confirm)
  const runMigrationV2 = async () => {
    setConfirmV2(false)
    setMigratingV2(true); setMigrV2Log([])
    try {
      await migrerVersV2(currentEventId, msg => setMigrV2Log(prev => [...prev, msg]))
      setMigrV2Done(true)
    } catch (e) { setMigrV2Log(prev => [...prev, "✗ " + e.message]) }
    finally { setMigratingV2(false) }
  }

  const handlePdf = async () => {
    setGeneratingPdf(true)
    try { await genererRapportCloture() }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setGeneratingPdf(false) }
  }

  const title = (Icon, label) => <span className={s.cardTitle}><Icon size={16}/>{label}</span>
  const running = resetStep === 'running'

  return (
    <div className={s.page}>

      {/* Paramètres généraux */}
      <Card title={title(Save, 'Paramètres généraux')}>
        <div className={s.stack}>
          <label className={s.field}>
            <span className={s.label}>Nom du festival</span>
            <input className={s.input} value={festName} onChange={e => setFestName(e.target.value)}/>
          </label>
          <div className={s.grid}>
            <label className={s.field}>
              <span className={s.label}>1 € = X points</span>
              <input type="number" className={s.input} defaultValue={100}/>
            </label>
            <label className={s.field}>
              <span className={s.label}>Solde max (centimes)</span>
              <input type="number" className={s.input} defaultValue={10000}/>
            </label>
          </div>
          <div className={s.actions}>
            <Button icon={saved ? Check : Save} onClick={handleSave}>{saved ? 'Sauvegardé' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Card>

      {/* Exports */}
      <Card title={title(Download, 'Export des données')} subtitle="Générés côté client — aucun serveur requis.">
        <div className={s.actions}>
          <Button variant="secondary" icon={Download} onClick={handleCsv} disabled={!!exporting} loading={exporting === 'csv'}>
            {exporting === 'csv' ? 'Génération…' : 'Transactions (XLSX)'}
          </Button>
          <Button variant="secondary" icon={FileSpreadsheet} onClick={handleExcel} disabled={!!exporting} loading={exporting === 'excel'}>
            {exporting === 'excel' ? 'Génération…' : 'Rapport Excel'}
          </Button>
          <Button variant="secondary" icon={Download} onClick={handleAudit} disabled={!!exporting} loading={exporting === 'audit'}>
            {exporting === 'audit' ? 'Génération…' : "Journal d’audit (XLSX)"}
          </Button>
        </div>
      </Card>

      {/* Studio */}
      <Card className={s.brandCard} title={title(Wand2, 'Personnalisation visuelle')}>
        <p className={s.text}>
          Ouvrez le <strong>Studio</strong> via le bouton en haut à droite pour personnaliser couleurs, logo, typographie et QR code.
        </p>
      </Card>

      {/* ── MIGRATION V2 — staff/categories/benevoles dans l'événement ── */}
      {currentEventId && user?.role === 'super_admin' && (
        <Card className={s.purpleCard} title={title(RefreshCw, 'Migration architecture v2')}>
          <div className={s.stack}>
            <p className={s.text}>
              Migre staff, bénévoles et catégories depuis la racine Firestore vers cet événement.
              À effectuer une seule fois après déploiement.
            </p>
            {migrV2Log.length > 0 && (
              <div className={s.log}>
                {migrV2Log.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
            {migrV2Done && <p className={s.ok}>Migration v2 terminée</p>}
            {!migrV2Done && (
              <div className={s.actions}>
                <Button icon={RefreshCw} onClick={() => setConfirmV2(true)} loading={migratingV2}>
                  {migratingV2 ? 'Migration en cours…' : 'Lancer la migration v2'}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── RAPPORT DE CLÔTURE ── */}
      <Card className={s.brandCard} title={title(FileText, 'Rapport de clôture PDF')}>
        <div className={s.stack}>
          <p className={s.text}>
            Génère un rapport PDF complet de l'événement : récapitulatif financier, réconciliation comptable, top articles, statistiques par stand, toutes les transactions, spectateurs & soldes restants, réservations et journal d'audit complet.
          </p>
          <div className={s.actions}>
            <Button icon={FileText} onClick={handlePdf} loading={generatingPdf}>
              {generatingPdf ? 'Génération en cours… (quelques secondes)' : 'Générer le rapport de clôture (PDF)'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── ZONE DANGER — Réinitialisation événement ── */}
      <Card className={s.dangerCard} title={title(ShieldAlert, 'Zone dangereuse — Réinitialisation')}>
        <div className={s.stack}>
          <p className={s.text}>
            Supprime définitivement toutes les transactions, réservations et comptes spectateurs. Action irréversible.
          </p>
          <div className={s.actions}>
            <Button variant="danger" icon={AlertTriangle} onClick={() => setResetOpen(true)}>Réinitialiser l'événement</Button>
          </div>
        </div>
      </Card>

      {/* Infos système */}
      <Card title="Informations système">
        <dl className={s.info}>
          {[
            ['Version',          '1.0.0'],
            ['PWA',              'serviceWorker' in navigator ? 'Supportée' : 'Non supportée'],
            ['URL spectateur',   '/solde?id=FY-XXXX'],
            ['URL inscription',  '/inscription'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={k.includes('URL') ? s.mono : undefined}>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Confirmation migration v2 */}
      <Dialog
        open={confirmV2}
        onClose={() => setConfirmV2(false)}
        title="Migration v2"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmV2(false)}>Annuler</Button>
          <Button icon={RefreshCw} onClick={runMigrationV2}>Migrer</Button>
        </>}
      >
        <p className={s.text}>Migrer staff, bénévoles et catégories vers cet événement ?</p>
      </Dialog>

      {/* Réinitialisation (ex-panneau intégré) — non fermable pendant l'exécution */}
      <Dialog
        open={resetOpen}
        onClose={running ? undefined : closeReset}
        title="Réinitialiser l'événement"
        footer={resetStep === 'done'
          ? <Button onClick={closeReset}>Fermer</Button>
          : <>
            <Button variant="secondary" onClick={closeReset} disabled={running}>Annuler</Button>
            <Button variant="danger" icon={AlertTriangle} onClick={handleReset} disabled={!resetPwd} loading={running}>
              {running ? 'Réinitialisation en cours…' : 'Confirmer la réinitialisation'}
            </Button>
          </>}
      >
        {resetStep === 'done' ? (
          <div className={s.done}>
            <span className={s.doneIcon}><Check size={24}/></span>
            <h3>Réinitialisation terminée</h3>
            <p className={s.text}>Toutes les données sélectionnées ont été supprimées.</p>
          </div>
        ) : (
          <div className={s.stack}>
            <div className={s.field}>
              <span className={s.label}>Éléments à supprimer</span>
              <div className={s.checks}>
                {Object.entries(EVENT_COLS).map(([key, cfg]) => (
                  <label key={key} className={s.check} htmlFor={`del-${key}`}>
                    <input
                      type="checkbox"
                      id={`del-${key}`}
                      checked={toDelete.includes(key)}
                      onChange={e => setToDelete(prev =>
                        e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                      )}
                    />
                    {cfg.label}
                  </label>
                ))}
              </div>
            </div>
            {toDelete.length > 0 && (
              <div className={s.warn}>
                Seront <strong>définitivement supprimés</strong> :
                <ul>{toDelete.map(k => <li key={k}>{EVENT_COLS[k]?.label}</li>)}</ul>
              </div>
            )}

            <div className={s.field}>
              <label className={s.label} htmlFor="reset-pwd">Confirmez avec votre mot de passe admin</label>
              <div className={s.pwd}>
                <input
                  id="reset-pwd"
                  className={s.input}
                  type={showPwd ? 'text' : 'password'}
                  value={resetPwd}
                  onChange={e => { setResetPwd(e.target.value); setResetError('') }}
                  placeholder="Mot de passe…"
                />
                <button type="button" className={s.eye} onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {resetError && <p className={s.error}>{resetError}</p>}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
