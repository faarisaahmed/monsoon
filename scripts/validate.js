#!/usr/bin/env node
// Validates language content against CONTENT_SCHEMA.md.
// Usage: node scripts/validate.js [code ...]   (no args = all languages in data/languages.json or data/*)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data');

// Unicode ranges that native strings must (mostly) use.
const SCRIPT_RANGES = {
  hi: [[0x0900, 0x097f]], mr: [[0x0900, 0x097f]], ne: [[0x0900, 0x097f]],
  bn: [[0x0980, 0x09ff]], as: [[0x0980, 0x09ff]],
  pa: [[0x0a00, 0x0a7f]],
  gu: [[0x0a80, 0x0aff]],
  or: [[0x0b00, 0x0b7f]],
  ta: [[0x0b80, 0x0bff]],
  te: [[0x0c00, 0x0c7f]],
  kn: [[0x0c80, 0x0cff]],
  ml: [[0x0d00, 0x0d7f]],
  ur: [[0x0600, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]],
  ps: [[0x0600, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]],
  sd: [[0x0600, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]],
};
const ALLOWED_EXTRA = /[\s\d.,!?;:'"()\-–—…/«»“”‘’%+=‌‍।॥۔،؟؛ـ॒॑]/u;

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(file, 'invalid JSON: ' + e.message);
    return null;
  }
}

function checkNative(file, code, s, where) {
  if (typeof s !== 'string' || !s.trim()) return err(file, `${where}: missing native text`);
  const ranges = SCRIPT_RANGES[code];
  if (!ranges) return;
  let bad = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ranges.some(([a, b]) => cp >= a && cp <= b)) continue;
    if (ALLOWED_EXTRA.test(ch)) continue;
    if (/[0-9]/.test(ch)) continue;
    bad += ch;
  }
  if (bad) err(file, `${where}: unexpected characters ${JSON.stringify(bad)} in ${JSON.stringify(s)}`);
}

function checkItem(file, code, it, where, needRoman = true) {
  if (!it || typeof it !== 'object') return err(file, `${where}: not an object`);
  checkNative(file, code, it.native, where);
  if (needRoman && (typeof it.roman !== 'string' || !it.roman.trim())) err(file, `${where}: missing roman`);
  if (typeof it.en !== 'string' || !it.en.trim()) err(file, `${where}: missing en`);
  if (it.roman && /[ऀ-෿؀-ۿ]/.test(it.roman)) err(file, `${where}: roman contains native script`);
}

function range(file, arr, min, max, what) {
  if (!Array.isArray(arr)) return err(file, `${what} must be an array`);
  if (arr.length < min) err(file, `${what}: has ${arr.length}, need at least ${min}`);
  if (max && arr.length > max) warn(file, `${what}: has ${arr.length}, suggested max ${max}`);
}

function validateLang(code) {
  const dir = path.join(ROOT, code);
  const cf = path.join(dir, 'course.json');
  if (!fs.existsSync(cf)) return err(cf, 'missing');
  const c = load(cf);
  if (!c) return;
  for (const k of ['code', 'name', 'native', 'scriptName', 'dir', 'tts', 'font', 'speakers', 'where', 'tagline', 'intro', 'romanizationNote']) {
    if (typeof c[k] !== 'string' || !c[k].trim()) err(cf, `missing ${k}`);
  }
  if (c.code !== code) err(cf, `code ${c.code} != folder ${code}`);
  // script
  if (!c.script || !Array.isArray(c.script.groups)) err(cf, 'script.groups missing');
  else {
    if (!c.script.overview) err(cf, 'script.overview missing');
    let total = 0;
    const ids = new Set();
    c.script.groups.forEach((g, gi) => {
      const w = `script.groups[${gi}]`;
      if (!g.id || !g.title) err(cf, `${w}: id/title missing`);
      if (ids.has(g.id)) err(cf, `${w}: duplicate id ${g.id}`);
      ids.add(g.id);
      if (!Array.isArray(g.letters) || !g.letters.length) return err(cf, `${w}: letters empty`);
      g.letters.forEach((l, li) => {
        const lw = `${w}.letters[${li}]`;
        total++;
        if (!l.char) err(cf, `${lw}: char missing`);
        else checkNative(cf, code, l.char.replace(/[◌]/g, ''), lw + '.char');
        if (typeof l.roman !== 'string') err(cf, `${lw}: roman missing`);
        if (!l.sound) err(cf, `${lw}: sound missing`);
        if (l.example) checkItem(cf, code, l.example, lw + '.example');
      });
    });
    if (total < 45) err(cf, `script has only ${total} letters — cover the whole alphabet`);
  }
  // pronunciation
  range(cf, c.pronunciation, 8, 16, 'pronunciation');
  (c.pronunciation || []).forEach((p, i) => {
    const w = `pronunciation[${i}]`;
    if (!p.id || !p.title || !p.body) err(cf, `${w}: id/title/body missing`);
    (p.pairs || []).forEach((pr, j) => {
      checkItem(cf, code, pr.a, `${w}.pairs[${j}].a`);
      checkItem(cf, code, pr.b, `${w}.pairs[${j}].b`);
    });
    (p.drill || []).forEach((d, j) => checkItem(cf, code, d, `${w}.drill[${j}]`));
    if (!(p.drill || []).length && !(p.pairs || []).length) err(cf, `${w}: needs pairs or drill`);
  });
  // numbers
  if (!Array.isArray(c.numbers)) err(cf, 'numbers missing');
  else {
    const have = new Set(c.numbers.map((n) => n.n));
    for (let i = 0; i <= 100; i++) if (!have.has(i)) err(cf, `numbers: missing ${i}`);
    for (const n of [1000, 100000]) if (!have.has(n)) err(cf, `numbers: missing ${n}`);
    c.numbers.forEach((n, i) => {
      checkNative(cf, code, n.native, `numbers[${i}]`);
      if (!n.roman) err(cf, `numbers[${i}]: roman missing`);
    });
  }
  // units
  const seen = new Map();
  const unitFiles = fs.existsSync(path.join(dir, 'units')) ? fs.readdirSync(path.join(dir, 'units')).filter((f) => /^\d+\.json$/.test(f)) : [];
  const count = Math.max(20, ...unitFiles.map((f) => parseInt(f, 10)));
  const known = new Set(); // every word form met so far, for --words
  for (let u = 1; u <= count; u++) {
    const uf = path.join(dir, 'units', String(u).padStart(2, '0') + '.json');
    if (!fs.existsSync(uf)) {
      err(uf, 'missing');
      continue;
    }
    const d = load(uf);
    if (!d) continue;
    if (d.id !== u) err(uf, `id should be ${u}`);
    for (const k of ['title', 'goal', 'intro']) if (!d[k]) err(uf, `missing ${k}`);
    range(uf, d.vocab, 20, 36, 'vocab');
    range(uf, d.phrases, 8, 16, 'phrases');
    range(uf, d.grammar, 1, 4, 'grammar');
    (d.vocab || []).forEach((v, i) => {
      checkItem(uf, code, v, `vocab[${i}]`);
      const key = (v.native || '').trim();
      if (seen.has(key)) warn(uf, `vocab duplicate "${key}" (also in unit ${seen.get(key)})`);
      else seen.set(key, u);
    });
    (d.phrases || []).forEach((v, i) => checkItem(uf, code, v, `phrases[${i}]`));
    (d.grammar || []).forEach((g, i) => {
      if (!g.title || !g.body) err(uf, `grammar[${i}]: title/body missing`);
      range(uf, g.examples, 2, 8, `grammar[${i}].examples`);
      (g.examples || []).forEach((e, j) => checkItem(uf, code, e, `grammar[${i}].examples[${j}]`));
    });
    if (!d.dialogue || !Array.isArray(d.dialogue.lines)) err(uf, 'dialogue missing');
    else {
      range(uf, d.dialogue.lines, 6, 14, 'dialogue.lines');
      d.dialogue.lines.forEach((l, i) => checkItem(uf, code, l, `dialogue.lines[${i}]`));
    }
    checkLessons(uf, code, d, known);
  }
}

// The guided path: lessons that each teach a few words (and maybe one rule) and then use them in sentences.
const toks = (s) => (s || '').replace(/[?.!,।॥۔؟،:;"“”‘’()[\]…–—]/g, ' ').split(/\s+/).filter(Boolean);
const romanToks = (s) => (s || '').replace(/[?.!,:;"“”()…–—]/g, ' ').split(/\s+/).filter(Boolean);
function checkLessons(uf, code, d, known) {
  const unitText = [...(d.vocab || []), ...(d.phrases || []), ...(d.grammar || []).flatMap((g) => g.examples || []), ...(d.dialogue?.lines || [])];
  if (!Array.isArray(d.lessons)) {
    warn(uf, 'no lessons yet');
    unitText.forEach((x) => toks(x.native).forEach((t) => known.add(t)));
    return;
  }
  range(uf, d.lessons, 3, 8, 'lessons');
  const items = new Map([...(d.vocab || []), ...(d.phrases || [])].map((x) => [x.native, x]));
  const taught = new Map();
  const tipped = new Set();
  // words of this unit's own lists count as known from the start; sentences may only add inflections
  const unitWords = new Set(unitText.flatMap((x) => toks(x.native)));
  d.lessons.forEach((ls, li) => {
    const w = `lessons[${li}]`;
    if (!ls.title) err(uf, `${w}: title missing`);
    if (ls.tip) {
      if (!ls.tip.title || !ls.tip.body) err(uf, `${w}.tip: title/body missing`);
      if (ls.tip.body && ls.tip.body.length > 700) warn(uf, `${w}.tip: body is ${ls.tip.body.length} chars — keep a tip short (the full notes are in grammar)`);
      if (ls.tip.grammar != null) {
        if (!d.grammar?.[ls.tip.grammar]) err(uf, `${w}.tip.grammar ${ls.tip.grammar} is not a grammar index`);
        tipped.add(ls.tip.grammar);
      }
    }
    if (!Array.isArray(ls.new)) err(uf, `${w}: new must be an array`);
    (ls.new || []).forEach((n) => {
      if (!items.has(n)) err(uf, `${w}.new: "${n}" is not a vocab word or phrase of this unit (must match "native" exactly)`);
      else if (taught.has(n)) err(uf, `${w}.new: "${n}" is already taught in lesson ${taught.get(n) + 1}`);
      else taught.set(n, li);
    });
    if ((ls.new || []).length > 12) warn(uf, `${w}: ${ls.new.length} new items — aim for 4–10`);
    range(uf, ls.sentences, 5, 14, `${w}.sentences`);
    (ls.sentences || []).forEach((s, si) => {
      const sw = `${w}.sentences[${si}]`;
      checkItem(uf, code, s, sw);
      const t = toks(s.native);
      if (t.length < 2) err(uf, `${sw}: a sentence needs at least two words`);
      if (s.focus != null && !t.includes(s.focus)) err(uf, `${sw}: focus "${s.focus}" is not one of its words ${JSON.stringify(t)}`);
      if (s.wrong != null) {
        if (s.focus == null) err(uf, `${sw}: "wrong" needs a "focus"`);
        if (!Array.isArray(s.wrong) || s.wrong.length < 1 || s.wrong.length > 4) err(uf, `${sw}: "wrong" must list 1–4 forms`);
        else
          s.wrong.forEach((x, xi) => {
            const [n, r, extra] = String(x).split('|');
            if (!n || !r || extra != null) return err(uf, `${sw}.wrong[${xi}]: write it as "native|roman", got ${JSON.stringify(x)}`);
            checkNative(uf, code, n, `${sw}.wrong[${xi}]`);
            if (n.trim() === s.focus) err(uf, `${sw}.wrong[${xi}]: same as the right answer`);
          });
      }
      if (s.roman && romanToks(s.roman).length !== t.length) warn(uf, `${sw}: ${t.length} native words but ${romanToks(s.roman).length} romanized words — keep them word for word where possible`);
      if (WORDS) {
        const unknown = t.filter((x) => !known.has(x) && !unitWords.has(x));
        if (unknown.length) console.log(`words ${uf} ${sw}: not met before: ${unknown.join(' ')}`);
      }
    });
    (ls.sentences || []).forEach((s) => toks(s.native).forEach((x) => known.add(x)));
  });
  for (const n of items.keys()) if (!taught.has(n)) warn(uf, `"${n}" is not taught in any lesson's "new"`);
  (d.grammar || []).forEach((g, gi) => !tipped.has(gi) && warn(uf, `grammar[${gi}] "${g.title}" has no lesson tip`));
  unitText.forEach((x) => toks(x.native).forEach((t) => known.add(t)));
}
const WORDS = process.argv.includes('--words');

let codes = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!codes.length) {
  codes = fs.readdirSync(ROOT).filter((f) => fs.existsSync(path.join(ROOT, f, 'course.json')));
}
codes.forEach(validateLang);
warnings.forEach((w) => console.log('warn  ' + w));
errors.forEach((e) => console.log('ERROR ' + e));
if (errors.length) {
  console.log(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`OK (${codes.join(', ')})${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`);
