import type { DocType, TypeFilter } from './types'

/** [abrégé, mois, thème, teinte OKLCH] — zone 1 = octobre. */
export const ZONES: ReadonlyArray<readonly [string, string, string, number]> = [
  ['Oct', 'Octobre', 'Bases et histoire', 150], ['Nov', 'Novembre', 'Cérémonial et symboles', 55],
  ['Déc', 'Décembre', 'Troupe et progression', 200], ['Jan', 'Janvier', 'Statuts et règlements', 250],
  ['Fév', 'Février', 'Sécurité et responsabilité', 25], ['Mar', 'Mars', 'Camps et projets', 125],
  ['Avr', 'Avril', 'Gestion et animation', 80], ['Mai', 'Mai', 'Autres branches', 180],
  ['Juin', 'Juin', 'OMMS et spiritualité', 225], ['Juil', 'Juillet', 'Spécialités et finances', 65],
  ['Août', 'Août', 'Rallye', 10], ['Sept', 'Septembre', 'Bilan global', 100],
]
export const YEAR0 = 2026
export const FIRST_MONTH = 9

export const TYPE_BY_EXT: Record<string, DocType> = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', ppt: 'PPT', pptx: 'PPT', xls: 'XLS', xlsx: 'XLS' }
export const TYPE_COLOR: Record<DocType, string> = { PDF: '#C8341C', DOC: '#2B5C8A', PPT: '#8A5007', XLS: '#1D5A3F' }
export const TYPE_NAME: Record<DocType, string> = { PDF: 'PDF', DOC: 'Word', PPT: 'PowerPoint', XLS: 'Excel' }
export const TYPE_OPTS: ReadonlyArray<readonly [TypeFilter, string]> = [['all', 'TOUS'], ['PDF', 'PDF'], ['DOC', 'WORD'], ['PPT', 'POWERPOINT'], ['XLS', 'EXCEL']]

export const INTERVAL = [1, 1, 3, 7, 21, 60]
export const XP_SU = 10
export const XP_HES = 5
/** XP perso d'une carte sue pendant une reprise (« Refaire ces cartes ») : ni niveau, ni ligue. */
export const XP_REDO = 2
export const XP_PER_LEVEL = 200
export const XP_BAR_SEGMENTS = 20
export const NEW_PER_DAY = 10
/** Gel de série : +1 tous les FREEZE_EVERY jours révisés de suite, FREEZE_MAX en réserve ; un gel couvre un jour manqué. */
export const FREEZE_EVERY = 7
export const FREEZE_MAX = 2
/** Nouvelles questions demandées en plus (« 10 de plus »), une fois la session du jour terminée. */
export const EXTRA_NEW = 10
export const ACQUIRED_LV = 4
export const MAX_LV = 5
/** Niveaux perdus par un « Raté » (plancher 0) : une carte bien connue oubliée une fois ne repart pas de zéro. */
export const MISS_DROP = 2
export const ZONE_REVIEW_SIZE = 20
export const EXAM_SIZE = 10
export const ASK_COUNTS = [10, 20, 30] as const
export const SECONDS_PER_CARD = 45
export const RANKS = ['Novice', 'Pisteur', 'Campeur', 'Éclaireur', 'Guide', 'Pionnier', 'Routier', 'Ancien']
export const MOBILE_MAX = 760
export const GROUP_CAP_MOBILE = 3
export const GROUP_CAP_DESKTOP = 4
export const CHART_DAYS = 12
export const SAVE_DELAY = 1200
/** Séances gardées dans la progression (contrat save_progress : 200 au plus). */
export const KEPT_SESSIONS = 200
export const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const GRADE_SELF: ReadonlyArray<readonly [string, string]> = [['✕ RATÉ', '[1] REVIENT'], ['~ HÉSITANT', `[2] +${XP_HES} XP`], ['✓ SU', `[3] +${XP_SU} XP`]]
export const GRADE_ASK: ReadonlyArray<readonly [string, string]> = [['✕ FAUX', '[1]'], ['~ PARTIEL', '[2]'], ['✓ JUSTE', '[3]']]
export const LEVEL_LABELS = ['Nouvelles', 'À revoir', 'Vues', 'Fragiles', 'En cours', 'Acquises', 'Maîtrisées']
