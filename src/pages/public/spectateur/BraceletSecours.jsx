/**
 * BraceletSecours.jsx — « Mon bracelet de secours » dans l'espace du spectateur
 * (décidé le 24/11/2026, maquette 3NMrrVEtcXWWyVS5jE48Lk, écran 1 : relier dans son espace)
 *
 * Le spectateur scanne le QR de son bracelet avec son téléphone, choisit un code à 4 chiffres et le
 * tape deux fois. Ce code lui sera demandé à la borne, seulement quand il paie avec le bracelet
 * (téléphone déchargé). Ensuite : changer son code, ou bloquer un bracelet perdu.
 * Tout est vérifié et gardé par le serveur (/api/qr, actions bracelet-*) ; le code n'est jamais
 * conservé sur le téléphone.
 */
import React, { useEffect, useState } from 'react'
import { ShieldCheck, Lock, Watch } from 'lucide-react'
import QrScanner from '../../../components/QrScanner'
import { Button, CodeInput, toast } from '../../../ui'
import { apiFetch } from '../../../firebase/session'
import { lireBracelet, erreurCode, numeroAffiche } from '../../../utils/bracelet'
import s from './BraceletSecours.module.css'

export default function BraceletSecours({ eventId, demo = false }) {
  const [bracelet, setBracelet] = useState(undefined)   // undefined : chargement ; null : aucun
  const [etape, setEtape] = useState('carte')           // carte | scan | code1 | code2 | bloquer
  const [numero, setNumero] = useState('')              // bracelet scanné (relier) ; vide : changer le code
  const [code1, setCode1] = useState('')
  const [code2, setCode2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const appel = async (body) => {
    if (demo) {
      if (body.action === 'bracelet-etat') return { bracelet: null }
      if (body.action === 'bracelet-relier') return { bracelet: { numero: lireBracelet(body.bracelet), statut: 'actif' } }
      if (body.action === 'bracelet-bloquer') return { bracelet: { ...bracelet, statut: 'bloque', motif: 'perdu' } }
      return { bracelet }
    }
    return apiFetch('/api/qr', { body: { ev: eventId, ...body } })
  }

  useEffect(() => {
    let vivant = true
    appel({ action: 'bracelet-etat' })
      .then((r) => { if (vivant) setBracelet(r.bracelet || null) })
      .catch(() => { if (vivant) setBracelet(null) })
    return () => { vivant = false }
  }, [eventId])

  // tour : recrée les cases du code (vides, curseur dans la première) après un code refusé
  const [tour, setTour] = useState(0)
  const recommencer = (vers = 'carte') => { setEtape(vers); setCode1(''); setCode2(''); setErr(''); setTour((n) => n + 1) }

  const scanne = (texte) => {
    const n = lireBracelet(texte)
    if (!n) { setErr("Ce QR n'est pas celui d'un bracelet YllaCash. Scannez le QR imprimé sur votre bracelet."); return }
    setNumero(n); recommencer('code1')
  }

  const premierCode = (c) => {
    const e = erreurCode(c)
    if (e) { setErr(e); setCode1(''); setTour((n) => n + 1); return }
    setErr(''); setCode1(c); setEtape('code2')
  }

  const secondCode = async (c) => {
    if (c !== code1) { recommencer('code1'); setErr('Les deux codes ne correspondent pas. Recommencez.'); return }
    setBusy(true)
    try {
      const r = await appel(numero ? { action: 'bracelet-relier', bracelet: numero, code: c } : { action: 'bracelet-code', code: c })
      setBracelet(r.bracelet)
      toast.success(numero ? 'Bracelet relié, code enregistré' : 'Nouveau code enregistré')
      setNumero(''); recommencer('carte')
    } catch (e) {
      recommencer(numero ? 'scan' : 'carte'); setErr(e.message || 'Enregistrement impossible, réessayez.')
    } finally { setBusy(false) }
  }

  const bloquer = async () => {
    setBusy(true)
    try {
      const r = await appel({ action: 'bracelet-bloquer' })
      setBracelet(r.bracelet); recommencer('carte'); toast.success('Bracelet bloqué')
    } catch (e) { setErr(e.message || 'Blocage impossible, réessayez.') }
    finally { setBusy(false) }
  }

  if (bracelet === undefined) return null

  let corps
  if (etape === 'scan') {
    corps = (<>
      <b>Scannez le QR de votre bracelet</b>
      <QrScanner onScan={scanne} parse={lireBracelet} onIllisible={() => setErr("Ce QR n'est pas celui d'un bracelet YllaCash. Scannez le QR imprimé sur votre bracelet.")}
        placeholder="Numéro du bracelet (ex : K7Q3 PX9M)" hint="Pointez la caméra vers le QR de votre bracelet" simulate={['FYB-TESTQR26']} completerBillet={false} />
      <Button variant="secondary" block onClick={() => recommencer('carte')}>Annuler</Button>
    </>)
  } else if (etape === 'code1' || etape === 'code2') {
    const premier = etape === 'code1'
    corps = (<>
      <b>{premier ? (numero ? 'Choisissez votre code' : 'Choisissez votre nouveau code') : 'Tapez-le une 2ᵉ fois'}</b>
      {numero && <p className="nv-mu">Bracelet n° {numeroAffiche(numero)}</p>}
      <p className="nv-mu">4 chiffres. Il vous sera demandé à la borne, seulement quand vous payez avec le bracelet. Évitez 1234 ou votre année de naissance.</p>
      <CodeInput key={`${etape}-${tour}`}length={4} numeric mask autoFocus disabled={busy} label={premier ? 'Code à 4 chiffres' : 'Confirmez le code'}
        value={premier ? code1 : code2} onChange={premier ? setCode1 : setCode2} onComplete={premier ? premierCode : secondCode}
        status={err ? 'error' : null} className={s.code} />
      <Button variant="secondary" block disabled={busy} onClick={() => { setNumero(''); recommencer('carte') }}>Annuler</Button>
    </>)
  } else if (etape === 'bloquer') {
    corps = (<>
      <b>Bloquer le bracelet n° {numeroAffiche(bracelet?.numero)} ?</b>
      <p className="nv-mu">Il ne permettra plus de payer, même avec le bon code. Vous pourrez relier un nouveau bracelet ensuite.</p>
      <Button variant="danger" block loading={busy} onClick={bloquer}>Bloquer mon bracelet</Button>
      <Button variant="secondary" block disabled={busy} onClick={() => recommencer('carte')}>Annuler</Button>
    </>)
  } else if (!bracelet) {
    corps = (<>
      <p className="nv-mu">Si votre téléphone est déchargé, payez à la borne avec votre bracelet et votre code à 4 chiffres. Prenez un bracelet à l'entrée ou au guichet.</p>
      <Button block onClick={() => { setNumero(''); recommencer('scan') }}>Relier mon bracelet</Button>
    </>)
  } else if (bracelet.statut === 'actif') {
    corps = (<>
      <div className={s.bracelet}>
        <span className={s.ic} aria-hidden="true"><Watch size={20} /></span>
        <span className={s.txt}><b>Bracelet n° {numeroAffiche(bracelet.numero)}</b><span className="nv-mu">Relié · code choisi</span></span>
      </div>
      <p className={s.ok}><ShieldCheck size={16} aria-hidden="true" /> Prêt : à la borne, présentez le bracelet puis tapez votre code.</p>
      <Button variant="secondary" block onClick={() => { setNumero(''); recommencer('code1') }}>Changer mon code</Button>
      <Button variant="secondary" block icon={Lock} onClick={() => recommencer('bloquer')}>J'ai perdu mon bracelet : le bloquer</Button>
    </>)
  } else {
    corps = (<>
      <p className={s.err}>Bracelet n° {numeroAffiche(bracelet.numero)} bloqué{bracelet.motif === 'essais' ? ' après 3 codes faux' : ''} : il ne permet plus de payer.</p>
      <p className="nv-mu">Prenez un nouveau bracelet à l'entrée ou au guichet, puis reliez-le ici.</p>
      <Button block onClick={() => { setNumero(''); recommencer('scan') }}>Relier un nouveau bracelet</Button>
    </>)
  }

  return (
    <section className={`nv-glass ${s.carte}`} aria-label="Mon bracelet de secours">
      {etape === 'carte' && <b>Mon bracelet de secours</b>}
      {err && <p className={s.err} role="alert">{err}</p>}
      {corps}
    </section>
  )
}
