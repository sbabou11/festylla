/**
 * components/CheckUpdateButton.jsx — v1.0.0
 *
 * Bouton compact "Vérifier les mises à jour" réutilisable dans tous les espaces
 * (admin, billetterie, stand, bénévole, artiste, spectateur).
 *
 * Affiche un état (idle / vérification / résultat) avec feedback visuel discret.
 * S'appuie sur le hook checkForUpdate() du système d'auto-update existant.
 *
 * Pour le diagnostic complet (état du Service Worker, etc.) → utiliser
 * UpdateDiagnostic.jsx (réservé aux admins dans la page Paramètres).
 */

import React, { useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'
import { checkForUpdate } from '../hooks/useAppUpdate'

/**
 * Props :
 *   - variant : 'card' (défaut) | 'inline' | 'compact'
 *     - 'card'    : carte autonome avec titre et description
 *     - 'inline'  : juste le bouton + message (pour intégrer dans un autre bloc)
 *     - 'compact' : tout petit, pour les footers
 */
export default function CheckUpdateButton({ variant = 'card' }) {
  const [checking, setChecking] = useState(false)
  const [result, setResult]     = useState(null)

  const handleCheck = async () => {
    setChecking(true)
    setResult(null)
    try {
      const r = await checkForUpdate()
      setResult(r)
    } catch (e) {
      setResult({ found: false, error: e.message })
    }
    setChecking(false)
    // Auto-clear du résultat après 8s pour ne pas encombrer
    setTimeout(() => setResult(null), 8000)
  }

  // ─── Variante "compact" — tout petit lien pour les footers ────────
  if (variant === 'compact') {
    return (
      <button onClick={handleCheck} disabled={checking}
        style={{
          background: 'none', border: 'none', cursor: checking ? 'wait' : 'pointer',
          color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font)',
          padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4,
          opacity: checking ? 0.6 : 0.8, textDecoration: 'underline',
          WebkitTapHighlightColor: 'transparent',
        }}>
        <RefreshCw size={11} className={checking ? 'spin' : ''}/>
        {checking ? 'Vérification…' :
          result?.found ? 'Mise à jour trouvée !' :
          result?.error ? 'Erreur — réessayez' :
          result ? 'À jour ✓' :
          'Vérifier les mises à jour'}
      </button>
    )
  }

  // ─── Variante "inline" — bouton + résultat dans un autre bloc ─────
  if (variant === 'inline') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleCheck} disabled={checking}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            background: 'var(--brand)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 700,
            cursor: checking ? 'wait' : 'pointer',
            fontFamily: 'var(--font)',
            opacity: checking ? 0.7 : 1,
            minHeight: 36,
            WebkitTapHighlightColor: 'transparent',
          }}>
          <RefreshCw size={13} className={checking ? 'spin' : ''}/>
          {checking ? 'Vérification…' : 'Vérifier les mises à jour'}
        </button>
        <ResultMessage result={result}/>
      </div>
    )
  }

  // ─── Variante "card" (défaut) — bloc autonome ─────────────────────
  return (
    <div style={{
      background: 'var(--bg)',
      border: '0.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--brand-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Sparkles size={16} style={{ color: 'var(--brand-dark)' }}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Mises à jour de l'app
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
            L'app vérifie automatiquement les nouvelles versions toutes les 25 secondes.
            Vous pouvez forcer une vérification manuellement.
          </div>
        </div>
      </div>

      <button onClick={handleCheck} disabled={checking}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px',
          background: 'var(--brand)', color: '#fff',
          border: 'none', borderRadius: 8,
          fontSize: 12, fontWeight: 700,
          cursor: checking ? 'wait' : 'pointer',
          fontFamily: 'var(--font)',
          opacity: checking ? 0.7 : 1,
          minHeight: 36,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <RefreshCw size={13} className={checking ? 'spin' : ''}/>
        {checking ? 'Vérification en cours…' : 'Vérifier maintenant'}
      </button>

      {result && (
        <div style={{ marginTop: 10 }}>
          <ResultMessage result={result}/>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ResultMessage — message de retour selon le résultat de la vérification
// ═══════════════════════════════════════════════════════════════════════

function ResultMessage({ result }) {
  if (!result) return null

  if (result.found) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        background: 'var(--green-light)',
        color: 'var(--green-dark)',
        borderRadius: 6, fontSize: 11, fontWeight: 600,
      }}>
        <CheckCircle size={13}/> Mise à jour détectée ! La popup va s'afficher.
      </div>
    )
  }

  if (result.error) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        background: 'var(--red-light)',
        color: 'var(--red-dark)',
        borderRadius: 6, fontSize: 11, fontWeight: 600,
      }}>
        <AlertCircle size={13}/> Erreur — {result.error}
      </div>
    )
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px',
      background: 'var(--green-light)',
      color: 'var(--green-dark)',
      borderRadius: 6, fontSize: 11, fontWeight: 600,
    }}>
      <CheckCircle size={13}/> Vous êtes à jour
    </div>
  )
}
