// Title and end cards as 1920x1080 PNGs, in the site's fonts and colours.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FONTES = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">';
const BASE = `<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1280px; height: 720px; background: #fff; color: #1a1f1c; font-family: "Schibsted Grotesk", sans-serif; padding: 96px 112px; display: flex; flex-direction: column; justify-content: center; }
  .marca { font-family: "Source Serif 4", serif; font-size: 30px; font-weight: 600; }
  h1 { font-family: "Source Serif 4", serif; font-weight: 400; font-size: 64px; line-height: 1.1; letter-spacing: -.01em; margin-top: 28px; max-width: 980px; }
  p.sub { font-family: "Source Serif 4", serif; font-size: 26px; line-height: 1.4; color: #4a524d; margin-top: 24px; max-width: 900px; }
  .factos { display: flex; gap: 48px; margin-top: 56px; padding-top: 24px; border-top: 1px solid #1a1f1c; max-width: 980px; }
  .factos div { font-size: 18px; color: #4a524d; }
  .factos strong { display: block; font-family: "Source Serif 4", serif; font-size: 40px; font-weight: 600; color: #1a1f1c; font-variant-numeric: lining-nums tabular-nums; }
  .url { font-family: "Source Serif 4", serif; font-size: 52px; margin-top: 12px; color: #1f5f45; }
  .nota { font-size: 18px; color: #4a524d; margin-top: 56px; }
</style>`;
const cards = {
  'card-intro': `<div class="marca">Redação</div>
    <h1>Como mudou a lei portuguesa, e quem a mudou</h1>
    <p class="sub">Cada artigo em qualquer data, de que lei vem cada palavra, quem a propôs e como votou cada partido.</p>
    <div class="factos"><div><strong>63</strong>leis e códigos</div><div><strong>16 974</strong>artigos</div><div><strong>31 681</strong>redações</div><div><strong>879</strong>atos que os alteraram</div></div>`,
  'card-fim': `<div class="marca">Redação</div>
    <p class="sub">Veja a história de qualquer artigo em</p>
    <div class="url">andre15silva.github.io/pt-legal-git</div>
    <p class="sub">Gratuito. Atualizado todos os dias com o Diário da República e os dados abertos da Assembleia da República.</p>
    <p class="nota">Texto não oficial: só o Diário da República faz fé.</p>`,
};
(async () => {
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  for (const [nome, corpo] of Object.entries(cards)) {
    await p.setContent('<!doctype html><meta charset="utf-8">' + FONTES + BASE + '<body>' + corpo + '</body>');
    await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(__dirname, 'out', nome + '.png') });
    console.log(nome);
  }
  await b.close();
})();
