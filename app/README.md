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
python -I pipeline/fetch.py              # DR consolidated texts: about 8 minutes per large code, cached in data/cache/
python -I pipeline/fetch_parlamento.py   # AR open data: Iniciativas and Diplomas Aprovados, about 900 MB
python -I pipeline/pendentes.py          # texts of the bills now in Parliament (needs pdftotext, from poppler)
python -I pipeline/assinaturas.py        # signature blocks of acts not in pipeline/assinaturas.json (one fetch per act, cached)
python -I pipeline/build.py              # writes app/data/ and copies the design system to app/ds/
python3 -m http.server 8000 -d app       # then open http://localhost:8000
```

`app/data/d/<slug>.json` holds a diploma's índice and metadata. `app/data/d/<slug>/<artigo>.json` holds one article's history. A page loads only the files it shows: the Código do Trabalho índice is 144 KB, not 1.6 MB.

The hand-checked corpus has 14 diplomas: the Constitution, the Código do Trabalho, the Código Civil, the NRAU, the Códigos do IRS, do IRC and do IVA, the Lei Geral Tributária, the Estatuto dos Benefícios Fiscais, the Código Penal, the Códigos de Processo Civil and de Processo Penal, the Código das Sociedades Comerciais and the Lei n.º 74/98. We left out the Código da Estrada: the DR's consolidated text of it starts in 2020 and stops at Decreto-Lei n.º 102-B/2020.

### Adding diplomas

Two lists say which diplomas the site has:

- [`pipeline/corpus.json`](../pipeline/corpus.json): set up and checked by hand.
- [`pipeline/alvos.json`](../pipeline/alvos.json): only a name, an abbreviation, an area and the act that approved each one. [`pipeline/descobrir.py`](../pipeline/descobrir.py) does the rest and writes `pipeline/corpus-auto.json`:
  1. It finds the DR record in `data/catalogo.json` (every consolidated law and decree-law, from [`pipeline/catalogo.py`](../pipeline/catalogo.py)). When several records name the diploma (the act that approved it, a later republication), it keeps the one whose amending acts reach furthest.
  2. It finds the annex that holds the code, by its heading.
  3. It reads the approving act's article on entry into force (a date, or "no dia seguinte", "30 dias após", "no primeiro dia do mês seguinte"); without one, it uses the default rule of the period.
  4. It notes when the history starts at a republication, and writes the names and the pattern that finds bills in Parliament.

  It prints what a person should check. The build checks each generated diploma again and leaves it off the site when it does not hold up (no articles, or most redações without a date).

```bash
python -I pipeline/catalogo.py    # once: about 2800 records, 45 minutes, cached
python -I pipeline/descobrir.py   # writes pipeline/corpus-auto.json and prints what to check
```

To add a diploma, add a line to `alvos.json` and run `descobrir.py`. The daily job fetches it, within a time budget of 2 hours per run, so a large addition arrives over a few days. To fix a generated entry by hand, move it to `corpus.json`.

Choose which diplomas to include in [`pipeline/corpus.json`](../pipeline/corpus.json). Each entry needs the DR consolidation ID (`frag_id`, `tipo`, `key`, all taken from the consolidated-text URL). Where the DR leaves a date out, the entry records the entry-into-force rule for the original text, with the provision that sets it.

## Website

[`.github/workflows/site.yml`](../.github/workflows/site.yml) builds the data and publishes `app/` on GitHub Pages every day at 05:41 UTC, and after each push that changes the app or the pipeline:

1. It restores `data/` from the Actions cache (about 1 GB, mostly the AR open data).
2. It downloads the AR files of the current legislatura again (`fetch_parlamento.py --refresh XVII`).
3. It asks the DR for each diploma's list of amending acts as of today, and fetches again only the diplomas whose list changed (`fetch.py --se-mudou`, with `REDACAO_HOJE` set to the day).
4. It reads the texts of new bills (`pendentes.py`), builds, and runs the tests and the verification floors. If anything fails, the site keeps the last good version.
5. It saves `data/` to the cache and deploys.

To set it up once: in the repository settings, Pages → Build and deployment → Source: **GitHub Actions**. Then run the workflow by hand (Actions → site → Run workflow). The first run has no cache and fetches everything, which takes about 2 hours. Later runs take minutes. To fetch every diploma again, run it by hand with "completo" ticked.

When the DR changes its web app, `dr_client.py` stops with `StaleApiVersion` and the run fails; the hashes need updating (see that file).

## URLs

| Route | View | Params |
|---|---|---|
| `#/` | Home | |
| `#/d/<slug>` | Diploma | |
| `#/d/<slug>/<artigo>` | Article | `redacao=<ato>`, `ver=texto\|mudou\|origem`, `com=<ato>`, `lado=1`, `em=<data>&base=vigor`, `ato=<ato>`, `de=partilha` |
| `#/alteracoes/<slug>` | What changed in a whole diploma between two dates | `de=<data>`, `ate=<data>` |
| `#/ato/<id>` | Act: who made it, what it changed, its votes. An id in `index.aliases_atos` is replaced by the canonical id. | |
| `#/iniciativa/<id>` | One parliamentary initiative (or a bill now in Parliament) | |
| `#/quem/<slug>` | Who made each change to a diploma, by Government | `por=legislatura` |
| `#/grupos`, `#/grupo/<id>` | Parliamentary groups | `diploma=<slug>` |
| `#/historias`, `#/historia/<slug>` | Stories | |
| `#/glossario`, `#/glossario/<id>` | Glossary; `<id>` scrolls to the entry | |
| `#/verificacao` | Checks of the text and of who made each act | |
| `#/sobre`, `#/sobre/<ancora>` | About; scrolls to `limites`, `quem`, `votacoes` | |
| any | | `ir=<element id>` scrolls there and focuses its heading |

Examples: `#/d/codigo-irc/artigo-87?redacao=lei-64-2025&ver=mudou`, `#/alteracoes/codigo-do-trabalho?de=2023-01-01&ate=2026-10-29`,
`#/quem/nrau?por=legislatura`, `#/grupo/cds-pp?diploma=lei-nacionalidade`.
Old links still work: a redação index (`redacao=3`), the old compare page (`/comparar?de=…&ate=…&vista=lado`), and old act ids
(`iii-acordao-do-tribunal-constitucional-299-2020`, `decreto-lei-329-a-95-1-parte`, `declaracao`) through `index.json.aliases_atos`.

## Data (`app/data/`)

Built by `pipeline/build.py`; checked by `python -I pipeline/contrato.py app/data`. The same validator runs on the shared fixture
(`pipeline/fixtures/contrato/app-data/`, synthetic Governments and Presidents, real AR group names). Dates are ISO `AAAA-MM-DD`.
A `null` fact has a reason code next to it (`motivos`).

| File | Holds |
|---|---|
| `index.json` | diplomas, search synonyms, `aliases_atos` (old act id → canonical id) |
| `d/<slug>.json` | a diploma's tree; `copia` (`{inicio, diploma, rotulo}`) when part of it is a copy of another diploma (the NRAU's annex) |
| `d/<slug>/<artigo>.json` | one article's redações, oldest first; `copia_de` (`{diploma, artigo}`) on a copied article |
| `atos.json` | every act: designation, publication, link, sumário, `alteracoes[]`, `tipo_ato`, `ar`, `iniciativas` |
| `passagem.json` | each law's passage: initiatives, `texto_comissao[]`, `passos`, `decreto`, `generalidade[]`, `vfg`, `eventos[]`, `descartados[]`, `motivos`. Every vote carries `legislatura` (of its date) and the siglas of that legislatura. |
| `iniciativas.json`, `pendentes.json` | initiatives linked to acts; bills now in Parliament |
| `pesquisa.json` | `[slug, artigo, rótulo, epígrafe, estado, copia_de]` per article |
| `quem.json` | one record per act (below) |
| `governos.json` | `governos[]`, `presidentes[]`, `legislaturas[]`, `grupos{id: {nomes[]}}`, `siglas{leg: {sigla: id}}` |
| `quem/<slug>.json` | a diploma's timeline: `por_governo[]`, `por_legislatura[]` (each `{total, listas: {decretos_leis, propostas, outras, publicados_sem_d_cm}}`), `fora{}`, `retificacoes{}` |
| `grupos/index.json`, `grupos/<id>.json` | groups, alphabetical; a group's initiatives that became a law (`como`: `propria` \| `juntada`) and its generalidade positions by diploma |
| `verificacao.json` | checks against official republications; `quem` (signature coverage, cross-check, dropped steps and votes); `conteudo` (content withheld) |
| `glossario.json`, `historias/`, `partilha.json` | written by `pipeline/conteudo.py` |

**`quem.json` record (R-14).** Keys: `tipo_ato` (`decreto-lei`, `lei`, `lei-organica`, `lei-constitucional`, `retificacao`, `acordao-tc`,
`acordao-outro`, `pre1976`, `aprovacao-constituicao`, `portaria`, `resolucao`, `dlr`, `outro`); `governo` (`{numero, base:
"conselho_ministros", data}`, decretos-leis only); `governo_publicacao`; `d_cm`; `em_gestao`; `presidente` (`{id, nome, d_promulgacao,
base: "assinatura"|"parlamento"}`, plus `interino: true` and `id: null` for an interim President); `legislatura`; `periodo` (`{data, base:
d_cm|vfg|reapreciacao|publicacao, governo, legislatura, fora}`); `proponentes[]` (`{iniciativa, designacao, tipo:
governo|grupos|cidadaos|regiao|comissao|mesa, governo, entrada, grupos[{id, sigla}], sem_grupo[], nome, resultado_generalidade}`, by
entry date, never by `principal`); `texto_comissao` (`{tipo, n_iniciativas, iniciativas[{iniciativa, designacao, parte}]}`); `vfg`;
`eventos[]` (`veto` with `presidente` and `acordao_tc`, `tribunal`, `confirmacao`, `novo_decreto`); `retifica`; `retificado_por[]`;
`tribunal` (`{tribunal, data, data_base, normas[{diploma, artigo, numeros, escrito_por, efeitos_desde, tipo}]}`); `pre1976`
(`{signatarios[]}`); `oe` (`{ano}`); `transitorias[]`; `ar_url`; `assinatura` (`{estado: ok|parcial|falhou|sem_link|por_ler, obtido_em,
url}`); `motivos` (keys `governo`, `presidente`, `d_cm`, `vfg`, `passos`, `passagem`, `generalidade`); `verificacao[]` (`{regra:
presidente|referenda|cm_primeiro|promulgacao_ar|mesmo_pm, estado: ok|aviso|conflito, detalhe}`).

**Reason codes** (`motivos` values): `sem_d_cm`, `sem_link`, `sem_texto`, `por_ler`, `sessao_em_falta`, `sem_ar`, `antes_1976`,
`antes_governo_constitucional`, `tabela_aberta`, `conflito`, `voto_ambiguo`, `passos_descartados`, `sem_registo_vfg`, `sem_generalidade`.
The app turns each into one sentence (design spec §2.10). Method: [docs/QUEM.md](../docs/QUEM.md).

## How the data is made

1. `fetch.py` calls the DR web app's JSON endpoints (see [`tools/dr_client.py`](../tools/dr_client.py)). For each diploma it fetches the structure as of today, the original text, the list of amending acts, and the version history of every article. Responses are cached by a hash of the request.
2. `build.py` turns each article into a list of versions, oldest first:
   - Each version has the act that made it, its publication date, its entry-into-force date (when the DR gives one), and its text.
   - Revocations become "(Revogado.)".
   - It diffs consecutive versions word by word. Each word keeps the index of the version that wrote it; this is the *origem do texto*.
   - A rewritten phrase is one change. A short unchanged run between two replacements joins them when it is not longer than either replacement (the diff-match-patch semantic rule). The Alterações view uses the same rule, in `app.js`. `node app/test_diff.js` checks it and, when `app/data` exists, checks that every compare view rebuilds both texts exactly.
3. It links each law to its parliamentary initiative through the AR open data: `Diplomas Aprovados` gives the law's number and the initiatives behind it, and `Iniciativas` gives their events and votes.
4. `passagem.py` turns those events into the passage of each act (`data/passagem.json`): who proposed it, the dated steps, and each vote by group, with counts, dissent and absences. It reads the seats of each group on the vote date from `InformacaoBase`, and checks every result against them. A result that cannot be right ("Aprovado" with fewer votes for than against) is flagged on the page. Votes and events of another decree of the same initiative, or dated after the publication, are dropped (the matching cascade, [`docs/PASSAGEM.md`](../docs/PASSAGEM.md) §8). The app shows the votação na generalidade, the votação final global, and the veto, Tribunal Constitucional ruling and confirmation when there are any.
5. An entry-into-force date before the publication date is a DR data error, and the build drops it (Decreto-Lei n.º 162/2014 has 1992). Retificações keep theirs: they take the date of the act they correct.
6. `pendentes.py` finds the bills now in Parliament (current legislatura) that would change a diploma: Projetos and Propostas de Lei not yet law, not rejected on the generalidade vote, not withdrawn, and not replaced by a text that became law. The bill's title names the diploma (the `iniciativas` pattern in `corpus.json`). The bill's text names the articles: each of its articles that amends the diploma says so in its first sentence ("São alterados os artigos 170.º e 178.º do Código Penal"). The diploma page lists the bills and marks the articles they would change; the article page lists the bills that name it. `data/pendentes.json` holds them.
7. [`pipeline/sinonimos.json`](../pipeline/sinonimos.json) holds the words people use and the words the law uses ("inquilino" and "arrendatário", "horas extra" and "trabalho suplementar"). Search matches either.
8. `verificacao.py` compares each version with the official republications listed in `corpus.json` (for the Constitution: the 1976 text and the 7 revisions, fetched by `fetch.py`). Each version gets a verdict (igual, só na forma, desatualizada, divergente); `data/verificacao.json` holds the report. `replay.py` then applies each revision's instructions to the previous official text and measures how much of the next one it reproduces (M1).

## Known limits

- The text comes from the DR's consolidated legislation, which has no legal value. For the Constitution, `verificacao.py` checks every version against the official republications, and the article page says the result. The other diplomas are not checked yet.
- The DR gives production of effects only as text notes. The app shows the notes, and warns when the "produção de efeitos" basis is selected.
- About 1 in 5 amended versions have no entry-into-force date in the DR. The app shows these versions from their publication date and says so.
- Tables in the law (the IRS rates in art. 68.º of the CIRS) come from the DR as HTML tables. The pipeline writes each row as one line, `│ cell │ cell │ cell`, filling merged cells (colspan, rowspan) with empty cells so the rows of a table have the same number of cells. The app shows the rows as a grid: text in the first column, numbers right-aligned. Changes inside a cell are marked as in any line. In Origem do texto the rows of one table share one margin note.
- The AR open data gives each parliamentary group's vote, and counts only for some votes. Where it has no counts, the app adds the seats of each group on that day; it says so under the vote. There are no votes per deputy, only named dissent.
- Bills in Parliament: we read the articles from the first sentence of each article of the bill. A bill that changes only a list or an annex (the IVA rate lists), or whose PDF has no text layer, is listed on the diploma without articles. A bill that changes a part of a code we do not have (Código Civil outside the locação) is left out.
- Some codes start their history at a republication or revision: the CIRC (2014), the CIRS (2015), the CIVA (2008) and the Código Penal (1995). The page says so on the first redação. The DR has no consolidated text for the years before: its page for Decreto-Lei n.º 442-A/88 sends readers to the 2014 republication of the CIRS, and the consolidation of Decreto-Lei n.º 198/2001 (CIRS, CIRC and EBF) records only the changes of 2001 and 2002.
- The especialidade votes in committee are only in PDFs (from legislatura XII). The app says that it does not have them.
