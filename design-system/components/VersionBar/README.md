# VersionBar

"Redação 4 de 8": the reader's place in the history of one article, and the way to the previous or the next redação. It sits above the statute text. On wide screens the page makes it sticky. On a phone the page fixes its first row to the bottom of the screen.

- Provide: `versions` `[{label, start, technical?, pending?}]` oldest first, `current` (index), `onGo(i)`, `status` (the words of the status line), `today` (ISO) and an `id`. Optional `onList` shows a "Lista" button for phones, which takes the reader to the full history.
- `status` says the position, the act and the period in words: "Redação 4 de 8 · Lei n.º 2/2020 · em vigor de 1 de abril de 2020 a 31 de dezembro de 2022". The line is a `role="status"` region, so screen readers announce each step.
- Focus stays on the button the reader pressed. Inside the bar, ← and → move one redação, Home and End go to the first and the last.
- The strip has one segment per redação, as wide as the time it applied. The segment on screen is solid `verde`. Retificações are dashed. A redação not yet in force uses the `pendente` style. Every segment is a button with a label, and the buttons are the alternative to the strip, so nothing depends on dragging.
- At the first and the last redação, the buttons stay focusable with `aria-disabled="true"`.
- Pair it with a page that keeps the reader's scroll position between redações of the same article, and that sets the page title to the redação on screen.
