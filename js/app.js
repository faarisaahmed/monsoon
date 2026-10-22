// Monsoon — app shell: routing, top bar, activity tracking.

import { h, fill, $, clear, toast } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { ctx } from './components.js';
import { stop, loadClips } from './audio.js';
import { homeView, aboutView } from './views/home.js';
import { loginView, signupView, forgotView, accountView } from './views/account.js';
import { langHome, unitView, scriptView, letterView, soundsView, soundView, readingView, referenceView, numbersView, glossaryView } from './views/lang.js';
import { practiceHub, practiceMode, reviewView, learnView } from './views/practice.js';
import { grammarHub, grammarPoint } from './views/grammar.js';
import { talkView, roleplayView } from './views/talk.js';
import { themesView } from './views/themes.js';
import { shareApp } from './components.js';

const routes = [
  [/^\/?$/, homeView],
  [/^\/about$/, aboutView],
  [/^\/login$/, loginView],
  [/^\/signup$/, signupView],
  [/^\/forgot$/, forgotView],
  [/^\/account$/, accountView],
  [/^\/themes$/, themesView],
  [/^\/l\/(\w+)$/, langHome, 'home'],
  [/^\/l\/(\w+)\/u\/(\d+)$/, unitView, 'course'],
  [/^\/l\/(\w+)\/u\/(\d+)\/learn\/(\w+)$/, learnView, 'course'],
  [/^\/l\/(\w+)\/script$/, scriptView, 'script'],
  [/^\/l\/(\w+)\/script\/(\d+)$/, letterView, 'script'],
  [/^\/l\/(\w+)\/sounds$/, soundsView, 'sounds'],
  [/^\/l\/(\w+)\/sounds\/([\w-]+)$/, soundView, 'sounds'],
  [/^\/l\/(\w+)\/grammar$/, grammarHub, 'grammar'],
  [/^\/l\/(\w+)\/grammar\/(\d+)-(\d+)$/, grammarPoint, 'grammar'],
  [/^\/l\/(\w+)\/practice$/, practiceHub, 'practice'],
  [/^\/l\/(\w+)\/practice\/([\w-]+)$/, practiceMode, 'practice'],
  [/^\/l\/(\w+)\/talk$/, talkView, 'talk'],
  [/^\/l\/(\w+)\/talk\/(\d+)$/, roleplayView, 'talk'],
  [/^\/l\/(\w+)\/review$/, reviewView, 'review'],
  [/^\/l\/(\w+)\/reading$/, readingView, 'reference'],
  [/^\/l\/(\w+)\/reference$/, referenceView, 'reference'],
  [/^\/l\/(\w+)\/numbers$/, numbersView, 'reference'],
  [/^\/l\/(\w+)\/glossary$/, glossaryView, 'reference'],
];

const DROP = '<svg viewBox="0 0 22 26" aria-hidden="true"><path d="M11 1.5C7 7.2 3 11.6 3 16.4A8 8 0 0 0 19 16.4C19 11.6 15 7.2 11 1.5Z" fill="currentColor"/><path d="M7.4 16.6a3.7 3.7 0 0 0 3.4 3.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';

const SUBNAV = [
  ['home', 'Overview', ''],
  ['course', 'Course', '#units'],
  ['grammar', 'Grammar', '/grammar'],
  ['practice', 'Practice', '/practice'],
  ['talk', 'Conversation', '/talk'],
  ['review', 'Review', '/review'],
  ['script', 'Script', '/script'],
  ['sounds', 'Pronunciation', '/sounds'],
  ['reference', 'Reference', '/reference'],
];

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

export const go = (path) => (location.hash = '#' + path);

let renderId = 0;
async function render(opts = {}) {
  const id = ++renderId;
  stop();
  const { path, query } = parseHash();
  let match = null;
  for (const [re, view, section] of routes) {
    const m = re.exec(path);
    if (m) {
      match = { view, section, params: m.slice(1) };
      break;
    }
  }
  const main = $('#main');
  const app = $('#app');
  if (!match) {
    fill(main, h('div.empty', h('h2', 'Page not found'), h('a.btn', { href: '#/' }, 'Go home')));
    return;
  }

  // Language context
  const code = path.startsWith('/l/') ? match.params[0] : null;
  let L = null;
  if (code) {
    L = await data.langMeta(code).catch(() => null);
    if (!L) {
      fill(main, h('div.empty', h('h2', 'Language not found'), h('a.btn', { href: '#/' }, 'All languages')));
      return;
    }
    data.loadFont(L.font);
    if (L.audio) await loadClips(L.code, L.tts);
    document.documentElement.style.setProperty('--nf', `"${L.font}"`);
    store.touch(code, path);
  }
  ctx.lang = L;
  app.className = L ? 'lang-' + L.code : '';
  renderTop(L, match.section);

  main.className = '';
  fill(main, h('div.loading', 'Loading…'));
  try {
    const node = await match.view({ params: match.params, query, code, L, main });
    if (id !== renderId) return;
    if (node) fill(main, node);
    document.title = (node?.dataset?.title ? node.dataset.title + ' · ' : L ? L.name + ' · ' : '') + 'Monsoon';
    if (!query.get('keep') && !opts.keepScroll) window.scrollTo(0, 0);
    const anchor = query.get('to');
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    if (id !== renderId) return;
    fill(main, h('div.empty', h('h2', 'Something went wrong'), h('p.muted', e.message), h('a.btn', { href: '#/' }, 'Home')));
  }
}

function renderTop(L, section) {
  const top = $('#topbar');
  const due = L ? store.dueCards(L.code).length : 0;
  fill(top, 
    h(
      'div.topbar-in',
      h('a.brand', { href: '#/' }, h('span.brand-mark', { html: DROP }), 'Monsoon'),
      L ? h('a.lang-pill', { href: `#/l/${L.code}` }, h('span.nt', { lang: L.code }, L.native), ' · ', L.name) : null,
      h('div.spacer'),
      h('a.btn.ghost.small', { href: '#/', title: 'All languages' }, 'Languages'),
      h('a.user-btn', { href: store.isGuest() ? '#/login' : '#/account' }, store.isGuest() ? 'Sign in' : store.displayName()),
    ),
  );
  const sub = $('#subnav');
  if (!L) {
    sub.classList.add('hidden');
    return;
  }
  sub.classList.remove('hidden');
  fill(sub, 
    h(
      'div.subnav-in',
      SUBNAV.map(([key, label, suffix]) =>
        h(
          'a' + (key === section ? '.on' : ''),
          { href: suffix.startsWith('#') ? `#/l/${L.code}?to=units` : `#/l/${L.code}${suffix}` },
          label,
          key === 'review' && due ? h('span.badge.accent', due) : null,
        ),
      ),
    ),
  );
}

// ---------- activity tracking (time studied, never streaks) ----------
let lastInput = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true }));
setInterval(() => {
  if (document.hidden || !ctx.lang) return;
  if (Date.now() - lastInput > 90e3) return;
  store.addTime(ctx.lang.code, 15);
}, 15e3);

// ---------- theme ----------
function applyTheme() {
  const t = store.settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  // the browser bar takes the page colour (auto keeps the light/dark pair from index.html)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = t === 'auto' ? m.dataset.orig : getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || m.dataset.orig;
  });
}
document.querySelector('.footer .share-link')?.addEventListener('click', shareApp);

store.onChange(() => {
  applyTheme();
  const { path } = parseHash();
  // header reflects account changes immediately
  const L = ctx.lang;
  const sec = routes.find(([re]) => re.test(path))?.[2];
  renderTop(L, sec);
});

window.addEventListener('hashchange', render);
applyTheme();
render();
store.startSync();

// Progress arrived from another device: refresh the page you're on, unless you're mid-exercise.
const inSession = () => /\/(practice\/|review|learn\/|talk)|t=check/.test(location.hash);
store.onRemoteChange(() => {
  if (!inSession()) render({ keepScroll: true });
});
let lastSync = '';
store.onChange(() => {
  const st = store.syncInfo().state;
  if (st === 'signed-out' && lastSync !== st) toast('You were signed out. Sign in again to keep syncing — nothing on this device was lost.', 5000);
  lastSync = st;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A new version was installed: reload to use it, unless you're in the middle of an exercise.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (inSession()) return toast('Monsoon was updated — it will refresh next time you open it.');
    location.reload();
  });
}
