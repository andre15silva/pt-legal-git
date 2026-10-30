"""Read the signature block of every act in the Diário da República (R-10).

    python -I pipeline/assinaturas.py                 # fetch the acts in neither the seed nor the cache
    python -I pipeline/assinaturas.py --ato lei-13-2019   # one act: fetch (cached) and print the entry
    python -I pipeline/assinaturas.py --semente       # rewrite pipeline/assinaturas.json from seed ∪ cache
    python -I pipeline/assinaturas.py --reler         # read every act again (after a change to the parser;
                                                      # responses come from data/cache/ when they are there)

The block at the end of an act names who approved, promulgated and countersigned it:

    Visto e aprovado em Conselho de Ministros de 16 de Julho de 2003. - José Manuel Durão Barroso - …
    Promulgado em 6 de Agosto de 2003.
    Publique-se.
    O Presidente da República, JORGE SAMPAIO.
    Referendado em 8 de Agosto de 2003.
    O Primeiro-Ministro, José Manuel Durão Barroso.

Only the extracted fields are stored, never the act's text: pipeline/assinaturas.json (the seed,
committed) and data/assinaturas.json (the cache the daily job adds to; data/cache/ is pruned after
7 days, this file is not). Same shape for both (design spec §2.4). The build merges them: for one
id, the entry with the newer obtido_em wins. Responses go through fetch.cached, so a rerun
fetches nothing it already has. A network error is recorded in the entry ("erro") and retried on
the next run; this script exits 0 on network errors, so the daily build never fails because of it.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import atos  # noqa: E402

SEMENTE = os.path.join(ROOT, "pipeline", "assinaturas.json")
CACHE = os.path.join(ROOT, "data", "assinaturas.json")
VERSAO = 1

MESES = {"janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
         "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}
DATA = r"(\d{1,2})\s*\.?\s*[º°]?\s*de\s+([A-Za-zçÇ]+)\s+(?:de\s+)?(\d{4})"
NOME = r"([^\n.]+?(?:\.\s?[A-Z]\.?[^\n.]*?)*?)"  # a name may hold initials: "Maria da Assunção A. Esteves"
FIM_NOME = r"(?:(?<!\s[A-Z])\s*\.(?=\s|$|[A-Z])|(?=\s+(?:Referendad|Publique|Promulgad)))"  # not after an initial («A. Esteves»)  # the period is missing in a few texts

_CM = re.compile(r"(?:Visto e )?aprovad[oa] (?:em|no) Conselho (?:de )?Ministros?(?:\s*,?\s+(?:(?:de|em|a)\s+)?" + DATA + r")?", re.I)
_AR = re.compile(r"Aprovad[ao] em " + DATA, re.I)
_PRES_AR = re.compile(r"\b[OA] Presidente da Assembleia da República,\s*" + NOME + FIM_NOME)
LOCAL = r"(?:[A-ZÁÉÍÓÚ][^\d,.\n]{1,40}?,?\s+(?:em|a)\s+)?"  # «Promulgado em Castanheira de Pêra em 17 de agosto de 2017»
_PROMULG = re.compile(r"Promulgad[ao] (?:em|a) " + LOCAL + DATA, re.I)
_PR = re.compile(r"\bO Presidente da República( Interino)?,\s*" + NOME + FIM_NOME)
_REFERENDA = re.compile(r"Referendad[ao] (?:em|a) " + LOCAL + DATA, re.I)
_PM = re.compile(r"\b(O|A|Pel[oa]) Primeir[oa]-Ministr[oa],\s*(em exerc[íi]cio,\s*)?" + NOME + r"\s*(?:,\s*[^.\n]*Ministr[oa][^.\n]*)?\.(?=\s|$|[A-Z])")
_LISBOA = re.compile(r"Lisboa,\s+" + DATA)
_PACOS = re.compile(r"(?:Paços do Governo da República|Visto e aprovado em Conselho de Ministros)[^.]*\.\s*-\s*(.+?)\.(?:\s|$)")
_AUTORIZACAO = re.compile(r"autoriza[çc][ãa]o legislativa concedida pel[ao]s?\s+(?:(?:artigo|n\.º|alínea)[^,]*?d[ao]s?\s+)*(Lei n\.º\s*\d+(?:-[A-Z])?/\d+)", re.I)
# An own article whose heading is about the passage from the old law to the new: «Norma
# transitória», «Disposições transitórias», and «Aplicação no tempo» (Lei Orgânica n.º 1/2026, art. 7.º).
_ARTIGO = re.compile(r"(?:^|\n)\s*(?:ARTIGO|Artigo|Art\.)\s+(\d+\.?\s*º(?:-[A-Z]+)?)\s*\n?\s*\(?([^\n«»()]{0,120}?(?:transit[óo]ri[ao]s?|[Aa]plica[çc][ãa]o (?:da lei )?no tempo)[^\n«»()]{0,60}?)\)?\s*(?:\n|$)")


def data_pt(dia: str, mes: str, ano: str) -> str | None:
    import unicodedata
    m = "".join(c for c in unicodedata.normalize("NFKD", mes.lower()) if not unicodedata.combining(c))
    n = MESES.get(m) or MESES.get(mes.lower())
    try:
        return dt.date(int(ano), n, int(dia)).isoformat() if n else None
    except ValueError:
        return None


def _data(m) -> str | None:
    return data_pt(*m.group(1, 2, 3)) if m and m.group(1) else None


def texto_simples(texto: str | None) -> str:
    t = html.unescape(texto or "").replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    t = re.sub(r"<br\s*/?>|</p>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"[ \t]+", " ", t)


def _proprio(texto: str) -> str:
    """The act's own text: what is not inside a quoted amendment («…»)."""
    out, nivel = [], 0
    for c in texto:
        if c == "«":
            nivel += 1
        elif c == "»":
            nivel = max(0, nivel - 1)
        elif nivel == 0:
            out.append(c)
    return "".join(out)


def transitorias(texto: str) -> list[dict]:
    """The act's own articles whose heading says transitória (finding 17), before its block."""
    corpo = _proprio(texto)
    fim = re.search(r"(?:Visto e )?aprovad[oa] (?:em|no) Conselho (?:de )?Ministros?|Aprovad[ao] em \d|Promulgad[ao] em", corpo, re.I)
    corpo = corpo[:fim.start()] if fim else corpo
    out = []
    for m in _ARTIGO.finditer(corpo):
        art = re.sub(r"\s+", "", m.group(1)).replace("º", ".º").replace("..º", ".º")
        ep = re.sub(r"\s+", " ", m.group(2)).strip()
        if not any(x["artigo"] == art for x in out):
            out.append({"artigo": art, "epigrafe": ep[0].upper() + ep[1:]})
    return out


def ler_bloco(texto: str, tipo_ato: str, publicacao: str | None) -> dict:
    """The fields of the first signature block of an act's text (design spec §2.4).

    The whole text is searched: a republication annex follows the block and has a block of its
    own (the original act's), so the first one is taken. Dates such as «16 de Julho de 2003» and
    «1.º de Agosto de 1990». A date out of order is marked suspeito and not used (finding 19).
    """
    t = texto_simples(texto)
    r = {"bloco": "sem_bloco", "d_cm": None, "cm_signatarios": [], "d_aprovacao_ar": None, "pres_ar": None, "d_promulgacao": None,
         "presidente_nome": None, "presidente_interino": False, "d_referenda": None, "referenda_nome": None, "referenda_por_outro": False,
         "d_decisao": None, "autorizacao": None, "signatarios_pre1976": [], "transitorias": [], "estado": {}}
    pre = (publicacao or "9999") < "1976-04-25" or tipo_ato == "pre1976"
    acordao = tipo_ato in ("acordao-tc", "acordao-outro")
    if acordao:
        ds = [_data(m) for m in _LISBOA.finditer(t)]
        ds = [d for d in ds if d]
        r["d_decisao"] = ds[-1] if ds else None
        r["bloco"] = "acordao"
        r["estado"] = {"d_decisao": "ok" if r["d_decisao"] else "ausente"}
        return r
    p = _PROMULG.search(t)
    # The block: from the CM or AR approval before the first promulgation to the countersignature.
    ini = max(0, (p.start() if p else len(t)) - 4000)
    zona = t[ini:(p.end() + 1500) if p else len(t)]
    cm = None
    antes = zona[:p.start() - ini] if p else zona
    for m in _CM.finditer(antes):
        cm = m  # the last approval line before the promulgation (a republished act's block comes after it)
    if cm:
        r["d_cm"] = _data(cm)
        resto = antes[cm.end():] if p else zona[cm.end():]
        resto = resto[:resto.find("Promulgad")] if "Promulgad" in resto else resto[:2000]
        assin = re.sub(r"^\s*\.?\s*-?\s*", "", resto)
        r["cm_signatarios"] = [re.sub(r"\s+", " ", x).strip(" .") for x in re.split(r"\s+-\s*|\s*-\s+", assin) if x.strip(" .\n")][:40]
    ar = None
    for m in _AR.finditer(zona[:zona.find("Promulgad")] if "Promulgad" in zona else zona):
        ar = m  # the last approval before the promulgation
    if ar and tipo_ato in ("lei", "lei-organica", "lei-constitucional"):
        r["d_aprovacao_ar"] = _data(ar)
        m = _PRES_AR.search(zona, ar.end())
        r["pres_ar"] = re.sub(r"\s+", " ", m.group(1)).strip() if m else None
    if p:
        r["d_promulgacao"] = _data(p)
        m = _PR.search(t, p.end(), p.end() + 600)
        if m:
            r["presidente_nome"] = re.sub(r"\s+", " ", m.group(2)).strip()
            r["presidente_interino"] = bool(m.group(1))
        ref = _REFERENDA.search(t, p.end(), p.end() + 800)
        if ref:
            r["d_referenda"] = _data(ref)
            m = _PM.search(t, ref.end(), ref.end() + 400)
            if m:
                r["referenda_nome"] = re.sub(r"\s+", " ", m.group(3)).strip()
                r["referenda_por_outro"] = m.group(1).lower().startswith("pel") or bool(m.group(2))
    a = _AUTORIZACAO.search(t[:p.start()] if p else t)
    r["autorizacao"] = re.sub(r"\s+", " ", a.group(1)) if a and tipo_ato == "decreto-lei" else None
    if pre:
        r["bloco"] = "pre1976"
        m = _PACOS.search(zona) or _PACOS.search(t)
        if m:
            r["signatarios_pre1976"] = [re.sub(r"\s+", " ", x).strip(" .") for x in re.split(r"\s+-\s*|\s*-\s+", m.group(1)) if x.strip(" .")]
        if r["presidente_nome"] and r["presidente_nome"] not in r["signatarios_pre1976"]:
            r["signatarios_pre1976"].append(r["presidente_nome"])
    elif r["d_cm"] or r["d_promulgacao"] or r["d_aprovacao_ar"]:
        r["bloco"] = "pos1976"
    r["transitorias"] = transitorias(t)
    r["estado"] = estados(r, tipo_ato, publicacao)
    return r


def estados(r: dict, tipo_ato: str, publicacao: str | None) -> dict:
    """ok · ausente · nao_aplicavel · suspeito per field, and "ordem": suspeito unless
    d_cm ≤ d_promulgacao ≤ d_referenda ≤ publicacao and d_cm ≥ publicacao − 2 anos."""
    e = {}
    dl = tipo_ato == "decreto-lei"
    e["d_cm"] = ("ok" if r["d_cm"] else "ausente") if dl else "nao_aplicavel"
    e["d_promulgacao"] = "ok" if r["d_promulgacao"] else "ausente"
    e["presidente_nome"] = "ok" if r["presidente_nome"] else "ausente"
    e["d_referenda"] = "ok" if r["d_referenda"] else "ausente"
    if r["bloco"] == "pre1976":
        e["d_referenda"] = "nao_aplicavel"
    # Dates out of order: the date with the most conflicts is the suspect one (a year typo in the
    # referenda of Lei n.º 8/2022); on a tie, every date in the tie is.
    cadeia = [(c, r[c]) for c in ("d_cm", "d_aprovacao_ar", "d_promulgacao", "d_referenda") if r[c]]
    ordem = "ok"
    fixa = publicacao or "9999-12-31"
    while True:
        conflitos = {c: 0 for c, _ in cadeia}
        for i, (a, da) in enumerate(cadeia):
            if da > fixa:
                conflitos[a] += 2
            for b, db in cadeia[i + 1:]:
                if da > db:
                    conflitos[a] += 1
                    conflitos[b] += 1
        pior = max(conflitos.values(), default=0)
        if not pior:
            break
        maus = [c for c, n in conflitos.items() if n == pior]
        for c in maus:
            e[c] = "suspeito"
        ordem = "suspeito"
        cadeia = [(c, d) for c, d in cadeia if c not in maus]
    if r["d_cm"] and publicacao and r["d_cm"] < _menos_anos(publicacao, 2):
        e["d_cm"] = "suspeito"
        ordem = "suspeito"
    e["ordem"] = ordem
    return e


def _menos_anos(d: str, n: int) -> str:
    return f"{int(d[:4]) - n}{d[4:]}"


# ---- The fetch ---------------------------------------------------------------------------------
def ler(path: str) -> dict:
    if not os.path.exists(path):
        return {"versao": VERSAO, "atos": {}}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def juntar(*fontes: dict) -> dict[str, dict]:
    """Seed ∪ cache: for one id, the entry with the newer obtido_em wins; on the same day, the later
    source (the cache); an entry with erro loses to one without."""
    out: dict[str, dict] = {}
    for f in fontes:
        for aid, e in (f.get("atos") or {}).items():
            o = out.get(aid)
            if o is None or _melhor(e, o):
                out[aid] = e
    return out


def _melhor(novo: dict, velho: dict) -> bool:
    if bool(novo.get("erro")) != bool(velho.get("erro")):
        return not novo.get("erro")
    return (novo.get("obtido_em") or "") >= (velho.get("obtido_em") or "")  # on a tie the later source (the cache) wins


def tipo_key(link: str | None) -> tuple[str, str] | None:
    m = re.search(r"/dr/detalhe/([^/]+)/([^/?#]+)", link or "")
    return (m.group(1), m.group(2)) if m else None


def entrada(aid: str, a: dict, hoje: str, buscar) -> dict:
    """One act's entry. buscar(tipo, key) -> the DR's act record (fetch.cached("act", …))."""
    tipo_ato = atos.tipo_ato(a["designacao"], a.get("publicacao"))
    base = {"designacao": a["designacao"], "publicacao": a.get("publicacao"), "tipo": None, "key": None, "obtido_em": hoje, "hash": None}
    tk = tipo_key(a.get("link"))
    if not tk:
        return {**base, "bloco": "sem_bloco", "estado": {}, "erro": "sem_link"}
    base["tipo"], base["key"] = tk
    try:
        d = buscar(*tk)
    except Exception as e:  # network or API change: recorded, retried on the next run
        nome = type(e).__name__
        return {**base, "bloco": "sem_bloco", "estado": {}, "erro": ("api: StaleApiVersion" if nome == "StaleApiVersion" else f"rede: {nome}: {str(e)[:120]}")}
    texto = (d or {}).get("Texto") or ""
    if not texto.strip():
        return {**base, "bloco": "sem_bloco", "estado": {}, "erro": "sem_texto"}
    base["hash"] = "sha256:" + hashlib.sha256(texto.encode("utf-8")).hexdigest()
    return {**base, **ler_bloco(texto, tipo_ato, a.get("publicacao")), "erro": None}


def main(argv: list[str]) -> int:
    import fetch
    hoje = os.environ.get("REDACAO_HOJE") or dt.date.today().isoformat()
    semente, cache = ler(SEMENTE), ler(CACHE)
    if "--semente" in argv:
        todos = juntar(semente, cache)
        escrever(SEMENTE, todos)
        print(f"{SEMENTE}: {len(todos)} atos")
        return 0
    reg = atos.registo(os.path.join(ROOT, "data", "raw"))
    if "--ato" in argv:
        aid = argv[argv.index("--ato") + 1]
        print(json.dumps(entrada(aid, reg[aid], hoje, lambda t, k: fetch.cached("act", t, k)), ensure_ascii=False, indent=1))
        return 0
    feitos = juntar(semente, cache)
    falta = [aid for aid in sorted(reg) if "--reler" in argv or aid not in feitos or feitos[aid].get("erro") not in (None, "sem_link", "sem_texto")]
    sys.stderr.write(f"assinaturas: {len(reg)} atos, {len(falta)} por ler\n")
    novos, parar = dict(cache.get("atos") or {}), False
    for k, aid in enumerate(falta):
        if parar:
            break
        e = entrada(aid, reg[aid], hoje, lambda t, key: fetch.cached("act", t, key))
        novos[aid] = e
        if e.get("erro") == "api: StaleApiVersion":
            sys.stderr.write("assinaturas: o Diário da República mudou a API (StaleApiVersion); fica para depois\n")
            parar = True
        if k % 50 == 49:
            sys.stderr.write(f"  {k + 1}/{len(falta)}\n")
            _gravar(novos)
    _gravar(novos)
    erros = sum(1 for e in novos.values() if (e.get("erro") or "").startswith(("rede", "api")))
    sys.stderr.write(f"assinaturas: {len(falta)} lidos, {erros} com erro de rede (repete-se na próxima vez)\n")
    return 0


def escrever(path: str, atos_: dict) -> None:
    """One act per line, sorted by id: small diffs in git."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write('{"versao": %d, "atos": {\n' % VERSAO)
        fh.write(",\n".join(json.dumps(k, ensure_ascii=False) + ": " + json.dumps(v, ensure_ascii=False, separators=(",", ":"))
                             for k, v in sorted(atos_.items())))
        fh.write("\n}}\n")
    os.replace(tmp, path)


def _gravar(atos_: dict) -> None:
    escrever(CACHE, atos_)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
