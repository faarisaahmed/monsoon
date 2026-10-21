// Accounts and progress.
//
// Online accounts (email + password, via cloud.js) sync progress across devices; progress is
// always kept in localStorage too, so everything works offline and syncs when back online.
// Older device-only accounts (username + salted PBKDF2 hash, never the password) still work.
// Progress can also be exported to / imported from a file.

import { today } from './ui.js';
import * as cloud from './cloud.js';

const K = {
  accounts: 'monsoon.accounts',
  session: 'monsoon.session',
  data: (u) => `monsoon.data.${u}`,
};
export const GUEST = '__guest__';

// The app used to be called Boli; carry over anything saved under the old key names.
try {
  for (const store of [localStorage, sessionStorage]) {
    for (const k of Object.keys(store)) {
      if (k.startsWith('boli.')) {
        const nk = 'monsoon.' + k.slice(5);
        if (store.getItem(nk) == null) store.setItem(nk, store.getItem(k));
        store.removeItem(k);
      }
    }
  }
} catch {}

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
  const c = cloud.session();
  if (c) return 'c-' + c.user.id;
  return sessionStorage.getItem(K.session) || localStorage.getItem(K.session) || GUEST;
}
export const isGuest = () => currentUser() === GUEST;
export const isCloud = () => !!cloud.session();
export const cloudUser = () => cloud.session()?.user || null;
export function displayName() {
  const c = cloud.session();
  if (c) return c.user.name || c.user.email;
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

export async function logout() {
  if (isCloud()) {
    flush();
    await syncNow().catch(() => {});
    await cloud.signOut();
    cache = null;
    sync.version = null;
    emit();
    return;
  }
  setSession(GUEST, false);
}

// ---------- online accounts ----------
// Whatever you did as a guest (or in a device-only account) is merged into the online account.
async function enterCloud(action) {
  flush();
  const prevUser = currentUser();
  const carry = data();
  await action();
  cache = null;
  sync.version = null;
  if (Object.keys(carry.langs || {}).length) mergeInto(data(), carry);
  if (prevUser === GUEST) localStorage.removeItem(K.data(GUEST));
  flush();
  emit();
  await syncNow().catch(() => {});
}
export const cloudSignUp = (email, password, name) => enterCloud(() => cloud.signUp(email, password, name));
export const cloudSignIn = (email, password) => enterCloud(() => cloud.signIn(email, password));
export async function cloudRename(name) {
  await cloud.updateName(name);
  emit();
}
export const cloudChangePassword = cloud.changePassword;
export const forgotPassword = cloud.forgotPassword;
export const resetPassword = cloud.resetPassword;
export async function cloudDeleteAccount(password) {
  const u = currentUser();
  await cloud.deleteAccount(password);
  cache = null;
  localStorage.removeItem(K.data(u));
  emit();
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

// Deletes a device-only account.
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
  scheduleSync();
}
// Write pending changes now (before switching account, or when the page goes away).
function flush() {
  clearTimeout(saveTimer);
  if (cache) writeJSON(K.data(currentUser()), cache);
}
window.addEventListener('pagehide', flush);

// ---------- sync ----------
const sync = { state: 'idle', last: null, error: null, dirty: false, version: null };
export const syncInfo = () => ({ ...sync });
const remoteListeners = new Set();
export const onRemoteChange = (fn) => remoteListeners.add(fn);
let syncTimer = null;
let syncing = null;
let again = false;

function scheduleSync(ms = 8000) {
  if (!isCloud()) return;
  sync.dirty = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow().catch(() => {}), ms);
}

// Pull the server copy, merge it into this device's copy, then push the result.
export function syncNow() {
  if (!isCloud()) return Promise.resolve();
  if (syncing) {
    again = true;
    return syncing;
  }
  clearTimeout(syncTimer);
  const setState = (st, error = null) => {
    sync.state = st;
    sync.error = error;
    emit();
  };
  syncing = (async () => {
    setState('syncing');
    try {
      const d = data();
      const before = JSON.stringify(d.langs);
      let remote = await cloud.pull();
      // merge the server copy in and save; if another device saved in between, merge again
      for (let attempt = 0; ; attempt++) {
        if (remote.data) mergeInto(d, remote.data, { takeSettings: !d.synced });
        d.synced = Date.now();
        flush();
        sync.dirty = false;
        try {
          sync.version = (await cloud.push(d, remote.version)).version;
          break;
        } catch (e) {
          if (e.status !== 409 || attempt >= 4) throw e;
          remote = e.body;
        }
      }
      sync.last = Date.now();
      setState('ok');
      if (JSON.stringify(d.langs) !== before) remoteListeners.forEach((fn) => fn());
    } catch (e) {
      if (e.status === 401) {
        // session ended (e.g. password changed elsewhere): fall back to guest, keep the local copy
        cache = null;
        setState('signed-out', e.message);
      } else setState(e.status === 0 ? 'offline' : 'error', e.message);
      throw e;
    } finally {
      syncing = null;
      if (again) {
        again = false;
        scheduleSync(500);
      }
    }
  })();
  return syncing;
}

// On load: check the session is still valid, then sync.
export async function startSync() {
  if (!isCloud()) return;
  try {
    await cloud.refresh();
    emit();
  } catch (e) {
    if (e.status === 401) {
      cache = null;
      emit();
      return;
    }
  }
  syncNow().catch(() => {});
}

// Leaving the page: send what we have without waiting (keepalive requests are capped at 64 KB).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  flush();
  if (isCloud() && sync.dirty && cache) {
    const body = JSON.stringify(cache);
    // without a known version there's nothing safe to send; the next sync covers it
    if (sync.version != null)
      cloud
        .push(cache, sync.version, { keepalive: body.length < 60000 })
        .then((r) => ((sync.version = r.version), (sync.dirty = false)))
        .catch(() => {});
  }
});
window.addEventListener('online', () => isCloud() && syncNow().catch(() => {}));

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
// Your written answers from Conversation practice. Deleted ones are kept as tombstones so
// syncing never brings them back; the most recently edited copy of an entry wins.
export function journal(code) {
  if (!hasLang(code)) return [];
  return Object.values(lang(code).journal || {}).filter((e) => !e.deleted).sort((a, b) => b.at - a.at);
}
export function saveEntry(code, entry) {
  const l = lang(code);
  l.journal = l.journal || {};
  const id = entry.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  l.journal[id] = { ...entry, id, at: entry.at || Date.now(), edited: Date.now() };
  save();
  emit();
  return l.journal[id];
}
export function deleteEntry(code, id) {
  const j = hasLang(code) && lang(code).journal;
  if (!j || !j[id]) return;
  j[id] = { id, deleted: true, at: j[id].at, edited: Date.now() };
  save();
  emit();
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
  if (!hasLang(code)) return { total: 0, learned: 0, mastered: 0, due: 0, words: 0, sentences: 0, letters: 0 };
  const cs = Object.values(lang(code).cards);
  const now = Date.now();
  return {
    total: cs.length,
    learned: cs.filter((c) => c.reps > 0 || c.ivl > 0).length,
    mastered: cs.filter((c) => c.ivl >= 21).length,
    due: cs.filter((c) => c.due <= now).length,
    words: cs.filter((c) => c.kind === 'word').length,
    sentences: cs.filter((c) => c.kind === 'sentence').length,
    letters: cs.filter((c) => c.kind === 'letter').length,
  };
}

// ---------- export / import ----------
export function exportData() {
  const u = currentUser();
  const acc = accounts()[u];
  return {
    app: 'monsoon',
    version: 1,
    exported: new Date().toISOString(),
    account: acc && !isCloud() ? { username: u, displayName: acc.displayName, salt: acc.salt, hash: acc.hash, iterations: acc.iterations, created: acc.created } : null,
    data: data(),
  };
}

export const isProgressFile = (obj) => !!(obj && (obj.app === 'monsoon' || obj.app === 'boli') && obj.data);

// Import into the current account (merging), or create the account from the file if signed out.
export function importData(obj, { replace = false } = {}) {
  if (!isProgressFile(obj)) throw new Error('This is not a Monsoon progress file.');
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
  if (replace) cache = { ...obj.data, settings: { ...DEFAULT_SETTINGS, ...obj.data.settings } };
  else mergeInto(cur, obj.data);
  writeJSON(K.data(u), cache);
  emit();
  if (isCloud()) (replace ? pushReplace() : syncNow()).catch(() => {});
  return u;
}

// Replace the server copy with this device's (used after "replace" imports and language resets,
// where merging would bring the old data back).
async function pushReplace() {
  flush();
  const { version } = await cloud.pull();
  sync.version = (await cloud.push(data(), version)).version;
  sync.last = Date.now();
  sync.dirty = false;
}

// Merge another copy of the progress data into `cur` (used for imports and for sync).
// Per item, the most recently touched version wins; time studied takes the larger figure per day.
function mergeInto(cur, inc, { takeSettings = false } = {}) {
  cur.langs = cur.langs || {};
  const resets = { ...(cur.resets || {}) };
  for (const [code, t] of Object.entries(inc.resets || {})) resets[code] = Math.max(resets[code] || 0, t);
  cur.resets = resets;
  if (takeSettings && inc.settings) cur.settings = { ...DEFAULT_SETTINGS, ...inc.settings };
  const live = (l, code) => l && (l.started || 0) >= (resets[code] || 0);
  for (const code of Object.keys(cur.langs)) if (!live(cur.langs[code], code)) delete cur.langs[code];
  for (const [code, other] of Object.entries(inc.langs || {})) {
    if (!live(other, code)) continue;
    const mine = cur.langs[code];
    if (!mine) {
      cur.langs[code] = structuredClone(other);
      continue;
    }
    const touched = (c) => c.last || c.added || 0;
    for (const [k, c] of Object.entries(other.cards || {})) if (!mine.cards[k] || touched(c) > touched(mine.cards[k])) mine.cards[k] = c;
    for (const [d, sec] of Object.entries(other.activity || {})) mine.activity[d] = Math.max(mine.activity[d] || 0, sec);
    for (const [n, st] of Object.entries(other.units || {})) {
      mine.units[n] = mine.units[n] || {};
      for (const [part, t] of Object.entries(st)) mine.units[n][part] = Math.max(mine.units[n][part] || 0, t);
    }
    for (const [ch, n] of Object.entries(other.letters || {})) mine.letters[ch] = Math.max(mine.letters[ch] || 0, n);
    for (const [id, t] of Object.entries(other.sounds || {})) mine.sounds[id] = Math.max(mine.sounds[id] || 0, t);
    for (const [id, e] of Object.entries(other.journal || {})) {
      mine.journal = mine.journal || {};
      if (!mine.journal[id] || (e.edited || 0) > (mine.journal[id].edited || 0)) mine.journal[id] = e;
    }
    mine.started = Math.min(mine.started || Date.now(), other.started || Date.now());
    if ((other.last?.at || 0) > (mine.last?.at || 0)) mine.last = other.last;
  }
  if (!cur.lastLang && inc.lastLang) cur.lastLang = inc.lastLang;
}

export function resetLanguage(code) {
  const d = data();
  delete d.langs[code];
  d.resets = { ...(d.resets || {}), [code]: Date.now() }; // so syncing doesn't bring it back
  save();
  emit();
}
