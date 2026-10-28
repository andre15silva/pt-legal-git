# Data sources

Probed live on 2026-10-28. Full reports: [Diário da República](research/sources/diario-da-republica.md) · [parlamento.pt](research/sources/parlamento.md). This page is the synthesis plus the measurements we made ourselves.

## Summary

| Source | What we use it for | Access | Structure | Verdict |
|---|---|---|---|---|
| **Diário da República (DR)**, diariodarepublica.pt | Acts (1.ª série), consolidated text with **per-article versions**, entry-into-force dates, amending acts, notes | No official API. The site's own JSON endpoints (OutSystems `screenservices`) work anonymously. Sitemaps; RSS for today only | Act text as flat HTML paragraphs; consolidated text per fragment, with versions | **Backbone** |
| **parlamento.pt open data** | Initiatives, process events, per-group votes, link to the published law | Per-legislature JSON/XML files, discovered by scraping catalogue pages | Structured metadata; texts only as DOCX/PDF | **Parliamentary layer** |
| **legalize-pt** (legalize.dev, MIT pipeline) | Bootstrap and cross-check: about 172k acts as Markdown, one commit per consolidated version | `git clone` | Markdown + YAML front matter, ELI-derived names | **Bootstrap, not truth** |
| **PGDL** (pgdlisboa.pt) | Cross-check: article versions and older whole versions | Static HTML | Per-article pages | Verification only |
| **Tribunal Constitucional, DGSI** | Rulings with força obrigatória geral; case-law links | HTML | Unstructured | Phase 4 |

## Diário da República

**The de-facto API.** `POST https://diariodarepublica.pt/dr/screenservices/dr/<Flow>/<Screen>/<Action>` with the public anonymous `X-CSRFToken` header that every browser sends, and a JSON body naming `moduleVersion` plus a per-action `apiVersion` hash. The hashes change on each deploy. The server then answers HTTP 200 with `hasApiVersionChanged: true` and empty data, so the client must check that flag and re-extract the hashes from the JS bundles. 314 endpoint/version pairs were extracted.

| Need | Endpoint (Flow/Screen/Action) | Notes |
|---|---|---|
| All acts of a day (1.ª série, with supplements) | `Home/WB_Serie1_List/DataActionGetDataAndApplicationSettings` | Works back to 1915 |
| One act: text, HTML, PDF URL, metadata, RDFa | `Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetAllConteudoDetalheData` | `{"Tipo":"lei","Key":"64-2025-944874408"}` |
| A consolidated diploma as of date D | `LegislacaoConsolidada/LegCons_Detalhe/DataActionGetData` | Each fragment carries its hierarchy path, text, `DataEntradaVigor`, `DataProducaoEfeitos`, `DataVersao`, change list and notes |
| Every amending act and the fragments it touched | `…/AlteracoesTimelineByDiplomaLegisId/DataActionGetConsolidacaoByDiplomaFrag` | Altera / Adita / Revoga / Retifica / Suspende, with dates: effectively a commit list |
| An article's previous versions with full text | `…/DiplomaByFragmentoVersaoId/ScreenDataSetGetVersoesByFragmentoId` | The original version comes from the as-of call |
| Every consolidated diploma | `files.diariodarepublica.pt/sitemap/legislacao-consolidada-sitemap-1.xml` | 5,834 diplomas |

**Coverage observed.** Código Civil: the 1966 original plus 102 amending acts. Constituição: all 7 revisions. Código do Trabalho: 28 amending acts. Act text exists from about 1960; the 1925–1950 samples were PDF-only. ELI metadata exists from about 1991, and only as RDFa inside the JSON (`data.dre.pt/eli/...` resolves for `/html` and `/pdf` only).

**Replay feasibility.** Applying Lei 13/2023's "nova redação" blocks (whole articles, with `[...]` for unchanged numbers) to the Código do Trabalho of 2023-04-02 with 5 simple rules reproduced **90 of 97 articles exactly**, and 3 more apart from final punctuation. Portuguese amending instructions are structure-addressed, which makes them far more replayable than the US Code's prose "strike and insert".

### What we fetched ourselves: CIRC art. 87.º (Taxas)

Fetched with the endpoints above on 2026-10-28. This is the running example in the design ([DESIGN.md](DESIGN.md)).

| In force (DR) | Act | What changed |
|---|---|---|
| 2014-01-21 | Declaração de Retificação n.º 18/2014 (published 2014-03-13) | Earliest version listed. A retification published in March with effect from January |
| 2016-03-31 | Lei n.º 7-A/2016 (OE 2016), art. 133.º | n.º 5: 21,5 % → 21 % |
| 2020-04-01 | Lei n.º 2/2020 (OE 2020), art. 335.º | n.º 2: SME bracket 15 000 → 25 000 € |
| 2023-01-01 | Lei n.º 24-D/2022 (OE 2023), art. 227.º | n.º 2: adds Small Mid Cap; bracket → 50 000 € |
| 2024-01-01 | Lei n.º 82/2023 (OE 2024), art. 237.º | n.º 3 amended; n.º 8 added (startups, 12,5 %) |
| 2025-01-01 | Lei n.º 45-A/2024 (OE 2025), art. 90.º | n.º 1 and n.º 5: 21 % → 20 %; n.º 2: 17 % → 16 % |
| 2025-11-12 | Lei n.º 64/2025, art. 2.º | n.º 1 and n.º 5: 20 % → 17 %; n.º 2: 16 % → 15 % |

Findings that shape the design:
- **Efficacy is not structured.** `DataProducaoEfeitos` is empty (1900-01-01) for this article. Lei 64/2025's transitional rule (19 % in 2026, 18 % in 2027) exists only as a free-text *Nota*. Our `eficacia_transitoria` effects must be parsed from the act.
- **Possible gap.** No version is listed between the 2014 retification and 2016. Our recollection is that the general rate was cut in 2015 (to verify). Verification by replay should flag gaps like this.
- **Snapshot dates follow publication, not entry into force.** Lei 9/2010's text appears in the as-of view from 2010-05-31, its publication date, although it entered into force on 2010-06-05. Compute vigência from the version records, not from the snapshot.
- **Editorial artefacts.** The DR changes "." to ";" when alíneas are added; revoked articles keep their old text, with the revocation visible only in the change list; one Código do Trabalho article is labelled "Artigo 502" with no "º".

### Rights

- DL 83/2016, art. 3.º guarantees universal, free access to DR content. Lei 68/2021 sets the open-data regime. The site footer still says "todos os direitos reservados", and there is no explicit open licence.
- Official texts are not protected by copyright under **CDADC art. 8.º, n.º 1**. Art. 7.º, which an earlier draft cited, is about news and speeches.
- **Caution:** CDADC art. 3.º, n.º 1, c) protects systematic or annotated *compilations*. The DR's and PGDL's consolidations may count as compilations. **Strategy:** publish our own reconstructions, made by replaying the original acts (unprotected official texts). Use the DR consolidation to *verify*, not to redistribute wholesale. Ask INCM for a written position before any bulk reuse.

## parlamento.pt

- **Catalogue:** <https://www.parlamento.pt/Cidadania/Paginas/DadosAbertos.aspx>. Datasets: Iniciativas, Diplomas Aprovados, Atividades, Agenda, Atividade dos Deputados, Composição de Órgãos, Informação Base, Registo Biográfico, Intervenções, Petições, Perguntas, Orçamento do Estado (with structured budget amendments), and DAR (from XI). Files are JSON and XML per legislatura, with XSDs.
- **Access:** download URLs carry encrypted per-render tokens (old ones keep working). There is no index or API, so discovery means scraping the folder pages. Use `utf-8-sig` (XML has a BOM).
- **Size and coverage:** 27,234 initiatives from the I legislatura (1976) to XVII; Iniciativas JSON about 885 MB in total. **Missing sessions:** III session 1, XIII session 1, XIV session 1. The website has them; Diplomas Aprovados is complete.
- **Reuse:** free, with attribution to "Assembleia da República". No named licence.

**Events and votes.** 144 phase codes, from Entrada to "Lei (Publicação DR)". Votes sit inside events: `resultado`, `unanime`, `ausencias`, plus an HTML `detalhe` string ("A Favor: <I>PSD</I>, … <BR>Contra: …<BR>Abstenção: …"). Split groups appear as "13-PS" plus named deputies. Constitutional Court review shows up only as event 430 or free text.

**The link to the law, measured on the XVII legislatura (2,354 initiatives; 136 published as Lei):**

| Method | Linked | Precision (vs the exact link) |
|---|---|---|
| Exact: event 580 `TextosAprovados` → Diplomas Aprovados `Id` → `Tipo` + `Numero` + `Numero2` (letter suffix) + `AnoCivil` + DR `pubdt` → ELI | **136 / 136** (the agent measured 4,977 / 5,008 = 99.4 % across all legislaturas) | n/a |
| Fallback: same publication date + title similarity against a DR mirror | 120 confident, 15 ambiguous, 1 unlinked | 119 / 120 confident matches correct |

Both are implemented in [`tools/link_dr.py`](../tools/link_dr.py). The vote parser in [`tools/parlamento.py`](../tools/parlamento.py) parses 2,281 of 2,285 votes in the XVII legislatura.

- **Many-to-one:** 789 of 4,188 laws come from several initiatives (texto final da comissão).
- **Texts:** none are article-structured. Initiative texts, propostas de alteração, textos finais and decretos are DOCX/PDF (swap `doc.pdf` → `doc.docx` in a link for the Word original). Text links are missing before the VIII legislatura and for about 70 % of XIII/XIV.

## legalize-pt

- `git clone https://github.com/legalize-dev/legalize-pt`. Layout: `pt/<year>/<identifier>.md`; regional legislation is in `pt-20` (Açores) and `pt-30` (Madeira). Front matter includes the ELI, `publication_date`, `rank`, `status`, `dre_id` and thesaurus subjects. Commit trailers: `Norm`, `Disposition`, `Source`, `Affected articles`, `Change`.
- **One date per version** (entry into force, or publication for bootstraps), no efficacy, no parliamentary data, no verification.
- **Staleness found:** in the snapshot inspected (HEAD 2026-10-27), `pt/1988/DRE-1988-442-B-519003.md` (Código do IRC) contains the **1988 text** (taxa 36,5 %, original numbering) although its front matter says `last_updated: 2025-12-30`. The DR consolidates the CIRC under a different key (`lei/2014-64205634`, from the 2014 reform's republication). Mirrors that follow the original act's ID miss renumbered republications. Lei 74/98's file shows a similar mismatch (`last_updated: 2008-01-01` against a 2014 consolidated source).
- **Use:** bootstrap metadata and the title-matching fallback; a third comparator in verification. Report the issues upstream.

## Lei 74/98 (lei formulário): the rules we rely on

Read from the consolidated text (version of 2014):

- **Art. 2.º, n.º 2:** with no date fixed, acts enter into force "em todo o território nacional e no estrangeiro, no 5.º dia após a publicação". **N.º 4:** counted from the day after the act is made available on the INCM website. N.º 3 is revoked, so the old 15- and 30-day periods for the Regions and abroad no longer apply.
- **Art. 5.º, n.º 4:** declarações de retificação take effect from the date the rectified text entered into force. N.º 2 sets a 60-day deadline.
- **Art. 6.º, n.º 1:** amending acts must state the alteration ordinal and list the earlier amenders. **N.º 2:** the CRP, regional statutes, organic laws, framework laws and Lei 74/98 itself are always republished. **N.º 3:** laws are republished after more than 3 alterations (codes excepted) or more than 20 % of the articulado. **N.º 5:** **OE amendments are never republished.**
