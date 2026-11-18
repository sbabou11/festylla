/**
 * pages/admin/evenements/LiaisonsDialog.jsx — clés de liaison d'un événement
 * (maquette validée le 18/11/2026, règle d'échange billetterie v1.3)
 *
 * - Clés des sites qui envoient des billets : une par site, nommée ; la clé complète ne s'affiche
 *   qu'une fois, à la création ou au renouvellement ; renouveler ou supprimer coupe l'ancienne aussitôt.
 * - Clé Event Manager de l'événement : elle sert à envoyer les entrées et à lire l'instantané
 *   (programme, artistes, bénévoles ; règle d'échange Event Manager ↔ YllaCash v1.0, maquette du 18/11/2026).
 * Tout passe par le serveur (api/liaisons) : aucune clé n'est lisible dans la base depuis un navigateur.
 */
import React, { useEffect, useState } from 'react'
import { Button, Dialog, HoldButton, toast } from '../../../ui'
import { friendlyError } from '../../../utils/errors'
import { apiFetch } from '../../../firebase/session'
import { RefreshCw } from 'lucide-react'
import s from './evenements.module.css'

const fmtHour = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`

/** État de la lecture de l'instantané d'Event Manager (à jour, injoignable, clé refusée) */
function LectureStatus({ lecture }) {
  const copie = lecture?.okLe ? `La copie lue le ${fmtDate(lecture.okLe)} reste utilisée` : "Aucune copie n'a encore été lue"
  const c = lecture?.comptes
  if (!lecture) return (
    <div className={s.lectureLine}>
      <span><strong>Lecture d'Event Manager</strong></span>
      <span className={s.dialogHint}>Pas encore lue : première lecture dans les 5 minutes.</span>
    </div>
  )
  if (!lecture.echec) return (
    <div className={s.lectureLine}>
      <span><strong>Lecture d'Event Manager</strong> <span className={`${s.lectureBadge} ${s.lectureOk}`}>À jour</span></span>
      <span className={s.dialogHint}>
        Dernière lecture le {fmtDate(lecture.okLe)}
        {c ? ` · ${plural(c.programme, 'passage', 'passages')}, ${plural(c.artistes, 'artiste', 'artistes')}, ${plural(c.benevoles, 'bénévole', 'bénévoles')}` : ''}
      </span>
    </div>
  )
  if (lecture.echec.type === 'refus') return (
    <div className={s.lectureLine}>
      <span><strong>Lecture d'Event Manager</strong> <span className={`${s.lectureBadge} ${s.lectureRefus}`}>Clé refusée</span></span>
      <span className={s.dialogHint}>Event Manager refuse cette clé : elle a peut-être été renouvelée ou supprimée. Retirez-la et collez la nouvelle. {copie}.</span>
    </div>
  )
  return (
    <div className={s.lectureLine}>
      <span><strong>Lecture d'Event Manager</strong> <span className={`${s.lectureBadge} ${s.lecturePanne}`}>{lecture.echec.format ? 'Réponse illisible' : 'Injoignable'}</span></span>
      <span className={s.dialogHint}>
        {lecture.echec.format ? "La réponse d'Event Manager est illisible" : 'Event Manager ne répond pas'} depuis {fmtHour(lecture.echec.depuis)}. {copie} : le festival continue. Nouvel essai toutes les 5 minutes.
      </span>
    </div>
  )
}

/** Retour des consommations et du bilan vers Event Manager (§7, maquette du 18/11/2026) */
function RetourStatus({ retour }) {
  const titre = <strong>Retour des consommations et du bilan</strong>
  if (retour?.echec) return (
    <div className={s.lectureLine}>
      <span>{titre} <span className={`${s.lectureBadge} ${s.lectureRefus}`}>Refusé</span></span>
      <span className={s.dialogHint}>Event Manager refuse l'envoi depuis {fmtHour(retour.echecDepuis) || '—'} ({retour.echec}). Les chiffres sont gardés et renvoyés toutes les 5 minutes.</span>
    </div>
  )
  if (!retour?.okLe) return (
    <div className={s.lectureLine}>
      <span>{titre}</span>
      <span className={s.dialogHint}>Pas encore d'envoi : il partira après la première transaction de l'événement.</span>
    </div>
  )
  const final = retour.finalLe && retour.finalLe === retour.okLe
  return (
    <div className={s.lectureLine}>
      <span>{titre} <span className={`${s.lectureBadge} ${s.lectureOk}`}>{final ? 'Bilan final envoyé' : 'À jour'}</span></span>
      <span className={s.dialogHint}>
        {final
          ? `Bilan final envoyé le ${fmtDate(retour.finalLe)}, après la clôture de caisse de ${fmtHour(retour.clotureLe)}`
          : `Dernier envoi le ${fmtDate(retour.okLe)} · nouvel envoi dès qu'un chiffre change, au plus toutes les 5 minutes`}
      </span>
    </div>
  )
}

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

export default function LiaisonsDialog({ event, onClose }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [nom, setNom] = useState('')
  const [nomTried, setNomTried] = useState(false)
  const [shown, setShown] = useState(null)      // { id, nom, cle } : affichée une seule fois
  const [emCle, setEmCle] = useState('')
  const ev = event?.id

  const call = (body) => apiFetch('/api/liaisons', { body: { ev, ...body } })
  const reload = async () => {
    try { setData(await call({ mode: 'lister' })) }
    catch (e) { toast.error(friendlyError(e, "Les liaisons n'ont pas pu être chargées.")) }
  }
  useEffect(() => {
    if (!ev) return
    setData(null); setShown(null); setNom(''); setEmCle(''); setNomTried(false)
    reload()
  }, [ev])

  const act = async (body, after) => {
    setBusy(true)
    try { const r = await call(body); await after?.(r); await reload() }
    catch (e) { toast.error(friendlyError(e, "L'opération n'a pas abouti.")) }
    finally { setBusy(false) }
  }
  const create = () => {
    if (!nom.trim()) { setNomTried(true); return }
    act({ mode: 'creer', nom: nom.trim() }, (r) => { setShown(r); setNom(''); setNomTried(false) })
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown.cle); toast.success('Clé copiée') }
    catch { toast.info('Sélectionnez la clé pour la copier') }
  }

  return (
    <Dialog open={!!event} onClose={() => !busy && onClose()} title={`Liaisons · ${event?.nom || ''}`}
      footer={<Button variant="secondary" onClick={onClose} disabled={busy}>Fermer</Button>}>
      <div className={s.dialogStack}>
        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}>Sites qui envoient des billets</h3>
          <p className={s.dialogText}>Une clé par site. Chaque compte créé garde le nom de la clé qui l'a apporté.</p>
          {!data && <p className={s.progressLabel}>Chargement…</p>}
          {data && data.cles.length === 0 && <p className={s.dialogHint}>Aucune clé : aucun site ne peut envoyer de billets à cet événement.</p>}
          {data?.cles.map(k => (
            <div key={k.id} className={s.liaisonRow}>
              <div className={s.liaisonNom}>{k.nom}</div>
              <div className={s.dialogHint}>
                Créée le {fmtDate(k.creeLe) || '—'} · {k.derniereUtilisation ? `dernier envoi le ${fmtDate(k.derniereUtilisation)}` : 'aucun envoi'} · {k.comptes} compte{k.comptes > 1 ? 's' : ''}
              </div>
              <div className={s.liaisonActions}>
                <HoldButton tone="danger" disabled={busy} onConfirm={() => act({ mode: 'renouveler', id: k.id }, setShown)}>Maintenir : renouveler</HoldButton>
                <HoldButton tone="danger" disabled={busy} onConfirm={() => act({ mode: 'supprimer', id: k.id }, () => { if (shown?.id === k.id) setShown(null) })}>Maintenir : supprimer</HoldButton>
              </div>
            </div>
          ))}
          <form className={s.liaisonForm} onSubmit={e => { e.preventDefault(); create() }}>
            <input className={s.confirmInput} value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Nom (ex : festylla.com)" aria-label="Nom de la nouvelle clé" disabled={busy}/>
            <Button type="submit" disabled={busy}>Créer</Button>
          </form>
          {nomTried && !nom.trim() && <p className={s.fieldError}>Donnez un nom à la clé.</p>}
          {shown && (
            <div className={s.cleShown} role="alert">
              <strong>Clé « {shown.nom} » : à copier maintenant, elle ne sera plus affichée.</strong>
              <code className={s.cleText}>{shown.cle}</code>
              <div className={s.liaisonActions}>
                <Button size="sm" onClick={copy}>Copier</Button>
                <Button size="sm" variant="secondary" onClick={() => setShown(null)}>J'ai copié la clé</Button>
              </div>
              <p className={s.dialogHint}>À coller dans le site (WooCommerce › Billetterie). Renouveler ou supprimer la clé coupe l'ancienne aussitôt.</p>
            </div>
          )}
        </section>

        <section className={s.archiveStep}>
          <h3 className={s.archiveStepTitle}>Liaison avec Event Manager</h3>
          {data?.em ? (
            <>
            <p className={s.dialogText}>La clé « YllaCash » sert à envoyer les entrées et à lire le programme, les artistes et les bénévoles.</p>
            <div className={s.liaisonRow}>
              <div className={s.liaisonNom}>Clé enregistrée ····{data.em.fin}</div>
              <div className={s.lectureLine}>
                <span><strong>Envoi des entrées</strong></span>
                <span className={s.dialogHint}>
                  {data.em.dernierEnvoiOk ? `Dernier envoi réussi le ${fmtDate(data.em.dernierEnvoiOk)}` : "Aucun envoi réussi pour l'instant"}
                  {data.em.dernierEchec ? ` · dernier échec : ${data.em.dernierEchec}` : ''}
                </span>
              </div>
              <LectureStatus lecture={data.em.lecture}/>
              <RetourStatus retour={data.em.retour}/>
              <div className={s.liaisonActions}>
                <Button size="sm" variant="secondary" icon={RefreshCw} disabled={busy}
                  onClick={() => act({ mode: 'em-actualiser' }, (r) => { if (r?.lecture && !r.lecture.echec) toast.success('Event Manager relu') })}>
                  {busy ? 'Lecture…' : 'Actualiser'}
                </Button>
                <HoldButton tone="danger" disabled={busy} onConfirm={() => act({ mode: 'em-retirer' })}>Maintenir : retirer</HoldButton>
              </div>
            </div>
            </>
          ) : data && (
            <>
            <p className={s.dialogText}>Collez la clé « YllaCash » créée dans Event Manager (Rapports › Billetterie). Elle sert à envoyer les entrées et à lire le programme, les artistes et les bénévoles.</p>
            <form className={s.liaisonForm} onSubmit={e => { e.preventDefault(); if (emCle.trim()) act({ mode: 'em-enregistrer', cle: emCle.trim() }, () => setEmCle('')) }}>
              <input className={s.confirmInput} value={emCle} onChange={e => setEmCle(e.target.value)}
                placeholder="Clé Event Manager" aria-label="Clé Event Manager" autoComplete="off" disabled={busy}/>
              <Button type="submit" disabled={busy || !emCle.trim()}>Enregistrer</Button>
            </form>
            </>
          )}
        </section>
      </div>
    </Dialog>
  )
}
