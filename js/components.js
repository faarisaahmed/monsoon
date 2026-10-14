// Reusable pieces: icons, audio buttons, native-text rendering, item rows, writing pad.

import { h, add, toast } from './ui.js';
import { speak, canSpeak, stop } from './audio.js';
import { settings } from './store.js';

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICONS = {
  speaker: svg('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>'),
  slow: svg('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  play: svg('<path d="m7 4 13 8-13 8V4z"/>'),
  check: svg('<path d="m5 12 5 5L20 7"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  book: svg('<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M8 20a4 4 0 0 1 0-8h10"/>'),
  cards: svg('<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v12"/>'),
  ear: svg('<path d="M6 9a6 6 0 1 1 12 0c0 4-4 5-4 9a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 1 1 4 0"/>'),
  pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  keyboard: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10"/>'),
  puzzle: svg('<path d="M4 7h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4z"/>'),
  hash: svg('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
  letters: svg('<path d="M4 20 9 4l5 16M6 14h6"/><path d="M15 20h5M17.5 10v10"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  arrowL: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  arrowR: svg('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
};
export const icon = (name) => h('span', { html: ICONS[name], style: { display: 'inline-flex', width: '18px', height: '18px' } });

// The language currently being rendered (set by the router).
export const ctx = { lang: null };

// Native text span with the right font/direction.
export function nt(text, cls = '') {
  const L = ctx.lang;
  return h('span.nt' + (cls ? '.' + cls : '') + (L?.dir === 'rtl' ? '.rtl' : ''), { lang: L?.code, dir: L?.dir === 'rtl' ? 'rtl' : null }, text);
}

// Romanization respecting the user's preference.
export function rm(text, force) {
  const mode = force || settings().roman;
  if (!text || mode === 'hide') return null;
  const el = h('span.roman' + (mode === 'tap' ? '.tap' : ''), text);
  if (mode === 'tap') {
    el.title = 'Tap to show';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.toggle('shown');
    });
  }
  return el;
}

// Play button for a piece of native text.
export function audioBtn(text, { size = '', slow = false, auto = false } = {}) {
  const L = ctx.lang;
  if (L && !canSpeak(L.tts)) return null; // e.g. Sindhi: no voice exists, so no dead buttons
  const b = h('button.icon-btn' + (size ? '.' + size : ''), {
    type: 'button',
    title: slow ? 'Play slowly' : 'Listen',
    'aria-label': slow ? 'Play slowly' : 'Listen',
    html: slow ? ICONS.slow : ICONS.speaker,
  });
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!L) return;
    if (!canSpeak(L.tts)) {
      toast(`No ${L.name} voice is available on this device. See Settings → Audio.`);
      return;
    }
    b.classList.add('playing');
    const ok = await speak(text, L.tts, slow ? { rate: 0.6 } : {});
    b.classList.remove('playing');
    if (!ok) toast('Could not play audio. Check your connection or install a voice (Settings → Audio).');
  });
  if (auto) setTimeout(() => b.isConnected && b.click(), 250);
  return b;
}

export const play = (text) => ctx.lang && canSpeak(ctx.lang.tts) && speak(text, ctx.lang.tts);
export { stop };

// A vocab/phrase row.
export function itemRow(it, { phrase = false, extra = null } = {}) {
  return h(
    'div.item' + (phrase ? '.phrase' : ''),
    audioBtn(it.native),
    h(
      'div',
      h('div.line1', nt(it.native), rm(it.roman)),
      h('div.line1', h('span.en', it.en), it.pos ? h('span.pos', it.pos) : null),
      it.note ? h('div.note', it.note) : null,
      extra,
    ),
  );
}

export function exampleRow(ex) {
  return h('div.ex', audioBtn(ex.native, { size: 'sm' }), h('div', h('div', nt(ex.native), ' ', rm(ex.roman)), h('div.small', ex.en)));
}

// ---------- writing pad ----------
// A square canvas with a faint guide glyph; returns { el, clear, score }.
export function writingPad(glyph, { guide = true } = {}) {
  const L = ctx.lang;
  const wrap = h('div.write-pad');
  const guideC = h('canvas');
  const ink = h('canvas');
  add(wrap, h('div.guide-lines'), guideC, ink);
  let dpr = window.devicePixelRatio || 1;
  let showGuide = guide;
  let strokes = [];
  let size = 0;

  function fontFor(px) {
    return `500 ${px}px "${L?.font || 'system-ui'}", system-ui`;
  }
  function fitGlyph(c, color) {
    const g = c.getContext('2d');
    let px = size * 0.62;
    g.font = fontFor(px);
    const w = g.measureText(glyph).width;
    if (w > size * 0.86) px *= (size * 0.86) / w;
    g.font = fontFor(px);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = L?.dir === 'rtl' ? 'rtl' : 'ltr';
    g.fillText(glyph, size / 2, size / 2 + (L?.dir === 'rtl' ? -size * 0.06 : size * 0.02));
  }
  function drawGuide() {
    const g = guideC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    if (showGuide) fitGlyph(guideC, getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#ddd');
  }
  function redraw() {
    const g = ink.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#111';
    g.lineWidth = Math.max(6, size / 34);
    for (const s of strokes) {
      g.beginPath();
      s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.length === 1) g.lineTo(s[0][0] + 0.1, s[0][1]);
      g.stroke();
    }
  }
  function resize() {
    size = wrap.clientWidth || 300;
    dpr = window.devicePixelRatio || 1;
    for (const c of [guideC, ink]) {
      c.width = size * dpr;
      c.height = size * dpr;
    }
    drawGuide();
    redraw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  document.fonts?.load(fontFor(40), glyph).then(resize);

  let drawing = null;
  const pos = (e) => {
    const r = ink.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * size, ((e.clientY - r.top) / r.height) * size];
  };
  ink.addEventListener('pointerdown', (e) => {
    ink.setPointerCapture(e.pointerId);
    drawing = [pos(e)];
    strokes.push(drawing);
    redraw();
  });
  ink.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    drawing.push(pos(e));
    redraw();
  });
  const end = () => (drawing = null);
  ink.addEventListener('pointerup', end);
  ink.addEventListener('pointercancel', end);

  // Rough similarity: how much of the glyph you covered, and how much ink stayed near it.
  function score() {
    if (!strokes.length) return null;
    const N = 96;
    const off = (draw) => {
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d');
      g.scale(N / size, N / size);
      draw(g);
      return g.getImageData(0, 0, N, N).data;
    };
    const target = off((g) => {
      const tmp = { getContext: () => g };
      fitGlyph(tmp, '#000');
    });
    const user = off((g) => {
      g.lineCap = g.lineJoin = 'round';
      g.lineWidth = Math.max(6, size / 34) * 2.2;
      g.strokeStyle = '#000';
      for (const s of strokes) {
        g.beginPath();
        s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
    });
    // dilate target for tolerance
    const dil = new Uint8Array(N * N);
    const R = 5;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (target[(y * N + x) * 4 + 3] < 80) continue;
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < N && yy < N) dil[yy * N + xx] = 1;
          }
      }
    let tgt = 0, covered = 0, ink2 = 0, inside = 0;
    for (let i = 0; i < N * N; i++) {
      const t = target[i * 4 + 3] > 80;
      const u = user[i * 4 + 3] > 80;
      if (t) {
        tgt++;
        if (u) covered++;
      }
      if (u) {
        ink2++;
        if (dil[i]) inside++;
      }
    }
    const recall = tgt ? covered / tgt : 0;
    const precision = ink2 ? inside / ink2 : 0;
    return Math.round(100 * (2 * recall * precision) / (recall + precision || 1));
  }

  return {
    el: wrap,
    clear() {
      strokes = [];
      redraw();
    },
    undo() {
      strokes.pop();
      redraw();
    },
    toggleGuide(v) {
      showGuide = v ?? !showGuide;
      drawGuide();
      return showGuide;
    },
    score,
    destroy: () => ro.disconnect(),
  };
}
