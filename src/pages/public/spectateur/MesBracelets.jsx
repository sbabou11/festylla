/**
 * MesBracelets.jsx — « Mes bracelets » dans l'espace du spectateur
 * (plusieurs bracelets par compte, maquette v2 validée le 28/11/2026 ; remplace « Mon bracelet de secours »)
 *
 * Un seul solde, jusqu'à 6 bracelets (famille, petit groupe). Pour chacun : un prénom facultatif,
 * une case « mineur » (pas d'alcool à la borne), un plafond par jour, et son code à 4 chiffres.
 * Un bracelet « mineur » est sans code par défaut : son plafond est alors obligatoire (30 € par jour
 * au plus, 10 € par achat). Un bracelet perdu se bloque d'ici, sans toucher aux autres.
 * Tout est vérifié et gardé par le serveur (/api/qr, actions bracelet-*) ; le code n'est jamais
 * conservé sur le téléphone. Seule la billetterie décoche « mineur ».
 *
 * useBracelets() sert aussi à la carte de l'accueil (accès rapide).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Lock, Watch, ChevronRight, Plus } from 'lucide-react'
import QrScanner from '../../../components/QrScanner'
import { Badge, Button, CodeInput, toast } from '../../../ui'
import { apiFetch } from '../../../firebase/session'
import { lireBracelet, erreurCode, numeroAffiche } from '../../../utils/bracelet'
import s from './BraceletSecours.module.css'

export const MAX_BRACELETS = 6
export const PLAFOND_SANS_CODE_MAX = 30
export const ACHAT_SANS_CODE_MAX = 10

const DEMO = [
  { numero: 'K7Q3PX9M', statut: 'actif', prenom: 'Moi', mineur: false, avecCode: true, plafondJour: null, relieMs: 1 },
  { numero: 'R4TW8HNE', statut: 'actif', prenom: 'Léa', mineur: true, avecCode: false, plafondJour: 20, relieMs: 2 },
  { numero: 'M2XC7TQA', statut: 'actif', prenom: 'Tom', mineur: true, avecCode: true, plafondJour: 30, relieMs: 3 },
]

/** Appel au serveur ; en démonstration, une petite base en mémoire */
function useAppel(eventId, demo) {
  return useCallback(async (body) => {
    if (!demo) return apiFetch('/api/qr', { body: { ev: eventId, ...body } })
    const liste = useAppel.demo || (useAppel.demo = DEMO.map(b => ({ ...b })))
    const b = liste.find(x => x.numero === body.numero)
    if (body.action === 'bracelet-relier') {
      liste.push({ numero: lireBracelet(body.bracelet), statut: 'actif', prenom: body.prenom || '', mineur: !!body.mineur,
        avecCode: body.code !== null, plafondJour: body.plafondJour || null, relieMs: Date.now() })
    }
    if (body.action === 'bracelet-modifier' && b) Object.assign(b, { prenom: body.prenom ?? b.prenom, mineur: body.mineur ?? b.mineur, plafondJour: body.plafondJour ?? null })
    if (body.action === 'bracelet-code' && b) b.avecCode = body.code !== null
    if (body.action === 'bracelet-bloquer' && b) Object.assign(b, { statut: 'bloque', motif: 'perdu', bloqueMs: Date.now() })
    return { bracelets: liste.map(x => ({ ...x })) }
  }, [eventId, demo])
}

/** Bracelets du compte : undefined pendant le chargement, puis une liste (actifs d'abord) */
export function useBracelets(eventId, demo = false, compte = '') {
  const appel = useAppel(eventId, demo)
  const [bracelets, setBracelets] = useState(undefined)
  const recharger = useCallback(() => appel({ action: 'bracelet-etat' })
    .then(r => setBracelets(r.bracelets || (r.bracelet ? [r.bracelet] : [])))
    .catch(() => setBracelets(b => b || [])), [appel])
  // compte : rechargé quand l'espace s'ouvre ou change de compte
  useEffect(() => { if (compte) recharger(); else setBracelets(undefined) }, [recharger, compte])
  return { bracelets, setBracelets, appel, recharger }
}

export const nomBracelet = (b) => b?.prenom || `Bracelet ${numeroAffiche(b?.numero)}`
const euros = (n) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`

/** « Sans code · 20 €/jour » */
export function resumeBracelet(b) {
  if (b.statut === 'bloque') return b.motif === 'essais' ? 'Bloqué après 3 codes faux · ne paie plus' : 'Bloqué · ne paie plus'
  return [b.avecCode ? 'Avec code' : 'Sans code', b.plafondJour ? `${euros(b.plafondJour)}/jour` : ''].filter(Boolean).join(' · ')
}

/** Carte de l'accueil (accès rapide) : seulement si au moins un bracelet est relié */
export function CarteBraceletsAccueil({ bracelets, onOpen }) {
  const actifs = (bracelets || []).filter(b => b.statut === 'actif')
  if (!actifs.length) return null
  const enfants = actifs.filter(b => b.mineur).map(b => b.prenom).filter(Boolean)
  return (
    <button type="button" className={`nv-glass nv-press ${s.accueil}`} onClick={onOpen} aria-label="Mes bracelets">
      <span className={s.ic} aria-hidden="true"><Watch size={20} /></span>
      <span className={s.txt}>
        <b>Mes bracelets</b>
        <span className="nv-mu">{actifs.length} relié{actifs.length > 1 ? 's' : ''}{enfants.length ? ` · ${enfants.join(', ')}` : ''}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </button>
  )
}

const VIDE = { prenom: '', mineur: false, avecCode: true, plafond: '' }

/** solde : solde du compte déjà mis en forme (« 27,50 € ») */
export default function MesBracelets({ solde, etat }) {
  // etat : useBracelets() de la page, partagé avec la carte de l'accueil
  const { bracelets, setBracelets, appel } = etat
  // vue : liste | scan | infos | code1 | code2 | detail | modifier | bloquer
  const [vue, setVue] = useState('liste')
  const [numero, setNumero] = useState('')        // bracelet scanné (ajout) ou choisi (détail)
  const [form, setForm] = useState(VIDE)
  const [modeCode, setModeCode] = useState('relier')   // relier | changer
  const [code1, setCode1] = useState('')
  const [code2, setCode2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [tour, setTour] = useState(0)
  const [aBloquer, setABloquer] = useState('')   // numéro en attente de confirmation dans la liste

  const aller = (v) => { setVue(v); setCode1(''); setCode2(''); setErr(''); setTour(n => n + 1) }
  const choisi = (bracelets || []).find(b => b.numero === numero)
  const actifs = (bracelets || []).filter(b => b.statut === 'actif')

  const envoyer = async (body, ok, retour = 'liste') => {
    setBusy(true)
    try {
      const r = await appel(body)
      setBracelets(r.bracelets || [])
      if (ok) toast.success(ok)
      aller(retour)
      return true
    } catch (e) {
      setErr(e.message || 'Enregistrement impossible, réessayez.')
      return false
    } finally { setBusy(false) }
  }

  const plafondNombre = () => {
    const t = String(form.plafond).replace(',', '.').replace(/[^\d.]/g, '')
    return t ? Number(t) : null
  }
  /** Vérifie les réglages saisis avant d'aller plus loin (le serveur revérifie) */
  const erreurInfos = () => {
    const p = plafondNombre()
    if (form.plafond !== '' && (!p || p <= 0)) return 'Plafond par jour : un montant en euros.'
    if (!form.avecCode && !form.mineur) return "Un bracelet sans code doit être celui d'un mineur."
    if (!form.avecCode && !p) return 'Sans code, le plafond par jour est obligatoire.'
    if (!form.avecCode && p > PLAFOND_SANS_CODE_MAX) return `Sans code, le plafond est de ${PLAFOND_SANS_CODE_MAX} € par jour au plus.`
    return ''
  }

  const scanne = (texte) => {
    const n = lireBracelet(texte)
    if (!n) { setErr("Ce QR n'est pas celui d'un bracelet YllaCash. Scannez le QR imprimé sur le bracelet."); return }
    if ((bracelets || []).some(b => b.numero === n && b.statut === 'actif')) { setErr('Ce bracelet est déjà relié à votre compte.'); return }
    setNumero(n); setForm({ ...VIDE, prenom: actifs.length ? '' : 'Moi' }); aller('infos')
  }

  const validerInfos = () => {
    const e = erreurInfos()
    if (e) { setErr(e); return }
    if (form.avecCode) { setModeCode('relier'); aller('code1'); return }
    envoyer({ action: 'bracelet-relier', bracelet: numero, code: null, prenom: form.prenom, mineur: form.mineur, plafondJour: plafondNombre() },
      `Bracelet ${form.prenom || numeroAffiche(numero)} relié, sans code`)
  }

  const premierCode = (c) => {
    const e = erreurCode(c)
    if (e) { setErr(e); setCode1(''); setTour(n => n + 1); return }
    setErr(''); setCode1(c); setVue('code2')
  }
  const secondCode = (c) => {
    if (c !== code1) { aller('code1'); setErr('Les deux codes ne correspondent pas. Recommencez.'); return }
    if (modeCode === 'relier') {
      envoyer({ action: 'bracelet-relier', bracelet: numero, code: c, prenom: form.prenom, mineur: form.mineur, plafondJour: plafondNombre() },
        'Bracelet relié, code enregistré')
    } else {
      envoyer({ action: 'bracelet-code', numero, code: c }, choisi?.avecCode ? 'Nouveau code enregistré' : 'Code ajouté', 'detail')
    }
  }

  if (bracelets === undefined) return null

  let corps
  if (vue === 'scan') {
    corps = (<>
      <b>Scannez le QR du bracelet</b>
      <QrScanner onScan={scanne} parse={lireBracelet} onIllisible={() => setErr("Ce QR n'est pas celui d'un bracelet YllaCash. Scannez le QR imprimé sur le bracelet.")}
        placeholder="Numéro du bracelet (ex : K7Q3 PX9M)" hint="Pointez la caméra vers le QR du bracelet" simulate={['FYB-TESTQR26']} completerBillet={false} />
      <Button variant="secondary" block onClick={() => aller('liste')}>Annuler</Button>
    </>)
  } else if (vue === 'infos' || vue === 'modifier') {
    const ajout = vue === 'infos'
    const mineurVerrou = !ajout && choisi?.mineur
    corps = (<>
      <b>{ajout ? 'Nouveau bracelet' : `Modifier ${nomBracelet(choisi)}`}</b>
      <p className="nv-mu">Bracelet n° {numeroAffiche(numero)}{ajout ? ' scanné' : ''}</p>
      <label className={s.lab} htmlFor="br-prenom">Prénom ou surnom (facultatif)</label>
      <input id="br-prenom" className={s.input} value={form.prenom} maxLength={30} autoComplete="off"
        onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Ex : Léa" />
      <div className={s.ligneSwitch}>
        <span className={s.txt}><b>Mineur</b><span className="nv-mu">{mineurVerrou ? 'Se décoche seulement à la billetterie' : "Pas d'alcool avec ce bracelet"}</span></span>
        <button type="button" role="switch" aria-checked={form.mineur} className={s.switch} disabled={mineurVerrou || busy}
          aria-label="Bracelet d'un mineur"
          onClick={() => setForm(f => ({ ...f, mineur: !f.mineur, avecCode: !f.mineur ? false : true }))} />
      </div>
      {ajout && form.mineur && (
        <div className={s.ligneSwitch}>
          <span className={s.txt}><b>Définir un code</b><span className="nv-mu">{form.avecCode ? '4 chiffres demandés à la borne' : "Sans code : l'enfant paie en présentant le bracelet"}</span></span>
          <button type="button" role="switch" aria-checked={form.avecCode} className={s.switch} disabled={busy}
            aria-label="Définir un code pour ce bracelet" onClick={() => setForm(f => ({ ...f, avecCode: !f.avecCode }))} />
        </div>
      )}
      <label className={s.lab} htmlFor="br-plafond">Plafond par jour ({(ajout ? !form.avecCode : !choisi?.avecCode) ? 'obligatoire sans code' : 'facultatif'})</label>
      <input id="br-plafond" className={s.input} value={form.plafond} inputMode="decimal" autoComplete="off"
        onChange={e => setForm(f => ({ ...f, plafond: e.target.value }))} placeholder="Ex : 20 €" />
      {(ajout ? !form.avecCode : !choisi?.avecCode) && (
        <p className="nv-mu">{PLAFOND_SANS_CODE_MAX} € par jour au plus, {ACHAT_SANS_CODE_MAX} € au plus par achat. Perdu : bloquez-le ici en un geste.</p>
      )}
      {ajout && form.avecCode && <p className="nv-mu">Étape suivante : choisir son code à 4 chiffres, tapé deux fois.</p>}
      {ajout
        ? <Button block loading={busy} onClick={validerInfos}>{form.avecCode ? 'Continuer' : 'Relier le bracelet'}</Button>
        : <Button block loading={busy} onClick={() => {
            const sansCode = !choisi?.avecCode
            const p = plafondNombre()
            if (form.plafond !== '' && (!p || p <= 0)) { setErr('Plafond par jour : un montant en euros.'); return }
            if (sansCode && !p) { setErr('Sans code, le plafond par jour est obligatoire.'); return }
            if (sansCode && p > PLAFOND_SANS_CODE_MAX) { setErr(`Sans code, le plafond est de ${PLAFOND_SANS_CODE_MAX} € par jour au plus.`); return }
            envoyer({ action: 'bracelet-modifier', numero, prenom: form.prenom, mineur: form.mineur, plafondJour: p }, 'Bracelet modifié', 'detail')
          }}>Enregistrer</Button>}
      <Button variant="secondary" block disabled={busy} onClick={() => aller(ajout ? 'liste' : 'detail')}>Annuler</Button>
    </>)
  } else if (vue === 'code1' || vue === 'code2') {
    const premier = vue === 'code1'
    corps = (<>
      <b>{premier ? (modeCode === 'relier' ? 'Choisissez son code' : choisi?.avecCode ? 'Choisissez le nouveau code' : 'Choisissez un code') : 'Tapez-le une 2ᵉ fois'}</b>
      <p className="nv-mu">Bracelet n° {numeroAffiche(numero)}{form.prenom || choisi?.prenom ? ` · ${form.prenom || choisi?.prenom}` : ''}</p>
      <p className="nv-mu">4 chiffres. Il sera demandé à la borne, seulement pour payer avec ce bracelet. Évitez 1234 ou une année de naissance.</p>
      <CodeInput key={`${vue}-${tour}`} length={4} numeric mask autoFocus disabled={busy} label={premier ? 'Code à 4 chiffres' : 'Confirmez le code'}
        value={premier ? code1 : code2} onChange={premier ? setCode1 : setCode2} onComplete={premier ? premierCode : secondCode}
        status={err ? 'error' : null} className={s.code} />
      <Button variant="secondary" block disabled={busy} onClick={() => aller(modeCode === 'relier' ? 'liste' : 'detail')}>Annuler</Button>
    </>)
  } else if (vue === 'bloquer' && choisi) {
    corps = (<>
      <b>Bloquer {nomBracelet(choisi)} ?</b>
      <p className="nv-mu">Bracelet n° {numeroAffiche(choisi.numero)}. Il ne permettra plus de payer, même avec le bon code. Les autres bracelets ne changent pas.</p>
      <Button variant="danger" block loading={busy} onClick={() => envoyer({ action: 'bracelet-bloquer', numero: choisi.numero }, 'Bracelet bloqué')}>Bloquer ce bracelet</Button>
      <Button variant="secondary" block disabled={busy} onClick={() => aller('detail')}>Annuler</Button>
    </>)
  } else if (vue === 'detail' && choisi) {
    const peutSansCode = choisi.mineur && choisi.plafondJour && choisi.plafondJour <= PLAFOND_SANS_CODE_MAX
    corps = (<>
      <b>{choisi.prenom ? `Bracelet de ${choisi.prenom}` : `Bracelet n° ${numeroAffiche(choisi.numero)}`}</b>
      <p className="nv-mu">n° {numeroAffiche(choisi.numero)}{choisi.mineur ? ' · mineur' : ''} · {resumeBracelet(choisi).toLowerCase()}</p>
      {choisi.statut === 'actif' ? (<>
        <p className={s.ok}><ShieldCheck size={16} aria-hidden="true" /> {choisi.avecCode
          ? `Prêt : à la borne, présentez le bracelet puis tapez son code.${choisi.mineur ? " L'alcool est refusé." : ''}`
          : `Prêt : à la borne, ${choisi.prenom || 'le porteur'} présente son bracelet, sans code. L'alcool est refusé.`}</p>
        <Button variant="secondary" block onClick={() => { setForm({ prenom: choisi.prenom || '', mineur: !!choisi.mineur, avecCode: choisi.avecCode, plafond: choisi.plafondJour ? String(choisi.plafondJour).replace('.', ',') : '' }); aller('modifier') }}>
          Modifier prénom, mineur, plafond
        </Button>
        <Button variant="secondary" block onClick={() => { setModeCode('changer'); aller('code1') }}>{choisi.avecCode ? 'Changer son code' : 'Définir un code'}</Button>
        {choisi.avecCode && peutSansCode && (
          <Button variant="secondary" block loading={busy} onClick={() => envoyer({ action: 'bracelet-code', numero: choisi.numero, code: null }, 'Code retiré', 'detail')}>Retirer le code</Button>
        )}
        <Button variant="secondary" block icon={Lock} onClick={() => aller('bloquer')}>Perdu : bloquer ce bracelet</Button>
      </>) : (<>
        <p className={s.err}>{resumeBracelet(choisi)}.</p>
        <p className="nv-mu">Prenez un nouveau bracelet à l'entrée ou au guichet, puis reliez-le ici.</p>
      </>)}
      <Button variant="secondary" block onClick={() => aller('liste')}>Retour à mes bracelets</Button>
    </>)
  } else {
    corps = (<>
      {(bracelets || []).length === 0 ? (
        <p className="nv-mu">Si un téléphone est déchargé, ou pour un enfant sans téléphone : payez à la borne avec un bracelet relié à ce compte. Prenez des bracelets à l'entrée ou au guichet.</p>
      ) : (
        <p className="nv-mu">Ils paient tous sur votre solde{solde ? ` de ${solde}` : ''}. Jusqu'à {MAX_BRACELETS} bracelets.</p>
      )}
      {(bracelets || []).map(b => (
        <div key={b.numero} className={s.ligne}>
          <button type="button" className={`nv-press ${s.ligneBtn}`} onClick={() => { setNumero(b.numero); aller('detail') }}
            aria-label={`${nomBracelet(b)} : voir le détail`}>
            <span className={s.ic} aria-hidden="true" style={b.statut !== 'actif' ? { opacity: 0.55 } : undefined}><Watch size={20} /></span>
            <span className={s.txt}>
              <span className={s.nomLigne}><b>{nomBracelet(b)}</b>
                {b.mineur && <Badge tone="warning">Mineur</Badge>}
                {b.statut !== 'actif' && <Badge tone="danger">Bloqué</Badge>}
              </span>
              <span className="nv-mu">{resumeBracelet(b)}</span>
            </span>
          </button>
          {b.statut === 'actif' && (aBloquer === b.numero ? (
            <span className={s.confirme} role="group" aria-label={`Bloquer ${nomBracelet(b)} ?`}>
              <span className="nv-mu">Bloquer {nomBracelet(b)} ?</span>
              <Button size="sm" variant="danger" loading={busy} onClick={async () => { if (await envoyer({ action: 'bracelet-bloquer', numero: b.numero }, `${nomBracelet(b)} : bracelet bloqué`)) setABloquer('') }}>Confirmer</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setABloquer('')}>Annuler</Button>
            </span>
          ) : (
            <button type="button" className={`nv-press ${s.bloquer}`} onClick={() => { setErr(''); setABloquer(b.numero) }} aria-label={`Bloquer ${nomBracelet(b)}`}>
              <Lock size={14} aria-hidden="true" />Bloquer
            </button>
          ))}
        </div>
      ))}
      {actifs.length < MAX_BRACELETS
        ? <Button block icon={Plus} onClick={() => { setNumero(''); setABloquer(''); aller('scan') }}>{(bracelets || []).length ? 'Ajouter un bracelet' : 'Relier un bracelet'}</Button>
        : <p className="nv-mu">{MAX_BRACELETS} bracelets au plus : bloquez-en un pour en relier un autre.</p>}
      {(bracelets || []).length > 0 && (
        <p className={`nv-mu ${s.petit}`}>Vous répondez des paiements faits avec vos bracelets : avec un code, s'il a été donné ; sans code, jusqu'au plafond du jour, tant que le bracelet n'est pas bloqué ici.</p>
      )}
    </>)
  }

  return (
    <section className={`nv-glass ${s.carte}`} aria-label="Mes bracelets">
      {vue === 'liste' && <b>Mes bracelets</b>}
      {err && <p className={s.err} role="alert">{err}</p>}
      {corps}
    </section>
  )
}
