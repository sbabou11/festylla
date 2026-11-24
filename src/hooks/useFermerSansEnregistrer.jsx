/**
 * hooks/useFermerSansEnregistrer.jsx — « Fermer sans enregistrer ? » (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/PZRty7msgKGLLVbVktgd3k (idée d'Event Manager,
 * fiches Modal Hierarchy et Destructive Actions de designmotionhq.com/patterns)
 *
 * const { demander, question } = useFermerSansEnregistrer(zoneRef, actif, nom)
 *   demander(fermer) : ferme tout de suite si aucun champ de la zone n'a changé depuis l'ouverture ;
 *   sinon pose la question (et renvoie 'garde'). Rappelé pendant la question : on reste dans la saisie.
 *   question : l'élément à rendre (null quand rien n'est demandé).
 * « Continuer la saisie » est mis en avant et sélectionné ; Échap ou « retour » = rester dans la saisie.
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import s from './useFermerSansEnregistrer.module.css'

const IGNORES = ['search', 'hidden', 'file', 'button', 'submit', 'reset', 'image']

/** Empreinte des champs de la zone (texte, nombres, listes, cases) */
export function lireChamps(zone) {
  if (!zone) return ''
  return [...zone.querySelectorAll('input, textarea, select')]
    .filter(el => !IGNORES.includes(el.type) && !el.closest('[data-sans-question]'))
    .map(el => (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : String(el.value))
    .join('\u0001')
}

function Question({ nom, onContinuer, onFermer }) {
  const continuerRef = useRef(null)
  const fermerRef = useRef(null)
  useEffect(() => {
    continuerRef.current?.focus()
    // Phase de capture : Échap et Tab ne vont pas à la fenêtre qui est dessous
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onContinuer(); return }
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopImmediatePropagation()
        ;(document.activeElement === continuerRef.current ? fermerRef.current : continuerRef.current)?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onContinuer])
  return createPortal(
    <div className={s.fond} onMouseDown={(e) => { if (e.target === e.currentTarget) onContinuer() }}>
      <div className={s.boite} role="alertdialog" aria-modal="true" aria-labelledby="fse-titre" aria-describedby="fse-texte">
        <b id="fse-titre" className={s.titre}>Fermer sans enregistrer ?</b>
        <p id="fse-texte" className={s.texte}>{nom ? `Vos modifications de « ${nom} » seront perdues.` : 'Vos modifications seront perdues.'}</p>
        <button ref={continuerRef} type="button" className={s.continuer} onClick={onContinuer}>Continuer la saisie</button>
        <button ref={fermerRef} type="button" className={s.fermer} onClick={onFermer}>Fermer sans enregistrer</button>
      </div>
    </div>,
    document.body,
  )
}

export default function useFermerSansEnregistrer(zoneRef, actif, nom = '') {
  const empreinte = useRef(null)
  const [enAttente, setEnAttente] = useState(null)   // { fermer } quand la question est posée
  const attenteRef = useRef(null)
  attenteRef.current = enAttente

  // Empreinte prise juste après l'ouverture (le temps que les champs se remplissent)
  useEffect(() => {
    if (!actif) { empreinte.current = null; setEnAttente(null); return undefined }
    const t = setTimeout(() => { empreinte.current = lireChamps(zoneRef.current) }, 250)
    return () => clearTimeout(t)
  }, [actif, zoneRef])

  const change = () => empreinte.current != null && !!zoneRef.current && lireChamps(zoneRef.current) !== empreinte.current

  const demander = (fermer) => {
    if (attenteRef.current) { setEnAttente(null); return 'garde' }   // pendant la question : on reste
    if (change()) { setEnAttente({ fermer }); return 'garde' }
    fermer?.()
    return 'ferme'
  }

  const question = enAttente ? (
    <Question nom={nom}
      onContinuer={() => setEnAttente(null)}
      onFermer={() => { const f = enAttente.fermer; setEnAttente(null); empreinte.current = null; f?.() }} />
  ) : null

  return { demander, question, change }
}
