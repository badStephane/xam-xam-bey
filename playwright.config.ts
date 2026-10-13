import { defineConfig, devices } from '@playwright/test'

/**
 * E2E (QA lot 2) : `vite dev` branché sur la pile Supabase LOCALE du projet (ports 553xx), jamais la production.
 * Prérequis : `supabase start` (voir README, section E2E). Lancement : `npm run e2e`. En CI : job « db + e2e ».
 */
export const LOCAL_API = 'http://127.0.0.1:55321'
export const MAILPIT = 'http://127.0.0.1:55324'
/** Clé anon de démonstration de la CLI Supabase (publique, identique sur tous les postes, pile locale seulement). */
const LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PORT = 5173

export default defineConfig({
  testDir: 'e2e',
  // Une seule boîte Mailpit et un seul serveur : en série, pour des e-mails lisibles sans ambiguïté.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    // localhost (et non 127.0.0.1) : seule origine locale autorisée en redirection par supabase/config.toml.
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Jamais un serveur déjà lancé : il pourrait viser la production (.env.local).
    reuseExistingServer: false,
    timeout: 60_000,
    // Les variables du processus priment sur .env.local (règle de Vite) : le site vise la pile locale.
    env: { VITE_SUPABASE_URL: LOCAL_API, VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY },
  },
})
