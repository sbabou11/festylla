/**
 * pages/billetterie/Remboursement.jsx — v1.0.0 (Lot A)
 *
 * Page double-usage pour la billetterie :
 *   - Mode "Solde" : remboursement du solde restant en fin de festival
 *                    (débit du compte client, l'argent retourne au client en cash/CB)
 *   - Mode "Correction" : crédit corrigeant un débit (annulation transaction, geste commercial...)
 *
 * Toggle en haut de page pour basculer entre les deux modes.
 */

import React, { useState } from 'react'
import {
  CheckCircle, RefreshCw, Banknote, AlertCircle, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react'
import useEventStore from '../../store/useEventStore'
import useAuthStore  from '../../store/useAuthStore'
import { db } from '../../firebase/config'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { rembourserSolde, crediterCorrection } from '../../firebase/service'
import QrScanner from '../../components/QrScanner'

export default function Remboursement() {
  const { user } = useAuthStore()
  const { currentEventId, events } = useEventStore()

  // Mode : 'solde' (débit) ou 'correction' (crédit)
  const [mode, setMode] = useState('solde')

  // États
  const [spec, setSpec] = useState(null)
  const [montantEur, setMontantEur] = useState('')  // saisie en EUROS (string pour éviter parsing)
  const [motif, setMotif] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  // Recherche spectateur (par scan QR ou saisie)
  const findById = async (id) => {
    const uid = id.toUpperCase().trim()
    setErr('Recherche en cours…')
    try {
      const staffEventId = user?.eventId || currentEventId
      const evIds = staffEventId
        ? [staffEventId, ...events.map(e => e.id).filter(eid => eid !== staffEventId)]
        : events.map(e => e.id)
      for (const evId of evIds) {
        const snap = await getDocs(
          query(collection(db, 'events', evId, 'spectateurs'), where('id', '==', uid))
        )
        if (!snap.empty) {
          const data = snap.docs[0].data()
          setSpec({ ...data, _docId: snap.docs[0].id, _eventId: evId })
          setErr('')
          // Pré-remplir le montant selon le mode
          if (mode === 'solde') {
            setMontantEur(((data.solde || 0) / 100).toFixed(2))
          } else {
            setMontantEur('')
          }
          return
        }
      }
      setErr('Compte introuvable : ' + uid)
      setSpec(null)
    } catch (e) {
      setErr('Erreur de recherche : ' + e.message)
      setSpec(null)
    }
  }

  // Quand on change de mode, on re-règle le montant par défaut
  const switchMode = (newMode) => {
    setMode(newMode)
    setErr('')
    if (spec && newMode === 'solde') {
      setMontantEur(((spec.solde || 0) / 100).toFixed(2))
    } else {
      setMontantEur('')
    }
  }

  // Validation
  const montantCentimes = Math.round((parseFloat(montantEur.replace(',', '.')) || 0) * 100)
  const soldeActuel = spec?.solde || 0
  const isSoldeMode = mode === 'solde'
  // Pour le mode solde, on vérifie que montant ≤ solde
  const soldeInsuffisant = isSoldeMode && montantCentimes > soldeActuel
  // Pour le mode correction, on exige un motif
  const motifManquant = !isSoldeMode && !motif.trim()
  const canSubmit = spec && montantCentimes > 0 && !soldeInsuffisant && !motifManquant && !loading

  // Soumission
  const doSubmit = async () => {
    if (!canSubmit) return
    setLoading(true); setErr('')
    try {
      const eventId = spec._eventId || currentEventId
      const staff = (user && user.nom) ? user.nom : 'Billetterie'
      if (isSoldeMode) {
        await rembourserSolde(spec.id, montantCentimes, motif.trim() || 'Remboursement de solde', staff, eventId)
      } else {
        await crediterCorrection(spec.id, montantCentimes, motif.trim(), staff, eventId)
      }
      setDone({
        mode,
        nom: spec.nom,
        specId: spec.id,
        montant: montantCentimes,
        motif: motif.trim() || (isSoldeMode ? 'Remboursement de solde' : ''),
        soldeApres: isSoldeMode ? (soldeActuel - montantCentimes) : (soldeActuel + montantCentimes),
      })
      setSpec(null); setMontantEur(''); setMotif('')
    } catch(e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setDone(null); setSpec(null); setMontantEur(''); setMotif(''); setErr('')
  }

  // ─── Écran de confirmation ───────────────────────────────────────
  if (done) return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{
        textAlign: 'center', padding: '32px 20px',
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
      }}>
        <CheckCircle size={52} style={{ color: 'var(--brand)', marginBottom: 16 }}/>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          {done.mode === 'solde' ? 'Remboursement effectué' : 'Crédit appliqué'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18 }}>
          {done.mode === 'solde' ? 'Le compte client a été débité' : 'Le compte client a été crédité'}
        </div>
        <div style={{
          padding: '14px 18px',
          background: 'var(--bg2)', borderRadius: 10,
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            {done.nom} · {done.specId}
          </div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            <strong style={{ fontSize: 18, color: done.mode === 'solde' ? 'var(--red-dark)' : 'var(--green-dark)' }}>
              {done.mode === 'solde' ? '−' : '+'}{(done.montant / 100).toFixed(2)} €
            </strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Nouveau solde : <strong>{(done.soldeApres / 100).toFixed(2)} €</strong>
          </div>
          {done.motif && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
              {done.motif}
            </div>
          )}
        </div>
        <button onClick={reset} className="btn-primary" style={{ width: '100%', minHeight: 44 }}>
          <RefreshCw size={14}/> Nouveau remboursement
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 16px' }}>

      {/* ─── Toggle Mode ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, padding: 3,
        background: 'var(--bg2)', borderRadius: 10,
        marginBottom: 12,
      }}>
        <ModeTab
          active={mode === 'solde'}
          onClick={() => switchMode('solde')}
          icon={<ArrowDownCircle size={14}/>}
          label="Remboursement solde"
          desc="Débite le compte client"
        />
        <ModeTab
          active={mode === 'correction'}
          onClick={() => switchMode('correction')}
          icon={<ArrowUpCircle size={14}/>}
          label="Crédit correction"
          desc="Annule un débit, geste commercial"
        />
      </div>

      {/* ─── Étape 1 : scanner / saisir le client ────────────────── */}
      {!spec ? (
        <div style={{
          background: 'var(--bg)',
          border: '0.5px solid var(--border)',
          borderRadius: 14,
          padding: '18px 16px',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14,
            textAlign: 'center',
          }}>
            <Banknote size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6, color: 'var(--brand)' }}/>
            Scanner le QR du client
          </div>
          <QrScanner onScan={findById} placeholder="FY-XXXX"/>
          {err && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: 'var(--red-light)', color: 'var(--red-dark)',
              borderRadius: 8, fontSize: 12,
            }}>
              {err}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ─── Bandeau client ──────────────────────────────────── */}
          <div style={{
            background: 'var(--bg)',
            border: '0.5px solid var(--border)',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--brand-light)', color: 'var(--brand-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}>
              {(spec.nom || '?').split(/\s+/).map(p => p[0] || '').slice(0,2).join('').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {spec.nom}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {spec.id} · Solde : <strong style={{ color: 'var(--text)' }}>
                  {(soldeActuel / 100).toFixed(2)} €
                </strong>
              </div>
            </div>
            <button onClick={() => { setSpec(null); setMontantEur(''); setMotif(''); setErr('') }}
              style={{
                background:'transparent', border:'0.5px solid var(--border2)',
                padding:'5px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
                color:'var(--text)', fontFamily:'inherit',
              }}>
              Changer
            </button>
          </div>

          {/* ─── Champ Montant ───────────────────────────────────── */}
          <div style={{
            background: 'var(--bg)',
            border: '0.5px solid var(--border)',
            borderRadius: 14,
            padding: '16px',
            marginBottom: 10,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              marginBottom: 8,
            }}>
              Montant à {isSoldeMode ? 'rembourser' : 'créditer'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                inputMode="decimal"
                value={montantEur}
                onChange={e => setMontantEur(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                style={{
                  flex: 1, padding: '14px',
                  fontSize: 22, fontWeight: 700, textAlign: 'center',
                  background: 'var(--bg2)', color: 'var(--text)',
                  border: '0.5px solid ' + (soldeInsuffisant ? 'var(--red)' : 'var(--border)'),
                  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}/>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>€</span>
            </div>

            {/* Boutons rapides en mode SOLDE — proposer 25%, 50%, 100% du solde */}
            {isSoldeMode && soldeActuel > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {[25, 50, 100].map(pct => (
                  <button key={pct}
                    onClick={() => setMontantEur((Math.round(soldeActuel * pct / 100) / 100).toFixed(2))}
                    style={{
                      flex: 1, padding: '7px',
                      background: 'transparent',
                      border: '0.5px solid var(--border)',
                      borderRadius: 6, fontSize: 11, fontWeight: 600,
                      color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    {pct === 100 ? 'Tout' : `${pct}%`} ({((soldeActuel * pct / 10000)).toFixed(2)} €)
                  </button>
                ))}
              </div>
            )}

            {/* Alerte solde insuffisant */}
            {soldeInsuffisant && (
              <div style={{
                marginTop: 10, padding: '8px 12px',
                background: 'var(--red-light)', color: 'var(--red-dark)',
                border: '0.5px solid var(--red)', borderRadius: 8,
                fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <AlertCircle size={14}/>
                Le montant dépasse le solde du client ({(soldeActuel / 100).toFixed(2)} €)
              </div>
            )}
          </div>

          {/* ─── Champ Motif ─────────────────────────────────────── */}
          <div style={{
            background: 'var(--bg)',
            border: '0.5px solid var(--border)',
            borderRadius: 14,
            padding: '16px',
            marginBottom: 10,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              marginBottom: 8,
            }}>
              Motif {!isSoldeMode && <span style={{ color: 'var(--red-dark)' }}>*</span>}
              {isSoldeMode && <span style={{ fontSize: 10, marginLeft: 6, fontWeight: 500 }}>(optionnel)</span>}
            </div>
            <input
              type="text"
              value={motif}
              onChange={e => setMotif(e.target.value)}
              placeholder={isSoldeMode
                ? "Ex: fin de festival, départ anticipé..."
                : "Ex: annulation commande #42, geste commercial..."
              }
              maxLength={120}
              style={{
                width: '100%', padding: '11px 14px',
                fontSize: 13, fontFamily: 'inherit',
                background: 'var(--bg2)', color: 'var(--text)',
                border: '0.5px solid ' + (motifManquant ? 'var(--red)' : 'var(--border)'),
                borderRadius: 8, outline: 'none',
                boxSizing: 'border-box',
              }}/>
            {motifManquant && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--red-dark)' }}>
                Le motif est obligatoire pour un crédit de correction.
              </div>
            )}
          </div>

          {/* ─── Erreurs ─────────────────────────────────────────── */}
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

          {/* ─── Bouton de validation ────────────────────────────── */}
          <button onClick={doSubmit}
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '14px',
              background: canSubmit
                ? (isSoldeMode ? 'var(--red-dark)' : 'var(--green-dark)')
                : 'var(--bg2)',
              color: canSubmit ? '#fff' : 'var(--muted)',
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              WebkitTapHighlightColor: 'transparent',
              minHeight: 48,
            }}>
            {loading ? '…' : (
              <>
                {isSoldeMode ? <ArrowDownCircle size={16}/> : <ArrowUpCircle size={16}/>}
                {isSoldeMode
                  ? `Rembourser ${(montantCentimes / 100).toFixed(2)} €`
                  : `Créditer ${(montantCentimes / 100).toFixed(2)} €`
                }
              </>
            )}
          </button>

          {/* Info sur le type de transaction généré */}
          <div style={{
            marginTop: 8, fontSize: 10, color: 'var(--muted)',
            textAlign: 'center', lineHeight: 1.4,
          }}>
            {isSoldeMode
              ? 'Cette opération débite le compte client. L\'argent doit être remis au client en cash/CB hors de l\'app.'
              : 'Cette opération crédite le compte client (aucun cash retiré du tiroir).'
            }
          </div>
        </>
      )}
    </div>
  )
}

// ─── Composant : onglet de mode ─────────────────────────────────────
function ModeTab({ active, onClick, icon, label, desc }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, minWidth: 0,
        padding: '10px 8px',
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        border: 'none',
        borderRadius: 8,
        fontFamily: 'inherit',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
        transition: 'background .15s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 12, fontWeight: active ? 700 : 600,
      }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 10, color: active ? 'var(--muted)' : 'var(--muted)' }}>
        {desc}
      </div>
    </button>
  )
}
