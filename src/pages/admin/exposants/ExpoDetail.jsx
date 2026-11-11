/**
 * pages/admin/exposants/ExpoDetail.jsx — vue détail d'un exposant
 * Identité, paiements (saisie, modification, annulation), forçage de statut (admin),
 * documents PDF, décharges signées, pièces jointes.
 * Les actions irréversibles (suppression, annulation de paiement) se confirment en maintenant le bouton.
 */
import React, { useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Plus, ArrowLeft, Edit2, Trash2, Check, X, FileText, Mail, Phone, MapPin,
  ShieldCheck, AlertTriangle, Eye, EyeOff, CreditCard, Save, RotateCcw,
} from 'lucide-react'
import useAuthStore from '../../../store/useAuthStore'
import {
  deleteExposition, registerExpoPayment, removeExpoPayment,
} from '../../../firebase/service'
import {
  computeExpoStatut, computeExpoRestant,
  STATUT_LABEL, PAYMENT_METHODS, METHOD_LABEL,
  isExpoStatutForce, TYPE_LABEL, expoDisplayName, getExpoLignes,
} from '../../../utils/expositions'
import { Badge, Button, Card, Dialog, Field, focusFirstInvalid, toast } from '../../../ui'
import { friendlyError } from '../../../utils/errors'
import ExpoDocuments from '../../../components/expo/ExpoDocuments'
import ExpoPDFButtons from '../../../components/expo/ExpoPDFButtons'
import ConfirmDialog from '../../../components/expo/ConfirmDialog'
import StatutBadge, { STATUT_TONE } from './StatutBadge'
import s from './exposants.module.css'

const eur = (cts) => `${((cts || 0) / 100).toFixed(2)} €`
// Saisie en euros (virgule ou point) → centimes, même calcul qu'avant
const toCentimes = (txt) => Math.round((parseFloat(String(txt).replace(',', '.')) || 0) * 100)
const montantErr = (txt) => toCentimes(txt) <= 0 ? 'Montant invalide : il doit être supérieur à 0' : null

export default function ExpoDetail({ expo, organisateur, eventId, onBack, onEdit }) {
  const { user } = useAuthStore()
  const canForceStatut = user && ['admin', 'super_admin'].includes(user.role)

  const [showPaymentForm, setShowPaymentForm] = useState(null) // 'acompte' | 'solde' | null
  const [paymentMontant, setPaymentMontant]   = useState('')
  const [paymentDate, setPaymentDate]         = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod]     = useState('cash')
  const [loading, setLoading]                 = useState(false)
  const [payTried, setPayTried]               = useState(false)
  const payRef = useRef(null)

  // ─── Édition d'un paiement existant (Étape 2) ────────────────────
  // Fenêtre qui s'ouvre au clic sur le crayon d'un paiement. Permet de modifier
  // montant / date / méthode (la date peut être passée).
  const [editPaymentKind, setEditPaymentKind] = useState(null) // 'acompte'|'solde'|null
  const [editMontant, setEditMontant] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editMethod, setEditMethod] = useState('cash')
  const [editLoading, setEditLoading] = useState(false)
  const [editTried, setEditTried] = useState(false)
  const editRef = useRef(null)

  const openEditPayment = (kind) => {
    const p = expo[kind]
    if (!p) return
    setEditPaymentKind(kind)
    setEditMontant(((p.montant || 0) / 100).toFixed(2))
    setEditDate(p.date || new Date().toISOString().slice(0, 10))
    setEditMethod(p.method || 'cash')
    setEditTried(false)
  }

  const submitEditPayment = async () => {
    const centimes = toCentimes(editMontant)
    if (centimes <= 0) { setEditTried(true); focusFirstInvalid(editRef.current); return }
    setEditLoading(true)
    try {
      const { editExpoPayment } = await import('../../../firebase/service')
      await editExpoPayment(expo.id, editPaymentKind, {
        montant: centimes,
        date: editDate,
        method: editMethod,
      }, eventId)
      setEditPaymentKind(null)
      toast.success('Paiement modifié')
    } catch (e) {
      toast.error(friendlyError(e, "Le paiement n'a pas été modifié."))
    } finally {
      setEditLoading(false)
    }
  }

  // ─── Forçage de statut (admin/super_admin) ───────────────────────
  // Fenêtre qui s'ouvre au clic sur "Forcer le statut".
  // Demande un statut cible + un motif (≥ 3 caractères).
  const [showForceModal, setShowForceModal]   = useState(false)
  const [forceStatutVal, setForceStatutVal]   = useState('paye')
  const [forceMotif, setForceMotif]           = useState('')
  const [forceLoading, setForceLoading]       = useState(false)
  const [forceTried, setForceTried]           = useState(false)
  const [confirmClearForce, setConfirmClearForce] = useState(false)
  const forceRef = useRef(null)
  const motifErr = forceMotif.trim().length < 3 ? 'Le motif doit faire au moins 3 caractères.' : null

  const openForce = (statutVal, motif) => {
    setForceStatutVal(statutVal); setForceMotif(motif); setForceTried(false); setShowForceModal(true)
  }

  const submitForce = async () => {
    if (motifErr) { setForceTried(true); focusFirstInvalid(forceRef.current); return }
    setForceLoading(true)
    try {
      const { forceExpoStatut } = await import('../../../firebase/service')
      await forceExpoStatut(expo.id, forceStatutVal, forceMotif, {
        staffNom: user?.nom || user?.email || 'Admin',
        staffUid: user?.id || null,
      }, eventId)
      setShowForceModal(false)
      setForceMotif('')
      toast.success('Statut forcé')
    } catch (e) {
      toast.error(friendlyError(e, "Le statut n'a pas été forcé."))
    } finally {
      setForceLoading(false)
    }
  }

  const submitClearForce = async () => {
    try {
      const { clearExpoStatutForce } = await import('../../../firebase/service')
      await clearExpoStatutForce(expo.id, {
        staffNom: user?.nom || user?.email || 'Admin',
        staffUid: user?.id || null,
      }, eventId)
      toast.success('Forçage retiré')
    } catch (e) { toast.error(friendlyError(e, "Le forçage n'a pas été retiré.")); throw e }
  }

  const statut = computeExpoStatut(expo)
  const restant = computeExpoRestant(expo)
  const forced = isExpoStatutForce(expo)

  const openPayment = (kind) => {
    setShowPaymentForm(kind)
    setPaymentMontant((restant / 100).toFixed(2))
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentMethod('cash')
    setPayTried(false)
  }

  const submitPayment = async () => {
    const centimes = toCentimes(paymentMontant)
    if (centimes <= 0) { setPayTried(true); focusFirstInvalid(payRef.current); return }
    setLoading(true)
    try {
      await registerExpoPayment(expo.id, showPaymentForm, {
        montant: centimes, date: paymentDate, method: paymentMethod,
      }, eventId)
      setShowPaymentForm(null)
      toast.success('Paiement enregistré')
    } catch (e) { toast.error(friendlyError(e, "Le paiement n'a pas été enregistré.")) }
    finally { setLoading(false) }
  }

  // Confirmations (remplacent confirm())
  const [cancelKind, setCancelKind] = useState(null)     // 'acompte' | 'solde' | null
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleCancelPayment = async (kind) => {
    try { await removeExpoPayment(expo.id, kind, eventId); toast.success('Paiement annulé') }
    catch (e) { toast.error(friendlyError(e, "Le paiement n'a pas été annulé.")); throw e }
  }

  const handleDelete = async () => {
    try { await deleteExposition(expo.id, eventId); onBack() }
    catch (e) { toast.error(friendlyError(e, "L'exposant n'a pas été supprimé.")); throw e }
  }

  const lignes = getExpoLignes(expo)
  const id = expo.identite || {}

  return (
    <div className={clsx(s.page, s.narrow)}>

      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} className={s.back}>Retour</Button>

      {/* Carte identité */}
      <Card>
        <div className={s.stack}>
          <div className={s.idHead}>
            <div className={s.idMain}>
              {/* Badge type + nom d'affichage calculé */}
              <Badge tone={expo.typeExposant === 'entreprise' ? 'brand' : 'neutral'}>
                {TYPE_LABEL[expo.typeExposant] || 'Particulier'}
              </Badge>
              <h2 className={s.idName}>{expoDisplayName(expo)}</h2>
              {expo.thematiqueLabel && <p className={s.muted}>{expo.thematiqueLabel}</p>}
            </div>
            <StatutBadge expo={expo} statut={statut} detailed/>
          </div>

          {/* Infos entreprise (si applicable) */}
          {expo.typeExposant === 'entreprise' && (id.siret || id.tva || id.dirigeant) && (
            <dl className={s.facts}>
              {id.siret     && <div><dt>SIRET</dt><dd>{id.siret}</dd></div>}
              {id.tva       && <div><dt>TVA</dt><dd>{id.tva}</dd></div>}
              {id.dirigeant && <div><dt>Dirigeant</dt><dd>{id.dirigeant}</dd></div>}
            </dl>
          )}

          {/* Contact */}
          <ul className={s.contact}>
            {id.email && <li><Mail size={14} aria-hidden="true"/> {id.email}</li>}
            {id.telephone && <li><Phone size={14} aria-hidden="true"/> {id.telephone}</li>}
            {(id.adresse || id.ville) && (
              <li><MapPin size={14} aria-hidden="true"/> {[id.adresse, id.codePostal, id.ville].filter(Boolean).join(', ')}</li>
            )}
            {/* Fallback : ancien champ contact (legacy) */}
            {!id.email && !id.telephone && expo.contact && (
              <li><Mail size={14} aria-hidden="true"/> {expo.contact}</li>
            )}
          </ul>

          {/* Bandeau d'info si statut forcé */}
          {forced && (
            <div className={s.warnBox} role="note">
              <AlertTriangle size={16} aria-hidden="true" className={s.boxIcon}/>
              <div className={s.grow}>
                <div className={s.strong}>Statut forcé manuellement</div>
                <div><strong>Motif :</strong> {expo.forcedStatutMotif || '—'}</div>
                {expo.forcedStatutBy?.nom && (
                  <div className={s.small}>
                    Par {expo.forcedStatutBy.nom}
                    {expo.forcedStatutBy.at && ' le ' + new Date(expo.forcedStatutBy.at).toLocaleDateString('fr-FR')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lignes facturables détaillées */}
          {lignes.length > 0 && (
            <div className={s.subBox}>
              <h3 className={s.overline}>Détail des frais</h3>
              <ul className={s.feeList}>
                {lignes.map((l, i) => (
                  <li key={l.id || i} className={s.feeRow}>
                    <span className={s.ellipsis}><strong>{l.qty}×</strong> {l.description}</span>
                    <span className={s.feeAmounts}>{eur(l.prixUnit)} → {eur(l.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {expo.commentaires && <p className={s.comment}>{expo.commentaires}</p>}

          <div className={s.actionsRow}>
            <Button variant="secondary" icon={Edit2} onClick={onEdit} className={s.grow}>Modifier</Button>
            <Button variant="danger" icon={Trash2} iconOnly onClick={() => setConfirmDelete(true)}
              aria-label="Supprimer l'exposant" title="Supprimer l'exposant"/>
          </div>
        </div>
      </Card>

      {/* Bloc paiements */}
      <Card title={<span className={s.cardTitle}><CreditCard size={16} aria-hidden="true"/>Paiements</span>}>
        <div className={s.stack}>
          <div>
            <PaymentLine label="Total dû" value={eur(expo.montantTotal)} bold/>

            {expo.acompte ? (
              <PaymentRecord label="Acompte" payment={expo.acompte}
                onEdit={() => openEditPayment('acompte')} onCancel={() => setCancelKind('acompte')}/>
            ) : <PaymentLine label="Acompte" value="—" muted/>}

            {expo.solde ? (
              <PaymentRecord label="Solde" payment={expo.solde}
                onEdit={() => openEditPayment('solde')} onCancel={() => setCancelKind('solde')}/>
            ) : <PaymentLine label="Solde" value="—" muted/>}

            <div className={clsx(s.restant, restant > 0 ? s.restantDue : s.restantOk)}>
              <span>{restant > 0 ? 'Restant dû' : <><Check size={16} aria-hidden="true"/> Soldé</>}</span>
              <span className={s.restantValue}>{eur(restant)}</span>
            </div>
          </div>

          {/* Formulaire de saisie d'un paiement */}
          {showPaymentForm && (
            <div ref={payRef} className={s.subBox}>
              <h3 className={s.subTitle}>Enregistrer {showPaymentForm === 'acompte' ? 'un acompte' : 'le solde'}</h3>
              <PaymentFields
                montant={paymentMontant} setMontant={setPaymentMontant}
                date={paymentDate} setDate={setPaymentDate}
                method={paymentMethod} setMethod={setPaymentMethod}
                tried={payTried}/>
              <div className={s.actionsRow}>
                <Button variant="secondary" onClick={() => setShowPaymentForm(null)} disabled={loading} className={s.grow}>Annuler</Button>
                <Button icon={Save} onClick={submitPayment} loading={loading} className={s.grow}>Enregistrer</Button>
              </div>
            </div>
          )}

          {!showPaymentForm && restant > 0 && (
            <Button icon={Plus} block onClick={() => openPayment(expo.acompte ? 'solde' : 'acompte')}>
              Enregistrer {expo.acompte ? 'le solde' : 'un acompte'}
            </Button>
          )}

          {/* Forçage manuel de statut (admin/super_admin) */}
          {canForceStatut && (
            <div className={s.forceRow}>
              {forced ? (
                <>
                  <Button variant="secondary" size="sm" icon={AlertTriangle} className={s.grow}
                    onClick={() => openForce(expo.forcedStatut, expo.forcedStatutMotif || '')}>
                    Modifier le forçage
                  </Button>
                  <Button variant="danger" size="sm" icon={RotateCcw} className={s.grow}
                    onClick={() => setConfirmClearForce(true)}>
                    Retirer le forçage
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" icon={AlertTriangle} block
                  onClick={() => openForce('paye', '')}>
                  Forcer manuellement le statut
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Fenêtre d'édition de paiement (Étape 2) */}
      <Dialog
        open={!!editPaymentKind}
        title={`Modifier ${editPaymentKind === 'acompte' ? "l'acompte" : 'le solde'}`}
        onClose={() => !editLoading && setEditPaymentKind(null)}
        footer={
          <div className={s.dialogActions}>
            <Button variant="secondary" onClick={() => setEditPaymentKind(null)} disabled={editLoading}>Annuler</Button>
            <Button icon={Save} onClick={submitEditPayment} loading={editLoading}>Enregistrer</Button>
          </div>
        }
      >
        <div ref={editRef} className={s.stack}>
          <p className={s.muted}>
            Vous pouvez modifier le montant, la date et le mode de paiement.
            La date peut être dans le passé pour rattraper un paiement non-enregistré.
          </p>
          <PaymentFields
            montant={editMontant} setMontant={setEditMontant}
            date={editDate} setDate={setEditDate}
            method={editMethod} setMethod={setEditMethod}
            tried={editTried}/>
        </div>
      </Dialog>

      {/* Fenêtre de forçage de statut */}
      <Dialog
        open={showForceModal}
        title="Forcer le statut de paiement"
        onClose={() => !forceLoading && setShowForceModal(false)}
        footer={
          <div className={s.dialogActions}>
            <Button variant="secondary" onClick={() => setShowForceModal(false)} disabled={forceLoading}>Annuler</Button>
            <Button icon={AlertTriangle} onClick={submitForce} loading={forceLoading}>Forcer le statut</Button>
          </div>
        }
      >
        <div ref={forceRef} className={s.stack}>
          <p className={s.muted}>
            Le statut affiché sera différent du calcul automatique basé sur les montants.
            Cette action est tracée dans l'audit.
          </p>
          <div className={s.fieldGroup}>
            <span className={s.groupLabel} id="force-statut-label">Statut cible</span>
            <div className={s.choice} role="radiogroup" aria-labelledby="force-statut-label">
              {['paye', 'acompte', 'impaye'].map(st => (
                <button key={st} type="button" role="radio" aria-checked={forceStatutVal === st}
                  onClick={() => setForceStatutVal(st)}
                  className={clsx(s.choiceBtn, forceStatutVal === st && s['on_' + STATUT_TONE[st]])}>
                  {forceStatutVal === st && <Check size={14} aria-hidden="true"/>}
                  {STATUT_LABEL[st]}
                </button>
              ))}
            </div>
          </div>
          <Field label="Motif (obligatoire)" error={motifErr} valid={!motifErr} showError={forceTried}
            hint={`${forceMotif.length}/300 caractères — minimum 3. Ex : exposant gracieux, compensation hors-système, abandon.`}>
            <textarea value={forceMotif} onChange={e => setForceMotif(e.target.value)} rows={3} maxLength={300}/>
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmClearForce}
        title="Retirer le forçage de statut ?"
        icon={RotateCcw} confirmLabel="Retirer le forçage"
        onClose={() => setConfirmClearForce(false)}
        onConfirm={submitClearForce}
      >
        Le statut redeviendra calculé automatiquement depuis les paiements.
      </ConfirmDialog>

      <ConfirmDialog
        open={!!cancelKind}
        title={`Annuler le ${cancelKind || 'paiement'} enregistré ?`}
        hold icon={X} confirmLabel="Maintenir pour annuler"
        onClose={() => setCancelKind(null)}
        onConfirm={() => handleCancelPayment(cancelKind)}
      >
        Cette action ne peut pas être annulée.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={`Supprimer l'exposant « ${expoDisplayName(expo)} » ?`}
        hold icon={Trash2} confirmLabel="Maintenir pour supprimer"
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      >
        Cette action est irréversible. Les paiements enregistrés et les documents joints seront perdus.
      </ConfirmDialog>

      {/* Bloc PDF (Lot 4) */}
      <ExpoPDFButtons expo={expo} organisateur={organisateur}/>

      {/* Bloc historique décharges signées (Livraison signature) */}
      <DechargesHistory expo={expo} eventId={eventId}/>

      {/* Bloc Documents (Lot 3) */}
      <ExpoDocuments expo={expo} eventId={eventId}/>
    </div>
  )
}

// ─── Champs d'un paiement (saisie et modification) ────────────────
function PaymentFields({ montant, setMontant, date, setDate, method, setMethod, tried }) {
  const err = montantErr(montant)
  return (
    <div className={s.grid2}>
      <Field label="Montant (€)" error={err} valid={!err} showError={tried}>
        <input type="text" inputMode="decimal" value={montant}
          onChange={e => setMontant(e.target.value.replace(/[^0-9.,]/g, ''))}/>
      </Field>
      <Field label="Date" hint="Une date passée est acceptée (rattrapage).">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}/>
      </Field>
      <Field label="Mode de paiement" className={s.span2}>
        <select value={method} onChange={e => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>
    </div>
  )
}

// ─── Historique des décharges signées ─────────────────────────────
// Affiche la liste des décharges déjà signées pour l'exposant avec :
// téléchargement du PDF, visualisation des signatures, suppression (admin).
function DechargesHistory({ expo, eventId }) {
  // Les hooks passent avant le retour anticipé (règle des hooks)
  const [showSigs, setShowSigs] = useState(null) // id de la décharge dont les signatures sont visibles
  const [toDelete, setToDelete] = useState(null)
  const decharges = Array.isArray(expo?.decharges) ? expo.decharges : []
  if (decharges.length === 0) return null

  const handleDelete = async (dch) => {
    try {
      const { deleteSignedDecharge } = await import('../../../firebase/service')
      await deleteSignedDecharge(expo.id, dch.id, eventId)
      toast.success('Décharge supprimée')
    } catch (e) { toast.error(friendlyError(e, "La décharge n'a pas été supprimée.")); throw e }
  }

  return (
    <Card title={<span className={s.cardTitle}><ShieldCheck size={16} aria-hidden="true" className={s.ok}/>Décharges signées ({decharges.length})</span>}>
      <ul className={s.dchList}>
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
            <li key={dch.id} className={s.dch}>
              <div className={s.dchHead}>
                <ShieldCheck size={16} aria-hidden="true" className={s.ok}/>
                <div className={s.grow}>
                  <div className={s.strong}>Signée le {dateLabel}</div>
                  <div className={s.small}>
                    {dch.signatureOrganisateur?.signedBy || '—'} ↔ {dch.signatureExposant?.signedBy || '—'}
                  </div>
                  {dch.documentHash && <div className={s.hash}>Hash : {dch.documentHash.slice(0, 16)}…</div>}
                </div>
                <div className={s.rowActions}>
                  <Button variant="ghost" size="sm" iconOnly icon={isOpen ? EyeOff : Eye}
                    onClick={() => setShowSigs(isOpen ? null : dch.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'Cacher les signatures' : 'Voir les signatures'}
                    title={isOpen ? 'Cacher' : 'Voir signatures'}/>
                  {dch.pdfUrl && (
                    <a href={dch.pdfUrl} target="_blank" rel="noopener noreferrer" className={s.iconLink}
                      title="Télécharger le PDF" aria-label="Télécharger le PDF">
                      <FileText size={16} aria-hidden="true"/>
                    </a>
                  )}
                  <Button variant="ghost" size="sm" iconOnly icon={Trash2} className={s.dangerIcon}
                    onClick={() => setToDelete(dch)} aria-label="Supprimer la décharge" title="Supprimer"/>
                </div>
              </div>
              {isOpen && (
                <div className={s.sigs}>
                  {[['Organisateur', dch.signatureOrganisateur, 'Signature org'], ['Exposant', dch.signatureExposant, 'Signature exposant']].map(([label, sig, alt]) => (
                    <div key={label}>
                      <div className={s.overline}>{label}</div>
                      {sig?.dataUrl
                        ? <div className={s.sigImg}><img src={sig.dataUrl} alt={alt}/></div>
                        : <div className={s.small}>Pas d'image</div>}
                    </div>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer cette décharge signée ?"
        hold icon={Trash2} confirmLabel="Maintenir pour supprimer"
        onClose={() => setToDelete(null)}
        onConfirm={() => handleDelete(toDelete)}
      >
        {toDelete && `Décharge du ${new Date(toDelete.generatedAt).toLocaleDateString('fr-FR')}.`}
        {' '}Cette action est irréversible et supprime aussi le PDF stocké.
      </ConfirmDialog>
    </Card>
  )
}

function PaymentLine({ label, value, bold, muted }) {
  return (
    <div className={clsx(s.payLine, bold && s.bold, muted && s.mutedLine)}>
      <span>{label}</span>
      <span className={s.num}>{value}</span>
    </div>
  )
}

function PaymentRecord({ label, payment, onCancel, onEdit }) {
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
    <div className={s.payLine}>
      <div className={s.payWho}>
        <Check size={14} aria-hidden="true" className={s.ok}/>
        <span className={s.strong}>{label}</span>
        <span className={s.small}>· {dateLabel} · {METHOD_LABEL[payment.method] || payment.method}</span>
        {wasEdited && (
          <Badge tone="warning" title={`Modifié manuellement le ${new Date(payment.updatedPaymentAt).toLocaleDateString('fr-FR')}`}>
            Modifié
          </Badge>
        )}
      </div>
      <div className={s.rowActions}>
        <span className={clsx(s.num, s.paid)}>{eur(payment.montant)}</span>
        {onEdit && (
          <Button variant="ghost" size="sm" iconOnly icon={Edit2} onClick={onEdit}
            aria-label={`Modifier ce paiement (${label})`} title="Modifier ce paiement"/>
        )}
        <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onCancel} className={s.dangerIcon}
          aria-label={`Annuler ce paiement (${label})`} title="Annuler ce paiement"/>
      </div>
    </div>
  )
}
