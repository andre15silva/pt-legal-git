"""Normalise the Assembleia da República open-data "Iniciativas" dataset.

Reads one per-legislature JSON file (e.g. IniciativasXVII_json.txt from
https://www.parlamento.pt/Cidadania/Paginas/DadosAbertos.aspx) and emits one
JSON object per initiative with its process timeline, its votes parsed into
per-group positions, and the date it was published in the Diário da República.

    python -I tools/parlamento.py stats  IniciativasXVII_json.txt
    python -I tools/parlamento.py export IniciativasXVII_json.txt > iniciativas.jsonl
    python -I tools/parlamento.py show   IniciativasXVII_json.txt "Proposta de Lei" 16
"""
from __future__ import annotations

import html
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field

# Event names (IniEventos[].Fase) that mark the end of the legislative path.
PUBLICATION_PHASES = {"Lei (Publicação DR)", "Resolução da AR (Publicação DR)"}

# "A Favor: <I>PSD</I>, <I> CH</I><BR>Contra:<I>PCP</I><BR>Abstenção:<I>PS</I>"
_SECTION = re.compile(r"(A Favor|Contra|Absten[çc][ãa]o)\s*:\s*(.*?)(?=(A Favor|Contra|Absten[çc][ãa]o)\s*:|$)", re.S)
_SENTIDO = {"A Favor": "favor", "Contra": "contra"}


@dataclass
class Vote:
    date: str
    phase: str
    result: str | None
    unanimous: bool | None
    positions: dict[str, str] = field(default_factory=dict)  # group/deputy -> favor|contra|abstencao
    absent: list[str] = field(default_factory=list)
    description: str | None = None


@dataclass
class Initiative:
    id: int
    legislature: str
    kind: str
    number: str
    title: str
    authors: list[str]
    events: list[tuple[str, str]]
    votes: list[Vote]
    published_dr: str | None
    joint_with: list[str]
    # Diplomas Aprovados id from the "Lei (Publicação DR)" event: the exact link to the law.
    approved_text_id: str | None = None


def parse_positions(detalhe: str | None) -> dict[str, str]:
    """Turn the HTML 'detalhe' of a vote into {group: sentido}.

    Individual deputies appear as e.g. "2-PS" or "Nome (PS)"; they are kept verbatim
    so a breakaway vote is never folded into the group's position.
    """
    if not detalhe:
        return {}
    text = re.sub(r"<br\s*/?>", "\n", detalhe, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    out: dict[str, str] = {}
    for m in _SECTION.finditer(text):
        sentido = _SENTIDO.get(m.group(1), "abstencao")
        for who in m.group(2).replace("\n", ",").split(","):
            who = who.strip()
            if who:
                out[who] = sentido
    return out


def _authors(ini: dict) -> list[str]:
    names: list[str] = []
    for gp in ini.get("IniAutorGruposParlamentares") or []:
        names.append(gp.get("GP") or gp.get("gp") or "")
    other = ini.get("IniAutorOutros") or {}
    if other.get("nome"):
        names.append(other["nome"])
    if not names:
        for dep in ini.get("IniAutorDeputados") or []:
            names.append(f'{dep.get("nome")} ({dep.get("GP")})')
    return [n for n in names if n]


def normalise(ini: dict) -> Initiative:
    events, votes, joint = [], [], set()
    published = approved = None
    for e in ini.get("IniEventos") or []:
        date, phase = (e.get("DataFase") or "")[:10], e.get("Fase") or ""
        events.append((date, phase))
        if phase in PUBLICATION_PHASES and not published:
            published = date
            approved = e.get("TextosAprovados") or None
            if isinstance(approved, list):
                approved = approved[0] if approved else None
        for c in e.get("IniciativasConjuntas") or []:
            joint.add(f'{c.get("tipo")} {c.get("nr")}/{c.get("leg") or ini.get("IniLeg")}')
        for v in e.get("Votacao") or []:
            absent = v.get("ausencias") or []
            if isinstance(absent, str):
                absent = [a.strip() for a in absent.split(",") if a.strip()]
            votes.append(Vote(
                date=(v.get("data") or date)[:10], phase=phase, result=v.get("resultado"),
                unanimous={"unanime": True}.get(str(v.get("unanime")).lower(), None),
                positions=parse_positions(v.get("detalhe")), absent=list(absent),
                description=v.get("descricao"),
            ))
    events.sort()
    return Initiative(
        id=int(ini["IniId"]), legislature=ini.get("IniLeg") or "", kind=ini.get("IniDescTipo") or "",
        number=str(ini.get("IniNr")), title=(ini.get("IniTitulo") or "").strip(), authors=_authors(ini),
        events=events, votes=votes, published_dr=published, joint_with=sorted(joint),
        approved_text_id=str(approved) if approved else None,
    )


def load(path: str) -> list[Initiative]:
    with open(path, encoding="utf-8-sig") as fh:
        return [normalise(x) for x in json.load(fh)]


def stats(inis: list[Initiative]) -> dict:
    kinds = Counter(i.kind for i in inis)
    laws = [i for i in inis if any(p == "Lei (Publicação DR)" for _, p in i.events)]
    voted = [v for i in inis for v in i.votes]
    parsed = [v for v in voted if v.positions or v.unanimous]
    return {
        "initiatives": len(inis),
        "by_kind": dict(kinds.most_common()),
        "published_as_lei": len(laws),
        "published_as_lei_by_kind": dict(Counter(i.kind for i in laws).most_common()),
        "votes": len(voted),
        "votes_with_parsed_positions_or_unanimous": len(parsed),
    }


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    cmd, path = argv[1], argv[2]
    inis = load(path)
    if cmd == "stats":
        print(json.dumps(stats(inis), ensure_ascii=False, indent=2))
    elif cmd == "export":
        for i in inis:
            print(json.dumps(asdict(i), ensure_ascii=False))
    elif cmd == "show":
        kind, nr = argv[3], argv[4]
        for i in inis:
            if i.kind == kind and i.number == nr:
                print(json.dumps(asdict(i), ensure_ascii=False, indent=2))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
