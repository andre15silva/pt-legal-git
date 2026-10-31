/* @ds-bundle: {"format":4,"namespace":"Redacao","components":[{"name":"Button"},{"name":"StatusPill"},{"name":"ActChip"},{"name":"Redline"},{"name":"TextOrigin"},{"name":"TimeRuler"},{"name":"VersionBar"},{"name":"Register"},{"name":"Popover"},{"name":"DateLens"},{"name":"VersionTimeline"},{"name":"ProcessTrack"},{"name":"VoteBar"},{"name":"Votacao"},{"name":"Termo"},{"name":"TermoConteudo"},{"name":"Citation"},{"name":"SourceNote"},{"name":"OrigemTexto"},{"name":"NotaOrigem"},{"name":"FolhaOrigem"},{"name":"LenteOrigem"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  // "1989-07-08" -> "8 de julho de 1989" without timezone drift.
  function dataPorExtenso(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return Number(p[2]) + ' de ' + MONTHS[Number(p[1]) - 1] + ' de ' + p[0];
  }

  function Sr(props) {
    return h('span', { className: 'rd-sr' }, props.children);
  }

  // ---- Button -------------------------------------------------------------
  function Button(props) {
    var variant = props.variant || 'quiet';
    var rest = Object.assign({}, props);
    delete rest.variant;
    delete rest.className;
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('rd-btn', 'rd-btn-' + variant, props.className) }), props.children);
  }

  // ---- StatusPill ---------------------------------------------------------
  var STATUS = {
    vigor: { label: 'Em vigor', glyph: '●' },
    futuro: { label: 'Entra em vigor', glyph: '◔' },
    revogado: { label: 'Revogado', glyph: '⊘' },
    aditado: { label: 'Aditado', glyph: '+' },
    pendente: { label: 'Pendente', glyph: '◌' },
    verificado: { label: 'Verificado', glyph: '✓' },
    'nao-verificado': { label: 'Não verificado', glyph: '!' },
    historico: { label: 'Já não está em vigor', glyph: '○' },
    atual: { label: 'A ver esta redação', glyph: '▶' },
    inconstitucional: { label: 'Inconstitucional', glyph: '§' }
  };
  function StatusPill(props) {
    var s = STATUS[props.status] || STATUS.vigor;
    return h('span', { className: cx('rd-pill', 'rd-pill-' + (props.status || 'vigor')), title: props.title },
      h('span', { className: 'rd-pill-glyph', 'aria-hidden': 'true' }, s.glyph),
      props.children || s.label);
  }

  // ---- ActChip ------------------------------------------------------------
  function ActChip(props) {
    var a = props.act;
    var Tag = props.onClick ? 'button' : 'span';
    return h(Tag, { className: cx('rd-act', props.onClick && 'rd-act-btn', props.selected && 'is-selected'), onClick: props.onClick, type: props.onClick ? 'button' : undefined, 'aria-pressed': props.onClick ? !!props.selected : undefined },
      h('span', { className: 'rd-act-swatch rd-c-act-' + (a.index == null ? 0 : a.index), 'aria-hidden': 'true' }),
      h('span', { className: 'rd-act-label' }, a.label),
      a.date ? h('span', { className: 'rd-act-date' }, ', de ' + dataPorExtenso(a.date).replace(/ de \d{4}$/, '')) : null);
  }

  // ---- Redline --------------------------------------------------------------
  // segments: [{op: 'eq'|'ins'|'del', text}]
  function Redline(props) {
    var mode = props.mode || 'inline';
    var segs = props.segments || [];
    var nIns = segs.filter(function (s) { return s.op === 'ins'; }).length;
    var nDel = segs.filter(function (s) { return s.op === 'del'; }).length;
    var body = segs.map(function (s, i) {
      if (s.op === 'eq') return h('span', { key: i }, s.text);
      if (s.op === 'ins') {
        if (mode === 'previous') return null;
        if (mode === 'final') return h('span', { key: i }, s.text);
        return h('ins', { key: i, className: 'rd-ins' }, h(Sr, null, '[início de texto acrescentado] '), s.text, h(Sr, null, ' [fim de texto acrescentado]'));
      }
      if (mode === 'final') return null;
      if (mode === 'previous') return h('span', { key: i }, s.text);
      return h('del', { key: i, className: 'rd-del' }, h(Sr, null, '[início de texto eliminado] '), s.text, h(Sr, null, ' [fim de texto eliminado]'));
    });
    return h('div', { className: 'rd-redline' },
      props.caption ? h('p', { className: 'rd-redline-cap' }, props.caption) : null,
      h('p', { className: cx('rd-statute', mode === 'inline' && 'rd-redline-marked') }, props.number ? h('span', { className: 'rd-num' }, props.number + ' ') : null, body),
      mode === 'inline' && props.legend !== false ? h('p', { className: 'rd-redline-legend' },
        h('span', { className: 'rd-key rd-key-ins' }, h('ins', null, 'acrescentado'), ' (' + nIns + ')'),
        h('span', { className: 'rd-key rd-key-del' }, h('del', null, 'eliminado'), ' (' + nDel + ')')) : null);
  }

  // ---- TextOrigin -----------------------------------------------------------
  // paragraphs: [{number?, kind?: 'n'|'al'|'rev'|'tab', spans: [{text, act}]}] ('tab': a table row, cells split by │)
  // acts: [{index, label, date, href?, hrefLabel?, diffHref?, beforeHref?, nota?}] (nota: a short line under "Escrito por")
  // margem: put a note beside each paragraph with the acts that wrote it (needs about 360 px on the right).
  // The chips mark words. They do not change the text. Choosing a phrase opens a popover under
  // its paragraph with links to the change that wrote it (diffHref), to the text before that
  // change (beforeHref) and to the redação it made (href).
  function TextOrigin(props) {
    var acts = props.acts || [];
    var byIndex = {};
    acts.forEach(function (a) { byIndex[a.index] = a; });
    var st = React.useState(props.focus == null ? null : props.focus);
    var focus = st[0], setFocus = st[1];
    var sp = React.useState(null);  // paragraph of the chosen phrase, or null when a chip chose
    var para = sp[0], setPara = sp[1];
    var sel = focus == null ? null : byIndex[focus];
    var legendId = React.useId ? React.useId() : 'rd-origin-key';
    function links(a) {
      return [
        a.diffHref ? h('a', { key: 'd', className: 'rd-link', href: a.diffHref }, 'Ver a alteração') : null,
        a.beforeHref ? h('a', { key: 'b', className: 'rd-link', href: a.beforeHref }, 'Ver como estava antes') : null,
        a.href ? h('a', { key: 'h', className: 'rd-link', href: a.href }, a.hrefLabel || 'Ver esta redação') : null
      ].filter(Boolean);
    }
    function about(a) {
      return ['Escrito por: ', h('strong', { key: 's' }, a.label), a.date ? ', publicação a ' + dataPorExtenso(a.date) + '.' : '.'];
    }
    // The spans of one paragraph, each a phrase button. pi: the block the popover opens under.
    // marcas: marks only, no buttons (table cells: a few digits are too small to tap; the
    // margin note and the legend choose the act instead).
    function frases(spans, pi, marcas) {
      return spans.map(function (s, si) {
        var a = byIndex[s.act] || { label: '' };
        var toggle = function () { var off = focus === s.act && para === pi; setFocus(off ? null : s.act); setPara(off ? null : pi); };
        // Punctuation alone is not a phrase: it keeps its mark but is not a target.
        if (marcas || !/[\p{L}\p{N}]/u.test(s.text)) return h('span', { key: si, className: cx('rd-origin-span', 'rd-u-act-' + s.act, focus != null && focus !== s.act && 'is-dim') }, s.text);
        return h('span', {
          key: si, role: 'button', tabIndex: 0,
          className: cx('rd-origin-span', 'rd-u-act-' + s.act, focus != null && focus !== s.act && 'is-dim', focus === s.act && 'is-focus'),
          'aria-pressed': focus === s.act,
          'aria-label': s.text + '. Origem do texto: ' + a.label,
          onClick: toggle,
          onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }
        }, s.text);
      });
    }
    // A table row (kind 'tab'): the spans hold "cell │ cell │ cell". Each cell is a grid column.
    function linhaTabela(p, pi, ri) {
      var cels = [[]];
      p.spans.forEach(function (s) {
        s.text.split(/\s*│\s*/).forEach(function (t, k) { if (k) cels.push([]); if (t) cels[cels.length - 1].push({ text: t, act: s.act }); });
      });
      var txt = cels.map(function (c) { return c.map(function (x) { return x.text; }).join(''); });
      var cab = !txt.some(function (c) { return /\d/.test(c); });
      return h('p', { key: ri, className: cx('rd-statute', 'rd-p-tab', cab && 'rd-p-tab-cab'), style: { gridTemplateColumns: 'minmax(0, 2fr) repeat(' + Math.max(1, cels.length - 1) + ', minmax(0, 1fr))' } },
        cels.map(function (c, k) {
          return h('span', { key: k, className: cx('rd-cel', /^[\d\s,.%€−-]+$/.test(txt[k]) && txt[k] && 'rd-cel-num') },
            k ? h('span', { className: 'rd-sr' }, '; ') : null, frases(c, pi, true));
        }));
    }
    // Rows of one table make one block, with one note beside it: a note per row would not fit.
    var blocos = [];
    (props.paragraphs || []).forEach(function (p) {
      var last = blocos[blocos.length - 1];
      if (p.kind === 'tab' && last && last[0].kind === 'tab') last.push(p); else blocos.push([p]);
    });
    return h('div', { className: 'rd-origin' },
      h('div', { className: 'rd-origin-text' },
        blocos.map(function (ps, pi) {
          // margem: a note beside each paragraph names the acts that wrote words in it, newest first.
          var nos = [];
          ps.forEach(function (p) { p.spans.forEach(function (s) { if (s.act !== 0 && /[\p{L}\p{N}]/u.test(s.text) && nos.indexOf(s.act) < 0) nos.push(s.act); }); });
          nos.sort(function (a, b) { return a - b; });
          var linha = function (pEl, popEl) {
            if (!props.margem) return h(React.Fragment, { key: pi }, pEl, popEl);
            return h('div', { key: pi, className: 'rd-origin-row' },
              h('div', { className: 'rd-origin-main' }, pEl, popEl),
              h('div', { className: 'rd-origin-margem' }, nos.map(function (ai) {
                var a = byIndex[ai] || { label: '' };
                return h('button', { key: ai, type: 'button', className: cx('rd-origin-marg', focus === ai && 'is-on'), 'aria-pressed': focus === ai,
                  'aria-label': 'Marcar as palavras ' + (ps.length > 1 ? 'desta tabela' : 'deste parágrafo') + ' escritas por ' + a.label,
                  onClick: function () { var off = focus === ai && para === pi; setFocus(off ? null : ai); setPara(off ? null : pi); } },
                  h('span', { className: 'rd-origin-band rd-c-act-' + ai, 'aria-hidden': 'true' }), a.label);
              })));
          };
          var p = ps[0];
          // A gap line (a story figure that shows only some números): muted text, not a phrase.
          if (p.gap) return h('p', { key: pi, className: 'rd-origin-gap' }, p.gap);
          return linha(
            p.kind === 'tab' ? h('div', { className: 'rd-tabela' }, ps.map(function (r, ri) { return linhaTabela(r, pi, ri); }))
              : h('p', { className: cx('rd-statute', p.kind && 'rd-p-' + p.kind) },
                p.number ? h('span', { className: 'rd-num' }, p.number + ' ') : null, frases(p.spans, pi)),
            sel && para === pi ? h('div', { className: 'rd-origin-pop', role: 'group', 'aria-label': 'Origem do texto' },
              h('p', { className: 'rd-origin-pop-text' }, about(sel)),
              sel.nota ? h('p', { className: 'rd-origin-pop-nota' }, sel.nota) : null,
              links(sel).length ? h('p', { className: 'rd-origin-pop-links' }, links(sel)) : null) : null);
        })),
      h('div', { className: 'rd-origin-key' },
        h('p', { className: 'rd-origin-key-label', id: legendId }, props.legendLabel || 'Marcar as palavras escritas por:'),
        h('div', { className: 'rd-origin-legend', role: 'list', 'aria-labelledby': legendId },
          acts.map(function (a) {
            return h('div', { key: a.index, role: 'listitem' }, h(ActChip, { act: a, selected: focus === a.index, onClick: function () { setFocus(focus === a.index ? null : a.index); setPara(null); } }));
          }))),
      h('p', { className: 'rd-origin-note', 'aria-live': 'polite' },
        sel ? about(sel).concat(para == null && links(sel).length ? [' '].concat(links(sel).map(function (l, k) { return [k ? ' · ' : '', l]; })) : [])
          : 'Escolha uma frase ou um diploma para marcar as palavras que ele escreveu.'));
  }

  // ---- TimeRuler ------------------------------------------------------------
  // A hairline time axis for one article: a tick where each redação starts (half ticks for
  // retificações), year labels at their true positions, and the redação on screen as a heavy
  // span. Each span is a radio in one radiogroup: one tab stop, arrow keys move, Home and End
  // go to the ends. versions: [{label, start, technical?, pending?}] oldest first.
  function dias(a, b) { return (Date.parse(b) - Date.parse(a)) / 86400000; }
  function TimeRuler(props) {
    var vs = props.versions || [], i = props.current, n = vs.length;
    var today = props.today || '2026-10-28';
    if (!n) return null;
    var lo = vs[0].start, last = vs[n - 1].start > today ? vs[n - 1].start : today;
    var total = Math.max(1, dias(lo, last));
    var pct = function (d) { return Math.max(0, Math.min(100, dias(lo, d) / total * 100)); };
    var go = function (k) { if (k >= 0 && k < n && k !== i && props.onGo) props.onGo(k); };
    var y0 = Number(lo.slice(0, 4)) + 1, y1 = Number(last.slice(0, 4));
    var step = y1 - y0 > 24 ? 10 : y1 - y0 > 10 ? 2 : 1;
    var years = [];
    for (var y = y0; y <= y1; y++) if ((y - y0) % step === 0 && pct(y + '-01-01') < 94) years.push(y);
    var onKey = function (e) {
      var k = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowDown: i + 1, Home: 0, End: n - 1 }[e.key];
      if (k == null || k < 0 || k >= n) return;
      e.preventDefault();
      go(k);
      setTimeout(function () { var b = document.querySelectorAll('#' + (props.id || 'rd-ruler') + ' .rd-ruler-span')[k]; if (b) b.focus(); }, 0);
    };
    return h('div', { className: 'rd-ruler', id: props.id || 'rd-ruler' },
      h('div', { className: 'rd-ruler-track', role: 'radiogroup', 'aria-label': props.label || 'Linha do tempo das redações', onKeyDown: onKey },
        h('span', { className: 'rd-ruler-line', 'aria-hidden': 'true' }),
        years.map(function (y) { return h('span', { key: 'y' + y, className: 'rd-ruler-year', style: { left: pct(y + '-01-01') + '%' }, 'aria-hidden': 'true' }); }),
        vs.map(function (v, k) {
          var end = k < n - 1 ? vs[k + 1].start : last;
          var left = pct(v.start), width = Math.max(0, pct(end) - left);
          return h(React.Fragment, { key: k },
            h('span', { className: cx('rd-ruler-tick', v.technical && 'is-half', v.pending && 'is-pending'), style: { left: left + '%' }, 'aria-hidden': 'true' }),
            h('button', {
              type: 'button', role: 'radio', 'aria-checked': k === i, tabIndex: k === i ? 0 : -1, 'aria-label': v.label, title: v.label,
              className: cx('rd-ruler-span', k === i && 'is-on', v.pending && 'is-pending'),
              style: { left: left + '%', width: 'max(' + width + '%, 8px)' },
              onClick: function () { go(k); }
            }));
        }),
        // One marker for the redação on screen: it slides to the next one instead of jumping.
        vs[i] ? h('span', { className: cx('rd-ruler-marca', vs[i].pending && 'is-pending'), 'aria-hidden': 'true',
          style: { left: pct(vs[i].start) + '%', width: 'max(' + Math.max(0, pct(i < n - 1 ? vs[i + 1].start : last) - pct(vs[i].start)) + '%, 8px)' } }) : null,
        h('span', { className: 'rd-ruler-today', style: { left: pct(today) + '%' }, 'aria-hidden': 'true' })),
      h('div', { className: 'rd-ruler-labels', 'aria-hidden': 'true' },
        years.map(function (y) { return h('span', { key: y, style: { left: pct(y + '-01-01') + '%' } }, y); }),
        h('span', { className: 'rd-ruler-hoje', style: { left: pct(today) + '%' } }, 'hoje')));
  }

  // ---- VersionBar -------------------------------------------------------------
  // The one sticky row of the article page: previous and next redação around a short status
  // that screen readers announce, and room on the right for the view tabs and the date.
  // Inside the row, ← and → move one redação and Home and End go to the ends.
  function VersionBar(props) {
    var i = props.current, n = props.count;
    var id = props.id || 'rd-vbar';
    var go = function (k) { if (k >= 0 && k < n && k !== i && props.onGo) props.onGo(k); };
    var onKey = function (e) {
      if (!e.target.classList.contains('rd-vbar-step') || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[e.key];
      if (k == null || k < 0 || k >= n) return;
      e.preventDefault();
      go(k);
    };
    return h('div', { className: 'rd-vbar', id: id, role: 'group', 'aria-label': props.heading || 'Redação mostrada', onKeyDown: onKey },
      h('button', { type: 'button', className: 'rd-vbar-step', 'aria-disabled': i <= 0, 'aria-label': 'Redação anterior', 'aria-describedby': id + '-s', onClick: function () { go(i - 1); } },
        h('span', { 'aria-hidden': 'true' }, '‹ '), 'Anterior'),
      h('button', { type: 'button', className: 'rd-vbar-step', 'aria-disabled': i >= n - 1, 'aria-label': 'Redação seguinte', 'aria-describedby': id + '-s', onClick: function () { go(i + 1); } },
        'Seguinte', h('span', { 'aria-hidden': 'true' }, ' ›')),
      h('p', { id: id + '-s', className: 'rd-vbar-status', role: 'status', onClick: props.onStatus }, props.status),
      props.children ? h('div', { className: 'rd-vbar-tools' }, props.children) : null);
  }

  // ---- Register ---------------------------------------------------------------
  // The history of an article as a ledger: one ruled row per redação, oldest first, with
  // ordinal, act and start date. The row on screen has an inset verde rule and opens to show
  // its details. Retificações are quiet and sit under the redação they correct.
  // items: [{ordinal, label, date, band?, href?, current?, technical?, details?}]
  function Register(props) {
    return h('ol', { className: 'rd-reg', 'aria-label': props.label || 'Redações' },
      (props.items || []).map(function (it, k) {
        return h('li', { key: k, className: cx('rd-reg-row', it.current && 'is-current', it.technical && 'is-technical'), 'aria-current': it.current ? 'true' : undefined },
          h('span', { className: 'rd-reg-ord' }, it.ordinal),
          h('span', { className: 'rd-reg-band rd-c-act-' + (it.band == null ? 0 : it.band), 'aria-hidden': 'true' }),
          it.href && !it.current ? h('a', { className: 'rd-reg-act', href: it.href }, it.label) : h('span', { className: 'rd-reg-act' }, it.label),
          h('span', { className: 'rd-reg-date' }, it.date),
          it.current && it.details ? h('div', { className: 'rd-reg-more' }, it.details) : null);
      }));
  }

  // ---- Popover ----------------------------------------------------------------
  // A small disclosure that floats: a summary button and a panel. Esc closes it and returns
  // focus to the button.
  function Popover(props) {
    var ref = React.useRef(null);
    return h('details', { className: cx('rd-pop', props.className), ref: ref, onKeyDown: function (e) {
      if (e.key === 'Escape' && ref.current && ref.current.open) { ref.current.open = false; ref.current.querySelector('summary').focus(); }
    } },
      h('summary', { className: 'rd-pop-btn' }, props.label),
      h('div', { className: 'rd-pop-body', role: 'group', 'aria-label': props.title || props.label }, props.children));
  }

  // ---- DateLens ---------------------------------------------------------------
  var BASES = [
    { id: 'vigor', label: 'Em vigor' },
    { id: 'efeitos', label: 'Produção de efeitos' },
    { id: 'publicacao', label: 'Publicação' }
  ];
  // The lens changes the page only when the reader confirms a date ("Ver", Enter or "Hoje"),
  // so typing a date with the keyboard does not reload the page at every digit. Choosing a
  // basis applies at once. When the page changes the date, the lens follows it.
  function DateLens(props) {
    var sd = React.useState(props.date || '2019-03-14');
    var date = sd[0], setDate = sd[1];
    var sb = React.useState(props.basis || 'vigor');
    var basis = sb[0], setBasis = sb[1];
    React.useEffect(function () { if (props.date) setDate(props.date); }, [props.date]);
    React.useEffect(function () { if (props.basis) setBasis(props.basis); }, [props.basis]);
    var id = props.id || 'rd-lens';
    var shown = props.date || date;
    var valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
    var commit = function (d, b) { if (props.onChange && /^\d{4}-\d{2}-\d{2}$/.test(d)) props.onChange({ date: d, basis: b }); };
    var phrase = {
      vigor: 'Texto em vigor a ',
      efeitos: 'Texto que produz efeitos a ',
      publicacao: 'Texto publicado até '
    }[basis];
    return h('form', { className: 'rd-lens', role: 'search', 'aria-label': 'Ver a lei numa data', onSubmit: function (e) { e.preventDefault(); commit(date, basis); } },
      h('div', { className: 'rd-lens-row' },
        h('label', { htmlFor: id + '-date', className: 'rd-lens-label' }, 'Ver a lei como estava em'),
        h('input', { id: id + '-date', type: 'date', className: 'rd-input', value: date, onChange: function (e) { setDate(e.target.value); } }),
        h(Button, { type: 'submit', variant: 'primary', 'aria-disabled': !valid }, 'Ver'),
        h(Button, { variant: 'ghost', onClick: function () { var t = props.today || '2026-10-28'; setDate(t); commit(t, basis); } }, 'Hoje')),
      h('fieldset', { className: 'rd-seg' },
        h('legend', { className: 'rd-sr' }, 'Que data conta'),
        BASES.filter(function (b) { return !props.bases || props.bases.indexOf(b.id) >= 0; }).map(function (b) {
          return h('label', { key: b.id, className: cx('rd-seg-opt', basis === b.id && 'is-on') },
            h('input', { type: 'radio', name: id + '-basis', value: b.id, checked: basis === b.id, onChange: function () { setBasis(b.id); commit(shown, b.id); } }),
            h('span', { className: 'rd-seg-mark', 'aria-hidden': 'true' }, basis === b.id ? '✓' : ''),
            b.label);
        })),
      h('p', { className: 'rd-lens-out' }, phrase, h('strong', null, dataPorExtenso(shown)), '.'));
  }

  // ---- VersionTimeline -------------------------------------------------------
  // versions: [{id, title, href?, act, published, inForce, until?, summary?, verification?,
  //   technical?, pending?, links?: [{href, label}]}]
  // current: the id the page shows ("A ver esta redação"). inForceToday: the id in force today.
  // Before, one green "Em vigor" pill marked the shown version, even a version replaced long ago.
  function VersionTimeline(props) {
    var vs = props.versions || [];
    return h('ol', { className: 'rd-tl', 'aria-label': props.label || 'História desta lei' },
      vs.map(function (v) {
        var current = v.id === props.current;
        return h('li', { key: v.id, className: cx('rd-tl-item', current && 'is-current', v.technical && 'is-technical', v.pending && 'is-pending'), 'aria-current': current ? 'true' : undefined },
          h('span', { className: 'rd-tl-node', 'aria-hidden': 'true' }),
          h('div', { className: 'rd-tl-body' },
            h('div', { className: 'rd-tl-head' },
              v.href && !current ? h('a', { className: 'rd-tl-title rd-link', href: v.href }, v.title) : h('span', { className: 'rd-tl-title' }, v.title),
              current ? h(StatusPill, { status: 'atual' }) : null,
              v.id === props.inForceToday ? h(StatusPill, { status: 'vigor' }, 'Em vigor hoje') : null,
              v.pending ? h(StatusPill, { status: 'pendente' }) : null,
              v.verification ? h(StatusPill, { status: v.verification }) : null),
            v.act ? h('p', { className: 'rd-tl-act' }, v.act) : null,
            h('dl', { className: 'rd-tl-dates' },
              v.published ? [h('dt', { key: 'a' }, 'Publicação'), h('dd', { key: 'b' }, dataPorExtenso(v.published))] : null,
              v.inForce ? [h('dt', { key: 'c' }, 'Em vigor'), h('dd', { key: 'd' }, (v.until ? 'de ' : 'desde ') + dataPorExtenso(v.inForce) + (v.until ? ' a ' + dataPorExtenso(v.until) : ''))] : null),
            v.summary ? h('p', { className: 'rd-tl-sum' }, v.summary) : null,
            v.links && v.links.length ? h('p', { className: 'rd-tl-links' }, v.links.map(function (l, k) {
              return h(React.Fragment, { key: k }, k ? ' · ' : '', h('a', { className: 'rd-link', href: l.href }, l.label));
            })) : null));
      }));
  }

  // ---- ProcessTrack ----------------------------------------------------------
  // stages: [{label, date?, state: 'done'|'current'|'todo'|'stopped', note?}]
  var STAGE_WORD = { done: 'concluído', current: 'fase atual', todo: 'por realizar', stopped: 'interrompido' };
  function ProcessTrack(props) {
    return h('div', { className: 'rd-proc' },
      props.title ? h('p', { className: 'rd-proc-title' }, props.title) : null,
      h('ol', { className: 'rd-proc-list' },
        (props.stages || []).map(function (s, i) {
          return h('li', { key: i, className: 'rd-proc-step is-' + s.state, 'aria-current': s.state === 'current' ? 'step' : undefined },
            h('span', { className: 'rd-proc-dot', 'aria-hidden': 'true' }, s.state === 'done' ? '✓' : s.state === 'stopped' ? '✕' : ''),
            h('span', { className: 'rd-proc-label' }, s.label, h(Sr, null, ': ' + STAGE_WORD[s.state])),
            s.date ? h('span', { className: 'rd-proc-date' }, dataPorExtenso(s.date)) : null,
            s.note ? h('span', { className: 'rd-proc-note' }, s.note) : null);
        })));
  }

  // ---- VoteBar ---------------------------------------------------------------
  // votes: [{group, seats, vote: 'favor'|'contra'|'abstencao'|'ausente'}]
  var VOTE = { favor: { w: 'A favor', g: '✓' }, contra: { w: 'Contra', g: '✕' }, abstencao: { w: 'Abstenção', g: '–' }, ausente: { w: 'Ausente', g: '·' } };
  function VoteBar(props) {
    var votes = props.votes || [];
    var seats = votes.some(function (v) { return v.seats != null; });
    var tot = { favor: 0, contra: 0, abstencao: 0, ausente: 0 };
    votes.forEach(function (v) { tot[v.vote] += seats ? (v.seats || 0) : 1; });
    return h('figure', { className: 'rd-vote' },
      h('figcaption', { className: 'rd-vote-cap' },
        h('span', { className: 'rd-vote-title' }, props.title || 'Votação'),
        props.result ? h('strong', { className: 'rd-vote-res' }, props.result) : null),
      !seats ? h('p', { className: 'rd-vote-tot' }, ['favor', 'contra', 'abstencao'].map(function (k) {
        return h('span', { key: k, className: 'rd-vote-k' }, h('span', { className: 'rd-vote-sw rd-vote-' + k, 'aria-hidden': 'true' }), VOTE[k].w + ': ' + tot[k] + (tot[k] === 1 ? ' grupo' : ' grupos'));
      })) : null,
      !seats ? null : h('div', { className: 'rd-vote-bar', role: 'img', 'aria-label': 'A favor ' + tot.favor + ', contra ' + tot.contra + ', abstenção ' + tot.abstencao + (tot.ausente ? ', ausentes ' + tot.ausente : '') },
        ['favor', 'abstencao', 'contra', 'ausente'].map(function (k) {
          return tot[k] ? h('span', { key: k, className: 'rd-vote-seg rd-vote-' + k, style: { flexGrow: tot[k] } }) : null;
        })),
      !seats ? null : h('p', { className: 'rd-vote-tot' },
        ['favor', 'contra', 'abstencao'].map(function (k) {
          return h('span', { key: k, className: 'rd-vote-k' }, h('span', { className: 'rd-vote-sw rd-vote-' + k, 'aria-hidden': 'true' }), VOTE[k].w + ' ' + tot[k]);
        })),
      h('table', { className: 'rd-vote-table' },
        h('caption', { className: 'rd-sr' }, 'Sentido de voto por grupo parlamentar'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Grupo parlamentar'), seats ? h('th', { scope: 'col' }, 'Deputados') : null, h('th', { scope: 'col' }, 'Voto'))),
        h('tbody', null, votes.map(function (v, i) {
          return h('tr', { key: i },
            h('th', { scope: 'row' }, v.group),
            seats ? h('td', { className: 'rd-num-col' }, v.seats) : null,
            h('td', null, h('span', { className: 'rd-vote-cell rd-vote-t-' + v.vote }, h('span', { 'aria-hidden': 'true' }, VOTE[v.vote].g + ' '), VOTE[v.vote].w)));
        }))));
  }

  // ---- Votacao ---------------------------------------------------------------
  // One vote, in words and without colour: three rows (A favor, Contra, Abstenção) in this
  // order, groups in the Assembleia's own order (ordem), never sorted by sentido or size.
  // Deputy counts only when the record has them. Dissent goes in the group's line. Groups the
  // record lists as absent say "Ausente". Groups missing from the record say "sem registo".
  // props: {grupos: {GP: sentido}, ordem: [GP], contagens?, dissidencia?, foraDeGrupo?,
  //   ausentes?, semRegisto? (groups with seats that day and no record), unanime?, resultado?, verificacao?,
  //   nomes? ({GP: name in the Assembleia's records}: each sigla then reads as the group's name),
  //   destaque? ([GP]: the groups that proposed the text, in bold)}
  var SENTIDOS = [['favor', 'A favor'], ['contra', 'Contra'], ['abstencao', 'Abstenção']];
  var PALAVRA = { favor: 'a favor', contra: 'contra', abstencao: 'abstenção' };
  // "PS, PSD e CDS" as elements: items joined by commas.
  function juntar(xs) {
    var out = [];
    xs.forEach(function (x, k) { if (k) out.push(', '); out.push(h(React.Fragment, { key: k }, x)); });
    return out;
  }
  // A number that counts to its value once, when it scrolls into view (app/motion.js). The digits shown
  // are aria-hidden; the value itself is always in the DOM, for screen readers and copy.
  function Conta(props) {
    var n = props.n;
    return h('span', { className: 'conta', 'data-n': n, style: { minWidth: String(n).length + 'ch' } },
      h('span', { className: 'conta-v', 'aria-hidden': 'true' }, String(n)), h('span', { className: 'rd-sr' }, String(n)));
  }
  function Votacao(props) {
    var g = props.grupos || {}, cont = props.contagens || {}, dis = props.dissidencia || [], fora = props.foraDeGrupo || [];
    var nomes = props.nomes || {};
    // Each sigla carries data-grupo: the page lights that group in every vote (app/motion.js). The
    // block is one tab stop; the arrows move between its groups.
    var paragem = 0;
    var ordem = (props.ordem || []).slice();
    Object.keys(g).forEach(function (k) { if (ordem.indexOf(k) < 0) ordem.push(k); });
    var ausentes = props.ausentes || [];
    // A sigla with its name: seen as the sigla, heard as the name.
    var destaque = props.destaque || [];
    function sigla(k) {
      var foco = { 'data-grupo': k, tabIndex: paragem++ === 0 ? 0 : -1 };
      var s = nomes[k] ? h('abbr', Object.assign({ title: nomes[k] }, foco), h('span', { 'aria-hidden': 'true' }, k), h('span', { className: 'rd-sr' }, nomes[k])) : h('span', foco, k);
      return destaque.indexOf(k) >= 0 ? h('strong', { className: 'rd-votos-destaque' }, s) : s;
    }
    function grupo(k) {
      var n = cont[k] && cont[k][g[k]];
      var extra = dis.filter(function (d) { return d.grupo === k; }).map(function (d) {
        return d.nome ? d.nome + ' votou ' + PALAVRA[d.sentido] : d.n + (d.n === 1 ? ' deputado votou ' : ' deputados votaram ') + PALAVRA[d.sentido];
      });
      return [sigla(k), (n ? ' ' + n : '') + (extra.length ? ' (' + extra.join(', ') + ')' : '')];
    }
    var linhas = SENTIDOS.map(function (s) {
      var gs = ordem.filter(function (k) { return g[k] === s[0]; }).map(grupo);
      fora.filter(function (x) { return x.sentido === s[0]; }).forEach(function (x) { gs.push(x.nome + ' (sem grupo parlamentar)'); });
      return [s[1], gs.length ? juntar(gs) : 'nenhum grupo'];
    });
    var semRegisto = props.unanime ? [] : props.semRegisto || [];
    var v = props.verificacao;
    return h('div', { className: 'rd-votacao' },
      props.unanime ? h('p', { className: 'rd-votos-nota' }, (props.resultado || 'Aprovado') + ' por unanimidade.', ausentes.length ? [' Ausentes: ', juntar(ausentes.map(sigla)), '.'] : null)
        : h('dl', { className: 'rd-votos' }, linhas.map(function (l) { return [h('dt', { key: l[0] + 't' }, l[0]), h('dd', { key: l[0] + 'd' }, l[1])]; }),
          ausentes.length ? [h('dt', { key: 'at' }, 'Ausente'), h('dd', { key: 'ad' }, juntar(ausentes.map(sigla)))] : null,
          semRegisto.length ? [h('dt', { key: 'st' }, 'Sem registo'), h('dd', { key: 'sd' }, juntar(semRegisto.map(sigla)))] : null),
      v && !v.ok ? h('p', { className: 'rd-votos-aviso' }, h('strong', null, 'Atenção: '), 'o resultado registado não corresponde aos votos registados. Consulte o Diário da Assembleia da República.') : null,
      v && props.mostrarConta ? h('p', { className: 'rd-votos-nota' }, v.metodo === 'contagens' ? 'Deputados que votaram: ' : 'Conta pelos assentos de cada grupo nesse dia: ',
        h(Conta, { n: v.favor }), ' a favor, ', h(Conta, { n: v.contra }), ' contra, ', h(Conta, { n: v.abstencao }), v.abstencao === 1 ? ' abstenção.' : ' abstenções.') : null);
  }

  // ---- Termo -----------------------------------------------------------------
  // A word of the glossary inside interface copy. The word is a button with a dotted underline
  // (it is not a link). Click, Enter or Space opens the definition under it, and focus stays on
  // the word; Tab then moves into the panel, which follows the word in the document. Esc closes
  // it from the word or the panel and returns focus to the word. A click outside closes it.
  // With a fine pointer, resting on the word for 400 ms opens it too. It stays open while the
  // pointer is on the word or the panel (WCAG 1.4.13) and closes 300 ms after the pointer leaves
  // both. A click after a hover pins it open. On a phone (coarse pointer or narrow screen),
  // onAbrirFolha(id, button) lets the page open its bottom sheet instead.
  // props: {id, texto, def: {termo, definicao: [], apoio: [], fonte: {rota | url, texto}}, onAbrirFolha?}
  var nTermo = 0;
  function combina(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  // The definition, the law that supports it, its source and how it was prepared. bloco: as
  // paragraphs (a sheet, a page) instead of spans (inside a sentence).
  function TermoConteudo(props) {
    var def = props.def || {}, T = props.bloco ? 'p' : 'span', f = def.fonte || {};
    var href = f.rota || f.url;
    return h(React.Fragment, null,
      props.bloco ? null : h('span', { className: 'rd-termo-nome' }, def.termo),
      (def.definicao || []).map(function (t, k) { return h(T, { key: 'd' + k, className: 'rd-termo-def' }, t); }),
      (def.apoio || []).slice(0, props.bloco ? 3 : 1).map(function (t, k) {
        return h(T, { key: 'a' + k, className: 'rd-termo-lei' }, 'O que diz a lei: ', h('span', { 'data-citacao': '' }, '«…' + String(t).replace(/[\s.,;:]+$/, '') + '…»'));
      }),
      href ? h(T, { className: 'rd-termo-fonte' }, 'Fonte: ', f.url ? h('a', { href: href, target: '_blank', rel: 'noopener' }, f.texto + ' ↗') : h('a', { href: href }, f.texto)) : null,
      h(T, { className: 'rd-termo-aviso' }, 'Definição preparada com ajuda de uma ferramenta automática.'),
      props.semGlossario ? null : h(T, { className: 'rd-termo-ver' }, h('a', { href: '#/glossario/' + props.id }, 'Ver no glossário')));
  }
  function Termo(props) {
    var st = React.useState(null);  // null (closed), 'clique', 'hover' or 'fixo'
    var modo = st[0], setModo = st[1];
    var ids = React.useRef(null);
    if (!ids.current) ids.current = 'rd-termo-' + String(props.id || 't').replace(/[^a-z0-9-]/gi, '') + '-' + (++nTermo);
    var raiz = React.useRef(null), btn = React.useRef(null), painel = React.useRef(null), relogio = React.useRef(null);
    var aberto = modo != null;
    function parar() { if (relogio.current) { clearTimeout(relogio.current); relogio.current = null; } }
    function fechar(foco) { parar(); setModo(null); if (foco && btn.current) btn.current.focus(); }
    React.useEffect(function () { return parar; }, []);
    // A click outside closes it.
    React.useEffect(function () {
      if (!aberto) return;
      function fora(e) { if (raiz.current && !raiz.current.contains(e.target)) fechar(false); }
      document.addEventListener('pointerdown', fora);
      return function () { document.removeEventListener('pointerdown', fora); };
    }, [aberto]);
    // Under the word; above it near the bottom of the screen; inside the screen on both sides.
    React.useLayoutEffect(function () {
      var p = painel.current;
      if (!aberto || !p) return;
      p.style.left = ''; p.classList.remove('is-acima');
      var r = p.getBoundingClientRect(), w = window.innerWidth || 0, a = window.innerHeight || 0;
      if (r.right > w - 16) p.style.left = Math.round(-(r.right - (w - 16))) + 'px';
      r = p.getBoundingClientRect();
      if (r.left < 16) p.style.left = Math.round((parseFloat(p.style.left) || 0) + 16 - r.left) + 'px';
      var b = btn.current.getBoundingClientRect();
      if (r.bottom > a - 8 && b.top - r.height - 8 > 0) p.classList.add('is-acima');
    }, [aberto]);
    function clique() {
      if (props.onAbrirFolha && combina('(max-width: 760px), (pointer: coarse)')) { fechar(false); props.onAbrirFolha(props.id, btn.current); return; }
      parar();
      if (modo === 'hover') setModo('fixo');
      else setModo(aberto ? null : 'clique');
    }
    function entrar() {
      if (!combina('(hover: hover) and (pointer: fine)') || combina('(max-width: 760px)')) return;
      parar();
      if (!aberto) relogio.current = setTimeout(function () { setModo('hover'); }, 400);
    }
    function sair() {
      parar();
      if (modo === 'hover') relogio.current = setTimeout(function () { setModo(null); }, 300);
    }
    return h('span', { className: 'rd-termo', ref: raiz,
      onKeyDown: function (e) { if (e.key === 'Escape' && aberto) { e.stopPropagation(); fechar(true); } } },
      h('button', { type: 'button', className: 'rd-termo-btn', ref: btn, 'aria-expanded': aberto, 'aria-controls': ids.current,
        onClick: clique, onMouseEnter: entrar, onMouseLeave: sair },
        props.texto, h('span', { className: 'rd-sr' }, ', definição')),
      h('span', { id: ids.current, ref: painel, className: 'rd-termo-painel', role: 'group', 'aria-label': (props.def || {}).termo || props.texto,
        hidden: !aberto, onMouseEnter: function () { parar(); }, onMouseLeave: sair },
        aberto ? h(TermoConteudo, { def: props.def, id: props.id }) : null));
  }

  // ---- Feito -----------------------------------------------------------------
  // A copy or share button's label: it swaps to the confirmation, and a tick draws itself beside it.
  // props: {feito, sim (the confirmation), nao (the label)}
  function Feito(props) {
    return h('span', { key: props.feito ? 'c' : 'n', className: cx('troca', props.feito && 'rd-feito') },
      props.feito ? [h('svg', { key: 'v', className: 'rd-visto', viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: 'M2.5 7.5l3 3 6-7' })), props.sim] : props.nao);
  }

  // ---- Citation --------------------------------------------------------------
  function Citation(props) {
    var sc = React.useState('Copiar citação');
    var label = sc[0], setLabel = sc[1];
    var ref = React.useRef(null);
    function copy() {
      var t = props.text;
      try {
        navigator.clipboard.writeText(t).then(function () { setLabel('Copiada'); }, select);
      } catch (e) { select(); }
    }
    function select() {
      var r = document.createRange();
      r.selectNodeContents(ref.current);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      setLabel('Selecionada: prima Ctrl+C');
    }
    return h('div', { className: 'rd-cite' },
      h('p', { className: 'rd-cite-text', ref: ref }, props.text),
      props.permalink ? h('p', { className: 'rd-cite-link' }, props.permalink) : null,
      h(Button, { onClick: copy }, h(Feito, { feito: label === 'Copiada', sim: label, nao: label })));
  }

  // ---- SourceNote ------------------------------------------------------------
  function SourceNote(props) {
    return h('aside', { className: cx('rd-src', props.tone === 'aviso' && 'rd-src-aviso'), 'aria-label': 'Fonte e fiabilidade' },
      h('p', { className: 'rd-src-main' }, props.children || 'Texto consolidado não oficial. Só a publicação no Diário da República faz fé.'),
      h('p', { className: 'rd-src-meta' },
        props.source ? h('a', { href: props.source.href, className: 'rd-link' }, props.source.label) : null,
        props.updated ? h('span', null, 'Atualizado ' + props.updated) : null,
        props.verification ? h(StatusPill, { status: props.verification }) : null));
  }

  // ---- Origem do texto -------------------------------------------------------
  // The law as plain text, in runs of lines that one act changed last (app.js originModel), each
  // run with its note. The note is the only control of a run. The words are not buttons and not
  // tab stops: a click on a word opens the sheet at that word's act, and keyboard users reach the
  // same through the note and the phrase walk (WCAG 2.5.8: inline targets, with a large alternative).
  // props: {runs: [{k, key, linhas: [{i, kind: 'n'|'al'|'tab'|'', nr, rev, spans: [{o, text, frase?}]}]}],
  //   notas: [{titulo, ano, l1, l2, aria, orig}] (one per run), cor: {o: {c: 1..7, padrao: ''|'tracejado'|'pontilhado'}},
  //   cat: {o: 'gov'|'dep'|'mix'|'dl'|'ret'|'unk'|'orig'}, lente: 'diploma'|'iniciativa',
  //   aberta: {run, o, frase} or null, onNota(k), onFrase(idx)}
  function OrigemTexto(props) {
    var runs = props.runs || [], notas = props.notas || [], cor = props.cor || {}, cat = props.cat || {}, aberta = props.aberta;
    var hv = React.useState(null), hover = hv[0], setHover = hv[1];
    var raiz = React.useRef(null);
    // At ≥ 1100 px a note never makes its run taller than its text: it drops l2, then l1.
    function compactar() {
      var el = raiz.current;
      if (!el) return;
      var largo = !window.matchMedia || window.matchMedia('(min-width: 1100px)').matches;
      Array.prototype.forEach.call(el.querySelectorAll('.rd-orun'), function (r) {
        r.classList.remove('is-c1', 'is-c2');
        if (!largo) return;
        var b = r.querySelector('.rd-onota'), t = r.querySelector('.rd-otxt');
        if (b && t && b.offsetHeight > t.offsetHeight + 1) r.classList.add('is-c1');
        if (b && t && b.offsetHeight > t.offsetHeight + 1) r.classList.add('is-c2');
      });
    }
    React.useLayoutEffect(compactar);
    React.useEffect(function () {
      window.addEventListener('resize', compactar);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(compactar);
      return function () { window.removeEventListener('resize', compactar); };
    }, []);
    // One word (a span of one act). Punctuation alone is not a phrase: no mark, no click (R4).
    function palavra(s, j, r) {
      if (s.frase == null) return s.text;
      var c = cor[s.o];
      var foco = aberta ? aberta.run === r.k && aberta.o === s.o : hover === r.k && s.o === r.key;
      return h('span', { key: j, className: cx('rd-ofr', c ? 'rd-ofr-c' + c.c : 'rd-ofr-orig', c && c.padrao && 'rd-ofr-' + c.padrao, 'rd-ok-' + (cat[s.o] || 'orig'),
        foco && 'is-foco', aberta && aberta.frase === s.frase && 'is-atual'), 'data-f': s.frase, 'data-o': s.o,
        // Selecting text is not a choice.
        onClick: function () { if (window.getSelection && String(window.getSelection())) return; if (props.onFrase) props.onFrase(s.frase); } }, s.text);
    }
    // A table row: the spans hold "cell │ cell │ cell"; each cell is a grid column.
    function linhaTabela(L, r) {
      var cels = [[]];
      L.spans.forEach(function (s) {
        s.text.split(/\s*│\s*/).forEach(function (t, k) { if (k) cels.push([]); if (t) cels[cels.length - 1].push(Object.assign({}, s, { text: t })); });
      });
      var txt = cels.map(function (c) { return c.map(function (x) { return x.text; }).join(''); });
      var cab = !txt.some(function (c) { return /\d/.test(c); });
      return h('p', { key: L.i, className: cx('rd-statute', 'rd-p-tab', cab && 'rd-p-tab-cab'), style: { gridTemplateColumns: 'minmax(0, 2fr) repeat(' + Math.max(1, cels.length - 1) + ', minmax(0, 1fr))' } },
        cels.map(function (c, k) {
          return h('span', { key: k, className: cx('rd-cel', /^[\d\s,.%€−-]+$/.test(txt[k]) && txt[k] && 'rd-cel-num') },
            k ? h('span', { className: 'rd-sr' }, '; ') : null, c.map(function (s, j) { return palavra(s, j, r); }));
        }));
    }
    function texto(r) {
      var out = [], tab = null;
      r.linhas.forEach(function (L) {
        if (L.kind === 'tab') {
          if (!tab) { tab = []; out.push(h('div', { key: 't' + L.i, className: 'rd-tabela' }, tab)); }
          tab.push(linhaTabela(L, r));
          return;
        }
        tab = null;
        out.push(h('p', { key: L.i, className: cx('rd-statute', L.kind && 'rd-p-' + L.kind, L.rev && 'rd-p-rev') },
          L.nr ? h('span', { className: 'rd-num' }, L.nr + ' ') : null, L.spans.map(function (s, j) { return palavra(s, j, r); })));
      });
      return out;
    }
    // ↑ and ↓ on a note move to the previous or next note.
    function tecla(e) {
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !e.target.classList || !e.target.classList.contains('rd-onota')) return;
      var bs = Array.prototype.slice.call(raiz.current.querySelectorAll('.rd-onota')), i = bs.indexOf(e.target);
      var n = bs[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) { e.preventDefault(); n.focus(); }
    }
    return h('div', { className: cx('rd-origem', props.lente === 'iniciativa' && 'is-lente-ini'), ref: raiz, onKeyDown: tecla },
      runs.map(function (r) {
        var aqui = !!aberta && aberta.run === r.k;
        return h('div', { key: r.k, className: cx('rd-orun', aqui && 'is-open', hover === r.k && 'is-hover'), role: 'group', 'aria-labelledby': 'onota-' + r.k, 'data-run': r.k,
          onMouseEnter: function () { setHover(r.k); }, onMouseLeave: function () { setHover(null); } },
          h(NotaOrigem, { id: 'onota-' + r.k, nota: notas[r.k], cor: cor[r.key], cat: cat[r.key], expandida: aqui,
            onClick: function () { if (props.onNota) props.onNota(r.k); },
            onFocus: function () { setHover(r.k); }, onBlur: function () { setHover(null); } }),
          h('div', { className: 'rd-otxt' }, texto(r)));
      }));
  }
  // The note of one run: the band in the act's colour, the act and its year, who started it (l1)
  // and what happened to it (l2). The whole note is one button; it opens the sheet.
  // props: {id, nota: {titulo, ano, l1, l2, aria, orig}, cor: {c, padrao}, cat, expandida, onClick, onFocus?, onBlur?}
  function NotaOrigem(props) {
    var n = props.nota || {}, c = props.cor;
    return h('div', { className: cx('rd-onota-col', c && c.padrao && 'rd-onota-' + c.padrao), style: { '--c': c ? 'var(--act-' + c.c + ')' : 'var(--act-0)' } },
      h('span', { className: 'rd-onota-band', 'aria-hidden': 'true' }),
      h('button', { type: 'button', id: props.id, className: 'rd-onota', 'aria-expanded': !!props.expandida, 'aria-controls': 'folha-origem', 'aria-label': n.aria,
        onClick: props.onClick, onFocus: props.onFocus, onBlur: props.onBlur },
        h('span', { className: 'rd-onota-tit' },
          h('span', { className: 'rd-osw rd-ok-' + (props.cat || 'orig'), 'aria-hidden': 'true' }),
          h('span', { className: 'rd-onota-nome' }, n.titulo, n.orig ? h('span', { className: 'rd-onota-ano' }, ' (texto original)') : null),
          h('span', { className: 'rd-onota-ano' }, n.ano)),
        n.l1 ? h('span', { className: 'rd-onota-l1' }, n.l1) : null,
        n.l2 ? h('span', { className: 'rd-onota-l2' }, n.l2) : null));
  }
  // The sheet: a non-modal dialog at the side (≥ 1100 px) or the bottom of the screen. It stays in
  // the page while closed (hidden), so its live region is there before it speaks. Esc anywhere
  // closes it; ← and → inside it walk the phrases. The page moves focus (heading, walk, note).
  // props: {aberta, titulo, andar: {ant: fn|null, seg: fn|null, segRotulo}, onFechar, vivo, children}
  function FolhaOrigem(props) {
    var andar = props.andar || {};
    var fechar = React.useRef(props.onFechar);
    fechar.current = props.onFechar;
    React.useEffect(function () {
      if (!props.aberta) return;
      function tecla(e) { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); fechar.current(); } }
      document.addEventListener('keydown', tecla);
      return function () { document.removeEventListener('keydown', tecla); };
    }, [props.aberta]);
    function seta(e) {
      if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      var f = e.key === 'ArrowRight' ? andar.seg : andar.ant;
      e.preventDefault();
      if (f) f();
    }
    return h(React.Fragment, null,
      h('div', { className: 'rd-sr', 'aria-live': 'polite' }, props.aberta ? props.vivo || '' : ''),
      h('div', { id: 'folha-origem', className: 'rd-folha', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'folha-origem-t', hidden: !props.aberta, onKeyDown: seta },
        props.aberta ? [
          // The bar stays at the top while the sheet scrolls: heading and «Fechar», then the walk.
          h('div', { key: 'b', className: 'rd-folha-topo' },
            h('div', { className: 'rd-folha-barra' },
              h('h2', { id: 'folha-origem-t', tabIndex: -1 }, props.titulo),
              h('button', { type: 'button', className: 'rd-folha-fechar', onClick: props.onFechar }, 'Fechar')),
            h('div', { className: 'rd-folha-andar' },
              h('button', { type: 'button', id: 'folha-origem-ant', disabled: !andar.ant, onClick: andar.ant || undefined }, '‹ Frase anterior'),
              h('button', { type: 'button', id: 'folha-origem-seg', disabled: !andar.seg, onClick: andar.seg || undefined }, andar.segRotulo || 'Frase seguinte ›'))),
          // Keyed by the live text: a new phrase sets its lines again.
          h('div', { key: 'c' + (props.vivo || ''), className: 'rd-folha-corpo' }, props.children)] : null));
  }
  // «Marcar o texto por:» Diploma (default) or Iniciativa da lei: a radiogroup with one tab stop;
  // the arrows move and choose. The initiative lens uses shapes, never a hue, and never a party.
  // props: {valor, onEscolher(v), categorias: [[k, rotulo]], honesta}
  function LenteOrigem(props) {
    var ops = [['diploma', 'Diploma'], ['iniciativa', 'Iniciativa da lei']];
    var refs = React.useRef({});
    function tecla(e, i) {
      if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      e.preventDefault();
      var n = ops[(i + (/Right|Down/.test(e.key) ? 1 : ops.length - 1)) % ops.length];
      props.onEscolher(n[0]);
      if (refs.current[n[0]]) refs.current[n[0]].focus();
    }
    return h('div', { className: 'rd-olente' },
      h('div', { className: 'rd-olente-linha' },
        h('span', { id: 'olente-r' }, 'Marcar o texto por:'),
        h('span', { role: 'radiogroup', 'aria-labelledby': 'olente-r', className: 'rd-olente-g' }, ops.map(function (o, i) {
          var on = props.valor === o[0];
          return h('button', { key: o[0], type: 'button', role: 'radio', 'aria-checked': on, tabIndex: on ? 0 : -1,
            ref: function (el) { refs.current[o[0]] = el; },
            onClick: function () { props.onEscolher(o[0]); }, onKeyDown: function (e) { tecla(e, i); } }, o[1]);
        }))),
      props.valor === 'iniciativa' ? h('div', { className: 'rd-olente-leg' },
        h('p', { className: 'rd-olente-honesta' }, props.honesta),
        h('ul', null, (props.categorias || []).map(function (c) {
          return h('li', { key: c[0] }, h('span', { className: 'rd-osw rd-ok-' + c[0], 'aria-hidden': 'true' }), c[1]);
        }))) : null);
  }

  var api = { Button: Button, StatusPill: StatusPill, ActChip: ActChip, Redline: Redline, TextOrigin: TextOrigin, TimeRuler: TimeRuler, VersionBar: VersionBar, Register: Register, Popover: Popover, DateLens: DateLens, VersionTimeline: VersionTimeline, ProcessTrack: ProcessTrack, VoteBar: VoteBar, Votacao: Votacao, Conta: Conta, Feito: Feito, Termo: Termo, TermoConteudo: TermoConteudo, Citation: Citation, SourceNote: SourceNote, OrigemTexto: OrigemTexto, NotaOrigem: NotaOrigem, FolhaOrigem: FolhaOrigem, LenteOrigem: LenteOrigem, dataPorExtenso: dataPorExtenso };
  window.Redacao = Object.assign(window.Redacao || {}, api);
})();
