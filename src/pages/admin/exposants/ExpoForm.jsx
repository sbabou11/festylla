/**
 * pages/admin/exposants/ExpoForm.jsx — création / édition d'un exposant
 * Identité (particulier ou entreprise), thématique, lignes facturables avec réductions
 * et TVA, réductions globales, acompte initial, commentaires.
 *
 * Validation : chaque champ se vérifie quand on le quitte ; « Enregistrer » reste cliquable
 * et, si quelque chose manque, affiche toutes les erreurs et place le focus sur la première.
 * Règles reprises telles quelles de la version précédente (aucune règle ajoutée).
 */
import React, { useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeft, Trash2, X, Plus, AlertCircle, Save, Percent, RotateCcw } from 'lucide-react'
import { createExposition, updateExposition } from '../../../firebase/service'
import {
  PAYMENT_METHODS, TYPE_EXPOSANT, defaultIdentite, newLigne, getExpoLignes,
} from '../../../utils/expositions'
import { Button, Card, Field, Tabs, focusFirstInvalid, toast } from '../../../ui'
import { friendlyError } from '../../../utils/errors'
import s from './exposants.module.css'

const eur = (cts) => `${((cts || 0) / 100).toFixed(2)} €`

export default function ExpoForm({ expo, thematiques, tvaConfig, eventId, onBack, onSaved }) {
  const isEdit = !!expo
  const formRef = useRef(null)
  const [tried, setTried] = useState(false)

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
    if (lignes.length <= 1) { toast.warning('Au moins une ligne doit rester.'); return }
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

  // ─── Règles de validation (identiques à la version précédente) ────
  const raisonErr = typeExposant === 'entreprise' && !identite.raisonSociale?.trim()
    ? 'La raison sociale est requise pour une entreprise' : null
  const nomErr = typeExposant !== 'entreprise' && !identite.prenom?.trim() && !identite.nom?.trim()
    ? 'Le nom (et/ou prénom) du particulier est requis' : null
  const totalErr = totalCalcule <= 0 ? 'Le montant total doit être supérieur à 0' : null
  // Au moins 1 ligne valide : si aucune, l'erreur s'affiche sur la première ligne
  const lignesValides = lignes.filter(l => l.description?.trim() && (Number(l.prixUnit) || 0) > 0)
  const noLine = lignesValides.length === 0
  const lineDescErr = (i) => noLine && i === 0 && !lignes[0]?.description?.trim() ? 'Indique une description' : null
  const linePrixErr = (i) => noLine && i === 0 && !((Number(lignes[0]?.prixUnit) || 0) > 0) ? 'Indique un prix supérieur à 0' : null
  const acompteCts = Math.round((parseFloat(acompteEur.replace(',', '.')) || 0) * 100)
  // Si TVA active, l'acompte est comparé au TTC (= ce que le client paie)
  const limiteAcompte = tvaConfig?.active ? tvaLive.totalTTC : totalCalcule
  const acompteErr = !isEdit && acompteCts > limiteAcompte ? 'L\'acompte ne peut pas dépasser le total' : null

  // ─── Soumission ───────────────────────────────────────────────────
  const submit = async () => {
    if (raisonErr || nomErr || totalErr || noLine || acompteErr) {
      setTried(true)
      focusFirstInvalid(formRef.current)
      return
    }

    const thematiqueLabel = thematiques.find(t => t.id === thematiqueId)?.label || ''

    setLoading(true)
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
        toast.success('Exposant enregistré')
        onSaved(expo.id)
      } else {
        const created = await createExposition({
          ...payload,
          acompteInitial: acompteCts,
          acompteMethod,
        }, eventId)
        toast.success('Exposant créé')
        onSaved(created.id)
      }
    } catch (e) { toast.error(friendlyError(e, "L'exposant n'a pas été enregistré.")) }
    finally { setLoading(false) }
  }

  // Champ texte d'identité : libellé au-dessus, jamais de texte d'exemple en guise de libellé
  const idField = (key, label, maxLength, { type = 'text', error = null, required = false, hint, className, autoComplete } = {}) => (
    <Field label={label} hint={hint} className={className}
      error={error} valid={required && !error && !!identite[key]?.trim()} showError={tried}>
      <input type={type} value={identite[key]} onChange={e => updId(key, e.target.value)}
        maxLength={maxLength} autoComplete={autoComplete}/>
    </Field>
  )

  return (
    <div className={clsx(s.page, s.medium)}>
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} className={s.back}>Retour</Button>

      <Card title={isEdit ? 'Modifier l\'exposant' : 'Nouvel exposant'}>
        <div ref={formRef} className={s.form}>

          {thematiques.length === 0 && (
            <div className={s.dangerBox} role="note">
              <AlertCircle size={16} aria-hidden="true" className={s.boxIcon}/>
              <span>Aucune thématique configurée. Allez dans <strong>Paramètres</strong> pour en créer.</span>
            </div>
          )}

          {/* ─── Section 1 : type + identité ─────────────────────── */}
          <section className={s.section}>
            <h3 className={s.sectionTitle}>Type d'exposant</h3>
            <Tabs label="Type d'exposant" value={typeExposant} onChange={setTypeExposant}
              items={TYPE_EXPOSANT.map(t => ({ value: t.id, label: t.label }))}/>

            {/* Champs identité conditionnels au type */}
            {typeExposant === 'entreprise' ? (
              <>
                {idField('raisonSociale', 'Raison sociale', 120, { error: raisonErr, required: true, autoComplete: 'organization' })}
                <div className={s.grid2}>
                  {idField('siret', 'SIRET', 20, { hint: '14 chiffres, ex. 123 456 789 00012' })}
                  {idField('tva', 'N° TVA', 20, { hint: 'Ex. FR12345678901' })}
                  {idField('rcs', 'RCS (ville)', 60, { hint: 'Ex. Paris B 123 456 789' })}
                  {idField('dirigeant', 'Dirigeant / Contact', 80)}
                </div>
              </>
            ) : (
              <div className={s.grid2}>
                {idField('prenom', 'Prénom', 60, { required: true, error: null, autoComplete: 'given-name' })}
                {idField('nom', 'Nom', 60, { required: true, error: nomErr, hint: 'Le nom ou le prénom suffit.', autoComplete: 'family-name' })}
              </div>
            )}

            {/* Adresse + contact (communs aux 2 types) */}
            {idField('adresse', 'Adresse', 120, { autoComplete: 'street-address' })}
            <div className={s.gridCity}>
              {idField('codePostal', 'Code postal', 10, { autoComplete: 'postal-code' })}
              {idField('ville', 'Ville', 60, { autoComplete: 'address-level2' })}
            </div>
            <div className={s.grid2}>
              {idField('email', 'Email', 120, { type: 'email', autoComplete: 'email' })}
              {idField('telephone', 'Téléphone', 30, { type: 'tel', autoComplete: 'tel' })}
            </div>
          </section>

          {/* ─── Section 2 : thématique ──────────────────────────── */}
          <section className={s.section}>
            <h3 className={s.sectionTitle}>Thématique d'exposition</h3>
            <Field label="Thématique (optionnel)">
              <select value={thematiqueId} onChange={e => setThematiqueId(e.target.value)}
                disabled={thematiques.length === 0}>
                <option value="">— Aucune thématique —</option>
                {thematiques.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label} {t.tarif > 0 ? `— ${(t.tarif / 100).toFixed(2)} €` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          {/* ─── Section 3 : lignes facturables ──────────────────── */}
          <section className={s.section}>
            <h3 className={s.sectionTitle}>Lignes facturables</h3>
            <div className={s.lines}>
              {lignes.map((l, i) => {
                const brut = (Number(l.qty) || 0) * (Number(l.prixUnit) || 0)
                const net = Number(l.total) || brut
                const hasReduction = !!(l.reduction && (Number(l.reduction.value) || 0) > 0)
                const descErr = lineDescErr(i), prixErr = linePrixErr(i)
                return (
                  <div key={l.id} className={clsx(s.line, hasReduction && s.lineReduced)}>
                    {/* Ligne principale */}
                    <div className={s.lineRow}>
                      <Field label="Description" className={s.lineDesc} error={descErr} showError={tried}>
                        <input type="text" value={l.description}
                          onChange={e => updateLigne(i, 'description', e.target.value)}/>
                      </Field>
                      <Field label="Qté" className={s.lineQty}>
                        <input type="number" min="1" value={l.qty}
                          onChange={e => updateLigne(i, 'qty', e.target.value)}/>
                      </Field>
                      <Field label="Prix unitaire (€)" className={s.linePu} error={prixErr} showError={tried}>
                        <input type="text" inputMode="decimal" className={s.right}
                          value={(l._prixEur != null) ? l._prixEur : ((l.prixUnit || 0) / 100).toFixed(2)}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9.,]/g, '')
                            setLignes(prev => prev.map((x, idx) => idx === i ? { ...x, _prixEur: v } : x))
                            const cts = Math.round((parseFloat(v.replace(',', '.')) || 0) * 100)
                            updateLigne(i, 'prixUnit', cts)
                          }}/>
                      </Field>
                      <div className={s.lineTotal}>
                        <span className={s.lineTotalLabel}>Total</span>
                        <span className={clsx(s.num, hasReduction && s.brandText)}>{eur(net)}</span>
                      </div>
                      <Button variant="ghost" size="sm" iconOnly icon={Trash2}
                        className={clsx(s.lineDel, lignes.length > 1 && s.dangerIcon)}
                        onClick={() => removeLigne(i)} disabled={lignes.length <= 1}
                        aria-label={`Supprimer la ligne ${i + 1}`} title="Supprimer cette ligne"/>
                    </div>

                    {/* Sous-ligne réduction (Lot C1+C2) — affichée si une réduction existe,
                        masquée sinon mais accessible via le bouton "Ajouter une réduction" */}
                    {hasReduction || l.reduction ? (
                      <ReductionRow
                        title="Réduction sur la ligne"
                        type={l.reduction.type}
                        display={l.reduction._valueDisplay != null
                          ? l.reduction._valueDisplay
                          : (l.reduction.type === 'percent'
                              ? String(l.reduction.value)
                              : ((l.reduction.value || 0) / 100).toFixed(2))}
                        label={l.reduction.label || ''}
                        labelHint="Ex. remise"
                        deduit={brut - net}
                        onType={type => updateLigneReduction(i, { type })}
                        onValue={txt => {
                          const numeric = parseFloat(txt.replace(',', '.')) || 0
                          const newValue = l.reduction.type === 'percent'
                            ? Math.min(100, numeric)
                            : Math.round(numeric * 100)
                          updateLigneReduction(i, { value: newValue, _valueDisplay: txt })
                        }}
                        onLabel={label => updateLigneReduction(i, { label })}
                        onRemove={() => updateLigneReduction(i, { type: 'none' })}
                        removeTitle="Retirer la réduction"
                      />
                    ) : (
                      <Button variant="ghost" size="sm" icon={Percent} className={s.linkBtn}
                        onClick={() => updateLigneReduction(i, { type: 'percent', value: 0, _valueDisplay: '' })}>
                        Ajouter une réduction
                      </Button>
                    )}

                    {/* Sous-ligne TVA (Lot C3) — visible seulement si la TVA est activée
                        au niveau événement. Permet d'override le taux par défaut. */}
                    {tvaConfig?.active && (
                      <div className={s.tvaRow}>
                        <Field label="TVA (%)" className={s.tvaField}
                          hint={l.tauxTva == null ? `Taux par défaut : ${tvaConfig.defaultTaux} %` : undefined}>
                          <input type="number" step="0.1" min="0" max="100"
                            value={l.tauxTva ?? ''}
                            onChange={e => updateLigneTva(i, e.target.value)}/>
                        </Field>
                        {l.tauxTva != null && (
                          <>
                            <span className={s.tvaAmount}>= {((net * (Number(l.tauxTva) || 0) / 100) / 100).toFixed(2)} €</span>
                            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => updateLigneTva(i, null)}
                              title="Revenir au taux par défaut">
                              Taux par défaut
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              <Button variant="secondary" icon={Plus} block onClick={addLigne}>Ajouter une ligne</Button>

              {/* Sous-total (avant réductions globales) */}
              <div className={s.sumRow}>
                <span className={s.overline}>Sous-total</span>
                <span className={s.num}>{eur(sousTotalCalcule)}</span>
              </div>

              {/* Réductions globales (Lot C1+C2) */}
              {reductionsGlobales.map((r, i) => (
                <ReductionRow key={i}
                  title={`Réduction globale n° ${i + 1}`}
                  boxed
                  type={r.type}
                  display={r._valueDisplay != null
                    ? r._valueDisplay
                    : (r.type === 'percent' ? String(r.value) : ((r.value || 0) / 100).toFixed(2))}
                  label={r.label || ''}
                  labelHint="Ex. remise fidélité"
                  deduit={reductionsApplied[i] || 0}
                  onType={type => updateReductionGlobale(i, { type, _valueDisplay: '' })}
                  onValue={txt => {
                    const numeric = parseFloat(txt.replace(',', '.')) || 0
                    const newValue = r.type === 'percent'
                      ? Math.min(100, numeric)
                      : Math.round(numeric * 100)
                    updateReductionGlobale(i, { value: newValue, _valueDisplay: txt })
                  }}
                  onLabel={label => updateReductionGlobale(i, { label })}
                  onRemove={() => removeReductionGlobale(i)}
                  removeTitle="Retirer cette réduction"
                />
              ))}
              {reductionsGlobales.length < 2 && (
                <Button variant="ghost" size="sm" icon={Plus} className={s.linkBtn} onClick={addReductionGlobale}>
                  Ajouter une réduction globale ({reductionsGlobales.length}/2)
                </Button>
              )}

              {/* Total final */}
              {tvaConfig?.active ? (
                // Mode TVA actif : afficher HT → ventilation TVA → TTC
                <div className={s.totals}>
                  <div className={s.sumRow}>
                    <span className={s.muted}>Total HT</span>
                    <span className={s.num}>{eur(totalCalcule)}</span>
                  </div>
                  {Object.entries(tvaLive.ventilation).map(([taux, v]) => (
                    <div key={taux} className={clsx(s.sumRow, s.small)}>
                      <span>TVA {taux} % sur {eur(v.baseHT)}</span>
                      <span className={s.num}>+ {eur(v.montantTva)}</span>
                    </div>
                  ))}
                  <div className={clsx(s.sumRow, s.grand)}>
                    <span className={s.overline}>Total TTC</span>
                    <span className={s.grandValue}>{eur(tvaLive.totalTTC)}</span>
                  </div>
                  <p className={clsx(s.small, s.rightText)}>Le montant facturé final est le TTC.</p>
                </div>
              ) : (
                // Mode sans TVA : affichage simple total
                <div className={clsx(s.sumRow, s.grand)}>
                  <span className={s.overline}>Total</span>
                  <span className={s.grandValue}>{eur(totalCalcule)}</span>
                </div>
              )}

              {/* Total nul : erreur de formulaire (couleur + icône + texte), focusable */}
              {tried && totalErr && (
                <p className={s.formError} tabIndex={-1} aria-invalid="true">
                  <AlertCircle size={14} aria-hidden="true"/> {totalErr}
                </p>
              )}
            </div>
          </section>

          {/* ─── Section 4 : acompte initial (création) ──────────── */}
          {!isEdit && (
            <section className={s.section}>
              <h3 className={s.sectionTitle}>Acompte à la création (optionnel)</h3>
              <div className={s.grid2}>
                <Field label="Montant de l'acompte (€)" hint="Laisser vide s'il n'y a pas d'acompte."
                  error={acompteErr} valid={acompteCts > 0 && !acompteErr} showError={tried}>
                  <input type="text" inputMode="decimal" value={acompteEur}
                    onChange={e => setAcompteEur(e.target.value.replace(/[^0-9.,]/g, ''))}/>
                </Field>
                {parseFloat(acompteEur.replace(',', '.')) > 0 && (
                  <Field label="Mode de paiement">
                    <select value={acompteMethod} onChange={e => setAcompteMethod(e.target.value)}>
                      {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </section>
          )}

          {/* ─── Section 5 : commentaires ────────────────────────── */}
          <section className={s.section}>
            <h3 className={s.sectionTitle}>Commentaires</h3>
            <Field label="Notes / exceptions" hint="Ex. réduction de 10 % accordée, conditions particulières…">
              <textarea value={commentaires} onChange={e => setCommentaires(e.target.value)}
                maxLength={500} rows={3}/>
            </Field>
          </section>

          <div className={s.actionsRow}>
            <Button variant="secondary" onClick={onBack} disabled={loading} className={s.grow}>Annuler</Button>
            <Button icon={Save} onClick={submit} loading={loading} className={s.grow}>Enregistrer</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// Réduction (sur une ligne ou globale) : type %, valeur, libellé, montant déduit
function ReductionRow({ title, boxed, type, display, label, labelHint, deduit, onType, onValue, onLabel, onRemove, removeTitle }) {
  return (
    <div className={clsx(s.reduc, boxed && s.reducBoxed)} role="group" aria-label={title}>
      <span className={s.reducTitle}>{title}</span>
      <div className={s.reducRow}>
        <Field label="Type" className={s.reducType}>
          <select value={type} onChange={e => onType(e.target.value)}>
            <option value="percent">%</option>
            <option value="amount">€</option>
          </select>
        </Field>
        <Field label={type === 'percent' ? 'Valeur (%)' : 'Valeur (€)'} className={s.reducValue}>
          <input type="text" inputMode="decimal" className={s.right} value={display}
            onChange={e => onValue(e.target.value.replace(/[^0-9.,]/g, ''))}/>
        </Field>
        <Field label="Libellé (optionnel)" hint={labelHint} className={s.reducLabel}>
          <input type="text" value={label} maxLength={40} onChange={e => onLabel(e.target.value)}/>
        </Field>
        <span className={clsx(s.num, s.brandText, s.reducAmount)}>-{eur(deduit)}</span>
        <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onRemove}
          className={s.reducDel} aria-label={removeTitle} title={removeTitle}/>
      </div>
    </div>
  )
}
