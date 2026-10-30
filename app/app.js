/* Redação: a version history of Portuguese law.
   A static app: data/ comes from pipeline/build.py, ds/ is the Redação design system. */
(function () {
  var h = React.createElement;
  var R = window.Redacao;
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;

  // ---- Data -------------------------------------------------------------------------------
  // Loaded files stay in memory. A page whose files are all loaded renders at once, without a
  // loading state, so moving between pages never flashes "A carregar…".
  var cache = {}, valores = {};
  // A path that starts with "?" is optional: a missing file gives null (files the pipeline adds
  // later, or that a lenient build left out).
  function load(path) {
    if (!cache[path]) {
      var opcional = path.charAt(0) === '?', f = opcional ? path.slice(1) : path;
      cache[path] = fetch('data/' + f).then(function (r) {
        if (!r.ok) { if (opcional) return null; throw new Error(f + ': ' + r.status); }
        return r.json();
      }).then(function (j) { valores[path] = j; return j; }, function (e) { if (opcional) { valores[path] = null; return null; } throw e; });
    }
    return cache[path];
  }
  function useData(paths) {
    var key = paths.join('|');
    var pronto = paths.every(function (p) { return p in valores; });
    var st = useState({ key: null, data: null, error: null });
    useEffect(function () {
      if (pronto) return;
      var alive = true;
      Promise.all(paths.map(load)).then(function (d) { if (alive) st[1]({ key: key, data: d, error: null }); },
        function (e) { if (alive) st[1]({ key: key, data: null, error: e }); });
      return function () { alive = false; };
    }, [key]);
    if (pronto) return { data: paths.map(function (p) { return valores[p]; }), error: null };
    return st[0].key === key ? st[0] : { data: null, error: null };
  }

  // ---- Routing ----------------------------------------------------------------------------
  function parseHash() {
    var raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    var parts = raw.split('?');
    var q = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      q[kv.slice(0, i < 0 ? kv.length : i)] = i < 0 ? '' : kv.slice(i + 1);
    });
    return { segs: parts[0].split('/').filter(Boolean), q: q };
  }
  function link(segs, q) {
    var qs = q ? Object.keys(q).filter(function (k) { return q[k] != null && q[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&') : '';
    return '#/' + segs.map(encodeURIComponent).join('/') + (qs ? '?' + qs : '');
  }
  // A new page scrolls to the top. Another redação of the same article keeps the reader's place.
  var lastPath = null;
  function useRoute() {
    var st = useState(parseHash());
    useEffect(function () {
      lastPath = location.hash.split('?')[0];
      function on() {
        var path = location.hash.split('?')[0];
        st[1](parseHash());
        if (path !== lastPath) window.scrollTo({ top: 0, behavior: 'instant' });
        lastPath = path;
      }
      window.addEventListener('hashchange', on);
      return function () { window.removeEventListener('hashchange', on); };
    }, []);
    return st[0];
  }

  // ---- Dates ------------------------------------------------------------------------------
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function extenso(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return Number(p[2]) + ' de ' + MESES[Number(p[1]) - 1] + ' de ' + p[0];
  }
  function semAno(iso) { var p = iso.split('-'); return Number(p[2]) + ' de ' + MESES[Number(p[1]) - 1]; }
  function curta(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function hoje() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null; }
  function diaAntes(iso) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  function abrev(iso) { if (!iso) return ''; var p = iso.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].slice(0, 3) + '. ' + p[0]; }

  // ---- Who made each law: the copy ----------------------------------------------------------
  // One source of sentences for the act page, the register, the timeline, the group pages and the
  // stories. The functions return partes: strings and small objects that render() turns into
  // elements and textoDe() into plain text (node tests read that). The pipeline writes facts and
  // reason codes; the words are here.
  // partes: string | {t:'link', href, texto} | {t:'termo', id, texto} | {t:'sigla', sigla, nome}
  //   | {t:'governo', numero} | {t:'forte', texto} | {t:'lista', itens: [partes], dobra?} | {t:'votos', ato}
  // ref: {atos, quem, governos, passagem, index}, any of them possibly missing.
  var MOTIVOS = {
    sem_d_cm: 'Não encontrámos a data do Conselho de Ministros no texto do decreto-lei.',
    sem_link: 'Não temos a ligação ao Diário da República deste ato.',
    sem_texto: 'O Diário da República não tem o texto deste ato em formato que possamos ler.',
    por_ler: 'Ainda não lemos as assinaturas deste ato no Diário da República.',
    sessao_em_falta: 'Os dados abertos do Parlamento não incluem esta sessão legislativa.',
    sem_ar: 'Não encontrámos esta lei nos dados abertos do Parlamento.',
    antes_1976: 'Antes da Constituição de 1976.',
    antes_governo_constitucional: 'Aprovado antes do I Governo Constitucional.',
    tabela_aberta: 'Ainda não confirmámos este facto na nossa tabela.',
    conflito: 'As fontes não concordam. Ainda não confirmámos este facto.',
    voto_ambiguo: 'A mesma iniciativa deu origem a vários decretos. Não sabemos qual destes votos é o desta lei.',
    passos_descartados: 'As datas do Parlamento para esta lei não estão em ordem. Por isso, não as mostramos.',
    sem_registo_vfg: 'Não temos o registo da votação final global.',
    sem_generalidade: 'Não temos o registo da votação na generalidade.'
  };
  // The sentence of a reason code and the link that explains the limits of the data.
  function motivo(code) { return MOTIVOS[code] ? [MOTIVOS[code], ' ', lig('#/sobre/limites', 'Porquê?')] : []; }
  function lig(href, texto) { return { t: 'link', href: href, texto: texto }; }
  function gov(n) { return { t: 'governo', numero: n }; }
  function textoDe(partes) {
    return (partes || []).map(function (x) {
      if (typeof x === 'string') return x;
      if (!x) return '';
      if (x.t === 'governo' && x.numero != null) return romano(x.numero) + ' Governo Constitucional';
      if (x.t === 'sigla') return x.sigla;
      if (x.t === 'lista') return ' ' + x.itens.map(textoDe).join(' · ');
      if (x.partes) return textoDe(x.partes);
      return x.texto || '';
    }).join('');
  }
  function romano(n) {
    var r = '';
    [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
      .forEach(function (x) { while (n >= x[0]) { r += x[1]; n -= x[0]; } });
    return r;
  }
  // "décimo quinto": how a screen reader says the number of a Government (1 to 39).
  var UNIDADES = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
  var DEZENAS = ['', 'décimo', 'vigésimo', 'trigésimo'];
  function ordinalExtenso(n) { return [DEZENAS[Math.floor(n / 10)], UNIDADES[n % 10]].filter(Boolean).join(' '); }
  // "a Lei n.º 2/2020", "o Decreto-Lei n.º 10/2024": the article that goes with a designation.
  function feminino(des) { return !/^(Decreto|Acórdão|Despacho|Projeto|Texto|Aviso|Regulamento|Código|Assento)/.test(des || ''); }
  function aDe(des) { return feminino(des) ? 'a' : 'o'; }
  function daDe(des) { return feminino(des) ? 'da' : 'do'; }
  // "Lei n.º 31/2012, de 14 de agosto"; "Decreto-Lei n.º 47344, de 25 de novembro de 1966" (no year in the number).
  function nomeCompleto(ato) {
    if (!ato || !ato.publicacao) return ato ? ato.designacao : '';
    return ato.designacao + ', de ' + (/\/\d{2,4}(\/\d+)?$/.test(ato.designacao) ? semAno(ato.publicacao) : extenso(ato.publicacao));
  }
  // The kind of act, when quem.json does not say it (before the pipeline writes tipo_ato).
  function tipoDe(des) {
    des = des || '';
    if (/^Lei Constitucional/.test(des)) return 'lei-constitucional';
    if (/^Lei Orgânica/.test(des)) return 'lei-organica';
    if (/^Lei\b/.test(des)) return 'lei';
    if (/^Decreto-Lei/.test(des)) return 'decreto-lei';
    if (/Retifica|Rectifica/.test(des)) return 'retificacao';
    if (/^Acórdão do Tribunal Constitucional/.test(des)) return 'acordao-tc';
    if (/^Acórdão/.test(des)) return 'acordao-outro';
    if (/^Decreto de Aprovação da Constituição/.test(des)) return 'aprovacao-constituicao';
    return 'outro';
  }
  var LEIS = { lei: 1, 'lei-organica': 1, 'lei-constitucional': 1 };
  function governoDe(ref, n) { return n == null || !ref.governos ? null : (ref.governos.governos || []).filter(function (g) { return g.numero === n; })[0] || null; }
  function presidenteDe(ref, id) { return id == null || !ref.governos ? null : (ref.governos.presidentes || []).filter(function (p) { return p.id === id; })[0] || null; }
  // The group a sigla named in one legislatura, and its name in the Assembleia's records.
  function nomeGrupo(sigla, leg, gj) {
    if (!gj || !sigla) return null;
    var grupos = gj.grupos || {}, id = ((gj.siglas || {})[leg] || {})[sigla];
    if (!id) Object.keys(grupos).forEach(function (k) { if (!id && (grupos[k].nomes || []).some(function (x) { return x.sigla === sigla; })) id = k; });
    if (!id || !grupos[id]) return null;
    var ns = grupos[id].nomes || [];
    var n = ns.filter(function (x) { return x.sigla === sigla && (x.legislaturas || []).indexOf(leg) >= 0; })[0] || ns.filter(function (x) { return x.sigla === sigla; })[0];
    return { id: id, nome: n ? n.nome : sigla };
  }
  // {sigla: name} for the groups of one legislatura, for R.Votacao.
  function nomesDe(ref, leg) {
    var out = {}, gj = ref.governos;
    if (!gj) return out;
    Object.keys((gj.siglas || {})[leg] || {}).forEach(function (s) { var g = nomeGrupo(s, leg, gj); if (g) out[s] = g.nome; });
    return out;
  }
  function legDe(designacao) { var m = /\/([IVXLC]+|Constituinte)$/.exec(designacao || ''); return m ? m[1] : null; }
  // "do Bloco de Esquerda", "da Iniciativa Liberal".
  var GRUPO_F = /^(Iniciativa|Ac?ção|União|Intervenção|Aliança|Frente|Associação|Coligação|Nova|Renovação)\b/;
  function doGrupo(nome) { return (GRUPO_F.test(nome) ? 'da ' : 'do ') + nome; }
  function grupoComNome(g, leg, ref) {
    var n = nomeGrupo(g.sigla, leg, ref.governos);
    return n && n.nome !== g.sigla ? doGrupo(n.nome) + ' (' + g.sigla + ')' : 'do ' + g.sigla;
  }
  function nomesSemGrupo(p) { return (p.sem_grupo || []).map(function (x) { return typeof x === 'string' ? x : x.nome; }).filter(Boolean); }
  // Who presented one initiative: as the subject of a sentence, and after a designation ("do …", "de …").
  function autorIni(p, ref, leg) {
    leg = legDe(p.designacao) || leg;
    if (p.tipo === 'governo') return p.governo != null ? { sujeito: ['O ', gov(p.governo)], de: ['do ', gov(p.governo)] } : { sujeito: ['O Governo'], de: ['do Governo'] };
    if (p.tipo === 'cidadaos') return { sujeito: ['Um grupo de cidadãos'], de: ['de um grupo de cidadãos'] };
    if (p.tipo === 'regiao') { var r = p.nome || 'Assembleia Legislativa de uma Região Autónoma'; return { sujeito: ['A ' + r], de: ['da ' + r] }; }
    if (p.tipo === 'comissao') return { sujeito: ['Uma comissão do Parlamento'], de: ['de uma comissão do Parlamento'] };
    if (p.tipo === 'mesa') return /Presidente/.test(p.nome || '') ? { sujeito: ['O Presidente da Assembleia da República'], de: ['do Presidente da Assembleia da República'] }
      : { sujeito: ['A Mesa da Assembleia da República'], de: ['da Mesa da Assembleia da República'] };
    var gs = (p.grupos || []).map(function (g) { return grupoComNome(g, leg, ref); }), sem = nomesSemGrupo(p);
    var semTxt = sem.length ? lista(sem) + ' (sem grupo parlamentar)' : '';
    if (!gs.length && sem.length) return { sujeito: [semTxt], de: ['de ' + semTxt], singular: sem.length === 1 };
    var dep = 'deputados' + (gs.length ? ' ' + lista(gs) : '') + (semTxt ? ' e ' + semTxt : '');
    return { sujeito: ['D' + dep.slice(1)], de: ['de ' + dep] };
  }
  function hrefIni(id, p) {
    return p && (p.iniciativas || []).some(function (i) { return i.id === id; }) ? link(['iniciativa', id])
      : 'https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=' + encodeURIComponent(id);
  }
  function ligIni(id, des, p) { var h0 = hrefIni(id, p); return lig(h0, /^https/.test(h0) ? des + ' ↗' : des); }
  // A provisional record from passagem.json alone, until the pipeline writes quem.json.
  function quemProvisorio(ato, p) {
    return { tipo_ato: tipoDe(ato && ato.designacao), proponentes: p ? p.iniciativas.map(function (i) {
      var a = i.autores || {}, t = a.tipo === 'deputados' ? 'grupos' : a.tipo;
      return { iniciativa: i.id, designacao: i.designacao, tipo: t, governo: null, grupos: (a.grupos || []).map(function (s) { return { id: null, sigla: s }; }),
        sem_grupo: (a.deputados || []).filter(function (d) { return SEM_GRUPO[d.grupo]; }).map(function (d) { return d.nome; }), nome: a.nome };
    }) : [], texto_comissao: null, vfg: null, eventos: [], motivos: {}, provisorio: true };
  }
  function registo(ref, id) {
    var ato = (ref.atos || {})[id] || { id: id, designacao: id, alteracoes: [] }, p = (ref.passagem || {})[id] || null;
    return { ato: ato, p: p, quem: (ref.quem || {})[id] || quemProvisorio(ato, p) };
  }

  // «O XV Governo Constitucional apresentou a Proposta de Lei n.º 71/XV.» One sentence per
  // initiative, in the order of entry, with equal weight. A committee text: a lead sentence and the
  // list of the initiatives its text names (in a fold when there are more than three).
  function frasesProponentes(quem, ref, p) {
    var out = [], leg = quem.legislatura;
    var porId = {};
    (quem.proponentes || []).forEach(function (x) { porId[x.iniciativa] = x; });
    if (quem.tipo_ato === 'lei-constitucional' && (quem.proponentes || []).length) {
      var gs = [], vistos = {};
      quem.proponentes.forEach(function (x) { (x.grupos || []).forEach(function (g) { if (!vistos[g.sigla]) { vistos[g.sigla] = 1; gs.push(grupoComNome(g, legDe(x.designacao) || leg, ref)); } }); });
      var n = quem.proponentes.length;
      out.push(['Deputados' + (gs.length ? ' ' + lista(gs) : '') + ' apresentaram ' + n + (n === 1 ? ' projeto de revisão constitucional.' : ' projetos de revisão constitucional.')]);
      return out;
    }
    var tc = quem.texto_comissao;
    if (tc && (tc.iniciativas || []).length) {
      var k = tc.n_iniciativas || tc.iniciativas.length;
      var itens = tc.iniciativas.map(function (i) {
        var a = porId[i.iniciativa], des = ligIni(i.iniciativa, i.designacao, p);
        var antes = i.parte ? ['o ' + i.parte + ' ' + daDe(i.designacao) + ' ', des] : [des];
        return a ? antes.concat([', ']).concat(autorIni(a, ref, leg).de) : antes;
      });
      out.push([k === 1 ? 'Uma comissão do Parlamento escreveu o texto final a partir de uma iniciativa:' : 'Uma comissão do Parlamento juntou ' + k + ' iniciativas num só texto:',
        { t: 'lista', itens: itens, dobra: itens.length > 3 ? 'Ver as ' + itens.length + ' iniciativas' : null }]);
      return out;
    }
    (quem.proponentes || []).forEach(function (x) {
      var a = autorIni(x, ref, leg), plural = x.tipo === 'grupos' && !a.singular;
      var f = a.sujeito.concat([' ' + (plural ? 'apresentaram ' : 'apresentou ') + aDe(x.designacao) + ' ', ligIni(x.iniciativa, x.designacao, p), '.']);
      if (x.tipo === 'governo' && x.governo == null && (quem.motivos || {}).governo) f = f.concat([' ']).concat(motivo(quem.motivos.governo));
      out.push(f);
    });
    return out;
  }
  // «Votação final global: o Parlamento aprovou o texto a 19 de julho de 2023.» No group list.
  function linhaVfg(vfg, code, href) {
    if (!vfg) return code && MOTIVOS[code] ? motivo(code) : ['Não temos o registo da votação final global.'];
    var d = href ? lig(href, extenso(vfg.data)) : extenso(vfg.data);
    return ['Votação final global: o Parlamento ' + (vfg.resultado === 'Rejeitado' ? 'rejeitou' : 'aprovou') + ' o texto a ', d, vfg.unanime ? ', por unanimidade.' : '.'];
  }
  // Veto, Constitutional Court, confirmation, new decree: between the final vote and publication.
  function linhasEventos(eventos, ref, href) {
    var out = [];
    (eventos || []).slice().sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; }).forEach(function (e) {
      var d = href ? lig(href, extenso(e.data)) : extenso(e.data);
      if (e.tipo === 'veto') {
        if (e.acordao_tc) out.push(['O Tribunal Constitucional decidiu sobre o decreto (Acórdão n.º ' + e.acordao_tc + ').']);
        var pr = presidenteDe(ref, e.presidente);
        out.push(['O Parlamento recebeu o veto do Presidente da República' + (pr ? ', ' + pr.nome + ',' : '') + ' a ', d, '.']);
      } else if (e.tipo === 'tribunal') out.push(['O Tribunal Constitucional decidiu sobre o decreto a ', d, '.']);
      else if (e.tipo === 'confirmacao') out.push(['O Parlamento confirmou o decreto a ', d, '.']);
      else if (e.tipo === 'novo_decreto') out.push(['O Parlamento aprovou um novo decreto a ', d, '.']);
    });
    return out;
  }
  function fonteDR(quem, ato) { return (quem.assinatura && quem.assinatura.url) || (ato && ato.link) || null; }
  function data(href, iso) { return href ? lig(href, extenso(iso)) : extenso(iso); }
  // «O Presidente da República, Jorge Sampaio, promulgou a lei a 6 de agosto de 2003.»
  function linhaPresidente(quem, ref, ato, objeto) {
    var pr = quem.presidente, dr = fonteDR(quem, ato);
    if (!pr || !pr.d_promulgacao) return ['Não temos a data da promulgação.'].concat((quem.motivos || {}).presidente ? [' '].concat(motivo(quem.motivos.presidente)) : []);
    var row = presidenteDe(ref, pr.id), nome = (row && row.nome) || pr.nome;
    if (!nome) return ['O Presidente da República promulgou ' + objeto + ' a ', data(dr, pr.d_promulgacao), '.'];
    return [pr.interino ? 'O Presidente da República Interino, ' : 'O Presidente da República, ', row && row.fonte ? lig(row.fonte, nome) : nome, ', promulgou' + (objeto === 'o' ? '-o' : ' ' + objeto) + ' a ', data(dr, pr.d_promulgacao), '.'];
  }
  // «Partidos no Governo: Partido Social Democrata (PSD), CDS – Partido Popular (CDS-PP).»
  function frasePartidos(g, ref, leg) {
    if (!g || g.partidos == null) return null;
    if (!g.partidos.length) return g.nota_partidos ? ['Os partidos não indicaram os ministros deste Governo. ', lig(g.nota_partidos.fonte, 'Fonte ↗')] : null;
    var grupos = (ref.governos || {}).grupos || {};
    var nomes = g.partidos.map(function (id) {
      var ns = (grupos[id] || {}).nomes || [];
      var n = ns.filter(function (x) { return (x.legislaturas || []).indexOf(leg) >= 0; })[0] || ns[ns.length - 1];
      return n ? n.nome + ' (' + n.sigla + ')' : id;
    });
    var f = [(nomes.length === 1 ? 'Partido no Governo: ' : 'Partidos no Governo: ') + nomes.join(', ') + '.'];
    return g.fontes && g.fontes.partidos ? f.concat([' ', lig(g.fontes.partidos, 'Fonte ↗')]) : f;
  }
  function frasesDL(quem, ref, ato) {
    var out = [], m = quem.motivos || {}, dr = fonteDR(quem, ato);
    if (quem.governo && quem.governo.numero != null && quem.d_cm) {
      var g = governoDe(ref, quem.governo.numero);
      out.push(['O ', gov(quem.governo.numero), ' aprovou este decreto-lei em Conselho de Ministros a ', data(dr, quem.d_cm), '.']);
      if (g && g.primeiro_ministro) out.push(['Primeiro-Ministro: ', g.fontes && g.fontes.primeiro_ministro ? lig(g.fontes.primeiro_ministro, g.primeiro_ministro) : g.primeiro_ministro, '.']);
      var pt = frasePartidos(g, ref, quem.legislatura);
      if (pt) out.push(pt);
      if (quem.em_gestao && quem.em_gestao.fonte) out.push(['Nesta data, o Governo estava demitido. A Constituição limita os atos de um Governo demitido à gestão corrente. ', lig(quem.em_gestao.fonte, 'Fonte ↗')]);
    } else {
      var f = ['Não sabemos que Governo aprovou este decreto-lei.'], c = m.governo || m.d_cm;
      if (c) f = f.concat([' ']).concat(motivo(c));
      if (quem.governo_publicacao != null) f = f.concat([' Publicado durante o ', gov(quem.governo_publicacao), '.']);
      out.push(f);
    }
    out.push(['O Parlamento não votou este texto.']);
    out.push(linhaPresidente(quem, ref, ato, 'o'));
    return out;
  }
  // «Publicada no Diário da República a 6 de outubro de 2023.» and the entry into force.
  function frasesPublicacao(ato) {
    var out = [];
    if (ato.publicacao) out.push([(feminino(ato.designacao) ? 'Publicada' : 'Publicado') + ' no Diário da República a ', data(ato.link, ato.publicacao), '.']);
    var vs = [];
    (ato.alteracoes || []).forEach(function (c) { if (c.vigor && vs.indexOf(c.vigor) < 0) vs.push(c.vigor); });
    vs.sort();
    if (vs.length > 1) out.push(['Entrou em vigor em datas diferentes. Veja cada artigo.']);
    else if (vs.length === 1) out.push([(vs[0] > hoje() ? 'Entra em vigor a ' : 'Entrou em vigor a ') + extenso(vs[0]) + '.']);
    else out.push(['O Diário da República não indica a data de entrada em vigor.']);
    return out;
  }
  // "artigo-1067-a" -> "1067.º-A"
  function numArtigo(a) { return String(a || '').replace(/^artigo-/, '').replace(/^(\d+)(?:-([a-z]+))?$/, function (m, n, l) { return n + '.º' + (l ? '-' + l.toUpperCase() : ''); }); }
  function frasesAcordao(quem, ref, ato) {
    var t = quem.tribunal || {}, out = [], nomes = {};
    ((ref.index || {}).diplomas || []).forEach(function (d) { nomes[d.slug] = d; });
    var dt = t.data || ato.publicacao;
    if (dt) out.push([t.data_base === 'decisao' ? 'O Tribunal Constitucional decidiu a ' : 'O Tribunal Constitucional publicou este acórdão a ', data(ato.link, dt), '.']);
    (t.normas || []).forEach(function (n) {
      var d = nomes[n.diploma], ns = n.numeros || [];
      var onde = ns.length ? (ns.length === 1 ? 'o n.º ' + ns[0] : 'os n.os ' + lista(ns)) + ' do ' : 'o ';
      out.push(['Declarou ' + (n.tipo === 'ilegal' ? 'ilegal' : 'inconstitucional') + ', com força obrigatória geral, ' + onde, lig(link(['d', n.diploma, n.artigo]), 'artigo ' + numArtigo(n.artigo)),
        ' ' + (d ? (d.genitivo || 'de ' + d.titulo) : 'de ' + n.diploma) + '.']);
      var e = n.escrito_por && (ref.atos || {})[n.escrito_por];
      if (e) out.push([aDe(e.designacao).toUpperCase() + ' ', lig(link(['ato', n.escrito_por]), e.designacao), ' escreveu esse texto.']);
      if (n.efeitos_desde) out.push(['A decisão produz efeitos desde ' + extenso(n.efeitos_desde) + '.']);
    });
    out.push(['Não é um ato do Governo nem do Parlamento.']);
    return out;
  }
  // Atenção: the act has a transitional norm. It may change how the text applies to a case.
  function avisoTransitorias(quem, ato) {
    var ts = quem.transitorias || [];
    if (!ts.length) return null;
    var tipo = quem.tipo_ato || tipoDe(ato.designacao);
    var este = LEIS[tipo] ? 'esta lei tem ' : tipo === 'decreto-lei' ? 'este decreto-lei tem ' : 'este diploma tem ';
    var arts = lista(ts.map(function (x) { return x.artigo; }));
    var f = [{ t: 'forte', texto: 'Atenção: ' }, este + (ts.length === 1 ? 'uma norma transitória (artigo ' : 'normas transitórias (artigos ') + arts + ' ' + daDe(ato.designacao) + ' ' + ato.designacao +
      '). Leia a norma antes de aplicar o texto a um pedido ou a um contrato. '];
    if (ato.link) f.push(lig(ato.link, 'Ler o ato no Diário da República ↗'), ' ');
    f.push('Para um caso concreto, fale com um advogado, um solicitador ou um serviço de apoio jurídico.');
    f.classe = 'aviso';
    return f;
  }
  // The heading of the «Quem fez» block, by kind of act.
  function tituloQuem(tipo) {
    return { lei: 'Quem fez esta lei', 'lei-organica': 'Quem fez esta lei', 'decreto-lei': 'Quem fez este decreto-lei', 'lei-constitucional': 'Quem fez esta revisão da Constituição',
      retificacao: 'Quem publicou esta retificação', 'acordao-tc': 'Quem decidiu', 'acordao-outro': 'Quem decidiu', pre1976: 'Quem assinou este diploma' }[tipo] || 'Quem fez este diploma';
  }
  function hrefAR(quem, p) {
    if (quem.ar_url) return quem.ar_url;
    var i = (quem.proponentes || [])[0];
    return i ? hrefIni(i.iniciativa, null) : null;
  }
  // The whole «Quem fez» block of an act, one fact per sentence, in the order of events.
  function frasesQuem(quem, p, ato, ref) {
    quem = quem || quemProvisorio(ato, p);
    var tipo = quem.tipo_ato || tipoDe(ato.designacao), m = quem.motivos || {}, out = [];
    if (quem.oe) out.push(['Lei do Orçamento do Estado para ' + quem.oe.ano + '. Uma lei do Orçamento do Estado também pode alterar outras leis.']);
    if (tipo === 'decreto-lei') out = out.concat(frasesDL(quem, ref, ato));
    else if (LEIS[tipo]) {
      if ((quem.proponentes || []).length || quem.texto_comissao) {
        out = out.concat(frasesProponentes(quem, ref, p));
        if (m.passos) out.push(motivo(m.passos));
        var ar = hrefAR(quem, p);
        if (!quem.provisorio) out.push(linhaVfg(quem.vfg, m.vfg, ar));
        out = out.concat(linhasEventos(quem.eventos, ref, ar));
      } else {
        var f = m.passagem ? motivo(m.passagem) : ['Não temos os dados da passagem desta lei no Parlamento.'];
        if (quem.ar_url) f = f.concat([' ', lig(quem.ar_url, 'Ver na Assembleia da República ↗')]);
        out.push(f);
      }
      if (!quem.provisorio) out.push(linhaPresidente(quem, ref, ato, 'a lei'));
      if (tipo === 'lei-constitucional') out.push(['O Presidente não pode recusar a promulgação de uma revisão constitucional.']);
    } else if (tipo === 'retificacao') {
      var c = quem.retifica && (ref.atos || {})[quem.retifica];
      out.push(c ? ['Esta declaração corrige erros do texto publicado ' + daDe(c.designacao) + ' ', lig(link(['ato', quem.retifica]), c.designacao), '. Não tem votação.'] : ['Esta declaração corrige erros do texto publicado de outro diploma. Não tem votação.']);
      if (c) out.push(['Ver quem fez ' + aDe(c.designacao) + ' ', lig(link(['ato', quem.retifica]), c.designacao), '.']);
      if (ato.publicacao) out.push(['Publicada no Diário da República a ', data(ato.link, ato.publicacao), '.']);
      return out;
    } else if (tipo === 'acordao-tc' || tipo === 'acordao-outro') return out.concat(frasesAcordao(quem, ref, ato));
    else if (tipo === 'pre1976') {
      out.push(['Antes da Constituição de 1976.']);
      var ss = (quem.pre1976 || {}).signatarios || [];
      out.push(ss.length ? ['Assinaram este diploma:', { t: 'lista', itens: ss.map(function (s) { return [s]; }) }] : ['Não lemos as assinaturas deste diploma.']);
    } else if (quem.presidente) out.push(linhaPresidente(quem, ref, ato, 'o'));
    return out.concat(frasesPublicacao(ato));
  }
  // R-23: one short line about the people behind an act, for the register and the timeline.
  function linhaPessoas(quem, ref, id) {
    var ato = id ? registo(ref, id).ato : {};
    quem = quem || registo(ref, id).quem;
    var tipo = quem.tipo_ato || tipoDe(ato.designacao);
    if (tipo === 'decreto-lei') {
      if (!quem.governo || quem.governo.numero == null) return ['Decreto-lei. Não sabemos que Governo o aprovou.'];
      var g = governoDe(ref, quem.governo.numero);
      return ['Decreto-lei do ', gov(quem.governo.numero), g && g.primeiro_ministro ? ' (' + g.primeiro_ministro + ')' : ''];
    }
    if (tipo === 'retificacao') return ['Declaração de retificação. Não tem votação.'];
    if (tipo === 'acordao-tc') return ['Acórdão do Tribunal Constitucional.'];
    if (tipo === 'pre1976') return ['Antes da Constituição de 1976.'];
    if (!LEIS[tipo]) return ato.publicacao ? [(feminino(ato.designacao) ? 'Publicada a ' : 'Publicado a ') + curta(ato.publicacao)] : ['Não sabemos quem propôs.'];
    var quando = function (f) { return quem.vfg ? ' · ' + (f ? 'aprovada' : 'aprovado') + ' a ' + curta(quem.vfg.data) : ato.publicacao ? ' · publicada a ' + curta(ato.publicacao) : ''; };
    var ps = quem.proponentes || [], leg = quem.legislatura;
    if (tipo === 'lei-constitucional') return ['Revisão da Constituição' + quando(true)];
    if (quem.texto_comissao) { var n = quem.texto_comissao.n_iniciativas || quem.texto_comissao.iniciativas.length; return ['Texto da comissão (' + n + (n === 1 ? ' iniciativa)' : ' iniciativas)') + quando(false)]; }
    if (!ps.length) return ['Não sabemos quem propôs.'];
    var tipos = ps.map(function (x) { return x.tipo; }).filter(function (x, k, a) { return a.indexOf(x) === k; });
    var mais = ps.length > 1 ? 's' : '';
    if (tipos.length > 1) return ['Lei de ' + ps.length + ' iniciativas' + quando(true)];
    var x = ps[0];
    if (tipos[0] === 'governo') {
      var gs = ps.map(function (y) { return y.governo; }).filter(function (y, k, a) { return a.indexOf(y) === k; });
      return gs.length === 1 && gs[0] != null ? ['Proposta' + mais + ' de lei do ', gov(gs[0]), quando(true)] : ['Proposta' + mais + ' de lei do Governo' + quando(true)];
    }
    if (tipos[0] === 'grupos') {
      var sg = [];
      ps.forEach(function (y) { (y.grupos || []).forEach(function (g) { if (sg.indexOf(g.sigla) < 0) sg.push(g.sigla); }); });
      if (!sg.length) { var sem = nomesSemGrupo(x); return ['Projeto' + mais + ' de lei de ' + (sem.length ? lista(sem) + ' (sem grupo parlamentar)' : 'deputados') + quando(false)]; }
      if (sg.length > 3) return ['Projeto' + mais + ' de lei de deputados de ' + sg.length + ' grupos parlamentares' + quando(false)];
      var f = ['Projeto' + mais + ' de lei de deputados do '];
      sg.forEach(function (s, k) { if (k) f.push(', '); var n = nomeGrupo(s, legDe(x.designacao) || leg, ref.governos); f.push({ t: 'sigla', sigla: s, nome: n ? n.nome : null }); });
      f.push(quando(false));
      return f;
    }
    var a = autorIni(x, ref, leg).de;
    return [(/^Proposta/.test(x.designacao) ? 'Proposta' + mais + ' de lei ' : 'Projeto' + mais + ' de lei ')].concat(a).concat([quando(/^Proposta/.test(x.designacao))]);
  }
  // R-22: an Orçamento do Estado act changed this article. Who proposed this redação is not known.
  function fraseOE(quem) {
    var n = (quem.proponentes || []).filter(function (x) { return x.tipo === 'governo' && x.governo != null; })[0];
    return ['Lei do Orçamento do Estado para ' + quem.oe.ano].concat(n ? [', proposta pelo ', gov(n.governo)] : []).concat(['. Não sabemos ainda quem propôs a redação deste artigo.']);
  }
  // One act as a row of the timeline or a block of a story. Expanded: the whole story of the act.
  // o: {expandida, slug, governoPeriodo (the Government of the timeline row), semDcm, retificacoes}
  function linhaAto(id, ref, o) {
    o = o || {};
    var r = registo(ref, id), ato = r.ato, p = r.p, quem = r.quem, m = quem.motivos || {};
    var tipo = quem.tipo_ato || tipoDe(ato.designacao), out = [];
    out.push([lig(link(['ato', id]), nomeCompleto(ato))]);
    var pessoas = linhaPessoas(quem, ref, id);
    var ppl = (quem.proponentes || []).filter(function (x) { return x.tipo === 'governo' && x.governo != null; });
    if (o.semDcm) pessoas = ['Não sabemos que Governo o aprovou.'];
    else if (o.governoPeriodo != null && LEIS[tipo] && !quem.texto_comissao && ppl.length && ppl.length === (quem.proponentes || []).length && ppl[0].governo !== o.governoPeriodo)
      pessoas = ['Proposta de lei do ', gov(ppl[0].governo), '. Votada durante o ', gov(o.governoPeriodo), '.'];
    out.push(pessoas);
    if (quem.oe && o.expandida) out.push(['Lei do Orçamento do Estado para ' + quem.oe.ano + '. Uma lei do Orçamento do Estado também pode alterar outras leis.']);
    if (tipo === 'decreto-lei' && o.expandida) out = out.concat(frasesDL(quem, ref, ato).slice(0, -1));
    if (LEIS[tipo]) {
      if ((quem.proponentes || []).length || quem.texto_comissao) {
        if (o.expandida) out = out.concat(frasesProponentes(quem, ref, p));
        // Before quem.json exists (quemProvisorio) the final vote and the President are unknown to the app, not to the data.
        var v = quem.provisorio ? [] : linhaVfg(quem.vfg, m.vfg).concat([' ']);
        if (p || v.length) out.push(p ? v.concat([lig(link(['ato', id], { ir: 'generalidade' }), 'Ver a votação de todos os grupos')]) : v);
        if (o.expandida && p) out.push([{ t: 'votos', ato: id }]);
        out = out.concat(linhasEventos(quem.eventos, ref));
      } else {
        var f = ['Não temos os dados da passagem desta lei no Parlamento.'].concat(m.passagem ? [' '].concat(motivo(m.passagem)) : []);
        if (quem.ar_url) f = f.concat([' ', lig(quem.ar_url, 'Ver na Assembleia da República ↗')]);
        out.push(f);
      }
      if (o.slug && quem.periodo && quem.periodo.base === 'publicacao') out.push(['Não temos a data da votação. Contamos a partir da publicação.']);
    }
    if ((tipo === 'decreto-lei' || LEIS[tipo]) && !quem.provisorio) out.push(linhaPresidente(quem, ref, ato, tipo === 'decreto-lei' ? 'o' : 'a lei'));
    else if (tipo === 'acordao-tc' && o.expandida) out = out.concat(frasesAcordao(quem, ref, ato).slice(1, -1));
    if (o.slug) {
      var cs = (ato.alteracoes || []).filter(function (c) { return c.diploma === o.slug && c.tipo !== 'sem_alteracao'; });
      if (cs.length) {
        var vs = cs.map(function (c) { return c.vigor || ato.publicacao; }).filter(Boolean).sort();
        out.push(['Alterou ' + cs.length + (cs.length === 1 ? ' artigo deste diploma. ' : ' artigos deste diploma. '),
          vs.length ? lig(link(['alteracoes', o.slug], { de: diaAntes(vs[0]), ate: vs[vs.length - 1] }), 'Ver o que mudou') : '']);
      }
    }
    (o.retificacoes || quem.retificado_por || []).forEach(function (rid) {
      var ra = (ref.atos || {})[rid];
      if (ra) out.push([feminino(ato.designacao) ? 'Retificada pela ' : 'Retificado pela ', lig(link(['ato', rid]), nomeCompleto(ra)), '.']);
    });
    if (o.expandida) {
      // The period's own date: «Nesta data» would read as the promulgation date of the line above.
      if (LEIS[tipo] && quem.periodo && quem.periodo.governo != null) out.push([quem.periodo.data ? 'A ' + extenso(quem.periodo.data) + ', estava em funções o ' : 'Estava em funções o ', gov(quem.periodo.governo), '.']);
      out = out.concat(frasesPublicacao(ato));
      var av = avisoTransitorias(quem, ato);
      if (av) out.push(av);
    }
    return out;
  }
  // R-31: «296 artigos · alterado 7 vezes».
  function metaDiploma(d) {
    var n = d.n_atos || 0;
    return d.n_artigos + (d.n_artigos === 1 ? ' artigo · ' : ' artigos · ') + (n === 0 ? 'nunca alterado' : n === 1 ? 'alterado uma vez' : 'alterado ' + n + ' vezes');
  }

  // ---- Glossary marks ---------------------------------------------------------------------------
  // The terms a place may mark, with the forms to look for: {id: [formas]}. Only ids of the built
  // glossary, so a term the build left out is never marked.
  function termosPara(glossario, candidatos) {
    var out = {}, ts = (glossario && glossario.termos) || {};
    candidatos.forEach(function (id) { if (ts[id]) out[id] = (ts[id].formas || []).concat([ts[id].termo]).filter(Boolean); });
    return out;
  }
  function escapar(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // Marks the first occurrence of each term in the plain strings of partes. vistos holds the terms
  // already marked in this section. Links, quotations and other objects stay as they are.
  function marcarTermos(partes, vistos, ids) {
    var out = [];
    (partes || []).forEach(function (x) {
      if (x && x.t === 'termo') { if (ids[x.id] && !vistos.has(x.id)) { vistos.add(x.id); out.push(x); } else out.push(x.texto); return; }
      if (x && x.t === 'lista') { out.push(Object.assign({}, x, { itens: x.itens.map(function (i) { return marcarTermos(i, vistos, ids); }) })); return; }
      if (typeof x !== 'string') { out.push(x); return; }
      marcarTexto(x, vistos, ids).forEach(function (y) { out.push(y); });
    });
    if (partes && partes.classe) out.classe = partes.classe;
    return out;
  }
  function marcarTexto(s, vistos, ids) {
    var melhor = null;
    Object.keys(ids).forEach(function (id) {
      if (vistos.has(id)) return;
      ids[id].forEach(function (f) {
        var m = new RegExp('(^|[^\\p{L}\\p{N}-])(' + escapar(f) + ')(?![\\p{L}\\p{N}-])', 'iu').exec(s);
        if (!m) return;
        var i = m.index + m[1].length;
        if (!melhor || i < melhor.i || (i === melhor.i && m[2].length > melhor.n)) melhor = { i: i, n: m[2].length, id: id };
      });
    });
    if (!melhor) return [s];
    vistos.add(melhor.id);
    return [s.slice(0, melhor.i), { t: 'termo', id: melhor.id, texto: s.substr(melhor.i, melhor.n) }]
      .concat(marcarTexto(s.slice(melhor.i + melhor.n), vistos, ids)).filter(function (x) { return x !== ''; });
  }
  // Candidate terms per place (§3.9). marcarTermos keeps only those in the built glossary.
  var TERMOS = {
    quem: ['decreto-lei', 'conselho-de-ministros', 'promulgacao', 'veto', 'votacao-final-global', 'texto-de-substituicao', 'governo-em-gestao', 'tribunal-constitucional', 'retificacao', 'lei-organica'],
    voto: ['votacao-na-generalidade', 'grupo-parlamentar', 'legislatura'],
    artigo: ['redacao', 'entrada-em-vigor', 'republicacao', 'revogado', 'norma-transitoria'],
    periodo: ['decreto-lei', 'proposta-de-lei', 'projeto-de-lei', 'grupo-parlamentar', 'legislatura']
  };
  // Marks a list of sentences as one section.
  function marcarFrases(frases, onde) {
    var ids = termosPara(glossarioAtual, TERMOS[onde] || []), vistos = new Set();
    return frases.map(function (f) { return marcarTermos(f, vistos, ids); });
  }

  // ---- Sharing --------------------------------------------------------------------------------
  // The share key of a redação: the act, or act-k when that act made several redações of the
  // article (k counts that act's redações from 1). It does not change when another act's redação
  // is added before it.
  function chavePartilha(art, i) {
    var a = art.versoes[i].ato, mesmas = [];
    art.versoes.forEach(function (v, k) { if (v.ato === a) mesmas.push(k); });
    return mesmas.length === 1 ? a : a + '-' + (mesmas.indexOf(i) + 1);
  }
  // The address to share: the page with a link preview when the build made one, else the app's.
  function partilhaUrl(base, pj, slug, artigo, chave, atual) {
    var l = pj && pj.artigos && pj.artigos[slug + '/' + artigo];
    if (l && l.indexOf(chave) >= 0) return base + 'p/d/' + slug + '/' + artigo + '/' + chave + '/';
    return atual || base + link(['d', slug, artigo], { redacao: chave });
  }

  // ---- Page titles (R-63) ---------------------------------------------------------------------
  // dados: the files the page has loaded ({index, atos, grupo, historia, titulo}).
  function tituloDe(segs, dados) {
    var s = segs || [], x = dados || {}, ds = (x.index && x.index.diplomas) || [];
    var dip = function (slug) { var d = ds.filter(function (y) { return y.slug === slug; })[0]; return d ? d.titulo : slug; };
    var t = x.titulo || null;
    if (!t) {
      if (!s.length) return 'Redação';
      if (s[0] === 'd' && s[1] && !s[2]) t = dip(s[1]);
      else if (s[0] === 'ato' && s[1]) t = x.atos && x.atos[s[1]] ? x.atos[s[1]].designacao : s[1];
      else if (s[0] === 'quem' && s[1]) t = 'Quem fez cada alteração · ' + dip(s[1]);
      else if (s[0] === 'grupo' && s[1]) t = 'Grupo parlamentar: ' + (x.grupo ? x.grupo.nome : s[1]);
      else if (s[0] === 'grupos') t = 'Grupos parlamentares';
      else if (s[0] === 'historias') t = 'Histórias';
      else if (s[0] === 'historia' && s[1]) t = x.historia ? x.historia.titulo : 'Histórias';
      else if (s[0] === 'glossario') t = 'Glossário';
      else if (s[0] === 'sobre') t = 'Sobre os dados';
      else if (s[0] === 'verificacao') t = 'Verificação';
      else t = null;
    }
    return t ? t + ' · Redação' : 'Redação';
  }

  // ---- The law in time --------------------------------------------------------------------
  // The date a version counts from, for the chosen basis. A version with no known entry date
  // counts from its publication, and the result is flagged as uncertain.
  function startOf(v, base) { return base === 'publicacao' ? v.publicacao : (v.vigor || v.publicacao); }
  function pick(versoes, date, base) {
    for (var i = versoes.length - 1; i >= 0; i--) {
      var s = startOf(versoes[i], base);
      if (s && s <= date) return { i: i, incerta: base !== 'publicacao' && !versoes[i].vigor };
    }
    return null;
  }
  function pending(versoes, date) {
    return versoes.filter(function (v) { return v.publicacao && v.publicacao <= date && v.vigor && v.vigor > date; });
  }
  // A redação is named in URLs by the act that made it, so a link still works when the pipeline
  // adds a redação before it. An act that made two redações of one article falls back to the index.
  function versionKey(art, i) {
    var a = art.versoes[i].ato;
    return art.versoes.filter(function (v) { return v.ato === a; }).length === 1 ? a : String(i);
  }
  // A redação from a URL value: an index, an act id, a date or "hoje". -1 when none matches.
  function resolve(art, value, base) {
    if (value == null || value === '') return -1;
    if (/^\d+$/.test(value)) return +value < art.versoes.length ? +value : -1;
    if (value === 'hoje') value = hoje();
    if (validDate(value)) { var p = pick(art.versoes, value, base || 'vigor'); return p ? p.i : -1; }
    var i = art.versoes.map(function (v) { return v.ato; }).lastIndexOf(value);
    if (i >= 0) return i;
    // A share key (chavePartilha): the k-th redação of an act that made several.
    var mk = /^(.+)-(\d+)$/.exec(value);
    if (mk) {
      var mesmas = [];
      art.versoes.forEach(function (v, k) { if (v.ato === mk[1]) mesmas.push(k); });
      if (mesmas.length > 1 && +mk[2] >= 1 && +mk[2] <= mesmas.length) return mesmas[+mk[2] - 1];
    }
    // An act that left the text as it was (a republication) names the redação it kept.
    for (var k = art.versoes.length - 1; k >= 0; k--) if ((art.versoes[k].sem_alteracao || []).some(function (x) { return x.ato === value; })) return k;
    return -1;
  }
  // When redação i applies: from its start to the day before the next redação starts.
  // fim is null for the last redação and 'mesma' when the next one starts on the same day.
  function periodo(art, i, base) {
    var s = startOf(art.versoes[i], base), next = art.versoes[i + 1];
    if (!next) return { inicio: s, fim: null };
    var ns = startOf(next, base);
    return { inicio: s, fim: ns <= s ? 'mesma' : diaAntes(ns) };
  }
  // Share of words two redações have in common, from 0 to 1. A low value after a constitutional
  // revision usually means the article number now holds another provision.
  var semCache = {};
  function semelhanca(key, a, b) {
    if (semCache[key] == null) {
      var same = 0, total = 0;
      diff(a, b).forEach(function (s) {
        var w = (s.text.match(/[\p{L}\p{N}_]+/gu) || []).length;
        total += s.op === 'eq' ? 2 * w : w;
        if (s.op === 'eq') same += 2 * w;
      });
      semCache[key] = total ? same / total : 1;
    }
    return semCache[key];
  }
  var DIFERENTE = 0.35;
  var TIPO = { original: 'Texto original', alterado: 'Alterado', aditado: 'Aditado', revogado: 'Revogado', retificado: 'Retificado',
    suspenso: 'Suspenso', repristinado: 'Repristinado', inconstitucional: 'Declarado inconstitucional', renumerado: 'Renumerado' };
  function texto(v) { return v.linhas.map(function (l) { return l.map(function (s) { return s[1]; }).join(''); }).join('\n'); }
  function pela(designacao) { return /^(Decreto|Acórdão|Despacho)/.test(designacao) ? 'pelo' : 'pela'; }

  // Colour of each redação, the same in the register and in "Origem do texto": 0 for the first
  // text, 1–7 for amending acts from the newest back. Older acts share colour 7.
  function corDe(art, o) {
    if (art.versoes[o].tipo === 'original') return 0;
    var k = 0;
    for (var j = art.versoes.length - 1; j > o; j--) if (art.versoes[j].tipo !== 'original') k++;
    return Math.min(7, k + 1);
  }
  // Number of a número ("1", "2-A") or alínea ("a)") at the start of a line, and the rest.
  var NUM = /^(\d+(?:\.\d+)*(?:-[A-Z])?) — /, ALI = /^([a-z]+(?:-[a-z])?)\) /;
  function partes(t) {
    var m = NUM.exec(t);
    if (m) return { kind: 'n', nr: m[1] + ' —', resto: t.slice(m[0].length), num: m[1] };
    m = ALI.exec(t);
    if (m) return { kind: 'al', nr: m[1] + ')', resto: t.slice(m[0].length) };
    return { kind: '', nr: '', resto: t };
  }
  function revogada(t) { return /^\(Revogad[oa]\.?\)$/.test(t.trim()); }
  // Origin legend and paragraphs for one redação.
  // hrefOf(o): link to redação o, or null. The popover under a phrase links to it.
  function originModel(art, vi, atos, hrefOf, nomeOriginal) {
    var v = art.versoes[vi], used = {}, acts = [];
    var n7 = art.versoes.filter(function (x, o) { return corDe(art, o) === 7; }).length;
    v.linhas.forEach(function (l) { l.forEach(function (s) { used[s[0]] = true; }); });
    Object.keys(used).map(Number).sort(function (a, b) { return b - a; }).forEach(function (o) {
      var ver = art.versoes[o], ato = atos[ver.ato] || { designacao: ver.ato }, c = corDe(art, o);
      if (acts.some(function (a) { return a.index === c; })) return;
      acts.push(ver.tipo === 'original'
        ? { index: 0, versao: o, label: nomeOriginal || 'Texto original', date: ver.publicacao, href: o !== vi && hrefOf ? hrefOf(o) : null, hrefLabel: 'Ver esta redação' }
        : c === 7 && n7 > 1 ? { index: 7, label: 'Alterações anteriores (' + n7 + ')' }
        : { index: c, versao: o, label: ato.designacao, date: ver.publicacao, href: o !== vi && hrefOf ? hrefOf(o) : null, hrefLabel: 'Ver a redação dada por esta alteração' });
    });
    acts.sort(function (a, b) { return a.index === 0 ? -1 : b.index === 0 ? 1 : b.index - a.index; });
    var paragraphs = v.linhas.map(function (l) {
      var spans = l.map(function (s) { return { text: s[1], act: corDe(art, s[0]) }; });
      var t = spans.map(function (s) { return s.text; }).join(''), p = partes(t), cut = t.length - p.resto.length;
      if (TABELA.test(t)) { p = { kind: 'tab', nr: '', resto: t.replace(/^│\s?/, '') }; cut = t.length - p.resto.length; }
      // Take the número off the first span(s), so it can hang in the margin.
      while (cut > 0 && spans.length) {
        var f = spans[0];
        if (f.text.length <= cut) { cut -= f.text.length; spans.shift(); } else { spans[0] = { text: f.text.slice(cut), act: f.act }; cut = 0; }
      }
      // A revoked alínea keeps its alínea hang: kind "al rd-p-rev" gives both classes.
      return { number: p.nr || null, kind: revogada(p.resto) ? (p.kind ? p.kind + ' rd-p-rev' : 'rev') : p.kind || null, spans: spans };
    });
    return { acts: acts, paragraphs: paragraphs };
  }

  // ---- Word diff (Myers) for comparing any two versions -------------------------------------
  // «n.º», «n.os» and «31.º» are one word each, so a change never lands between «n» and «.º».
  var TOK = /\n|\s+|n\.(?:º|os)|\p{N}+\.º|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
  function diff(a, b) {
    var A = a.match(TOK) || [], B = b.match(TOK) || [];
    var n = A.length, m = B.length, max = n + m, off = max + 1, v = new Int32Array(2 * max + 3), trace = [];
    for (var d = 0; d <= max; d++) {
      trace.push(v.slice());
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        var y = x - k;
        while (x < n && y < m && A[x] === B[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) return backtrack(trace, A, B, off, d);
      }
    }
    return [];
  }
  function backtrack(trace, A, B, off, D) {
    var x = A.length, y = B.length, ops = [];
    for (var d = D; d > 0; d--) {
      var v = trace[d], k = x - y;
      var pk = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? k + 1 : k - 1;
      var px = v[off + pk], py = px - pk;
      while (x > px && y > py) { ops.push(['eq', A[--x]]); y--; }
      if (x === px) ops.push(['ins', B[--y]]); else ops.push(['del', A[--x]]);
    }
    while (x > 0 && y > 0) { ops.push(['eq', A[--x]]); y--; }
    ops.reverse();
    return group(ops);
  }
  // One rewritten phrase reads as one change. Changes separated only by spaces merge. A
  // short unchanged run between two replacements also merges when it is not longer than the
  // replacements next to it (the diff-match-patch semantic rule): "sua transformação numa
  // sociedade sem classes" -> "construção de uma sociedade livre, justa e solidária" is one
  // change, not two changes around the word "sociedade". Unchanged runs with a line break
  // stay, so each número keeps its own changes.
  function group(ops) {
    var segs = [];
    ops.forEach(function (o) {
      var last = segs[segs.length - 1];
      if (o[0] === 'eq') { if (last && last.eq != null) last.eq += o[1]; else segs.push({ eq: o[1] }); return; }
      if (!last || last.eq != null) { last = { del: '', ins: '' }; segs.push(last); }
      last[o[0]] += o[1];
    });
    function join(semantic) {
      var joined = false;
      for (var i = 1; i < segs.length - 1; i++) {
        var e = segs[i], p = segs[i - 1], n = segs[i + 1];
        if (e.eq == null || p.eq != null || n.eq != null || e.eq.indexOf('\n') >= 0) continue;
        var size = e.eq.trim().length;
        var short = semantic && size <= p.del.length + p.ins.length && size <= n.del.length + n.ins.length;
        // The unchanged run goes into both texts, so join only when both texts change.
        if ((size === 0 || short) && (p.del || n.del) && (p.ins || n.ins)) {
          segs.splice(i - 1, 3, { del: p.del + e.eq + n.del, ins: p.ins + e.eq + n.ins });
          joined = true;
          i--;
        }
      }
      return joined;
    }
    // Spaces first, so each side of a short run is measured as the whole phrase.
    join(false);
    while (join(true)) { /* until stable */ }
    var out = [];
    function push(op, t) {
      if (!t) return;
      var last = out[out.length - 1];
      if (last && last.op === op) last.text += t; else out.push({ op: op, text: t });
    }
    segs.forEach(function (sg) {
      if (sg.eq != null) { push('eq', sg.eq); return; }
      // Spaces at both ends of a replacement belong to the unchanged text next to it. A change
      // on one side only keeps its spaces, or the other text would gain a space.
      var l = '', t = '';
      if (sg.del && sg.ins) {
        l = common(sg.del.match(/^[ \t]*/)[0], sg.ins.match(/^[ \t]*/)[0]);
        t = common(sg.del.match(/[ \t]*$/)[0], sg.ins.match(/[ \t]*$/)[0]);
      }
      push('eq', l);
      push('del', sg.del.slice(l.length, sg.del.length - t.length));
      push('ins', sg.ins.slice(l.length, sg.ins.length - t.length));
      push('eq', t);
    });
    return out;
  }
  function common(a, b) { return a.length < b.length ? a : b; }
  // Paragraphs first, then words: lines that did not change anchor the comparison; between two
  // anchors, an old and a new paragraph pair up when they have the same número or alínea, or
  // share most of their words, and only paired paragraphs are compared word by word. So a new
  // ending of n.º 3 never lands under the old n.º 5.
  function diffLines(a, b) {
    var A = a.split('\n'), B = b.split('\n'), n = A.length, m = B.length, L = [];
    for (var i = n; i >= 0; i--) {
      L[i] = new Int32Array(m + 1);
      for (var j = m - 1; i < n && j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
    var out = [], dels = [], inss = [];
    function fecha() { out.push.apply(out, juntaLacuna(dels, inss)); dels = []; inss = []; }
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { fecha(); out.push([{ op: 'eq', text: A[i] }]); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) inss.push(B[j++]);
      else dels.push(A[i++]);
    }
    fecha();
    return out.filter(function (l) { return l.length && l.some(function (s) { return s.text; }); }).map(function (l) {
      return l.filter(function (s) { return s.text; });
    });
  }
  function rotuloLinha(l) {
    var m = /^\s*(\d+(?:\.\d+)*(?:-[A-Z]+)?\s*[—–-]|[a-z]{1,2}(?:-[a-z])?\))/.exec(l);
    return m ? m[1].replace(/\s+/g, '') : null;
  }
  // How alike two paragraphs are: the share of words they have in common (0 to 1).
  function semelhanca(x, y) {
    var px = x.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [], py = y.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [], c = {}, k = 0;
    px.forEach(function (w) { c[w] = (c[w] || 0) + 1; });
    py.forEach(function (w) { if (c[w]) { c[w]--; k++; } });
    return 2 * k / Math.max(1, px.length + py.length);
  }
  // Old paragraphs `ds` and new `is` between two unchanged lines. They pair up in order so that
  // the pairs share the most words (an alínea that was relettered still finds its old text); the
  // same número or alínea counts as a little more. Unpaired paragraphs show whole.
  function juntaLacuna(ds, is) {
    var n = ds.length, m = is.length, S = [], P = [];
    function nota(i, j) {
      var s = semelhanca(ds[i], is[j]), r = rotuloLinha(ds[i]);
      return s < 0.4 ? 0 : s + (r && r === rotuloLinha(is[j]) ? 0.15 : 0);
    }
    for (var i = n; i >= 0; i--) {
      S[i] = new Float64Array(m + 1); P[i] = new Int8Array(m + 1);
      for (var j = m; j >= 0; j--) {
        if (i === n || j === m) continue;
        var x = nota(i, j), best = S[i + 1][j], pk = 1;
        if (S[i][j + 1] > best) { best = S[i][j + 1]; pk = 2; }
        if (x > 0 && x + S[i + 1][j + 1] > best) { best = x + S[i + 1][j + 1]; pk = 3; }
        S[i][j] = best; P[i][j] = pk;
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n || j < m) {
      var pk = i < n && j < m ? P[i][j] : (i < n ? 1 : 2);
      if (pk === 3) { out.push(reescrita(diff(ds[i], is[j]))); i++; j++; }
      else if (pk === 1) out.push([{ op: 'del', text: ds[i++] }]);
      else out.push([{ op: 'ins', text: is[j++] }]);
    }
    return out;
  }
  // A paragraph that keeps less than a third of its words reads better as the old text, struck,
  // then the new one, than as words of both mixed together.
  function reescrita(l) {
    var eq = 0, tudo = 0, del = '', ins = '';
    l.forEach(function (s) {
      var n = s.text.trim().length;
      tudo += n; if (s.op === 'eq') eq += n;
      if (s.op !== 'ins') del += s.text;
      if (s.op !== 'del') ins += s.text;
    });
    if (!del.trim() || !ins.trim() || eq * 3 >= tudo) return l;
    var nr = (del.match(/^\s*(?:\d+[\.\-ºA-Z]*\s*[—–-]\s*|[a-z]{1,2}\)\s*)/) || [''])[0];  // the número stays in its place
    if (!nr || ins.indexOf(nr) !== 0) nr = '';
    return [{ op: 'eq', text: nr }, { op: 'del', text: del.slice(nr.length) }, { op: 'ins', text: ins.slice(nr.length) }].filter(function (s) { return s.text.trim(); });
  }

  // ---- Shared pieces ---------------------------------------------------------------------
  // Search in the header, on every page but the home page (which has its own, larger field).
  // A combobox: ↑ and ↓ choose a result, Enter opens it, Esc closes the list. "/" focuses it.
  function Pesquisa() {
    var r = useData(['index.json']);
    var qs = useState(''), ab = useState(false), at = useState(0);
    var rp = useData(ab[0] || qs[0] ? ['pesquisa.json'] : []);  // the article list, only once the reader searches
    var ref = React.useRef(null);
    useEffect(function () {
      function tecla(e) {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable) return;
        e.preventDefault(); if (ref.current) ref.current.focus();
      }
      document.addEventListener('keydown', tecla);
      return function () { document.removeEventListener('keydown', tecla); };
    }, []);
    var index = r.data && rp.data && rp.data[0] ? comPesquisa(r.data[0], rp.data[0]) : null;
    var res = index && qs[0] ? search(index, qs[0]).slice(0, 8) : [];
    var nomes = {};
    if (index) index.diplomas.forEach(function (d) { nomes[d.slug] = d; });
    var aberto = ab[0] && qs[0].length > 0;
    var cur = Math.min(at[0], Math.max(0, res.length - 1));
    function ir(x) { ab[1](false); qs[1](''); location.hash = link(['d', x[0], x[1]]); }
    return h('div', { className: 'pesq', role: 'search' },
      h('label', { htmlFor: 'pesq', className: 'rd-sr' }, 'Pesquisar um artigo'),
      h('input', { id: 'pesq', ref: ref, type: 'search', className: 'pesq-campo', placeholder: 'Pesquisar: art 87 circ, inquilino, férias…', autoComplete: 'off', value: qs[0],
        role: 'combobox', 'aria-expanded': aberto, 'aria-controls': 'pesq-lista', 'aria-autocomplete': 'list', 'aria-activedescendant': aberto && res.length ? 'pesq-' + cur : undefined,
        onChange: function (e) { qs[1](e.target.value); ab[1](true); at[1](0); },
        onFocus: function () { ab[1](true); },
        onBlur: function () { setTimeout(function () { ab[1](false); }, 150); },
        onKeyDown: function (e) {
          if (e.key === 'ArrowDown') { e.preventDefault(); at[1](Math.min(cur + 1, res.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); at[1](Math.max(cur - 1, 0)); }
          else if (e.key === 'Enter' && res[cur]) { e.preventDefault(); ir(res[cur]); e.target.blur(); }
          else if (e.key === 'Escape') { if (qs[0]) qs[1](''); else e.target.blur(); }
        } }),
      aberto ? h('div', { className: 'pesq-caixa' },
        res.length ? h('ul', { id: 'pesq-lista', role: 'listbox', 'aria-label': 'Artigos encontrados', className: 'pesq-lista' }, res.map(function (x, k) {
          return h('li', { key: x[0] + x[1], id: 'pesq-' + k, role: 'option', 'aria-selected': k === cur, className: k === cur ? 'is-on' : '',
            onMouseDown: function (e) { e.preventDefault(); ir(x); }, onMouseEnter: function () { at[1](k); } },
            h('span', { className: 'pesq-art' }, x[2]), x[3] ? h('span', { className: 'pesq-ep' }, ' ' + epigrafe(x[3])) : null,
            h('span', { className: 'pesq-dip' }, nomes[x[0]] ? nomes[x[0]].sigla : x[0]));
        })) : h('p', { id: 'pesq-lista', className: 'pesq-vazio' }, index ? 'Nenhum artigo. Escreva o número e a sigla («87 circ», «crp 1») ou palavras como «renda» ou «férias».' : 'A carregar…')) : null);
  }
  function Shell(props) {
    return h('div', { className: 'shell' },
      h('a', { className: 'skip', href: '#conteudo' }, 'Saltar para o conteúdo'),
      h('header', { className: 'top' },
        h('div', { className: 'top-in' },
          h('a', { className: 'brand', href: '#/' }, 'Redação'),
          props.casa ? null : h(Pesquisa),
          h('nav', { 'aria-label': 'Principal', className: 'top-nav' },
            h('a', { href: '#/' }, 'Leis e códigos'),
            h('a', { href: '#/historias' }, 'Histórias'),
            h('a', { href: '#/verificacao', className: 'so-largo-nav' }, 'Verificação'),
            h('a', { href: '#/sobre' }, 'Sobre os dados')))),
      h('main', { id: 'conteudo', className: 'page' }, props.children),
      h('footer', { className: 'foot' },
        h('div', { className: 'foot-in' },
          h('p', null, h('strong', null, 'Texto não oficial. Só a publicação no Diário da República faz fé.')),
          h('p', null, 'Fontes: Diário da República (legislação consolidada) e Assembleia da República (dados abertos). Esta página não é aconselhamento jurídico.'),
          h('p', { className: 'foot-links' }, h('a', { href: '#/glossario' }, 'Glossário'), h('a', { href: '#/grupos' }, 'Grupos parlamentares'),
            h('a', { href: '#/verificacao', className: 'so-estreito-nav' }, 'Verificação')))));
  }
  function Loading(props) {
    if (props.error) return h('div', { className: 'state' }, h('p', null, 'Não foi possível carregar os dados. Confirme que correu pipeline/build.py.'), h('p', { className: 'muted' }, String(props.error.message || props.error)));
    return h('div', { className: 'state', 'aria-busy': 'true' }, h('p', null, 'A carregar…'));
  }
  function Crumbs(props) {
    return h('nav', { 'aria-label': 'Localização', className: 'crumbs' },
      props.items.map(function (it, i) {
        var last = i === props.items.length - 1;
        return h(React.Fragment, { key: i }, i ? h('span', { 'aria-hidden': 'true' }, '›') : null,
          last || !it[1] ? h('span', { 'aria-current': last ? 'page' : undefined }, it[0]) : h('a', { href: it[1] }, it[0]));
      }));
  }
  function ActLink(props) {
    var a = props.atos[props.id];
    if (!a) return h('span', null, props.id);
    return h('a', { href: link(['ato', props.id]) }, a.designacao);
  }

  // ---- Partes on screen ------------------------------------------------------------------------
  // The built glossary (glossario.json) and the phone sheet that shows a term: set by App.
  var glossarioAtual = null, abrirTermo = null;
  function externo(href) { return /^https?:/.test(href || ''); }
  // A Government by its number: seen as «XV Governo Constitucional», heard as «décimo quinto».
  function Governo(props) {
    var t = romano(props.n) + ' Governo Constitucional';
    return h('span', { className: 'governo' }, h('span', { 'aria-hidden': 'true' }, t), h('span', { className: 'rd-sr' }, ordinalExtenso(props.n) + ' Governo Constitucional'));
  }
  // A group's sigla: seen as the sigla, heard as the group's name.
  function Sigla(props) {
    if (!props.nome) return props.sigla;
    return h('abbr', { title: props.nome, className: 'sigla' }, h('span', { 'aria-hidden': 'true' }, props.sigla), h('span', { className: 'rd-sr' }, props.nome));
  }
  // ctx: {votos(id) -> element} for {t:'votos'}; slug and vistas for a story's note markers.
  function render(partes, ctx) {
    ctx = ctx || {};
    return (partes || []).map(function (x, k) {
      if (typeof x === 'string' || x == null) return x;
      if (x.t === 'termo') {
        var def = glossarioAtual && glossarioAtual.termos && glossarioAtual.termos[x.id];
        return def ? h(R.Termo, { key: k, id: x.id, texto: x.texto, def: def, onAbrirFolha: abrirTermo }) : x.texto;
      }
      if (x.t === 'governo' && x.numero != null) return h(Governo, { key: k, n: x.numero });
      if (x.t === 'sigla') return h(Sigla, { key: k, sigla: x.sigla, nome: x.nome });
      if (x.t === 'forte') return h('strong', { key: k }, x.texto);
      if (x.t === 'votos') return ctx.votos ? h(React.Fragment, { key: k }, ctx.votos(x.ato)) : null;
      if (x.t === 'lista') return h('ul', { key: k, className: 'quem-lista' }, x.itens.map(function (it, j) { return h('li', { key: j }, render(it, ctx)); }));
      if (x.t === 'citacao') return h('a', { key: k, href: x.href }, h('span', { 'data-citacao': '' }, /^«/.test(x.texto) ? x.texto : '«' + x.texto + '»'));
      if (x.t === 'em') return h('em', { key: k }, x.texto);
      // A story's note marker (pipeline/historias.py): the first marker of a note takes the id «↩» returns to.
      if (x.t === 'nota') return ctx.slug ? h(MarcaNota, { key: k, n: x.n, slug: ctx.slug, vistas: ctx.vistas }) : null;
      if (x.href) {
        var txt = x.partes ? render(x.partes, ctx) : x.texto;
        return externo(x.href) ? h('a', { key: k, href: x.href, target: '_blank', rel: 'noopener' }, txt) : h('a', { key: k, href: x.href }, txt);
      }
      return x.texto || null;
    });
  }
  // A sentence on screen. A list or a votes block makes it a block; frase.classe 'aviso' an Atenção note.
  function Frases(props) {
    var ctx = props.ctx || {};
    return h(React.Fragment, null, (props.frases || []).map(function (f, k) {
      if (f.classe === 'aviso') return h('aside', { key: k, className: 'regra regra-aviso' }, h('p', null, render(f, ctx)));
      var bloco = f.filter(function (x) { return x && (x.t === 'lista' || x.t === 'votos'); })[0];
      if (!bloco) return h('p', { key: k, className: k === 0 && props.primeira ? props.primeira : props.classe || null }, render(f, ctx));
      var i = f.indexOf(bloco), antes = f.slice(0, i);
      var corpo = render([bloco], ctx);
      return h('div', { key: k, className: 'quem-bloco-lista' }, antes.length ? h('p', null, render(antes, ctx)) : null,
        bloco.dobra ? h('details', { className: 'dobra quem-dobra' }, h('summary', null, bloco.dobra), corpo) : corpo,
        f.length > i + 1 ? h('p', null, render(f.slice(i + 1), ctx)) : null);
    }));
  }
  // «Como ler esta página»: open on the first visit to a kind of page, then closed.
  var GUIAS = {
    artigo: 'Esta página mostra um artigo e todas as redações que teve. A linha em itálico diz que diploma escreveu o texto que está a ver. Para ver o artigo noutra data, escolha «Data» ou uma linha em «Redações». Para ver o que mudou, escolha «Alterações». Para ver que diploma escreveu cada frase, escolha «Origem do texto».',
    'ato-lei': 'Esta página mostra um diploma que mudou outros diplomas. Em cima, vê quem propôs, aprovou e promulgou o texto. Em «O que este ato mudou», escolha um artigo para ver o texto antes e depois. Em «Primeira votação: na generalidade», vê como votou cada grupo parlamentar. Cada facto tem uma ligação à fonte.',
    'ato-dl': 'Esta página mostra um decreto-lei que mudou outros diplomas. Em cima, vê que Governo o aprovou e que Presidente da República o promulgou. O Parlamento não vota os decretos-leis. Em «O que este ato mudou», escolha um artigo para ver o texto antes e depois. Cada facto tem uma ligação à fonte.',
    diploma: 'Esta página mostra um diploma inteiro. No índice, cada linha é um artigo. Cada traço na linha é uma redação. Em «Atos que o alteraram», vê os diplomas que mudaram este diploma. Para ver quem fez cada mudança, escolha «Quem fez cada alteração».',
    iniciativa: 'Esta página mostra uma iniciativa: um texto que alguém propôs ao Parlamento. Uma iniciativa ainda não é lei. Passa a lei depois da votação final global, da promulgação e da publicação no Diário da República. Em «Todas as fases», vê cada passo no Parlamento, com a data.',
    alteracoes: 'Esta página mostra os artigos que mudaram entre duas datas. Para mudar o período, escolha as datas «De» e «Até». O texto acrescentado tem um traço por baixo. O texto eliminado tem um traço por cima. Escolha um artigo para ver o artigo inteiro.',
    quem: 'Esta página mostra todos os atos que mudaram este diploma, por período. Escolha «Por Governo» ou «Por legislatura». Em cada período, os decretos-leis vêm primeiro e as leis do Parlamento depois. Uma lei fica no período da votação que a decidiu. Um período sem alterações também aparece.',
    grupo: 'Esta página mostra as iniciativas de um grupo parlamentar que deram origem a leis deste site. Também mostra como o grupo votou as alterações a um diploma. Escolha o diploma na lista. Para ver os votos de todos os grupos, abra o ato.'
  };
  // tipo: the kind of page (the key in this browser); texto: the GUIAS entry, when it is another.
  function Guia(props) {
    var chave = 'redacao-guia-' + props.tipo;
    var st = useState(function () {
      if (props.fechada) return false;
      try { return localStorage.getItem(chave) == null; } catch (e) { return false; }
    });
    useEffect(function () { try { localStorage.setItem(chave, '1'); } catch (e) { /* private window */ } }, []);
    return h('details', { className: 'guia', open: st[0], onToggle: function (e) { st[1](e.currentTarget.open); } },
      h('summary', null, 'Como ler esta página'),
      h('div', { className: 'guia-in' }, h('p', null, GUIAS[props.texto || props.tipo]), h('p', null, h('a', { href: '#/glossario' }, 'Ver o glossário'))));
  }
  // ---- Home ---------------------------------------------------------------------------------
  var SIGLAS = { crp: 'constituicao', constituicao: 'constituicao', 'constituição': 'constituicao', ct: 'codigo-do-trabalho', trabalho: 'codigo-do-trabalho',
    circ: 'codigo-irc', irc: 'codigo-irc', nrau: 'nrau',
    cc: 'codigo-civil', civil: 'codigo-civil',
    cirs: 'codigo-irs', irs: 'codigo-irs', formulario: 'lei-formulario', 'formulário': 'lei-formulario', '74/98': 'lei-formulario',
    cp: 'codigo-penal', penal: 'codigo-penal', cpc: 'codigo-processo-civil', cpp: 'codigo-processo-penal',
    csc: 'codigo-sociedades-comerciais', sociedades: 'codigo-sociedades-comerciais', civa: 'codigo-iva', iva: 'codigo-iva',
    lgt: 'lei-geral-tributaria', ebf: 'estatuto-beneficios-fiscais' };
  // Each diploma's abbreviation finds it ("cpa 5", "cire 18"), on top of the names above.
  var siglasCache = null;
  function siglasDe(index) {
    if (siglasCache && siglasCache.diplomas === index.diplomas) return siglasCache.mapa;
    var mapa = Object.assign({}, SIGLAS);
    index.diplomas.forEach(function (d) { if (d.sigla) mapa[fold(d.sigla)] = d.slug; });
    siglasCache = { diplomas: index.diplomas, mapa: mapa };
    return mapa;
  }
  // index.json with the article list (pesquisa.json), as search() wants it.
  function comPesquisa(index, pesquisa) { return { diplomas: index.diplomas, sinonimos: index.sinonimos, pesquisa: pesquisa }; }
  function fold(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Everyday words (pipeline/sinonimos.json): "inquilino" finds "arrendatário", "horas extra" finds
  // "trabalho suplementar". Each word or phrase of the query becomes a group of alternatives; an
  // article matches when its epígrafe has one alternative of every group.
  function grupos(index, q) {
    var f = ' ' + fold(q).replace(/[º.]/g, ' ').replace(/\s+/g, ' ').trim() + ' ', out = [];
    var sin = index.sinonimos || [];
    // Longest phrases first, so "aumento da renda" wins over "renda".
    var frases = [];
    sin.forEach(function (x) { x.palavras.forEach(function (p) { frases.push([fold(p), x.termos.concat(p.indexOf(' ') < 0 ? [fold(p)] : [])]); }); });
    frases.sort(function (a, b) { return b[0].length - a[0].length; });
    frases.forEach(function (x) {
      var k = f.indexOf(' ' + x[0] + ' ');
      if (k < 0) return;
      out.push(x[1]);
      f = f.slice(0, k) + ' ' + f.slice(k + x[0].length + 1);
    });
    return { grupos: out, resto: f.trim() };
  }
  function search(index, q) {
    var g = grupos(index, q);
    var words = g.resto.split(/\s+/).filter(Boolean);
    if (!words.length && !g.grupos.length) return [];
    var diploma = null, num = null, rest = g.grupos.slice();
    words.forEach(function (w) {
      if (siglasDe(index)[w]) diploma = siglasDe(index)[w];
      else if (/^\d+(-[a-z])?$/.test(w)) num = w;
      else if (!/^(art|artigo|do|da|de|o|a|n|e|um|uma|os|as|no|na|em|para|com|por|que|se|me|eu|fui|ser)$/.test(w)) rest.push([w]);
    });
    if (!diploma && !num && !rest.length) return [];
    return index.pesquisa.filter(function (r) {
      if (diploma && r[0] !== diploma) return false;
      if (num && fold(r[2]).replace(/[º.]/g, '').replace(/\s+/g, ' ').trim() !== 'artigo ' + num) return false;
      var e = fold(r[3]);
      return rest.every(function (alt) { return alt.some(function (w) { return e.indexOf(w) >= 0; }); });
    // Revoked articles last; copies of another diploma's articles (the NRAU's annex, R-7) after them.
    }).sort(function (a, b) { return (a[4] === 'revogado') - (b[4] === 'revogado') || (!!a[5]) - (!!b[5]); }).slice(0, 30);
  }
  function epigrafe(e) { return (e || '').replace(/^\((.*)\)$/, '$1'); }
  var AREAS = ['Constituição e sistema político', 'Direitos e cidadania', 'Civil e comercial', 'Trabalho e segurança social', 'Fiscal',
    'Penal', 'Tribunais e processo', 'Administração pública'];
  function Home() {
    var r = useData(['index.json', 'atos.json', '?historias/index.json']);
    var qs = useState('');
    var rp = useData(qs[0] ? ['pesquisa.json'] : []);
    if (!r.data) return h(Loading, { error: r.error });
    document.title = tituloDe([]);
    var index = r.data[0], atos = r.data[1], historias = ((r.data[2] || {}).historias || []), carregada = !qs[0] || (rp.data && rp.data[0]);
    var nomes = {};
    index.diplomas.forEach(function (d) { nomes[d.slug] = d; });
    var results = carregada && qs[0] ? search(comPesquisa(index, rp.data[0]), qs[0]) : [];
    var recent = Object.keys(atos).map(function (k) { return atos[k]; })
      .filter(function (a) { return a.alteracoes.length; })
      .sort(function (a, b) { return (b.publicacao || '') < (a.publicacao || '') ? -1 : 1; }).slice(0, 8);
    return h('div', { className: 'pagina-ato' },
      h('section', { className: 'intro' },
        h('h1', { className: 'display' }, 'A história de cada artigo da lei portuguesa'),
        h('p', { className: 'lead' }, 'Veja o texto de um artigo em qualquer data, compare redações e veja que lei escreveu cada frase.'),
        h('form', { role: 'search', className: 'search', onSubmit: function (e) { e.preventDefault(); } },
          h('label', { htmlFor: 'q', className: 'search-label' }, 'Pesquisar um artigo'),
          h('input', { id: 'q', type: 'search', className: 'rd-input search-input', value: qs[0], autoComplete: 'off',
            placeholder: 'Por exemplo: «art 87 circ», «inquilino», «horas extra», «crp 1»', onChange: function (e) { qs[1](e.target.value); } })),
        qs[0] ? h('section', { 'aria-live': 'polite', className: 'results' },
          h('p', { className: 'muted' }, !carregada ? 'A carregar…' : results.length ? results.length + (results.length === 1 ? ' artigo encontrado' : ' artigos encontrados') : 'Não encontrámos artigos. Escreva o número do artigo e a sigla do diploma (CRP, CT, CC, CPA) ou palavras como «despedimento», «renda», «férias».'),
          h('ul', { className: 'list' }, results.map(function (x) {
            return h('li', { key: x[0] + x[1] }, h('a', { href: link(['d', x[0], x[1]]) }, h('strong', null, x[2]), x[3] ? ' ' + epigrafe(x[3]) : ''),
              h('span', { className: 'muted' }, ' · ' + nomes[x[0]].sigla), x[4] === 'revogado' ? h(R.StatusPill, { status: 'revogado' }) : null);
          }))) : null),
      h('div', { className: 'duas duas-largo' },
        h('section', { 'aria-labelledby': 'dipl' },
          h('h2', { id: 'dipl', className: 'h2' }, index.diplomas.length + ' leis e códigos'),
          AREAS.concat(['Outros']).map(function (area) {
            var ds = index.diplomas.filter(function (d) { return (AREAS.indexOf(d.area) >= 0 ? d.area : 'Outros') === area; });
            if (!ds.length) return null;
            return h('div', { key: area, className: 'area' },
              h('h3', { className: 'area-h' }, area),
              h('ul', { className: 'cards' }, ds.map(function (d) {
                return h('li', { key: d.slug, className: 'card' },
                  h('a', { className: 'card-title', href: link(['d', d.slug]) }, d.titulo),
                  h('p', null, (fold(d.designacao).replace(/[^a-z0-9]/g, '').indexOf(fold(d.sigla).replace(/[^a-z0-9]/g, '')) >= 0 ? '' : d.sigla + ' · ') + d.designacao + ' · ' + metaDiploma(d)));
              })));
          })),
        h('div', { className: 'dip-lado' },
        historias.length ? h('section', { 'aria-labelledby': 'hist' },
          h('h2', { id: 'hist', className: 'h2' }, 'Histórias'),
          h(ListaHistorias, { historias: historias, curta: true })) : null,
        h('section', { 'aria-labelledby': 'rec' },
          h('h2', { id: 'rec', className: 'h2' }, 'Alterações mais recentes'),
          h('ol', { className: 'list' }, recent.map(function (a) {
            var ds = {};
            a.alteracoes.forEach(function (c) { ds[c.diploma] = (ds[c.diploma] || 0) + 1; });
            return h('li', { key: a.id, className: 'recente' }, h('a', { href: link(['ato', a.id]) }, a.designacao),
              h('span', { className: 'muted' }, ' · ' + curta(a.publicacao) + ' · ' + Object.keys(ds).map(function (k) { return nomes[k].sigla + ' (' + ds[k] + ')'; }).join(', ')),
              a.sumario ? h('span', { className: 'recente-sum' }, a.sumario) : null);
          }))))));
  }
  // The stories: title, summary and the line that says how they were prepared.
  function avisoHistoria(hx) { return hx.aviso || 'Texto preparado a partir dos dados do site, com ajuda de uma ferramenta automática. Data: ' + extenso(hx.preparado_em) + '. Ainda sem revisão jurídica externa.'; }
  function avisoCurto(hx) { return 'Preparada a ' + extenso(hx.preparado_em) + '. Ainda sem revisão jurídica externa.'; }
  function ListaHistorias(props) {
    return h('ul', { className: 'list historias-lista' }, props.historias.map(function (hx) {
      return h('li', { key: hx.slug },
        h('a', { className: 'historia-titulo', href: link(['historia', hx.slug]) }, hx.titulo),
        hx.resumo && !props.semResumo ? h('p', { className: 'historia-resumo' }, hx.resumo) : null,
        h('p', { className: 'historia-aviso' }, props.curta ? avisoCurto(hx) : avisoHistoria(hx)));
    }));
  }

  // ---- The whole diploma between two dates ------------------------------------------------------
  // Like a diff of two commits: every article whose text changed between `de` and `ate`, by
  // entry into force (publication when the DR has no date). The índice holds each redação's start,
  // act and type, so we know which articles changed before loading any of them.
  var LOTE = 15;
  function redacaoEm(n, data) {
    for (var i = n.datas.length - 1; i >= 0; i--) if (n.datas[i] <= data) return i;
    return -1;
  }
  function mudancas(d, de, ate) {
    var out = [];
    d.arvore.forEach(function (n) {
      if (n.tipo !== 'artigo' || !n.atos) return;
      var a = redacaoEm(n, de), b = redacaoEm(n, ate);
      if (b < 0 || a === b) return;
      var atos = [];
      for (var i = a + 1; i <= b; i++) if (atos.indexOf(n.atos[i]) < 0) atos.push(n.atos[i]);
      var tipo = a < 0 ? 'aditado' : n.tipos[b] === 'revogado' && n.tipos[a] !== 'revogado' ? 'revogado' : 'alterado';
      out.push({ n: n, a: a, b: b, atos: atos, tipo: tipo });
    });
    return out;
  }
  function Mudancas(props) {
    var slug = props.slug, q = props.q;
    var r0 = useData(['d/' + slug + '.json', 'atos.json']);
    var mais = useState(1);
    var hj = hoje(), ano = function (n) { return (Number(hj.slice(0, 4)) - n) + hj.slice(4); };
    var de = validDate(q.de) || ano(1), ate = validDate(q.ate) || hj;
    if (de > ate) { var t = de; de = ate; ate = t; }
    var d = r0.data ? r0.data[0] : null, mud = d ? mudancas(d, de, ate) : [];
    var mostrados = mud.slice(0, LOTE * mais[0]);
    var r = useData(mostrados.map(function (x) { return 'd/' + slug + '/' + x.n.artigo + '.json'; }));
    if (!r0.data) return h(Loading, { error: r0.error });
    var atos = r0.data[1];
    document.title = 'O que mudou · ' + d.sigla + ' · Redação';
    var ir = function (o) { substituir(link(['alteracoes', slug], Object.assign({ de: de, ate: ate }, o))); };
    var conta = { alterado: 0, aditado: 0, revogado: 0 }, porAto = {};
    mud.forEach(function (x) { conta[x.tipo]++; x.atos.forEach(function (a) { porAto[a] = (porAto[a] || 0) + 1; }); });
    var idsAtos = Object.keys(porAto).sort(function (x, y) { return ((atos[x] || {}).publicacao || '') < ((atos[y] || {}).publicacao || '') ? -1 : 1; });
    var partesResumo = [[conta.alterado, 'artigo alterado', 'artigos alterados'], [conta.aditado, 'aditado', 'aditados'], [conta.revogado, 'revogado', 'revogados']]
      .filter(function (x) { return x[0]; }).map(function (x) { return x[0] + ' ' + (x[0] === 1 ? x[1] : x[2]); });
    var atalhos = [['Último ano', ano(1)], ['Últimos 5 anos', ano(5)], ['Desde o início', d.publicacao]];
    return h('div', { className: 'pagina-ato mudancas' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], [d.titulo, link(['d', slug])], ['O que mudou']] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'O que mudou ' + (d.genitivo ? d.genitivo.replace(/^d([ao]s?) /, 'n$1 ') : 'no diploma')),
        h('form', { className: 'mud-datas', onSubmit: function (e) { e.preventDefault(); } },
          h('label', null, h('span', null, 'De'), h('input', { type: 'date', className: 'rd-input', value: de, min: d.publicacao, max: ate, onChange: function (e) { if (validDate(e.target.value)) { mais[1](1); ir({ de: e.target.value }); } } })),
          h('label', null, h('span', null, 'Até'), h('input', { type: 'date', className: 'rd-input', value: ate, min: de, onChange: function (e) { if (validDate(e.target.value)) { mais[1](1); ir({ ate: e.target.value }); } } })),
          h('span', { className: 'mud-atalhos' }, atalhos.map(function (x) {
            return h('button', { key: x[0], type: 'button', className: 'rd-btn', 'aria-pressed': de === x[1] && ate === hj, onClick: function () { mais[1](1); ir({ de: x[1], ate: hj }); } }, x[0]);
          }))),
        h('p', { className: 'lead', 'aria-live': 'polite' }, 'De ' + extenso(de) + ' a ' + extenso(ate) + ': ',
          mud.length ? lista(partesResumo) + ', por ' + idsAtos.length + (idsAtos.length === 1 ? ' ato.' : ' atos.') : 'nenhum artigo mudou.'),
        h('p', { className: 'muted small' }, 'Contamos cada redação da data de entrada em vigor, ou da publicação quando o Diário da República não indica a data.'),
        h(Guia, { tipo: 'alteracoes' })),
      idsAtos.length ? h('details', { className: 'dobra mud-atos' },
        h('summary', null, idsAtos.length === 1 ? 'O ato' : 'Os ' + idsAtos.length + ' atos, do mais antigo para o mais recente'),
        h('ol', { className: 'list' }, idsAtos.map(function (id) {
          var a = atos[id] || { designacao: id };
          return h('li', { key: id }, h('a', { href: link(['ato', id]) }, a.designacao),
            h('span', { className: 'muted' }, (a.publicacao ? ' · ' + curta(a.publicacao) : '') + ' · ' + porAto[id] + (porAto[id] === 1 ? ' artigo' : ' artigos')));
        }))) : null,
      h('div', { className: 'mud-lista' }, mostrados.map(function (x, k) {
        var art = r.data ? r.data[k] : null, n = x.n;
        var antes = art && x.a >= 0 ? texto(art.versoes[x.a]) : '', depois = art ? texto(art.versoes[x.b]) : '';
        var href = art ? link(['d', slug, n.artigo], { redacao: versionKey(art, x.b), ver: 'mudou', com: x.a >= 0 && x.a !== x.b - 1 ? versionKey(art, x.a) : null }) : link(['d', slug, n.artigo]);
        var alt = art ? alteracoes(antes, depois, false, -1) : null;
        return h('section', { key: n.artigo, className: 'mud-art', 'aria-labelledby': 'm-' + n.artigo },
          h('h2', { id: 'm-' + n.artigo, className: 'mud-cab' },
            h('a', { href: href }, h('span', { className: 'mud-n' }, n.rotulo), n.epigrafe ? ' ' + epigrafe(n.epigrafe) : ''),
            x.tipo !== 'alterado' ? h(R.StatusPill, { status: x.tipo === 'aditado' ? 'aditado' : 'revogado' }) : null),
          h('p', { className: 'mud-por' }, (x.atos.length === 1 ? 'Pelo ato: ' : 'Pelos atos: '), x.atos.map(function (a, j) {
            return [j ? (j === x.atos.length - 1 ? ' e ' : ', ') : '', h('a', { key: a, href: link(['ato', a]) }, (atos[a] || { designacao: a }).designacao)];
          })),
          !art ? h('p', { className: 'muted' }, 'A carregar…')
            : alt.n ? h('div', { className: 'lei' }, alt.nodes)
            : h('p', { className: 'muted' }, 'O texto ficou igual (a alteração não mudou as palavras).'));
      })),
      mud.length > mostrados.length ? h('p', { className: 'mud-mais' }, h('button', { type: 'button', className: 'rd-btn', onClick: function () { mais[1](mais[0] + 1); } },
        'Mostrar mais ' + Math.min(LOTE, mud.length - mostrados.length) + ' de ' + (mud.length - mostrados.length) + ' artigos')) : null,
      mud.length ? h('p', { className: 'rd-redline-legend' }, h('span', { className: 'rd-key rd-key-ins' }, h('ins', null, 'acrescentado')), h('span', { className: 'rd-key rd-key-del' }, h('del', null, 'eliminado'))) : null);
  }

  // ---- Diploma -------------------------------------------------------------------------------
  function Diploma(props) {
    var r = useData(['d/' + props.slug + '.json', 'atos.json', 'pendentes.json', '?historias/index.json', 'index.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var d = r.data[0], atos = r.data[1], propostas = pendentesDe(r.data[2], props.slug, null);
    document.title = tituloDe(['d', d.slug], { index: r.data[4] });
    var historias = ((r.data[3] || {}).historias || []).filter(function (x) { return (x.diplomas || []).indexOf(d.slug) >= 0; });
    var emCurso = {};
    propostas.forEach(function (i) { i.diplomas[d.slug].artigos.forEach(function (a) { emCurso[a] = true; }); });
    var em = validDate(props.q.em), base = props.q.base;
    var copiaDe = d.copia ? r.data[4].diplomas.filter(function (x) { return x.slug === d.copia.diploma; })[0] : null;
    var acts = Object.keys(atos).map(function (k) { return atos[k]; })
      .filter(function (a) { return a.alteracoes.some(function (c) { return c.diploma === d.slug; }); })
      .sort(function (a, b) { return (b.publicacao || '') < (a.publicacao || '') ? -1 : 1; });
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], [d.titulo]] }),
      em ? h('div', { className: 'note note-data', role: 'region', 'aria-label': 'Data escolhida' },
        h('p', null, 'Os artigos abrem como estavam a ', h('strong', null, extenso(em)), '. ', h('a', { href: link(['d', d.slug]) }, 'Voltar a hoje'))) : null,
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, d.titulo),
        d.sumario ? h('p', { className: 'lead' }, d.sumario) : null,
        d.parte ? h('p', { className: 'regra' }, h('strong', null, 'Nota: '), d.parte) : null,
        // The facts of the diploma on one row: what it is, when it was published, when it took effect.
        h('dl', { className: 'meta' },
          h('div', null, h('dt', null, 'Diploma'), h('dd', null, d.designacao + ' (' + d.sigla + ')')),
          h('div', null, h('dt', null, 'Publicação'), h('dd', null, extenso(d.publicacao))),
          d.vigor_original ? h('div', null, h('dt', null, 'Entrada em vigor'), h('dd', null, extenso(d.vigor_original.data), h('span', { className: 'factos-sub' }, d.vigor_original.fonte))) : null,
          d.link ? h('div', null, h('dt', null, 'Fonte'), h('dd', null, h('a', { href: d.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗'))) : null),
        h('p', { className: 'dip-acoes' }, h('a', { className: 'rd-btn', href: link(['alteracoes', d.slug]) }, 'O que mudou entre duas datas'),
          h('a', { className: 'rd-btn', href: link(['quem', d.slug]) }, 'Quem fez cada alteração')),
        h(Guia, { tipo: 'diploma' })),
      h('div', { className: 'duas duas-largo' },
        h('nav', { className: 'toc', 'aria-label': 'Índice' },
          h('h2', { className: 'h2' }, 'Índice'),
          // A contents table: the article number in a right-aligned column, the epígrafe, and how
          // many redações it had. The whole row is the link.
          (function () {
            // One time axis for the whole page: the acts ruler and each article's strip.
            var ini = d.publicacao, fimEixo = hoje();
            var tot = Math.max(1, (new Date(fimEixo) - new Date(ini)) / 864e5);
            var pos = function (dt) { return Math.max(0, Math.min(100, (new Date(dt) - new Date(ini)) / 864e5 / tot * 100)); };
            var faixa = function (n) {
              return h('span', { className: 'toc-faixa', 'aria-hidden': 'true' }, (n.datas || []).map(function (dt, k) {
                return h('span', { key: k, className: k ? 'tf-t' : 'tf-t tf-0', style: { left: pos(dt) + '%' } });
              }));
            };
            var linha = function (n, i) {
            if (n.tipo !== 'artigo') return h('li', { key: i, className: 'toc-div toc-nivel-' + Math.min(4, n.nivel) }, n.rotulo, n.epigrafe ? h('span', { className: 'toc-div-ep' }, n.epigrafe) : null);
            var rev = n.estado === 'revogado';
            return h('li', { key: i, className: rev ? 'toc-rev' : '' },
              h('a', { className: 'toc-row', href: link(['d', d.slug, n.artigo], { em: em, base: base }) },
                h('span', { className: 'toc-n' }, n.rotulo.replace(/^Artigo\s*/, '')),
                h('span', { className: 'toc-ep' }, n.epigrafe || (rev ? '' : '—'),
                  emCurso[n.artigo] ? h('span', { className: 'toc-parl' }, h('span', { 'aria-hidden': 'true' }, '◌ '), 'proposta em curso') : null),
                h('span', { className: 'toc-meta' }, faixa(n), h('span', { className: n.n > 1 || rev ? '' : 'rd-sr' }, rev ? 'Revogado' : n.n > 1 ? n.n + ' redações' : '1 redação'))));
            };
            // When the code sits in an annex (the CIRC), the approving law's own articles fold away.
            // R-7: the NRAU's annex copies the Código Civil. Its own articles stay open; the copy folds.
            if (d.copia) {
              var ci = d.copia.inicio, copiados = d.arvore.slice(ci).filter(function (n) { return n.tipo === 'artigo'; });
              var nr = function (n) { return n ? n.rotulo.replace(/^Artigo\s*/, '') : ''; };
              return h(React.Fragment, null, regua, cab, h('ul', { className: 'toc-list' }, d.arvore.slice(0, ci).map(linha)),
                h('details', { className: 'dobra toc-lei toc-copia' },
                  h('summary', null, 'A cópia dos artigos ' + nr(copiados[0]) + ' a ' + nr(copiados[copiados.length - 1]) + ' ' + (copiaDe ? copiaDe.genitivo || 'de ' + copiaDe.titulo : '') + ', publicada com o ' + d.sigla + ' (' + copiados.length + ' artigos)'),
                  h('p', { className: 'regra' }, h('strong', null, 'Nota: '), 'esta cópia vem da republicação publicada com o ' + d.sigla + ' e pode não ter alterações posteriores. O texto em vigor está no ' + (copiaDe ? copiaDe.titulo : d.copia.diploma) + '. ',
                    h('a', { href: link(['d', d.copia.diploma]) }, 'Ver estes artigos ' + (copiaDe ? copiaDe.genitivo || 'no diploma' : 'no diploma'))),
                  h('ul', { className: 'toc-list' }, d.arvore.slice(ci).map(function (n, i) { return linha(n, ci + i); }))));
            }
            var anexo = d.inicio_codigo != null ? d.inicio_codigo : d.arvore.map(function (n) { return /^Anexo/i.test(n.rotulo || ''); }).indexOf(true);
            var regua = h('div', { className: 'regua-atos', 'aria-hidden': 'true' },
              h('div', { className: 'ra-linha' }, acts.map(function (a, k) { return h('span', { key: k, className: 'ra-t' + (/Retifica/.test(a.designacao) ? ' ra-ret' : ''), style: { left: pos(a.publicacao) + '%' }, title: a.designacao }); })),
              h('div', { className: 'ra-anos' }, h('span', { className: 'ra-ini', style: { left: '0%' } }, ini.slice(0, 4)),
                h('span', { className: 'ra-hoje', style: { left: '100%' } }, 'hoje')));
            var cab = h('p', { className: 'toc-eixo' }, 'Em cima, os atos que alteraram o diploma. Em cada artigo, um traço por redação.');
            if (anexo <= 0) return h(React.Fragment, null, regua, cab, h('ul', { className: 'toc-list' }, d.arvore.map(linha)));
            var lei = d.arvore.slice(0, anexo).filter(function (n) { return n.tipo === 'artigo'; }).length;
            return h(React.Fragment, null, regua, cab,
              h('details', { className: 'dobra toc-lei' }, h('summary', null, 'Os ' + lei + ' artigos ' + (pela(d.designacao) === 'pelo' ? 'do ' : 'da ') + d.designacao + (d.inicio_historia ? ' que republicam o código' : ' que aprovam o código')),
                h('ul', { className: 'toc-list' }, d.arvore.slice(0, anexo).map(linha))),
              h('ul', { className: 'toc-list' }, d.arvore.slice(anexo).map(function (n, i) { return linha(n, anexo + i); })));
          })()),
        h('div', { className: 'dip-lado' },
        propostas.length ? h('section', { className: 'no-parl', 'aria-labelledby': 'parl' },
          h('h2', { id: 'parl', className: 'h2' }, 'No Parlamento'),
          h('p', { className: 'muted small' }, (propostas.length === 1 ? 'Uma iniciativa em curso propõe' : propostas.length + ' iniciativas em curso propõem') + ' alterar ' + (d.genitivo || 'este diploma').replace(/^d([ao]s?) /, '$1 ') + '. Ainda não ' + (propostas.length === 1 ? 'é' : 'são') + ' lei.'),
          (function () {
          // The four most recent stay open; the others fold, so the list of acts stays in view.
          var item = function (i) {
            var x = i.diplomas[d.slug], arts = x.artigos.concat(x.novos);
            return h('li', { key: i.id },
              h('p', { className: 'parl-nome' }, h('a', { href: link(['iniciativa', i.id]) }, i.designacao), h('span', { className: 'muted' }, ', ' + dePropos(i))),
              h('p', { className: 'parl-titulo', 'data-citacao': '' }, i.titulo),
              h('p', { className: 'parl-fase' }, i.fase_texto + ' ' + desdeFase(i)),
              arts.length ? h('p', { className: 'parl-arts' }, arts.length === 1 ? 'Artigo ' : 'Artigos ', artigosLista(d.slug, arts.slice(0, 12), true), arts.length > 12 ? ' e mais ' + (arts.length - 12) : '', '.')
                : h('p', { className: 'parl-arts muted' }, i.texto_lido ? 'Não encontrámos no texto os artigos que altera.' : 'Ainda não lemos o texto desta iniciativa.'));
          };
          return h(React.Fragment, null, h('ul', { className: 'parl-lista' }, propostas.slice(0, 4).map(item)),
            propostas.length > 4 ? h('details', { className: 'dobra' }, h('summary', null, 'Mais ' + (propostas.length - 4) + (propostas.length - 4 === 1 ? ' iniciativa' : ' iniciativas')),
              h('ul', { className: 'parl-lista' }, propostas.slice(4).map(item))) : null);
          })(),
          h('p', { className: 'fonte' }, 'Fonte: Assembleia da República, dados abertos, e o texto de cada iniciativa.')) : null,
        historias.length ? h('section', { 'aria-labelledby': 'hist' },
          h('h2', { id: 'hist', className: 'h2' }, 'Histórias'),
          h(ListaHistorias, { historias: historias, curta: true, semResumo: true })) : null,
        h('section', { 'aria-labelledby': 'alt' },
          h('h2', { id: 'alt', className: 'h2' }, 'Atos que o alteraram'),
          h('ol', { className: 'list' }, acts.map(function (a) {
            var n = a.alteracoes.filter(function (c) { return c.diploma === d.slug; }).length;
            return h('li', { key: a.id }, h('a', { href: link(['ato', a.id]) }, a.designacao),
              h('span', { className: 'muted' }, ' · ' + curta(a.publicacao) + ' · ' + n + (n === 1 ? ' artigo' : ' artigos')));
          })),
          h('p', { className: 'muted small lista-nota' }, acts.length + ' atos, do mais recente para o mais antigo.')))));
  }

  // ---- Article --------------------------------------------------------------------------------
  // What the text shows. The choice stays in the URL (ver=) and in this browser.
  var VER = [['texto', 'Texto'], ['mudou', 'Alterações'], ['origem', 'Origem do texto']];
  function verGuardado() { try { return localStorage.getItem('redacao-ver'); } catch (e) { return null; } }
  function guardarVer(v) { try { localStorage.setItem('redacao-ver', v); } catch (e) { /* private window */ } }
  // Another state of the same page, without a new entry in the browser history.
  function substituir(hash) { history.replaceState(null, '', hash); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  // An act that touched an article without changing its text (pipeline/build.py, "sem_alteracao").
  var SEM_ALT = {
    republicado: function (ato) { return 'Republicado sem alterações ' + pela(ato) + ' ' + ato; },
    revogado: function (ato) { return 'Revogado de novo ' + pela(ato) + ' ' + ato; },
    retificado: function (ato) { return 'A ' + ato + ' não mudou o texto'; },
    alterado: function (ato) { return 'Alterado ' + pela(ato) + ' ' + ato + ' sem mudar o texto (talvez a epígrafe)'; }
  };
  function nomeAto(v, atos, d) {
    if (v.tipo === 'original') return d && d.inicio_historia ? d.inicio_historia.rotulo + ' (' + d.designacao + ')' : 'Texto original';
    return (atos[v.ato] || { designacao: v.ato }).designacao;
  }
  function ordinal(i) { return (i + 1) + '.ª'; }
  function intervalo(art, i, base, hojeIdx) {
    var v = art.versoes[i], p = periodo(art, i, base), desde = extenso(p.inicio);
    var semVigor = base !== 'publicacao' && !v.vigor ? ' (data de publicação)' : '';
    if (hojeIdx == null || i > hojeIdx) return 'entra em vigor a ' + desde;
    if (p.fim === 'mesma') return 'começou a ' + desde + ', a mesma data da redação seguinte';
    if (!p.fim || i === hojeIdx) return 'em vigor desde ' + desde + semVigor;
    return 'em vigor de ' + desde + semVigor + ' a ' + extenso(p.fim);
  }
  function intervaloCurto(art, i, base, hojeIdx) {
    var p = periodo(art, i, base);
    if (hojeIdx == null || i > hojeIdx) return 'a partir de ' + curta(p.inicio);
    if (p.fim === 'mesma') return curta(p.inicio) + ', substituída no mesmo dia';
    if (!p.fim || i === hojeIdx) return 'desde ' + curta(p.inicio);
    return curta(p.inicio) + ' a ' + curta(p.fim);
  }
  // "Redação dada pela Lei n.º 64/2025, de 7 de novembro": the formula of Portuguese citations.
  // Returns [words before the act, the act's designation and date, act id].
  function formula(art, i, atos, d) {
    var v = art.versoes[i];
    if (v.tipo === 'original') {
      var de0 = d.publicacao ? ', de ' + semAno(d.publicacao) : '';
      return d.inicio_historia ? ['Redação da republicação ' + pela(d.designacao) + ' ', d.designacao + de0, d.ato_original] : ['Texto original, aprovado ' + pela(d.designacao) + ' ', d.designacao + de0, d.ato_original];
    }
    var a = atos[v.ato], des = a ? a.designacao : v.ato, de = v.publicacao ? ', de ' + semAno(v.publicacao) : '';
    var antes = v.tipo === 'retificado' ? 'Redação retificada ' : v.tipo === 'revogado' ? 'Revogado ' : v.tipo === 'aditado' ? 'Aditado ' : 'Redação dada ';
    return [antes + pela(des) + ' ', des + de, v.ato];
  }
  // The citation of the redação on screen. A retificação cites the act it corrected, then itself.
  function citacaoDe(art, i, atos, d) {
    var v = art.versoes[i], nome = art.rotulo.replace(/^Artigo\s*/, 'artigo ') + ' ' + (d.genitivo || 'de ' + d.titulo);
    var f = function (k) {
      var x = formula(art, k, atos, d);
      if (/^Texto original/.test(x[0])) return 'na redação original (' + x[1] + ')';
      return x[0].replace(/^Redação /, 'na redação ').replace(/^Aditado /, 'aditado ').replace(/^Revogado /, 'revogado ') + x[1];
    };
    if (v.tipo === 'retificado' && i > 0) {
      var a = atos[v.ato];
      return nome + ', ' + f(i - 1) + ', retificada ' + pela(a ? a.designacao : '') + ' ' + (a ? a.designacao : v.ato) + (v.publicacao ? ', de ' + semAno(v.publicacao) : '');
    }
    return nome + ', ' + f(i);
  }
  // The números a note names ("n.os 1 e 5", "n.º 2"), to mark them in the margin.
  function numerosDe(t) {
    var out = {}, re = /n\.os? ((?:\d+(?:-[A-Z])?(?:, | e )?)+)/g, m;
    while ((m = re.exec(t))) m[1].split(/, | e /).forEach(function (x) { if (x) out[x] = true; });
    return out;
  }
  // A table row: the pipeline writes it as one line, "│ cell │ cell │ cell". Rows of one table
  // have the same number of cells, so a grid with the same columns lines them up. segs are
  // [{op: 'eq'|'ins'|'del'|'novo', text}]: the cells keep the changes marked inside them.
  var TABELA = /^│/;
  function linhaTabela(segs, key) {
    var cels = [[]];
    segs.forEach(function (x, i) {
      var t = i === 0 ? x.text.replace(/^│\s?/, '') : x.text;
      nbsp(t).split(/\s*│\s*/).forEach(function (pt, k) { if (k) cels.push([]); if (pt) cels[cels.length - 1].push({ op: x.op, text: pt }); });
    });
    var texto = cels.map(function (c) { return c.filter(function (x) { return x.op !== 'del'; }).map(function (x) { return x.text; }).join(''); });
    var cab = !texto.some(function (c) { return /\d/.test(c); });
    return h('p', { key: key, className: 'lei-tab' + (cab ? ' lei-tab-cab' : ''), style: { gridTemplateColumns: 'minmax(0, 2fr) repeat(' + Math.max(1, cels.length - 1) + ', minmax(0, 1fr))' } },
      cels.map(function (c, k) {
        var num = /^[\d\s,.%€−-]+$/.test(texto[k]) && texto[k];
        return h('span', { key: k, className: 'cel' + (num ? ' cel-num' : '') }, k ? h('span', { className: 'rd-sr' }, '; ') : null,
          c.map(function (x, j) {
            if (x.op === 'ins') return h('ins', { key: j, className: 'rd-ins' }, h('span', { className: 'rd-sr' }, '[início de texto acrescentado] '), x.text, h('span', { className: 'rd-sr' }, ' [fim de texto acrescentado]'));
            if (x.op === 'del') return h('del', { key: j, className: 'rd-del' }, h('span', { className: 'rd-sr' }, '[início de texto eliminado] '), x.text, h('span', { className: 'rd-sr' }, ' [fim de texto eliminado]'));
            if (x.op === 'novo') return h('span', { key: j, className: 'acabado' }, x.text);
            return h('span', { key: j }, x.text);
          }));
      }));
  }
  // One line of the law, with its número or alínea hanging in the margin.
  function linhaLei(t, key, marca) {
    if (TABELA.test(t)) return linhaTabela([{ op: 'eq', text: t }], key);
    var p = partes(t);
    return h('p', { key: key, className: 'lei-p lei-' + (p.kind || 'x') + (revogada(p.resto) ? ' lei-rev' : '') + (marca && p.num && marca[p.num] ? ' lei-marca' : '') },
      p.nr ? h('span', { className: 'nr' }, p.nr + ' ') : null, nbsp(p.resto));
  }
  // No-break spaces where a line must not break: before % and €, and inside "50 000".
  function nbsp(t) { return t.replace(/(\d) (%|€)/g, '$1 $2').replace(/(\d) (\d{3})(?!\d)/g, '$1 $2'); }
  function segsLei(segs, key) {
    if (TABELA.test(segs.map(function (x) { return x.text; }).join(''))) return linhaTabela(segs, key);
    var first = segs[0], p = first && first.op === 'eq' ? partes(first.text) : { nr: '' };
    var rest = p.nr ? [{ op: 'eq', text: p.resto }].concat(segs.slice(1)) : segs;
    var novo = segs.filter(function (s) { return s.op !== 'del'; }).map(function (s) { return s.text; }).join('');
    var kind = partes(novo).kind || p.kind || 'x';
    return h('p', { key: key, className: 'lei-p lei-' + kind },
      p.nr ? h('span', { className: 'nr' }, p.nr + ' ') : null,
      rest.map(function (s, k) {
        if (s.op === 'eq') return h('span', { key: k }, nbsp(s.text));
        if (s.op === 'ins') return h('ins', { key: k, className: 'rd-ins' }, h('span', { className: 'rd-sr' }, '[início de texto acrescentado] '), nbsp(s.text), h('span', { className: 'rd-sr' }, ' [fim de texto acrescentado]'));
        return h('del', { key: k, className: 'rd-del' }, h('span', { className: 'rd-sr' }, '[início de texto eliminado] '), nbsp(s.text), h('span', { className: 'rd-sr' }, ' [fim de texto eliminado]'));
      }));
  }
  // "n.º 3", "alínea b) do n.º 4": where a paragraph sits, to name folds and copied changes.
  function ondeLinha(t, numero) {
    var m = /^(\d+(?:\.\d+)*(?:-[A-Z])?) — /.exec(t);
    if (m) return { numero: m[1], de: 'do n.º ' + m[1], a: 'ao n.º ' + m[1], nome: 'N.º ' + m[1] };
    m = /^([a-z]+(?:-[a-z])?)\) /.exec(t);
    var al = 'alínea ' + (m ? m[1] + ')' : '') + (numero ? ' do n.º ' + numero : '');
    if (m) return { numero: numero, de: 'da ' + al, a: 'à ' + al, nome: 'Alínea ' + al.slice(7) };
    return { numero: numero, de: 'do parágrafo', a: 'ao parágrafo', nome: 'Parágrafo' };
  }
  // Changes between two redações. Each changed paragraph can take focus ("Alteração 2 de 3").
  // Unchanged runs fold into one line that names where they start and end.
  // lado: the old and the new paragraph side by side.
  function alteracoes(antes, depois, lado, foco) {
    var lines = diffLines(antes, depois), out = [], run = [], numero = '', mudadas = [];
    function linha(l, k) {
      if (!lado) return segsLei(l, k);
      return h('div', { key: k, className: 'lado-row' },
        segsLei(l.filter(function (x) { return x.op !== 'ins'; }), 'a'), segsLei(l.filter(function (x) { return x.op !== 'del'; }), 'b'));
    }
    function fechar(k) {
      if (run.length < 2) run.forEach(function (x) { out.push(x.el); });
      else out.push(h('details', { key: 'd' + k, className: 'dobra' },
        h('summary', null, run.length + ' parágrafos sem alterações' + (run[0].w.de === 'do parágrafo' && run[run.length - 1].w.a === 'ao parágrafo' ? '.' : ', ' + run[0].w.de + ' ' + run[run.length - 1].w.a + '.')), run.map(function (x) { return x.el; })));
      run = [];
    }
    lines.forEach(function (l, k) {
      var w = ondeLinha(l.filter(function (x) { return x.op !== 'ins'; }).map(function (x) { return x.text; }).join('') || l.map(function (x) { return x.text; }).join(''), numero);
      numero = w.numero;
      if (l.some(function (x) { return x.op !== 'eq'; })) {
        fechar(k);
        var i = mudadas.length;
        mudadas.push({ onde: w.nome, antes: l.filter(function (x) { return x.op !== 'ins'; }).map(function (x) { return x.text; }).join(''), depois: l.filter(function (x) { return x.op !== 'del'; }).map(function (x) { return x.text; }).join('') });
        out.push(h('div', { key: 'c' + k, id: 'dif-' + i, tabIndex: -1, className: 'dif' + (i === foco ? ' is-foco' : '') }, linha(l, k)));
      } else run.push({ el: linha(l, k), w: w });
    });
    fechar('fim');
    return { n: mudadas.length, mudadas: mudadas, nodes: out };
  }
  function semMovimento() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function copiar(t, done) {
    try { navigator.clipboard.writeText(t).then(done, function () { }); } catch (e) { /* no clipboard */ }
  }
  var copiado = { chave: null };
  // ---- Verificação: the check of a redação against the official republications --------------------
  function republicacaoDe(d, ato) { return ((d.verificacao || {}).republicacoes || []).filter(function (r) { return r.ato === ato; })[0] || null; }
  // One difference: the consolidated words struck, the official ones underlined.
  function DifOficial(props) {
    var l = diffLines(props.par[0].replace(/ ¶ /g, ' '), props.par[1].replace(/ ¶ /g, ' '))[0] || [];
    return h('p', { className: 'dif-oficial' }, '«…', l.map(function (x, k) {
      if (x.op === 'eq') return h('span', { key: k }, x.text);
      return h(x.op === 'ins' ? 'ins' : 'del', { key: k, className: x.op === 'ins' ? 'rd-ins' : 'rd-del' },
        h('span', { className: 'rd-sr' }, x.op === 'ins' ? '[texto oficial: ' : '[texto aqui: '), x.text, h('span', { className: 'rd-sr' }, ']'));
    }), '…»');
  }
  // The line under the status: "Texto verificado: igual à republicação oficial da …".
  function linhaVerificacao(v, d, atos) {
    var x = v.verificacao;
    if (!x) return null;
    var ok = x.pontos.filter(function (p) { return p.veredicto === 'igual' || p.veredicto === 'so_forma'; });
    if (x.estado !== 'verificado' && x.estado !== 'forma') return null;
    var p = ok[ok.length - 1], r = republicacaoDe(d, p.ato);
    return h('p', { className: 'verif' }, h('span', { 'aria-hidden': 'true' }, '✓ '),
      x.estado === 'forma' ? 'Texto igual ao da republicação oficial, exceto pontuação ou maiúsculas (' : 'Texto igual ao da republicação oficial (',
      r ? r.designacao : p.ato, '). ', h('a', { href: '#/verificacao' }, 'Como verificamos'));
  }
  // The Atenção note when the official text is different.
  function avisoVerificacao(v, d) {
    var x = v.verificacao;
    if (!x || (x.estado !== 'desatualizado' && x.estado !== 'divergente')) return null;
    var dif = x.pontos.filter(function (p) { return p.veredicto === 'diferente'; });
    var r0 = republicacaoDe(d, (x.desde || dif[0].ato)), ult = republicacaoDe(d, dif[dif.length - 1].ato);
    var pares = dif[dif.length - 1].diff || [];
    return h('aside', { className: 'regra regra-aviso', 'aria-labelledby': 'verif-aviso' },
      h('p', { id: 'verif-aviso' }, h('strong', null, 'Atenção: '),
        x.estado === 'desatualizado'
          ? 'desde a republicação oficial de ' + (r0 ? r0.data.slice(0, 4) : '') + ' (' + (r0 ? r0.designacao : '') + '), o texto oficial deste artigo é diferente do texto aqui mostrado. O consolidado do Diário da República não tem essa mudança.'
          : 'este texto é diferente do texto da republicação oficial (' + (ult ? ult.designacao : '') + '). Ainda não confirmámos qual dos dois está certo.'),
      h('div', { className: 'dif-lista' }, h('p', { className: 'dif-legenda' }, 'Riscado: o texto aqui. Sublinhado: o texto oficial.'),
        pares.slice(0, 4).map(function (par, k) { return h(DifOficial, { key: k, par: par }); })),
      ult && ult.pdf ? h('p', null, h('a', { href: ult.pdf, target: '_blank', rel: 'noopener' }, 'Abrir a republicação oficial (PDF) ↗')) : null);
  }
  // The last redação shown, to know which way the reader moved and which words are new to them.
  var vista = { art: null, i: null, dir: null, desde: null };
  // One line of the law, with the words written after redação `desde` marked for a moment.
  function linhaMarcada(l, key, marca, desde) {
    if (TABELA.test(l.map(function (x) { return x[1]; }).join(''))) return linhaTabela(l.map(function (x) { return { op: x[0] > desde ? 'novo' : 'eq', text: x[1] }; }), key);
    var t = l.map(function (x) { return x[1]; }).join(''), p = partes(t), corte = t.length - p.resto.length, pos = 0;
    return h('p', { key: key, className: 'lei-p lei-' + (p.kind || 'x') + (revogada(p.resto) ? ' lei-rev' : '') + (marca && p.num && marca[p.num] ? ' lei-marca' : '') },
      p.nr ? h('span', { className: 'nr' }, p.nr + ' ') : null,
      l.map(function (x, k) {
        var a = pos; pos += x[1].length;
        if (pos <= corte) return null;
        var txt = nbsp(x[1].slice(Math.max(0, corte - a)));
        return x[0] > desde ? h('span', { key: k, className: 'acabado' }, txt) : txt;
      }));
  }
  // A sheet from the bottom of the screen, on a phone. The native dialog keeps focus inside and
  // closes with Esc; closing returns focus to the button that opened it.
  function Folha(props) {
    var ref = React.useRef(null);
    useEffect(function () {
      var d = ref.current;
      if (!d) return;
      if (props.aberta && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
      if (!props.aberta && d.open) d.close();
    });
    return h('dialog', { ref: ref, className: 'folha', 'aria-labelledby': props.id + '-t', onClose: props.onFechar,
      onClick: function (e) { if (e.target === ref.current) props.onFechar(); } },
      h('div', { className: 'folha-in' },
        h('div', { className: 'folha-cab' }, h('h2', { id: props.id + '-t' }, props.titulo),
          h('button', { type: 'button', className: 'rd-btn', onClick: props.onFechar }, 'Fechar')),
        props.children));
  }
  function estreito() { return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches); }
  // Tabs with one underline that slides to the chosen tab.
  function Abas(props) {
    var ref = React.useRef(null), linha = React.useRef(null);
    React.useLayoutEffect(function () {
      var b = ref.current && ref.current.querySelector('.is-on'), u = linha.current;
      if (!b || !u) return;
      u.style.left = b.offsetLeft + 'px'; u.style.width = b.offsetWidth + 'px';
      if (!u.classList.contains('pronta')) requestAnimationFrame(function () { u.classList.add('pronta'); });
    });
    return h('div', { className: 'tabs', role: 'group', 'aria-label': 'Mostrar', ref: ref },
      props.items.map(function (m) {
        return h('button', { key: m[0], type: 'button', className: 'tab' + (props.value === m[0] ? ' is-on' : ''), 'aria-pressed': props.value === m[0],
          onClick: function () { props.onChange(m[0]); } }, m[1]);
      }),
      h('span', { className: 'tabs-linha', ref: linha, 'aria-hidden': 'true' }));
  }
  function Artigo(props) {
    // The diploma's index first; the article's own file only when the index lists it.
    var ri = useData(['d/' + props.slug + '.json']);
    var existe = ri.data && ri.data[0].arvore.some(function (x) { return x.artigo === props.id; });
    var r = useData(existe ? ['d/' + props.slug + '.json', 'atos.json', 'passagem.json', 'd/' + props.slug + '/' + props.id + '.json', 'pendentes.json',
      '?quem.json', '?governos.json', '?historias/index.json', '?partilha.json', 'index.json'] : []);
    var cp = useState(0);
    var df = useState(0);   // the change in focus in Alterações
    var fl = useState(false);  // the phone sheet
    if (!ri.data) return h(Loading, { error: ri.error });
    var d = ri.data[0];
    if (existe && !r.data) return h(Loading, { error: r.error });
    var atos = existe ? r.data[1] : {}, ps = existe ? r.data[2] : {}, q = props.q;
    var art = existe ? r.data[3] : null;
    var propostas = existe ? pendentesDe(r.data[4], props.slug, props.id) : [];
    var ref = existe ? { atos: atos, passagem: ps, quem: r.data[5] || {}, governos: r.data[6], index: r.data[9] } : {};
    var historias = existe ? r.data[7] : null, pj = existe ? r.data[8] : null;
    // R-23 and R-22: who made a redação, in one short line.
    var pessoas = function (v) { var q = registo(ref, v.ato).quem; return q.oe ? fraseOE(q) : linhaPessoas(q, ref, v.ato); };
    if (!art) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos este artigo. Volte ao índice do diploma.'), h('a', { href: link(['d', d.slug]) }, d.titulo));
    var n = art.versoes.length, last = n - 1;
    var base = { vigor: 1, publicacao: 1 }[q.base] ? q.base : 'vigor';
    // redacao= opens one redação (by act id, or index in old links), even when the next one starts
    // on the same date. Without it, the date chooses. Without a date, the date is today.
    var ri = resolve(art, q.redacao, base);
    var date = validDate(q.em) || (ri >= 0 ? startOf(art.versoes[ri], base) : hoje());
    var porData = pick(art.versoes, date, base);
    var sel = ri >= 0 ? { i: ri, incerta: base !== 'publicacao' && !art.versoes[ri].vigor } : porData;
    var hojeSel = pick(art.versoes, hoje(), 'vigor'), hojeIdx = hojeSel ? hojeSel.i : null;
    var ver = { texto: 1, mudou: 1, origem: 1 }[q.ver] ? q.ver : ({ texto: 1, mudou: 1, origem: 1 }[verGuardado()] ? verGuardado() : 'texto');
    // Which way the reader moved: the new text comes from that side. After a step forward, the
    // words the newer redações wrote are marked for a moment.
    var chaveArt = d.slug + '/' + art.id;
    if (vista.art !== chaveArt) vista.dir = vista.desde = null;
    else if (sel && vista.i != null && vista.i !== sel.i) { vista.dir = sel.i > vista.i ? 'seguinte' : 'anterior'; vista.desde = sel.i > vista.i ? vista.i : null; }
    vista.art = chaveArt; vista.i = sel ? sel.i : null;
    function versionHref(i, extra) {
      return link(['d', d.slug, art.id], Object.assign({ redacao: versionKey(art, i), ver: q.ver, lado: q.lado }, extra || {}));
    }
    var go = function (o) { location.hash = link(['d', d.slug, art.id], { em: o.date, base: o.basis !== 'vigor' ? o.basis : null, ver: q.ver }); };
    var cur = sel ? art.versoes[sel.i] : null;
    var curAto = cur ? atos[cur.ato] : null;
    var epigrafe = (art.epigrafe || '').replace(/^\((.*)\)$/, '$1');
    document.title = art.rotulo + ' ' + d.sigla + (cur ? ', redação de ' + abrev(startOf(cur, base)) : '') + ' · Redação';
    var notas = art.notas || [];
    // Notes from the act that wrote the redação on screen: a transitional norm or a later date of effect.
    var transitorias = cur && cur.tipo !== 'original' ? notas.filter(function (x) { return x.ato && x.ato === cur.ato; }) : [];
    var marcas = {};
    transitorias.forEach(function (x) { Object.assign(marcas, numerosDe(x.texto)); });
    var outras = notas.filter(function (x) { return transitorias.indexOf(x) < 0; });
    var passada = sel && hojeIdx != null && sel.i < hojeIdx;
    var futura = sel && (hojeIdx == null || sel.i > hojeIdx);
    var per = sel ? periodo(art, sel.i, base) : null;
    var anterior = sel && sel.i > 0 ? art.versoes[sel.i - 1] : null;
    var diferente = anterior && cur.tipo === 'alterado' && semelhanca(d.slug + '/' + art.id + '/' + sel.i, texto(anterior), texto(cur)) < DIFERENTE;
    var up = pending(art.versoes, date);
    var citacao = cur ? citacaoDe(art, sel.i, atos, d) : '';
    var permalink = location.href.split('#')[0] + (cur ? versionHref(sel.i, { ver: null }) : '');
    var nomeOriginal = d.inicio_historia ? d.inicio_historia.rotulo + ' (' + d.designacao + ')' : 'Texto original';
    // Neighbouring articles in the diploma.
    var ordem = d.arvore.filter(function (x) { return x.tipo === 'artigo'; });
    var pos = ordem.map(function (x) { return x.artigo; }).indexOf(art.id);
    var vizinho = function (k) {
      var x = ordem[pos + k], nr = x ? ' (' + x.rotulo.replace(/^Artigo\s*/, '') + ')' : '';
      return x ? h('a', { href: link(['d', d.slug, x.artigo]) }, k < 0 ? '‹ Artigo anterior' + nr : 'Artigo seguinte' + nr + ' ›') : null;
    };
    // For diplomas with few acts (the Constitution), say which acts did not change this article.
    var doDiploma = Object.keys(atos).map(function (k) { return atos[k]; }).filter(function (a) { return a.alteracoes.some(function (c) { return c.diploma === d.slug; }); });
    var naoAlteraram = doDiploma.length <= 10 ? doDiploma.filter(function (a) { return !art.versoes.some(function (v) { return v.ato === a.id || (v.sem_alteracao || []).some(function (x) { return x.ato === a.id; }); }); })
      .sort(function (a, b) { return a.publicacao < b.publicacao ? -1 : 1; }) : [];
    var naoFrase = naoAlteraram.length ? (naoAlteraram.every(function (a) { return /^Lei Constitucional/.test(a.designacao); })
      ? (naoAlteraram.length === 1 ? 'A revisão constitucional de ' : 'As revisões constitucionais de ') + naoAlteraram.map(function (a) { return a.publicacao.slice(0, 4); }).join(', ').replace(/, (\d{4})$/, ' e $1') + (naoAlteraram.length === 1 ? ' não alterou este artigo.' : ' não alteraram este artigo.')
      : 'Estes atos alteraram o diploma, mas não este artigo: ' + naoAlteraram.map(function (a) { return a.designacao; }).join(', ') + '.') : '';

    // Arriving from an act's page: walk through the articles that act changed in this diploma.
    var porAto = null;
    if (q.ato && atos[q.ato]) {
      var ordemArt = {};
      d.arvore.forEach(function (x, j) { if (x.tipo === 'artigo') ordemArt[x.artigo] = j; });
      var lista = atos[q.ato].alteracoes.filter(function (c) { return c.diploma === d.slug; })
        .sort(function (x, y) { return (ordemArt[x.artigo] || 0) - (ordemArt[y.artigo] || 0); });
      var kk = lista.map(function (c) { return c.artigo; }).indexOf(art.id);
      if (kk >= 0) porAto = { ato: atos[q.ato], lista: lista, k: kk, ir: function (j, txt) {
        var c = lista[j];
        return c ? h('a', { href: link(['d', d.slug, c.artigo], { redacao: q.ato, ver: c.tipo === 'alterado' ? 'mudou' : null, ato: q.ato }) }, txt) : null;
      } };
    }
    var corpo, resumo = null;
    if (cur && ver === 'origem') {
      var model = originModel(art, sel.i, atos, function (o) { return versionHref(o); }, nomeOriginal);
      model.acts.forEach(function (a) {
        var o = a.versao;
        if (o > 0) { a.diffHref = versionHref(o, { ver: 'mudou' }); a.beforeHref = versionHref(o - 1); }
        var v = o != null ? art.versoes[o] : null;
        if (v && v.tipo !== 'original' && atos[v.ato]) a.nota = textoDe(pessoas(v));
      });
      corpo = h('div', { className: 'lei lei-origem' }, h(R.TextOrigin, { key: art.id + sel.i, paragraphs: model.paragraphs, acts: model.acts, margem: true }),
        // R-30: what the colours mean.
        h('p', { className: 'legenda' }, 'Cada cor é um diploma que escreveu parte do texto.' + (model.acts.some(function (x) { return x.index === 7 && x.versao == null; }) ? ' Os diplomas mais antigos têm a mesma cor.' : '')));
    } else if (cur && ver === 'mudou' && n > 1 && (sel.i > 0 || q.com)) {
      // Compare with the redação before, or with the one the reader chose ("Comparar com").
      var com = q.com ? resolve(art, q.com, base) : -1;
      if (com < 0 || com === sel.i) com = sel.i - 1;
      if (com < 0) com = sel.i + 1 < n ? sel.i + 1 : sel.i;
      var a0 = Math.min(com, sel.i), a1 = Math.max(com, sel.i), lado = q.lado === '1';
      var alt = alteracoes(texto(art.versoes[a0]), texto(art.versoes[a1]), lado, df[0]);
      var foco = Math.min(df[0], Math.max(0, alt.n - 1));
      var irDif = function (k) {
        df[1](k);
        setTimeout(function () { var e = document.getElementById('dif-' + k); if (e) { e.focus({ preventScroll: true }); e.scrollIntoView({ block: 'center', behavior: semMovimento() ? 'auto' : 'smooth' }); } }, 0);
      };
      var nomeR = function (i) { return ordinal(i) + ' redação (' + nomeAto(art.versoes[i], atos, d) + ')'; };
      var copiarAlt = function () {
        var t = art.rotulo + ' ' + (d.genitivo || 'de ' + d.titulo) + ': alterações da ' + nomeR(a0) + ' para a ' + nomeR(a1) + '.\n\n' +
          alt.mudadas.map(function (m) { return m.onde + '\nAntes: ' + (m.antes || '(não existia)') + '\nDepois: ' + (m.depois || '(eliminado)'); }).join('\n\n') +
          '\n\nFonte: Diário da República (legislação consolidada). ' + permalink;
        copiar(t, function () { copiado.chave = 'alt' + a0 + '-' + a1; cp[1](cp[0] + 1); });
      };
      var feito = copiado.chave === 'alt' + a0 + '-' + a1;
      resumo = h('div', { className: 'alt-cabeca' },
        h('p', { className: 'resumo', 'aria-live': 'polite' }, alt.n ? (alt.n === 1 ? '1 alteração' : alt.n + ' alterações') : 'Sem alterações no texto', a0 === sel.i - 1 && a1 === sel.i ? ' em relação à ' + nomeR(a0) + '.' : ' entre a ' + nomeR(a0) + ' e a ' + nomeR(a1) + '.'),
        h('div', { className: 'alt-ferr' },
          h('label', { className: 'alt-com' }, h('span', null, 'Comparar com'),
            h('select', { className: 'rd-input', value: com, onChange: function (e) { var k = +e.target.value; df[1](0); substituir(versionHref(sel.i, { ver: 'mudou', com: k === sel.i - 1 ? null : versionKey(art, k) })); } },
              art.versoes.map(function (v, i) { return i === sel.i ? null : h('option', { key: i, value: i }, ordinal(i) + ' · ' + nomeAto(v, atos, d) + (i === sel.i - 1 ? ' (anterior)' : '')); }))),
          h('button', { type: 'button', className: 'rd-btn alt-lado', 'aria-pressed': lado, onClick: function () { substituir(versionHref(sel.i, { ver: 'mudou', com: q.com, lado: lado ? null : '1' })); } }, lado ? 'No texto' : 'Lado a lado'),
          alt.n > 1 ? h('span', { className: 'alt-nav' },
            h('button', { type: 'button', className: 'rd-btn', 'aria-disabled': foco === 0, onClick: function () { if (foco > 0) irDif(foco - 1); } }, h('span', { 'aria-hidden': 'true' }, '↑ '), 'Anterior'),
            h('span', { className: 'alt-pos', role: 'status' }, 'Alteração ' + (foco + 1) + ' de ' + alt.n),
            h('button', { type: 'button', className: 'rd-btn', 'aria-disabled': foco === alt.n - 1, onClick: function () { if (foco < alt.n - 1) irDif(foco + 1); } }, 'Seguinte', h('span', { 'aria-hidden': 'true' }, ' ↓'))) : null,
          alt.n ? h('button', { type: 'button', className: 'rd-btn', onClick: copiarAlt }, h('span', { key: feito ? 'c' : 'n', className: 'troca' }, feito ? 'Alterações copiadas' : 'Copiar antes e depois')) : null),
        lado ? h('div', { className: 'lado-head', 'aria-hidden': 'true' }, h('span', null, 'Antes · ' + nomeAto(art.versoes[a0], atos, d)), h('span', null, 'Depois · ' + nomeAto(art.versoes[a1], atos, d))) : null);
      corpo = h('div', { className: 'lei' + (lado ? ' lei-lado' : '') }, alt.nodes,
        h('p', { className: 'rd-redline-legend' }, h('span', { className: 'rd-key rd-key-ins' }, h('ins', null, 'acrescentado')), h('span', { className: 'rd-key rd-key-del' }, h('del', null, 'eliminado'))));
    } else if (cur) {
      if (ver === 'mudou' && n === 1) resumo = h('p', { className: 'resumo' }, 'Este artigo tem uma só redação: o texto nunca mudou.');
      else if (ver === 'mudou') resumo = h('p', { className: 'resumo' }, 'Esta é a primeira redação. Não há uma redação anterior. ',
        n > 1 ? h('a', { href: versionHref(0, { ver: 'mudou', com: versionKey(art, 1) }) }, 'Comparar com a redação seguinte') : null);
      corpo = h('div', { className: 'lei' }, vista.desde != null
        ? cur.linhas.map(function (l, k) { return linhaMarcada(l, k, marcas, vista.desde); })
        : texto(cur).split('\n').map(function (t, k) { return linhaLei(t, k, marcas); }));
    }
    var tabs = h(Abas, { items: VER, value: ver, onChange: function (v) { vista.dir = vista.desde = null; guardarVer(v); substituir(link(['d', d.slug, art.id], Object.assign({}, q, { ver: v }))); } });
    var dataPop = h(R.Popover, { label: 'Data', title: 'Ver o artigo noutra data', className: 'pop-data' },
      h(R.DateLens, { date: date, basis: base, today: hoje(), id: 'lente', onChange: go, bases: ['vigor', 'publicacao'] }));
    var f = cur ? formula(art, sel.i, atos, d) : null;
    var status = cur ? h(React.Fragment, null, h('strong', null, h('span', { 'aria-hidden': 'true' }, ordinal(sel.i) + ' de ' + n), h('span', { className: 'rd-sr' }, 'redação ' + (sel.i + 1) + ' de ' + n)), ' · ' + nomeAto(cur, atos, d) + ' · ', h('span', { className: 'muted' }, intervaloCurto(art, sel.i, base, hojeIdx))) : 'Sem texto nesta data';

    // The register's rows, in the right column and in the phone sheet.
    var itensRegisto = art.versoes.map(function (v, i) {
            var a = atos[v.ato], p = periodo(art, i, 'vigor'), atual = sel && i === sel.i;
            return { ordinal: ordinal(i), label: nomeAto(v, atos, d), date: curta(startOf(v, 'vigor')), band: corDe(art, i), href: versionHref(i),
              current: atual, technical: v.tipo === 'retificado',
              details: atual ? [
                h('p', { key: 'd' }, 'Publicação: ' + curta(v.publicacao) + (v.vigor ? ' · Em vigor: ' + curta(v.vigor) + (p.fim && p.fim !== 'mesma' ? ' a ' + curta(p.fim) : '') : ' · Entrada em vigor não indicada')),
                v.artigo_do_ato && a ? h('p', { key: 'n' }, TIPO[v.tipo] + ' pelo ' + v.artigo_do_ato.toLowerCase() + ' ' + (pela(a.designacao) === 'pelo' ? 'do ' : 'da ') + a.designacao + '.') : null,
                (v.sem_alteracao || []).length ? h('p', { key: 's', className: 'reg-sem' }, v.sem_alteracao.map(function (x) {
                  var ax = atos[x.ato] || { designacao: x.ato };
                  return SEM_ALT[x.tipo] ? SEM_ALT[x.tipo](ax.designacao) + ' (' + curta(x.publicacao) + '). ' : ax.designacao + ' abrangeu este artigo sem mudar o texto (' + curta(x.publicacao) + '). ';
                })) : null,
                a && v.tipo !== 'original' ? h('p', { key: 'p', className: 'reg-parl' }, h('a', { href: link(['ato', v.ato]) }, render(pessoas(v)))) : null,
                h('p', { key: 'l' }, i > 0 ? h('a', { href: versionHref(i, { ver: 'mudou' }) }, 'Ver as alterações') : null, i > 0 && a ? ' · ' : null,
                  a ? h('a', { href: link(['ato', v.ato]) }, 'Ver o ato') : null)
              ] : null };
          });
    // Terms of the glossary on this page: the status line and the register.
    var termosArt = termosPara(glossarioAtual, TERMOS.artigo), termosVistos = new Set();
    // R-7: an article of the NRAU's annex is a copy of the Código Civil.
    var copia = null;
    if (art.copia_de) {
      var dc = ((ref.index || {}).diplomas || []).filter(function (x) { return x.slug === art.copia_de.diploma; })[0];
      copia = { nome: dc ? dc.titulo : art.copia_de.diploma, genitivo: dc ? (dc.genitivo || 'de ' + dc.titulo) : '' };
    }
    // R-61: share the redação on screen. A page with a link preview when the build made one.
    var chave = cur ? chavePartilha(art, sel.i) : null;
    var urlPartilha = cur ? partilhaUrl((pj && pj.base) || location.href.split('#')[0], pj, d.slug, art.id, chave, permalink) : '';
    var estadoTxt = !cur ? '' : passada ? (per.fim === 'mesma' ? 'Substituída no mesmo dia' : 'Esteve em vigor de ' + extenso(per.inicio) + ' a ' + extenso(per.fim))
      : futura ? 'Entra em vigor a ' + extenso(per.inicio) : (cur.tipo === 'revogado' ? 'Revogado desde ' : 'Em vigor desde ') + extenso(per.inicio);
    var textoPartilha = d.titulo + ' · ' + art.rotulo + (epigrafe ? ' — ' + epigrafe : '') + '. ' + estadoTxt + '.';
    function partilhar() {
      if (estreito() && navigator.share) { navigator.share({ title: d.titulo + ' · ' + art.rotulo, text: textoPartilha, url: urlPartilha }).catch(function () { }); return; }
      copiar(textoPartilha + '\n' + urlPartilha, function () { copiado.chave = urlPartilha; cp[1](cp[0] + 1); });
    }
    // R-62 (a shared link to an older redação) and R-46 (a story cites this article).
    var notas62 = [];
    if (q.de === 'partilha' && sel && sel.i !== last) notas62.push(h('p', { key: 'p', className: 'regra' }, h('strong', null, 'Nota: '), 'há uma redação mais recente deste artigo. ', h('a', { href: link(['d', d.slug, art.id]) }, 'Ver o texto de hoje')));
    // One note per story: the section about the redação on screen, else the first one listed.
    var atoSel = sel && art.versoes[sel.i] ? art.versoes[sel.i].ato : null, porHistoria = {};
    ((historias && historias.artigos && historias.artigos[d.slug + '/' + art.id]) || []).forEach(function (x) {
      if (!porHistoria[x.historia] || x.seccao === atoSel) porHistoria[x.historia] = x;
    });
    Object.keys(porHistoria).map(function (s) { return porHistoria[s]; }).forEach(function (x, k) {
      var hx = (historias.historias || []).filter(function (y) { return y.slug === x.historia; })[0];
      if (hx) notas62.push(h('p', { key: 'h' + k, className: 'regra' }, h('strong', null, 'Nota: '), 'este artigo aparece na história «' + hx.titulo + '». ', h('a', { href: link(['historia', hx.slug], { ir: x.seccao }) }, 'Ler a história')));
    });
    return h('div', { className: 'artigo', 'data-dir': vista.dir, 'data-passada': passada ? '' : undefined },
      h('div', { className: 'corrida' },
        h('p', null, h('a', { href: link(['d', d.slug]) }, h('abbr', { title: d.titulo }, h('span', { 'aria-hidden': 'true' }, d.sigla), h('span', { className: 'rd-sr' }, d.titulo))),
          art.caminho.length ? ' · ' + art.caminho[art.caminho.length - 1] : ''),
        h('nav', { className: 'vizinhos', 'aria-label': 'Artigos vizinhos' }, vizinho(-1), vizinho(1))),
      h('header', { className: 'art-head' },
        h('h1', { className: 'art-titulo' }, h('span', { className: 'art-num' }, art.rotulo), epigrafe ? h('span', { className: 'art-ep' }, epigrafe) : null),
        cur ? h('div', { className: 'art-acoes' },
          h('button', { type: 'button', className: 'rd-btn', onClick: function () { copiar(citacao + '\n' + permalink, function () { copiado.chave = citacao; cp[1](cp[0] + 1); }); } }, h('span', { key: copiado.chave === citacao ? 'c' : 'n', className: 'troca' }, copiado.chave === citacao ? 'Citação copiada' : 'Copiar citação')),
          h('button', { type: 'button', className: 'rd-btn', onClick: partilhar }, h('span', { key: copiado.chave === urlPartilha ? 'c' : 'n', className: 'troca' }, copiado.chave === urlPartilha ? 'Ligação copiada' : 'Partilhar')),
          curAto && curAto.link ? h('a', { className: 'rd-link', href: curAto.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗') : d.link ? h('a', { className: 'rd-link', href: d.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗') : null) : null),
      cur ? h('div', { className: 'estado' },
        h('p', { className: 'estado-formula' }, h('em', null, render(marcarTermos([f[0]], termosVistos, termosArt)), atos[f[2]] ? h('a', { href: link(['ato', f[2]]) }, f[1]) : f[1])),
        passada ? h('p', { className: 'estado-passada' }, (per.fim === 'mesma' ? 'Substituída no mesmo dia pela redação seguinte' : 'Esteve em vigor de ' + extenso(per.inicio) + ' a ' + extenso(per.fim)) + ' · ', h('a', { href: link(['d', d.slug, art.id], { ver: q.ver }) }, 'Ir para hoje'))
          : futura ? h('p', { className: 'estado-futura' }, 'Ainda não está em vigor. Entra em vigor a ' + extenso(per.inicio) + '. ', hojeIdx != null ? h('a', { href: link(['d', d.slug, art.id], { ver: q.ver }) }, 'Ir para hoje') : null)
          : h('p', null, (cur.tipo === 'revogado' ? 'Revogado desde ' : 'Em vigor desde ') + extenso(per.inicio) + (sel.incerta ? ' (data de publicação)' : '') + '.'),
        sel.i !== last && epigrafe ? h('p', { className: 'muted small' }, 'Epígrafe de hoje. A desta redação pode ser outra.') : null,
        linhaVerificacao(cur, d, atos),
        notas62.length ? notas62 : null) : null,
      h(Guia, { tipo: 'artigo', fechada: estreito() }),
      sel ? h(R.TimeRuler, { id: 'regua', current: sel.i, today: hoje(), onGo: function (k) { substituir(versionHref(k)); },
        versions: art.versoes.map(function (v, i) {
          return { start: startOf(v, base), technical: v.tipo === 'retificado' || periodo(art, i, base).fim === 'mesma', pending: hojeIdx == null || i > hojeIdx,
            label: ordinal(i) + ' redação: ' + nomeAto(v, atos, d) + ', ' + intervalo(art, i, base, hojeIdx) };
        }) }) : null,
      sel ? h('p', { className: 'legenda legenda-regua' }, 'Cada traço é uma redação.') : null,
      h(R.VersionBar, { id: 'barra', current: sel ? sel.i : -1, count: n, status: status,
        onGo: function (k) { substituir(versionHref(k)); },
        onStatus: function () { if (estreito()) { fl[1](true); return; } var e = document.getElementById('historia'); if (e) { e.scrollIntoView(); e.focus(); } } },
        h('div', { className: 'so-largo tools' }, tabs, dataPop)),
      h('div', { className: 'so-estreito tools' }, tabs, dataPop),
      // Side by side and the margin notes of Origem do texto need the full width: the register moves under the text.
      h('div', { className: 'art-corpo' + ((ver === 'mudou' && q.lado === '1') || ver === 'origem' ? ' corpo-largo' : '') },
        h('div', { className: 'art-texto' },
          copia ? h('aside', { className: 'regra' }, h('p', null, h('strong', null, 'Nota: '), 'esta cópia vem da republicação publicada com o ' + d.sigla + ' e pode não ter alterações posteriores. O texto em vigor está no ' + copia.nome + '. ',
            h('a', { href: link(['d', art.copia_de.diploma, art.copia_de.artigo]) }, 'Ver o artigo ' + numArtigo(art.copia_de.artigo) + ' ' + copia.genitivo))) : null,
          transitorias.length ? h('aside', { className: 'regra regra-aviso', 'aria-labelledby': 'transit' },
            h('p', { id: 'transit' }, h('strong', null, 'Atenção: '), 'uma norma ', pela(curAto ? curAto.designacao : '') === 'pelo' ? 'do ' : 'da ', h(ActLink, { id: cur.ato, atos: atos }),
              transitorias[0].artigo_do_ato ? ' (' + transitorias[0].artigo_do_ato.toLowerCase() + ')' : '', ' muda a aplicação deste artigo no tempo. Leia a norma antes de aplicar o texto.'),
            h('details', null, h('summary', null, 'Ler a norma'),
              transitorias.map(function (x, k) { return h('blockquote', { key: k, 'data-citacao': '' }, x.texto); }))) : null,
          cur ? avisoVerificacao(cur, d) : null,
          porAto ? h('nav', { className: 'regra regra-ato', 'aria-label': 'Artigos alterados por este ato' },
            h('p', null, 'Está a percorrer os artigos que a ', h(ActLink, { id: porAto.ato.id, atos: atos }), ' mudou no ' + d.sigla + ': artigo ' + (porAto.k + 1) + ' de ' + porAto.lista.length + '.'),
            h('p', { className: 'regra-links' }, porAto.ir(porAto.k - 1, '‹ Artigo anterior'), porAto.ir(porAto.k + 1, 'Artigo seguinte ›'), h('a', { href: link(['ato', porAto.ato.id]) }, 'Voltar ao ato'))) : null,
          diferente ? h('aside', { className: 'regra' }, h('p', null, h('strong', null, 'Nota: '), 'esta redação tem um texto muito diferente da redação anterior. O artigo pode ter mudado de número numa revisão. Por isso, a comparação pode juntar dois artigos diferentes.')) : null,
          up.length ? h('aside', { className: 'regra regra-pendente' }, h('p', null, h('strong', null, 'Nota: '), 'nesta data já está publicada uma alteração que ainda não está em vigor. ',
            up.map(function (v, i) { return h('span', { key: i }, h(ActLink, { id: v.ato, atos: atos }), ' entra em vigor a ' + extenso(v.vigor) + '. '); }))) : null,
          sel && sel.incerta ? h('aside', { className: 'regra regra-aviso' }, h('p', null, h('strong', null, 'Atenção: '), 'o Diário da República não indica a data de entrada em vigor desta redação. Contamos a partir da publicação (' + extenso(cur.publicacao) + ').' + (cur.vigor_regra === 'condicional' ? ' A entrada em vigor depende de outra legislação (' + cur.vigor_fonte + ').' : ''))) : null,
          !cur ? h('div', { className: 'vazio' }, h('p', null, 'Nesta data o artigo ainda não existia.'), h('p', null, 'A primeira redação é de ' + extenso(startOf(art.versoes[0], base)) + '. ', h('a', { href: versionHref(0) }, 'Ver a primeira redação'))) : null,
          // Keyed by redação and view: a new text arrives with a short fade from the side it came from.
          h('div', { key: (sel ? sel.i : '-') + ver, className: 'art-lei' }, resumo, corpo),
          d.inicio_historia && cur && sel.i === 0 ? h('p', { className: 'nota-hist' }, d.inicio_historia.nota) : null,
          // Bills that would change this article: right under its text, where readers look.
          propostas.length ? h(NoParlamento, { lista: propostas, id: 'parl', secao: true }) : null,
          outras.length ? h('section', { className: 'secao', 'aria-labelledby': 'notas' },
            h('h2', { id: 'notas' }, 'Notas'),
            h('ul', { className: 'notas' }, outras.map(function (x, i) {
              return h('li', { key: i }, h('p', null, x.texto), h('p', { className: 'muted small' }, 'Fonte: ', x.ato ? h(ActLink, { id: x.ato, atos: atos }) : x.fonte, x.ato && x.artigo_do_ato ? ', ' + x.artigo_do_ato.toLowerCase() : ''));
            }))) : null,
          cur ? h('section', { className: 'secao', 'aria-labelledby': 'citar' },
            h('h2', { id: 'citar' }, 'Citar'),
            h(R.Citation, { key: citacao, text: citacao.charAt(0).toUpperCase() + citacao.slice(1) + '.', permalink: permalink })) : null,
          cur ? h('section', { className: 'secao', 'aria-labelledby': 'fonte' },
            h('h2', { id: 'fonte' }, 'Fonte'),
            h('p', { className: 'fonte' }, 'Copiámos este texto do consolidado do Diário da República. ',
              cur.verificacao ? ['Comparámo-lo com as republicações oficiais da ' + (d.genitivo || d.titulo).replace(/^d[ao]s? /, '') + '. ', h('a', { key: 'v', href: '#/verificacao' }, 'Ver a verificação'), '. ']
                : 'Ainda não o comparámos com o ato publicado. ', 'Só o Diário da República faz fé.')) : null),
        h('aside', { className: 'art-registo', 'aria-labelledby': 'historia' },
          h('h2', { id: 'historia', tabIndex: -1 }, 'Redações'),
          h('p', { className: 'muted small' }, 'Redações, da mais antiga para a mais recente.'),
          h(R.Register, { label: 'Redações do ' + art.rotulo.replace('Artigo', 'artigo'), items: itensRegisto }),
          h('p', { className: 'muted small' }, 'Data de entrada em vigor de cada redação.'),
          naoFrase ? h('p', { className: 'nao-alteraram' }, naoFrase) : null)),
      cur ? h(Folha, { id: 'folha', aberta: fl[0], onFechar: function () { fl[1](false); }, titulo: ordinal(sel.i) + ' redação de ' + n },
        h('p', { className: 'folha-estado' }, h('em', null, f[0], f[1]), h('br'), intervalo(art, sel.i, base, hojeIdx)),
        h('section', { className: 'folha-sec', 'aria-labelledby': 'folha-data' }, h('h3', { id: 'folha-data' }, 'Ver noutra data'),
          h(R.DateLens, { date: date, basis: base, today: hoje(), id: 'lente-folha', onChange: function (o) { fl[1](false); go(o); }, bases: ['vigor', 'publicacao'] })),
        h('section', { className: 'folha-sec', 'aria-labelledby': 'folha-red' }, h('h3', { id: 'folha-red' }, 'Redações'),
          h('ol', { className: 'folha-lista' }, art.versoes.map(function (v, i) {
            return h('li', { key: i, className: i === sel.i ? 'is-on' : '' },
              h('a', { href: versionHref(i), 'aria-current': i === sel.i ? 'true' : undefined, onClick: function () { fl[1](false); } },
                h('span', { className: 'folha-ord' }, ordinal(i)), h('span', { className: 'rd-reg-band rd-c-act-' + corDe(art, i), 'aria-hidden': 'true' }),
                h('span', { className: 'folha-ato' }, nomeAto(v, atos, d)), h('span', { className: 'folha-dt' }, curta(startOf(v, 'vigor')))));
          }))),
        propostas.length ? h('section', { className: 'folha-sec' }, h(NoParlamento, { lista: propostas, id: 'parl-folha', nivel: 'h3' })) : null,
        h('p', { className: 'folha-acoes' }, h('button', { type: 'button', className: 'rd-btn', onClick: function () { copiar(citacao + '\n' + permalink, function () { copiado.chave = citacao; cp[1](cp[0] + 1); }); } },
          h('span', { key: copiado.chave === citacao ? 'c' : 'n', className: 'troca' }, copiado.chave === citacao ? 'Citação copiada' : 'Copiar citação')))) : null);
  }
  // ---- Bills now in Parliament (pipeline/pendentes.py) ----------------------------------------------
  // A bill that is not law yet: where it stands, its generalidade vote, and what it would change.
  function IniciativaPendente(props) {
    var ini = props.ini, nomes = {};
    props.diplomas.forEach(function (x) { nomes[x.slug] = x; });
    document.title = ini.designacao + ' · Redação';
    var p = { ordem_grupos: ini.ordem_grupos };
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], [ini.designacao]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, ini.designacao),
        h('p', { className: 'lead', 'data-citacao': '' }, ini.titulo),
        h('p', { className: 'parl-estado' }, h(R.StatusPill, { status: 'pendente' }, 'Em curso'), ' ', ini.fase_texto + ' ' + desdeFase(ini)),
        h(Guia, { tipo: 'iniciativa' })),
      h('div', { className: 'duas' },
        h('div', { className: 'coluna' },
          h('section', { className: 'secao', 'aria-labelledby': 'muda' },
            h('h2', { id: 'muda' }, 'O que propõe alterar'),
            h('ul', { className: 'parl-muda' }, Object.keys(ini.diplomas).map(function (slug) {
              var x = ini.diplomas[slug], dd = nomes[slug] || { titulo: slug };
              return h('li', { key: slug },
                h('p', null, h('a', { href: link(['d', slug]) }, dd.titulo)),
                x.artigos.length ? h('p', null, x.artigos.length === 1 ? 'Altera o artigo ' : 'Altera os artigos ', artigosLista(slug, x.artigos, true), '.') : null,
                x.novos.length ? h('p', null, x.novos.length === 1 ? 'Acrescenta ou altera o artigo ' : 'Acrescenta ou altera os artigos ', artigosLista(slug, x.novos, false), ', que não temos.') : null,
                !x.artigos.length && !x.novos.length ? h('p', { className: 'muted' }, ini.texto_lido ? 'Não encontrámos no texto os artigos que altera.' : 'Ainda não lemos o texto desta iniciativa.') : null);
            })),
            h('p', { className: 'fonte' }, 'Lemos os artigos no texto da iniciativa. Confirme no texto, que é o que conta.')),
          h('section', { className: 'secao', 'aria-labelledby': 'geral-h' },
            h('h2', { id: 'geral-h' }, 'Primeira votação: na generalidade'),
            ini.generalidade ? h(BlocoVoto, { v: ini.generalidade, ordem: ordemDe(p, [ini.generalidade]), titulo: ini.designacao, designacao: ini.designacao })
              : h('p', { className: 'lede' }, ini.fase === 'sem_votacao' ? 'Esta iniciativa voltou à comissão sem votação na generalidade.' : 'Ainda não foi votada na generalidade.'))),
        h('aside', { className: 'factos', 'aria-label': 'Autores e fontes' },
          h('dl', null,
            h('dt', null, 'Apresentada por'), h('dd', null, quemPropos(ini)),
            ini.entrada ? [h('dt', { key: 'et' }, 'Entrada'), h('dd', { key: 'ed' }, extenso(ini.entrada))] : null),
          h('p', { className: 'factos-links' },
            h('a', { href: ini.link, target: '_blank', rel: 'noopener' }, 'Assembleia da República ↗'),
            ini.texto ? [h('br', { key: 'b' }), h('a', { key: 't', href: ini.texto, target: '_blank', rel: 'noopener' }, 'Texto da iniciativa ↗')] : null))),
      h('section', { className: 'secao', 'aria-labelledby': 'ev' },
        h('h2', { id: 'ev' }, 'Todas as fases'),
        h('ol', { className: 'fases' }, ini.eventos.map(function (e, i) { return h('li', { key: i }, h('span', { className: 'fase-data' }, curta(e[0])), h('span', null, e[1])); }))));
  }
  // The pending bills that name this article, or every pending bill on the diploma (artigo null).
  function pendentesDe(pd, slug, artigo) {
    return ((pd && pd.por_diploma[slug]) || []).map(function (k) { return pd.iniciativas[k]; }).filter(function (i) {
      var x = i.diplomas[slug];
      return !artigo || x.artigos.indexOf(artigo) >= 0 || x.novos.indexOf(artigo) >= 0;
    });
  }
  function NoParlamento(props) {
    var H = props.nivel || 'h2', n = props.lista.length;
    return h('section', { className: props.secao ? 'secao no-parl' : 'no-parl', 'aria-labelledby': props.id },
      h(H, { id: props.id, className: props.nivel || props.secao ? null : 'h2' }, 'No Parlamento'),
      h('p', { className: 'muted small' }, n === 1 ? 'Uma iniciativa em curso propõe alterar este artigo. Ainda não é lei.' : n + ' iniciativas em curso propõem alterar este artigo. Ainda não são lei.'),
      h('ul', { className: 'parl-lista' }, props.lista.map(function (i) {
        return h('li', { key: i.id },
          h('p', { className: 'parl-nome' }, h(R.StatusPill, { status: 'pendente' }, 'Em curso'), ' ', h('a', { href: link(['iniciativa', i.id]) }, i.designacao)),
          h('p', { className: 'parl-fase' }, i.fase_texto + ' ' + desdeFase(i)));
      })));
  }
  function desdeFase(i) { return i.fase_data ? '(' + curta(i.fase_data) + ')' : ''; }
  // "os artigos 170.º, 178.º e 193.º" from article ids, with links to the ones we have.
  function artigosLista(slug, ids, comLink) {
    return ids.map(function (a, k) {
      var r = a.replace(/^artigo-/, '').replace(/^(\d+)(?:-([a-z]+))?$/, function (m, n, l) { return n + '.º' + (l ? '-' + l.toUpperCase() : ''); });
      return [k ? (k === ids.length - 1 ? ' e ' : ', ') : '', comLink ? h('a', { key: a, href: link(['d', slug, a]) }, r) : r];
    });
  }

  // ---- Votação na generalidade -------------------------------------------------------------------
  function lista(xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]; }
  function quemPropos(ini) {
    var a = ini.autores || {};
    if (a.tipo === 'governo') return 'O Governo';
    if (a.tipo === 'regiao') return 'A ' + a.nome;
    if (a.tipo === 'cidadaos') return 'Um grupo de cidadãos';
    if (a.tipo === 'comissao') return 'Uma comissão parlamentar';
    if (a.tipo === 'mesa') return a.nome.charAt(0).toUpperCase() + a.nome.slice(1);
    if (a.tipo === 'grupos' && a.grupos && a.grupos.length) return (a.grupos.length === 1 ? 'O grupo parlamentar do ' : 'Os grupos parlamentares do ') + lista(a.grupos);
    var gs = gruposDe(ini).filter(function (g) { return !SEM_GRUPO[g]; });
    // Deputies outside any group are named: "Cristina Rodrigues (sem grupo parlamentar)".
    var sem = (a.deputados || []).filter(function (d) { return SEM_GRUPO[d.grupo]; }).map(function (d) { return d.nome; });
    var nomes = sem.length ? lista(sem) + ' (sem grupo parlamentar)' : '';
    if (!gs.length) return nomes || 'Deputados';
    return 'Deputados do ' + lista(gs) + (nomes ? ' e ' + nomes : '');
  }
  var SEM_GRUPO = { Ninsc: 1, NiCR: 1, Indep: 1 };
  // "do Governo", "de deputados do BE": the proposer after a designation.
  function dePropos(ini) {
    var q = quemPropos(ini);
    return /^(O|A|Os|Um|Deputados) /.test(q) || q === 'Deputados' ? q.replace(/^O /, 'do ').replace(/^A /, 'da ').replace(/^Os /, 'dos ').replace(/^Deputados/, 'de deputados').replace(/^Um /, 'de um ') : 'de ' + q;
  }
  // The groups that proposed an initiative, to mark them in the table.
  function gruposDe(ini) {
    var a = ini.autores || {}, gs = (a.grupos || []).slice();
    (a.deputados || []).forEach(function (d) { if (d.grupo && !SEM_GRUPO[d.grupo] && gs.indexOf(d.grupo) < 0) gs.push(d.grupo); });
    return gs;
  }
  function plural(sujeito) { return /^(Os |Deputados)| e [A-ZÁÉÍÓÚ]/.test(sujeito) ? 'apresentaram' : 'apresentou'; }
  // "a Proposta de Lei", "o Projeto de Lei": the article, the object pronoun and the participle.
  function genero(designacao) { return /^Proposta/.test(designacao) ? { o: 'a', lo: '-a', ado: 'Aprovada', ejeitado: 'Rejeitada' } : { o: 'o', lo: '-o', ado: 'Aprovado', ejeitado: 'Rejeitado' }; }
  function principalDe(p) { return p.iniciativas.filter(function (i) { return i.principal; })[0] || p.iniciativas[0]; }
  function ordemDe(p, votos) {
    var out = p.ordem_grupos.slice();
    votos.forEach(function (v) { Object.keys(v.grupos).concat(v.ausentes || []).forEach(function (g) { if (out.indexOf(g) < 0) out.push(g); }); });
    return out.filter(function (g) { return votos.some(function (v) { return v.grupos[g] || (v.ausentes || []).indexOf(g) >= 0; }); });
  }
  // The generalidade votes of an act (passagem.generalidade, §2.7): the committee text the act
  // came from, or each initiative's own vote. Never "the last committee text" (R-1).
  function itensGeneralidade(p) {
    if (!p) return [];
    if (p.generalidade) return p.generalidade.map(function (g) {
      if (g.origem === 'texto_comissao') { var v = (p.texto_comissao || [])[g.indice]; return v ? { voto: v, titulo: tituloTexto(v), comissao: true } : null; }
      var i = p.iniciativas.filter(function (x) { return x.id === g.id; })[0];
      return i && i.generalidade ? { voto: i.generalidade, titulo: i.designacao, ini: i } : null;
    }).filter(Boolean);
    // Data from before passagem.generalidade: every committee text and every initiative's own vote.
    return (p.texto_comissao || []).map(function (v) { return { voto: v, titulo: tituloTexto(v), comissao: true }; })
      .concat(p.iniciativas.filter(function (i) { return i.generalidade; }).map(function (i) { return { voto: i.generalidade, titulo: i.designacao, ini: i }; }));
  }
  function tituloTexto(v) { return /texto final/i.test(v.descricao || '') ? 'Texto final da comissão' : 'Texto de substituição da comissão'; }
  function desIni(p, id) { var i = p.iniciativas.filter(function (x) { return x.id === id; })[0]; return i ? i.designacao : id; }
  function sentidos(v, ordem) {
    var out = '';
    [['favor', 'A favor'], ['contra', 'Contra'], ['abstencao', 'Abstenção']].forEach(function (x) {
      var gs = ordem.filter(function (g) { return v.grupos[g] === x[0]; });
      if (gs.length) out += ' ' + x[1] + ': ' + gs.join(', ') + '.';
    });
    return out;
  }
  // The lede of the vote section: one fact per sentence, pretérito perfeito, active voice. With
  // several initiatives, no initiative is singled out (R-6).
  function ledeGeneralidade(p, q) {
    var itens = itensGeneralidade(p), com = itens.filter(function (x) { return x.comissao; }), inis = itens.filter(function (x) { return x.ini; });
    var n = p.iniciativas.length, out = [];
    var aprovou = function (v, lo) { return 'O Parlamento ' + (v.resultado === 'Rejeitado' ? 'rejeitou' : 'aprovou') + lo + ' na generalidade a ' + extenso(v.data) + (v.unanime ? ', por unanimidade.' : '.'); };
    if (p.iniciativas.some(function (i) { return /^Projeto de Revisão/.test(i.designacao); })) {
      var gs = [];
      p.iniciativas.forEach(function (i) { gruposDe(i).forEach(function (g) { if (gs.indexOf(g) < 0) gs.push(g); }); });
      gs = p.ordem_grupos.filter(function (g) { return gs.indexOf(g) >= 0; }).concat(gs.filter(function (g) { return p.ordem_grupos.indexOf(g) < 0; }));
      out.push('Deputados ' + (gs.length ? 'do ' + lista(gs) + ' ' : '') + 'apresentaram ' + n + (n === 1 ? ' projeto de revisão constitucional.' : ' projetos de revisão constitucional.'));
      out.push(itens.length ? (com.length ? aprovou(com[0].voto, '-o') : 'O Parlamento votou cada projeto na generalidade.') : 'Não temos votações destes projetos na generalidade.');
    } else if (com.length) {
      var k = (q && q.texto_comissao && q.texto_comissao.n_iniciativas) || (com[0].voto.citadas || []).length || n;
      out.push(k === 1 ? 'Uma comissão do Parlamento escreveu o texto final a partir de uma iniciativa.' : 'Uma comissão do Parlamento juntou ' + k + ' iniciativas num só texto.');
      out.push(aprovou(com[0].voto, '-o'));
      if (inis.length) out.push(inis.length === n ? 'Antes, o Parlamento votou cada iniciativa na generalidade.' : 'Antes, o Parlamento votou ' + (inis.length === 1 ? 'uma destas iniciativas' : inis.length + ' destas iniciativas') + ' na generalidade.');
    } else if (inis.length === 1 && n === 1) {
      var i = inis[0].ini, qp = quemPropos(i), gn = genero(i.designacao);
      out.push(qp + ' ' + plural(qp) + ' ' + gn.o + ' ' + i.designacao + '.');
      out.push(aprovou(i.generalidade, gn.lo));
    } else if (inis.length) {
      var dias = inis.map(function (x) { return x.voto.data; }).filter(function (x, j, a) { return a.indexOf(x) === j; });
      out.push((inis.length === n ? 'O Parlamento votou cada uma das ' + n + ' iniciativas' : 'O Parlamento votou ' + inis.length + ' das ' + n + ' iniciativas') + ' na generalidade' + (dias.length === 1 ? ' a ' + extenso(dias[0]) + '.' : '.'));
    } else {
      var c = q && q.motivos && q.motivos.generalidade;
      return c && MOTIVOS[c] ? motivo(c) : [MOTIVOS.sem_generalidade];
    }
    return [out.join(' ')];
  }
  function Voto(props) {
    var v = props.v;
    return h(R.Votacao, { grupos: v.grupos, ordem: props.ordem, contagens: v.contagens, dissidencia: v.dissidencia, foraDeGrupo: v.fora_de_grupo, nomes: props.nomes,
      ausentes: v.ausentes, semRegisto: v.sem_registo, unanime: v.unanime, resultado: v.resultado, verificacao: v.verificacao, mostrarConta: props.conta !== false });
  }
  // One vote with its heading: what was voted, the date and the result.
  function BlocoVoto(props) {
    var v = props.v, gn = genero(props.designacao || 'Texto');
    var res = v.resultado === 'Aprovado' ? gn.ado : v.resultado === 'Rejeitado' ? gn.ejeitado : v.resultado;
    return h('div', { className: 'voto' },
      h('div', { className: 'voto-cabeca' },
        h('p', { className: 'voto-nome' }, props.titulo),
        h('p', { className: 'voto-data' }, extenso(v.data))),
      props.sub ? h('p', { className: 'voto-sub' }, props.sub) : null,
      res && !v.unanime ? h('p', { className: 'voto-res' }, res) : null,
      h(Voto, { v: v, ordem: props.ordem, nomes: props.nomes, conta: props.conta }));
  }
  var CELULA = { favor: 'A favor', contra: 'Contra', abstencao: 'Abstenção' };
  // Several initiatives: one row each, one column per group, so the reader can compare.
  function TabelaIniciativas(props) {
    var p = props.p, inis = p.iniciativas, nomes = props.nomes || {};
    var votos = inis.filter(function (i) { return i.generalidade; }).map(function (i) { return i.generalidade; });
    var ordem = ordemDe(p, votos);
    // Deputies outside any group, counted per sentido: "2 a favor".
    var semGrupo = votos.some(function (v) { return (v.fora_de_grupo || []).length; });
    var contaSem = function (v) {
      var c = {};
      (v.fora_de_grupo || []).forEach(function (x) { c[x.sentido] = (c[x.sentido] || 0) + 1; });
      return Object.keys(c).map(function (k) { return c[k] + ' ' + CELULA[k].toLowerCase(); }).join(', ') || '—';
    };
    // On a phone the table would show one group at a time: each initiative gets its own list instead.
    var estreito = h('div', { className: 'so-estreito-b' },
      h('h3', { className: 'tabela-titulo' }, props.titulo),
      h('ol', { className: 'inis-votos' }, inis.map(function (i) {
        var v = i.generalidade;
        return h('li', { key: i.id },
          h('p', { className: 'iv-nome' }, h('a', { href: link(['iniciativa', i.id]) }, i.designacao)),
          h('p', { className: 'tv-quem' }, quemPropos(i) + (v ? ' · ' + (v.resultado || '') + ' a ' + curta(v.data) : '')),
          v ? h(Voto, { v: v, ordem: ordem, conta: false, nomes: nomes }) : h('p', { className: 'muted small' }, i.baixa_sem_votacao ? 'Baixou à comissão sem votação na generalidade.' : 'Não temos o registo da votação.'));
      })));
    return h(React.Fragment, null, estreito, h('div', { className: 'tabela-caixa so-largo-b', tabIndex: 0, role: 'region', 'aria-labelledby': 'tab-ini' },
      h('table', { className: 'tabela-votos' },
        h('caption', { id: 'tab-ini' }, props.titulo),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Iniciativa'), h('th', { scope: 'col' }, 'Resultado'),
          ordem.map(function (g) { return h('th', { key: g, scope: 'col', className: 'tv-g' }, h(Sigla, { sigla: g, nome: nomes[g] })); }),
          semGrupo ? h('th', { scope: 'col', className: 'tv-g' }, 'Sem grupo') : null)),
        h('tbody', null, inis.map(function (i) {
          var v = i.generalidade, meus = gruposDe(i);
          return h('tr', { key: i.id },
            h('th', { scope: 'row' }, h('a', { href: link(['iniciativa', i.id]) }, i.designacao), h('span', { className: 'tv-quem' }, quemPropos(i))),
            v ? h('td', { className: 'tv-res' }, v.resultado || '—', h('span', { className: 'tv-quem' }, curta(v.data))) : null,
            v ? ordem.map(function (g) {
              var s = v.unanime ? 'favor' : v.grupos[g], fora = (v.dissidencia || []).filter(function (d) { return d.grupo === g; });
              var txt = s ? CELULA[s] : (v.ausentes || []).indexOf(g) >= 0 ? 'Ausente' : '—';
              return h('td', { key: g, className: 'tv-g' + (meus.indexOf(g) >= 0 ? ' tv-autor' : '') + (s ? '' : ' muted') }, txt,
                fora.length ? h('span', { className: 'tv-quem' }, fora.map(function (d) { return (d.n || 1) + ' ' + CELULA[d.sentido].toLowerCase(); }).join(', ')) : null);
            }).concat(semGrupo ? [h('td', { key: 'sg', className: 'tv-g' }, contaSem(v))] : []) : h('td', { colSpan: ordem.length + 1 + (semGrupo ? 1 : 0), className: 'muted' }, i.baixa_sem_votacao ? 'Baixou à comissão sem votação na generalidade.' : 'Não temos o registo da votação.'));
        }))),
      h('p', { className: 'tabela-nota' }, 'A negrito: o grupo que apresentou a iniciativa.')));
  }
  // R-34: what «Ausente» and «Sem registo» mean, under the votes that use them.
  function NotasVoto(props) {
    var vs = props.votos;
    var aus = vs.some(function (v) { return (v.ausentes || []).length; }), sem = vs.some(function (v) { return !v.unanime && (v.sem_registo || []).length; });
    return h(React.Fragment, null,
      aus ? h('p', { className: 'fonte' }, 'Ausente: o grupo não estava na votação, segundo o registo da Assembleia da República.') : null,
      sem ? h('p', { className: 'fonte' }, 'Sem registo do voto: os dados da Assembleia da República não indicam o voto deste grupo.') : null);
  }
  // The generalidade votes of one act, as blocks (the act page and the stories).
  function VotosAto(props) {
    var p = props.p, q = props.quem || {}, ref = props.dados, itens = itensGeneralidade(p);
    var com = itens.filter(function (x) { return x.comissao; }), inis = itens.filter(function (x) { return x.ini; });
    // Siglas are those of the vote's legislatura (R-5): each vote carries it.
    var nomesV = function (v) { return nomesDe(ref, v.legislatura || p.legislatura); };
    var nomes = nomesV(itens[0] ? itens[0].voto : {}), n = p.iniciativas.length, tc = q.texto_comissao;
    var junta = tc && tc.iniciativas ? tc.iniciativas.map(function (i) { return (i.parte ? i.parte + ' ' + daDe(i.designacao) + ' ' : '') + i.designacao; }) : null;
    return h(React.Fragment, null,
      com.map(function (x, k) {
        return h(BlocoVoto, { key: 'c' + k, v: x.voto, ordem: ordemDe(p, [x.voto]), nomes: nomesV(x.voto), titulo: x.titulo, conta: props.conta,
          sub: 'Junta ' + lista(junta || (x.voto.citadas || []).map(function (id) { return desIni(p, id); })) + '.' });
      }),
      !com.length && n === 1 && inis.length === 1 ? h(BlocoVoto, { v: inis[0].voto, ordem: ordemDe(p, [inis[0].voto]), nomes: nomes, titulo: inis[0].titulo, designacao: inis[0].titulo, conta: props.conta,
        sub: h('span', { 'data-citacao': '' }, inis[0].ini.titulo) }) : null,
      n > 1 && inis.length ? h(TabelaIniciativas, { p: p, nomes: nomes, titulo: com.length ? 'Votação de cada iniciativa, antes do texto da comissão' : 'Votação de cada iniciativa' }) : null,
      n > 1 && !inis.length && !com.length ? h('ul', { className: 'inis' }, p.iniciativas.map(function (i) {
        return h('li', { key: i.id }, h('a', { href: link(['iniciativa', i.id]) }, i.designacao), ', ' + dePropos(i) + (i.baixa_sem_votacao ? '. Baixou à comissão sem votação.' : '.'));
      })) : null,
      h(NotasVoto, { votos: itens.map(function (x) { return x.voto; }) }));
  }
  function Generalidade(props) {
    var p = props.p, q = props.quem || {};
    var frases = marcarFrases([linhaVfg(q.vfg, (q.motivos || {}).vfg), ledeGeneralidade(p, q)], 'voto');
    return h('section', { className: 'secao geral', id: 'generalidade', 'aria-labelledby': 'geral-h' },
      h('h2', { id: 'geral-h' }, 'Primeira votação: na generalidade'),
      q.provisorio ? null : h('p', { className: 'lede' }, render(frases[0])),
      h('p', { className: 'lede' }, render(frases[1])),
      h(VotosAto, { p: p, quem: q, dados: props.dados }),
      h('p', { className: 'fonte' }, 'Ordem dos grupos: a da Assembleia da República nessa legislatura. Fonte: Assembleia da República, dados abertos.'));
  }

  // ---- Act (the "commit") -----------------------------------------------------------------------
  // How we know each fact of the «Quem fez» block: the sources, with links.
  function comoSabemos(quem, p, a, ref) {
    var out = [], ini = (quem.proponentes || []).map(function (x) { return { id: x.iniciativa, designacao: x.designacao }; });
    if (!ini.length && p) ini = p.iniciativas.map(function (i) { return { id: i.id, designacao: i.designacao }; });
    if (a.link) out.push([lig(a.link, 'Texto ' + daDe(a.designacao) + ' ' + a.designacao + ' no Diário da República ↗'),
      quem.assinatura && quem.assinatura.obtido_em ? ' Lemos as assinaturas a ' + extenso(quem.assinatura.obtido_em) + '.' : '']);
    ini.forEach(function (i) { out.push([lig(hrefIni(i.id, null), i.designacao + ' na Assembleia da República ↗')]); });
    var ns = [];
    if (quem.governo && quem.governo.numero != null) ns.push(quem.governo.numero);
    (quem.proponentes || []).forEach(function (x) { if (x.governo != null && ns.indexOf(x.governo) < 0) ns.push(x.governo); });
    var consultado = null;
    ns.forEach(function (n) {
      var g = governoDe(ref, n);
      if (!g) return;
      consultado = consultado || g.consultado_em;
      var f = (g.fontes || {}).inicio;
      out.push(['Tabela de Governos: ', gov(n), '.'].concat(f ? [' ', lig(f, 'Fonte ↗')] : []));
    });
    var pr = quem.presidente && presidenteDe(ref, quem.presidente.id);
    if (pr) out.push(['Tabela de Presidentes da República: ' + pr.nome + '.'].concat(pr.fonte ? [' ', lig(pr.fonte, 'Fonte ↗')] : []));
    consultado = consultado || (ref.index || {}).consultado_em;
    if (consultado) out.push(['Consultámos os dados a ' + extenso(consultado) + '.']);
    out.push([lig('https://github.com/andre15silva/pt-legal-git/issues/new?title=' + encodeURIComponent('Erro: ' + a.designacao), 'Reportar um erro ↗')]);
    return out;
  }
  function Ato(props) {
    var r = useData(['atos.json', 'index.json', 'passagem.json', '?quem.json', '?governos.json']);
    var sum = useState(false);
    if (!r.data) return h(Loading, { error: r.error });
    var atos = r.data[0], index = r.data[1], ps = r.data[2], a = atos[props.id];
    // An old id of an act (a merged id the pipeline split, a heading prefix) opens the act it became.
    var alias = (index.aliases_atos || {})[props.id];
    if (!a && alias && atos[alias]) { setTimeout(function () { substituir(link(['ato', alias], props.q)); }, 0); return h(Loading, {}); }
    if (!a) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos este ato.'));
    var ref = { atos: atos, index: index, passagem: ps, quem: r.data[3] || {}, governos: r.data[4] };
    var rg = registo(ref, a.id), quem = rg.quem, p = rg.p, tipo = quem.tipo_ato || tipoDe(a.designacao);
    var nomes = {};
    index.diplomas.forEach(function (d) { nomes[d.slug] = d; });
    var by = {};
    a.alteracoes.forEach(function (c) { (by[c.diploma] = by[c.diploma] || []).push(c); });
    document.title = tituloDe(['ato', a.id], { atos: atos });
    var frases = marcarFrases(frasesQuem(quem, p, a, ref), 'quem');
    var aviso = avisoTransitorias(quem, a);
    var inis = (quem.proponentes || []).length ? quem.proponentes.map(function (x) { return { id: x.iniciativa, designacao: x.designacao }; }) : p ? p.iniciativas : [];
    // The changes as an amending law writes them: "Alterou os artigos 14.º, 15.º e 15.º-A."
    var VERBO = { alterado: 'Alterou', aditado: 'Aditou', revogado: 'Revogou', retificado: 'Retificou', sem_alteracao: 'Abrangeu, sem mudar o texto,' };
    var longo = a.sumario && a.sumario.length > 150;
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], [a.designacao]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, a.designacao + (a.publicacao ? ', de ' + semAno(a.publicacao) : '')),
        a.sumario ? h('div', { className: 'sumario' + (longo && !sum[0] ? ' is-curto' : '') },
          h('p', { className: 'lead', 'data-citacao': '' }, a.sumario),
          longo && !sum[0] ? h('button', { type: 'button', className: 'rd-btn sumario-mais', onClick: function () { sum[1](true); } }, 'Ler o sumário completo') : null) : null,
        LEIS[tipo] || tipo === 'decreto-lei' || tipo === 'outro' ? h(Guia, { tipo: 'ato', texto: tipo === 'decreto-lei' ? 'ato-dl' : 'ato-lei' }) : null),
      h('div', { className: 'duas' },
        h('section', { className: 'secao secao-1 quem-fez', id: 'quem', 'aria-labelledby': 'quem-h' },
          h('h2', { id: 'quem-h' }, tituloQuem(tipo)),
          h('div', { className: 'quem-frases' }, h(Frases, { frases: frases })),
          aviso ? h(Frases, { frases: [aviso] }) : null,
          h('details', { className: 'dobra como-sabemos' }, h('summary', null, 'Como sabemos isto'),
            h('ul', { className: 'como-lista' }, comoSabemos(quem, p, a, ref).map(function (f, k) { return h('li', { key: k }, render(f)); })))),
        h('aside', { className: 'factos', 'aria-label': 'Fontes' },
          a.dr ? h('p', { className: 'factos-dr' }, 'Diário da República n.º ' + a.dr) : null,
          inis.length ? h('dl', null,
            h('dt', null, inis.length === 1 ? 'Iniciativa' : 'Iniciativas'),
            h('dd', null, inis.slice(0, 3).map(function (i) { return h('a', { key: i.id, className: 'factos-linha', href: hrefIni(i.id, p) }, i.designacao + (externo(hrefIni(i.id, p)) ? ' ↗' : '')); })
              .concat(inis.length > 3 ? [h('span', { key: 'mais', className: 'factos-sub' }, 'e mais ' + (inis.length - 3))] : []))) : null,
          h('p', { className: 'factos-links' },
            a.link ? h('a', { href: a.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗') : null))),
      a.alteracoes.length ? h('section', { className: 'secao secao-mudou', 'aria-labelledby': 'alterou' },
        h('h2', { id: 'alterou' }, 'O que este ato mudou'),
        Object.keys(by).map(function (slug) {
          var porTipo = {};
          by[slug].forEach(function (c) { (porTipo[c.tipo] = porTipo[c.tipo] || []).push(c); });
          return h('div', { key: slug, className: 'mudou' },
            h('p', { className: 'mudou-diploma' }, nomes[slug] ? nomes[slug].titulo : slug),
            ['alterado', 'aditado', 'revogado', 'retificado', 'sem_alteracao'].concat(Object.keys(porTipo)).filter(function (t, i, all) { return porTipo[t] && all.indexOf(t) === i; }).map(function (t) {
              var cs = porTipo[t];
              return h('p', { key: t, className: 'mudou-frase' }, (VERBO[t] || t) + (cs.length === 1 ? ' o ' : ' os ') + (cs.length === 1 ? 'artigo ' : 'artigos '),
                cs.map(function (c, i) {
                  return h(React.Fragment, { key: i }, i ? (i === cs.length - 1 ? ' e ' : ', ') : '',
                    // An article the act left as it was has no redação of this act: open it at that date.
                    h('a', { href: t === 'sem_alteracao' ? link(['d', slug, c.artigo], { em: c.vigor || a.publicacao }) : link(['d', slug, c.artigo], { redacao: a.id, ver: t === 'alterado' ? 'mudou' : null, ato: a.id }) }, c.rotulo.replace(/^Artigo\s*/, '')));
                }), '.');
            }));
        })) : null,
      p ? h(Generalidade, { p: p, quem: quem, dados: ref }) : null);
  }

  // ---- Initiative (the "pull request") ---------------------------------------------------------
  function Iniciativa(props) {
    var r = useData(['iniciativas.json', 'atos.json', 'passagem.json', 'pendentes.json', 'index.json', '?quem.json', '?governos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var ini = r.data[0][props.id], atos = r.data[1], ps = r.data[2];
    var ref = { atos: atos, passagem: ps, index: r.data[4], quem: r.data[5] || {}, governos: r.data[6] };
    if (!ini && r.data[3].iniciativas[props.id]) return h(IniciativaPendente, { ini: r.data[3].iniciativas[props.id], diplomas: r.data[4].diplomas });
    if (!ini) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos esta iniciativa.'));
    var p = ps[ini.ato], ato = atos[ini.ato], nome = ini.tipo + ' n.º ' + ini.numero + '/' + ini.legislatura;
    var esta = p ? p.iniciativas.filter(function (i) { return i.id === props.id; })[0] : null;
    // The committee texts of this act that include this initiative (the act's own, R-1).
    var textos = p ? itensGeneralidade(p).filter(function (x) { return x.comissao && (x.voto.citadas || []).indexOf(props.id) >= 0; }) : [];
    var q = p ? registo(ref, ini.ato).quem : null, nomes = p ? nomesDe(ref, p.legislatura) : {};
    document.title = nome + ' · Redação';
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], [nome]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, nome),
        h('p', { className: 'lead', 'data-citacao': '' }, ini.titulo),
        h(Guia, { tipo: 'iniciativa' })),
      h('div', { className: 'duas' },
        h('section', { className: 'secao secao-1', 'aria-labelledby': 'geral-h' },
          h('h2', { id: 'geral-h' }, 'Primeira votação: na generalidade'),
          q && !q.provisorio ? h('p', { className: 'lede' }, render(marcarFrases([linhaVfg(q.vfg, (q.motivos || {}).vfg)], 'voto')[0])) : null,
          esta && esta.generalidade ? h(BlocoVoto, { v: esta.generalidade, ordem: ordemDe(p, [esta.generalidade]), titulo: nome, designacao: nome, nomes: nomes })
            : h('p', { className: 'lede' }, esta && esta.baixa_sem_votacao ? 'Esta iniciativa baixou à comissão sem votação na generalidade.' : 'Não temos o registo da votação desta iniciativa na generalidade.'),
          textos.map(function (x, k) { return h(BlocoVoto, { key: k, v: x.voto, ordem: ordemDe(p, [x.voto]), nomes: nomes, titulo: x.titulo, sub: 'Inclui esta iniciativa.' }); }),
          h(NotasVoto, { votos: (esta && esta.generalidade ? [esta.generalidade] : []).concat(textos.map(function (x) { return x.voto; })) })),
        h('aside', { className: 'factos', 'aria-label': 'Autores e fontes' },
          h('dl', null,
            esta ? [h('dt', { key: 'qt' }, 'Apresentada por'), h('dd', { key: 'qd' }, quemPropos(esta))] : null,
            h('dt', null, 'Publicada como'), h('dd', null, ato ? h('a', { href: link(['ato', ini.ato]) }, ato.designacao) : ini.ato),
            ini.conjuntas && ini.conjuntas.length ? [h('dt', { key: 'ct' }, 'Discutida com'), h('dd', { key: 'cd' }, ini.conjuntas.join(', '))] : null),
          h('p', { className: 'factos-links' }, h('a', { href: ini.link, target: '_blank', rel: 'noopener' }, 'Assembleia da República ↗')))),
      h('section', { className: 'secao', 'aria-labelledby': 'ev' },
        h('h2', { id: 'ev' }, 'Todas as fases'),
        h('ol', { className: 'fases' }, ini.eventos.map(function (e, i) { return h('li', { key: i }, h('span', { className: 'fase-data' }, curta(e[0])), h('span', null, e[1])); }))));
  }

  // ---- Who made each change: the timeline of a diploma (#/quem/<slug>) -------------------------------
  // Every act that changed the diploma, by Government or by legislatura, in date order. Empty
  // periods stay, in two lines. No counts by actor, no colours, no bars (R-53).
  var LISTAS = {
    governo: [['decretos_leis', 'Decretos-leis deste Governo'], ['propostas', 'Leis que vêm de propostas deste Governo'],
      ['outras', 'Leis que vêm de iniciativas de deputados ou de textos da comissão'], ['publicados_sem_d_cm', 'Decretos-leis publicados neste período, sem data do Conselho de Ministros']],
    legislatura: [['decretos_leis', 'Decretos-leis'], ['propostas', 'Leis que vêm de propostas do Governo'],
      ['outras', 'Leis que vêm de iniciativas de deputados ou de textos da comissão'], ['publicados_sem_d_cm', 'Decretos-leis publicados nesta legislatura, sem data do Conselho de Ministros']]
  };
  var FORA = [['revisoes', 'Revisões da Constituição'], ['acordaos', 'Acórdãos do Tribunal Constitucional'], ['antes_1976', 'Antes da Constituição de 1976'],
    ['retificacoes_soltas', 'Retificações'], ['outros', 'Outros diplomas']];
  function idAto(x) { return typeof x === 'string' ? x : x.ato; }
  function nomeLeg(sigla) { return sigla === 'Constituinte' ? 'Assembleia Constituinte' : 'Legislatura ' + sigla; }
  // «De 23 de julho de 1976 a 1 de janeiro de 1983.» / «Desde …»
  function deA(inicio, fim) { return fim ? 'De ' + extenso(inicio) + ' a ' + extenso(fim) + '.' : 'Desde ' + extenso(inicio) + '.'; }
  // The legislaturas a Government overlapped.
  function legislaturasDe(g, gj) {
    return ((gj && gj.legislaturas) || []).filter(function (l) { return (!g.fim || l.inicio < g.fim) && (!l.fim || l.fim > g.inicio); }).map(function (l) { return l.sigla; });
  }
  function juntarPartes(ps) {
    var out = [];
    ps.forEach(function (p, k) { if (k) out.push(k === ps.length - 1 ? ' e ' : ', '); out = out.concat(p); });
    return out;
  }
  function LinhaAto(props) {
    var fs = props.frases;
    return h('li', { className: 'linha-ato' },
      props.semNome ? null : h('p', { className: 'linha-ato-nome' }, render(fs[0], props.ctx)),
      h('div', { className: 'linha-ato-mais' }, h(Frases, { frases: fs.slice(1), ctx: props.ctx })));
  }
  function Quem(props) {
    var slug = props.slug, por = props.q.por === 'legislatura' ? 'legislatura' : 'governo';
    var r = useData(['quem/' + slug + '.json', 'd/' + slug + '.json', 'atos.json', 'passagem.json', 'quem.json', 'governos.json', 'index.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var t = r.data[0], d = r.data[1], gj = r.data[5];
    var ref = { atos: r.data[2], passagem: r.data[3], quem: r.data[4], governos: gj, index: r.data[6] };
    document.title = tituloDe(['quem', slug], { index: ref.index });
    var legs = {};
    (gj.legislaturas || []).forEach(function (l) { legs[l.sigla] = l; });
    var linhas = function (lista, k, governo) {
      return lista.map(function (x) {
        var id = idAto(x);
        var fs = marcarFrases(linhaAto(id, ref, { slug: slug, governoPeriodo: governo, semDcm: k === 'publicados_sem_d_cm', retificacoes: (t.retificacoes || {})[id] }), 'periodo');
        return h(LinhaAto, { key: id, frases: fs });
      });
    };
    var periodo = function (row) {
      var g = por === 'governo' ? governoDe(ref, row.governo) : null, l = por === 'legislatura' ? legs[row.legislatura] || { sigla: row.legislatura } : null;
      var id = g ? 'governo-' + row.governo : 'legislatura-' + row.legislatura;
      var cab = g ? [gov(row.governo)] : [nomeLeg(row.legislatura)];
      var quando = g ? deA(g.inicio, g.fim) : l.inicio ? deA(l.inicio, l.fim) : '';
      if (!row.total) return h('section', { key: id, className: 'periodo periodo-vazio', 'aria-labelledby': id },
        h('h2', { id: id, className: 'periodo-h', tabIndex: -1 }, render(cab), quando ? ' · ' + quando.replace(/\.$/, '') + '.' : ''),
        h('p', { className: 'muted' }, 'Nenhuma alteração neste período.'));
      var meta = [];
      if (g) {
        if (g.primeiro_ministro) meta.push(['Primeiro-Ministro: ' + g.primeiro_ministro]);
        var pt = frasePartidos(g, ref, legislaturasDe(g, gj).slice(-1)[0]);
        if (pt) meta.push(pt.map(function (x) { return typeof x === 'string' ? x.replace(/\.$/, '') : x; }));
      }
      var ls = g ? legislaturasDe(g, gj) : [];
      var sub = g ? quando + (ls.length ? ' ' + (ls.length === 1 ? 'Legislatura ' : 'Legislaturas ') + lista(ls.map(function (x) { return x === 'Constituinte' ? 'Assembleia Constituinte' : x; })) + '.' : '')
        : null;
      return h('section', { key: id, className: 'periodo', 'aria-labelledby': id },
        h('h2', { id: id, className: 'periodo-h', tabIndex: -1 }, render(cab)),
        meta.length ? h('p', { className: 'periodo-meta' }, render(meta.reduce(function (a, m, k) { return a.concat(k ? [' · '] : []).concat(m); }, []))) : null,
        g ? h('p', { className: 'periodo-datas' }, sub)
          : h('p', { className: 'periodo-datas' }, quando, (row.governos || []).length ? render([' Governos: '].concat(juntarPartes(row.governos.map(function (n) { return [gov(n)]; }))).concat(['.'])) : null),
        h('p', { className: 'periodo-total' }, row.total === 1 ? '1 ato neste período.' : row.total + ' atos neste período.'),
        LISTAS[por].map(function (x) {
          var lista0 = (row.listas || {})[x[0]] || [];
          if (!lista0.length) return null;
          return h('div', { key: x[0], className: 'sublista' }, h('h3', { className: 'sublista-h' }, x[1]), h('ul', { className: 'linhas-ato' }, linhas(lista0, x[0], g ? row.governo : null)));
        }));
    };
    var fora = t.fora || {};
    return h('div', { className: 'pagina-ato pagina-quem' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], [d.sigla || d.titulo, link(['d', slug])], ['Quem fez cada alteração']] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'Quem fez cada alteração'),
        h('p', { className: 'subtitulo' }, d.titulo),
        h('p', { className: 'lead' }, 'Todos os atos que alteraram este diploma desde ' + extenso(t.desde) + ', do mais antigo para o mais recente.'),
        h(Guia, { tipo: 'quem' })),
      h('div', { className: 'quem-abas' }, h(Abas, { items: [['governo', 'Por Governo'], ['legislatura', 'Por legislatura']], value: por,
        onChange: function (v) { substituir(link(['quem', slug], { por: v === 'legislatura' ? 'legislatura' : null })); } })),
      h('div', { className: 'periodos' }, (por === 'governo' ? t.por_governo : t.por_legislatura).map(periodo)),
      FORA.map(function (x) {
        var l = fora[x[0]] || [];
        if (!l.length) return null;
        return h('section', { key: x[0], className: 'periodo', 'aria-labelledby': 'fora-' + x[0] },
          h('h2', { id: 'fora-' + x[0], className: 'periodo-h', tabIndex: -1 }, x[1]),
          h('ul', { className: 'linhas-ato' }, linhas(l, x[0], null)));
      }));
  }

  // ---- Parliamentary groups (#/grupos, #/grupo/<id>) ----------------------------------------------
  // «II e III», «VIII a XVII», «I a III, V»: runs of consecutive legislaturas, in the AR's order.
  function faixasLegislaturas(ls, ordem) {
    var pos = ls.map(function (x) { return ordem.indexOf(x); }).filter(function (i) { return i >= 0; }).sort(function (a, b) { return a - b; });
    var runs = [];
    pos.forEach(function (i) { var r = runs[runs.length - 1]; if (r && r[1] === i - 1) r[1] = i; else runs.push([i, i]); });
    return runs.map(function (r) { return r[0] === r[1] ? ordem[r[0]] : r[1] === r[0] + 1 ? ordem[r[0]] + ' e ' + ordem[r[1]] : ordem[r[0]] + ' a ' + ordem[r[1]]; }).join(', ');
  }
  function legislaturasTexto(ls, ordem, minuscula) { return (minuscula ? 'l' : 'L') + (ls.length === 1 ? 'egislatura ' : 'egislaturas ') + faixasLegislaturas(ls, ordem); }
  function ordemLegs(gj) { return ((gj && gj.legislaturas) || []).map(function (l) { return l.sigla; }); }
  function Grupos() {
    var r = useData(['grupos/index.json', 'governos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    document.title = tituloDe(['grupos']);
    var ordem = ordemLegs(r.data[1]);
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], ['Grupos parlamentares']] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'Grupos parlamentares'),
        h('p', { className: 'lead' }, 'Os grupos parlamentares que votaram alterações aos diplomas deste site. Por ordem alfabética.')),
      h('ul', { className: 'list grupos-lista' }, r.data[0].map(function (g) {
        return h('li', { key: g.id },
          h('a', { className: 'grupo-nome', href: link(['grupo', g.id]) }, g.nome + ' (' + g.siglas.join(', ') + ')'),
          h('p', { className: 'muted' }, legislaturasTexto(g.legislaturas, ordem) + '.'));
      })));
  }
  var SENTIDO = { favor: 'a favor', contra: 'contra', abstencao: 'abstenção', ausente: 'ausente', sem_registo: 'sem registo do voto' };
  function Grupo(props) {
    var r = useData(['grupos/' + props.id + '.json', 'atos.json', 'quem.json', 'index.json', 'governos.json', 'passagem.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var g = r.data[0], atos = r.data[1], ref = { atos: atos, quem: r.data[2], index: r.data[3], governos: r.data[4], passagem: r.data[5] };
    var ordem = ordemLegs(ref.governos), ultimo = g.nomes[g.nomes.length - 1];
    var nome = ultimo.nome + ' (' + ultimo.sigla + ')';
    document.title = tituloDe(['grupo', g.id], { grupo: { nome: nome } });
    var dips = {};
    ref.index.diplomas.forEach(function (d) { dips[d.slug] = d; });
    var escolhas = Object.keys(g.votos || {}).filter(function (k) { return g.votos[k].length; })
      .sort(function (a, b) { return fold((dips[a] || { titulo: a }).titulo) < fold((dips[b] || { titulo: b }).titulo) ? -1 : 1; });
    var dip = props.q.diploma && (g.votos || {})[props.q.diploma] ? props.q.diploma : props.q.diploma || '';
    var vfg = function (id) { var q = registo(ref, id).quem; return q.provisorio ? null : linhaVfg(q.vfg, (q.motivos || {}).vfg); };
    var termos = termosPara(glossarioAtual, TERMOS.periodo), vistos = new Set();
    return h('div', { className: 'pagina-ato pagina-grupo' },
      h(Crumbs, { items: [['Leis e códigos', '#/'], ['Grupos parlamentares', '#/grupos'], [ultimo.nome]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'Grupo parlamentar: ' + nome),
        h('p', { className: 'lead' }, 'Nomes nos registos do Parlamento: ' + g.nomes.map(function (n) { return n.sigla + ', ' + legislaturasTexto(n.legislaturas, ordem, true) + '.'; }).join(' ')),
        h(Guia, { tipo: 'grupo' })),
      h('aside', { className: 'regra grupo-notas', 'aria-labelledby': 'notas-g' },
        h('p', { id: 'notas-g' }, h('strong', null, 'Notas')),
        h('p', null, ref.index.diplomas.length === 1 ? 'Mostramos só as leis que mudaram o diploma deste site.' : 'Mostramos só as leis que mudaram os ' + ref.index.diplomas.length + ' diplomas deste site.'),
        h('p', null, render(marcarTermos(['Um grupo parlamentar reúne os deputados de um partido no Parlamento. Os partidos de uma coligação podem formar grupos separados.'], vistos, termos))),
        h('p', null, 'Mostramos a primeira votação, na generalidade, e o resultado da votação final global.'),
        h('p', null, 'Um voto contra uma lei não quer dizer que o grupo é contra todo o texto.')),
      h('section', { className: 'secao', 'aria-labelledby': 'g-inis' },
        h('h2', { id: 'g-inis' }, 'Iniciativas deste grupo que deram origem a uma lei deste site'),
        g.iniciativas.length ? h('ul', { className: 'list grupo-inis' }, g.iniciativas.map(function (i, k) {
          var a = atos[i.ato] || { designacao: i.ato }, al = lig(link(['ato', i.ato]), nomeCompleto(a)), il = ligIni(i.iniciativa, i.designacao, ref.passagem[i.ato]);
          var f = i.parte ? ['O ' + i.parte + ' ' + daDe(i.designacao) + ' ', il, ' entrou no texto ' + daDe(a.designacao) + ' ', al, '.']
            : [aDe(i.designacao).toUpperCase() + ' ', il, ' deu origem ' + (feminino(a.designacao) ? 'à ' : 'ao ') , al, '.'];
          var v = vfg(i.ato);
          return h('li', { key: k },
            h('p', { className: 'grupo-ini' }, render(f)),
            h('p', { className: 'muted' }, i.como === 'propria' ? 'A lei vem desta iniciativa.' : 'Uma das ' + i.n_iniciativas + ' iniciativas que a comissão juntou no texto da lei.'),
            v ? h('p', { className: 'muted' }, render(v)) : null);
        })) : h('p', { className: 'lede' }, 'Nenhuma iniciativa deste grupo deu origem a uma lei deste site.')),
      h('section', { className: 'secao', 'aria-labelledby': 'g-votos' },
        h('h2', { id: 'g-votos' }, 'Como votou nas alterações a um diploma'),
        h('label', { className: 'grupo-escolha' }, h('span', null, 'Diploma'),
          h('select', { className: 'rd-input', value: dip, onChange: function (e) { substituir(link(['grupo', g.id], { diploma: e.target.value || null })); } },
            h('option', { value: '' }, 'Escolha um diploma'),
            escolhas.map(function (k) { return h('option', { key: k, value: k }, (dips[k] || { titulo: k }).titulo); }))),
        !dip ? h('p', { className: 'lede' }, 'Escolha um diploma para ver como este grupo votou as alterações.')
          : !((g.votos || {})[dip] || []).length ? h('p', { className: 'lede' }, 'Este grupo não votou alterações a este diploma, segundo os dados do Parlamento.')
          : h('ul', { className: 'list grupo-votos' }, g.votos[dip].map(function (x, k) {
            var a = atos[x.ato] || { designacao: x.ato }, v = vfg(x.ato);
            return h('li', { key: k },
              h('p', { className: 'grupo-ato' }, h('a', { href: link(['ato', x.ato]) }, nomeCompleto(a))),
              x.sigla !== ultimo.sigla ? h('p', { className: 'muted' }, x.sigla + ', nesta legislatura.') : null,
              x.oe ? h('p', null, 'Lei do Orçamento do Estado: o voto é sobre o orçamento inteiro. Uma lei do Orçamento do Estado também pode alterar outras leis.') : null,
              x.itens.map(function (it, j) {
                return h('p', { key: j }, 'Primeira votação, na generalidade: ' + it.designacao + ': ' + (it.sentido ? SENTIDO[it.sentido] || it.sentido : 'sem votação na generalidade') + '.');
              }),
              v ? h('p', null, render(v)) : null,
              h('p', null, h('a', { href: link(['ato', x.ato], { ir: 'generalidade' }) }, 'Ver a votação de todos os grupos')));
          }))));
  }

  // ---- Stories (#/historias, #/historia/<slug>) ------------------------------------------------------
  // Long-form stories (pipeline/historias.py, pipeline/historias/README.md): prose with links, notes,
  // pull quotes and figures. The build resolves every link and figure; each figure is drawn here, live,
  // from app/data with the site's own functions, inside one frame (Figura).
  function Historias() {
    var r = useData(['historias/index.json']);
    if (!r.data) return h(Loading, { error: r.error });
    document.title = tituloDe(['historias']);
    return h('div', { className: 'pagina-ato' },
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'Histórias'),
        h('p', { className: 'lead' }, 'Como mudaram algumas leis, contado com figuras feitas a partir dos dados do site. Cada facto tem uma fonte.')),
      h('div', { className: 'historias-indice' }, h(ListaHistorias, { historias: r.data[0].historias || [] })));
  }
  // A note marker: a superscript number. Its first use takes the id that «↩» in the notes returns to.
  function MarcaNota(props) {
    var n = props.n, vistas = props.vistas || {}, primeira = !vistas[n];
    vistas[n] = true;
    return h('sup', { className: 'hist-marca' }, h('a', { id: primeira ? 'nota-ref-' + n : undefined, href: link(['historia', props.slug], { ir: 'nota-' + n }), 'aria-label': 'Nota ' + n }, n));
  }
  // The width of an element, kept up to date (the timeline draws to it).
  function useLargura() {
    var el = React.useRef(null), st = useState(0);
    useEffect(function () {
      if (!el.current) return;
      var medir = function () { if (el.current) st[1](Math.round(el.current.getBoundingClientRect().width)); };
      medir();
      if (!window.ResizeObserver) { window.addEventListener('resize', medir); return function () { window.removeEventListener('resize', medir); }; }
      var ro = new ResizeObserver(medir);
      ro.observe(el.current);
      return function () { ro.disconnect(); };
    }, []);
    return [el, st[0]];
  }
  // A figure waiting for its article file: the space stays, and the words appear after 400 ms.
  function FigCarregar(props) {
    var st = useState(false);
    useEffect(function () { var t = setTimeout(function () { st[1](true); }, 400); return function () { clearTimeout(t); }; }, []);
    if (props.error) return h('p', { className: 'fig-retida' }, 'Não foi possível carregar os dados desta figura.');
    return h('p', { className: 'fig-carregar', 'aria-busy': 'true' }, st[0] ? 'A carregar a figura…' : '');
  }
  // Labels of each line of an article (número, alínea), as pipeline/historias.py rotulos_linhas().
  function rotular(textos) {
    var n = '', al = null;
    return textos.map(function (t) {
      var m = /^(\d+(?:\.\d+)*(?:-[A-Z])?) — /.exec(t);
      if (m) { n = m[1]; al = null; return { n: n, al: null, abre: true }; }
      m = /^([a-z]+(?:-[a-z])?)\) /.exec(t);
      if (m) al = m[1];
      return { n: n, al: al, abre: false };
    });
  }
  // mostrar = [{n, al}]: the número, or the alínea and the line that opens its número.
  function escolhida(rot, mostrar) {
    return !mostrar || mostrar.some(function (s) { return s.n === rot.n && (s.al == null || rot.al === s.al || (rot.al == null && !!rot.n)); });
  }
  // «⋯ alíneas d) a f) não mostradas», «⋯ n.os 2 a 5 não mostrados»: one line for each gap.
  function linhaFalta(rots) {
    var nums = [], als = [];
    rots.forEach(function (x) {
      if (x.abre) { if (nums.indexOf(x.n) < 0) nums.push(x.n); }
      else if (x.al && nums.indexOf(x.n) < 0 && als.indexOf(x.al) < 0) als.push(x.al);
    });
    var partes = [];
    if (als.length) partes.push(als.length === 1 ? 'alínea ' + als[0] + ')' : 'alíneas ' + als[0] + ') a ' + als[als.length - 1] + ')');
    if (nums.length) partes.push(nums.length === 1 ? 'n.º ' + nums[0] : 'n.os ' + nums[0] + ' a ' + nums[nums.length - 1]);
    if (!partes.length) return '⋯ ' + (rots.length === 1 ? '1 parágrafo não mostrado' : rots.length + ' parágrafos não mostrados');
    var fem = !nums.length, pl = als.length + nums.length > 1 || nums.length > 1 || als.length > 1;
    return '⋯ ' + partes.join(' e ') + ' não ' + (fem ? (pl ? 'mostradas' : 'mostrada') : (pl ? 'mostrados' : 'mostrado'));
  }
  function legendaRedline() {
    return h('p', { className: 'rd-redline-legend' }, h('span', { className: 'rd-key rd-key-ins' }, h('ins', null, 'acrescentado')), h('span', { className: 'rd-key rd-key-del' }, h('del', null, 'eliminado')));
  }
  // 2a. An article between two redações: the diff of the article page, without its focus state.
  function FigDiff(props) {
    var p = props.b.params, r = useData(['d/' + p.diploma + '/' + p.artigo + '.json']);
    if (!r.data) return h(FigCarregar, { error: r.error });
    var art = r.data[0], va = art.versoes[p.de_i], vb = art.versoes[p.para_i];
    if (!va || !vb) return h('p', { className: 'fig-retida' }, 'Esta figura está em revisão: os dados mudaram depois do texto.');
    var lines = diffLines(texto(va), texto(vb));
    var rots = rotular(lines.map(function (l) {
      var novo = l.filter(function (x) { return x.op !== 'del'; }).map(function (x) { return x.text; }).join('');
      return novo || l.map(function (x) { return x.text; }).join('');
    }));
    var lado = p.vista === 'lado';
    function linha(l, k, comLado) {
      if (!comLado) return segsLei(l, k);
      return h('div', { key: k, className: 'lado-row' },
        segsLei(l.filter(function (x) { return x.op !== 'ins'; }), 'a'), segsLei(l.filter(function (x) { return x.op !== 'del'; }), 'b'));
    }
    function corpo(comLado) {
      var out = [], gap = [], run = [], numero = '';
      var fecharGap = function (k) { if (gap.length) out.push(h('p', { key: 'g' + k, className: 'fig-falta' }, linhaFalta(gap))); gap = []; };
      var fecharRun = function (k) {
        if (run.length < 2) run.forEach(function (x) { out.push(x.el); });
        else out.push(h('details', { key: 'd' + k, className: 'dobra' },
          h('summary', null, run.length + ' parágrafos sem alterações' + (run[0].w.de === 'do parágrafo' && run[run.length - 1].w.a === 'ao parágrafo' ? '.' : ', ' + run[0].w.de + ' ' + run[run.length - 1].w.a + '.')), run.map(function (x) { return x.el; })));
        run = [];
      };
      lines.forEach(function (l, k) {
        var mudou = l.some(function (x) { return x.op !== 'eq'; });
        if (p.mostrar) {
          if (!escolhida(rots[k], p.mostrar)) { gap.push(rots[k]); return; }
          fecharGap(k);
          out.push(linha(l, k, comLado));
          return;
        }
        var w = ondeLinha(l.filter(function (x) { return x.op !== 'ins'; }).map(function (x) { return x.text; }).join('') || l.map(function (x) { return x.text; }).join(''), numero);
        numero = w.numero;
        if (mudou) { fecharRun(k); out.push(linha(l, k, comLado)); } else run.push({ el: linha(l, k, comLado), w: w });
      });
      fecharGap('fim');
      fecharRun('fim');
      return out;
    }
    var antes = 'Antes · ' + p.de_nome, depois = 'Depois · ' + p.para_nome;
    return h('div', { className: 'fig-diff' },
      lado ? h('div', { className: 'so-lado' }, h('div', { className: 'lado-head', 'aria-hidden': 'true' }, h('span', null, antes), h('span', null, depois)),
        h('div', { className: 'lei lei-lado' }, corpo(true))) : null,
      h('div', { className: 'lei' + (lado ? ' so-texto' : '') }, corpo(false)),
      legendaRedline());
  }
  // 2b. The generalidade vote by group, then the final vote, veto and Court, and the promulgation.
  function FigVotacao(props) {
    var p = props.b.params, ref = props.dados, pa = (ref.passagem || {})[p.ato];
    if (!pa) return h('p', { className: 'fig-retida' }, 'Não temos os dados desta votação.');
    var rg = registo(ref, p.ato), q = rg.quem, itens = itensGeneralidade(pa);
    if (p.item === 'comissao') itens = itens.filter(function (x) { return x.comissao; });
    else if (p.item) itens = itens.filter(function (x) { return x.ini && x.ini.id === p.item; });
    var tabela = !p.item && itens.filter(function (x) { return x.ini; }).length > 1;
    var votos = tabela ? h(VotosAto, { p: pa, quem: q, dados: ref }) : h(React.Fragment, null, itens.map(function (it, k) {
      var v = it.voto, gn = genero(it.titulo || 'Texto');
      var res = v.resultado === 'Aprovado' ? gn.ado : v.resultado === 'Rejeitado' ? gn.ejeitado : v.resultado;
      return h('div', { key: k, className: 'fig-voto' },
        itens.length > 1 ? h('p', { className: 'voto-nome' }, it.titulo + ', ' + extenso(v.data)) : null,
        res && !v.unanime ? h('p', { className: 'voto-res' }, res) : null,
        h(Voto, { v: v, ordem: ordemDe(pa, [v]), nomes: nomesDe(ref, v.legislatura || pa.legislatura) }));
    }), h(NotasVoto, { votos: itens.map(function (x) { return x.voto; }) }));
    var depois = q.provisorio ? [] : [linhaVfg(q.vfg, (q.motivos || {}).vfg)].concat(linhasEventos(q.eventos, ref))
      .concat([linhaPresidente(q, ref, rg.ato, rg.ato.designacao && /^Lei/.test(rg.ato.designacao) ? 'a lei' : 'o texto')]);
    return h('div', { className: 'fig-votacao' }, votos,
      depois.length ? h('div', { className: 'fig-depois' }, depois.map(function (f, k) { return h('p', { key: k }, render(f)); })) : null);
  }
  // 2e. Facts box for one act: who proposed, voted, promulgated and published it.
  var CAMPOS_FICHA = ['proposta', 'governo', 'generalidade', 'vfg', 'tribunal', 'veto', 'novo_decreto', 'confirmacao', 'd_cm', 'promulgacao', 'publicacao', 'vigor'];
  function FigFicha(props) {
    var p = props.b.params, ref = props.dados, rg = registo(ref, p.ato), q = rg.quem, a = rg.ato, pa = rg.p, m = q.motivos || {};
    var dl = (q.tipo_ato || tipoDe(a.designacao)) === 'decreto-lei', rows = {};
    var nome = function (id, nm) { var pr = presidenteDe(ref, id); return (pr && pr.nome) || nm || ''; };
    if (!dl && (q.proponentes || []).length) {
      var props0 = q.proponentes.slice(0, 3).map(function (x, k) {
        return h('span', { key: k, className: 'factos-linha' }, render([ligIni(x.iniciativa, x.designacao, pa), ', '].concat(autorIni(x, ref, q.legislatura).de)));
      });
      if (q.texto_comissao) props0.unshift(h('span', { key: 't', className: 'factos-sub' }, 'Texto da comissão, a partir de:'));
      if (q.proponentes.length > 3) props0.push(h('span', { key: 'm', className: 'factos-sub' }, 'E mais ' + (q.proponentes.length - 3) + '.'));
      rows.proposta = ['Proposta', props0];
    }
    var n = q.governo && q.governo.numero != null ? q.governo.numero : ((q.proponentes || []).filter(function (x) { return x.governo != null; })[0] || {}).governo;
    if (n == null && q.periodo) n = q.periodo.governo;
    var g = governoDe(ref, n);
    if (n != null) rows.governo = ['Governo', render([gov(n)].concat(g && g.primeiro_ministro ? [' · ' + g.primeiro_ministro] : []))];
    else if (m.governo && MOTIVOS[m.governo]) rows.governo = ['Governo', render(motivo(m.governo))];
    if (dl && q.d_cm) rows.d_cm = ['Conselho de Ministros', curta(q.d_cm)];
    var itens = pa ? itensGeneralidade(pa) : [];
    if (itens.length) {
      var v = itens[0].voto;
      rows.generalidade = ['Generalidade', [curta(v.data) + ' · ' + (v.resultado || '') + (v.unanime ? ', por unanimidade' : ''),
        v.unanime ? null : h('span', { key: 's', className: 'factos-sub' }, sentidos(v, ordemDe(pa, [v])).trim()),
        itens.length > 1 ? h('span', { key: 'm', className: 'factos-sub' }, 'E mais ' + (itens.length - 1) + (itens.length === 2 ? ' votação.' : ' votações.')) : null]];
    }
    if (!dl && q.vfg) rows.vfg = ['Votação final global', curta(q.vfg.data) + ' · ' + (q.vfg.resultado || '') + (q.vfg.unanime ? ', por unanimidade' : '')];
    else if (!dl && m.vfg && MOTIVOS[m.vfg]) rows.vfg = ['Votação final global', render(motivo(m.vfg))];
    (q.eventos || []).forEach(function (e) {
      if (e.tipo === 'veto') {
        if (e.acordao_tc) rows.tribunal = ['Tribunal Constitucional', 'Acórdão n.º ' + e.acordao_tc];
        rows.veto = ['Veto', curta(e.data) + (e.presidente ? ' · ' + nome(e.presidente) : '')];
      } else if (e.tipo === 'tribunal') rows.tribunal = ['Tribunal Constitucional', curta(e.data)];
      else if (e.tipo === 'novo_decreto') rows.novo_decreto = ['Novo decreto', curta(e.data)];
      else if (e.tipo === 'confirmacao') rows.confirmacao = ['Confirmação', curta(e.data)];
    });
    var pr = q.presidente;
    if (pr && pr.d_promulgacao) rows.promulgacao = ['Promulgação', curta(pr.d_promulgacao) + ' · ' + nome(pr.id, pr.nome)];
    else if (m.presidente && MOTIVOS[m.presidente]) rows.promulgacao = ['Promulgação', render(motivo(m.presidente))];
    if (a.publicacao) rows.publicacao = ['Publicação', a.link ? h('a', { href: a.link, target: '_blank', rel: 'noopener' }, curta(a.publicacao) + ' ↗') : curta(a.publicacao)];
    var vs = [];
    (a.alteracoes || []).forEach(function (c) { if (c.vigor && vs.indexOf(c.vigor) < 0) vs.push(c.vigor); });
    vs.sort();
    if (vs.length) rows.vigor = ['Entrada em vigor', vs.length === 1 ? curta(vs[0]) : 'Datas diferentes, de ' + curta(vs[0]) + ' a ' + curta(vs[vs.length - 1])];
    var ordem = (p.campos || CAMPOS_FICHA).filter(function (k) { return rows[k]; });
    return h('dl', { className: 'fig-ficha' }, ordem.map(function (k) {
      return h('div', { key: k, className: 'fig-ficha-l' }, h('dt', null, rows[k][0]), h('dd', null, rows[k][1]));
    }));
  }
  // 2d. «Origem do texto» of one redação: the words of each act, with the legend and the popover.
  function FigOrigem(props) {
    var p = props.b.params, ref = props.dados, r = useData(['d/' + p.diploma + '/' + p.artigo + '.json']);
    if (!r.data) return h(FigCarregar, { error: r.error });
    var art = r.data[0], v = art.versoes[p.redacao_i];
    if (!v) return h('p', { className: 'fig-retida' }, 'Esta figura está em revisão: os dados mudaram depois do texto.');
    var model = originModel(art, p.redacao_i, ref.atos || {}, function (o) { return link(['d', p.diploma, p.artigo], { redacao: versionKey(art, o) }); }, p.nome_original);
    var paras = model.paragraphs;
    if (p.mostrar) {
      var rots = rotular(v.linhas.map(function (l) { return l.map(function (s) { return s[1]; }).join(''); })), out = [], gap = [];
      paras.forEach(function (x, k) {
        if (escolhida(rots[k], p.mostrar)) { if (gap.length) out.push({ gap: linhaFalta(gap), spans: [] }); gap = []; out.push(x); } else gap.push(rots[k]);
      });
      if (gap.length) out.push({ gap: linhaFalta(gap), spans: [] });
      paras = out;
    }
    var usados = {};
    paras.forEach(function (x) { x.spans.forEach(function (s) { usados[s.act] = true; }); });
    var acts = model.acts.filter(function (a) { return usados[a.index]; });
    var foco = p.destacar_i != null && art.versoes[p.destacar_i] ? corDe(art, p.destacar_i) : undefined;
    return h('div', { className: 'lei lei-origem fig-origem' },
      h(R.TextOrigin, { key: art.id + p.redacao_i, paragraphs: paras, acts: acts, margem: false, focus: foco }),
      h('p', { className: 'fig-nota' }, 'Cada cor é um diploma que escreveu parte do texto.'));
  }
  // 2c. A diploma's changes by Government (or legislatura): a ruler, then a ledger.
  var CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  function curtoAto(des) {
    return (des || '').replace(/^Lei Orgânica n\.º /, 'LO ').replace(/^Lei Constitucional n\.º /, 'LC ').replace(/^Lei n\.º /, 'Lei ')
      .replace(/^Decreto-Lei n\.º /, 'DL ').replace(/^Declaração de Retificação n\.º /, 'Ret. ').replace(/^Acórdão do Tribunal Constitucional n\.º /, 'Ac. TC ');
  }
  function anoDe(iso) { var d = new Date((iso || '').slice(0, 10) + 'T00:00:00Z'); return d.getUTCFullYear() + (d.getUTCMonth() * 30.44 + d.getUTCDate()) / 365.25; }
  function Regua(props) {
    var W = props.largura, atos = props.atos, telefone = W < 600, ref = props.dados, por = props.por;
    var a0 = anoDe(props.desde), a1 = anoDe(props.ate || hoje()), M = 8;
    if (!(W > 0) || a1 <= a0) return null;
    var x = function (iso) { return M + (anoDe(iso) - a0) / (a1 - a0) * (W - 2 * M); };
    var yTopo = telefone ? 16 : 44, yEixo = yTopo + 14, out = [];
    // Year labels at their true positions: every 5 or 10 years, by width; on a phone, start, middle and end.
    var anos = [], i0 = Math.ceil(a0), i1 = Math.floor(a1);
    if (telefone) anos = [Math.floor(a0), Math.round((a0 + a1) / 2), Math.floor(a1)];
    else {
      var porAno = (W - 2 * M) / (a1 - a0), passo = porAno * 5 >= 56 ? 5 : porAno * 10 >= 48 ? 10 : 20;
      anos.push(Math.floor(a0));
      for (var y = Math.ceil(i0 / passo) * passo; y <= i1; y += passo) if (y - a0 > passo * 0.45 && a1 - y > passo * 0.45) anos.push(y);
      anos.push(Math.floor(a1));
    }
    out.push(h('line', { key: 'eixo', x1: M, x2: W - M, y1: yEixo, y2: yEixo, className: 'cr-eixo' }));
    anos.forEach(function (y, k) {
      var px = k === 0 ? M : k === anos.length - 1 ? W - M : M + (y - a0) / (a1 - a0) * (W - 2 * M);
      out.push(h('text', { key: 'a' + k, x: px, y: yEixo + 20, className: 'cr-ano', textAnchor: k === 0 ? 'start' : k === anos.length - 1 ? 'end' : 'middle' }, String(y)));
    });
    // One tick per act; the acts the text discusses are heavy, with a label above (or a number on a phone).
    var fila = [-1e9, -1e9];
    atos.forEach(function (at) {
      var px = x(at.data);
      out.push(h('line', { key: 't' + at.ato, x1: px, x2: px, y1: at.marcado ? yEixo - 14 : yEixo - 8, y2: yEixo + (at.marcado ? 6 : 4), className: at.marcado ? 'cr-tick cr-marca' : 'cr-tick' }));
      if (!at.marcado) return;
      var rot = telefone ? at.num : curtoAto(((ref.atos || {})[at.ato] || {}).designacao || at.ato);
      var w = rot.length * 6.6, l = Math.max(0, Math.min(W - w, px - w / 2));
      var row = telefone ? 0 : l > fila[0] + 6 ? 0 : 1;
      fila[row] = l + w;
      out.push(h('text', { key: 'm' + at.ato, x: l + w / 2, y: telefone ? yEixo - 18 : yTopo - 8 - row * 16, className: 'cr-rot', textAnchor: 'middle' }, rot));
    });
    // Each Government's (or legislatura's) span as a hairline bracket, with its numeral when it fits.
    var yG = yEixo + 34, spans = [];
    if (por === 'governo') ((ref.governos || {}).governos || []).forEach(function (g) { spans.push({ i: g.inicio, f: g.fim, t: romano(g.numero) }); });
    else ((ref.governos || {}).legislaturas || []).forEach(function (l) { spans.push({ i: l.inicio, f: l.fim, t: l.sigla }); });
    spans.forEach(function (s, k) {
      if (!s.i || (s.f && s.f <= props.desde) || s.i >= (props.ate || hoje())) return;
      var xi = Math.max(M, x(s.i)), xf = Math.min(W - M, x(s.f || props.ate || hoje()));
      if (xf - xi < 2) return;
      out.push(h('path', { key: 'g' + k, d: 'M' + (xi + 1) + ' ' + (yG - 4) + 'V' + yG + 'H' + (xf - 1) + 'V' + (yG - 4), className: 'cr-gov' }));
      if (!telefone && xf - xi > s.t.length * 7 + 6) out.push(h('text', { key: 'gt' + k, x: (xi + xf) / 2, y: yG + 14, className: 'cr-gov-t', textAnchor: 'middle' }, s.t));
    });
    return h('svg', { width: W, height: yG + (telefone ? 6 : 20), viewBox: '0 0 ' + W + ' ' + (yG + (telefone ? 6 : 20)), className: 'cr-regua', 'aria-hidden': 'true', focusable: 'false' }, out);
  }
  function FigCronologia(props) {
    var p = props.b.params, ref = props.dados, med = useLargura();
    var k = 0, atos = (p.atos || []).map(function (a) { return Object.assign({}, a, a.marcado ? { num: CIRC.charAt(k++) || String(k) } : {}); });
    var grupos = [];
    atos.forEach(function (a) { var g = grupos[grupos.length - 1]; if (!g || g.id !== a.grupo) grupos.push(g = { id: a.grupo, atos: [] }); g.atos.push(a); });
    var cab = function (id) {
      if (id == null) return ['Sem Governo nos dados'];
      if (p.por !== 'governo') {
        var l = ((ref.governos || {}).legislaturas || []).filter(function (x) { return x.sigla === id; })[0];
        return [nomeLeg(id) + (l ? ' · ' + l.inicio.slice(0, 4) + '–' + (l.fim ? l.fim.slice(0, 4) : 'hoje') : '')];
      }
      var g = governoDe(ref, id);
      return [gov(id)].concat(g ? [(g.primeiro_ministro ? ' · ' + g.primeiro_ministro : '') + ' · ' + g.inicio.slice(0, 4) + '–' + (g.fim ? g.fim.slice(0, 4) : 'hoje')] : []);
    };
    return h('div', { className: 'fig-crono', ref: med[0] },
      h(Regua, { largura: med[1], atos: atos, desde: p.desde, ate: p.ate, por: p.por, dados: ref }),
      h('div', { className: 'cr-livro' }, grupos.map(function (g, gi) {
        return h('div', { key: gi, className: 'cr-grupo' },
          h('p', { className: 'cr-grupo-h' }, render(cab(g.id))),
          h('ul', { className: 'cr-linhas' }, g.atos.map(function (a) {
            var at = (ref.atos || {})[a.ato] || { designacao: a.ato };
            return h('li', { key: a.ato, className: 'cr-linha' + (a.marcado ? ' is-marca' : '') },
              h('span', { className: 'cr-ato' }, a.num ? h('span', { className: 'cr-num', 'aria-hidden': 'true' }, a.num + ' ') : null, h('a', { href: link(['ato', a.ato]) }, at.designacao)),
              h('span', { className: 'cr-meta' },
                h('span', { className: 'cr-data' }, curta(a.data)),
                h('span', { className: 'cr-como' }, a.como),
                h('span', { className: 'cr-n' }, a.n === 1 ? '1 artigo' : a.n + ' artigos')));
          })));
      })));
  }
  // 2f. A static image: a document or a facsimile, never a photograph of a person.
  function FigImagem(props) {
    var p = props.b.params;
    return h('img', { className: 'fig-img', src: 'data/' + p.arquivo, alt: p.alt, loading: 'lazy', decoding: 'async' });
  }
  var FIGURAS = { diff: FigDiff, votacao: FigVotacao, cronologia: FigCronologia, origem: FigOrigem, ficha: FigFicha, imagem: FigImagem };
  // The frame of every figure: number, title and what it shows; the body; caption, source and link.
  function Figura(props) {
    var b = props.b, ref = props.dados, Corpo = FIGURAS[b.tipo], tid = 'fig-' + b.id + '-t';
    var av = b.aviso && !b.retida ? b.aviso : null, avAto = av && (ref.atos || {})[av.ato];
    var imagem = b.tipo === 'imagem';
    return h('figure', { id: 'fig-' + b.id, className: 'fig fig-' + b.tipo + ' fig-' + (b.largura || 'texto'), 'aria-labelledby': tid, tabIndex: -1 },
      h('figcaption', { className: 'fig-cabeca' },
        h('p', { className: 'fig-n' }, 'Figura ' + b.n),
        h('p', { className: 'fig-titulo', id: tid }, b.titulo),
        b.sub && !b.retida ? h('p', { className: 'fig-sub' }, b.sub) : null),
      av ? h('p', { className: 'regra regra-aviso fig-aviso' }, h('strong', null, 'Atenção: '),
        av.tipo === 'votos' ? 'os dados desta votação mudaram depois do texto. '
          : av.tipo === 'texto' ? 'o texto desta redação mudou depois do texto da história. '
          : 'este artigo tem uma redação mais recente (' + (avAto ? avAto.designacao : av.ato) + '). ',
        h('a', { href: av.href }, av.tipo === 'votos' ? 'Ver a votação' : 'Ver o texto em vigor')) : null,
      h('div', { className: 'fig-corpo' }, b.retida || !Corpo ? h('p', { className: 'fig-retida' }, 'Esta figura está em revisão: os dados mudaram depois do texto.') : h(Corpo, { b: b, dados: ref })),
      h('div', { className: 'fig-pe' },
        (b.legenda || []).length ? h('p', { className: 'fig-legenda' }, render(b.legenda, props.ctx)) : null,
        b.fonte ? h('p', { className: 'fig-fonte' }, 'Fonte: ' + b.fonte) : null,
        b.href ? h('p', { className: 'fig-abrir' }, imagem
          ? h('a', { href: b.href, target: '_blank', rel: 'noopener', 'aria-label': 'Ver a fonte: ' + b.titulo }, 'Ver a fonte ↗')
          : h('a', { href: b.href, 'aria-label': 'Abrir no site: ' + b.titulo }, 'Abrir no site')) : null));
  }
  function Indice(props) {
    return h('ol', { className: 'hist-indice-lista' }, props.h2.map(function (b) {
      return h('li', { key: b.id }, h('a', { href: link(['historia', props.slug], { ir: b.id }) }, b.texto));
    }));
  }
  function Historia(props) {
    var r = useData(['historias/' + props.slug + '.json', 'atos.json', 'passagem.json', '?quem.json', '?governos.json', 'index.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var hx = r.data[0], ref = { atos: r.data[1], passagem: r.data[2], quem: r.data[3] || {}, governos: r.data[4], index: r.data[5] };
    document.title = tituloDe(['historia', hx.slug], { historia: hx });
    var ctx = { slug: hx.slug, vistas: {} };
    var h2 = (hx.blocos || []).filter(function (b) { return b.t === 'h2'; });
    var tipos = {};
    (hx.blocos || []).forEach(function (b) { if (b.t === 'figura') tipos[b.tipo] = true; });
    // Links inside the page (notes, figures, subheads) change only ir=, without a new history entry.
    var irNaPagina = function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null, href = a ? a.getAttribute('href') || '' : '';
      if (href.indexOf(link(['historia', hx.slug]) + '?ir=') === 0) { e.preventDefault(); substituir(href); }
    };
    var bloco = function (b, k) {
      if (b.t === 'p') return h('p', { key: k, className: 'hist-p' }, render(b.partes, ctx));
      if (b.t === 'h2') return h('h2', { key: k, id: b.id, className: 'hist-h2', tabIndex: -1 }, b.texto);
      if (b.t === 'h3') return h('h3', { key: k, id: b.id, className: 'hist-h3', tabIndex: -1 }, b.texto);
      if (b.t === 'citacao') return h('figure', { key: k, className: 'hist-citacao' },
        h('blockquote', null, h('p', null, render(b.partes, ctx))), h('figcaption', null, '— ', render(b.autor, ctx)));
      if (b.t === 'figura') return h(Figura, { key: k, b: b, dados: ref, ctx: ctx });
      return null;
    };
    var fontesFig = [];
    if (tipos.diff || tipos.origem) fontesFig.push('Diário da República (legislação consolidada)');
    if (tipos.votacao || tipos.ficha || tipos.cronologia) fontesFig.push('Assembleia da República (dados abertos)');
    if (tipos.ficha || tipos.cronologia) fontesFig.push('tabelas de Governos e de Presidentes do site');
    var desat = hx.desatualizada || [];
    var aviso = (hx.aviso || '').replace(/ Data: [^.]+\./, '');
    var corpo = (hx.blocos || []).map(bloco);
    return h('article', { className: 'hist', onClick: irNaPagina },
      h('nav', { 'aria-label': 'Localização', className: 'crumbs' }, h('a', { href: '#/historias' }, 'Histórias'), h('span', { 'aria-hidden': 'true' }, '›')),
      h('header', { className: 'hist-cabeca' },
        h('h1', { className: 'hist-titulo' }, hx.titulo),
        hx.resumo ? h('p', { className: 'hist-dek' }, hx.resumo) : null,
        h('p', { className: 'hist-linha' }, (hx.autoria || 'Redação') + ' · ' + extenso(hx.preparado_em) + (hx.minutos ? ' · ' + hx.minutos + ' min de leitura' : '')),
        h('p', { className: 'hist-aviso' }, aviso),
        desat.length ? h('p', { className: 'regra regra-aviso hist-atencao' }, h('strong', null, 'Atenção: '), 'a lei mudou depois deste texto. As figuras mostram os dados de hoje e dizem o que mudou.') : null,
        h2.length ? h('details', { className: 'hist-indice-tel' }, h('summary', null, 'Nesta história'), h(Indice, { h2: h2, slug: hx.slug })) : null),
      h('div', { className: 'hist-corpo' },
        h2.length ? h('nav', { className: 'hist-indice', 'aria-labelledby': 'hist-indice-t' }, h('p', { id: 'hist-indice-t', className: 'hist-indice-t' }, 'Nesta história'), h(Indice, { h2: h2, slug: hx.slug })) : null,
        corpo),
      (hx.notas || []).length ? h('section', { className: 'hist-sec hist-notas', 'aria-labelledby': 'notas' },
        h('h2', { id: 'notas', className: 'hist-h2', tabIndex: -1 }, 'Notas e fontes'),
        h('ol', { className: 'hist-notas-lista' }, hx.notas.map(function (n) {
          return h('li', { key: n.n, id: 'nota-' + n.n, tabIndex: -1 },
            h('span', { className: 'hist-nota-n', 'aria-hidden': 'true' }, n.n + '. '),
            render(n.partes, { slug: hx.slug }),
            (n.urls || []).map(function (u, k) {
              return h(React.Fragment, { key: k }, ' ', h('a', { className: 'hist-url', href: u.href, target: '_blank', rel: 'noopener', 'data-url': u.href }, u.host.replace(/^www\./, '') + ' ↗'),
                u.consultado ? ', consultado a ' + extenso(u.consultado) + '.' : '');
            }),
            ' ', h('a', { className: 'hist-volta', href: link(['historia', hx.slug], { ir: 'nota-ref-' + n.n }), 'aria-label': 'Voltar ao texto da nota ' + n.n }, '↩'));
        }))) : null,
      h('section', { className: 'hist-sec hist-sobre', 'aria-labelledby': 'sobre-texto' },
        h('h2', { id: 'sobre-texto', className: 'hist-h2', tabIndex: -1 }, 'Sobre este texto'),
        h('p', null, hx.aviso),
        h('p', null, 'Preparado por ' + (hx.autoria || 'Redação') + ' a ' + extenso(hx.preparado_em) + '.' + (hx.atualizado_em && hx.atualizado_em > hx.preparado_em ? ' Atualizado a ' + extenso(hx.atualizado_em) + '.' : '')),
        fontesFig.length ? h('p', null, 'As figuras usam os dados do site: ' + lista(fontesFig) + '. As datas, os nomes e as votações vêm desses dados.') : null,
        h('p', null, 'As figuras mostram os dados do site. Para ver a vista completa, escolha «Abrir no site».'),
        h('p', null, h('a', { href: 'https://github.com/andre15silva/pt-legal-git/issues/new?title=' + encodeURIComponent('Erro: ' + hx.titulo), target: '_blank', rel: 'noopener' }, 'Reportar um erro ↗'))),
      (hx.relacionadas || []).length ? h('section', { className: 'hist-sec hist-continuar', 'aria-labelledby': 'continuar' },
        h('h2', { id: 'continuar', className: 'hist-h2', tabIndex: -1 }, 'Continuar a ler'),
        h('ul', { className: 'list' }, hx.relacionadas.map(function (x, k) { return h('li', { key: k }, h('a', { href: x.href }, x.texto)); }))) : null);
  }

  // ---- Glossary (#/glossario) ----------------------------------------------------------------------
  function Glossario() {
    var r = useData(['glossario.json']);
    if (!r.data) return h(Loading, { error: r.error });
    document.title = tituloDe(['glossario']);
    var g = r.data[0], termos = Object.keys(g.termos || {}).map(function (k) { return g.termos[k]; });
    var grupos = (g.grupos || []).map(function (x) { return typeof x === 'string' ? { id: x, titulo: x } : x; });
    var resto = termos.filter(function (t) { return !grupos.some(function (x) { return x.termos ? x.termos.indexOf(t.id) >= 0 : x.id === t.grupo; }); });
    var entrada = function (t) {
      return h('div', { key: t.id, className: 'glossario-entrada' },
        h('h3', { id: t.id, tabIndex: -1 }, t.termo),
        h('div', { className: 'rd-termo-folha' }, h(R.TermoConteudo, { def: t, id: t.id, bloco: true, semGlossario: true })));
    };
    return h('div', { className: 'pagina-ato pagina-glossario' },
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'Glossário'),
        h('p', { className: 'lead' }, 'As palavras deste site, explicadas. Cada definição mostra o texto da lei que a sustenta.'),
        h('p', { className: 'historia-aviso' }, 'Definições preparadas a partir do texto da lei, com ajuda de uma ferramenta automática. Data: ' + extenso(g.preparado_em) + '. Ainda sem revisão jurídica externa.')),
      grupos.map(function (x) {
        var ts = x.termos ? x.termos.map(function (id) { return g.termos[id]; }).filter(Boolean)
          : termos.filter(function (t) { return t.grupo === x.id; }).sort(function (a, b) { return fold(a.termo) < fold(b.termo) ? -1 : 1; });
        return ts.length ? h('section', { key: x.id, className: 'secao', 'aria-labelledby': 'gl-' + x.id }, h('h2', { id: 'gl-' + x.id }, x.titulo), ts.map(entrada)) : null;
      }),
      resto.length ? h('section', { className: 'secao', 'aria-labelledby': 'gl-outros' }, h('h2', { id: 'gl-outros' }, 'Outras palavras'), resto.map(entrada)) : null);
  }

  // ---- Verification report ---------------------------------------------------------------------
  var ESTADO = { verificado: 'Iguais', forma: 'Só na forma', desatualizado: 'Desatualizadas', divergente: 'Divergentes' };
  function pct(x) { return x == null ? '—' : (Math.round(x * 1000) / 10).toString().replace('.', ',') + ' %'; }
  function Verificacao() {
    var r = useData(['verificacao.json', 'atos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var vj = r.data[0], atos = r.data[1];
    document.title = tituloDe(['verificacao']);
    var com = Object.keys(vj.diplomas).filter(function (k) { return vj.diplomas[k].relatorio; });
    var sem = Object.keys(vj.diplomas).filter(function (k) { return !vj.diplomas[k].relatorio; });
    return h('div', { className: 'pagina-ato' },
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, 'Verificação do texto'),
        h('p', { className: 'lead' }, 'O texto que mostramos vem do consolidado do Diário da República, que não tem valor legal. Uma republicação tem valor legal: é o texto completo publicado com uma alteração. Comparamos cada redação com as republicações do seu período.')),
      com.map(function (slug) {
        var x = vj.diplomas[slug], rel = x.relatorio, v = rel.versoes;
        var faltam = rel.republicacoes.filter(function (p) { return p.falta_consolidado.length; });
        return h('section', { key: slug, className: 'secao', 'aria-labelledby': 'v-' + slug },
          h('h2', { id: 'v-' + slug }, x.titulo),
          h('dl', { className: 'meta meta-grande' },
            h('div', null, h('dt', null, 'Redações comparadas'), h('dd', null, v.total)),
            ['verificado', 'forma', 'desatualizado', 'divergente'].map(function (k) { return h('div', { key: k }, h('dt', null, ESTADO[k]), h('dd', null, v[k] || 0)); }),
            h('div', null, h('dt', null, 'Iguais ao texto oficial'), h('dd', null, pct(rel.m2)))),
          h('div', { className: 'tabela-caixa', tabIndex: 0, role: 'region', 'aria-labelledby': 'tr-' + slug },
            h('table', { className: 'tabela-votos tabela-verif' },
              h('caption', { id: 'tr-' + slug }, 'Artigos de cada republicação'),
              h('thead', null, h('tr', null, ['Republicação', 'Em vigor', 'Artigos', 'Iguais', 'Só na forma', 'Diferentes', 'Iguais ou só na forma', ''].map(function (c, k) { return h('th', { key: k, scope: 'col' }, c); }))),
              h('tbody', null, rel.republicacoes.map(function (p) {
                return h('tr', { key: p.ato },
                  h('th', { scope: 'row' }, atos[p.ato] ? h('a', { href: link(['ato', p.ato]) }, p.designacao) : p.designacao),
                  h('td', { className: 'tv-res' }, curta(p.data)), h('td', { className: 'num' }, p.artigos), h('td', { className: 'num' }, p.igual),
                  h('td', { className: 'num' }, p.so_forma), h('td', { className: 'num' }, p.diferente), h('td', { className: 'num' }, pct(p.m2)),
                  h('td', null, p.pdf ? h('a', { href: p.pdf, target: '_blank', rel: 'noopener' }, 'PDF ↗') : null));
              })))),
          rel.reproducao ? h('div', { className: 'reproducao' },
            h('h3', { className: 'h3 rever-titulo' }, 'Reprodução das revisões'),
            h('p', { className: 'lede' }, 'Aplicamos as instruções de cada lei de revisão ao texto oficial anterior e comparamos o resultado com a republicação. ',
              'Reproduzimos palavra a palavra ' + pct(rel.m1) + ' dos artigos que as revisões alteraram. ',
              'O limite é a coluna «Artigos não alterados»: mesmo nos artigos que nenhuma revisão tocou, dois textos oficiais seguidos nem sempre são iguais, por erros de transcrição.'),
            h('div', { className: 'tabela-caixa', tabIndex: 0, role: 'region', 'aria-labelledby': 'rp-' + slug },
              h('table', { className: 'tabela-votos tabela-verif' },
                h('caption', { id: 'rp-' + slug }, 'Artigos reproduzidos, por revisão'),
                h('thead', null, h('tr', null, ['Revisão', 'Instruções', 'Por ler', 'Artigos alterados', 'Reproduzidos', '', 'Artigos não alterados', 'Iguais'].map(function (c, k) { return h('th', { key: k, scope: 'col' }, c); }))),
                h('tbody', null, rel.reproducao.map(function (p) {
                  return h('tr', { key: p.ato },
                    h('th', { scope: 'row' }, atos[p.ato] ? h('a', { href: link(['ato', p.ato]) }, p.designacao) : p.designacao),
                    h('td', { className: 'num' }, p.instrucoes), h('td', { className: 'num' }, p.por_ler),
                    h('td', { className: 'num' }, p.alterados), h('td', { className: 'num' }, p.alterados_iguais), h('td', { className: 'num' }, pct(p.m1)),
                    h('td', { className: 'num' }, p.inalterados), h('td', { className: 'num' }, pct(p.teto)));
                })))),
            h('p', { className: 'muted small' }, 'Lemos as instruções com regras fixas, sem modelos de linguagem: cada palavra inserida vem do texto da lei de revisão. Uma instrução que não conseguimos ler fica na coluna «Por ler».')) : null,
          faltam.length ? h('p', { className: 'lede' }, 'O consolidado do Diário da República segue a numeração de hoje. Os artigos que uma revisão eliminou ou renumerou não têm história: faltam ',
            lista(faltam.map(function (p) { return p.falta_consolidado.length + ' artigos do texto de ' + p.data.slice(0, 4); })), '.') : null,
          h('h3', { className: 'h3 rever-titulo' }, 'Para rever (' + rel.divergentes.length + ')'),
          h('p', { className: 'muted small' }, 'Desatualizada: a partir de uma revisão, todas as republicações têm outro texto. Divergente: nenhuma republicação tem este texto. Uma pessoa tem de confirmar cada caso no PDF.'),
          h('ol', { className: 'rever' }, rel.divergentes.slice().sort(function (a, b) { return a.estado === b.estado ? 0 : a.estado === 'desatualizado' ? -1 : 1; }).map(function (x2, k) {
            var dif = x2.pontos.filter(function (p) { return p.veredicto === 'diferente'; }), ult = dif[dif.length - 1];
            return h('li', { key: k },
              h('p', { className: 'rever-cab' }, h('a', { href: link(['d', slug, x2.artigo], { redacao: x2.ato }) }, x2.rotulo + ', ' + ordinal(x2.versao) + ' redação'),
                h('span', { className: 'rever-estado' }, x2.estado === 'desatualizado' ? 'Desatualizada' : 'Divergente'),
                h('span', { className: 'muted' }, ' · ' + dif.length + (dif.length === 1 ? ' republicação diferente' : ' republicações diferentes'))),
              (ult.diff || []).slice(0, 2).map(function (par, j) { return h(DifOficial, { key: j, par: par }); }));
          })));
      }),
      vj.quem ? h(VerificacaoQuem, { q: vj.quem, atos: atos }) : null,
      (vj.conteudo || []).length ? h('section', { className: 'secao', 'aria-labelledby': 'v-textos' },
        h('h2', { id: 'v-textos' }, 'Textos em revisão'),
        h('ul', { className: 'list' }, vj.conteudo.map(function (x, k) {
          var href = x.tipo === 'historia' ? link(['historia', x.id], { ir: x.seccao || null }) : x.tipo === 'glossario' ? link(['glossario']) : null;
          return h('li', { key: k }, href ? h('a', { href: href }, x.id + (x.seccao ? ' · ' + x.seccao : '')) : x.id, h('span', { className: 'muted' }, ' · ' + x.motivo));
        }))) : null,
      h('section', { className: 'secao', 'aria-labelledby': 'v-sem' },
        h('h2', { id: 'v-sem' }, 'Ainda não verificados'),
        h('p', { className: 'lede' }, lista(sem.map(function (k) { return vj.diplomas[k].titulo; })) + '. Os códigos fiscais quase nunca são republicados: o Orçamento do Estado altera-os sem os republicar. Para estes, vamos comparar o texto com uma reprodução própria dos atos que os alteraram.')));
  }

  // The check of who made each law (verificacao.json.quem): what we could not read or confirm.
  function VerificacaoQuem(props) {
    var q = props.q, atos = props.atos, a = q.assinaturas || {};
    var nome = function (id) { return h('a', { href: link(['ato', id]) }, (atos[id] || { designacao: id }).designacao); };
    var lista0 = function (t, xs, f) {
      return xs && xs.length ? [h('h3', { key: t + 'h', className: 'h3 rever-titulo' }, t), h('ul', { key: t + 'l', className: 'list' }, xs.map(function (x, k) { return h('li', { key: k }, f(x)); }))] : null;
    };
    return h('section', { className: 'secao', 'aria-labelledby': 'v-quem' },
      h('h2', { id: 'v-quem' }, 'Quem fez cada lei: verificação'),
      a.total != null ? h('p', { className: 'lede' }, 'Lemos as assinaturas de ' + (a.total - (a.falhas || []).length) + ' de ' + a.total + ' atos.') : null,
      lista0('Atos sem a data do Conselho de Ministros', (a.falhas || []).filter(function (x) { return x.motivo === 'sem_d_cm'; }), function (x) { return nome(x.ato); }),
      lista0('Factos que as fontes não confirmam', (q.cruzamento || []).filter(function (x) { return x.estado !== 'ok' && x.regra !== 'mesmo_pm'; }), function (x) { return [nome(x.ato), h('span', { key: 'd', className: 'muted' }, ' · ' + (x.detalhe || x.regra))]; }),
      lista0('Decretos-leis perto de uma mudança de Governo com o mesmo Primeiro-Ministro', q.mesmo_pm, function (x) {
        return [nome(x.ato), h('span', { key: 'd', className: 'muted' }, ' · Conselho de Ministros a ' + curta(x.d_cm) + ' · ' + (x.governos || []).map(function (n) { return romano(n); }).join(' e ') + ' Governos Constitucionais')];
      }),
      lista0('Datas do Parlamento que não mostramos', q.passos_descartados, function (x) { return [nome(x.ato), h('span', { key: 'd', className: 'muted' }, ' · ' + x.motivo)]; }),
      lista0('Votos que não ligámos a esta lei', q.votos_descartados, function (x) { return [nome(x.ato), h('span', { key: 'd', className: 'muted' }, ' · ' + x.fase + ', ' + curta(x.data))]; }));
  }

  // ---- About -------------------------------------------------------------------------------------
  function Sobre() {
    var r = useData(['index.json']);
    var when = r.data ? extenso(r.data[0].consultado_em) : '';
    document.title = tituloDe(['sobre']);
    return h('div', { className: 'stack prose' },
      h('h1', { className: 'title' }, 'Sobre os dados'),
      h('p', null, 'O texto de cada redação vem da legislação consolidada do Diário da República' + (when ? ', consultada a ' + when : '') + '. A ligação de cada lei à sua iniciativa e às votações vem dos dados abertos da Assembleia da República.'),
      h('h2', { className: 'h2', id: 'consolidado' }, 'Consolidado e republicação'),
      h('p', null, 'O texto que mostramos é o consolidado do Diário da República. O Diário da República atualiza este texto depois de cada alteração e guarda todas as redações de cada artigo. O consolidado não tem valor legal e pode ter erros.'),
      h('p', null, 'Uma republicação tem valor legal: é o texto completo de um diploma, publicado em anexo a uma lei que o alterou. Mas só existe quando a lei o exige (Lei n.º 74/98, artigo 6.º). Por isso, há poucas: a Constituição tem uma em cada revisão; o Código do IRC não tem nenhuma desde 2014.'),
      h('p', null, 'Usamos o consolidado porque é o único texto com todas as redações e as suas datas. Na Constituição, comparamos cada redação com as republicações e mostramos o resultado em cada artigo (', h('a', { href: '#/verificacao' }, 'Verificação'), '). Para aplicar a lei, confirme sempre o texto no Diário da República.'),
      h('h2', { className: 'h2' }, 'Como calculamos a origem do texto'),
      h('p', null, 'Comparamos cada redação com a redação anterior, palavra a palavra. Cada palavra que uma alteração acrescentou fica com a cor dessa alteração. As palavras que não mudaram mantêm a origem anterior.'),
      h('p', null, 'Quando uma alteração escreve de novo uma frase, marcamos a frase toda como alterada. Uma palavra curta que fica igual no meio da frase não divide a alteração em duas.'),
      h('h2', { className: 'h2' }, 'As três datas'),
      h('ul', null,
        h('li', null, h('strong', null, 'Publicação: '), 'o dia em que o ato saiu no Diário da República.'),
        h('li', null, h('strong', null, 'Entrada em vigor: '), 'o dia em que a redação começa a valer. Quando o Diário da República não indica esta data, avisamos e usamos a data de publicação.'),
        h('li', null, h('strong', null, 'Produção de efeitos: '), 'os factos ou os períodos a que a redação se aplica. O consolidado do Diário da República só tem esta informação em notas de texto. Mostramos as notas.')),
      h('h2', { className: 'h2' }, 'Limites conhecidos'),
      h('ul', { id: 'limites', tabIndex: -1 },
        h('li', null, 'O texto é o do consolidado do Diário da República, que não tem valor legal. Na Constituição, comparámos cada redação com as republicações oficiais (', h('a', { href: '#/verificacao' }, 'Verificação'), '). Nos outros diplomas, ainda não verificámos o texto.'),
        h('li', null, 'Algumas datas de entrada em vigor faltam no consolidado do Diário da República. Nos textos originais, indicamos a norma que fixa a data.'),
        h('li', null, 'Mostramos a primeira votação de cada iniciativa, na generalidade, e o resultado da votação final global. Também mostramos o veto, a decisão do Tribunal Constitucional e a confirmação, quando existem. Não mostramos as votações na especialidade.'),
        h('li', { id: 'votacoes' }, 'A Assembleia da República publica o sentido de voto de cada grupo e, em algumas votações, o número de deputados. Quando não tem o número, contamos pelos assentos de cada grupo nesse dia.')),
      h('h2', { className: 'h2', id: 'quem', tabIndex: -1 }, 'Quem fez cada lei'),
      h('ul', null,
        h('li', null, 'Lemos as datas e os nomes nas assinaturas de cada ato no Diário da República.'),
        h('li', null, 'O número do Governo e os partidos vêm de uma tabela que fizemos a partir de fontes oficiais.'),
        h('li', null, 'Comparamos a tabela com os nomes nas assinaturas.'),
        h('li', null, 'Quando um facto falta, dizemos porquê.')),
      h('h2', { className: 'h2', id: 'textos', tabIndex: -1 }, 'Histórias e glossário'),
      h('ul', null,
        h('li', null, 'Preparámos as histórias e as definições a partir dos dados do site, com ajuda de uma ferramenta automática.'),
        h('li', null, 'Cada facto tem uma ligação. Cada definição cita o texto da lei.'),
        h('li', null, 'Ainda não tiveram revisão jurídica externa.')));
  }

  // ---- App ---------------------------------------------------------------------------------------
  // ir=<id> (and #/sobre/<ancora>, #/glossario/<id>): scroll to an element and focus its heading,
  // once the page's data has loaded.
  function useIr(route) {
    var alvo = route.q.ir || ((route.segs[0] === 'sobre' || route.segs[0] === 'glossario') && route.segs[1]) || null;
    var chave = location.hash;
    useEffect(function () {
      if (!alvo) return;
      var n = 0, vivo = true;
      (function tentar() {
        if (!vivo) return;
        var e = document.getElementById(alvo);
        if (!e) { if (n++ < 100) setTimeout(tentar, 50); return; }
        var foco = /^(H[1-6]|FIGURE|LI)$/.test(e.tagName) ? e : e.querySelector('h1, h2, h3') || e;
        if (!foco.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(foco.tagName)) foco.setAttribute('tabindex', '-1');
        e.scrollIntoView({ block: 'start', behavior: 'auto' });
        foco.focus({ preventScroll: true });
      })();
      return function () { vivo = false; };
    }, [chave]);
  }
  function App() {
    var route = useRoute();
    useIr(route);
    // The glossary, for the marks on every page, and the phone sheet that shows one term.
    var rg = useData(['?glossario.json']);
    glossarioAtual = rg.data ? rg.data[0] : null;
    var ft = useState(null);
    abrirTermo = function (id, botao) { ft[1]({ id: id, botao: botao }); };
    var termo = ft[0] && glossarioAtual && glossarioAtual.termos ? glossarioAtual.termos[ft[0].id] : null;
    var folhaTermo = termo ? h(Folha, { id: 'folha-termo', aberta: true, titulo: termo.termo,
      onFechar: function () { var b = ft[0] && ft[0].botao; ft[1](null); if (b) setTimeout(function () { b.focus(); }, 0); } },
      h('div', { className: 'rd-termo-folha' }, h(R.TermoConteudo, { def: termo, id: ft[0].id, bloco: true }))) : null;
    var s = route.segs, view;
    if (s[0] === 'd' && s[1] && s[2] && s[3] === 'comparar') {
      // The compare page became the Alterações view of the article. Old links still work.
      var q = route.q, novo = link(['d', s[1], s[2]], { redacao: q.ate || q.ato || null, com: q.de || null, ver: 'mudou', lado: q.vista === 'lado' ? '1' : null, ato: q.ato || null });
      setTimeout(function () { substituir(novo); }, 0);
      return h(Shell, null, h(Loading, {}));
    }
    if (s[0] === 'd' && s[1] === 'codigo-civil-locacao') {
      // The Código Civil was only its locação chapter at first. Old links open the whole code.
      setTimeout(function () { substituir(link(['d', 'codigo-civil'].concat(s.slice(2)), route.q)); }, 0);
      return h(Shell, null, h(Loading, {}));
    }
    if (s[0] === 'd' && s[1] && s[2]) view = h(Artigo, { slug: s[1], id: s[2], q: route.q });
    else if (s[0] === 'd' && s[1]) view = h(Diploma, { slug: s[1], q: route.q });
    else if (s[0] === 'ato' && s[1]) view = h(Ato, { id: s[1], q: route.q });
    else if (s[0] === 'quem' && s[1]) view = h(Quem, { slug: s[1], q: route.q });
    else if (s[0] === 'grupos') view = h(Grupos);
    else if (s[0] === 'grupo' && s[1]) view = h(Grupo, { id: s[1], q: route.q });
    else if (s[0] === 'historias') view = h(Historias);
    else if (s[0] === 'historia' && s[1]) view = h(Historia, { slug: s[1] });
    else if (s[0] === 'glossario') view = h(Glossario);
    else if (s[0] === 'alteracoes' && s[1]) view = h(Mudancas, { slug: s[1], q: route.q });
    else if (s[0] === 'iniciativa' && s[1]) view = h(Iniciativa, { id: s[1] });
    else if (s[0] === 'sobre') view = h(Sobre);
    else if (s[0] === 'verificacao') view = h(Verificacao);
    else view = h(Home);
    // A new page fades in. Another redação of the same article does not: only its text moves.
    return h(Shell, { casa: !s.length }, h('div', { key: s.slice(0, s[0] === 'sobre' || s[0] === 'glossario' ? 1 : s.length).join('/'), className: 'vista' }, view), folhaTermo);
  }

  // Follow the reader's light or dark setting, unless the host page already chose a theme.
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() { if (root.hasAttribute('data-theme-auto')) root.setAttribute('data-theme', mq && mq.matches ? 'dark' : 'light'); }
  if (!root.hasAttribute('data-theme')) { root.setAttribute('data-theme-auto', ''); theme(); }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);

  window.RedacaoApp = { pick: pick, diff: diff, diffLines: diffLines, mudancas: mudancas, originModel: originModel, search: search, resolve: resolve, periodo: periodo, versionKey: versionKey,
    frasesQuem: frasesQuem, frasesProponentes: frasesProponentes, linhaPessoas: linhaPessoas, linhaVfg: linhaVfg, linhasEventos: linhasEventos, linhaAto: linhaAto,
    nomeGrupo: nomeGrupo, ordinalExtenso: ordinalExtenso, marcarTermos: marcarTermos, termosPara: termosPara, chavePartilha: chavePartilha, partilhaUrl: partilhaUrl,
    metaDiploma: metaDiploma, tituloDe: tituloDe, textoDe: textoDe, fraseOE: fraseOE, avisoTransitorias: avisoTransitorias, faixasLegislaturas: faixasLegislaturas,
    ledeGeneralidade: ledeGeneralidade, registo: registo, rotular: rotular, escolhida: escolhida, linhaFalta: linhaFalta, curtoAto: curtoAto };
  if (!window.Redacao) return;  // node tests load this file without the design system or a page
  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
