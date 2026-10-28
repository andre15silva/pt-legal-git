# Design

| | |
|---|---|
| **Design system** | [Redação design system](https://claude.ai/artifact/9VHviXgVubUSFgprQGgAyB): tokens, brand book and 11 live components. Source mirrored in [`design-system/`](../design-system/). |
| **Screens** | [Redação: ecrãs principais](https://claude.ai/artifact/KCq1vDY2KCuzdGppQEtZhx): a design canvas with six screens built from the design system's real components. |

Both links are private Claude artifacts. Share them from the page's Share menu to give others access.

Every legal text, date and vote in the screens is real. Texts and dates come from the DR consolidated texts and the acts themselves (fetched 2026-10-28); votes come from the AR open data for the XVII legislatura. The verification marks show how the product will present verification; they are not the result of a verification run.

## The running example: the IRC rate cut

One real article runs through every screen because it shows, in a few numbers, why a git-like view of law needs more than one date.

> **Lei n.º 64/2025**, published 7 November 2025, rewrote art. 87.º of the Código do IRC: the general rate went from **20 % to 17 %**. It fixed no date of entry into force, so it entered into force on **12 November 2025** (5.º dia, Lei 74/98 art. 2.º). But its art. 3.º says the 17 % applies only to tax periods starting in **2028**. For 2026 the rate is **19 %**, and for 2027 **18 %**.

A plain `git log` would say "17 % since 12 November 2025", which is wrong for every IRC return until 2028. The design makes this impossible to miss:
- The **DateLens** asks which date counts: em vigor, produção de efeitos, or publicação.
- The **transitional-norm panel** appears above the statute whenever an efficacy rule applies to the chosen date. It shows the rate table and cites its source article.
- **Origem do texto** shows that "17" was written by Lei n.º 64/2025, "50 000" by Lei n.º 24-D/2022, n.º 8 by Lei n.º 82/2023, and so on.

## Screens

| Screen | Audience | Shows | Git concept, never named in the UI |
|---|---|---|---|
| **Artigo** (CIRC art. 87.º on 1 March 2026) | Everyone; on by default for professionals | DateLens; transitional-norm panel; statute text with origin underlines; legend of 6 acts; history of 7 versions with verification; SourceNote; Citation; Índice; Parliament panel | `checkout <date>`, `blame`, `log` |
| **Comparar redações** (2019 → today) | Lawyers, judges, tax advisers | Inline redline per número, unchanged números collapsed; three modes (marked / new only / old only); keyboard navigation through changes with a live region; a "passo a passo" table of every intermediate version (for the most-favourable-law test) | `diff A..B`, `log A..B` |
| **Ato** (Lei n.º 64/2025) | Professionals, journalists | The three dates, each with its rule; what it changed (redlines); the rate by tax period, with the transitional years hatched; where it came from (initiative, final vote, promulgation, referenda) | `show <commit>` |
| **Iniciativa** (Proposta de Lei n.º 16/XVII) | Parliament staff, journalists, students | ProcessTrack from Entrada to Publicação; two VoteBars (generalidade, votação final global); the 5 initiatives debated with it, 4 of which also amended the CIRC and were rejected | PR, reviews, competing branches |
| **Telemóvel** (Código Civil art. 1577.º) | Citizens | Plain search ("casamento"); the article as the answer; "Como este artigo mudou" with 1967 / 1978 / 2010 tabs, a one-line summary and a redline each | `log -p`, simplified |
| **Para programadores** | Developers, AI builders | `git log` of the article, a commit with the three dates in trailers, an API response with `transitorias[]` and `avisos[]`, MCP tools | The real git vocabulary |

## Information architecture

```
Redação
├── Pesquisar ...................... colloquial synonyms ("lei das rendas" → NRAU) and exact references ("art 87 CIRC")
├── A minha situação ............... life events: Casa e arrendamento · Ter um filho · Trabalho · Reforma · Impostos · Consumidor
├── Diplomas
│   └── <diploma> .................. versions · Índice · republicações · alteration list (n.ª alteração)
│       └── <artigo> ............... Artigo screen (?em=AAAA-MM-DD&base=vigor|efeitos|publicacao)
│           └── comparar ........... Comparar redações (?de=&ate=)
├── Atos
│   └── <ato> ...................... Ato screen: dates, effects, origin initiative, votes
├── Iniciativas no Parlamento
│   └── <legislatura>/<tipo>/<n> ... Iniciativa screen; pending overlay on every affected article
├── Seguir ......................... alerts by article or diploma (email, RSS, webhooks)
└── Para programadores ............. git, API, MCP, bulk downloads, verification reports
```

URLs are readable and citable: `/codigo-irc/artigo-87?em=2026-03-01&base=efeitos`. Every view is a permalink that pins its date.

## Principles applied

1. **The law is the hero.** The statute is set in Source Serif 4 at 19/31 in a 68ch column on `paper-raised`; the interface chrome stays quiet around it.
2. **Every date says which date it is.** No bare dates next to law.
3. **Change is shown twice.** Blue underline for added text and orange strike-through for removed text, plus hidden screen-reader markers and a forced-colours fallback. Blue and orange are reserved for change.
4. **Provenance everywhere.** A SourceNote under every article; a verification pill on every version; the rule used for every computed date.
5. **Neutral by construction.** Votes are encoded by lightness and pattern (solid green, hatched, solid ink), never by party colour. Groups are listed in the official record's order. Outcomes use procedural words ("Rejeitado na generalidade").
6. **Git is the engine, not the vocabulary.** Only the developer screen says commit, log or diff.

## Vocabulary

| Engine | Interface (pt-PT) |
|---|---|
| commit | alteração · ato modificativo |
| diff | comparar redações |
| blame | origem do texto |
| log | história deste artigo |
| tag | republicação · revisão constitucional |
| branch / pull request | iniciativa (projeto / proposta de lei) |
| review | votação |
| merge | publicação no Diário da República |
| revert | not used: repristinação is not a revert |

Use **redação** for one unit (artigo, número, alínea) and **versão** for a whole diploma.

## Visual identity

- **Name:** *Redação*, after "na redação dada pela…". Tagline: *A história de cada artigo da lei portuguesa.*
- **Colour:** a cool paper ground and ink, with one accent, *verde-garrafa* (`verde`). Change colours are reserved: `ins-*` (blue) and `del-*` (orange), colour-blind safe. `pendente` (purple, always dashed) for law in the making; `aviso` (amber) for trust warnings; seven `act-*` marks for origin. Every text pair checks ≥ 4.5:1 in both themes, and every mark ≥ 3:1. Run `python -I tools/check_contrast.py design-system/tokens.json` to check.
- **Type:** Source Serif 4 for the law; Atkinson Hyperlegible Next for the interface, chosen for low-vision and low-literacy readers; Atkinson Hyperlegible Mono only for identifiers.
- **Shape:** small radii (2/4/8 px), borders rather than shadows, no cards around articles.
- **What it must never look like:** the Diário da República, INCM, gov.pt, or anything with the armillary sphere or coat of arms.

## Accessibility checklist (WCAG 2.2 AA; aim for the acessibilidade.gov.pt *selo*)

- Redlines: hidden "[início/fim de texto acrescentado/eliminado]" markers; a clean "new text only" mode; previous/next change buttons with a polite live region; underline and strike survive forced colours.
- The date control is a native `<input type="date">` with a "Hoje" button. There is no drag-only slider.
- Origin spans are keyboard-focusable (`role="button"`, Enter/Space) and carry an `aria-label` naming the act.
- Every chart has a table (VoteBar) or a text alternative (rate chart).
- `lang="pt-PT"`; a real heading hierarchy; targets ≥ 44 px on touch; reflow at 320 px; reduced motion respected.
- Print: [+…+]/[−…−] markers, version date, permalink and the non-official notice.

## Open design questions

1. How to show *"tal como conhecido em K"* (the knowledge axis) without overwhelming the article view: a second date in an advanced drawer, or a separate "audit" mode?
2. Article ↔ número granularity on phones: collapse números by default, or show all?
3. A simulation ("se a iniciativa X for aprovada") needs a watermark that survives screenshots. Candidates are a dashed pendente frame with a repeated diagonal label, or a page-wide banner.
4. Annotation and sharing for students, without public comments on law text.
