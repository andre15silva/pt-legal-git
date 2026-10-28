/* @ds-bundle: {"format":4,"namespace":"Redacao","components":[{"name":"Button"},{"name":"StatusPill"},{"name":"ActChip"},{"name":"Redline"},{"name":"TextOrigin"},{"name":"DateLens"},{"name":"VersionTimeline"},{"name":"ProcessTrack"},{"name":"VoteBar"},{"name":"Citation"},{"name":"SourceNote"}]} */
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
    return h(Tag, { className: cx('rd-act', props.onClick && 'rd-act-btn', props.selected && 'is-selected'), onClick: props.onClick, type: props.onClick ? 'button' : undefined },
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
  // paragraphs: [{number?, spans: [{text, act}]}], acts: [{index, label, date, href?, hrefLabel?}]
  // The chips mark words; they do not change the text. An act with href gets a link to the
  // version it made, so the reader can open that text.
  function TextOrigin(props) {
    var acts = props.acts || [];
    var byIndex = {};
    acts.forEach(function (a) { byIndex[a.index] = a; });
    var st = React.useState(props.focus == null ? null : props.focus);
    var focus = st[0], setFocus = st[1];
    var sel = focus == null ? null : byIndex[focus];
    var legendId = React.useId ? React.useId() : 'rd-origin-key';
    return h('div', { className: 'rd-origin' },
      h('div', { className: 'rd-origin-text' },
        (props.paragraphs || []).map(function (p, pi) {
          return h('p', { key: pi, className: 'rd-statute' },
            p.number ? h('span', { className: 'rd-num' }, p.number + ' ') : null,
            p.spans.map(function (s, si) {
              var a = byIndex[s.act] || { label: '' };
              var toggle = function () { setFocus(focus === s.act ? null : s.act); };
              return h('span', {
                key: si, role: 'button', tabIndex: 0,
                className: cx('rd-origin-span', 'rd-u-act-' + s.act, focus != null && focus !== s.act && 'is-dim', focus === s.act && 'is-focus'),
                'aria-pressed': focus === s.act,
                'aria-label': s.text + '. Origem do texto: ' + a.label,
                onClick: toggle,
                onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }
              }, s.text);
            }));
        })),
      h('div', { className: 'rd-origin-key' },
        h('p', { className: 'rd-origin-key-label', id: legendId }, props.legendLabel || 'Marcar as palavras escritas por:'),
        h('div', { className: 'rd-origin-legend', role: 'list', 'aria-labelledby': legendId },
          acts.map(function (a) {
            return h('div', { key: a.index, role: 'listitem' }, h(ActChip, { act: a, selected: focus === a.index, onClick: function () { setFocus(focus === a.index ? null : a.index); } }));
          }))),
      h('p', { className: 'rd-origin-note', 'aria-live': 'polite' },
        sel ? ['Palavras escritas por: ', h('strong', { key: 's' }, sel.label), sel.date ? ', publicação a ' + dataPorExtenso(sel.date) + '.' : '.',
          sel.href ? [' ', h('a', { key: 'l', href: sel.href }, sel.hrefLabel || 'Ver esta redação')] : null]
          : 'Escolha uma frase ou um diploma para marcar as palavras que ele escreveu.'));
  }

  // ---- DateLens ---------------------------------------------------------------
  var BASES = [
    { id: 'vigor', label: 'Em vigor' },
    { id: 'efeitos', label: 'Produção de efeitos' },
    { id: 'publicacao', label: 'Publicação' }
  ];
  function DateLens(props) {
    var sd = React.useState(props.date || '2019-03-14');
    var date = sd[0], setDate = sd[1];
    var sb = React.useState(props.basis || 'vigor');
    var basis = sb[0], setBasis = sb[1];
    var id = props.id || 'rd-lens';
    var phrase = {
      vigor: 'Texto em vigor a ',
      efeitos: 'Texto que produz efeitos a ',
      publicacao: 'Texto publicado até '
    }[basis];
    return h('form', { className: 'rd-lens', role: 'search', 'aria-label': 'Ver a lei numa data', onSubmit: function (e) { e.preventDefault(); } },
      h('div', { className: 'rd-lens-row' },
        h('label', { htmlFor: id + '-date', className: 'rd-lens-label' }, 'Ver a lei como estava em'),
        h('input', { id: id + '-date', type: 'date', className: 'rd-input', value: date, onChange: function (e) { setDate(e.target.value); if (props.onChange) props.onChange({ date: e.target.value, basis: basis }); } }),
        h(Button, { variant: 'ghost', onClick: function () { var t = props.today || '2026-10-28'; setDate(t); if (props.onChange) props.onChange({ date: t, basis: basis }); } }, 'Hoje')),
      h('fieldset', { className: 'rd-seg' },
        h('legend', { className: 'rd-sr' }, 'Que data conta'),
        BASES.map(function (b) {
          return h('label', { key: b.id, className: cx('rd-seg-opt', basis === b.id && 'is-on') },
            h('input', { type: 'radio', name: id + '-basis', value: b.id, checked: basis === b.id, onChange: function () { setBasis(b.id); if (props.onChange) props.onChange({ date: date, basis: b.id }); } }),
            b.label);
        })),
      h('p', { className: 'rd-lens-out' }, phrase, h('strong', null, dataPorExtenso(date)), '.'));
  }

  // ---- VersionTimeline -------------------------------------------------------
  // versions: [{id, title, act, published, inForce, until?, summary?, verification, technical?}]
  function VersionTimeline(props) {
    var vs = props.versions || [];
    return h('ol', { className: 'rd-tl', 'aria-label': props.label || 'História desta lei' },
      vs.map(function (v) {
        var current = v.id === props.current;
        return h('li', { key: v.id, className: cx('rd-tl-item', current && 'is-current', v.technical && 'is-technical', v.pending && 'is-pending') },
          h('span', { className: 'rd-tl-node', 'aria-hidden': 'true' }),
          h('div', { className: 'rd-tl-body' },
            h('div', { className: 'rd-tl-head' },
              v.href ? h('a', { className: 'rd-tl-title rd-link', href: v.href }, v.title) : h('span', { className: 'rd-tl-title' }, v.title),
              current ? h(StatusPill, { status: 'vigor' }) : null,
              v.pending ? h(StatusPill, { status: 'pendente' }) : null,
              v.verification ? h(StatusPill, { status: v.verification }) : null),
            h('p', { className: 'rd-tl-act' }, v.act),
            h('dl', { className: 'rd-tl-dates' },
              v.published ? [h('dt', { key: 'a' }, 'Publicação'), h('dd', { key: 'b' }, dataPorExtenso(v.published))] : null,
              v.inForce ? [h('dt', { key: 'c' }, 'Em vigor'), h('dd', { key: 'd' }, dataPorExtenso(v.inForce) + (v.until ? ' a ' + dataPorExtenso(v.until) : ''))] : null),
            v.summary ? h('p', { className: 'rd-tl-sum' }, v.summary) : null));
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

  var api = { Button: Button, StatusPill: StatusPill, ActChip: ActChip, Redline: Redline, TextOrigin: TextOrigin, DateLens: DateLens, VersionTimeline: VersionTimeline, ProcessTrack: ProcessTrack, VoteBar: VoteBar, Citation: Citation, SourceNote: SourceNote, dataPorExtenso: dataPorExtenso };
  window.Redacao = Object.assign(window.Redacao || {}, api);
})();
