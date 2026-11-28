/**
 * pages/billetterie/Bracelets.jsx — bracelets de secours au guichet
 * (écran 2, maquette https://claude.ai/artifact/HFg4MmsMG1UknVgMuqfTke, codé le 24/11/2026)
 *
 * Trois cas :
 *  - relier un bracelet libre à un spectateur qui n'a pas de téléphone ou n'y arrive pas ;
 *  - code oublié, ou bracelet bloqué après 3 codes faux : on scanne le bracelet (il retrouve le
 *    compte, même téléphone déchargé), puis le spectateur choisit un nouveau code ;
 *  - bracelet perdu : on retrouve le spectateur par son nom ou son billet et on bloque le bracelet.
 * Plusieurs bracelets par compte (maquette validée le 28/11/2026) : tous les bracelets du compte sont
 * listés ; relier avec prénom, « mineur » (sans code par défaut) et plafond ; décocher « mineur » sur
 * pièce d'identité du porteur, majeur (un bracelet sans code reçoit alors un code).
 * Une pièce d'identité est toujours vérifiée, et le spectateur tape lui-même son code sur ce
 * téléphone : la billetterie ne le connaît jamais. Tout passe par /api/qr (bracelet-guichet-*) et
 * est noté au journal d'audit.
 */
import React, { useMemo, useState } from 'react'
import { Search, ChevronLeft, Check, Watch, AlertTriangle } from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import QrScanner from '../../components/QrScanner'
import { apiFetch } from '../../firebase/session'
import { fmt } from '../../utils/helpers'
import { friendlyError } from '../../utils/errors'
import { lireBracelet, erreurCode, numeroAffiche } from '../../utils/bracelet'
import { Button, Badge, HoldButton, CodeInput } from '../../ui'
import t from './rembTicket.module.css'
import s from './demandes.module.css'

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const heure = (ms) => ms ? new Date(ms).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const ETATS = {
  libre: ['neutral', 'Libre'], actif: ['success', 'Actif'], bloque: ['danger', 'Bloqué'],
}

export default function Bracelets() {
  const spectateurs = useAppStore(st => st.spectateurs) || []
  const { currentEventId } = useEventStore()
  const { user } = useAuthStore()
  const [q, setQ] = useState('')
  const [bracelet, setBracelet] = useState(null)    // { numero, statut, motif, bloqueMs } ; statut 'libre' : relié à personne
  const [compte, setCompte] = useState(null)        // { docId, id, nom, solde, annule }
  const [bracelets, setBracelets] = useState([])    // tous les bracelets du compte (28/11/2026)
  const [ajout, setAjout] = useState(false)         // scanner ouvert pour relier un nouveau bracelet
  const [form, setForm] = useState({ prenom: '', mineur: false, avecCode: true, plafond: '' })
  const [action, setAction] = useState(null)        // relier | code | bloquer | majeur
  const [etape, setEtape] = useState('')            // '' | id | code1 | code2 | fini
  const [verifie, setVerifie] = useState(false)
  const [code1, setCode1] = useState('')
  const [code2, setCode2] = useState('')
  const [tour, setTour] = useState(0)
  const [fini, setFini] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const appel = (body) => apiFetch('/api/qr', { body: { ev: currentEventId, staff: user?.nom || 'Billetterie', ...body } })

  const resultats = useMemo(() => {
    const n = norm(q.trim())
    if (n.length < 2) return []
    return spectateurs.filter(x => x && (norm(x.nom).includes(n) || norm(x.billet?.code).includes(n))).slice(0, 8)
  }, [q, spectateurs])

  const terminer = () => {
    setBracelet(null); setCompte(null); setBracelets([]); setAjout(false); setAction(null); setEtape(''); setVerifie(false)
    setForm({ prenom: '', mineur: false, avecCode: true, plafond: '' })
    setCode1(''); setCode2(''); setFini(''); setErr(''); setQ('')
  }

  // Bracelet scanné : libre (à relier) ou relié (on voit à qui)
  const scanne = async (texte) => {
    const numero = lireBracelet(texte)
    if (!numero) { setErr("Ce QR n'est pas celui d'un bracelet YllaCash."); return }
    setBusy(true); setErr('')
    try {
      const r = await appel({ action: 'bracelet-guichet-voir', bracelet: numero })
      setBracelet(r.bracelet)
      // Un spectateur déjà choisi (« lui relier un bracelet ») garde sa place si le bracelet est libre
      if (r.compte || r.bracelet.statut !== 'libre') { setCompte(r.compte); setBracelets(r.bracelets || []) }
      if (r.bracelet.statut === 'libre' && compte) {
        setForm({ prenom: bracelets.some(b => b.statut === 'actif') ? '' : 'Moi', mineur: false, avecCode: true, plafond: '' })
        setAction('relier'); setEtape('id'); setAjout(false)
      }
    } catch (e) { setErr(friendlyError(e, 'Lecture du bracelet impossible, réessayez.')) }
    finally { setBusy(false) }
  }

  // Spectateur retrouvé par son nom ou son billet
  const choisir = async (x) => {
    const docId = x._docId || x.id
    setErr('')
    if (bracelet && bracelet.statut === 'libre') {
      setCompte({ docId, id: x.id, nom: x.nom || '', solde: x.solde || 0, annule: !!x.billet?.annule })
      setAction('relier'); setEtape('id'); return
    }
    setBusy(true)
    try {
      const r = await appel({ action: 'bracelet-guichet-voir', docId })
      setCompte(r.compte); setBracelets(r.bracelets || (r.bracelet ? [r.bracelet] : [])); setBracelet(null)
    } catch (e) { setErr(friendlyError(e, 'Compte introuvable.')) }
    finally { setBusy(false) }
  }

  const commencer = (a) => { setAction(a); setEtape('id'); setVerifie(false); setErr('') }
  const plafondNombre = () => { const v = String(form.plafond).replace(',', '.').replace(/[^\d.]/g, ''); return v ? Number(v) : null }
  // Après la pièce d'identité : code à taper, ou appel direct (sans code / bracelet qui en a déjà un)
  const apresIdentite = async () => {
    if (action === 'relier') {
      const p = plafondNombre()
      if (form.plafond !== '' && (!p || p <= 0)) { setErr('Plafond par jour : un montant en euros.'); return }
      if (!form.avecCode && !p) { setErr('Sans code, le plafond par jour est obligatoire.'); return }
      if (!form.avecCode && p > 30) { setErr('Sans code, le plafond est de 30 € par jour au plus.'); return }
      if (form.avecCode) { recommencerCode(); return }
      return enregistrer(null)
    }
    if (action === 'majeur' && bracelet.avecCode) return enregistrer(null)
    recommencerCode()
  }
  // Enregistre l'action en cours ; code : 4 chiffres tapés par le spectateur, ou null
  const enregistrer = async (c) => {
    setBusy(true); setErr('')
    try {
      let r
      if (action === 'relier') {
        r = await appel({ action: 'bracelet-guichet-relier', bracelet: bracelet.numero, docId: compte.docId, code: c, identite: true,
          prenom: form.prenom, mineur: form.mineur, plafondJour: plafondNombre() })
        setFini(`Bracelet n° ${numeroAffiche(bracelet.numero)}${form.prenom ? ` (${form.prenom})` : ''} relié à ${compte.nom || compte.id}, ${c ? 'code choisi' : 'sans code'}.`)
      } else if (action === 'majeur') {
        r = await appel({ action: 'bracelet-guichet-majeur', bracelet: bracelet.numero, identite: true, porteurMajeur: true, ...(c ? { code: c } : {}) })
        setFini(`« Mineur » décoché pour le bracelet n° ${numeroAffiche(bracelet.numero)}${bracelet.prenom ? ` (${bracelet.prenom})` : ''}${c ? ', code choisi' : ''}.`)
      } else {
        r = await appel({ action: 'bracelet-guichet-code', bracelet: bracelet.numero, code: c, identite: true })
        setFini(bracelet.statut === 'bloque'
          ? `Nouveau code enregistré : bracelet n° ${numeroAffiche(bracelet.numero)} débloqué.`
          : `${bracelet.avecCode ? 'Nouveau code enregistré' : 'Code enregistré'} pour le bracelet n° ${numeroAffiche(bracelet.numero)}.`)
      }
      if (r?.bracelets) setBracelets(r.bracelets)
      setEtape('fini')
    } catch (e) {
      if (c) recommencerCode(friendlyError(e, 'Enregistrement impossible, réessayez.'))
      else setErr(friendlyError(e, 'Enregistrement impossible, réessayez.'))
    } finally { setBusy(false) }
  }
  const recommencerCode = (message = '') => { setCode1(''); setCode2(''); setEtape('code1'); setTour(n => n + 1); setErr(message) }

  const premierCode = (c) => {
    const e = erreurCode(c)
    if (e) { recommencerCode(e); return }
    setErr(''); setCode1(c); setEtape('code2')
  }

  const secondCode = async (c) => {
    if (c !== code1) { recommencerCode('Les deux codes ne correspondent pas. Recommencez.'); return }
    await enregistrer(c)
  }

  const bloquer = async () => {
    setBusy(true); setErr('')
    try {
      await appel({ action: 'bracelet-guichet-bloquer', bracelet: bracelet.numero, identite: true })
      setFini(`Bracelet n° ${numeroAffiche(bracelet.numero)} bloqué : il ne permet plus de payer.`)
      setEtape('fini')
    } catch (e) { setErr(friendlyError(e, 'Blocage impossible, réessayez.')) }
    finally { setBusy(false) }
  }

  const wrap = { maxWidth: 520, margin: '0 auto' }
  const ligneBracelet = (b, sous) => (
    <div className={s.head}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
        <Watch size={20} aria-hidden="true" />
        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <b style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{b.prenom || `Bracelet n° ${numeroAffiche(b.numero)}`}{b.mineur && <Badge tone="warning">Mineur</Badge>}</b>
          {sous && <span className={t.muted}>{sous}</span>}
        </div>
      </div>
      <Badge tone={(ETATS[b.statut] || ETATS.libre)[0]}>{(ETATS[b.statut] || ETATS.libre)[1]}</Badge>
    </div>
  )
  const ligneCompte = (c) => (
    <div className={s.head}>
      <div><b className={s.nom}>{c.nom || '—'}</b><span className={t.muted}>{c.id}</span></div>
      <span className={t.muted}>Solde <b>{fmt(c.solde || 0)}</b></span>
    </div>
  )
  const recherche = (titre, aide) => (<>
    <div className={t.search}>
      <label className={t.label} htmlFor="br-q">{titre}</label>
      <div className={t.searchRow}>
        <input id="br-q" className={t.input} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" placeholder="Bernard, ou K7P2QD" />
        <Button icon={Search} iconOnly aria-label="Chercher" />
      </div>
      {aide && <span className={t.muted}>{aide}</span>}
    </div>
    {q.trim().length >= 2 && <span className={t.label}>{resultats.length} compte{resultats.length > 1 ? 's' : ''}</span>}
    {resultats.map(x => (
      <button key={x._docId || x.id} type="button" className={s.row} disabled={busy} onClick={() => choisir(x)}>
        <span className={s.rowMain}><b>{x.nom || '—'}</b><span className={t.muted}>{x.billet?.code ? `Billet ${x.billet.code}${x.billet.pass ? ` · ${x.billet.pass}` : ''}` : 'Compte sans billet'}</span></span>
        <span className={s.rowEnd}><b>{fmt(x.solde || 0)}</b></span>
      </button>
    ))}
  </>)
  const retour = <button type="button" className={s.back} onClick={terminer}><ChevronLeft size={16} /> Bracelets</button>

  // ── Fait ──
  if (etape === 'fini') {
    return (
      <div className={t.stack} style={wrap}>
        <div className={t.done}>
          <span className={t.doneIcon}><Check size={28} aria-hidden="true" /></span>
          <h2>{fini}</h2>
        </div>
        <p className={t.muted} style={{ textAlign: 'center' }}>Fait par {user?.nom || 'Billetterie'} · noté dans le journal d'audit.</p>
        {compte && (
          <Button block onClick={() => { setEtape(''); setAction(null); setBracelet(null); setVerifie(false); setErr('') }}>Retour au compte de {compte.nom || compte.id}</Button>
        )}
        <Button variant="secondary" block onClick={terminer}>Terminer</Button>
      </div>
    )
  }

  // ── Le spectateur tape son code sur ce téléphone ──
  if (etape === 'code1' || etape === 'code2') {
    const premier = etape === 'code1'
    return (
      <div className={t.stack} style={wrap}>
        <section className={t.card}>
          <b>{premier ? 'Choisissez votre code' : 'Tapez-le une 2ᵉ fois'}</b>
          <p className={t.muted}>Spectateur : tapez vous-même 4 chiffres, sans les dire. Ils vous seront demandés à la borne quand vous payez avec le bracelet. Évitez 1234 ou votre année de naissance.</p>
          {err && <p className={t.err} role="alert">{err}</p>}
          <CodeInput key={`${etape}-${tour}`} length={4} numeric mask autoFocus disabled={busy} label={premier ? 'Code à 4 chiffres' : 'Confirmez le code'}
            value={premier ? code1 : code2} onChange={premier ? setCode1 : setCode2} onComplete={premier ? premierCode : secondCode}
            status={err ? 'error' : null} />
          <p className={t.muted} style={{ textAlign: 'center' }}>Billetterie : ne regardez pas l'écran.</p>
          <Button variant="secondary" block disabled={busy} onClick={terminer}>Annuler</Button>
        </section>
      </div>
    )
  }

  // ── Pièce d'identité, avant toute action ──
  if (etape === 'id' && compte && bracelet) {
    const titre = action === 'relier' ? `Relier le bracelet n° ${numeroAffiche(bracelet.numero)}`
      : action === 'code' ? (bracelet.avecCode === false ? 'Lui donner un code' : 'Nouveau code')
      : action === 'majeur' ? 'Décocher « mineur »' : `Bloquer le bracelet n° ${numeroAffiche(bracelet.numero)}`
    return (
      <div className={t.stack} style={wrap}>
        {retour}
        <section className={t.card}>
          <b>{titre}</b>
          {ligneCompte(compte)}
          {compte.annule ? (
            <p className={t.err} role="alert">Ce billet a été annulé : pas de bracelet possible.</p>
          ) : (<>
            <label className={s.part} style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <input type="checkbox" checked={verifie} onChange={e => setVerifie(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--brand)' }} />
              <span style={{ fontSize: 'var(--fs-13)' }}>{action === 'majeur'
                ? <>J'ai vérifié une pièce d'identité : <b>le porteur de ce bracelet est majeur</b>.</>
                : <>J'ai vérifié une pièce d'identité au nom de <b>{compte.nom}</b></>}</span>
            </label>
            {action === 'majeur' && (
              <p className={t.muted}>Le bracelet pourra acheter de l'alcool.{bracelet.avecCode ? '' : ' Sans code, il en faut un : le porteur le choisit ensuite sur ce téléphone.'}</p>
            )}
            {action === 'relier' && (<>
              <label className={t.label} htmlFor="br-prenom">Prénom (facultatif)</label>
              <input id="br-prenom" className={t.input} value={form.prenom} maxLength={30} autoComplete="off" placeholder="Ex : Léa"
                onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} />
              <label className={s.part} style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <input type="checkbox" checked={form.mineur} onChange={e => setForm(f => ({ ...f, mineur: e.target.checked, avecCode: !e.target.checked }))} style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--brand)' }} />
                <span style={{ fontSize: 'var(--fs-13)' }}><b>Mineur</b> : pas d'alcool avec ce bracelet</span>
              </label>
              {form.mineur && (
                <label className={s.part} style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <input type="checkbox" checked={form.avecCode} onChange={e => setForm(f => ({ ...f, avecCode: e.target.checked }))} style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--brand)' }} />
                  <span style={{ fontSize: 'var(--fs-13)' }}><b>Définir un code</b> : sinon l'enfant paie en présentant le bracelet</span>
                </label>
              )}
              <label className={t.label} htmlFor="br-plafond">Plafond par jour ({form.avecCode ? 'facultatif' : 'obligatoire sans code, 30 € au plus'})</label>
              <input id="br-plafond" className={t.input} value={form.plafond} inputMode="decimal" autoComplete="off" placeholder="Ex : 20 €"
                onChange={e => setForm(f => ({ ...f, plafond: e.target.value }))} />
            </>)}
            {err && <p className={t.err} role="alert">{err}</p>}
            {action === 'bloquer' ? (<>
              <p className={t.muted}>Il ne permettra plus de payer, même avec le bon code. Vous pourrez lui relier un nouveau bracelet tout de suite.</p>
              <HoldButton tone="coral" block disabled={!verifie || busy} onConfirm={bloquer} fillingLabel="Gardez appuyé…">Maintenir pour bloquer le bracelet</HoldButton>
            </>) : (
              action === 'majeur' ? (
                <HoldButton tone="coral" block disabled={!verifie || busy} onConfirm={apresIdentite} fillingLabel="Gardez appuyé…">Maintenir pour décocher « mineur »</HoldButton>
              ) : action === 'relier' && !form.avecCode ? (
                <Button block disabled={!verifie} loading={busy} onClick={apresIdentite}>Relier le bracelet</Button>
              ) : (
                <Button block disabled={!verifie} onClick={apresIdentite}>Tendre le téléphone au spectateur</Button>
              )
            )}
          </>)}
          <Button variant="secondary" block onClick={terminer}>Annuler</Button>
        </section>
      </div>
    )
  }

  // ── Bracelet scanné, libre : à qui le relier ──
  if (bracelet && bracelet.statut === 'libre') {
    return (
      <div className={t.stack} style={wrap}>
        {retour}
        <section className={t.card}>{ligneBracelet(bracelet, 'Relié à aucun compte')}</section>
        {err && <p className={t.err} role="alert">{err}</p>}
        {recherche('À qui le relier ? Nom ou code du billet')}
      </div>
    )
  }

  // ── Compte : tous ses bracelets (28/11/2026), puis le détail d'un bracelet ──
  if (compte) {
    const sousTitre = (b) => b.statut === 'bloque'
      ? (b.motif === 'essais' ? `Bloqué après 3 codes faux${b.bloqueMs ? ` (${heure(b.bloqueMs)})` : ''}` : `Bloqué : perdu${b.bloqueMs ? ` (${heure(b.bloqueMs)})` : ''}`)
      : [`n° ${numeroAffiche(b.numero)}`, b.avecCode === false ? 'sans code' : 'avec code', b.plafondJour ? `${b.plafondJour} €/jour` : ''].filter(Boolean).join(' · ')
    const actifs = bracelets.filter(b => b.statut === 'actif').length
    return (
      <div className={t.stack} style={wrap}>
        {bracelet
          ? <button type="button" className={s.back} onClick={() => { setBracelet(null); setErr('') }}><ChevronLeft size={16} /> {compte.nom || compte.id}</button>
          : retour}
        <section className={t.card}>
          {ligneCompte(compte)}
          {bracelet ? (<>
            {ligneBracelet(bracelet, sousTitre(bracelet))}
            {err && <p className={t.err} role="alert">{err}</p>}
            <Button block onClick={() => commencer('code')}>{bracelet.statut === 'bloque' ? 'Nouveau code et débloquer' : bracelet.avecCode === false ? 'Lui donner un code' : 'Nouveau code (code oublié)'}</Button>
            {bracelet.avecCode !== false && <p className={t.muted}>Le spectateur choisit un nouveau code ; l'ancien ne vaut plus rien{bracelet.statut === 'bloque' ? ' et le bracelet est débloqué' : ''}.</p>}
            {bracelet.mineur && bracelet.statut === 'actif' && <Button variant="secondary" block onClick={() => commencer('majeur')}>Décocher « mineur » (pièce d'identité)</Button>}
            {bracelet.statut === 'actif' && <Button variant="danger" block onClick={() => commencer('bloquer')}>Bloquer ce bracelet (perdu)</Button>}
            <p className={t.muted}>Prénom et plafond se changent dans l'espace du titulaire.</p>
          </>) : (<>
            <span className={t.label}>{bracelets.length ? `${bracelets.length} bracelet${bracelets.length > 1 ? 's' : ''} sur ce compte` : 'Aucun bracelet relié à ce compte'}</span>
            {bracelets.map(b => (
              <button key={b.numero} type="button" className={s.row} onClick={() => { setBracelet(b); setErr('') }}>
                <span className={s.rowMain}>
                  <b style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{b.prenom || `Bracelet n° ${numeroAffiche(b.numero)}`}{b.mineur && <Badge tone="warning">Mineur</Badge>}</b>
                  <span className={t.muted}>{sousTitre(b)}</span>
                </span>
                <span className={s.rowEnd}><Badge tone={(ETATS[b.statut] || ETATS.libre)[0]}>{(ETATS[b.statut] || ETATS.libre)[1]}</Badge></span>
              </button>
            ))}
            {err && <p className={t.err} role="alert">{err}</p>}
            {ajout ? (
              <QrScanner onScan={scanne} parse={lireBracelet} onIllisible={() => setErr("Ce QR n'est pas celui d'un bracelet YllaCash.")}
                placeholder="Numéro du bracelet (ex : K7Q3 PX9M)" hint="Pointez la caméra vers le QR du bracelet libre" simulate={['FYB-TESTQR26', 'FYB-K7Q3PX9M']} completerBillet={false} />
            ) : actifs < 6 ? (
              <Button block onClick={() => { setAjout(true); setErr('') }}>Relier un nouveau bracelet</Button>
            ) : <p className={t.muted}>6 bracelets au plus : bloquez-en un pour en relier un autre.</p>}
            {bracelets.length > 0 && <p className={t.muted}>Touchez un bracelet pour un nouveau code, le bloquer ou décocher « mineur ».</p>}
          </>)}
        </section>
      </div>
    )
  }

  // ── Accueil : scanner un bracelet, ou retrouver le spectateur ──
  return (
    <div className={t.stack} style={wrap}>
      <p className={t.hint}>Relier un bracelet, donner un nouveau code (code oublié, bracelet bloqué) ou bloquer un bracelet perdu.</p>
      <section className={t.card}>
        <b>Bracelet présenté par le spectateur</b>
        {err && <p className={t.err} role="alert">{err}</p>}
        <QrScanner onScan={scanne} parse={lireBracelet} onIllisible={() => setErr("Ce QR n'est pas celui d'un bracelet YllaCash.")}
          placeholder="Numéro du bracelet (ex : K7Q3 PX9M)" hint="Pointez la caméra vers le QR du bracelet" simulate={['FYB-TESTQR26', 'FYB-K7Q3PX9M']} completerBillet={false} />
      </section>
      <p className={t.warn}><AlertTriangle size={16} aria-hidden="true" /><span>Il n'a plus son bracelet (perdu) ? Retrouvez-le par son nom ou le code de son billet.</span></p>
      {recherche('Nom ou code du billet')}
    </div>
  )
}
