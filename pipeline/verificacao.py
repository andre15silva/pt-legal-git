"""Check the text we show against official full texts (republicações).

The DR's consolidated text has no legal value. A republicação does: it is part of a published
act. The Constitution was republished with each of its 7 revisions, so each revision gives an
official checkpoint for every article. Here we compare, article by article, the consolidated
version in force after each revision with the republished text (metric M2 in
docs/ARCHITECTURE.md).

Verdicts per article and checkpoint:
- "igual": the same text after normalisation (spaces, dashes, quote marks);
- "so_forma": the same words; only punctuation, capitals or line breaks differ;
- "diferente": the words differ. These need a person to look;
- "falta_consolidado": the republication has the article, the consolidated history does not;
- "falta_republicacao": the consolidated history has the article in force, the republication does not.
"""
from __future__ import annotations

import difflib
import re
import unicodedata

import texto

_ART = re.compile(r"^Artigo\s+(\d+)\s*\.?\s*[ºo°]?\s*(?:-\s*([A-Z]))?\s*$", re.I)
_EPIGRAFE = re.compile(r"^\((.+)[)}]$")  # "(Promulgação e veto}" in the 1989 text
_DIVISAO = re.compile(r"^(PARTE|T[ÍI]TULO|CAP[ÍI]TULO|SEC[ÇC][ÃA]O|SUBSEC[ÇC][ÃA]O)\b", re.I)
# Signatures after the last article. Not "O Presidente da República …": articles start that way too.
_FIM = re.compile(r"^(Aprovad[ao] em \d|Promulgad[ao] em \d|Publique-se\.?$|Referendad[ao] em \d)")


def republicacao(texto_ato: str, marca: str = "CONSTITUIÇÃO DA REPÚBLICA PORTUGUESA") -> str:
    """The republished text inside an act: from the last line that is exactly `marca`."""
    linhas = texto_ato.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    idx = [i for i, l in enumerate(linhas) if l.strip().upper() == marca]
    return "\n".join(linhas[idx[-1] + 1:] if idx else linhas)


def chave(num: str, letra: str | None) -> str:
    return "artigo-" + num + ("-" + letra.lower() if letra else "")


def artigos(seg: str, cabecalhos: set[str] | frozenset = frozenset()) -> dict[str, dict]:
    """Republished text -> {"artigo-87": {"rotulo", "epigrafe", "texto"}} in order of appearance.

    Division headings ("TÍTULO II", then its name) are dropped. So are the signatures after the
    last article.
    """
    out: dict[str, dict] = {}
    cur = None
    linhas = [l for l in texto.normalise(seg).split("\n")]
    i = 0
    while i < len(linhas):
        l = linhas[i]
        m = _ART.match(l)
        if m:
            k = chave(m.group(1), m.group(2))
            cur = {"rotulo": "Artigo %s.º%s" % (m.group(1), "-" + m.group(2) if m.group(2) else ""), "epigrafe": "", "linhas": []}
            if k in out:  # a second article with the same number: keep the first, flag the clash
                k = k + "#2"
            out[k] = cur
            if i + 1 < len(linhas) and _EPIGRAFE.match(linhas[i + 1]):
                cur["epigrafe"] = _EPIGRAFE.match(linhas[i + 1]).group(1)
                i += 1
        elif _DIVISAO.match(l):
            # The heading's name is on the next line, unless the next line is an article.
            if i + 1 < len(linhas) and not _ART.match(linhas[i + 1]):
                i += 1
        elif l.lower() in cabecalhos:  # an unnumbered heading ("Disposições finais e transitórias")
            pass
        elif _FIM.match(l):
            cur = None
        elif cur is not None:
            cur["linhas"].append(l)
        i += 1
    for a in out.values():
        a["texto"] = "\n".join(a.pop("linhas"))
    return out


_ASPAS = str.maketrans({"“": "«", "”": "»", "„": "«", '"': "«", "‘": "'", "’": "'", "°": "º", " ": " ", " ": " ", " ": " "})


def canon(t: str) -> str:
    """Normalise what is not the law's wording: Unicode form, spaces, dashes, quote marks."""
    t = unicodedata.normalize("NFC", t or "").translate(_ASPAS)
    t = re.sub(r"[ \t]+[-–—][ \t]+", " — ", t)
    t = re.sub(r"n\.\s*[ºo]\s*s\b", "n.os", t)
    t = re.sub(r"n\.\s*[ºo]\b", "n.º", t)
    t = re.sub(r"\bl(\d{3})\b", r"1\1", t)  # "l974": a letter l typed for the digit 1
    t = re.sub(r"[ \t]+", " ", t)
    return "\n".join(x.strip() for x in t.split("\n") if x.strip())


def palavras(t: str) -> list[str]:
    return re.findall(r"\w+", unicodedata.normalize("NFC", t or "").lower())


def comparar(consolidado: str | None, oficial: str | None) -> dict:
    if consolidado is None:
        return {"veredicto": "falta_consolidado"}
    if oficial is None:
        return {"veredicto": "falta_republicacao"}
    a, b = canon(consolidado), canon(oficial)
    if a == b:
        return {"veredicto": "igual"}
    if palavras(a) == palavras(b):
        return {"veredicto": "so_forma", "diff": _diff(a, b)}
    return {"veredicto": "diferente", "diff": _diff(a, b)}


def _diff(a: str, b: str, n: int = 6) -> list[list[str]]:
    """The first n changed word runs: [[consolidated, official], ...]."""
    ta, tb = re.findall(r"\S+|\n", a), re.findall(r"\S+|\n", b)
    out = []
    for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, ta, tb, autojunk=False).get_opcodes():
        if op != "equal":
            out.append([" ".join(ta[max(0, a1 - 3):a2 + 3]).replace("\n", "¶"), " ".join(tb[max(0, b1 - 3):b2 + 3]).replace("\n", "¶")])
            if len(out) >= n:
                break
    return out


def _estado(vs: list[str], fim_digital: bool = False) -> tuple[str, int | None]:
    """The verdict for one version from its checks, oldest first. Returns (estado, index).

    - every check matches: "verificado" (or "forma" when one matches only in form);
    - none matches: "divergente";
    - the first ones match, and every one from index k on differs: "desatualizado" from k (the
      DR missed a change). We require two differing republications in a row, or one when it is
      the latest, born-digital republication (`fim_digital`): the older ones were transcribed
      from print and have slips of their own;
    - otherwise a single older republication differs: a slip in that transcription, and the
      version stays "verificado".
    """
    ok = [x in ("igual", "so_forma") for x in vs]
    if not any(ok):
        return "divergente", None
    k = len(ok)
    while k > 0 and not ok[k - 1]:
        k -= 1
    if len(ok) - k >= 2 or (len(ok) - k == 1 and fim_digital):
        return "desatualizado", k
    return ("verificado" if "igual" in vs else "forma"), None


# ---- One diploma against its republications ------------------------------------------------------
def _inicio(v: dict) -> str:
    return v.get("vigor") or v.get("publicacao") or ""


def _texto(v: dict) -> str:
    return "\n".join("".join(s[1] for s in l) for l in v["linhas"])


def verificar(index: dict, republicacoes: list[dict]) -> dict:
    """Mark each version of each article with its check against the republications in its period.

    republicacoes: [{"ato", "designacao", "data", "texto", "link"}], oldest first. `data` is the
    day the republished text took effect. Adds v["verificacao"] = {"estado", "pontos"} to every
    version that a republication covers, and returns the report for verificacao.json.
    """
    cabecalhos = {x.lower() for n in index["arvore"] if n["tipo"] == "divisao" for x in (n["rotulo"], n["epigrafe"]) if x}
    cabecalhos |= {"princípios fundamentais", "disposições finais e transitórias"}
    pontos = []
    for r in republicacoes:
        arts = artigos(republicacao(r["texto"]), cabecalhos)
        pontos.append({**{k: r[k] for k in ("ato", "designacao", "data", "link")}, "artigos": arts})
    por_ponto = [{"ato": p["ato"], "designacao": p["designacao"], "data": p["data"], "link": p["link"], "artigos": len(p["artigos"]),
                  "igual": 0, "so_forma": 0, "diferente": 0, "falta_consolidado": [], "falta_republicacao": []} for p in pontos]
    estados, divergentes = {}, []
    for aid, art in index["artigos"].items():
        vs = art["versoes"]
        for i, v in enumerate(vs):
            ini, fim = _inicio(v), _inicio(vs[i + 1]) if i + 1 < len(vs) else "9999"
            if fim and fim <= ini:  # replaced the same day: no republication shows it
                continue
            meus = []
            for k, p in enumerate(pontos):
                if not (ini <= p["data"] < fim):
                    continue
                cons = None if _texto(v).startswith("(Revogad") else _texto(v)
                rep = p["artigos"].get(aid)
                if cons is None and rep is None:
                    continue
                r = comparar(cons, rep["texto"] if rep else None)
                if r["veredicto"] in ("falta_consolidado", "falta_republicacao"):
                    por_ponto[k][r["veredicto"]].append(aid)
                    continue
                por_ponto[k][r["veredicto"]] += 1
                meus.append({"ato": p["ato"], "veredicto": r["veredicto"], **({"diff": r["diff"]} if "diff" in r else {})})
            if not meus:
                continue
            estado, desde = _estado([m["veredicto"] for m in meus], fim_digital=meus[-1]["ato"] == pontos[-1]["ato"])
            v["verificacao"] = {"estado": estado, "pontos": meus, **({"desde": meus[desde]["ato"]} if desde is not None else {})}
            estados[estado] = estados.get(estado, 0) + 1
            if estado in ("divergente", "desatualizado"):
                divergentes.append({"artigo": aid, "rotulo": art["rotulo"], "versao": i, "ato": v["ato"], "estado": estado, "pontos": meus})
    # Articles a republication has and the consolidated history has never had at that date.
    for k, p in enumerate(pontos):
        for aid in p["artigos"]:
            art = index["artigos"].get(aid.split("#")[0])
            if art is None or not any(_inicio(v) <= p["data"] for v in art["versoes"]):
                if aid not in por_ponto[k]["falta_consolidado"]:
                    por_ponto[k]["falta_consolidado"].append(aid)
    for x in por_ponto:
        n = x["igual"] + x["so_forma"] + x["diferente"]
        x["m2"] = round((x["igual"] + x["so_forma"]) / n, 4) if n else None
        x["m2_exato"] = round(x["igual"] / n, 4) if n else None
    total = sum(estados.values())
    return {"republicacoes": por_ponto, "versoes": {"total": total, **estados},
            "m2": round((estados.get("verificado", 0) + estados.get("forma", 0)) / total, 4) if total else None,
            "divergentes": divergentes}
