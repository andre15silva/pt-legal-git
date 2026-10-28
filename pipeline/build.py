"""Build the visualizer's data from the raw DR fetch and the AR open data.

    python -I pipeline/build.py            # writes app/data/ (gitignored)

Inputs:  data/raw/<slug>.json (pipeline/fetch.py), data/parlamento/*_json.txt
         (pipeline/fetch_parlamento.py), pipeline/corpus.json.
Outputs: app/data/index.json (corpus and search list), app/data/d/<slug>.json (structure
         and every article's history), app/data/atos.json (acts), app/data/iniciativas.json.

Every article's history is a list of versions, oldest first. Each version records the act
that produced it, its publication and entry-into-force dates, its text, and the word-level
origin of that text (spans pointing to the version that wrote each word).
"""
from __future__ import annotations

import glob
import html
import shutil
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import atos  # noqa: E402
import passagem  # noqa: E402
import texto  # noqa: E402
import fetch  # noqa: E402
import verificacao  # noqa: E402
import replay  # noqa: E402
from parlamento import normalise as normalise_iniciativa  # noqa: E402

OUT = os.path.join(ROOT, "app", "data")
NO_DATE = "1900-01-01"
ANEXO, ARTIGO = 14, 11


def d10(s: str | None) -> str | None:
    s = (s or "")[:10]
    return None if not s or s.startswith("1900") or s.startswith("0001") else s


def slugify(s: str) -> str:
    s = re.sub(r"\.º", "", s.lower())
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def plain(s: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def write(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))


class Registry:
    """All acts seen across the corpus, keyed by atos.slug(designacao)."""

    def __init__(self):
        self.acts: dict[str, dict] = {}

    def add(self, info: dict) -> str:
        a = self.acts.setdefault(info["id"], {"id": info["id"], "designacao": info["designacao"],
                                              "publicacao": None, "dr": None, "serie": None, "link": None,
                                              "sumario": None, "alteracoes": []})
        for k in ("publicacao", "dr", "serie", "link"):
            if info.get(k) and not a.get(k):
                a[k] = info[k]
        return info["id"]


def assign_ids(items: list[tuple[list[dict], dict]], codigo_no_anexo: bool) -> list[str]:
    """Readable, unique article ids: 'artigo-87', 'artigo-87-a'.

    For codes approved in an annex (CT, CIRC), the code's articles get the plain ids and the
    approving law's articles get 'lei-…'. Elsewhere an id gets a prefix only when two articles
    share a number, for example a republished annex next to the diploma's own articles.
    """
    def in_anexo(stack):
        return [p for p in stack if p["tipo"] == ANEXO and p["nome"].lower().startswith("anexo")]
    base = [slugify(f["ConsolidacaoFragmento"]["Name"]) for _, f in items]
    counts: dict[str, int] = {}
    for b in base:
        counts[b] = counts.get(b, 0) + 1
    ids, used = [], set()
    for (stack, _), b in zip(items, base):
        anexos = in_anexo(stack)
        if codigo_no_anexo:
            aid = b if anexos else "lei-" + b
        elif counts[b] > 1 and anexos:
            aid = slugify(anexos[-1]["nome"]) + "-" + b
        else:
            aid = b
        while aid in used:
            aid += "-b"
        used.add(aid)
        ids.append(aid)
    return ids


def parte(frags: list[dict], cfg: dict) -> list[dict]:
    """Only the articles in cfg["artigos"] and the headings above them (the Código Civil's Locação)."""
    keep, stack = set(), []
    for i, f in enumerate(frags):
        nivel = f["Nivel"]
        stack = [(n, j) for n, j in stack if n < nivel]
        if f["FragmentoVersao"]["TipoFragmentoId"] == ARTIGO:
            if fetch.no_intervalo(f, cfg):
                keep.add(i)
                keep.update(j for _, j in stack)
        else:
            stack.append((nivel, i))
    return [f for i, f in enumerate(frags) if i in keep or frags[i]["Nivel"] == 0]


def build_diploma(raw: dict, reg: Registry) -> tuple[dict, dict]:
    cfg = raw["diploma"]
    head = raw["header"]["ConsolidadaConteudoDetalhe"]
    legis, frag = head["DiplomaLegis"], head["DiplomaFrag"]
    now = raw["now"]["LegConsBase"]["List"]
    first = {f["FragmentoVersao"]["FragmentoId"]: f for f in raw["first"]["LegConsBase"]["List"]}
    original_designacao = plain(legis.get("FormattedTitle") or "").split(" - ")[0] or cfg["titulo"]
    original = {"id": atos.slug(original_designacao), "designacao": original_designacao,
                "publicacao": d10(legis.get("DataPublicacao")) or raw["initial_date"],
                "link": "https://diariodarepublica.pt" + legis["LinkSitemap"] if legis.get("LinkSitemap") else None}
    reg.add(original)
    reg.acts[original["id"]]["sumario"] = plain(legis.get("Sumario")) or None

    # Summaries and links of the amending acts, from the consolidation timeline.
    for m in raw["timeline"]["ModificacoesList"]["List"]:
        desig = m["Title"].split(" - ")[0].strip()
        aid = reg.add({"id": atos.slug(desig), "designacao": desig, "publicacao": d10(m.get("DataPublicacao")),
                       "link": "https://diariodarepublica.pt" + m["LinkSitemap"] if m.get("LinkSitemap") else None})
        if m.get("SumarioDiplomaLegis") and not reg.acts[aid]["sumario"]:
            reg.acts[aid]["sumario"] = m["SumarioDiplomaLegis"].strip()

    if cfg.get("artigos"):
        now = parte(now, cfg)
    nodes, items, stack = [], [], []
    for f in now:
        fv, cf = f["FragmentoVersao"], f["ConsolidacaoFragmento"]
        tipo, nivel = fv["TipoFragmentoId"], f["Nivel"]
        stack = [p for p in stack if p["nivel"] < nivel]
        if tipo != ARTIGO:
            if nivel > 0 and tipo != 7:  # skip the diploma root and the signatures
                nodes.append({"nivel": nivel, "tipo": "divisao", "rotulo": cf["Name"], "epigrafe": (fv.get("Epigrafe") or "").strip()})
            stack.append({"nivel": nivel, "tipo": tipo, "nome": cf["Name"]})
            continue
        nodes.append(None)
        items.append((list(stack), f))
    ids = iter(assign_ids(items, bool(cfg.get("codigo_no_anexo"))))
    tree, it, artigos = [], iter(items), {}
    for node in nodes:
        if node is not None:
            tree.append(node)
            continue
        path, f = next(it)
        aid, fv = next(ids), f["FragmentoVersao"]
        hist = build_article(f, first.get(fv["FragmentoId"]), raw["versions"].get(fv["FragmentoId"], []), original, reg)
        apply_vigor_rules(hist, aid, cfg)
        hist.update({"id": aid, "diploma": cfg["slug"], "caminho": [p["nome"] for p in path if p["nivel"] > 0]})
        for i, v in enumerate(hist["versoes"]):
            if i or v["tipo"] != "original":
                reg.acts[v["ato"]]["alteracoes"].append({"diploma": cfg["slug"], "artigo": aid, "rotulo": hist["rotulo"],
                                                       "tipo": v["tipo"], "vigor": v["vigor"]})
        artigos[aid] = hist
        last = hist["versoes"][-1]
        tree.append({"nivel": f["Nivel"], "tipo": "artigo", "rotulo": f["ConsolidacaoFragmento"]["Name"], "epigrafe": hist["epigrafe"],
                     "artigo": aid, "estado": hist["estado"], "n": len(hist["versoes"]), "ultima": last["vigor"] or last["publicacao"],
                     # Start of each redação, for the strip of ticks in the index.
                     "datas": [v["vigor"] or v["publicacao"] for v in hist["versoes"]]})

    index = {"slug": cfg["slug"], "titulo": cfg["titulo"], "sigla": cfg["sigla"], "genitivo": cfg.get("genitivo"),
             "vigor_original": cfg.get("vigor_original"), "inicio_historia": cfg.get("inicio_historia"), "parte": cfg.get("parte"), "designacao": original["designacao"],
             "ato_original": original["id"], "publicacao": original["publicacao"], "link": original["link"],
             "eli": frag.get("ELI") or None, "sumario": reg.acts[original["id"]]["sumario"], "arvore": tree, "artigos": artigos}
    summary = {"slug": cfg["slug"], "titulo": cfg["titulo"], "sigla": cfg["sigla"], "designacao": original["designacao"],
               "publicacao": original["publicacao"], "genitivo": cfg.get("genitivo")}
    if cfg.get("republicacoes"):
        index["verificacao"] = verificar_republicacoes(index, cfg["republicacoes"], reg)
    escrever_diploma(index)
    return index, summary


def escrever_diploma(index: dict) -> None:
    """d/<slug>.json holds the tree and metadata; d/<slug>/<artigo>.json one article's history.

    An article page then loads one small file instead of the whole code (the CPC has over a
    thousand articles). Stale article files from an earlier build are removed first.
    """
    pasta = os.path.join(OUT, "d", index["slug"])
    if os.path.isdir(pasta):
        shutil.rmtree(pasta)
    for aid, art in index["artigos"].items():
        write(os.path.join(pasta, aid + ".json"), art)
    write(os.path.join(OUT, "d", index["slug"] + ".json"), {k: v for k, v in index.items() if k != "artigos"})


def verificar_republicacoes(index: dict, cfg: list[dict], reg: Registry) -> dict:
    """Check every version against the official republications (cached by fetch.py)."""
    reps = []
    for r in cfg:
        act = fetch.cached("act", r["tipo"], r["key"])
        starts = sorted(v.get("vigor") or v["publicacao"] for a in index["artigos"].values() for v in a["versoes"] if v["ato"] == r["ato"] and (v.get("vigor") or v.get("publicacao")))
        data = starts[0] if starts else act["DataPublicacao"][:10]
        a = reg.acts.get(r["ato"], {})
        reps.append({"ato": r["ato"], "designacao": a.get("designacao") or act.get("Titulo", "").strip(), "data": data,
                     "link": a.get("link"), "pdf": act.get("URL_PDF"), "texto": act["Texto"]})
    rel = verificacao.verificar(index, reps)
    for x, r in zip(rel["republicacoes"], reps):
        x["pdf"] = r["pdf"]
    # M1: replay each act on the official text before it (pipeline/replay.py).
    if index["slug"] == "constituicao":
        rel["reproducao"] = []
        for antes, depois in zip(reps, reps[1:]):
            m = replay.medir(antes["texto"], depois["texto"])
            rel["reproducao"].append({"ato": depois["ato"], "designacao": depois["designacao"], "data": depois["data"],
                                      **{k: m[k] for k in ("alterados", "alterados_iguais", "inalterados", "inalterados_iguais", "m1", "teto", "instrucoes", "por_ler")}})
        alt = sum(x["alterados"] for x in rel["reproducao"])
        rel["m1"] = round(sum(x["alterados_iguais"] for x in rel["reproducao"]) / alt, 4) if alt else None
        sys.stderr.write(f"constituicao: reprodução das revisões, M1 = {rel['m1']:.1%} dos artigos alterados\n")
    v = rel["versoes"]
    sys.stderr.write(f"{index['slug']}: {v['total']} redações comparadas com republicações; "
                     f"{v.get('verificado', 0)} iguais, {v.get('forma', 0)} só na forma, {v.get('desatualizado', 0)} desatualizadas, "
                     f"{v.get('divergente', 0)} divergentes\n")
    return rel


def apply_vigor_rules(hist: dict, aid: str, cfg: dict) -> None:
    """Fill the original version's entry-into-force date from corpus.json, citing the rule used.

    The DR leaves this date empty for original texts. corpus.json records it per diploma,
    with the provision that fixes it, and per-article exceptions and notes.
    """
    v0 = hist["versoes"][0]
    if v0["tipo"] == "original" and not v0["vigor"]:
        rule = next((e for e in cfg.get("vigor_excecoes", []) if aid in e["artigos"]), None) or cfg.get("vigor_original")
        if rule:
            v0["vigor"], v0["vigor_conhecido"] = rule["data"], True
            v0["vigor_regra"], v0["vigor_fonte"] = rule["regra"], rule["fonte"]
    for n in cfg.get("notas_vigor", []):
        if aid in n["artigos"]:
            hist["notas"].insert(0, {"texto": n["texto"], "fonte": n["fonte"], "ato": None, "tipo": "vigor"})
            if n.get("condicional") and v0["tipo"] == "original":
                # The whole article waits for other legislation: the date is not ours to guess.
                v0["vigor"], v0["vigor_conhecido"], v0["vigor_regra"], v0["vigor_fonte"] = None, False, "condicional", n["fonte"]
    if cfg.get("nota_efeitos") and not aid.startswith("lei-"):
        hist["notas"].append({"texto": cfg["nota_efeitos"]["texto"], "fonte": cfg["nota_efeitos"]["fonte"], "ato": None, "tipo": "efeitos"})


def build_article(f: dict, first: dict | None, entries: list[dict], original: dict, reg: Registry) -> dict:
    fv = f["FragmentoVersao"]
    versions = []
    if first is not None:
        ffv = first["FragmentoVersao"]
        versions.append({"ato": original["id"], "tipo": "original", "artigo_do_ato": None,
                         "publicacao": original["publicacao"], "vigor": d10(ffv.get("DataEntradaVigor")),
                         "texto": texto.normalise(ffv.get("Texto"))})
    for e in reversed(entries):  # the DR lists the newest first
        info = atos.parse(e["AssociacaoDescription"]) or {}
        if not info:
            continue
        aid = reg.add(info)
        txt = "(Revogado.)" if info["tipo"] == "revogado" else texto.normalise(e.get("Texto"))
        versions.append({"ato": aid, "tipo": info["tipo"], "artigo_do_ato": info.get("artigo_do_ato"),
                         "publicacao": info.get("publicacao") or d10(e.get("DataVersao")),
                         "vigor": info.get("vigor") or d10(e.get("DataEntradaVigor")), "texto": txt})
    if not versions:  # an article added later and never changed again
        alt = [atos.parse(a) for a in f["AlteracoesList"]["List"]]
        info = next((a for a in alt if a and a["tipo"] == "aditado"), None) or next((a for a in alt if a), None)
        aid = reg.add(info) if info else original["id"]
        versions.append({"ato": aid, "tipo": info["tipo"] if info else "original", "artigo_do_ato": info and info.get("artigo_do_ato"),
                         "publicacao": (info and info.get("publicacao")) or d10(fv.get("DataVersao")) or original["publicacao"],
                         "vigor": (info and info.get("vigor")) or d10(fv.get("DataEntradaVigor")), "texto": texto.normalise(fv.get("Texto"))})
    # An act cannot enter into force before it is published. A retificação takes the date of the
    # act it corrects, so it can; any other earlier date is a DR data error (DL 162/2014 has 1992).
    for v in versions:
        if v["vigor"] and v["publicacao"] and v["vigor"] < v["publicacao"] and not v["ato"].startswith("declaracao-de-ret"):
            v["vigor"] = None
    # Order by the date each version took effect; unknown entry dates fall back to publication.
    versions.sort(key=lambda v: (v["vigor"] or v["publicacao"] or NO_DATE))
    spans = texto.blame([v["texto"] for v in versions])
    for v, s in zip(versions, spans):
        v["vigor_conhecido"] = bool(v["vigor"])
        if v["vigor"]:
            v.setdefault("vigor_fonte", "Diário da República (legislação consolidada)")
        v["linhas"] = [[[o, t] for o, t in line] for line in texto.lines_of(s)]
        del v["texto"]
    notas = []
    for n in f["Nota"]["List"]:
        fonte = plain(re.sub(r"</a>.*", "", n, flags=re.S))
        info = atos.parse_fonte(fonte)
        notas.append({"texto": plain(re.sub(r"^.*?</a>", "", n, flags=re.S)), "fonte": fonte,
                      "artigo_do_ato": info["artigo_do_ato"] if info else None, "ato": reg.add(info) if info else None})
    revogado = versions[-1]["tipo"] == "revogado" or fv.get("VersaoEstadoId") == 4
    return {"rotulo": f["ConsolidacaoFragmento"]["Name"], "epigrafe": (fv.get("Epigrafe") or "").strip(),
            "estado": "revogado" if revogado else "vigente", "versoes": versions, "notas": notas}


# --- Parliament -------------------------------------------------------------------------------

def link_parliament(reg: Registry, pdir: str) -> tuple[dict, dict]:
    """Initiatives behind each act, and each act's passage through Parliament (passagem.py)."""
    out: dict[str, dict] = {}
    por_ato: dict[str, list] = {}
    if not os.path.isdir(pdir):
        sys.stderr.write(f"sem dados do Parlamento em {pdir}: atos sem iniciativa\n")
        return out, {}
    diplomas = {}
    for path in glob.glob(os.path.join(pdir, "Diplomas*_json.txt")):
        with open(path, encoding="utf-8-sig") as fh:
            for d in json.load(fh):
                num = (d.get("Numero") or "") + (("-" + d["Numero2"]) if re.fullmatch(r"[A-Z]", d.get("Numero2") or "") else "")
                diplomas[(d.get("Tipo"), num, str(d.get("AnoCivil")))] = d
    wanted: dict[str, dict[str, str]] = {}  # legislatura -> {IniId: act id}
    for aid, a in reg.acts.items():
        key = atos.lei_key(a["designacao"])
        d = diplomas.get(key) if key else None
        if not d:
            continue
        a["ar"] = {"legislatura": d.get("Legislatura"), "diploma_id": d.get("Id")}
        for ini in d.get("Iniciativas") or []:
            wanted.setdefault(d.get("Legislatura"), {})[str(ini["IniId"])] = aid
    for leg, ids in wanted.items():
        path = os.path.join(pdir, f"Iniciativas{leg}_json.txt")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8-sig") as fh:
            data = json.load(fh)
        for raw_ini in data:
            iid = str(raw_ini.get("IniId"))
            if iid not in ids:
                continue
            ini = normalise_iniciativa(raw_ini)
            doc = {"id": iid, "legislatura": ini.legislature, "tipo": ini.kind, "numero": ini.number, "titulo": ini.title,
                   "autores": ini.authors, "eventos": ini.events, "conjuntas": ini.joint_with,
                   "votacoes": [{"data": v.date, "fase": v.phase, "resultado": v.result, "unanime": v.unanimous,
                                 "posicoes": v.positions, "ausentes": v.absent, "descricao": v.description} for v in ini.votes],
                   "ato": ids[iid], "link": f"https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID={iid}"}
            out[iid] = doc
            por_ato.setdefault(ids[iid], []).append((raw_ini, ini))
            reg.acts[ids[iid]].setdefault("iniciativas", []).append(
                {"id": iid, "designacao": f"{ini.kind} n.º {ini.number}/{ini.legislature}", "titulo": ini.title, "autores": ini.authors})
    comps = passagem.carregar_composicoes(pdir)
    passagens = {aid: passagem.passagem(inis, aid, comps) for aid, inis in por_ato.items()}
    return out, passagens


def copy_design_system() -> None:
    """The app loads the Redação design system's tokens and components from app/ds/."""
    src = os.path.join(ROOT, "design-system")
    dst = os.path.join(ROOT, "app", "ds")
    os.makedirs(dst, exist_ok=True)
    for name in ("tokens.css", "components/bundle.css", "components/bundle.js"):
        shutil.copyfile(os.path.join(src, name), os.path.join(dst, os.path.basename(name)))


def main() -> int:
    copy_design_system()
    with open(os.path.join(ROOT, "pipeline", "corpus.json"), encoding="utf-8") as fh:
        corpus = json.load(fh)
    reg = Registry()
    summaries, search, relatorios = [], [], {}
    for cfg in corpus["diplomas"]:
        path = os.path.join(ROOT, "data", "raw", cfg["slug"] + ".json")
        if not os.path.exists(path):
            sys.stderr.write(f"{cfg['slug']}: sem dados (corra pipeline/fetch.py)\n")
            continue
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
        raw["diploma"] = {**raw["diploma"], **cfg}
        index, summary = build_diploma(raw, reg)
        summary["n_artigos"] = sum(1 for n in index["arvore"] if n["tipo"] == "artigo")
        summary["n_atos"] = sum(1 for a in reg.acts.values() if any(ch["diploma"] == cfg["slug"] for ch in a["alteracoes"]))
        summaries.append(summary)
        if index.get("verificacao"):
            relatorios[cfg["slug"]] = index["verificacao"]
        search.extend([cfg["slug"], n["artigo"], n["rotulo"], n["epigrafe"], n["estado"]] for n in index["arvore"] if n["tipo"] == "artigo")
        sys.stderr.write(f"{cfg['slug']}: {summary['n_artigos']} artigos\n")
    iniciativas, passagens = link_parliament(reg, os.path.join(ROOT, "data", "parlamento"))
    write(os.path.join(OUT, "iniciativas.json"), iniciativas)
    write(os.path.join(OUT, "passagem.json"), passagens)
    falhas = sum(p["verificacao"].get("falha", 0) for p in passagens.values())
    print(f"{len(passagens)} passagens; {falhas} votações com resultado que não bate certo com os assentos")
    for a in reg.acts.values():
        a["alteracoes"].sort(key=lambda c: (c["diploma"], c["vigor"] or ""))
    write(os.path.join(OUT, "atos.json"), reg.acts)
    write(os.path.join(OUT, "index.json"), {"consultado_em": corpus["consultado_em"], "diplomas": summaries, "pesquisa": search})
    # The check against official republications, per diploma, for the Verificação page.
    write(os.path.join(OUT, "verificacao.json"), {"consultado_em": corpus["consultado_em"], "diplomas": {
        x["slug"]: {"titulo": x["titulo"], "sigla": x["sigla"], "relatorio": relatorios.get(x["slug"])} for x in summaries}})
    sys.stderr.write(f"{len(reg.acts)} atos, {len(iniciativas)} iniciativas ligadas\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
