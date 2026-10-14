// Accounts and progress.
//
// Accounts live in this browser (localStorage). Passwords are never stored: we keep a
// PBKDF2-SHA256 hash with a random salt. Progress is stored per account and can be exported
// to / imported from a file, which is how you move it between devices.

import { today } from './ui.js';

const K = {
  accounts: 'boli.accounts',
  session: 'boli.session',
  data: (u) => `boli.data.${u}`,
};
export const GUEST = '__guest__';

const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.warn('storage failed', e);
    return false;
  }
}

// ---------- crypto ----------
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password, saltB64, iterations = 150000) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { salt: b64(salt), hash: b64(bits), iterations };
}

// ---------- accounts ----------
const accounts = () => readJSON(K.accounts, {});
export const normUser = (u) => String(u || '').trim().toLowerCase();

export function currentUser() {
  return sessionStorage.getItem(K.session) || localStorage.getItem(K.session) || GUEST;
}
export const isGuest = () => currentUser() === GUEST;
export function displayName() {
  const u = currentUser();
  if (u === GUEST) return 'Guest';
  return accounts()[u]?.displayName || u;
}

export async function signup(username, password, displayNameStr, { keepGuest = true, remember = true } = {}) {
  const u = normUser(username);
  if (!/^[a-z0-9_.-]{3,32}$/.test(u)) throw new Error('Username: 3–32 letters, numbers, dot, dash or underscore.');
  if (String(password).length < 6) throw new Error('Password must be at least 6 characters.');
  const all = accounts();
  if (all[u]) throw new Error('That username is already taken on this device.');
  flush();
  const ph = await hashPassword(password);
  all[u] = { ...ph, displayName: (displayNameStr || '').trim() || username.trim(), created: Date.now() };
  writeJSON(K.accounts, all);
  // Carry over anything done as a guest so nothing is lost.
  const guest = readJSON(K.data(GUEST), null);
  if (keepGuest && guest && Object.keys(guest.langs || {}).length) {
    writeJSON(K.data(u), guest);
    localStorage.removeItem(K.data(GUEST));
  }
  setSession(u, remember);
  return u;
}

export async function login(username, password, remember = true) {
  const u = normUser(username);
  const acc = accounts()[u];
  if (!acc) throw new Error('No account with that username on this device. (Accounts are stored per browser — import your progress file to bring one over.)');
  const ph = await hashPassword(password, acc.salt, acc.iterations);
  if (ph.hash !== acc.hash) throw new Error('Incorrect password.');
  setSession(u, remember);
  return u;
}

function setSession(u, remember) {
  flush();
  localStorage.removeItem(K.session);
  sessionStorage.removeItem(K.session);
  if (u !== GUEST) (remember ? localStorage : sessionStorage).setItem(K.session, u);
  cache = null;
  emit();
}

export function logout() {
  setSession(GUEST, false);
}

export async function changePassword(oldPw, newPw) {
  const u = currentUser();
  const all = accounts();
  const acc = all[u];
  if (!acc) throw new Error('Not signed in.');
  const check = await hashPassword(oldPw, acc.salt, acc.iterations);
  if (check.hash !== acc.hash) throw new Error('Current password is incorrect.');
  if (String(newPw).length < 6) throw new Error('New password must be at least 6 characters.');
  Object.assign(acc, await hashPassword(newPw));
  writeJSON(K.accounts, all);
}

export function renameDisplay(name) {
  const u = currentUser();
  const all = accounts();
  if (!all[u]) return;
  all[u].displayName = name.trim() || u;
  writeJSON(K.accounts, all);
  emit();
}

export function deleteAccount() {
  const u = currentUser();
  const all = accounts();
  delete all[u];
  writeJSON(K.accounts, all);
  cache = null; // don't let a pending save write it back
  localStorage.removeItem(K.data(u));
  logout();
}

export const accountList = () => Object.keys(accounts());

// ---------- progress data ----------
const DEFAULT_SETTINGS = {
  roman: 'show', // show | tap | hide
  rate: 0.9,
  onlineVoice: true,
  dailyGoal: 15, // minutes, optional & never punished
  newPerSession: 8,
  theme: 'auto',
  voices: {}, // lang -> voiceURI
};

let cache = null;
function data() {
  if (!cache) {
    cache = readJSON(K.data(currentUser()), null) || { v: 1, created: Date.now(), settings: {}, langs: {} };
    cache.settings = { ...DEFAULT_SETTINGS, ...cache.settings };
  }
  return cache;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}
// Write pending changes now (before switching account, or when the page goes away).
function flush() {
  clearTimeout(saveTimer);
  if (cache) writeJSON(K.data(currentUser()), cache);
}
window.addEventListener('pagehide', flush);

export const settings = () => data().settings;
export function setSetting(k, v) {
  data().settings[k] = v;
  save();
  emit();
}

export function lang(code) {
  const d = data();
  if (!d.langs[code]) d.langs[code] = { started: Date.now(), units: {}, letters: {}, cards: {}, activity: {}, sounds: {}, last: null };
  return d.langs[code];
}
export const startedLangs = () => Object.keys(data().langs);
export const hasLang = (code) => !!data().langs[code];

// Remember where you were — without counting a language as started just because you looked at it.
export function touch(code, where) {
  const d = data();
  if (d.langs[code]) d.langs[code].last = { where, at: Date.now() };
  d.lastLang = code;
  save();
}
export const lastLang = () => data().lastLang;

export function markUnit(code, n, part) {
  const l = lang(code);
  l.units[n] = l.units[n] || {};
  l.units[n][part] = Date.now();
  save();
}
export const unitState = (code, n) => (hasLang(code) && lang(code).units[n]) || {};

export function markLetter(code, ch) {
  lang(code).letters[ch] = (lang(code).letters[ch] || 0) + 1;
  save();
}
export function markSound(code, id) {
  lang(code).sounds[id] = Date.now();
  save();
}

// Time spent, by day. Called by the activity tracker.
export function addTime(code, seconds) {
  const l = lang(code);
  const d = today();
  l.activity[d] = (l.activity[d] || 0) + seconds;
  save();
}
export function timeToday() {
  const d = today();
  return Object.values(data().langs).reduce((s, l) => s + (l.activity?.[d] || 0), 0);
}
export function timeByDay(days = 7, code = null) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toLocaleDateString('en-CA');
    const langs = code ? [lang(code)] : Object.values(data().langs);
    out.push({ day: key, date: dt, seconds: langs.reduce((s, l) => s + (l.activity?.[key] || 0), 0) });
  }
  return out;
}
export function totalTime(code) {
  const langs = code ? [lang(code)] : Object.values(data().langs);
  return langs.reduce((s, l) => s + Object.values(l.activity || {}).reduce((a, b) => a + b, 0), 0);
}

// ---------- spaced repetition (SM-2 style, 4 grades) ----------
export const DAY = 864e5;
export function card(code, key) {
  return lang(code).cards[key];
}
export function ensureCard(code, key, meta) {
  const cards = lang(code).cards;
  if (!cards[key]) {
    cards[key] = { ...meta, ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: Date.now(), added: Date.now() };
    save();
  }
  return cards[key];
}
// grade: 0 again, 1 hard, 2 good, 3 easy
export function review(code, key, grade) {
  const c = lang(code).cards[key];
  if (!c) return;
  const now = Date.now();
  if (grade === 0) {
    c.lapses++;
    c.reps = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.ivl = 0;
    c.due = now + 10 * 60e3; // see again in 10 minutes
  } else {
    c.reps++;
    if (c.reps === 1) c.ivl = grade === 3 ? 3 : 1;
    else if (c.reps === 2) c.ivl = grade === 1 ? 2 : grade === 3 ? 7 : 4;
    else c.ivl = Math.round(c.ivl * (grade === 1 ? 1.2 : grade === 3 ? c.ease * 1.3 : c.ease));
    c.ivl = Math.min(c.ivl, 365);
    c.ease = Math.max(1.3, c.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
    c.due = now + c.ivl * DAY;
  }
  c.last = now;
  save();
  return c;
}
export function dueCards(code, now = Date.now()) {
  if (!hasLang(code)) return [];
  return Object.entries(lang(code).cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([key, c]) => ({ key, ...c }));
}
export function cardStats(code) {
  if (!hasLang(code)) return { total: 0, learned: 0, mastered: 0, due: 0, words: 0, letters: 0 };
  const cs = Object.values(lang(code).cards);
  const now = Date.now();
  return {
    total: cs.length,
    learned: cs.filter((c) => c.reps > 0 || c.ivl > 0).length,
    mastered: cs.filter((c) => c.ivl >= 21).length,
    due: cs.filter((c) => c.due <= now).length,
    words: cs.filter((c) => c.kind === 'word').length,
    letters: cs.filter((c) => c.kind === 'letter').length,
  };
}

// ---------- export / import ----------
export function exportData() {
  const u = currentUser();
  const acc = accounts()[u];
  return {
    app: 'boli',
    version: 1,
    exported: new Date().toISOString(),
    account: acc ? { username: u, displayName: acc.displayName, salt: acc.salt, hash: acc.hash, iterations: acc.iterations, created: acc.created } : null,
    data: data(),
  };
}

export const isProgressFile = (obj) => !!(obj && obj.app === 'boli' && obj.data);

// Import into the current account (merging), or create the account from the file if signed out.
export function importData(obj, { replace = false } = {}) {
  if (!isProgressFile(obj)) throw new Error('This is not a Boli progress file.');
  let u = currentUser();
  if (u === GUEST && obj.account?.username) {
    const all = accounts();
    const name = obj.account.username;
    if (!all[name]) {
      all[name] = { ...obj.account };
      delete all[name].username;
      writeJSON(K.accounts, all);
    } else if (all[name].hash !== obj.account.hash) {
      // Same username, different account: never sign in without its password.
      throw new Error(`An account named "${name}" already exists on this device. Sign in to it first, then import.`);
    }
    u = name;
    setSession(u, true);
  }
  const cur = data();
  if (replace) {
    cache = { ...obj.data, settings: { ...DEFAULT_SETTINGS, ...obj.data.settings } };
  } else {
    for (const [code, inc] of Object.entries(obj.data.langs || {})) {
      const mine = cur.langs[code];
      if (!mine) {
        cur.langs[code] = inc;
        continue;
      }
      for (const [k, c] of Object.entries(inc.cards || {})) if (!mine.cards[k] || (c.last || 0) > (mine.cards[k].last || 0)) mine.cards[k] = c;
      for (const [d, s] of Object.entries(inc.activity || {})) mine.activity[d] = Math.max(mine.activity[d] || 0, s);
      for (const [n, st] of Object.entries(inc.units || {})) mine.units[n] = { ...st, ...mine.units[n] };
      Object.assign(mine.letters, { ...inc.letters, ...mine.letters });
      Object.assign(mine.sounds, { ...inc.sounds, ...mine.sounds });
    }
  }
  writeJSON(K.data(u), cache);
  emit();
  return u;
}

export function resetLanguage(code) {
  delete data().langs[code];
  save();
  emit();
}
