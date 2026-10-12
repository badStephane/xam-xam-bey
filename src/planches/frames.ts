/** Les cadres de la planche : chaque cadre charge l'application en mode démonstration avec un état précis. */
export interface Frame { label: string; mobile: boolean; screen: string; theme: 'dark' | 'light'; extra?: Record<string, string | number> }
export interface Section { n: string; title: string; desc: string; frames: Frame[] }

type Extra = Record<string, string | number>
const m = (label: string, screen: string, theme: 'dark' | 'light', extra?: Extra): Frame => ({ label, mobile: true, screen, theme, extra })
const d = (label: string, screen: string, theme: 'dark' | 'light', extra?: Extra): Frame => ({ label, mobile: false, screen, theme, extra })
const four = (screen: string, ex: { m?: Extra; d?: Extra } = {}): Frame[] => [
  m('Mobile · sombre', screen, 'dark', ex.m), m('Mobile · clair', screen, 'light', ex.m),
  d('Ordinateur · sombre', screen, 'dark', ex.d || ex.m), d('Ordinateur · clair', screen, 'light', ex.d || ex.m),
]

export const SECTIONS: Section[] = [
  { n: '01', title: 'Bibliothèque', desc: 'Itinéraire des zones, recherche, filtres, fiches perforées, aperçu latéral.', frames: four('bibliotheque', { d: { sel: 1 } }) },
  { n: '01b', title: 'Bibliothèque · états', desc: 'Chargement, aucun résultat, hors réseau, aperçu plein écran.', frames: [
    m('Chargement', 'bibliotheque', 'dark', { lib: 'loading' }), m('Aucun résultat', 'bibliotheque', 'light', { q: 'drapeau rouge' }),
    m('Hors réseau', 'bibliotheque', 'dark', { lib: 'offline' }), m('Aperçu plein écran', 'apercu', 'dark', { sel: 3 }),
    d('Ordinateur · hors réseau', 'bibliotheque', 'light', { lib: 'offline', sel: 2 })] },
  { n: '02', title: 'Révision · Aujourd’hui', desc: 'Indicateurs, session du jour, zone d’entraînement et choix du mode.', frames: [...four('revision'), m('Mobile · mode J’interroge', 'revision', 'dark', { mode: 'ask' })] },
  { n: '03', title: 'Session · Je réponds', desc: 'Question, carte retournée avec source et vigilance, auto-évaluation, deuxième chance.', frames: [
    m('Mobile · question', 'session', 'dark'), m('Mobile · réponse + vigilance', 'session', 'dark', { phase: 'answer' }),
    m('Mobile · deuxième chance · clair', 'session', 'light', { phase: 'second' }),
    d('Ordinateur · réponse · sombre', 'session', 'dark', { phase: 'answer' }), d('Ordinateur · question · clair', 'session', 'light')] },
  { n: '03b', title: 'Session · J’interroge', desc: 'La réponse et ses points clés pour l’examinateur seul, notation de la personne.', frames: four('session', { m: { mode: 'ask' } }) },
  { n: '03c', title: 'Fin de session', desc: 'Bilan personnel avec XP, ou bilan de la personne interrogée à partager.', frames: [
    m('Je réponds · mobile sombre', 'fin', 'dark'), m('Je réponds · mobile clair', 'fin', 'light'),
    m('J’interroge · mobile sombre', 'fin', 'dark', { mode: 'ask' }), m('J’interroge · mobile clair', 'fin', 'light', { mode: 'ask' }),
    d('Je réponds · ordinateur sombre', 'fin', 'dark'), d('J’interroge · ordinateur clair', 'fin', 'light', { mode: 'ask' })] },
  { n: '04', title: 'Plan annuel', desc: 'Les 12 zones, objectifs du dépôt, avancement, rythme conseillé.', frames: four('plan') },
  { n: '05', title: 'Fiches', desc: 'Fiche de la zone en cours, sources, points de vigilance.', frames: four('fiches') },
  { n: '06', title: 'Progression', desc: 'Cartes acquises par zone, jours de révision, séries, examens, niveaux.', frames: four('progression') },
  { n: '07', title: 'États d’accès', desc: 'Connexion par lien magique, révision indisponible.', frames: [
    m('Connexion · mobile sombre', 'acces', 'dark'), m('Connexion · mobile clair', 'acces', 'light'),
    m('Indisponible · mobile sombre', 'horsligne', 'dark'), m('Indisponible · mobile clair', 'horsligne', 'light'),
    d('Connexion · ordinateur sombre', 'acces', 'dark'), d('Indisponible · ordinateur clair', 'horsligne', 'light')] },
]

export function frameSrc(f: Frame): string {
  const p = new URLSearchParams({ frame: '1', demo: '1', layout: f.mobile ? 'mobile' : 'desktop', screen: f.screen, theme: f.theme })
  Object.entries(f.extra || {}).forEach(([k, v]) => p.set(k, String(v)))
  return `index.html?${p.toString()}`
}
