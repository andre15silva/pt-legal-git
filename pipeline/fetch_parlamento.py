"""Download the Assembleia da República open-data files the pipeline needs.

parlamento.pt has no API or index: each dataset page lists one folder per legislatura, and
each folder page lists the files, behind per-render download tokens. This script scrapes
those two levels and downloads the JSON files of "Iniciativas", "Diplomas Aprovados" and
"Informação base" (deputies, groups and their dates, for the seats on each vote date)
into data/parlamento/. Existing files are kept unless --refresh is given.

    python -I pipeline/fetch_parlamento.py
    python -I pipeline/fetch_parlamento.py --refresh XVII   # re-download one legislatura
"""
from __future__ import annotations

import html
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "parlamento")
BASE = "https://www.parlamento.pt"
DATASETS = ["DAIniciativas", "DADiplomasAprovados", "DAInformacaoBase"]
UA = {"User-Agent": "redacao-phase0/0.1 (+https://github.com/andre15silva/pt-legal-git)"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as resp:
        return resp.read()


def links(page: str, kind: str) -> list[tuple[str, str]]:
    """[(title, href)] of the folder ('rptDirs') or file ('rptDocs') links on a catalogue page."""
    out = []
    for a in re.finditer(r"<a [^>]*%s[^>]*>" % kind, page):
        tag = a.group(0)
        title = re.search(r'title="([^"]*)"', tag)
        href = re.search(r'href="([^"]*)"', tag)
        if title and href:
            out.append((html.unescape(title.group(1)).replace("Pasta ", ""), html.unescape(href.group(1))))
    return out


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    only = {a for a in argv[1:] if not a.startswith("--")}
    os.makedirs(OUT, exist_ok=True)
    for ds in DATASETS:
        index = get(f"{BASE}/Cidadania/Paginas/{ds}.aspx").decode("utf-8", "replace")
        for folder, href in links(index, "rptDirs"):
            if only and not any(o in folder for o in only):
                continue
            page = get(BASE + href if href.startswith("/") else href).decode("utf-8", "replace")
            for name, url in links(page, "rptDocs"):
                if not name.endswith("_json.txt"):
                    continue
                path = os.path.join(OUT, name)
                if os.path.exists(path) and not refresh:
                    continue
                data = get(url)
                with open(path, "wb") as fh:
                    fh.write(data)
                print(f"{name}: {len(data) / 1e6:.1f} MB")
                time.sleep(0.5)
            time.sleep(0.5)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
