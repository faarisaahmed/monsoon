// Loads course content (JSON under data/) and the right web font for each script.

import { unitSentences, grammarForms, buildLexicon } from './sentences.js';

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

// Full sentences from a unit's lessons, grammar examples and dialogue, each with the forms its grammar point teaches.
export function unitSentenceItems(u) {
  return unitSentences(u).map((s) => ({ ...s, forms: s.grammar != null ? grammarForms(u.grammar[s.grammar]) : null }));
}

// The guided path through a unit: lessons that each teach a few words (and maybe one rule, with a
// quick tip) and then use them in sentences. Units written before lessons existed get a simple path
// built from their grammar points.
export function unitLessons(code, u) {
  const byNative = new Map(unitItems(code, u).map((i) => [i.native, i]));
  const sentences = unitSentenceItems(u);
  const byText = new Map(sentences.map((s) => [s.native, s]));
  const authored = !!u.lessons?.length;
  return (authored ? u.lessons : autoLessons(u)).map((ls, i) => ({
    n: i + 1,
    title: ls.title,
    tip: ls.tip || null,
    notes: ls.tip?.grammar != null ? u.grammar[ls.tip.grammar] : null,
    items: (ls.new || []).map((n) => byNative.get(n)).filter(Boolean),
    sentences: (ls.sentences || []).map((s) => byText.get(s.native)).filter(Boolean),
    authored,
  }));
}

function autoLessons(u) {
  const G = u.grammar || [];
  const n = Math.max(3, G.length + 1);
  const split = (arr) => Array.from({ length: n }, (_, i) => arr.slice(Math.round((i * arr.length) / n), Math.round(((i + 1) * arr.length) / n)));
  const V = split((u.vocab || []).map((v) => v.native));
  const P = split((u.phrases || []).map((p) => p.native));
  const examples = G.flatMap((g) => g.examples);
  return Array.from({ length: n }, (_, i) => {
    const g = G[i];
    const first = g ? g.body.split(/\n{2,}/)[0] : '';
    return {
      title: g ? g.title : i === n - 1 ? 'Putting it together' : `Words and phrases ${i + 1}`,
      tip: g ? { title: g.title, body: first.length > 420 ? first.slice(0, 417).trimEnd() + '…' : first, grammar: i } : null,
      new: [...V[i], ...P[i]],
      sentences: g ? g.examples : examples,
    };
  });
}

// Every word form in a language's course, for the wrong choices in fill-the-gap questions.
const lexicons = new Map();
export async function lexicon(code) {
  if (!lexicons.has(code)) {
    const units = await allUnits(code);
    lexicons.set(code, buildLexicon(units.flatMap((u) => [...unitItems(code, u), ...unitSentenceItems(u)])));
  }
  return lexicons.get(code);
}

export function scriptLetters(c) {
  const out = [];
  for (const g of c.script?.groups || []) for (const l of g.letters) out.push({ ...l, group: g.id, groupTitle: g.title, key: `l:${l.char}` });
  return out;
}
