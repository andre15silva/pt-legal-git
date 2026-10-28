# VersionTimeline

"A história desta lei": a vertical list of versions, newest at the bottom, each with its act, publication and vigência dates, an optional one-line summary and a verification pill.

- Provide: `versions` `[{id, title, href?, act, published?, inForce?, until?, summary?, verification?, technical?, pending?, links?}]`, `current` (the id on screen, marked "A ver esta redação" and `aria-current`) and `inForceToday` (the id marked "Em vigor hoje"). Keep the two apart: a reader who opens a 2015 redação must not see it marked as in force.
- Give `until` for every redação that was replaced, so the dates read "de … a …". `links` adds small links under a redação, for example "Ver a alteração" and "Ver o ato".
- The current item's title is plain text, not a link to itself.
- `technical` versions (retificações, renumbering) render quieter; collapse runs of them in long histories.
- `pending` versions (an iniciativa's projected text) use the dashed `pendente` style and must never be the `current` one.
- Dates are written out in Portuguese ("8 de julho de 1989") with tabular numerals.
