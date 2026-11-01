/**
 * pages/dev/DevCaisse.jsx — aperçu de la caisse avec données d'exemple
 * Développement uniquement (route /ui/caisse). Le débit est simulé : rien n'est écrit
 * dans Firebase. Codes clients à saisir : YT-LEA (27,50 €), YT-TOM (3,00 €).
 */
import React, { useEffect, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import Debit from '../stand/Debit'
import shell from '../../App.module.css'

const MENU = [
  ['Bière pression', 500, 42, 'Boissons'], ['Limonade maison', 350, 88, 'Boissons'], ['Bissap', 300, 6, 'Boissons'],
  ['Eau 50 cl', 150, 210, 'Boissons'], ['Jus de gingembre', 350, 31, 'Boissons'], ['Soda', 250, 0, 'Boissons'],
  ['Eco-cup (consigne)', 100, 500, 'Boissons'], ['Burger', 900, 40, 'Food'], ['Crêpe', 400, 60, 'Food'],
  ['Frites', 350, 9, 'Food'], ['Tee-shirt Festylla', 2000, 25, 'Merch'],
].map(([nom, prix, stock, cat], i) => ({ id: `m${i}`, nom, prix, stock, cat, seuilAlerte: 10 }))

export default function DevCaisse() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const { debiter } = useAppStore.getState()
    useAppStore.setState({
      menu: MENU,
      logs: [],
      spectateurs: [
        { id: 'YT-LEA', nom: 'Léa Martin', solde: 2750 },
        { id: 'YT-TOM', nom: 'Tom Robert', solde: 300 },
      ],
      // Débit simulé : met à jour le solde local après 300 ms
      debiter: async (specId, items) => {
        await new Promise(r => setTimeout(r, 300))
        const total = items.reduce((a, i) => a + i.prix * i.qty, 0)
        useAppStore.setState(st => ({
          spectateurs: st.spectateurs.map(sp => sp.id === specId ? { ...sp, solde: sp.solde - total } : sp),
          menu: st.menu.map(m => { const it = items.find(i => i.id === m.id); return it ? { ...m, stock: m.stock - it.qty } : m }),
        }))
        return total
      },
    })
    setReady(true)
    return () => useAppStore.setState({ debiter, menu: [], spectateurs: [], logs: [] })
  }, [])

  if (!ready) return null
  return (
    <div className={shell.app}>
      <div className={shell.main}>
        <header className={shell.bar}><h1 className={shell.title}>Encaisser · aperçu</h1></header>
        <main className={shell.content}><Debit /></main>
      </div>
    </div>
  )
}
