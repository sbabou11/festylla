/**
 * utils/redessin.js — forcer Safari (iPhone, iPad) à redessiner la page (24/11/2026)
 *
 * Après une animation de transition (cercle du thème, page qui glisse), Safari sur iPhone laisse
 * parfois une partie de la page non dessinée jusqu'au prochain toucher, et la vidéo de la caméra
 * qui démarre juste après reste blanche. On garde les animations ; à leur fin, on change une
 * propriété sans effet visible (opacité 0,999) le temps d'une image, ce qui oblige Safari à
 * redessiner. L'opacité ne déplace pas les éléments fixes (barre du bas), contrairement à transform.
 */

/** iPhone, iPad (y compris iPadOS qui se présente comme un Mac) : tous les navigateurs y sont Safari */
export function estIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
}

// Deux images plus tard ; minuterie de secours si les images ne viennent pas (onglet en arrière-plan)
const prochaineImage = (fn) => {
  let fait = false
  const une = () => { if (!fait) { fait = true; fn() } }
  requestAnimationFrame(() => requestAnimationFrame(une))
  setTimeout(une, 120)
}

/** Redessine les éléments donnés (par défaut : la zone de contenu et la page), sur iOS seulement */
export function forcerRedessin(elements = null, { partout = false } = {}) {
  if (!partout && !estIOS()) return
  if (typeof document === 'undefined') return
  const cibles = (elements || [document.querySelector('#root'), ...document.querySelectorAll('main, [data-redessin]')]).filter(Boolean)
  for (const el of cibles) {
    const avant = el.style.opacity
    el.style.opacity = '0.999'
    void el.offsetHeight   // oblige le calcul tout de suite
    prochaineImage(() => { el.style.opacity = avant })
  }
}

/** La vidéo de la caméra : redessinée dès qu'elle joue vraiment, puis une seconde plus tard */
export function redessinerVideo(video) {
  if (!video || !estIOS()) return
  const go = () => forcerRedessin([video, video.parentElement].filter(Boolean))
  if (!video.paused && video.readyState >= 2) go()
  video.addEventListener('playing', go, { once: true })
  setTimeout(go, 1000)
}
