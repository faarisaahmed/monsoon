// Loads course content (JSON under data/) and the right web font for each script.

const cache = new Map();
async function get(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
        return r.json();
      }),
    );
  }
  try {
    return await cache.get(url);
  } catch (e) {
    cache.delete(url);
    throw e;
  }
}

export const languages = () => get('data/languages.json');
export async function langMeta(code) {
  return (await languages()).find((l) => l.code === code);
}
export const course = (code) => get(`data/${code}/course.json`);
export const unit = (code, n) => get(`data/${code}/units/${String(n).padStart(2, '0')}.json`);
export async function allUnits(code) {
  const meta = await langMeta(code);
  const ns = Array.from({ length: meta?.units || 20 }, (_, i) => i + 1);
  return Promise.all(ns.map((n) => unit(code, n)));
}

const loadedFonts = new Set();
export function loadFont(family) {
  if (!family || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;700&display=swap`;
  document.head.appendChild(l);
}

// Every learnable item in a unit, flattened with a stable key (used for cards & practice).
export function unitItems(code, u) {
  const items = [];
  (u.vocab || []).forEach((v) => items.push({ ...v, kind: 'word', unit: u.id, key: `w:${v.native}` }));
  (u.phrases || []).forEach((v) => items.push({ ...v, kind: 'phrase', unit: u.id, key: `p:${v.native}` }));
  return items;
}

export function scriptLetters(c) {
  const out = [];
  for (const g of c.script?.groups || []) for (const l of g.letters) out.push({ ...l, group: g.id, groupTitle: g.title, key: `l:${l.char}` });
  return out;
}
