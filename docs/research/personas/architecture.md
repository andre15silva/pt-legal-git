# Git para a Lei: core data model and pipeline

*Stakeholder panel: [LI] legal-informatics researcher · [HIST] Portuguese legal historian and constitutionalist · [ARCH] senior software architect.*

**Panel verdict:** Postgres holds the truth, as a bitemporal store of effects and unit versions. Git is a deterministic, reproducible export. Strategy C (hybrid) is the ingestion strategy. The MVP starts with the CRP and NRAU, not the Código Civil.

---

## 0. Grounding (what we checked)

- **legislation.gov.uk** keeps an *effects* register separate from the text. Each effect (insertion, substitution, repeal, plus non-textual effects such as "applied") is either **applied** (already in the revised text) or **unapplied**. A version is **prospective** when it is enacted but not yet commenced. The revised-text data model is version control of each section. We copy this split: effects are first-class rows, and text versions are derived from them.
- **Akoma Ntoso** puts `<activeModifications>`/`<passiveModifications>` in `<analysis>`. They contain `textualMod`, `forceMod`, `efficacyMod`, etc. Each has a `source`/`destination` plus optional `force`, `efficacy`, `application` and `duration`, with `<lifecycle>` eventRefs and `<temporalGroup>` intervals. AKN separates *force* from *efficacy*, and we keep that separation (see §2).
- **Archéo Lex / "La loi sous git"** turns the French LEGI consolidated database into Markdown and git. It publishes daily, and consolidated texts are the input. **legalize-es** does the same from the BOE consolidated API: Markdown, one commit per reform, about 8.6k to 12k laws. Both are consolidation-first (Strategy A) with no replay.
- **Lexifina (US Code)** replays amending instructions between official release points: 361 of 365 changes matched exactly. Its effective dates come from three sources (261 default, 72 notes, 29 explicit), and it leaves out what it cannot determine. Its admitted gap is retroactive reach, which our model has to solve.
- **PT ELI:** pillar I since 2016-12-19 and pillar II since 2017-07-27. It covers the 1.ª série **only from 1991-01-02**, with separate URI types for diário, act and consolidated text (e.g. `data.dre.pt/eli/lei/26/2006/06/30/p/dre/pt/html`). *Our probe:* the html/json/xml/rdf/ttl variants of the ELI URI for Lei 7/2009 all returned the same 2.3 KB OutSystems JS shell, so machine access depends on the SPA's internal endpoints.
- **Lei 74/98 (lei formulário)** has three rules we can use. Art. 6.º n.º 1 requires the amending act to state its **ordinal** ("procede à 7.ª alteração") and to list earlier amenders. Art. 6.º sets the republication trigger: more than 3 amendments or more than 20% of the articles, **except Codes**. Art. 5.º says a retificação takes effect from the rectified text's entrada em vigor. Default vacatio is the 5th day after publication. DR consolidated texts state that they have "**não tem valor legal**".
- **parlamento.pt open data** (IniciativasXVII.json, 2,354 initiatives): per-event `Votacao[]` gives `resultado`, `unanime` and a `detalhe` HTML of party positions. The `"Lei (Publicação DR)"` event has **no Lei number or ELI**, only `DataFase` and a `TextosAprovados` id. Linking an initiative to its diploma therefore needs matching.

## 1. Entity model

FRBR mapping [LI]: **Diploma** is the Work (`lei/7/2009`). **Versão** is an Expression of the whole diploma at a date (AKN `…/por@2023-05-01`). Markdown, AKN XML and the DR PDF are Manifestations. A commit or blob is an Item. Amending acts are Diplomas too, and their articles are the `source` of effects.

[HIST] Identity has to survive several things. The CRP renumbered extensively in 1982 and 1989. Republications sometimes renumber without saying so. "Revogado" articles keep their slot. So each **Unidade** is a *lineage* (UUID), and the label "5.º-A" is a versioned attribute.

```sql
create table agente (            -- órgão, partido, Governo, deputado, TC, PR
  id serial primary key, tipo text not null, nome text, sigla text,
  periodo daterange);           -- e.g. XXIII Governo, GP sigla changes
create table fonte (              -- every fetched blob, content-addressed
  sha256 bytea primary key, url text, obtido_em timestamptz, mime text);
create table diploma (            -- FRBR Work; amenders included
  id text primary key,            -- 'crp/1976','dl/47344/1966','lei/7/2009'
  tipo text, numero text, data_publicacao date, jornal text,  -- 'DR 1.ª série' | 'Diário do Governo'
  eli text unique,                -- null before 1991
  dr_id bigint, titulo text, emissor int references agente,
  e_codigo bool default false);   -- Lei 74/98 republication exemption
create table unidade (            -- lineage, stable across renumbering
  id uuid primary key, diploma_id text references diploma,
  tipo text check (tipo in ('parte','livro','titulo','capitulo','seccao','subseccao',
        'divisao','artigo','numero','alinea','subalinea','anexo','preambulo')));
create table unidade_versao (     -- bitemporal + efficacy
  id bigserial primary key, unidade_id uuid references unidade,
  pai_id uuid, ordem int[],       -- {5,1} for 5.º-A: sort key
  rotulo text, eid text,          -- '5.º-A', 'art_5-A__para_2__point_b'
  epigrafe text, texto text, tokens jsonb,   -- tokens with provenance (§5)
  estado text,                    -- vigente|revogado|suspenso|caducado|inconstitucional
  vigencia daterange not null,    -- valid time: wording in force
  eficacia daterange,             -- when it governs facts (null = = vigencia)
  tx_legal tstzrange not null,    -- knowledge: DR publication of the causing act
  tx_sistema tstzrange not null,  -- when *we* recorded it
  efeito_id bigint,
  exclude using gist (unidade_id with =, vigencia with &&, tx_sistema with &&));
create type efeito_tipo as enum ('substituicao','substituicao_expressao','aditamento',
  'revogacao','renumeracao','suspensao','caducidade','repristinacao',
  'inconstitucionalidade','retificacao','republicacao','prorrogacao');
create table efeito (             -- AKN textualMod/forceMod/efficacyMod
  id bigserial primary key,
  fonte_diploma text references diploma, fonte_eid text,   -- art_2 of the amender
  alvo_diploma text references diploma, alvo_unidade uuid, alvo_rotulo text,
  tipo efeito_tipo, texto_antigo text, texto_novo text,
  data_vigencia date, data_eficacia date, fim date,
  regra_data text,                -- explicita|supletiva_5dias|transitoria|condicional|desconhecida
  estado text,                    -- identificado|aplicado|verificado|divergente|prospectivo
  extracao text, confianca real,  -- 'regex'|'llm:<model>'|'manual'
  fonte_sha bytea references fonte, tx_sistema tstzrange);
create table verificacao (
  id bigserial, alvo_diploma text, data date, referencia text,  -- republicacao|consolidado_dr
  resultado text, n_unidades int, n_exatas int, diff jsonb, corrido_em timestamptz);
create table iniciativa (id bigint primary key, legislatura text, tipo text, numero int,
  titulo text, autores int[], diploma_resultante text references diploma, ligacao text);
create table votacao (id bigint primary key, iniciativa_id bigint, fase text, data date,
  resultado text, unanime bool);
create table voto_grupo (votacao_id bigint, agente_id int, sentido text);  -- favor|contra|abstencao|ausente
```

**Date semantics.** *Publicação* is always known. *Entrada em vigor* is either explicit or follows the default 5-day rule, and some cases are conditional (e.g. "com a regulamentação"). We store `regra_data='desconhecida'` and never guess, the same choice Lexifina made. *Produção de efeitos* is often retroactive (OE "a 1 de janeiro"). **Inconstitucionalidade com força obrigatória geral** (CRP art. 282.º) works *ex tunc* and **repristinates** the norms it had revoked. We model that as a derived `repristinacao` effect, and art. 282.º n.º 4 can limit its eficácia window.

## 2. Bitemporal (really tri-temporal) model

[LI] "Valid time" needs two axes because Portuguese law separates them. **Vigência** says which wording is in force. **Eficácia** says which wording governs facts that happened on date D. Knowledge time also needs two axes. **tx_legal** is when DR published the act, i.e. what a diligent lawyer could have known. **tx_sistema** is when we ingested or corrected it, for audit.

```sql
-- "text in force on D as known on K"
select v.rotulo, v.epigrafe, v.texto
from unidade_versao v join unidade u on u.id = v.unidade_id
where u.diploma_id = $diploma
  and vigencia @> $D::date and tx_legal @> $K::timestamptz
  and tx_sistema @> now()        -- our best current reading of that past knowledge
order by v.ordem;
-- "law applicable to facts of D": swap vigencia for coalesce(eficacia, vigencia)
```

- A **retificação** keeps `vigencia` and closes `tx_legal` on the erroneous row. A new row opens at the publication of the Declaração de Retificação.
- A **TC declaration** closes the norm's eficácia retroactively, opens the repristinated norm's rows, and sets `tx_legal` to the date the acórdão was published in DR.
- **Prospective** effects (published, vigência in the future) are ordinary rows with a future `vigencia`.

## 3. Git representation

**Git is an export, rebuilt deterministically from Postgres** [ARCH]. One monorepo `lei-pt`:

```
crp/1976/_diploma.yaml            # ELI, títulos, estrutura (ordering of units)
crp/1976/artigos/0007.md
codigo-trabalho/lei-7-2009/artigos/0005-A.md   # one file per article
codigo-civil/dl-47344-1966/artigos/1682-A.md
nrau/lei-6-2006/...
```

We use **one file per article**. `git log --follow` and `git mv` then express renumbering naturally, diffs stay short, and blame is per article. A revoked article keeps its file with `*(Revogado.)*`, the way DR consolidations show it. Readable full-text pages are a separate render target and are not stored in git.

**Commit = (ato modificador × distinct vigência date).** Lei 13/2023 with three entry dates becomes three commits marked `[1/3]`. One act that amends the Código Civil *and* the NRAU (e.g. Lei 31/2012) is one commit across both directories, which is the reason for a monorepo.

```
Lei n.º 13/2023, de 3 de abril — altera o Código do Trabalho [1/3]

Author:    Assembleia da República <ar@lei-pt>   date = vigência (2023-05-01)
Committer: git-para-a-lei <bot@lei-pt>            date = publicação DR (2023-04-03)
Diploma: lei/13/2023
ELI: https://data.dre.pt/eli/lei/13/2023/04/03/p/dre/pt/html
Vigencia: 2023-05-01   Eficacia: 2023-05-01   Regra-data: explicita
Alteracao-ordinal: <n.ª>   Iniciativa: <PPL n/XV>   Votacao: <data> <resultado> | Favor: … | Contra: …
Verificacao: exata-vs-consolidado-DR (412/415 artigos)
```

- **Pre-1970 dates:** the Código Civil (1966) and Diário do Governo material run into git's unreliable handling of negative timestamps, especially in hosting UIs. We clamp the header date to 1970-01-01 and keep the true date in trailers.
- **Retroactivity:** `main` contains only commits with vigência ≤ today, in vigência order. That keeps it almost append-only, because vigência can never come before publication. Retroactive *eficácia* lives in trailers and in the DB. Retificações and TC declarations become **forward commits** with a `Corrige-desde: 2023-05-01` trailer, which is honest about knowledge time. We never force-push `main`. A fully valid-time-pure reconstruction is regenerated as **`edicoes/2026-10-28`** refs, and each edition is a snapshot of knowledge time K.
- **Branches:** `prospectivo` is rebuilt daily as main plus published-but-not-yet-in-force effects. `iniciativas/XVII/PPL-16` holds a proposal's amending text applied to main. **It is never merged**, because the final text (texto final da comissão) differs from the proposal. The DR act's commit links back through `Iniciativa:`. An initiative that lapses at the end of a legislature is tagged and archived.
- **Tags:** `crp/rev-1982`, `crp/rev-1989`, `crp/rev-1992`, `crp/rev-1997`, `crp/rev-2001`, `crp/rev-2004`, `crp/rev-2005` [HIST: the 7 Leis Constitucionais], plus `republicacao/<diploma>/<data>` and `alteracao/<diploma>/<n>`.

## 4. Ingestion & verification: recommend **C (hybrid)**

- **A (DR consolidated per article as truth)** is fast, and it is how Archéo Lex and legalize-es work. But it is editorial and "sem valor legal", it often doesn't attribute which act changed what, and its coverage is uneven.
- **B (replay only)** gives attribution, but on its own it is fragile.
- **C** builds a hierarchy of evidence. In order: **republicação annex** (official, part of a published act) > **DR consolidated version** > **our replay**. Replay supplies *attribution, dates and explanation*. A and the republications supply *verification*.

Replay pipeline:

1. Segment each amending act's articles. Phrasing patterns include "O artigo 5.º … passa a ter a seguinte redação", "É aditado o artigo 5.º-A", "São revogados…", "No n.º 2…, a expressão «X» é substituída por «Y»" and "É republicado em anexo…".
2. Deterministic grammar first. An LLM is the fallback, and it emits *only* structured ops (`{tipo, alvo, rotulo, texto_ref}`).
3. **Hard invariant:** every inserted character must be a verbatim span of the source act, so the LLM selects text and never writes it. "[…]" placeholders in the nova redação mean the número or alínea is unchanged.
4. Apply the ops, then diff against the next reference point.

**Metrics** (published per diploma, Lexifina-style):

| Metric | MVP target |
|---|---|
| M1: version transitions reproduced exactly after normalization ("N of M") | ≥ 97% (Lexifina ≈ 98.9%) |
| M2: per-article exact match at each republication | ≥ 99% |
| M3: ordinal chain consistency (Lei 74/98 art. 6.º: "k.ª alteração" = k−1 known amenders) | 100%, or listed as a gap |
| M4: share of tokens attributed to a specific effect | ≥ 95% post-1991 |
| M5: date provenance mix (explícita / supletiva / desconhecida) | reported, never hidden |

A divergence is never auto-resolved. It goes to `estado='divergente'` with a diff and a human queue.

## 5. Text normalization & blame

The canonical form is a JSON tree with AKN-style eIds (`art_5-A__para_2__point_b__subpoint_ii`). Markdown and AKN XML are renders. Each article file has front-matter (`id`, `rotulo`, `epigrafe`, `estado`, `vigencia`) and **one número or alínea per line**, so line-based tools behave.

Normalization rules:
- Unicode NFC.
- `º`(U+00BA) vs `°`(U+00B0) → `º`.
- `n.º`/`n.o` variants unified.
- Dashes `1 -`/`1 –`/`1 —` → `1 —`.
- `«»` kept as the canonical quotes.
- Whitespace collapsed, hyphenation from PDF line breaks repaired.
- Tables (e.g. CIRS art. 68.º brackets) kept as structured cells, not text.

**Word-level blame lives in the DB, not git.** We tokenize words and punctuation, run a patience/Myers diff between consecutive versions *of the same lineage*, and carry `efeito_id` forward per token. Renumbering changes the label, not the lineage, so provenance survives. Tokens inside cross-references that a renumbering act updates are correctly blamed on that act. Baseline text predating our corpus is blamed on `original` (e.g. DL 47344 in 1966).

## 6. Scale (all **estimates**, to measure in Phase 0)

- DR 1.ª série: roughly 2.5k to 4k acts per year, so about 150k to 200k acts since 1976.
- Normative diplomas still in force: roughly 10k to 20k.
- DR-consolidated diplomas: low thousands.
- MVP corpus:
  - CRP: 8 versions.
  - Código do Trabalho: about 25 to 35 amenders.
  - Código Civil: about 80 to 100+ amenders and about 2,300 articles.
  - CIRS: 100+ amenders, since nearly every OE touches it.
  - NRAU: about 10.
  - In total, under 50k `unidade_versao` rows. The full corpus is a few million rows, which Postgres handles without trouble.
- Git: about 0.5M article files across the full corpus. A monorepo with sparse checkout works for that. Shard by tipo only if clones become painful.

## 7. Roadmap & risks

| Phase | Scope |
|---|---|
| **0** (3 wks) | Source reconnaissance: DR SPA endpoints, consolidated per-article version coverage, ELI consolidated URI pattern, initiative↔Lei matching rate. |
| **1 MVP** | **CRP** (small, exact replay, showcases renumbering and tags). **NRAU + Código Civil arrendamento articles** (cross-diploma commits). **Código do Trabalho** (Lei 7/2009, rich effect dates). Then **CIRS** (OE churn, retroactive eficácia, tables). The **full Código Civil** comes last: pre-1991, no ELI, Diário do Governo, needs OCR. Publish M1–M5. |
| **2** | Parlamento: initiatives, votes per GP, initiative branches, trailer links. |
| **3** | All DR-consolidated diplomas; Strategy A for non-replayed ones (labelled "sem atribuição"). |
| **4** | AKN export with `passiveModifications`, ELI point-in-time API, "as known on K" UI. |

**Top risks**

1. **Source access:** an OutSystems SPA with undocumented endpoints (ELI content negotiation returned only a shell). Rate limits and changes can break ingestion. Mitigate with a content-addressed `fonte` cache and request INCM bulk access.
2. **Instruction long tail:** substitutions of expressions, "com as necessárias adaptações", annex and table amendments, implicit revocations ("revoga as normas contrárias"). The last cannot be applied mechanically and has to be flagged.
3. **Date semantics:** conditional and transitional entry into force, and retroactive eficácia. Use explicit `desconhecida`, never a silent default.
4. **Identity under silent renumbering** in republications. Use similarity-based lineage matching with human confirmation.
5. **Initiative↔diploma linkage:** the open data has no Lei number. Match on title, dates and DAR decreto number, and target at least 95% with review.
6. **Authority and liability:** both our output and the DR consolidation are non-binding. Every line must link to the DR act, and the UI must say so.
7. **TC effects and repristination** interact with everything. Model them in the DB from day one, even if the MVP UI shows them only as annotations.
8. **Git limits:** pre-1970 timestamps, and history rewrite temptation. Rules: `main` is never rewritten, and editions are separate refs.

---
Sources: [legislation.gov.uk changes](https://www.legislation.gov.uk/changes/affecting/ukpga/2014/5) · [Cornell LII on legislation.gov.uk](https://blog.law.cornell.edu/voxpop/?p=260) · [AKN textualMod spec](https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part2-specs/os-part2-specs_xsd_Element_textualMod.html) · [AKN Part 2](https://docs.oasis-open.org/legaldocml/akn-core/v1.0/akn-core-v1.0-part2-specs.html) · [AKN metadata tutorial](https://diff.parlamento.ai/docs/akn/metadata) · [La loi sous git](https://www.data.gouv.fr/datasets/la-loi-sous-git) · [Archéo Lex](https://www.data.gouv.fr/reuses/archeo-lex-histoire-de-la-loi-francaise) · [legalize-es (Xataka)](https://www.xataka.com/aplicaciones/alguien-ha-cogido-12-000-leyes-espanolas-ha-pasado-a-codigo-fuente-autentica-joya-para-buscar-legislacion) · [Lexifina](https://lexifina.com/blog/git-for-the-us-code) · [EUR-Lex ELI Portugal](https://eur-lex.europa.eu/eli-register/portugal.html?locale=es) · [DR ELI page](https://diariodarepublica.pt/dr/geral/ligacoes-interesse/identificador-europeu-legislacao-eli) · [Lei 42/2007](https://diariodarepublica.pt/dr/detalhe/lei/42-2007-640909) · [Lei 43/2014](https://diariodarepublica.pt/dr/detalhe/lei/43-2014-25345900) · [Lei 74/98](https://diariodarepublica.pt/dr/detalhe/lei/74-1998-234316)
