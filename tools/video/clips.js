// Clips 2–7. Run: node clips.js [number ...]
const { sessao } = require('./rec');
const so = process.argv.slice(2);

const clips = {
  // 2. Compare any two redações: the NRAU, art. 35.º, 2012 → 2017, «cinco» → «oito».
  2: ['2-alteracoes', async (v, gravar) => {
    await v.ir('#/d/nrau/artigo-35?redacao=lei-43-2017&com=lei-31-2012&ver=mudou');
    await v.page.waitForSelector('.dif del');
    await v.page.mouse.move(700, 250);
    gravar();
    await v.legenda('As rendas antigas: o que mudou entre 2012 e 2017', 'Lei das rendas (NRAU), artigo 35.º · inquilinos com rendimentos baixos');
    await v.pausa(1800);
    await v.mostrar(v.page.locator('p', { hasText: 'alterações entre' }), 0.1, 1400);
    await v.legenda('Compare quaisquer duas redações: aqui, a de 2012 com a de 2017');
    await v.apontar('select', 900);
    await v.pausa(2200);
    await v.legenda('Riscado o que saiu, sublinhado o que entrou', 'O prazo passa de cinco para oito anos');
    await v.apontar(v.page.locator('.dif del').first(), 900, { sob: true });
    await v.pausa(1500);
    await v.apontar(v.page.locator('.dif ins').first(), 600, { sob: true });
    await v.pausa(2200);
    await v.legenda('Parágrafo a parágrafo: só fica marcado o que mudou');
    await v.apontar(v.page.locator('.dif').nth(1).locator('ins'), 900, { sob: true });
    await v.pausa(800);
    await v.rolar(420, 1600);
    await v.pausa(1400);
    await v.legenda('Quem fez esta mudança: um projeto de lei do PCP', 'Lei n.º 43/2017 · aprovada a 7 de abril de 2017');
    await v.apontar(v.page.locator('.rd-reg a', { hasText: 'Projeto de lei' }), 1000, { sob: true });
    await v.pausa(3600);
  }],

  // 3. Who made a law: an act page, then a decree-law and the Government that approved it.
  3: ['3-quem-fez-lei', async (v, gravar) => {
    const p = v.page, linha = t => p.locator('.quem-fez p, .quem-fez li', { hasText: t }).first();
    await v.ir('#/ato/lei-organica-1-2026');
    await p.mouse.move(700, 200);
    gravar();
    await v.legenda('Quem fez esta lei?', 'Lei Orgânica n.º 1/2026 · a nova Lei da Nacionalidade');
    await v.pausa(1300);
    await v.mostrar('.quem-fez h2', 0.03, 1200);
    await v.legenda('Quem a propôs: o Governo de Luís Montenegro', 'Depois, uma comissão do Parlamento reescreveu o texto');
    await v.apontar(linha('Proposta de Lei'), 900, { margem: true });
    await v.pausa(2000);
    await v.legenda('Aprovada, levada ao Tribunal Constitucional e vetada', 'O Parlamento aprovou depois um novo texto');
    await v.apontar(linha('Votação final global'), 700, { margem: true });
    await v.pausa(700);
    await v.apontar(linha('Tribunal Constitucional'), 500, { margem: true });
    await v.pausa(700);
    await v.apontar(linha('veto'), 500, { margem: true });
    await v.pausa(700);
    await v.apontar(linha('novo decreto'), 500, { margem: true });
    await v.pausa(1000);
    await v.legenda('Promulgada pelo Presidente seguinte, António José Seguro');
    await v.apontar(linha('promulgou'), 700, { margem: true });
    await v.pausa(1600);
    await v.legenda('A primeira votação, partido a partido');
    await v.mostrar('#generalidade h2', 0.03, 1400);
    await v.apontar(p.locator('#generalidade .rd-votos'), 800, { margem: true });
    await v.pausa(2800);
    // A decree-law: the Government approves it; Parliament does not vote it.
    await v.ir('#/ato/decreto-lei-48-a-2024');
    await p.mouse.move(700, 200);
    await v.legenda('Um decreto-lei: aprova-o o Governo, o Parlamento não o vota', 'Decreto-Lei n.º 48-A/2024 · isenção de IMT na compra de casa por jovens até aos 35 anos');
    await v.pausa(1300);
    await v.mostrar('.quem-fez h2', 0.03, 1200);
    const partidos = await p.locator('.quem-fez', { hasText: 'Partidos no Governo' }).count();
    await v.legenda(partidos ? 'O XXIV Governo, de Luís Montenegro, e os partidos que o formavam' : 'O XXIV Governo, de Luís Montenegro');
    await v.apontar(linha('aprovou este decreto-lei'), 900, { margem: true });
    await v.pausa(1000);
    await v.apontar(partidos ? linha('Partidos no Governo') : linha('Primeiro-Ministro'), 700, { margem: true });
    await v.pausa(2400);
  }],

  // 4. Origem do texto: the note beside each run of lines, and the sheet for one word.
  4: ['4-origem', async (v, gravar) => {
    const p = v.page;
    await v.ir('#/d/lei-nacionalidade/artigo-6?ver=origem');
    await p.mouse.move(700, 250);
    gravar();
    await v.legenda('De que lei vem cada palavra?', 'Lei da Nacionalidade, artigo 6.º · quem pode pedir a nacionalidade');
    await v.pausa(1500);
    await v.mostrar('.lei-o', 0.13, 1300);
    await v.legenda('Ao lado do texto, uma nota: a lei que mudou estas linhas e quem a propôs');
    await v.apontar(p.locator('.rd-onota').first(), 1000, { sob: true });
    await v.pausa(2600);
    await v.legenda('Um clique numa palavra: «sete» anos de residência');
    await v.clicar(p.locator('.rd-ofr', { hasText: /^sete$/ }), { mover: 1000 });
    await p.waitForSelector('#folha-origem-t');
    await v.pausa(600);
    await v.legenda('«sete» vem da lei de 2026, proposta pelo Governo', 'Lei Orgânica n.º 1/2026');
    await v.apontar(p.locator('#folha-origem .oc-citacao'), 800, { sob: true });
    await v.pausa(2400);
    await v.legenda('«Frase seguinte»: o resto da frase vem de 1994', 'Lei n.º 25/94 · proposta do Governo de Cavaco Silva');
    await v.clicar('#folha-origem-seg', { mover: 800 });
    await p.waitForFunction(() => /25\/94/.test((document.getElementById('folha-origem-t') || {}).textContent || ''));
    await v.pausa(2600);
    await v.legenda('E como votou cada partido', 'Primeira votação da lei de 1994');
    await v.mostrar('#folha-origem .rd-votacao', 0.35, 1200);
    await v.apontar(p.locator('#folha-origem .rd-votos'), 800, { margem: true });
    await v.pausa(3200);
  }],

  // 5. Who made each change: the timeline of a diploma, Government by Government.
  5: ['5-quem-fez-cada-alteracao', async (v, gravar) => {
    const p = v.page, gov = n => p.locator('.periodo h2, .periodo h3', { hasText: new RegExp('^' + n + ' Governo') }).first();
    await v.ir('#/quem/nrau');
    await p.mouse.move(700, 200);
    gravar();
    await v.legenda('Quem fez cada alteração à lei das rendas, Governo a Governo', 'Novo Regime do Arrendamento Urbano, desde 2006');
    await v.pausa(2200);
    await v.mostrar(gov('XIX'), 0.03, 1400);
    await v.legenda('2012 e 2014: propostas do Governo de Pedro Passos Coelho');
    await v.apontar(p.locator('.periodo a', { hasText: 'Lei n.º 31/2012' }), 900, { margem: true });
    await v.pausa(2600);
    await v.mostrar(gov('XXI'), 0.03, 1400);
    await v.legenda('Com António Costa: leis que vêm de deputados do PCP e do BE', 'E um texto da comissão que juntou três iniciativas');
    await v.apontar(p.locator('.periodo a', { hasText: 'Lei n.º 43/2017' }), 900, { margem: true });
    await v.pausa(2800);
    await v.mostrar(gov('XXIII'), 0.03, 1800);
    await v.legenda('2023: proposta do Governo, veto do Presidente, o Parlamento confirma', 'Lei n.º 56/2023');
    await v.apontar(p.locator('.periodo p, .periodo li', { hasText: 'veto' }).first(), 900, { margem: true });
    await v.pausa(3400);
  }],

  // 6. Stories: a long-form feature with live figures.
  6: ['6-historias', async (v, gravar) => {
    const p = v.page;
    await v.ir('#/historia/nacionalidade-desde-1981');
    await v.percorrer();
    await p.mouse.move(700, 250);
    gravar();
    await v.legenda('Histórias: como uma lei mudou ao longo dos anos');
    await v.apontar('h1', 900);
    await v.pausa(2600);
    await v.legenda('Com figuras feitas a partir dos dados do site', 'Figura 3 · o direito de solo em 2006');
    await v.mostrar('#fig-solo-2006', 0.02, 2000);
    await v.apontar(p.locator('#fig-solo-2006 ins').first(), 800, { sob: true });
    await v.pausa(2800);
    await v.legenda('E as votações, partido a partido', 'Figura 10 · a lei de 2026');
    await v.mostrar('#fig-voto-2026', 0.02, 2200);
    await v.apontar(p.locator('#fig-voto-2026 .rd-votos'), 800, { margem: true });
    await v.pausa(2800);
    await v.legenda('«Abrir no site»: a figura leva aos dados de onde vem');
    await v.mostrar(p.locator('#fig-voto-2026 a', { hasText: 'Abrir no site' }), 0.6, 1000);
    await v.clicar(p.locator('#fig-voto-2026 a', { hasText: 'Abrir no site' }), { mover: 800 });
    await p.waitForSelector('#generalidade');
    await v.pronto();
    await v.pausa(3000);
  }],

  // 7. Bills now in Parliament, on the article they would change.
  7: ['7-no-parlamento', async (v, gravar) => {
    const p = v.page;
    await v.ir('#/d/codigo-civil/artigo-1083');
    await p.mouse.move(700, 200);
    gravar();
    await v.legenda('E o que vem a seguir? O que está agora no Parlamento', 'Código Civil, artigo 1083.º · quando se pode pôr fim a um arrendamento');
    await v.pausa(1800);
    await v.mostrar('#parl', 0.25, 1600);
    await v.pausa(400);
    await v.legenda('Uma proposta do Governo quer mudar este artigo. Ainda não é lei.');
    await v.apontar(p.locator('.no-parl a').first(), 900);
    await v.pausa(2400);
    await v.legenda('Lemos o texto da proposta para saber que artigos muda', 'Proposta de Lei n.º 103/XVII · arrendamento');
    await v.clicar(p.locator('.no-parl a').first(), { mover: 500 });
    await p.waitForSelector('#muda');
    await v.pronto();
    await v.pausa(900);
    await v.mostrar('#muda', 0.08, 1200);
    await v.apontar(p.locator('a', { hasText: /^1083\.º$/ }), 900, { sob: true });
    await v.pausa(2400);
    await v.legenda('E como votou cada partido na primeira votação');
    await v.mostrar(p.locator('h2', { hasText: 'Primeira votação' }), 0.1, 1400);
    await v.apontar(p.locator('.rd-votos'), 800, { margem: true });
    await v.pausa(3000);
  }],
};

(async () => {
  for (const k of Object.keys(clips)) {
    if (so.length && !so.includes(k)) continue;
    await sessao(clips[k][0], {}, clips[k][1]);
  }
})();
