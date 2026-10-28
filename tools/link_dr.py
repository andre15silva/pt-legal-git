"""Link parliamentary initiatives to the law published in the Diário da República.

Two methods, used in order:

1. Exact. In the AR "Iniciativas" data, the "Lei (Publicação DR)" event carries
   `TextosAprovados`, the Id of a record in the AR "Diplomas Aprovados" dataset.
   That record has the law's type, number, year and DR issue. From it we build
   the act's ELI: https://data.dre.pt/eli/<tipo>/<n>/<ano>/<mm>/<dd>/p/dre/pt/html
2. Fallback. Match on publication date plus title similarity against a local DR
   mirror laid out as Markdown files with YAML front matter (legalize-pt's
   `pt/<year>/*.md`: `title`, `publication_date`, `rank`).

    python -I tools/link_dr.py IniciativasXVII_json.txt --diplomas DiplomasXVII_json.txt
    python -I tools/link_dr.py IniciativasXVII_json.txt --mirror legalize-pt/pt/2025 legalize-pt/pt/2026
    python -I tools/link_dr.py IniciativasXVII_json.txt --diplomas DiplomasXVII_json.txt --mirror legalize-pt/pt/2025 legalize-pt/pt/2026

Prints one tab-separated line per initiative that reached publication, then a JSON summary.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parlamento import load  # noqa: E402

LAW_RANKS = {"lei", "lei-organica", "lei-constitucional"}
ELI_TYPE = {"Lei": "lei", "Lei Orgânica": "lei-organica", "Lei Constitucional": "lei-constitucional"}
STOP = set("a o as os de da do das dos e em no na nos nas que para por com ao aos à às um uma pela pelo n º".split())


def eli(tipo: str, numero: str, ano: str, pubdate: str) -> str | None:
    t = ELI_TYPE.get(tipo)
    if not (t and numero and pubdate):
        return None
    y, m, d = pubdate[:10].split("-")
    return f"https://data.dre.pt/eli/{t}/{numero.lower()}/{ano or y}/{m}/{d}/p/dre/pt/html"


def load_diplomas(path: str) -> dict[str, dict]:
    with open(path, encoding="utf-8-sig") as fh:
        out = {}
        for d in json.load(fh):
            pub = next((p for p in d.get("Publicacao") or [] if (p.get("pubTipo") or "").startswith("DR")), None)
            numero = d.get("Numero") or ""
            if re.fullmatch(r"[A-Z]", d.get("Numero2") or ""):  # "5" + "A" -> "5-A"
                numero += "-" + d["Numero2"]
            out[str(d["Id"])] = {
                "designacao": f'{d.get("Tipo")} n.º {numero}/{d.get("AnoCivil")}',
                "publicacao": (pub or {}).get("pubdt"),
                "eli": eli(d.get("Tipo") or "", numero, d.get("AnoCivil") or "", (pub or {}).get("pubdt") or ""),
            }
        return out


def words(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]+", s) if w not in STOP and len(w) > 1}


def front_matter(path: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        if fh.readline().strip() != "---":
            return meta
        for line in fh:
            if line.strip() == "---":
                break
            m = re.match(r'^(\w+):\s*"?(.*?)"?\s*$', line)
            if m:
                meta[m.group(1)] = m.group(2)
    return meta


def index_mirror(dirs: list[str]) -> dict[str, list[dict]]:
    by_date: dict[str, list[dict]] = {}
    for d in dirs:
        for name in os.listdir(d):
            if name.endswith(".md"):
                meta = front_matter(os.path.join(d, name))
                if meta.get("rank") in LAW_RANKS and meta.get("publication_date"):
                    by_date.setdefault(meta["publication_date"], []).append(meta)
    return by_date


def best_match(title: str, candidates: list[dict]) -> tuple[dict | None, float]:
    tw = words(title)
    best, score = None, 0.0
    for c in candidates:
        cw = words(c.get("title", "").split("—", 1)[-1])  # drop the "Lei n.º 64/2025 — " designation
        s = len(tw & cw) / max(1, len(tw | cw))
        if s > score:
            best, score = c, s
    return best, score


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("iniciativas")
    ap.add_argument("--diplomas")
    ap.add_argument("--mirror", nargs="*", default=[])
    a = ap.parse_args()

    inis = [i for i in load(a.iniciativas) if any(p == "Lei (Publicação DR)" for _, p in i.events)]
    diplomas = load_diplomas(a.diplomas) if a.diplomas else {}
    mirror = index_mirror(a.mirror) if a.mirror else {}
    counts = {"exact": 0, "fallback": 0, "ambiguous": 0, "unlinked": 0}
    for i in sorted(inis, key=lambda i: i.published_dr or ""):
        dip = diplomas.get(i.approved_text_id or "")
        if dip:
            method, target, link = "exact", dip["designacao"], dip["eli"] or ""
        elif mirror:
            m, s = best_match(i.title, mirror.get(i.published_dr or "", []))
            single = len(mirror.get(i.published_dr or "", [])) == 1
            method = "fallback" if m and (s >= 0.25 or single) else ("ambiguous" if m else "unlinked")
            target, link = (m["title"].split(" — ")[0], m.get("eli", "")) if m else ("", "")
        else:
            method, target, link = "unlinked", "", ""
        counts[method] += 1
        print(f"{method}\t{i.published_dr}\t{i.kind} {i.number}/{i.legislature}\t{target}\t{link}\t{i.title[:70]}")
    total = len(inis)
    summary = {"initiatives_published_as_lei": total, **counts,
               "linkage_rate": round((counts["exact"] + counts["fallback"]) / total, 3) if total else None}
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
