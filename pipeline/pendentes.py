"""Bills now in Parliament that would change a diploma in the corpus.

From the AR open data of the current legislatura: every Projeto or Proposta de Lei (and
Projeto de Revisão Constitucional) that is not yet law and not finished (rejected on the
generalidade vote, withdrawn, not admitted, or replaced by a text that became law).

- Which diploma: the bill's title matches the corpus entry's "iniciativas" pattern
  ("Altera o Código Penal", "Código do IRS", "Lei n.º 7/2009").
- Which articles: from the bill's own text. Each article of the bill that amends the diploma
  says so in its first sentence: "São alterados os artigos 170.º, 178.º e 193.º do Código
  Penal (...), que passam a ter a seguinte redação:". We read the article numbers from that
  sentence. The texts are PDF (sometimes DOCX) files on app.parlamento.pt; `fetch()` keeps
  them in data/parlamento/textos/ and `pdftotext` (poppler) reads them. Without the text, the
  bill is listed on the diploma only.

    python -I pipeline/pendentes.py            # download the texts of the matching bills
"""
from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
from parlamento import normalise  # noqa: E402
import passagem  # noqa: E402

PDIR = os.path.join(ROOT, "data", "parlamento")
TEXTOS = os.path.join(PDIR, "textos")
LEGISLATURA = "XVII"
TIPOS = {"Projeto de Lei", "Proposta de Lei", "Projeto de Revisão Constitucional"}
UA = {"User-Agent": "redacao-phase0/0.1 (+https://github.com/andre15silva/pt-legal-git)"}

# Where a bill stands, from its events and votes. The first that applies wins.
FASES = [
    ("promulgacao", "Aprovada em votação final global. Falta a promulgação e a publicação."),
    ("especialidade", "Aprovada na generalidade. Em discussão na especialidade."),
    ("sem_votacao", "Voltou à comissão sem votação na generalidade."),
    ("discussao_publica", "Em discussão pública."),
    ("entrada", "Deu entrada. Ainda não foi votada na generalidade."),
]
_FIM = ("Retirada da iniciativa", "Não admissão", "Lei (Publicação DR)", "Caducada", "Caducidade")


def _gen(i, fase: str):
    return [v for v in i.votes if v.phase == fase]


def fase(i) -> tuple[str, str] | None:
    """(code, date) of where the bill stands, or None when it is finished."""
    if i.published_dr or any(p.startswith(_FIM) for _, p in i.events):
        return None
    gen = [v for v in _gen(i, "Votação na generalidade") if not passagem._TEXTO_COMISSAO.match(v.description or "")]
    if gen and gen[-1].result == "Rejeitado":
        return None
    final = _gen(i, "Votação final global")
    if final and final[-1].result == "Rejeitado":
        return None
    if final and final[-1].result == "Aprovado":
        return "promulgacao", final[-1].date
    if gen and gen[-1].result == "Aprovado":
        return "especialidade", gen[-1].date
    sem = [d for d, p in i.events if p.startswith("Requerimento Baixa Comissão sem Votação")]
    if sem:
        return "sem_votacao", sem[-1]
    sep = [d for d, p in i.events if p == "Publicação em Separata"]
    if sep:
        return "discussao_publica", sep[-1]
    return "entrada", i.events[0][0] if i.events else ""


def absorvidas(inis) -> set[tuple[str, str, str]]:
    """Bills named in a vote of a bill that became law: a committee text replaced them."""
    out = set()
    for i in inis:
        if i.published_dr:
            for v in i.votes:
                out |= passagem.citadas(v.description)
    return out


# ---- The bill's text ---------------------------------------------------------------------------
def _caminho(iid: str) -> str:
    return os.path.join(TEXTOS, iid + ".txt")


def fetch(raw: dict) -> str | None:
    """The bill's text as plain text, from data/parlamento/textos/ or downloaded."""
    iid = str(raw["IniId"])
    path = _caminho(iid)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    url = (raw.get("IniLinkTexto") or "").replace("http://", "https://", 1)
    if not url:
        return None
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    if data[:2] == b"PK":  # DOCX
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read("word/document.xml").decode("utf-8")
        txt = re.sub(r"<[^>]+>", "", re.sub(r"</w:p>", "\n", xml))
    elif data[:4] == b"%PDF":
        txt = subprocess.run(["pdftotext", "-layout", "-", "-"], input=data, capture_output=True, check=True).stdout.decode("utf-8", "replace")
    else:
        return None
    os.makedirs(TEXTOS, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(txt)
    return txt


def texto(iid: str) -> str | None:
    path = _caminho(iid)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return fh.read()


_ARTIGO = re.compile(r"^\s*Artigo\s+(\d+)\s*\.?\s*[º°o]\s*(?:-\s*([A-Z]{1,2}))?\s*$")
_VERBO = re.compile(r"alterad|aditad|revogad|passa(?:m)? a ter|redação|altera(?:ção|ções)?\b|adita|revoga", re.I)
_LISTA = re.compile(r"\b[Aa]rtigos?\s+((?:\d+\s*\.?\s*[º°o]?(?:\s*-?\s*[A-Z]{1,2}\b)?(?:\s*,\s*|\s+e\s+|\s+)?)+)")
_NUM = re.compile(r"(\d+)\s*\.?\s*[º°o]?(?:\s*-?\s*([A-Z]{1,2})\b)?")  # "15.º-J", "15.º J", "15.ºJ"
# The start of any diploma's name: the article list belongs to the first one after it.
_NOME = re.compile(r"\b(?:C[óo]digo|Lei|Decreto|Regime|Estatuto|Constituição|Regulamento|NRAU|Portaria|Lista)\b")


def _aid(num: str, letra: str | None) -> str:
    return "artigo-" + num + ("-" + letra.lower() if letra else "")


def _blocos(txt: str) -> list[tuple[str, str]]:
    """The bill's own articles: [(heading, body)]. They are numbered 1, 2, 3...; an "Artigo"
    line with another number, or inside quotes, is an article of the amended diploma quoted as
    its new wording, and stays in the body of the bill's article that quotes it."""
    out, cur, n, decreta, aspas = [], None, 0, False, None  # aspas: lines since a quote opened
    for l in txt.replace("\r", "").split("\n"):
        m = _ARTIGO.match(l)
        # An authorisation bill has the draft decree-law after it ("o Governo decreta o
        # seguinte:"), numbered from 1 again. Inside quotes (“…”) it is the new wording.
        if aspas is None and m and not m.group(2) and (int(m.group(1)) == n + 1 or (decreta and m.group(1) == "1")):
            n, decreta = int(m.group(1)), False
            cur = ["", []]
            out.append(cur)
            continue
        if re.search(r"(?:decreta|aprova)\s+o\s+seguinte\s*:", l):
            decreta = True
        abre, fecha = l.count("“"), l.count("”")
        if aspas is None and abre > fecha:
            aspas = 0
        elif aspas is not None:
            aspas = None if fecha > abre or aspas > 400 else aspas + 1  # a quote never closed does not hide the rest
        if cur is not None:
            if not cur[0] and not any(x.strip() for x in cur[1]) and l.strip():
                cur[0] = l.strip()
            else:
                cur[1].append(l)
    return [(h, re.sub(r"\s+", " ", " ".join(b)).strip()) for h, b in out]


def _operativa(corpo: str) -> str:
    """The first sentence of an article of the bill: up to the colon that opens the new wording."""
    m = re.search(r":\s*(?:[“\"«]|$)", corpo)
    return corpo[:m.start()] if m and m.start() < 1500 else corpo[:1500]


def _e_nosso(frase: str, pos: int, padrao: re.Pattern) -> bool:
    """The diploma name that starts at pos is the one padrao matches ("da Constituição": a few
    characters before)."""
    m = padrao.search(frase, max(0, pos - 4))
    return bool(m) and m.start() <= pos + 1


def _numeros(frase: str, padrao: re.Pattern) -> list[str]:
    """Article ids in a sentence that belong to the diploma: "os artigos 170.º e 178.º do Código
    Penal" (the first name after the list) or "É aditado ao Código Penal o artigo 170.º-A" (no
    name after the list: the last one before it)."""
    out = []
    for m in _LISTA.finditer(frase):
        depois = _NOME.search(frase, m.end())
        if depois and depois.start() - m.end() < 120:
            ok = _e_nosso(frase, depois.start(), padrao)
        else:
            antes = [x for x in _NOME.finditer(frase, 0, m.start())]
            ok = bool(antes) and _e_nosso(frase, antes[-1].start(), padrao)
        if not ok:
            continue
        for n in _NUM.finditer(m.group(1)):
            aid = _aid(n.group(1), n.group(2))
            if aid not in out:
                out.append(aid)
    return out


def artigos(txt: str, padrao: re.Pattern, revisao: bool = False) -> list[str]:
    """The articles of one diploma that a bill's text amends, adds or revokes.

    revisao: a Projeto de Revisão Constitucional is the list of the articles it rewrites, each
    with its new wording."""
    if revisao:
        out = []
        for l in txt.split("\n"):
            m = _ARTIGO.match(l)
            if m and _aid(m.group(1), m.group(2)) not in out:
                out.append(_aid(m.group(1), m.group(2)))
        return out
    out = []
    for cab, corpo in _blocos(txt):
        frases = [_operativa(corpo)]
        if re.search(r"revoga", cab, re.I):  # "São revogados: a) o artigo 5.º do Código ...; b) ..."
            frases = re.split(r";\s*|\.\s+(?=[a-z]\))", corpo[:4000])
        for f in frases:
            if _VERBO.search(f) and padrao.search(f):
                for a in _numeros(f, padrao):
                    if a not in out:
                        out.append(a)
    return out


def no_intervalo(aid: str, intervalo: dict) -> bool:
    """'artigo-1083-a' is in {"de": 1022, "ate": 1113}."""
    m = re.match(r"artigo-(\d+)", aid)
    return bool(m) and intervalo["de"] <= int(m.group(1)) <= intervalo["ate"]


# ---- For the build -------------------------------------------------------------------------------
def pendentes(corpus: list[dict], ids_por_diploma: dict[str, set[str]], comps: dict) -> dict:
    """{"iniciativas": {id: {...}}, "por_diploma": {slug: [id, ...]}} for app/data/pendentes.json."""
    path = os.path.join(PDIR, f"Iniciativas{LEGISLATURA}_json.txt")
    if not os.path.exists(path):
        return {"legislatura": LEGISLATURA, "iniciativas": {}, "por_diploma": {}}
    with open(path, encoding="utf-8-sig") as fh:
        raws = json.load(fh)
    todas = [(r, normalise(r)) for r in raws]
    feitas = absorvidas([i for _, i in todas])
    padroes = {c["slug"]: re.compile(c["iniciativas"]) for c in corpus if c.get("iniciativas")}
    por_slug = {c["slug"]: c for c in corpus}
    out, por = {}, {}
    comp = comps.get(LEGISLATURA)
    for raw, i in todas:
        if i.kind not in TIPOS or (i.kind, str(i.number), i.legislature) in feitas:
            continue
        f = fase(i)
        if not f:
            continue
        alvo = i.kind + " " + i.title
        slugs = [s for s, p in padroes.items() if p.search(alvo)]
        if not slugs:
            continue
        txt = texto(str(i.id))
        diplomas = {}
        for s in slugs:
            arts = artigos(txt, padroes[s], i.kind == "Projeto de Revisão Constitucional") if txt else []
            cfg = por_slug[s]
            if cfg.get("artigos"):  # only part of a code: the bill must touch that part
                arts = [a for a in arts if no_intervalo(a, cfg["artigos"])]
                if not (arts if txt else re.search(cfg.get("iniciativas_titulo", "$^"), i.title)):
                    continue
            arts.sort(key=lambda a: (int(re.match(r"artigo-(\d+)", a).group(1)), a))
            diplomas[s] = {"artigos": [a for a in arts if a in ids_por_diploma.get(s, ())],
                           "novos": [a for a in arts if a not in ids_por_diploma.get(s, ())]}
            por.setdefault(s, []).append(str(i.id))
        if not diplomas:
            continue
        gen = [v for v in _gen(i, "Votação na generalidade")]
        out[str(i.id)] = {
            "id": str(i.id), "designacao": f"{i.kind} n.º {i.number}/{i.legislature}", "titulo": i.title,
            "autores": passagem.autores(raw), "fase": f[0], "fase_texto": dict(FASES)[f[0]], "fase_data": f[1],
            "entrada": i.events[0][0] if i.events else None, "eventos": i.events,
            "generalidade": passagem._voto(gen[-1], comp) if gen else None, "ordem_grupos": comp.ordem if comp else [],
            "texto_lido": txt is not None, "diplomas": diplomas,
            "link": f"https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID={i.id}",
            "texto": raw.get("IniLinkTexto")}
    for s in por:
        por[s].sort(key=lambda k: (out[k]["fase_data"] or "", k), reverse=True)
    return {"legislatura": LEGISLATURA, "iniciativas": out, "por_diploma": por}


def main() -> int:
    import fetch
    corpus = fetch.carregar_corpus()["diplomas"]
    padroes = [re.compile(c["iniciativas"]) for c in corpus if c.get("iniciativas")]
    with open(os.path.join(PDIR, f"Iniciativas{LEGISLATURA}_json.txt"), encoding="utf-8-sig") as fh:
        raws = json.load(fh)
    n = 0
    for raw in raws:
        i = normalise(raw)
        if i.kind not in TIPOS or not fase(i) or not any(p.search(i.kind + " " + i.title) for p in padroes):
            continue
        if not os.path.exists(_caminho(str(i.id))):
            try:
                fetch(raw)
                time.sleep(0.5)
            except Exception as e:  # keep going: the bill is listed without its articles
                sys.stderr.write(f"{i.kind} {i.number}: {e}\n")
                continue
        n += 1
    print(f"{n} textos em {TEXTOS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
