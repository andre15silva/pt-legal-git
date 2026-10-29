// Tests for the comparison diff in app.js: node app/test_diff.js
// With app/data built (pipeline/build.py), it also checks every pair of consecutive versions:
// unchanged + deleted text must give the old text, unchanged + added text the new text.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const stub = () => ({});
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), {
  window,
  React: { createElement: stub, useState: stub, useEffect: stub, useMemo: stub },
  ReactDOM: { createRoot: () => ({ render: stub }) },
  document: { getElementById: stub, documentElement: { hasAttribute: () => true } },
});
const diff = window.RedacaoApp.diff;
const show = ops => ops.map(o => (o.op === 'eq' ? '' : o.op === 'del' ? '-' : '+') + '[' + o.text + ']').join('');
const rebuilds = (a, b) => {
  const ops = diff(a, b);
  return ops.filter(o => o.op !== 'ins').map(o => o.text).join('') === a &&
    ops.filter(o => o.op !== 'del').map(o => o.text).join('') === b;
};

const cases = [
  // CRP art. 1.º, Lei Constitucional n.º 1/89: one rewritten phrase, not two changes around "sociedade"
  ['empenhada na sua transformação numa sociedade sem classes.',
   'empenhada na construção de uma sociedade livre, justa e solidária.',
   '[empenhada na ]-[sua transformação numa sociedade sem classes]+[construção de uma sociedade livre, justa e solidária][.]'],
  ['A aplicação da taxa prevista no número anterior está sujeita.',
   'A aplicação das taxas previstas nos n.os 2 e 8 está sujeita.',
   '[A aplicação ]-[da taxa prevista no número anterior]+[das taxas previstas nos n.os 2 e 8][ está sujeita.]'],
  // a long unchanged run stays unchanged
  ['A taxa é de 20 % e de 10 %.', 'A taxa é de 21 % e de 11 %.',
   '[A taxa é de ]-[20]+[21][ % e de ]-[10]+[11][ %.]'],
  // each número keeps its own changes
  ['1 — Um.\n2 — Dois.', '1 — Uno.\n2 — Duo.', '[1 — ]-[Um]+[Uno][.\n2 — ]-[Dois]+[Duo][.]'],
  // an addition keeps its spaces, so the old text does not lose one
  ['A Bandeira Nacional é a adoptada.', 'A Bandeira Nacional, símbolo da República, é a adoptada.',
   '[A Bandeira Nacional]+[,][ ]+[símbolo da República, ][é a adoptada.]'],
];
for (const [a, b, want] of cases) {
  assert.strictEqual(show(diff(a, b)), want);
  assert.ok(rebuilds(a, b), a);
}

// Redações in URLs: by act id, date, "hoje" or index, and the period each one applies.
// Objects from the app's context have another prototype, so periods are compared as JSON.
const { resolve, periodo, versionKey } = window.RedacaoApp;
const art = { versoes: [
  { ato: 'lei-2-2014', tipo: 'original', publicacao: '2014-01-16', vigor: '2014-01-21' },
  { ato: 'declaracao-de-retificacao-18-2014', tipo: 'retificado', publicacao: '2014-03-13', vigor: '2014-01-21' },
  { ato: 'lei-7-a-2016', tipo: 'alterado', publicacao: '2016-03-30', vigor: '2016-03-31' },
] };
assert.strictEqual(resolve(art, 'lei-2-2014'), 0);
assert.strictEqual(resolve(art, '2'), 2);
assert.strictEqual(resolve(art, '2015-06-30'), 1);
assert.strictEqual(resolve(art, '2010-01-01'), -1);
assert.strictEqual(resolve(art, 'lei-nao-existe'), -1);
// An act that republished the article without changing it opens the redação it kept.
assert.strictEqual(resolve({ versoes: [{ ato: 'lo-2-2003', tipo: 'original', sem_alteracao: [{ ato: 'lo-2-2008', tipo: 'republicado' }] }] }, 'lo-2-2008'), 0);
assert.strictEqual(versionKey(art, 1), 'declaracao-de-retificacao-18-2014');
assert.strictEqual(JSON.stringify(periodo(art, 0, 'vigor')), '{"inicio":"2014-01-21","fim":"mesma"}');
assert.strictEqual(JSON.stringify(periodo(art, 1, 'vigor')), '{"inicio":"2014-01-21","fim":"2016-03-30"}');
assert.strictEqual(JSON.stringify(periodo(art, 2, 'vigor')), '{"inicio":"2016-03-31","fim":null}');

let pairs = 0;
const dir = path.join(__dirname, 'data', 'd');
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir).filter(x => fs.statSync(path.join(dir, x)).isDirectory())) {
    for (const g of fs.readdirSync(path.join(dir, f))) {
      const id = g.replace(/\.json$/, ''), art = JSON.parse(fs.readFileSync(path.join(dir, f, g), 'utf8'));
      const t = art.versoes.map(v => v.linhas.map(l => l.map(s => s[1]).join('')).join('\n'));
      for (let i = 1; i < t.length; i++, pairs++) assert.ok(rebuilds(t[i - 1], t[i]), f + ' ' + id + ' ' + i);
    }
  }
}
// Search in everyday words (pipeline/sinonimos.json): the words people use find the law's words.
const { search } = window.RedacaoApp;
const { sinonimos } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pipeline', 'sinonimos.json'), 'utf8'));
const indice = { sinonimos, diplomas: [{ slug: 'codigo-irc', sigla: 'CIRC' }], pesquisa: [
  ['codigo-civil', 'artigo-1100', 'Artigo 1100.º', 'Denúncia pelo arrendatário', 'vigente'],
  ['codigo-do-trabalho', 'artigo-268', 'Artigo 268.º', 'Pagamento de trabalho suplementar', 'vigente'],
  ['codigo-do-trabalho', 'artigo-338', 'Artigo 338.º', 'Proibição de despedimento sem justa causa', 'vigente'],
  ['codigo-irs', 'artigo-68', 'Artigo 68.º', 'Taxas gerais', 'vigente'],
  ['codigo-irc', 'artigo-87', 'Artigo 87.º', 'Taxas', 'vigente'],
] };
const ids = q => search(indice, q).map(r => r[1]).join(',');
assert.strictEqual(ids('inquilino'), 'artigo-1100');
assert.strictEqual(ids('horas extra'), 'artigo-268');
assert.strictEqual(ids('fui despedido'), 'artigo-338');
assert.strictEqual(ids('escalões'), 'artigo-68');
assert.strictEqual(ids('art 87 circ'), 'artigo-87');
assert.strictEqual(ids('de'), '');

// The whole diploma between two dates: which articles changed, were added or revoked.
const { mudancas } = window.RedacaoApp;
const dip = { arvore: [
  { tipo: 'divisao' },
  { tipo: 'artigo', artigo: 'artigo-1', datas: ['2009-02-17'], atos: ['lei-7-2009'], tipos: ['original'] },
  { tipo: 'artigo', artigo: 'artigo-2', datas: ['2009-02-17', '2019-10-01', '2023-05-01'], atos: ['lei-7-2009', 'lei-93-2019', 'lei-13-2023'], tipos: ['original', 'alterado', 'alterado'] },
  { tipo: 'artigo', artigo: 'artigo-2-a', datas: ['2023-05-01'], atos: ['lei-13-2023'], tipos: ['aditado'] },
  { tipo: 'artigo', artigo: 'artigo-3', datas: ['2009-02-17', '2023-05-01'], atos: ['lei-7-2009', 'lei-13-2023'], tipos: ['original', 'revogado'] },
] };
const mud = (de, ate) => mudancas(dip, de, ate).map(x => x.n.artigo + ':' + x.tipo + ':' + x.atos.join('+')).join(' ');
assert.strictEqual(mud('2019-01-01', '2026-10-29'), 'artigo-2:alterado:lei-93-2019+lei-13-2023 artigo-2-a:aditado:lei-13-2023 artigo-3:revogado:lei-13-2023');
assert.strictEqual(mud('2020-01-01', '2023-04-30'), '');
assert.strictEqual(mud('2019-10-01', '2019-10-01'), '');

console.log('ok: ' + cases.length + ' diff cases, 10 URL cases, 6 search cases, 3 diploma-diff cases' + (pairs ? ', ' + pairs + ' version pairs rebuild exactly' : ''));
