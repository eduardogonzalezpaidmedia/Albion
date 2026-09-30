#!/usr/bin/env python3
"""
Convierte los datos oficiales extraídos del cliente de Albion Online
(repositorio ao-data/ao-bin-dumps, mantenido por el mismo proyecto que AODP)
al formato de Silver Master: data/items.json, data/recipes.json y data/materials.json.

Uso:
    python3 scripts/convert_ao_bin_dumps.py                # descarga los dumps actuales
    python3 scripts/convert_ao_bin_dumps.py --items ruta/items.json --names ruta/formatted_items.json

Después ejecuta:
    python3 scripts/build_bundle.py                        # regenera data/game-data.js (para abrir index.html sin servidor)

No inventa nada: cantidades, IDs, foco base y cantidad producida salen tal cual de los dumps.
"""
import argparse, json, os, sys, urllib.request, datetime

RAW = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

# Qué objetos entran en la base: (tipo en el dump, shopcategory, subcategorías permitidas o None = todas)
INCLUDE = [
    ("consumableitem", "consumables", {"potions", "food"}),
    ("simpleitem", "crafting", {"refinedresources"}),
    ("weapon", "weapons", None),
    ("weapon", "gathering", None),            # herramientas de recolección y caña de pescar
    ("transformationweapon", "weapons", None),
    ("equipmentitem", "armors", None),
    ("equipmentitem", "head", None),
    ("equipmentitem", "shoes", None),
    ("equipmentitem", "offhands", None),
    ("equipmentitem", "capes", None),
    ("equipmentitem", "bags", None),
    ("equipmentitem", "gathering", None),     # equipo de recolector
]
# Categoría legible en la app (clave estable -> se traduce en la interfaz)
def category_of(kind, shopcat, sub):
    if shopcat == "consumables": return "potions" if sub == "potions" else "food"
    if shopcat == "crafting": return "refined"
    if kind == "weapon" and shopcat == "gathering": return "tools"
    if kind == "equipmentitem" and shopcat == "gathering": return "gatherer_gear"
    if shopcat in ("weapons",): return "weapons"
    return {"armors": "armor", "head": "head", "shoes": "shoes", "offhands": "offhands", "capes": "capes", "bags": "bags"}.get(shopcat, shopcat)

# Tipos de objeto que tienen calidad (Normal…Obra maestra). Consumibles y recursos no la tienen.
QUALITY_KINDS = {"weapon", "equipmentitem", "transformationweapon"}

def L(x): return x if isinstance(x, list) else ([] if x is None else [x])

def load(path_or_url):
    if path_or_url.startswith("http"):
        print("Descargando", path_or_url, file=sys.stderr)
        with urllib.request.urlopen(path_or_url) as r: return json.loads(r.read().decode("utf-8"))
    with open(path_or_url, encoding="utf-8") as f: return json.load(f)

def pick_recipe(crs):
    """Primera receta que no use fichas de facción (las alternativas con tokens no se compran en el mercado)."""
    for cr in L(crs):
        res = L(cr.get("craftresource"))
        if res and not any("FACTION" in r["@uniquename"] for r in res):
            return cr
    return None

def res_id(r):
    lv = int(r.get("@enchantmentlevel", "0") or 0)
    return r["@uniquename"] + ("@%d" % lv if lv else "")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--items", default=RAW + "items.json")
    ap.add_argument("--names", default=RAW + "formatted/items.json")
    ap.add_argument("--min-tier", type=int, default=2)
    a = ap.parse_args()
    dump = load(a.items)["items"]
    names = {}
    for e in load(a.names):
        ln = e.get("LocalizedNames") or {}
        names[e["UniqueName"]] = {"es": ln.get("ES-ES") or ln.get("EN-US"), "en": ln.get("EN-US")}
    def name(i, lang="es"):
        n = names.get(i) or names.get(i.split("@")[0]) or {}
        return n.get(lang) or n.get("en") or i

    items, recipes, materials = [], [], {}
    for kind, shopcat, subs in INCLUDE:
        for it in L(dump.get(kind)):
            if not isinstance(it, dict) or "craftingrequirements" not in it: continue
            if it.get("@shopcategory") != shopcat: continue
            sub = it.get("@shopsubcategory1")
            if subs and sub not in subs: continue
            uid = it["@uniquename"]
            if uid.startswith("UNIQUE") or "SIEGE" in uid or "VANITY" in uid: continue
            tier = int(it.get("@tier", 0))
            if tier < a.min_tier: continue
            base_ench = int(it.get("@enchantmentlevel", "0") or 0)
            levels = [(base_ench, pick_recipe(it["craftingrequirements"]))]
            for e in L((it.get("enchantments") or {}).get("enchantment")):
                if "craftingrequirements" in e:
                    levels.append((int(e["@enchantmentlevel"]), pick_recipe(e["craftingrequirements"])))
            for lv, cr in levels:
                if not cr: continue
                iid = uid + ("@%d" % lv if lv else "")
                mats = []
                for r in L(cr["craftresource"]):
                    mid = res_id(r)
                    materials[mid] = {"item_id": mid, "name": name(mid), "name_en": name(mid, "en")}
                    mats.append({"item_id": mid, "quantity": int(r["@count"]),
                                 "returnable": r.get("@maxreturnamount") != "0"})
                cat = category_of(kind, shopcat, sub)
                items.append({
                    "item_id": iid, "name": name(iid), "name_en": name(iid, "en"),
                    "category": cat, "subcategory": sub, "tier": tier, "enchantment": lv,
                    "quality_supported": kind in QUALITY_KINDS,
                    "crafting_station": it.get("@craftingcategory"), "recipe_id": iid,
                })
                recipes.append({
                    "recipe_id": iid, "product_item_id": iid,
                    "quantity_produced": int(cr.get("@amountcrafted", 1)),
                    "materials": mats,
                    "crafting_station": it.get("@craftingcategory"),
                    "focus_base": int(float(cr["@craftingfocus"])) if cr.get("@craftingfocus") else None,
                    "silver_cost": int(float(cr.get("@silver", 0) or 0)),
                    "crafting_time_raw": cr.get("@time"),   # unidad no documentada en el dump: no se usa en cálculos
                    "city_bonus": [],                        # se calcula en la app a partir de data/cities.json
                })
    meta = {"source": "ao-data/ao-bin-dumps (items.json + formatted/items.json)",
            "generated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),
            "items": len(items), "recipes": len(recipes), "materials": len(materials)}
    os.makedirs(DATA, exist_ok=True)
    def dump_json(fn, obj):
        with open(os.path.join(DATA, fn), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    dump_json("items.json", {"meta": meta, "items": items})
    dump_json("recipes.json", {"meta": meta, "recipes": recipes})
    dump_json("materials.json", {"meta": meta, "materials": sorted(materials.values(), key=lambda m: m["item_id"])})
    print(json.dumps(meta, ensure_ascii=False))

if __name__ == "__main__":
    main()
