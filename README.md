# Redação: git para a lei portuguesa

*A história de cada artigo da lei portuguesa.*

A design and a plan for a visual, verifiable version history of Portuguese law, inspired by Lexifina's [Git for the US Code](https://lexifina.com/blog/git-for-the-us-code). It is built from the **Diário da República** and the **Assembleia da República's open data**. For any article it answers five questions:

1. **What did it say on a given date?** With an explicit choice between publication, entry into force and production of effects.
2. **What changed?** A readable redline between any two versions.
3. **Who wrote this phrase?** Origin down to the word: the act, the initiative it came from, and how each group voted.
4. **What is about to change?** Pending initiatives, where they stand, and a watermarked simulation.
5. **Can I trust it?** Every version links to the DR and says how it was verified.

Underneath, the law is held as a tri-temporal norm graph and exported as a real git repository (author date = entry into force, committer date = publication). There is also a date-explicit API and MCP server.

## Why it needs more than `git log`

Lei n.º 64/2025 rewrote the Código do IRC's general rate from 20 % to **17 %**, in force from 12 November 2025. Its transitional norm applies 17 % only from **2028**: the rate is **19 %** in 2026 and **18 %** in 2027. One timestamp per commit cannot express that, and most consolidated-law sites don't either. Redação is designed around it.

## What's here

| | |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | **Start here.** Product, principles, phased roadmap, organisation, risks |
| [docs/STAKEHOLDERS.md](docs/STAKEHOLDERS.md) | Synthesis of six stakeholder panels: practitioners, Parliament and drafters, journalists and civic tech, citizens and accessibility, compliance/tax/legal AI, legal informatics |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data model (vigência × eficácia × knowledge × system time), hybrid ingestion and verification pipeline, git export spec, API and MCP, stack |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | What the DR and parlamento.pt actually expose (probed live), legalize-pt, Lei 74/98 rules, rights |
| [docs/DESIGN.md](docs/DESIGN.md) | Screens, information architecture, vocabulary, visual identity, accessibility |
| [design-system/](design-system/) | Source of the **Redação design system**: tokens, brand book (README), 11 React components with previews |
| [design/screens/](design/screens/) | Source of the six screen designs (Claude Design canvas files) |
| [tools/](tools/) | Phase-0 spikes, stdlib Python only |
| [docs/research/](docs/research/) | Raw reports: six stakeholder panels and two source probes |

**Live artifacts** (private; share them from their Share menu):
- Design system: <https://claude.ai/artifact/9VHviXgVubUSFgprQGgAyB>
- Screens: <https://claude.ai/artifact/KCq1vDY2KCuzdGppQEtZhx>

## Tools

```bash
# Parse a parlamento.pt Iniciativas file (download it from the open-data page)
python -I tools/parlamento.py stats IniciativasXVII_json.txt
python -I tools/parlamento.py show IniciativasXVII_json.txt "Proposta de Lei" 16

# Link initiatives to the published law (exact via Diplomas Aprovados; optional fallback via a legalize-pt checkout)
python -I tools/link_dr.py IniciativasXVII_json.txt --diplomas DiplomasXVII_json.txt

# Every version of an article from the DR consolidated text (here: Código do IRC, art. 87.º)
python -I tools/dr_client.py historia 64205634 lei 2014-64205634 "Artigo 87.º"

# Check the design tokens' contrast pairs in both themes
python -I tools/check_contrast.py design-system/tokens.json

# Tests
python -I -m unittest discover -s tools
```

Measured on the XVII legislatura (2,354 initiatives, 136 published as Lei):

- **Exact link:** 136/136 initiatives linked to their law.
- **Title-matching fallback:** 99.2 % precise.
- **Vote parsing:** 2,281 of 2,285 votes parsed into per-group positions.

## Status

Phase 0 (reconnaissance) is under way. See the checklist in [docs/PLAN.md](docs/PLAN.md#phase-0-reconnaissance-and-spikes-4-weeks).

*Redação is not an official source. Only the publication in the Diário da República has legal force (faz fé).*
