/**
 * components/Avatar.jsx
 * Affiche un avatar avec compression automatique avant upload.
 */
import React, { useRef } from 'react'
import { Camera } from 'lucide-react'
import { initials } from '../utils/helpers'
import { compressImage } from '../utils/imageUtils'

export default function Avatar({ nom = '', src = null, size = 40, onUpload = null, className = '' }) {
  const fileRef   = useRef(null)
  const fontSize  = Math.round(size * 0.35)
  const iconSize  = Math.round(size * 0.4)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !onUpload) return
    try {
      // Compression avant envoi — max 200px, qualité 70%
      const compressed = await compressImage(file, 200, 0.7)
      onUpload(compressed)
    } catch (err) {
      console.error('Compression échouée:', err)
    }
    e.target.value = ''
  }

  return (
    <div
      className={className}
      onClick={() => onUpload && fileRef.current?.click()}
      style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', overflow:'hidden', width:size, height:size, background:'var(--brand)', flexShrink:0, cursor:onUpload?'pointer':'default' }}>

      {/* Initiales */}
      {!src && (
        <span style={{ fontSize, fontWeight:700, color:'#fff', lineHeight:1, userSelect:'none' }}>
          {initials(nom)}
        </span>
      )}

      {/* Photo */}
      {src && (
        <img src={src} alt={nom} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
      )}

      {/* Overlay caméra */}
      {onUpload && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', borderRadius:'50%', opacity:0, transition:'opacity .15s' }}
          onMouseEnter={e => e.currentTarget.style.opacity=1}
          onMouseLeave={e => e.currentTarget.style.opacity=0}>
          <Camera size={iconSize} color="#fff" />
        </div>
      )}

      {/* Input file caché */}
      {onUpload && (
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handleFile} />
      )}
    </div>
  )
}
