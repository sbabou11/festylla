/**
 * hooks/useImpression.js — imprimante de tickets de la borne (20/11/2026)
 *
 * useImprimante()        : état de l'imprimante, connexion par l'équipe, ticket d'essai, réglage
 *                          « Sans accents » (retenu par la tablette).
 * useImpressionTickets() : imprime une série de tickets à l'affichage d'un écran et suit la
 *                          progression. phase : 'impression' | 'ok' | 'panne' | 'absente'.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as imp from '../utils/imprimante'
import { octetsTicket, ticketEssai } from '../utils/escpos'

const CLE_ACCENTS = 'yllacash-imprimante-sans-accents'
export const sansAccentsRegle = () => { try { return localStorage.getItem(CLE_ACCENTS) === '1' } catch { return false } }

export function useImprimante() {
  const [etat, setEtat] = useState(() => imp.etat())
  const [sansAccents, setSansAccentsState] = useState(sansAccentsRegle)
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const off = imp.surChangement(setEtat)
    imp.retrouver().then(setEtat).catch(() => {})
    return off
  }, [])

  const connecter = useCallback(async () => {
    setOccupe(true); setMessage('')
    try { setEtat(await imp.connecter()); setMessage('Imprimante connectée.') }
    catch (e) { if (e?.name !== 'NotFoundError') setMessage(e?.message || 'Connexion impossible.') }   // NotFoundError : fenêtre fermée sans choisir
    finally { setOccupe(false) }
  }, [])

  const essai = useCallback(async (festival) => {
    setOccupe(true); setMessage('')
    try {
      const date = new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      await imp.imprimer([octetsTicket(ticketEssai(festival, date), { accents: !sansAccentsRegle() })])
      setMessage('Ticket d\'essai envoyé.')
    } catch (e) { setMessage(e?.message || 'L\'imprimante ne répond pas.') }
    finally { setOccupe(false) }
  }, [])

  const setSansAccents = useCallback((v) => {
    try { localStorage.setItem(CLE_ACCENTS, v ? '1' : '0') } catch {}
    setSansAccentsState(v)
  }, [])

  return { etat, occupe, message, connecter, essai, sansAccents, setSansAccents }
}

/** tickets : objets ticket (utils/escpos) ; imprimés une seule fois à l'affichage de l'écran */
export function useImpressionTickets(tickets) {
  const [phase, setPhase] = useState(() => (imp.etat().connectee ? 'impression' : 'absente'))
  const [progres, setProgres] = useState({ ticket: 1, total: tickets.length, pourcent: 0, resteMs: 0 })
  const lance = useRef(false)

  const lancer = useCallback(async () => {
    if (!tickets.length) { setPhase('ok'); return }
    await imp.retrouver().catch(() => {})
    if (!imp.etat().connectee) { setPhase('absente'); return }
    setPhase('impression')
    try {
      const accents = !sansAccentsRegle()
      await imp.imprimer(tickets.map(t => octetsTicket(t, { accents })), setProgres)
      setPhase('ok')
    } catch (e) {
      console.error('Borne impression:', e)
      setPhase('panne')
    }
  }, [tickets])

  useEffect(() => {
    if (lance.current) return
    lance.current = true
    lancer()
  }, [lancer])

  return { phase, progres, reessayer: lancer }
}
