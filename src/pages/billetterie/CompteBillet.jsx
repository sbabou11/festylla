/**
 * pages/billetterie/CompteBillet.jsx — compte pour un billet acheté « sans compte » (23/11/2026)
 *
 * Refonte des rôles validée par l'organisateur (maquette « Écran 5 ») : à la demande du spectateur,
 * la billetterie lit son billet (QR de l'e-mail ou code), coche ses trois accords (demande, conditions
 * d'utilisation, délai de remboursement), puis le serveur crée le compte et donne un jeton à usage
 * unique, valable 2 minutes, affiché en QR : le spectateur le scanne avec son téléphone et son espace
 * s'ouvre. Rien n'est imprimé ; les accords et l'auteur sont enregistrés (fiche + journal d'audit).
 */
import React, { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { AlertTriangle, Check } from 'lucide-react'
import { db } from '../../firebase/config'
import { apiFetch } from '../../firebase/session'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import QrCode from '../../components/QrCode'
import QrScanner from '../../components/QrScanner'
import { extractSpecId } from '../../utils/specCode'
import { limiteRemboursement } from '../../utils/dons'
import { friendlyError } from '../../utils/errors'
import { Button } from '../../ui'
import t from './rembTicket.module.css'

const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const ACCORDS = [
  ['demande', 'Le spectateur demande la création de son compte YllaCash.'],
  ['conditions', "Il a pris connaissance des conditions d'utilisation de YllaCash."],
  ['remboursement', null], // texte calculé avec la date limite de l'événement
]

export default function CompteBillet() {
  const { currentEventId, events } = useEventStore()
  const { user } = useAuthStore()
  const evt = (events || []).find(e => e.id === currentEventId)
  const limite = limiteRemboursement(evt)
  const limiteTxt = limite ? new Date(limite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const [billet, setBillet] = useState(null)      // réponse de « billet-voir »
  const [lu, setLu] = useState('')                // code lu, pour les messages
  const [accords, setAccords] = useState({ demande: false, conditions: false, remboursement: false })
  const [lien, setLien] = useState(null)          // { jeton, expMs }
  const [reste, setReste] = useState(0)
  const [utilise, setUtilise] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!lien) return
    const tick = () => setReste(Math.max(0, Math.ceil((lien.expMs - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    const off = onSnapshot(doc(db, 'events', currentEventId, 'jetons-lien', lien.jeton),
      snap => { if (snap.data()?.utiliseMs) setUtilise(heure(snap.data().utiliseMs)) }, () => {})
    return () => { clearInterval(timer); off() }
  }, [lien, currentEventId])

  const chercher = async (texte) => {
    const specId = extractSpecId(texte)
    setErr(''); setBillet(null); setLu(specId || String(texte || '').trim())
    if (!specId) { setErr('Ce QR ou ce code n\'est pas un billet. Présentez le QR reçu par e-mail ou tapez le code du billet.'); return }
    setBusy(true)
    try { setBillet(await apiFetch('/api/qr', { body: { action: 'billet-voir', ev: currentEventId, specId } })) }
    catch (e) { setErr(friendlyError(e, 'Le billet n\'a pas pu être lu.')) }
    finally { setBusy(false) }
  }
  const creer = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiFetch('/api/qr', { body: { action: 'compte-billet', ev: currentEventId, docId: billet.docId, accords, staff: user?.nom || 'Billetterie' } })
      setLien({ jeton: r.jeton, expMs: Date.now() + (r.secondes || 120) * 1000 })
    } catch (e) { setErr(friendlyError(e, 'Le compte n\'a pas pu être créé.')) }
    finally { setBusy(false) }
  }
  // QR expiré : un nouveau jeton (le compte existe désormais, comme pour « Lien perdu »)
  const autreQr = async () => {
    setBusy(true); setErr('')
    try {
      const r = await apiFetch('/api/qr', { body: { action: 'nouveau-lien', ev: currentEventId, docId: billet.docId, staff: user?.nom || 'Billetterie' } })
      setLien({ jeton: r.jeton, expMs: Date.now() + (r.secondes || 120) * 1000 })
    } catch (e) { setErr(friendlyError(e, 'Le QR n\'a pas pu être renouvelé.')) }
    finally { setBusy(false) }
  }
  const terminer = () => { setBillet(null); setLu(''); setLien(null); setUtilise(null); setErr(''); setAccords({ demande: false, conditions: false, remboursement: false }) }

  const wrap = { maxWidth: 520, margin: '0 auto' }
  const tous = Object.values(accords).every(Boolean)

  if (utilise) {
    return (
      <div className={t.stack} style={wrap}>
        <div className={t.done}>
          <span className={t.doneIcon}><Check size={28} aria-hidden="true" /></span>
          <h2>Espace ouvert à {utilise}</h2>
          <p className={t.muted}>Le compte de {billet?.nom} est ouvert sur son téléphone.</p>
        </div>
        <p className={t.muted} style={{ textAlign: 'center' }}>Fait par {user?.nom || 'Billetterie'} · accords et création notés dans le journal d'audit.</p>
        <Button block onClick={terminer}>Terminer</Button>
      </div>
    )
  }

  if (lien) {
    const url = `${window.location.origin}/solde?ev=${encodeURIComponent(currentEventId)}&jeton=${lien.jeton}`
    return (
      <div className={t.stack} style={wrap}>
        <p className={t.warn}><Check size={16} aria-hidden="true" /><span>Compte créé pour {billet?.nom}. Faites scanner ce QR avec l'appareil photo de son téléphone : il ouvre son espace.</span></p>
        <section className={t.card} style={{ justifyItems: 'center', textAlign: 'center' }}>
          {reste > 0 ? <QrCode value={url} size={200} /> : <p className={t.hint}>Ce QR a expiré.</p>}
          <p className={t.muted}>À usage unique · {reste > 0 ? `valable encore ${reste} s` : 'générez-en un autre'}</p>
          {err && <p className={t.err} role="alert">{err}</p>}
          {reste <= 0 && <Button variant="secondary" block loading={busy} onClick={autreQr}>Générer un autre QR</Button>}
        </section>
        <p className={t.muted} style={{ textAlign: 'center' }}>Rien n'est imprimé ni envoyé : le QR ne sert qu'une fois.</p>
        <Button variant="ghost" block onClick={terminer}>Terminé</Button>
      </div>
    )
  }

  if (billet) {
    if (!billet.trouve) {
      return (
        <div className={t.stack} style={wrap}>
          <p className={t.warn}><AlertTriangle size={16} aria-hidden="true" /><span>Billet {lu} inconnu pour l'événement « {evt?.nom || 'en cours'} ». Vérifiez le code ou l'événement choisi.</span></p>
          <Button block onClick={terminer}>Scanner un autre billet</Button>
        </div>
      )
    }
    if (billet.annule || !billet.sansCompte) {
      return (
        <div className={t.stack} style={wrap}>
          <p className={t.warn}><AlertTriangle size={16} aria-hidden="true" /><span>{billet.annule
            ? `Ce billet (${billet.nom}) a été annulé : pas de compte possible.`
            : `Ce billet a déjà un compte YllaCash (${billet.nom}). Si le spectateur a perdu son lien, utilisez « Lien perdu ».`}</span></p>
          <Button block onClick={terminer}>Scanner un autre billet</Button>
        </div>
      )
    }
    return (
      <div className={t.stack} style={wrap}>
        <section className={t.card}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Billet</h2>
          <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
            {[['Code', billet.specId], ['Nom', billet.nom || '—'], ['Pass', billet.pass || `${billet.jours} jour${billet.jours > 1 ? 's' : ''}`], ['Compte', "aucun (choisi à l'achat)"]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><dt className={t.muted}>{k}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd></div>
            ))}
          </dl>
        </section>
        <fieldset className={t.card} style={{ border: 0 }}>
          <legend style={{ fontWeight: 700, fontSize: 16, padding: 0, marginBottom: 6 }}>Accord du spectateur</legend>
          {ACCORDS.map(([k, txt]) => (
            <label key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer', lineHeight: 1.45 }}>
              <input type="checkbox" checked={accords[k]} onChange={e => setAccords(a => ({ ...a, [k]: e.target.checked }))}
                style={{ width: 22, height: 22, flex: 'none', marginTop: 1, accentColor: 'var(--brand)' }} />
              <span>{txt || `Il est informé que son solde restant est remboursable${limiteTxt ? ` jusqu'au ${limiteTxt}` : ' pendant 2 mois après le festival'}, puis reversé à l'ONG Ylla.`}</span>
            </label>
          ))}
        </fieldset>
        {err && <p className={t.err} role="alert">{err}</p>}
        <Button block loading={busy} disabled={!tous} onClick={creer}>Créer le compte</Button>
        <Button variant="ghost" block onClick={terminer}>Annuler</Button>
      </div>
    )
  }

  return (
    <div className={t.stack} style={wrap}>
      <section className={t.card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Billet du spectateur</h2>
        <p className={t.muted} style={{ margin: 0 }}>Pour un billet acheté sans compte, à la demande du spectateur. Présentez le QR du billet (e-mail du site) ou tapez son code.</p>
        <QrScanner onScan={chercher} parse={extractSpecId} onIllisible={(x) => chercher(x)}
          placeholder="Code du billet (ex : K7Q3NP)" hint="Présentez le billet devant la caméra" />
        {busy && <p className={t.muted}>Lecture du billet…</p>}
        {err && <p className={t.err} role="alert">{err}</p>}
      </section>
    </div>
  )
}
