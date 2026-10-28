"""Replay the Constitution's revisions: apply each Lei Constitucional to the previous official text.

This measures M1 in docs/ARCHITECTURE.md: how much of each republication we reproduce by
applying the revision's own instructions to the text before it. The start of each step is the
previous official text (the 1976 text or the previous republication), so a step's errors do not
carry into the next one.

The instructions are Portuguese legislative drafting. A deterministic grammar reads them:
- restatements: "passando o preceito a ter a seguinte redacção: «…»", "com a seguinte
  redacção:", "é substituído por:". The quoted text is the result, so it wins over the
  expression edits in the same instruction;
- expression edits: "a expressão «X» é substituída por «Y»", "é aditada a expressão «X» entre
  «A» e «B»", "in fine", "é eliminada a expressão «X»";
- structure: an article, número or alínea "passa a" another number; "são aditados …";
  "é eliminado …"; "a epígrafe … é substituída por …".

Every inserted character comes from the act. Nothing is generated. An instruction we cannot
read is listed, and the articles it touches will not match: that is the honest result.

References in an act are to the numbers before the revision ("O n.º 4 passa a n.º 6" after "O
n.º 5 passa a n.º 4" means the old n.º 4). So each unit keeps its original label, and lookups use
it. A reference with "novo" uses the new number.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field

import verificacao

# ---- The text model ---------------------------------------------------------------------------
_NUM = re.compile(r"^(\d+(?:-[A-Z])?)\s*(?:\.|—|-)\s+(.*)$")
_AL = re.compile(r"^([a-z]{1,2})\)\s+(.*)$")


@dataclass
class Unidade:
    tipo: str               # "n" número, "al" alínea, "p" unnumbered paragraph
    rot: str | None         # current label: "3", "b"
    texto: str
    orig: str | None = None  # label before this revision
    pai: "Unidade | None" = None  # the número an alínea belongs to
    oculta: bool = False     # replaced, but a later instruction may still move it
    do_ato: bool = False     # text written by the act, already in the new numbering


@dataclass
class Artigo:
    num: str
    epigrafe: str
    unidades: list[Unidade] = field(default_factory=list)
    orig: str | None = None
    eliminado: bool = False


def _chave_num(x: str | None) -> tuple:
    if not x:
        return (0, "")
    m = re.match(r"(\d+)(?:-([A-Z]))?", x)
    return (int(m.group(1)), m.group(2) or "") if m else (0, x)


def _chave_al(x: str | None) -> tuple:
    return (len(x or ""), x or "")


def unidades_de(texto: str) -> list[Unidade]:
    """Lines of an article -> units. Alíneas belong to the número before them."""
    out, pai = [], None
    for linha in texto.split("\n"):
        linha = linha.strip()
        if not linha:
            continue
        m = _NUM.match(linha)
        if m:
            pai = Unidade("n", m.group(1), m.group(2), m.group(1))
            out.append(pai)
            continue
        m = _AL.match(linha)
        if m:
            out.append(Unidade("al", m.group(1), m.group(2), m.group(1), pai))
            continue
        out.append(Unidade("p", None, linha, None, pai))
    return out


def texto_de(art: Artigo) -> str:
    """Units -> lines, números in number order, each with its alíneas in letter order."""
    vis = [u for u in art.unidades if not u.oculta]
    nums = sorted([u for u in vis if u.tipo == "n"], key=lambda u: _chave_num(u.rot))
    linhas = []
    soltos = [u for u in vis if u.tipo != "n" and (u.pai is None or u.pai not in nums)]
    def bloco(lista):
        als = sorted([u for u in lista if u.tipo == "al"], key=lambda u: _chave_al(u.rot))
        ps = [u for u in lista if u.tipo == "p"]
        # Paragraphs before the first alínea stay before it; the rest go after the alíneas.
        antes = [u for u in ps if lista.index(u) < (lista.index(als[0]) if als else len(lista))]
        depois = [u for u in ps if u not in antes]
        return [u.texto for u in antes] + ["%s) %s" % (u.rot, u.texto) for u in als] + [u.texto for u in depois]
    linhas += bloco(soltos)
    for n in nums:
        linhas.append("%s. %s" % (n.rot, n.texto))
        linhas += bloco([u for u in vis if u.pai is n and u.tipo != "n"])
    return "\n".join(linhas)


def constituicao_de(texto_oficial: str) -> dict[str, Artigo]:
    arts = verificacao.artigos(verificacao.republicacao(texto_oficial), {"princípios fundamentais", "disposições finais e transitórias"})
    out = {}
    for k, a in arts.items():
        if "#" in k:
            continue
        num = k.split("-", 1)[1].upper()
        out[num] = Artigo(num, a["epigrafe"], unidades_de(a["texto"]), num)
    return out


# ---- Reading an act ---------------------------------------------------------------------------
def parte_alteradora(texto_ato: str) -> list[str]:
    """The act's own lines, before the republished Constitution and before the final provisions."""
    linhas = [l.strip() for l in texto_ato.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    idx = [i for i, l in enumerate(linhas) if l.upper() == "CONSTITUIÇÃO DA REPÚBLICA PORTUGUESA"]
    linhas = [l for l in linhas[:idx[-1] if idx else len(linhas)] if l]
    fim = next((i for i, l in enumerate(linhas) if re.match(r"^II\s*[-–—]\s", l) or re.match(r"^Aprovad[ao] em \d", l)), len(linhas))
    return linhas[:fim]


_ART_LC = re.compile(r"^(?:ARTIGO|Artigo|Art\.)\s*\d+\.?\s*º?\s*(?:[-–—]\s*)?(.*)$")
_INSTR = re.compile(r"^(\d+)\s*[-–—]\s+(.*)$")


def instrucoes(linhas: list[str]) -> list[dict]:
    """Lines -> [{"lc": "Artigo 5.º", "texto": sentence with ⟦n⟧, "quotes": [...]}].

    Instructions are numbered "1 - …" inside each article of the act. Restated números inside a
    quote use "1." and never start an instruction. A quoted block may span lines.
    """
    out, cur, prof, lc = [], None, 0, None
    anterior = ""
    for i, l in enumerate(linhas):
        # The acts have unbalanced quote marks ("««pertencentes"). A new article of the act, or a
        # numbered instruction right after a line that closes a quote, ends any open quote.
        if prof > 0 and (re.match(r"^(ARTIGO|Artigo|Art\.)\s*\d+\.?\s*º?\s*$", l) or (_INSTR.match(l) and anterior.endswith("»"))):
            prof = 0
        anterior = l
        if prof == 0:
            m = _ART_LC.match(l)
            seguinte = linhas[i + 1] if i + 1 < len(linhas) else ""
            conteudo_livre = cur is not None and cur["linhas"][-1].rstrip().endswith(":") and re.match(r"^\(.*[)}]$", seguinte)
            if m and re.match(r"^(ARTIGO|Artigo|Art\.)\s*\d", l) and not conteudo_livre and not (cur is not None and re.match(r"^\(.*[)}]$", seguinte) and cur.get("livre")):
                lc = " ".join(l.split()[:2])
                cur = None
                l = m.group(1).strip()
                if not l:
                    continue
            m = _INSTR.match(l)
            if m and not l.startswith("«"):
                cur = {"lc": lc, "linhas": [m.group(2)]}
                out.append(cur)
            elif cur is not None and conteudo_livre:
                cur["linhas"].append(l)
                cur["livre"] = True
            elif cur is None:
                cur = {"lc": lc, "linhas": [l]}
                out.append(cur)
            else:
                cur["linhas"].append(l)
        else:
            cur["linhas"].append(l)
        prof = max(0, prof + l.count("«") - l.count("»"))
    res = []
    for c in out:
        t, quotes = _aspas("\n".join(c["linhas"]))
        res.append({"lc": c["lc"], "texto": t, "quotes": quotes})
    return res


def _aspas(t: str) -> tuple[str, list[str]]:
    """Replace each outermost «…» by ⟦n⟧. An unquoted block after ":" becomes the last quote."""
    out, quotes, i, prof, ini = [], [], 0, 0, 0
    for j, ch in enumerate(t):
        if ch == "«":
            if prof == 0:
                out.append(t[i:j])
                ini = j + 1
            prof += 1
        elif ch == "»" and prof > 0:
            prof -= 1
            if prof == 0:
                quotes.append(t[ini:j])
                out.append("⟦%d⟧" % (len(quotes) - 1))
                i = j + 1
    out.append(t[i:] if prof == 0 else t[i:])
    s = "".join(out)
    # 1992: "com a seguinte redacção:\n6. Portugal pode …" with no quotes.
    m = re.search(r":\s*\n(.+)$", s, re.S)
    if m and "⟦" not in m.group(1):
        quotes.append(m.group(1).strip())
        s = s[:m.start()] + ": ⟦%d⟧" % (len(quotes) - 1)
    return s.replace("\n", " "), quotes


# ---- Applying an act ---------------------------------------------------------------------------
NUMEROS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "três": 3, "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10}
_ARTREF = re.compile(r"(?P<novo>nov[oa] )?artigo (?P<n>\d+)\s*\.?\s*º(?:\s*-\s*(?P<l>[A-Z])\b)?")
_LISTA = r"(?:\d+(?:-[A-Z])?(?:,\s*|\s+e\s+))*\d+(?:-[A-Z])?"
_LISTA_ART = r"(?:\d+\.?\s*º?(?:-[A-Z])?(?:,\s*|\s+e\s+|\s+))*\d+\.?\s*º?(?:-[A-Z])?"
_LISTA_AL = r"(?:[a-z]{1,2}\)(?:,\s*|\s+e\s+))*[a-z]{1,2}\)"


# "passa a", "passam, respectivamente, a", "passam a constituir, respectivamente, os novos"
_PASSA = r"(?:passa|passam),?\s+(?:respectivamente,?\s+)?a\s+(?:constituir,?\s+)?(?:respectivamente,?\s+)?(?:o\s+|os\s+|a\s+|as\s+)?(?:nov[oa]s?\s+)?"


def _lista(t: str) -> list[str]:
    return re.findall(r"\d+(?:-[A-Z])?|[a-z]{1,2}(?=\))", t)


class Revisao:
    """The Constitution while one act is applied to it."""

    def __init__(self, artigos: dict[str, Artigo]):
        self.artigos = list(artigos.values())
        for a in self.artigos:
            a.orig = a.num
            for u in a.unidades:
                u.orig = u.rot
        self.ctx_art: Artigo | None = None
        self.ctx_num: Unidade | None = None
        self.falhas: list[str] = []
        self.tocados: set[int] = set()

    # -- lookups
    def artigo(self, n: str, novo: bool = False) -> Artigo | None:
        vivos = [a for a in self.artigos if not a.eliminado]
        if not novo:
            a = next((a for a in vivos if a.orig == n), None)
            if a:
                return a
        return next((a for a in vivos if a.num == n and (novo or a.orig is None)), None) or next((a for a in vivos if a.num == n), None)

    def numero(self, art: Artigo, n: str, novo: bool = False) -> Unidade | None:
        ns = [u for u in art.unidades if u.tipo == "n"]
        if not novo:
            u = next((u for u in ns if u.orig == n), None)
            if u:
                return u
        return next((u for u in ns if u.rot == n and not u.oculta), None)

    def alinea(self, art: Artigo, pai: Unidade | None, x: str, novo: bool = False) -> Unidade | None:
        als = [u for u in art.unidades if u.tipo == "al" and (pai is None or u.pai is pai)]
        if not novo:
            u = next((u for u in als if u.orig == x), None)
            if u:
                return u
        return next((u for u in als if u.rot == x and not u.oculta), None)

    def toca(self, art: Artigo | None):
        if art is not None:
            self.tocados.add(id(art))

    # -- reading references
    def ref_artigo(self, t: str) -> Artigo | None:
        if re.search(r"mesmo artigo|respectivo artigo|referido artigo", t) and not _ARTREF.search(t.split("mesmo artigo")[0]):
            return self.ctx_art
        m = _ARTREF.search(t)
        if m:
            a = self.artigo(m.group("n") + ("-" + m.group("l") if m.group("l") else ""), bool(m.group("novo")))
            if a is not None:
                self.ctx_art = a
            return a
        return self.ctx_art

    # -- one instruction
    def aplicar(self, ins: dict):
        t, q = ins["texto"], ins["quotes"]
        if ins["lc"] is None:  # the act's title and preamble
            return
        if re.match(r"^A Constituição da República Portuguesa", t) or not re.search(r"artigo|n\.º|n\.os|alínea|epígrafe|preceito|aditad|eliminad|suprimid", t):
            return
        try:
            if not self._aplicar(t, q):
                self.falhas.append(t)
        except Exception as e:  # an instruction we misread must not stop the others
            self.falhas.append("%s [%s]" % (t, e))

    def _aplicar(self, t: str, q: list[str]) -> bool:
        conteudo = None
        mc = re.search(r"(?:seguinte redac\w+|substituíd[oa]s? (?:por|pel[oa]s? seguintes?)|nos termos seguintes|passa(?:ndo)? a ser|o seguinte texto)\s*(:?)\s*⟦(\d+)⟧\s*\.?\s*$", t) \
            or re.search(r"()(:)\s*⟦(\d+)⟧\s*\.?\s*$", t)
        if mc:
            x = q[int(mc.group(mc.lastindex))]
            # "é substituída por «visando»." is an expression edit, not a restatement.
            if mc.group(mc.lastindex - 1) == ":" or "redac" in mc.group(0) or re.match(r"^\s*«?\s*(\d+\s*[.\-—]\s|[a-z]{1,2}\)\s|Artigo\s|\()", x):
                conteudo = x.replace("«", "").replace("»", "") if x.lstrip().startswith("«") else x
            else:
                mc = None
        cabeca = t[:mc.start()] if mc else t
        feito = False

        # Headings (partes, títulos, capítulos, secções) are not in our model.
        if re.search(r"\b(?:título|capítulo|secção|subsecção|parte) [IVXL]+\b", cabeca, re.I) and not re.search(r"\bartigos? \d|n\.º|alínea", cabeca.split("passa")[0]):
            return True

        # Whole articles: added, moved, eliminated.
        m = re.search(r"aditad[oa]s?,? (?:um |o |como )?(?:novo )?artigo (\d+)\.?\s*º(?:-([A-Z]))?", cabeca)
        if m and conteudo and re.match(r"^\s*Artigo", conteudo, re.I):
            self._novo_artigo(conteudo)
            return True
        m = re.search(r"aditad[oa]s? (?:os |dois |três |quatro |cinco )?(?:novos )?artigos", cabeca)
        if m and conteudo and re.match(r"^\s*Artigo", conteudo, re.I):
            for bloco in re.split(r"\n(?=Artigo\s+\d)", conteudo, flags=re.I):
                self._novo_artigo(bloco)
            return True
        m = re.search(r"(?:título|capítulo) [IVXL]+[^,]*?, que abrange os artigos (\d+)\.?\s*º a (\d+)\.?\s*º", cabeca)
        if m and re.search(r"suprimid|eliminad", cabeca):
            for n in range(int(m.group(1)), int(m.group(2)) + 1):
                a = self.artigo(str(n))
                if a:
                    a.eliminado = True
            return True
        if re.search(r"^(?:O|o) (?:capítulo|título|secção) [IVXL]+ abrange", cabeca):
            return True  # headings are not in our model
        m = re.match(r"^(?:O|Os) artigos? (" + _LISTA_ART + r")(?: da Constituição)? (?:é|são) (?:eliminad|suprimid|revogad)[oa]s?\.?$", cabeca.strip())
        if m:
            for n in _lista(m.group(1)):
                a = self.artigo(n)
                if a:
                    a.eliminado = True
                    self.toca(a)
            return True
        m = re.search(r"(?:É|é|São|são) (?:eliminad|suprimid|revogad)[oa]s? (?:o |os )?artigos? (" + _LISTA_ART + r")", cabeca)
        if m and "n.º" not in cabeca[:m.start()] and "alínea" not in cabeca[:m.start()]:
            for n in _lista(m.group(1)):
                a = self.artigo(n)
                if a:
                    a.eliminado = True
                    self.toca(a)
            return True

        # A new article with only its epígrafe; its números come in later instructions.
        m = re.search(r"aditad[oa] (?:à Constituição )?um novo artigo (\d+)\.?\s*º(?:-([A-Z]))?,? com a seguinte epígrafe", cabeca + (": " if conteudo else ""))
        if m and conteudo is not None:
            a = Artigo(m.group(1) + ("-" + m.group(2) if m.group(2) else ""), conteudo.strip().strip().lstrip("(").rstrip(")}"), [], None)
            self.artigos.append(a)
            self.toca(a)
            self.ctx_art = a
            return True

        # The article this instruction is about.
        art = self.ref_artigo(cabeca)
        if art is None:
            return False
        self.toca(art)

        # "Os artigos 88.º, 89.º e 90.º passam a artigos 87.º, 88.º e 89.º, respectivamente."
        m = re.search(r"(?:Os|os) artigos (" + _LISTA_ART + r")(?: da Constituição)? " + _PASSA + r"artigos (" + _LISTA_ART + r")", cabeca)
        if m:
            de, para = _lista(m.group(1)), _lista(m.group(2))
            if len(de) == len(para):
                movidos = [self.artigo(x) for x in de]
                for a_, b_ in zip(movidos, para):
                    if a_ is not None:
                        a_.num = b_
                        self.toca(a_)
                return True

        # Article moves to another number, or becomes a número of another article.
        m = re.match(r"^(?:O |o )?(?:novo )?artigo \d+\.?\s*º(?:-[A-Z])?(?: da Constituição)? " + _PASSA + r"(?:artigo (\d+)\.?\s*º(?:-([A-Z]))?|n\.º (\d+) do (?:novo )?artigo (\d+)\.?\s*º)", cabeca)
        if m and m.group(1):
            art.num = m.group(1) + ("-" + m.group(2) if m.group(2) else "")
            feito = True
        elif m and m.group(3):
            dest = self.artigo(m.group(4), True) or self.artigo(m.group(4))
            if dest is not None:
                corpo = texto_de(art)
                art.eliminado = True
                novo = Unidade("n", m.group(3), corpo.replace("\n", " "), None)
                dest.unidades.append(novo)
                self.toca(dest)
                self.ctx_art = dest
                art = dest
                feito = True

        # "O n.º 8 do artigo 108.º passa a novo artigo 110.º, com a seguinte epígrafe: (…)"
        m = re.search(r"n\.º (\d+) do artigo \d+\.?\s*º(?: da Constituição)? passa a (?:constituir )?(?:o )?novo artigo (\d+)\.?\s*º", cabeca)
        if m:
            u = self.numero(art, m.group(1))
            if u is not None:
                filhos = [x for x in art.unidades if x.pai is u]
                art.unidades = [x for x in art.unidades if x is not u and x.pai is not u]
                u.tipo, u.rot, u.pai = "p", None, None
                for x in filhos:
                    x.pai = None
                ep = conteudo.strip().strip("()") if conteudo and "epígrafe" in cabeca else ""
                novo = Artigo(m.group(2), ep, [u] + filhos, None)
                self.artigos.append(novo)
                self.toca(novo)
                self.ctx_art = novo
                if conteudo and "epígrafe" not in cabeca:
                    self._conteudo(novo, None, None, conteudo, cabeca)
                return True
        # "O n.º 3 do artigo 110.º passa a n.º 3 do novo artigo 60.º" and "… passa a corpo do artigo 255.º"
        m = re.search(r"n\.º (\d+) do artigo \d+\.?\s*º(?: da Constituição)? passa a (?:constituir )?(?:o )?(?:novo )?(?:n\.º (\d+)|corpo) do (?:(novo) )?(?:artigo (\d+)\.?\s*º(?:-([A-Z]))?|mesmo artigo|artigo\b)", cabeca)
        if m:
            u = self.numero(art, m.group(1))
            dest = art if m.group(4) is None else (self.artigo(m.group(4) + ("-" + m.group(5) if m.group(5) else ""), bool(m.group(3))) or self.artigo(m.group(4)))
            if u is not None and dest is not None:
                filhos = [x for x in art.unidades if x.pai is u]
                if dest is not art:
                    art.unidades = [x for x in art.unidades if x is not u and x.pai is not u]
                    dest.unidades += [u] + filhos
                if m.group(2):
                    u.rot = m.group(2)
                else:
                    u.tipo, u.rot = "p", None
                    for x in filhos:
                        x.pai = None
                self.toca(dest)
                self.ctx_art, self.ctx_num = dest, u
                if conteudo is not None:
                    novas = unidades_de(conteudo)
                    if len(novas) == 1:
                        u.texto, u.do_ato = novas[0].texto, True
                return self._expressoes(dest, u, None, cabeca, q) or True if conteudo is None else True
        m = re.search(r"n\.os (" + _LISTA + r") do artigo \d+\.?\s*º(?: da Constituição)? " + _PASSA + r"n\.os (" + _LISTA + r") do (?:(novo) )?artigo (\d+)\.?\s*º", cabeca)
        if m:
            dest = self.artigo(m.group(4), bool(m.group(3))) or self.artigo(m.group(4))
            de, para = _lista(m.group(1)), _lista(m.group(2))
            if dest is not None and len(de) == len(para):
                for a_, b_ in zip(de, para):
                    u = self.numero(art, a_)
                    if u is not None:
                        filhos = [x for x in art.unidades if x.pai is u]
                        if dest is not art:
                            art.unidades = [x for x in art.unidades if x is not u and x.pai is not u]
                            dest.unidades += [u] + filhos
                        u.rot = b_
                self.toca(dest)
                return True
        # "As alíneas b) e c) do n.º 2 do artigo 102.º passam a alíneas b) e c) do artigo 100.º"
        m = re.search(r"alíneas? (" + _LISTA_AL + r")(?: do n\.º (\d+))? do artigo \d+\.?\s*º(?: da Constituição)? " + _PASSA + r"(?:alíneas? )?(" + _LISTA_AL + r")(?: do n\.º (\d+))? do (?:novo )?artigo (\d+)\.?\s*º", cabeca)
        if m:
            pai = self.numero(art, m.group(2)) if m.group(2) else None
            dest = self.artigo(m.group(5), True) or self.artigo(m.group(5))
            dpai = (self.numero(dest, m.group(4), True) or self.numero(dest, m.group(4))) if dest and m.group(4) else None
            de, para = _lista(m.group(1)), _lista(m.group(3))
            if dest is not None and len(de) == len(para):
                for a_, b_ in zip(de, para):
                    u = self.alinea(art, pai, a_)
                    if u is not None:
                        art.unidades.remove(u)
                        dest.unidades.append(u)
                        u.rot, u.pai = b_, dpai
                        if conteudo is not None and len(de) == 1:
                            novas = unidades_de(conteudo)
                            if novas:
                                u.texto, u.do_ato = novas[0].texto, True
                self.toca(dest)
                return True
        # "O artigo 257.º é substituído por dois novos artigos, 257.º e 258.º, com a seguinte redacção:"
        if conteudo and re.search(r"substituído por (?:dois|três) novos artigos", cabeca):
            art.eliminado = True
            for bloco in re.split(r"\n(?=Artigo\s+\d)", conteudo.strip(), flags=re.I):
                self._novo_artigo(bloco)
            return True
        # "É eliminado o título VI": headings are not in our model.
        if re.search(r"(?:É|é) eliminad[oa] o (?:título|capítulo|secção)", cabeca):
            return True

        # "O corpo do artigo passa a n.º 1": the unnumbered text becomes a número.
        m = re.search(r"corpo do (?:mesmo |referido )?artigo(?: \d+\.?\s*º)?(?: da Constituição)? passa a (?:constituir )?(?:o )?n\.º (\d+)", cabeca)
        if m:
            soltos = [u for u in art.unidades if u.pai is None and not u.oculta and u.tipo != "n"]
            ps = [u for u in soltos if u.tipo == "p"]
            if ps:
                ps[0].tipo, ps[0].rot = "n", m.group(1)
                for u in soltos:
                    if u is not ps[0]:
                        u.pai = ps[0]
            return True

        # Números that move, are merged or eliminated.
        for m in re.finditer(r"(?:O|o|Os|os) (?:actual |actuais )?n\.(?:º|os) (" + _LISTA + r")(?: do (?:mesmo|novo|actual)? ?artigo(?: \d+\.?\s*º(?:-[A-Z])?)?(?: da Constituição)?)? " + _PASSA + r"n\.(?:º|os) (" + _LISTA + r")(?! do (?:novo )?artigo)", cabeca):
            de, para = _lista(m.group(1)), _lista(m.group(2))
            if len(de) == len(para):
                for a_, b_ in zip(de, para):
                    u = self.numero(art, a_)
                    if u:
                        u.rot = b_
                        u.oculta = False
                feito = True
        m = re.search(r"(?:Os|os) n\.os (" + _LISTA + r")(?: do mesmo artigo)? são fundidos", cabeca)
        fundidos = _lista(m.group(1)) if m else []
        for m in list(re.finditer(r"(?:É|é|São|são) (?:eliminad|suprimid)[oa]s? (?:o |os )?n\.(?:º|os) (" + _LISTA + r")", cabeca)) + \
                list(re.finditer(r"(?:O|Os) n\.(?:º|os) (" + _LISTA + r")(?: do (?:mesmo |novo )?artigo(?: \d+\.?\s*º)?(?: da Constituição)?)? (?:é|são) (?:eliminad|suprimid)", cabeca)):
            for n in _lista(m.group(1)):
                u = self.numero(art, n)
                if u:
                    u.oculta = True
                    for x in art.unidades:
                        if x.pai is u:
                            x.oculta = True
            feito = True

        for m in re.finditer(r"passando o (?:seu )?n\.º (\d+) a constituir o (?:novo )?(?:n\.º (\d+)|texto)", cabeca):
            u = self.numero(art, m.group(1))
            if u is not None:
                if m.group(2):
                    u.rot = m.group(2)
                else:
                    u.tipo, u.rot = "p", None
                    for x in art.unidades:
                        if x.pai is u:
                            x.pai = None
                feito = True
        # "O texto do artigo 156.º passa a constituir o n.º 2 do mesmo artigo" / "… o seu n.º 1"
        m = re.search(r"(?:O|o) (?:texto|corpo) do (?:mesmo |novo )?artigo(?: \d+\.?\s*º)?(?: da Constituição)? passa a (?:constituir )?(?:o )?(?:seu )?(?:novo )?n\.º (\d+)", cabeca)
        if m:
            soltos = [u for u in art.unidades if u.pai is None and not u.oculta and u.tipo != "n"]
            ps = [u for u in soltos if u.tipo == "p"]
            if ps:
                ps[0].tipo, ps[0].rot = "n", m.group(1)
                for u in soltos:
                    if u is not ps[0]:
                        u.pai = ps[0]
            return True
        # "É aditado ao artigo 3.º um novo n.º 3, cujo texto é o do artigo 115.º"
        m = re.search(r"aditad[oa] (?:a[oà] (?:novo )?artigo \d+\.?\s*º )?um (?:novo )?n\.º (\d+), cujo texto é o do (?:n\.º (\d+) do )?artigo (\d+)\.?\s*º", cabeca)
        if m:
            fonte = self.artigo(m.group(3))
            if fonte is not None:
                if m.group(2):
                    u = self.numero(fonte, m.group(2))
                    texto = u.texto if u else None
                else:
                    texto = texto_de(fonte).replace("\n", " ")
                if texto:
                    art.unidades.append(Unidade("n", m.group(1), texto, None))
                    return True
            return False

        # The número and alínea the rest is about.
        num = self.ctx_num if re.search(r"mesmo número|respectivo número", cabeca) and self.ctx_num in art.unidades else None
        mn = re.search(r"(?:^|\b)(?:[Nn]o|[Aa]o|[Oo]|[Dd]o|[Nn]a parte \w+ do|[Àà]|[Nn]a) (?:actual )?(?P<novo>novo )?n\.º (?P<n>\d+(?:-[A-Z])?)(?! do (?:novo )?artigo \d+\.?\s*º passa)", cabeca)
        if mn and num is None and not re.search(r"aditad[oa]s?(?: a[oà] (?:mesmo |novo )?artigo[^,]*?)? (?:um |uma )?(?:novo )?n\.º " + mn.group("n"), cabeca):
            num = self.numero(art, mn.group("n"), bool(mn.group("novo")))
        if fundidos:
            num = self.numero(art, fundidos[0])
            for n in fundidos[1:]:
                u = self.numero(art, n)
                if u:
                    u.oculta = True
            m = re.search(r"passando a n\.º (\d+)", cabeca)
            if m and num:
                num.rot = m.group(1)
        for m in re.finditer(r"(?:A|a|As|as) (?:actual |actuais )?alíneas? (" + _LISTA_AL + r")(?: do n\.º (\d+))?(?: do (?:mesmo|respectivo) número)?(?: do (?:mesmo|novo)? ?artigo(?: \d+\.?\s*º)?(?: da Constituição)?)? " + _PASSA + r"(?:alíneas? )?(" + _LISTA_AL + r")(?: do n\.º (\d+))?(?! do (?:novo )?artigo)", cabeca):
            pai = self.numero(art, m.group(2)) if m.group(2) else num
            de, para = _lista(m.group(1)), _lista(m.group(3))
            dest = self.numero(art, m.group(4), True) or self.numero(art, m.group(4)) if m.group(4) else None
            if len(de) == len(para):
                for a_, b_ in zip(de, para):
                    u = self.alinea(art, pai, a_)
                    if u:
                        u.rot = b_
                        u.oculta = False
                        if dest is not None:
                            u.pai = dest
                feito = True
        for m in re.finditer(r"(?:É|é|São|são) (?:eliminad|suprimid)[oa]s? (?:a |as )?alíneas? (" + _LISTA_AL + r")(?: do n\.º (\d+))?", cabeca):
            pai = self.numero(art, m.group(2)) if m.group(2) else num
            for x in _lista(m.group(1)):
                u = self.alinea(art, pai, x)
                if u:
                    u.oculta = True
            feito = True
        if num is not None:
            self.ctx_num = num
        al = None
        ma = re.search(r"(?:[Nn]a|[Àà]|[Aa]|[Dd]a) (?:actual )?(?P<novo>nova )?alínea (?P<x>[a-z]{1,2})\)(?: do (?:novo )?n\.º (?P<n>\d+))?", cabeca)
        if ma and not re.search(r"aditad[oa]s?[^⟦]{0,60}nova alínea " + ma.group("x"), cabeca):
            pai = self.numero(art, ma.group("n")) if ma.group("n") else num
            al = self.alinea(art, pai, ma.group("x"), bool(ma.group("novo")))
            if ma.group("n") and pai is not None:
                num = pai

        # Epígrafe.
        if "epígrafe" in cabeca:
            ep = self._epigrafe(art, cabeca, q, conteudo)
            feito = feito or ep
            if conteudo is not None and re.match(r"^\s*\(", conteudo) and "\n" not in conteudo.strip():
                return True

        # Restated text: it wins over the expression edits of the same instruction.
        if conteudo is not None:
            return self._conteudo(art, num, al, conteudo, cabeca) or feito
        return self._expressoes(art, num, al, cabeca, q) or feito

    def _novo_artigo(self, conteudo: str):
        linhas = [l.strip() for l in conteudo.strip().split("\n") if l.strip()]
        m = re.match(r"^Artigo\s+(\d+)\s*\.?\s*º?(?:\s*-\s*([A-Z]))?", linhas[0], re.I)
        num = m.group(1) + ("-" + m.group(2) if m.group(2) else "")
        ep = ""
        if len(linhas) > 1 and re.match(r"^\(.*[)}]$", linhas[1]):
            ep = linhas[1][1:-1]
            linhas = linhas[2:]
        else:
            linhas = linhas[1:]
        a = Artigo(num, ep, unidades_de("\n".join(linhas)), None)
        for u in a.unidades:
            u.do_ato = True
        self.artigos.append(a)
        self.toca(a)
        self.ctx_art = a

    def _epigrafe(self, art: Artigo, t: str, q: list[str], conteudo: str | None) -> bool:
        if conteudo is not None:
            m = re.match(r"^\s*\((.*?)[)}]\s*(?:\n|$)", conteudo)
            if m:
                art.epigrafe = m.group(1)
                return True
        m = re.search(r"epígrafe[^⟦]*?(?:substituíd[oa] (?:por|pela expressão)|passa a ser)\s*:?\s*⟦(\d+)⟧|substituíd[oa] a epígrafe[^⟦]*?por\s*:?\s*⟦(\d+)⟧", t)
        if m:
            art.epigrafe = q[int(m.group(1) or m.group(2))].strip().strip("()")
            return True
        m = re.search(r"aditad[oa][^⟦]*?epígrafe[^⟦]*?⟦(\d+)⟧|epígrafe[^⟦]*?aditad[oa][^⟦]*?⟦(\d+)⟧", t)
        if m:
            x = q[int(m.group(1) or m.group(2))]
            art.epigrafe = art.epigrafe + ("" if x.startswith(",") else " ") + x
            return True
        return False

    def _conteudo(self, art: Artigo, num: Unidade | None, al: Unidade | None, conteudo: str, t: str) -> bool:
        linhas = [l.strip() for l in conteudo.strip().split("\n") if l.strip()]
        if linhas and re.match(r"^Artigo\s+\d", linhas[0], re.I):
            # The whole article restated.
            m = re.match(r"^Artigo\s+(\d+)\s*\.?\s*º?(?:\s*-\s*([A-Z]))?", linhas[0], re.I)
            art.num = m.group(1) + ("-" + m.group(2) if m.group(2) else "")
            linhas = linhas[1:]
            if linhas and re.match(r"^\(.*[)}]$", linhas[0]):
                art.epigrafe = linhas[0][1:-1]
                linhas = linhas[1:]
            art.unidades = unidades_de("\n".join(linhas))
            for u in art.unidades:
                u.do_ato = True
            return True
        if linhas and re.match(r"^\(.*[)}]$", linhas[0]):
            art.epigrafe = linhas[0][1:-1]
            linhas = linhas[1:]
        novas = unidades_de("\n".join(linhas))
        for u in novas:
            u.do_ato = True
        if not novas:
            return True
        # New units ("É aditado ao mesmo artigo um novo n.º 5, com a seguinte redacção"), unless
        # the sentence restates the edited unit ("passando o preceito a ter a seguinte redacção").
        adicao = bool(re.search(r"(?:aditad[oa]s?|inserid[oa]s?|acrescentad[oa]s?)[^⟦]{0,80}?\b(?:um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nov[oa]s?) (?:n\.(?:º|os)|alíneas?|números?|parágrafos?)", t)) \
            and not re.search(r"passa(?:ndo)?[^⟦]{0,40}a ter a seguinte redac", t)
        # One unnumbered paragraph for an article without números: the article's text.
        if all(u.tipo == "p" for u in novas) and not num and not al:
            if adicao:
                art.unidades += novas
            else:
                keep = [u for u in art.unidades if u.tipo != "p"]
                art.unidades = novas + keep if keep and not any(u.tipo == "n" for u in keep) else (novas if not keep else novas + keep)
                if any(u.tipo == "n" for u in keep):
                    art.unidades = novas
            return True
        if al is not None and len(novas) == 1 and novas[0].tipo == "al" and not adicao:
            if re.search(r"substituíd[oa]s? por", t) and "passando" not in t:
                # "A alínea a) é substituída por: «a) …»" and then "A actual alínea a) passa a b)":
                # the old alínea stays addressable, hidden until an instruction moves it.
                art.unidades.append(Unidade("al", novas[0].rot, novas[0].texto, None, al.pai))
                al.oculta = True
                return True
            al.rot, al.texto, al.oculta, al.do_ato = novas[0].rot, novas[0].texto, False, True
            return True
        # "O artigo 39.º passa a ter a seguinte redacção: «1. …»": the whole body.
        designa = re.search(r"\bn\.º \d+|alínea [a-z]{1,2}\)", t.split("seguinte")[0]) is not None
        if num is None and al is None and not adicao and not designa and (novas[0].tipo != "n" or novas[0].rot == "1" or not any(x.tipo == "n" for x in art.unidades)):
            art.unidades = novas
            return True
        pai = num
        for u in novas:
            if u.tipo == "n":
                alvo = None
                if num is not None and not adicao and u is novas[0]:
                    alvo = num
                    # "Os n.os 5 e 6 passam a n.os 6 e 7, sendo, no n.º 6, …": the new n.º 6.
                    if num.rot != u.rot:
                        movido = next((x for x in art.unidades if x.tipo == "n" and x.rot == u.rot and x.rot != x.orig and not x.oculta), None)
                        if movido is not None:
                            alvo = movido
                elif not adicao:
                    alvo = self.numero(art, u.rot, True) or self.numero(art, u.rot)
                if alvo is not None:
                    alvo.rot, alvo.texto, alvo.oculta, alvo.do_ato = u.rot, u.texto, False, True
                    # A restated número with alíneas replaces its alíneas too.
                    filhos = [x for x in novas if x.pai is u]
                    if filhos:
                        for x in art.unidades:
                            if x.pai is alvo and x.tipo == "al":
                                x.oculta = True
                    pai = alvo
                else:
                    u.orig = None
                    art.unidades.append(u)
                    pai = u
            elif u.tipo == "al":
                if u.pai is not None and u.pai in novas:
                    dono = pai
                else:
                    dono = num if num is not None else (al.pai if al is not None else None)
                velho = None if adicao else self.alinea(art, dono, u.rot, True)
                if al is not None and not adicao and u is novas[0]:
                    velho = al
                if velho is not None:
                    velho.rot, velho.texto, velho.oculta, velho.pai, velho.do_ato = u.rot, u.texto, False, dono if dono is not None else velho.pai, True
                else:
                    nova = Unidade("al", u.rot, u.texto, None, dono)
                    art.unidades.append(nova)
            else:
                dono = pai if pai is not None else num
                if num is not None and not adicao and len(novas) == 1:
                    num.texto = u.texto
                else:
                    art.unidades.append(Unidade("p", None, u.texto, None, dono))
        return True

    def _expressoes(self, art: Artigo, num: Unidade | None, al: Unidade | None, t: str, q: list[str]) -> bool:
        alvo = al or num
        usados: set[int] = set()
        ops = []
        ctx = r"(?:,?\s*(?:entre|situad[oa] entre)\s+(?:a expressão\s+|o inciso\s+|a palavra\s+)?⟦(?P<a>\d+)⟧\s+e\s+(?:a expressão\s+|o inciso\s+|a palavra\s+)?⟦(?P<b>\d+)⟧,?)?"
        if re.search(r"substitu", t):
            for m in re.finditer(r"⟦(?P<x>\d+)⟧" + ctx + r"\s*(?:,\s*)?(?:constante d[oa] [^,⟦]*?,\s*)?(?:(?:é|são)\s+substituíd\w*\s+|substituindo-se\s+)?(?:pela expressão|pelo inciso|pela palavra|pelas expressões|por)\s+(?:a expressão\s+)?⟦(?P<y>\d+)⟧", t):
                ops.append(("sub", m.group("x"), m.group("y"), m.group("a"), m.group("b"), m.start()))
                usados |= {m.group(k) for k in ("x", "y", "a", "b") if m.group(k)}
        for m in re.finditer(r"⟦(?P<x>\d+)⟧" + ctx, t):
            if m.group("x") in usados:
                continue
            antes = t[:m.start()]
            verbos = (("add", ("aditad", "aditando", "aditamento", "aditar", "acrescentad", "inserid", "adita-se")), ("del", ("eliminad", "eliminando", "elimina-se", "suprimid", "suprimindo", "suprime-se", "eliminar")))
            depois_ = re.match(r"\s*,?\s*(?:in fine,?\s*)?(?:é|são)\s+(aditad|eliminad|suprimid)", t[m.end():])
            if depois_:
                verbo = (0, "add" if depois_.group(1) == "aditad" else "del")
            else:
                verbo = max(((antes.rfind(v), k) for k, vs in verbos for v in vs), default=(-1, None))
            if verbo[0] < 0:
                continue
            perto = t[max(0, m.start() - 60):m.start()] + t[m.end():m.end() + 25]
            onde = "fim" if re.search(r"in fine|no final|no fim|parte final", perto) else "inicio" if re.search(r"no início|parte inicial|ao início", perto) else None
            mm = re.match(r"\s*,?\s*(?:após|depois de|a seguir a)\s+(?:a expressão\s+)?⟦(\d+)⟧", t[m.end():])
            a = m.group("a") or (mm.group(1) if mm else None)
            if mm:
                usados.add(mm.group(1))
            ops.append((verbo[1], m.group("x"), None, a, m.group("b"), m.start(), onde))
            usados |= {k for k in (m.group("x"), m.group("a"), m.group("b")) if k}
        if not ops:
            return False
        ok = True
        for op in ops:
            alvos = [alvo] if alvo is not None else [u for u in art.unidades if not u.oculta]
            if "epígrafe" in t and alvo is None:
                alvos = [None] + alvos
            feito = False
            for u in alvos:
                texto0 = art.epigrafe if u is None else u.texto
                novo = _editar(texto0, op, q)
                if novo is not None:
                    if u is None:
                        art.epigrafe = novo
                    else:
                        u.texto = novo
                    feito = True
                    break
            ok = ok and feito
        return ok


def _entre(texto: str, a: str, b: str):
    """Where A is followed by B, allowing a comma or semicolon between them that the act leaves out."""
    return re.search(re.escape(a) + r"(\s*)([,;]?)(\s*)" + re.escape(b), texto)


def _editar(texto: str, op: tuple, q: list[str]) -> str | None:
    tipo, x, y, a, b = op[0], q[int(op[1])], (q[int(op[2])] if op[2] else None), (q[int(op[3])] if op[3] else None), (q[int(op[4])] if op[4] else None)
    onde = op[6] if len(op) > 6 else None
    sep = lambda s: "" if s[:1] in ",;.:" else " "
    if tipo == "sub":
        if a is not None and b is not None:
            m = re.search(re.escape(a) + r"\s*" + re.escape(x) + r"\s*" + re.escape(b), texto)
            if m:
                return texto[:m.start()] + a + sep(y) + y + sep(b) + b + texto[m.end():]
            m = re.search(re.escape(x) + r"\s*" + re.escape(b), texto) or re.search(re.escape(a) + r"\s*" + re.escape(x), texto)
            if m:
                return texto[:m.start()] + m.group(0).replace(x, y, 1) + texto[m.end():]
        i = texto.find(x)
        return None if i < 0 else texto[:i] + y + texto[i + len(x):]
    if tipo == "add":
        if a is not None and b is not None:
            m = _entre(texto, a, b)
            if m:
                p = m.group(2)
                if p and x.rstrip().endswith(p):  # "entre «culturais» e «mediante»" with «e ambientais,»
                    return texto[:m.start()] + a + sep(x) + x + " " + b + texto[m.end():]
                return texto[:m.start()] + a + sep(x) + x + p + sep(b) + b + texto[m.end():]
            # The act's anchor can include words of the insertion ("entre «organização e» e «os
            # princípios»" for a text that reads "organização os princípios"): the words of A
            # missing from the text go in with the insertion.
            pa = a.split()
            for k in range(len(pa) - 1, 0, -1):
                cab, cauda = " ".join(pa[:k]), " ".join(pa[k:])
                m = re.search(re.escape(cab) + r"(\s*)" + re.escape(b), texto)
                if m:
                    ins = cauda + sep(x) + x
                    return texto[:m.start()] + cab + " " + ins + sep(b) + b + texto[m.end():]
            pb = b.split()
            for k in range(1, len(pb)):
                cab, cauda = " ".join(pb[:k]), " ".join(pb[k:])
                m = re.search(re.escape(a) + r"(\s*)" + re.escape(cauda), texto)
                if m:
                    return texto[:m.start()] + a + sep(x) + x + " " + cab + " " + cauda + texto[m.end():]
            return None
        if a is not None:
            i = texto.find(a)
            return None if i < 0 else texto[:i + len(a)] + sep(x) + x + texto[i + len(a):]
        if onde == "inicio":
            return x + " " + texto[:1].lower() + texto[1:] if x and x[-1].isalpha() else x + texto
        m = re.search(r"[.;:]?$", texto)
        return texto[:m.start()] + sep(x) + x + texto[m.start():]
    if tipo == "del":
        if a is not None and b is not None:
            m = re.search(re.escape(a) + r"\s*" + re.escape(x) + r"\s*" + re.escape(b), texto)
            if m:
                return texto[:m.start()] + a + sep(b) + b + texto[m.end():]
            m = re.search(re.escape(x) + r"\s*" + re.escape(b), texto)
            if m:
                return texto[:m.start()] + b + texto[m.end():]
        i = texto.find(x)
        if i < 0:
            return None
        out = texto[:i] + texto[i + len(x):]
        return re.sub(r"\s{2,}", " ", re.sub(r"\s+([,.;:])", r"\1", out)).strip()
    return None


def _arrumar(art: Artigo):
    """What the drafters leave implicit, done the way the republications do it.

    - A new alínea or número inserted at a label that is taken pushes the old ones down
      (1992: "é aditada uma nova alínea f)", and the old f) became g)).
    - A text without números that gets a n.º 2 becomes n.º 1.
    - In a list of alíneas, every one ends in ";" and the last in ".".
    """
    vis = [u for u in art.unidades if not u.oculta]
    grupos: dict = {}
    for u in vis:
        if u.tipo in ("n", "al"):
            grupos.setdefault((u.tipo, id(u.pai) if u.tipo == "al" else 0), []).append(u)
    for (tipo, _), us in grupos.items():
        novos = [u for u in us if u.orig is None]
        for nu in novos:
            velhos = [u for u in us if u.orig is not None and u.rot == u.orig]
            if any(u.rot == nu.rot for u in velhos):
                chave = _chave_al if tipo == "al" else _chave_num
                for u in sorted(velhos, key=lambda u: chave(u.rot), reverse=True):
                    if chave(u.rot) >= chave(nu.rot):
                        u.rot = _seguinte(u.rot)
    nums = [u for u in vis if u.tipo == "n"]
    if nums and not any(u.rot == "1" for u in nums):
        ps = [u for u in vis if u.tipo == "p" and u.pai is None]
        if ps and any(u.orig is None for u in nums):
            ps[0].tipo, ps[0].rot = "n", "1"
    for (tipo, _), us in grupos.items():
        if tipo != "al" or not any(u.orig is None or u.rot != u.orig for u in us):
            continue
        us = sorted(us, key=lambda u: _chave_al(u.rot))
        for u in us[:-1]:
            if u.texto.endswith("."):
                u.texto = u.texto[:-1] + ";"
        if us[-1].texto.endswith(";"):
            us[-1].texto = us[-1].texto[:-1] + "."


def _seguinte(rot: str) -> str:
    if rot.isdigit():
        return str(int(rot) + 1)
    if re.fullmatch(r"[a-z]", rot):
        # Portuguese alíneas skip k, w and y in older texts; the CRP uses the plain alphabet minus those.
        nxt = chr(ord(rot) + 1)
        return {"k": "l", "w": "x", "y": "z"}.get(nxt, nxt)
    return rot


_REMISSAO = re.compile(r"(?P<pre>\b(?:artigos?|art\.os?)\s+)(?P<lista>(?:\d+\.?\s*º(?:-[A-Z])?(?:\s*,\s*|\s+e\s+|\s+a\s+))*\d+\.?\s*º(?:-[A-Z])?)(?P<pos>(?:\s+(?:d[oa]s?|n[oa]s?)\s+(?P<outro>[A-ZÉ][\w-]+))?)")


def _remissoes(artigos: list[Artigo], mapa: dict[str, str]):
    """A republication convention, not an instruction: references to articles that moved now
    use their new numbers ("artigo 136.º" became "artigo 133.º" in 1997). A reference followed by
    the name of another act ("artigo 8.º do Estatuto") is left alone."""
    if not mapa:
        return
    def troca(m):
        if m.group("outro") and m.group("outro") not in ("Constituição", "Governo", "Presidente", "Assembleia"):
            return m.group(0)
        lista = re.sub(r"(\d+)(\.?\s*º)(?:-([A-Z]))?", lambda x: mapa.get(x.group(1) + ("-" + x.group(3) if x.group(3) else ""), x.group(1) + ("-" + x.group(3) if x.group(3) else "")).split("-")[0] + x.group(2) + ("-" + mapa.get(x.group(1) + "-" + x.group(3), "").split("-")[1] if x.group(3) and "-" in mapa.get(x.group(1) + "-" + x.group(3), "") else ("-" + x.group(3) if x.group(3) else "")), m.group("lista"))
        return m.group("pre") + lista + m.group("pos")
    for a in artigos:
        for u in a.unidades:
            if not u.do_ato:
                u.texto = _REMISSAO.sub(troca, u.texto)


def aplicar(antes: dict[str, Artigo], texto_ato: str, convencoes: bool = True) -> tuple[dict[str, Artigo], list[str], set[str]]:
    r = Revisao(antes)
    for ins in instrucoes(parte_alteradora(texto_ato)):
        r.aplicar(ins)
    for a in r.artigos:
        if id(a) in r.tocados:
            _arrumar(a)
    if convencoes:
        mapa = {a.orig: a.num for a in r.artigos if a.orig and a.num != a.orig and not a.eliminado}
        _remissoes([a for a in r.artigos if not a.eliminado], mapa)
    depois = {}
    for a in r.artigos:
        if not a.eliminado:
            depois.setdefault(a.num, a)
    tocados = {a.num for a in r.artigos if id(a) in r.tocados and not a.eliminado}
    return depois, r.falhas, tocados


def medir(texto_antes: str, texto_ato: str) -> dict:
    """M1 for one revision: the replayed text against the act's own republication.

    "alterados": articles the act changed; the share reproduced exactly is the score.
    "inalterados": articles the act did not change. Their share equal to the republication is the
    ceiling: when two official texts of an unchanged article differ, it is a transcription slip in
    one of them, and the same slips hit the changed articles.
    """
    depois, falhas, tocados = aplicar(constituicao_de(texto_antes), texto_ato)
    oficial = constituicao_de(texto_ato)
    n_ins = sum(1 for i in instrucoes(parte_alteradora(texto_ato)) if i["lc"] and not re.match(r"^A Constituição da República", i["texto"]))
    res = {"artigos": len(oficial), "iguais": 0, "so_forma": 0, "alterados": 0, "alterados_iguais": 0,
           "inalterados": 0, "inalterados_iguais": 0, "instrucoes": n_ins, "por_ler": len(falhas), "erros": []}
    for num, a in oficial.items():
        r = depois.get(num)
        v = verificacao.comparar(texto_de(r), texto_de(a))["veredicto"] if r else "falta"
        ok = v in ("igual", "so_forma")
        res["iguais"] += v == "igual"
        res["so_forma"] += v == "so_forma"
        k = "alterados" if num in tocados else "inalterados"
        res[k] += 1
        res[k + "_iguais"] += ok
        if not ok:
            res["erros"].append(num)
    res["m1"] = round(res["alterados_iguais"] / res["alterados"], 4) if res["alterados"] else None
    res["teto"] = round(res["inalterados_iguais"] / res["inalterados"], 4) if res["inalterados"] else None
    return res


if __name__ == "__main__":
    import fetch
    REVS = [("decreto-aprovacao-constituicao", "1976-502635"), ("lei-constitucional", "1-1982-375254"), ("lei-constitucional", "1-1989-496551"),
            ("lei-constitucional", "1-1992-174316"), ("lei-constitucional", "1-1997-653562"), ("lei-constitucional", "1-2001-577358"),
            ("lei-constitucional", "1-2004-506783"), ("lei-constitucional", "1-2005-243729")]
    textos = [fetch.cached("act", t, k)["Texto"] for t, k in REVS]
    for k in range(1, len(REVS)):
        r = medir(textos[k - 1], textos[k])
        print("%s: alterados %d/%d (M1 %.1f%%); inalterados %d/%d (teto %.1f%%); %d de %d instruções por ler"
              % (REVS[k][1], r["alterados_iguais"], r["alterados"], 100 * (r["m1"] or 0), r["inalterados_iguais"], r["inalterados"],
                 100 * (r["teto"] or 0), r["por_ler"], r["instrucoes"]))
