# Practitioner Panel: "Git para a Lei"

**Panel:** (A) litigation advogada, mid-size Lisbon firm · (J) juiz de direito, tribunal judicial de comarca · (S) solicitador doing registos, contratos, inventários.

**Shared premise:** the DRE says it plainly: *"A versão consolidada não tem valor legal e não substitui a consulta dos atos que deram origem a esta consolidação."* Only the electronic DR is authoritative (*faz fé plena* since 1 July 2006). The product does not have to replace that. It has to get us from a date to the right redação to the original diploma faster than DRE consolidada, PGDL or an Almedina code. PGDL's version lists lag behind and have no point-in-time view. DRE consolidada splits versions per article, but the dates it shows mix publication and vigência. Printed codes are out of date as soon as they ship.

## 1. Jobs-to-be-done, ranked

1. **Find the redação applicable on a date of facts (all three).** *"The despedimento was on 14 March 2019 and the action was filed in 2024. Which redação of art. 351.º CT applied, and is the Lei 13/2023 version (published 3 April, in force 1 May 2023) relevant at all? Lei 7/2009 art. 7.º has transitional rules for pre-existing contracts. Do they reach this case?"* The answer has to come back as a redação, the act that set it, its início de vigência, and any transitional norm that overrides the default (art. 12.º CC).
2. **Find the regime mais favorável in criminal or contraordenacional matters (J, A).** Art. 2.º, n.º 4, CP and art. 29.º, n.º 4, CRP. The court compares every redação in force between the facts and the judgment, not just two of them. This needs a diff across *all* intermediate versions.
3. **Apply procedural law to pending cases (A, J).** *"The action was pending on 1 Sept 2013. Do the CPC/2013 rules on prova apply?"* Lei 41/2013 arts. 5.º–7.º set them out case by case. Procedural law usually applies immediately, but the transitional norms decide this one.
4. **Draft a citation (A, S).** *"art. 1682.º-A, n.º 1, alínea a), do Código Civil, na redação dada pela Lei n.º X/AAAA, de dd de mês."* It must be copy-paste correct, including the "de [data]" of the amending act.
5. **Check for alerts and changes since a date (A, S).** *"What changed in the Código do Notariado / Código do Registo Predial since my template was last checked?"*
6. **Trace legislative history for interpretation (J, A).** Art. 9.º CC's elemento histórico: Proposta de Lei, votação na generalidade/especialidade, exposição de motivos, all linked from the amended article.
7. **Count limitation periods across suspensions (A, J).** COVID-era suspensions of prazos (Lei 1-A/2020 and its successors *[exact production-of-effects dates to verify]*) changed when deadlines ran out. The panel wants a timeline, not a single text.

## 2. Must-have features and what each view shows

**Date picker.** Make the user pick which date is meant. "Em vigor em" is the default. "Publicado até" and "Produzia efeitos em" are the alternatives. The three are different:

| Date | Source | Example |
|---|---|---|
| Publicação | DR issue date (incl. suplementos "-A") | Lei 13/2023: 3 Apr 2023 |
| Entrada em vigor | Article in the act, or vacatio legis by default: 5.º dia (15.º Açores/Madeira, 30.º estrangeiro) counted from the day after publication (Lei 74/98, art. 2.º) | 1 May 2023 |
| Produção de efeitos | Can be earlier (retroactive) or later than entry into force | Orçamento laws back to 1 January *[verify per year]* |

**Article view, per article and at the level of each número and alínea:**
- Text as of date X. Each fragment is coloured by its *ato modificativo*. Hovering shows the act, the article of that act that did the amending, the publication date and the vigência date.
- Status badges: Em vigor · Revogado (with the revoking norm) · Aditado em · Ainda não em vigor (published, with vacatio pending) · Suspenso · Declarado inconstitucional (FOG) · Retificado.
- Transitional-law panel: every norma transitória in an amending act that names this article or its diploma, quoted in full, with a flag that says "pode afastar a aplicação desta redação".
- Version ribbon: every redação of the article with its vigência interval [início, fim[. Gaps and overlaps are shown in red.

**Comparar redações.** A diff between any two dates, or across all redações between two dates (job 2).

**Ato view (the "commit").** The original DR PDF/ELI link. The list of articles it alters, adds or revokes. Its entry-into-force clause, parsed and quoted next to the computed date. Any declaração de retificação. The parliamentary initiative and its votes.

**Timeline per diploma.** Republicações are marked. They are snapshots, not changes.

## 3. Trust and liability

**What makes us rely on it:**
- Every computed fact links back to the DR source text that justifies it. Example: "Entrada em vigor 1-05-2023 ← art. [entrada em vigor] da Lei 13/2023 [quote]". If the date came from the 5-day default rule, say so explicitly.
- Each version gets a provenance label: *Confirmado contra republicação oficial* / *Reconstruído (algoritmo)* / *Revisto por humano* / *Não verificado*. A "não verificado" state is shown in amber at the article level, not buried in a footer.
- A reconciliation badge: "coincide com a versão consolidada DRE de dd/mm" or "diverge — ver diferenças".
- Any open question is shown as a question. For example, implied repeal (*revogação tácita*, art. 7.º, n.º 2, CC) is never auto-asserted. It appears as "possível revogação tácita — juízo do intérprete".

**What makes us distrust it:**
- One wrong date on a well-known article, e.g. the CPC/2013 start date. (J): "I see one error in a sentença-critical date and I never open it again."
- Silent smoothing over ambiguity.
- Any LLM-written "resumo" presented next to the norm as if it carried authority.

**Disclaimer.** Short, permanent, in Portuguese: *"Texto sem valor legal. Fonte autêntica: Diário da República (edição eletrónica)."* No twelve-paragraph liability wall.

**Citation export.** Two formats, chosen with a toggle:
- Forensic format: *"artigo 351.º, n.º 1, do Código do Trabalho, aprovado pela Lei n.º 7/2009, de 12 de fevereiro, na redação dada pela Lei n.º 13/2023, de 3 de abril"*.
- Full list format: *"…com as alterações introduzidas por…"*.

Both carry an access date and a permalink to that exact version (ELI + date).

## 4. Edge cases the data model must handle

1. **Vacatio legis computation**, including different start dates for the Açores, Madeira and abroad, and "distribuição efetiva" if it came later than publication.
2. **Partial or staggered entry into force.** One act, several dates. Some norms wait for regulamentação. *Lei 7/2009 art. 14.º, uncertain.*
3. **Retroactive production of effects**, kept separate from entry into force. *Budget laws; COVID chain Lei 1-A/2020 → 4-A/2020 → 16/2020, uncertain on exact dates.*
4. **Normas transitórias in the amending act, not in the code.** *Lei 41/2013 arts. 5.º–7.º; Lei 7/2009 art. 7.º.*
5. **Leis interpretativas** (art. 13.º CC). These become part of the law they interpret. Blame has to show "texto de 2023, sentido fixado desde 2009".
6. **Declarações de retificação** (Lei 74/98, art. 5.º). They correct the original text, normally with effect from its date *[confirm current wording of art. 5.º]*. Model them as an amend-in-place with a visible flag, not as a new redação.
7. **Inconstitucionalidade com força obrigatória geral** (art. 282.º CRP).
   - Default effect is ex tunc, with **repristinação** of the norm that was revoked.
   - n.º 3 protects caso julgado.
   - n.º 4 lets the Court limit the effects. *Ac. TC 413/2014: effects of the art. 33.º (OE2014) declaration limited to the date of the decision, per panel recollection.*
   - The model needs a "text resurrected by judgment" event.
8. **Republicação.** A snapshot that must match the reconstructed text. Any difference is a data bug or a hidden retificação.
9. **Cessação de vigência of decretos-leis** after apreciação parlamentar (art. 169.º CRP). Also suspensions.
10. **Caducidade** of temporary laws, e.g. pandemic regimes, without any express repeal.
11. **Renumbering and aditamentos** ("7.º-A", "1682.º-A"). Articles kept as "(Revogado)" placeholders. Whole-code replacement: CPC 1961 → CPC 2013 changed article numbers, so remissões in other diplomas break.
12. **Diploma preambular vs. anexo.** A Code is approved by a DL or a Lei with the code in an annex. Amendments target either one.
13. **Suplementos and lettered numbers** (Lei 1-A/2020).
14. **Regional legislation** (Decretos Legislativos Regionais) that overrides national regimes territorially.
15. **Remissões dinâmicas vs. estáticas** to other diplomas. Flag them; do not resolve them automatically.

## 5. Anti-features

- A "current law" answer with no date stamp.
- Anything that looks like the DR. Phrases such as "oficial" or "versão autêntica" are forbidden.
- AI summaries or "o que isto significa" placed inline with the norm text.
- A paywalled point-in-time view. The DR is free, so the point-in-time view has to be free too. Charge for alerts, team workspaces and export instead.
- Git jargon in the main path.
- Blame colours with no legend, or more than about eight distinct colours per article.
- Showing parliamentary drafts (projetos) as if they were law, unless they are clearly separated as "iniciativa pendente".
- A mobile-first design that hides the article numbering hierarchy (n.º / alínea / subalínea).

## 6. Terminology

**Use:** redação (preferred over "versão" for an article; "versão" for the whole diploma) · em vigor / em vigor desde / vigência · entrada em vigor · produção de efeitos · publicação · vacatio legis · revogado / revogação (expressa) · aditado · alterado · republicado · retificado / declaração de retificação · norma transitória · repristinação · declarado inconstitucional com força obrigatória geral · ato modificativo / diploma alterador · "na redação dada por" · "com as alterações introduzidas por" · histórico de redações · comparar redações.

**Git metaphors:** translate them in the UI and keep the git terms only in an "API/dados" layer for developers.

| Git | UI label |
|---|---|
| commit | alteração / ato modificativo |
| blame | origem do texto / autoria da redação |
| diff | comparar redações |
| log | histórico |
| tag | republicação |
| revert | (avoid: repristinação is not a revert) |

**Branches:** never expose them. The one valid "branch" is alternative readings, e.g. FOG effects pending or revogação tácita disputed. Show these as *"leituras alternativas"* with sources.

The tagline "Git para a Lei" is fine for marketing. A juiz will not click "commit".

---
Sources: [Lei 74/98 (vLex)](https://vlex.pt/vid/lei-n-74-98-1034385449) · [DRE consolidada disclaimer](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2006-160585689) · [DRE ajuda](https://diariodarepublica.pt/dr/geral/ajuda) · [Ac. TC 413/14 (vLex)](https://vlex.pt/vid/acordao-n-413-14-1043996912) · [Provedor de Justiça on art. 282.º effects](https://www.provedor-jus.pt/documentos/R_5055_09.pdf)
