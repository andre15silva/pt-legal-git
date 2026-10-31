// 1. Any article at any date: Constitution, art. 1.º, 1976 → 1989.
const { sessao } = require('./rec');
sessao('1-constituicao', {}, async (v, gravar) => {
  await v.ir('#/d/constituicao/artigo-1?redacao=decreto-de-aprovacao-da-constituicao&ver=texto');
  await v.page.mouse.move(900, 300);
  gravar();
  await v.legenda('A Constituição, artigo 1.º, como foi aprovada em 1976');
  await v.pausa(1400);
  await v.mostrar('.rd-ruler', 0.3, 1000);
  await v.apontar(v.page.locator('.lei-p, .lei p').first(), 900);
  await v.pausa(2200);
  await v.legenda('Um clique na linha do tempo: o mesmo artigo em 1989');
  await v.clicar(v.page.locator('.rd-ruler-span').nth(1), { mover: 900 });
  await v.pausa(2400);
  await v.legenda('O que mudou: riscado o que saiu, sublinhado o que entrou', 'Lei Constitucional n.º 1/89 · a segunda revisão da Constituição');
  await v.clicar(v.page.locator('button.tab', { hasText: 'Alterações' }));
  await v.page.waitForSelector('.lei del');
  await v.pausa(900);
  await v.mostrar('.dif', 0.3);
  await v.pausa(300);
  await v.apontar(v.page.locator('.lei del').first(), 800, { sob: true });
  await v.pausa(1600);
  await v.apontar(v.page.locator('.lei ins').first(), 800, { sob: true });
  await v.pausa(3000);
  await v.semLegenda();
  await v.pausa(500);
});
