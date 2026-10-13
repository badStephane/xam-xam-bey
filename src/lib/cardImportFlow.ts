import {
  analyzeImport, checkImportFile, importDoneMessage, planInserts, readSheetRows, zonesOf,
  type CardInsert, type ExistingCard, type ImportAnalysis, type SheetRow,
} from './cardImport'
import type { SheetCells } from './xlsxRead'

/** Accès extérieurs de l'import, injectés pour les tests (lecture du classeur, base). */
export interface ImportDeps {
  readSheet(file: Blob): Promise<SheetCells>
  listExisting(zones: readonly number[]): Promise<ExistingCard[]>
  insert(rows: readonly CardInsert[]): Promise<number>
}

export interface ImportPreview { fileName: string; rows: SheetRow[]; analysis: ImportAnalysis }

export type CommitOutcome =
  | { kind: 'done'; message: string }
  /** La base a changé depuis l'aperçu (autre admin, autre onglet) : rien n'est inséré, nouvel aperçu à relire. */
  | { kind: 'changed'; preview: ImportPreview }

/** Vérifie, lit et analyse le fichier. Lève une Error au message lisible ; rien n'est écrit en base. */
export async function previewImport(file: File, deps: ImportDeps): Promise<ImportPreview> {
  const invalid = checkImportFile(file)
  if (invalid) throw new Error(invalid)
  const parsed = readSheetRows(await deps.readSheet(file))
  if (!parsed.ok) throw new Error(parsed.error)
  const existing = await deps.listExisting(zonesOf(parsed.rows))
  return { fileName: file.name, rows: parsed.rows, analysis: analyzeImport(parsed.rows, existing) }
}

const keptLines = (a: ImportAnalysis): string => a.cards.map(c => c.line).join(',')

/** Relit la base juste avant d'écrire (doublons et fin de zone à jour), puis insère tout en une requête. */
export async function commitImport(preview: ImportPreview, deps: ImportDeps, rand: () => number = Math.random): Promise<CommitOutcome> {
  const existing = await deps.listExisting(zonesOf(preview.rows))
  const analysis = analyzeImport(preview.rows, existing)
  if (keptLines(analysis) !== keptLines(preview.analysis)) return { kind: 'changed', preview: { ...preview, analysis } }
  const rows = planInserts(analysis.cards, existing, rand)
  await deps.insert(rows)
  return { kind: 'done', message: importDoneMessage(rows) }
}
