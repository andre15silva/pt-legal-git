"""Unit tests for the Phase-0 tools: python -I -m unittest discover -s tools"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from link_dr import eli, words  # noqa: E402
from estilo import check, word_count  # noqa: E402
from parlamento import normalise, parse_positions  # noqa: E402


class ParsePositions(unittest.TestCase):
    def test_groups_by_sentido(self):
        detalhe = "A Favor: <I>PSD</I>, <I> CH</I><BR>Contra:<I>PCP</I>, <I> BE</I><BR>Abstenção:<I>PS</I>, <I> L</I>"
        self.assertEqual(parse_positions(detalhe), {"PSD": "favor", "CH": "favor", "PCP": "contra", "BE": "contra", "PS": "abstencao", "L": "abstencao"})

    def test_split_group_kept_verbatim(self):
        self.assertEqual(parse_positions("A Favor: <I>PSD</I>, <I>13-PS</I><BR>Contra:<I>1-PS</I>"), {"PSD": "favor", "13-PS": "favor", "1-PS": "contra"})

    def test_empty(self):
        self.assertEqual(parse_positions(None), {})


class Normalise(unittest.TestCase):
    def test_publication_and_link(self):
        ini = {"IniId": "1", "IniLeg": "XVII", "IniDescTipo": "Proposta de Lei", "IniNr": "16", "IniTitulo": " Altera o CIRC ",
               "IniAutorOutros": {"nome": "Governo", "sigla": "V"},
               "IniEventos": [
                   {"DataFase": "2025-11-07T00:00:00", "Fase": "Lei (Publicação DR)", "TextosAprovados": "105166"},
                   {"DataFase": "2025-07-18", "Fase": "Entrada"},
                   {"DataFase": "2025-10-17", "Fase": "Votação final global", "Votacao": [
                       {"resultado": "Aprovado", "detalhe": "A Favor: <I>PSD</I><BR>Contra:<I>PS</I>", "data": "2025-10-17"}]}]}
        i = normalise(ini)
        self.assertEqual(i.published_dr, "2025-11-07")
        self.assertEqual(i.approved_text_id, "105166")
        self.assertEqual(i.events[0], ("2025-07-18", "Entrada"))
        self.assertEqual(i.votes[0].positions, {"PSD": "favor", "PS": "contra"})
        self.assertEqual(i.authors, ["Governo"])


class Linking(unittest.TestCase):
    def test_eli(self):
        self.assertEqual(eli("Lei", "64", "2025", "2025-11-07"), "https://data.dre.pt/eli/lei/64/2025/11/07/p/dre/pt/html")
        self.assertEqual(eli("Lei", "5-A", "2026", "2026-01-28"), "https://data.dre.pt/eli/lei/5-a/2026/01/28/p/dre/pt/html")
        self.assertIsNone(eli("Resolução", "1", "2026", "2026-01-01"))

    def test_words_ignores_accents_and_stopwords(self):
        self.assertEqual(words("Altera o Código do IRC"), {"altera", "codigo", "irc"})


class Estilo(unittest.TestCase):
    def rules(self, text):
        return {rule for level, rule, _ in check(text) if level == "erro"}

    def test_llmish_and_pt_br(self):
        self.assertEqual(self.rules("Descubra a história completa de forma intuitiva! Clique para salvar o arquivo."), {"8", "4.3", "1.5"})

    def test_grammar(self):
        self.assertIn("2.2", self.rules("O sistema está mostrando a lei."))
        self.assertIn("2.3", self.rules("O artigo tem sido alterado muitas vezes."))
        self.assertIn("4.1", self.rules("A taxa é de 19 %; o texto diz 17 %."))

    def test_legal_dashes_allowed(self):
        self.assertEqual(self.rules("Artigo 87.º — Taxas"), set())
        self.assertEqual(self.rules("Capítulo IV — Taxas"), set())
        self.assertIn("4.2", self.rules("A lei — como sabe — mudou."))

    def test_quotes_are_cited_not_used(self):
        self.assertEqual(self.rules("Não escreva «descubra»."), set())

    def test_length(self):
        self.assertEqual(word_count("Para ver a lei noutra data, escolha a data (Lei n.º 74/98, art. 2.º)."), 10)
        self.assertIn("3.1", self.rules("Escolha " + "a data " * 12 + "."))

    def test_clean_copy_passes(self):
        self.assertEqual(self.rules("Para períodos de tributação que começam em 2026, a taxa é de 19 %. O texto do artigo diz 17 %."), set())


if __name__ == "__main__":
    unittest.main()
