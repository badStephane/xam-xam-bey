"""Génère la migration SQL qui publie le contenu de révision (data/seed/*.json) dans Supabase.

Usage : python3 scripts/content_sql.py  →  supabase/migrations/<horodatage>_revision_content.sql
Relancer après chaque nouvelle fiche ou nouveau paquet de cartes, puis `supabase db push`.
"""
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed"
OUT_DIR = ROOT / "supabase" / "migrations"
DOC_ID = re.compile(r"^(plan|fiche-\d+|cards-\d+)$")


def dollar_quote(text: str) -> str:
    tag = "xxb"
    while f"${tag}$" in text:
        tag += "x"
    return f"${tag}${text}${tag}$"


def main() -> None:
    files = sorted(SEED.glob("*.json"))
    if not files:
        sys.exit(f"Aucun fichier dans {SEED}")
    rows = []
    for f in files:
        if not DOC_ID.match(f.stem):
            sys.exit(f"Nom de document invalide : {f.name} (attendu plan, fiche-N ou cards-N)")
        data = json.loads(f.read_text(encoding="utf-8"))
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        rows.append(f"  ('{f.stem}', {dollar_quote(payload)}::jsonb, now())")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    out = OUT_DIR / f"{stamp}_revision_content.sql"
    sql = ("-- Contenu de révision généré par scripts/content_sql.py depuis data/seed/.\n"
           "insert into public.revision_content (id, data, updated_at) values\n"
           + ",\n".join(rows)
           + "\non conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;\n")
    out.write_text(sql, encoding="utf-8")
    print(f"{out.relative_to(ROOT)} : {len(rows)} documents")


if __name__ == "__main__":
    main()
