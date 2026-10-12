"""Génère la migration SQL qui publie le contenu de révision (data/seed/*.json) dans Supabase.

Usage : python3 scripts/content_sql.py
  → supabase/migrations/<horodatage>_revision_content.sql (tout le contenu, pour `supabase db push`)
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


def write_split(docs: list[tuple[str, str]]) -> None:
    SPLIT_DIR.mkdir(exist_ok=True)
    for old in SPLIT_DIR.glob("*.sql"):
        old.unlink()
    for i, (stem, row) in enumerate(docs, 1):
        (SPLIT_DIR / f"{i:02d}_{stem}.sql").write_text(f"-- {stem} : à exécuter dans l'éditeur SQL (généré par scripts/content_sql.py).\n" + statement([row]), encoding="utf-8")


def main() -> None:
    files = sorted(SEED.glob("*.json"))
    if not files:
        sys.exit(f"Aucun fichier dans {SEED}")
    rows, docs = [], []
    for f in files:
        if not DOC_ID.match(f.stem):
            sys.exit(f"Nom de document invalide : {f.name} (attendu plan, fiche-N ou cards-N)")
        data = json.loads(f.read_text(encoding="utf-8"))
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        row = f"  ('{f.stem}', {dollar_quote(payload)}::jsonb, now())"
        rows.append(row)
        docs.append((f.stem, row))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    out = OUT_DIR / f"{stamp}_revision_content.sql"
    out.write_text("-- Contenu de révision généré par scripts/content_sql.py depuis data/seed/.\n" + statement(rows), encoding="utf-8")
    write_split(docs)
    print(f"{out.relative_to(ROOT)} : {len(rows)} documents ; {len(docs)} fichiers dans {SPLIT_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
