# Assembleia da República open data — feasibility report for "Git para a Lei"

Scope: parlamento.pt open data only (Diário da República is covered separately).
All findings below were probed with curl/python on **2026-10-28** unless marked *[not verified]*.
Working files (from the research session, not committed; the parser lives in [`tools/parlamento.py`](../../../tools/parlamento.py)): `<research-session>/research/parlamento/`
(`all/` = every Iniciativas + Diplomas JSON for all legislaturas, `schema_*.tsv` = path inventories, `coverage.txt`, `all_fases.json` = every event phase code seen).

---

## 1. Catalogue

### 1.1 Entry point and discovery

* Catalogue page: <https://www.parlamento.pt/Cidadania/Paginas/DadosAbertos.aspx>
* Each dataset has a SharePoint "Recursos" page `https://www.parlamento.pt/Cidadania/Paginas/DA<Name>.aspx`.
  That page lists one **folder per legislatura** (`<a ... rptDirs ... title="Pasta XVII Legislatura">`); the folder link is
  `DA<Name>.aspx?t=<hex>&Path=<opaque encrypted token>`. Opening it lists the files (`<a ... rptDocs ... title="IniciativasXVII_json.txt">`).
* File download URLs are on **app.parlamento.pt** with an opaque token:
  `https://app.parlamento.pt/webutils/docs/doc.txt?path=<encrypted>&fich=IniciativasXVII_json.txt&Inline=true`
  (`doc.xml?...` for XML, `doc.xsd`, `doc.pdf`, `doc.zip`).
* **There is no API / index / stable URL.** Discovery = scrape the HTML (2 levels: dataset page → legislatura folder → file anchors, regex on `rptDirs`/`rptDocs`). Working scraper: `scratchpad/scripts/crawl2.sh`.
* The encrypted `path` token differs between renderings but old tokens keep working: the URL hard-coded months ago in `fsmunoz/parlamentodb` (`config.py`) still returned the same 101,278,301-byte file today. Still, treat URLs as ephemeral and re-scrape.
* No separate webservice/REST API was found on app.parlamento.pt *[searched only via the catalogue; not exhaustively probed]*.

### 1.2 Licence / terms

Verbatim from the catalogue page: *"A Assembleia da República (AR) disponibiliza dados abertos relativos à atividade parlamentar em formatos XML e JSON. Os dados podem ser livremente reutilizados por qualquer instituição ou pessoa para a criação de novos conteúdos, devendo apenas ser mencionada a fonte (Assembleia da República)."*
→ Free reuse with attribution. No named licence (no CC-BY text), so cite "Fonte: Assembleia da República".

### 1.3 Update frequency

* Catalogue text: *"A atualização dos dados abertos anteriores à legislatura atual é realizada com periodicidade mensal."* (earlier legislaturas: monthly).
* Current legislatura: not stated; observed `IniciativasXVII_json.txt` contained an "Entrada" event dated 2026-10-26 when downloaded on 2026-10-28 → refreshed within ~2 days (likely daily) *[frequency inferred, not documented]*.
* Responses carry **no `Last-Modified` / `ETag`**; only `Content-Length`. Change detection = size + content hash.

### 1.4 Datasets (all have one folder per legislatura, XML + JSON unless noted)

| Dataset (page) | File name pattern | Coverage stated | Notes |
|---|---|---|---|
| **Iniciativas** (`DAIniciativas.aspx`) | `Iniciativas<LEG>.xml`, `Iniciativas<LEG>_json.txt`, `Iniciativas.xsd`, "Definição da estrutura dos ficheiros" (PDF, Dec 2017) | II–XVII (actually I–XVII, I split into `IA`/`IB`; Constituinte folder empty) | Core dataset: initiatives + full event timeline + votes + committee docs |
| **Diplomas Aprovados** (`DADiplomasAprovados.aspx`) | `Diplomas<LEG>.xml/_json.txt`, `Diplomas.xsd` | I–XVII | Approved texts: Decretos da AR, Leis, Leis Orgânicas, Resoluções… **contains the DR publication** |
| Atividades (`DAatividades.aspx`) | `Atividades<LEG>` | II–XVII | Debates, audições, votos, moções… (votes on non-initiative items) |
| Agenda Parlamentar (`DABoletimInformativo.aspx`) | `AgendaParlamentar.xml/_json.txt` | current & future events | XV–XVII folders |
| Atividade dos Deputados (`DAatividadeDeputado.aspx`) | `AtividadeDeputado<LEG>` | Constituinte–XVII | per-deputy activity |
| Composição de Órgãos (`DAComposicaoOrgaos.aspx`) | `OrgaoComposicao<LEG>` | Constituinte–XVII | |
| Informação Base (`DAInformacaoBase.aspx`) | `InformacaoBase<LEG>` | Constituinte–XVII | legislatura dates, sessions, GPs, círculos, deputies (with GP history) |
| Registo Biográfico (`DARegistoBiografico.aspx`) | `RegistoBiografico<LEG>` | Constituinte–XVII | bios + registo de interesses |
| Intervenções (`DAIntervencoes.aspx`) | `Intervencoes<LEG>` | II–XVII | |
| Petições (`DAPeticoes.aspx`) | `Peticoes<LEG>` | I–XVII | |
| Perguntas e Requerimentos | `…<LEG>` | VI–XVII | |
| Orçamento do Estado (`DAOE.aspx`) | `OE2026Or.*`, `OEPropostasAlteracao2026Or.*` (+xsd, PDFs) | X–XVII | **Structured** OE amendment proposals |
| **DAR** (`DAdar.aspx`) | `DAR.xsd`, structure PDF (Jun 2023); per série folder (I, II-A…II-E, II-GOPOE, Revisão Constitucional, Separatas); closed legislaturas = one zip (`XVILegislatura.zip`), current = folder per Sessão/Número with `Número_NNN.json/.xml` | XI (2009)–XVII | Page-level text (HTML fragments), not article-structured |
| GPA, Cooperação, Delegações eventuais/permanentes, Reuniões/Visitas | | various | irrelevant here |

There is **no separate "Votações" dataset**: plenary/committee votes on initiatives are embedded in Iniciativas events; other votes are in Atividades.

### 1.5 Sizes (JSON, measured by download on 2026-10-28)

| Leg | Iniciativas JSON | Diplomas JSON |
|---|---|---|
| XVII | 101.3 MB | 2.1 MB |
| XVI | 66.5 MB | 1.4 MB |
| XV | 100.7 MB | 1.7 MB |
| XIV | 49.4 MB (XML 51.9 MB) | 3.6 MB |
| XIII | 114.9 MB | 7.1 MB |
| XII | 93.2 MB | 4.6 MB |
| XI | 28.7 MB | 1.7 MB |
| X | 44.6 MB | 3.1 MB |
| IX | 114.6 MB | 1.9 MB |
| VIII | 19.4 MB | 1.7 MB |
| VII | 39.3 MB | 2.2 MB |
| VI | 19.0 MB | 1.4 MB |
| V | 69.2 MB | 1.6 MB |
| IV | 9.8 MB | 0.5 MB |
| III | 1.9 MB | 0.9 MB |
| II | 4.6 MB | 0.4 MB |
| IA / IB | 5.1 / 2.8 MB | 0.9 / 0.2 MB |
| **Total** | **≈885 MB** | **≈37 MB** |

Each file is a single JSON array (no line breaks). DAR II-A zips: XVI 9.7 MB, XV 43.5 MB, XIV 63.5 MB, XIII 110 MB, XII 131 MB, XI 35 MB. Download speed ≈ 4 MB/s, ~25 s for the 100 MB files.

---

## 2. Iniciativas schema (downloaded: `IniciativasXVII_json.txt`, 2,354 initiatives)

Field names in JSON are PascalCase (`IniId`), while the official PDF spec uses camelCase (`iniId`) — the XML matches the JSON. Full path inventory with counts/examples: `schema_XVII.tsv` (346 paths).

### 2.1 Top level

| Field | Meaning | Example |
|---|---|---|
| `IniId` | internal unique id (unique across all 27,234 initiatives of all legislaturas) | `"315386"` |
| `IniLeg` / `IniSel` | legislatura / sessão legislativa | `"XVII"` / `"1"` |
| `IniNr` | number (per type, per legislatura) | `"16"` → "Proposta de Lei n.º 16/XVII/1.ª" |
| `IniTipo` / `IniDescTipo` | type code / label | `J` Projeto de Lei, `P` Proposta de Lei, `R` Projeto de Resolução, `S` Proposta de Resolução, `D` Projeto de Deliberação, `A` Apreciação Parlamentar, `I` Inquérito Parlamentar, `C` Projeto de Revisão Constitucional (+ `Ratificação` in old legs) |
| `IniTitulo` | title | |
| `IniAutorDeputados[]` | `{idCadastro, nome, GP}` | `{"GP":"L","idCadastro":"7356","nome":"Isabel Mendes Lopes"}` |
| `IniAutorGruposParlamentares[]` | `{GP}` | `{"GP":"L"}` |
| `IniAutorOutros` | `{nome, sigla, iniAutorComissao}` | `{"nome":"Governo","sigla":"V"}` (also ALRAA/ALRAM, cidadãos, comissões) |
| `IniLinkTexto` | link to the initiative text (docx/pdf/doc) | see §4 |
| `IniTextoSubst` / `IniTextoSubstCampo` | text replaced? (`SIM`/`NAO`) + note | `"Substituição do texto a pedido do autor em 2026-09-23."` |
| `IniAnexos[]` | `{anexoNome, anexoFich}` | `A.I.G` (avaliação de impacto de género) |
| `IniciativasOrigem[]`, `IniciativasOriginadas[]` | related initiatives | |
| `Peticoes[]`, `Links[]`, `IniciativasEuropeias` | | |
| `PropostasAlteracao[]` | `{id, autor, tipo, publicacao[]}` — **only populated in old legislaturas** (VII: 177, XII: 1, XVII: 0) | |
| `DataInicioleg` / `DataFimleg` | **misleading**: these are the dates of the *session*, not the legislatura (XVII shows 2025-06-03…2026-09-15) | |
| `IniObs` | free text | `"Iniciativa retirada a pedido do(s) autor(es) em 2025-07-04."` |

### 2.2 `IniEventos[]` (the "commit log" of an initiative)

| Field | Meaning |
|---|---|
| `EvtId` | event id **within** the initiative; NOT chronological |
| `OevId` | global event id |
| `CodigoFase` / `Fase` | phase code / label (144 distinct across all legislaturas, list in `all_fases.json`) |
| `DataFase` | date (YYYY-MM-DD) |
| `ObsFase` | free text (often decisive: "Texto Final, apresentado pela Comissão…", "Acórdão Tribunal Constitucional n.º 575/2014") |
| `Votacao[]` | `{id, data, resultado, unanime, detalhe, descricao, ausencias[], reuniao, tipoReuniao, publicacao[]}` |
| `Comissao[]` | committee stage: `{IdComissao, Nome, Competente, DataDistribuicao, Relatores[], Votacao[], Documentos[], PareceresRecebidos[], PedidosParecer[], Audicoes[], Audiencias[], Remessas[], DatainicioApreciacaoPublica…}` |
| `PublicacaoFase[]` | publication in DAR (or DR) of this step: `{pubTipo, pubTp, pubLeg, pubSL, pubNr, pubdt, pag[], supl, idPag, URLDiario}` |
| `AnexosFase[]` | `{anexoNome, anexoFich}` – nota de admissibilidade, projeto de decreto, sugestão de redação final, mensagem do PR (veto)… |
| `TextosAprovados` / `OevTextId` | **id of the resulting diploma in Diplomas Aprovados** (set on 350 Decreto, 580 Lei, 600 Resolução…) |
| `IniciativasConjuntas[]` | initiatives discussed/voted jointly |
| `Intervencoesdebates[]` | speakers, DAR page links, video links |
| `RecursoGP[]`, `RecursoDeputados[]` | appeals |

### 2.3 Phase codes relevant to the Git metaphor (counts = all legislaturas)

| Code | Fase | Git analogue |
|---|---|---|
| 10 | Entrada | PR opened |
| 20 / 30 | Admissão / Não admissão | triage |
| 21, 50 | Anúncio, Publicação (in DAR II-A) | PR published |
| 180/181 | Baixa comissão (distribuição inicial / para discussão) | assigned reviewers |
| 190 | Discussão generalidade | |
| 250 | Votação na generalidade | review round 1 |
| 270 | Baixa comissão especialidade | |
| 260 | Admissão Proposta de Alteração | suggested changes |
| 310 / 300 | Votação/Discussão na especialidade | |
| 320 | Votação final global | approve |
| 348 / 341 | Envio à Comissão para fixação da Redação final / dispensa | squash/edit |
| 350 | Decreto (Publicação) — `TextosAprovados` → Decreto da AR diploma (5,104) | merge candidate |
| 370 / 380 / 390 / 400 | Envio para promulgação / Promulgação / Referenda / Envio INCM | merge checks |
| 409 / 410 / 415 | Veto (Receção / Leitura / Publicação) | check failed |
| 430 | Acordão TC (nº/ano - Publicação DR) (64 events, IV–XIII) | TC check |
| 441, 511, 512, 519, 526… | Reapreciação, Votação novo decreto, Confirmação, Decreto (2ª versão), Promulgação (2ª versão) | re-run after veto |
| **580** | **Lei (Publicação DR)** — `TextosAprovados` → Lei diploma (5,008 events) | **merged commit** |
| 590 / 602 | Retificação à lei / Retificação (Publicação DR) | fixup commit |
| 600 / 601 | Resolução da AR / Regimento (Publicação DR) | |
| 648 / 649 | Retirada / Iniciativa Caducada | PR closed |

**Constitutional Court gap:** there is no event for the PR's *request* for preventive review (envio ao TC) nor the ruling date per se; only `430 Acordão TC` (with DR publication) and veto events whose `ObsFase` says e.g. "Acórdão Tribunal Constitucional n.º 296/2013". TC rulings must be enriched from the TC site/DR.

### 2.4 Real example (Proposta de Lei 16/XVII → Lei n.º 64/2025), trimmed

```json
{"IniId":"315386","IniLeg":"XVII","IniSel":"1","IniNr":"16","IniTipo":"P","IniDescTipo":"Proposta de Lei",
 "IniTitulo":"Altera o Código do Imposto sobre o Rendimento das Pessoas Coletivas, reduzindo as taxas gerais de IR…",
 "IniAutorOutros":{"nome":"Governo","sigla":"V","iniAutorComissao":null},
 "IniLinkTexto":"http://app.parlamento.pt/webutils/docs/doc.pdf?path=6148…&fich=6643e19d-ebe5-4377-a00e-e906a4f1d4be.docx&Inline=true",
 "IniEventos":[
  {"EvtId":"1","CodigoFase":"10","DataFase":"2025-07-18","Fase":"Entrada","OevId":"1629188"},
  {"EvtId":"13","CodigoFase":"250","DataFase":"2025-09-19","Fase":"Votação na generalidade",
   "Votacao":[{"id":"139604","data":"2025-09-19","resultado":"Aprovado","reuniao":"17","tipoReuniao":"RP",
     "detalhe":"A Favor: <I>PSD</I>, <I> CH</I>, <I> IL</I>, <I> CDS-PP</I>, <I> PAN</I>, <I> JPP</I><BR>Contra:<I>PS</I>, <I> L</I>, <I> PCP</I>"}]},
  {"EvtId":"18","CodigoFase":"320","DataFase":"2025-10-17","Fase":"Votação final global",
   "ObsFase":"Texto Final, apresentado pela Comissão de Orçamento, Finanças e Administração Pública, …",
   "Votacao":[{"id":"139953","resultado":"Aprovado","detalhe":"A Favor: <I>PSD</I>, … <BR>Contra:<I>PS</I>, <I> L</I>, <I> PCP</I>, <I> BE</I>"}]},
  {"EvtId":"31","CodigoFase":"350","DataFase":"2025-10-22","Fase":"Decreto (Publicação)","OevTextId":"105142","TextosAprovados":"105142"},
  {"EvtId":"23","CodigoFase":"370","DataFase":"2025-10-28","Fase":"Envio para promulgação"},
  {"EvtId":"24","CodigoFase":"380","DataFase":"2025-11-03","Fase":"Promulgação"},
  {"EvtId":"25","CodigoFase":"390","DataFase":"2025-11-05","Fase":"Referenda"},
  {"EvtId":"26","CodigoFase":"400","DataFase":"2025-11-06","Fase":"Envio INCM"},
  {"EvtId":"32","CodigoFase":"580","DataFase":"2025-11-07","Fase":"Lei (Publicação DR)","OevTextId":"105166","TextosAprovados":"105166"}]}
```

Committee-stage documents (inside the `270 Baixa comissão especialidade` and `348` events, `Comissao[].Documentos[]`):
`{"TipoDocumento":"Texto final","TituloDocumento":"Texto final","URL":"http://app.parlamento.pt/webutils/docs/doc.pdf?path=…"}`, `"Redação final"`, `"Proposta de alteração"`, `"Quadro comparativo"`, `"Texto de Substituição"`, `"Nota técnica"`, `"Relatório"`, `"Parecer"`.

### 2.5 Votes

* Party-level only, as an HTML-ish string: `"A Favor: <I>PSD</I>, <I> CH</I><BR>Contra:<I>PS</I><BR>Abstenção:<I>PCP</I>"`. Labels seen: `A Favor`, `Contra`, `Abstenção`, `Ausência`.
* Split party votes appear as `"<I>13-PS</I>"` (13 PS deputies) plus named dissenters `"<I> Pedro Delgado Alves (PS)</I>"`.
* `unanime: "unanime"` sometimes with empty `detalhe` (XVII: 2,285 votes, 302 without detalhe).
* No individual roll-call numbers (Portuguese plenary votes are by party "levantados/sentados"); seat counts must come from Informação Base/composition.
* Committee votes also present in `Comissao[].Votacao[]`.

---

## 3. Diplomas Aprovados — the bridge to Diário da República

`DiplomasXVII_json.txt`, 989 records. Fields: `Id`, `Legislatura`, `Sessao`, `AnoCivil`, `Tp`/`Tipo`, `Numero`, `Numero2`, `Versao`, `Titulo`, `LinkTexto`, `Observacoes`, `Iniciativas[]` (stub `{IniId, IniNr, IniTipo, IniLinkTexto}`), `Publicacao[]`, `Anexos[]`, `Actividades[]`.

Types over all legislaturas: Resolução da AR (A) 4,797; Resolução (R) 4,615; **Decreto da AR (D) 4,316; Lei (L) 4,085**; Deliberação (B) 477; **Lei Orgânica (O) 96; Lei Constitucional (C) 7**; Decreto Constitucional (E) 7; Regimento 11; Retificação 1.

Real example (Lei 64/2025):

```json
{"Id":"105166","Legislatura":"XVII","Sessao":"1","AnoCivil":"2025","Tp":"L","Tipo":"Lei","Numero":"64",
 "Titulo":"Altera o Código do Imposto sobre o Rendimento das Pessoas Coletivas, reduzindo as taxas gerais",
 "LinkTexto":"http://app.parlamento.pt/webutils/docs/doc.pdf?path=…&fich=b96c81e1-432b-4d9e-bdbb-9cf14836a632.pdf&Inline=true",
 "Iniciativas":[{"IniId":"315386","IniNr":"16","IniTipo":"P", "…":"…"}],
 "Publicacao":[{"pubTipo":"DR I série","pubTp":"M","pubNr":"216","pubdt":"2025-11-07","pubLeg":"XVII","pubSL":"1",
   "idPag":"1008552","URLDiario":"http://data.dre.pt/eli/diario/1/216/2025/0/pt/html"}]}
```

The corresponding Decreto da AR (`Id 105142`, `Tp D`, `Numero 14`) has `Publicacao` in `DAR II série A` n.º 86 Supl., `URLDiario: https://debates.parlamento.pt/catalogo/r3/dar/s2a/17/01/086S1/2025-10-22/2?pgs=2&org=PLC` and a `.docx` text.

### 3.1 Linkage fields to DR (verified)

1. **Iniciativa → Lei:** event `CodigoFase=580` → `TextosAprovados` (= `OevTextId`) = `Diplomas.Id`. Across all legislaturas: 5,008 580-events; 4,977 (99.4 %) resolve to a diploma in the same legislatura's Diplomas file (4,780 Lei, 150 Lei Orgânica, 46 Lei Constitucional); 26 point to ids not in that file; 5 have no id.
   Reverse direction: `Diplomas.Iniciativas[].IniId` (4,188 Leis: 3,398 with 1 initiative, 789 with 2+ (joint initiatives), 1 with none).
2. **Lei → DR:** `Diplomas.Tipo` + `Numero` + `AnoCivil` (= "Lei n.º 64/2025") and `Publicacao[]` with `pubTipo` = `DR I série` / `DR I série A` (1990s–2006), `pubNr`, `pubdt`, `supl`, and `URLDiario` = **issue-level ELI** `http://data.dre.pt/eli/diario/<serie>/<nr>/<year>/<supl>/pt/html` (series `1` or `1a`). 100 % of Leis with a DR publication use data.dre.pt URLs.
   * Issue-level ELI verified resolving (→ `https://diariodarepublica.pt/dr/detalhe/diario-republica/216-2025-944874406`, also for 1979 and 1999 issues).
   * **Act-level ELI is not given** but can be constructed: `https://data.dre.pt/eli/lei/64/2025/11/07/p/dre/pt/html` → `https://diariodarepublica.pt/dr/detalhe/lei/64-2025-944874408` (verified; also `lei/17/1999/03/25` OK). For `lei/75/1979/11/29` it redirected to `/dr/error` with HTTP 200 → old acts need lookup via DR search; check the final URL, not the status code.
3. **Lei text from AR:** `Diplomas.LinkTexto` for Leis is the **DR PDF itself** (Lei 64/2025: "1.ª série N.º 216 07-11-2025 … Lei n.º 64/2025, de 7 de novembro").
4. Veto/TC events: `PublicacaoFase` on 430 events points to `DR I série` issue (dates sometimes wrong: XII PPL 236 event 2014-09-03 vs pubdt 2013-09-03).
5. The 580 event itself normally has **no** `PublicacaoFase` (3 of 1,417 in VII/XII/IA; none in XVII) — always go through `TextosAprovados`.

---

## 4. Texts: structured or not?

* **No structured (article-level, XML/Akoma Ntoso) texts** of initiatives, texto de substituição, propostas de alteração, textos finais or decretos. All are binary documents behind `app.parlamento.pt/webutils/docs/doc.<ext>?path=<hex>&fich=<uuid>.<ext>`.
* The `path` is **hex(base64(internal SharePoint URL))**, e.g. → `https://arnet/sites/XVIILeg/DocumentosIniciativa/fe7c6537-….pdf` (internal host, not reachable).
* `http://` links 302 to `https://`. With `doc.pdf?` the server returns a **PDF rendering even when `fich` is .docx**; replacing `doc.pdf` with `doc.docx` returns the **original .docx** (verified: 71 KB Word 2007+ file). This is valuable: docx is far easier to parse than PDF.
* Formats of `IniLinkTexto` in XVII: docx 1,927, pdf 172, doc 148, missing 96.
* Availability of `IniLinkTexto` by legislatura: VIII–XII and XV–XVII 88–100 %; **XIII 27 %, XIV 31 %** (the website does show DOC/PDF links for those, e.g. Projeto de Resolução 592/XIV — open data just lacks them); **I–VII 0 %**.
* Proposals of amendment: since ~XII only as committee documents (`TipoDocumento: "Proposta de alteração"`, PDFs, often a bundle per party); old legislaturas list them in `PropostasAlteracao[]` with only DAR references. The only *structured* amendments are State Budget ones (`OEPropostasAlteracao<YYYY>Or.json`).
* DAR dataset (XI+): JSON per issue with `pages[].text` (HTML paragraphs per page), i.e. full text but not segmented into articles.

---

## 5. Coverage and gaps (all files downloaded and analysed; `coverage.txt`)

| Leg | Initiatives | Sessions present | Entrada range | PJL n/max | PPL n/max | Text link % | 580 events | Leis | Leis linked to an initiative in file |
|---|---|---|---|---|---|---|---|---|---|
| XVII | 2354 | 1,2 | 2025-06-03 → 2026-10-26 | 819/819 | 111/111 | 96 % | 136 | 108 | 108 |
| XVI | 1548 | 1 | 2024-03-26 → 2025-05-14 | 618/618 | 56/56 | 100 % | 101 | 81 | 81 |
| XV | 2167 | 1,2 | 2022-03-29 → 2024-03-25 | 999/999 | 113/113 | 100 % | 168 | 140 | 140 |
| **XIV** | 1574 | **2,3 only** | 2020-09-15 → 2022-03-28 | **529/1034** | **65/120** | 31 % | 192 | 217 | **120** |
| **XIII** | 3171 | **2,3,4 only** | 2016-09-15 → 2019-10-04 | **951/1248** | 182/209 | 27 % | 477 | 376 | **296** |
| XII | 3301 | 1–4 | 2011-06-20 → 2015-09-07 | 1050/1050 | 346/346 | 100 % | 536 | 465 | 453 |
| XI | 1445 | 1,2 | 2009-10-15 → 2011-04-06 | 624/624 | 60/60 | 100 % | 185 | 102 | 101 |
| X | 2073 | 1–4 | 2005-03-10 → 2009-09-18 | 910/911 | 299/299 | 99 % | 493 | 364 | 364 |
| IX | 1223 | 1–3 | 2002-04-05 → 2005-03-08 | 544/544 | 159/159 | 94 % | 306 | 240 | 237 |
| VIII | 1020 | 1–3 | 1999-10-25 → 2002-03-26 | 538/538 | 112/112 | 88 % | 289 | 192 | 192 |
| VII | 1462 | 1–4 | 1995-10-27 → 1999-09-30 | 693/693 | 288/288 | 0 % | 598 | 471 | 469 |
| VI | 1305 | 1–4 | 1991-11-04 → 1995-06-22 | 599/599 | 137/137 | 0 % | 360 | 273 | 273 |
| V | 1484 | 1–4 | 1987-08-13 → 1991-07-25 | 744/790 | 203/204 | 0 % | 479 | 406 | 373 |
| IV | 739 | 1,2 | 1985-11-04 → 1987-06-26 | 446/446 | 55/55 | 0 % | 161 | 88 | 88 |
| **III** | 282 | **2 only** | 1984-10-18 → 1985-10-17 | **156/542** | **32/119** | 0 % | 82 | 260 | **74** |
| II | 807 | 1–3 | 1980-11-26 → 1983-03-03 | 399/399 | 143/143 | 0 % | 113 | 95 | 95 |
| IA | 712 | 1–3 | 1976-11-23 → 1979-08-31 | 331/331 | 277/277 | 0 % | 283 | 265 | 265 |
| IB | 567 | 4 | 1980-01-10 → 1980-06-27 | 207/538 | 106/383 | 0 % | 49 | 45 | 45 |

Total: 27,234 initiatives; 4,188 Leis/Leis Orgânicas/Leis Constitucionais in Diplomas (all with a DR publication except 2).

Key gaps (as of 2026-10-28):
* **XIV session 1 (Oct 2019–Sep 2020), XIII session 1 (Oct 2015–Sep 2016) and III session 1 (1983–84) are missing** from Iniciativas (both JSON and XML for XIV). Confirmed real: Diplomas XIV references 837 IniIds absent from the Iniciativas file, and the website page `https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=45162` (PJR 592/XIV/1) exists. Diplomas Aprovados *is* complete for those sessions, so Lei→DR mapping still works; only the initiative/vote history is missing (would need scraping the DetalheIniciativa pages, `BID=<IniId>`).
* V: ~46 PJL numbers missing; IB numbering suggests partial *[cause not investigated]*.
* Constituinte folder of Iniciativas is empty; Constituinte–I only via other datasets.
* Text links: none before VIII; sparse in XIII/XIV.
* DAR open data only from XI (2009); the zip for XVI II-A is dated 2024-12-07 (stale vs. legislature end 2025).

---

## 6. Practical gotchas

* **Discovery by scraping only**; encrypted, per-render tokens; no index JSON, no `Last-Modified`/`ETag`.
* **HEAD on XML files hangs then returns "Empty reply from server"** (≥60 s); HEAD on JSON works (`Content-Length`). Range requests are ignored (full 200).
* One `Connection reset by peer` in ~1.3 GB of sequential downloads (retry succeeded). No 429s or explicit rate-limit headers seen with 1 s spacing. Be polite: sequential, retries with backoff.
* `robots.txt` → 404 on both www.parlamento.pt (SharePoint "PageNotFound" redirect) and app.parlamento.pt.
* Encoding: JSON is UTF-8 without BOM; **XML has a UTF-8 BOM**. Use `utf-8-sig` everywhere. XML root `ArrayOfPt_gov_ar_objectos_iniciativas_DetalhePesquisaIniciativasOut`, nested wrappers like `pt_gov_ar_objectos_iniciativas_AnexosOut`.
* Naming: JSON PascalCase top-level but camelCase nested (`IniAutorOutros.nome`, `Votacao[].detalhe`, `publicacao` vs `PublicacaoFase`); spec PDF uses camelCase throughout. Typos are baked in: `DataDistruibuicaoSubcomissao`, `Acordão`, anexo labels `Nota de Admissiblidade`/`Nota de admissibilidade`/`Nota de Admissibilidade`; document types `Redação final` (XVII) vs `Redacção final` (XII), `Infromação`; some `Fase` strings end with `\n`.
* Types: ids are strings in Iniciativas (`"7356"`) but floats in InformacaoBase (`"DepCadId": 9008.0`); `pag` is `null` or a list (`["3-19"]`, sometimes `["2-4", null]`).
* Sentinels: `DataAgendamentoPlenario: "0001-01-01T00:00:00"`.
* `EvtId` order ≠ chronology; sort by `DataFase` then `OevId`. Same-day steps (Decreto published after Promulgação in PPL 28/XVII: 370/380 on 10-17, 350 on 10-20) — dates can be inconsistent.
* `DataInicioleg`/`DataFimleg` are session dates.
* Votes are HTML strings; need a parser for `N-PARTY` and `Name (PARTY)` tokens.
* Joint initiatives: one Lei ↔ many initiatives; each gets its own 580 event.
* Schema is stable across legislaturas (same generator): only 4 extra paths in XIV/VII vs XVII; older legislaturas simply have more nulls (no Comissao, no text links, no detalhe).
* Old data quality: e.g. PublicacaoFase date mismatches; `Versao` of diplomas empty for old ones.

---

## 7. Third-party projects (brief)

* **fsmunoz/parlamentodb** (Python, FastAPI + DuckDB/Parquet, 2025–26, behind `https://api.votoaberto.org`): ETL from the same JSON files for last legislaturas (XIII–XVII); hard-codes the app.parlamento.pt URLs in `config.py`; has a `has_party_details` flag for vote completeness. Best reference for vote parsing. Client: ParlaTUI (codeberg.org/fsm/parlatui).
* **centraldedados/parlamento** ("Dados Abertos da Assembleia da República", Python, data-spec + scripts; related `parlamento-iniciativas-md` = initiatives as Markdown — closest in spirit to Git-for-law). README lists Hemiciclo (hemiciclo.pt), Demo.cratica (demo.cratica.org, code `ManufacturaInd/democratica2`, 2014–18, DAR transcripts), O Ponto do Parlamento, transparenciahackday `dar-scripts`.
* Newer small repos: `marcelogdomingues/parlamento-pt` (SDKs), `marcelogdomingues/iniciativas-digest`, `bernardoAlmeida25/portuguese-parliament-projects-data`, `vasco-branco06/portugal-politica-dados`, `duarteocarmo/assembleia` (analysis notebooks).
* None found that links AR initiatives to consolidated legislation history *[GitHub search only; READMEs read, code not reviewed]*.

---

## 8. Verdict: mapping initiative → events → DR publication

Feasible and well-keyed for VIII–XVII (and I–XII minus listed gaps):

1. Scrape `DAIniciativas.aspx` and `DADiplomasAprovados.aspx` folders → download `*_json.txt` per legislatura (≈920 MB total), store with content hash.
2. Build `initiative` (IniId, type, nr, leg, authors, text URL → rewrite to `doc.docx`/original extension) and `event` (OevId, CodigoFase, DataFase, ObsFase, votes, committee docs) tables. Sort events by date.
3. `event.CodigoFase in (350, 519, 530, 535)` → `TextosAprovados` → Decreto da AR (pre-promulgation text, docx) = "merge candidate". `580` → `TextosAprovados` → Lei diploma (99.4 % join).
4. Lei diploma → `Tipo`+`Numero`+`AnoCivil` + `Publicacao[pubTipo^=DR]` (`pubNr`, `pubdt`, `URLDiario` issue-ELI) → construct act ELI `https://data.dre.pt/eli/<lei|lei-organica|…>/<n>/<yyyy>/<mm>/<dd>/p/dre/pt/html` and confirm against the DR dataset (other agent) — that is the join key to the DR commit/amendment instructions.
5. Merge checks: 370/380/390 (promulgação/referenda), 409/410/415 + 441/511/512/519/526 (veto cycle), 430 + `ObsFase` regex `Acórdão.*Tribunal Constitucional n.º (\d+/\d{4})` (TC). TC *request* events are absent → enrich from TC/DR.
6. Fill gaps (XIII-1, XIV-1, III-1, text links in XIII/XIV, pre-VIII texts) by scraping `DetalheIniciativa.aspx?BID=<IniId>` or from the DAR II-A page texts; flag them as lower-confidence.

Main risks: no API/stable URLs; missing sessions; texts only as docx/pdf (no article structure, so "diffs" between initiative/texto final/decreto/lei need document parsing); party-level vote strings; TC review only partially modelled; old act-level ELIs may not resolve; Decreto Lei/Government decree-laws never pass through these datasets except as "Apreciação Parlamentar".
