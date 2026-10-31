# Writing a story (histórias, long form)

A story is one Markdown file, `pipeline/historias/<slug>.md`, with a short front matter. The build
(`pipeline/historias.py`) checks every link and figure against the site's data and writes
`app/data/historias/<slug>.json`; the app draws each figure live, so a figure always shows the data of the day.
Static images go in `pipeline/historias/img/`. The build writes `<slug>.lock.json`: never edit it by hand.

```bash
python -I pipeline/historias.py --sintaxe                    # the checks that need no app/data (CI runs this)
python -I pipeline/historias.py --sintaxe pipeline/historias/<slug>.md
python -I pipeline/historias.py                              # every check, against app/data (strict)
python -I pipeline/conteudo.py                               # rebuild app/data/historias and the share pages (~2 s)
python -I pipeline/historias.py --atualizar <slug>           # after re-reading every figure: write the lock
python -I pipeline/historias.py --exemplo                    # an example with every feature: #/historia/exemplo
```

Messages read `<file>.md:<line>: [RULE] message`; lines that start with `aviso:` are warnings. Two full
examples: [`../fixtures/historias/exemplo.md`](../fixtures/historias/exemplo.md) (real data, every figure type)
and [`../fixtures/historias/teste.md`](../fixtures/historias/teste.md) (the test fixture).

## 1. Front matter

Between two `---` lines. One `chave: valor` per line; a value goes on over lines indented by two spaces;
lists are comma-separated.

```
---
slug: nacionalidade-desde-1981          the file name, without .md
titulo: Quem pode ser português
resumo: The dek: up to 320 characters. A long value goes on
  over lines indented by two spaces.
data: 2026-11-15                        publication date (byline)
autoria: Redação                        byline
preparacao: assistida                   assistida | equipa
revisao_externa:                        empty, or «Nome Apelido, 2026-12-01»
consultado: 2026-11-10                  default consultation date of every URL in the notes
diplomas: lei-nacionalidade             the site slugs the story is about (the first one names articles without a genitive)
relacionadas: historia:arrendamento-desde-2012, quem:lei-nacionalidade, diploma:lei-nacionalidade
imagem_partilha:                        optional: img/<file>.png, 1200×630, ≤ 300 KB; empty: the drawn preview
---
```

Required: `slug`, `titulo`, `resumo`, `data`, `autoria`, `preparacao`, `consultado`, `diplomas`.
`relacionadas` feeds «Continuar a ler» (schemes `historia:`, `quem:`, `diploma:`, `ato:`, `artigo:`).

## 2. The body

| Write | Meaning |
|---|---|
| a blank line | a new paragraph |
| `## Subtítulo` or `## Subtítulo {#ancora}` | a subhead; the anchor is the slugified text unless you give one. `###` sparingly |
| `*texto*` | italic: titles of documents, foreign words |
| `«…»` | a quotation. A quotation of 4 words or more needs a note or a site link in the same sentence |
| `[texto](esquema:alvo)` | a link to the site (section 3) |
| `[](esquema:alvo)` | the same, with the text written from the data |
| `[^id]` | a note marker; the definition goes at the end (section 4) |
| `> «…»` then `> — Atribuição[^id]` | a pull quote: two lines, the attribution with a note |
| ```` ```figura <tipo> ```` … ```` ``` ```` | a figure (section 5), between paragraphs |

Not allowed: HTML, bold, lists, tables, `#` titles, and `https://` links in the prose or in a caption
(put the source in a note).

## 3. Site links

The redação key `<r>` is the act that wrote that redação (`lei-organica-2-2006`), or `<ato>-<k>` for the
k-th redação the same act wrote of that article. Never `hoje`. An article of the NRAU's annexed copy of the
Código Civil is an error: cite `codigo-civil`.

| Scheme | Goes to | Text when `[]` is empty |
|---|---|---|
| `ato:<id>`, `ato:<id>#generalidade` | the act page (its vote) | «Lei Orgânica n.º 2/2006, de 17 de abril» the first time, then the designation |
| `artigo:<slug>/<artigo>` | today's text | «artigo 6.º» (+ «da Lei …» if not the first diploma) |
| `artigo:<slug>/<artigo>@<r>` | that redação | the same |
| `mudou:<slug>/<artigo>@<r1>..<r2>`, `mudou:<slug>/<artigo>@<r2>` | the changes (against `r1`, or the redação before) | «o que mudou no artigo 6.º» |
| `origem:<slug>/<artigo>@<r>` | «Origem do texto» of that redação | «a origem do texto do artigo 6.º» |
| `iniciativa:<id>` | the initiative (AR id, e.g. `315160`) | «Proposta de Lei n.º 1/XVII» |
| `grupo:<id>` | the group page (`ps`, `psd`, `ch`, `cds-pp`…) | the group's name |
| `diploma:<slug>` | the diploma | its title |
| `quem:<slug>`, `quem:<slug>#governo-<n>` | «Quem fez cada alteração» | «quem fez cada alteração» |
| `governo:<n>`, `governo:<ato>` | the Government in «Quem fez» | «XXV Governo Constitucional» |
| `presidente:<ato>` | the act | the President who promulgated it |
| `data:<ato>.<campo>` | the act | «17 de abril de 2006»; `campo`: publicacao, vigor, promulgacao, generalidade, vfg, d_cm, veto |
| `historia:<slug>` | another story | its title |
| `fig:<id>` | a figure of this story | «figura 3» |

When you write the text yourself and it names a designation («Lei n.º 25/94»), it must be the target's
designation (R3); «, de 19 de agosto» right after an `ato:` link must be its publication date. The first plain
mention of an act on the site («Lei n.º 25/94») must be a link (R4).

## 4. Notes and sources

```
[^tc1133]: Tribunal Constitucional, *Acórdão n.º 1133/2025*.
  https://www.tribunalconstitucional.pt/tc/acordaos/20251133.html
[^dar]: *Diário da Assembleia da República*, I série, n.º 12, p. 3–9.
  https://debates.parlamento.pt/catalogo/r3/dar/01/17/01/012 (consultado a 2026-11-12)
[^votos]: Votação na generalidade: [](ato:lei-organica-1-2026#generalidade).
```

- Every note has at least one source: an `https://` URL or a site link. An explanation without a source
  belongs in the text.
- A URL takes the front matter `consultado` date, unless `(consultado a AAAA-MM-DD)` follows it.
- Prefer primary documents (DR, AR, TC, Presidência, Governo). Hosts outside the known list give a warning (N3).
- Notes are numbered by first use; a note can be cited several times. Every note must be used.

## 5. Figures

Every figure has `id` (`[a-z0-9-]`, unique; the anchor is `fig-<id>`) and `legenda` (15 to 70 words: what to
look at; links and notes allowed). Optional: `titulo` (else written from the data) and `largura`:
`texto` (650 px, the default), `larga` (1014 px, the text and side columns) or `lado` (fichas only: the side
column). On a phone every figure is the width of the text. Refer to each figure from the text with `[](fig:<id>)`.

### `diff`: an article between two redações

```figura diff
id: residencia-2006
artigo: lei-nacionalidade/artigo-6
de: lei-25-94                  optional: default the redação just before «para»
para: lei-organica-2-2006
mostrar: 1/b                   optional: números and alíneas
vista: texto                   texto (default) | lado (needs largura: larga; side by side from 1100 px)
legenda: A partir de 2006, a alínea b) pede seis anos de residência legal …
```

`mostrar`: `1` (the whole n.º 1), `1/b` (alínea b) of n.º 1, with the n.º's opening line), `2-A`, `/c`
(an alínea of an article without números), comma-separated. Each gap shows one line («⋯ n.os 2 a 5 não
mostrados»). Without `mostrar`, the unchanged paragraphs fold. The selection must contain a change (R2).

### `votacao`: the generalidade vote by group, then the final vote, veto and Court

```figura votacao
id: voto-2025
ato: lei-organica-1-2026
item: comissao                 optional: comissao | <initiative id>; default every item, as on the act page
legenda: …
```

Several initiatives without `item` give the table of initiatives, and the figure becomes `larga`.

### `cronologia`: a diploma's changes, by Government (or legislatura)

```figura cronologia
id: todas
diploma: lei-nacionalidade
desde: 1981-10-03              optional
ate:                           optional
artigos: 1022..1113            optional: a range or a list (6, 6-A); acts that changed none are left out
por: governo                   governo (default) | legislatura
marcar: lei-25-94, lei-organica-2-2006    the acts the text discusses (heavy ticks, labelled)
largura: larga
legenda: …
```

A ruler (one tick per act, the Governments as brackets), then one row per act: date, act, how it came
(«Proposta do Governo», «Projeto de lei (PS)», «Texto da comissão: 4 iniciativas», «Decreto-lei»…) and the
number of articles it changed. The NRAU's annexed copy of the Código Civil does not count.

### `origem`: who wrote each phrase of one redação

```figura origem
id: origem-art6
artigo: lei-nacionalidade/artigo-6
redacao: lei-organica-1-2026
mostrar: 1                     optional, as in diff
destacar: lei-organica-1-2026  optional: the act whose words start marked
legenda: …
```

### `ficha`: the facts of one act

```figura ficha
id: ficha-2026
ato: lei-organica-1-2026
campos: proposta, governo, generalidade, vfg, tribunal, veto, promulgacao, publicacao, vigor
largura: lado
legenda: …
```

`campos` (optional, a subset in your order): proposta, governo, generalidade, vfg, tribunal, veto,
novo_decreto, confirmacao, d_cm, promulgacao, publicacao, vigor. Rows without data are left out.

### `imagem`: a document or a facsimile

```figura imagem
id: dr-1981
arquivo: img/dr-1981-lei-37-81.png     png, jpg or webp in img/, lower case, ≤ 300 KB; ≥ 1300 px wide for larga
alt: Primeira página da Lei n.º 37/81 no Diário da República.
titulo: A lei publicada                required for images
credito: Diário da República
fonte: https://diariodarepublica.pt/…
licenca: domínio público
largura: texto
legenda: …
```

Documents and facsimiles only: no photographs of people, no party logos, no generated images. The link
under the figure is «Ver a fonte ↗».

### `passos`: one part of an article, redação by redação, step by step

````
```figura passos
id: solo-passos
artigo: lei-nacionalidade/artigo-1
largura: larga                 recommended: the steps go beside the figure from 1100 px
titulo: A alínea do direito de solo, redação a redação
legenda: …
passo: lei-37-81 1/c
  Em 1981, a [Lei n.º 37/81](ato:lei-37-81) só dava a nacionalidade de origem aos filhos de estrangeiros …
passo: lei-25-94 1/c
  Em 1994, a [Lei n.º 25/94](ato:lei-25-94) passou a contar só a residência com «título válido …».
```
````

The figure stays on screen (it sticks) while short steps of text pass beside it, or under it on a phone. The
step on the reading line chooses what the figure shows: that redação of one número or alínea, compared with the
step before (the first step shows its text plain). Scrolling back goes back a step. Nothing moves while the
reader does not scroll.

- One `passo:` line per step, 2 to 8 steps: the redação key (as in section 3), one label (`1/c`, `2`, `/b`, as
  `mostrar`), then the text. The text can go on over lines indented by two spaces.
- Each step is one or two sentences (W P4 above two, or above 50 words), taken from the story's own sentences.
  Each step links to the act that wrote its redação, and every act it names is a link (R2).
- The steps follow the order of the redações, and each step changes the text shown (R2). A step can name the
  alínea's new letter: the build compares the text without the label.
- At most two step-through figures in a story (F2), so the reader keeps control of the page. The story's slim
  ruler (after its first `cronologia`) steps aside while a step-through figure is on screen.
- A screen reader hears each step with the full text of that redação of the número or alínea.

## 6. The checks

E stops a strict build (CI on push, `REDACAO_ESTRITO=1`); in the daily build an E inside a figure withholds
that figure («em revisão»), and any other E withholds the whole story. W never stops a build.

| Rule | What | Level |
|---|---|---|
| F1 | front matter: required keys, slug = file name, dates, preparacao, dek ≤ 320 | E |
| F2 | only the Markdown subset; no https in prose or captions; known schemes, figure types and keys; `passo:` lines; at most two `passos` figures | E |
| R1 | every site link resolves (act, article, redação, initiative, group, date…) | E |
| R2 | every figure resolves (redações, `mostrar` labels, a change in the selection, a vote, a marked act, the image file; each step of a `passos` figure in order, changing the text and linking its act) | E |
| R3 | a designation in a link's text matches the target; a date after an `ato:` link matches its publication | E |
| R4 | the first plain mention of an act on the site is a link | E |
| R5 | «o PS votou a favor / contra», «absteve-se» is checked against the generalidade vote of the act linked in the sentence (else the last one in the paragraph). Several sentidos in one sentence, or no act: W «confirme com a figura». A vote claim about the votação final global, especialidade, confirmação or reapreciação needs a note | E/W |
| N1–N2 | every note defined and used, with a source and a consultation date | E |
| N3 | a source host outside the known list | W |
| N4 | a pull quote has an attribution with a note; a quotation of 4+ words has a note or a link in its sentence | E |
| N5 | a paragraph without a link or a note | W |
| P1 | neutrality words outside «…» (`tools/estilo.py`: «chumbou», «travou», «luz verde», «oposição» as a camp…) | E |
| P2 | model or vendor names anywhere | E |
| P3 | motive or editorial words («quis», «polémico», «finalmente»…) outside «…», unless the sentence attributes them («argumentou», «segundo», «na exposição de motivos»…) and has a note or link | W |
| P4 | a figure nobody links to; a caption outside 15–70 words; a step of more than two sentences or 50 words; prose outside 1 500–7 000 words | W |
| S1–S3 | after the lock: a pinned redação's text or a vote changed (S1), a cited article has a newer redação (S2), a pinned item is not in the lock (S3). The reader sees an Atenção line | W |

## 7. The lock

When every figure has been re-read against the site, run `python -I pipeline/historias.py --atualizar <slug>`.
It refuses on any error, then writes `<slug>.lock.json`: the hash of every redação the story pins, the last
redação of every article it cites, and the hash of every vote a `votacao` or `ficha` shows. Later builds compare
the data with it and warn (S1–S3) when the law moved on; the page then says so to the reader.
