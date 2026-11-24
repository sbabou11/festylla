/**
 * pages/admin/settings/SecoursSettings.jsx — réglages de secours du paiement (20/11/2026)
 *
 * Deux interrupteurs, enregistrés dans events/{id}/settings/global, à n'activer qu'en cas de panne :
 *   scannerEnPanne  : un code tournant (ex. KT-4821) s'affiche sous le QR des spectateurs, à taper
 *                     à la borne, en caisse et à la billetterie ;
 *   liaisonEnPanne  : la billetterie peut de nouveau créer un compte, le temps que le site
 *                     internet renvoie ses billets (en temps normal, les comptes viennent du site).
 * Réservé aux administrateurs.
 */
import React, { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { LifeBuoy } from 'lucide-react'
import { db } from '../../../firebase/config'
import { saveSettings, addAuditLog } from '../../../firebase/service'
import useEventStore from '../../../store/useEventStore'
import useAuthStore from '../../../store/useAuthStore'
import { friendlyError } from '../../../utils/errors'
import { Card, toast } from '../../../ui'
import s from './settings.module.css'

const REGLAGES = [
  { key: 'scannerEnPanne', titre: 'Scanner en panne',
    texte: 'Affiche un code tournant sous le QR des spectateurs, à taper à la borne, en caisse et à la billetterie.' },
  { key: 'liaisonEnPanne', titre: 'Liaison du site en panne',
    texte: 'Rouvre la création de compte à la billetterie, le temps que le site internet renvoie ses billets.' },
  // 23/11/2026 (refonte des rôles, écran 7) : la billetterie encaisse et imprime les tickets au guichet
  { key: 'borneEnPanne', titre: 'Borne en panne',
    texte: 'Ouvre « Encaisser » à la billetterie et y imprime les tickets. Les ventes sont comptées à part dans la clôture.' },
]
const heure = (iso) => { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

export default function SecoursSettings() {
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [etat, setEtat] = useState({})
  const [busy, setBusy] = useState('')
  const admin = ['admin', 'super_admin'].includes(user?.role)

  useEffect(() => {
    if (!currentEventId) return
    return onSnapshot(doc(db, 'events', currentEventId, 'settings', 'global'), snap => setEtat(snap.data() || {}), () => {})
  }, [currentEventId])

  if (!admin || !currentEventId) return null
  const basculer = async (key) => {
    setBusy(key)
    try {
      const actif = !etat[key]
      const qui = user?.nom || user?.email || 'Admin'
      await saveSettings({ [key]: actif,
        ...(key === 'borneEnPanne' ? { borneEnPanneDepuis: actif ? new Date().toISOString() : null, borneEnPannePar: actif ? qui : null } : {}) }, currentEventId)
      if (key === 'borneEnPanne') {
        addAuditLog(actif ? 'BORNE_PANNE_ACTIVEE' : 'BORNE_PANNE_DESACTIVEE', {
          staff: qui, label: actif ? 'Borne déclarée en panne : « Encaisser » ouvert à la billetterie' : 'Fin de la panne de borne : « Encaisser » refermé à la billetterie',
        }).catch(() => {})
      }
      toast.success(!etat[key] ? 'Mode secours activé' : 'Mode secours désactivé')
    } catch (e) { toast.error(friendlyError(e, 'Le réglage n\'a pas été enregistré.')) }
    finally { setBusy('') }
  }
  const actifs = REGLAGES.filter(r => etat[r.key] === true).length

  return (
    <Card title={<span className={s.cardTitle}><LifeBuoy size={16}/>Paiement : modes de secours</span>}
      subtitle="À activer seulement pendant une panne, puis à désactiver.">
      <div className={s.rows}>
        {REGLAGES.map(r => (
          <label key={r.key} className={s.toggle}>
            <input type="checkbox" checked={etat[r.key] === true} disabled={!!busy} onChange={() => basculer(r.key)} />
            <span>
              <span className={s.toggleTitle}>{r.titre}</span>
              <span className={s.hint}>{r.texte}</span>
              {r.key === 'borneEnPanne' && etat.borneEnPanne === true && etat.borneEnPanneDepuis && (
                <span className={s.hint}><b>Activé par {etat.borneEnPannePar || 'un admin'} à {heure(etat.borneEnPanneDepuis)}</b> · noté au journal d'audit</span>
              )}
            </span>
          </label>
        ))}
        {actifs > 0 && <p className={s.hint} role="status"><b>Mode secours actif.</b> Pensez à le désactiver dès que tout refonctionne.</p>}
      </div>
    </Card>
  )
}
