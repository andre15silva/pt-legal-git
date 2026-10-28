# Related work

*Survey run on 28 October 2026 by a research agent and spot-checked: the key repositories (sejm2git, us-congress-pipeline, akn-pt, timimata/lex, parlamentodb, LawCodex/pt) exist. The decisions this survey changed are summarised in [PLAN.md](PLAN.md#2-why-now-and-why-us). Note: this survey counts 109,411 diplomas in legalize-pt; legalize.dev's own Portugal page says 171,915 acts. The difference is probably acts against diplomas in force; not checked.*

Survey date: 28 October 2026. Labels: **[V]** = VERIFIED (I fetched the page, cloned the repo or read its README/commits today). **[U]** = UNVERIFIED (from a search snippet or from memory). Repo "last activity" dates come from the date of the newest commit, read with `git clone --depth 1`.

## 1. The landscape and the gap

- **"Law as git" is now crowded.** Since March 2026 there has been a wave of Markdown+git mirrors. Legalize (31–32 countries, Portugal included), LawCodex (~199 country repos, created 11–13 Oct 2026), legalize-kr, WetGit (NL), swiss-law, houritsu (JP), nz-acts, lex-git-lu (LU), us-congress-code (US) [V]. Most of them copy the official consolidation and commit one snapshot per version. They do not apply amendments themselves.
- **Portugal already has at least five mirrors of the DRE consolidation.** legalize-pt (109,411 diplomas, daily commits, MCP and API through legalize.dev), LawCodex/pt, LawAgents/pt with a Claude Code plugin, Ansvar portuguese-law-mcp, and the lauyer CLI [V]. Redação cannot win on "PT law in Markdown with git history". That part is a commodity.
- **The bill-as-branch idea has been built before, outside Portugal.** junxit/us-congress-pipeline keeps every US bill as a branch, with roll-call votes as commit trailers. It carries out only 18.5% of amending instructions, and it says so [V]. balwierz/sejm2git (Poland) uses one branch per amending act, merges it on enactment, and puts votes in trailers. It replays amendments and checks them against the official *tekst jednolity* (99.0% mean recall over 35 statutes). It is a prototype, last commit 17 June 2026 [V]. houritsu (Japan) adds `Bill` and `Bill-Url` trailers that point to the Diet bill [V]. So the "pull request" metaphor is not new. What is still missing is a version for Portugal that is verified.
- **Verification is the differentiator.** Lexifina replayed US public laws against OLRC release points and matched 361 of 365 changes [V]. sejm2git publishes a fidelity dashboard with a regression gate [V]. The 2025–26 literature shows that LLM consolidation looks right but is often wrong: 93–99% similar, yet only 50.3% exact for single amendments and 20.5% for chains (Prior et al., NLLP 2025) [V]. No Portuguese project replays DR amending acts and checks the result against the DRE consolidation.
- **Dates are handled badly almost everywhere.** legalize-pt dates commits by DR publication date. Its example revocation commit is dated 27 Oct, but the revocation takes effect on 28 Oct. The same commit says "Affected articles: N/A" [V]. us-congress-code also warns that commit dates are publication dates [V]. Only houritsu (commit date = enforcement date, plus an `upcoming` branch for promulgated but not yet in force) [V] and lex-git-lu (back-dated `valid_from`) [V] model the effect date properly. legislation.gov.uk is the reference for prospective and unapplied effects [V].
- **Linking law to parliament in Portugal is unsolved.** Vote data now exists as an API: fsmunoz/parlamentodb powers api.votoaberto.org [V]. Nobody joins Assembleia da República initiatives and votes to the resulting DR text at article level. Demo.cratica's domain now redirects to an unrelated site [V]. Hemiciclo.pt returned 503 today [V].
- **There is a new Portuguese standards anchor.** dapl-sggov/akn-pt is a draft national Akoma Ntoso profile (v0.1.0, EUPL-1.2), with an ELI-PT URI profile based on data.dre.pt. It presents itself as led by DAPL/SGGOV (Secretaria-Geral do Governo). Its own README says nothing is final "até validação institucional formal" [V]. Redação should align its identifiers and export with it.

## 2. Comparison table (most relevant projects)

| Project | Ctry | Technique | Granularity | Dates modelled | Parliament link | Status (last activity) | Licence | Copy / avoid |
|---|---|---|---|---|---|---|---|---|
| Lexifina "Git for the US Code" | US | Replays public laws on OLRC release points; proprietary | Phrase (colour by enacting Act) | Enactment, effective-date notes, amendment dates | Links to the law text | Blog post 28 Oct 2026 [V] | Commercial | Copy: replay plus match-rate report, "left out rather than guessed". Avoid: closed data |
| legalize-pt (Legalize) | PT | Snapshot of DRE consolidation into git; ELI file names | Diploma file; article versions taken from DRE | Commit = publication date [V] | None | Daily, 2026-10-27 [V] | Pipeline MIT; data under DL 83/2016 | Copy: trailers (Norm, Disposition, Source). Avoid: no effect dates, "Affected articles: N/A" |
| junxit/us-congress-pipeline | US | ETL to many git repos; bills as branches | Section; bill | Release point, bill version | Sponsors, committees, roll-call votes as trailers and files | Daily, 2026-10-28 [V] | Public domain text | Copy: GAPS.md, STATUS.md "date must move", honest coverage numbers |
| balwierz/sejm2git | PL | Parses nowelizacje, applies them, git branch per amending act, merge on enactment | Article/paragraph | Enactment (merge commit) | Votes as trailers (Sejm API) | Prototype, 2026-06-17 [V] | n/a | Copy: fidelity dashboard as CI gate. Closest design to Redação |
| houritsu | JP | e-Gov API v2 revisions to git | Law file | Commit = enforcement date; `upcoming` branch | `Bill`, `Bill-Url` trailers | 2026-10-24 [V] | n/a | Copy: `upcoming` branch, undetermined dates, explicit blame caveats |
| lex-git-lu + lex-articles | LU | Per-article records with validity intervals and hashes; git as a generated "lens" | Article | `valid_from` (applicability) | None | 2026-08-06 [V] | CC-BY-4.0 | Copy: provenance in hashed records, not in git metadata |
| buzer.de | DE | Private DB; synopsis per change | Paragraph; each change tied to amending law | In-force date; future changes listed | Links to the amending article and its *Begründung* | Live [V] | Proprietary, free | Copy: a.F./n.F. synopsis per section, plus "upcoming changes" |
| legislation.gov.uk | UK | Editorial consolidation, CLML XML, "effects" lists | Provision | Point-in-time, prospective, unapplied effects | Bills are on a separate site | Live [V] | OGL v3 | Copy: an explicit "up to date as of" banner and unapplied effects shown inline |
| BOE legislación consolidada API | ES | Official API with per-block versions | Block (article etc.) | Each version carries the modifying norm and its publication date | None | Live [V] | Open data | Copy: block-level version plus modifying-norm ID as the minimal attribution unit |
| PGDL (pgdlisboa.pt) | PT | Hand-curated DB | Article, with "versões anteriores" | Version by amending diploma | None | Live [V] | Proprietary, free | Use as a second oracle for article histories |
| DRE legislação consolidada | PT | Official consolidation, per-article "Alterado pelo/a …" | Article | Version dates; ELI `/cons/AAAAMMDD` | None | Live [V] | Open (DL 83/2016) | Oracle for verification. Avoid treating it as legally binding (it is not) |
| La Fabrique de la Loi | FR | Parser of bill texts through each reading; step diffs | Article of the bill | Legislative steps | Core feature | Parser last commit 2022-03-29; site 503 today [V] | AGPL [U] | Copy: article-level journey of a bill. Avoid: dependence on one fragile scraper |
| US House Comparative Print Suite | US | USLM XML plus a grammar that executes amendatory text | Section | Current law vs proposed | Bill to bill, bill to law | In production since Oct 2022 [U] | Internal House tool | Copy: three diff types (bill vs bill, law vs law-as-amended, bill vs bill-as-amended) |
| Akoma Ntoso / AKN-PT | Intl / PT | XML standard; FRBR Work/Expression; active and passive modifications | Any | Lifecycle events, in-force | `<workflow>`, legislative footprint | AKN-PT 2026-07-28 [V] | EUPL-1.2 (AKN-PT) | Copy: identifiers and export format. Avoid: making XML the internal model |
| parlamentodb / api.votoaberto.org | PT | ETL of AR open data, DuckDB on Parquet, REST | Initiative, vote | Vote dates | Is the parliament side | 2026-07-08 [V] | See repo | Use as the votes source, or reuse its ETL |
| Laws.Africa Indigo | ZA + | AKN editor plus point-in-time expressions | Provision | Expression dates, commencements | Limited | 2026-10-06 [V] | LGPL [U] | Copy: commencement modelling |
| DC Code (DCCouncil/law-xml) | US-DC | The official code lives in git; HTML is built from it | Section | Codification cycles | Council acts | 2026-10-27 [V] | Public domain [U] | Proof that git can be the official source |

## 3. Other projects by region

### United States
- **nickvido/us-code**: 13 commits, one per OLRC release point, 2013–2025. 372 stars. Last commit 2026-04-02 [V]. junxit's README says the March–April 2026 US repos "went silent within weeks" [V].
- **publicdocs/uscode** (last commit 2018) and **unitedstates/uscode** (2014) are stale [V]. **divegeek/uscode** (2009) is archived [U].
- **junxit/us-congress-code** has 383 release points as tags and per-law attribution from Table III. It warns that the attribution "records present-day classification", not what a commit changed [V]. **us-congress-comps** snapshots Statute Compilations daily, because govinfo overwrites them in place [V].
- **unitedstates/congress** (bill and vote scrapers) last commit 2025-10-05. **govtrack.us-web** last commit 2026-07-24. **usgpo/uslm** (USLM schema) last commit 2026-10-14 [V].
- The **Comparative Print Project** was built by Xcential under a 2018 contract. It uses NLP over amendatory language plus machine-readable citations [V] (Data Foundation blog, 9 Dec 2020).
- **travis-millet/us-laws**: a concept repo where amendments are merged PRs and bills are open PRs (created May 2026) [V]. It is the same metaphor as Redação, with no data pipeline.

### Germany, Austria, Switzerland
- **bundestag/gesetze**: last commit 2022-03-26, stale. **gesetze-tools**: 2026-05-04 [V].
- **legalize-de** and **legalize-at** are active [V].
- **NeuRIS** (rechtsinformationen.bund.de, DigitalService) went into a test phase in April 2025 with an open API and LegalDocML.de XML [U]. A Bundestag answer criticised gesetze-im-internet.de because it has no old versions [U]. Watch NeuRIS as the German model for an official API.
- **DIP** (Bundestag documentation system): API with Vorgänge, Vorgangspositionen, Drucksachen and Plenarprotokolle. Needs an API key [U].
- **benjamin-arfa/swiss-law**: Fedlex SPARQL plus cantonal sources, 59,600+ commits with the author date set to the version date, updated weekly. Last commit 2026-10-26 [V]. **droid-f/fedlex** commits Fedlex metadata as JSON [U].

### France, Belgium, Luxembourg, Netherlands, Italy, Spain
- **Archéo Lex**: last commit 2019-03-10, dormant [V]. **Legilibre/legi.py** (the LEGI database loader) is still maintained, last commit 2026-09-15 [V]. **steeve/france.code-civil**: 2015, stale [V].
- **Temporal Misgrounding in Legal RAG** (French tax code, Aug 2026): static RAG retrieved the applicable version 0% of the time; a multi-version retriever reached 98.3% [V].
- **WetGit/rijk** (Codeberg): 40,566 regulations, 141,680 commits, YAML front matter with `datum_inwerkingtreding`. Texts CC0, tooling MIT. Last commit 2026-04-25 [V].
- **Normattiva**: "multivigenza" view. An open data portal (dati.normattiva.it) was approved in June 2025, with AKN as the priority format. The CC BY / NC licence terms are inconsistent across documents [U].
- **BOE**: per-block version history, each version tagged with the modifying norm [V]. This is why legalize-es (1,964 stars) [V] has such clean history.

### Nordics, Baltics, Poland
- **lagen.nu / ferenda** (Staffan Malmgren): private and non-profit. Explains that SFS publishes only base and change statutes, not consolidations [V]. ferenda last commit 2026-10-21 [V].
- **Lovdata**, **Finlex** and **Riigi Teataja** all keep official version histories (redactions with validity periods) [U]. legalize-no, legalize-fi and legalize-ee exist [V].
- **sejm2git**: see the table.

### Asia-Pacific
- **legalize-kr**: 6,907 laws and ~81,600 amendment commits (Apr 2026). Uses law.go.kr open data. Last commit 2026-10-27 [V]. One analysis warns about force-push risk and about commit dates being judgment dates in the case-law repo [U].
- **Korea law.go.kr** has an official 신구법 (old vs new) comparison API, with history per article [U]. A government API that returns article-level before/after text is the model to point to.
- **Japan e-Gov 法令API v2** (released 19 March 2025): point-in-time retrieval, with versions called "revisions" [U]. **houritsu** is built on it [V].
- **Taiwan**: **openfunltd/law-diff** compares proposals against current law (提案法律對照表), using the Legislative Yuan API at ly.govapi.tw. Last commit 2025-03-25 [V]. **ronnywang/twlaw** 2023 [V]. **g0v/laweasyread** 2013, stale [V].
- **New Zealand**: **tonyandrewmeyer/legidiff** builds nz-acts (28,209 commits, one file per section, one sentence per line) from PCO XML. Its RELATED-WORK.md also lists nz-statute-book/Whiplash, which attributes commits to the government of the day, and Br3nda/legislation (2010) [V for the README; U for the projects it lists]. The PCO has an API at api.legislation.govt.nz (needs a key) [V via README].
- **Australia** (Federal Register of Legislation compilations), **Canada** (Justice Laws point-in-time) and **Hong Kong** (eLegislation point-in-time): sites are up [V]. Their features are [U].

### Latin America
- **Chile**: legalize-cl is active [V]. A community LeyChile MCP offers an "article timeline" tool [U]. BCN *Historia de la Ley* compiles the motion, committee reports, debates and votes for each law [V for one example page]. This is the closest official analogue to Redação's link from law to parliament.
- **Brazil**: LawCodex/br [V]. andrader/brazil-laws, a POC for constitutional amendments built from normas.leg.br (2026-04) [V]. br-eli-mcp [U]. LexML is the national XML standard [U].
- **parlamento.ai** (Chile): AI transcription and analysis of debates, with no text diffs [U].
- legalize-ar and legalize-co are active [V].

### European Union
- **legalize-eu** is active [V]. **LEOS** (Commission drafting tool, AKN4EU, EUPL): code.europa.eu commit on 2026-10-28 [V].
- **Parltrack** returned 502 today [V]. **EPFL INDY "LawGit"** is a student project proposal built on the "War of Words" dataset of EP amendments (Kristof et al., WWW 2020) [V]. There is also an "EUR-Lex Legislation Diff" Chrome extension [U].

### Commercial
- **Lexifina**: see the table. Its products include a developer API and Claude/ChatGPT connectors [V].
- **Westlaw UK** has historical and prospective versions back to 1991, plus "Legislation Compare". **Lexis+ UK** has a version timeline back to July 1998 [U, library guides]. **TimeBase** (Thomson Reuters) sells point-in-time consolidations for Australia [U].
- **Plural** says its AI "follows how a bill changes from one version to the next". **Quorum** and **FiscalNote** advertise AI summaries, not text diffs [U, vendor pages]. **Vaquill** sells a US statute API with amendment history [U]. None of them attributes changes at phrase level.

## 4. Portugal

Official sources:
- **DRE / data.dre.pt**: ELI pillar 1 since Dec 2016 (acts since 1991). Consolidated versions are dated in the URI (`/p/cons/20190628/`) [U]. The electronic edition has been authentic since 1 July 2006 [U]. Each consolidated article lists the acts that amended it (*Alterado pelo/a …*) [V via the LawCodex README].
- **DRE "Lia"**: a generative AI assistant over consolidated law, launched February 2025 [U]. About 1,200 plain-language summaries existed by mid-2023, with no legal value [U].
- **PGDL**: per-article "Consultar versões anteriores deste artigo" and "Contém as alterações dos seguintes diplomas" [V]. Hand-curated, mostly codes.
- **Parlamento open data**: initiatives, votes and deputies, per legislature [V via parlamentodb].

Community and startups (all [V] unless marked):
- **legalize-pt**: see the table. The README promises "o texto de cada artigo em cada momento da sua vigência" where DRE consolidates. Pre-1960 acts are out of scope. Azores Jornal Oficial is excluded.
- **LawCodex/pt**: 4,840 in-force diplomas. Only the current version, so no history. Records DRE consolidation state (IN_PROGRESS, VIGENCIA_CONDICIONADA) in front matter. Retrieved 2026-10-11.
- **LawAgents/pt** plus the **legislacao-pt-plugin** for Claude Code: 4,987 diplomas split into 11,245 files. Weekly updates (last 2026-10-25).
- **Ansvar-Systems/portuguese-law-mcp**: 1,130 statutes, hosted gateway, Apache-2.0 [U].
- **nikuscs/lauyer** (Rust CLI over DGSI and DR, 2026-09-20). **rafaelob/iajus-plugin-public-pt** (remote MCP). **a2u/portuguese-laws-md-tools**.
- **timimata/lex**: an open PT-PT legal QA benchmark with dated questions. It holds every Código do Trabalho article version since 2009 and NRAU/lease articles since 2006, "checked against the Diário da República's own history". The README says Lia, the Guia Prático, TogaAI and LeiGPT publish no accuracy figures. This is the best ready-made evaluation set for Redação's point-in-time claims.
- **dr-watch** and **dr-resumido**: daily LLM digests of the DR (2026).
- **gammadev-y/agora_crawl**: crawls all historical DR laws into Supabase (2025-10).
- **dapl-sggov/akn-pt**: see section 1. Its LESSONS file says "FRBR resolve elegantemente consolidação" and names *republicação técnica* and *artigos X.º-A* as the recurring pain points of Portuguese drafting.
- **Votes and parliament**: parlamentodb/api.votoaberto.org (with the ParlaTUI client); fsmunoz/pt-act-parlamentar (2020 notebooks); the PTPARL-V dataset (debates plus votes, 736 initiatives, 2005–2021) [U]; marcelogdomingues/parlamento-pt SDKs (Aug 2026); meuParlamento.pt (retired) [U]; transparenciahackday/dar-doc (2013).
- **Legal-AI startups**: Mowly, NeuralShift, TogaAI, JurisCloud, JurisVis (launched July 2026), Codex Digital, LeiGPT [U, vendor pages]. None claims point-in-time history or links to parliament. "Lexit" and "Jurisdata" turned up nothing.
- **Academic**: student semantic-web projects on the DR (Universidade do Minho RPCW course repos, 2024 and 2026) [V]. I found no published Portuguese work on automatic consolidation.

## 5. Academic literature

Amendment application and consolidation:
- Prior, Hof, Wais, Grabmair. "Risks and Limits of Automatic Consolidation of Statutes." NLLP 2025, pp. 396–407. 908 German amendment pairs. 50.3% exact for one step, 20.51% for chains. https://aclanthology.org/2025.nllp-1.29 [V]
- Mador-Haim, Hershowitz. "Executing United States Bills into Law: A Working Application in the United States House." JURIX 2023, FAIA 379, pp. 237–246. A grammar for amendatory language, used for Comparative Prints. https://ebooks.iospress.nl/doi/10.3233/FAIA230969 [V]
- Inagaki, Ogawa, Toyama. "Formalization of Amendment Sentences for Automated Generation of Amended Statutes." 2005, Tokai-section joint conference (Japan) [U, bibliographic record only].
- Balke, Vos, Padget, Satoh. Automatic revision of secondary legislation. ICAIL 2013, pp. 202–206 [U].
- Palmirani. "Legislative Change Management with Akoma Ntoso." In *Legislative XML for the Semantic Web*, Springer 2011. The reference for active and passive modifications. https://cris.unibo.it/handle/11585/113664 [U]
- de Martim. "Modeling the Diachronic Evolution of Legal Norms" (component-level versioning on LRMoo). arXiv:2506.07853, 2025, revised June 2026 [V]. Same author: "An Ontology-Driven Graph RAG for Legal Norms" (SAT-Graph RAG, Brazilian Constitution). arXiv:2505.00039 [V]

Temporal legal QA (2025–2026):
- Prior, Schultz, Grabmair. "Asking For An Old Friend: Diagnosing and Mitigating Temporal Failure Modes in LLM-based Statutory QA." arXiv:2605.23497. 312 German QA pairs. 24% correct without retrieval, 87% with it [V via Lexifina and arXiv listing].
- Fan et al. "Can LLMs Time Travel? … Legal Agentic Search through RL" (LegalSearch-R1). arXiv:2605.25920 [V].
- Cymbler, Guez, Fabre. "Temporal Misgrounding in Legal RAG: A Versioned-Corpus Benchmark for French Tax Law." arXiv:2608.09393 [V].
- Huang et al. "When Do LLMs Apply the Wrong Law?" arXiv:2608.14610. Newest-law bias: >70% on new-law cases, <25% on old-law cases [V].
- Li et al. "LexKairos: Benchmarking Legal Temporal Capabilities in LLMs." arXiv:2608.09106 [V].
- Adjacent: Kristof et al. "War of Words" (WWW 2020) on EP amendments [V via EPFL page]. LLaMandement (French legislative proposals, arXiv:2401.16182) [U].

## 6. Lessons for Redação

Copy:
1. **Publish a verification score, and make it a CI gate.** Replay DR amending acts and diff the result against the DRE consolidation (and PGDL where it exists). Report exact-match rates the way Lexifina (361/365) and sejm2git (`--fail-under 97`) do. List every mismatch with its cause.
2. **Prefer "left out, with a reason" to a guess.** Do this for undetermined commencement dates, regulatory-condition dates and unparseable instructions. Keep a GAPS.md and a STATUS.md whose date has to keep moving.
3. **Keep three dates on each change**: publication, entry into force and effects (*produção de efeitos*, including retroactive effects). Keep an `upcoming` ref for acts published but not yet in force, as houritsu does. Do not let the git commit date stand in for legal time. lex-git-lu keeps provenance in hashed records and treats git as a generated view; do the same.
4. **Attribute at block level first, then phrase level.** The BOE and DRE "Alterado pelo/a" model (block plus modifying act) is the minimum. Phrase-level blame only means something if history starts at the original act. houritsu warns that `git blame` "dates the coverage, not the wording".
5. **Use one sentence or number per line, and one file per article** (legidiff, sejm2git). That gives clean diffs for "onde se lê … passa a ler-se".
6. **Ground the parliament side on existing work.** Take votes from api.votoaberto.org or the AR open data. Model initiatives as branches, with the enacted DR act as the merge (sejm2git, junxit). Say plainly when a bill's text cannot be executed: junxit reaches only 18.5%, and Portuguese initiatives often amend by restating whole articles, which is easier.
7. **Align with AKN-PT and ELI-PT** (data.dre.pt URIs) for identifiers and export. Engage with DAPL/SGGOV early.
8. **Evaluate with Lex** (timimata). It already has dated PT questions and article versions for labour and tenancy law.

Avoid:
1. **Do not rebuild a DRE mirror.** legalize-pt, LawCodex, LawAgents and Ansvar cover that. Interoperate with them, or cite legalize-pt as an upstream.
2. **Do not use an LLM as the consolidation engine.** Prior et al. show that near-miss text is the norm. Use LLMs only to propose a parse, then verify it deterministically.
3. **Do not dress git metadata up as legal fact.** Commit dates before 1970 fail (houritsu and lex-git-lu work around this), force-pushes rewrite history, and Table III-style attribution misleads (us-congress-code).
4. **Do not let maintenance depend on one person's scraper.** Archéo Lex, bundestag/gesetze, La Fabrique de la Loi and Demo.cratica all went quiet. Plan for the project to outlive its authors.

**Positioning statement that survives this survey:** "The first project to replay Portuguese amending acts against the official consolidation and publish its match rate. It separates publication, entry-into-force and effect dates, and links each change to its parliamentary initiative and votes." Leave out "first git for Portuguese law".

## 7. Sources

- Lexifina, "Git for the US Code": https://lexifina.com/blog/git-for-the-us-code
- Legalize: https://legalize.dev ; https://github.com/legalize-dev/legalize ; https://github.com/legalize-dev/legalize-pt ; https://github.com/legalize-dev/mcp
- LawCodex: https://github.com/LawCodex/pt ; https://github.com/LawCodex/br
- LawAgents: https://github.com/LawAgents/pt ; https://github.com/LawAgents/legislacao-pt-plugin
- junxit: https://github.com/junxit/us-congress-pipeline ; https://github.com/junxit/us-congress-code ; https://github.com/junxit/us-congress-comps
- sejm2git: https://github.com/balwierz/sejm2git
- houritsu: https://github.com/Kohei-Wada/houritsu
- lex-git-lu: https://github.com/SFHAJJI/lex-git-lu
- legidiff / nz-acts: https://github.com/tonyandrewmeyer/legidiff ; https://github.com/tonyandrewmeyer/nz-acts
- swiss-law: https://github.com/benjamin-arfa/swiss-law
- WetGit: https://codeberg.org/wetgit/rijk
- legalize-kr: https://github.com/legalize-kr/legalize-kr ; https://wikidocs.net/blog/@jaehong/11283/
- nickvido/us-code: https://github.com/nickvido/us-code ; publicdocs/uscode: https://github.com/publicdocs/uscode
- travis-millet/us-laws: https://github.com/travis-millet/us-laws
- brazil-laws: https://github.com/andrader/brazil-laws
- bundestag/gesetze: https://github.com/bundestag/gesetze ; buzer.de: https://www.buzer.de/h.htm
- NeuRIS: https://digitalservice.bund.de/en/blog/neuris-legal-information-service-published-in-the-test-phase
- Archéo Lex: https://github.com/Legilibre/Archeo-Lex ; legi.py: https://github.com/Legilibre/legi.py
- La Fabrique de la Loi parser: https://github.com/regardscitoyens/the-law-factory-parser
- DC Code: https://github.com/DCCouncil/law-xml
- Indigo: https://github.com/laws-africa/indigo
- LEOS: https://code.europa.eu/leos/core ; https://interoperable-europe.ec.europa.eu/collection/justice-law-and-security/solution/leos-open-source-software-editing-legislation
- Comparative Print: https://datafoundation.org/news/blogs/335/335-Version-Control-for-Law-Tracking-Changes-in-the-US-Congress
- legislation.gov.uk: https://www.legislation.gov.uk ; Lawmaker: https://www.legislation.gov.uk/projects/drafting-tool
- BOE API: https://www.boe.es/datosabiertos/documentos/APIconsolidada.pdf ; https://www.boe.es/datosabiertos/faq/consolidada.php
- Normattiva: https://www.normattiva.it/staticPage/progettoObiettiviRaggiunti ; https://www.camera.it/temiap/2026/05/19/OCD177-8977.pdf
- e-Gov 法令API: https://laws.e-gov.go.jp/docs/law-data-basic/da91fe9-law-revisions/
- Korea 신구법 API: https://www.data.go.kr/data/15057041/openapi.do
- Taiwan law-diff: https://openfunltd.github.io/law-diff/ ; https://github.com/openfunltd/law-diff
- lagen.nu: https://lagen.nu/om/english ; https://github.com/staffanm/ferenda
- BCN Historia de la Ley: https://www.bcn.cl/historiadelaley/nc/historia-de-la-ley/5302
- EPFL LawGit: https://indy.epfl.ch/project/19
- AKN-PT: https://github.com/dapl-sggov/akn-pt ; https://akn-pt.pages.dev
- parlamentodb: https://github.com/fsmunoz/parlamentodb ; https://api.votoaberto.org
- PGDL: https://www.pgdlisboa.pt
- DRE: https://diariodarepublica.pt ; https://data.dre.pt ; Lia: https://observador.pt/2025/02/11/inteligencia-artificial-vai-facilitar-consulta-de-leis-em-diario-da-republica/
- Lex benchmark: https://github.com/timimata/lex
- lauyer: https://github.com/nikuscs/lauyer ; Ansvar: https://glama.ai/mcp/servers/mkpwpygqkb
- Hemiciclo (2017 press): https://rr.pt/noticia/politica/2017/09/04/quer-saber-como-cada-deputado-votou-cada-lei-va-ao-hemiciclo/92530/
- PT legal-AI startups: https://24noticias.sapo.pt/atualidade/artigos/5-solucoes-de-ia-que-prometem-dar-superpoderes-aos-advogados ; https://eco.sapo.pt/2026/07/03/lancamento-do-jurisvis-o-assistente-de-inteligencia-artificial-concebido-de-raiz-para-o-direito-portugues/
- Papers: https://aclanthology.org/2025.nllp-1.29 ; https://arxiv.org/abs/2605.23497 ; https://arxiv.org/abs/2605.25920 ; https://arxiv.org/abs/2608.09393 ; https://arxiv.org/abs/2608.14610 ; https://arxiv.org/abs/2608.09106 ; https://arxiv.org/abs/2506.07853 ; https://arxiv.org/abs/2505.00039 ; https://ebooks.iospress.nl/doi/10.3233/FAIA230969 ; https://cris.unibo.it/handle/11585/113664
- Westlaw/Lexis UK version coverage: https://guides.lib.strath.ac.uk/westlaw/legislation ; https://libguides.ials.sas.ac.uk/databases/uk
- Plural (bill version tracking claims): https://pluralpolicy.com/blog/resource-types/product/
