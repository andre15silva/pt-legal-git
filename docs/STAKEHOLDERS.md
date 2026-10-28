# Stakeholders: what each panel needs

Six stakeholder panels were run as separate research agents, each with its own goals and web research. Their full reports are in [`research/personas/`](research/personas/). This page is the synthesis: what they agree on, where they pull against each other, and how the design resolves it.

| Panel | Who | Report |
|---|---|---|
| Practitioners | litigation advogada, juiz de direito, solicitador | [practitioners.md](research/personas/practitioners.md) |
| Legislative | assessor parlamentar, legislative drafter (PCM/ministry), deputado | [legislative.md](research/personas/legislative.md) |
| Public interest | political/data journalist, transparency NGO, open-source developer | [civic.md](research/personas/civic.md) |
| Citizens & learning | tenant/worker on a phone, 2.º-ano law student, accessibility specialist, plain-language specialist | [citizen-a11y.md](research/personas/citizen-a11y.md) |
| Professional & AI | bank compliance officer, Big-4 tax adviser, legal-AI product lead | [professional.md](research/personas/professional.md) |
| Architecture | legal-informatics researcher, constitutional historian, software architect | [architecture.md](research/personas/architecture.md) |

## Top jobs to be done, by panel

| # | Job | Practitioners | Legislative | Public interest | Citizens | Professional |
|---|---|:-:|:-:|:-:|:-:|:-:|
| 1 | **Text that applied on date D**, with the right date basis | ●●● | ● | ●● | ●●● | ●●● |
| 2 | **What changed** between two dates, as a readable redline | ●● | ●● | ●● | ●●● | ●●● |
| 3 | **Who wrote this phrase** (origem do texto) and from which initiative/vote | ● | ●● | ●●● | ●● | ●● |
| 4 | **Law in the making**: pending iniciativas on this article, process, votes, "what if it passes" | ● | ●●● | ●●● | ●● | ●● |
| 5 | **Alerts** on an article or diploma | ●● | ●● | ●● | ● | ●●● |
| 6 | **Exact citation** with permalink to the version | ●●● | ●● | ● | ●● (students) | ●● |
| 7 | **Transitional norms and effects** surfaced next to the text | ●●● | ●● | | ● | ●●● |
| 8 | **Formulary help**: next "n.ª alteração", republication trigger, quadro comparativo | | ●●● | | | |
| 9 | **API / bulk / MCP** with provenance hashes | | ● | ●●● | | ●●● |
| 10 | **Learning**: constitutional revisions, Teoria da Lei overlays | | | ● | ●●● | |

## Where every panel agreed

1. **Three dates, never one.** Publicação, entrada em vigor and produção de efeitos are different facts. Every panel raised this without being prompted. The real CIRC example in [DESIGN.md](DESIGN.md) shows why: after Lei n.º 64/2025 the text in force says 17%, but the rate that applies to 2026 is 19%.
2. **Provenance on every line.** Each version links to the act in the Diário da República. Each version carries a verification state (checked against an official republication, against the DR consolidated text, reconstructed, or not verified). Default-rule dates say so.
3. **Not official, and say so calmly.** The DR's own consolidated text "não tem valor legal". One permanent line, not a wall of disclaimers. Nothing that looks like the DR, INCM or gov.pt.
4. **Git is the engine, not the vocabulary.** Citizens, judges and deputies never see "commit", "blame" or "branch". The interface says *alteração*, *origem do texto*, *comparar redações*, *iniciativa*. Git terms stay in the API and the bulk export.
5. **Never guess.** Unknown dates are `desconhecida`. Tacit repeal is "juízo do intérprete". Unattributed text is labelled. An LLM may propose a parse, but it never writes law text.
6. **The point-in-time view is free.** The DR is free; charging for "what was the law on D" would kill trust. Charge for alerts, team workspaces, exports and the API SLA.
7. **Neutrality is a feature.** No party colours, no party "effectiveness" scores, procedural words for outcomes ("Rejeitado", "Caducou"). The same data depth for every group, with parsing errors monitored per party.

## Tensions and how the design resolves them

| Tension | Resolution |
|---|---|
| Citizens want the simplest "what does the law say today"; professionals want every date and state. | One article view with progressive disclosure. The default is the current text plus one sentence ("Em vigor desde…"). The `DateLens`, origin bands and the transitional-norm panel are one tap away, and are on by default for signed-in professional profiles. |
| Legislative staff want "git" words (branch, conflito, diff); judges reject them. | Vocabulary by audience. The parliamentary workspace uses *conflito entre iniciativas* and *simulação*. The public site uses procedural Portuguese. The API uses git terms. |
| Journalists want "who voted for this sentence"; legislative staff warn that a texto de substituição belongs to the comissão, not a party. | Attribution chain, not a single owner. Text → ato → iniciativa(s) → texto final da comissão → votações. Show "baseado em PJL A, B" and every group's vote, and never collapse adopted text to one party. |
| Professionals want a paid moat; the civic panel wants CC0 data and an open git repo. | Open core. The corpus, git export and point-in-time API are open (CC0 data, open-source parsers). Watchlists, team features, Word/PDF exports, SLA and regulator coverage are paid. |
| The architects say repo-per-diploma git cannot express omnibus acts; the civic panel wants a `git clone` per code. | The truth lives in a database (a bitemporal norm graph). Git is a deterministic export: one monorepo where an omnibus act is one commit across many directories, plus per-code sparse checkouts or mirrors. |
| A raw git mirror of the DR already exists (legalize-pt). | Reuse it as a bootstrap and cross-check, not a competitor. The differentiation is everything legalize-pt lacks: article identity, three dates, verification, the parliamentary layer and the interface. See [DATA-SOURCES.md](DATA-SOURCES.md). |

## Anti-features (all panels)

- A "current law" answer without a date stamp.
- AI summaries inline with the statute, or unlabeled.
- Simulated text ("if this passes") that could be screenshotted as if it were law: always watermarked, dashed and labelled *Pendente / Simulação*.
- Red/green change colouring, colour-only meaning, drag-only date sliders.
- Public comments on law text.
- Predicting whether a bill passes; scoring parties.
- Paywalling the point-in-time view.

## Facts the panels flagged as needing verification

Before any of these appear in the product, check them against the primary source: exact paragraph numbers of Lei 74/98 art. 6.º (republication rules after Lei 42/2007 and Lei 43/2014); production-of-effects dates in the COVID chain (Lei 1-A/2020 → 4-A/2020 → 16/2020); the effect limitation in Ac. TC 413/2014; ELI coverage of DR 2.ª série. Since checked: official texts are unprotected under CDADC art. 8.º (not art. 7.º), but consolidations may be protected compilations (art. 3.º, n.º 1, c)); Lei 74/98 art. 2.º now sets the 5.º dia everywhere (the 15/30-day rules for the Regions and abroad were revoked); art. 6.º, n.º 5 confirms OE amendments are never republished. See [DATA-SOURCES.md](DATA-SOURCES.md). The lei-travão is art. 167.º, n.º 2 CRP (the legislative panel's first draft said n.º 3).
