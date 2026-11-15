// Tests automatiques (npm test) : la logique d'argent est vérifiée avant chaque déploiement
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: [{ find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./src/firebase/guardedFirestore.js', import.meta.url)) }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
