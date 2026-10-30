# Passagem no Parlamento: who proposed, who changed and who voted each text

**Goal.** For each change to an article, and where the data allows for each phrase, show:

- who proposed the law;
- which propostas de alteração changed the text in Parliament, and who proposed them;
- how each parliamentary group voted at each stage (a favor, contra, abstenção).

This is the parliamentary layer of "origem do texto" (git blame). We never call it "culpa" or "autoria" (see [ESTILO.md](ESTILO.md)).

The plan merges five reviews made on 2026-10-28:

- what the Assembleia da República (AR) data contains, tested on Lei n.º 64/2025, Lei n.º 56/2023, Lei n.º 13/2023 and the constitutional revisions;
- the legislative process and an attribution method;
- related work in other countries;
- the product design;
- the visual system.

A mock with real votes is in [`design/passagem/`](../design/passagem/).

## 1. What the data can support

| Item | Source | Granularity | Coverage | Status |
|---|---|---|---|---|
| Who proposed the initiative | Iniciativas: `IniAutorOutros` (Governo, ALRA), `IniAutorGruposParlamentares`, `IniAutorDeputados` | Group or deputy | I–XVII. Sessions XIII-1, XIV-1 and III-1 are missing | Structured |
| Votes on generalidade, votação final global (VFG), confirmação and avocações | `IniEventos[].Votacao[]`: `detalhe`, `descricao`, `unanime`, `ausencias` | Per group. Named dissenters. Deputy counts on electronic votes ("119-PS") | I–XVII (`detalhe` in about 90 %) | Structured |
| Votes in the especialidade plenary, per proposal | `descricao` names the proposal, its author, the operation and the provision ("Proposta 30P, apresentada pelo PS, de emenda do n.º 1 ao artigo 112.º") | Per provision | All legislaturas, but only the votes taken in the plenary | Structured text, needs parsing |
| Especialidade votes in committee | "Relatório/Resultado/Guião da votação na especialidade" (PDF) in the committee documents | Per número/alínea, per proposal, per group | XII onward, about 60–80 % of laws (XIII and XIV fewer). Before XII, almost none | PDF in three layouts (X grid, "Favor PSD + CH" lists, prose). Some are scans |
| Amendment documents | Committee documents "Proposta de alteração", with the group in the title ("C17 - Proposta de Alteração - PSD") | One document per group batch | XII onward | PDF. Author reliable, content hard to parse |
| Amendments to the State Budget (OE) | `OEPropostasAlteracao<ano>` | Per alínea/número/artigo, with authors and votes per group | Each OE year (OE 2025: 2,162 proposals, 2,074 with votes) | Structured. The text is only in the linked PDF |
| Texts across the process | Initial text, texto de substituição, texto final, projeto de decreto (DOCX, with the redação final edits highlighted), decreto da AR (DOCX), the law (DR) | Whole document | XII onward, fairly complete | DOCX is good. PDF is fair |
| Seats per group on a given date | InformacaoBase `Deputados[].DepSituacao` and `DepGP` | Deputy → group, by date | All legislaturas | Structured. Checked exactly against a plenary guião (2023-09-22) |
| Individual deputies' votes | Not published, except named dissenters and the rare votação nominal in the Diário da Assembleia da República (DAR) | — | — | Not available |
| Decretos-leis | No parliamentary vote. Possible links: the lei de autorização legislativa, the apreciação parlamentar (`IniTipo=A`), and "Visto e aprovado em Conselho de Ministros de …" in the decree | — | — | Structured links, plus decree text |

**The AR records have errors.** One example: PCP proposal 5P on art. 112.º of the Código do Trabalho is recorded as "Aprovado". PS, PSD and CDS-PP voted against it, and PS had an absolute majority. In the 2005 revision, one copy of a record reads "Favor: 180" and another reads "Contra: 180". So every result must pass an arithmetic check against the seats on the day of the vote before we show it.

**No one else does this.** No Portuguese project, and almost no project anywhere, links the wording in force to the amendment that produced it and to the votes on that amendment. La Fabrique de la Loi (France) came closest and never linked votes. Portuguese projects (api.votoaberto.org, oparlamento.pt, votoavoto.pt, parlamento-aberto) work at the level of the vote or the initiative.

## 2. Attribution method

We trace a phrase in force back through the process. Only the tokens that actually changed get a new origin.

1. **Phrase → amending act.** This is what "Origem do texto" already does. When a law restates text without changing it, the text keeps its older origin. This rule matters most for fairness. Moved and renumbered text keeps its origin too.
2. **Act → initiative(s).** Use the official link from Diplomas Aprovados to the initiative (IniId), plus initiatives discussed together.
   - A decreto-lei stops at "O Governo aprovou este decreto-lei. O Parlamento não votou este texto." Then add the lei de autorização or the apreciação parlamentar as context, never as a vote on the text.
   - A declaração de retificação is recorded as such. The trace continues to the voted text.
3. **Map the provision across the parliamentary texts.** Build a correspondence table for each article:
   - published law
   - decreto
   - redação final
   - texto final (its own numbering, often "Anexo")
   - texto de substituição
   - initial text(s)
4. **Find where the text came from.** It is the last approved step on the path to the law that introduced the exact normalised text:
   - the initial text of an initiative (several initiatives with the same text are co-origins);
   - an approved proposta de alteração, in committee, by avocação or in a reapreciação after a veto;
   - the committee, "a partir de" the initiatives, when no proposal matches;
   - the redação final (formal edits; flag any substantive edit for review).

   A rejected proposal with the same wording is a "proposta semelhante", never the origin.
5. **Votes.** Attach the vote on the smallest voted unit that holds the span. Then add as context: the VFG of the whole text, the generalidade vote of each initiative (on its original text), and the confirmation after a veto when there was one.

**Confidence.** Always show it as words, never as colour alone.

- **Origem verificada:** the act→initiative link is official, the span matches an approved text exactly (after normalisation), and the recorded vote names that proposal or provision and passes the arithmetic check.
- **Origem provável:** one link is heuristic. Examples: a fuzzy text match, a vote shared by several articles, or a numbering map we built.
- **Origem não identificada:** the source texts are missing (before XII, missing sessions, scans not yet read) or the chain breaks.

Show the deepest verified level first. Never raise a level. Never fill a gap with the VFG. A result that contradicts the seats is shown with a warning, never silently.

## 3. How votes are shown

- **Which vote by default.** For a phrase: the vote on its provision ("Votação deste número"), with the VFG next to it ("Votação do diploma inteiro"). The generalidade vote is on demand, labelled "sobre o texto inicial da iniciativa". When one vote covered several articles: "Nota: esta votação incluiu outros artigos."
- **Order of groups.** Use the AR's protocol order for that legislatura (by number of deputies at its start), the same in every view of the legislatura. It is the source's own convention, so it is not our ranking. Never sort by sentido, result or count. A note says: "Ordem dos grupos: a da Assembleia da República nesta legislatura."
- **Layout and colour.**
  - No colour.
  - Three rows in the AR's order: A favor, Contra, Abstenção. A row with no groups reads "nenhum grupo".
  - Groups recorded as absent: "Ausente". Groups missing from the record: "sem registo".
  - Non-inscribed deputies get their own rows.
- **No group tallies.** "6 grupos a favor" weighs a group of one deputy the same as a group of 120.
- **Deputy counts.** Show them only when the record has them ("Votaram 208 de 230 deputados"). The seats on that date are available on demand.
- **Dissent.** It goes in the group's line: "PS: a favor · 5 deputados contra". Name deputies only when the record names them.
- **Unanimity.** "Aprovado por unanimidade." Also list the absent groups. Never infer that all groups voted a favor.
- **Required majority** when it is not a simple majority. Confirmation after a veto: "maioria absoluta: 116 de 230". Constitutional revision: "dois terços dos deputados em funções".
- **The Government is not a party.** Write "Governo (XXV Governo Constitucional)". The governing party appears only through its own votes.
- **Outcome words** come from the record: Aprovado, Rejeitado, Prejudicado, Confirmado. Never "chumbado", "vencedores" or "derrotados".
- **No aggregates.** No scores per party, no "% of the changes", no charts by party, no profiles of deputies. Any count by proponent becomes a ranking.

## 4. Where it appears

All entry points lead to one component, **Passagem no Parlamento**. Its address is `#/ato/<id>#passagem`, and `?artigo=<diploma>/<artigo>` marks the steps that concern one article.

- **The phrase popover (Origem do texto).** Below "Escrito por …", a short block "No Parlamento", about 8 lines at most:
  - "Proposta de Lei n.º 16/XVII, do Governo. O Parlamento não mudou este número." or "A proposta de alteração do BE ao n.º 3 escreveu este texto. Aprovada a …"
  - The confidence in words.
  - The vote on the provision and the VFG.
  - "Ver a passagem no Parlamento".
- **The register.** An expanded row gets one serif line: "Proposta de Lei n.º 16/XVII, do Governo. Aprovada a 17 de outubro de 2025." Then the links.
- **The act page.** After the dates comes the section "Passagem no Parlamento":
  - **Lede.** One fact per sentence. Example: "O Governo apresentou a Proposta de Lei n.º 71/XV. O Parlamento aprovou o texto final da comissão. O Presidente da República vetou o decreto. O Parlamento confirmou o decreto e o Presidente promulgou-o."
  - **Ruled list of steps.** Each step has a date in a tabular serif column, then its name, its result, one or two sentences and its votes:
    - Iniciativa
    - Votação na generalidade
    - Especialidade (with the amendments by author, and the avocações)
    - Votação final global
    - Redação final
    - Veto / Reapreciação / Confirmação, when they happened
    - Promulgação
    - Publicação
    - Entrada em vigor

    Steps without votes take one muted line. Steps for the chosen article have a verde inset rule.
  - "Comparar a proposta com a lei publicada": a redline of the initial text against the final text for that article. It also shows text that Parliament removed.
  - "Votações por grupo parlamentar": a matrix with groups as rows, stages as columns, and words in the cells.
- **The diploma page.** "Iniciativas que alteraram este diploma", listed by date. Each row has the act, the initiative, who proposed it and the VFG on one line. A filter "Proponente ▾" lists groups alphabetically, with no counts.
- **The text itself.** A phrase that Parliament added to the initiative gets a dotted underline in the same act colour. The margin note gets a second muted line, "mudado no Parlamento". Party names never appear in the margin, only in the popover next to the votes.
- **Phone.** The popover becomes a bottom sheet. The passage stacks the date above each step. The matrix scrolls inside its own frame, with the group column fixed.
- **Every claim cites its source and date:** "Fonte: Assembleia da República, dados abertos. Consultado a 28/10/2026". Each span has "Reportar um erro", answered within 72 h, with a public log of corrections (see the plan).

## 5. Plan

**Step 1. Structured data only (S–M).** Built on 2026-10-28.

*Decision on 2026-10-28: the UI shows only the votação na generalidade for now.* The act page, the initiative page, the register and the Origem do texto popover show who proposed the text and how each group voted on it na generalidade. `passagem.json` still holds every step and vote for later.

*Committee texts.* When the committee replaces the initiatives with a "texto de substituição", the AR records the vote on that text under every initiative it replaces. One initiative can feed two texts that became two laws: the Projeto de Lei n.º 847/XIII is in both Lei n.º 12/2019 and Lei n.º 13/2019. So the pipeline keeps apart:
- each initiative's own generalidade vote, or "baixou à comissão sem votação";
- the committee text votes. A committee text belongs to an act when the initiatives its description names match the act's initiatives best (Jaccard index).

The act page shows the committee text vote first, when there is one, because that is the text that became law. Then it shows one row per initiative, with one column per group. The proposing group is in bold.

*Result:* `pipeline/passagem.py` writes `app/data/passagem.json`. It has 56 passages for the corpus acts. Of 329 votes with group positions, 320 pass the seat check, 8 cannot be checked, and 1 fails. The failure is a real record error: in Lei n.º 7/2009, the PCP proposal 5P is recorded as "Aprovado" with 22 votes for and 208 against. The act page shows the Atenção line under that vote.


*Pipeline:*
- Emit `votacoes` and `passagem` per act. Each vote carries: stage, date, description, positions per group, counts, dissent, `ausencias` (dropped today), unanimity and source.
- Get the dated composition of each group from InformacaoBase, and add the protocol order per legislatura.
- Arithmetic check of each result against the seats. Store the check, and flag a failed one.
- Keep author types apart from authors: today `autores` mixes "BE" with "Grupos Parlamentares".
- Parse `descricao` into proposal, author, operation (emenda, substituição, aditamento, eliminação), provision and base text.

*UI:*
- The Passagem section on the act page (lede, steps, VFG and generalidade votes, the especialidade votes from the plenary, the matrix).
- The line in the register.
- The VFG in the popover, labelled "Votação do diploma inteiro".
- The decretos-leis sentence.

*Every corpus act* (Lei n.º 64/2025, Lei n.º 56/2023, Lei n.º 13/2023, the CRP revisions) gets confidence "verificada" at act level.

**Step 2. Pilot with the State Budget (M).**
- Load `OEPropostasAlteracao` for the OE laws in the corpus. The CIRC changes almost every year through the OE: Lei n.º 45-A/2024 wrote the 20 % rate in art. 87.º.
- Normalise each target ("alínea c) do n.º 2 do artigo 87.º do Código do IRC") to (diploma, article, número, alínea).
- Join to the redações by provision and act, and compare the provision before and after.
- Show: "A proposta de alteração n.º … do PSD escreveu este número. Aprovada na especialidade a … (A favor: …)". The confidence is "verificada" when the provision matches and the change is exactly that provision. Otherwise it is "provável".

**Step 3. Committee documents, legislatura XII onward (L).**
- Fetch the especialidade voting reports, the amendment PDFs, the texto final, the projeto de decreto (DOCX) and the initial texts. That is a few thousand files, 5–10 GB, downloaded slowly and cached.
- Parse the voting reports in three layouts:
  - X grids: pdfplumber tables.
  - Lists: regular expressions on "Votação da proposta de {operação} do {grupo} … – {resultado}".
  - Prose: a language model extracts the votes, and the result is checked against the group list and the seats.
  - Scans need OCR.
- Text diffs per provision from the initial text through the texto final and the decreto to the law. DOCX numbering must be rebuilt from Word's numbering.
- Attribute each surviving change to the approved proposal that targets that provision. Otherwise attribute it to the committee or to the redação final.
- Then: phrase-level marks in the text, the "mudado no Parlamento" margin line, and "Comparar a proposta com a lei publicada".

**Step 4. Older legislaturas and the constitutional revisions (L).** Scrape the DAR for especialidade votes before XII. Use the Comissão Eventual votes for revisions where the DAR has them (DAR RC open data starts at XI). Until then, revisions show their projects, the per-article plenary votes where structured (2005), and the VFG.

## 6. Risks and how we handle them

- **Misattribution** (the worst case, with a defamation risk).
  - The confidence levels, the arithmetic check, a cited source on every claim, "Reportar um erro" and a public corrections log.
  - Write "segundo o registo da Assembleia da República".
  - Never write "X escreveu" for texts by a committee, the Government or a regional assembly.
- **Cherry-picking.** Every view shows all groups present and the absent ones, and the same phases for every phrase. Share cards always carry the phase, date, confidence and source, and never show one party alone.
- **Equal depth for every party.** Measure parsing quality per party and per alias (PPD/PSD = PSD, CDS = CDS-PP, Ninsc). A parser that misses one party's dissent is a neutrality failure.
- **GDPR.** Deputies' votes are personal data about political opinion, made public by the data subjects in office (GDPR art. 9(2)(e), with art. 6(1)(e)). Show only what the AR publishes, with the source. No profiles or aggregates per deputy. Correct to the official record on request.
- **"No vote" is a fact, not missing data.** Say it for decretos-leis, for redação final and for retificações.
- **The sources go away.** VoteWatch closed. demo.cratica.org now points to an unrelated site. Cache every source document with its hash and download date.

## 7. Labels (pt-PT, PTS)

**Section and step names**
- Passagem no Parlamento · No Parlamento · Ver a passagem no Parlamento
- Iniciativa · Votação na generalidade · Especialidade · Votação final global · Redação final · Veto · Confirmação do decreto · Promulgação · Publicação · Entrada em vigor · Aprovação em Conselho de Ministros

**Votes**
- Votação deste número · Votação do diploma inteiro
- A favor · Contra · Abstenção · Ausente · sem registo · nenhum grupo · por unanimidade · deputados que votaram

**Where a text came from**
- Proposta de alteração do … · texto da comissão · mudado no Parlamento
- «Esta frase já existia. A Lei n.º … repetiu o texto sem o alterar.»
- «O Governo aprovou este decreto-lei. O Parlamento não votou este texto.»
- «A comissão mudou o texto na redação final. Esta fase não tem votação.»

**Confidence and sources**
- Origem verificada · Origem provável · Origem não identificada · Como sabemos isto · Reportar um erro
- «Atenção: o resultado registado não corresponde aos votos registados. Consulte o Diário da Assembleia da República.»
- «Não temos o registo desta votação.» · «Não temos as votações da comissão.»

**Never:** culpa, autoria, blame, vencedores, derrotados, chumbado.

## 8. Which votes and events belong to this law (round 3)

One initiative can produce several decrees and several laws. Proposta de Lei n.º 1/XVII produced the
Lei Orgânica n.º 1/2026 (Lei da Nacionalidade) and a Código Penal text; both texts were voted on the
same days. `passagem.py` keeps only what belongs to the act, in four steps, and lists what it drops in
`descartados` (shown in `#/verificacao`):

1. **The act's decree.** In `Diplomas<leg>`, the «Decreto da Assembleia da República» records of the
   law's initiatives whose title equals the law's title (case, accents and punctuation folded). The
   latest is `decreto.numero`; earlier ones (before a veto) go to `anteriores`.
2. **Events.** `ObsFase` names decrees: «Decreto n.º 17/XVII», «Decretos n.ºs 95/XV, 96/XV», «Decretos
   n.º 97, 102 e 112/XV», «Decreto da Assembleia da República n.º 49/XVII/1.ª». An event that names
   one of this act's decrees stays; one that names only other decrees goes (`outro_decreto`); one that
   names none stays unless the initiatives have another law's decree. «Lei (Publicação DR)» stays only
   within one day of the DR publication date. Anything dated more than a day after publication goes
   (`depois_da_publicacao`). The veto keeps the Tribunal Constitucional ruling its note names
   («Acórdão do Tribunal Constitucional n.º 1133/2025»).
3. **Votes.** A committee text belongs to the act whose initiatives it cites best. On a tie (both texts
   of LO 1/2026 cite only PPL 1/XVII), the text whose description names the amended diploma or the
   law's title wins, and a text that names another decree's title loses. The final global vote
   follows the same rule. «Votação novo decreto» and «Confirmação do decreto» follow their event's note
   (decree number, or the quoted title). If the rule cannot decide, the vote is not shown
   (`voto_ambiguo`).
4. **Duplicates.** The AR records one vote under every initiative it covers, sometimes with other ids
   and punctuation (Lei n.º 3/2019). Votes with the same date, cited initiatives and positions are one.

**Step order.** The kept steps must satisfy VFG ≤ veto ≤ reapreciação ≤ promulgação ≤ publicação
(especialidade is not checked: LO 1/2026 has it the day before the generalidade). Otherwise the dated
steps are dropped and `motivos.passos = passos_descartados`. After the cascade, no act has steps out
of order (2026-10-30).

**Absences and siglas.** «Ausência: CDS, PEV, Carlos Macedo (Indep)» is a section of its own: the groups
go to `ausentes`, the named deputy is left out (an absence is not dissent), and absent groups are not
«sem registo». Every sigla is the one of the AR file of the legislatura of the vote's date (see
[QUEM.md](QUEM.md) §5); each vote carries its `legislatura`.

**Legislatura I** has two AR files (IA, IB); both are read for the laws of legislatura I.
