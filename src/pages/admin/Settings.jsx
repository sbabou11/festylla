/**
 * pages/admin/Settings.jsx — v3
 * Super admin : paramètres + exports + réinitialisation complète événement
 */
import React, { useState } from 'react'
import { Download, FileSpreadsheet, Wand2, Save, AlertTriangle, ShieldAlert, Eye, EyeOff, FileText } from 'lucide-react'
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

  const card = {
    background: 'var(--bg)', border: '0.5px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 14,
  }
  const inp = {
    width: '100%', padding: '8px 10px',
    border: '0.5px solid var(--border2)', borderRadius: 8,
    fontSize: 13, background: 'var(--bg2)', color: 'var(--text)',
    fontFamily: 'var(--font)',
  }
  const checkRow = (label, checked, onChange) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}/>
      {label}
    </label>
  )

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Paramètres généraux */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Save size={15} style={{ color: 'var(--muted)' }}/> Paramètres généraux
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nom du festival</label>
          <input value={festName} onChange={e => setFestName(e.target.value)} style={inp}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>1€ = X points</label>
            <input type="number" defaultValue={100} style={inp}/>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Solde max (centimes)</label>
            <input type="number" defaultValue={10000} style={inp}/>
          </div>
        </div>
        <button onClick={handleSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          <Save size={13}/> {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* Exports */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={15} style={{ color: 'var(--muted)' }}/> Export des données
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Générés côté client — aucun serveur requis.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleCsv} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <Download size={13}/> {exporting === 'csv' ? 'Génération…' : 'Transactions (XLSX)'}
          </button>
          <button onClick={handleExcel} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '0.5px solid #5DCAA5', borderRadius: 8, background: '#E1F5EE', color: '#0F6E56', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <FileSpreadsheet size={13}/> {exporting === 'excel' ? 'Génération…' : 'Rapport Excel'}
          </button>
          <button onClick={handleAudit} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '0.5px solid #AFA9EC', borderRadius: 8, background: 'var(--purple-light)', color: 'var(--purple)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <Download size={13}/> {exporting === 'audit' ? 'Génération…' : "Journal d’audit (XLSX)"}
          </button>
        </div>
      </div>

      {/* Studio */}
      <div style={{ ...card, background: 'var(--brand-light)', borderColor: 'var(--brand)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wand2 size={15}/> Personnalisation visuelle
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-dark)', opacity: 0.85 }}>
          Ouvrez le <strong>Studio</strong> via le bouton en haut à droite pour personnaliser couleurs, logo, typographie et QR code.
        </div>
      </div>

      {/* ── MIGRATION V2 — staff/categories/benevoles dans l'événement ── */}
      {currentEventId && user?.role === 'super_admin' && (
        <div style={{ ...card, border: '2px solid #534AB7', background: '#EDE9FE', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#534AB7', marginBottom: 6 }}>
            🔄 Migration architecture v2
          </div>
          <div style={{ fontSize: 12, color: '#3730a3', marginBottom: 12, lineHeight: 1.6 }}>
            Migre staff, bénévoles et catégories depuis la racine Firestore vers cet événement.
            À effectuer une seule fois après déploiement.
          </div>
          {migrV2Log.length > 0 && (
            <div style={{ background: 'rgba(0,0,0,.06)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8 }}>
              {migrV2Log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          {migrV2Done && (
            <div style={{ padding: '10px 14px', background: '#D1FAE5', borderRadius: 8, color: '#065f46', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              ✓ Migration v2 terminée
            </div>
          )}
          {!migrV2Done && (
            <button
              onClick={async () => {
                if (!window.confirm("Migrer staff, bénévoles et catégories vers cet événement ?")) return
                setMigratingV2(true); setMigrV2Log([])
                try {
                  await migrerVersV2(currentEventId, msg => setMigrV2Log(prev => [...prev, msg]))
                  setMigrV2Done(true)
                } catch (e) { setMigrV2Log(prev => [...prev, "✗ " + e.message]) }
                finally { setMigratingV2(false) }
              }}
              disabled={migratingV2}
              style={{ padding: '10px 18px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: migratingV2 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: migratingV2 ? .6 : 1 }}>
              {migratingV2 ? 'Migration en cours…' : '🔄 Lancer la migration v2'}
            </button>
          )}
        </div>
      )}

      {/* ── RAPPORT DE CLÔTURE ── */}
      <div style={{ ...card, border: '1.5px solid var(--brand)', background: 'var(--brand-light)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={15}/> Rapport de clôture PDF
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-dark)', marginBottom: 14, lineHeight: 1.6, opacity: .85 }}>
          Génère un rapport PDF complet de l'événement : récapitulatif financier, réconciliation comptable, top articles, statistiques par stand, toutes les transactions, spectateurs & soldes restants, réservations et journal d'audit complet.
        </div>
        <button
          onClick={async () => {
            setGeneratingPdf(true)
            try { await genererRapportCloture() }
            catch (e) { alert('Erreur : ' + e.message) }
            finally { setGeneratingPdf(false) }
          }}
          disabled={generatingPdf}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: generatingPdf ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: generatingPdf ? .6 : 1 }}>
          <FileText size={14}/>
          {generatingPdf ? 'Génération en cours… (peut prendre quelques secondes)' : 'Générer le rapport de clôture (PDF)'}
        </button>
      </div>

      {/* ── ZONE DANGER — Réinitialisation événement ── */}
      <div style={{ ...card, border: '1px solid #F09595', background: 'var(--red-light)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={15}/> Zone dangereuse — Réinitialisation événement
        </div>
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 14, lineHeight: 1.6, opacity: 0.9 }}>
          Supprime définitivement toutes les transactions, réservations et comptes spectateurs. Action irréversible.
        </div>

        {!resetOpen ? (
          <button onClick={() => setResetOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            <AlertTriangle size={14}/> Réinitialiser l'événement
          </button>
        ) : (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--red)', borderRadius: 10, padding: 18 }}>

            {resetStep === 'done' ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-dark)', marginBottom: 6 }}>Réinitialisation terminée</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Toutes les données sélectionnées ont été supprimées.</div>
                <button onClick={closeReset} style={{ padding: '8px 18px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                  Que souhaitez-vous conserver ?
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                  Sélectionnez les éléments à supprimer :
                </div>
                <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '4px 12px', marginBottom: 14 }}>
                  {Object.entries(EVENT_COLS).map(([key, cfg]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
                      <input
                        type="checkbox"
                        id={`del-${key}`}
                        checked={toDelete.includes(key)}
                        onChange={e => setToDelete(prev =>
                          e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                        )}
                        style={{ width: 16, height: 16, accentColor: 'var(--red)', cursor: 'pointer' }}
                      />
                      <label htmlFor={`del-${key}`} style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                        {cfg.label}
                      </label>
                    </div>
                  ))}
                </div>
                {toDelete.length > 0 && (
                  <div style={{ padding: '10px 12px', background: '#FCEBEB', border: '0.5px solid #F09595', borderRadius: 8, fontSize: 12, color: 'var(--red)', marginBottom: 14, lineHeight: 1.6 }}>
                    ⚠️ Seront <strong>définitivement supprimés</strong> :<br/>
                    {toDelete.map(k => <span key={k}>• {EVENT_COLS[k]?.label}<br/></span>)}
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Confirmez avec votre mot de passe admin
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={resetPwd}
                      onChange={e => { setResetPwd(e.target.value); setResetError('') }}
                      placeholder="Mot de passe…"
                      style={{ ...inp, paddingRight: 36 }}
                    />
                    <button onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
                      {showPwd ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </div>
                  {resetError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{resetError}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleReset}
                    disabled={!resetPwd || resetStep === 'running'}
                    style={{
                      flex: 1, padding: '10px 0',
                      background: resetStep === 'running' ? 'var(--bg3)' : 'var(--red)',
                      color: resetStep === 'running' ? 'var(--muted)' : '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: !resetPwd || resetStep === 'running' ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <AlertTriangle size={13}/>
                    {resetStep === 'running' ? 'Réinitialisation en cours…' : 'Confirmer la réinitialisation'}
                  </button>
                  <button onClick={closeReset} disabled={resetStep === 'running'}
                    style={{ padding: '10px 14px', border: '0.5px solid var(--border2)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Infos système */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Informations système</div>
        {[
          ['Version',          '1.0.0'],
          ['PWA',              'serviceWorker' in navigator ? 'Supportée' : 'Non supportée'],
          ['URL spectateur',   '/solde?id=FY-XXXX'],
          ['URL inscription',  '/inscription'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>{k}</span>
            <span style={{ color: 'var(--text)', fontFamily: k.includes('URL') ? 'monospace' : 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
