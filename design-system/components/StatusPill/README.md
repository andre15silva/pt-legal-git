# StatusPill

The state of a provision, a version or a piece of data, always as a glyph plus a word, never colour alone.

- Provide: `status` — `vigor` (Em vigor), `futuro` (Entra em vigor, dashed), `revogado`, `aditado`, `pendente` (dashed, law in the making), `verificado`, `nao-verificado`, `inconstitucional`. Optional `children` to override the word ("Versão em vigor").
- Trust states (`verificado`, `nao-verificado`) describe how we checked the text against official sources. Show them next to every version on professional views.
- `pendente` only ever marks parliamentary or projected text. Never use it for something that is law.
