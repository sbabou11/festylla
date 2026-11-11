// Tests automatiques (npm test) : la logique d'argent est vérifiée avant chaque déploiement
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
