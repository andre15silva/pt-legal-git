# Quem fez cada alteração: method

How the site names the people behind each act: the Government, the Prime Minister, the parties in
the Government, the President of the Republic, and the parliamentary groups that proposed a law.
The pipeline writes facts and reason codes. The app writes the sentences. Shapes: design spec §2 and
[`pipeline/contrato.py`](../pipeline/contrato.py). Code: [`pipeline/quem.py`](../pipeline/quem.py),
[`pipeline/assinaturas.py`](../pipeline/assinaturas.py), [`pipeline/passagem.py`](../pipeline/passagem.py).

## 1. Sources

| Fact | Source | File |
|---|---|---|
| Date of the Council of Ministers, President, promulgation, countersignature | The signature block at the end of each act, in the Diário da República (DR) | `pipeline/assinaturas.json` (seed, committed), `data/assinaturas.json` (daily cache) |
| Governments: posse, Prime Minister, parties | DR decrees that appoint the Prime Minister; «Tomada de posse» pages of the Government's historical archive (historico.portugal.gov.pt) | `pipeline/governos.json` |
| Presidents: start and end | presidencia.pt (one page per President), and the sources named in each row | `pipeline/presidentes.json` |
| Parliamentary groups: siglas and names per legislatura | AR open data, `InformacaoBase<leg>` | read at build time |
| Which siglas are one party | CNE party pages (PPD → PPD/PSD in 1976; CDS → CDS-PP by Acórdão 282/93) | `pipeline/grupos.json` |
| Initiatives, votes, events | AR open data, `Iniciativas<leg>` and `Diplomas<leg>` | read at build time |

Every row of the three hand-made tables has a source URL and a `consultado_em` date. A fact without a
source is `null`, never a guess: the parties of Governments XVII to XXV are `null` because no official
page we could read states them (the archive does not, and the current portal loads its content with
JavaScript). The app then leaves the sentence out.

## 2. The signature block

```
Visto e aprovado em Conselho de Ministros de 16 de Julho de 2003. - José Manuel Durão Barroso - …
Promulgado em 6 de Agosto de 2003.
Publique-se.
O Presidente da República, JORGE SAMPAIO.
Referendado em 8 de Agosto de 2003.
O Primeiro-Ministro, José Manuel Durão Barroso.
```

`assinaturas.py` fetches each act once (`fetch.cached("act", tipo, key)`, the key taken from the act's
DR link) and keeps only the fields it reads, never the text. It reads the **first** block: a
republication annex follows the block and holds the original act's block. It accepts «1.º de …»,
capitalised months, «Promulgado em Castanheira de Pêra em …», «Conselho Ministros», a missing final
period, initials in names («Maria da Assunção A. Esteves»), «Pelo Primeiro-Ministro, …» and «O
Primeiro-Ministro, em exercício, …» (both `referenda_por_outro`), and «O Presidente da República
Interino, …» (`presidente_interino`).

**Order check.** `d_cm ≤ d_aprovacao_ar ≤ d_promulgacao ≤ d_referenda ≤ publicacao`, and `d_cm` not
more than two years before publication. When dates are out of order, the date with the most
conflicts is marked `suspeito`; on a tie, both are. A suspect date is not used: the fact becomes
`null` with the code `conflito`. Measured: 3 acts (Lei 24/2012, Lei 71/93, Lei 8/2022 — a year typo
in the referenda).

**Coverage** (2026-10-30, 1054 acts): 352 of 356 decretos-leis have a dated Council of Ministers (the
other 4, from 1976–1977, print «Visto e aprovado em Conselho de Ministros.» with no date); 539 of 542
laws have a promulgation date and a President (Lei 18/90's DR text has no block; Lei 45/85 was
printed without promulgation; Lei 24/2012 has two dates out of order).

**Transitional norms** (finding 17): the act's own articles — outside quoted amendments «…» and before
the block — whose heading says «transitória» or «Aplicação no tempo» (Lei Orgânica n.º 1/2026, art.
7.º, has no other).

The seed is written by `python -I pipeline/assinaturas.py --semente` (seed ∪ cache). The daily job runs
`assinaturas.py` without options: it fetches only acts that are in neither file or that had a network
error, and exits 0 on network errors. After a change to the parser, `--reler` reads every act again
from the response cache.

## 3. Matching an act to a Government and a President

Table intervals are half-open, `[inicio, fim)`: the day of a posse belongs to the new holder.

- **Decreto-lei:** the Government in office on `d_cm`. Without `d_cm`, no Government: the timeline puts
  the act in «publicados sem data do Conselho de Ministros» of the period of its publication.
- **Lei:** no Government. The Government of a Proposta de Lei is the one in office on the initiative's
  «Entrada» date (`proponentes[].governo`).
- **President:** the name in the block, checked against the President in office on `d_promulgacao`
  (never on publication: Decreto-Lei n.º 79/2026 was promulgated by the previous President). Without
  a block date: the AR's promulgation date and the table's name (`base: "parlamento"`).
- **Acts before 25 April 1976:** no Government, no President (`antes_1976`); the signatories as printed.
  Acts between 25 April 1976 and the I Government's posse: `antes_governo_constitucional`.

**Cross-check (R-13).** Names are compared after folding case and accents, against `nomes_dr`:
(a) the President on `d_promulgacao`; (b) the Prime Minister on `d_referenda`, unless the
countersignature is by someone else; (c) the first signatory of the Council of Ministers against the
Prime Minister on `d_cm` (a warning only: a minister often signs first); (d) the AR promulgation date
against the block (the block wins). A conflict in a closed row makes the fact `null` with `conflito`;
in the open row, `tabela_aberta`. **Measured on all 1054 blocks: 0 conflicts.** Decretos-leis
approved within 14 days of a posse between two Governments with the same Prime Minister are listed
(`mesmo_pm`), because names cannot tell those Governments apart.

## 4. The timeline of a diploma (`quem/<slug>.json`)

Every Government (and every legislatura) from the one in office when the diploma was published,
including empty periods. Inside each period, four lists in date order: decretos-leis of that
Government; laws whose every initiative is a Proposta de Lei of a Government; laws from deputies'
initiatives or committee texts; decretos-leis without a Council of Ministers date. A law belongs to
the period of the vote that decided it: the last reappreciation after a veto, else the final global
vote, else its publication. Constitutional revisions, court rulings, acts before 1976 and other
diplomas are listed apart. Retificações fold under the act they correct. The NRAU timeline counts only
the NRAU's own articles, not its annex copy of the Código Civil.

## 5. Parliamentary groups

The sigla shown is the one of the AR file of the vote's legislatura (by the vote's date): «CDS» up to
V, «CDS-PP» from VI; «PPD» in the Constituinte and IA. Grouping uses a stable id from
`grupos.json` families (`psd`, `cds-pp`); any other sigla's id is its slug. A group page lists the
initiatives of the group that became a law of the site («propria» or «juntada» into a committee text)
and the group's position in each generalidade vote, by diploma. No counts, no percentages.

## 6. Known gaps

- Parties of Governments XVII–XXV: `null` (see §1).
- Gestão periods (`em_gestao`): empty. We found no DR or AR source for their start dates this round, so
  the «Governo demitido» note (R-24) is not shown.
- Governments III, IV and V: the DR published the Prime Minister's appointment one day before the
  Government's posse given by the archive; we use the posse.
- Government VI: the Prime Minister died on 4 December 1980; the archive does not name who replaced him
  until the VII Government's posse.
- One decreto-lei (328/81) was promulgated by the interim President; its record names him with
  `interino: true` and no table id.
- **Order of redações when entry into force and publication disagree.** Redações are ordered by entry
  into force. The DR's version list is cumulative in publication order. When an act published later
  entered into force earlier (Lei n.º 56/2023 and Lei n.º 53/2023 on the Lei de Estrangeiros, art.
  77.º), the last redação by entry into force is not the DR's newest text. About ten articles are like
  this (2026-10-30). The R-2 test skips them; retificações are never ordered by their own date.
- **DR entries without an act.** A few version entries in the DR name no act (25 in the Código dos
  Contratos Públicos, 2 in the Código das Sociedades Comerciais, art. 95.º); the build cannot attribute
  them and leaves them out.

