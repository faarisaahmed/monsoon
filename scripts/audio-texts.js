#!/usr/bin/env node
// Lists every piece of native text the app can speak, per language, as JSON:
//   { "hi": ["नमस्ते", ...], ... }
// Used by scripts/make_audio.py to pre-generate audio files.
// Usage: node scripts/audio-texts.js [code ...] > texts.json
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const COMBINING_ONLY = /^[\p{M}◌‌‍\s]*$/u;

function textsFor(code) {
  const dir = path.join(DATA, code);
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'course.json'), 'utf8'));
  const out = new Set();
  const add = (s) => {
    if (typeof s !== 'string') return;
    s = s.trim();
    if (s && !COMBINING_ONLY.test(s)) out.add(s);
  };
  for (const g of c.script.groups) {
    for (const l of g.letters) {
      add(l.char.replace(/◌/g, ''));
      add(l.example?.native);
    }
  }
  for (const p of c.pronunciation) {
    for (const pr of p.pairs || []) (add(pr.a.native), add(pr.b.native));
    for (const d of p.drill || []) add(d.native);
  }
  for (const n of c.numbers) add(n.native);
  const unitsDir = path.join(dir, 'units');
  for (const f of fs.readdirSync(unitsDir).sort()) {
    const u = JSON.parse(fs.readFileSync(path.join(unitsDir, f), 'utf8'));
    for (const v of [...(u.vocab || []), ...(u.phrases || [])]) add(v.native);
    for (const g of u.grammar || []) for (const e of g.examples || []) add(e.native);
    for (const l of u.dialogue?.lines || []) add(l.native);
  }
  return [...out];
}

let codes = process.argv.slice(2);
if (!codes.length) codes = fs.readdirSync(DATA).filter((d) => fs.existsSync(path.join(DATA, d, 'units')));
const res = {};
for (const code of codes) res[code] = textsFor(code);
process.stdout.write(JSON.stringify(res));
