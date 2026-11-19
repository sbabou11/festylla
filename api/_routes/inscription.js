/**
 * api/_routes/inscription.js — ancienne création de compte publique (/inscription), fermée
 *
 * Choix de l'organisateur (20/11/2026) : un compte spectateur ne se crée plus que sur le site
 * internet, avec le billet (api/billets). En secours, un administrateur peut rouvrir la création
 * à la billetterie (réglage « Liaison du site en panne »). Cette adresse répond donc toujours 410.
 */
module.exports = async (req, res) => {
  res.status(410).json({ error: 'Les comptes se créent sur le site du festival, avec votre billet.' })
}
