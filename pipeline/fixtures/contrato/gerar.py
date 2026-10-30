"""Write the shared contract fixture: pipeline/fixtures/contrato/app-data/.

    python -I pipeline/fixtures/contrato/gerar.py

One diploma, «Lei de teste» (lei-teste, 3 articles), and the acts of the design spec §6.2, all with
numbers no real act has (9xx). Governments and Presidents are synthetic («Primeiro-Ministro de teste
A», «Presidente de teste A»), so no unverified fact enters the fixture. Legislaturas and group names
are real: they come from the AR files, through ar-grupos.json (pipeline/quem.py, Grupos).

The output is committed. pipeline/contrato.py must find no error in it (test_quem.py checks).
B serves it (app/test/servir.sh); C tests on in-memory copies of it. A shape change happens here
first. Only A edits this folder.
"""
from __future__ import annotations

import json
import os
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, PIPE)
import texto  # noqa: E402

OUT = os.path.join(AQUI, "app-data")
AR = json.load(open(os.path.join(AQUI, "ar-grupos.json"), encoding="utf-8"))
HOJE = "2026-10-30"
FONTE = "https://exemplo.invalid/fixture/fonte-de-teste"
ARL = "https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID="
DR = "https://diariodarepublica.pt/dr/detalhe/"

# ---- Synthetic Governments and Presidents ------------------------------------------------------
GOVERNOS = [
    {"numero": 1, "romano": "I", "inicio": "1976-07-23", "fim": "1983-01-01", "primeiro_ministro": "Primeiro-Ministro de teste A",
     "partidos": [], "nota_partidos": {"texto": "presidencial", "fonte": FONTE}, "em_gestao": []},
    {"numero": 2, "romano": "II", "inicio": "1983-01-01", "fim": "2010-06-01", "primeiro_ministro": "Primeiro-Ministro de teste B",
     "partidos": ["ps"], "nota_partidos": None, "em_gestao": []},
    {"numero": 3, "romano": "III", "inicio": "2010-06-01", "fim": "2020-01-01", "primeiro_ministro": "Primeiro-Ministro de teste B",
     "partidos": ["ps"], "nota_partidos": None, "em_gestao": []},
    {"numero": 4, "romano": "IV", "inicio": "2020-01-01", "fim": None, "primeiro_ministro": "Primeiro-Ministro de teste C",
     "partidos": ["psd", "cds-pp"], "nota_partidos": None,
     "em_gestao": [{"inicio": "2025-01-01", "fim": "2025-03-01", "fonte": FONTE}]},
]
for g in GOVERNOS:
    g["fontes"] = {"inicio": FONTE, "fim": FONTE, "primeiro_ministro": FONTE, "partidos": FONTE}
PRESIDENTES = [
    {"id": "presidente-teste-a", "nome": "Presidente de teste A", "inicio": "1976-07-14", "fim": "2006-03-09", "fonte": FONTE},
    {"id": "presidente-teste-b", "nome": "Presidente de teste B", "inicio": "2006-03-09", "fim": None, "fonte": FONTE},
]
PA, PB = ({"id": p["id"], "nome": p["nome"]} for p in PRESIDENTES)
ORDEM = {"VII": ["PS", "PSD", "CDS-PP", "PCP", "PEV"], "XIII": ["PSD", "PS", "BE", "CDS-PP", "PCP", "PEV", "PAN"],
         "XIV": ["PS", "PSD", "BE", "PCP", "CDS-PP", "PAN", "PEV", "CH", "IL", "L"]}


def gid(sigla, leg):
    return AR["siglas"][leg][sigla]


# ---- Acts --------------------------------------------------------------------------------------
def ato(aid, desig, pub, tipo_ato, sumario, **kw):
    tipo = aid.split("-")[0] if not aid.startswith("decreto") else "decreto-lei"
    tipo = {"declaracao": "declaracao-retificacao", "acordao": "acordao", "lei": "lei"}.get(tipo, tipo)
    return {"id": aid, "designacao": desig, "publicacao": pub, "dr": "900/" + (pub or "1970")[:4], "serie": "Série I",
            "link": DR + tipo + "/" + aid.split("-", 1)[-1] + "-900000" if tipo_ato != "pre1976" else None,
            "sumario": sumario, "alteracoes": [], "tipo_ato": tipo_ato, **kw}


ATOS = [
    ato("decreto-lei-90001", "Decreto-Lei n.º 90001", "1970-03-02", "pre1976", "Aprova a Lei de teste."),
    ato("decreto-lei-90002", "Decreto-Lei n.º 90002", "1974-02-01", "pre1976", "Altera a Lei de teste antes de 1976."),
    ato("decreto-lei-901-1977", "Decreto-Lei n.º 901/77", "1977-06-01", "decreto-lei", "Altera a Lei de teste (Governo sem partidos indicados)."),
    ato("decreto-lei-902-2010", "Decreto-Lei n.º 902/2010", "2010-06-20", "decreto-lei", "Altera a Lei de teste (aprovado antes de uma posse com o mesmo Primeiro-Ministro)."),
    ato("decreto-lei-903-2012", "Decreto-Lei n.º 903/2012", "2012-03-01", "decreto-lei", "Altera a Lei de teste (sem data do Conselho de Ministros)."),
    ato("lei-constitucional-901-1997", "Lei Constitucional n.º 901/97", "1997-09-20", "lei-constitucional", "Revisão de teste da Constituição.",
        ar={"legislatura": "VII", "diploma_id": "900001"}),
    ato("lei-organica-901-2018", "Lei Orgânica n.º 901/2018", "2018-07-10", "lei-organica", "Altera a Lei de teste (texto da comissão de 7 iniciativas; veto e novo decreto).",
        ar={"legislatura": "XIII", "diploma_id": "900002"}),
    ato("lei-902-2019", "Lei n.º 902/2019", "2019-02-12", "lei", "Altera a Lei de teste (texto da comissão de 3 iniciativas).",
        ar={"legislatura": "XIII", "diploma_id": "900003"}),
    ato("lei-901-2020", "Lei n.º 901/2020", "2020-10-15", "lei", "Altera a Lei de teste (proposta de lei; Tribunal Constitucional, veto e confirmação).",
        ar={"legislatura": "XIV", "diploma_id": "900004"}),
    ato("declaracao-de-retificacao-901-2020", "Declaração de Retificação n.º 901/2020", "2020-11-10", "retificacao", "Retifica a Lei n.º 901/2020."),
    ato("acordao-do-tribunal-constitucional-9001-2021", "Acórdão do Tribunal Constitucional n.º 9001/2021", "2021-03-01", "acordao-tc",
        "Declara a inconstitucionalidade, com força obrigatória geral, de uma norma da Lei de teste."),
    ato("lei-901-2022", "Lei n.º 901/2022", "2022-01-10", "lei", "Orçamento do Estado para 2022",
        ar={"legislatura": "XIV", "diploma_id": "900005"}),
    ato("lei-901-2023", "Lei n.º 901/2023", "2023-06-01", "lei", "Altera a Lei de teste (sem dados da passagem no Parlamento).",
        ar={"legislatura": "XV", "diploma_id": "900006"}),
]
A = {a["id"]: a for a in ATOS}

# ---- Articles of lei-teste ---------------------------------------------------------------------
# (ato, tipo, publicacao, vigor, texto)
ARTIGOS = {
    "artigo-1": ("Artigo 1.º", "Objeto", [
        ("decreto-lei-90001", "original", "1970-03-02", "1970-03-07", "1 — A presente lei regula o teste.\n2 — O prazo é de cinco anos."),
        ("decreto-lei-90002", "alterado", "1974-02-01", "1974-02-06", "1 — A presente lei regula o teste.\n2 — O prazo é de seis anos."),
        ("decreto-lei-901-1977", "alterado", "1977-06-01", "1977-06-06", "1 — A presente lei regula o teste e a prova.\n2 — O prazo é de seis anos."),
        ("lei-901-2020", "alterado", "2020-10-15", "2020-10-16", "1 — A presente lei regula o teste e a prova.\n2 — O prazo é de dez anos, contados da entrada."),
        ("declaracao-de-retificacao-901-2020", "retificado", "2020-11-10", "2020-10-16", "1 — A presente lei regula o teste e a prova.\n2 — O prazo é de dez anos, contados da data de entrada."),
        ("lei-901-2022", "alterado", "2022-01-10", "2022-01-01", "1 — A presente lei regula o teste e a prova.\n2 — O prazo é de oito anos, contados da data de entrada."),
    ], []),
    "artigo-2": ("Artigo 2.º", "Requisitos", [
        ("decreto-lei-90001", "original", "1970-03-02", "1970-03-07", "1 — São requisitos:\na) A residência;\nb) A idade."),
        ("decreto-lei-902-2010", "alterado", "2010-06-20", "2010-06-25", "1 — São requisitos:\na) A residência legal;\nb) A idade."),
        ("lei-902-2019", "alterado", "2019-02-12", "2019-02-13", "1 — São requisitos:\na) A residência legal;\nb) A idade.\n2 — O senhorio não pode opor-se."),
        ("lei-901-2023", "alterado", "2023-06-01", "2023-06-02", "1 — São requisitos:\na) A residência legal;\nb) A idade mínima.\n2 — O senhorio não pode opor-se."),
    ], [{"texto": "Declarada a inconstitucionalidade com força obrigatória geral da norma do n.º 2, na redação dada pela Lei n.º 902/2019, de 12 de fevereiro, com efeitos a partir de 2019-02-13.",
         "fonte": "Acórdão do Tribunal Constitucional n.º 9001/2021 - Diário da República n.º 900/2021, Série I de 2021-03-01",
         "artigo_do_ato": None, "ato": "acordao-do-tribunal-constitucional-9001-2021"}]),
    "artigo-3": ("Artigo 3.º", "Regime", [
        ("decreto-lei-90001", "original", "1970-03-02", "1970-03-07", "O regime é o geral."),
        ("lei-constitucional-901-1997", "alterado", "1997-09-20", "1997-09-25", "O regime é o geral, salvo lei especial."),
        ("decreto-lei-903-2012", "alterado", "2012-03-01", None, "O regime é o geral, salvo lei especial ou regulamento."),
        ("lei-organica-901-2018", "alterado", "2018-07-10", "2018-07-11", "O regime é o geral, salvo lei orgânica ou regulamento."),
    ], []),
}


def artigos():
    out = {}
    for aid, (rotulo, epigrafe, vs, notas) in ARTIGOS.items():
        spans = texto.blame([v[4] for v in vs])
        versoes = []
        for (ato_, tipo, pub, vigor, _), s in zip(vs, spans):
            v = {"ato": ato_, "tipo": tipo, "artigo_do_ato": None if tipo == "original" else "Artigo 2.º", "publicacao": pub, "vigor": vigor,
                 "vigor_conhecido": bool(vigor), "linhas": [[[o, t] for o, t in ln] for ln in texto.lines_of(s)]}
            if vigor:
                v["vigor_fonte"] = "Diário da República (legislação consolidada)"
            versoes.append(v)
            if tipo != "original":
                A[ato_]["alteracoes"].append({"diploma": "lei-teste", "artigo": aid, "rotulo": rotulo, "tipo": tipo, "vigor": vigor})
        out[aid] = {"rotulo": rotulo, "epigrafe": epigrafe, "estado": "vigente", "versoes": versoes, "notas": notas,
                    "id": aid, "diploma": "lei-teste", "caminho": ["Capítulo I"]}
    return out


# ---- Votes and passage -------------------------------------------------------------------------
def voto(data, fase, leg, grupos, resultado="Aprovado", ausentes=(), sem_registo=(), descricao=None, citadas=None, unanime=False):
    v = {"data": data, "fase": fase, "resultado": resultado, "unanime": unanime, "ausentes": list(ausentes), "descricao": descricao,
         "proposta": None, "grupos": grupos, "contagens": {}, "dissidencia": [], "fora_de_grupo": [], "sem_registo": list(sem_registo),
         "verificacao": None, "legislatura": leg}
    if citadas is not None:
        v["citadas"] = citadas
    return v


def autores(tipo, grupos=(), nome=None, deputados=()):
    return {"nome": nome, "grupos": list(grupos), "deputados": [{"nome": d, "grupo": g} for d, g in deputados], "tipo": tipo}


def ini(iid, desig, titulo, aut, principal, gen=None, baixa=False):
    return {"id": iid, "designacao": desig, "titulo": titulo, "autores": aut, "principal": principal, "generalidade": gen, "baixa_sem_votacao": baixa}


def passo(nome, data, votos=()):
    return {"passo": nome, "data": data, "votacoes": list(votos)}


TODOS_XIV = {"PS": "favor", "PSD": "contra", "BE": "favor", "PCP": "abstencao", "CDS-PP": "contra", "PAN": "favor", "PEV": "abstencao",
             "CH": "contra", "IL": "contra", "L": "favor"}
P = {}
# Lei 901/2020: Proposta de Lei of Government IV; TC ruling and veto; confirmation.
g = voto("2020-03-05", "Votação na generalidade", "XIV", TODOS_XIV)
vfg = voto("2020-07-10", "Votação final global", "XIV", TODOS_XIV)
conf = voto("2020-09-25", "Confirmação do decreto", "XIV", {**TODOS_XIV, "PCP": "favor"})
P["lei-901-2020"] = {
    "ato": "lei-901-2020", "legislatura": "XIV", "ordem_grupos": ORDEM["XIV"],
    "iniciativas": [ini("900101", "Proposta de Lei n.º 901/XIV", "Altera a Lei de teste.", autores("governo", nome="Governo"), True, g)],
    "texto_comissao": [],
    "passos": [passo("iniciativa", "2020-02-01"), passo("generalidade", "2020-03-05", [g]), passo("votacao-final", "2020-07-10", [vfg]),
               passo("tribunal", "2020-08-05"), passo("veto", "2020-08-20"), passo("reapreciacao", "2020-09-25", [conf]),
               passo("promulgacao", "2020-10-05"), passo("publicacao", "2020-10-15")],
    "verificacao": {"sem": 3},
    "decreto": {"numero": "902/XIV", "anteriores": ["901/XIV"], "titulo": "Altera a Lei de teste"},
    "generalidade": [{"origem": "iniciativa", "id": "900101"}], "vfg": vfg,
    "eventos": [{"tipo": "veto", "data": "2020-08-20", "acordao_tc": "9001/2020"}, {"tipo": "confirmacao", "data": "2020-09-25", "voto": conf}],
    "descartados": [{"fase": "Confirmação do decreto", "data": "2020-12-03", "motivo": "depois_da_publicacao"}],
    "motivos": {}}
# Lei 902/2019: committee text of 3 initiatives; the principal (BE) rejected on the generalidade; one cited only in part.
leg = "XIII"
gbe = voto("2018-12-13", "Votação na generalidade", leg, {"BE": "favor", "PCP": "favor", "PEV": "favor", "PS": "contra", "PSD": "contra", "CDS-PP": "contra", "PAN": "abstencao"}, resultado="Rejeitado")
gpsd = voto("2018-12-13", "Votação na generalidade", leg, {"PSD": "favor", "CDS-PP": "favor", "BE": "contra", "PCP": "contra", "PEV": "contra", "PS": "abstencao", "PAN": "abstencao"})
desc = ("Texto de Substituição apresentado pela Comissão de teste relativo à Proposta de Lei n.º 902/XIII/3.ª (GOV), ao Projeto de Lei n.º 901/XIII/3.ª (BE) "
        "e ao artigo 8.º do Projeto de Lei n.º 903/XIII/4.ª (PSD)")
tc = voto("2018-12-21", "Votação na generalidade", leg, {"PS": "favor", "BE": "favor", "PCP": "favor", "PEV": "favor", "PSD": "contra", "CDS-PP": "contra", "PAN": "abstencao"},
          descricao=desc, citadas=["900201", "900202", "900203"])
vfg2 = voto("2019-01-18", "Votação final global", leg, tc["grupos"], descricao=desc)
P["lei-902-2019"] = {
    "ato": "lei-902-2019", "legislatura": leg, "ordem_grupos": ORDEM[leg],
    "iniciativas": [
        ini("900202", "Projeto de Lei n.º 901/XIII", "Altera a Lei de teste (projeto de teste).", autores("grupos", ["BE"], deputados=[("Deputada de teste A", "BE")]), True, gbe),
        ini("900201", "Proposta de Lei n.º 902/XIII", "Altera a Lei de teste.", autores("governo", nome="Governo"), False, None, True),
        ini("900203", "Projeto de Lei n.º 903/XIII", "Altera a Lei de teste e outra lei.", autores("grupos", ["PSD"], deputados=[("Deputado de teste B", "PSD")]), False, gpsd)],
    "texto_comissao": [tc],
    "passos": [passo("iniciativa", "2018-04-30"), passo("generalidade", "2018-12-21", [tc]), passo("votacao-final", "2019-01-18", [vfg2]),
               passo("promulgacao", "2019-02-05"), passo("publicacao", "2019-02-12")],
    "verificacao": {"sem": 2},
    "decreto": {"numero": "903/XIII", "anteriores": [], "titulo": "Altera a Lei de teste"},
    "generalidade": [{"origem": "texto_comissao", "indice": 0}], "vfg": vfg2, "eventos": [],
    "descartados": [{"fase": "Votação na generalidade", "data": "2018-12-21", "motivo": "duplicado"}], "motivos": {}}
# Lei Orgânica 901/2018: committee text of 7 projects; veto and a new decree.
siglas7 = ["PS", "PSD", "BE", "CDS-PP", "PCP", "PEV", "PAN"]
inis7 = [ini(str(900300 + k), f"Projeto de Lei n.º {910 + k}/XIII", f"Altera a Lei de teste ({s}).", autores("grupos", [s]), k == 0,
             voto("2018-02-02", "Votação na generalidade", leg, {x: "favor" for x in siglas7}, unanime=True)) for k, s in enumerate(siglas7)]
desc7 = "Texto final apresentado pela Comissão de teste relativo aos Projetos de Lei n.ºs " + ", ".join(f"{910 + k}/XIII/3.ª ({s})" for k, s in enumerate(siglas7))
tc7 = voto("2018-02-02", "Votação na generalidade", leg, {x: "favor" for x in siglas7}, descricao=desc7, citadas=[i["id"] for i in inis7], unanime=True)
vfg7 = voto("2018-05-25", "Votação final global", leg, {"PS": "favor", "PSD": "favor", "BE": "favor", "PCP": "favor", "PEV": "favor", "PAN": "favor", "CDS-PP": "contra"},
            ausentes=["PEV"] and [], descricao=desc7)
vfg7["grupos"].pop("PEV")
vfg7["ausentes"] = ["PEV"]
novo = voto("2018-07-01", "Votação novo decreto", leg, {x: "favor" for x in siglas7 if x != "CDS-PP"} | {"CDS-PP": "abstencao"})
P["lei-organica-901-2018"] = {
    "ato": "lei-organica-901-2018", "legislatura": leg, "ordem_grupos": ORDEM[leg], "iniciativas": inis7, "texto_comissao": [tc7],
    "passos": [passo("iniciativa", "2017-10-02"), passo("generalidade", "2018-02-02", [tc7]), passo("votacao-final", "2018-05-25", [vfg7]),
               passo("veto", "2018-06-20"), passo("reapreciacao", "2018-07-01", [novo]), passo("promulgacao", "2018-07-04"), passo("publicacao", "2018-07-10")],
    "verificacao": {"sem": 3},
    "decreto": {"numero": "905/XIII", "anteriores": ["904/XIII"], "titulo": "Altera a Lei de teste"},
    "generalidade": [{"origem": "texto_comissao", "indice": 0}], "vfg": vfg7,
    "eventos": [{"tipo": "veto", "data": "2018-06-20", "acordao_tc": None}, {"tipo": "novo_decreto", "data": "2018-07-01", "voto": novo}],
    "descartados": [], "motivos": {}}
# Lei Constitucional 901/97: two projects of constitutional revision; the vote has an absent group.
leg = "VII"
glc = voto("1997-06-05", "Votação na generalidade", leg, {"PS": "favor", "PSD": "favor", "CDS-PP": "contra", "PCP": "contra"}, ausentes=["PEV"])
vlc = voto("1997-07-31", "Votação final global", leg, {"PS": "favor", "PSD": "favor", "CDS-PP": "contra", "PCP": "contra", "PEV": "contra"})
P["lei-constitucional-901-1997"] = {
    "ato": "lei-constitucional-901-1997", "legislatura": leg, "ordem_grupos": ORDEM[leg],
    "iniciativas": [ini("900401", "Projeto de Revisão Constitucional n.º 901/VII", "Revisão de teste.", autores("grupos", ["PS"]), True, glc),
                    ini("900402", "Projeto de Revisão Constitucional n.º 902/VII", "Revisão de teste.", autores("grupos", ["PSD"]), False, glc)],
    "texto_comissao": [], "passos": [passo("iniciativa", "1996-03-01"), passo("generalidade", "1997-06-05", [glc]), passo("votacao-final", "1997-07-31", [vlc]),
                                     passo("promulgacao", "1997-09-15"), passo("publicacao", "1997-09-20")],
    "verificacao": {"sem": 2}, "decreto": None,
    "generalidade": [{"origem": "iniciativa", "id": "900401"}, {"origem": "iniciativa", "id": "900402"}], "vfg": vlc,
    "eventos": [], "descartados": [], "motivos": {}}
# Lei 901/2022: the State Budget.
leg = "XIV"
goe = voto("2021-10-27", "Votação na generalidade", leg, {"PS": "favor", "PSD": "contra", "BE": "contra", "PCP": "abstencao", "CDS-PP": "contra", "PAN": "abstencao",
                                                          "PEV": "abstencao", "CH": "contra", "IL": "contra", "L": "abstencao"})
voe = voto("2021-11-25", "Votação final global", leg, goe["grupos"])
P["lei-901-2022"] = {
    "ato": "lei-901-2022", "legislatura": leg, "ordem_grupos": ORDEM[leg],
    "iniciativas": [ini("900501", "Proposta de Lei n.º 903/XIV", "Aprova o Orçamento do Estado para 2022.", autores("governo", nome="Governo"), True, goe)],
    "texto_comissao": [], "passos": [passo("iniciativa", "2021-10-11"), passo("generalidade", "2021-10-27", [goe]), passo("votacao-final", "2021-11-25", [voe]),
                                     passo("promulgacao", "2021-12-30"), passo("publicacao", "2022-01-10")],
    "verificacao": {"sem": 2}, "decreto": {"numero": "906/XIV", "anteriores": [], "titulo": "Orçamento do Estado para 2022"},
    "generalidade": [{"origem": "iniciativa", "id": "900501"}], "vfg": voe, "eventos": [], "descartados": [], "motivos": {}}

ENTRADA = {"900101": "2020-02-01", "900201": "2018-04-30", "900202": "2018-03-01", "900203": "2018-10-01", "900401": "1996-03-01", "900402": "1996-03-02",
           "900501": "2021-10-11", **{str(900300 + k): "2017-10-02" for k in range(7)}}
for p in P.values():
    A[p["ato"]]["iniciativas"] = [{"id": i["id"], "designacao": i["designacao"], "titulo": i["titulo"], "autores": i["autores"]} for i in p["iniciativas"]]


def iniciativas_json():
    out = {}
    for aid, p in P.items():
        for i in p["iniciativas"]:
            leg = i["designacao"].rsplit("/", 1)[1]
            votos = [i["generalidade"]] if i["generalidade"] else []
            out[i["id"]] = {"id": i["id"], "legislatura": leg, "tipo": i["designacao"].split(" n.º")[0], "numero": i["designacao"].split("n.º ")[1].split("/")[0],
                            "titulo": i["titulo"], "autores": i["autores"]["grupos"] or [i["autores"]["nome"] or "Deputados"],
                            "eventos": [[ENTRADA[i["id"]], "Entrada"]] + [[s["data"], {"generalidade": "Votação na generalidade", "votacao-final": "Votação final global",
                                                                                    "promulgacao": "Promulgação", "publicacao": "Lei (Publicação DR)"}.get(s["passo"], s["passo"])]
                                                                         for s in p["passos"][1:]],
                            "conjuntas": [], "votacoes": [{"data": v["data"], "fase": v["fase"], "resultado": v["resultado"], "unanime": v["unanime"],
                                                           "posicoes": v["grupos"], "ausentes": v["ausentes"], "descricao": v["descricao"]} for v in votos],
                            "ato": aid, "link": ARL + i["id"]}
    return out


# ---- quem.json ---------------------------------------------------------------------------------
def assin(aid, estado="ok"):
    a = A[aid]
    return {"estado": estado, "obtido_em": HOJE if estado in ("ok", "parcial") else None, "url": a["link"]}


def base(aid, **kw):
    r = {"tipo_ato": A[aid]["tipo_ato"], "governo": None, "governo_publicacao": None, "d_cm": None, "em_gestao": None, "presidente": None,
         "legislatura": None, "periodo": {"data": A[aid]["publicacao"], "base": "publicacao", "governo": None, "legislatura": None, "fora": None},
         "proponentes": [], "texto_comissao": None, "vfg": None, "eventos": [], "retifica": None, "retificado_por": [], "tribunal": None,
         "pre1976": None, "oe": None, "transitorias": [], "ar_url": None, "assinatura": assin(aid), "motivos": {}, "verificacao": []}
    r.update(kw)
    return r


def pres(p, d, b="assinatura"):
    return {**p, "d_promulgacao": d, "base": b}


def periodo(data, b, gov, leg, fora=None):
    return {"data": data, "base": b, "governo": gov, "legislatura": leg, "fora": fora}


def prop(iid, desig, tipo, gov=None, grupos=(), leg=None, res=None):
    return {"iniciativa": iid, "designacao": desig, "tipo": tipo, "governo": gov, "entrada": ENTRADA[iid],
            "grupos": [{"id": gid(s, leg), "sigla": s} for s in grupos], "sem_grupo": [], "nome": None, "resultado_generalidade": res}


ok = [{"regra": "presidente", "estado": "ok"}, {"regra": "referenda", "estado": "ok"}]
Q = {
    "decreto-lei-90001": base("decreto-lei-90001", pre1976={"signatarios": ["O Ministro de teste, Signatário de teste A"]},
                              periodo=periodo("1970-03-02", "publicacao", None, None, "antes_1976"), motivos={"governo": "antes_1976", "presidente": "antes_1976"},
                              assinatura={"estado": "sem_link", "obtido_em": None, "url": None}),
    "decreto-lei-90002": base("decreto-lei-90002", pre1976={"signatarios": ["O Ministro de teste, Signatário de teste B"]},
                              periodo=periodo("1974-02-01", "publicacao", None, None, "antes_1976"), motivos={"governo": "antes_1976", "presidente": "antes_1976"},
                              assinatura={"estado": "sem_link", "obtido_em": None, "url": None}),
    "decreto-lei-901-1977": base("decreto-lei-901-1977", governo={"numero": 1, "base": "conselho_ministros", "data": "1977-05-10"}, governo_publicacao=1,
                                 d_cm="1977-05-10", presidente=pres(PA, "1977-05-20"), legislatura="IA",
                                 periodo=periodo("1977-05-10", "d_cm", 1, "IA"), verificacao=ok + [{"regra": "cm_primeiro", "estado": "ok"}]),
    "decreto-lei-902-2010": base("decreto-lei-902-2010", governo={"numero": 2, "base": "conselho_ministros", "data": "2010-05-25"}, governo_publicacao=3,
                                 d_cm="2010-05-25", presidente=pres(PB, "2010-06-10"), legislatura="XI", periodo=periodo("2010-05-25", "d_cm", 2, "XI"),
                                 verificacao=ok + [{"regra": "mesmo_pm", "estado": "aviso", "detalhe": "d_cm a 7 dias da posse do Governo 3, com o mesmo Primeiro-Ministro"}]),
    "decreto-lei-903-2012": base("decreto-lei-903-2012", governo_publicacao=3, presidente=pres(PB, "2012-02-20"), legislatura="XII",
                                 periodo=periodo("2012-03-01", "publicacao", 3, "XII"), assinatura=assin("decreto-lei-903-2012", "parcial"),
                                 motivos={"governo": "sem_d_cm", "d_cm": "sem_d_cm"}, verificacao=[{"regra": "presidente", "estado": "ok"}]),
    "lei-constitucional-901-1997": base("lei-constitucional-901-1997", governo_publicacao=2, presidente=pres(PA, "1997-09-15"), legislatura="VII",
                                        periodo=periodo("1997-07-31", "vfg", 2, "VII", "revisoes"),
                                        proponentes=[prop("900401", "Projeto de Revisão Constitucional n.º 901/VII", "grupos", grupos=["PS"], leg="VII", res="Aprovado"),
                                                     prop("900402", "Projeto de Revisão Constitucional n.º 902/VII", "grupos", grupos=["PSD"], leg="VII", res="Aprovado")],
                                        vfg={"data": "1997-07-31", "unanime": False, "resultado": "Aprovado"},
                                        ar_url="https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID=900001",
                                        verificacao=[{"regra": "presidente", "estado": "ok"}, {"regra": "promulgacao_ar", "estado": "ok"}]),
    "lei-organica-901-2018": base("lei-organica-901-2018", governo_publicacao=3, presidente=pres(PB, "2018-07-04"), legislatura="XIII",
                                  periodo=periodo("2018-07-01", "reapreciacao", 3, "XIII"),
                                  proponentes=[prop(i["id"], i["designacao"], "grupos", grupos=i["autores"]["grupos"], leg="XIII", res="Aprovado") for i in inis7],
                                  texto_comissao={"tipo": "texto_final", "n_iniciativas": 7,
                                                  "iniciativas": [{"iniciativa": i["id"], "designacao": i["designacao"], "parte": None} for i in inis7]},
                                  vfg={"data": "2018-05-25", "unanime": False, "resultado": "Aprovado"},
                                  eventos=[{"tipo": "veto", "data": "2018-06-20", "presidente": "presidente-teste-b", "acordao_tc": None},
                                           {"tipo": "novo_decreto", "data": "2018-07-01"}],
                                  ar_url="https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID=900002",
                                  verificacao=[{"regra": "presidente", "estado": "ok"}, {"regra": "promulgacao_ar", "estado": "ok"}]),
    "lei-902-2019": base("lei-902-2019", governo_publicacao=3, presidente=pres(PB, "2019-02-05"), legislatura="XIII",
                         periodo=periodo("2019-01-18", "vfg", 3, "XIII"),
                         proponentes=[prop("900202", "Projeto de Lei n.º 901/XIII", "grupos", grupos=["BE"], leg="XIII", res="Rejeitado"),
                                      prop("900201", "Proposta de Lei n.º 902/XIII", "governo", gov=3),
                                      prop("900203", "Projeto de Lei n.º 903/XIII", "grupos", grupos=["PSD"], leg="XIII", res="Aprovado")],
                         texto_comissao={"tipo": "texto_substituicao", "n_iniciativas": 3, "iniciativas": [
                             {"iniciativa": "900201", "designacao": "Proposta de Lei n.º 902/XIII", "parte": None},
                             {"iniciativa": "900202", "designacao": "Projeto de Lei n.º 901/XIII", "parte": None},
                             {"iniciativa": "900203", "designacao": "Projeto de Lei n.º 903/XIII", "parte": "artigo 8.º"}]},
                         vfg={"data": "2019-01-18", "unanime": False, "resultado": "Aprovado"},
                         retificado_por=[], ar_url="https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID=900003",
                         transitorias=[{"artigo": "15.º", "epigrafe": "Norma transitória"}],
                         verificacao=[{"regra": "presidente", "estado": "ok"}, {"regra": "promulgacao_ar", "estado": "ok"}]),
    "lei-901-2020": base("lei-901-2020", governo_publicacao=4, presidente=pres(PB, "2020-10-05"), legislatura="XIV",
                         periodo=periodo("2020-09-25", "reapreciacao", 4, "XIV"),
                         proponentes=[prop("900101", "Proposta de Lei n.º 901/XIV", "governo", gov=4, res="Aprovado")],
                         vfg={"data": "2020-07-10", "unanime": False, "resultado": "Aprovado"},
                         eventos=[{"tipo": "veto", "data": "2020-08-20", "presidente": "presidente-teste-b", "acordao_tc": "9001/2020"},
                                  {"tipo": "confirmacao", "data": "2020-09-25"}],
                         retificado_por=["declaracao-de-retificacao-901-2020"],
                         transitorias=[{"artigo": "5.º", "epigrafe": "Norma transitória"}],
                         ar_url="https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID=900004",
                         verificacao=[{"regra": "presidente", "estado": "ok"}, {"regra": "referenda", "estado": "ok"}, {"regra": "promulgacao_ar", "estado": "ok"}]),
    "declaracao-de-retificacao-901-2020": base("declaracao-de-retificacao-901-2020", governo_publicacao=4, legislatura="XIV", retifica="lei-901-2020",
                                               periodo=periodo("2020-09-25", "reapreciacao", 4, "XIV", "retificacao"), assinatura=assin("declaracao-de-retificacao-901-2020")),
    "acordao-do-tribunal-constitucional-9001-2021": base(
        "acordao-do-tribunal-constitucional-9001-2021", governo_publicacao=4, legislatura="XIV",
        periodo=periodo("2021-03-01", "publicacao", 4, "XIV", "acordaos"),
        tribunal={"tribunal": "Tribunal Constitucional", "data": "2021-02-10", "data_base": "decisao",
                  "normas": [{"diploma": "lei-teste", "artigo": "artigo-2", "numeros": ["2"], "escrito_por": "lei-902-2019",
                              "efeitos_desde": "2019-02-13", "tipo": "inconstitucional"}]}),
    "lei-901-2022": base("lei-901-2022", governo_publicacao=4, presidente=pres(PB, "2021-12-30"), legislatura="XIV",
                         periodo=periodo("2021-11-25", "vfg", 4, "XIV"), oe={"ano": 2022},
                         proponentes=[prop("900501", "Proposta de Lei n.º 903/XIV", "governo", gov=4, res="Aprovado")],
                         vfg={"data": "2021-11-25", "unanime": False, "resultado": "Aprovado"},
                         ar_url="https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID=900005",
                         verificacao=[{"regra": "presidente", "estado": "ok"}, {"regra": "promulgacao_ar", "estado": "ok"}]),
    "lei-901-2023": base("lei-901-2023", governo_publicacao=4, presidente=pres(PB, "2023-05-20"), legislatura="XV",
                         periodo=periodo("2023-06-01", "publicacao", 4, "XV"),
                         ar_url="https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheDiplomaAprovado.aspx?BID=900006",
                         motivos={"passagem": "sessao_em_falta", "vfg": "sessao_em_falta", "generalidade": "sessao_em_falta"},
                         verificacao=[{"regra": "presidente", "estado": "ok"}]),
}
for p in P.values():
    Q[p["ato"]]["proponentes"].sort(key=lambda x: (x["entrada"] or "", x["designacao"]))


# ---- Timeline, groups, verification --------------------------------------------------------------
def linha(*listas):
    nomes = ("decretos_leis", "propostas", "outras", "publicados_sem_d_cm")
    ls = {n: list(l) for n, l in zip(nomes, listas)}
    return {"total": sum(len(l) for l in ls.values()), "listas": ls}


QUEM_DIPLOMA = {
    "slug": "lei-teste", "ato_original": "decreto-lei-90001", "desde": "1970-03-02",
    "por_governo": [
        {"governo": 1, **linha([{"ato": "decreto-lei-901-1977"}], [], [], [])},
        {"governo": 2, **linha([{"ato": "decreto-lei-902-2010"}], [], [], [])},
        {"governo": 3, **linha([], [], [{"ato": "lei-organica-901-2018", "texto_comissao": True}, {"ato": "lei-902-2019", "texto_comissao": True}],
                               [{"ato": "decreto-lei-903-2012"}])},
        {"governo": 4, **linha([], [{"ato": "lei-901-2020"}, {"ato": "lei-901-2022"}], [{"ato": "lei-901-2023", "sem_passagem": True}], [])},
    ],
    "por_legislatura": [],
    "fora": {"revisoes": [{"ato": "lei-constitucional-901-1997"}], "acordaos": [{"ato": "acordao-do-tribunal-constitucional-9001-2021"}],
             "antes_1976": [{"ato": "decreto-lei-90002"}], "retificacoes_soltas": [], "outros": []},
    "retificacoes": {"lei-901-2020": ["declaracao-de-retificacao-901-2020"]},
}
POR_LEG = {"IA": ([{"ato": "decreto-lei-901-1977"}], [], [], []), "XI": ([{"ato": "decreto-lei-902-2010"}], [], [], []),
           "XII": ([], [], [], [{"ato": "decreto-lei-903-2012"}]),
           "XIII": ([], [], [{"ato": "lei-organica-901-2018", "texto_comissao": True}, {"ato": "lei-902-2019", "texto_comissao": True}], []),
           "XIV": ([], [{"ato": "lei-901-2020"}, {"ato": "lei-901-2022"}], [], []), "XV": ([], [], [{"ato": "lei-901-2023", "sem_passagem": True}], [])}
for L in AR["legislaturas"]:
    if L["sigla"] == "Constituinte":
        continue
    govs = [g["numero"] for g in GOVERNOS if g["inicio"] < (L["fim"] or "9999") and (g["fim"] or "9999") > L["inicio"]]
    QUEM_DIPLOMA["por_legislatura"].append({"legislatura": L["sigla"], "governos": govs, **linha(*POR_LEG.get(L["sigla"], ([], [], [], [])))})


def grupos_paginas():
    """Group pages from the fixture's passage: initiatives of the group and its generalidade votes."""
    paginas = {}
    for aid, p in P.items():
        leg = p["legislatura"]
        q = Q[aid]
        juntadas = {x["iniciativa"]: x for x in (q["texto_comissao"] or {}).get("iniciativas", [])}
        for i in p["iniciativas"]:
            for s in i["autores"]["grupos"]:
                g = paginas.setdefault(gid(s, leg), {"iniciativas": [], "votos": {}, "siglas": {}})
                g["iniciativas"].append({"iniciativa": i["id"], "designacao": i["designacao"], "sigla": s, "ato": aid,
                                         "como": "juntada" if i["id"] in juntadas else "propria",
                                         "n_iniciativas": len(juntadas) or 1, "parte": (juntadas.get(i["id"]) or {}).get("parte")})
        for s in p["ordem_grupos"]:
            g = paginas.setdefault(gid(s, leg), {"iniciativas": [], "votos": {}, "siglas": {}})
            itens = []
            for x in p["generalidade"]:
                if x["origem"] == "texto_comissao":
                    v, des, tid = p["texto_comissao"][x["indice"]], "Texto da comissão", "texto_comissao"
                    iid = None
                else:
                    ii = next(i for i in p["iniciativas"] if i["id"] == x["id"])
                    v, des, iid = ii["generalidade"], ii["designacao"], ii["id"]
                sentido = v["grupos"].get(s) or ("ausente" if s in v["ausentes"] else "sem_registo" if s in v["sem_registo"] else None)
                itens.append({"tipo": x["origem"], "id": iid if iid else x["indice"], "designacao": des, "data": v["data"], "sentido": sentido})
            g["votos"].setdefault("lei-teste", []).append({"ato": aid, "oe": Q[aid]["oe"] is not None, "sigla": s, "legislatura": leg, "itens": itens})
    out = {}
    for k, g in paginas.items():
        gr = AR["grupos"][k]
        g["votos"]["lei-teste"].sort(key=lambda r: A[r["ato"]]["publicacao"])
        out[k] = {"id": k, "nomes": gr["nomes"], "iniciativas": g["iniciativas"], "votos": g["votos"]}
    idx = []
    for k in out:
        gr = AR["grupos"][k]
        legs = []
        for n in gr["nomes"]:
            legs += [l for l in n["legislaturas"] if l not in legs]
        ordem = [x["sigla"] for x in AR["legislaturas"]]
        legs.sort(key=ordem.index)
        ultimo = max(gr["nomes"], key=lambda n: ordem.index(n["legislaturas"][-1]))
        idx.append({"id": k, "nome": ultimo["nome"], "siglas": list(dict.fromkeys(n["sigla"] for n in gr["nomes"])), "legislaturas": legs})
    import unicodedata

    def dob(s):
        return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()
    idx.sort(key=lambda x: dob(x["nome"]))
    return idx, out


VERIF_QUEM = {
    "assinaturas": {"total": 11, "com_d_cm": 2, "falhas": [{"ato": "decreto-lei-903-2012", "motivo": "sem_d_cm"}]},
    "cruzamento": [{"ato": "decreto-lei-902-2010", "regra": "mesmo_pm", "estado": "aviso", "detalhe": "d_cm a 7 dias da posse do Governo 3, com o mesmo Primeiro-Ministro"}],
    "mesmo_pm": [{"ato": "decreto-lei-902-2010", "d_cm": "2010-05-25", "governos": [2, 3]}],
    "passos_descartados": [],
    "votos_descartados": [{"ato": "lei-901-2020", "fase": "Confirmação do decreto", "data": "2020-12-03", "motivo": "depois_da_publicacao"}],
    "cobertura": {"dl_d_cm": 0.6667, "leis_promulgacao": 1.0},
}

# ---- Content files (C's shapes, §2.12–§2.14) -----------------------------------------------------
GLOSSARIO = {
    "preparado_em": HOJE,
    "grupos": [{"id": "texto", "titulo": "O texto da lei"}, {"id": "tipos", "titulo": "Tipos de diploma"}, {"id": "datas", "titulo": "As datas"},
               {"id": "parlamento", "titulo": "No Parlamento"}, {"id": "quem", "titulo": "Quem faz as leis"}],
    "termos": {
        "decreto-lei": {"id": "decreto-lei", "termo": "decreto-lei", "formas": ["decreto-lei", "decretos-leis"], "grupo": "tipos",
                        "definicao": ["Um diploma de teste aprovado pelo Governo de teste."],
                        "fonte": {"rota": "#/d/lei-teste/artigo-3", "texto": "Lei de teste, artigo 3.º"},
                        "apoio": ["O regime é o geral, salvo lei orgânica ou regulamento."],
                        "verificado_em": HOJE, "hash_fonte": "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
        "votacao-final-global": {"id": "votacao-final-global", "termo": "votação final global", "formas": ["votação final global"], "grupo": "parlamento",
                                 "definicao": ["A última votação de teste no Parlamento."],
                                 "fonte": {"url": "https://diariodarepublica.pt/dr/detalhe/lei/900-2020-900000", "texto": "Lei de teste, artigo 1.º"},
                                 "apoio": ["A presente lei regula o teste e a prova de teste."],
                                 "verificado_em": HOJE, "hash_fonte": "sha256:1111111111111111111111111111111111111111111111111111111111111111"},
    },
}
# The story: compiled from pipeline/fixtures/historias/teste.md by pipeline/historias.py, on this fixture.
HISTORIA_FONTE = os.path.join(PIPE, "fixtures", "historias", "teste.md")


PARTILHA = {"base": "https://andre15silva.github.io/pt-legal-git/",
            "artigos": {"lei-teste/artigo-1": ["decreto-lei-90001", "decreto-lei-90002", "decreto-lei-901-1977", "lei-901-2020",
                                               "declaracao-de-retificacao-901-2020", "lei-901-2022"]},
            "historias": ["teste"]}


def escrever(rel, obj):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    arts = artigos()
    arvore = [{"nivel": 1, "tipo": "divisao", "rotulo": "Capítulo I", "epigrafe": "Disposições de teste"}]
    for aid, a in arts.items():
        vs = a["versoes"]
        arvore.append({"nivel": 2, "tipo": "artigo", "rotulo": a["rotulo"], "epigrafe": a["epigrafe"], "artigo": aid, "estado": a["estado"], "n": len(vs),
                       "ultima": vs[-1]["vigor"] or vs[-1]["publicacao"], "datas": [v["vigor"] or v["publicacao"] for v in vs],
                       "atos": [v["ato"] for v in vs], "tipos": [v["tipo"] for v in vs]})
        escrever(f"d/lei-teste/{aid}.json", a)
    escrever("d/lei-teste.json", {"slug": "lei-teste", "titulo": "Lei de teste", "sigla": "LT", "genitivo": "da Lei de teste",
                                   "vigor_original": None, "inicio_historia": None, "parte": None, "designacao": "Decreto-Lei n.º 90001",
                                   "inicio_codigo": None, "ato_original": "decreto-lei-90001", "publicacao": "1970-03-02", "link": None, "eli": None,
                                   "sumario": "Aprova a Lei de teste.", "copia": None, "arvore": arvore})
    for a in ATOS:
        a["alteracoes"].sort(key=lambda c: (c["diploma"], c["vigor"] or ""))
    escrever("atos.json", A)
    escrever("index.json", {"consultado_em": HOJE, "diplomas": [{"slug": "lei-teste", "titulo": "Lei de teste", "sigla": "LT", "designacao": "Decreto-Lei n.º 90001",
                                                                  "publicacao": "1970-03-02", "genitivo": "da Lei de teste", "n_artigos": 3, "area": "Teste",
                                                                  "n_atos": len(ATOS) - 1}],
                            "sinonimos": [], "aliases_atos": {"iii-acordao-do-tribunal-constitucional-9001-2021": "acordao-do-tribunal-constitucional-9001-2021",
                                                              "declaracao": "declaracao-de-retificacao-901-2020"}})
    escrever("pesquisa.json", [["lei-teste", aid, a["rotulo"], a["epigrafe"], a["estado"], None] for aid, a in arts.items()])
    escrever("passagem.json", P)
    escrever("iniciativas.json", iniciativas_json())
    escrever("pendentes.json", {"legislatura": "XVII", "iniciativas": {}, "por_diploma": {}, "consultado_em": HOJE})
    escrever("quem.json", Q)
    escrever("governos.json", {"governos": GOVERNOS, "presidentes": PRESIDENTES, "legislaturas": AR["legislaturas"], "grupos": AR["grupos"], "siglas": AR["siglas"]})
    escrever("quem/lei-teste.json", QUEM_DIPLOMA)
    idx, paginas = grupos_paginas()
    escrever("grupos/index.json", idx)
    for k, g in paginas.items():
        escrever(f"grupos/{k}.json", g)
    escrever("verificacao.json", {"consultado_em": HOJE, "diplomas": {"lei-teste": {"titulo": "Lei de teste", "sigla": "LT", "relatorio": None}},
                                  "quem": VERIF_QUEM, "conteudo": [{"tipo": "historia", "id": "teste", "seccao": "voto",
                                                                    "motivo": "teste.md:33: [R2] figura «voto»: os dados mudaram"}]})
    escrever("glossario.json", GLOSSARIO)
    os.environ["REDACAO_HOJE"] = HOJE
    import historias
    idx, msgs, _ = historias.construir(OUT, estrito=True, ficheiros=[HISTORIA_FONTE])
    if [m for m in msgs if not m.startswith("aviso")]:
        print("\n".join(msgs))
        return 1
    for nome in ("index.json", "teste.json"):   # indented, like the other fixture files
        escrever("historias/" + nome, json.load(open(os.path.join(OUT, "historias", nome), encoding="utf-8")))
    escrever("partilha.json", PARTILHA)
    import contrato
    erros = contrato.validar_pasta(OUT, completo=True)
    for e in erros:
        print(e)
    print(f"{OUT}: {len(erros)} erros")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
