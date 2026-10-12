"""Construit site/index.html : injecte le catalogue dans scripts/template.html."""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cat = json.load(open(os.path.join(root, "data", "catalog.json")))
first, out = {}, []
for i in cat:
    k = (i["name"].lower(), i["size"])
    d = 1 if k in first else 0
    if not d:
        first[k] = i["id"]
    out.append(dict(t=i["title"], p=i["path"], n=i["name"], e=i["ext"], s=i["size"], g=i["pages"],
                    x=1 if i["scan"] else 0, th=i["theme"], d=d, es=1 if i["ess"] else 0, f=f"{first[k]}.pdf"))
js = json.dumps(out, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
tpl = open(os.path.join(root, "scripts", "template.html")).read()
assert "/*CATALOG_JSON*/[]" in tpl
open(os.path.join(root, "site", "index.html"), "w").write(tpl.replace("/*CATALOG_JSON*/[]", js))
missing = [o["f"] for o in out if not os.path.exists(os.path.join(root, "site", "f", o["f"]))]
print("ok", len(out), "manquants:", missing)
