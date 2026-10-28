# DateLens

"Ver a lei como estava em…": the date control that sets the whole page's point in time, with the date basis made explicit.

- Provide: optional `date` (ISO), `basis` (`vigor` | `efeitos` | `publicacao`), `onChange({date, basis})`, `id` for stable form ids, `today`.
- Uses a native date input (no drag-only slider), a "Ver" button and "Hoje". The page changes only when the reader confirms a date ("Ver", Enter or "Hoje"). Typing a date digit by digit never reloads the page, so keyboard users keep their focus. A new basis applies at once.
- The lens follows `date` and `basis` when the page changes them (for example after a step in `VersionBar`). Do not remount it with a `key`: that moves the focus to the page body.
- The sentence underneath restates the choice in words. Keep it: it tells people which of the three dates they are reading.
- Default basis is `vigor`. Tax and labour views may default to `efeitos`.
