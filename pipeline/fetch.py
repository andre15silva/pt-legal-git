"""Fetch the consolidated history of the diplomas in corpus.json from the Diário da República.

For each diploma: the header, the as-of snapshot today, the snapshot on the initial date
(original texts), the list of amending acts, and the version history of every article.
Every response is cached under data/cache/ by a hash of the request, so a rerun only
fetches what is missing.

    python -I pipeline/fetch.py                 # every diploma in corpus.json
    python -I pipeline/fetch.py codigo-irc nrau # only these
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import dr_client as dr  # noqa: E402

CACHE = os.path.join(ROOT, "data", "cache")
RAW = os.path.join(ROOT, "data", "raw")
WORKERS = 3          # concurrent requests; keep this low
MIN_INTERVAL = 0.35  # seconds between request starts, across workers
_lock = threading.Lock()
_last = [0.0]


def cached(name: str, *args):
    key = hashlib.sha256(json.dumps([name, args], ensure_ascii=False).encode()).hexdigest()
    path = os.path.join(CACHE, key[:2], key + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    with _lock:
        wait = _last[0] + MIN_INTERVAL - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
    for attempt in range(4):
        try:
            data = getattr(dr, name)(*args)
            break
        except dr.StaleApiVersion:
            raise
        except Exception as e:  # network hiccup: back off and retry
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
            sys.stderr.write(f"retry {name} {args[:1]}: {e}\n")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    return data


def fetch(d: dict, today: str) -> dict:
    header = cached("diploma_header", d["frag_id"], d["tipo"], d["key"])
    legis_id = header["ConsolidadaConteudoDetalhe"]["DiplomaLegis"]["Id"]
    initial = cached("initial_date", d["frag_id"], legis_id)
    initial_date = str(initial.get("DataInicial") or initial.get("Data") or next(iter(initial.values())))[:10]
    now = cached("as_of", d["frag_id"], legis_id, today, header)
    first = cached("as_of", d["frag_id"], legis_id, initial_date, header)
    timeline = cached("timeline", d["frag_id"], legis_id, today)
    articles = [f for f in now["LegConsBase"]["List"] if f["FragmentoVersao"]["TipoFragmentoId"] == 11]

    def versions(f):
        return f["FragmentoVersao"]["FragmentoId"], cached(
            "article_versions", f["FragmentoVersao"]["Id"], d["frag_id"], legis_id, today)

    done = 0
    hist = {}
    with ThreadPoolExecutor(WORKERS) as pool:
        for frag, v in pool.map(versions, articles):
            hist[frag] = v
            done += 1
            if done % 50 == 0:
                sys.stderr.write(f"  {d['slug']}: {done}/{len(articles)} artigos\n")
    raw = {"diploma": d, "legis_id": legis_id, "initial_date": initial_date, "consultado_em": today,
           "header": header, "now": now, "first": first, "timeline": timeline, "versions": hist}
    os.makedirs(RAW, exist_ok=True)
    with open(os.path.join(RAW, d["slug"] + ".json"), "w", encoding="utf-8") as fh:
        json.dump(raw, fh, ensure_ascii=False)
    return raw


def main(argv: list[str]) -> int:
    with open(os.path.join(ROOT, "pipeline", "corpus.json"), encoding="utf-8") as fh:
        corpus = json.load(fh)
    wanted = set(argv[1:])
    for d in corpus["diplomas"]:
        if wanted and d["slug"] not in wanted:
            continue
        t = time.monotonic()
        raw = fetch(d, corpus["consultado_em"])
        # Official full texts to check the consolidated text against (pipeline/verificacao.py).
        for r in d.get("republicacoes", []):
            cached("act", r["tipo"], r["key"])
        sys.stderr.write(f"{d['slug']}: {len(raw['versions'])} artigos, {time.monotonic() - t:.0f}s\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
