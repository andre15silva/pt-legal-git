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
}
_DESC = re.compile(
    r"^(?P<verbo>\w+)\s+pelo/a\s+(?:(?P<artigo>(?:Artigo|Artigos|n\.º|Anexo)[^\[]*?)\s+do/a\s+)?\[L\](?P<corpo>.*?)\[/L\]"
    r"(?:,\s*em vigor a partir de (?P<vigor>\d{4}-\d{2}-\d{2}))?", re.S)
_CORPO = re.compile(r"^(?P<designacao>.+?)\s+-\s+Diário da República n\.º (?P<dr>[^,]+),\s*(?P<serie>.*?)\s+de (?P<pub>\d{4}-\d{2}-\d{2})\s*$", re.S)
_HREF = re.compile(r'href="(/dr/detalhe/[^"]+)"')


def slug(designacao: str) -> str:
    s = re.sub(r"\bn\.?\s*[º°o]s?\b\.?", " ", designacao.lower())
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def parse(desc: str) -> dict | None:
    href = _HREF.search(desc or "")
    text = html.unescape(re.sub(r"<[^>]+>", "", desc or ""))
    m = _DESC.match(text.strip())
    if not m:
        return None
    c = _CORPO.match(re.sub(r"\s+", " ", m.group("corpo")).strip())
    designacao = (c.group("designacao") if c else m.group("corpo")).strip()
    return {
        "tipo": TIPOS.get(m.group("verbo").lower(), m.group("verbo").lower()),
        "artigo_do_ato": (m.group("artigo") or "").strip() or None,
        "designacao": designacao,
        "id": slug(designacao),
        "dr": c.group("dr").strip() if c else None,
        "serie": c.group("serie").strip() if c else None,
        "publicacao": c.group("pub") if c else None,
        "vigor": m.group("vigor"),
        "link": ("https://diariodarepublica.pt" + href.group(1)) if href else None,
    }


_FONTE = re.compile(r"^(?:(?P<artigo>Artigo [^,]+),\s*)?(?P<designacao>.+?)\s+-\s+Diário da República n\.º (?P<dr>[^,]+),\s*(?P<serie>.*?)\s+de (?P<pub>\d{4}-\d{2}-\d{2})$")


def parse_fonte(fonte: str) -> dict | None:
    """The source line of a DR note: 'Artigo 54.º, Lei n.º 56/2023  - Diário da República n.º 194/2023, Série I de 2023-10-06'."""
    m = _FONTE.match(re.sub(r"\s+", " ", fonte or "").strip())
    if not m:
        return None
    d = m.group("designacao").strip()
    return {"tipo": "nota", "artigo_do_ato": m.group("artigo"), "designacao": d, "id": slug(d), "dr": m.group("dr"),
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
