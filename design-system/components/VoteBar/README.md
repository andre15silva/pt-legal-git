# VoteBar

A vote result: one bar of seats by sentido (a favor, abstenção, contra), the totals in words, and a table of how each parliamentary group voted.

- Provide: `votes` `[{group, seats?, vote: 'favor'|'contra'|'abstencao'|'ausente'}]`. Without `seats` (the AR open data records positions by group, not seat counts), the bar is left out and the totals count groups, `title` (which vote: generalidade, especialidade art. X, votação final global), `result`.
- Results are told apart by lightness and pattern (solid `verde`, hatched, solid `ink`) plus glyph and word. **Never party colours**: neutrality is part of the product.
- List groups in the order of the official record, not by size or result.
- Link to the DAR source next to the component.
