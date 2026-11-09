/**
 * pages/admin/Exposants.jsx — v1.0.0 (Lot 2)
 *
 * Page de gestion des exposants payant des frais d'exposition.
 *
 * 3 vues :
 *   - Liste (par défaut) : stats globales + cartes exposants avec statut paiement
 *   - Détail : vue complète d'un exposant + actions (paiements, docs, PDF)
 *   - Formulaire : création / édition
 *
 * Navigation interne par état React (pas de routing distinct).
 */

import React, { useState, useMemo } from 'react'
import {
  Plus, Search, ArrowLeft, Edit2, Trash2, Check, X,
  FileText, Receipt, Upload, Download, AlertCircle,
  Building2, Tag, Euro, Calendar, Mail, Phone, ShieldCheck,
} from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import useEventStore from '../../store/useEventStore'
import useAuthStore from '../../store/useAuthStore'
import {
  createExposition, updateExposition, deleteExposition,
  registerExpoPayment, removeExpoPayment,
  getSettings,
} from '../../firebase/service'
import {
  computeExpoStatut, computeExpoPaye, computeExpoRestant, computeExpoPercent,
  STATUT_LABEL, statutColors, aggregateExpoStats, PAYMENT_METHODS, METHOD_LABEL,
  isExpoStatutForce,
  TYPE_EXPOSANT, TYPE_LABEL, defaultIdentite, expoDisplayName,
  newLigne, getExpoLignes,
} from '../../utils/expositions'
import ExpoDocuments from '../../components/expo/ExpoDocuments'
import ExpoPDFButtons from '../../components/expo/ExpoPDFButtons'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export default function Exposants() {
  const { user } = useAuthStore()
  const { currentEventId } = useEventStore()
  const { expositions } = useAppStore()
  const { isMobile } = useBreakpoint()

  const [view, setView]         = useState('list')   // 'list' | 'detail' | 'form'
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId]   = useState(null) // null = création
  const [search, setSearch]     = useState('')

  // Thématiques chargées au montage (sans listener — config rarement modifiée)
  const [thematiques, setThematiques] = useState([])
  const [organisateur, setOrganisateur] = useState(null)
  // Configuration TVA de l'événement (Lot C3) chargée depuis settings
  // pour pouvoir afficher/saisir les taux dans le formulaire.
  const [tvaConfig, setTvaConfig] = useState({ active: false, defaultTaux: 0 })

  React.useEffect(() => {
    if (!currentEventId) return
    getSettings(currentEventId).then(s => {
      setThematiques(Array.isArray(s?.expoThematiques) ? s.expoThematiques : [])
      setOrganisateur(s?.organisateur || null)
      setTvaConfig({
        active: !!s?.tvaActive,
        defaultTaux: Number(s?.tvaDefaultTaux) || 0,
      })
    }).catch(() => {})
  }, [currentEventId])

  // Filtre les exposants par recherche
  const filteredExpos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expositions || []
    return (expositions || []).filter(e => {
      const id = e.identite || {}
      return (
        // Nom historique + nom d'affichage calculé
        (e.nom || '').toLowerCase().includes(q) ||
        expoDisplayName(e).toLowerCase().includes(q) ||
        // Identité particulier
        (id.prenom || '').toLowerCase().includes(q) ||
        (id.nom || '').toLowerCase().includes(q) ||
        // Identité entreprise
        (id.raisonSociale || '').toLowerCase().includes(q) ||
        (id.siret || '').toLowerCase().includes(q) ||
        // Thématique + legacy
        (e.thematiqueLabel || '').toLowerCase().includes(q) ||
        (e.contact || '').toLowerCase().includes(q) ||
        (id.email || '').toLowerCase().includes(q) ||
        (id.telephone || '').toLowerCase().includes(q)
      )
    })
  }, [expositions, search])

  // Sélectionne un exposant pour détail
  const openDetail = (id) => { setSelectedId(id); setView('detail') }
  const openForm = (id = null) => { setEditingId(id); setView('form') }
  const backToList = () => { setView('list'); setSelectedId(null); setEditingId(null) }

  const selected = useMemo(
    () => (expositions || []).find(e => e.id === selectedId),
    [expositions, selectedId]
  )

  // ═══════════════════════════════════════════════════════════════════
  // VUE FORMULAIRE
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'form') {
    return <ExpoForm
      expo={editingId ? expositions.find(e => e.id === editingId) : null}
      thematiques={thematiques}
      tvaConfig={tvaConfig}
      eventId={currentEventId}
      onBack={backToList}
      onSaved={(id) => { setSelectedId(id); setView('detail') }}
    />
  }

  // ═══════════════════════════════════════════════════════════════════
  // VUE DÉTAIL
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'detail' && selected) {
    return <ExpoDetail
      expo={selected}
      organisateur={organisateur}
      eventId={currentEventId}
      isMobile={isMobile}
      onBack={backToList}
      onEdit={() => openForm(selected.id)}
    />
  }

  // ═══════════════════════════════════════════════════════════════════
  // VUE LISTE
  // ═══════════════════════════════════════════════════════════════════
  const stats = aggregateExpoStats(expositions)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 0 16px' }}>

      {/* Stats globales */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 8, marginBottom: 12,
      }}>
        <StatCard label="Total facturé" value={`${(stats.totalFacture / 100).toFixed(2)} €`} color="var(--text)"/>
        <StatCard label="Encaissé" value={`${(stats.totalEncaisse / 100).toFixed(2)} €`} color="var(--green-dark)"/>
        <StatCard label="Restant dû" value={`${(stats.totalRestant / 100).toFixed(2)} €`} color={stats.totalRestant > 0 ? 'var(--gold-dark)' : 'var(--text)'}/>
        <StatCard label="Exposants" value={String((expositions || []).length)} color="var(--text)"/>
      </div>

      {/* Recherche + bouton ajouter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', pointerEvents: 'none',
          }}/>
          <input
            type="text"
            placeholder="Rechercher un exposant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '9px 10px 9px 32px', fontSize: 13,
              background: 'var(--bg)', color: 'var(--text)',
              border: '0.5px solid var(--border)', borderRadius: 8,
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
        <button onClick={() => openForm()}
          style={{
            padding: '9px 14px', background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5,
            WebkitTapHighlightColor: 'transparent', flexShrink: 0,
          }}>
          <Plus size={14}/> Ajouter
        </button>
      </div>

      {/* Liste */}
      {filteredExpos.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'var(--bg)', border: '0.5px solid var(--border)',
          borderRadius: 12,
        }}>
          <Building2 size={36} style={{ color: 'var(--muted)', marginBottom: 10 }}/>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {search ? 'Aucun résultat' : 'Aucun exposant'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {search ? 'Essayez un autre terme de recherche' : 'Cliquez sur "Ajouter" pour créer votre premier exposant.'}
          </div>
          {!search && thematiques.length === 0 && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: 'var(--gold-light)', border: '0.5px solid var(--gold)',
              borderRadius: 8, fontSize: 11, color: 'var(--gold-dark)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <AlertCircle size={14}/>
              Configurez d'abord les <strong>thématiques d'exposition</strong> dans Paramètres.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredExpos.map(expo => (
            <ExpoCard key={expo.id} expo={expo} onClick={() => openDetail(expo.id)}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════════════

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: '0.5px solid var(--border)',
      borderRadius: 8, padding: '10px',
    }}>
      <div style={{
        fontSize: 10, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function ExpoCard({ expo, onClick }) {
  const statut = computeExpoStatut(expo)
  const colors = statutColors(statut)
  const percent = computeExpoPercent(expo)

  return (
    <button onClick={onClick}
      style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 10, padding: '12px 14px',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
          {expoDisplayName(expo)}
        </div>
        <span title={isExpoStatutForce(expo) ? 'Statut forcé manuellement' : ''}
          style={{
            padding: '3px 8px', background: colors.bg, color: colors.color,
            fontSize: 9, fontWeight: 700, borderRadius: 4, letterSpacing: '0.04em',
            textTransform: 'uppercase', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
          {isExpoStatutForce(expo) && <span style={{ fontSize: 10, lineHeight: 1 }}>⚠️</span>}
          {STATUT_LABEL[statut]}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        {expo.thematiqueLabel || '—'} · {((expo.montantTotal || 0) / 100).toFixed(2)} €
      </div>
      {/* Barre de progression */}
      <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${percent}%`,
          background: statut === 'paye' ? 'var(--green-dark)'
                     : statut === 'acompte' ? 'var(--gold-dark)'
                     : 'var(--red-dark)',
          transition: 'width .3s',
        }}/>
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// VUE DÉTAIL
// ═══════════════════════════════════════════════════════════════════════

function ExpoDetail({ expo, organisateur, eventId, isMobile, onBack, onEdit }) {
  const { user } = useAuthStore()
  const canForceStatut = user && ['admin', 'super_admin'].includes(user.role)

  const [showPaymentForm, setShowPaymentForm] = useState(null) // 'acompte' | 'solde' | null
  const [paymentMontant, setPaymentMontant]   = useState('')
  const [paymentDate, setPaymentDate]         = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod]     = useState('cash')
  const [loading, setLoading]                 = useState(false)
  const [err, setErr]                         = useState('')

  // ─── Édition d'un paiement existant (Étape 2) ────────────────────
  // Modale qui s'ouvre au clic ✏️ sur un paiement. Permet de modifier
  // montant / date / méthode (la date peut être passée).
  const [editPaymentKind, setEditPaymentKind] = useState(null) // 'acompte'|'solde'|null
  const [editMontant, setEditMontant] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editMethod, setEditMethod] = useState('cash')
  const [editLoading, setEditLoading] = useState(false)
  const [editErr, setEditErr] = useState('')

  const openEditPayment = (kind) => {
    const p = expo[kind]
    if (!p) return
    setEditPaymentKind(kind)
    setEditMontant(((p.montant || 0) / 100).toFixed(2))
    setEditDate(p.date || new Date().toISOString().slice(0, 10))
    setEditMethod(p.method || 'cash')
    setEditErr('')
  }

  const submitEditPayment = async () => {
    const centimes = Math.round((parseFloat(editMontant.replace(',', '.')) || 0) * 100)
    if (centimes <= 0) { setEditErr('Montant invalide'); return }
    setEditLoading(true); setEditErr('')
    try {
      const { editExpoPayment } = await import('../../firebase/service')
      await editExpoPayment(expo.id, editPaymentKind, {
        montant: centimes,
        date: editDate,
        method: editMethod,
      }, eventId)
      setEditPaymentKind(null)
    } catch (e) {
      setEditErr(e.message)
    } finally {
      setEditLoading(false)
    }
  }

  // ─── Forçage de statut (admin/super_admin) ───────────────────────
  // Modale qui s'ouvre au clic sur "Forcer le statut".
  // Demande un statut cible + un motif (≥ 3 caractères).
  const [showForceModal, setShowForceModal]   = useState(false)
  const [forceStatutVal, setForceStatutVal]   = useState('paye')
  const [forceMotif, setForceMotif]           = useState('')
  const [forceLoading, setForceLoading]       = useState(false)
  const [forceErr, setForceErr]               = useState('')

  const submitForce = async () => {
    if (forceMotif.trim().length < 3) {
      setForceErr('Le motif doit faire au moins 3 caractères.')
      return
    }
    setForceLoading(true); setForceErr('')
    try {
      const { forceExpoStatut } = await import('../../firebase/service')
      await forceExpoStatut(expo.id, forceStatutVal, forceMotif, {
        staffNom: user?.nom || user?.email || 'Admin',
        staffUid: user?.id || null,
      }, eventId)
      setShowForceModal(false)
      setForceMotif('')
    } catch (e) {
      setForceErr(e.message)
    } finally {
      setForceLoading(false)
    }
  }

  const submitClearForce = async () => {
    if (!confirm('Retirer le forçage de statut ? Le statut redeviendra calculé automatiquement depuis les paiements.')) return
    try {
      const { clearExpoStatutForce } = await import('../../firebase/service')
      await clearExpoStatutForce(expo.id, {
        staffNom: user?.nom || user?.email || 'Admin',
        staffUid: user?.id || null,
      }, eventId)
    } catch (e) { alert(e.message) }
  }

  const statut = computeExpoStatut(expo)
  const colors = statutColors(statut)
  const paye = computeExpoPaye(expo)
  const restant = computeExpoRestant(expo)

  const openPayment = (kind) => {
    setShowPaymentForm(kind)
    setPaymentMontant((restant / 100).toFixed(2))
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentMethod('cash')
    setErr('')
  }

  const submitPayment = async () => {
    const centimes = Math.round((parseFloat(paymentMontant.replace(',', '.')) || 0) * 100)
    if (centimes <= 0) { setErr('Montant invalide'); return }
    setLoading(true); setErr('')
    try {
      await registerExpoPayment(expo.id, showPaymentForm, {
        montant: centimes, date: paymentDate, method: paymentMethod,
      }, eventId)
      setShowPaymentForm(null)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  const handleCancelPayment = async (kind) => {
    if (!confirm(`Annuler le ${kind} enregistré ? Cette action ne peut pas être annulée.`)) return
    try { await removeExpoPayment(expo.id, kind, eventId) }
    catch (e) { alert(e.message) }
  }

  const handleDelete = async () => {
    const displayName = expoDisplayName(expo)
    if (!confirm(`Supprimer l'exposant "${displayName}" ?\n\nCette action est irréversible. Les paiements enregistrés et les documents joints seront perdus.`)) return
    try { await deleteExposition(expo.id, eventId); onBack() }
    catch (e) { alert(e.message) }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 16px' }}>

      <button onClick={onBack}
        style={{
          background: 'transparent', border: '0.5px solid var(--border2)',
          padding: '6px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
          color: 'var(--text)', fontFamily: 'inherit', marginBottom: 10,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <ArrowLeft size={12}/> Retour
      </button>

      {/* Carte identité */}
      <div style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            {/* Badge type + nom d'affichage calculé */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                padding: '2px 6px',
                background: expo.typeExposant === 'entreprise' ? 'var(--brand-light)' : 'var(--bg2)',
                color: expo.typeExposant === 'entreprise' ? 'var(--brand-dark)' : 'var(--muted)',
                fontSize: 9, fontWeight: 700, borderRadius: 3, letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {TYPE_LABEL[expo.typeExposant] || 'Particulier'}
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              {expoDisplayName(expo)}
            </div>
            {expo.thematiqueLabel && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {expo.thematiqueLabel}
              </div>
            )}
            {/* Infos entreprise (si applicable) */}
            {expo.typeExposant === 'entreprise' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {expo.identite?.siret    && <div>SIRET : <strong>{expo.identite.siret}</strong></div>}
                {expo.identite?.tva       && <div>TVA : <strong>{expo.identite.tva}</strong></div>}
                {expo.identite?.dirigeant && <div>Dirigeant : <strong>{expo.identite.dirigeant}</strong></div>}
              </div>
            )}
            {/* Contact */}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {expo.identite?.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Mail size={11}/> {expo.identite.email}
                </div>
              )}
              {expo.identite?.telephone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  📞 {expo.identite.telephone}
                </div>
              )}
              {(expo.identite?.adresse || expo.identite?.ville) && (
                <div>
                  {[expo.identite?.adresse, expo.identite?.codePostal, expo.identite?.ville].filter(Boolean).join(', ')}
                </div>
              )}
              {/* Fallback : ancien champ contact (legacy) */}
              {!expo.identite?.email && !expo.identite?.telephone && expo.contact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Mail size={11}/> {expo.contact}
                </div>
              )}
            </div>
          </div>
          <span title={isExpoStatutForce(expo) ? `Statut forcé manuellement.\nMotif : ${expo.forcedStatutMotif || '—'}` : ''}
            style={{
              padding: '3px 8px', background: colors.bg, color: colors.color,
              fontSize: 9, fontWeight: 700, borderRadius: 4, letterSpacing: '0.04em',
              textTransform: 'uppercase', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            {isExpoStatutForce(expo) && (
              <span style={{ fontSize: 11, lineHeight: 1 }} aria-label="Statut forcé">⚠️</span>
            )}
            {STATUT_LABEL[statut]}
          </span>
        </div>

        {/* Bandeau d'info si statut forcé (affiché juste sous l'en-tête) */}
        {isExpoStatutForce(expo) && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'var(--gold-light)', color: 'var(--gold-dark)',
            border: '0.5px solid var(--gold)', borderRadius: 8,
            fontSize: 11, display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                Statut forcé manuellement
              </div>
              <div style={{ marginTop: 2, opacity: 0.9 }}>
                <strong>Motif :</strong> {expo.forcedStatutMotif || '—'}
              </div>
              {expo.forcedStatutBy?.nom && (
                <div style={{ marginTop: 1, opacity: 0.75, fontSize: 10 }}>
                  Par {expo.forcedStatutBy.nom}
                  {expo.forcedStatutBy.at && ' le ' + new Date(expo.forcedStatutBy.at).toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lignes facturables détaillées */}
        {(() => {
          const lignes = getExpoLignes(expo)
          if (lignes.length === 0) return null
          return (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              background: 'var(--bg2)', borderRadius: 8,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
              }}>
                Détail des frais
              </div>
              {lignes.map((l, i) => (
                <div key={l.id || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '4px 0',
                  borderBottom: i < lignes.length - 1 ? '0.5px solid var(--border)' : 'none',
                  fontSize: 12, color: 'var(--text)',
                }}>
                  <span style={{ flex: 1, minWidth: 0, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{l.qty}×</strong> {l.description}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
                    {((l.prixUnit || 0) / 100).toFixed(2)} € → {((l.total || 0) / 100).toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>
          )
        })()}

        {expo.commentaires && (
          <div style={{
            marginTop: 10, padding: '8px 10px', background: 'var(--bg2)',
            borderRadius: 6, fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}>
            {expo.commentaires}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button onClick={onEdit}
            style={{
              flex: 1, padding: '8px', background: 'var(--blue-dark, #185FA5)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <Edit2 size={12}/> Modifier
          </button>
          <button onClick={handleDelete}
            style={{
              padding: '8px 12px', background: 'transparent', color: 'var(--red-dark)',
              border: '0.5px solid var(--red)', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}>
            <Trash2 size={12}/>
          </button>
        </div>
      </div>

      {/* Bloc paiements */}
      <div style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10,
        }}>
          Paiements
        </div>

        <PaymentLine label="Total dû" value={`${((expo.montantTotal || 0) / 100).toFixed(2)} €`} bold/>

        {expo.acompte ? (
          <PaymentRecord
            label="Acompte"
            payment={expo.acompte}
            color="var(--green-dark)"
            onEdit={() => openEditPayment('acompte')}
            onCancel={() => handleCancelPayment('acompte')}
          />
        ) : (
          <PaymentLine label="Acompte" value="—" muted/>
        )}

        {expo.solde ? (
          <PaymentRecord
            label="Solde"
            payment={expo.solde}
            color="var(--green-dark)"
            onEdit={() => openEditPayment('solde')}
            onCancel={() => handleCancelPayment('solde')}
          />
        ) : (
          <PaymentLine label="Solde" value="—" muted/>
        )}

        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700,
            color: restant > 0 ? 'var(--gold-dark)' : 'var(--green-dark)' }}>
            {restant > 0 ? 'Restant dû' : '✓ Soldé'}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700,
            color: restant > 0 ? 'var(--gold-dark)' : 'var(--green-dark)' }}>
            {(restant / 100).toFixed(2)} €
          </span>
        </div>

        {/* Formulaire de saisie d'un paiement */}
        {showPaymentForm && (
          <div style={{
            marginTop: 12, padding: '12px', background: 'var(--bg2)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              Enregistrer {showPaymentForm === 'acompte' ? 'un acompte' : 'le solde'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                  Montant (€)
                </label>
                <input type="text" inputMode="decimal" value={paymentMontant}
                  onChange={e => setPaymentMontant(e.target.value.replace(/[^0-9.,]/g, ''))}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13,
                    background: 'var(--bg)', border: '0.5px solid var(--border)',
                    borderRadius: 6, outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box', color: 'var(--text)',
                  }}/>
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                  Date
                </label>
                <input type="date" value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px', fontSize: 13,
                    background: 'var(--bg)', border: '0.5px solid var(--border)',
                    borderRadius: 6, outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box', color: 'var(--text)',
                  }}/>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>
                  Une date passée est acceptée (rattrapage).
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                Mode de paiement
              </label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  background: 'var(--bg)', border: '0.5px solid var(--border)',
                  borderRadius: 6, outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box', color: 'var(--text)',
                }}>
                {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {err && (
              <div style={{
                padding: '8px 10px', background: 'var(--red-light)', color: 'var(--red-dark)',
                borderRadius: 6, fontSize: 11, marginBottom: 8,
              }}>{err}</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setShowPaymentForm(null)} disabled={loading}
                style={{
                  flex: 1, padding: '9px', background: 'transparent',
                  color: 'var(--text)', border: '0.5px solid var(--border)',
                  borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}>Annuler</button>
              <button onClick={submitPayment} disabled={loading}
                style={{
                  flex: 1, padding: '9px', background: 'var(--brand)',
                  color: '#fff', border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}>{loading ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        )}

        {!showPaymentForm && restant > 0 && (
          <button onClick={() => openPayment(expo.acompte ? 'solde' : 'acompte')}
            style={{
              width: '100%', marginTop: 10, padding: '9px',
              background: 'var(--brand)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <Plus size={12}/> Enregistrer {expo.acompte ? 'le solde' : 'un acompte'}
          </button>
        )}

        {/* Forçage manuel de statut (admin/super_admin) */}
        {canForceStatut && (
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: '0.5px dashed var(--border)',
            display: 'flex', gap: 8,
          }}>
            {isExpoStatutForce(expo) ? (
              <>
                <button onClick={() => { setForceStatutVal(expo.forcedStatut); setForceMotif(expo.forcedStatutMotif || ''); setShowForceModal(true) }}
                  style={{
                    flex: 1, padding: '7px 10px',
                    background: 'transparent', color: 'var(--gold-dark)',
                    border: '0.5px solid var(--gold)', borderRadius: 6,
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                  Modifier le forçage
                </button>
                <button onClick={submitClearForce}
                  style={{
                    flex: 1, padding: '7px 10px',
                    background: 'transparent', color: 'var(--red-dark)',
                    border: '0.5px solid var(--red)', borderRadius: 6,
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  Retirer le forçage
                </button>
              </>
            ) : (
              <button onClick={() => { setForceStatutVal('paye'); setForceMotif(''); setShowForceModal(true) }}
                style={{
                  width: '100%', padding: '7px 10px',
                  background: 'transparent', color: 'var(--muted)',
                  border: '0.5px dashed var(--border2)', borderRadius: 6,
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                ⚠️ Forcer manuellement le statut
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modale d'édition de paiement (Étape 2) */}
      {editPaymentKind && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 12, zIndex: 9999, backdropFilter: 'blur(2px)',
        }} onClick={() => !editLoading && setEditPaymentKind(null)}>
          <div style={{
            background: 'var(--bg)', borderRadius: 16, width: '100%',
            maxWidth: 440, maxHeight: '85vh', overflow: 'auto',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                Modifier {editPaymentKind === 'acompte' ? "l'acompte" : 'le solde'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Vous pouvez modifier le montant, la date et le mode de paiement.
                La date peut être dans le passé pour rattraper un paiement non-enregistré.
              </div>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4,
                }}>Montant (€) *</label>
                <input type="text" inputMode="decimal"
                  value={editMontant}
                  onChange={e => setEditMontant(e.target.value.replace(/[^0-9.,]/g, ''))}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 14,
                    background: 'var(--bg2)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}/>
              </div>
              <div>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4,
                }}>Date</label>
                <input type="date" value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg2)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}/>
              </div>
              <div>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 4,
                }}>Mode de paiement</label>
                <select value={editMethod} onChange={e => setEditMethod(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg2)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}>
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              {editErr && (
                <div style={{
                  padding: '8px 10px',
                  background: 'var(--red-light)', color: 'var(--red-dark)',
                  borderRadius: 6, fontSize: 11,
                }}>{editErr}</div>
              )}
            </div>

            <div style={{
              padding: '12px 18px', borderTop: '0.5px solid var(--border)',
              display: 'flex', gap: 8,
            }}>
              <button onClick={() => setEditPaymentKind(null)} disabled={editLoading}
                style={{
                  flex: 1, padding: '10px', background: 'transparent',
                  color: 'var(--text)', border: '0.5px solid var(--border)',
                  borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>Annuler</button>
              <button onClick={submitEditPayment} disabled={editLoading}
                style={{
                  flex: 1, padding: '10px',
                  background: editLoading ? 'var(--bg2)' : 'var(--brand)',
                  color: editLoading ? 'var(--muted)' : '#fff',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: editLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}>
                {editLoading ? 'Application…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de forçage de statut */}
      {showForceModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 12, zIndex: 9999, backdropFilter: 'blur(2px)',
        }} onClick={() => !forceLoading && setShowForceModal(false)}>
          <div style={{
            background: 'var(--bg)', borderRadius: 16, width: '100%',
            maxWidth: 480, maxHeight: '85vh', overflow: 'auto',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>

            {/* En-tête */}
            <div style={{
              padding: '14px 18px', borderBottom: '0.5px solid var(--border)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span> Forcer le statut de paiement
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Le statut affiché sera différent du calcul automatique basé sur les montants.
                Cette action est tracée dans l'audit.
              </div>
            </div>

            {/* Corps */}
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 6,
                }}>Statut cible</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {['paye', 'acompte', 'impaye'].map(s => (
                    <button key={s} onClick={() => setForceStatutVal(s)}
                      style={{
                        padding: '10px 8px', fontSize: 11, fontWeight: 600,
                        background: forceStatutVal === s ? statutColors(s).bg : 'var(--bg2)',
                        color: forceStatutVal === s ? statutColors(s).color : 'var(--text)',
                        border: forceStatutVal === s ? `0.5px solid ${statutColors(s).color}` : '0.5px solid var(--border)',
                        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                      {STATUT_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  display: 'block', marginBottom: 6,
                }}>Motif (obligatoire) *</label>
                <textarea value={forceMotif}
                  onChange={e => setForceMotif(e.target.value)}
                  placeholder="Ex: Exposant gracieux — invitation, compensation hors-système, abandon, etc."
                  rows={3} maxLength={300}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg2)', color: 'var(--text)',
                    border: '0.5px solid var(--border)', borderRadius: 6,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                    resize: 'vertical', minHeight: 70, lineHeight: 1.4,
                  }}/>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                  {forceMotif.length}/300 caractères — minimum 3.
                </div>
              </div>

              {forceErr && (
                <div style={{
                  padding: '8px 10px',
                  background: 'var(--red-light)', color: 'var(--red-dark)',
                  borderRadius: 6, fontSize: 11,
                }}>{forceErr}</div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 18px', borderTop: '0.5px solid var(--border)',
              display: 'flex', gap: 8,
            }}>
              <button onClick={() => setShowForceModal(false)} disabled={forceLoading}
                style={{
                  flex: 1, padding: '10px', background: 'transparent',
                  color: 'var(--text)', border: '0.5px solid var(--border)',
                  borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>Annuler</button>
              <button onClick={submitForce} disabled={forceLoading || forceMotif.trim().length < 3}
                style={{
                  flex: 1, padding: '10px',
                  background: (forceLoading || forceMotif.trim().length < 3) ? 'var(--bg2)' : 'var(--gold-dark)',
                  color: (forceLoading || forceMotif.trim().length < 3) ? 'var(--muted)' : '#fff',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: (forceLoading || forceMotif.trim().length < 3) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}>
                {forceLoading ? 'Application…' : 'Forcer le statut'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bloc PDF (Lot 4) */}
      <ExpoPDFButtons expo={expo} organisateur={organisateur}/>

      {/* Bloc historique décharges signées (Livraison signature) */}
      <DechargesHistory expo={expo} eventId={eventId}/>

      {/* Bloc Documents (Lot 3) */}
      <ExpoDocuments expo={expo} eventId={eventId}/>
    </div>
  )
}

// ─── Historique des décharges signées ─────────────────────────────
// Affiche la liste des décharges déjà signées pour l'exposant avec :
// téléchargement du PDF, visualisation des signatures, suppression (admin).
function DechargesHistory({ expo, eventId }) {
  const decharges = Array.isArray(expo?.decharges) ? expo.decharges : []
  if (decharges.length === 0) return null

  const [showSigs, setShowSigs] = useState(null) // id de la décharge dont les signatures sont visibles

  const handleDelete = async (dch) => {
    if (!confirm(`Supprimer cette décharge signée du ${new Date(dch.generatedAt).toLocaleDateString('fr-FR')} ?\n\nCette action est irréversible et supprime aussi le PDF stocké.`)) return
    try {
      const { deleteSignedDecharge } = await import('../../firebase/service')
      await deleteSignedDecharge(expo.id, dch.id, eventId)
    } catch (e) { alert(e.message) }
  }

  return (
    <div style={{
      background: 'var(--bg)',
      border: '0.5px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Check size={12} style={{ color: 'var(--green-dark)' }}/>
        Décharges signées ({decharges.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {decharges.slice().reverse().map(dch => {
          const dateLabel = (() => {
            try {
              const d = new Date(dch.generatedAt)
              return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            } catch { return '—' }
          })()
          const isOpen = showSigs === dch.id
          return (
            <div key={dch.id} style={{
              padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={14} style={{ color: 'var(--green-dark)', flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    Signée le {dateLabel}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {dch.signatureOrganisateur?.signedBy || '—'} ↔ {dch.signatureExposant?.signedBy || '—'}
                  </div>
                  {dch.documentHash && (
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1, fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Hash : {dch.documentHash.slice(0, 16)}…
                    </div>
                  )}
                </div>
                <button onClick={() => setShowSigs(isOpen ? null : dch.id)}
                  title={isOpen ? 'Cacher' : 'Voir signatures'}
                  style={{
                    width: 28, height: 28, padding: 0,
                    background: 'transparent', color: 'var(--brand-dark)',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Edit2 size={13}/>
                </button>
                {dch.pdfUrl && (
                  <a href={dch.pdfUrl} target="_blank" rel="noopener noreferrer"
                    title="Télécharger le PDF"
                    style={{
                      width: 28, height: 28, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: 'var(--brand-dark)', borderRadius: 4,
                      textDecoration: 'none',
                    }}>
                    <FileText size={13}/>
                  </a>
                )}
                <button onClick={() => handleDelete(dch)} title="Supprimer"
                  style={{
                    width: 28, height: 28, padding: 0,
                    background: 'transparent', color: 'var(--red-dark)',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Trash2 size={13}/>
                </button>
              </div>
              {isOpen && (
                <div style={{
                  marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Organisateur
                    </div>
                    {dch.signatureOrganisateur?.dataUrl ? (
                      <div style={{ background: '#fff', borderRadius: 4, padding: 4, border: '0.5px solid var(--border)' }}>
                        <img src={dch.signatureOrganisateur.dataUrl} alt="Signature org"
                          style={{ maxWidth: '100%', maxHeight: 60, display: 'block', margin: '0 auto' }}/>
                      </div>
                    ) : <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>Pas d'image</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Exposant
                    </div>
                    {dch.signatureExposant?.dataUrl ? (
                      <div style={{ background: '#fff', borderRadius: 4, padding: 4, border: '0.5px solid var(--border)' }}>
                        <img src={dch.signatureExposant.dataUrl} alt="Signature exposant"
                          style={{ maxWidth: '100%', maxHeight: 60, display: 'block', margin: '0 auto' }}/>
                      </div>
                    ) : <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>Pas d'image</div>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PaymentLine({ label, value, bold, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '0.5px solid var(--border)',
      fontSize: 12, color: muted ? 'var(--muted)' : 'var(--text)',
      fontWeight: bold ? 700 : 400,
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function PaymentRecord({ label, payment, color, onCancel, onEdit }) {
  const dateLabel = (() => {
    if (!payment?.date) return ''
    try {
      const d = new Date(payment.date)
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    } catch { return payment.date }
  })()
  // Indique si le paiement a été modifié manuellement (Étape 2 Lot statut)
  const wasEdited = !!payment?.updatedPaymentAt
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '0.5px solid var(--border)',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, minWidth: 0 }}>
        <Check size={11}/>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
          · {dateLabel} · {METHOD_LABEL[payment.method] || payment.method}
        </span>
        {wasEdited && (
          <span title={`Modifié manuellement le ${new Date(payment.updatedPaymentAt).toLocaleDateString('fr-FR')}`}
            style={{
              padding: '1px 4px', fontSize: 8, fontWeight: 700,
              background: 'var(--gold-light)', color: 'var(--gold-dark)',
              borderRadius: 3, letterSpacing: '0.04em',
            }}>
            MODIFIÉ
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color, fontWeight: 600, marginRight: 4 }}>
          {(payment.montant / 100).toFixed(2)} €
        </span>
        {onEdit && (
          <button onClick={onEdit} title="Modifier ce paiement"
            style={{
              background: 'transparent', border: 'none', padding: 2, cursor: 'pointer',
              color: 'var(--brand-dark)', display: 'flex',
            }}>
            <Edit2 size={11}/>
          </button>
        )}
        <button onClick={onCancel} title="Annuler ce paiement"
          style={{
            background: 'transparent', border: 'none', padding: 2, cursor: 'pointer',
            color: 'var(--red-dark)', display: 'flex',
          }}>
          <X size={12}/>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// VUE FORMULAIRE
// ═══════════════════════════════════════════════════════════════════════

function ExpoForm({ expo, thematiques, tvaConfig, eventId, onBack, onSaved }) {
  const isEdit = !!expo

  // ─── Type d'exposant + identité ───────────────────────────────────
  // typeExposant détermine quels champs sont visibles côté UI.
  // L'identité est un objet plat conservé tel quel (création/édition).
  const [typeExposant, setTypeExposant] = useState(expo?.typeExposant || 'particulier')
  const [identite, setIdentite]         = useState(() => {
    const def = defaultIdentite()
    return { ...def, ...(expo?.identite || {}) }
  })

  // Update partiel d'un champ d'identité (helper inline)
  const updId = (key, value) => setIdentite(prev => ({ ...prev, [key]: value }))

  // ─── Thématique ───────────────────────────────────────────────────
  const [thematiqueId, setThematiqueId] = useState(expo?.thematiqueId || (thematiques[0]?.id || ''))

  // ─── Lignes facturables (Livraison A) ─────────────────────────────
  // À l'édition, on charge les lignes existantes (avec rétrocompat via getExpoLignes).
  // À la création, on démarre avec 1 ligne pré-remplie par la thématique sélectionnée.
  const [lignes, setLignes] = useState(() => {
    if (isEdit) return getExpoLignes(expo)
    // Création : une ligne unique, sera mise à jour quand la thématique sera choisie
    return [newLigne('Frais d\'exposition', 1, 0)]
  })

  // Auto-remplir la première ligne quand on change de thématique (création seulement,
  // et seulement si l'utilisateur n'a pas encore édité la première ligne).
  React.useEffect(() => {
    if (isEdit) return
    const t = thematiques.find(x => x.id === thematiqueId)
    if (!t) return
    setLignes(prev => {
      if (prev.length === 0) return [newLigne(t.label, 1, t.tarif || 0)]
      // Si la première ligne n'a pas été modifiée par l'user, on l'update
      const first = prev[0]
      const looksLikeAutoFilled = !first.description || first.description === 'Frais d\'exposition'
      if (looksLikeAutoFilled || first.prixUnit === 0) {
        const updated = [...prev]
        updated[0] = { ...first, description: t.label, prixUnit: t.tarif || 0, total: (first.qty || 1) * (t.tarif || 0) }
        return updated
      }
      return prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thematiqueId])

  // ─── Acompte initial (création seulement) ─────────────────────────
  const [acompteEur, setAcompteEur]       = useState('')
  const [acompteMethod, setAcompteMethod] = useState('cash')

  // ─── Commentaires ─────────────────────────────────────────────────
  const [commentaires, setCommentaires] = useState(expo?.commentaires || '')

  // ─── Réductions globales (Lot C1+C2) ──────────────────────────────
  // Tableau de 0, 1 ou 2 réductions cumulables, chacune étant {type, value, label}.
  // Les valeurs sont stockées comme : value en % (0-100) si type='percent',
  // value en centimes si type='amount'. Pour l'UI, on garde un champ texte
  // intermédiaire `_valueDisplay` qui est ce que l'utilisateur tape.
  const [reductionsGlobales, setReductionsGlobales] = useState(() => {
    const r = expo?.reductionsGlobales
    if (Array.isArray(r)) return r.map(x => ({
      ...x,
      _valueDisplay: x.type === 'percent'
        ? String(x.value)
        : ((x.value || 0) / 100).toFixed(2),
    }))
    return []
  })

  // ─── État ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')

  // ─── Helpers lignes ───────────────────────────────────────────────
  // Recalcule le total NET d'une ligne en tenant compte de la réduction éventuelle.
  // La fonction prend l'objet ligne complet pour avoir accès à qty, prixUnit ET reduction.
  const computeLineNet = (ligne) => {
    const qty = Math.max(1, Math.round(Number(ligne.qty) || 1))
    const pu  = Math.round(Number(ligne.prixUnit) || 0)
    const brut = qty * pu
    const r = ligne.reduction
    if (!r || !r.type) return brut
    const v = Number(r.value) || 0
    if (v <= 0) return brut
    if (r.type === 'percent') return brut - Math.round((brut * Math.min(100, v)) / 100)
    if (r.type === 'amount')  return Math.max(0, brut - Math.min(v, brut))
    return brut
  }

  const updateLigne = (idx, key, value) => {
    setLignes(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const updated = { ...l, [key]: value }
      const qty = Math.max(1, Math.round(Number(updated.qty) || 1))
      const pu  = Math.round(Number(updated.prixUnit) || 0)
      const withNumbers = { ...updated, qty, prixUnit: pu }
      return { ...withNumbers, total: computeLineNet(withNumbers) }
    }))
  }

  // Mise à jour de la réduction d'une ligne. type='none' supprime la réduction.
  const updateLigneReduction = (idx, patch) => {
    setLignes(prev => prev.map((l, i) => {
      if (i !== idx) return l
      let newReduction = l.reduction || null
      if (patch.type === 'none') {
        newReduction = null
      } else if (patch.type !== undefined || patch.value !== undefined || patch._valueDisplay !== undefined) {
        const base = newReduction || { type: 'percent', value: 0 }
        newReduction = { ...base, ...patch }
      }
      const withReduction = { ...l, reduction: newReduction }
      return { ...withReduction, total: computeLineNet(withReduction) }
    }))
  }
  const addLigne = () => setLignes(prev => [...prev, newLigne('', 1, 0)])
  const removeLigne = (idx) => {
    if (lignes.length <= 1) { alert('Au moins une ligne doit rester.'); return }
    setLignes(prev => prev.filter((_, i) => i !== idx))
  }

  // ─── Helper TVA par ligne (Lot C3) ────────────────────────────────
  // Met à jour le taux de TVA d'une ligne. null = utiliser le taux par défaut.
  // Le total NET ligne reste en HT, la TVA est recalculée au rendu PDF.
  const updateLigneTva = (idx, tauxTva) => {
    setLignes(prev => prev.map((l, i) => {
      if (i !== idx) return l
      // tauxTva peut être null (= utiliser défaut) ou un nombre ≥ 0
      const safe = (tauxTva === null || tauxTva === '') ? null
        : Math.max(0, Number(tauxTva) || 0)
      return { ...l, tauxTva: safe }
    }))
  }

  // ─── Helpers réductions globales ──────────────────────────────────
  const addReductionGlobale = () => {
    if (reductionsGlobales.length >= 2) return
    setReductionsGlobales(prev => [...prev, {
      type: 'percent', value: 0, label: '', _valueDisplay: '',
    }])
  }
  const updateReductionGlobale = (idx, patch) => {
    setReductionsGlobales(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  const removeReductionGlobale = (idx) => {
    setReductionsGlobales(prev => prev.filter((_, i) => i !== idx))
  }

  // ─── Calculs live (sous-total, réductions, total) ────────────────
  // sousTotal = somme des lignes NETTES (après réductions ligne, déjà dans l.total)
  const sousTotalCalcule = lignes.reduce((a, l) => a + (Number(l.total) || 0), 0)

  // Application des réductions globales en cascade (cohérent avec backend)
  // On calcule aussi le montant déduit par chaque réduction pour affichage.
  const reductionsApplied = (() => {
    let base = sousTotalCalcule
    const applied = []
    for (const r of reductionsGlobales) {
      const v = Number(r.value) || 0
      if (v <= 0 || !r.type) { applied.push(0); continue }
      let deduit = 0
      if (r.type === 'percent') {
        deduit = Math.round((base * Math.min(100, v)) / 100)
      } else if (r.type === 'amount') {
        deduit = Math.min(v, base)
      }
      applied.push(deduit)
      base -= deduit
      if (base < 0) base = 0
    }
    return applied
  })()
  const totalReductionsGlobales = reductionsApplied.reduce((a, b) => a + b, 0)
  const totalCalcule = Math.max(0, sousTotalCalcule - totalReductionsGlobales)

  // ─── Calcul TVA live (Lot C3) ─────────────────────────────────────
  // Calcule la ventilation TVA pour l'affichage live dans le récap.
  // La TVA est calculée sur le HT après réductions globales (proportionnellement
  // par ligne). totalCalcule = totalHT. totalCalculeTTC = totalHT + tvaTotal.
  const tvaLive = (() => {
    if (!tvaConfig?.active) {
      return { totalTva: 0, totalTTC: totalCalcule, ventilation: {} }
    }
    // Ratio de réduction globale à appliquer à chaque ligne
    const ratio = sousTotalCalcule > 0 ? (totalCalcule / sousTotalCalcule) : 0
    const ventilation = {}
    let totalTva = 0
    for (const l of lignes) {
      const taux = (l.tauxTva == null) ? tvaConfig.defaultTaux : Number(l.tauxTva)
      if (taux <= 0) continue
      const baseHTLigne = Math.round((Number(l.total) || 0) * ratio)
      const tva = Math.round((baseHTLigne * taux) / 100)
      totalTva += tva
      const k = String(taux)
      if (!ventilation[k]) ventilation[k] = { baseHT: 0, montantTva: 0 }
      ventilation[k].baseHT += baseHTLigne
      ventilation[k].montantTva += tva
    }
    return { totalTva, totalTTC: totalCalcule + totalTva, ventilation }
  })()

  // ─── Nom d'affichage (calculé selon type + identité) ──────────────
  // On l'utilise pour le champ "nom" historique (compat + tri/recherche liste).
  const computedNom = (() => {
    if (typeExposant === 'entreprise' && identite.raisonSociale) {
      return identite.raisonSociale.trim()
    }
    const full = [identite.prenom, identite.nom].filter(Boolean).map(s => s.trim()).join(' ').trim()
    return full
  })()

  // ─── Validation et soumission ─────────────────────────────────────
  const submit = async () => {
    // Validation : nom obligatoire selon type
    if (typeExposant === 'entreprise') {
      if (!identite.raisonSociale || !identite.raisonSociale.trim()) {
        setErr('La raison sociale est requise pour une entreprise'); return
      }
    } else {
      if (!identite.prenom?.trim() && !identite.nom?.trim()) {
        setErr('Le nom (et/ou prénom) du particulier est requis'); return
      }
    }
    if (totalCalcule <= 0) { setErr('Le montant total doit être supérieur à 0'); return }
    // Au moins 1 ligne valide
    const lignesValides = lignes.filter(l => l.description?.trim() && (Number(l.prixUnit) || 0) > 0)
    if (lignesValides.length === 0) { setErr('Au moins une ligne avec description et prix est requise'); return }

    const thematiqueLabel = thematiques.find(t => t.id === thematiqueId)?.label || ''

    setLoading(true); setErr('')
    try {
      // Nettoyage des réductions globales avant envoi : retire les champs UI
      // (_valueDisplay) et écarte celles avec value <= 0.
      const cleanReductions = reductionsGlobales
        .filter(r => r.type && (Number(r.value) || 0) > 0)
        .slice(0, 2)
        .map(r => ({
          type: r.type,
          value: Number(r.value),
          label: (r.label || '').trim() || null,
        }))
      const payload = {
        nom: computedNom || 'Exposant',
        typeExposant,
        identite,
        thematiqueId, thematiqueLabel,
        lignes: lignesValides,
        reductionsGlobales: cleanReductions,
        commentaires,
      }
      if (isEdit) {
        await updateExposition(expo.id, payload, eventId)
        onSaved(expo.id)
      } else {
        const acompteCts = Math.round((parseFloat(acompteEur.replace(',', '.')) || 0) * 100)
        // Si TVA active, l'acompte est comparé au TTC (= ce que le client paie)
        const limiteAcompte = tvaConfig?.active ? tvaLive.totalTTC : totalCalcule
        if (acompteCts > limiteAcompte) { setErr('L\'acompte ne peut pas dépasser le total'); setLoading(false); return }
        const created = await createExposition({
          ...payload,
          acompteInitial: acompteCts,
          acompteMethod,
        }, eventId)
        onSaved(created.id)
      }
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 16px' }}>
      <button onClick={onBack}
        style={{
          background: 'transparent', border: '0.5px solid var(--border2)',
          padding: '6px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
          color: 'var(--text)', fontFamily: 'inherit', marginBottom: 10,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
        <ArrowLeft size={12}/> Retour
      </button>

      <div style={{
        background: 'var(--bg)', border: '0.5px solid var(--border)',
        borderRadius: 12, padding: '16px',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
          {isEdit ? 'Modifier l\'exposant' : 'Nouvel exposant'}
        </div>

        {thematiques.length === 0 && (
          <div style={{
            padding: '10px 12px', marginBottom: 12,
            background: 'var(--red-light)', color: 'var(--red-dark)',
            border: '0.5px solid var(--red)', borderRadius: 8, fontSize: 12,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
            <span>Aucune thématique configurée. Allez dans <strong>Paramètres</strong> pour en créer.</span>
          </div>
        )}

        {/* ─── Section 1 : type + identité ─────────────────────── */}
        <SectionTitle>Type d'exposant</SectionTitle>

        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg2)', borderRadius: 10, marginBottom: 14 }}>
          {TYPE_EXPOSANT.map(t => (
            <button key={t.id}
              onClick={() => setTypeExposant(t.id)}
              style={{
                flex: 1, padding: '9px 12px',
                background: typeExposant === t.id ? 'var(--bg)' : 'transparent',
                color: typeExposant === t.id ? 'var(--text)' : 'var(--muted)',
                fontWeight: typeExposant === t.id ? 700 : 500,
                border: 'none', borderRadius: 8,
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                boxShadow: typeExposant === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Champs identité conditionnels au type */}
        {typeExposant === 'entreprise' ? (
          <>
            <FormField label="Raison sociale *">
              <input type="text" value={identite.raisonSociale} onChange={e => updId('raisonSociale', e.target.value)}
                placeholder="Ex: Bijoux Sahel SARL" maxLength={120} style={INPUT_STYLE}/>
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <FormField label="SIRET">
                <input type="text" value={identite.siret} onChange={e => updId('siret', e.target.value)}
                  placeholder="123 456 789 00012" maxLength={20} style={INPUT_STYLE}/>
              </FormField>
              <FormField label="N° TVA">
                <input type="text" value={identite.tva} onChange={e => updId('tva', e.target.value)}
                  placeholder="FR12345678901" maxLength={20} style={INPUT_STYLE}/>
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <FormField label="RCS (ville)">
                <input type="text" value={identite.rcs} onChange={e => updId('rcs', e.target.value)}
                  placeholder="Paris B 123 456 789" maxLength={60} style={INPUT_STYLE}/>
              </FormField>
              <FormField label="Dirigeant / Contact">
                <input type="text" value={identite.dirigeant} onChange={e => updId('dirigeant', e.target.value)}
                  placeholder="Nom du dirigeant ou contact" maxLength={80} style={INPUT_STYLE}/>
              </FormField>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FormField label="Prénom">
              <input type="text" value={identite.prenom} onChange={e => updId('prenom', e.target.value)}
                placeholder="Ex: Marie" maxLength={60} style={INPUT_STYLE}/>
            </FormField>
            <FormField label="Nom">
              <input type="text" value={identite.nom} onChange={e => updId('nom', e.target.value)}
                placeholder="Ex: Dupont" maxLength={60} style={INPUT_STYLE}/>
            </FormField>
          </div>
        )}

        {/* Adresse + contact (communs aux 2 types) */}
        <FormField label="Adresse">
          <input type="text" value={identite.adresse} onChange={e => updId('adresse', e.target.value)}
            placeholder="N° et nom de rue" maxLength={120} style={INPUT_STYLE}/>
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
          <FormField label="CP">
            <input type="text" value={identite.codePostal} onChange={e => updId('codePostal', e.target.value)}
              placeholder="75000" maxLength={10} style={INPUT_STYLE}/>
          </FormField>
          <FormField label="Ville">
            <input type="text" value={identite.ville} onChange={e => updId('ville', e.target.value)}
              placeholder="Paris" maxLength={60} style={INPUT_STYLE}/>
          </FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <FormField label="Email">
            <input type="email" value={identite.email} onChange={e => updId('email', e.target.value)}
              placeholder="contact@exemple.com" maxLength={120} style={INPUT_STYLE}/>
          </FormField>
          <FormField label="Téléphone">
            <input type="tel" value={identite.telephone} onChange={e => updId('telephone', e.target.value)}
              placeholder="06 12 34 56 78" maxLength={30} style={INPUT_STYLE}/>
          </FormField>
        </div>

        {/* ─── Section 2 : thématique ──────────────────────────── */}
        <SectionTitle>Thématique d'exposition</SectionTitle>
        <FormField label="Thématique (optionnel)">
          <select value={thematiqueId} onChange={e => setThematiqueId(e.target.value)}
            disabled={thematiques.length === 0}
            style={INPUT_STYLE}>
            <option value="">— Aucune thématique —</option>
            {thematiques.map(t => (
              <option key={t.id} value={t.id}>
                {t.label} {t.tarif > 0 ? `— ${(t.tarif / 100).toFixed(2)} €` : ''}
              </option>
            ))}
          </select>
        </FormField>

        {/* ─── Section 3 : lignes facturables ──────────────────── */}
        <SectionTitle>Lignes facturables</SectionTitle>
        <div style={{
          background: 'var(--bg2)', borderRadius: 8, padding: '10px',
          marginBottom: 10,
        }}>
          {/* En-tête colonnes (desktop only) */}
          <div className="yc-lignes-header"
            style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 32px',
              gap: 6, marginBottom: 6,
              fontSize: 10, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
            <div>Description</div>
            <div style={{ textAlign: 'center' }}>Qté</div>
            <div style={{ textAlign: 'right' }}>P.U. (€)</div>
            <div style={{ textAlign: 'right' }}>Total (€)</div>
            <div></div>
          </div>

          {lignes.map((l, i) => {
            const brut = (Number(l.qty) || 0) * (Number(l.prixUnit) || 0)
            const net = Number(l.total) || brut
            const hasReduction = !!(l.reduction && (Number(l.reduction.value) || 0) > 0)
            return (
              <div key={l.id} style={{
                background: hasReduction ? 'var(--bg)' : 'transparent',
                borderRadius: hasReduction ? 6 : 0,
                padding: hasReduction ? 6 : 0,
                marginBottom: 6,
              }}>
                {/* Ligne principale */}
                <div className="yc-ligne-row" style={{
                  display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 32px',
                  gap: 6, alignItems: 'center',
                }}>
                  <input type="text" value={l.description}
                    onChange={e => updateLigne(i, 'description', e.target.value)}
                    placeholder="Description"
                    style={{ ...LINE_INPUT, minWidth: 0 }}/>
                  <input type="number" min="1" value={l.qty}
                    onChange={e => updateLigne(i, 'qty', e.target.value)}
                    style={{ ...LINE_INPUT, textAlign: 'center' }}/>
                  <input type="text" inputMode="decimal"
                    value={(l._prixEur != null) ? l._prixEur : ((l.prixUnit || 0) / 100).toFixed(2)}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9.,]/g, '')
                      setLignes(prev => prev.map((x, idx) => idx === i ? { ...x, _prixEur: v } : x))
                      const cts = Math.round((parseFloat(v.replace(',', '.')) || 0) * 100)
                      updateLigne(i, 'prixUnit', cts)
                    }}
                    placeholder="0.00"
                    style={{ ...LINE_INPUT, textAlign: 'right' }}/>
                  <div style={{
                    textAlign: 'right', fontSize: 12, fontWeight: 600,
                    color: hasReduction ? 'var(--brand-dark)' : 'var(--text)',
                    padding: '8px 4px',
                  }}>
                    {(net / 100).toFixed(2)}
                  </div>
                  <button onClick={() => removeLigne(i)}
                    disabled={lignes.length <= 1}
                    title="Supprimer cette ligne"
                    style={{
                      width: 32, height: 32, padding: 0,
                      background: 'transparent',
                      color: lignes.length <= 1 ? 'var(--muted)' : 'var(--red-dark)',
                      border: 'none', borderRadius: 4,
                      cursor: lignes.length <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Trash2 size={13}/>
                  </button>
                </div>

                {/* Sous-ligne réduction (Lot C1+C2) — affichée si une réduction existe,
                    masquée sinon mais accessible via le bouton "+ Réduction" */}
                {hasReduction ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 6, paddingTop: 6, borderTop: '0.5px dashed var(--border)',
                    fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--muted)', fontSize: 10, flexShrink: 0 }}>
                      Réduction :
                    </span>
                    {/* Toggle type */}
                    <select value={l.reduction.type}
                      onChange={e => updateLigneReduction(i, { type: e.target.value })}
                      style={{ ...LINE_INPUT, width: 50, fontSize: 11, padding: '4px 4px' }}>
                      <option value="percent">%</option>
                      <option value="amount">€</option>
                    </select>
                    {/* Valeur */}
                    <input type="text" inputMode="decimal"
                      value={l.reduction._valueDisplay != null
                        ? l.reduction._valueDisplay
                        : (l.reduction.type === 'percent'
                            ? String(l.reduction.value)
                            : ((l.reduction.value || 0) / 100).toFixed(2))}
                      onChange={e => {
                        const txt = e.target.value.replace(/[^0-9.,]/g, '')
                        const numeric = parseFloat(txt.replace(',', '.')) || 0
                        const newValue = l.reduction.type === 'percent'
                          ? Math.min(100, numeric)
                          : Math.round(numeric * 100)
                        updateLigneReduction(i, { value: newValue, _valueDisplay: txt })
                      }}
                      placeholder={l.reduction.type === 'percent' ? '0' : '0.00'}
                      style={{ ...LINE_INPUT, width: 60, fontSize: 11, textAlign: 'right' }}/>
                    {/* Libellé (optionnel) */}
                    <input type="text"
                      value={l.reduction.label || ''}
                      onChange={e => updateLigneReduction(i, { label: e.target.value })}
                      placeholder="Libellé (ex: remise)"
                      maxLength={40}
                      style={{ ...LINE_INPUT, flex: 1, fontSize: 11 }}/>
                    {/* Montant déduit live */}
                    <span style={{ color: 'var(--brand-dark)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      -{((brut - net) / 100).toFixed(2)} €
                    </span>
                    <button onClick={() => updateLigneReduction(i, { type: 'none' })}
                      title="Retirer la réduction"
                      style={{
                        width: 24, height: 24, padding: 0,
                        background: 'transparent', color: 'var(--muted)',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                      <X size={12}/>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => updateLigneReduction(i, { type: 'percent', value: 0, _valueDisplay: '' })}
                    style={{
                      marginTop: 4, padding: '2px 6px',
                      background: 'transparent', color: 'var(--muted)',
                      border: 'none', cursor: 'pointer', fontSize: 10,
                      fontFamily: 'inherit', textDecoration: 'underline dotted',
                    }}>
                    + Ajouter une réduction
                  </button>
                )}

                {/* Sous-ligne TVA (Lot C3) — visible seulement si la TVA est activée
                    au niveau événement. Permet d'override le taux par défaut. */}
                {tvaConfig?.active && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 4, fontSize: 10, color: 'var(--muted)',
                  }}>
                    <span style={{ flexShrink: 0 }}>TVA :</span>
                    <input type="number" step="0.1" min="0" max="100"
                      value={l.tauxTva ?? ''}
                      onChange={e => updateLigneTva(i, e.target.value)}
                      placeholder={String(tvaConfig.defaultTaux)}
                      style={{
                        width: 60, padding: '3px 6px', fontSize: 11,
                        background: 'var(--bg)', color: 'var(--text)',
                        border: '0.5px solid var(--border)', borderRadius: 4,
                        outline: 'none', fontFamily: 'inherit',
                      }}/>
                    <span style={{ flexShrink: 0 }}>%</span>
                    {l.tauxTva == null ? (
                      <span style={{ fontStyle: 'italic', flex: 1 }}>
                        (taux par défaut : {tvaConfig.defaultTaux}%)
                      </span>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontWeight: 600, color: 'var(--text)' }}>
                          = {((net * (Number(l.tauxTva) || 0) / 100) / 100).toFixed(2)} €
                        </span>
                        <button onClick={() => updateLigneTva(i, null)}
                          title="Revenir au taux par défaut"
                          style={{
                            padding: '2px 6px',
                            background: 'transparent', color: 'var(--muted)',
                            border: 'none', cursor: 'pointer', fontSize: 10,
                            textDecoration: 'underline dotted',
                            fontFamily: 'inherit',
                          }}>
                          réinitialiser
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={addLigne}
            style={{
              marginTop: 4, width: '100%',
              padding: '8px', background: 'transparent',
              color: 'var(--brand-dark)', border: '0.5px dashed var(--border2)',
              borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <Plus size={13}/> Ajouter une ligne
          </button>

          {/* Sous-total (avant réductions globales) */}
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sous-total
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {(sousTotalCalcule / 100).toFixed(2)} €
            </span>
          </div>

          {/* Réductions globales (Lot C1+C2) */}
          {reductionsGlobales.map((r, i) => (
            <div key={i} style={{
              marginTop: 6, padding: 8, background: 'var(--bg)', borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
            }}>
              <span style={{ color: 'var(--muted)', fontSize: 10, flexShrink: 0 }}>
                Réduction globale #{i+1} :
              </span>
              <select value={r.type}
                onChange={e => updateReductionGlobale(i, { type: e.target.value, _valueDisplay: '' })}
                style={{ ...LINE_INPUT, width: 50, fontSize: 11, padding: '4px 4px' }}>
                <option value="percent">%</option>
                <option value="amount">€</option>
              </select>
              <input type="text" inputMode="decimal"
                value={r._valueDisplay != null
                  ? r._valueDisplay
                  : (r.type === 'percent' ? String(r.value) : ((r.value || 0) / 100).toFixed(2))}
                onChange={e => {
                  const txt = e.target.value.replace(/[^0-9.,]/g, '')
                  const numeric = parseFloat(txt.replace(',', '.')) || 0
                  const newValue = r.type === 'percent'
                    ? Math.min(100, numeric)
                    : Math.round(numeric * 100)
                  updateReductionGlobale(i, { value: newValue, _valueDisplay: txt })
                }}
                placeholder={r.type === 'percent' ? '0' : '0.00'}
                style={{ ...LINE_INPUT, width: 60, fontSize: 11, textAlign: 'right' }}/>
              <input type="text"
                value={r.label || ''}
                onChange={e => updateReductionGlobale(i, { label: e.target.value })}
                placeholder="Libellé (ex: remise fidélité)"
                maxLength={40}
                style={{ ...LINE_INPUT, flex: 1, fontSize: 11 }}/>
              <span style={{ color: 'var(--brand-dark)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                -{((reductionsApplied[i] || 0) / 100).toFixed(2)} €
              </span>
              <button onClick={() => removeReductionGlobale(i)}
                title="Retirer cette réduction"
                style={{
                  width: 24, height: 24, padding: 0,
                  background: 'transparent', color: 'var(--red-dark)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                <X size={12}/>
              </button>
            </div>
          ))}
          {reductionsGlobales.length < 2 && (
            <button onClick={addReductionGlobale}
              style={{
                marginTop: 6, padding: '6px 10px',
                background: 'transparent', color: 'var(--brand-dark)',
                border: '0.5px dashed var(--border2)', borderRadius: 6,
                fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <Plus size={11}/> Ajouter une réduction globale ({reductionsGlobales.length}/2)
            </button>
          )}

          {/* Total final */}
          {tvaConfig?.active ? (
            // Mode TVA actif : afficher HT → ventilation TVA → TTC
            <>
              <div style={{
                marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                  Total HT
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {(totalCalcule / 100).toFixed(2)} €
                </span>
              </div>
              {Object.entries(tvaLive.ventilation).map(([taux, v]) => (
                <div key={taux} style={{
                  marginTop: 4,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 11, color: 'var(--muted)',
                }}>
                  <span>TVA {taux}% sur {(v.baseHT / 100).toFixed(2)} €</span>
                  <span style={{ fontWeight: 600 }}>+ {(v.montantTva / 100).toFixed(2)} €</span>
                </div>
              ))}
              <div style={{
                marginTop: 6, paddingTop: 6, borderTop: '0.5px dashed var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total TTC
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                  {(tvaLive.totalTTC / 100).toFixed(2)} €
                </span>
              </div>
              <div style={{
                marginTop: 4, fontSize: 10, color: 'var(--muted)', fontStyle: 'italic',
                textAlign: 'right',
              }}>
                Le montant facturé final est le TTC.
              </div>
            </>
          ) : (
            // Mode sans TVA : affichage simple total
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                {(totalCalcule / 100).toFixed(2)} €
              </span>
            </div>
          )}
        </div>

        {/* ─── Section 4 : acompte initial (création) ──────────── */}
        {!isEdit && (
          <>
            <SectionTitle>Acompte à la création (optionnel)</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <FormField label="Montant acompte (€)">
                <input type="text" inputMode="decimal" value={acompteEur}
                  onChange={e => setAcompteEur(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="0.00 (optionnel)" style={INPUT_STYLE}/>
              </FormField>
              {parseFloat(acompteEur.replace(',', '.')) > 0 && (
                <FormField label="Mode de paiement">
                  <select value={acompteMethod} onChange={e => setAcompteMethod(e.target.value)} style={INPUT_STYLE}>
                    {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </FormField>
              )}
            </div>
          </>
        )}

        {/* ─── Section 5 : commentaires ────────────────────────── */}
        <SectionTitle>Commentaires</SectionTitle>
        <FormField label="Notes / exceptions">
          <textarea value={commentaires} onChange={e => setCommentaires(e.target.value)}
            placeholder="Ex: réduction de 10% accordée, conditions particulières…"
            maxLength={500} rows={3}
            style={{ ...INPUT_STYLE, fontFamily: 'inherit', resize: 'vertical', minHeight: 60 }}/>
        </FormField>

        {err && (
          <div style={{
            padding: '10px 12px', marginBottom: 10,
            background: 'var(--red-light)', color: 'var(--red-dark)',
            borderRadius: 8, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={14}/> {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onBack} disabled={loading}
            style={{
              flex: 1, padding: '11px', background: 'transparent',
              color: 'var(--text)', border: '0.5px solid var(--border)',
              borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>Annuler</button>
          <button onClick={submit} disabled={loading}
            style={{
              flex: 1, padding: '11px',
              background: loading ? 'var(--bg2)' : 'var(--brand)',
              color: loading ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>{loading ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      marginTop: 8, marginBottom: 8,
      paddingTop: 10, borderTop: '0.5px solid var(--border)',
    }}>
      {children}
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        fontSize: 11, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        display: 'block', marginBottom: 4, fontWeight: 600,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const INPUT_STYLE = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  background: 'var(--bg2)', color: 'var(--text)',
  border: '0.5px solid var(--border)', borderRadius: 8,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

const LINE_INPUT = {
  width: '100%', padding: '7px 8px', fontSize: 12,
  background: 'var(--bg)', color: 'var(--text)',
  border: '0.5px solid var(--border)', borderRadius: 4,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
