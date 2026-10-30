"""Content built from committed sources: the glossary, the stories and the share pages (DESIGN-SPEC §1.3).

`build.py` calls `construir(OUT, estrito)` after it writes every data file. It can also run alone on an
existing app/data:

    python -I pipeline/conteudo.py [--parcial] [--estrito]

Two levels (§6.0):
- lenient (the daily build): a failing glossary entry, story section or story is withheld, the reason
  goes to verificacao.json «conteudo», and the messages returned are warnings;
- strict (REDACAO_ESTRITO=1, on push): every failed check is an error and the build fails.

--parcial turns the errors caused by a missing file of the data pipeline (quem.json) into warnings,
to work on a build that does not have it yet.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import glossario  # noqa: E402
import historias  # noqa: E402
import partilha  # noqa: E402


def construir(out: str, estrito: bool, parcial: bool = False) -> list[str]:
    """Build glossario.json, historias/, partilha.json and app/p/. Return the messages.

    Strict: the returned list holds only errors (warnings go to stderr). Lenient: it holds only
    warnings, because whatever failed was withheld."""
    linhas: list[dict] = []
    erros: list[str] = []
    avisos: list[str] = []

    g, msgs, lv = glossario.construir(out, estrito)
    with open(os.path.join(out, "glossario.json"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, separators=(",", ":"))
    (erros if estrito else avisos).extend(msgs)
    linhas += lv

    _, msgs, lv = historias.construir(out, estrito, parcial=parcial)
    for m in msgs:
        (avisos if (m.startswith("aviso:") or not estrito) else erros).append(m)
    linhas += lv

    _, msgs, lv = partilha.construir(out, estrito)
    for m in msgs:
        fatal = estrito and not m.startswith("partilha: imagem com mais") and "MB (máx" not in m
        (erros if fatal else avisos).append(m)
    linhas += lv

    p = os.path.join(out, "verificacao.json")
    verif = {}
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            verif = json.load(f)
    verif["conteudo"] = linhas
    with open(p, "w", encoding="utf-8") as f:
        json.dump(verif, f, ensure_ascii=False, separators=(",", ":"))

    if estrito:
        for a in avisos:
            sys.stderr.write("conteúdo (aviso): " + a + "\n")
        return erros
    return avisos


def main(argv: list[str]) -> int:
    out = os.path.join(os.path.dirname(HERE), "app", "data")
    estrito = "--estrito" in argv or os.environ.get("REDACAO_ESTRITO") == "1"
    msgs = construir(out, estrito, parcial="--parcial" in argv)
    for m in msgs:
        print(("erro: " if estrito else "") + m)
    print(f"conteúdo: {len(msgs)} {'erro(s)' if estrito else 'aviso(s)'}.")
    return 1 if (estrito and msgs) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
