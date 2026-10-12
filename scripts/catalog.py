import os, re, json, hashlib, subprocess, unicodedata
ROOT = [os.path.join("/tmp/claude-0/-home-claude/f1441400-c4e5-549d-8fa7-d8fbe0577479/scratchpad/xam", d) for d in os.listdir("/tmp/claude-0/-home-claude/f1441400-c4e5-549d-8fa7-d8fbe0577479/scratchpad/xam")][0]
def dec(s):
    s = re.sub(r'#U([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1),16)), s)
    s = s.replace("Proc+®dures","Procédures").replace("R├¿glementation","Règlementation").replace("Fiche _aluation","Fiche évaluation")
    return unicodedata.normalize("NFC", s)
THEMES = [
 (1,"Oct","Bases et histoire"),(2,"Nov","Cérémonial et symboles"),(3,"Déc","Troupe et progression"),
 (4,"Jan","Statuts et règlements"),(5,"Fév","Sécurité et responsabilité"),(6,"Mar","Camps et projets"),
 (7,"Avr","Gestion et animation"),(8,"Mai","Autres branches"),(9,"Juin","OMMS et spiritualité"),
 (10,"Juil","Spécialités et finances"),(11,"Août","Rallye"),(12,"Sept","Bilan global")]
def theme(parts, name):
    top = parts[0]; n = name.lower()
    if top=="Bases Générales":
        if any(k in n for k in ["ceremonial","montée ou levée"]) or n.startswith("objets et symboles"): return 2
        if "responsabilite civile" in n: return 5
        if "découpage" in n: return 4
        return 1
    if top=="Livres": return 8 if "jungle" in n else 1
    if top=="Camps Structurés": return 6
    if top=="Gestion de Branche": return 7
    if top=="Gestion Financière": return 10
    if top=="OMMS" or top=="Spiritualité": return 9
    if top.startswith("R") and "glements et Proc" in top:
        if any(k in n for k in ["declaration de camp","fiche évaluation camp","camps scouts"]): return 6
        return 4
    if top=="Spécialités":
        if len(parts)>1 and parts[1] in ("Secourisme","Campisme"): return 5
        if n.startswith("asjdossier"): return 5
        return 10
    if top in ("Xam Louy Meute","Xam Louy Communauté"): return 8
    if top=="Xam Louy Troupe":
        if len(parts)>1 and parts[1]=="Révision Rallye": return 11
        if n=="le scoutisme.docx": return 1
        if "ceremonial" in n: return 2
        if n.startswith("asjdossier"): return 5
        if any(k in n for k in ["camp de patrouille","projet de camp","fiche technique de camp"]): return 6
        return 3
    return 12
ESS = {
 1:["bases du scoutisme","historique scoutisme","methode-bp","fiches-bp","quiz-bp","les-7-","la devise","scouting for boys.pdf","le scoutisme"],
 2:["ceremonial","montée ou levée","objets et symboles","aurore ceremonial"],
 3:["progression personnelle","manuel du cp","manuel du ct","livret carnet de preuves","proposition educative","fonctionnement","structures et instances","patrouilles africaines","cahier de bord"],
 4:["statuts sgds","règlement intérieur","procédures administratives et financi","découpage"],
 5:["responsabilite civile","fascicule de premiers","formation aux premiers","09_abcd","campisme.docx","formation lieu de camp"],
 6:["dossier de camp badge","organisation d_un camp de patrouille","contenu dun projet","rédaction d_une fiche","camps scouts","declaration de camp","fiche évaluation"],
 7:["gestion d_une unité","animer les reunions","techniques d_animation","récap planification","la pedagogie du jeu"],
 8:["guide du louvetier","louvetisme","guide du chef de communaut","cnbr","livre de baloo","le livre de la jungle i.pdf"],
 9:["education spirituelle des branchesv21","vue globale","better world","devoir envers autrui"],
 10:["topographie.pdf","orientation.docx","secourisme"],
 11:["connaissance du mvt","questions r","qa"],
}
def ess(t,n):
    n=n.lower()
    return any(k in n for k in ESS.get(t,[])) and t!=10 or (t==10 and any(k in n for k in ["topographie.pdf","orientation.docx","matelotage.pdf","guide du tr"]))
def run(cmd, timeout=25):
    try: return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception: return ""
items=[]; hashes={}
for dp, dn, fn in os.walk(ROOT):
    for f in fn:
        p=os.path.join(dp,f); rel=dec(os.path.relpath(p,ROOT)); parts=rel.split("/")
        name=parts[-1]; ext=os.path.splitext(name)[1].lower().lstrip(".")
        size=os.path.getsize(p)
        h=hashlib.md5(open(p,"rb").read()).hexdigest()
        pages=None; scan=False
        if ext=="pdf":
            m=re.search(r"Pages:\s+(\d+)", run(["pdfinfo",p]))
            pages=int(m.group(1)) if m else None
            txt=run(["pdftotext","-l","4",p,"-"])
            scan = len(txt.split())<25
        t=theme(parts[:-1],name)
        title=re.sub(r"[_]+"," ",os.path.splitext(name)[0]).strip()
        items.append(dict(path="/".join(parts[:-1]),name=name,title=title,ext=ext,size=size,pages=pages,scan=scan,theme=t,hash=h))
        hashes.setdefault(h,[]).append(len(items)-1)
for h,idx in hashes.items():
    if len(idx)>1:
        for k in idx[1:]: items[k]["dup"]=True
for it in items:
    it["ess"]=bool(ess(it["theme"],it["name"]))
items.sort(key=lambda x:(x["theme"],x["path"],x["name"].lower()))
for i,it in enumerate(items): it["id"]=i+1; del it["hash"]
json.dump(items,open("/tmp/claude-0/-home-claude/f1441400-c4e5-549d-8fa7-d8fbe0577479/scratchpad/catalog.json","w"),ensure_ascii=False)
from collections import Counter
print(len(items),"files;", sum(1 for i in items if i.get("dup")),"duplicates;", sum(1 for i in items if i["scan"]),"scans")
for t,m,l in THEMES: print(t,m,l,sum(1 for i in items if i["theme"]==t),"files,",sum(1 for i in items if i["theme"]==t and i["ess"]),"ess")
print(Counter(i["ext"] for i in items))
print("total MB",round(sum(i["size"] for i in items)/1e6))
print([ (i["name"],i["pages"]) for i in items if i["scan"]])
print([i["name"] for i in items if i.get("dup")])
