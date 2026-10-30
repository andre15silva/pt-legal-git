"""Parse the DR's change descriptions into structured acts.

Examples from the consolidated text:
  Alterado pelo/a Artigo 2.º do/a [L]Lei n.º 64/2025  - Diário da República n.º 216/2025, Série I de 2025-11-07[/L], em vigor a partir de 2025-11-12
  Rectificado pelo/a [L]Declaração de Rectificação n.º 24/2006  - Diário da República n.º 75/2006, Série I-A de 2006-04-18[/L]
  Revogado pelo/a Artigo 53.º do/a [L]<a href="/dr/detalhe/lei/56-2023-222477692" ...>Lei n.º 56/2023  - ...</a>[/L], em vigor a partir de 2023-10-07
"""
from __future__ import annotations

import html
import re
import unicodedata

TIPOS = {
    "alterado": "alterado", "aditado": "aditado", "revogado": "revogado", "retificado": "retificado",
    "rectificado": "retificado", "suspenso": "suspenso", "repristinado": "repristinado",
    "declarado": "inconstitucional", "renumerado": "renumerado",
    "declarada inconstitucionalidade": "inconstitucional", "declarado inconstitucional": "inconstitucional",
    "reposto em vigor": "repristinado", "reposta em vigor": "repristinado",
}
_DESC = re.compile(
    r"^(?P<verbo>\w+(?: \w+){0,2}?)\s+pelo/a\s+(?:(?P<artigo>(?:Artigo|Artigos|n\.º|Anexo|Parte|\d+\.º)[^\[]*?)\s+do/a\s+)?\[L\](?P<corpo>.*?)\[/L\]"
    r"(?:,\s*em vigor a partir de (?P<vigor>\d{4}-\d{2}-\d{2}))?", re.S)
_CORPO = re.compile(r"^(?P<designacao>.+?)\s+-\s+Diário d[ao] (?P<jornal>República|Governo) n\.º (?P<dr>[^,]+),\s*(?P<serie>.*?)\s+de (?P<pub>\d{4}-\d{2}-\d{2})\s*$", re.S)
# Words a designation starts with. A heading before them ("III - Decisão, ", "Subsecção II, ",
# "Diploma, ") comes from the DR note it was read from and is not part of the act's name (R-8).
_TIPO_INICIO = r"(?:Decreto|Lei|Acórdão|Declaração|Rectificação|Retificação|Portaria|Resolução|Despacho|Aviso|Regulamento)"
SEM_NUMERO = {"Declaração", "Rectificação", "Retificação"}
_HREF = re.compile(r'href="(/dr/detalhe/[^"]+)"')


def slug(designacao: str) -> str:
    s = re.sub(r"\bn\.?\s*[º°o]s?\b\.?", " ", designacao.lower())
    s = re.sub(r"(\d)\.?\s*[º°ª]", r"\1", s)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def limpar(designacao: str) -> str:
    """The act's name without a heading before it or a part after it (R-8):
    "III - DECISÃO, Acórdão do Tribunal Constitucional n.º 348/2025" -> "Acórdão do Tribunal Constitucional n.º 348/2025",
    "Decreto-Lei n.º 329-A/95 (1.ª Parte)" -> "Decreto-Lei n.º 329-A/95"."""
    d = re.sub(r"\s+", " ", designacao or "").strip()
    if not re.match(_TIPO_INICIO, d):
        m = re.search(r",\s*(" + _TIPO_INICIO + r"\b.*)$", d)
        if m:
            d = m.group(1)
    return re.sub(r"\s*\((?:\d+\.?\s*[ªa]\s*)?[Pp]arte\)$", "", d)


def _sem_numero(designacao: str, jornal: str | None, dr: str | None, serie: str | None) -> str:
    """A declaration without a number takes its name from the Diário that published it:
    "Declaração (Diário da República n.º 276/1986, 1.º Suplemento)". One bare "Declaração" id used
    to hold 109 changes from 13 dates (R-8)."""
    if designacao not in SEM_NUMERO or not dr:
        return designacao
    m = re.search(r"(\d+)\s*\.?\s*[º°]\s*Suplemento|Suplemento n\.?\s*º\s*(\d+)", serie or "")
    sup = f", {m.group(1) or m.group(2)}.º Suplemento" if m else (", Suplemento" if "Suplemento" in (serie or "") else "")
    return f"{designacao} (Diário d{'o' if jornal == 'Governo' else 'a'} {jornal or 'República'} n.º {dr.strip()}{sup})"


def tipo_ato(designacao: str, publicacao: str | None = None, jornal: str | None = None) -> str:
    """The kind of act, from its cleaned name (design spec §2.6)."""
    d = designacao or ""
    if d.startswith("Decreto de Aprovação da Constituição"):
        return "aprovacao-constituicao"
    if (publicacao and publicacao < "1976-04-25") or jornal == "Governo" or "Diário do Governo" in d:
        return "pre1976"
    for prefixo, tipo in (("Decreto-Lei", "decreto-lei"), ("Lei Orgânica", "lei-organica"), ("Lei Constitucional", "lei-constitucional"),
                          ("Lei ", "lei"), ("Declaração", "retificacao"), ("Rectificação", "retificacao"), ("Retificação", "retificacao"),
                          ("Acórdão do Tribunal Constitucional", "acordao-tc"), ("Acórdão", "acordao-outro"), ("Portaria", "portaria"),
                          ("Resolução", "resolucao"), ("Decreto Legislativo Regional", "dlr")):
        if d.startswith(prefixo):
            return tipo
    return "outro"


def parse(desc: str) -> dict | None:
    href = _HREF.search(desc or "")
    text = html.unescape(re.sub(r"<[^>]+>", "", desc or ""))
    m = _DESC.match(text.strip())
    if not m:
        return None
    c = _CORPO.match(re.sub(r"\s+", " ", m.group("corpo")).strip())
    bruta = (c.group("designacao") if c else m.group("corpo")).strip()
    designacao = _sem_numero(limpar(bruta), c and c.group("jornal"), c and c.group("dr"), c and c.group("serie"))
    return {
        "tipo": TIPOS.get(m.group("verbo").lower(), m.group("verbo").lower()),
        "artigo_do_ato": (m.group("artigo") or "").strip() or None,
        "designacao": designacao,
        "id": slug(designacao),
        "id_antigo": slug(bruta) if slug(bruta) != slug(designacao) else None,
        "jornal": c.group("jornal") if c else None,
        "dr": c.group("dr").strip() if c else None,
        "serie": c.group("serie").strip() if c else None,
        "publicacao": c.group("pub") if c else None,
        "vigor": m.group("vigor"),
        "link": ("https://diariodarepublica.pt" + href.group(1)) if href else None,
    }


_FONTE = re.compile(r"^(?:(?P<artigo>Artigo [^,]+),\s*)?(?P<designacao>.+?)\s+-\s+Diário d[ao] (?P<jornal>República|Governo) n\.º (?P<dr>[^,]+),\s*(?P<serie>.*?)\s+de (?P<pub>\d{4}-\d{2}-\d{2})$")


def parse_fonte(fonte: str) -> dict | None:
    """The source line of a DR note: 'Artigo 54.º, Lei n.º 56/2023  - Diário da República n.º 194/2023, Série I de 2023-10-06'."""
    m = _FONTE.match(re.sub(r"\s+", " ", fonte or "").strip())
    if not m:
        return None
    bruta = m.group("designacao").strip()
    d = _sem_numero(limpar(bruta), m.group("jornal"), m.group("dr"), m.group("serie"))
    return {"tipo": "nota", "artigo_do_ato": m.group("artigo"), "designacao": d, "id": slug(d), "dr": m.group("dr"),
            "id_antigo": slug(bruta) if slug(bruta) != slug(d) else None, "jornal": m.group("jornal"),
            "serie": m.group("serie"), "publicacao": m.group("pub"), "vigor": None, "link": None}


_DESIG = re.compile(r"^(?P<tipo>Lei Orgânica|Lei Constitucional|Lei)\s+n\.º\s+(?P<num>\d+)(?:-(?P<letra>[A-Z]))?/(?P<ano>\d{2,4})$")


def lei_key(designacao: str) -> tuple[str, str, str] | None:
    """'Lei n.º 5-A/2026' -> ('Lei', '5-A', '2026'): the key into AR's Diplomas Aprovados.

    Only acts of the Assembleia da República are keyed. Two-digit years (Lei n.º 6/76)
    become four digits.
    """
    m = _DESIG.match(designacao.strip())
    if not m:
        return None
    ano = m.group("ano")
    if len(ano) == 2:
        ano = ("19" if int(ano) > 30 else "20") + ano
    num = m.group("num") + ("-" + m.group("letra") if m.group("letra") else "")
    return m.group("tipo"), num, ano


def registo(raw_dir: str) -> dict[str, dict]:
    """Every act the corpus names, from data/raw/*.json, with the ids the build gives them:
    {id: {"designacao", "publicacao", "link"}}. The light registry pass that pipeline/assinaturas.py
    needs (it does not build articles)."""
    import glob
    import json
    import os
    out: dict[str, dict] = {}

    def add(info):
        if not info:
            return
        a = out.setdefault(info["id"], {"designacao": info["designacao"], "publicacao": None, "link": None})
        for k in ("publicacao", "link"):
            if info.get(k) and not a[k]:
                a[k] = info[k]
    for path in sorted(glob.glob(os.path.join(raw_dir, "*.json"))):
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
        legis = raw["header"]["ConsolidadaConteudoDetalhe"]["DiplomaLegis"]
        desig = limpar(re.sub(r"<[^>]+>", " ", html.unescape(legis.get("FormattedTitle") or "")).split(" - ")[0].strip())
        if desig:
            add({"id": slug(desig), "designacao": desig, "publicacao": (legis.get("DataPublicacao") or "")[:10] or None,
                 "link": "https://diariodarepublica.pt" + legis["LinkSitemap"] if legis.get("LinkSitemap") else None})
        for m in raw["timeline"]["ModificacoesList"]["List"]:
            d = limpar(m["Title"].split(" - ")[0].strip())
            if d in SEM_NUMERO:
                continue
            add({"id": slug(d), "designacao": d, "publicacao": (m.get("DataPublicacao") or "")[:10] or None,
                 "link": "https://diariodarepublica.pt" + m["LinkSitemap"] if m.get("LinkSitemap") else None})
        for vs in raw["versions"].values():
            for e in vs:
                add(parse(e.get("AssociacaoDescription")))
        for f in raw["now"]["LegConsBase"]["List"]:
            for a in f["AlteracoesList"]["List"]:
                add(parse(a))
            for n in f["Nota"]["List"]:
                add(parse_fonte(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"</a>.*", "", n, flags=re.S)))).strip()))
    return out
