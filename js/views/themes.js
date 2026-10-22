// Themes: a small gallery of palettes, each previewed in its own colours. Picking one applies it at once.

import { h } from '../ui.js';
import * as store from '../store.js';

export const THEMES = [
  { id: 'auto', name: 'Monsoon', desc: 'Rain-washed teal. Follows your device: light by day, night rain in dark mode.', preview: 'light', also: 'dark' },
  { id: 'light', name: 'Monsoon day', desc: 'Misty paper and teal, always light.', preview: 'light' },
  { id: 'dark', name: 'Monsoon night', desc: 'Night rain: deep slate and sea-glass, always dark.', preview: 'dark' },
  { id: 'jasmine', name: 'Jasmine', desc: 'Warm cream paper, ink and a touch of saffron.', preview: 'jasmine' },
  { id: 'lotus', name: 'Lotus', desc: 'Soft rose and deep pink.', preview: 'lotus' },
  { id: 'tea', name: 'Tea garden', desc: 'Fresh hill-country greens.', preview: 'tea' },
  { id: 'ink', name: 'Ink & paper', desc: 'Black on white, highest contrast, no colour to distract.', preview: 'ink' },
  { id: 'indigo', name: 'Indigo night', desc: 'Deep indigo and periwinkle, for late study.', preview: 'indigo' },
  { id: 'diya', name: 'Diya', desc: 'Lamp-lit amber on dark wood. Easy on the eyes at night.', preview: 'diya' },
];

function preview(id) {
  return h(
    'div.theme-preview',
    { 'data-theme-preview': id },
    h('div.tp-sky', h('span.tp-title', 'नमस्ते · سلام · வணக்கம்')),
    h(
      'div.tp-body',
      h('div.tp-line'),
      h('div.tp-line.short'),
      h('div.row', { style: { gap: '6px', marginTop: '8px' } }, h('span.tp-btn.primary', 'Continue'), h('span.tp-btn.accent', 'Learn'), h('span.tp-dot.good'), h('span.tp-dot.bad')),
    ),
  );
}

export function themesView() {
  const current = store.settings().theme;
  const grid = h(
    'div.theme-grid',
    THEMES.map((t) =>
      h(
        'button.theme-card' + (t.id === current ? '.on' : ''),
        {
          type: 'button',
          'aria-pressed': String(t.id === current),
          onclick: () => {
            store.setSetting('theme', t.id);
            grid.querySelectorAll('.theme-card').forEach((b) => {
              const on = b === grid.children[THEMES.indexOf(t)];
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', String(on));
            });
          },
        },
        t.also ? h('div.tp-split', preview(t.preview), preview(t.also)) : preview(t.preview),
        h('div.theme-meta', h('strong', t.name), h('span.small.muted', t.desc)),
      ),
    ),
  );
  return h(
    'div',
    { 'data-title': 'Themes' },
    h('h1', 'Themes'),
    h('p.muted', { style: { maxWidth: '60ch' } }, 'Pick the colours you would like to study in. It changes straight away, and it is saved with your settings.'),
    grid,
  );
}
