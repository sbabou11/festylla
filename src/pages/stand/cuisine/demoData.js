/**
 * pages/stand/cuisine/demoData.js — tickets d'exemple pour l'aperçu (prop `demo` de Cuisine)
 * <Cuisine demo={cuisineDemo()} /> : aucun écouteur ni écriture Firestore, actions locales.
 */
const MIN = 60 * 1000

export function cuisineDemo(now = Date.now()) {
  const at = (minAgo) => new Date(now - minAgo * MIN).toISOString()
  return {
    commandes: [
      { id: 'dc1', numero: 41, status: 'pending', specNom: 'Léa Martin', specId: 'YT-1004', paid: true, createdAt: at(1), total: 1300,
        items: [{ nom: 'Burger', qty: 1, prixUnit: 900 }, { nom: 'Crêpe', qty: 1, prixUnit: 400 }] },
      { id: 'dc2', numero: 38, status: 'pending', specNom: 'Karim Benali', specId: 'YT-1029', paid: false, createdAt: at(4), total: 1000,
        items: [{ nom: 'Bière pression', qty: 2, prixUnit: 500 }] },
      { id: 'dc3', numero: 35, status: 'pending', source: 'borne', code: 'BRN-7F2A-035', specNom: 'Inès Diallo', specId: 'YT-104E', paid: true, createdAt: at(8), total: 1150,
        items: [{ nom: 'Burger', qty: 1, prixUnit: 900 }, { nom: 'Eau 50 cl', qty: 1, prixUnit: 150 }, { nom: 'Bissap', qty: 1, prixUnit: 100 }] },
      { id: 'dc4', numero: 31, status: 'pending', specNom: 'Tom Robert', specId: 'YT-1073', paid: true, createdAt: at(12), total: 800,
        items: [{ nom: 'Crêpe', qty: 2, prixUnit: 400 }] },
      { id: 'dc5', numero: 30, status: 'ready', specNom: 'Hugo Petit', specId: 'YT-10C1', paid: true, createdAt: at(9), readyAt: at(2), total: 700,
        items: [{ nom: 'Limonade maison', qty: 2, prixUnit: 350 }] },
    ],
    reservations: [
      { id: 'dr1', numero: 28, status: 'processing', code: 'R-4817', specNom: 'Awa Sow', specId: 'YT-1098', createdAt: at(17), total: 2400,
        items: [{ nom: 'Bière pression', qty: 3, prix: 500 }, { nom: 'Frites', qty: 1, prix: 900 }] },
      { id: 'dr2', numero: 33, status: 'ready', code: 'BNV-4811', isBenev: true, benevoleNom: 'Nora Haddad', createdAt: at(11), readyAt: at(5), total: 0,
        items: [{ nom: 'Repas bénévole', qty: 1, prix: 0 }] },
    ],
  }
}
