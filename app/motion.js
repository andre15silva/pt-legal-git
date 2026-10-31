/* Redação: the motion layer (docs/DESIGN-DIRECTION.md §10). One module, no library.
   Motion says what changed and where it came from. Four kinds of it, one house style:
     1. Prelo (the house style): rules are drawn, lines are set in reading order, a strike is drawn
        through removed words and new words are inked in. Once per mount. Never a lift, a scale, a loop.
     2. Rever o tempo (article pages): the time ruler is a scrubber with a needle; the law text turns
        into each redação in place; ▶ replays the history, and stops on any other input.
     3. Tátil (two pieces): a vote group lit across every vote on the page; phone sheets that follow
        the finger and settle on a damped spring. Also the copy tick and the 1 px press (CSS).
     4. O scroll é o relógio (stories, act pages, diplomas): a pinned step-through figure, the story's
        slim ruler, votes that tally as they reach the reading line, the passage line of a law, the
        reading hairline. Scroll position is state: scrolling back undoes it.
   prefers-reduced-motion: every animation and transition is instant (motion.css). The scrubber and the
   replay still step; drags still follow the hand; scroll-tied states show their current state.
   Without scroll timelines (?semtl previews it) the same states come from the reading line.
   The React parts need the app's own helpers: app.js calls RedacaoMotion.criar(dep) once. */
(function () {
  'use strict';
  var w = typeof window !== 'undefined' ? window : {};
  var doc = w.document && w.document.getElementById ? w.document : null;   // null in node tests
  var mq = doc && w.matchMedia ? w.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function calmo() { return !!(mq && mq.matches); }
  function estreito() { return !!(doc && w.matchMedia && w.matchMedia('(max-width: 760px)').matches); }
  // Scroll timelines: continuous things (vote rows, the passage fill, the hairline) run on the compositor.
  // ?semtl (before the #) previews what a browser without them gets: the same states, from the reading line.
  var TL = !!(doc && !/[?&]semtl\b/.test(w.location.search) && w.CSS && w.CSS.supports &&
    w.CSS.supports('animation-timeline: view()') && w.CSS.supports('timeline-scope: --a'));
  if (doc) doc.documentElement.classList.add(TL ? 'mo-tl' : 'mo-sem-tl');
  var LINHA = 0.55;   // the reading line: 55 % down the viewport (78 % under a phone's pinned figure)

  // ---- Pure helpers (node app/test_diff.js tests them) -----------------------------------------
  // Replay: each redação stays `passoReplay(n)` ms; a whole history takes 2–8 s.
  function passoReplay(n) { return Math.max(750, Math.min(1500, 7000 / Math.max(1, n - 1))); }
  function diasEntre(a, b) { return (Date.parse(b) - Date.parse(a)) / 864e5; }
  function somaDias(iso, n) { return new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10); }
  // The redação in force at date d: the last one that started on or before it (-1: none).
  function naData(vs, d) { var k = -1; vs.forEach(function (v, j) { if (v.start <= d) k = j; }); return k; }
  // A spring, x'' = -k (x - to) - c x', c = 2 ζ √k, in two semi-implicit half steps per frame.
  // ζ ≥ 0.9: it lands and never visibly bounces (0.15 % at 0.9).
  function molaPasso(s, dt) {
    var c = 2 * s.z * Math.sqrt(s.k);
    for (var i = 0; i < 2; i++) { var a = -s.k * (s.x - s.to) - c * s.v; s.v += a * dt / 2; s.x += s.v * dt / 2; }
    var span = Math.max(1, Math.abs(s.to));
    return Math.abs(s.x - s.to) < 0.002 * span + 0.01 && Math.abs(s.v) < 0.05 * span + 0.05;
  }
  // For each block of a story: the acts its links name, how far the text has come in law-time
  // (`ate`), and its section. A section whose title opens with a year starts at the first act of that
  // year in the chronology (else 1 January); within a section, the latest act named so far counts.
  function leituraDe(blocos, atos, crono) {
    var ate = null, secao = null;
    var junta = function (partes, out) {
      (partes || []).forEach(function (x) {
        if (!x || typeof x === 'string') return;
        var m = /^#\/ato\/([^?]+)/.exec(x.href || '');
        if (m && atos[m[1]] && out.indexOf(m[1]) < 0) out.push(m[1]);
        if (x.partes) junta(x.partes, out);
      });
      return out;
    };
    return (blocos || []).map(function (b) {
      if (b.t === 'h2') {
        secao = b.texto;
        var y = /^(\d{4})/.exec(b.texto || '');
        if (y) {
          var primeiro = (crono || []).filter(function (a) { return (a.data || '').slice(0, 4) === y[1]; })[0];
          ate = primeiro ? primeiro.data : y[1] + '-01-01';
        }
      }
      var ids = junta(b.t === 'figura' ? [] : b.partes, []);
      if (secao) ids.forEach(function (id) { var d = atos[id].publicacao; if (d && (!ate || d > ate)) ate = d; });
      return { atos: ids, ate: ate, secao: secao, passos: b.t === 'figura' && b.tipo === 'passos' };
    });
  }
  // The stages of a law's passage, from the sentences of «Quem fez» (frasesQuem tags each one with
  // {nome, data} from quem.json and atos.json): [{k, nome, data}] for the sentences that are a stage.
  function etapasDe(frases) {
    var out = [];
    (frases || []).forEach(function (f, k) { if (f && f.etapa && f.classe !== 'aviso') out.push({ k: k, nome: f.etapa.nome, data: f.etapa.data || null }); });
    return out;
  }
  // The lines of a redação that a step shows: an alínea alone, or a whole número.
  function linhasPasso(linhas, rots, s) {
    return linhas.filter(function (t, j) { var r = rots[j]; return s.al ? r.n === s.n && r.al === s.al : r.n === s.n; });
  }
  var api = { calmo: calmo, TL: TL, LINHA: LINHA, passoReplay: passoReplay, naData: naData, diasEntre: diasEntre, somaDias: somaDias,
    molaPasso: molaPasso, leituraDe: leituraDe, etapasDe: etapasDe, linhasPasso: linhasPasso };
  w.RedacaoMotion = api;
  if (!doc) return;

  // ---- Waiting (Prelo): blocks below the fold wait until they are seen ---------------------------
  // `esperar(el, soltar)` calls soltar() once, when el enters the viewport. Fail-safes, so nothing stays
  // hidden on an observer: every 3 s and on each scroll frame, whatever is in or above the viewport is
  // released; keyboard focus inside releases it; printing and turning on reduced motion release all.
  var esperas = [];
  var io = w.IntersectionObserver ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) soltar(e.target); });
  }, { rootMargin: '0px 0px -12% 0px' }) : null;
  function esperar(el, f) {
    if (!io || calmo()) { f(); return; }
    esperas.push({ el: el, f: f });
    io.observe(el);
    if (!vigia) vigia = setInterval(verEsperas, 3000);
  }
  function soltar(el) {
    for (var i = esperas.length - 1; i >= 0; i--) if (esperas[i].el === el) { var x = esperas.splice(i, 1)[0]; if (io) io.unobserve(el); x.f(); }
  }
  function soltarTudo() { esperas.splice(0).forEach(function (x) { if (io) io.unobserve(x.el); x.f(); }); }
  var vigia = 0, rafE = 0;
  function verEsperas() {
    rafE = 0;
    esperas.slice().forEach(function (x) { if (!x.el.isConnected || x.el.getBoundingClientRect().top < w.innerHeight) soltar(x.el); });
    if (!esperas.length && vigia) { clearInterval(vigia); vigia = 0; }
  }
  w.addEventListener('scroll', function () { if (esperas.length && !rafE) rafE = requestAnimationFrame(verEsperas); }, { passive: true });
  doc.addEventListener('focusin', function (e) { esperas.slice().forEach(function (x) { if (x.el.contains(e.target)) soltar(x.el); }); });
  w.addEventListener('beforeprint', soltarTudo);
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (calmo()) soltarTudo(); });

  // ---- Page entry (Prelo): the block fades; its first lines rise in reading order ---------------
  // Only the first screen and a half, 40 ms apart, at most 8 steps. Indices for the diff ink and the
  // figures are set on every mount. Search results are left alone (they change at each keystroke).
  var SOBE = ['.crumbs', '.intro > *', '.corrida', '.art-head', '.estado', '.guia', '.rp', '.legenda-regua', '.rd-vbar',
    '.h2', '.area-h', '.card', '.dip-lado .list > li', '.rd-reg-row', '.lei > .lei-p', '.lei > .dif', '.toc-row',
    '.pagina-ato > header > *', '.secao > h2', '.secao > p', '.hist-cabeca > *', '.hist-corpo > p', '.historias-lista > li', '.lt'].join(',');
  var FORA = '.results, .rd-folha, figure.fig, .voto, .mo-espera, .mx';
  var ESPERA = 'figure.fig, .voto, .secao';
  var MAX = 8, MAX_TINTA = 10;
  var entrada = 0;
  function indices(raiz, sel, prop, max) {
    var k = 0;
    raiz.querySelectorAll(sel).forEach(function (el) { el.style.setProperty(prop, Math.min(k++, max)); });
  }
  function tratar(no) {
    if (no.nodeType !== 1) return;
    var vista = no.classList.contains('vista') ? no : no.querySelector('.vista');
    if (vista) entrada = performance.now();
    var carregar = no.matches('.state[aria-busy]') || (vista && vista.querySelector('.state[aria-busy]') && !vista.querySelector('.artigo, .pagina-ato, .intro, .hist-corpo, h1'));
    // A diff inks its changes in reading order; figures assemble in date order.
    indices(no, '.rd-ins, .rd-del', '--mo-di', MAX_TINTA);
    no.querySelectorAll('.cr-regua').forEach(function (s) { indices(s, '.cr-tick', '--i', 40); indices(s, '.cr-rot, .cr-ano', '--i', 40); });
    no.querySelectorAll('figure.fig').forEach(function (f) { indices(f, '.cr-linha, .cr-grupo-h', '--i', MAX); indices(f, '.fig-ficha-l', '--i', MAX); });
    no.querySelectorAll('.ps-estado').forEach(function (f) { indices(f, '.rd-ins, .rd-del', '--mo-di', MAX_TINTA); });
    if (carregar) return;
    if (entrada && performance.now() - entrada < 2500) {
      entrada = 0;
      var raiz = vista || no.closest('.vista') || no, alto = w.innerHeight * 1.5, k = 0;
      raiz.querySelectorAll(SOBE).forEach(function (el) {
        if (el.closest(FORA) || (el.parentElement && el.parentElement.closest('.mo-sobe'))) return;
        if (el.getBoundingClientRect().top > alto) return;
        el.style.setProperty('--i', Math.min(k++, MAX));
        el.classList.add('mo-sobe');
      });
      raiz.querySelectorAll('.artigo').forEach(function (a) {
        a.classList.add('mo-entrada');
        setTimeout(function () { a.classList.remove('mo-entrada'); }, 1200);
      });
    }
    var lista = no.matches(ESPERA) ? [no] : [];
    no.querySelectorAll(ESPERA).forEach(function (el) { lista.push(el); });
    lista.forEach(function (el) {
      if (el.closest('.rd-folha') || el.getBoundingClientRect().top <= w.innerHeight * 0.92) return;
      el.classList.add('mo-espera');
      esperar(el, function () { el.classList.remove('mo-espera'); });
    });
    // Numbers that count once, when seen (.conta: R.Conta in the design system).
    var cs = no.matches('.conta') ? [no] : [];
    no.querySelectorAll('.conta').forEach(function (el) { cs.push(el); });
    cs.forEach(contar);
    // Without scroll timelines, a vote below the fold waits, then tallies its rows once.
    if (!TL) no.querySelectorAll('.rd-votacao').forEach(function (el) {
      if (el.closest('.rd-folha') || el.getBoundingClientRect().top < w.innerHeight * 0.85) return;
      el.setAttribute('data-espera', '');
      esperar(el, function () { el.removeAttribute('data-espera'); el.classList.add('visto'); });
    });
  }
  var app = doc.getElementById('app');
  if (app && w.MutationObserver) new MutationObserver(function (ms) {
    if (calmo()) return;
    ms.forEach(function (m) { m.addedNodes.forEach(tratar); });
  }).observe(app, { childList: true, subtree: true });

  // ---- Counts (C): a number counts to its value once, when seen; 640 ms, ease-out --------------
  // R.Conta renders the value twice: aria-hidden digits (these count) and the value for screen
  // readers and copy. Only digits are written, and the count stops if React writes a new value.
  function contar(el) {
    if (el.hasAttribute('data-visto')) return;
    el.setAttribute('data-visto', '');
    var v = el.querySelector('.conta-v'), n = Number(el.getAttribute('data-n'));
    if (!v || !(n > 9) || calmo()) return;
    var r = el.getBoundingClientRect();
    if (r.bottom < 0) return;                                   // already read: leave the value
    var correr = function () {
      var t0 = null;
      var passo = function (t) {
        if (Number(el.getAttribute('data-n')) !== n) { v.textContent = el.getAttribute('data-n'); return; }
        if (t0 == null) t0 = t;
        var x = Math.min(1, (t - t0) / 640);
        v.textContent = String(Math.round(n * (1 - Math.pow(1 - x, 3))));
        if (x < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    };
    if (r.top > w.innerHeight * 0.88) { v.textContent = '0'; esperar(el, correr); } else correr();
  }

  // ---- Tátil: a vote group lit across every vote on the page -----------------------------------
  // Any element with data-grupo (the siglas of R.Votacao, the columns of the initiatives table): while
  // the pointer rests on one or keyboard focus is on one, the same group is lit everywhere and the
  // other groups dim. Each vote block is one tab stop; the arrows move between its groups.
  var grupoAtual = null;
  function acender(g) {
    if (g === grupoAtual) return;
    doc.querySelectorAll('.mo-grupo').forEach(function (x) { x.classList.remove('mo-grupo'); });
    grupoAtual = g;
    doc.documentElement.classList.toggle('mo-com-grupo', !!g);
    if (g) doc.querySelectorAll('[data-grupo="' + (w.CSS && CSS.escape ? CSS.escape(g) : g) + '"]').forEach(function (x) { x.classList.add('mo-grupo'); });
  }
  doc.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('[data-grupo]');
    if (e.pointerType === 'touch' && !el) return;
    acender(el ? el.getAttribute('data-grupo') : null);
  });
  doc.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-grupo]');
    acender(el ? el.getAttribute('data-grupo') : null);
  });
  doc.addEventListener('keydown', function (e) {
    var el = e.target;
    if (!el.hasAttribute || !el.hasAttribute('data-grupo') || !/^Arrow(Left|Right|Up|Down)$|^Home$|^End$/.test(e.key)) return;
    var bloco = el.closest('.rd-votacao');
    if (!bloco) return;
    var gs = Array.prototype.slice.call(bloco.querySelectorAll('[data-grupo][tabindex]')), i = gs.indexOf(el);
    var j = e.key === 'Home' ? 0 : e.key === 'End' ? gs.length - 1 : i + (/Right|Down/.test(e.key) ? 1 : -1);
    if (j < 0 || j >= gs.length) return;
    e.preventDefault();
    gs.forEach(function (x, k) { x.tabIndex = k === j ? 0 : -1; });
    gs[j].focus();
  });
  w.addEventListener('hashchange', function () { acender(null); });

  // ---- Tátil: phone sheets that follow the finger ---------------------------------------------
  // The Origem sheet (.rd-folha, at the bottom below 1100 px) and the phone sheet (dialog.folha, below
  // 760 px). Grab the bar: the sheet follows the finger 1:1. Release: down more than a third, or a flick
  // down faster than 600 px/s, and it closes at the finger's speed; up more than 60 px, or a flick up,
  // and it opens to 92 % of the screen (it resists past that); otherwise it springs back. Springs with
  // ζ ≥ 0.9: no bounce. Under reduced motion the drag still follows the finger and the end is instant.
  function Mola(o) { this.k = o.k || 380; this.z = o.z || 0.9; this.x = o.x || 0; this.v = 0; this.to = this.x; this.on = o.on; this.raf = 0; this.t = 0; this.fim = null; }
  Mola.prototype.set = function (to, v, fim) {
    this.to = to; if (v != null) this.v = v; this.fim = fim || null;
    if (calmo()) { this.x = to; this.v = 0; this.on(to); if (fim) fim(); return; }
    if (!this.raf) { this.t = performance.now(); this.raf = requestAnimationFrame(this.tick.bind(this)); }
  };
  Mola.prototype.tick = function (agora) {
    var dt = Math.min(0.032, (agora - this.t) / 1000); this.t = agora;
    if (molaPasso(this, dt)) { this.x = this.to; this.v = 0; this.raf = 0; this.on(this.x); var f = this.fim; this.fim = null; if (f) f(); return; }
    this.on(this.x);
    this.raf = requestAnimationFrame(this.tick.bind(this));
  };
  function Rasto() { this.s = []; }
  Rasto.prototype.add = function (y) { var t = performance.now(); this.s.push([t, y]); while (this.s.length > 2 && t - this.s[0][0] > 80) this.s.shift(); };
  Rasto.prototype.vel = function () { var s = this.s; if (s.length < 2) return 0; var a = s[0], b = s[s.length - 1]; return (b[1] - a[1]) / (Math.max(1, b[0] - a[0]) / 1000); };
  api.Mola = Mola;
  function folhaDe(t) {
    var f = t.closest && t.closest('.rd-folha, dialog.folha');
    if (!f) return null;
    if (f.classList.contains('rd-folha') && !w.matchMedia('(max-width: 1099px)').matches) return null;
    if (f.tagName === 'DIALOG' && !w.matchMedia('(max-width: 760px)').matches) return null;
    if (!t.closest('.rd-folha-topo, .folha-cab') || t.closest('button, a, input, select, summary')) return null;
    return f;
  }
  function limparFolha(f) { f.style.transform = ''; f.style.maxHeight = ''; f.classList.remove('mo-alta', 'mo-a-puxar'); }
  function fecharFolha(f) {
    if (f.tagName === 'DIALOG') f.close();
    else { var b = f.querySelector('.rd-folha-fechar'); if (b) b.click(); }
    setTimeout(function () { limparFolha(f); }, 30);
  }
  var puxa = null;
  doc.addEventListener('pointerdown', function (e) {
    var f = folhaDe(e.target);
    if (!f || e.button > 0) return;
    puxa = { f: f, y0: e.clientY, h0: f.getBoundingClientRect().height, dy: 0, r: new Rasto(), id: e.pointerId };
    puxa.r.add(e.clientY);
    f.classList.add('mo-a-puxar');
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch (x) { /* an old browser */ }
  });
  doc.addEventListener('pointermove', function (e) {
    if (!puxa || e.pointerId !== puxa.id) return;
    var dy = e.clientY - puxa.y0;
    puxa.r.add(e.clientY);
    if (dy >= 0) { puxa.f.style.transform = 'translateY(' + dy + 'px)'; puxa.f.style.maxHeight = ''; }
    else {
      var max = w.innerHeight * 0.92, h1 = puxa.h0 - dy;
      puxa.f.style.transform = ''; puxa.f.style.maxHeight = (h1 <= max ? h1 : max + (h1 - max) * 0.35) + 'px';
    }
    puxa.dy = dy;
  });
  function largarFolha(e) {
    if (!puxa || e.pointerId !== puxa.id) return;
    var p = puxa, f = p.f, v = p.r.vel();
    puxa = null;
    f.classList.remove('mo-a-puxar');
    if (p.dy > p.h0 / 3 || (v > 600 && p.dy > 8)) {
      new Mola({ k: 380, z: 1, x: p.dy, on: function (y) { f.style.transform = 'translateY(' + y + 'px)'; } }).set(p.h0 + 24, v, function () { fecharFolha(f); });
    } else if (p.dy < -60 || (p.dy <= 0 && v < -600)) {
      f.classList.add('mo-alta');
      new Mola({ k: 420, x: Math.max(p.h0, p.h0 - p.dy), on: function (hh) { f.style.maxHeight = hh + 'px'; } }).set(w.innerHeight * 0.92, -v);
    } else if (p.dy > 0) {
      new Mola({ k: 520, x: p.dy, on: function (y) { f.style.transform = y ? 'translateY(' + y + 'px)' : ''; } }).set(0, v);
    } else if (p.dy < 0) {
      new Mola({ k: 520, x: p.h0 - p.dy, on: function (hh) { f.style.maxHeight = hh + 'px'; } }).set(p.h0, -v, function () { f.style.maxHeight = ''; });
    }
  }
  doc.addEventListener('pointerup', largarFolha);
  doc.addEventListener('pointercancel', largarFolha);
  // A sheet closed another way (Fechar, Esc) opens clean next time.
  doc.addEventListener('close', function (e) { if (e.target.classList && e.target.classList.contains('folha')) limparFolha(e.target); }, true);

  // ---- Prelo: a step within one article crossfades the law text ---------------------------------
  // A View Transition, only between views or redações of one loaded article, never while the needle is
  // held or a replay runs, and never in Texto between two redações (there the words morph in place).
  // The names exist only while it runs: a view-transition-name makes a stacking context.
  var VT = ['redacao', 'em', 'ver', 'com', 'lado', 'base'];
  api.passo = function (antes, depois, aplicar) {
    var a = new URLSearchParams(antes.split('?')[1] || ''), d = new URLSearchParams(depois.split('?')[1] || '');
    var mudou = false, outro = false;
    new Set(Array.from(a.keys()).concat(Array.from(d.keys()))).forEach(function (k) {
      if (a.get(k) === d.get(k)) return;
      if (VT.indexOf(k) >= 0) mudou = true; else outro = true;
    });
    var art = doc.querySelector('.artigo');
    var morph = art && art.getAttribute('data-ver') === 'texto' && a.get('ver') === d.get('ver');
    var ocupado = doc.documentElement.classList.contains('mo-arrasto') || (art && art.classList.contains('is-replay'));
    if (calmo() || !mudou || outro || morph || ocupado || !doc.startViewTransition || !doc.querySelector('.art-lei')) return aplicar();
    var root = doc.documentElement;
    root.classList.add('mo-vt');
    var t = doc.startViewTransition(function () {
      w.ReactDOM.flushSync(aplicar);
      var dir = (doc.querySelector('.artigo') || {}).dataset;
      if (dir && dir.dir) root.classList.add('mo-dir-' + dir.dir);
    });
    t.finished.finally(function () { root.classList.remove('mo-vt', 'mo-dir-seguinte', 'mo-dir-anterior'); });
  };

  // ---- The React parts: app.js calls criar(dep) with its helpers ---------------------------------
  api.criar = function (dep) {
    var React = w.React, h = React.createElement, useState = React.useState, useEffect = React.useEffect,
      useMemo = React.useMemo, useRef = React.useRef, useLayoutEffect = React.useLayoutEffect;

    // The element (of raiz.querySelectorAll(sel)) whose top last crossed the reading line. An observer
    // catches each crossing; a rAF-throttled scroll check catches jumps (a link, Home/End, a fling).
    function useLeitura(ref, sel, linha, deps) {
      var st = useState(null);
      useEffect(function () {
        var raiz = ref.current;
        if (!raiz) return;
        var els = Array.prototype.slice.call(raiz.querySelectorAll(sel));
        if (!els.length) return;
        var medir = function () {
          var y = w.innerHeight * (typeof linha === 'function' ? linha() : linha), k = null;
          els.forEach(function (e) { if (e.getBoundingClientRect().top <= y) k = e; });
          st[1](k);
        };
        medir();
        var raf = 0, onScroll = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; medir(); }); };
        w.addEventListener('scroll', onScroll, { passive: true });
        w.addEventListener('resize', onScroll);
        var top = Math.round((typeof linha === 'function' ? linha() : linha) * 1000) / 10;
        var o = w.IntersectionObserver ? new IntersectionObserver(medir, { rootMargin: '-' + top + '% 0px -' + (100 - top - 0.5) + '% 0px' }) : null;
        if (o) els.forEach(function (e) { o.observe(e); });
        return function () { if (o) o.disconnect(); w.removeEventListener('scroll', onScroll); w.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
      }, deps || []);
      return st[0];
    }

    // ---- Rever o tempo: the morph ---------------------------------------------------------------
    // One redação turns into another where it stands: removed words are struck in reading order
    // (160 ms, 14 ms apart, at most 10) and close up, new words open (260 ms) and keep the new-words
    // mark. The words that stay do not move. Struck words are aria-hidden and leave the DOM at the end.
    // Only paragraphs on screen move; a rewrite of more than 160 words crossfades by word.
    var MX = { risca: 160, muda: 260, passo: 14, max: 160 };
    function palavras(t) { return dep.nbsp(t).match(/\S+\s*|\s+/g) || []; }
    function linhaMorph(segs, key, marca, fim, novo) {
      var so = function (op) { return segs.every(function (s) { return s.op === op; }); };
      var inteira = so('del') ? 'sai' : so('ins') ? 'entra' : null;
      if (inteira === 'sai' && fim) return null;
      var depois = segs.filter(function (s) { return s.op !== 'del'; }).map(function (s) { return s.text; }).join('');
      var antes = segs.filter(function (s) { return s.op !== 'ins'; }).map(function (s) { return s.text; }).join('');
      var ref = depois || antes;
      if (dep.TABELA.test(ref)) return h('div', { key: key, 'data-mx': inteira || 'tab' }, dep.linhaTabela(segs.filter(function (s) { return !fim || s.op !== 'del'; }), key));
      var p = dep.partes(ref), corte = ref.length - p.resto.length, pos = 0, n = 0;
      return h('p', { key: key, 'data-mx': inteira || undefined, className: 'lei-p lei-' + (p.kind || 'x') + (dep.revogada(p.resto) ? ' lei-rev' : '') + (marca && p.num && marca[p.num] ? ' lei-marca' : '') },
        p.nr ? h('span', { className: 'nr' }, p.nr + ' ') : null,
        segs.map(function (s, k) {
          // The número hangs in the margin: cut it off the first characters of the new text.
          var t = s.text;
          if (s.op !== 'del' || inteira === 'sai') { var a = pos; pos += t.length; if (pos <= corte) return null; t = t.slice(Math.max(0, corte - a)); }
          if (s.op === 'eq') return h('span', { key: k }, dep.nbsp(t));
          if (s.op === 'del' && fim) return null;
          return h('span', { key: k, className: 'mx-' + s.op, 'aria-hidden': s.op === 'del' ? 'true' : undefined },
            palavras(t).map(function (x, j) { return h('span', { key: j, className: 'mx-w' + (s.op === 'ins' && novo ? ' acabado' : ''), style: { '--i': n++ } }, x); }));
        }));
    }
    function Morph(props) {
      var raiz = useRef(null), fim = useState(false);
      var linhas = useMemo(function () { return dep.diffLines(props.de, props.para); }, [props.de, props.para]);
      useLayoutEffect(function () {
        var el = raiz.current;
        if (!el || calmo()) { fim[1](true); return; }
        var dels = el.querySelectorAll('.mx-del .mx-w'), t0 = dels.length ? MX.risca + Math.min(dels.length, 10) * MX.passo : 0;
        var op = { duration: MX.muda, easing: 'cubic-bezier(.4, 0, .2, 1)' };
        // All measures first, then all animations: one layout, not one per word.
        var vh = w.innerHeight, visto = new Set();
        Array.prototype.forEach.call(el.children, function (p) { var r = p.getBoundingClientRect(); if (r.bottom > -80 && r.top < vh + 80) visto.add(p); });
        var noEcra = function (x) { var p = x.closest('.mx > *'); if (visto.has(p)) return true; if (x.closest('.mx-del') || x.getAttribute('data-mx') === 'sai') x.style.display = 'none'; return false; };
        var fora = Array.prototype.filter.call(el.querySelectorAll('p:not([data-mx]) .mx-del .mx-w'), noEcra);
        var dentro = Array.prototype.filter.call(el.querySelectorAll('p:not([data-mx]) .mx-ins .mx-w'), noEcra);
        var blocos = Array.prototype.filter.call(el.querySelectorAll('[data-mx="sai"], [data-mx="entra"]'), noEcra);
        var wf = fora.map(function (x) { return x.offsetWidth; }), wd = dentro.map(function (x) { return x.offsetWidth; });
        var bh = blocos.map(function (p) { return [p.offsetHeight, getComputedStyle(p).marginTop]; });
        var muitas = fora.length + dentro.length > MX.max;
        fora.forEach(function (x, k) {
          x.animate(muitas ? [{ opacity: 1 }, { opacity: 0 }] : [{ width: wf[k] + 'px', opacity: 1 }, { opacity: 0, offset: 0.45 }, { width: '0px', opacity: 0 }], Object.assign({ delay: t0, fill: 'forwards' }, op));
        });
        dentro.forEach(function (x, k) {
          x.animate(muitas ? [{ opacity: 0 }, { opacity: 1 }] : [{ width: '0px', opacity: 0 }, { opacity: 0, offset: 0.55 }, { width: wd[k] + 'px', opacity: 1 }], Object.assign({ delay: t0, fill: 'backwards' }, op));
        });
        blocos.forEach(function (p, k) {
          var cheio = { height: bh[k][0] + 'px', marginTop: bh[k][1], opacity: 1 }, nada = { height: '0px', marginTop: '0px', opacity: 0 }, sai = p.getAttribute('data-mx') === 'sai';
          p.style.overflow = 'hidden';
          p.animate(sai ? [cheio, nada] : [nada, cheio], Object.assign({ delay: t0, fill: sai ? 'forwards' : 'backwards' }, op)).onfinish = function () { p.style.overflow = ''; };
        });
        var tt = setTimeout(function () { fim[1](true); }, t0 + MX.muda + 20);
        return function () { clearTimeout(tt); };
      }, []);
      return h('div', { className: 'lei mx', ref: raiz, 'data-fim': fim[0] ? '' : undefined },
        linhas.map(function (l, k) { return linhaMorph(l, k, props.marca, fim[0], props.novo); }));
    }

    // The year at the needle counts through the years in between, like a date stamp (≤ 420 ms).
    function useAno(alvo) {
      var s = useState(alvo), atual = useRef(alvo);
      useEffect(function () {
        var de = atual.current;
        if (de === alvo || calmo() || Math.abs(alvo - de) > 80) { atual.current = alvo; s[1](alvo); return; }
        var t0 = performance.now(), dur = Math.min(420, 120 + 12 * Math.abs(alvo - de)), raf;
        (function tick(t) {
          var x = Math.min(1, (t - t0) / dur), v = Math.round(de + (alvo - de) * (1 - Math.pow(1 - x, 3)));
          atual.current = v; s[1](v);
          if (x < 1) raf = requestAnimationFrame(tick);
        })(t0);
        return function () { cancelAnimationFrame(raf); };
      }, [alvo]);
      return s[0];
    }

    // ---- Rever o tempo: the time ruler as a scrubber ---------------------------------------------
    // Drag the needle, or press anywhere on the line, and the article changes to the redação in force
    // at that date; on release it settles on that redação. The needle is a slider: ← → ↑ ↓ one redação,
    // PgUp/PgDn three, Home/End the ends, Esc stops a replay. ▶ replays the history.
    // The ruler never moves under the pointer: while it is held, the status lines above it keep the
    // tallest height they had, and after each step the page scrolls by what the lines above changed.
    // props: versions [{start, label, curto, pending, technical}], current, today, date, agulha (a date
    // that overrides the needle: an Origem replay), tocando, onTocar(on), rotuloTocar, rotuloCurto,
    // onGo(k, arrastando), acima (a selector: the block whose height is kept while the needle is held).
    function Maquina(props) {
      var vs = props.versions, i = props.current, n = vs.length, today = props.today;
      var arr = useState(null), arrasto = arr[0];
      var pista = useRef(null), ultimo = useRef(null), raiz = useRef(null);
      var lo = vs[0].start, last = vs[n - 1].start > today ? vs[n - 1].start : today, total = Math.max(1, diasEntre(lo, last));
      var pct = function (d) { return Math.max(0, Math.min(100, diasEntre(lo, d) / total * 100)); };
      var y0 = Number(lo.slice(0, 4)) + 1, y1 = Number(last.slice(0, 4)), step = y1 - y0 > 24 ? 10 : y1 - y0 > 10 ? 2 : 1, years = [];
      var limite = estreito() ? 86 : 94;
      for (var y = y0; y <= y1; y++) if ((y - y0) % step === 0 && pct(y + '-01-01') < limite) years.push(y);
      var dataAgulha = arrasto || props.agulha || (props.date > last ? last : props.date < lo ? lo : props.date);
      var kAgulha = props.agulha ? naData(vs, props.agulha) : arrasto ? naData(vs, arrasto) : i;
      var ano = useAno(Number(dataAgulha.slice(0, 4)));
      var acima = function () { return props.acima ? doc.querySelector(props.acima) : null; };
      useEffect(function () { doc.documentElement.classList.toggle('mo-arrasto', !!arrasto); }, [!!arrasto]);
      useEffect(function () { return function () { doc.documentElement.classList.remove('mo-arrasto'); var a = acima(); if (a) a.style.minHeight = ''; }; }, []);
      // Keep the ruler where it was: the height above it while held, and after each change of redação
      // (a drag, a key, ‹ ›, the register, a replay) the page scrolls by what the lines above it changed.
      useLayoutEffect(function () {
        var a = acima(), el = raiz.current;
        if (arrasto && a) a.style.minHeight = Math.max(a.offsetHeight, parseFloat(a.style.minHeight) || 0) + 'px';
        if (!el) return;
        var top = el.getBoundingClientRect().top, u = ultimo.current;
        if (u && u.i !== props.current && u.top > -40 && u.top < w.innerHeight && Math.abs(top - u.top) > 0.5) {
          w.scrollBy(0, top - u.top);
          top = el.getBoundingClientRect().top;
        }
        ultimo.current = { i: props.current, top: top };
      });
      useEffect(function () {
        var f = function () { if (raiz.current && ultimo.current) ultimo.current.top = raiz.current.getBoundingClientRect().top; };
        w.addEventListener('scroll', f, { passive: true });
        return function () { w.removeEventListener('scroll', f); };
      }, []);
      function ir(k, arrastando) { if (k >= 0 && k !== props.current) props.onGo(k, arrastando); }
      function dataDe(x) {
        var b = pista.current.getBoundingClientRect(), f = Math.max(0, Math.min(1, (x - b.left) / b.width));
        return somaDias(lo, Math.round(f * total));
      }
      function mover(e) { var d = dataDe(e.clientX); arr[1](d); ir(naData(vs, d), true); }
      function baixo(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        try { pista.current.setPointerCapture(e.pointerId); } catch (x) { /* an old browser */ }
        if (props.tocando && props.onTocar) props.onTocar(false);
        var p = doc.querySelector('.rp-agulha');
        if (p) p.focus({ preventScroll: true });
        mover(e);
      }
      function largar(e) {
        if (!arrasto) return;
        var k = naData(vs, dataDe(e.clientX));
        arr[1](null);
        var a = acima(), el = raiz.current;
        if (a && el && a.style.minHeight) {
          var t0 = el.getBoundingClientRect().top;
          a.style.minHeight = '';
          var d = el.getBoundingClientRect().top - t0;
          if (Math.abs(d) > 0.5) w.scrollBy(0, d);
          if (ultimo.current) ultimo.current.top = el.getBoundingClientRect().top;
        }
        ir(k < 0 ? 0 : k, false);
      }
      function tecla(e) {
        if (e.key === 'Escape' && props.tocando && props.onTocar) { props.onTocar(false); return; }
        var k = { ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: n - 1, PageDown: i - 3, PageUp: i + 3 }[e.key];
        if (k == null) return;
        e.preventDefault();
        if (props.tocando && props.onTocar) props.onTocar(false);
        ir(Math.max(0, Math.min(n - 1, k)), false);
      }
      var v = vs[kAgulha] || vs[i] || vs[0];
      var ini = pct(vs[kAgulha] ? vs[kAgulha].start : lo), fimM = pct(kAgulha < n - 1 && vs[kAgulha + 1] ? vs[kAgulha + 1].start : last);
      var rotulo = props.tocando ? 'Pausa' : props.rotuloTocar || 'Rever a história';
      return h('div', { ref: raiz, className: 'rp' + (arrasto ? ' is-arrasto' : '') + (props.tocando ? ' is-tocar' : ''), id: props.id },
        h('div', { className: 'rp-cab' },
          props.onTocar ? h('button', { type: 'button', className: 'rp-tocar', 'aria-pressed': !!props.tocando, 'aria-label': rotulo, onClick: function () { props.onTocar(!props.tocando); } },
            h('span', { className: 'rp-ico', 'aria-hidden': 'true' }, props.tocando ? '❚❚' : '▶'),
            h('span', { className: 'rp-longo', 'aria-hidden': 'true' }, rotulo),
            h('span', { className: 'rp-curto', 'aria-hidden': 'true' }, props.tocando ? 'Pausa' : props.rotuloCurto || 'Rever')) : null,
          h('p', { className: 'rp-onde', 'aria-hidden': 'true' }, h('span', { className: 'rp-ano' }, ano), ' ', h('span', { key: kAgulha, className: 'rp-ato' }, v.curto))),
        h('div', { className: 'rp-pista', ref: pista, onPointerDown: baixo, onPointerMove: function (e) { if (arrasto) mover(e); }, onPointerUp: largar, onPointerCancel: largar },
          h('span', { className: 'rd-ruler-line', 'aria-hidden': 'true' }),
          years.map(function (yy) { return h('span', { key: 'y' + yy, className: 'rd-ruler-year', style: { left: pct(yy + '-01-01') + '%' }, 'aria-hidden': 'true' }); }),
          vs.map(function (x, k) {
            return h('span', { key: k, className: 'rd-ruler-tick rp-tick' + (x.technical ? ' is-half' : '') + (x.pending ? ' is-pending' : '') + (k <= kAgulha ? ' is-passado' : ''), style: { left: pct(x.start) + '%', '--i': k }, 'aria-hidden': 'true' });
          }),
          h('span', { className: 'rp-vivido', style: { width: pct(dataAgulha) + '%' }, 'aria-hidden': 'true' }),
          h('span', { className: 'rd-ruler-marca rp-marca', style: { left: ini + '%', width: 'max(' + Math.max(0, fimM - ini) + '%, 6px)' }, 'aria-hidden': 'true' }),
          h('span', { className: 'rd-ruler-today', style: { left: pct(today) + '%' }, 'aria-hidden': 'true' }),
          h('span', { className: 'rp-agulha', role: 'slider', tabIndex: 0, style: { left: pct(dataAgulha) + '%' },
            'aria-label': 'Redação no tempo', 'aria-valuemin': 1, 'aria-valuemax': n, 'aria-valuenow': i + 1, 'aria-valuetext': vs[i] ? vs[i].label : '',
            onKeyDown: tecla })),
        h('div', { className: 'rd-ruler-labels', 'aria-hidden': 'true' },
          years.map(function (yy) { return h('span', { key: yy, style: { left: pct(yy + '-01-01') + '%' } }, yy); }),
          h('span', { className: 'rd-ruler-hoje', style: { left: pct(today) + '%' } }, 'hoje')));
    }

    // ---- Rever o tempo: the replay clock ----------------------------------------------------------
    // Texto and Alterações step one redação at a time; Origem brings in one act at a time (the words
    // not written yet wait in grey; each act's words take their colour, in reading order). It plays only
    // after a press, pauses on a second press or Esc, and stops on any other key or pointer press.
    // cfg: an object the page fills during its render (read after it): {i, n, ver, atosO: [act index,
    // oldest first], runs, href(k)}; ir(hash, salto) changes the redação (salto: a jump, not a step).
    function useReplay(cfg, ir) {
      var rp = useState(false), bl = useState(null), esperado = useRef(null), c = useRef(cfg);
      c.current = cfg;
      var parar = function () { rp[1](false); esperado.current = null; if (bl[0] != null) bl[1](null); };
      useEffect(function () {
        var s = c.current;
        if (!rp[0]) return;
        if (s.ver === 'origem') {
          if (bl[0] == null) return;
          var t = setTimeout(function () { if (bl[0] + 1 >= s.atosO.length) { bl[1](null); rp[1](false); } else bl[1](bl[0] + 1); }, bl[0] < 0 ? 700 : passoReplay(s.atosO.length + 1));
          return function () { clearTimeout(t); };
        }
        if (esperado.current != null && s.i !== esperado.current) { rp[1](false); esperado.current = null; return; }
        if (s.i >= s.n - 1) { var t1 = setTimeout(function () { rp[1](false); esperado.current = null; }, 300); return function () { clearTimeout(t1); }; }
        var t2 = setTimeout(function () { esperado.current = s.i + 1; ir(s.href(s.i + 1)); }, passoReplay(s.n));
        return function () { clearTimeout(t2); };
      }, [rp[0], w.location.hash, bl[0]]);
      // Any other key or pointer press stops it (the play button and the needle handle their own).
      useEffect(function () {
        if (!rp[0]) return;
        var outro = function (e) {
          if (e.key !== 'Escape' && e.target.closest && e.target.closest('.rp-tocar, .rp-agulha, .rp-pista')) return;
          if (e.type === 'keydown' && /^(Shift|Control|Alt|Meta|Tab)$/.test(e.key)) return;
          rp[1](false); esperado.current = null; bl[1](null);
        };
        doc.addEventListener('keydown', outro, true);
        doc.addEventListener('pointerdown', outro, true);
        return function () { doc.removeEventListener('keydown', outro, true); doc.removeEventListener('pointerdown', outro, true); };
      }, [rp[0]]);
      // Origem: words and runs of acts not reached yet are grey.
      useLayoutEffect(function () {
        var s = c.current, ate = bl[0] == null ? null : (s.atosO || [])[bl[0]], porAto = {};
        doc.documentElement.classList.toggle('mo-rp-origem', bl[0] != null);
        doc.querySelectorAll('.lei-o .rd-ofr').forEach(function (x) {
          var o = Number(x.getAttribute('data-o')), ainda = bl[0] != null && (ate == null || o > ate);
          if (!ainda && x.classList.contains('rp-ainda')) { var k = porAto[o] = (porAto[o] || 0) + 1; x.style.transitionDelay = Math.min(420, k * 9) + 'ms'; }
          else x.style.transitionDelay = '';
          x.classList.toggle('rp-ainda', ainda);
        });
        doc.querySelectorAll('.lei-o .rd-orun').forEach(function (r) {
          var run = s.runs && s.runs[Number(r.getAttribute('data-run'))];
          r.classList.toggle('rp-ainda', !!run && bl[0] != null && (ate == null || run.key > ate));
        });
      }, [bl[0], w.location.hash]);
      useEffect(function () { return function () { doc.documentElement.classList.remove('mo-rp-origem'); }; }, []);
      return {
        tocando: rp[0], origemAte: bl[0] == null ? null : (c.current.atosO || [])[Math.max(0, bl[0])],
        parar: parar,
        tocar: function (on) {
          var s = c.current;
          if (!on) { parar(); return; }
          if (s.ver === 'origem') { bl[1](-1); rp[1](true); return; }
          rp[1](true);
          if (s.i >= s.n - 1) { esperado.current = 0; ir(s.href(0), true); } else esperado.current = s.i;
        }
      };
    }

    // ---- Rever o tempo: a diploma's acts on one line (#/quem/<slug>) -----------------------------
    // Drawn once on arrival: the line grows from the first act to today and each act lands as the pen
    // passes its date (≤ 2.2 s). Sticky under the title; the band of the Government (or legislatura)
    // on the reading line is verde. A tick is a button: it scrolls to that act and marks it.
    // props: atos [{id, nome, data, ret}], faixas [{id, inicio, fim, rotulo, titulo}], desde, raiz (ref of the list).
    function LinhaTempo(props) {
      var atos = props.atos, faixas = props.faixas, desde = props.desde, today = dep.hoje();
      var el0 = useRef(null), ponta = useRef(null);
      var total = Math.max(1, diasEntre(desde, today)), pct = function (d) { return Math.max(0, Math.min(100, diasEntre(desde, d) / total * 100)); };
      var dur = Math.max(1100, Math.min(2200, atos.length * 140));
      var lido = useLeitura(props.raiz, '.periodo[data-per]', LINHA, [props.chave]);
      var em = lido ? lido.getAttribute('data-per') : null;
      useLayoutEffect(function () {
        var el = el0.current;
        if (!el || calmo()) return;
        var linha = el.querySelector('.lt-linha'), a0 = Number(desde.slice(0, 4)), a1 = Number(today.slice(0, 4));
        // One clock for the pen, the line and the acts: each act lands when the pen reaches its date.
        var ease = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
        var quando = function (f) { return f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2); };
        el.querySelectorAll('.lt-ato').forEach(function (a) {
          a.animate([{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 240, delay: quando(Number(a.getAttribute('data-f'))) * dur, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' });
        });
        el.querySelectorAll('.lt-gov').forEach(function (g) {
          g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: quando(Number(g.getAttribute('data-f'))) * dur, fill: 'backwards' });
        });
        var p = ponta.current, t0 = performance.now(), raf;
        p.style.opacity = 1;
        (function tick(t) {
          var x = Math.min(1, (t - t0) / dur), e = ease(x);
          p.style.left = (e * 100) + '%';
          linha.style.transform = 'scaleX(' + e + ')';
          p.firstChild.textContent = Math.floor(a0 + (a1 - a0) * e);
          if (x < 1) raf = requestAnimationFrame(tick); else { p.style.opacity = 0; p.style.left = '0'; linha.style.transform = ''; }
        })(t0);
        return function () { cancelAnimationFrame(raf); };
      }, []);
      function irPara(id) {
        var e = doc.getElementById('ato-' + id);
        if (!e) return;
        e.scrollIntoView({ block: 'center', behavior: calmo() ? 'auto' : 'smooth' });
        e.classList.remove('lt-alvo'); void e.offsetWidth; e.classList.add('lt-alvo');
        var a = e.querySelector('a'); if (a) a.focus({ preventScroll: true });
      }
      var anoIni = Number(desde.slice(0, 4)), anoFim = Number(today.slice(0, 4)), anos = [];
      for (var y = Math.ceil(anoIni / 5) * 5; y <= anoFim; y += 5) if (pct(y + '-01-01') > 4 && pct(y + '-01-01') < 92) anos.push(y);
      return h('div', { className: 'lt', ref: el0 },
        h('p', { className: 'lt-titulo' }, atos.length === 1 ? '1 ato desde ' + anoIni : atos.length + ' atos desde ' + anoIni),
        h('div', { className: 'lt-pista' },
          faixas.map(function (g, k) {
            var a = pct(g.inicio < desde ? desde : g.inicio), b = pct(g.fim || today);
            if (b - a <= 0) return null;
            return h('span', { key: g.id, className: 'lt-gov' + (k % 2 ? ' lt-gov-par' : '') + (em === g.id ? ' is-em' : ''), 'data-f': a / 100,
              style: { left: a + '%', width: (b - a) + '%' }, title: g.titulo, 'aria-hidden': 'true' }, b - a > 6 ? g.rotulo : '');
          }),
          h('span', { className: 'lt-linha', 'aria-hidden': 'true' }),
          atos.map(function (a) {
            return h('button', { key: a.id, type: 'button', className: 'lt-ato' + (a.ret ? ' is-ret' : ''), 'data-f': pct(a.data) / 100, style: { left: pct(a.data) + '%' },
              'aria-label': a.nome + ', ' + dep.extenso(a.data), title: a.nome + ' · ' + dep.curta(a.data), onClick: function () { irPara(a.id); } });
          }),
          h('span', { className: 'lt-ponta', ref: ponta, 'aria-hidden': 'true' }, h('span', null, anoIni))),
        h('div', { className: 'rd-ruler-labels lt-anos', 'aria-hidden': 'true' },
          h('span', { style: { left: 0, transform: 'none' } }, anoIni),
          anos.map(function (yy) { return h('span', { key: yy, style: { left: pct(yy + '-01-01') + '%' } }, yy); }),
          h('span', { className: 'rd-ruler-hoje', style: { left: '100%' } }, 'hoje')));
    }

    // ---- O scroll é o relógio: the reading hairline (diploma pages) --------------------------------
    // 2 px of verde across the top of the window: the share of the page read. A scroll timeline where
    // there is one; else one rAF per scroll frame. Hidden under reduced motion and in print.
    function Progresso() {
      var ref = useRef(null);
      useEffect(function () {
        if (TL) return;
        var el = ref.current, raf = 0;
        var f = function () { raf = 0; var m = doc.documentElement.scrollHeight - w.innerHeight; if (el) el.style.transform = 'scaleX(' + (m > 0 ? Math.min(1, w.scrollY / m) : 0) + ')'; };
        var on = function () { if (!raf) raf = requestAnimationFrame(f); };
        f();
        w.addEventListener('scroll', on, { passive: true });
        w.addEventListener('resize', on);
        return function () { w.removeEventListener('scroll', on); w.removeEventListener('resize', on); };
      }, []);
      return h('div', { className: 'mo-progresso', ref: ref, 'aria-hidden': 'true' });
    }

    // ---- O scroll é o relógio: the passage of a law, beside «Quem fez esta lei» ----------------------
    // One stop per stage (from the data, see etapasDe), placed where its sentence sits, so the verde fill
    // reaches a stop as its sentence crosses the reading line. Vertical in the facts column; on a phone,
    // horizontal and sticky at the top of the section, naming the current stage. A picture of the
    // sentences: aria-hidden.
    function Passagem(props) {
      var raiz = props.raiz, pos = useState([]);
      var etapas = etapasDe(props.frases);
      var lido = useLeitura(raiz, ':scope > *', LINHA, [props.chave]);
      var ki = lido && raiz.current ? Array.prototype.indexOf.call(raiz.current.children, lido) : -1;
      useEffect(function () {
        var el = raiz.current;
        if (!el) return;
        var medir = function () {
          var r = el.getBoundingClientRect(), hh = r.height || 1;
          pos[1](Array.prototype.map.call(el.children, function (c) { return Math.max(0, Math.min(100, (c.getBoundingClientRect().top - r.top + 11) / hh * 100)); }));
        };
        medir();
        var ro = w.ResizeObserver ? new ResizeObserver(medir) : null;
        if (ro) ro.observe(el);
        return function () { if (ro) ro.disconnect(); };
      }, [props.chave]);
      if (etapas.length < 2) return null;
      var vis = etapas.filter(function (e) { return pos[0][e.k] != null; });
      var feitas = vis.filter(function (e) { return e.k <= ki; }), atual = feitas[feitas.length - 1];
      var p = atual ? pos[0][atual.k] / 100 : 0;
      var orient = props.orient;
      return h('div', { className: 'passagem passagem-' + orient, 'aria-hidden': 'true' },
        h('p', { className: 'passagem-t' }, orient === 'h' && atual
          ? h('span', { key: atual.k, className: 'passagem-agora' }, atual.nome, atual.data ? h('span', { className: 'passagem-data' }, ' · ' + dep.curta(atual.data)) : null)
          : 'A passagem desta lei'),
        h('div', { className: 'passagem-pista', style: { '--p': p } },
          h('span', { className: 'passagem-eixo' }), h('span', { className: 'passagem-fill' }),
          vis.map(function (e) {
            return h('span', { key: e.k, className: 'passagem-paragem' + (e.k <= ki ? ' is-feita' : '') + (atual && e.k === atual.k ? ' is-atual' : ''), style: { '--pos': pos[0][e.k] + '%' } },
              h('span', { className: 'passagem-ponto' }),
              orient === 'v' ? h('span', { className: 'passagem-nome' }, e.nome, e.data ? h('span', { className: 'passagem-data' }, dep.curta(e.data)) : null) : null);
          })));
    }

    // ---- O scroll é o relógio: the ruler of a story -------------------------------------------------
    // From the end of the story's first chronology to its notes, a slim ruler stays at the top. Verde runs
    // to the latest act the text has reached; the acts of the paragraph on the reading line are dark and
    // named; the left says which section the reader is in. It steps aside while a step-through figure is
    // on the reading line (one sticky element at a time). A picture of the text: aria-hidden.
    function ReguaHistoria(props) {
      var p = props.fig.params, ref = props.dados, info = props.info;
      var el = useLeitura(props.raiz, '[data-b]', LINHA, []);
      var b = el ? Number(el.getAttribute('data-b')) : -1, i = b >= 0 ? info[b] : null;
      var fim = p.ate || dep.hoje(), a0 = dep.anoDe(p.desde), a1 = dep.anoDe(fim);
      var pc = function (iso) { return Math.max(0, Math.min(100, (dep.anoDe(iso) - a0) / (a1 - a0) * 100)); };
      var ativos = i && i.secao ? i.atos : [], ate = i ? i.ate : null;
      var lado = function (x) { return x < 10 ? ' rf-esq' : x > 90 ? ' rf-dir' : ''; };
      var spans = ((ref.governos || {}).governos || []);
      return h('div', { className: 'rf' + (i && i.passos ? ' is-oculta' : ''), 'aria-hidden': 'true' },
        h('p', { className: 'rf-topo' }, h('span', { className: 'rf-onde', key: (i && i.secao) || '' }, (i && i.secao) || ''), h('span', { className: 'rf-quando' }, ate ? ate.slice(0, 4) : '')),
        h('div', { className: 'rf-pista' },
          h('span', { className: 'rf-eixo' }),
          h('span', { className: 'rf-fill', style: { transform: 'scaleX(' + (ate ? pc(ate) / 100 : 0) + ')' } }),
          spans.map(function (s, k) {
            var l = pc(s.inicio), r = pc(s.fim || fim);
            return r - l < 0.2 ? null : h('span', { key: 'g' + k, className: 'rf-g', style: { left: l + '%', width: (r - l) + '%' } });
          }),
          (p.atos || []).map(function (a) {
            var on = ativos.indexOf(a.ato) >= 0, x = pc(a.data), des = ((ref.atos || {})[a.ato] || {}).designacao || a.ato;
            return h('span', { key: a.ato, className: 'rf-t' + (ate && a.data <= ate ? ' is-lido' : '') + (on ? ' is-ativo' : '') + (a.marcado ? ' is-marca' : ''), style: { left: x + '%' } },
              on ? h('span', { className: 'rf-rot' + lado(x) }, dep.curtoAto(des)) : null);
          })),
        h('p', { className: 'rf-anos' }, h('span', null, p.desde.slice(0, 4)), h('span', null, p.ate ? p.ate.slice(0, 4) : 'hoje')));
    }

    // ---- O scroll é o relógio: the step-through figure («passos») ------------------------------------
    // The figure stays (sticky) while short steps of text pass beside it (under it on a phone); the step
    // on the reading line chooses the redação it shows, compared with the step before. Scrolling back
    // goes back. The old state leaves in 120 ms, the new one arrives in 240 ms: never two texts at once.
    // A screen reader hears each step with the full text of that redação; the panel is aria-hidden.
    function FigPassos(props) {
      var p = props.b.params, r = dep.useData(['d/' + p.diploma + '/' + p.artigo + '.json']), raiz = useRef(null);
      var ativo = useLeitura(raiz, '.ps-passo', function () { return w.matchMedia('(max-width: 1099px)').matches ? 0.78 : LINHA; }, [!!r.data]);
      if (!r.data) return h(dep.FigCarregar, { error: r.error });
      var art = r.data[0], ref = props.dados || {};
      var k = ativo ? Number(ativo.getAttribute('data-k')) : 0;
      var textos = p.passos.map(function (ps) {
        var v = art.versoes[ps.i];
        if (!v) return null;
        var ls = dep.texto(v).split('\n');
        return linhasPasso(ls, dep.rotular(ls), ps.mostrar[0]).join('\n');
      });
      if (textos.some(function (t) { return t == null; })) return h('p', { className: 'fig-retida' }, 'Esta figura está em revisão: os dados mudaram depois do texto.');
      var n = p.passos.length;
      var estados = p.passos.map(function (ps, j) {
        var v = art.versoes[ps.i], a = (ref.atos || {})[v.ato] || { designacao: v.ato };
        var linhas = j ? dep.diffLines(textos[j - 1], textos[j]) : textos[j].split('\n').map(function (t) { return [{ op: 'eq', text: t }]; });
        return { ato: a, ano: ps.ano, linhas: linhas };
      });
      var onde = function (ps) { var s = ps.mostrar[0]; return s.al ? 'Alínea ' + s.al + ')' + (s.n ? ' do n.º ' + s.n : '') : 'N.º ' + s.n; };
      return h('div', { className: 'passos', ref: raiz, style: { '--n': n } },
        h('div', { className: 'ps-painel', 'aria-hidden': 'true' },
          h('div', { className: 'ps-regua', style: { '--k': n > 1 ? k / (n - 1) : 1 } },
            h('span', { className: 'ps-eixo' }), h('span', { className: 'ps-fill' }),
            estados.map(function (e, j) {
              return h('span', { key: j, className: 'ps-ponto' + (j < k ? ' is-feito' : '') + (j === k ? ' is-atual' : ''), style: { left: (n > 1 ? j / (n - 1) * 100 : 0) + '%' } }, h('span', { className: 'ps-ano' }, e.ano));
            })),
          h('div', { className: 'ps-pilha' }, estados.map(function (e, j) {
            return h('div', { key: j, className: 'ps-estado' + (j === k ? ' is-atual' : j < k ? ' is-antes' : '') },
              h('p', { className: 'ps-quem' }, h('span', { className: 'ps-ano-g' }, e.ano), ' ', e.ato.designacao),
              h('p', { className: 'ps-al' }, onde(p.passos[j]) + (j ? ', comparada com ' + estados[j - 1].ano : '')),
              h('div', { className: 'lei ps-lei' }, e.linhas.map(function (l, q) { return dep.segsLei(l, 's' + j + '-' + q); })));
          })),
          dep.legendaRedline()),
        h('ol', { className: 'ps-passos' }, p.passos.map(function (ps, j) {
          return h('li', { key: j, className: 'ps-passo' + (j === k ? ' is-atual' : ''), 'data-k': j },
            h('p', { className: 'ps-passo-t' }, dep.render(ps.partes, props.ctx)),
            h('p', { className: 'rd-sr' }, onde(ps) + ' em ' + ps.ano + ': ' + textos[j]));
        })));
    }

    return { useLeitura: useLeitura, Morph: Morph, Maquina: Maquina, useReplay: useReplay, LinhaTempo: LinhaTempo, Progresso: Progresso,
      Passagem: Passagem, ReguaHistoria: ReguaHistoria, FigPassos: FigPassos };
  };
})();
