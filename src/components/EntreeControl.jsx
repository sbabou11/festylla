/**
 * components/EntreeControl.jsx — contrôle des billets à l'entrée (maquette validée le 17/11/2026)
 *
 * Scan à la caméra, lecteur clavier (USB/Bluetooth) ou saisie du code ; réponse en grand
 * (valable, inconnu, annulé, déjà entré, déjà utilisé), annulation d'une entrée du jour,
 * journal des dernières entrées. Utilisé par la page « Entrée » de l'équipe et par l'espace bénévole.
 *
 * props : eventId, par ({ type: 'staff'|'benevole', id, nom }), showSendIssues (équipe seulement)
 */
import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, XCircle, AlertTriangle, Undo2, RefreshCw, Ticket } from 'lucide-react'
import QrScanner from './QrScanner'
import useEcranAllume from '../hooks/useEcranAllume'
import DetailSheet from './DetailSheet'
import { Button, toast } from '../ui'
import { friendlyError } from '../utils/errors'
import { createWedge } from '../utils/scanWedge'
import { extractSpecId } from '../utils/specCode'
import { specIdDuQrTournant } from '../utils/qrTournant'

// Billet lu : QR du billet (« FY-… », ou ancien lien), ou QR de l'espace du spectateur (20/11/2026 :
// le spectateur n'a pas à savoir lequel présenter à l'entrée)
const lireBillet = (texte) => specIdDuQrTournant(texte) || extractSpecId(texte)
import { describeEntree, parisNow } from '../billets/entree'
import { controlerBillet, annulerEntree, watchEntreesDuJour, watchEnvoisEnEchec, relancerEnvois } from '../billets/entreeService'
import s from './EntreeControl.module.css'

const ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle }

// evenement : nom de l'événement (messages « Billet inconnu »)
// voirAuteur : montre « Enregistrée par » (23/11/2026 : administrateurs et consultation seulement)
export default function EntreeControl({ eventId, par, showSendIssues = false, evenement = '', voirAuteur = false }) {
  // Écran toujours allumé pendant les scans (24/11/2026) : pas de mise en veille entre deux clients
  useEcranAllume(true)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [entrees, setEntrees] = useState([])
  const [echecs, setEchecs] = useState([])
  const [ouverte, setOuverte] = useState(null) // id de l'entrée dont on voit le détail (23/11/2026)
  const last = useRef({ id: null, at: 0 })
  const busyRef = useRef(false)

  useEffect(() => eventId ? watchEntreesDuJour(eventId, setEntrees) : undefined, [eventId])
  useEffect(() => (eventId && showSendIssues) ? watchEnvoisEnEchec(eventId, setEchecs) : undefined, [eventId, showSendIssues])

  const control = async (raw) => {
    const specId = lireBillet(raw)
    if (!specId) { setResult({ status: 'pas-billet', lu: raw }); return }
    // La caméra relit le même billet plusieurs fois par seconde : on ne le traite qu'une fois
    const now = Date.now()
    if (busyRef.current || (last.current.id === specId && now - last.current.at < 4000)) return
    last.current = { id: specId, at: now }
    busyRef.current = true; setBusy(true)
    try {
      const r = await controlerBillet({ eventId, specId, par })
      setResult(r.status === 'inconnu' ? { ...r, specId, evenement } : r)
      navigator.vibrate?.(r.status === 'valable' ? 40 : [80, 60, 80])
    } catch (e) {
      // La vraie raison reste affichée à la place du résultat (réseau, droits…)
      setResult({ status: 'erreur', raison: friendlyError(e, 'Le contrôle n\'a pas abouti.') })
      navigator.vibrate?.([80, 60, 80])
    } finally { busyRef.current = false; setBusy(false) }
  }

  // Lecteur de QR branché en clavier
  const controlRef = useRef(control)
  controlRef.current = control
  useEffect(() => {
    const wedge = createWedge({ onScan: (code) => controlRef.current(code), onTournant: (jeton) => controlRef.current(jeton), onUnknown: (texte) => setResult({ status: 'pas-billet', lu: typeof texte === 'string' ? texte : '' }) })
    const onKey = (e) => { if (wedge.feed(e)) e.preventDefault() }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); wedge.reset() }
  }, [])

  const undo = async (entreeId) => {
    try {
      await annulerEntree({ eventId, entreeId })
      if (result?.entreeId === entreeId) setResult({ status: 'annulee' })
      toast.info('Entrée annulée')
    } catch (e) { toast.error(friendlyError(e, 'L\'entrée n\'a pas été annulée.')) }
  }

  const actives = entrees.filter(e => !e.annulee)
  const ouverteE = ouverte ? entrees.find(e => e.id === ouverte) : null
  const d = result && result.status !== 'annulee' ? describeEntree(result) : null
  const Icon = d ? ICON[d.tone] : null
  const { jour } = parisNow()
  const dayLabel = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.day}>{dayLabel}</span>
        <span className={s.count}><strong>{actives.length}</strong> entrée{actives.length > 1 ? 's' : ''} aujourd'hui</span>
      </div>

      {showSendIssues && echecs.length > 0 && (
        <div className={s.issue} role="alert">
          <AlertTriangle size={16} aria-hidden="true"/>
          <span>{echecs.length} entrée{echecs.length > 1 ? 's' : ''} refusée{echecs.length > 1 ? 's' : ''} par Ylla Event Manager : vérifiez le réglage de la liaison (adresse, clé).</span>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => relancerEnvois(eventId, echecs)}>Relancer</Button>
        </div>
      )}

      {/* parse dédié : saisie du code seul (pas de recherche par nom ni de « récemment servis ») */}
      <QrScanner onScan={control} parse={lireBillet} onIllisible={(texte) => setResult({ status: 'pas-billet', lu: texte })} placeholder="Code du billet (ex : K7Q3NP)" hint="Présentez le billet devant la caméra ou le lecteur"
        simulate={['FY-K7Q3NP', 'FY-AB2C3D', 'FY-ZZ9Z9Z']}/>

      <div aria-live="assertive" className={s.resultZone}>
        {busy && <div className={clsx(s.result, s.pending)}>Vérification…</div>}
        {!busy && result?.status === 'annulee' && <div className={clsx(s.result, s.neutral)}>Entrée annulée</div>}
        {!busy && d && (
          <div className={clsx(s.result, s[d.tone])}>
            <Icon size={32} aria-hidden="true"/>
            <div className={s.title}>{d.title}</div>
            {result.nom && <div className={s.who}>{result.nom}{result.pass ? ` · ${result.pass}` : ''}</div>}
            <div className={s.detail}>{d.detail}</div>
            {result.status === 'valable' && result.entreeId && (
              <Button size="sm" variant="secondary" icon={Undo2} onClick={() => undo(result.entreeId)}>Annuler cette entrée</Button>
            )}
          </div>
        )}
      </div>

      <section className={s.log} aria-label="Dernières entrées">
        <h3 className={s.logTitle}>Dernières entrées</h3>
        {entrees.length === 0 && <p className={s.empty}>Aucune entrée aujourd'hui pour l'instant.</p>}
        <ul>
          {entrees.slice(0, 12).map(e => (
            <li key={e.id} className={clsx(e.annulee && s.cancelled)}>
              <button type="button" className={s.rowBtn} onClick={() => setOuverte(e.id)} aria-haspopup="dialog"
                aria-label={`Détail de l'entrée de ${e.nom || e.specId}, ${e.heure}${e.annulee ? ', annulée' : ''}`}>
                <span className={s.time}>{e.heure}</span>
                <span className={s.name}>{e.nom || e.specId}{e.pass ? ` · ${e.pass}` : ''}</span>
              </button>
              {e.annulee
                ? <span className={s.tag}>annulée</span>
                : <button type="button" className={s.undo} onClick={() => undo(e.id)} aria-label={`Annuler l'entrée de ${e.nom || e.specId}`}><Undo2 size={14}/></button>}
            </li>
          ))}
        </ul>
      </section>

      {/* Détail d'une entrée : seulement ce que le journal du jour contient déjà */}
      <DetailSheet open={!!ouverteE} onClose={() => setOuverte(null)} title="Entrée"
        icon={ouverteE?.annulee ? Undo2 : Ticket}
        color={ouverteE?.annulee ? undefined : 'var(--green)'}
        status={ouverteE && (ouverteE.annulee ? { label: 'Annulée', tone: 'neutral' } : { label: 'Entrée enregistrée', tone: 'success' })}
        value={ouverteE?.heure || null}
        sub={ouverteE ? dayLabel : null}
        sections={ouverteE ? [
          { label: 'Billet', rows: [
            ['Nom', ouverteE.nom || '—'],
            ['Pass', ouverteE.pass || '—'],
            ['Code du billet', ouverteE.specId || '—'],
          ] },
          { label: 'Entrée', rows: [
            ['Heure', ouverteE.heure || '—'],
            ['Enregistrée par', voirAuteur ? (ouverteE.par?.nom || null) : null],
            ['État', ouverteE.annulee ? 'Annulée' : 'Valable'],
          ] },
        ] : []}
        actions={ouverteE && !ouverteE.annulee && (
          <Button block variant="secondary" icon={Undo2} onClick={() => { const id = ouverteE.id; setOuverte(null); undo(id) }}>Annuler l'entrée</Button>
        )} />
    </div>
  )
}
