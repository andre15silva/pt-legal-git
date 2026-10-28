# Seeing and travelling between versions: review and plan

Five reviews of the running app (2026-10-28), each from one point of view: a litigation and tax lawyer, a citizen and journalist, a legislative drafter, an interaction designer who benchmarks version-history tools, and an accessibility and mobile specialist. Each review used the app in a headless browser on desktop and phone. This file merges their findings and ranks the work.

## 1. What all five found

All five reviews proposed, on their own, the same core fix: **one place, right above the text, that says which redação you read and lets you step to the previous or next one.**

The other findings, with the evidence:

| # | Finding | Evidence | Raised by |
|---|---|---|---|
| F1 | An old redação looks like the law in force. The pill says "Em vigor desde 6 de setembro de 2015" for a text replaced in 2019. No end date, no "this is not today's text". | `#/d/codigo-do-trabalho/artigo-40?redacao=1` | all five |
| F2 | You cannot step between redações. There is no previous/next control and no key. Each timeline click scrolls to the top. | `#/d/codigo-irc/artigo-87` | all five |
| F3 | On a phone the history starts about 4,400–5,250 px down, below the notes and the citation. | 390 px and 320 px | citizen, lawyer, a11y, patterns |
| F4 | The article view never shows what a redação changed. Deleted text is invisible. Timeline entries have no "ver a alteração" link. | article view | lawyer, citizen, patterns |
| F5 | The date is lost between views. Crumbs, the índice, search and act pages drop `em`. Act → article opens today's text, not the redação the act wrote. Compare drops `ato=` when a select changes. | `#/ato/lei-constitucional-1-89` → art. 1.º | lawyer, drafter, patterns |
| F6 | Transitional norms sit far below the text. CIRC art. 87.º shows 17 % for 2026. Lei 64/2025, art. 3.º, sets 19 % for 2026 and 18 % for 2027. | `#/d/codigo-irc/artigo-87?em=2026-06-30` | lawyer |
| F7 | You cannot type a date with the keyboard. The page navigates on every keystroke and the lens remounts (`key: date + base`), so focus goes to `<body>`. Typing "15032010" ended on 2026-01-28. Arrow keys on the basis radios also lose focus. | DateLens | a11y |
| F8 | Nothing is announced when the redação changes. The page title is always "Redação". | all routes | a11y |
| F9 | Compare is hard to use: cut-off select labels, no swap, no stepping, unchanged números never fold (about 60 % of the page), reading mode not in the URL, URLs by array index. | `…/artigo-87/comparar?de=1&ate=6` | all five |
| F10 | The act page is a flat list of links: up to 180 rows of "Alterado · Artigo n.º · ver a alteração", in DR order, with no epígrafes, no grouping and no redlines. | `#/ato/lei-13-2023`, `#/ato/lei-constitucional-1-89` | citizen, lawyer, drafter |
| F11 | The diploma page has no time. No date lens, no "what changed between two dates", and today's structure only. | `#/d/codigo-irc` | lawyer, drafter, citizen |
| F12 | "Origem do texto" is noisy and fragile. Every word is a tab stop (35 on CIRC 87, 78 on CT 40). The underlines vanish in forced colours. act-2 and act-5 cannot be told apart under deuteranopia. Targets are as small as 5.7 × 28 px. | article view | a11y, citizen |

## 2. Data problems found by the review

The reviews found three problems in the data, not the layout. I checked each one in the data.

1. **The CRP history follows article numbers, not provisions.**
   - The 1982, 1989 and 1997 revisions renumbered many articles. The DR tracks the number, so "art. 22.º, 1976 → 1982" can compare two unrelated provisions.
   - 319 of 699 CRP "alterado" steps (46 %) are less than 35 % word-similar: 163 in LC 1/97, 79 in LC 1/82 and 69 in LC 1/89.
   - The epígrafe shown is today's, even on a 1976 redação.
   - The pipeline also drops the DR timeline's 24 "Elimina" operations (CRP art. 297.º–312.º).
2. **An amending act is missing from the DR consolidation.**
   - CIRC art. 87.º goes from 23 % to 21 % at "Declaração de Retificação n.º 18/2014".
   - The rate was 23 % in 2014 and 21 % from 2015, set by the State Budget law (Lei n.º 82-B/2014).
   - That law is not in the DR's timeline for the CIRC. Lei 82-C/2014 and 82-D/2014 are.
   - This is the kind of error a replay check (Phase 1 of the plan) catches.
3. **Some redações share a start date with the next one, so a date cannot find them.**
   - 25 redações start on the same date as the next one, 18 of them in the CIRC.
   - Most are a retificação that takes effect on the original's date.
   - `redacao=n` (added earlier) works around this, but the history still lists a retificação as a separate redação.

## 3. Decisions where the reviews differ

| Question | Options raised | Decision |
|---|---|---|
| Keyboard shortcuts | `[` `]` and `j` `k` (lawyer, drafter, patterns), or no single-character keys (a11y, WCAG 2.1.4) | ←/→ and Home/End inside the focused version bar. Alt+←/→ anywhere outside form fields. List them in "Atalhos de teclado". No single-character keys. |
| Retificações | Fold into the redação they correct (lawyer), or count separately (drafter) | Keep them as entries, styled as technical changes and grouped under the redação they correct. Add "Ocultar retificações". |
| "Origem do texto" by default | On (today), or off for citizens (a11y, citizen, the TextOrigin README) | Plain text by default, with two toggles: "Mostrar o que mudou" (diff against the previous redação) and "Mostrar a origem das palavras". Remember the choice per browser. |
| URL identity | Array index (today), act id (patterns), date (lawyer) | Canonical: act id (`redacao=lei-64-2025`). Accept a date or `hoje` for `em`, `de` and `ate`. Keep old index URLs working. |
| Diff layout | Inline only (today), or side by side (patterns, buzer.de) | Inline by default. Add "Lado a lado" on screens ≥ 1100 px. |

## 4. The navigation model

**One state, several ways in.** An article view has one state: the article, the redação shown, and optionally a second redação to compare with. A date resolves to a redação. Every control changes that one state, and every state has a URL.

**Barra de redações.** Sticky, directly above the text.

```
‹ Redação anterior   Redação 6 de 8 · Lei n.º 45-A/2024 · em vigor de 1 jan. 2025 a 11 nov. 2025   Redação seguinte ›
[ ●───●──●────●───●──◉──● ] 1976 … hoje        Data: 30 jun. 2025 ▾    ☐ Mostrar o que mudou    Comparar
```

- **Status line:** `role="status"`. It announces each change. The page title changes with it, for example "Art. 87.º CIRC, redação de 1 jan. 2025 · Redação".
- **Previous/next buttons:** 44 px targets. At the ends they use `aria-disabled` and stay focusable. Focus stays on the button that was pressed.
- **Time strip:**
  - One tick per redação, on a real time axis.
  - A filled tick marks the redação shown, and a line marks today.
  - Dashed ticks are published but not yet in force.
  - Small ticks are retificações.
  - It is never drag-only: the buttons and the list are the alternative.
- **Date chip:** opens the existing DateLens. The lens navigates only on confirm, with Enter or a "Ver" button, and never remounts.
- **On a phone:** a 56 px bar fixed to the bottom of the screen ("‹ · Redação 6 de 8 · ›"). Tapping the label opens a sheet with the list and the date.
- **Scroll:** stepping keeps the reader's place in the text. No `scrollTo(0,0)` within one article.

**Honest status.**

- The pill describes the redação, not today: "Em vigor de … a …", "Em vigor hoje", or "Publicada, ainda não em vigor".
- For a past redação, a banner above the text reads: "Esta não é a redação em vigor hoje. [Ver a redação em vigor hoje]".
- In the timeline, the shown item gets `aria-current` and "A ver esta redação". Every item shows its end date.

**Norms that change how the text applies.** When a note on the article comes from the act of the redação shown (type `vigor` or `efeitos`), a box above the text quotes it: "Norma transitória: Lei n.º 64/2025, artigo 3.º". The pill then reads "Há uma norma transitória".

**From a word to its history.** Selecting a word opens a small popover next to it: "Escrito pela Lei n.º 2/2020, em vigor desde 1 de abril de 2020", with two actions, "Ver a alteração" and "Ver como estava antes".

**Links between views.**

- Every internal link carries `em` and `base`.
- Act → article opens the redação that act wrote.
- Each timeline entry gets "Ver a alteração" and "Ver o ato".
- A compare page opened from an act shows "Lei n.º 13/2023 · alteração 12 de 115", with previous/next article and "Voltar ao ato".
- The article header gets "‹ Artigo 86.º-B · Artigo 88.º ›" on the same date.

**URLs.**

| What | URL |
|---|---|
| Article at a date | `#/d/codigo-irc/artigo-87?em=2026-03-01&base=vigor` |
| One redação | `#/d/codigo-irc/artigo-87?redacao=lei-64-2025` |
| One step, with changes marked | `#/d/codigo-irc/artigo-87?redacao=lei-64-2025&mudou=1` |
| Any pair | `#/d/…/comparar?de=2024-12-31&ate=hoje&modo=nova&vista=lado` |
| Diploma at a date | `#/d/codigo-irc?em=2015-01-01` |
| What changed between two dates | `#/d/codigo-irc/alteracoes?de=2024-01-01&ate=2026-01-01` |
| Act focused on one article | `#/ato/lei-64-2025?artigo=codigo-irc/artigo-87` |

## 5. Plan

Effort: S is up to a day, M a few days, L a week or more.

### Step A: trust and basics (all S, no new data)

1. Honest status: per-redação pill, past-redação banner, end dates and `aria-current` in the timeline (F1).
2. A transitional-norm box above the text when an applicable note exists (F6).
3. A DateLens that commits on confirm, keeps focus and does not remount (F7).
4. A warning for low-similarity steps instead of a misleading redline: "A redação anterior tem outro texto. O artigo pode ter mudado de número." Do not show today's epígrafe on old redações (data problem 1).
5. Keep `em` and `base` across all links. Act → produced redação. "Ver a alteração" and "Ver o ato" on timeline items. `ato=` survives in compare (F5).
6. Reflow and forced-colours fixes: pills wrap, `color-scheme: light dark`, the selected radio and the current timeline node visible without colour.

### Step B: the version bar (M)

7. Barra de redações with previous/next, status line, page title, keyboard, the phone bottom bar and kept scroll position (F2, F3, F8).
8. "Mostrar o que mudou" in the article view, an inline diff against the previous redação (F4).
9. A word popover with "Ver a alteração" and "Ver como estava antes".
10. Stable URLs by act id, with redirects from index URLs.

### Step C: compare (M)

11. Fold unchanged números ("Números 4 a 7 sem alterações · Mostrar").
12. Swap the two redações. Step the pair with ‹ ›. "Alteração 3 de 9" with next/previous change.
13. Mode and layout in the URL. Short select labels with full date ranges. "Lado a lado" on wide screens. Dates or act ids for `de` and `ate`.
14. "Copiar antes e depois", which copies both texts with their citations.

### Step D: diploma and act level (M–L)

15. The act as a changeset: grouped by the act's own article, then in code order, with epígrafes, inline redlines, "99 alterados · 16 aditados", the entry-into-force split, and the act's transitional norms (F10).
16. The diploma at a date: a date lens on the índice, articles that do not exist yet or are revoked marked in text, and "alterado depois desta data" (F11).
17. What changed between two dates, for a whole diploma.
18. A timeline of the diploma's acts, numbered ("13.ª alteração"), with retificações apart. A copy-ready list of amending acts for art. 6.º of Lei 74/98.
19. A map of changes (articles × acts) and "artigos mais alterados".
20. The history of one número across all redações, for comparing the rule over time.

### Step E: accessible "origem do texto" (M)

21. Off by default. When on, the whole text is one tab stop with arrow keys inside. Lines drawn with `text-decoration`. A different line style per act. Optional superscript markers. Retune act-5 and act-7 so every pair of act colours stays clearly different (ΔE ≥ 15) under simulated colour blindness (F12).

### Data work (pipeline, alongside)

22. A correspondence table for renumbered CRP articles, built by text similarity, plus "Elimina" operations (data problem 1). Effort L.
23. Retificações as corrections of the redação they fix (data problem 3).
24. The replay check against the official text, which would have caught the missing Lei 82-B/2014 (data problem 2). This is already Phase 1 of the plan.

Steps A and B make the article page a place you can move through, and they fix the two trust problems (old text shown as in force, and the 2026 IRC rate). Both need no new data.
