# Redline

Compares two redações of the same unit as Portuguese readers know it from "controlo de alterações": added text underlined in `ins-ink` on `ins-bg`, removed text struck through in `del-ink` on `del-bg`.

- Provide: `segments` `[{op: 'eq'|'ins'|'del', text}]` from a word-level diff; optional `number` ("2 —"), `caption` naming both versions.
- `mode`: `inline` (default, marked), `final` (clean new text — for screen-reader users and copying), `previous` (clean old text).
- Screen readers hear "[início de texto acrescentado] … [fim de texto acrescentado]"; keep those hidden spans.
- Underline and strike-through stay in forced-colours mode; the tint is never the only cue.
- Blue/orange is reserved for change. Never use `ins-*`/`del-*` for success, error or brand.
