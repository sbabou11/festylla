/**
 * pages/billetterie/Credit.jsx — recharge d'un portefeuille
 * Flux : scanner → choisir montant (1 tap) → confirmer
 * Boutons larges, coche de réussite et nouveau solde qui défile depuis l'ancien.
 */
import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import useAppStore   from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db }        from '../../firebase/config'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'
import QrScanner from '../../components/QrScanner'
import { Wallet, RefreshCw, X, Banknote, CreditCard } from 'lucide-react'
import { Button, Card, SuccessCheck, AnimatedNumber } from '../../ui'
import s from './credit.module.css'

const MONTANTS = [10, 20, 30, 50, 100]
const MOYENS = [{ value: 'Espèces', icon: Banknote }, { value: 'Carte bancaire', icon: CreditCard }]

// Affiche l'ancien solde puis défile vers le nouveau
function RollingBalance({ from, to }) {
  const [v, setV] = useState(from)
  useEffect(() => { const t = setTimeout(() => setV(to), 450); return () => clearTimeout(t) }, [from, to])
  return <AnimatedNumber value={v} format={fmt} duration={800} />
}

export default function Credit() {
  const { spectateurs, crediter } = useAppStore()
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const [spec, setSpec]     = useState(null)
  const [montant, setMontant] = useState(20)
  const [moyen, setMoyen]   = useState('Espèces')
  const [done, setDone]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState('')

  const findById = async (id) => {
    const uid = id.toUpperCase().trim()

    // 1. Chercher dans le store local (rapide)
    const local = spectateurs.find(x => x.id === uid)
    if (local) { setSpec(local); setErr(''); return }

    // 2. Chercher dans Firebase — événement actif d'abord
    setErr('Recherche en cours…')
    try {
      // Priorité : eventId du staff connecté > currentEventId store > tous les événements
      const staffEventId = user?.eventId || currentEventId
      const evIds = staffEventId
        ? [staffEventId, ...events.map(e => e.id).filter(id => id !== staffEventId)]
        : events.map(e => e.id)

      for (const evId of evIds) {
        const snap = await getDocs(
          query(collection(db, 'events', evId, 'spectateurs'), where('id', '==', uid))
        )
        if (!snap.empty) {
          const data = snap.docs[0].data()
          setSpec({ ...data, _docId: snap.docs[0].id, _eventId: evId })
          setErr('')
          return
        }
      }
      setErr('Compte introuvable : ' + uid)
      setSpec(null)
    } catch (e) {
      setErr('Erreur de recherche : ' + e.message)
      setSpec(null)
    }
  }

  const doCredit = async () => {
    if (!spec || !montant) return
    setLoading(true)
    try {
      await crediter(spec.id, montant, user?.nom || 'Billetterie', spec._eventId || currentEventId,
        { moyen: moyen === 'Espèces' ? 'especes' : 'cb' })
      setDone({ nom: spec.nom, montant, newSolde: spec.solde + montant * 100 })
      setSpec(null); setMontant(20)
    } catch (e) { setErr('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }

  const reset = () => { setDone(null); setSpec(null); setErr(''); setMontant(20) }

  // ── Succès ─────────────────────────────────────────────────────────
  if (done) return (
    <div className={s.page}>
      <Card className={s.done}>
        <SuccessCheck size={64} play={done.newSolde} />
        <h2 className={s.doneTitle}>{done.montant} € crédités</h2>
        <p className={s.doneName}>{done.nom}</p>
        <div className={s.doneBalance}>
          <Wallet size={18} aria-hidden="true" />
          <RollingBalance from={done.newSolde - done.montant * 100} to={done.newSolde} />
        </div>
        <Button block size="lg" icon={RefreshCw} onClick={reset} autoFocus>Nouveau client</Button>
      </Card>
    </div>
  )

  return (
    <div className={s.page}>

      {/* Étape 1 — Scanner */}
      {!spec && (
        <Card title="Identifier le spectateur" subtitle="Scannez le QR code ou entrez l'ID">
          <QrScanner onScan={findById} placeholder="Ex : FY-4A2B"/>
          {err && <p className={clsx(s.msg, err === 'Recherche en cours…' ? s.msgInfo : s.msgErr)} role="status">{err}</p>}
        </Card>
      )}

      {/* Étape 2 — Créditer */}
      {spec && (
        <>
          {/* Fiche spectateur — dégradé marine-teal */}
          <div className={s.client}>
            <div className={s.clientQr}><QrCode value={spec.id} size={56}/></div>
            <div className={s.clientInfo}>
              <b className={s.clientName}>{spec.nom}</b>
              <span className={s.clientId}>{spec.id}</span>
              <span className={s.clientSolde}>{fmt(spec.solde)}</span>
            </div>
            <button type="button" onClick={() => setSpec(null)} className={s.clientClose} aria-label="Changer de spectateur">
              <X size={16} />
            </button>
          </div>

          <Card>
            <div className={s.form}>
              {/* Montants rapides — boutons larges */}
              <div className={s.group} role="group" aria-labelledby="credit-montant">
                <span id="credit-montant" className={s.label}>Montant à créditer</span>
                <div className={s.amounts}>
                  {MONTANTS.map(v => (
                    <button key={v} type="button" onClick={() => setMontant(v)} aria-pressed={montant === v}
                      className={clsx(s.amount, montant === v && s.amountOn)}>
                      {v} €
                    </button>
                  ))}
                </div>
                {/* Montant personnalisé */}
                <label className={s.custom}>
                  <span>Autre montant</span>
                  <input type="number" value={montant} min={1} max={500} inputMode="numeric"
                    onChange={e => setMontant(parseInt(e.target.value)||0)} className={s.customInput}/>
                  <span aria-hidden="true">€</span>
                </label>
              </div>

              {/* Mode de paiement */}
              <div className={s.group} role="group" aria-labelledby="credit-moyen">
                <span id="credit-moyen" className={s.label}>Mode de paiement</span>
                <div className={s.moyens}>
                  {MOYENS.map(({ value: m, icon: Icon }) => (
                    <button key={m} type="button" onClick={() => setMoyen(m)} aria-pressed={moyen === m}
                      className={clsx(s.moyen, moyen === m && s.moyenOn)}>
                      <Icon size={16} aria-hidden="true" /> {m}
                    </button>
                  ))}
                </div>
              </div>

              {err && <p className={clsx(s.msg, s.msgErr)} role="alert">{err}</p>}

              {/* CTA principal — très grand et visible */}
              <Button size="lg" block onClick={doCredit} loading={loading} disabled={!montant || montant < 1} className={s.cta}>
                Créditer {montant} € · {moyen}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
