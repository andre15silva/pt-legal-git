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
| Compare two redações (`de` and `ate` take an act id, a date or `hoje`) | `#/d/codigo-irc/artigo-87/comparar?de=lei-82-2023&ate=hoje&vista=lado&modo=marcadas` |
| What one act changed in one article | `#/d/nrau/artigo-15-a/comparar?ato=lei-56-2023` |
| One act: what it changed and its passage through Parliament | `#/ato/lei-56-2023` |
| One parliamentary initiative | `#/iniciativa/315386` |

Old links with a redação index (`redacao=3`, `de=1`) still work.

## How the data is made

1. `fetch.py` calls the DR web app's JSON endpoints (see [`tools/dr_client.py`](../tools/dr_client.py)). For each diploma it fetches the structure as of today, the original text, the list of amending acts, and the version history of every article. Responses are cached by a hash of the request.
2. `build.py` turns each article into a list of versions, oldest first:
   - Each version has the act that made it, its publication date, its entry-into-force date (when the DR gives one), and its text.
   - Revocations become "(Revogado.)".
   - It diffs consecutive versions word by word. Each word keeps the index of the version that wrote it; this is the *origem do texto*.
   - A rewritten phrase is one change. A short unchanged run between two replacements joins them when it is not longer than either replacement (the diff-match-patch semantic rule). The compare view uses the same rule, in `app.js`. `node app/test_diff.js` checks it and, when `app/data` exists, checks that every compare view rebuilds both texts exactly.
3. It links each law to its parliamentary initiative through the AR open data: `Diplomas Aprovados` gives the law's number and the initiatives behind it, and `Iniciativas` gives their events and votes.
4. `passagem.py` turns those events into the passage of each act (`data/passagem.json`): who proposed it, the dated steps, and each vote by group, with counts, dissent and absences. It reads the seats of each group on the vote date from `InformacaoBase`, and checks every result against them. A result that cannot be right ("Aprovado" with fewer votes for than against) is flagged on the page. See [`docs/PASSAGEM.md`](../docs/PASSAGEM.md).
5. An entry-into-force date before the publication date is a DR data error, and the build drops it (Decreto-Lei n.º 162/2014 has 1992). Retificações keep theirs: they take the date of the act they correct.

## Known limits

- The text comes from the DR's consolidated legislation, which has no legal value. We have not yet checked it against our own replay of the amending acts (see the plan, Phase 0).
- The DR gives production of effects only as text notes. The app shows the notes, and warns when the "produção de efeitos" basis is selected.
- About 1 in 5 amended versions have no entry-into-force date in the DR. The app shows these versions from their publication date and says so.
- The AR open data gives each parliamentary group's vote, and counts only for some votes. Where it has no counts, the app adds the seats of each group on that day; it says so under the vote. There are no votes per deputy, only named dissent.
- The especialidade votes in committee are only in PDFs (from legislatura XII). The app says that it does not have them.
