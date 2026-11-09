/**
 * pages/admin/Cachets.jsx — v8 debug
 *
 * Page principale de gestion des cachets artistes.
 * Liste + stats + filtres + recherche + actions.
 *
 * Accessible aux rôles : admin, super_admin
 * Catégorie sidebar : Argent & opérations
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Search, Download, Edit2, Trash2, Banknote, CreditCard, FileText, X, AlertCircle, CheckCircle, Filter, Upload, Paperclip } from 'lucide-react'
import {
  watchCachets, watchPlanning,
  addCachet, updateCachet, deleteCachet,
  marquerCachetPaye, annulerCachet,
  uploadCachetDocument, deleteCachetDocument,
} from '../../firebase/service'
import useAuthStore from '../../store/useAuthStore'
import useEventStore from '../../store/useEventStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import DechargeModal from '../../components/DechargeModal'
import { PrevuVsReelChart, ModePaiementDonut, TopArtistesChart } from '../../components/CachetsCharts'
import { APP_VERSION_LABEL } from '../../utils/buildInfo'

// Configuration modes de paiement
const MODES = {
  especes:  { label: 'Espèces', icon: '💵', color: '#D89030', bg: 'rgba(216,144,48,0.12)' },
  virement: { label: 'Virement', icon: '🏦', color: '#009090', bg: 'rgba(0,144,144,0.10)' },
  cheque:   { label: 'Chèque', icon: '📝', color: 'var(--marine)', bg: 'rgba(0,48,72,0.10)' },
}

const TYPES = {
  cachet:  'Cachet complet',
  acompte: 'Acompte',
  solde:   'Solde',
  frais:   'Remb. de frais',
}

function fmtDate(date) {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtHour(date) {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function initialsOf(name) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Cachets() {
  const { user } = useAuthStore()
  const { events, currentEventId } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId && !e.deleted)
  const { isMobile } = useBreakpoint()

  const [cachets, setCachets]   = useState([])
  const [planning, setPlanning] = useState([])
  const [loading, setLoading]   = useState(true)

  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState('all') // all|planifie|paye|annule
  const [filterMode, setFilterMode]     = useState('all') // all|especes|virement|cheque
  const [showCharts, setShowCharts]     = useState(!isMobile) // graphiques affichés par défaut sur desktop

  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState(null)
  const [showDecharge, setShowDecharge] = useState(null) // cachet en cours de signature
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')

  // Charge cachets + planning
  useEffect(() => {
    const unsub1 = watchCachets(list => { setCachets(list); setLoading(false) })
    const unsub2 = watchPlanning(list => setPlanning(list))
    return () => { unsub1(); unsub2() }
  }, [])

  // Filtrage
  const filtered = useMemo(() => {
    return cachets
      .filter(c => filterStatut === 'all' || c.statut === filterStatut)
      .filter(c => filterMode === 'all' || c.modePaiement === filterMode)
      .filter(c => !search || (c.artiste || '').toLowerCase().includes(search.toLowerCase()))
  }, [cachets, search, filterStatut, filterMode])

  // Stats globales
  const stats = useMemo(() => {
    const actifs = cachets.filter(c => c.statut !== 'annule')
    const totalPrevu = actifs.reduce((s, c) => s + (Number(c.montant) || 0), 0)
    const totalPaye  = actifs.filter(c => c.statut === 'paye').reduce((s, c) => s + (Number(c.montant) || 0), 0)
    const totalAPayer = totalPrevu - totalPaye
    return {
      totalPrevu, totalPaye, totalAPayer,
      count: actifs.length,
      countPaye:    actifs.filter(c => c.statut === 'paye').length,
      countPlanifie: actifs.filter(c => c.statut === 'planifie').length,
    }
  }, [cachets])

  const openNew = () => { setEditing(null); setShowForm(true); setErr('') }
  const openEdit = (c) => { setEditing(c); setShowForm(true); setErr('') }

  // ─── Export XLSX (style identique aux autres exports) ───────────────────
  // Appelle l'endpoint serveur /api/cachets qui génère un fichier stylé via
  // ExcelJS. En cas d'échec serveur, fallback CSV pour ne pas perdre l'accès
  // aux données.
  const [exporting, setExporting] = useState(false)

  const buildExportPayload = () => {
    // KPIs
    const totalPrevu  = cachets.filter(c => c.statut !== 'annule').reduce((s,c) => s + (Number(c.montant) || 0), 0)
    const totalPaye   = cachets.filter(c => c.statut === 'paye').reduce((s,c) => s + (Number(c.montant) || 0), 0)
    const totalAPayer = cachets.filter(c => c.statut === 'planifie').reduce((s,c) => s + (Number(c.montant) || 0), 0)
    const nbSignes    = cachets.filter(c => c.signedAt).length

    // Enrichir chaque cachet avec son créneau (pour le serveur)
    const enrichedCachets = cachets.map(c => {
      const cr = planning.find(p => p.id === c.creneauId)
      // Sérialiser les dates Firestore en ISO string pour le transport
      const toISO = (d) => {
        if (!d) return null
        if (d.toDate) return d.toDate().toISOString()
        if (d instanceof Date) return d.toISOString()
        return d
      }
      return {
        numeroDecharge: c.numeroDecharge || '',
        artiste:        c.artiste || '',
        createdAt:      toISO(c.createdAt),
        type:           c.type || '',
        montant:        Number(c.montant) || 0,
        modePaiement:   c.modePaiement || '',
        statut:         c.statut || '',
        reference:      c.reference || '',
        signedAt:       toISO(c.signedAt),
        signedNom:      c.signedNom || '',
        notes:          c.notes || '',
        creneau:        cr ? {
          debut: toISO(cr.debut),
          scene: cr.scene || '',
        } : null,
      }
    })

    return {
      event:      { nom: currentEvent?.nom || 'Événement', couleur: currentEvent?.couleur || '#1a6b7a' },
      appVersion: APP_VERSION_LABEL,
      cachets:    enrichedCachets,
      kpis:       { totalPrevu, totalPaye, totalAPayer, nbCachets: cachets.length, nbSignes },
    }
  }

  // Fallback CSV — utilisé si l'endpoint serveur échoue. Pas de styles,
  // mais l'utilisateur récupère ses données.
  const fallbackCSV = () => {
    const cols = ['Date création','Numéro décharge','Artiste','Créneau','Type','Montant','Mode','Statut','Référence','Date signature','Signé par','Notes']
    const rows = cachets.map(c => {
      const cr = planning.find(p => p.id === c.creneauId)
      return [
        fmtDate(c.createdAt),
        c.numeroDecharge || '',
        c.artiste || '',
        cr ? `${fmtDate(cr.debut)} ${fmtHour(cr.debut)} - ${cr.scene || ''}` : '',
        TYPES[c.type] || c.type || '',
        (Number(c.montant) || 0).toFixed(2),
        MODES[c.modePaiement]?.label || c.modePaiement || '',
        c.statut === 'paye' ? 'Payé' : c.statut === 'planifie' ? 'À payer' : 'Annulé',
        c.reference || '',
        c.signedAt ? fmtDate(c.signedAt) : '',
        c.signedNom || '',
        (c.notes || '').replace(/[\r\n]+/g, ' '),
      ]
    })
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cachets-${currentEvent?.nom?.replace(/\s+/g, '_') || 'event'}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    if (cachets.length === 0) {
      setErr('Aucun cachet à exporter')
      setTimeout(() => setErr(''), 2500)
      return
    }
    try {
      setExporting(true)
      const payload = buildExportPayload()
      const resp = await fetch('/api/cachets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!resp.ok) {
        console.warn(`Endpoint cachets KO (${resp.status}). Fallback CSV.`)
        fallbackCSV()
        setSuccess('Export CSV téléchargé (fallback)')
      } else {
        const blob = await resp.blob()
        const d = new Date()
        const jj = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const aaaa = d.getFullYear()
        const filename = `${currentEvent?.nom || 'Événement'} - Cachets - ${jj}_${mm}_${aaaa}.xlsx`
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        setSuccess('Export XLSX téléchargé')
      }
    } catch(e) {
      console.error('Export cachets:', e)
      // Tentative fallback CSV en dernier recours
      try {
        fallbackCSV()
        setSuccess('Export CSV téléchargé (fallback)')
      } catch {
        setErr('Échec de l\'export : ' + e.message)
      }
    }
    setExporting(false)
    setTimeout(() => { setSuccess(''); setErr('') }, 2500)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Chargement des cachets…</div>
  }

  return (
    <div style={{ padding: '16px 12px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Bandeaux feedback */}
      {success && (
        <div style={{
          marginBottom: 12, padding: '10px 14px',
          background: 'var(--green-light)', borderLeft: '4px solid var(--green)',
          borderRadius: '0 8px 8px 0', fontSize: 13, color: 'var(--green)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={16}/> {success}
        </div>
      )}
      {err && (
        <div style={{
          marginBottom: 12, padding: '10px 14px',
          background: 'var(--red-light)', borderLeft: '4px solid var(--red)',
          borderRadius: '0 8px 8px 0', fontSize: 13, color: 'var(--red)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16}/> {err}
          </span>
          <button onClick={() => setErr('')} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
            <X size={14}/>
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: 'var(--marine)', margin: 0 }}>
          💰 Cachets artistes
        </h1>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {currentEvent?.nom || 'Aucun événement'}
        </div>
      </div>

      {/* Boutons d'action — full width sur mobile, en ligne sur desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto',
        gap: 8, marginBottom: 16,
      }}>
        {!isMobile && <div/>}
        <button onClick={handleExport} disabled={exporting}
          style={{
            padding: '12px 14px', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: 'var(--marine)',
            cursor: exporting ? 'wait' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 44, opacity: exporting ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <Download size={16}/> {exporting ? 'Export…' : 'Export XLSX'}
        </button>
        <button onClick={openNew}
          style={{
            padding: '12px 16px', background: 'var(--brand)',
            border: 'none', borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 44,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <Plus size={18}/> Nouveau cachet
        </button>
      </div>

      {/* Stats : 2 colonnes sur mobile, 4 sur desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 8, marginBottom: 16,
      }}>
        <StatCard label="Total prévu" value={`${stats.totalPrevu.toFixed(2)} €`} color="var(--marine)" isMobile={isMobile}/>
        <StatCard label="Déjà payé" value={`${stats.totalPaye.toFixed(2)} €`} color="var(--green)" isMobile={isMobile}/>
        <StatCard label="À payer" value={`${stats.totalAPayer.toFixed(2)} €`} color="var(--gold)" isMobile={isMobile}/>
        <StatCard label="Nb cachets" value={stats.count} sub={`${stats.countPaye} payés · ${stats.countPlanifie} à payer`} isMobile={isMobile}/>
      </div>

      {/* Zone graphiques — toggleable sur mobile pour ne pas surcharger */}
      {cachets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setShowCharts(s => !s)}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 12, fontWeight: 700,
              color: 'var(--marine)', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: showCharts ? 12 : 0,
              minHeight: 40,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <span>📊 Aperçu graphique</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {showCharts ? '▲ Masquer' : '▼ Afficher'}
            </span>
          </button>

          {showCharts && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 12,
            }}>
              <PrevuVsReelChart cachets={cachets} isMobile={isMobile}/>
              <ModePaiementDonut cachets={cachets} isMobile={isMobile}/>
              <TopArtistesChart cachets={cachets} isMobile={isMobile}/>
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div style={{
        background: 'var(--bg)', borderRadius: 10, padding: 12,
        border: '1px solid var(--border)', marginBottom: 12,
      }}>
        {/* Recherche : toujours pleine largeur en haut */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un artiste…"
            style={{
              width: '100%', minWidth: 0, maxWidth: '100%',
              padding: '10px 12px 10px 36px', minHeight: 40,
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg2)',
              boxSizing: 'border-box',
            }}/>
        </div>

        {/* Chips de filtres : scrollables horizontalement sur mobile */}
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: isMobile ? 'auto' : 'visible',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          paddingBottom: isMobile ? 4 : 0,
          WebkitOverflowScrolling: 'touch',
        }}>
          <FilterChip active={filterStatut === 'all'} onClick={() => setFilterStatut('all')}>Tous</FilterChip>
          <FilterChip active={filterStatut === 'planifie'} onClick={() => setFilterStatut('planifie')}>À payer</FilterChip>
          <FilterChip active={filterStatut === 'paye'} onClick={() => setFilterStatut('paye')}>Payés</FilterChip>
          <div style={{ width: 1, minWidth: 1, height: 22, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }}/>
          <FilterChip active={filterMode === 'all'} onClick={() => setFilterMode('all')}>Tous modes</FilterChip>
          <FilterChip active={filterMode === 'especes'} onClick={() => setFilterMode('especes')}>💵 Espèces</FilterChip>
          <FilterChip active={filterMode === 'virement'} onClick={() => setFilterMode('virement')}>🏦 Virement</FilterChip>
          <FilterChip active={filterMode === 'cheque'} onClick={() => setFilterMode('cheque')}>📝 Chèque</FilterChip>
        </div>
      </div>

      {/* Liste */}
      <div style={{ background: 'var(--bg)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            {cachets.length === 0 ? 'Aucun cachet enregistré pour le moment.' : 'Aucun cachet ne correspond aux filtres.'}
          </div>
        ) : (
          filtered.map(c => {
            const cr = planning.find(p => p.id === c.creneauId)
            return <CachetRow key={c.id} cachet={c} creneau={cr} isMobile={isMobile}
              onEdit={() => openEdit(c)}
              onDelete={() => setConfirmDelete(c)}
              onPay={async () => {
                try {
                  if (c.modePaiement === 'especes') {
                    setShowDecharge(c)
                  } else {
                    await marquerCachetPaye(c.id)
                    setSuccess('Cachet marqué comme payé')
                    setTimeout(() => setSuccess(''), 2500)
                  }
                } catch (e) { setErr(e.message) }
              }}
              onShowDecharge={() => setShowDecharge(c)}
            />
          })
        )}
      </div>

      {/* Modale formulaire */}
      {showForm && (
        <CachetForm
          cachet={editing}
          planning={planning}
          existingCachets={cachets}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => {
            setSuccess(editing ? 'Cachet mis à jour' : 'Cachet ajouté')
            setTimeout(() => setSuccess(''), 2500)
            setShowForm(false); setEditing(null)
          }}
          onError={(msg) => setErr(msg)}
        />
      )}

      {/* Modale décharge */}
      {showDecharge && (() => {
        // Toujours utiliser la version la plus à jour du cachet (via la liste temps réel)
        // pour que le numéro de décharge généré côté serveur s'affiche dès qu'il est dispo.
        const latestCachet = cachets.find(c => c.id === showDecharge.id) || showDecharge
        return (
          <DechargeModal
            cachet={latestCachet}
            creneau={planning.find(p => p.id === latestCachet.creneauId)}
            event={currentEvent}
            onClose={() => setShowDecharge(null)}
            onSigned={() => {
              setSuccess('Décharge signée et cachet payé')
              setTimeout(() => setSuccess(''), 2500)
            }}
          />
        )
      })()}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,24,36,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg)', borderRadius: 14, padding: 20, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red)', marginBottom: 8 }}>
              Supprimer ce cachet ?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              <strong>{confirmDelete.artiste}</strong> · {(Number(confirmDelete.montant) || 0).toFixed(2)} €
              <br/>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {confirmDelete.statut === 'paye'
                  ? '⚠️ Ce cachet est déjà payé. La transaction caisse associée restera mais sera marquée annulée.'
                  : 'Cette action est irréversible.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--marine)' }}>
                Annuler
              </button>
              <button onClick={async () => {
                try {
                  if (confirmDelete.statut === 'paye') {
                    await annulerCachet(confirmDelete.id)
                  } else {
                    await deleteCachet(confirmDelete.id)
                  }
                  setSuccess('Cachet supprimé')
                  setTimeout(() => setSuccess(''), 2500)
                  setConfirmDelete(null)
                } catch (e) { setErr(e.message) }
              }}
                style={{ flex: 1, padding: 10, background: 'var(--red)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color = 'var(--marine)', isMobile }) {
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 10, padding: isMobile ? '10px 12px' : '12px 14px',
      border: '1px solid var(--border)', minWidth: 0,
    }}>
      <div style={{ fontSize: isMobile ? 9 : 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: isMobile ? 9 : 10, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 18,
        // var(--brand) au lieu de var(--marine) : teal qui reste contrasté
        // contre du blanc (#fff) en clair ET en sombre. Avec --marine on avait
        // un blanc-sur-blanc invisible en mode sombre.
        background: active ? 'var(--brand)' : 'var(--bg2)',
        border: '1px solid ' + (active ? 'var(--brand)' : 'var(--border)'),
        fontSize: 12, fontWeight: 600,
        color: active ? '#fff' : 'var(--muted)',
        cursor: 'pointer', fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        flexShrink: 0, minHeight: 36,
        WebkitTapHighlightColor: 'transparent',
      }}>
      {children}
    </button>
  )
}

function CachetRow({ cachet, creneau, isMobile, onEdit, onDelete, onPay, onShowDecharge }) {
  const mode = MODES[cachet.modePaiement] || MODES.especes
  const isPaye = cachet.statut === 'paye'
  const isAnnule = cachet.statut === 'annule'

  // Tailles boutons mobile (norme HIG 44px) vs desktop
  const btnSz = isMobile ? 44 : 32
  const btnIc = isMobile ? 18 : 13
  const btnPayPad = isMobile ? '10px 14px' : '6px 10px'
  const btnPayFs = isMobile ? 13 : 11

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? 8 : 12,
      padding: isMobile ? 12 : '12px 14px',
      borderBottom: '1px solid var(--border)',
      alignItems: isMobile ? 'stretch' : 'center',
      opacity: isAnnule ? 0.5 : 1,
    }}>
      {/* Ligne 1 mobile : Artiste + montant */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--brand-light)', color: 'var(--brand-dark)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 12, flexShrink: 0,
        }}>{initialsOf(cachet.artiste)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--marine)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cachet.artiste || 'Sans nom'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {creneau
              ? `${fmtDate(creneau.debut)} · ${fmtHour(creneau.debut)} · ${creneau.scene || '—'}`
              : (cachet.creneauId
                  // Cas où creneauId existe mais le créneau a été supprimé
                  ? 'Créneau introuvable'
                  // Cas légitime : cachet saisi manuellement hors planning
                  : (cachet.dateManuelle
                      ? `${fmtDate(cachet.dateManuelle)} · Hors planning`
                      : 'Hors planning'))}
            {' · '}{TYPES[cachet.type] || cachet.type}
          </div>
        </div>
        {/* Montant — sur la même ligne que l'artiste */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Indicateur "preuves jointes" si au moins 1 document */}
          {Array.isArray(cachet.documents) && cachet.documents.length > 0 && (
            <span title={`${cachet.documents.length} preuve(s) de paiement`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: '2px 5px', background: 'var(--bg2)',
                color: 'var(--brand-dark)', borderRadius: 3,
                fontSize: 9, fontWeight: 600,
              }}>
              <Paperclip size={9}/> {cachet.documents.length}
            </span>
          )}
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--marine)' }}>
            {(Number(cachet.montant) || 0).toFixed(2)} €
          </div>
        </div>
      </div>

      {/* Ligne 2 mobile : Badges + Actions */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: isMobile ? 8 : 12,
        justifyContent: isMobile ? 'space-between' : 'flex-start',
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 6,
            background: mode.bg, color: mode.color,
            whiteSpace: 'nowrap',
          }}>
            {mode.icon} {mode.label}
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 6,
            background: isPaye ? 'var(--green-light)' : isAnnule ? '#f5f5f5' : 'var(--gold-light)',
            color:      isPaye ? 'var(--green)'      : isAnnule ? 'var(--muted)' : 'var(--gold)',
            whiteSpace: 'nowrap',
          }}>
            {isPaye ? '✓ Payé' : isAnnule ? 'Annulé' : '⏳ À payer'}
          </div>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: isMobile ? 8 : 6, flexWrap: 'nowrap' }}>
          {!isPaye && !isAnnule && (
            <button onClick={onPay}
              style={{ padding: btnPayPad, background: 'var(--coral)', border: 'none', borderRadius: 8, fontSize: btnPayFs, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', minHeight: isMobile ? 44 : 'auto', WebkitTapHighlightColor: 'transparent' }}>
              {cachet.modePaiement === 'especes' ? '✍️ Signer' : '✓ Payé'}
            </button>
          )}
          {isPaye && cachet.numeroDecharge && (
            <button onClick={onShowDecharge}
              title="Voir/télécharger la décharge"
              style={{ width: btnSz, height: btnSz, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--marine)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
              <FileText size={btnIc}/>
            </button>
          )}
          <button onClick={onEdit}
            title="Modifier"
            style={{ width: btnSz, height: btnSz, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
            <Edit2 size={btnIc}/>
          </button>
          <button onClick={onDelete}
            title="Supprimer"
            style={{ width: btnSz, height: btnSz, background: 'var(--red-light)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 11, color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
            <Trash2 size={btnIc}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Section preuves de paiement (Étape B) ─────────────────────────────
// Affiche la liste des fichiers attachés à un cachet + permet d'en ajouter
// et supprimer. Affichée uniquement quand on édite un cachet existant.
function CachetDocuments({ cachet, onError }) {
  // On suit l'état des documents localement pour mise à jour live sans rechargement.
  // Le watcher de la page parent (watchCachets) fera la sync ensuite.
  const [documents, setDocuments] = useState(cachet?.documents || [])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const fileRef = React.useRef(null)

  // Sync si le parent reçoit une mise à jour
  useEffect(() => {
    setDocuments(cachet?.documents || [])
  }, [cachet?.documents, cachet?.id])

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return
    setUploading(true); setProgress(0)
    try {
      for (const file of files) {
        const meta = await uploadCachetDocument(cachet.id, file, (pct) => setProgress(pct))
        setDocuments(prev => [...prev, meta])
      }
    } catch (e) {
      onError(e.message || 'Erreur lors de l\'upload.')
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (docPath, docName) => {
    if (!confirm(`Supprimer "${docName}" ?`)) return
    try {
      await deleteCachetDocument(cachet.id, docPath)
      setDocuments(prev => prev.filter(d => d.path !== docPath))
    } catch (e) {
      onError(e.message || 'Erreur lors de la suppression.')
    }
  }

  const isImage = (type) => (type || '').startsWith('image/')
  const sizeLabel = (bytes) => {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Paperclip size={11}/>
        Preuves de paiement ({documents.length})
      </div>

      {/* Liste des fichiers déjà uploadés */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {documents.map((doc) => (
            <div key={doc.path} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--bg2)', borderRadius: 6,
              fontSize: 12,
            }}>
              {isImage(doc.type) ? (
                // Miniature pour les images
                <img src={doc.url} alt="" style={{
                  width: 32, height: 32, objectFit: 'cover',
                  borderRadius: 4, flexShrink: 0,
                  background: 'var(--bg)',
                }}/>
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: 4,
                  background: 'var(--bg)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted)', flexShrink: 0,
                }}>
                  <FileText size={14}/>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: 'var(--text)', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{doc.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {sizeLabel(doc.size || 0)} · {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <a href={doc.url} target="_blank" rel="noreferrer"
                title="Ouvrir"
                style={{
                  padding: 6, background: 'transparent',
                  color: 'var(--brand-dark)',
                  display: 'flex', alignItems: 'center',
                  textDecoration: 'none', borderRadius: 4,
                }}>
                <Download size={14}/>
              </a>
              <button onClick={() => handleDelete(doc.path, doc.name)}
                title="Supprimer" disabled={uploading}
                style={{
                  padding: 6, background: 'transparent',
                  color: 'var(--red-dark)', border: 'none',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center',
                }}>
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bouton d'upload */}
      <input ref={fileRef} type="file" multiple
        accept="image/*,application/pdf"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        style={{ display: 'none' }}/>
      <button onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%', padding: '8px',
          background: 'transparent',
          color: uploading ? 'var(--muted)' : 'var(--brand-dark)',
          border: '0.5px dashed var(--border2)', borderRadius: 6,
          fontSize: 11, fontFamily: 'inherit',
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
        <Upload size={12}/>
        {uploading
          ? `Upload en cours… ${progress}%`
          : 'Ajouter une preuve (image, PDF)'}
      </button>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
        Plusieurs fichiers possibles. Images (PNG/JPG) et PDF acceptés, max 10 Mo chacun.
      </div>
    </div>
  )
}

// ─── Modale création/édition cachet ────────────────────────────────────
function CachetForm({ cachet, planning, existingCachets, onClose, onSaved, onError }) {
  const { user } = useAuthStore()
  // Si on édite un cachet sans creneauId, on est en mode "manuel" implicite.
  // On utilise la valeur sentinelle '__manuel__' dans le select pour basculer.
  const initialMode = cachet
    ? (cachet.creneauId ? cachet.creneauId : '__manuel__')
    : ''
  const [creneauId, setCreneauId] = useState(initialMode)
  // Champs spécifiques au mode manuel (hors planning)
  const [artisteManuel, setArtisteManuel] = useState(
    cachet && !cachet.creneauId ? (cachet.artiste || '') : ''
  )
  const [dateManuelle, setDateManuelle]   = useState(
    cachet && !cachet.creneauId ? (cachet.dateManuelle || '') : ''
  )
  const [type, setType] = useState(cachet?.type || 'cachet')
  const [montant, setMontant] = useState(cachet?.montant ? String(cachet.montant) : '')
  const [modePaiement, setModePaiement] = useState(cachet?.modePaiement || 'especes')
  const [reference, setReference] = useState(cachet?.reference || '')
  const [notes, setNotes] = useState(cachet?.notes || '')
  const [saving, setSaving] = useState(false)

  const isManuel = creneauId === '__manuel__'

  // Trie planning par date pour le selecteur
  const planningTri = useMemo(() => {
    return [...planning].sort((a, b) => {
      const da = a.debut?.toDate ? a.debut.toDate().getTime() : new Date(a.debut).getTime()
      const db = b.debut?.toDate ? b.debut.toDate().getTime() : new Date(b.debut).getTime()
      return da - db
    })
  }, [planning])

  const selectedCreneau = planning.find(p => p.id === creneauId)

  const handleSave = async () => {
    // Validation selon le mode
    if (!creneauId) { onError('Veuillez sélectionner un artiste ou choisir la saisie manuelle.'); return }
    if (isManuel) {
      if (!artisteManuel.trim()) { onError('Veuillez saisir le nom de l\'artiste.'); return }
    } else {
      if (!selectedCreneau) { onError('Créneau introuvable.'); return }
    }
    const m = parseFloat(String(montant).replace(',', '.'))
    if (isNaN(m) || m <= 0) { onError('Le montant doit être positif.'); return }

    setSaving(true)
    try {
      // En mode manuel : pas de creneauId, on utilise le nom saisi + date optionnelle.
      // En mode planning : on récupère le nom depuis le créneau choisi.
      const payload = {
        creneauId:    isManuel ? null : creneauId,
        artiste:      isManuel ? artisteManuel.trim() : (selectedCreneau.artiste || selectedCreneau.titre || 'Inconnu'),
        dateManuelle: isManuel ? (dateManuelle || null) : null,
        montant: m,
        modePaiement,
        type,
        reference: reference.trim(),
        notes: notes.trim(),
      }
      if (cachet) {
        await updateCachet(cachet.id, payload)
      } else {
        await addCachet(payload, user)
      }
      onSaved()
    } catch (e) {
      onError(e.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,24,36,0.7)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)', borderRadius: 16, padding: 24,
          maxWidth: 480, width: '100%', margin: '20px 0',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--marine)' }}>
            {cachet ? '✏️ Modifier le cachet' : '💰 Nouveau cachet'}
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg2)', border: 'none', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={16}/>
          </button>
        </div>

        {/* Créneau */}
        <FormRow label="Artiste *">
          <select value={creneauId} onChange={e => setCreneauId(e.target.value)}
            style={inputStyle}>
            <option value="">— Sélectionner un artiste —</option>
            {(() => {
              // Compte les occurrences de chaque nom d'artiste pour ne désambiguïser
              // que les cas où plusieurs créneaux portent le même nom.
              const nomCounts = {}
              planningTri.forEach(p => {
                const n = (p.artiste || p.titre || 'Sans nom').trim()
                nomCounts[n] = (nomCounts[n] || 0) + 1
              })
              return planningTri.map(p => {
                const nom = (p.artiste || p.titre || 'Sans nom').trim()
                // Suffixe avec date courte SEULEMENT si le nom apparaît plusieurs fois
                const needDistinguer = nomCounts[nom] > 1
                const suffixe = needDistinguer ? ` (${fmtDate(p.debut)})` : ''
                return (
                  <option key={p.id} value={p.id}>
                    {nom}{suffixe}
                  </option>
                )
              })
            })()}
            {/* Option saisie manuelle (hors planning) */}
            <option disabled>──────────</option>
            <option value="__manuel__">+ Saisir un nom manuellement (hors planning)</option>
          </select>
        </FormRow>

        {/* Champs spécifiques mode manuel */}
        {isManuel && (
          <>
            <FormRow label="Nom de l'artiste *">
              <input type="text" value={artisteManuel}
                onChange={e => setArtisteManuel(e.target.value)}
                placeholder="Ex: DJ Untel, Groupe XYZ…"
                maxLength={100}
                style={inputStyle}/>
            </FormRow>
            <FormRow label="Date de la prestation">
              <input type="date" value={dateManuelle}
                onChange={e => setDateManuelle(e.target.value)}
                style={inputStyle}/>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
                Optionnel — utile pour les cachets payés hors planning officiel.
              </div>
            </FormRow>
          </>
        )}

        {/* Type */}
        <FormRow label="Type">
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
            {Object.entries(TYPES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </FormRow>

        {/* Montant */}
        <FormRow label="Montant (€) *">
          <input type="number" step="0.01" value={montant}
            onChange={e => setMontant(e.target.value)}
            placeholder="0.00" style={inputStyle}/>
        </FormRow>

        {/* Mode de paiement */}
        <FormRow label="Mode de paiement">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(MODES).map(([k, m]) => {
              const selected = modePaiement === k
              return (
                <button key={k} type="button" onClick={() => setModePaiement(k)}
                  style={{
                    padding: 12, borderRadius: 10,
                    border: '2px solid ' + (selected ? m.color : 'var(--border)'),
                    background: selected ? m.bg : 'var(--bg)',
                    color: selected ? m.color : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'center',
                  }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{m.label}</div>
                </button>
              )
            })}
          </div>
        </FormRow>

        {/* Référence */}
        <FormRow label={`Référence ${modePaiement === 'cheque' ? '(N° chèque)' : modePaiement === 'virement' ? '(IBAN)' : '(facultatif)'}`}>
          <input value={reference} onChange={e => setReference(e.target.value)}
            placeholder={modePaiement === 'cheque' ? 'Ex: Chèque n° 1234' : modePaiement === 'virement' ? 'Ex: FR76 1234…' : 'Optionnel'}
            style={inputStyle}/>
        </FormRow>

        {/* Commentaires */}
        <FormRow label="Commentaires (facultatif)">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Ex: Acompte versé à la signature, conditions particulières…"
            rows={2} maxLength={500}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: 50 }}/>
        </FormRow>

        {/* Preuves de paiement (Étape B) — uniquement en édition (besoin du cachet.id) */}
        {cachet ? (
          <CachetDocuments cachet={cachet} onError={onError}/>
        ) : (
          <div style={{
            padding: '10px 12px', marginTop: 4,
            background: 'var(--bg2)', borderRadius: 8,
            fontSize: 11, color: 'var(--muted)', lineHeight: 1.4,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <Paperclip size={13} style={{ marginTop: 1, flexShrink: 0 }}/>
            <span>Les preuves de paiement (captures, PDF…) pourront être ajoutées après création du cachet.</span>
          </div>
        )}

        {/* Note sur l'auto-débit */}
        {modePaiement === 'especes' && !cachet && (
          <div style={{
            padding: '10px 12px', marginTop: 8,
            background: 'var(--gold-light)', borderRadius: 8,
            fontSize: 11, color: 'var(--muted)', lineHeight: 1.4,
          }}>
            💡 Quand vous marquerez ce cachet "payé", la signature de la décharge sera demandée
            et une transaction de débit sera automatiquement créée dans la caisse de l'événement.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: 'var(--marine)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: 12, background: 'var(--brand)', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', minWidth: 0, maxWidth: '100%',
  padding: '10px 12px',
  border: '1.5px solid var(--border2)', borderRadius: 10,
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
}
