"""Contrôle le contenu de révision de data/seed/ avant publication.

Usage : python3 scripts/check_content.py [N ...]   (sans argument : toutes les zones présentes)
Vérifie : JSON valide, identifiants tN-01… sans trou, champs requis, QCM complet (bonne réponse
courte, 3 mauvaises distinctes, aucune égale à la bonne), longueurs comparables, fiche bien formée.
"""
import json
import pathlib
import re
import sys
import unicodedata

SEED = pathlib.Path(__file__).resolve().parent.parent / "data" / "seed"
MAX_OK = 110
LONG_RATIO = 1.8  # bonne réponse plus longue que 1,8 fois la moyenne des mauvaises : à surveiller


def norm(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()


def check_zone(n):
    errors, warnings = [], []
    cards_path, fiche_path = SEED / f"cards-{n}.json", SEED / f"fiche-{n}.json"
    try:
        cards = json.loads(cards_path.read_text(encoding="utf-8"))
        fiche = json.loads(fiche_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [f"lecture impossible : {e}"], [], 0
    if cards.get("theme") != n or fiche.get("theme") != n:
        errors.append("champ theme incorrect")
    lst = cards.get("cards", [])
    for i, c in enumerate(lst, 1):
        cid = c.get("id", "?")
        if cid != f"t{n}-{i:02d}":
            errors.append(f"{cid} : identifiant attendu t{n}-{i:02d}")
        for k in ("q", "a", "src"):
            if not isinstance(c.get(k), str) or not c[k].strip():
                errors.append(f"{cid} : champ {k} manquant")
        q = c.get("qcm") or {}
        ok, no = q.get("ok"), q.get("no")
        if not isinstance(ok, str) or not ok.strip() or not isinstance(no, list) or len(no) != 3:
            errors.append(f"{cid} : QCM incomplet")
            continue
        if any(not isinstance(x, str) or not x.strip() for x in no):
            errors.append(f"{cid} : mauvaise réponse vide")
            continue
        keys = [norm(ok)] + [norm(x) for x in no]
        if len(set(keys)) != 4:
            errors.append(f"{cid} : propositions en double (ou mauvaise = bonne)")
        if len(ok) > MAX_OK:
            warnings.append(f"{cid} : bonne réponse longue ({len(ok)} car.)")
        avg = sum(len(x) for x in no) / 3
        if avg and len(ok) > LONG_RATIO * avg and len(ok) - avg > 25:
            warnings.append(f"{cid} : bonne réponse nettement plus longue que les mauvaises ({len(ok)} contre {avg:.0f})")
        if "*" in ok or any("*" in x for x in no):
            warnings.append(f"{cid} : markdown dans le QCM")
    secs = fiche.get("sections", [])
    if not secs or any(not s.get("h") or not s.get("items") for s in secs):
        errors.append("fiche : sections manquantes ou incomplètes")
    if not isinstance(fiche.get("vigilance", []), list):
        errors.append("fiche : vigilance doit être une liste")
    return errors, warnings, len(lst)


def main():
    zones = [int(a) for a in sys.argv[1:]] or sorted(int(m.group(1)) for p in SEED.glob("cards-*.json") if (m := re.match(r"cards-(\d+)$", p.stem)))
    failed = False
    for n in zones:
        errors, warnings, count = check_zone(n)
        status = "OK" if not errors else "ERREURS"
        print(f"Zone {n:>2} : {count} cartes · {status} · {len(warnings)} avertissement(s)")
        for e in errors:
            print(f"   ✕ {e}")
        for w in warnings[:8]:
            print(f"   ! {w}")
        if len(warnings) > 8:
            print(f"   ! … et {len(warnings) - 8} autres")
        failed = failed or bool(errors)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
