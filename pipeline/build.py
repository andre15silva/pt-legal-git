"""Build the visualizer's data from the raw DR fetch and the AR open data.

    python -I pipeline/build.py            # writes app/data/ (gitignored)

Inputs:  data/raw/<slug>.json (pipeline/fetch.py), data/parlamento/*_json.txt
         (pipeline/fetch_parlamento.py), pipeline/corpus.json.
Outputs: app/data/index.json (corpus and search list), app/data/d/<slug>.json (structure),
         app/data/d/<slug>/<artigo>.json (one article's history), app/data/atos.json (acts),
         app/data/iniciativas.json, app/data/passagem.json, app/data/pendentes.json (bills
         now in Parliament), app/data/verificacao.json.

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
import pendentes  # noqa: E402
import quem  # noqa: E402
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
        self.antigos: dict[str, set[str]] = {}  # id the old rule gave -> ids now (R-8)
        self.jornal: dict[str, str] = {}
        self.pendentes: dict[tuple, dict] = {}  # (bare type, date) -> link and sumário from the timeline
        self.notas: dict[str, list] = {}  # act id -> the DR notes that name it: [{"diploma", "artigo", "texto"}]
        self.retifica: dict[str, dict] = {}  # retificação id -> {corrected act id: number of articles}

    def add(self, info: dict) -> str:
        a = self.acts.setdefault(info["id"], {"id": info["id"], "designacao": info["designacao"],
                                              "publicacao": None, "dr": None, "serie": None, "link": None,
                                              "sumario": None, "alteracoes": []})
        for k in ("publicacao", "dr", "serie", "link"):
            if info.get(k) and not a.get(k):
                a[k] = info[k]
        tipo = info["designacao"].split(" (")[0]
        if tipo in atos.SEM_NUMERO and (tipo, a.get("publicacao")) in self.pendentes:
            x = self.pendentes[(tipo, a["publicacao"])]
            a["link"] = a.get("link") or x["link"]
            a["sumario"] = a.get("sumario") or x["sumario"]
        if info.get("id_antigo"):
            self.antigos.setdefault(info["id_antigo"], set()).add(info["id"])
        if info.get("jornal"):
            self.jornal.setdefault(info["id"], info["jornal"])
        return info["id"]

    def aliases(self) -> dict[str, str]:
        """{old id: canonical id} for index.json: old links keep working. An old id that now names
        several acts (the bare "declaracao") points to the first one published."""
        out = {}
        for velho, novos in sorted(self.antigos.items()):
            if velho in self.acts:
                continue
            out[velho] = min(novos, key=lambda i: (self.acts[i].get("publicacao") or "9999", i))
        return out

    def tipos(self) -> None:
        for aid, a in self.acts.items():
            a["tipo_ato"] = atos.tipo_ato(a["designacao"], a.get("publicacao"), self.jornal.get(aid))


def e_anexo_do_codigo(p: dict, codigo_no_anexo) -> bool:
    """The annex that holds the code: any "Anexo" (True), or the one named in corpus.json
    ("Anexo IV" in the CIVA's DL 102/2008, "CÓDIGO PENAL" in DL 48/95)."""
    if p["tipo"] != ANEXO:
        return False
    if isinstance(codigo_no_anexo, dict):  # two annexes with one name: the heading decides
        return (p["nome"].strip().upper() == codigo_no_anexo["nome"].upper()
                and (p.get("epigrafe") or "").startswith(codigo_no_anexo["epigrafe"]))
    if isinstance(codigo_no_anexo, str):
        return p["nome"].strip().upper() == codigo_no_anexo.upper()
    return p["nome"].lower().startswith("anexo")


def assign_ids(items: list[tuple[list[dict], dict]], codigo_no_anexo) -> list[str]:
    """Readable, unique article ids: 'artigo-87', 'artigo-87-a'.

    For codes approved in an annex (CT, CIRC), the code's articles get the plain ids and the
    approving law's articles get 'lei-…'; articles of other annexes get the annex's name. Elsewhere
    an id gets a prefix only when two articles share a number, for example a republished annex
    next to the diploma's own articles.
    """
    def in_anexo(stack):
        return [p for p in stack if p["tipo"] == ANEXO and (p["nome"].lower().startswith("anexo") or e_anexo_do_codigo(p, codigo_no_anexo))]
    base = [slugify(f["ConsolidacaoFragmento"]["Name"]) for _, f in items]
    counts: dict[str, int] = {}
    for b in base:
        counts[b] = counts.get(b, 0) + 1
    ids, used = [], set()
    for (stack, _), b in zip(items, base):
        anexos = in_anexo(stack)
        if codigo_no_anexo:
            codigo = [p for p in anexos if e_anexo_do_codigo(p, codigo_no_anexo)]
            aid = b if codigo else slugify(anexos[-1]["nome"]) + "-" + b if anexos else "lei-" + b
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
    original_designacao = atos.limpar(plain(legis.get("FormattedTitle") or "").split(" - ")[0]) or cfg["titulo"]
    original = {"id": atos.slug(original_designacao), "designacao": original_designacao,
                "publicacao": d10(legis.get("DataPublicacao")) or raw["initial_date"],
                "link": "https://diariodarepublica.pt" + legis["LinkSitemap"] if legis.get("LinkSitemap") else None}
    reg.add(original)
    reg.acts[original["id"]]["sumario"] = plain(legis.get("Sumario")) or None

    # Summaries and links of the amending acts, from the consolidation timeline.
    for m in raw["timeline"]["ModificacoesList"]["List"]:
        bruta = m["Title"].split(" - ")[0].strip()
        desig = atos.limpar(bruta)
        if desig in atos.SEM_NUMERO:  # "Declaração - 1.ª Série": the number comes with the article entries
            reg.pendentes[(desig, d10(m.get("DataPublicacao")))] = {
                "link": "https://diariodarepublica.pt" + m["LinkSitemap"] if m.get("LinkSitemap") else None,
                "sumario": (m.get("SumarioDiplomaLegis") or "").strip() or None}
            continue
        aid = reg.add({"id": atos.slug(desig), "designacao": desig, "id_antigo": atos.slug(bruta) if atos.slug(bruta) != atos.slug(desig) else None, "publicacao": d10(m.get("DataPublicacao")),
                       "link": "https://diariodarepublica.pt" + m["LinkSitemap"] if m.get("LinkSitemap") else None})
        if m.get("SumarioDiplomaLegis") and not reg.acts[aid]["sumario"]:
            reg.acts[aid]["sumario"] = m["SumarioDiplomaLegis"].strip()

    for f in now:  # the DR leaves Name empty on some new articles; FullName ends with it
        cf = f["ConsolidacaoFragmento"]
        if not cf.get("Name"):
            cf["Name"] = (cf.get("FullName") or "").split(" > ")[-1]
    if cfg.get("artigos"):
        now = parte(now, cfg)
    nodes, items, stack, inicio_codigo = [], [], [], None
    cna = cfg.get("codigo_no_anexo")
    for f in now:
        fv, cf = f["FragmentoVersao"], f["ConsolidacaoFragmento"]
        tipo, nivel = fv["TipoFragmentoId"], f["Nivel"]
        stack = [p for p in stack if p["nivel"] < nivel]
        este = {"nivel": nivel, "tipo": tipo, "nome": cf["Name"], "epigrafe": (fv.get("Epigrafe") or "").strip()}
        # so_anexo: keep the approving act and the code's annex only (the CIVA's DL 102/2008 also
        # republishes the RITI and tables of correspondence).
        if cfg.get("so_anexo") and any(p["tipo"] == ANEXO and not e_anexo_do_codigo(p, cna) for p in stack + [este]):
            if tipo != ARTIGO:
                stack.append(este)
            continue
        if tipo != ARTIGO:
            if nivel > 0 and tipo != 7:  # skip the diploma root and the signatures
                if cna and inicio_codigo is None and e_anexo_do_codigo(este, cna):
                    inicio_codigo = len(nodes)
                nodes.append({"nivel": nivel, "tipo": "divisao", "rotulo": cf["Name"], "epigrafe": (fv.get("Epigrafe") or "").strip()})
            stack.append(este)
            continue
        nodes.append(None)
        items.append((list(stack), f))
    ids = iter(assign_ids(items, cna))
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
            for x in v.get("sem_alteracao", []):  # the act lists the article, without a redação of its own
                reg.acts[x["ato"]]["alteracoes"].append({"diploma": cfg["slug"], "artigo": aid, "rotulo": hist["rotulo"],
                                                       "tipo": "sem_alteracao", "vigor": x["vigor"]})
        artigos[aid] = hist
        for n in hist["notas"]:
            if n.get("ato"):
                reg.notas.setdefault(n["ato"], []).append({"diploma": cfg["slug"], "artigo": aid, "texto": n["texto"]})
        for k, v in enumerate(hist["versoes"]):
            corrigidas = [(x["ato"], v["ato"]) for x in v.get("sem_alteracao", []) if x["tipo"] == "retificado"]
            if v["tipo"] == "retificado" and k:
                j = k - 1  # the version it corrects: the one before, past other retificações of it
                while j > 0 and hist["versoes"][j]["tipo"] == "retificado":
                    j -= 1
                corrigidas.append((v["ato"], hist["versoes"][j]["ato"]))
            for r, alvo in corrigidas:
                if r != alvo:
                    c = reg.retifica.setdefault(r, {})
                    c[alvo] = c.get(alvo, 0) + 1
        last = hist["versoes"][-1]
        tree.append({"nivel": f["Nivel"], "tipo": "artigo", "rotulo": f["ConsolidacaoFragmento"]["Name"], "epigrafe": hist["epigrafe"],
                     "artigo": aid, "estado": hist["estado"], "n": len(hist["versoes"]), "ultima": last["vigor"] or last["publicacao"],
                     # Start of each redação, for the strip of ticks in the index.
                     "datas": [v["vigor"] or v["publicacao"] for v in hist["versoes"]],
                     # The act and type of each redação, for the comparison of the whole diploma
                     # between two dates without loading every article.
                     "atos": [v["ato"] for v in hist["versoes"]], "tipos": [v["tipo"] for v in hist["versoes"]]})

    copia = None
    if cfg.get("copia_de"):  # the NRAU's annex: a copy of another diploma's articles (R-7)
        k = next((k for k, n in enumerate(tree) if n["tipo"] == "divisao" and n["rotulo"].strip() == cfg["copia_de"]["anexo"]), None)
        if k is not None:
            copia = {"inicio": k, "diploma": cfg["copia_de"]["diploma"], "rotulo": cfg["copia_de"]["anexo"]}
    index = {"copia": copia, "slug": cfg["slug"], "titulo": cfg["titulo"], "sigla": cfg["sigla"], "genitivo": cfg.get("genitivo"),
             "vigor_original": cfg.get("vigor_original"), "inicio_historia": cfg.get("inicio_historia"), "parte": cfg.get("parte"), "designacao": original["designacao"],
             "inicio_codigo": inicio_codigo,
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


def ordenar_versoes(versions: list[dict]) -> list[dict]:
    """Order redações by the date each took effect (unknown entry dates fall back to publication),
    with each retificação right after the version it corrects (R-2).

    `versions` comes oldest first, in the DR's own order: the version a retificação corrects is the
    one before it. Lei n.º 74/98, art. 5.º, n.º 4: the retificação reports its effects to the entry
    into force of the corrected text, so it takes that version's vigor. It is never sorted by its
    own date (Declaração de Retificação n.º 17/2026/1 has the publication date of the Lei Orgânica
    it corrects and no vigor; by date it came first and was credited with the whole text).
    """
    corrige: dict[int, dict] = {}
    for k, v in enumerate(versions):
        if v["tipo"] == "retificado" and k > 0:
            alvo = versions[k - 1]
            while id(alvo) in corrige:  # a retificação of a retificação corrects the same text
                alvo = corrige[id(alvo)]
            corrige[id(v)] = alvo
            v["vigor"] = alvo["vigor"]
    base = sorted((v for v in versions if id(v) not in corrige), key=lambda v: (v["vigor"] or v["publicacao"] or NO_DATE))
    out = []
    for v in base:
        out.append(v)
        out.extend(r for r in versions if corrige.get(id(r)) is v)
    return out


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
        if v["vigor"] and v["publicacao"] and v["vigor"] < v["publicacao"] and v["tipo"] != "retificado":
            v["vigor"] = None
    versions = ordenar_versoes(versions)
    # An act that touched the article without changing its text (a republication, a second
    # revocation, a change the DR does not show, such as to the heading) is not a new redação: it
    # stays as a note on the redação it left as it was.
    juntas = []
    for v in versions:
        if juntas and re.sub(r"\s+", " ", v["texto"]).strip() == re.sub(r"\s+", " ", juntas[-1]["texto"]).strip():
            juntas[-1].setdefault("sem_alteracao", []).append({k: v[k] for k in ("ato", "tipo", "artigo_do_ato", "publicacao", "vigor")})
        else:
            juntas.append(v)
    versions = juntas
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

def link_parliament(reg: Registry, pdir: str, corpus: dict | None = None) -> tuple[dict, dict]:
    """Initiatives behind each act, and each act's passage through Parliament (passagem.py).

    For each law: its AR record in Diplomas<leg>, the initiatives it lists, and the Decretos da AR
    of those initiatives. The decree whose title is the law's title is this law's (R-1, cascade
    step 1); the others are another law's, and their events and votes are dropped.
    """
    out: dict[str, dict] = {}
    por_ato: dict[str, list] = {}
    LIGACAO["indice"] = {}
    if not os.path.isdir(pdir):
        sys.stderr.write(f"sem dados do Parlamento em {pdir}: atos sem iniciativa\n")
        return out, {}
    grupos = quem.Grupos(pdir)
    LIGACAO["grupos"] = grupos
    diplomas, decretos_por_ini = {}, {}
    for path in glob.glob(os.path.join(pdir, "Diplomas*_json.txt")):
        with open(path, encoding="utf-8-sig") as fh:
            for d in json.load(fh):
                num = (d.get("Numero") or "") + (("-" + d["Numero2"]) if re.fullmatch(r"[A-Z]", d.get("Numero2") or "") else "")
                diplomas[(d.get("Tipo"), num, str(d.get("AnoCivil")))] = d
                if d.get("Tipo") == "Decreto da Assembleia da República":
                    dec = {"numero": f"{num}/{d.get('Legislatura')}", "titulo": (d.get("Titulo") or "").strip(), "id": d.get("Id"),
                           "ordem": (str(d.get("AnoCivil")), int(d.get("Id") or 0))}
                    for i in d.get("Iniciativas") or []:
                        decretos_por_ini.setdefault(str(i.get("IniId")), []).append(dec)
    wanted: dict[str, dict[str, str]] = {}  # legislatura -> {IniId: act id}
    contexto: dict[str, dict] = {}
    titulos = {c["slug"]: c for c in (corpus or {}).get("diplomas", [])}
    for aid, a in reg.acts.items():
        key = atos.lei_key(a["designacao"])
        d = diplomas.get(key) if key else None
        if not d:
            continue
        a["ar"] = {"legislatura": d.get("Legislatura"), "diploma_id": d.get("Id")}
        inis = [str(i["IniId"]) for i in d.get("Iniciativas") or []]
        for iid in inis:
            wanted.setdefault(d.get("Legislatura"), {})[iid] = aid
        todos = {x["id"]: x for iid in inis for x in decretos_por_ini.get(iid, [])}
        titulo = quem.dobrar(re.sub(r"[^\w\s]", " ", d.get("Titulo") or ""))
        meus = [x for x in todos.values() if quem.dobrar(re.sub(r"[^\w\s]", " ", x["titulo"])) == titulo]
        if not meus and len(todos) == 1:
            meus = list(todos.values())
        alvos = [d.get("Titulo") or ""]
        for slug in {c["diploma"] for c in a["alteracoes"]}:
            c = titulos.get(slug) or {}
            alvos += [c.get("titulo"), re.sub(r"\s*\(.*", "", c.get("designacao") or "")]
        contexto[aid] = {"publicacao": a.get("publicacao"), "grupos": grupos, "alvos": [x for x in alvos if x],
                         "decretos": {"meus": sorted(meus, key=lambda x: x["ordem"]),
                                      "outros": sorted((x for x in todos.values() if x not in meus), key=lambda x: x["ordem"])}}
    for leg, ids in wanted.items():
        # Legislatura I has two AR files (IA, IB); every other one has its own.
        for path in [os.path.join(pdir, f"Iniciativas{x}_json.txt") for x in (("IA", "IB") if leg == "I" else (leg,))]:
            if not os.path.exists(path):
                continue
            with open(path, encoding="utf-8-sig") as fh:
                data = json.load(fh)
            for raw_ini in data:
                LIGACAO["indice"][(raw_ini.get("IniDescTipo"), str(raw_ini.get("IniNr")), raw_ini.get("IniLeg"))] = str(raw_ini.get("IniId"))
                iid = str(raw_ini.get("IniId"))
                if iid not in ids:
                    continue
                ini = normalise_iniciativa(raw_ini)
                doc = {"id": iid, "legislatura": ini.legislature, "tipo": ini.kind, "numero": ini.number, "titulo": ini.title,
                       "autores": ini.authors, "eventos": ini.events, "conjuntas": ini.joint_with,
                       "votacoes": [_votacao_iniciativa(v, grupos) for v in ini.votes],
                       "ato": ids[iid], "link": f"https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID={iid}"}
                out[iid] = doc
                por_ato.setdefault(ids[iid], []).append((raw_ini, ini))
                reg.acts[ids[iid]].setdefault("iniciativas", []).append(
                    {"id": iid, "designacao": f"{ini.kind} n.º {ini.number}/{ini.legislature}", "titulo": ini.title, "autores": ini.authors})
    comps = passagem.carregar_composicoes(pdir, grupos)
    LIGACAO["comps"] = comps
    passagens = {aid: passagem.passagem(inis, aid, comps, contexto[aid]) for aid, inis in por_ato.items()}
    return out, passagens


# What link_parliament learnt, for quem.py: the AR groups, the seats and {(tipo, número, leg): IniId}.
LIGACAO: dict = {}


def _votacao_iniciativa(v, grupos) -> dict:
    """A vote for iniciativas.json: positions with the siglas of the vote's legislatura; absent groups apart (R-4, R-5)."""
    leg = grupos.legislatura_em(v.date)
    pos, aus = {}, [a for a in v.absent if "(" not in a]
    for who, s in v.positions.items():
        m = re.match(r"^(\d+-)?(.+?)(\s*\(([^()]+)\))?$", re.sub(r"\s+", " ", who).strip())
        if s == "ausente":
            if not m.group(3) and grupos.e_grupo(m.group(2)):
                aus.append(grupos.sigla(m.group(2), leg))
            continue
        if m.group(3):
            who = f"{m.group(2)} ({grupos.sigla(m.group(4), leg) if grupos.e_grupo(m.group(4)) else m.group(4)})"
        else:
            who = (m.group(1) or "") + grupos.sigla(m.group(2), leg)
        pos[who] = s
    return {"data": v.date, "fase": v.phase, "resultado": v.result, "unanime": v.unanimous, "posicoes": pos,
            "ausentes": list(dict.fromkeys(aus)), "descricao": v.description, "legislatura": leg}


def marcar_copias(summaries: list[dict], ids: dict[str, set[str]], search: list[list]) -> None:
    """Articles of a copy (the NRAU's annex of Código Civil articles 1022.º to 1113.º) point to the
    article in force, when it exists (R-7). Search rows get the target as a 6th element (else null),
    so the app can sort the copies last."""
    alvo_de: dict[tuple[str, str], str] = {}
    for x in summaries:
        path = os.path.join(OUT, "d", x["slug"] + ".json")
        with open(path, encoding="utf-8") as fh:
            d = json.load(fh)
        copia = d.get("copia")
        if not copia:
            continue
        for n in d["arvore"][copia["inicio"]:]:
            if n["tipo"] != "artigo" or n["artigo"] not in ids.get(copia["diploma"], set()):
                continue
            p = os.path.join(OUT, "d", x["slug"], n["artigo"] + ".json")
            with open(p, encoding="utf-8") as fh:
                art = json.load(fh)
            art["copia_de"] = {"diploma": copia["diploma"], "artigo": n["artigo"]}
            write(p, art)
            alvo_de[(x["slug"], n["artigo"])] = copia["diploma"]
    for row in search:
        row.append(alvo_de.get((row[0], row[1])))


def verificar_diploma(slug: str) -> list[str]:
    """What is wrong with a built diploma, for entries pipeline/descobrir.py wrote: [] when it holds up."""
    with open(os.path.join(OUT, "d", slug + ".json"), encoding="utf-8") as fh:
        d = json.load(fh)
    arts = [n for n in d["arvore"] if n["tipo"] == "artigo"]
    out = []
    if not arts:
        out.append("sem artigos")
    if any(not n["artigo"] or not n["rotulo"] for n in arts):
        out.append("artigos sem número")
    sem, total = 0, 0  # amended redações without a date (an original without one is a known gap)
    for n in arts:
        with open(os.path.join(OUT, "d", slug, n["artigo"] + ".json"), encoding="utf-8") as fh:
            vs = [v for v in json.load(fh)["versoes"] if v["tipo"] != "original"]
        total += len(vs)
        sem += sum(1 for v in vs if not v.get("vigor"))
    if total and sem / total > 0.5:
        out.append(f"{sem} de {total} redações sem data de entrada em vigor")
    return out


def retirar(slug: str, reg: Registry) -> None:
    """Take a diploma off the site: its files, and its rows in the acts' lists of changes."""
    pasta = os.path.join(OUT, "d", slug)
    if os.path.isdir(pasta):
        shutil.rmtree(pasta)
    if os.path.exists(pasta + ".json"):
        os.remove(pasta + ".json")
    for a in reg.acts.values():
        a["alteracoes"] = [c for c in a["alteracoes"] if c["diploma"] != slug]


def sinonimos() -> list[dict]:
    """Everyday words and the law's words, for search (pipeline/sinonimos.json)."""
    with open(os.path.join(ROOT, "pipeline", "sinonimos.json"), encoding="utf-8") as fh:
        return json.load(fh)["sinonimos"]


def copy_design_system() -> None:
    """The app loads the Redação design system's tokens and components from app/ds/."""
    src = os.path.join(ROOT, "design-system")
    dst = os.path.join(ROOT, "app", "ds")
    os.makedirs(dst, exist_ok=True)
    for name in ("tokens.css", "components/bundle.css", "components/bundle.js"):
        shutil.copyfile(os.path.join(src, name), os.path.join(dst, os.path.basename(name)))


def main() -> int:
    copy_design_system()
    corpus = fetch.carregar_corpus()
    reg = Registry()
    summaries, search, relatorios, ids, excluidos = [], [], {}, {}, []
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
        problemas = verificar_diploma(cfg["slug"]) if cfg.get("auto") else []
        if problemas:  # a generated entry that does not hold up stays off the site
            retirar(cfg["slug"], reg)
            excluidos.append((cfg["slug"], problemas))
            sys.stderr.write(f"{cfg['slug']}: FORA ({'; '.join(problemas)})\n")
            continue
        summary["area"] = cfg.get("area")
        summary["n_atos"] = sum(1 for a in reg.acts.values() if any(ch["diploma"] == cfg["slug"] for ch in a["alteracoes"]))
        summaries.append(summary)
        if index.get("verificacao"):
            relatorios[cfg["slug"]] = index["verificacao"]
        search.extend([cfg["slug"], n["artigo"], n["rotulo"], n["epigrafe"], n["estado"]] for n in index["arvore"] if n["tipo"] == "artigo")
        ids[cfg["slug"]] = {n["artigo"] for n in index["arvore"] if n["tipo"] == "artigo"}
        sys.stderr.write(f"{cfg['slug']}: {summary['n_artigos']} artigos\n")
    marcar_copias(summaries, ids, search)
    iniciativas, passagens = link_parliament(reg, os.path.join(ROOT, "data", "parlamento"), {"diplomas": summaries})
    write(os.path.join(OUT, "iniciativas.json"), iniciativas)
    write(os.path.join(OUT, "passagem.json"), passagens)
    # Bills now in Parliament that would change these diplomas (pipeline/pendentes.py).
    pdir = os.path.join(ROOT, "data", "parlamento")
    pend = pendentes.pendentes([c for c in corpus["diplomas"] if c["slug"] in ids], ids,
                               passagem.carregar_composicoes(pdir) if os.path.isdir(pdir) else {})
    pend["consultado_em"] = fetch.hoje(corpus)
    write(os.path.join(OUT, "pendentes.json"), pend)
    print(f"{len(pend['iniciativas'])} iniciativas pendentes")
    falhas = sum(p["verificacao"].get("falha", 0) for p in passagens.values())
    print(f"{len(passagens)} passagens; {falhas} votações com resultado que não bate certo com os assentos")
    for a in reg.acts.values():
        a["alteracoes"].sort(key=lambda c: (c["diploma"], c["vigor"] or ""))
    reg.tipos()
    write(os.path.join(OUT, "atos.json"), reg.acts)
    # Every article's number and heading, for search: loaded only when the reader searches.
    write(os.path.join(OUT, "pesquisa.json"), search)
    write(os.path.join(OUT, "index.json"), {"consultado_em": fetch.hoje(corpus), "diplomas": summaries,
                                            "sinonimos": sinonimos(), "aliases_atos": reg.aliases()})
    # Who made each act (pipeline/quem.py): quem.json, governos.json, quem/<slug>.json, grupos/.
    verif_quem = quem.construir(OUT, reg.acts, passagens, iniciativas, LIGACAO, reg.notas, reg.retifica, summaries, fetch.hoje(corpus))
    relatar_quem(verif_quem)
    # The check against official republications, per diploma, for the Verificação page.
    write(os.path.join(OUT, "verificacao.json"), {"consultado_em": fetch.hoje(corpus), "diplomas": {
        x["slug"]: {"titulo": x["titulo"], "sigla": x["sigla"], "relatorio": relatorios.get(x["slug"])} for x in summaries},
        "quem": verif_quem, "conteudo": []})
    sys.stderr.write(f"{len(reg.acts)} atos, {len(iniciativas)} iniciativas ligadas\n")
    for slug, problemas in excluidos:
        print(f"fora do site: {slug}: {'; '.join(problemas)}")
    # Stories, glossary and share pages (pipeline/conteudo.py, workstream C).
    import conteudo
    estrito = os.environ.get("REDACAO_ESTRITO") == "1"
    erros = conteudo.construir(OUT, estrito)             # list[str]
    for e in erros:
        sys.stderr.write("conteúdo: " + e + "\n")
    if erros and estrito:
        return 1
    return 0


def relatar_quem(v: dict) -> None:
    """The build log for R-10/R-13: coverage, conflicts and the acts left without a fact."""
    c = v["cobertura"]
    sys.stderr.write(f"quem: decretos-leis com data do Conselho de Ministros {c['dl_d_cm']:.1%}; leis com promulgação {c['leis_promulgacao']:.1%}; "
                     f"{len(v['cruzamento'])} avisos ou conflitos; {len(v['mesmo_pm'])} decretos-leis perto de uma posse com o mesmo Primeiro-Ministro\n")
    for x in v["cruzamento"]:
        if x["estado"] == "conflito":
            sys.stderr.write(f"quem: CONFLITO {x['ato']} ({x['regra']}): {x['detalhe']}\n")


if __name__ == "__main__":
    sys.exit(main())
