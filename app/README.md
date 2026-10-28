# Redação: the visualizer

A static web app that shows the history of each article of Portuguese law:

- **Article** — the text on any date, with the three date bases (em vigor, produção de efeitos, publicação). Each phrase is coloured by the act that wrote it. A timeline lists every version, with notes from the Diário da República (DR) and a ready-to-paste citation.
- **Compare** — a word-level redline between any two versions, plus every version in between.
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

## How the data is made

1. `fetch.py` calls the DR web app's JSON endpoints (see [`tools/dr_client.py`](../tools/dr_client.py)). For each diploma it fetches the structure as of today, the original text, the list of amending acts, and the version history of every article. Responses are cached by a hash of the request.
2. `build.py` turns each article into a list of versions, oldest first:
   - Each version has the act that made it, its publication date, its entry-into-force date (when the DR gives one), and its text.
   - Revocations become "(Revogado.)".
   - It diffs consecutive versions word by word. Each word keeps the index of the version that wrote it; this is the *origem do texto*.
3. It links each law to its parliamentary initiative through the AR open data: `Diplomas Aprovados` gives the law's number and the initiatives behind it, and `Iniciativas` gives their events and votes.

## Known limits

- The text comes from the DR's consolidated legislation, which has no legal value. We have not yet checked it against our own replay of the amending acts (see the plan, Phase 0).
- The DR gives production of effects only as text notes. The app shows the notes, and warns when the "produção de efeitos" basis is selected.
- About 1 in 5 amended versions have no entry-into-force date in the DR. The app shows these versions from their publication date and says so.
- The AR open data gives each parliamentary group's vote but not its number of deputies.
