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

HISTORIA = {
    "slug": "teste", "titulo": "Como mudou a Lei de teste", "resumo": "As alterações à Lei de teste, ato a ato.",
    "preparado_em": "2026-10-30", "preparacao": "assistida", "revisao_externa": None,
    "ambito": {"desde": "1970-03-02", "diplomas": [{"slug": "lei-teste", "artigos": "todos"}]},
    "seccoes": [
        {"id": "em-cinco-frases", "tipo": "resumo", "paragrafos": ["A Lei de teste é o {ato:decreto-lei-90001}."]},
        {"id": "nesta-historia", "tipo": "perguntas", "itens": [{"texto": "Qual é o prazo?", "alvo": "prazo"},
                                                                {"texto": "Quem fez cada mudança?", "alvo": "todas"}]},
        {"id": "prazo", "tipo": "mudanca", "atos": ["lei-901-2020"], "subtitulo": None, "paragrafos": [
            "A {ato:lei-901-2020} mudou o {comparar:lei-teste/artigo-1@lei-901-2020|artigo sobre o objeto}. "
            "Na redação nova, diz: {citacao:lei-teste/artigo-1@lei-901-2020#2}.",
            "Propôs a lei {governo:lei-901-2020}. Veja a votação: {voto:lei-901-2020/generalidade} {vfg:lei-901-2020}",
            "O Presidente da República, {presidente:lei-901-2020}, promulgou a lei a {data:lei-901-2020.promulgacao}. "
            "A lei saiu a {data:lei-901-2020.publicacao}, com a {iniciativa:900101}.",
            "O {redacao:lei-teste/artigo-1@lei-901-2020|texto} tem esta fonte: "
            "{fonte:https://diariodarepublica.pt/dr/detalhe/lei/901-2020-900000@2026-10-30|«O prazo é de dez anos»}."],
         "mostrar": ["lei-teste/artigo-1@lei-901-2020"],
         "tabela": {"diploma": "lei-teste", "artigo": "artigo-1", "numero": "2", "alinea": None},
         "fontes_iniciativas": []},
        {"id": "regime", "tipo": "mudanca", "atos": ["lei-organica-901-2018"], "subtitulo": None, "paragrafos": [
            "A {ato:lei-organica-901-2018} mudou o {comparar:lei-teste/artigo-3@lei-organica-901-2018|artigo sobre o regime}."],
         "mostrar": [], "tabela": None, "fontes_iniciativas": []},
        {"id": "hoje", "tipo": "hoje", "artigos": ["lei-teste/artigo-1"], "pendentes": [], "paragrafos": []},
        {"id": "o-que-nao-diz", "tipo": "limites", "paragrafos": ["Não trata outros diplomas."]},
        {"id": "como-fizemos", "tipo": "metodo", "paragrafos": ["Usamos os dados do site."], "correcoes": []},
    ],
}

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

    def historia(self, src=None, estrito=True):
        src = src or HISTORIA
        with open(os.path.join(self.fontes, src["slug"] + ".json"), "w", encoding="utf-8") as f:
            json.dump(src, f, ensure_ascii=False)
        return historias.construir(self.out, estrito, pasta=self.fontes)

    def compilar(self, src):
        h = historias.Historia(src, historias.Dados(self.out))
        return h, h.compilar()

    def erros_de(self, src):
        h, _ = self.compilar(src)
        return [e for _, e in h.erros]

    def partilha_src(self, artigos=None):
        p = os.path.join(self.tmp, "partilha-src.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"base": "https://andre15silva.github.io/pt-legal-git/",
                       "artigos": artigos if artigos is not None else
                       [{"diploma": "lei-teste", "artigo": "artigo-2", "motivo": "Os requisitos."}]}, f)
        return p

    def com_paragrafo(self, texto, seccao="prazo"):
        src = copy.deepcopy(HISTORIA)
        for s in src["seccoes"]:
            if s["id"] == seccao:
                s["paragrafos"] = [texto]
        return src


# ---------------------------------------------------------------------------------------------
# Stories


class Referencias(Base):
    def test_every_reference_type_resolves(self):
        h, comp = self.compilar(HISTORIA)
        self.assertEqual(h.erros, [])
        tipos = {s["t"] for sec in comp["seccoes"] for p in sec.get("paragrafos", []) for s in p if isinstance(s, dict)}
        self.assertEqual(tipos, {"ato", "comparar", "citacao", "governo", "voto", "vfg", "presidente", "data",
                                 "iniciativa", "redacao", "fonte"})
        prazo = next(s for s in comp["seccoes"] if s["id"] == "prazo")
        cit = next(s for s in prazo["paragrafos"][0] if isinstance(s, dict) and s["t"] == "citacao")
        self.assertIn("contados da", cit["texto"])
        self.assertEqual(prazo["mostrar"][0]["numero"], "2")
        self.assertEqual([l["ato"] for l in prazo["tabela"]["linhas"]][:2], ["decreto-lei-90001", "decreto-lei-90002"])
        if contrato:
            self.assertEqual(contrato.validar_historia(comp), [])

    def test_first_mention_has_the_date(self):
        _, comp = self.compilar(HISTORIA)
        textos = [s["texto"] for sec in comp["seccoes"] for p in sec.get("paragrafos", []) for s in p
                  if isinstance(s, dict) and s.get("t") == "ato" and s["id"] == "lei-901-2020"]
        self.assertTrue(textos[0].startswith("Lei n.º 901/2020, de "))

    def assert_falha(self, texto, nome):
        src = self.com_paragrafo(texto)
        erros = self.erros_de(src)
        self.assertTrue(any(nome in e for e in erros), erros)
        # lenient: the section is withheld, not the story
        _, msgs, linhas = self.historia(src, estrito=False)
        comp = json.load(open(os.path.join(self.out, "historias", "teste.json"), encoding="utf-8"))
        prazo = next(s for s in comp["seccoes"] if s["id"] == "prazo")
        self.assertTrue(prazo["retida"])
        self.assertTrue(any(x["seccao"] == "prazo" for x in linhas))

    def test_unknown_act(self):
        self.assert_falha("A {ato:lei-999-2099} mudou o {comparar:lei-teste/artigo-1@lei-901-2020}.", "lei-999-2099")

    def test_unknown_redacao(self):
        self.assert_falha("A {ato:lei-901-2020} mudou o {comparar:lei-teste/artigo-2@lei-901-2020}.", "lei-teste/artigo-2")

    def test_governo_null(self):
        self.assert_falha("Aprovou-o {governo:decreto-lei-903-2012}, com o {redacao:lei-teste/artigo-3@decreto-lei-903-2012}.",
                          "decreto-lei-903-2012")

    def test_annex_copy_is_refused(self):
        d = self.ler("d", "lei-teste.json")
        d["copia"] = {"inicio": 2, "diploma": "outro", "rotulo": "Anexo"}
        self.gravar(d, "d", "lei-teste.json")
        src = self.com_paragrafo("A {ato:lei-902-2019} mudou o {comparar:lei-teste/artigo-2@lei-902-2019}.")
        src["seccoes"] = [s for s in src["seccoes"] if s["id"] != "regime"]
        self.assertTrue(any("cópia" in e for e in self.erros_de(src)))


class Lints(Base):
    def erros(self, texto, seccao="prazo"):
        return self.erros_de(self.com_paragrafo(texto, seccao))

    def test_prose_lints(self):
        base = "A {ato:lei-901-2020} mudou o {comparar:lei-teste/artigo-1@lei-901-2020}"
        for mau in (" em 2020.", " em maio.", " no n.º dois.", ", com o PS.", ". Os grupos votaram {voto:lei-901-2020/generalidade}.",
                    ", com dez anos de prazo.", " e reduziu o prazo.", " por causa da {iniciativa:900101}.",
                    ". O Parlamento chumbou a {iniciativa:900101}.", ". Escrevemos com o " + codecs.decode("PungTCG", "rot13") + " a {iniciativa:900101}."):
            with self.subTest(mau=mau):
                self.assertTrue(self.erros(base + mau), mau)

    def test_quoted_source_is_allowed(self):
        bom = ("A {ato:lei-901-2020} tem esta fonte: "
               "{fonte:https://diariodarepublica.pt/dr/detalhe/lei/901-2020@2026-10-30|«O PS votou e chumbou dez anos em maio de 2020»}.")
        self.assertEqual(self.erros(bom), [])

    def test_manual_quote_is_refused(self):
        self.assertTrue(self.erros("A {ato:lei-901-2020} diz «dez anos»."))

    def test_sentence_without_reference(self):
        self.assertTrue(any("[3]" in e for e in self.erros("A lei mudou muito.")))
        self.assertEqual(self.erros("A lei ficou como estava.", seccao="como-fizemos"), [])

    def test_verb_must_match_the_redacao(self):
        e = self.erros("A {ato:lei-901-2020} revogou o {redacao:lei-teste/artigo-1@lei-901-2020}.")
        self.assertTrue(any("[14]" in x for x in e), e)
        e = self.erros("A {ato:lei-901-2020} alterou o {redacao:lei-teste/artigo-1@lei-901-2020}.")
        self.assertTrue(any("[14]" in x for x in e), e)

    def test_quoting_one_initiative_needs_all(self):
        src = copy.deepcopy(HISTORIA)
        src["seccoes"].insert(3, {
            "id": "comissao", "tipo": "mudanca", "atos": ["lei-902-2019"], "mostrar": [], "tabela": None,
            "fontes_iniciativas": ["900201"],
            "paragrafos": ["A {ato:lei-902-2019} mudou o {comparar:lei-teste/artigo-2@lei-902-2019}. "
                           "A {iniciativa:900201} diz: {fonte:https://www.parlamento.pt/x?BID=900201@2026-10-30|«Texto»}."]})
        self.assertTrue(any("[15]" in e for e in self.erros_de(src)))

    def test_missing_preparado_em(self):
        src = copy.deepcopy(HISTORIA)
        del src["preparado_em"]
        self.assertTrue(any("[12]" in e for e in self.erros_de(src)))
        _, msgs, _ = self.historia(src, estrito=False)
        self.assertFalse(os.path.exists(os.path.join(self.out, "historias", "teste.json")))

    def test_vendor_name_anywhere(self):
        src = copy.deepcopy(HISTORIA)
        src["seccoes"][-1]["paragrafos"] = ["Preparado com o " + codecs.decode("Pynhqr", "rot13") + "."]
        self.assertTrue(any("[6]" in e for e in self.erros_de(src)))

    def test_question_without_section(self):
        src = copy.deepcopy(HISTORIA)
        src["seccoes"][1]["itens"].append({"texto": "E depois?", "alvo": "nada"})
        self.assertTrue(any("[7]" in e for e in self.erros_de(src)))


class DadosDaHistoria(Base):
    def test_votes_come_from_the_data(self):
        # R-37: the compiled story holds no vote; the app reads it from passagem.json, so a changed vote
        # changes the story without an edit. Without the vote, the reference fails.
        _, comp = self.compilar(HISTORIA)
        txt = json.dumps(comp, ensure_ascii=False)
        for sentido in ("favor", "contra", "abstencao"):
            self.assertNotIn(f'"{sentido}"', txt)
        p = self.ler("passagem.json")
        p["lei-901-2020"]["generalidade"] = []
        p["lei-901-2020"]["iniciativas"] = [dict(i, generalidade=None) for i in p["lei-901-2020"]["iniciativas"]]
        p["lei-901-2020"]["texto_comissao"] = []
        self.gravar(p, "passagem.json")
        self.assertTrue(any("votação na generalidade" in e for e in self.erros_de(HISTORIA)))

    def test_staleness(self):
        h, _ = self.compilar(HISTORIA)
        src = copy.deepcopy(HISTORIA)
        src["hashes"] = h.hashes_atuais
        h2, comp = self.compilar(src)
        prazo = next(s for s in comp["seccoes"] if s["id"] == "prazo")
        self.assertFalse(prazo["desatualizada"])
        art = self.ler("d", "lei-teste", "artigo-1.json")
        nova = copy.deepcopy(art["versoes"][-1])
        nova.update(ato="lei-901-2030", publicacao="2030-01-01", vigor="2030-01-02")
        art["versoes"].append(nova)
        self.gravar(art, "d", "lei-teste", "artigo-1.json")
        _, comp = self.compilar(src)
        prazo = next(s for s in comp["seccoes"] if s["id"] == "prazo")
        self.assertTrue(prazo["desatualizada"])
        # a changed text also marks it
        art["versoes"].pop()
        art["versoes"][3]["linhas"] = [[[0, "1 — Outro texto."]]]
        self.gravar(art, "d", "lei-teste", "artigo-1.json")
        _, comp = self.compilar(src)
        self.assertTrue(next(s for s in comp["seccoes"] if s["id"] == "prazo")["desatualizada"])

    def test_completeness(self):
        _, comp = self.compilar(HISTORIA)
        todas = next(s for s in comp["seccoes"] if s["id"] == "todas")["atos"]
        # An independent query over d/lei-teste/*.json.
        esperado = set()
        for f in glob.glob(os.path.join(self.out, "d", "lei-teste", "*.json")):
            art = json.load(open(f, encoding="utf-8"))
            esperado |= {v["ato"] for v in art["versoes"] if v["tipo"] not in ("original", "sem_alteracao")}
            esperado |= {n["ato"] for n in art.get("notas", []) if n.get("ato")}
        self.assertEqual(set(todas), esperado)
        self.assertIn("acordao-do-tribunal-constitucional-9001-2021", todas)
        self.assertIn("declaracao-de-retificacao-901-2020", todas)

    def test_aviso_everywhere(self):
        index, _, _ = self.historia()
        comp = self.ler("historias", "teste.json")
        self.assertIn("com ajuda de uma ferramenta automática", comp["aviso"])
        self.assertEqual(index["historias"][0]["aviso"], comp["aviso"])
        partilha.construir(self.out, False, fonte=self.partilha_src(), desenhar_imagens=False)
        pagina = open(os.path.join(self.tmp, "app", "p", "historia", "teste", "index.html"), encoding="utf-8").read()
        self.assertIn(comp["aviso"], pagina)
        if contrato:
            self.assertEqual(contrato.validar_historias_index(index), [])



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

    def test_story_lints(self):
        r = lambda t: {x for _, x, _ in estilo.check_historia(t)}  # noqa: E731
        self.assertIn("H2", r("Em 2020 a lei mudou."))
        self.assertIn("H2", r("O PS apresentou X."))
        self.assertIn("H2b", r("A lei reduziu o prazo."))
        self.assertIn("H4", r("Uma lei mais dura."))
        self.assertEqual(r("A X mudou o X. Na redação nova, diz: X."), set())

    def test_json_input(self):
        src = json.dumps({"titulo": "T", "seccoes": [{"paragrafos": ["A {ato:lei-1-2020|lei nova} mudou o {redacao:a/b@c}."]}],
                          "outro": "não é texto"})
        self.assertEqual(estilo.extract_json(src), ["T", "A X mudou o X."])

    def test_estilo_md_lists_the_same_words(self):
        doc = open(os.path.join(ROOT, "docs", "ESTILO.md"), encoding="utf-8").read()
        sec = doc[doc.index("### 8.2."):]
        palavras = list(estilo.VOTO) + list(estilo.UNIDADES) + [w for w in estilo.COMPARATIVAS]
        palavras += ["chumbou", "travou", "luz verde", "maioria de esquerda", "maioria de direita", "geringonça",
                     "vencedores", "derrotados", "mais dura", "histórica", "restritiv-", "generos-", "polémic-",
                     "controvers-", "escrito por", "dois", "vinte", "trinta", "mil", "primeiro", "décimo", "metade"]
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
    """The committed story sources, without app/data: prose lints, sentence references, structure."""

    def test_sources(self):
        vazio = tempfile.mkdtemp()
        try:
            for f in historias.fontes():
                src = json.load(open(f, encoding="utf-8"))
                with self.subTest(historia=os.path.basename(f)):
                    self.assertTrue(src.get("preparado_em"))
                    self.assertEqual(src.get("preparacao"), "assistida")
                    self.assertIsNone(historias.VENDOR.search(json.dumps(src, ensure_ascii=False)))
                    h = historias.Historia(src, historias.Dados(vazio))
                    ids = [s["id"] for s in src["seccoes"]]
                    for s in src["seccoes"]:
                        for p in s.get("paragrafos", []):
                            erros = [e for e in h.lint_paragrafo(p, s["tipo"], s["id"]) if not e.startswith("[14]")]
                            self.assertEqual(erros, [], (s["id"], p[:80]))
                        for it in s.get("itens", []):
                            self.assertIn(it["alvo"], ids + ["todas", "em-numeros"])
                    palavras = sum(estilo.word_count(h.prosa(p)) for s in src["seccoes"] for p in s.get("paragrafos", []))
                    self.assertTrue(400 <= palavras <= 800, palavras)
                    self.assertTrue(src.get("hashes"))
        finally:
            shutil.rmtree(vazio)


# ---------------------------------------------------------------------------------------------
# Real data (strict runs only; skipped without app/data or quem.json)


@unittest.skipUnless(ESTRITO and os.path.exists(os.path.join(APP_DATA, "quem.json")), "só em modo estrito, com app/data/quem.json")
class DadosReais(unittest.TestCase):
    def test_content_builds_without_errors(self):
        tmp = tempfile.mkdtemp()
        try:
            out = os.path.join(tmp, "app", "data")
            os.makedirs(out)
            os.symlink(os.path.join(APP_DATA, "d"), os.path.join(out, "d"))
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
