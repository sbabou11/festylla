/**
 * pages/admin/menu/MenuImportDialog.jsx — importer la carte depuis un fichier Excel ou CSV
 *
 * 1. Choisir le fichier (modèle téléchargeable)
 * 2. Aperçu ligne par ligne : erreurs, corrections, articles déjà présents (mettre à jour ou ignorer)
 * 3. Création des articles, puis génération des images (3 à la fois, avec arrêt possible)
 */
import React, { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Download, FileSpreadsheet, Upload, AlertTriangle, CheckCircle, Sparkles, Square, Info } from 'lucide-react'
import { Button, Dialog, toast } from '../../../ui'
import { friendlyError } from '../../../utils/errors'
import { labelAllergene } from '../../../utils/allergenes'
import { parseMenuRows } from '../../../menu/menuImport'
import { downloadMenuTemplate, readSpreadsheet, importMenuRows, generateImages } from '../../../menu/menuImportIO'
import s from './menu.module.css'

const euros = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

export default function MenuImportDialog({ open, onClose, menu, categories, eventId }) {
  const [step, setStep] = useState('choose')   // choose | preview | importing | images | done
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [duplicates, setDuplicates] = useState('update')
  const [withImages, setWithImages] = useState(true)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)
  const abortRef = useRef(null)

  const reset = () => { setStep('choose'); setParsed(null); setError(''); setProgress(null); setResult(null); setFileName('') }
  const close = () => {
    if (step === 'importing') return
    // Pendant les images, fermer arrête la génération (les articles sont déjà créés)
    abortRef.current?.abort()
    reset(); onClose()
  }

  const choose = async (file) => {
    if (!file) return
    setError(''); setFileName(file.name)
    try {
      const table = await readSpreadsheet(file)
      const res = parseMenuRows(table, menu)
      if (res.missingColumns.length) { setError(`Colonne${res.missingColumns.length > 1 ? 's' : ''} introuvable${res.missingColumns.length > 1 ? 's' : ''} : ${res.missingColumns.join(', ')}. Partez du modèle à télécharger.`); return }
      if (!res.rows.length) { setError('Aucun article trouvé dans le fichier.'); return }
      // Photo déjà présente : on ne la remplace pas
      const photoById = new Map(menu.map(m => [m.id, !!m.photoUrl]))
      res.rows.forEach(r => { r.existingPhoto = r.existingId ? photoById.get(r.existingId) : false })
      setParsed(res); setStep('preview')
    } catch (e) {
      setError(e.message || 'Le fichier n\'a pas pu être lu.')
    } finally { if (fileRef.current) fileRef.current.value = '' }
  }

  const stats = useMemo(() => {
    if (!parsed) return null
    const valid = parsed.rows.filter(r => !r.errors.length)
    const toCreate = valid.filter(r => !r.existingId)
    const toUpdate = valid.filter(r => r.existingId)
    const imported = duplicates === 'skip' ? toCreate : valid
    const images = imported.filter(r => r.generateImage && !r.existingPhoto).length
    return { valid, toCreate, toUpdate, invalid: parsed.rows.length - valid.length, imported, images }
  }, [parsed, duplicates])

  const run = async () => {
    setStep('importing')
    try {
      const { items, newCategories } = await importMenuRows(stats.imported, {
        eventId, categories: categories.map(c => c.nom), duplicates, onProgress: setProgress,
      })
      const summary = { created: stats.toCreate.length, updated: duplicates === 'update' ? stats.toUpdate.length : 0, newCategories }
      const todo = withImages ? items.filter(i => i.generateImage && !i.hadPhoto) : []
      if (!todo.length) { setResult(summary); setStep('done'); return }
      setStep('images'); setProgress({ label: `Images : 0 / ${todo.length}`, ratio: 0 })
      const ctrl = new AbortController(); abortRef.current = ctrl
      const img = await generateImages(todo, { eventId, signal: ctrl.signal, onProgress: setProgress })
      setResult({ ...summary, images: img })
      setStep('done')
    } catch (e) {
      toast.error(friendlyError(e, 'L\'import s\'est arrêté en cours de route.'))
      setStep('preview')
    }
  }

  const footer = (() => {
    if (step === 'choose') return <Button variant="secondary" onClick={close}>Fermer</Button>
    if (step === 'preview') return <>
      <Button variant="secondary" onClick={reset}>Autre fichier</Button>
      <Button icon={Upload} onClick={run} disabled={!stats.imported.length}>
        Importer {stats.imported.length} article{stats.imported.length > 1 ? 's' : ''}
      </Button>
    </>
    if (step === 'images') return <Button variant="secondary" icon={Square} onClick={() => abortRef.current?.abort()}>Arrêter les images</Button>
    if (step === 'done') return <Button onClick={close}>Terminer</Button>
    return null
  })()

  return (
    <Dialog open={open} onClose={close} title="Importer la carte depuis Excel" className={s.importPanel} footer={footer}>
      {step === 'choose' && (
        <div className={s.importStack}>
          <p className={s.importText}>
            Une ligne par article : nom, catégorie, prix, stock, seuil d'alerte, consommation bénévole,
            composition, allergènes. Les articles sont créés d'un coup, puis leurs images sont générées.
          </p>
          <div className={s.importActions}>
            <Button variant="secondary" icon={Download} onClick={() => downloadMenuTemplate(categories.map(c => c.nom)).catch(e => toast.error(friendlyError(e, 'Le modèle n\'a pas pu être créé.')))}>
              Télécharger le modèle
            </Button>
            <Button icon={FileSpreadsheet} onClick={() => fileRef.current?.click()}>Choisir le fichier (.xlsx ou .csv)</Button>
            <input ref={fileRef} type="file" hidden accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={e => choose(e.target.files?.[0])}/>
          </div>
          {error && <p className={s.importError}><AlertTriangle size={14} aria-hidden="true"/> {fileName ? `${fileName} : ` : ''}{error}</p>}
        </div>
      )}

      {step === 'preview' && stats && (
        <div className={s.importStack}>
          <div className={s.importSummary}>
            <span><strong>{stats.toCreate.length}</strong> à créer</span>
            <span><strong>{stats.toUpdate.length}</strong> déjà dans la carte</span>
            {stats.invalid > 0 && <span className={s.importBad}><strong>{stats.invalid}</strong> avec une erreur (non importé{stats.invalid > 1 ? 's' : ''})</span>}
          </div>

          {stats.toUpdate.length > 0 && (
            <fieldset className={s.importChoice}>
              <legend>Articles déjà dans la carte (même nom)</legend>
              <label><input type="radio" checked={duplicates === 'update'} onChange={() => setDuplicates('update')}/> Mettre à jour avec le fichier (prix, stock, composition…)</label>
              <label><input type="radio" checked={duplicates === 'skip'} onChange={() => setDuplicates('skip')}/> Les laisser tels quels</label>
            </fieldset>
          )}

          <label className={s.importCheck}>
            <input type="checkbox" checked={withImages} onChange={e => setWithImages(e.target.checked)} disabled={!stats.images}/>
            <Sparkles size={14} aria-hidden="true"/>
            Générer les images : <strong>{stats.images}</strong> image{stats.images > 1 ? 's' : ''} (crédits Higgsfield). Les photos déjà présentes sont conservées.
          </label>

          <div className={s.importTableWrap}>
            <table className={s.importTable}>
              <thead><tr><th>Ligne</th><th>Article</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Allergènes</th><th>Image</th><th>État</th></tr></thead>
              <tbody>
                {parsed.rows.map(r => (
                  <tr key={r.line} className={clsx(r.errors.length && s.rowBad)}>
                    <td>{r.line}</td>
                    <td><strong>{r.data.nom || '—'}</strong>{r.data.description && <div className={s.importSub}>{r.data.description}</div>}</td>
                    <td>{r.data.cat || '—'}</td>
                    <td className={s.num}>{r.errors.some(e => /Prix/.test(e)) ? '—' : euros(r.data.prix)}</td>
                    <td className={s.num}>{r.data.stock}</td>
                    <td>{[...r.data.allergenes.map(labelAllergene), ...r.data.allergenesCustom].join(', ') || '—'}</td>
                    <td>{r.generateImage ? (r.existingPhoto ? 'Photo gardée' : 'Oui') : 'Non'}</td>
                    <td>
                      {r.errors.map((e, i) => <div key={i} className={s.importBad}><AlertTriangle size={12} aria-hidden="true"/> {e}</div>)}
                      {!r.errors.length && <div>{r.existingId ? (duplicates === 'skip' ? 'Ignoré' : 'Mis à jour') : 'Nouveau'}</div>}
                      {r.warnings.map((w, i) => <div key={i} className={s.importWarn}><Info size={12} aria-hidden="true"/> {w}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(step === 'importing' || step === 'images') && (
        <div className={s.importStack} role="status" aria-live="polite">
          <div className={s.importTrack}><div className={s.importFill} style={{ width: `${Math.round((progress?.ratio || 0) * 100)}%` }}/></div>
          <p className={s.importText}>{progress?.label || 'Préparation…'}</p>
          {step === 'images' && <p className={s.importHint}>Comptez 10 à 30 secondes par image. Laissez cette fenêtre ouverte ; les articles sont déjà créés.</p>}
        </div>
      )}

      {step === 'done' && result && (
        <div className={s.importStack}>
          <p className={s.importOk}><CheckCircle size={16} aria-hidden="true"/>
            {result.created} article{result.created > 1 ? 's' : ''} créé{result.created > 1 ? 's' : ''}
            {result.updated ? `, ${result.updated} mis à jour` : ''}
            {result.newCategories.length ? ` ; catégorie${result.newCategories.length > 1 ? 's' : ''} ajoutée${result.newCategories.length > 1 ? 's' : ''} : ${result.newCategories.join(', ')}` : ''}.
          </p>
          {result.images && <>
            <p className={s.importText}>Images : {result.images.ok} générée{result.images.ok > 1 ? 's' : ''}{result.images.failed.length ? `, ${result.images.failed.length} en échec` : ''}.</p>
            {result.images.stopped && <p className={s.importError}><AlertTriangle size={14} aria-hidden="true"/> Génération arrêtée : {result.images.stopped}</p>}
            {result.images.failed.length > 0 && (
              <ul className={s.importFails}>
                {result.images.failed.map((f, i) => <li key={i}><strong>{f.nom}</strong> : {f.error}</li>)}
              </ul>
            )}
            {(result.images.failed.length > 0 || result.images.remaining?.length > 0) &&
              <p className={s.importHint}>Pour ces articles, le bouton « Générer l'image » reste disponible dans leur fiche.</p>}
          </>}
        </div>
      )}
    </Dialog>
  )
}
