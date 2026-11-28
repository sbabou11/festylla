/**
 * BilanHistorique.jsx — onglet « Bilan » de l'historique du spectateur (remplace le graphe du solde,
 * maquette validée le 28/11/2026). Des barres simples, lisibles sur téléphone :
 * par jour, par catégorie, par bracelet (s'il y en a), stands les plus fréquentés.
 * Les montants viennent de utils/bilanSpec (calculés sur le téléphone, rien de nouveau n'est collecté).
 */
import React from 'react'
import s from './BilanHistorique.module.css'

function Barres({ titre, lignes, fmt, couleur, max }) {
  if (!lignes.length) return null
  const haut = max || Math.max(...lignes.map(l => l.montant), 1)
  return (
    <section className="nv-card nv-pad" aria-label={titre}>
      <h2 className={s.titre}>{titre}</h2>
      <div className={s.liste}>
        {lignes.map(l => (
          <div key={l.cle} className={s.ligne}>
            <span className={s.nom}>{l.nom}</span>
            <span className={s.piste} aria-hidden="true"><i style={{ width: `${Math.max(3, Math.round((l.montant / haut) * 100))}%`, background: couleur }} /></span>
            <b className={s.montant}>{fmt(l.montant)}</b>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function BilanHistorique({ bilan, fmt, tous = true, bracelets = [] }) {
  if (!bilan.depense) {
    return <div className="nv-card nv-pad"><p className="nv-mu" style={{ margin: 0 }}>Aucune dépense pour l'instant : le bilan se remplira avec vos achats.</p></div>
  }
  const enfants = bracelets.filter(b => b.statut === 'actif' && b.plafondJour)
  return (
    <div className={s.pile}>
      <Barres titre="Par jour" fmt={fmt} couleur="var(--brand)"
        lignes={bilan.parJour.map(j => ({ cle: j.key, nom: j.label, montant: j.montant }))} />
      <Barres titre="Par catégorie" fmt={fmt} couleur="var(--coral)"
        lignes={bilan.parCategorie.map(c => ({ cle: c.nom, nom: c.nom, montant: c.montant }))} />
      {tous && bilan.parBracelet.length > 1 && (
        <Barres titre="Par bracelet" fmt={fmt} couleur="var(--text)"
          lignes={bilan.parBracelet.map(b => ({ cle: b.numero || 'tel', nom: b.nom, montant: b.montant }))} />
      )}
      {tous && enfants.length > 0 && (
        <p className="nv-mu" style={{ margin: 0, fontSize: 12 }}>
          Plafonds : {enfants.map(b => `${b.prenom || 'bracelet'} ${b.plafondJour} € par jour`).join(' · ')}. Ce qui reste aujourd'hui s'affiche à la borne.
        </p>
      )}
      {bilan.stands.length > 0 && (
        <section className="nv-card nv-pad" aria-label="Stands les plus fréquentés">
          <h2 className={s.titre}>Stands les plus fréquentés</h2>
          <p className="nv-mu" style={{ margin: 0 }}>
            {bilan.stands.map(st => `${st.nom} · ${st.fois} fois · ${fmt(st.montant)}`).join(' — ')}
          </p>
        </section>
      )}
    </div>
  )
}
