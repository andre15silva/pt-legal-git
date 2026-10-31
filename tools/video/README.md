# Demo videos

Scripted recordings of the live site, for posts about Redação. Each clip shows one feature with
a real example, with captions in a band at the bottom. Frames come from the Chrome DevTools
screencast at 1920×1080; ffmpeg encodes them to H.264.

```bash
node tools/video/c1.js            # 1. the Constitution, art. 1.º, 1976 → 1989
node tools/video/clips.js         # 2–7 (or only some: node tools/video/clips.js 3 6)
node tools/video/cards.js         # the title and end cards
bash tools/video/montar.sh        # the full reel: tools/video/out/redacao-demo.mp4
```

The clips (each 15–30 s):

1. `1-constituicao`: the Constitution, art. 1.º, in 1976, then 1989 on the timeline, and the change word by word.
2. `2-alteracoes`: NRAU, art. 35.º, comparing 2012 with 2017 («cinco» → «oito» anos), and who made the change.
3. `3-quem-fez-lei`: «Quem fez esta lei» on the Lei Orgânica n.º 1/2026 (proposal, final vote, Tribunal
   Constitucional, veto, new decree, promulgation, the first vote by group), then a decree-law (48-A/2024) and its Government.
4. `4-origem`: «Origem do texto» on the Lei da Nacionalidade, art. 6.º: the notes, the sheet on «sete», «Frase seguinte», the votes.
5. `5-quem-fez-cada-alteracao`: the timeline of the NRAU, Government by Government.
6. `6-historias`: the story «Quem nasce cá é português?»: the headline, a diff figure, a vote figure, «Abrir no site».
7. `7-no-parlamento`: a bill now in Parliament, from the article it would change to the bill and its first vote.

The site's own texts change: if a clip breaks, check its selectors against the live page. «Como ler esta
página» is closed in every clip (the scripts set its key in `localStorage`). The cards' figures come from
`data/index.json` and the article files; update them when they change.

Needs Node with Playwright and Chromium, and ffmpeg. The output goes to `tools/video/out/` (not committed).
