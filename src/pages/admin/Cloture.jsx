/**
 * pages/admin/Cloture.jsx — clôture de caisse guidée
 * 1. Caisse et période  2. Comptage  3. Écart  4. Validation signée
 * L'attendu vient des recharges de la période, par mode de paiement (espèces, carte).
 * La clôture est enregistrée dans events/{id}/clotures et peut être imprimée en procès-verbal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Printer, RotateCcw, Banknote, CreditCard, HelpCircle, Minus, Plus } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import useEventStore from '../../store/useEventStore'
import { saveCloture, watchClotures } from '../../firebase/service'
import { usePeriodTransactions } from '../../hooks/usePeriodTransactions'
import { dayStart } from '../../utils/dashboardData'
import { cashiers, expectedTill, DENOMINATIONS, countTotal, MOYENS } from '../../utils/analyticsData'
import { fmt } from '../../utils/helpers'
import { Button, Card, Badge, Table, SignaturePad, SuccessCheck, AnimatedNumber, Field, focusFirstInvalid, toast } from '../../ui'
import { friendlyError } from '../../utils/errors'
import s from './cloture/cloture.module.css'

const DAY = 24 * 3600 * 1000
const STEPS = ['Caisse', 'Comptage', 'Écart', 'Validation']
const ECART_TOLERANCE = 100 // 1 € : au-delà, un commentaire est demandé

const euros = (str) => Math.round((parseFloat(String(str).replace(',', '.')) || 0) * 100)
const dayLabel = (start, today) => {
  if (start === today) return "Aujourd'hui"
  if (start === today - DAY) return 'Hier'
  return new Date(start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v))
const ecartTone = (v) => (v === 0 ? 'success' : Math.abs(v) < ECART_TOLERANCE ? 'warning' : 'danger')

export default function Cloture() {
  const { user } = useAuthStore()
  const { currentEventId, currentEvent } = useEventStore()
  const eventNom = (typeof currentEvent === 'function' ? currentEvent() : currentEvent)?.nom || 'Événement'
  const isDemo = currentEventId === 'demo'
  const lockedToSelf = user?.role === 'billetterie'

  const today = dayStart(Date.now())
  const [step, setStep] = useState(0)
  const [day, setDay] = useState(today)
  const [caisse, setCaisse] = useState(lockedToSelf ? (user?.nom || 'Billetterie') : '')
  const [fond, setFond] = useState('')
  const [counts, setCounts] = useState({})
  const [tpe, setTpe] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [signataire, setSignataire] = useState(user?.nom || '')
  const [signature, setSignature] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [tried, setTried] = useState(false) // « Continuer » cliqué alors qu'il manque quelque chose
  const [history, setHistory] = useState([])
  const topRef = useRef(null)

  // Chaque étape repart du haut de la page
  useEffect(() => { topRef.current?.scrollIntoView({ block: 'start' }); setTried(false) }, [step, !!done])

  const { transactions, loading, partial } = usePeriodTransactions(day, day + DAY)
  const caisses = useMemo(() => cashiers(transactions, day, day + DAY), [transactions, day])
  const attendu = useMemo(() => expectedTill(transactions, { from: day, to: day + DAY, staff: caisse || null }), [transactions, day, caisse])

  useEffect(() => {
    if (isDemo) return
    return watchClotures(setHistory, currentEventId)
  }, [currentEventId, isDemo])

  const fondC = euros(fond)
  const especesCompte = countTotal(counts)
  const cbCompte = euros(tpe)
  const especesAttendu = fondC + attendu.especes.total
  const ecart = {
    especes: especesCompte - especesAttendu,
    cb: cbCompte - attendu.cb.total,
  }
  ecart.total = ecart.especes + ecart.cb
  const needComment = Math.abs(ecart.especes) >= ECART_TOLERANCE || Math.abs(ecart.cb) >= ECART_TOLERANCE

  const canNext = [
    !loading,
    true,
    !needComment || commentaire.trim().length >= 5,
    signataire.trim() && signature,
  ][step]

  // Le bouton reste actif : au clic, on montre ce qui manque au lieu de ne rien faire
  const ifComplete = (go) => () => {
    if (canNext) { go(); return }
    setTried(true)
    focusFirstInvalid(topRef.current)
  }

  const setCount = (v, n) => setCounts(c => ({ ...c, [v]: Math.max(0, Math.floor(Number(n) || 0)) }))

  const valider = async () => {
    const record = {
      evenement: eventNom,
      caisse: caisse || null,
      periode: { debut: new Date(day).toISOString(), fin: new Date(day + DAY).toISOString() },
      fondDeCaisse: fondC,
      attendu: { especes: attendu.especes, cb: attendu.cb, nonRenseigne: attendu.inconnu },
      compte: { especes: especesCompte, cb: cbCompte, detailEspeces: counts },
      ecart,
      commentaire: commentaire.trim(),
      signataire: signataire.trim(),
      signature,
      saisiPar: user?.nom || null,
      partiel: partial,
    }
    setSaving(true)
    try {
      const id = isDemo ? 'demo' : await saveCloture(record, currentEventId)
      setDone({ ...record, id, at: new Date(), recharges: attendu.especes.n + attendu.cb.n + attendu.inconnu.n })
      toast.success('Clôture enregistrée')
    } catch (e) {
      toast.error(friendlyError(e, "La clôture n'a pas été enregistrée."), { action: { label: 'Réessayer', onClick: valider } })
    } finally { setSaving(false) }
  }

  const restart = () => {
    setStep(0); setCounts({}); setTpe(''); setFond(''); setCommentaire(''); setSignature(null); setDone(null)
    if (!lockedToSelf) setCaisse('')
  }

  if (done) return <div ref={topRef}><Done cloture={done} onPrint={() => printPv(done)} onRestart={restart} /></div>

  return (
    <div className={s.page} ref={topRef}>
      <ol className={s.stepper}>
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? s.stepOn : i < step ? s.stepDone : undefined}>
            <span className={s.stepDot}>{i < step ? <Check size={14} /> : i + 1}</span>
            <span className={s.stepLabel}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="Quelle caisse clôturer ?" subtitle="Les recharges de la période déterminent ce que la caisse doit contenir.">
          <div className={s.stack}>
            <div className={s.field}>
              <span className={s.label}>Journée (de 6h à 6h)</span>
              <div className={s.chips}>
                {[today, today - DAY].map(d => (
                  <button key={d} type="button" className={d === day ? `${s.chip} ${s.chipOn}` : s.chip} onClick={() => setDay(d)}>{dayLabel(d, today)}</button>
                ))}
              </div>
            </div>

            <div className={s.field}>
              <span className={s.label}>Caisse</span>
              {lockedToSelf ? (
                <p className={s.muted}>Votre caisse : <b>{caisse}</b></p>
              ) : (
                <div className={s.caisses}>
                  <button type="button" className={!caisse ? `${s.caisse} ${s.caisseOn}` : s.caisse} onClick={() => setCaisse('')}>
                    <b>Toutes les caisses</b><span>{fmt(caisses.reduce((a, c) => a + c.total, 0))} rechargés</span>
                  </button>
                  {caisses.map(c => (
                    <button key={c.nom} type="button" className={caisse === c.nom ? `${s.caisse} ${s.caisseOn}` : s.caisse} onClick={() => setCaisse(c.nom)}>
                      <b>{c.nom}</b><span>{fmt(c.total)} rechargés</span>
                    </button>
                  ))}
                </div>
              )}
              {!loading && caisses.length === 0 && <p className={s.muted}>Aucune recharge enregistrée sur cette journée.</p>}
            </div>

            <label className={s.field}>
              <span className={s.label}>Fond de caisse au départ (€)</span>
              <input className={s.input} inputMode="decimal" value={fond} onChange={e => setFond(e.target.value)} placeholder="0,00" />
              <span className={s.muted}>Monnaie déposée dans la caisse à l'ouverture. Elle s'ajoute à l'attendu en espèces.</span>
            </label>

            <Expected attendu={attendu} fond={fondC} loading={loading} />
            {partial && <p className={s.warn}>Hors ligne : seules les 500 dernières transactions sont prises en compte. Reprenez la clôture une fois reconnecté.</p>}
          </div>
        </Card>
      )}

      {step === 1 && (
        <div className={s.two}>
          <Card title="Espèces" subtitle="Comptez billet par billet, pièce par pièce." actions={<b className={s.big}>{fmt(especesCompte)}</b>}>
            <div className={s.denoms}>
              {DENOMINATIONS.map(d => (
                <div key={d.v} className={s.denom}>
                  <span className={d.kind === 'billet' ? `${s.coin} ${s.bill}` : s.coin}>{d.label}</span>
                  <div className={s.stepperInput}>
                    <button type="button" aria-label={`Retirer un ${d.label}`} onClick={() => setCount(d.v, (counts[d.v] || 0) - 1)}><Minus size={14} /></button>
                    <input inputMode="numeric" aria-label={`Nombre de ${d.label}`} value={counts[d.v] || ''} placeholder="0"
                      onChange={e => setCount(d.v, e.target.value)} />
                    <button type="button" aria-label={`Ajouter un ${d.label}`} onClick={() => setCount(d.v, (counts[d.v] || 0) + 1)}><Plus size={14} /></button>
                  </div>
                  <span className={s.denomTotal}>{counts[d.v] ? fmt(d.v * counts[d.v]) : ''}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Carte bancaire" subtitle="Total du ticket de fin de journée du terminal (TPE).">
            <label className={s.field}>
              <span className={s.label}>Total TPE (€)</span>
              <input className={`${s.input} ${s.inputBig}`} inputMode="decimal" value={tpe} onChange={e => setTpe(e.target.value)} placeholder="0,00" />
            </label>
            <p className={s.muted}>Attendu : {fmt(attendu.cb.total)} sur {attendu.cb.n} recharge{attendu.cb.n > 1 ? 's' : ''}.</p>
          </Card>
        </div>
      )}

      {step === 2 && (
        <Card title="Écart" subtitle={caisse ? `Caisse ${caisse}` : 'Toutes les caisses'}
          actions={<Badge tone={ecartTone(ecart.total)}>{ecart.total === 0 ? 'Caisse juste' : `Écart ${signed(ecart.total)}`}</Badge>}>
          <div className={s.stack}>
            <Table
              rowKey="mode"
              rows={[
                { mode: 'Espèces', attendu: especesAttendu, compte: especesCompte, ecart: ecart.especes },
                { mode: 'Carte bancaire', attendu: attendu.cb.total, compte: cbCompte, ecart: ecart.cb },
              ]}
              columns={[
                { key: 'mode', label: 'Mode', render: r => <b>{r.mode}</b> },
                { key: 'attendu', label: 'Attendu', align: 'right', render: r => fmt(r.attendu) },
                { key: 'compte', label: 'Compté', align: 'right', render: r => fmt(r.compte) },
                { key: 'ecart', label: 'Écart', align: 'right', render: r => <Badge tone={ecartTone(r.ecart)}>{signed(r.ecart)}</Badge> },
              ]}
            />
            {attendu.inconnu.total > 0 && (
              <p className={s.info}><HelpCircle size={15} />
                {fmt(attendu.inconnu.total)} de recharges ({attendu.inconnu.n}) n'ont pas de mode de paiement enregistré (recharges antérieures à cette version). Elles peuvent expliquer un écart positif.
              </p>
            )}
            <Field label={`Commentaire ${needComment ? "(obligatoire au-delà de 1 € d'écart)" : '(facultatif)'}`}
              error={needComment && commentaire.trim().length < 5 ? "Explique l'écart en quelques mots" : null} showError={tried}>
              <textarea rows={3} value={commentaire} onChange={e => setCommentaire(e.target.value)}
                placeholder="Ex. : erreur de rendu de monnaie vers 23h, remboursement d'un ticket…" />
            </Field>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Validation" subtitle="La personne qui a compté la caisse signe le procès-verbal.">
          <div className={s.stack}>
            <div className={s.summary}>
              <div><span>Caisse</span><b>{caisse || 'Toutes les caisses'}</b></div>
              <div><span>Journée</span><b>{dayLabel(day, today)}</b></div>
              <div><span>Espèces comptées</span><b>{fmt(especesCompte)}</b></div>
              <div><span>Carte bancaire</span><b>{fmt(cbCompte)}</b></div>
              <div><span>Écart total</span><b><Badge tone={ecartTone(ecart.total)}>{signed(ecart.total)}</Badge></b></div>
            </div>
            <Field label="Nom du signataire" error={signataire.trim() ? null : 'Indique le nom de la personne qui signe'} valid={!!signataire.trim()} showError={tried}>
              <input value={signataire} onChange={e => setSignataire(e.target.value)} placeholder="Prénom Nom" />
            </Field>
            <div className={s.field}>
              <span className={s.label}>Signature</span>
              <SignaturePad onChange={setSignature} />
              {tried && !signature && <p className={s.signErr} role="alert">Signe dans le cadre pour valider.</p>}
            </div>
          </div>
        </Card>
      )}

      <div className={s.nav}>
        <Button variant="secondary" icon={ChevronLeft} onClick={() => setStep(x => x - 1)} disabled={step === 0}>Retour</Button>
        {step < 3
          ? <Button onClick={ifComplete(() => setStep(x => x + 1))} loading={step === 0 && loading}>Continuer <ChevronRight size={16} /></Button>
          : <Button icon={Check} onClick={ifComplete(valider)} loading={saving}>Valider la clôture</Button>}
      </div>

      {history.length > 0 && step === 0 && (
        <Card title="Clôtures enregistrées" flush>
          <Table
            rows={history.slice(0, 10)}
            columns={[
              { key: 'timestamp', label: 'Date', render: r => new Date(r.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) },
              { key: 'caisse', label: 'Caisse', render: r => r.caisse || 'Toutes' },
              { key: 'signataire', label: 'Signataire' },
              { key: 'ecart', label: 'Écart', align: 'right', render: r => <Badge tone={ecartTone(r.ecart?.total || 0)}>{signed(r.ecart?.total || 0)}</Badge> },
              { key: 'pv', label: '', align: 'right', render: r => <Button size="sm" variant="ghost" icon={Printer} onClick={() => printPv(r)}>PV</Button> },
            ]}
          />
        </Card>
      )}
    </div>
  )
}

function Expected({ attendu, fond, loading }) {
  if (loading) return <p className={s.muted}>Calcul de l'attendu…</p>
  return (
    <div className={s.expected}>
      <div><Banknote size={18} /><span>Espèces attendues</span><b>{fmt(fond + attendu.especes.total)}</b><small>{attendu.especes.n} recharge{attendu.especes.n > 1 ? 's' : ''}{fond ? ` + fond ${fmt(fond)}` : ''}</small></div>
      <div><CreditCard size={18} /><span>Carte attendue</span><b>{fmt(attendu.cb.total)}</b><small>{attendu.cb.n} recharge{attendu.cb.n > 1 ? 's' : ''}</small></div>
      {attendu.inconnu.n > 0 && <div><HelpCircle size={18} /><span>{MOYENS.inconnu.label}</span><b>{fmt(attendu.inconnu.total)}</b><small>{attendu.inconnu.n} recharge{attendu.inconnu.n > 1 ? 's' : ''}</small></div>}
    </div>
  )
}

function Done({ cloture, onPrint, onRestart }) {
  // Dernier geste de la soirée : on montre ce qui a été accompli
  const juste = cloture.ecart.total === 0
  const encaisse = cloture.compte.especes - cloture.fondDeCaisse + cloture.compte.cb
  return (
    <div className={s.page}>
      <Card>
        <div className={`${s.done} yc-stagger`}>
          <SuccessCheck size={64} />
          <p className={s.muted}>{cloture.caisse || 'Toutes les caisses'} · signée par {cloture.signataire}</p>
          <b className={s.doneAmount}><AnimatedNumber from={0} value={encaisse} format={fmt} duration={1200} /></b>
          <div className={s.doneBadges}>
            <Badge tone="neutral">{cloture.recharges} recharge{cloture.recharges > 1 ? 's' : ''}</Badge>
            <Badge tone={ecartTone(cloture.ecart.total)}>{juste ? 'Écart 0,00 €' : `Écart ${signed(cloture.ecart.total)}`}</Badge>
          </div>
          <h2>{juste ? 'Caisse juste. Merci, bonne fin de soirée.' : 'Écart noté et signé. Merci, bonne fin de soirée.'}</h2>
          <div className={s.doneActions}>
            <Button icon={Printer} onClick={onPrint}>Imprimer le procès-verbal</Button>
            <Button variant="secondary" icon={RotateCcw} onClick={onRestart}>Nouvelle clôture</Button>
          </div>
          <p className={s.muted}>Pour un PDF, choisissez « Enregistrer au format PDF » dans la fenêtre d'impression.</p>
        </div>
      </Card>
    </div>
  )
}

// Procès-verbal imprimable (ou enregistrable en PDF depuis la fenêtre d'impression)
function printPv(c) {
  const w = window.open('', '_blank')
  if (!w) { toast.error("La fenêtre d'impression a été bloquée par le navigateur"); return }
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
  const debut = new Date(c.periode?.debut)
  const fin = new Date(c.periode?.fin)
  const at = c.at ? new Date(c.at) : new Date(c.timestamp)
  const rows = DENOMINATIONS.filter(d => c.compte?.detailEspeces?.[d.v])
    .map(d => `<tr><td>${d.label}</td><td>${c.compte.detailEspeces[d.v]}</td><td>${fmt(d.v * c.compte.detailEspeces[d.v])}</td></tr>`).join('')
  const line = (label, a, b, e) => `<tr><td>${label}</td><td>${fmt(a)}</td><td>${fmt(b)}</td><td><b>${signed(e)}</b></td></tr>`
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Procès-verbal de clôture</title>
<style>
  body{font-family:system-ui,sans-serif;color:#003048;max-width:720px;margin:32px auto;padding:0 24px;font-size:14px}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#4A6580} table{width:100%;border-collapse:collapse;margin:12px 0 20px}
  th,td{border-bottom:1px solid #d5dde5;padding:6px 8px;text-align:left} td:not(:first-child),th:not(:first-child){text-align:right}
  .sig{margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
  .sig img{height:110px;border-bottom:1px solid #003048} .note{background:#FFF8F2;border:1px solid #F5EBDC;border-radius:8px;padding:10px 12px}
</style>
<h1>Procès-verbal de clôture de caisse</h1>
<div class="muted">${esc(c.evenement)} · ${esc(c.caisse || 'Toutes les caisses')}</div>
<div class="muted">Période du ${debut.toLocaleString('fr-FR')} au ${fin.toLocaleString('fr-FR')} · clôturé le ${at.toLocaleString('fr-FR')}</div>
<table><thead><tr><th>Mode</th><th>Attendu</th><th>Compté</th><th>Écart</th></tr></thead><tbody>
${line('Espèces (fond ' + fmt(c.fondDeCaisse || 0) + ' inclus)', (c.fondDeCaisse || 0) + (c.attendu?.especes?.total || 0), c.compte?.especes || 0, c.ecart?.especes || 0)}
${line('Carte bancaire', c.attendu?.cb?.total || 0, c.compte?.cb || 0, c.ecart?.cb || 0)}
<tr><td><b>Total</b></td><td></td><td></td><td><b>${signed(c.ecart?.total || 0)}</b></td></tr>
</tbody></table>
${c.attendu?.nonRenseigne?.n ? `<p class="muted">Recharges sans mode de paiement : ${c.attendu.nonRenseigne.n} pour ${fmt(c.attendu.nonRenseigne.total)}.</p>` : ''}
${rows ? `<h3>Détail des espèces</h3><table><thead><tr><th>Coupure</th><th>Nombre</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${c.commentaire ? `<p class="note"><b>Commentaire :</b> ${esc(c.commentaire)}</p>` : ''}
${c.partiel ? '<p class="muted">Attention : clôture calculée hors ligne, sur les 500 dernières transactions.</p>' : ''}
<div class="sig"><div><div class="muted">Signataire</div><b>${esc(c.signataire)}</b></div>${c.signature ? `<img src="${c.signature}" alt="Signature">` : ''}</div>
<script>window.onload=()=>window.print()<\/script>`)
  w.document.close()
}
