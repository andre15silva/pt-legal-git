# Professional users' panel: "Git para a Lei"

**Panel:** (A) Ana, compliance and in-house counsel at a bank and energy group (BdP, ERSE, CMVM). (B) Bruno, tax partner at a Big-4 firm (CIRS, CIRC, CIVA, EBF). (C) Carla, product lead for a RAG legal assistant built on LLMs.

**Our shared position:** we would pay for this, but only if every version can be checked against the official source and the product handles *produção de efeitos* properly. Without those two things it is just another consolidated-text portal, and the Diário da República (DR) already gives that away free.

## 1. Jobs-to-be-done, ranked

1. **Getting the text that applied on a given date, for a given set of facts (B, C).** For example: "Art. 12.º-B CIRS (IRS Jovem) as applicable to income earned in 2025." The OE2025 (Lei n.º 45-A/2024, art. 89.º) rewrote this article, and the AT applied it to the 2025 tax year (Ofício-circulado 20282/2025). Today Bruno rebuilds this by hand from the OE's own provisions on effects, which are usually buried in its final articles. Carla needs the same thing as an API call: `as_of=2021-12-31&basis=efeitos` must return the text, a content hash, and a link to the DR source for each change.
2. **A watchlist with a daily digest (A).** "These 40 diplomas: CIRC, RGICSF, the Avisos BdP on governance and AML, the ERSE Regulamento de Relações Comerciais, and DL 15/2022 (electricity system). Every morning, show what changed overnight, at article level, with the date it enters into force and the date it takes effect." The DR's own alerts are per-act, not per-article.
3. **Redlines between versions (A, B).** "Show the diff of art. 88.º CIRC between OE2024 and OE2025." The output must be clean enough to paste into a client memo or a board paper.
4. **Blame and provenance (B, C).** "Which diploma wrote n.º 3, alínea b)?" Opinions need this, the AT's arbitration pleadings (CAAD) need it, and the LLM needs it to cite correctly.
5. **Tracking EU transposition (A).** "Directive (EU) 2022/2464 (CSRD): which Portuguese acts transpose it, which articles, and is the deadline missed?"
6. **Reverse impact analysis (A, B).** "This draft *proposta de lei* on parlamento.pt amends these 14 articles of my watchlist." Pre-enactment tracking is a premium feature.

## 2. API and data product requirements

- **Identifiers.** Use ELI as the primary key (`/eli/lei/2024/12/31/45-A/p/dre/pt`-style). Per N-Lex, ELI covers DR Series I acts since 1991. Add a stable article-level fragment (`#art_12-B__n_3__al_b`). The scheme also needs its own IDs for Series II acts (Avisos BdP, ERSE and CMVM regulamentos), which I could not verify have ELI.
- **Endpoints:**
  - `GET /text/{eli}/{fragment}?as_of=YYYY-MM-DD&basis=vigor|efeitos&facts_date=`
  - `GET /diff/{eli}/{fragment}?from=&to=` returns unified diff, word-level JSON and HTML redline.
  - `GET /blame/{eli}/{fragment}?as_of=` returns per-span attribution to the amending act and article.
  - `GET /changes?since=cursor&watchlist=` is the change feed, with cursor pagination.
  - `POST /webhooks` covers act published, article changed, effects begin, correction (*Declaração de Retificação*), and sunset reached.
  - `GET /transposition/{celex}`
  - `GET /timeline/{eli}/{fragment}` lists every version with its dates.
- **Formats:** Akoma Ntoso XML (canonical), JSON (an AST of articles, números and alíneas), Markdown (for LLMs), and PDF/DOCX redlines.
- **Immutability:**
  - Every published version is content-addressed: SHA-256 over canonical text that has been Unicode-NFC normalised and whitespace-normalised.
  - Versions are never mutated. A correction creates a new commit that references the commit it supersedes.
  - Tagged releases are signed (e.g. `v2026-10-28`).
- **Bulk access:** a `git clone` of the whole corpus, one file per diploma and one commit per amending act. Commit dates use the effects date, and the publication date goes in a trailer. Parquet snapshots for analytics.
- **SLAs:**
  - Series I changes appear in the feed within 2 hours of DR publication (the DR publishes around midnight). Series II changes appear within 24 hours.
  - Uptime is 99.9%.
  - "Verified" status, meaning matched against the official consolidated text, within 5 working days.

## 3. Modelling the hard cases

- **Omnibus acts (an OE amending more than 30 codes).** One amending act produces N commits, one per target diploma, all sharing the act's ID, as an atomic "merge". Commits must be split per article, because the effects can differ article by article within the same OE.
  - Note: the *lei formulário* (Lei 74/98, art. 6.º, as amended by Lei 42/2007) exempts OE amendments from republication. So for the codes there is often **no official republished text to check against**, and the only official comparator is the DR consolidated text, which has no legal value. *(Exact paragraph number not verified.)*
- **Entrada em vigor vs produção de efeitos.** Every change needs two date ranges:
  - `vigor_from`: when the change enters into force. The default is the 5th day after publication (Lei 74/98, art. 2.º, n.º 2).
  - `efeitos_from` / `efeitos_scope`: when it takes effect and what it applies to. The scope can be a structured rule such as "rendimentos auferidos a partir de 2025-01-01", "períodos de tributação iniciados em ou após", "factos tributários ocorridos após", or "procedimentos pendentes".
  - Queries choose a `basis`. **Never collapse the two dates into one.**
- **Retroactive effects.** Store retroactive changes as bitemporal records:
  - Valid time is the period the law governs. Transaction time is when that rule was published.
  - This answers both "what did the law say on 2024-06-30 *as known then*" and "*as we now know it applies*".
  - The US prototype admits it does not handle retroactivity. That is the edge we want.
- **Transitional regimes** (*normas transitórias*). Model them as first-class objects attached to the commit. They must not be silently merged into the code text. The as-of response returns them as `applicable_transitional[]`.
- **Sunsets and temporary measures** (e.g. EBF benefits "até 31 de dezembro de 2026"). These are scheduled future commits, with a webhook when they fire. EBF "caducidade" regimes are a typical example.
- **Transposition links.** Use CELEX numbers, sourced from the EUR-Lex/N-Lex national transposition measures plus the transposition article in each act. Each link carries the deadline and its status.
- **Rules below decree level.** Cover Portarias (Series I), and Avisos BdP, ERSE and CMVM regulamentos, mostly in Series II. Also cover the *Instruções* on the BdP website, which are not in the DR. These need a source tier flag (`dr_serie_1`, `dr_serie_2`, `regulator_site`). The parent-act → regulation relationship (`regulamenta`) must be queryable.

## 4. Monetisation and positioning

- **Free:** current consolidated text, as-of lookups through the web UI, public read-only git mirror (updated with a 7-day delay), and basic diffs. This builds trust and SEO, and it competes with the free DR on UX rather than on data.
- **Pro (per seat, roughly €40–80/month, *estimate*):** watchlists, the daily digest, redline export, *efeitos* timelines, annotations.
- **API/Enterprise (usage-based plus a platform fee):** real-time feed, webhooks, Series II and regulator coverage, the bitemporal API, SLA, on-prem git sync, and the MCP server. Carla says she would pay per 1,000 as-of calls, with provenance included.
- **Data licence for LLM vendors:** a signed, versioned corpus with an attestation.
- **Against incumbents:** Datajuris, LexPoint, Informador Fiscal, Jusnet (Wolters Kluwer) and the AT's Códigos on the Portal das Finanças are content portals. They sell annotation, doctrine and case law. *(Whether they expose article-level history APIs, and at what price, could not be verified.)* We do not compete on doctrine. We are the **infrastructure layer** (verifiable time-travel and a feed) and could even license it to them. The DR's own AI assistant (launched February 2025, per web sources) is a threat on Q&A, not on provenance or APIs.

## 5. Must-have trust features

- **Per-change verification status:**
  - `verified_republicacao`: matches the official republication byte-for-byte after normalisation.
  - `verified_consolidado_dre`: matches the DR consolidated text.
  - `derived_unverified`: the amendment instruction was applied mechanically and has no comparator.
  - `manual_review`
  - `disputed`
- **Machine-applied, never LLM-regenerated.** The text is built by deterministic application of the amending instructions ("é aditado", "passa a ter a seguinte redação"). An LLM may *propose* a parse, but a rule engine and a human sign it off. Per the TU Munich study (ACL 2025, reported via Lexifina), LLM-applied amendments matched the official text exactly only about half the time.
- **Published reconciliation reports.** For each release: N changes, M matched the official text, and the mismatches listed with a reason (e.g. an error in the DR consolidated text, or a pending *Declaração de Retificação*).
- **Corrections changelog.** Covers both our errors and official *retificações*, with a diff and a notification to every subscriber who fetched the affected hash.
- **Audit log.** Each API response carries `{content_hash, commit_id, source_pdf_url, source_pdf_sha256, verification_status, retrieved_at}`. Ana needs this for supervisory audits, Bruno for his file, and Carla for citations.
- A visible **"no legal value" disclaimer** on every page. Bruno insists on it, because the DR's own consolidated text carries the same caveat.

## 6. MCP server and LLM tool interface

Keep the tools few, typed, and explicit about time. Use `get_provision` with a required `date`, so the model cannot default to today:

```
get_provision(ref: "CIRS art. 12.º-B n.º 1", date: "2021-12-31",
              basis: "efeitos"|"vigor", facts?: {tax_year: 2021})
  -> {text_md, eli, fragment, content_hash, version_range,
      transitional[], verification_status, source_url}
search_provisions(query, date, codes?[])     # date-filtered retrieval
diff_provision(ref, from_date, to_date)
blame_provision(ref, date)
list_changes(since, watchlist_id?|refs[])
resolve_reference(text: "art. 88.º do CIRC") -> eli+fragment
```

- **Rules for the server:**
  - Reject queries that have no `date`.
  - Return a `warnings[]` field, for example "a retroactive amendment published after this date affects this period", "a transitional regime applies", or "text unverified".
  - Expose resources as `lei://eli/...@sha256` so agents can pin them.
- **Carla's evaluation ask:** publish a Portuguese temporal QA benchmark (CIRS/CIRC questions across OEs) to show the uplift from retrieval. The German study's 24% → 87% result *(reported via Lexifina, not independently checked)* is the pitch.

---

**Unverified items:**

- ELI coverage of Series II acts.
- Incumbent pricing and APIs.
- Exact article and paragraph numbers in Lei 74/98 art. 6.º.
- The OE2025 *efeitos* articles. Only the AT circular was checked.
- Details of the DR open-data endpoints.

**Sources:**

- [Lexifina, "Git for the US Code"](https://lexifina.com/blog/git-for-the-us-code)
- [N-Lex, Portugal national database](https://n-lex.europa.eu/n-lex/info/info-po/index)
- [AT Ofício-circulado 20282/2025](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Oficio_circulado_20282_2025.pdf)
- [Lei 74/98 on DR](https://diariodarepublica.pt/dr/detalhe/lei/74-1998-234316)
- [Lei 42/2007](https://vlex.pt/vid/lei-33504045)
- [e-Justice, publication of official announcements in Portugal](https://e-justice.europa.eu/topics/legislation-and-case-law/publication-official-announcements/pt_pt)
