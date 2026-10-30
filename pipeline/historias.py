"""Stories: from pipeline/historias/<slug>.json to app/data/historias/ (DESIGN-SPEC §2.13, §4).

A story source holds prose with typed references. The build resolves every reference against the
site's data, so dates, designations, votes, Governments and Presidents come from the data, never
from the prose. The prose lints (tools/estilo.py --historia) keep numbers, dates, siglas and vote
words out of the prose; they reach the reader only through references and quotations.

Reference syntax: {tipo:argumento} or {tipo:argumento|rótulo}; {{ and }} are literal braces.

    ato         <id>                                     designation (first mention with its date)
    redacao     <slug>/<artigo>@<ato>                    «artigo 6.º», link to that redação
    comparar    <slug>/<artigo>@<ato>[..<ato2>]          «o que mudou no artigo 6.º»
    iniciativa  <IniId>                                  designation
    voto        <ato>/generalidade                       the app renders every group's vote
    vfg         <ato>                                    the app renders the final vote line
    governo     <ato>                                    the app renders «o XV Governo Constitucional»
    presidente  <ato>                                    the app renders the President's name
    data        <ato>.publicacao|vigor|promulgacao|vfg|d_cm
    citacao     <slug>/<artigo>@<ato>#<n.º>[/<alínea>]   «quoted text» (n.º 0: an article without números)
    fonte       <https URL>@<AAAA-MM-DD>, rótulo «quoted text»

    python -I pipeline/historias.py                     # check every story against app/data
    python -I pipeline/historias.py --atualizar SLUG    # after checking SLUG by hand: hashes, preparado_em
"""
from __future__ import annotations

import datetime
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import estilo  # noqa: E402

FONTES = os.path.join(HERE, "historias")
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
         "novembro", "dezembro"]
AVISO = ("Texto preparado a partir dos dados do site, com ajuda de uma ferramenta automática. Data: {data}. "
         "Ainda sem revisão jurídica externa.")
TITULOS = {"resumo": "Em cinco frases", "perguntas": "Nesta história", "numeros": "Em números", "hoje": "Hoje",
           "todas": "Todas as alterações neste período", "limites": "O que esta história não diz",
           "metodo": "Como fizemos esta história"}
TIPOS_SECCAO = {"resumo", "perguntas", "mudanca", "hoje", "limites", "metodo"}
COM_REFS = {"resumo", "mudanca", "hoje"}  # check 3: every sentence needs a reference
VERBOS_ATO = {"mudou": "alterado", "mudaram": "alterado", "acrescentou": "aditado", "acrescentaram": "aditado",
              "revogou": "revogado", "revogaram": "revogado", "retificou": "retificado", "retificaram": "retificado",
              "renumerou": "renumerado", "renumeraram": "renumerado"}
VERBOS_PROIBIDOS = ("alterou", "alteraram", "aditou", "aditaram", "modificou", "modificaram", "introduziu",
                    "introduziram", "eliminou", "eliminaram", "suprimiu", "suprimiram", "substituiu", "substituíram",
                    "reescreveu", "corrigiu", "corrigiram", "criou", "criaram", "retirou", "retiraram")
REFS_ARTIGO = ("redacao", "comparar", "citacao")
REF = re.compile(r"(?<!\{)\{(?!\{)([a-z]+):([^{}|]*)(?:\|([^{}]*))?\}(?!\})")
VENDOR = re.compile(estilo.FORNECEDORES, re.I)
HOSTS_FONTE = ("diariodarepublica.pt", "data.dre.pt", "dre.pt", "www.parlamento.pt", "parlamento.pt",
               "app.parlamento.pt", "www.tribunalconstitucional.pt")


def hoje() -> str:
    return os.environ.get("REDACAO_HOJE") or datetime.date.today().isoformat()


def data_extenso(d: str | None, ano: bool = True) -> str:
    if not d:
        return "data desconhecida"
    a, m, dia = d[:10].split("-")
    return f"{int(dia)} de {MESES[int(m) - 1]}" + (f" de {a}" if ano else "")


def data_curta(d: str) -> str:
    a, m, dia = d[:10].split("-")
    return f"{dia}/{m}/{a}"


def hash_texto(t: str) -> str:
    return "sha256:" + hashlib.sha256(t.encode("utf-8")).hexdigest()


def texto_versao(v: dict) -> str:
    return "\n".join("".join(seg for _, seg in linha) for linha in v.get("linhas") or [])


def num_artigo(a: str) -> tuple:
    m = re.match(r"artigo-(\d+)(?:-([a-z]+))?$", a)
    return (int(m.group(1)), m.group(2) or "") if m else (10 ** 9, a)


class Erro(Exception):
    """A reference that does not resolve. `falta` names the missing A file, if that is the cause."""

    def __init__(self, msg: str, falta: str | None = None):
        super().__init__(msg)
        self.falta = falta


# ---------------------------------------------------------------------------------------------
# Data access


class Dados:
    def __init__(self, out: str):
        self.out = out
        self._art: dict[str, dict | None] = {}
        self._dip: dict[str, dict | None] = {}
        self.faltam: set[str] = set()
        self.atos = self._ler("atos.json", {})
        index = self._ler("index.json", {})
        self.aliases = index.get("aliases_atos") or {}
        self.diplomas_index = {d["slug"]: d for d in index.get("diplomas", [])}
        self.passagem = self._ler("passagem.json", {})
        self.iniciativas = self._ler("iniciativas.json", {})
        self.pendentes = self._ler("pendentes.json", {})
        self.quem = self._ler("quem.json", None)
        gov = self._ler("governos.json", None) or {}
        self.siglas = {n.get("sigla") for g in (gov.get("grupos") or {}).values() for n in g.get("nomes", [])} - {None}
        self.faltam.discard("governos.json")

    def _ler(self, nome: str, vazio):
        p = os.path.join(self.out, nome)
        if not os.path.exists(p):
            self.faltam.add(nome)
            return vazio
        with open(p, encoding="utf-8") as f:
            return json.load(f)

    def ato(self, aid: str) -> tuple[str, dict]:
        aid = self.aliases.get(aid, aid)
        if aid not in self.atos:
            raise Erro(f"ato desconhecido «{aid}»")
        return aid, self.atos[aid]

    def diploma(self, slug: str) -> dict | None:
        if slug not in self._dip:
            p = os.path.join(self.out, "d", slug + ".json")
            self._dip[slug] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
        return self._dip[slug]

    def artigo(self, slug: str, artigo: str) -> dict | None:
        k = f"{slug}/{artigo}"
        if k not in self._art:
            p = os.path.join(self.out, "d", slug, artigo + ".json")
            self._art[k] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
        return self._art[k]

    def artigos_de(self, slug: str) -> list[str]:
        d = self.diploma(slug)
        if d is None:
            return []
        return [n["artigo"] for n in d.get("arvore", []) if n.get("tipo") == "artigo" and n.get("artigo")]

    def inicio_copia(self, slug: str) -> int | None:
        """Index in `arvore` where the copy of another diploma starts (the NRAU annex, R-7)."""
        d = self.diploma(slug)
        if not d:
            return None
        if "copia" in d:  # A's build states it (R-7); null: no copy
            return (d["copia"] or {}).get("inicio")
        for i, n in enumerate(d.get("arvore", [])):  # older builds: the NRAU's «Anexo»
            if n.get("tipo") != "artigo" and (n.get("rotulo") or "").strip().lower() == "anexo":
                return i
        return None

    def e_copia(self, slug: str, artigo: str) -> bool:
        a = self.artigo(slug, artigo)
        if a and a.get("copia_de"):
            return True
        i = self.inicio_copia(slug)
        if i is None:
            return False
        d = self.diploma(slug)
        return artigo in [n.get("artigo") for n in d["arvore"][i:] if n.get("tipo") == "artigo"]

    def tipo_ato(self, aid: str) -> str:
        q = (self.quem or {}).get(aid) or {}
        if q.get("tipo_ato"):
            return q["tipo_ato"]
        a = self.atos.get(aid, {})
        if a.get("tipo_ato"):
            return a["tipo_ato"]
        d = re.sub(r"^[IVXLC]+,\s*", "", a.get("designacao", ""))
        for pref, t in (("Lei Orgânica", "lei-organica"), ("Lei Constitucional", "lei-constitucional"),
                        ("Lei n", "lei"), ("Decreto-Lei", "decreto-lei"), ("Declaração de Retificação", "retificacao"),
                        ("Rectificação", "retificacao"), ("Retificação", "retificacao"),
                        ("Acórdão do Tribunal Constitucional", "acordao-tc"), ("Acórdão", "acordao-outro")):
            if d.startswith(pref):
                return t
        return "outro"

    def generalidade(self, aid: str) -> list:
        p = self.passagem.get(aid)
        if not p:
            return []
        if isinstance(p.get("generalidade"), list):
            return p["generalidade"]
        itens = [{"origem": "texto_comissao", "indice": i} for i, t in enumerate(p.get("texto_comissao") or [])
                 if "general" in (t.get("fase") or "").lower()]
        if not itens:
            itens = [{"origem": "iniciativa", "id": i["id"]} for i in p.get("iniciativas", []) if i.get("generalidade")]
        return itens

    def iniciativas_do_ato(self, aid: str) -> set[str]:
        p = self.passagem.get(aid) or {}
        ids = {i["id"] for i in p.get("iniciativas", [])}
        q = (self.quem or {}).get(aid) or {}
        for i in (q.get("texto_comissao") or {}).get("iniciativas", []):
            if i.get("iniciativa"):
                ids.add(str(i["iniciativa"]))
        for i in self.atos.get(aid, {}).get("iniciativas", []):
            ids.add(str(i["id"]))
        return ids


def versoes_do_ato(art: dict, aid: str) -> list[int]:
    return [i for i, v in enumerate(art.get("versoes", [])) if v.get("ato") == aid]


def numeros_de(texto: str) -> list[tuple[str, str]]:
    """Split an article's text into its números: [(n, text)]. A text without números is [('0', text)]."""
    blocos: list[list] = []
    for linha in texto.split("\n"):
        m = re.match(r"^(\d+(?:\.º)?(?:-[A-Z])?)\s*(?:—|-|\.)\s", linha)
        if m:
            blocos.append([m.group(1).replace(".º", ""), [linha]])
        elif blocos:
            blocos[-1][1].append(linha)
        else:
            blocos.append(["0", [linha]])
    return [(n, "\n".join(ls)) for n, ls in blocos]


def cortar(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= n:
        return s
    corte = s[: n - 1]
    corte = corte[: corte.rfind(" ")] if " " in corte else corte
    return corte.rstrip(" ,;:") + "…"


# ---------------------------------------------------------------------------------------------
# A compiler for one story


class Historia:
    def __init__(self, src: dict, dados: Dados, parcial: bool = False):
        self.src = src
        self.d = dados
        self.parcial = parcial
        self.slug = src.get("slug")
        amb = src.get("ambito") or {}
        self.desde = amb.get("desde") or "0000-00-00"
        self.diplomas = amb.get("diplomas") or []
        self.primeiro = self.diplomas[0]["slug"] if self.diplomas else None
        self.mencionados: set[str] = set()
        self.erros: list[tuple[str | None, str]] = []      # (section id or None, message): E
        self.avisos: list[str] = []                         # W
        self.citados: dict[str, set[str]] = {}              # "slug/artigo" -> section ids
        self.hashes_atuais: dict[str, str] = {}

    # --- scope -----------------------------------------------------------------------------
    def artigos_ambito(self) -> list[tuple[str, str]]:
        out = []
        for dip in self.diplomas:
            slug = dip["slug"]
            arts = self.d.artigos_de(slug)
            if dip.get("artigos") == "proprios":
                i = self.d.inicio_copia(slug)
                d = self.d.diploma(slug)
                if i is not None and d:
                    arts = [n["artigo"] for n in d["arvore"][:i] if n.get("tipo") == "artigo" and n.get("artigo")]
            if dip.get("de") or dip.get("ate"):
                lo = num_artigo(dip.get("de", "artigo-0"))
                hi = num_artigo(dip.get("ate", "artigo-999999"))
                arts = [a for a in arts if lo[0] <= num_artigo(a)[0] <= hi[0]]
            out.extend((slug, a) for a in arts)
        return out

    def atos_ambito(self) -> list[str]:
        """Check 9: every act that changed a scope article from `desde`, plus acts named by notas."""
        ids: set[str] = set()
        for slug, a in self.artigos_ambito():
            art = self.d.artigo(slug, a)
            if not art:
                continue
            for v in art.get("versoes", []):
                if v.get("tipo") in ("original", "sem_alteracao"):
                    continue
                if (v.get("vigor") or v.get("publicacao") or "") >= self.desde:
                    ids.add(v["ato"])
            for n in art.get("notas", []):
                if n.get("ato") and (self.d.atos.get(self.d.aliases.get(n["ato"], n["ato"]), {}).get("publicacao") or "") >= self.desde:
                    ids.add(self.d.aliases.get(n["ato"], n["ato"]))
        return sorted(ids, key=lambda x: (self.d.atos.get(x, {}).get("publicacao") or "", x))

    def em_ambito(self, slug: str, artigo: str) -> bool:
        return (slug, artigo) in set(self.artigos_ambito())

    # --- references --------------------------------------------------------------------------
    def _redacao(self, arg: str) -> tuple[str, str, str, dict, int]:
        m = re.fullmatch(r"([a-z0-9-]+)/(artigo-[a-z0-9-]+)@([a-z0-9-]+)", arg)
        if not m:
            raise Erro(f"referência mal escrita «{arg}» (use slug/artigo@ato)")
        slug, artigo, aid = m.groups()
        aid = self.d.aliases.get(aid, aid)
        if self.d.e_copia(slug, artigo):
            raise Erro(f"«{slug}/{artigo}» é a cópia anexa a outro diploma; cite o diploma de origem (R-7)")
        art = self.d.artigo(slug, artigo)
        if art is None:
            raise Erro(f"artigo desconhecido «{slug}/{artigo}»")
        idx = versoes_do_ato(art, aid)
        if not idx:
            raise Erro(f"«{slug}/{artigo}» não tem uma redação de «{aid}»")
        i = idx[-1]
        chave = f"{slug}/{artigo}@{aid}"
        self.hashes_atuais[chave] = hash_texto(texto_versao(art["versoes"][i]))
        return slug, artigo, aid, art, i

    def _rotulo_artigo(self, slug: str, art: dict) -> str:
        r = art.get("rotulo", art.get("id", "")).replace("Artigo", "artigo", 1)
        if slug != self.primeiro:
            dip = self.d.diploma(slug) or {}
            gen = dip.get("genitivo") or ("de " + dip.get("titulo", slug))
            r += " " + gen
        return r

    def _citar(self, sec: str, chave: str):
        self.citados.setdefault(chave, set()).add(sec)

    def resolver(self, tipo: str, arg: str, rot: str | None, sec: str) -> dict:
        d = self.d
        if tipo == "ato":
            aid, a = d.ato(arg)
            if rot:
                texto = rot
            elif aid in self.mencionados:
                texto = a["designacao"]
            else:
                texto = f"{a['designacao']}, de {data_extenso(a['publicacao'], ano=False)}"
            self.mencionados.add(aid)
            return {"t": "ato", "id": aid, "texto": texto, "href": f"#/ato/{aid}"}
        if tipo in ("redacao", "comparar"):
            base, _, ate = arg.partition("..")
            slug, artigo, aid, art, i = self._redacao(base)
            self._citar(sec, f"{slug}/{artigo}")
            href = f"#/d/{slug}/{artigo}?redacao={aid}"
            if tipo == "redacao":
                return {"t": "redacao", "texto": rot or self._rotulo_artigo(slug, art), "href": href,
                        "diploma": slug, "artigo": artigo, "ato": aid}
            if ate:
                ate = d.aliases.get(ate, ate)
                if not versoes_do_ato(art, ate):
                    raise Erro(f"«{slug}/{artigo}» não tem uma redação de «{ate}»")
                self._redacao(f"{slug}/{artigo}@{ate}")
                href = f"#/d/{slug}/{artigo}?redacao={aid}&ver=mudou&com={ate}"
            else:
                href += "&ver=mudou"
            return {"t": "comparar", "texto": rot or "o que mudou no " + self._rotulo_artigo(slug, art), "href": href,
                    "diploma": slug, "artigo": artigo, "ato": aid}
        if tipo == "citacao":
            base, _, pos = arg.partition("#")
            slug, artigo, aid, art, i = self._redacao(base)
            self._citar(sec, f"{slug}/{artigo}")
            n, _, alinea = pos.partition("/")
            blocos = dict(numeros_de(texto_versao(art["versoes"][i])))
            if n not in blocos:
                raise Erro(f"«{slug}/{artigo}@{aid}» não tem o n.º {n}")
            texto = blocos[n]
            if alinea:
                ls = [x for x in texto.split("\n") if re.match(rf"^{re.escape(alinea)}\)\s", x)]
                if not ls:
                    raise Erro(f"«{slug}/{artigo}@{aid}» n.º {n} não tem a alínea {alinea})")
                texto = ls[0]
            return {"t": "citacao", "texto": cortar(texto, 300), "href": f"#/d/{slug}/{artigo}?redacao={aid}",
                    "diploma": slug, "artigo": artigo, "ato": aid}
        if tipo == "iniciativa":
            ini = d.iniciativas.get(arg)
            if ini:
                des = ini.get("designacao") or f"{ini['tipo']} n.º {ini['numero']}/{ini['legislatura']}"
            else:
                pen = (d.pendentes.get("iniciativas") or {}).get(arg)
                if not pen:
                    for p in d.passagem.values():
                        for x in p.get("iniciativas", []):
                            if x["id"] == arg:
                                pen = x
                if not pen:
                    raise Erro(f"iniciativa desconhecida «{arg}»")
                des = pen["designacao"]
            return {"t": "iniciativa", "id": arg, "texto": rot or des, "href": f"#/iniciativa/{arg}"}
        if tipo == "voto":
            aid, fase = arg.partition("/")[::2]
            aid, _ = d.ato(aid)
            if fase != "generalidade":
                raise Erro(f"«voto:{arg}»: só «<ato>/generalidade»")
            if not d.generalidade(aid):
                raise Erro(f"«{aid}» não tem votação na generalidade")
            return {"t": "voto", "ato": aid, "href": f"#/ato/{aid}?ir=generalidade"}
        if tipo == "vfg":
            aid, _ = d.ato(arg)
            if aid not in d.passagem:
                raise Erro(f"«{aid}» não tem dados da passagem no Parlamento")
            return {"t": "vfg", "ato": aid, "href": f"#/ato/{aid}"}
        if tipo in ("governo", "presidente"):
            aid, _ = d.ato(arg)
            if d.quem is None:
                raise Erro(f"«{tipo}:{aid}»: falta quem.json", falta="quem.json")
            q = d.quem.get(aid) or {}
            if tipo == "presidente":
                if not q.get("presidente"):
                    raise Erro(f"«{aid}» não tem Presidente da República nos dados")
                return {"t": "presidente", "ato": aid, "href": f"#/ato/{aid}"}
            n = (q.get("governo") or {}).get("numero")
            if n is None:
                ns = [p.get("governo") for p in q.get("proponentes", []) if p.get("tipo") == "governo" and p.get("governo")]
                n = ns[0] if ns else None
            if n is None:
                raise Erro(f"«{aid}» não tem Governo nos dados")
            slug = next((x["diploma"] for x in d.atos[aid].get("alteracoes", []) if any(x["diploma"] == y["slug"] for y in self.diplomas)), self.primeiro)
            return {"t": "governo", "ato": aid, "href": f"#/quem/{slug}?ir=governo-{n}"}
        if tipo == "data":
            aid, _, campo = arg.rpartition(".")
            aid, a = d.ato(aid)
            valor = None
            if campo == "publicacao":
                valor = a.get("publicacao")
            elif campo == "vigor":
                vs = {x.get("vigor") for x in a.get("alteracoes", []) if x.get("vigor")}
                if len(vs) > 1:
                    raise Erro(f"«{aid}» tem várias datas de entrada em vigor")
                valor = vs.pop() if vs else None
            elif campo in ("promulgacao", "vfg", "d_cm"):
                q = (d.quem or {}).get(aid) or {}
                p = d.passagem.get(aid) or {}
                passos = {s["passo"]: s["data"] for s in p.get("passos", [])}
                if campo == "promulgacao":
                    valor = (q.get("presidente") or {}).get("d_promulgacao") or passos.get("promulgacao")
                elif campo == "vfg":
                    valor = (p.get("vfg") or {}).get("data") if isinstance(p.get("vfg"), dict) else None
                    valor = valor or (q.get("vfg") or {}).get("data") or passos.get("votacao-final")
                else:
                    if d.quem is None:
                        raise Erro(f"«data:{arg}»: falta quem.json", falta="quem.json")
                    valor = q.get("d_cm")
            else:
                raise Erro(f"campo de data desconhecido «{campo}»")
            if not valor:
                raise Erro(f"«{aid}» não tem a data «{campo}»")
            return {"t": "data", "texto": data_extenso(valor), "href": f"#/ato/{aid}", "ato": aid, "campo": campo}
        if tipo == "fonte":
            url, _, dia = arg.rpartition("@")
            if not url.startswith("https://"):
                raise Erro(f"fonte sem https: «{url}»")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dia or ""):
                raise Erro(f"fonte sem data de consulta: «{arg}»")
            host = re.match(r"https://([^/]+)", url).group(1)
            if host not in HOSTS_FONTE:
                raise Erro(f"fonte fora das fontes primárias: «{host}»")
            if not rot or not re.fullmatch(r"«[^«»]+»", rot.strip()):
                raise Erro("o rótulo de uma fonte é uma só citação «…»")
            m = re.search(r"[?&]BID=(\d+)", url)
            if m and m.group(1) in d.iniciativas:
                titulo = d.iniciativas[m.group(1)].get("titulo") or ""
                if rot.strip()[1:-1] not in titulo:
                    raise Erro(f"a citação não está no título da iniciativa {m.group(1)}")
            return {"t": "fonte", "texto": f"{rot.strip()} ({host}, {data_extenso(dia)})", "href": url}
        raise Erro(f"tipo de referência desconhecido «{tipo}»")

    # --- prose ---------------------------------------------------------------------------------
    def compilar_paragrafo(self, texto: str, sec: str) -> tuple[list, list[dict]]:
        segs, refs, pos = [], [], 0
        for m in REF.finditer(texto):
            if m.start() > pos:
                segs.append(texto[pos:m.start()].replace("{{", "{").replace("}}", "}"))
            tipo, arg, rot = m.group(1), m.group(2), m.group(3)
            if rot and tipo != "fonte" and re.search(r"[«»]", rot):
                raise Erro(f"rótulo com aspas em «{m.group(0)}»: só uma fonte cita")
            try:
                r = self.resolver(tipo, arg, rot, sec)
            except Erro as e:
                if not (e.falta and self.parcial):
                    raise
                # --parcial: A's file is not there yet. Keep the reference for the app, unchecked.
                self.avisos.append(f"{self.slug}/{sec}: {e} (parcial)")
                aid = re.split(r"[./]", arg)[0] if tipo == "data" else arg
                r = {"t": tipo, "ato": aid, "href": f"#/ato/{aid}"}
                if tipo == "data":
                    r["texto"] = "(data por confirmar)"
            refs.append({"tipo": tipo, "arg": arg, "rot": rot, "seg": r})
            segs.append(r)
            pos = m.end()
        if pos < len(texto):
            segs.append(texto[pos:].replace("{{", "{").replace("}}", "}"))
        return segs, refs

    @staticmethod
    def prosa(texto: str) -> str:
        """Prose for the lints: a reference becomes its rótulo, or X."""
        def rep(m):
            if m.group(1) == "fonte":
                return m.group(3) or "X"
            return m.group(3) or "X"
        return REF.sub(rep, texto).replace("{{", "{").replace("}}", "}")

    @staticmethod
    def frases(texto: str) -> list[str]:
        """Sentences of a raw paragraph, with references kept whole."""
        marc = []

        def guardar(m):
            marc.append(m.group(0))
            return f"⁣{len(marc) - 1}⁣"
        t = REF.sub(guardar, texto)
        t = re.sub(r"«[^»]*»", lambda m: m.group(0).replace(".", "․").replace("?", "⁇"), t)
        partes = re.split(r"(?<=[.?!])\s+(?=[A-ZÀ-Ú«⁣])", t)
        out = []
        for p in partes:
            p = p.replace("․", ".").replace("⁇", "?")
            p = re.sub("⁣(\\d+)⁣", lambda m: marc[int(m.group(1))], p)
            if p.strip():
                out.append(p.strip())
        return out

    def lint_paragrafo(self, texto: str, tipo_sec: str, sec: str) -> list[str]:
        erros = []
        prosa = self.prosa(texto)
        if re.search(r"[«»]", REF.sub(" ", texto)):
            erros.append("[2] citação fora de uma referência: cite com {citacao:…} ou {fonte:…}")
        for _, regra, msg in estilo.check_historia(prosa):
            erros.append(f"[{regra}] {msg}")
        sem_citacoes = re.sub(r"«[^»]*»", " ", prosa)
        for sg in sorted(self.d.siglas - set(estilo.SIGLAS)):
            if re.search(rf"(?<![\w/-]){re.escape(sg)}(?![\w/-])", sem_citacoes):
                erros.append(f"[H2] sigla de grupo «{sg}» fora de uma referência")
        for nivel, regra, msg in estilo.check(prosa):
            if nivel == "erro":
                erros.append(f"estilo [{regra}] {msg}")
        for f in self.frases(texto):
            refs = list(REF.finditer(f))
            if tipo_sec in COM_REFS and not refs:
                erros.append(f"[3] frase sem referência: «{cortar(f, 80)}»")
            low = self.prosa(f).lower()
            m = re.search(r"(?<![\wÀ-ú])(" + "|".join(VERBOS_PROIBIDOS) + r")(?![\wÀ-ú])", low)
            if m:
                erros.append(f"[14] verbo «{m.group(1)}»: use mudou, acrescentou, revogou, retificou ou renumerou")
            verbos = {v for v in VERBOS_ATO if re.search(rf"(?<![\wÀ-ú]){v}(?![\wÀ-ú])", low)}
            if verbos:
                arts = [r for r in refs if r.group(1) in REFS_ARTIGO]
                if not arts:
                    erros.append(f"[14] «{sorted(verbos)[0]}» sem referência a uma redação na mesma frase: «{cortar(f, 80)}»")
                tipos_ok = {VERBOS_ATO[v] for v in verbos}
                for r in arts:
                    base = r.group(2).partition("#")[0].partition("..")[0]
                    try:
                        _, _, _, art, i = self._redacao(base)
                    except Erro:
                        continue
                    t = art["versoes"][i].get("tipo")
                    if t not in tipos_ok:
                        erros.append(f"[14] «{'/'.join(sorted(verbos))}» com «{base}», que é «{t}»")
        return erros

    # --- sections ------------------------------------------------------------------------------
    def compilar(self) -> dict | None:
        src, d = self.src, self.d
        story_err: list[str] = []
        if not src.get("preparado_em"):
            story_err.append("[12] falta preparado_em")
        if VENDOR.search(json.dumps(src, ensure_ascii=False)):
            story_err.append(f"[6] nome de modelo ou de fornecedor: «{VENDOR.search(json.dumps(src, ensure_ascii=False)).group(0)}»")
        for k in ("slug", "titulo", "resumo"):
            if not src.get(k):
                story_err.append(f"falta «{k}»")
        for _, regra, msg in estilo.check_historia(src.get("resumo", "")):
            story_err.append(f"título ou resumo [{regra}] {msg}")
        for nivel, regra, msg in estilo.check(src.get("titulo", "") + ". " + src.get("resumo", "")):
            if nivel == "erro":
                story_err.append(f"resumo: estilo [{regra}] {msg}")
        seccoes_src = src.get("seccoes") or []
        ids = [s.get("id") for s in seccoes_src]
        if len(ids) != len(set(ids)):
            story_err.append("ids de secção repetidos")
        escopo = self.atos_ambito()
        escopo_set = set(escopo)
        notas_atos = set()
        for slug, a in self.artigos_ambito():
            for n in (d.artigo(slug, a) or {}).get("notas", []):
                if n.get("ato"):
                    notas_atos.add(d.aliases.get(n["ato"], n["ato"]))
        guardados = src.get("hashes") or {}
        preparado = src.get("preparado_em") or "0000-00-00"

        out_secs, sec_err = [], {}
        palavras_total = 0
        for s in seccoes_src:
            sid, tipo = s.get("id"), s.get("tipo")
            errs: list[str] = []
            if tipo not in TIPOS_SECCAO:
                story_err.append(f"secção «{sid}»: tipo desconhecido «{tipo}»")
                continue
            c = {"id": sid, "tipo": tipo}
            if tipo != "mudanca":
                c["titulo"] = TITULOS[tipo]
            before = dict(self.hashes_atuais)
            self.hashes_atuais = {}
            paragrafos = []
            palavras = 0
            for p in s.get("paragrafos", []):
                try:
                    segs, _ = self.compilar_paragrafo(p, sid)
                    paragrafos.append(segs)
                except Erro as e:
                    (self.avisos.append(f"{self.slug}/{sid}: {e} (parcial)") if (e.falta and self.parcial)
                     else errs.append(f"[1] {e}"))
                    paragrafos.append([self.prosa(p)])
                    continue
                errs.extend(self.lint_paragrafo(p, tipo, sid))
                palavras += estilo.word_count(self.prosa(p))
            if tipo == "perguntas":
                itens = []
                for it in s.get("itens", []):
                    if it.get("alvo") not in ids + ["em-numeros", "todas"]:
                        errs.append(f"[7] pergunta sem secção: alvo «{it.get('alvo')}»")
                    for _, regra, msg in estilo.check_historia(it.get("texto", "")):
                        errs.append(f"pergunta [{regra}] {msg}")
                    for nivel, regra, msg in estilo.check(it.get("texto", "")):
                        if nivel == "erro":
                            errs.append(f"pergunta: estilo [{regra}] {msg}")
                    itens.append({"texto": it.get("texto"), "alvo": it.get("alvo")})
                c["itens"] = itens
            if tipo == "mudanca":
                atos = []
                for a in s.get("atos", []):
                    try:
                        aid, _ = d.ato(a)
                    except Erro as e:
                        errs.append(f"[1] {e}")
                        continue
                    originais = {(d.diploma(x["slug"]) or {}).get("ato_original") for x in self.diplomas}
                    if aid not in escopo_set and aid not in notas_atos and aid not in originais:
                        errs.append(f"[7] «{aid}» não mudou nenhum artigo desta história")
                    atos.append(aid)
                c["atos"] = atos
                c["titulo"] = juntar([f"{d.atos[a]['designacao']}, de {data_extenso(d.atos[a]['publicacao'], ano=False)}" for a in atos])
                c["subtitulo"] = s.get("subtitulo")
                mostrar = []
                for m in s.get("mostrar", []):
                    try:
                        mostrar.append(self.mostrar(m, sid))
                    except Erro as e:
                        errs.append(f"[1] mostrar: {e}")
                c["mostrar"] = mostrar
                c["tabela"] = None
                if s.get("tabela"):
                    try:
                        c["tabela"] = self.tabela(s["tabela"], sid)
                    except Erro as e:
                        errs.append(f"[1] tabela: {e}")
                fontes_ini = set(s.get("fontes_iniciativas") or [])
                tem_fonte = any(m.group(1) == "fonte" for p in s.get("paragrafos", []) for m in REF.finditer(p))
                if tem_fonte or fontes_ini:
                    todas = set().union(*(d.iniciativas_do_ato(a) for a in atos)) if atos else set()
                    if todas - fontes_ini and (fontes_ini or any("parlamento.pt" in m.group(2)
                                                                for p in s.get("paragrafos", []) for m in REF.finditer(p) if m.group(1) == "fonte")):
                        errs.append(f"[15] a secção cita uma iniciativa e não cita: {', '.join(sorted(todas - fontes_ini))}")
                if palavras > 120:
                    self.avisos.append(f"{self.slug}/{sid}: [11] {palavras} palavras (máx. 120)")
            if tipo == "hoje":
                arts = []
                for k in s.get("artigos", []):
                    slug, _, artigo = k.partition("/")
                    art = d.artigo(slug, artigo)
                    if art is None or d.e_copia(slug, artigo):
                        errs.append(f"[1] artigo desconhecido ou cópia: «{k}»")
                        continue
                    self._citar(sid, k)
                    arts.append({"diploma": slug, "artigo": artigo, "rotulo": art.get("rotulo"),
                                 "href": f"#/d/{slug}/{artigo}"})
                c["artigos"] = arts
                pend = []
                pen_all = d.pendentes.get("iniciativas") or {}
                por_dip = d.pendentes.get("por_diploma") or {}
                for pid in s.get("pendentes", []):
                    if pid not in pen_all:
                        self.avisos.append(f"{self.slug}/{sid}: a iniciativa pendente {pid} já não está em pendentes.json")
                        continue
                    if not any(pid in por_dip.get(x["slug"], []) for x in self.diplomas):
                        errs.append(f"[1] a iniciativa pendente {pid} não altera os diplomas desta história")
                    pend.append(pid)
                c["pendentes"] = pend
            if tipo == "metodo":
                c["correcoes"] = s.get("correcoes") or []
            c["paragrafos"] = paragrafos
            palavras_total += palavras
            if tipo == "mudanca":
                atuais = dict(self.hashes_atuais)
                c["hashes"] = atuais
                desat = False
                for k, h in atuais.items():
                    if k not in guardados:
                        self.avisos.append(f"{self.slug}/{sid}: [10] sem hash guardado para {k} (corra --atualizar)")
                    elif guardados[k] != h:
                        desat = True
                        self.avisos.append(f"{self.slug}/{sid}: [10] {k} mudou depois de {preparado}")
                for k in {x.rpartition("@")[0] for x in atuais}:
                    slug, _, artigo = k.partition("/")
                    art = d.artigo(slug, artigo) or {}
                    if any((v.get("publicacao") or "") > preparado for v in art.get("versoes", [])):
                        desat = True
                        self.avisos.append(f"{self.slug}/{sid}: [10] {k} tem uma redação publicada depois de {preparado}")
                c["desatualizada"] = desat
                c["retida"] = None
            self.hashes_atuais = {**before, **self.hashes_atuais}
            if errs:
                sec_err[sid] = errs
            out_secs.append(c)

        if not (400 <= palavras_total <= 800):
            self.avisos.append(f"{self.slug}: [11] {palavras_total} palavras de prosa (400 a 800)")
        self.palavras = palavras_total

        # Generated sections: «Em números» after «Nesta história», «Todas» after «Hoje».
        numeros = self.em_numeros(escopo)
        todas = {"id": "todas", "tipo": "todas", "titulo": TITULOS["todas"], "atos": escopo}
        final = []
        for c in out_secs:
            final.append(c)
            if c["tipo"] == "perguntas":
                final.append(numeros)
            if c["tipo"] == "hoje":
                final.append(todas)
        if numeros not in final:
            final.insert(1, numeros)
        if todas not in final:
            final.append(todas)

        for sid, errs in sec_err.items():
            for e in errs:
                self.erros.append((sid, e))
        for e in story_err:
            self.erros.append((None, e))
        mudanca_falhas = [sid for sid in sec_err if next((c for c in out_secs if c["id"] == sid), {}).get("tipo") == "mudanca"]
        self.retida_inteira = bool(story_err) or len(sec_err) > 1 or (sec_err and not mudanca_falhas)
        for c in final:
            if c["id"] in sec_err:
                # Withheld: the app shows only «Esta parte está em revisão…»; keep no unchecked text.
                c["retida"] = sec_err[c["id"]][0]
                c["paragrafos"], c["mostrar"], c["tabela"] = [], [], None
        data = data_extenso(src.get("preparado_em"))
        return {
            "slug": self.slug, "titulo": src.get("titulo"), "resumo": src.get("resumo"),
            "preparado_em": src.get("preparado_em"), "preparacao": src.get("preparacao", "assistida"),
            "revisao_externa": src.get("revisao_externa"), "aviso": AVISO.format(data=data),
            "ambito": src.get("ambito"), "seccoes": final,
        }

    def mostrar(self, ref: str, sid: str) -> dict:
        slug, artigo, aid, art, i = self._redacao(ref)
        self._citar(sid, f"{slug}/{artigo}")
        depois = numeros_de(texto_versao(art["versoes"][i]))
        antes = numeros_de(texto_versao(art["versoes"][i - 1])) if i > 0 else []
        da, dd = dict(antes), dict(depois)
        mudou = [n for n, t in depois if da.get(n) != t] or [n for n, _ in antes if n not in dd]
        n0 = mudou[0] if mudou else (depois[0][0] if depois else "0")
        a_txt, d_txt = da.get(n0, ""), dd.get(n0, "")
        if not a_txt and list(da) == ["0"]:  # the article had no números before this redação
            a_txt = da["0"]
        if a_txt and d_txt:
            # Show only the lines that changed inside the número (an alínea, usually).
            import difflib
            al, dl = a_txt.split("\n"), d_txt.split("\n")
            for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, al, dl, autojunk=False).get_opcodes():
                if op != "equal":
                    a_txt, d_txt = "\n".join(al[i1:i2]), "\n".join(dl[j1:j2])
                    break
        m = re.match(r"^([a-z]{1,2})\)\s", d_txt or a_txt)
        return {"diploma": slug, "artigo": artigo, "rotulo": art.get("rotulo"), "ato": aid,
                "numero": None if n0 == "0" else n0, "alinea": m.group(1) if m else None,
                "antes": cortar(a_txt, 200), "depois": cortar(d_txt, 200),
                "href": f"#/d/{slug}/{artigo}?redacao={aid}&ver=mudou"}

    def tabela(self, t: dict, sid: str) -> dict:
        slug, artigo, n, alinea = t["diploma"], t["artigo"], str(t.get("numero") or "0"), t.get("alinea")
        art = self.d.artigo(slug, artigo)
        if art is None or self.d.e_copia(slug, artigo):
            raise Erro(f"artigo desconhecido ou cópia «{slug}/{artigo}»")
        self._citar(sid, f"{slug}/{artigo}")
        linhas, ultimo = [], None
        for i, v in enumerate(art.get("versoes", [])):
            blocos = dict(numeros_de(texto_versao(v)))
            texto = blocos.get(n)
            if texto is not None and alinea:
                ls = [x for x in texto.split("\n") if re.match(rf"^{re.escape(alinea)}\)\s", x)]
                texto = ls[0] if ls else None
            if texto is None or texto == ultimo:
                continue
            ultimo = texto
            a = self.d.atos.get(v["ato"], {})
            linhas.append({"redacao": f"{i + 1}.ª redação", "ato": v["ato"], "designacao": a.get("designacao", v["ato"]),
                           "data": data_curta(v.get("vigor") or v.get("publicacao")), "texto": cortar(texto, 300),
                           "href": f"#/d/{slug}/{artigo}?redacao={v['ato']}"})
        if not linhas:
            raise Erro(f"«{slug}/{artigo}» não tem o n.º {n}" + (f", alínea {alinea})" if alinea else ""))
        return {"diploma": slug, "artigo": artigo, "rotulo": art.get("rotulo"), "numero": None if n == "0" else n,
                "alinea": alinea, "linhas": linhas}

    def em_numeros(self, escopo: list[str]) -> dict:
        from collections import Counter
        tipos = Counter(self.d.tipo_ato(a) for a in escopo)
        contagem: Counter = Counter()
        rotulos = {}
        for slug, a in self.artigos_ambito():
            art = self.d.artigo(slug, a)
            if not art:
                continue
            n = sum(1 for v in art.get("versoes", []) if v.get("tipo") not in ("original", "sem_alteracao")
                    and (v.get("vigor") or v.get("publicacao") or "") >= self.desde)
            if n:
                contagem[(slug, a)] = n
                rotulos[(slug, a)] = art.get("rotulo")
        mais = sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0][0], num_artigo(kv[0][1])))[:5]
        return {"id": "em-numeros", "tipo": "numeros", "titulo": TITULOS["numeros"],
                "atos_por_tipo": [{"tipo_ato": t, "n": n} for t, n in sorted(tipos.items(), key=lambda kv: (-kv[1], kv[0]))],
                "n_atos": len(escopo), "artigos_alterados": len(contagem),
                "mais_alterados": [{"diploma": s, "artigo": a, "rotulo": rotulos[(s, a)], "n": n,
                                    "href": f"#/d/{s}/{a}"} for (s, a), n in mais]}


def juntar(xs: list[str]) -> str:
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " e " + xs[-1] if xs else ""


# ---------------------------------------------------------------------------------------------
# Entry points


def fontes(pasta: str = FONTES) -> list[str]:
    return sorted(glob.glob(os.path.join(pasta, "*.json")))


def construir(out: str, estrito: bool, parcial: bool = False, pasta: str = FONTES) -> tuple[dict, list[str], list[dict]]:
    """Compile every story into out/historias/. Returns (index, messages, rows for verificacao.conteudo).

    Strict: every E check is an error message. Lenient: a failing section is withheld (`retida`), or
    the whole story when the failure is outside a `mudanca` section or more than one section fails."""
    dados = Dados(out)
    msgs, linhas = [], []
    index = {"historias": [], "artigos": {}}
    destino = os.path.join(out, "historias")
    os.makedirs(destino, exist_ok=True)
    escritos = set()
    for f in fontes(pasta):
        with open(f, encoding="utf-8") as fh:
            src = json.load(fh)
        h = Historia(src, dados, parcial=parcial)
        comp = h.compilar()
        slug = h.slug or os.path.basename(f)[:-5]
        for sid, e in h.erros:
            msgs.append(f"história {slug}{'/' + sid if sid else ''}: {e}")
            linhas.append({"tipo": "historia", "id": slug, "seccao": sid, "motivo": e})
        msgs.extend("aviso: " + a for a in h.avisos)
        if h.retida_inteira and not estrito:
            continue
        with open(os.path.join(destino, slug + ".json"), "w", encoding="utf-8") as fh:
            json.dump(comp, fh, ensure_ascii=False, separators=(",", ":"))
        escritos.add(slug + ".json")
        index["historias"].append({k: comp[k] for k in ("slug", "titulo", "resumo", "preparado_em", "preparacao",
                                                         "revisao_externa", "aviso")}
                                  | {"diplomas": [x["slug"] for x in (src.get("ambito") or {}).get("diplomas", [])]})
        for k, secs in sorted(h.citados.items()):
            index["artigos"].setdefault(k, []).extend({"historia": slug, "seccao": s} for s in sorted(secs))
    for velho in glob.glob(os.path.join(destino, "*.json")):
        if os.path.basename(velho) not in escritos | {"index.json"}:
            os.remove(velho)
    with open(os.path.join(destino, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    return index, msgs, linhas


def _atualizar(slug: str, out: str) -> int:
    p = os.path.join(FONTES, slug + ".json")
    with open(p, encoding="utf-8") as f:
        src = json.load(f)
    h = Historia(src, Dados(out), parcial=True)
    h.compilar()
    erros = [e for _, e in h.erros]
    if erros:
        print("\n".join(erros))
        print("Corrija os erros antes de atualizar.")
        return 1
    src["hashes"] = dict(sorted(h.hashes_atuais.items()))
    src["preparado_em"] = hoje()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(src, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{slug}: {len(src['hashes'])} hashes, preparado_em {src['preparado_em']}, {h.palavras} palavras.")
    return 0


def main(argv: list[str]) -> int:
    out = os.path.join(ROOT, "app", "data")
    if len(argv) == 2 and argv[0] == "--atualizar":
        return _atualizar(argv[1], out)
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        # Check against app/data without writing into it.
        os.symlink(os.path.join(out, "d"), os.path.join(tmp, "d"))
        for n in os.listdir(out):
            if n.endswith(".json"):
                os.symlink(os.path.join(out, n), os.path.join(tmp, n))
        index, msgs, _ = construir(tmp, estrito=True, parcial="--parcial" in argv)
    for m in msgs:
        print(m)
    print(f"{len(index['historias'])} histórias, {sum(1 for m in msgs if not m.startswith('aviso'))} erro(s).")
    return 1 if any(not m.startswith("aviso") for m in msgs) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
