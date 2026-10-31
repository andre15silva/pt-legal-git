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
      // diffLines (with rewritten paragraphs shown whole) keeps every word of both texts, in order.
      for (let i = 1; i < t.length; i++) {
        const ls = window.RedacaoApp.diffLines(t[i - 1], t[i]), so = s => s.replace(/\s+/g, '');
        const lado = op => so(ls.map(l => l.filter(s => s.op !== op).map(s => s.text).join('')).join(''));
        assert.strictEqual(lado('ins'), so(t[i - 1]), f + ' ' + id + ' ' + i + ' (antes)');
        assert.strictEqual(lado('del'), so(t[i]), f + ' ' + id + ' ' + i + ' (depois)');
      }
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

// ---- The motion layer's pure helpers (app/motion.js) ---------------------------------------
const MOw = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'motion.js'), 'utf8'), { window: MOw, Date, Math });
const MO = MOw.RedacaoMotion;
// Replay: 750 to 1500 ms per redação, so a whole history takes about 2 to 8 s.
assert.strictEqual(MO.passoReplay(2), 1500);
assert.strictEqual(MO.passoReplay(11), 750);
assert.strictEqual(MO.passoReplay(8), 1000);
// The redação at a date on the scrubber.
const vsR = [{ start: '1981-10-03' }, { start: '1994-11-01' }, { start: '2006-12-15' }];
assert.deepStrictEqual(JSON.parse(JSON.stringify([MO.naData(vsR, '1970-01-01'), MO.naData(vsR, '1994-11-01'), MO.naData(vsR, '2000-01-01'), MO.naData(vsR, '2030-01-01')])), [-1, 1, 1, 2]);
// The sheet's spring (ζ 0.9): it lands without a visible bounce (< 0.5 %) and settles within 0.6 s.
for (const k of [380, 420, 520]) {
  const m = { k, z: 0.9, x: 0, v: 0, to: 100 };
  let t = 0, max = 0, fim = false;
  while (!fim && t < 2) { fim = MO.molaPasso(m, 1 / 60); t += 1 / 60; max = Math.max(max, m.x); }
  assert.ok(fim && t < 0.6 && max < 100.5, 'mola k=' + k + ': ' + t.toFixed(3) + ' s, máx. ' + max.toFixed(2));
}
// A story's law-time: a section opening with a year starts at that year's first act; links move it on.
const atosH = { a81: { publicacao: '1981-10-03' }, a94: { publicacao: '1994-08-19' }, a06: { publicacao: '2006-04-17' } };
const lei = MO.leituraDe([
  { t: 'p', partes: ['Antes ', { href: '#/ato/a06', texto: 'x' }] },
  { t: 'h2', texto: '1981: o começo' }, { t: 'p', partes: ['Nada.'] },
  { t: 'h2', texto: '1994: o título' }, { t: 'p', partes: [{ href: '#/ato/a06?ir=generalidade', texto: 'y' }] },
  { t: 'figura', tipo: 'passos', partes: null }],
  atosH, [{ ato: 'a81', data: '1981-10-03' }, { ato: 'a94', data: '1994-08-19' }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(lei.map(x => [x.ate, x.secao, x.atos.length, x.passos]))),
  [[null, null, 1, false], ['1981-10-03', '1981: o começo', 0, false], ['1981-10-03', '1981: o começo', 0, false],
   ['1994-08-19', '1994: o título', 0, false], ['2006-04-17', '1994: o título', 1, false], ['2006-04-17', '1994: o título', 0, true]]);
// A step shows one alínea, or a whole número.
const lsP = ['1 — São portugueses:', 'a) Uns;', 'b) Outros;', '2 — Mais.'];
const rotP = window.RedacaoApp.rotular(lsP);
assert.deepStrictEqual(JSON.parse(JSON.stringify(MO.linhasPasso(lsP, rotP, { n: '1', al: 'b' }))), ['b) Outros;']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(MO.linhasPasso(lsP, rotP, { n: '2', al: null }))), ['2 — Mais.']);

// ---- Who made each law (§6.2), on the shared contract fixture (pipeline/fixtures/contrato) ----
const A = window.RedacaoApp;
const F = path.join(__dirname, '..', 'pipeline', 'fixtures', 'contrato', 'app-data');
let quemCasos = 0;
if (fs.existsSync(path.join(F, 'quem.json'))) {
  const j = f => JSON.parse(fs.readFileSync(path.join(F, f), 'utf8'));
  const ref = { atos: j('atos.json'), quem: j('quem.json'), passagem: j('passagem.json'), governos: j('governos.json'), index: j('index.json') };
  const txt = fs => fs.map(A.textoDe).join(' ');
  const quem = id => { const r = A.registo(ref, id); return txt(A.frasesQuem(r.quem, r.p, r.ato, ref)); };
  // One snapshot per fixture act: the «Quem fez» block as plain text.
  const blocos = {};
  for (const id of Object.keys(ref.quem)) { blocos[id] = quem(id); quemCasos++; }
  const dl = blocos['decreto-lei-901-1977'];
  assert.ok(dl.startsWith('O I Governo Constitucional aprovou este decreto-lei em Conselho de Ministros a 10 de maio de 1977. Primeiro-Ministro: Primeiro-Ministro de teste A. Os partidos não indicaram os ministros deste Governo. Fonte ↗ O Parlamento não votou este texto. O Presidente da República, Presidente de teste A, promulgou-o a 20 de maio de 1977.'), dl);
  assert.ok(blocos['decreto-lei-902-2010'].includes('Partido no Governo: Partido Socialista (PS).'));
  assert.strictEqual(blocos['decreto-lei-903-2012'].split(' O Parlamento')[0],
    'Não sabemos que Governo aprovou este decreto-lei. Não encontrámos a data do Conselho de Ministros no texto do decreto-lei. Porquê? Publicado durante o III Governo Constitucional.');
  // The passage line of an act page (app/motion.js) reads its stages from the data, not from the words.
  const r901 = A.registo(ref, 'lei-901-2020');
  const et = MO.etapasDe(A.frasesQuem(r901.quem, r901.p, r901.ato, ref));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(et.map(e => [e.nome, e.data]))), [['Iniciativa', '2020-02-01'], ['Votação final global', '2020-07-10'],
    ['Tribunal Constitucional', null], ['Veto', '2020-08-20'], ['Confirmação', '2020-09-25'], ['Promulgação', '2020-10-05'], ['Publicação', ref.atos['lei-901-2020'].publicacao],
    ['Entrada em vigor', ref.atos['lei-901-2020'].alteracoes[0].vigor]].filter(x => x[0] !== 'Entrada em vigor' || x[1]));
  const rdl = A.registo(ref, 'decreto-lei-901-1977');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(MO.etapasDe(A.frasesQuem(rdl.quem, rdl.p, rdl.ato, ref)).map(e => e.nome).slice(0, 2))), ['Conselho de Ministros', 'Promulgação']);
  // R-6: a committee text names every initiative, with the part it took; no initiative is singled out.
  const tc = blocos['lei-902-2019'];
  assert.ok(tc.startsWith('Uma comissão do Parlamento juntou 3 iniciativas num só texto: Proposta de Lei n.º 902/XIII, do III Governo Constitucional · Projeto de Lei n.º 901/XIII, de deputados do Bloco de Esquerda (BE) · o artigo 8.º do Projeto de Lei n.º 903/XIII, de deputados do Partido Social Democrata (PSD)'), tc);
  assert.ok(!/principal/i.test(tc));
  for (const id of Object.keys(blocos)) {
    const t = blocos[id] + ' ' + A.textoDe(A.linhaPessoas(null, ref, id));
    assert.ok(!/[Ll]ei do [A-Z][A-Z/-]+\b(?! Governo)|[Pp]roposta do [A-Z]{2,}\b(?! Governo)|Proposta do /.test(t), id + ': ' + t);
    // R-18: procedural verbs only; the President never "aprovou".
    assert.ok(!/chumbou|travou|luz verde|Presidente[^.]*aprovou/.test(t), id + ': ' + t);
    assert.ok(!/%/.test(t));
  }
  // The list of 7 initiatives sits in a fold.
  const r7 = A.registo(ref, 'lei-organica-901-2018');
  const lista7 = A.frasesProponentes(r7.quem, ref, r7.p)[0].filter(x => x && x.t === 'lista')[0];
  assert.strictEqual(lista7.itens.length, 7);
  assert.strictEqual(lista7.dobra, 'Ver as 7 iniciativas');
  const lista3 = A.frasesProponentes(A.registo(ref, 'lei-902-2019').quem, ref)[0].filter(x => x && x.t === 'lista')[0];
  assert.strictEqual(lista3.dobra, null);
  // R-18: the Constitutional Court line comes before the veto line.
  const veto = blocos['lei-901-2020'];
  assert.ok(veto.indexOf('O Tribunal Constitucional decidiu sobre o decreto (Acórdão n.º 9001/2020).') >= 0);
  assert.ok(veto.indexOf('Acórdão n.º 9001/2020') < veto.indexOf('recebeu o veto'));
  assert.ok(veto.indexOf('Votação final global: o Parlamento aprovou o texto a 10 de julho de 2020.') < veto.indexOf('recebeu o veto'));
  assert.ok(veto.includes('O Parlamento confirmou o decreto a 25 de setembro de 2020.'));
  assert.ok(blocos['lei-organica-901-2018'].includes('O Parlamento aprovou um novo decreto a'));
  assert.ok(blocos['lei-constitucional-901-1997'].includes('O Presidente não pode recusar a promulgação de uma revisão constitucional.'));
  assert.ok(blocos['declaracao-de-retificacao-901-2020'].startsWith('Esta declaração corrige erros do texto publicado da Lei n.º 901/2020. Não tem votação. Ver quem fez a Lei n.º 901/2020.'));
  const ac = blocos['acordao-do-tribunal-constitucional-9001-2021'];
  assert.ok(ac.includes('Declarou inconstitucional, com força obrigatória geral, o n.º 2 do artigo 2.º da Lei de teste. A Lei n.º 902/2019 escreveu esse texto. A decisão produz efeitos desde 13 de fevereiro de 2019. Não é um ato do Governo nem do Parlamento.'), ac);
  assert.ok(blocos['decreto-lei-90001'].startsWith('Antes da Constituição de 1976. Assinaram este diploma:'));
  assert.ok(blocos['lei-901-2022'].startsWith('Lei do Orçamento do Estado para 2022. Uma lei do Orçamento do Estado também pode alterar outras leis.'));
  assert.ok(blocos['lei-901-2023'].startsWith('Os dados abertos do Parlamento não incluem esta sessão legislativa. Porquê? Ver na Assembleia da República ↗'));
  // Every reason code is followed by «Porquê?», which opens the limits of the data.
  const rd = A.frasesQuem(A.registo(ref, 'lei-901-2023').quem, null, ref.atos['lei-901-2023'], ref)[0];
  assert.strictEqual(rd.filter(x => x.t === 'link' && x.href === '#/sobre/limites' && x.texto === 'Porquê?').length, 1);
  // Transitional norms (R-45).
  assert.ok(A.textoDe(A.avisoTransitorias(ref.quem['lei-901-2020'], ref.atos['lei-901-2020'])).startsWith('Atenção: esta lei tem uma norma transitória (artigo 5.º da Lei n.º 901/2020).'));
  assert.strictEqual(A.avisoTransitorias(ref.quem['decreto-lei-901-1977'], ref.atos['decreto-lei-901-1977']), null);
  // R-23: the people line, at most 15 words.
  for (const id of Object.keys(ref.quem)) {
    const t = A.textoDe(A.linhaPessoas(null, ref, id));
    assert.ok(t.split(/\s+/).length <= 15, id + ': ' + t);
  }
  assert.strictEqual(A.textoDe(A.linhaPessoas(null, ref, 'decreto-lei-901-1977')), 'Decreto-lei do I Governo Constitucional (Primeiro-Ministro de teste A)');
  assert.strictEqual(A.textoDe(A.linhaPessoas(null, ref, 'lei-901-2020')), 'Proposta de lei do IV Governo Constitucional · aprovada a 10/07/2020');
  assert.strictEqual(A.textoDe(A.linhaPessoas(null, ref, 'lei-902-2019')), 'Texto da comissão (3 iniciativas) · aprovado a 18/01/2019');
  // R-22: every redação by the OE act gets the OE sentence instead of the people line.
  const artigos = fs.readdirSync(path.join(F, 'd', 'lei-teste')).map(f => j('d/lei-teste/' + f));
  let oe = 0;
  for (const art of artigos) for (const v of art.versoes) if (v.ato === 'lei-901-2022') {
    oe++;
    assert.strictEqual(A.textoDe(A.fraseOE(ref.quem[v.ato])), 'Lei do Orçamento do Estado para 2022, proposta pelo IV Governo Constitucional. Não sabemos ainda quem propôs a redação deste artigo.');
  }
  assert.ok(oe >= 1);
  // VFG line (R-17) and events.
  assert.strictEqual(A.textoDe(A.linhaVfg({ data: '2023-07-19', unanime: true, resultado: 'Aprovado' })), 'Votação final global: o Parlamento aprovou o texto a 19 de julho de 2023, por unanimidade.');
  assert.strictEqual(A.textoDe(A.linhaVfg(null, null)), 'Não temos o registo da votação final global.');
  assert.strictEqual(A.textoDe(A.linhaVfg(null, 'voto_ambiguo')), 'A mesma iniciativa deu origem a vários decretos. Não sabemos qual destes votos é o desta lei. Porquê?');
  // The timeline row of a lei voted under another Government.
  const row = A.linhaAto('lei-901-2020', ref, { slug: 'lei-teste', governoPeriodo: 3 }).map(A.textoDe);
  assert.strictEqual(row[1], 'Proposta de lei do IV Governo Constitucional. Votada durante o III Governo Constitucional.');
  assert.ok(row.includes('Alterou 1 artigo deste diploma. Ver o que mudou'));
  assert.ok(row.includes('Retificada pela Declaração de Retificação n.º 901/2020, de 10 de novembro.'));
  // Groups: the name of a sigla in its legislatura (R-5, R-32).
  const cds = A.nomeGrupo('CDS', 'II', ref.governos);
  assert.strictEqual(cds.id, 'cds-pp');
  assert.ok(cds.nome && cds.nome !== 'CDS', JSON.stringify(cds));
  assert.strictEqual(A.nomeGrupo('XYZ', 'II', ref.governos), null);
  const ordem = ref.governos.legislaturas.map(l => l.sigla);
  assert.strictEqual(A.faixasLegislaturas(['II', 'III'], ordem), 'II e III');
  assert.strictEqual(A.faixasLegislaturas(['VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII'], ordem), 'VIII a XVII');
  assert.strictEqual(A.faixasLegislaturas(['II', 'III', 'IV', 'VI'], ordem), 'II a IV, VI');
  // Glossary marks: one per term per section, none in a quotation, only terms of the built glossary.
  const g = j('glossario.json');
  const ids = A.termosPara(g, ['decreto-lei', 'votacao-final-global', 'nao-existe']);
  assert.strictEqual(Object.keys(ids).sort().join(','), 'decreto-lei,votacao-final-global');
  const vistos = new Set();
  const m1 = A.marcarTermos(['Votação final global: o Parlamento aprovou este decreto-lei e outro decreto-lei.'], vistos, ids);
  const m2 = A.marcarTermos(['Outra votação final global.', { t: 'citacao', texto: '«o decreto-lei»', href: '#/x' }], vistos, ids);
  const marcas = m1.concat(m2).filter(x => x && x.t === 'termo');
  assert.strictEqual(marcas.map(x => x.id).join(','), 'votacao-final-global,decreto-lei');
  assert.strictEqual(marcas[0].texto, 'Votação final global');
  assert.strictEqual(A.textoDe(m1), 'Votação final global: o Parlamento aprovou este decreto-lei e outro decreto-lei.');
  assert.strictEqual(A.marcarTermos([{ t: 'termo', id: 'nao-existe', texto: 'x' }], new Set(), ids)[0], 'x');
  // Sharing: a key per redação that survives a reorder; the /p/ page only when the build made it.
  const art1 = artigos.find(a => a.id === 'artigo-1') || j('d/lei-teste/artigo-1.json');
  const chaves = art1.versoes.map((v, i) => A.chavePartilha(art1, i));
  const outra = { versoes: art1.versoes.slice(1).concat([art1.versoes[0]]) };
  outra.versoes.forEach((v, i) => assert.strictEqual(A.chavePartilha(outra, i), chaves[art1.versoes.indexOf(v)]));
  assert.strictEqual(A.chavePartilha({ versoes: [{ ato: 'lei-25-94' }, { ato: 'x' }, { ato: 'lei-25-94' }] }, 2), 'lei-25-94-2');
  const pj = j('partilha.json');
  assert.strictEqual(A.partilhaUrl(pj.base, pj, 'lei-teste', 'artigo-1', 'lei-901-2020'), pj.base + 'p/d/lei-teste/artigo-1/lei-901-2020/');
  assert.ok(A.partilhaUrl(pj.base, pj, 'lei-teste', 'artigo-2', 'lei-901-2020').startsWith(pj.base + '#/d/lei-teste/artigo-2'));
  assert.strictEqual(A.resolve({ versoes: [{ ato: 'a' }, { ato: 'b' }, { ato: 'a' }] }, 'a-2'), 2);
  // Titles (R-63).
  assert.strictEqual(A.tituloDe(['d', 'lei-teste'], { index: ref.index }), 'Lei de teste · Redação');
  assert.strictEqual(A.tituloDe(['quem', 'lei-teste'], { index: ref.index }), 'Quem fez cada alteração · Lei de teste · Redação');
  assert.strictEqual(A.tituloDe([], {}), 'Redação');
  assert.strictEqual(A.tituloDe(['glossario']), 'Glossário · Redação');
  assert.strictEqual(A.tituloDe(['grupo', 'be'], { grupo: { nome: 'Bloco de Esquerda (BE)' } }), 'Grupo parlamentar: Bloco de Esquerda (BE) · Redação');
}
assert.strictEqual(A.ordinalExtenso(15), 'décimo quinto');
assert.strictEqual(A.ordinalExtenso(25), 'vigésimo quinto');
assert.strictEqual(A.ordinalExtenso(20), 'vigésimo');
assert.strictEqual(A.ordinalExtenso(1), 'primeiro');
// R-31: how often a diploma changed.
assert.strictEqual(A.metaDiploma({ n_artigos: 296, n_atos: 7 }), '296 artigos · alterado 7 vezes');
assert.strictEqual(A.metaDiploma({ n_artigos: 3, n_atos: 1 }), '3 artigos · alterado uma vez');
assert.strictEqual(A.metaDiploma({ n_artigos: 1, n_atos: 0 }), '1 artigo · nunca alterado');
// R-7: copies of another diploma's articles come after the article itself.
assert.strictEqual(search({ sinonimos: [], diplomas: [{ slug: 'nrau', sigla: 'NRAU' }, { slug: 'codigo-civil', sigla: 'CC' }], pesquisa: [
  ['nrau', 'artigo-1083', 'Artigo 1083.º', 'Fundamento da resolução do arrendamento', 'vigente', 'codigo-civil'],
  ['codigo-civil', 'artigo-1083', 'Artigo 1083.º', 'Fundamento da resolução do arrendamento', 'vigente', null],
] }, 'artigo 1083 arrendamento').map(r => r[0] + '/' + r[1]).join(','), 'codigo-civil/artigo-1083,nrau/artigo-1083');
// Story figures: labels of each line, the `mostrar` selection and the gap lines (pipeline/historias.py).
{
  const rots = A.rotular(['1 — O Governo concede:', 'a) Serem maiores;', 'b) Residirem;', 'c) Conhecerem;', '2 — Outro número.', '3 — E outro.']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rots[2])), { n: '1', al: 'b', abre: false });
  const sel = rots.map(r => A.escolhida(r, [{ n: '1', al: 'b' }]));
  assert.deepStrictEqual(sel, [true, false, true, false, false, false]);   // the número's opening line is context
  assert.strictEqual(A.linhaFalta([rots[1]]), '⋯ alínea a) não mostrada');
  assert.strictEqual(A.linhaFalta([rots[3], rots[4], rots[5]]), '⋯ alínea c) e n.os 2 a 3 não mostrados');
  assert.strictEqual(A.linhaFalta([rots[4]]), '⋯ n.º 2 não mostrado');
  assert.strictEqual(A.linhaFalta([{ n: '', al: null, abre: false }, { n: '', al: null, abre: false }]), '⋯ 2 parágrafos não mostrados');
  assert.ok(A.escolhida(rots[4], null));
  assert.strictEqual(A.curtoAto('Lei Orgânica n.º 2/2006'), 'LO 2/2006');
  assert.strictEqual(A.curtoAto('Lei n.º 25/94'), 'Lei 25/94');
  assert.strictEqual(A.curtoAto('Decreto-Lei n.º 194/2003'), 'DL 194/2003');
}
// ---- Origem do texto (FINAL-SPEC §12.1): rules R1–R5, the scope, the notes and the sheet ----
let origemCasos = 0;
const J = x => JSON.parse(JSON.stringify(x));  // objects from the app's context have another prototype
{
  const v = (ato, tipo, linhas) => ({ ato, tipo, publicacao: '2000-01-01', linhas: linhas || [] });
  // R1: punctuation does not take the note; it is listed as «(só pontuação)».
  let m = A.origemLinhas({ versoes: [v('a', 'original'), v('b', 'alterado'), v('c', 'alterado', [[[0, '1 — A casa'], [2, ','], [0, ' fica.']]])] }, 2);
  assert.strictEqual(m.linhas[0].key, 0);
  assert.ok(m.linhas[0].pont.includes(2));
  m = A.origemLinhas({ versoes: [v('a', 'original'), v('b', 'alterado'), v('c', 'alterado', [[[0, '1 — A casa'], [2, ','], [0, ' fica '], [1, 'mãe']]])] }, 2);
  assert.strictEqual(m.linhas[0].key, 1);
  // R1: a label change («2-» to «2 —») does not either.
  m = A.origemLinhas({ versoes: [v('a', 'original'), v('b', 'alterado', [[[0, '2'], [1, '-'], [0, ' Existe posse']]])] }, 1);
  assert.strictEqual(m.linhas[0].key, 0);
  assert.strictEqual(m.linhas[0].nr, '2 —');
  assert.strictEqual(m.linhas[0].spans.map(s => s.text).join(''), 'Existe posse');
  // R4: a span with no letter or digit is not a phrase.
  assert.ok(m.frases.every(f => /[\p{L}\p{N}]/u.test(f.text)));
  // R5: a synthetic article with 15 amending acts: 7 solid, 7 dashed, then act-7 dotted.
  const quinze = [v('o', 'original')];
  for (let i = 1; i <= 15; i++) quinze.push(v('a' + i, 'alterado'));
  quinze[15].linhas = [quinze.map((x, i) => [i, 'palavra' + i + ' '])];
  const cor = J(A.origemLinhas({ versoes: quinze }, 15).cor);
  assert.strictEqual(cor[0], undefined);  // the original text is never underlined
  assert.deepStrictEqual(cor[15], { c: 1, padrao: '' });
  assert.deepStrictEqual(cor[8], { c: 1, padrao: 'tracejado' });
  assert.deepStrictEqual(cor[1], { c: 7, padrao: 'pontilhado' });
  // The scope, as people say it.
  const L = (kind, n, al) => ({ kind, n, al });
  assert.strictEqual(A.escopoLinhas([L('n', '1'), L('al', '1', 'a'), L('n', '10')]), 'N.º 1 a n.º 10');
  assert.strictEqual(A.escopoLinhas([L('al', '11', 'a'), L('al', '11', 'b')]), 'N.º 11, alíneas a) e b)');
  assert.strictEqual(A.escopoLinhas(['a', 'b', 'c', 'd', 'e', 'f'].map(x => L('al', '14', x))), 'N.º 14, alíneas a) a f)');
  assert.strictEqual(A.escopoLinhas([L('', null)].concat(['a', 'b', 'c', 'd', 'e'].map(x => L('al', null, x)))), 'Corpo do artigo e alíneas a) a e)');
  assert.strictEqual(A.escopoLinhas([L('al', '1', 'b')]), 'N.º 1, alínea b)');
  assert.strictEqual(A.escopoLinhas([L('al', null, 'b')]), 'Alínea b)');
  assert.strictEqual(A.escopoLinhas([L('n', '2'), L('al', '2', 'a'), L('al', '2', 'b'), L('al', '2', 'c')]), 'N.º 2 e alíneas a) a c)');
  assert.strictEqual(A.escopoLinhas([L('al', '1', 'd'), L('n', '2'), L('n', '10')]), 'N.º 1, alínea d), a n.º 10');
  // No step-2 content and no mock: the only «exemplo» in app.js is the search field's.
  const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.ok(!/simulad|fictíc/i.test(src));
  assert.deepStrictEqual(src.match(/exemplo/gi), ['exemplo']);
  assert.ok(/Por exemplo: «art 87 circ»/.test(src));
  origemCasos += 20;
}
if (fs.existsSync(path.join(__dirname, 'data', 'quem.json'))) {
  const D = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
  const ref = { atos: D('atos.json'), quem: D('quem.json'), passagem: D('passagem.json'), governos: D('governos.json'), index: D('index.json') };
  // Parties of Governments XVII to XXV (pipeline/governos.json, docs/QUEM.md §1.1): only parties with ministers.
  const gv = r => ref.governos.governos.find(g => g.romano === r);
  assert.deepStrictEqual(gv('XXI').partidos, ['ps']);
  assert.deepStrictEqual(gv('XIX').partidos, ['psd', 'cds-pp']);
  assert.ok(ref.governos.governos.every(g => g.partidos !== null), 'every Government has its parties');
  assert.strictEqual(A.textoDe(A.frasePartidos(gv('XXI'), ref, 'XIII')), 'Partido no Governo: Partido Socialista (PS). Fonte ↗');
  assert.strictEqual(A.textoDe(A.fraseNotaPartidos(gv('XXI'), ref, 'XIII')),
    'O Bloco de Esquerda (BE), o Partido Comunista Português (PCP) e o Partido Ecologista "Os Verdes" (PEV) apoiaram o Governo no Parlamento. Estes partidos não tiveram membros no Governo. Fonte ↗');
  assert.ok(/^Partidos no Governo: .+ \(PSD\), .+ \(CDS-PP\)\. Fonte ↗$/.test(A.textoDe(A.frasePartidos(gv('XIX'), ref, 'XII'))));
  assert.strictEqual(A.textoDe(A.fraseNotaPartidos(gv('XXIV'), ref, 'XVI')), 'O Partido Popular Monárquico (PPM) também fez parte da coligação eleitoral, mas não teve ministros. Fonte ↗');
  assert.strictEqual(A.fraseNotaPartidos(gv('XIX'), ref, 'XII'), null);
  assert.strictEqual(A.fraseNotaPartidos(gv('III'), ref, 'I'), null);  // «presidencial» has its own sentence
  // A decree-law of the XXI Government says both sentences.
  const dl21 = Object.keys(ref.quem).find(id => ref.quem[id].tipo_ato === 'decreto-lei' && ref.quem[id].d_cm && (ref.quem[id].governo || {}).numero === 21);
  if (dl21) {
    const r21 = A.registo(ref, dl21), t21 = A.frasesQuem(r21.quem, r21.p, r21.ato, ref).map(A.textoDe).join(' ');
    assert.ok(t21.includes('Partido no Governo: Partido Socialista (PS). Fonte ↗ O Bloco de Esquerda (BE)'), t21);
  }
  const modelo =(dip, artigo) => { const art = D('d/' + dip + '/' + artigo + '.json'); return { art, m: A.originModel(art, art.versoes.length - 1, ref.atos, null, null) }; };
  // Runs (R2) on real articles.
  const ln6 = modelo('lei-nacionalidade', 'artigo-6');
  assert.strictEqual(ln6.m.runs.length, 4);
  assert.deepStrictEqual(J(ln6.m.runs[0].linhas.map(l => l.i)), Array.from({ length: 22 }, (_, i) => i));
  assert.strictEqual(ln6.m.runs[0].ato, 'lei-organica-1-2026');
  assert.strictEqual(ln6.m.runs[1].ato, 'declaracao-de-retificacao-17-2026-1');
  const cc1653 = modelo('codigo-civil', 'artigo-1653');
  assert.strictEqual(cc1653.m.runs[0].ato, 'decreto-lei-273-2001');
  assert.strictEqual(cc1653.m.runs[0].linhas.length, 1);
  assert.strictEqual(cc1653.m.runs[1].ato, 'decreto-lei-47344');
  // R1 on real data: the punctuation-only Declaração de Rectificação n.º 20-AS/2001 is listed, not noted.
  const r20 = cc1653.art.versoes.findIndex(x => /20-as-2001/.test(x.ato));
  if (r20 >= 0) assert.ok(cc1653.m.runs[0].pont.includes(r20) || !cc1653.m.runs[0].older.includes(r20));
  // R4 and a regression guard on the phrases of LN art. 6.º; «sete» is phrase 2:4 (frase=2:4).
  assert.ok(ln6.m.frases.every(f => /[\p{L}\p{N}]/u.test(f.text)));
  assert.strictEqual(ln6.m.frases.length, 103);
  const sete = ln6.m.frases.find(f => f.linha === 2 && f.si === 4);
  assert.strictEqual(sete && sete.text.trim(), 'sete');
  // R5: 8 amending acts in LN art. 6.º, 7 solid and 1 dashed (Lei n.º 25/94); no two share a mark.
  const cores = J(ln6.m.cor), os = Object.keys(cores);
  assert.strictEqual(os.length, 8);
  assert.strictEqual(os.filter(o => cores[o].padrao === '').length, 7);
  assert.strictEqual(ln6.art.versoes[os.find(o => cores[o].padrao === 'tracejado')].ato, 'lei-25-94');
  assert.strictEqual(new Set(os.map(o => cores[o].c + cores[o].padrao)).size, 8);
  // No corpus article reaches a dotted act (more than 14 amending acts in one redação).
  // The notes (§2.2 and §6), exactly.
  const nota = id => J(A.notaOrigem(ref, id, false, 'N.º 1 a n.º 10'));
  const notas = {
    'lei-organica-1-2026': ['Iniciativa do XXV Governo (Luís Montenegro) · texto da comissão', 'Aprovada a 28/10/2025, veto e novo decreto · promulgada por António José Seguro'],
    'lei-31-2012': ['Iniciativa do XIX Governo (Pedro Passos Coelho)'],
    'lei-43-2017': ['Iniciativa de deputados do PCP'],
    'lei-organica-2-2006': ['Iniciativas do XVII Governo e de deputados de 5 grupos · texto da comissão'],
    'lei-13-2019': ['Iniciativas do XXI Governo e de deputados do PSD e do BE · texto da comissão'],
    'lei-organica-1-2024': ['Iniciativas de deputados de 6 grupos · texto da comissão'],
    'lei-organica-2-2020': ['Não temos os dados do Parlamento.', 'Promulgada por Marcelo Rebelo de Sousa'],
    'lei-37-81': ['Iniciativas do VII Governo e de deputados do PS e da ASDI', 'Sem registo da votação final · promulgada por António Ramalho Eanes'],
    'decreto-lei-273-2001': ['Decreto-lei do XIV Governo (António Guterres)', 'O Parlamento não votou este texto.'],
    'decreto-lei-496-77': ['Decreto-lei. Não sabemos que Governo o aprovou.', 'O Parlamento não votou este texto.'],
    'decreto-lei-47344': ['Antes da Constituição de 1976.', 'O Parlamento não votou este texto.'],
    'declaracao-de-retificacao-17-2026-1': ['Corrigiu o texto publicado da Lei Orgânica n.º 1/2026.', 'Não tem votação.'],
  };
  for (const [id, [l1, l2]] of Object.entries(notas)) {
    const n = nota(id);
    assert.strictEqual(n.l1, l1, id);
    if (l2) assert.strictEqual(n.l2, l2, id);
    assert.strictEqual(n.aria.split(', de ' + n.ano + '.').length, 2, id + ': ' + n.aria);  // the year said once
    origemCasos++;
  }
  assert.strictEqual(nota('lei-organica-1-2026').aria, 'Lei Orgânica n.º 1/2026, de 2026. Iniciativa do XXV Governo (Luís Montenegro), texto da comissão. N.º 1 a n.º 10. Abrir quem fez.');
  // Committee texts and vote differences in the sheet.
  const conta = id => A.contaOrigem(ref, id, { porque: '#/x' });
  const txt = c => (c.honesta ? A.textoDe(c.honesta) + ' ' : '') + c.seccoes.map(s => (s.titulo || '') + ' ' + (s.glossa ? A.textoDe(s.glossa) : '') + ' ' + (s.frases || []).map(A.textoDe).join(' ') + (s.nomes || []).join(' ')).join(' ');
  const lo1 = txt(conta('lei-organica-1-2026'));
  assert.ok(lo1.includes('Votou de forma diferente da generalidade: JPP (abstenção, depois a favor).'), lo1);
  assert.ok(lo1.includes('Votou de forma diferente da votação final global: JPP (a favor, depois abstenção).'), lo1);
  assert.ok(lo1.includes('O Tribunal Constitucional decidiu sobre o decreto (Acórdão n.º 1133/2025).'));
  const p1 = ref.passagem['lei-organica-1-2026'];
  assert.strictEqual(A.textoDe(A.linhaDiferencas(p1.vfg, A.votoNovoDecreto(p1), 'vfg')), 'Votou de forma diferente da votação final global: JPP (a favor, depois abstenção).');
  const l13 = txt(conta('lei-13-2019'));
  assert.ok(l13.includes('Uma comissão do Parlamento juntou 3 iniciativas num só texto (texto de substituição):'), l13);
  assert.ok(l13.includes('Projeto de Lei n.º 847/XIII'), l13);
  assert.ok(l13.includes('Proposta de Lei n.º 129/XIII foi para a comissão sem votação na generalidade.'), l13);
  const lo2 = txt(conta('lei-organica-2-2006'));
  assert.ok(lo2.includes('O Parlamento votou cada iniciativa em separado, sobre o seu próprio texto.'), lo2);
  assert.ok(lo2.includes('Ver as outras 4 votações'), lo2);
  assert.ok(txt(conta('lei-37-81')).includes('Não temos o registo da votação final global. Porquê?'));
  const dl = txt(conta('decreto-lei-273-2001'));
  assert.ok(dl.includes('O Parlamento não votou este texto. Antes, o Parlamento autorizou o Governo a legislar nesta matéria (Lei n.º 82/2001).'), dl);
  assert.ok(txt(conta('decreto-lei-47344')).includes('Ver as 17 pessoas que assinaram'));
  // The honesty line: every law, and no decree-law, retificação or act before 1976.
  const estilo = [];
  const sigla = '(?:ASDI|BE|CDS-PP|CDS|CH|IL|JPP|L|PAN|PCP|PEV|PPD/PSD|PSD|PS|UDP|UEDS|PRD|PPM|MDP/CDE)';
  for (const id of Object.keys(ref.quem)) {
    const t = ref.quem[id].tipo_ato, c = conta(id), n = nota(id);
    if (/^lei/.test(t)) assert.ok(c.honesta && A.textoDe(c.honesta).startsWith('Mostramos quem apresentou a iniciativa'), id);
    if (['decreto-lei', 'retificacao', 'pre1976'].includes(t)) assert.strictEqual(c.honesta, null, id);
    // No note shows a vote; no sigla list longer than 4.
    assert.ok(!/favor|contra|abstenção/.test(n.l1 + ' ' + n.l2), id + ': ' + n.l1 + ' ' + n.l2);
    assert.ok(!new RegExp('(?:do|da) ' + sigla + '(?:, (?:do|da) ' + sigla + '){4}').test(n.l1), id);
    const todos = [n.l1, n.l2, txt(c), A.confiancaOrigem(ref, id)];
    for (const s of todos) assert.ok(!new RegExp('escrit\\w*\\W{1,3}(?:\\w+\\W{1,3}){0,2}' + sigla + '\\b').test(s), id + ': ' + s);
    estilo.push(...todos);
    origemCasos++;
  }
  // Siglas in a note follow the AR order of the legislatura (R6).
  for (const id of Object.keys(ref.quem)) {
    const p = ref.passagem[id], l1 = nota(id).l1, ss = (l1.match(new RegExp('(?:do|da) ' + sigla + '(?=,| e |$| ·)', 'g')) || []).map(x => x.slice(3));
    if (p && ss.length > 1) { const o = ss.map(s => p.ordem_grupos.indexOf(s)); assert.deepStrictEqual(o.slice().sort((a, b) => a - b), o, id); }
  }
  // Neutrality (rule 8.2): every note and sheet string through tools/estilo.py's list.
  const tmp = path.join(require('os').tmpdir(), 'redacao-origem-textos.json');
  fs.writeFileSync(tmp, JSON.stringify(estilo));
  const py = require('child_process').spawnSync('python3', ['-I', '-c',
    'import json, sys; sys.path.insert(0, sys.argv[1]); import estilo; ' +
    'e = [(t[:80], m) for t in json.load(open(sys.argv[2], encoding="utf-8")) for _, _, m in estilo.check_neutralidade(t)]; print(json.dumps(e, ensure_ascii=False))',
    path.join(__dirname, '..', 'tools'), tmp], { encoding: 'utf8' });
  assert.strictEqual(py.status, 0, py.stderr);
  assert.deepStrictEqual(JSON.parse(py.stdout), []);
  // «Copiar ligação» names the act, the source and the date.
  const cp = A.textoCopiar(ref, { diploma: 'Lei da Nacionalidade', artigo: 'Artigo 6.º', escopo: 'N.º 1 a n.º 10', id: 'lei-organica-1-2026', consultado: '2026-10-28', url: 'https://x/#/d/lei-nacionalidade/artigo-6' });
  assert.strictEqual(cp, 'Lei da Nacionalidade, art. 6.º, n.º 1 a n.º 10 · Origem do texto: Lei Orgânica n.º 1/2026. Fonte: Diário da República e Assembleia da República. Consultado a 28/10/2026. https://x/#/d/lei-nacionalidade/artigo-6');
  // The summary line has no counts.
  assert.strictEqual(A.textoDe(A.resumoOrigem(ln6.m, ln6.art, ref)), 'Este texto vem de diplomas publicados entre 1981 e 2026. O diploma mais recente é a Declaração de Retificação n.º 17/2026/1.');
}
// R-25: the old sentence is gone.
assert.ok(!fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').includes('Não temos dados deste ato no Parlamento.'));

console.log('ok: ' + cases.length + ' diff cases, 10 URL cases, 6 search cases, 3 diploma-diff cases, motion helpers' + (pairs ? ', ' + pairs + ' version pairs rebuild exactly' : '') +
  (quemCasos ? ', ' + quemCasos + ' fixture acts' : ', no fixture') + ', ' + origemCasos + ' origem cases');
