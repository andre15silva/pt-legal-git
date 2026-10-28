# Git para a Lei: legislative-side stakeholder panel

**Panel:** (a) an assessor jurídico to a parliamentary group at the AR, (b) a legislative drafter at a ministry or the PCM, (c) a deputy preparing amendments.
**Verdict:** We would use this every week, on one condition. It has to treat **the article and its numbers and alíneas as the unit**, and **time as two-dimensional**. Repo-per-diploma git is the wrong backend. It is a good vocabulary for the UI.

## 1. Jobs to be done (ranked)

1. **Get the law-formulary right.** *Persona (b), daily.* Under art. 6.º/1 of Lei n.º 74/98 (as amended by Lei n.º 42/2007), every amending act must state its *número de ordem* ("procede à 7.ª alteração ao Decreto-Lei n.º X") and list every prior amending diploma. Today we count by hand from DRE. Two diplomas published weeks apart regularly both claim to be "the 5.ª alteração". We need an authoritative list of alterations and the next free número de ordem, with a warning when another pending act already claims it.
2. **State of the code before I propose anything.** *Persona (c), and (a) for the deputy.* Show art. 5.º as it stands today, with per-number authorship ("n.º 3 introduced by Lei n.º 13/2023, alínea c) by DL n.º 41/2024"). Overlay **every pending initiative** that touches it.
3. **Concurrent-initiative conflicts.** *Persona (a), at every agendamento.* Three projetos de lei (PS, CH, IL) and one proposta de lei all rewrite art. 5.º/2 of the same lei. They are discussed jointly and will be merged into a texto de substituição. Show which numbers overlap, which ones collide textually, and which ones are compatible.
4. **Norma revogatória and remissões.** *Persona (b).* Before revoking art. 12.º, list everything that cites it: remissões in other diplomas, portarias regulamentares made under it, regional adaptation decrees (DLR Açores/Madeira) and transposition links to EU directives. Separate static remissões from dynamic ones.
5. **Republicação annex.** *Persona (b), and the comissão services.* Compute whether art. 6.º/3 of Lei 74/98 triggers republicação: more than 3 alterations (Códigos are excepted) or more than 20% of the articulado amended. Generate the consolidated annex in DR style, with "[Revogado]" placeholders kept and the numbering untouched.
6. **What does art. X look like if Projeto de Lei n.º Y/XVII passes?** *Persona (c).* Show it alone, combined with other projetos, and as the texto de substituição. Every such view must be watermarked as a simulation.
7. **Pre-admission checks.** *Persona (a).*
   - Lei-travão (art. 167.º/2 CRP, art. 120.º/2 Regimento; the brief's "/3" should be /2) flags projetos that raise expenditure or cut revenue in the current budget year. It must parse the vigência clause, because the standard workaround is "produz efeitos com o OE subsequente".
   - Art. 167.º/4 bars renewing a definitively rejected initiative in the same sessão legislativa.
   - Matters of reserva absoluta or relativa (arts. 164.º and 165.º) need their own flags.

## 2. How well the git metaphor maps

| Git | Portuguese law | Fit |
|---|---|---|
| merged commit | publication in DR 1.ª série | Good, but publication ≠ eficácia (see below) |
| branch / PR | Projeto or Proposta de Lei | Good |
| commits on the branch | propostas de alteração, texto de substituição, redação final | Good |
| reviews | generalidade → especialidade (comissão, with possible avocação) → votação final global | Good. Votes are per party, not per reviewer. |
| merge checks | promulgação or veto (art. 136.º), fiscalização preventiva (arts. 278.º–279.º), referenda ministerial | Good. A veto is "changes requested"; the AR can override by confirmation. |
| merge conflict | concurrent initiatives on the same article | Excellent, and the killer feature |
| stale branch deleted | caducidade at the end of the legislatura; propostas lapse when the Government is dismissed | Good. Make it explicit, because two early dissolutions killed hundreds of branches. |
| tags | legislaturas, republicações, OE years | Good |
| `commit --amend` | Declaração de Retificação (art. 5.º of Lei 74/98) | Fair. It is an amendment with retroactive effect to the original date. |
| cherry-pick | a proposta de alteração copying another group's projeto into the texto de substituição | Only as an attribution trail |

**Where it breaks:**

- **Omnibus acts.** One Lei do Orçamento amends 30+ diplomas: the Código do IRS, the EBF, the IVA code, and more. This is one atomic changeset across many "repos", and it often carries **autorizações legislativas** too. Repo-per-diploma cannot express that atomicity.
- **Publication ≠ entry into force ≠ produção de efeitos.** There is vacatio legis (default 5 days under art. 2.º of Lei 74/98), there are norms with staggered dates, and there is "efeitos retroativos a 1 de janeiro". Git has one timestamp per commit, and we need at least two.
- **Revert is wrong for unconstitutionality.** A declaração com força obrigatória geral (arts. 281.º–282.º CRP) is ex tunc and **repristinates** the norms it had revoked, unless the TC restricts the effects (282.º/4). That is a rewrite of what was valid on past dates, not a forward commit. The same applies to cessação de vigência after **apreciação parlamentar** (art. 169.º CRP). There the AR has 30 days after a DL's publication to cancel it or amend it, and can suspend it in the meantime: a post-merge review that can revert.
- **Autorizações legislativas (art. 165.º/2–5).** These are delegated write permissions with scope (objeto, sentido, extensão), an expiry date, and single use (partial use is allowed). They lapse with the legislatura or the Government. A DL autorizado must cite its lei de autorização. Model them as a scoped, expiring token and run a check of the DL against that scope.
- **Regional legislation.** DLRs apply only in one region, can adapt national law, and the Constitution requires audição of the regional organs (art. 229.º/2). Model this as a jurisdiction overlay, not a fork.
- **Codes.** The code is an annex to an approving diploma. Alterations are counted against the code, and the codes are exempt from the republicação threshold.
- **Lacunar "amending instructions".** "É aditado o artigo 7.º-A", "os n.os 3 a 5 passam a 4 a 6". Renumbering breaks line-based diffs.

**The right model:** a **bitemporal norm graph**. Each node is a stable unit: diploma › artigo › número › alínea, with an ELI-style ID that survives renumbering. Each **amending act is a changeset** of typed operations (substitui / adita / revoga / renumera / republica), and each operation carries its own `data_publicação`, `início_vigência` and `produção_efeitos`. **Invalidation events** come from the TC, from cessação under art. 169.º and from caducidade, and they can retro-modify valid time. Pending initiatives are **draft changesets** against a base snapshot, and texto de substituição versions stack on top of them. Keep git words in the UI (diff, branch, conflito, histórico) but **not** in the data model.

## 3. Must-have features for law in the making

- **Pending overlay** on any article: badges for each initiative that touches it, with phase, proponent and comissão.
- **Simulation:** "apply PJL Y" or "apply PJL Y + Z" or "apply the texto de substituição v3", shown as a redline against the law in force.
- **Conflict matrix per article:** initiatives × numbers/alíneas, with a cell for overlap and textual divergence.
- **Process timeline:** entrada → admissão → baixa à comissão → nota técnica → generalidade → especialidade (each proposta de alteração and its fate) → VFG → decreto da AR → PR (promulgação, veto, TC) → DR → vigência. Deadlines appear on the timeline: the 30-day apreciação window, autorização expiry, the transposition deadline.
- **Vote breakdown per party, per vote:** generalidade, each especialidade vote by article, and VFG. Show deputies who broke ranks and link the declarações de voto.
- **Formulary assistant:** next número de ordem, the list of prior alterations, the republicação trigger, and validation of the title and art. 1.º (objeto).
- **Reverse dependencies:** remissões, regulamentação, DLRs and directives.
- **Watch article / diploma:** alerts on new initiatives, propostas de alteração and publication.

## 4. Data and where it lives

- **parlamento.pt Dados Abertos** (XML/JSON, per legislatura):
  - *Iniciativas* (II Leg. onward) holds events and phases, authors, comissão, and links to texts.
  - *Atividades* holds the other parliamentary activities.
  - *DAR* covers the I and II series from the XI Leg. onward.
  - *Informação Base* holds deputies, GPs and legislaturas.
  - *Agenda* holds current and future events.
  - **Uncertain:** votes do not seem to be a separate dataset. Results appear inside the iniciativa events as semi-structured text ("A Favor: …; Contra: …"), which needs parsing and validation. Older legislaturas update monthly.
- **The biggest gap:** **propostas de alteração and especialidade guiões** are mostly PDFs or DOCX on comissão and iniciativa pages, not structured data. The texto de substituição and texto final are in PDF. The decreto da AR is in the DAR II-A. Expect OCR, parsing and human QA. This is where the product earns its value.
- **Diário da República:** the 1.ª série (acts, retificações, TC acórdãos with força obrigatória geral) and legislação consolidada. DL n.º 83/2016 opened consolidated text as reusable open data. **Uncertain:** I could not confirm a documented public API or bulk dump. Plan for scraping, ELI URIs where present, and an INCM partnership.
- **Others:** TC acórdãos (tribunalconstitucional.pt), Presidência (vetos and their messages), the ALRAs (regional), EUR-Lex (directives), and UTAIL "Custa Quanto?" impact assessments (RCM n.º 74/2018 extended them to propostas de lei).

## 5. Output formats we would actually use

- **Quadro comparativo (DOCX first, PDF second)** with columns lei em vigor | PJL A | PJL B | PPL | propostas de alteração | texto de substituição. The comissão services and GP assessors build these by hand today. Make them editable, because they are working documents.
- **Guião de votações** for the especialidade, generated from the conflict matrix.
- **Republicação annex** in DR layout (DOCX), ready to append to the decreto.
- **Tabela de correspondência** (old ↔ new numbering) for codes and renumberings.
- **Redline PDF** and a **"blame" print** for briefing a deputy before a plenary.
- **Stable links** (ELI / DR permalinks) that we can paste into notas técnicas and pareceres.

## 6. Pitfalls and political sensitivity

- **Authorship is contested.** A texto de substituição belongs to the **comissão**, not to a party. Attribute adopted text to the proposta de alteração and its proponent, and show "baseado em PJL A, B" without collapsing it to one party. Propostas de lei belong to the **Government** (or to an ALR), not to the governing parties. Projetos are signed by named deputies or by the GP; keep both.
- **Words matter.** Rename "blame" to "origem" or "autoria". Do not label rejected initiatives "closed/failed", use the procedural status. Do not score parties ("effectiveness", "conflict rate") and do not predict passage.
- **Simulations must never look official.** Watermark every simulated or consolidated view as "texto não oficial; só faz fé a publicação no DR". A screenshot of a "what if" text circulating as the "approved law" is a real reputational risk.
- **Equal treatment.** The same data depth for every GP and every deputado único representante. Monitor parsing errors per party, because systematically misparsing one party's votes is a scandal, not a bug.
- **Timing.** Especialidade votes move fast and the DAR lags. Show "última atualização" and the source for every datum.
- **Regional and Government drafts:** pre-Conselho de Ministros drafts are confidential, so persona (b) needs a private workspace that never touches the public layer.

*Uncertainty flags:* the vote data structure, whether a DR bulk API exists, the exact current legística annex to the Regimento do Conselho de Ministros (I did not verify it), and any post-2014 amendments to Lei 74/98.
