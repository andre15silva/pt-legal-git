"""Tests for the content workstream: glossary, stories, share pages, and tools/estilo.py additions.

    python -I -m unittest discover -s pipeline -p test_conteudo.py

They run on in-memory copies of the shared fixture (pipeline/fixtures/contrato/app-data). The image
tests need Pillow; without it they are skipped, unless CI=true, where a skip is an error.
"""
import codecs
import copy
import glob
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import conteudo  # noqa: E402
import estilo  # noqa: E402
import glossario  # noqa: E402
import historias  # noqa: E402
import partilha  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "contrato", "app-data")
APP_DATA = os.path.join(ROOT, "app", "data")
CI = os.environ.get("CI") == "true"
ESTRITO = os.environ.get("REDACAO_ESTRITO") == "1"

try:
    import PIL  # noqa: F401
    TEM_PIL = True
except ImportError:
    TEM_PIL = False

try:
    import contrato
except ImportError:  # A's validator; the tests that need it skip without it
    contrato = None

HISTORIAS_FIX = os.path.join(HERE, "fixtures", "historias")
with open(os.path.join(HISTORIAS_FIX, "teste.md"), encoding="utf-8") as _f:
    HISTORIA = _f.read()


TERMO = {
    "id": "regime", "termo": "regime", "formas": ["regime"], "grupo": "texto",
    "definicao": ["O regime é o geral, salvo lei orgânica ou regulamento."],
    "fonte": {"rota": "#/d/lei-teste/artigo-3", "texto": "Lei de teste, artigo 3.º"},
    "apoio": ["O regime é o geral, salvo lei orgânica ou regulamento"],
    "verificado_em": "2026-10-30",
}


def fixture_ok():
    return os.path.isdir(FIXTURE)


@unittest.skipUnless(fixture_ok(), "sem a fixture partilhada")
class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.out = os.path.join(self.tmp, "app", "data")
        shutil.copytree(FIXTURE, self.out)
        for c in ("glossario.json", "partilha.json"):
            if os.path.exists(os.path.join(self.out, c)):
                os.remove(os.path.join(self.out, c))
        shutil.rmtree(os.path.join(self.out, "historias"), ignore_errors=True)
        self.fontes = os.path.join(self.tmp, "historias-src")
        os.makedirs(self.fontes)
        self.cache = partilha.CACHE
        partilha.CACHE = os.path.join(self.tmp, "cache-og")

    def tearDown(self):
        partilha.CACHE = self.cache
        shutil.rmtree(self.tmp, ignore_errors=True)

    def ler(self, *p):
        with open(os.path.join(self.out, *p), encoding="utf-8") as f:
            return json.load(f)

    def gravar(self, obj, *p):
        with open(os.path.join(self.out, *p), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)

    def escrever_fonte(self, texto=None, nome="teste"):
        if not os.path.isdir(os.path.join(self.fontes, "img")):
            shutil.copytree(os.path.join(HISTORIAS_FIX, "img"), os.path.join(self.fontes, "img"))
        with open(os.path.join(self.fontes, nome + ".md"), "w", encoding="utf-8") as f:
            f.write(texto if texto is not None else HISTORIA)
        return os.path.join(self.fontes, nome + ".md")

    def historia(self, texto=None, estrito=True):
        self.escrever_fonte(texto)
        return historias.construir(self.out, estrito, pasta=self.fontes)

    def compilar(self, texto=None):
        return historias.compilar_ficheiro(self.escrever_fonte(texto), historias.Dados(self.out))

    def erros_de(self, texto):
        h, _ = self.compilar(texto)
        return [e for _, e in h.erros]

    def avisos_de(self, texto):
        h, _ = self.compilar(texto)
        return h.avisos

    def partilha_src(self, artigos=None):
        p = os.path.join(self.tmp, "partilha-src.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"base": "https://andre15silva.github.io/pt-legal-git/",
                       "artigos": artigos if artigos is not None else
                       [{"diploma": "lei-teste", "artigo": "artigo-2", "motivo": "Os requisitos."}]}, f)
        return p


def com_paragrafo(texto, depois="## O prazo {#prazo}\n"):
    """The fixture story with one more paragraph after a line."""
    assert depois in HISTORIA
    return HISTORIA.replace(depois, depois + "\n" + texto + "\n", 1)


# ---------------------------------------------------------------------------------------------
# Stories (pipeline/historias.py, pipeline/historias/README.md)


class Formato(Base):
    """The fixture story (pipeline/fixtures/historias/teste.md) uses every link scheme and figure type."""

    def test_fixture_compiles_clean(self):
        h, comp = self.compilar()
        self.assertEqual(h.erros, [])
        esquemas = {t["esquema"] for b in h.f.blocos if b["t"] in ("p", "citacao")
                    for t in historias.tokens_inline(b["texto"] + " " + b.get("autor", "")) if isinstance(t, dict) and t["t"] == "ref"}
        esquemas |= {t["esquema"] for b in h.f.blocos if b["t"] == "figura"
                     for t in historias.tokens_inline(b["params"].get("legenda", "")) if isinstance(t, dict) and t["t"] == "ref"}
        esquemas |= {r.partition(":")[0] for r in h.f.fm["relacionadas"].split(", ")}
        self.assertEqual(esquemas, set(historias.ESQUEMAS))
        figs = [b for b in comp["blocos"] if b["t"] == "figura"]
        self.assertEqual({b["tipo"] for b in figs}, set(historias.FIGURAS))
        self.assertEqual([b["n"] for b in figs], list(range(1, len(figs) + 1)))
        self.assertTrue(all(b["retida"] is None and b["href"] and b["titulo"] for b in figs))
        self.assertEqual({b["t"] for b in comp["blocos"]}, {"p", "h2", "citacao", "figura"})
        self.assertEqual([n["n"] for n in comp["notas"]], [1])
        self.assertIn("ferramenta automática", comp["aviso"])
        if contrato:
            self.assertEqual(contrato.validar_historia(comp), [])

    def test_resolved_links(self):
        _, comp = self.compilar()
        links = {}
        for b in comp["blocos"]:
            for x in b.get("partes") or [] if b["t"] == "p" else []:
                if isinstance(x, dict) and "href" in x:
                    links.setdefault(x["href"], x)
        self.assertEqual(links["#/ato/lei-901-2020"]["texto"], "Lei n.º 901/2020, de 15 de outubro")  # first mention: the date
        self.assertIn("#/d/lei-teste/artigo-1?redacao=lei-901-2020&ver=mudou", links)
        self.assertIn("#/d/lei-teste/artigo-1?redacao=lei-901-2020&ver=origem", links)
        self.assertIn("#/quem/lei-teste?ir=governo-4", links)
        self.assertEqual(links["#/historia/teste?ir=fig-prazo"]["texto"], "figura 1")
        self.assertEqual(links["#/iniciativa/900101"]["texto"], "Proposta de Lei n.º 901/XIV")
        gov = [x for b in comp["blocos"] if b["t"] == "p" for x in b["partes"] if isinstance(x, dict) and x.get("partes")]
        self.assertEqual(gov[0]["partes"], [{"t": "governo", "numero": 4}])
        diff = next(b for b in comp["blocos"] if b["t"] == "figura" and b["tipo"] == "diff")
        self.assertEqual(diff["params"]["de_i"], 2)
        self.assertEqual(diff["params"]["para_i"], 3)
        self.assertEqual(diff["params"]["mostrar"], [{"n": "2", "al": None}])
        self.assertIn("2.ª redação", diff["sub"].replace("3.ª", "2.ª"))

    def test_lenient_withholds_the_figure_or_the_story(self):
        # An error inside a figure withholds only that figure.
        mau = HISTORIA.replace("mostrar: 2\n", "mostrar: 7\n")
        _, msgs, linhas = self.historia(mau, estrito=False)
        comp = self.ler("historias", "teste.json")
        fig = next(b for b in comp["blocos"] if b["t"] == "figura" and b["id"] == "prazo")
        self.assertTrue(fig["retida"])
        self.assertEqual(fig["params"], {})
        self.assertTrue(any(x["seccao"] == "prazo" for x in linhas))
        # An error in the prose withholds the whole story.
        _, msgs, linhas = self.historia(com_paragrafo("A [](ato:lei-999-2099) mudou tudo."), estrito=False)
        self.assertFalse(os.path.exists(os.path.join(self.out, "historias", "teste.json")))
        self.assertEqual(self.ler("historias", "index.json")["historias"], [])
        self.assertTrue(any(x["seccao"] is None and "lei-999-2099" in x["motivo"] for x in linhas))
        # Strict: the same errors are errors.
        _, msgs, _ = self.historia(mau, estrito=True)
        self.assertTrue(any("[R2]" in m for m in msgs if not m.startswith("aviso")))

    def test_r1_links(self):
        for mau, regra in (("[](ato:lei-999-2099)", "R1"), ("[](artigo:lei-teste/artigo-9)", "R1"),
                           ("[](artigo:lei-teste/artigo-2@lei-901-2020)", "R1"), ("[](iniciativa:123)", "R1"),
                           ("[](data:lei-902-2019.d_cm)", "R1"), ("[](fig:nada)", "R1"), ("[](grupo:xyz)", "R1"),
                           ("[](historia:outra)", "R1"), ("[](governo:99)", "R1")):
            with self.subTest(mau=mau):
                self.assertTrue(any(f"[{regra}]" in e for e in self.erros_de(com_paragrafo("Ver " + mau + "."))))

    def test_annex_copy_is_refused(self):
        d = self.ler("d", "lei-teste.json")
        d["copia"] = {"inicio": 2, "diploma": "outro", "rotulo": "Anexo"}
        self.gravar(d, "d", "lei-teste.json")
        erros = self.erros_de(com_paragrafo("Ver [](artigo:lei-teste/artigo-2)."))
        self.assertTrue(any("cópia" in e for e in erros), erros)

    def test_r2_figures(self):
        for antes, depois in (("mostrar: 2\n", "mostrar: 1\n"),            # nothing changed in n.º 1
                              ("para: lei-901-2020\n", "para: lei-902-2019\n"),
                              ("ato: lei-901-2020\nlegenda: O voto", "ato: decreto-lei-903-2012\nlegenda: O voto"),
                              ("marcar: lei-901-2020", "marcar: lei-902-2023"),
                              ("destacar: lei-901-2020", "destacar: lei-901-2022")):
            with self.subTest(depois=depois):
                h, _ = self.compilar(HISTORIA.replace(antes, depois))
                self.assertTrue(h.erros)
                self.assertTrue(all(f is not None for f, _ in h.erros), h.erros)

    def test_r3_designations(self):
        e = self.erros_de(com_paragrafo("A [Lei n.º 902/2019](ato:lei-901-2020) mudou o prazo."))
        self.assertTrue(any("[R3]" in x for x in e), e)
        e = self.erros_de(com_paragrafo("A [Lei n.º 901/2020](ato:lei-901-2020), de 3 de maio, mudou o prazo."))
        self.assertTrue(any("[R3]" in x for x in e), e)
        self.assertEqual(self.erros_de(com_paragrafo("A [Lei n.º 901/2020](ato:lei-901-2020), de 15 de outubro, mudou o prazo.")), [])

    def test_r4_first_mention_is_a_link(self):
        e = self.erros_de(com_paragrafo("A Lei n.º 902/2019 mudou o artigo 2.º[^dr]."))
        self.assertTrue(any("[R4]" in x for x in e), e)
        self.assertEqual(self.erros_de(com_paragrafo("A [](ato:lei-902-2019) mudou o artigo 2.º. A Lei n.º 902/2019 é curta[^dr].")), [])

    def test_r5_vote_claims(self):
        e = self.erros_de(com_paragrafo("Na generalidade, o PSD votou a favor da [](ato:lei-901-2020)."))
        self.assertTrue(any("[R5]" in x for x in e), e)
        self.assertEqual(self.erros_de(com_paragrafo("Na generalidade, o PSD votou contra a [](ato:lei-901-2020).")), [])
        self.assertEqual(self.erros_de(com_paragrafo("O Partido Socialista votou a favor da [](ato:lei-901-2020).")), [])
        e = self.erros_de(com_paragrafo("Na votação final global, o PSD votou contra a [](ato:lei-901-2020)."))
        self.assertTrue(any("[R5]" in x for x in e), e)
        self.assertEqual(self.erros_de(com_paragrafo("Na votação final global, o PSD votou contra a [](ato:lei-901-2020)[^dr].")), [])
        a = self.avisos_de(com_paragrafo("O PS votou a favor e o PSD votou contra a [](ato:lei-901-2020)."))
        self.assertTrue(any("[R5]" in x for x in a), a)

    def test_lock_and_staleness(self):
        self.escrever_fonte()
        self.assertEqual(historias.atualizar("teste", self.out, pasta=self.fontes), 0)
        lock = json.load(open(os.path.join(self.fontes, "teste.lock.json"), encoding="utf-8"))
        self.assertIn("lei-teste/artigo-1@lei-901-2020", lock["redacoes"])
        self.assertIn("lei-teste/artigo-1", lock["ultimas"])
        self.assertIn("lei-901-2020", lock["votos"])
        h, comp = self.compilar()
        self.assertEqual([a for a in h.avisos if re.search(r"\[S\d\]", a)], [])
        self.assertEqual(comp["desatualizada"], [])
        # A new redação of a cited article: S2, the Atenção lines, still no error.
        art = self.ler("d", "lei-teste", "artigo-1.json")
        nova = copy.deepcopy(art["versoes"][-1])
        nova.update(ato="lei-901-2030", publicacao="2030-01-01", vigor="2030-01-02")
        art["versoes"].append(nova)
        self.gravar(art, "d", "lei-teste", "artigo-1.json")
        h, comp = self.compilar()
        self.assertEqual(h.erros, [])
        self.assertTrue(any("[S2]" in a for a in h.avisos))
        self.assertEqual(comp["desatualizada"][0]["artigo"], "lei-teste/artigo-1")
        fig = next(b for b in comp["blocos"] if b["t"] == "figura" and b["id"] == "prazo")
        self.assertEqual(fig["aviso"]["tipo"], "redacao")
        # A changed text of a pinned redação: S1.
        art["versoes"].pop()
        art["versoes"][3]["linhas"] = [[[0, "1 — Outro texto."]], [[3, "2 — O prazo é de dez anos."]]]
        self.gravar(art, "d", "lei-teste", "artigo-1.json")
        h, comp = self.compilar()
        self.assertTrue(any("[S1]" in a for a in h.avisos))
        # Votes changed: S1 on the vote figure.
        p = self.ler("passagem.json")
        p["lei-901-2020"]["iniciativas"][0]["generalidade"]["grupos"]["PSD"] = "abstencao"
        self.gravar(p, "passagem.json")
        h, comp = self.compilar()
        voto = next(b for b in comp["blocos"] if b["t"] == "figura" and b["id"] == "voto")
        self.assertEqual(voto["aviso"]["tipo"], "votos")

    def test_lock_refuses_errors(self):
        self.escrever_fonte(com_paragrafo("A [](ato:lei-999-2099) mudou."))
        self.assertEqual(historias.atualizar("teste", self.out, pasta=self.fontes), 1)
        self.assertFalse(os.path.exists(os.path.join(self.fontes, "teste.lock.json")))

    def test_index_images_and_anchors(self):
        index, msgs, _ = self.historia()
        self.assertEqual([m for m in msgs if not m.startswith("aviso")], [])
        h = index["historias"][0]
        self.assertEqual(h["slug"], "teste")
        self.assertGreaterEqual(h["minutos"], 1)
        self.assertEqual(index["artigos"]["lei-teste/artigo-1"], [{"historia": "teste", "seccao": "fig-prazo"}])
        self.assertTrue(os.path.exists(os.path.join(self.out, "historias", "img", "pagina-exemplo.png")))
        if contrato:
            self.assertEqual(contrato.validar_historias_index(index), [])
        # Old outputs disappear.
        with open(os.path.join(self.out, "historias", "velha.json"), "w") as f:
            f.write("{}")
        self.historia()
        self.assertFalse(os.path.exists(os.path.join(self.out, "historias", "velha.json")))

    def test_share_page(self):
        self.historia()
        partilha.construir(self.out, False, fonte=self.partilha_src(), desenhar_imagens=False)
        pagina = open(os.path.join(self.tmp, "app", "p", "historia", "teste", "index.html"), encoding="utf-8").read()
        comp = self.ler("historias", "teste.json")
        self.assertIn(comp["aviso"], pagina)
        self.assertIn('property="og:type" content="article"', pagina)
        self.assertIn('property="article:published_time" content="2026-10-30"', pagina)
        self.assertIn('property="article:modified_time"', pagina)
        desc = re.search(r'og:description" content="([^"]+)"', pagina).group(1)
        self.assertTrue(desc.startswith("As alterações à Lei de teste"))
        self.assertTrue(desc.endswith("Preparada a 30 de outubro de 2026. Texto não oficial."))
        t = partilha.texto_historia({"titulo": "T", "resumo": "Uma frase. " + "palavra " * 60, "preparado_em": "2026-11-15"})
        self.assertLessEqual(len(t["descricao"]), 200)
        self.assertEqual(t["linhas"], ["T", "Uma frase", "Redação · 15 de novembro de 2026"])


class Sintaxe(unittest.TestCase):
    """The data-free checks (--sintaxe): no app/data needed."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        shutil.copytree(os.path.join(HISTORIAS_FIX, "img"), os.path.join(self.tmp, "img"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def check(self, texto, nome="teste"):
        p = os.path.join(self.tmp, nome + ".md")
        with open(p, "w", encoding="utf-8") as f:
            f.write(texto)
        return historias.sintaxe([p])

    def regras(self, texto, nome="teste"):
        erros, avisos = self.check(texto, nome)
        return {re.search(r"\[(\w+)\]", e).group(1) for e in erros}, {re.search(r"\[(\w+)\]", a).group(1) for a in avisos}

    def test_fixtures_are_clean(self):
        for nome in ("teste", "exemplo"):
            with self.subTest(nome=nome):
                erros, _ = historias.sintaxe([os.path.join(HISTORIAS_FIX, nome + ".md")])
                self.assertEqual(erros, [])

    def test_front_matter(self):
        self.assertIn("F1", self.regras(HISTORIA.replace("autoria: Redação\n", ""))[0])
        self.assertIn("F1", self.regras(HISTORIA, nome="outro")[0])                       # slug ≠ file name
        self.assertIn("F1", self.regras(HISTORIA.replace("data: 2026-10-30", "data: 30/10/2026"))[0])
        self.assertIn("F1", self.regras(HISTORIA.replace("preparacao: assistida", "preparacao: sozinha"))[0])
        self.assertIn("F1", self.regras(HISTORIA.replace("autoria: Redação", "autoria: Redação\ncor: azul"))[0])
        self.assertIn("F1", self.regras(HISTORIA.replace("resumo: As", "resumo: " + "x " * 170 + "As"))[0])
        self.assertIn("F1", self.regras(HISTORIA.replace("---\nslug", "slug"))[0])

    def test_markdown_subset(self):
        for mau in ("Um texto com <b>HTML</b>[^dr].", "Um texto em **negrito**[^dr].", "Veja https://dre.pt[^dr].",
                    "Veja [o DR](https://dre.pt)[^dr].", "Veja [isto](foo:bar).", "- uma lista", "| a | b |",
                    "# Título", "Veja [](artigo:lei-teste/artigo-1@hoje)."):
            with self.subTest(mau=mau):
                self.assertIn("F2", self.regras(com_paragrafo(mau))[0])
        for antes, depois in (("id: prazo\n", "id: prazo\ncor: azul\n"), ("```figura diff", "```figura mapa"),
                              ("mostrar: 2\n", "mostrar: dois\n"), ("id: ficha\n", "id: ficha\ncampos: tudo\n"),
                              ("largura: lado", "largura: enorme"), ("id: prazo\n", "id: prazo\nvista: lado\n")):
            with self.subTest(depois=depois):
                self.assertIn("F2", self.regras(HISTORIA.replace(antes, depois, 1))[0])

    def test_notes(self):
        self.assertIn("N1", self.regras(com_paragrafo("Um facto[^nada]."))[0])
        self.assertIn("N1", self.regras(HISTORIA + "[^solta]: Uma nota. https://dre.pt/x\n")[0])
        self.assertIn("N2", self.regras(HISTORIA.replace("I série. https://diariodarepublica.pt/dr/detalhe/lei/901-2020-900000", "I série."))[0])
        self.assertIn("N2", self.regras(HISTORIA.replace("I série. https://diariodarepublica.pt/dr/detalhe/lei/901-2020-900000", "I série. http://dre.pt/x"))[0])
        self.assertIn("N3", self.regras(HISTORIA.replace("I série. https://diariodarepublica.pt/dr/detalhe/lei/901-2020-900000", "I série. https://blog.exemplo.pt/x"))[1])
        self.assertIn("N4", self.regras(com_paragrafo("O texto diz «o prazo é de dez anos» e mais nada."))[0])
        self.assertNotIn("N4", self.regras(com_paragrafo("O texto diz «o prazo é de dez anos»[^dr]."))[0])
        self.assertIn("N4", self.regras(HISTORIA.replace("— Lei n.º 901/2020, artigo 1.º[^dr]", "— Lei n.º 901/2020, artigo 1.º"))[0])
        self.assertIn("N5", self.regras(com_paragrafo("Um parágrafo sem fonte."))[1])
        sem_data = HISTORIA.replace("consultado: 2026-10-30\n", "")
        self.assertIn("F1", self.regras(sem_data)[0])
        self.assertIn("N2", self.regras(sem_data)[0])

    def test_neutrality_vendor_and_motives(self):
        self.assertIn("P1", self.regras(com_paragrafo("O Parlamento chumbou a proposta[^dr]."))[0])
        self.assertNotIn("P1", self.regras(com_paragrafo("O jornal escreveu «o Parlamento chumbou a proposta»[^dr]."))[0])
        self.assertIn("P1", self.regras(HISTORIA.replace("titulo: Como mudou", "titulo: A geringonça e"))[0])
        self.assertIn("P2", self.regras(com_paragrafo("Feito com o " + codecs.decode("PungTCG", "rot13") + "[^dr]."))[0])
        self.assertIn("P2", self.regras(com_paragrafo("Ele disse «uso o " + codecs.decode("Pynhqr", "rot13") + "»[^dr]."))[0])
        self.assertIn("P3", self.regras(com_paragrafo("O Governo quis travar a lei[^dr]."))[1])
        self.assertNotIn("P3", self.regras(com_paragrafo("Na exposição de motivos, o Governo argumentou que a lei era polémica[^dr]."))[1])

    def test_lengths(self):
        legenda = ("legenda: O voto de cada grupo na generalidade da proposta, e depois a votação final global, o veto e a\n"
                   "  confirmação do decreto pelo Parlamento.")
        self.assertIn(legenda, HISTORIA)
        _, av = self.regras(HISTORIA.replace(legenda, "legenda: Curta demais."))
        self.assertIn("P4", av)
        _, av = self.regras(HISTORIA.replace("[](fig:pagina) mostra", "imagem mostra"))
        self.assertIn("P4", av)

    def test_image_checks(self):
        self.assertIn("R2", self.regras(HISTORIA.replace("img/pagina-exemplo.png", "img/nada.png"))[0])
        with open(os.path.join(self.tmp, "img", "grande.png"), "wb") as f:
            with open(os.path.join(HISTORIAS_FIX, "img", "pagina-exemplo.png"), "rb") as g:
                f.write(g.read() + b"\0" * 310000)
        self.assertIn("R2", self.regras(HISTORIA.replace("img/pagina-exemplo.png", "img/grande.png"))[0])
        self.assertEqual(historias.tamanho_imagem(os.path.join(HISTORIAS_FIX, "img", "pagina-exemplo.png")), ("png", 1400, 420))
        # imagem_partilha must be 1200×630
        self.assertIn("F1", self.regras(HISTORIA.replace("imagem_partilha:", "imagem_partilha: img/pagina-exemplo.png"))[0])

    def test_command_line(self):
        p = os.path.join(self.tmp, "teste.md")
        with open(p, "w", encoding="utf-8") as f:
            f.write(HISTORIA)
        self.assertEqual(historias.main(["--sintaxe", p]), 0)
        with open(p, "w", encoding="utf-8") as f:
            f.write(com_paragrafo("O Parlamento chumbou a proposta[^dr]."))
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(historias.main(["--sintaxe", p]), 1)
        self.assertIn("teste.md:", out.getvalue())


# ---------------------------------------------------------------------------------------------
# Glossary


class Glossario(Base):
    def construir(self, termos, estrito=False):
        p = os.path.join(self.tmp, "glossario-src.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"preparado_em": "2026-10-30", "termos": termos}, f, ensure_ascii=False)
        return glossario.construir(self.out, estrito, fonte=p)

    def termo(self, **mud):
        t = copy.deepcopy(TERMO)
        art = self.ler("d", "lei-teste", "artigo-3.json")
        t["hash_fonte"] = glossario.hash_texto(glossario.texto_versao(glossario.versao_hoje(art)))
        t.update(mud)
        return t

    def test_good_entry_is_published(self):
        built, msgs, _ = self.construir({"regime": self.termo()})
        self.assertEqual(msgs, [])
        self.assertIn("regime", built["termos"])
        self.assertIn("com ajuda de uma ferramenta automática", built["aviso"])
        if contrato:
            self.assertEqual(contrato.validar_glossario(built), [])
        for t in built["termos"].values():
            for d in t["definicao"]:
                self.assertEqual([x for x in estilo.check(d) if x[0] == "erro"], [])

    def test_bad_entries_are_left_out(self):
        casos = {
            "sem-fonte": self.termo(fonte=None),
            "excerto": self.termo(apoio=["O regime é sempre especial e nunca geral nem orgânico"]),
            "hash": self.termo(hash_fonte="sha256:velho"),
            "numero": self.termo(definicao=["O regime tem dois casos."]),
            "frases": self.termo(definicao=["O regime é o geral.", "Há a lei orgânica.", "Há o regulamento.", "Fim da regra."]),
            "curto": self.termo(apoio=["O regime é o geral"]),
        }
        for nome, t in casos.items():
            with self.subTest(nome=nome):
                t["id"] = nome
                built, msgs, linhas = self.construir({nome: t})
                self.assertNotIn(nome, built["termos"])
                self.assertTrue(msgs)
                self.assertEqual(linhas[0]["tipo"], "glossario")

    def test_old_spelling_is_folded(self):
        self.assertTrue(glossario.contem("A eficácia jurídica dos atos depende da publicação",
                                         "eficácia jurídica dos actos depende da"))
        self.assertTrue(glossario.contem("em efetividade de funções", "em efectividade de funções"))

    def test_strict_mode_reports_errors(self):
        _, msgs, _ = self.construir({"hash": self.termo(hash_fonte="sha256:velho")}, estrito=True)
        self.assertTrue(msgs)


class GlossarioFonte(unittest.TestCase):
    """The committed glossary source, without app/data: rules 4 and 5 and the shape."""

    def test_committed_entries(self):
        src = glossario.carregar()
        self.assertTrue(src.get("preparado_em"))
        for tid, t in src["termos"].items():
            with self.subTest(termo=tid):
                self.assertEqual(t["id"], tid)
                self.assertIn(t["grupo"], dict(glossario.GRUPOS))
                self.assertTrue(1 <= len(t["apoio"]) <= 3)
                self.assertTrue(t["fonte"].get("rota", "").startswith("#/d/") or t["fonte"].get("url", "").startswith("https://"))
                frases = [f for d in t["definicao"] for f in estilo.sentences(d)]
                self.assertLessEqual(len(frases), 3)
                for d in t["definicao"]:
                    self.assertEqual([x for x in estilo.check(d) if x[0] == "erro"], [])
                nums = glossario.numeros(" ".join(t["definicao"])) - set().union(*(glossario.numeros(a) for a in t["apoio"]))
                self.assertEqual(nums, set())
                self.assertTrue(t.get("hash_fonte", "").startswith("sha256:"))


# ---------------------------------------------------------------------------------------------
# Share pages


class Partilha(Base):
    TAGS = ("og:title", "og:image", "og:description", "og:url", "og:type", "og:locale", "og:site_name",
            "og:image:width", "og:image:height", "og:image:alt", "twitter:card")

    def construir(self, **kw):
        self.historia()
        return partilha.construir(self.out, kw.pop("estrito", False), fonte=self.partilha_src(kw.pop("artigos", None)),
                                  desenhar_imagens=kw.pop("imagens", False))

    def paginas(self):
        return sorted(glob.glob(os.path.join(self.tmp, "app", "p", "**", "index.html"), recursive=True))

    def test_pages_and_tags(self):
        built, msgs, _ = self.construir()
        self.assertEqual(msgs, [])
        if contrato:
            self.assertEqual(contrato.validar_partilha(built), [])
        self.assertEqual(built["artigos"]["lei-teste/artigo-2"],
                         ["decreto-lei-90001", "decreto-lei-902-2010", "lei-902-2019", "lei-901-2023"])
        self.assertIn("lei-teste/artigo-1", built["artigos"])  # cited by the story
        paginas = self.paginas()
        self.assertTrue(any("/p/historia/teste/" in p for p in paginas))
        self.assertTrue(any("/p/d/lei-teste/index.html" in p for p in paginas))
        for p in paginas:
            with self.subTest(p=p):
                src = open(p, encoding="utf-8").read()
                cab = src.encode("utf-8")[:4096].decode("utf-8", "ignore")
                metas = re.findall(r'<meta (?:property|name)="([^"]+)"', cab)
                self.assertEqual(metas[:3], ["og:title", "og:image", "og:description"])
                for t in self.TAGS:
                    self.assertIn(t, metas)
                self.assertIn('rel="canonical"', cab)
                self.assertNotIn("http-equiv", src)
                img = re.search(r'og:image" content="([^"]+)"', src).group(1)
                self.assertRegex(img, r"^https://.+\.png\?v=[0-9a-f]{12}$")
                desc = re.search(r'og:description" content="([^"]+)"', src).group(1)
                self.assertLessEqual(len(desc), 200)
                self.assertIn("Texto não oficial.", desc)
                self.assertRegex(desc, r"\d{1,2} de [a-zç]+ de \d{4}")
                url = re.search(r'og:url" content="([^"]+)"', src).group(1)
                rel = os.path.relpath(os.path.dirname(p), os.path.join(self.tmp, "app")).replace(os.sep, "/")
                alias = re.search(r"/p/ato/([^/]+)/index.html$", p)
                if alias and alias.group(1) in self.ler("index.json").get("aliases_atos", {}):
                    self.assertTrue(url.endswith(f"p/ato/{self.ler('index.json')['aliases_atos'][alias.group(1)]}/"))
                else:
                    self.assertTrue(url.endswith(rel + "/"), (url, rel))
                rota = re.search(r'location\.replace\("([^"]+)"\)', src).group(1)
                self.assertTrue(rota.endswith("de=partilha"))
                self.assertEqual(os.path.normpath(os.path.join(os.path.dirname(p), rota.split("#")[0])),
                                 os.path.join(self.tmp, "app"))
                self.assertRegex(rota, r"#/(historia|d|ato)/")

    def test_keys_are_stable_when_data_is_reordered(self):
        self.construir()
        antes = sorted(os.path.relpath(p, self.tmp) for p in self.paginas())
        atos = self.ler("atos.json")
        self.gravar(dict(reversed(list(atos.items()))), "atos.json")
        self.construir()
        self.assertEqual(sorted(os.path.relpath(p, self.tmp) for p in self.paginas()), antes)

    def test_repeated_act_key(self):
        art = {"versoes": [{"ato": "a"}, {"ato": "b"}, {"ato": "b"}, {"ato": "c"}]}
        self.assertEqual(partilha.chaves_de(art), ["a", "b", "b-2", "c"])

    def test_bad_list_entries(self):
        built, msgs, linhas = self.construir(artigos=[{"diploma": "lei-teste", "artigo": "artigo-2"},
                                                     {"diploma": "lei-teste", "artigo": "artigo-99", "motivo": "x"}],
                                             estrito=True)
        self.assertEqual(len([m for m in msgs if "sem motivo" in m or "desconhecido" in m]), 2)
        self.assertNotIn("lei-teste/artigo-99", built["artigos"])

    def test_committed_list(self):
        src = partilha.carregar()
        self.assertLessEqual(len(src["artigos"]), partilha.MAX_ARTIGOS)
        for x in src["artigos"]:
            self.assertTrue(x.get("motivo", "").strip(), x)
            self.assertEqual([e for e in estilo.check(x["motivo"]) if e[0] == "erro"], [], x)


@unittest.skipUnless(fixture_ok(), "sem a fixture partilhada")
class Imagens(unittest.TestCase):
    def setUp(self):
        if not TEM_PIL:
            if CI:
                self.fail("Pillow em falta com CI=true: instale pillow==11.3.0")
            self.skipTest("sem Pillow")
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    KINDS = {
        "artigo": ("Artigo", ["Lei da Nacionalidade · Artigo 6.º — Requisitos", "Redação dada pela Lei Orgânica n.º 1/2026",
                              "Em vigor desde 19 de maio de 2026"]),
        "diploma": ("Lei e código", ["Código do Imposto sobre o Rendimento das Pessoas Coletivas", "Lei n.º 2/2014, de 16 de janeiro de 2014",
                                     "Última alteração: Lei n.º 73-A/2025, 30 de dezembro de 2025"]),
        "historia": ("História", ["Como mudou a Lei da Nacionalidade desde 1981", "Uma história da Redação",
                                  "Preparada a 30 de outubro de 2026"]),
        "longo": ("Artigo", ["Código dos Regimes Contributivos do Sistema Previdencial de Segurança Social · Artigo 100.º-A — "
                             "Regime de contribuições muito longo para caber em três linhas de título no cartão", "x " * 60, "y"]),
    }

    def test_size_and_determinism(self):
        from PIL import Image
        for nome, (rot, linhas) in self.KINDS.items():
            with self.subTest(nome=nome):
                a, b = os.path.join(self.tmp, nome + "-a.png"), os.path.join(self.tmp, nome + "-b.png")
                partilha.desenhar(rot, linhas, a)
                partilha.desenhar(rot, linhas, b)
                self.assertEqual(open(a, "rb").read(), open(b, "rb").read())
                self.assertLessEqual(os.path.getsize(a), partilha.MAX_IMAGEM)
                with Image.open(a) as im:
                    self.assertEqual(im.size, (1200, 630))
                    self.assertNotIn("tIME", getattr(im, "info", {}))

    def test_diacritics_have_glyphs(self):
        from PIL import Image, ImageDraw, ImageFont

        def px(f, t):
            im = Image.new("L", (200, 100), 0)
            ImageDraw.Draw(im).text((10, 10), t, font=f, fill=255)
            return im.tobytes()
        for chave, fn in partilha.FONTES_PNG.items():
            f = ImageFont.truetype(os.path.join(partilha.FONTS, fn), 48)
            tofu = px(f, "\U0010FFFD")
            for c in "çãõéêºªÇÃÁÉÍÓÚâô·—«»":
                with self.subTest(fonte=chave, c=c):
                    self.assertNotEqual(px(f, c), tofu)
            # the accented form differs from the bare letters
            self.assertNotEqual(px(f, "ção"), px(f, "cao"))

    def test_layout_snapshot(self):
        # One coarse snapshot per kind: ink in the expected bands (headline, sub, date, rule, footer).
        from PIL import Image
        for nome in ("artigo", "diploma", "historia"):
            rot, linhas = self.KINDS[nome]
            p = os.path.join(self.tmp, nome + ".png")
            partilha.desenhar(rot, linhas, p)
            with Image.open(p) as im:
                g = im.convert("L")
                faixa = lambda y0, y1, x0=72, x1=1128: sum(1 for x in range(x0, x1, 3) for y in range(y0, y1, 3) if g.getpixel((x, y)) < 200)  # noqa: E731
                self.assertGreater(faixa(40, 80, 72, 260), 20, nome)        # «Redação»
                self.assertGreater(faixa(95, 160), 100, nome)                # headline
                self.assertEqual(faixa(345, 530), 0, nome)                   # nothing low in the card
                self.assertEqual(g.getpixel((600, 540)), 229, nome)         # the rule, #e3e6e4 in grey
                self.assertGreater(faixa(560, 600, 72, 900), 50, nome)      # footer
                self.assertEqual(faixa(0, 30, 0, 1200), 0, nome)             # margin


# ---------------------------------------------------------------------------------------------
# estilo.py


class Estilo(unittest.TestCase):
    def regras(self, texto):
        return {r for n, r, _ in estilo.check(texto) if n == "erro"}

    def test_neutrality_list(self):
        for mau in ("O Parlamento chumbou a lei.", "O Presidente travou o decreto.", "A lei do PS mudou o artigo.",
                    "A proposta do CH foi rejeitada.", "Texto escrito por PSD.", "O PS teve 40 % dos votos.",
                    "A maioria de esquerda aprovou.", "A oposição votou contra.", "A geringonça caiu.",
                    "Os vencedores e os derrotados.", "O Presidente deu luz verde.", "O Governo cortou 10 %."):
            with self.subTest(mau=mau):
                self.assertIn("8.2", self.regras(mau))

    def test_neutrality_in_js(self):
        hits = [c for c in estilo.extract_js("const a = 'O Parlamento chumbou a lei'; const b = 'Lei do PSD aprovada';")
                if {r for n, r, _ in estilo.check(c) if n == "erro"} & {"8.2"}]
        self.assertEqual(len(hits), 2)

    def test_quotations_are_allowed(self):
        self.assertNotIn("8.2", self.regras("O sumário diz «chumbou a proposta do PS»."))
        self.assertEqual(self.regras("A lei mudou o artigo sobre a união de facto."), set())

    def test_json_input(self):
        src = json.dumps({"titulo": "T", "seccoes": [{"paragrafos": ["A {ato:lei-1-2020|lei nova} mudou o {redacao:a/b@c}."]}],
                          "outro": "não é texto"})
        self.assertEqual(estilo.extract_json(src), ["T", "A X mudou o X."])

    def test_estilo_md_lists_the_same_words(self):
        doc = open(os.path.join(ROOT, "docs", "ESTILO.md"), encoding="utf-8").read()
        sec = doc[doc.index("### 8.2."):]
        palavras = ["chumbou", "travou", "luz verde", "maioria de esquerda", "maioria de direita", "geringonça",
                     "vencedores", "derrotados", "escrito por"]
        for w in palavras:
            with self.subTest(w=w):
                self.assertTrue(f"«{w}»" in sec, w)
        for w in ("oposição", "%"):
            self.assertIn(f"«{w}»", sec)

    @unittest.skipUnless(glob.glob(os.path.join(ROOT, "data", "parlamento", "InformacaoBase*_json.txt")), "sem data/")
    def test_sigla_constant_covers_the_ar_files(self):
        siglas = set()
        for f in glob.glob(os.path.join(ROOT, "data", "parlamento", "InformacaoBase*_json.txt")):
            d = json.load(open(f, encoding="utf-8"))
            for g in d.get("GruposParlamentares") or []:
                siglas.add(g.get("sigla"))
        self.assertEqual(siglas - set(estilo.SIGLAS) - {None}, set())


class FontesHistorias(unittest.TestCase):
    """The committed story sources, without app/data: the checks that CI runs (--sintaxe)."""

    def test_sources(self):
        for f in historias.fontes():
            with self.subTest(historia=os.path.basename(f)):
                erros, _ = historias.sintaxe([f])
                self.assertEqual(erros, [])


# ---------------------------------------------------------------------------------------------
# Real data (strict runs only; skipped without app/data or quem.json)


@unittest.skipUnless(ESTRITO and os.path.exists(os.path.join(APP_DATA, "quem.json")), "só em modo estrito, com app/data/quem.json")
class DadosReais(unittest.TestCase):
    def test_content_builds_without_errors(self):
        tmp = tempfile.mkdtemp()
        try:
            out = os.path.join(tmp, "app", "data")
            os.makedirs(out)
            for pasta in ("d", "quem", "grupos"):   # the story figures read quem/<slug>.json
                os.symlink(os.path.join(APP_DATA, pasta), os.path.join(out, pasta))
            for n in os.listdir(APP_DATA):
                if n.endswith(".json"):
                    shutil.copyfile(os.path.join(APP_DATA, n), os.path.join(out, n))
            cache = partilha.CACHE
            try:
                erros = conteudo.construir(out, True)
            finally:
                partilha.CACHE = cache
            self.assertEqual(erros, [])
            g = json.load(open(os.path.join(out, "glossario.json"), encoding="utf-8"))
            src = glossario.carregar()
            self.assertEqual(set(g["termos"]), set(src["termos"]))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
