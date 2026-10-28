#!/usr/bin/env node
// Removes vocabulary a later unit repeats from an earlier one (and from that unit's lessons), so
// every word is taught once. Sentences may still use the word: it's known by then.
//   node scripts/dedupe.js <code> [...]
const fs = require('fs');
const path = require('path');
const { write } = require('./fmt.js');

for (const code of process.argv.slice(2)) {
  const dir = path.join(__dirname, '..', 'data', code, 'units');
  const files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort();
  const seen = new Map();
  for (const f of files) {
    const file = path.join(dir, f);
    const u = JSON.parse(fs.readFileSync(file, 'utf8'));
    const drop = new Set();
    for (const v of u.vocab || []) {
      const k = v.native.trim();
      if (seen.has(k)) drop.add(v.native);
      else seen.set(k, u.id);
    }
    if (!drop.size) continue;
    u.vocab = u.vocab.filter((v) => !drop.has(v.native));
    for (const ls of u.lessons || []) ls.new = (ls.new || []).filter((n) => !drop.has(n));
    write(file, u);
    console.log(`${code} unit ${u.id}: removed ${[...drop].join(', ')}`);
  }
}
