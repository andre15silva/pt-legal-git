# Stakeholder panel: civic & public-interest users of "Git para a Lei"

Panel: **J** = political/data journalist (Público/Expresso/Polígrafo desk); **N** = transparency NGO maintainer (TI-PT / Hemiciclo / Central de Dados lineage); **D** = open-source developer.
Tags: [verified] = checked against a source this session; [unverified] = from memory or inference.

> **Headline finding:** **legalize.dev already lists Portugal**: "Portugal DRE", 171,915 laws, 130,836 reforms, coverage from 1976, repo `legalize-dev/legalize-pt` [verified on legalize.dev/pt; repo content and quality not inspected]. A bare "DR as git commits" mirror is therefore **not a differentiator**. What sets us apart is the **parliament layer** (initiative → amendments → votes → published text), **phrase-level blame with political attribution**, and **journalist-grade provenance**. We should cooperate with legalize-pt, by reusing or cross-linking its history, rather than compete with it.

## 1. Ranked jobs-to-be-done

1. **"Who wrote this sentence, and who voted for it?"** (J, N). Click a phrase in Código do Trabalho art. 112.º. The page shows the Lei that introduced it, the DR date, the government at the time, the initiative (PPL/PJL) and the generalidade/especialidade/final global vote by party. *This is the killer job. Nobody in PT does it today* [unverified, though Hemiciclo and parlamento.pt show votes but not text lineage].
2. **"How many times was X changed, and by whom?"** (J). Examples: the NRAU/Lei das Rendas (Lei 6/2006) since 2012, broken down by government (Passos Coelho / Costa / Montenegro), legislatura and instrument (Lei vs Decreto-Lei vs autorização legislativa). The output is a chart plus a citable number.
3. **"Proposal vs final text diff"** (J, N). Compare the PPL as submitted, the committee replacement text (texto de substituição), the final text and the DR publication. This is where the influence of lobbies and parties becomes visible. Attribute each change to the proposta de alteração (amendment) that caused it, and to the party that tabled it.
4. **"Alert me when Código do IRS / art. X changes"** (N, D, plus tax advisers as paying users). Alerts by article, by code or by keyword, with the diff in the email.
5. **"What was the law on date D?"** (J fact-checks, D). Point-in-time text, with the vigência (date in force) shown separately from the publication date.
6. **"Fact-check a politician's claim"** (Polígrafo), e.g. "we never touched the IMI" → one link that settles it.
7. **Research and bulk analysis** (D, academics): churn, legislative inflation, how often Decreto-Lei is used compared with Lei.

## 2. Features (ordered by priority)

- **Permalinks**, built so that they never break: `/lei/{eli}/art/{n}@{date}`, `/diff/{eli}/{from}..{to}`, `/blame/{eli}/art/{n}`. ELI URIs resolve on data.dre.pt for Series I acts since 1991 [verified, EUR-Lex/DR ELI page]. Use ELI as the canonical key wherever it exists.
- **Embeddable diff/blame cards** as iframes and OG images, so a tweet of a diff renders as a red/green image. This feature matters most for adoption by newsrooms.
- **Statistics:** churn per code (amendments/year, % of articles touched), amendments per legislatura and per government, median time from initiative submission to DR publication, PPL vs PJL success rate, share of the final text that originated in opposition amendments, and "most-amended articles" leaderboards.
- **RSS/Atom** feeds per code, article and party; **webhooks**; a daily email digest.
- **Public REST API**, read-only, with no key needed below a generous limit, plus an OpenAPI spec and a Python/JS SDK. Add an MCP server, since AI agents will be heavy consumers and Ansvar already ships PT/DE law MCP servers [verified, glama/socket listings].
- **Bulk download as a real git repo on Codeberg and GitHub**. Make it a mirror, not the source of truth. Also publish nightly Parquet/JSONL dumps and a SQLite file for journalists (Datasette).
- **Search** across all historical versions, e.g. "every law that ever contained 'alojamento local'".

## 3. Lessons from analogous projects

| Project | What worked | What hurt it |
|---|---|---|
| **bundestag/gesetze** (DE, 2012) | Markdown diffs are readable. It drew huge attention (about 1.9k stars [verified]). | It snapshotted *current* texts, and backfilling history stayed a "distant goal" [verified, netzpolitik 2012]. The README still says "Help needed" [verified]. It was a volunteer cron job with no editorial owner, and by my reading it stalled [unverified]. |
| **Archéo Lex** (FR, 2014) | Built on the official LEGI dump, so history was correct from day one. | Built as a 5-day prototype, it still has no tests, and its output has spurious diffs [verified, README]. **Git rejects pre-1970 dates** [verified, README], and the Código Civil (1966) is affected. It never became a product. |
| **La Fabrique de la Loi** (FR) | It is the closest model to our "PR" layer: amendments per article and per group across 800+ bills [verified]. Academic partnership with Sciences Po. | Volunteer NGO budget of about €4–5k/yr [verified, Regards Citoyens 2015/16]. The site returned 503 when we checked [verified today; cause unknown]. Research grants funded a launch, not upkeep. |
| **DC Code on GitHub** | The *authoritative* source is the git repo. A citizen fixed the law via a pull request that the Council merged [verified]. | Only works because the publisher owns it. Tauberer: the change was not substantive, so don't expect it to become the norm [verified]. |
| **legalize-es / legalize.dev** (2026) | Commit date is the publication date, with a separate `Effective-Date` per phase and explicit flags for unknown effective dates [verified]. Got press (Xataka, Gigazine). About 2k stars. | Donation-funded (Buy Me a Coffee) [verified]. Its sustainability is unproven. |
| **US Code / Lexifina** | Rebuilt history by replaying amendments and checking against official release points: 361/365 exact matches. Unresolvable cases are excluded, not guessed [verified]. | No handling yet for retroactive changes. LLM regeneration was unreliable, with roughly 20% of amendment chains matching exactly [verified]. |
| **Akoma Ntoso / Laws.Africa** | Using a standard (OASIS LegalDocML) let Laws.Africa's Indigo platform serve many countries [unverified detail]. | The cost of markup is high, so adopt it as an *export format*, not as the internal model. |

**Copy:** consume official dumps instead of scraping HTML, validate every reconstructed version against DR's own consolidated text, store publication and effective dates separately, refuse to guess. **Avoid:** volunteer-only maintenance, a single maintainer, and a launch without a funded upkeep budget. Volunteer projects in PT have the same history: Demo.cratica (2011, AGPL) and Hemiciclo (2017, two amateurs) both went quiet [launch verified; current status unverified].

## 4. Neutrality, accuracy and corrections

- **A neutral framing is non-negotiable.** Show the facts (who tabled, who voted), never adjectives. No "worst government" rankings. Normalize every chart (per year in office, per legislatura length) and publish the methodology next to it. Attribute to the **government and legislatura** as recorded, and let users draw conclusions.
- **Disclaimer on every page:** "Não é texto oficial; faz fé o Diário da República", with a deep link to the DR original for each commit.
- **Confidence badge per commit and per blame span:** ✅ *verified* (our replay equals DR consolidated text), 🟡 *reconstructed* (replay, not cross-checked), 🔴 *manual/uncertain*. Same for the initiative↔law link: *official link* vs *heuristic match (score)*.
- **Provenance panel:** source URL, retrieval timestamp, parser version and content hash. Every number in a chart links to the query that produced it.
- **Corrections policy:** a public issue tracker plus a "reportar erro" button on every span, an SLA (72h to triage), a public **changelog of corrections**, and versioned datasets so that past citations stay reproducible. Treat DR **Declarações de Retificação** as first-class commits labelled `fix:`.
- **Licensing.** Official texts are excluded from copyright under CDADC art. 7.º [unverified; confirm with a lawyer], and legalize.dev cites DRE reuse conditions [verified]. Recommended split:
  - **CC0** for our structured text and metadata.
  - **CC-BY 4.0** for editorial annotations, so attribution travels with press use.
  - **AGPL-3.0** for the web app, to stop closed forks of the public service.
  - **MIT/Apache-2.0** for parsers and SDKs, to maximize reuse.
  - Parliament data reuse terms are [unverified]; check them before relicensing.

## 5. Sustainability and governance

- **Home it in an institution, not a person.** Options: a university (NOVA SBE Data Science Knowledge Center, the law faculties of FDUL/FDUNL, or ISCTE), or an NGO such as TI-PT, with a named editorial lead and two or more maintainers.
- **Blended funding:**
  - Gulbenkian / Fundação FFMS / EU (CERV, NGI) grants for the build.
  - A **paid tier** for professional alerts and API volume: law firms, tax advisers, compliance teams. That revenue covers upkeep.
  - Newsroom partnerships, where outlets co-fund in exchange for embeds and early access to data.
- **Seek an MoU with INCM** (publisher of the DR, and coordinator of ELI) and with the AR open-data team, for bulk access and a channel to report errors back to them. Do not seek endorsement, which would compromise our independence.
- **Advisory board** with balanced political-science, legal and journalism seats. Publish a transparency report every year.
- **Bus-factor rule:** the pipeline must run from a single `make rebuild`, with CI that diffs the output against DR each night.

## 6. Launch "wow" features (for press coverage)

1. **"Quem escreveu esta frase?"**: highlight any sentence of the Constituição or the Código do Trabalho and get the author law, government, and party vote. This is the demo for TV.
2. **Lei das Rendas / Alojamento Local / IRS Jovem timelines**: animated versions of each, released as a data story together with a newsroom partner on launch day.
3. **"O Código mais mexido"** leaderboard: the most-amended codes and articles, with a churn heatmap by government.
4. **Lobby diff**: the original PPL vs the final text for a high-profile law, with each surviving amendment colour-coded by party.
5. **"Que lei estava em vigor no dia em que nasceste?"**: a shareable personal card.
6. **One-line clone**: `git clone https://codeberg.org/gitparalei/codigo-civil`. Developers will post `git log --follow` screenshots, which is free press.

## Sources
- https://lexifina.com/blog/git-for-the-us-code
- https://legalize.dev/pt ; https://github.com/legalize-dev/legalize-es ; https://www.xataka.com/aplicaciones/alguien-ha-cogido-12-000-leyes-espanolas-ha-pasado-a-codigo-fuente-autentica-joya-para-buscar-legislacion
- https://github.com/bundestag/gesetze ; https://netzpolitik.org/2012/open-government-deutsche-bundesgesetze-und-verordnungen-jetzt-auch-als-git-repository/
- https://github.com/Legilibre/Archeo-Lex ; https://www.data.gouv.fr/reuses/archeo-lex-histoire-de-la-loi-francaise
- https://www.medialab.sciences-po.fr/en/productions/2018-06-le-numerique-au-service-de-levaluation-de-limpact-du-parlement-sur-la-loi ; https://regardscitoyens.org/documents/dossiers/PrixDemocratie/20160714_PrixD%C3%A9mocratie_Formulaire.odt
- https://route-fifty.com/management/2018/12/dc-code-meets-open-government-on-github/303406
- https://diariodarepublica.pt/dr/geral/ligacoes-interesse/identificador-europeu-legislacao-eli
- https://globalvoices.org/2011/05/20/portugal-uncovering-transparency-in-parliament/ ; https://rr.pt/noticia/politica/2017/09/04/quer-saber-como-cada-deputado-votou-cada-lei-va-ao-hemiciclo/92530/
- https://glama.ai/mcp/servers/mkpwpygqkb
