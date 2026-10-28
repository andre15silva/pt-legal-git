# Diário da República (diariodarepublica.pt) — feasibility report for "Git para a Lei"

Probed live on 2026-10-28 from this sandbox (HTTPS via proxy, curl + headless Chromium/Playwright).
Everything marked **VERIFIED** was observed in an actual response; anything else is labelled
**NOT VERIFIED** / **INFERENCE**.

Raw samples (from the research session, not committed): `<research-session>/research/dre/`
(sub-folders `api/`, `capture_*`, `sitemap/`, `rss/`, `js/`, `other/`, `dadosgov/`).
Helper scripts (the client is now [`tools/dr_client.py`](../../../tools/dr_client.py)):
`<research-session>/scripts/`
(`drclient.py` = minimal Python client, `capture.js` = Playwright XHR recorder, `replay_test.py` = amendment-replay experiment).

---

## 0. TL;DR

* There is **no official public API** and **no DRE dataset on dados.gov.pt** (VERIFIED: searches for
  "diario da republica", "dre", "INCM", "legislacao consolidada" return only unrelated datasets).
* The site is an **OutSystems Reactive** SPA behind **AWS CloudFront** (not Cloudflare). All data comes
  from internal JSON endpoints `POST https://diariodarepublica.pt/dr/screenservices/dr/<Flow>/<Screen>/<Action>`.
  They work **anonymously** with a static CSRF header and return clean JSON. This is the de-facto API.
* Enumeration sources (all VERIFIED): **official sitemaps** (`files.diariodarepublica.pt/sitemap/sitemap.xml`,
  591 child sitemaps incl. `legislacao-consolidada-sitemap-1.xml` with **5,834 consolidated diplomas**),
  **per-day Série I listing** endpoint (works back to 1910s), **daily RSS** (today only), and the **Elasticsearch-backed
  search** endpoint (returns raw ES JSON with facets).
* **Legislação consolidada is the jackpot**: per-diploma, *fragment (article)-level* JSON with hierarchy
  (Livro/Título/Capítulo/Secção/Artigo), current text, per-article change list (amending act + article of the
  amending act + entry-into-force date), per-article previous versions with full text, a per-diploma
  **amendment timeline** (every amending act and every fragment it touched: Altera/Adita/Revoga/Retifica/Suspende…),
  and **point-in-time snapshots** (`DataSelecionada`). Código Civil history goes back to the 1966 original
  (102 amending acts); CRP has all 7 revisions; CT has 28 amending acts.
* Original act text (1.ª Série) is available as **semi-structured HTML + plain text** (flat `<p class=…>`
  per paragraph; no article/número IDs) for acts from ~1960 onwards in my samples; **1925/1945/1950 samples
  were PDF-only**. ELI metadata (RDFa) only from ~1991 in samples.
* ELI: `https://data.dre.pt/eli/...` resolves (301 → human page) for **html** and **pdf** only; **no RDF/XML/JSON
  serialisation** (406 on content negotiation, xml/rdf/json suffixes → error page). ELI metadata is available
  as **RDFa embedded in the JSON** (`ELIMetadataHTML`): `eli:changed_by`, `eli:consolidated_by` (= list of consolidation
  dates = release points), `eli:cites`, `eli:cited_by`, `eli:transposes`, `eli:date_publication`, `eli:in_force`, `eli:licence`…
* Replay feasibility test (VERIFIED, quick prototype): applying Lei n.º 13/2023 art. 2.º ("nova redação" with
  `[...]` elisions) to the DR snapshot of the CT on 2023‑04‑02 reproduced the DR snapshot of 2023‑04‑03 for
  **90/97 articles exactly (whitespace-normalised) + 3 more modulo end-of-line punctuation** using 5 simple rules.
* **Recommended strategy: C (hybrid)** — DR consolidated fragments as ground truth & commit skeleton (who/when/what),
  amending-act text for blame granularity below article level and for verification; original-act HTML for
  diplomas DR does not consolidate.

---

## 1. Enumerating published acts

### 1.1 Things that do NOT exist / do not work (VERIFIED)
| Probe | Result |
|---|---|
| `https://diariodarepublica.pt/robots.txt` (also dre.pt, data.dre.pt) | 301 → `/dr/error` (no robots.txt at all) |
| `https://diariodarepublica.pt/sitemap.xml`, `/dr/sitemap.xml`, `sitemap_index.xml` | → `/dr/error` |
| `/dr/api`, `/api`, `/rss`, `/dr/rss` | → `/dr/error` |
| dados.gov.pt API `GET https://dados.gov.pt/api/1/datasets/?q=…` | no DRE/INCM dataset (only municipal/APA datasets that *mention* DR). Note: one call got a TCP reset, retry worked. |
| ELI `…/xml`, `…/rdf`, `…/json`, `…/ttl`; `Accept: application/rdf+xml / text/turtle / ld+json` | error page or **406** |

### 1.2 Official sitemaps — VERIFIED, best "list of everything"
* Index: `https://files.diariodarepublica.pt/sitemap/sitemap.xml` (84 KB, **591** child sitemaps, served from S3/CloudFront).
* Child naming: `https://files.diariodarepublica.pt/sitemap/<tipo-slug>-sitemap-<n>.xml`, e.g.
  * `legislacao-consolidada-sitemap-1.xml` — **5,834** URLs `https://diariodarepublica.pt/dr/legislacao-consolidada/<tipo>/<ano>-<DiplomaFragId>` with `<lastmod>` (latest 2026‑10‑27). Breakdown: 2,161 decreto-lei, 1,653 portaria, 610 lei, 353 RCM, 309 DLR, 156 DRR, 94 decreto-regulamentar…
  * `lei-sitemap-1.xml` (6,713 Leis, 1913→2026), `decreto-lei-sitemap-1.xml` (20,000) + `-2.xml` (11,630), `lei-organica-sitemap-1.xml` (93), `lei-constitucional-sitemap-1.xml` (8), `decreto-legislativo-regional-sitemap-1.xml` (2,414), `declaracao-retificacao-sitemap-1.xml` (5,453), `acordao-tribunal-constitucional-sitemap-1.xml` (166), plus ~580 more types (portaria, resolucao-conselho-ministros, …, 2.ª série types, ato-societario…).
  * Act URL format: `https://diariodarepublica.pt/dr/detalhe/<tipo-slug>/<numero>-<ano>-<DiplomaLegisId>` (e.g. `/dr/detalhe/lei/7-2009-602073`).
* Caveat: many `<lastmod>` = 2023‑06‑03 (bulk regeneration); completeness not proven (e.g. only 32 Leis for 2022 — plausibly correct but unchecked). Use as a cross-check, not sole source.

### 1.3 Per-day Série I index — VERIFIED (authoritative enumeration)
```
POST https://diariodarepublica.pt/dr/screenservices/dr/Home/WB_Serie1_List/DataActionGetDataAndApplicationSettings
Content-Type: application/json; charset=UTF-8
X-CSRFToken: T6C+9iB49TLra4jEsMeSckDMNhQ=

{"versionInfo":{"moduleVersion":"J7V1hYhO5HfBLPheagKZ6g","apiVersion":"1ZNbiINloOPj8IhEJxM3QA"},
 "viewName":"Home.home",
 "screenData":{"variables":{"HasFetched":false,"DataSelecionada":"2023-04-03","IsSumarioCompleto":true,"IsPageTracked":false}}}
```
Response (trimmed, `api/serie1_2023-04-03.json`):
```json
{"data":{"DiarioByDiaList":{"List":[
 {"Title":"Diário da República n.º 66/2023, de 3 de abril de 2023","DiarioRepublicaId":"211340861",
  "VersaoPDF":"https://files.diariodarepublica.pt/gratuitos/1s/2023/04/06600.pdf",
  "DiplomaLegiList":{"List":[{"ConteudoTitle":"Lei n.º 13/2023 ","Tipo":"Lei","Numero":"13/2023",
     "Emissor":"Assembleia da República","DbId":"211340863","Sumario":"<p>…</p>",
     "LinkSitemap":"/dr/detalhe/lei/13-2023-211340863", …}, …]}},
 {"Title":"Suplemento do Diário da República n.º 66/2023", … "Portaria n.º 99-A/2023" …}]}}}
```
* Includes supplements; works for 2026, 2009, 1976 (Constituição day: 17 acts), 1950, **1915** ("Diário do Govêrno").
* To find which days have issues: `MenusParaPesquisa/LegislacaoPorData/DataActionGetAnosComPublicacoes` (VERIFIED: years 2026…), `…GetMesesComPublicacoes`, `…GetDiasComPublicacoes` (hashes in `endpoints.txt`; months/days variants not exercised) — or just iterate every calendar day (~42k days since 1910).
* Diário detail (acts of one issue): `Legislacao_Conteudos/Conteudo_Det_Diario/DataActionGetDadosAndApplicationSettings` (VERIFIED via browser capture `capture_diario/`).

### 1.4 RSS — VERIFIED (today's index only)
`https://files.diariodarepublica.pt/rss/serie1.xml` and `serie1-html.xml` (+ `serie2&parte=a…l`). RSS 2.0, one `<item>` per act with title, sumário, link to `/dr/detalhe/...`. Only the current day → useful for incremental updates/notifications, not backfill.

### 1.5 Search (Elasticsearch passthrough) — VERIFIED
`POST /dr/screenservices/dr/Pesquisas/PesquisaResultado/DataActionGetPesquisas` (apiVersion `PRsQKjEXDVBC3ZSqkS8k6A`). The request needs the screen's full variable bag (~24 KB; captured template in `capture_search/21_DataActionGetPesquisas.req.json`); key fields: `PesquisaSimplesFiltro`, `Pesquisa.List`, `ListaFiltros.List[{Area,Value}]`, `StartIndex`, `MaxRecordsPerPage`, `TipoOrdenacaoId`. Response `data.Resultado` is a **raw Elasticsearch JSON string** (index `dre-prd-28102025`) with hits and aggregations (`TipoAtoAgg`, `SerieAgg`, `ConsolidacaoEstadoAgg`, `VigenciaAgg`, …).
* Filter `{"Area":"consolidacaoVisibility","Value":"PUBLIC"}` + docType LEGISLACAO → **5,988** consolidated diplomas (5,916 Série I), states CONCLUDED 4,874 / REVOKED 890 / IN_PROGRESS 113 / CONDITIONAL 61 (`api/search_consolidadas_public.json`).
* Hit `_source` fields: `dbId` (=DiplomaLegisId), `tipo`, `numero`, `dataPublicacao`, `serie`, `emissor`, `vigencia` (VIGENTE/NAO_VIGENTE/…), `consolidacaoEstado`, sometimes `DiplomaFragmentadoId` (=consolidation key).
* Pagination: `StartIndex` + page size (not stress-tested; ES default max window 10k → page by date ranges — INFERENCE).

### 1.6 How the internal API works (all VERIFIED)
* Manifest: `GET https://diariodarepublica.pt/dr/moduleservices/moduleinfo` → `manifest.versionToken` (= `moduleVersion`, currently `J7V1hYhO5HfBLPheagKZ6g`) and the list of JS modules. Each module JS (`/dr/scripts/dr.<Flow>.<Screen>.mvc.js?<hash>`) contains `callDataAction("<Name>", "<uuid>", "screenservices/dr/…", "<apiVersion>")`. I extracted **314 endpoint/apiVersion pairs** → `research/dre/endpoints.txt`.
* Body: `{"versionInfo":{"moduleVersion":…,"apiVersion":…},"viewName":"<Flow>.<Screen>","screenData":{"variables":{…}}}`; aggregates (`ScreenDataSet…`) also need `"inputParameters":{"StartIndex":0,"MaxRecords":50}`; server actions (`Action…`) take `"inputParameters":{…}` only.
* Headers: `Content-Type: application/json; charset=UTF-8` and **`X-CSRFToken: T6C+9iB49TLra4jEsMeSckDMNhQ=`** (OutSystems' fixed anonymous token; the browser sends exactly this). No cookies/login needed. Without the header → 301 redirect.
* Variables: the server only reads some of the screen variables, but **some actions need outputs of earlier actions passed back in** (e.g. consolidated `GetData` needs the `GetDiplomaFragByIdAndApplicationSetting` result as a variable; otherwise `System.NullReferenceException`).
* **Versioning hazard**: with a stale `moduleVersion`/`apiVersion` the server returns HTTP 200 with `"data":{}` and `"hasModuleVersionChanged":true,"hasApiVersionChanged":true` (no error!). The scraper must check these flags and re-extract hashes from the JS after each deploy.
* Errors come back as HTTP 200 with `"exception":{"name":"ServerException","specificType":…}`.

---

## 2. ELI

* Resolver: `https://data.dre.pt/eli/<tipo>/<num>/<ano>/<mm>/<dd>/p/dre/pt/html` → 301 `https://diariodarepublica.pt/redirect/LinkELI.aspx?search=…` → 200 `/dr/detalhe/lei/7-2009-602073` (VERIFIED).
* `…/pt/pdf` → `https://files.diariodarepublica.pt/1s/2009/02/03000/0092601029.pdf` (VERIFIED, 765 KB).
* Consolidated: `https://data.dre.pt/eli/lei/7/2009/p/cons/20250327/pt/html` and even `…/p/cons/pt/html` (no date) → `/dr/legislacao-consolidada/lei/2009-34546475` (VERIFIED). **The date part is ignored** by the human page (lands on the current version), but the redirect is a handy way to map an act → its `DiplomaFragId`.
* No machine serialisation (xml/rdf/json/ttl → error; RDF Accept headers → 406). The `eli:licence` target `http://data.dre.pt/eli/dec-lei/83/2016/p/dr/pt/html` itself does **not** resolve (→ error page).
* ELI metadata is delivered as **RDFa HTML inside the JSON** (`DetalheConteudo.ELIMetadataHTML` for acts; `ActionGetEliGeneralInfoConsolidacao` for consolidations). Example Lei 7/2009 (`api/lei7_2009_eli_rdfa.html`):
  ```html
  <span about="http://data.dre.pt/eli/lei/7/2009/02/12/p/dre" property="eli:date_publication" datatype="xsd:date" content="2009-02-12">
  <span … property="eli:in_force" resource="http://data.europa.eu/eli/ontology#InForce-inForce">
  <span … property="eli:amended_by" resource="http://data.dre.pt/eli/declretif/38/2012/7/23/p/dr/pt/html">
  <span … property="eli:consolidated_by" resource="http://data.dre.pt/eli/lei/7/2009/p/cons/20230403">   (28 of these)
  <span … property="eli:licence" resource="http://data.dre.pt/eli/dec-lei/83/2016/p/dr/pt/html">
  ```
  Property counts on Lei 7/2009: cited_by 306, is_about 95, consolidated_by 28, cites 15, transposes 15, amended_by **2 (only the two rectifications!)**.
  On the consolidated CT (`api/cons_ct_eli_rdfa.json`): `eli:changed_by` ×28 (all amending acts, e.g. `…/eli/lei/13/2023/04/03/p/dre`, `…/eli/actconst/338/2010/11/08/p/dre`), `eli:consolidates`, `eli:is_member_of` `…/p/cons`, `eli:date_document` 2025‑03‑27.
* **Not present**: `eli:amends`, `eli:changes`, `eli:repeals`, `eli:date_document` on the original act, `eli:first_date_entry_in_force`. Amendment relations must come from the consolidation timeline (§4) or legal analysis (§7), not from ELI on the amending act.
* ELI coverage: present for my 1991+ samples; absent for 1960/1974/1980/1986 samples and for the 1976 Constitution decree.

---

## 3. Text of a single act

Endpoint (VERIFIED):
```
POST /dr/screenservices/dr/Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetAllConteudoDetalheData
{"versionInfo":{"moduleVersion":"J7V1hYhO5HfBLPheagKZ6g","apiVersion":"B3l5BYZxaLmWUxGR3tmKGw"},
 "viewName":"Legislacao_Conteudos.Conteudo_Detalhe",
 "screenData":{"variables":{"Tipo":"lei","Key":"7-2009-602073"}}}
```
`data.DetalheConteudo` fields: `Id`, `Titulo`, `Numero`, `TipoDiploma`, `Emissor`, `Serie`, `Suplemento`, `DataPublicacao`,
`Sumario`, `Resumo` (plain-language summary), **`Texto`** (plain text, `\r`/`\n` separated), **`TextoFormatado`** (HTML),
`URL_PDF`, `Pagina`, `Vigencia` (VIGENTE/…), `ELI`, `ELIMetadataHTML`, `DiarioRepublica{Numero,URL_PDF,Id}`. Lei 7/2009: 1.4 MB JSON, Texto 535 KB, TextoFormatado 705 KB.

Markup of `TextoFormatado` (VERIFIED, `api/lei7_2009_textoformatado.html`) — **flat, presentational, no IDs**:
```html
<p class='paragraph-center'>Artigo 129.º</p>
<p class="paragraph-bold-center-14px">Garantias do trabalhador</p>
<p class="paragraph-normal-text">1 - É proibido ao empregador:</p>
<p class="paragraph-normal-text">a) Opor-se, por qualquer forma, a que o trabalhador exerça os seus direitos, …;</p>
…
<p class="paragraph-normal-text">2 - Constitui contra-ordenação muito grave a violação do disposto neste artigo.</p>
<p class='paragraph-center'>SUBSECÇÃO II</p>
```
Classes seen: `paragraph-title-bold-center-18px` (act title), `paragraph-bold-center` (date/sumário), `paragraph-center` (Artigo / ANEXO / LIVRO / CAPÍTULO headings), `paragraph-bold-center-14px` (epígrafe), `paragraph-normal-text` (body: número `N - …`, alínea `x) …`), `paragraph-italic-right` (signatures). Links to EU directives are `<a href='https://data.europa.eu/eli/dir/…'>`. Structure must be recovered with regexes ("Artigo N.º", "N - ", "x) ", "i) "), which is easy because Portuguese drafting is very regular.

Coverage samples (VERIFIED, 3 acts/day): 1925‑06‑03 & 1945‑06‑05 & 1950‑06‑01 → `Texto` empty (**PDF only**); 1960, 1974, 1980, 1986, 1991, 1995, 1998, 2003, 2008, 2016, 2023, 2025 → text present. Exact start year of text coverage NOT VERIFIED (somewhere 1950–1960 in samples).
PDFs: per-act `https://files.diariodarepublica.pt/1s/<ano>/<mm>/<issue>/<pages>.pdf`, whole issue `…/gratuitos/1s/<ano>/<mm>/<issue>.pdf`.

Amending-instruction format (VERIFIED, Lei 13/2023 art. 2.º, `api/act_lei_13-2023-211340863.json`): the amending act restates whole articles with elisions:
```
Os artigos 3.º, 10.º, … do Código do Trabalho, aprovado pela Lei n.º 7/2009, de 12 de fevereiro, passam a ter a seguinte redação:
«Artigo 3.º
[...]
1 - [...]
…
n) [...]
o) Uso de algoritmos, inteligência artificial e matérias conexas, …
4 - [...]
```
Other tokens observed: `(Anterior n.º 7.)`, `[Anterior alínea c).]`, `(Anterior proémio do n.º 4.)`, `(Anterior corpo do artigo.)`, `(Revogado.)`. Additions use "É aditado … o artigo X.º-A, com a seguinte redação"; revocations in a "Norma revogatória" article. This is **far more replayable than US Code instructions** (structure-addressed, not prose "strike/insert").

---

## 4. Legislação consolidada (key finding)

### 4.1 List of consolidated diplomas
* Full list: `legislacao-consolidada-sitemap-1.xml` (5,834; §1.2) or ES search filter (5,988; §1.5).
* "Códigos" menu (26 major codes incl. CRP, CC, CP, CPP, CPC, CT, CPT, CCP, CPA, CSC, CIRS, CIRC, CIRE, CDADC…): `MenusParaPesquisa/LegislacaoPorCodigo/DataActionGetCodigos` (apiVersion `8PR5RObK8y_eLLk_RGAS7Q`, variables `{}`) → `api/codigos.json`.
* Latest updated consolidations: `Home/home/DataActionGetUltimasConsolidacoes` (20 items with `Data`, `Estado`, `Link`).
* Key format: `/dr/legislacao-consolidada/<tipo>/<ano>-<DiplomaFragId>`; e.g. CT `lei/2009-34546475`, CC `decreto-lei/1966-34509075`, CRP `decreto-aprovacao-constituicao/1976-34520775`.

### 4.2 Calls (all VERIFIED; implemented in `scripts/drclient.py`)
View name for all: `LegislacaoConsolidada.LegCons_Detalhe`.

| Step | Endpoint (`/dr/screenservices/dr/…`) | apiVersion | variables |
|---|---|---|---|
| 1 header | `LegislacaoConsolidada/LegCons_Detalhe/DataActionGetDiplomaFragByIdAndApplicationSetting` | `nc_pvjc74SJq_vOvUM4nCg` | `{"Tipo":"lei","Key":"2009-34546475","DiplomaFragId":"34546475"}` → DiplomaLegisId, Designacao, current ELI |
| 2 first date | `…/LegCons_Detalhe/DataActionGetInitialDate` | `2fs9w33A1a5ZYqnjhzLjew` | `{"DiplomaFragId":…,"DiplomaLegisId":…}` → `{"Date":"1966-11-25"}` |
| 3 snapshot | `…/LegCons_Detalhe/DataActionGetData` | `0J5toCe4aZFDi88AoH0G0Q` | `{"DiplomaFragId","DiplomaLegisId","DataSelecionada":"YYYY-MM-DD","FragmentoVersaoId":"0","GetDiplomaFragByIdAndApplicationSetting":<data of step 1>}` (minimal body 14 KB: `api/cons_ct_getdata_REQUEST_minimal.json`) |
| 4 timeline | `LegislacaoConsolidada/AlteracoesTimelineByDiplomaLegisId/DataActionGetConsolidacaoByDiplomaFrag` | `kqtmWKfgghZe4WM2Y1nYAQ` | `{"DiplomaLegisId","DiplomaFragId","Data","ModificanteFragId":"0"}` |
| 5 article versions | `LegislacaoConsolidada/DiplomaByFragmentoVersaoId/ScreenDataSetGetVersoesByFragmentoId` | `_+pYoyTeGysAq0H186JNuA` | `{"FragmentoVersaoId","DiplomaFragId","DataSelecionada","DiplomaLegisId"}` + `inputParameters {"StartIndex":0,"MaxRecords":50}` |
| PDF | `…/LegCons_Detalhe/ActionGetVersaoPDFConsolidada` | `8wWbpyMsKHyyYELGBOMhZg` | `inputParameters {"IsConteudoRevogado":false,"DataSelecionada":…,"DiplomaFragId":…}` → base64 PDF (CRP: 103 pp, `api/cons_crp_20261028.pdf`) |
| ELI | `…/LegCons_Detalhe/ActionGetEliGeneralInfoConsolidacao` | `vLibxdclZOkiW+xLqV_VGA` | (captured from browser) |
| diff | `LegislacaoConsolidada/CompararStrings/ActionHTMLDiff`, `FragmentoVerDiferencas/*` | in endpoints.txt | not exercised |

Latency 0.3–1.8 s; snapshot sizes: CT 2.0 MB (767 fragments), CC 6.4 MB (2,895 fragments), CRP 1.2 MB (347).

### 4.3 Snapshot structure (`DataActionGetData` → `data.LegConsBase.List[]`, one per fragment)
Granularity is **per fragment = per structural unit (Diploma, Livro, Título, Capítulo, Secção, Subsecção, Divisão, Artigo, Anexo, Assinatura)**. Números/alíneas are *inside* the article text, separated by `\n`. Example (CT, Anexo art. 3.º, `api/cons_ct_current_getdata.json`):
```json
{"Nivel":5,"HasFilhos":false,
 "ConsolidacaoFragmento":{"Id":"75268404","FullName":"Diploma > Anexo > Livro I > Título I > Capítulo I > Artigo 3.º",
   "Name":"Artigo 3.º","Epigrafe":"Relações entre fontes de regulação","PaiId":"75268401","IndexOrdem":"22.00",
   "AssociacaoDescription":"Alterado pelo/a Artigo 2.º do/a [L]Lei n.º 13/2023 - Diário da República n.º 66/2023, Série I de 2023-04-03[/L], em vigor a partir de 2023-05-01",
   "GrupoTipoModificacaoEnumId":3,"ConsolidacaoId":"914158877"},
 "FragmentoVersao":{"Id":"211390857","FragmentoId":"41622975","FragmentoPaiId":"40171475","TipoFragmentoId":11,
   "Identificacao":"3","DataVersao":"2023-04-03T01:00:00Z","DataEntradaVigor":"2023-05-01T00:00:00Z",
   "DataProducaoEfeitos":"1900-01-01T00:00:00","AssociacaoPrincipalId":"211390749",
   "Texto":"1 - As normas legais … salvo quando delas resultar o contrário. \n2 - … \n3 - … matérias: \na) Direitos de personalidade, … \n…\no) Uso de algoritmos, …\n4 - …\n5 - …"},
 "AlteracoesList":{"List":[
   "Alterado pelo/a Artigo 2.º do/a [L]<a href=\"/dr/detalhe/lei/13-2023-211340863\" …>Lei n.º 13/2023 …</a>[/L], em vigor a partir de 2023-05-01",
   "Alterado pelo/a Artigo 2.º do/a [L]<a href=\"/dr/detalhe/lei/83-2021-175397114\" …>Lei n.º 83/2021 …</a>[/L], em vigor a partir de 2022-01-01",
   "Alterado pelo/a Artigo 2.º do/a [L]<a href=\"/dr/detalhe/lei/93-2019-124417106\" …>Lei n.º 93/2019 …</a>[/L], em vigor a partir de 2019-10-01"]},
 "Nota":{"List":[]}}
```
TipoFragmentoId: 15 Diploma, 12 Livro, 13 Título, 5 Subtítulo, 1 Capítulo, 8 Secção, 3 Subsecção, 9 Divisão, 11 Artigo, 14 Anexo, 7 Assinatura.
GrupoTipoModificacaoEnumId (INFERENCE from CC counts): 3 altered, 5 revoked, 6 added, 2 rectified, 1 added(?), 0 none.
Envelope fields: `DataUltimaConsolidada`, `CurrentConsolidacaoId`, `LastConsolidacaoId`, `URLPDF` (original act PDF), `IsVersaoInicial`.
`Nota` holds editorial notes, e.g. CC art. 2.º: "Acórdão n.º 743/96 … Declarada a inconstitucionalidade, com força obrigatória geral…".

### 4.4 Timeline = commit list (`api/cons_ct_timeline.json`, `api/cons_cc_timeline.json`, `api/cons_crp_timeline.json`)
```json
{"ModificacoesList":{"List":[
  {"Title":"Lei n.º 32/2025 - 1.ª Série","TipoDiploma":"Lei","Numero":"32/2025","DataPublicacao":"2025-03-27",
   "LinkSitemap":"/dr/detalhe/lei/32-2025-912653920","DiplomaLegisId":"912653920","DataValidacao":"2025-04-08T17:19:45Z",
   "ModificacaoList":{"List":[{"TipoModificacao":"Adita","FragmentoDestinoModificacao":"Artigo 252.º-B",
      "PathDestinoModificacao":"Anexo > Livro I > Título II > Capítulo II > Secção II > Subsecção XI",
      "FragmentoVersaoDestinoId":"914159292","DataEntradaVigor":"2025-04-26", …}]}}, …]},
 "ModificacoesCounter":"346"}
```
* CT: 28 amending acts + original (2009‑02‑12 → 2025‑03‑27), 346 modifications: Altera 287, Adita 36, Nota 10, Retifica 8, Revoga 2, Suspende 2, Entrada Vigor 1. Includes **Declarações de Retificação, Acórdãos do TC (338/2010, 602/2013) and a Decreto Legislativo Regional** as "commits".
* CC: **102 amending acts back to the 1966 original** (1970s 12, 80s 11, 90s 19, 00s 22, 10s 23, 20s 14; latest Lei 29/2026 of 2026‑06‑23), 1,165 modifications.
* CRP: 1976 original + LC 1/82, 1/89, 1/92, 1/97, 1/2001, 1/2004, 1/2005 (843 modifications).
* `DataValidacao` = when DR's editors validated the consolidation (lag observed: 8–12 days for recent Leis; ~3 months for DLR 23/2021; 1900-01-01 = unknown for pre-2019 items).

### 4.5 Per-article history and point-in-time
* `ScreenDataSetGetVersoesByFragmentoId` → previous versions with full `Texto`, `DataVersao`, `DataEntradaVigor`, `AssociacaoDescription` (CT art. 3.º → 3 versions 2023/2021/2019; CC art. 1577.º → 2010 (Lei 9/2010) and 1977 (DL 496/77)). The **original** version is not in that list; get it via point-in-time.
* **Point-in-time**: `DataSelecionada` on `GetData` returns the whole diploma as of that date. VERIFIED: CC on 1970‑01‑01 returns the 1966 text of art. 1577.º ("…duas pessoas de sexo diferente que pretendem constituir legìtimamente a família…"); CT on 2015‑01‑01 returns 736 fragments.
* **Important nuance (VERIFIED)**: snapshots are keyed by **publication date (DataVersao), not entry into force**. CC on 2010‑05‑30 → old art. 1577.º; on 2010‑05‑31 (Lei 9/2010 published) → new text, although `DataEntradaVigor` = 2010‑06‑05. "As in force on X" must be computed by us from `DataEntradaVigor` / `DataProducaoEfeitos` (and free-text exceptions in the act).
* **Revoked articles keep their last text** in `Texto`; revocation is visible only via `AlteracoesList[0]` ("Revogado pelo/a …") and `GrupoTipoModificacaoEnumId=5` (CC: 256 "Revogado" entries, some with enum 3/0 → inconsistent). `ShowRevogados`/`WithConteudoRevogado` flags did not change the result.
* Data-quality nit (VERIFIED): CT has a fragment named "Artigo 502" (missing ".º").

---

## 5. Republicação (release points)

VERIFIED in Lei 13/2023:
```
Artigo 34.º
Republicação
1 - É republicada, no anexo i à presente lei e da qual faz parte integrante, a Lei n.º 107/2009, de 14 de setembro, na redação introduzida pela presente lei.
2 - É republicado, no anexo ii … o Decreto-Lei n.º 235/92, de 24 de outubro, …
…
ANEXO I
(a que se refere o n.º 1 do artigo 34.º)
Republicação da Lei n.º 107/2009, de 14 de setembro
CAPÍTULO I …
```
Identification: article with epígrafe "Republicação" + annex heading `ANEXO <n>` / `(a que se refere o … artigo N.º)` / `Republicação d[ao] <diploma>`; sumário often says "…e procede à sua republicação". Find them via ES full-text search "republicação"/"republicado" filtered to Série I (not counted). Unlike OLRC release points these are *official, legally valid* full texts of the amended diploma at that publication date → perfect verification checkpoints. Additional checkpoints: DR consolidation snapshots (`eli:consolidated_by` dates) — editorial, "sem valor legal".

---

## 6. Licence / terms / access behaviour

* **Legal basis (VERIFIED text)**: DL 83/2016 art. 3.º "Acesso universal e gratuito": "1 - A edição do Diário da República é de acesso universal e gratuito. 2 - … compreende a possibilidade de impressão, arquivo, pesquisa e livre acesso ao conteúdo dos atos publicados nas 1.ª e 2.ª séries … em formatos eletrónicos de acesso aberto." Preamble: "disponibilização desses conteúdos em formatos passíveis de reutilização (dados abertos) de forma livre e integral". ELI RDFa `eli:licence` points at DL 83/2016.
* **Avisos legais** page (`/dr/geral/avisos-legais`, rendered text in `other/avisos-legais.txt`): service regulated by DL 83/2016 + Despacho Normativo 16/2022; consolidated text is produced "ainda que sem valor legal"; footer "INCM, SA – TODOS OS DIREITOS RESERVADOS"; prohibits actions that "possa causar dano e pôr em risco a integridade do sistema". No explicit reuse licence (CC-BY etc.) found.
* **Copyright (CDADC, text fetched from DR consolidation)**: art. 8.º/1 — official texts (laws) "não beneficiam de protecção"; **but** art. 3.º/1/c makes "compilações sistemáticas ou anotadas de textos … de leis" works protected as originals. → Text of acts: free. **DR's consolidation (selection/structuring/notes) and PGDL's compilation may carry compilation/database rights (also sui generis DB right, DL 122/2000 — not checked).** (The brief's "CDADC art. 7" is the wrong article: art. 7.º covers news, speeches, petitions.) Get legal advice / ask INCM for written permission before republishing DR consolidated texts wholesale; generating our own consolidation from official acts is clean.
* **robots.txt**: none (redirects to error page). Sitemaps exist on `files.` host.
* **Anti-bot**: CloudFront + S3; no Cloudflare, no JS challenge, no cookies needed. 30 sequential POSTs → 30×200, no throttling seen. Large-scale rate limits **NOT VERIFIED** (WAF may exist). HEAD on HTML routes → 405 (use GET). Be polite (≤1–2 req/s, cache everything, identify UA).

---

## 7. Other sources (brief)

* **DR "Análise jurídica"** (`/dr/analise-juridica/informacoes-gerais/<tipo>/<key>`; endpoints `AnaliseJuridica/AnaliseJuridica/DataActionGetData`, `WB_AnaliseJuridica_DetalheAssociacao/ScreenDataSetGetDetalheAssociacoesDiplomaLegis`): VERIFIED gives free-text `DataEntradaVigor` incl. exceptions ("2023‑05‑01, com exceção do artigo 36.º …"), `Vigencia`, notes, thesaurus; association lists (altera/revoga/regulamenta) exist but were not fully exercised. Useful for acts DR doesn't consolidate.
* **PGDL** (`https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=1047&tabela=leis`): VERIFIED static ISO‑8859‑1 HTML, whole diploma, per article "Contém as alterações dos seguintes diplomas" + "Consultar versões anteriores deste artigo: 1ª versão: Lei n.º 7/2009 …"; full older versions of the whole diploma at `…&tabela=lei_velhas&nversao=N` (CT: 24+ versions). No robots.txt (404). Independent editorial consolidation → good **second opinion** for verification (e.g. PGDL keeps "n) … trabalhadores." where DR changed the final "." to ";"). Coverage limited to selected diplomas; copyright of compilation applies.
* **DGSI** (`https://www.dgsi.pt/jstj.nsf?OpenDatabase`): reachable (200, Lotus Domino, ISO‑8859‑1). Jurisprudence only — not needed for the corpus; not explored further.

---

## 8. Replay experiment (evidence for strategy B/C)

`scripts/replay_test.py`: parse the «…» block of Lei 13/2023 art. 2.º into 98 restated CT articles; apply to DR snapshot 2023‑04‑02; compare with DR snapshot 2023‑04‑03 (whitespace-normalised). Rules: (1) `[...]` → old unit; (2) elided unit with no restated children keeps old children; (3) `(Anterior n.º X.)`/`(Anterior alínea x).)` → moved unit; (4) `(Anterior corpo do artigo.)`; (5) trailing old números not restated are kept.

| Result | Articles |
|---|---|
| exact | **90** |
| equal modulo end-of-unit punctuation (DR editors change "." ↔ ";" when appending alíneas) | 3 |
| mismatch | 4 (`[Anterior alínea c).]` bracket variant, `(Anterior proémio do n.º 4.)`, art. 433.º structural difference, art. 249.º) |
| missing in DR | 1 ("Artigo 502" name typo in DR) |

So ≈96% after one hour of rules — comparable to lexifina's 361/365 trajectory; remaining cases are enumerable drafting idioms.

---

## 9. Verdict — ingestion strategy

**C (hybrid), with DR consolidation as the backbone.**

1. **Skeleton / commits from DR consolidation (A-side)** for the 5.8k consolidated diplomas: timeline (§4.4) gives every amending act (author/message = act title + sumário; date = DataPublicacao; per-fragment DataEntradaVigor), and point-in-time snapshots give the tree state after each commit (`n_commits+1` snapshot calls per diploma; e.g. CT 29 × 2 MB). This yields verifiable history, `git log` per article, and article-level blame immediately.
2. **Sub-article blame and verification via replay (B-side)**: parse each amending act's "nova redação" blocks and apply at número/alínea level; diff the result against the DR snapshot (and PGDL, and official *republicações* as hard release points). Mismatches are triaged (DR editorial punctuation vs. our parser vs. genuine DR errors). Store both "official text as published" and "DR consolidated text" when they disagree.
3. **Non-consolidated diplomas**: original text from `Conteudo_Detalhe` (HTML→structure via regex) as single-commit files; relations from Análise Jurídica; PDF/OCR only for pre-~1960 acts (low priority).
4. **"In force on date X"**: derive from per-version `DataEntradaVigor`/`DataProducaoEfeitos` — do **not** rely on DR's `DataSelecionada` (publication-date semantics). Model as git commits dated by publication, with entry-into-force in trailers/tags (or a second branch keyed by vigência).
5. **Incremental**: daily RSS / Série I endpoint → new acts; consolidation `lastmod` in sitemap / `GetUltimasConsolidacoes` → re-fetch changed diplomas (watch `consolidacaoEstado` IN_PROGRESS→CONCLUDED).

Pure A loses sub-article blame and inherits DR's editorial changes/omissions; pure B is infeasible for 1910–1990 (PDF-only/no structure) and fragile without a reference to verify against.

---

## 10. Risks

1. **Undocumented internal API** (OutSystems): hashes change on every deploy; stale calls silently return `data:{}` with `hasApiVersionChanged:true`. Need an auto-refresh that re-reads `moduleinfo` + JS and re-extracts `apiVersion` by action name; and a headless-browser fallback (`capture.js`) to re-learn request shapes.
2. **Terms/copyright**: free access is statutory, but no explicit open licence; DR consolidations are a compilation (CDADC 3.º/1/c) and "sem valor legal". Ask INCM; prefer publishing our own replay-derived text, with DR as verification.
3. **Semantics**: DR snapshots by publication date; revoked articles keep old text (must read AlteracoesList/enum); editorial punctuation changes; occasional naming errors ("Artigo 502"); DataValidacao lag days–months; consolidation coverage is ~6k diplomas, not the whole corpus; some major acts may lag (not measured).
4. **Granularity**: DR fragments stop at article level; números/alíneas are `\n`-separated text (parseable but heuristic). Tables/annex images inside fragments not checked (no `<table>`/`<img>` seen in CC/CT/CRP texts).
5. **Old material**: pre-~1960 acts PDF-only (OCR needed); ELI only ~1991+.
6. **Scale/rate limits** untested beyond 30 sequential requests; payloads big (CC snapshot 6.4 MB) → budget e.g. ~30k snapshot calls ≈ tens of GB uncompressed; prefer per-article version calls where cheaper.
7. **No sitemap/robots guidance** for screenservices; behave conservatively.

## 11. Not verified
* Exact first year with structured text; exact first year of ELI.
* Months/days endpoints of LegislacaoPorData; ES pagination limits; search sort ids.
* Analise Jurídica association endpoints (altera/revoga lists) in detail.
* Whether every consolidated diploma reaches back to its original (CC/CRP/CT do).
* Rate limiting / WAF thresholds; behaviour from non-proxy IPs.
* Whether DR's consolidation is missing recent CT amendments (could not establish a ground-truth list quickly).
