"""Fixtures QA de l'import Excel (P7). Générées avec openpyxl, comme un tableur réel :
styles, nombres, dates, formules, chaînes inline. Usage : python -I make_qa_fixtures.py (openpyxl requis, venv jetable).
Lues par src/lib/qaImport.test.ts."""
import datetime as dt, io, re, sys, zipfile
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font

OUT = Path(__file__).resolve().parent
HEAD = ['Zone', 'Question', 'Réponse', 'Bonne proposition', 'Mauvaise 1', 'Mauvaise 2', 'Mauvaise 3', 'Source', 'Note']
NBSP = ' '


def save(wb, name):
    wb.save(OUT / name)


def excel_like():
    wb = Workbook(); ws = wb.active; ws.title = 'Questions'
    ws.insert_rows(1)  # lignes 1 et 2 vides, en-têtes en ligne 3, à partir de la colonne B
    ws.append([None] + HEAD + ['Question', 'Commentaire'])  # ligne 3 : colonne Question en double + inconnue
    for c in ws[3]: c.font = Font(bold=True)
    rows = [
        [3, 'Zone nombre', 'R'],                                   # 4
        [3.0, 'Zone flottante 3.0', 'R'],                          # 5
        ['3', 'Zone texte', 'R'],                                  # 6
        ['3,0', 'Zone virgule', 'R'],                              # 7
        ['3' + NBSP, f'Espace{NBSP}insécable{NBSP}', 'R'],         # 8
        [None, None, None],                                        # 9 vide
        [4, 'Emoji 🔥 et arabe مرحبا', 'Réponse ⚜️'],              # 10
        [4, 'Date en réponse', dt.date(1907, 8, 1)],                # 11
        [4, 'Nombres en QCM', 'Né en 1857', 1857, 1907, 0.1 + 0.2, True],  # 12
        [dt.date(2026, 1, 3), 'Zone saisie comme date', 'R'],       # 13
        [4, 'Formule', '=B13&"!"'],                                 # 14
        [12.5, 'Zone décimale', 'R'],                               # 15
    ]
    for r in rows: ws.append([None] + r + [None] * (len(HEAD) - len(r)) + ['Ignorée', 'x'])
    save(wb, 'excel-like.xlsx')


def rows_n(n, name):
    wb = Workbook(); ws = wb.active
    ws.append(HEAD)
    for i in range(n): ws.append([1 + i % 12, f'[QA] Question {i + 1}', f'Réponse {i + 1}'])
    save(wb, name)


def with_cached_formula_and_inline():
    """Réécrit le XML : une formule avec valeur en cache (t="str") et des chaînes inline (t="inlineStr")."""
    wb = Workbook(); ws = wb.active
    ws.append(HEAD); ws.append([2, 'PLACEHOLDER_Q', 'PLACEHOLDER_A'])
    buf = io.BytesIO(); wb.save(buf)
    zin = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
    zout_buf = io.BytesIO(); zout = zipfile.ZipFile(zout_buf, 'w', zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'xl/worksheets/sheet1.xml':
            xml = data.decode()
            xml = re.sub(r'<c r="B2"[^>]*>.*?</c>', '<c r="B2" t="str"><f>"Question "&amp;"calculée"</f><v>Question calculée</v></c>', xml)
            xml = re.sub(r'<c r="C2"[^>]*>.*?</c>', '<c r="C2" t="inlineStr"><is><t>Réponse inline</t></is></c>', xml)
            data = xml.encode()
        zout.writestr(item, data)
    zout.close(); (OUT / 'cached-formula-inline.xlsx').write_bytes(zout_buf.getvalue())


def formula_no_cache():
    wb = Workbook(); ws = wb.active
    ws.append(HEAD); ws.append([2, '="Question "&"sans cache"', 'R']); ws.append([2, 'Ligne normale', 'R'])
    save(wb, 'formula-no-cache.xlsx')


def error_cell():
    wb = Workbook(); ws = wb.active
    ws.append(HEAD); ws.append([2, 'Ligne normale', 'R'])
    buf = io.BytesIO(); wb.save(buf)
    zin = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
    zout_buf = io.BytesIO(); zout = zipfile.ZipFile(zout_buf, 'w', zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'xl/worksheets/sheet1.xml':
            data = re.sub(r'<c r="C2"[^>]*>.*?</c>', '<c r="C2" t="e"><f>1/0</f><v>#DIV/0!</v></c>', data.decode()).encode()
        zout.writestr(item, data)
    zout.close(); (OUT / 'error-cell.xlsx').write_bytes(zout_buf.getvalue())


def instructions_first():
    wb = Workbook(); ws = wb.active; ws.title = 'Mode d’emploi'; ws.append(['Remplir la feuille Questions'])
    q = wb.create_sheet('Questions'); q.append(HEAD); q.append([1, 'Q', 'R'])
    save(wb, 'instructions-first.xlsx')


def xls_renamed():
    # En-tête OLE2 (format .xls 97-2003) suivi d'octets quelconques.
    (OUT / 'xls-renamed.xlsx').write_bytes(bytes.fromhex('D0CF11E0A1B11AE1') + bytes(504))


E2E_OUT = OUT.parents[3] / 'e2e' / 'fixtures' / 'qa'
WORDS = 'patrouille foulard camp feu boussole carte nœud promesse loi totem veillée chef troupe service nature piste'.split()


def e2e_fixtures():
    """Fixtures E2E (e2e/qa-import.spec.ts), questions marquées [QA import] et supprimées par le test."""
    E2E_OUT.mkdir(parents=True, exist_ok=True)
    wb = Workbook(); ws = wb.active; ws.append(HEAD)
    ws.append([11, '[QA import] Double clic 1', 'R1']); ws.append([11, '[QA import] Double clic 2', 'R2'])
    wb.save(E2E_OUT / 'dbl.xlsx')
    # Gros classeur réaliste : 900 questions avec réponse rédigée et QCM ; sharedStrings > 512 Kio (seuil du worker fflate).
    wb = Workbook(); ws = wb.active; ws.append(HEAD)
    for i in range(900):
        text = ' '.join(WORDS[(i * 7 + k * 3) % len(WORDS)] + str((i * 31 + k) % 997) for k in range(60))
        ws.append([10, f'[QA import] Gros {i + 1}', f'Réponse {i + 1} : {text}', f'Bonne {i + 1}', f'Mauvaise A {i}', f'Mauvaise B {i}', f'Mauvaise C {i}', 'Source QA', ''])
    wb.save(E2E_OUT / 'big.xlsx')


if __name__ == '__main__':
    e2e_fixtures()
    excel_like(); rows_n(1000, 'rows-1000.xlsx'); rows_n(1001, 'rows-1001.xlsx')
    with_cached_formula_and_inline(); formula_no_cache(); error_cell(); instructions_first(); xls_renamed()
    print('\n'.join(sorted(p.name + f' {p.stat().st_size}' for p in OUT.glob('*.xlsx'))))
