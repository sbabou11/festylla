/**
 * hooks/usePeriodTransactions.js — transactions complètes d'une période
 * La liste en direct du store s'arrête aux 500 dernières transactions : pour une journée entière
 * ou une clôture, on relit la période dans Firestore. En cas d'échec (hors ligne, aperçu de démo),
 * on retombe sur la liste en direct et `partial` le signale.
 */
import { useEffect, useMemo, useState } from 'react'
import useAppStore from '../store/useAppStore'
import useEventStore from '../store/useEventStore'
import { fetchTransactionsBetween } from '../firebase/service'
import { txTime } from '../utils/dashboardData'

export function usePeriodTransactions(from, to, refreshKey = 0) {
  const { logs } = useAppStore()
  const { currentEventId } = useEventStore()
  const [state, setState] = useState({ list: null, loading: true, partial: false })

  const fallback = useMemo(() => (logs || []).filter(t => {
    const ms = txTime(t)
    return ms != null && ms >= from && ms < to
  }), [logs, from, to])

  useEffect(() => {
    if (from == null || to == null) return
    let alive = true
    if (!currentEventId || currentEventId === 'demo') {
      setState({ list: null, loading: false, partial: currentEventId !== 'demo' })
      return
    }
    setState(s => ({ ...s, loading: true }))
    fetchTransactionsBetween(from, to, currentEventId)
      .then(list => { if (alive) setState({ list, loading: false, partial: false }) })
      .catch(() => { if (alive) setState({ list: null, loading: false, partial: true }) })
    return () => { alive = false }
  }, [from, to, currentEventId, refreshKey])

  return { transactions: state.list || fallback, loading: state.loading, partial: state.partial }
}
