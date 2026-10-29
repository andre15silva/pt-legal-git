// 1. Any article at any date: Constitution, art. 1.º, 1976 → 1989.
const { sessao } = require('./rec');
sessao('1-constituicao', {}, async (v, gravar) => {
  await v.ir('#/d/constituicao/artigo-1?redacao=decreto-de-aprovacao-da-constituicao&ver=texto');
  await v.page.mouse.move(900, 300);
  gravar();
  await v.legenda('Constituição, artigo 1.º, como foi aprovada em 1976');
  await v.pausa(1200);
  await v.apontar(v.page.locator('.lei-p').first(), 900);
  await v.pausa(2200);
  await v.legenda('Um clique na linha do tempo: a redação de 1989');
  await v.clicar(v.page.locator('.rd-ruler-span').nth(1), { mover: 900 });
  await v.pausa(2200);
  await v.legenda('O que mudou, palavra a palavra', 'Lei Constitucional n.º 1/89');
  await v.clicar(v.page.locator('button.tab', { hasText: 'Alterações' }));
  await v.pausa(700);
  await v.mostrar('.lei del', 0.35);
  await v.pausa(300);
  await v.apontar(v.page.locator('.lei ins').first(), 800);
  await v.pausa(3500);
  await v.semLegenda();
  await v.pausa(500);
});
