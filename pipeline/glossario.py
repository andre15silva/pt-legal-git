"""Glossary: from pipeline/glossario.json to app/data/glossario.json (DESIGN-SPEC §2.12).

An entry is published only when the law's own text supports it:
1. `fonte` resolves: a route to an article on the site (`#/d/<slug>/<artigo>`), or an https URL of a
   named law on diariodarepublica.pt, data.dre.pt, dre.pt or parlamento.pt.
2. `apoio` holds 1 to 3 excerpts of 6 words or more, copied word for word from that provision. For a
   route, each excerpt is in the article's redação in force today (case, spaces and the old spelling
   «acto/ato» are ignored). For a URL, `--verificar <id>` fetches the act once and checks it.
3. For a route, `hash_fonte` is the hash of that redação today. When the law changes, the entry stays
   out until someone checks it again (`--atualizar <id>` writes the new hash after the check).
4. Every number, number word or fraction in `definicao` is also in `apoio`.
5. `definicao` passes tools/estilo.py: at most 3 sentences of at most 25 words.

    python -I pipeline/glossario.py                  # report on app/data
    python -I pipeline/glossario.py --atualizar ID   # after checking ID by hand: write hash_fonte, verificado_em
    python -I pipeline/glossario.py --verificar ID   # URL entries: fetch the act and check the excerpts
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import estilo  # noqa: E402

FONTE = os.path.join(HERE, "glossario.json")
GRUPOS = [("texto", "O texto da lei"), ("tipos", "Tipos de diploma"), ("datas", "As datas"),
          ("parlamento", "No Parlamento"), ("quem", "Quem faz as leis")]
HOSTS = ("diariodarepublica.pt", "data.dre.pt", "dre.pt", "www.parlamento.pt", "parlamento.pt")
NUM_PALAVRAS = set(estilo.NUMEROS) | {"um terço", "dois terços", "quatro quintos", "um quinto", "um décimo"}


def hoje() -> str:
    return os.environ.get("REDACAO_HOJE") or datetime.date.today().isoformat()


def texto_versao(v: dict) -> str:
    return "\n".join("".join(seg for _, seg in linha) for linha in v.get("linhas") or [])


def versao_hoje(art: dict, dia: str | None = None) -> dict | None:
    """The redação in force on `dia` (today): the last one whose vigor (or publication) is not later."""
    dia = dia or hoje()
    vs = art.get("versoes") or []
    atual = None
    for v in vs:
        if (v.get("vigor") or v.get("publicacao") or "") <= dia:
            atual = v
    return atual or (vs[-1] if vs else None)


def hash_texto(t: str) -> str:
    return "sha256:" + hashlib.sha256(t.encode("utf-8")).hexdigest()


def dobrar(s: str) -> str:
    """Fold for excerpt comparison: case, spaces, punctuation spacing, and the pre-1990 spelling."""
    s = unicodedata.normalize("NFC", s).lower()
    s = re.sub(r"(?<=[aeiouáéíóúâêôãõ])[cp](?=[tç])", "", s)  # acto→ato, efectiva→efetiva, adopção→adoção
    s = s.replace("’", "'").replace("–", "—")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:)])", r"\1", s)
    return s.strip()


def contem(texto: str, excerto: str) -> bool:
    return dobrar(excerto) in dobrar(texto)


def numeros(s: str) -> set[str]:
    """Numbers, number words and fractions in a string (rule 4)."""
    low = unicodedata.normalize("NFC", s).lower()
    out = set(re.findall(r"\d+(?:[.,]\d+)?", low))
    for w in NUM_PALAVRAS:
        if re.search(rf"(?<![\wÀ-ú]){re.escape(w)}(?![\wÀ-ú])", low):
            out.add(w)
    return out


def ler_artigo(out: str, rota: str) -> dict | None:
    m = re.fullmatch(r"#/d/([a-z0-9-]+)/([a-z0-9-]+)", rota or "")
    if not m:
        return None
    p = os.path.join(out, "d", m.group(1), m.group(2) + ".json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def verificar_entrada(e: dict, out: str) -> list[str]:
    """Return the reasons why entry `e` cannot be published (empty list: it can)."""
    erros = []
    fonte = e.get("fonte") or {}
    apoio = e.get("apoio") or []
    if not e.get("definicao"):
        erros.append("sem definição")
    if not fonte or not fonte.get("texto"):
        return erros + ["sem fonte"]
    if not (1 <= len(apoio) <= 3):
        erros.append(f"apoio: {len(apoio)} excertos (1 a 3)")
    for x in apoio:
        if len(re.findall(r"[\wÀ-ú]+", x)) < 6:
            erros.append(f"apoio com menos de 6 palavras: «{x}»")
    if fonte.get("rota"):
        art = ler_artigo(out, fonte["rota"])
        if art is None:
            return erros + [f"a fonte {fonte['rota']} não existe"]
        v = versao_hoje(art)
        if v is None:
            return erros + [f"a fonte {fonte['rota']} não tem redação"]
        texto = texto_versao(v)
        for x in apoio:
            if not contem(texto, x):
                erros.append(f"o excerto não está na redação em vigor de {fonte['rota']}: «{x[:60]}…»")
        if e.get("hash_fonte") != hash_texto(texto):
            erros.append(f"{fonte['rota']} mudou depois da verificação (hash_fonte)")
    elif fonte.get("url"):
        m = re.match(r"https://([^/]+)/", fonte["url"])
        if not m or m.group(1) not in HOSTS:
            erros.append(f"fonte fora das fontes oficiais: {fonte['url']}")
        if not (e.get("hash_fonte") or "").startswith("sha256:"):
            erros.append("fonte por URL ainda não verificada (--verificar)")
    else:
        erros.append("a fonte não tem rota nem url")
    defs = e.get("definicao") or []
    texto_def = " ".join(defs)
    frases = [f for d in defs for f in estilo.sentences(d)]
    if len(frases) > 3:
        erros.append(f"definição com {len(frases)} frases (máx. 3)")
    for d in defs:
        for nivel, regra, msg in estilo.check(d):
            if nivel == "erro":
                erros.append(f"estilo [{regra}] {msg}")
    em_apoio = set().union(*(numeros(x) for x in apoio)) if apoio else set()
    for n in sorted(numeros(texto_def) - em_apoio):
        erros.append(f"número «{n}» na definição e não no apoio")
    if not e.get("verificado_em"):
        erros.append("sem verificado_em")
    return erros


def carregar(fonte: str = FONTE) -> dict:
    with open(fonte, encoding="utf-8") as f:
        return json.load(f)


def construir(out: str, estrito: bool, fonte: str = FONTE) -> tuple[dict, list[str], list[dict]]:
    """Build the glossary. Returns (built object, messages, rows for verificacao.json.conteudo)."""
    src = carregar(fonte)
    msgs, retidos, termos = [], [], {}
    for tid, e in sorted(src.get("termos", {}).items()):
        erros = verificar_entrada(e, out)
        if e.get("id") != tid:
            erros.append("id diferente da chave")
        if e.get("grupo") not in dict(GRUPOS):
            erros.append(f"grupo desconhecido «{e.get('grupo')}»")
        if erros:
            for x in erros:
                msgs.append(f"glossário {tid}: {x}")
            retidos.append({"tipo": "glossario", "id": tid, "seccao": None, "motivo": erros[0]})
            continue
        termos[tid] = {k: e[k] for k in ("id", "termo", "formas", "grupo", "definicao", "fonte", "apoio",
                                         "verificado_em", "hash_fonte") if k in e}
    grupos = [{"id": g, "titulo": t, "termos": sorted((k for k, v in termos.items() if v["grupo"] == g),
                                                       key=lambda k: dobrar(termos[k]["termo"]))}
              for g, t in GRUPOS]
    built = {"preparado_em": src.get("preparado_em"), "preparacao": "assistida",
             "aviso": aviso(src.get("preparado_em")), "grupos": [g for g in grupos if g["termos"]], "termos": termos}
    return built, msgs, retidos


def aviso(data: str | None) -> str:
    return (f"Definições preparadas a partir do texto da lei, com ajuda de uma ferramenta automática. "
            f"Data: {data_extenso(data)}. Ainda sem revisão jurídica externa.")


MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
         "novembro", "dezembro"]


def data_extenso(d: str | None) -> str:
    if not d:
        return "desconhecida"
    a, m, dia = d[:10].split("-")
    return f"{int(dia)} de {MESES[int(m) - 1]} de {a}"


def _atualizar(tid: str, out: str) -> int:
    src = carregar()
    e = src["termos"][tid]
    art = ler_artigo(out, e["fonte"].get("rota", ""))
    if art is None:
        print("rota inexistente ou entrada por URL (use --verificar)")
        return 1
    texto = texto_versao(versao_hoje(art))
    for x in e["apoio"]:
        if not contem(texto, x):
            print(f"excerto não encontrado: «{x}»")
            return 1
    print(texto)
    e["hash_fonte"] = hash_texto(texto)
    e["verificado_em"] = hoje()
    with open(FONTE, "w", encoding="utf-8") as f:
        json.dump(src, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{tid}: hash_fonte e verificado_em escritos.")
    return 0


def _verificar_url(tid: str) -> int:
    import dr_client  # tools/
    src = carregar()
    e = src["termos"][tid]
    m = re.match(r"https://diariodarepublica\.pt/dr/detalhe/([^/]+)/([^/?#]+)", e["fonte"].get("url", ""))
    if not m:
        print("só sei verificar URLs diariodarepublica.pt/dr/detalhe/<tipo>/<chave>")
        return 1
    dados = dr_client.act(m.group(1), m.group(2))
    texto = dr_client.plain(json.dumps(dados, ensure_ascii=False))
    for x in e["apoio"]:
        if not contem(texto, x):
            print(f"excerto não encontrado: «{x}»")
            return 1
    e["hash_fonte"] = hash_texto(texto)
    e["verificado_em"] = hoje()
    with open(FONTE, "w", encoding="utf-8") as f:
        json.dump(src, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{tid}: verificado.")
    return 0


def main(argv: list[str]) -> int:
    out = os.path.join(ROOT, "app", "data")
    if len(argv) == 2 and argv[0] == "--atualizar":
        return _atualizar(argv[1], out)
    if len(argv) == 2 and argv[0] == "--verificar":
        return _verificar_url(argv[1])
    built, msgs, _ = construir(out, False)
    for m in msgs:
        print(m)
    print(f"{len(built['termos'])} termos publicados, {len(msgs)} problema(s).")
    return 1 if msgs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
