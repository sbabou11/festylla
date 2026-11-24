/**
 * pages/billetterie/Bracelets.jsx — bracelets de secours au guichet
 * (écran 2, maquette https://claude.ai/artifact/HFg4MmsMG1UknVgMuqfTke, codé le 24/11/2026)
 *
 * Trois cas :
 *  - relier un bracelet libre à un spectateur qui n'a pas de téléphone ou n'y arrive pas ;
 *  - code oublié, ou bracelet bloqué après 3 codes faux : on scanne le bracelet (il retrouve le
 *    compte, même téléphone déchargé), puis le spectateur choisit un nouveau code ;
 *  - bracelet perdu : on retrouve le spectateur par son nom ou son billet et on bloque le bracelet.
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
  const [action, setAction] = useState(null)        // relier | code | bloquer
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
    setBracelet(null); setCompte(null); setAction(null); setEtape(''); setVerifie(false)
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
      if (r.compte || r.bracelet.statut !== 'libre') setCompte(r.compte)
      if (r.bracelet.statut === 'libre' && compte) { setAction('relier'); setEtape('id') }
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
      setCompte(r.compte); setBracelet(r.bracelet)
    } catch (e) { setErr(friendlyError(e, 'Compte introuvable.')) }
    finally { setBusy(false) }
  }

  const commencer = (a) => { setAction(a); setEtape('id'); setVerifie(false); setErr('') }
  const recommencerCode = (message = '') => { setCode1(''); setCode2(''); setEtape('code1'); setTour(n => n + 1); setErr(message) }

  const premierCode = (c) => {
    const e = erreurCode(c)
    if (e) { recommencerCode(e); return }
    setErr(''); setCode1(c); setEtape('code2')
  }

  const secondCode = async (c) => {
    if (c !== code1) { recommencerCode('Les deux codes ne correspondent pas. Recommencez.'); return }
    setBusy(true); setErr('')
    try {
      if (action === 'relier') {
        await appel({ action: 'bracelet-guichet-relier', bracelet: bracelet.numero, docId: compte.docId, code: c, identite: true })
        setFini(`Bracelet n° ${numeroAffiche(bracelet.numero)} relié à ${compte.nom || compte.id}, code choisi.`)
      } else {
        await appel({ action: 'bracelet-guichet-code', bracelet: bracelet.numero, code: c, identite: true })
        setFini(bracelet.statut === 'bloque'
          ? `Nouveau code enregistré : bracelet n° ${numeroAffiche(bracelet.numero)} débloqué.`
          : `Nouveau code enregistré pour le bracelet n° ${numeroAffiche(bracelet.numero)}.`)
      }
      setEtape('fini')
    } catch (e) { recommencerCode(friendlyError(e, 'Enregistrement impossible, réessayez.')) }
    finally { setBusy(false) }
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
        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}><b style={{ whiteSpace: 'nowrap' }}>Bracelet n° {numeroAffiche(b.numero)}</b>{sous && <span className={t.muted}>{sous}</span>}</div>
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
        {action === 'bloquer' && (
          <Button block onClick={() => { const c = compte; terminer(); setCompte(c) }}>Lui relier un nouveau bracelet</Button>
        )}
        <Button variant={action === 'bloquer' ? 'secondary' : 'primary'} block onClick={terminer}>Terminer</Button>
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
      : action === 'code' ? 'Nouveau code' : `Bloquer le bracelet n° ${numeroAffiche(bracelet.numero)}`
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
              <span style={{ fontSize: 'var(--fs-13)' }}>J'ai vérifié une pièce d'identité au nom de <b>{compte.nom}</b></span>
            </label>
            {err && <p className={t.err} role="alert">{err}</p>}
            {action === 'bloquer' ? (<>
              <p className={t.muted}>Il ne permettra plus de payer, même avec le bon code. Vous pourrez lui relier un nouveau bracelet tout de suite.</p>
              <HoldButton tone="coral" block disabled={!verifie || busy} onConfirm={bloquer} fillingLabel="Gardez appuyé…">Maintenir pour bloquer le bracelet</HoldButton>
            </>) : (
              <Button block disabled={!verifie} onClick={() => recommencerCode()}>Tendre le téléphone au spectateur</Button>
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

  // ── Bracelet relié (scanné, ou celui du spectateur retrouvé) ──
  if (compte) {
    return (
      <div className={t.stack} style={wrap}>
        {retour}
        <section className={t.card}>
          {ligneCompte(compte)}
          {bracelet ? (<>
            {ligneBracelet(bracelet, bracelet.statut === 'bloque'
              ? (bracelet.motif === 'essais' ? `Bloqué après 3 codes faux${bracelet.bloqueMs ? ` (${heure(bracelet.bloqueMs)})` : ''}` : `Bloqué : perdu${bracelet.bloqueMs ? ` (${heure(bracelet.bloqueMs)})` : ''}`)
              : 'Relié à ce compte')}
            {err && <p className={t.err} role="alert">{err}</p>}
            <Button block onClick={() => commencer('code')}>{bracelet.statut === 'bloque' ? 'Nouveau code et débloquer' : 'Nouveau code (code oublié)'}</Button>
            <p className={t.muted}>Le spectateur choisit un nouveau code ; l'ancien ne vaut plus rien{bracelet.statut === 'bloque' ? ' et le bracelet est débloqué' : ''}.</p>
            {bracelet.statut === 'actif' && <Button variant="danger" block onClick={() => commencer('bloquer')}>Bloquer ce bracelet (perdu)</Button>}
            {bracelet.statut === 'bloque' && <Button variant="secondary" block onClick={() => { setBracelet(null); setErr('') }}>Lui relier un autre bracelet</Button>}
          </>) : (<>
            <p className={t.muted}>Aucun bracelet relié à ce compte. Scannez un bracelet libre pour le lui relier.</p>
            {err && <p className={t.err} role="alert">{err}</p>}
            <QrScanner onScan={scanne} parse={lireBracelet} onIllisible={() => setErr("Ce QR n'est pas celui d'un bracelet YllaCash.")}
              placeholder="Numéro du bracelet (ex : K7Q3 PX9M)" hint="Pointez la caméra vers le QR du bracelet" simulate={['FYB-TESTQR26', 'FYB-K7Q3PX9M']} completerBillet={false} />
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
