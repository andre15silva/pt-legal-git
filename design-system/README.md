Redação is the history of every article of Portuguese law: what it says on any date, what changed, which act wrote each phrase, and what Parliament is about to change. The name comes from the phrase every Portuguese citation uses, *na redação dada pela Lei n.º …*. Build every screen so that a tenant on a phone and a tax partner at a desk can both trust what they read.

## Principles

1. **The law is the hero.** Statute text is set large, in `statute` on white, inside a `measure`-wide column. Chrome stays quiet around it.
2. **Every date says which date it is.** Publicação, entrada em vigor and produção de efeitos are different facts. Never print a bare date next to law; label it, or let `DateLens` set it.
3. **Change is shown twice.** Added text: `ins-ink` on `ins-bg` *and* underline. Removed: `del-ink` on `del-bg` *and* strike-through. Blue and orange are reserved for change and never reused for brand, success or error.
4. **Provenance on every view.** Each article carries a `SourceNote` with a link to the act in the Diário da República and its verification pill. We are not the official source and say so in one calm sentence.
5. **Neutral by construction.** No party colours, no rankings of parties, procedural words for outcomes ("Rejeitado", "Caducou"), never "failed".
6. **Git is the engine, not the vocabulary.** Citizens never see commit, diff, blame, branch or hashes. Professionals see them only in the API and export panels.

## Content fundamentals

- **Standard: PTS.** All product copy follows *Português Técnico Simplificado* (PTS), our pt-PT adaptation of ASD-STE100 Simplified Technical English. The full rules and the controlled dictionary are in the project's `docs/ESTILO.md`; `tools/estilo.py` checks copy automatically. The core rules:
  - At most 20 words in an instruction and 25 in a description. One instruction per sentence. At most six sentences per paragraph.
  - Verb forms: infinitive for buttons and links ("Comparar redações"), 3rd-person imperative for instructions ("Escolha a data"), present indicative for descriptions, pretérito perfeito simples for past events. No gerúndio, no compound tenses or periphrases ("tem sido", "vai ser", "está a ser"), no conditional.
  - Active voice. Say who acts: "A Lei n.º 64/2025 alterou o artigo." Passive only for legal terms ("revogado", "publicado").
  - One word, one meaning, from the controlled dictionary: *redação* (one unit), *versão* (a whole diploma), *alteração*, *entrar em vigor*, *produzir efeitos*, *pesquisar*, *seguir*. No synonyms for variety.
  - No semicolons, no dash asides, no exclamation marks, no emoji. The dash appears only where the law uses it ("1 — …", "Artigo 87.º — Taxas").
  - No filler or marketing words ("descubra", "intuitivo", "robusto", "de facto", "em suma"). No rhetorical questions.
- **Language:** European Portuguese (pt-PT) with the 1990 spelling agreement, as the Diário da República uses: *ecrã*, *ficheiro*, *utilizador*, *registo*, *guardar*. Never pt-BR. Address the reader with an implicit "você"; never write "você", "V. Ex.ª" or "tu".
- **Warnings:** two levels only. **Atenção** when the reader could reach a wrong legal conclusion (a transitional norm changes the rate), **Nota** otherwise. Start with the condition, then the consequence.
- **Legal terms of art stay exact:** *redação*, *versão*, *em vigor*, *revogado*, *aditado*, *republicação*, *declaração de retificação*, *produção de efeitos*. Use **redação** for one unit (artigo, número, alínea) and **versão** for a whole diploma.
- **Git → interface vocabulary:**

  | Engine | Interface |
  |---|---|
  | commit | alteração · ato modificativo |
  | diff | comparar redações |
  | blame | origem do texto |
  | log | história desta lei |
  | tag | republicação · revisão constitucional |
  | branch / pull request | iniciativa (projeto / proposta de lei) |
  | review | votação |
  | merge | publicação no Diário da República |

- **Designations:** exactly as published: "Lei n.º 13/2023, de 3 de abril", "Decreto-Lei n.º 47344, de 25 de novembro de 1966", "Lei Constitucional n.º 1/89". Use the ordinal indicator `º` (U+00BA), never the degree sign.
- **Dates:** written out in prose ("8 de julho de 1989"); `dd/mm/aaaa` only in dense tables. Always `font-variant-numeric: tabular-nums` where dates stack.
- **Citations:** "artigo 1.º da Constituição da República Portuguesa, na redação dada pela Lei Constitucional n.º 1/89, de 8 de julho" (see `Citation`).
- **Summaries:** an official *resumo em linguagem clara* is labelled "Resumo oficial". A machine summary is labelled "Resumo automático. Pode conter erros." with a dashed `rule-strong` border, and never sits inside the statute column.
- **No emoji.** Glyphs only where a component defines them (✓ ✕ – ● ◌ ⊘ §).

## Visual foundations

The visual language is **Hvit** ("white"): white paper, hairline rules, one green accent, serif for facts, sans for actions. The reasons are in the project's `docs/DESIGN-DIRECTION.md`, section 8. The values are in `tokens.json`; `tools/tokens_css.py` writes `tokens.css` from it, and `tools/check_contrast.py tokens.json` checks every pair.

### Colour

- Ground: `paper`, pure white. No tinted panels. `paper-raised` only for floating layers (popovers, sheets, the phone bar). `paper-sunken` only as a hover wash.
- Rules: `rule` (hairlines between rows and sections, decorative only), `rule-mid` (year ticks, fold rules), `rule-strong` (borders of inputs and outline buttons, ≥3:1).
- Text: `ink` for law, headings and facts; `ink-muted` for running heads, captions and dates in lists.
- Accent: `verde` (verde-garrafa) is the only brand hue. It marks links and "you are here" (the current tab, the redação on screen). Text on a solid `verde` fill is `on-verde`.
- Change: `ins-ink`/`ins-bg` and `del-ink`/`del-bg`. Only for redlines.
- Law in the making: `pendente`/`pendente-bg`, always with a dashed line or the word.
- Warnings: the word "Atenção" in `aviso`, with a 3px `aviso-rule` beside the note. `aviso-bg` only for unverified data.
- Revoked or lapsed provisions: `revogado`, with the word.
- Focus: `focus` is `ink`, never blue, so it never reads as a change.
- Origem do texto: `act-0` (the original text, neutral) and `act-1` … `act-7` for amending acts, newest first. The set is safe for colour-blind readers. The colour is only a 3px band beside the act's name; the text stays `ink`.
- Never party colours. Never red-and-green. Never the national flag pairing. No gradients.

### Type

- **Source Serif 4** (`--font-serif`) states facts: the law (`statute`, 19/30), titles, the status line, dates and the register. Lining tabular figures.
- **Schibsted Grotesk** (`--font-sans`) offers actions: buttons, tabs, form labels, interface copy. Never uppercase. No tabular figures in sans (they space out the punctuation).
- **Atkinson Hyperlegible Mono** (`--font-mono`) only for identifiers: ELI paths, hashes, API fields.
- Statute measure: `measure` (64ch). Números hang `hang` (46px) into the margin.
- Load from Google Fonts (`components/bundle.css` imports all three).

### Space, shape and depth

- Spacing steps: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-6` 24 · `space-8` 32 · `space-12` 48 · `space-16` 64. Side gutter never below `space-4`.
- Radii: 2px for controls, 4px for floating layers. Nothing is pill-shaped.
- No boxes, cards, pills or eyebrows. Rules separate things. `shadow-sheet` only for floating layers.

### Layout

- Article view on desktop: the text column (`measure`) and the register of redações (`register`, 300px) with a 64px gap. One sticky row (`row`, 48px) holds the version stepper and the tools.
- On a phone the register goes under the text and the sticky row becomes a 56px bar at the bottom.
- Targets ≥ `target` (44px) on touch.

### States and interaction

- Focus: a solid 2px `focus` outline at 2px offset on every interactive element.
- Hover: underline thickening on links; `paper-sunken` wash on quiet controls.
- Selected: `verde` text with a 2px `verde` underline (tabs), or a `verde` rule beside the row (register).
- Motion: none needed. Version switches swap instantly; respect `prefers-reduced-motion` everywhere.

### Accessibility

- WCAG 2.2 AA minimum; aim for the acessibilidade.gov.pt *selo* (Prata or above).
- Redlines: hidden "[início de texto acrescentado] … [fim …]" markers, and keyboard "alteração anterior / seguinte" with a polite live region.
- Every table of votes has words, not colours. Every colour has a word or glyph.
- `lang="pt-PT"`; real heading hierarchy; `<abbr>` for n.º, al., DL, CRP.
- Print: redlines print as [+…+] / [−…−], with the version date, permalink and the non-official notice in the header.

## Iconography

There is no icon set. Status is a word, sometimes with a Unicode glyph next to it (● ◔ ⊘ + ◌ ✓ ! § ✕ –). Never use the armillary sphere, the national coat of arms, or the Diário da República / INCM marks: Redação must never look like an official publication.

## Components

| Component | Use it for |
|---|---|
| `Button` | Actions: one `primary` per view |
| `StatusPill` | State of a provision, version or datum, as glyph + word |
| `ActChip` | Naming an act, with its origin colour |
| `Redline` | Comparing two redações ("comparar redações") |
| `TextOrigin` | Which act wrote each phrase ("origem do texto") |
| `DateLens` | Setting the page's point in time and date basis |
| `TimeRuler` | The redações of an article on a line of years, to pick one by date |
| `VersionBar` | The one sticky row: "‹ Anterior", "Seguinte ›", the status and the tools |
| `Register` | The ruled list of redações, with the current one marked |
| `Popover` | A small floating layer that opens from a button and closes with Esc |
| `VersionTimeline` | "A história desta lei" (older pages) |
| `ProcessTrack` | An iniciativa's path through Parliament |
| `VoteBar` | A vote, by sentido and by grupo parlamentar (older pages) |
| `Votacao` | A vote in words: the groups under A favor, Contra and Abstenção, dissent, absences and the seat check |
| `Citation` | Copyable citation of the exact version shown |
| `SourceNote` | Provenance and the non-official notice |

All components live in `components/bundle.js` as `window.Redacao` and expect React 18 on the page.

## Using the system on a page

Load, in this order: `tokens.css` (all tokens as CSS variables, light on `:root`, dark under `[data-theme="dark"]`), `components/bundle.css` (component styles; it imports the three Google Fonts), React 18 and ReactDOM 18, then `components/bundle.js`. This applies to a Design canvas too. Plain markup between components uses the same variables: `var(--paper)`, `var(--ink)`, `var(--font-serif)`, `var(--space-4)`, and so on. Data in the previews is either real (the Constitution's article 1.º and its revisions) or marked "dados de exemplo".
