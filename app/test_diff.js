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

let pairs = 0;
const dir = path.join(__dirname, 'data', 'd');
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir)) {
    for (const [id, art] of Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).artigos)) {
      const t = art.versoes.map(v => v.linhas.map(l => l.map(s => s[1]).join('')).join('\n'));
      for (let i = 1; i < t.length; i++, pairs++) assert.ok(rebuilds(t[i - 1], t[i]), f + ' ' + id + ' ' + i);
    }
  }
}
console.log('ok: ' + cases.length + ' cases' + (pairs ? ', ' + pairs + ' version pairs rebuild exactly' : ''));
