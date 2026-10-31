"""The data contract of app/data: one validator, shared by the pipeline, the app and the content.

    python -I pipeline/contrato.py app/data                                  # the real build
    python -I pipeline/contrato.py pipeline/fixtures/contrato/app-data --completo

Each validar_* function takes the parsed JSON of one file and returns a list of errors (strings,
empty when the file holds up). validar_pasta(dir) runs them on every file of an app/data-shaped
folder and adds the checks across files: every act id in quem.json is in atos.json, every Governo
number exists in governos.json, every motivos value is a reason code. With completo=True the files
written by the content step (glossário, histórias, partilha) must also be there.

The shapes are those of the design spec (§2). A change of shape happens here and in the fixture
(pipeline/fixtures/contrato/) first. Standard library only.
"""
from __future__ import annotations

import json
import os
import re
import sys

DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL = re.compile(r"^https://[^\s]+$")

TIPOS_ATO = {"decreto-lei", "lei", "lei-organica", "lei-constitucional", "retificacao", "acordao-tc", "acordao-outro",
             "pre1976", "aprovacao-constituicao", "portaria", "resolucao", "dlr", "outro"}
MOTIVOS = {"sem_d_cm", "sem_link", "sem_texto", "por_ler", "sessao_em_falta", "sem_ar", "antes_1976",
           "antes_governo_constitucional", "tabela_aberta", "conflito", "voto_ambiguo", "passos_descartados",
           "sem_registo_vfg", "sem_generalidade"}
CHAVES_MOTIVOS = {"governo", "presidente", "d_cm", "vfg", "passos", "passagem", "generalidade"}
TIPOS_PROPONENTE = {"governo", "grupos", "cidadaos", "regiao", "comissao", "mesa"}
TIPOS_EVENTO = {"veto", "tribunal", "confirmacao", "novo_decreto"}
BASES_PERIODO = {"d_cm", "vfg", "reapreciacao", "publicacao"}
FORA = {"revisoes", "acordaos", "antes_1976", "retificacao", "outros"}
ESTADOS_ASSINATURA = {"ok", "parcial", "falhou", "sem_link", "por_ler"}
REGRAS = {"presidente", "referenda", "cm_primeiro", "promulgacao_ar", "mesmo_pm"}
ESTADOS_REGRA = {"ok", "aviso", "conflito"}
SENTIDOS = {"favor", "contra", "abstencao"}
SENTIDOS_GRUPO = {"favor", "contra", "abstencao", "ausente", "sem_registo", None}
MOTIVOS_DESCARTE = {"outro_decreto", "depois_da_publicacao", "sem_correspondencia", "passos_fora_de_ordem", "duplicado"}
LISTAS = ("decretos_leis", "propostas", "outras", "publicados_sem_d_cm")
FORA_DIPLOMA = ("revisoes", "acordaos", "antes_1976", "retificacoes_soltas", "outros")
TIPOS_FIGURA = {"diff", "votacao", "cronologia", "origem", "ficha", "imagem", "passos"}
CHAVE_PARTILHA = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class _Erros(list):
    """A list of errors with helpers that name where each error is."""

    def tipo(self, onde, v, tipos, nulo=False):
        if v is None and nulo:
            return True
        if not isinstance(v, tipos) or (isinstance(v, bool) and bool not in (tipos if isinstance(tipos, tuple) else (tipos,))):
            self.append(f"{onde}: esperava {_nome(tipos)}{' ou null' if nulo else ''}, tem {type(v).__name__}")
            return False
        return True

    def data(self, onde, v, nulo=False):
        if v is None and nulo:
            return
        if not isinstance(v, str) or not DATA.match(v):
            self.append(f"{onde}: data AAAA-MM-DD esperada, tem {v!r}")

    def url(self, onde, v, nulo=False):
        if v is None and nulo:
            return
        if not isinstance(v, str) or not URL.match(v):
            self.append(f"{onde}: URL https esperado, tem {v!r}")

    def valor(self, onde, v, permitidos):
        if v not in permitidos:
            self.append(f"{onde}: valor {v!r} fora de {sorted(map(str, permitidos))}")

    def chaves(self, onde, obj, exigidas):
        if not isinstance(obj, dict):
            self.append(f"{onde}: esperava objeto, tem {type(obj).__name__}")
            return False
        falta = [k for k in exigidas if k not in obj]
        if falta:
            self.append(f"{onde}: faltam as chaves {falta}")
        return True


def _nome(tipos):
    tipos = tipos if isinstance(tipos, tuple) else (tipos,)
    return " ou ".join({dict: "objeto", list: "lista", str: "texto", int: "inteiro", bool: "booleano", float: "número"}.get(t, t.__name__) for t in tipos)


def _motivos(e: _Erros, onde: str, m) -> None:
    if not e.tipo(onde, m, dict):
        return
    for k, v in m.items():
        e.valor(f"{onde}.{k}", k, CHAVES_MOTIVOS)
        e.valor(f"{onde}.{k} (código)", v, MOTIVOS)


# ---- quem.json --------------------------------------------------------------------------------
QUEM_CHAVES = ("tipo_ato", "governo", "governo_publicacao", "d_cm", "em_gestao", "presidente", "legislatura", "periodo",
               "proponentes", "texto_comissao", "vfg", "eventos", "retifica", "retificado_por", "tribunal", "pre1976", "oe",
               "transitorias", "ar_url", "assinatura", "motivos", "verificacao")


def validar_registo_quem(r, onde: str = "quem") -> list[str]:
    e = _Erros()
    if not e.chaves(onde, r, QUEM_CHAVES):
        return e
    e.valor(f"{onde}.tipo_ato", r.get("tipo_ato"), TIPOS_ATO)
    g = r.get("governo")
    if e.tipo(f"{onde}.governo", g, dict, nulo=True) and g is not None:
        e.chaves(f"{onde}.governo", g, ("numero", "base", "data"))
        e.tipo(f"{onde}.governo.numero", g.get("numero"), int)
        e.valor(f"{onde}.governo.base", g.get("base"), {"conselho_ministros"})
        e.data(f"{onde}.governo.data", g.get("data"))
    e.tipo(f"{onde}.governo_publicacao", r.get("governo_publicacao"), int, nulo=True)
    e.data(f"{onde}.d_cm", r.get("d_cm"), nulo=True)
    eg = r.get("em_gestao")
    if e.tipo(f"{onde}.em_gestao", eg, dict, nulo=True) and eg is not None:
        e.chaves(f"{onde}.em_gestao", eg, ("inicio", "fim", "fonte"))
        e.url(f"{onde}.em_gestao.fonte", eg.get("fonte"))
    p = r.get("presidente")
    if e.tipo(f"{onde}.presidente", p, dict, nulo=True) and p is not None:
        e.chaves(f"{onde}.presidente", p, ("id", "nome", "d_promulgacao", "base"))
        e.tipo(f"{onde}.presidente.nome", p.get("nome"), str)
        e.data(f"{onde}.presidente.d_promulgacao", p.get("d_promulgacao"))
        e.valor(f"{onde}.presidente.base", p.get("base"), {"assinatura", "parlamento"})
    e.tipo(f"{onde}.legislatura", r.get("legislatura"), str, nulo=True)
    per = r.get("periodo")
    if e.chaves(f"{onde}.periodo", per, ("data", "base", "governo", "legislatura", "fora")):
        e.data(f"{onde}.periodo.data", per.get("data"), nulo=True)
        e.valor(f"{onde}.periodo.base", per.get("base"), BASES_PERIODO | {None})
        e.tipo(f"{onde}.periodo.governo", per.get("governo"), int, nulo=True)
        e.valor(f"{onde}.periodo.fora", per.get("fora"), FORA | {None})
    if e.tipo(f"{onde}.proponentes", r.get("proponentes"), list):
        for k, x in enumerate(r["proponentes"]):
            w = f"{onde}.proponentes[{k}]"
            if not e.chaves(w, x, ("iniciativa", "designacao", "tipo", "governo", "entrada", "grupos", "sem_grupo", "nome",
                                   "resultado_generalidade")):
                continue
            e.tipo(f"{w}.iniciativa", x.get("iniciativa"), str)
            e.tipo(f"{w}.designacao", x.get("designacao"), str)
            e.valor(f"{w}.tipo", x.get("tipo"), TIPOS_PROPONENTE)
            e.tipo(f"{w}.governo", x.get("governo"), int, nulo=True)
            if x.get("tipo") != "governo" and x.get("governo") is not None:
                e.append(f"{w}.governo: só uma proposta do Governo tem Governo")
            e.data(f"{w}.entrada", x.get("entrada"), nulo=True)
            if e.tipo(f"{w}.grupos", x.get("grupos"), list):
                for gk, gg in enumerate(x["grupos"]):
                    e.chaves(f"{w}.grupos[{gk}]", gg, ("id", "sigla"))
            e.tipo(f"{w}.sem_grupo", x.get("sem_grupo"), list)
        datas = [(x.get("entrada") or "", x.get("designacao") or "") for x in r["proponentes"] if isinstance(x, dict)]
        if datas != sorted(datas):
            e.append(f"{onde}.proponentes: fora da ordem (entrada, designação)")
    tc = r.get("texto_comissao")
    if e.tipo(f"{onde}.texto_comissao", tc, dict, nulo=True) and tc is not None:
        if e.chaves(f"{onde}.texto_comissao", tc, ("tipo", "n_iniciativas", "iniciativas")):
            e.valor(f"{onde}.texto_comissao.tipo", tc.get("tipo"), {"texto_substituicao", "texto_final"})
            if e.tipo(f"{onde}.texto_comissao.iniciativas", tc.get("iniciativas"), list):
                if tc.get("n_iniciativas") != len(tc["iniciativas"]):
                    e.append(f"{onde}.texto_comissao.n_iniciativas: {tc.get('n_iniciativas')} ≠ {len(tc['iniciativas'])} iniciativas")
                for k, x in enumerate(tc["iniciativas"]):
                    e.chaves(f"{onde}.texto_comissao.iniciativas[{k}]", x, ("iniciativa", "designacao", "parte"))
    vfg = r.get("vfg")
    if e.tipo(f"{onde}.vfg", vfg, dict, nulo=True) and vfg is not None:
        e.chaves(f"{onde}.vfg", vfg, ("data", "unanime", "resultado"))
        e.data(f"{onde}.vfg.data", vfg.get("data"))
    if e.tipo(f"{onde}.eventos", r.get("eventos"), list):
        anterior = ""
        for k, x in enumerate(r["eventos"]):
            w = f"{onde}.eventos[{k}]"
            if not e.chaves(w, x, ("tipo", "data")):
                continue
            e.valor(f"{w}.tipo", x.get("tipo"), TIPOS_EVENTO)
            e.data(f"{w}.data", x.get("data"))
            if (x.get("data") or "") < anterior:
                e.append(f"{w}: eventos fora da ordem das datas")
            anterior = x.get("data") or anterior
            if x.get("tipo") == "veto":
                e.chaves(w, x, ("presidente", "acordao_tc"))
    e.tipo(f"{onde}.retifica", r.get("retifica"), str, nulo=True)
    e.tipo(f"{onde}.retificado_por", r.get("retificado_por"), list)
    t = r.get("tribunal")
    if e.tipo(f"{onde}.tribunal", t, dict, nulo=True) and t is not None:
        if e.chaves(f"{onde}.tribunal", t, ("tribunal", "data", "data_base", "normas")):
            e.data(f"{onde}.tribunal.data", t.get("data"), nulo=True)
            e.valor(f"{onde}.tribunal.data_base", t.get("data_base"), {"decisao", "publicacao"})
            if e.tipo(f"{onde}.tribunal.normas", t.get("normas"), list):
                for k, n in enumerate(t["normas"]):
                    w = f"{onde}.tribunal.normas[{k}]"
                    if e.chaves(w, n, ("diploma", "artigo", "numeros", "escrito_por", "efeitos_desde", "tipo")):
                        e.tipo(f"{w}.numeros", n.get("numeros"), list)
                        e.data(f"{w}.efeitos_desde", n.get("efeitos_desde"), nulo=True)
    p76 = r.get("pre1976")
    if e.tipo(f"{onde}.pre1976", p76, dict, nulo=True) and p76 is not None:
        if e.chaves(f"{onde}.pre1976", p76, ("signatarios",)):
            e.tipo(f"{onde}.pre1976.signatarios", p76.get("signatarios"), list)
    oe = r.get("oe")
    if e.tipo(f"{onde}.oe", oe, dict, nulo=True) and oe is not None:
        e.tipo(f"{onde}.oe.ano", oe.get("ano"), int)
    if e.tipo(f"{onde}.transitorias", r.get("transitorias"), list):
        for k, x in enumerate(r["transitorias"]):
            e.chaves(f"{onde}.transitorias[{k}]", x, ("artigo", "epigrafe"))
    e.url(f"{onde}.ar_url", r.get("ar_url"), nulo=True)
    a = r.get("assinatura")
    if e.chaves(f"{onde}.assinatura", a, ("estado", "obtido_em", "url")):
        e.valor(f"{onde}.assinatura.estado", a.get("estado"), ESTADOS_ASSINATURA)
        e.data(f"{onde}.assinatura.obtido_em", a.get("obtido_em"), nulo=True)
        e.url(f"{onde}.assinatura.url", a.get("url"), nulo=True)
    _motivos(e, f"{onde}.motivos", r.get("motivos"))
    m = r.get("motivos") or {}
    if isinstance(m, dict):
        for chave, campo in (("governo", "governo"), ("presidente", "presidente"), ("d_cm", "d_cm"), ("vfg", "vfg")):
            if chave in m and r.get(campo) not in (None, [], {}) and m[chave] not in ("tabela_aberta",):
                e.append(f"{onde}.motivos.{chave}: há motivo mas o facto existe")
        if r.get("tipo_ato") == "decreto-lei" and r.get("governo") is None and "governo" not in m:
            e.append(f"{onde}: decreto-lei sem governo e sem motivos.governo")
        if r.get("tipo_ato") in ("decreto-lei", "lei", "lei-organica", "lei-constitucional") and r.get("presidente") is None and "presidente" not in m:
            e.append(f"{onde}: sem presidente e sem motivos.presidente")
    if e.tipo(f"{onde}.verificacao", r.get("verificacao"), list):
        for k, x in enumerate(r["verificacao"]):
            w = f"{onde}.verificacao[{k}]"
            if e.chaves(w, x, ("regra", "estado")):
                e.valor(f"{w}.regra", x.get("regra"), REGRAS)
                e.valor(f"{w}.estado", x.get("estado"), ESTADOS_REGRA)
    return e


def validar_quem(obj) -> list[str]:
    e = _Erros()
    if not e.tipo("quem.json", obj, dict):
        return e
    for aid, r in obj.items():
        e.extend(validar_registo_quem(r, f"quem[{aid}]"))
    return e


# ---- passagem.json ----------------------------------------------------------------------------
VOTO_CHAVES = ("data", "fase", "resultado", "unanime", "ausentes", "grupos", "sem_registo", "legislatura")


def _voto(e: _Erros, onde: str, v) -> None:
    if not e.chaves(onde, v, VOTO_CHAVES):
        return
    e.data(f"{onde}.data", v.get("data"))
    if e.tipo(f"{onde}.grupos", v.get("grupos"), dict):
        for g, s in v["grupos"].items():
            if g.lower().startswith("aus"):
                e.append(f"{onde}.grupos: chave {g!r} (uma ausência lida como grupo)")
            e.valor(f"{onde}.grupos[{g}]", s, SENTIDOS)
            if g in (v.get("ausentes") or []):
                e.append(f"{onde}: {g} está em grupos e em ausentes")
    e.tipo(f"{onde}.ausentes", v.get("ausentes"), list)
    if e.tipo(f"{onde}.sem_registo", v.get("sem_registo"), list):
        for g in v["sem_registo"]:
            if g in (v.get("ausentes") or []) or g in (v.get("grupos") or {}):
                e.append(f"{onde}.sem_registo: {g} também votou ou está ausente")
    e.tipo(f"{onde}.legislatura", v.get("legislatura"), str, nulo=True)


def validar_passagem(obj) -> list[str]:
    e = _Erros()
    if not e.tipo("passagem.json", obj, dict):
        return e
    for aid, p in obj.items():
        w = f"passagem[{aid}]"
        if not e.chaves(w, p, ("ato", "legislatura", "ordem_grupos", "iniciativas", "texto_comissao", "passos", "verificacao",
                               "decreto", "generalidade", "vfg", "eventos", "descartados", "motivos")):
            continue
        if p.get("ato") != aid:
            e.append(f"{w}.ato: {p.get('ato')!r} ≠ chave")
        inis = p.get("iniciativas") or []
        ids = set()
        for k, i in enumerate(inis):
            if e.chaves(f"{w}.iniciativas[{k}]", i, ("id", "designacao", "autores", "principal", "generalidade")):
                ids.add(i.get("id"))
                if i.get("generalidade"):
                    _voto(e, f"{w}.iniciativas[{k}].generalidade", i["generalidade"])
        tcs = p.get("texto_comissao") or []
        for k, v in enumerate(tcs):
            _voto(e, f"{w}.texto_comissao[{k}]", v)
        d = p.get("decreto")
        if e.tipo(f"{w}.decreto", d, dict, nulo=True) and d is not None:
            e.chaves(f"{w}.decreto", d, ("numero", "anteriores", "titulo"))
        if e.tipo(f"{w}.generalidade", p.get("generalidade"), list):
            for k, x in enumerate(p["generalidade"]):
                ww = f"{w}.generalidade[{k}]"
                if not e.tipo(ww, x, dict):
                    continue
                if x.get("origem") == "texto_comissao":
                    if not isinstance(x.get("indice"), int) or not 0 <= x["indice"] < len(tcs):
                        e.append(f"{ww}.indice: {x.get('indice')!r} fora de texto_comissao")
                elif x.get("origem") == "iniciativa":
                    if x.get("id") not in ids:
                        e.append(f"{ww}.id: {x.get('id')!r} não é uma iniciativa do ato")
                    elif not next((i for i in inis if i.get("id") == x["id"]), {}).get("generalidade"):
                        e.append(f"{ww}: a iniciativa {x['id']} não tem votação na generalidade")
                else:
                    e.append(f"{ww}.origem: {x.get('origem')!r}")
            if not p["generalidade"] and "generalidade" not in (p.get("motivos") or {}):
                e.append(f"{w}: generalidade vazia sem motivos.generalidade")
        if p.get("vfg") is not None:
            _voto(e, f"{w}.vfg", p["vfg"])
        elif "vfg" not in (p.get("motivos") or {}):
            e.append(f"{w}: sem vfg e sem motivos.vfg")
        if e.tipo(f"{w}.eventos", p.get("eventos"), list):
            for k, x in enumerate(p["eventos"]):
                if e.chaves(f"{w}.eventos[{k}]", x, ("tipo", "data")):
                    e.valor(f"{w}.eventos[{k}].tipo", x.get("tipo"), TIPOS_EVENTO)
                    e.data(f"{w}.eventos[{k}].data", x.get("data"))
                    if x.get("voto"):
                        _voto(e, f"{w}.eventos[{k}].voto", x["voto"])
        if e.tipo(f"{w}.descartados", p.get("descartados"), list):
            for k, x in enumerate(p["descartados"]):
                if e.chaves(f"{w}.descartados[{k}]", x, ("fase", "data", "motivo")):
                    e.valor(f"{w}.descartados[{k}].motivo", x.get("motivo"), MOTIVOS_DESCARTE)
        _motivos(e, f"{w}.motivos", p.get("motivos"))
        for k, s in enumerate(p.get("passos") or []):
            e.chaves(f"{w}.passos[{k}]", s, ("passo", "data"))
    return e


# ---- governos.json ----------------------------------------------------------------------------
def _intervalos(e: _Erros, onde: str, linhas: list, aberta: bool = True) -> None:
    for k, (a, b) in enumerate(zip(linhas, linhas[1:])):
        if a.get("fim") != b.get("inicio"):
            e.append(f"{onde}[{k}].fim {a.get('fim')!r} ≠ início da linha seguinte {b.get('inicio')!r}")
    for k, x in enumerate(linhas):
        if x.get("inicio") and x.get("fim") and x["inicio"] >= x["fim"]:
            e.append(f"{onde}[{k}]: início {x['inicio']} não é anterior ao fim {x['fim']}")
    if linhas and aberta and linhas[-1].get("fim") is not None:
        e.append(f"{onde}: a última linha deve ter fim null")


def validar_governos(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("governos.json", obj, ("governos", "presidentes", "legislaturas", "grupos", "siglas")):
        return e
    grupos = obj.get("grupos") or {}
    gov = obj.get("governos") or []
    for k, g in enumerate(gov):
        w = f"governos[{k}]"
        if not e.chaves(w, g, ("numero", "romano", "inicio", "fim", "primeiro_ministro", "partidos", "nota_partidos", "em_gestao", "fontes")):
            continue
        e.tipo(f"{w}.numero", g.get("numero"), int)
        e.data(f"{w}.inicio", g.get("inicio"))
        e.data(f"{w}.fim", g.get("fim"), nulo=True)
        e.tipo(f"{w}.primeiro_ministro", g.get("primeiro_ministro"), str)
        ps = g.get("partidos")
        if e.tipo(f"{w}.partidos", ps, list, nulo=True) and ps is not None:
            for p in ps:
                if p not in grupos:
                    e.append(f"{w}.partidos: {p!r} não está em grupos")
            if ps == [] and not (isinstance(g.get("nota_partidos"), dict) and URL.match(str(g["nota_partidos"].get("fonte")))):
                e.append(f"{w}: partidos [] sem nota_partidos com fonte")
        nota = g.get("nota_partidos")
        if e.tipo(f"{w}.nota_partidos", nota, dict, nulo=True) and nota is not None:
            e.url(f"{w}.nota_partidos.fonte", nota.get("fonte"))
            for p in nota.get("partidos") or []:
                if p not in grupos:
                    e.append(f"{w}.nota_partidos.partidos: {p!r} não está em grupos")
        for x in g.get("em_gestao") or []:
            if not (g["inicio"] <= x.get("inicio", "") and (g.get("fim") is None or (x.get("fim") or "9999") <= g["fim"])):
                e.append(f"{w}.em_gestao: {x} fora da linha")
            e.url(f"{w}.em_gestao.fonte", x.get("fonte"))
        if e.tipo(f"{w}.fontes", g.get("fontes"), dict):
            for c, u in g["fontes"].items():
                e.url(f"{w}.fontes.{c}", u)
    if [g.get("numero") for g in gov] != list(range(1, len(gov) + 1)) and gov and gov[0].get("numero") == 1:
        e.append("governos: números não seguidos")
    _intervalos(e, "governos", gov)
    pres = obj.get("presidentes") or []
    for k, p in enumerate(pres):
        w = f"presidentes[{k}]"
        if e.chaves(w, p, ("id", "nome", "inicio", "fim", "fonte")):
            e.data(f"{w}.inicio", p.get("inicio"))
            e.data(f"{w}.fim", p.get("fim"), nulo=True)
            e.url(f"{w}.fonte", p.get("fonte"))
    _intervalos(e, "presidentes", pres)
    legs = obj.get("legislaturas") or []
    for k, x in enumerate(legs):
        if e.chaves(f"legislaturas[{k}]", x, ("sigla", "inicio", "fim")):
            e.data(f"legislaturas[{k}].inicio", x.get("inicio"))
    if [x.get("inicio") for x in legs] != sorted(x.get("inicio") or "" for x in legs):
        e.append("legislaturas: fora da ordem do início")
    siglas_legs = {x.get("sigla") for x in legs}
    for gid, g in grupos.items():
        w = f"grupos[{gid}]"
        if not e.chaves(w, g, ("id", "nomes")):
            continue
        if g.get("id") != gid:
            e.append(f"{w}.id ≠ chave")
        for n in g.get("nomes") or []:
            if e.chaves(f"{w}.nomes", n, ("sigla", "nome", "legislaturas")):
                for leg in n.get("legislaturas") or []:
                    if leg not in siglas_legs:
                        e.append(f"{w}.nomes: legislatura {leg!r} desconhecida")
    for leg, mapa in (obj.get("siglas") or {}).items():
        if leg not in siglas_legs:
            e.append(f"siglas: legislatura {leg!r} desconhecida")
        for s, gid in (mapa or {}).items():
            if gid not in grupos:
                e.append(f"siglas[{leg}][{s}]: grupo {gid!r} desconhecido")
    return e


# ---- quem/<slug>.json -------------------------------------------------------------------------
def _listas(e: _Erros, onde: str, x) -> None:
    if not e.chaves(onde, x, ("total", "listas")):
        return
    ls = x.get("listas") or {}
    n = 0
    for nome in LISTAS:
        if e.tipo(f"{onde}.listas.{nome}", ls.get(nome), list):
            for k, a in enumerate(ls[nome]):
                e.chaves(f"{onde}.listas.{nome}[{k}]", a, ("ato",))
            n += len(ls[nome])
    if x.get("total") != n:
        e.append(f"{onde}.total {x.get('total')} ≠ {n} atos nas listas")


def validar_quem_diploma(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("quem/<slug>", obj, ("slug", "ato_original", "desde", "por_governo", "por_legislatura", "fora", "retificacoes")):
        return e
    w = f"quem/{obj.get('slug')}"
    e.data(f"{w}.desde", obj.get("desde"), nulo=True)
    for k, p in enumerate(obj.get("por_governo") or []):
        if e.chaves(f"{w}.por_governo[{k}]", p, ("governo",)):
            e.tipo(f"{w}.por_governo[{k}].governo", p.get("governo"), int)
            _listas(e, f"{w}.por_governo[{k}]", p)
    nums = [p.get("governo") for p in obj.get("por_governo") or []]
    if nums != sorted(nums) or len(set(nums)) != len(nums):
        e.append(f"{w}.por_governo: Governos fora da ordem ou repetidos")
    for k, p in enumerate(obj.get("por_legislatura") or []):
        if e.chaves(f"{w}.por_legislatura[{k}]", p, ("legislatura", "governos")):
            _listas(e, f"{w}.por_legislatura[{k}]", p)
    if e.tipo(f"{w}.fora", obj.get("fora"), dict):
        for nome in FORA_DIPLOMA:
            e.tipo(f"{w}.fora.{nome}", obj["fora"].get(nome), list)
    e.tipo(f"{w}.retificacoes", obj.get("retificacoes"), dict)
    return e


# ---- grupos ---------------------------------------------------------------------------------
def _dobrar(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def validar_grupos_index(obj) -> list[str]:
    e = _Erros()
    if not e.tipo("grupos/index.json", obj, list):
        return e
    for k, g in enumerate(obj):
        if e.chaves(f"grupos/index[{k}]", g, ("id", "nome", "siglas", "legislaturas")):
            if g.get("id") in ("desc", "ninsc", "nicr", "indep"):
                e.append(f"grupos/index[{k}]: pseudo-grupo {g['id']!r}")
    nomes = [_dobrar(g.get("nome")) for g in obj if isinstance(g, dict)]
    if nomes != sorted(nomes):
        e.append("grupos/index: fora da ordem alfabética do nome")
    return e


def validar_grupo(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("grupo", obj, ("id", "nomes", "iniciativas", "votos")):
        return e
    w = f"grupos/{obj.get('id')}"
    for k, x in enumerate(obj.get("iniciativas") or []):
        if e.chaves(f"{w}.iniciativas[{k}]", x, ("iniciativa", "designacao", "sigla", "ato", "como", "n_iniciativas", "parte")):
            e.valor(f"{w}.iniciativas[{k}].como", x.get("como"), {"propria", "juntada"})
    if e.tipo(f"{w}.votos", obj.get("votos"), dict):
        for slug, rows in obj["votos"].items():
            for k, x in enumerate(rows):
                ww = f"{w}.votos[{slug}][{k}]"
                if e.chaves(ww, x, ("ato", "oe", "sigla", "legislatura", "itens")):
                    for j, it in enumerate(x.get("itens") or []):
                        if e.chaves(f"{ww}.itens[{j}]", it, ("tipo", "sentido")):
                            e.valor(f"{ww}.itens[{j}].sentido", it.get("sentido"), SENTIDOS_GRUPO)
    return e


# ---- content files (written by pipeline/conteudo.py) ------------------------------------------
def validar_glossario(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("glossario.json", obj, ("preparado_em", "termos")):
        return e
    e.data("glossario.preparado_em", obj.get("preparado_em"))
    for tid, t in (obj.get("termos") or {}).items():
        w = f"glossario[{tid}]"
        if not e.chaves(w, t, ("id", "termo", "formas", "grupo", "definicao", "fonte", "apoio")):
            continue
        if t.get("id") != tid:
            e.append(f"{w}.id ≠ chave")
        if e.tipo(f"{w}.definicao", t.get("definicao"), list) and not 1 <= len(t["definicao"]) <= 3:
            e.append(f"{w}.definicao: 1 a 3 frases")
        f = t.get("fonte")
        if e.tipo(f"{w}.fonte", f, dict):
            if not (("rota" in f and str(f["rota"]).startswith("#/")) or ("url" in f and URL.match(str(f["url"])))) or "texto" not in f:
                e.append(f"{w}.fonte: {{rota|url, texto}} esperado")
        if e.tipo(f"{w}.apoio", t.get("apoio"), list) and not 1 <= len(t["apoio"]) <= 3:
            e.append(f"{w}.apoio: 1 a 3 excertos")
    return e


def validar_historias_index(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("historias/index.json", obj, ("historias", "artigos")):
        return e
    for k, h in enumerate(obj.get("historias") or []):
        if e.chaves(f"historias/index[{k}]", h, ("slug", "titulo", "resumo", "preparado_em", "preparacao", "revisao_externa",
                                                  "diplomas", "aviso", "minutos")):
            e.valor(f"historias/index[{k}].preparacao", h.get("preparacao"), {"assistida", "equipa"})
            e.data(f"historias/index[{k}].preparado_em", h.get("preparado_em"))
    for art, xs in (obj.get("artigos") or {}).items():
        if "/" not in art:
            e.append(f"historias/index.artigos: chave {art!r} sem <diploma>/<artigo>")
        for x in xs if isinstance(xs, list) else []:
            if not isinstance(x, dict) or "historia" not in x or "seccao" not in x:
                e.append(f"historias/index.artigos[{art}]: {{historia, seccao}} esperado")
    return e


def _partes(e: _Erros, onde: str, partes) -> None:
    """Inline segments of a story: strings, links {href, texto|partes}, {t:'em'}, {t:'nota', n, id}, {t:'governo'}."""
    if not e.tipo(onde, partes, list):
        return
    for j, s in enumerate(partes):
        if isinstance(s, str):
            continue
        w = f"{onde}[{j}]"
        if not isinstance(s, dict):
            e.append(f"{w}: segmento inválido {s!r}"[:200])
        elif "href" in s:
            if not ("texto" in s or "partes" in s):
                e.append(f"{w}: ligação sem texto")
            elif not (str(s["href"]).startswith("#/") or URL.match(str(s["href"]))):
                e.append(f"{w}: href {s['href']!r} inválido")
            if "partes" in s:
                _partes(e, w + ".partes", s["partes"])
        elif s.get("t") == "em":
            e.tipo(w + ".texto", s.get("texto"), str)
        elif s.get("t") == "nota":
            if not isinstance(s.get("n"), int) or not s.get("id"):
                e.append(f"{w}: nota sem n ou id")
        elif s.get("t") == "governo":
            e.tipo(w + ".numero", s.get("numero"), int)
        else:
            e.append(f"{w}: segmento inválido {s!r}"[:200])


def validar_historia(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("historia", obj, ("slug", "titulo", "resumo", "preparado_em", "atualizado_em", "autoria", "preparacao",
                                      "revisao_externa", "aviso", "diplomas", "palavras", "minutos", "imagem_partilha",
                                      "desatualizada", "blocos", "notas", "relacionadas")):
        return e
    w = f"historias/{obj.get('slug')}"
    e.data(f"{w}.preparado_em", obj.get("preparado_em"))
    e.data(f"{w}.atualizado_em", obj.get("atualizado_em"))
    e.valor(f"{w}.preparacao", obj.get("preparacao"), {"assistida", "equipa"})
    ids, n_fig = set(), 0
    for k, b in enumerate(obj.get("blocos") or []):
        ww = f"{w}.blocos[{k}]"
        t = b.get("t") if isinstance(b, dict) else None
        if t == "p":
            _partes(e, ww + ".partes", b.get("partes"))
        elif t in ("h2", "h3"):
            if e.chaves(ww, b, ("id", "texto")):
                if b["id"] in ids:
                    e.append(f"{ww}: id repetido {b['id']!r}")
                ids.add(b["id"])
        elif t == "citacao":
            _partes(e, ww + ".partes", b.get("partes"))
            _partes(e, ww + ".autor", b.get("autor"))
        elif t == "figura":
            if not e.chaves(ww, b, ("n", "id", "tipo", "largura", "titulo", "sub", "legenda", "fonte", "href", "params", "retida", "aviso")):
                continue
            n_fig += 1
            if b["n"] != n_fig:
                e.append(f"{ww}: figura n.º {b['n']}, esperado {n_fig}")
            e.valor(f"{ww}.tipo", b.get("tipo"), TIPOS_FIGURA)
            e.valor(f"{ww}.largura", b.get("largura"), {"texto", "larga", "lado"})
            e.tipo(f"{ww}.params", b.get("params"), dict)
            _partes(e, ww + ".legenda", b.get("legenda"))
            if b.get("tipo") == "passos" and (b.get("params") or {}).get("passos") is not None:
                for j, ps in enumerate(b["params"]["passos"]):
                    if e.chaves(f"{ww}.params.passos[{j}]", ps, ("i", "redacao", "mostrar", "partes")):
                        e.tipo(f"{ww}.params.passos[{j}].i", ps.get("i"), int)
                        _partes(e, f"{ww}.params.passos[{j}].partes", ps.get("partes"))
            if "fig-" + str(b["id"]) in ids:
                e.append(f"{ww}: id repetido {b['id']!r}")
            ids.add("fig-" + str(b["id"]))
        else:
            e.append(f"{ww}: bloco inválido {t!r}")
    for k, n in enumerate(obj.get("notas") or []):
        ww = f"{w}.notas[{k}]"
        if e.chaves(ww, n, ("n", "id", "partes", "urls")):
            if n["n"] != k + 1:
                e.append(f"{ww}: n {n['n']}, esperado {k + 1}")
            _partes(e, ww + ".partes", n["partes"])
            for u in n.get("urls") or []:
                e.url(ww + ".urls", u.get("href"))
                if u.get("consultado"):
                    e.data(ww + ".consultado", u.get("consultado"))
    for k, r in enumerate(obj.get("relacionadas") or []):
        e.chaves(f"{w}.relacionadas[{k}]", r, ("texto", "href"))
    return e


def validar_partilha(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("partilha.json", obj, ("base", "artigos", "historias")):
        return e
    e.url("partilha.base", obj.get("base"))
    for k, chaves in (obj.get("artigos") or {}).items():
        if "/" not in k:
            e.append(f"partilha.artigos: chave {k!r} sem <diploma>/<artigo>")
        for c in chaves:
            if not isinstance(c, str) or not CHAVE_PARTILHA.match(c) or c.isdigit():
                e.append(f"partilha.artigos[{k}]: chave {c!r} inválida")
    return e


def validar_verificacao_quem(obj) -> list[str]:
    e = _Erros()
    if not e.chaves("verificacao.quem", obj, ("assinaturas", "cruzamento", "mesmo_pm", "passos_descartados", "votos_descartados", "cobertura")):
        return e
    a = obj.get("assinaturas") or {}
    e.chaves("verificacao.quem.assinaturas", a, ("total", "com_d_cm", "falhas"))
    for k, x in enumerate(obj.get("cruzamento") or []):
        if e.chaves(f"verificacao.quem.cruzamento[{k}]", x, ("ato", "regra", "estado", "detalhe")):
            e.valor(f"verificacao.quem.cruzamento[{k}].estado", x.get("estado"), ESTADOS_REGRA)
    for k, x in enumerate(obj.get("mesmo_pm") or []):
        e.chaves(f"verificacao.quem.mesmo_pm[{k}]", x, ("ato", "d_cm", "governos"))
    e.chaves("verificacao.quem.cobertura", obj.get("cobertura"), ("dl_d_cm", "leis_promulgacao"))
    return e


# ---- A's changed files --------------------------------------------------------------------------
def validar_atos(obj) -> list[str]:
    e = _Erros()
    if not e.tipo("atos.json", obj, dict):
        return e
    for aid, a in obj.items():
        w = f"atos[{aid}]"
        if not e.chaves(w, a, ("id", "designacao", "publicacao", "link", "sumario", "alteracoes", "tipo_ato")):
            continue
        if a.get("id") != aid:
            e.append(f"{w}.id ≠ chave")
        e.valor(f"{w}.tipo_ato", a.get("tipo_ato"), TIPOS_ATO)
        e.data(f"{w}.publicacao", a.get("publicacao"), nulo=True)
    return e


# ---- the folder ---------------------------------------------------------------------------------
def _ler(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def validar_pasta(pasta: str, completo: bool = False) -> list[str]:
    """Every file of an app/data-shaped folder, and the checks across files."""
    e = _Erros()

    def ler(nome, exigido=True):
        p = os.path.join(pasta, nome)
        if not os.path.exists(p):
            if exigido:
                e.append(f"{nome}: falta")
            return None
        try:
            return _ler(p)
        except ValueError as x:
            e.append(f"{nome}: JSON inválido ({x})")
            return None

    atos = ler("atos.json")
    index = ler("index.json")
    passagem = ler("passagem.json")
    quem = ler("quem.json")
    governos = ler("governos.json")
    verif = ler("verificacao.json")
    gidx = ler(os.path.join("grupos", "index.json"))
    if atos is not None:
        e.extend(validar_atos(atos))
    if passagem is not None:
        e.extend(validar_passagem(passagem))
    if quem is not None:
        e.extend(validar_quem(quem))
    if governos is not None:
        e.extend(validar_governos(governos))
    if verif is not None:
        if "quem" not in verif:
            e.append("verificacao.json: falta a chave quem")
        else:
            e.extend(validar_verificacao_quem(verif["quem"]))
    if gidx is not None:
        e.extend(validar_grupos_index(gidx))
        for g in gidx:
            gg = ler(os.path.join("grupos", f"{g.get('id')}.json"))
            if gg is not None:
                e.extend(validar_grupo(gg))
                if gg.get("id") != g.get("id"):
                    e.append(f"grupos/{g.get('id')}.json: id {gg.get('id')!r}")
    # The diplomas: d/<slug>.json, d/<slug>/<artigo>.json, quem/<slug>.json.
    slugs = [d.get("slug") for d in (index or {}).get("diplomas", [])]
    for slug in slugs:
        d = ler(os.path.join("d", slug + ".json"))
        qd = ler(os.path.join("quem", slug + ".json"))
        if qd is not None:
            e.extend(validar_quem_diploma(qd))
            if governos is not None:
                nums = {g["numero"] for g in governos.get("governos", [])}
                for p in qd.get("por_governo", []):
                    if p.get("governo") not in nums:
                        e.append(f"quem/{slug}.json: Governo {p.get('governo')} não está em governos.json")
            if atos is not None:
                for a in _atos_quem_diploma(qd):
                    if a not in atos:
                        e.append(f"quem/{slug}.json: ato {a!r} não está em atos.json")
        if d is None:
            continue
        copia = d.get("copia")
        if copia is not None:
            e.chaves(f"d/{slug}.copia", copia, ("inicio", "diploma", "rotulo"))
        for n in d.get("arvore", []):
            if n.get("tipo") != "artigo":
                continue
            art = ler(os.path.join("d", slug, n["artigo"] + ".json"))
            if art is None or atos is None:
                continue
            for v in art.get("versoes", []):
                if v.get("ato") not in atos:
                    e.append(f"d/{slug}/{n['artigo']}: ato {v.get('ato')!r} não está em atos.json")
    if index is not None:
        al = index.get("aliases_atos")
        if not isinstance(al, dict):
            e.append("index.json: falta aliases_atos")
        elif atos is not None:
            for velho, novo in al.items():
                if novo not in atos:
                    e.append(f"index.aliases_atos[{velho}]: {novo!r} não está em atos.json")
                if velho in atos:
                    e.append(f"index.aliases_atos[{velho}]: o id antigo ainda é um ato")
    pesq = ler("pesquisa.json")
    if pesq is not None:
        for k, row in enumerate(pesq[:50000]):
            if not isinstance(row, list) or len(row) != 6:
                e.append(f"pesquisa[{k}]: 6 elementos esperados")
                break
    # Across files.
    if quem is not None and atos is not None:
        for aid in quem:
            if aid not in atos:
                e.append(f"quem[{aid}]: não está em atos.json")
        for aid in atos:
            if aid not in quem:
                e.append(f"atos[{aid}]: sem registo em quem.json")
    if quem is not None and governos is not None:
        nums = {g["numero"] for g in governos.get("governos", []) if isinstance(g, dict) and "numero" in g}
        pres = {p.get("id") for p in governos.get("presidentes", []) if isinstance(p, dict)}
        for aid, r in quem.items():
            if not isinstance(r, dict):
                continue
            gs = [(r.get("governo") or {}).get("numero"), r.get("governo_publicacao"), (r.get("periodo") or {}).get("governo")]
            gs += [x.get("governo") for x in r.get("proponentes") or [] if isinstance(x, dict)]
            for n in gs:
                if n is not None and n not in nums:
                    e.append(f"quem[{aid}]: Governo {n} não está em governos.json")
            p = r.get("presidente")
            if isinstance(p, dict) and p.get("id") not in pres and not p.get("interino"):
                e.append(f"quem[{aid}].presidente: {p.get('id')!r} não está em governos.json")
            for x in r.get("retificado_por") or []:
                if atos is not None and x not in atos:
                    e.append(f"quem[{aid}].retificado_por: {x!r} não está em atos.json")
            if r.get("retifica") and atos is not None and r["retifica"] not in atos:
                e.append(f"quem[{aid}].retifica: {r['retifica']!r} não está em atos.json")
    if passagem is not None and atos is not None:
        for aid in passagem:
            if aid not in atos:
                e.append(f"passagem[{aid}]: não está em atos.json")
    if passagem is not None and governos is not None:
        siglas = governos.get("siglas") or {}
        for aid, p in passagem.items():
            for v in _votos(p):
                leg = v.get("legislatura")
                if leg and leg in siglas:
                    for g in list((v.get("grupos") or {}).keys()) + list(v.get("ausentes") or []) + list(v.get("sem_registo") or []):
                        if g not in siglas[leg]:
                            e.append(f"passagem[{aid}]: sigla {g!r} não existe na legislatura {leg}")
    # Content files.
    for nome, f in (("glossario.json", validar_glossario), ("partilha.json", validar_partilha),
                    (os.path.join("historias", "index.json"), validar_historias_index)):
        obj = ler(nome, exigido=completo)
        if obj is not None:
            e.extend(f(obj))
            if nome.startswith("historias"):
                for h in obj.get("historias", []):
                    hh = ler(os.path.join("historias", h.get("slug", "?") + ".json"))
                    if hh is not None:
                        e.extend(validar_historia(hh))
    if verif is not None and "conteudo" in verif:
        for k, x in enumerate(verif["conteudo"] or []):
            if e.chaves(f"verificacao.conteudo[{k}]", x, ("tipo", "id", "seccao", "motivo")):
                e.valor(f"verificacao.conteudo[{k}].tipo", x.get("tipo"), {"historia", "glossario", "partilha"})
    return e


def _votos(p: dict):
    for i in p.get("iniciativas") or []:
        if i.get("generalidade"):
            yield i["generalidade"]
    yield from p.get("texto_comissao") or []
    if p.get("vfg"):
        yield p["vfg"]
    for x in p.get("eventos") or []:
        if x.get("voto"):
            yield x["voto"]


def _atos_quem_diploma(qd: dict):
    for p in (qd.get("por_governo") or []) + (qd.get("por_legislatura") or []):
        for lst in (p.get("listas") or {}).values():
            for a in lst:
                yield a.get("ato")
    for lst in (qd.get("fora") or {}).values():
        for a in lst:
            yield a.get("ato") if isinstance(a, dict) else a
    for k, v in (qd.get("retificacoes") or {}).items():
        yield k
        yield from v


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    erros = validar_pasta(args[0], completo="--completo" in argv)
    for x in erros[:500]:
        print(x)
    if len(erros) > 500:
        print(f"… e mais {len(erros) - 500}")
    print(f"{len(erros)} erros", file=sys.stderr)
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
