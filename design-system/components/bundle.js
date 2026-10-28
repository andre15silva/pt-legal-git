/* @ds-bundle: {"format":4,"namespace":"Redacao","components":[{"name":"Button"},{"name":"StatusPill"},{"name":"ActChip"},{"name":"Redline"},{"name":"TextOrigin"},{"name":"VersionBar"},{"name":"DateLens"},{"name":"VersionTimeline"},{"name":"ProcessTrack"},{"name":"VoteBar"},{"name":"Citation"},{"name":"SourceNote"}]} */
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
  // paragraphs: [{number?, spans: [{text, act}]}]
  // acts: [{index, label, date, href?, hrefLabel?, diffHref?, beforeHref?}]
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
    return h('div', { className: 'rd-origin' },
      h('div', { className: 'rd-origin-text' },
        (props.paragraphs || []).map(function (p, pi) {
          return h(React.Fragment, { key: pi },
            h('p', { className: 'rd-statute' },
              p.number ? h('span', { className: 'rd-num' }, p.number + ' ') : null,
              p.spans.map(function (s, si) {
                var a = byIndex[s.act] || { label: '' };
                var toggle = function () { var off = focus === s.act && para === pi; setFocus(off ? null : s.act); setPara(off ? null : pi); };
                // Punctuation alone is not a phrase: it keeps its mark but is not a target.
                if (!/[\p{L}\p{N}]/u.test(s.text)) return h('span', { key: si, className: cx('rd-origin-span', 'rd-u-act-' + s.act, focus != null && focus !== s.act && 'is-dim') }, s.text);
                return h('span', {
                  key: si, role: 'button', tabIndex: 0,
                  className: cx('rd-origin-span', 'rd-u-act-' + s.act, focus != null && focus !== s.act && 'is-dim', focus === s.act && 'is-focus'),
                  'aria-pressed': focus === s.act,
                  'aria-label': s.text + '. Origem do texto: ' + a.label,
                  onClick: toggle,
                  onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }
                }, s.text);
              })),
            sel && para === pi ? h('div', { className: 'rd-origin-pop', role: 'group', 'aria-label': 'Origem do texto' },
              h('p', { className: 'rd-origin-pop-text' }, about(sel)),
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

  // ---- VersionBar -------------------------------------------------------------
  // The reader's place in the history of one article: previous and next redação, a status
  // line that screen readers announce, and a strip with one segment per redação on a time axis.
  // versions: [{label, start, technical?, pending?}] oldest first. current: index shown.
  // onGo(i): show redação i. status: what the status line says. today: ISO date for the axis end.
  function dias(a, b) { return Math.max(0, (Date.parse(b) - Date.parse(a)) / 86400000); }
  function VersionBar(props) {
    var vs = props.versions || [], i = props.current, n = vs.length;
    var id = props.id || 'rd-vbar';
    var today = props.today || '2026-10-28';
    var go = function (k) { if (k >= 0 && k < n && k !== i && props.onGo) props.onGo(k); };
    var first = vs.length ? vs[0].start : today;
    // Inside the bar, ← and → move one redação, Home and End go to the first and the last.
    // On a segment of the strip, focus follows to the segment of the new redação.
    var onKey = function (e) {
      if (e.target.tagName !== 'BUTTON' || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[e.key];
      if (k == null || k < 0 || k >= n) return;
      e.preventDefault();
      var seg = e.target.classList.contains('rd-vbar-seg');
      go(k);
      if (seg) setTimeout(function () { var b = document.querySelectorAll('#' + id + ' .rd-vbar-seg')[k]; if (b) b.focus(); }, 0);
    };
    return h('section', { className: 'rd-vbar', id: id, 'aria-labelledby': id + '-h', onKeyDown: onKey },
      h('h2', { className: 'rd-sr', id: id + '-h' }, props.heading || 'Redação mostrada'),
      h('div', { className: 'rd-vbar-row' },
        h('button', { type: 'button', className: 'rd-btn rd-btn-quiet rd-vbar-step', 'aria-disabled': i <= 0, 'aria-describedby': id + '-s', onClick: function () { go(i - 1); } },
          h('span', { 'aria-hidden': 'true' }, '‹'), h('span', { className: 'rd-vbar-word' }, ' Redação anterior')),
        h('p', { id: id + '-s', className: 'rd-vbar-status', role: 'status' }, props.status),
        h('button', { type: 'button', className: 'rd-btn rd-btn-quiet rd-vbar-step', 'aria-disabled': i >= n - 1, 'aria-describedby': id + '-s', onClick: function () { go(i + 1); } },
          h('span', { className: 'rd-vbar-word' }, 'Redação seguinte '), h('span', { 'aria-hidden': 'true' }, '›')),
        props.onList ? h('button', { type: 'button', className: 'rd-btn rd-btn-quiet rd-vbar-list', onClick: props.onList }, 'Lista') : null),
      n > 1 ? h('div', { className: 'rd-vbar-axis' },
        h('div', { className: 'rd-vbar-strip', role: 'group', 'aria-label': 'Linha do tempo das redações' },
          vs.map(function (v, k) {
            var end = k < n - 1 ? vs[k + 1].start : today;
            var d = v.pending ? 60 : dias(v.start, end > v.start ? end : v.start);
            return h('button', {
              key: k, type: 'button', title: v.label, 'aria-label': v.label, 'aria-pressed': k === i,
              className: cx('rd-vbar-seg', k === i && 'is-on', v.technical && 'is-technical', v.pending && 'is-pending'),
              style: { flexGrow: Math.max(1, Math.round(d)) },
              onClick: function () { go(k); }
            });
          })),
        h('div', { className: 'rd-vbar-years', 'aria-hidden': 'true' }, h('span', null, first.slice(0, 4)), h('span', null, 'hoje'))) : null,
      props.children ? h('div', { className: 'rd-vbar-tools' }, props.children) : null);
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
        BASES.map(function (b) {
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
      h(Button, { onClick: copy }, label));
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

  var api = { Button: Button, StatusPill: StatusPill, ActChip: ActChip, Redline: Redline, TextOrigin: TextOrigin, VersionBar: VersionBar, DateLens: DateLens, VersionTimeline: VersionTimeline, ProcessTrack: ProcessTrack, VoteBar: VoteBar, Citation: Citation, SourceNote: SourceNote, dataPorExtenso: dataPorExtenso };
  window.Redacao = Object.assign(window.Redacao || {}, api);
})();
