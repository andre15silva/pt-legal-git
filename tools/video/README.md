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

Needs Node with Playwright and Chromium, and ffmpeg. The output goes to `tools/video/out/` (not committed).
