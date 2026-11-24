/**
 * components/QuoiDeNeuf.jsx — lien discret « ✨ Nouveautés · Voir » (24/11/2026)
 * Maquette validée : https://claude.ai/artifact/FzB5RQwBEwGgqyMebrCjLn
 *
 * <QuoiDeNeuf espace="equipe" | "benevole" | "spectateur" />
 * Affiché une fois par mise en ligne (NOUVEAUTES.id) et par téléphone : lu ou masqué (×), il ne
 * revient plus jusqu'à la prochaine. Rien ne s'ouvre tout seul. Mémoire du téléphone seulement ;
 * si elle est inaccessible (navigation privée), le lien reste simplement visible.
 */
import React, { useState } from 'react'
import { Sparkles, X, Watch, RefreshCw, Undo2, Sun, Info } from 'lucide-react'
import { Sheet } from '../ui'
import { NOUVEAUTES } from '../nouveautes'
import s from './QuoiDeNeuf.module.css'

const ICONES = { Watch, RefreshCw, Undo2, Sun, Info }
const cle = (espace) => `yc-nouveautes-vu-${espace}`

export function dejaVu(espace, id = NOUVEAUTES.id, stockage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try { return stockage?.getItem(cle(espace)) === id } catch { return false }
}
export function marquerVu(espace, id = NOUVEAUTES.id, stockage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try { stockage?.setItem(cle(espace), id) } catch { /* mémoire inaccessible : rien à faire */ }
}

export default function QuoiDeNeuf({ espace = 'equipe', className }) {
  const lignes = NOUVEAUTES[espace] || []
  const [vu, setVu] = useState(() => dejaVu(espace))
  const [ouvert, setOuvert] = useState(false)
  if (!lignes.length || (vu && !ouvert)) return null
  const fini = () => { marquerVu(espace); setVu(true); setOuvert(false) }
  return (<>
    {!vu && (
      <div className={`${s.place} ${className || ''}`}><span className={s.lien}>
        <button type="button" className={`nv-press ${s.voir}`} onClick={() => setOuvert(true)} aria-haspopup="dialog">
          <Sparkles size={15} aria-hidden="true" /> Nouveautés · <span className={s.accent}>Voir</span>
        </button>
        <button type="button" className={s.masquer} onClick={fini} aria-label="Masquer les nouveautés">
          <X size={15} aria-hidden="true" />
        </button>
      </span></div>
    )}
    <Sheet open={ouvert} onClose={fini} title="Quoi de neuf"
      footer={<button type="button" className={`nv-btn nv-press ${s.compris}`} onClick={fini}>J'ai compris</button>}>
      <p className={s.date}>Mise à jour du {NOUVEAUTES.date}</p>
      <ul className={s.lignes}>
        {lignes.map((l) => {
          const Icone = ICONES[l.icone] || Info
          return (
            <li key={l.titre}>
              <span className={s.ic} aria-hidden="true"><Icone size={18} /></span>
              <span><b>{l.titre}</b><span>{l.texte}</span></span>
            </li>
          )
        })}
      </ul>
    </Sheet>
  </>)
}
