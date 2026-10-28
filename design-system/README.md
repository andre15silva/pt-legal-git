Redação is the history of every article of Portuguese law: what it says on any date, what changed, which act wrote each phrase, and what Parliament is about to change. The name comes from the phrase every Portuguese citation uses, *na redação dada pela Lei n.º …*. Build every screen so that a tenant on a phone and a tax partner at a desk can both trust what they read.

## Principles

1. **The law is the hero.** Statute text is set large, in `statute`, on `paper-raised`, inside a `measure`-wide column. Chrome stays quiet around it.
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

### Colour

- Ground: `paper`. Reading column, panels and sheets: `paper-raised`. Rails, table heads, inactive tracks: `paper-sunken`.
- Text: `ink` for law and headings; `ink-muted` for dates, captions and secondary lines. Both hold ≥4.5:1 on all three grounds in both themes.
- Accent: `verde` (verde-garrafa) is the only brand hue. It marks links, the current version, primary actions and "Em vigor". Text on a solid `verde` fill is `on-verde`. `verde-soft` is its quiet fill.
- Change: `ins-ink`/`ins-bg` and `del-ink`/`del-bg`. Only for redlines and change counts.
- Law in the making: `pendente`/`pendente-bg`, always with a dashed outline or the word "Pendente".
- Trust warnings: `aviso`/`aviso-bg` for "Não verificado", default-date assumptions and retroactive effects ahead.
- Revoked or lapsed provisions: `revogado`, with the word.
- Origem do texto: `act-0` (versão originária, neutral) and `act-1` … `act-7` for amending acts, assigned in order of first appearance in the legend. These are marks (underlines, swatches, margin bands) at ≥3:1; the text stays `ink`.
- Never red-and-green. Never the national flag pairing. No gradients.

### Type

- **Source Serif 4** (`--font-serif`) for the law and for diploma and article headings: `display` (diploma title, once per page), `title` (single-article heading), `article` (heading inside a diploma), `statute` (19/31, the body of the law), `statute-small` (quoted law in panels).
- **Atkinson Hyperlegible Next** (`--font-sans`) for the interface: `heading`, `body`, `small`, `label` (uppercase, +0.06em). Chosen for legibility for low-vision and low-literacy readers.
- **Atkinson Hyperlegible Mono** (`--font-mono`) only for identifiers: ELI paths, content hashes, API fields (`id`).
- Statute measure: `measure` (68ch). Interface copy ≤ 65ch.
- Load from Google Fonts (`components/bundle.css` imports all three).

### Space, shape and depth

- Spacing steps: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-6` 24 · `space-8` 32 · `space-12` 48. Side gutter never below `space-4`.
- Radii are small: `radius-xs` (change tints, swatches), `radius-sm` (buttons, inputs, pills), `radius-md` (panels, sheets). Nothing is pill-shaped except status dots.
- Borders, not shadows: panels are set off by `rule`. Controls use `rule-strong`, which meets 3:1. `shadow-sheet` only for floating layers (the Origem do texto sheet, popovers, a sticky DateLens).
- Hairlines in `rule` separate articles; there are no cards around articles.

### Layout

- Article view: a three-zone page on desktop: Índice rail (`paper-sunken`) · statute column (`paper-raised`, `measure`) · context rail (history, origin, pending initiatives). On phone the rails become bottom sheets, and the statute column stays full width with a `space-4` gutter.
- The `DateLens` sits at the top of every diploma view and sticks under the header when scrolled (`top: env(safe-area-inset-top)`, with `scroll-padding-top` so focus is never hidden).
- Targets ≥ `target` (44px) on touch.

### States and interaction

- Focus: a solid 2px `focus` outline at 2px offset on every interactive element; ≥3:1 on every surface in both themes.
- Hover: `paper-sunken` fill on quiet controls; underline thickening on links.
- Selected: `verde-soft` fill with a `verde` border and bold label.
- Motion: none needed. Version switches swap instantly; respect `prefers-reduced-motion` everywhere.

### Accessibility

- WCAG 2.2 AA minimum; aim for the acessibilidade.gov.pt *selo* (Prata or above).
- Redlines: hidden "[início de texto acrescentado] … [fim …]" markers, a "Ler versão final" mode, and keyboard "alteração anterior / seguinte" with a polite live region.
- Every chart has a table (see `VoteBar`). Every colour has a word or glyph.
- `lang="pt-PT"`; real heading hierarchy (Parte › Título › Capítulo › Secção › Artigo); `<abbr>` for n.º, al., DL, CRP.
- Print: redlines print as [+…+] / [−…−], with the version date, permalink and the non-official notice in the header.

## Iconography

There is no icon set yet. Status is carried by the Unicode glyphs inside `StatusPill`, `ProcessTrack` and `VoteBar` (● ◔ ⊘ + ◌ ✓ ! § ✕ –), always next to a word. When an icon set is added, use a 1.5px-stroke outline set at 20px. Never use the armillary sphere, the national coat of arms, or the Diário da República / INCM marks: Redação must never look like an official publication.

## Components

| Component | Use it for |
|---|---|
| `Button` | Actions: one `primary` per view |
| `StatusPill` | State of a provision, version or datum, as glyph + word |
| `ActChip` | Naming an act, with its origin colour |
| `Redline` | Comparing two redações ("comparar redações") |
| `TextOrigin` | Which act wrote each phrase ("origem do texto") |
| `DateLens` | Setting the page's point in time and date basis |
| `VersionTimeline` | "A história desta lei" |
| `ProcessTrack` | An iniciativa's path through Parliament |
| `VoteBar` | A vote, by sentido and by grupo parlamentar |
| `Citation` | Copyable citation of the exact version shown |
| `SourceNote` | Provenance and the non-official notice |

All components live in `components/bundle.js` as `window.Redacao` and expect React 18 on the page.

## Using the system on a page

Load, in this order: `tokens.css` (all tokens as CSS variables, light on `:root`, dark under `[data-theme="dark"]`), `components/bundle.css` (component styles; it imports the three Google Fonts), React 18 and ReactDOM 18, then `components/bundle.js`. This applies to a Design canvas too. Plain markup between components uses the same variables: `var(--paper)`, `var(--ink)`, `var(--font-serif)`, `var(--space-4)`, and so on. Data in the previews is either real (the Constitution's article 1.º and its revisions) or marked "dados de exemplo".
