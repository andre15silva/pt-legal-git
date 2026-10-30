"""Share pages: static pages with link-preview tags for the hash routes (DESIGN-SPEC §5, R-56…R-60).

The site uses `#/…` routes, which messaging apps and social networks cannot preview. This module
writes, under app/p/, one small HTML page per story, diploma, act and notable article redação. Each
page carries the Open Graph and Twitter tags in its first 4 KB, then sends the browser to the route.
Stories, diplomas and article redações also get a 1200×630 PNG image drawn with Pillow.

    app/p/og.png                                   site image (fallback)
    app/p/historia/<slug>/index.html + og.png
    app/p/d/<slug>/index.html + og.png
    app/p/ato/<id>/index.html                      (image: the first diploma the act changed)
    app/p/d/<slug>/<artigo>/<chave>/index.html + og.png

`chave` (§2.14): the act of the redação, or `<ato>-<k>` for the k-th (k ≥ 2) redação the same act made
of that article. All share-page copy is in this file.

    python -I pipeline/partilha.py --imagem DIR   # draw one image of each kind into DIR, to look at
    python -I pipeline/partilha.py --site         # redraw pipeline/partilha-og.png, the site image used without Pillow
"""
from __future__ import annotations

import datetime
import hashlib
import html
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTE = os.path.join(HERE, "partilha.json")
FONTS = os.path.join(HERE, "fonts")
CACHE = os.path.join(ROOT, "cache-og")
LAYOUT = "og-2"   # change when the drawing changes: every image is redrawn
MAX_ARTIGOS = 100
MAX_IMAGEM = 300 * 1024
MAX_TOTAL = 100 * 1024 * 1024
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
         "novembro", "dezembro"]
NAO_OFICIAL = "Texto não oficial."
SITE = "andre15silva.github.io/pt-legal-git"

SITE_LINHAS = ["A história de cada artigo da lei portuguesa", "Cada redação, com a data e o diploma que a escreveu", ""]
SITE_PNG = os.path.join(HERE, "partilha-og.png")
COR = {"paper": "#ffffff", "ink": "#1a1f1c", "muted": "#525a56", "rule": "#e3e6e4", "verde": "#1d5c44"}
FONTES_PNG = {"serif": "SourceSerif4-Regular.ttf", "serif600": "SourceSerif4-Semibold.ttf",
              "sans": "SchibstedGrotesk-Regular.ttf", "sans600": "SchibstedGrotesk-SemiBold.ttf"}


# ---------------------------------------------------------------------------------------------
# Words


def data_extenso(d: str | None, ano: bool = True) -> str:
    if not d:
        return "data desconhecida"
    a, m, dia = d[:10].split("-")
    return f"{int(dia)} de {MESES[int(m) - 1]}" + (f" de {a}" if ano else "")


def dia_antes(d: str) -> str:
    return (datetime.date.fromisoformat(d[:10]) - datetime.timedelta(days=1)).isoformat()


def feminino(designacao: str) -> bool:
    d = re.sub(r"^[IVXLC]+,\s*", "", designacao or "").lower()
    return d.startswith(("lei", "declaração", "rectificação", "retificação", "portaria", "resolução", "constituição"))


def pelo(des: str) -> str:
    return ("pela " if feminino(des) else "pelo ") + des


def do(des: str) -> str:
    return ("da " if feminino(des) else "do ") + des


def roman(n: int) -> str:
    out, v = "", n
    for val, sym in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"),
                     (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while v >= val:
            out, v = out + sym, v - val
    return out


def sem_parenteses(epigrafe: str | None) -> str:
    return re.sub(r"^\((.*)\)$", r"\1", (epigrafe or "").strip()).strip()


def chaves_de(art: dict) -> list[str]:
    """Share keys of an article's redações, in order (§2.14). Stable when redações are added later."""
    vistos: dict[str, int] = {}
    out = []
    for v in art.get("versoes", []):
        k = vistos[v["ato"]] = vistos.get(v["ato"], 0) + 1
        out.append(v["ato"] if k == 1 else f"{v['ato']}-{k}")
    return out


def cortar_desc(partes: list[str | None], fixo: list[str]) -> str:
    """Join optional phrases and the fixed end; drop optional phrases from the end until ≤ 200 chars."""
    opc = [p for p in partes if p]
    while True:
        s = " ".join(opc + fixo)
        if len(s) <= 200 or not opc:
            return s
        opc.pop()


# ---------------------------------------------------------------------------------------------
# Data


class Dados:
    def __init__(self, out: str):
        self.out = out

        def ler(nome, vazio):
            p = os.path.join(out, nome)
            if not os.path.exists(p):
                return vazio
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        self.index = ler("index.json", {})
        self.atos = ler("atos.json", {})
        self.passagem = ler("passagem.json", {})
        self.quem = ler("quem.json", None)
        self.governos = ler("governos.json", None)
        self.historias = ler(os.path.join("historias", "index.json"), {"historias": [], "artigos": {}})
        self.aliases = self.index.get("aliases_atos") or {}
        self.diplomas = {d["slug"]: d for d in self.index.get("diplomas", [])}
        self._art: dict = {}
        self._dip: dict = {}
        self.por_diploma: dict[str, list[str]] = {}
        for aid, a in sorted(self.atos.items(), key=lambda kv: (kv[1].get("publicacao") or "", kv[0])):
            for x in a.get("alteracoes", []):
                lst = self.por_diploma.setdefault(x["diploma"], [])
                if not lst or lst[-1] != aid:
                    lst.append(aid)

    def artigo(self, slug: str, artigo: str) -> dict | None:
        k = (slug, artigo)
        if k not in self._art:
            p = os.path.join(self.out, "d", slug, artigo + ".json")
            self._art[k] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
        return self._art[k]

    def diploma(self, slug: str) -> dict:
        if slug not in self._dip:
            p = os.path.join(self.out, "d", slug + ".json")
            self._dip[slug] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
        return self._dip[slug]

    def romano(self, n) -> str:
        for g in (self.governos or {}).get("governos", []):
            if g.get("numero") == n and g.get("romano"):
                return g["romano"]
        return roman(int(n))


# ---------------------------------------------------------------------------------------------
# Texts (§5.3)


def texto_artigo(d: Dados, slug: str, art: dict, i: int) -> dict:
    dip = d.diplomas.get(slug) or d.diploma(slug)
    v = art["versoes"][i]
    a = d.atos.get(v["ato"], {})
    des = a.get("designacao", v["ato"])
    epi = sem_parenteses(art.get("epigrafe"))
    titulo = f"{dip.get('titulo', slug)} · {art.get('rotulo')}" + (f" — {epi}" if epi else "")
    tipo = v.get("tipo")
    if tipo == "original":
        sub = f"Texto original {do(des)}."
    elif tipo == "retificado":
        sub = f"Redação retificada {pelo(des)}."
    elif tipo == "revogado":
        sub = f"Artigo revogado {pelo(des)}."
    else:
        sub = f"Redação dada {pelo(des)}."
    vigor = v.get("vigor")
    seg = art["versoes"][i + 1] if i + 1 < len(art["versoes"]) else None
    hoje = os.environ.get("REDACAO_HOJE") or datetime.date.today().isoformat()
    if vigor and vigor > hoje:
        quando = f"Entra em vigor a {data_extenso(vigor)}."
    elif vigor and seg and seg.get("vigor") and seg["vigor"] > vigor:
        quando = f"Esteve em vigor de {data_extenso(vigor)} a {data_extenso(dia_antes(seg['vigor']))}."
    elif vigor:
        quando = f"Em vigor desde {data_extenso(vigor)}."
    else:
        quando = f"Publicada no Diário da República a {data_extenso(v.get('publicacao'))}."
    return {"titulo": titulo, "descricao": cortar_desc([sub], [quando, NAO_OFICIAL]), "tipo_og": "article",
            "linhas": [titulo, sub.rstrip("."), quando.rstrip(".")], "rotulo": "Artigo"}


def texto_diploma(d: Dados, slug: str) -> dict:
    dip = d.diplomas.get(slug) or d.diploma(slug)
    titulo = dip.get("titulo", slug)
    des = dip.get("designacao") or ""
    orig = d.atos.get(d.diploma(slug).get("ato_original") or "", {})
    pub = dip.get("publicacao") or orig.get("publicacao")
    lista = d.por_diploma.get(slug, [])
    primeiro = f"{des}, de {data_extenso(pub)}." if des and pub else (f"{des}." if des else None)
    if lista:
        u = d.atos[lista[-1]]
        quando = f"Última alteração: {u['designacao']}, {data_extenso(u.get('publicacao'))}."
    else:
        quando = f"Publicado a {data_extenso(pub)}. Nunca alterado." if pub else "Nunca alterado."
    return {"titulo": titulo, "descricao": cortar_desc([primeiro], [quando, NAO_OFICIAL]), "tipo_og": "website",
            "linhas": [titulo, (primeiro or "").rstrip("."), quando.rstrip(".")], "rotulo": "Lei e código"}


def texto_historia(h: dict) -> dict:
    """A long-form story (pipeline/historias.py): the dek, cut to fit, then the date and «Texto não oficial.»"""
    quando = f"Preparada a {data_extenso(h.get('preparado_em'))}."
    fixo = [quando, NAO_OFICIAL]
    resumo = (h.get("resumo") or "").strip()
    livre = 200 - len(" ".join(fixo)) - 1
    if len(resumo) > livre:
        corte = resumo[: livre - 1]
        resumo = corte[: corte.rfind(" ")].rstrip(" ,;:") + "…" if " " in corte else corte + "…"
    frase = re.split(r"(?<=[.!?])\s", (h.get("resumo") or "").strip())[0]
    return {"titulo": h["titulo"], "descricao": cortar_desc([resumo], fixo), "tipo_og": "article",
            "linhas": [h["titulo"], frase.rstrip("."), f"{h.get('autoria') or 'Redação'} · {data_extenso(h.get('preparado_em'))}"],
            "rotulo": "História", "aviso": h.get("aviso"), "publicado": h.get("preparado_em"),
            "modificado": h.get("atualizado_em") or h.get("preparado_em")}


def texto_ato(d: Dados, aid: str) -> dict:
    a = d.atos[aid]
    des = a.get("designacao", aid)
    pub = a.get("publicacao")
    titulo = f"{des}, de {data_extenso(pub)}" if pub else des
    q = (d.quem or {}).get(aid) or {}
    p = d.passagem.get(aid) or {}
    tipo = q.get("tipo_ato") or a.get("tipo_ato") or ""
    fem = feminino(des)
    publicado = f"{'Publicada' if fem else 'Publicado'} a {data_extenso(pub)}."
    if tipo == "decreto-lei" or (not tipo and des.startswith("Decreto-Lei")):
        g = (q.get("governo") or {}).get("numero")
        if g and q.get("d_cm"):
            desc = cortar_desc([], [f"Decreto-lei do {d.romano(g)} Governo Constitucional, aprovado em Conselho de "
                                    f"Ministros a {data_extenso(q['d_cm'])}.", f"Publicado a {data_extenso(pub)}.", NAO_OFICIAL])
        else:
            desc = cortar_desc([], [f"Decreto-lei publicado a {data_extenso(pub)}.", NAO_OFICIAL])
    elif p or tipo in ("lei", "lei-organica"):
        prop = None
        prop_q = q.get("proponentes") or []
        tc = q.get("texto_comissao")
        if tc and tc.get("n_iniciativas"):
            n = tc["n_iniciativas"]
            prop = "Texto da comissão a partir de uma iniciativa." if n == 1 else f"Texto da comissão a partir de {n} iniciativas."
        elif prop_q and all(x.get("tipo") == "governo" for x in prop_q) and len(prop_q) == 1:
            g = prop_q[0].get("governo")
            prop = f"Proposta de lei do {d.romano(g)} Governo Constitucional." if g else "Proposta de lei do Governo."
        elif prop_q and all(x.get("tipo") == "grupos" for x in prop_q):
            siglas = []
            for x in prop_q:
                for gr in x.get("grupos", []):
                    if gr.get("sigla") not in siglas:
                        siglas.append(gr.get("sigla"))
            if siglas:
                prop = f"Projeto de lei de deputados do {', '.join(siglas)}." if len(prop_q) == 1 else None
        elif not q and p.get("iniciativas"):
            inis = p["iniciativas"]
            if len(inis) == 1 and not p.get("texto_comissao"):
                au = inis[0].get("autores") or {}
                if au.get("tipo") == "governo":
                    prop = "Proposta de lei do Governo."
                elif au.get("grupos") and au.get("tipo") in ("grupos", "deputados"):
                    prop = f"Projeto de lei de deputados do {', '.join(au['grupos'])}."
        vfg = (q.get("vfg") or {}).get("data")
        if not vfg and isinstance(p.get("vfg"), dict):
            vfg = p["vfg"].get("data")
        if not vfg:
            vfg = next((s["data"] for s in p.get("passos", []) if s.get("passo") == "votacao-final"), None)
        vfg_txt = f"Votação final global a {data_extenso(vfg)}." if vfg else None
        ev = p.get("eventos") or q.get("eventos") or []
        tipos = [e.get("tipo") for e in ev]
        veto = None
        if "veto" in tipos:
            if "confirmacao" in tipos:
                veto = "O Presidente vetou o decreto. O Parlamento confirmou-o."
            elif "novo_decreto" in tipos:
                veto = "O Presidente vetou o decreto. O Parlamento aprovou um novo decreto."
        # Drop the veto phrase first, then the proposer phrase (§5.3).
        partes = [x for x in (prop, vfg_txt, veto) if x]
        fixo = [publicado, NAO_OFICIAL]
        desc = " ".join(partes + fixo)
        if len(desc) > 200 and veto:
            partes.remove(veto)
            desc = " ".join(partes + fixo)
        if len(desc) > 200 and prop:
            partes.remove(prop)
            desc = " ".join(partes + fixo)
    else:
        desc = cortar_desc([], [f"{'Publicada' if fem else 'Publicado'} no Diário da República a {data_extenso(pub)}.", NAO_OFICIAL])
    return {"titulo": titulo, "descricao": desc, "tipo_og": "article", "linhas": None, "rotulo": None}


# ---------------------------------------------------------------------------------------------
# Images (§5.4)


def _fontes():
    from PIL import ImageFont  # noqa: F401
    return {k: os.path.join(FONTS, f) for k, f in FONTES_PNG.items()}


def hash_fontes() -> str:
    h = hashlib.sha256()
    for k in sorted(FONTES_PNG):
        p = os.path.join(FONTS, FONTES_PNG[k])
        if os.path.exists(p):
            h.update(open(p, "rb").read())
    return h.hexdigest()


_HF = None


def hash_imagem(rotulo: str, linhas: list[str]) -> str:
    global _HF
    if _HF is None:
        _HF = hash_fontes()
    return hashlib.sha256(json.dumps([LAYOUT, _HF, rotulo, linhas], ensure_ascii=False).encode()).hexdigest()[:12]


def _quebrar(draw, texto: str, fonte, largura: int) -> list[str]:
    linhas, atual = [], ""
    texto = re.sub(r"\b(Artigo|artigo|n\.º|Lei|Decreto-Lei) (?=\S)", "\\1\u00a0", texto)  # keep «Artigo 36.º» together
    for p in texto.split(" "):
        if not p:
            continue
        t = (atual + " " + p).strip()
        if draw.textlength(t, font=fonte) <= largura or not atual:
            atual = t
        else:
            linhas.append(atual)
            atual = p
    if atual:
        linhas.append(atual)
    return linhas


def _reticencias(draw, linha: str, fonte, largura: int) -> str:
    while linha and draw.textlength(linha + "…", font=fonte) > largura:
        linha = linha.rsplit(" ", 1)[0] if " " in linha else linha[:-1]
    return linha.rstrip(" ,;:·—") + "…"


def desenhar(rotulo: str, linhas: list[str], destino: str) -> None:
    """Draw the 1200×630 image. linhas = [headline, sub, date]."""
    from PIL import Image, ImageDraw, ImageFont
    f = _fontes()
    W, H, M = 1200, 630, 72
    img = Image.new("RGB", (W, H), COR["paper"])
    dr = ImageDraw.Draw(img)
    marca = ImageFont.truetype(f["sans600"], 36)
    kind = ImageFont.truetype(f["sans"], 32)
    dr.text((M, 72), "Redação", font=marca, fill=COR["verde"], anchor="ls")
    if rotulo:
        dr.text((W - M, 72), rotulo, font=kind, fill=COR["muted"], anchor="rs")
    largura = W - 2 * M
    titulo, sub, data = (list(linhas) + ["", "", ""])[:3]
    # Headline: serif 600 60/70, at most 3 lines; shrink to 48/58 before cutting with «…».
    for tam, alt in ((60, 70), (48, 58)):
        hf = ImageFont.truetype(f["serif600"], tam)
        hl = _quebrar(dr, titulo, hf, largura)
        if len(hl) <= 3:
            break
    if 1 < len(hl) <= 3:
        # Balance the lines: the narrowest width that keeps the same number of lines.
        lo, hi = largura // 2, largura
        while hi - lo > 8:
            mid = (lo + hi) // 2
            if len(_quebrar(dr, titulo, hf, mid)) <= len(hl):
                hi = mid
            else:
                lo = mid
        hl = _quebrar(dr, titulo, hf, hi)
    if len(hl) > 3:
        hl = hl[:2] + [_reticencias(dr, " ".join(hl[2:]), hf, largura)]
    sf = ImageFont.truetype(f["serif"], 36)
    sl = _quebrar(dr, sub, sf, largura) if sub else []
    dl = _quebrar(dr, data, sf, largura) if data else []
    if len(sl) > 2:
        sl = sl[:1] + [_reticencias(dr, " ".join(sl[1:]), sf, largura)]
    dl = dl[:1] if len(dl) <= 1 else [_reticencias(dr, " ".join(dl), sf, largura)]
    y0 = 150
    fim = y0 + len(hl) * alt + (16 + len(sl) * 46 if sl else 0) + (len(dl) * 46 if dl else 0)
    if fim > 524 and len(sl) > 1:
        sl = [_reticencias(dr, " ".join(sl), sf, largura)]
    y = y0
    for linha in hl:
        dr.text((M, y), linha, font=hf, fill=COR["ink"], anchor="ls")
        y += alt
    y += 16 - alt + 46
    for linha in sl:
        dr.text((M, y), linha, font=sf, fill=COR["muted"], anchor="ls")
        y += 46
    for linha in dl:
        dr.text((M, y), linha, font=sf, fill=COR["ink"], anchor="ls")
        y += 46
    dr.line([(M, 540), (W - M, 540)], fill=COR["rule"], width=1)
    rod = ImageFont.truetype(f["sans"], 32)
    dr.text((M, 566 + 26), f"Texto não oficial · {SITE}", font=rod, fill=COR["muted"], anchor="ls")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    img.save(destino, format="PNG", optimize=True)


def imagem(rotulo: str, linhas: list[str], destino: str, avisos: list[str]) -> str | None:
    """Draw (or reuse from cache-og/) the image; return its hash12, or None without Pillow."""
    h = hash_imagem(rotulo, linhas)
    cache = os.path.join(CACHE, h + ".png")
    if os.path.exists(cache):
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        shutil.copyfile(cache, destino)
        return h
    try:
        desenhar(rotulo, linhas, destino)
    except ImportError:
        return None
    if os.path.getsize(destino) > MAX_IMAGEM:
        avisos.append(f"imagem com mais de 300 KB: {destino}")
    os.makedirs(CACHE, exist_ok=True)
    shutil.copyfile(destino, cache)
    return h


# ---------------------------------------------------------------------------------------------
# Pages (§5.2)


def pagina(base: str, caminho: str, canonico: str, rota: str, txt: dict, img_caminho: str, img_hash: str,
           alt: str) -> str:
    e = lambda s: html.escape(s or "", quote=True)  # noqa: E731
    depth = len([x for x in caminho.split("/") if x]) + 1   # p/ + caminho
    rel = "../" * depth
    sep = "&" if "?" in rota else "?"
    img = f"{base}p/{img_caminho}og.png?v={img_hash}"
    aviso = f"<p>{e(txt['aviso'])}</p>\n" if txt.get("aviso") else ""
    return (
        "<!doctype html>\n<html lang=\"pt-PT\"><head>\n<meta charset=\"utf-8\">\n"
        f"<meta property=\"og:title\" content=\"{e(txt['titulo'])}\">\n"
        f"<meta property=\"og:image\" content=\"{e(img)}\">\n"
        f"<meta property=\"og:description\" content=\"{e(txt['descricao'])}\">\n"
        f"<meta property=\"og:url\" content=\"{e(base + 'p/' + canonico)}\">\n"
        f"<meta property=\"og:type\" content=\"{txt['tipo_og']}\">\n"
        + (f"<meta property=\"article:published_time\" content=\"{e(txt['publicado'])}\">\n" if txt.get("publicado") else "")
        + (f"<meta property=\"article:modified_time\" content=\"{e(txt['modificado'])}\">\n" if txt.get("modificado") else "") +
        "<meta property=\"og:locale\" content=\"pt_PT\">\n"
        "<meta property=\"og:site_name\" content=\"Redação\">\n"
        "<meta property=\"og:image:width\" content=\"1200\">\n"
        "<meta property=\"og:image:height\" content=\"630\">\n"
        f"<meta property=\"og:image:alt\" content=\"{e(alt)}\">\n"
        "<meta name=\"twitter:card\" content=\"summary_large_image\">\n"
        f"<link rel=\"canonical\" href=\"{e(base + 'p/' + canonico)}\">\n"
        f"<title>{e(txt['titulo'])} · Redação</title>\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        f"<meta name=\"description\" content=\"{e(txt['descricao'])}\">\n"
        f"<script>location.replace({json.dumps(rel + '#/' + rota + sep + 'de=partilha')});</script>\n"
        "<style>body{font:18px/1.5 Georgia,serif;margin:16px;max-width:40em;color:#1a1f1c;background:#fff}"
        "a{color:#1d5c44}</style>\n"
        "</head><body>\n"
        f"<p><a href=\"{e(rel + '#/' + rota)}\">{e(txt['titulo'])}</a></p>\n"
        f"<p>{e(txt['descricao'])}</p>\n{aviso}"
        "</body></html>\n")


def carregar(fonte: str = FONTE) -> dict:
    with open(fonte, encoding="utf-8") as f:
        return json.load(f)


def construir(out: str, estrito: bool, fonte: str = FONTE, destino: str | None = None,
              desenhar_imagens: bool = True) -> tuple[dict, list[str], list[dict]]:
    """Write out/partilha.json and the pages under <app>/p/. Returns (built, messages, conteudo rows)."""
    d = Dados(out)
    src = carregar(fonte)
    base = src.get("base", "https://andre15silva.github.io/pt-legal-git/")
    raiz = destino or os.path.join(os.path.dirname(os.path.abspath(out)), "p")
    msgs, linhas_v = [], []
    if os.path.isdir(raiz):
        shutil.rmtree(raiz)
    os.makedirs(raiz)
    tem_pil = True
    try:
        import PIL  # noqa: F401
    except ImportError:
        tem_pil = False
        msgs.append("partilha: sem Pillow, as páginas usam a imagem do site" + (" (erro em modo estrito)" if estrito else ""))
        linhas_v.append({"tipo": "partilha", "id": "pillow", "seccao": None, "motivo": "sem Pillow"})
    if not desenhar_imagens:
        tem_pil = False
    avisos: list[str] = []

    def img(rotulo, linhas, caminho) -> tuple[str, str]:
        if tem_pil:
            h = imagem(rotulo, linhas, os.path.join(raiz, caminho, "og.png"), avisos)
            if h:
                return caminho, h
        return "", site_hash

    site_hash = None
    if tem_pil:
        site_hash = imagem("", SITE_LINHAS, os.path.join(raiz, "og.png"), avisos)
    if not site_hash:
        # Without Pillow: the committed copy of the site image (python -I pipeline/partilha.py --site).
        shutil.copyfile(SITE_PNG, os.path.join(raiz, "og.png"))
        site_hash = hashlib.sha256(open(SITE_PNG, "rb").read()).hexdigest()[:12]

    def escrever(caminho: str, conteudo: str):
        p = os.path.join(raiz, caminho, "index.html")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(conteudo)

    # Stories (withheld stories are not in the index).
    hist = []
    for h in d.historias.get("historias", []):
        t = texto_historia(h)
        c = f"historia/{h['slug']}/"
        propria = os.path.join(out, "historias", h["imagem_partilha"]) if h.get("imagem_partilha") else None
        if propria and os.path.exists(propria):
            # The story's own 1200×630 image (front matter imagem_partilha), copied as is.
            os.makedirs(os.path.join(raiz, c), exist_ok=True)
            shutil.copyfile(propria, os.path.join(raiz, c, "og.png"))
            ic, ih = c, hashlib.sha256(open(propria, "rb").read()).hexdigest()[:12]
        else:
            ic, ih = img(t["rotulo"], t["linhas"], c)
        escrever(c, pagina(base, c, c, f"historia/{h['slug']}", t, ic, ih, ". ".join(x for x in t["linhas"] if x)))
        hist.append(h["slug"])

    # Diplomas.
    img_dip = {}
    for slug in d.diplomas:
        t = texto_diploma(d, slug)
        c = f"d/{slug}/"
        ic, ih = img(t["rotulo"], t["linhas"], c)
        img_dip[slug] = (ic, ih, ". ".join(x for x in t["linhas"] if x))
        escrever(c, pagina(base, c, c, f"d/{slug}", t, ic, ih, img_dip[slug][2]))

    # Acts and their aliases (an alias page carries the canonical og:url).
    for aid in sorted(d.atos):
        t = texto_ato(d, aid)
        dips = [x["diploma"] for x in d.atos[aid].get("alteracoes", [])]
        ic, ih, alt = img_dip.get(dips[0]) if dips and dips[0] in img_dip else ("", site_hash, "Redação")
        escrever(f"ato/{aid}/", pagina(base, f"ato/{aid}/", f"ato/{aid}/", f"ato/{aid}", t, ic, ih, alt))
    for alias, aid in sorted(d.aliases.items()):
        if aid in d.atos and alias != aid:
            t = texto_ato(d, aid)
            dips = [x["diploma"] for x in d.atos[aid].get("alteracoes", [])]
            ic, ih, alt = img_dip.get(dips[0]) if dips and dips[0] in img_dip else ("", site_hash, "Redação")
            escrever(f"ato/{alias}/", pagina(base, f"ato/{alias}/", f"ato/{aid}/", f"ato/{aid}", t, ic, ih, alt))

    # Notable articles: the committed list ∪ every article a story cites.
    pedidos: list[tuple[str, str]] = []
    vistos = set()
    lista = src.get("artigos") or []
    if len(lista) > MAX_ARTIGOS:
        msgs.append(f"partilha: {len(lista)} artigos na lista (máx. {MAX_ARTIGOS})")
        linhas_v.append({"tipo": "partilha", "id": "lista", "seccao": None, "motivo": "mais de 100 artigos"})
    for x in lista:
        k = f"{x.get('diploma')}/{x.get('artigo')}"
        erro = None
        if not (x.get("motivo") or "").strip():
            erro = "sem motivo"
        elif d.artigo(x.get("diploma", ""), x.get("artigo", "")) is None:
            erro = "artigo desconhecido"
        if erro:
            msgs.append(f"partilha {k}: {erro}")
            linhas_v.append({"tipo": "partilha", "id": k, "seccao": None, "motivo": erro})
            continue
        if k not in vistos:
            vistos.add(k)
            pedidos.append((x["diploma"], x["artigo"]))
    for k in sorted(d.historias.get("artigos") or {}):
        if k not in vistos:
            slug, _, artigo = k.partition("/")
            if d.artigo(slug, artigo) is not None:
                vistos.add(k)
                pedidos.append((slug, artigo))
    artigos_built = {}
    for slug, artigo in pedidos:
        art = d.artigo(slug, artigo)
        chaves = chaves_de(art)
        artigos_built[f"{slug}/{artigo}"] = chaves
        for i, chave in enumerate(chaves):
            v = art["versoes"][i]
            t = texto_artigo(d, slug, art, i)
            c = f"d/{slug}/{artigo}/{chave}/"
            ic, ih = img(t["rotulo"], t["linhas"], c)
            k = chave[len(v["ato"]) + 1:] if chave != v["ato"] else ""
            rota = f"d/{slug}/{artigo}?redacao={v['ato']}" + (f"&k={k}" if k else "")
            escrever(c, pagina(base, c, c, rota, t, ic, ih, ". ".join(x for x in t["linhas"] if x)))

    built = {"base": base, "artigos": artigos_built, "historias": hist}
    with open(os.path.join(out, "partilha.json"), "w", encoding="utf-8") as f:
        json.dump(built, f, ensure_ascii=False, separators=(",", ":"))

    total = 0
    for dirpath, _, files in os.walk(raiz):
        for fn in files:
            total += os.path.getsize(os.path.join(dirpath, fn))
    if total > MAX_TOTAL:
        avisos.append(f"app/p tem {total // (1024 * 1024)} MB (máx. 100 MB)")
    for a in avisos:
        msgs.append("partilha: " + a)
        linhas_v.append({"tipo": "partilha", "id": "orcamento", "seccao": None, "motivo": a})
    return built, msgs, linhas_v


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "--imagem":
        # One image of each kind, to look at.
        out = os.path.join(ROOT, "app", "data")
        d = Dados(out)
        os.makedirs(argv[1], exist_ok=True)
        art = d.artigo("lei-nacionalidade", "artigo-6")
        exemplos = {"artigo": texto_artigo(d, "lei-nacionalidade", art, len(art["versoes"]) - 1),
                    "artigo-antigo": texto_artigo(d, "lei-nacionalidade", art, 0),
                    "diploma": texto_diploma(d, "codigo-irc"),
                    "historia": texto_historia({"titulo": "As mudanças no arrendamento desde 2012", "preparado_em": "2026-10-30",
                                                "resumo": "x"})}
        for nome, t in exemplos.items():
            p = os.path.join(argv[1], nome + ".png")
            desenhar(t["rotulo"], t["linhas"], p)
            print(p, os.path.getsize(p), t["linhas"])
        desenhar("", SITE_LINHAS, os.path.join(argv[1], "site.png"))
        return 0
    if argv == ["--site"]:
        desenhar("", SITE_LINHAS, SITE_PNG)
        print(SITE_PNG)
        return 0
    print("Use pipeline/conteudo.py: it builds the share pages after the stories.")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
