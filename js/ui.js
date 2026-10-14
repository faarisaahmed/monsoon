// Small DOM + text helpers shared by every view.

// h('div.card#main', {onclick}, child, [children], 'text')
export function h(tag, attrs, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => {
    if (t === '.') el.classList.add(v);
    else el.id = v;
  });
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === '') continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Minimal markdown: paragraphs (\n\n), single newlines, **bold**, *italic*, `code`, "- " bullet lines.
export function md(text) {
  if (!text) return h('div');
  const blocks = String(text).split(/\n{2,}/);
  const html = blocks
    .map((b) => {
      const lines = b.split('\n');
      const inline = (s) =>
        esc(s)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>');
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return '<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
      }
      if (lines.length > 1 && lines.every((l) => l.includes('|'))) {
        const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l));
        return (
          '<div class="table-wrap"><table>' +
          rows
            .map(
              (r, i) =>
                '<tr>' +
                r
                  .replace(/^\s*\||\|\s*$/g, '')
                  .split('|')
                  .map((c) => (i === 0 ? '<th>' : '<td>') + inline(c.trim()) + (i === 0 ? '</th>' : '</td>'))
                  .join('') +
                '</tr>',
            )
            .join('') +
          '</table></div>'
        );
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    })
    .join('');
  return h('div.prose', { html });
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Normalise romanization for lenient typed-answer comparison.
export function normRoman(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʿ’'`ʾ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normEnglish(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9 /;,]/g, '')
    .trim();
}

// Accept any of the slash/semicolon/comma separated glosses ("hello / hi").
export function englishMatches(input, gloss) {
  const a = normEnglish(input).replace(/^(to|a|an|the) /, '');
  if (!a) return false;
  return normEnglish(gloss)
    .split(/[/;,]| or /)
    .map((g) => g.trim().replace(/^(to|a|an|the) /, ''))
    .some((g) => g && (g === a || levenshtein(g, a) <= Math.floor(g.length / 6)));
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similarity(a, b) {
  a = String(a || '');
  b = String(b || '');
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

export function toast(msg, ms = 2600) {
  let box = $('#toasts');
  if (!box) document.body.appendChild((box = h('div#toasts', { role: 'status', 'aria-live': 'polite' })));
  if ([...box.children].some((t) => t.textContent === msg && !t.classList.contains('out'))) return; // don't stack repeats
  const t = h('div.toast', msg);
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  return `${hrs} h ${m % 60} min`;
}

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export function hashStr(s) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

// Simple modal dialog; resolves with the button value.
export function modal(title, body, buttons = [{ label: 'OK', value: true, primary: true }]) {
  return new Promise((resolve) => {
    const close = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const dlg = h(
      'dialog.modal',
      h('h2', title),
      typeof body === 'string' ? h('p', body) : body,
      h(
        'div.row.end',
        buttons.map((b) => h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: () => close(b.value) }, b.label)),
      ),
    );
    dlg.addEventListener('cancel', () => close(null));
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

export const go = (path) => (location.hash = '#' + path);

// Replace an element's children (accepts nested arrays / nulls like h()).
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

// Append children (accepts nested arrays / nulls like h()).
export function add(el, ...children) {
  append(el, children);
  return el;
}
