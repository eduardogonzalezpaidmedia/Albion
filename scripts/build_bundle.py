#!/usr/bin/env python3
"""
Empaqueta data/*.json en data/game-data.js para poder abrir index.html
directamente desde el disco (file://), donde el navegador no deja leer JSON con fetch.
Cuando la app corre en un servidor (Cloudflare Pages, GitHub Pages, `python3 -m http.server`)
lee los .json directamente y este archivo no hace falta.
"""
import json, os
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
bundle = {}
for fn in ["items.json", "recipes.json", "materials.json", "cities.json", "stations.json", "settings.json"]:
    with open(os.path.join(DATA, fn), encoding="utf-8") as f:
        bundle[fn[:-5]] = json.load(f)
with open(os.path.join(DATA, "game-data.js"), "w", encoding="utf-8") as f:
    f.write("/* Generado por scripts/build_bundle.py a partir de data/*.json. No editar a mano. */\n")
    f.write("window.SM_BUNDLE=" + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("data/game-data.js listo:", os.path.getsize(os.path.join(DATA, "game-data.js")), "bytes")
