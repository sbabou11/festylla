/**
 * pages/admin/evenements/ArchiveDialogs.jsx — fenêtres d'archivage des éditions
 *
 * ArchiveDialog       : 1. télécharger l'archive ZIP  2. (option) supprimer définitivement,
 *                       après relecture du ZIP choisi et saisie du nom de l'événement
 * RestoreDialog       : téléverser une archive pour la consulter en lecture seule
 * RemoveArchiveDialog : retirer de la base une archive consultée (le ZIP reste chez vous)
 */
import React, { useRef, useState } from 'react'
import { Archive, Download, FileArchive, ShieldCheck, Trash2, Upload, AlertTriangle, CheckCircle } from 'lucide-react'
import { Button, Dialog, HoldButton, toast } from '../../../ui'
import { friendlyError } from '../../../utils/errors'
import { apiFetch } from '../../../firebase/session'
import {
  buildArchive, downloadBlob, verifyArchiveForPurge, purgeEvent, restoreArchive,
} from '../../../archive/archiveService'
import s from './evenements.module.css'
import { ARCHIVE_ANNEES, calendrierEdition, moisAnnee } from '../../../utils/conservation'

function Progress({ p }) {
  if (!p) return null
  return (
    <div className={s.progress} role="status" aria-live="polite">
      <div className={s.progressTrack}><div className={s.progressFill} style={{ width: `${Math.round((p.ratio || 0) * 100)}%` }}/></div>
      <div className={s.progressLabel}>{p.label}</div>
    </div>
  )
}

const plural = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

export function ArchiveDialog({ event, onClose }) {
  const [phase, setPhase] = useState('idle')   // idle | building | built | checking | verified | purging
  const [progress, setProgress] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [problems, setProblems] = useState([])
  const [confirmName, setConfirmName] = useState('')
  const fileRef = useRef(null)
  const open = !!event
  const busy = ['building', 'checking', 'purging'].includes(phase)

  const close = () => {
    if (busy) return
    setPhase('idle'); setProgress(null); setManifest(null); setProblems([]); setConfirmName('')
    onClose()
  }

  const build = async () => {
    setPhase('building'); setProblems([])
    try {
      const { blob, fileName, manifest: m } = await buildArchive(event.id, { onProgress: setProgress })
      downloadBlob(blob, fileName)
      setManifest(m); setPhase('built'); setProgress(null)
      toast.success('Archive téléchargée')
    } catch (e) {
      setPhase('idle'); setProgress(null)
      toast.error(friendlyError(e, 'L\'archive n\'a pas pu être créée.'))
    }
  }

  const check = async (file) => {
    if (!file) return
    setPhase('checking'); setProblems([])
    try {
      const r = await verifyArchiveForPurge(file, event.id)
      setManifest(r.manifest || manifest)
      setProblems(r.problems)
      setPhase(r.ok ? 'verified' : 'built')
    } catch (e) {
      setPhase('built'); setProblems([e.message || 'Le fichier n\'a pas pu être lu.'])
    } finally { if (fileRef.current) fileRef.current.value = '' }
  }

  const purge = async () => {
    setPhase('purging')
    try {
      await purgeEvent(event.id, { onProgress: setProgress })
      toast.success(`« ${event.nom} » a été supprimé de la base. L'archive ZIP permet de le consulter à nouveau.`)
      setPhase('idle'); setProgress(null); onClose()
    } catch (e) {
      setPhase('verified'); setProgress(null)
      toast.error(friendlyError(e, 'La suppression s\'est arrêtée en cours de route : relancez-la pour terminer.'))
    }
  }

  const nameOk = confirmName.trim().toLowerCase() === (event?.nom || '').trim().toLowerCase()

  return (
    <Dialog open={open} onClose={close} title={`Archiver « ${event?.nom || ''} »`}
      footer={<Button variant="secondary" onClick={close} disabled={busy}>Fermer</Button>}>
      <div className={s.dialogStack}>
        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}><span className={s.stepNum}>1</span> Télécharger l'archive</h3>
          <p className={s.dialogText}>
            Un fichier ZIP avec toutes les données de l'édition, ses photos et justificatifs,
            et un classeur Excel lisible sans l'appli. Les mots de passe de l'équipe ne sont pas conservés.
          </p>
          {/* Conservation des données (RGPD, 24/11/2026) : archive gardée 10 ans */}
          <p className={s.dialogText}>
            <strong>À garder {ARCHIVE_ANNEES} ans{event && calendrierEdition(event) ? `, jusqu'en ${moisAnnee(calendrierEdition(event).archive)}` : ''}, en lieu sûr</strong> (pièces comptables).
            Il contient des données personnelles : ne le partagez pas.
          </p>
          {phase === 'building' ? <Progress p={progress}/> : (
            <Button icon={Download} onClick={build} disabled={busy}>
              {manifest ? 'Télécharger à nouveau' : 'Télécharger l\'archive'}
            </Button>
          )}
          {manifest && (
            <p className={s.archiveSummary}>
              <CheckCircle size={14} aria-hidden="true"/> {plural(manifest.totalDocuments, 'élément', 'éléments')}
              {' '}et {plural(manifest.files.length, 'fichier', 'fichiers')} archivés.
              {manifest.missingFiles?.length > 0 && <> <strong>{plural(manifest.missingFiles.length, 'fichier n\'a pas pu être récupéré', 'fichiers n\'ont pas pu être récupérés')}.</strong></>}
            </p>
          )}
        </section>

        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}><span className={s.stepNum}>2</span> Supprimer de la base (facultatif)</h3>
          {event?.actif ? (
            <p className={s.dialogText}>
              C'est l'édition active : les stands et la borne l'utilisent. Activez d'abord une autre édition pour pouvoir la supprimer.
            </p>
          ) : (<>
            <p className={s.dialogText}>
              Pour vérifier que l'archive est complète, choisissez le fichier ZIP téléchargé.
              L'appli le relit et le compare aux données en base avant d'autoriser la suppression.
            </p>
            <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={e => check(e.target.files?.[0])}/>
            {phase === 'checking' ? <div className={s.progressLabel}>Vérification de l'archive…</div> : phase !== 'verified' && phase !== 'purging' && (
              <Button variant="secondary" icon={FileArchive} onClick={() => fileRef.current?.click()} disabled={busy}>
                Choisir le fichier ZIP
              </Button>
            )}
            {problems.length > 0 && (
              <ul className={s.problemList}>
                {problems.map((p, i) => <li key={i}><AlertTriangle size={13} aria-hidden="true"/> {p}</li>)}
              </ul>
            )}
            {(phase === 'verified' || phase === 'purging') && (<>
              <p className={s.archiveSummary}><ShieldCheck size={14} aria-hidden="true"/> Archive vérifiée : elle contient bien toute l'édition.</p>
              <label className={s.label} htmlFor="archive-confirm-name">
                Tapez « {event.nom} » pour confirmer
              </label>
              <input id="archive-confirm-name" className={s.confirmInput} value={confirmName}
                onChange={e => setConfirmName(e.target.value)} disabled={phase === 'purging'} autoComplete="off"/>
              {phase === 'purging' ? <Progress p={progress}/> : (
                <HoldButton tone="danger" icon={Trash2} disabled={!nameOk} onConfirm={purge}>
                  Maintenir pour supprimer définitivement
                </HoldButton>
              )}
              <p className={s.dialogHint}>Données, photos et documents seront effacés de Firebase. Seul le fichier ZIP permettra de les retrouver.</p>
            </>)}
          </>)}
        </section>
      </div>
    </Dialog>
  )
}

export function RestoreDialog({ open, onClose, onRestored }) {
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const restore = async (file) => {
    if (!file) return
    setBusy(true); setError('')
    try {
      const m = await restoreArchive(file, { onProgress: setProgress })
      toast.success(`Archive « ${m.event.nom} » ouverte en lecture seule`)
      setBusy(false); setProgress(null)
      onRestored?.(m.event.id); onClose()
    } catch (e) {
      setBusy(false); setProgress(null)
      setError(e.message || 'L\'archive n\'a pas pu être ouverte.')
    } finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title="Consulter une archive"
      footer={<Button variant="secondary" onClick={onClose} disabled={busy}>Fermer</Button>}>
      <div className={s.dialogStack}>
        <p className={s.dialogText}>
          Choisissez le fichier ZIP d'une édition archivée. Elle réapparaît dans la liste des événements,
          consultable en lecture seule (tableau de bord, transactions, comptabilité, rapports…).
          Rien ne peut y être modifié, et les stands et la borne restent sur l'édition en cours.
        </p>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={e => restore(e.target.files?.[0])}/>
        {busy ? <Progress p={progress}/> : (
          <Button icon={Upload} onClick={() => fileRef.current?.click()}>Choisir le fichier ZIP</Button>
        )}
        {error && <ul className={s.problemList}><li><AlertTriangle size={13} aria-hidden="true"/> {error}</li></ul>}
      </div>
    </Dialog>
  )
}

export function RemoveArchiveDialog({ event, onClose }) {
  const [progress, setProgress] = useState(null)
  const remove = async () => {
    try {
      await purgeEvent(event.id, { onProgress: setProgress })
      toast.success(`Archive « ${event.nom} » refermée`)
      setProgress(null); onClose()
    } catch (e) {
      setProgress(null)
      toast.error(friendlyError(e, 'L\'archive n\'a pas pu être retirée : relancez pour terminer.'))
    }
  }
  return (
    <Dialog open={!!event} onClose={() => !progress && onClose()} title="Refermer cette archive ?"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={!!progress}>Annuler</Button>
        {!progress && <HoldButton tone="danger" icon={Archive} onConfirm={remove}>Maintenir pour refermer</HoldButton>}
      </>}>
      <p className={s.dialogText}>
        « {event?.nom} » sera retirée de la base. Votre fichier ZIP n'est pas touché :
        vous pourrez rouvrir l'archive à tout moment.
      </p>
      <Progress p={progress}/>
    </Dialog>
  )
}

/**
 * SecuriteDialog — règles strictes de la base pour un événement (sécurité, lot 3)
 * Fermer : seules les personnes connectées, chacune selon son rôle, lisent et écrivent.
 * Rouvrir : retour au mode ancien, en secours si un écran ne fonctionne plus le jour J.
 */
export function SecuriteDialog({ event, onClose }) {
  const [busy, setBusy] = useState(false)
  const [migration, setMigration] = useState(null)
  const [cles, setCles] = useState(null)
  const fermee = event?.securite === 'fermee'
  const run = async (body, done) => {
    setBusy(true)
    try { const r = await apiFetch('/api/securite', { body }); done?.(r) }
    catch (e) { toast.error(friendlyError(e, 'L\'opération n\'a pas abouti.')) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={!!event} onClose={() => !busy && onClose()} title={`Sécurité de « ${event?.nom || ''} »`}
      footer={<Button variant="secondary" onClick={onClose} disabled={busy}>Fermer</Button>}>
      <div className={s.dialogStack}>
        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}>Base de données {fermee ? 'protégée' : 'en mode ancien'}</h3>
          <p className={s.dialogText}>
            {fermee
              ? 'Seules les personnes connectées lisent et modifient les données, chacune selon son rôle. Les visiteurs ne voient que leur propre compte.'
              : 'Les données courantes de cet événement sont encore lisibles sans connexion, comme avant. L\'équipe, les bénévoles et les clés des liens sont déjà protégés.'}
          </p>
          {fermee
            ? <Button variant="secondary" disabled={busy} onClick={() => run({ mode: 'ouvrir', ev: event.id }, () => { toast.info('Retour au mode ancien') ; onClose() })}>Revenir au mode ancien</Button>
            : <HoldButton tone="danger" icon={ShieldCheck} onConfirm={() => run({ mode: 'fermer', ev: event.id }, () => { toast.success('Règles strictes activées') ; onClose() })}>Maintenir pour protéger la base</HoldButton>}
          <p className={s.dialogHint}>À essayer d'abord sur un événement de test : vérifiez la caisse, la borne, l'écran, l'espace bénévole et un compte spectateur.</p>
        </section>
        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}>Clés des comptes spectateurs</h3>
          <p className={s.dialogText}>Met à l'abri les clés des comptes déjà créés : elles sortent des fiches des spectateurs, que les bénévoles et les artistes peuvent lire, pour un rangement réservé au serveur. Les liens déjà envoyés continuent de fonctionner. À lancer une fois par événement.</p>
          <Button variant="secondary" disabled={busy} onClick={() => run({ mode: 'migrer-cles', ev: event.id }, setCles)}>Mettre les clés à l'abri</Button>
          {cles && <p className={s.archiveSummary}><CheckCircle size={14} aria-hidden="true"/> {cles.deplacees} clé{cles.deplacees > 1 ? 's' : ''} mise{cles.deplacees > 1 ? 's' : ''} à l'abri ; {cles.sansCle} compte{cles.sansCle > 1 ? 's' : ''} sans clé.</p>}
        </section>
        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}>Mots de passe en clair</h3>
          <p className={s.dialogText}>Convertit tout de suite les mots de passe encore enregistrés en clair (équipe et bénévoles, tous les événements). Les mots de passe restent les mêmes pour chacun.</p>
          <Button variant="secondary" disabled={busy} onClick={() => run({ mode: 'migrer-mots-de-passe' }, setMigration)}>Convertir maintenant</Button>
          {migration && <p className={s.archiveSummary}><CheckCircle size={14} aria-hidden="true"/> {migration.converties} converti{migration.converties > 1 ? 's' : ''} ; {migration.dejaProteges} déjà protégé{migration.dejaProteges > 1 ? 's' : ''}{migration.anciennesEmpreintes ? ` ; ${migration.anciennesEmpreintes} à l'ancien format, convertis à la prochaine connexion` : ''}.</p>}
        </section>
      </div>
    </Dialog>
  )
}
