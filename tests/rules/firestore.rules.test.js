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
    await p(`events/${EV}/liens/borne`, { cle: 'a'.repeat(32) })
    await p(`events/${EV}/finances/f1`, { montant: 100 })
    await p(`events/${EV}/settings/global`, { theme: {} })
    await p(`securite-connexions/c1`, { echecs: 1 })
    await p(`liaisons/k1`, { ev: EV, nom: 'festylla.com', empreinte: 'a'.repeat(64) })
    await p(`liaisons-em/${EV}`, { cle: 'secret-event-manager' })
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
    await assertSucceeds(setDoc(doc(db, `events/${EV}/reservations/x`), { specId: 'FY-K7Q3NP', status: 'pending' }))
    await assertFails(setDoc(doc(db, `events/${EV}/transactions/x`), { specId: 'FY-K7Q3NP', type: 'credit', montant: 5000 }))
  })
  it('ne voit rien d\'un autre événement', async () => {
    const { uid, ...claims } = SPEC
    const db = env.authenticatedContext(uid, { ...claims, yc: 1, eventIds: ['autre'] }).firestore()
    await assertFails(getDocs(query(collection(db, `events/${EV}/transactions`), where('specId', '==', 'FY-K7Q3NP'))))
  })
})

describe('bénévole', () => {
  it('lit sa fiche, pas celles des autres ; met à jour sa seule consommation', async () => {
    const db = as(BENEV)
    await assertSucceeds(getDoc(doc(db, `events/${EV}/benevoles/b1`)))
    await assertFails(getDoc(doc(db, `events/${EV}/benevoles/b2`)))
    await assertFails(getDocs(collection(db, `events/${EV}/benevoles`)))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { consommation: { repas: 1 } }))
    await assertFails(updateDoc(doc(db, `events/${EV}/benevoles/b1`), { droits: { repas: 99 } }))
  })
  it('contrôle un billet : note l\'entrée, sans pouvoir annuler le billet ni toucher au solde', async () => {
    const db = as(BENEV)
    await assertSucceeds(getDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`)))
    await assertSucceeds(getDoc(doc(db, `events/${EV}/spectateurs/FY-INCONN`)))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/spectateurs/FY-K7Q3NP`), { 'billet.entrees.2027-05-15': '14:02' }))
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
  it('la borne lit un compte et débite son solde, sans rien d\'autre', async () => {
    const db = as(BORNE)
    await assertSucceeds(getDocs(query(collection(db, `events/${EV}/spectateurs`), where('id', '==', 'FY-AB2C3D'))))
    await assertSucceeds(updateDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`), { solde: 200 }))
    await assertFails(updateDoc(doc(db, `events/${EV}/spectateurs/FY-AB2C3D`), { nom: 'X' }))
    await assertFails(getDoc(doc(db, `events/${EV}/finances/f1`)))
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
  })
})
