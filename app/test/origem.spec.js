// Smoke test of «Origem do texto» (FINAL-SPEC §12.2, checks K1–K12), with Playwright from the
// node install (/opt/node22). It needs the real data (pipeline/build.py), served from app/:
//   python3 -m http.server 8861 -d app &
//   node app/test/origem.spec.js            (BASE=http://localhost:8861/ by default)
// SHOTS=<folder> also saves screenshots. Exit code 1 when a check fails.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8861/';
const SHOTS = process.env.SHOTS || null;
const ART6 = '#/d/lei-nacionalidade/artigo-6?ver=origem';
let falhas = 0;
function ok(cond, nome, extra) {
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (extra != null ? ' · ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''));
  if (!cond) falhas++;
}

async function pagina(b, w, h, rota, opts) {
  const p = await b.newPage({ viewport: { width: w, height: h || 844 }, ...(opts || {}) });
  p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.erros.push(m.text()); });
  await p.goto(BASE + rota, { waitUntil: 'networkidle' });
  await p.waitForSelector('.rd-orun', { timeout: 15000 });
  await p.waitForTimeout(400);
  return p;
}
const ativo = p => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : 'null'; });
const semScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
// Screenshots of the closed view start at the head of Origem do texto, under the sticky row.
const aCabeca = p => p.evaluate(() => { const e = document.querySelector('.oc-cabeca'); scrollTo(0, e.getBoundingClientRect().top + scrollY - (innerWidth < 1100 ? 16 : 72)); });
async function foto(p, nome, inteira) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, nome + '.png'), fullPage: !!inteira }); } }
// Focus is never BODY while the sheet is open: polled after each step.
async function nuncaBody(p, passo) { const a = await ativo(p); ok(a !== 'BODY' && a !== 'null', 'K3 foco fora de BODY: ' + passo, a); }

(async () => {
  const b = await chromium.launch();
  for (const w of [1280, 390]) {
    const t = w + ' px: ';
    // K1: 4 notes; nothing focusable or labelled inside the paragraphs; no horizontal scroll.
    let p = await pagina(b, w, 844, ART6);
    ok(await p.locator('.rd-onota').count() === 4, t + 'K1 4 notas', await p.locator('.rd-onota').count());
    ok(await p.evaluate(() => document.querySelectorAll('.rd-otxt [tabindex], .rd-otxt [role=button], .rd-otxt [aria-label], .rd-otxt button').length) === 0, t + 'K1 palavras sem tabindex/role/aria-label');
    ok(await semScroll(p), t + 'K1 sem scroll horizontal');
    await aCabeca(p); await foto(p, w + '-01-fechado'); await p.evaluate(() => scrollTo(0, 0));
    if (w === 1280) {
      // K2: from the top, Tab passes the page's own controls (header, actions, ruler, version bar,
      // tabs, Data), then one stop for the lens, then the first note. Its name is §2.2's example.
      let n = 0, id = '', antes = [];
      while (n < 60) { await p.keyboard.press('Tab'); n++; antes.push(id); id = await ativo(p); if (id === 'onota-0') break; }
      ok(id === 'onota-0', t + 'K2 Tab chega à primeira nota', n + ' Tabs desde o topo');
      await p.focus('.rd-olente [tabindex="0"]'); await p.keyboard.press('Tab');
      ok(await ativo(p) === 'onota-0', t + 'K2 lente (1 paragem) → primeira nota');
      const nome = await p.evaluate(() => document.activeElement.getAttribute('aria-label'));
      ok(nome === 'Lei Orgânica n.º 1/2026, de 2026. Iniciativa do XXV Governo (Luís Montenegro), texto da comissão. N.º 1 a n.º 10. Abrir quem fez.', t + 'K2 nome acessível', nome);
      // ↓ moves to the next note.
      await p.keyboard.press('ArrowDown');
      ok(await ativo(p) === 'onota-1', t + '↓ na nota', await ativo(p));
      await p.keyboard.press('ArrowUp');
    } else await p.focus('#onota-0');
    // K3: Enter → the sheet's heading; Esc → the note.
    await p.keyboard.press('Enter'); await p.waitForTimeout(250);
    ok(await ativo(p) === 'folha-origem-t', t + 'K3 Enter → título da folha', await ativo(p));
    ok(await p.getAttribute('#onota-0', 'aria-expanded') === 'true', t + 'aria-expanded na nota');
    ok(/abrir=0/.test(p.url()), t + 'URL abrir=0', p.url());
    await nuncaBody(p, 'aberta');
    await foto(p, w + '-02-nota-aberta');
    // K4: «Frase seguinte ›» twice: focus stays on it, the live region speaks, the URL has frase=.
    await p.click('#folha-origem-seg'); await p.waitForTimeout(150); await nuncaBody(p, 'seguinte 1');
    await p.click('#folha-origem-seg'); await p.waitForTimeout(150);
    ok(await ativo(p) === 'folha-origem-seg', t + 'K4 foco no botão', await ativo(p));
    const vivo = await p.evaluate(() => document.querySelector('[aria-live=polite].rd-sr').textContent);
    ok(vivo.length > 0, t + 'K4 região viva', vivo);
    ok(/frase=/.test(p.url()), t + 'K4 URL frase=');
    const frase = () => (p.url().match(/frase=([^&]+)/) || [])[1];
    const f1 = frase();
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
    const f2 = frase();
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
    const f3 = frase();
    ok(f1 && f2 !== f1 && f3 === f1, t + 'K4 → avança e ← recua', [f1, f2, f3]);
    await nuncaBody(p, 'andar');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await ativo(p) === 'onota-0', t + 'K3 Esc → nota', await ativo(p));
    ok(!/abrir=|frase=/.test(p.url()), t + 'Esc limpa abrir e frase');
    ok(await p.evaluate(() => document.querySelectorAll('.rd-ofr.is-atual, .rd-orun.is-open').length) === 0, t + 'marcas limpas');
    // K5: the word «sete» opens the sheet at its act, with the quote.
    const sete = p.locator('.rd-ofr', { hasText: /^\s*sete\s*$/ }).first();
    await sete.click(); await p.waitForTimeout(300);
    const tit = await p.textContent('#folha-origem-t');
    ok(tit === 'Quem fez a Lei Orgânica n.º 1/2026', t + 'K5 título', tit);
    ok(/«sete»/.test(await p.textContent('.oc-citacao')), t + 'K5 citação');
    ok(await ativo(p) === 'folha-origem-t', t + 'K5 foco no título');
    if (w === 390) {
      const r = await sete.boundingBox(), ih = await p.evaluate(() => innerHeight);
      ok(r.y >= 48 && r.y + r.height <= 0.36 * ih + 1, t + 'K5 palavra acima da folha', [Math.round(r.y), Math.round(0.36 * ih)]);
      const fh = await p.evaluate(() => document.getElementById('folha-origem').getBoundingClientRect().height / innerHeight);
      ok(fh <= 0.641, t + 'folha ≤ 64vh', fh.toFixed(3));
    } else {
      const x = await p.evaluate(() => document.getElementById('folha-origem').getBoundingClientRect().left);
      ok(x >= 781, t + 'a folha deixa o texto à vista', x);
    }
    ok(/frase=2(%3A|:)4/.test(p.url()), t + 'K6 «sete» é frase=2:4', p.url());
    await foto(p, w + '-03-folha-da-palavra-sete');
    ok(await semScroll(p), t + 'sem scroll horizontal com a folha');
    ok(p.erros.length === 0, t + 'sem erros na página', p.erros);
    await p.close();

    // K6: reload with frase=2:4 and with abrir=0.
    if (w === 1280) {
      p = await pagina(b, w, 844, ART6 + '&frase=2:4');
      ok(await p.textContent('#folha-origem-t') === 'Quem fez a Lei Orgânica n.º 1/2026' && /«sete»/.test(await p.textContent('.oc-citacao')), t + 'K6 frase=2:4');
      await p.close();
      p = await pagina(b, w, 844, ART6 + '&abrir=0');
      ok(await p.getAttribute('#onota-0', 'aria-expanded') === 'true', t + 'K6 abrir=0');
      // K12: VFG and new decree as <dl>, every group of ordem_grupos in each.
      const k12 = await p.evaluate(() => {
        const secs = [...document.querySelectorAll('.oc-sec')];
        const sec = n => secs.find(s => s.querySelector('h3') && s.querySelector('h3').textContent === n);
        const dls = n => { const s = sec(n); return s ? [...s.querySelectorAll('dl')].map(dl => ({ rows: dl.querySelectorAll('dt').length, txt: dl.textContent })) : null; };
        return { vfg: dls('Votação final global'), veto: dls('Veto e novo decreto'), hon: !!document.querySelector('.oc-honesta') };
      });
      const ordem = ['PSD', 'CH', 'PS', 'IL', 'L', 'PCP', 'CDS-PP', 'BE', 'PAN', 'JPP'];
      ok(k12.vfg && k12.vfg[0].rows === 3, t + 'K12 VFG com 3 linhas', k12.vfg && k12.vfg[0].rows);
      ok(k12.veto && k12.veto.length >= 1, t + 'K12 novo decreto com <dl>');
      ok(k12.vfg && k12.veto && ordem.every(g => k12.vfg[0].txt.includes(g) && k12.veto[0].txt.includes(g)), t + 'K12 todos os grupos');
      ok(k12.hon, t + 'linha honesta numa lei');
      await foto(p, w + '-08-folha-inteira-lo1-2026');
      // The whole sheet: a viewport as tall as its content.
      const alto = await p.evaluate(() => document.getElementById('folha-origem').scrollHeight);
      await p.setViewportSize({ width: w, height: Math.min(4000, alto + 20) }); await p.waitForTimeout(200);
      if (SHOTS) await p.locator('#folha-origem').screenshot({ path: path.join(SHOTS, w + '-08b-folha-inteira-lo1-2026.png') });
      await p.close();
    }

    // K7: the lens. One tab stop; → chooses «Iniciativa da lei»; no hue on the words.
    p = await pagina(b, w, 844, ART6);
    await p.focus('.rd-olente [role=radio][aria-checked=true]');
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
    ok(await p.getAttribute('.rd-olente [role=radio]:has-text("Iniciativa da lei")', 'aria-checked') === 'true', t + 'K7 Iniciativa da lei');
    ok(await ativo(p) !== 'BODY', t + 'K7 foco no rádio', await p.evaluate(() => document.activeElement.textContent));
    ok(/marcar=iniciativa/.test(p.url()), t + 'K7 URL marcar=');
    ok(/não quem escreveu cada frase/.test(await p.textContent('.rd-olente-leg')), t + 'K7 legenda com a frase honesta');
    ok(await p.evaluate(() => document.querySelectorAll('.rd-olente [tabindex="0"]').length) === 1, t + 'K7 uma paragem de Tab');
    const cores = await p.evaluate(() => {
      const ok = new Set([getComputedStyle(document.body).color]);
      const r = document.createElement('span'); r.style.color = 'var(--rule-strong)'; document.body.appendChild(r); ok.add(getComputedStyle(r).color); r.remove();
      return [...document.querySelectorAll('.rd-ofr')].map(s => getComputedStyle(s).textDecorationColor).filter(c => !ok.has(c) && c !== 'rgba(0, 0, 0, 0)');
    });
    ok(cores.length === 0, t + 'K7 sem matiz nas palavras', cores.slice(0, 3));
    await aCabeca(p); await foto(p, w + '-04-lente-iniciativa');
    // K11: the first law line at 390 × 844.
    if (w === 390) {
      await p.close();
      p = await pagina(b, w, 844, ART6);
      // Measured against «Texto» on the same article: the head and the first note add at most 230 px.
      const y = await p.evaluate(() => document.querySelector('.rd-otxt p').getBoundingClientRect().top + scrollY);
      const q = await b.newPage({ viewport: { width: w, height: 844 } });
      await q.goto(BASE + ART6.replace('?ver=origem', ''));
      await q.waitForSelector('.lei .lei-p');
      const yt = await q.evaluate(() => document.querySelector('.lei .lei-p').getBoundingClientRect().top + scrollY);
      await q.close();
      ok(y - yt <= 230, t + 'K11 primeira linha da lei', Math.round(y) + ' (Texto: ' + Math.round(yt) + ')');
    }
    ok(p.erros.length === 0, t + 'sem erros (lente)', p.erros);
    await p.close();

    // K8: a decree-law (CC art. 1653.º): no honesty line.
    p = await pagina(b, w, 844, '#/d/codigo-civil/artigo-1653?ver=origem');
    await p.click('#onota-0'); await p.waitForTimeout(300);
    const dl = await p.textContent('#folha-origem');
    ok(dl.includes('O Parlamento não votou este texto.') && !dl.includes('Mostramos quem apresentou'), t + 'K8 decreto-lei');
    ok(await semScroll(p), t + 'CC 1653 sem scroll horizontal');
    await foto(p, w + '-05-decreto-lei');
    ok(p.erros.length === 0, t + 'sem erros (CC 1653)', p.erros);
    await p.close();

    // K9: CC art. 1103.º, Lei n.º 13/2019: 3 initiatives, PJL 847/XIII among them.
    p = await pagina(b, w, 844, '#/d/codigo-civil/artigo-1103?ver=origem');
    const nl = await p.locator('.rd-onota').count();
    let achou = false;
    for (let k = 0; k < nl && !achou; k++) {
      const n = await p.getAttribute('#onota-' + k, 'aria-label');
      if (/^Lei n\.º 13\/2019/.test(n)) {
        await p.click('#onota-' + k); await p.waitForTimeout(300);
        const s = await p.textContent('#folha-origem');
        achou = true;
        ok(s.includes('juntou 3 iniciativas') && s.includes('Projeto de Lei n.º 847/XIII'), t + 'K9 Lei 13/2019 com PJL 847');
        await foto(p, w + '-06-texto-comissao');
        await p.keyboard.press('Escape');
      }
    }
    ok(achou, t + 'K9 nota da Lei n.º 13/2019');
    if (w === 390) { await p.evaluate(() => scrollTo(0, 0)); await foto(p, w + '-07-cc1103-fechado-inteiro', true); }
    ok(await semScroll(p), t + 'CC 1103 sem scroll horizontal');
    ok(p.erros.length === 0, t + 'sem erros (CC 1103)', p.erros);
    await p.close();

    // LN art. 1.º (LO 2/2006: initiatives voted apart), NRAU art. 35.º.
    for (const [rota, nome] of [['#/d/lei-nacionalidade/artigo-1?ver=origem', 'ln1'], ['#/d/nrau/artigo-35?ver=origem', 'nrau35']]) {
      p = await pagina(b, w, 844, rota);
      ok(await semScroll(p), t + nome + ' sem scroll horizontal');
      const n = await p.locator('.rd-onota').count();
      for (let k = 0; k < n; k++) {
        await p.click('#onota-' + k); await p.waitForTimeout(150);
        if (await ativo(p) !== 'folha-origem-t') ok(false, t + nome + ' nota ' + k + ' → título', await ativo(p));
        if (nome === 'ln1' && /^Lei Orgânica n\.º 2\/2006/.test(await p.getAttribute('#onota-' + k, 'aria-label')) && w === 1280) await foto(p, w + '-07-varios-projetos-lo2-2006');
        await p.keyboard.press('Escape'); await p.waitForTimeout(100);
        if (await ativo(p) !== 'onota-' + k) ok(false, t + nome + ' Esc → nota ' + k, await ativo(p));
      }
      ok(n > 0, t + nome + ' ' + n + ' notas, cada uma abre e fecha');
      if (w === 1280) await foto(p, w + '-09-' + nome);
      ok(p.erros.length === 0, t + 'sem erros (' + nome + ')', p.erros);
      await p.close();
    }

    // K10: forced colours: bands and underlines still show.
    if (w === 1280) {
      p = await pagina(b, w, 844, ART6);
      await p.emulateMedia({ forcedColors: 'active' }); await p.waitForTimeout(200);
      const fc = await p.evaluate(() => ({
        banda: getComputedStyle(document.querySelector('.rd-onota-band')).backgroundColor,
        sub: getComputedStyle(document.querySelector('.rd-ofr:not(.rd-ofr-orig)')).textDecorationColor
      }));
      ok(fc.banda !== 'rgba(0, 0, 0, 0)' && fc.sub !== 'rgba(0, 0, 0, 0)', t + 'K10 cores forçadas', fc);
      await p.close();
    }

    // The two stories: their origem figures (R.TextOrigin) still render.
    for (const s of ['nacionalidade-desde-1981', 'arrendamento-desde-2012']) {
      const q = await b.newPage({ viewport: { width: w, height: 844 } });
      const erros = [];
      q.on('pageerror', e => erros.push(e.message));
      q.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
      await q.goto(BASE + '#/historia/' + s, { waitUntil: 'networkidle' });
      await q.waitForTimeout(800);
      for (let y = 0; y < 30; y++) { await q.mouse.wheel(0, 1500); await q.waitForTimeout(60); }
      await q.waitForTimeout(500);
      const figs = await q.evaluate(() => document.querySelectorAll('.fig-origem .rd-origin-span').length);
      ok(figs > 0, t + 'história ' + s + ': figura de origem', figs);
      ok(await semScroll(q), t + 'história ' + s + ' sem scroll horizontal');
      ok(erros.length === 0, t + 'história ' + s + ' sem erros', erros);
      const fig = q.locator('.fig-origem').first();
      if (SHOTS && await fig.count()) { await fig.scrollIntoViewIfNeeded(); await fig.screenshot({ path: path.join(SHOTS, w + '-10-historia-' + s + '.png') }); }
      await q.close();
    }
  }
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
