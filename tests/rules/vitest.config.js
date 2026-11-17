// Tests des règles Firestore : à lancer avec l'émulateur (npm run test:rules), séparés des tests rapides
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/rules/**/*.test.js'], testTimeout: 20000, hookTimeout: 60000, fileParallelism: false },
})
