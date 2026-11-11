/**
 * hooks/useAutosave.js — enregistre tout seul après 800 ms sans saisie
 * const { status, savedAt, retry } = useAutosave(form, (v) => saveSettings(v, evId), { enabled: loaded })
 * status : idle | dirty | saving | saved | offline | error  (jamais « saved » si l'écriture a échoué)
 * Hors ligne : la dernière version attend le retour du réseau. Fermer l'onglet avec une saisie
 * non enregistrée demande confirmation au navigateur.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useAutosave(value, save, { delay = 800, enabled = true } = {}) {
  const [status, setStatus] = useState('idle')
  const [savedAt, setSavedAt] = useState(null)
  const first = useRef(true)
  const latest = useRef(value)
  const saveRef = useRef(save)
  const seq = useRef(0)
  const timer = useRef(null)
  saveRef.current = save
  latest.current = value

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (!navigator.onLine) { setStatus('offline'); return }
    const mine = ++seq.current
    setStatus('saving')
    try {
      await saveRef.current(latest.current)
      if (mine !== seq.current) return // une saisie plus récente part déjà
      setSavedAt(new Date()); setStatus('saved')
    } catch {
      if (mine === seq.current) setStatus(navigator.onLine ? 'error' : 'offline')
    }
  }, [])

  // Une valeur chargée depuis la base n'est pas une modification : on ignore le premier rendu activé
  useEffect(() => {
    if (!enabled) { first.current = true; return }
    if (first.current) { first.current = false; return }
    setStatus('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
    return () => clearTimeout(timer.current)
  }, [JSON.stringify(value), enabled])

  useEffect(() => {
    const onOnline = () => { if (status === 'offline') flush() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [status, flush])

  useEffect(() => {
    if (status !== 'dirty' && status !== 'saving' && status !== 'offline' && status !== 'error') return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  return { status, savedAt, retry: flush }
}
