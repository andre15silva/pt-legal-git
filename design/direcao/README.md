# Design direction mocks (2026-10-28)

Static mocks from the five design reviews summarised in [docs/DESIGN-DIRECTION.md](../../docs/DESIGN-DIRECTION.md). They use the real text of CIRC art. 87.º. The HTML files link the design tokens at `http://localhost:8765/ds/tokens.css`, so serve `app/` on port 8765 to open them.

| File | Review | What it shows |
|---|---|---|
| `mock-tipografia.html`, `-desktop.png`, `-telemovel.png` | Editorial typographer | Hanging números, title and epígrafe on two lines, a ruled version strip, text tabs, the norm in the margin |
| `mock-edicao-anotada.html`, `-desktop.png`, `-telemovel.png` | Critic of generated UI | The citation formula as the status line, a hairline time ruler, the norm as a consequence with a rate table, provenance as margin notes, the register |
| `mock-controlos.html`, `.png` | Interaction designer | One sticky control row, the Data popover, the "Alterações" view replacing compare, the phone bar and sheet. Use it for the control model, not for the look |
| `mock-informacao.html`, `-desktop.png` | Information designer | The first screen with each fact said once |
| `atual-artigo-desktop.png` | | The app before this direction, for comparison |
