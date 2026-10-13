/** Modèle .xlsx servi depuis public/ (généré par scripts/make_import_xlsx.py). */
export const TEMPLATE_PATH = './modele-questions.xlsx'

const LINK_STYLE = { display: 'inline-grid', placeItems: 'center', textDecoration: 'none', alignSelf: 'flex-start' } as const

export function TemplateLink({ className }: { className: string }) {
  return <a className={className} href={TEMPLATE_PATH} download="modele-questions.xlsx" style={LINK_STYLE}>Télécharger le modèle</a>
}
