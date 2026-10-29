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
  function load(path) {
    if (!cache[path]) {
      cache[path] = fetch('data/' + path).then(function (r) {
        if (!r.ok) throw new Error(path + ': ' + r.status);
        return r.json();
      }).then(function (j) { valores[path] = j; return j; });
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
            h('a', { href: '#/' }, 'Diplomas'),
            h('a', { href: '#/verificacao' }, 'Verificação'),
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
    }).sort(function (a, b) { return (a[4] === 'revogado') - (b[4] === 'revogado'); }).slice(0, 30);
  }
  function epigrafe(e) { return (e || '').replace(/^\((.*)\)$/, '$1'); }
  var AREAS = ['Constituição e sistema político', 'Direitos e cidadania', 'Civil e comercial', 'Trabalho e segurança social', 'Fiscal',
    'Penal', 'Tribunais e processo', 'Administração pública'];
  function Home() {
    var r = useData(['index.json', 'atos.json']);
    var qs = useState('');
    var rp = useData(qs[0] ? ['pesquisa.json'] : []);
    if (!r.data) return h(Loading, { error: r.error });
    var index = r.data[0], atos = r.data[1], carregada = !qs[0] || (rp.data && rp.data[0]);
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
          h('h2', { id: 'dipl', className: 'h2' }, index.diplomas.length + ' diplomas'),
          AREAS.concat(['Outros']).map(function (area) {
            var ds = index.diplomas.filter(function (d) { return (AREAS.indexOf(d.area) >= 0 ? d.area : 'Outros') === area; });
            if (!ds.length) return null;
            return h('div', { key: area, className: 'area' },
              h('h3', { className: 'area-h' }, area),
              h('ul', { className: 'cards' }, ds.map(function (d) {
                return h('li', { key: d.slug, className: 'card' },
                  h('a', { className: 'card-title', href: link(['d', d.slug]) }, d.titulo),
                  h('p', null, (fold(d.designacao).replace(/[^a-z0-9]/g, '').indexOf(fold(d.sigla).replace(/[^a-z0-9]/g, '')) >= 0 ? '' : d.sigla + ' · ') + d.designacao + ' · ' + d.n_artigos + ' artigos · ' + d.n_atos + (d.n_atos === 1 ? ' alteração' : ' alterações')));
              })));
          })),
        h('section', { 'aria-labelledby': 'rec' },
          h('h2', { id: 'rec', className: 'h2' }, 'Alterações mais recentes'),
          h('ol', { className: 'list' }, recent.map(function (a) {
            var ds = {};
            a.alteracoes.forEach(function (c) { ds[c.diploma] = (ds[c.diploma] || 0) + 1; });
            return h('li', { key: a.id, className: 'recente' }, h('a', { href: link(['ato', a.id]) }, a.designacao),
              h('span', { className: 'muted' }, ' · ' + curta(a.publicacao) + ' · ' + Object.keys(ds).map(function (k) { return nomes[k].sigla + ' (' + ds[k] + ')'; }).join(', ')),
              a.sumario ? h('span', { className: 'recente-sum' }, a.sumario) : null);
          })))));
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
      h(Crumbs, { items: [['Diplomas', '#/'], [d.titulo, link(['d', slug])], ['O que mudou']] }),
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
        h('p', { className: 'muted small' }, 'Contamos cada redação da data de entrada em vigor, ou da publicação quando o Diário da República não indica a data.')),
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
    var r = useData(['d/' + props.slug + '.json', 'atos.json', 'pendentes.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var d = r.data[0], atos = r.data[1], propostas = pendentesDe(r.data[2], props.slug, null);
    var emCurso = {};
    propostas.forEach(function (i) { i.diplomas[d.slug].artigos.forEach(function (a) { emCurso[a] = true; }); });
    var em = validDate(props.q.em), base = props.q.base;
    var acts = Object.keys(atos).map(function (k) { return atos[k]; })
      .filter(function (a) { return a.alteracoes.some(function (c) { return c.diploma === d.slug; }); })
      .sort(function (a, b) { return (b.publicacao || '') < (a.publicacao || '') ? -1 : 1; });
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Diplomas', '#/'], [d.titulo]] }),
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
        h('p', { className: 'dip-acoes' }, h('a', { className: 'rd-btn', href: link(['alteracoes', d.slug]) }, 'O que mudou entre duas datas'))),
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
    var r = useData(existe ? ['d/' + props.slug + '.json', 'atos.json', 'passagem.json', 'd/' + props.slug + '/' + props.id + '.json', 'pendentes.json'] : []);
    var cp = useState(0);
    var df = useState(0);   // the change in focus in Alterações
    var fl = useState(false);  // the phone sheet
    if (!ri.data) return h(Loading, { error: ri.error });
    var d = ri.data[0];
    if (existe && !r.data) return h(Loading, { error: r.error });
    var atos = existe ? r.data[1] : {}, ps = existe ? r.data[2] : {}, q = props.q;
    var art = existe ? r.data[3] : null;
    var propostas = existe ? pendentesDe(r.data[4], props.slug, props.id) : [];
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
    var vizinho = function (k) { var x = ordem[pos + k]; return x ? h('a', { href: link(['d', d.slug, x.artigo]) }, (k < 0 ? '‹ ' : '') + x.rotulo.replace(/^Artigo\s*/, '') + (k > 0 ? ' ›' : '')) : null; };
    // For diplomas with few acts (the Constitution), say which acts did not change this article.
    var doDiploma = Object.keys(atos).map(function (k) { return atos[k]; }).filter(function (a) { return a.alteracoes.some(function (c) { return c.diploma === d.slug; }); });
    var naoAlteraram = doDiploma.length <= 10 ? doDiploma.filter(function (a) { return !art.versoes.some(function (v) { return v.ato === a.id; }); })
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
        if (v && v.tipo !== 'original') a.nota = ps[v.ato] ? 'No Parlamento: ' + resumoParlamento(ps[v.ato]) : /^Decreto-Lei/.test((atos[v.ato] || {}).designacao || '') ? 'O Governo aprovou este decreto-lei. O Parlamento não votou este texto.' : null;
      });
      corpo = h('div', { className: 'lei lei-origem' }, h(R.TextOrigin, { key: art.id + sel.i, paragraphs: model.paragraphs, acts: model.acts, margem: true }));
    } else if (cur && ver === 'mudou' && (sel.i > 0 || q.com)) {
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
      if (ver === 'mudou') resumo = h('p', { className: 'resumo' }, 'Esta é a primeira redação. Não há uma redação anterior. ',
        n > 1 ? h('a', { href: versionHref(0, { ver: 'mudou', com: versionKey(art, 1) }) }, 'Comparar com a redação seguinte') : null);
      corpo = h('div', { className: 'lei' }, vista.desde != null
        ? cur.linhas.map(function (l, k) { return linhaMarcada(l, k, marcas, vista.desde); })
        : texto(cur).split('\n').map(function (t, k) { return linhaLei(t, k, marcas); }));
    }
    var tabs = h(Abas, { items: VER, value: ver, onChange: function (v) { vista.dir = vista.desde = null; guardarVer(v); substituir(link(['d', d.slug, art.id], Object.assign({}, q, { ver: v }))); } });
    var dataPop = h(R.Popover, { label: 'Data', title: 'Ver o artigo noutra data', className: 'pop-data' },
      h(R.DateLens, { date: date, basis: base, today: hoje(), id: 'lente', onChange: go, bases: ['vigor', 'publicacao'] }));
    var f = cur ? formula(art, sel.i, atos, d) : null;
    var status = cur ? h(React.Fragment, null, h('strong', null, ordinal(sel.i) + ' de ' + n), ' · ' + nomeAto(cur, atos, d) + ' · ', h('span', { className: 'muted' }, intervaloCurto(art, sel.i, base, hojeIdx))) : 'Sem texto nesta data';

    // The register's rows, in the right column and in the phone sheet.
    var itensRegisto = art.versoes.map(function (v, i) {
            var a = atos[v.ato], p = periodo(art, i, 'vigor'), atual = sel && i === sel.i;
            return { ordinal: ordinal(i), label: nomeAto(v, atos, d), date: curta(startOf(v, 'vigor')), band: corDe(art, i), href: versionHref(i),
              current: atual, technical: v.tipo === 'retificado',
              details: atual ? [
                h('p', { key: 'd' }, 'Publicação: ' + curta(v.publicacao) + (v.vigor ? ' · Em vigor: ' + curta(v.vigor) + (p.fim && p.fim !== 'mesma' ? ' a ' + curta(p.fim) : '') : ' · Entrada em vigor não indicada')),
                v.artigo_do_ato && a ? h('p', { key: 'n' }, TIPO[v.tipo] + ' pelo ' + v.artigo_do_ato.toLowerCase() + ' ' + (pela(a.designacao) === 'pelo' ? 'do ' : 'da ') + a.designacao + '.') : null,
                ps[v.ato] ? h('p', { key: 'p', className: 'reg-parl' }, resumoParlamento(ps[v.ato])) : a && /^Decreto-Lei/.test(a.designacao) ? h('p', { key: 'p' }, 'O Governo aprovou este decreto-lei. O Parlamento não votou este texto.') : null,
                h('p', { key: 'l' }, i > 0 ? h('a', { href: versionHref(i, { ver: 'mudou' }) }, 'Ver as alterações') : null, i > 0 && a ? ' · ' : null,
                  a ? h('a', { href: link(['ato', v.ato]) }, ps[v.ato] ? 'Ver a votação no Parlamento' : 'Ver o ato') : null)
              ] : null };
          });
    return h('div', { className: 'artigo', 'data-dir': vista.dir, 'data-passada': passada ? '' : undefined },
      h('div', { className: 'corrida' },
        h('p', null, h('a', { href: link(['d', d.slug]) }, d.sigla), art.caminho.length ? ' · ' + art.caminho[art.caminho.length - 1] : ''),
        h('nav', { className: 'vizinhos', 'aria-label': 'Artigos vizinhos' }, vizinho(-1), vizinho(1))),
      h('header', { className: 'art-head' },
        h('h1', { className: 'art-titulo' }, h('span', { className: 'art-num' }, art.rotulo), epigrafe ? h('span', { className: 'art-ep' }, epigrafe) : null),
        cur ? h('div', { className: 'art-acoes' },
          h('button', { type: 'button', className: 'rd-btn', onClick: function () { copiar(citacao + '\n' + permalink, function () { copiado.chave = citacao; cp[1](cp[0] + 1); }); } }, h('span', { key: copiado.chave === citacao ? 'c' : 'n', className: 'troca' }, copiado.chave === citacao ? 'Citação copiada' : 'Copiar citação')),
          curAto && curAto.link ? h('a', { className: 'rd-link', href: curAto.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗') : d.link ? h('a', { className: 'rd-link', href: d.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗') : null) : null),
      cur ? h('div', { className: 'estado' },
        h('p', { className: 'estado-formula' }, h('em', null, f[0], atos[f[2]] ? h('a', { href: link(['ato', f[2]]) }, f[1]) : f[1])),
        passada ? h('p', { className: 'estado-passada' }, (per.fim === 'mesma' ? 'Substituída no mesmo dia pela redação seguinte' : 'Esteve em vigor de ' + extenso(per.inicio) + ' a ' + extenso(per.fim)) + ' · ', h('a', { href: link(['d', d.slug, art.id], { ver: q.ver }) }, 'Ir para hoje'))
          : futura ? h('p', { className: 'estado-futura' }, 'Ainda não está em vigor. Entra em vigor a ' + extenso(per.inicio) + '. ', hojeIdx != null ? h('a', { href: link(['d', d.slug, art.id], { ver: q.ver }) }, 'Ir para hoje') : null)
          : h('p', null, (cur.tipo === 'revogado' ? 'Revogado desde ' : 'Em vigor desde ') + extenso(per.inicio) + (sel.incerta ? ' (data de publicação)' : '') + '.'),
        sel.i !== last && epigrafe ? h('p', { className: 'muted small' }, 'Epígrafe de hoje. A desta redação pode ser outra.') : null,
        linhaVerificacao(cur, d, atos)) : null,
      sel ? h(R.TimeRuler, { id: 'regua', current: sel.i, today: hoje(), onGo: function (k) { substituir(versionHref(k)); },
        versions: art.versoes.map(function (v, i) {
          return { start: startOf(v, base), technical: v.tipo === 'retificado' || periodo(art, i, base).fim === 'mesma', pending: hojeIdx == null || i > hojeIdx,
            label: ordinal(i) + ' redação: ' + nomeAto(v, atos, d) + ', ' + intervalo(art, i, base, hojeIdx) };
        }) }) : null,
      h(R.VersionBar, { id: 'barra', current: sel ? sel.i : -1, count: n, status: status,
        onGo: function (k) { substituir(versionHref(k)); },
        onStatus: function () { if (estreito()) { fl[1](true); return; } var e = document.getElementById('historia'); if (e) { e.scrollIntoView(); e.focus(); } } },
        h('div', { className: 'so-largo tools' }, tabs, dataPop)),
      h('div', { className: 'so-estreito tools' }, tabs, dataPop),
      // Side by side and the margin notes of Origem do texto need the full width: the register moves under the text.
      h('div', { className: 'art-corpo' + ((ver === 'mudou' && q.lado === '1') || ver === 'origem' ? ' corpo-largo' : '') },
        h('div', { className: 'art-texto' },
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
      h(Crumbs, { items: [['Diplomas', '#/'], [ini.designacao]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, ini.designacao),
        h('p', { className: 'lead', 'data-citacao': '' }, ini.titulo),
        h('p', { className: 'parl-estado' }, h(R.StatusPill, { status: 'pendente' }, 'Em curso'), ' ', ini.fase_texto + ' ' + desdeFase(ini))),
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
            h('h2', { id: 'geral-h' }, 'Votação na generalidade'),
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
  // The vote that opened the text that became law: the committee text, or the main initiative's own.
  function votoDoTexto(p) {
    if (p.texto_comissao && p.texto_comissao.length) return { voto: p.texto_comissao[p.texto_comissao.length - 1], comissao: true };
    var ini = principalDe(p);
    return ini.generalidade ? { voto: ini.generalidade, ini: ini } : null;
  }
  function sentidos(v, ordem) {
    var out = '';
    [['favor', 'A favor'], ['contra', 'Contra'], ['abstencao', 'Abstenção']].forEach(function (x) {
      var gs = ordem.filter(function (g) { return v.grupos[g] === x[0]; });
      if (gs.length) out += ' ' + x[1] + ': ' + gs.join(', ') + '.';
    });
    return out;
  }
  // For the register and the Origem do texto popover:
  // "Proposta de Lei n.º 16/XVII, do Governo. Aprovada na generalidade a 19 de setembro de 2025. A favor: …"
  function resumoParlamento(p) {
    if (!p) return null;
    var t = votoDoTexto(p), ini = principalDe(p);
    if (!t) return ini.designacao + ', ' + dePropos(ini) + '. Não temos o registo da votação na generalidade.';
    var v = t.voto, gn = t.comissao ? genero('Texto') : genero(ini.designacao);
    var res = v.resultado === 'Aprovado' ? gn.ado : v.resultado === 'Rejeitado' ? gn.ejeitado : v.resultado;
    return (t.comissao ? 'Texto de substituição da comissão, que junta ' + p.iniciativas.length + (p.iniciativas.length === 1 ? ' iniciativa' : ' iniciativas') : ini.designacao + ', ' + dePropos(ini)) + '. ' +
      (res ? res + ' na generalidade' : 'Votação na generalidade') + ' a ' + extenso(v.data) + (v.unanime ? ', por unanimidade.' : '.') + (v.unanime ? '' : sentidos(v, ordemDe(p, [v])));
  }
  // The lede: one fact per sentence, pretérito perfeito, active voice.
  function ledeGeneralidade(p) {
    var ini = principalDe(p), n = p.iniciativas.length, out = [];
    var proprios = p.iniciativas.filter(function (i) { return i.generalidade; });
    var texto = p.texto_comissao && p.texto_comissao.length ? p.texto_comissao[p.texto_comissao.length - 1] : null;
    var aprovou = function (v, lo) { return 'O Parlamento ' + (v.resultado === 'Rejeitado' ? 'rejeitou' : 'aprovou') + lo + ' na generalidade a ' + extenso(v.data) + (v.unanime ? ', por unanimidade.' : '.'); };
    if (/^Projeto de Revisão/.test(ini.designacao)) {
      var gs = [];
      p.iniciativas.forEach(function (i) { gruposDe(i).forEach(function (g) { if (gs.indexOf(g) < 0) gs.push(g); }); });
      gs = p.ordem_grupos.filter(function (g) { return gs.indexOf(g) >= 0; }).concat(gs.filter(function (g) { return p.ordem_grupos.indexOf(g) < 0; }));
      out.push('Deputados ' + (gs.length ? 'do ' + lista(gs) + ' ' : '') + 'apresentaram ' + n + (n === 1 ? ' projeto de revisão constitucional.' : ' projetos de revisão constitucional.'));
      if (!proprios.length && !texto) out.push('Não temos votações destes projetos na generalidade.');
    } else if (texto) {
      out.push('A lei vem de um texto de substituição da comissão parlamentar. O texto junta ' + (n === 1 ? 'uma iniciativa.' : n + ' iniciativas.'));
      out.push(aprovou(texto, '-o'));
      if (proprios.length) out.push(proprios.length === n ? 'Antes, o Parlamento votou cada iniciativa na generalidade.' : 'Antes, o Parlamento votou ' + proprios.length + ' destas iniciativas na generalidade.');
    } else {
      var q = quemPropos(ini), gn = genero(ini.designacao);
      out.push(q + ' ' + plural(q) + ' ' + gn.o + ' ' + ini.designacao + '.');
      if (n > 1) out.push('O Parlamento discutiu' + gn.lo + ' com ' + (n === 2 ? 'outra iniciativa.' : 'outras ' + (n - 1) + ' iniciativas.'));
      if (n === 1 && ini.generalidade) out.push(aprovou(ini.generalidade, gn.lo));
      else if (proprios.length) {
        var dias = proprios.map(function (i) { return i.generalidade.data; }).filter(function (x, k, a) { return a.indexOf(x) === k; });
        out.push('Votou cada uma na generalidade' + (dias.length === 1 ? ' a ' + extenso(dias[0]) + '.' : '.'));
      } else out.push('Não temos o registo da votação na generalidade.');
    }
    return out.join(' ');
  }
  function Voto(props) {
    var v = props.v;
    return h(R.Votacao, { grupos: v.grupos, ordem: props.ordem, contagens: v.contagens, dissidencia: v.dissidencia, foraDeGrupo: v.fora_de_grupo,
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
      h(Voto, { v: v, ordem: props.ordem }));
  }
  var CELULA = { favor: 'A favor', contra: 'Contra', abstencao: 'Abstenção' };
  // Several initiatives: one row each, one column per group, so the reader can compare.
  function TabelaIniciativas(props) {
    var p = props.p, inis = p.iniciativas;
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
          v ? h(Voto, { v: v, ordem: ordem, conta: false }) : h('p', { className: 'muted small' }, i.baixa_sem_votacao ? 'Baixou à comissão sem votação na generalidade.' : 'Não temos o registo da votação.'));
      })));
    return h(React.Fragment, null, estreito, h('div', { className: 'tabela-caixa so-largo-b', tabIndex: 0, role: 'region', 'aria-labelledby': 'tab-ini' },
      h('table', { className: 'tabela-votos' },
        h('caption', { id: 'tab-ini' }, props.titulo),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Iniciativa'), h('th', { scope: 'col' }, 'Resultado'),
          ordem.map(function (g) { return h('th', { key: g, scope: 'col', className: 'tv-g' }, g); }),
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
  function Generalidade(props) {
    var p = props.p, ini = principalDe(p), n = p.iniciativas.length;
    var texto = p.texto_comissao && p.texto_comissao.length ? p.texto_comissao[p.texto_comissao.length - 1] : null;
    var proprios = p.iniciativas.filter(function (i) { return i.generalidade; });
    return h('section', { className: 'secao geral', id: 'generalidade', 'aria-labelledby': 'geral-h' },
      h('h2', { id: 'geral-h' }, 'Votação na generalidade'),
      h('p', { className: 'lede' }, ledeGeneralidade(p)),
      texto ? h(BlocoVoto, { v: texto, ordem: ordemDe(p, [texto]), titulo: 'Texto de substituição da comissão', sub: 'Junta ' + lista(p.iniciativas.map(function (i) { return i.designacao; })) + '.' }) : null,
      !texto && n === 1 && ini.generalidade ? h(BlocoVoto, { v: ini.generalidade, ordem: ordemDe(p, [ini.generalidade]), titulo: ini.designacao, designacao: ini.designacao, sub: h('span', { 'data-citacao': '' }, ini.titulo) }) : null,
      n > 1 && proprios.length ? h(TabelaIniciativas, { p: p, titulo: texto ? 'Votação de cada iniciativa, antes do texto da comissão' : 'Votação de cada iniciativa' }) : null,
      n > 1 && !proprios.length ? h('ul', { className: 'inis' }, p.iniciativas.map(function (i) {
        return h('li', { key: i.id }, h('a', { href: link(['iniciativa', i.id]) }, i.designacao), ', ' + dePropos(i) + (i.baixa_sem_votacao ? '. Baixou à comissão sem votação.' : '.'));
      })) : null,
      h('p', { className: 'fonte' }, 'Ordem dos grupos: a da Assembleia da República nessa legislatura. Fonte: Assembleia da República, dados abertos.'));
  }

  // ---- Act (the "commit") -----------------------------------------------------------------------
  function Ato(props) {
    var r = useData(['atos.json', 'index.json', 'passagem.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var atos = r.data[0], index = r.data[1], ps = r.data[2], a = atos[props.id];
    if (!a) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos este ato.'));
    var nomes = {};
    index.diplomas.forEach(function (d) { nomes[d.slug] = d; });
    var vigor = {};
    a.alteracoes.forEach(function (c) { if (c.vigor) vigor[c.vigor] = (vigor[c.vigor] || 0) + 1; });
    var datas = Object.keys(vigor).sort();
    var by = {};
    a.alteracoes.forEach(function (c) { (by[c.diploma] = by[c.diploma] || []).push(c); });
    var p = ps[a.id], dl = /^Decreto-Lei/.test(a.designacao);
    document.title = a.designacao + ' · Redação';
    // The changes as an amending law writes them: "Alterou os artigos 14.º, 15.º e 15.º-A."
    var VERBO = { alterado: 'Alterou', aditado: 'Aditou', revogado: 'Revogou', retificado: 'Retificou' };
    var facto = function (k, v) { return [h('dt', { key: k + 't' }, k), h('dd', { key: k + 'd' }, v)]; };
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Diplomas', '#/'], [a.designacao]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, a.designacao + (a.publicacao ? ', de ' + semAno(a.publicacao) : '')),
        a.sumario ? h('p', { className: 'lead', 'data-citacao': '' }, a.sumario) : null),
      h('div', { className: 'duas' },
        h('section', { className: 'secao secao-1', 'aria-labelledby': 'alterou' },
          h('h2', { id: 'alterou' }, 'O que este ato mudou'),
          Object.keys(by).map(function (slug) {
            var porTipo = {};
            by[slug].forEach(function (c) { (porTipo[c.tipo] = porTipo[c.tipo] || []).push(c); });
            return h('div', { key: slug, className: 'mudou' },
              h('p', { className: 'mudou-diploma' }, nomes[slug] ? nomes[slug].titulo : slug),
              ['alterado', 'aditado', 'revogado', 'retificado'].concat(Object.keys(porTipo)).filter(function (t, i, all) { return porTipo[t] && all.indexOf(t) === i; }).map(function (t) {
                var cs = porTipo[t];
                return h('p', { key: t, className: 'mudou-frase' }, (VERBO[t] || t) + (cs.length === 1 ? ' o ' : ' os ') + (cs.length === 1 ? 'artigo ' : 'artigos '),
                  cs.map(function (c, i) {
                    return h(React.Fragment, { key: i }, i ? (i === cs.length - 1 ? ' e ' : ', ') : '',
                      h('a', { href: link(['d', slug, c.artigo], { redacao: a.id, ver: t === 'alterado' ? 'mudou' : null, ato: a.id }) }, c.rotulo.replace(/^Artigo\s*/, '')));
                  }), '.');
              }));
          })),
        h('aside', { className: 'factos', 'aria-label': 'Datas e fontes' },
          h('dl', null,
            facto('Publicação', [a.publicacao ? extenso(a.publicacao) : 'não indicada', a.dr ? h('span', { key: 'dr', className: 'factos-sub' }, 'Diário da República n.º ' + a.dr) : null]),
            facto('Entrada em vigor', datas.length ? datas.map(function (dt) { return h('span', { key: dt, className: 'factos-linha' }, extenso(dt) + (datas.length > 1 ? ' (' + vigor[dt] + (vigor[dt] === 1 ? ' artigo)' : ' artigos)') : '')); }) : 'não indicada'),
            p ? facto(p.iniciativas.length === 1 ? 'Iniciativa' : 'Iniciativas', p.iniciativas.slice(0, 3).map(function (i) { return h('a', { key: i.id, className: 'factos-linha', href: link(['iniciativa', i.id]) }, i.designacao); })
              .concat(p.iniciativas.length > 3 ? [h('span', { key: 'mais', className: 'factos-sub' }, 'e mais ' + (p.iniciativas.length - 3))] : [])) : null),
          h('p', { className: 'factos-links' },
            a.link ? h('a', { href: a.link, target: '_blank', rel: 'noopener' }, 'Diário da República ↗') : null))),
      p ? h(Generalidade, { p: p })
        : h('section', { className: 'secao', 'aria-labelledby': 'geral-h' },
          h('h2', { id: 'geral-h' }, dl ? 'Aprovação' : 'Votação na generalidade'),
          h('p', { className: 'lede' }, dl ? 'O Governo aprovou este decreto-lei. O Parlamento não votou este texto.'
            : /^Declaração de Retificação/.test(a.designacao) ? 'Uma declaração de retificação corrige erros do texto publicado. Não tem votação.'
            : a.ar ? 'Não encontrámos a iniciativa nos dados abertos da Assembleia da República.' : 'Não temos dados deste ato no Parlamento.')));
  }

  // ---- Initiative (the "pull request") ---------------------------------------------------------
  function Iniciativa(props) {
    var r = useData(['iniciativas.json', 'atos.json', 'passagem.json', 'pendentes.json', 'index.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var ini = r.data[0][props.id], atos = r.data[1], ps = r.data[2];
    if (!ini && r.data[3].iniciativas[props.id]) return h(IniciativaPendente, { ini: r.data[3].iniciativas[props.id], diplomas: r.data[4].diplomas });
    if (!ini) return h('div', { className: 'state' }, h('p', null, 'Não encontrámos esta iniciativa.'));
    var p = ps[ini.ato], ato = atos[ini.ato], nome = ini.tipo + ' n.º ' + ini.numero + '/' + ini.legislatura;
    var esta = p ? p.iniciativas.filter(function (i) { return i.id === props.id; })[0] : null;
    var texto = p && p.texto_comissao ? p.texto_comissao.filter(function (t) { return t.citadas.indexOf(props.id) >= 0; }).pop() : null;
    document.title = nome + ' · Redação';
    return h('div', { className: 'pagina-ato' },
      h(Crumbs, { items: [['Diplomas', '#/'], [nome]] }),
      h('header', { className: 'ato-cabeca' },
        h('h1', { className: 'display' }, nome),
        h('p', { className: 'lead', 'data-citacao': '' }, ini.titulo)),
      h('div', { className: 'duas' },
        h('section', { className: 'secao secao-1', 'aria-labelledby': 'geral-h' },
          h('h2', { id: 'geral-h' }, 'Votação na generalidade'),
          esta && esta.generalidade ? h(BlocoVoto, { v: esta.generalidade, ordem: ordemDe(p, [esta.generalidade]), titulo: nome, designacao: nome })
            : h('p', { className: 'lede' }, esta && esta.baixa_sem_votacao ? 'Esta iniciativa baixou à comissão sem votação na generalidade.' : 'Não temos o registo da votação desta iniciativa na generalidade.'),
          texto ? h(BlocoVoto, { v: texto, ordem: ordemDe(p, [texto]), titulo: 'Texto de substituição da comissão', sub: 'Inclui esta iniciativa.' }) : null),
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

  // ---- Verification report ---------------------------------------------------------------------
  var ESTADO = { verificado: 'Iguais', forma: 'Só na forma', desatualizado: 'Desatualizadas', divergente: 'Divergentes' };
  function pct(x) { return x == null ? '—' : (Math.round(x * 1000) / 10).toString().replace('.', ',') + ' %'; }
  function Verificacao() {
    var r = useData(['verificacao.json', 'atos.json']);
    if (!r.data) return h(Loading, { error: r.error });
    var vj = r.data[0], atos = r.data[1];
    document.title = 'Verificação · Redação';
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
      h('section', { className: 'secao', 'aria-labelledby': 'v-sem' },
        h('h2', { id: 'v-sem' }, 'Ainda não verificados'),
        h('p', { className: 'lede' }, lista(sem.map(function (k) { return vj.diplomas[k].titulo; })) + '. Os códigos fiscais quase nunca são republicados: o Orçamento do Estado altera-os sem os republicar. Para estes, vamos comparar o texto com uma reprodução própria dos atos que os alteraram.')));
  }

  // ---- About -------------------------------------------------------------------------------------
  function Sobre() {
    var r = useData(['index.json']);
    var when = r.data ? extenso(r.data[0].consultado_em) : '';
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
      h('ul', null,
        h('li', null, 'O texto é o do consolidado do Diário da República, que não tem valor legal. Na Constituição, comparámos cada redação com as republicações oficiais (', h('a', { href: '#/verificacao' }, 'Verificação'), '). Nos outros diplomas, ainda não verificámos o texto.'),
        h('li', null, 'Algumas datas de entrada em vigor faltam no consolidado do Diário da República. Nos textos originais, indicamos a norma que fixa a data.'),
        h('li', null, 'Mostramos só a votação na generalidade. A Assembleia da República publica o sentido de voto de cada grupo e, em algumas votações, o número de deputados. Quando não tem o número, contamos pelos assentos de cada grupo nesse dia.')));
  }

  // ---- App ---------------------------------------------------------------------------------------
  function App() {
    var route = useRoute();
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
    else if (s[0] === 'ato' && s[1]) view = h(Ato, { id: s[1] });
    else if (s[0] === 'alteracoes' && s[1]) view = h(Mudancas, { slug: s[1], q: route.q });
    else if (s[0] === 'iniciativa' && s[1]) view = h(Iniciativa, { id: s[1] });
    else if (s[0] === 'sobre') view = h(Sobre);
    else if (s[0] === 'verificacao') view = h(Verificacao);
    else view = h(Home);
    // A new page fades in. Another redação of the same article does not: only its text moves.
    return h(Shell, { casa: !s.length }, h('div', { key: s.join('/'), className: 'vista' }, view));
  }

  // Follow the reader's light or dark setting, unless the host page already chose a theme.
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() { if (root.hasAttribute('data-theme-auto')) root.setAttribute('data-theme', mq && mq.matches ? 'dark' : 'light'); }
  if (!root.hasAttribute('data-theme')) { root.setAttribute('data-theme-auto', ''); theme(); }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);

  window.RedacaoApp = { pick: pick, diff: diff, mudancas: mudancas, originModel: originModel, search: search, resolve: resolve, periodo: periodo, versionKey: versionKey };
  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
