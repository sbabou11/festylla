/**
 * ResaKanban — réservations actives en trois colonnes.
 * En attente → « Prendre en charge » → En préparation → « Prête » → Prêtes à retirer.
 * Le retrait lui-même reste au stand (scan du QR).
 */
import React, { useState } from 'react'
import clsx from 'clsx'
import { Button, Badge, toast } from '../../../ui'
import useAppStore from '../../../store/useAppStore'
import { fmt } from '../../../utils/helpers'
import { ResaDetailSheet } from '../../../components/detailContenus'
import s from './Dashboard.module.css'
import a from '../accueil/Accueil.module.css'

const COLUMNS = [
  { status: 'pending',    title: 'En attente',       action: 'Prendre en charge', run: 'prendreEnCharge' },
  { status: 'processing', title: 'En préparation',   action: 'Prête',             run: 'marquerResaPrete' },
  { status: 'ready',      title: 'Prêtes à retirer' },
]
const PER_COLUMN = 5
const STATUT_TONE = { pending: 'warning', processing: 'coral', ready: 'success' }

export default function ResaKanban({ reservations, onSeeAll }) {
  const store = useAppStore()
  const [busy, setBusy] = useState(null)
  const [openId, setOpenId] = useState(null)
  // On garde l'identifiant : le détail suit les changements de statut en direct
  const openResa = openId ? reservations.find(r => r.id === openId) || null : null
  const openCol = openResa ? COLUMNS.find(c => c.status === openResa.status) : null

  const advance = async (r, col) => {
    setBusy(r.id)
    try {
      await store[col.run](r.id)
      toast.success(col.run === 'marquerResaPrete'
        ? `#${r.code} prête : ${r.specNom || r.benevoleNom || 'le client'} est notifié`
        : `#${r.code} prise en charge`)
    } catch (e) {
      toast.error(`Impossible de mettre à jour #${r.code} : ${e?.message || 'erreur réseau'}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={s.kanban}>
      {COLUMNS.map(col => {
        const list = reservations.filter(r => r.status === col.status)
        return (
          <section key={col.status} className={s.column} aria-label={col.title}>
            <header className={s.colHead}>
              <span>{col.title}</span>
              <span className={s.colCount}>{list.length}</span>
            </header>
            {list.length === 0 && <p className={s.colEmpty}>Aucune</p>}
            {list.slice(0, PER_COLUMN).map(r => (
              <article key={r.id} className={clsx(s.ticket, col.status === 'ready' && s.ticketReady)}>
                {/* 23/11/2026 : le haut du ticket ouvre le détail ; le bouton d'action reste à part */}
                <button type="button" className={a.cardBtn} aria-haspopup="dialog"
                  aria-label={`Réservation #${r.code} de ${r.benevoleNom || r.specNom || 'client inconnu'}, ${col.title.toLowerCase()} : voir le détail`}
                  onClick={() => setOpenId(r.id)}>
                  <span className={s.ticketTop}>
                    <span className={s.ticketName}>
                      #{r.code} {r.benevoleNom || r.specNom || '—'}
                    </span>
                    <span className={s.ticketTotal}>{r.isBenev ? '—' : fmt(r.total || 0)}</span>
                  </span>
                  <span className={clsx(s.ticketItems, a.block)}>
                    {r.isBenev && <Badge tone="brand">Bénévole</Badge>}{' '}
                    {(r.items || []).map(i => `${i.qty > 1 ? `${i.qty} ` : ''}${i.nom}`).join(' · ')}
                  </span>
                </button>
                {col.action && (
                  <Button size="sm" variant={col.status === 'processing' ? 'primary' : 'secondary'}
                    loading={busy === r.id} onClick={() => advance(r, col)}>
                    {col.action}
                  </Button>
                )}
              </article>
            ))}
            {list.length > PER_COLUMN && (
              <button type="button" className={s.more} onClick={onSeeAll}>+ {list.length - PER_COLUMN} autres</button>
            )}
          </section>
        )
      })}

      {/* Détail d'une réservation (23/11/2026) : mêmes actions que le ticket */}
      <ResaDetailSheet resa={openResa} onClose={() => setOpenId(null)}
        statut={openCol ? { label: openCol.title, tone: STATUT_TONE[openCol.status] } : null}
        actions={openResa && (<>
          {openCol?.action && (
            <Button block variant={openCol.status === 'processing' ? 'primary' : 'secondary'}
              loading={busy === openResa.id} onClick={() => advance(openResa, openCol)}>
              {openCol.action}
            </Button>
          )}
          {onSeeAll && <Button block variant="ghost" onClick={() => { setOpenId(null); onSeeAll() }}>Voir toutes les réservations</Button>}
        </>)}/>
    </div>
  )
}
