"""The passage of a law through Parliament: who proposed it, each stage and each vote.

Everything here comes from the Assembleia da República (AR) open data:
- Iniciativas: authors, events and votes (per group, with counts and named dissenters);
- Informação base: each deputy's group and status over time, for the seats on a vote date.

We never show an AR result without checking it against the seats of that day: the records
have errors (a vote recorded as "Aprovado" with the majority group against it).
See docs/PASSAGEM.md for the method and the display rules.
"""
from __future__ import annotations

import glob
import json
import os
import re
from collections import Counter

# Statuses that mean the deputy holds the seat on that day.
EM_FUNCOES = {"Efetivo", "Efetivo Temporário", "Efetivo Definitivo"}
# The same group under another name in some records.
ALIAS = {"PPD/PSD": "PSD", "CDS": "CDS-PP"}

# Event names (IniEventos[].Fase) by step of the passage, in order.
PASSOS = [
    ("iniciativa", ("Entrada",)),
    ("generalidade", ("Votação na generalidade",)),
    ("especialidade", ("Baixa comissão especialidade", "Discussão especialidade", "Votação na especialidade", "Votação Propostas de Alteração",
                       "Requerimento avocação plenário", "Votação requerimento avocação plenário", "Admissão Proposta de Alteração")),
    ("votacao-final", ("Votação final global",)),
    ("redacao-final", ("Envio à Comissão para fixação da Redação final", "Devolução do texto final pela comissão", "Requerimento dispensa redação final")),
    ("tribunal", ("Acordão TC",)),
    ("veto", ("Veto (Receção)", "Veto (Leitura)", "Veto (Publicação)")),
    ("reapreciacao", ("Reapreciação do decreto", "Admissão Proposta de Alteração decreto", "Votação novo decreto", "Confirmação do decreto")),
    ("promulgacao", ("Promulgação",)),
    ("publicacao", ("Lei (Publicação DR)",)),
    ("retificacao", ("Retificação à lei (Publicação DR)", "Retificação (Publicação DR)")),
]
# Votes that decide the text. Procedural votes (requerimentos) stay out of the passage.
VOTOS_DO_TEXTO = {"Votação na generalidade", "Votação na especialidade", "Votação Propostas de Alteração", "Votação final global",
                  "Votação novo decreto", "Confirmação do decreto"}


def _passo(fase: str) -> str | None:
    for nome, prefixos in PASSOS:
        if any(fase.startswith(p) for p in prefixos):
            return nome
    return None


# ---- Seats -------------------------------------------------------------------------------------
class Composicao:
    """Groups of one legislatura, in the AR's own order, and the seats of each group on a date.

    `mapa` turns a deputy's group sigla into the sigla shown for this legislatura (quem.Grupos):
    the records of one legislatura sometimes use another form of the name ("PPD/PSD" for "PSD").
    """

    def __init__(self, info: dict, mapa=None):
        self.mapa = mapa or (lambda s: ALIAS.get(s, s))
        excluir = {"DESC"}
        self.ordem = [g["sigla"] for g in info.get("GruposParlamentares") or [] if g.get("sigla") and g["sigla"] not in excluir]
        self.deputados = []
        for d in info.get("Deputados") or []:
            sit = [(s.get("sioDtInicio") or "", s.get("sioDtFim") or "9999") for s in d.get("DepSituacao") or [] if s.get("sioDes") in EM_FUNCOES]
            gps = [(g.get("gpDtInicio") or "", g.get("gpDtFim") or "9999", g.get("gpSigla") or "") for g in d.get("DepGP") or []]
            if sit and gps:
                self.deputados.append((sit, gps))

    def assentos(self, data: str) -> dict[str, int]:
        out: Counter = Counter()
        for sit, gps in self.deputados:
            if any(a <= data <= b for a, b in sit):
                g = next((s for a, b, s in gps if a <= data <= b), None)
                if g:
                    out[self.mapa(g)] += 1
        return dict(out)


def carregar_composicoes(pdir: str, grupos=None) -> dict[str, Composicao]:
    """{legislatura: Composicao}. With grupos (quem.Grupos), siglas follow the file of each legislatura."""
    out = {}
    for path in glob.glob(os.path.join(pdir, "InformacaoBase*_json.txt")):
        leg = re.search(r"InformacaoBase(\w+?)_json", path).group(1)
        with open(path, encoding="utf-8-sig") as fh:
            mapa = (lambda s, leg=leg: grupos.sigla(s, leg)) if grupos is not None else None
            out[leg] = Composicao(json.load(fh), mapa)
    return out


# ---- One vote ----------------------------------------------------------------------------------
_CONTAGEM = re.compile(r"^(\d+)-(.+)$")
_NOMEADO = re.compile(r"^(.+?)\s*\(([^()]+)\)$")


def ler_voto(posicoes: dict[str, str], mapa=None) -> dict:
    """{who: sentido} from the AR record -> groups by sentido, deputy counts and dissent.

    "PS": a group. "119-PS": 119 deputies of PS (an electronic vote). "Manuel Alegre (PS)":
    a named deputy who voted apart from the group. "(Ninsc)" and "(Indep)": deputies outside groups.
    Sentido "ausente" («Ausência: CDS, PEV, Carlos Macedo (Indep)»): a group in it goes to
    `ausentes`; a named deputy in it is left out (an absence is not dissent).
    `mapa` gives the sigla shown for the legislatura of the vote (default: ALIAS).
    """
    mapa = mapa or (lambda s: ALIAS.get(s, s))
    grupos: dict[str, str] = {}
    contagens: dict[str, dict[str, int]] = {}
    nomeados: list[dict] = []
    ausentes: list[str] = []
    for who, sentido in posicoes.items():
        who = re.sub(r"\s+", " ", who).strip()
        m = _CONTAGEM.match(who)
        if m:
            if sentido == "ausente":
                continue
            g = mapa(m.group(2))
            contagens.setdefault(g, {})[sentido] = contagens.get(g, {}).get(sentido, 0) + int(m.group(1))
            continue
        m = _NOMEADO.match(who)
        if m:
            if sentido == "ausente":
                continue
            g = m.group(2)
            fora = g in ("Ninsc", "Indep", "NiCR")
            nomeados.append({"nome": m.group(1), "grupo": None if fora else mapa(g), "sentido": sentido, "fora_de_grupo": fora})
            continue
        if sentido == "ausente":
            if mapa(who) not in ausentes:
                ausentes.append(mapa(who))
            continue
        grupos[mapa(who)] = sentido
    # A group known only by counts votes with its largest count. Its other counts are dissent.
    dissidencia = []
    for g, cs in contagens.items():
        principal = grupos.get(g) or max(cs, key=cs.get)
        grupos.setdefault(g, principal)
        for s, n in cs.items():
            if s != principal:
                dissidencia.append({"grupo": g, "sentido": s, "n": n})
    for x in nomeados:
        if x["grupo"] and grupos.get(x["grupo"]) != x["sentido"]:
            dissidencia.append({"grupo": x["grupo"], "sentido": x["sentido"], "nome": x["nome"]})
    return {"grupos": grupos, "contagens": contagens, "dissidencia": dissidencia, "ausentes": [g for g in ausentes if g not in grupos],
            "fora_de_grupo": [{"nome": x["nome"], "sentido": x["sentido"]} for x in nomeados if x["fora_de_grupo"]]}


def verificar(voto: dict, resultado: str | None, assentos: dict[str, int] | None) -> dict | None:
    """Check the recorded result against the seats of the day. None when we cannot check.

    Counts from an electronic vote win over seats. Dissent and absent groups come off.
    Only an "Aprovado" with no more votes for than against fails: a "Rejeitado" with more votes
    for can be right when the vote needs a qualified majority (a constitutional revision).
    """
    if not resultado or not voto["grupos"] or not assentos:
        return None
    tot = Counter()
    contou = False
    for g, s in voto["grupos"].items():
        cs = voto["contagens"].get(g, {})
        if s in cs:  # an electronic vote counted the whole group
            contou = True
            for s2, n in cs.items():
                tot[s2] += n
            continue
        n = assentos.get(g)
        if n is None:
            return None
        # Counts that differ from the group's position are deputies who voted apart from it.
        n -= sum(cs.values()) + sum(1 for d in voto["dissidencia"] if d["grupo"] == g and "nome" in d)
        tot[s] += max(0, n)
        for s2, k in cs.items():
            tot[s2] += k
    for d in voto["dissidencia"]:
        if "nome" in d:
            tot[d["sentido"]] += 1
    for x in voto["fora_de_grupo"]:
        tot[x["sentido"]] += 1
    ok = not (resultado.startswith("Aprovad") and tot["favor"] <= tot["contra"])
    return {"ok": ok, "favor": tot["favor"], "contra": tot["contra"], "abstencao": tot["abstencao"],
            "metodo": "contagens" if contou else "assentos"}


# "Proposta 30P, apresentada pelo PS, de emenda do n.º 1 ao artigo 112.º (Anexo)"
# "Proposta de alteração do PSD – Eliminação da alínea c) do n.º 2 do artigo 1.º do texto final"
# "Proposta, do PSD, de substituição do n.º 3 do artigo 1.º" (LO 1/2024: a comma after "Proposta")
_SIGLA = r"[A-Z]{1,6}(?:[-/][A-Z]{1,6})?"
_PROPONENTE = re.compile(r"(?:apresentad[ao]s? pel[oa]s?|[Pp]ropostas?,? (?:de alteração,? )?(?:d[oa]s?|apresentada pel[oa]))\s+(?:GP d[oa] |Grupo Parlamentar d[oa] )?"
                         r"(%s(?:, %s)*(?: e %s)?)\b" % (_SIGLA, _SIGLA, _SIGLA))
# "Proposta de alteração" names the document, not the operation, so it is not an operation here.
_OPERACAO = re.compile(r"\b(emenda|substituição|aditamento|eliminação)\b", re.I)
_ALVO = re.compile(r"((?:(?:d[ao]s? |à |ao |)(?:alínea|alíneas|n\.º|n\.os|número|números)\s[^–;]*?)?(?:d[oa]s? |ao |)artigos? \d+\.º(?:-[A-Z]+)?)")


def ler_descricao(descricao: str | None) -> dict | None:
    """Proposal, proponent, operation and target from the description of a vote, when it says."""
    if not descricao:
        return None
    t = re.sub(r"<[^>]+>", " ", descricao)
    t = re.sub(r"\s+", " ", t).strip()
    p, o, a = _PROPONENTE.search(t), _OPERACAO.search(t), _ALVO.search(t)
    if not (p or a):
        return None
    return {"proponente": p.group(1) if p else None, "operacao": o.group(1).lower() if o else None,
            "alvo": re.sub(r"^(?:d[oa]s?|à|ao) ", "", a.group(1).strip()) if a else None}


# ---- The passage of one act ----------------------------------------------------------------------
def autores(raw: dict) -> dict:
    """Who proposed the initiative. IniAutorOutros.nome is a category ("Governo", "Grupos
    Parlamentares", "Deputados", "Comissões", "PAR", a regional assembly, "Cidadãos"). For groups
    and deputies, the names are in IniAutorGruposParlamentares and IniAutorDeputados."""
    cat = (raw.get("IniAutorOutros") or {}).get("nome") or ""
    gps = [g.get("GP") for g in raw.get("IniAutorGruposParlamentares") or [] if g.get("GP")]
    deps = [{"nome": d.get("nome"), "grupo": d.get("GP")} for d in raw.get("IniAutorDeputados") or [] if d.get("nome")]
    base = {"nome": None, "grupos": gps, "deputados": deps}
    if cat.startswith("Governo"):
        return {**base, "tipo": "governo", "nome": "Governo"}
    if cat.startswith("Assembleia Legislativa"):
        return {**base, "tipo": "regiao", "nome": cat}
    if cat.startswith("Cidad"):
        return {**base, "tipo": "cidadaos"}
    if cat == "Comissões":
        return {**base, "tipo": "comissao"}
    if cat in ("PAR", "Mesa da Assembleia"):
        return {**base, "tipo": "mesa", "nome": "o Presidente da Assembleia da República" if cat == "PAR" else "a Mesa da Assembleia da República"}
    if cat == "Deputados" or (not gps and deps):
        return {**base, "tipo": "deputados"}
    return {**base, "tipo": "grupos"}


# A committee text that replaces the initiatives: "Texto de Substituição apresentado pela Comissão …".
_TEXTO_COMISSAO = re.compile(r"^\s*Texto (?:de substituição|final)\b", re.I)
_CITACAO = re.compile(r"\b(Proposta|Proje(?:c)?to)s? de [Ll]ei\b|\b(\d+)/([IVXLC]+)\b")  # «Projecto», «de lei»: as written
_PARTE = re.compile(r"((?:[Aa]rtigos?|[Nn]\.º) [^;()]{1,40}?)\s+d[oa]s?\s*$")


def citadas(descricao: str | None) -> set[tuple[str, str, str]]:
    """The initiatives a committee text names: {("Proposta de Lei", "129", "XIII"), …}.

    "relativo à Proposta de Lei n.º 129/XIII/3.ª (GOV), e dos Projetos de Lei n.ºs 847/XIII/3.ª (BE)"
    """
    return {(t, n, l) for t, n, l, _ in citadas_partes(descricao)}


def citadas_partes(descricao: str | None) -> list[tuple[str, str, str, str | None]]:
    """As citadas(), in the order of the text, with the part cited when the text cites only part of
    an initiative: "Artigo 8.º do Projeto de Lei n.º 847/XIII/3.ª (BE)" -> (…, "847", "XIII", "artigo 8.º")."""
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", descricao or ""))
    out, tipo, parte = [], None, None
    for m in _CITACAO.finditer(t):
        if m.group(1):
            tipo = m.group(1).replace("Projecto", "Projeto") + " de Lei"
            p = _PARTE.search(t[max(0, m.start() - 60):m.start()])
            parte = (p.group(1)[0].lower() + p.group(1)[1:]).strip() if p else None
        elif tipo:
            k = (tipo, m.group(2), m.group(3))
            if not any(x[:3] == k for x in out):
                out.append((*k, parte))
            parte = None
    return out


# "Decreto n.º 17/XVII", "Decretos n.ºs 95/XV, 96/XV e 97/XV", "Decretos n.º 97, 102, 103 e 112/XV",
# "Decreto da Assembleia da República n.º 49/XVII/1.ª"
_DECRETOS = re.compile(r"Decretos?(?: da Assembleia da República)?\s+n\.?\s*[ºo°]\s*s?\.?\s*((?:\d+(?:-[A-Z])?(?:/[IVXLC]+)?(?:/\d\.ª)?(?:\s*,\s*|\s+e\s+)?)+)")


def decretos_em(obs: str | None) -> list[str]:
    """The decree numbers an event's note names, each as "17/XVII"."""
    out = []
    for m in _DECRETOS.finditer(obs or ""):
        partes = re.findall(r"(\d+(?:-[A-Z])?)(?:/([IVXLC]+))?", re.sub(r"/\d\.ª", "", m.group(1)))
        leg = next((l for _, l in reversed(partes) if l), None)
        for n, l in partes:
            if l or leg:
                out.append(f"{n}/{l or leg}")
    return out


_TITULO_ASPAS = re.compile(r"[\"“«]([^\"”»]{8,})[\"”»]")


def _dobrar(s: str | None) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _voto(v, comp: Composicao | None, grupos=None, comps: dict | None = None) -> dict:
    """One vote as the app shows it, checked against the seats of the day.

    With grupos (quem.Grupos) and comps, the legislatura is the one of the vote date and every
    sigla is the one of that legislatura's AR file (R-5).
    """
    leg = grupos.legislatura_em(v.date) if grupos is not None else None
    if comps is not None and leg in comps:
        comp = comps[leg]
    mapa = (lambda s: grupos.sigla(s, leg)) if grupos is not None else (lambda s: ALIAS.get(s, s))
    voto = ler_voto(v.positions, mapa)
    ausentes = list(voto["ausentes"])
    for a in v.absent:  # the record's own list of absences holds groups and named deputies
        a = re.sub(r"\s+", " ", a).strip()
        if a and "(" not in a and mapa(a) not in ausentes and mapa(a) not in voto["grupos"]:
            ausentes.append(mapa(a))
    if grupos is not None:
        ausentes = [a for a in ausentes if grupos.e_grupo(a)]
    assentos = comp.assentos(v.date) if comp else None
    return {
        "data": v.date, "fase": v.phase, "resultado": v.result, "unanime": bool(v.unanimous),
        "ausentes": ausentes, "descricao": v.description, "proposta": ler_descricao(v.description),
        "grupos": voto["grupos"], "contagens": voto["contagens"], "dissidencia": voto["dissidencia"], "fora_de_grupo": voto["fora_de_grupo"],
        "sem_registo": [] if v.unanimous or not assentos else [g for g in (comp.ordem if comp else []) if assentos.get(g) and g not in voto["grupos"] and g not in ausentes],
        "verificacao": verificar(voto, v.result, assentos), "legislatura": leg}


def _chave_voto(v) -> tuple:
    """Two records of one vote: the same AR id, or the same date, phase, text and positions."""
    if getattr(v, "id", None):
        return ("id", v.id)
    return (v.date, v.phase, _dobrar(v.description)[:300], tuple(sorted(v.positions.items())))


def _escolher(textos: list, do_ato: set, alvos: list[str], outros: list[str]) -> tuple[list, bool]:
    """The committee texts of this act among the texts its initiatives voted (R-1, cascade step 3).

    Highest overlap of cited initiatives with the act's own wins. On a tie between different texts
    (LO 1/2026: both texts cite only PPL 1/XVII), the text whose description names the amended
    diploma or the act's title wins, and a text that names another decree's title loses.
    Returns (chosen, ambiguous).
    """
    def nota(v):
        c = citadas(v.description)
        return len(c & do_ato) / len(c | do_ato) if c else 0.0
    melhor = max((nota(v) for v in textos), default=0.0)
    if not melhor:
        return [], False
    escolhidos = [v for v in textos if nota(v) == melhor]

    def uma(vs):  # one vote recorded under several ids, with other punctuation (Lei n.º 3/2019)
        return len({(v.date, frozenset(citadas(v.description)), tuple(sorted(v.positions.items()))) for v in vs}) <= 1
    if uma(escolhidos):
        return escolhidos, False
    alvos_d = [_dobrar(a) for a in alvos if a and len(_dobrar(a)) >= 6]
    outros_d = [_dobrar(o) for o in outros if o and len(_dobrar(o)) >= 12]

    def pontos(v):
        d = _dobrar(v.description)
        return (any(a in d for a in alvos_d) and not any(o in d for o in outros_d), any(a in d for a in alvos_d))
    top = max(pontos(v) for v in escolhidos)
    finais = [v for v in escolhidos if pontos(v) == top]
    if top == (False, False) or not uma(finais):
        return [], True
    return finais, False


def generalidade(inis: list[tuple[dict, object]], comps: dict[str, Composicao], grupos=None, alvos=(), outros=()) -> tuple[list[dict], list[dict]]:
    """The generalidade votes of an act: each initiative's own vote, and the committee texts.

    The AR records the vote on a committee text under every initiative it replaces, and an
    initiative can feed two texts that became two laws (Lei n.º 12/2019 and Lei n.º 13/2019 share
    the Projeto de Lei n.º 847/XIII). So a committee text belongs to this act when the initiatives
    it names match the act's initiatives best (_escolher).
    """
    proprios, textos, _, _ = _generalidade(inis, comps, grupos, alvos, outros)
    return proprios, textos


def _generalidade(inis, comps, grupos=None, alvos=(), outros=(), ate=None):
    do_ato = {(i.kind, str(i.number), i.legislature) for _, i in inis}
    proprios, textos, vistos, descartados = [], [], set(), []
    for _, i in inis:
        comp = comps.get(i.legislature)
        own = None
        for v in i.votes:
            if v.phase != "Votação na generalidade" or (ate and v.date > ate):
                continue
            if _TEXTO_COMISSAO.match(v.description or ""):
                k = _chave_voto(v)
                if k not in vistos:
                    vistos.add(k)
                    textos.append(v)
            elif own is None:
                own = _voto(v, comp, grupos, comps)
        sem = any(f.startswith("Requerimento Baixa Comissão sem Votação") for _, f in i.events)
        proprios.append({"voto": own, "baixa_sem_votacao": own is None and sem})
    escolhidos, ambiguo = _escolher(textos, do_ato, list(alvos), list(outros))
    # The same text voted twice (Lei n.º 3/2019): one vote with the same positions is kept.
    out, iguais = [], set()
    for v in sorted(escolhidos, key=lambda v: v.date):
        k = (v.date, frozenset(citadas(v.description)), tuple(sorted(v.positions.items())))
        if k in iguais:
            descartados.append({"fase": v.phase, "data": v.date, "motivo": "duplicado", "descricao": v.description})
            continue
        iguais.add(k)
        c = citadas(v.description)
        out.append({**_voto(v, comps.get(inis[0][1].legislature) if inis else None, grupos, comps),
                    "citadas": [str(i.id) for _, i in inis if (i.kind, str(i.number), i.legislature) in c],
                    "citadas_todas": [{"tipo": t, "numero": n, "legislatura": l, "parte": p} for t, n, l, p in citadas_partes(v.description)]})
    for v in textos:
        if v not in escolhidos:
            descartados.append({"fase": v.phase, "data": v.date, "motivo": "sem_correspondencia" if ambiguo else "outro_decreto", "descricao": v.description})
    return proprios, out, descartados, ambiguo


def passagem(inis: list[tuple[dict, object]], ato_id: str, comps: dict[str, Composicao] | Composicao | None, ctx: dict | None = None) -> dict:
    """The passage of an act from its initiatives: [(raw AR record, normalised Initiative)].

    The main initiative is the one whose events end in the act's publication. The others were
    discussed with it ("discutidas em conjunto"): we keep their authors and generalidade vote.

    ctx (from build.link_parliament): "publicacao" (the act's DR date), "grupos" (quem.Grupos),
    "decretos" ({"meus": [...], "outros": [...]}, the Decretos da AR of these initiatives, each
    {"numero", "titulo"}), "alvos" (names of the diplomas the act changed and its title).
    With it, the matching cascade of R-1/R-3 applies: events and votes of another decree, or after
    the publication, are dropped and listed in `descartados`.
    """
    ctx = ctx or {}
    grupos = ctx.get("grupos")
    pub = ctx.get("publicacao")
    ate = _mais(pub, 1) if pub else None
    # Initiatives the act's committee text joined that the AR links to another law (PJL 847/XIII in
    # Lei n.º 13/2019): they are listed with their authors and own vote, never as the main one.
    juntas = set(ctx.get("juntas") or ())

    def principal_de(x):
        return str(x[1].id) not in juntas and any(p == "Lei (Publicação DR)" for _, p in x[1].events)
    inis = sorted(inis, key=lambda x: (str(x[1].id) in juntas, not principal_de(x), x[1].events[0][0] if x[1].events else ""))
    raw, ini = inis[0]
    if not isinstance(comps, dict):
        comps = {ini.legislature: comps} if comps else {}
    comp = comps.get(ini.legislature) or (comps.get(grupos.legislatura_em(ini.events[0][0])) if grupos and ini.events else None)
    decs = ctx.get("decretos") or {"meus": [], "outros": []}
    meus = [d["numero"] for d in decs["meus"]]
    outros_nums = [d["numero"] for d in decs["outros"]]
    outros_titulos = [d["titulo"] for d in decs["outros"] if d.get("titulo")]
    meus_titulos = [d["titulo"] for d in decs["meus"] if d.get("titulo")]
    n_decretos = len(meus) + len(outros_nums)
    alvos = list(ctx.get("alvos") or []) + meus_titulos
    descartados: list[dict] = []

    def do_ato(data, fase, obs) -> str | None:
        """None when the event belongs to this act, else the reason it does not (cascade step 2)."""
        if fase.startswith("Lei (Publicação DR)"):
            return None if not pub or abs(_dias(pub, data)) <= 1 else "sem_correspondencia"
        if ate and data > ate:
            return "depois_da_publicacao"
        nums = decretos_em(obs)
        if nums:
            if any(n in meus for n in nums):
                return None
            return "outro_decreto" if meus or outros_nums else None
        m = _TITULO_ASPAS.search(obs or "")
        if m and outros_nums:
            t = _dobrar(m.group(1))
            if any(_dobrar(x) == t for x in meus_titulos):
                return None
            if any(_dobrar(x) == t for x in outros_titulos):
                return "outro_decreto"
        return None if not outros_nums or not _decide(fase) else "sem_correspondencia"

    passos: dict[str, dict] = {}
    for e in getattr(ini, "details", None) or [{"data": d, "fase": f, "obs": None} for d, f in ini.events]:
        nome = _passo(e["fase"])
        if not nome:
            continue
        motivo = do_ato(e["data"], e["fase"], e["obs"]) if ctx else None
        if motivo:
            if nome in ("veto", "reapreciacao", "promulgacao", "publicacao", "tribunal"):
                descartados.append({"fase": e["fase"], "data": e["data"], "motivo": motivo})
            continue
        if nome not in passos:
            passos[nome] = {"passo": nome, "data": e["data"], "votacoes": []}
        elif nome == "promulgacao" and "(2ª versão)" in e["fase"]:
            passos[nome]["data"] = e["data"]
    checks = Counter()
    proprios, textos, desc_textos, ambiguo = _generalidade(inis, comps, grupos, alvos, outros_titulos, ate)
    descartados += desc_textos
    do_ato_set = {(i.kind, str(i.number), i.legislature) for _, i in inis}
    vfgs, eventos, vistos = [], [], set()
    for v in ini.votes:
        if v.phase not in VOTOS_DO_TEXTO:
            continue
        nome = _passo(v.phase)
        if not nome:
            continue
        k = _chave_voto(v)
        if k in vistos:
            continue
        vistos.add(k)
        if ctx:
            if v.phase == "Votação na generalidade" and _TEXTO_COMISSAO.match(v.description or ""):
                continue  # committee texts: chosen in _generalidade
            if v.phase == "Votação final global" and _TEXTO_COMISSAO.match(v.description or ""):
                vfgs.append(v)
                continue
            motivo = do_ato(v.date, v.phase, v.obs)
            if v.phase == "Votação final global" and motivo in (None, "sem_correspondencia"):
                vfgs.append(v)  # several decrees and no number: the choice below decides
                continue
            if motivo:
                descartados.append({"fase": v.phase, "data": v.date, "motivo": motivo})
                continue
        passos.setdefault(nome, {"passo": nome, "data": v.date, "votacoes": []})
        voto = _voto(v, comp, grupos, comps)
        chk = voto["verificacao"]
        checks["ok" if chk and chk["ok"] else "falha" if chk else "sem"] += 1
        passos[nome]["votacoes"].append(voto)
        if v.phase == "Confirmação do decreto":
            eventos.append({"tipo": "confirmacao", "data": v.date, "voto": voto})
        elif v.phase == "Votação novo decreto":
            eventos.append({"tipo": "novo_decreto", "data": v.date, "voto": voto})
    motivos: dict[str, str] = {}
    vfg = None
    if ctx:
        # The final vote. One distinct vote left: it is the act's. Several: a committee text is
        # chosen as for the generalidade; still several: ambiguous, and none is shown.
        def distintos(vs):
            out = {}
            for v in vs:
                out.setdefault((v.date, tuple(sorted(v.positions.items()))), v)
            return list(out.values())
        # A committee text that cites none of the act's initiatives is another law's (the AR record of
        # PPL 156/XIII, OE 2019, holds only the final vote on PPL 155/XIII's text).
        for v in [v for v in vfgs if citadas(v.description) and not citadas(v.description) & do_ato_set]:
            vfgs.remove(v)
            descartados.append({"fase": v.phase, "data": v.date, "motivo": "outro_decreto", "descricao": v.description})
        cand = distintos(vfgs)
        if len(cand) > 1:
            escolhido, _ = _escolher(cand, do_ato_set, alvos, outros_titulos)
            escolhido = distintos(escolhido)
            if len(escolhido) != 1:
                ao = [_dobrar(a) for a in alvos if a and len(_dobrar(a)) >= 6]
                escolhido = [v for v in cand if any(a in _dobrar(v.description) for a in ao)
                             and not any(_dobrar(o) in _dobrar(v.description) for o in outros_titulos if len(_dobrar(o)) >= 12)]
            for v in cand:
                if v not in escolhido:
                    descartados.append({"fase": v.phase, "data": v.date, "motivo": "outro_decreto" if len(escolhido) == 1 else "sem_correspondencia",
                                        "descricao": v.description})
            cand = escolhido if len(escolhido) == 1 else []
            if not cand:
                motivos["vfg"] = "voto_ambiguo"
        if cand:
            v = cand[0]
            vfg = _voto(v, comp, grupos, comps)
            # A final vote on a committee text names the initiatives it joined (LO 2/2006 has no
            # generalidade vote on that text: quem.py reads the committee text from here).
            if _TEXTO_COMISSAO.match(v.description or ""):
                vfg["citadas_todas"] = [{"tipo": t, "numero": n, "legislatura": l, "parte": p} for t, n, l, p in citadas_partes(v.description)]
            passos.setdefault("votacao-final", {"passo": "votacao-final", "data": v.date, "votacoes": []})
            passos["votacao-final"]["votacoes"] = [vfg]
            passos["votacao-final"]["data"] = v.date
            chk = vfg["verificacao"]
            checks["ok" if chk and chk["ok"] else "falha" if chk else "sem"] += 1
        else:
            motivos.setdefault("vfg", "sem_registo_vfg")
            passos.pop("votacao-final", None)
        vetos: dict[tuple, dict] = {}  # one veto per decree: the first of Receção, Leitura, Publicação
        for e in getattr(ini, "details", None) or []:
            if _passo(e["fase"]) == "veto" and not do_ato(e["data"], e["fase"], e["obs"]):
                m = re.search(r"Ac[óo]rd[ãa]o do Tribunal Constitucional n\.?\s*º\s*(\d+/\d{4})", e["obs"] or "")
                k = tuple(decretos_em(e["obs"]))
                x = vetos.setdefault(k, {"tipo": "veto", "data": e["data"], "acordao_tc": None})
                x["acordao_tc"] = x["acordao_tc"] or (m.group(1) if m else None)
            elif _passo(e["fase"]) == "tribunal" and not do_ato(e["data"], e["fase"], e["obs"]):
                eventos.append({"tipo": "tribunal", "data": e["data"]})
        if () in vetos and len(vetos) > 1:  # a note without a number repeats a numbered veto
            del vetos[()]
        eventos += vetos.values()
        eventos.sort(key=lambda x: (x["data"], ["tribunal", "veto", "novo_decreto", "confirmacao"].index(x["tipo"])))
    ordem = [n for n, _ in PASSOS]
    gen = [{"origem": "texto_comissao", "indice": k} for k in range(len(textos))]
    if not gen:
        gen = [{"origem": "iniciativa", "id": str(i.id)} for k, (_, i) in enumerate(inis) if proprios[k]["voto"]]
    if not gen:
        motivos["generalidade"] = "sem_generalidade"
    if textos and "generalidade" in passos:
        passos["generalidade"]["votacoes"] = [t for t in textos] + [v for v in passos["generalidade"]["votacoes"] if not _TEXTO_COMISSAO.match(v.get("descricao") or "")]
    # Step order (R-3): VFG ≤ veto ≤ reapreciação ≤ promulgação ≤ publicação. Out of order, the
    # dated steps go; the initiative and the generalidade stay.
    verificados = [passos[n]["data"] for n in ("votacao-final", "veto", "reapreciacao", "promulgacao", "publicacao") if n in passos]
    if ctx and verificados != sorted(verificados):
        for n in ("votacao-final", "veto", "reapreciacao", "promulgacao", "publicacao", "tribunal"):
            if n in passos:
                descartados.append({"fase": n, "data": passos[n]["data"], "motivo": "passos_fora_de_ordem"})
        passos = {n: p for n, p in passos.items() if n in ("iniciativa", "generalidade", "especialidade")}
        motivos["passos"] = "passos_descartados"
        eventos = []
    decreto = None
    if decs["meus"]:
        d = decs["meus"][-1]
        decreto = {"numero": d["numero"], "anteriores": [x["numero"] for x in decs["meus"][:-1]], "titulo": d.get("titulo")}
    return {
        "ato": ato_id, "legislatura": ini.legislature,
        "ordem_grupos": comp.ordem if comp else [],
        "iniciativas": [{"id": str(i.id), "designacao": f"{i.kind} n.º {i.number}/{i.legislature}", "titulo": i.title,
                         "autores": autores(r), "principal": k == 0,
                         "generalidade": proprios[k]["voto"], "baixa_sem_votacao": proprios[k]["baixa_sem_votacao"]}
                        for k, (r, i) in enumerate(inis)],
        "texto_comissao": textos,
        "passos": sorted(passos.values(), key=lambda p: (ordem.index(p["passo"]), p["data"])),
        "verificacao": dict(checks),
        "decreto": decreto, "generalidade": gen, "vfg": vfg, "eventos": eventos,
        "descartados": sorted(descartados, key=lambda x: (x["data"] or "", x["fase"])), "motivos": motivos,
    }


def _decide(fase: str) -> bool:
    """Events that belong to one decree: they need a match when an initiative has several."""
    return _passo(fase) in ("veto", "reapreciacao", "promulgacao", "tribunal", "votacao-final")


def _mais(d: str, n: int) -> str:
    import datetime as dt
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()


def _dias(a: str, b: str) -> int:
    import datetime as dt
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days
