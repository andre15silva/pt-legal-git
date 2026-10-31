// Checks of the motion layer (app/motion.js, app/motion.css; DESIGN-DIRECTION §10), with Playwright
// from the node install. It needs the real data (pipeline/build.py), served from app/:
//   python3 -m http.server 8931 -d app &
//   BASE=http://localhost:8931/ node app/test/movimento.spec.js
// SHOTS=<folder> also saves screenshots. Exit code 1 when a check fails.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8931/';
const SHOTS = process.env.SHOTS || null;
let falhas = 0;
function ok(cond, nome, extra) {
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (extra != null ? ' · ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''));
  if (!cond) falhas++;
}
const erros = [];
async function pagina(b, w, rota, opts) {
  const p = await b.newPage({ viewport: { width: w, height: 844 }, ...(opts || {}) });
  p.on('pageerror', e => erros.push(rota + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push(rota + ': ' + m.text()); });
  await p.goto(BASE + rota, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  return p;
}
async function foto(p, nome) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, nome + '.png') }); } }
const correr = p => p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
const semScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const hash = p => p.evaluate(() => location.hash);
const agulha = p => p.evaluate(() => Number(document.querySelector('.rp-agulha').getAttribute('aria-valuenow')));
const topoRegua = p => p.evaluate(() => Math.round(document.querySelector('.rp').getBoundingClientRect().top));
// Scrolls so that an element's top sits at a fraction of the viewport.
const aLinha = (p, sel, f, k) => p.evaluate(([s, f, k]) => {
  const e = document.querySelectorAll(s)[k || 0];
  scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * f);
}, [sel, f, k]);

const ART6 = '#/d/lei-nacionalidade/artigo-6';
const HIST = '#/historia/nacionalidade-desde-1981';
const ATO = '#/ato/lei-organica-1-2026';
const PAGINAS = ['#/', ART6, ART6 + '?ver=mudou', ART6 + '?ver=origem', ATO, '#/quem/nrau', HIST, '#/d/lei-nacionalidade', '#/grupo/ps'];

(async () => {
  const b = await chromium.launch();

  // 1. Reduced motion: no animation runs, on arrival or after a step; the vote rows and counts are final.
  for (const r of [ART6, ATO, HIST, '#/quem/nrau', '#/']) {
    const p = await pagina(b, 1280, r, { reducedMotion: 'reduce' });
    await p.waitForTimeout(100);
    ok(await correr(p) === 0, 'movimento reduzido: nada corre em ' + r, await correr(p));
    if (r === ART6) {
      await p.focus('.rp-agulha'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(50);
      ok(await correr(p) === 0 && /redacao=/.test(await hash(p)), 'movimento reduzido: a agulha ainda muda de redação, sem animação');
      ok(await p.evaluate(() => !document.querySelector('.mx-del')), 'movimento reduzido: as palavras eliminadas saem logo do DOM');
    }
    if (r === ATO) {
      await aLinha(p, '.rd-votacao', 0.95); await p.waitForTimeout(100);
      ok(await p.evaluate(() => [...document.querySelectorAll('.rd-votos > *')].every(e => getComputedStyle(e).opacity === '1')), 'movimento reduzido: o voto mostra todas as linhas');
      ok(await p.evaluate(() => [...document.querySelectorAll('.conta')].every(e => e.querySelector('.conta-v').textContent === e.getAttribute('data-n'))), 'movimento reduzido: os números já têm o valor');
    }
    await p.close();
  }

  // 2. The scrubber: keyboard, drag, and the ruler stays under the pointer.
  {
    const p = await pagina(b, 1280, ART6);
    const n = await p.evaluate(() => Number(document.querySelector('.rp-agulha').getAttribute('aria-valuemax')));
    await p.focus('.rp-agulha');
    const t0 = await topoRegua(p);
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
    ok(await agulha(p) === n - 1, 'agulha: ← recua uma redação', await agulha(p));
    ok(/redacao=/.test(await hash(p)), 'agulha: o endereço tem a redação', await hash(p));
    ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('rp-agulha')), 'agulha: o foco fica na agulha');
    await p.keyboard.press('Home'); await p.waitForTimeout(400);
    ok(await agulha(p) === 1, 'agulha: Home vai à primeira redação');
    await p.keyboard.press('End'); await p.waitForTimeout(400);
    ok(await agulha(p) === n, 'agulha: End vai à última redação');
    await p.keyboard.press('PageDown'); await p.waitForTimeout(400);
    ok(await agulha(p) === n - 3, 'agulha: PgDn recua três');
    ok((await p.evaluate(() => document.querySelector('.rp-agulha').getAttribute('aria-valuetext'))).indexOf('redação:') > 0, 'agulha: aria-valuetext nomeia a redação');
    ok(Math.abs(await topoRegua(p) - t0) <= 1, 'agulha: a régua não se move com o teclado', [t0, await topoRegua(p)]);
    // A drag from the start to the end: the ruler never moves under the pointer.
    const r = await p.evaluate(() => { const x = document.querySelector('.rp-pista').getBoundingClientRect(); return { x: x.left, y: x.top + x.height / 2, w: x.width }; });
    await p.mouse.move(r.x + 2, r.y); await p.mouse.down();
    const tops = new Set(), vistos = new Set();
    for (let k = 1; k <= 40; k++) {
      await p.mouse.move(r.x + r.w * k / 40 - 1, r.y);
      await p.waitForTimeout(40);
      tops.add(await topoRegua(p)); vistos.add(await agulha(p));
    }
    await p.mouse.up(); await p.waitForTimeout(600);
    tops.add(await topoRegua(p));
    ok(tops.size === 1, 'arrastar: a régua fica parada debaixo do ponteiro', [...tops]);
    ok(vistos.size >= n - 2, 'arrastar: a agulha passa pelas redações', [...vistos]);
    // The morph: a step in Texto strikes the removed words, then removes them from the DOM.
    await p.focus('.rp-agulha'); await p.keyboard.press('Home'); await p.waitForTimeout(700);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(120);
    const meio = await p.evaluate(() => [document.querySelectorAll('.mx .mx-del, .mx [data-mx="sai"]').length, document.querySelectorAll('.mx .mx-ins .mx-w, .mx [data-mx="entra"]').length]);
    await foto(p, 'agulha-morph');
    ok(meio[0] + meio[1] > 0, 'morph: palavras a sair e a entrar no mesmo texto', meio);
    await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.querySelectorAll('.mx .mx-del').length === 0 && document.querySelector('.mx[data-fim]') !== null), 'morph: no fim, só o texto novo');
    await p.close();
  }

  // 3. Replay: plays, pauses, and stops on any other input.
  {
    const p = await pagina(b, 1280, ART6 + '?redacao=lei-37-81');
    await p.click('.rp-tocar');
    ok(await p.getAttribute('.rp-tocar', 'aria-pressed') === 'true', 'rever: ▶ começa');
    await p.waitForTimeout(1700);
    const a = await agulha(p);
    ok(a >= 2, 'rever: avança uma redação de cada vez', a);
    await p.mouse.click(1100, 760);
    await p.waitForTimeout(100);
    ok(await p.getAttribute('.rp-tocar', 'aria-pressed') === 'false', 'rever: um clique noutro sítio para');
    const a2 = await agulha(p);
    await p.waitForTimeout(1800);
    ok(await agulha(p) === a2, 'rever: depois de parar, não avança', [a2, await agulha(p)]);
    await p.click('.rp-tocar'); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await p.getAttribute('.rp-tocar', 'aria-pressed') === 'false', 'rever: Esc para');
    // Origem: one act at a time; the words not written yet wait in grey.
    await p.goto(BASE + ART6 + '?ver=origem', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    ok((await p.textContent('.rp-tocar')).indexOf('Ver quem escreveu, por ordem') >= 0, 'origem: o botão diz «Ver quem escreveu, por ordem»');
    await p.click('.rp-tocar'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.querySelectorAll('.lei-o .rd-ofr.rp-ainda').length > 0), 'origem: as palavras por escrever ficam a cinzento');
    await foto(p, 'origem-por-ordem');
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => document.querySelectorAll('.lei-o .rd-ofr.rp-ainda').length === 0), 'origem: parar mostra o texto todo');
    await p.close();
  }

  // 4. Phone sheets: drag the bar down to close, a little to spring back, up to expand.
  {
    const p = await pagina(b, 390, ART6 + '?ver=origem', { hasTouch: false });
    await p.waitForSelector('.rd-onota');
    await p.click('.rd-onota');
    await p.waitForSelector('.rd-folha:not([hidden])'); await p.waitForTimeout(500);
    const barra = async () => p.evaluate(() => { const e = document.querySelector('.rd-folha-topo').getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + 6, h: document.querySelector('.rd-folha').getBoundingClientRect().height }; });
    let r = await barra();
    await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x, r.y + 40, { steps: 8 }); await p.waitForTimeout(200); await p.mouse.up();
    await p.waitForTimeout(700);
    ok(await p.evaluate(() => !document.querySelector('.rd-folha').hidden && document.querySelector('.rd-folha').style.transform === ''), 'folha: um puxão curto volta ao lugar');
    r = await barra();
    await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x, r.y - 200, { steps: 8 }); await p.waitForTimeout(200); await p.mouse.up();
    await p.waitForTimeout(700);
    ok(await p.evaluate(() => document.querySelector('.rd-folha').getBoundingClientRect().height > innerHeight * 0.85), 'folha: puxar para cima abre até 92 %');
    r = await barra();
    await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x, r.y + r.h * 0.6, { steps: 10 }); await p.waitForTimeout(200); await p.mouse.up();
    await p.waitForTimeout(900);
    ok(await p.evaluate(() => document.querySelector('.rd-folha').hidden), 'folha: puxar para baixo fecha');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.tagName !== 'BODY'), 'folha: o foco não cai no BODY', await p.evaluate(() => document.activeElement.tagName));
    // The register sheet behind the phone bar (dialog.folha).
    await p.goto(BASE + ART6, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    await p.click('.rd-vbar-status');
    await p.waitForSelector('dialog.folha[open]'); await p.waitForTimeout(400);
    const c = await p.evaluate(() => { const e = document.querySelector('dialog.folha[open] .folha-cab').getBoundingClientRect(); return { x: e.left + 30, y: e.top + 4, h: document.querySelector('dialog.folha[open]').getBoundingClientRect().height }; });
    await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x, c.y + c.h * 0.6, { steps: 10 }); await p.waitForTimeout(150); await p.mouse.up();
    await p.waitForTimeout(900);
    ok(await p.evaluate(() => !document.querySelector('dialog.folha[open]')), 'folha do telemóvel: puxar para baixo fecha');
    await p.close();
  }

  // 5. Vote groups: hovering or focusing a group lights it and dims the others.
  {
    const p = await pagina(b, 1280, ATO);
    await aLinha(p, '.rd-votacao', 0.3); await p.waitForTimeout(400);
    await p.hover('.rd-votos [data-grupo="PS"]'); await p.waitForTimeout(350);
    const est = await p.evaluate(() => ({ lit: [...document.querySelectorAll('.mo-grupo')].map(e => e.getAttribute('data-grupo')),
      dim: getComputedStyle(document.querySelector('.rd-votos [data-grupo="PSD"]')).opacity }));
    ok(est.lit.length >= 1 && est.lit.every(g => g === 'PS') && Number(est.dim) < 0.6, 'votos: PS aceso, os outros grupos esbatidos', est);
    await foto(p, 'votos-ps');
    await p.mouse.move(5, 5); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !document.documentElement.classList.contains('mo-com-grupo')), 'votos: tirar o ponteiro apaga');
    await p.focus('.rd-votacao [data-grupo][tabindex="0"]');
    const g0 = await p.evaluate(() => document.activeElement.getAttribute('data-grupo'));
    await p.keyboard.press('ArrowRight');
    const g1 = await p.evaluate(() => document.activeElement.getAttribute('data-grupo'));
    ok(g0 !== g1 && await p.evaluate(g => document.querySelector('.mo-grupo') && document.querySelector('.mo-grupo').getAttribute('data-grupo') === g, g1), 'votos: o teclado acende o grupo e → passa ao seguinte', [g0, g1]);
    ok(await p.evaluate(() => document.querySelectorAll('.rd-votacao [data-grupo][tabindex="0"]').length === document.querySelectorAll('.rd-votacao').length - document.querySelectorAll('.rd-votacao:not(:has([data-grupo]))').length), 'votos: uma paragem de Tab por votação');
    // Tallies: before the vote reaches the screen its rows are hidden; at the reading line they are in.
    await aLinha(p, '.rd-votacao', 1.02); await p.waitForTimeout(300);
    const antes = await p.evaluate(() => getComputedStyle(document.querySelectorAll('.rd-votos > *')[5]).opacity);
    await aLinha(p, '.rd-votacao', 0.55); await p.waitForTimeout(400);
    const depois = await p.evaluate(() => getComputedStyle(document.querySelectorAll('.rd-votos > *')[5]).opacity);
    ok(Number(antes) < 0.5 && Number(depois) === 1, 'votos: as linhas contam-se ao chegar à linha de leitura', [antes, depois]);
    await aLinha(p, '.rd-votacao', 1.02); await p.waitForTimeout(300);
    const outraVez = await p.evaluate(() => getComputedStyle(document.querySelectorAll('.rd-votos > *')[5]).opacity);
    ok(Number(outraVez) < 0.5 || !(await p.evaluate(() => document.documentElement.classList.contains('mo-tl'))), 'votos: ao voltar para cima, a contagem desfaz-se', outraVez);
    // The passage line: stages from the data, filled to the sentence on the reading line.
    const nomes = await p.evaluate(() => [...document.querySelectorAll('.passagem-v .passagem-nome')].map(e => e.firstChild.textContent));
    ok(nomes[0] === 'Iniciativa' && nomes.indexOf('Promulgação') > 0 && nomes[nomes.length - 1] === 'Entrada em vigor', 'passagem: etapas dos dados, da iniciativa à entrada em vigor', nomes);
    await aLinha(p, '.quem-frases > *', 0.5, 3); await p.waitForTimeout(400);
    const feitas = await p.evaluate(() => document.querySelectorAll('.passagem-v .is-feita').length);
    ok(feitas >= 2 && feitas < nomes.length, 'passagem: preenchida até à frase lida', feitas);
    await p.close();
  }

  // 6. The story's step-through figure: the step on the reading line chooses the state; back undoes.
  for (const w of [1280, 390]) {
    const p = await pagina(b, w, HIST);
    const n = await p.evaluate(() => document.querySelectorAll('.ps-passo').length);
    ok(n === 6, w + ' px: passos: seis passos', n);
    const estados = [];
    for (let k = 0; k < n; k++) {
      await aLinha(p, '.ps-passo', w < 1100 ? 0.7 : 0.45, k); await p.waitForTimeout(450);
      estados.push(await p.evaluate(() => [...document.querySelectorAll('.ps-estado')].findIndex(e => e.classList.contains('is-atual'))));
      if (k === 2) await foto(p, w + '-passos-2006');
    }
    ok(estados.join() === '0,1,2,3,4,5', w + ' px: passos: cada passo mostra a sua redação', estados);
    await aLinha(p, '.ps-passo', w < 1100 ? 0.7 : 0.45, 1); await p.waitForTimeout(450);
    ok(await p.evaluate(() => [...document.querySelectorAll('.ps-estado')].findIndex(e => e.classList.contains('is-atual'))) === 1, w + ' px: passos: voltar atrás volta ao estado anterior');
    ok(await p.evaluate(() => { const r = document.querySelector('.ps-painel').getBoundingClientRect(); return r.top >= -1 && r.top < 80; }), w + ' px: passos: a figura fica fixa enquanto os passos passam');
    ok(await p.evaluate(() => document.querySelectorAll('.ps-passo .rd-sr').length === 6 && document.querySelector('.ps-painel').getAttribute('aria-hidden') === 'true'), w + ' px: passos: o leitor de ecrã ouve cada redação; o painel é aria-hidden');
    // The story ruler: hidden while the step-through is on the reading line; one sticky element at a time.
    ok(await p.evaluate(() => document.querySelector('.rf').classList.contains('is-oculta') || getComputedStyle(document.querySelector('.rf')).position !== 'sticky' || document.querySelector('.rf').getBoundingClientRect().top > 50), w + ' px: régua da história: afastada durante os passos');
    await p.evaluate(() => { const e = document.getElementById('1994'); scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * 0.3); });
    await p.waitForTimeout(500);
    const rf = await p.evaluate(() => { const r = document.querySelector('.rf'); return { top: Math.round(r.getBoundingClientRect().top), oculta: r.classList.contains('is-oculta'), onde: r.querySelector('.rf-onde').textContent, quando: r.querySelector('.rf-quando').textContent }; });
    ok(rf.top === 0 && !rf.oculta && rf.onde.indexOf('1994') === 0 && rf.quando === '1994', w + ' px: régua da história: fixa no topo, na secção de 1994', rf);
    await foto(p, w + '-regua-historia');
    await p.close();
  }

  // 7. #/quem: the strip is the only sticky element, and lights the Government on the reading line.
  {
    const p = await pagina(b, 1280, '#/quem/nrau');
    await p.waitForTimeout(2400);
    await p.evaluate(() => { const e = document.getElementById('governo-21'); scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * 0.5); });
    await p.waitForTimeout(500);
    const q = await p.evaluate(() => ({ top: Math.round(document.querySelector('.lt').getBoundingClientRect().top), em: [...document.querySelectorAll('.lt-gov.is-em')].map(e => e.title) }));
    ok(q.top === 0 && q.em.length === 1 && /^XXI /.test(q.em[0]), 'quem: a faixa do Governo lido fica verde', q);
    await p.close();
  }

  // 8. No horizontal scroll at 390 px, and no console errors anywhere.
  for (const r of PAGINAS) {
    const p = await pagina(b, 390, r);
    await p.waitForTimeout(900);
    ok(await semScroll(p), '390 px: sem scroll horizontal em ' + r);
    await p.close();
  }
  // Without scroll timelines (?semtl): the same pages, the same states, no errors.
  for (const r of PAGINAS) { const p = await pagina(b, 1280, '?semtl' + r); await p.waitForTimeout(300); await p.close(); }
  {
    const p = await pagina(b, 1280, '?semtl' + ATO);
    ok(await p.evaluate(() => document.documentElement.classList.contains('mo-sem-tl')), 'sem scroll-timeline: html.mo-sem-tl');
    await aLinha(p, '.rd-votacao', 0.5); await p.waitForTimeout(900);
    ok(await p.evaluate(() => [...document.querySelectorAll('.rd-votos > *')].every(e => getComputedStyle(e).opacity === '1')), 'sem scroll-timeline: o voto conta-se quando chega ao ecrã');
    await p.close();
  }
  ok(erros.length === 0, 'sem erros na consola', erros);

  await b.close();
  console.log(falhas ? falhas + ' falha(s).' : 'Tudo certo.');
  process.exit(falhas ? 1 : 0);
})();
