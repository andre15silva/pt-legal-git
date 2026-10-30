"""Who made each act: Governments, Presidents, legislaturas and parliamentary groups.

Inputs (committed, hand-curated, every row sourced): pipeline/governos.json, pipeline/presidentes.json,
pipeline/grupos.json. Inputs (built): the signature blocks (pipeline/assinaturas.json ∪
data/assinaturas.json, pipeline/assinaturas.py), the acts and their passage (build.py, passagem.py),
the AR open data (InformacaoBase<leg>: legislatura dates, group names).

Outputs (build.py calls escrever()): app/data/quem.json (one record per act), app/data/governos.json,
app/data/quem/<slug>.json (the timeline of one diploma), app/data/grupos/index.json and
app/data/grupos/<id>.json, and the "quem" section of app/data/verificacao.json.

The pipeline writes facts and reason codes, never sentences: the app turns codes into text.
Method: docs/QUEM.md. Shapes: the design spec §2 and pipeline/contrato.py.
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPE = os.path.join(ROOT, "pipeline")
REVOLUCAO = "1976-04-25"  # the Constitution enters into force


def _ler(path: str):
    with open(path, encoding="utf-8-sig") as fh:
        return json.load(fh)


def dobrar(s: str | None) -> str:
    """Case, accents and spacing folded: for comparing names and titles."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", s).strip()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", dobrar(s)).strip("-")


def dia_seguinte(d: str, n: int = 1) -> str:
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()


def dias(a: str, b: str) -> int:
    """b − a in days."""
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


# ---- Legislaturas and parliamentary groups -------------------------------------------------------
class Grupos:
    """The groups of every legislatura, from the AR files, with a stable id per party.

    The displayed sigla is the one of the AR file of the legislatura (R-5): "CDS" up to V, "CDS-PP"
    from VI; "PPD" in the Constituinte and IA, "PSD" after. pipeline/grupos.json says which siglas
    are one party (familias), fixes the case of a few names (grafia) and lists what is not a group.
    """

    def __init__(self, pdir: str, cfg: dict | None = None):
        self.cfg = cfg if cfg is not None else _ler(os.path.join(PIPE, "grupos.json"))
        self.familia = {s: fid for fid, f in self.cfg["familias"].items() for s in f["siglas"]}
        self.excluir = set(self.cfg.get("excluir", []))
        self.sem_grupo = set(self.cfg.get("sem_grupo", []))
        self.legislaturas: list[dict] = []
        self.nomes: dict[str, dict[str, str]] = {}  # leg -> {sigla: nome}
        for path in glob.glob(os.path.join(pdir, "InformacaoBase*_json.txt")):
            leg = re.search(r"InformacaoBase(\w+?)_json", path).group(1)
            info = _ler(path)
            d = info.get("DetalheLegislatura") or {}
            self.legislaturas.append({"sigla": leg, "inicio": (d.get("dtini") or "")[:10] or None, "fim": (d.get("dtfim") or "")[:10] or None})
            self.nomes[leg] = {g["sigla"]: self.grafia(g.get("nome") or g["sigla"])
                               for g in info.get("GruposParlamentares") or [] if g.get("sigla") and g["sigla"] not in self.excluir}
        self.legislaturas.sort(key=lambda x: x["inicio"] or "")
        # Intervals here are half-open [inicio, fim): fim is the day after the AR's dtfim (the
        # Constituinte ended 1976-04-02, two months before the I legislatura).
        for a, b in zip(self.legislaturas, self.legislaturas[1:]):
            a["fim"] = min(b["inicio"], dia_seguinte(a["fim"])) if a["fim"] else b["inicio"]
        if self.legislaturas:
            self.legislaturas[-1]["fim"] = None
        self.extra: dict[str, dict[str, str]] = {}  # siglas the AR records use outside the file of their legislatura

    def grafia(self, nome: str) -> str:
        return self.cfg.get("grafia", {}).get(nome, nome)

    def id(self, sigla: str) -> str:
        return self.familia.get(sigla) or slug(sigla)

    def legislatura_em(self, data: str | None) -> str | None:
        if not data:
            return None
        for x in self.legislaturas:
            if x["inicio"] and x["inicio"] <= data and (x["fim"] is None or data < x["fim"]):
                return x["sigla"]
        return None

    def sigla(self, bruta: str, leg: str | None) -> str:
        """The sigla as the AR file of `leg` names that party ("CDS-PP" in II -> "CDS")."""
        bruta = re.sub(r"\s+", " ", bruta or "").strip()
        if not leg or leg not in self.nomes or bruta in self.nomes[leg]:
            return bruta
        gid = self.id(bruta)
        for s in self.nomes[leg]:
            if self.id(s) == gid:
                return s
        self.extra.setdefault(leg, {})[bruta] = gid
        return bruta

    def e_grupo(self, sigla: str) -> bool:
        return bool(sigla) and sigla not in self.excluir and sigla not in self.sem_grupo

    def siglas(self) -> dict[str, dict[str, str]]:
        out = {leg: {s: self.id(s) for s in nomes} for leg, nomes in self.nomes.items()}
        for leg, extra in self.extra.items():
            out.setdefault(leg, {}).update(extra)
        return out

    def grupos(self) -> dict[str, dict]:
        """{id: {"id", "nomes": [{"sigla", "nome", "legislaturas"}]}}, names in order of first use."""
        ordem = [x["sigla"] for x in self.legislaturas]
        out: dict[str, dict] = {}
        for leg in ordem:
            for s, nome in self.nomes.get(leg, {}).items():
                g = out.setdefault(self.id(s), {"id": self.id(s), "nomes": []})
                n = next((n for n in g["nomes"] if n["sigla"] == s and n["nome"] == nome), None)
                if n is None:
                    g["nomes"].append({"sigla": s, "nome": nome, "legislaturas": [leg]})
                elif leg not in n["legislaturas"]:
                    n["legislaturas"].append(leg)
        for leg, extra in self.extra.items():
            for s, gid in extra.items():
                g = out.setdefault(gid, {"id": gid, "nomes": []})
                if not any(n["sigla"] == s for n in g["nomes"]):
                    # A sigla the AR used before the group was in the file: the name of the
                    # nearest legislatura that has it.
                    nome = next((self.nomes[l][s] for l in ordem if s in self.nomes.get(l, {})), s)
                    g["nomes"].append({"sigla": s, "nome": nome, "legislaturas": []})
                n = next(n for n in g["nomes"] if n["sigla"] == s)
                if leg not in n["legislaturas"]:
                    n["legislaturas"].append(leg)
                    n["legislaturas"].sort(key=ordem.index)
        return out

    def nome(self, sigla: str, leg: str | None) -> str | None:
        if leg and sigla in self.nomes.get(leg, {}):
            return self.nomes[leg][sigla]
        for l in reversed([x["sigla"] for x in self.legislaturas]):
            if sigla in self.nomes.get(l, {}):
                return self.nomes[l][sigla]
        return None


# ---- Tables -----------------------------------------------------------------------------------
class Tabelas:
    """pipeline/governos.json and pipeline/presidentes.json, with date lookups on [inicio, fim)."""

    def __init__(self, governos: dict | None = None, presidentes: dict | None = None):
        self.g = (governos or _ler(os.path.join(PIPE, "governos.json")))["governos"]
        p = presidentes or _ler(os.path.join(PIPE, "presidentes.json"))
        self.p = p["presidentes"]
        self.interinos = p.get("interinos", [])
        self.por_numero = {g["numero"]: g for g in self.g}

    @staticmethod
    def _em(linhas, data):
        if not data:
            return None
        return next((x for x in linhas if x["inicio"] <= data and (x["fim"] is None or data < x["fim"])), None)

    def governo(self, data: str | None) -> dict | None:
        return self._em(self.g, data)

    def presidente(self, data: str | None) -> dict | None:
        return self._em(self.p, data)

    def aberta(self, linha: dict) -> bool:
        return linha.get("fim") is None

    def mudancas_presidente(self) -> list[str]:
        return [p["inicio"] for p in self.p[1:]]

    @staticmethod
    def nome_igual(nome: str | None, formas: list[str]) -> bool:
        return bool(nome) and dobrar(nome) in {dobrar(f) for f in formas}


# ---- One record per act ----------------------------------------------------------------------
TIPO_PROPONENTE = {"governo": "governo", "grupos": "grupos", "deputados": "grupos", "cidadaos": "cidadaos", "regiao": "regiao",
                   "comissao": "comissao", "mesa": "mesa"}
LEIS = ("lei", "lei-organica", "lei-constitucional")
_OE = re.compile(r"Orçamento do Estado para (?:o ano (?:económico )?de )?(\d{4})", re.I)
_EFEITOS = re.compile(r"com efeitos? (?:a partir de|desde) (\d{4}-\d{2}-\d{2}|\d{1,2} de \w+ de \d{4})", re.I)
_REDACAO = re.compile(r"na reda[cç][ãa]o (?:dada|introduzida) pel[oa] ((?:Lei(?: Orgânica)?|Decreto-Lei) n\.º\s*\d+(?:-[A-Z])?/\d{2,4})", re.I)
# «n.º 8 do presente artigo»; not «Lei n.º 64/2018» nor «n.º 1 do artigo 62.º» (another article)
_NUMEROS = re.compile(r"\bn\.?\s*º\s*(\d+)(?![\d/])(?:\s+do\s+artigo\s+(\d+))?")


def _data_texto(s: str) -> str | None:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    import assinaturas
    m = re.match(r"(\d{1,2})\s*\.?\s*º?\s*de\s+(\w+)\s+de\s+(\d{4})", s)
    return assinaturas.data_pt(*m.groups()) if m else None


def tribunal(aid: str, ato: dict, notas: list[dict], entrada: dict | None) -> dict:
    """The norms an acórdão removed, from the DR notes that name it (finding 18)."""
    import atos as atos_mod
    normas = []
    for n in notas:
        t = n["texto"]
        if not re.search(r"inconstitucional|ilegal", t, re.I):
            continue
        m = _REDACAO.search(t)
        e = _EFEITOS.search(t)
        proprio = re.sub(r"\D", "", n["artigo"].split("-")[1]) if "-" in n["artigo"] else ""
        numeros = {x for x, art in _NUMEROS.findall(t) if not art or art == proprio}
        normas.append({"diploma": n["diploma"], "artigo": n["artigo"], "numeros": sorted(numeros, key=int),
                       "escrito_por": atos_mod.slug(m.group(1)) if m else None, "efeitos_desde": _data_texto(e.group(1)) if e else None,
                       "tipo": "inconstitucional" if re.search(r"inconstitucional", t, re.I) else "ilegal"})
    d = (entrada or {}).get("d_decisao")
    nome = "Tribunal Constitucional" if ato["tipo_ato"] == "acordao-tc" else ("Supremo Tribunal de Justiça" if "Supremo Tribunal de Justiça" in ato["designacao"] else None)
    return {"tribunal": nome, "data": d or ato.get("publicacao"), "data_base": "decisao" if d else "publicacao", "normas": normas}


def registo(aid: str, a: dict, p: dict | None, sig: dict | None, t: Tabelas, grupos: Grupos | None, ctx: dict) -> dict:
    """The quem.json record of one act (design spec §2.6). Facts and reason codes only."""
    tipo = a["tipo_ato"]
    pub = a.get("publicacao")
    motivos: dict[str, str] = {}
    verif: list[dict] = []
    est = (sig or {}).get("estado") or {}
    erro = (sig or {}).get("erro")
    ok = lambda campo: est.get(campo) == "ok"  # noqa: E731
    falta_bloco = "sem_link" if not a.get("link") else "por_ler" if sig is None or (erro or "").startswith(("rede", "api")) else \
        "sem_texto" if erro == "sem_texto" else None
    # Signature reading.
    if not a.get("link"):
        assinatura = {"estado": "sem_link", "obtido_em": None, "url": None}
    elif sig is None or (erro or "").startswith(("rede", "api")):
        assinatura = {"estado": "por_ler", "obtido_em": None, "url": a["link"]}
    elif erro:
        assinatura = {"estado": "falhou", "obtido_em": sig.get("obtido_em"), "url": a["link"]}
    else:
        esperados = {"decreto-lei": ("d_cm", "d_promulgacao", "presidente_nome"), "lei": ("d_promulgacao", "presidente_nome"),
                     "lei-organica": ("d_promulgacao", "presidente_nome"), "lei-constitucional": ("d_promulgacao", "presidente_nome")}.get(tipo, ())
        if esperados and sig.get("bloco") == "sem_bloco":
            e = "falhou"
        elif any(est.get(c) != "ok" for c in esperados):
            e = "parcial"
        else:
            e = "ok"
        assinatura = {"estado": e, "obtido_em": sig.get("obtido_em"), "url": a["link"]}
    primeira_posse = t.g[0]["inicio"]
    # Decreto-lei: the Government in office on the date of the Council of Ministers.
    d_cm = sig.get("d_cm") if sig and tipo == "decreto-lei" and ok("d_cm") else None
    governo = None
    if tipo == "decreto-lei":
        if d_cm and d_cm < primeira_posse:
            motivos["governo"] = "antes_governo_constitucional"
        elif d_cm:
            g = t.governo(d_cm)
            governo = {"numero": g["numero"], "base": "conselho_ministros", "data": d_cm} if g else None
            if not g:
                motivos["governo"] = "conflito"
        elif pub and pub < primeira_posse:
            motivos["governo"] = "antes_governo_constitucional"
        else:
            motivos["governo"] = falta_bloco or ("conflito" if est.get("d_cm") == "suspeito" else "sem_d_cm")
        if d_cm is None:
            motivos["d_cm"] = motivos["governo"]
    gp = t.governo(pub)
    # The President: the name in the block, checked against the table on the promulgation date.
    presidente = None
    if tipo in LEIS + ("decreto-lei",) or (sig and sig.get("d_promulgacao") and tipo not in ("pre1976", "retificacao", "acordao-tc", "acordao-outro")):
        dp = sig.get("d_promulgacao") if sig and ok("d_promulgacao") else None
        nome_bloco = sig.get("presidente_nome") if sig and ok("presidente_nome") else None
        if dp and dp < t.p[0]["inicio"]:
            motivos["presidente"] = "antes_1976"
        elif dp and sig.get("presidente_interino"):
            x = next((i for i in t.interinos if Tabelas.nome_igual(nome_bloco, i["nomes_dr"])), None)
            presidente = {"id": None, "nome": x["nome"] if x else nome_bloco, "d_promulgacao": dp, "base": "assinatura", "interino": True}
            verif.append({"regra": "presidente", "estado": "aviso", "detalhe": "Presidente da República Interino"})
        elif dp:
            linha = t.presidente(dp)
            if linha and (nome_bloco is None or Tabelas.nome_igual(nome_bloco, linha["nomes_dr"])):
                presidente = {"id": linha["id"], "nome": linha["nome"], "d_promulgacao": dp, "base": "assinatura"}
                verif.append({"regra": "presidente", "estado": "ok" if nome_bloco else "aviso"})
            else:
                motivos["presidente"] = "tabela_aberta" if linha and t.aberta(linha) else "conflito"
                verif.append({"regra": "presidente", "estado": "conflito",
                              "detalhe": f"bloco: {nome_bloco}; tabela em {dp}: {linha['nome'] if linha else '—'}"})
        else:
            # No date in the block: the AR's promulgation date, the name from the table.
            dar = next((s["data"] for s in (p or {}).get("passos", []) if s["passo"] == "promulgacao"), None)
            linha = t.presidente(dar)
            if dar and linha:
                presidente = {"id": linha["id"], "nome": linha["nome"], "d_promulgacao": dar, "base": "parlamento"}
            elif pub and pub < REVOLUCAO:
                motivos["presidente"] = "antes_1976"
            else:
                motivos["presidente"] = falta_bloco or ("conflito" if est.get("d_promulgacao") == "suspeito" else "sem_texto" if sig and sig.get("bloco") == "sem_bloco" else "conflito")
        if presidente and p:
            dar = next((s["data"] for s in p.get("passos", []) if s["passo"] == "promulgacao"), None)
            if dar and presidente["base"] == "assinatura":
                verif.append({"regra": "promulgacao_ar", "estado": "ok" if dar == presidente["d_promulgacao"] else "aviso",
                              **({} if dar == presidente["d_promulgacao"] else {"detalhe": f"Parlamento: {dar}; bloco: {presidente['d_promulgacao']}"})})
    # R-13 (b) and (c): the countersignature and the first signatory of the Council of Ministers.
    if sig and sig.get("referenda_nome") and ok("d_referenda") and not sig.get("referenda_por_outro"):
        g = t.governo(sig["d_referenda"])
        if g and Tabelas.nome_igual(sig["referenda_nome"], g["nomes_dr"]):
            verif.append({"regra": "referenda", "estado": "ok"})
        elif g:
            verif.append({"regra": "referenda", "estado": "conflito", "detalhe": f"referenda: {sig['referenda_nome']}; tabela em {sig['d_referenda']}: {g['primeiro_ministro']}"})
            if governo and governo["numero"] == g["numero"]:
                governo = None
                motivos["governo"] = "tabela_aberta" if t.aberta(g) else "conflito"
    if d_cm and sig.get("cm_signatarios"):
        g = t.governo(d_cm)
        if g:
            igual = Tabelas.nome_igual(sig["cm_signatarios"][0], g["nomes_dr"])
            verif.append({"regra": "cm_primeiro", "estado": "ok" if igual else "aviso",
                          **({} if igual else {"detalhe": f"primeiro a assinar: {sig['cm_signatarios'][0]}"})})
    # A DL approved within 14 days of a posse between two Governments with the same PM (finding 19).
    if d_cm:
        for a_, b_ in zip(t.g, t.g[1:]):
            if dobrar(a_["primeiro_ministro"]) == dobrar(b_["primeiro_ministro"]) and abs(dias(b_["inicio"], d_cm)) <= 14:
                verif.append({"regra": "mesmo_pm", "estado": "aviso", "detalhe": f"Conselho de Ministros a {abs(dias(b_['inicio'], d_cm))} dias da posse do Governo {b_['numero']}",
                              "governos": [a_["numero"], b_["numero"]]})
    # The passage: proposers, committee text, final vote, events.
    proponentes, texto_comissao, vfg, eventos = [], None, None, []
    entradas = ctx.get("entradas", {})
    if p:
        # Initiatives a committee text joined but the AR does not link to the law: their authors come
        # from iniciativas.json (["BE", "Grupos Parlamentares"], ["Governo"]).
        ligadas = {i["id"] for i in p["iniciativas"]}
        juntas = []
        tcs = [g for g in p.get("generalidade", []) if g["origem"] == "texto_comissao"]
        for c in (p["texto_comissao"][tcs[0]["indice"]].get("citadas_todas") or []) if tcs else []:
            iid = ctx.get("indice", {}).get((c["tipo"], c["numero"], c["legislatura"]))
            r = ctx.get("iniciativas", {}).get(iid or "")
            if iid and r and iid not in ligadas and r.get("autores"):
                ligadas.add(iid)
                cat, gs_ = r["autores"][-1], r["autores"][:-1]
                tipo_ = {"Governo": "governo", "Deputados": "deputados", "Cidadãos": "cidadaos"}.get(cat, "regiao" if cat.startswith("Assembleia Legislativa") else "grupos")
                juntas.append({"id": iid, "designacao": f"{r['tipo']} n.º {r['numero']}/{r['legislatura']}", "generalidade": None,
                               "autores": {"tipo": tipo_, "grupos": gs_, "deputados": [], "nome": "Governo" if tipo_ == "governo" else cat if tipo_ == "regiao" else None}})
        for i in p["iniciativas"] + juntas:
            au = i["autores"]
            tp = TIPO_PROPONENTE.get(au.get("tipo"), "grupos")
            leg = i["designacao"].rsplit("/", 1)[-1]
            ent = entradas.get(i["id"])
            legd = grupos.legislatura_em(ent) if grupos and ent else None
            siglas = list(dict.fromkeys(au.get("grupos") or [d["grupo"] for d in au.get("deputados") or [] if d.get("grupo")]))
            gs = [{"id": grupos.id(grupos.sigla(s, legd or leg)), "sigla": grupos.sigla(s, legd or leg)} for s in siglas if grupos and grupos.e_grupo(s)] \
                if tp == "grupos" else []
            sem = [d["nome"] for d in au.get("deputados") or [] if grupos and not grupos.e_grupo(d.get("grupo") or "Ninsc")] if tp == "grupos" else []
            gov = t.governo(ent) if tp == "governo" and ent else None
            proponentes.append({"iniciativa": i["id"], "designacao": i["designacao"], "tipo": tp, "governo": gov["numero"] if gov else None,
                                "entrada": ent, "grupos": gs, "sem_grupo": sem if not gs else [],
                                "nome": au.get("nome") if tp in ("regiao", "mesa") else None,
                                "resultado_generalidade": (i.get("generalidade") or {}).get("resultado")})
        proponentes.sort(key=lambda x: (x["entrada"] or "", x["designacao"]))
        tcs = [g for g in p.get("generalidade", []) if g["origem"] == "texto_comissao"]
        if tcs:
            v = p["texto_comissao"][tcs[0]["indice"]]
            idx = ctx.get("indice", {})
            inis = []
            for c in v.get("citadas_todas") or []:
                iid = idx.get((c["tipo"], c["numero"], c["legislatura"])) or idx.get((c["tipo"], c["numero"], "I" if c["legislatura"] in ("IA", "IB") else c["legislatura"]))
                inis.append({"iniciativa": iid, "designacao": f"{c['tipo']} n.º {c['numero']}/{c['legislatura']}", "parte": c.get("parte")})
            texto_comissao = {"tipo": "texto_substituicao" if re.match(r"\s*Texto de substitui", v.get("descricao") or "", re.I) else "texto_final",
                              "n_iniciativas": len(inis), "iniciativas": inis}
        if p.get("vfg"):
            vfg = {"data": p["vfg"]["data"], "unanime": p["vfg"]["unanime"], "resultado": p["vfg"]["resultado"]}
        else:
            motivos["vfg"] = (p.get("motivos") or {}).get("vfg") or "sem_registo_vfg"
        if (p.get("motivos") or {}).get("passos"):
            motivos["passos"] = p["motivos"]["passos"]
        if not p.get("generalidade"):
            motivos["generalidade"] = "sem_generalidade"
        mud = t.mudancas_presidente()
        for e in p.get("eventos", []):
            x = {"tipo": e["tipo"], "data": e["data"]}
            if e["tipo"] == "veto":
                linha = t.presidente(e["data"])
                longe = all(abs(dias(m, e["data"])) >= 15 for m in mud)
                x["presidente"] = linha["id"] if linha and longe else None
                x["acordao_tc"] = e.get("acordao_tc")
            eventos.append(x)
    elif tipo in LEIS:
        codigo = "sessao_em_falta" if (a.get("ar") or {}).get("diploma_id") else "sem_ar"
        motivos.update({"passagem": codigo, "vfg": codigo, "generalidade": codigo})
    # The period of the timeline.
    reap = [e["data"] for e in eventos if e["tipo"] in ("confirmacao", "novo_decreto")]
    if tipo == "decreto-lei" and d_cm:
        per = (d_cm, "d_cm")
    elif tipo in LEIS and reap:
        per = (reap[-1], "reapreciacao")
    elif tipo in LEIS and vfg:
        per = (vfg["data"], "vfg")
    else:
        per = (pub, "publicacao")
    fora = {"lei-constitucional": "revisoes", "acordao-tc": "acordaos", "acordao-outro": "acordaos", "pre1976": "antes_1976",
            "retificacao": "retificacao", "portaria": "outros", "resolucao": "outros", "dlr": "outros", "outro": "outros",
            "aprovacao-constituicao": "outros"}.get(tipo)
    if fora is None and per[0] and per[0] < REVOLUCAO:
        fora = "antes_1976"
    gper = t.governo(per[0])
    oe = None
    for txt in [a.get("sumario") or ""] + [i.get("titulo") or "" for i in (p or {}).get("iniciativas", [])]:
        m = _OE.search(txt)
        if m and tipo == "lei":
            oe = {"ano": int(m.group(1))}
            break
    entrada = sig if sig and not erro else None
    ar = a.get("ar") or {}
    return {
        "tipo_ato": tipo,
        "governo": governo,
        "governo_publicacao": gp["numero"] if gp else None,
        "d_cm": d_cm,
        "em_gestao": next(({"inicio": x["inicio"], "fim": x["fim"], "fonte": x["fonte"]} for g in t.g for x in g.get("em_gestao", [])
                           if d_cm and x["inicio"] <= d_cm and (x.get("fim") is None or d_cm < x["fim"])), None),
        "presidente": presidente,
        "legislatura": grupos.legislatura_em(per[0]) if grupos else None,
        "periodo": {"data": per[0], "base": per[1], "governo": gper["numero"] if gper else None,
                    "legislatura": grupos.legislatura_em(per[0]) if grupos else None, "fora": fora},
        "proponentes": proponentes, "texto_comissao": texto_comissao, "vfg": vfg, "eventos": eventos,
        "retifica": ctx.get("retifica", {}).get(aid), "retificado_por": sorted(ctx.get("retificado_por", {}).get(aid, [])),
        "tribunal": tribunal(aid, a, ctx.get("notas", {}).get(aid, []), entrada) if tipo in ("acordao-tc", "acordao-outro") else None,
        "pre1976": {"signatarios": (entrada or {}).get("signatarios_pre1976") or []} if tipo == "pre1976" else None,
        "oe": oe,
        "transitorias": (entrada or {}).get("transitorias") or [],
        "ar_url": f"https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID={ar['diploma_id']}" if ar.get("diploma_id") else None,
        "assinatura": assinatura,
        "motivos": motivos,
        "verificacao": verif,
    }


# ---- Timeline of one diploma (quem/<slug>.json) ---------------------------------------------------
def _lista(q: dict, aid: str, p: dict | None) -> tuple[str, dict]:
    """Which sub-list an act goes to, and its row (finding 12)."""
    linha = {"ato": aid}
    if q["tipo_ato"] == "decreto-lei":
        return ("decretos_leis" if q["governo"] else "publicados_sem_d_cm"), linha
    if p is None:
        linha["sem_passagem"] = True
    if q["texto_comissao"]:
        linha["texto_comissao"] = True
    todas = [x["tipo"] for x in q["proponentes"]]
    ids = {x["iniciativa"] for x in q["proponentes"]}
    extra = [x for x in (q["texto_comissao"] or {}).get("iniciativas", []) if x["iniciativa"] not in ids]
    so_governo = todas and all(t_ == "governo" for t_ in todas) and all(x["designacao"].startswith("Proposta de Lei") for x in extra)
    return ("propostas" if so_governo else "outras"), linha


def _vazio() -> dict:
    return {"decretos_leis": [], "propostas": [], "outras": [], "publicados_sem_d_cm": []}


def linha_tempo(d: dict, atos: dict, quem: dict, passagens: dict, notas: dict, t: Tabelas, grupos: Grupos | None, hoje: str) -> dict:
    """Every act that changed a diploma, by Government and by legislatura, empty periods included (R-50, R-51)."""
    slug = d["slug"]
    copia = d.get("copia")
    copiados = {n["artigo"] for n in d["arvore"][copia["inicio"]:] if n["tipo"] == "artigo"} if copia else set()
    ids = []
    for aid, a in atos.items():
        if aid == d.get("ato_original"):
            continue
        if any(c["diploma"] == slug and c["artigo"] not in copiados for c in a["alteracoes"]):
            ids.append(aid)
    acordaos = sorted({aid for aid, ns in notas.items() if any(n["diploma"] == slug and n["artigo"] not in copiados for n in ns)
                       and atos.get(aid, {}).get("tipo_ato") in ("acordao-tc", "acordao-outro")})
    desde = d.get("publicacao")
    g0 = t.governo(desde) or t.g[0]
    govs = [g for g in t.g if g["numero"] >= g0["numero"]]
    legs = [x for x in (grupos.legislaturas if grupos else []) if x["sigla"] != "Constituinte"]
    l0 = (grupos.legislatura_em(desde) if grupos else None)
    if l0 and l0 != "Constituinte":
        legs = legs[[x["sigla"] for x in legs].index(l0):]
    por_g = {g["numero"]: _vazio() for g in govs}
    por_l = {x["sigla"]: _vazio() for x in legs}
    fora = {"revisoes": [], "acordaos": [], "antes_1976": [], "retificacoes_soltas": [], "outros": []}
    retificacoes: dict[str, list] = {}
    chave = lambda aid: (quem[aid]["periodo"]["data"] or "", aid)  # noqa: E731
    for aid in sorted(ids, key=chave):
        q = quem[aid]
        f = q["periodo"]["fora"]
        if f == "retificacao":
            alvo = q.get("retifica")
            if alvo and alvo in ids:
                retificacoes.setdefault(alvo, []).append(aid)
            else:
                fora["retificacoes_soltas"].append({"ato": aid})
            continue
        if f in ("revisoes", "antes_1976", "outros"):
            fora[f].append({"ato": aid})
            continue
        if f == "acordaos":
            if aid not in acordaos:
                acordaos.append(aid)
            continue
        nome, linha = _lista(q, aid, passagens.get(aid))
        n = q["periodo"]["governo"]
        if n in por_g:
            por_g[n][nome].append(linha)
        else:
            fora["outros"].append({"ato": aid})
        leg = q["periodo"]["legislatura"]
        if leg in por_l:
            por_l[leg][nome].append(dict(linha))
    fora["acordaos"] = [{"ato": x} for x in sorted(acordaos, key=lambda x: (atos[x].get("publicacao") or "", x))]

    def total(ls):
        return sum(len(v) for v in ls.values())
    return {
        "slug": slug, "ato_original": d.get("ato_original"), "desde": desde,
        "por_governo": [{"governo": n, "total": total(ls), "listas": ls} for n, ls in por_g.items()],
        "por_legislatura": [{"legislatura": x["sigla"], "governos": [g["numero"] for g in t.g if g["inicio"] < (x["fim"] or "9999") and (g["fim"] or "9999") > x["inicio"]],
                             "total": total(por_l[x["sigla"]]), "listas": por_l[x["sigla"]]} for x in legs],
        "fora": fora,
        "retificacoes": retificacoes,
    }


# ---- Parliamentary groups (grupos/index.json, grupos/<id>.json) ----------------------------------
def _sentido(v: dict | None, sigla: str):
    if not v:
        return None
    if sigla in v.get("grupos", {}):
        return v["grupos"][sigla]
    if sigla in v.get("ausentes", []):
        return "ausente"
    if sigla in v.get("sem_registo", []):
        return "sem_registo"
    return None


def paginas_grupos(atos: dict, quem: dict, passagens: dict, grupos: Grupos, originais: dict | None = None) -> tuple[list, dict]:
    """One page per group that voted or proposed in passagem.json (R-54). Same fields for every group (R-65).

    `originais` ({act id: slug}): an act that created a diploma (Lei n.º 37/81) counts for that diploma."""
    originais = originais or {}
    paginas: dict[str, dict] = {}

    def pagina(gid):
        return paginas.setdefault(gid, {"iniciativas": [], "votos": {}})
    for aid, p in passagens.items():
        q = quem.get(aid) or {}
        juntadas = {x["iniciativa"]: x for x in (q.get("texto_comissao") or {}).get("iniciativas", []) if x.get("iniciativa")}
        n_ini = (q.get("texto_comissao") or {}).get("n_iniciativas") or len(p["iniciativas"])
        for prop in q.get("proponentes", []):
            for g in prop["grupos"]:
                pagina(g["id"])["iniciativas"].append({
                    "iniciativa": prop["iniciativa"], "designacao": prop["designacao"], "sigla": g["sigla"], "ato": aid,
                    "como": "juntada" if prop["iniciativa"] in juntadas else "propria", "n_iniciativas": n_ini,
                    "parte": (juntadas.get(prop["iniciativa"]) or {}).get("parte")})
        itens_votos = []
        for x in p.get("generalidade", []):
            if x["origem"] == "texto_comissao":
                v = p["texto_comissao"][x["indice"]]
                itens_votos.append(({"tipo": "texto_comissao", "id": x["indice"], "designacao": "Texto da comissão", "data": v["data"]}, v))
            else:
                ini = next(i for i in p["iniciativas"] if i["id"] == x["id"])
                itens_votos.append(({"tipo": "iniciativa", "id": ini["id"], "designacao": ini["designacao"], "data": ini["generalidade"]["data"]},
                                    ini["generalidade"]))
        if not itens_votos:
            continue
        siglas = {}
        for _, v in itens_votos:
            for s in list(v["grupos"]) + v.get("ausentes", []) + v.get("sem_registo", []):
                if grupos.e_grupo(s):
                    siglas.setdefault(grupos.id(s), (s, v.get("legislatura")))
        slugs = sorted({c["diploma"] for c in atos.get(aid, {}).get("alteracoes", [])} | set(originais.get(aid, [])))
        for gid, (s, leg) in siglas.items():
            pagina(gid)
            itens = [{**it, "sentido": _sentido(v, s)} for it, v in itens_votos]
            for slug in slugs:
                pagina(gid)["votos"].setdefault(slug, []).append({"ato": aid, "oe": bool(q.get("oe")), "sigla": s, "legislatura": leg, "itens": itens})
    todos = grupos.grupos()
    ordem = [x["sigla"] for x in grupos.legislaturas]
    idx, out = [], {}
    for gid, pg in paginas.items():
        g = todos.get(gid) or {"id": gid, "nomes": []}
        for rows in pg["votos"].values():
            rows.sort(key=lambda r: (atos.get(r["ato"], {}).get("publicacao") or "", r["ato"]))
        pg["iniciativas"].sort(key=lambda x: (atos.get(x["ato"], {}).get("publicacao") or "", x["designacao"]))
        out[gid] = {"id": gid, "nomes": g["nomes"], "iniciativas": pg["iniciativas"], "votos": pg["votos"]}
        legs = sorted({l for n in g["nomes"] for l in n["legislaturas"]}, key=lambda l: ordem.index(l) if l in ordem else 99)
        ultimo = max(g["nomes"], key=lambda n: max((ordem.index(l) for l in n["legislaturas"] if l in ordem), default=-1)) if g["nomes"] else {"nome": gid, "sigla": gid}
        idx.append({"id": gid, "nome": ultimo["nome"], "siglas": list(dict.fromkeys(n["sigla"] for n in g["nomes"])), "legislaturas": legs})
    idx.sort(key=lambda x: dobrar(x["nome"]))
    return idx, out


# ---- Everything -------------------------------------------------------------------------------
def assinaturas_juntas() -> dict[str, dict]:
    import assinaturas
    return assinaturas.juntar(assinaturas.ler(assinaturas.SEMENTE), assinaturas.ler(assinaturas.CACHE))


def entradas_de(iniciativas: dict) -> dict[str, str]:
    """{IniId: date of the "Entrada" event} from iniciativas.json."""
    out = {}
    for iid, i in iniciativas.items():
        ds = [d for d, f in i.get("eventos", []) if f == "Entrada"]
        out[iid] = min(ds) if ds else (i["eventos"][0][0] if i.get("eventos") else None)
    return out


def construir(out: str, atos: dict, passagens: dict, iniciativas: dict, ligacao: dict, notas: dict, retifica: dict,
              diplomas: list[dict], hoje: str, sig: dict | None = None, tabelas: Tabelas | None = None) -> dict:
    """Write quem.json, governos.json, quem/<slug>.json, grupos/; return the verificacao.json "quem" section."""
    import shutil
    t = tabelas or Tabelas()
    sig = assinaturas_juntas() if sig is None else sig
    grupos = ligacao.get("grupos")
    corrige = {r: max(c, key=c.get) for r, c in retifica.items() if c}
    for r, a in list(corrige.items()):  # also from the sumário: «Retifica a Lei n.º 31/2012»
        if a not in atos:
            del corrige[r]
    import atos as atos_mod
    for aid, a in atos.items():
        if a["tipo_ato"] == "retificacao" and aid not in corrige:
            m = re.search(r"Retifica (?:a|o) ((?:Lei(?: Orgânica| Constitucional)?|Decreto-Lei) n\.º\s*\S+?/\d{2,4})", a.get("sumario") or "")
            if m and atos_mod.slug(m.group(1)) in atos:
                corrige[aid] = atos_mod.slug(m.group(1))
    retificado_por: dict[str, list] = {}
    for r, alvo in corrige.items():
        retificado_por.setdefault(alvo, []).append(r)
    ctx = {"entradas": entradas_de(iniciativas), "indice": ligacao.get("indice", {}), "notas": notas, "iniciativas": iniciativas,
           "retifica": corrige, "retificado_por": retificado_por}
    quem = {aid: registo(aid, a, passagens.get(aid), sig.get(aid), t, grupos, ctx) for aid, a in atos.items()}
    escrever(os.path.join(out, "quem.json"), quem)
    for sub in ("quem", "grupos"):
        if os.path.isdir(os.path.join(out, sub)):
            shutil.rmtree(os.path.join(out, sub))
    originais: dict[str, list] = {}
    for d in diplomas:
        with open(os.path.join(out, "d", d["slug"] + ".json"), encoding="utf-8") as fh:
            dd = json.load(fh)
        originais.setdefault(dd.get("ato_original") or "", []).append(d["slug"])
        escrever(os.path.join(out, "quem", d["slug"] + ".json"), linha_tempo(dd, atos, quem, passagens, notas, t, grupos, hoje))
    if grupos is not None:
        idx, paginas = paginas_grupos(atos, quem, passagens, grupos, originais)
        escrever(os.path.join(out, "grupos", "index.json"), idx)
        for gid, pg in paginas.items():
            escrever(os.path.join(out, "grupos", gid + ".json"), pg)
    else:
        escrever(os.path.join(out, "grupos", "index.json"), [])
    chaves = ("numero", "romano", "inicio", "fim", "primeiro_ministro", "partidos", "nota_partidos", "em_gestao", "fontes")
    escrever(os.path.join(out, "governos.json"), {
        "governos": [{k: g.get(k) for k in chaves} for g in t.g],
        "presidentes": [{k: p.get(k) for k in ("id", "nome", "inicio", "fim", "fonte")} for p in t.p],
        "legislaturas": grupos.legislaturas if grupos else [],
        "grupos": grupos.grupos() if grupos else {},
        "siglas": grupos.siglas() if grupos else {}})
    return verificacao(atos, quem, passagens, sig)


def verificacao(atos: dict, quem: dict, passagens: dict, sig: dict) -> dict:
    """The "quem" section of verificacao.json (#/verificacao)."""
    dls = [a for a, q in quem.items() if q["tipo_ato"] == "decreto-lei" and q["motivos"].get("governo") != "antes_governo_constitucional"]
    leis = [a for a, q in quem.items() if q["tipo_ato"] in LEIS]
    falhas = [{"ato": a, "motivo": quem[a]["motivos"].get("d_cm")} for a in dls if not quem[a]["d_cm"]]
    falhas += [{"ato": a, "motivo": quem[a]["motivos"].get("presidente")} for a in leis if not quem[a]["presidente"]]
    cruz, mesmo = [], []
    for a, q in quem.items():
        for v in q["verificacao"]:
            if v["regra"] == "mesmo_pm":
                mesmo.append({"ato": a, "d_cm": q["d_cm"], "governos": v.get("governos", [])})
            elif v["estado"] != "ok" and v["regra"] != "cm_primeiro":
                cruz.append({"ato": a, "regra": v["regra"], "estado": v["estado"], "detalhe": v.get("detalhe", "")})
    votos = [{"ato": a, "fase": x["fase"], "data": x["data"], "motivo": x["motivo"]} for a, p in passagens.items()
             for x in p.get("descartados", []) if x["fase"].startswith(("Votação", "Confirmação"))]
    return {"assinaturas": {"total": sum(1 for a in atos.values() if a.get("link")), "com_d_cm": sum(1 for a in dls if quem[a]["d_cm"]),
                            "lidos": sum(1 for a in atos if a in sig and not sig[a].get("erro")), "falhas": falhas},
            "cruzamento": cruz, "mesmo_pm": mesmo,
            "passos_descartados": [{"ato": a, "motivo": q["motivos"]["passos"]} for a, q in quem.items() if q["motivos"].get("passos")],
            "votos_descartados": votos,
            "cobertura": {"dl_d_cm": round(sum(1 for a in dls if quem[a]["d_cm"]) / len(dls), 4) if dls else 0.0,
                          "leis_promulgacao": round(sum(1 for a in leis if quem[a]["presidente"]) / len(leis), 4) if leis else 0.0}}


def escrever(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
