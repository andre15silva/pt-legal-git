"""Tests for who made each act: python -I -m unittest discover -s pipeline

Unit tests always run (fixtures and the committed tables and seed). Real-data tests carry @estrito:
they run only with REDACAO_ESTRITO=1 (push builds, checks.yml) and skip when app/data/ is absent.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from types import SimpleNamespace as N

AQUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assinaturas  # noqa: E402
import atos  # noqa: E402
import build  # noqa: E402
import contrato  # noqa: E402
import passagem  # noqa: E402
import quem  # noqa: E402
from parlamento import parse_positions  # noqa: E402

FIXTURE = os.path.join(AQUI, "fixtures", "contrato", "app-data")
APP_DATA = os.path.join(ROOT, "app", "data")
ESTRITO = os.environ.get("REDACAO_ESTRITO") == "1"


def estrito(cls_or_fn):
    """Real-data acceptance tests: strict mode only, and only when app/data/ was built."""
    if not ESTRITO:
        return unittest.skip("só em modo estrito (REDACAO_ESTRITO=1)")(cls_or_fn)
    if not os.path.exists(os.path.join(APP_DATA, "quem.json")):
        return unittest.skip("app/data/ não existe: corra pipeline/build.py")(cls_or_fn)
    return cls_or_fn


def ler(*p):
    with open(os.path.join(*p), encoding="utf-8") as fh:
        return json.load(fh)


# ---- The shared contract -------------------------------------------------------------------------
class Contrato(unittest.TestCase):
    def test_fixture_is_valid(self):
        self.assertEqual(contrato.validar_pasta(FIXTURE, completo=True), [])

    def test_validator_catches_errors(self):
        q = ler(FIXTURE, "quem.json")
        q["decreto-lei-903-2012"]["motivos"] = {"governo": "inventado"}
        self.assertTrue(contrato.validar_quem(q))
        p = ler(FIXTURE, "passagem.json")
        p["lei-901-2020"]["vfg"]["grupos"]["Ausência: PS"] = "abstencao"
        self.assertTrue(any("Ausência" in e for e in contrato.validar_passagem(p)))
        g = ler(FIXTURE, "governos.json")
        g["governos"][1]["fim"] = "2010-05-01"
        self.assertTrue(any("≠ início" in e for e in contrato.validar_governos(g)))


# ---- Signature blocks (R-10) -----------------------------------------------------------------------
DL = """Artigo 8.º
Entrada em vigor
O presente diploma entra em vigor 30 dias após a data da sua publicação.
Visto e aprovado em Conselho de Ministros de 16 de Julho de 2003. - José Manuel Durão Barroso - Maria Manuela Dias Ferreira Leite - João Luís Mota de Campos.
Promulgado em 6 de Agosto de 2003.
Publique-se.
O Presidente da República, JORGE SAMPAIO.
Referendado em 8 de Agosto de 2003.
O Primeiro-Ministro, José Manuel Durão Barroso.
ANEXO
Republicação
Visto e aprovado em Conselho de Ministros de 1 de Março de 2001. - Outro Nome.
Promulgado em 2 de Abril de 2001."""
LEI_OUTRO = """Artigo 10.º
Entrada em vigor
A presente lei entra em vigor 30 dias após a sua publicação.
Aprovada em 3 de julho de 2015.
A Presidente da Assembleia da República, Maria da Assunção A. Esteves.
Promulgada em 12 de agosto de 2015.
Publique-se.
O Presidente da República, Aníbal Cavaco Silva.
Referendada em 17 de agosto de 2015.
Pelo Primeiro-Ministro, Paulo Sacadura Cabral Portas, Vice-Primeiro-Ministro."""
PRE = """ARTIGO 2.º Este diploma entra em vigor no dia seguinte.
Publique-se e cumpra-se como nele se contém.
Paços do Governo da República, 25 de Novembro de 1966. - AMÉRICO DEUS RODRIGUES THOMAZ - António de Oliveira Salazar - João de Matos Antunes Varela.
Para ser presente à Assembleia Nacional."""
ACORDAO = "… (Lisboa, Verbo, 1992, p. 3). Pelo exposto, o Tribunal decide declarar … Lisboa, 16 de junho de 2020. - Juiz A - Juiz B."


class Blocos(unittest.TestCase):
    def test_full_dl_block_and_first_block_only(self):
        r = assinaturas.ler_bloco(DL, "decreto-lei", "2003-08-23")
        self.assertEqual((r["d_cm"], r["d_promulgacao"], r["presidente_nome"], r["d_referenda"], r["referenda_nome"]),
                         ("2003-07-16", "2003-08-06", "JORGE SAMPAIO", "2003-08-08", "José Manuel Durão Barroso"))
        self.assertEqual(r["cm_signatarios"][0], "José Manuel Durão Barroso")
        self.assertEqual(r["bloco"], "pos1976")
        self.assertEqual(r["estado"]["ordem"], "ok")

    def test_pelo_primeiro_ministro_and_lei(self):
        r = assinaturas.ler_bloco(LEI_OUTRO, "lei", "2015-08-24")
        self.assertTrue(r["referenda_por_outro"])
        self.assertEqual(r["referenda_nome"], "Paulo Sacadura Cabral Portas")
        self.assertEqual((r["d_aprovacao_ar"], r["pres_ar"]), ("2015-07-03", "Maria da Assunção A. Esteves"))
        self.assertEqual(r["estado"]["d_cm"], "nao_aplicavel")

    def test_place_before_date(self):
        t = "Promulgado em Castanheira de Pêra em 17 de agosto de 2017.\nPublique-se.\nO Presidente da República, Marcelo Rebelo de Sousa.\nReferendado em Castanheira de Pêra em 17 de agosto de 2017."
        r = assinaturas.ler_bloco(t, "decreto-lei", "2017-08-30")
        self.assertEqual((r["d_promulgacao"], r["d_referenda"]), ("2017-08-17", "2017-08-17"))

    def test_pre1976(self):
        r = assinaturas.ler_bloco(PRE, "pre1976", "1966-11-25")
        self.assertEqual(r["bloco"], "pre1976")
        self.assertIn("João de Matos Antunes Varela", r["signatarios_pre1976"])

    def test_acordao_decision_date(self):
        r = assinaturas.ler_bloco(ACORDAO, "acordao-tc", "2020-09-18")
        self.assertEqual((r["bloco"], r["d_decisao"]), ("acordao", "2020-06-16"))

    def test_year_typo_is_suspect(self):
        t = LEI_OUTRO.replace("Referendada em 17 de agosto de 2015", "Referendada em 17 de agosto de 2014")
        r = assinaturas.ler_bloco(t, "lei", "2015-08-24")
        self.assertEqual(r["estado"]["ordem"], "suspeito")
        self.assertEqual(r["estado"]["d_referenda"], "suspeito")
        self.assertEqual(r["estado"]["d_promulgacao"], "ok")

    def test_dates(self):
        self.assertEqual(assinaturas.data_pt("1", "Março", "1990"), "1990-03-01")
        r = assinaturas.ler_bloco("Promulgada em 1.º de Agosto de 1990.\nO Presidente da República, MÁRIO SOARES.", "lei", "1990-08-10")
        self.assertEqual(r["d_promulgacao"], "1990-08-01")

    def test_transitional_articles(self):
        t = ("Artigo 1.º\nObjeto\nA presente lei altera.\n«Artigo 5.º\nNorma transitória\n(texto citado)»\n"
             "Artigo 7.º\nAplicação no tempo\nAplica-se.\nArtigo 11.º\nDisposição transitória\nAté lá.\nAprovada em 1 de março de 2012.")
        self.assertEqual(assinaturas.transitorias(t), [{"artigo": "7.º", "epigrafe": "Aplicação no tempo"},
                                                        {"artigo": "11.º", "epigrafe": "Disposição transitória"}])
        self.assertEqual(assinaturas.transitorias("Artigo 1.º\nObjeto\nNada."), [])


# ---- The tables (R-11, R-12) ---------------------------------------------------------------------
class Tabelas(unittest.TestCase):
    def setUp(self):
        self.g = ler(AQUI, "governos.json")
        self.p = ler(AQUI, "presidentes.json")
        self.grupos = ler(AQUI, "grupos.json")

    def test_governments_contiguous_and_sourced(self):
        gs = self.g["governos"]
        self.assertEqual([g["numero"] for g in gs], list(range(1, 26)))
        for a, b in zip(gs, gs[1:]):
            self.assertEqual(a["fim"], b["inicio"])
            self.assertLess(a["inicio"], a["fim"])
        self.assertIsNone(gs[-1]["fim"])
        familias = set(self.grupos["familias"]) | {"ps", "ppm"}
        for g in gs:
            self.assertTrue(g["fontes"]["inicio"].startswith("https://"), g["numero"])
            self.assertTrue(g["fontes"]["primeiro_ministro"].startswith("https://"))
            if g["fim"]:
                self.assertTrue(g["fontes"]["fim"].startswith("https://"))
            if g["partidos"] is not None:
                self.assertTrue(set(g["partidos"]) <= familias, g["partidos"])
                if g["partidos"]:
                    self.assertTrue(g["fontes"]["partidos"].startswith("https://"))
                else:
                    self.assertTrue(g["nota_partidos"]["fonte"].startswith("https://"))
            for x in g["em_gestao"]:
                self.assertTrue(g["inicio"] <= x["inicio"] and (g["fim"] is None or x["fim"] <= g["fim"]))

    def test_parties_of_governments_xvii_to_xxv(self):
        # D-3: only parties with ministers. Parliamentary support (XXI) and an electoral partner without
        # ministers (PPM in the AD, XXIV) go in nota_partidos, never in partidos.
        gs = {g["romano"]: g for g in self.g["governos"]}
        self.assertTrue(all(g["partidos"] is not None for g in gs.values()))
        self.assertEqual(gs["XXI"]["partidos"], ["ps"])
        self.assertEqual(gs["XIX"]["partidos"], ["psd", "cds-pp"])
        esperado = {"XVII": ["ps"], "XVIII": ["ps"], "XX": ["psd", "cds-pp"], "XXII": ["ps"], "XXIII": ["ps"],
                    "XXIV": ["psd", "cds-pp"], "XXV": ["psd", "cds-pp"]}
        for r, ps in esperado.items():
            self.assertEqual(gs[r]["partidos"], ps, r)
            self.assertTrue(gs[r]["fontes"]["partidos"].startswith("https://"), r)
        self.assertEqual(gs["XXI"]["nota_partidos"]["texto"], "apoio_parlamentar")
        self.assertEqual(gs["XXI"]["nota_partidos"]["partidos"], ["be", "pcp", "pev"])
        self.assertEqual(gs["XXIV"]["nota_partidos"]["texto"], "coligacao_eleitoral")
        self.assertEqual(gs["XXIV"]["nota_partidos"]["partidos"], ["ppm"])
        for g in gs.values():
            n = g["nota_partidos"]
            if n is not None:
                self.assertTrue(n["fonte"].startswith("https://"), g["romano"])
                self.assertFalse(set(n.get("partidos") or []) & set(g["partidos"]), g["romano"])

    def test_presidents_contiguous_and_sourced(self):
        ps = self.p["presidentes"]
        for a, b in zip(ps, ps[1:]):
            self.assertEqual(a["fim"], b["inicio"])
        self.assertIsNone(ps[-1]["fim"])
        self.assertTrue(all(p["fonte"].startswith("https://") for p in ps))
        self.assertEqual(ps[0]["id"], "francisco-da-costa-gomes")  # promulgated the Decreto de Aprovação da Constituição

    def test_grafia_only_fixes_case_and_accents(self):
        for a, b in self.grupos["grafia"].items():
            self.assertEqual(quem.dobrar(a), quem.dobrar(b))

    def test_seed_agrees_with_the_tables(self):
        """R-13 on the committed seed: no President or Prime Minister name contradicts a closed row."""
        t = quem.Tabelas()
        sig = assinaturas.ler(assinaturas.SEMENTE)["atos"]
        conflitos = []
        for aid, e in sig.items():
            st = e.get("estado") or {}
            if e.get("presidente_nome") and st.get("d_promulgacao") == "ok" and not e.get("presidente_interino"):
                p = t.presidente(e["d_promulgacao"])
                if p and p["fim"] and not t.nome_igual(e["presidente_nome"], p["nomes_dr"]):
                    conflitos.append((aid, "presidente"))
            if e.get("referenda_nome") and st.get("d_referenda") == "ok" and not e.get("referenda_por_outro"):
                g = t.governo(e["d_referenda"])
                if g and g["fim"] and not t.nome_igual(e["referenda_nome"], g["nomes_dr"]):
                    conflitos.append((aid, "referenda"))
        self.assertEqual(conflitos, [])

    def test_seed_shape(self):
        sig = assinaturas.ler(assinaturas.SEMENTE)
        self.assertEqual(sig["versao"], 1)
        e = sig["atos"]["decreto-lei-194-2003"]
        self.assertEqual((e["d_cm"], e["d_promulgacao"], e["presidente_nome"]), ("2003-07-16", "2003-08-06", "JORGE SAMPAIO"))
        self.assertNotIn("Texto", e)


# ---- Matching an act to a Government and a President (§2.6) --------------------------------------
T_G = {"governos": [
    {"numero": 1, "romano": "I", "inicio": "1976-07-23", "fim": "2000-01-01", "primeiro_ministro": "PM A", "nomes_dr": ["PM A"], "partidos": ["ps"], "em_gestao": []},
    {"numero": 2, "romano": "II", "inicio": "2000-01-01", "fim": "2005-01-10", "primeiro_ministro": "PM B", "nomes_dr": ["PM B"], "partidos": ["ps"], "em_gestao": []},
    {"numero": 3, "romano": "III", "inicio": "2005-01-10", "fim": None, "primeiro_ministro": "PM B", "nomes_dr": ["PM B"], "partidos": ["ps"], "em_gestao": []}]}
T_P = {"presidentes": [{"id": "p1", "nome": "P Um", "nomes_dr": ["P UM"], "inicio": "1976-07-14", "fim": "2004-03-09", "fonte": "https://x"},
                       {"id": "p2", "nome": "P Dois", "nomes_dr": ["P DOIS"], "inicio": "2004-03-09", "fim": None, "fonte": "https://x"}]}


def sig(**kw):
    base = {"bloco": "pos1976", "d_cm": None, "cm_signatarios": [], "d_promulgacao": None, "presidente_nome": None, "presidente_interino": False,
            "d_referenda": None, "referenda_nome": None, "referenda_por_outro": False, "transitorias": [], "signatarios_pre1976": [],
            "obtido_em": "2026-10-30", "erro": None}
    base.update(kw)
    est = {c: ("ok" if base.get(c) else "ausente") for c in ("d_cm", "d_promulgacao", "presidente_nome", "d_referenda")}
    est.update(kw.pop("estado", {}) if "estado" in kw else {})
    base["estado"] = {**est, **base.get("estado", {})}
    return base


def ato(aid, desig, pub, tipo):
    return {"id": aid, "designacao": desig, "publicacao": pub, "link": "https://diariodarepublica.pt/dr/detalhe/x/1", "sumario": None,
            "alteracoes": [], "tipo_ato": tipo}


class Registo(unittest.TestCase):
    def setUp(self):
        self.t = quem.Tabelas(T_G, T_P)

    def reg(self, a, s, p=None):
        return quem.registo(a["id"], a, p, s, self.t, None, {})

    def test_dl_goes_to_the_government_of_its_council_of_ministers(self):
        a = ato("decreto-lei-1-2000", "Decreto-Lei n.º 1/2000", "2000-01-20", "decreto-lei")
        r = self.reg(a, sig(d_cm="1999-12-20", d_promulgacao="2000-01-10", presidente_nome="P UM"))
        self.assertEqual(r["governo"], {"numero": 1, "base": "conselho_ministros", "data": "1999-12-20"})
        self.assertEqual(r["governo_publicacao"], 2)
        self.assertEqual(r["presidente"]["id"], "p1")
        self.assertEqual(r["motivos"], {})

    def test_president_on_the_promulgation_date_not_publication(self):
        a = ato("decreto-lei-2-2004", "Decreto-Lei n.º 2/2004", "2004-03-20", "decreto-lei")
        r = self.reg(a, sig(d_cm="2004-02-01", d_promulgacao="2004-03-05", presidente_nome="P UM"))
        self.assertEqual(r["presidente"]["id"], "p1")

    def test_before_the_first_government(self):
        a = ato("decreto-lei-561-76", "Decreto-Lei n.º 561/76", "1976-07-17", "decreto-lei")
        r = self.reg(a, sig(bloco="pos1976", d_promulgacao="1976-07-02", presidente_nome="X"))
        self.assertIsNone(r["governo"])
        self.assertEqual(r["motivos"]["governo"], "antes_governo_constitucional")

    def test_dl_without_d_cm(self):
        a = ato("decreto-lei-3-2001", "Decreto-Lei n.º 3/2001", "2001-01-20", "decreto-lei")
        r = self.reg(a, sig(d_promulgacao="2001-01-10", presidente_nome="P UM"))
        self.assertEqual((r["governo"], r["motivos"]["governo"], r["motivos"]["d_cm"]), (None, "sem_d_cm", "sem_d_cm"))
        self.assertEqual(r["governo_publicacao"], 2)
        self.assertEqual(self.reg(a, None)["motivos"]["governo"], "por_ler")

    def test_name_conflict_closed_row_and_open_row(self):
        a = ato("lei-1-2001", "Lei n.º 1/2001", "2001-01-20", "lei")
        r = self.reg(a, sig(d_promulgacao="2001-01-10", presidente_nome="OUTRA PESSOA"))
        self.assertIsNone(r["presidente"])
        self.assertEqual(r["motivos"]["presidente"], "conflito")
        self.assertIn({"regra": "presidente", "estado": "conflito", "detalhe": "bloco: OUTRA PESSOA; tabela em 2001-01-10: P Um"}, r["verificacao"])
        a = ato("lei-1-2010", "Lei n.º 1/2010", "2010-01-20", "lei")
        r = self.reg(a, sig(d_promulgacao="2010-01-10", presidente_nome="OUTRA PESSOA"))
        self.assertEqual(r["motivos"]["presidente"], "tabela_aberta")

    def test_same_prime_minister_across_a_posse(self):
        a = ato("decreto-lei-4-2005", "Decreto-Lei n.º 4/2005", "2005-02-01", "decreto-lei")
        r = self.reg(a, sig(d_cm="2005-01-05", d_promulgacao="2005-01-20", presidente_nome="P DOIS"))
        self.assertTrue(any(v["regra"] == "mesmo_pm" for v in r["verificacao"]))

    def test_referenda_conflict_drops_the_government(self):
        a = ato("decreto-lei-5-2001", "Decreto-Lei n.º 5/2001", "2001-02-20", "decreto-lei")
        r = self.reg(a, sig(d_cm="2001-01-05", d_promulgacao="2001-01-20", presidente_nome="P UM", d_referenda="2001-01-22", referenda_nome="Outro PM"))
        self.assertIsNone(r["governo"])
        self.assertEqual(r["motivos"]["governo"], "conflito")

    def test_law_without_passage(self):
        a = {**ato("lei-2-2001", "Lei n.º 2/2001", "2001-01-20", "lei"), "ar": {"legislatura": "VIII", "diploma_id": "1"}}
        r = self.reg(a, sig(d_promulgacao="2001-01-10", presidente_nome="P UM"))
        self.assertEqual(r["motivos"]["passagem"], "sessao_em_falta")
        self.assertTrue(r["ar_url"].endswith("BID=1"))
        self.assertEqual(r["periodo"]["base"], "publicacao")

    def test_oe_and_period_by_reappreciation(self):
        a = {**ato("lei-3-2001", "Lei n.º 3/2001", "2001-03-20", "lei"), "sumario": "Orçamento do Estado para 2001"}
        p = {"iniciativas": [{"id": "9", "designacao": "Proposta de Lei n.º 1/VIII", "titulo": "", "autores": {"tipo": "governo", "nome": "Governo"},
                              "generalidade": {"resultado": "Aprovado"}}],
             "texto_comissao": [], "generalidade": [{"origem": "iniciativa", "id": "9"}], "vfg": {"data": "2000-12-01", "unanime": False, "resultado": "Aprovado"},
             "eventos": [{"tipo": "veto", "data": "2001-01-02", "acordao_tc": "1/2001"}, {"tipo": "confirmacao", "data": "2001-02-01"}], "passos": [], "motivos": {}}
        r = quem.registo(a["id"], a, p, sig(d_promulgacao="2001-03-10", presidente_nome="P UM"), self.t, None, {"entradas": {"9": "2000-10-15"}})
        self.assertEqual(r["oe"], {"ano": 2001})
        self.assertEqual((r["periodo"]["data"], r["periodo"]["base"]), ("2001-02-01", "reapreciacao"))
        self.assertEqual(r["proponentes"][0]["governo"], 2)
        self.assertEqual(r["eventos"][0]["acordao_tc"], "1/2001")

    def test_court_norms_from_notes(self):
        a = ato("acordao-do-tribunal-constitucional-299-2020", "Acórdão do Tribunal Constitucional n.º 299/2020", "2020-09-18", "acordao-tc")
        notas = {a["id"]: [{"diploma": "codigo-civil", "artigo": "artigo-1091", "texto":
                            "Declara a inconstitucionalidade, com força obrigatória geral, da norma do n.º 8 do artigo 1091.º do Código Civil, "
                            "na redação dada pela Lei n.º 64/2018, de 29 de outubro, com efeitos a partir de 2018-10-30."}]}
        r = quem.registo(a["id"], a, None, sig(bloco="acordao", d_decisao="2020-06-16"), self.t, None, {"notas": notas})
        self.assertEqual(r["tribunal"]["normas"], [{"diploma": "codigo-civil", "artigo": "artigo-1091", "numeros": ["8"], "escrito_por": "lei-64-2018",
                                                    "efeitos_desde": "2018-10-30", "tipo": "inconstitucional"}])
        self.assertEqual((r["tribunal"]["data"], r["tribunal"]["data_base"]), ("2020-06-16", "decisao"))
        self.assertEqual(r["periodo"]["fora"], "acordaos")


# ---- Groups and legislaturas (R-5) -----------------------------------------------------------------
def info(sigla, ini, fim, grupos):
    return {"DetalheLegislatura": {"sigla": sigla, "dtini": ini, "dtfim": fim}, "GruposParlamentares": [{"sigla": s, "nome": n} for s, n in grupos]}


class Grupos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = tempfile.mkdtemp()
        for leg, x in {"II": info("II", "1980-11-13", "1983-05-30", [("PSD", "Partido Social Democrata"), ("CDS", "Centro Democrático Social"), ("DESC", "Desconhecido")]),
                       "IX": info("IX", "2002-04-05", "2005-03-09", [("PSD", "Partido Social Democrata"), ("CDS-PP", "Partido Popular"), ("BE", "Bloco De Esquerda")])}.items():
            with open(os.path.join(cls.d, f"InformacaoBase{leg}_json.txt"), "w", encoding="utf-8") as fh:
                json.dump(x, fh)
        cls.g = quem.Grupos(cls.d, ler(AQUI, "grupos.json"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.d)

    def test_sigla_of_the_legislatura(self):
        self.assertEqual(self.g.sigla("CDS-PP", "II"), "CDS")
        self.assertEqual(self.g.sigla("PPD/PSD", "IX"), "PSD")
        self.assertEqual((self.g.id("CDS"), self.g.id("CDS-PP"), self.g.id("PPD/PSD")), ("cds-pp", "cds-pp", "psd"))
        self.assertEqual(self.g.id("MDP/CDE"), "mdp-cde")

    def test_names_and_dates(self):
        self.assertEqual(self.g.legislatura_em("1981-06-11"), "II")
        self.assertIsNone(self.g.legislatura_em("1990-01-01"))  # between the two files
        self.assertEqual(self.g.nome("BE", "IX"), "Bloco de Esquerda")  # grafia
        self.assertNotIn("DESC", self.g.nomes["II"])
        cds = self.g.grupos()["cds-pp"]["nomes"]
        self.assertEqual([(n["sigla"], n["legislaturas"]) for n in cds], [("CDS", ["II"]), ("CDS-PP", ["IX"])])

    def test_vote_uses_the_siglas_of_its_date(self):
        v = N(date="1981-06-11", phase="Votação na generalidade", result="Aprovado", unanimous=False,
              positions=parse_positions("A Favor: <I>PSD</I><BR>Contra:<I>CDS-PP</I>"), absent=[], description=None)
        x = passagem._voto(v, None, self.g, {})
        self.assertEqual(x["grupos"], {"PSD": "favor", "CDS": "contra"})
        self.assertEqual(x["legislatura"], "II")


# ---- «Ausência» (R-4) ----------------------------------------------------------------------------
class Ausencia(unittest.TestCase):
    def test_absent_groups_are_not_votes(self):
        pos = parse_positions("A Favor: PS<BR>Abstenção: PCP<BR>Ausência: CDS, PEV, Carlos Macedo (Indep)")
        self.assertEqual(pos, {"PS": "favor", "PCP": "abstencao", "CDS": "ausente", "PEV": "ausente", "Carlos Macedo (Indep)": "ausente"})
        v = passagem.ler_voto(pos)
        self.assertEqual(v["grupos"], {"PS": "favor", "PCP": "abstencao"})
        self.assertEqual(v["ausentes"], ["CDS-PP", "PEV"])  # ALIAS without a legislatura; with one, «CDS»
        self.assertEqual(v["dissidencia"], [])
        self.assertEqual(v["fora_de_grupo"], [])

    def test_absent_groups_have_no_missing_record(self):
        comp = passagem.Composicao({"GruposParlamentares": [{"sigla": "PS"}, {"sigla": "PEV"}], "Deputados": [
            {"DepSituacao": [{"sioDes": "Efetivo", "sioDtInicio": "1980-01-01", "sioDtFim": None}], "DepGP": [{"gpSigla": "PS", "gpDtInicio": "1980-01-01", "gpDtFim": None}]},
            {"DepSituacao": [{"sioDes": "Efetivo", "sioDtInicio": "1980-01-01", "sioDtFim": None}], "DepGP": [{"gpSigla": "PEV", "gpDtInicio": "1980-01-01", "gpDtFim": None}]}]})
        v = N(date="1990-01-01", phase="Votação na generalidade", result="Aprovado", unanimous=False,
              positions={"PS": "favor", "PEV": "ausente"}, absent=[], description=None)
        x = passagem._voto(v, comp)
        self.assertEqual((x["ausentes"], x["sem_registo"]), (["PEV"], []))


# ---- The matching cascade (R-1, R-3) ---------------------------------------------------------------
def voto(fase, data, pos, desc=None, obs=None, vid=None):
    return N(phase=fase, date=data, positions=pos, description=desc, obs=obs, id=vid, result="Aprovado", unanimous=False, absent=[])


class Cascata(unittest.TestCase):
    def test_decree_numbers_in_notes(self):
        self.assertEqual(passagem.decretos_em("Decreto n.º 17/XVII - Acórdão do Tribunal Constitucional n.º 1133/2025"), ["17/XVII"])
        self.assertEqual(passagem.decretos_em("Decretos n.ºs 95/XV, 96/XV e 97/XV"), ["95/XV", "96/XV", "97/XV"])
        self.assertEqual(passagem.decretos_em("Decretos n.º 97, 102, 103 e 112/XV"), ["97/XV", "102/XV", "103/XV", "112/XV"])
        self.assertEqual(passagem.decretos_em("Decreto da Assembleia da República n.º 49/XVII/1.ª - \"Altera o Código Penal\""), ["49/XVII"])

    def test_parts_of_initiatives(self):
        d = ("Texto de Substituição relativo à Proposta de Lei n.º 128/XIII/3.ª (GOV), Artigo 8.º do Projeto de Lei n.º 847/XIII/3.ª (BE), "
             "Projeto de Lei n.º 1041/XIII/4.ª (PSD)")
        self.assertEqual(passagem.citadas_partes(d), [("Proposta de Lei", "128", "XIII", None), ("Projeto de Lei", "847", "XIII", "artigo 8.º"),
                                                      ("Projeto de Lei", "1041", "XIII", None)])

    def lo_2026(self):
        ln = "Texto de substituição relativo à Proposta de Lei n.º 1/XVII/1.ª (GOV) – Décima primeira alteração à Lei n.º 37/81, de 3 de outubro, que aprova a Lei da nacionalidade"
        cp = "Texto de substituição relativo à Proposta de Lei n.º 1/XVII/1.ª (GOV) – Altera o Código Penal, criando a pena acessória de perda da nacionalidade"
        g = {"PSD": "favor", "CH": "favor", "PS": "contra", "JPP": "abstencao"}
        g2 = {"PSD": "favor", "CH": "contra", "PS": "contra", "JPP": "abstencao"}
        votos = [voto("Votação na generalidade", "2025-10-28", g, ln, vid="1"), voto("Votação na generalidade", "2025-10-28", g2, cp, vid="2"),
                 voto("Votação na generalidade", "2025-10-28", g, ln, vid="1"),  # recorded twice
                 voto("Votação final global", "2025-10-28", {"PSD": "favor", "PS": "contra"}, ln, vid="3"),
                 voto("Votação final global", "2025-10-28", {"PSD": "favor", "PS": "contra", "JPP": "favor"}, cp, vid="4"),
                 voto("Votação novo decreto", "2026-04-01", {"JPP": "abstencao"}, obs='Votação do novo Decreto da Assembleia da República sobre "Alteração à Lei n.º 37/81, de 3 de outubro, que aprova a Lei da Nacionalidade"', vid="5"),
                 voto("Votação novo decreto", "2026-04-01", {"JPP": "contra"}, obs='Votação do novo Decreto da Assembleia da República que "Altera o Código Penal, criando a pena acessória de perda da nacionalidade"', vid="6"),
                 voto("Confirmação do decreto", "2026-07-03", {"CH": "favor"}, obs="Decreto da Assembleia da República n.º 49/XVII/1.ª", vid="7")]
        det = [{"data": "2025-06-25", "fase": "Entrada", "obs": None}, {"data": "2025-10-28", "fase": "Votação na generalidade", "obs": None},
               {"data": "2025-10-28", "fase": "Votação final global", "obs": None},
               {"data": "2025-12-19", "fase": "Veto (Receção)", "obs": "Decreto n.º 17/XVII - Acórdão do Tribunal Constitucional n.º 1133/2025"},
               {"data": "2025-12-19", "fase": "Veto (Receção)", "obs": "Decreto n.º 18/XVII - Acórdão do Tribunal Constitucional n.º 1134/2025"},
               {"data": "2026-05-03", "fase": "Promulgação (2ª versão)", "obs": "Decreto n.º 48/XVII"},
               {"data": "2026-05-13", "fase": "Veto (Receção)", "obs": "Decreto n.º 49/XVII"},
               {"data": "2026-05-18", "fase": "Lei (Publicação DR)", "obs": None},
               {"data": "2026-07-03", "fase": "Confirmação do decreto", "obs": "Decreto da Assembleia da República n.º 49/XVII/1.ª"}]
        ini = N(id=315160, kind="Proposta de Lei", number="1", legislature="XVII", title="Altera a Lei n.º 37/81", votes=votos,
                events=[(d["data"], d["fase"]) for d in det], details=det)
        raw = {"IniAutorOutros": {"nome": "Governo"}}
        ctx = {"publicacao": "2026-05-18", "alvos": ["Lei da Nacionalidade", "Lei n.º 37/81"],
               "decretos": {"meus": [{"numero": "17/XVII", "titulo": "Alteração à Lei n.º 37/81, de 3 de outubro, que aprova a Lei da Nacionalidade"},
                                     {"numero": "48/XVII", "titulo": "Alteração à Lei n.º 37/81, de 3 de outubro, que aprova a Lei da Nacionalidade"}],
                            "outros": [{"numero": "18/XVII", "titulo": "Altera o Código Penal, criando a pena acessória de perda da nacionalidade"},
                                       {"numero": "49/XVII", "titulo": "Altera o Código Penal, criando a pena acessória de perda da nacionalidade"}]}}
        return passagem.passagem([(raw, ini)], "lei-organica-1-2026", {}, ctx)

    def test_two_committee_texts_one_initiative(self):
        p = self.lo_2026()
        self.assertEqual(p["decreto"], {"numero": "48/XVII", "anteriores": ["17/XVII"], "titulo": "Alteração à Lei n.º 37/81, de 3 de outubro, que aprova a Lei da Nacionalidade"})
        self.assertEqual(len(p["texto_comissao"]), 1)
        self.assertEqual(p["texto_comissao"][0]["grupos"]["CH"], "favor")
        self.assertEqual(p["generalidade"], [{"origem": "texto_comissao", "indice": 0}])
        self.assertNotIn("JPP", p["vfg"]["grupos"])

    def test_events_of_other_decrees_and_after_publication_are_dropped(self):
        p = self.lo_2026()
        self.assertEqual([(e["tipo"], e["data"]) for e in p["eventos"]], [("veto", "2025-12-19"), ("novo_decreto", "2026-04-01")])
        self.assertEqual(p["eventos"][0]["acordao_tc"], "1133/2025")
        self.assertEqual(p["eventos"][1]["voto"]["grupos"], {"JPP": "abstencao"})
        motivos = {(d["fase"], d["data"]): d["motivo"] for d in p["descartados"]}
        self.assertEqual(motivos[("Confirmação do decreto", "2026-07-03")], "depois_da_publicacao")
        self.assertEqual(motivos[("Veto (Receção)", "2026-05-13")], "outro_decreto")
        self.assertEqual({s["passo"]: s["data"] for s in p["passos"]}["promulgacao"], "2026-05-03")

    def test_publication_only_within_a_day(self):
        p = self.lo_2026()
        ini = p  # noqa: F841
        det = [{"data": "2023-11-27", "fase": "Promulgação", "obs": None}, {"data": "2023-12-07", "fase": "Lei (Publicação DR)", "obs": None},
               {"data": "2024-01-08", "fase": "Promulgação (2ª versão)", "obs": None}, {"data": "2024-01-19", "fase": "Lei (Publicação DR)", "obs": None}]
        i = N(id=1, kind="Projeto de Lei", number="1", legislature="XV", title="t", votes=[], events=[(d["data"], d["fase"]) for d in det], details=det)
        x = passagem.passagem([({}, i)], "lei-6-2024", {}, {"publicacao": "2024-01-19", "decretos": {"meus": [], "outros": []}})
        self.assertEqual({s["passo"]: s["data"] for s in x["passos"]}["publicacao"], "2024-01-19")
        self.assertIn({"fase": "Lei (Publicação DR)", "data": "2023-12-07", "motivo": "sem_correspondencia"}, x["descartados"])

    def test_joined_initiative_is_never_the_main_one(self):
        # F3: an initiative the committee text cites, which the AR links to another law, joins the
        # passage with its own events (a publication of that other law) but never leads it.
        det = [{"data": "2018-04-30", "fase": "Entrada", "obs": None}, {"data": "2019-02-12", "fase": "Lei (Publicação DR)", "obs": None}]
        alheia = [{"data": "2018-04-01", "fase": "Entrada", "obs": None}, {"data": "2019-01-20", "fase": "Lei (Publicação DR)", "obs": None}]
        a = N(id=42542, kind="Proposta de Lei", number="129", legislature="XIII", title="t", votes=[], events=[(d["data"], d["fase"]) for d in det], details=det)
        b = N(id=42517, kind="Projeto de Lei", number="847", legislature="XIII", title="t", votes=[], events=[(d["data"], d["fase"]) for d in alheia], details=alheia)
        ctx = {"publicacao": "2019-02-12", "decretos": {"meus": [], "outros": []}, "juntas": {"42517"}}
        x = passagem.passagem([({"IniAutorOutros": {"nome": "Governo"}}, a), ({"IniAutorGruposParlamentares": [{"GP": "BE"}]}, b)], "lei-13-2019", {}, ctx)
        self.assertEqual([(i["id"], i["principal"]) for i in x["iniciativas"]], [("42542", True), ("42517", False)])
        self.assertEqual({s["passo"]: s["data"] for s in x["passos"]}["publicacao"], "2019-02-12")

    def test_steps_out_of_order_are_dropped(self):
        det = [{"data": "2020-01-10", "fase": "Votação final global", "obs": None}, {"data": "2020-01-05", "fase": "Promulgação", "obs": None},
               {"data": "2020-01-20", "fase": "Lei (Publicação DR)", "obs": None}]
        vs = [voto("Votação final global", "2020-01-10", {"PS": "favor"})]
        i = N(id=1, kind="Projeto de Lei", number="1", legislature="XIV", title="t", votes=vs, events=[(d["data"], d["fase"]) for d in det], details=det)
        x = passagem.passagem([({}, i)], "lei-1-2020", {}, {"publicacao": "2020-01-20", "decretos": {"meus": [], "outros": []}})
        self.assertEqual(x["motivos"]["passos"], "passos_descartados")
        self.assertFalse({"promulgacao", "publicacao"} & {s["passo"] for s in x["passos"]})


# ---- Retificações (R-2) ----------------------------------------------------------------------------
class Retificacao(unittest.TestCase):
    def v(self, ato_, tipo, pub, vigor):
        return {"ato": ato_, "tipo": tipo, "publicacao": pub, "vigor": vigor}

    def test_takes_the_corrected_vigor_and_sorts_after_it(self):
        vs = [self.v("original", "original", "1981-10-03", "1981-10-08"), self.v("lo-1-2026", "alterado", "2026-05-18", "2026-05-19"),
              self.v("ret-17-2026", "retificado", "2026-05-18", None)]
        out = build.ordenar_versoes(vs)
        self.assertEqual([x["ato"] for x in out], ["original", "lo-1-2026", "ret-17-2026"])
        self.assertEqual(out[-1]["vigor"], "2026-05-19")

    def test_never_by_its_own_date(self):
        # A retificação dated later than a newer act stays right after the act it corrects.
        vs = [self.v("a", "alterado", "2012-08-14", "2012-11-12"), self.v("ret", "retificado", "2012-10-12", "2012-08-01"),
              self.v("b", "alterado", "2012-09-01", "2012-09-02")]
        out = build.ordenar_versoes(vs)
        self.assertEqual([x["ato"] for x in out], ["b", "a", "ret"])
        self.assertEqual(out[-1]["vigor"], "2012-11-12")


# ---- Act ids (R-8) ---------------------------------------------------------------------------------
class Ids(unittest.TestCase):
    def test_bare_declarations_split_by_their_diario(self):
        a = atos.parse("Rectificado pelo/a [L]Declaração  - Diário da República n.º 276/1986, 1º Suplemento, Série I de 1986-11-29[/L], em vigor a partir de 1986-11-29")
        b = atos.parse("Rectificado pelo/a [L]Declaração  - Diário da República n.º 202/1984, Suplemento n.º 1, Série I de 1984-08-31[/L]")
        c = atos.parse("Rectificado pelo/a [L]Declaração  - Diário da República n.º 276/1986, Suplemento n.º 1, Série I de 1986-11-29[/L]")
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(a["id"], c["id"])
        self.assertEqual((a["publicacao"], b["publicacao"]), ("1986-11-29", "1984-08-31"))
        self.assertEqual(a["id_antigo"], "declaracao")
        reg = build.Registry()
        reg.add(a)
        reg.add(b)
        self.assertEqual(reg.aliases(), {"declaracao": b["id"]})  # the first one published

    def test_headings_and_parts_go(self):
        self.assertEqual(atos.limpar("III - DECISÃO, Acórdão do Tribunal Constitucional n.º 348/2025"), "Acórdão do Tribunal Constitucional n.º 348/2025")
        self.assertEqual(atos.limpar("Subsecção II, Lei n.º 28/82"), "Lei n.º 28/82")
        self.assertEqual(atos.limpar("Decreto-Lei n.º 329-A/95 (1.ª Parte)"), "Decreto-Lei n.º 329-A/95")
        x = atos.parse_fonte("III, Acórdão do Tribunal Constitucional n.º 299/2020 - Diário da República n.º 183/2020, Série I de 2020-09-18")
        self.assertEqual((x["id"], x["id_antigo"]), ("acordao-do-tribunal-constitucional-299-2020", "iii-acordao-do-tribunal-constitucional-299-2020"))

    def test_diario_do_governo_has_a_date(self):
        x = atos.parse("Rectificado pelo/a [L]Rectificação  - Diário do Governo n.º 141/1975, Série I de 1975-06-21[/L]")
        self.assertEqual((x["publicacao"], atos.tipo_ato(x["designacao"], x["publicacao"], x["jornal"])), ("1975-06-21", "pre1976"))

    def test_diario_do_governo_ids(self):
        # F4: the act's id comes from its name, never from the Diário that published it.
        for d, i in (("Revogado pelo/a Artigo 46.º do/a [L]Decreto-Lei n.º 201/75  - Diário do Governo n.º 88/1975, Série I de 1975-04-15[/L], em vigor a partir de 1975-04-30", "decreto-lei-201-75"),
                     ("Alterado pelo/a Artigo 1.º do/a [L]Decreto-Lei n.º 67/75  - Diário do Governo n.º 42/1975, Série I de 1975-02-19[/L], em vigor a partir de 1975-02-20", "decreto-lei-67-75")):
            self.assertEqual(atos.parse(d)["id"], i)

    def test_stale_diplomas_leave_no_files(self):
        # F4: a diploma that left the corpus (codigo-civil-locacao) leaves no article with an unknown act.
        import verificacao
        with tempfile.TemporaryDirectory() as t:
            for slug in ("codigo-civil", "codigo-civil-locacao"):
                os.makedirs(os.path.join(t, slug))
                with open(os.path.join(t, slug + ".json"), "w", encoding="utf-8") as fh:
                    json.dump({}, fh)
                with open(os.path.join(t, slug, "artigo-1072.json"), "w", encoding="utf-8") as fh:
                    json.dump({"id": "artigo-1072", "versoes": [{"ato": "decreto-lei-47344"}, {"ato": "decreto-lei-201-75" + ("-diario" if "locacao" in slug else "")}]}, fh)
            atos_ = {"decreto-lei-47344": {}, "decreto-lei-201-75": {}}
            self.assertEqual([x["diploma"] for x in verificacao.atos_em_falta(t, atos_)], ["codigo-civil-locacao"])
            self.assertEqual(build.podar(t, {"codigo-civil"}), ["codigo-civil-locacao"])
            self.assertEqual(sorted(os.listdir(t)), ["codigo-civil", "codigo-civil.json"])
            self.assertEqual(verificacao.atos_em_falta(t, atos_), [])

    def test_kinds(self):
        self.assertEqual(atos.tipo_ato("Lei Orgânica n.º 1/2026", "2026-05-18"), "lei-organica")
        self.assertEqual(atos.tipo_ato("Decreto-Lei n.º 47344", "1966-11-25"), "pre1976")
        self.assertEqual(atos.tipo_ato("Declaração de Retificação n.º 17/2026/1", "2026-05-18"), "retificacao")
        self.assertEqual(atos.tipo_ato("Decreto de Aprovação da Constituição", "1976-04-10"), "aprovacao-constituicao")


# ---- Timeline and group pages (R-50, R-51, R-54) ---------------------------------------------------
class LinhaDoTempo(unittest.TestCase):
    def test_fixture_timeline_buckets(self):
        qd = ler(FIXTURE, "quem", "lei-teste.json")
        g = {p["governo"]: p["listas"] for p in qd["por_governo"]}
        self.assertEqual([x["ato"] for x in g[3]["publicados_sem_d_cm"]], ["decreto-lei-903-2012"])
        self.assertEqual([x["ato"] for x in g[4]["propostas"]], ["lei-901-2020", "lei-901-2022"])
        self.assertTrue(all(x.get("texto_comissao") for x in g[3]["outras"]))

    def test_buckets_from_records(self):
        t = quem.Tabelas(T_G, T_P)
        d = {"slug": "x", "ato_original": "o", "publicacao": "1990-01-01", "copia": None,
             "arvore": [{"tipo": "artigo", "artigo": "artigo-1"}]}
        alt = [{"diploma": "x", "artigo": "artigo-1", "tipo": "alterado"}]
        A = {"dl-a": {"alteracoes": alt, "tipo_ato": "decreto-lei", "publicacao": "2001-01-05"},
             "dl-b": {"alteracoes": alt, "tipo_ato": "decreto-lei", "publicacao": "2006-01-05"},
             "lei-a": {"alteracoes": alt, "tipo_ato": "lei", "publicacao": "2001-03-01"},
             "lei-b": {"alteracoes": alt, "tipo_ato": "lei", "publicacao": "2001-04-01"},
             "lc": {"alteracoes": alt, "tipo_ato": "lei-constitucional", "publicacao": "2001-04-01"}}

        def q(tipo, data, gov, governo=None, prop=(), tc=None, fora=None):
            return {"tipo_ato": tipo, "governo": governo, "periodo": {"data": data, "governo": gov, "legislatura": None, "fora": fora},
                    "proponentes": [{"iniciativa": str(k), "tipo": x, "designacao": "x"} for k, x in enumerate(prop)], "texto_comissao": tc, "retifica": None}
        Q = {"dl-a": q("decreto-lei", "2000-12-20", 1, governo={"numero": 1}), "dl-b": q("decreto-lei", "2006-01-05", 3),
             "lei-a": q("lei", "2001-02-01", 2, prop=("governo",)), "lei-b": q("lei", "2001-02-02", 2, prop=("governo", "grupos")),
             "lc": q("lei-constitucional", "2001-04-01", 2, fora="revisoes")}
        P = {"lei-a": {}, "lei-b": {}}
        x = quem.linha_tempo(d, A, Q, P, {}, t, None, "2026-10-30")
        g = {p["governo"]: p for p in x["por_governo"]}
        self.assertEqual([p["governo"] for p in x["por_governo"]], [1, 2, 3])  # empty periods too
        self.assertEqual(g[1]["listas"]["decretos_leis"], [{"ato": "dl-a"}])
        self.assertEqual(g[2]["listas"]["propostas"], [{"ato": "lei-a"}])
        self.assertEqual(g[2]["listas"]["outras"], [{"ato": "lei-b"}])
        self.assertEqual(g[3]["listas"]["publicados_sem_d_cm"], [{"ato": "dl-b"}])
        self.assertEqual(x["fora"]["revisoes"], [{"ato": "lc"}])
        self.assertEqual(g[2]["total"], 2)

    def test_group_rows(self):
        idx = ler(FIXTURE, "grupos", "index.json")
        self.assertEqual(idx, sorted(idx, key=lambda g: quem.dobrar(g["nome"])))
        be = ler(FIXTURE, "grupos", "be.json")
        como = {x["designacao"]: (x["como"], x["n_iniciativas"]) for x in be["iniciativas"]}
        self.assertEqual(como["Projeto de Lei n.º 901/XIII"], ("juntada", 3))  # the rejected principal is one of three, not the author
        psd = ler(FIXTURE, "grupos", "psd.json")
        parte = [x for x in psd["iniciativas"] if x["parte"]]
        self.assertEqual(parte[0]["parte"], "artigo 8.º")
        self.assertEqual(parte[0]["como"], "juntada")


# ---- Real data (strict mode) -------------------------------------------------------------------------
@estrito
class DadosReais(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atos = ler(APP_DATA, "atos.json")
        cls.quem = ler(APP_DATA, "quem.json")
        cls.p = ler(APP_DATA, "passagem.json")
        cls.gov = ler(APP_DATA, "governos.json")
        cls.idx = ler(APP_DATA, "index.json")

    def test_contract(self):
        self.assertEqual(contrato.validar_pasta(APP_DATA), [])

    def test_r1_lo_1_2026(self):
        p = self.p["lei-organica-1-2026"]
        tc = p["texto_comissao"][p["generalidade"][0]["indice"]]
        self.assertEqual((tc["grupos"]["CH"], tc["grupos"]["PS"], tc["grupos"]["JPP"]), ("favor", "contra", "abstencao"))
        novo = [e for e in p["eventos"] if e["tipo"] == "novo_decreto"]
        self.assertEqual([(e["data"], e["voto"]["grupos"]["JPP"], e["voto"]["grupos"]["CH"], e["voto"]["grupos"]["PS"]) for e in novo],
                         [("2026-04-01", "abstencao", "favor", "contra")])
        self.assertFalse([e for e in p["eventos"] if e["data"] == "2026-07-03"])
        self.assertEqual([e["acordao_tc"] for e in p["eventos"] if e["tipo"] == "veto"], ["1133/2025"])
        self.assertEqual(p["decreto"]["numero"], "48/XVII")

    def test_joined_initiative_has_its_authors(self):
        # PJL 847/XIII (BE) is in the committee text of Lei 13/2019, but the AR does not link it to the law.
        props = {x["designacao"]: [g["sigla"] for g in x["grupos"]] for x in self.quem["lei-13-2019"]["proponentes"]}
        self.assertEqual(props.get("Projeto de Lei n.º 847/XIII"), ["BE"])
        self.assertIn("lei-13-2019", json.dumps(ler(APP_DATA, "grupos", "be.json")))

    def test_r1_one_vfg_and_its_initiatives(self):
        for aid, p in self.p.items():
            v = p["vfg"]
            if not v or not v.get("descricao"):
                continue
            c = passagem.citadas(v["descricao"])
            ini = {(i["designacao"].split(" n.º")[0], i["designacao"].split("n.º ")[1].split("/")[0], i["designacao"].rsplit("/", 1)[1]) for i in p["iniciativas"]}
            tc = set()
            for t in p["texto_comissao"]:
                tc |= {(x["tipo"], x["numero"], x["legislatura"]) for x in t.get("citadas_todas", [])}
            if c and passagem._TEXTO_COMISSAO.match(v["descricao"]):
                self.assertTrue(c <= ini | tc or c & ini, aid)

    def test_r3_lei_6_2024_and_order(self):
        p = {s["passo"]: s["data"] for s in self.p["lei-6-2024"]["passos"]}
        self.assertEqual(p.get("promulgacao"), "2024-01-08")
        self.assertIn(p.get("publicacao"), ("2024-01-19", None))
        for aid, x in self.p.items():
            ds = [s["data"] for s in x["passos"] if s["passo"] in ("votacao-final", "veto", "reapreciacao", "promulgacao", "publicacao")]
            self.assertEqual(ds, sorted(ds), aid)
            pub = {s["passo"]: s["data"] for s in x["passos"]}.get("publicacao")
            if pub and self.atos[aid]["publicacao"]:
                self.assertLessEqual(abs(quem.dias(pub, self.atos[aid]["publicacao"])), 1, aid)

    def test_r4_absences(self):
        for aid, p in self.p.items():
            for v in passagem_votos(p):
                self.assertFalse([g for g in v["grupos"] if g.lower().startswith("aus")], aid)
        self.assertIn("UDP", next(i for i in self.p["lei-37-81"]["iniciativas"] if i["generalidade"])["generalidade"]["ausentes"])

    def test_r5_siglas(self):
        antigas = {"Constituinte", "IA", "IB", "II", "III", "IV", "V"}
        for aid, p in self.p.items():
            for v in passagem_votos(p):
                if v.get("legislatura") in antigas:
                    self.assertNotIn("CDS-PP", v["grupos"], aid)
                for s in v["grupos"]:
                    self.assertIn(s, self.gov["siglas"].get(v["legislatura"], {}), (aid, s))

    def test_r7_nrau_copy(self):
        a = ler(APP_DATA, "d", "nrau", "artigo-1083.json")
        self.assertEqual(a["copia_de"], {"diploma": "codigo-civil", "artigo": "artigo-1083"})
        self.assertEqual(ler(APP_DATA, "d", "nrau.json")["copia"]["diploma"], "codigo-civil")

    def test_r8_ids(self):
        for aid, a in self.atos.items():
            self.assertNotIn(aid, ("declaracao", "rectificacao", "retificacao"))
            self.assertFalse(a["designacao"].startswith(("III", "Diploma,", "Subsecção")), aid)
        self.assertEqual([k for k in self.atos if k.startswith("decreto-lei-329-a-95")], ["decreto-lei-329-a-95"])
        self.assertIn("acordao-do-tribunal-constitucional-299-2020", self.atos)
        for velho, novo in self.idx["aliases_atos"].items():
            self.assertIn(novo, self.atos)

    def test_r2_last_redacao_is_the_drs_newest(self):
        """For every article, the last redação is the text the DR shows today (catches every ordering defect)."""
        import texto as texto_mod
        corpus = build.fetch.carregar_corpus()
        erros = []
        for d in self.idx["diplomas"]:
            raw = ler(ROOT, "data", "raw", d["slug"] + ".json")
            agora = {f["FragmentoVersao"]["FragmentoId"]: f for f in raw["now"]["LegConsBase"]["List"] if f["FragmentoVersao"]["TipoFragmentoId"] == 11}
            arv = ler(APP_DATA, "d", d["slug"] + ".json")["arvore"]
            artigos = [n for n in arv if n["tipo"] == "artigo"]
            frags = [f for f in raw["now"]["LegConsBase"]["List"] if f["FragmentoVersao"]["TipoFragmentoId"] == 11]
            if len(frags) != len(artigos):
                continue  # partial diplomas (Código Civil's part) and annex selections: checked by their own ids
            for n, f in zip(artigos, frags):
                if n["estado"] == "revogado":
                    continue
                vs = raw["versions"].get(f["FragmentoVersao"]["FragmentoId"]) or []
                if not vs or not atos.parse(vs[0].get("AssociacaoDescription")):
                    continue  # no act named in the DR's newest entry: nothing to attribute it to
                # The DR's list is cumulative in publication order. When a later-published act entered into
                # force earlier (Lei n.º 56/2023 and 53/2023), redações ordered by entry into force differ
                # from that list by design; docs/QUEM.md lists these as a known limit.
                vig = [(atos.parse(e.get("AssociacaoDescription")) or {}).get("vigor") or (e.get("DataEntradaVigor") or "")[:10] for e in vs]
                vig = [x for x in vig if x and not x.startswith("1900")]
                if vig != sorted(vig, reverse=True):
                    continue
                a = ler(APP_DATA, "d", d["slug"], n["artigo"] + ".json")
                ultimo = "\n".join("".join(t for _, t in ln) for ln in a["versoes"][-1]["linhas"])
                if re.sub(r"\s+", " ", ultimo) != re.sub(r"\s+", " ", texto_mod.normalise(vs[0].get("Texto"))):
                    erros.append(f"{d['slug']}/{n['artigo']}")
        self.assertEqual(erros, [])
        _ = corpus

    def test_r2_retificacao_after_corrected_and_nationality_art_6(self):
        a = ler(APP_DATA, "d", "lei-nacionalidade", "artigo-6.json")
        texto = " ".join("".join(t for _, t in ln) for ln in a["versoes"][-1]["linhas"])
        self.assertIn("efetiva superior a 3 anos", texto)
        atos_ = [v["ato"] for v in a["versoes"]]
        self.assertLess(atos_.index("lei-organica-1-2026"), atos_.index("declaracao-de-retificacao-17-2026-1"))

    def test_r15_r19_who(self):
        q = self.quem
        self.assertEqual(q["decreto-lei-194-2003"]["d_cm"], "2003-07-16")
        r = q["decreto-lei-79-2026"]
        linha = next(p for p in self.gov["presidentes"] if p["inicio"] <= r["presidente"]["d_promulgacao"] and (p["fim"] is None or r["presidente"]["d_promulgacao"] < p["fim"]))
        self.assertEqual(r["presidente"]["id"], linha["id"])
        for aid, x in q.items():
            for p in x["proponentes"]:
                if p["tipo"] == "governo" and p["governo"]:
                    g = next(g for g in self.gov["governos"] if g["numero"] == p["governo"])
                    self.assertTrue(g["inicio"] <= p["entrada"] and (g["fim"] is None or p["entrada"] < g["fim"]), aid)
        self.assertGreaterEqual(sum(1 for x in q.values() if x["presidente"] and x["presidente"].get("d_promulgacao")), 470)

    def test_r10_floors(self):
        c = ler(APP_DATA, "verificacao.json")["quem"]["cobertura"]
        self.assertGreaterEqual(c["dl_d_cm"], 0.9715)          # measured 2026-10-30: 0.9915, minus 2 points
        self.assertGreaterEqual(c["leis_promulgacao"], 0.98)   # measured 2026-10-30: 1.0, minus 2 points

    def test_r13_no_conflict_in_closed_rows(self):
        cruz = ler(APP_DATA, "verificacao.json")["quem"]["cruzamento"]
        self.assertEqual([x for x in cruz if x["estado"] == "conflito"], [])

    def test_r50_nrau_timeline(self):
        qd = ler(APP_DATA, "quem", "nrau.json")
        por = {p["governo"]: p["listas"] for p in qd["por_governo"]}
        g = lambda aid: self.quem[aid]["periodo"]["governo"]  # noqa: E731
        self.assertEqual([x["ato"] for x in por[g("lei-31-2012")]["propostas"]], ["lei-31-2012", "lei-79-2014"])
        outras = {x["ato"]: x for x in por[g("lei-43-2017")]["outras"]}
        self.assertEqual(sorted(outras), sorted(["lei-42-2017", "lei-43-2017", "lei-12-2019", "lei-13-2019"]))  # listed in periodo.data order
        self.assertTrue(outras["lei-42-2017"].get("sem_passagem"))
        self.assertTrue(outras["lei-13-2019"].get("texto_comissao"))
        self.assertIn("lei-56-2023", [x["ato"] for x in por[g("lei-56-2023")]["propostas"]])
        cc = ler(APP_DATA, "quem", "codigo-civil.json")
        self.assertIn({"ato": "acordao-do-tribunal-constitucional-299-2020"}, cc["fora"]["acordaos"])
        self.assertEqual(len(cc["por_governo"]), 25)
        crp = ler(APP_DATA, "quem", "constituicao.json")
        lcs = [a for a, x in self.atos.items() if x["tipo_ato"] == "lei-constitucional" and any(c["diploma"] == "constituicao" for c in x["alteracoes"])]
        self.assertEqual(sorted(x["ato"] for x in crp["fora"]["revisoes"]), sorted(lcs))

    def test_committee_text_and_court(self):
        tc = self.quem["lei-13-2019"]["texto_comissao"]
        self.assertEqual(tc["n_iniciativas"], 3)
        self.assertIn("Projeto de Lei n.º 847/XIII", [x["designacao"] for x in tc["iniciativas"]])
        n = self.quem["acordao-do-tribunal-constitucional-299-2020"]["tribunal"]["normas"]
        self.assertIn({"diploma": "codigo-civil", "artigo": "artigo-1091", "numeros": ["8"], "escrito_por": "lei-64-2018",
                       "efeitos_desde": "2018-10-30", "tipo": "inconstitucional"}, n)

    def test_f1_committee_text_from_the_final_vote(self):
        tc = self.quem["lei-organica-2-2006"]["texto_comissao"]
        self.assertEqual((tc["tipo"], tc["n_iniciativas"]), ("texto_substituicao", 6))
        # Only «Texto de substituição»: a final vote on the committee's «texto final» is not a committee text of its own.
        self.assertIsNone(self.quem["lei-31-2012"]["texto_comissao"])
        self.assertIsNone(self.quem["lei-43-2017"]["texto_comissao"])

    def test_f2_proposers_of_amendments(self):
        sem = [v for s in self.p["lei-organica-1-2024"]["passos"] for v in s["votacoes"]
               if re.match(r"\s*Proposta,? do", v.get("descricao") or "") and not (v.get("proposta") or {}).get("proponente")]
        self.assertEqual(sem, [])

    def test_f3_initiatives_the_committee_text_cites(self):
        ids = [i["id"] for i in self.p["lei-13-2019"]["iniciativas"]]
        self.assertIn("42517", ids)  # Projeto de Lei n.º 847/XIII (BE)
        self.assertEqual(next(i for i in self.p["lei-13-2019"]["iniciativas"] if i["principal"])["id"], "42542")
        self.assertEqual(self.p["lei-13-2019"]["generalidade"], [{"origem": "texto_comissao", "indice": 0}])

    def test_f4_every_redacao_has_its_act(self):
        self.assertEqual(ler(APP_DATA, "verificacao.json")["quem"]["atos_em_falta"], [])
        import verificacao
        self.assertEqual(verificacao.atos_em_falta(os.path.join(APP_DATA, "d"), self.atos), [])
        self.assertFalse(os.path.exists(os.path.join(APP_DATA, "d", "codigo-civil-locacao")))

    def test_gaps(self):
        for aid in ("lei-organica-2-2020", "lei-42-2017", "lei-2-2020"):
            self.assertEqual(self.quem[aid]["motivos"].get("passagem"), "sessao_em_falta", aid)

    def test_transitional_norms(self):
        self.assertTrue(self.quem["lei-organica-1-2026"]["transitorias"])
        self.assertTrue(self.quem["lei-31-2012"]["transitorias"])


def passagem_votos(p):
    for i in p["iniciativas"]:
        if i.get("generalidade"):
            yield i["generalidade"]
    yield from p["texto_comissao"]
    if p.get("vfg"):
        yield p["vfg"]
    for e in p.get("eventos", []):
        if e.get("voto"):
            yield e["voto"]


import re  # noqa: E402

if __name__ == "__main__":
    unittest.main()
