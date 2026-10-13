"""Génère les classeurs .xlsx de l'import de questions, sans dépendance (zipfile + XML SpreadsheetML minimal).

Usage : python3 scripts/make_import_xlsx.py
  → public/modele-questions.xlsx            modèle téléchargeable depuis l'onglet Questions de l'admin
  → src/lib/__fixtures__/import-sample.xlsx  petit classeur des tests Vitest (src/lib/xlsxRead.test.ts)
  → e2e/fixtures/import-e2e.xlsx             classeur de l'E2E (e2e/import-excel.spec.ts), questions marquées [E2E import]

Sortie déterministe (dates du zip fixes) : relancer le script ne crée pas de différence si rien n'a changé.
Les en-têtes doivent rester alignés avec IMPORT_HEADERS dans src/lib/cardImport.ts.
"""
from pathlib import Path
from xml.sax.saxutils import escape
import zipfile

ROOT = Path(__file__).resolve().parent.parent
HEADERS = ['Zone', 'Question', 'Réponse', 'Bonne proposition', 'Mauvaise 1', 'Mauvaise 2', 'Mauvaise 3', 'Source', 'Note']
WIDTHS = [8, 50, 60, 30, 30, 30, 30, 30, 30]
FIXED_DATE = (2026, 10, 13, 0, 0, 0)

# IM-7 : seule la première feuille est lue à l'import. Elle ne porte que les en-têtes ; l'exemple vit dans la
# deuxième feuille « Exemple », jamais importée même si l'admin ne l'efface pas.
TEMPLATE_SHEETS = [
    ('Questions', [HEADERS]),
    ('Exemple', [
        HEADERS,
        [1, 'Quelle est la devise des scouts ?', '**Toujours prêt** : être prêt à servir à tout moment.',
         'Toujours prêt', 'Toujours fidèle', 'Servir et partager', 'Plus est en nous', 'Document source de la zone', ''],
    ]),
]

# En-têtes volontairement « sales » (casse, accents, espaces) et un cas par erreur, numéros de ligne Excel en commentaire.
FIXTURE_ROWS = [
    ['  ZONE ', 'question', 'REPONSE', 'Bonne  proposition', 'mauvaise 1', 'Mauvaise 2', 'Mauvaise 3', 'Source ', 'note', 'Colonne libre'],
    [1, 'Quelle est la devise des scouts ?', 'Toujours prêt.', 'Toujours prêt', 'Toujours fidèle', '', '', 'Livre', '', 'ignorée'],  # 2 valide, QCM
    ['2', 'Qui a fondé le scoutisme', 'Baden-Powell.', '', '', '', '', '', 'Vérifier la date'],  # 3 valide, zone en texte, sans QCM
    [13, 'Question hors zone', 'Réponse'],  # 4 zone invalide
    [3, '   ', 'Réponse sans question'],  # 5 question vide
    [3, 'Question sans réponse', ''],  # 6 réponse vide
    [3, 'Question au QCM incomplet', 'Réponse', 'Bonne seule'],  # 7 QCM incomplet
    [1, 'quelle est la devise des  scouts', 'Doublon de la ligne 2'],  # 8 doublon dans le fichier
    [],  # 9 ligne vide : ignorée, ne décale pas la numérotation
    [4, 'Question déjà en base ?', 'Réponse'],  # 10 doublon avec la base (le test fournit la question existante)
    [2.5, 'Zone décimale', 'Réponse'],  # 11 zone invalide
    [5, 'Dernière question valide', 'Réponse', 'Oui', 'Non', 'Peut-être', 'Jamais', 'Src', ''],  # 12 valide, QCM complet
]

# E2E : 3 lignes valides (zones 11 et 12), un doublon dans le fichier, une zone invalide.
E2E_ROWS = [
    HEADERS,
    [11, '[E2E import] Première question', 'Réponse une', 'Oui', 'Non', '', '', 'Source E2E', ''],
    [12, '[E2E import] Deuxième question', 'Réponse deux'],
    [12, '[E2E import] deuxième question ?', 'Doublon de la ligne 3'],
    [0, '[E2E import] Zone fausse', 'Réponse'],
    [11, '[E2E import] Troisième question', 'Réponse trois'],
]


def col_name(i: int) -> str:
    name = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        name = chr(65 + r) + name
    return name


def sheet_xml(rows, strings) -> str:
    out = []
    for r, row in enumerate(rows, start=1):
        cells = []
        for c, v in enumerate(row):
            ref = f'{col_name(c)}{r}'
            if v is None or v == '':
                continue
            if isinstance(v, (int, float)):
                cells.append(f'<c r="{ref}"><v>{v}</v></c>')
            else:
                if v not in strings:
                    strings.append(v)
                style = ' s="1"' if r == 1 else ''
                cells.append(f'<c r="{ref}" t="s"{style}><v>{strings.index(v)}</v></c>')
        if cells:
            out.append(f'<row r="{r}">{"".join(cells)}</row>')
    cols = ''.join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(WIDTHS))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<cols>{cols}</cols><sheetData>{"".join(out)}</sheetData></worksheet>')


def shared_xml(strings) -> str:
    items = ''.join(f'<si><t xml:space="preserve">{escape(s)}</t></si>' for s in strings)
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">{items}</sst>')


CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
REL_SHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

# IM-9 : <cellStyles> (style « Normal ») présent, comme dans un classeur enregistré par Excel.
STYLES = (
    XML_HEAD + f'<styleSheet xmlns="{NS_MAIN}">'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    '</styleSheet>')


def package_parts(names) -> dict:
    n = len(names)
    sheets_ct = ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="{CT_SHEET}"/>' for i in range(1, n + 1))
    sheets_wb = ''.join(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, name in enumerate(names, start=1))
    sheets_rel = ''.join(f'<Relationship Id="rId{i}" Type="{REL_SHEET}" Target="worksheets/sheet{i}.xml"/>' for i in range(1, n + 1))
    return {
        '[Content_Types].xml': (
            XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + sheets_ct +
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '</Types>'),
        '_rels/.rels': (
            XML_HEAD + f'<Relationships xmlns="{NS_PKG_REL}">'
            f'<Relationship Id="rId1" Type="{NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
        'xl/workbook.xml': (
            XML_HEAD + f'<workbook xmlns="{NS_MAIN}" xmlns:r="{NS_REL}"><sheets>{sheets_wb}</sheets></workbook>'),
        'xl/_rels/workbook.xml.rels': (
            XML_HEAD + f'<Relationships xmlns="{NS_PKG_REL}">{sheets_rel}'
            f'<Relationship Id="rId{n + 1}" Type="{NS_REL}/sharedStrings" Target="sharedStrings.xml"/>'
            f'<Relationship Id="rId{n + 2}" Type="{NS_REL}/styles" Target="styles.xml"/></Relationships>'),
        'xl/styles.xml': STYLES,
    }


def write_xlsx(path: Path, sheets) -> None:
    """`sheets` : liste de (nom, lignes) ; la première est celle que lit l'import."""
    strings: list[str] = []
    bodies = {f'xl/worksheets/sheet{i}.xml': sheet_xml(rows, strings) for i, (_, rows) in enumerate(sheets, start=1)}
    parts = {**package_parts([name for name, _ in sheets]), **bodies, 'xl/sharedStrings.xml': shared_xml(strings)}
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, content in parts.items():
            z.writestr(zipfile.ZipInfo(name, FIXED_DATE), content.encode('utf-8'), zipfile.ZIP_DEFLATED)
    print(f'{path.relative_to(ROOT)} ({path.stat().st_size} octets)')


if __name__ == '__main__':
    write_xlsx(ROOT / 'public' / 'modele-questions.xlsx', TEMPLATE_SHEETS)
    write_xlsx(ROOT / 'src' / 'lib' / '__fixtures__' / 'import-sample.xlsx', [('Questions', FIXTURE_ROWS)])
    write_xlsx(ROOT / 'e2e' / 'fixtures' / 'import-e2e.xlsx', [('Questions', E2E_ROWS)])
