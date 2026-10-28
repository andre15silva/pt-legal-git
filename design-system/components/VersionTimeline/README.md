# VersionTimeline

"A história desta lei": a vertical list of versions, newest at the bottom, each with its act, publication and vigência dates, an optional one-line summary and a verification pill.

- Provide: `versions` `[{id, title, href?, act, published?, inForce?, until?, summary?, verification?, technical?, pending?}]` and `current` (the id shown as "Versão em vigor").
- `technical` versions (retificações, renumbering) render quieter; collapse runs of them in long histories.
- `pending` versions (an iniciativa's projected text) use the dashed `pendente` style and must never be the `current` one.
- Dates are written out in Portuguese ("8 de julho de 1989") with tabular numerals.
