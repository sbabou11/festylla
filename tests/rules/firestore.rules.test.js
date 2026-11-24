/**
 * Tests des règles Firestore (sécurité, lot 3) — lancés contre l'émulateur Firebase :
 *   npm run test:rules        (nécessite Java, voir README de ce dossier)
 * Ils ne touchent jamais la vraie base.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, deleteField } from 'firebase/firestore'

const EV = 'ev1'
let env

const as = ({ uid, ...claims }) => env.authenticatedContext(uid || 'u', { yc: 1, eventIds: [EV], ...claims }).firestore()
const ADMIN = { uid: 'staff:a', type: 'staff', role: 'admin' }
const STAND = { uid: 'staff:s', type: 'staff', role: 'stand', fiche: `events/${EV}/staff/s1` }
const BENEV = { uid: 'benevole:b1', type: 'benevole', role: 'benevole', fiche: `events/${EV}/benevoles/b1` }
const SPEC = { uid: 'spectateur:FY-K7Q3NP', type: 'spectateur', role: 'spectateur', specId: 'FY-K7Q3NP', specDoc: 'FY-K7Q3NP' }
const AUTRE_SPEC = { uid: 'spectateur:FY-AB2C3D', type: 'spectateur', role: 'spectateur', specId: 'FY-AB2C3D', specDoc: 'FY-AB2C3D' }
const ARTISTE = { uid: 'artiste:cr1', type: 'artiste', role: 'artiste', creneauId: 'cr1' }
const ARTISTE_EM = { uid: 'artiste:em-a7', type: 'artiste', role: 'artiste', creneauId: 'em-a7' }
const BORNE = { uid: 'borne', type: 'borne', role: 'borne' }
const ECRAN = { uid: 'ecran', type: 'ecran', role: 'ecran' }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'yllacash-regles',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const p = (path, data) => setDoc(doc(db, path), data)
    await p(`events/${EV}`, { nom: 'Fest', securite: 'fermee' })
    await p(`events/${EV}/staff/s1`, { nom: 'Awa', role: 'stand', motDePasseHash: 'scrypt$x' })
    await p(`staff/r1`, { nom: 'Racine', password: 'secret' })
    await p(`events/${EV}/benevoles/b1`, { prenom: 'Malik', motDePasseHash: 'scrypt$y', consommation: { repas: 0 } })
    await p(`events/${EV}/benevoles/b2`, { prenom: 'Inès', motDePasseHash: 'scrypt$z' })
    await p(`events/${EV}/spectateurs/FY-K7Q3NP`, { id: 'FY-K7Q3NP', nom: 'Awa', solde: 1000, billet: { code: 'K7Q3NP', annule: false, entrees: {}, jours: 2 } })
    await p(`events/${EV}/spectateurs/FY-AB2C3D`, { id: 'FY-AB2C3D', nom: 'Malik', solde: 500 })
    await p(`events/${EV}/transactions/t1`, { specId: 'FY-K7Q3NP', type: 'credit', montant: 1000 })
    await p(`events/${EV}/transactions/t2`, { specId: 'FY-AB2C3D', type: 'credit', montant: 500 })
    await p(`events/${EV}/reservations/r1`, { specId: 'FY-K7Q3NP', status: 'ready' })
    await p(`events/${EV}/reservations/r2`, { specId: 'FY-AB2C3D', status: 'pending' })
    await p(`events/${EV}/menu/m1`, { nom: 'Bissap', prix: 300, stock: 10 })
    await p(`events/${EV}/planning/cr1`, { artiste: 'DJ', avantages: {} })
    await p(`events/${EV}/programme-em/p12`, { artiste: 'Awa', source: 'event-manager' })
    await p(`events/${EV}/artistes/em-a7`, { nom: 'Awa', source: 'event-manager', avantagesJours: { '2027-05-15': { repas: 2 } } })
    await p(`events/${EV}/artistes/em-a8`, { nom: 'Sola', source: 'event-manager' })
    await p(`events/${EV}/liens/borne`, { cle: 'a'.repeat(32) })
    await p(`events/${EV}/finances/f1`, { montant: 100 })
    await p(`events/${EV}/settings/global`, { theme: {} })
    await p(`events/${EV}/codes/482913`, { code: '482913', statut: 'en_attente', total: 1200, items: [] })
    await p(`events/${EV}/codes/111111`, { code: '111111', statut: 'utilise', total: 300, items: [] })
    await p(`securite-connexions/c1`, { echecs: 1 })
    await p(`liaisons/k1`, { ev: EV, nom: 'festylla.com', empreinte: 'a'.repeat(64) })
    await p(`liaisons-em/${EV}`, { cle: 'secret-event-manager' })
    await p(`em-instantanes/${EV}`, { version: 'a'.repeat(32), benevoles: [] })
  })
})

describe('sans session (visiteur anonyme, programme malveillant)', () => {
  const anon = () => env.unauthenticatedContext().firestore()
  it('ne lit ni les comptes, ni l\'équipe, ni les mots de passe', async () => {
    await assertFails(getDocs(collection(anon(), `events/${EV}/spectateurs`)))
    await assertFails(getDoc(doc(anon(), `events/${EV}/staff/s1`)))
    await assertFails(getDoc(doc(anon(), 'staff/r1')))
    await assertFails(getDocs(collection(anon(), `events/${EV}/benevoles`)))
    await assertFails(getDoc(doc(anon(), `events/${EV}/liens/borne`)))
  })
  it('n\'écrit rien (faux compte, faux billet, entrée effacée)', async () => {
    await assertFails(setDoc(doc(anon(), `events/${EV}/spectateurs/FY-FAUX12`), { id: 'FY-FAUX12', solde: 99999 }))
    await assertFails(updateDoc(doc(anon(), `events/${EV}/spectateurs/FY-K7Q3NP`), { 'billet.entrees': {} }))
  })
  it('voit le programme et le thème publics', async () => {
    await assertSucceeds(getDocs(collection(anon(), `events/${EV}/planning`)))
    await assertSucceeds(getDocs(collection(anon(), `events/${EV}/programme-em`)))
    await assertFails(setDoc(doc(anon(), `events/${EV}/programme-em/p13`), { artiste: 'Faux' }))
    await assertSucceeds(getDoc(doc(anon(), `events/${EV}/settings/global`)))
    await assertSucceeds(getDoc(doc(anon(), `events/${EV}`)))
  })
})

describe('spectateur', () => {
  it('lit son compte, ses transactions et ses réservations, pas ceux des autres', async () => {
    const db = as(SPEC)
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/spectateurs`), where('id', '==', 'FY-K7Q3NP'))))
    await assertFails(getDocs(query(collection(db, `events/${EV}/spectateurs`), where('id', '==', 'FY-AB2C3D'))))
    await assertFails(getDocs(collection(db, `events/${EV}/spectateurs`)))
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/transactions`), where('specId', '==', 'FY-K7Q3NP'))))
    await assertFails(getDocs(query(collection(db, `events/${EV}/transactions`), where('specId', '==', 'FY-AB2C3D'))))
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/reservations`), where('specId', '==', 'FY-K7Q3NP'))))
  })
  it('ne se crédite pas et ne réserve pas au nom d\'un autre', async () => {
    const db = as(SPEC)
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`), { solde: 99999 }))
    await assertFails(setDoc(doc(db, `events/${EV}/reservations/x`), { specId: 'FY-AB2C3D', status: 'pending' }))
    // Sécurité (20/11/2026) : plus de réservation créée depuis l'espace, seule l'annulation reste
    await assertFails(setDoc(doc(db, `events/${EV}/reservations/x`), { specId: 'FY-K7Q3NP', status: 'pending' }))
    await assertFails(updateDoc(doc(db, `events/${EV}/reservations/r1`), { status: 'collected' }))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/reservations/r1`), { status: 'cancelled', cancelledBy: 'Awa' }))
    await assertFails(setDoc(doc(db, `events/${EV}/transactions/x`), { specId: 'FY-K7Q3NP', type: 'credit', montant: 5000 }))
    await assertFails(setDoc(doc(db, `events/${EV}/transactions/y`), { specId: 'FY-K7Q3NP', type: 'annulation', montant: 5000 }))
    await assertSucceeds(setDoc(doc(db, `events/${EV}/transactions/z`), { specId: 'FY-K7Q3NP', type: 'annulation', montant: 0 }))
    await assertFails(updateDoc(doc(db, `events/${EV}/menu/m1`), { stock: 0 }))
  })
  it('ne voit rien d\'un autre événement', async () => {
    const { uid, ...claims } = SPEC
    const db = env.authenticatedContext(uid, { ...claims, yc: 1, eventIds: ['autre'] }).firestore()
    await assertFails(getDocs(query(collection(db, `events/${EV}/transactions`), where('specId', '==', 'FY-K7Q3NP'))))
  })
})

describe('bénévole', () => {
  it('lit sa fiche, pas celles des autres ; ne modifie ni ses droits ni ses consommations', async () => {
    const db = as(BENEV)
    await assertSucceeds(getDoc(doc(db, `events/${EV}/benevoles/b1`)))
    await assertFails(getDoc(doc(db, `events/${EV}/benevoles/b2`)))
    await assertFails(getDocs(collection(db, `events/${EV}/benevoles`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { consommation: { repas: 0 } }))
    await assertFails(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { 'consoJours.2027-05-15.repas': 0 }))
    await assertFails(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { droitsJours: { '2027-05-15': { repas: 9 } } }))
    await assertFails(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { droits: { repas: 99 } }))
  })
  // Écran 13 (24/11/2026) : porte-monnaie du bénévole, lu par lui seul
  it('lit son porte-monnaie, pas celui des autres, et ne le modifie pas', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), `events/${EV}/spectateurs/FY-BVAAAAAA`), { id: 'FY-BVAAAAAA', solde: 500, benevoleId: 'b1', porteMonnaieBenevole: true })
      await setDoc(doc(ctx.firestore(), `events/${EV}/spectateurs/FY-BVBBBBBB`), { id: 'FY-BVBBBBBB', solde: 900, benevoleId: 'b2', porteMonnaieBenevole: true })
    })
    const db = as({ ...BENEV, specId: 'FY-BVAAAAAA', specDoc: 'FY-BVAAAAAA' })
    await assertSucceeds(getDoc(doc(db, `events/${EV}/spectateurs/FY-BVAAAAAA`)))
    await assertFails(getDoc(doc(db, `events/${EV}/spectateurs/FY-BVBBBBBB`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-BVAAAAAA`), { solde: 99999 }))
    await assertFails(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { porteMonnaie: { id: 'FY-BVBBBBBB', docId: 'FY-BVBBBBBB' } }))
  })
  // 23/11/2026 (écran 8) : le contrôle des billets passe au rôle équipe « Contrôle entrée »
  it('ne contrôle plus les billets : ni lecture des fiches, ni entrée notée', async () => {
    const db = as(BENEV)
    await assertFails(getDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await assertFails(getDoc(doc(db, `events/${EV}/spectateurs/FY-INCONN`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`), { 'billet.entrees.2027-05-15': '14:02' }))
    await assertFails(setDoc(doc(db, `events/${EV}/entrees/e1`), { code: 'K7Q3NP' }))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`), { 'billet.annule': true }))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`), { solde: 0 }))
    await assertFails(getDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`)))
  })
  it('n\'accède pas aux finances ni aux clés des liens', async () => {
    const db = as(BENEV)
    await assertFails(getDoc(doc(db, `events/${EV}/finances/f1`)))
    await assertFails(getDoc(doc(db, `events/${EV}/liens/borne`)))
  })
})

describe('artiste, borne et écran', () => {
  it('l\'artiste ne modifie que les champs permis de son créneau', async () => {
    const db = as(ARTISTE)
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/planning/cr1`), { artistFcmTokens: ['t'] }))
    await assertFails(updateDoc(doc(db, `events/${EV}/planning/cr1`), { avantages: { boissons: 99 } }))
  })
  it("l'artiste d'Event Manager lit sa seule fiche et n'en change pas les avantages", async () => {
    const db = as(ARTISTE_EM)
    await assertSucceeds(getDoc(doc(db, `events/${EV}/artistes/em-a7`)))
    await assertFails(getDoc(doc(db, `events/${EV}/artistes/em-a8`)))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/artistes/em-a7`), { linkedSpecId: 'FY-K7Q3NP', linkedSpecNom: 'Awa' }))
    await assertFails(updateDoc(doc(db, `events/${EV}/artistes/em-a7`), { avantagesJours: { '2027-05-15': { repas: 99 } } }))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `events/${EV}/artistes/em-a7`)))
  })
  it("les fiches d'artistes d'Event Manager : lues par l'équipe, écrites par le serveur (et l'administrateur pour l'archive)", async () => {
    await assertSucceeds(getDocs(collection(as(STAND), `events/${EV}/artistes`)))
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}/artistes/em-a7`), { avantagesJours: {} }))
    await assertSucceeds(setDoc(doc(as(ADMIN), `events/${EV}/artistes/em-a9`), { nom: 'Restauré' }))
  })
  it('la borne lit un compte et débite son solde, sans rien d\'autre', async () => {
    const db = as(BORNE)
    // Sécurité (20/11/2026) : sans autorisation du serveur (QR tournant vérifié), ni lecture ni débit
    await assertFails(getDocs(query(collection(db, `events/${EV}/spectateurs`), where('id', '==', 'FY-AB2C3D'))))
    await assertFails(getDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`), { solde: 0 }))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `events/${EV}/autorisations/FY-AB2C3D`), { exp: new Date(Date.now() + 600000) })
    })
    await assertSucceeds(getDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`), { solde: 999999 }))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`), { solde: 0 }))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`), { nom: 'X' }))
    await assertFails(getDoc(doc(db, `events/${EV}/finances/f1`)))
  })
  it('la borne lit un code connu et le passe à « utilisé », rien d\'autre', async () => {
    const db = as(BORNE)
    await assertSucceeds(getDoc(doc(db, `events/${EV}/codes/482913`)))
    await assertFails(getDocs(collection(db, `events/${EV}/codes`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/codes/482913`), { total: 0 }))
    await assertFails(updateDoc(doc(db, `events/${EV}/codes/111111`), { statut: 'utilise', commandeId: 'c2' }))
    await assertFails(setDoc(doc(db, `events/${EV}/codes/999999`), { statut: 'en_attente', total: 0 }))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/codes/482913`), { statut: 'utilise', commandeId: 'c1', commandeNumero: 47 }))
    await assertFails(getDoc(doc(as(SPEC), `events/${EV}/codes/111111`)))
  })
  it('le spectateur crée, lit et annule ses codes en ligne, jamais ceux des autres', async () => {
    const db = as(SPEC)
    const mien = { code: '333333', origine: 'en-ligne', specId: 'FY-K7Q3NP', statut: 'en_attente', total: 900, items: [], commandeId: null }
    await assertSucceeds(setDoc(doc(db, `events/${EV}/codes/333333`), mien))
    await assertFails(setDoc(doc(db, `events/${EV}/codes/444444`), { ...mien, specId: 'FY-AB2C3D' }))
    await assertFails(setDoc(doc(db, `events/${EV}/codes/555555`), { ...mien, statut: 'utilise' }))
    await assertFails(setDoc(doc(db, `events/${EV}/codes/482913`), mien))   // code déjà pris
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/codes`), where('specId', '==', 'FY-K7Q3NP'))))
    await assertFails(getDoc(doc(db, `events/${EV}/codes/482913`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/codes/333333`), { statut: 'utilise' }))
    await assertFails(updateDoc(doc(db, `events/${EV}/codes/333333`), { total: 1 }))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/codes/333333`), { statut: 'annule' }))
  })
  it('le bénévole crée, lit et annule ses codes, jamais ceux des autres', async () => {
    const db = as(BENEV)
    const mien = { code: '666666', origine: 'benevole', benevoleId: 'b1', statut: 'en_attente', total: 0, items: [], commandeId: null }
    await assertSucceeds(setDoc(doc(db, `events/${EV}/codes/666666`), mien))
    await assertFails(setDoc(doc(db, `events/${EV}/codes/777777`), { ...mien, benevoleId: 'b2' }))
    await assertFails(setDoc(doc(db, `events/${EV}/codes/888888`), { ...mien, origine: 'en-ligne' }))
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/codes`), where('benevoleId', '==', 'b1'))))
    await assertFails(getDoc(doc(db, `events/${EV}/codes/482913`)))
    await assertFails(updateDoc(doc(db, `events/${EV}/codes/666666`), { statut: 'utilise' }))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/codes/666666`), { statut: 'annule' }))
  })
  it("l'équipe crée et lit les codes", async () => {
    await assertSucceeds(setDoc(doc(as(STAND), `events/${EV}/codes/222222`), { statut: 'en_attente', total: 500 }))
    await assertSucceeds(getDocs(collection(as(STAND), `events/${EV}/codes`)))
  })
  it('l\'écran ne lit que les commandes prêtes', async () => {
    const db = as(ECRAN)
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/reservations`), where('status', '==', 'ready'))))
    await assertFails(getDocs(collection(db, `events/${EV}/reservations`)))
  })
})

describe('équipe', () => {
  it('un membre lit les données de son événement ; seul un administrateur gère l\'équipe', async () => {
    await assertSucceeds(getDocs(collection(as(STAND), `events/${EV}/spectateurs`)))
    await assertSucceeds(getDoc(doc(as(STAND), `events/${EV}/finances/f1`)))
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}/staff/s1`), { role: 'admin' }))
    await assertSucceeds(updateDoc(doc(as(ADMIN), `events/${EV}/staff/s1`), { role: 'billetterie' }))
  })
  it("le programme d'Event Manager ne se modifie pas depuis YllaCash, sauf archivage par un administrateur", async () => {
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}/programme-em/p12`), { artiste: 'Autre' }))
    await assertSucceeds(setDoc(doc(as(ADMIN), `events/${EV}/programme-em/p12`), { artiste: 'Awa', source: 'event-manager' }))
  })
  // Écran 10 (23/11/2026) : le rôle d'équipe d'un bénévole n'est écrit que par le serveur
  it("personne ne donne un rôle d'équipe à un bénévole depuis l'appli, même un admin", async () => {
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}/benevoles/b2`), { roleEquipe: 'billetterie' }))
    await assertFails(updateDoc(doc(as(ADMIN), `events/${EV}/benevoles/b2`), { roleEquipe: 'billetterie' }))
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}/benevoles/b2`), { username: 'awa.diallo' }))
    await assertFails(setDoc(doc(as(ADMIN), `events/${EV}/benevoles/b9`), { prenom: 'X', roleEquipe: 'consultation' }))
    await assertSucceeds(updateDoc(doc(as(ADMIN), `events/${EV}/benevoles/b2`), { poste: 'Bar' }))
  })
  // Écran 11 (24/11/2026) : onglet de rôle d'un bénévole, ouvert par le serveur jusqu'à roleJusqua
  it("l'onglet de rôle donne l'accès de l'équipe jusqu'à l'heure prévue, puis plus rien", async () => {
    const dans = (min) => Date.now() + min * 60000
    const ouvert = as({ ...BENEV, roleEquipe: 'billetterie', roleMode: 'complet', roleJusqua: dans(30) })
    const expire = as({ ...BENEV, roleEquipe: 'billetterie', roleMode: 'complet', roleJusqua: dans(-1) })
    const cloture = as({ ...BENEV, roleEquipe: 'billetterie', roleMode: 'cloture', roleJusqua: dans(20) })
    await assertSucceeds(getDoc(doc(ouvert, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await assertSucceeds(updateDoc(doc(ouvert, `events/${EV}/spectateurs/FY-K7Q3NP`), { solde: 2000 }))
    await assertFails(getDoc(doc(expire, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await assertSucceeds(getDoc(doc(cloture, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await assertFails(updateDoc(doc(cloture, `events/${EV}/spectateurs/FY-K7Q3NP`), { solde: 2000 }))
    await assertSucceeds(setDoc(doc(cloture, `events/${EV}/clotures/c1`), { caisse: 'Awa' }))
    await assertFails(updateDoc(doc(ouvert, `events/${EV}/benevoles/b2`), { roleEquipe: 'billetterie' }))
  })
  // Écran 12 : ouverture exceptionnelle, coupée dès que l'admin l'annule
  it("une ouverture exceptionnelle ne vaut que tant que la fiche la porte", async () => {
    const exc = as({ ...BENEV, roleEquipe: 'billetterie', roleMode: 'complet', roleJusqua: Date.now() + 30 * 60000, roleExc: true })
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `events/${EV}/benevoles/b1`), { roleException: { jusqua: Date.now() + 20 * 60000 } }))
    await assertSucceeds(getDoc(doc(exc, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `events/${EV}/benevoles/b1`), { roleException: deleteField() }))
    await assertFails(getDoc(doc(exc, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await assertFails(updateDoc(doc(as(ADMIN), `events/${EV}/benevoles/b1`), { roleException: { jusqua: 1 } }))
  })
  // 24/11/2026 : journal d'audit lu par les admins et la consultation seulement
  it("seuls les admins et la consultation lisent le journal d'audit", async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `events/${EV}/audit/a1`), { action: 'TEST' }))
    await assertSucceeds(getDoc(doc(as(ADMIN), `events/${EV}/audit/a1`)))
    await assertSucceeds(getDoc(doc(as({ uid: 'staff:c', type: 'staff', role: 'consultation' }), `events/${EV}/audit/a1`)))
    await assertFails(getDoc(doc(as({ uid: 'staff:b', type: 'staff', role: 'billetterie' }), `events/${EV}/audit/a1`)))
    await assertFails(getDoc(doc(as({ ...BENEV, roleEquipe: 'billetterie', roleMode: 'complet', roleJusqua: Date.now() + 600000 }), `events/${EV}/audit/a1`)))
    await assertSucceeds(setDoc(doc(as({ uid: 'staff:b', type: 'staff', role: 'billetterie' }), `events/${EV}/audit/a2`), { action: 'TEST' }))
  })
  it('personne ne lit les compteurs d\'essais, réservés au serveur', async () => {
    await assertFails(getDoc(doc(as(ADMIN), 'securite-connexions/c1')))
  })
})

describe('mode ancien (événement pas encore fermé)', () => {
  it('les données courantes restent ouvertes, mais pas l\'équipe ni les bénévoles', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), `events/${EV}`), { securite: deleteField() }))
    const anon = env.unauthenticatedContext().firestore()
    await assertSucceeds(getDocs(collection(anon, `events/${EV}/spectateurs`)))
    await assertFails(getDocs(collection(anon, `events/${EV}/staff`)))
    await assertFails(getDocs(collection(anon, `events/${EV}/benevoles`)))
    await assertFails(getDoc(doc(anon, 'staff/r1')))
  })
})

describe('droits de l\'équipe', () => {
  it('personne ne se donne plus de droits ni n\'écrit le registre des ventes du site', async () => {
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}/staff/s1`), { role: 'admin' }))
    await assertSucceeds(updateDoc(doc(as(STAND), `events/${EV}/staff/s1`), { avatar: 'x' }))
    await assertFails(setDoc(doc(as(ADMIN), `events/${EV}/billetterie-recus/m1`), { type: 'vente' }))
    await assertFails(updateDoc(doc(as(STAND), `events/${EV}`), { securite: 'ouverte' }))
    await assertSucceeds(updateDoc(doc(as(STAND), `events/${EV}`), { actif: true }))
  })
})

describe("clés de liaison (règle d'échange v1.3)", () => {
  it("ne sont lisibles par aucun navigateur, même celui d'un administrateur", async () => {
    await assertFails(getDoc(doc(as(ADMIN), 'liaisons/k1')))
    await assertFails(getDocs(collection(as(ADMIN), 'liaisons')))
    await assertFails(getDoc(doc(as(ADMIN), `liaisons-em/${EV}`)))
    await assertFails(setDoc(doc(as(ADMIN), 'liaisons/k2'), { ev: EV, empreinte: 'b'.repeat(64) }))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `liaisons-em/${EV}`)))
    await assertFails(getDoc(doc(as(ADMIN), `em-instantanes/${EV}`)))
    await assertFails(setDoc(doc(as(ADMIN), `em-instantanes/${EV}`), { version: 'b'.repeat(32) }))
  })
})
