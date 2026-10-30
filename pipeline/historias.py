"""Stories: pipeline/historias/<slug>.md, compiled to app/data/historias/ (long form).

The writer's guide, with the syntax and every figure type, is pipeline/historias/README.md. In short:
a flat front matter between two «---» lines, then a small Markdown subset: paragraphs, «## subtítulo»,
*itálico*, «citações», links to site objects «[texto](esquema:alvo)», notes «[^id]», pull quotes and
figures in «```figura <tipo>» fences. The build resolves every site link and figure against app/data
(an act, an article, a redação, a vote must exist), numbers the notes and the figures, and writes
historias/<slug>.json for the app, which draws each figure live from the data.

    python -I pipeline/historias.py                      # check every story against app/data (strict)
    python -I pipeline/historias.py --parcial            # a missing pipeline file (quem.json) only warns
    python -I pipeline/historias.py --sintaxe [F.md …]   # only the checks that need no app/data (CI runs it)
    python -I pipeline/historias.py --atualizar SLUG     # after re-reading the figures: write SLUG.lock.json
    python -I pipeline/historias.py --exemplo            # compile pipeline/fixtures/historias/exemplo.md into
                                                         # app/data/historias/, to see it at #/historia/exemplo

Checks (E error, W warning; † runs in --sintaxe): F1† front matter, F2† Markdown subset, R1 site links,
R2 figures, R3 designations in link text, R4 first mention of an act is a link, R5 vote claims,
N1†–N5† notes and sources, P1† neutrality, P2† vendor names, P3† motive words, P4† lengths,
S1–S3 staleness against the lock file. Lenient builds withhold a failing figure, or the whole story
when the failure is outside a figure; strict builds (REDACAO_ESTRITO=1) fail.
"""
from __future__ import annotations

import datetime
import glob
import hashlib
import json
import os
import re
import shutil
import sys
import unicodedata
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import estilo  # noqa: E402

FONTES = os.path.join(HERE, "historias")
EXEMPLO = os.path.join(HERE, "fixtures", "historias", "exemplo.md")
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
         "novembro", "dezembro"]
AVISO = ("Texto preparado com a ajuda de uma ferramenta automática, a partir dos dados do site e das fontes "
         "indicadas. Data: {data}. {revisao}")
SEM_REVISAO = "Ainda sem revisão jurídica externa."
VENDOR = re.compile(estilo.FORNECEDORES, re.I)

OBRIGATORIAS = ("slug", "titulo", "resumo", "data", "autoria", "preparacao", "consultado", "diplomas")
CHAVES_FM = set(OBRIGATORIAS) | {"revisao_externa", "relacionadas", "imagem_partilha"}
ESQUEMAS = ("ato", "artigo", "mudou", "origem", "iniciativa", "grupo", "diploma", "quem", "governo", "presidente",
            "data", "historia", "fig")
_ID = r"[a-z0-9][a-z0-9-]*"
_ART = rf"{_ID}/artigo-[a-z0-9-]+"
ALVOS = {
    "ato": rf"{_ID}(#generalidade)?", "artigo": rf"{_ART}(@{_ID})?", "mudou": rf"{_ART}@{_ID}(\.\.{_ID})?",
    "origem": rf"{_ART}@{_ID}", "iniciativa": r"[A-Za-z0-9-]+", "grupo": _ID, "diploma": _ID,
    "quem": rf"{_ID}(#governo-\d+|#legislatura-[IVXLCA-Z]+)?", "governo": rf"\d+|{_ID}", "presidente": _ID,
    "data": rf"{_ID}\.(publicacao|vigor|promulgacao|generalidade|vfg|d_cm|veto)", "historia": _ID, "fig": _ID,
}
CAMPOS_DATA = ("publicacao", "vigor", "promulgacao", "generalidade", "vfg", "d_cm", "veto")
FIGURAS = {
    "diff": ({"artigo", "para"}, {"de", "mostrar", "vista"}),
    "votacao": ({"ato"}, {"item"}),
    "cronologia": ({"diploma"}, {"desde", "ate", "artigos", "por", "marcar"}),
    "origem": ({"artigo", "redacao"}, {"mostrar", "destacar"}),
    "ficha": ({"ato"}, {"campos"}),
    "imagem": ({"arquivo", "alt", "titulo", "credito", "fonte", "licenca"}, set()),
}
COMUNS = ({"id", "legenda"}, {"titulo", "largura"})
CAMPOS_FICHA = ("proposta", "governo", "generalidade", "vfg", "tribunal", "veto", "novo_decreto", "confirmacao",
                "d_cm", "promulgacao", "publicacao", "vigor")
FONTE_FIG = {
    "diff": "Diário da República, legislação consolidada.",
    "origem": "Diário da República, legislação consolidada.",
    "votacao": ("Assembleia da República, dados abertos: o voto de cada grupo na generalidade; da votação final "
                "global, só o resultado. Ordem dos grupos: a da Assembleia da República."),
    "cronologia": "Diário da República; Assembleia da República; tabela de Governos do site.",
    "ficha": "Dados do site: Diário da República, Assembleia da República, tabelas de Governos e de Presidentes.",
}
HOSTS = ("diariodarepublica.pt", "dre.pt", "parlamento.pt", "tribunalconstitucional.pt", "presidencia.pt",
         "portugal.gov.pt", "eur-lex.europa.eu", "ine.pt", "pordata.pt", "arquivo.pt", "publico.pt", "expresso.pt",
         "observador.pt", "rtp.pt", "dn.pt", "jn.pt", "eco.sapo.pt", "lusa.pt", "sicnoticias.pt", "cnnportugal.iol.pt")
# P3: motive and editorial hints (folded, word-boundary; * is a stem).
INDICIOS_MOTIVO = (
    "para travar", "para impedir", "para evitar", "para agradar", "finalmente", "enfim", "com o objetivo de",
    "com o intuito de", "na tentativa de", "procurou", "quis", "queria", "pretend*", "sob pressão", "cedeu", "recuou",
    "à pressa", "polémic*", "controvers*", "históric*", "mais dur*", "endurec*", "aperto", "facilit*", "porta aberta",
    "efeito de chamada", "abuso*", "fraude*", "felizmente", "infelizmente", "surpreendentemente", "obviamente",
    "claramente", "na verdade", "como era de esperar", "inevitáve*", "radical*", "extrema-direita",
    "extrema-esquerda", "populis*", "xenófob*", "racis*")
ATRIBUICAO = ("argumentou", "argumentaram", "defendeu", "defenderam", "afirmou", "afirmaram", "disse", "disseram",
              "escreveu", "escreveram", "considerou", "consideraram", "justificou", "justificaram", "alegou",
              "alegaram", "criticou", "criticaram", "sustentou", "sustentaram", "segundo", "de acordo com",
              "na exposição de motivos", "na mensagem", "no acórdão")
SENTIDOS_FRASE = (("favor", r"vot(?:ou|aram) a favor"), ("contra", r"vot(?:ou|aram) contra"),
                  ("abstencao", r"abst(?:eve-se|iveram-se)|se abstiveram|se absteve"))
FASES_SEM_GRUPOS = ("votação final global", "especialidade", "confirmação", "reapreciação")
DESIGNACAO = re.compile(r"(?:Lei Orgânica|Lei Constitucional|Lei|Decreto-Lei|Decreto Regulamentar|"
                        r"Declaração de Retificação|Proposta de Lei|Projeto de Lei|Projeto de Resolução)"
                        r" n\.º \d+(?:-[A-Z])?(?:/[IVXLC]+|/\d{2,4})?")
DESIG_ATO = re.compile(r"(?:Lei Orgânica|Lei Constitucional|Lei|Decreto-Lei) n\.º \d+(?:-[A-Z])?(?:/\d{2,4})?(?![\d/])")


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


def dobrar(s: str) -> str:
    """Lower case without accents, for word lists."""
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def ancora(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", dobrar(s)).strip("-") or "seccao"


def palavras(s: str) -> int:
    return len(re.findall(r"[\wÀ-ú%€º-]+", s))


def juntar(xs: list[str]) -> str:
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " e " + xs[-1] if xs else ""


def cortar(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= n:
        return s
    corte = s[: n - 1]
    corte = corte[: corte.rfind(" ")] if " " in corte else corte
    return corte.rstrip(" ,;:") + "…"


class Erro(Exception):
    """A link or figure that does not resolve. `falta` names the missing pipeline file, if that is the cause."""

    def __init__(self, msg: str, falta: str | None = None, regra: str = "R1"):
        super().__init__(msg)
        self.falta = falta
        self.regra = regra


# ---------------------------------------------------------------------------------------------
# Data access


class Dados:
    def __init__(self, out: str):
        self.out = out
        self._art: dict[str, dict | None] = {}
        self._dip: dict[str, dict | None] = {}
        self._quem_dip: dict[str, dict | None] = {}
        self.faltam: set[str] = set()
        self.atos = self._ler("atos.json", {})
        index = self._ler("index.json", {})
        self.aliases = index.get("aliases_atos") or {}
        self.diplomas_index = {d["slug"]: d for d in index.get("diplomas", [])}
        self.passagem = self._ler("passagem.json", {})
        self.iniciativas = self._ler("iniciativas.json", {})
        self.pendentes = self._ler("pendentes.json", {})
        self.quem = self._ler("quem.json", None)
        self.governos = self._ler("governos.json", None) or {}
        self.faltam.discard("governos.json")
        grupos = self.governos.get("grupos") or {}
        self.siglas = {n.get("sigla") for g in grupos.values() for n in g.get("nomes", [])} - {None}
        self.nomes_grupo: dict[str, set[str]] = {}   # folded name -> siglas
        for g in grupos.values():
            for n in g.get("nomes", []):
                if n.get("nome") and n.get("sigla"):
                    self.nomes_grupo.setdefault(n["nome"], set()).add(n["sigla"])
        self._designacoes: dict[str, str] | None = None

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

    def designacoes(self) -> dict[str, str]:
        """designation -> act id, for R4 (ambiguous designations are left out)."""
        if self._designacoes is None:
            vistos: dict[str, str | None] = {}
            for aid, a in self.atos.items():
                d = re.sub(r"^[IVXLC]+,\s*", "", a.get("designacao") or "")
                vistos[d] = None if d in vistos and vistos[d] != aid else aid
            self._designacoes = {k: v for k, v in vistos.items() if v}
        return self._designacoes

    def diploma(self, slug: str) -> dict | None:
        if slug not in self._dip:
            p = os.path.join(self.out, "d", slug + ".json")
            self._dip[slug] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
        return self._dip[slug]

    def quem_diploma(self, slug: str) -> dict | None:
        if slug not in self._quem_dip:
            p = os.path.join(self.out, "quem", slug + ".json")
            self._quem_dip[slug] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
        return self._quem_dip[slug]

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

    def votos_generalidade(self, aid: str) -> list[dict]:
        """itensGeneralidade() of app.js: [{voto, titulo, comissao|iniciativa}]."""
        p = self.passagem.get(aid) or {}
        out = []
        for g in self.generalidade(aid):
            if g.get("origem") == "texto_comissao":
                v = (p.get("texto_comissao") or [])[g["indice"]] if g["indice"] < len(p.get("texto_comissao") or []) else None
                if v:
                    t = "Texto final da comissão" if re.search(r"texto final", v.get("descricao") or "", re.I) else "Texto de substituição da comissão"
                    out.append({"voto": v, "titulo": t, "comissao": True})
            else:
                i = next((x for x in p.get("iniciativas", []) if x["id"] == g.get("id")), None)
                if i and i.get("generalidade"):
                    out.append({"voto": i["generalidade"], "titulo": i["designacao"], "iniciativa": i["id"]})
        return out

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

    def governo(self, n: int) -> dict | None:
        return next((g for g in self.governos.get("governos", []) if g.get("numero") == n), None)

    def governo_em(self, dia: str) -> int | None:
        for g in self.governos.get("governos", []):
            if g.get("inicio") and g["inicio"] <= dia and (not g.get("fim") or dia < g["fim"]):
                return g["numero"]
        return None


def versoes_do_ato(art: dict, aid: str) -> list[int]:
    return [i for i, v in enumerate(art.get("versoes", [])) if v.get("ato") == aid]


def chave_redacao(art: dict, i: int) -> str:
    """The URL key of redação i: its act, or <ato>-<k> when that act wrote several (chavePartilha in app.js)."""
    a = art["versoes"][i]["ato"]
    mesmas = versoes_do_ato(art, a)
    return a if len(mesmas) == 1 else f"{a}-{mesmas.index(i) + 1}"


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


def rotulos_linhas(texto: str) -> list[tuple[str, str | None, str]]:
    """Each line of an article with its label: [(número or '', alínea or None, line)].

    A line that is neither a número nor an alínea (a continuation) keeps the label before it."""
    out, n, al = [], "", None
    for linha in texto.split("\n"):
        m = re.match(r"^(\d+(?:\.\d+)*(?:-[A-Z])?) — ", linha)
        if m:
            n, al = m.group(1), None
        else:
            m = re.match(r"^([a-z]+(?:-[a-z])?)\) ", linha)
            if m:
                al = m.group(1)
        out.append((n, al, linha))
    return out


def ler_mostrar(valor: str) -> list[dict] | None:
    """«1, 1/b, 2-A, /c» -> [{n, al}]; None when the grammar does not hold."""
    out = []
    for parte in [x.strip() for x in valor.split(",") if x.strip()]:
        m = re.fullmatch(r"(\d+(?:-[A-Z])?)?(?:/([a-z]+(?:-[a-z])?))?", parte)
        if not m or (m.group(1) is None and m.group(2) is None):
            return None
        out.append({"n": m.group(1) or "", "al": m.group(2)})
    return out


def selecionadas(rotulos: list[tuple[str, str | None, str]], sel: list[dict]) -> list[bool]:
    """Which lines a `mostrar` selection keeps: the número or alínea, and the número's opening line."""
    out = []
    for n, al, linha in rotulos:
        ok = False
        for s in sel:
            if s["n"] != n:
                continue
            if s["al"] is None or al == s["al"] or (al is None and n):
                ok = True
        out.append(ok)
    return out


def tamanho_imagem(p: str) -> tuple[str, int, int] | None:
    """(format, width, height) of a PNG, JPEG or WebP file, read from its header."""
    with open(p, "rb") as f:
        b = f.read(65536)
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        c = b[12:16]
        if c == b"VP8X":
            return "webp", 1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little")
        if c == b"VP8L":
            x = int.from_bytes(b[21:25], "little")
            return "webp", (x & 0x3FFF) + 1, ((x >> 14) & 0x3FFF) + 1
        if c == b"VP8 ":
            return "webp", int.from_bytes(b[26:28], "little") & 0x3FFF, int.from_bytes(b[28:30], "little") & 0x3FFF
    if b[:2] == b"\xff\xd8":
        with open(p, "rb") as f:
            b = f.read()
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                return "jpg", int.from_bytes(b[i + 7:i + 9], "big"), int.from_bytes(b[i + 5:i + 7], "big")
            i += 2 + int.from_bytes(b[i + 2:i + 4], "big")
    return None


# ---------------------------------------------------------------------------------------------
# Source: front matter and the Markdown subset (no app/data needed)


INLINE = re.compile(r"\[\^([a-z0-9-]+)\]|\[([^\[\]\n]*)\]\(([^()\s]*)\)|\*([^*\n]+)\*")


def tokens_inline(texto: str) -> list:
    """Split inline text into str | {t:'ref', esquema, alvo, texto} | {t:'em', texto} | {t:'nota', id}."""
    out, pos = [], 0
    for m in INLINE.finditer(texto):
        if m.start() > pos:
            out.append(texto[pos:m.start()])
        if m.group(1) is not None:
            out.append({"t": "nota", "id": m.group(1)})
        elif m.group(3) is not None:
            esq, _, alvo = m.group(3).partition(":")
            out.append({"t": "ref", "esquema": esq, "alvo": alvo, "texto": m.group(2), "bruto": m.group(3)})
        else:
            out.append({"t": "em", "texto": m.group(4)})
        pos = m.end()
    if pos < len(texto):
        out.append(texto[pos:])
    return out


def texto_simples(tokens: list, auto: str = "X X X") -> str:
    """The words of inline tokens: a link's text (an empty one: `auto`), an em's text, no notes."""
    out = []
    for t in tokens:
        if isinstance(t, str):
            out.append(t)
        elif t["t"] == "ref":
            out.append(t.get("resolvido") or t["texto"] or auto)
        elif t["t"] == "em":
            out.append(t["texto"])
    return "".join(out)


def frases(tokens: list) -> list[list]:
    """Sentences of inline tokens, with links and notes kept whole."""
    marc, partes = [], []
    for t in tokens:
        if isinstance(t, str):
            partes.append(t)
        else:
            marc.append(t)
            partes.append(f"{len(marc) - 1}")
    s = "".join(partes)
    s = re.sub(r"«[^»]*»", lambda m: m.group(0).replace(".", "").replace("?", "").replace("!", ""), s)
    s = re.sub(r"\b(n|art|arts|p|pp|al|als|Dr|Sr|Sra|cf|ss)\.", lambda m: m.group(0)[:-1] + "", s)
    out = []
    for f in re.split(r"(?<=[.?!»])\s+(?=[A-ZÀ-Ú«])", s):
        f = f.replace("", ".").replace("", "?").replace("", "!")
        toks = []
        for i, p in enumerate(re.split(r"(\d+)", f)):
            if i % 2:
                toks.append(marc[int(p)])
            elif p:
                toks.append(p)
        if toks:
            out.append(toks)
    return out


class Fonte:
    """One parsed story source: front matter, blocks, notes, and the syntax problems found while reading."""

    def __init__(self, texto: str, nome: str):
        self.nome = nome                       # file name without .md
        self.texto = texto
        self.fm: dict[str, str] = {}
        self.fm_linha: dict[str, int] = {}
        self.blocos: list[dict] = []
        self.notas: dict[str, dict] = {}
        self.problemas: list[tuple[int, str, str, str]] = []   # (line, level E|W, rule, message)
        self._ler()

    def erro(self, linha: int, regra: str, msg: str, nivel: str = "E"):
        self.problemas.append((linha, nivel, regra, msg))

    def _ler(self):
        linhas = self.texto.split("\n")
        if not linhas or linhas[0].strip() != "---":
            self.erro(1, "F1", "falta o cabeçalho entre duas linhas «---»")
            corpo_ini = 0
        else:
            fim = next((i for i in range(1, len(linhas)) if linhas[i].strip() == "---"), None)
            if fim is None:
                self.erro(1, "F1", "o cabeçalho não fecha com «---»")
                fim = len(linhas)
            chave = None
            for i in range(1, fim):
                l = linhas[i]
                if not l.strip():
                    continue
                if l.startswith("  ") and chave:
                    self.fm[chave] = (self.fm[chave] + " " + l.strip()).strip()
                    continue
                m = re.match(r"^([a-z_]+):\s?(.*)$", l)
                if not m:
                    self.erro(i + 1, "F1", f"linha do cabeçalho sem «chave: valor»: «{cortar(l, 60)}»")
                    chave = None
                    continue
                chave = m.group(1)
                if chave in self.fm:
                    self.erro(i + 1, "F1", f"chave repetida «{chave}»")
                self.fm[chave] = m.group(2).strip()
                self.fm_linha[chave] = i + 1
            corpo_ini = fim + 1
        self._corpo(linhas, corpo_ini)

    def _corpo(self, linhas: list[str], i: int):
        par: list[str] = []
        par_ini = 0
        anchors: set[str] = set()

        def fechar():
            nonlocal par
            if par:
                texto = " ".join(x.strip() for x in par)
                self.blocos.append({"t": "p", "texto": texto, "linha": par_ini})
                self._subset(texto, par_ini)
            par = []

        n = len(linhas)
        while i < n:
            l = linhas[i]
            s = l.strip()
            if not s:
                fechar()
                i += 1
                continue
            if s.startswith("```"):
                fechar()
                m = re.match(r"^```\s*figura\s+([a-z]+)\s*$", s)
                ini = i + 1
                j = next((k for k in range(i + 1, n) if linhas[k].strip() == "```"), None)
                if j is None:
                    self.erro(ini, "F2", "uma figura abre com «```» e não fecha")
                    j = n
                if not m:
                    self.erro(ini, "F2", f"bloco «{cortar(s, 40)}»: só «```figura <tipo>»")
                else:
                    self._figura(m.group(1), linhas[i + 1:j], ini)
                i = j + 1
                continue
            m = re.match(r"^\[\^([a-z0-9-]+)\]:\s*(.*)$", l)
            if m:
                fechar()
                ini, corpo = i + 1, [m.group(2)]
                i += 1
                while i < n and linhas[i].startswith("  ") and linhas[i].strip():
                    corpo.append(linhas[i].strip())
                    i += 1
                nid = m.group(1)
                if nid in self.notas:
                    self.erro(ini, "N1", f"nota «{nid}» definida duas vezes")
                self.notas[nid] = {"texto": " ".join(x for x in corpo if x), "linha": ini}
                continue
            m = re.match(r"^(#{1,6})\s+(.*?)\s*(?:\{#([a-z0-9-]+)\})?\s*$", l)
            if m:
                fechar()
                nivel = len(m.group(1))
                if nivel not in (2, 3):
                    self.erro(i + 1, "F2", f"«{m.group(1)}»: só «##» e «###»")
                aid = m.group(3) or ancora(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", m.group(2)))
                base, k = aid, 2
                while aid in anchors:
                    aid, k = f"{base}-{k}", k + 1
                anchors.add(aid)
                self.blocos.append({"t": "h2" if nivel <= 2 else "h3", "texto": m.group(2), "id": aid, "linha": i + 1})
                self._subset(m.group(2), i + 1)
                i += 1
                continue
            if s.startswith(">"):
                fechar()
                ini, ls = i + 1, []
                while i < n and linhas[i].strip().startswith(">"):
                    ls.append(linhas[i].strip()[1:].strip())
                    i += 1
                self._citacao(ls, ini)
                continue
            if re.match(r"^\s*([-*+]|\d+[.)])\s", l):
                self.erro(i + 1, "F2", "listas não fazem parte do formato: escreva um parágrafo")
            elif s.startswith("|"):
                self.erro(i + 1, "F2", "tabelas não fazem parte do formato")
            if not par:
                par_ini = i + 1
            par.append(l)
            i += 1
        fechar()

    def _subset(self, texto: str, linha: int, legenda: bool = False):
        """F2 on inline text: no HTML, no bold, no https in prose, known link schemes."""
        if re.search(r"<[A-Za-z/!]", texto):
            self.erro(linha, "F2", "HTML não faz parte do formato")
        if "**" in texto or "__" in texto:
            self.erro(linha, "F2", "negrito não faz parte do formato: use *itálico*")
        for t in tokens_inline(texto):
            if isinstance(t, str):
                if re.search(r"https?://", t):
                    self.erro(linha, "F2", "endereço na prosa: ponha a fonte numa nota [^id]")
                if re.search(r"\]\(|\[\^|\]\[", t):
                    self.erro(linha, "F2", f"ligação mal escrita perto de «{cortar(t.strip(), 50)}»")
                continue
            if t["t"] != "ref":
                continue
            if re.match(r"https?$", t["esquema"]):
                self.erro(linha, "F2", f"ligação externa «{cortar(t['bruto'], 60)}» na " + ("legenda" if legenda else "prosa")
                          + ": ponha a fonte numa nota [^id]")
            elif t["esquema"] not in ESQUEMAS:
                self.erro(linha, "F2", f"esquema de ligação desconhecido «{t['esquema']}:» em «{t['bruto']}»")
            elif not re.fullmatch(ALVOS[t["esquema"]], t["alvo"]):
                self.erro(linha, "F2", f"alvo mal escrito «{t['bruto']}»")
            elif re.search(r"@hoje\b|\.\.hoje\b", t["alvo"]):
                self.erro(linha, "F2", f"«{t['bruto']}»: nunca «hoje»; use a redação (o ato que a escreveu)")

    def _citacao(self, ls: list[str], linha: int):
        if len(ls) != 2 or not re.fullmatch(r"«.+»", ls[0]) or not ls[1].startswith("—"):
            self.erro(linha, "N4", "uma citação em destaque tem duas linhas: «> «…»» e «> — Atribuição[^id]»")
            if not ls:
                return
        frase = ls[0]
        autor = ls[1].lstrip("—").strip() if len(ls) > 1 else ""
        if not re.search(r"\[\^[a-z0-9-]+\]", autor):
            self.erro(linha, "N4", "a atribuição de uma citação em destaque precisa de uma nota [^id]")
        self._subset(frase, linha)
        self._subset(autor, linha)
        self.blocos.append({"t": "citacao", "texto": frase, "autor": autor, "linha": linha})

    def _figura(self, tipo: str, ls: list[str], linha: int):
        params: dict[str, str] = {}
        plinha: dict[str, int] = {}
        chave = None
        for k, l in enumerate(ls):
            if not l.strip():
                continue
            if l.startswith("  ") and chave:
                params[chave] = (params[chave] + " " + l.strip()).strip()
                continue
            m = re.match(r"^([a-z_]+):\s?(.*)$", l)
            if not m:
                self.erro(linha + k + 1, "F2", f"linha da figura sem «chave: valor»: «{cortar(l, 60)}»")
                chave = None
                continue
            chave = m.group(1)
            params[chave] = m.group(2).strip()
            plinha[chave] = linha + k + 1
        fid = params.get("id") or f"sem-id-{linha}"
        b = {"t": "figura", "tipo": tipo, "params": params, "plinha": plinha, "linha": linha, "id": fid}
        self.blocos.append(b)
        if tipo not in FIGURAS:
            self.erro(linha, "F2", f"tipo de figura desconhecido «{tipo}» (diff, votacao, cronologia, origem, ficha, imagem)")
            return
        obrig, opc = FIGURAS[tipo]
        for k in sorted((obrig | COMUNS[0]) - set(params)):
            if k == "titulo" and tipo != "imagem":
                continue
            self.erro(linha, "F2", f"figura «{fid}»: falta «{k}»")
        for k in sorted(set(params) - obrig - opc - COMUNS[0] - COMUNS[1]):
            self.erro(plinha[k], "F2", f"figura «{fid}»: chave desconhecida «{k}»")
        if params.get("id") and not re.fullmatch(r"[a-z0-9-]+", params["id"]):
            self.erro(plinha["id"], "F2", f"id de figura «{params['id']}»: só [a-z0-9-]")
        larg = params.get("largura")
        if larg and larg not in ("texto", "larga", "lado"):
            self.erro(plinha["largura"], "F2", f"largura «{larg}»: texto, larga ou lado")
        if larg == "lado" and tipo != "ficha":
            self.erro(plinha["largura"], "F2", "largura «lado» só numa ficha")
        if tipo == "diff" and params.get("vista") not in (None, "", "texto", "lado"):
            self.erro(plinha["vista"], "F2", "vista: texto ou lado")
        if tipo == "diff" and params.get("vista") == "lado" and larg != "larga":
            self.erro(plinha["vista"], "F2", "«vista: lado» precisa de «largura: larga»")
        for k in ("mostrar",):
            if params.get(k) and ler_mostrar(params[k]) is None:
                self.erro(plinha[k], "F2", f"mostrar «{params[k]}»: escreva 1, 1/b, 2-A ou /c, separados por vírgulas")
        for k in ("artigo",):
            if params.get(k) and not re.fullmatch(_ART, params[k]):
                self.erro(plinha[k], "F2", f"artigo «{params[k]}»: escreva <diploma>/artigo-<n>")
        for k in ("desde", "ate"):
            if params.get(k) and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", params[k]):
                self.erro(plinha[k], "F2", f"{k} «{params[k]}»: AAAA-MM-DD")
        if tipo == "cronologia" and params.get("por") not in (None, "", "governo", "legislatura"):
            self.erro(plinha["por"], "F2", "por: governo ou legislatura")
        if tipo == "cronologia" and params.get("artigos") and not re.fullmatch(r"\s*[\w-]+\s*(\.\.\s*[\w-]+\s*|(,\s*[\w-]+\s*)*)", params["artigos"]):
            self.erro(plinha["artigos"], "F2", "artigos: um intervalo (1022..1113) ou uma lista (6, 6-A)")
        if tipo == "ficha" and params.get("campos"):
            for c in [x.strip() for x in params["campos"].split(",") if x.strip()]:
                if c not in CAMPOS_FICHA:
                    self.erro(plinha["campos"], "F2", f"campo de ficha desconhecido «{c}» ({', '.join(CAMPOS_FICHA)})")
        for k in ("redacao", "para", "de", "destacar"):
            if params.get(k) == "hoje":
                self.erro(plinha[k], "F2", f"{k}: nunca «hoje»; use o ato que escreveu a redação")
        if tipo == "imagem" and params.get("fonte") and not params["fonte"].startswith("https://"):
            self.erro(plinha["fonte"], "F2", "a fonte de uma imagem é um endereço https://")
        if params.get("legenda"):
            self._subset(params["legenda"], plinha["legenda"], legenda=True)
        if params.get("titulo"):
            self._subset(params["titulo"], plinha["titulo"])


def ler_fonte(caminho: str) -> Fonte:
    with open(caminho, encoding="utf-8") as f:
        return Fonte(f.read(), os.path.basename(caminho)[:-3])


# ---------------------------------------------------------------------------------------------
# A compiler for one story


class Historia:
    """Compile one source. With dados=None, only the data-free checks (†) run."""

    def __init__(self, fonte: Fonte, dados: Dados | None, parcial: bool = False, pasta: str = FONTES,
                 outras: dict[str, str] | None = None, lock: dict | None = None):
        self.f = fonte
        self.d = dados
        self.parcial = parcial
        self.pasta = pasta
        self.outras = outras or {}             # slug -> titulo of every story source
        self.lock = lock
        self.slug = fonte.fm.get("slug") or fonte.nome
        self.diplomas = [x.strip() for x in (fonte.fm.get("diplomas") or "").split(",") if x.strip()]
        self.primeiro = self.diplomas[0] if self.diplomas else None
        self.erros: list[tuple[str | None, str]] = []    # (figure id or None, message)
        self.avisos: list[str] = []
        self.mencionados: set[str] = set()                # acts named once (auto text: date only the first time)
        self.notas_ordem: list[str] = []
        self.figuras: dict[str, dict] = {}                # id -> block, in order
        self.fig_atual: str | None = None                 # the figure being compiled (R1 inside it)
        self.seccao_atual: str | None = None
        self.citados: dict[str, str | None] = {}          # "slug/artigo" -> anchor
        self.citados_fig: dict[str, str] = {}
        self.pinos: dict[str, str] = {}                   # "slug/artigo@chave" -> hash
        self.pinos_fig: dict[str, set[str]] = {}          # pinned key -> figure ids
        self.artigos_fig: dict[str, set[str]] = {}        # "slug/artigo" -> figure ids
        self.votos: dict[str, str] = {}                   # act -> hash (votacao, ficha)
        self.votos_fig: dict[str, set[str]] = {}
        self.palavras = 0
        self.retida_inteira = False

    # --- messages --------------------------------------------------------------------------------
    def _msg(self, linha: int, regra: str, msg: str) -> str:
        return f"{self.f.nome}.md:{linha}: [{regra}] {msg}"

    def erro(self, linha: int, regra: str, msg: str, fig: str | None = None):
        self.erros.append((fig, self._msg(linha, regra, msg)))

    def aviso(self, linha: int, regra: str, msg: str):
        self.avisos.append(self._msg(linha, regra, msg))

    # --- data-free checks (†) --------------------------------------------------------------------
    def sintaxe(self):
        f = self.f
        for linha, nivel, regra, msg in f.problemas:
            (self.erro if nivel == "E" else self.aviso)(linha, regra, msg)
        fm = f.fm
        for k in OBRIGATORIAS:
            if not fm.get(k):
                self.erro(1, "F1", f"falta «{k}» no cabeçalho")
        for k in sorted(set(fm) - CHAVES_FM):
            self.erro(f.fm_linha.get(k, 1), "F1", f"chave desconhecida «{k}» no cabeçalho")
        if fm.get("slug") and fm["slug"] != f.nome:
            self.erro(f.fm_linha["slug"], "F1", f"slug «{fm['slug']}» diferente do nome do ficheiro «{f.nome}.md»")
        for k in ("data", "consultado"):
            if fm.get(k) and not self._data_valida(fm[k]):
                self.erro(f.fm_linha[k], "F1", f"{k} «{fm[k]}»: AAAA-MM-DD")
        if fm.get("preparacao") and fm["preparacao"] not in ("assistida", "equipa"):
            self.erro(f.fm_linha["preparacao"], "F1", "preparacao: assistida ou equipa")
        if len(fm.get("resumo") or "") > 320:
            self.erro(f.fm_linha["resumo"], "F1", f"resumo com {len(fm['resumo'])} carateres (máx. 320)")
        if fm.get("revisao_externa") and not re.fullmatch(r".+,\s*\d{4}-\d{2}-\d{2}", fm["revisao_externa"]):
            self.erro(f.fm_linha["revisao_externa"], "F1", "revisao_externa: «Nome Apelido, AAAA-MM-DD» ou vazio")
        for r in [x.strip() for x in (fm.get("relacionadas") or "").split(",") if x.strip()]:
            esq, _, alvo = r.partition(":")
            if esq not in ("historia", "quem", "diploma", "ato", "artigo") or not re.fullmatch(ALVOS[esq], alvo):
                self.erro(f.fm_linha["relacionadas"], "F1", f"relacionada mal escrita «{r}» (historia:, quem:, diploma:, ato:, artigo:)")
        if fm.get("imagem_partilha"):
            self._imagem(fm["imagem_partilha"], f.fm_linha["imagem_partilha"], None, partilha=True)
        # P2: vendor names anywhere, quotations included.
        for i, l in enumerate(f.texto.split("\n")):
            m = VENDOR.search(l)
            if m:
                self.erro(i + 1, "P2", f"nome de modelo ou de fornecedor «{m.group(0)}»")
        # P1 on the title and the dek.
        for k in ("titulo", "resumo"):
            self._neutro(fm.get(k) or "", f.fm_linha.get(k, 1))
        # Figures: ids, numbers, references.
        figs = [b for b in f.blocos if b["t"] == "figura"]
        vistos: set[str] = set()
        for b in figs:
            fid = b["params"].get("id")
            if fid in vistos:
                self.erro(b["linha"], "F2", f"id de figura repetido «{fid}»")
            vistos.add(fid)
            self.figuras[b["id"]] = b
        usados_fig = set()
        notas_usadas: list[tuple[str, int]] = []
        prosa_palavras = 0
        for b in f.blocos:
            if b["t"] == "p":
                toks = tokens_inline(b["texto"])
                self._lint_texto(toks, b["linha"], paragrafo=True)
                prosa_palavras += palavras(texto_simples(toks))
            elif b["t"] in ("h2", "h3"):
                self._neutro(texto_simples(tokens_inline(b["texto"])), b["linha"])
                self._motivos(tokens_inline(b["texto"]), b["linha"])
                toks = tokens_inline(b["texto"])
            elif b["t"] == "citacao":
                toks = tokens_inline(b["texto"]) + [" "] + tokens_inline(b["autor"])
                self._neutro(texto_simples(tokens_inline(b["autor"])), b["linha"])
                prosa_palavras += palavras(b["texto"])
            elif b["t"] == "figura":
                toks = tokens_inline(b["params"].get("legenda") or "")
                self._lint_texto(toks, b["plinha"].get("legenda", b["linha"]), paragrafo=False)
                self._neutro(b["params"].get("titulo") or "", b["plinha"].get("titulo", b["linha"]))
                n = palavras(texto_simples(toks))
                if b["params"].get("legenda") and not 15 <= n <= 70:
                    self.aviso(b["plinha"].get("legenda", b["linha"]), "P4", f"legenda da figura «{b['id']}» com {n} palavras (15 a 70)")
                if b["tipo"] == "imagem" and b["params"].get("arquivo"):
                    self._imagem(b["params"]["arquivo"], b["plinha"]["arquivo"], b, partilha=False)
            else:
                toks = []
            if b["t"] in ("p", "h2", "h3", "citacao", "figura"):
                for t in toks:
                    if isinstance(t, dict) and t["t"] == "nota":
                        notas_usadas.append((t["id"], b["linha"]))
                    if isinstance(t, dict) and t["t"] == "ref" and t["esquema"] == "fig":
                        usados_fig.add(t["alvo"])
        # Notes.
        usadas = set()
        for nid, linha in notas_usadas:
            if nid not in f.notas:
                self.erro(linha, "N1", f"nota «[^{nid}]» sem definição")
            elif nid not in usadas:
                usadas.add(nid)
                self.notas_ordem.append(nid)
        for nid, n in f.notas.items():
            if nid not in usadas:
                self.erro(n["linha"], "N1", f"nota «{nid}» definida e não usada")
            toks = tokens_inline(n["texto"])
            for t in toks:
                if isinstance(t, dict) and t["t"] == "ref" and t["esquema"] == "fig":
                    usados_fig.add(t["alvo"])
            self._nota(nid, n)
        for fid in usados_fig:
            if fid not in vistos:
                self.erro(1, "R1", f"«fig:{fid}»: não há figura com esse id")
        for b in figs:
            if b["params"].get("id") and b["params"]["id"] not in usados_fig:
                self.aviso(b["linha"], "P4", f"a figura «{b['id']}» não tem uma ligação «[](fig:{b['id']})» no texto")
        if not 1500 <= prosa_palavras <= 7000:
            self.aviso(1, "P4", f"{prosa_palavras} palavras de prosa (1500 a 7000)")
        self.palavras = prosa_palavras

    @staticmethod
    def _data_valida(s: str) -> bool:
        try:
            datetime.date.fromisoformat(s)
            return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s))
        except ValueError:
            return False

    def _neutro(self, texto: str, linha: int):
        for _, _, msg in estilo.check_neutralidade(texto):
            if "fornecedor" in msg:
                continue  # P2 reports it once per line
            self.erro(linha, "P1", msg)

    def _motivos(self, toks: list, linha: int):
        for fr in frases(toks):
            plano = re.sub(r"«[^»]*»", " ", texto_simples(fr))
            low = dobrar(plano)
            ligado = any(isinstance(t, dict) and t["t"] in ("nota", "ref") for t in fr)
            atrib = any(re.search(rf"(?<![\w-]){re.escape(dobrar(a))}(?![\w-])", low) for a in ATRIBUICAO)
            if atrib and ligado:
                continue
            for p in INDICIOS_MOTIVO:
                pat = re.escape(dobrar(p.rstrip("*"))) + (r"\w*" if p.endswith("*") else "")
                m = re.search(rf"(?<![\w-]){pat}(?![\w-])", low)
                if m:
                    self.aviso(linha, "P3", f"«{m.group(0)}» fora de uma citação, sem atribuição com fonte: «{cortar(plano, 70)}»")
                    break

    def _lint_texto(self, toks: list, linha: int, paragrafo: bool):
        plano = texto_simples(toks)
        self._neutro(plano, linha)
        self._motivos(toks, linha)
        for fr in frases(toks):
            ligado = any(isinstance(t, dict) and t["t"] in ("nota", "ref") for t in fr)
            for q in re.findall(r"«([^»]*)»", texto_simples(fr)):
                if palavras(q) >= 4 and not ligado:
                    self.erro(linha, "N4", f"citação «{cortar(q, 50)}» sem nota nem ligação na mesma frase")
        if paragrafo and not any(isinstance(t, dict) and t["t"] in ("nota", "ref") for t in toks):
            self.aviso(linha, "N5", f"parágrafo sem ligação nem nota: «{cortar(plano, 60)}»")

    def _nota(self, nid: str, n: dict):
        texto = n["texto"]
        urls = re.findall(r"https?://[^\s)»]+", texto)
        refs = [t for t in tokens_inline(texto) if isinstance(t, dict) and t["t"] == "ref"]
        if not urls and not refs:
            self.erro(n["linha"], "N2", f"nota «{nid}» sem fonte: um endereço https:// ou uma ligação ao site")
        for u in urls:
            u = u.rstrip(".,;")
            p = urlparse(u)
            if p.scheme != "https" or not p.netloc or "." not in p.netloc:
                self.erro(n["linha"], "N2", f"endereço inválido ou sem https «{cortar(u, 60)}»")
                continue
            host = p.netloc.lower().split(":")[0]
            if not any(host == x or host.endswith("." + x) for x in HOSTS):
                self.aviso(n["linha"], "N3", f"fonte fora da lista conhecida: «{host}»")
            if not self.f.fm.get("consultado") and not re.search(re.escape(u) + r"[^\s]*\s*\(consultado a \d{4}-\d{2}-\d{2}\)", texto):
                self.erro(n["linha"], "N2", f"«{cortar(u, 60)}» sem data de consulta")
        for t in tokens_inline(re.sub(r"https?://\S+", " ", texto)):
            if isinstance(t, str) and re.search(r"<[A-Za-z/!]", t):
                self.erro(n["linha"], "F2", "HTML não faz parte do formato")
            if isinstance(t, dict) and t["t"] == "ref" and t["esquema"] not in ESQUEMAS:
                self.erro(n["linha"], "F2", f"esquema de ligação desconhecido «{t['esquema']}:»")
            elif isinstance(t, dict) and t["t"] == "ref" and not re.fullmatch(ALVOS[t["esquema"]], t["alvo"]):
                self.erro(n["linha"], "F2", f"alvo mal escrito «{t['bruto']}»")

    def _imagem(self, arquivo: str, linha: int, b: dict | None, partilha: bool):
        fig = b["id"] if b else None
        if not re.fullmatch(r"img/[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|webp)", arquivo):
            self.erro(linha, "R2" if b else "F1", f"«{arquivo}»: um ficheiro png, jpg ou webp em img/ (minúsculas)", fig)
            return
        p = os.path.join(self.pasta, arquivo)
        if not os.path.exists(p):
            self.erro(linha, "R2" if b else "F1", f"imagem em falta: {arquivo}", fig)
            return
        if os.path.getsize(p) > 300 * 1024:
            self.erro(linha, "R2" if b else "F1", f"{arquivo} tem {os.path.getsize(p) // 1024} KB (máx. 300 KB)", fig)
        t = tamanho_imagem(p)
        if not t:
            self.erro(linha, "R2" if b else "F1", f"{arquivo}: formato que não sabemos ler", fig)
            return
        if partilha and (t[1], t[2]) != (1200, 630):
            self.erro(linha, "F1", f"imagem_partilha {t[1]}×{t[2]}: tem de ter 1200×630")
        if b and b["params"].get("largura") == "larga" and t[1] < 1300:
            self.erro(linha, "R2", f"{arquivo} com {t[1]} px de largura: uma imagem larga tem pelo menos 1300", fig)

    # --- data: links -------------------------------------------------------------------------------
    def _citar(self, chave: str):
        if chave not in self.citados:
            self.citados[chave] = None if self.fig_atual else self.seccao_atual
        if self.fig_atual:
            self.artigos_fig.setdefault(chave, set()).add(self.fig_atual)
            self.citados_fig.setdefault(chave, "fig-" + self.fig_atual)

    def _art(self, slug: str, artigo: str) -> dict:
        if self.d.e_copia(slug, artigo):
            raise Erro(f"«{slug}/{artigo}» é a cópia anexa a outro diploma; cite o diploma de origem (R-7)")
        art = self.d.artigo(slug, artigo)
        if art is None:
            raise Erro(f"artigo desconhecido «{slug}/{artigo}»")
        return art

    def _indice(self, art: dict, chave: str, onde: str) -> int:
        """A redação key (act id, alias, or <ato>-<k>) -> index in art['versoes']."""
        if chave == "hoje":
            raise Erro(f"«{onde}»: nunca «hoje»")
        aid = self.d.aliases.get(chave, chave)
        idx = versoes_do_ato(art, aid)
        if idx:
            return idx[-1]
        m = re.fullmatch(r"(.+)-(\d+)", chave)
        if m:
            a = self.d.aliases.get(m.group(1), m.group(1))
            mesmas = versoes_do_ato(art, a)
            if len(mesmas) > 1 and 1 <= int(m.group(2)) <= len(mesmas):
                return mesmas[int(m.group(2)) - 1]
        raise Erro(f"«{onde}» não tem uma redação de «{chave}»")

    def _pinar(self, slug: str, artigo: str, art: dict, i: int):
        k = f"{slug}/{artigo}@{chave_redacao(art, i)}"
        self.pinos[k] = hash_texto(texto_versao(art["versoes"][i]))
        if self.fig_atual:
            self.pinos_fig.setdefault(k, set()).add(self.fig_atual)

    def _rotulo_artigo(self, slug: str, art: dict) -> str:
        r = art.get("rotulo", art.get("id", "")).replace("Artigo", "artigo", 1)
        if slug != self.primeiro:
            dip = self.d.diploma(slug) or {}
            r += " " + (dip.get("genitivo") or ("de " + dip.get("titulo", slug)))
        return r

    def _nome_ato(self, aid: str, a: dict) -> str:
        des = a.get("designacao", aid)
        if aid in self.mencionados or not a.get("publicacao"):
            return des
        com_ano = not re.search(r"/\d{2,4}(/\d+)?$", des)
        return f"{des}, de {data_extenso(a['publicacao'], ano=com_ano)}"

    def _quem(self, aid: str) -> dict:
        if self.d.quem is None:
            raise Erro("falta quem.json", falta="quem.json")
        return self.d.quem.get(aid) or {}

    def _numero_governo(self, aid: str) -> int | None:
        q = self._quem(aid)
        n = (q.get("governo") or {}).get("numero")
        if n is None:
            ns = [p.get("governo") for p in q.get("proponentes", []) if p.get("tipo") == "governo" and p.get("governo")]
            n = ns[0] if ns else (q.get("periodo") or {}).get("governo")
        return n

    def _data_ato(self, aid: str, a: dict, campo: str) -> str | None:
        d = self.d
        if campo == "publicacao":
            return a.get("publicacao")
        if campo == "vigor":
            vs = {x.get("vigor") for x in a.get("alteracoes", []) if x.get("vigor")}
            if len(vs) > 1:
                raise Erro(f"«{aid}» tem várias datas de entrada em vigor")
            return vs.pop() if vs else None
        p = d.passagem.get(aid) or {}
        passos = {s["passo"]: s["data"] for s in p.get("passos", [])}
        if campo == "generalidade":
            vs = d.votos_generalidade(aid)
            return vs[0]["voto"].get("data") if vs else None
        if campo == "veto":
            ev = [e for e in p.get("eventos") or [] if e.get("tipo") == "veto"]
            if not ev:
                ev = [e for e in self._quem(aid).get("eventos") or [] if e.get("tipo") == "veto"]
            return ev[0].get("data") if ev else None
        q = self._quem(aid)
        if campo == "promulgacao":
            return (q.get("presidente") or {}).get("d_promulgacao") or passos.get("promulgacao")
        if campo == "vfg":
            v = (p.get("vfg") or {}).get("data") if isinstance(p.get("vfg"), dict) else None
            return v or (q.get("vfg") or {}).get("data") or passos.get("votacao-final")
        return q.get("d_cm")

    def resolver(self, esq: str, alvo: str, texto: str) -> dict:
        """A site link -> {href, texto | partes, ato?}. Raises Erro."""
        d = self.d
        if esq == "ato":
            aid, _, ir = alvo.partition("#")
            aid, a = d.ato(aid)
            if ir == "generalidade" and not d.generalidade(aid):
                raise Erro(f"«{aid}» não tem votação na generalidade")
            auto = self._nome_ato(aid, a)
            self.mencionados.add(aid)
            return {"href": f"#/ato/{aid}" + ("?ir=generalidade" if ir else ""), "texto": texto or auto, "ato": aid,
                    "designacao": a.get("designacao")}
        if esq in ("artigo", "mudou", "origem"):
            base, _, red = alvo.partition("@")
            slug, _, artigo = base.partition("/")
            art = self._art(slug, artigo)
            self._citar(base)
            rot = self._rotulo_artigo(slug, art)
            if esq == "artigo":
                if not red:
                    return {"href": f"#/d/{slug}/{artigo}", "texto": texto or rot}
                i = self._indice(art, red, alvo)
                self._pinar(slug, artigo, art, i)
                return {"href": f"#/d/{slug}/{artigo}?redacao={chave_redacao(art, i)}", "texto": texto or rot}
            if esq == "origem":
                i = self._indice(art, red, alvo)
                self._pinar(slug, artigo, art, i)
                return {"href": f"#/d/{slug}/{artigo}?redacao={chave_redacao(art, i)}&ver=origem",
                        "texto": texto or "a origem do texto do " + rot}
            r1, _, r2 = red.partition("..")
            if not r2:
                r1, r2 = None, r1
            j = self._indice(art, r2, alvo)
            if j == 0 and r1 is None:
                raise Erro(f"«{alvo}»: é a primeira redação, não há uma anterior para comparar")
            i = self._indice(art, r1, alvo) if r1 else j - 1
            self._pinar(slug, artigo, art, i)
            self._pinar(slug, artigo, art, j)
            href = f"#/d/{slug}/{artigo}?redacao={chave_redacao(art, j)}&ver=mudou"
            if i != j - 1:
                href += f"&com={chave_redacao(art, i)}"
            return {"href": href, "texto": texto or "o que mudou no " + rot}
        if esq == "iniciativa":
            ini = d.iniciativas.get(alvo)
            if ini:
                des = ini.get("designacao") or f"{ini['tipo']} n.º {ini['numero']}/{ini['legislatura']}"
            else:
                pen = (d.pendentes.get("iniciativas") or {}).get(alvo)
                if not pen:
                    for p in d.passagem.values():
                        for x in p.get("iniciativas", []):
                            if x["id"] == alvo:
                                pen = x
                if not pen:
                    raise Erro(f"iniciativa desconhecida «{alvo}»")
                des = pen["designacao"]
            return {"href": f"#/iniciativa/{alvo}", "texto": texto or des, "designacao": des}
        if esq == "grupo":
            g = (d.governos.get("grupos") or {}).get(alvo)
            if not g:
                raise Erro(f"grupo parlamentar desconhecido «{alvo}»")
            nome = (g.get("nomes") or [{}])[-1].get("nome") or alvo
            return {"href": f"#/grupo/{alvo}" + (f"?diploma={self.primeiro}" if self.primeiro else ""), "texto": texto or nome}
        if esq == "diploma":
            dip = d.diplomas_index.get(alvo) or d.diploma(alvo)
            if not dip:
                raise Erro(f"diploma desconhecido «{alvo}»")
            return {"href": f"#/d/{alvo}", "texto": texto or dip.get("titulo", alvo)}
        if esq == "quem":
            slug, _, ir = alvo.partition("#")
            if not (d.diplomas_index.get(slug) or d.diploma(slug)):
                raise Erro(f"diploma desconhecido «{slug}»")
            if d.quem_diploma(slug) is None:
                raise Erro(f"falta quem/{slug}.json", falta=f"quem/{slug}.json")
            if ir.startswith("governo-") and not d.governo(int(ir[8:])):
                raise Erro(f"Governo desconhecido «{ir}»")
            return {"href": f"#/quem/{slug}" + (f"?ir={ir}" if ir else ""), "texto": texto or "quem fez cada alteração"}
        if esq == "governo":
            if alvo.isdigit():
                n = int(alvo)
            else:
                aid, _ = d.ato(alvo)
                n = self._numero_governo(aid)
                if n is None:
                    raise Erro(f"«{aid}» não tem Governo nos dados")
            if not d.governo(n):
                raise Erro(f"Governo desconhecido «{n}»")
            href = f"#/quem/{self.primeiro}?ir=governo-{n}"
            return {"href": href, "texto": texto} if texto else {"href": href, "partes": [{"t": "governo", "numero": n}]}
        if esq == "presidente":
            aid, _ = d.ato(alvo)
            pr = self._quem(aid).get("presidente") or {}
            row = next((x for x in d.governos.get("presidentes", []) if x.get("id") == pr.get("id")), None)
            nome = (row or {}).get("nome") or pr.get("nome")
            if not nome:
                raise Erro(f"«{aid}» não tem Presidente da República nos dados")
            return {"href": f"#/ato/{aid}", "texto": texto or nome, "ato": aid}
        if esq == "data":
            aid, _, campo = alvo.rpartition(".")
            aid, a = d.ato(aid)
            valor = self._data_ato(aid, a, campo)
            if not valor:
                raise Erro(f"«{aid}» não tem a data «{campo}»")
            return {"href": f"#/ato/{aid}", "texto": texto or data_extenso(valor), "ato": aid}
        if esq == "historia":
            if alvo != self.slug and alvo not in self.outras:
                raise Erro(f"história desconhecida «{alvo}»")
            return {"href": f"#/historia/{alvo}", "texto": texto or self.outras.get(alvo) or self.f.fm.get("titulo", alvo)}
        if esq == "fig":
            b = self.figuras.get(alvo)
            if not b:
                raise Erro(f"não há figura «{alvo}»")
            return {"href": f"#/historia/{self.slug}?ir=fig-{alvo}", "texto": texto or f"figura {b['n']}"}
        raise Erro(f"esquema desconhecido «{esq}»")

    def partes(self, toks: list, linha: int, fig: str | None = None) -> list:
        """Inline tokens -> the partes the app renders. Links resolve; errors go to self.erros."""
        out: list = []

        def add(x):
            if isinstance(x, str) and out and isinstance(out[-1], str):
                out[-1] += x
            elif x:
                out.append(x)
        for t in toks:
            if isinstance(t, str):
                add(t)
            elif t["t"] == "em":
                add({"t": "em", "texto": t["texto"]})
            elif t["t"] == "nota":
                if t["id"] in self.f.notas:
                    if t["id"] not in self.notas_ordem:
                        self.notas_ordem.append(t["id"])
                    add({"t": "nota", "n": self.notas_ordem.index(t["id"]) + 1, "id": t["id"]})
            elif t["esquema"] not in ESQUEMAS or not re.fullmatch(ALVOS[t["esquema"]], t["alvo"]):
                add(t["texto"] or t["alvo"])   # F2 already reported it
            else:
                try:
                    r = self.resolver(t["esquema"], t["alvo"], t["texto"])
                except Erro as e:
                    if e.falta and self.parcial:
                        self.aviso(linha, e.regra, f"{e} (parcial)")
                    else:
                        self.erro(linha, e.regra, f"«{t['bruto']}»: {e}", fig)
                    add(t["texto"] or t["alvo"])
                    continue
                t["resolvido"] = r.get("texto") or ("XX Governo Constitucional" if r.get("partes") else "")
                t["r"] = r
                seg = {"href": r["href"]}
                if r.get("partes"):
                    seg["partes"] = r["partes"]
                else:
                    seg["texto"] = r["texto"]
                add(seg)
        return out

    # --- data: prose checks (R3, R4, R5) -----------------------------------------------------------
    def _r3(self, toks: list, linha: int):
        for k, t in enumerate(toks):
            if not (isinstance(t, dict) and t.get("r")):
                continue
            r = t["r"]
            if t["texto"] and r.get("designacao"):
                m = DESIGNACAO.search(t["texto"])
                des = re.sub(r"^[IVXLC]+,\s*", "", r["designacao"])
                if m and m.group(0) != des and not des.startswith(m.group(0) + "/"):
                    self.erro(linha, "R3", f"o texto «{t['texto']}» não é a designação de «{t['alvo']}» ({des})")
            if t["esquema"] == "ato" and k + 1 < len(toks) and isinstance(toks[k + 1], str):
                m = re.match(r"^, de (\d{1,2}) de (" + "|".join(MESES) + r")(?: de (\d{4}))?", toks[k + 1])
                pub = self.d.atos[r["ato"]].get("publicacao") or ""
                if m and pub:
                    a, mm, dd = pub.split("-")
                    if int(m.group(1)) != int(dd) or MESES.index(m.group(2)) + 1 != int(mm) or (m.group(3) and m.group(3) != a):
                        self.erro(linha, "R3", f"«{m.group(0)[2:]}» depois de «{t['alvo']}»: a publicação é {data_extenso(pub)}")

    def _r4(self, toks: list, linha: int, ligados: set[str]):
        des = self.d.designacoes()
        for t in toks:
            if isinstance(t, dict) and t.get("r") and t["r"].get("ato"):
                ligados.add(t["r"]["ato"])
            if isinstance(t, str):
                for m in DESIG_ATO.finditer(re.sub(r"«[^»]*»", " ", t)):
                    aid = des.get(m.group(0))
                    if aid and aid not in ligados:
                        self.erro(linha, "R4", f"primeira menção de «{m.group(0)}» sem ligação: escreva [{m.group(0)}](ato:{aid})")
                        ligados.add(aid)

    def _grupos_frase(self, plano: str) -> set[str]:
        out = set()
        for s in sorted(self.d.siglas | set(estilo.SIGLAS)):
            if re.search(rf"(?<![\w/-]){re.escape(s)}(?![\w/-])", plano):
                out.add(s)
        for nome, ss in self.d.nomes_grupo.items():
            if len(nome) > 3 and re.search(rf"(?<![\w-]){re.escape(nome)}(?![\w-])", plano):
                out |= ss
        return out

    def _r5(self, toks: list, linha: int, ultimo_ato: list):
        for fr in frases(toks):
            atos = [t["r"]["ato"] for t in fr if isinstance(t, dict) and t.get("r") and t["r"].get("ato")]
            plano = re.sub(r"«[^»]*»", " ", texto_simples(fr))
            low = plano.lower()
            sentidos = {s for s, pat in SENTIDOS_FRASE if re.search(pat, low)}
            grupos = self._grupos_frase(plano) if sentidos else set()
            if atos:
                ultimo_ato[0] = atos[-1]
            if not sentidos or not grupos:
                continue
            nota = any(isinstance(t, dict) and t["t"] == "nota" for t in fr)
            if any(f in low for f in FASES_SEM_GRUPOS):
                if not nota:
                    self.erro(linha, "R5", f"voto na {next(f for f in FASES_SEM_GRUPOS if f in low)} sem nota: os dados do site só têm o voto de cada grupo na generalidade: «{cortar(plano, 70)}»")
                continue
            aid = atos[-1] if atos else ultimo_ato[0]
            if not aid or len(sentidos) > 1:
                self.aviso(linha, "R5", f"confirme com a figura: «{cortar(plano, 70)}»")
                continue
            s = sentidos.pop()
            votos = [x["voto"] for x in self.d.votos_generalidade(aid)]
            if not votos:
                if not nota:
                    self.aviso(linha, "R5", f"«{aid}» sem votação na generalidade nos dados; confirme: «{cortar(plano, 70)}»")
                continue
            for g in sorted(grupos):
                if not any((v.get("grupos") or {}).get(g) == s or (v.get("unanime") and s == "favor") for v in votos):
                    reais = sorted({(v.get("grupos") or {}).get(g) or "sem voto" for v in votos})
                    self.erro(linha, "R5", f"«{g}» e «{s}» na mesma frase, mas na generalidade de «{aid}» o voto do {g} é: {', '.join(reais)}")

    # --- data: figures ----------------------------------------------------------------------------
    def figura(self, b: dict) -> dict:
        p, tipo, fid = b["params"], b["tipo"], b["id"]
        self.fig_atual = fid
        larg = p.get("largura") or "texto"
        out = {"t": "figura", "n": b["n"], "id": fid, "tipo": tipo, "largura": larg, "titulo": p.get("titulo") or None,
               "sub": None, "legenda": [], "fonte": FONTE_FIG.get(tipo), "href": None, "params": {}, "retida": None,
               "aviso": None}
        try:
            getattr(self, "_fig_" + tipo)(p, out, b)
        except Erro as e:
            if e.falta and self.parcial:
                self.aviso(b["linha"], e.regra, f"figura «{fid}»: {e} (parcial)")
            else:
                self.erro(b["linha"], "R2" if e.regra == "R1" else e.regra, f"figura «{fid}»: {e}", fid)
        out["legenda"] = self.partes(tokens_inline(p.get("legenda") or ""), b["plinha"].get("legenda", b["linha"]), fid)
        self.fig_atual = None
        if out["href"] is None:
            # A figure that did not resolve keeps a link to the full view, from its own parameters.
            if p.get("artigo"):
                out["href"] = "#/d/" + p["artigo"]
            elif p.get("ato"):
                out["href"] = "#/ato/" + self.d.aliases.get(p["ato"], p["ato"])
            elif p.get("diploma"):
                out["href"] = "#/quem/" + p["diploma"]
            elif tipo == "imagem" and str(p.get("fonte", "")).startswith("https://"):
                out["href"] = p["fonte"]
        if out["titulo"] is None:
            out["titulo"] = "Figura em revisão"
        return out

    def _fig_diff(self, p: dict, out: dict, b: dict):
        slug, _, artigo = p["artigo"].partition("/")
        art = self._art(slug, artigo)
        self._citar(p["artigo"])
        j = self._indice(art, p["para"], p["artigo"])
        if p.get("de"):
            i = self._indice(art, p["de"], p["artigo"])
        elif j == 0:
            raise Erro("«para» é a primeira redação: escreva «de»")
        else:
            i = j - 1
        if i >= j:
            raise Erro("«de» tem de ser uma redação anterior a «para»")
        self._pinar(slug, artigo, art, i)
        self._pinar(slug, artigo, art, j)
        ta, tb = texto_versao(art["versoes"][i]), texto_versao(art["versoes"][j])
        sel = ler_mostrar(p["mostrar"]) if p.get("mostrar") else None
        ra, rb = rotulos_linhas(ta), rotulos_linhas(tb)
        if sel:
            for s in sel:
                if not any(n == s["n"] and (s["al"] is None or al == s["al"]) for n, al, _ in rb + ra):
                    raise Erro(f"mostrar: «{(s['n'] + '/' + s['al']) if s['al'] else s['n']}» não existe nesta redação", regra="R2")
            ka = {l for l, ok in zip([x[2] for x in ra], selecionadas(ra, sel)) if ok}
            kb = {l for l, ok in zip([x[2] for x in rb], selecionadas(rb, sel)) if ok}
            if ka == kb:
                raise Erro("a seleção de «mostrar» não tem nenhuma linha que mudou", regra="R2")
        elif ta == tb:
            raise Erro("as duas redações têm o mesmo texto", regra="R2")
        da, db = self.d.atos.get(art["versoes"][i]["ato"], {}), self.d.atos.get(art["versoes"][j]["ato"], {})
        des_a = da.get("designacao") or art["versoes"][i]["ato"]
        des_b = db.get("designacao") or art["versoes"][j]["ato"]
        if art["versoes"][i].get("tipo") == "original":
            des_a += " (texto original)"
        dip = self.d.diplomas_index.get(slug) or self.d.diploma(slug) or {}
        rot = art.get("rotulo", artigo)
        out["titulo"] = out["titulo"] or f"{rot} {dip.get('genitivo') or 'de ' + dip.get('titulo', slug)}: antes e depois {da_de(des_b)} {des_b}"
        onde = self._onde(sel)
        out["sub"] = (onde + " · " if onde else "") + f"{i + 1}.ª redação ({des_a}) → {j + 1}.ª redação ({des_b})"
        out["href"] = f"#/d/{slug}/{artigo}?redacao={chave_redacao(art, j)}&ver=mudou" + (f"&com={chave_redacao(art, i)}" if i != j - 1 else "")
        out["params"] = {"diploma": slug, "artigo": artigo, "de_i": i, "para_i": j, "de": chave_redacao(art, i),
                         "para": chave_redacao(art, j), "mostrar": sel, "vista": p.get("vista") or "texto",
                         "de_nome": des_a, "para_nome": des_b, "rotulo": rot}

    @staticmethod
    def _onde(sel: list[dict] | None) -> str:
        if not sel:
            return ""
        nums: dict[str, list] = {}
        for s in sel:
            nums.setdefault(s["n"], []).append(s["al"])
        partes = []
        for n, als in nums.items():
            als = [a for a in als if a]
            t = f"N.º {n}" if n else ""
            if als:
                t += (", " if t else "") + ("alínea " if len(als) == 1 else "alíneas ") + juntar([a + ")" for a in als])
            partes.append(t)
        s = "; ".join(partes)
        return s[0].upper() + s[1:] if s else s

    def _fig_origem(self, p: dict, out: dict, b: dict):
        slug, _, artigo = p["artigo"].partition("/")
        art = self._art(slug, artigo)
        self._citar(p["artigo"])
        i = self._indice(art, p["redacao"], p["artigo"])
        self._pinar(slug, artigo, art, i)
        foco = None
        if p.get("destacar"):
            a = self.d.aliases.get(p["destacar"], p["destacar"])
            vs = [k for k in versoes_do_ato(art, a) if k <= i]
            if not vs:
                raise Erro(f"destacar: «{p['destacar']}» não escreveu nenhuma redação deste artigo até esta", regra="R2")
            usados = {o for linha in art["versoes"][i].get("linhas") or [] for o, _ in linha}
            if not usados & set(vs):
                raise Erro(f"destacar: nenhuma palavra desta redação vem de «{p['destacar']}»", regra="R2")
            foco = max(usados & set(vs))
        sel = ler_mostrar(p["mostrar"]) if p.get("mostrar") else None
        if sel:
            r = rotulos_linhas(texto_versao(art["versoes"][i]))
            for s in sel:
                if not any(n == s["n"] and (s["al"] is None or al == s["al"]) for n, al, _ in r):
                    raise Erro(f"mostrar: «{(s['n'] + '/' + s['al']) if s['al'] else s['n']}» não existe nesta redação", regra="R2")
        a = self.d.atos.get(art["versoes"][i]["ato"], {})
        des = a.get("designacao") or art["versoes"][i]["ato"]
        if art["versoes"][i].get("tipo") == "original":
            des += " (texto original)"
        dip = self.d.diplomas_index.get(slug) or self.d.diploma(slug) or {}
        rot = art.get("rotulo", artigo).replace("Artigo", "artigo", 1)
        out["titulo"] = out["titulo"] or f"Quem escreveu o {rot} {dip.get('genitivo') or 'de ' + dip.get('titulo', slug)}, na redação {da_de(des)} {des}"
        onde = self._onde(sel)
        out["sub"] = (onde + " · " if onde else "") + f"{i + 1}.ª redação"
        out["href"] = f"#/d/{slug}/{artigo}?redacao={chave_redacao(art, i)}&ver=origem"
        out["params"] = {"diploma": slug, "artigo": artigo, "redacao_i": i, "redacao": chave_redacao(art, i),
                         "mostrar": sel, "destacar_i": foco, "nome_original": None}

    def _hash_votos(self, aid: str) -> str:
        p = self.d.passagem.get(aid) or {}
        return hash_texto(json.dumps({"itens": [x["voto"] for x in self.d.votos_generalidade(aid)], "vfg": p.get("vfg"),
                                      "eventos": p.get("eventos")}, sort_keys=True, ensure_ascii=False))

    def _pinar_votos(self, aid: str, fid: str):
        self.votos[aid] = self._hash_votos(aid)
        self.votos_fig.setdefault(aid, set()).add(fid)

    def _fig_votacao(self, p: dict, out: dict, b: dict):
        aid, a = self.d.ato(p["ato"])
        itens = self.d.votos_generalidade(aid)
        if not itens:
            raise Erro(f"«{aid}» não tem votação na generalidade nos dados", regra="R2")
        item = p.get("item")
        if item:
            itens = [x for x in itens if (item == "comissao" and x.get("comissao")) or x.get("iniciativa") == item]
            if not itens:
                raise Erro(f"item «{item}» não está na votação na generalidade de «{aid}»", regra="R2")
        self._pinar_votos(aid, b["id"])
        inis = [x for x in itens if x.get("iniciativa")]
        if not item and len(inis) > 1:
            out["largura"] = "larga"
        v = itens[0]["voto"]
        if len(itens) == 1:
            out["titulo"] = out["titulo"] or f"Votação na generalidade: {itens[0]['titulo']}, {data_extenso(v.get('data'))}"
            q = (self.d.quem or {}).get(aid) or {}
            tc = (q.get("texto_comissao") or {}).get("iniciativas")
            sub = data_extenso(v.get("data"))
            if itens[0].get("comissao") and tc:
                sub += " · Junta " + juntar([("a " if feminino(x.get("designacao", "")) else "o ") + x.get("designacao", "") for x in tc])
            out["sub"] = sub
        else:
            out["titulo"] = out["titulo"] or f"Votação na generalidade: as iniciativas {da_de(a.get('designacao', aid))} {a.get('designacao', aid)}"
            out["sub"] = f"{len(itens)} votações"
        out["href"] = f"#/ato/{aid}?ir=generalidade"
        out["params"] = {"ato": aid, "item": item or None}

    def _fig_ficha(self, p: dict, out: dict, b: dict):
        aid, a = self.d.ato(p["ato"])
        if self.d.quem is None:
            raise Erro("falta quem.json", falta="quem.json")
        campos = [x.strip() for x in (p.get("campos") or "").split(",") if x.strip()] or None
        if aid in self.d.passagem:
            self._pinar_votos(aid, b["id"])
        out["titulo"] = out["titulo"] or f"{a.get('designacao', aid)}: quem {'o' if not feminino(a.get('designacao', '')) else 'a'} fez"
        out["href"] = f"#/ato/{aid}"
        out["params"] = {"ato": aid, "campos": campos}

    def _fig_imagem(self, p: dict, out: dict, b: dict):
        out["fonte"] = f"{p['credito']}. Licença: {p['licenca']}."
        out["href"] = p["fonte"]
        out["params"] = {"arquivo": "historias/" + p["arquivo"], "alt": p["alt"], "credito": p["credito"],
                         "licenca": p["licenca"]}

    def _fig_cronologia(self, p: dict, out: dict, b: dict):
        slug = p["diploma"]
        dip = self.d.diplomas_index.get(slug) or self.d.diploma(slug)
        if not dip:
            raise Erro(f"diploma desconhecido «{slug}»")
        qd = self.d.quem_diploma(slug)
        if qd is None:
            raise Erro(f"falta quem/{slug}.json", falta=f"quem/{slug}.json")
        por = p.get("por") or "governo"
        desde = p.get("desde") or qd.get("desde") or "0000-00-00"
        ate = p.get("ate") or "9999-12-31"
        filtro = None
        if p.get("artigos"):
            arts = p["artigos"]
            if ".." in arts:
                lo, hi = [num_artigo("artigo-" + x.strip().lower())[0] for x in arts.split("..")]
                filtro = lambda a: lo <= num_artigo(a)[0] <= hi  # noqa: E731
            else:
                lista = {"artigo-" + x.strip().lower() for x in arts.split(",")}
                filtro = lambda a: a in lista  # noqa: E731
        COMO = {"decretos_leis": "Decreto-lei", "propostas": "Proposta do Governo", "publicados_sem_d_cm": "Decreto-lei",
                "revisoes": "Revisão da Constituição", "acordaos": "Acórdão do Tribunal Constitucional",
                "antes_1976": "Antes da Constituição de 1976", "retificacoes_soltas": "Declaração de retificação",
                "outros": "Outro diploma"}
        linhas, vistos = [], set()
        copia = self.d.inicio_copia(slug) is not None   # R-7: the annexed copy of another diploma does not count

        def como(aid: str, lista: str) -> str:
            if lista != "outras":
                return COMO.get(lista, "Outro diploma")
            q = (self.d.quem or {}).get(aid) or {}
            tc = q.get("texto_comissao")
            if tc and tc.get("n_iniciativas"):
                n = tc["n_iniciativas"]
                return "Texto da comissão: " + (f"{n} iniciativas" if n > 1 else "1 iniciativa")
            gs, gov, n_proj = [], False, 0
            for x in q.get("proponentes") or []:
                if x.get("tipo") == "governo":
                    gov = True
                    continue
                n_proj += 1
                for g in x.get("grupos") or []:
                    if g.get("sigla") and g["sigla"] not in gs:
                        gs.append(g["sigla"])
            partes = ["proposta do Governo"] if gov else []
            if n_proj:
                partes.append(("projeto de lei" if n_proj == 1 else "projetos de lei") + (" (" + ", ".join(gs) + ")" if gs else ""))
            t = juntar(partes) or "iniciativa de deputados"
            return t[0].upper() + t[1:]

        def add(aid: str, lista: str, grupo):
            aid = self.d.aliases.get(aid, aid)
            if aid in vistos or aid not in self.d.atos:
                return
            a = self.d.atos[aid]
            alts = [x for x in a.get("alteracoes", []) if x.get("diploma") == slug and x.get("tipo") != "sem_alteracao"
                    and not (copia and self.d.e_copia(slug, x.get("artigo", "")))]
            if copia and not alts:
                return
            if filtro:
                alts = [x for x in alts if filtro(x.get("artigo", ""))]
                if not alts:
                    return
            dia = a.get("publicacao") or ""
            if not (desde <= dia <= ate):
                return
            vistos.add(aid)
            linhas.append({"ato": aid, "data": dia, "grupo": grupo, "como": como(aid, lista),
                           "n": len({x.get("artigo") for x in alts})})
        chave = "por_governo" if por == "governo" else "por_legislatura"
        for row in qd.get(chave) or []:
            grupo = row.get("governo") if por == "governo" else row.get("legislatura")
            for lista, xs in (row.get("listas") or {}).items():
                for x in xs:
                    add(x["ato"] if isinstance(x, dict) else x, lista, grupo)
        for lista, xs in (qd.get("fora") or {}).items():
            for x in xs:
                aid = x["ato"] if isinstance(x, dict) else x
                dia = (self.d.atos.get(self.d.aliases.get(aid, aid)) or {}).get("publicacao") or ""
                grupo = self.d.governo_em(dia) if por == "governo" else next(
                    (l["sigla"] for l in self.d.governos.get("legislaturas", []) if l.get("inicio", "") <= dia and (not l.get("fim") or dia < l["fim"])), None)
                add(aid, lista, grupo)
        linhas.sort(key=lambda x: (x["data"], x["ato"]))
        if not linhas:
            raise Erro("nenhum ato neste período e nestes artigos", regra="R2")
        marcar = [self.d.aliases.get(x.strip(), x.strip()) for x in (p.get("marcar") or "").split(",") if x.strip()]
        for m in marcar:
            if m not in vistos:
                raise Erro(f"marcar: «{m}» não está na cronologia", regra="R2")
        for x in linhas:
            x["marcado"] = x["ato"] in marcar
        grupos = []
        for x in linhas:
            if x["grupo"] not in grupos:
                grupos.append(x["grupo"])
        inicio = p.get("desde") or qd.get("desde") or linhas[0]["data"]
        anos = (inicio[:4], (p.get("ate") or hoje())[:4])
        gen = dip.get("genitivo") or ("de " + dip.get("titulo", slug))
        alvo = re.sub(r"^d([ao]s?) ", lambda m: {"a": "à ", "o": "ao ", "as": "às ", "os": "aos "}[m.group(1)], gen)
        out["titulo"] = out["titulo"] or f"As alterações {alvo}, por {'Governo' if por == 'governo' else 'legislatura'}, {anos[0]}–{anos[1]}"
        ng = len([g for g in grupos if g is not None])
        out["sub"] = f"{len(linhas)} {'ato' if len(linhas) == 1 else 'atos'} · {ng} " + (
            ("Governo" if ng == 1 else "Governos") if por == "governo" else ("legislatura" if ng == 1 else "legislaturas"))
        out["href"] = f"#/quem/{slug}" + ("?por=legislatura" if por == "legislatura" else "")
        out["params"] = {"diploma": slug, "por": por, "desde": inicio, "ate": p.get("ate") or None,
                         "atos": linhas, "marcar": marcar}

    # --- the whole story --------------------------------------------------------------------------
    def compilar(self) -> dict | None:
        self.sintaxe()
        if self.d is None:
            return None
        f, fm = self.f, self.f.fm
        for s in self.diplomas:
            if not (self.d.diplomas_index.get(s) or self.d.diploma(s)):
                self.erro(f.fm_linha.get("diplomas", 1), "R1", f"diploma desconhecido «{s}»")
        n = 0
        for b in f.blocos:
            if b["t"] == "figura":
                n += 1
                b["n"] = n
        self.notas_ordem = []
        self.mencionados = set()
        blocos: list[dict] = []
        ligados: set[str] = set()
        prosa = []
        for b in f.blocos:
            if b["t"] == "p":
                toks = tokens_inline(b["texto"])
                partes = self.partes(toks, b["linha"])
                self._r3(toks, b["linha"])
                self._r4(toks, b["linha"], ligados)
                self._r5(toks, b["linha"], [None])
                prosa.append(texto_simples(toks))
                blocos.append({"t": "p", "partes": partes})
            elif b["t"] in ("h2", "h3"):
                self.seccao_atual = b["id"]
                toks = tokens_inline(b["texto"])
                blocos.append({"t": b["t"], "id": b["id"], "texto": texto_simples(toks)})
            elif b["t"] == "citacao":
                toks, autor = tokens_inline(b["texto"]), tokens_inline(b["autor"])
                blocos.append({"t": "citacao", "partes": self.partes(toks, b["linha"]), "autor": self.partes(autor, b["linha"])})
                prosa.append(b["texto"])
            elif b["t"] == "figura" and b["tipo"] in FIGURAS:
                blocos.append(self.figura(b))
        # Notes, numbered by first use; site links inside them resolve here.
        notas = []
        consultado = fm.get("consultado")
        for k, nid in enumerate(self.notas_ordem):
            nd = f.notas[nid]
            texto = nd["texto"]
            urls = []
            for m in re.finditer(r"(https?://[^\s)»]+)(\s*\(consultado a (\d{4}-\d{2}-\d{2})\))?", texto):
                u = m.group(1).rstrip(".,;")
                urls.append({"href": u, "host": urlparse(u).netloc.lower(), "consultado": m.group(3) or consultado})
            limpo = re.sub(r"\s*https?://[^\s)»]+(\s*\(consultado a \d{4}-\d{2}-\d{2}\))?", "", texto).strip()
            notas.append({"n": k + 1, "id": nid, "partes": self.partes(tokens_inline(limpo), nd["linha"]), "urls": urls})
        relacionadas = []
        for r in [x.strip() for x in (fm.get("relacionadas") or "").split(",") if x.strip()]:
            esq, _, alvo = r.partition(":")
            try:
                rr = self.resolver(esq, alvo, "")
            except Erro as e:
                if e.falta and self.parcial:
                    self.aviso(f.fm_linha.get("relacionadas", 1), "R1", f"relacionada «{r}»: {e} (parcial)")
                else:
                    self.erro(f.fm_linha.get("relacionadas", 1), "R1", f"relacionada «{r}»: {e}")
                continue
            texto = rr.get("texto") or ""
            if esq == "quem":
                dip = self.d.diplomas_index.get(alvo.partition("#")[0]) or {}
                texto = "Quem fez cada alteração " + (dip.get("genitivo") or "")
            elif esq == "historia":
                texto = "História: " + texto
            relacionadas.append({"texto": texto.strip(), "href": rr["href"]})
        # Staleness against the lock (S1–S3).
        desat = self._estado(blocos)
        self.palavras = sum(palavras(x) for x in prosa)
        nfig = sum(1 for b in blocos if b["t"] == "figura")
        rev = None
        if fm.get("revisao_externa"):
            nome, _, dia = fm["revisao_externa"].rpartition(",")
            rev = {"por": nome.strip(), "em": dia.strip()}
        data = fm.get("data") or hoje()
        atualizado = (self.lock or {}).get("atualizado") or data
        aviso = AVISO.format(data=data_extenso(data), revisao=(f"Revisão jurídica externa: {rev['por']}, {data_extenso(rev['em'])}."
                                                               if rev else SEM_REVISAO))
        self.retida_inteira = any(fg is None for fg, _ in self.erros)
        for b in blocos:
            if b["t"] == "figura" and any(fg == b["id"] for fg, _ in self.erros):
                b["retida"] = next(m for fg, m in self.erros if fg == b["id"])
                b["params"] = {}
                b["sub"] = None
        return {
            "slug": self.slug, "titulo": fm.get("titulo"), "resumo": fm.get("resumo"), "preparado_em": data,
            "atualizado_em": max(atualizado, data), "autoria": fm.get("autoria"), "preparacao": fm.get("preparacao", "assistida"),
            "revisao_externa": rev, "aviso": aviso, "diplomas": self.diplomas, "palavras": self.palavras,
            "minutos": max(1, round(self.palavras / 220) + nfig // 3), "imagem_partilha": fm.get("imagem_partilha") or None,
            "desatualizada": desat, "blocos": blocos, "notas": notas, "relacionadas": relacionadas,
        }

    def _estado(self, blocos: list[dict]) -> list[dict]:
        lock, d = self.lock, self.d
        desat: list[dict] = []
        if lock is None:
            if self.pinos or self.votos:
                self.aviso(1, "S3", f"sem {self.slug}.lock.json: corra --atualizar {self.slug} depois de rever as figuras")
            return desat
        figs = {b["id"]: b for b in blocos if b["t"] == "figura"}

        def marcar(ids, aviso):
            for fid in ids or ():
                if fid in figs and not figs[fid].get("aviso"):
                    figs[fid]["aviso"] = aviso
        for k, h in sorted(self.pinos.items()):
            guardado = (lock.get("redacoes") or {}).get(k)
            if guardado is None:
                self.aviso(1, "S3", f"{k} sem hash no lock: corra --atualizar {self.slug}")
            elif guardado != h:
                self.aviso(1, "S1", f"o texto de {k} mudou depois de {lock.get('atualizado')}")
                art_k, _, red = k.partition("@")
                if not any(x["artigo"] == art_k for x in desat):
                    desat.append({"artigo": art_k, "ato": red})
                marcar(self.pinos_fig.get(k), {"tipo": "texto", "ato": red, "href": "#/d/" + art_k})
        for k in sorted(self.citados):
            slug, _, artigo = k.partition("/")
            art = d.artigo(slug, artigo)
            if not art or not art.get("versoes"):
                continue
            ultima = chave_redacao(art, len(art["versoes"]) - 1)
            guardada = (lock.get("ultimas") or {}).get(k)
            novas = [v for v in art["versoes"] if (v.get("publicacao") or "") > (lock.get("atualizado") or "9999")]
            if (guardada and guardada != ultima) or (not guardada and novas):
                self.aviso(1, "S2", f"{k} tem uma redação nova: {ultima}")
                if not any(x["artigo"] == k for x in desat):
                    desat.append({"artigo": k, "ato": art["versoes"][-1]["ato"]})
                marcar(self.artigos_fig.get(k), {"tipo": "redacao", "ato": art["versoes"][-1]["ato"], "href": "#/d/" + k})
        for aid, h in sorted(self.votos.items()):
            guardado = (lock.get("votos") or {}).get(aid)
            if guardado is None:
                self.aviso(1, "S3", f"votos de {aid} sem hash no lock: corra --atualizar {self.slug}")
            elif guardado != h:
                self.aviso(1, "S1", f"os votos de {aid} mudaram depois de {lock.get('atualizado')}")
                marcar(self.votos_fig.get(aid), {"tipo": "votos", "ato": aid, "href": f"#/ato/{aid}?ir=generalidade"})
        return desat

    def ancoras(self) -> dict[str, str | None]:
        """"slug/artigo" -> the anchor an article page links to: the first figure that shows it, else the subhead."""
        return {k: self.citados_fig.get(k) or v for k, v in self.citados.items()}

    def lock_novo(self) -> dict:
        ultimas = {}
        for k in sorted(self.citados):
            slug, _, artigo = k.partition("/")
            art = self.d.artigo(slug, artigo)
            if art and art.get("versoes"):
                ultimas[k] = chave_redacao(art, len(art["versoes"]) - 1)
        return {"atualizado": hoje(), "redacoes": dict(sorted(self.pinos.items())), "ultimas": ultimas,
                "votos": dict(sorted(self.votos.items()))}


def feminino(des: str) -> bool:
    return not re.match(r"(Decreto|Acórdão|Despacho|Projeto|Texto|Aviso|Regulamento|Código|Assento)", des or "")


def da_de(des: str) -> str:
    return "da" if feminino(des) else "do"


# ---------------------------------------------------------------------------------------------
# Entry points


def fontes(pasta: str = FONTES) -> list[str]:
    """The story sources: <slug>.md, lower case (README.md is the writer's guide)."""
    return sorted(f for f in glob.glob(os.path.join(pasta, "*.md")) if re.fullmatch(r"[a-z0-9][a-z0-9-]*\.md", os.path.basename(f)))


def ler_lock(pasta: str, slug: str) -> dict | None:
    p = os.path.join(pasta, slug + ".lock.json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def compilar_ficheiro(caminho: str, dados: Dados | None, parcial: bool = False, outras: dict | None = None) -> tuple[Historia, dict | None]:
    pasta = os.path.dirname(os.path.abspath(caminho))
    fonte = ler_fonte(caminho)
    lock = ler_lock(pasta, fonte.nome)
    h = Historia(fonte, dados, parcial=parcial, pasta=pasta, outras=outras, lock=lock)
    comp = h.compilar()
    if lock is not None and VENDOR.search(json.dumps(lock, ensure_ascii=False)):
        h.erro(1, "P2", "nome de modelo ou de fornecedor no ficheiro lock")
    return h, comp


def entrada_index(comp: dict) -> dict:
    return {k: comp[k] for k in ("slug", "titulo", "resumo", "preparado_em", "atualizado_em", "preparacao",
                                 "revisao_externa", "aviso", "diplomas", "minutos", "imagem_partilha")}


def construir(out: str, estrito: bool, parcial: bool = False, pasta: str = FONTES,
              ficheiros: list[str] | None = None) -> tuple[dict, list[str], list[dict]]:
    """Compile every story into out/historias/. Returns (index, messages, rows for verificacao.conteudo).

    Strict: every E is an error message («aviso: …» for W). Lenient: a failing figure is withheld
    (`retida`), or the whole story when an error is outside a figure."""
    dados = Dados(out)
    msgs, linhas = [], []
    index = {"historias": [], "artigos": {}}
    destino = os.path.join(out, "historias")
    os.makedirs(destino, exist_ok=True)
    escritos = set()
    lista = ficheiros if ficheiros is not None else fontes(pasta)
    outras = {}
    for f in lista:
        fo = ler_fonte(f)
        outras[fo.fm.get("slug") or fo.nome] = fo.fm.get("titulo") or fo.nome
    imagens = set()
    for f in lista:
        h, comp = compilar_ficheiro(f, dados, parcial=parcial, outras=outras)
        slug = h.slug
        for fig, e in h.erros:
            msgs.append(f"história {e}")
            linhas.append({"tipo": "historia", "id": slug, "seccao": fig, "motivo": e})
        msgs.extend("aviso: história " + a for a in h.avisos)
        if comp is None or (h.retida_inteira and not estrito):
            continue
        with open(os.path.join(destino, slug + ".json"), "w", encoding="utf-8") as fh:
            json.dump(comp, fh, ensure_ascii=False, separators=(",", ":"))
        escritos.add(slug + ".json")
        # Static images: copied next to the data.
        src_pasta = os.path.dirname(os.path.abspath(f))
        for b in comp["blocos"]:
            if b["t"] == "figura" and b["tipo"] == "imagem" and not b["retida"] and b["params"].get("arquivo"):
                imagens.add((src_pasta, b["params"]["arquivo"][len("historias/"):]))
        if comp.get("imagem_partilha"):
            imagens.add((src_pasta, comp["imagem_partilha"]))
        index["historias"].append(entrada_index(comp))
        for k, sec in sorted(h.ancoras().items()):
            index["artigos"].setdefault(k, []).append({"historia": slug, "seccao": sec})
    img_dir = os.path.join(destino, "img")
    if os.path.isdir(img_dir):
        shutil.rmtree(img_dir)
    for src_pasta, rel in sorted(imagens):
        p = os.path.join(src_pasta, rel)
        if os.path.exists(p):
            os.makedirs(os.path.dirname(os.path.join(destino, rel)), exist_ok=True)
            shutil.copyfile(p, os.path.join(destino, rel))
    for velho in glob.glob(os.path.join(destino, "*.json")):
        if os.path.basename(velho) not in escritos | {"index.json"}:
            os.remove(velho)
    with open(os.path.join(destino, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    return index, msgs, linhas


def sintaxe(ficheiros: list[str]) -> tuple[list[str], list[str]]:
    """The data-free checks of each file: (errors, warnings)."""
    erros, avisos = [], []
    outras = {}
    for f in ficheiros:
        fo = ler_fonte(f)
        outras[fo.fm.get("slug") or fo.nome] = fo.fm.get("titulo") or fo.nome
    for f in ficheiros:
        h, _ = compilar_ficheiro(f, None, outras=outras)
        erros += [e for _, e in h.erros]
        avisos += h.avisos
    return erros, avisos


def atualizar(slug: str, out: str, pasta: str = FONTES) -> int:
    """Write <slug>.lock.json after a person re-read the figures. Refuses on any error."""
    caminho = os.path.join(pasta, slug + ".md")
    outras = {ler_fonte(f).nome: "" for f in fontes(pasta)}
    fonte = ler_fonte(caminho)
    h = Historia(fonte, Dados(out), parcial=False, pasta=pasta, outras=outras, lock=None)
    h.compilar()
    if h.erros:
        print("\n".join(e for _, e in h.erros))
        print("Corrija os erros antes de atualizar.")
        return 1
    lock = h.lock_novo()
    with open(os.path.join(pasta, slug + ".lock.json"), "w", encoding="utf-8") as f:
        json.dump(lock, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{slug}: {len(lock['redacoes'])} redações, {len(lock['ultimas'])} artigos, {len(lock['votos'])} votações; "
          f"atualizado a {lock['atualizado']}. {h.palavras} palavras.")
    return 0


def _pasta_temporaria(out: str, tmp: str):
    """A temp dir of symlinks to app/data, so checks never write into it."""
    for n in os.listdir(out):
        if n.endswith(".json") or n in ("d", "quem", "grupos"):
            os.symlink(os.path.join(out, n), os.path.join(tmp, n))


def ordem_msg(m: str) -> tuple:
    """Sort messages by file and line."""
    x = re.search(r"([\w-]+)\.md:(\d+):", m)
    return (x.group(1), int(x.group(2))) if x else ("", 0)


def main(argv: list[str]) -> int:
    out = os.path.join(ROOT, "app", "data")
    ficheiros = [a for a in argv if a.endswith(".md")]
    if len(argv) == 2 and argv[0] == "--atualizar":
        return atualizar(argv[1], out)
    if "--sintaxe" in argv:
        lista = ficheiros or fontes()
        erros, avisos = sintaxe(lista)
        for m in sorted([(e, "") for e in erros] + [(a, "aviso: ") for a in avisos], key=lambda x: ordem_msg(x[0])):
            print(m[1] + m[0])
        print(f"{len(lista)} histórias, {len(erros)} erro(s), {len(avisos)} aviso(s) (só sintaxe, sem app/data).")
        return 1 if erros else 0
    if not os.path.isdir(out):
        print("Falta app/data: corra pipeline/build.py, ou use --sintaxe.")
        return 2
    if "--exemplo" in argv:
        # The fixture story, against the real data, written into app/data (not in the index).
        os.makedirs(os.path.join(out, "historias"), exist_ok=True)
        h, comp = compilar_ficheiro(EXEMPLO, Dados(out), parcial="--parcial" in argv)
        for _, e in h.erros:
            print(e)
        for a in h.avisos:
            print("aviso: " + a)
        if comp:
            with open(os.path.join(out, "historias", comp["slug"] + ".json"), "w", encoding="utf-8") as fh:
                json.dump(comp, fh, ensure_ascii=False, separators=(",", ":"))
            pasta = os.path.dirname(EXEMPLO)
            for b in comp["blocos"]:
                if b["t"] == "figura" and b["tipo"] == "imagem" and b["params"].get("arquivo"):
                    rel = b["params"]["arquivo"][len("historias/"):]
                    os.makedirs(os.path.join(out, "historias", "img"), exist_ok=True)
                    shutil.copyfile(os.path.join(pasta, rel), os.path.join(out, "historias", rel))
            print(f"Escrito app/data/historias/{comp['slug']}.json: abra #/historia/{comp['slug']}")
        return 1 if h.erros else 0
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        _pasta_temporaria(out, tmp)
        index, msgs, _ = construir(tmp, estrito=True, parcial="--parcial" in argv, ficheiros=ficheiros or None)
    for m in sorted(msgs, key=ordem_msg):
        print(m)
    n = sum(1 for m in msgs if not m.startswith("aviso"))
    print(f"{len(index['historias'])} histórias, {n} erro(s), {len(msgs) - n} aviso(s).")
    return 1 if n else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
