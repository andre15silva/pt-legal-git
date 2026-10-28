"""Check product copy against the PTS style guide (docs/ESTILO.md).

PTS (Português Técnico Simplificado) is our pt-PT adaptation of ASD-STE100.
This tool checks the rules a machine can check: sentence length, banned words,
pt-BR words, gerúndio, compound tenses, semicolons, dash asides, exclamation
marks, explicit "você", and likely passive voice (warning only).

    python -I tools/estilo.py design/screens/*.dc.html design-system/components/bundle.js
    python -I tools/estilo.py --texto "Descubra a história completa de cada artigo!"

Inputs:
- .dc.html / .html: visible text, user-facing attributes (title, aria-label,
  placeholder, label, caption, result, text) and keyed strings in scripts
  (summary, title, caption, label, who, note, result, text, act). Law text passed
  as unkeyed arrays (statute spans, redline segments) is quoted law: not checked.
- .js: string literals of two or more words.
- .md: lines, list items and table cells. Text between <!-- pts:ignorar-inicio -->
  and <!-- pts:ignorar-fim --> is skipped (use it only for examples of bad copy).
- anything else: plain text.

Exit code 1 if any error is found.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import unicodedata

MAX_INSTRUCTION, MAX_DESCRIPTION = 20, 25

BANNED = [
    "é importante salientar", "é importante notar", "importa referir", "vale a pena", "de facto", "na verdade",
    "em suma", "em resumo", "de forma geral", "basicamente", "realmente", "simplesmente",
    "robusto", "robusta", "abrangente", "holístico", "holística", "inovador", "inovadora", "revolucionário",
    "poderoso", "poderosa", "intuitivo", "intuitiva", "sem esforço", "crucial",
    "essencial", "fundamental", "potenciar", "alavancar", "otimizar", "sinergia", "ecossistema", "paradigma",
    "jornada", "mergulhar", "mergulhe", "desbloquear", "desbloqueie", "descubra", "explore", "no coração de",
    "a chave para", "num mundo em que", "não só", "imagine",
]
PT_BR = {
    "tela": "ecrã", "arquivo": "ficheiro", "arquivos": "ficheiros", "usuário": "utilizador", "usuários": "utilizadores",
    "cadastro": "registo", "salvar": "guardar", "baixar": "descarregar", "time": "equipa", "contato": "contacto",
    "fato": "facto", "fatos": "factos", "registro": "registo", "celular": "telemóvel", "planilha": "folha de cálculo",
}
NOT_GERUND = {"quando", "segundo", "segunda", "fundo", "mundo", "profundo", "oriundo", "lindo", "comando", "bando",
              "brando", "nefando", "rotundo", "jucundo", "orlando", "fernando", "rolando", "armando", "bando", "rendo",
              "vendo", "tendo"}  # "vendo/tendo" are flagged by the compound check when used as gerunds
COMPOUND = [r"\btem sido\b", r"\btêm sido\b", r"\bvai ser\b", r"\bvão ser\b", r"\bestá a ser\b", r"\bestão a ser\b",
            r"\bpoderia\b", r"\bpoderiam\b", r"\bdeveria\b", r"\bdeveriam\b", r"\bseria\b", r"\bseriam\b",
            r"\btinha sido\b", r"\bhavia sido\b", r"\btendo sido\b", r"\bsendo que\b"]
PASSIVE = re.compile(r"\b(é|são|foi|foram|será|serão|ser|seja|sejam)\s+(\w+(ado|ida|ido|ada|ados|idos|adas|idas))\b", re.I)
LEGAL_PASSIVE_OK = {"publicado", "publicada", "publicados", "publicadas", "revogado", "revogada", "revogados", "revogadas",
                    "aprovado", "aprovada", "rejeitado", "rejeitada", "promulgado", "promulgada", "retificado", "retificada"}
ABBREV = re.compile(r"\b(n\.º|n\.os|art\.|arts\.|al\.|als\.|p\. ex\.|n\.<sup>os</sup>)", re.I)
IMPERATIVE_HINT = re.compile(r"^(para |se |quando )?[^,]*,?\s*(escolha|compare|veja|leia|pesquise|siga|copie|abra|toque|confirme|use|escreva|guarde|descarregue|volte|mostre|carregue)\b", re.I)

KEYS = "summary|title|caption|label|who|note|result|text|act"  # quoted official titles use the key "oficial"
VISIBLE_ATTRS = ("title", "aria-label", "placeholder", "label", "caption", "result", "text")


def fold(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def extract_html(src: str) -> list[str]:
    out: list[str] = []
    # Quoted official text (act and initiative titles, citations) and code are not our copy.
    src = re.sub(r"<(\w+)[^>]*\bdata-citacao\b[^>]*>.*?</\1>", " ", src, flags=re.S)
    src = re.sub(r"<x-import[^>]*\bdata-citacao\b[^>]*>", " ", src)
    src = re.sub(r"<(pre|code)\b[^>]*>.*?</\1>", " ", src, flags=re.S | re.I)
    for m in re.finditer(r'<script[^>]*data-dc-script[^>]*>(.*?)</script>', src, re.S):
        for k in re.finditer(rf"\b(?:{KEYS})\s*:\s*'((?:[^'\\]|\\.)*)'", m.group(1)):
            out.append(k.group(1).replace("\\'", "'"))
    for attr in VISIBLE_ATTRS:
        for a in re.finditer(rf'\s{attr}="([^"{{}}]*)"', src):
            if re.search(r"[a-zà-ú]{3,}\s+[a-zà-ú]", a.group(1), re.I):
                out.append(html.unescape(a.group(1)))
    body = re.sub(r"<(script|style|helmet|head)[^>]*>.*?</\1>", " ", src, flags=re.S | re.I)
    body = re.sub(r"<br\s*/?>", " ", body, flags=re.I)
    body = re.sub(r"<(sup)>(.*?)</\1>", r"\2", body)
    for block in re.split(r"<(?:p|h[1-6]|li|td|th|a|button|span|strong|caption|label|figcaption|div|dt|dd)\b[^>]*>", body):
        text = html.unescape(re.sub(r"<[^>]+>", " ", block))
        text = re.sub(r"\{\{[^}]*\}\}", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if re.search(r"[A-Za-zÀ-ú]{2,}", text):
            out.append(text)
    return out


def extract_md(src: str) -> list[str]:
    src = re.sub(r"```.*?```", " ", src, flags=re.S)
    src = re.sub(r"<!-- pts:ignorar-inicio -->.*?<!-- pts:ignorar-fim -->", " ", src, flags=re.S)
    src = re.sub(r"`[^`]*`", "X", src)
    src = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", src)
    out = []
    for line in src.splitlines():
        line = line.strip()
        if not line or re.fullmatch(r"\|?[-:| ]+\|?", line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")] if line.startswith("|") else [line]
        out.extend(re.sub(r"^(#+|[-*]|\d+(\.\d+)*\.)\s+", "", c) for c in cells if c)
    return out


def extract_js(src: str) -> list[str]:
    out = []
    for m in re.finditer(r"'((?:[^'\\\n]|\\.){3,})'", src):
        s = m.group(1)
        if " " in s and re.search(r"[a-zà-ú]{2,} [a-zà-ú]{2,}", s, re.I) and not re.search(r"[{};=]|var\(|rd-", s):
            out.append(s)
    return out


def sentences(text: str) -> list[str]:
    protected = ABBREV.sub(lambda m: m.group(0).replace(".", "§"), text)
    parts = re.split(r"(?<=[.?!])\s+(?=[A-ZÀ-Ú«(\d])", protected)
    return [p.replace("§", ".").strip() for p in parts if p.strip()]


def word_count(sentence: str) -> int:
    s = re.sub(r"\([^)]*\)", " X ", sentence)  # a parenthesis counts as one word (rule 3.1)
    s = re.sub(r"«[^»]*»", " X ", s)            # so does a quotation
    return len(re.findall(r"[\wÀ-ú%€º-]+", s))


def check(text: str) -> list[tuple[str, str, str]]:
    """Return [(level, rule, message)]."""
    issues = []
    full = text
    text = re.sub(r"«[^»]*»", "«…»", text)  # quoted words are cited, not used (sentence length still counts them)
    low = fold(text).lower()
    for phrase in BANNED:
        if re.search(rf"(?<![\wÀ-ú]){re.escape(phrase)}(?![\wÀ-ú])", low):
            issues.append(("erro", "8", f"palavra proibida «{phrase}»"))
    for w, good in PT_BR.items():
        if re.search(rf"(?<![\wÀ-ú]){w}(?![\wÀ-ú])", low):
            issues.append(("erro", "1.5", f"português do Brasil «{w}»: use «{good}»"))
    for m in re.finditer(r"\b([a-zà-ú]{3,}(ando|endo|indo))\b", low):
        if m.group(1) not in NOT_GERUND:
            issues.append(("erro", "2.2", f"gerúndio «{m.group(1)}»"))
    for pat in COMPOUND:
        if re.search(pat, low):
            issues.append(("erro", "2.3", f"tempo composto ou perífrase «{re.search(pat, low).group(0)}»"))
    for m in PASSIVE.finditer(text):
        if m.group(2).lower() not in LEGAL_PASSIVE_OK:
            issues.append(("aviso", "2.4", f"voz passiva? «{m.group(0)}»"))
    if ";" in text:
        i = text.index(";")
        issues.append(("erro", "4.1", f"ponto e vírgula: «…{text[max(0, i - 40):i + 20]}…»"))
    for m in re.finditer(r"—", text):
        before = text[max(0, m.start() - 16):m.start()]
        if not re.search(r"(^|\s)(\d+|[a-z]\)|Artigo [\d.º-]+[A-Z]?|art\. [\d.º-]+|(Parte|Livro|Título|Capítulo|Secção|Subsecção|Divisão) [IVXLC]+)\s*$", before):
            issues.append(("erro", "4.2", f"travessão num aparte: «…{text[max(0, m.start() - 40):m.start() + 30]}…»"))
            break
    if "!" in text:
        issues.append(("erro", "4.3", "ponto de exclamação"))
    if re.search(r"\b(você|vocês|v\. ex\.ª)\b", low):
        issues.append(("erro", "5.5", "«você» explícito"))
    for s in sentences(full):
        n = word_count(s)
        limit = MAX_INSTRUCTION if IMPERATIVE_HINT.search(s) else MAX_DESCRIPTION
        if n > limit:
            issues.append(("erro", "3.1", f"{n} palavras (máx. {limit}): «{s[:90]}…»"))
    return issues


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ficheiros", nargs="*")
    ap.add_argument("--texto")
    ap.add_argument("--avisos", action="store_true", help="mostrar também os avisos")
    a = ap.parse_args()
    units: list[tuple[str, str]] = []
    if a.texto:
        units.append(("--texto", a.texto))
    for f in a.ficheiros:
        src = open(f, encoding="utf-8").read()
        chunks = (extract_html(src) if f.endswith(".html") else extract_js(src) if f.endswith(".js")
                  else extract_md(src) if f.endswith(".md") else [src])
        units.extend((f, c) for c in chunks)
    errors = 0
    seen = set()
    for where, text in units:
        for level, rule, msg in check(text):
            if level == "aviso" and not a.avisos:
                continue
            key = (where, rule, msg)
            if key in seen:
                continue
            seen.add(key)
            errors += level == "erro"
            print(f"{where}: {level} [{rule}] {msg}")
    print(f"{errors} erro(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
