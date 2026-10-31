# Design direction: a reference work, not a dashboard

Five reviews of the running app (2026-10-28) shaped this direction. Each took one viewpoint: an editorial typographer, a critic of generic "AI-generated" UI, an information designer, a practising lawyer timing real tasks, and an interaction designer. Mocks and screenshots are in [`design/direcao/`](../design/direcao/). This file says what we keep, what we remove and what we build. It replaces the visual parts of [DESIGN.md](DESIGN.md) where the two disagree.

## 1. Diagnosis

The tokens, the colour rules, the copy standard and the data model are authored work. The layout is not. It uses the stock vocabulary of generated web apps:

- Every part sits in a rounded box. The article page draws 14 bordered boxes. The law itself is a white card on grey paper, against the design system's own rule ("no cards around articles").
- Choices are segmented controls. The compare page shows 9 buttons and 2 selects before the first word of law.
- Statuses are uppercase pills with glyphs. The act page of Lei n.º 56/2023 has about 40 "ALTERADO" pills.
- Each page opens with an uppercase eyebrow. The home page is hero, search and a card grid.
- Atkinson Hyperlegible draws a slashed zero, so every date reads like code ("2Ø25").

The cost is real.

- **The law starts too low.** On CIRC art. 87.º the first número starts at y≈910 px on desktop, below the first screen. On a phone it is at y≈1,440 px.
- **Facts repeat.** The start date appears up to five times. The transitional norm is printed twice. The heading appears twice.
- **Moving through time has too many controls.** There are four ways to move in time and 21 tab stops before the text.
- **Copying a citation is far away.** "Copiar citação" is 3,000 px down the page.

## 2. Principles

1. **The law starts on the first screen, at every width.** Desktop: by y≈400 px. Phone: by y≈480 px.
2. **Rules and white space separate content. Boxes do not.** A frame is only for something that floats: a popover, a sheet, the phone bar.
3. **The serif states facts. The sans offers actions.** Law, dates, designations and status are serif with lining tabular figures. Buttons, tabs and form labels are sans.
4. **Say each fact once, where the reader uses it.**
5. **One obvious way to do each thing.** Horizontal movement means time (‹ ›). Vertical movement means within the text (↑ ↓).
6. **Every colour has one job.**
   - Verde: "you are here" and links.
   - Blue and orange: change.
   - Ochre: warning.
   - Fills: change marks only.
7. **Use the forms of Portuguese law.**
   - The status line is the citation formula ("Redação dada pela …").
   - An act lists its changes the way an amending law does ("São alterados os artigos …").
   - Números hang as in the Diário da República.

## 3. The article page

From top to bottom. Desktop measure about 64ch, a 46 px hang for números, and a right column of about 300 px for the register.

1. **Header (48 px).** "Redação", the search field ("art. 87.º CIRC, licença parental…"), "Sobre os dados".
2. **Running head (sans 14, muted).** "Código do IRC · Capítulo IV — Taxas". On the right: "‹ 86.º-B  87.º-A ›".
3. **Title (serif).** "Artigo 87.º" at 40/44, weight 600. The epígrafe goes on the next line at 400 ("Taxas"), as in the Diário da República. Two quiet text buttons sit on the same line, on the right: "Copiar citação" and "Diário da República ↗".
4. **Status line (serif):**
   - *Redação dada pela Lei n.º 64/2025, de 7 de novembro* (italic, act linked).
   - "Em vigor desde 12 de novembro de 2025 · 8.ª de 8."
   - For a past redação, in ochre: "Esteve em vigor de 1 de janeiro a 31 de dezembro de 2024 · Ir para hoje".
   - For a future one: "Entra em vigor a …".
   - This line replaces the pill, "8 redações", the banner and the bar's status text.
5. **Time ruler.**
   - A 1 px `rule-strong` line, with a tick at each redação start and half ticks for retificações.
   - Year labels in serif 12 at their true positions, and a "hoje" mark.
   - The redação shown is a faint span; a verde needle marks the date on screen, and the line is ink up to it.
   - The ruler is a scrubber (section 10): the needle is one slider with one tab stop, and arrow keys move it. «▶ Rever a história» sits above it.
   - A redação that lasted zero days merges into the one that replaced it on the same day.
6. **Sticky row (48 px, the only sticky thing, `paper` ground, 2 px ink rule on top, 1 px rule below, no shadow).**
   - Left: "‹ Anterior" and "Seguinte ›".
   - Centre: the short status, "8.ª de 8 · Lei n.º 64/2025".
   - Right, as text tabs with a 2 px verde underline: "Texto · Alterações · Origem do texto".
   - Far right: "Data ▾", which opens the DateLens as a popover. It commits on "Ver" or Enter. "Que data conta" sits inside a `<details>`.
   - "Produção de efeitos" goes away as a basis: today it only adds a disclaimer.
7. **Atenção (one ruled line, no fill).** A 3 px ochre rule on the left: "Atenção: a Lei n.º 64/2025, artigo 3.º, fixa outras taxas para os períodos de 2026 e 2027. Ler a norma". The norm opens in place. The números it names get a small mark in the margin. The norm does not repeat under "Notas".
8. **The text.**
   - Statute 19/30 serif. Números hang in the margin, and alíneas hang a further 30 px.
   - "(Revogada.)" lines are 16/24 in `revogado` grey.
   - 15 px between números, 6 px between alíneas.
   - A no-break space goes before "%" and "€". A narrow no-break space separates thousands ("50 000 €").
9. **Below the text, under hairlines.** "Notas" (only the notes for this redação, then "Outras notas (n)"), "Fonte" (one line: "Copiámos este texto do consolidado do Diário da República. Só o Diário da República faz fé.") and "Citar".
10. **Right column: the register.** One row per redação, oldest first:
    - ordinal "1.ª … 8.ª";
    - a 3 px rule in the act colour;
    - the act, in serif 15;
    - the start date, `dd/mm/aaaa`, tabular.

    The row shown has a 3 px verde inset rule. Retificações are muted and sit under the redação they correct. Each row is a link. A row opens to show publication, the norm of the act and "Ver o ato". There are no pills and no dot timeline. On a phone the register opens from the bottom bar.

**Views.**

- **Texto:** plain text.
- **Alterações:** the diff against the previous redação. Unchanged runs fold into one muted line between hairlines ("11 parágrafos sem alterações · Mostrar / Ocultar"). A sub-row offers:
  - "Comparar com [a redação anterior ▾]";
  - "Lado a lado" (≥ 1100 px);
  - "↑ Anterior · Alteração 1 de 3 · Seguinte ↓";
  - "Copiar antes e depois", which copies only the changed números with full designations.

  This view replaces the compare page. Old `/comparar` links redirect to it.
- **Origem do texto:** a margin note per número with the act and a colour band ("Lei 64/2025 ▍"). The text underlines only spans written after the original, never act-0. Choosing a phrase opens the popover with "Ver a alteração" and "Ver como estava antes".

**Phone.**

- The title is two lines. The status line is two lines with exact dates.
- The text starts at about y≈300.
- The bottom bar is 56 px plus the safe area: "‹ | 6.ª de 8 · 01/01/2024 a 31/12/2024 ▾ | ›". It has a 3 px ochre top rule for a past redação.
- Tapping the centre opens a sheet: the date and "Ver", the register as a list with 48 px rows, "Copiar citação" and "Fechar".
- The view tabs fit in one row ("Texto · Alterações · Origem").

**Behaviour.**

- Stepping writes only `redacao=` and uses `replaceState`. A chosen date stays until the reader changes it. Back leaves the article.
- After a step, the words that changed flash in `ins-bg` for 1.6 s. Nothing flashes under `prefers-reduced-motion`.
- The status is announced, and focus stays where it was.
- Hover, pressed and disabled states follow the CSS in the interaction review. A disabled control has no hover.

## 4. Other pages

- **Home.** The search field, then a ruled list of diplomas. Each row has the name (serif 22) and one serif meta line: "Lei n.º 7/2009 · 615 artigos · 25 alterações". "Alterações recentes" is a ruled list with the act's sumário. No card grid, no hero lead.
- **Diploma.**
  - Title, the diploma's own description, and one line of dates.
  - A hairline ruler of the acts, one tick per act, with retificações apart.
  - The índice as a contents table: the article number right-aligned in a tabular column, and the epígrafe in ink. The whole row is the link, with no underline until hover.
  - A small tick strip per article, on the same time axis, replaces "· 3 redações".
  - The approving law folds away when the code sits in an annex.
- **Act.**
  - Dates in one serif line.
  - Then the changes written the way the law writes them: "São alterados os artigos 14.º, 15.º, 15.º-A a 15.º-K … · São aditados … · São revogados …". Each number is a link.
  - Below, rows grouped under "Alterados (18)", "Aditados (3)" and "Revogados (5)". Each row has the epígrafe and the first change inline. The row is the link to its diff.
  - The act's transitional norms and its dates of effect come next.
- **Initiative.** The ProcessTrack without its box. One vote matrix: grupos parlamentares as rows, votes as columns. "Todas as fases" shows only the events the track does not show.

## 5. Tokens and type

- **Retire:** the 12 px uppercase `label` style, `shadow-sheet` except on floating layers, `verde-soft` fills except the selected tab, and the pill as a carrier of sentences.
- **Numerals:** every date and designation is serif with `font-variant-numeric: lining-nums tabular-nums`. Atkinson's Google Fonts build has no alternate zero.
- **Scale:** title 40/44 (phone 30/34), statute 19/30 (phone 18/28), quoted norm 16/26, margin note 15/24, section heads serif 22/28 at 600, UI 16/24 and 14/20 sans.
- **Space:** a 30 px baseline unit. 48 px between sections.
- **Dark mode:** the only solid fill is the ink of the current span on the ruler. No mint primary buttons.

## 6. Copy fixes

- "Origem das palavras" becomes "Origem do texto" (ESTILO 1.3).
- "Ainda não verificamos …" becomes "Copiámos este texto do consolidado do Diário da República. Ainda não o comparámos com o ato publicado." (pt-PT spells the past tense "verificámos".)
- Atenção states the consequence first (ESTILO 6.2): "Atenção: a Lei n.º 64/2025, artigo 3.º, fixa outras taxas para 2026 e 2027."
- "Norma: artigo 133.º da Lei n.º 7-A/2016" becomes "Alterado pelo artigo 133.º da Lei n.º 7-A/2016".
- "Alteração feita pela …" becomes "A Lei n.º 56/2023 alterou este artigo (4.º de 26 neste ato)."
- Delete "Cada redação aplica-se no seu período. Abra uma redação para ler o texto completo."
- The load error for readers becomes "Não carregámos os dados. Recarregue a página."
- "(epígrafe atual)" becomes a margin note on old redações: "Epígrafe de hoje. A do texto original pode ser outra."

## 7. Data and correctness found by the reviews

1. **The CIRC history starts at the 2014 republication, not in 1988.**
   - Label the first redação "Redação da republicação (Lei n.º 2/2014)" and say where the history starts.
   - A redação that a declaração de retificação corrected is cited as "na redação dada pela Lei n.º 2/2014, retificada pela Declaração de Retificação n.º 18/2014".
2. **Revisions that did not change the article.** For diplomas with few acts (the CRP), say which acts changed the diploma but not this article: "As revisões de 1982, 1992, 1997, 2001, 2004 e 2005 não alteraram este artigo." Silence is not an answer for a lawyer.
3. **Diffs align by número first, then by word.** Today side by side can split "4 —" from its text. Renumbering-only changes count apart: "4 alterações e 3 números renumerados".
4. **One counting rule on all pages.** Today the article's "O que mudou" says 4 and the compare page says 3 for the same pair.
5. **The citation copies a link and has a short form for use inside a sentence:** "art. 87.º do CIRC, na redação da Lei n.º 82/2023, de 29 de dezembro".

## 8. Visual language: white and Nordic ("Hvit")

The owner asked for a white ground and a Scandinavian, minimal style. The references are lovdata.no, retsinformation.dk, finlex.fi, riksdagen.se, designsystemet.no and aksel.nav.no. The token proposal, the mock and screenshots are in [`design/direcao/hvit/`](../design/direcao/hvit/) (`scandi-tokens.css`, `tokens-scandi.json`). `tools/check_contrast.py` reports 0 failures on it.

- **Ground and greys.**
  - The ground is pure white (#ffffff). Grey is only a hover wash (#f5f6f5), never a panel.
  - There is a small grey scale with a faint green bias, not the blue-grey "slate" of generated UI:
    - rule #e3e6e4 (hairlines)
    - rule-mid #c9cecb (ticks, folds)
    - rule-strong #7a827e (controls, 3.95:1)
    - revogado #69716d
    - ink-muted #525a56 (7.1:1)
    - ink #1a1f1c (16.7:1)
- **One accent.** Verde-garrafa #1d5c44 (7.9:1) stays, for links and "you are here". retsinformation.dk shows that green works for law. A Nordic ink-blue would clash with the blue of added text.
  - Links are underlined: 1 px at 45 % with 0.2em offset, and 2 px on hover.
  - The only solid button is "Ver" in the date popover.
- **Change colours keep their hues.** Added: #00578a on #e1f0fa, plus underline. Removed: #9a3c06 on #fce8dc, plus strike-through. They are reserved for change.
- **Warning.** The word "Atenção" in ochre #7a5000 with a 3 px #b07a00 rule. No tinted boxes.
- **Focus.** An ink double ring (2 px ink, white inner ring), as in Designsystemet and Aksel. The focus ring is never blue, so it never reads as a change.
- **Act colours, re-laddered for colour blindness.**
  - Light: #1f5fa0 #cc6a1a #147a64 #73306f #d0607f #59661a #8a7fd6. The closest pair stays ΔE ≥ 8.8 under simulated colour blindness. The old set fell to 1.3.
  - They appear only as 3 px bands beside the act's name.
- **Type.**
  - Law and facts: Source Serif 4. The epígrafe is 32/38 at 400 under the 40/44 title.
  - Interface: **Schibsted Grotesk**, the Norwegian newsroom face from Google Fonts. It has a plain zero, a serifed capital I and underlined ordinals ("8.ª", "n.º"). It replaces Atkinson Hyperlegible Next, whose slashed zero made dates look like code.
  - Atkinson Hyperlegible Mono stays for identifiers.
- **Structure.**
  - Grid: 96 px margin (hang and marks) · 650 px text (64ch) · 64 px gap · 300 px register. 40 px page gutters, 16 px on a phone.
  - Rules: 1 px hairlines. A 1 px ink rule above the register. A 2 px ink rule above the sticky row and the phone bar.
  - Radius: 2 px on controls, 4 px on floating layers, nothing else rounded.
  - Shadows only on floating layers.
- **Ten rules.**
  1. White ground. Grey for hover only.
  2. Hairlines and space separate. No box unless it floats.
  3. One accent, verde, for links and "you are here" only.
  4. Blue and orange for change only.
  5. Facts in the serif with lining tabular figures. The sans only for things you click or type into.
  6. Underlined links. Ink text buttons. At most one solid button per view.
  7. Warnings: a 3 px ochre rule and the word "Atenção".
  8. No uppercase labels, eyebrows, decorative icons or gradients.
  9. Origin colour only as a band next to the act's name.
  10. One sticky element: the 48 px row on desktop, the 56 px bar on a phone. Other pages have at most one of their own (section 10).

## 9. Order of work

*Status on 2026-10-28:*
- Step 1 is built.
- Step 2 is built. The compare page is gone: the Alterações view has "Comparar com", "Lado a lado", "↑ Anterior · Alteração 1 de 3 · Seguinte ↓" and "Copiar antes e depois", which copies only the changed paragraphs. Old `/comparar` links redirect. Coming from an act, a ruled note walks through the articles the act changed.
- Step 3 is built. Search is in the header ("/" focuses it). The diploma índice is a contents table, and in the CIRC the approving law's articles fold away. Home lists the recent acts with their sumário. Every page uses the grid in section 11.
- Step 4 is built: margin notes in Origem do texto (the register moves under the text there, as in "Lado a lado"), the Passagem layer limited to the generalidade vote, and the change flash (section 10). The tick strips per article, the diploma's act ruler, the phone sheet behind the bottom bar (date, versions, citation) and a print stylesheet are built too.

1. **The white Nordic tokens (section 8) and the article page skeleton.**
   - Remove the boxes, pills, eyebrows and duplicate facts.
   - Status line, time ruler, one sticky row, Data popover, ruled Atenção, hanging números, the register, citation at the top.
   - The `replaceState` stepping.
2. **Alterações view replaces compare.** Número alignment, two-way folds, ↑↓ navigation, "Comparar com", "Lado a lado", copying only the changes, redirects.
3. **Home, diploma, act and initiative pages in the same language.** Search in the header.
4. **Origem do texto with margin notes.** Then the "Passagem no Parlamento" layer from [PASSAGEM.md](PASSAGEM.md). Then the change flash. Then the data fixes in section 7 (the CIRC start and the CRP "não alteraram" line can come with step 1).

## 10. Motion

*Rewritten on 2026-10-31. The owner chose one house style and three borrowed pieces from five prototypes: Prelo (the house style), Rever o tempo on article pages, two pieces of Tátil, and O scroll é o relógio. The code is one module: [`app/motion.js`](../app/motion.js) and [`app/motion.css`](../app/motion.css), with small hooks in `app/app.js` and the design system (`R.Conta`, `R.Feito`, `data-grupo` on vote siglas). The checks are [`app/test/movimento.spec.js`](../app/test/movimento.spec.js) and the motion helpers in `app/test_diff.js`.*

Motion says what changed and where it came from. It is drawn the way print is made: rules, strikes, ink, lines set in order. It never decorates.

### Principles

1. **Ink, not objects.** Things are drawn (rules, strikes, underlines), set (lines rising 6 px into place) or inked (a wash sweeping in from the left). Cards never lift, buttons never scale, nothing bounces or loops.
2. **Reading order is the timeline.** Staggers follow the DOM, top to bottom. A diff inks its changes in the order they are read.
3. **Once.** A rule draws, a figure assembles and a number counts once per mount. Nothing moves while it is being read.
4. **Only the reader starts motion.** A replay plays after a press and stops on any other input. Scroll-tied things follow the scroll in both directions and stop when the reader stops. The one thing that plays on arrival is a page's entry (≤ 320 ms of stagger) and the act strip of «Quem fez» (≤ 2.2 s, once).
5. **Change keeps its colours.** Blue and orange only in the diff, the morph and the new-words mark. Verde only for "you are here": the needle, the fill of a ruler, the lit vote group.
6. **One sticky element at a time.** The version row on the article page (the bar on a phone), the act strip on «Quem fez», the story ruler (or a pinned step-through figure, never both), the passage line on an act page.

### Tokens (`design-system/tokens.json`)

| Token | Value | Use |
|---|---|---|
| `dur-1` · `dur-2` · `dur-3` | 120 · 180 · 240 ms | hover and press · things that open, an outgoing state · things that arrive, an incoming state |
| `dur-folha` | 280 ms | a sheet uncovered from its edge (a clip: the type does not travel) |
| `dur-tinta` | 320 ms | a strike drawn, new words inked in |
| `dur-regua` | 480 ms | one-time: a hairline, a ruler's line, a figure's axis |
| `dur-conta` | 640 ms | one-time: a number counting to its value |
| `dur-marca` | 1600 ms | the new-words mark: wash and underline drawn in, held, faded |
| `passo` | 40 ms, at most 8 steps | stagger of lines set in reading order |
| `passo-tinta` · `atraso-tinta` | 55 ms (at most 10) · 120 ms | stagger of a diff's changes, after the text has arrived |
| `dur-risca` · `dur-muda` | 160 · 260 ms | morph: a removed word struck (14 ms apart, at most 10), then closed up while new words open; a whole step ≤ 420 ms |
| `dur-agulha` | 240 ms (600 ms in a replay, 0 under the finger) | the needle of the time ruler |
| `dur-press` · `press` | 70 ms · 1 px | a pressed button goes down 1 px and comes back in `dur-1` |
| `sobe` · `shift` | 6 px · 8 px | a line set in place · a step-through state |
| `ease` · `ease-move` · `ease-tinta` | `cubic-bezier(.2,0,0,1)` · `(.4,0,.2,1)` · `(.3,0,.1,1)` | fades and rises · markers that move · a pen (rules, strikes, sheets) |
| `ler` | 55 % of the viewport (78 % under a pinned figure) | the reading line: what crosses it is "now" |
| Spring (JS) | ζ ≥ 0.9, k 380–520 | a released phone sheet: it keeps the finger's speed and lands without a visible bounce (< 0.5 %, ≤ 0.6 s) |
| Replay step | `clamp(750, 7000 / (n − 1), 1500)` ms | one redação (or one act in Origem) per step: a history takes 2–8 s |

### Catalogue

| Where | What moves | How |
|---|---|---|
| A new page | The block; its first lines | The block fades in (`dur-2`). Lines in the first 1.5 screens rise `sobe` and fade, `passo` apart, at most 8. Header and footer stay still. |
| Hairlines | `.list`, `.cards`, the register, sections, votes, figures | Drawn from the left once (`dur-regua`). Blocks below the fold wait until seen. |
| Article: the time ruler | The needle, the lived line, the year | A scrubber. Drag the needle or press the line: the article changes to the redação in force there and settles on it on release. The needle is a slider: ← → ↑ ↓ one redação, PgUp/PgDn three, Home/End. The year counts to its value. On page entry the line is drawn and the ticks rise in date order. |
| Article: the ruler stays put | The page | While the needle is held, the status lines above keep their tallest height. After any change of redação the page scrolls by what the lines above changed, so the ruler never moves under the pointer. |
| Article, Texto: a step | The words of the law | The text turns into the new redação in place: removed words are struck (`dur-risca`) and close, new words open (`dur-muda`) with the new-words mark. Words that stay do not move. Only paragraphs on screen animate; above 160 changed words it crossfades by word. Struck words are `aria-hidden` and leave the DOM at the end. A jump (replay back to the start) fades instead. |
| Article, Alterações or Origem: a step; another tab | The law text | A crossfade (View Transition, old text out in `dur-2`, new in `dur-3` with a 4 px drift towards the side moved to). The diff then draws a strike through each removed word and inks each added word, in reading order. |
| Article: ▶ «Rever a história» / «Continuar até hoje» | The needle and the text | One redação per replay step, each a morph. ❚❚ or Esc pauses; any other key or pointer press stops it. On a phone: «Rever», «Continuar», «Pausa». |
| Origem: ▶ «Ver quem escreveu, por ordem» | Colours of the text | Today's text goes grey; then each act, oldest first, takes its colour in reading order, the needle walks to its date and its margin note lights. |
| A step forward | The new words | Wash and underline drawn in, held and faded (`dur-marca`). No mark on a step back. |
| Origem sheet, phone sheet, popovers, folds | The panel | Uncovered from its edge with a clip (`dur-folha`; popovers and folds `dur-2`), then its lines rise. On a phone the sheets have a grab bar: they follow the finger; down a third or a flick closes, up opens to 92 %, otherwise they spring back. |
| Votes (act pages, stories) | The rows; the counts | Rows tally (A favor, Contra, Abstenção) as the vote reaches the reading line, scrubbed by the scroll and undone on the way back. The seat counts count once (`dur-conta`). Votes in the Origem sheet do not wait. |
| Votes: a group | The siglas | Hovering or focusing a group lights it in every vote on the page and dims the others to 45 %. Each vote block is one tab stop; the arrows move between its groups. |
| Act page: the passage of a law | A line of stages | Beside «Quem fez esta lei» (on a phone: above it, sticky): one stop per stage, named from the data (iniciativa, votação final global, Tribunal Constitucional, veto, novo decreto, confirmação, promulgação, publicação, entrada em vigor), placed where its sentence is. Verde fills it as the sentences cross the reading line. |
| «Quem fez cada alteração» | The act strip | Drawn once on arrival: a pen draws the diploma's life to today and each act lands as it passes (≤ 2.2 s). Sticky; the band of the Government (or legislatura) on the reading line is verde. A tick scrolls to its act and marks it. |
| Stories: figures | Axis, ticks, brackets, rows | Assembled once when they enter: the chronology's axis is drawn, ticks rise in date order, Government brackets are drawn, rows are set. Diff figures ink. |
| Stories: a step-through figure (`passos`) | The figure's state | The figure stays (sticky) while short steps pass beside it (under it below 1100 px). The step on the reading line chooses the redação shown, compared with the step before; the old state leaves in `dur-1`, the new one arrives in `dur-3`. Scrolling back goes back. One or two per story. |
| Stories: the ruler | A slim ruler | After the first chronology, sticky at the top: verde to the act the text has reached, the acts of the paragraph being read named, the section on the left. It steps aside while a step-through figure is being read. |
| Diploma pages | A 2 px verde hairline | The share of the page read, at the top of the window. |
| Hover and press | Underlines, wash, 1 px | Underlines thicken and tighten (`dur-1`); titles without one get it drawn from the left. Buttons go down 1 px. |
| Copy and share | The label | It swaps to the confirmation and a tick draws itself. |
| Counts | «63 leis e códigos», «N atos neste período», vote counts | Count once when seen. Years, dates, article numbers and numbers under 10 never count. |
| Data still loading | «A carregar…» | Only after 400 ms, with a hairline drawn once under it. Never a spinner. |

### What never moves

- The words of the law once they have arrived, a story's prose, quotations, notes and sources.
- The header, the footer, the crumbs, the status line, the register's rows.
- Nothing scrolls by itself, and there is no parallax, marquee, ticker, cursor effect, idle drift or loop. Search results do not stagger (they change at each key).
- Colour meaning: motion uses the existing ins, del and verde tokens only.

### Reduced motion, keyboard, screen readers, print

- `prefers-reduced-motion: reduce`: every animation and transition is instant, View Transitions too. The scrubber and the replay still step, as a slideshow. Drags still follow the hand; springs jump to their end. Scroll-tied states show the current state at once; vote rows and counts are final; the reading hairline is hidden. The check: `document.getAnimations()` has nothing running.
- Nothing is hidden waiting for an observer without a fail-safe: a waiting block is released when seen, every 3 s and on each scroll frame if it is in or above the viewport, on keyboard focus inside it, on print, and when reduced motion turns on. Without JavaScript nothing waits.
- Rulers, rails, the strip's bands, the step-through panel and the grab bars are `aria-hidden`: the sentences beside them say everything. Each step of a step-through figure carries its redação's full text for screen readers. A counting number keeps its value in the DOM. The needle is a `role="slider"` whose `aria-valuetext` names the redação; the status line announces each step.
- Print shows everything at rest: no rulers, rails, hairline or pinned panels; vote rows visible; strikes as `line-through`.

### Fallbacks

- Without scroll timelines (Firefox today; preview with `?semtl` before the `#`): `html.mo-sem-tl`. Fills move to the discrete state of the reading line with a `dur-3` transition; a vote below the fold waits and then tallies once (80 ms between rows); the hairline is set from `scrollY`.
- Without View Transitions: the keyed law text fades in with the 4 px drift; nothing else changes.
- A View Transition runs only between views or redações of one loaded article, never during a drag or a replay, so it never captures a loading state. Its names exist only while it runs (a `view-transition-name` makes a stacking context, and the Origem sheet lives inside the text).

### Performance

Transform, opacity, clip-path and short background sizes, except the needle's `left`, the morph's word widths (measured once per step) and a sheet's height while it is dragged up. Scroll-scrubbed motion runs on the compositor. One MutationObserver and one IntersectionObserver for the house style; one reading-line observer per scroll-tied component, plus a rAF-throttled scroll check. Only what is on screen animates.

## 11. Space

One grid for every page: a 650 px text column, a 300 px column of facts or history, 64 px between them, inside a 1110 px page. Home and diploma use a wider first column (the index and the list of diplomas) with the same 300 px side column.

Vertical rhythm, desktop (phone in brackets):
- 32 px (24) from the header to the breadcrumbs or running head; 32 px (16) to the title.
- 16 px between the title, the lead and the status line. They are one block.
- 40 px (24) from the title block to the ruler, and from the version row to the text.
- 64 px (48) between sections. A section starts with a hairline, then 24 px (20), then its heading, then 16 px.
- 96 px (64) of white under the last section, before the footer.

Rules:
- Space groups things; hairlines only separate rows of a list and sections. Things that belong together are 4–16 px apart; things that do not are 40 px or more apart. Nothing sits in between.
- Both columns start on the same line: the side column starts with its own hairline or its ledger rule, level with the first section.
- The right column holds facts (dates, sources, initiatives) or history (the register). When there are none, it stays white. We never stretch text to fill it.
- Lists of facts are rows with a hairline (ledgers), headed by a 1 px ink rule. Wide tables (votes by group) take the full page width. On a phone they become one list per item.

