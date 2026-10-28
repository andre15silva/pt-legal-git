# TextOrigin

"Origem do texto" — the plain-language face of git blame. Each phrase carries a 3px underline in the colour of the act that wrote it; selecting a phrase or a legend chip highlights everything that act wrote and says so in words.

- Provide: `paragraphs` `[{number?, spans: [{text, act}]}]` and `acts` `[{index, label, date}]` (the same objects ActChip takes). `focus` preselects an act.
- The chips mark words. They do not change the text, so a label says so above them (`legendLabel`, default "Marcar as palavras escritas por:"). Readers expect a chip such as "Texto original" to open that text: give the act an `href` (and `hrefLabel`, e.g. "Ver o texto original") and the note under the chips links to that version.
- Choosing a phrase opens a popover under its paragraph: "Escrito por: Lei n.º …", with links from the act's `diffHref` ("Ver a alteração"), `beforeHref` ("Ver como estava antes") and `href`. Give these links whenever the page can: they take the reader from a word to the change that wrote it.
- Punctuation alone keeps its mark but is not a target.
- Every span is a button with an aria-label naming its act, so the attribution is reachable by keyboard and screen reader.
- Off by default on citizen views; on by default for professionals.
- Attribution is per token from our pipeline. If a span cannot be attributed, give it act `0` and a "Não verificado" pill on the article — never guess.
