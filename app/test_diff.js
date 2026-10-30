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
// R-25: the old sentence is gone.
assert.ok(!fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').includes('Não temos dados deste ato no Parlamento.'));

console.log('ok: ' + cases.length + ' diff cases, 10 URL cases, 6 search cases, 3 diploma-diff cases' + (pairs ? ', ' + pairs + ' version pairs rebuild exactly' : '') +
  (quemCasos ? ', ' + quemCasos + ' fixture acts' : ', no fixture'));
