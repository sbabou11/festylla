/**
 * utils/imageUtils.js
 *
 * Compresse une image avant de la stocker en base64 dans Firestore.
 * Firestore limite chaque champ à 1 MB → base64 d'une image > ~700 ko
 * (1 MB / 1.33 pour l'overhead base64) ne passe pas. Cette fonction garantit
 * que la sortie reste sous cette limite tout en gardant une qualité visuelle correcte.
 *
 * Stratégie :
 *   1. Redimensionne d'abord à `maxSize` (le plus grand côté, 800px par défaut)
 *   2. Compresse en JPEG à `quality` (0.80 par défaut)
 *   3. Si la sortie dépasse encore le quota, baisse la qualité par paliers jusqu'à 0.40
 *   4. Si toujours trop gros, redimensionne encore (boucle de secours)
 *
 * 800px en source = nettement plus que les tailles d'affichage maximales (220px en modale
 * détail, 72px en carte). Largement assez net pour des photos d'artistes / logos / produits.
 *
 * Plus de blocage utilisateur : on accepte n'importe quelle image en entrée (jpg, png,
 * webp, heic, etc.) — le canvas gère la conversion en JPEG via toDataURL.
 */

// Quota Firestore par champ = 1 048 487 octets. On vise large sous (800 ko) pour
// laisser de la marge aux autres champs du document.
const MAX_BASE64_BYTES = 800_000

/**
 * Compresse une image (File ou Blob) en data URL JPEG base64.
 *
 * @param {File|Blob} file        L'image à compresser
 * @param {number}    maxSize     Côté le plus long (px), défaut 800
 * @param {number}    quality     Qualité JPEG initiale (0..1), défaut 0.80
 * @returns {Promise<string>}     Data URL `data:image/jpeg;base64,…`
 */
export const compressImage = (file, maxSize = 800, quality = 0.80) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Format d\'image non reconnu.'))
      img.onload = () => {
        try {
          let currentMax = maxSize
          let currentQ   = quality
          let out        = render(img, currentMax, currentQ)

          // Boucle de secours : si malgré la compression initiale on dépasse,
          // on baisse d'abord la qualité, puis la taille.
          let safety = 0
          while (out.length > MAX_BASE64_BYTES && safety < 10) {
            if (currentQ > 0.42) {
              currentQ = Math.max(0.40, currentQ - 0.10)
            } else {
              currentMax = Math.round(currentMax * 0.85)
            }
            out = render(img, currentMax, currentQ)
            safety++
          }

          resolve(out)
        } catch (err) {
          reject(err)
        }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Helper : encode une image en JPEG à la taille / qualité demandées.
 */
function render(img, maxSize, quality) {
  let w = img.width
  let h = img.height
  if (w > h) {
    if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize }
  } else {
    if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize }
  }
  const canvas  = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // Fond blanc pour les PNG transparents (sinon ils deviennent noirs en JPEG)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Redimensionne et compresse une image pour Firebase Storage (sortie Blob JPEG).
 * Pour les photos d'articles affichées dans la borne/staff : 1200px côté long
 * en qualité 0.85 produit des photos d'environ 150–300 Ko, idéales pour le
 * web sans perte visible. Bien plus léger que les 5–10 Mo d'une photo pro.
 *
 * @param {File|Blob} file        L'image source
 * @param {number}    maxSize     Côté le plus long en px, défaut 1200
 * @param {number}    quality     Qualité JPEG (0..1), défaut 0.85
 * @returns {Promise<Blob>}       Blob JPEG redimensionné
 */
export const resizeImageToBlob = (file, maxSize = 1200, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error("Format d'image non reconnu."))
      img.onload = () => {
        try {
          let w = img.width, h = img.height
          if (w > h) {
            if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize }
          } else {
            if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize }
          }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Encodage JPEG impossible.')),
            'image/jpeg', quality
          )
        } catch (err) { reject(err) }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
