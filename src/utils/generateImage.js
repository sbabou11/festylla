/**
 * utils/generateImage.js — génère l'image d'un article via /api/generate-image
 *
 * Lance la génération, interroge le statut toutes les 2 s, puis renvoie l'image (Blob).
 * La description est construite côté serveur à partir de la fiche enregistrée :
 * il faut donc enregistrer l'article avant de générer.
 */

import useEventStore from '../store/useEventStore'

async function call(body) {
  const resp = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const j = await resp.json().catch(() => ({}))
    throw new Error(j.error || `Génération impossible (erreur ${resp.status})`)
  }
  return resp
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Annulé', 'AbortError')) }, { once: true })
})

export async function generateMenuImage({ eventId: ev, itemId, signal, timeoutMs = 180_000 }) {
  const eventId = ev || useEventStore.getState().currentEventId
  if (!eventId) throw new Error('Choisissez d’abord un événement.')
  const { requestId } = await (await call({ action: 'start', eventId, itemId })).json()
  const until = Date.now() + timeoutMs
  for (;;) {
    await wait(2000, signal)
    const { status, error } = await (await call({ action: 'status', eventId, itemId, requestId })).json()
    if (status === 'completed') break
    if (['failed', 'nsfw', 'canceled'].includes(status)) throw new Error(error || 'La génération a échoué.')
    if (Date.now() > until) throw new Error('La génération prend trop de temps. Réessayez dans un instant.')
  }
  return (await call({ action: 'image', eventId, itemId, requestId })).blob()
}
