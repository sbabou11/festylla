/**
 * pages/public/spectateur/PlanningSpec.jsx — programme du festival côté spectateur
 * (fiche artiste, favoris, filtres). Déplacé tel quel depuis SoldePage.jsx (lot 3).
 * Nouveau style (23/11/2026, maquette validée) : cartes, lignes et pastilles `nv-*`, icônes
 * à la place des émojis, styles dans SoldePage.module.css (préfixe `pl`). Logique inchangée.
 */
import React from 'react'
import clsx from 'clsx'
import { Music, BookOpen, Film, Sparkles, Heart, X, Search, Clock, MapPin, ExternalLink, Share2, CalendarPlus, CalendarDays } from 'lucide-react'
import { toast } from '../../../ui'
import sp from './SoldePage.module.css'

// ── Composant planning espace spectateur ──────────────────────────────
const TYPES_SPEC = {
  musical:           { Icon: Music,    label: 'Musical' },
  litteraire:        { Icon: BookOpen, label: 'Littéraire' },
  cinematographique: { Icon: Film,     label: 'Cinéma' },
  autre:             { Icon: Sparkles, label: 'Autre' },
}

function countdownSpec(ts, now) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.max(0, Math.round((d.getTime() - now) / 1000))
  if (isNaN(diff) || diff < 0) return ''
  if (diff === 0) return 'Maintenant'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return 'Dans ' + h + 'h' + String(m).padStart(2, '0')
  if (m > 0) return 'Dans ' + m + 'min'
  return 'Dans ' + diff + 's'
}

function dureeRestanteSpec(fin, now) {
  if (!fin) return ''
  const f = fin.toDate ? fin.toDate() : new Date(fin)
  const diff = Math.max(0, Math.round((f.getTime() - now) / 1000))
  if (isNaN(diff)) return ''
  if (diff === 0) return 'Termine maintenant'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return 'Encore ' + h + 'h' + String(m).padStart(2, '0')
  return 'Encore ' + m + 'min'
}

function autoStatutSpec(cr) {
  if (cr.statut === 'annule') return 'annule'
  const now = Date.now()
  const d = cr.debut?.toDate ? cr.debut.toDate().getTime() : cr.debut ? new Date(cr.debut).getTime() : NaN
  const f = cr.fin?.toDate   ? cr.fin.toDate().getTime()   : cr.fin   ? new Date(cr.fin).getTime()   : NaN
  // Si dates invalides, se fier au statut Firestore
  if (isNaN(d) || isNaN(f)) return cr.statut || 'a-venir'
  if (now < d) return 'a-venir'
  if (now >= d && now <= f) return 'en-cours'
  return 'termine'
}

function fmt2Spec(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ── Carte artiste spectateur (feuille du bas, nouveau style 23/11/2026) ──
function CarteArtisteSpec({ cr, onClose, isFav, onToggleFav, themeColor }) {
  const ti = TYPES_SPEC[cr.type] || TYPES_SPEC.autre
  const TypeIcon = ti.Icon
  const [now, setNow] = React.useState(Date.now())
  const hasLocation = cr.latitude && cr.longitude
  const closeRef = React.useRef(null)

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  // Échap ferme la fiche ; le focus va sur « Fermer » (23/11/2026)
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus?.()
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const st      = autoStatutSpec(cr)
  const timer   = st === 'en-cours' ? dureeRestanteSpec(cr.fin, now) : st === 'a-venir' ? countdownSpec(cr.debut, now) : ''

  return (
    <div className={sp.plScrim} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={clsx(sp.plSheet, 'nv-up')} role="dialog" aria-modal="true" aria-labelledby="pl-fiche-titre">
        <div className={clsx(sp.plSheetHead, !cr.photo && sp.plSheetHeadPlain)}>
          {cr.photo && <img loading="lazy" src={cr.photo} alt={cr.artiste} style={{ objectPosition: cr.photoPosition || 'center center' }} />}
          <div className={sp.plSheetBtns}>
            <button type="button" className={clsx('nv-round nv-press', isFav && sp.plFavOn)} onClick={e => { e.stopPropagation(); onToggleFav(cr.id) }}
              aria-pressed={isFav} aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
              <Heart size={20} aria-hidden="true" />
            </button>
            <button ref={closeRef} type="button" className="nv-round nv-press" onClick={onClose} aria-label="Fermer la fiche"><X size={20} aria-hidden="true" /></button>
          </div>
          <div>
            {!cr.photo && <TypeIcon size={32} aria-hidden="true" />}
            <h2 id="pl-fiche-titre">{cr.artiste}</h2>
            {cr.titre && <p>{cr.titre}</p>}
          </div>
        </div>

        <div className={sp.plSheetBody}>
          <div className={sp.plTags}>
            <span className={sp.plTag}><TypeIcon size={14} aria-hidden="true" /> {ti.label}</span>
            <span className={sp.plTag}><Clock size={14} aria-hidden="true" /> {fmt2Spec(cr.debut)} → {fmt2Spec(cr.fin)}</span>
            {cr.scene && <span className={sp.plTag}><MapPin size={14} aria-hidden="true" /> {cr.scene}</span>}
            {st === 'en-cours' && <span className={clsx(sp.plTag, sp.plTagLive)}>En cours{timer ? ` · ${timer}` : ''}</span>}
            {st === 'a-venir' && cr.statut !== 'annule' && timer && <span className={clsx(sp.plTag, sp.plTagSoon)}>{timer}</span>}
            {st === 'termine' && cr.statut !== 'annule' && <span className={sp.plTag}>Terminé</span>}
            {cr.statut === 'annule' && <span className={clsx(sp.plTag, sp.plTagOff)}>Annulé</span>}
          </div>

          {cr.bio && <p>{cr.bio}</p>}
          {cr.description && <p className="nv-mu">{cr.description}</p>}

          {cr.liens && Object.entries(cr.liens).some(([,v])=>v) && (
            <div className={sp.plLinks}>
              {Object.entries(cr.liens).filter(([,v])=>v).map(([k,v])=>(
                <a key={k} href={v} target="_blank" rel="noreferrer">{k} <ExternalLink size={14} aria-hidden="true" style={{ marginLeft: 6 }} /></a>
              ))}
            </div>
          )}

          <div className={sp.plActions}>
            <button type="button" className="nv-btn-sec nv-press" onClick={() => {
              const text = cr.artiste + (cr.titre ? ' — ' + cr.titre : '') + '\n🕐 ' + fmt2Spec(cr.debut) + (cr.scene ? ' · 📍 ' + cr.scene : '')
              if (navigator.share) {
                navigator.share({ title: cr.artiste, text, url: lienPublic() }).catch(() => {})
              } else {
                navigator.clipboard?.writeText(text + '\n' + lienPublic()).then(() => toast.success('Lien copié')).catch(() => {})
              }
            }}>
              <Share2 size={18} aria-hidden="true" /> Partager
            </button>
            <button type="button" className="nv-btn-sec nv-press" onClick={() => {
              const fmtDate = (d) => {
                const dt = d?.toDate ? d.toDate() : new Date(d)
                return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
              }
              const uid = (cr.id || Date.now()) + '@yllacash'
              const ics = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//YllaCash//Planning//FR',
                'BEGIN:VEVENT',
                'UID:' + uid,
                'DTSTAMP:' + fmtDate(new Date()),
                'DTSTART:' + fmtDate(cr.debut),
                'DTEND:' + fmtDate(cr.fin),
                'SUMMARY:' + (cr.artiste + (cr.titre ? ' — ' + cr.titre : '')),
                cr.scene ? 'LOCATION:' + cr.scene : '',
                cr.bio ? 'DESCRIPTION:' + cr.bio.replace(/\n/g, '\\n') : '',
                'END:VEVENT',
                'END:VCALENDAR'
              ].filter(Boolean).join('\r\n')
              const blob = new Blob([ics], { type: 'text/calendar' })
              const url  = URL.createObjectURL(blob)
              const a    = document.createElement('a')
              a.href = url
              a.download = (cr.artiste || 'evenement').replace(/[^a-z0-9]/gi,'_') + '.ics'
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
            }}>
              <CalendarPlus size={18} aria-hidden="true" /> Agenda
            </button>
          </div>

          {hasLocation && (
            <div>
              <div className={sp.catTitle} style={{ marginBottom: 8 }}>Lieu du festival</div>
              <div className={sp.plMap}>
                <iframe
                  title="Localisation festival"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${cr.longitude-0.005}%2C${cr.latitude-0.005}%2C${cr.longitude+0.005}%2C${cr.latitude+0.005}&layer=mapnik&marker=${cr.latitude}%2C${cr.longitude}`}
                />
              </div>
              <a className={sp.plLink} href={`https://www.openstreetmap.org/?mlat=${cr.latitude}&mlon=${cr.longitude}#map=16/${cr.latitude}/${cr.longitude}`}
                target="_blank" rel="noreferrer">
                Ouvrir dans Maps <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PlanningSpec ───────────────────────────────────────────────────────
function PlanningSpec({ planning, eventId, specId, themeColor }) {
  const [carteOpen, setCarteOpen]   = React.useState(null)
  const [search, setSearch]         = React.useState('')
  const [filterType, setFilterType] = React.useState('tous')
  const [filterScene, setFilterScene] = React.useState('tous')
  const [now, setNow]               = React.useState(Date.now())
  const [favs, setFavs]             = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('yllacash-favs-'+specId) || '[]')) }
    catch { return new Set() }
  })

  // Mode d'affichage : list (défaut) | compact | grid
  const [viewMode, setViewMode]     = React.useState(() => {
    try {
      const saved = localStorage.getItem('yllacash-planningspec-view')
      if (['list','compact','grid'].includes(saved)) return saved
    } catch {}
    return 'list'
  })
  React.useEffect(() => {
    try { localStorage.setItem('yllacash-planningspec-view', viewMode) } catch {}
  }, [viewMode])

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Scroll automatique désactivé : la page ne saute plus toute seule au créneau en cours.

  const toggleFav = (id) => {
    setFavs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('yllacash-favs-'+specId, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const FILTERS = [
    { value: 'tous',             label: 'Tous' },
    { value: 'favoris',          label: 'Favoris' },
    { value: 'musical',          label: 'Musical' },
    { value: 'litteraire',       label: 'Littéraire' },
    { value: 'cinematographique',label: 'Cinéma' },
    { value: 'autre',            label: 'Autre' },
  ]

  // Liste des scènes uniques pour le filtre
  const scenes = [...new Set(planning.map(p => p.scene).filter(Boolean))]

  const filtered = planning.filter(cr => {
    const matchSearch = !search || cr.artiste.toLowerCase().includes(search.toLowerCase()) || (cr.titre||'').toLowerCase().includes(search.toLowerCase()) || (cr.scene||'').toLowerCase().includes(search.toLowerCase())
    const matchType   = filterType === 'tous' ? true
                      : filterType === 'favoris' ? favs.has(cr.id)
                      : cr.type === filterType
    const matchScene  = filterScene === 'tous' || cr.scene === filterScene
    return matchSearch && matchType && matchScene
  })

  // Carte « En cours » de la maquette : le premier créneau en cours, s'il y en a un (23/11/2026)
  const enCours = planning.find(cr => autoStatutSpec(cr) === 'en-cours')

  if (planning.length === 0) return (
    <div className={clsx('nv-card', sp.plEmpty)}>
      <CalendarDays size={32} aria-hidden="true" style={{ marginBottom: 10 }} />
      <div>Le programme n'est pas encore disponible.</div>
    </div>
  )

  const favBtn = (cr, fav) => (
    <button type="button" className={clsx(sp.plFav, 'nv-press', fav && sp.plFavOn)} onClick={e => { e.stopPropagation(); toggleFav(cr.id) }}
      aria-pressed={fav} aria-label={fav ? `Retirer ${cr.artiste} des favoris` : `Ajouter ${cr.artiste} aux favoris`}>
      <Heart size={22} aria-hidden="true" />
    </button>
  )
  const ouvrirAuClavier = (cr) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCarteOpen(cr) } }

  return (
    <div>
      {eventId && (
        <div className={sp.plHead}>
          <a className={sp.plLink} href={'/live?ev='+eventId} target="_blank" rel="noreferrer">
            Vue plein écran <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      )}

      {enCours && (
        <button type="button" className={clsx(sp.plNow, 'nv-press')} onClick={() => setCarteOpen(enCours)}>
          <span>En cours{enCours.scene ? ` · ${enCours.scene}` : ''}</span>
          <b>{enCours.artiste}</b>
          <span>{enCours.titre ? `${enCours.titre} · ` : ''}jusqu'à {fmt2Spec(enCours.fin)}</span>
        </button>
      )}

      {/* Recherche en pilule */}
      <label className={clsx('nv-search', sp.plSearch)}>
        <Search size={20} aria-hidden="true" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un artiste, un lieu…" aria-label="Rechercher dans le programme" />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"><X size={18} aria-hidden="true" /></button>
        )}
      </label>

      {/* Refonte téléphone (20/11/2026) : genre, scène et affichage en listes déroulantes */}
      <div className={sp.plFilters} style={{ gridTemplateColumns: `repeat(${scenes.length > 1 ? 3 : 2}, minmax(0, 1fr))` }}>
        <label>Genre
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        {scenes.length > 1 && (
          <label>Scène
            <select value={filterScene} onChange={e => setFilterScene(e.target.value)}>
              <option value="tous">Toutes</option>
              {scenes.map(sc => <option key={sc} value={sc}>{sc}</option>)}
            </select>
          </label>
        )}
        <label>Affichage
          <select value={viewMode} onChange={e => setViewMode(e.target.value)}>
            <option value="list">Liste</option>
            <option value="compact">Compact</option>
            <option value="grid">Grille</option>
          </select>
        </label>
      </div>

      {/* Résultats */}
      {filtered.length === 0 ? (
        <div className={clsx('nv-card', sp.plEmpty)}>
          {filterType === 'favoris' ? 'Aucun favori pour le moment. Touchez le cœur pour en ajouter.' : 'Aucun résultat pour cette recherche.'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className={clsx(sp.plGrid, 'nv-st')}>
          {filtered.map(cr => {
            const ti  = TYPES_SPEC[cr.type] || TYPES_SPEC.autre
            const TypeIcon = ti.Icon
            const st  = autoStatutSpec(cr)
            const dim = st === 'termine' || cr.statut === 'annule'
            const fav = favs.has(cr.id)
            return (
              <div key={cr.id} role="button" tabIndex={0} className={clsx('nv-card nv-press', sp.plTile, dim && sp.plDim)}
                onClick={() => setCarteOpen(cr)} onKeyDown={ouvrirAuClavier(cr)} aria-label={`${cr.artiste}, ${fmt2Spec(cr.debut)}`}>
                <div className={sp.plTileImg}>
                  {cr.photo
                    ? <img loading="lazy" src={cr.photo} alt="" style={{ objectPosition: cr.photoPosition || 'center center' }} />
                    : <TypeIcon size={32} aria-hidden="true" />}
                </div>
                {st === 'en-cours' && <span className={clsx(sp.plTag, sp.plTagLive)}>En cours</span>}
                {favBtn(cr, fav)}
                <div className={sp.plTileTxt}>
                  <b>{cr.artiste}</b>
                  <span>{fmt2Spec(cr.debut)}{cr.scene ? ` · ${cr.scene}` : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={clsx('nv-card nv-padx', sp.plList, viewMode === 'compact' && sp.plCompact)}>
          {filtered.map(cr => {
            const ti  = TYPES_SPEC[cr.type] || TYPES_SPEC.autre
            const TypeIcon = ti.Icon
            const st  = autoStatutSpec(cr)
            const dim = st === 'termine' || cr.statut === 'annule'
            const fav = favs.has(cr.id)
            const compact = viewMode === 'compact'
            return (
              <div key={cr.id} role="button" tabIndex={0} className={clsx('nv-row', sp.plRow, dim && sp.plDim)}
                onClick={() => setCarteOpen(cr)} onKeyDown={ouvrirAuClavier(cr)}>
                <span className={sp.plPic}>
                  {cr.photo && !compact
                    ? <img loading="lazy" src={cr.photo} alt="" style={{ objectPosition: cr.photoPosition || 'center center' }} />
                    : <TypeIcon size={compact ? 18 : 24} aria-hidden="true" />}
                  {st === 'en-cours' && !compact && <span className={sp.plLive} aria-hidden="true" />}
                </span>
                <span className="nv-rt">
                  <b>{cr.artiste}</b>
                  {cr.titre && !compact && <span>{cr.titre}</span>}
                  <span>{fmt2Spec(cr.debut)}{cr.fin ? ' → ' + fmt2Spec(cr.fin) : ''}{cr.scene ? ' · ' + cr.scene : ''}</span>
                  {!compact && (
                    <span className={sp.plTags}>
                      {st === 'en-cours' && <span className={clsx(sp.plTag, sp.plTagLive)}>En cours · {dureeRestanteSpec(cr.fin, now)}</span>}
                      {cr.statut === 'annule' && <span className={clsx(sp.plTag, sp.plTagOff)}>Annulé</span>}
                      {st === 'termine' && cr.statut !== 'annule' && <span className={sp.plTag}>Terminé</span>}
                      {st === 'a-venir' && cr.statut !== 'annule' && countdownSpec(cr.debut, now) && (
                        <span className={clsx(sp.plTag, sp.plTagSoon)}>{countdownSpec(cr.debut, now)}</span>
                      )}
                    </span>
                  )}
                  {compact && st === 'en-cours' && <span className={sp.plTags}><span className={clsx(sp.plTag, sp.plTagLive)}>En cours</span></span>}
                </span>
                {favBtn(cr, fav)}
              </div>
            )
          })}
        </div>
      )}
      {carteOpen && <CarteArtisteSpec cr={carteOpen} onClose={() => setCarteOpen(null)} isFav={favs.has(carteOpen.id)} onToggleFav={toggleFav} themeColor={themeColor}/>}
    </div>
  )
}


// Sécurité (20/11/2026) : on partage le programme public, jamais l'adresse de son espace (elle
// contient le numéro du compte et sa clé)
const lienPublic = () => {
  const ev = new URLSearchParams(window.location.search).get('ev')
  return `${window.location.origin}/live${ev ? `?ev=${encodeURIComponent(ev)}` : ''}`
}

export default PlanningSpec
