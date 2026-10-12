"""Génère la migration SQL qui publie le contenu de révision (data/seed/*.json) dans Supabase.

Usage : python3 scripts/content_sql.py
  → supabase/migrations/<horodatage>_revision_content.sql (tout le contenu, pour `supabase db push`)
     fiches et plan dans revision_content ; cartes dans la table cards (publiées, liées à leur document)
  → supabase/content/<document>.sql (un fichier par document, assez petit pour l'éditeur SQL du tableau de bord)
Relancer après chaque nouvelle fiche ou nouveau paquet de cartes.
"""
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed"
OUT_DIR = ROOT / "supabase" / "migrations"
SPLIT_DIR = ROOT / "supabase" / "content"
DOC_ID = re.compile(r"^(plan|fiche-\d+|cards-\d+)$")


def dollar_quote(text: str) -> str:
    tag = "xxb"
    while f"${tag}$" in text:
        tag += "x"
    return f"${tag}${text}${tag}$"


def statement(rows: list[str]) -> str:
    return ("insert into public.revision_content (id, data, updated_at) values\n"
            + ",\n".join(rows)
            + "\non conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;\n")


def cards_statement(zone: int, cards: list) -> str:
    """Cartes publiées dans la table cards, liées au document cité en premier dans leur source."""
    values = []
    for pos, c in enumerate(cards, 1):
        qcm = dollar_quote(json.dumps(c["qcm"], ensure_ascii=False)) + "::jsonb" if c.get("qcm") else "null::jsonb"
        values.append(f"  ({dollar_quote(c['id'])}, {zone}::smallint, {pos}, {dollar_quote(c['q'])}, {dollar_quote(c['a'])}, "
                      f"{dollar_quote(c.get('src', ''))}, {dollar_quote(c.get('note', ''))}, {qcm})")
    return ("insert into public.cards (id, zone, position, q, a, src, note, qcm, status, document_id)\n"
            "select v.id, v.zone, v.position, v.q, v.a, v.src, v.note, v.qcm, 'published',\n"
            "  (select d.id from public.documents d where left(v.src, length(d.file_name)) = d.file_name order by length(d.file_name) desc, d.id limit 1)\n"
            "from (values\n" + ",\n".join(values) + "\n) as v(id, zone, position, q, a, src, note, qcm)\n"
            "on conflict (id) do update set zone = excluded.zone, position = excluded.position, q = excluded.q, a = excluded.a,\n"
            "  src = excluded.src, note = excluded.note, qcm = excluded.qcm, document_id = excluded.document_id;\n")


def write_split(docs: list[tuple[str, str]]) -> None:
    SPLIT_DIR.mkdir(exist_ok=True)
    for old in SPLIT_DIR.glob("*.sql"):
        old.unlink()
    for i, (stem, sql) in enumerate(docs, 1):
        (SPLIT_DIR / f"{i:02d}_{stem}.sql").write_text(f"-- {stem} : à exécuter dans l'éditeur SQL (généré par scripts/content_sql.py).\n" + sql, encoding="utf-8")


def main() -> None:
    files = sorted(SEED.glob("*.json"))
    if not files:
        sys.exit(f"Aucun fichier dans {SEED}")
    rows, docs, cards_sql = [], [], []
    for f in files:
        if not DOC_ID.match(f.stem):
            sys.exit(f"Nom de document invalide : {f.name} (attendu plan, fiche-N ou cards-N)")
        data = json.loads(f.read_text(encoding="utf-8"))
        if f.stem.startswith("cards-"):
            cards_sql.append((f.stem, cards_statement(int(f.stem[6:]), data.get("cards", []))))
            continue
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        row = f"  ('{f.stem}', {dollar_quote(payload)}::jsonb, now())"
        rows.append(row)
        docs.append((f.stem, statement([row])))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    out = OUT_DIR / f"{stamp}_revision_content.sql"
    out.write_text("-- Contenu de révision généré par scripts/content_sql.py depuis data/seed/.\n"
                   + statement(rows) + "".join(sql for _, sql in cards_sql), encoding="utf-8")
    write_split(cards_sql + docs)
    print(f"{out.relative_to(ROOT)} : {len(rows)} documents ; {len(docs)} fichiers dans {SPLIT_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
