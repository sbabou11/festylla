/**
 * pages/admin/Benevoles.jsx — v2 (design system)
 * Gestion complète des bénévoles :
 * - Création avec créneaux de présence par jour
 * - Calcul automatique des droits repas/boisson/eau
 * - Suivi de consommation en temps réel via QR code
 * - Prévention des abus (alertes dépassement)
 * Sous-composants, constantes et PDF dans ./benevoles/
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { db } from '../../firebase/config'
import useEventStore from '../../store/useEventStore'
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { nowStr } from '../../utils/helpers'
import { hashPassword } from '../../utils/kpis'
import { addAuditLog } from '../../firebase/service'
import { genUsername } from '../../store/useAuthStore'
import { Plus, Trash2, Users, AlertTriangle, Search, CalendarDays, BarChart3, RotateCcw } from 'lucide-react'
import { Button, Tabs, Empty, Skeleton, Dialog, HoldButton, toast } from '../../ui'
import VolunteerPlanning from '../../components/VolunteerPlanning'
import generateBenevrolePDF from './benevoles/pdf'
import { ITEM_CFG } from './benevoles/constants'
import FormBenevole from './benevoles/FormBenevole'
import CarteBenevole from './benevoles/CarteBenevole'
import SyntheseBenevoles from './benevoles/SyntheseBenevoles'
import s from './benevoles/benevoles.module.css'

// ── Page principale ───────────────────────────────────────────────
export default function Benevoles() {
  const { currentEventId } = useEventStore()
  const [benevoles, setBenevoles] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [search, setSearch]       = useState('')
  const [section, setSection]     = useState('liste') // liste | planning | stats
  // Fenêtres de confirmation (remplacent window.confirm)
  const [pendingDel, setPendingDel]     = useState(null)
  const [pendingReset, setPendingReset] = useState(null)

  // Écoute temps réel Firebase
  useEffect(() => {
    const unsub = onSnapshot(
      query(currentEventId ? collection(db, 'events', currentEventId, 'benevoles') : collection(db, 'benevoles'), orderBy('createdAt', 'desc')),
      snap => { setBenevoles(snap.docs.map(d => ({ ...d.data(), id: d.id }))); setLoading(false) },
      () => setLoading(false)
    )
    return unsub
  }, [])

  // ── CRUD ─────────────────────────────────────────────────────────
  const createBenevole = async (data) => {
    // Générer les identifiants de connexion
    const username = genUsername(data.prenom + ' ' + data.nom)
    const password = username + '123'
    const passwordHash = await hashPassword(password)
    const docRef = await addDoc(
      currentEventId ? collection(db, 'events', currentEventId, 'benevoles') : collection(db, 'benevoles'),
      {
        ...data,
        username,
        password,
        passwordHash,
        consommation: { repas:0, boisson:0, eau:0 },
        historique:   [],
        role:         'benevole',
        eventId:      currentEventId || null,
        createdAt:    serverTimestamp(),
      }
    )
    await addAuditLog('CREATION_BENEV', {
      benevoleNom: `${data.prenom} ${data.nom}`,
      username, poste: data.poste || '',
      droits: JSON.stringify(data.droits || {}),
      userType: 'admin',
      label: `Création bénévole : ${data.prenom} ${data.nom}`,
    })
    setShowForm(false)
  }

  const saveBenevole = async (data) => {
    // Recalculer les droits et ajuster la consommation si besoin
    const old    = editing
    const newDroits = data.droits
    const conso  = old.consommation || {}
    // Cap la consommation aux nouveaux droits
    const newConso = {
      repas:   Math.min(conso.repas||0,   newDroits.repas),
      boisson: Math.min(conso.boisson||0, newDroits.boisson),
      eau:     Math.min(conso.eau||0,     newDroits.eau),
    }
    const hist = [...(old.historique||[]),
      { action:`Modification créneaux → ${Object.values(data.droits).reduce((a,v)=>a+v,0)} droits`, date:nowStr() }
    ]
    const bRef = currentEventId ? doc(db, 'events', currentEventId, 'benevoles', old.id) : doc(db, 'benevoles', old.id)
    // Re-hasher le mdp si modifié
    let updatePayload = { ...data, consommation:newConso, historique:hist }
    if (data.password && data.password !== old.password) {
      updatePayload.passwordHash = await hashPassword(data.password)
    }
    await updateDoc(bRef, updatePayload)
    await addAuditLog('MODIF_BENEV', {
      benevoleId: old.id, benevoleNom: `${data.prenom} ${data.nom}`,
      userType: 'admin',
      label: `Modification bénévole : ${data.prenom} ${data.nom}`,
    })
    setEditing(null)
  }

  // Suppression : confirmée dans une fenêtre (appui long), puis audit + suppression
  const deleteBenevole = (b) => setPendingDel(b)
  const confirmDelete = async () => {
    const b = pendingDel
    setPendingDel(null)
    if (!b) return
    await addAuditLog('SUPPRESSION_BENEV', { benevoleId: b.id, benevoleNom: `${b.prenom} ${b.nom}`, userType: 'admin', label: `Suppression bénévole : ${b.prenom} ${b.nom}` })
    await deleteDoc(currentEventId ? doc(db, 'events', currentEventId, 'benevoles', b.id) : doc(db, 'benevoles', b.id))
  }

  const consommer = async (b, item) => {
    const conso  = b.consommation || {}
    const droits = b.droits || {}
    const actuel = conso[item] || 0
    const droit  = droits[item] || 0
    if (actuel >= droit) { toast.error(`${b.prenom} ${b.nom} a déjà consommé tous ses droits de type "${ITEM_CFG[item].label}".`); return }
    const newConso = { ...conso, [item]: actuel + 1 }
    const hist = [...(b.historique||[]),
      { action:`${ITEM_CFG[item].label} consommé(e) (${actuel+1}/${droit})`, date:nowStr() }
    ]
    await updateDoc(currentEventId ? doc(db, 'events', currentEventId, 'benevoles', b.id) : doc(db, 'benevoles', b.id), { consommation:newConso, historique:hist })
    await addAuditLog('CONSO_BENEV', { benevoleId: b.id, benevoleNom: `${b.prenom} ${b.nom}`, type: item, actuel: actuel+1, droit, userType: 'admin', label: `Consommation ${ITEM_CFG[item].label} pour ${b.prenom} ${b.nom} (${actuel+1}/${droit})` })
  }

  // Remise à zéro : rien n'est écrit (ni audit ni compteurs) tant qu'elle n'est pas confirmée
  const resetConso = (b) => setPendingReset(b)
  const confirmReset = async () => {
    const b = pendingReset
    setPendingReset(null)
    if (!b) return
    await addAuditLog('RESET_CONSO_BENEV', { benevoleId: b.id, benevoleNom: `${b.prenom} ${b.nom}`, userType: 'admin', label: `Réinitialisation conso bénévole : ${b.prenom} ${b.nom}` })
    const hist = [...(b.historique||[]), { action:'Compteurs remis à zéro par admin', date:nowStr() }]
    await updateDoc(currentEventId ? doc(db, 'events', currentEventId, 'benevoles', b.id) : doc(db, 'benevoles', b.id), { consommation:{ repas:0, boisson:0, eau:0 }, historique:hist })
  }

  // ── Filtres et stats ──────────────────────────────────────────────
  const filtered = benevoles.filter(b =>
    `${b.prenom} ${b.nom} ${b.poste}`.toLowerCase().includes(search.toLowerCase())
  )

  const abuseurs = benevoles.filter(b => {
    const c = b.consommation||{}, d = b.droits||{}
    return Object.keys(d).some(k => (c[k]||0) > (d[k]||0))
  })

  const totalDroits = benevoles.reduce((acc, b) => {
    const d = b.droits||{}
    return { repas:acc.repas+(d.repas||0), boisson:acc.boisson+(d.boisson||0), eau:acc.eau+(d.eau||0) }
  }, { repas:0, boisson:0, eau:0 })

  const totalConso = benevoles.reduce((acc, b) => {
    const c = b.consommation||{}
    return { repas:acc.repas+(c.repas||0), boisson:acc.boisson+(c.boisson||0), eau:acc.eau+(c.eau||0) }
  }, { repas:0, boisson:0, eau:0 })

  if (loading) return (
    <div className={s.stack} aria-busy="true">
      <Skeleton height={40} width={280}/>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={s.skeletonRow}>
          <Skeleton width={44} height={44} radius={12}/>
          <div className={s.grow}>
            <Skeleton height={14} width="45%"/>
            <Skeleton height={11} width="30%" className={s.skLine}/>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className={s.page}>

      {/* Alertes dépassement en haut */}
      {abuseurs.length > 0 && (
        <div className={s.abuse} role="alert">
          <AlertTriangle size={16} aria-hidden="true" className={s.abuseIcon}/>
          <p>
            <strong>{abuseurs.length} dépassement{abuseurs.length>1?'s':''} détecté{abuseurs.length>1?'s':''} :</strong>{' '}
            {abuseurs.map(b => `${b.prenom} ${b.nom}`).join(', ')}
          </p>
        </div>
      )}

      {/* Onglets + actions */}
      <div className={s.toolbar}>
        <Tabs
          label="Bénévoles"
          value={section}
          onChange={setSection}
          items={[
            { value:'liste',    label:<><Users size={14} aria-hidden="true"/>Liste</>, count: benevoles.length },
            { value:'planning', label:<><CalendarDays size={14} aria-hidden="true"/>Planning</> },
            { value:'stats',    label:<><BarChart3 size={14} aria-hidden="true"/>Synthèse</> },
          ]}
        />
        {!showForm && !editing && section === 'liste' && (
          <Button icon={Plus} onClick={() => setShowForm(true)}>Nouveau bénévole</Button>
        )}
      </div>

      {/* Formulaire création */}
      {showForm && !editing && (
        <FormBenevole onSave={createBenevole} onCancel={() => setShowForm(false)}/>
      )}

      {/* Formulaire édition */}
      {editing && (
        <FormBenevole initial={editing} onSave={saveBenevole} onCancel={() => setEditing(null)}/>
      )}

      {/* ── SECTION PLANNING ── */}
      {section === 'planning' && !showForm && !editing && (
        <VolunteerPlanning benevoles={benevoles}/>
      )}

      {/* ── SECTION LISTE ── */}
      {section === 'liste' && (
        <>
          {/* Barre de recherche */}
          {benevoles.length > 3 && (
            <div className={s.search}>
              <Search size={16} className={s.searchIcon} aria-hidden="true"/>
              <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Rechercher un bénévole…" aria-label="Rechercher un bénévole" className={s.searchInput}/>
            </div>
          )}

          {filtered.length === 0 ? (
            <Empty icon={Users} title={benevoles.length === 0 ? 'Aucun bénévole enregistré' : 'Aucun résultat'}>
              {benevoles.length === 0 && 'Créez-en un avec « Nouveau bénévole ».'}
            </Empty>
          ) : (
            <div className={clsx(s.list, 'yc-stagger')}>
              {filtered.map(b => (
                <CarteBenevole key={b.id} b={b}
                  onEdit={setEditing}
                  onGeneratePDF={(b) => generateBenevrolePDF(b, null, currentEventId)}
                  onDelete={deleteBenevole}
                  onConsommer={consommer}
                  onReset={resetConso}
                  currentEventId={currentEventId}/>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SECTION STATS ── */}
      {section === 'stats' && (
        <SyntheseBenevoles benevoles={benevoles} totalDroits={totalDroits} totalConso={totalConso}/>
      )}

      {/* Suppression d'un bénévole (irréversible) */}
      <Dialog open={!!pendingDel} onClose={() => setPendingDel(null)} title="Supprimer ce bénévole ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingDel(null)}>Annuler</Button>
          <HoldButton tone="danger" icon={Trash2} onConfirm={confirmDelete}>Maintenir pour supprimer</HoldButton>
        </>}>
        <p className={s.dialogText}>
          Supprimer <b>{pendingDel?.prenom} {pendingDel?.nom}</b> ? Ses droits, sa consommation et son historique seront perdus. Cette action est irréversible.
        </p>
      </Dialog>

      {/* Remise à zéro des compteurs */}
      <Dialog open={!!pendingReset} onClose={() => setPendingReset(null)} title="Réinitialiser les compteurs ?"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingReset(null)}>Annuler</Button>
          <Button variant="danger" icon={RotateCcw} onClick={confirmReset}>Réinitialiser</Button>
        </>}>
        <p className={s.dialogText}>
          Réinitialiser les compteurs de consommation de <b>{pendingReset?.prenom} {pendingReset?.nom}</b> ? Repas, boissons et eau repartent à zéro.
        </p>
      </Dialog>
    </div>
  )
}
