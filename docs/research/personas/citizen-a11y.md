# Stakeholder panel: citizens, students, accessibility and plain language

**Panel:** (a) **Rita**, 34, a tenant in Almada with a 1-year-old child, on a smartphone. (b) **Tomás**, a 2.º-ano student at FDUL in Direito Constitucional and Teoria da Lei. (c) An **accessibility/UX specialist** who works to WCAG 2.2 AA, DL 83/2018 and the acessibilidade.gov.pt *selo*. (d) A **linguagem clara** specialist.

**Shared verdict:** git is how the product works inside. Users should never see it. Nobody on this panel says "commit", "blame" or "diff". The interface should talk about *versões*, *alterações*, *quem escreveu isto* and *a história da lei*.

---

## 1. Jobs-to-be-done (ranked)

1. **"What does the law say *today* about my situation?"** Rita gets a letter on 3 March saying her rent is going up. She needs the article in force on the day the letter arrived, not the 2006 original text. **Must-have:** the current version shown by default, plus a "Em vigor desde…" badge on every article.
2. **"What changed, and does it affect me?"** Rita heard on the news that the leave rules "mudaram". She needs a 3-line summary of the change, its *start date*, and *who it applies to*, e.g. "children born after 1 May 2023" after the Agenda do Trabalho Digno (Lei 13/2023).
3. **"What was the law on date X?"** A contract was signed in 2018 and a dispute came up in 2025. Lawyers and students ask this every day, and citizens ask it whenever a contract is involved. **Must-have:** a date picker with plain wording: "Ver a lei como estava em…".
4. **"What is coming?"** Pending bills (*projetos/propostas de lei*) on the same topic: "Há 3 propostas em discussão no Parlamento que alteram este artigo." Show the stage as a simple progress bar (Entrada → Generalidade → Especialidade → Votação final → Promulgação → Publicação).
5. **"Who wrote this sentence, and why?"** (Tomás). He needs to trace a phrase in art. 1083.º CC back to Lei 6/2006 or Lei 31/2012, and from there to the preamble or *exposição de motivos*.
6. **"Teach me how the law evolved"** (Tomás): constitutional revisions, sources and hierarchy of norms, and how *republicação* works.

---

## 2. Making diffs, blame and timelines understandable

- **Use the "track changes" metaphor, not git.** People already know Word's *Controlo de alterações*, so the default view is **inline**: added text is underlined, removed text is struck through, both in the flow of the sentence. Offer side-by-side ("Antes | Depois") only on screens ≥1024px, and as an opt-in.
- **Encode each change twice.** Use colour **and** a non-colour cue:
  - Added text: blue tint, solid underline, and a "+" glyph in the margin.
  - Removed text: orange/vermilion tint, strikethrough, and a "−" glyph.
  - Moved or renumbered text: dotted outline and a "↪ antes art. 12.º" label.
  - **Never use red and green.** They fail for deuteranopes, and they read as the Portuguese flag or a political party.
- **"Blame" becomes "Origem do texto".** Tapping a phrase opens a bottom sheet that says: "Este texto foi escrito pela **Lei n.º 13/2019**, de 12 de fevereiro (alteração n.º 4). Em vigor desde 13/02/2019." It links to the DR original and to the parliamentary process. In the margin, show a thin coloured band per source act, with an optional legend. Keep it off by default for citizens.
- **"A história desta lei" is a vertical timeline, not a git graph.** Each node shows a plain-language title ("Mais Habitação: limites às rendas em novos contratos"), the date published, the date it took effect (these differ, and citizens confuse them), and a count like "alterou 14 artigos". Collapse purely technical changes (renumbering, rectifications) under "alterações técnicas".
- **Write a plain-language summary for every change.** The DR already publishes official *Resumos em linguagem clara* for many decretos-lei, with sections like "O que é? / O que vai mudar? / Quando entra em vigor?". Where one exists, **show it first and label it "Resumo oficial"**. Where it doesn't, an AI summary may fill in, under a persistent, non-dismissible label: *"Resumo gerado automaticamente. Pode conter erros. Não é aconselhamento jurídico. Só o texto publicado no Diário da República faz fé."* (Lei 74/98 gives legal force to the DR edition.) Give the two kinds of summary different visual treatments, for example an icon plus a dashed border on the AI one.
- **Show provenance on every screen.** For example: "Texto consolidado por Git para a Lei a partir do DR. Não é a versão oficial." Add a "Comparar com o DR" link and a "Reportar erro" button.

---

## 3. Accessibility requirements for diff and origin views

- **Screen readers.** `<ins>`/`<del>` are **not announced** by default in VoiceOver, and NVDA/JAWS announce them only if the user has configured it. Inject visually-hidden text: `<del><span class="sr">início de texto eliminado:</span>…<span class="sr">fim de texto eliminado</span></del>` (and the same for "acrescentado"). Also provide a **"Ler versão final"** toggle that removes all markup, so a blind user can hear clean prose.
- **Change navigation.** Provide "Alteração anterior/seguinte" buttons that stay in place. Focus moves to the change, and a live region (`aria-live="polite"`) announces "Alteração 3 de 12, art. 1097.º, n.º 3". Single-key shortcuts (n/p) must be optional and remappable (WCAG 2.1.4).
- **Timeline and date picker.** A slider needs a non-drag alternative (2.5.7). Pair it with a native `<input type="date">` and a "versões" list. Targets must be at least 24×24 px (2.5.8); use 44 px on mobile.
- **Sticky UI.** A sticky header or "versão" bar must not hide the focused element (2.4.11). Add `scroll-padding-top`.
- **Contrast and colour.** Every tint must keep ≥4.5:1 contrast for the text on top of it. Check the scheme in forced-colors / Windows High Contrast mode, where the underline and strikethrough still show the change even though the tints are gone.
- **Reflow and resizing.** Pages must reflow at 320 CSS px and 400% zoom with no horizontal scroll (1.4.10). Long articles need a sticky "Índice" drawer and collapsible *números/alíneas*, and must keep line length around 65 characters.
- **Motion.** Respect `prefers-reduced-motion`: no animated "morphing" between versions, just an instant swap.
- **Language and structure.** Use `lang="pt-PT"` and a real heading hierarchy (Livro › Título › Capítulo › Artigo). Expand abbreviations with `<abbr>` (n.º, al., DL, CRP).
- **Print and PDF.** Print `[+…+]` and `[−…−]` markers, a header with the version date, the URL and a disclaimer, and the timeline as a table.
- **Compliance.** Publish a *Declaração de Acessibilidade* following the DL 83/2018 model, and aim for the selo at **Prata** (silver) or above, even if the product isn't legally bound by it. Public bodies may later embed or link the product, and test sessions with screen-reader users and low-literacy users count towards the selo.

---

## 4. Information architecture for citizens

- **Offer three equal ways in on the home page:**
  1. **"A minha situação"**: life events modelled on ePortugal (Casa e arrendamento, Ter um filho, Trabalho, Reforma, Impostos, Consumidor).
  2. **Search.**
  3. **"Diplomas"** for experts.
- **Search must understand everyday words.** Keep a curated synonym layer:
  - "lei das rendas" → NRAU (Lei 6/2006) and arts. 1064.º ff. CC
  - "baixa parental" → *licença parental*, CT arts. 39.º–43.º. Show a gentle "Procurava *licença parental*?" without correcting the user rudely.
  - "despejo" → BNA / *procedimento especial de despejo*
  - Also: accent- and typo-tolerant matching ("arrendamnto"), and exact identifiers ("DL 157/2006", "157/2006", "art 1083 cc").
- **Show answers inside results.** When the query matches a single article, the top result is **the article itself**, with the current text, an "Em vigor desde" badge and its latest change, not a list of PDFs.
- **Topic pages ("Arrendamento") curate rather than dump.** Each one holds 5–8 key articles with a plain heading ("Quanto pode subir a renda?"), recent changes, pending bills, and links to official help: ePortugal, Portal da Habitação, ACT, Segurança Social.
- **Keep URLs readable.** For example `/lei/codigo-civil/artigo-1077`, with an `?em=2018-03-01` parameter for point-in-time views. Every view must be shareable and citable.
- **Add a glossary.** Link terms (senhorio, caducidade, oposição à renovação) to definitions in short tooltips that are keyboard-accessible. Credit the DRE's Lexionário where its definitions are used.

---

## 5. Visual direction

- **Tone.** The site should feel like a good public library: calm, paper-like, typographically serious, modern without being "startup".
- **Type.** Use a sturdy text serif for the law itself: Source Serif 4 or Literata (both have full Portuguese diacritics and good hinting). Use a humanist sans for the interface: IBM Plex Sans or Inter. Use tabular numerals for dates. Body text is 18px on mobile.
- **Colour.**
  - Base: ink on off-white (`#FAF8F3`), with a full dark mode.
  - A single institutional accent: deep *verde-garrafa* or a *azul-tinta*. Use a hint of República green only as an accent, never paired with red.
  - The insert and delete palette (blue/orange, Okabe-Ito) is reserved for changes and never reused for UI chrome.
- **Portuguese identity.** Express it through details: *azulejo*-inspired section dividers drawn as thin line art, the *§*/*art.º* conventions shown properly, and dates in Portuguese format ("12 de fevereiro de 2019").
- **Avoid:**
  - The armillary sphere, the national coat of arms, the DR or INCM logos, gov.pt's visual system, and any ".gov"-like naming. Impersonation would destroy trust and create legal risk.
  - Terminal or monospace aesthetics, GitHub green, and "commit hashes" shown to citizens.
  - Dark patterns and cookie walls.
- **Trust signals.** Add an "Sobre os dados" page covering sources, update lag, known gaps (e.g. pre-1990 coverage) and methodology. A "Última atualização a partir do DR: há 2 h" stamp should appear on every page.

**Plain-language rules (from the language specialist):**
- Interface sentences of 20 words or fewer. Active voice. Say "Pode" and avoid "Poderá V. Ex.ª".
- Use **pt-PT, not pt-BR** (*ecrã*, *ficheiro*, *registar*).
- Keep legal terms, but explain them the first time they appear.
- Test microcopy with users who have 9 years of schooling or less. Portugal's adult literacy results (PIAAC) sit below the OECD average, so this is the median user, not an edge case.

---

## 6. Educational features (students)

- **"Revisões constitucionais" mode.** Compare the CRP 1976 with each of the seven revisions (LC 1/82, 1/89, 1/92, 1/97, 1/2001, 1/2004, 1/2005), either one revision at a time or across any pair, e.g. 1976 → 1989 on economic organisation (the end of "irreversibilidade das nacionalizações"). Add filters by Part or Title. Show article renumbering explicitly ("art. 6.º/1976 → art. 6.º/1997, n.º 2 aditado").
- **Teaching overlays for Teoria da Lei:**
  - Show *alteração* vs *aditamento* vs *revogação* vs *republicação*.
  - Show tacit vs express repeal (label tacit repeal as "não detetável automaticamente").
  - Explain the *vacatio legis*, including the default under Lei 74/98.
  - Flag norms declared unconstitutional *com força obrigatória geral* by the Tribunal Constitucional, as a distinct event type on the timeline.
- **Annotation.** Private highlights and notes on any version, exportable to PDF/Markdown with correct citations. Optional shared *turma* spaces where a regente can pin questions. No public comments on law text; moderating them would be a liability.
- **Quiz and exercises.** "Que versão do art. 1083.º se aplica a um contrato de 2011?" The student picks a date, and the system checks the answer against the versioned data. Add spaced-repetition cards on the hierarchy of norms.
- **Citation export.** Generate correct Portuguese citations, e.g. "art. 1083.º, n.º 2, al. a), do CC, na redação dada pela Lei n.º 13/2019, de 12 de fevereiro". This alone would make the product indispensable to students.
