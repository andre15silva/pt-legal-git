# DateLens

"Ver a lei como estava em…": the date control that sets the whole page's point in time, with the date basis made explicit.

- Provide: optional `date` (ISO), `basis` (`vigor` | `efeitos` | `publicacao`), `onChange({date, basis})`, `id` for stable form ids, `today`.
- Uses a native date input (no drag-only slider), plus "Hoje".
- The sentence underneath restates the choice in words. Keep it: it tells people which of the three dates they are reading.
- Default basis is `vigor`. Tax and labour views may default to `efeitos`.
