/**
 * pages/stand/RetraitCommande.jsx — v1.0.0 (Lot 4)
 *
 * Page de remise des commandes au client.
 *
 * Flux :
 *   1. L'opérateur saisit le numéro OU scanne le QR du client
 *      - Numéro → recherche directe par numero parmi les commandes ready du jour
 *      - QR scanné → liste des commandes ready de ce client (au choix de l'opérateur)
 *   2. Affichage de la commande trouvée avec état paiement
 *   3. Bouton "Confirmer remise" (si payée) ou "Encaisser X € + remise" (si non payée)
 *   4. Possibilité d'annuler la commande à ce stade (remboursement auto si déjà payée)
 *   5. Écran de confirmation avec bouton "Commande suivante"
 *
 * Cas particuliers gérés :
 *   - Commande inexistante
 *   - Déjà retirée → message clair
 *   - Annulée → message clair
 *   - Encore pending (pas prête) → invitation à patienter
 *   - Solde insuffisant pour débit au retrait → guide vers le rechargement
 */

import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Package, Search, X, CheckCircle, Clock, AlertCircle,
  RefreshCw, Receipt, ChefHat, ArrowRight, User, ChevronRight,
  ChevronDown, ChevronUp, QrCode,
} from 'lucide-react'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import {
  watchCommandes, markCommandeCollected, cancelCommande,
} from '../../firebase/service'
import QrScanner from '../../components/QrScanner'
import { useBreakpoint } from '../../hooks/useBreakpoint'

const MOTIFS = ["Client n'est pas revenu", "Erreur de commande", "Autres"]

// Récupère le timestamp d'une commande
function getTs(commande) {
  const t = commande?.createdAt
  if (!t) return null
  if (t.toDate)   return t.toDate().getTime()
  if (t.seconds)  return t.seconds * 1000
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return null
}
function getReadyTs(commande) {
  const t = commande?.readyAt
  if (!t) return null
  if (t.toDate)   return t.toDate().getTime()
  if (t.seconds)  return t.seconds * 1000
  if (typeof t === 'string') return new Date(t).getTime()
  if (typeof t === 'number') return t
  return null
}

function fmtDuree(secs) {
  if (!isFinite(secs) || secs < 0) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

// ═══════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════

export default function RetraitCommande() {
  const { user } = useAuthStore()
  const { currentEventId, events } = useEventStore()
  const { isMobile } = useBreakpoint()

  // Données temps réel
  const [commandes, setCommandes] = useState([])
  const [now, setNow] = useState(Date.now())

  // États UI
  const [numInput, setNumInput] = useState('')
  const [selectedCommande, setSelectedCommande] = useState(null)
  const [clientChoices, setClientChoices] = useState(null)  // [commandes] quand un client a plusieurs ready
  const [scannedSpec, setScannedSpec] = useState(null)      // info spectateur pour vérif solde si débit nécessaire
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)                    // résultat après remise/annulation
  const [cancelMode, setCancelMode] = useState(false)
  const [motifIdx, setMotifIdx] = useState(0)
  const [motifTexte, setMotifTexte] = useState('')
  // QR repliable — plié par défaut pour libérer la place (les stats du bas étaient masquées).
  // Choix persisté dans localStorage.
  const [qrOpen, setQrOpen] = useState(() => {
    try { return localStorage.getItem('retrait-qr-open') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('retrait-qr-open', qrOpen ? '1' : '0') } catch {}
  }, [qrOpen])

  // Listener temps réel
  useEffect(() => {
    if (!currentEventId) { setCommandes([]); return }
    const unsub = watchCommandes(setCommandes, currentEventId)
    return unsub
  }, [currentEventId])

  // Tick pour mettre à jour "temps depuis prête"
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(tick)
  }, [])

  // Quand on sélectionne une commande, charger le spectateur (pour vérifier solde)
  useEffect(() => {
    if (!selectedCommande || selectedCommande.paid) {
      setScannedSpec(null)
      return
    }
    // Commande non payée → on doit charger le solde du spec
    let cancelled = false
    ;(async () => {
      try {
        const eventId = currentEventId
        const snap = await getDocs(
          query(collection(db, 'events', eventId, 'spectateurs'), where('id', '==', selectedCommande.specId))
        )
        if (!snap.empty && !cancelled) {
          setScannedSpec({ ...snap.docs[0].data(), _docId: snap.docs[0].id, _eventId: eventId })
        }
      } catch (e) { /* silencieux */ }
    })()
    return () => { cancelled = true }
  }, [selectedCommande, currentEventId])

  // Statistiques pour l'écran d'accueil de la page
  const stats = useMemo(() => {
    const ready = commandes.filter(c => c.status === 'ready')
    const pending = commandes.filter(c => c.status === 'pending')
    const collectedToday = commandes.filter(c => c.status === 'collected').length
    return { ready: ready.length, pending: pending.length, collectedToday }
  }, [commandes])

  // ─── Recherche par numéro ────────────────────────────────────────
  const searchByNumber = () => {
    setErr('')
    const num = parseInt(numInput.trim(), 10)
    if (!num || num < 1) {
      setErr('Saisissez un numéro de commande valide')
      return
    }
    // Cherche parmi les commandes du jour (toutes statuts pour donner un message clair)
    const found = commandes.find(c => Number(c.numero) === num)
    if (!found) {
      setErr(`Commande #${num} introuvable. Vérifiez le numéro.`)
      return
    }
    // Selon le statut, afficher la commande ou un message d'erreur
    if (found.status === 'collected') {
      const heure = found.collectedAt
        ? new Date(found.collectedAt.toDate ? found.collectedAt.toDate() : found.collectedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '—'
      setErr(`Commande #${num} a déjà été retirée à ${heure}.`)
      return
    }
    if (found.status === 'cancelled') {
      setErr(`Commande #${num} a été annulée${found.cancelReason ? ' (' + found.cancelReason + ')' : ''}.`)
      return
    }
    if (found.status === 'pending') {
      const ts = getTs(found)
      const secs = ts ? Math.floor((now - ts) / 1000) : 0
      setErr(`Commande #${num} pas encore prête (en préparation depuis ${fmtDuree(secs)}).`)
      return
    }
    // status === 'ready'
    setSelectedCommande(found)
    setNumInput('')
  }

  // ─── Recherche par scan QR ───────────────────────────────────────
  const handleScan = async (id) => {
    setErr('')
    const uid = id.toUpperCase().trim()
    // Cherche toutes les commandes ready de ce spectateur
    const myReadyCommandes = commandes.filter(c => c.specId === uid && c.status === 'ready')
    if (myReadyCommandes.length === 0) {
      // Vérifier s'il a des commandes pending ou si le spectateur existe
      const pending = commandes.filter(c => c.specId === uid && c.status === 'pending')
      if (pending.length > 0) {
        setErr(`${uid} a ${pending.length} commande${pending.length > 1 ? 's' : ''} en préparation, mais aucune prête.`)
        return
      }
      // Vérifier si le client existe au moins
      try {
        const snap = await getDocs(
          query(collection(db, 'events', currentEventId, 'spectateurs'), where('id', '==', uid))
        )
        if (snap.empty) {
          setErr(`Client ${uid} introuvable.`)
        } else {
          setErr(`Aucune commande prête pour ${snap.docs[0].data().nom || uid}.`)
        }
      } catch (e) {
        setErr(`Aucune commande prête pour ${uid}.`)
      }
      return
    }
    // Une seule commande prête → on la sélectionne directement
    if (myReadyCommandes.length === 1) {
      setSelectedCommande(myReadyCommandes[0])
      return
    }
    // Plusieurs → affiche la liste de choix
    setClientChoices(myReadyCommandes.sort((a, b) => (getTs(a) || 0) - (getTs(b) || 0)))
  }

  // ─── Action : confirmer remise (avec débit si non payée) ─────────
  const doConfirm = async () => {
    if (!selectedCommande) return
    // Vérif solde si débit nécessaire
    if (!selectedCommande.paid) {
      const solde = scannedSpec?.solde || 0
      if (solde < (selectedCommande.total || 0)) {
        setErr(`Solde insuffisant : ${(solde / 100).toFixed(2)} € disponibles, ${((selectedCommande.total || 0) / 100).toFixed(2)} € requis.`)
        return
      }
    }
    setLoading(true); setErr('')
    try {
      await markCommandeCollected(
        selectedCommande.id,
        (user && user.nom) ? user.nom : 'Stand',
        currentEventId
      )
      setDone({
        action: 'collected',
        numero: selectedCommande.numero,
        nom: selectedCommande.specNom,
        total: selectedCommande.total,
        wasPaid: selectedCommande.paid,
      })
      setSelectedCommande(null)
      setScannedSpec(null)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  // ─── Action : annulation depuis la page retrait ──────────────────
  const doCancel = async () => {
    if (!selectedCommande) return
    const motif = motifIdx === 2 ? (motifTexte.trim() || 'Autres') : MOTIFS[motifIdx]
    setLoading(true); setErr('')
    try {
      await cancelCommande(
        selectedCommande.id,
        (user && user.nom) ? user.nom : 'Stand',
        motif,
        currentEventId
      )
      setDone({
        action: 'cancelled',
        numero: selectedCommande.numero,
        nom: selectedCommande.specNom,
        total: selectedCommande.total,
        wasPaid: selectedCommande.paid,
        motif,
      })
      setSelectedCommande(null)
      setScannedSpec(null)
      setCancelMode(false)
      setMotifIdx(0); setMotifTexte('')
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  const reset = () => {
    setDone(null)
    setSelectedCommande(null)
    setScannedSpec(null)
    setNumInput('')
    setErr('')
    setCancelMode(false)
    setClientChoices(null)
    setMotifIdx(0); setMotifTexte('')
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉCRAN DE CONFIRMATION (après remise ou annulation)
  // ═══════════════════════════════════════════════════════════════════
  if (done) return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{
        textAlign: 'center', padding: '32px 20px',
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
      }}>
        {done.action === 'collected' ? (
          <>
            <CheckCircle size={52} style={{ color: 'var(--brand)', marginBottom: 16 }}/>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Commande #{done.numero} remise
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18 }}>
              {done.wasPaid ? 'Déjà payée à la prise' : `Encaissée : ${((done.total || 0) / 100).toFixed(2)} €`}
            </div>
          </>
        ) : (
          <>
            <X size={52} style={{ color: 'var(--red-dark)', marginBottom: 16 }}/>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Commande #{done.numero} annulée
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 6 }}>
              {done.motif}
            </div>
            {done.wasPaid && (
              <div style={{ fontSize: 13, color: 'var(--green-dark)', fontWeight: 600, marginBottom: 12 }}>
                💰 {((done.total || 0) / 100).toFixed(2)} € remboursé au client
              </div>
            )}
          </>
        )}
        <div style={{
          padding: '12px 14px',
          background: 'var(--bg2)', borderRadius: 10,
          marginBottom: 16, fontSize: 13, color: 'var(--text)',
        }}>
          Client : <strong>{done.nom}</strong>
        </div>
        <button onClick={reset} className="btn-primary" style={{ width: '100%', minHeight: 44 }}>
          <ArrowRight size={14}/> Commande suivante
        </button>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════
  // ÉCRAN "PLUSIEURS COMMANDES POUR CE CLIENT" (choix multiple)
  // ═══════════════════════════════════════════════════════════════════
  if (clientChoices) return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 16px' }}>
      <div style={{
        background: 'var(--brand-light)',
        border: '0.5px solid var(--brand)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 12,
        fontSize: 12, color: 'var(--brand-dark)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <User size={16}/>
        <span>
          <strong>{clientChoices[0].specNom}</strong> a <strong>{clientChoices.length}</strong> commandes prêtes. Choisissez celle à remettre :
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {clientChoices.map(cmd => {
          const readyTs = getReadyTs(cmd)
          const secsReady = readyTs ? Math.max(0, Math.floor((now - readyTs) / 1000)) : 0
          return (
            <button key={cmd.id}
              onClick={() => { setSelectedCommande(cmd); setClientChoices(null) }}
              style={{
                background: 'var(--bg)',
                border: '0.5px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
                cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
                WebkitTapHighlightColor: 'transparent',
              }}>
              <span style={{
                fontSize: 22, fontWeight: 800, color: 'var(--brand)',
                minWidth: 50,
              }}>
                #{cmd.numero}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                  {(cmd.items || []).length} article{(cmd.items || []).length > 1 ? 's' : ''} · {((cmd.total || 0) / 100).toFixed(2)} €
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Prête depuis {fmtDuree(secsReady)} · {cmd.paid ? 'Payée' : 'À débiter'}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--muted)', flexShrink: 0 }}/>
            </button>
          )
        })}
      </div>
      <button onClick={() => setClientChoices(null)} className="btn-secondary" style={{ width: '100%', minHeight: 44 }}>
        Retour
      </button>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════
  // ÉCRAN DE DÉTAIL COMMANDE (commande sélectionnée)
  // ═══════════════════════════════════════════════════════════════════
  if (selectedCommande) {
    const readyTs = getReadyTs(selectedCommande)
    const secsReady = readyTs ? Math.max(0, Math.floor((now - readyTs) / 1000)) : 0
    const soldeActuel = scannedSpec?.solde ?? null
    const soldeSuffisant = selectedCommande.paid || (soldeActuel !== null && soldeActuel >= (selectedCommande.total || 0))
    const manquant = !selectedCommande.paid && soldeActuel !== null
      ? Math.max(0, (selectedCommande.total || 0) - soldeActuel)
      : 0

    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 16px' }}>

        {/* Bouton retour / changer */}
        <div style={{ marginBottom: 10 }}>
          <button onClick={reset}
            style={{
              background:'transparent', border:'0.5px solid var(--border2)',
              padding:'6px 12px', fontSize:11, borderRadius:6, cursor:'pointer',
              color:'var(--text)', fontFamily:'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            ← Rechercher une autre commande
          </button>
        </div>

        {/* Carte commande */}
        <div style={{
          background: 'var(--bg)',
          border: '2px solid var(--brand)',
          borderRadius: 14,
          padding: '14px 16px',
          marginBottom: 12,
        }}>
          {/* En-tête : gros numéro */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>
                #{selectedCommande.numero}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>
                {selectedCommande.specNom}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {selectedCommande.specId} · Prête depuis {fmtDuree(secsReady)}
              </div>
            </div>
            <span style={{
              padding: '4px 10px',
              background: 'var(--brand-light)', color: 'var(--brand-dark)',
              fontSize: 10, fontWeight: 700, borderRadius: 10,
              flexShrink: 0,
            }}>
              PRÊTE
            </span>
          </div>

          {/* Liste des articles */}
          <div style={{
            background: 'var(--bg2)', borderRadius: 8,
            padding: '10px 12px', marginBottom: 10,
            fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
          }}>
            {(selectedCommande.items || []).map((it, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span><span style={{ fontWeight: 700 }}>{it.qty || 1}×</span> {it.nom}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {(((it.prixUnit || 0) * (it.qty || 1)) / 100).toFixed(2)} €
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 8, borderTop: '0.5px solid var(--border)',
            fontSize: 14, marginBottom: 10,
          }}>
            <span style={{ color: 'var(--muted)' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 18 }}>{((selectedCommande.total || 0) / 100).toFixed(2)} €</span>
          </div>

          {/* Bandeau paiement */}
          {selectedCommande.paid ? (
            <div style={{
              background: 'var(--green-light)', color: 'var(--green-dark)',
              borderRadius: 8, padding: '8px 12px',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <CheckCircle size={14}/>
              Déjà payée à la prise de commande
            </div>
          ) : (
            <div style={{
              background: soldeSuffisant ? 'var(--gold-light)' : 'var(--red-light)',
              color: soldeSuffisant ? 'var(--gold-dark)' : 'var(--red-dark)',
              border: '0.5px solid ' + (soldeSuffisant ? 'var(--gold)' : 'var(--red)'),
              borderRadius: 8, padding: '10px 12px',
              fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                {soldeSuffisant ? '💰' : '⚠️'} {soldeSuffisant ? 'À débiter au retrait' : 'Solde insuffisant'}
              </div>
              {soldeActuel !== null && (
                <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                  Solde client : <strong>{(soldeActuel / 100).toFixed(2)} €</strong>
                  {!soldeSuffisant && <> · Manque <strong>{(manquant / 100).toFixed(2)} €</strong></>}
                </div>
              )}
              {soldeActuel === null && (
                <div style={{ fontSize: 11 }}>Vérification du solde en cours…</div>
              )}
            </div>
          )}
        </div>

        {/* Erreurs */}
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

        {/* Boutons d'action */}
        {!cancelMode && (
          <>
            <button onClick={doConfirm}
              disabled={loading || !soldeSuffisant}
              style={{
                width: '100%',
                padding: '14px',
                background: (loading || !soldeSuffisant) ? 'var(--bg2)' : 'var(--brand)',
                color: (loading || !soldeSuffisant) ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700,
                cursor: (loading || !soldeSuffisant) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 8,
                WebkitTapHighlightColor: 'transparent',
              }}>
              <Package size={16}/>
              {loading ? '…' :
                selectedCommande.paid
                  ? 'Confirmer la remise'
                  : `Encaisser ${((selectedCommande.total || 0) / 100).toFixed(2)} € et remettre`
              }
            </button>
            <button onClick={() => setCancelMode(true)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                color: 'var(--red-dark)',
                border: '0.5px solid var(--red)',
                borderRadius: 10,
                fontSize: 12, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                WebkitTapHighlightColor: 'transparent',
              }}>
              <X size={14}/> Annuler la commande
            </button>
          </>
        )}

        {/* Mode annulation : choix du motif */}
        {cancelMode && (
          <div style={{
            background: 'var(--bg)',
            border: '0.5px solid var(--red)',
            borderRadius: 10,
            padding: '14px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red-dark)', marginBottom: 10 }}>
              Annulation de la commande #{selectedCommande.numero}
            </div>
            {selectedCommande.paid && (
              <div style={{
                background: 'var(--green-light)', color: 'var(--green-dark)',
                borderRadius: 6, padding: '8px 10px', marginBottom: 10,
                fontSize: 11,
              }}>
                💰 Le client sera remboursé de {((selectedCommande.total || 0) / 100).toFixed(2)} € automatiquement.
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Motif
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {MOTIFS.map((m, i) => (
                <button key={i} onClick={() => setMotifIdx(i)}
                  style={{
                    textAlign: 'left', padding: '10px 12px',
                    background: motifIdx === i ? 'var(--brand-light)' : 'var(--bg2)',
                    border: '1px solid ' + (motifIdx === i ? 'var(--brand)' : 'var(--border)'),
                    borderRadius: 8, fontSize: 13, fontWeight: motifIdx === i ? 700 : 500,
                    color: motifIdx === i ? 'var(--brand-dark)' : 'var(--text)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  {m}
                </button>
              ))}
            </div>
            {motifIdx === 2 && (
              <input type="text" autoFocus
                value={motifTexte}
                onChange={e => setMotifTexte(e.target.value)}
                placeholder="Précisez le motif (optionnel)…"
                style={{
                  marginBottom: 10, width: '100%', padding: '9px 12px',
                  fontSize: 13, fontFamily: 'inherit',
                  background: 'var(--bg)', color: 'var(--text)',
                  border: '0.5px solid var(--border)', borderRadius: 8,
                  outline: 'none', boxSizing: 'border-box',
                }}/>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setCancelMode(false); setMotifIdx(0); setMotifTexte('') }}
                disabled={loading}
                className="btn-secondary" style={{ flex: 1, minHeight: 42 }}>
                Retour
              </button>
              <button onClick={doCancel} disabled={loading}
                className="btn-danger" style={{ flex: 1, minHeight: 42 }}>
                {loading ? '…' : 'Confirmer annulation'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉCRAN PRINCIPAL : recherche par numéro ou scan QR
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 16px' }}>

      {/* ─── Section : recherche par numéro ─────────────────────── */}
      <div style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 14,
        padding: '16px',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, textAlign: 'center' }}>
          Numéro de commande
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            value={numInput}
            onChange={e => setNumInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchByNumber() }}
            placeholder="Ex: 42"
            autoFocus
            style={{
              flex: 1, padding: '12px 14px',
              fontSize: 18, fontWeight: 700, textAlign: 'center',
              background: 'var(--bg2)', color: 'var(--text)',
              border: '0.5px solid var(--border)', borderRadius: 8,
              outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}/>
          <button onClick={searchByNumber}
            disabled={!numInput.trim()}
            style={{
              padding: '0 16px',
              background: !numInput.trim() ? 'var(--bg2)' : 'var(--brand)',
              color: !numInput.trim() ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 8,
              cursor: !numInput.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
            <Search size={18}/>
          </button>
        </div>
      </div>

      {/* ─── OU séparateur ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        color: 'var(--muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        OU
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
      </div>

      {/* ─── Section : scan QR (repliable) ─────────────────────── */}
      <div style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 14,
        marginBottom: 12,
        overflow: 'hidden',
      }}>
        {/* Header cliquable */}
        <button onClick={() => setQrOpen(o => !o)}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrCode size={16} style={{ color: 'var(--brand)' }}/>
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              Scanner le QR du client
            </span>
          </div>
          {qrOpen
            ? <ChevronUp size={16} style={{ color: 'var(--muted)' }}/>
            : <ChevronDown size={16} style={{ color: 'var(--muted)' }}/>
          }
        </button>
        {/* Contenu déplié — le QrScanner ne s'active que s'il est rendu */}
        {qrOpen && (
          <div style={{ padding: '0 16px 16px', borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
            <QrScanner onScan={handleScan} placeholder="FY-XXXX"/>
          </div>
        )}
      </div>

      {/* ─── Erreur ──────────────────────────────────────────────── */}
      {err && (
        <div style={{
          padding: '10px 12px', marginBottom: 12,
          background: 'var(--red-light)', color: 'var(--red-dark)',
          borderRadius: 8, fontSize: 12,
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }}/>
          <span>{err}</span>
        </div>
      )}

      {/* ─── Mini-stats du jour ──────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        marginTop: 8,
      }}>
        <MiniStat icon={<ChefHat size={14}/>} label="En préparation" value={stats.pending} color="var(--gold-dark)"/>
        <MiniStat icon={<Package size={14}/>} label="Prêtes" value={stats.ready} color="var(--brand-dark)"/>
        <MiniStat icon={<CheckCircle size={14}/>} label="Retirées" value={stats.collectedToday} color="var(--green-dark)"/>
      </div>
    </div>
  )
}

function MiniStat({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: '0.5px solid var(--border)',
      borderRadius: 8,
      padding: '8px 10px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 10, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.03em',
        marginBottom: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
