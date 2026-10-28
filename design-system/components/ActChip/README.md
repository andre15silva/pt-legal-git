# ActChip

Names an act that wrote or changed text: a colour swatch from the `act-N` series, the designation and the publication date in Portuguese.

- Provide: `act` `{index, label, date}` — `index` 0 is the versão originária (neutral `act-0`), 1–7 the amending acts in the order they appear in the current legend; `date` ISO `YYYY-MM-DD`.
- Optional `onClick` turns it into a toggle (legend of Origem do texto); `selected` marks the active one.
- Use the official designation exactly: "Lei n.º 13/2023", "Decreto-Lei n.º 47344", "Lei Constitucional n.º 1/89".
- More than 7 acts on one article: group the oldest under "Outras alterações" rather than recycling colours.
