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
    """Groups of one legislatura, in the AR's own order, and the seats of each group on a date."""

    def __init__(self, info: dict):
        self.ordem = [g["sigla"] for g in info.get("GruposParlamentares") or [] if g.get("sigla")]
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
                    out[ALIAS.get(g, g)] += 1
        return dict(out)


def carregar_composicoes(pdir: str) -> dict[str, Composicao]:
    out = {}
    for path in glob.glob(os.path.join(pdir, "InformacaoBase*_json.txt")):
        leg = re.search(r"InformacaoBase(\w+?)_json", path).group(1)
        with open(path, encoding="utf-8-sig") as fh:
            out[leg] = Composicao(json.load(fh))
    return out


# ---- One vote ----------------------------------------------------------------------------------
_CONTAGEM = re.compile(r"^(\d+)-(.+)$")
_NOMEADO = re.compile(r"^(.+?)\s*\(([^()]+)\)$")


def ler_voto(posicoes: dict[str, str]) -> dict:
    """{who: sentido} from the AR record -> groups by sentido, deputy counts and dissent.

    "PS": a group. "119-PS": 119 deputies of PS (an electronic vote). "Manuel Alegre (PS)":
    a named deputy who voted apart from the group. "(Ninsc)" and "(Indep)": deputies outside groups.
    """
    grupos: dict[str, str] = {}
    contagens: dict[str, dict[str, int]] = {}
    nomeados: list[dict] = []
    for who, sentido in posicoes.items():
        who = re.sub(r"\s+", " ", who).strip()
        m = _CONTAGEM.match(who)
        if m:
            g = ALIAS.get(m.group(2), m.group(2))
            contagens.setdefault(g, {})[sentido] = contagens.get(g, {}).get(sentido, 0) + int(m.group(1))
            continue
        m = _NOMEADO.match(who)
        if m:
            g = m.group(2)
            nomeados.append({"nome": m.group(1), "grupo": None if g in ("Ninsc", "Indep") else ALIAS.get(g, g),
                             "sentido": sentido, "fora_de_grupo": g in ("Ninsc", "Indep")})
            continue
        grupos[ALIAS.get(who, who)] = sentido
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
    return {"grupos": grupos, "contagens": contagens, "dissidencia": dissidencia,
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
_SIGLA = r"[A-Z]{1,6}(?:[-/][A-Z]{1,6})?"
_PROPONENTE = re.compile(r"(?:apresentad[ao]s? pel[oa]s?|[Pp]ropostas? (?:de alteração )?(?:d[oa]s?|apresentada pel[oa]))\s+(?:GP d[oa] |Grupo Parlamentar d[oa] )?"
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
_CITACAO = re.compile(r"\b(Proposta|Projeto)s? de Lei\b|\b(\d+)/([IVXLC]+)\b")


def citadas(descricao: str | None) -> set[tuple[str, str, str]]:
    """The initiatives a committee text names: {("Proposta de Lei", "129", "XIII"), …}.

    "relativo à Proposta de Lei n.º 129/XIII/3.ª (GOV), e dos Projetos de Lei n.ºs 847/XIII/3.ª (BE)"
    """
    out, tipo = set(), None
    for m in _CITACAO.finditer(re.sub(r"<[^>]+>", " ", descricao or "")):
        if m.group(1):
            tipo = m.group(1) + " de Lei"
        elif tipo:
            out.add((tipo, m.group(2), m.group(3)))
    return out


def _voto(v, comp: Composicao | None) -> dict:
    """One vote as the app shows it, checked against the seats of the day."""
    voto = ler_voto(v.positions)
    assentos = comp.assentos(v.date) if comp else None
    return {
        "data": v.date, "fase": v.phase, "resultado": v.result, "unanime": bool(v.unanimous),
        "ausentes": [ALIAS.get(a, a) for a in v.absent], "descricao": v.description, "proposta": ler_descricao(v.description),
        "grupos": voto["grupos"], "contagens": voto["contagens"], "dissidencia": voto["dissidencia"], "fora_de_grupo": voto["fora_de_grupo"],
        "sem_registo": [] if v.unanimous or not assentos else [g for g in (comp.ordem if comp else []) if assentos.get(g) and g not in voto["grupos"] and g not in v.absent],
        "verificacao": verificar(voto, v.result, assentos)}


def generalidade(inis: list[tuple[dict, object]], comps: dict[str, Composicao]) -> tuple[list[dict], list[dict]]:
    """The generalidade votes of an act: each initiative's own vote, and the committee texts.

    The AR records the vote on a committee text under every initiative it replaces, and an
    initiative can feed two texts that became two laws (Lei n.º 12/2019 and Lei n.º 13/2019 share
    the Projeto de Lei n.º 847/XIII). So a committee text belongs to this act when the initiatives
    it names match the act's initiatives best.
    """
    do_ato = {(i.kind, str(i.number), i.legislature) for _, i in inis}
    proprios, textos = [], {}
    for _, i in inis:
        comp = comps.get(i.legislature)
        own = None
        for v in i.votes:
            if v.phase != "Votação na generalidade":
                continue
            if _TEXTO_COMISSAO.match(v.description or ""):
                textos.setdefault((v.date, re.sub(r"\W+", "", v.description).lower()[:300]), (v, comp))
            elif own is None:
                own = _voto(v, comp)
        sem = any(f.startswith("Requerimento Baixa Comissão sem Votação") for _, f in i.events)
        proprios.append({"voto": own, "baixa_sem_votacao": own is None and sem})

    def nota(v):
        c = citadas(v.description)
        return len(c & do_ato) / len(c | do_ato) if c else 0.0
    melhor = max((nota(v) for v, _ in textos.values()), default=0.0)
    escolhidos = sorted((x for x in textos.values() if melhor and nota(x[0]) == melhor), key=lambda x: x[0].date)
    out = []
    for v, comp in escolhidos:
        c = citadas(v.description)
        out.append({**_voto(v, comp), "citadas": [str(i.id) for _, i in inis if (i.kind, str(i.number), i.legislature) in c]})
    return proprios, out


def passagem(inis: list[tuple[dict, object]], ato_id: str, comps: dict[str, Composicao] | Composicao | None) -> dict:
    """The passage of an act from its initiatives: [(raw AR record, normalised Initiative)].

    The main initiative is the one whose events end in the act's publication. The others were
    discussed with it ("discutidas em conjunto"): we keep their authors and generalidade vote.
    """
    def principal_de(x):
        return any(p == "Lei (Publicação DR)" for _, p in x[1].events)
    inis = sorted(inis, key=lambda x: (not principal_de(x), x[1].events[0][0] if x[1].events else ""))
    raw, ini = inis[0]
    if not isinstance(comps, dict):
        comps = {ini.legislature: comps} if comps else {}
    comp = comps.get(ini.legislature)
    passos: dict[str, dict] = {}
    for data, fase in ini.events:
        nome = _passo(fase)
        if nome and nome not in passos:
            passos[nome] = {"passo": nome, "data": data, "votacoes": []}
        elif nome == "promulgacao" and "(2ª versão)" in fase:
            passos[nome]["data"] = data
    checks = Counter()
    for v in ini.votes:
        if v.phase not in VOTOS_DO_TEXTO:
            continue
        nome = _passo(v.phase)
        if not nome:
            continue
        passos.setdefault(nome, {"passo": nome, "data": v.date, "votacoes": []})
        voto = _voto(v, comp)
        chk = voto["verificacao"]
        checks["ok" if chk and chk["ok"] else "falha" if chk else "sem"] += 1
        passos[nome]["votacoes"].append(voto)
    ordem = [n for n, _ in PASSOS]
    proprios, textos = generalidade(inis, comps)
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
    }
