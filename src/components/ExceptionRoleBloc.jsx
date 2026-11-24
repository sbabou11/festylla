/**
 * components/ExceptionRoleBloc.jsx — ouverture exceptionnelle de l'onglet de rôle (écran 12, 24/11/2026)
 *
 * Sur la fiche d'un bénévole qui a un rôle d'équipe, un admin ouvre son onglet hors créneau : durée
 * (30 min à 4 h) et motif obligatoires. Le bénévole déverrouille ensuite avec son propre mot de passe.
 * Tout est noté au journal d'audit ; le « journal du rôle » de la fiche en reprend les dernières lignes.
 * Annuler coupe l'accès aussitôt (règles et serveur relisent la fiche).
 */
import React, { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
import { ShieldCheck, X, Lock, LockOpen } from 'lucide-react'
import { db } from '../firebase/config'
import { ouvrirExceptionRole, annulerExceptionRole } from '../store/useAuthStore'
import { labelRoleEquipe } from '../utils/roleEquipe'
import { friendlyError } from '../utils/errors'
import { Button, Sheet, toast } from '../ui'
import s from './ExceptionRoleBloc.module.css'

const DUREES = [[30, '30 min'], [60, '1 h'], [120, '2 h'], [240, '4 h']]
const hm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
const quand = (iso) => {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const jour = d.toDateString() === new Date().toDateString() ? '' : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' }) + ' '
  return jour + hm(d.getTime())
}
const ICONES = { ROLE_EXCEPTION_OUVERTE: ShieldCheck, ROLE_EXCEPTION_ANNULEE: X, ROLE_DEVERROUILLE: LockOpen, ROLE_VERROUILLE: Lock, ROLE_BENEVOLE_DONNE: ShieldCheck, ROLE_BENEVOLE_RETIRE: X }

export default function ExceptionRoleBloc({ fiche, eventId }) {
  const [ouvrir, setOuvrir] = useState(false)
  const [minutes, setMinutes] = useState(60)
  const [motif, setMotif] = useState('')
  const [busy, setBusy] = useState(false)
  const [journal, setJournal] = useState([])
  const [, tick] = useState(0)
  const cible = `events/${eventId}/benevoles/${fiche?.id}`

  useEffect(() => {
    if (!eventId || !fiche?.id || !fiche.roleEquipe) return
    return onSnapshot(query(collection(db, 'events', eventId, 'audit'), where('benevoleId', '==', fiche.id), limit(50)),
      snap => setJournal(snap.docs.map(d => d.data()).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 6)),
      () => setJournal([]))
  }, [eventId, fiche?.id, fiche?.roleEquipe])
  // L'ouverture finit toute seule : on rafraîchit l'affichage chaque minute
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t) }, [])

  if (!fiche?.roleEquipe || !eventId) return null
  const exc = fiche.roleException && Number(fiche.roleException.jusqua) > Date.now() ? fiche.roleException : null

  const valider = async () => {
    if (motif.trim().length < 5) return
    setBusy(true)
    try {
      const r = await ouvrirExceptionRole(cible, minutes, motif.trim())
      toast.success(`Ouverture accordée jusqu'à ${hm(r.jusqua)} · notée au journal`)
      setOuvrir(false); setMotif('')
    } catch (e) { toast.error(friendlyError(e, "L'ouverture n'a pas été accordée.")) }
    finally { setBusy(false) }
  }
  const annuler = async () => {
    setBusy(true)
    try { await annulerExceptionRole(cible); toast.info('Ouverture annulée · onglet reverrouillé') }
    catch (e) { toast.error(friendlyError(e, "L'ouverture n'a pas été annulée.")) }
    finally { setBusy(false) }
  }
  const fin = Date.now() + minutes * 60000

  return (
    <div className={s.bloc}>
      <b>Rôle d'équipe : {labelRoleEquipe(fiche.roleEquipe)}</b>
      {exc ? (<>
        <div className={s.ok}><LockOpen size={16} aria-hidden="true" /><span>
          <b>Ouverture exceptionnelle jusqu'à {hm(exc.jusqua)}</b><br />Motif : {exc.motif} · par {exc.parNom || 'un admin'} à {hm(exc.le)}
        </span></div>
        <Button variant="secondary" icon={X} onClick={annuler} loading={busy} block>Annuler l'ouverture</Button>
      </>) : (<>
        <p className={s.aide}>Hors créneau, l'onglet de son rôle est fermé. Un admin peut l'ouvrir exceptionnellement.</p>
        <Button icon={ShieldCheck} onClick={() => setOuvrir(true)} block>Ouvrir exceptionnellement</Button>
      </>)}

      {journal.length > 0 && (
        <div className={s.journal}>
          <span className={s.titreJ}>Journal du rôle</span>
          {journal.map((j, i) => {
            const I = ICONES[j.action] || ShieldCheck
            return <div key={i} className={s.ligneJ}><I size={14} aria-hidden="true" /><span>{quand(j.timestamp)} · {j.label}</span></div>
          })}
        </div>
      )}

      <Sheet open={ouvrir} onClose={() => setOuvrir(false)} title="Ouvrir exceptionnellement">
        <div className={s.form}>
          <p className={s.aide}>{fiche.prenom || 'Ce bénévole'} pourra déverrouiller son onglet « {labelRoleEquipe(fiche.roleEquipe)} » <b>avec son propre mot de passe</b>,
            hors de ses créneaux, jusqu'à l'heure choisie. Noté au journal d'audit.</p>
          <div className={s.champ}>
            <span className={s.label}>Pendant</span>
            <div className={s.chips} role="radiogroup" aria-label="Durée">
              {DUREES.map(([m, l]) => (
                <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`${s.chip} ${minutes === m ? s.chipOn : ''}`} onClick={() => setMinutes(m)}>{l}</button>
              ))}
            </div>
            <span className={s.aide}>Jusqu'à <b>{hm(fin)}</b> (4 h au plus).</span>
          </div>
          <label className={s.champ}>
            <span className={s.label}>Motif (obligatoire)</span>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} maxLength={200}
              placeholder="Ex. : renfort à la billetterie, créneau oublié dans le planning…" />
          </label>
          <Button icon={ShieldCheck} onClick={valider} loading={busy} disabled={motif.trim().length < 5} block>Ouvrir jusqu'à {hm(fin)}</Button>
          <Button variant="secondary" onClick={() => setOuvrir(false)} block>Annuler</Button>
        </div>
      </Sheet>
    </div>
  )
}
