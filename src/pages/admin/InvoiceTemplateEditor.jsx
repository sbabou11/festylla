/**
 * pages/admin/InvoiceTemplateEditor.jsx — Éditeur visuel de template facture (Lot B2)
 *
 * Page d'édition d'un template de facture avec interface drag-and-drop.
 *
 * État principal :
 *   - template : objet template (nom, format, elements[])
 *   - selectedId : id de l'élément sélectionné (ou null)
 *   - history : pile d'états pour undo/redo
 *   - zoom : pourcentage d'affichage (50-150%)
 *
 * Communication entre composants : props + callbacks. Pas de Redux ou Zustand
 * ici car l'état est local à cette page (éphémère jusqu'à sauvegarde).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import useEventStore from '../../store/useEventStore'
import useAppStore from '../../store/useAppStore'
import { DEFAULT_INVOICE_TEMPLATE, cloneTemplate, newElement } from '../../utils/factureTemplate'
import {
  saveInvoiceTemplate, getInvoiceTemplate, getSettings,
} from '../../firebase/service'
import { renderInvoiceFromTemplate } from '../../utils/factureRenderer'
import EditorToolbar     from '../../components/editor/EditorToolbar'
import EditorSidebarLeft from '../../components/editor/EditorSidebarLeft'
import EditorSidebarRight from '../../components/editor/EditorSidebarRight'
import EditorCanvas      from '../../components/editor/EditorCanvas'

// Limite de la pile undo/redo (au-delà, on coupe le plus ancien)
const MAX_HISTORY = 50

export default function InvoiceTemplateEditor({ onNavigate }) {
  const { currentEventId } = useEventStore()
  // Le templateId à éditer est stocké dans le store global (set par la page
  // qui appelle l'éditeur, par ex. liste des templates ou bouton Settings).
  // null = nouveau template, '__default__' = éditer copie du défaut.
  const templateId = useAppStore(s => s.editingTemplateId)
  // Callback de retour : retour vers la page d'origine (Settings ou liste templates).
  const onBack = () => onNavigate?.('settings')

  // ─── État du template courant ─────────────────────────────────────
  const [template, setTemplate]       = useState(null)
  const [selectedId, setSelectedId]   = useState(null)
  const [zoom, setZoom]               = useState(75)
  const [snapGrid, setSnapGrid]       = useState(true)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [savedFlash, setSavedFlash]   = useState(false)
  const [organisateur, setOrganisateur] = useState(null)

  // ─── Historique undo/redo ─────────────────────────────────────────
  // history.past : états précédents (du plus ancien au plus récent)
  // history.future : états abandonnés par un undo, repris par redo
  // Le state courant `template` n'est PAS dans la pile, c'est le "présent".
  const [history, setHistory] = useState({ past: [], future: [] })
  // Flag pour éviter d'enregistrer dans l'historique quand on applique undo/redo
  const skipHistoryRef = useRef(false)

  // ─── Chargement initial ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!currentEventId) return
      setLoading(true)
      try {
        // Charger l'organisateur pour pouvoir afficher des valeurs aperçues
        const s = await getSettings(currentEventId)
        if (cancelled) return
        setOrganisateur(s?.organisateur || null)

        // Charger le template (s'il a un id) ou utiliser le défaut
        if (templateId && templateId !== 'new' && templateId !== '__default__') {
          const tpl = await getInvoiceTemplate(templateId, currentEventId)
          if (!cancelled) setTemplate(tpl || cloneTemplate(DEFAULT_INVOICE_TEMPLATE))
        } else {
          // Nouveau template : on part du défaut comme base, mais sans son id réservé
          const base = cloneTemplate(DEFAULT_INVOICE_TEMPLATE)
          delete base.id // sera attribué à la sauvegarde
          delete base.isDefault
          base.nom = templateId === 'new' ? 'Nouveau template' : base.nom
          if (!cancelled) setTemplate(base)
        }
      } catch (e) {
        console.error('Chargement template échoué :', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [templateId, currentEventId])

  // ─── Push dans l'historique chaque fois que template change ──────
  // On capture l'état précédent dans `past` et on vide `future`.
  useEffect(() => {
    if (!template || skipHistoryRef.current) {
      skipHistoryRef.current = false
      return
    }
    setHistory(h => {
      // Si l'état actuel est identique au dernier dans past, ne rien faire
      const last = h.past[h.past.length - 1]
      if (last && JSON.stringify(last) === JSON.stringify(template)) return h
      const newPast = [...h.past, template].slice(-MAX_HISTORY)
      return { past: newPast, future: [] }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template])

  // ─── Mutations sur le template ────────────────────────────────────
  // Toutes les modifications passent par des helpers qui produisent
  // un nouvel objet immutable (pour que React détecte le changement).

  /**
   * Ajoute un nouvel élément du type donné au template.
   * Positionnement par défaut : 20mm/20mm + petit décalage si déjà présent.
   */
  const addElement = useCallback((type) => {
    setTemplate(t => {
      if (!t) return t
      const next = cloneTemplate(t)
      // Petit décalage pour éviter qu'un ajout consécutif se superpose au précédent
      const offset = (next.elements.length % 10) * 3
      const el = newElement(type, { x: 20 + offset, y: 20 + offset })
      next.elements.push(el)
      return next
    })
    // Sélection automatique du nouvel élément pour montrer ses propriétés
    setTimeout(() => {
      setTemplate(t => {
        if (t && t.elements.length > 0) {
          setSelectedId(t.elements[t.elements.length - 1].id)
        }
        return t
      })
    }, 0)
  }, [])

  /**
   * Met à jour les propriétés d'un élément (déplacement, redimensionnement,
   * édition de contenu, changement de style).
   */
  const updateElement = useCallback((id, patch) => {
    setTemplate(t => {
      if (!t) return t
      const next = cloneTemplate(t)
      const idx = next.elements.findIndex(e => e.id === id)
      if (idx < 0) return t
      next.elements[idx] = { ...next.elements[idx], ...patch }
      return next
    })
  }, [])

  const removeElement = useCallback((id) => {
    setTemplate(t => {
      if (!t) return t
      const next = cloneTemplate(t)
      next.elements = next.elements.filter(e => e.id !== id)
      return next
    })
    setSelectedId(null)
  }, [])

  const duplicateElement = useCallback((id) => {
    setTemplate(t => {
      if (!t) return t
      const next = cloneTemplate(t)
      const src = next.elements.find(e => e.id === id)
      if (!src) return t
      const copy = { ...src, id: 'el-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: src.x + 5, y: src.y + 5 }
      next.elements.push(copy)
      setTimeout(() => setSelectedId(copy.id), 0)
      return next
    })
  }, [])

  // Écoute des événements de drop depuis le canvas (drag-and-drop d'éléments
  // depuis la sidebar gauche). Le canvas dispatch un CustomEvent au drop pour
  // que nous ajoutions l'élément avec position exacte.
  useEffect(() => {
    const handler = (e) => {
      const el = e.detail
      if (!el) return
      setTemplate(t => {
        if (!t) return t
        const next = cloneTemplate(t)
        next.elements.push(el)
        return next
      })
      setTimeout(() => setSelectedId(e.detail.id), 0)
    }
    window.addEventListener('yc-editor-add-element', handler)
    return () => window.removeEventListener('yc-editor-add-element', handler)
  }, [])

  /**
   * Aligne tous les éléments sur la grille (5 mm).
   * Utile pour ranger un template "désordonné" d'un clic.
   */
  const alignToGrid = useCallback(() => {
    setTemplate(t => {
      if (!t) return t
      const next = cloneTemplate(t)
      next.elements = next.elements.map(el => ({
        ...el,
        x: Math.round(el.x / 5) * 5,
        y: Math.round(el.y / 5) * 5,
      }))
      return next
    })
  }, [])

  // ─── Undo / Redo ──────────────────────────────────────────────────
  const undo = useCallback(() => {
    setHistory(h => {
      if (h.past.length < 2) return h // au minimum 2 : initial + courant
      // Le state courant `template` n'est pas dans past, donc l'avant-dernier = état précédent
      const newPast = h.past.slice(0, -1)
      const target = newPast[newPast.length - 1]
      if (!target) return h
      skipHistoryRef.current = true
      setTemplate(cloneTemplate(target))
      setSelectedId(null)
      return { past: newPast, future: [h.past[h.past.length - 1], ...h.future] }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory(h => {
      if (h.future.length === 0) return h
      const [target, ...rest] = h.future
      skipHistoryRef.current = true
      setTemplate(cloneTemplate(target))
      setSelectedId(null)
      return { past: [...h.past, target], future: rest }
    })
  }, [])

  // ─── Raccourcis clavier ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Ne pas intercepter les raccourcis quand l'utilisateur tape dans un input
      const tag = (e.target.tagName || '').toLowerCase()
      const isEditable = tag === 'input' || tag === 'textarea' || e.target.isContentEditable
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo()
      } else if ((ctrl && e.key === 'y') || (ctrl && e.key === 'z' && e.shiftKey)) {
        e.preventDefault(); redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !isEditable) {
        e.preventDefault(); removeElement(selectedId)
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectedId, removeElement])

  // ─── Renommage / paramètres du template ──────────────────────────
  const setTemplateName = useCallback((nom) => {
    setTemplate(t => t ? { ...t, nom } : t)
  }, [])
  const setTemplateDefault = useCallback((isDefault) => {
    setTemplate(t => t ? { ...t, isDefault } : t)
  }, [])

  // ─── Sauvegarde ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!template || saving) return
    setSaving(true)
    try {
      const saved = await saveInvoiceTemplate(template, currentEventId)
      // On reçoit le template avec son id Firebase (peut être nouveau)
      setTemplate(prev => prev ? { ...prev, ...saved } : prev)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      alert('Erreur sauvegarde : ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Aperçu PDF ────────────────────────────────────────────────────
  // Génère un PDF avec des données factices pour visualiser le rendu réel.
  const handlePreview = async () => {
    if (!template) return
    const fakeExpo = {
      id: 'preview-001',
      nom: 'Aperçu — Exposant exemple',
      typeExposant: 'entreprise',
      identite: {
        raisonSociale: 'Société Exemple SARL',
        siret: '123 456 789 00012',
        tva: 'FR12345678901',
        email: 'contact@exemple.com',
        telephone: '06 12 34 56 78',
        adresse: '12 rue de la Démonstration',
        codePostal: '75000', ville: 'Paris',
      },
      thematiqueLabel: 'Artisanat',
      lignes: [
        { id: 'l1', description: 'Emplacement standard 3×3 m', qty: 1, prixUnit: 20000, total: 20000, tauxTva: null },
        { id: 'l2', description: 'Tonnelle supplémentaire',     qty: 2, prixUnit: 5000,  total: 10000, tauxTva: null },
        { id: 'l3', description: 'Branchement électrique',      qty: 1, prixUnit: 3000,  total: 3000,  tauxTva: null },
      ],
      montantTotal: 33000,
      acompte: { montant: 15000, date: new Date().toISOString().slice(0, 10), method: 'virement' },
      solde: null,
    }
    // Charger la config TVA pour que l'aperçu soit fidèle au rendu réel
    let tvaConfig = { active: false, defaultTaux: 0 }
    let tvaMentionExoneration = 'TVA non applicable, art. 293 B du CGI'
    try {
      const { getSettings } = await import('../../firebase/service')
      const s = await getSettings(currentEventId)
      tvaConfig = {
        active: !!s?.tvaActive,
        defaultTaux: Number(s?.tvaDefaultTaux) || 0,
      }
      if (typeof s?.tvaMentionExoneration === 'string' && s.tvaMentionExoneration.trim()) {
        tvaMentionExoneration = s.tvaMentionExoneration.trim()
      }
    } catch (e) { /* tvaConfig reste à false */ }

    renderInvoiceFromTemplate({
      template, expo: fakeExpo, organisateur: organisateur || {},
      eventId: currentEventId,
      tvaConfig, tvaMentionExoneration,
    })
  }

  // ─── Rendu ────────────────────────────────────────────────────────
  if (loading || !template) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
        Chargement de l'éditeur…
      </div>
    )
  }

  const selectedElement = template.elements.find(e => e.id === selectedId) || null
  const canUndo = history.past.length >= 2
  const canRedo = history.future.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Barre supérieure */}
      <EditorToolbar
        template={template}
        onBack={onBack}
        onNameChange={setTemplateName}
        onDefaultChange={setTemplateDefault}
        onUndo={undo} onRedo={redo}
        canUndo={canUndo} canRedo={canRedo}
        onAlignGrid={alignToGrid}
        onPreview={handlePreview}
        onSave={handleSave}
        saving={saving}
        savedFlash={savedFlash}
      />

      {/* Zone principale : 3 colonnes */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '180px 1fr 240px',
        gap: 8, padding: 8,
        overflow: 'hidden',
      }}>
        <EditorSidebarLeft
          onAdd={addElement}
          template={template}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <EditorCanvas
          template={template}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdate={updateElement}
          zoom={zoom}
          setZoom={setZoom}
          snapGrid={snapGrid}
          setSnapGrid={setSnapGrid}
        />
        <EditorSidebarRight
          element={selectedElement}
          onUpdate={(patch) => selectedId && updateElement(selectedId, patch)}
          onDuplicate={() => selectedId && duplicateElement(selectedId)}
          onDelete={() => selectedId && removeElement(selectedId)}
        />
      </div>
    </div>
  )
}
