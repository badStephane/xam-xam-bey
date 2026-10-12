"""Compresse les PDF de site/f/ dans site/f-min/ (Ghostscript, réglage « ebook » : images à 150 dpi, texte vectoriel intact).

Une version compressée n'est gardée que si elle est au moins 10 % plus légère, a le même nombre de pages
ET conserve son texte (au moins 90 % des mots extraits : certains PDF ressortent vides) ;
sinon l'original est copié tel quel. Les originaux ne sont jamais modifiés.

Usage : python3 scripts/compress_pdfs.py [fichier.pdf …]   (sans argument : tout site/f/)
Prérequis : Ghostscript (brew install ghostscript) et pdfinfo (poppler).
"""
import concurrent.futures
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "site" / "f"
OUT = ROOT / "site" / "f-min"
MIN_GAIN = 0.10
TIMEOUT_S = 300
WORKERS = 6


def pages(path: pathlib.Path) -> int | None:
    try:
        out = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True, timeout=60).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    m = re.search(r"Pages:\s+(\d+)", out)
    return int(m.group(1)) if m else None


MIN_TEXT_KEPT = 0.9
MIN_WORDS = 20


def words(path: pathlib.Path) -> int:
    try:
        return len(subprocess.run(["pdftotext", str(path), "-"], capture_output=True, text=True, timeout=TIMEOUT_S).stdout.split())
    except (OSError, subprocess.TimeoutExpired):
        return -1


def text_kept(src: pathlib.Path, out: pathlib.Path) -> bool:
    before = words(src)
    return before < MIN_WORDS or words(out) >= before * MIN_TEXT_KEPT


def compress(src: pathlib.Path) -> tuple[str, int, int, str]:
    dst = OUT / src.name
    tmp = OUT / f".{src.name}.tmp"
    cmd = ["gs", "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/ebook", "-dCompatibilityLevel=1.5", "-dNOPAUSE", "-dQUIET",
           "-dBATCH", "-dDetectDuplicateImages=true", f"-sOutputFile={tmp}", str(src)]
    before = src.stat().st_size
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=TIMEOUT_S)
        after = tmp.stat().st_size
        same_pages = pages(src) == pages(tmp)
        kept = same_pages and text_kept(src, tmp)
        if kept and after <= before * (1 - MIN_GAIN):
            tmp.replace(dst)
            return src.name, before, after, "compressé"
        tmp.unlink(missing_ok=True)
        shutil.copy2(src, dst)
        reason = "" if kept else (" (pages différentes)" if not same_pages else " (texte perdu à la compression)")
        return src.name, before, before, "original gardé" + reason
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
        tmp.unlink(missing_ok=True)
        shutil.copy2(src, dst)
        return src.name, before, before, f"original gardé (erreur : {type(e).__name__})"


def main() -> None:
    if not shutil.which("gs") or not shutil.which("pdfinfo"):
        sys.exit("Ghostscript (gs) et pdfinfo sont nécessaires.")
    OUT.mkdir(exist_ok=True)
    files = [SRC / a for a in sys.argv[1:]] or sorted(SRC.glob("*.pdf"))
    total_before = total_after = 0
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        for name, before, after, status in pool.map(compress, files):
            total_before += before
            total_after += after
            if before - after > 200_000 or "(" in status:
                print(f"{name:>9} {before / 1e6:6.1f} → {after / 1e6:5.1f} Mo  {status}")
    gain = 1 - total_after / total_before if total_before else 0
    print(f"Total : {total_before / 1e6:.0f} Mo → {total_after / 1e6:.0f} Mo ({gain:.0%} de moins), {len(files)} fichiers dans {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
