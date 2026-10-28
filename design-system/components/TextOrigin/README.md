# TextOrigin

"Origem do texto" — the plain-language face of git blame. Each phrase carries a 3px underline in the colour of the act that wrote it; selecting a phrase or a legend chip highlights everything that act wrote and says so in words.

- Provide: `paragraphs` `[{number?, spans: [{text, act}]}]` and `acts` `[{index, label, date}]` (the same objects ActChip takes). `focus` preselects an act.
- Every span is a button with an aria-label naming its act, so the attribution is reachable by keyboard and screen reader.
- Off by default on citizen views; on by default for professionals.
- Attribution is per token from our pipeline. If a span cannot be attributed, give it act `0` and a "Não verificado" pill on the article — never guess.
