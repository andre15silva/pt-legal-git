"""Offline tests for the pipeline: python -I -m unittest discover -s pipeline"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atos  # noqa: E402
import build  # noqa: E402
import passagem  # noqa: E402
import texto  # noqa: E402


class Texto(unittest.TestCase):
    def test_normalise(self):
        raw = "1 - A taxa do IRC é de 17 %.   \r\n2 – (Revogado.)\r\r<p>a) Alínea;</p>"
        self.assertEqual(texto.normalise(raw), "1 — A taxa do IRC é de 17 %.\n2 — (Revogado.)\na) Alínea;")

    def test_repairs_corrupted_dr_links(self):
        a = 'Diretiva n.º <a href="eurlex.asp?id=1" title="Link">2011/96/UE</`\ufffd, do Conselho'
        b = 'Diretiva n.º <a href="eurlex.asp?id=1" title="Link para Directiva!\ufffd2011/96/CE</a>, do Conselho'
        self.assertEqual(texto.normalise(a), "Diretiva n.º 2011/96/UE, do Conselho")
        self.assertEqual(texto.normalise(b), "Diretiva n.º 2011/96/CE, do Conselho")

    def test_blame_carries_origin(self):
        v = ["A taxa é de 20 %, exceto.", "A taxa é de 17 %, exceto.", "A taxa geral é de 17 %, exceto."]
        spans = texto.blame(v)
        self.assertEqual(spans[1], [(0, "A taxa é de "), (1, "17"), (0, " %, exceto.")])
        # "geral" comes from version 2; "17" keeps its origin in version 1
        self.assertEqual(spans[2], [(0, "A taxa "), (2, "geral"), (0, " é de "), (1, "17"), (0, " %, exceto.")])

    def test_rewritten_phrase_is_one_change(self):
        # CRP art. 1.º, Lei Constitucional n.º 1/89: "sociedade" is part of the new phrase
        v = ["empenhada na sua transformação numa sociedade sem classes.",
             "empenhada na construção de uma sociedade livre, justa e solidária."]
        self.assertEqual(texto.blame(v)[1], [(0, "empenhada na "), (1, "construção de uma sociedade livre, justa e solidária"), (0, ".")])

    def test_long_unchanged_run_stays(self):
        v = ["A taxa é de 20 % e de 10 %.", "A taxa é de 21 % e de 11 %."]
        self.assertEqual(texto.blame(v)[1], [(0, "A taxa é de "), (1, "21"), (0, " % e de "), (1, "11"), (0, " %.")])

    def test_line_break_stays(self):
        v = ["1 — Um.\n2 — Dois.", "1 — Uno.\n2 — Duo."]
        self.assertEqual(texto.lines_of(texto.blame(v)[1]), [[(0, "1 — "), (1, "Uno"), (0, ".")], [(0, "2 — "), (1, "Duo"), (0, ".")]])

    def test_lines(self):
        spans = texto.blame(["1 — Um.\n2 — Dois."])[0]
        self.assertEqual(texto.lines_of(spans), [[(0, "1 — Um.")], [(0, "2 — Dois.")]])


class Atos(unittest.TestCase):
    def test_parse_altered(self):
        d = atos.parse("Alterado pelo/a Artigo 2.º do/a [L]Lei n.º 64/2025  - Diário da República n.º 216/2025, Série I de 2025-11-07[/L], em vigor a partir de 2025-11-12")
        self.assertEqual((d["tipo"], d["id"], d["artigo_do_ato"], d["publicacao"], d["vigor"]),
                         ("alterado", "lei-64-2025", "Artigo 2.º", "2025-11-07", "2025-11-12"))

    def test_parse_link_and_old_spelling(self):
        d = atos.parse('Revogado pelo/a Artigo 53.º do/a [L]<a rel ="nofollow" href="/dr/detalhe/lei/56-2023-222477692" title=x">Lei n.º 56/2023  - Diário da República n.º 194/2023, Série I de 2023-10-06</a>[/L], em vigor a partir de 2023-10-07')
        self.assertEqual(d["link"], "https://diariodarepublica.pt/dr/detalhe/lei/56-2023-222477692")
        r = atos.parse("Rectificado pelo/a [L]Declaração de Rectificação n.º 24/2006  - Diário da República n.º 75/2006, Série I-A de 2006-04-17[/L], em vigor a partir de 2006-06-28")
        self.assertEqual((r["tipo"], r["id"]), ("retificado", "declaracao-de-rectificacao-24-2006"))

    def test_nota_source(self):
        d = atos.parse_fonte("Artigo 54.º, Lei n.º 56/2023  - Diário da República n.º 194/2023, Série I de 2023-10-06")
        self.assertEqual((d["artigo_do_ato"], d["id"]), ("Artigo 54.º", "lei-56-2023"))

    def test_lei_key(self):
        self.assertEqual(atos.lei_key("Lei n.º 5-A/2026"), ("Lei", "5-A", "2026"))
        self.assertEqual(atos.lei_key("Lei Constitucional n.º 1/89"), ("Lei Constitucional", "1", "1989"))
        self.assertIsNone(atos.lei_key("Decreto-Lei n.º 49/2025"))


def frag(name):
    return {"ConsolidacaoFragmento": {"Name": name}}


class Build(unittest.TestCase):
    def test_ids_for_a_code_in_an_annex(self):
        anexo = [{"nivel": 1, "tipo": build.ANEXO, "nome": "Anexo"}]
        items = [([], frag("Artigo 1.º")), (anexo, frag("Artigo 1.º")), (anexo, frag("Artigo 87.º-A"))]
        self.assertEqual(build.assign_ids(items, True), ["lei-artigo-1", "artigo-1", "artigo-87-a"])

    def test_ids_prefix_only_on_collision(self):
        parte = [{"nivel": 1, "tipo": build.ANEXO, "nome": "Princípios fundamentais"}]
        anexo = [{"nivel": 1, "tipo": build.ANEXO, "nome": "Anexo"}]
        items = [(parte, frag("Artigo 1.º")), (anexo, frag("Artigo 1.º")), (anexo, frag("Artigo 1064.º"))]
        self.assertEqual(build.assign_ids(items, False), ["artigo-1", "anexo-artigo-1", "artigo-1064"])

    def test_vigor_rules(self):
        cfg = {"vigor_original": {"data": "2009-02-17", "regra": "supletiva", "fonte": "Lei n.º 74/98"},
               "notas_vigor": [{"artigos": ["artigo-40"], "texto": "Espera outra lei.", "fonte": "art. 14.º", "condicional": True}]}
        a = {"versoes": [{"tipo": "original", "vigor": None, "vigor_conhecido": False}], "notas": []}
        build.apply_vigor_rules(a, "artigo-1", cfg)
        self.assertEqual((a["versoes"][0]["vigor"], a["versoes"][0]["vigor_regra"]), ("2009-02-17", "supletiva"))
        b = {"versoes": [{"tipo": "original", "vigor": None, "vigor_conhecido": False}], "notas": []}
        build.apply_vigor_rules(b, "artigo-40", cfg)
        self.assertEqual((b["versoes"][0]["vigor"], b["versoes"][0]["vigor_regra"]), (None, "condicional"))
        self.assertEqual(b["notas"][0]["tipo"], "vigor")


class Passagem(unittest.TestCase):
    def test_counts_and_dissent(self):
        v = passagem.ler_voto({"PS": "favor", "4-PS": "contra", "PSD": "abstencao", "Manuel Alegre (PS)": "contra", "Joacine Katar Moreira (Ninsc)": "favor"})
        self.assertEqual(v["grupos"], {"PS": "favor", "PSD": "abstencao"})
        self.assertIn({"grupo": "PS", "sentido": "contra", "n": 4}, v["dissidencia"])
        self.assertIn({"grupo": "PS", "sentido": "contra", "nome": "Manuel Alegre"}, v["dissidencia"])
        self.assertEqual(v["fora_de_grupo"], [{"nome": "Joacine Katar Moreira", "sentido": "favor"}])

    def test_electronic_vote(self):
        v = passagem.ler_voto({"119-PS": "favor", "68-PSD": "contra", "1-PAN": "abstencao"})
        self.assertEqual(v["grupos"], {"PS": "favor", "PSD": "contra", "PAN": "abstencao"})
        chk = passagem.verificar(v, "Aprovado", {"PS": 120, "PSD": 77, "PAN": 1})
        self.assertEqual((chk["ok"], chk["favor"], chk["contra"], chk["metodo"]), (True, 119, 68, "contagens"))

    def test_check_catches_a_wrong_result(self):
        # Código do Trabalho, proposal 5P of the PCP: recorded as approved, the majority voted against.
        v = passagem.ler_voto({"BE": "favor", "PEV": "favor", "PCP": "favor", "PS": "contra", "PSD": "contra", "CDS-PP": "contra"})
        chk = passagem.verificar(v, "Aprovado", {"PS": 121, "PSD": 75, "PCP": 12, "CDS-PP": 12, "BE": 8, "PEV": 2})
        self.assertFalse(chk["ok"])
        self.assertIsNone(passagem.verificar(v, "Aprovado", {"PS": 121}))  # a group without seats: no check

    def test_dissent_counts_come_off_the_group(self):
        v = passagem.ler_voto({"PS": "favor", "2-PS": "abstencao", "PSD": "contra"})
        chk = passagem.verificar(v, "Aprovado", {"PS": 120, "PSD": 77})
        self.assertEqual((chk["favor"], chk["abstencao"], chk["contra"]), (118, 2, 77))

    def test_description(self):
        self.assertEqual(passagem.ler_descricao("Proposta 30P, apresentada pelo PS, de emenda do n.º 1 ao artigo 112.º (Anexo)"),
                         {"proponente": "PS", "operacao": "emenda", "alvo": "n.º 1 ao artigo 112.º"})
        d = passagem.ler_descricao("Proposta de alteração do PSD – Eliminação da alínea c) do n.º 2 do artigo 1.º do texto final")
        self.assertEqual((d["proponente"], d["operacao"]), ("PSD", "eliminação"))
        self.assertTrue(d["alvo"].startswith("alínea c) do n.º 2 do artigo 1.º"))
        self.assertIsNone(passagem.ler_descricao("Texto final apresentado pela Comissão de Trabalho"))

    def test_seats_on_a_date(self):
        comp = passagem.Composicao({"GruposParlamentares": [{"sigla": "PS"}, {"sigla": "PSD"}], "Deputados": [
            {"DepSituacao": [{"sioDes": "Efetivo", "sioDtInicio": "2022-03-29", "sioDtFim": "2024-03-25"}], "DepGP": [{"gpSigla": "PS", "gpDtInicio": "2022-03-29", "gpDtFim": "2024-03-25"}]},
            {"DepSituacao": [{"sioDes": "Suplente", "sioDtInicio": "2022-03-29", "sioDtFim": "2024-03-25"}], "DepGP": [{"gpSigla": "PS", "gpDtInicio": "2022-03-29", "gpDtFim": "2024-03-25"}]},
            {"DepSituacao": [{"sioDes": "Efetivo", "sioDtInicio": "2023-01-01", "sioDtFim": None}], "DepGP": [{"gpSigla": "PPD/PSD", "gpDtInicio": "2022-03-29", "gpDtFim": None}]}]})
        self.assertEqual(comp.ordem, ["PS", "PSD"])
        self.assertEqual(comp.assentos("2022-06-01"), {"PS": 1})
        self.assertEqual(comp.assentos("2023-06-01"), {"PS": 1, "PSD": 1})


if __name__ == "__main__":
    unittest.main()
