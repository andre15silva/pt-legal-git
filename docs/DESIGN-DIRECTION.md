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
   - The redação shown is a 5 px ink span.
   - Each span is a button. The whole ruler is one radiogroup with one tab stop, and arrow keys move within it.
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
  10. One sticky element: the 48 px row on desktop, the 56 px bar on a phone.

## 9. Order of work

*Status on 2026-10-28:* step 1 is built. Step 3 is built except search in the header: home, diploma, act and initiative pages use the same grid (section 11). The change flash from step 4 is built (section 10).

1. **The white Nordic tokens (section 8) and the article page skeleton.**
   - Remove the boxes, pills, eyebrows and duplicate facts.
   - Status line, time ruler, one sticky row, Data popover, ruled Atenção, hanging números, the register, citation at the top.
   - The `replaceState` stepping.
2. **Alterações view replaces compare.** Número alignment, two-way folds, ↑↓ navigation, "Comparar com", "Lado a lado", copying only the changes, redirects.
3. **Home, diploma, act and initiative pages in the same language.** Search in the header.
4. **Origem do texto with margin notes.** Then the "Passagem no Parlamento" layer from [PASSAGEM.md](PASSAGEM.md). Then the change flash. Then the data fixes in section 7 (the CIRC start and the CRP "não alteraram" line can come with step 1).

## 10. Motion

Motion says what changed and where it came from. It never decorates. The values are tokens (`--dur-1` 120 ms, `--dur-2` 180 ms, `--dur-3` 240 ms, `--dur-marca` 1600 ms, `--ease`, `--ease-move`, `--shift` 8 px) in `design-system/tokens.json`.

| What happens | What moves | How |
|---|---|---|
| A new page | The page content | Fades in and rises `--shift`, `--dur-3`. The header and footer stay still. |
| Next or previous redação | The text of the law | Comes in from the side the reader moved to (right for "Seguinte", left for "Anterior"), `--dur-3`. The title, status and register do not move. |
| A step forward | The words the newer redação wrote | Start on `ins-bg` and fade to white over `--dur-marca`. The reader sees what is new without opening "Alterações". No mark on a step back. |
| The redação changes | The marker on the time ruler | Slides to the new period, `--dur-3`, `--ease-move`. |
| The redação changes | The register | The verde rule grows down the new row and its details unfold, `--dur-2`. |
| Another tab | The tab underline, the text | The underline slides to the tab, `--dur-2`. The text cross-fades. |
| A popover, a fold, a phrase in Origem do texto | The panel | Unfolds 4 px from its button, `--dur-2`. Folds animate their height where the browser can (`interpolate-size`). |
| Hover and press | Colour, underline, wash | `--dur-1`. "‹ Anterior" and "Seguinte ›" nudge 2 px towards where they go. |
| Copy | The button label | Cross-fades to "Citação copiada". |
| Data still loading | "A carregar…" | Shows only after 400 ms. Pages whose data is already loaded render at once, with no loading state. |

Rules:
- Nothing bounces, loops or moves on its own. No motion longer than 240 ms, except the fade of new words.
- `prefers-reduced-motion: reduce` turns every animation and transition into an instant change.
- Animations run in CSS on elements that mount (keyed by page, by redação and view) or on transitions of elements that stay. No View Transitions: the data loads asynchronously, and a transition would capture the loading state.

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

