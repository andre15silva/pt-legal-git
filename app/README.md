# Redação: the visualizer

A static web app that shows the history of each article of Portuguese law:

- **Article** — the text on any date, with the three date bases (em vigor, produção de efeitos, publicação).
  - A version bar steps to the previous or next redação and keeps the reader's place.
  - Each redação states the period it applied, and an old redação never shows as in force.
  - The text shows plain, with the changes against the previous redação marked, or with each phrase coloured by the act that wrote it.
  - A timeline lists every redação, with notes from the Diário da República (DR) and a ready-to-paste citation.
- **Compare** — a word-level redline between any two redações, inline or side by side, with unchanged números folded, plus every redação in between.
- **Act** — what an amending act changed, its dates, and the parliamentary initiative it came from.
- **Initiative** — the legislative process and each vote, by parliamentary group.
- **Search** — by article number and acronym ("art 87 circ"), or by words of the article title.

It uses the [Redação design system](../design-system/) components and follows the copy standard in [docs/ESTILO.md](../docs/ESTILO.md).

## Build and run

The data is not committed. Build it locally from the official sources:

```bash
python -I pipeline/fetch.py              # DR consolidated texts: about 8 minutes for the 4 diplomas, cached in data/cache/
python -I pipeline/fetch_parlamento.py   # AR open data: Iniciativas and Diplomas Aprovados, about 900 MB
python -I pipeline/build.py              # writes app/data/ and copies the design system to app/ds/
python3 -m http.server 8000 -d app       # then open http://localhost:8000
```

Choose which diplomas to include in [`pipeline/corpus.json`](../pipeline/corpus.json). Each entry needs the DR consolidation ID (`frag_id`, `tipo`, `key`, all taken from the consolidated-text URL). Where the DR leaves a date out, the entry records the entry-into-force rule for the original text, with the provision that sets it.

## URLs

| What | URL |
|---|---|
| An article at a date | `#/d/codigo-irc/artigo-87?em=2026-03-01&base=vigor` |
| One redação, named by the act that made it | `#/d/codigo-irc/artigo-87?redacao=lei-64-2025` |
| What the text box shows | `&ver=texto`, `&ver=mudou` or `&ver=origem` |
| What changed in a redação, against the one before | `#/d/codigo-irc/artigo-87?redacao=lei-64-2025&ver=mudou` |
| Against any other redação, side by side | `&com=lei-82-2023&lado=1` |
| Walk through the articles one act changed | `#/d/nrau/artigo-15-a?redacao=lei-56-2023&ver=mudou&ato=lei-56-2023` |
| One act: what it changed and its votação na generalidade | `#/ato/lei-56-2023` |
| One parliamentary initiative | `#/iniciativa/315386` |
| The check of the text against the official republications | `#/verificacao` |

Old links still work: a redação index (`redacao=3`) and the old compare page (`/comparar?de=…&ate=…&vista=lado`), which redirects to the Alterações view.

## How the data is made

1. `fetch.py` calls the DR web app's JSON endpoints (see [`tools/dr_client.py`](../tools/dr_client.py)). For each diploma it fetches the structure as of today, the original text, the list of amending acts, and the version history of every article. Responses are cached by a hash of the request.
2. `build.py` turns each article into a list of versions, oldest first:
   - Each version has the act that made it, its publication date, its entry-into-force date (when the DR gives one), and its text.
   - Revocations become "(Revogado.)".
   - It diffs consecutive versions word by word. Each word keeps the index of the version that wrote it; this is the *origem do texto*.
   - A rewritten phrase is one change. A short unchanged run between two replacements joins them when it is not longer than either replacement (the diff-match-patch semantic rule). The Alterações view uses the same rule, in `app.js`. `node app/test_diff.js` checks it and, when `app/data` exists, checks that every compare view rebuilds both texts exactly.
3. It links each law to its parliamentary initiative through the AR open data: `Diplomas Aprovados` gives the law's number and the initiatives behind it, and `Iniciativas` gives their events and votes.
4. `passagem.py` turns those events into the passage of each act (`data/passagem.json`): who proposed it, the dated steps, and each vote by group, with counts, dissent and absences. It reads the seats of each group on the vote date from `InformacaoBase`, and checks every result against them. A result that cannot be right ("Aprovado" with fewer votes for than against) is flagged on the page. See [`docs/PASSAGEM.md`](../docs/PASSAGEM.md). For now the app shows only the votação na generalidade: each initiative's own vote, and the vote on the committee's texto de substituição when there is one.
5. An entry-into-force date before the publication date is a DR data error, and the build drops it (Decreto-Lei n.º 162/2014 has 1992). Retificações keep theirs: they take the date of the act they correct.
6. `verificacao.py` compares each version with the official republications listed in `corpus.json` (for the Constitution: the 1976 text and the 7 revisions, fetched by `fetch.py`). Each version gets a verdict (igual, só na forma, desatualizada, divergente); `data/verificacao.json` holds the report. `replay.py` then applies each revision's instructions to the previous official text and measures how much of the next one it reproduces (M1).

## Known limits

- The text comes from the DR's consolidated legislation, which has no legal value. For the Constitution, `verificacao.py` checks every version against the official republications, and the article page says the result. The other diplomas are not checked yet.
- The DR gives production of effects only as text notes. The app shows the notes, and warns when the "produção de efeitos" basis is selected.
- About 1 in 5 amended versions have no entry-into-force date in the DR. The app shows these versions from their publication date and says so.
- The AR open data gives each parliamentary group's vote, and counts only for some votes. Where it has no counts, the app adds the seats of each group on that day; it says so under the vote. There are no votes per deputy, only named dissent.
- The especialidade votes in committee are only in PDFs (from legislatura XII). The app says that it does not have them.
