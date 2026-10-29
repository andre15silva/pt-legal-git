// Clips 2–7. Run: node clips.js [number ...]
const { sessao } = require('./rec');
const so = process.argv.slice(2);

const clips = {
  // 2. Tables, and comparing any two redações: the IRS brackets.
  2: ['2-irs', async (v, gravar) => {
    await v.ir('#/d/codigo-irs/artigo-68?redacao=lei-73-a-2025&ver=mudou');
    await v.page.mouse.move(700, 250);
    gravar();
    await v.legenda('Os escalões do IRS: o que mudou no Orçamento do Estado para 2026', 'Código do IRS, artigo 68.º · Lei n.º 73-A/2025');
    await v.pausa(1500);
    await v.mostrar('.lei-tab', 0.08, 1400);
    await v.pausa(1000);
    await v.apontar(v.page.locator('.lei-tab ins').nth(2), 900);
    await v.pausa(2200);
    await v.legenda('Riscado: o que saiu. Sublinhado: o que entrou.', 'Cada escalão e cada taxa, como estava e como ficou');
    await v.apontar(v.page.locator('.lei-tab del').nth(4), 900);
    await v.pausa(1600);
    await v.apontar(v.page.locator('.lei-tab ins').nth(8), 900);
    await v.pausa(2600);
  }],

  // 3. Origem do texto: which act wrote each phrase.
  3: ['3-origem', async (v, gravar) => {
    await v.ir('#/d/codigo-do-trabalho/artigo-344?ver=origem');
    await v.page.mouse.move(700, 250);
    gravar();
    await v.legenda('Quem escreveu cada frase: cada cor é uma lei', 'Código do Trabalho, artigo 344.º · Caducidade de contrato de trabalho a termo certo');
    await v.pausa(1200);
    await v.mostrar('.rd-origin-text', 0.06, 1300);
    await v.pausa(1800);
    await v.legenda('Clique numa frase para ver a lei que a escreveu');
    const frase = v.page.locator('.rd-origin-span.rd-u-act-6, .rd-origin-span.rd-u-act-5, .rd-origin-span.rd-u-act-4').filter({ visible: true }).first();
    await v.clicar(frase, { mover: 1000 });
    await v.pausa(3200);
    await v.legenda('Ou escolha uma lei para ver tudo o que ela escreveu');
    await v.clicar(v.page.locator('.rd-origin-marg').nth(1), { mover: 900 });
    await v.pausa(3500);
  }],

  // 4. A whole code between two dates: the Agenda do Trabalho Digno.
  4: ['4-codigo-entre-datas', async (v, gravar) => {
    await v.ir('#/d/codigo-do-trabalho');
    await v.page.mouse.move(700, 200);
    gravar();
    await v.legenda('Um código inteiro entre duas datas', 'Código do Trabalho');
    await v.pausa(1200);
    await v.apontar('.dip-acoes a', 900);
    await v.pausa(500);
    await v.page.mouse.down(); await v.pausa(90); await v.page.mouse.up();
    await v.page.evaluate(() => { location.hash = '#/alteracoes/codigo-do-trabalho?de=2023-04-30&ate=2023-05-01'; });
    await v.page.waitForSelector('.mud-art');
    await v.legenda('Antes e depois da Agenda do Trabalho Digno', 'Lei n.º 13/2023, em vigor a 1 de maio de 2023');
    await v.pausa(1200);
    await v.apontar('.mudancas .lead', 800);
    await v.pausa(2200);
    await v.mostrar('.mud-art', 0.04, 1300);
    await v.pausa(1500);
    await v.rolar(900, 2600);
    await v.pausa(800);
    await v.rolar(900, 2600);
    await v.pausa(2200);
  }],

  // 5. How Parliament voted.
  5: ['5-votacao', async (v, gravar) => {
    await v.ir('#/ato/lei-13-2023');
    await v.page.mouse.move(700, 200);
    gravar();
    await v.legenda('Cada lei, com a votação na generalidade de cada partido', 'Lei n.º 13/2023 · Agenda do Trabalho Digno');
    await v.pausa(1800);
    await v.mostrar('#generalidade', 0.05, 1400);
    await v.pausa(4200);
    await v.rolar(500, 1500);
    await v.pausa(2500);
  }],

  // 6. Bills now in Parliament, on the article they would change.
  6: ['6-no-parlamento', async (v, gravar) => {
    await v.ir('#/d/codigo-civil-locacao/artigo-1083');
    await v.page.mouse.move(700, 200);
    gravar();
    await v.legenda('O que está em discussão no Parlamento para este artigo', 'Código Civil, artigo 1083.º · Fundamento da resolução do arrendamento');
    await v.pausa(1500);
    await v.mostrar('#parl', 0.3, 1500);
    await v.pausa(2200);
    await v.legenda('Lemos o texto de cada proposta para saber que artigos altera', 'Proposta de Lei n.º 103/XVII · reforma do arrendamento');
    await v.clicar(v.page.locator('.no-parl a').first(), { mover: 900 });
    await v.page.waitForSelector('#muda');
    await v.pausa(900);
    await v.mostrar('#muda', 0.1, 1200);
    await v.pausa(4000);
  }],

  // 7. Search in everyday words.
  7: ['7-pesquisa', async (v, gravar) => {
    await v.ir('');
    await v.page.mouse.move(700, 200);
    gravar();
    await v.legenda('Pesquise com as suas palavras');
    await v.pausa(800);
    await v.escrever('#q', 'inquilino');
    await v.pausa(900);
    await v.legenda('«inquilino» encontra os artigos sobre o arrendatário');
    await v.pausa(2600);
    await v.page.locator('#q').fill('');
    await v.escrever('#q', 'horas extra');
    await v.legenda('«horas extra» encontra o trabalho suplementar');
    await v.pausa(2600);
    await v.page.locator('#q').fill('');
    await v.escrever('#q', 'art 87 circ');
    await v.legenda('Ou o número do artigo e a sigla do código');
    await v.pausa(1500);
    await v.clicar(v.page.locator('.results a').first(), { mover: 800 });
    await v.page.waitForSelector('.art-titulo');
    await v.pausa(2800);
  }],
};

(async () => {
  for (const k of Object.keys(clips)) {
    if (so.length && !so.includes(k)) continue;
    await sessao(clips[k][0], {}, clips[k][1]);
  }
})();
