/**
 * pages/stand/Retrait.jsx — retrait des réservations au stand
 * Scanner le QR du spectateur → ses réservations actives → valider le retrait (débit).
 * Plein soleil disponible dans la barre d'outils (préférence de l'appareil).
 */
import React, { useState } from 'react'
import clsx from 'clsx'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import useSunMode from '../../store/useSunMode'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import { fmt } from '../../utils/helpers'
import QrScanner from '../../components/QrScanner'
import { RefreshCw, Package, Sun, X, AlertCircle } from 'lucide-react'
import { Button, Badge, Skeleton, SuccessCheck } from '../../ui'
import s from './Retrait.module.css'

const itemsLabel = (items) => (items || []).map(i => `${i.nom} ×${i.qty}`).join(' · ')

export default function Retrait() {
  const { reservations, spectateurs, validerRetrait } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const { sun, toggleSun } = useSunMode()
  const [specId, setSpecId]   = useState(null)
  const [specNom, setSpecNom] = useState('')
  const [myResas, setMyResas] = useState([])
  const [done, setDone]       = useState(null)
  const [loading, setLoading] = useState(null)
  const [searching, setSearching] = useState(false)
  const [err, setErr]         = useState('')

  const findById = async (id) => {
    const uid = id.toUpperCase().trim()
    setSearching(true); setErr('')

    // Priorité : eventId du staff > currentEventId > tous les événements
    const staffEventId = user?.eventId || currentEventId
    const evIds = staffEventId
      ? [staffEventId, ...(events||[]).map(e => e.id).filter(i => i !== staffEventId)]
      : (events||[]).map(e => e.id)

    try {
      for (const evId of evIds) {
        // Chercher le spectateur dans cet événement
        const snapSpec = await getDocs(
          query(collection(db, 'events', evId, 'spectateurs'), where('id', '==', uid))
        )
        if (!snapSpec.empty) {
          const specData = snapSpec.docs[0].data()
          // Chercher ses réservations actives dans le même événement
          const snapResa = await getDocs(
            query(collection(db, 'events', evId, 'reservations'), where('specId', '==', uid))
          )
          const resas = snapResa.docs
            .map(d => ({ ...d.data(), id: d.id }))
            .filter(r => r.status !== 'collected' && r.status !== 'cancelled')
          if (!resas.length) {
            setErr(`${specData.nom} n'a pas de réservation active.`)
            setSearching(false); return
          }
          setSpecId(uid)
          setSpecNom(specData.nom)
          setMyResas(resas)
          setErr('')
          setSearching(false)
          return
        }
      }
      setErr('Compte introuvable : ' + uid)
    } catch(e) {
      setErr('Recherche impossible : ' + e.message)
    }
    setSearching(false)
  }

  const doRetrait = async (resa) => {
    setLoading(resa.id)
    try {
      await validerRetrait(resa.id)
      setDone({ nom: resa.specNom, items: resa.items, total: resa.total })
      setSpecId(null)
    } catch (e) { setErr(e.message) }
    finally { setLoading(null) }
  }

  const reset = () => { setDone(null); setSpecId(null); setSpecNom(''); setMyResas([]); setErr('') }

  // myResas est maintenant géré dans findById (état local)
  const readyResas = reservations.filter(r => r.status === 'ready')

  return (
    <div className={clsx(s.page, sun && 'sun')}>
      {/* Barre d'outils */}
      <div className={s.toolbar}>
        <h2 className={s.title}>Retrait des réservations</h2>
        <button type="button" className={clsx(s.sunBtn, sun && s.sunOn)} onClick={toggleSun}
          aria-pressed={sun} title={sun ? 'Plein soleil activé' : "Plein soleil : contraste fort pour l'extérieur"}>
          <Sun size={16} aria-hidden="true" /> Plein soleil
        </button>
      </div>

      {done ? (
        <section className={clsx(s.card, s.done)} role="status" aria-live="polite">
          <SuccessCheck size={72} play={done} />
          <h3 className={s.doneTitle}>Retrait validé</h3>
          <p className={s.doneName}>{done.nom}</p>
          <p className={s.doneItems}>{itemsLabel(done.items)}</p>
          <p className={s.doneTotal}>−{fmt(done.total)}</p>
          <Button size="lg" block icon={RefreshCw} onClick={reset} autoFocus>Client suivant</Button>
        </section>
      ) : (<>
        {/* Scanner */}
        {!specId && (
          <section className={s.card}>
            <div>
              <h3 className={s.cardTitle}>Scanner le QR code</h3>
              <p className={s.muted}>Les réservations du spectateur s'affichent ici.</p>
            </div>
            <QrScanner onScan={findById} placeholder="FY-XXXX" />
            {searching && (
              <div className={s.searching} role="status" aria-label="Recherche en cours">
                <Skeleton height={16} width="55%" />
                <Skeleton height={48} radius="var(--radius)" />
              </div>
            )}
            {err && (
              <div className={s.err} role="alert"><AlertCircle size={16} aria-hidden="true" /> <span>{err}</span></div>
            )}
          </section>
        )}

        {/* Réservations du spectateur scanné */}
        {specId && myResas.length > 0 && (
          <section className={s.card}>
            <div className={s.cardHead}>
              <h3 className={s.cardTitle}>Réservations de {specNom}</h3>
              <Button variant="ghost" iconOnly icon={X} className={s.close} aria-label="Fermer et scanner un autre client"
                onClick={() => { setSpecId(null); setSpecNom(''); setMyResas([]); setErr('') }} />
            </div>
            {err && (
              <div className={s.err} role="alert"><AlertCircle size={16} aria-hidden="true" /> <span>{err}</span></div>
            )}
            <ul className={clsx(s.list, 'yc-stagger')}>
              {myResas.map(r => {
                const ready = r.status === 'ready'
                return (
                  <li key={r.id} className={clsx(s.resa, ready ? s.resaReady : s.resaWait)}>
                    <div className={s.resaTop}>
                      <span className={s.resaItems}>{itemsLabel(r.items)}</span>
                      <Badge tone={ready ? 'success' : 'warning'}>{ready ? 'Prêt' : 'En attente'}</Badge>
                    </div>
                    <div className={s.resaBottom}>
                      <span className={s.code}>{r.code}</span>
                      <span className={s.amount}>{fmt(r.total||0)}</span>
                    </div>
                    {ready && (
                      <Button size="lg" block onClick={() => doRetrait(r)} loading={loading===r.id}>
                        {loading===r.id ? 'Traitement…' : `Valider le retrait · débiter ${fmt(r.total||0)}`}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Toutes les réservations prêtes */}
        {readyResas.length > 0 && !specId && (
          <section className={s.card}>
            <h3 className={clsx(s.cardTitle, s.withIcon)}>
              <Package size={16} aria-hidden="true" /> Prêtes à retirer ({readyResas.length})
            </h3>
            <ul className={s.readyList}>
              {readyResas.map(r => (
                <li key={r.id} className={s.readyRow}>
                  <div className={s.readyText}>
                    <b>{r.specNom}</b>
                    <span>{itemsLabel(r.items)}</span>
                  </div>
                  <span className={s.readyAmount}>{fmt(r.total||0)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>)}
    </div>
  )
}
