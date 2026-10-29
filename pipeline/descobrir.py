"""Write the corpus entries for the diplomas in pipeline/alvos.json, without looking anything up by hand.

For each target (a name, an abbreviation, an area and the act that approved it):

1. The DR record. Candidates: the record of the approving act, and records whose title or
   summary names the diploma and says they republish or approve it (data/catalogo.json, from
   pipeline/catalogo.py). We keep the one whose list of amending acts reaches furthest (a record
   the DR stopped updating, like the Código da Estrada's, loses), then the one with most acts.
2. Where the text is. When the record has annexes with articles, the code is the annex whose
   heading names it ("Anexo IV — Código do Imposto…", "CÓDIGO PENAL"), else the annex with most
   articles. Other annexes with articles (another code, tables) are left out.
3. The original entry into force. The DR leaves it empty. We read the approving act's own
   article on it: an explicit date ("1 de outubro de 1995"), or one relative to publication ("no
   dia seguinte", "30 dias após", "no primeiro dia do mês seguinte"). Without one, the default
   rule of the period: the fifth day after publication (Lei n.º 74/98 from 1998, Lei n.º 6/83
   before).
4. Where the history starts. A record that is a later republication gets the note the article
   page shows on its first redação.
5. Names, and the pattern that finds bills in Parliament that would change it.

Anything uncertain goes to the target's "revisao" list and to the report printed at the end. A
person reads the report; pipeline/build.py checks the built data again.

    python -I pipeline/descobrir.py              # every target in alvos.json
    python -I pipeline/descobrir.py cpa cire     # only these slugs
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import fetch  # noqa: E402

CATALOGO = os.path.join(ROOT, "data", "catalogo.json")
SAIDA = os.path.join(ROOT, "pipeline", "corpus-auto.json")
ARTIGO, ANEXO = 11, 14
MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
NUMEROS = {"um": 1, "dois": 2, "tres": 3, "cinco": 5, "oito": 8, "dez": 10, "quinze": 15, "vinte": 20, "trinta": 30,
           "quarenta e cinco": 45, "sessenta": 60, "noventa": 90, "cento e vinte": 120, "cento e cinquenta": 150,
           "cento e oitenta": 180, "duzentos e setenta": 270, "trezentos e sessenta e cinco": 365}
DIAS_ORDINAIS = {"quinto": 5, "decimo": 10, "decimo quinto": 15, "vigesimo": 20, "trigesimo": 30, "sexagesimo": 60,
                 "nonagesimo": 90, "centesimo vigesimo": 120, "centesimo octogesimo": 180}
ORDINAIS = {"primeiro": 1, "1.o": 1, "1.": 1, "segundo": 2, "terceiro": 3, "quarto": 4, "quinto": 5, "sexto": 6}


def norm(s: str) -> str:
    """Lower case, no accents, one space, "n.º" spelled one way."""
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"n\.\s*[oº°]\s*", "n.o ", s)
    return re.sub(r"\s+", " ", s).strip()


def designacao(s: str) -> str:
    """"Decreto-Lei n.º 4/2015" from a DR title, normalised for comparison."""
    return norm(re.split(r"\s+-\s+", s)[0])


# ---- 1. The record ----------------------------------------------------------------------------
def historico(e: dict, hoje: str) -> dict:
    h = fetch.cached("diploma_header", e["frag_id"], e["tipo"], e["key"])
    legis = h["ConsolidadaConteudoDetalhe"]["DiplomaLegis"]["Id"]
    tl = fetch.cached("timeline", e["frag_id"], legis, hoje)["ModificacoesList"]["List"]
    datas = sorted((m.get("DataPublicacao") or "")[:10] for m in tl
                   if m.get("DataPublicacao") and designacao(m.get("Title") or "") != designacao(e["designacao"])
                   and not re.match(r"declaracao de re(c)?tificacao", norm(m.get("Title") or "")))
    return {"header": h, "legis": legis, "n_atos": len(tl), "ultima": datas[-1] if datas else e.get("publicacao") or "",
            "primeira": datas[0] if datas else None}


def candidatos(alvo: dict, cat: list[dict]) -> tuple[list[dict], list[dict]]:
    """(records of the approving act, records whose summary says they republish the diploma)."""
    ato = norm(alvo["ato"])
    nomes = "|".join(re.escape(norm(n)) for n in [alvo["titulo"]] + alvo.get("nomes", []))
    repub = re.compile(r"republica\w*[^.;]{0,120}?(" + nomes + ")")
    exatos, republicacoes = [], []
    for e in cat:
        if designacao(e["designacao"]) == ato:
            exatos.append(e)
        elif repub.search(norm(e["titulo"] + " " + e["sumario"])):
            republicacoes.append(e)
    return exatos, republicacoes


def escolher(alvo: dict, cat: list[dict], hoje: str, revisao: list[str]) -> tuple[dict, dict] | tuple[None, None]:
    """The approving act's record; a republication's record instead when it is more current."""
    exatos, repubs = candidatos(alvo, cat)
    def com_historico(es):
        out = []
        for e in es:
            try:
                out.append((e, historico(e, hoje)))
            except Exception as x:  # a record the DR does not serve
                revisao.append(f"Registo {e['tipo']} {e['key']} sem resposta: {x}")
        return sorted(out, key=lambda p: (p[1]["ultima"], p[1]["n_atos"]), reverse=True)
    ex, rp = com_historico(exatos), com_historico(repubs)
    if ex and (not rp or ex[0][1]["ultima"] >= rp[0][1]["ultima"]):
        e, h = ex[0]
    elif rp:
        e, h = rp[0]
        revisao.append(f"Usamos a republicação {pela(e['designacao'])} {e['designacao']}" + (f", mais atual do que o registo do {alvo['ato']}." if ex else f": o {alvo['ato']} não está no consolidado do DR."))
    else:
        revisao.append(f"O {alvo['ato']} não está na lista de legislação consolidada do DR, nem uma republicação dele.")
        return None, None
    anos = (dt.date.fromisoformat(hoje) - dt.date.fromisoformat(h["ultima"])).days / 365.25 if h["ultima"] else 99
    if anos > 4:
        revisao.append(f"A última alteração no consolidado do DR é de {h['ultima']}: confirme que o DR ainda o atualiza.")
    return e, h


# ---- 2. Where the text is ---------------------------------------------------------------------
def estrutura(e: dict, h: dict, hoje: str) -> list[dict]:
    return fetch.cached("as_of", e["frag_id"], h["legis"], hoje, h["header"])["LegConsBase"]["List"]


def anexos(frags: list[dict]) -> list[dict]:
    """The annexes at the top level, with how many articles each holds."""
    out, cur = [], None
    for f in frags:
        fv, nivel = f["FragmentoVersao"], f["Nivel"]
        if nivel <= 1 and fv["TipoFragmentoId"] != ARTIGO:
            cur = None
            if fv["TipoFragmentoId"] == ANEXO:
                cur = {"nome": f["ConsolidacaoFragmento"]["Name"].strip(), "epigrafe": (fv.get("Epigrafe") or "").strip(), "artigos": 0}
                out.append(cur)
        elif fv["TipoFragmentoId"] == ARTIGO and cur is not None:
            cur["artigos"] += 1
    return [a for a in out if a["artigos"]]


def onde(alvo: dict, frags: list[dict], revisao: list[str]) -> dict:
    """corpus.json fields for the code's place: codigo_no_anexo, so_anexo."""
    ax = anexos(frags)
    if not ax:
        return {}
    chave = norm(alvo.get("anexo") or alvo["titulo"])
    palavras = [w for w in re.findall(r"[a-z]{4,}", chave) if w not in ("codigo", "regime", "geral", "sobre")]
    def nota(a):
        t = norm(a["nome"] + " " + a["epigrafe"])
        return sum(w in t for w in palavras) / max(1, len(palavras))
    melhor = max(ax, key=lambda a: (nota(a), a["artigos"]))
    if nota(melhor) < 0.5:
        melhor = max(ax, key=lambda a: a["artigos"])
        total = sum(a["artigos"] for a in ax)
        artigos_lei = sum(1 for f in frags if f["FragmentoVersao"]["TipoFragmentoId"] == ARTIGO) - total
        if melhor["artigos"] < artigos_lei:  # the act's own articles are the law; the annexes are tables or forms
            return {}
        revisao.append(f"O texto está no anexo «{melhor['nome']}» ({melhor['epigrafe'][:60]}), escolhido por ter mais artigos.")
    campos = {"codigo_no_anexo": melhor["nome"]}
    if len([a for a in ax if norm(a["nome"]) == norm(melhor["nome"])]) > 1:
        # Two annexes with the same name: the heading tells them apart.
        campos["codigo_no_anexo"] = {"nome": melhor["nome"], "epigrafe": melhor["epigrafe"][:60]}
    if len(ax) > 1:
        campos["so_anexo"] = True
    return campos


# ---- 3. The original entry into force -----------------------------------------------------------
_VIGOR = re.compile(r"entra(?:m)? em vigor|comeca(?:m)? a vigorar|inicia(?:m)? a sua vigencia|produz(?:em)? efeitos", re.I)


def _mais_meses(d: dt.date, n: int) -> dt.date:
    m = d.month - 1 + n
    return dt.date(d.year + m // 12, m % 12 + 1, 1)


def ler_data(frase: str, pub: dt.date) -> tuple[dt.date | None, str]:
    """The date an entry-into-force sentence sets, and how we read it ("" when we could not).

    The first date phrase in the sentence wins: it belongs to the main clause, before any
    exception ("um ano após a publicação, com excepção do artigo 7.º, que entra em vigor no dia
    seguinte" is one year)."""
    f = norm(frase)
    achados = []  # (position, date, how)
    m = re.search(r"(\d{1,2})(?:\.o?)? (?:de )?(" + "|".join(MESES) + r") de (\d{4})", f)
    if m:
        achados.append((m.start(), dt.date(int(m.group(3)), MESES.index(m.group(2)) + 1, int(m.group(1))), "data"))
    m = re.search(r"dia (imediato|seguinte) ao (da|de) (sua )?publicacao", f)
    if m:
        achados.append((m.start(), pub + dt.timedelta(days=1), "dia seguinte"))
    apos = r"(?:apos|depois d[ao]|a contar d[ao]|sobre|seguinte a) (?:a )?(?:data d[ao] )?(?:sua )?publicacao"
    # "N dias após": publication + N days, as the DR dates every amending act that says so
    # (Lei n.º 32/2025, published 27 March 2025, "30 dias após": in force 26 April 2025).
    m = re.search(r"(\d+|" + "|".join(sorted(NUMEROS, key=len, reverse=True)) + r") dias (uteis )?" + apos, f)
    if m and not m.group(2):
        n = int(m.group(1)) if m.group(1).isdigit() else NUMEROS[m.group(1)]
        achados.append((m.start(), pub + dt.timedelta(days=n), f"{n} dias"))
    m = re.search(r"(\d+)\.?o? dia (util )?" + apos, f) or re.search(r"(" + "|".join(sorted(DIAS_ORDINAIS, key=len, reverse=True)) + r") dia (util )?" + apos, f)
    if m and not m.group(2):
        n = int(m.group(1)) if m.group(1).isdigit() else DIAS_ORDINAIS[m.group(1)]
        achados.append((m.start(), pub + dt.timedelta(days=n), f"{n} dias"))
    m = re.search(r"(\d+|um|dois) anos? " + apos, f)
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else {"um": 1, "dois": 2}[m.group(1)]
        try:
            fim = pub.replace(year=pub.year + n)
        except ValueError:  # 29 February
            fim = pub.replace(year=pub.year + n, day=28)
        achados.append((m.start(), fim, f"{n} {'ano' if n == 1 else 'anos'}"))
    m = re.search(r"(\d+|um|dois|tres|seis|doze) mes(?:es)? " + apos, f)
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else {"um": 1, "dois": 2, "tres": 3, "seis": 6, "doze": 12}[m.group(1)]
        fim = _mais_meses(pub, n)
        dia = min(pub.day, ((_mais_meses(fim, 1) - dt.timedelta(days=1)).day))
        achados.append((m.start(), fim.replace(day=dia), f"{n} meses"))
    m = re.search(r"(primeiro|1\.o?) dia (?:util )?do (segundo |terceiro |quarto |sexto )?mes (?:seguinte|posterior|subsequente) a[o]? (?:da |de )?(?:sua )?publicacao", f)
    if m and "util" not in m.group(0):
        n = ORDINAIS.get((m.group(2) or "").strip(), 1)
        achados.append((m.start(), _mais_meses(pub, n), "mês seguinte"))
    if not achados:
        return None, ""
    _, data, como = min(achados, key=lambda x: x[0])
    return data, como


def vigor(alvo: dict, e: dict, h: dict, campos: dict, revisao: list[str], hoje: str) -> dict | None:
    """corpus.json "vigor_original": {"data", "regra", "fonte"}."""
    pub = dt.date.fromisoformat(e["publicacao"])
    ini = fetch.cached("initial_date", e["frag_id"], h["legis"])
    data0 = str(ini.get("DataInicial") or ini.get("Data") or next(iter(ini.values())))[:10]
    first = fetch.cached("as_of", e["frag_id"], h["legis"], data0, h["header"])["LegConsBase"]["List"]
    # The approving act's own articles: those outside every annex. The DR's snapshot of the original
    # text sometimes lacks some of them (the CIRE's decree: articles 6.º to 13.º), so we add those
    # from today's structure.
    def fora_dos_anexos(frags):
        out, no_anexo = [], False
        for f in frags:
            fv = f["FragmentoVersao"]
            if f["Nivel"] <= 1 and fv["TipoFragmentoId"] != ARTIGO:
                no_anexo = fv["TipoFragmentoId"] == ANEXO
            elif fv["TipoFragmentoId"] == ARTIGO and not no_anexo:
                out.append(f)
        return out
    proprios = fora_dos_anexos(first)
    ja = {f["ConsolidacaoFragmento"]["Name"] for f in proprios}
    proprios += [f for f in fora_dos_anexos(estrutura(e, h, hoje))
                 if f["ConsolidacaoFragmento"]["Name"] not in ja]
    # The article on entry into force: by its heading, or (without one) by a sentence about the
    # act itself. "Produz efeitos" counts only in an article whose heading is about it.
    achados = []
    for f in proprios:
        ep, txt = norm(f["FragmentoVersao"].get("Epigrafe") or ""), fetch.dr.plain(f["FragmentoVersao"].get("Texto") or "")
        if re.search(r"entrada em vigor|inicio de vigencia|comeco de vigencia|vigencia|producao de efeitos", ep):
            achados.append((f, f["ConsolidacaoFragmento"]["Name"], txt, True))
        elif not ep and re.search(r"(presente|este) (lei|decreto-lei|diploma|codigo)[^.]{0,80}(entra(m)? em vigor|comeca(m)? a vigorar)", norm(txt)):
            achados.append((f, f["ConsolidacaoFragmento"]["Name"], txt, False))
    def adiada(f, data: dt.date, efeitos: bool) -> tuple[dt.date, str] | None:
        """A later wording of the entry-into-force article, published before the date it set (the
        CPTA's, by Lei n.º 4-A/2003: 1 January 2004 instead of February 2003)."""
        try:
            vs = fetch.cached("article_versions", f["FragmentoVersao"]["Id"], e["frag_id"], h["legis"], hoje)
        except Exception:
            return None
        for v in sorted(vs, key=lambda v: v.get("DataVersao") or ""):
            desc = fetch.dr.plain(v.get("AssociacaoDescription") or "")
            if not desc.startswith("Alterado") or (v.get("DataVersao") or "")[:10] > data.isoformat():
                continue
            for frase in re.split(r"(?<=[.;])\s+|\n", fetch.dr.plain(v.get("Texto") or "")):
                if re.search(r"entra(m)? em vigor|comeca(m)? a vigorar" + (r"|produz(em)? efeitos" if efeitos else ""), norm(frase)):
                    nova, _ = ler_data(frase, pub)
                    ato = re.search(r"\[L\](.+?)\s+-", v.get("AssociacaoDescription") or "")
                    if nova:
                        return nova, ato.group(1).strip() if ato else desc
                    break
        return None

    for f, nome, txt, efeitos in achados:
        frases = [x for x in re.split(r"(?<=[.;])\s+|\n", txt) if re.search(r"entra(m)? em vigor|comeca(m)? a vigorar|inicia(m)? a sua vigencia" + (r"|produz(em)? efeitos" if efeitos else ""), norm(x))]
        for frase in frases[:1]:
            data, como = ler_data(frase, pub)
            if not data:
                revisao.append(f"Não percebemos a data de entrada em vigor em {nome}: «{frase[:160]}». Ficou sem data.")
                return None
            fonte = f"{e['designacao']}, {nome.lower()}" + ("" if como == "data" else " (primeiro dia do mês seguinte à publicação)" if como == "mês seguinte" else f" ({como} após a publicação)")
            outra = adiada(f, data, efeitos)
            if outra:
                data, fonte = outra[0], fonte + f", na redação dada {pela(outra[1])} {outra[1]}"
            if data < pub:
                revisao.append(f"A data de entrada em vigor ({data}) é anterior à publicação ({pub}): «{frase[:120]}».")
            if not outra and h.get("primeira") and h["primeira"] < data.isoformat():
                revisao.append(f"Um ato de {h['primeira']} alterou o diploma antes de {data}: confirme que não adiou a entrada em vigor.")
            if (data - pub).days > 730:
                revisao.append(f"Entrada em vigor {data}, mais de dois anos após a publicação: confirme.")
            if re.search(r"produz(em)? efeitos", norm(frase)) and not re.search(r"vigor", norm(frase)):
                revisao.append(f"Lemos a data de «produz efeitos», não de entrada em vigor: «{frase[:120]}».")
            return {"data": data.isoformat(), "regra": "explicita", "fonte": fonte}
    # The default rule of the period.
    if pub >= dt.date(1998, 11, 16):
        return {"data": (pub + dt.timedelta(days=5)).isoformat(), "regra": "supletiva", "fonte": "Lei n.º 74/98, artigo 2.º, n.º 2 (quinto dia após a publicação)"}
    if pub >= dt.date(1983, 7, 29):
        return {"data": (pub + dt.timedelta(days=5)).isoformat(), "regra": "supletiva", "fonte": "Lei n.º 6/83, artigo 2.º, n.º 2 (no continente, quinto dia após a publicação)"}
    revisao.append("Sem regra de entrada em vigor para um diploma anterior a 1983.")
    return None


# ---- 4–5. History start, names, bills ---------------------------------------------------------
def pela(desig: str) -> str:
    return "pela" if re.match(r"(Lei|Declaração|Portaria|Resolução)\b", desig) else "pelo"


def genitivo(titulo: str) -> str:
    return ("da " if re.match(r"(Lei|Constituição)\b", titulo) else "do ") + titulo


def padrao(texto: str) -> str:
    """A regex that finds texto with or without accents and with any space."""
    out = []
    for ch in texto:
        base = unicodedata.normalize("NFD", ch)[0]
        if ch.isupper():  # "Código" or "código"
            low = ch.lower()
            out.append(f"[{ch}{low}{unicodedata.normalize('NFD', low)[0]}]" if low != unicodedata.normalize("NFD", low)[0] else f"[{ch}{low}]")
        elif ch != base:
            out.append(f"[{ch}{base}]")
        elif base in "aeiouc" and base.isalpha():
            acentos = {"a": "áàâã", "e": "éê", "i": "í", "o": "óôõ", "u": "ú", "c": "ç"}[base]
            out.append(f"[{base}{acentos}]")
        elif ch == " ":
            out.append(r"\s+")
        else:
            out.append(re.escape(ch))
    return "".join(out)


def entrada(alvo: dict, cat: list[dict], hoje: str) -> dict:
    revisao: list[str] = []
    cfg = {k: alvo[k] for k in ("slug", "titulo", "sigla", "area")}
    e, h = escolher(alvo, cat, hoje, revisao)
    if not e:
        return {**cfg, "auto": True, "falha": True, "revisao": revisao}
    cfg.update({"frag_id": e["frag_id"], "tipo": e["tipo"], "key": e["key"], "genitivo": genitivo(alvo["titulo"])})
    frags = estrutura(e, h, hoje)
    cfg.update(onde(alvo, frags, revisao))
    v = vigor(alvo, e, h, cfg, revisao, hoje)
    if v:
        cfg["vigor_original"] = v
    if designacao(e["designacao"]) != norm(alvo["ato"]):
        de = e["designacao"]
        cfg["inicio_historia"] = {"rotulo": "Republicação", "nota": (
            f"O histórico deste diploma começa na republicação {pela(de)} {de}. "
            f"{'A' if genitivo(alvo['titulo']).startswith('da') else 'O'} {alvo['titulo']} foi aprovad{'a' if genitivo(alvo['titulo']).startswith('da') else 'o'} "
            f"{pela(alvo['ato'])} {alvo['ato']}. As redações anteriores ainda não estão no Redação.")}
    num = re.search(r"n\.º\s*(\S+)", alvo["ato"])
    tipo_ato = alvo["ato"].split(" n.º")[0]
    cfg["iniciativas"] = padrao(alvo["titulo"]) + (r"|" + padrao(tipo_ato) + r"\s+n\.º\s*" + re.escape(num.group(1)) + r"\b" if num else "")
    n_art = sum(1 for f in frags if f["FragmentoVersao"]["TipoFragmentoId"] == ARTIGO)
    cfg.update({"auto": True, "revisao": revisao, "_artigos_no_registo": n_art, "_ultima_alteracao": h["ultima"], "_atos": h["n_atos"]})
    return cfg


def main(argv: list[str]) -> int:
    with open(os.path.join(ROOT, "pipeline", "alvos.json"), encoding="utf-8") as fh:
        alvos = json.load(fh)["alvos"]
    with open(CATALOGO, encoding="utf-8") as fh:
        cat = json.load(fh)
    hoje = fetch.hoje(json.load(open(os.path.join(ROOT, "pipeline", "corpus.json"), encoding="utf-8")))
    so = set(argv[1:])
    antigos = {}
    if os.path.exists(SAIDA):
        with open(SAIDA, encoding="utf-8") as fh:
            antigos = {d["slug"]: d for d in json.load(fh)["diplomas"]}
    manuais = {d["slug"] for d in json.load(open(os.path.join(ROOT, "pipeline", "corpus.json"), encoding="utf-8"))["diplomas"]}
    out = []
    for alvo in alvos:
        if alvo["slug"] in manuais:
            continue
        if so and alvo["slug"] not in so:
            if alvo["slug"] in antigos:
                out.append(antigos[alvo["slug"]])
            continue
        d = entrada(alvo, cat, hoje)
        out.append(d)
        estado = "FALHA" if d.get("falha") else ("rever" if d["revisao"] else "ok")
        print(f"{estado:6} {alvo['slug']:40} {d.get('tipo', '')} {d.get('key', '')} " + (d.get("vigor_original") or {}).get("data", "") +
              (f"  anexo «{d['codigo_no_anexo']}»" if d.get("codigo_no_anexo") else "") + (f"  {d.get('_artigos_no_registo')} art., {d.get('_atos')} atos" if not d.get("falha") else ""))
        for r in d["revisao"]:
            print("         · " + r)
    with open(SAIDA, "w", encoding="utf-8") as fh:
        json.dump({"_nota": "Escrito por pipeline/descobrir.py a partir de pipeline/alvos.json. Não editar à mão: corrija alvos.json ou mova a entrada para corpus.json.",
                   "diplomas": out}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"{len(out)} entradas em {SAIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
