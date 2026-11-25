/**
 * pages/admin/em/EquipeEm.jsx — pages Bénévoles et Artistes d'un événement relié à Event Manager
 * (règle d'échange Event Manager ↔ YllaCash, lot C, maquette validée le 18/11/2026)
 *
 * Event Manager est la référence : ici, on ne crée ni ne modifie personne. On donne à chacun son
 * lien personnel (QR, carte ou fiche imprimable, renouvellement) et on suit les consommations du jour.
 * Page Artistes : en plus, la liste des articles offerts aux artistes (settings/artistes.articles).
 */
import React, { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { Info, QrCode as QrIcon, FileText, RefreshCw, Search, Copy, UserCog } from 'lucide-react'
import useAuthStore, { setRoleBenevole } from '../../../store/useAuthStore'
import useAppStore from '../../../store/useAppStore'
import RoleEquipeBloc, { etatRoleEquipe } from '../../../components/RoleEquipeBloc'
import ExceptionRoleBloc from '../../../components/ExceptionRoleBloc'
import BilanBenevoles from '../../../components/BilanBenevoles'
import { labelRoleEquipe } from '../../../utils/roleEquipe'
import { db } from '../../../firebase/config'
import { apiFetch } from '../../../firebase/session'
import { linkFor, renewLinkKey } from '../../../firebase/publicSession'
import { friendlyError } from '../../../utils/errors'
import QrCode from '../../../components/QrCode'
import { Badge, Button, Dialog, Empty, HoldButton, toast } from '../../../ui'
import useEventStore from '../../../store/useEventStore'
import { festDay } from '../../../em/jour'
import { adaptArtisteEm } from '../../../em/artiste'
import generateBenevrolePDF from '../benevoles/pdf'
import printArtisteSheet from '../planning/printArtisteSheet'

const LABEL = { repas: 'Repas', boisson: 'Boissons', eau: 'Eau' }
const TONE = { repas: 'coral', boisson: 'warning', eau: 'brand' }
const box = { background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }

/** « Repas 0/1 · Boissons 1/2 · Eau 1/3 », ou rien si aucun droit ce jour-là */
function resume(droits = {}, conso = {}) {
  const parts = Object.keys(LABEL).filter(k => droits[k]).map(k => `${LABEL[k]} ${conso[k] || 0}/${droits[k]}`)
  return parts.length ? parts.join(' · ') : "Pas de droits aujourd'hui"
}
const somme = (parJour = {}) => Object.values(parJour).reduce((t, d) => ({
  repas: t.repas + (d.repas || 0), boisson: t.boisson + (d.boisson || 0), eau: t.eau + (d.eau || 0),
}), { repas: 0, boisson: 0, eau: 0 })

function useEmEvent() {
  const { events, currentEventId } = useEventStore()
  const event = events.find(e => e.id === currentEventId)
  return { ev: currentEventId, event }
}

/** Est-ce que l'événement courant est relié à Event Manager pour l'équipe ? */
export function useEquipeEm() {
  const { event } = useEmEvent()
  return !!event?.emEquipe
}

/** Événement relié à Event Manager (équipe ou programme) */
const estRelie = (event) => !!(event?.emEquipe || event?.emProgramme)

function EnTete({ titre, ev, event, quoi }) {
  const [busy, setBusy] = useState(false)
  // 25/11/2026 : version Event Manager sur tous les événements ; non relié = liste en lecture
  if (!estRelie(event)) return (
    <>
      <h1 style={{ margin: 0, fontSize: 22 }}>{titre}</h1>
      <div style={{ ...box, display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--gold-light)', color: 'var(--gold-dark)', border: 'none' }}>
        <Info size={16} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true"/>
        <span style={{ fontSize: 13 }}>Événement non relié à Event Manager : liste en lecture, sans création ni créneaux. Pour un nouvel événement, reliez-le à Event Manager (Événements › Liaisons).</span>
      </div>
    </>
  )
  const maj = event?.emEquipe?.majMs
  const actualiser = async () => {
    setBusy(true)
    try { await apiFetch('/api/liaisons', { body: { ev, mode: 'em-actualiser' } }); toast.success('Event Manager relu') }
    catch (e) { toast.error(friendlyError(e, "Event Manager n'a pas pu être relu.")) }
    finally { setBusy(false) }
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{titre}</h1>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {maj ? `Lu dans Event Manager à ${new Date(maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={actualiser} disabled={busy}>{busy ? 'Lecture…' : 'Actualiser'}</Button>
        </span>
      </div>
      <div style={{ ...box, display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--brand-light)', color: 'var(--brand-dark)', border: 'none' }}>
        <Info size={16} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true"/>
        <span style={{ fontSize: 13 }}>{quoi} Ici, on donne le lien personnel et on suit les consommations du jour.</span>
      </div>
    </>
  )
}

/** Fenêtre du lien personnel : QR, adresse à copier */
function LienDialog({ lien, onClose }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(lien.url); toast.success('Lien copié') } catch { toast.info('Sélectionnez le lien pour le copier') }
  }
  return (
    <Dialog open={!!lien} onClose={onClose} title={lien ? `Lien personnel · ${lien.nom}` : ''}
      footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      {lien && (
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <QrCode value={lien.url} size={200}/>
          <code style={{ fontSize: 12, overflowWrap: 'anywhere', userSelect: 'all', textAlign: 'center' }}>{lien.url}</code>
          <Button size="sm" icon={Copy} onClick={copy}>Copier le lien</Button>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Écran 10 (23/11/2026) : fiche d'un bénévole d'Event Manager, en lecture seule sauf le rôle d'équipe,
 * gardé côté YllaCash (Event Manager ne l'écrase pas). Enregistré par le serveur, admins seulement.
 */
function RoleDialog({ ev, fiche, staff, onClose, live }) {
  const [role, setRole] = useState(fiche?.roleEquipe || '')
  const [mdp, setMdp] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const etat = etatRoleEquipe(fiche || {}, role, mdp)
  const enregistrer = async () => {
    if (!etat.change) { onClose(); return }
    if (!etat.ok) { setTried(true); return }
    setBusy(true)
    try {
      await setRoleBenevole(`events/${ev}/benevoles/${fiche.id}`, role, mdp || undefined)
      toast.success(role ? `Rôle « ${labelRoleEquipe(role)} » donné · noté au journal d'audit` : 'Rôle d\'équipe retiré')
      onClose()
    } catch (e) { toast.error(friendlyError(e, 'Le rôle d\'équipe n\'a pas été enregistré.')) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open={!!fiche} onClose={onClose} title={fiche ? `Fiche bénévole · ${`${fiche.prenom || ''} ${fiche.nom || ''}`.trim()}` : ''}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={enregistrer} loading={busy}>Enregistrer</Button>
      </>}>
      {fiche && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Fiche venue d'Event Manager : identité, créneaux et droits se modifient là-bas.</p>
          <RoleEquipeBloc fiche={fiche} role={role} setRole={setRole} mdp={mdp} setMdp={setMdp} staff={staff} em showError={tried} />
          {/* Écran 12 : en attendant les créneaux d'Event Manager, l'ouverture exceptionnelle ouvre l'onglet */}
          {fiche.roleEquipe && <ExceptionRoleBloc fiche={live || fiche} eventId={ev} />}
        </div>
      )}
    </Dialog>
  )
}

function Ligne({ nom, badge, detail, onQr, docLabel, onDoc, onRenew, onRole }) {
  return (
    <div style={{ ...box, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{nom}{badge}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aujourd'hui : {detail}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {onRole && <Button size="sm" variant="secondary" icon={UserCog} onClick={onRole}>Rôle</Button>}
        <Button size="sm" variant="secondary" icon={QrIcon} onClick={onQr}>QR du lien</Button>
        <Button size="sm" variant="secondary" icon={FileText} onClick={onDoc}>{docLabel}</Button>
        <HoldButton tone="danger" onConfirm={onRenew}>Maintenir : renouveler le lien</HoldButton>
      </div>
    </div>
  )
}

function useListe(ev, name) {
  const [list, setList] = useState(null)
  useEffect(() => {
    if (!ev || !name) return   // sans nom : rien à écouter
    return onSnapshot(collection(db, 'events', ev, name), snap => setList(snap.docs.map(d => ({ ...d.data(), id: d.id }))), () => setList([]))
  }, [ev, name])
  return list
}

function Recherche({ value, onChange }) {
  return (
    <div style={{ ...box, display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px' }}>
      <Search size={16} style={{ color: 'var(--text-muted)' }} aria-hidden="true"/>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Rechercher" aria-label="Rechercher"
        style={{ border: 'none', outline: 'none', flex: 1, background: 'transparent', color: 'inherit', fontSize: 14 }}/>
    </div>
  )
}

const match = (q, ...txt) => !q.trim() || txt.join(' ').toLowerCase().includes(q.trim().toLowerCase())
const renouveler = async (ev, kind, id) => {
  try { await renewLinkKey(ev, kind, id); toast.success("Nouveau lien créé : l'ancien ne fonctionne plus") }
  catch (e) { toast.error(friendlyError(e, "Le lien n'a pas pu être renouvelé.")) }
}
const ouvrirLien = async (ev, kind, id, nom, set) => {
  try { set({ nom, url: await linkFor(ev, kind, id) }) }
  catch (e) { toast.error(friendlyError(e, "Le lien n'a pas pu être préparé.")) }
}

/* ── Page Bénévoles ─────────────────────────────────────────── */
export function BenevolesEm() {
  const { ev, event } = useEmEvent()
  const all = useListe(ev, 'benevoles')
  const [q, setQ] = useState('')
  const [lien, setLien] = useState(null)
  const [ficheRole, setFicheRole] = useState(null)
  const roleAdmin = ['admin', 'super_admin'].includes(useAuthStore(st => st.user?.role))
  const staff = useAppStore(st => st.staff) || []
  const jour = festDay()
  // Non relié (25/11/2026) : les fiches existantes, en lecture
  const relie = estRelie(event)
  const liste = useMemo(() => (all || [])
    .filter(b => (relie ? b.source === 'event-manager' : true) && b.actif !== false)
    .sort((a, b) => `${a.prenom || ''} ${a.nom || ''}`.localeCompare(`${b.prenom || ''} ${b.nom || ''}`, 'fr')), [all, relie])
  const shown = liste.filter(b => match(q, b.prenom, b.nom))

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <EnTete titre="Bénévoles" ev={ev} event={event}
        quoi="Pour ajouter un bénévole ou changer ses droits et ses jours de contrôle : Event Manager."/>
      {/* Écran 13 (24/11/2026) : offert et acheté à part, soldes des bénévoles */}
      <BilanBenevoles />

      <Recherche value={q} onChange={setQ}/>
      {all === null ? <p style={{ color: 'var(--text-muted)' }}>Chargement…</p> : shown.length === 0 ? (
        <Empty title={liste.length ? 'Aucun résultat' : 'Aucun bénévole'}>
          {liste.length ? 'Essayez un autre nom.' : relie ? "Event Manager n'a encore envoyé aucun bénévole avec des droits ou un contrôle des billets." : 'Aucun bénévole pour cet événement.'}
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(b => (
            <Ligne key={b.id} nom={`${b.prenom} ${b.nom}`.trim()}
              badge={<>
                {(b.controleBillets || []).includes(jour) && <Badge tone="brand">Entrée aujourd'hui</Badge>}
                {b.roleEquipe && <Badge tone="coral">{labelRoleEquipe(b.roleEquipe)}</Badge>}
              </>}
              onRole={roleAdmin ? () => setFicheRole(b) : undefined}
              detail={resume(b.droitsJours?.[jour], b.consoJours?.[jour])}
              onQr={() => ouvrirLien(ev, 'benevole', b.id, b.prenom, setLien)}
              docLabel="Carte PDF"
              onDoc={() => generateBenevrolePDF({ ...b, droits: somme(b.droitsJours), consommation: somme(b.consoJours) }, null, ev)}
              onRenew={() => renouveler(ev, 'benevole', b.id)}/>
          ))}
        </div>
      )}
      <LienDialog lien={lien} onClose={() => setLien(null)}/>
      {ficheRole && <RoleDialog ev={ev} fiche={ficheRole} staff={staff} onClose={() => setFicheRole(null)}
        live={(all || []).find(b => b.id === ficheRole.id)}/>}
    </div>
  )
}

/* ── Page Artistes ──────────────────────────────────────────── */
export function ArtistesEm() {
  const { ev, event } = useEmEvent()
  const relie = estRelie(event)
  const artistesEm = useListe(ev, 'artistes')
  // Non relié (25/11/2026) : les artistes du planning d'origine, en lecture (lien = créneau)
  const planning = useListe(ev, relie ? null : 'planning')
  const all = relie ? artistesEm : (planning === null ? null : planning.filter(p => p.artiste).map(p => ({ ...p, nom: p.artiste, depuisPlanning: true })))
  const menu = useListe(ev, 'menu')
  const consos = useListe(ev, 'artist-consumptions')
  const [offerts, setOfferts] = useState([])
  const [q, setQ] = useState('')
  const [lien, setLien] = useState(null)
  const jour = festDay()

  useEffect(() => {
    if (!ev) return
    return onSnapshot(doc(db, 'events', ev, 'settings', 'artistes'), snap => setOfferts(snap.data()?.articles || []), () => {})
  }, [ev])
  const toggle = async (id, on) => {
    const next = on ? [...new Set([...offerts, id])] : offerts.filter(x => x !== id)
    setOfferts(next)
    try { await setDoc(doc(db, 'events', ev, 'settings', 'artistes'), { articles: next }, { merge: true }) }
    catch (e) { toast.error(friendlyError(e, "La liste n'a pas pu être enregistrée.")) }
  }

  const articles = (menu || []).filter(m => LABEL[m.typeConsommation]).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const liste = useMemo(() => (all || []).filter(a => a.actif !== false).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')), [all])
  const shown = liste.filter(a => match(q, a.nom))
  const servi = (id) => {
    const t = { repas: 0, boisson: 0, eau: 0 }
    for (const c of consos || []) {
      if (c.creneauId !== id || festDay(c.servedAt) !== jour) continue
      t[c.type === 'meal' ? 'repas' : c.type === 'drink' ? 'boisson' : 'eau']++
    }
    return t
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <EnTete titre="Artistes" ev={ev} event={event} quoi="Pour ajouter un artiste ou changer ses avantages : Event Manager."/>
      <div style={box}>
        <b>Articles offerts aux artistes</b>
        <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>
          Une seule liste pour tous les artistes. Ils réservent parmi ces articles, dans la limite de leurs avantages du jour.
          Seuls les articles du menu marqués repas, boisson ou eau apparaissent ici.
        </p>
        {articles.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Aucun article du menu n'est marqué repas, boisson ou eau.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
            {articles.map(m => (
              <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                <input type="checkbox" checked={offerts.includes(m.id)} onChange={e => toggle(m.id, e.target.checked)}/>
                {m.nom} <Badge tone={TONE[m.typeConsommation]}>{LABEL[m.typeConsommation]}</Badge>
              </label>
            ))}
          </div>
        )}
      </div>
      <Recherche value={q} onChange={setQ}/>
      {all === null ? <p style={{ color: 'var(--text-muted)' }}>Chargement…</p> : shown.length === 0 ? (
        <Empty title={liste.length ? 'Aucun résultat' : 'Aucun artiste'}>
          {liste.length ? 'Essayez un autre nom.' : relie ? "Event Manager n'a encore envoyé aucun artiste avec des avantages." : 'Aucun artiste dans le planning de cet événement.'}
        </Empty>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(a => (
            <Ligne key={a.id} nom={a.nom}
              detail={resume(a.avantagesJours?.[jour], servi(a.id))}
              onQr={() => ouvrirLien(ev, 'artiste', a.id, a.nom, setLien)}
              docLabel="Fiche imprimable"
              onDoc={() => printArtisteSheet(a.depuisPlanning ? a : adaptArtisteEm(a, { jour, offerts, menu: menu || [] }), a.id, ev)}
              onRenew={() => renouveler(ev, 'artiste', a.id)}/>
          ))}
        </div>
      )}
      <LienDialog lien={lien} onClose={() => setLien(null)}/>
    </div>
  )
}
