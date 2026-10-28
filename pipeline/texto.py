"""Text handling for article versions: normalisation, tokens, word-level origin.

The origin ("origem do texto", git blame) of each token is the index of the version
that wrote it. We diff consecutive versions of the same article lineage at token level
and carry each unchanged token's origin forward. Tokens that a version adds take that
version's index.
"""
from __future__ import annotations

import difflib
import html
import re

_NUM = re.compile(r"^(\d+(?:\.\d+)*(?:-[A-Z])?)\s+[-–—]\s+")
_TOKEN = re.compile(r"\n|\s+|\w+|[^\w\s]", re.UNICODE)


def normalise(texto: str | None) -> str:
    """DR fragment text -> lines joined by '\\n', one número or alínea per line.

    The DR mixes '\\r', '\\r\\n', HTML tags and trailing spaces. Número dashes ("1 - ",
    "1 – ") become "1 — ", the form of the law. Pre-1990 spelling is kept as published.
    """
    t = html.unescape(texto or "")
    # The DR's HTML has a few link tags with bytes replaced by U+FFFD: "</a>" became "</`\ufffd"
    # and the '">' that closes "<a … title=…" became "!\ufffd". Repair those two forms so tag
    # stripping does not swallow the text of the link. Any other U+FFFD stays visible.
    t = re.sub(r"</[^>\s\ufffd]?\ufffd", "</a>", t)
    t = re.sub(r"(<a\s[^>\ufffd]*?)[!\"]?\ufffd", r'\1">', t)
    t = re.sub(r"<br\s*/?>|</p>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    lines = []
    for line in t.split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(_NUM.sub(lambda m: m.group(1) + " — ", line))
    return "\n".join(lines)


def tokens(texto: str) -> list[str]:
    return _TOKEN.findall(texto)


def blame(versions: list[str]) -> list[list[tuple[int, str]]]:
    """For each version text, its spans [(origin_version_index, text)], merged by origin."""
    out: list[list[tuple[int, str]]] = []
    prev_tok: list[str] = []
    prev_org: list[int] = []
    for i, texto in enumerate(versions):
        tok = tokens(texto)
        org = [i] * len(tok)
        if i > 0:
            for op, a1, a2, b1, b2 in opcodes(prev_tok, tok):
                if op == "equal":
                    org[b1:b2] = prev_org[a1:a2]
        # A space between two words takes the older of their origins, so a changed word's
        # underline does not run into the space next to it.
        for j, t in enumerate(tok):
            if 0 < j < len(tok) - 1 and t.isspace() and t != "\n":
                org[j] = min(org[j - 1], org[j + 1])
        out.append(_merge(tok, org))
        prev_tok, prev_org = tok, org
    return out


def opcodes(a: list[str], b: list[str]) -> list[tuple[str, int, int, int, int]]:
    """difflib opcodes on tokens, with one rewritten phrase kept as one change.

    The same rule as the comparison view in app/app.js: an unchanged run of spaces between
    two changes joins them. A short unchanged run between two replacements also joins them
    when it is not longer than either replacement (the diff-match-patch semantic rule). So
    "sua transformação numa sociedade sem classes" -> "construção de uma sociedade livre,
    justa e solidária" is one change, and "sociedade" takes the origin of the new text.
    Unchanged runs with a line break stay.
    """
    ops = [list(o) for o in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()]

    def size(o, side):
        return sum(len(t) for t in (a[o[1]:o[2]] if side == "a" else b[o[3]:o[4]]))

    def join(semantic):
        i, joined = 1, False
        while i < len(ops) - 1:
            p, e, n = ops[i - 1], ops[i], ops[i + 1]
            run = "".join(a[e[1]:e[2]])
            if e[0] == "equal" and p[0] != "equal" and n[0] != "equal" and "\n" not in run:
                chars = len(run.strip())
                if chars == 0 or (semantic and p[0] == n[0] == "replace"
                                  and chars <= max(size(p, "a"), size(p, "b"))
                                  and chars <= max(size(n, "a"), size(n, "b"))):
                    ops[i - 1:i + 2] = [["replace", p[1], n[2], p[3], n[4]]]
                    joined = True
                    continue
            i += 1
        return joined

    # Spaces first, so each side of a short run is measured as the whole phrase.
    join(False)
    while join(True):
        pass
    return [tuple(o) for o in ops]


def _merge(tok: list[str], org: list[int]) -> list[tuple[int, str]]:
    spans: list[tuple[int, str]] = []
    for t, o in zip(tok, org):
        if spans and spans[-1][0] == o:
            spans[-1] = (o, spans[-1][1] + t)
        else:
            spans.append((o, t))
    return spans


def lines_of(spans: list[tuple[int, str]]) -> list[list[tuple[int, str]]]:
    """Split spans at '\\n' into one list of spans per line."""
    lines: list[list[tuple[int, str]]] = [[]]
    for o, text in spans:
        parts = text.split("\n")
        for k, part in enumerate(parts):
            if k:
                lines.append([])
            if part:
                lines[-1].append((o, part))
    return [ln for ln in lines if ln]
