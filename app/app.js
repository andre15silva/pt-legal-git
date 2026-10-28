/* Redação: a version history of Portuguese law.
   A static app: data/ comes from pipeline/build.py, ds/ is the Redação design system. */
(function () {
  var h = React.createElement;
  var R = window.Redacao;
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;

  // ---- Data -------------------------------------------------------------------------------
  var cache = {};
  function load(path) {
    if (!cache[path]) {
      cache[path] = fetch('data/' + path).then(function (r) {
        if (!r.ok) throw new Error(path + ': ' + r.status);
        return r.json();
      });
    }
    return cache[path];
  }
  function useData(paths) {
    var key = paths.join('|');
    var st = useState({ key: null, data: null, error: null });
    useEffect(function () {
      var alive = true;
      Promise.all(paths.map(load)).then(function (d) { if (alive) st[1]({ key: key, data: d, error: null }); },
        function (e) { if (alive) st[1]({ key: key, data: null, error: e }); });
      return function () { alive = false; };
    }, [key]);
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
        if (path !== lastPath) window.scrollTo(0, 0);
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
    return art.versoes.map(function (v) { return v.ato; }).lastIndexOf(value);
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

  // Origin legend: the acts that wrote the words of one version, oldest first.
  // Colour 0 is the original text, 1–7 the amending acts. More than 7: the oldest share colour 7.
  // hrefOf(o): link to version o, or null. The note under the chips links to it.
  function originModel(art, vi, atos, hrefOf) {
    var v = art.versoes[vi];
    var used = {};
    v.linhas.forEach(function (l) { l.forEach(function (s) { used[s[0]] = true; }); });
    var order = Object.keys(used).map(Number).sort(function (a, b) { return a - b; });
    var color = {}, acts = [], amending = order.filter(function (o) { return art.versoes[o].tipo !== 'original'; });
    var extra = Math.max(0, amending.length - 7);
    order.forEach(function (o) {
      var ver = art.versoes[o], ato = atos[ver.ato] || { designacao: ver.ato };
      if (ver.tipo === 'original') {
        color[o] = 0;
        acts.push({ index: 0, versao: o, label: 'Texto original', date: ver.publicacao, href: o !== vi && hrefOf ? hrefOf(o) : null, hrefLabel: 'Ver o texto original' });
        return;
      }
      var k = amending.indexOf(o);
      if (k < extra + 1 && extra > 0) {
        color[o] = 7;
        if (k === 0) acts.push({ index: 7, label: 'Alterações anteriores (' + (extra + 1) + ')' });
        return;
      }
      color[o] = extra > 0 ? k - extra : k + 1;
      acts.push({ index: color[o], versao: o, label: ato.designacao, date: ver.publicacao, href: o !== vi && hrefOf ? hrefOf(o) : null, hrefLabel: 'Ver a redação dada por esta alteração' });
    });
    acts.sort(function (a, b) { return a.index === 0 ? -1 : b.index === 0 ? 1 : (a.date || '') < (b.date || '') ? -1 : 1; });
    var paragraphs = v.linhas.map(function (l) {
      return { spans: l.map(function (s) { return { text: s[1], act: color[s[0]] }; }) };
    });
    return { acts: acts, paragraphs: paragraphs };
  }

  // ---- Word diff (Myers) for comparing any two versions -------------------------------------
  var TOK = /\n|\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
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
        var short = semantic && p.del && p.ins && n.del && n.ins &&
          size <= Math.max(p.del.length, p.ins.length) && size <= Math.max(n.del.length, n.ins.length);
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
  function diffLines(a, b) {
    var lines = [[]];
    diff(a, b).forEach(function (s) {
      s.text.split('\n').forEach(function (part, i) {
        if (i) lines.push([]);
        if (part) lines[lines.length - 1].push({ op: s.op, text: part });
      });
    });
    return lines.filter(function (l) { return l.length; });
  }

  // ---- Shared pieces ---------------------------------------------------------------------
  function Shell(props) {
    return h('div', { className: 'shell' },
      h('a', { className: 'skip', href: '#conteudo' }, 'Saltar para o conteúdo'),
      h('header', { className: 'top' },
        h('div', { className: 'top-in' },
          h('a', { className: 'brand', href: '#/' }, 'Redação'),
          h('nav', { 'aria-label': 'Principal', className: 'top-nav' },
            h('a', { href: '#/' }, 'Diplomas'),
            h('a', { href: '#/sobre' }, 'Sobre os dados')))),
      h('main', { id: 'conteudo', className: 'page' }, props.children),
      h('footer', { className: 'foot' },
        h('div', { className: 'foot-in' },
          h('p', null, h('strong', null, 'Texto não oficial. Só a publicação no Diário da República faz fé.')),
          h('p', null, 'Fontes: Diário da República (legislação consolidada) e Assembleia da República (dados abertos). Esta página não é aconselhamento jurídico.'))));
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

  // ---- Home ---------------------------------------------------------------------------------
  var SIGLAS = { crp: 'constituicao', constituicao: 'constituicao', 'constituição': 'constituicao', ct: 'codigo-do-trabalho', trabalho: 'codigo-do-trabalho',
    circ: 'codigo-irc', irc: 'codigo-irc', nrau: 'nrau', arrendamento: 'nrau', rendas: 'nrau' };
  function fold(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function search(index, q) {
    var words = fold(q).replace(/[º.]/g, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var diploma = null, num = null, rest = [];
    words.forEach(function (w) {
      if (SIGLAS[w]) diploma = SIGLAS[w];
      else if (/^\d+(-[a-z])?$/.test(w)) num = w;
      else if (!/^(art|artigo|do|da|de|o|a|n)$/.test(w)) rest.push(w);
    });
    return index.pesquisa.filter(function (r) {
      if (diploma && r[0] !== diploma) return false;
      if (num && fold(r[2]).replace(/[º.]/g, '').replace(/\s+/g, ' ').trim() !== 'artigo ' + num) return false;
      var e = fold(r[3]);
      return rest.every(function (w) { return e.indexOf(w) >= 0; });
    }).slice(0, 30);
  }
  function Home() {
    var r = useData(['index.json', 'atos.json']);
    var qs = useState('');
    if (!r.data) return h(Loading, { error: r.error });
    var index = r.data[0], atos = r.data[1];
    var nomes = {};
    index.diplomas.forEach(function (d) { nomes[d.slug] = d; });
    var results = search(index, qs[0]);
    var recent = Object.keys(atos).map(function (k) { return atos[k]; })
      .filter(function (a) { return a.alteracoes.length; })
      .sort(function (a, b) { return (b.publicacao || '') < (a.publicacao || '') ? -1 : 1; }).slice(0, 8);
    return h('div', { className: 'stack' },
      h('section', { className: 'intro' },
        h('h1', { className: 'display' }, 'A história de cada artigo da lei portuguesa'),
        h('p', { className: 'lead' }, 'Veja o texto de um artigo em qualquer data, compare redações e veja que lei escreveu cada frase.'),
        h('form', { role: 'search', className: 'search', onSubmit: function (e) { e.preventDefault(); } },
          h('label', { htmlFor: 'q', className: 'search-label' }, 'Pesquisar um artigo'),
          h('input', { id: 'q', type: 'search', className: 'rd-input search-input', value: qs[0], autoComplete: 'off',
            placeholder: 'Por exemplo: «art 87 circ», «licença parental», «crp 1»', onChange: function (e) { qs[1](e.target.value); } })),
        qs[0] ? h('section', { 'aria-live': 'polite', className: 'results' },
          h('p', { className: 'muted' }, results.length ? results.length + (results.length === 1 ? ' artigo encontrado' : ' artigos encontrados') : 'Não encontrámos artigos. Escreva o número do artigo e a sigla do diploma (CRP, CT, CIRC, NRAU) ou uma palavra da epígrafe.'),
          h('ul', { className: 'list' }, results.map(function (x) {
            return h('li', { key: x[0] + x[1] }, h('a', { href: link(['d', x[0], x[1]]) }, h('strong', null, x[2]), x[3] ? ' ' + x[3] : ''),
              h('span', { className: 'muted' }, ' · ' + nomes[x[0]].sigla), x[4] === 'revogado' ? h(R.StatusPill, { status: 'revogado' }) : null);
          }))) : null),
      h('div', { className: 'cols' },
        h('section', { className: 'col-main', 'aria-labelledby': 'dipl' },
          h('h2', { id: 'dipl', className: 'h2' }, 'Diplomas'),
          h('ul', { className: 'cards' }, index.diplomas.map(function (d) {
            return h('li', { key: d.slug, className: 'card' },
              h('a', { className: 'card-title', href: link(['d', d.slug]) }, d.titulo),
              h('p', { className: 'muted' }, d.designacao + ' · publicação: ' + extenso(d.publicacao)),
              h('p', null, d.n_artigos + ' artigos · ' + d.n_atos + ' atos alteraram este diploma'));
          }))),
        h('section', { className: 'col-side', 'aria-labelledby': 'rec' },
          h('h2', { id: 'rec', className: 'h2' }, 'Alterações mais recentes'),
          h('ol', { className: 'list' }, recent.map(function (a) {
            var ds = {};
            a.alteracoes.forEach(function (c) { ds[c.diploma] = (ds[c.diploma] || 0) + 1; });
            return h('li', { key: a.id }, h('a', { href: link(['ato', a.id]) }, a.designacao),
              h('span', { className: 'muted' }, ' · ' + curta(a.publicacao) + ' · ' + Object.keys(ds).map(function (k) { return nomes[k].sigla + ' (' + ds[k] + ')'; }).join(', ')));
          })))));
  }

  // ---- Diploma -------------------------------------------------------------------------------
  function Diploma(props) {
    var r = useData(['d/' + props.slug + '.json', 'atos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var d = r.data[0], atos = r.data[1];
    var em = validDate(props.q.em), base = props.q.base;
    var acts = Object.keys(atos).map(function (k) { return atos[k]; })
      .filter(function (a) { return a.alteracoes.some(function (c) { return c.diploma === d.slug; }); })
      .sort(function (a, b) { return (b.publicacao || '') < (a.publicacao || '') ? -1 : 1; });
    return h('div', { className: 'stack' },
      h(Crumbs, { items: [['Diplomas', '#/'], [d.titulo]] }),
      em ? h('div', { className: 'note note-data', role: 'region', 'aria-label': 'Data escolhida' },
        h('p', null, 'Os artigos abrem como estavam a ', h('strong', null, extenso(em)), '. ', h('a', { href: link(['d', d.slug]) }, 'Voltar a hoje'))) : null,
      h('div', { className: 'title-block' },
        h('p', { className: 'eyebrow' }, d.designacao + ' · ' + d.sigla),
        h('h1', { className: 'display' }, d.titulo),
        d.sumario ? h('p', { className: 'lead' }, d.sumario) : null,
        h('p', { className: 'muted' }, 'Publicação: ' + extenso(d.publicacao) + (d.vigor_original ? ' · Entrada em vigor: ' + extenso(d.vigor_original.data) + ' (' + d.vigor_original.fonte + ')' : '')),
        d.link ? h('p', null, h('a', { href: d.link, target: '_blank', rel: 'noopener' }, 'Ver o diploma no Diário da República')) : null),
      h('div', { className: 'cols' },
        h('nav', { className: 'col-main toc', 'aria-label': 'Índice' },
          h('h2', { className: 'h2' }, 'Índice'),
          h('ul', { className: 'toc-list' }, d.arvore.map(function (n, i) {
            var pad = { paddingLeft: Math.max(0, n.nivel - 1) * 16 + 'px' };
            if (n.tipo !== 'artigo') return h('li', { key: i, className: 'toc-div', style: pad }, n.rotulo, n.epigrafe ? ' — ' + n.epigrafe : '');
            return h('li', { key: i, style: pad, className: n.estado === 'revogado' ? 'toc-rev' : '' },
              h('a', { href: link(['d', d.slug, n.artigo], { em: em, base: base }) }, n.rotulo, n.epigrafe ? ' ' + n.epigrafe : ''),
              n.n > 1 ? h('span', { className: 'muted' }, ' · ' + n.n + ' redações') : null,
              n.estado === 'revogado' ? ' ' : null, n.estado === 'revogado' ? h(R.StatusPill, { status: 'revogado' }) : null);
          }))),
        h('section', { className: 'col-side', 'aria-labelledby': 'alt' },
          h('h2', { id: 'alt', className: 'h2' }, 'Atos que alteraram este diploma'),
          h('p', { className: 'muted' }, acts.length + ' atos, do mais recente para o mais antigo.'),
          h('ol', { className: 'list' }, acts.map(function (a) {
            var n = a.alteracoes.filter(function (c) { return c.diploma === d.slug; }).length;
            return h('li', { key: a.id }, h('a', { href: link(['ato', a.id]) }, a.designacao),
              h('span', { className: 'muted' }, ' · ' + curta(a.publicacao) + ' · ' + n + (n === 1 ? ' artigo' : ' artigos')));
          })))));
  }

  // ---- Article --------------------------------------------------------------------------------
  // What the text box shows. The choice stays in the URL (ver=) and in this browser.
  var VER = [['texto', 'Texto'], ['mudou', 'O que mudou'], ['origem', 'Origem das palavras']];
  function verGuardado() { try { return localStorage.getItem('redacao-ver'); } catch (e) { return null; } }
  function guardarVer(v) { try { localStorage.setItem('redacao-ver', v); } catch (e) { /* private window */ } }
  function nomeAto(v, atos) { return v.tipo === 'original' ? 'Texto original' : (atos[v.ato] || { designacao: v.ato }).designacao; }
  function intervalo(art, i, base, hojeIdx) {
    var v = art.versoes[i], p = periodo(art, i, base), desde = extenso(p.inicio);
    var semVigor = base !== 'publicacao' && !v.vigor ? ' (data de publicação)' : '';
    if (hojeIdx == null || i > hojeIdx) return 'entra em vigor a ' + desde;
    if (p.fim === 'mesma') return 'começou a ' + desde + ', a mesma data da redação seguinte';
    if (!p.fim || i === hojeIdx) return 'em vigor desde ' + desde + semVigor;
    return 'em vigor de ' + desde + semVigor + ' a ' + extenso(p.fim);
  }
  function Artigo(props) {
    var r = useData(['d/' + props.slug + '.json', 'atos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var d = r.data[0], atos = r.data[1], q = props.q;
    var art = d.artigos[props.id];
    if (!art) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos este artigo. Volte ao índice do diploma.'), h('a', { href: link(['d', d.slug]) }, d.titulo));
    var n = art.versoes.length, last = n - 1;
    var base = { vigor: 1, efeitos: 1, publicacao: 1 }[q.base] ? q.base : 'vigor';
    // redacao= opens one redação (by act id, or index in old links) even when the next one starts
    // on the same date. Without it, the date chooses. Without a date, the lens shows the start
    // of the redação on screen.
    var ri = resolve(art, q.redacao, base);
    var date = validDate(q.em) || (ri >= 0 ? startOf(art.versoes[ri], base) : hoje());
    var porData = pick(art.versoes, date, base);
    var sel = ri >= 0 ? { i: ri, incerta: base !== 'publicacao' && !art.versoes[ri].vigor } : porData;
    var hojeSel = pick(art.versoes, hoje(), 'vigor'), hojeIdx = hojeSel ? hojeSel.i : null;
    var ver = { texto: 1, mudou: 1, origem: 1 }[q.ver] ? q.ver : ({ texto: 1, mudou: 1, origem: 1 }[verGuardado()] ? verGuardado() : 'texto');
    function versionHref(i, extra) {
      var v = art.versoes[i];
      return link(['d', d.slug, art.id], Object.assign({ em: startOf(v, base), base: base !== 'vigor' ? base : null, redacao: versionKey(art, i), ver: q.ver }, extra || {}));
    }
    function compareHref(a, b) { return link(['d', d.slug, art.id, 'comparar'], { de: versionKey(art, a), ate: versionKey(art, b) }); }
    var go = function (o) { location.hash = link(['d', d.slug, art.id], { em: o.date, base: o.basis !== 'vigor' ? o.basis : null, ver: q.ver }); };
    var up = pending(art.versoes, date);
    var cur = sel ? art.versoes[sel.i] : null;
    var curAto = cur ? atos[cur.ato] : null;
    var titulo = art.rotulo + (art.epigrafe ? (/^\(/.test(art.epigrafe) ? ' ' : ' — ') + art.epigrafe : '');
    document.title = art.rotulo + ' ' + d.sigla + (cur ? ', redação de ' + abrev(startOf(cur, base)) : '') + ' · Redação';
    var notas = art.notas || [];
    // Notes from the act that wrote the redação shown: a transitional norm or a later date of effect.
    var transitorias = cur && cur.tipo !== 'original' ? notas.filter(function (x) { return x.ato && x.ato === cur.ato; }) : [];
    var passada = sel && hojeIdx != null && sel.i < hojeIdx;
    var futura = sel && (hojeIdx == null || sel.i > hojeIdx);
    var per = sel ? periodo(art, sel.i, base) : null;
    var pill = !cur ? h(R.StatusPill, { status: 'futuro' }, 'Sem texto nesta data')
      : futura ? h(R.StatusPill, { status: 'futuro' }, 'Entra em vigor a ' + extenso(per.inicio))
      : passada ? h(R.StatusPill, { status: 'historico' }, per.fim && per.fim !== 'mesma' ? 'Em vigor de ' + extenso(per.inicio) + ' a ' + extenso(per.fim) : 'Já não está em vigor')
      : cur.tipo === 'revogado' ? h(R.StatusPill, { status: 'revogado' }, 'Revogado desde ' + extenso(per.inicio))
      : h(R.StatusPill, { status: 'vigor' }, 'Em vigor desde ' + extenso(per.inicio));
    var anterior = sel && sel.i > 0 ? art.versoes[sel.i - 1] : null;
    var diferente = anterior && cur.tipo === 'alterado' && semelhanca(d.slug + '/' + art.id + '/' + sel.i, texto(anterior), texto(cur)) < DIFERENTE;
    var citacao = cur ? 'Artigo ' + art.rotulo.replace(/^Artigo\s*/, '') + ' ' + (d.genitivo || 'de ' + d.titulo) + ', ' +
      (cur.tipo === 'original' ? 'na redação original' : 'na redação dada ' + pela(curAto ? curAto.designacao : '') + ' ' + (curAto ? curAto.designacao : cur.ato) +
        (cur.publicacao ? ', de ' + semAno(cur.publicacao) : '')) + '.' : '';
    // Neighbouring articles in the diploma, at the same date.
    var ordem = d.arvore.filter(function (x) { return x.tipo === 'artigo'; });
    var pos = ordem.map(function (x) { return x.artigo; }).indexOf(art.id);
    var vizinho = function (k) { var x = ordem[pos + k]; return x ? h('a', { href: link(['d', d.slug, x.artigo], { em: q.em, base: q.base }) }, (k < 0 ? '‹ ' : '') + x.rotulo + (k > 0 ? ' ›' : '')) : null; };
    var corpo;
    if (cur && ver === 'origem') {
      var model = originModel(art, sel.i, atos, function (o) { return versionHref(o); });
      model.acts.forEach(function (a) { var o = a.versao; if (o > 0) { a.diffHref = compareHref(o - 1, o); a.beforeHref = versionHref(o - 1); } });
      corpo = h(R.TextOrigin, { key: art.id + sel.i, paragraphs: model.paragraphs, acts: model.acts });
    } else if (cur && ver === 'mudou' && anterior) {
      var linhas = diffLines(texto(anterior), texto(cur));
      var nm = linhas.reduce(function (c, l) { return c + l.filter(function (s, k) { return s.op !== 'eq' && !(s.op === 'ins' && k && l[k - 1].op === 'del'); }).length; }, 0);
      corpo = h('div', { className: 'stack-s' },
        h('p', { className: 'muted small' }, (nm === 1 ? '1 alteração' : nm + ' alterações') + ' em relação à redação ' + sel.i + ' (' + nomeAto(anterior, atos) + '). ',
          h('ins', { className: 'rd-ins' }, 'acrescentado'), ' ', h('del', { className: 'rd-del' }, 'eliminado')),
        linhas.map(function (l, k) { return h(R.Redline, { key: sel.i + '-' + k, segments: l, mode: 'inline', legend: false }); }));
    } else if (cur) {
      corpo = h('div', { className: 'stack-s' },
        ver === 'mudou' ? h('p', { className: 'muted small' }, 'Esta é a primeira redação. Não há uma redação anterior para comparar.') : null,
        texto(cur).split('\n').map(function (t, k) { return h('p', { key: k, className: 'rd-statute' }, t); }));
    }
    return h('div', { className: 'stack artigo' },
      h(Crumbs, { items: [['Diplomas', '#/'], [d.sigla, link(['d', d.slug], { em: q.em, base: q.base })]].concat(art.caminho.slice(-1).map(function (c) { return [c]; })).concat([[art.rotulo]]) }),
      h('div', { className: 'title-row' },
        h('div', { className: 'title-block' },
          h('p', { className: 'eyebrow' }, d.titulo),
          h('h1', { className: 'title' }, titulo),
          h('div', { className: 'pills' }, pill, h('span', { className: 'muted' }, n + (n === 1 ? ' redação' : ' redações')))),
        h('div', { className: 'actions-col' },
          n > 1 ? h('a', { className: 'btn btn-primary', href: compareHref(sel && sel.i > 0 ? sel.i - 1 : 0, sel ? sel.i : last) }, 'Comparar redações') : null,
          h('nav', { className: 'vizinhos small', 'aria-label': 'Artigos vizinhos' }, vizinho(-1), vizinho(1)))),
      sel ? h(R.VersionBar, {
        id: 'barra', current: sel.i, today: hoje(),
        versions: art.versoes.map(function (v, i) {
          return { start: startOf(v, base), technical: v.tipo === 'retificado', pending: hojeIdx == null || i > hojeIdx,
            label: 'Redação ' + (i + 1) + ' de ' + n + ': ' + nomeAto(v, atos) + ', ' + intervalo(art, i, base, hojeIdx) };
        }),
        status: h(React.Fragment, null,
          h('span', { className: 'vb-longo' }, h('strong', null, 'Redação ' + (sel.i + 1) + ' de ' + n), ' · ' + nomeAto(cur, atos) + ' · ', h('span', { className: 'muted' }, intervalo(art, sel.i, base, hojeIdx))),
          h('span', { className: 'vb-curto', 'aria-hidden': 'true' }, h('strong', null, (sel.i + 1) + ' de ' + n + ' · ' + nomeAto(cur, atos)), h('br'),
            h('span', { className: 'muted' }, per.fim && per.fim !== 'mesma' ? per.inicio.slice(0, 4) + ' a ' + per.fim.slice(0, 4) : (passada ? per.inicio.slice(0, 4) : 'desde ' + per.inicio.slice(0, 4))))),
        onGo: function (k) { location.hash = versionHref(k); },
        onList: function () { var e = document.getElementById('historia'); if (e) { e.scrollIntoView(); e.focus(); } }
      }) : null,
      h(R.DateLens, { date: date, basis: base, today: hoje(), id: 'lente', onChange: go }),
      h('div', { className: 'cols cols-3' },
        h('div', { className: 'col-main stack' },
          passada ? h('aside', { className: 'note note-aviso' },
            h('p', null, h('strong', null, 'Nota: '), 'esta não é a redação em vigor hoje. ',
              per.fim === 'mesma' ? 'A redação seguinte começou na mesma data. Por isso, esta redação não aparece quando escolhe só a data. ' : 'Esteve em vigor até ' + extenso(per.fim) + '. ',
              h('a', { href: link(['d', d.slug, art.id], { ver: q.ver }) }, 'Ver a redação em vigor hoje'))) : null,
          futura && cur ? h('aside', { className: 'note note-info' },
            h('p', null, h('strong', null, 'Nota: '), 'esta redação ainda não está em vigor. Entra em vigor a ' + extenso(per.inicio) + '. ',
              hojeIdx != null ? h('a', { href: link(['d', d.slug, art.id], { ver: q.ver }) }, 'Ver a redação em vigor hoje') : null)) : null,
          transitorias.length ? h('aside', { className: 'note note-aviso note-forte', 'aria-labelledby': 'transit' },
            h('p', { id: 'transit' }, h('strong', null, 'Atenção: '), 'o ato que escreveu esta redação tem uma norma que muda a forma como ela se aplica. Leia a norma antes de aplicar o texto.'),
            transitorias.map(function (x, k) {
              return h('div', { key: k, className: 'transit' },
                h('p', { 'data-citacao': '' }, x.texto),
                h('p', { className: 'muted small' }, 'Fonte: ', h(ActLink, { id: x.ato, atos: atos }), x.artigo_do_ato ? ', ' + x.artigo_do_ato.toLowerCase() : ''));
            })) : null,
          up.length ? h('aside', { className: 'note note-info' },
            h('p', null, h('strong', null, 'Nota: '), 'nesta data já está publicada uma alteração que ainda não está em vigor. ',
              up.map(function (v, i) { return h('span', { key: i }, h(ActLink, { id: v.ato, atos: atos }), ' entra em vigor a ' + extenso(v.vigor) + '. '); }))) : null,
          sel && sel.incerta ? h('aside', { className: 'note note-aviso' },
            h('p', null, h('strong', null, 'Atenção: '), 'o Diário da República não indica a data de entrada em vigor desta redação. Mostramos a redação a partir da data de publicação (' + extenso(cur.publicacao) + ').' + (cur.vigor_regra === 'condicional' ? ' A entrada em vigor depende de outra legislação (' + cur.vigor_fonte + ').' : ''))) : null,
          base === 'efeitos' ? h('aside', { className: 'note note-aviso' },
            h('p', null, h('strong', null, 'Atenção: '), 'o consolidado do Diário da República não tem as datas de produção de efeitos em formato estruturado. Mostramos a redação em vigor nesta data. Leia as notas e o ato que alterou o artigo.')) : null,
          diferente ? h('aside', { className: 'note note-aviso' },
            h('p', null, h('strong', null, 'Nota: '), 'esta redação tem um texto muito diferente da redação anterior. O artigo pode ter mudado de número numa revisão. Por isso, a comparação pode juntar dois artigos diferentes.')) : null,
          !cur ? h('div', { className: 'state' }, h('p', null, 'Nesta data o artigo ainda não existia ou ainda não estava em vigor.'),
            h('p', null, 'A primeira redação é de ' + extenso(art.versoes[0].publicacao) + '. ', h('a', { href: versionHref(0) }, 'Ver a primeira redação'))) :
            h('article', { className: 'statute-box', 'aria-label': titulo },
              h('div', { className: 'statute-head' },
                h('h2', { className: 'article-h' }, art.rotulo, h('span', { className: 'muted' }, art.epigrafe ? ' ' + art.epigrafe.replace(/^\((.*)\)$/, '$1') : ''),
                  sel.i !== last && art.epigrafe ? h('span', { className: 'muted small' }, ' (epígrafe atual)') : null),
                h('div', { role: 'group', 'aria-label': 'Mostrar', className: 'seg seg-s' }, VER.map(function (m) {
                  return h('button', { key: m[0], type: 'button', className: 'seg-btn' + (ver === m[0] ? ' is-on' : ''), 'aria-pressed': ver === m[0],
                    onClick: function () { guardarVer(m[0]); location.hash = link(['d', d.slug, art.id], Object.assign({}, q, { ver: m[0] })); } }, m[1]);
                }))),
              corpo),
          notas.length ? h('section', { className: 'notes', 'aria-labelledby': 'notas' },
            h('h2', { id: 'notas', className: 'h3' }, 'Notas sobre este artigo'),
            h('ul', { className: 'list' }, notas.map(function (x, i) {
              return h('li', { key: i }, h('p', null, x.texto), h('p', { className: 'muted small' }, 'Fonte: ', x.ato ? h(ActLink, { id: x.ato, atos: atos }) : x.fonte, x.ato && x.artigo_do_ato ? ', ' + x.artigo_do_ato.toLowerCase() : ''));
            }))) : null,
          cur ? h(R.SourceNote, { source: curAto && curAto.link ? { href: curAto.link, label: 'Ver ' + curAto.designacao + ' no Diário da República' } : (d.link ? { href: d.link, label: 'Ver o diploma no Diário da República' } : null), verification: 'nao-verificado' },
            'Texto do consolidado do Diário da República. Ainda não verificamos este texto com uma reprodução própria.') : null,
          cur ? h(R.Citation, { key: citacao, text: citacao, permalink: location.href.split('#')[0] + versionHref(sel.i, { ver: null }) }) : null),
        h('aside', { className: 'col-side stack', 'aria-labelledby': 'historia' },
          h('h2', { className: 'h3', id: 'historia', tabIndex: -1 }, 'História deste artigo'),
          h(R.VersionTimeline, { current: sel ? 'v' + sel.i : null, inForceToday: hojeIdx != null ? 'v' + hojeIdx : null, label: 'Redações do ' + art.rotulo.replace('Artigo', 'artigo'),
            versions: art.versoes.map(function (v, i) {
              var a = atos[v.ato] || { designacao: v.ato }, p = periodo(art, i, 'vigor');
              return { id: 'v' + i, title: v.tipo === 'original' ? 'Texto original' : TIPO[v.tipo] + ' ' + pela(a.designacao) + ' ' + a.designacao,
                href: versionHref(i),
                act: [v.artigo_do_ato ? 'Norma: ' + v.artigo_do_ato.toLowerCase() + ' ' + (pela(a.designacao) === 'pelo' ? 'do ' : 'da ') + a.designacao : null, v.vigor ? null : 'Entrada em vigor não indicada'].filter(Boolean).join(' · '),
                published: v.publicacao, inForce: v.vigor, until: v.vigor && p.fim ? (p.fim === 'mesma' ? v.vigor : p.fim) : null, technical: v.tipo === 'retificado',
                links: [i > 0 ? { href: compareHref(i - 1, i), label: 'Ver a alteração' } : null, v.tipo !== 'original' && atos[v.ato] ? { href: link(['ato', v.ato]), label: 'Ver o ato' } : null].filter(Boolean) };
            }) }))));
  }

  // ---- Compare --------------------------------------------------------------------------------
  // de and ate take an act id, a date, "hoje" or an index (old links). modo and vista stay in the URL.
  var MODOS = [['marcadas', 'inline', 'Alterações marcadas'], ['nova', 'final', 'Só a redação nova'], ['anterior', 'previous', 'Só a redação anterior']];
  var VISTAS = [['texto', 'No texto'], ['lado', 'Lado a lado']];
  // "n.º 3", "alínea b) do n.º 4": where an unchanged run starts and ends.
  function ondeLinha(t, numero) {
    var m = /^(\d+(?:\.\d+)*(?:-[A-Z])?) — /.exec(t);
    if (m) return { numero: m[1], de: 'do n.º ' + m[1], a: 'ao n.º ' + m[1] };
    m = /^([a-z]+)\) /.exec(t);
    var al = 'alínea ' + (m ? m[1] + ')' : '') + (numero ? ' do n.º ' + numero : '');
    if (m) return { numero: numero, de: 'da ' + al, a: 'à ' + al };
    return { numero: numero, de: 'do parágrafo', a: 'ao parágrafo' };
  }
  function Comparar(props) {
    var r = useData(['d/' + props.slug + '.json', 'atos.json']);
    var ab = useState({});      // unchanged runs the reader opened
    var df = useState(0);       // the difference in focus
    var cp = useState(false);   // copied
    if (!r.data) return h(Loading, { error: r.error });
    var d = r.data[0], atos = r.data[1], art = d.artigos[props.id], q = props.q;
    if (!art) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos este artigo.'));
    var n = art.versoes.length;
    var ate = resolve(art, q.ate), de = resolve(art, q.de);
    if (ate < 0) ate = n - 1;
    if (de < 0) de = Math.max(0, ate - 1);
    var ato = q.ato && atos[q.ato] ? atos[q.ato] : null;
    if (ato && !q.de && !q.ate) {  // "ver a alteração" from an act: the redação it made against the one before
      var vi = art.versoes.map(function (v) { return v.ato; }).lastIndexOf(q.ato);
      if (vi >= 0) { ate = vi; de = Math.max(0, vi - 1); }
    }
    var modo = MODOS.filter(function (m) { return m[0] === q.modo; })[0] || MODOS[0];
    var vista = q.vista === 'lado' ? 'lado' : 'texto';
    function href(o) {
      return link(['d', d.slug, art.id, 'comparar'], Object.assign({ de: versionKey(art, de), ate: versionKey(art, ate), modo: q.modo, vista: q.vista, ato: q.ato }, o));
    }
    function nome(i) { return 'a redação ' + (i + 1) + ' (' + nomeAto(art.versoes[i], atos) + ')'; }
    var label = function (v, i) {
      var p = periodo(art, i, 'vigor');
      return (i + 1) + ' · ' + nomeAto(v, atos) + ' · ' + curta(p.inicio) + (p.fim === null ? ' até hoje' : p.fim === 'mesma' ? '' : ' a ' + curta(p.fim));
    };
    var antes = texto(art.versoes[de]), depois = texto(art.versoes[ate]);
    var lines = diffLines(antes, depois);
    // Unchanged runs of two or more paragraphs fold into one line the reader can open.
    var blocos = [], corrida = null, numero = '', nd = 0;
    function fechar() {
      if (!corrida) return;
      var id = corrida.id;
      if (corrida.linhas.length < 2 || ab[0][id]) corrida.linhas.forEach(function (b) { blocos.push(b); });
      else blocos.push({ dobra: true, id: id, texto: corrida.linhas.length + ' parágrafos sem alterações, ' + corrida.de + ' ' + corrida.a + '.' });
      corrida = null;
    }
    lines.forEach(function (l, j) {
      var t = l.map(function (s) { return s.text; }).join('');
      var w = ondeLinha(t, numero);
      numero = w.numero;
      if (l.some(function (s) { return s.op !== 'eq'; })) {
        fechar();
        blocos.push({ linha: l, dif: nd++, id: 'l' + j });
      } else {
        if (!corrida) corrida = { id: 'd' + j + '-' + de + '-' + ate, linhas: [], de: w.de, a: w.a };
        corrida.linhas.push({ linha: l, id: 'l' + j });
        corrida.a = w.a;
      }
    });
    fechar();
    var foco = Math.min(df[0], Math.max(0, nd - 1));
    function irDif(k) {
      df[1](k);
      setTimeout(function () { var e = document.getElementById('dif-' + k); if (e) { e.focus(); e.scrollIntoView({ block: 'center' }); } }, 0);
    }
    var diferente = de !== ate && semelhanca(d.slug + '/' + art.id + '/' + de + '-' + ate, antes, depois) < DIFERENTE;
    var lo = Math.min(de, ate), hi = Math.max(de, ate);
    var seg = function (items, on, key) {
      return items.map(function (m) {
        var o = {}; o[key] = m[0];
        return h('a', { key: m[0], className: 'seg-btn' + (on === m[0] ? ' is-on' : ''), 'aria-current': on === m[0] ? 'true' : undefined, href: href(o) }, m[m.length - 1]);
      });
    };
    var segs = function (l, op) { return l.filter(function (s) { return s.op !== op; }); };
    // Position of this article among the articles the act changed, for "artigo seguinte deste ato".
    var noAto = ato ? ato.alteracoes.filter(function (c) { return c.diploma === d.slug; }) : [];
    var k = noAto.map(function (c) { return c.artigo; }).indexOf(art.id);
    var doAto = function (j, txt) { var c = noAto[j]; return c ? h('a', { href: link(['d', d.slug, c.artigo, 'comparar'], { ato: ato.id }) }, txt) : null; };
    return h('div', { className: 'stack' },
      h(Crumbs, { items: [['Diplomas', '#/'], [d.sigla, link(['d', d.slug])], [art.rotulo, link(['d', d.slug, art.id])], ['Comparar redações']] }),
      ato && k >= 0 ? h('nav', { className: 'note note-ato', 'aria-label': 'Artigos alterados por este ato' },
        h('p', null, 'Alteração feita ' + pela(ato.designacao) + ' ', h(ActLink, { id: ato.id, atos: atos }), ' · artigo ' + (k + 1) + ' de ' + noAto.length + ' deste ato no ' + d.sigla + '.'),
        h('p', { className: 'links' }, doAto(k - 1, '‹ Artigo anterior deste ato'), doAto(k + 1, 'Artigo seguinte deste ato ›'), h('a', { href: link(['ato', ato.id]) }, 'Voltar ao ato'))) : null,
      h('div', { className: 'title-block' },
        h('p', { className: 'eyebrow' }, 'Comparar redações · ' + d.titulo),
        h('h1', { className: 'title' }, art.rotulo + (art.epigrafe ? ' ' + art.epigrafe : ''))),
      h('form', { className: 'compare-form', onSubmit: function (e) { e.preventDefault(); }, 'aria-label': 'Escolher as redações' },
        h('div', { className: 'compare-pair' },
          h('div', { className: 'field' }, h('label', { htmlFor: 'de' }, 'Antes'),
            h('select', { id: 'de', className: 'rd-input', value: de, onChange: function (e) { location.hash = href({ de: versionKey(art, +e.target.value), ato: null }); } },
              art.versoes.map(function (v, i) { return h('option', { key: i, value: i }, label(v, i)); }))),
          h('button', { type: 'button', className: 'btn', 'aria-label': 'Trocar as duas redações', onClick: function () { location.hash = href({ de: versionKey(art, ate), ate: versionKey(art, de), ato: null }); } }, '⇄ Trocar'),
          h('div', { className: 'field' }, h('label', { htmlFor: 'ate' }, 'Depois'),
            h('select', { id: 'ate', className: 'rd-input', value: ate, onChange: function (e) { location.hash = href({ ate: versionKey(art, +e.target.value), ato: null }); } },
              art.versoes.map(function (v, i) { return h('option', { key: i, value: i }, label(v, i)); })))),
        de > ate ? h('p', { className: 'aviso-txt' }, h('strong', null, 'Nota: '), 'a redação «Antes» é mais recente do que a redação «Depois».') : null,
        h('div', { className: 'compare-tools' },
          h('div', { className: 'actions' },
            ate >= 2 ? h('a', { className: 'btn', href: href({ de: versionKey(art, ate - 2), ate: versionKey(art, ate - 1), ato: null }) }, '‹ Alteração anterior') : null,
            ate < n - 1 ? h('a', { className: 'btn', href: href({ de: versionKey(art, ate), ate: versionKey(art, ate + 1), ato: null }) }, 'Alteração seguinte ›') : null),
          h('nav', { 'aria-label': 'Disposição', className: 'seg' }, seg(VISTAS, vista, 'vista')),
          h('nav', { 'aria-label': 'Modo de leitura', className: 'seg' }, seg(MODOS, modo[0], 'modo')))),
      diferente ? h('aside', { className: 'note note-aviso' }, h('p', null, h('strong', null, 'Nota: '), 'as duas redações têm textos muito diferentes. O artigo pode ter mudado de número numa revisão. Por isso, a comparação pode juntar dois artigos diferentes.')) : null,
      h('div', { className: 'cols' },
        h('div', { className: 'col-main stack-s' },
          h('div', { className: 'compare-status' },
            h('p', { 'aria-live': 'polite' }, nd ? h('strong', null, nd === 1 ? '1 diferença' : nd + ' diferenças') : 'As duas redações têm o mesmo texto', ' entre ', nome(de), ' e ', nome(ate), '.'),
            nd > 1 ? h('div', { className: 'actions' },
              h('button', { type: 'button', className: 'btn', 'aria-disabled': foco === 0, onClick: function () { if (foco > 0) irDif(foco - 1); } }, '‹ Diferença anterior'),
              h('span', { className: 'small', role: 'status' }, 'Diferença ' + (foco + 1) + ' de ' + nd),
              h('button', { type: 'button', className: 'btn', 'aria-disabled': foco === nd - 1, onClick: function () { if (foco < nd - 1) irDif(foco + 1); } }, 'Diferença seguinte ›')) : null,
            h('button', { type: 'button', className: 'btn', onClick: function () {
              var t = 'Antes: ' + nome(de) + '\n' + antes + '\n\nDepois: ' + nome(ate) + '\n' + depois + '\n\n' + art.rotulo + ' ' + (d.genitivo || 'de ' + d.titulo) + '. Fonte: Diário da República (legislação consolidada).';
              try { navigator.clipboard.writeText(t).then(function () { cp[1](true); }, function () { cp[1](false); }); } catch (e) { /* no clipboard */ }
            } }, cp[0] ? 'Copiado' : 'Copiar antes e depois')),
          h('div', { className: 'statute-box stack-s' + (vista === 'lado' ? ' lado' : '') },
            vista === 'lado' ? h('div', { className: 'lado-head', 'aria-hidden': 'true' }, h('span', null, 'Antes · ' + nomeAto(art.versoes[de], atos)), h('span', null, 'Depois · ' + nomeAto(art.versoes[ate], atos))) : null,
            blocos.map(function (b) {
              if (b.dobra) return h('button', { key: b.id, type: 'button', className: 'dobra', 'aria-expanded': false, onClick: function () { var o = Object.assign({}, ab[0]); o[b.id] = true; ab[1](o); } },
                h('span', { 'aria-hidden': 'true' }, '⋯ '), b.texto, ' ', h('span', { className: 'dobra-ver' }, 'Mostrar'));
              var attrs = b.dif != null ? { key: b.id, id: 'dif-' + b.dif, tabIndex: -1, className: 'dif' + (b.dif === foco ? ' is-foco' : '') } : { key: b.id };
              if (vista === 'lado') return h('div', Object.assign({}, attrs, { className: (attrs.className || '') + ' lado-row' }),
                h(R.Redline, { segments: segs(b.linha, 'ins'), mode: 'inline', legend: false }),
                h(R.Redline, { segments: segs(b.linha, 'del'), mode: 'inline', legend: false }));
              return h('div', attrs, h(R.Redline, { segments: b.linha, mode: modo[1], legend: false }));
            }),
            modo[1] === 'inline' || vista === 'lado' ? h('p', { className: 'rd-redline-legend' }, h('span', { className: 'rd-key rd-key-ins' }, h('ins', null, 'acrescentado')), h('span', { className: 'rd-key rd-key-del' }, h('del', null, 'eliminado'))) : null)),
        h('aside', { className: 'col-side stack-s', 'aria-labelledby': 'passos' },
          h('h2', { id: 'passos', className: 'h3' }, 'Redações entre as duas'),
          h('p', { className: 'muted small' }, 'Cada redação aplica-se no seu período. Abra uma redação para ler o texto completo.'),
          h('ol', { className: 'list' }, art.versoes.slice(lo, hi + 1).map(function (v, j) {
            var i = lo + j;
            return h('li', { key: i }, h('strong', null, (i + 1) + '. '),
              h('a', { href: link(['d', d.slug, art.id], { em: startOf(v, 'vigor'), redacao: versionKey(art, i) }) }, nomeAto(v, atos)),
              h('span', { className: 'muted' }, ' · ' + (v.vigor ? 'em vigor desde ' + extenso(v.vigor) : 'publicação ' + extenso(v.publicacao))),
              i > lo ? h('span', null, ' · ', h('a', { href: href({ de: versionKey(art, i - 1), ate: versionKey(art, i), ato: null }) }, 'ver esta alteração')) : null);
          })))));
  }

  // ---- Act (the "commit") -----------------------------------------------------------------------
  function Ato(props) {
    var r = useData(['atos.json', 'index.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var atos = r.data[0], index = r.data[1], a = atos[props.id];
    if (!a) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos este ato.'));
    var nomes = {};
    index.diplomas.forEach(function (d) { nomes[d.slug] = d; });
    var vigor = {};
    a.alteracoes.forEach(function (c) { if (c.vigor) vigor[c.vigor] = (vigor[c.vigor] || 0) + 1; });
    var datas = Object.keys(vigor).sort();
    var by = {};
    a.alteracoes.forEach(function (c) { (by[c.diploma] = by[c.diploma] || []).push(c); });
    return h('div', { className: 'stack' },
      h(Crumbs, { items: [['Diplomas', '#/'], ['Atos'], [a.designacao]] }),
      h('div', { className: 'title-block' },
        h('p', { className: 'eyebrow' }, 'Ato que alterou a lei'),
        h('h1', { className: 'display' }, a.designacao + (a.publicacao ? ', de ' + semAno(a.publicacao) : '')),
        a.sumario ? h('p', { className: 'lead', 'data-citacao': '' }, a.sumario) : null,
        a.link ? h('p', null, h('a', { href: a.link, target: '_blank', rel: 'noopener' }, 'Ver o ato no Diário da República')) : null),
      h('section', { className: 'dates', 'aria-label': 'Datas do ato' },
        h('div', { className: 'date-card' }, h('p', { className: 'eyebrow' }, 'Publicação'), h('p', { className: 'date-big' }, a.publicacao ? extenso(a.publicacao) : 'Não indicada'), a.dr ? h('p', { className: 'muted small' }, 'Diário da República n.º ' + a.dr + (a.serie ? ', ' + a.serie : '')) : null),
        h('div', { className: 'date-card' }, h('p', { className: 'eyebrow' }, 'Entrada em vigor'),
          datas.length ? datas.map(function (dt) { return h('p', { key: dt, className: datas.length > 1 ? '' : 'date-big' }, extenso(dt) + (datas.length > 1 ? ' (' + vigor[dt] + (vigor[dt] === 1 ? ' artigo)' : ' artigos)') : '')); }) : h('p', { className: 'date-big' }, 'Não indicada'),
          h('p', { className: 'muted small' }, datas.length > 1 ? 'Este ato tem datas de entrada em vigor diferentes conforme o artigo.' : 'Data do consolidado do Diário da República.'))),
      h('div', { className: 'cols' },
        h('section', { className: 'col-main', 'aria-labelledby': 'alterou' },
          h('h2', { id: 'alterou', className: 'h2' }, 'O que este ato alterou'),
          Object.keys(by).map(function (slug) {
            return h('div', { key: slug, className: 'stack-s' },
              h('h3', { className: 'h3' }, nomes[slug] ? nomes[slug].titulo : slug),
              h('ul', { className: 'list' }, by[slug].map(function (c, i) {
                return h('li', { key: i }, h(R.StatusPill, { status: { aditado: 'aditado', revogado: 'revogado' }[c.tipo] || 'vigor' }, TIPO[c.tipo] || c.tipo), ' ',
                  h('a', { href: link(['d', slug, c.artigo], { redacao: a.id }) }, c.rotulo), ' · ',
                  h('a', { href: link(['d', slug, c.artigo, 'comparar'], { ato: a.id }) }, 'ver a alteração'));
              })));
          })),
        h('aside', { className: 'col-side stack-s', 'aria-labelledby': 'origem' },
          h('h2', { id: 'origem', className: 'h2' }, 'Origem deste ato'),
          (a.iniciativas || []).length ? (a.iniciativas || []).map(function (ini) {
            return h('a', { key: ini.id, className: 'card card-link', href: link(['iniciativa', ini.id]) },
              h('span', { className: 'eyebrow' }, 'Iniciativa · ' + (ini.autores || []).join(', ')),
              h('span', { className: 'card-title' }, ini.designacao),
              h('span', { className: 'small', 'data-citacao': '' }, ini.titulo));
          }) : h('p', { className: 'muted' }, a.ar ? 'Não encontrámos a iniciativa nos dados abertos da Assembleia da República.' : 'Este ato não vem de uma iniciativa da Assembleia da República, ou não temos dados para o ligar.'))));
  }

  // ---- Initiative (the "pull request") ---------------------------------------------------------
  var STAGES = [['Entrada', /^Entrada$/], ['Admissão', /^Admissão/], ['Generalidade', /Votação na generalidade/],
    ['Especialidade', /especialidade/i], ['Votação final global', /^Votação final global$|^Votação final$|^Votação global$/],
    ['Promulgação', /^Promulgação|^Veto/], ['Publicação', /Publicação DR\)$/]];
  function Iniciativa(props) {
    var r = useData(['iniciativas.json', 'atos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var ini = r.data[0][props.id], atos = r.data[1];
    if (!ini) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos esta iniciativa.'));
    var stages = STAGES.map(function (s) {
      var ev = ini.eventos.filter(function (e) { return s[1].test(e[1]); })[0];
      var vot = ev ? ini.votacoes.filter(function (v) { return v.fase === ev[1]; })[0] : null;
      return { label: s[0], date: ev ? ev[0] : null, state: ev ? (/^Veto/.test(ev[1]) ? 'stopped' : 'done') : 'todo', note: vot ? vot.resultado : (ev && /^Veto/.test(ev[1]) ? 'Veto' : undefined) };
    });
    var lastDone = -1;
    stages.forEach(function (s, i) { if (s.state === 'done') lastDone = i; });
    stages.forEach(function (s, i) { if (s.state === 'todo' && i < lastDone) s.state = 'done'; });
    return h('div', { className: 'stack' },
      h(Crumbs, { items: [['Diplomas', '#/'], ['Iniciativas'], [ini.tipo + ' n.º ' + ini.numero + '/' + ini.legislatura]] }),
      h('div', { className: 'title-block' },
        h('p', { className: 'eyebrow' }, ini.tipo + ' n.º ' + ini.numero + '/' + ini.legislatura + ' · ' + (ini.autores || []).join(', ')),
        h('h1', { className: 'title', 'data-citacao': '' }, ini.titulo),
        h('div', { className: 'pills' }, h(R.StatusPill, { status: 'vigor' }, 'Publicada como ' + (atos[ini.ato] ? atos[ini.ato].designacao : ini.ato)), ' ',
          h('a', { href: link(['ato', ini.ato]) }, 'Ver o que a lei alterou'), ' · ',
          h('a', { href: ini.link, target: '_blank', rel: 'noopener' }, 'Ver no sítio da Assembleia da República'))),
      h('section', { className: 'statute-box' }, h('h2', { className: 'h2' }, 'Processo legislativo'), h(R.ProcessTrack, { stages: stages })),
      h('div', { className: 'cols' },
        h('section', { className: 'col-main stack-s', 'aria-labelledby': 'vot' },
          h('h2', { id: 'vot', className: 'h2' }, 'Votações'),
          ini.votacoes.length ? ini.votacoes.map(function (v, i) {
            var groups = Object.keys(v.posicoes || {});
            return h('div', { key: i, className: 'vote-box' },
              groups.length ? h(R.VoteBar, { title: v.fase + ' · ' + curta(v.data), result: v.resultado || '', votes: groups.map(function (g) { return { group: g, vote: v.posicoes[g] }; }) })
                : h('p', null, h('strong', null, v.fase + ' · ' + curta(v.data) + ': '), (v.resultado || '') + (v.unanime ? ' por unanimidade' : '')),
              v.descricao ? h('p', { className: 'muted small', 'data-citacao': '' }, v.descricao) : null);
          }) : h('p', { className: 'muted' }, 'Os dados abertos não têm votações registadas para esta iniciativa.'),
          h('p', { className: 'muted small' }, 'Sentido de voto de cada grupo parlamentar, como no registo da Assembleia da República. Os dados abertos não dão o número de deputados de cada grupo.')),
        h('aside', { className: 'col-side stack-s', 'aria-labelledby': 'ev' },
          h('h2', { id: 'ev', className: 'h2' }, 'Todas as fases'),
          h('ol', { className: 'list small' }, ini.eventos.map(function (e, i) { return h('li', { key: i }, h('strong', null, curta(e[0]) + ' '), e[1]); })),
          ini.conjuntas && ini.conjuntas.length ? h('p', { className: 'muted small' }, 'Discutida em conjunto com: ' + ini.conjuntas.join(', ') + '.') : null)));
  }

  // ---- About -------------------------------------------------------------------------------------
  function Sobre() {
    var r = useData(['index.json']);
    var when = r.data ? extenso(r.data[0].consultado_em) : '';
    return h('div', { className: 'stack prose' },
      h('h1', { className: 'title' }, 'Sobre os dados'),
      h('p', null, 'O texto de cada redação vem da legislação consolidada do Diário da República' + (when ? ', consultada a ' + when : '') + '. A ligação de cada lei à sua iniciativa e às votações vem dos dados abertos da Assembleia da República.'),
      h('h2', { className: 'h2' }, 'Como calculamos a origem do texto'),
      h('p', null, 'Comparamos cada redação com a redação anterior, palavra a palavra. Cada palavra que uma alteração acrescentou fica com a cor dessa alteração. As palavras que não mudaram mantêm a origem anterior.'),
      h('p', null, 'Quando uma alteração escreve de novo uma frase, marcamos a frase toda como alterada. Uma palavra curta que fica igual no meio da frase não divide a alteração em duas.'),
      h('h2', { className: 'h2' }, 'As três datas'),
      h('ul', null,
        h('li', null, h('strong', null, 'Publicação: '), 'o dia em que o ato saiu no Diário da República.'),
        h('li', null, h('strong', null, 'Entrada em vigor: '), 'o dia em que a redação começa a valer. Quando o Diário da República não indica esta data, avisamos e usamos a data de publicação.'),
        h('li', null, h('strong', null, 'Produção de efeitos: '), 'os factos ou os períodos a que a redação se aplica. O consolidado do Diário da República só tem esta informação em notas de texto. Mostramos as notas.')),
      h('h2', { className: 'h2' }, 'Limites conhecidos'),
      h('ul', null,
        h('li', null, 'Ainda não verificamos o texto com uma reprodução própria dos atos. O texto é o do consolidado do Diário da República, que não tem valor legal.'),
        h('li', null, 'Algumas datas de entrada em vigor faltam no consolidado do Diário da República. Nos textos originais, indicamos a norma que fixa a data.'),
        h('li', null, 'As votações mostram o sentido de voto de cada grupo parlamentar, sem o número de deputados.')));
  }

  // ---- App ---------------------------------------------------------------------------------------
  function App() {
    var route = useRoute();
    var s = route.segs, view;
    if (s[0] === 'd' && s[1] && s[2] && s[3] === 'comparar') view = h(Comparar, { slug: s[1], id: s[2], q: route.q });
    else if (s[0] === 'd' && s[1] && s[2]) view = h(Artigo, { slug: s[1], id: s[2], q: route.q });
    else if (s[0] === 'd' && s[1]) view = h(Diploma, { slug: s[1], q: route.q });
    else if (s[0] === 'ato' && s[1]) view = h(Ato, { id: s[1] });
    else if (s[0] === 'iniciativa' && s[1]) view = h(Iniciativa, { id: s[1] });
    else if (s[0] === 'sobre') view = h(Sobre);
    else view = h(Home);
    return h(Shell, null, view);
  }

  // Follow the reader's light or dark setting, unless the host page already chose a theme.
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() { if (root.hasAttribute('data-theme-auto')) root.setAttribute('data-theme', mq && mq.matches ? 'dark' : 'light'); }
  if (!root.hasAttribute('data-theme')) { root.setAttribute('data-theme-auto', ''); theme(); }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);

  window.RedacaoApp = { pick: pick, diff: diff, originModel: originModel, search: search, resolve: resolve, periodo: periodo, versionKey: versionKey };
  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
