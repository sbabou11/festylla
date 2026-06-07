/**
 * pages/admin/Spectateurs.jsx — v2
 * Super admin : voir, modifier (nom, solde), supprimer des spectateurs
 */
import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import useAuthStore, { ROLE_PAGES } from '../../store/useAuthStore'
import { fmt } from '../../utils/helpers'
import QrCode from '../../components/QrCode'
import { Trash2, Pencil, Search, X, Save, Plus, Minus, Printer } from 'lucide-react'
import { db } from '../../firebase/config'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import useEventStore from '../../store/useEventStore'
import QRCode from 'qrcode'
import { APP_VERSION_LABEL } from '../../utils/buildInfo'

export default function Spectateurs() {
  const { spectateurs, theme, roles } = useAppStore()
  const { user } = useAuthStore()
  const { currentEventId, events } = useEventStore()
  const currentEvent = events.find(e => e.id === currentEventId)

  // ─── Détection des permissions ───────────────────────────────────────
  // Seuls les admins et super_admins peuvent modifier/supprimer un spectateur.
  // Les autres rôles (billetterie, stand, custom…) sont en lecture seule
  // — ils peuvent voir, chercher et imprimer le QR, mais pas éditer le nom
  // ni le solde, et pas supprimer.
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  // canEdit déterminé strictement : seuls les admins peuvent modifier.
  // Pour ajuster à l'avenir, on pourrait ouvrir aussi aux rôles custom
  // ayant explicitement l'accès à 'spectateurs-edit' (page virtuelle).
  const canEdit = isAdmin
  const [search, setSearch]     = useState('')
  const [editing, setEditing]   = useState(null)  // { _docId, id, nom, solde }
  const [editNom, setEditNom]   = useState('')
  const [editSolde, setEditSolde] = useState(0)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [printing, setPrinting] = useState(false)

  const filtered = spectateurs.filter(s =>
    s.nom?.toLowerCase().includes(search.toLowerCase()) ||
    s.id?.toLowerCase().includes(search.toLowerCase())
  )

  const startEdit = (s) => {
    setEditing(s)
    setEditNom(s.nom || '')
    // Affiche en euros sans Math.round (sinon on perd les centimes : 2.50 → 3)
    setEditSolde((s.solde || 0) / 100)
  }

  const saveEdit = async () => {
    if (!editing?._docId) return
    if (!currentEventId) { alert("Aucun événement sélectionné."); return }
    // Garde-fou : seuls les admins peuvent modifier (en plus du masquage UI).
    // Note : la vraie sécurité doit être appliquée par les règles Firestore
    // côté serveur ; ceci n'est qu'un filet de sécurité supplémentaire.
    if (!canEdit) {
      alert("Vous n'avez pas le droit de modifier les spectateurs.")
      setEditing(null)
      return
    }
    setSaving(true)
    try {
      // Reconvertit en centimes avec arrondi pour éviter les flottants
      const soldeCentimes = Math.round((parseFloat(editSolde) || 0) * 100)
      await updateDoc(doc(db, 'events', currentEventId, 'spectateurs', editing._docId), {
        nom:   editNom.trim(),
        solde: soldeCentimes,
      })
      setEditing(null)
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (s) => {
    // Garde-fou : seuls les admins peuvent supprimer
    if (!canEdit) {
      alert("Vous n'avez pas le droit de supprimer un spectateur.")
      return
    }
    if (!window.confirm(`Supprimer le compte de ${s.nom} (${s.id}) ?\n\nCette action est irréversible.`)) return
    if (!currentEventId) { alert("Aucun événement sélectionné."); return }
    setDeleting(s.id)
    try {
      await deleteDoc(doc(db, 'events', currentEventId, 'spectateurs', s._docId))
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setDeleting(null) }
  }

  /**
   * Imprime une feuille d'accès :
   *   - Une carte par spectateur (4 par page A4 portrait, 2×2)
   *   - Logo + nom événement, nom du spectateur, son ID, QR code, lien direct
   *   - Si specsToPrint est null, imprime tous les filtrés ; sinon ce sous-ensemble
   */
  const printAccess = async (specsToPrint = null) => {
    const list = specsToPrint || filtered
    if (list.length === 0) { alert('Aucun spectateur à imprimer.'); return }
    setPrinting(true)
    try {
      const evLogo = currentEvent?.logoSrc || ''
      const evNom  = currentEvent?.nom || theme?.festName || 'YllaCash'
      const evId   = currentEventId || ''

      // Génère les QR codes en parallèle (en base64) — un par spectateur
      const cards = await Promise.all(list.map(async s => {
        const soldeUrl = `${window.location.origin}/solde?id=${s.id}${evId ? '&ev=' + evId : ''}`
        const qrDataUrl = await QRCode.toDataURL(soldeUrl, { width: 400, margin: 1, color: { dark: '#003048', light: '#FFFFFF' } })
        return { spec: s, soldeUrl, qrDataUrl }
      }))

      const evHeader = (evLogo || evNom)
        ? `<header class="page-header">
             ${evLogo ? `<img src="${evLogo}" alt="" class="ev-logo"/>` : ''}
             <div>
               <div class="ev-name">${evNom}</div>
               <div class="ev-sub">Accès spectateurs · ${list.length} compte${list.length>1?'s':''}</div>
             </div>
           </header>`
        : ''

      const cardsHtml = cards.map(({ spec, soldeUrl, qrDataUrl }) => `
        <div class="acc-card">
          <div class="acc-left">
            <div class="acc-badge">🎫 Accès spectateur</div>
            <div class="acc-name">${escapeHtml(spec.nom || '—')}</div>
            <div class="acc-id">ID : <code>${escapeHtml(spec.id || '')}</code></div>
            <div class="acc-solde">💰 Solde initial : <strong>${fmt(spec.solde || 0)}</strong></div>
            <div class="acc-instructions">
              <strong>Comment accéder à votre compte :</strong>
              <ol>
                <li>Scannez le QR code ci-contre avec votre téléphone</li>
                <li>Ou rendez-vous sur le lien direct ci-dessous</li>
              </ol>
            </div>
            <div class="acc-link">${escapeHtml(soldeUrl)}</div>
          </div>
          <div class="acc-right">
            <img src="${qrDataUrl}" alt="QR" class="acc-qr"/>
            <div class="acc-qr-cap">Présenter au stand</div>
          </div>
        </div>
      `).join('')

      const win = window.open('', '_blank')
      if (!win) { alert("Le navigateur a bloqué la popup. Autorisez les popups pour imprimer."); return }
      win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Accès spectateurs — ${escapeHtml(evNom)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 10mm; }
  body {
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
    background: #fff; color: #003048;
  }
  .page-header {
    display: flex; align-items: center; gap: 16px;
    padding: 12px 4px; margin-bottom: 14px;
    border-bottom: 3px solid #009090;
  }
  .ev-logo {
    width: 64px; height: 64px; border-radius: 14px; object-fit: cover; flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(0,48,72,0.20);
  }
  .ev-name { font-size: 24px; font-weight: 800; color: #003048; letter-spacing: -0.01em; }
  .ev-sub  { font-size: 13px; color: #4A6580; margin-top: 4px; }

  /* 2 cartes par page A4 portrait — empilées verticalement */
  .acc-grid {
    display: flex; flex-direction: column; gap: 14px;
  }
  .acc-card {
    border: 2px solid #009090; border-radius: 16px; padding: 18px 22px;
    display: flex; gap: 22px; align-items: center;
    page-break-inside: avoid; break-inside: avoid;
    background: linear-gradient(135deg, #FFFFFF 0%, #F8FCFC 100%);
    box-shadow: 0 2px 8px rgba(0,48,72,0.08);
  }
  /* Forcer 2 cartes par page (après la 2e, saut de page) */
  .acc-card:nth-child(2n) {
    page-break-after: always;
    break-after: page;
  }
  .acc-left { flex: 1; min-width: 0; }
  .acc-right { flex-shrink: 0; text-align: center; }

  .acc-badge {
    display: inline-block;
    padding: 3px 10px; border-radius: 12px;
    background: #009090; color: #fff;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  .acc-name {
    font-size: 22px; font-weight: 800; color: #003048;
    margin-bottom: 6px; letter-spacing: -0.01em;
  }
  .acc-id {
    font-size: 13px; color: #4A6580; margin-bottom: 4px;
    display: flex; align-items: center; gap: 6px;
  }
  .acc-id code {
    background: #FFF8F2; border: 1px solid #E5E0D6;
    padding: 3px 8px; border-radius: 5px;
    font-size: 13px; font-weight: 700; color: #003048;
    font-family: "Courier New", monospace;
  }
  .acc-solde {
    font-size: 14px; color: #4A6580; margin-bottom: 14px;
    display: flex; align-items: center; gap: 6px;
  }
  .acc-solde strong {
    color: #009090; font-size: 16px; font-weight: 800;
  }

  .acc-instructions {
    font-size: 13px; color: #003048; line-height: 1.6; margin-bottom: 10px;
    background: #FFF8F2; padding: 10px 14px; border-radius: 8px;
    border-left: 3px solid #D89030;
  }
  .acc-instructions strong { color: #D89030; }
  .acc-instructions ol { padding-left: 20px; margin-top: 4px; }
  .acc-instructions li { margin-bottom: 2px; }

  .acc-link {
    font-size: 10px; color: #4A6580; word-break: break-all;
    background: #FFF8F2; padding: 6px 10px; border-radius: 5px;
    font-family: "Courier New", monospace;
    border: 1px dashed #E5E0D6;
  }
  .acc-qr {
    width: 220px; height: 220px; border-radius: 10px;
    display: block; margin: 0 auto 8px;
    border: 4px solid #FFF; box-shadow: 0 4px 14px rgba(0,48,72,0.15);
  }
  .acc-qr-cap {
    font-size: 11px; color: #003048; text-transform: uppercase;
    letter-spacing: 0.10em; font-weight: 800;
    background: #FCEFD8; padding: 4px 10px; border-radius: 12px;
    display: inline-block;
  }
  footer.page-footer {
    margin-top: 16px; padding-top: 10px; border-top: 1px solid #eee;
    text-align: center; font-size: 10px; color: #94a3b8;
  }
  @media print {
    body { padding: 0; }
  }
</style></head><body>
${evHeader}
<div class="acc-grid">${cardsHtml}</div>
<footer class="page-footer">YllaCash ${APP_VERSION_LABEL} · Édité par <strong>Maison Ylla</strong></footer>
<script>window.onload = () => setTimeout(() => window.print(), 300)</script>
</body></html>`)
      win.document.close()
    } catch (e) {
      console.error(e)
      alert('Erreur lors de la génération de la feuille : ' + e.message)
    } finally {
      setPrinting(false)
    }
  }

  // Échappement HTML basique pour éviter les injections via nom de spectateur
  const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  const inp = {
    width: '100%', padding: '8px 10px',
    border: '0.5px solid var(--border2)', borderRadius: 8,
    fontSize: 13, background: 'var(--bg2)', color: 'var(--text)',
    fontFamily: 'var(--font)',
  }

  return (
    <div>
      {/* Bandeau "Lecture seule" pour les non-admins (billetterie, etc.) */}
      {!canEdit && (
        <div style={{
          background: 'var(--brand-light)',
          border: '0.5px solid var(--brand)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12,
          color: 'var(--brand-dark)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span>
            <strong>Lecture seule.</strong> Vous pouvez consulter et imprimer les accès, mais pas modifier ou supprimer les comptes.
          </span>
        </div>
      )}

      {/* Barre d'actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, color:'var(--muted)' }}>{filtered.length} spectateur{filtered.length>1?'s':''}{search && ` (filtré${filtered.length>1?'s':''})`}</div>
        <button onClick={() => printAccess()} disabled={printing || filtered.length === 0} className="btn-secondary" style={{ minHeight:38, padding:'0 14px' }}>
          <Printer size={14}/> {printing ? 'Génération…' : `Imprimer accès${search ? ' filtrés' : ' (tous)'}`}
        </button>
      </div>

      {/* Barre de recherche */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou ID…"
          style={{ ...inp, paddingLeft: 32 }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Stats rapides */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total spectateurs', value: spectateurs.length },
          { label: 'Solde total en circulation', value: fmt(spectateurs.reduce((a, s) => a + (s.solde || 0), 0)) },
          { label: 'Solde moyen', value: spectateurs.length ? fmt(Math.round(spectateurs.reduce((a, s) => a + (s.solde || 0), 0) / spectateurs.length)) : '—' },
          { label: 'Résultats filtrés', value: filtered.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {search ? `Aucun résultat pour "${search}"` : 'Aucun spectateur enregistré'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 480, fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['ID QR', 'Nom', 'Solde', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', borderBottom: '0.5px solid var(--border)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} style={{ background: editing?.id === s.id ? 'var(--brand-light)' : 'transparent' }}>

                    {/* ID QR */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <QrCode value={s.id} size={36}/>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{s.id}</span>
                      </div>
                    </td>

                    {/* Nom — éditable */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      {editing?.id === s.id ? (
                        <input
                          value={editNom}
                          onChange={e => setEditNom(e.target.value)}
                          style={{ ...inp, width: 160 }}
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.nom}</span>
                      )}
                    </td>

                    {/* Solde — éditable */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      {editing?.id === s.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => setEditSolde(v => Math.max(0, v - 10))}
                            style={{ width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                            <Minus size={12}/>
                          </button>
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={editSolde}
                            onChange={e => setEditSolde(Math.max(0, parseFloat(e.target.value) || 0))}
                            style={{ ...inp, width: 80, textAlign: 'center' }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>€</span>
                          <button onClick={() => setEditSolde(v => v + 10)}
                            style={{ width: 24, height: 24, borderRadius: 6, border: '0.5px solid var(--border2)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                            <Plus size={12}/>
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 600, color: (s.solde || 0) > 0 ? 'var(--brand-dark)' : 'var(--muted)' }}>
                          {fmt(s.solde || 0)}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px', borderBottom: '0.5px solid var(--border)' }}>
                      {editing?.id === s.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={saveEdit} disabled={saving}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <Save size={11}/> {saving ? '…' : 'Sauvegarder'}
                          </button>
                          <button onClick={() => setEditing(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <X size={11}/> Annuler
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap:'wrap' }}>
                          <button onClick={() => printAccess([s])} disabled={printing}
                            title="Imprimer la feuille d'accès"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--brand)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            <Printer size={11}/> Imprimer
                          </button>
                          {/* Modifier / Supprimer : réservés aux admins */}
                          {canEdit && (
                            <>
                              <button onClick={() => startEdit(s)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                                <Pencil size={11}/> Modifier
                              </button>
                              <button onClick={() => handleDelete(s)} disabled={deleting === s.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '0.5px solid var(--red)', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                                <Trash2 size={11}/> {deleting === s.id ? '…' : 'Supprimer'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
