"""A catalogue of the DR's consolidated laws and decree-laws, to find a diploma by name.

The DR publishes the list of its consolidated texts as a sitemap. For each law, organic law and
decree-law in it we fetch the header once (title, summary, dates; cached in data/cache/) and
write data/catalogo.json: [{"tipo", "key", "frag_id", "designacao", "titulo", "sumario",
"publicacao"}]. pipeline/descobrir.py searches it.

    python -I pipeline/catalogo.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import fetch  # noqa: E402

SITEMAP = "https://files.diariodarepublica.pt/sitemap/legislacao-consolidada-sitemap-1.xml"
SAIDA = os.path.join(ROOT, "data", "catalogo.json")
TIPOS = {"lei", "decreto-lei", "lei-organica", "lei-constitucional", "decreto-aprovacao-constituicao"}


def sitemap() -> list[tuple[str, str, str]]:
    """[(tipo, key, frag_id)] of the consolidated laws in the DR's sitemap."""
    path = os.path.join(ROOT, "data", "sitemap-legislacao-consolidada.xml")
    if not os.path.exists(path):
        req = urllib.request.Request(SITEMAP, headers=fetch.dr.HEADERS | {"Accept": "application/xml"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
    with open(path, encoding="utf-8") as fh:
        xml = fh.read()
    out = []
    for m in re.finditer(r"/legislacao-consolidada/([a-z-]+)/((\d{4})-(\d+))</loc>", xml):
        if m.group(1) in TIPOS:
            out.append((m.group(1), m.group(2), m.group(4)))
    return out


def entrada(tipo: str, key: str, frag: str) -> dict | None:
    try:
        h = fetch.cached("diploma_header", frag, tipo, key)
    except Exception as e:  # a record the DR no longer serves: leave it out
        sys.stderr.write(f"{tipo} {key}: {e}\n")
        return None
    legis = (h or {}).get("ConsolidadaConteudoDetalhe", {}).get("DiplomaLegis") or {}
    titulo = fetch.dr.plain(legis.get("FormattedTitle") or "")
    return {"tipo": tipo, "key": key, "frag_id": frag, "designacao": titulo.split(" - ")[0].strip(),
            "titulo": titulo, "sumario": fetch.dr.plain(legis.get("Sumario") or ""),
            "publicacao": (legis.get("DataPublicacao") or "")[:10] or None}


def main() -> int:
    itens = sitemap()
    with ThreadPoolExecutor(fetch.WORKERS) as pool:
        cat = [e for e in pool.map(lambda x: entrada(*x), itens) if e]
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump(cat, fh, ensure_ascii=False, indent=0)
    print(f"{len(cat)} diplomas consolidados em {SAIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
