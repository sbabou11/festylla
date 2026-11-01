/**
 * store/useSunMode.js — thème « plein soleil » des écrans de stand (préférence de l'appareil)
 * const { sun, toggleSun } = useSunMode() ; poser className={sun ? 'sun' : ''} sur l'écran.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useSunMode = create(persist(
  (set, get) => ({
    sun: false,
    toggleSun: () => set({ sun: !get().sun }),
  }),
  { name: 'yllacash-sun-mode' },
))

export default useSunMode
