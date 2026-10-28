# Plan: Redação, a version history of Portuguese law

*Working name: **Redação**, from the phrase every Portuguese citation of a version uses: "na redação dada pela Lei n.º …". The project codename is "Git para a Lei".*

## 1. What we are building

A public, verifiable history of every article of Portuguese law, inspired by Lexifina's [Git for the US Code](https://lexifina.com/blog/git-for-the-us-code). It answers five questions for any article:

1. **What did it say on a given date?** Choose the date, and choose which date counts: publication, entry into force or production of effects.
2. **What changed?** A redline between any two versions.
3. **Who wrote this phrase?** Each phrase is linked to the act that wrote it, the initiative it came from and how each parliamentary group voted.
4. **What is about to change?** Pending initiatives on this article, where they stand in Parliament, and a watermarked simulation of the result.
5. **Can I trust it?** Every version links to the act in the Diário da República (DR) and says how it was verified.

Underneath, the law is held as a tri-temporal norm graph and exported as a real git repository: author date = entry into force, committer date = publication, trailers with the ELI, initiative and votes. Developers and AI agents get a date-explicit API and an MCP server.

## 2. Why now, and why us

- **The data is reachable.** parlamento.pt publishes initiatives, events and per-group votes as JSON/XML per legislature. The DR exposes per-article consolidated versions, with entry-into-force dates and the amending act, through its web app's JSON endpoints. DL 83/2016 guarantees free, open access to DR content. See [DATA-SOURCES.md](DATA-SOURCES.md).
- **"Portuguese law in git" is already a commodity, so we must not build another mirror.** At least five projects mirror the DR consolidation as Markdown: legalize-pt, LawCodex/pt, LawAgents/pt, Ansvar's MCP server and the lauyer CLI. Abroad, the bill-as-branch idea also exists: sejm2git (Poland) and us-congress-pipeline (US) model bills as branches with votes in commit trailers, and houritsu (Japan) dates commits by entry into force. See [RELATED-WORK.md](RELATED-WORK.md).
- **What nobody does for Portugal is the part that needs evidence.** None of these projects replays Portuguese amending acts and publishes how well the result matches the official text. None keeps publication, entry-into-force and effect dates apart: legalize-pt commits by publication date, and in the snapshot we inspected its Código do IRC file still holds the 1988 text. None joins Parliament's initiatives and votes to the articles they changed.
- **Our positioning:** *the first project to replay Portuguese amending acts against the official consolidation and publish its match rate, with separate publication, entry-into-force and effect dates, and with every change linked to its parliamentary initiative and votes.* We do not claim to be "the first git for Portuguese law".
- **LLMs need it.** The TU Munich results cited by Lexifina (24% → 87% accuracy when the temporally correct statute is retrieved; LLM-regenerated history is not reliable) make a checkable, date-explicit corpus valuable infrastructure for Portuguese legal AI.

## 3. Who it is for

Six stakeholder panels shaped this plan; see [STAKEHOLDERS.md](STAKEHOLDERS.md). In short:

| Audience | The promise |
|---|---|
| Citizens, students | "What does the law say about my situation, since when, and what changed?" in plain Portuguese on a phone, with the history of each article told as a story. |
| Lawyers, judges, solicitadores | The redação applicable on the date of the facts, the transitional norms that override it, and a citation that pastes correctly. |
| Parliament and drafters | The state of an article before amending it, conflicts between concurrent initiatives, the next alteration ordinal, and the republication annex. |
| Journalists, civic tech | Who wrote this sentence and who voted for it; how often a law changes; open data and `git clone`. |
| Compliance, tax, legal AI | Watchlists, daily digests, effect-aware as-of queries, and provenance hashes over an API and MCP. |

## 4. Product principles

1. **Three dates, never one.** Publicação, entrada em vigor and produção de efeitos are always labelled.
2. **Evidence before convenience.** Every computed fact cites its source and its rule. Unknowns are shown as unknown.
3. **Machines select, they never write.** Text is applied deterministically. An LLM may propose a parse, but every inserted character must be a verbatim span of the source act.
4. **Not official, and honest about it.** One permanent sentence: only the DR publication has legal force (*faz fé*).
5. **Neutral by construction.** No party colours, no party scoring, procedural vocabulary for outcomes.
6. **Git is the engine, not the vocabulary.** People see *alterações*, *origem do texto*, *comparar redações*, *iniciativas*.
7. **The point-in-time view is free forever.** Revenue comes from workflow (alerts, teams, exports, SLA), not from access to the law.
8. **Plain, controlled Portuguese.** All copy follows PTS, our pt-PT adaptation of ASD-STE100 ([ESTILO.md](ESTILO.md)), checked by `tools/estilo.py` on every push (`.github/workflows/checks.yml`).

## 5. Scope by phase

### Phase 0: Reconnaissance and spikes (4 weeks)

Goal: hard numbers on feasibility before building the product.

- [x] Map the parlamento.pt open data: Iniciativas JSON per legislature; events, votes and the publication event. Parser: [`tools/parlamento.py`](../tools/parlamento.py).
- [x] Link initiatives to DR acts. Exact via `TextosAprovados` → Diplomas Aprovados: **136/136** laws in the XVII legislature (99.4% across all legislaturas). Title-matching fallback: 99.2% precise at 88% recall. Tool: [`tools/link_dr.py`](../tools/link_dr.py).
- [x] Find the DR per-article consolidated versions API: versions carry `DataEntradaVigor`, `DataVersao` and the amending act. Fetched the full history of CIRC art. 87.º (7 versions).
- [x] Evaluate legalize-pt as a bootstrap: good coverage and metadata, one date per change, stale for renumbered codes.
- [ ] Client for the DR consolidated API with a content-addressed cache; coverage census (how many diplomas and articles have versions, and how far back).
- [ ] Grammar spike for amending instructions on 200 random acts from 2020–2026: share parsed deterministically.
- [x] First replay test: Lei 13/2023 → Código do Trabalho, **90/97 articles exact** with 5 rules.
- [x] **Visualizer prototype** ([`app/`](../app/), [`pipeline/`](../pipeline/)): CRP, CT, CIRC and NRAU from the DR consolidated API. It has word-level origin, comparison of any two versions, act and initiative pages, and links to 142 parliamentary initiatives. It is not yet verified by replay.
- [ ] Replay spike on the CRP (7 revisions, each republished, so every version has an official checkpoint): compute M1/M2.
  - [x] M2 for the DR consolidated text: 96.6% of 994 versions match an official republication; 5 versions are out of date and 29 differ ([ARCHITECTURE.md](ARCHITECTURE.md#first-measurement-the-dr-consolidated-crp-against-its-8-official-texts-2026-10-28)).
  - [x] M1: replay each revision's instructions with a deterministic grammar: 70.8% of changed articles exactly; 100% for 2001 and 2005, 95.6% for 2004 ([ARCHITECTURE.md](ARCHITECTURE.md#first-replay-the-7-revisions-of-the-crp-m1-2026-10-28)).
- [ ] Talk to INCM (DR) and the AR open-data team about bulk access, and to legalize.dev about cooperating.
- [ ] Align identifiers and the AKN export with the draft **AKN-PT / ELI-PT profile** (`dapl-sggov/akn-pt`, led by DAPL/SGGOV). Contact its authors early.
- [ ] Evaluate against **timimata/lex**, an open PT-PT legal QA benchmark with dated questions and every Código do Trabalho article version since 2009.
- [ ] Decide whether to use **api.votoaberto.org** (fsmunoz/parlamentodb) for votes or keep our own parser. Compare the two on the XVII legislature.
- [ ] Study **sejm2git**'s fidelity dashboard and copy its CI gate (the build fails when the match rate drops).

**Exit criteria:** M1 ≥ 95% on the CRP; DR client stable for 2 weeks (it survives a deploy that changes its API hashes); a written position from INCM on reuse of the consolidated texts.

### Phase 1: MVP, "a história de cada artigo" (3 months)

**Corpus.** The Constituição; Código do Trabalho; NRAU plus the Código Civil articles on arrendamento; Código do IRC and Código do IRS (to prove efficacy handling); Lei 74/98. Each one is a stress test for a different hard case: renumbering and tags, staggered vigência, cross-diploma acts, transitional efficacy, and the formulário itself.

**Product.**
- Article view: DateLens (three bases), statute text, Origem do texto, history timeline, transitional-norm panel, SourceNote, Citation.
- Comparar redações: inline and side-by-side, accessible, printable.
- Ato view (the "commit"): what an act changed, its dates with the rules used, links to the DR.
- Search with a colloquial synonym layer, plus "A minha situação" entry points for 6 life events.
- Public `lei-pt` git export (CC0), refreshed daily.
- A public verification report per diploma (M1–M7).

**Success:** M1 ≥ 97%, M2 ≥ 99%, zero unflagged date assumptions. Five practitioners, five citizens and two parliamentary advisers complete the top tasks unaided in usability tests (WCAG 2.2 AA, screen-reader tested).

### Phase 2: Parliament, "a lei em construção" (2–3 months)

- Iniciativa view (the "pull request"): ProcessTrack, documents, VoteBar per vote, joint initiatives, the resulting act.
- A pending overlay on every article: "3 iniciativas pendentes alteram este artigo".
- Simulation: an initiative or texto de substituição applied to the current text, watermarked.
- A conflict matrix for concurrent initiatives on the same article (legislative staff's #3 job).
- Origem do texto extended to initiative and votes: "this phrase came from PPL 16/XVII; votação final global 17/10/2025".
- Alerts by article or diploma: email, RSS, webhooks.

### Phase 3: Breadth and professional tools (3–4 months)

- All diplomas with DR consolidation (Strategy A bootstrap, upgraded to replay over time).
- REST API v1 and an MCP server; Parquet/SQLite dumps.
- Pro: watchlists with daily digests, quadro comparativo export (DOCX), team workspaces, annotation.
- Formulary assistant: next alteration ordinal, list of prior amenders, republication trigger (Lei 74/98 art. 6.º).

### Phase 4: Depth (ongoing)

- A "tal como conhecido em" UI (the knowledge axis): what a careful reader could know on K.
- TC declarations with repristination; apreciação parlamentar; caducidade schedules.
- Akoma Ntoso export with passive and active modifications.
- DR 2.ª série regulations (Avisos BdP, regulamentos ERSE/CMVM) with their own identifiers.
- Learning mode: constitutional revisions 1976 → 2005, Teoria da Lei overlays, exercises.
- A Portuguese temporal legal-QA benchmark, to show the uplift from retrieval.

## 6. Organisation and sustainability

- **Home.** A university legal-informatics group or a civic-tech NGO, with an advisory board balanced across practitioners, academia, journalism and Parliament staff. It should not depend on one person; the lessons from Archéo Lex and bundestag/gesetze apply.
- **Licences.** Data and git export: CC0. Official texts are not protected (CDADC art. 8.º, n.º 1), but the DR's consolidations may be protected as compilations (art. 3.º, n.º 1, c)). So the published corpus is our own reconstruction from the original acts, and the DR consolidation is used for verification. Access is guaranteed by DL 83/2016 and the open-data regime of Lei 68/2021. Parsers and SDKs: Apache-2.0. Web app: AGPL-3.0. Annotations: CC BY 4.0.
- **Funding.** Grants for the build (FCT, Gulbenkian, EU programmes such as NGI and the Digital Europe legal-data calls). The professional tier and the API SLA pay for maintenance. Newsroom partnerships for launch.
- **Relations.** Cooperate with INCM, the AR open-data team and legalize.dev without seeking endorsement. Upstream fixes to legalize-pt where we find them.

## 7. Launch moments

- **"Quem escreveu esta frase?"** Tap any sentence of the Código do Trabalho and see the act, the initiative and the vote.
- **"O IRC desce para 17%… em 2028."** The CIRC art. 87.º example as a public explainer of what entry into force and production of effects mean.
- **"A Constituição em 7 revisões"** as an interactive redline for students.
- **A public match-rate report:** every diploma with its replay score against the official text, and every mismatch with its cause.

## 8. Top risks

| Risk | Mitigation |
|---|---|
| DR internal API changes or rate limits | Content-addressed cache, contract tests, legalize-pt fallback, INCM agreement |
| One wrong, prominent date destroys trust (the judge's "I never open it again") | Verification states on every version; date rules shown; a corrections changelog with notification of affected hashes; launch on a small, fully verified corpus |
| Political misattribution | Attribution chain (act → initiative → texto final → votes), never "party X wrote this"; per-group parsing QA |
| Maintenance cliff after launch | Institution, not a person; paid tier; one-command rebuild |
| Scope creep into commentary or case law | Not our product. Link out to DGSI, the TC and doctrine; stay the infrastructure layer |

## 9. Deliverables in this repository

| | |
|---|---|
| [STAKEHOLDERS.md](STAKEHOLDERS.md) | Synthesis of the six stakeholder panels |
| [RELATED-WORK.md](RELATED-WORK.md) | Related projects worldwide and in Portugal; what we copy and what we avoid |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data model, pipeline, git export, API/MCP, stack |
| [DATA-SOURCES.md](DATA-SOURCES.md) | What the DR and parlamento.pt actually expose, with probes |
| [DESIGN.md](DESIGN.md) | Design principles, information architecture, screens, design system |
| [ESTILO.md](ESTILO.md) | PTS: the pt-PT copy standard adapted from ASD-STE100, with a controlled dictionary |
| [`design-system/`](../design-system/) | The Redação design system source (tokens, components, brand book) |
| [`tools/`](../tools/) | Phase-0 spikes: the parlamento.pt parser and the initiative → DR linker |
| [`research/`](research/) | Raw stakeholder and source reports |
