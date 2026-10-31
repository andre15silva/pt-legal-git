// Records a scripted browser session of the live site as an MP4.
// Frames come from the Chrome DevTools screencast (sharp, unlike the built-in video recorder),
// with their timestamps; ffmpeg turns them into constant 30 fps H.264.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = 'https://andre15silva.github.io/pt-legal-git/';
const OUT = path.join(__dirname, 'out');

// A visible cursor, and a caption bar, drawn into the page (the screencast has no cursor).
const OVERLAY = `
(() => {
  if (document.getElementById('demo-cursor')) return;
  const st = document.createElement('style');
  st.textContent = \`
    #demo-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
      background: rgba(20,20,20,.18); border: 2px solid rgba(20,20,20,.75); pointer-events: none; transition: transform .12s ease, background .12s ease; left: -40px; top: -40px; }
    #demo-cursor.down { transform: scale(.7); background: rgba(20,20,20,.45); }
    #demo-cap { position: fixed; z-index: 2147483646; left: 0; right: 0; bottom: 0; height: 76px; display: flex; flex-direction: column; justify-content: center;
      padding: 0 40px; background: #141414; color: #fff; font: 500 23px/1.3 "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif; text-align: center; pointer-events: none; }
    #demo-cap span { transition: opacity .3s ease; opacity: 0; }
    #demo-cap.on span { opacity: 1; }
    #demo-cap small { display: block; font-size: 16px; font-weight: 400; color: rgba(255,255,255,.7); margin-top: 2px; }
    body { padding-bottom: 76px; }
    html { scroll-behavior: auto !important; }\`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'demo-cursor'; document.body.appendChild(c);
  const cap = document.createElement('div'); cap.id = 'demo-cap'; document.body.appendChild(cap);
  addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => c.classList.add('down'), true);
  addEventListener('mouseup', () => c.classList.remove('down'), true);
})();`;

async function sessao(nome, { width = 1280, height = 720, escala = 1.5, tema = 'light' } = {}, roteiro) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: escala, colorScheme: tema, locale: 'pt-PT' });
  const page = await ctx.newPage();
  // Close «Como ler esta página» on every kind of page, as for a returning reader: it pushes the text down.
  await page.addInitScript(() => { try { ['artigo', 'ato', 'diploma', 'iniciativa', 'alteracoes', 'quem', 'grupo'].forEach(t => localStorage.setItem('redacao-guia-' + t, '1')); } catch (e) {} });
  page.on('pageerror', e => console.log(nome + ': page error: ' + e.message));
  await page.addInitScript(OVERLAY.replace('(() => {', '(() => { addEventListener("DOMContentLoaded", () => {').replace(/\}\)\(\);$/, '}); })();'));
  const cdp = await ctx.newCDPSession(page);
  const dir = path.join(OUT, nome);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let gravar = false, relogio = null;   // relogio: wall clock minus frame clock, in seconds
  cdp.on('Page.screencastFrame', async f => {
    if (gravar) {
      const file = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      frames.push({ file, t: f.metadata.timestamp });
      if (relogio == null) relogio = Date.now() / 1000 - f.metadata.timestamp;
    }
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const pausa = ms => page.waitForTimeout(ms);
  const api = {
    page, pausa,
    async ir(hash) { await page.goto(SITE + hash); await page.waitForLoadState('networkidle'); await api.pronto(); await page.evaluate(() => window.scrollTo(0, 0)); await pausa(400); },
    // Wait until nothing on the page is loading («A carregar…», aria-busy).
    async pronto() {
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !/A carregar/.test(document.body.innerText), null, { timeout: 20000 });
    },
    // Scroll through the whole page and back, before recording, so lazy figures are loaded.
    async percorrer() {
      const h = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < h; y += 500) { await page.evaluate(y => window.scrollTo(0, y), y); await pausa(60); }
      await page.waitForLoadState('networkidle'); await api.pronto();
      await page.evaluate(() => window.scrollTo(0, 0)); await pausa(300);
    },
    async legenda(txt, sub) {
      await page.evaluate(([t, s]) => { const c = document.getElementById('demo-cap'); c.classList.remove('on'); setTimeout(() => { c.innerHTML = '<span>' + t + (s ? '<small>' + s + '</small>' : '') + '</span>'; requestAnimationFrame(() => c.classList.add('on')); }, c.innerHTML ? 250 : 0); }, [txt, sub || '']);
    },
    async semLegenda() { await page.evaluate(() => document.getElementById('demo-cap').classList.remove('on')); },
    // Move the cursor to an element in steps, then click it.
    async clicar(loc, { mover = 700 } = {}) {
      const el = (typeof loc === 'string' ? page.locator(loc) : loc).filter({ visible: true }).first();
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: Math.round(mover / 16) });
      await pausa(180);
      await page.mouse.down(); await pausa(90); await page.mouse.up();
    },
    // Move the cursor to an element. { sob: true } stops just under it and { margem: true } just left
    // of its first line, so the words stay legible (and no glossary term opens its definition on hover).
    async apontar(loc, mover = 700, { sob = false, margem = false } = {}) {
      const el = (typeof loc === 'string' ? page.locator(loc) : loc).filter({ visible: true }).first();
      const box = await el.boundingBox();
      const x = margem ? box.x - 18 : sob ? box.x + Math.min(box.width / 2, 80) : box.x + box.width / 2;
      const y = margem ? box.y + Math.min(box.height / 2, 12) : sob ? box.y + box.height + 14 : box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: Math.round(mover / 16) });
    },
    // Scroll smoothly by dy pixels over ms (eased). The page scrolls, or `dentro`: a scrolling box
    // such as the «Origem do texto» sheet. Scrolled from script, not the wheel: wheel events go to
    // whatever is under the cursor and Chrome drops some of them.
    async rolar(dy, ms = 1200, dentro = null) {
      const passos = Math.max(1, Math.round(ms / 16));
      const h = dentro ? await (typeof dentro === 'string' ? page.locator(dentro) : dentro).first().elementHandle() : null;
      const y0 = await page.evaluate(el => el ? el.scrollTop : scrollY, h);
      for (let i = 1; i <= passos; i++) {
        const t = i / passos, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        await page.evaluate(([el, y]) => el ? (el.scrollTop = y) : window.scrollTo(0, y), [h, y0 + dy * e]);
        await pausa(16);
      }
    },
    // Scroll smoothly until the element's top sits at `onde` (0–1) of the space above the caption band.
    // An element inside a scrolling box (the sheet) scrolls that box.
    async mostrar(loc, onde = 0.3, ms = 1000) {
      const el = (typeof loc === 'string' ? page.locator(loc) : loc).filter({ visible: true }).first();
      const caixa = await el.evaluateHandle(e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; } return null; });
      const dentro = await caixa.evaluate(c => !!c) ? caixa.asElement() : null;
      const box = await el.boundingBox();
      const topo = dentro ? (await dentro.boundingBox()).y : 0;
      const alvo = topo + (page.viewportSize().height - 76 - topo) * onde;
      // Never past the end of the page (or box).
      const resto = await page.evaluate(c => c ? c.scrollHeight - c.clientHeight - c.scrollTop : document.documentElement.scrollHeight - innerHeight - scrollY, dentro);
      await api.rolar(Math.min(box.y - alvo, resto), ms, dentro ? page.locator('#' + (await dentro.evaluate(c => c.id || (c.id = 'rolar-' + Math.random().toString(36).slice(2))))) : null);
    },
    async escrever(sel, txt) { await api.clicar(sel); for (const ch of txt) { await page.keyboard.type(ch); await pausa(85); } },
  };
  await page.goto(SITE); await page.waitForLoadState('networkidle');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(width * escala), maxHeight: Math.round(height * escala), everyNthFrame: 1 });
  await roteiro(api, () => { gravar = true; });
  await pausa(300);
  // Chrome sends a frame only when the screen changes: the last one lasts until the script ends.
  const fim = relogio == null ? null : Date.now() / 1000 - relogio;
  await cdp.send('Page.stopScreencast');
  await b.close();
  return codificar(nome, frames, Math.round(width * escala), Math.round(height * escala), fim);
}

// Frames with timestamps -> constant 30 fps MP4 (each frame lasts until the next one).
function codificar(nome, frames, w, h, fim) {
  const dir = path.join(OUT, nome), lista = path.join(dir, 'lista.txt');
  const linhas = [];
  frames.forEach((f, i) => {
    const dur = i + 1 < frames.length ? frames[i + 1].t - f.t : fim ? Math.max(fim - f.t, 0.1) : 1.0;
    linhas.push(`file '${f.file}'`, `duration ${Math.max(dur, 0.001).toFixed(4)}`);
  });
  linhas.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(lista, linhas.join('\n'));
  const mp4 = path.join(OUT, nome + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista,
    '-vf', `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', mp4]);
  const dur = (fim || frames[frames.length - 1].t + 1.0) - frames[0].t;
  console.log(nome + '.mp4', frames.length + ' frames', dur.toFixed(1) + ' s');
  return mp4;
}

module.exports = { sessao, OUT };
